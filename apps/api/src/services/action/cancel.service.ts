// FILE: cancel.service.ts
// PURPOSE: The ADR-0057 §1 + §6 + §11 Action cancellation service.
//          Handles cancellation of non-RUNNING Action rows (PROPOSED,
//          APPROVED, SCHEDULED → CANCELLED) by the source caller.
//          RUNNING → CANCELLED is a privileged path that requires the
//          GOVSEC.5 break-glass substrate (ADR-0050; landed but not
//          wired here per scope-narrowing); this service returns
//          FORBIDDEN for that case rather than partially implementing
//          it.
// CONNECTS TO:
//   - apps/api/src/services/action/state-machine.ts (canTransition
//     guard via lifecycle.service.ts)
//   - apps/api/src/services/action/lifecycle.service.ts
//     (transitionActionStatus + the safe-allowlist emitter)
//   - apps/api/src/services/action/views.ts (SafeActionView for the
//     safe response projection)
//   - apps/api/src/routes/actions.routes.ts (the cancel route handler
//     consuming cancelActionForCaller)
//   - packages/database (prisma + Prisma types)
//   - ADR-0057 §6 (cancellation semantics)
//   - ADR-0057 §10 (SAFE-allowlist + ACTION_CANCELLED emission)
//   - ADR-0057 §11 (RUNNING → CANCELLED privileged; deferred)
//
// FOUNDER LOCK (per the [ADR-0057-CANCEL-ROUTE-EXECUTE-VERIFY-AUTH]
// continuation + Wave 2 [ADR-0057-RUNNING-CANCEL-BREAK-GLASS-
// EXECUTE-VERIFY-AUTH]): non-RUNNING cancellation is unconditional
// for the source entity. RUNNING → CANCELLED is privileged: the
// source entity must hold a valid GOVSEC.5 break-glass grant
// (ADR-0050) for action_type = "ACTION_RUNNING_CANCEL" within its
// valid_from..valid_until window. On successful RUNNING-cancel, the
// service marks the grant USED (emits BREAK_GLASS_USED + sets
// status=USED), emits ACTION_CANCELLED with grant_id back-reference,
// and fires the executor's abort-registry signal so any in-flight
// attempt short-circuits promptly rather than waiting for the
// per-attempt timeout. The state-machine permits the
// RUNNING → CANCELLED edge by construction.

import { prisma, writeAuditEvent, SYSTEM_PRINCIPALS } from "@niov/database";
import type { Action, Prisma } from "@prisma/client";
import { projectActionView, type SafeActionView } from "./views.js";
import {
  LIFECYCLE_FIELD_MAX_CHARS,
  clampLifecycleField,
} from "./lifecycle.service.js";
import {
  assertActionTransition,
  ActionInvalidTransitionError,
  isTerminalActionStatus,
} from "./state-machine.js";
import {
  markBreakGlassUsed,
  validateBreakGlassGrant,
} from "../governance/break-glass.service.js";
import { abortAction } from "./abort-registry.js";

// WHAT: RFC 4122 UUID regex (mirrors the create-time validator at
//        action.service.ts).
// INPUT: None.
// OUTPUT: A regular expression.
// WHY: Reject malformed action_id at the service boundary so the
//      route handler never has to.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// WHAT: Canonical action_type string the break-glass substrate uses
//        for the RUNNING-cancel privilege. ADR-0050 BreakGlassGrant
//        stores action_type as a free-form string; this constant
//        pins the literal so the cancel service + integration tests
//        + future Control Tower UI all agree on the same value.
// INPUT: None.
// OUTPUT: A literal string.
// WHY: Defense-in-depth against typos at call sites.
export const BREAK_GLASS_ACTION_TYPE_RUNNING_CANCEL =
  "ACTION_RUNNING_CANCEL" as const;

// WHAT: Optional body fields accepted by the cancel route.
// INPUT: Used as a parameter type.
// OUTPUT: None.
// WHY: ADR-0057 §6 + audit-friendliness: the caller may attach a
//      short reason that lands in the audit row's decision_reason
//      field. The reason is bounded by clampLifecycleField in the
//      emitter; if omitted, the audit row records
//      "cancelled_by_source".
export interface CancelActionInput {
  reason?: string;
}

// WHAT: Throw-safe structural validation of the cancel body.
// INPUT: Raw record body (or undefined / null).
// OUTPUT: { ok: true, normalized } | { ok: false, code, unknown_fields,
//          invalid_fields }.
// WHY: Mirrors validateCreateActionBody (UNKNOWN_FIELD / INVALID_FIELD)
//      so the route handler stays thin.
export function validateCancelActionBody(
  body: Record<string, unknown> | null | undefined,
):
  | { ok: true; normalized: CancelActionInput }
  | {
      ok: false;
      code: "UNKNOWN_FIELD" | "INVALID_FIELD";
      unknown_fields?: string[];
      invalid_fields?: string[];
    } {
  if (body === null || body === undefined) {
    return { ok: true, normalized: {} };
  }
  if (typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, code: "INVALID_FIELD", invalid_fields: ["body"] };
  }
  const allowed = new Set(["reason"]);
  const incomingKeys = Object.keys(body);
  const unknown = incomingKeys.filter((k) => !allowed.has(k));
  if (unknown.length > 0) {
    return { ok: false, code: "UNKNOWN_FIELD", unknown_fields: unknown };
  }
  const invalid: string[] = [];
  let reason: string | undefined;
  if (body.reason !== undefined) {
    if (typeof body.reason !== "string") {
      invalid.push("reason");
    } else if (body.reason.length > LIFECYCLE_FIELD_MAX_CHARS) {
      invalid.push("reason");
    } else {
      reason = body.reason;
    }
  }
  if (invalid.length > 0) {
    return { ok: false, code: "INVALID_FIELD", invalid_fields: invalid };
  }
  return {
    ok: true,
    normalized: reason !== undefined ? { reason } : {},
  };
}

// WHAT: Discriminated-union result returned by cancelActionForCaller.
// INPUT: Used as a return type.
// OUTPUT: None.
// WHY: Same shape family as createActionForCaller so the route
//      handler maps to HTTP status + safe JSON body uniformly.
export type CancelActionResult =
  | { ok: true; httpStatus: 200; view: SafeActionView }
  | {
      ok: false;
      httpStatus: 400 | 403 | 404 | 409;
      code: string;
      message?: string;
      view?: SafeActionView;
    };

// WHAT: The fully-formed audit details object emitted on cancel.
// INPUT: Used as a parameter type.
// OUTPUT: None.
// WHY: Locked at the type level so the emitter cannot add a forbidden
//      field (raw payload, raw envelope, stack trace) by accident.
interface CancelAuditDetails {
  action_id: string;
  action_type: string;
  previous_status: Action["status"];
  next_status: "CANCELLED";
  decision_reason: string;
  // Set only on RUNNING-cancel via break-glass; absent otherwise.
  // Forensic back-reference to the GOVSEC.5 grant that authorized
  // the privileged transition.
  grant_id?: string;
}

// WHAT: Emit ACTION_CANCELLED with safe-allowlisted details under
//        the actor's chain (the caller IS the source entity, so the
//        actor_entity_id chain is the natural attribution; we do NOT
//        use SYSTEM_PRINCIPALS.SCHEDULER here because the cancellation
//        is initiated by the human/AI source, not by a scheduled
//        process).
// INPUT: A transaction client + the typed details.
// OUTPUT: A Promise<void>.
// WHY: One emitter for the cancel path so future edits stay in
//      lock-step.
async function emitCancelAudit(
  tx: Prisma.TransactionClient,
  actorEntityId: string,
  details: CancelAuditDetails,
): Promise<void> {
  const auditDetails: Record<string, unknown> = {
    action_id: details.action_id,
    action_type: details.action_type,
    previous_status: String(details.previous_status),
    next_status: String(details.next_status),
    decision_reason: clampLifecycleField(details.decision_reason),
  };
  if (details.grant_id !== undefined) {
    auditDetails.grant_id = details.grant_id;
  }
  await writeAuditEvent(
    {
      event_type: "ACTION_CANCELLED",
      outcome: "SUCCESS",
      actor_entity_id: actorEntityId,
      details: auditDetails,
    },
    tx,
  );
}

// WHAT: Privileged RUNNING-cancel helper. Called only from the
//        cancelActionForCaller flow after a valid break-glass grant
//        has been validated AND marked USED. Transitions
//        RUNNING → CANCELLED in a transaction, emits ACTION_CANCELLED
//        with grant_id back-reference, fires the executor's abort
//        signal so any in-flight attempt short-circuits.
// INPUT: callerEntityId + actionId + the loaded Action row + the
//         consumed grant_id + optional reason.
// OUTPUT: A CancelActionResult — 200 on success; 409 on concurrent
//         state-machine drift.
// WHY: Separated from the main cancel flow because RUNNING-cancel
//      has additional steps (grant back-reference in audit details,
//      AbortSignal firing) that the non-RUNNING path doesn't need.
async function cancelRunningWithGrant(
  callerEntityId: string,
  actionId: string,
  loaded: Action,
  grantId: string,
  reasonOpt: string | undefined,
): Promise<CancelActionResult> {
  const reasonRaw = reasonOpt ?? "running_cancel_via_break_glass";
  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.action.findUnique({
      where: { action_id: actionId },
    });
    if (current === null) {
      return {
        ok: false as const,
        httpStatus: 404 as const,
        code: "ACTION_NOT_FOUND",
      };
    }
    if (current.status !== "RUNNING") {
      // Concurrent terminalization (executor's success/failure path
      // landed between our load and our update). Return 409 with
      // the latest safe view so the caller can decide what to do.
      return {
        ok: false as const,
        httpStatus: 409 as const,
        code: "ACTION_ALREADY_TERMINAL",
        message:
          "Action transitioned to terminal state in a concurrent flow.",
        view: projectActionView(current),
      };
    }
    try {
      assertActionTransition(current.status, "CANCELLED");
    } catch (err) {
      if (err instanceof ActionInvalidTransitionError) {
        return {
          ok: false as const,
          httpStatus: 409 as const,
          code: "ACTION_INVALID_TRANSITION",
          view: projectActionView(current),
        };
      }
      throw err;
    }
    const updated = await tx.action.update({
      where: { action_id: actionId },
      data: { status: "CANCELLED" },
    });
    await emitCancelAudit(tx, callerEntityId, {
      action_id: updated.action_id,
      action_type: String(updated.action_type),
      previous_status: current.status,
      next_status: "CANCELLED",
      decision_reason: reasonRaw,
      grant_id: grantId,
    });
    return {
      ok: true as const,
      httpStatus: 200 as const,
      view: projectActionView(updated, "running_cancel_via_break_glass"),
    };
  });
  // Fire the abort signal outside the transaction so any handler
  // listener sees it after the state-machine has committed. The
  // executor's attempt loop will observe status != RUNNING on its
  // next re-check and skip terminalization of the parent (the
  // parent is already CANCELLED).
  if (result.ok === true) {
    abortAction(actionId, "ACTION_CANCELLED_VIA_BREAK_GLASS");
  }
  // Suppress unused-import warning (loaded is the pre-tx snapshot;
  // we re-read inside the tx).
  void loaded;
  return result;
}

// WHAT: Cancel an Action row owned by the caller.
// INPUT: callerEntityId (from request.auth!.entity_id) + action_id +
//        a validated CancelActionInput.
// OUTPUT: A CancelActionResult — discriminated so the route maps to
//         200 / 400 / 403 / 404 / 409.
// WHY: Centralized cancel-time service per ADR-0057 §6. Step-wise:
//      1. Validate action_id shape (400 INVALID_ACTION_ID).
//      2. Load Action by id (404 ACTION_NOT_FOUND).
//      3. Verify ownership: action.source_entity_id === callerEntityId
//         (403 NOT_ACTION_OWNER). Per RULE 0 sovereignty + ADR-0057
//         §6 + ADR-0057 §10 forbidden-fields list, the response on
//         403 must NOT echo any forbidden field; only the bare code.
//      4. RUNNING → CANCELLED is privileged (ADR-0057 §6 + §11);
//         this slice returns 403 RUNNING_CANCEL_PRIVILEGED. Forward-
//         substrate: a privileged route + break-glass grant per
//         ADR-0050.
//      5. Terminal state → 409 ACTION_ALREADY_TERMINAL (the row is
//         already CANCELLED / SUCCEEDED / FAILED / TIMED_OUT /
//         REJECTED / EXPIRED). Idempotent CANCELLED replay returns
//         200 with the existing safe view per ADR-0057 §11
//         idempotency semantics for terminal states.
//      6. Otherwise (PROPOSED / APPROVED / SCHEDULED) transition to
//         CANCELLED, emit ACTION_CANCELLED with safe details, return
//         200 + safe view.
export async function cancelActionForCaller(
  callerEntityId: string,
  actionId: string,
  input: CancelActionInput = {},
): Promise<CancelActionResult> {
  if (typeof actionId !== "string" || !UUID_RE.test(actionId)) {
    return {
      ok: false,
      httpStatus: 400,
      code: "INVALID_ACTION_ID",
    };
  }

  const existing = await prisma.action.findUnique({
    where: { action_id: actionId },
  });
  if (existing === null) {
    return { ok: false, httpStatus: 404, code: "ACTION_NOT_FOUND" };
  }
  // RULE 0 + ADR-0057 §10: the response on cross-caller 403 MUST NOT
  // echo any field of the row (not even the existing status), so the
  // payload reduces to { ok:false, code }.
  if (existing.source_entity_id !== callerEntityId) {
    return { ok: false, httpStatus: 403, code: "NOT_ACTION_OWNER" };
  }
  if (existing.status === "RUNNING") {
    // [ADR-0057-RUNNING-CANCEL-BREAK-GLASS] Wave 2: privileged path.
    // The source entity may cancel a RUNNING action only when they
    // hold an ACTIVE GOVSEC.5 break-glass grant (ADR-0050) for
    // action_type = "ACTION_RUNNING_CANCEL" within its
    // valid_from..valid_until window. validateBreakGlassGrant
    // already enforces ACTIVE + window + source + action_type
    // match.
    const grant = await validateBreakGlassGrant(
      callerEntityId,
      BREAK_GLASS_ACTION_TYPE_RUNNING_CANCEL,
    );
    if (grant === null) {
      return {
        ok: false,
        httpStatus: 403,
        code: "RUNNING_CANCEL_PRIVILEGED",
        message:
          "RUNNING actions require an ACTIVE break-glass grant (ACTION_RUNNING_CANCEL) for the caller.",
        view: projectActionView(existing),
      };
    }
    // Grant exists. Mark it USED (emits BREAK_GLASS_USED in the same
    // tx) BEFORE transitioning the Action so the audit chain captures
    // the grant consumption first. markBreakGlassUsed throws on
    // race (grant already USED / EXPIRED) — translate that to a
    // clean 409 envelope rather than a 500.
    try {
      await markBreakGlassUsed(grant.grant_id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg === "BREAK_GLASS_NOT_FOUND" ||
        msg === "BREAK_GLASS_INVALID_TRANSITION"
      ) {
        return {
          ok: false,
          httpStatus: 409,
          code: "BREAK_GLASS_INVALID_TRANSITION",
          message:
            "Break-glass grant was consumed or expired in a concurrent flow.",
          view: projectActionView(existing),
        };
      }
      throw err;
    }
    return cancelRunningWithGrant(
      callerEntityId,
      actionId,
      existing,
      grant.grant_id,
      input.reason,
    );
  }
  if (existing.status === "CANCELLED") {
    // Idempotent replay: the row is already cancelled. Return 200
    // with the existing safe view (no second audit emission).
    return {
      ok: true,
      httpStatus: 200,
      view: projectActionView(existing, "already_cancelled"),
    };
  }
  if (isTerminalActionStatus(existing.status)) {
    return {
      ok: false,
      httpStatus: 409,
      code: "ACTION_ALREADY_TERMINAL",
      view: projectActionView(existing),
    };
  }

  const reasonRaw = input.reason ?? "cancelled_by_source";

  return prisma.$transaction(async (tx) => {
    // Re-read the row inside the transaction so a concurrent executor
    // tick that flipped SCHEDULED → RUNNING between our load and our
    // update is caught here rather than crashing on the state-machine
    // guard (which would also be safe, but we'd rather translate to
    // a clean 409 envelope).
    const current = await tx.action.findUnique({
      where: { action_id: actionId },
    });
    if (current === null) {
      return {
        ok: false as const,
        httpStatus: 404 as const,
        code: "ACTION_NOT_FOUND",
      };
    }
    if (current.status === "RUNNING") {
      return {
        ok: false as const,
        httpStatus: 409 as const,
        code: "RUNNING_CANCEL_PRIVILEGED",
        message:
          "Action transitioned to RUNNING; cancellation requires a privileged path.",
        view: projectActionView(current),
      };
    }
    if (current.status === "CANCELLED") {
      return {
        ok: true as const,
        httpStatus: 200 as const,
        view: projectActionView(current, "already_cancelled"),
      };
    }
    if (isTerminalActionStatus(current.status)) {
      return {
        ok: false as const,
        httpStatus: 409 as const,
        code: "ACTION_ALREADY_TERMINAL",
        view: projectActionView(current),
      };
    }

    try {
      assertActionTransition(current.status, "CANCELLED");
    } catch (err) {
      if (err instanceof ActionInvalidTransitionError) {
        return {
          ok: false as const,
          httpStatus: 409 as const,
          code: "ACTION_INVALID_TRANSITION",
          view: projectActionView(current),
        };
      }
      throw err;
    }

    const updated = await tx.action.update({
      where: { action_id: actionId },
      data: { status: "CANCELLED" },
    });
    await emitCancelAudit(tx, callerEntityId, {
      action_id: updated.action_id,
      action_type: String(updated.action_type),
      previous_status: current.status,
      next_status: "CANCELLED",
      decision_reason: reasonRaw,
    });
    return {
      ok: true as const,
      httpStatus: 200 as const,
      view: projectActionView(updated),
    };
  });
}

// Re-export SYSTEM_PRINCIPALS reference so the audit chain attribution
// is grep-discoverable from this module. Cancel emits under the actor
// chain (NOT the SCHEDULER chain), so this constant is intentionally
// unused at runtime but kept in scope for substrate-honest grep.
void SYSTEM_PRINCIPALS;
