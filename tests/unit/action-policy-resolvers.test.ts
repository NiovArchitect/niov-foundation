// FILE: tests/unit/action-policy-resolvers.test.ts
// PURPOSE: Unit-tier coverage for the Wave 6 LOCK-GAP-1 / LOCK-GAP-2
//          resolver helpers (resolveRetryBudget +
//          resolveAttemptTimeoutMs). Proves the override-vs-fallback
//          semantics in isolation so the executor consumes them with
//          confidence.
// CONNECTS TO: apps/api/src/services/action/lifecycle.service.ts;
//              ADR-0057 Wave 6.

import { describe, expect, it } from "vitest";

import {
  ATTEMPT_TIMEOUT_MS_DEFAULT,
  RETRY_BUDGET,
  resolveAttemptTimeoutMs,
  resolveRetryBudget,
} from "../../apps/api/src/services/action/lifecycle.service.js";

describe("resolveRetryBudget (ADR-0057 Wave 6 LOCK-GAP-1)", () => {
  it("returns the service-tier RETRY_BUDGET constant when actionPolicy is null", () => {
    const resolved = resolveRetryBudget(null, "RECORD_CAPSULE");
    expect(resolved).toBe(RETRY_BUDGET.RECORD_CAPSULE);
  });

  it("returns the service-tier RETRY_BUDGET constant when actionPolicy is undefined", () => {
    const resolved = resolveRetryBudget(undefined, "RECORD_CAPSULE");
    expect(resolved).toBe(RETRY_BUDGET.RECORD_CAPSULE);
  });

  it("returns the service-tier RETRY_BUDGET constant when retry_budget is null", () => {
    const resolved = resolveRetryBudget(
      { retry_budget: null },
      "PROPOSE_PERMISSION_GRANT",
    );
    expect(resolved).toBe(RETRY_BUDGET.PROPOSE_PERMISSION_GRANT);
  });

  it("honors a positive retry_budget override", () => {
    const resolved = resolveRetryBudget(
      { retry_budget: 1 },
      "RECORD_CAPSULE",
    );
    expect(resolved).toBe(1);
  });

  it("honors a larger positive retry_budget override (above constant)", () => {
    const constant = RETRY_BUDGET.RECORD_CAPSULE;
    const resolved = resolveRetryBudget(
      { retry_budget: constant + 5 },
      "RECORD_CAPSULE",
    );
    expect(resolved).toBe(constant + 5);
  });

  it("falls back to the constant when retry_budget is zero (non-positive guard)", () => {
    const resolved = resolveRetryBudget(
      { retry_budget: 0 },
      "RECORD_CAPSULE",
    );
    expect(resolved).toBe(RETRY_BUDGET.RECORD_CAPSULE);
  });

  it("falls back to the constant when retry_budget is negative (non-positive guard)", () => {
    const resolved = resolveRetryBudget(
      { retry_budget: -3 },
      "RECORD_CAPSULE",
    );
    expect(resolved).toBe(RETRY_BUDGET.RECORD_CAPSULE);
  });
});

describe("resolveAttemptTimeoutMs (ADR-0057 Wave 6 LOCK-GAP-2)", () => {
  it("returns ATTEMPT_TIMEOUT_MS_DEFAULT when actionPolicy is null", () => {
    expect(resolveAttemptTimeoutMs(null)).toBe(ATTEMPT_TIMEOUT_MS_DEFAULT);
  });

  it("returns ATTEMPT_TIMEOUT_MS_DEFAULT when actionPolicy is undefined", () => {
    expect(resolveAttemptTimeoutMs(undefined)).toBe(
      ATTEMPT_TIMEOUT_MS_DEFAULT,
    );
  });

  it("returns ATTEMPT_TIMEOUT_MS_DEFAULT when attempt_timeout_ms_override is null", () => {
    expect(
      resolveAttemptTimeoutMs({ attempt_timeout_ms_override: null }),
    ).toBe(ATTEMPT_TIMEOUT_MS_DEFAULT);
  });

  it("honors a positive attempt_timeout_ms_override (shorter than default)", () => {
    expect(
      resolveAttemptTimeoutMs({ attempt_timeout_ms_override: 5_000 }),
    ).toBe(5_000);
  });

  it("honors a positive attempt_timeout_ms_override (longer than default)", () => {
    expect(
      resolveAttemptTimeoutMs({ attempt_timeout_ms_override: 60_000 }),
    ).toBe(60_000);
  });

  it("falls back to default when attempt_timeout_ms_override is zero (non-positive guard)", () => {
    expect(
      resolveAttemptTimeoutMs({ attempt_timeout_ms_override: 0 }),
    ).toBe(ATTEMPT_TIMEOUT_MS_DEFAULT);
  });

  it("falls back to default when attempt_timeout_ms_override is negative (non-positive guard)", () => {
    expect(
      resolveAttemptTimeoutMs({ attempt_timeout_ms_override: -100 }),
    ).toBe(ATTEMPT_TIMEOUT_MS_DEFAULT);
  });
});
