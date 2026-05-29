// FILE: lifecycle.service.ts
// PURPOSE: Shared lifecycle helpers for the ADR-0057 §1 + §10 + §11
//          Action runtime. Wraps the assert-transition guard, the
//          Prisma row update, and the safe-allowlist audit emission
//          into one composable per-edge helper so the scheduler /
//          executor / expiry sweep all stay in lock-step on the audit
//          contract. Pure transaction-composable; never opens its own
//          outer prisma.$transaction (the caller does).
// CONNECTS TO:
//   - apps/api/src/services/action/state-machine.ts (the transition
//     guard called before every update)
//   - apps/api/src/services/action/scheduler.ts (APPROVED → SCHEDULED
//     + SCHEDULED → EXPIRED helpers)
//   - apps/api/src/services/action/executor.ts (SCHEDULED → RUNNING +
//     RUNNING → terminal helpers + ActionAttempt / ActionResult create)
//   - packages/database (writeAuditEvent, SYSTEM_PRINCIPALS, Prisma
//     types)
//   - ADR-0057 §10 (SAFE-allowlist + FORBIDDEN-fields)
//   - ADR-0057 §11 (idempotency / retries / timeout / cancellation)
//
// FOUNDER LOCKS (per [ADR-0057-EXECUTOR-WORKER-SCHEDULER-EXECUTE-VERIFY-
//                AUTH-WITH-GAP-LOCKS]):
//   - LOCK-GAP-1 (retry budget): service-tier constant retry budgets.
//     RECORD_CAPSULE = 3, SEND_INTERNAL_NOTIFICATION = 3,
//     PROPOSE_PERMISSION_GRANT = 1. Forward-substrate to make
//     ActionPolicy.retry_budget a schema field in a later QLOCK.
//   - LOCK-GAP-2 (per-attempt timeout): service-tier constant
//     ATTEMPT_TIMEOUT_MS_DEFAULT = 30_000. Forward-substrate to make
//     ActionAttempt.timeout_ms a schema field in a later QLOCK.
//   - LOCK-GAP-4 (cancel route): no ACTION_CANCELLED emitter is exposed
//     from this module. The state-machine permits the
//     PROPOSED/APPROVED/SCHEDULED → CANCELLED edge for future use; no
//     helper here drives it.

import {
  SYSTEM_PRINCIPALS,
  writeAuditEvent,
  type SystemPrincipal,
} from "@niov/database";
import type {
  Action,
  ActionAttempt,
  ActionAttemptOutcome,
  ActionStatus,
  ActionType,
  Prisma,
} from "@prisma/client";
import { assertActionTransition } from "./state-machine.js";

// WHAT: The 5 lifecycle audit literals this module emits per ADR-0057
//        §10. ACTION_CANCELLED is intentionally absent (LOCK-GAP-4).
//        ACTION_PROPOSED / ACTION_APPROVED / ACTION_REJECTED stay in
//        action.service.ts (the create-time module).
// INPUT: Used as a value namespace.
// OUTPUT: None.
// WHY: One enum-shaped union so the emitter helper rejects unknown
//      literals at compile time.
export type ActionLifecycleAuditEventType =
  | "ACTION_SCHEDULED"
  | "ACTION_STARTED"
  | "ACTION_SUCCEEDED"
  | "ACTION_FAILED"
  | "ACTION_EXPIRED";

// WHAT: The per-ActionType retry budget (LOCK-GAP-1).
// INPUT: None.
// OUTPUT: A frozen number per ActionType.
// WHY: Service-tier constants intentionally; the schema is not amended
//      in this slice. The number is the TOTAL number of attempts the
//      executor will perform before terminalizing to FAILED, not the
//      number of retries after the first attempt (so RECORD_CAPSULE=3
//      means up to 3 attempts; the first attempt counts).
export const RETRY_BUDGET: Readonly<Record<ActionType, number>> =
  Object.freeze({
    RECORD_CAPSULE: 3,
    SEND_INTERNAL_NOTIFICATION: 3,
    PROPOSE_PERMISSION_GRANT: 1,
  } as const);

// WHAT: The per-attempt timeout default (LOCK-GAP-2).
// INPUT: None.
// OUTPUT: A frozen number of milliseconds.
// WHY: Service-tier constant; ActionAttempt.timeout_ms is not added to
//      the schema in this slice. 30 seconds matches the ADR-0057 §11
//      "per-attempt timeout" rationale (long enough for a real
//      connector-class handler when one lands, short enough that a
//      runaway stub fails fast in tests).
export const ATTEMPT_TIMEOUT_MS_DEFAULT = 30_000;

// WHAT: The system-principal attribution used when the lifecycle
//        helper emits an audit row outside an actor session (every
//        ACTION_SCHEDULED / _STARTED / _SUCCEEDED / _FAILED / _EXPIRED
//        is system-initiated; there is no human actor on these edges).
// INPUT: None.
// OUTPUT: A SystemPrincipal sentinel.
// WHY: One named constant so every emitter joins the same SCHEDULER
//      chain. NIST 800-53 AU-2 calls out scheduled-process audit
//      coverage; reusing SCHEDULER (over inventing a new principal)
//      keeps the chain count stable and matches the feedback loops'
//      precedent.
const LIFECYCLE_PRINCIPAL: SystemPrincipal = SYSTEM_PRINCIPALS.SCHEDULER;

// WHAT: The SAFE-allowlist details object the lifecycle audit emitter
//        writes. Every field here is enum-bound, identifier-shaped, or
//        a bounded string; nothing here is payload-derived.
// INPUT: Used as a parameter type.
// OUTPUT: None.
// WHY: Closes the audit contract at the type level so the executor /
//      scheduler / expiry sweep cannot add a forbidden field (raw
//      payload, raw envelope, stack trace, secret) by accident — the
//      type doesn't accept it.
export interface LifecycleAuditDetails {
  action_id: string;
  action_type: string;
  previous_status: ActionStatus;
  next_status: ActionStatus;
  attempt_id?: string;
  attempt_number?: number;
  worker_id?: string;
  decision_reason?: string;
  error_class?: string;
  // Bounded summary suitable for an audit row; the executor truncates
  // before passing in so this field never carries a full stack trace
  // or raw upstream message.
  error_summary?: string;
}

// WHAT: The maximum length the executor / scheduler / expiry sweep
//        will let any error_summary or decision_reason field reach
//        before truncation.
// INPUT: None.
// OUTPUT: The number 200.
// WHY: Audit rows must be bounded so a runaway upstream error message
//      cannot inflate the chain row. The lifecycle emitter clamps
//      before writing; callers can also clamp earlier.
export const LIFECYCLE_FIELD_MAX_CHARS = 200;

// WHAT: Clamp a string to LIFECYCLE_FIELD_MAX_CHARS without breaking
//        an enum-bound value (caller is responsible for keeping
//        error_class short by construction).
// INPUT: A possibly-long string.
// OUTPUT: A string of length <= LIFECYCLE_FIELD_MAX_CHARS.
// WHY: Centralized so every emit path uses the same bound.
export function clampLifecycleField(value: string): string {
  if (value.length <= LIFECYCLE_FIELD_MAX_CHARS) return value;
  return value.slice(0, LIFECYCLE_FIELD_MAX_CHARS);
}

// WHAT: Build the SAFE details object from a typed input, clamping
//        long string fields and dropping undefined optionals.
// INPUT: A LifecycleAuditDetails shape.
// OUTPUT: A Record<string, unknown> safe for writeAuditEvent.details.
// WHY: writeAuditEvent.details is Record<string, unknown>; this helper
//      narrows back to the typed shape on the caller side and
//      enforces the clamp / drop-undefined invariants in one place.
function buildSafeDetails(input: LifecycleAuditDetails): Record<string, unknown> {
  const out: Record<string, unknown> = {
    action_id: input.action_id,
    action_type: input.action_type,
    previous_status: String(input.previous_status),
    next_status: String(input.next_status),
  };
  if (input.attempt_id !== undefined) out.attempt_id = input.attempt_id;
  if (input.attempt_number !== undefined) {
    out.attempt_number = input.attempt_number;
  }
  if (input.worker_id !== undefined) out.worker_id = input.worker_id;
  if (input.decision_reason !== undefined) {
    out.decision_reason = clampLifecycleField(input.decision_reason);
  }
  if (input.error_class !== undefined) out.error_class = input.error_class;
  if (input.error_summary !== undefined) {
    out.error_summary = clampLifecycleField(input.error_summary);
  }
  return out;
}

// WHAT: Emit one lifecycle audit row under the SCHEDULER system
//        principal with a SAFE-allowlisted details object.
// INPUT: A transaction client + the event_type + the typed details +
//        the outcome (SUCCESS for SCHEDULED / STARTED / SUCCEEDED /
//        EXPIRED; ERROR for FAILED).
// OUTPUT: A Promise<void>.
// WHY: One emitter so the scheduler / executor / expiry sweep all
//      compose the same audit shape. The transaction client is the
//      one returned by prisma.$transaction so the audit row commits
//      atomically with the Action row update.
export async function emitLifecycleAudit(
  tx: Prisma.TransactionClient,
  args: {
    event_type: ActionLifecycleAuditEventType;
    outcome: "SUCCESS" | "ERROR";
    details: LifecycleAuditDetails;
  },
): Promise<void> {
  await writeAuditEvent(
    {
      event_type: args.event_type,
      outcome: args.outcome,
      actor_entity_id: null,
      system_principal: LIFECYCLE_PRINCIPAL,
      details: buildSafeDetails(args.details),
    },
    tx,
  );
}

// WHAT: Perform a guarded ActionStatus transition + safe audit emit
//        inside an existing transaction.
// INPUT: A transaction client + the Action row (for action_id +
//        action_type + the current status assertion) + the target
//        status + the audit event_type + optional extra audit details.
// OUTPUT: The updated Action row.
// WHY: Centralizes the assert→update→audit dance so callers can write
//      `await transitionActionStatus(tx, action, "SCHEDULED",
//      "ACTION_SCHEDULED", {...})` and not re-derive the audit details
//      shape every call site.
export async function transitionActionStatus(
  tx: Prisma.TransactionClient,
  args: {
    action: Pick<Action, "action_id" | "action_type" | "status">;
    nextStatus: ActionStatus;
    eventType: ActionLifecycleAuditEventType;
    outcome: "SUCCESS" | "ERROR";
    extraDetails?: Omit<
      LifecycleAuditDetails,
      "action_id" | "action_type" | "previous_status" | "next_status"
    >;
  },
): Promise<Action> {
  assertActionTransition(args.action.status, args.nextStatus);
  const updated = await tx.action.update({
    where: { action_id: args.action.action_id },
    data: { status: args.nextStatus },
  });
  await emitLifecycleAudit(tx, {
    event_type: args.eventType,
    outcome: args.outcome,
    details: {
      action_id: updated.action_id,
      action_type: String(updated.action_type),
      previous_status: args.action.status,
      next_status: updated.status,
      ...(args.extraDetails ?? {}),
    },
  });
  return updated;
}

// WHAT: The shape returned by createActionAttempt for downstream use.
// INPUT: Used as a return type.
// OUTPUT: None.
// WHY: The executor uses attempt_id + attempt_number to seed the
//      audit emissions on the rest of the attempt; bundling the
//      caller-visible subset here is clearer than the bare Prisma
//      shape.
export interface CreatedActionAttempt {
  attempt_id: string;
  attempt_number: number;
  started_at: Date;
}

// WHAT: Create a new ActionAttempt row inside an existing transaction.
//        attempt_number = max(existing) + 1 (1-based).
// INPUT: A transaction client + the Action.action_id + the worker_id.
// OUTPUT: A Promise<CreatedActionAttempt>.
// WHY: One creator so the executor + any future retry helper share the
//      same numbering convention.
export async function createActionAttempt(
  tx: Prisma.TransactionClient,
  args: { action_id: string; worker_id: string },
): Promise<CreatedActionAttempt> {
  const aggregate = await tx.actionAttempt.aggregate({
    where: { action_id: args.action_id, deleted_at: null },
    _max: { attempt_number: true },
  });
  const nextNumber = (aggregate._max.attempt_number ?? 0) + 1;
  const row = await tx.actionAttempt.create({
    data: {
      action_id: args.action_id,
      attempt_number: nextNumber,
      worker_id: args.worker_id,
    },
    select: { attempt_id: true, attempt_number: true, started_at: true },
  });
  return row;
}

// WHAT: Terminalize a still-open ActionAttempt (ended_at + outcome +
//        error_class + error_summary).
// INPUT: A transaction client + the attempt_id + the terminal outcome
//        + optional error_class + optional error_summary.
// OUTPUT: The updated ActionAttempt row.
// WHY: The error_class / error_summary are bounded by clampLifecycleField
//      to avoid runaway upstream-error blow-up.
export async function terminalizeActionAttempt(
  tx: Prisma.TransactionClient,
  args: {
    attempt_id: string;
    outcome: ActionAttemptOutcome;
    error_class?: string;
    error_summary?: string;
    now?: Date;
  },
): Promise<ActionAttempt> {
  const data: Prisma.ActionAttemptUpdateInput = {
    ended_at: args.now ?? new Date(),
    outcome: args.outcome,
  };
  if (args.error_class !== undefined) data.error_class = args.error_class;
  if (args.error_summary !== undefined) {
    data.error_summary = clampLifecycleField(args.error_summary);
  }
  return tx.actionAttempt.update({
    where: { attempt_id: args.attempt_id },
    data,
  });
}

// WHAT: Create one ActionResult row tied to an attempt with the SAFE
//        handler-result metadata.
// INPUT: A transaction client + the attempt_id + result_summary +
//        result_metadata.
// OUTPUT: The created ActionResult row.
// WHY: The handler returns the SAFE shape directly; the executor calls
//      this helper to persist it. The metadata is a JSON column; the
//      handler contract already excludes payload / envelope / raw
//      errors so the persisted shape stays inside the audit
//      allowlist by construction.
export async function createActionResult(
  tx: Prisma.TransactionClient,
  args: {
    attempt_id: string;
    result_summary: string;
    result_metadata: Record<string, unknown>;
  },
): Promise<{ result_id: string }> {
  return tx.actionResult.create({
    data: {
      attempt_id: args.attempt_id,
      result_summary: clampLifecycleField(args.result_summary),
      result_metadata: args.result_metadata as Prisma.InputJsonValue,
    },
    select: { result_id: true },
  });
}
