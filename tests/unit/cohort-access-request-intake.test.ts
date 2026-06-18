// FILE: tests/unit/cohort-access-request-intake.test.ts
// PURPOSE: Phase 1307-A — pure unit tests for evaluateAccessRequestIntake.
//          Proves the honest intake disposition: only an ACTIVE cohort accepts
//          requests; the requested mode/use must be OFFERED; TRAINING /
//          MODEL_IMPROVEMENT need the explicit flag; CHILDREN is auto-DENIED;
//          HIGH_SENSITIVITY is requestable but flagged requires_review; every
//          other admissible request is PENDING (a human decides — never
//          auto-approved). No I/O.
// CONNECTS TO: apps/api/src/services/foundation/cohort-access-request.service.ts

import { describe, expect, it } from "vitest";
import { evaluateAccessRequestIntake } from "../../apps/api/src/services/foundation/cohort-access-request.service.js";

type ProductShape = Parameters<typeof evaluateAccessRequestIntake>[0];

function product(overrides: Partial<ProductShape> = {}): ProductShape {
  return {
    status: "ACTIVE",
    access_modes: ["AGGREGATED_SIGNAL"],
    allowed_uses: ["ANALYTICS"],
    sensitivity_class: "STANDARD",
    sensitive_categories: [],
    training_allowed: false,
    model_improvement_allowed: false,
    ...overrides,
  } as ProductShape;
}

const REQ = { intended_use: "ANALYTICS", requested_access_mode: "AGGREGATED_SIGNAL" };

describe("Phase 1307-A — evaluateAccessRequestIntake", () => {
  it("ACTIVE + offered mode/use + STANDARD → PENDING (a human decides), no review", () => {
    const r = evaluateAccessRequestIntake(product(), REQ);
    expect(r).toEqual({
      admissible: true,
      status: "PENDING",
      requires_review: false,
      reason: "AWAITING_HUMAN_DECISION",
    });
  });

  it("non-ACTIVE cohort → not admissible (COHORT_NOT_ACTIVE)", () => {
    for (const status of ["DRAFT", "PAUSED", "ARCHIVED"] as const) {
      expect(evaluateAccessRequestIntake(product({ status }), REQ)).toEqual({
        admissible: false,
        code: "COHORT_NOT_ACTIVE",
      });
    }
  });

  it("mode not offered → ACCESS_MODE_NOT_OFFERED; use not permitted → USE_NOT_PERMITTED", () => {
    expect(
      evaluateAccessRequestIntake(product(), {
        intended_use: "ANALYTICS",
        requested_access_mode: "PROOF_ONLY",
      }),
    ).toEqual({ admissible: false, code: "ACCESS_MODE_NOT_OFFERED" });
    expect(
      evaluateAccessRequestIntake(product(), {
        intended_use: "RESEARCH",
        requested_access_mode: "AGGREGATED_SIGNAL",
      }),
    ).toEqual({ admissible: false, code: "USE_NOT_PERMITTED" });
  });

  it("TRAINING / MODEL_IMPROVEMENT need the explicit per-product flag", () => {
    const train = product({ allowed_uses: ["TRAINING"] });
    expect(
      evaluateAccessRequestIntake(train, { intended_use: "TRAINING", requested_access_mode: "AGGREGATED_SIGNAL" }),
    ).toEqual({ admissible: false, code: "TRAINING_NOT_PERMITTED" });
    const trainOk = product({ allowed_uses: ["TRAINING"], training_allowed: true });
    expect(
      evaluateAccessRequestIntake(trainOk, { intended_use: "TRAINING", requested_access_mode: "AGGREGATED_SIGNAL" })
        .admissible,
    ).toBe(true);

    const mi = product({ allowed_uses: ["MODEL_IMPROVEMENT"] });
    expect(
      evaluateAccessRequestIntake(mi, {
        intended_use: "MODEL_IMPROVEMENT",
        requested_access_mode: "AGGREGATED_SIGNAL",
      }),
    ).toEqual({ admissible: false, code: "MODEL_IMPROVEMENT_NOT_PERMITTED" });
  });

  it("CHILDREN sensitive category → admissible but auto-DENIED at intake", () => {
    const r = evaluateAccessRequestIntake(product({ sensitive_categories: ["CHILDREN"] }), REQ);
    expect(r).toEqual({
      admissible: true,
      status: "DENIED",
      requires_review: false,
      reason: "CHILDREN_DATA_BLOCKED",
    });
  });

  it("HIGH_SENSITIVITY → PENDING + requires_review (a human still decides)", () => {
    const r = evaluateAccessRequestIntake(product({ sensitivity_class: "HIGH_SENSITIVITY" }), REQ);
    expect(r).toEqual({
      admissible: true,
      status: "PENDING",
      requires_review: true,
      reason: "HIGH_SENSITIVITY_REVIEW_REQUIRED",
    });
  });

  it("CHILDREN takes precedence over HIGH_SENSITIVITY review (hard block first)", () => {
    const r = evaluateAccessRequestIntake(
      product({ sensitivity_class: "HIGH_SENSITIVITY", sensitive_categories: ["CHILDREN", "HEALTH"] }),
      REQ,
    );
    expect(r).toEqual({
      admissible: true,
      status: "DENIED",
      requires_review: false,
      reason: "CHILDREN_DATA_BLOCKED",
    });
  });
});
