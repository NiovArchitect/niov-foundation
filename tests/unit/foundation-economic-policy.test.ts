// FILE: tests/unit/foundation-economic-policy.test.ts (unit)
// PURPOSE: Phase 1290-A — locks the spend-policy evaluator (evaluateSpendPolicy):
//          mock-only by construction; human micro auto-allows; high value needs
//          dual-control; non-human actors (AI_AGENT/DEVICE/APPLICATION) NEVER
//          auto-originate (RULE 0 + ADR-0094 §8); per-transaction cap +
//          spend-limit deny; only MOCK_ONLY is executable (PROVIDER_DEFERRED /
//          FUTURE_ONCHAIN / DISABLED are honestly DENIED); real_provider_enabled
//          is always false.
// CONNECTS TO: apps/api/src/services/foundation/economic-policy.service.ts.

import { describe, expect, it } from "vitest";
import { evaluateSpendPolicy } from "@niov/api";
import type { EntityType } from "@niov/database";

function ev(over: Partial<Parameters<typeof evaluateSpendPolicy>[0]> = {}) {
  return evaluateSpendPolicy({
    entity_type: "PERSON" as EntityType,
    amount_usd: 0.5,
    purpose: "AGENT_TO_AGENT",
    settlement_mode: "MOCK_ONLY",
    ...over,
  });
}

describe("evaluateSpendPolicy — mock-only invariants", () => {
  it("always reports real_provider_enabled=false + a mock notice", () => {
    for (const m of ["MOCK_ONLY", "PROVIDER_DEFERRED", "FUTURE_ONCHAIN", "DISABLED"] as const) {
      const r = ev({ settlement_mode: m });
      expect(r.real_provider_enabled).toBe(false);
      expect(r.mock_notice).toMatch(/MOCK ONLY/);
    }
  });

  it("only MOCK_ONLY is executable; reserved modes are DENIED with honest reasons", () => {
    expect(ev({ settlement_mode: "DISABLED" }).reason_code).toBe("economic-substrate-disabled");
    expect(ev({ settlement_mode: "PROVIDER_DEFERRED" }).decision).toBe("DENIED");
    expect(ev({ settlement_mode: "PROVIDER_DEFERRED" }).reason_code).toMatch(/provider-not-selected/);
    expect(ev({ settlement_mode: "FUTURE_ONCHAIN" }).decision).toBe("DENIED");
    expect(ev({ settlement_mode: "FUTURE_ONCHAIN" }).reason_code).toMatch(/onchain/);
  });
});

describe("evaluateSpendPolicy — human amount tiers (MOCK_ONLY)", () => {
  it("a human microtransaction (<= $1) mock-allows with zero approvals", () => {
    const r = ev({ entity_type: "PERSON", amount_usd: 0.5 });
    expect(r.decision).toBe("ALLOW_MOCK");
    expect(r.required_approvals).toBe(0);
  });

  it("a mid-value human transaction needs one approval", () => {
    const r = ev({ entity_type: "PERSON", amount_usd: 500 });
    expect(r.decision).toBe("NEEDS_APPROVAL");
    expect(r.required_approvals).toBe(1);
  });

  it("a high-value human transaction (>= $1000) needs dual-control", () => {
    const r = ev({ entity_type: "PERSON", amount_usd: 1000 });
    expect(r.decision).toBe("NEEDS_APPROVAL");
    expect(r.required_approvals).toBe(2);
  });
});

describe("evaluateSpendPolicy — non-human actors never auto-originate", () => {
  it("AI_AGENT / DEVICE / APPLICATION micro still needs human approval", () => {
    for (const t of ["AI_AGENT", "DEVICE", "APPLICATION"] as const) {
      const r = ev({ entity_type: t, amount_usd: 0.5 });
      expect(r.decision).toBe("NEEDS_APPROVAL");
      expect(r.reason_code).toBe("non-human-actor-requires-human-approval");
      expect(r.required_approvals).toBeGreaterThanOrEqual(1);
    }
  });

  it("a non-human high-value request escalates to dual-control", () => {
    const r = ev({ entity_type: "AI_AGENT", amount_usd: 5000 });
    expect(r.decision).toBe("NEEDS_APPROVAL");
    expect(r.required_approvals).toBe(2);
  });
});

describe("evaluateSpendPolicy — caps + limits", () => {
  it("denies when the per-transaction cap is exceeded", () => {
    const r = ev({ entity_type: "PERSON", amount_usd: 50, per_transaction_cap: 10 });
    expect(r.decision).toBe("DENIED");
    expect(r.reason_code).toBe("per-transaction-cap-exceeded");
  });

  it("denies when cumulative spend would exceed the spend limit", () => {
    const r = ev({ entity_type: "PERSON", amount_usd: 0.5, spend_limit: 100, spent_so_far: 99.9 });
    expect(r.decision).toBe("DENIED");
    expect(r.reason_code).toBe("spend-limit-exceeded");
  });

  it("allows a microtransaction that stays within the spend limit", () => {
    const r = ev({ entity_type: "PERSON", amount_usd: 0.5, spend_limit: 100, spent_so_far: 1 });
    expect(r.decision).toBe("ALLOW_MOCK");
  });

  it("denies an out-of-bounds amount", () => {
    expect(ev({ amount_usd: 0 }).reason_code).toBe("amount-out-of-bounds");
    expect(ev({ amount_usd: -5 }).reason_code).toBe("amount-out-of-bounds");
    expect(ev({ amount_usd: 2_000_000 }).reason_code).toBe("amount-out-of-bounds");
  });
});
