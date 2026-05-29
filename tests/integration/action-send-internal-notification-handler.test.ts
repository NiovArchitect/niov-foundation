// FILE: action-send-internal-notification-handler.test.ts (integration)
// PURPOSE: End-to-end coverage for ADR-0057 Wave 11 — the
//          SEND_INTERNAL_NOTIFICATION real handler. Verifies the
//          Action runtime drives validateSendInternalNotificationPayload
//          at create-time + the handler persists a real Notification
//          row through NotificationService + emits ACTION_SUCCEEDED
//          with SAFE result_metadata (notification_id +
//          recipient_entity_id + notification_class + status only) +
//          no body content leaks into audit or ActionResult +
//          cross-org / unknown-recipient / inactive-recipient paths
//          terminate as FAILURE with stable error_class strings.
// CONNECTS TO:
//   - apps/api/src/services/action/handlers.ts (Wave 11 real
//     handler factory)
//   - apps/api/src/services/notification/notification.service.ts
//   - apps/api/src/services/action/action-payload-validators.ts
//   - apps/api/src/services/action/executor.ts (passes
//     org_entity_id through HandlerActionInput per Wave 11)
//   - packages/database/prisma/schema.prisma (NEW Notification
//     model)

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildApp,
  MemoryContentStore,
  MemoryNonceStore,
  MemoryRateLimitStore,
  tickActionExecutor,
  tickActionScheduler,
} from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import { computeTARHash, createEntity, prisma } from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeEntityInput,
  TEST_PREFIX,
  withCleanRateLimits,
} from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "send-internal-notification-test-secret";
const TEST_KEY = randomBytes(32);

let app: FastifyInstance;
const store = new MemoryRateLimitStore();

async function cleanupTestActionsAndNotifications(): Promise<void> {
  const testEntities = await prisma.entity.findMany({
    where: { display_name: { startsWith: TEST_PREFIX } },
    select: { entity_id: true },
  });
  const ids = testEntities.map((e) => e.entity_id);
  if (ids.length === 0) return;
  await prisma.notification.deleteMany({
    where: {
      OR: [
        { recipient_entity_id: { in: ids } },
        { source_entity_id: { in: ids } },
        { org_entity_id: { in: ids } },
      ],
    },
  });
  const testActions = await prisma.action.findMany({
    where: {
      OR: [
        { source_entity_id: { in: ids } },
        { org_entity_id: { in: ids } },
      ],
    },
    select: { action_id: true },
  });
  const actionIds = testActions.map((a) => a.action_id);
  if (actionIds.length > 0) {
    const attempts = await prisma.actionAttempt.findMany({
      where: { action_id: { in: actionIds } },
      select: { attempt_id: true },
    });
    const attemptIds = attempts.map((a) => a.attempt_id);
    if (attemptIds.length > 0) {
      await prisma.actionResult.deleteMany({
        where: { attempt_id: { in: attemptIds } },
      });
      await prisma.actionAttempt.deleteMany({
        where: { attempt_id: { in: attemptIds } },
      });
    }
    await prisma.action.deleteMany({
      where: { action_id: { in: actionIds } },
    });
  }
  await prisma.actionPolicy.deleteMany({
    where: {
      OR: [{ org_entity_id: { in: ids } }, { updated_by: { in: ids } }],
    },
  });
}

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestActionsAndNotifications();
  await cleanupTestData();
  app = await buildApp({
    jwtSecret: TEST_JWT_SECRET,
    sessionNonceStore: new MemoryNonceStore(),
    declarationStore: new MemoryNonceStore(),
    contentStore: new MemoryContentStore(),
    contentEncryption: new ContentEncryption(TEST_KEY),
    rateLimitStore: store,
  });
  // NOTE: buildApp installs the handler registry with both
  // writeService + notificationService already (see server.ts Wave
  // 11). DO NOT re-call setDefaultActionHandlerRegistry here — the
  // registry is module-level and a re-installation would silently
  // drop other deps and break cross-file vitest runs.
});

afterAll(async () => {
  await app.close();
  await cleanupTestActionsAndNotifications();
  await cleanupTestData();
  await prisma.$disconnect();
});

withCleanRateLimits(store);

async function makeTestOrg(): Promise<string> {
  const org = await createEntity({
    entity_type: "COMPANY",
    display_name: `${TEST_PREFIX}org_${randomUUID()}`,
    email: `${TEST_PREFIX}org_${randomUUID()}@niov.test`,
    public_key: "test-public-key",
    clearance_level: 0,
  });
  await prisma.orgSettings.upsert({
    where: { org_entity_id: org.entity_id },
    create: {
      org_entity_id: org.entity_id,
      require_human_approval: false,
      auto_approve_low_risk: true,
      audit_ai_actions: true,
    },
    update: {
      require_human_approval: false,
      auto_approve_low_risk: true,
    },
  });
  return org.entity_id;
}

async function makeOrgMember(opts: {
  orgId: string;
  autonomy_level?: "APPROVAL_REQUIRED" | "EXECUTIVE_OVERRIDE" | "OBSERVE_ONLY";
  withLogin?: boolean;
  status?: "ACTIVE" | "REVOKED" | "SUSPENDED";
}): Promise<{
  entityId: string;
  token: string | null;
  ip: string;
}> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const entity = await createEntity(input);
  await prisma.entityMembership.create({
    data: {
      parent_id: opts.orgId,
      child_id: entity.entity_id,
      role_title: "MEMBER",
      is_active: true,
    },
  });
  const fresh = await prisma.tokenAttributeRepository.findUnique({
    where: { entity_id: entity.entity_id },
  });
  if (fresh === null) throw new Error("TAR vanished");
  const newHash = computeTARHash({
    can_login: fresh.can_login,
    can_read_capsules: fresh.can_read_capsules,
    can_write_capsules: fresh.can_write_capsules,
    can_share_capsules: fresh.can_share_capsules,
    can_create_hives: fresh.can_create_hives,
    can_access_external_api: fresh.can_access_external_api,
    can_admin_niov: fresh.can_admin_niov,
    can_admin_org: fresh.can_admin_org,
    clearance_ceiling: fresh.clearance_ceiling,
    monetization_role: fresh.monetization_role,
    compliance_frameworks: fresh.compliance_frameworks,
    status: fresh.status,
  });
  await prisma.tokenAttributeRepository.update({
    where: { entity_id: entity.entity_id },
    data: { tar_hash: newHash },
  });
  if (opts.status !== undefined && opts.status !== "ACTIVE") {
    await prisma.tokenAttributeRepository.update({
      where: { entity_id: entity.entity_id },
      data: { status: opts.status },
    });
  }
  if (opts.autonomy_level !== undefined) {
    await prisma.twinConfig.upsert({
      where: { twin_id: entity.entity_id },
      create: {
        twin_id: entity.entity_id,
        autonomy_level: opts.autonomy_level,
      },
      update: { autonomy_level: opts.autonomy_level },
    });
  }
  const ip = `10.86.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 254) + 1}`;
  if (opts.withLogin === false) {
    return { entityId: entity.entity_id, token: null, ip };
  }
  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: {
      email: input.email,
      password,
      requested_operations: ["read", "write"],
    },
    remoteAddress: ip,
  });
  if (login.statusCode !== 200) {
    throw new Error(`login failed: ${login.statusCode} ${login.body}`);
  }
  const body = login.json() as { token: string };
  return { entityId: entity.entity_id, token: body.token, ip };
}

async function seedAutoApprovePolicy(
  orgEntityId: string,
  updated_by: string,
): Promise<void> {
  await prisma.actionPolicy.upsert({
    where: {
      org_entity_id_action_type_risk_tier: {
        org_entity_id: orgEntityId,
        action_type: "SEND_INTERNAL_NOTIFICATION",
        risk_tier: "LOW",
      },
    },
    create: {
      org_entity_id: orgEntityId,
      action_type: "SEND_INTERNAL_NOTIFICATION",
      risk_tier: "LOW",
      default_decision: "AUTO_APPROVE",
      require_admin_capability: null,
      updated_by,
    },
    update: { default_decision: "AUTO_APPROVE", updated_by },
  });
}

const SECRET_BODY_SUMMARY = "INTERNAL_NOTIF_SECRET_SUMMARY";
const SECRET_BODY_REDACTED_VALUE = "INTERNAL_NOTIF_SECRET_REDACTED_VALUE";
const SECRET_PAYLOAD_SUMMARY = "INTERNAL_NOTIF_SECRET_PAYLOAD_SUMMARY";

async function postCreate(
  caller: { token: string; ip: string },
  payload_redacted: Record<string, unknown>,
): Promise<{ statusCode: number; body: unknown }> {
  const r = await app.inject({
    method: "POST",
    url: "/api/v1/actions",
    headers: { authorization: `Bearer ${caller.token}` },
    payload: {
      action_type: "SEND_INTERNAL_NOTIFICATION",
      idempotency_key: `ik-${randomUUID()}`,
      payload_summary: SECRET_PAYLOAD_SUMMARY,
      payload_redacted,
    },
    remoteAddress: caller.ip,
  });
  return { statusCode: r.statusCode, body: r.json() };
}

async function runOnce(): Promise<void> {
  await tickActionScheduler();
  await tickActionExecutor({
    workerId: "test-send-internal-notification",
    attemptTimeoutMs: 2_000,
  });
}

const FORBIDDEN_TOKENS = [
  // No body content of any kind should appear in audit / result_metadata.
  SECRET_BODY_SUMMARY,
  SECRET_BODY_REDACTED_VALUE,
  SECRET_PAYLOAD_SUMMARY,
  "body_summary",
  "body_redacted",
];

describe("SEND_INTERNAL_NOTIFICATION real handler — happy path", () => {
  it("creates a Notification row + emits ACTION_SUCCEEDED with SAFE result_metadata + no body leak in audit", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    const recipient = await makeOrgMember({ orgId, withLogin: false });
    await seedAutoApprovePolicy(orgId, caller.entityId);
    if (caller.token === null) throw new Error("caller token");
    const created = await postCreate(
      { token: caller.token, ip: caller.ip },
      {
        recipient_entity_id: recipient.entityId,
        notification_class: "DUAL_CONTROL_REQUEST",
        body_summary: SECRET_BODY_SUMMARY,
        body_redacted: { secret_key: SECRET_BODY_REDACTED_VALUE },
      },
    );
    expect(created.statusCode).toBe(200);
    const createdBody = created.body as {
      ok: true;
      action: { action_id: string; status: string };
    };
    expect(createdBody.action.status).toBe("APPROVED");
    const actionId = createdBody.action.action_id;
    await runOnce();
    const finalAction = await prisma.action.findUniqueOrThrow({
      where: { action_id: actionId },
    });
    expect(finalAction.status).toBe("SUCCEEDED");

    // Notification persisted with all fields.
    const notifications = await prisma.notification.findMany({
      where: { action_id: actionId },
    });
    expect(notifications.length).toBe(1);
    const notif = notifications[0]!;
    expect(notif.org_entity_id).toBe(orgId);
    expect(notif.recipient_entity_id).toBe(recipient.entityId);
    expect(notif.source_entity_id).toBe(caller.entityId);
    expect(notif.notification_class).toBe("DUAL_CONTROL_REQUEST");
    expect(notif.body_summary).toBe(SECRET_BODY_SUMMARY);
    expect(notif.body_redacted).toEqual({
      secret_key: SECRET_BODY_REDACTED_VALUE,
    });
    expect(notif.read_at).toBeNull();
    expect(notif.deleted_at).toBeNull();

    // ActionAttempt + ActionResult shaped correctly.
    const attempts = await prisma.actionAttempt.findMany({
      where: { action_id: actionId },
    });
    expect(attempts.length).toBe(1);
    expect(attempts[0]?.outcome).toBe("SUCCEEDED");
    const results = await prisma.actionResult.findMany({
      where: { attempt_id: attempts[0]?.attempt_id },
    });
    expect(results.length).toBe(1);
    const meta = results[0]?.result_metadata as Record<string, unknown>;
    expect(meta.handler).toBe("send_internal_notification");
    expect(meta.action_type).toBe("SEND_INTERNAL_NOTIFICATION");
    expect(meta.notification_id).toBe(notif.notification_id);
    expect(meta.recipient_entity_id).toBe(recipient.entityId);
    expect(meta.notification_class).toBe("DUAL_CONTROL_REQUEST");
    expect(meta.status).toBe("dispatched_internal");

    // CRITICAL no-leak: ActionResult metadata must not include any
    // body content from either the payload or the redacted body.
    const metaJson = JSON.stringify(meta);
    for (const tok of FORBIDDEN_TOKENS) {
      expect(metaJson.includes(tok)).toBe(false);
    }

    // ACTION_SUCCEEDED audit row exists; body content not leaked.
    const successAudits = await prisma.auditEvent.findMany({
      where: {
        event_type: "ACTION_SUCCEEDED",
        details: { path: ["action_id"], equals: actionId },
      },
    });
    expect(successAudits.length).toBe(1);
    const auditDetails = JSON.stringify(successAudits[0]?.details);
    for (const tok of FORBIDDEN_TOKENS) {
      expect(auditDetails.includes(tok)).toBe(false);
    }
  });
});

describe("SEND_INTERNAL_NOTIFICATION real handler — cross-org default DENY (RULE 0)", () => {
  it("recipient outside source org -> handler FAILURE with NOTIFICATION_CROSS_ORG_DENIED + no Notification row written", async () => {
    const orgA = await makeTestOrg();
    const orgB = await makeTestOrg();
    const caller = await makeOrgMember({
      orgId: orgA,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    const recipientInOrgB = await makeOrgMember({
      orgId: orgB,
      withLogin: false,
    });
    await seedAutoApprovePolicy(orgA, caller.entityId);
    if (caller.token === null) throw new Error("caller token");
    const created = await postCreate(
      { token: caller.token, ip: caller.ip },
      {
        recipient_entity_id: recipientInOrgB.entityId,
        notification_class: "x",
        body_summary: "y",
      },
    );
    expect(created.statusCode).toBe(200);
    const actionId = (created.body as { action: { action_id: string } }).action
      .action_id;
    await runOnce();
    const finalAction = await prisma.action.findUniqueOrThrow({
      where: { action_id: actionId },
    });
    expect(finalAction.status).toBe("FAILED");

    const attempts = await prisma.actionAttempt.findMany({
      where: { action_id: actionId },
    });
    // SEND_INTERNAL_NOTIFICATION retry_budget=3; cross-org-DENY
    // is deterministic so the executor still attempts 3 times
    // before the parent terminalizes.
    expect(attempts.length).toBe(3);
    for (const a of attempts) {
      expect(a.outcome).toBe("FAILED");
      expect(a.error_class).toBe("NOTIFICATION_CROSS_ORG_DENIED");
    }
    const notifications = await prisma.notification.findMany({
      where: { action_id: actionId },
    });
    expect(notifications.length).toBe(0);
  });
});

describe("SEND_INTERNAL_NOTIFICATION real handler — recipient not found", () => {
  it("unknown recipient_entity_id -> handler FAILURE with NOTIFICATION_CROSS_ORG_DENIED (membership check fires first)", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    await seedAutoApprovePolicy(orgId, caller.entityId);
    if (caller.token === null) throw new Error("caller token");
    // A well-formed UUID that does not correspond to any entity.
    const unknownRecipient = "22222222-2222-2222-8222-222222222222";
    const created = await postCreate(
      { token: caller.token, ip: caller.ip },
      {
        recipient_entity_id: unknownRecipient,
        notification_class: "x",
        body_summary: "y",
      },
    );
    expect(created.statusCode).toBe(200);
    const actionId = (created.body as { action: { action_id: string } }).action
      .action_id;
    await runOnce();
    const attempts = await prisma.actionAttempt.findMany({
      where: { action_id: actionId },
    });
    // Membership lookup returns null (the unknown id isn't a
    // member of any org); the service returns CROSS_ORG_DENIED
    // before the RECIPIENT_NOT_FOUND path runs. This is correct
    // defense-in-depth: the lookup order doesn't leak whether
    // the recipient exists at all.
    for (const a of attempts) {
      expect(a.outcome).toBe("FAILED");
      expect(a.error_class).toBe("NOTIFICATION_CROSS_ORG_DENIED");
    }
  });
});

describe("SEND_INTERNAL_NOTIFICATION real handler — recipient TAR not ACTIVE", () => {
  it("recipient TAR.status=SUSPENDED -> handler FAILURE with NOTIFICATION_RECIPIENT_NOT_ACTIVE", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    const recipient = await makeOrgMember({
      orgId,
      withLogin: false,
      status: "SUSPENDED",
    });
    await seedAutoApprovePolicy(orgId, caller.entityId);
    if (caller.token === null) throw new Error("caller token");
    const created = await postCreate(
      { token: caller.token, ip: caller.ip },
      {
        recipient_entity_id: recipient.entityId,
        notification_class: "x",
        body_summary: "y",
      },
    );
    expect(created.statusCode).toBe(200);
    const actionId = (created.body as { action: { action_id: string } }).action
      .action_id;
    await runOnce();
    const attempts = await prisma.actionAttempt.findMany({
      where: { action_id: actionId },
    });
    for (const a of attempts) {
      expect(a.outcome).toBe("FAILED");
      expect(a.error_class).toBe("NOTIFICATION_RECIPIENT_NOT_ACTIVE");
    }
    const notifications = await prisma.notification.findMany({
      where: { action_id: actionId },
    });
    expect(notifications.length).toBe(0);
  });
});

describe("SEND_INTERNAL_NOTIFICATION real handler — malformed payload (create-time rejection)", () => {
  it("missing recipient_entity_id -> create-time 422 INVALID_FIELD (Action never enters the executor queue)", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    await seedAutoApprovePolicy(orgId, caller.entityId);
    if (caller.token === null) throw new Error("caller token");
    const r = await postCreate(
      { token: caller.token, ip: caller.ip },
      {
        notification_class: "x",
        body_summary: "y",
        // recipient_entity_id missing
      },
    );
    expect(r.statusCode).toBe(422);
    const body = r.body as {
      ok: false;
      code: string;
      invalid_fields: string[];
    };
    expect(body.code).toBe("INVALID_FIELD");
    expect(body.invalid_fields).toContain("recipient_entity_id");
  });

  it("non-UUID recipient_entity_id -> create-time 422 INVALID_FIELD", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    await seedAutoApprovePolicy(orgId, caller.entityId);
    if (caller.token === null) throw new Error("caller token");
    const r = await postCreate(
      { token: caller.token, ip: caller.ip },
      {
        recipient_entity_id: "not-a-uuid",
        notification_class: "x",
        body_summary: "y",
      },
    );
    expect(r.statusCode).toBe(422);
    expect((r.body as { invalid_fields: string[] }).invalid_fields).toContain(
      "recipient_entity_id",
    );
  });

  it("oversized body_summary -> create-time 422 INVALID_FIELD", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    await seedAutoApprovePolicy(orgId, caller.entityId);
    if (caller.token === null) throw new Error("caller token");
    const r = await postCreate(
      { token: caller.token, ip: caller.ip },
      {
        recipient_entity_id: "33333333-3333-3333-8333-333333333333",
        notification_class: "x",
        body_summary: "x".repeat(201),
      },
    );
    expect(r.statusCode).toBe(422);
    expect((r.body as { invalid_fields: string[] }).invalid_fields).toContain(
      "body_summary",
    );
  });
});
