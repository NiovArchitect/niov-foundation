// FILE: cohort-metering.service.ts
// PURPOSE: Phase 1309-A — cohort USAGE METERING + MOCK ECONOMICS. A read-only
//          metering surface for a cohort PROVIDER/ADMIN: how many times the
//          cohort's delivery gate (1308-A) ran, split by outcome
//          (delivered / suppressed / denied) and by access mode, plus a clearly-
//          labelled MOCK economic estimate. STATELESS — it meters off the
//          existing 1308-A delivery audit events (COHORT_SIGNAL_DELIVERED /
//          _SUPPRESSED / _DENIED), so there is NO new schema and NO `1309-B`.
//
//          MOCK-ONLY ECONOMICS (non-negotiable): the estimate is a development
//          artifact — `is_mock: true`, `settlement_mode: "MOCK_ONLY"`, asset
//          `USDC_MOCK`. NO funds move, NO real settlement exists, NO payout, NO
//          revenue share, NO blockchain. The estimate is computed on-read from
//          the cohort's advisory `pricing_model.unit_price_usd` × delivered
//          count; it is NEVER persisted as a charge. Mirrors the established
//          mock-economics patterns (economic-policy.service.ts +
//          settlement-readiness.service.ts MockSettlementReceipt).
//
// CONNECTS TO: packages/database AuditEvent (event_type indexed; details JSON) +
//              CohortDataProduct + prisma; apps/api/src/services/auth.service.ts
//              (validateSession); apps/api/src/services/governance/org.ts
//              (getOrgEntityId); apps/api/src/routes/cohort.routes.ts.
//
// SAFETY: provider/admin-only + enumeration-safe COHORT_PRODUCT_NOT_FOUND. The
// metering view returns AGGREGATE counts + a mock estimate ONLY — no per-event
// detail, no buyer identities, no contributor identities, no raw data, no exact
// eligible-contributor count (that snapshot lives only inside the audit row).

import {
  prisma,
  type CohortDataProduct,
} from "@niov/database";
import type { AuthService } from "../auth.service.js";
import { getOrgEntityId } from "../governance/org.js";

// The 3 cohort access modes a delivery can be requested under (closed vocab,
// mirrors federation-cloud-cohort.service.ts COHORT_ACCESS_MODES).
const DELIVERY_ACCESS_MODES = [
  "AGGREGATED_SIGNAL",
  "DEPERSONALIZED_SIGNAL",
  "PROOF_ONLY",
] as const;

// ── SAFE projection ─────────────────────────────────────────────────────────

export interface CohortMockEconomics {
  // Always true — a development artifact; no funds move.
  is_mock: true;
  settlement_mode: "MOCK_ONLY";
  asset: "USDC_MOCK";
  metering_unit: string | null;
  // The per-unit advisory price read from the cohort's pricing_model (or null
  // when the provider has not set one).
  unit_price_usd: number | null;
  // One billable unit per DELIVERED delivery (suppressed/denied never bill).
  billable_units: number;
  // unit_price_usd × billable_units, or null when no unit price is set.
  estimated_amount_usd: number | null;
  note: string;
}

export interface CohortUsageView {
  cohort_product_id: string;
  total_attempts: number;
  delivered_count: number;
  suppressed_count: number;
  denied_count: number;
  // Delivered-only breakdown by access mode (closed vocab).
  delivered_by_access_mode: Record<string, number>;
  mock_economics: CohortMockEconomics;
  generated_at: string;
}

export type GetCohortUsageResult =
  | { ok: true; usage: CohortUsageView }
  | { ok: false; code: string };

// WHAT: Read the advisory per-unit mock price from a cohort's pricing_model.
// INPUT: the pricing_model JSON value.
// OUTPUT: a positive finite number, or null. WHY: pricing_model is provider-
//        supplied advisory JSON; only a positive finite unit_price_usd is used,
//        anything else yields null (honest "no price set").
export function readUnitPriceUsd(pricingModel: unknown): number | null {
  if (pricingModel === null || typeof pricingModel !== "object") return null;
  const raw = (pricingModel as Record<string, unknown>).unit_price_usd;
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? raw : null;
}

// WHAT: Compute the MOCK economic estimate for a cohort's delivered usage.
// INPUT: the cohort + the delivered (billable) count.
// OUTPUT: a CohortMockEconomics (always is_mock:true). WHY: pure, unit-testable;
//        the estimate is development-only — never a real charge, never persisted.
export function computeMockEconomics(
  cohort: Pick<CohortDataProduct, "pricing_model" | "metering_unit">,
  deliveredCount: number,
): CohortMockEconomics {
  const unitPrice = readUnitPriceUsd(cohort.pricing_model);
  const estimated = unitPrice === null ? null : Math.round(unitPrice * deliveredCount * 100) / 100;
  return {
    is_mock: true,
    settlement_mode: "MOCK_ONLY",
    asset: "USDC_MOCK",
    metering_unit: cohort.metering_unit,
    unit_price_usd: unitPrice,
    billable_units: deliveredCount,
    estimated_amount_usd: estimated,
    note:
      "MOCK economics — no funds move, no settlement exists, no payout, no " +
      "revenue share. Development artifact computed from the cohort's advisory " +
      "pricing_model; not a charge and never persisted.",
  };
}

export class CohortMeteringService {
  constructor(private readonly authService: AuthService) {}

  private async callerOrgOrNull(entityId: string): Promise<string | null> {
    try {
      const org = await getOrgEntityId(entityId);
      return org === entityId ? null : org;
    } catch {
      return null;
    }
  }

  private async isProviderOrAdmin(
    cohort: CohortDataProduct,
    entityId: string,
    allowedOps: string[],
  ): Promise<boolean> {
    if (cohort.provider_entity_id === entityId) return true;
    if (cohort.provider_org_entity_id !== null && allowedOps.includes("admin_org")) {
      const org = await this.callerOrgOrNull(entityId);
      if (org !== null && org === cohort.provider_org_entity_id) return true;
    }
    return false;
  }

  // Count delivery audit events for a cohort, filtered by event_type (indexed)
  // and the details.cohort_product_id JSON path — optionally also by access_mode.
  private async countDeliveryEvents(
    eventType: string,
    cohortProductId: string,
    accessMode?: string,
  ): Promise<number> {
    const filters: Array<Record<string, unknown>> = [
      { details: { path: ["cohort_product_id"], equals: cohortProductId } },
    ];
    if (accessMode !== undefined)
      filters.push({ details: { path: ["access_mode"], equals: accessMode } });
    return prisma.auditEvent.count({ where: { event_type: eventType, AND: filters } });
  }

  // WHAT: Read a cohort's usage metering + mock economics (provider/admin only).
  // WHY: GET /api/v1/foundation/cohorts/:id/usage. Stateless — aggregates the
  //      1308-A delivery audit events; returns AGGREGATE counts + a MOCK estimate
  //      only (no per-event detail, no identities, no exact eligible count).
  async getCohortUsageForCaller(
    sessionToken: string,
    cohortProductId: string,
  ): Promise<GetCohortUsageResult> {
    const v = await this.authService.validateSession(sessionToken, "read");
    if (!v.valid) return { ok: false, code: v.code };

    const cohort = await prisma.cohortDataProduct.findFirst({
      where: { cohort_product_id: cohortProductId, deleted_at: null },
    });
    if (cohort === null) return { ok: false, code: "COHORT_PRODUCT_NOT_FOUND" };
    if (!(await this.isProviderOrAdmin(cohort, v.entity_id, v.allowed_operations)))
      return { ok: false, code: "COHORT_PRODUCT_NOT_FOUND" };

    const [deliveredCount, suppressedCount, deniedCount] = await Promise.all([
      this.countDeliveryEvents("COHORT_SIGNAL_DELIVERED", cohort.cohort_product_id),
      this.countDeliveryEvents("COHORT_DELIVERY_SUPPRESSED", cohort.cohort_product_id),
      this.countDeliveryEvents("COHORT_DELIVERY_DENIED", cohort.cohort_product_id),
    ]);

    const byModeEntries = await Promise.all(
      DELIVERY_ACCESS_MODES.map(async (mode) => {
        const n = await this.countDeliveryEvents(
          "COHORT_SIGNAL_DELIVERED",
          cohort.cohort_product_id,
          mode,
        );
        return [mode, n] as const;
      }),
    );
    const deliveredByMode: Record<string, number> = {};
    for (const [mode, n] of byModeEntries) if (n > 0) deliveredByMode[mode] = n;

    const usage: CohortUsageView = {
      cohort_product_id: cohort.cohort_product_id,
      total_attempts: deliveredCount + suppressedCount + deniedCount,
      delivered_count: deliveredCount,
      suppressed_count: suppressedCount,
      denied_count: deniedCount,
      delivered_by_access_mode: deliveredByMode,
      mock_economics: computeMockEconomics(cohort, deliveredCount),
      generated_at: new Date().toISOString(),
    };
    return { ok: true, usage };
  }
}
