// FILE: tests/unit/avp2-resource-contract.test.ts (unit)
// PURPOSE: F-1329 — lock the AVP² resource-contract derivation. Quotable, mock-
//          only, live access disabled; NEVER carries content; license/training
//          fields explicit; per-resource overrides honored.
// CONNECTS TO: apps/api/src/services/foundation/avp2-resource-contract.service.ts

import { describe, expect, it } from "vitest";
import {
  deriveResourceContracts,
  type Avp2ResourceContract,
} from "../../apps/api/src/services/foundation/avp2-resource-contract.service.js";
import type { MarketplaceListing } from "@niov/database";

function listing(overrides: Partial<MarketplaceListing> = {}): MarketplaceListing {
  return {
    listing_id: "lst-1",
    listing_type: "SERVICE",
    provider_entity_id: "owner-1",
    provider_org_entity_id: "org-1",
    title: "Publisher",
    description: "d",
    version: "1.0.0",
    pricing_model: { amount_usd: 0.1 },
    required_authority: [],
    required_memory_scope: [],
    trust_metadata: {},
    status: "PUBLISHED",
    discovery_scope: "PRIVATE",
    created_at: new Date(0),
    updated_at: new Date(1000),
    deleted_at: null,
    ...overrides,
  } as unknown as MarketplaceListing;
}

// Every forbidden content key must be absent from a resource contract.
const CONTENT_KEYS = ["content", "body", "fragment", "payload", "text", "raw"];
function assertNoContent(c: Avp2ResourceContract): void {
  const json = JSON.stringify(c);
  for (const k of CONTENT_KEYS) expect(json.includes(`"${k}"`)).toBe(false);
}

describe("F-1329 AVP² resource contract derivation", () => {
  it("listing with no declared resources → a single listing-level quotable contract", () => {
    const [c] = deriveResourceContracts(listing());
    expect(c?.resource_contract_id).toBe("resource:listing:lst-1");
    expect(c?.resource_id).toBe("lst-1");
    expect(c?.quote_required).toBe(true);
    expect(c?.proof_required).toBe(true);
    expect(c?.settlement_mode).toBe("MOCK_ONLY");
    expect(c?.live_access_enabled).toBe(false);
    if (c !== undefined) assertNoContent(c);
  });

  it("AVP² defaults: quote_required + proof_required true, training false, mock-only", () => {
    const [c] = deriveResourceContracts(listing({ trust_metadata: {} as never }));
    expect(c?.quote_required).toBe(true);
    expect(c?.proof_required).toBe(true);
    expect(c?.training_allowed).toBe(false);
    expect(c?.redistribution_allowed).toBe(false);
    expect(c?.commercial_ai_allowed).toBe(false);
    expect(c?.mock_price_floor).toBe(0.1); // from pricing_model
  });

  it("declared resources[] → one contract per entry with overrides; license explicit", () => {
    const cs = deriveResourceContracts(listing({
      trust_metadata: {
        license_terms: "CC-Default",
        training_allowed: false,
        resources: [
          { resource_id: "book-demo.ch7", resource_type: "CONTENT_FRAGMENT", title: "Chapter 7", selector_support: ["paragraph_range"], license_terms: "Licensed-Excerpt", mock_price_floor: 0.01, mock_price_ceiling: 0.05 },
          { resource_id: "book-demo.ch8", resource_type: "CONTENT_FRAGMENT", training_allowed: true },
        ],
      } as never,
    }));
    expect(cs.length).toBe(2);
    expect(cs[0]?.resource_id).toBe("book-demo.ch7");
    expect(cs[0]?.resource_type).toBe("CONTENT_FRAGMENT");
    expect(cs[0]?.selector_support).toEqual(["paragraph_range"]);
    expect(cs[0]?.license_terms).toBe("Licensed-Excerpt"); // per-resource override
    expect(cs[0]?.mock_price_floor).toBe(0.01);
    expect(cs[0]?.mock_price_ceiling).toBe(0.05);
    expect(cs[1]?.license_terms).toBe("CC-Default"); // inherits listing-level
    expect(cs[1]?.training_allowed).toBe(true); // per-resource override
    for (const c of cs) assertNoContent(c);
  });

  it("NEVER carries content even when trust_metadata resources include bodies", () => {
    const cs = deriveResourceContracts(listing({
      trust_metadata: { resources: [{ resource_id: "x", body: "secret paragraph text", content: "raw" }] } as never,
    }));
    for (const c of cs) assertNoContent(c);
  });
});
