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
// continuation): non-RUNNING source-caller cancellation only at this
// slice. RUNNING → CANCELLED is forward-substrate on the break-glass
// substrate (ADR-0050) and is intentionally not implemented here.
// The state-machine permits the RUNNING → CANCELLED edge so a future
// privileged route can use it without state-machine changes.

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

// WHAT: RFC 4122 UUID regex (mirrors the create-time validator at
//        action.service.ts).
// INPUT: None.
// OUTPUT: A regular expression.
// WHY: Reject malformed action_id at the service boundary so the
//      route handler never has to.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  await writeAuditEvent(
    {
      event_type: "ACTION_CANCELLED",
      outcome: "SUCCESS",
      actor_entity_id: actorEntityId,
      details: {
        action_id: details.action_id,
        action_type: details.action_type,
        previous_status: String(details.previous_status),
        next_status: String(details.next_status),
        decision_reason: clampLifecycleField(details.decision_reason),
      },
    },
    tx,
  );
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
    return {
      ok: false,
      httpStatus: 403,
      code: "RUNNING_CANCEL_PRIVILEGED",
      message:
        "RUNNING actions require a privileged cancel path (break-glass); not supported by this route.",
      view: projectActionView(existing),
    };
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
