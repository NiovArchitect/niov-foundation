// FILE: high-sensitivity-review.service.ts
// PURPOSE: Phase 1297-A — the governed HUMAN-REVIEW WORKFLOW ENGINE that turns a
//          REQUIRES_REVIEW high-sensitivity policy decision (per the 1296-A
//          evaluator) into a durable, auditable, scope-bound, EXPIRING review
//          record — or a recorded denial. A review approval is NOT a permanent
//          role and NOT a general bypass: it permits ONLY the exact safe access
//          mode(s) a HUMAN reviewer authorized, for ONE buyer + package +
//          intended use, until it expires or is revoked. It NEVER grants raw
//          body access and NEVER enables training / model-improvement /
//          redistribution / commercial use (those invariant columns are pinned
//          false). An approval does NOT bypass consent, opt-in, revocation,
//          expiry, DMW scope, COSMP, ProofOfAccess, or the marketplace grant
//          rules — it only upgrades the high-sensitivity gate's REQUIRES_REVIEW
//          into an effective ALLOW for the approved safe mode, re-checked at
//          BOTH grant creation and read time.
//
//          Foundation remains authority. The high-sensitivity evaluator stays
//          the first gate. CHILDREN data is never approvable here (recorded
//          DENIED). No AI_AGENT / DEVICE / APPLICATION may review. A buyer may
//          never self-approve another provider's data; a personal-DMW owner may
//          self-review their OWN package only for PROOF_ONLY, always audited.
//
//          Phase 1299-A — ORG-COMPLIANCE REVIEWER DELEGATION. Reviewer
//          eligibility is widened from "only the provider entity" to a governed
//          delegation model: the provider owner (or personal-DMW owner) PLUS
//          authorized humans inside the provider's ORG (org admins, TAR
//          can_admin_org, compliance / privacy / legal / DPO, data-governance,
//          supervisors) may approve / deny on the org's behalf. The decision is
//          a PURE evaluator (high-sensitivity-reviewer-policy.ts) over facts the
//          service resolves (Entity type, EntityMembership role, TAR authority,
//          provider-org membership). Delegation grants NO new access rights — an
//          approval still only permits the category's safe modes, never raw
//          body / training / model-improvement / redistribution / commercial.
//          Cross-tenant reviewers stay invisible (REVIEW_NOT_FOUND) and DENIED.
//          REVOKE keeps the shipped buyer stop-use (provider OR buyer OR an
//          org-authorized reviewer may revoke). Every eligibility decision is
//          audited (HIGH_SENSITIVITY_REVIEWER_ELIGIBILITY_EVALUATED).
//
// CONNECTS TO:
//   - apps/api/src/services/foundation/high-sensitivity-policy.ts
//     (evaluateHighSensitivityAccess + highSensitivityReviewApprovableModes +
//     isHighSensitivityPackage — the policy gate; this engine adds the human
//     decision on top, never replacing it).
//   - apps/api/src/services/foundation/marketplace.service.ts
//     (createDataGrantForCaller consults resolveReviewDecisionForGrantRead).
//   - apps/api/src/services/foundation/marketplace-data-delivery.service.ts
//     (read re-checks the review via resolveReviewDecisionForGrantRead).
//   - packages/database HighSensitivityReview / MarketplaceDataPackage /
//     MarketplaceListing / Entity (read) + writeAuditEvent.
//   - apps/api/src/services/auth.service.ts (validateSession) — the gate.
//   - apps/api/src/routes/foundation.routes.ts — the HTTP surface.
//
// SAFETY: review records carry NO raw content (no payload, content_hash,
// storage_location, embedding, device_id, PII). sensitive_categories are
// category LABELS (already surfaced in the package + audit). Enumeration-safe
// REVIEW_NOT_FOUND. Approval can never broaden access mode / use rights / raw
// body. Every transition is audited.

import {
  prisma,
  writeAuditEvent,
  type DataAccessMode,
  type DataSensitivityClass,
  type Entity,
  type HighSensitivityReview,
} from "@niov/database";
import type { AuthService } from "../auth.service.js";
import { getOrgEntityId } from "../governance/org.js";
import {
  evaluateHighSensitivityAccess,
  highSensitivityReviewApprovableModes,
  isHighSensitivityPackage,
  HIGH_SENSITIVITY_REVIEW_GATE_REASONS,
} from "./high-sensitivity-policy.js";
import {
  confersOrgReviewVisibility,
  evaluateHighSensitivityReviewerEligibility,
  type ReviewerEligibilityFacts,
} from "./high-sensitivity-reviewer-policy.js";

// Default approval lifetime when the reviewer does not specify one (no
// perpetual high-sensitivity access — every approval expires).
const DEFAULT_REVIEW_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
// High-sensitivity ceiling for a review approval (1298-A — no long-lived
// high-sensitivity access; mirrors the retention evaluator's 90-day cap).
const MAX_REVIEW_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

// SAFE projection of a review record (no raw content — labels + lifecycle only).
export interface SafeReviewView {
  review_id: string;
  listing_id: string;
  data_package_id: string;
  grant_id: string | null;
  provider_entity_id: string;
  provider_org_entity_id: string | null;
  buyer_entity_id: string;
  buyer_org_entity_id: string | null;
  requester_entity_id: string;
  reviewer_entity_id: string | null;
  intended_use: string;
  access_mode: DataAccessMode;
  sensitivity_class: DataSensitivityClass;
  sensitive_categories: string[];
  policy_decision: string;
  policy_reason_codes: string[];
  approved_access_modes: string[];
  status: string;
  // Invariants — surfaced so a consumer can see they are pinned.
  raw_body_allowed: false;
  proof_required: boolean;
  training_allowed: boolean;
  model_improvement_allowed: boolean;
  redistribution_allowed: boolean;
  commercial_use_allowed: boolean;
  expires_at: string | null;
  reviewed_at: string | null;
  revoked_at: string | null;
  denial_reason: string | null;
  created_at: string;
}

export type ReviewResult =
  | { ok: true; review: SafeReviewView }
  | { ok: false; code: string; denied_reasons?: string[] };

// 1299-B — the visibility scopes for listing reviews.
//   mine          — reviews where the caller is provider OR buyer (default).
//   org_reviewable — PENDING reviews in the caller's provider org (excluding the
//                    caller's own purchases); authorized org reviewers only.
//   org_history    — ALL reviews (any status) in the caller's provider org;
//                    authorized org reviewers only.
export type ReviewListScope = "mine" | "org_reviewable" | "org_history";
export const REVIEW_LIST_SCOPES: ReadonlySet<string> = new Set([
  "mine",
  "org_reviewable",
  "org_history",
]);

// 1299-B — safe lifecycle/status counts for an org-scoped review list.
export interface ReviewSummary {
  pending_review_count: number;
  approved_count: number;
  denied_count: number;
  revoked_count: number;
  expired_count: number;
  expiring_soon_count: number; // APPROVED + expires within 7 days
}

export type ReviewListResult =
  | { ok: true; reviews: SafeReviewView[]; scope: ReviewListScope; summary?: ReviewSummary }
  | { ok: false; code: string };

// 1299-B — a single SAFE audit/lifecycle projection row (labels only — never raw
// content / payload / storage_location / embedding / content_hash / secrets).
export interface SafeReviewAuditEvent {
  event_type: string;
  outcome: string;
  timestamp: string;
  denial_reason: string | null;
  status: string | null;
  access_mode: string | null;
  candidate_reviewer_entity_id: string | null;
  reviewer_scope: string | null;
  reviewer_reason_codes: string[];
}
export type ReviewAuditResult =
  | { ok: true; review: SafeReviewView; audit_events: SafeReviewAuditEvent[] }
  | { ok: false; code: string };

// The 6 high-sensitivity review lifecycle audit literals projected by the audit
// surface (1299-B). Kept local so the projection query stays self-documenting.
const REVIEW_AUDIT_EVENT_TYPES = [
  "HIGH_SENSITIVITY_REVIEW_CREATED",
  "HIGH_SENSITIVITY_REVIEW_APPROVED",
  "HIGH_SENSITIVITY_REVIEW_DENIED",
  "HIGH_SENSITIVITY_REVIEW_REVOKED",
  "HIGH_SENSITIVITY_REVIEW_EXPIRED",
  "HIGH_SENSITIVITY_REVIEWER_ELIGIBILITY_EVALUATED",
] as const;

function toSafeReview(r: HighSensitivityReview): SafeReviewView {
  return {
    review_id: r.review_id,
    listing_id: r.listing_id,
    data_package_id: r.data_package_id,
    grant_id: r.grant_id,
    provider_entity_id: r.provider_entity_id,
    provider_org_entity_id: r.provider_org_entity_id,
    buyer_entity_id: r.buyer_entity_id,
    buyer_org_entity_id: r.buyer_org_entity_id,
    requester_entity_id: r.requester_entity_id,
    reviewer_entity_id: r.reviewer_entity_id,
    intended_use: r.intended_use,
    access_mode: r.access_mode,
    sensitivity_class: r.sensitivity_class,
    sensitive_categories: r.sensitive_categories,
    policy_decision: r.policy_decision,
    policy_reason_codes: r.policy_reason_codes,
    approved_access_modes: r.approved_access_modes,
    status: r.status,
    raw_body_allowed: false,
    proof_required: r.proof_required,
    training_allowed: r.training_allowed,
    model_improvement_allowed: r.model_improvement_allowed,
    redistribution_allowed: r.redistribution_allowed,
    commercial_use_allowed: r.commercial_use_allowed,
    expires_at: r.expires_at?.toISOString() ?? null,
    reviewed_at: r.reviewed_at?.toISOString() ?? null,
    revoked_at: r.revoked_at?.toISOString() ?? null,
    denial_reason: r.denial_reason,
    created_at: r.created_at.toISOString(),
  };
}

// An all-zero review summary (returned for unauthorized/empty org scopes).
function emptyReviewSummary(): ReviewSummary {
  return {
    pending_review_count: 0,
    approved_count: 0,
    denied_count: 0,
    revoked_count: 0,
    expired_count: 0,
    expiring_soon_count: 0,
  };
}

// Read one string field from an audit-details JSON blob, or null. Used to
// cherry-pick SAFE fields field-by-field (never a blind spread — a future
// emitter must not leak a new field through this projection).
function detailString(details: unknown, key: string): string | null {
  if (typeof details !== "object" || details === null) return null;
  const v = (details as Record<string, unknown>)[key];
  return typeof v === "string" ? v : null;
}

// Project ONE audit row into the SAFE review-audit shape (1299-B). Only the
// enumerated label fields are surfaced; raw content can never appear because it
// is never read here.
function toSafeReviewAuditEvent(e: {
  event_type: string;
  outcome: string;
  timestamp: Date;
  denial_reason: string | null;
  details: unknown;
}): SafeReviewAuditEvent {
  const codes = (() => {
    if (typeof e.details !== "object" || e.details === null) return [];
    const v = (e.details as Record<string, unknown>)["reviewer_reason_codes"];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  })();
  return {
    event_type: e.event_type,
    outcome: e.outcome,
    timestamp: e.timestamp.toISOString(),
    denial_reason: e.denial_reason,
    status: detailString(e.details, "status"),
    access_mode: detailString(e.details, "access_mode"),
    candidate_reviewer_entity_id: detailString(e.details, "candidate_reviewer_entity_id"),
    reviewer_scope: detailString(e.details, "reviewer_scope"),
    reviewer_reason_codes: codes,
  };
}

// Safe audit details for a review lifecycle event (labels only — never raw
// content / PII / secrets).
function reviewAuditDetails(
  action: string,
  r: HighSensitivityReview,
): Record<string, unknown> {
  return {
    action,
    review_id: r.review_id,
    listing_id: r.listing_id,
    data_package_id: r.data_package_id,
    grant_id: r.grant_id,
    sensitivity_class: r.sensitivity_class,
    sensitive_categories: r.sensitive_categories,
    intended_use: r.intended_use,
    access_mode: r.access_mode,
    status: r.status,
    policy_decision: r.policy_decision,
    reason_codes: r.policy_reason_codes,
    approved_access_modes: r.approved_access_modes,
    reviewer_entity_id: r.reviewer_entity_id,
  };
}

// WHAT: Resolve whether a live, APPROVED human review authorizes a requested
//       access mode for a buyer + package + intended use.
// INPUT: buyer entity id, data package id, intended use, the requested mode.
// OUTPUT: { allowed, review_id, approved_access_modes, code }.
// WHY: The shared resolver consulted at BOTH grant creation (marketplace.service)
//      and read time (marketplace-data-delivery). It also lazily EXPIRES any
//      matching approval whose expires_at has passed (audited), so a stale
//      approval can never authorize access. It NEVER reads or returns raw
//      content — only the review's own lifecycle.
export async function resolveReviewDecisionForGrantRead(
  buyerEntityId: string,
  dataPackageId: string,
  intendedUse: string,
  requestedMode: DataAccessMode,
): Promise<{
  allowed: boolean;
  review_id: string | null;
  approved_access_modes: DataAccessMode[];
  // The live review's expiry (1298-A) — grant creation caps the grant's expiry
  // to this so a grant never outlives the human review that authorized it.
  expires_at: Date | null;
  code: string;
}> {
  const candidates = await prisma.highSensitivityReview.findMany({
    where: {
      buyer_entity_id: buyerEntityId,
      data_package_id: dataPackageId,
      intended_use: intendedUse,
      status: "APPROVED",
    },
    orderBy: { reviewed_at: "desc" },
  });

  const now = new Date();
  let live: HighSensitivityReview | null = null;
  for (const c of candidates) {
    if (c.expires_at !== null && c.expires_at <= now) {
      // Lazily expire a lapsed approval and audit the transition.
      const expired = await prisma.highSensitivityReview.update({
        where: { review_id: c.review_id },
        data: { status: "EXPIRED" },
      });
      await writeAuditEvent({
        event_type: "HIGH_SENSITIVITY_REVIEW_EXPIRED",
        outcome: "SUCCESS",
        actor_entity_id: buyerEntityId,
        details: reviewAuditDetails("HIGH_SENSITIVITY_REVIEW_EXPIRED", expired),
      });
      continue;
    }
    live = c;
    break;
  }

  if (live === null)
    return { allowed: false, review_id: null, approved_access_modes: [], expires_at: null, code: "REVIEW_REQUIRED" };

  const approved = live.approved_access_modes as DataAccessMode[];
  if (!approved.includes(requestedMode))
    return {
      allowed: false,
      review_id: live.review_id,
      approved_access_modes: approved,
      expires_at: live.expires_at,
      code: "REVIEW_MODE_NOT_APPROVED",
    };

  return {
    allowed: true,
    review_id: live.review_id,
    approved_access_modes: approved,
    expires_at: live.expires_at,
    code: "REVIEW_OK",
  };
}

// The reason codes a human review can lift (re-exported reference for callers).
export const REVIEW_GATE_REASONS: ReadonlySet<string> = new Set(
  HIGH_SENSITIVITY_REVIEW_GATE_REASONS,
);

export class FoundationHighSensitivityReviewService {
  constructor(private readonly authService: AuthService) {}

  // Resolve the caller's org parent, or null for a personal DMW (self-as-org).
  private async orgOrNull(entityId: string): Promise<string | null> {
    try {
      const org = await getOrgEntityId(entityId);
      return org === entityId ? null : org;
    } catch {
      return null;
    }
  }

  // WHAT: Resolve a candidate reviewer's PROVIDER-ORG-scoped membership + TAR
  //        facts. SINGLE source of truth shared by the approval gate
  //        (checkReviewerEligibility) and the 1299-B visibility gate
  //        (resolveOrgReviewerContext) so the two can never drift.
  // INPUT: the candidate entity id + the provider org id.
  // OUTPUT: the org-membership facts the pure evaluator consumes.
  // WHY: membership is resolved strictly by (child_id, parent_id = provider org)
  //      — a role in any OTHER org never leaks in (confused-deputy guard); TAR
  //      can_admin_org is the GLOBAL per-entity flag, recorded as corroborating
  //      only (the evaluator never elevates on it alone — Founder ruling 1299-A).
  private async resolveOrgMembershipFacts(
    entityId: string,
    providerOrgEntityId: string,
  ): Promise<{
    reviewer_in_provider_org: boolean;
    membership_is_admin: boolean;
    membership_role_title: string | null;
    membership_active: boolean;
    reviewer_can_admin_org: boolean;
  }> {
    // Resolve WITHOUT an is_active filter so reviewer_in_provider_org and
    // membership_active are both truthful (prefer active, then admin).
    const membership = await prisma.entityMembership.findFirst({
      where: { child_id: entityId, parent_id: providerOrgEntityId },
      orderBy: [{ is_active: "desc" }, { is_admin: "desc" }],
    });
    const tar = await prisma.tokenAttributeRepository.findUnique({
      where: { entity_id: entityId },
    });
    return {
      reviewer_in_provider_org: membership !== null,
      membership_is_admin: membership?.is_admin ?? false,
      membership_role_title: membership?.role_title ?? null,
      membership_active: membership?.is_active ?? false,
      reviewer_can_admin_org:
        tar !== null && tar.status === "ACTIVE" && tar.can_admin_org === true,
    };
  }

  // WHAT: Decide whether a caller is an AUTHORIZED ORG REVIEWER for their own
  //        provider org (the coarse gate for org-wide review VISIBILITY).
  // INPUT: the caller's entity id.
  // OUTPUT: { org, authorized, scope } — org is the caller's COMPANY org (or
  //         null), authorized is true only for an org-reviewer scope.
  // WHY: 1299-B list (org_reviewable / org_history) + audit visibility. Reuses
  //      the SAME pure evaluator as the approval gate over a synthetic generic
  //      (non-personal, non-CHILDREN, not-provider, not-buyer) review, so the
  //      visibility gate inherits the confused-deputy + TAR rulings and can never
  //      be looser than approval. Non-human / orgless / unauthorized → not
  //      authorized. A multi-org caller keys off the membership resolved for the
  //      org returned by getOrgEntityId (worst case under-visibility, never a
  //      leak).
  private async resolveOrgReviewerContext(
    callerEntityId: string,
  ): Promise<{ org: string | null; authorized: boolean; scope: string }> {
    const caller: Entity | null = await prisma.entity.findFirst({
      where: { entity_id: callerEntityId, deleted_at: null },
    });
    if (caller === null) return { org: null, authorized: false, scope: "DENIED" };
    let org: string | null;
    try {
      org = await getOrgEntityId(callerEntityId);
    } catch {
      org = null;
    }
    if (org === null) return { org: null, authorized: false, scope: "DENIED" };

    const m = await this.resolveOrgMembershipFacts(callerEntityId, org);
    const decision = evaluateHighSensitivityReviewerEligibility({
      reviewer_entity_type: caller.entity_type,
      reviewer_is_provider: false,
      reviewer_is_buyer: false,
      package_is_personal: false,
      reviewer_in_provider_org: m.reviewer_in_provider_org,
      membership_is_admin: m.membership_is_admin,
      membership_role_title: m.membership_role_title,
      membership_active: m.membership_active,
      reviewer_can_admin_org: m.reviewer_can_admin_org,
      sensitive_categories: [],
    });
    return {
      org,
      authorized: confersOrgReviewVisibility(decision),
      scope: decision.reviewer_scope,
    };
  }

  // WHAT: Open (or fetch the existing) human review for a REQUIRES_REVIEW
  //        high-sensitivity data package the caller (buyer) wants to access.
  // INPUT: token + listing_id + { intended_use }.
  // OUTPUT: { ok:true, review } (PENDING_REVIEW, or a recorded DENIED for
  //         non-approvable categories like CHILDREN) or { ok:false, code }.
  // WHY: POST /api/v1/foundation/high-sensitivity/reviews. Re-runs the
  //      evaluator server-side; only a genuine REQUIRES_REVIEW becomes a
  //      PENDING review. ALLOW packages need no review; DENY categories are
  //      recorded as DENIED and can never be approved.
  async createReviewForCaller(
    sessionToken: string,
    listingId: string,
    input: { intended_use: string },
  ): Promise<ReviewResult> {
    const validation = await this.authService.validateSession(sessionToken, "write");
    if (!validation.valid) return { ok: false, code: validation.code };
    const buyerEntityId = validation.entity_id;

    if (typeof input.intended_use !== "string" || input.intended_use.length === 0)
      return { ok: false, code: "INVALID_REQUEST" };

    const buyerOrg = await this.orgOrNull(buyerEntityId);
    const listing = await prisma.marketplaceListing.findFirst({
      where: { listing_id: listingId, deleted_at: null },
    });
    // Enumeration-safe visibility: own listing, or PUBLISHED in the buyer's org.
    const visible =
      listing !== null &&
      listing.listing_type === "DATA_PACKAGE" &&
      (listing.provider_entity_id === buyerEntityId ||
        (listing.status === "PUBLISHED" &&
          listing.provider_org_entity_id !== null &&
          listing.provider_org_entity_id === buyerOrg));
    if (!visible || listing === null) return { ok: false, code: "LISTING_NOT_FOUND" };

    const pkg = await prisma.marketplaceDataPackage.findFirst({
      where: { listing_id: listingId, deleted_at: null },
    });
    if (pkg === null) return { ok: false, code: "DATA_PACKAGE_NOT_FOUND" };

    // Reviews only apply to high-sensitivity packages.
    if (!isHighSensitivityPackage(pkg.sensitivity_class, pkg.sensitive_categories))
      return { ok: false, code: "REVIEW_NOT_APPLICABLE" };

    const hs = evaluateHighSensitivityAccess({
      sensitivity_class: pkg.sensitivity_class,
      sensitive_categories: pkg.sensitive_categories,
      access_mode: pkg.access_mode,
      intended_use: input.intended_use,
      consent_confirmed: true,
      opt_in_confirmed: true,
      training_allowed: pkg.training_allowed,
      model_improvement_allowed: pkg.model_improvement_allowed,
      redistribution_allowed: pkg.redistribution_allowed,
      commercial_use_allowed: pkg.commercial_use_allowed,
      depersonalized_only: pkg.depersonalized_only,
      aggregate_only: pkg.aggregate_only,
      retention_policy: pkg.retention_policy,
    });

    // ALLOW packages auto-pass the gate — no human review is needed.
    if (hs.decision.startsWith("ALLOW"))
      return { ok: false, code: "REVIEW_NOT_REQUIRED" };

    const approvable = highSensitivityReviewApprovableModes({
      sensitivity_class: pkg.sensitivity_class,
      sensitive_categories: pkg.sensitive_categories,
      access_mode: pkg.access_mode,
      intended_use: input.intended_use,
      consent_confirmed: true,
      opt_in_confirmed: true,
      retention_policy: pkg.retention_policy,
    });

    // Idempotent: return an existing OPEN review for this exact scope.
    const existing = await prisma.highSensitivityReview.findFirst({
      where: {
        buyer_entity_id: buyerEntityId,
        data_package_id: pkg.data_package_id,
        intended_use: input.intended_use,
        status: { in: ["PENDING_REVIEW", "APPROVED"] },
      },
      orderBy: { created_at: "desc" },
    });
    if (existing !== null) return { ok: true, review: toSafeReview(existing) };

    // DENY decision (e.g. CHILDREN) or a non-approvable category (unknown) →
    // record a DENIED review (auditable, can never be approved). Never a PENDING
    // that could be approved generically.
    const isDeny = hs.decision === "DENY" || approvable.length === 0;
    const status = isDeny ? "DENIED" : "PENDING_REVIEW";

    const created = await prisma.highSensitivityReview.create({
      data: {
        listing_id: listingId,
        data_package_id: pkg.data_package_id,
        provider_entity_id: pkg.provider_entity_id,
        provider_org_entity_id: pkg.provider_org_entity_id,
        buyer_entity_id: buyerEntityId,
        buyer_org_entity_id: buyerOrg,
        requester_entity_id: buyerEntityId,
        intended_use: input.intended_use,
        access_mode: pkg.access_mode,
        sensitivity_class: pkg.sensitivity_class,
        sensitive_categories: pkg.sensitive_categories,
        policy_decision: hs.decision,
        policy_reason_codes: hs.reason_codes,
        status,
        ...(isDeny
          ? { denial_reason: hs.reason_codes[0] ?? "HIGH_SENSITIVITY_DEFAULT_DENY", reviewed_at: new Date() }
          : {}),
      },
    });

    await writeAuditEvent({
      event_type: isDeny ? "HIGH_SENSITIVITY_REVIEW_DENIED" : "HIGH_SENSITIVITY_REVIEW_CREATED",
      outcome: isDeny ? "DENIED" : "SUCCESS",
      actor_entity_id: buyerEntityId,
      denial_reason: isDeny ? created.denial_reason : null,
      details: reviewAuditDetails(
        isDeny ? "HIGH_SENSITIVITY_REVIEW_DENIED" : "HIGH_SENSITIVITY_REVIEW_CREATED",
        created,
      ),
    });

    return { ok: true, review: toSafeReview(created) };
  }

  // Load a review the caller may see (enumeration-safe). Visible to the provider
  // entity, the buyer entity, OR an active member of the provider's org (1299-A
  // delegation). A cross-tenant caller gets null → REVIEW_NOT_FOUND (invisible).
  private async loadReviewForReviewer(
    reviewId: string,
    callerEntityId: string,
  ): Promise<HighSensitivityReview | null> {
    const r = await prisma.highSensitivityReview.findFirst({
      where: { review_id: reviewId },
    });
    if (r === null) return null;
    if (
      r.provider_entity_id === callerEntityId ||
      r.buyer_entity_id === callerEntityId
    )
      return r;
    // Org-delegated visibility — the caller must have an ACTIVE membership in
    // the PROVIDER's org specifically (not merely "some org"); a membership in
    // any other org confers no visibility (confused-deputy guard). Personal-DMW
    // packages (provider_org null) are visible only to the provider/buyer above.
    if (r.provider_org_entity_id !== null) {
      const m = await prisma.entityMembership.findFirst({
        where: {
          child_id: callerEntityId,
          parent_id: r.provider_org_entity_id,
          is_active: true,
        },
      });
      if (m !== null) return r;
    }
    return null;
  }

  // WHAT: Read one review (provider, buyer, or an org-delegated reviewer).
  async getReviewForCaller(sessionToken: string, reviewId: string): Promise<ReviewResult> {
    const validation = await this.authService.validateSession(sessionToken, "read");
    if (!validation.valid) return { ok: false, code: validation.code };
    const r = await this.loadReviewForReviewer(reviewId, validation.entity_id);
    if (r === null) return { ok: false, code: "REVIEW_NOT_FOUND" };
    return { ok: true, review: toSafeReview(r) };
  }

  // WHAT: List reviews the caller may see, by scope (1299-B). Scope-safe.
  // INPUT: token + optional scope (default "mine").
  // OUTPUT: { ok:true, reviews, scope, summary? } or { ok:false, code }.
  // WHY: "mine" = provider OR buyer (the shipped behavior). "org_reviewable" /
  //      "org_history" expose the caller's PROVIDER-ORG reviews, gated by the
  //      coarse org-reviewer authorization (same evaluator as approval; TAR +
  //      confused-deputy rulings inherited). A non-human / unauthorized / orgless
  //      / cross-tenant caller gets an EMPTY list (enumeration-safe, never another
  //      org's data). Personal-DMW reviews (provider_org null) never appear in an
  //      org scope. Visibility is NOT approval authority — approve/deny/revoke
  //      still re-check eligibility per review.
  async listReviewsForCaller(
    sessionToken: string,
    scope: ReviewListScope = "mine",
  ): Promise<ReviewListResult> {
    const validation = await this.authService.validateSession(sessionToken, "read");
    if (!validation.valid) return { ok: false, code: validation.code };
    const callerEntityId = validation.entity_id;

    if (scope === "mine") {
      const rows = await prisma.highSensitivityReview.findMany({
        where: {
          OR: [
            { provider_entity_id: callerEntityId },
            { buyer_entity_id: callerEntityId },
          ],
        },
        orderBy: { created_at: "desc" },
        take: 100,
      });
      return { ok: true, reviews: rows.map(toSafeReview), scope };
    }

    // Org scopes — require an authorized org reviewer in the caller's org.
    const ctx = await this.resolveOrgReviewerContext(callerEntityId);
    if (ctx.org === null || !ctx.authorized)
      return { ok: true, reviews: [], scope, summary: emptyReviewSummary() };

    const baseWhere =
      scope === "org_reviewable"
        ? {
            provider_org_entity_id: ctx.org,
            status: "PENDING_REVIEW" as const,
            // A reviewer may never browse their OWN purchases as "reviewable"
            // (no self-serve approval surface).
            NOT: { buyer_entity_id: callerEntityId },
          }
        : { provider_org_entity_id: ctx.org };

    const rows = await prisma.highSensitivityReview.findMany({
      where: baseWhere,
      orderBy: { created_at: "desc" },
      take: 200,
    });
    const summary = await this.orgReviewSummary(ctx.org);
    return { ok: true, reviews: rows.map(toSafeReview), scope, summary };
  }

  // Compute SAFE status counts for an org's reviews (1299-B summary).
  private async orgReviewSummary(orgEntityId: string): Promise<ReviewSummary> {
    const grouped = await prisma.highSensitivityReview.groupBy({
      by: ["status"],
      where: { provider_org_entity_id: orgEntityId },
      _count: { _all: true },
    });
    const count = (s: string): number =>
      grouped.find((g) => g.status === s)?._count._all ?? 0;
    const soon = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const expiring_soon_count = await prisma.highSensitivityReview.count({
      where: {
        provider_org_entity_id: orgEntityId,
        status: "APPROVED",
        expires_at: { not: null, lte: soon },
      },
    });
    return {
      pending_review_count: count("PENDING_REVIEW"),
      approved_count: count("APPROVED"),
      denied_count: count("DENIED"),
      revoked_count: count("REVOKED"),
      expired_count: count("EXPIRED"),
      expiring_soon_count,
    };
  }

  // WHAT: Project the SAFE lifecycle/eligibility audit trail for one review.
  // INPUT: token + review_id.
  // OUTPUT: { ok:true, review, audit_events } or { ok:false, code }.
  // WHY: GET /high-sensitivity/reviews/:id/audit. Visible to the provider, the
  //      buyer, OR an AUTHORIZED provider-org reviewer (NOTE: tighter than the
  //      GET-review loader, which admits any active org member — the audit trail
  //      reveals who-attempted + eligibility outcomes, so it is reviewer-gated).
  //      Personal-DMW review audit is visible only to provider/buyer. Cross-tenant
  //      → REVIEW_NOT_FOUND (invisible). Projects ONLY safe labels (never raw
  //      content); audit details are cherry-picked field-by-field (no blind
  //      spread) so a future emitter cannot leak through this surface.
  async getReviewAuditForCaller(
    sessionToken: string,
    reviewId: string,
  ): Promise<ReviewAuditResult> {
    const validation = await this.authService.validateSession(sessionToken, "read");
    if (!validation.valid) return { ok: false, code: validation.code };
    const callerEntityId = validation.entity_id;

    const review = await prisma.highSensitivityReview.findFirst({
      where: { review_id: reviewId },
    });
    if (review === null) return { ok: false, code: "REVIEW_NOT_FOUND" };

    const isParty =
      review.provider_entity_id === callerEntityId ||
      review.buyer_entity_id === callerEntityId;
    if (!isParty) {
      // Non-party callers must be an AUTHORIZED reviewer in the review's
      // provider org (personal-DMW reviews have no org → invisible to non-party).
      if (review.provider_org_entity_id === null)
        return { ok: false, code: "REVIEW_NOT_FOUND" };
      const ctx = await this.resolveOrgReviewerContext(callerEntityId);
      if (!ctx.authorized || ctx.org !== review.provider_org_entity_id)
        return { ok: false, code: "REVIEW_NOT_FOUND" };
    }

    const events = await prisma.auditEvent.findMany({
      where: {
        event_type: { in: [...REVIEW_AUDIT_EVENT_TYPES] },
        details: { path: ["review_id"], equals: reviewId },
      },
      orderBy: { timestamp: "asc" },
      take: 200,
    });

    return {
      ok: true,
      review: toSafeReview(review),
      audit_events: events.map(toSafeReviewAuditEvent),
    };
  }

  // WHAT: Resolve the reviewer's facts and decide eligibility via the PURE
  //       evaluator, auditing the decision (1299-A delegation).
  // INPUT: the review row + the candidate reviewer's entity id.
  // OUTPUT: { eligible, code, scope, reason_codes }. code is null when eligible,
  //         else the first closed reviewer reason code (the failure code the
  //         caller sees). Always emits HIGH_SENSITIVITY_REVIEWER_ELIGIBILITY_
  //         EVALUATED (SUCCESS when eligible, DENIED otherwise) per RULE 4.
  // WHY: The service owns all I/O (Entity type, provider-org membership, the
  //      reviewer's EntityMembership role, TAR can_admin_org); the evaluator owns
  //      the policy. Cross-tenant is invisible at the loader and DENIED here.
  private async checkReviewerEligibility(
    review: HighSensitivityReview,
    reviewerEntityId: string,
  ): Promise<{ eligible: boolean; code: string | null; scope: string; reason_codes: string[] }> {
    const reviewer: Entity | null = await prisma.entity.findFirst({
      where: { entity_id: reviewerEntityId, deleted_at: null },
    });
    if (reviewer === null) {
      await this.auditReviewerEligibility(review, reviewerEntityId, false, "DENIED", ["REVIEWER_NOT_FOUND"]);
      return { eligible: false, code: "ENTITY_NOT_FOUND", scope: "DENIED", reason_codes: ["ENTITY_NOT_FOUND"] };
    }

    const packageIsPersonal = review.provider_org_entity_id === null;

    // Reviewer facts MUST come from the PROVIDER ORG that owns the package — a
    // reviewer's admin / compliance role in ANY OTHER org must never authorize
    // here (confused-deputy guard). The membership is resolved strictly by
    // (child_id = reviewer, parent_id = provider org). Personal-DMW packages
    // have no org to delegate into, so the org facts stay false/null and only
    // the owner / provider path can approve.
    // Org facts come from the SINGLE shared resolver (provider-org-scoped
    // membership + TAR) so the approval gate and the 1299-B visibility gate can
    // never drift. Personal-DMW packages have no org to delegate into.
    const org = packageIsPersonal
      ? {
          reviewer_in_provider_org: false,
          membership_is_admin: false,
          membership_role_title: null,
          membership_active: false,
          reviewer_can_admin_org: false,
        }
      : await this.resolveOrgMembershipFacts(
          reviewerEntityId,
          review.provider_org_entity_id as string,
        );

    const facts: ReviewerEligibilityFacts = {
      reviewer_entity_type: reviewer.entity_type,
      reviewer_is_provider: review.provider_entity_id === reviewerEntityId,
      reviewer_is_buyer: review.buyer_entity_id === reviewerEntityId,
      package_is_personal: packageIsPersonal,
      reviewer_in_provider_org: org.reviewer_in_provider_org,
      membership_is_admin: org.membership_is_admin,
      membership_role_title: org.membership_role_title,
      membership_active: org.membership_active,
      reviewer_can_admin_org: org.reviewer_can_admin_org,
      sensitive_categories: review.sensitive_categories,
    };

    const decision = evaluateHighSensitivityReviewerEligibility(facts);
    await this.auditReviewerEligibility(
      review,
      reviewerEntityId,
      decision.eligible,
      decision.eligible ? "SUCCESS" : "DENIED",
      decision.reason_codes,
      decision.reviewer_scope,
    );

    return {
      eligible: decision.eligible,
      code: decision.eligible ? null : (decision.reason_codes[0] ?? "REVIEWER_NOT_ORG_AUTHORIZED"),
      scope: decision.reviewer_scope,
      reason_codes: decision.reason_codes,
    };
  }

  // Audit a reviewer-eligibility decision (labels only — no raw content).
  private async auditReviewerEligibility(
    review: HighSensitivityReview,
    reviewerEntityId: string,
    eligible: boolean,
    outcome: "SUCCESS" | "DENIED",
    reasonCodes: string[],
    scope = "DENIED",
  ): Promise<void> {
    await writeAuditEvent({
      event_type: "HIGH_SENSITIVITY_REVIEWER_ELIGIBILITY_EVALUATED",
      outcome,
      actor_entity_id: reviewerEntityId,
      denial_reason: eligible ? null : (reasonCodes[0] ?? null),
      details: {
        ...reviewAuditDetails("HIGH_SENSITIVITY_REVIEWER_ELIGIBILITY_EVALUATED", review),
        candidate_reviewer_entity_id: reviewerEntityId,
        reviewer_eligible: eligible,
        reviewer_scope: scope,
        reviewer_reason_codes: reasonCodes,
      },
    });
  }

  // WHAT: Approve a pending review for specific safe access mode(s).
  // INPUT: token + review_id + { approved_access_modes?, expires_at? }.
  // OUTPUT: { ok:true, review } (APPROVED) or { ok:false, code }.
  // WHY: POST /api/v1/foundation/high-sensitivity/reviews/:id/approve. The
  //      reviewer must be the human provider. Approval cannot broaden beyond the
  //      category's review-approvable modes; raw body + elevated rights stay
  //      pinned false; a mandatory expiry is set.
  async approveReviewForCaller(
    sessionToken: string,
    reviewId: string,
    input: { approved_access_modes?: string[]; expires_at?: string },
  ): Promise<ReviewResult> {
    const validation = await this.authService.validateSession(sessionToken, "write");
    if (!validation.valid) return { ok: false, code: validation.code };
    const reviewerEntityId = validation.entity_id;

    const review = await this.loadReviewForReviewer(reviewId, reviewerEntityId);
    if (review === null) return { ok: false, code: "REVIEW_NOT_FOUND" };
    if (review.status !== "PENDING_REVIEW")
      return { ok: false, code: "REVIEW_NOT_PENDING" };

    const eligibility = await this.checkReviewerEligibility(review, reviewerEntityId);
    if (!eligibility.eligible)
      return { ok: false, code: eligibility.code ?? "REVIEWER_NOT_ORG_AUTHORIZED" };

    // Category-aware approvable set (raw never; training/model-improvement
    // never; CHILDREN / unknown → empty).
    const approvable = highSensitivityReviewApprovableModes({
      sensitivity_class: review.sensitivity_class,
      sensitive_categories: review.sensitive_categories,
      access_mode: review.access_mode,
      intended_use: review.intended_use,
      consent_confirmed: true,
      opt_in_confirmed: true,
    });
    if (approvable.length === 0) return { ok: false, code: "REVIEW_NOT_APPROVABLE" };

    // The reviewer's requested modes (default to the safest available — the
    // originally-requested mode if approvable, else PROOF_ONLY/first).
    const requested: string[] = Array.isArray(input.approved_access_modes)
      ? input.approved_access_modes.filter((m) => typeof m === "string")
      : approvable.includes(review.access_mode)
        ? [review.access_mode]
        : approvable.includes("PROOF_ONLY")
          ? ["PROOF_ONLY"]
          : [approvable[0] as string];
    if (requested.length === 0) return { ok: false, code: "INVALID_APPROVED_MODES" };
    // Cannot broaden: every approved mode must be in the category's set.
    for (const m of requested)
      if (!(approvable as string[]).includes(m))
        return { ok: false, code: "APPROVED_MODE_NOT_ALLOWED" };

    // Personal-DMW self-review exception: a provider reviewing their OWN package
    // where they are also the buyer may approve ONLY PROOF_ONLY.
    const isSelfReview = review.buyer_entity_id === reviewerEntityId;
    if (isSelfReview && !(requested.length === 1 && requested[0] === "PROOF_ONLY"))
      return { ok: false, code: "SELF_REVIEW_NOT_PERMITTED" };

    // Mandatory expiry (default 30d); a provided expiry must be in the future
    // and within the high-sensitivity ceiling (1298-A — no long-lived approvals).
    let expiresAt: Date;
    if (typeof input.expires_at === "string" && input.expires_at.length > 0) {
      const parsed = new Date(input.expires_at);
      if (Number.isNaN(parsed.getTime()) || parsed <= new Date())
        return { ok: false, code: "INVALID_EXPIRY" };
      if (parsed.getTime() - Date.now() > MAX_REVIEW_TTL_MS)
        return { ok: false, code: "RETENTION_TOO_LONG_FOR_SENSITIVITY" };
      expiresAt = parsed;
    } else {
      expiresAt = new Date(Date.now() + DEFAULT_REVIEW_TTL_MS);
    }

    const updated = await prisma.highSensitivityReview.update({
      where: { review_id: reviewId },
      data: {
        status: "APPROVED",
        reviewer_entity_id: reviewerEntityId,
        approved_access_modes: requested,
        reviewed_at: new Date(),
        expires_at: expiresAt,
        // Invariants stay pinned (never relaxed by an approval).
        raw_body_allowed: false,
        proof_required: true,
        training_allowed: false,
        model_improvement_allowed: false,
        redistribution_allowed: false,
        commercial_use_allowed: false,
      },
    });

    await writeAuditEvent({
      event_type: "HIGH_SENSITIVITY_REVIEW_APPROVED",
      outcome: "SUCCESS",
      actor_entity_id: reviewerEntityId,
      details: {
        ...reviewAuditDetails("HIGH_SENSITIVITY_REVIEW_APPROVED", updated),
        self_review: isSelfReview,
        expires_at: expiresAt.toISOString(),
      },
    });

    return { ok: true, review: toSafeReview(updated) };
  }

  // WHAT: Deny a pending review. WHY: .../reviews/:id/deny. Provider-only.
  async denyReviewForCaller(
    sessionToken: string,
    reviewId: string,
    reason?: string,
  ): Promise<ReviewResult> {
    const validation = await this.authService.validateSession(sessionToken, "write");
    if (!validation.valid) return { ok: false, code: validation.code };
    const reviewerEntityId = validation.entity_id;

    const review = await this.loadReviewForReviewer(reviewId, reviewerEntityId);
    if (review === null) return { ok: false, code: "REVIEW_NOT_FOUND" };
    if (review.status !== "PENDING_REVIEW")
      return { ok: false, code: "REVIEW_NOT_PENDING" };
    const eligibility = await this.checkReviewerEligibility(review, reviewerEntityId);
    if (!eligibility.eligible)
      return { ok: false, code: eligibility.code ?? "REVIEWER_NOT_ORG_AUTHORIZED" };

    const updated = await prisma.highSensitivityReview.update({
      where: { review_id: reviewId },
      data: {
        status: "DENIED",
        reviewer_entity_id: reviewerEntityId,
        reviewed_at: new Date(),
        denial_reason:
          typeof reason === "string" && reason.length > 0 ? reason : "reviewer-denied",
      },
    });
    await writeAuditEvent({
      event_type: "HIGH_SENSITIVITY_REVIEW_DENIED",
      outcome: "DENIED",
      actor_entity_id: reviewerEntityId,
      denial_reason: updated.denial_reason,
      details: reviewAuditDetails("HIGH_SENSITIVITY_REVIEW_DENIED", updated),
    });
    return { ok: true, review: toSafeReview(updated) };
  }

  // WHAT: Revoke an approved review. The shipped 1297-A semantics let the
  //        PROVIDER or the BUYER stop it (buyer stop-use is intentional). 1299-A
  //        additionally lets an org-authorized reviewer revoke on the org's
  //        behalf — but NEVER weakens buyer stop-use.
  // WHY: .../reviews/:id/revoke. Idempotent. No cascade is claimed.
  async revokeReviewForCaller(
    sessionToken: string,
    reviewId: string,
    reason?: string,
  ): Promise<ReviewResult> {
    const validation = await this.authService.validateSession(sessionToken, "write");
    if (!validation.valid) return { ok: false, code: validation.code };
    const callerEntityId = validation.entity_id;

    const review = await this.loadReviewForReviewer(reviewId, callerEntityId);
    if (review === null) return { ok: false, code: "REVIEW_NOT_FOUND" };

    // Provider and buyer are always parties (preserve shipped buyer stop-use).
    // Any other caller must pass the org-delegated eligibility check.
    const isParty =
      review.provider_entity_id === callerEntityId ||
      review.buyer_entity_id === callerEntityId;
    if (!isParty) {
      const eligibility = await this.checkReviewerEligibility(review, callerEntityId);
      if (!eligibility.eligible)
        return { ok: false, code: eligibility.code ?? "REVIEWER_NOT_ORG_AUTHORIZED" };
    }

    if (review.status === "REVOKED") return { ok: true, review: toSafeReview(review) }; // idempotent
    if (review.status !== "APPROVED")
      return { ok: false, code: "REVIEW_NOT_APPROVED" };

    const updated = await prisma.highSensitivityReview.update({
      where: { review_id: reviewId },
      data: {
        status: "REVOKED",
        revoked_at: new Date(),
        denial_reason:
          typeof reason === "string" && reason.length > 0 ? reason : "revoked",
      },
    });
    await writeAuditEvent({
      event_type: "HIGH_SENSITIVITY_REVIEW_REVOKED",
      outcome: "SUCCESS",
      actor_entity_id: callerEntityId,
      details: reviewAuditDetails("HIGH_SENSITIVITY_REVIEW_REVOKED", updated),
    });
    return { ok: true, review: toSafeReview(updated) };
  }
}
