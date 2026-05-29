// FILE: state-machine.ts
// PURPOSE: Pure transition guard for the ADR-0057 §1 Action lifecycle
//          state machine. No DB, no I/O, no audit. The guard knows the
//          legal transitions and the terminal states; callers (the
//          lifecycle.service.ts transition helpers, the scheduler, the
//          executor, the expiry sweep) verify before they write.
// CONNECTS TO:
//   - apps/api/src/services/action/lifecycle.service.ts (every status
//     update calls assertActionTransition before the Prisma update)
//   - apps/api/src/services/action/scheduler.ts (APPROVED → SCHEDULED
//     + SCHEDULED → EXPIRED transitions)
//   - apps/api/src/services/action/executor.ts (SCHEDULED → RUNNING +
//     RUNNING → terminal transitions)
//   - packages/database/prisma/schema.prisma (ActionStatus enum)
//   - ADR-0057 §1 (the state-machine diagram + terminal-states list)
//
// FOUNDER LOCKS (per [ADR-0057-EXECUTOR-WORKER-SCHEDULER-EXECUTE-VERIFY-
//                AUTH-WITH-GAP-LOCKS]):
//   - LOCK-GAP-4 (cancel route): RUNNING → CANCELLED is intentionally
//     NOT exposed by this slice. The transition is whitelisted in the
//     legal-edges map for future use, but the worker never emits it
//     and no route consumes it; only PROPOSED/APPROVED/SCHEDULED →
//     CANCELLED are reachable at this slice (cancel route itself is
//     deferred to a separate QLOCK, so no caller drives these edges
//     today either).
//   - Retries happen WITHIN the RUNNING state: ADR-0057 §11 states the
//     parent Action "stays in RUNNING until terminal", so the executor
//     creates additional ActionAttempt rows under the same RUNNING
//     parent rather than flipping the parent back to SCHEDULED. The
//     state-machine does NOT permit RUNNING → SCHEDULED; the executor
//     loops in-tick across the retry budget.

import type { ActionStatus } from "@prisma/client";

// WHAT: The 6 canonical terminal ActionStatus values per ADR-0057 §1.
// INPUT: None.
// OUTPUT: A frozen Set of terminal status strings.
// WHY: A terminal Action row is "immutable except audit append" per
//      ADR-0057 §1 + §11. Centralizing the set means the guard, the
//      lifecycle helpers, and any future read-side filter share one
//      source of truth.
const TERMINAL_ACTION_STATUSES: ReadonlySet<ActionStatus> = new Set<
  ActionStatus
>([
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
  "TIMED_OUT",
  "REJECTED",
  "EXPIRED",
]);

// WHAT: The canonical legal-edges map for the ADR-0057 §1 state machine.
// INPUT: None.
// OUTPUT: A frozen map from current status → frozen set of next statuses.
// WHY: Every edge here corresponds to a concrete operation: the create-
//      time evaluator (PROPOSED → APPROVED / REJECTED), the dual-control
//      grant (PROPOSED → APPROVED), the future cancel route
//      (PROPOSED / APPROVED / SCHEDULED → CANCELLED), the scheduler tick
//      (APPROVED → SCHEDULED), the expiry sweep (SCHEDULED → EXPIRED),
//      the executor claim (SCHEDULED → RUNNING), the executor retry
//      (RUNNING → SCHEDULED), and the executor terminal (RUNNING →
//      SUCCEEDED / FAILED / TIMED_OUT / CANCELLED). The diagram in
//      ADR-0057 §1 is the source of truth; this constant is the
//      machine-readable version.
const LEGAL_TRANSITIONS: ReadonlyMap<
  ActionStatus,
  ReadonlySet<ActionStatus>
> = new Map<ActionStatus, ReadonlySet<ActionStatus>>([
  [
    "PROPOSED",
    new Set<ActionStatus>(["APPROVED", "REJECTED", "CANCELLED"]),
  ],
  ["APPROVED", new Set<ActionStatus>(["SCHEDULED", "CANCELLED"])],
  [
    "SCHEDULED",
    new Set<ActionStatus>(["RUNNING", "EXPIRED", "CANCELLED"]),
  ],
  [
    "RUNNING",
    new Set<ActionStatus>(["SUCCEEDED", "FAILED", "TIMED_OUT", "CANCELLED"]),
  ],
]);

// WHAT: Safe error code thrown when assertActionTransition rejects a
//        transition.
// INPUT: None.
// OUTPUT: A literal string.
// WHY: Audit and route handlers consume this code; never inline the
//      string at call sites so a future rename is a single edit.
export const ACTION_INVALID_TRANSITION = "ACTION_INVALID_TRANSITION" as const;

// WHAT: The Error subclass thrown by assertActionTransition.
// INPUT: from + to statuses.
// OUTPUT: An Error whose .name is ACTION_INVALID_TRANSITION and whose
//         .message names the rejected edge.
// WHY: Callers that need to translate the throw into a safe service-tier
//      failure (the executor catches it and writes ACTION_FAILED with
//      error_class = "INVALID_TRANSITION") can `instanceof` against this
//      class rather than string-matching the message.
export class ActionInvalidTransitionError extends Error {
  public readonly from: ActionStatus;
  public readonly to: ActionStatus;
  constructor(from: ActionStatus, to: ActionStatus) {
    super(`Illegal Action transition: ${from} -> ${to}`);
    this.name = ACTION_INVALID_TRANSITION;
    this.from = from;
    this.to = to;
  }
}

// WHAT: Return true if the named status is one of the 6 ADR-0057 §1
//        terminal statuses.
// INPUT: An ActionStatus value.
// OUTPUT: A boolean.
// WHY: The executor + scheduler use this to short-circuit before they
//      attempt an update on a row another worker has already
//      terminalized (race-safe defense-in-depth above the SKIP LOCKED
//      claim).
export function isTerminalActionStatus(status: ActionStatus): boolean {
  return TERMINAL_ACTION_STATUSES.has(status);
}

// WHAT: Return true if the (from, to) edge is in the canonical legal-
//        edges map.
// INPUT: from + to ActionStatus values.
// OUTPUT: A boolean.
// WHY: Pure predicate variant for callers that want a boolean test
//      without the throw (e.g. integration tests inspecting all 100
//      pairs to assert the legal/illegal partition).
export function canTransitionAction(
  from: ActionStatus,
  to: ActionStatus,
): boolean {
  if (TERMINAL_ACTION_STATUSES.has(from)) return false;
  const next = LEGAL_TRANSITIONS.get(from);
  if (next === undefined) return false;
  return next.has(to);
}

// WHAT: Throw ActionInvalidTransitionError when the (from, to) edge is
//        not in the canonical legal-edges map.
// INPUT: from + to ActionStatus values.
// OUTPUT: void on legal; throws on illegal.
// WHY: Every status update in lifecycle.service.ts calls this guard
//      before the Prisma `prisma.action.update(...)`. The guard is
//      pure (no DB, no audit) so it composes inside the outer
//      transaction without surprises and runs in unit tests without a
//      database.
export function assertActionTransition(
  from: ActionStatus,
  to: ActionStatus,
): void {
  if (!canTransitionAction(from, to)) {
    throw new ActionInvalidTransitionError(from, to);
  }
}
