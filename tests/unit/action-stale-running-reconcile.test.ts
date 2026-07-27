// FILE: action-stale-running-reconcile.test.ts
// PURPOSE: Pure-ish unit coverage for stale RUNNING recovery constants
//          + state-machine edge used by tickStaleRunningReconcile.

import { describe, expect, it } from "vitest";
import {
  STALE_ATTEMPT_GRACE_MS,
  STALE_ORPHAN_ERROR_CLASS,
  STALE_PROMOTE_GRACE_MS,
  STALE_PROMOTE_ORPHAN_ERROR_CLASS,
} from "../../apps/api/src/services/action/executor.js";
import { canTransitionAction } from "@niov/api";

describe("stale RUNNING reconcile substrate", () => {
  it("exposes stable error classes for audit", () => {
    expect(STALE_ORPHAN_ERROR_CLASS).toBe("STALE_WORKER_ORPHAN");
    expect(STALE_PROMOTE_ORPHAN_ERROR_CLASS).toBe("STALE_PROMOTE_ORPHAN");
  });

  it("uses positive grace windows", () => {
    expect(STALE_ATTEMPT_GRACE_MS).toBeGreaterThan(0);
    expect(STALE_PROMOTE_GRACE_MS).toBeGreaterThan(STALE_ATTEMPT_GRACE_MS);
  });

  it("permits RUNNING → SCHEDULED for orphan requeue", () => {
    expect(canTransitionAction("RUNNING", "SCHEDULED")).toBe(true);
  });

  it("still permits RUNNING → TIMED_OUT for exhausted budget", () => {
    expect(canTransitionAction("RUNNING", "TIMED_OUT")).toBe(true);
  });
});
