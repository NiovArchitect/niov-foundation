// FILE: truth-evidence-recheck-scheduler.ts
// PURPOSE: [OTZAR STAGE-2 TRUTH-EVIDENCE §7 — SWEEP] The node-cron registration for the auto-
//          remediation sweep. Mirrors source-recheck-scheduler.ts EXACTLY: NO-OP under
//          NODE_ENV=test (tests call tickTruthEvidenceRecheck directly so timers never fire mid-
//          test), idempotent, and stopped on graceful shutdown.
// CONNECTS TO: truth-evidence-recheck.service.ts (tick + enabled flag + target parse), node-cron,
//          apps/api/src/server.ts (start/stop).
//
// DISABLED BY DEFAULT: the fire callback FIRST checks truthEvidenceRecheckEnabled()
// (OTZAR_TRUTH_EVIDENCE_RECHECK_ENABLED === "true"). Registering the cron does NOT scan; without the
// flag every fire is an immediate no-op. Targets are read at fire time (fail-closed allowlist) so
// enabling is a pure env change — an empty allowlist keeps every fire a no-op.

import * as cron from "node-cron";
import {
  tickTruthEvidenceRecheck,
  truthEvidenceRecheckEnabled,
  parseTruthEvidenceTargets,
  TRUTH_EVIDENCE_RECHECK_TARGETS_ENV,
} from "./truth-evidence-recheck.service.js";

// 04:00 daily (6-field node-cron) — offset from the 03:00 source recheck; deliberately slow.
export const DEFAULT_TRUTH_EVIDENCE_RECHECK_CRON = "0 0 4 * * *";

export interface TruthEvidenceRecheckSchedulerHandle {
  stop(): void;
  isRunning(): boolean;
}

let runningHandle: TruthEvidenceRecheckSchedulerHandle | null = null;

// WHAT: Register the daily sweep cron. NO-OP under NODE_ENV=test; idempotent. An invalid
//       OTZAR_TRUTH_EVIDENCE_RECHECK_CRON falls back to the default rather than crashing boot.
export function startTruthEvidenceRecheckScheduler(): TruthEvidenceRecheckSchedulerHandle {
  if (process.env.NODE_ENV === "test") {
    return { stop: () => {}, isRunning: () => false };
  }
  if (runningHandle !== null) return runningHandle;

  const configured = process.env.OTZAR_TRUTH_EVIDENCE_RECHECK_CRON;
  const schedule =
    typeof configured === "string" && cron.validate(configured)
      ? configured
      : DEFAULT_TRUTH_EVIDENCE_RECHECK_CRON;

  const task = cron.schedule(schedule, () => {
    // DISABLED BY DEFAULT: no scanning unless explicitly enabled AND an allowlist is configured.
    if (!truthEvidenceRecheckEnabled()) return;
    void tickTruthEvidenceRecheck(parseTruthEvidenceTargets(process.env[TRUTH_EVIDENCE_RECHECK_TARGETS_ENV])).catch(() => {
      // Errors are swallowed at the cron boundary; each remediation is atomically audited, and a
      // tick-level failure is best-effort retried next run (fail-closed: no false "current").
    });
  });

  let isRunning = true;
  const handle: TruthEvidenceRecheckSchedulerHandle = {
    stop: () => {
      try { task.stop(); } catch { /* ignore stop errors during shutdown */ }
      isRunning = false;
      runningHandle = null;
    },
    isRunning: () => isRunning,
  };
  runningHandle = handle;
  return handle;
}

// WHAT: Stop the running sweep scheduler. Safe when never started.
export function stopTruthEvidenceRecheckScheduler(): void {
  if (runningHandle === null) return;
  runningHandle.stop();
}
