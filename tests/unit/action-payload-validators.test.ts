// FILE: action-payload-validators.test.ts (unit)
// PURPOSE: Pure-function unit tests for the per-ActionType
//          create-time payload validators introduced in the
//          [ADR-0057-RECORD-CAPSULE-HANDLER] wave. Verifies that
//          the validator dispatcher correctly routes per-action_type,
//          that validateRecordCapsulePayload enforces the
//          CapsuleCreateInput-shaped contract end-to-end (required
//          fields, optional-field shapes, enum values, content
//          size cap), and that the stub-validator path stays
//          permissive for ActionTypes whose real handler has not
//          yet landed.
// CONNECTS TO: apps/api/src/services/action/action-payload-validators.ts
//              via the "@niov/api" barrel.

import { describe, expect, it } from "vitest";
import {
  RECORD_CAPSULE_MAX_CONTENT_BYTES,
  validatePayloadForActionType,
  validateProposePermissionGrantPayload,
  validateRecordCapsulePayload,
  validateStubPayload,
} from "@niov/api";

const VALID_BASE = {
  capsule_type: "DOMAIN_KNOWLEDGE" as const,
  topic_tags: ["alpha", "beta"],
  payload_summary: "summary",
  content: "the capsule body",
};

describe("validateRecordCapsulePayload — required fields", () => {
  it("accepts the canonical valid payload", () => {
    const r = validateRecordCapsulePayload(VALID_BASE);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.normalized.capsule_type).toBe("DOMAIN_KNOWLEDGE");
      expect(r.normalized.topic_tags).toEqual(["alpha", "beta"]);
      expect(r.normalized.payload_summary).toBe("summary");
      expect(r.normalized.content).toBe("the capsule body");
    }
  });
  it("rejects null payload", () => {
    const r = validateRecordCapsulePayload(null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.invalid_fields).toContain("payload_redacted");
  });
  it("rejects array payload", () => {
    const r = validateRecordCapsulePayload([]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.invalid_fields).toContain("payload_redacted");
  });
  it("rejects string payload", () => {
    const r = validateRecordCapsulePayload("not-an-object");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.invalid_fields).toContain("payload_redacted");
  });
  it("rejects missing capsule_type", () => {
    const { capsule_type: _ignored, ...rest } = VALID_BASE;
    void _ignored;
    const r = validateRecordCapsulePayload(rest);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.invalid_fields).toContain("payload_redacted.capsule_type");
    }
  });
  it("rejects unknown capsule_type enum value", () => {
    const r = validateRecordCapsulePayload({
      ...VALID_BASE,
      capsule_type: "MADE_UP",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.invalid_fields).toContain("payload_redacted.capsule_type");
    }
  });
  it("rejects empty topic_tags", () => {
    const r = validateRecordCapsulePayload({ ...VALID_BASE, topic_tags: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.invalid_fields).toContain("payload_redacted.topic_tags");
    }
  });
  it("rejects non-string topic_tags", () => {
    const r = validateRecordCapsulePayload({
      ...VALID_BASE,
      topic_tags: [1, 2],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.invalid_fields).toContain("payload_redacted.topic_tags");
    }
  });
  it("rejects empty payload_summary", () => {
    const r = validateRecordCapsulePayload({ ...VALID_BASE, payload_summary: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.invalid_fields).toContain("payload_redacted.payload_summary");
    }
  });
  it("rejects empty content", () => {
    const r = validateRecordCapsulePayload({ ...VALID_BASE, content: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.invalid_fields).toContain("payload_redacted.content");
  });
  it("rejects content over MAX_BYTES", () => {
    const oversized = "x".repeat(RECORD_CAPSULE_MAX_CONTENT_BYTES + 1);
    const r = validateRecordCapsulePayload({ ...VALID_BASE, content: oversized });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.invalid_fields).toContain("payload_redacted.content");
  });
});

describe("validateRecordCapsulePayload — optional fields", () => {
  it("accepts decay_type if valid enum", () => {
    const r = validateRecordCapsulePayload({
      ...VALID_BASE,
      decay_type: "FOUNDATIONAL",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.normalized.decay_type).toBe("FOUNDATIONAL");
  });
  it("rejects unknown decay_type", () => {
    const r = validateRecordCapsulePayload({
      ...VALID_BASE,
      decay_type: "GALACTIC",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.invalid_fields).toContain("payload_redacted.decay_type");
    }
  });
  it("accepts decay_rate in [0, 1]", () => {
    const r = validateRecordCapsulePayload({ ...VALID_BASE, decay_rate: 0.5 });
    expect(r.ok).toBe(true);
  });
  it("rejects decay_rate out of range", () => {
    const r = validateRecordCapsulePayload({ ...VALID_BASE, decay_rate: 2 });
    expect(r.ok).toBe(false);
  });
  it("accepts storage_tier enum", () => {
    const r = validateRecordCapsulePayload({
      ...VALID_BASE,
      storage_tier: "HOT",
    });
    expect(r.ok).toBe(true);
  });
  it("rejects unknown storage_tier", () => {
    const r = validateRecordCapsulePayload({
      ...VALID_BASE,
      storage_tier: "FROZEN",
    });
    expect(r.ok).toBe(false);
  });
  it("accepts clearance_required non-negative integer", () => {
    const r = validateRecordCapsulePayload({
      ...VALID_BASE,
      clearance_required: 3,
    });
    expect(r.ok).toBe(true);
  });
  it("rejects negative clearance_required", () => {
    const r = validateRecordCapsulePayload({
      ...VALID_BASE,
      clearance_required: -1,
    });
    expect(r.ok).toBe(false);
  });
  it("rejects non-integer clearance_required", () => {
    const r = validateRecordCapsulePayload({
      ...VALID_BASE,
      clearance_required: 1.5,
    });
    expect(r.ok).toBe(false);
  });
  it("accepts connected_capsule_ids string array", () => {
    const r = validateRecordCapsulePayload({
      ...VALID_BASE,
      connected_capsule_ids: ["a", "b"],
    });
    expect(r.ok).toBe(true);
  });
  it("rejects connected_capsule_ids with non-string", () => {
    const r = validateRecordCapsulePayload({
      ...VALID_BASE,
      connected_capsule_ids: ["a", 1],
    });
    expect(r.ok).toBe(false);
  });
  it("rejects non-boolean monetization_enabled", () => {
    const r = validateRecordCapsulePayload({
      ...VALID_BASE,
      monetization_enabled: "yes",
    });
    expect(r.ok).toBe(false);
  });
  it("accepts null monetization_category", () => {
    const r = validateRecordCapsulePayload({
      ...VALID_BASE,
      monetization_category: null,
    });
    expect(r.ok).toBe(true);
  });
  it("accepts ISO-date expires_at", () => {
    const r = validateRecordCapsulePayload({
      ...VALID_BASE,
      expires_at: "2030-01-01T00:00:00Z",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.normalized.expires_at).toBeInstanceOf(Date);
  });
  it("rejects malformed expires_at string", () => {
    const r = validateRecordCapsulePayload({
      ...VALID_BASE,
      expires_at: "not-a-date",
    });
    expect(r.ok).toBe(false);
  });
  it("rejects write_reason over 500 chars", () => {
    const r = validateRecordCapsulePayload({
      ...VALID_BASE,
      write_reason: "x".repeat(501),
    });
    expect(r.ok).toBe(false);
  });
});

describe("validateStubPayload", () => {
  it("accepts any object payload as a no-op", () => {
    const r = validateStubPayload({ anything: 1 });
    expect(r.ok).toBe(true);
  });
});

describe("validateProposePermissionGrantPayload", () => {
  const VALID_PPG = {
    capsule_id: "11111111-1111-1111-1111-111111111111",
    grantee_entity_id: "22222222-2222-2222-2222-222222222222",
    access_scope: "FULL",
  };
  it("accepts canonical valid payload", () => {
    const r = validateProposePermissionGrantPayload(VALID_PPG);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.normalized.capsule_id).toBe(VALID_PPG.capsule_id);
      expect(r.normalized.grantee_entity_id).toBe(VALID_PPG.grantee_entity_id);
      expect(r.normalized.access_scope).toBe("FULL");
    }
  });
  it("rejects null payload", () => {
    const r = validateProposePermissionGrantPayload(null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.invalid_fields).toContain("payload_redacted");
  });
  it("rejects missing capsule_id", () => {
    const { capsule_id: _u, ...rest } = VALID_PPG;
    void _u;
    const r = validateProposePermissionGrantPayload(rest);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.invalid_fields).toContain("payload_redacted.capsule_id");
    }
  });
  it("rejects non-UUID capsule_id", () => {
    const r = validateProposePermissionGrantPayload({
      ...VALID_PPG,
      capsule_id: "not-a-uuid",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.invalid_fields).toContain("payload_redacted.capsule_id");
    }
  });
  it("rejects missing grantee_entity_id", () => {
    const { grantee_entity_id: _u, ...rest } = VALID_PPG;
    void _u;
    const r = validateProposePermissionGrantPayload(rest);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.invalid_fields).toContain("payload_redacted.grantee_entity_id");
    }
  });
  it("rejects unknown access_scope value", () => {
    const r = validateProposePermissionGrantPayload({
      ...VALID_PPG,
      access_scope: "MADE_UP",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.invalid_fields).toContain("payload_redacted.access_scope");
    }
  });
  it("accepts valid optional duration_type", () => {
    const r = validateProposePermissionGrantPayload({
      ...VALID_PPG,
      duration_type: "PERMANENT",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.normalized.duration_type).toBe("PERMANENT");
  });
  it("rejects unknown duration_type", () => {
    const r = validateProposePermissionGrantPayload({
      ...VALID_PPG,
      duration_type: "FOREVER",
    });
    expect(r.ok).toBe(false);
  });
  it("rejects non-boolean can_share_forward", () => {
    const r = validateProposePermissionGrantPayload({
      ...VALID_PPG,
      can_share_forward: "yes",
    });
    expect(r.ok).toBe(false);
  });
  it("accepts conditions object", () => {
    const r = validateProposePermissionGrantPayload({
      ...VALID_PPG,
      conditions: { context: "test" },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.normalized.conditions).toEqual({ context: "test" });
  });
  it("rejects conditions array", () => {
    const r = validateProposePermissionGrantPayload({
      ...VALID_PPG,
      conditions: ["bad"],
    });
    expect(r.ok).toBe(false);
  });
});

describe("validatePayloadForActionType — PROPOSE_PERMISSION_GRANT dispatch", () => {
  it("dispatches to the real validator (rejects invalid)", () => {
    const r = validatePayloadForActionType("PROPOSE_PERMISSION_GRANT", {});
    expect(r.ok).toBe(false);
  });
  it("dispatches to the real validator (accepts valid)", () => {
    const r = validatePayloadForActionType("PROPOSE_PERMISSION_GRANT", {
      capsule_id: "11111111-1111-1111-1111-111111111111",
      grantee_entity_id: "22222222-2222-2222-2222-222222222222",
      access_scope: "FULL",
    });
    expect(r.ok).toBe(true);
  });
});

describe("validatePayloadForActionType dispatcher", () => {
  it("RECORD_CAPSULE -> rejects invalid payload", () => {
    const r = validatePayloadForActionType("RECORD_CAPSULE", {
      capsule_type: "MADE_UP",
      topic_tags: ["x"],
      payload_summary: "y",
      content: "z",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.invalid_fields).toContain("payload_redacted.capsule_type");
    }
  });
  it("RECORD_CAPSULE -> accepts valid payload", () => {
    const r = validatePayloadForActionType("RECORD_CAPSULE", VALID_BASE);
    expect(r.ok).toBe(true);
  });
  it("SEND_INTERNAL_NOTIFICATION -> stub accepts any object", () => {
    const r = validatePayloadForActionType("SEND_INTERNAL_NOTIFICATION", {
      to: "anyone",
    });
    expect(r.ok).toBe(true);
  });
  it("PROPOSE_PERMISSION_GRANT -> real validator rejects shape-only payload", () => {
    // Wave 4 promoted PROPOSE_PERMISSION_GRANT from stub validator to
    // the real validator at action-payload-validators.ts; arbitrary
    // shapes that worked under the stub now correctly fail.
    const r = validatePayloadForActionType("PROPOSE_PERMISSION_GRANT", {
      grantee: "x",
    });
    expect(r.ok).toBe(false);
  });
  it("unknown action_type -> rejected", () => {
    const r = validatePayloadForActionType("MADE_UP" as never, {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.invalid_fields).toContain("action_type");
  });
});
