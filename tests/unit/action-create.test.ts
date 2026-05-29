// FILE: action-create.test.ts (unit)
// PURPOSE: Pure-function unit tests for the ADR-0057 §3 + §9 Action
//          create-time helpers at apps/api/src/services/action/
//          action.service.ts. Tests the parts that DON'T require a
//          database: body validation, risk-tier derivation,
//          canonical-JSON envelope hash, and the safe projection.
//          Mirrors the tests/unit/moment-context.test.ts /
//          tests/unit/action-policy-evaluator.test.ts pure-function
//          precedent.
// CONNECTS TO: apps/api/src/services/action/action.service.ts +
//              apps/api/src/services/action/views.ts (via "@niov/api"
//              barrel — added in the same slice).

import { describe, expect, it } from "vitest";
import {
  computePolicyEnvelopeHash,
  deriveRiskTier,
  projectActionView,
  validateCreateActionBody,
  type PolicyEnvelope,
  type SafeActionView,
} from "@niov/api";
import type { Action } from "@prisma/client";

const FIXED_NOW = new Date("2026-05-29T12:00:00.000Z");

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

function actionFixture(overrides: Partial<Action> = {}): Action {
  return {
    action_id: "11111111-1111-1111-1111-111111111111",
    source_entity_id: "22222222-2222-2222-2222-222222222222",
    org_entity_id: "33333333-3333-3333-3333-333333333333",
    target_entity_id: null,
    action_type: "RECORD_CAPSULE",
    risk_tier: "LOW",
    policy_envelope: {},
    payload_summary: "SECRET_SHOULD_NOT_LEAK",
    payload_redacted: { secret: "REDACTED_SHOULD_NOT_LEAK" },
    idempotency_key: "ik-1",
    escalation_id: null,
    status: "APPROVED",
    expires_at: null,
    created_at: FIXED_NOW,
    updated_at: FIXED_NOW,
    deleted_at: null,
    ...overrides,
  } as Action;
}

describe("ADR-0057 §9 — Action create-time pure helpers", () => {
  describe("deriveRiskTier (Q1 LOCK: constant-per-action-type)", () => {
    it("RECORD_CAPSULE → LOW", () => {
      expect(deriveRiskTier("RECORD_CAPSULE")).toBe("LOW");
    });
    it("SEND_INTERNAL_NOTIFICATION → LOW", () => {
      expect(deriveRiskTier("SEND_INTERNAL_NOTIFICATION")).toBe("LOW");
    });
    it("PROPOSE_PERMISSION_GRANT → MEDIUM", () => {
      expect(deriveRiskTier("PROPOSE_PERMISSION_GRANT")).toBe("MEDIUM");
    });
    it("unknown action_type → LOW (defensive default; unreachable via valid route)", () => {
      expect(deriveRiskTier("MADE_UP_TYPE")).toBe("LOW");
    });
  });

  describe("computePolicyEnvelopeHash (Q5 LOCK: alphabetical canonical JSON + SHA-256)", () => {
    it("returns a 64-char lowercase hex SHA-256 digest", () => {
      const h = computePolicyEnvelopeHash(envelope());
      expect(h).toMatch(/^[0-9a-f]{64}$/);
    });
    it("is byte-stable across repeated invocations with identical envelopes", () => {
      const a = computePolicyEnvelopeHash(envelope());
      const b = computePolicyEnvelopeHash(envelope());
      expect(a).toBe(b);
    });
    it("is byte-stable across object-key reorderings (canonical JSON)", () => {
      const a = computePolicyEnvelopeHash(envelope());
      // Same envelope, different field-order in the input literal.
      const b = computePolicyEnvelopeHash({
        org_audit_ai_actions: true,
        org_auto_approve_low_risk: false,
        org_require_human_approval: false,
        twin_autonomy_level: "APPROVAL_REQUIRED",
        action_policy_row: null,
        tar_capability_bits: {
          can_share_capsules: false,
          can_write_capsules: false,
          can_admin_niov: false,
          can_admin_org: false,
        },
        entity_profile_safe_view: {},
        permission_set_summary: { bridges: [], count: 0 },
      });
      expect(a).toBe(b);
    });
    it("differs for semantically-distinct envelopes", () => {
      const a = computePolicyEnvelopeHash(envelope());
      const b = computePolicyEnvelopeHash(
        envelope({ twin_autonomy_level: "EXECUTIVE_OVERRIDE" }),
      );
      expect(a).not.toBe(b);
    });
  });

  describe("projectActionView (ADR-0057 §10 forbidden-field stripping)", () => {
    it("returns only SAFE fields; NEVER payload_summary / payload_redacted / policy_envelope", () => {
      const action = actionFixture();
      const view = projectActionView(action);
      const raw = JSON.stringify(view);
      // SAFE fields present.
      expect(view.action_id).toBe(action.action_id);
      expect(view.status).toBe("APPROVED");
      expect(view.action_type).toBe("RECORD_CAPSULE");
      expect(view.risk_tier).toBe("LOW");
      expect(view.requires_approval).toBe(false);
      // FORBIDDEN fields absent.
      expect(raw).not.toContain("SECRET_SHOULD_NOT_LEAK");
      expect(raw).not.toContain("REDACTED_SHOULD_NOT_LEAK");
      for (const forbidden of [
        "payload_summary",
        "payload_redacted",
        "policy_envelope",
        "policy_envelope_hash",
        "source_entity_id",
        "org_entity_id",
        "target_entity_id",
        "deleted_at",
        "expires_at",
        "idempotency_key",
      ]) {
        expect(raw).not.toContain(`"${forbidden}"`);
      }
    });
    it("requires_approval is true when status is PROPOSED", () => {
      const action = actionFixture({ status: "PROPOSED" });
      const view = projectActionView(action);
      expect(view.requires_approval).toBe(true);
    });
    it("requires_approval is false for terminal/approved states", () => {
      for (const status of [
        "APPROVED",
        "REJECTED",
        "SCHEDULED",
        "SUCCEEDED",
        "FAILED",
        "CANCELLED",
      ] as const) {
        const action = actionFixture({ status });
        const view = projectActionView(action);
        expect(view.requires_approval).toBe(false);
      }
    });
    it("includes escalation_id when paired", () => {
      const action = actionFixture({
        status: "PROPOSED",
        escalation_id: "44444444-4444-4444-4444-444444444444",
      });
      const view = projectActionView(action);
      expect(view.escalation_id).toBe("44444444-4444-4444-4444-444444444444");
    });
    it("includes decision_reason when supplied", () => {
      const view = projectActionView(actionFixture(), "policy-forbidden");
      expect(view.decision_reason).toBe("policy-forbidden");
    });
    it("omits escalation_id when null", () => {
      const view: SafeActionView = projectActionView(actionFixture());
      expect(view.escalation_id).toBeUndefined();
    });
  });

  describe("validateCreateActionBody (route-tier body validation)", () => {
    // [ADR-0057-RECORD-CAPSULE-HANDLER] wave introduced per-type
    // payload validation: RECORD_CAPSULE now requires capsule_type +
    // topic_tags + payload_summary + content inside payload_redacted.
    // Tests that need to exercise route-tier-only behavior use this
    // properly-shaped payload.
    const validBody = {
      action_type: "RECORD_CAPSULE",
      idempotency_key: "ik-good",
      payload_summary: "summary text",
      payload_redacted: {
        capsule_type: "DOMAIN_KNOWLEDGE",
        topic_tags: ["t"],
        payload_summary: "inner-summary",
        content: "the capsule body",
      },
    };
    it("accepts a fully-valid body", () => {
      const r = validateCreateActionBody({ ...validBody });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.normalized.action_type).toBe("RECORD_CAPSULE");
        expect(r.normalized.idempotency_key).toBe("ik-good");
        expect(r.normalized.target_entity_id).toBeNull();
      }
    });
    it("422 UNKNOWN_FIELD when body has an extra field", () => {
      const r = validateCreateActionBody({ ...validBody, extra: "bad" });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.code).toBe("UNKNOWN_FIELD");
        expect(r.unknown_fields).toContain("extra");
      }
    });
    it("422 INVALID_FIELD when action_type is unknown", () => {
      const r = validateCreateActionBody({
        ...validBody,
        action_type: "MADE_UP_TYPE",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.code).toBe("INVALID_FIELD");
        expect(r.invalid_fields).toContain("action_type");
      }
    });
    it("422 INVALID_FIELD when idempotency_key is empty", () => {
      const r = validateCreateActionBody({ ...validBody, idempotency_key: "" });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.invalid_fields).toContain("idempotency_key");
      }
    });
    it("422 INVALID_FIELD when idempotency_key exceeds 200 chars", () => {
      const r = validateCreateActionBody({
        ...validBody,
        idempotency_key: "x".repeat(201),
      });
      expect(r.ok).toBe(false);
    });
    it("422 INVALID_FIELD when payload_summary is missing", () => {
      const body = {
        action_type: "RECORD_CAPSULE",
        idempotency_key: "ik",
        payload_redacted: {},
      };
      const r = validateCreateActionBody(body);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.invalid_fields).toContain("payload_summary");
      }
    });
    it("422 INVALID_FIELD when payload_redacted is not an object", () => {
      const r = validateCreateActionBody({
        ...validBody,
        payload_redacted: "not an object",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.invalid_fields).toContain("payload_redacted");
      }
    });
    it("422 INVALID_FIELD when target_entity_id is a non-UUID string", () => {
      const r = validateCreateActionBody({
        ...validBody,
        target_entity_id: "not-a-uuid",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.invalid_fields).toContain("target_entity_id");
      }
    });
    it("accepts a valid UUID target_entity_id", () => {
      const r = validateCreateActionBody({
        ...validBody,
        target_entity_id: "55555555-5555-5555-5555-555555555555",
      });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.normalized.target_entity_id).toBe(
          "55555555-5555-5555-5555-555555555555",
        );
      }
    });
  });
});
