// FILE: high-sensitivity-policy.ts
// PURPOSE: Phase 1296-A — the dedicated HIGH-SENSITIVITY POLICY GATE for
//          personal + marketplace data. Replaces the 1294-A/1295-A blanket
//          "high-sensitivity → deny forever" with a graded, category-specific
//          evaluator so Foundation can eventually allow GOVERNED access to
//          sensitive data under strict controls — without ever enabling raw
//          medical / health / biometric / children content, training, real
//          settlement, or a COSMP bypass.
//
//          Pure + deterministic (no I/O), like evaluateSpendPolicy. The
//          marketplace evaluate / grant / read paths call it; the integration
//          sites enforce consent/opt-in/revocation separately and restrict the
//          delivered access mode to the evaluator's allowed set.
//
//          Doctrine: raw body is NEVER allowed; proof is ALWAYS required;
//          training / model-improvement / redistribution / commercial use are
//          force-denied for high-sensitivity; safe projection / proof-only /
//          aggregate / depersonalized are preferred; CHILDREN data is denied
//          pending a dedicated children program; MEDICAL / BIOMETRIC require
//          review unless proof-only; HEALTH may allow safe projection under
//          strict controls; the default for an unrecognized high-sensitivity
//          category is REQUIRES_REVIEW (fail-safe, never silent-allow).
//
// CONNECTS TO:
//   - apps/api/src/services/foundation/marketplace.service.ts (data-access
//     evaluation + grant creation).
//   - apps/api/src/services/foundation/marketplace-data-delivery.service.ts
//     (read delivery re-runs this gate at read time).

import type { DataAccessMode } from "@niov/database";

export const HIGH_SENSITIVITY_REASON_CODES = [
  "HIGH_SENSITIVITY_DEFAULT_DENY",
  "CONSENT_REQUIRED",
  "OPT_IN_REQUIRED",
  "PURPOSE_NOT_ALLOWED",
  "RAW_BODY_NOT_ALLOWED",
  "TRAINING_NOT_ALLOWED",
  "MODEL_IMPROVEMENT_NOT_ALLOWED",
  "REDISTRIBUTION_NOT_ALLOWED",
  "COMMERCIAL_USE_NOT_ALLOWED",
  "CHILDREN_DATA_REQUIRES_DEDICATED_REVIEW",
  "BIOMETRIC_DATA_REQUIRES_DEDICATED_REVIEW",
  "MEDICAL_DATA_REQUIRES_DEDICATED_REVIEW",
  "HEALTH_DATA_REQUIRES_DEDICATED_REVIEW",
  "BYSTANDER_SENSITIVE_REQUIRES_DEPERSONALIZATION",
  "AGGREGATE_ONLY_REQUIRED",
  "DEPERSONALIZED_ONLY_REQUIRED",
  "PROOF_ONLY_ALLOWED",
  "SAFE_PROJECTION_ALLOWED",
  "AGGREGATED_ALLOWED",
  "HUMAN_REVIEW_REQUIRED",
  "DEDICATED_POLICY_GATE_MISSING",
  "RETENTION_LIMIT_REQUIRED",
  "JURISDICTION_POLICY_REQUIRED",
] as const;
export type HighSensitivityReasonCode =
  (typeof HIGH_SENSITIVITY_REASON_CODES)[number];

export type HighSensitivityDecisionKind =
  | "ALLOW_SAFE_PROJECTION"
  | "ALLOW_PROOF_ONLY"
  | "ALLOW_AGGREGATED"
  | "REQUIRES_REVIEW"
  | "DENY";

export interface HighSensitivityPolicyInput {
  sensitivity_class: string;
  sensitive_categories: string[];
  access_mode: DataAccessMode;
  intended_use: string;
  consent_confirmed: boolean;
  opt_in_confirmed: boolean;
  training_allowed?: boolean;
  model_improvement_allowed?: boolean;
  redistribution_allowed?: boolean;
  commercial_use_allowed?: boolean;
  depersonalized_only?: boolean;
  aggregate_only?: boolean;
  retention_policy?: string | null;
}

export interface HighSensitivityPolicyDecision {
  decision: HighSensitivityDecisionKind;
  reason_codes: HighSensitivityReasonCode[];
  allowed_access_modes: DataAccessMode[];
  denied_access_modes: DataAccessMode[];
  required_controls: string[];
  approval_required: boolean;
  human_review_required: boolean;
  // Invariants — never relaxed by this gate.
  raw_body_allowed: false;
  training_allowed: boolean;
  model_improvement_allowed: boolean;
  redistribution_allowed: boolean;
  commercial_use_allowed: boolean;
  retention_limit: string | null;
  proof_required: true;
  audit_required: true;
}

// Category precedence — the strictest wins.
function worstCategory(cats: string[]): string | null {
  const up = cats.map((c) => c.toUpperCase());
  for (const c of ["CHILDREN", "BIOMETRIC", "MEDICAL", "HEALTH", "LOCATION", "BYSTANDER"]) {
    if (up.includes(c)) return c;
  }
  return null;
}

// WHAT: Evaluate whether (and how) high-sensitivity data may be accessed.
// INPUT: package sensitivity + access mode + intended use + consent state.
// OUTPUT: a graded HighSensitivityPolicyDecision (default DENY/REVIEW).
// WHY: The dedicated gate. Never allows raw content; allows only safe modes,
//      per category, under strict controls.
export function evaluateHighSensitivityAccess(
  input: HighSensitivityPolicyInput,
): HighSensitivityPolicyDecision {
  const base = {
    raw_body_allowed: false as const,
    // High-sensitivity NEVER carries these rights through this gate.
    training_allowed: false,
    model_improvement_allowed: false,
    redistribution_allowed: false,
    commercial_use_allowed: false,
    retention_limit:
      typeof input.retention_policy === "string" ? input.retention_policy : null,
    proof_required: true as const,
    audit_required: true as const,
  };
  const deny = (codes: HighSensitivityReasonCode[]): HighSensitivityPolicyDecision => ({
    ...base,
    decision: "DENY",
    reason_codes: codes,
    allowed_access_modes: [],
    denied_access_modes: [
      "PROOF_ONLY",
      "SAFE_PROJECTION",
      "RETRIEVAL_QUERY",
      "CAPSULE_REFERENCE",
      "MEMORY_CAPSULE_BUNDLE",
      "AGGREGATED_SIGNAL",
      "DEPERSONALIZED_SIGNAL",
      "LLM_CONTEXT_ACCESS",
      "APP_WORLD_PERSONALIZATION",
    ],
    required_controls: ["CONSENT", "OPT_IN", "PROOF", "AUDIT"],
    approval_required: true,
    human_review_required: false,
  });
  const review = (codes: HighSensitivityReasonCode[]): HighSensitivityPolicyDecision => ({
    ...deny([...codes, "HUMAN_REVIEW_REQUIRED"]),
    decision: "REQUIRES_REVIEW",
    human_review_required: true,
  });

  // Consent + opt-in are mandatory for any high-sensitivity access.
  if (!input.consent_confirmed) return deny(["CONSENT_REQUIRED"]);
  if (!input.opt_in_confirmed) return deny(["OPT_IN_REQUIRED"]);
  // Training / model-improvement intents are never permitted here.
  if (input.intended_use === "TRAINING") return deny(["TRAINING_NOT_ALLOWED"]);
  if (input.intended_use === "MODEL_IMPROVEMENT")
    return deny(["MODEL_IMPROVEMENT_NOT_ALLOWED"]);

  const mode = input.access_mode;
  const isProof = mode === "PROOF_ONLY";
  const isSafe = mode === "SAFE_PROJECTION" || mode === "MEMORY_CAPSULE_BUNDLE";
  const isAggregate =
    mode === "AGGREGATED_SIGNAL" || mode === "DEPERSONALIZED_SIGNAL";

  const cat = worstCategory(input.sensitive_categories);

  // CHILDREN — denied pending a dedicated children-data program.
  if (cat === "CHILDREN") return deny(["CHILDREN_DATA_REQUIRES_DEDICATED_REVIEW"]);

  // BIOMETRIC — proof-only, else review (no raw, no recognition, no inference).
  if (cat === "BIOMETRIC") {
    if (isProof)
      return {
        ...base,
        decision: "ALLOW_PROOF_ONLY",
        reason_codes: ["PROOF_ONLY_ALLOWED"],
        allowed_access_modes: ["PROOF_ONLY"],
        denied_access_modes: ["SAFE_PROJECTION", "RETRIEVAL_QUERY", "CAPSULE_REFERENCE", "MEMORY_CAPSULE_BUNDLE"],
        required_controls: ["CONSENT", "OPT_IN", "PROOF", "AUDIT", "NO_RAW", "NO_RECOGNITION"],
        approval_required: false,
        human_review_required: false,
      };
    return review(["BIOMETRIC_DATA_REQUIRES_DEDICATED_REVIEW"]);
  }

  // MEDICAL — proof-only, else review.
  if (cat === "MEDICAL") {
    if (isProof)
      return {
        ...base,
        decision: "ALLOW_PROOF_ONLY",
        reason_codes: ["PROOF_ONLY_ALLOWED"],
        allowed_access_modes: ["PROOF_ONLY"],
        denied_access_modes: ["SAFE_PROJECTION", "RETRIEVAL_QUERY", "CAPSULE_REFERENCE", "MEMORY_CAPSULE_BUNDLE"],
        required_controls: ["CONSENT", "OPT_IN", "PROOF", "AUDIT", "NO_RAW"],
        approval_required: false,
        human_review_required: false,
      };
    return review(["MEDICAL_DATA_REQUIRES_DEDICATED_REVIEW"]);
  }

  // HEALTH — safe projection (or proof) allowed under strict controls.
  if (cat === "HEALTH") {
    if (isProof || isSafe)
      return {
        ...base,
        decision: "ALLOW_SAFE_PROJECTION",
        reason_codes: ["SAFE_PROJECTION_ALLOWED"],
        allowed_access_modes: ["PROOF_ONLY", "SAFE_PROJECTION"],
        denied_access_modes: ["RETRIEVAL_QUERY", "CAPSULE_REFERENCE", "LLM_CONTEXT_ACCESS"],
        required_controls: ["CONSENT", "OPT_IN", "PROOF", "AUDIT", "NO_RAW", "REVOCABLE", "RETENTION"],
        approval_required: false,
        human_review_required: false,
      };
    return review(["HEALTH_DATA_REQUIRES_DEDICATED_REVIEW"]);
  }

  // BYSTANDER — aggregate/depersonalized preferred; proof-only otherwise.
  if (cat === "BYSTANDER") {
    if (input.aggregate_only === true || input.depersonalized_only === true || isAggregate)
      return {
        ...base,
        decision: "ALLOW_AGGREGATED",
        reason_codes: ["AGGREGATED_ALLOWED"],
        allowed_access_modes: ["AGGREGATED_SIGNAL", "DEPERSONALIZED_SIGNAL", "PROOF_ONLY"],
        denied_access_modes: ["SAFE_PROJECTION", "CAPSULE_REFERENCE", "RETRIEVAL_QUERY", "MEMORY_CAPSULE_BUNDLE"],
        required_controls: ["CONSENT", "OPT_IN", "PROOF", "AUDIT", "DEPERSONALIZED_OR_AGGREGATE"],
        approval_required: false,
        human_review_required: false,
      };
    if (isProof)
      return {
        ...base,
        decision: "ALLOW_PROOF_ONLY",
        reason_codes: ["PROOF_ONLY_ALLOWED"],
        allowed_access_modes: ["PROOF_ONLY"],
        denied_access_modes: ["SAFE_PROJECTION", "CAPSULE_REFERENCE", "RETRIEVAL_QUERY", "MEMORY_CAPSULE_BUNDLE"],
        required_controls: ["CONSENT", "OPT_IN", "PROOF", "AUDIT"],
        approval_required: false,
        human_review_required: false,
      };
    return review(["BYSTANDER_SENSITIVE_REQUIRES_DEPERSONALIZATION"]);
  }

  // LOCATION — safe projection only with a retention limit; else review.
  if (cat === "LOCATION") {
    if (base.retention_limit === null) return review(["RETENTION_LIMIT_REQUIRED"]);
    if (isProof || isSafe)
      return {
        ...base,
        decision: "ALLOW_SAFE_PROJECTION",
        reason_codes: ["SAFE_PROJECTION_ALLOWED", "RETENTION_LIMIT_REQUIRED"],
        allowed_access_modes: ["PROOF_ONLY", "SAFE_PROJECTION"],
        denied_access_modes: ["RETRIEVAL_QUERY", "CAPSULE_REFERENCE"],
        required_controls: ["CONSENT", "OPT_IN", "PROOF", "AUDIT", "RETENTION"],
        approval_required: false,
        human_review_required: false,
      };
    return review(["JURISDICTION_POLICY_REQUIRED"]);
  }

  // HIGH_SENSITIVITY class but no recognized category — fail safe to review.
  return review(["DEDICATED_POLICY_GATE_MISSING"]);
}
