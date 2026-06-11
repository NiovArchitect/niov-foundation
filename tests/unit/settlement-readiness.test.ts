// FILE: settlement-readiness.test.ts
// PURPOSE: Phase 1248 — locks the settlement preparation honesty:
//          the only executable rail is the clearly-labeled mock;
//          real rails are credential-blocked AND authorization-gated;
//          mock receipts can never masquerade as real settlement.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  listSettlementRails,
  mockSettle,
} from "../../apps/api/src/services/governance/settlement-readiness.service.js";

const ENV_KEYS = ["CIRCLE_API_KEY", "CDP_API_KEY_ID", "CDP_API_KEY_SECRET"];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("Phase 1248 — settlement rail readiness", () => {
  it("only the mock rail is executable; real rails are credential-blocked", () => {
    const rails = listSettlementRails();
    expect(rails.find((r) => r.rail === "MOCK_RAIL")?.status).toBe(
      "DEV_ONLY",
    );
    expect(rails.find((r) => r.rail === "CIRCLE_GATEWAY")?.status).toBe(
      "BLOCKED_BY_CREDENTIALS",
    );
    expect(rails.find((r) => r.rail === "COINBASE_BASE")?.status).toBe(
      "BLOCKED_BY_CREDENTIALS",
    );
  });

  it("credentials alone never authorize settlement — Founder authorization stays required", () => {
    process.env.CIRCLE_API_KEY = "test";
    const rails = listSettlementRails();
    const circle = rails.find((r) => r.rail === "CIRCLE_GATEWAY");
    expect(circle?.status).toBe("NOT_AUTHORIZED");
    expect(circle?.note).toContain("explicit Founder authorization");
  });

  it("mock receipts are unmistakably mock", () => {
    const receipt = mockSettle({ reference: "demo-1", amount_usd: 42 });
    expect(receipt.is_mock).toBe(true);
    expect(receipt.rail).toBe("MOCK_RAIL");
    expect(receipt.note).toContain("no funds moved");
  });

  it("rail notes use calm honest language, never implying live settlement", () => {
    for (const rail of listSettlementRails()) {
      expect(rail.note.length).toBeGreaterThan(10);
      expect(rail.note).not.toMatch(/live settlement enabled/i);
    }
  });
});
