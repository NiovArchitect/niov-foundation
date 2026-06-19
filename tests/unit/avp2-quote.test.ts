// FILE: tests/unit/avp2-quote.test.ts (unit)
// PURPOSE: F-1330 — lock the AVP² quote-intent pure logic: deterministic mock
//          pricing (floor × quantity; ceiling fallback; null when unpriced) and
//          the auth gate (an invalid session short-circuits before any DB work).
// CONNECTS TO: apps/api/src/services/foundation/avp2-quote.service.ts

import { describe, expect, it } from "vitest";
import {
  Avp2QuoteService,
  deterministicMockPrice,
} from "../../apps/api/src/services/foundation/avp2-quote.service.js";
import type { Avp2ResourceContract } from "../../apps/api/src/services/foundation/avp2-resource-contract.service.js";
import type { AuthService } from "../../apps/api/src/services/auth.service.js";

function contract(overrides: Partial<Avp2ResourceContract> = {}): Avp2ResourceContract {
  return {
    resource_contract_id: "resource:listing:lst-1:r1",
    listing_id: "lst-1",
    provider_entity_id: "owner-1",
    resource_type: "CONTENT_FRAGMENT",
    resource_id: "r1",
    title: "T",
    description: "d",
    selector_support: [],
    metering_unit: null,
    quote_required: true,
    proof_required: true,
    consent_required: false,
    license_terms: null,
    allowed_uses: [],
    training_allowed: false,
    retention_policy: null,
    redistribution_allowed: false,
    commercial_ai_allowed: false,
    access_modes: [],
    mock_price_floor: null,
    mock_price_ceiling: null,
    settlement_mode: "MOCK_ONLY",
    live_access_enabled: false,
    created_at: "1970-01-01T00:00:00.000Z",
    updated_at: "1970-01-01T00:00:01.000Z",
    ...overrides,
  };
}

describe("F-1330 AVP² quote — deterministic mock pricing", () => {
  it("floor × quantity is the canonical unit price", () => {
    expect(deterministicMockPrice(contract({ mock_price_floor: 0.01 }), 1)).toBe(0.01);
    expect(deterministicMockPrice(contract({ mock_price_floor: 0.01 }), 5)).toBe(0.05);
  });

  it("falls back to ceiling when floor is null", () => {
    expect(deterministicMockPrice(contract({ mock_price_floor: null, mock_price_ceiling: 0.2 }), 3)).toBeCloseTo(0.6);
  });

  it("unpriced contract → null amount (still quotable, mock-only)", () => {
    expect(deterministicMockPrice(contract(), 4)).toBe(null);
  });

  it("pricing is deterministic — same inputs, same output across calls", () => {
    const c = contract({ mock_price_floor: 0.03 });
    expect(deterministicMockPrice(c, 7)).toBe(deterministicMockPrice(c, 7));
  });
});

describe("F-1330 AVP² quote — auth gate short-circuits before any DB work", () => {
  it("an invalid session returns the auth code and never touches the listing", async () => {
    const fakeAuth = {
      validateSession: async () => ({ valid: false as const, code: "SESSION_EXPIRED" as const }),
    } as unknown as AuthService;
    const svc = new Avp2QuoteService(fakeAuth);
    const result = await svc.createQuoteForCaller("bad-token", {
      resource_request: { listing_id: "lst-1", resource_id: "r1" },
      intended_use: "reading",
    });
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.code).toBe("SESSION_EXPIRED");
  });
});
