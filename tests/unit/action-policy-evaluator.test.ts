// FILE: action-policy-evaluator.test.ts (unit)
// PURPOSE: Cover the ADR-0057 §3 + §4 pure-function policy evaluator at
//          apps/api/src/services/action/policy-evaluator.ts. All cases
//          are pure-input / pure-output — no DB, no fixtures, no setup
//          teardown. Mirrors the tests/unit/moment-context.test.ts /
//          tests/unit/degraded-mode-contract.test.ts pure-function
//          unit-tier precedent.
// CONNECTS TO: apps/api/src/services/action/policy-evaluator.ts (via
//              "@niov/api" barrel), packages/database/prisma/schema.prisma
//              (ActionRiskTier / ActionDecision / ActionType / ActionPolicy
//              types declared by PR #18).
//
// COVERAGE MATRIX (each row exercises one rung or one structural
// guarantee; numbered to match the QLOCK's "minimum test cases" list
// where applicable):
//
//   1.  OBSERVE_ONLY twin → FORBIDDEN at LOW (and every tier)
//   2.  CRITICAL risk_tier → REQUIRE_DUAL_CONTROL even with
//       EXECUTIVE_OVERRIDE + ActionPolicy.AUTO_APPROVE
//   3.  OrgSettings.require_human_approval = true → REQUIRE_DUAL_CONTROL
//       at every tier and every autonomy_level
//   4.  Missing policy at APPROVAL_REQUIRED → default REQUIRE_DUAL_CONTROL
//       (NOT POLICY_UNRESOLVED — the APPROVAL_REQUIRED safe HITL default
//       is a defined decision, per ADR-0057 §4.4)
//   5.  Explicit ActionPolicy.FORBIDDEN → FORBIDDEN at every tier
//   6.  Explicit ActionPolicy.REQUIRE_DUAL_CONTROL → REQUIRE_DUAL_CONTROL
//   7.  Explicit ActionPolicy.REQUIRE_BREAK_GLASS → REQUIRE_BREAK_GLASS
//   8.  EXECUTIVE_OVERRIDE + ActionPolicy.AUTO_APPROVE + LOW + org gate
//       → AUTO_APPROVE; without org gate → REQUIRE_DUAL_CONTROL
//   9.  APPROVAL_REQUIRED + no explicit AUTO_APPROVE policy →
//       REQUIRE_DUAL_CONTROL
//   10. APPROVAL_REQUIRED + explicit AUTO_APPROVE policy → AUTO_APPROVE
//       only when no higher-priority gate blocks
//   11. HIGH risk_tier behavior — RULE 13 substrate-honest:
//       (a) Under EXECUTIVE_OVERRIDE + AUTO_APPROVE policy → REQUIRE_DUAL_CONTROL
//           (per ADR-0057 §4.5 explicit text "HIGH always REQUIRE_DUAL_CONTROL")
//       (b) Under APPROVAL_REQUIRED + AUTO_APPROVE policy → AUTO_APPROVE
//           (per ADR-0057 §4.4 literal text — no tier gate)
//       This asymmetry is documented at the file header of the evaluator;
//       both branches are tested verbatim to lock the literal ADR semantics.
//   12. ENVELOPE_INVALID for structurally bad input — returns
//       `{ ok: false, reason: "ENVELOPE_INVALID" }`
//
// ADDITIONAL COVERAGE (beyond the QLOCK minimum):
//   - Reason codes are from the canonical REASON_CODES enum (no
//     ad-hoc strings)
//   - Policy-row (action_type, risk_tier) mismatch → treated as
//     unresolved → falls through to autonomy-level default
//   - EXECUTIVE_OVERRIDE + MEDIUM + AUTO_APPROVE policy → AUTO_APPROVE
//   - Combined-restriction precedence: when multiple rungs apply, the
//     most-restrictive outcome wins (FORBIDDEN > REQUIRE_BREAK_GLASS >
//     REQUIRE_DUAL_CONTROL > AUTO_APPROVE)

import { describe, expect, it } from "vitest";
import {
  evaluateActionPolicy,
  REASON_CODES,
  type PolicyEnvelope,
  type EvaluateActionPolicyInput,
} from "@niov/api";
import type {
  ActionPolicy,
  ActionRiskTier,
  ActionType,
  ActionDecision,
} from "@prisma/client";

const CALLER = "11111111-1111-1111-1111-111111111111";
const ORG = "22222222-2222-2222-2222-222222222222";
const UPDATED_BY = "33333333-3333-3333-3333-333333333333";
const POLICY_ID = "44444444-4444-4444-4444-444444444444";

// WHAT: Construct a structurally-valid PolicyEnvelope with sensible
//        defaults; per-test overrides take precedence.
// INPUT: Partial<PolicyEnvelope>.
// OUTPUT: A fully-populated PolicyEnvelope.
// WHY: Every test case in this file overrides 1-3 fields of an
//      otherwise-default envelope. Centralizing the defaults here means
//      individual tests are self-explanatory.
function envelope(overrides: Partial<PolicyEnvelope> = {}): PolicyEnvelope {
  return {
    twin_autonomy_level: "APPROVAL_REQUIRED",
    org_require_human_approval: false,
    org_auto_approve_low_risk: false,
    org_audit_ai_actions: true,
    entity_profile_safe_view: {},
    tar_capability_bits: {
      can_admin_org: false,
      can_admin_niov: false,
      can_write_capsules: false,
      can_share_capsules: false,
    },
    permission_set_summary: { count: 0, bridges: [] },
    action_policy_row: null,
    ...overrides,
  };
}

// WHAT: Construct an ActionPolicy fixture matching the (action_type,
//        risk_tier) pair under test.
// INPUT: action_type + risk_tier + default_decision.
// OUTPUT: An ActionPolicy row shape.
// WHY: ActionPolicy is the per-(org, action_type, risk_tier) policy
//      tuple per ADR-0057 §3; tests need to supply policy rows that
//      match the input's (action_type, risk_tier) to exercise the
//      explicit-policy branches.
function policy(
  action_type: ActionType,
  risk_tier: ActionRiskTier,
  default_decision: ActionDecision,
): ActionPolicy {
  return {
    policy_id: POLICY_ID,
    org_entity_id: ORG,
    action_type,
    risk_tier,
    default_decision,
    require_admin_capability: null,
    updated_by: UPDATED_BY,
    created_at: new Date("2026-05-29T00:00:00.000Z"),
    updated_at: new Date("2026-05-29T00:00:00.000Z"),
  };
}

// WHAT: Construct an EvaluateActionPolicyInput wrapper with the given
//        risk_tier + policy_envelope.
// INPUT: risk_tier + (optional) envelope overrides + (optional)
//        action_type override.
// OUTPUT: A full EvaluateActionPolicyInput.
// WHY: Tests assemble inputs by overriding 1-2 fields; this helper
//      keeps the identifiers + action_type defaults consistent.
function input(
  risk_tier: ActionRiskTier,
  envelopeOverrides: Partial<PolicyEnvelope> = {},
  action_type: ActionType = "RECORD_CAPSULE",
): EvaluateActionPolicyInput {
  return {
    callerEntityId: CALLER,
    org_entity_id: ORG,
    action_type,
    risk_tier,
    policy_envelope: envelope(envelopeOverrides),
  };
}

describe("ADR-0057 §3 + §4 — evaluateActionPolicy pure deterministic evaluator", () => {
  describe("Rung 3 (§4.3) — OBSERVE_ONLY twin", () => {
    it("Case 1: forbids LOW risk", () => {
      const r = evaluateActionPolicy(
        input("LOW", { twin_autonomy_level: "OBSERVE_ONLY" }),
      );
      expect(r).toEqual({
        ok: true,
        decision: "FORBIDDEN",
        reason: REASON_CODES.OBSERVE_ONLY_TWIN,
      });
    });
    it("forbids MEDIUM risk", () => {
      const r = evaluateActionPolicy(
        input("MEDIUM", { twin_autonomy_level: "OBSERVE_ONLY" }),
      );
      expect(r.ok).toBe(true);
      expect(r.ok === true && r.decision).toBe("FORBIDDEN");
    });
    it("forbids HIGH risk", () => {
      const r = evaluateActionPolicy(
        input("HIGH", { twin_autonomy_level: "OBSERVE_ONLY" }),
      );
      expect(r.ok === true && r.decision).toBe("FORBIDDEN");
    });
    it("forbids CRITICAL risk (OBSERVE_ONLY wins over CRITICAL DUAL_CONTROL floor)", () => {
      const r = evaluateActionPolicy(
        input("CRITICAL", { twin_autonomy_level: "OBSERVE_ONLY" }),
      );
      expect(r.ok === true && r.decision).toBe("FORBIDDEN");
    });
  });

  describe("Rung 2 (§4.2) — CRITICAL risk_tier floor", () => {
    it("Case 2: CRITICAL + EXECUTIVE_OVERRIDE + ActionPolicy.AUTO_APPROVE → REQUIRE_DUAL_CONTROL", () => {
      const r = evaluateActionPolicy(
        input("CRITICAL", {
          twin_autonomy_level: "EXECUTIVE_OVERRIDE",
          action_policy_row: policy("RECORD_CAPSULE", "CRITICAL", "AUTO_APPROVE"),
        }),
      );
      expect(r).toEqual({
        ok: true,
        decision: "REQUIRE_DUAL_CONTROL",
        reason: REASON_CODES.CRITICAL_TIER_DUAL_CONTROL_FLOOR,
      });
    });
    it("CRITICAL + APPROVAL_REQUIRED + ActionPolicy.AUTO_APPROVE → REQUIRE_DUAL_CONTROL (floor wins)", () => {
      const r = evaluateActionPolicy(
        input("CRITICAL", {
          action_policy_row: policy("RECORD_CAPSULE", "CRITICAL", "AUTO_APPROVE"),
        }),
      );
      expect(r.ok === true && r.decision).toBe("REQUIRE_DUAL_CONTROL");
    });
    it("CRITICAL + explicit FORBIDDEN policy → FORBIDDEN (per §4.2 note: policy FORBIDDEN overrides floor)", () => {
      const r = evaluateActionPolicy(
        input("CRITICAL", {
          action_policy_row: policy("RECORD_CAPSULE", "CRITICAL", "FORBIDDEN"),
        }),
      );
      expect(r.ok === true && r.decision).toBe("FORBIDDEN");
    });
  });

  describe("Rung 1 (§4.1) — org_require_human_approval", () => {
    it("Case 3: forces REQUIRE_DUAL_CONTROL at LOW", () => {
      const r = evaluateActionPolicy(
        input("LOW", { org_require_human_approval: true }),
      );
      expect(r).toEqual({
        ok: true,
        decision: "REQUIRE_DUAL_CONTROL",
        reason: REASON_CODES.ORG_REQUIRE_HUMAN_APPROVAL,
      });
    });
    it("forces REQUIRE_DUAL_CONTROL at HIGH even with EXECUTIVE_OVERRIDE + AUTO_APPROVE policy", () => {
      const r = evaluateActionPolicy(
        input("HIGH", {
          org_require_human_approval: true,
          twin_autonomy_level: "EXECUTIVE_OVERRIDE",
          org_auto_approve_low_risk: true,
          action_policy_row: policy("RECORD_CAPSULE", "HIGH", "AUTO_APPROVE"),
        }),
      );
      expect(r.ok === true && r.decision).toBe("REQUIRE_DUAL_CONTROL");
      expect(r.ok === true && r.reason).toBe(REASON_CODES.ORG_REQUIRE_HUMAN_APPROVAL);
    });
  });

  describe("Rung 4 (§4.4) — APPROVAL_REQUIRED autonomy level", () => {
    it("Case 4: missing policy → default REQUIRE_DUAL_CONTROL (Foundation safe HITL default)", () => {
      const r = evaluateActionPolicy(input("LOW"));
      expect(r).toEqual({
        ok: true,
        decision: "REQUIRE_DUAL_CONTROL",
        reason: REASON_CODES.APPROVAL_REQUIRED_DEFAULT_DUAL_CONTROL,
      });
    });
    it("Case 9: no explicit AUTO_APPROVE policy → REQUIRE_DUAL_CONTROL", () => {
      // Policy row exists but matches a different (action_type, risk_tier)
      // tuple → treated as unresolved → falls through to autonomy-level
      // default (DUAL_CONTROL under APPROVAL_REQUIRED).
      const r = evaluateActionPolicy(
        input("LOW", {
          action_policy_row: policy("RECORD_CAPSULE", "HIGH", "AUTO_APPROVE"),
        }),
      );
      expect(r.ok === true && r.decision).toBe("REQUIRE_DUAL_CONTROL");
      expect(r.ok === true && r.reason).toBe(REASON_CODES.APPROVAL_REQUIRED_DEFAULT_DUAL_CONTROL);
    });
    it("Case 10: explicit AUTO_APPROVE policy at LOW → AUTO_APPROVE", () => {
      const r = evaluateActionPolicy(
        input("LOW", {
          action_policy_row: policy("RECORD_CAPSULE", "LOW", "AUTO_APPROVE"),
        }),
      );
      expect(r).toEqual({
        ok: true,
        decision: "AUTO_APPROVE",
        reason: REASON_CODES.APPROVAL_REQUIRED_EXPLICIT_AUTO_APPROVE,
      });
    });
    it("explicit AUTO_APPROVE policy at MEDIUM → AUTO_APPROVE", () => {
      const r = evaluateActionPolicy(
        input("MEDIUM", {
          action_policy_row: policy("RECORD_CAPSULE", "MEDIUM", "AUTO_APPROVE"),
        }),
      );
      expect(r.ok === true && r.decision).toBe("AUTO_APPROVE");
    });
  });

  describe("Rung 5 (§4.5) + Rung 6 (§4.6) — EXECUTIVE_OVERRIDE autonomy level", () => {
    it("Case 8a: LOW + AUTO_APPROVE policy + org_auto_approve_low_risk = true → AUTO_APPROVE", () => {
      const r = evaluateActionPolicy(
        input("LOW", {
          twin_autonomy_level: "EXECUTIVE_OVERRIDE",
          org_auto_approve_low_risk: true,
          action_policy_row: policy("RECORD_CAPSULE", "LOW", "AUTO_APPROVE"),
        }),
      );
      expect(r).toEqual({
        ok: true,
        decision: "AUTO_APPROVE",
        reason: REASON_CODES.EXECUTIVE_OVERRIDE_AUTO_APPROVE_LOW_RISK,
      });
    });
    it("Case 8b: LOW + AUTO_APPROVE policy + org_auto_approve_low_risk = false → REQUIRE_DUAL_CONTROL", () => {
      const r = evaluateActionPolicy(
        input("LOW", {
          twin_autonomy_level: "EXECUTIVE_OVERRIDE",
          org_auto_approve_low_risk: false,
          action_policy_row: policy("RECORD_CAPSULE", "LOW", "AUTO_APPROVE"),
        }),
      );
      expect(r).toEqual({
        ok: true,
        decision: "REQUIRE_DUAL_CONTROL",
        reason: REASON_CODES.EXECUTIVE_OVERRIDE_DUAL_CONTROL_LOW_RISK_NO_ORG_GATE,
      });
    });
    it("MEDIUM + AUTO_APPROVE policy → AUTO_APPROVE (no org gate at MEDIUM)", () => {
      const r = evaluateActionPolicy(
        input("MEDIUM", {
          twin_autonomy_level: "EXECUTIVE_OVERRIDE",
          org_auto_approve_low_risk: false,
          action_policy_row: policy("RECORD_CAPSULE", "MEDIUM", "AUTO_APPROVE"),
        }),
      );
      expect(r).toEqual({
        ok: true,
        decision: "AUTO_APPROVE",
        reason: REASON_CODES.EXECUTIVE_OVERRIDE_AUTO_APPROVE_MEDIUM_RISK,
      });
    });
    it("Case 11a (RULE 13 literal §4.5): HIGH + AUTO_APPROVE policy → REQUIRE_DUAL_CONTROL", () => {
      const r = evaluateActionPolicy(
        input("HIGH", {
          twin_autonomy_level: "EXECUTIVE_OVERRIDE",
          org_auto_approve_low_risk: true,
          action_policy_row: policy("RECORD_CAPSULE", "HIGH", "AUTO_APPROVE"),
        }),
      );
      expect(r).toEqual({
        ok: true,
        decision: "REQUIRE_DUAL_CONTROL",
        reason: REASON_CODES.EXECUTIVE_OVERRIDE_DUAL_CONTROL_HIGH_RISK,
      });
    });
    it("LOW + no AUTO_APPROVE policy → REQUIRE_DUAL_CONTROL (EXECUTIVE_OVERRIDE is not blanket bypass)", () => {
      const r = evaluateActionPolicy(
        input("LOW", {
          twin_autonomy_level: "EXECUTIVE_OVERRIDE",
          org_auto_approve_low_risk: true,
        }),
      );
      expect(r).toEqual({
        ok: true,
        decision: "REQUIRE_DUAL_CONTROL",
        reason: REASON_CODES.EXECUTIVE_OVERRIDE_DUAL_CONTROL_NO_POLICY_GRANT,
      });
    });
    it("MEDIUM + REQUIRE_DUAL_CONTROL policy → REQUIRE_DUAL_CONTROL (explicit policy precedence)", () => {
      const r = evaluateActionPolicy(
        input("MEDIUM", {
          twin_autonomy_level: "EXECUTIVE_OVERRIDE",
          action_policy_row: policy("RECORD_CAPSULE", "MEDIUM", "REQUIRE_DUAL_CONTROL"),
        }),
      );
      expect(r.ok === true && r.decision).toBe("REQUIRE_DUAL_CONTROL");
      expect(r.ok === true && r.reason).toBe(REASON_CODES.POLICY_REQUIRE_DUAL_CONTROL);
    });
  });

  describe("Explicit policy decisions (precedence)", () => {
    it("Case 5: explicit FORBIDDEN policy at LOW → FORBIDDEN", () => {
      const r = evaluateActionPolicy(
        input("LOW", {
          action_policy_row: policy("RECORD_CAPSULE", "LOW", "FORBIDDEN"),
        }),
      );
      expect(r).toEqual({
        ok: true,
        decision: "FORBIDDEN",
        reason: REASON_CODES.POLICY_FORBIDDEN,
      });
    });
    it("explicit FORBIDDEN policy overrides org_require_human_approval", () => {
      const r = evaluateActionPolicy(
        input("LOW", {
          org_require_human_approval: true,
          action_policy_row: policy("RECORD_CAPSULE", "LOW", "FORBIDDEN"),
        }),
      );
      expect(r.ok === true && r.decision).toBe("FORBIDDEN");
    });
    it("Case 6: explicit REQUIRE_DUAL_CONTROL policy → REQUIRE_DUAL_CONTROL", () => {
      const r = evaluateActionPolicy(
        input("LOW", {
          action_policy_row: policy("RECORD_CAPSULE", "LOW", "REQUIRE_DUAL_CONTROL"),
        }),
      );
      expect(r).toEqual({
        ok: true,
        decision: "REQUIRE_DUAL_CONTROL",
        reason: REASON_CODES.POLICY_REQUIRE_DUAL_CONTROL,
      });
    });
    it("Case 7: explicit REQUIRE_BREAK_GLASS policy → REQUIRE_BREAK_GLASS", () => {
      const r = evaluateActionPolicy(
        input("LOW", {
          action_policy_row: policy("RECORD_CAPSULE", "LOW", "REQUIRE_BREAK_GLASS"),
        }),
      );
      expect(r).toEqual({
        ok: true,
        decision: "REQUIRE_BREAK_GLASS",
        reason: REASON_CODES.POLICY_REQUIRE_BREAK_GLASS,
      });
    });
    it("OBSERVE_ONLY twin overrides REQUIRE_BREAK_GLASS policy → FORBIDDEN", () => {
      const r = evaluateActionPolicy(
        input("LOW", {
          twin_autonomy_level: "OBSERVE_ONLY",
          action_policy_row: policy("RECORD_CAPSULE", "LOW", "REQUIRE_BREAK_GLASS"),
        }),
      );
      expect(r.ok === true && r.decision).toBe("FORBIDDEN");
    });
  });

  describe("RULE 13 substrate-honest §4.4-vs-§4.5 HIGH-risk asymmetry", () => {
    it("Case 11b (literal §4.4): HIGH + APPROVAL_REQUIRED + AUTO_APPROVE policy → AUTO_APPROVE", () => {
      // ADR-0057 §4.4 strict reading: "all actions are REQUIRE_DUAL_CONTROL
      // unless the ActionPolicy row for the (action_type, risk_tier) pair
      // explicitly grants AUTO_APPROVE." On HIGH, this allows AUTO_APPROVE
      // — even though §4.5 forbids the same outcome under EXECUTIVE_OVERRIDE.
      // The asymmetry is a documented substrate observation (see file
      // header of policy-evaluator.ts); locking the behavior here guards
      // against silent drift if the ADR is later amended.
      const r = evaluateActionPolicy(
        input("HIGH", {
          twin_autonomy_level: "APPROVAL_REQUIRED",
          action_policy_row: policy("RECORD_CAPSULE", "HIGH", "AUTO_APPROVE"),
        }),
      );
      expect(r).toEqual({
        ok: true,
        decision: "AUTO_APPROVE",
        reason: REASON_CODES.APPROVAL_REQUIRED_EXPLICIT_AUTO_APPROVE,
      });
    });
  });

  describe("Policy-row mismatch (different action_type or risk_tier)", () => {
    it("policy_row.action_type mismatch → treated as unresolved → autonomy-level default", () => {
      const r = evaluateActionPolicy(
        input("LOW", {
          action_policy_row: policy("PROPOSE_PERMISSION_GRANT", "LOW", "AUTO_APPROVE"),
        }),
      );
      // Mismatched action_type: fall through to APPROVAL_REQUIRED default.
      expect(r.ok === true && r.decision).toBe("REQUIRE_DUAL_CONTROL");
      expect(r.ok === true && r.reason).toBe(REASON_CODES.APPROVAL_REQUIRED_DEFAULT_DUAL_CONTROL);
    });
    it("policy_row.risk_tier mismatch → treated as unresolved → autonomy-level default", () => {
      const r = evaluateActionPolicy(
        input("LOW", {
          action_policy_row: policy("RECORD_CAPSULE", "MEDIUM", "AUTO_APPROVE"),
        }),
      );
      expect(r.ok === true && r.decision).toBe("REQUIRE_DUAL_CONTROL");
    });
  });

  describe("ENVELOPE_INVALID — structural fail-closed", () => {
    it("Case 12a: malformed envelope (autonomy_level missing) → ENVELOPE_INVALID", () => {
      const bad = {
        callerEntityId: CALLER,
        org_entity_id: ORG,
        action_type: "RECORD_CAPSULE" as ActionType,
        risk_tier: "LOW" as ActionRiskTier,
        policy_envelope: {
          // twin_autonomy_level intentionally omitted
          org_require_human_approval: false,
          org_auto_approve_low_risk: false,
          org_audit_ai_actions: true,
          entity_profile_safe_view: {},
          tar_capability_bits: {
            can_admin_org: false,
            can_admin_niov: false,
            can_write_capsules: false,
            can_share_capsules: false,
          },
          permission_set_summary: { count: 0, bridges: [] },
          action_policy_row: null,
        },
      };
      const r = evaluateActionPolicy(bad as unknown as EvaluateActionPolicyInput);
      expect(r).toEqual({ ok: false, reason: "ENVELOPE_INVALID" });
    });
    it("Case 12b: empty callerEntityId → ENVELOPE_INVALID", () => {
      const r = evaluateActionPolicy(
        { ...input("LOW"), callerEntityId: "" },
      );
      expect(r).toEqual({ ok: false, reason: "ENVELOPE_INVALID" });
    });
    it("Case 12c: malformed risk_tier → ENVELOPE_INVALID", () => {
      const bad = { ...input("LOW"), risk_tier: "SUPER_CRITICAL" as ActionRiskTier };
      const r = evaluateActionPolicy(bad);
      expect(r).toEqual({ ok: false, reason: "ENVELOPE_INVALID" });
    });
    it("Case 12d: envelope = null → ENVELOPE_INVALID", () => {
      const bad = { ...input("LOW"), policy_envelope: null as unknown as PolicyEnvelope };
      const r = evaluateActionPolicy(bad);
      expect(r).toEqual({ ok: false, reason: "ENVELOPE_INVALID" });
    });
    it("Case 12e: input = null → ENVELOPE_INVALID", () => {
      const r = evaluateActionPolicy(null as unknown as EvaluateActionPolicyInput);
      expect(r).toEqual({ ok: false, reason: "ENVELOPE_INVALID" });
    });
  });

  describe("Determinism + purity (no I/O surface)", () => {
    it("identical inputs produce identical outputs across repeated invocations", () => {
      const cfg = input("MEDIUM", {
        twin_autonomy_level: "EXECUTIVE_OVERRIDE",
        action_policy_row: policy("RECORD_CAPSULE", "MEDIUM", "AUTO_APPROVE"),
      });
      const a = evaluateActionPolicy(cfg);
      const b = evaluateActionPolicy(cfg);
      const c = evaluateActionPolicy(cfg);
      expect(a).toEqual(b);
      expect(b).toEqual(c);
    });
    it("the evaluator does not mutate its input", () => {
      const cfg = input("LOW", {
        action_policy_row: policy("RECORD_CAPSULE", "LOW", "AUTO_APPROVE"),
      });
      const snapshot = JSON.parse(JSON.stringify(cfg));
      evaluateActionPolicy(cfg);
      expect(JSON.parse(JSON.stringify(cfg))).toEqual(snapshot);
    });
  });
});
