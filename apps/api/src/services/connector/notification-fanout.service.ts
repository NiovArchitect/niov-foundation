// FILE: notification-fanout.service.ts
// PURPOSE: Section 4 Wave 5 — the Section 2 (NotificationService) ↔
//          Section 4 (ConnectorProvider) seam. Looks up ConnectorBindings
//          for a freshly-created internal notification + invokes
//          matching providers directly (one attempt per binding;
//          fire-and-forget; per-attempt audit row).
// CONNECTS TO:
//   - apps/api/src/services/notification/notification.service.ts (the
//     Wave 11 internal-only NotificationService gains an OPTIONAL
//     connectorFanOut hook — preserves internal-only behavior when
//     no hook is wired)
//   - apps/api/src/services/connector/connector.service.ts (provider
//     factory)
//   - packages/database/src/queries/connector-binding.ts (binding
//     lookup)
//
// PRIVACY INVARIANT:
//   - Fan-out invocations carry notification_id + notification_class
//     + source_entity_id ONLY. NEVER body_summary, NEVER body_redacted,
//     NEVER recipient PII. External adapter consumers who need
//     payload content can fetch the Notification row via the
//     authenticated inbox surface; the fan-out signal is a metadata
//     ping, not a content delivery.
//   - Audit details carry binding_id + notification_id + outcome +
//     error_class (on failure). NEVER body content, NEVER
//     delivery_metadata (the response body envelope), NEVER secret
//     material.
//
// DESIGN POSTURE:
//   - Wave 5 does NOT route fan-out through the Action runtime. The
//     Action runtime's retry / cancellation guarantees are NOT
//     applied at the fan-out tier; fan-out is intentionally
//     best-effort + observable via audit chain. Operators who need
//     full Action-runtime guarantees submit INVOKE_CONNECTOR Actions
//     directly per Wave 3.
//   - Per-binding invocations are parallel (Promise.allSettled) so
//     one slow / failing provider does not block the others.
//   - Failure does NOT propagate to the caller of the
//     NotificationService — the notification was already persisted
//     successfully; fan-out is a downstream signal.

import type { ConnectorBinding } from "@prisma/client";
import {
  listConnectorBindingsForOrg,
  writeAuditEvent,
} from "@niov/database";
import {
  FixtureBasedConnectorProvider,
  getConnectorProviderAsync,
} from "./connector.service.js";
import type {
  ConnectorProvider,
  ConnectorType,
} from "./connector.service.js";
import { createActionForCaller } from "../action/action.service.js";

// WHAT: The minimum metadata the fan-out needs from a freshly-
//        created notification. Mirrors the SAFE projection at
//        notification.service.ts — body content is intentionally
//        absent.
// INPUT: Used as a parameter type.
// OUTPUT: None — type only.
// WHY: Wave 5 fan-out is a metadata ping, not content delivery.
//      External adapter consumers fetch content via the
//      authenticated inbox surface.
export interface NotificationFanOutInput {
  notification_id: string;
  notification_class: string;
  org_entity_id: string;
  source_entity_id: string;
}

// WHAT: The shape returned by dispatchNotificationFanOut so callers
//        (tests + future inbox-tier diagnostics) can inspect which
//        bindings fired + which dispatch mode each used.
// INPUT: Used as a return type.
// OUTPUT: None — type only.
// WHY: Fire-and-forget at the production caller level, but the
//      function returns a structured summary so tests can assert
//      the right bindings were matched + the right mode chosen
//      without scraping audit rows. Wave 7 adds the per-attempt
//      `mode` discriminator + the optional `action_id` set when
//      the action-routed variant succeeded in enqueueing the
//      INVOKE_CONNECTOR Action.
export interface NotificationFanOutResult {
  bindings_considered: number;
  bindings_matched: number;
  attempts: ReadonlyArray<{
    binding_id: string;
    connector_type: ConnectorType;
    mode: "direct" | "action";
    ok: boolean;
    error_class: string | null;
    // Set when mode="action" and the INVOKE_CONNECTOR Action was
    // accepted by the Action runtime (note: SUCCEEDED/FAILED is
    // determined later by the executor; this is just the
    // create-time enqueue ack).
    action_id?: string;
  }>;
}

// WHAT: Determine whether a binding's config.notification_classes
//        array matches a notification_class.
// INPUT: A ConnectorBinding + notification_class string.
// OUTPUT: boolean.
// WHY: Centralizes the JSON-config lookup logic. A binding opts
//      into fan-out by adding a `notification_classes` string array
//      to its config payload (Wave 2 admin route's `config` Json
//      column). Absent / non-array / empty array → no fan-out.
//      Wildcard "*" matches any class.
export function bindingMatchesNotificationClass(
  binding: ConnectorBinding,
  notification_class: string,
): boolean {
  const cfg = binding.config;
  if (cfg === null || typeof cfg !== "object" || Array.isArray(cfg)) {
    return false;
  }
  const raw = (cfg as Record<string, unknown>)["notification_classes"];
  if (!Array.isArray(raw)) return false;
  for (const item of raw) {
    if (typeof item !== "string") continue;
    if (item === "*" || item === notification_class) return true;
  }
  return false;
}

// WHAT: Resolve a binding's fan-out dispatch mode from its config.
// INPUT: A ConnectorBinding.
// OUTPUT: "direct" | "action".
// WHY: Wave 7 (Section 4 follow-on per Wave 5 closeout
//      "an Action-runtime-integrated fan-out variant is
//      forward-substrate"). Per-binding opt-in via
//      `config.fan_out_mode = "action"`; default "direct" preserves
//      the Wave 5 baseline behavior for every binding that doesn't
//      explicitly opt in. Any unrecognized value falls back to
//      "direct" — defensive default for forward-compatibility.
export function bindingFanOutMode(
  binding: ConnectorBinding,
): "direct" | "action" {
  const cfg = binding.config;
  if (cfg === null || typeof cfg !== "object" || Array.isArray(cfg)) {
    return "direct";
  }
  const raw = (cfg as Record<string, unknown>)["fan_out_mode"];
  if (raw === "action") return "action";
  return "direct";
}

// WHAT: Dispatch external fan-out for a freshly-created internal
//        Notification. Looks up matching enabled ConnectorBindings
//        for the source org, awaits provider invocation in
//        parallel, emits one ADMIN_ACTION:NOTIFICATION_FAN_OUT_*
//        audit row per attempt.
// INPUT: NotificationFanOutInput + optional providerOverride for tests.
// OUTPUT: Promise<NotificationFanOutResult>.
// WHY: Wave 5's substrate. Production NotificationService wires
//      this as its connectorFanOut hook so every successful
//      internal Notification triggers any matching external
//      adapter automatically. Internal-only Wave 11 behavior is
//      preserved when no binding exists or no binding opts in to
//      the notification_class.
export async function dispatchNotificationFanOut(
  input: NotificationFanOutInput,
  opts: { providerOverride?: ConnectorProvider } = {},
): Promise<NotificationFanOutResult> {
  // Step 1 — load org bindings (cap by enabled=true; deleted_at IS
  // NULL is enforced by the query helper).
  const all = await listConnectorBindingsForOrg(input.org_entity_id, {
    enabled: true,
  });
  // Step 2 — narrow to bindings opting into this notification_class.
  const matched = all.filter((b) =>
    bindingMatchesNotificationClass(b, input.notification_class),
  );
  // Step 3 — per-binding dispatch branches on bindingFanOutMode.
  // "direct" (Wave 5 baseline; default) → invoke provider directly
  // + emit ADMIN_ACTION:NOTIFICATION_FAN_OUT_DISPATCHED|FAILED.
  // "action" (Wave 7 opt-in) → enqueue an INVOKE_CONNECTOR Action
  // via createActionForCaller; the Action runtime then owns retry
  // + cancellation + the ACTION_* audit chain.
  const attempts = await Promise.all(
    matched.map(async (binding) => {
      const mode = bindingFanOutMode(binding);
      if (mode === "action") {
        return dispatchActionRouted(binding, input);
      }
      return dispatchDirect(binding, input, opts.providerOverride);
    }),
  );
  return {
    bindings_considered: all.length,
    bindings_matched: matched.length,
    attempts,
  };
}

// WHAT: The Wave 5 baseline direct-dispatch path, factored out so
//        the Wave 7 mode branch in dispatchNotificationFanOut stays
//        single-responsibility.
// INPUT: ConnectorBinding + NotificationFanOutInput + optional
//        providerOverride.
// OUTPUT: One attempt-summary entry.
// WHY: Preserves Wave 5 semantics verbatim (no behavior drift for
//      bindings without fan_out_mode set).
async function dispatchDirect(
  binding: ConnectorBinding,
  input: NotificationFanOutInput,
  providerOverride: ConnectorProvider | undefined,
): Promise<NotificationFanOutResult["attempts"][number]> {
  const provider =
    providerOverride ??
    (await getConnectorProviderAsync(binding.type as ConnectorType));
  const result = await provider.invoke({
    binding_id: binding.binding_id,
    type: binding.type as ConnectorType,
    config:
      binding.config !== null &&
      typeof binding.config === "object" &&
      !Array.isArray(binding.config)
        ? (binding.config as Record<string, unknown>)
        : {},
    secret_ref: binding.secret_ref,
    payload: {
      notification_id: input.notification_id,
      notification_class: input.notification_class,
    },
  });
  const action = result.ok
    ? "NOTIFICATION_FAN_OUT_DISPATCHED"
    : "NOTIFICATION_FAN_OUT_FAILED";
  await writeAuditEvent({
    event_type: "ADMIN_ACTION",
    // AuditOutcome enum at schema.prisma is { SUCCESS, DENIED,
    // ERROR }. Fan-out failures map to ERROR (a downstream
    // provider error, not a sovereignty / RULE 0 denial).
    outcome: result.ok ? "SUCCESS" : "ERROR",
    actor_entity_id: input.source_entity_id,
    target_entity_id: input.org_entity_id,
    details: {
      action,
      binding_id: binding.binding_id,
      connector_type: binding.type,
      notification_id: input.notification_id,
      notification_class: input.notification_class,
      mode: "direct",
      ...(result.ok ? {} : { error_class: result.error_class }),
    },
  });
  return {
    binding_id: binding.binding_id,
    connector_type: binding.type as ConnectorType,
    mode: "direct",
    ok: result.ok,
    error_class: result.ok ? null : result.error_class,
  };
}

// WHAT: The Wave 7 action-routed dispatch path. Creates an
//        INVOKE_CONNECTOR Action via createActionForCaller with
//        source_entity_id as the caller — the original entity that
//        triggered the SEND_INTERNAL_NOTIFICATION. The Action
//        runtime then takes over: policy evaluator decides
//        AUTO_APPROVE / DUAL_CONTROL per the org's INVOKE_CONNECTOR
//        ActionPolicy + autonomy_level + org_require_human_approval
//        + org_auto_approve_low_risk; admission tick promotes
//        SCHEDULED; executor tick runs the handler; ACTION_* audit
//        chain captures the lifecycle.
// INPUT: ConnectorBinding + NotificationFanOutInput.
// OUTPUT: One attempt-summary entry. ok=true means the Action was
//         accepted by the runtime (enqueued); actual provider
//         invoke + ACTION_SUCCEEDED|FAILED happens later when the
//         executor tick runs.
// WHY: Per Wave 5 closeout forward-substrate note: "an
//      Action-runtime-integrated fan-out variant gives retry +
//      cancellation guarantees at the cost of coupling." Wave 7
//      ships that variant as opt-in (per-binding
//      config.fan_out_mode = "action").
//
// SAFETY:
//   - source_entity_id is a real entity UUID, NOT the SCHEDULER
//     sentinel — preserves the Action model's @db.Uuid contract
//     + gives audit attribution to the entity that caused the
//     fan-out.
//   - target_entity_id is omitted (the Action's "subject" is a
//     binding, not an entity; the binding is identified in
//     payload_redacted).
//   - idempotency_key is deterministic per (notification_id,
//     binding_id) so a re-fire collapses to the prior Action.
//   - payload_redacted carries binding_id + invocation_payload
//     (notification_id + notification_class metadata-only ping);
//     never body content (preserves Wave 5 privacy invariant).
async function dispatchActionRouted(
  binding: ConnectorBinding,
  input: NotificationFanOutInput,
): Promise<NotificationFanOutResult["attempts"][number]> {
  const idempotency_key = `fanout:${input.notification_id}:${binding.binding_id}`;
  const result = await createActionForCaller(input.source_entity_id, {
    action_type: "INVOKE_CONNECTOR",
    idempotency_key,
    payload_summary: `connector_fanout:${binding.type}:${binding.binding_id.slice(0, 8)}`,
    payload_redacted: {
      binding_id: binding.binding_id,
      invocation_payload: {
        notification_id: input.notification_id,
        notification_class: input.notification_class,
      },
    },
  });
  if (result.ok === true) {
    await writeAuditEvent({
      event_type: "ADMIN_ACTION",
      outcome: "SUCCESS",
      actor_entity_id: input.source_entity_id,
      target_entity_id: input.org_entity_id,
      details: {
        action: "NOTIFICATION_FAN_OUT_ENQUEUED",
        binding_id: binding.binding_id,
        connector_type: binding.type,
        notification_id: input.notification_id,
        notification_class: input.notification_class,
        mode: "action",
        action_id: result.view.action_id,
      },
    });
    return {
      binding_id: binding.binding_id,
      connector_type: binding.type as ConnectorType,
      mode: "action",
      ok: true,
      error_class: null,
      action_id: result.view.action_id,
    };
  }
  // Action runtime refused the create (validation, policy denied,
  // idempotency collision, etc.). Emit a FAILED audit so operators
  // can monitor + diagnose.
  await writeAuditEvent({
    event_type: "ADMIN_ACTION",
    outcome: "ERROR",
    actor_entity_id: input.source_entity_id,
    target_entity_id: input.org_entity_id,
    details: {
      action: "NOTIFICATION_FAN_OUT_FAILED",
      binding_id: binding.binding_id,
      connector_type: binding.type,
      notification_id: input.notification_id,
      notification_class: input.notification_class,
      mode: "action",
      error_class: `ACTION_RUNTIME_${result.code}`,
    },
  });
  return {
    binding_id: binding.binding_id,
    connector_type: binding.type as ConnectorType,
    mode: "action",
    ok: false,
    error_class: `ACTION_RUNTIME_${result.code}`,
  };
}

// WHAT: Build a connectorFanOut hook function suitable for
//        injection into makeNotificationService at server boot.
// INPUT: Optional providerOverride for tests.
// OUTPUT: A callback compatible with the NotificationService
//         connectorFanOut hook signature.
// WHY: Wave 5 server boot wires
//      `makeNotificationService({ connectorFanOut: makeConnectorFanOutHook() })`.
//      Tests pass a FixtureBasedConnectorProvider override so CI
//      stays deterministic + no live outbound HTTP.
export function makeConnectorFanOutHook(
  opts: { providerOverride?: ConnectorProvider } = {},
): (input: NotificationFanOutInput) => Promise<void> {
  return async (input) => {
    // Production callers don't await the inner result; the
    // notification creation already committed. Errors inside the
    // dispatch (e.g. DB outage during binding lookup) are swallowed
    // here so the caller's Notification path is unaffected — we
    // never want a dependent connector substrate failure to undo a
    // committed Notification write. The per-attempt audit row +
    // operator monitoring are the observability surface for
    // dispatch failures.
    try {
      await dispatchNotificationFanOut(input, opts);
    } catch {
      // Intentionally swallowed — see WHY above. The dispatch
      // function itself emits per-attempt audit rows; a thrown
      // error here means the lookup or audit-write itself failed
      // (rare; operator dashboards will catch via the absence of
      // expected audit rows).
    }
  };
}

// Re-export FixtureBasedConnectorProvider so test files can import
// the canonical provider override from this module without circular
// imports.
export { FixtureBasedConnectorProvider };
