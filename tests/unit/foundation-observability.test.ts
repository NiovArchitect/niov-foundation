// FILE: tests/unit/foundation-observability.test.ts (unit)
// PURPOSE: Phase 1293-A — locks the observability envelope (SAFE, no PII) and
//          the metering-enforcement evaluator (ALLOW / WARN / DENY boundaries).
// CONNECTS TO: apps/api/src/services/foundation/observability.service.ts.

import { describe, expect, it } from "vitest";
import { buildObservabilityEnvelope, evaluateMeterThreshold } from "@niov/api";

describe("buildObservabilityEnvelope — SAFE structured record", () => {
  it("carries correlation + safe refs only; never PII/content keys", () => {
    const env = buildObservabilityEnvelope({
      correlation_id: "corr-1",
      action: "MARKETPLACE_DATA_ACCESS_EVALUATED",
      outcome: "SUCCESS",
      latency_ms: 12,
      policy_decision: "ALLOW_MOCK",
      entity_ref: "ent-1",
      org_ref: "org-1",
      evaluatedAt: new Date("2026-06-18T00:00:00.000Z"),
    });
    expect(env.correlation_id).toBe("corr-1");
    expect(env.runtime).toBe("FOUNDATION_API");
    expect(env.outcome).toBe("SUCCESS");
    expect(env.entity_ref).toBe("ent-1");
    const serialized = JSON.stringify(env);
    for (const forbidden of ["email", "display_name", "password", "payload_content", "content_hash"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

describe("evaluateMeterThreshold — ALLOW / WARN / DENY", () => {
  it("ALLOW below the warn ratio", () => {
    const r = evaluateMeterThreshold(10, 100);
    expect(r.decision).toBe("ALLOW");
    expect(r.remaining).toBe(90);
  });
  it("WARN at or above 80% but below the limit", () => {
    expect(evaluateMeterThreshold(80, 100).decision).toBe("WARN");
    expect(evaluateMeterThreshold(99, 100).decision).toBe("WARN");
  });
  it("DENY at or above the limit", () => {
    expect(evaluateMeterThreshold(100, 100).decision).toBe("DENY");
    expect(evaluateMeterThreshold(150, 100).decision).toBe("DENY");
    expect(evaluateMeterThreshold(150, 100).remaining).toBe(0);
  });
  it("a zero/absent limit never DENYs a zero usage (ALLOW)", () => {
    expect(evaluateMeterThreshold(0, 0).decision).toBe("ALLOW");
  });
});
