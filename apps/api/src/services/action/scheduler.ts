// FILE: scheduler.ts
// PURPOSE: The ADR-0057 §1 + §11 Action scheduler. Performs two
//          periodic sweeps: (1) APPROVED → SCHEDULED admission, and
//          (2) SCHEDULED → EXPIRED expiry. Also owns the cron
//          registration that calls tickActionExecutor on a schedule.
//          NO-OP under NODE_ENV=test (tests call the tick functions
//          directly so cron timers never fire mid-test).
// CONNECTS TO:
//   - apps/api/src/services/action/state-machine.ts (transition
//     guards via lifecycle.service.ts)
//   - apps/api/src/services/action/lifecycle.service.ts (the
//     transitionActionStatus helper)
//   - apps/api/src/services/action/executor.ts (tickActionExecutor)
//   - node-cron (the existing scheduler dependency reused here)
//   - apps/api/src/server.ts (calls startActionScheduler in
//     production and stopActionScheduler on graceful shutdown)
//   - ADR-0057 §1 + §11
//
// FOUNDER LOCKS (per [ADR-0057-EXECUTOR-WORKER-SCHEDULER-EXECUTE-VERIFY-
//                AUTH-WITH-GAP-LOCKS]):
//   - LOCK-GAP-5 (expiry sweep): yes, included in this slice.
//   - Cron schedules:
//       executor tick      → every 30 seconds
//       admission tick     → every 30 seconds
//       expiry sweep tick  → every 60 seconds
//     These match the "responsive admission + non-trivial backlog
//     drain" intent in ADR-0057 §11; future tuning is forward
//     substrate.

import * as cron from "node-cron";
import { tickRegulatorAccessExpirySweep } from "../cosmp/regulator-expiry.service.js";
import { prisma } from "@niov/database";
import { tickActionExecutor } from "./executor.js";
import { transitionActionStatus } from "./lifecycle.service.js";

// WHAT: The default maximum batch size the scheduler ticks claim per
//        invocation.
// INPUT: None.
// OUTPUT: The number 50.
// WHY: The admission + expiry sweeps are cheap point-update queries;
//      50 per tick drains a backlog quickly without holding long
//      transactions. Tests can override via maxBatch.
export const SCHEDULER_DEFAULT_BATCH = 50;

// WHAT: The result shape returned by tickActionScheduler.
// INPUT: Used as a return type.
// OUTPUT: None.
// WHY: Lets callers (cron + tests) log a one-line summary.
export interface TickActionSchedulerResult {
  scheduled: number;
}

// WHAT: The result shape returned by tickActionExpirySweep.
// INPUT: Used as a return type.
// OUTPUT: None.
// WHY: Same as above, for the expiry tick.
export interface TickActionExpirySweepResult {
  expired: number;
}

// WHAT: Options accepted by the scheduler / expiry ticks.
// INPUT: Used as a parameter type.
// OUTPUT: None.
// WHY: now lets tests pin the clock; maxBatch caps the per-tick claim.
export interface TickSchedulerOptions {
  now?: Date;
  maxBatch?: number;
}

// WHAT: One admission tick. Promotes APPROVED rows to SCHEDULED,
//        emitting ACTION_SCHEDULED on each transition.
// INPUT: TickSchedulerOptions.
// OUTPUT: A TickActionSchedulerResult summary.
// WHY: Separated from the cron-loop body so integration tests can
//      drive admission directly and assert exactly the number of
//      promotions.
export async function tickActionScheduler(
  options: TickSchedulerOptions = {},
): Promise<TickActionSchedulerResult> {
  const now = options.now ?? new Date();
  const maxBatch = options.maxBatch ?? SCHEDULER_DEFAULT_BATCH;

  // Note: APPROVED actions are typically AUTO_APPROVE create-time
  // landings (no escalation needed) OR APPROVED escalations whose
  // Action row has flipped status. Both are eligible here.
  return prisma.$transaction(async (tx) => {
    const candidates = await tx.action.findMany({
      where: {
        status: "APPROVED",
        deleted_at: null,
        // Don't admit anything already past its expiry.
        OR: [{ expires_at: null }, { expires_at: { gt: now } }],
      },
      orderBy: { created_at: "asc" },
      take: maxBatch,
      select: {
        action_id: true,
        action_type: true,
        status: true,
      },
    });

    let scheduled = 0;
    for (const candidate of candidates) {
      await transitionActionStatus(tx, {
        action: candidate,
        nextStatus: "SCHEDULED",
        eventType: "ACTION_SCHEDULED",
        outcome: "SUCCESS",
      });
      scheduled += 1;
    }
    return { scheduled };
  });
}

// WHAT: One expiry sweep. Terminalizes SCHEDULED rows whose
//        expires_at has elapsed to EXPIRED + emits ACTION_EXPIRED.
// INPUT: TickSchedulerOptions.
// OUTPUT: A TickActionExpirySweepResult summary.
// WHY: ADR-0057 §11 expiry semantics — a SCHEDULED action whose
//      expires_at elapses before pick-up is EXPIRED, not FAILED.
export async function tickActionExpirySweep(
  options: TickSchedulerOptions = {},
): Promise<TickActionExpirySweepResult> {
  const now = options.now ?? new Date();
  const maxBatch = options.maxBatch ?? SCHEDULER_DEFAULT_BATCH;

  return prisma.$transaction(async (tx) => {
    const candidates = await tx.action.findMany({
      where: {
        status: "SCHEDULED",
        deleted_at: null,
        expires_at: { lte: now },
      },
      orderBy: { expires_at: "asc" },
      take: maxBatch,
      select: {
        action_id: true,
        action_type: true,
        status: true,
      },
    });

    let expired = 0;
    for (const candidate of candidates) {
      await transitionActionStatus(tx, {
        action: candidate,
        nextStatus: "EXPIRED",
        eventType: "ACTION_EXPIRED",
        outcome: "SUCCESS",
        extraDetails: { decision_reason: "expires_at_elapsed" },
      });
      expired += 1;
    }
    return { expired };
  });
}

// WHAT: The handle returned by startActionScheduler. Mirrors the
//        SchedulerHandle shape used by feedback/scheduler.ts so the
//        server.ts wiring can compose them identically.
// INPUT: Used as a return type only.
// OUTPUT: None.
// WHY: Lets the production main() loop call stop() on graceful
//      shutdown.
export interface ActionSchedulerHandle {
  stop(): void;
  isRunning(): boolean;
}

let runningHandle: ActionSchedulerHandle | null = null;

// WHAT: Start the cron registrations for admission + executor +
//        expiry. NO-OP under NODE_ENV=test (the handle reports
//        isRunning=false so tests can assert the timer state without
//        actually firing).
// INPUT: None.
// OUTPUT: An ActionSchedulerHandle.
// WHY: Idempotent — calling twice returns the same handle so a
//      double-start in development doesn't register duplicate cron
//      tasks. Server graceful shutdown calls stop().
export function startActionScheduler(): ActionSchedulerHandle {
  if (process.env.NODE_ENV === "test") {
    return { stop: () => {}, isRunning: () => false };
  }
  if (runningHandle !== null) return runningHandle;

  const tasks: cron.ScheduledTask[] = [];

  // Admission — every 30 seconds promotes APPROVED → SCHEDULED.
  tasks.push(
    cron.schedule("*/30 * * * * *", () => {
      void tickActionScheduler().catch(() => {
        // Errors are intentionally swallowed at the cron boundary; the
        // tick itself emits audit on each transition, and a tick-level
        // failure is best-effort retried on the next schedule.
      });
    }),
  );

  // Executor — every 30 seconds claims SCHEDULED → RUNNING + drives
  // the handlers.
  tasks.push(
    cron.schedule("*/30 * * * * *", () => {
      void tickActionExecutor().catch(() => {});
    }),
  );

  // Expiry sweep — every 60 seconds terminalizes elapsed SCHEDULED.
  tasks.push(
    cron.schedule("0 * * * * *", () => {
      void tickActionExpirySweep().catch(() => {});
    }),
  );

  // Hardening Wave D — every 60 seconds sweeps LawfulBasis rows
  // past valid_until and emits REGULATOR_ACCESS_EXPIRED audit
  // rows per ADR-0036 Sub-decision 4. Idempotent + bounded batch.
  tasks.push(
    cron.schedule("30 * * * * *", () => {
      void tickRegulatorAccessExpirySweep().catch(() => {});
    }),
  );

  let running = true;
  const handle: ActionSchedulerHandle = {
    stop: () => {
      for (const t of tasks) {
        try {
          t.stop();
        } catch {
          // ignore stop errors during shutdown
        }
      }
      running = false;
      runningHandle = null;
    },
    isRunning: () => running,
  };
  runningHandle = handle;
  return handle;
}

// WHAT: Stop the running action scheduler. Safe to call even when
//        startActionScheduler was never invoked.
// INPUT: None.
// OUTPUT: None.
// WHY: Server graceful shutdown calls this; tests that did NOT call
//      startActionScheduler (the common case under NODE_ENV=test)
//      observe a no-op.
export function stopActionScheduler(): void {
  if (runningHandle === null) return;
  runningHandle.stop();
}
