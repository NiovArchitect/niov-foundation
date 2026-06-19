// FILE: tests/unit/cohort-attribution.test.ts (unit)
// PURPOSE: F-1323 — lock the v1 equal-weight attribution formula. Deterministic,
//          explicit, mock-only. The directive's worked example (10 active / 100
//          usage / $200 → 0.10 / 10 / $20) must hold exactly.
// CONNECTS TO: apps/api/src/services/foundation/cohort-attribution.service.ts

import { describe, expect, it } from "vitest";
import {
  computeEqualWeightAttribution,
  shouldSuppressCounts,
} from "../../apps/api/src/services/foundation/cohort-attribution.service.js";

describe("F-1323 equal-weight attribution (v1)", () => {
  it("matches the directive's worked example: 10 active / 100 usage / $200", () => {
    const r = computeEqualWeightAttribution(10, 100, 200);
    expect(r.perWeight).toBe(0.1);
    expect(r.perUsage).toBe(10);
    expect(r.perValue).toBe(20);
    expect(r.totalWeight).toBe(1.0);
  });

  it("zero active contributors → zero everything (no divide-by-zero)", () => {
    const r = computeEqualWeightAttribution(0, 100, 200);
    expect(r).toEqual({ perWeight: 0, perUsage: 0, perValue: 0, totalWeight: 0 });
  });

  it("a single active contributor takes the whole weight and value", () => {
    const r = computeEqualWeightAttribution(1, 37, 99.5);
    expect(r.perWeight).toBe(1);
    expect(r.perUsage).toBe(37);
    expect(r.perValue).toBe(99.5);
    expect(r.totalWeight).toBe(1.0);
  });

  it("active weights always sum to the total weight (1.0) when any are active", () => {
    for (const n of [2, 3, 4, 7, 25]) {
      const r = computeEqualWeightAttribution(n, 0, 0);
      // Per-record weight × count ≈ total weight (rounding tolerated).
      expect(Math.abs(r.perWeight * n - r.totalWeight)).toBeLessThan(0.05);
      expect(r.totalWeight).toBe(1.0);
    }
  });

  it("value participation rounds to cents and is mock-only by construction", () => {
    const r = computeEqualWeightAttribution(3, 10, 100);
    expect(r.perValue).toBe(33.33);
    expect(r.perUsage).toBe(3); // round(10/3)
  });
});

describe("F-1323 k-anonymity count suppression (Founder ruling)", () => {
  it("buyer + contributor below the k-floor → suppressed", () => {
    expect(shouldSuppressCounts("buyer", 2, 50)).toBe(true);
    expect(shouldSuppressCounts("contributor", 2, 50)).toBe(true);
  });

  it("buyer + contributor at/above the k-floor → NOT suppressed", () => {
    expect(shouldSuppressCounts("buyer", 50, 50)).toBe(false);
    expect(shouldSuppressCounts("contributor", 51, 50)).toBe(false);
    expect(shouldSuppressCounts("buyer", 2, 2)).toBe(false);
  });

  it("provider + admin are NEVER suppressed (owner/operational visibility)", () => {
    expect(shouldSuppressCounts("provider", 2, 50)).toBe(false);
    expect(shouldSuppressCounts("admin", 1, 1000)).toBe(false);
  });
});
