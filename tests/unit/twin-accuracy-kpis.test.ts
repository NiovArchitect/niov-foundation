// FILE: twin-accuracy-kpis.test.ts
// PURPOSE: Phase E.3 — pure Twin accuracy / dual-control KPI rollup.

import { describe, expect, it } from "vitest";
import {
  emptyTwinAccuracyKpis,
  rollupTwinAccuracyKpis,
} from "../../apps/api/src/services/otzar/twin-accuracy-kpis.js";

describe("rollupTwinAccuracyKpis", () => {
  it("returns zeros for empty input", () => {
    expect(emptyTwinAccuracyKpis().twin_claims).toBe(0);
  });

  it("counts active, completed, regulated, verified, edits", () => {
    const k = rollupTwinAccuracyKpis([
      {
        status: "EXECUTING",
        details: {
          twin_work: {
            state: "CLAIMED_WORKING",
            accuracy_class: "STANDARD",
          },
        },
      },
      {
        status: "NEEDS_CALLER_CONFIRMATION",
        details: {
          twin_work: {
            state: "AWAITING_VERIFICATION",
            accuracy_class: "REGULATED_HEALTH",
            requires_verification: true,
            verification_state: "AWAITING_HUMAN",
          },
        },
      },
      {
        status: "EXECUTED",
        details: {
          twin_work: {
            state: "COMPLETED",
            accuracy_class: "REGULATED_FINANCE",
            verification_state: "VERIFIED",
            edit_detected: true,
          },
        },
      },
      { status: "OPEN", details: { other: true } },
    ]);
    expect(k.twin_claims).toBe(3);
    expect(k.twin_active).toBe(2);
    expect(k.twin_completed).toBe(1);
    expect(k.regulated_claims).toBe(2);
    expect(k.awaiting_human_verify).toBe(1);
    expect(k.human_verified).toBe(1);
    expect(k.human_verified_and_completed).toBe(1);
    expect(k.human_edit_after_claim).toBe(1);
    expect(k.completion_gate_blocks).toBe(1);
    expect(k.regulated_classes).toEqual([
      "REGULATED_FINANCE",
      "REGULATED_HEALTH",
    ]);
  });
});
