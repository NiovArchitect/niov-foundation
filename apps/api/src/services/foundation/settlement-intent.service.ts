// FILE: settlement-intent.service.ts
// PURPOSE: F-1325 — the Settlement Intent Graph. The economic OBLIGATION layer:
//          who owes, who is owed, why, and under what proof / attribution /
//          policy-lineage basis. INTENT ONLY.
//
//          NOT payment. NOT settlement execution. NOT USDC. NOT Base. NOT
//          tokenomics. No funds move, no irreversible accounting. Every figure is
//          mock-only and every intent is a read-time PROJECTION over append-only
//          sources (data grants + the grant-read audit + listing pricing) — there
//          is NO settlement table and nothing is ever written or mutated here.
//
// CONNECTS TO: packages/database (MarketplaceDataGrant + MarketplaceListing +
//              AuditEvent) + auth.service + apps/api/src/routes/foundation.routes.ts
//              (GET /settlement/intents). proof_reference / policy_lineage_reference
//              resolve through F-1321 / F-1324.
//
// SAFETY: every returned intent has the caller as payer OR payee (a real grant
// party); both ids are already mutually visible to grant parties (SafeDataGrant).
// No raw content, payloads, capsules, or chain secrets.

import { prisma, type MarketplaceDataGrant } from "@niov/database";
import type { AuthService } from "../auth.service.js";

export type SettlementIntentStatus = "PROJECTED" | "MATURED" | "VOIDED" | "REVOKED";

export interface SettlementIntent {
  intent_id: string;
  payer_entity_id: string;
  payee_entity_id: string;
  resource_type: string;
  resource_id: string;
  proof_reference: string | null;
  attribution_reference: string | null;
  policy_lineage_reference: string | null;
  metered_usage_total: number;
  mock_value_total: number;
  settlement_mode: "MOCK_ONLY";
  status: SettlementIntentStatus;
  created_at: string;
}

export interface SettlementIntentsView {
  intents: SettlementIntent[];
  owed_total: number; // mock value the caller owes (as payer), PROJECTED+MATURED
  receivable_total: number; // mock value owed to the caller (as payee)
  is_mock: true;
  settlement_mode: "MOCK_ONLY";
  note: string;
  generated_at: string;
}

export type GetSettlementIntentsResult =
  | { ok: true; settlement: SettlementIntentsView }
  | { ok: false; code: string };

const GRANT_CAP = 100; // bound the derivation per call
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function pricingAmountUsd(pricing: unknown): number {
  if (pricing !== null && typeof pricing === "object") {
    const v = (pricing as Record<string, unknown>).amount_usd;
    if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  }
  return 0;
}

// Grant status → settlement intent status (deterministic).
function statusFor(grantStatus: string): SettlementIntentStatus {
  switch (grantStatus) {
    case "ACTIVE":
      return "PROJECTED";
    case "EXPIRED":
      return "MATURED";
    case "REVOKED":
      return "REVOKED";
    default: // PENDING_CONSENT, DENIED → no obligation accrues
      return "VOIDED";
  }
}

export class SettlementIntentService {
  constructor(private readonly authService: AuthService) {}

  private async grantReadCount(grantId: string): Promise<number> {
    return prisma.auditEvent.count({
      where: {
        event_type: "MARKETPLACE_DATA_GRANT_READ_EVALUATED",
        outcome: "SUCCESS",
        AND: [{ details: { path: ["grant_id"], equals: grantId } }],
      },
    });
  }

  // The grant's CREATED audit event hash — the proof/lineage anchor for the
  // obligation (resolvable via F-1321 proof feed + F-1324 lineage).
  private async grantProofHash(grantId: string): Promise<string | null> {
    const ev = await prisma.auditEvent.findFirst({
      where: {
        event_type: "MARKETPLACE_DATA_GRANT_CREATED",
        AND: [{ details: { path: ["grant_id"], equals: grantId } }],
      },
      orderBy: { timestamp: "asc" },
      select: { event_hash: true },
    });
    return ev?.event_hash ?? null;
  }

  // WHAT: the caller's settlement intent graph (as payer and/or payee).
  // INPUT: session token + optional { status, role } filters.
  // OUTPUT: derived, mock-only obligation intents + owed/receivable totals.
  // WHY: GET /api/v1/foundation/settlement/intents.
  async getSettlementIntentsForCaller(
    sessionToken: string,
    filter: { status?: string; role?: string } = {},
  ): Promise<GetSettlementIntentsResult> {
    const v = await this.authService.validateSession(sessionToken, "read");
    if (!v.valid) return { ok: false, code: v.code };
    const caller = v.entity_id;

    // Grants where the caller is a party (payer=buyer / payee=provider).
    const grants = await prisma.marketplaceDataGrant.findMany({
      where: { OR: [{ buyer_entity_id: caller }, { provider_entity_id: caller }] },
      orderBy: { created_at: "desc" },
      take: GRANT_CAP,
    });

    // Resolve listing pricing for all referenced listings in one query.
    const listingIds = Array.from(new Set(grants.map((g) => g.listing_id)));
    const listings = listingIds.length > 0
      ? await prisma.marketplaceListing.findMany({
          where: { listing_id: { in: listingIds } },
          select: { listing_id: true, pricing_model: true },
        })
      : [];
    const priceByListing = new Map(listings.map((l) => [l.listing_id, pricingAmountUsd(l.pricing_model)]));

    const wantStatus = typeof filter.status === "string" ? filter.status.toUpperCase() : null;
    const wantRole = typeof filter.role === "string" ? filter.role.toLowerCase() : null;

    const intents: SettlementIntent[] = [];
    for (const g of grants) {
      const status = statusFor(g.status);
      if (wantStatus !== null && status !== wantStatus) continue;
      const role = caller === g.buyer_entity_id ? "payer" : "payee";
      if (wantRole !== null && wantRole !== role) continue;

      const reads = await this.grantReadCount(g.grant_id);
      const unitPrice = priceByListing.get(g.listing_id) ?? 0;
      // VOIDED obligations accrue no value.
      const mockValue = status === "VOIDED" ? 0 : round2(reads * unitPrice);
      const proofHash = await this.grantProofHash(g.grant_id);

      intents.push({
        intent_id: `intent:grant:${g.grant_id}`,
        payer_entity_id: g.buyer_entity_id,
        payee_entity_id: g.provider_entity_id,
        resource_type: "DATA_GRANT",
        resource_id: g.grant_id,
        proof_reference: proofHash,
        // Grant obligations are not cohort-attribution-based; cohort/contributor
        // attribution-linked intents are forward-substrate.
        attribution_reference: null,
        policy_lineage_reference: proofHash,
        metered_usage_total: reads,
        mock_value_total: mockValue,
        settlement_mode: "MOCK_ONLY",
        status,
        created_at: g.created_at.toISOString(),
      });
    }

    // Owed (caller is payer) vs receivable (caller is payee), live obligations.
    const live = (i: SettlementIntent): boolean => i.status === "PROJECTED" || i.status === "MATURED";
    const owedTotal = round2(
      intents.filter((i) => i.payer_entity_id === caller && live(i)).reduce((s, i) => s + i.mock_value_total, 0),
    );
    const receivableTotal = round2(
      intents.filter((i) => i.payee_entity_id === caller && live(i)).reduce((s, i) => s + i.mock_value_total, 0),
    );

    return {
      ok: true,
      settlement: {
        intents,
        owed_total: owedTotal,
        receivable_total: receivableTotal,
        is_mock: true,
        settlement_mode: "MOCK_ONLY",
        note:
          "MOCK economic obligations — intent only. No payment, no settlement " +
          "execution, no funds, no USDC/Base, no tokenomics. Derived (read-only) " +
          "from grant + usage + pricing; never persisted as a charge.",
        generated_at: new Date().toISOString(),
      },
    };
  }
}

// Exported for unit testing the deterministic status mapping.
export { statusFor as settlementStatusFor };
export type { MarketplaceDataGrant };
