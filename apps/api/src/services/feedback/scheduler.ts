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
import type { FeedbackService } from "./feedback.service.js";
import type { OtzarService } from "../otzar/otzar.service.js";

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
      feedbackService.runLoop2Once().catch((err) => {
        // eslint-disable-next-line no-console
        console.error("[scheduler] Loop 2 failed:", err);
      });
    }),
  );

  // Loop 3 -- Permission Patterns, daily at 02:00.
  tasks.push(
    cron.schedule("0 2 * * *", () => {
      feedbackService.runLoop3Once().catch((err) => {
        // eslint-disable-next-line no-console
        console.error("[scheduler] Loop 3 failed:", err);
      });
    }),
  );

  // Loop 4 -- Hive Aggregate Refresh, every 30 minutes.
  tasks.push(
    cron.schedule("*/30 * * * *", () => {
      feedbackService.runLoop4Once().catch((err) => {
        // eslint-disable-next-line no-console
        console.error("[scheduler] Loop 4 failed:", err);
      });
    }),
  );

  // Loop 6 -- Monetization Demand, weekly on Sunday at 03:00.
  tasks.push(
    cron.schedule("0 3 * * 0", () => {
      feedbackService.runLoop6Once().catch((err) => {
        // eslint-disable-next-line no-console
        console.error("[scheduler] Loop 6 failed:", err);
      });
    }),
  );

  // Loop 7 -- Meta Health Check, monthly on the 1st at 04:00.
  tasks.push(
    cron.schedule("0 4 1 * *", () => {
      feedbackService.runLoop7Once().catch((err) => {
        // eslint-disable-next-line no-console
        console.error("[scheduler] Loop 7 failed:", err);
      });
    }),
  );

  // Section 11B -- Otzar auto-close sweep, every 30 minutes.
  // Only registered when an OtzarService is provided (Section 10
  // tests construct startScheduler with feedbackService alone and
  // intentionally skip this cron).
  if (otzarService !== undefined) {
    tasks.push(
      cron.schedule("*/30 * * * *", () => {
        otzarService.runAutoCloseSweep().catch((err) => {
          // eslint-disable-next-line no-console
          console.error("[scheduler] Otzar auto-close failed:", err);
        });
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
