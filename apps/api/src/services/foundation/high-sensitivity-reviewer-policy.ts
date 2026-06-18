// FILE: high-sensitivity-reviewer-policy.ts
// PURPOSE: Phase 1299-A — the PURE, deterministic ELIGIBILITY policy that decides
//          WHO may act as the human reviewer on a high-sensitivity review. It
//          widens 1297-A's "only the package provider entity may review" into a
//          governed delegation model: the provider owner (or personal-DMW owner)
//          PLUS authorized humans inside the provider's organization (org admins,
//          compliance/privacy/legal/DPO, data-governance, supervisors) may
//          approve or deny a review on the org's behalf.
//
//          It is pure over RESOLVED FACTS (no I/O) — the service resolves the
//          entity type, org membership, TAR authority, and membership role, then
//          this evaluator decides. That keeps the authority logic testable and
//          auditable, and keeps the decision tree in ONE place so it cannot drift
//          across the approve / deny / load paths.
//
//          Doctrine (RULE 0): NO AI_AGENT / DEVICE / APPLICATION (and therefore
//          no LLM, no Python, no BEAM, no device, no app) can EVER review — only
//          human-class entities. CHILDREN data is never reviewable here. A BUYER
//          may never approve another provider's data (no self-serve approval). A
//          reviewer outside the provider's org is CROSS-TENANT and invisible
//          (the loader returns REVIEW_NOT_FOUND; this evaluator records DENIED).
//          Delegation grants no new ACCESS rights: an approval still only permits
//          the category's safe modes, never raw body, never training /
//          model-improvement / redistribution / commercial use.
//
// CONNECTS TO:
//   - apps/api/src/services/foundation/high-sensitivity-review.service.ts
//     (resolves facts from Entity / EntityMembership / TAR, then calls this).
//   - apps/api/src/services/foundation/high-sensitivity-policy.ts
//     (CHILDREN non-approvable doctrine mirrored here for the reviewer gate).

// Human-class entity types that may act as reviewers. AI_AGENT / DEVICE /
// APPLICATION are non-human and can never review (RULE 0). Mirrors the set the
// 1297-A service enforced; kept here so the pure evaluator is self-contained.
export const HUMAN_REVIEWER_ENTITY_TYPES: ReadonlySet<string> = new Set([
  "PERSON",
  "COMPANY",
  "GOVERNMENT",
  "REGULATOR",
]);

// Role-title keyword sets (case-insensitive substring match) that confer an
// org-delegated reviewer scope. These are governance roles a human may hold via
// an active EntityMembership inside the provider's org. Ordered strict→broad so
// the strongest applicable scope wins.
const COMPLIANCE_ROLE_KEYWORDS = [
  "compliance",
  "privacy",
  "legal",
  "counsel",
  "dpo",
  "data protection",
];
const GOVERNANCE_ROLE_KEYWORDS = ["governance", "steward", "stewardship"];
const SUPERVISOR_ROLE_KEYWORDS = ["supervisor", "manager", "lead", "head of"];
// NOTE: "officer" is deliberately NOT an admin keyword — "Compliance Officer" /
// "Privacy Officer" are compliance roles, not org admins. Admin is the explicit
// is_admin flag, TAR can_admin_org, or an unambiguous admin/owner/director title.
const ADMIN_ROLE_KEYWORDS = ["admin", "owner", "director"];

// The resolved scope under which a reviewer is (or is not) authorized.
export type ReviewerScope =
  | "OWNER" // the package provider entity itself (org or company)
  | "PERSONAL_OWNER" // a personal-DMW owner reviewing their own package
  | "ORG_ADMIN" // org admin / TAR can_admin_org / admin-class role
  | "COMPLIANCE" // compliance / privacy / legal / DPO
  | "GOVERNANCE" // data-governance / steward
  | "SUPERVISOR" // supervisory / managerial role
  | "DENIED";

// Closed reviewer reason-code vocabulary (no free-form strings).
export const REVIEWER_REASON_CODES = [
  "REVIEWER_IS_PROVIDER_OWNER",
  "REVIEWER_IS_PERSONAL_OWNER",
  "REVIEWER_IS_ORG_ADMIN",
  "REVIEWER_IS_ORG_COMPLIANCE",
  "REVIEWER_IS_ORG_GOVERNANCE",
  "REVIEWER_IS_ORG_SUPERVISOR",
  "REVIEWER_IS_NON_HUMAN",
  "REVIEWER_IS_BUYER",
  "REVIEWER_NOT_PROVIDER_OWNER",
  "REVIEWER_CROSS_TENANT",
  "REVIEWER_MEMBERSHIP_INACTIVE",
  "REVIEWER_NOT_ORG_AUTHORIZED",
  "CHILDREN_DATA_REVIEW_NOT_SUPPORTED",
] as const;
export type ReviewerReasonCode = (typeof REVIEWER_REASON_CODES)[number];

// The RESOLVED facts the service hands the pure evaluator. The service owns all
// I/O (Entity / EntityMembership / TAR lookups); this evaluator owns the policy.
export interface ReviewerEligibilityFacts {
  reviewer_entity_type: string;
  // Identity relationships to the review under decision.
  reviewer_is_provider: boolean; // reviewer === review.provider_entity_id
  reviewer_is_buyer: boolean; // reviewer === review.buyer_entity_id
  // Is the package a personal DMW (no org parent) vs an org-owned package.
  package_is_personal: boolean;
  // Org-membership facts (only meaningful for org-owned packages).
  reviewer_in_provider_org: boolean; // reviewer's org === provider's org
  membership_is_admin: boolean; // EntityMembership.is_admin
  membership_role_title: string | null; // EntityMembership.role_title
  membership_active: boolean; // EntityMembership.is_active
  // The entity's GLOBAL TAR can_admin_org capability (per-entity, NOT per-org).
  // Recorded for audit/transparency and treated as CORROBORATING only — it does
  // NOT independently elevate a plain provider-org member (see the evaluator's
  // RULE 13 note; a global flag cannot be attributed to the provider org).
  reviewer_can_admin_org: boolean;
  // The package's sensitive categories (CHILDREN is never reviewable).
  sensitive_categories: string[];
}

export interface ReviewerEligibilityDecision {
  eligible: boolean;
  reviewer_scope: ReviewerScope;
  reason_codes: ReviewerReasonCode[];
  // Delegation NEVER broadens access rights — these stay pinned so a consumer
  // can see an org reviewer cannot grant more than the package owner could.
  approval_limitations: {
    raw_body_allowed: false;
    training_allowed: false;
    model_improvement_allowed: false;
    redistribution_allowed: false;
    commercial_use_allowed: false;
  };
  // Every reviewer-eligibility decision is audited (RULE 4) — eligible OR not.
  audit_required: true;
}

// Pinned approval limitations — delegation never relaxes any of these.
const PINNED_LIMITS = Object.freeze({
  raw_body_allowed: false as const,
  training_allowed: false as const,
  model_improvement_allowed: false as const,
  redistribution_allowed: false as const,
  commercial_use_allowed: false as const,
});

// The reviewer scopes that confer ORG-WIDE review VISIBILITY (1299-B): an
// authorized provider-org reviewer may list / inspect the org's reviews. OWNER
// and PERSONAL_OWNER are deliberately EXCLUDED — being one package's provider
// lets you see your OWN reviews (the "mine" scope), never other providers'
// reviews across the org.
export const ORG_REVIEWER_SCOPES: ReadonlySet<ReviewerScope> = new Set([
  "ORG_ADMIN",
  "COMPLIANCE",
  "GOVERNANCE",
  "SUPERVISOR",
]);

// WHAT: Does this eligibility decision confer org-wide review visibility?
// INPUT: a ReviewerEligibilityDecision.
// OUTPUT: true only for an eligible decision whose scope is an org-reviewer
//         scope (not OWNER / PERSONAL_OWNER / DENIED).
// WHY: The 1299-B list/audit gate reuses the SAME pure evaluator as the approval
//      gate, so org-review visibility inherits the confused-deputy + TAR-
//      corroborating-only guarantees automatically (no second authorization path
//      that could drift looser than approval).
export function confersOrgReviewVisibility(
  decision: ReviewerEligibilityDecision,
): boolean {
  return decision.eligible && ORG_REVIEWER_SCOPES.has(decision.reviewer_scope);
}

function roleMatches(role: string | null, keywords: string[]): boolean {
  if (typeof role !== "string" || role.length === 0) return false;
  const r = role.toLowerCase();
  return keywords.some((k) => r.includes(k));
}

function decision(
  eligible: boolean,
  reviewer_scope: ReviewerScope,
  reason_codes: ReviewerReasonCode[],
): ReviewerEligibilityDecision {
  return {
    eligible,
    reviewer_scope,
    reason_codes,
    approval_limitations: { ...PINNED_LIMITS },
    audit_required: true,
  };
}

// WHAT: Decide whether a human reviewer is authorized to act on a review.
// INPUT: the resolved ReviewerEligibilityFacts (the service does all the I/O).
// OUTPUT: a ReviewerEligibilityDecision — eligible + scope + closed reason codes.
// WHY: One pure decision tree, strict→broad. The provider owner (or personal
//      owner) is always eligible; the buyer is never eligible for another
//      provider's data; a non-human is never eligible; CHILDREN is never
//      reviewable; an org-delegated human is eligible only when inside the
//      provider's org with an ACTIVE membership AND an admin / compliance /
//      governance / supervisory role (or TAR can_admin_org). Cross-tenant is
//      DENIED here (and invisible at the loader). Delegation grants no new
//      access rights (PINNED_LIMITS).
export function evaluateHighSensitivityReviewerEligibility(
  facts: ReviewerEligibilityFacts,
): ReviewerEligibilityDecision {
  // RULE 0 — non-human entities can never review.
  if (!HUMAN_REVIEWER_ENTITY_TYPES.has(facts.reviewer_entity_type))
    return decision(false, "DENIED", ["REVIEWER_IS_NON_HUMAN"]);

  // CHILDREN data is never reviewable here (mirrors the 1296-A deny doctrine).
  const cats = facts.sensitive_categories.map((c) => c.toUpperCase());
  if (cats.includes("CHILDREN"))
    return decision(false, "DENIED", ["CHILDREN_DATA_REVIEW_NOT_SUPPORTED"]);

  // The package provider entity itself is always the canonical owner-reviewer.
  if (facts.reviewer_is_provider) {
    return facts.package_is_personal
      ? decision(true, "PERSONAL_OWNER", ["REVIEWER_IS_PERSONAL_OWNER"])
      : decision(true, "OWNER", ["REVIEWER_IS_PROVIDER_OWNER"]);
  }

  // A buyer (who is not also the provider) may never approve the data they want.
  if (facts.reviewer_is_buyer)
    return decision(false, "DENIED", ["REVIEWER_IS_BUYER"]);

  // A personal-DMW package has no org to delegate into — only the owner reviews.
  if (facts.package_is_personal)
    return decision(false, "DENIED", ["REVIEWER_NOT_PROVIDER_OWNER"]);

  // Org-owned package: a reviewer outside the provider's org is cross-tenant.
  if (!facts.reviewer_in_provider_org)
    return decision(false, "DENIED", ["REVIEWER_CROSS_TENANT"]);

  // Inside the org, but the membership is inactive → not authorized.
  if (!facts.membership_active)
    return decision(false, "DENIED", ["REVIEWER_MEMBERSHIP_INACTIVE"]);

  // Org-delegated scopes, strict→broad. Admin elevation is conferred ONLY by an
  // admin signal that is attributable to the PROVIDER ORG itself: the reviewer's
  // provider-org membership is flagged is_admin, or carries an admin role title.
  //
  // RULE 13 (surfaced for the Founder): `reviewer_can_admin_org` is the entity's
  // GLOBAL TAR capability (TAR is per-entity, not per-org), so it can be true
  // because the entity administers a DIFFERENT org. Treating it as independently
  // sufficient would re-open the confused-deputy leak the Founder asked to close
  // ("authority must come from the provider organization, not any other org").
  // We therefore use it only as a CORROBORATING signal — it elevates ONLY when
  // the provider-org membership is itself admin (where it is redundant). It never
  // elevates a plain provider-org member on its own (fail-closed). The Founder's
  // literal "membership PLUS the TAR signal" is honored in the corroborating
  // sense; if independent TAR elevation for provider-org members is desired, that
  // is a one-line Founder-authorized change. The fact is still recorded in the
  // audit details for transparency.
  if (
    facts.membership_is_admin ||
    roleMatches(facts.membership_role_title, ADMIN_ROLE_KEYWORDS)
  )
    return decision(true, "ORG_ADMIN", ["REVIEWER_IS_ORG_ADMIN"]);

  if (roleMatches(facts.membership_role_title, COMPLIANCE_ROLE_KEYWORDS))
    return decision(true, "COMPLIANCE", ["REVIEWER_IS_ORG_COMPLIANCE"]);

  if (roleMatches(facts.membership_role_title, GOVERNANCE_ROLE_KEYWORDS))
    return decision(true, "GOVERNANCE", ["REVIEWER_IS_ORG_GOVERNANCE"]);

  if (roleMatches(facts.membership_role_title, SUPERVISOR_ROLE_KEYWORDS))
    return decision(true, "SUPERVISOR", ["REVIEWER_IS_ORG_SUPERVISOR"]);

  // In the org, active, but no authorizing role → not an authorized reviewer.
  return decision(false, "DENIED", ["REVIEWER_NOT_ORG_AUTHORIZED"]);
}
