// FILE: tests/unit/foundation-high-sensitivity-policy.test.ts (unit)
// PURPOSE: Phase 1296-A — locks the dedicated high-sensitivity policy gate
//          (evaluateHighSensitivityAccess): raw body NEVER allowed + proof
//          ALWAYS required; consent/opt-in mandatory; training/model-improvement
//          intents denied; CHILDREN → DENY; MEDICAL/BIOMETRIC → proof-only or
//          review; HEALTH → safe projection under strict controls; BYSTANDER →
//          aggregate/depersonalized; unrecognized high-sensitivity → review.
// CONNECTS TO: apps/api/src/services/foundation/high-sensitivity-policy.ts.

import { describe, expect, it } from "vitest";
import { evaluateHighSensitivityAccess } from "@niov/api";

function ev(over: Partial<Parameters<typeof evaluateHighSensitivityAccess>[0]> = {}) {
  return evaluateHighSensitivityAccess({
    sensitivity_class: "HIGH_SENSITIVITY",
    sensitive_categories: ["HEALTH"],
    access_mode: "SAFE_PROJECTION",
    intended_use: "PERSONALIZATION",
    consent_confirmed: true,
    opt_in_confirmed: true,
    ...over,
  });
}

describe("evaluateHighSensitivityAccess — invariants", () => {
  it("never allows raw body; always requires proof + audit + denies elevated rights", () => {
    for (const cat of ["HEALTH", "MEDICAL", "BIOMETRIC", "CHILDREN", "BYSTANDER", "LOCATION"]) {
      const d = ev({ sensitive_categories: [cat], access_mode: "PROOF_ONLY", retention_policy: "30d" });
      expect(d.raw_body_allowed).toBe(false);
      expect(d.proof_required).toBe(true);
      expect(d.audit_required).toBe(true);
      expect(d.training_allowed).toBe(false);
      expect(d.model_improvement_allowed).toBe(false);
      expect(d.redistribution_allowed).toBe(false);
      expect(d.commercial_use_allowed).toBe(false);
    }
  });

  it("denies without consent / opt-in", () => {
    expect(ev({ consent_confirmed: false }).decision).toBe("DENY");
    expect(ev({ consent_confirmed: false }).reason_codes).toContain("CONSENT_REQUIRED");
    expect(ev({ opt_in_confirmed: false }).reason_codes).toContain("OPT_IN_REQUIRED");
  });

  it("denies TRAINING / MODEL_IMPROVEMENT intents outright", () => {
    expect(ev({ intended_use: "TRAINING" }).decision).toBe("DENY");
    expect(ev({ intended_use: "TRAINING" }).reason_codes).toContain("TRAINING_NOT_ALLOWED");
    expect(ev({ intended_use: "MODEL_IMPROVEMENT" }).reason_codes).toContain("MODEL_IMPROVEMENT_NOT_ALLOWED");
  });
});

describe("evaluateHighSensitivityAccess — category behavior", () => {
  it("CHILDREN is denied outright", () => {
    const d = ev({ sensitive_categories: ["CHILDREN"] });
    expect(d.decision).toBe("DENY");
    expect(d.reason_codes).toContain("CHILDREN_DATA_REQUIRES_DEDICATED_REVIEW");
  });

  it("MEDICAL: proof-only allowed, safe-projection requires review", () => {
    expect(ev({ sensitive_categories: ["MEDICAL"], access_mode: "PROOF_ONLY" }).decision).toBe("ALLOW_PROOF_ONLY");
    const r = ev({ sensitive_categories: ["MEDICAL"], access_mode: "SAFE_PROJECTION" });
    expect(r.decision).toBe("REQUIRES_REVIEW");
    expect(r.human_review_required).toBe(true);
    expect(r.reason_codes).toContain("MEDICAL_DATA_REQUIRES_DEDICATED_REVIEW");
  });

  it("BIOMETRIC: proof-only allowed, otherwise review", () => {
    expect(ev({ sensitive_categories: ["BIOMETRIC"], access_mode: "PROOF_ONLY" }).decision).toBe("ALLOW_PROOF_ONLY");
    expect(ev({ sensitive_categories: ["BIOMETRIC"], access_mode: "SAFE_PROJECTION" }).decision).toBe("REQUIRES_REVIEW");
  });

  it("HEALTH: safe projection allowed; retrieval-query requires review", () => {
    const d = ev({ sensitive_categories: ["HEALTH"], access_mode: "SAFE_PROJECTION" });
    expect(d.decision).toBe("ALLOW_SAFE_PROJECTION");
    expect(d.allowed_access_modes).toContain("SAFE_PROJECTION");
    expect(d.allowed_access_modes).toContain("PROOF_ONLY");
    expect(ev({ sensitive_categories: ["HEALTH"], access_mode: "PROOF_ONLY" }).decision).toBe("ALLOW_SAFE_PROJECTION");
    expect(ev({ sensitive_categories: ["HEALTH"], access_mode: "RETRIEVAL_QUERY" }).decision).toBe("REQUIRES_REVIEW");
  });

  it("BYSTANDER: aggregate/depersonalized allowed; otherwise proof-only or review", () => {
    expect(ev({ sensitive_categories: ["BYSTANDER"], access_mode: "AGGREGATED_SIGNAL" }).decision).toBe("ALLOW_AGGREGATED");
    expect(ev({ sensitive_categories: ["BYSTANDER"], access_mode: "SAFE_PROJECTION", aggregate_only: true }).decision).toBe("ALLOW_AGGREGATED");
    expect(ev({ sensitive_categories: ["BYSTANDER"], access_mode: "PROOF_ONLY" }).decision).toBe("ALLOW_PROOF_ONLY");
    expect(ev({ sensitive_categories: ["BYSTANDER"], access_mode: "SAFE_PROJECTION" }).decision).toBe("REQUIRES_REVIEW");
  });

  it("worst category wins (HEALTH + MEDICAL → MEDICAL rules)", () => {
    expect(ev({ sensitive_categories: ["HEALTH", "MEDICAL"], access_mode: "SAFE_PROJECTION" }).decision).toBe("REQUIRES_REVIEW");
  });

  it("an unrecognized high-sensitivity category fails safe to review", () => {
    const d = ev({ sensitive_categories: ["UNKNOWN_FUTURE_KIND"], access_mode: "SAFE_PROJECTION" });
    expect(d.decision).toBe("REQUIRES_REVIEW");
    expect(d.reason_codes).toContain("DEDICATED_POLICY_GATE_MISSING");
  });
});
