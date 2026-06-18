// FILE: tests/unit/foundation-retention-policy.test.ts (unit)
// PURPOSE: Phase 1298-A — locks the PURE retention evaluator: known retention
//          kinds parse; unknown/UNTIL_REVOKED on high-sensitivity fail closed;
//          missing retention on high-sensitivity DEFAULT-APPLIES a finite window
//          (not deny — 1296-A keeps HEALTH grantable); past expiry denied; the
//          window is capped (90d) and never outlives a governing review;
//          standard packages may be until-revoked (null).
// CONNECTS TO: apps/api/src/services/foundation/retention-policy.service.ts.

import { describe, expect, it } from "vitest";
import {
  evaluateRetentionPolicy,
  computeExpiryFromRetentionPolicy,
  normalizeRetentionPolicy,
} from "@niov/api";

const NOW = new Date("2026-06-17T00:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

function ev(over: Partial<Parameters<typeof evaluateRetentionPolicy>[0]> = {}) {
  return evaluateRetentionPolicy({
    retention_policy: null,
    sensitivity_class: "HIGH_SENSITIVITY",
    sensitive_categories: ["HEALTH"],
    now: NOW,
    ...over,
  });
}

describe("normalizeRetentionPolicy", () => {
  it("accepts known kinds (case/space-insensitive)", () => {
    expect(normalizeRetentionPolicy("THIRTY_DAYS")).toBe("THIRTY_DAYS");
    expect(normalizeRetentionPolicy("  seven_days ")).toBe("SEVEN_DAYS");
    expect(normalizeRetentionPolicy("UNTIL_REVOKED")).toBe("UNTIL_REVOKED");
  });
  it("returns null for absent/empty and UNKNOWN for unrecognized", () => {
    expect(normalizeRetentionPolicy(null)).toBeNull();
    expect(normalizeRetentionPolicy("")).toBeNull();
    expect(normalizeRetentionPolicy("forever")).toBe("UNKNOWN");
  });
});

describe("computeExpiryFromRetentionPolicy", () => {
  it("computes finite windows", () => {
    expect(computeExpiryFromRetentionPolicy("ONE_DAY", NOW)!.getTime()).toBe(NOW.getTime() + DAY);
    expect(computeExpiryFromRetentionPolicy("SEVEN_DAYS", NOW)!.getTime()).toBe(NOW.getTime() + 7 * DAY);
    expect(computeExpiryFromRetentionPolicy("THIRTY_DAYS", NOW)!.getTime()).toBe(NOW.getTime() + 30 * DAY);
    expect(computeExpiryFromRetentionPolicy("UNTIL_REVOKED", NOW)).toBeNull();
  });
});

describe("evaluateRetentionPolicy — high-sensitivity is always finite", () => {
  it("missing retention DEFAULT-APPLIES a finite window (not deny)", () => {
    const d = ev({ retention_policy: null });
    expect(d.allowed).toBe(true);
    expect(d.applied_default).toBe(true);
    expect(d.requires_finite_expiry).toBe(true);
    expect(d.expires_at).not.toBeNull();
    expect(d.reason_codes).toContain("RETENTION_DEFAULT_APPLIED");
  });

  it("UNTIL_REVOKED is denied for high-sensitivity", () => {
    const d = ev({ retention_policy: "UNTIL_REVOKED" });
    expect(d.allowed).toBe(false);
    expect(d.reason_codes).toContain("RETENTION_UNTIL_REVOKED_NOT_ALLOWED");
  });

  it("an unknown retention string is denied for high-sensitivity", () => {
    const d = ev({ retention_policy: "forever" });
    expect(d.allowed).toBe(false);
    expect(d.reason_codes).toContain("RETENTION_POLICY_UNKNOWN");
  });

  it("a window beyond the 90d ceiling is denied (ONE_YEAR)", () => {
    const d = ev({ retention_policy: "ONE_YEAR" });
    expect(d.allowed).toBe(false);
    expect(d.reason_codes).toContain("RETENTION_TOO_LONG_FOR_SENSITIVITY");
  });

  it("a past explicit expiry is denied", () => {
    const d = ev({ explicit_expires_at: new Date(NOW.getTime() - DAY).toISOString() });
    expect(d.allowed).toBe(false);
    expect(d.reason_codes).toContain("RETENTION_EXPIRES_AT_IN_PAST");
  });

  it("HEALTH / MEDICAL / BIOMETRIC all require finite expiry", () => {
    for (const cat of ["HEALTH", "MEDICAL", "BIOMETRIC"]) {
      const d = ev({ sensitive_categories: [cat], retention_policy: "SEVEN_DAYS" });
      expect(d.allowed).toBe(true);
      expect(d.requires_finite_expiry).toBe(true);
      expect(d.expires_at).not.toBeNull();
    }
  });

  it("never outlives a governing review (caps to review expiry)", () => {
    const reviewExp = new Date(NOW.getTime() + 5 * DAY);
    const d = ev({ retention_policy: "THIRTY_DAYS", review_expires_at: reviewExp });
    expect(d.allowed).toBe(true);
    expect(d.expires_at).toBe(reviewExp.toISOString());
  });
});

describe("evaluateRetentionPolicy — standard sensitivity", () => {
  it("missing retention is until-revoked (null expiry), allowed", () => {
    const d = ev({ sensitivity_class: "STANDARD", sensitive_categories: [], retention_policy: null });
    expect(d.allowed).toBe(true);
    expect(d.expires_at).toBeNull();
    expect(d.requires_finite_expiry).toBe(false);
  });

  it("a finite retention applies its window", () => {
    const d = ev({ sensitivity_class: "STANDARD", sensitive_categories: [], retention_policy: "SEVEN_DAYS" });
    expect(d.allowed).toBe(true);
    expect(d.expires_at).toBe(new Date(NOW.getTime() + 7 * DAY).toISOString());
  });

  it("UNTIL_REVOKED is allowed for standard", () => {
    const d = ev({ sensitivity_class: "STANDARD", sensitive_categories: [], retention_policy: "UNTIL_REVOKED" });
    expect(d.allowed).toBe(true);
    expect(d.expires_at).toBeNull();
  });
});
