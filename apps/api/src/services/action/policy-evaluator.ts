// FILE: policy-evaluator.ts
// PURPOSE: Pure deterministic policy evaluator for ADR-0057 Section 2
//          Autonomous Execution Core. Accepts a frozen PolicyEnvelope
//          snapshot of all autonomy/risk/policy inputs at intent-formation
//          time and returns a discriminated-union ActionDecisionResult
//          per the §3 contract. Writes nothing. Reads nothing. Throws
//          nothing for fail-closed cases — returns `{ ok: false }`
//          envelopes instead per ADR-0057 §3 fail-closed posture.
//
//          The same shape as governance/escalation.service.ts'
//          resolveDualControlTarget per ADR-0026 §5 BEAM-compatibility
//          pattern 6 (pure transformation) — the evaluator is portable
//          to the future BEAM/Elixir COSMP coordination layer per
//          ADR-0028 §Forward Queue + ADR-0030 by construction.
//
// CONNECTS TO: ADR-0057 §3 (signature + PolicyEnvelope fields +
//                ActionDecisionResult discriminated union),
//              ADR-0057 §4 (autonomy ladder rungs 1-6 — each rung
//                load-bearing; later rungs cannot weaken earlier rungs),
//              ADR-0057 §10 (forbidden-fields list — the `reason` strings
//                this evaluator emits are SAFE enum-bound markers, never
//                leak raw envelope content),
//              ADR-0026 §5 (BEAM-compatibility pattern 6 pure transformation;
//                same shape as resolveDualControlTarget),
//              packages/database/prisma/schema.prisma (ActionRiskTier,
//                ActionDecision, ActionType enums declared by PR #18),
//              apps/api/src/services/governance/escalation.service.ts
//                (the forward consumer when REQUIRE_DUAL_CONTROL paired
//                with EscalationRequest per ADR-0057 §5; not consumed at
//                this slice).
//
// NO-LEAK BOUNDARY (RULE 0 + ADR-0057 §10):
//   The `reason` strings returned by this evaluator are an enum-bound
//   set of SAFE markers (e.g., "org-require-human-approval",
//   "critical-tier-dual-control-floor", "observe-only-twin",
//   "policy-forbidden", "approval-required-default-dual-control",
//   "approval-required-explicit-auto-approve",
//   "executive-override-auto-approve-low-risk",
//   "executive-override-auto-approve-medium-risk",
//   "executive-override-dual-control-low-risk-no-org-gate",
//   "executive-override-dual-control-high-risk",
//   "executive-override-dual-control-no-policy-grant",
//   "policy-require-break-glass",
//   "policy-require-dual-control"). These are STABLE identifiers safe
//   to emit in audit details + Control Tower telemetry. They NEVER
//   reveal envelope content (autonomy_level / capability bits /
//   permission counts / job titles / role templates / org IDs).
//   Adding a new reason code requires updating REASON_CODES below.
//
// RULE 13 SUBSTRATE-HONEST OBSERVATION (preserved at the docs tier):
//   ADR-0057 §4.4 vs §4.5 surface an apparent asymmetry on HIGH risk:
//     - §4.4 (APPROVAL_REQUIRED) says: "all actions are
//       REQUIRE_DUAL_CONTROL unless the ActionPolicy row for the
//       (action_type, risk_tier) pair explicitly grants AUTO_APPROVE."
//       Strict reading: APPROVAL_REQUIRED + ActionPolicy.AUTO_APPROVE
//       on HIGH risk → AUTO_APPROVE.
//     - §4.5 (EXECUTIVE_OVERRIDE) says: "HIGH always REQUIRE_DUAL_CONTROL."
//       Under EXECUTIVE_OVERRIDE + ActionPolicy.AUTO_APPROVE on HIGH risk
//       → REQUIRE_DUAL_CONTROL.
//   This is logically inconsistent if the autonomy_level ordering
//   (APPROVAL_REQUIRED restrictive → EXECUTIVE_OVERRIDE permissive) is
//   meant to be monotonic. THIS EVALUATOR IMPLEMENTS THE LITERAL ADR
//   TEXT: under APPROVAL_REQUIRED + explicit AUTO_APPROVE policy, HIGH
//   risk auto-approves; under EXECUTIVE_OVERRIDE + AUTO_APPROVE policy,
//   HIGH risk requires dual control. The asymmetry is a candidate
//   ADR-0057 amendment topic for the Founder; documenting here per
//   RULE 13 surface-drift discipline rather than silently choosing a
//   coherent-but-non-canonical interpretation.

import type {
  ActionRiskTier,
  ActionDecision,
  ActionType,
  ActionPolicy,
} from "@prisma/client";

// WHAT: The frozen snapshot of all policy inputs at intent-formation
//        time per ADR-0057 §3.
// INPUT: Used as a parameter type.
// OUTPUT: None.
// WHY: Freezing the inputs at create-time means the policy evaluator
//      decides on the substrate that existed at intent-formation time,
//      not at execution time — a load-bearing invariant for audit
//      reconstructibility per ADR-0057 §1 lifecycle + ADR-0002 chain.
export interface PolicyEnvelope {
  twin_autonomy_level: "APPROVAL_REQUIRED" | "EXECUTIVE_OVERRIDE" | "OBSERVE_ONLY";
  org_require_human_approval: boolean;
  org_auto_approve_low_risk: boolean;
  org_audit_ai_actions: boolean;
  entity_profile_safe_view: {
    job_title?: string;
    role_template?: string;
  };
  tar_capability_bits: {
    can_admin_org: boolean;
    can_admin_niov: boolean;
    can_write_capsules: boolean;
    can_share_capsules: boolean;
  };
  permission_set_summary: {
    count: number;
    bridges: readonly string[];
  };
  action_policy_row: ActionPolicy | null;
}

// WHAT: The evaluator input wrapper per ADR-0057 §3 signature.
// INPUT: Used as a parameter type.
// OUTPUT: None.
// WHY: callerEntityId + org_entity_id + action_type + risk_tier identify
//      the Action being evaluated; policy_envelope is the frozen
//      snapshot the evaluator operates on. The wrapper mirrors the ADR
//      signature exactly.
export interface EvaluateActionPolicyInput {
  callerEntityId: string;
  org_entity_id: string;
  action_type: ActionType;
  risk_tier: ActionRiskTier;
  policy_envelope: PolicyEnvelope;
}

// WHAT: The discriminated-union evaluator output per ADR-0057 §3.
// INPUT: Used as a return type.
// OUTPUT: None.
// WHY: Every consumer (route handler at create-time, future scheduler,
//      future executor) MUST handle every branch. The TS exhaustiveness
//      check is the structural guard against silent branch misses.
export type ActionDecisionResult =
  | { ok: true; decision: "AUTO_APPROVE"; reason: string }
  | { ok: true; decision: "REQUIRE_DUAL_CONTROL"; reason: string }
  | { ok: true; decision: "REQUIRE_BREAK_GLASS"; reason: string }
  | { ok: true; decision: "FORBIDDEN"; reason: string }
  | { ok: false; reason: "POLICY_UNRESOLVED" | "ENVELOPE_INVALID" };

// WHAT: The canonical enum-bound set of reason strings the evaluator
//        emits. Stable identifiers safe to surface in audit details /
//        Control Tower telemetry. NEVER leak envelope content.
// INPUT: Used as a value namespace.
// OUTPUT: None.
// WHY: Centralizing the reason strings here is the no-leak boundary —
//      future audit-details emitters can `Set<keyof typeof REASON_CODES>`
//      membership-test against this when ADR-0057 §10 emitter wiring
//      lands. Per ADR-0057 §10 forbidden-details list, the reason string
//      itself must be a stable enum-like marker, never free-form text.
export const REASON_CODES = {
  ORG_REQUIRE_HUMAN_APPROVAL: "org-require-human-approval",
  POLICY_FORBIDDEN: "policy-forbidden",
  OBSERVE_ONLY_TWIN: "observe-only-twin",
  POLICY_REQUIRE_BREAK_GLASS: "policy-require-break-glass",
  CRITICAL_TIER_DUAL_CONTROL_FLOOR: "critical-tier-dual-control-floor",
  POLICY_REQUIRE_DUAL_CONTROL: "policy-require-dual-control",
  APPROVAL_REQUIRED_DEFAULT_DUAL_CONTROL: "approval-required-default-dual-control",
  APPROVAL_REQUIRED_EXPLICIT_AUTO_APPROVE: "approval-required-explicit-auto-approve",
  EXECUTIVE_OVERRIDE_AUTO_APPROVE_LOW_RISK: "executive-override-auto-approve-low-risk",
  EXECUTIVE_OVERRIDE_AUTO_APPROVE_MEDIUM_RISK: "executive-override-auto-approve-medium-risk",
  EXECUTIVE_OVERRIDE_DUAL_CONTROL_LOW_RISK_NO_ORG_GATE: "executive-override-dual-control-low-risk-no-org-gate",
  EXECUTIVE_OVERRIDE_DUAL_CONTROL_HIGH_RISK: "executive-override-dual-control-high-risk",
  EXECUTIVE_OVERRIDE_DUAL_CONTROL_NO_POLICY_GRANT: "executive-override-dual-control-no-policy-grant",
} as const;

// WHAT: Structurally validate the envelope shape at runtime per
//        ADR-0057 §3 fail-closed posture.
// INPUT: An unknown candidate value.
// OUTPUT: True if the candidate satisfies the PolicyEnvelope shape's
//         minimum structural requirements.
// WHY: Routes receive policy_envelope as JSON from the request body or
//      from the create-time snapshot; structural validation here lets
//      the evaluator return `{ ok: false, reason: "ENVELOPE_INVALID" }`
//      instead of throwing on a missing field. Conservative: only
//      checks the autonomy_level + boolean flags. Detailed per-field
//      semantic validation (e.g., job_title PII filtering) lives at
//      the snapshot-construction tier per ADR-0057 §10.
function isEnvelopeStructurallyValid(env: unknown): env is PolicyEnvelope {
  if (env === null || typeof env !== "object") return false;
  const e = env as Record<string, unknown>;
  if (
    e.twin_autonomy_level !== "APPROVAL_REQUIRED" &&
    e.twin_autonomy_level !== "EXECUTIVE_OVERRIDE" &&
    e.twin_autonomy_level !== "OBSERVE_ONLY"
  ) {
    return false;
  }
  if (typeof e.org_require_human_approval !== "boolean") return false;
  if (typeof e.org_auto_approve_low_risk !== "boolean") return false;
  if (typeof e.org_audit_ai_actions !== "boolean") return false;
  if (e.entity_profile_safe_view === null || typeof e.entity_profile_safe_view !== "object") {
    return false;
  }
  if (e.tar_capability_bits === null || typeof e.tar_capability_bits !== "object") {
    return false;
  }
  if (e.permission_set_summary === null || typeof e.permission_set_summary !== "object") {
    return false;
  }
  return true;
}

// WHAT: Validate the wrapper input shape — risk_tier + action_type +
//        identifiers — at runtime per ADR-0057 §3 fail-closed posture.
// INPUT: An EvaluateActionPolicyInput candidate.
// OUTPUT: True if the input is structurally valid.
// WHY: Same rationale as isEnvelopeStructurallyValid — returns
//      `{ ok: false, reason: "ENVELOPE_INVALID" }` on bad input instead
//      of throwing. Conservative: checks string-shape of IDs +
//      enum-membership of risk_tier + presence of action_type.
function isInputStructurallyValid(
  input: unknown,
): input is EvaluateActionPolicyInput {
  if (input === null || typeof input !== "object") return false;
  const i = input as Record<string, unknown>;
  if (typeof i.callerEntityId !== "string" || i.callerEntityId.length === 0) {
    return false;
  }
  if (typeof i.org_entity_id !== "string" || i.org_entity_id.length === 0) {
    return false;
  }
  if (typeof i.action_type !== "string" || (i.action_type as string).length === 0) {
    return false;
  }
  const tier = i.risk_tier;
  if (tier !== "LOW" && tier !== "MEDIUM" && tier !== "HIGH" && tier !== "CRITICAL") {
    return false;
  }
  if (!isEnvelopeStructurallyValid(i.policy_envelope)) {
    return false;
  }
  return true;
}

// WHAT: Resolve the (action_type, risk_tier) ActionPolicy row's
//        default_decision, treating a null policy row as "unresolved"
//        per ADR-0057 §3 fail-closed posture.
// INPUT: The policy_envelope.action_policy_row + the matching
//        (action_type, risk_tier) pair.
// OUTPUT: The matching default_decision, or null if no policy row.
// WHY: The policy row is keyed by (org_entity_id, action_type, risk_tier);
//      the resolver simply confirms the row matches the input's
//      (action_type, risk_tier) — if it does not match, treat as
//      unresolved. This is the "ambiguous policy → POLICY_UNRESOLVED"
//      rule per ADR-0057 §3.
function resolvePolicyDecision(
  policy_row: ActionPolicy | null,
  action_type: ActionType,
  risk_tier: ActionRiskTier,
): ActionDecision | null {
  if (policy_row === null) return null;
  if (policy_row.action_type !== action_type) return null;
  if (policy_row.risk_tier !== risk_tier) return null;
  return policy_row.default_decision;
}

// WHAT: The pure deterministic policy evaluator per ADR-0057 §3 + §4.
// INPUT: An EvaluateActionPolicyInput wrapper containing
//        callerEntityId + org_entity_id + action_type + risk_tier +
//        policy_envelope.
// OUTPUT: A discriminated-union ActionDecisionResult — either
//         `{ ok: true; decision: ...; reason: ... }` or
//         `{ ok: false; reason: "POLICY_UNRESOLVED" | "ENVELOPE_INVALID" }`.
// WHY: This is the load-bearing autonomy-ladder gate. Every Action
//      created via POST /api/v1/actions (forward-substrate per ADR-0057
//      §16 step 4) runs through this function at create-time. The
//      function writes nothing, reads nothing, calls nothing — pure
//      and trivially testable. The order of rung evaluation mirrors
//      ADR-0057 §4 verbatim; each rung is annotated with its §4 rung
//      number for traceability.
//
//      Order of evaluation (most restrictive first; earliest match wins):
//        STRUCTURAL VALIDATION → ENVELOPE_INVALID
//        Rung 1 (§4.1) — org_require_human_approval → REQUIRE_DUAL_CONTROL
//        EXPLICIT POLICY FORBIDDEN — overrides everything below (per
//          §4.2 note that policy FORBIDDEN overrides the CRITICAL floor)
//        Rung 3 (§4.3) — autonomy_level OBSERVE_ONLY → FORBIDDEN
//        EXPLICIT POLICY REQUIRE_BREAK_GLASS → REQUIRE_BREAK_GLASS
//        Rung 2 (§4.2) — risk_tier CRITICAL → REQUIRE_DUAL_CONTROL floor
//        EXPLICIT POLICY REQUIRE_DUAL_CONTROL → REQUIRE_DUAL_CONTROL
//        Rung 4 (§4.4) — autonomy_level APPROVAL_REQUIRED
//        Rung 5 (§4.5) — autonomy_level EXECUTIVE_OVERRIDE with tier
//          gates + Rung 6 (§4.6) auto_approve_low_risk for LOW
export function evaluateActionPolicy(
  input: EvaluateActionPolicyInput,
): ActionDecisionResult {
  // Structural validation (§3 fail-closed).
  if (!isInputStructurallyValid(input)) {
    return { ok: false, reason: "ENVELOPE_INVALID" };
  }

  const { action_type, risk_tier, policy_envelope } = input;
  const {
    twin_autonomy_level,
    org_require_human_approval,
    org_auto_approve_low_risk,
    action_policy_row,
  } = policy_envelope;
  const policy_decision = resolvePolicyDecision(action_policy_row, action_type, risk_tier);

  // EXPLICIT POLICY FORBIDDEN — strictly more restrictive than every
  // other rung. §4.2 note: "If the per-org ActionPolicy row sets the
  // CRITICAL default to FORBIDDEN, that overrides." Generalized: an
  // explicit policy FORBIDDEN wins everywhere, not just at CRITICAL.
  if (policy_decision === "FORBIDDEN") {
    return {
      ok: true,
      decision: "FORBIDDEN",
      reason: REASON_CODES.POLICY_FORBIDDEN,
    };
  }

  // Rung 3 (§4.3) — OBSERVE_ONLY twins cannot execute any action.
  // Checked before Rung 1 (require_human_approval) because OBSERVE_ONLY
  // is the more restrictive outcome (FORBIDDEN > REQUIRE_DUAL_CONTROL).
  if (twin_autonomy_level === "OBSERVE_ONLY") {
    return {
      ok: true,
      decision: "FORBIDDEN",
      reason: REASON_CODES.OBSERVE_ONLY_TWIN,
    };
  }

  // Rung 1 (§4.1) — org_require_human_approval = true overrides
  // everything below (every autonomy_level, every risk_tier). Default
  // true per schema.prisma OrgSettings; safe HITL default.
  if (org_require_human_approval) {
    return {
      ok: true,
      decision: "REQUIRE_DUAL_CONTROL",
      reason: REASON_CODES.ORG_REQUIRE_HUMAN_APPROVAL,
    };
  }

  // EXPLICIT POLICY REQUIRE_BREAK_GLASS — paired with BreakGlassGrant
  // per ADR-0057 §6 (BG.2 reuse, no relaxation). Honored as a stronger
  // restriction than autonomy-ladder defaults.
  if (policy_decision === "REQUIRE_BREAK_GLASS") {
    return {
      ok: true,
      decision: "REQUIRE_BREAK_GLASS",
      reason: REASON_CODES.POLICY_REQUIRE_BREAK_GLASS,
    };
  }

  // Rung 2 (§4.2) — CRITICAL risk_tier is always REQUIRE_DUAL_CONTROL
  // at minimum. No autonomy level — not even EXECUTIVE_OVERRIDE —
  // auto-approves CRITICAL. The "FORBIDDEN-by-policy overrides" branch
  // already ran above; here we only handle the DUAL_CONTROL floor.
  if (risk_tier === "CRITICAL") {
    return {
      ok: true,
      decision: "REQUIRE_DUAL_CONTROL",
      reason: REASON_CODES.CRITICAL_TIER_DUAL_CONTROL_FLOOR,
    };
  }

  // EXPLICIT POLICY REQUIRE_DUAL_CONTROL — honor the explicit policy
  // grant. Distinct from the autonomy-level default because the policy
  // row may set it for a (action_type, risk_tier) that would otherwise
  // be AUTO_APPROVE-eligible.
  if (policy_decision === "REQUIRE_DUAL_CONTROL") {
    return {
      ok: true,
      decision: "REQUIRE_DUAL_CONTROL",
      reason: REASON_CODES.POLICY_REQUIRE_DUAL_CONTROL,
    };
  }

  // Rung 4 (§4.4) — APPROVAL_REQUIRED → REQUIRE_DUAL_CONTROL by default;
  // ActionPolicy.AUTO_APPROVE for the matching (action_type, risk_tier)
  // is the explicit override path. Per the literal ADR text, this
  // allowance is NOT tier-gated (unlike Rung 5); see the file-header
  // RULE 13 substrate-honest observation about the §4.4-vs-§4.5
  // HIGH-risk asymmetry.
  if (twin_autonomy_level === "APPROVAL_REQUIRED") {
    if (policy_decision === "AUTO_APPROVE") {
      return {
        ok: true,
        decision: "AUTO_APPROVE",
        reason: REASON_CODES.APPROVAL_REQUIRED_EXPLICIT_AUTO_APPROVE,
      };
    }
    // No policy row (resolved-as-null) at APPROVAL_REQUIRED defaults
    // to REQUIRE_DUAL_CONTROL — the Foundation safe HITL default.
    // POLICY_UNRESOLVED is not raised here because APPROVAL_REQUIRED's
    // default is DUAL_CONTROL (a defined outcome, not unresolved).
    return {
      ok: true,
      decision: "REQUIRE_DUAL_CONTROL",
      reason: REASON_CODES.APPROVAL_REQUIRED_DEFAULT_DUAL_CONTROL,
    };
  }

  // Rung 5 (§4.5) + Rung 6 (§4.6) — EXECUTIVE_OVERRIDE is *permission
  // to be auto-approved subject to policy*, not permission to skip
  // policy. Tier gates apply: HIGH always REQUIRE_DUAL_CONTROL; MEDIUM
  // requires ActionPolicy.AUTO_APPROVE; LOW requires both
  // ActionPolicy.AUTO_APPROVE AND org_auto_approve_low_risk = true.
  if (twin_autonomy_level === "EXECUTIVE_OVERRIDE") {
    // HIGH always REQUIRE_DUAL_CONTROL per §4.5 explicit text, even
    // with ActionPolicy.AUTO_APPROVE.
    if (risk_tier === "HIGH") {
      return {
        ok: true,
        decision: "REQUIRE_DUAL_CONTROL",
        reason: REASON_CODES.EXECUTIVE_OVERRIDE_DUAL_CONTROL_HIGH_RISK,
      };
    }
    // Without an explicit ActionPolicy.AUTO_APPROVE grant, the default
    // is REQUIRE_DUAL_CONTROL — EXECUTIVE_OVERRIDE is not a blanket
    // bypass per §4.5.
    if (policy_decision !== "AUTO_APPROVE") {
      return {
        ok: true,
        decision: "REQUIRE_DUAL_CONTROL",
        reason: REASON_CODES.EXECUTIVE_OVERRIDE_DUAL_CONTROL_NO_POLICY_GRANT,
      };
    }
    // MEDIUM + ActionPolicy.AUTO_APPROVE → AUTO_APPROVE per §4.5.
    if (risk_tier === "MEDIUM") {
      return {
        ok: true,
        decision: "AUTO_APPROVE",
        reason: REASON_CODES.EXECUTIVE_OVERRIDE_AUTO_APPROVE_MEDIUM_RISK,
      };
    }
    // LOW + ActionPolicy.AUTO_APPROVE: gated by Rung 6
    // org_auto_approve_low_risk = true.
    if (risk_tier === "LOW") {
      if (org_auto_approve_low_risk) {
        return {
          ok: true,
          decision: "AUTO_APPROVE",
          reason: REASON_CODES.EXECUTIVE_OVERRIDE_AUTO_APPROVE_LOW_RISK,
        };
      }
      return {
        ok: true,
        decision: "REQUIRE_DUAL_CONTROL",
        reason: REASON_CODES.EXECUTIVE_OVERRIDE_DUAL_CONTROL_LOW_RISK_NO_ORG_GATE,
      };
    }
  }

  // Defensive fall-through: every reachable branch above returns; this
  // is unreachable under the current enum surface but exists to satisfy
  // the no-implicit-return discipline + the §3 fail-closed posture if
  // the autonomy_level or risk_tier surface ever widens without the
  // evaluator being updated. Returning POLICY_UNRESOLVED honors §3 +
  // §4's "later rungs cannot weaken earlier rungs" — when in doubt,
  // fail closed.
  return { ok: false, reason: "POLICY_UNRESOLVED" };
}
