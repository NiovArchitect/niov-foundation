// FILE: tests/unit/foundation-high-sensitivity-review.test.ts (unit)
// PURPOSE: Phase 1297-A — locks the PURE policy half of the high-sensitivity
//          review workflow: highSensitivityReviewApprovableModes (the
//          category-aware set a human reviewer may authorize) + the
//          REVIEW_GATE_REASONS set. Proves the approval bound is non-vacuous yet
//          never broadens: raw is never approvable; CHILDREN / unknown / no
//          consent / no opt-in / training / model-improvement → nothing
//          approvable; MEDICAL → proof-only; BIOMETRIC/BYSTANDER → proof +
//          aggregate/deperson (never safe projection); HEALTH/LOCATION → up to
//          safe projection; worst-category wins.
// CONNECTS TO: apps/api/src/services/foundation/high-sensitivity-policy.ts
//          + apps/api/src/services/foundation/high-sensitivity-review.service.ts.

import { describe, expect, it } from "vitest";
import {
  highSensitivityReviewApprovableModes,
  HIGH_SENSITIVITY_REVIEW_GATE_REASONS,
  REVIEW_GATE_REASONS,
} from "@niov/api";

function modes(over: Partial<Parameters<typeof highSensitivityReviewApprovableModes>[0]> = {}) {
  return highSensitivityReviewApprovableModes({
    sensitivity_class: "HIGH_SENSITIVITY",
    sensitive_categories: ["MEDICAL"],
    access_mode: "PROOF_ONLY",
    intended_use: "PERSONALIZATION",
    consent_confirmed: true,
    opt_in_confirmed: true,
    ...over,
  });
}

describe("highSensitivityReviewApprovableModes — non-vacuous, never broadens", () => {
  it("never includes a raw/unsafe mode for any category", () => {
    for (const cat of ["HEALTH", "MEDICAL", "BIOMETRIC", "BYSTANDER", "LOCATION"]) {
      const m = modes({ sensitive_categories: [cat] });
      // No mode that returns raw capsule body is approvable (none exists in the
      // closed vocab; assert the explicit raw-ish modes are excluded).
      expect(m).not.toContain("CAPSULE_REFERENCE");
      expect(m).not.toContain("MEMORY_CAPSULE_BUNDLE");
      expect(m).not.toContain("RETRIEVAL_QUERY");
      expect(m).not.toContain("LLM_CONTEXT_ACCESS");
      expect(m).not.toContain("APP_WORLD_PERSONALIZATION");
    }
  });

  it("CHILDREN is never approvable", () => {
    expect(modes({ sensitive_categories: ["CHILDREN"] })).toEqual([]);
  });

  it("an unknown high-sensitivity category is never approvable (fail-safe)", () => {
    expect(modes({ sensitive_categories: ["UNKNOWN_FUTURE_KIND"] })).toEqual([]);
  });

  it("MEDICAL is approvable for PROOF_ONLY only", () => {
    expect(modes({ sensitive_categories: ["MEDICAL"] })).toEqual(["PROOF_ONLY"]);
  });

  it("BIOMETRIC is approvable for proof + aggregate/deperson, never safe projection", () => {
    const m = modes({ sensitive_categories: ["BIOMETRIC"] });
    expect(m).toContain("PROOF_ONLY");
    expect(m).toContain("AGGREGATED_SIGNAL");
    expect(m).toContain("DEPERSONALIZED_SIGNAL");
    expect(m).not.toContain("SAFE_PROJECTION");
  });

  it("HEALTH / LOCATION are approvable up to safe projection", () => {
    expect(modes({ sensitive_categories: ["HEALTH"] })).toEqual(["PROOF_ONLY", "SAFE_PROJECTION"]);
    expect(modes({ sensitive_categories: ["LOCATION"] })).toEqual(["PROOF_ONLY", "SAFE_PROJECTION"]);
  });

  it("BYSTANDER is approvable for proof + aggregate/deperson", () => {
    const m = modes({ sensitive_categories: ["BYSTANDER"] });
    expect(m).toContain("PROOF_ONLY");
    expect(m).toContain("AGGREGATED_SIGNAL");
    expect(m).not.toContain("SAFE_PROJECTION");
  });

  it("training / model-improvement intents are never approvable", () => {
    expect(modes({ intended_use: "TRAINING" })).toEqual([]);
    expect(modes({ intended_use: "MODEL_IMPROVEMENT" })).toEqual([]);
  });

  it("missing consent / opt-in is never approvable", () => {
    expect(modes({ consent_confirmed: false })).toEqual([]);
    expect(modes({ opt_in_confirmed: false })).toEqual([]);
  });

  it("worst category wins (HEALTH + MEDICAL → MEDICAL rules → proof only)", () => {
    expect(modes({ sensitive_categories: ["HEALTH", "MEDICAL"] })).toEqual(["PROOF_ONLY"]);
  });
});

describe("REVIEW_GATE_REASONS — lifts only review-gate denials, not hard denials", () => {
  it("contains the category review reasons", () => {
    expect(REVIEW_GATE_REASONS.has("MEDICAL_DATA_REQUIRES_DEDICATED_REVIEW")).toBe(true);
    expect(REVIEW_GATE_REASONS.has("BIOMETRIC_DATA_REQUIRES_DEDICATED_REVIEW")).toBe(true);
    expect(REVIEW_GATE_REASONS.has("HEALTH_DATA_REQUIRES_DEDICATED_REVIEW")).toBe(true);
    expect(REVIEW_GATE_REASONS.has("DEDICATED_POLICY_GATE_MISSING")).toBe(true);
  });

  it("does NOT contain hard-deny reasons (CHILDREN / consent / training)", () => {
    expect(REVIEW_GATE_REASONS.has("CHILDREN_DATA_REQUIRES_DEDICATED_REVIEW")).toBe(false);
    expect(REVIEW_GATE_REASONS.has("CONSENT_REQUIRED")).toBe(false);
    expect(REVIEW_GATE_REASONS.has("TRAINING_NOT_ALLOWED")).toBe(false);
  });

  it("the exported set mirrors the policy-module constant", () => {
    expect(REVIEW_GATE_REASONS.size).toBe(HIGH_SENSITIVITY_REVIEW_GATE_REASONS.length);
  });
});
