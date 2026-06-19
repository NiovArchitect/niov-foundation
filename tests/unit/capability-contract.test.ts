// FILE: tests/unit/capability-contract.test.ts (unit)
// PURPOSE: F-1326 — lock the pure capability→contract derivation. Contracts only;
//          live_execution_enabled is always false; governance fields come from
//          trust_metadata with safe fallbacks (never invented).
// CONNECTS TO: apps/api/src/services/foundation/capability-contract.service.ts

import { describe, expect, it } from "vitest";
import {
  deriveCapabilityContract,
  type CapabilityContract,
} from "../../apps/api/src/services/foundation/capability-contract.service.js";
import type { MarketplaceListing } from "@niov/database";

function listing(overrides: Partial<MarketplaceListing> = {}): MarketplaceListing {
  return {
    listing_id: "cap-1",
    listing_type: "AGENT",
    provider_entity_id: "owner-1",
    provider_org_entity_id: "org-1",
    title: "t",
    description: "d",
    version: "1.0.0",
    pricing_model: { amount_usd: 0.25 },
    required_authority: ["READ"],
    required_memory_scope: ["PREFERENCE"],
    trust_metadata: {},
    status: "PUBLISHED",
    discovery_scope: "PRIVATE",
    created_at: new Date(0),
    updated_at: new Date(0),
    deleted_at: null,
    ...overrides,
  } as unknown as MarketplaceListing;
}

describe("F-1326 capability contract derivation", () => {
  it("derives a contract that NEVER enables live execution", () => {
    const c: CapabilityContract = deriveCapabilityContract(listing());
    expect(c.live_execution_enabled).toBe(false);
    expect(c.settlement_mode).toBe("MOCK_ONLY");
    expect(c.contract_id).toBe("contract:listing:cap-1");
    expect(c.capability_id).toBe("cap-1");
    expect(c.owner_entity_id).toBe("owner-1");
    expect(c.status).toBe("PUBLISHED");
  });

  it("reads governance from trust_metadata", () => {
    const c = deriveCapabilityContract(
      listing({
        trust_metadata: {
          callable_modes: ["GOVERNED_INVOKE"],
          allowed_inputs: ["TEXT"],
          allowed_outputs: ["JSON"],
          proof_required: true,
          consent_required: true,
          metering_unit: "invocation",
          mock_price_usd: 0.5,
          policy_summary: "scoped",
        } as never,
      }),
    );
    expect(c.callable_modes).toEqual(["GOVERNED_INVOKE"]);
    expect(c.allowed_inputs).toEqual(["TEXT"]);
    expect(c.allowed_outputs).toEqual(["JSON"]);
    expect(c.proof_required).toBe(true);
    expect(c.consent_required).toBe(true);
    expect(c.metering_unit).toBe("invocation");
    expect(c.mock_price).toBe(0.5);
    expect(c.access_policy.policy_summary).toBe("scoped");
    expect(c.access_policy.required_authority).toEqual(["READ"]);
  });

  it("falls back safely (allowed_inputs←allowed_uses; mock_price←pricing_model); never invents", () => {
    const c = deriveCapabilityContract(listing({ trust_metadata: { allowed_uses: ["ANALYTICS"] } as never }));
    expect(c.allowed_inputs).toEqual(["ANALYTICS"]); // fallback to allowed_uses
    expect(c.allowed_outputs).toEqual([]); // not declared → empty, not invented
    expect(c.proof_required).toBe(false);
    expect(c.metering_unit).toBeNull();
    expect(c.mock_price).toBe(0.25); // from pricing_model.amount_usd
  });
});
