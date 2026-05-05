// FILE: scheduler.ts
// PURPOSE: Cron entry-point for the five non-event-driven feedback
//          loops (Loops 2, 3, 4, 6, 7). The scheduler is a NO-OP in
//          NODE_ENV=test -- tests invoke loop functions directly via
//          feedbackService.runLoopXOnce() so cron timers cannot fire
//          mid-test and pollute the DB.
// CONNECTS TO: node-cron (the only consumer of cron in the project),
//              FeedbackService (the loops), main() in server.ts (which
//              calls startScheduler in production).

import * as cron from "node-cron";
import { SYSTEM_PRINCIPALS, writeAuditEvent } from "@niov/database";
import type { FeedbackService } from "./feedback.service.js";
import type { OtzarService } from "../otzar/otzar.service.js";

// WHAT: Wrap one cron-scheduled loop call so success and failure
//        both emit hash-chained audit rows under the SCHEDULER
//        system principal.
// INPUT: A loop_name (string used in details + error attribution),
//        the async runner function, and an optional duration tracker.
// OUTPUT: Promise<void> (the cron callback awaits internally).
// WHY: 12C.0 Item 7 -- prior to this batch, scheduler tick failures
//      surfaced via console.error only and successful runs were
//      invisible to audit reconstruction. Now each tick emits
//      FEEDBACK_LOOP_EXECUTED on success or FEEDBACK_LOOP_FAILED
//      on catch with timing + loop_name + error_summary, all under
//      system_principal: SCHEDULER. NIST 800-53 AU-2 calls out
//      audit coverage of system activities including scheduled
//      processes; this closes the Compliance Architecture Review
//      finding 1.4 gap (system actor enumeration) for the
//      cron-driven loops.
async function runLoopWithAudit(
  loopName: string,
  runner: () => Promise<unknown>,
): Promise<void> {
  const startedAt = Date.now();
  try {
    const result = await runner();
    const durationMs = Date.now() - startedAt;
    // items_processed is best-effort -- runners that return a
    // count-shaped object surface it; runners that return void
    // omit it from details.
    let itemsProcessed: number | undefined;
    if (
      result !== null &&
      typeof result === "object" &&
      "items_processed" in result
    ) {
      const n = (result as { items_processed: unknown }).items_processed;
      if (typeof n === "number") itemsProcessed = n;
    }
    await writeAuditEvent({
      event_type: "FEEDBACK_LOOP_EXECUTED",
      outcome: "SUCCESS",
      actor_entity_id: null,
      system_principal: SYSTEM_PRINCIPALS.SCHEDULER,
      details: {
        loop_name: loopName,
        duration_ms: durationMs,
        ...(itemsProcessed !== undefined
          ? { items_processed: itemsProcessed }
          : {}),
      },
    });
  } catch (err) {
    const durationMsPartial = Date.now() - startedAt;
    const errorSummary = err instanceof Error ? err.message : String(err);
    await writeAuditEvent({
      event_type: "FEEDBACK_LOOP_FAILED",
      outcome: "ERROR",
      actor_entity_id: null,
      system_principal: SYSTEM_PRINCIPALS.SCHEDULER,
      details: {
        loop_name: loopName,
        duration_ms_partial: durationMsPartial,
        error_summary: errorSummary,
      },
    });
  }
}

// WHAT: The handle returned by startScheduler.
// INPUT: Used as a return type only.
// OUTPUT: None.
// WHY: stop() lets server graceful-shutdown unregister cron tasks
//      before app.close(); isRunning() lets tests assert the
//      scheduler is in the correct state.
export interface SchedulerHandle {
  stop(): void;
  isRunning(): boolean;
}

// WHAT: Start (or skip) the cron-driven feedback loops.
// INPUT: A FeedbackService whose runLoopXOnce methods will be invoked
//        on each schedule tick.
// OUTPUT: A SchedulerHandle.
// WHY: TEST-MODE SAFETY: when NODE_ENV is "test" we return an
//      isRunning=false no-op handle BEFORE registering any cron
//      tasks. Background timers firing mid-test would race with
//      assertions and poison the shared Supabase test DB. Tests
//      that need to exercise loop behavior call
//      feedbackService.runLoopXOnce() directly.
export function startScheduler(
  feedbackService: FeedbackService,
  otzarService?: OtzarService,
): SchedulerHandle {
  if (process.env.NODE_ENV === "test") {
    return {
      stop: () => {},
      isRunning: () => false,
    };
  }

  const tasks: cron.ScheduledTask[] = [];

  // Loop 2 -- Token Efficiency, hourly.
  tasks.push(
    cron.schedule("0 * * * *", () => {
      void runLoopWithAudit("loop_2", () => feedbackService.runLoop2Once());
    }),
  );

  // Loop 3 -- Permission Patterns, daily at 02:00.
  tasks.push(
    cron.schedule("0 2 * * *", () => {
      void runLoopWithAudit("loop_3", () => feedbackService.runLoop3Once());
    }),
  );

  // Loop 4 -- Hive Aggregate Refresh, every 30 minutes.
  tasks.push(
    cron.schedule("*/30 * * * *", () => {
      void runLoopWithAudit("loop_4", () => feedbackService.runLoop4Once());
    }),
  );

  // Loop 6 -- Monetization Demand, weekly on Sunday at 03:00.
  tasks.push(
    cron.schedule("0 3 * * 0", () => {
      void runLoopWithAudit("loop_6", () => feedbackService.runLoop6Once());
    }),
  );

  // Loop 7 -- Meta Health Check, monthly on the 1st at 04:00.
  tasks.push(
    cron.schedule("0 4 1 * *", () => {
      void runLoopWithAudit("loop_7", () => feedbackService.runLoop7Once());
    }),
  );

  // Section 11B -- Otzar auto-close sweep, every 30 minutes.
  // Only registered when an OtzarService is provided (Section 10
  // tests construct startScheduler with feedbackService alone and
  // intentionally skip this cron).
  if (otzarService !== undefined) {
    tasks.push(
      cron.schedule("*/30 * * * *", () => {
        void runLoopWithAudit("otzar_auto_close", () =>
          otzarService.runAutoCloseSweep(),
        );
      }),
    );
  }

  let running = true;
  return {
    stop: () => {
      for (const t of tasks) {
        try {
          t.stop();
        } catch {
          // ignore stop errors during shutdown
        }
      }
      running = false;
    },
    isRunning: () => running,
  };
}
