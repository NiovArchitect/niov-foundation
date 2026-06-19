// FILE: capability-contract.service.ts
// PURPOSE: F-1326 — Callable Capability Contracts. The call-contract layer over
//          the capability registry: HOW a capability may be invoked under
//          governance — callable modes, allowed inputs/outputs, proof/consent
//          requirements, metering unit, mock price, and access policy.
//
//          CONTRACTS ONLY. NO live execution, NO invocation, NO secrets, NO real
//          settlement. A contract is a read-time PROJECTION derived from the
//          capability (a MarketplaceListing, per FC-1318) and its trust_metadata
//          governance block — there is NO new schema and nothing is executed.
//
// CONNECTS TO: packages/database (MarketplaceListing) + auth.service +
//              governance/org + apps/api/src/routes/foundation.routes.ts
//              (GET /marketplace/listings/:listing_id/contracts).
//
// SAFETY: visible to anyone who can see the capability (own, or PUBLISHED in the
// caller's org) — enumeration-safe LISTING_NOT_FOUND otherwise. No raw payloads,
// no execution endpoints, no secrets.

import { prisma, type MarketplaceListing } from "@niov/database";
import type { AuthService } from "../auth.service.js";
import { getOrgEntityId } from "../governance/org.js";

export interface CapabilityContract {
  contract_id: string;
  capability_id: string;
  owner_entity_id: string;
  callable_modes: string[];
  allowed_inputs: string[];
  allowed_outputs: string[];
  proof_required: boolean;
  consent_required: boolean;
  metering_unit: string | null;
  mock_price: number | null;
  access_policy: {
    required_authority: string[];
    required_memory_scope: string[];
    policy_summary: string | null;
  };
  settlement_mode: "MOCK_ONLY";
  // Explicit governance marker: contracts describe invocation; they never execute.
  live_execution_enabled: false;
  status: string;
}

export interface CapabilityContractsView {
  capability_id: string;
  contracts: CapabilityContract[];
  note: string;
  generated_at: string;
}

export type GetCapabilityContractsResult =
  | { ok: true; contracts: CapabilityContractsView }
  | { ok: false; code: string };

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
function pricingAmountUsd(pricing: unknown): number | null {
  if (pricing !== null && typeof pricing === "object") {
    const v = (pricing as Record<string, unknown>).amount_usd;
    if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  }
  return null;
}

// Derive the call contract for a capability from its listing + trust_metadata.
export function deriveCapabilityContract(listing: MarketplaceListing): CapabilityContract {
  const tm = listing.trust_metadata !== null && typeof listing.trust_metadata === "object"
    ? (listing.trust_metadata as Record<string, unknown>)
    : {};
  return {
    contract_id: `contract:listing:${listing.listing_id}`,
    capability_id: listing.listing_id,
    owner_entity_id: listing.provider_entity_id,
    callable_modes: strArr(tm.callable_modes),
    // allowed_inputs/outputs come from trust_metadata when the provider declared
    // them; allowed_uses is a sensible fallback for inputs. Never invented.
    allowed_inputs: strArr(tm.allowed_inputs).length > 0 ? strArr(tm.allowed_inputs) : strArr(tm.allowed_uses),
    allowed_outputs: strArr(tm.allowed_outputs),
    proof_required: boolOr(tm.proof_required, false),
    consent_required: boolOr(tm.consent_required, false),
    metering_unit: strOrNull(tm.metering_unit),
    mock_price: numOrNull(tm.mock_price_usd) ?? pricingAmountUsd(listing.pricing_model),
    access_policy: {
      required_authority: listing.required_authority,
      required_memory_scope: listing.required_memory_scope,
      policy_summary: strOrNull(tm.policy_summary),
    },
    settlement_mode: "MOCK_ONLY",
    live_execution_enabled: false,
    status: listing.status,
  };
}

export class CapabilityContractService {
  constructor(private readonly authService: AuthService) {}

  private async callerOrgOrNull(entityId: string): Promise<string | null> {
    try {
      const org = await getOrgEntityId(entityId);
      return org === entityId ? null : org;
    } catch {
      return null;
    }
  }

  // WHAT: the call contract(s) for a capability the caller can see.
  // INPUT: session token + listing_id (the capability).
  // OUTPUT: derived governance contract(s). WHY: GET .../listings/:id/contracts.
  async getContractsForCaller(
    sessionToken: string,
    listingId: string,
  ): Promise<GetCapabilityContractsResult> {
    const v = await this.authService.validateSession(sessionToken, "read");
    if (!v.valid) return { ok: false, code: v.code };

    const listing = await prisma.marketplaceListing.findFirst({
      where: { listing_id: listingId, deleted_at: null },
    });
    if (listing === null) return { ok: false, code: "LISTING_NOT_FOUND" };

    // Visible to its provider, or when PUBLISHED in the caller's org. Mirrors
    // getListingForCaller's visibility (enumeration-safe).
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
        capability_id: listing.listing_id,
        contracts: [deriveCapabilityContract(listing)],
        note:
          "Call contracts describe how a capability may be invoked under " +
          "governance. Contracts only — no live execution, no invocation, no " +
          "secrets, no real settlement. Economics are mock-only.",
        generated_at: new Date().toISOString(),
      },
    };
  }
}
