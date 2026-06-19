// FILE: avp2-quote.service.ts
// PURPOSE: F-1330 — AVP² (Agent Verification & Payment Protocol) Quote Intent
//          Layer. The first step of the AVP² loop: an agent does not scrape the
//          website — it asks for a QUOTE. Given a resource contract (F-1329), an
//          agent requests a quote; Foundation resolves the specific resource's
//          governance + a MOCK price and returns a time-boxed, point-in-time
//          offer. The quote is recorded as an append-only AVP2_QUOTE_CREATED
//          ledger event (no new schema) so the accept (F-1331) and access
//          (F-1332) steps can reconstruct the exact offer by quote_id.
//
//          INTENT ONLY. A quote is a non-committal price + policy disclosure. It
//          is NOT a charge, NOT a grant, NOT delivery, NOT execution. Economics
//          are MOCK-ONLY. No raw content, no content bodies, no fragment bodies,
//          no payloads — a quote NEVER carries the resource's content, only its
//          governance + a mock price.
//
//          Per-resource_id policy resolution with HARD denials: the quote is for
//          a SPECIFIC resource_id; a resource_id matching no derived contract is
//          denied (RESOURCE_NOT_FOUND). There is NO listing-level fall-back when
//          a resource_id is supplied. Pricing + policy are DETERMINISTIC from the
//          resource contract; the only time-derived value is expires_at.
//
// CONNECTS TO: avp2-resource-contract.service (deriveResourceContracts) +
//              auth.service + governance/org + packages/database (writeAuditEvent,
//              MarketplaceListing) + apps/api/src/routes/foundation.routes.ts.
//
// SAFETY: quote is visible to the listing's provider or same-org viewers of a
// PUBLISHED listing; enumeration-safe LISTING_NOT_FOUND / RESOURCE_NOT_FOUND.
// RULE 4 — the AVP2_QUOTE_CREATED audit event is written BEFORE the response.
// Mock-only settlement; live access disabled. Audit details carry governance +
// mock price only — never content.

import { randomUUID } from "node:crypto";
import { prisma, writeAuditEvent } from "@niov/database";
import type { AuthService } from "../auth.service.js";
import { getOrgEntityId } from "../governance/org.js";
import {
  deriveResourceContracts,
  type Avp2ResourceContract,
} from "./avp2-resource-contract.service.js";

// WHAT: How long a quote remains valid before it must be re-requested.
// WHY: A quote is a point-in-time offer; a short TTL keeps offers fresh and
//      makes the accept step (F-1331) verify currency deterministically.
const QUOTE_TTL_MS = 15 * 60 * 1000; // 15 minutes

// WHAT: Upper bound on a single quote's quantity multiplier.
// WHY: Defensive — keeps a mock price computation bounded; intent-only.
const MAX_QUANTITY = 10_000;

// WHAT: The agent-supplied descriptive context for a quote request.
// WHY: Identity/attribution hints only — never authority. Foundation's own
//      session is the authority; agent_context is descriptive metadata.
export interface Avp2AgentContext {
  agent_id?: string;
  on_behalf_of?: string;
  purpose?: string;
}

export interface Avp2ResourceRequest {
  listing_id?: string;
  resource_id?: string;
  access_mode?: string;
  selector?: string;
  quantity?: number;
}

export interface Avp2QuoteRequest {
  agent_context?: Avp2AgentContext;
  resource_request?: Avp2ResourceRequest;
  intended_use?: string;
  settlement?: { mode?: string };
}

// WHAT: The quote offer returned to the agent (and snapshotted into the ledger).
// WHY: A self-contained, point-in-time governed offer the agent can accept.
export interface Avp2Quote {
  quote_id: string;
  status: "QUOTED";
  listing_id: string;
  provider_entity_id: string;
  resource_id: string;
  resource_type: string;
  title: string;
  intended_use: string;
  access_mode: string | null;
  selector: string | null;
  quantity: number;
  price: {
    mock_amount: number | null;
    currency: "MOCK";
    settlement_mode: "MOCK_ONLY";
    is_mock: true;
  };
  governance: {
    quote_required: boolean;
    proof_required: boolean;
    consent_required: boolean;
    license_terms: string | null;
    allowed_uses: string[];
    training_allowed: boolean;
    commercial_ai_allowed: boolean;
    redistribution_allowed: boolean;
    retention_policy: string | null;
    access_modes: string[];
  };
  proof_basis: {
    proof_required: boolean;
    proof_method: "AVP2_ACCESS_RECEIPT";
    note: string;
  };
  lineage_basis: {
    policy_source: "MARKETPLACE_LISTING_GOVERNANCE";
    listing_id: string;
    consent_required: boolean;
  };
  live_access_enabled: false;
  created_at: string;
  expires_at: string;
}

export type CreateQuoteResult =
  | { ok: true; quote: Avp2Quote }
  | { ok: false; code: string };

// WHAT: deterministic mock price for a resource contract + quantity.
// INPUT: the contract + a validated quantity. OUTPUT: a mock amount or null.
// WHY: pricing must be deterministic (no time/randomness) so the accept step
//      can re-verify the offer. Floor is the canonical unit price; null floor
//      means "not priced" → null amount (still quotable, mock-only).
export function deterministicMockPrice(
  contract: Avp2ResourceContract,
  quantity: number,
): number | null {
  const unit = contract.mock_price_floor ?? contract.mock_price_ceiling;
  if (unit === null) return null;
  return unit * quantity;
}

export class Avp2QuoteService {
  constructor(private readonly authService: AuthService) {}

  private async callerOrgOrNull(entityId: string): Promise<string | null> {
    try {
      const org = await getOrgEntityId(entityId);
      return org === entityId ? null : org;
    } catch {
      return null;
    }
  }

  // WHAT: create an AVP² quote for a specific resource the caller can see.
  // INPUT: session token + quote request. OUTPUT: a time-boxed governed offer.
  // WHY: POST /api/v1/foundation/avp2/quote — step 1 of the quote→accept→access
  //      loop. Resolves the SPECIFIC resource_id (hard-denies unknown ones),
  //      prices deterministically, and records AVP2_QUOTE_CREATED before reply.
  async createQuoteForCaller(
    sessionToken: string,
    req: Avp2QuoteRequest,
  ): Promise<CreateQuoteResult> {
    const v = await this.authService.validateSession(sessionToken, "read");
    if (!v.valid) return { ok: false, code: v.code };

    const rr = req.resource_request ?? {};
    const listingId = typeof rr.listing_id === "string" ? rr.listing_id : "";
    const resourceId = typeof rr.resource_id === "string" ? rr.resource_id : "";
    const intendedUse =
      typeof req.intended_use === "string" ? req.intended_use.trim() : "";

    if (listingId.length === 0) return { ok: false, code: "LISTING_ID_REQUIRED" };
    if (resourceId.length === 0) return { ok: false, code: "RESOURCE_ID_REQUIRED" };
    if (intendedUse.length === 0) return { ok: false, code: "INTENDED_USE_REQUIRED" };

    // Mock-only economics — reject any non-mock settlement mode outright.
    const settlementMode = req.settlement?.mode;
    if (settlementMode !== undefined && settlementMode !== "MOCK_ONLY")
      return { ok: false, code: "INVALID_SETTLEMENT_MODE" };

    // Quantity is a deterministic, bounded positive integer (default 1).
    const rawQty = rr.quantity;
    let quantity = 1;
    if (rawQty !== undefined) {
      if (typeof rawQty !== "number" || !Number.isInteger(rawQty) || rawQty < 1)
        return { ok: false, code: "INVALID_QUANTITY" };
      if (rawQty > MAX_QUANTITY) return { ok: false, code: "INVALID_QUANTITY" };
      quantity = rawQty;
    }

    const listing = await prisma.marketplaceListing.findFirst({
      where: { listing_id: listingId, deleted_at: null },
    });
    if (listing === null) return { ok: false, code: "LISTING_NOT_FOUND" };

    // Visibility mirrors F-1329: provider, or same-org viewer of a PUBLISHED
    // listing. Enumeration-safe: invisible listings look not-found.
    const orgEntityId = await this.callerOrgOrNull(v.entity_id);
    const isProvider = listing.provider_entity_id === v.entity_id;
    const isPublishedSameOrg =
      listing.status === "PUBLISHED" &&
      listing.provider_org_entity_id !== null &&
      listing.provider_org_entity_id === orgEntityId;
    if (!isProvider && !isPublishedSameOrg)
      return { ok: false, code: "LISTING_NOT_FOUND" };

    // Per-resource_id resolution — HARD deny when the id matches no contract.
    // No listing-level fall-back: the quote is for a SPECIFIC resource.
    const contracts = deriveResourceContracts(listing);
    const contract = contracts.find((c) => c.resource_id === resourceId);
    if (contract === undefined) return { ok: false, code: "RESOURCE_NOT_FOUND" };

    const accessMode =
      typeof rr.access_mode === "string" && rr.access_mode.length > 0
        ? rr.access_mode
        : null;
    if (accessMode !== null && !contract.access_modes.includes(accessMode))
      return { ok: false, code: "INVALID_ACCESS_MODE" };
    const selector =
      typeof rr.selector === "string" && rr.selector.length > 0 ? rr.selector : null;

    const mockAmount = deterministicMockPrice(contract, quantity);
    const quoteId = `quote_${randomUUID()}`;
    const nowMs = Date.now(); // only time-derived value — for expiry
    const createdAt = new Date(nowMs).toISOString();
    const expiresAt = new Date(nowMs + QUOTE_TTL_MS).toISOString();

    const quote: Avp2Quote = {
      quote_id: quoteId,
      status: "QUOTED",
      listing_id: listing.listing_id,
      provider_entity_id: listing.provider_entity_id,
      resource_id: contract.resource_id,
      resource_type: contract.resource_type,
      title: contract.title,
      intended_use: intendedUse,
      access_mode: accessMode,
      selector,
      quantity,
      price: {
        mock_amount: mockAmount,
        currency: "MOCK",
        settlement_mode: "MOCK_ONLY",
        is_mock: true,
      },
      governance: {
        quote_required: contract.quote_required,
        proof_required: contract.proof_required,
        consent_required: contract.consent_required,
        license_terms: contract.license_terms,
        allowed_uses: contract.allowed_uses,
        training_allowed: contract.training_allowed,
        commercial_ai_allowed: contract.commercial_ai_allowed,
        redistribution_allowed: contract.redistribution_allowed,
        retention_policy: contract.retention_policy,
        access_modes: contract.access_modes,
      },
      proof_basis: {
        proof_required: contract.proof_required,
        proof_method: "AVP2_ACCESS_RECEIPT",
        note:
          "Access against this quote is proven by an AVP² access receipt — " +
          "Foundation records the access attempt; it does not deliver content.",
      },
      lineage_basis: {
        policy_source: "MARKETPLACE_LISTING_GOVERNANCE",
        listing_id: listing.listing_id,
        consent_required: contract.consent_required,
      },
      live_access_enabled: false,
      created_at: createdAt,
      expires_at: expiresAt,
    };

    // RULE 4 — record the quote in the append-only ledger BEFORE replying. The
    // details are a SAFE point-in-time snapshot (governance + mock price only;
    // never content). The creator is actor_entity_id — F-1331 binds accept to it.
    await writeAuditEvent({
      event_type: "AVP2_QUOTE_CREATED",
      outcome: "SUCCESS",
      actor_entity_id: v.entity_id,
      target_entity_id: listing.provider_entity_id,
      session_id: v.session_id,
      details: {
        quote_id: quoteId,
        listing_id: listing.listing_id,
        provider_entity_id: listing.provider_entity_id,
        resource_id: contract.resource_id,
        resource_type: contract.resource_type,
        intended_use: intendedUse,
        access_mode: accessMode,
        selector,
        quantity,
        mock_price: mockAmount,
        settlement_mode: "MOCK_ONLY",
        expires_at: expiresAt,
        proof_required: contract.proof_required,
        consent_required: contract.consent_required,
        license_terms: contract.license_terms,
        allowed_uses: contract.allowed_uses,
        training_allowed: contract.training_allowed,
        commercial_ai_allowed: contract.commercial_ai_allowed,
        redistribution_allowed: contract.redistribution_allowed,
        retention_policy: contract.retention_policy,
        access_modes: contract.access_modes,
        // descriptive agent hints (never authority)
        agent_id: req.agent_context?.agent_id ?? null,
        is_mock: true,
      },
    });

    return { ok: true, quote };
  }
}
