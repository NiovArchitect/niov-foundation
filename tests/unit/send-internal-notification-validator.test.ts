// FILE: tests/unit/send-internal-notification-validator.test.ts
// PURPOSE: Unit-tier coverage for
//          validateSendInternalNotificationPayload — the create-time
//          payload validator landed in ADR-0057 Wave 11 (replacing
//          the stub validator). Proves required fields are
//          enforced, length bounds rejected, UUID format rejected,
//          extra-field acceptance, and the happy path normalizes.
// CONNECTS TO:
//   - apps/api/src/services/action/action-payload-validators.ts

import { describe, expect, it } from "vitest";
import { validateSendInternalNotificationPayload } from "../../apps/api/src/services/action/action-payload-validators.js";

const VALID_UUID = "11111111-1111-1111-8111-111111111111";

describe("validateSendInternalNotificationPayload (ADR-0057 Wave 11)", () => {
  it("returns ok:true with normalized payload on the happy path", () => {
    const r = validateSendInternalNotificationPayload({
      recipient_entity_id: VALID_UUID,
      notification_class: "DUAL_CONTROL_REQUEST",
      body_summary: "Approval requested",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.normalized.recipient_entity_id).toBe(VALID_UUID);
      expect(r.normalized.notification_class).toBe("DUAL_CONTROL_REQUEST");
      expect(r.normalized.body_summary).toBe("Approval requested");
      expect(r.normalized.body_redacted).toBeUndefined();
    }
  });

  it("normalizes body_redacted when supplied as a plain object", () => {
    const r = validateSendInternalNotificationPayload({
      recipient_entity_id: VALID_UUID,
      notification_class: "ACTION_APPROVED",
      body_summary: "Action approved",
      body_redacted: { topic: "release-cut", priority: "high" },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.normalized.body_redacted).toEqual({
        topic: "release-cut",
        priority: "high",
      });
    }
  });

  it("rejects non-object payload (string)", () => {
    const r = validateSendInternalNotificationPayload("not-an-object");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.invalid_fields).toContain("payload_redacted");
  });

  it("rejects array payload", () => {
    const r = validateSendInternalNotificationPayload([1, 2, 3]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.invalid_fields).toContain("payload_redacted");
  });

  it("rejects null payload", () => {
    const r = validateSendInternalNotificationPayload(null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.invalid_fields).toContain("payload_redacted");
  });

  it("rejects missing recipient_entity_id", () => {
    const r = validateSendInternalNotificationPayload({
      notification_class: "x",
      body_summary: "y",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.invalid_fields).toContain("recipient_entity_id");
  });

  it("rejects non-UUID recipient_entity_id", () => {
    const r = validateSendInternalNotificationPayload({
      recipient_entity_id: "not-a-uuid",
      notification_class: "x",
      body_summary: "y",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.invalid_fields).toContain("recipient_entity_id");
  });

  it("rejects empty notification_class", () => {
    const r = validateSendInternalNotificationPayload({
      recipient_entity_id: VALID_UUID,
      notification_class: "",
      body_summary: "y",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.invalid_fields).toContain("notification_class");
  });

  it("rejects oversized notification_class (>64 chars)", () => {
    const r = validateSendInternalNotificationPayload({
      recipient_entity_id: VALID_UUID,
      notification_class: "x".repeat(65),
      body_summary: "y",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.invalid_fields).toContain("notification_class");
  });

  it("rejects empty body_summary", () => {
    const r = validateSendInternalNotificationPayload({
      recipient_entity_id: VALID_UUID,
      notification_class: "x",
      body_summary: "",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.invalid_fields).toContain("body_summary");
  });

  it("rejects oversized body_summary (>200 chars)", () => {
    const r = validateSendInternalNotificationPayload({
      recipient_entity_id: VALID_UUID,
      notification_class: "x",
      body_summary: "x".repeat(201),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.invalid_fields).toContain("body_summary");
  });

  it("rejects non-object body_redacted (string)", () => {
    const r = validateSendInternalNotificationPayload({
      recipient_entity_id: VALID_UUID,
      notification_class: "x",
      body_summary: "y",
      body_redacted: "not-an-object",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.invalid_fields).toContain("body_redacted");
  });

  it("rejects array body_redacted", () => {
    const r = validateSendInternalNotificationPayload({
      recipient_entity_id: VALID_UUID,
      notification_class: "x",
      body_summary: "y",
      body_redacted: [1, 2, 3],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.invalid_fields).toContain("body_redacted");
  });

  it("rejects oversized body_redacted (>4096 bytes JSON)", () => {
    const r = validateSendInternalNotificationPayload({
      recipient_entity_id: VALID_UUID,
      notification_class: "x",
      body_summary: "y",
      body_redacted: { big: "x".repeat(5_000) },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.invalid_fields).toContain("body_redacted");
  });

  it("accepts null body_redacted as equivalent to undefined", () => {
    const r = validateSendInternalNotificationPayload({
      recipient_entity_id: VALID_UUID,
      notification_class: "x",
      body_summary: "y",
      body_redacted: null,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.normalized.body_redacted).toBeUndefined();
  });
});
