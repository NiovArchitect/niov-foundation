// FILE: notification-reply.test.ts (unit)
// PURPOSE: Phase 1215 [OTZAR-NOTIFICATION-REPLY] -- pure-helper
//          coverage for the input-validation surface of
//          replyToNotificationForCaller. The full end-to-end
//          (recipient looks up by id -> Action create -> executor
//          fires) is exercised live; this file pins the input
//          validation behavior so a regression doesn't leak through
//          unit CI.
// CONNECTS TO: apps/api/src/services/notification/notification-reply.service.ts.

import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the Prisma + createActionForCaller imports so the unit tests
// stay pure.
const mockedPrisma = vi.hoisted(() => ({
  prisma: { notification: { findFirst: vi.fn() } },
}));
const mockedAction = vi.hoisted(() => ({
  createActionForCaller: vi.fn(),
}));
vi.mock("@niov/database", () => mockedPrisma);
vi.mock(
  "../../apps/api/src/services/action/action.service.js",
  () => mockedAction,
);

import { replyToNotificationForCaller } from "../../apps/api/src/services/notification/notification-reply.service.js";

const VALID_UUID = "11111111-2222-3333-4444-555555555555";
const SOURCE_UUID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("replyToNotificationForCaller — input validation", () => {
  it("rejects a non-UUID notification_id with 400 INVALID_NOTIFICATION_ID", async () => {
    const r = await replyToNotificationForCaller("caller", {
      notificationId: "not-a-uuid",
      body_summary: "hi",
      idempotency_key: "key",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.httpStatus).toBe(400);
      expect(r.code).toBe("INVALID_NOTIFICATION_ID");
    }
    expect(mockedPrisma.prisma.notification.findFirst).not.toHaveBeenCalled();
  });

  it("rejects an empty body_summary with 422 INVALID_REQUEST", async () => {
    const r = await replyToNotificationForCaller("caller", {
      notificationId: VALID_UUID,
      body_summary: "   ",
      idempotency_key: "key",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.httpStatus).toBe(422);
      expect(r.code).toBe("INVALID_REQUEST");
    }
  });

  it("rejects a missing idempotency_key with 422 INVALID_REQUEST", async () => {
    const r = await replyToNotificationForCaller("caller", {
      notificationId: VALID_UUID,
      body_summary: "hi",
      idempotency_key: "",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.httpStatus).toBe(422);
      expect(r.code).toBe("INVALID_REQUEST");
    }
  });
});

describe("replyToNotificationForCaller — enumeration-safe 404", () => {
  it("returns 404 NOTIFICATION_NOT_FOUND for a cross-recipient lookup", async () => {
    mockedPrisma.prisma.notification.findFirst.mockResolvedValue(null);
    const r = await replyToNotificationForCaller("caller", {
      notificationId: VALID_UUID,
      body_summary: "hi",
      idempotency_key: "key",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.httpStatus).toBe(404);
      expect(r.code).toBe("NOTIFICATION_NOT_FOUND");
    }
    // No Action create attempted.
    expect(mockedAction.createActionForCaller).not.toHaveBeenCalled();
  });

  it("uses recipient_entity_id=caller as the scoping predicate", async () => {
    mockedPrisma.prisma.notification.findFirst.mockResolvedValue(null);
    await replyToNotificationForCaller("the-caller-id", {
      notificationId: VALID_UUID,
      body_summary: "hi",
      idempotency_key: "key",
    });
    const call = mockedPrisma.prisma.notification.findFirst.mock.calls[0]?.[0];
    expect(call.where.recipient_entity_id).toBe("the-caller-id");
    expect(call.where.notification_id).toBe(VALID_UUID);
    expect(call.where.deleted_at).toBeNull();
  });
});

describe("replyToNotificationForCaller — REPLY_NOT_SUPPORTED for system-source", () => {
  it("refuses when the source_entity_id is missing or not a UUID", async () => {
    mockedPrisma.prisma.notification.findFirst.mockResolvedValue({
      source_entity_id: "system",
    });
    const r = await replyToNotificationForCaller("caller", {
      notificationId: VALID_UUID,
      body_summary: "hi",
      idempotency_key: "key",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.httpStatus).toBe(422);
      expect(r.code).toBe("REPLY_NOT_SUPPORTED");
    }
    expect(mockedAction.createActionForCaller).not.toHaveBeenCalled();
  });
});

describe("replyToNotificationForCaller — happy path", () => {
  it("delegates to createActionForCaller with recipient_entity_id = source_entity_id", async () => {
    mockedPrisma.prisma.notification.findFirst.mockResolvedValue({
      source_entity_id: SOURCE_UUID,
    });
    mockedAction.createActionForCaller.mockResolvedValue({
      ok: true,
      httpStatus: 200,
      view: { action_id: "a-1", status: "APPROVED" },
    });
    const r = await replyToNotificationForCaller("caller", {
      notificationId: VALID_UUID,
      body_summary: "On it — pushing the UI fix shortly.",
      idempotency_key: "idem-1",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.reply_action_id).toBe("a-1");
      expect(r.reply_action_status).toBe("APPROVED");
    }
    const callArgs = mockedAction.createActionForCaller.mock.calls[0]!;
    expect(callArgs[0]).toBe("caller");
    expect(callArgs[1].action_type).toBe("SEND_INTERNAL_NOTIFICATION");
    expect(callArgs[1].idempotency_key).toBe("idem-1");
    expect(callArgs[1].payload_redacted.recipient_entity_id).toBe(SOURCE_UUID);
    expect(callArgs[1].payload_redacted.notification_class).toBe(
      "OTZAR_INTERNAL_NOTE",
    );
    expect(callArgs[1].payload_redacted.body_summary).toBe(
      "On it — pushing the UI fix shortly.",
    );
  });

  it("trims body_summary whitespace before forwarding", async () => {
    mockedPrisma.prisma.notification.findFirst.mockResolvedValue({
      source_entity_id: SOURCE_UUID,
    });
    mockedAction.createActionForCaller.mockResolvedValue({
      ok: true,
      httpStatus: 200,
      view: { action_id: "a-1", status: "APPROVED" },
    });
    await replyToNotificationForCaller("caller", {
      notificationId: VALID_UUID,
      body_summary: "   hello world   ",
      idempotency_key: "idem-1",
    });
    const args = mockedAction.createActionForCaller.mock.calls[0]!;
    expect(args[1].payload_redacted.body_summary).toBe("hello world");
  });

  it("forwards the failure (httpStatus + code) from createActionForCaller", async () => {
    mockedPrisma.prisma.notification.findFirst.mockResolvedValue({
      source_entity_id: SOURCE_UUID,
    });
    mockedAction.createActionForCaller.mockResolvedValue({
      ok: false,
      httpStatus: 503,
      code: "DUAL_CONTROL_NO_APPROVER_AVAILABLE",
    });
    const r = await replyToNotificationForCaller("caller", {
      notificationId: VALID_UUID,
      body_summary: "hi",
      idempotency_key: "k",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.httpStatus).toBe(503);
      expect(r.code).toBe("DUAL_CONTROL_NO_APPROVER_AVAILABLE");
    }
  });
});

describe("replyToNotificationForCaller — privacy invariants", () => {
  it("never returns source_entity_id in the success payload", async () => {
    mockedPrisma.prisma.notification.findFirst.mockResolvedValue({
      source_entity_id: SOURCE_UUID,
    });
    mockedAction.createActionForCaller.mockResolvedValue({
      ok: true,
      httpStatus: 200,
      view: { action_id: "a-1", status: "APPROVED" },
    });
    const r = await replyToNotificationForCaller("caller", {
      notificationId: VALID_UUID,
      body_summary: "hi",
      idempotency_key: "k",
    });
    expect(JSON.stringify(r)).not.toContain(SOURCE_UUID);
  });

  it("never returns body_redacted / TAR / wallet / clearance content", async () => {
    mockedPrisma.prisma.notification.findFirst.mockResolvedValue({
      source_entity_id: SOURCE_UUID,
    });
    mockedAction.createActionForCaller.mockResolvedValue({
      ok: true,
      httpStatus: 200,
      view: { action_id: "a-1", status: "APPROVED" },
    });
    const r = await replyToNotificationForCaller("caller", {
      notificationId: VALID_UUID,
      body_summary: "hi",
      idempotency_key: "k",
    });
    const json = JSON.stringify(r);
    expect(json).not.toMatch(/body_redacted/i);
    expect(json).not.toMatch(/tar_hash/i);
    expect(json).not.toMatch(/wallet_id/i);
    expect(json).not.toMatch(/clearance/i);
    expect(json).not.toMatch(/embedding/i);
  });
});
