// FILE: source-recheck-scheduler.ts
// PURPOSE: [INBOUND-RECHECK · Slice 1] The node-cron registration for the
//          scheduled per-org source recheck. Mirrors the action/feedback
//          scheduler pattern: NO-OP under NODE_ENV=test (tests call
//          tickSourceRecheck directly so timers never fire mid-test),
//          idempotent, and stopped on graceful shutdown.
// CONNECTS TO: source-recheck.service.ts (tickSourceRecheck +
//          parseRecheckTargets), node-cron, apps/api/src/server.ts (start/stop).
//
// The tick reads SOURCE_RECHECK_TARGETS at FIRE time, so the fail-closed
// allowlist is a pure env change (no code change) — an empty allowlist makes
// every tick a no-op. Cadence defaults to daily (a first-slice conservative
// choice: cadence multiplies both Google quota and audit/notification volume;
// tighten later via SOURCE_RECHECK_CRON).

import * as cron from "node-cron";
import { parseRecheckTargets, tickSourceRecheck } from "./source-recheck.service.js";

// 03:00 daily (6-field node-cron). Deliberately slow for a first slice.
export const DEFAULT_RECHECK_CRON = "0 0 3 * * *";

export interface SourceRecheckSchedulerHandle {
  stop(): void;
  isRunning(): boolean;
}

let runningHandle: SourceRecheckSchedulerHandle | null = null;

// WHAT: Register the daily recheck cron. NO-OP under NODE_ENV=test; idempotent.
// INPUT: none (reads SOURCE_RECHECK_CRON / SOURCE_RECHECK_TARGETS from env).
// OUTPUT: a handle whose stop() unregisters the cron task.
// WHY: Same lifecycle contract as startActionScheduler so server.ts composes it
//      identically. An invalid SOURCE_RECHECK_CRON falls back to the default
//      rather than crashing boot.
export function startSourceRecheckScheduler(): SourceRecheckSchedulerHandle {
  if (process.env.NODE_ENV === "test") {
    return { stop: () => {}, isRunning: () => false };
  }
  if (runningHandle !== null) return runningHandle;

  const configured = process.env.SOURCE_RECHECK_CRON;
  const schedule =
    typeof configured === "string" && cron.validate(configured)
      ? configured
      : DEFAULT_RECHECK_CRON;

  const task = cron.schedule(schedule, () => {
    // Read targets at fire time (fail-closed: empty allowlist ⇒ no-op).
    void tickSourceRecheck(parseRecheckTargets(process.env.SOURCE_RECHECK_TARGETS)).catch(
      () => {
        // Errors are swallowed at the cron boundary; each demotion is audited by
        // the sink, and a tick-level failure is best-effort retried next run.
      },
    );
  });

  let isRunning = true;
  const handle: SourceRecheckSchedulerHandle = {
    stop: () => {
      try {
        task.stop();
      } catch {
        // ignore stop errors during shutdown
      }
      isRunning = false;
      runningHandle = null;
    },
    isRunning: () => isRunning,
  };
  runningHandle = handle;
  return handle;
}

// WHAT: Stop the running recheck scheduler. Safe when never started.
export function stopSourceRecheckScheduler(): void {
  if (runningHandle === null) return;
  runningHandle.stop();
}
