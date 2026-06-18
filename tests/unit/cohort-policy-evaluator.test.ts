// FILE: tests/unit/cohort-policy-evaluator.test.ts
// PURPOSE: Phase 1305-A — pure unit tests for the Federation Cloud cohort
//          policy evaluator. Proves the honest governed decisions: CHILDREN
//          blocked, HIGH_SENSITIVITY → review, non-ACTIVE denied, access-mode /
//          use gating, training / model-improvement opt-in, and the always-false
//          honesty markers (threshold_enforced + signal_delivered) — there is no
//          real signal / no real contributor enforcement in 1305-A.
// CONNECTS TO: apps/api/src/services/foundation/federation-cloud-cohort.service.ts

import { describe, expect, it } from "vitest";
import type { CohortDataProduct } from "@niov/database";
import {
  COHORT_ACCESS_MODES,
  COHORT_MIN_SIZE_FLOOR,
  evaluateCohortPolicy,
} from "../../apps/api/src/services/foundation/federation-cloud-cohort.service.js";

// Build a registry row with safe defaults; override per-case.
function makeProduct(overrides: Partial<CohortDataProduct> = {}): CohortDataProduct {
  const base = {
    cohort_product_id: "11111111-1111-1111-1111-111111111111",
    listing_id: null,
    provider_entity_id: "22222222-2222-2222-2222-222222222222",
    provider_org_entity_id: null,
    title: "Test cohort",
    description: "desc",
    cohort_type: "CONSUMER_BEHAVIOR",
    capsule_type_allowlist: [] as string[],
    access_modes: ["AGGREGATED_SIGNAL"] as string[],
    allowed_uses: ["ANALYTICS"] as string[],
    sensitivity_class: "STANDARD",
    sensitive_categories: [] as string[],
    minimum_cohort_size: COHORT_MIN_SIZE_FLOOR,
    consent_required: true,
    opt_in_required: true,
    revocation_supported: true,
    proof_required: true,
    raw_body_excluded: true,
    training_allowed: false,
    model_improvement_allowed: false,
    redistribution_allowed: false,
    commercial_use_allowed: false,
    retention_policy: null,
    pricing_model: {},
    metering_unit: null,
    revenue_share_policy: null,
    status: "ACTIVE",
    discovery_scope: "PRIVATE",
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
    ...overrides,
  };
  return base as unknown as CohortDataProduct;
}

describe("Phase 1305-A — evaluateCohortPolicy", () => {
  it("ALLOW_EVALUATION for an offered mode + permitted use — but never a real signal", () => {
    const d = evaluateCohortPolicy(makeProduct(), {
      requested_use: "ANALYTICS",
      requested_access_mode: "AGGREGATED_SIGNAL",
    });
    expect(d.decision).toBe("ALLOW_EVALUATION");
    expect(d.signal_delivered).toBe(false);
    expect(d.policy.threshold_enforced).toBe(false);
    expect(d.policy.raw_body_excluded).toBe(true);
    expect(d.reasons).toContain("EVALUATION_ONLY_NO_SIGNAL");
  });

  it("DENIES outright when a CHILDREN sensitive category is present", () => {
    const d = evaluateCohortPolicy(
      makeProduct({ sensitive_categories: ["CHILDREN"] }),
      { requested_use: "ANALYTICS", requested_access_mode: "AGGREGATED_SIGNAL" },
    );
    expect(d.decision).toBe("DENIED");
    expect(d.reasons).toContain("CHILDREN_DATA_BLOCKED");
    expect(d.signal_delivered).toBe(false);
  });

  it("routes HIGH_SENSITIVITY to REVIEW_REQUIRED (never auto-allow)", () => {
    const d = evaluateCohortPolicy(
      makeProduct({ sensitivity_class: "HIGH_SENSITIVITY" }),
      { requested_use: "ANALYTICS", requested_access_mode: "AGGREGATED_SIGNAL" },
    );
    expect(d.decision).toBe("REVIEW_REQUIRED");
    expect(d.reasons).toContain("HIGH_SENSITIVITY_REVIEW_REQUIRED");
  });

  it("CHILDREN block takes precedence over HIGH_SENSITIVITY review", () => {
    const d = evaluateCohortPolicy(
      makeProduct({
        sensitivity_class: "HIGH_SENSITIVITY",
        sensitive_categories: ["CHILDREN", "HEALTH"],
      }),
      { requested_use: "ANALYTICS", requested_access_mode: "AGGREGATED_SIGNAL" },
    );
    expect(d.decision).toBe("DENIED");
    expect(d.reasons).toContain("CHILDREN_DATA_BLOCKED");
  });

  it("DENIES when the product is not ACTIVE", () => {
    for (const status of ["DRAFT", "PAUSED", "ARCHIVED"] as const) {
      const d = evaluateCohortPolicy(makeProduct({ status }), {
        requested_use: "ANALYTICS",
        requested_access_mode: "AGGREGATED_SIGNAL",
      });
      expect(d.decision).toBe("DENIED");
      expect(d.reasons).toContain("COHORT_NOT_ACTIVE");
    }
  });

  it("DENIES an access mode the provider does not offer", () => {
    const d = evaluateCohortPolicy(
      makeProduct({ access_modes: ["AGGREGATED_SIGNAL"] }),
      { requested_use: "ANALYTICS", requested_access_mode: "DEPERSONALIZED_SIGNAL" },
    );
    expect(d.decision).toBe("DENIED");
    expect(d.reasons).toContain("ACCESS_MODE_NOT_OFFERED");
  });

  it("DENIES a use the provider does not permit", () => {
    const d = evaluateCohortPolicy(
      makeProduct({ allowed_uses: ["ANALYTICS"] }),
      { requested_use: "PERSONALIZATION", requested_access_mode: "AGGREGATED_SIGNAL" },
    );
    expect(d.decision).toBe("DENIED");
    expect(d.reasons).toContain("USE_NOT_PERMITTED");
  });

  it("gates TRAINING behind training_allowed", () => {
    const product = makeProduct({ allowed_uses: ["ANALYTICS", "TRAINING"] });
    const denied = evaluateCohortPolicy(product, {
      requested_use: "TRAINING",
      requested_access_mode: "AGGREGATED_SIGNAL",
    });
    expect(denied.decision).toBe("DENIED");
    expect(denied.reasons).toContain("TRAINING_NOT_PERMITTED");

    const allowed = evaluateCohortPolicy(
      makeProduct({
        allowed_uses: ["ANALYTICS", "TRAINING"],
        training_allowed: true,
      }),
      { requested_use: "TRAINING", requested_access_mode: "AGGREGATED_SIGNAL" },
    );
    expect(allowed.decision).toBe("ALLOW_EVALUATION");
    expect(allowed.policy.training_allowed).toBe(true);
    expect(allowed.signal_delivered).toBe(false);
  });

  it("gates MODEL_IMPROVEMENT behind model_improvement_allowed", () => {
    const d = evaluateCohortPolicy(
      makeProduct({ allowed_uses: ["MODEL_IMPROVEMENT"] }),
      { requested_use: "MODEL_IMPROVEMENT", requested_access_mode: "AGGREGATED_SIGNAL" },
    );
    expect(d.decision).toBe("DENIED");
    expect(d.reasons).toContain("MODEL_IMPROVEMENT_NOT_PERMITTED");
  });

  it("offers only aggregate / depersonalized / proof access modes (no raw)", () => {
    expect([...COHORT_ACCESS_MODES]).toEqual([
      "AGGREGATED_SIGNAL",
      "DEPERSONALIZED_SIGNAL",
      "PROOF_ONLY",
    ]);
  });
});
