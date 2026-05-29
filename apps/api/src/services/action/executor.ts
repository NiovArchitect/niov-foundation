// FILE: executor.ts
// PURPOSE: The ADR-0057 §1 + §11 worker tick. Claims SCHEDULED Action
//          rows via Postgres-native row-level locking (FOR UPDATE SKIP
//          LOCKED), transitions each one through SCHEDULED → RUNNING,
//          creates an ActionAttempt, dispatches the per-ActionType stub
//          handler under a per-attempt timeout, and terminalizes the
//          row to SUCCEEDED / FAILED / TIMED_OUT according to the
//          handler outcome + per-ActionType retry budget.
// CONNECTS TO:
//   - apps/api/src/services/action/state-machine.ts (transition guards
//     consumed by lifecycle.service.ts)
//   - apps/api/src/services/action/lifecycle.service.ts (the
//     transitionActionStatus + createActionAttempt + createActionResult
//     + terminalizeActionAttempt helpers + RETRY_BUDGET +
//     ATTEMPT_TIMEOUT_MS_DEFAULT)
//   - apps/api/src/services/action/handlers.ts (per-ActionType stub
//     dispatch)
//   - apps/api/src/services/action/scheduler.ts (the cron registration
//     that calls tickActionExecutor on the schedule)
//   - packages/database (prisma, Prisma types)
//   - ADR-0057 §11 (idempotency / retries / timeout / cancellation)
//
// FOUNDER LOCKS (per [ADR-0057-EXECUTOR-WORKER-SCHEDULER-EXECUTE-VERIFY-
//                AUTH-WITH-GAP-LOCKS]):
//   - LOCK-GAP-1 (retry budget): constants from lifecycle.service.ts.
//   - LOCK-GAP-2 (per-attempt timeout): ATTEMPT_TIMEOUT_MS_DEFAULT from
//     lifecycle.service.ts.
//   - LOCK-GAP-3 (stub handlers): handlers.ts dispatch only.
//   - LOCK-GAP-4 (cancel route): the executor never drives a CANCELLED
//     transition. The state-machine permits RUNNING → CANCELLED but
//     no caller exists in this slice.
//   - On retries-exhausted FAILURE: terminalize Action to FAILED + emit
//     ACTION_FAILED. On retries-exhausted TIMEOUT: terminalize
//     Action to TIMED_OUT + emit ACTION_FAILED (the audit vocabulary
//     has no ACTION_TIMED_OUT; per ADR-0057 §11 timeout is a flavor of
//     attempt-FAILED and the audit literal is ACTION_FAILED with
//     error_class = EXECUTOR_TIMEOUT).

import { prisma } from "@niov/database";
import type { Action } from "@prisma/client";
import { executeActionHandler } from "./handlers.js";
import {
  createActionAttempt,
  createActionResult,
  emitLifecycleAudit,
  resolveAttemptTimeoutMs,
  resolveRetryBudget,
  terminalizeActionAttempt,
  transitionActionStatus,
} from "./lifecycle.service.js";
import { isTerminalActionStatus } from "./state-machine.js";
import {
  registerActionAbort,
  releaseActionAbort,
} from "./abort-registry.js";

// WHAT: The error_class string emitted on attempt timeout.
// INPUT: None.
// OUTPUT: A literal string.
// WHY: One named constant so the executor + the audit row + the
//      integration tests share one identifier.
export const EXECUTOR_TIMEOUT_ERROR_CLASS = "EXECUTOR_TIMEOUT" as const;

// WHAT: The default maximum batch size the executor will claim per
//        tick.
// INPUT: None.
// OUTPUT: The number 10.
// WHY: Small enough that one tick latency stays bounded under load,
//      large enough that a backlog drains in reasonable time. Tests
//      can override via the maxBatch option.
export const EXECUTOR_DEFAULT_BATCH = 10;

// WHAT: The shape returned by tickActionExecutor.
// INPUT: Used as a return type.
// OUTPUT: None.
// WHY: Lets the scheduler (cron) log a one-line summary per tick
//      without re-querying.
export interface TickActionExecutorResult {
  claimed: number;
  succeeded: number;
  failed: number;
  timedOut: number;
  retried: number;
}

// WHAT: Options accepted by tickActionExecutor.
// INPUT: Used as a parameter type.
// OUTPUT: None.
// WHY: workerId identifies the runner in audit + ActionAttempt.worker_id;
//      maxBatch caps the per-tick claim; now lets tests pin the clock;
//      attemptTimeoutMs lets tests shorten the per-attempt timer for
//      the integration timeout-path test.
export interface TickActionExecutorOptions {
  workerId?: string;
  maxBatch?: number;
  now?: Date;
  attemptTimeoutMs?: number;
}

// WHAT: Promise wrapper that races the inner promise against a setTimeout
//        of the requested duration; resolves "timeout" if the timer wins.
// INPUT: A promise + timeout in ms.
// OUTPUT: Either { kind: "settled", value } or { kind: "timeout" }.
// WHY: The handler contract supports a self-reported TIMEOUT outcome
//      (via test marker), but a real runaway handler would never
//      resolve. The timer ensures the executor moves on regardless.
async function withTimeout<T>(
  inner: Promise<T>,
  timeoutMs: number,
): Promise<{ kind: "settled"; value: T } | { kind: "timeout" }> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<{ kind: "timeout" }>((resolve) => {
    timer = setTimeout(() => resolve({ kind: "timeout" }), timeoutMs);
  });
  try {
    const result = await Promise.race([
      inner.then((value) => ({ kind: "settled" as const, value })),
      timeoutPromise,
    ]);
    return result;
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

// WHAT: Claim up to maxBatch SCHEDULED Action.action_id values using
//        SELECT … FOR UPDATE SKIP LOCKED.
// INPUT: A transaction client + maxBatch + the now clock.
// OUTPUT: A list of claimed Action rows.
// WHY: Postgres-native row-level locking per ADR-0057 §11. SKIP LOCKED
//      means two concurrent ticks can run safely against the same table
//      without contention or double-execution.
async function claimScheduledActions(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  maxBatch: number,
  now: Date,
): Promise<Action[]> {
  const idRows = await tx.$queryRawUnsafe<Array<{ action_id: string }>>(
    `SELECT action_id
       FROM actions
      WHERE status = 'SCHEDULED'
        AND deleted_at IS NULL
        AND (expires_at IS NULL OR expires_at > $1::timestamptz)
      ORDER BY created_at ASC
      LIMIT $2
      FOR UPDATE SKIP LOCKED`,
    now,
    maxBatch,
  );
  if (idRows.length === 0) return [];
  const ids = idRows.map((r) => r.action_id);
  // Re-read full rows inside the same transaction so the executor sees
  // the locked snapshot (the SELECT above only returned the id).
  return tx.action.findMany({
    where: { action_id: { in: ids } },
  });
}

// WHAT: Generate a default worker_id when the caller did not supply
//        one. The cron registration passes a stable id; ad-hoc test
//        calls accept the default.
// INPUT: None.
// OUTPUT: A short identifier string.
// WHY: ActionAttempt.worker_id is mandatory in the audit shape; one
//      derivation keeps the value bounded + recognizable.
function defaultWorkerId(): string {
  return `executor:${process.pid}`;
}

// WHAT: One executor tick. Claims SCHEDULED rows, dispatches each
//        through the stub handler, terminalizes per outcome + retry
//        budget.
// INPUT: TickActionExecutorOptions.
// OUTPUT: A TickActionExecutorResult summary.
// WHY: The cron registration in scheduler.ts calls this on a
//      schedule; integration tests call it directly with a pinned now.
export async function tickActionExecutor(
  options: TickActionExecutorOptions = {},
): Promise<TickActionExecutorResult> {
  const now = options.now ?? new Date();
  const workerId = options.workerId ?? defaultWorkerId();
  const maxBatch = options.maxBatch ?? EXECUTOR_DEFAULT_BATCH;

  let claimed = 0;
  let succeeded = 0;
  let failed = 0;
  let timedOut = 0;
  let retried = 0;

  // Step 1 — claim a batch of SCHEDULED action_ids in a short
  // transaction. We do NOT hold the SKIP LOCKED lock across the
  // handler call: instead we transition each claimed row to RUNNING
  // (inside the claim tx) so a sibling worker's subsequent claim sees
  // status != 'SCHEDULED' and skips. This is the "transition early
  // then dispatch" pattern; it preserves single-worker-per-action
  // safety because the SCHEDULED → RUNNING update is itself atomic
  // (row-level write lock).
  const claimedActions = await prisma.$transaction(async (tx) => {
    const rows = await claimScheduledActions(tx, maxBatch, now);
    const promoted: Action[] = [];
    for (const row of rows) {
      // Defensive: another worker may have moved this row between the
      // id-select and the row-read (under FOR UPDATE SKIP LOCKED this
      // can't happen, but isTerminalActionStatus is cheap insurance
      // against future refactors).
      if (isTerminalActionStatus(row.status) || row.status !== "SCHEDULED") {
        continue;
      }
      const next = await transitionActionStatus(tx, {
        action: row,
        nextStatus: "RUNNING",
        eventType: "ACTION_STARTED",
        outcome: "SUCCESS",
        // attempt_id + attempt_number land on the ACTION_STARTED row
        // via a follow-up audit after the ActionAttempt is created;
        // here we just emit the row-level transition.
        extraDetails: { worker_id: workerId },
      });
      promoted.push(next);
    }
    return promoted;
  });

  claimed = claimedActions.length;
  if (claimed === 0) {
    return { claimed: 0, succeeded: 0, failed: 0, timedOut: 0, retried: 0 };
  }

  // Step 2 — for each promoted RUNNING row, loop attempts up to the
  // per-ActionType retry budget. ADR-0057 §11: the parent Action
  // stays in RUNNING through all attempts; only the per-attempt
  // ActionAttempt rows terminalize FAILED / TIMED_OUT mid-loop.
  for (const action of claimedActions) {
    // ADR-0057 Wave 6: look up the (org, action_type, risk_tier)
    // ActionPolicy row to resolve retry_budget +
    // attempt_timeout_ms_override. Null fields fall back to the
    // service-tier RETRY_BUDGET[action_type] /
    // ATTEMPT_TIMEOUT_MS_DEFAULT constants via the
    // resolveRetryBudget / resolveAttemptTimeoutMs helpers. The
    // caller-supplied attemptTimeoutMs option (used by tests) still
    // wins if provided — preserves the existing test ergonomics.
    const matchedPolicy = await prisma.actionPolicy.findUnique({
      where: {
        org_entity_id_action_type_risk_tier: {
          org_entity_id: action.org_entity_id,
          action_type: action.action_type,
          risk_tier: action.risk_tier,
        },
      },
      select: {
        retry_budget: true,
        attempt_timeout_ms_override: true,
      },
    });
    const retryBudget = resolveRetryBudget(matchedPolicy, action.action_type);
    const resolvedAttemptTimeoutMs =
      options.attemptTimeoutMs ?? resolveAttemptTimeoutMs(matchedPolicy);
    let lastResult:
      | {
          outcome: "SUCCESS";
          result_summary: string;
          result_metadata: Record<string, unknown>;
        }
      | {
          outcome: "FAILURE" | "TIMEOUT";
          error_class: string;
          error_summary: string;
        }
      | null = null;
    let attemptsTaken = 0;
    let lastAttemptId: string | null = null;
    let lastAttemptNumber = 0;

    // 2a — attempt loop. Each iteration creates an ActionAttempt,
    // dispatches the handler under the per-attempt timeout, and
    // persists the attempt outcome. We exit the loop on SUCCESS OR
    // on hitting the retry budget.
    for (let i = 0; i < retryBudget; i += 1) {
      const attempt = await prisma.$transaction(async (tx) =>
        createActionAttempt(tx, {
          action_id: action.action_id,
          worker_id: workerId,
          timeout_ms: resolvedAttemptTimeoutMs,
        }),
      );
      attemptsTaken += 1;
      lastAttemptId = attempt.attempt_id;
      lastAttemptNumber = attempt.attempt_number;

      // [ADR-0057-RUNNING-CANCEL-BREAK-GLASS] Wave 2: register an
      // AbortController for this attempt so the cancel service (when
      // granted RUNNING-cancel via break-glass) can fire the signal
      // and short-circuit the in-flight handler. The signal is passed
      // through to the handler via HandlerActionInput.abort_signal;
      // handlers that wrap long-running work (real connectors, real
      // permission grants, etc) listen for `aborted` to terminate
      // promptly. The stub handlers + the current RECORD_CAPSULE
      // handler are short by construction so the signal is recorded
      // but not actively consumed in the current wave — the
      // executor's withTimeout race still terminates the attempt and
      // the parent Action transitions to CANCELLED via the cancel
      // service's state-machine path.
      const abortController = registerActionAbort(action.action_id);
      const raced = await withTimeout(
        executeActionHandler({
          action_id: action.action_id,
          action_type: action.action_type,
          source_entity_id: action.source_entity_id,
          payload_redacted: action.payload_redacted,
          abort_signal: abortController.signal,
        }),
        resolvedAttemptTimeoutMs,
      ).finally(() => {
        releaseActionAbort(action.action_id);
      });

      const handlerResult =
        raced.kind === "timeout"
          ? {
              outcome: "TIMEOUT" as const,
              error_class: EXECUTOR_TIMEOUT_ERROR_CLASS,
              error_summary: `executor timed out after ${resolvedAttemptTimeoutMs}ms`,
            }
          : raced.value;

      lastResult = handlerResult;

      if (handlerResult.outcome === "SUCCESS") {
        await prisma.$transaction(async (tx) => {
          await terminalizeActionAttempt(tx, {
            attempt_id: attempt.attempt_id,
            outcome: "SUCCEEDED",
          });
          await createActionResult(tx, {
            attempt_id: attempt.attempt_id,
            result_summary: handlerResult.result_summary,
            result_metadata: handlerResult.result_metadata,
          });
        });
        break;
      }

      // FAILURE or TIMEOUT — terminalize the attempt and either
      // loop for the next attempt or exit to terminalize the parent.
      const attemptOutcome =
        handlerResult.outcome === "TIMEOUT" ? "TIMED_OUT" : "FAILED";
      await prisma.$transaction(async (tx) =>
        terminalizeActionAttempt(tx, {
          attempt_id: attempt.attempt_id,
          outcome: attemptOutcome,
          error_class: handlerResult.error_class,
          error_summary: handlerResult.error_summary,
        }),
      );
      if (i + 1 < retryBudget) {
        retried += 1;
      }
    }

    if (lastResult === null) {
      // Defensive: the loop should always run at least once because
      // retryBudget is >= 1 for every defined ActionType.
      continue;
    }

    // 2b — terminalize the parent Action based on the final attempt
    // outcome. RUNNING → SUCCEEDED / FAILED / TIMED_OUT.
    if (lastResult.outcome === "SUCCESS") {
      await prisma.$transaction(async (tx) => {
        const current = await tx.action.findUnique({
          where: { action_id: action.action_id },
          select: { status: true, action_type: true },
        });
        if (current === null || current.status !== "RUNNING") return;
        await transitionActionStatus(tx, {
          action: {
            action_id: action.action_id,
            action_type: current.action_type,
            status: current.status,
          },
          nextStatus: "SUCCEEDED",
          eventType: "ACTION_SUCCEEDED",
          outcome: "SUCCESS",
          extraDetails: {
            worker_id: workerId,
            ...(lastAttemptId !== null
              ? { attempt_id: lastAttemptId }
              : {}),
            attempt_number: lastAttemptNumber,
          },
        });
      });
      succeeded += 1;
    } else {
      const isTimeout = lastResult.outcome === "TIMEOUT";
      const nextStatus = isTimeout ? "TIMED_OUT" : "FAILED";
      await prisma.$transaction(async (tx) => {
        const current = await tx.action.findUnique({
          where: { action_id: action.action_id },
          select: { status: true, action_type: true },
        });
        if (current === null || current.status !== "RUNNING") return;
        await transitionActionStatus(tx, {
          action: {
            action_id: action.action_id,
            action_type: current.action_type,
            status: current.status,
          },
          nextStatus,
          // ADR-0057 §11: timeout terminalization emits ACTION_FAILED
          // with error_class = EXECUTOR_TIMEOUT (no ACTION_TIMED_OUT
          // literal exists in the canonical 10-literal vocabulary).
          eventType: "ACTION_FAILED",
          outcome: "ERROR",
          extraDetails: {
            worker_id: workerId,
            ...(lastAttemptId !== null
              ? { attempt_id: lastAttemptId }
              : {}),
            attempt_number: lastAttemptNumber,
            error_class: lastResult.error_class,
            error_summary: lastResult.error_summary,
          },
        });
      });
      if (isTimeout) {
        timedOut += 1;
      } else {
        failed += 1;
      }
    }

    // Suppress the unused-variable lint without changing behavior;
    // attemptsTaken is informational for future telemetry hooks.
    void attemptsTaken;
  }

  return { claimed, succeeded, failed, timedOut, retried };
}

// WHAT: Convenience wrapper that calls emitLifecycleAudit without an
//        open transaction (writeAuditEvent opens its own tx). Kept
//        unused for now; reserved for future ad-hoc audit emissions
//        from the executor (e.g. health-tick rows). NOT exported until
//        a consumer exists.
// INPUT: None.
// OUTPUT: None.
// WHY: Re-export discipline — only export what callers consume.
export { emitLifecycleAudit as _emitLifecycleAuditForTests };
