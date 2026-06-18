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

// Human-class entities that may act as reviewers. AI_AGENT / DEVICE /
// APPLICATION are non-human and can never review (RULE 0).
const HUMAN_REVIEWER_TYPES = new Set([
  "PERSON",
  "COMPANY",
  "GOVERNMENT",
  "REGULATOR",
]);

// Default approval lifetime when the reviewer does not specify one (no
// perpetual high-sensitivity access — every approval expires).
const DEFAULT_REVIEW_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

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
export type ReviewListResult =
  | { ok: true; reviews: SafeReviewView[] }
  | { ok: false; code: string };

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
    return { allowed: false, review_id: null, approved_access_modes: [], code: "REVIEW_REQUIRED" };

  const approved = live.approved_access_modes as DataAccessMode[];
  if (!approved.includes(requestedMode))
    return {
      allowed: false,
      review_id: live.review_id,
      approved_access_modes: approved,
      code: "REVIEW_MODE_NOT_APPROVED",
    };

  return {
    allowed: true,
    review_id: live.review_id,
    approved_access_modes: approved,
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

  // Load a review the caller (provider OR buyer) may see (enumeration-safe).
  private async loadOwnReview(
    reviewId: string,
    callerEntityId: string,
  ): Promise<HighSensitivityReview | null> {
    const r = await prisma.highSensitivityReview.findFirst({
      where: { review_id: reviewId },
    });
    if (
      r === null ||
      (r.provider_entity_id !== callerEntityId && r.buyer_entity_id !== callerEntityId)
    )
      return null;
    return r;
  }

  // WHAT: Read one review (provider OR buyer only; enumeration-safe).
  async getReviewForCaller(sessionToken: string, reviewId: string): Promise<ReviewResult> {
    const validation = await this.authService.validateSession(sessionToken, "read");
    if (!validation.valid) return { ok: false, code: validation.code };
    const r = await this.loadOwnReview(reviewId, validation.entity_id);
    if (r === null) return { ok: false, code: "REVIEW_NOT_FOUND" };
    return { ok: true, review: toSafeReview(r) };
  }

  // WHAT: List the caller's reviews (as provider OR buyer). Scope-safe.
  async listReviewsForCaller(sessionToken: string): Promise<ReviewListResult> {
    const validation = await this.authService.validateSession(sessionToken, "read");
    if (!validation.valid) return { ok: false, code: validation.code };
    const rows = await prisma.highSensitivityReview.findMany({
      where: {
        OR: [
          { provider_entity_id: validation.entity_id },
          { buyer_entity_id: validation.entity_id },
        ],
      },
      orderBy: { created_at: "desc" },
      take: 100,
    });
    return { ok: true, reviews: rows.map(toSafeReview) };
  }

  // Verify the caller may act as the reviewer on this review (human-class +
  // is the package provider). Returns a failure code or null when eligible.
  private async reviewerEligibility(
    review: HighSensitivityReview,
    reviewerEntityId: string,
  ): Promise<string | null> {
    const reviewer: Entity | null = await prisma.entity.findFirst({
      where: { entity_id: reviewerEntityId, deleted_at: null },
    });
    if (reviewer === null) return "ENTITY_NOT_FOUND";
    // No AI_AGENT / DEVICE / APPLICATION may review (RULE 0).
    if (!HUMAN_REVIEWER_TYPES.has(reviewer.entity_type))
      return "NON_HUMAN_REVIEWER_FORBIDDEN";
    // Only the package provider (data owner) may approve/deny.
    if (review.provider_entity_id !== reviewerEntityId)
      return "NOT_AUTHORIZED_REVIEWER";
    return null;
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

    const review = await this.loadOwnReview(reviewId, reviewerEntityId);
    if (review === null) return { ok: false, code: "REVIEW_NOT_FOUND" };
    if (review.status !== "PENDING_REVIEW")
      return { ok: false, code: "REVIEW_NOT_PENDING" };

    const eligibility = await this.reviewerEligibility(review, reviewerEntityId);
    if (eligibility !== null) return { ok: false, code: eligibility };

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

    // Mandatory expiry (default 30d); a provided expiry must be in the future.
    let expiresAt: Date;
    if (typeof input.expires_at === "string" && input.expires_at.length > 0) {
      const parsed = new Date(input.expires_at);
      if (Number.isNaN(parsed.getTime()) || parsed <= new Date())
        return { ok: false, code: "INVALID_EXPIRY" };
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

    const review = await this.loadOwnReview(reviewId, reviewerEntityId);
    if (review === null) return { ok: false, code: "REVIEW_NOT_FOUND" };
    if (review.status !== "PENDING_REVIEW")
      return { ok: false, code: "REVIEW_NOT_PENDING" };
    const eligibility = await this.reviewerEligibility(review, reviewerEntityId);
    if (eligibility !== null) return { ok: false, code: eligibility };

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

  // WHAT: Revoke an approved review (provider OR buyer may stop it).
  // WHY: .../reviews/:id/revoke. Idempotent. No cascade is claimed.
  async revokeReviewForCaller(
    sessionToken: string,
    reviewId: string,
    reason?: string,
  ): Promise<ReviewResult> {
    const validation = await this.authService.validateSession(sessionToken, "write");
    if (!validation.valid) return { ok: false, code: validation.code };
    const callerEntityId = validation.entity_id;

    const review = await this.loadOwnReview(reviewId, callerEntityId);
    if (review === null) return { ok: false, code: "REVIEW_NOT_FOUND" };
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
