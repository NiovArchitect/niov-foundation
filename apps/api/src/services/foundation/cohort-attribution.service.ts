// FILE: cohort-attribution.service.ts
// PURPOSE: F-1323 — the Contribution Attribution Ledger. A read-only, DERIVED
//          attribution-accounting view over a cohort: who contributed, what
//          scope, their contribution weight, how much metered usage their
//          participation maps to, and a MOCK value participation. This is the
//          economic TRUTH layer — attribution accounting ONLY.
//
//          NOT payout. NOT settlement. NOT tokenomics. NO funds move, NO wallets,
//          NO USDC, NO Base, NO token distribution, NO real settlement, NO
//          irreversible accounting. Mock attribution only; settlement is
//          downstream.
//
//          DERIVED, NOT STORED: attribution is computed on-read from append-only
//          sources — cohort_contributions (who/scope/status/joined/withdrawn) +
//          the 1308-A delivery audit (metered usage) + the cohort's advisory
//          pricing_model (mock value, via computeMockEconomics). There is NO new
//          schema and NO mutable economic history; the underlying sources are
//          themselves append-only / soft-delete (RULE 10).
//
// WEIGHTING (v1, deterministic + explicit): equal-weight active participation.
//   active_count   = number of ELIGIBLE contribution records (deleted_at null)
//   per active record:  weight = 1 / active_count
//                       usage_touches    = round(metered_usage_total / active_count)
//                       value_participation = round(mock_value_total / active_count, 2)
//   non-active (REVOKED/EXPIRED) record:  weight = 0, usage_touches = 0,
//                       value_participation = 0 (no current participation)
//   total_weight = sum of active weights = 1.0 when active_count > 0, else 0.
//   (e.g. 10 active records, 100 usage, $200 mock → each: 0.10 / 10 / $20.)
//   Future weighting may evolve; v1 does not overengineer scoring.
//
// CONNECTS TO: packages/database (CohortContribution + CohortDataProduct +
//              AuditEvent + writeAuditEvent) + auth.service + governance/org +
//              cohort-metering.service (computeMockEconomics reuse) +
//              apps/api/src/routes/cohort.routes.ts.
//
// SAFETY: role-scoped + enumeration-safe COHORT_PRODUCT_NOT_FOUND. NEVER raw
// contributed content, capsule payloads, raw bodies, wallet ids, or PII.
// Contributor identities are redacted unless the viewer is authorized:
//   provider/admin → all units WITH identities; contributor → OWN unit(s) only;
//   buyer → aggregate totals only, NO units, NO identities. Cross-tenant callers
//   get COHORT_PRODUCT_NOT_FOUND.

import {
  prisma,
  writeAuditEvent,
  type CohortContribution,
  type CohortDataProduct,
} from "@niov/database";
import type { AuthService } from "../auth.service.js";
import { getOrgEntityId } from "../governance/org.js";
import { computeMockEconomics } from "./cohort-metering.service.js";

export type AttributionViewerRole = "provider" | "admin" | "contributor" | "buyer";

export interface AttributionUnit {
  contribution_id: string;
  // Redacted (null) unless the viewer is authorized to see this contributor.
  contributor_entity_id: string | null;
  contribution_scope: string;
  contribution_status: string;
  weight: number;
  usage_touches: number;
  value_participation: number;
  proof_reference: string;
  joined_at: string;
  withdrawn_at: string | null;
}

export interface CohortAttributionView {
  cohort_product_id: string;
  viewer_role: AttributionViewerRole;
  // Suppressed to null for buyer/contributor viewers when active_contributors is
  // below the cohort's minimum_cohort_size k-anonymity floor (Founder canonical
  // ruling, F-1323): the k-floor is dual-purpose — activation AND privacy. Exact
  // contributor counts below the floor would leak cohort sparsity and weaken
  // anonymity. Provider/admin always see exact counts.
  total_contributors: number | null;
  active_contributors: number | null;
  count_suppressed: boolean;
  suppression_reason: string | null;
  total_weight: number;
  metered_usage_total: number;
  mock_value_total: number;
  is_mock: true;
  settlement_mode: "MOCK_ONLY";
  weighting_formula: string;
  attribution_units: AttributionUnit[];
  proof_reference: string;
  generated_at: string;
}

export type GetCohortAttributionResult =
  | { ok: true; attribution: CohortAttributionView }
  | { ok: false; code: string };

const WEIGHTING_FORMULA =
  "v1 equal-weight active participation: each ELIGIBLE contribution record gets " +
  "weight = 1/active_count; usage_touches = metered_usage_total/active_count; " +
  "value_participation = mock_value_total/active_count (mock-only). Withdrawn/" +
  "expired records carry zero current participation. The cohort TOTALS " +
  "(total_weight / metered_usage_total / mock_value_total) are authoritative; " +
  "per-unit figures are rounded display values and need not sum exactly.";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// The reason recorded when contributor-count fields are k-anonymity-suppressed.
export const K_ANONYMITY_SUPPRESSION_REASON = "BELOW_K_ANONYMITY_THRESHOLD";

// WHAT: whether exact contributor counts must be suppressed for this viewer.
// INPUT: viewer role + active contributor count + the cohort's k-floor.
// OUTPUT: true when counts must be nulled. WHY: Founder canonical ruling F-1323 —
//        buyer/contributor viewers MUST NOT learn exact contributor counts while
//        the cohort is below its minimum_cohort_size privacy floor; provider and
//        admin always see exact counts (operational/owner visibility).
export function shouldSuppressCounts(
  role: AttributionViewerRole,
  activeContributors: number,
  minimumCohortSize: number,
): boolean {
  if (role === "provider" || role === "admin") return false;
  return activeContributors < minimumCohortSize;
}

// WHAT: the deterministic v1 equal-weight attribution split.
// INPUT: active contribution count + metered usage total + mock value total.
// OUTPUT: per-active-record weight / usage_touches / value_participation +
//         the total active weight (1.0 when any active, else 0).
// WHY: pure + unit-testable; the single source of the v1 formula. Withdrawn/
//      expired records carry zero participation (handled by the caller).
export function computeEqualWeightAttribution(
  activeCount: number,
  meteredUsageTotal: number,
  mockValueTotal: number,
): { perWeight: number; perUsage: number; perValue: number; totalWeight: number } {
  if (activeCount <= 0) return { perWeight: 0, perUsage: 0, perValue: 0, totalWeight: 0 };
  return {
    perWeight: round2(1 / activeCount),
    perUsage: Math.round(meteredUsageTotal / activeCount),
    perValue: round2(mockValueTotal / activeCount),
    totalWeight: 1.0,
  };
}

export class CohortAttributionService {
  constructor(private readonly authService: AuthService) {}

  private async callerOrgOrNull(entityId: string): Promise<string | null> {
    try {
      const org = await getOrgEntityId(entityId);
      return org === entityId ? null : org;
    } catch {
      return null;
    }
  }

  // Provider-owner OR same-org admin_org (mirrors the cohort metering/access
  // services). Returns the matched role, or null.
  private async providerRole(
    cohort: CohortDataProduct,
    entityId: string,
    allowedOps: string[],
  ): Promise<"provider" | "admin" | null> {
    if (cohort.provider_entity_id === entityId) return "provider";
    if (cohort.provider_org_entity_id !== null && allowedOps.includes("admin_org")) {
      const org = await this.callerOrgOrNull(entityId);
      if (org !== null && org === cohort.provider_org_entity_id) return "admin";
    }
    return null;
  }

  // Count DELIVERED deliveries for the cohort (metered usage), off the 1308-A
  // append-only delivery audit (event_type indexed + details JSON path).
  private async deliveredCount(cohortProductId: string): Promise<number> {
    return prisma.auditEvent.count({
      where: {
        event_type: "COHORT_SIGNAL_DELIVERED",
        AND: [{ details: { path: ["cohort_product_id"], equals: cohortProductId } }],
      },
    });
  }

  // WHAT: the governed, derived attribution view for a cohort.
  // INPUT: session token + cohort_product_id.
  // OUTPUT: a role-scoped, redaction-correct CohortAttributionView.
  // WHY: GET /api/v1/foundation/cohorts/:id/attribution — the attribution spine.
  async getCohortAttributionForCaller(
    sessionToken: string,
    cohortProductId: string,
  ): Promise<GetCohortAttributionResult> {
    const v = await this.authService.validateSession(sessionToken, "read");
    if (!v.valid) return { ok: false, code: v.code };

    const cohort = await prisma.cohortDataProduct.findFirst({
      where: { cohort_product_id: cohortProductId, deleted_at: null },
    });
    if (cohort === null) return { ok: false, code: "COHORT_PRODUCT_NOT_FOUND" };

    // ── Resolve the viewer's role (enumeration-safe). ────────────────────────
    const provider = await this.providerRole(cohort, v.entity_id, v.allowed_operations);
    let role: AttributionViewerRole | null = provider;
    if (role === null) {
      const ownContribution = await prisma.cohortContribution.findFirst({
        where: { cohort_product_id: cohortProductId, contributor_entity_id: v.entity_id, deleted_at: null },
        select: { contribution_id: true },
      });
      if (ownContribution !== null) {
        role = "contributor";
      } else {
        // A buyer is a caller with a real access relationship to the cohort.
        const ownRequest = await prisma.cohortAccessRequest.findFirst({
          where: { cohort_product_id: cohortProductId, buyer_entity_id: v.entity_id },
          select: { request_id: true },
        });
        if (ownRequest !== null) role = "buyer";
      }
    }
    // Not a provider/admin/contributor/buyer of this cohort → invisible.
    if (role === null) return { ok: false, code: "COHORT_PRODUCT_NOT_FOUND" };

    // ── Derive the attribution snapshot. ─────────────────────────────────────
    const contributions = await prisma.cohortContribution.findMany({
      where: { cohort_product_id: cohortProductId, deleted_at: null },
      orderBy: { created_at: "asc" },
    });
    const active = contributions.filter((c) => c.status === "ELIGIBLE");
    const activeCount = active.length;
    const deliveredTotal = await this.deliveredCount(cohortProductId);
    const mockValueTotal = computeMockEconomics(cohort, deliveredTotal).estimated_amount_usd ?? 0;

    const { perWeight, perUsage, perValue, totalWeight } = computeEqualWeightAttribution(
      activeCount,
      deliveredTotal,
      mockValueTotal,
    );

    const totalContributors = new Set(contributions.map((c) => c.contributor_entity_id)).size;
    const activeContributors = new Set(active.map((c) => c.contributor_entity_id)).size;

    // ── K-anonymity count suppression (Founder canonical ruling F-1323). ─────
    const suppressed = shouldSuppressCounts(role, activeContributors, cohort.minimum_cohort_size);
    const shownTotal = suppressed ? null : totalContributors;
    const shownActive = suppressed ? null : activeContributors;
    const suppressionReason = suppressed ? K_ANONYMITY_SUPPRESSION_REASON : null;

    // ── Audit BEFORE response (RULE 4): record the computation + the access.
    // The ATTRIBUTION_COMPUTED event hash is the snapshot proof reference.
    const computed = await writeAuditEvent({
      event_type: "ATTRIBUTION_COMPUTED",
      outcome: "SUCCESS",
      actor_entity_id: v.entity_id,
      details: {
        action: "ATTRIBUTION_COMPUTED",
        cohort_product_id: cohortProductId,
        active_contributor_count: activeContributors,
        total_weight: totalWeight,
        metered_usage_total: deliveredTotal,
        mock_value_total: mockValueTotal,
        viewer_role: role,
      },
    });
    await writeAuditEvent({
      event_type: "ATTRIBUTION_VIEWED",
      outcome: "SUCCESS",
      actor_entity_id: v.entity_id,
      details: {
        action: "ATTRIBUTION_VIEWED",
        cohort_product_id: cohortProductId,
        // Internal audit truth (never buyer-facing); the suppression itself is
        // auditable via count_suppressed + suppression_reason.
        active_contributor_count: activeContributors,
        total_weight: totalWeight,
        metered_usage_total: deliveredTotal,
        mock_value_total: mockValueTotal,
        viewer_role: role,
        count_suppressed: suppressed,
        suppression_reason: suppressionReason,
      },
    });
    const proofReference = computed.event_hash;

    // ── Project units with role-correct redaction. ───────────────────────────
    const toUnit = (c: CohortContribution, identityVisible: boolean): AttributionUnit => {
      const isActive = c.status === "ELIGIBLE";
      return {
        contribution_id: c.contribution_id,
        contributor_entity_id: identityVisible ? c.contributor_entity_id : null,
        contribution_scope: c.contribution_scope,
        contribution_status: c.status,
        weight: isActive ? round2(perWeight) : 0,
        usage_touches: isActive ? perUsage : 0,
        value_participation: isActive ? perValue : 0,
        proof_reference: proofReference,
        joined_at: c.created_at.toISOString(),
        withdrawn_at: c.revoked_at !== null ? c.revoked_at.toISOString() : null,
      };
    };

    let units: AttributionUnit[];
    if (role === "provider" || role === "admin") {
      // Full visibility incl. contributor identities.
      units = contributions.map((c) => toUnit(c, true));
    } else if (role === "contributor") {
      // Only the caller's own unit(s), with their own identity.
      units = contributions
        .filter((c) => c.contributor_entity_id === v.entity_id)
        .map((c) => toUnit(c, true));
    } else {
      // Buyer: aggregate totals only — no units, no identities.
      units = [];
    }

    const attribution: CohortAttributionView = {
      cohort_product_id: cohortProductId,
      viewer_role: role,
      total_contributors: shownTotal,
      active_contributors: shownActive,
      count_suppressed: suppressed,
      suppression_reason: suppressionReason,
      total_weight: totalWeight,
      metered_usage_total: deliveredTotal,
      mock_value_total: mockValueTotal,
      is_mock: true,
      settlement_mode: "MOCK_ONLY",
      weighting_formula: WEIGHTING_FORMULA,
      attribution_units: units,
      proof_reference: proofReference,
      generated_at: new Date().toISOString(),
    };
    return { ok: true, attribution };
  }
}
