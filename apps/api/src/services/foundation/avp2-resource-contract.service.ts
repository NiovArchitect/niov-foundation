// FILE: avp2-resource-contract.service.ts
// PURPOSE: F-1329 — AVP² (Agent Verification & Payment Protocol) Resource Contract
//          Projection. Foundation's first AVP² substrate: object-level, QUOTABLE
//          resource contracts derived from a MarketplaceListing + its
//          trust_metadata + capability-contract governance.
//
//          A capability contract says HOW a capability may be called. A resource
//          contract says WHAT quotable object-level resources a listing exposes
//          (book fragment, article block, data object, dataset slice, API result,
//          Memory Capsule projection, DMW object, tool/service/device/world action)
//          and under WHAT license + governance an agent may QUOTE for governed
//          access.
//
//          PROJECTION ONLY. No live delivery, no payment, no execution, no
//          scraping. No raw content, no content bodies, no fragment bodies, no
//          payloads — a resource contract NEVER carries the resource's content.
//          Derived read-only from existing substrate; no new schema.
//
//          Core AVP² doctrine: the agent does not scrape the website — the agent
//          asks for a quote. This projection is what an agent quotes against.
//
// CONNECTS TO: packages/database (MarketplaceListing) + auth.service +
//              governance/org + capability-contract.service (deriveCapabilityContract)
//              + apps/api/src/routes/foundation.routes.ts.
//
// SAFETY: visible to the listing's provider or same-org viewers of a PUBLISHED
// listing; enumeration-safe LISTING_NOT_FOUND. Mock-only settlement; live access
// disabled.

import { prisma, type MarketplaceListing } from "@niov/database";
import type { AuthService } from "../auth.service.js";
import { getOrgEntityId } from "../governance/org.js";
import { deriveCapabilityContract } from "./capability-contract.service.js";

export interface Avp2ResourceContract {
  resource_contract_id: string;
  listing_id: string;
  provider_entity_id: string;
  resource_type: string;
  resource_id: string;
  title: string;
  description: string;
  selector_support: string[];
  metering_unit: string | null;
  quote_required: boolean;
  proof_required: boolean;
  consent_required: boolean;
  license_terms: string | null;
  allowed_uses: string[];
  training_allowed: boolean;
  retention_policy: string | null;
  redistribution_allowed: boolean;
  commercial_ai_allowed: boolean;
  access_modes: string[];
  mock_price_floor: number | null;
  mock_price_ceiling: number | null;
  settlement_mode: "MOCK_ONLY";
  live_access_enabled: false;
  created_at: string;
  updated_at: string;
}

export interface Avp2ResourceContractsView {
  listing_id: string;
  resource_contracts: Avp2ResourceContract[];
  note: string;
  generated_at: string;
}

export type GetResourceContractsResult =
  | { ok: true; contracts: Avp2ResourceContractsView }
  | { ok: false; code: string };

const RESOURCE_CAP = 100;

function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}
function boolOr(v: unknown, dflt: boolean): boolean {
  return typeof v === "boolean" ? v : dflt;
}
function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
function rec(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

// WHAT: derive AVP² resource contracts for a listing.
// INPUT: the listing. OUTPUT: one contract per declared trust_metadata.resources
//        entry, or a single listing-level contract when none are declared.
// WHY: pure + unit-testable; the single source of the F-1329 projection. NEVER
//      reads or returns resource content — only governance/quote metadata.
export function deriveResourceContracts(listing: MarketplaceListing): Avp2ResourceContract[] {
  const tm = rec(listing.trust_metadata);
  const cap = deriveCapabilityContract(listing); // reuse callable-mode + price + policy
  const createdIso = listing.created_at.toISOString();
  const updatedIso = (listing.updated_at ?? listing.created_at).toISOString();

  // Listing-level governance defaults (object-level entries may override).
  const base = {
    listing_id: listing.listing_id,
    provider_entity_id: listing.provider_entity_id,
    metering_unit: cap.metering_unit,
    quote_required: boolOr(tm.quote_required, true), // AVP² default: quote first
    proof_required: boolOr(tm.proof_required, true), // AVP² default: prove access
    consent_required: cap.consent_required,
    license_terms: strOrNull(tm.license_terms),
    allowed_uses: strArr(tm.allowed_uses),
    training_allowed: boolOr(tm.training_allowed, false),
    retention_policy: strOrNull(tm.retention_policy),
    redistribution_allowed: boolOr(tm.redistribution_allowed, false),
    commercial_ai_allowed: boolOr(tm.commercial_ai_allowed, false),
    access_modes: strArr(tm.access_modes).length > 0 ? strArr(tm.access_modes) : cap.callable_modes,
    mock_price_floor: numOrNull(tm.mock_price_floor) ?? cap.mock_price,
    mock_price_ceiling: numOrNull(tm.mock_price_ceiling) ?? cap.mock_price,
    settlement_mode: "MOCK_ONLY" as const,
    live_access_enabled: false as const,
    created_at: createdIso,
    updated_at: updatedIso,
  };

  const declared = Array.isArray(tm.resources) ? (tm.resources as unknown[]).slice(0, RESOURCE_CAP) : [];
  if (declared.length === 0) {
    // A single listing-level resource contract.
    return [{
      resource_contract_id: `resource:listing:${listing.listing_id}`,
      resource_type: listing.listing_type,
      resource_id: listing.listing_id,
      title: listing.title,
      description: listing.description,
      selector_support: strArr(tm.selector_support),
      ...base,
    }];
  }

  return declared.map((entryRaw, i) => {
    const e = rec(entryRaw);
    const rid = strOrNull(e.resource_id) ?? `${listing.listing_id}:${i}`;
    return {
      resource_contract_id: `resource:listing:${listing.listing_id}:${rid}`,
      resource_type: strOrNull(e.resource_type) ?? listing.listing_type,
      resource_id: rid,
      title: strOrNull(e.title) ?? listing.title,
      description: strOrNull(e.description) ?? listing.description,
      selector_support: strArr(e.selector_support).length > 0 ? strArr(e.selector_support) : strArr(tm.selector_support),
      ...base,
      // Per-resource overrides (only when explicitly declared).
      metering_unit: strOrNull(e.metering_unit) ?? base.metering_unit,
      license_terms: strOrNull(e.license_terms) ?? base.license_terms,
      allowed_uses: strArr(e.allowed_uses).length > 0 ? strArr(e.allowed_uses) : base.allowed_uses,
      training_allowed: typeof e.training_allowed === "boolean" ? e.training_allowed : base.training_allowed,
      redistribution_allowed: typeof e.redistribution_allowed === "boolean" ? e.redistribution_allowed : base.redistribution_allowed,
      commercial_ai_allowed: typeof e.commercial_ai_allowed === "boolean" ? e.commercial_ai_allowed : base.commercial_ai_allowed,
      mock_price_floor: numOrNull(e.mock_price_floor) ?? base.mock_price_floor,
      mock_price_ceiling: numOrNull(e.mock_price_ceiling) ?? base.mock_price_ceiling,
    };
  });
}

export class Avp2ResourceContractService {
  constructor(private readonly authService: AuthService) {}

  private async callerOrgOrNull(entityId: string): Promise<string | null> {
    try {
      const org = await getOrgEntityId(entityId);
      return org === entityId ? null : org;
    } catch {
      return null;
    }
  }

  // WHAT: AVP² resource contracts for a listing the caller can see.
  // INPUT: session token + listing_id. OUTPUT: derived quotable contracts.
  // WHY: GET .../marketplace/listings/:listing_id/resource-contracts.
  async getResourceContractsForCaller(
    sessionToken: string,
    listingId: string,
  ): Promise<GetResourceContractsResult> {
    const v = await this.authService.validateSession(sessionToken, "read");
    if (!v.valid) return { ok: false, code: v.code };

    const listing = await prisma.marketplaceListing.findFirst({
      where: { listing_id: listingId, deleted_at: null },
    });
    if (listing === null) return { ok: false, code: "LISTING_NOT_FOUND" };

    const orgEntityId = await this.callerOrgOrNull(v.entity_id);
    const isProvider = listing.provider_entity_id === v.entity_id;
    const isPublishedSameOrg =
      listing.status === "PUBLISHED" &&
      listing.provider_org_entity_id !== null &&
      listing.provider_org_entity_id === orgEntityId;
    if (!isProvider && !isPublishedSameOrg) return { ok: false, code: "LISTING_NOT_FOUND" };

    return {
      ok: true,
      contracts: {
        listing_id: listing.listing_id,
        resource_contracts: deriveResourceContracts(listing),
        note:
          "AVP² resource contracts are quotable governance projections — the " +
          "agent does not scrape, it asks for a quote. Contracts only: no live " +
          "access, no delivery, no payment, no content. Economics are mock-only.",
        generated_at: new Date().toISOString(),
      },
    };
  }
}
