// FILE: cohort-contribution.service.ts
// PURPOSE: Phase 1306-A — INTERNAL contribution accounting for Federation Cloud
//          cohort data products. Records WHICH DMW / capsule scope contributes
//          to a cohort, the consent basis, and the eligibility window — so a
//          future safe-aggregate / proof layer (1308-A) can count eligible
//          contributors WITHOUT ever exposing contributor identities to buyers.
//
//          1306-A scope: register / list / revoke contributions (provider-owner
//          or same-org admin only). NO buyer-facing contributor list, NO real
//          signal delivery, NO payout, NO revenue share, NO threshold flip
//          (the cohort access evaluator's threshold_enforced stays false until
//          1308-A enforces minimum_cohort_size at delivery).
//
//          GOVERNANCE: eligibility honors the linked consent's LIVE state — a
//          contribution whose consent was revoked or expired AFTER recording is
//          NOT counted as eligible (RULE 0 consent/revocation). Contributor-
//          initiated consent withdrawal endpoint is deferred forward-substrate;
//          eligibility already honors marketplace_data_consents.revoked_at /
//          expires_at so a withdrawn consent drops the contribution immediately.
//
// CONNECTS TO: packages/database CohortContribution + CohortDataProduct +
//              MarketplaceDataConsent + prisma + writeAuditEvent
//              (COHORT_CONTRIBUTION_RECORDED / _REVOKED / _EXPIRED reserved);
//              apps/api/src/services/auth.service.ts (validateSession);
//              apps/api/src/services/governance/org.ts (getOrgEntityId);
//              apps/api/src/routes/cohort.routes.ts (HTTP surface).
//
// SAFETY: contributor_entity_id / contributor_org_entity_id / wallet_id are
// INTERNAL-ONLY and never appear in any HTTP projection; provider/admin manage
// rows by contribution_id. Enumeration-safe COHORT_PRODUCT_NOT_FOUND /
// CONTRIBUTION_NOT_FOUND. Audit details carry IDs / enums / booleans only.

import {
  prisma,
  writeAuditEvent,
  type CohortContribution,
  type CohortContributionStatus,
  type CohortDataProduct,
} from "@niov/database";
import type { AuthService } from "../auth.service.js";
import { getOrgEntityId } from "../governance/org.js";

// ── SAFE projection (identity fields intentionally excluded) ────────────────

export interface SafeContributionView {
  contribution_id: string;
  cohort_product_id: string;
  contribution_scope: string;
  contribution_weight: number;
  status: CohortContributionStatus;
  has_consent: boolean;
  // Whether the linked consent is currently live (non-revoked, unexpired).
  consent_active: boolean;
  // Whether this contribution currently counts toward the cohort.
  eligible: boolean;
  eligible_from: string | null;
  eligible_until: string | null;
  revoked_at: string | null;
  created_at: string;
  // Honesty marker — accounting only; no real signal is delivered in 1306-A.
  signal_available: false;
}

// ── Pure eligibility (no I/O — unit-testable) ───────────────────────────────

// WHAT: Is this contribution currently eligible to count toward the cohort?
// INPUT: the row, the evaluation instant, and whether its linked consent is
//        live (caller resolves consent state; null contribution => no consent
//        requirement at this layer, treated as consentActive=true).
// OUTPUT: boolean. WHY: a contribution counts only while ELIGIBLE, not soft-
//        deleted, inside its window, AND (if it has a consent basis) that
//        consent is still live — RULE 0 consent/revocation honored at read.
export function isContributionEligible(
  row: Pick<
    CohortContribution,
    "status" | "deleted_at" | "eligible_from" | "eligible_until" | "consent_record_id"
  >,
  now: Date,
  consentActive: boolean,
): boolean {
  if (row.status !== "ELIGIBLE") return false;
  if (row.deleted_at !== null) return false;
  if (row.eligible_from !== null && row.eligible_from.getTime() > now.getTime())
    return false;
  if (row.eligible_until !== null && row.eligible_until.getTime() <= now.getTime())
    return false;
  // A contribution with a consent basis only counts while that consent is live.
  if (row.consent_record_id !== null && !consentActive) return false;
  return true;
}

// ── Result types ────────────────────────────────────────────────────────────

export type RecordContributionResult =
  | { ok: true; contribution: SafeContributionView }
  | { ok: false; code: string };
export type ListContributionsResult =
  | {
      ok: true;
      contributions: SafeContributionView[];
      summary: {
        total: number;
        eligible_count: number;
        // Honest marker: 1306-A accounts contributors but does NOT enforce the
        // minimum_cohort_size floor at any delivery point (that is 1308-A).
        threshold_enforced: false;
        minimum_cohort_size: number;
      };
    }
  | { ok: false; code: string };
export type RevokeContributionResult =
  | { ok: true; contribution: SafeContributionView }
  | { ok: false; code: string };

interface ConsentState {
  exists: boolean;
  active: boolean;
  consenting_entity_id: string | null;
  provider_entity_id: string | null;
}

export class CohortContributionService {
  constructor(private readonly authService: AuthService) {}

  private async callerOrgOrNull(entityId: string): Promise<string | null> {
    try {
      const org = await getOrgEntityId(entityId);
      return org === entityId ? null : org;
    } catch {
      return null;
    }
  }

  // Provider-owner OR same-org admin_org may manage a cohort's contributions.
  private async isProviderOrAdmin(
    cohort: CohortDataProduct,
    entityId: string,
    allowedOps: string[],
  ): Promise<boolean> {
    if (cohort.provider_entity_id === entityId) return true;
    if (
      cohort.provider_org_entity_id !== null &&
      allowedOps.includes("admin_org")
    ) {
      const org = await this.callerOrgOrNull(entityId);
      if (org !== null && org === cohort.provider_org_entity_id) return true;
    }
    return false;
  }

  // Load the cohort IFF the caller may manage its contributions; else null
  // (enumeration-safe — same outcome for missing vs not-authorized).
  private async loadManageableCohort(
    cohortProductId: string,
    entityId: string,
    allowedOps: string[],
  ): Promise<CohortDataProduct | null> {
    const cohort = await prisma.cohortDataProduct.findFirst({
      where: { cohort_product_id: cohortProductId, deleted_at: null },
    });
    if (cohort === null) return null;
    return (await this.isProviderOrAdmin(cohort, entityId, allowedOps))
      ? cohort
      : null;
  }

  private async consentState(
    consentId: string,
    now: Date,
  ): Promise<ConsentState> {
    const c = await prisma.marketplaceDataConsent.findFirst({
      where: { consent_id: consentId },
    });
    if (c === null)
      return { exists: false, active: false, consenting_entity_id: null, provider_entity_id: null };
    const active =
      c.revoked_at === null &&
      (c.expires_at === null || c.expires_at.getTime() > now.getTime());
    return {
      exists: true,
      active,
      consenting_entity_id: c.consenting_entity_id,
      provider_entity_id: c.provider_entity_id,
    };
  }

  private toSafe(row: CohortContribution, consentActive: boolean, now: Date): SafeContributionView {
    return {
      contribution_id: row.contribution_id,
      cohort_product_id: row.cohort_product_id,
      contribution_scope: row.contribution_scope,
      contribution_weight: row.contribution_weight,
      status: row.status,
      has_consent: row.consent_record_id !== null,
      consent_active: consentActive,
      eligible: isContributionEligible(row, now, consentActive),
      eligible_from: row.eligible_from?.toISOString() ?? null,
      eligible_until: row.eligible_until?.toISOString() ?? null,
      revoked_at: row.revoked_at?.toISOString() ?? null,
      created_at: row.created_at.toISOString(),
      signal_available: false,
    };
  }

  // WHAT: Record a contribution (provider/admin only). The contributor identity
  //       is stored INTERNAL-ONLY and never returned.
  // WHY: POST /api/v1/foundation/cohorts/:id/contributions.
  async recordContributionForCaller(
    sessionToken: string,
    cohortProductId: string,
    input: {
      contributor_entity_id?: string;
      contributor_org_entity_id?: string | null;
      wallet_id?: string | null;
      contribution_scope?: string;
      contribution_weight?: number;
      consent_record_id?: string | null;
      eligible_from?: string | null;
      eligible_until?: string | null;
    },
  ): Promise<RecordContributionResult> {
    const v = await this.authService.validateSession(sessionToken, "write");
    if (!v.valid) return { ok: false, code: v.code };

    const cohort = await this.loadManageableCohort(
      cohortProductId,
      v.entity_id,
      v.allowed_operations,
    );
    if (cohort === null) return { ok: false, code: "COHORT_PRODUCT_NOT_FOUND" };

    if (
      typeof input.contributor_entity_id !== "string" ||
      input.contributor_entity_id.length === 0 ||
      typeof input.contribution_scope !== "string" ||
      input.contribution_scope.trim().length === 0
    )
      return { ok: false, code: "INVALID_REQUEST" };

    // If the cohort declares a capsule-type allowlist, the scope must be in it.
    if (
      cohort.capsule_type_allowlist.length > 0 &&
      !cohort.capsule_type_allowlist.includes(input.contribution_scope)
    )
      return { ok: false, code: "INVALID_CONTRIBUTION_SCOPE" };

    const weight =
      typeof input.contribution_weight === "number" &&
      Number.isFinite(input.contribution_weight) &&
      input.contribution_weight > 0
        ? input.contribution_weight
        : 1.0;

    const now = new Date();

    // Consent basis: required when the cohort requires consent; validated when
    // provided. A valid consent matches contributor + provider and is live.
    const consentId =
      typeof input.consent_record_id === "string" && input.consent_record_id.length > 0
        ? input.consent_record_id
        : null;
    if (cohort.consent_required && consentId === null)
      return { ok: false, code: "CONSENT_REQUIRED" };
    if (consentId !== null) {
      const cs = await this.consentState(consentId, now);
      if (!cs.exists) return { ok: false, code: "CONSENT_NOT_FOUND" };
      if (
        cs.consenting_entity_id !== input.contributor_entity_id ||
        cs.provider_entity_id !== cohort.provider_entity_id
      )
        return { ok: false, code: "CONSENT_MISMATCH" };
      if (!cs.active) return { ok: false, code: "CONSENT_INACTIVE" };
    }

    const created = await prisma.cohortContribution.create({
      data: {
        cohort_product_id: cohort.cohort_product_id,
        contributor_entity_id: input.contributor_entity_id,
        contributor_org_entity_id:
          typeof input.contributor_org_entity_id === "string"
            ? input.contributor_org_entity_id
            : null,
        wallet_id: typeof input.wallet_id === "string" ? input.wallet_id : null,
        contribution_scope: input.contribution_scope,
        contribution_weight: weight,
        consent_record_id: consentId,
        status: "ELIGIBLE",
        eligible_from:
          typeof input.eligible_from === "string" ? new Date(input.eligible_from) : null,
        eligible_until:
          typeof input.eligible_until === "string" ? new Date(input.eligible_until) : null,
      },
    });

    await writeAuditEvent({
      event_type: "COHORT_CONTRIBUTION_RECORDED",
      outcome: "SUCCESS",
      actor_entity_id: v.entity_id,
      details: {
        action: "COHORT_CONTRIBUTION_RECORDED",
        cohort_product_id: cohort.cohort_product_id,
        contribution_id: created.contribution_id,
        contribution_scope: created.contribution_scope,
        has_consent: created.consent_record_id !== null,
        status: created.status,
        // NEVER contributor_entity_id / wallet_id here.
      },
    });

    // consentActive at record time is true (validated above) or N/A.
    return { ok: true, contribution: this.toSafe(created, consentId !== null, now) };
  }

  // WHAT: List a cohort's contributions (provider/admin only) — SAFE rows (no
  //       identities) + an eligible-count summary (consent-aware).
  // WHY: GET /api/v1/foundation/cohorts/:id/contributions.
  async listContributionsForCaller(
    sessionToken: string,
    cohortProductId: string,
  ): Promise<ListContributionsResult> {
    const v = await this.authService.validateSession(sessionToken, "read");
    if (!v.valid) return { ok: false, code: v.code };

    const cohort = await this.loadManageableCohort(
      cohortProductId,
      v.entity_id,
      v.allowed_operations,
    );
    if (cohort === null) return { ok: false, code: "COHORT_PRODUCT_NOT_FOUND" };

    const now = new Date();
    const rows = await prisma.cohortContribution.findMany({
      where: { cohort_product_id: cohort.cohort_product_id, deleted_at: null },
      orderBy: { created_at: "desc" },
      take: 500,
    });

    // Resolve live consent state for the rows that have a consent basis.
    const consentIds = [
      ...new Set(rows.map((r) => r.consent_record_id).filter((x): x is string => x !== null)),
    ];
    const consents =
      consentIds.length > 0
        ? await prisma.marketplaceDataConsent.findMany({
            where: { consent_id: { in: consentIds } },
          })
        : [];
    const activeById = new Map<string, boolean>();
    for (const c of consents) {
      activeById.set(
        c.consent_id,
        c.revoked_at === null &&
          (c.expires_at === null || c.expires_at.getTime() > now.getTime()),
      );
    }

    const views = rows.map((r) => {
      const consentActive =
        r.consent_record_id === null ? true : (activeById.get(r.consent_record_id) ?? false);
      return this.toSafe(r, consentActive, now);
    });
    const eligibleCount = views.filter((view) => view.eligible).length;

    return {
      ok: true,
      contributions: views,
      summary: {
        total: views.length,
        eligible_count: eligibleCount,
        threshold_enforced: false,
        minimum_cohort_size: cohort.minimum_cohort_size,
      },
    };
  }

  // WHAT: Revoke a contribution (provider/admin only) → status REVOKED.
  // WHY: POST /api/v1/foundation/cohorts/:id/contributions/:cid/revoke.
  async revokeContributionForCaller(
    sessionToken: string,
    cohortProductId: string,
    contributionId: string,
  ): Promise<RevokeContributionResult> {
    const v = await this.authService.validateSession(sessionToken, "write");
    if (!v.valid) return { ok: false, code: v.code };

    const cohort = await this.loadManageableCohort(
      cohortProductId,
      v.entity_id,
      v.allowed_operations,
    );
    if (cohort === null) return { ok: false, code: "COHORT_PRODUCT_NOT_FOUND" };

    const row = await prisma.cohortContribution.findFirst({
      where: {
        contribution_id: contributionId,
        cohort_product_id: cohort.cohort_product_id,
        deleted_at: null,
      },
    });
    if (row === null) return { ok: false, code: "CONTRIBUTION_NOT_FOUND" };

    const now = new Date();
    const updated = await prisma.cohortContribution.update({
      where: { contribution_id: contributionId },
      data: { status: "REVOKED", revoked_at: now },
    });

    await writeAuditEvent({
      event_type: "COHORT_CONTRIBUTION_REVOKED",
      outcome: "SUCCESS",
      actor_entity_id: v.entity_id,
      details: {
        action: "COHORT_CONTRIBUTION_REVOKED",
        cohort_product_id: cohort.cohort_product_id,
        contribution_id: updated.contribution_id,
        previous_status: row.status,
        status: updated.status,
      },
    });

    const consentActive =
      updated.consent_record_id === null
        ? true
        : (await this.consentState(updated.consent_record_id, now)).active;
    return { ok: true, contribution: this.toSafe(updated, consentActive, now) };
  }
}
