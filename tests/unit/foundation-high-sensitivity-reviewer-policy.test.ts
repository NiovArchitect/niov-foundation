// FILE: tests/unit/foundation-high-sensitivity-reviewer-policy.test.ts (unit)
// PURPOSE: Phase 1299-A — locks the PURE reviewer-eligibility evaluator: WHO may
//          act as the human reviewer on a high-sensitivity review. RULE 0 —
//          non-human entities (AI_AGENT / DEVICE / APPLICATION) can NEVER review;
//          CHILDREN data is never reviewable; the provider owner (or personal
//          owner) is always eligible; a buyer is never eligible for another
//          provider's data (no self-serve approval); an org-delegated human is
//          eligible only when in the provider's org with an ACTIVE membership AND
//          an admin / TAR-can-admin-org / compliance / governance / supervisory
//          role; cross-tenant is DENIED; delegation never broadens access rights.
// CONNECTS TO: apps/api/src/services/foundation/high-sensitivity-reviewer-policy.ts.

import { describe, expect, it } from "vitest";
import {
  confersOrgReviewVisibility,
  evaluateHighSensitivityReviewerEligibility,
  type ReviewerEligibilityFacts,
} from "@niov/api";

// A baseline "org-owned MEDICAL package, reviewer is an unrelated human in the
// provider's org with no authorizing role" — overridden per case.
function facts(over: Partial<ReviewerEligibilityFacts> = {}): ReviewerEligibilityFacts {
  return {
    reviewer_entity_type: "PERSON",
    reviewer_is_provider: false,
    reviewer_is_buyer: false,
    package_is_personal: false,
    reviewer_in_provider_org: true,
    membership_is_admin: false,
    membership_role_title: null,
    membership_active: true,
    reviewer_can_admin_org: false,
    sensitive_categories: ["MEDICAL"],
    ...over,
  };
}

describe("evaluateHighSensitivityReviewerEligibility — RULE 0 hard denials", () => {
  it("a non-human reviewer is never eligible (even as provider)", () => {
    for (const t of ["AI_AGENT", "DEVICE", "APPLICATION"]) {
      const d = evaluateHighSensitivityReviewerEligibility(
        facts({ reviewer_entity_type: t, reviewer_is_provider: true }),
      );
      expect(d.eligible).toBe(false);
      expect(d.reviewer_scope).toBe("DENIED");
      expect(d.reason_codes).toContain("REVIEWER_IS_NON_HUMAN");
    }
  });

  it("CHILDREN data is never reviewable (even by the provider owner)", () => {
    const d = evaluateHighSensitivityReviewerEligibility(
      facts({ reviewer_is_provider: true, sensitive_categories: ["CHILDREN"] }),
    );
    expect(d.eligible).toBe(false);
    expect(d.reason_codes).toContain("CHILDREN_DATA_REVIEW_NOT_SUPPORTED");
  });
});

describe("evaluateHighSensitivityReviewerEligibility — owner + buyer", () => {
  it("the org package provider entity is eligible (OWNER)", () => {
    const d = evaluateHighSensitivityReviewerEligibility(facts({ reviewer_is_provider: true }));
    expect(d.eligible).toBe(true);
    expect(d.reviewer_scope).toBe("OWNER");
    expect(d.reason_codes).toContain("REVIEWER_IS_PROVIDER_OWNER");
  });

  it("the personal-DMW owner is eligible (PERSONAL_OWNER)", () => {
    const d = evaluateHighSensitivityReviewerEligibility(
      facts({ reviewer_is_provider: true, package_is_personal: true }),
    );
    expect(d.eligible).toBe(true);
    expect(d.reviewer_scope).toBe("PERSONAL_OWNER");
  });

  it("a buyer (not the provider) is never eligible", () => {
    const d = evaluateHighSensitivityReviewerEligibility(
      facts({ reviewer_is_buyer: true, membership_is_admin: true }),
    );
    expect(d.eligible).toBe(false);
    expect(d.reason_codes).toContain("REVIEWER_IS_BUYER");
  });

  it("a personal package admits only the owner (no org delegation)", () => {
    const d = evaluateHighSensitivityReviewerEligibility(
      facts({ package_is_personal: true, reviewer_is_provider: false }),
    );
    expect(d.eligible).toBe(false);
    expect(d.reason_codes).toContain("REVIEWER_NOT_PROVIDER_OWNER");
  });
});

describe("evaluateHighSensitivityReviewerEligibility — org delegation", () => {
  it("a reviewer outside the provider's org is cross-tenant DENIED", () => {
    const d = evaluateHighSensitivityReviewerEligibility(
      facts({ reviewer_in_provider_org: false, membership_is_admin: true }),
    );
    expect(d.eligible).toBe(false);
    expect(d.reason_codes).toContain("REVIEWER_CROSS_TENANT");
  });

  it("an inactive membership is DENIED", () => {
    const d = evaluateHighSensitivityReviewerEligibility(
      facts({ membership_active: false, membership_is_admin: true }),
    );
    expect(d.eligible).toBe(false);
    expect(d.reason_codes).toContain("REVIEWER_MEMBERSHIP_INACTIVE");
  });

  it("an org admin (provider-org membership is_admin) is eligible (ORG_ADMIN)", () => {
    const d = evaluateHighSensitivityReviewerEligibility(facts({ membership_is_admin: true }));
    expect(d.eligible).toBe(true);
    expect(d.reviewer_scope).toBe("ORG_ADMIN");
  });

  it("GLOBAL TAR can_admin_org does NOT elevate a plain provider-org member (confused-deputy guard)", () => {
    // The entity holds can_admin_org because it administers ANOTHER org; here it
    // is only a plain active member → must NOT be elevated (fail-closed).
    const d = evaluateHighSensitivityReviewerEligibility(
      facts({ reviewer_can_admin_org: true, membership_role_title: "Software Engineer" }),
    );
    expect(d.eligible).toBe(false);
    expect(d.reason_codes).toContain("REVIEWER_NOT_ORG_AUTHORIZED");
  });

  it("TAR can_admin_org with a provider-org admin membership is ORG_ADMIN (corroborating)", () => {
    const d = evaluateHighSensitivityReviewerEligibility(
      facts({ reviewer_can_admin_org: true, membership_is_admin: true }),
    );
    expect(d.eligible).toBe(true);
    expect(d.reviewer_scope).toBe("ORG_ADMIN");
  });

  it("a compliance / privacy / DPO role is eligible (COMPLIANCE)", () => {
    for (const role of ["Chief Compliance Officer", "Data Privacy Lead", "DPO", "General Counsel"]) {
      const d = evaluateHighSensitivityReviewerEligibility(facts({ membership_role_title: role }));
      expect(d.eligible).toBe(true);
      expect(d.reviewer_scope).toBe("COMPLIANCE");
    }
  });

  it("a data-governance / steward role is eligible (GOVERNANCE)", () => {
    const d = evaluateHighSensitivityReviewerEligibility(
      facts({ membership_role_title: "Data Governance Steward" }),
    );
    expect(d.eligible).toBe(true);
    expect(d.reviewer_scope).toBe("GOVERNANCE");
  });

  it("a supervisory role is eligible (SUPERVISOR)", () => {
    const d = evaluateHighSensitivityReviewerEligibility(
      facts({ membership_role_title: "Team Supervisor" }),
    );
    expect(d.eligible).toBe(true);
    expect(d.reviewer_scope).toBe("SUPERVISOR");
  });

  it("an active org member with no authorizing role is DENIED", () => {
    const d = evaluateHighSensitivityReviewerEligibility(
      facts({ membership_role_title: "Software Engineer" }),
    );
    expect(d.eligible).toBe(false);
    expect(d.reason_codes).toContain("REVIEWER_NOT_ORG_AUTHORIZED");
  });
});

describe("confersOrgReviewVisibility — 1299-B org-review list/audit gate", () => {
  it("the four org-reviewer scopes confer org-wide visibility", () => {
    const cases: Array<[Partial<ReviewerEligibilityFacts>, string]> = [
      [{ membership_is_admin: true }, "ORG_ADMIN"],
      [{ membership_role_title: "Compliance Officer" }, "COMPLIANCE"],
      [{ membership_role_title: "Data Governance Steward" }, "GOVERNANCE"],
      [{ membership_role_title: "Team Supervisor" }, "SUPERVISOR"],
    ];
    for (const [over, scope] of cases) {
      const d = evaluateHighSensitivityReviewerEligibility(facts(over));
      expect(d.reviewer_scope).toBe(scope);
      expect(confersOrgReviewVisibility(d)).toBe(true);
    }
  });

  it("OWNER / PERSONAL_OWNER do NOT confer org-wide visibility (own reviews only)", () => {
    const owner = evaluateHighSensitivityReviewerEligibility(facts({ reviewer_is_provider: true }));
    expect(owner.reviewer_scope).toBe("OWNER");
    expect(confersOrgReviewVisibility(owner)).toBe(false);
    const personal = evaluateHighSensitivityReviewerEligibility(
      facts({ reviewer_is_provider: true, package_is_personal: true }),
    );
    expect(personal.reviewer_scope).toBe("PERSONAL_OWNER");
    expect(confersOrgReviewVisibility(personal)).toBe(false);
  });

  it("a denied / plain / non-human / cross-tenant caller never confers visibility", () => {
    for (const over of [
      { membership_role_title: "Software Engineer" }, // plain → DENIED
      { reviewer_entity_type: "AI_AGENT", membership_is_admin: true }, // non-human
      { reviewer_in_provider_org: false, membership_is_admin: true }, // cross-tenant
      { reviewer_is_buyer: true, membership_is_admin: true }, // buyer
    ]) {
      const d = evaluateHighSensitivityReviewerEligibility(facts(over));
      expect(confersOrgReviewVisibility(d)).toBe(false);
    }
  });
});

describe("evaluateHighSensitivityReviewerEligibility — delegation never broadens rights", () => {
  it("approval limitations stay pinned false for every eligible scope", () => {
    for (const over of [
      { reviewer_is_provider: true },
      { membership_is_admin: true },
      { membership_role_title: "Compliance Officer" },
    ]) {
      const d = evaluateHighSensitivityReviewerEligibility(facts(over));
      expect(d.eligible).toBe(true);
      expect(d.approval_limitations.raw_body_allowed).toBe(false);
      expect(d.approval_limitations.training_allowed).toBe(false);
      expect(d.approval_limitations.model_improvement_allowed).toBe(false);
      expect(d.approval_limitations.redistribution_allowed).toBe(false);
      expect(d.approval_limitations.commercial_use_allowed).toBe(false);
      expect(d.audit_required).toBe(true);
    }
  });
});
