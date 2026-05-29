// FILE: notification-inbox.test.ts (integration)
// PURPOSE: HTTP coverage for the ADR-0057 Wave 12 internal-only
//          notification inbox routes:
//            - GET  /api/v1/notifications
//            - PUT  /api/v1/notifications/:id/read
//            - PUT  /api/v1/notifications/:id/dismiss
//          Verifies bearer + read/write gates; self-scope only
//          (recipient_entity_id == caller); cross-recipient +
//          cross-org rows never surface; enumeration-safe 404 on
//          cross-user / cross-org / unknown / dismissed; idempotent
//          mark-as-read + dismiss; pagination + filter shape;
//          SAFE projection (body_redacted NEVER appears).
// CONNECTS TO:
//   - apps/api/src/routes/notification.routes.ts (Wave 12)
//   - apps/api/src/services/notification/notification-read.service.ts
//   - apps/api/src/services/notification/notification.service.ts
//     (Wave 11 write-side; tests use it directly to seed rows)
//   - packages/database (Wave 11 Notification model)

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildApp,
  MemoryContentStore,
  MemoryNonceStore,
  MemoryRateLimitStore,
  makeNotificationService,
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

const TEST_JWT_SECRET = "notification-inbox-test-secret";
const TEST_KEY = randomBytes(32);

let app: FastifyInstance;
const store = new MemoryRateLimitStore();
const notificationService = makeNotificationService();

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
  return org.entity_id;
}

async function makeOrgMember(orgId: string): Promise<{
  entityId: string;
  token: string;
  ip: string;
}> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const entity = await createEntity(input);
  await prisma.entityMembership.create({
    data: {
      parent_id: orgId,
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
  const ip = `10.87.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 254) + 1}`;
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

const SECRET_BODY_REDACTED = "INBOX_SECRET_REDACTED_VALUE_MUST_NOT_LEAK";

async function seedNotification(opts: {
  org_entity_id: string;
  recipient_entity_id: string;
  source_entity_id: string;
  notification_class?: string;
  body_summary?: string;
  body_redacted?: Record<string, unknown> | null;
}): Promise<string> {
  const r = await notificationService.createInternalNotification({
    org_entity_id: opts.org_entity_id,
    recipient_entity_id: opts.recipient_entity_id,
    source_entity_id: opts.source_entity_id,
    notification_class: opts.notification_class ?? "DUAL_CONTROL_REQUEST",
    body_summary: opts.body_summary ?? "Approval requested",
    body_redacted: opts.body_redacted ?? { secret: SECRET_BODY_REDACTED },
  });
  if (!r.ok) throw new Error(`seed failed: ${r.code}`);
  return r.notification.notification_id;
}

async function listInbox(
  caller: { token: string; ip: string },
  query: string = "",
): Promise<{ statusCode: number; body: unknown; raw: string }> {
  const r = await app.inject({
    method: "GET",
    url: `/api/v1/notifications${query}`,
    headers: { authorization: `Bearer ${caller.token}` },
    remoteAddress: caller.ip,
  });
  return { statusCode: r.statusCode, body: r.json(), raw: r.body };
}

async function markRead(
  caller: { token: string; ip: string },
  notificationId: string,
): Promise<{ statusCode: number; body: unknown; raw: string }> {
  const r = await app.inject({
    method: "PUT",
    url: `/api/v1/notifications/${notificationId}/read`,
    headers: { authorization: `Bearer ${caller.token}` },
    remoteAddress: caller.ip,
  });
  return { statusCode: r.statusCode, body: r.json(), raw: r.body };
}

async function dismiss(
  caller: { token: string; ip: string },
  notificationId: string,
): Promise<{ statusCode: number; body: unknown; raw: string }> {
  const r = await app.inject({
    method: "PUT",
    url: `/api/v1/notifications/${notificationId}/dismiss`,
    headers: { authorization: `Bearer ${caller.token}` },
    remoteAddress: caller.ip,
  });
  return { statusCode: r.statusCode, body: r.json(), raw: r.body };
}

const FORBIDDEN_LIST_TOKENS = [
  // Body content must not leak into the list response.
  "body_redacted",
  SECRET_BODY_REDACTED,
  // Identifiers the recipient doesn't need on the list view.
  "source_entity_id",
  "org_entity_id",
  "recipient_entity_id",
  "deleted_at",
];

describe("GET /api/v1/notifications — auth + envelopes", () => {
  it("401 without bearer", async () => {
    const r = await app.inject({
      method: "GET",
      url: "/api/v1/notifications",
    });
    expect(r.statusCode).toBe(401);
  });

  it("422 INVALID_FIELD on bogus page", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember(orgId);
    const r = await listInbox(caller, "?page=abc");
    expect(r.statusCode).toBe(422);
    expect((r.body as { code: string }).code).toBe("INVALID_FIELD");
    expect((r.body as { invalid_fields: string[] }).invalid_fields).toContain(
      "page",
    );
  });

  it("422 INVALID_FIELD on page_size above MAX cap", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember(orgId);
    const r = await listInbox(caller, "?page_size=9999");
    expect(r.statusCode).toBe(422);
    expect((r.body as { invalid_fields: string[] }).invalid_fields).toContain(
      "page_size",
    );
  });
});

describe("GET /api/v1/notifications — happy path + SAFE projection", () => {
  it("returns the caller's notifications + sort DESC by created_at + SAFE projection (no body_redacted)", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember(orgId);
    const id1 = await seedNotification({
      org_entity_id: orgId,
      recipient_entity_id: caller.entityId,
      source_entity_id: caller.entityId,
      notification_class: "FIRST",
      body_summary: "first body",
    });
    // small delay so created_at ordering is deterministic across rows.
    await new Promise((r) => setTimeout(r, 25));
    const id2 = await seedNotification({
      org_entity_id: orgId,
      recipient_entity_id: caller.entityId,
      source_entity_id: caller.entityId,
      notification_class: "SECOND",
      body_summary: "second body",
    });
    const r = await listInbox(caller);
    expect(r.statusCode).toBe(200);
    const b = r.body as {
      ok: true;
      page: number;
      page_size: number;
      total: number;
      notifications: Array<{
        notification_id: string;
        notification_class: string;
        body_summary: string;
        action_id: string | null;
        created_at: string;
        read_at: string | null;
        status: "UNREAD" | "READ";
      }>;
    };
    expect(b.ok).toBe(true);
    expect(b.page).toBe(1);
    expect(b.total).toBe(2);
    expect(b.notifications.length).toBe(2);
    // DESC by created_at — newest first.
    expect(b.notifications[0]?.notification_id).toBe(id2);
    expect(b.notifications[1]?.notification_id).toBe(id1);
    expect(b.notifications[0]?.status).toBe("UNREAD");
    expect(b.notifications[0]?.read_at).toBeNull();
    expect(b.notifications[0]?.action_id).toBeNull();
    // SAFE projection no-leak: body_redacted must NOT appear in
    // any list-route response. body_summary is intentionally
    // surfaced.
    for (const tok of FORBIDDEN_LIST_TOKENS) {
      expect(r.raw.includes(tok)).toBe(false);
    }
    // body_summary IS expected to surface.
    expect(r.raw.includes("first body")).toBe(true);
    expect(r.raw.includes("second body")).toBe(true);
  });

  it("status is READ when read_at is populated; UNREAD otherwise", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember(orgId);
    const id = await seedNotification({
      org_entity_id: orgId,
      recipient_entity_id: caller.entityId,
      source_entity_id: caller.entityId,
    });
    const before = await listInbox(caller);
    expect(
      (before.body as { notifications: Array<{ status: string }> })
        .notifications[0]?.status,
    ).toBe("UNREAD");
    await markRead(caller, id);
    const after = await listInbox(caller);
    expect(
      (after.body as { notifications: Array<{ status: string }> })
        .notifications[0]?.status,
    ).toBe("READ");
  });

  it("unread_only=true filters out READ notifications", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember(orgId);
    const id1 = await seedNotification({
      org_entity_id: orgId,
      recipient_entity_id: caller.entityId,
      source_entity_id: caller.entityId,
    });
    await seedNotification({
      org_entity_id: orgId,
      recipient_entity_id: caller.entityId,
      source_entity_id: caller.entityId,
    });
    await markRead(caller, id1);
    const r = await listInbox(caller, "?unread_only=true");
    const b = r.body as { total: number; notifications: unknown[] };
    expect(b.total).toBe(1);
    expect(b.notifications.length).toBe(1);
  });

  it("notification_class filter narrows the page", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember(orgId);
    await seedNotification({
      org_entity_id: orgId,
      recipient_entity_id: caller.entityId,
      source_entity_id: caller.entityId,
      notification_class: "ALPHA",
    });
    await seedNotification({
      org_entity_id: orgId,
      recipient_entity_id: caller.entityId,
      source_entity_id: caller.entityId,
      notification_class: "BETA",
    });
    const r = await listInbox(caller, "?notification_class=ALPHA");
    const b = r.body as {
      total: number;
      notifications: Array<{ notification_class: string }>;
    };
    expect(b.total).toBe(1);
    expect(b.notifications[0]?.notification_class).toBe("ALPHA");
  });

  it("pagination partitions the result set", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember(orgId);
    for (let i = 0; i < 3; i += 1) {
      await seedNotification({
        org_entity_id: orgId,
        recipient_entity_id: caller.entityId,
        source_entity_id: caller.entityId,
      });
      await new Promise((r) => setTimeout(r, 10));
    }
    const p1 = await listInbox(caller, "?page=1&page_size=2");
    const p1b = p1.body as { total: number; notifications: unknown[] };
    expect(p1b.total).toBe(3);
    expect(p1b.notifications.length).toBe(2);
    const p2 = await listInbox(caller, "?page=2&page_size=2");
    const p2b = p2.body as { notifications: unknown[] };
    expect(p2b.notifications.length).toBe(1);
  });
});

describe("GET /api/v1/notifications — RULE 0 self-scope + cross-recipient + cross-org isolation", () => {
  it("never returns another user's notifications in the same org", async () => {
    const orgId = await makeTestOrg();
    const owner = await makeOrgMember(orgId);
    const stranger = await makeOrgMember(orgId);
    await seedNotification({
      org_entity_id: orgId,
      recipient_entity_id: stranger.entityId,
      source_entity_id: owner.entityId,
    });
    const r = await listInbox(owner);
    const b = r.body as { total: number; notifications: unknown[] };
    expect(b.total).toBe(0);
    expect(b.notifications).toEqual([]);
  });

  it("never returns notifications from a different org", async () => {
    const orgA = await makeTestOrg();
    const orgB = await makeTestOrg();
    const callerA = await makeOrgMember(orgA);
    const recipientB = await makeOrgMember(orgB);
    const senderB = await makeOrgMember(orgB);
    await seedNotification({
      org_entity_id: orgB,
      recipient_entity_id: recipientB.entityId,
      source_entity_id: senderB.entityId,
    });
    const r = await listInbox(callerA);
    expect((r.body as { total: number }).total).toBe(0);
  });

  it("excludes dismissed (soft-deleted) notifications from the default list", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember(orgId);
    const idA = await seedNotification({
      org_entity_id: orgId,
      recipient_entity_id: caller.entityId,
      source_entity_id: caller.entityId,
    });
    await seedNotification({
      org_entity_id: orgId,
      recipient_entity_id: caller.entityId,
      source_entity_id: caller.entityId,
    });
    await dismiss(caller, idA);
    const r = await listInbox(caller);
    const b = r.body as {
      total: number;
      notifications: Array<{ notification_id: string }>;
    };
    expect(b.total).toBe(1);
    expect(b.notifications.map((n) => n.notification_id)).not.toContain(idA);
  });
});

describe("PUT /api/v1/notifications/:id/read — happy + idempotent + cross-user", () => {
  it("marks an UNREAD notification READ with a populated read_at", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember(orgId);
    const id = await seedNotification({
      org_entity_id: orgId,
      recipient_entity_id: caller.entityId,
      source_entity_id: caller.entityId,
    });
    const r = await markRead(caller, id);
    expect(r.statusCode).toBe(200);
    const b = r.body as {
      ok: true;
      notification: { notification_id: string; status: string; read_at: string | null };
    };
    expect(b.notification.notification_id).toBe(id);
    expect(b.notification.status).toBe("READ");
    expect(typeof b.notification.read_at).toBe("string");
    // DB-tier check.
    const row = await prisma.notification.findUniqueOrThrow({
      where: { notification_id: id },
    });
    expect(row.read_at).not.toBeNull();
  });

  it("is idempotent when called twice — no timestamp re-fire", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember(orgId);
    const id = await seedNotification({
      org_entity_id: orgId,
      recipient_entity_id: caller.entityId,
      source_entity_id: caller.entityId,
    });
    const r1 = await markRead(caller, id);
    expect(r1.statusCode).toBe(200);
    const firstReadAt = (
      r1.body as { notification: { read_at: string | null } }
    ).notification.read_at;
    expect(firstReadAt).not.toBeNull();
    await new Promise((rr) => setTimeout(rr, 25));
    const r2 = await markRead(caller, id);
    expect(r2.statusCode).toBe(200);
    const secondReadAt = (
      r2.body as { notification: { read_at: string | null } }
    ).notification.read_at;
    expect(secondReadAt).toBe(firstReadAt);
  });

  it("returns 400 INVALID_NOTIFICATION_ID for non-UUID id", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember(orgId);
    const r = await markRead(caller, "not-a-uuid");
    expect(r.statusCode).toBe(400);
    expect((r.body as { code: string }).code).toBe("INVALID_NOTIFICATION_ID");
  });

  it("returns enumeration-safe 404 NOTIFICATION_NOT_FOUND when caller is not the recipient", async () => {
    const orgId = await makeTestOrg();
    const owner = await makeOrgMember(orgId);
    const stranger = await makeOrgMember(orgId);
    const id = await seedNotification({
      org_entity_id: orgId,
      recipient_entity_id: owner.entityId,
      source_entity_id: owner.entityId,
    });
    const r = await markRead(stranger, id);
    expect(r.statusCode).toBe(404);
    expect((r.body as { code: string }).code).toBe("NOTIFICATION_NOT_FOUND");
  });

  it("returns 404 NOTIFICATION_NOT_FOUND when id is unknown", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember(orgId);
    const r = await markRead(caller, "11111111-1111-1111-8111-111111111111");
    expect(r.statusCode).toBe(404);
    expect((r.body as { code: string }).code).toBe("NOTIFICATION_NOT_FOUND");
  });

  it("returns 404 when the notification has been dismissed (collapses to enumeration-safe path)", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember(orgId);
    const id = await seedNotification({
      org_entity_id: orgId,
      recipient_entity_id: caller.entityId,
      source_entity_id: caller.entityId,
    });
    await dismiss(caller, id);
    const r = await markRead(caller, id);
    expect(r.statusCode).toBe(404);
    expect((r.body as { code: string }).code).toBe("NOTIFICATION_NOT_FOUND");
  });
});

describe("PUT /api/v1/notifications/:id/dismiss — soft-delete (RULE 10) + idempotent enumeration-safe", () => {
  it("sets deleted_at + removes the row from list views", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember(orgId);
    const id = await seedNotification({
      org_entity_id: orgId,
      recipient_entity_id: caller.entityId,
      source_entity_id: caller.entityId,
    });
    const r = await dismiss(caller, id);
    expect(r.statusCode).toBe(200);
    const row = await prisma.notification.findUniqueOrThrow({
      where: { notification_id: id },
    });
    expect(row.deleted_at).not.toBeNull();
    const list = await listInbox(caller);
    expect((list.body as { total: number }).total).toBe(0);
  });

  it("idempotently collapses a second dismiss to enumeration-safe 404", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember(orgId);
    const id = await seedNotification({
      org_entity_id: orgId,
      recipient_entity_id: caller.entityId,
      source_entity_id: caller.entityId,
    });
    const r1 = await dismiss(caller, id);
    expect(r1.statusCode).toBe(200);
    const r2 = await dismiss(caller, id);
    expect(r2.statusCode).toBe(404);
    expect((r2.body as { code: string }).code).toBe("NOTIFICATION_NOT_FOUND");
  });

  it("returns enumeration-safe 404 when caller is not the recipient", async () => {
    const orgId = await makeTestOrg();
    const owner = await makeOrgMember(orgId);
    const stranger = await makeOrgMember(orgId);
    const id = await seedNotification({
      org_entity_id: orgId,
      recipient_entity_id: owner.entityId,
      source_entity_id: owner.entityId,
    });
    const r = await dismiss(stranger, id);
    expect(r.statusCode).toBe(404);
    expect((r.body as { code: string }).code).toBe("NOTIFICATION_NOT_FOUND");
    // DB-tier guarantee: the row is still UNDISMISSED for the owner.
    const row = await prisma.notification.findUniqueOrThrow({
      where: { notification_id: id },
    });
    expect(row.deleted_at).toBeNull();
  });

  it("returns 400 INVALID_NOTIFICATION_ID for non-UUID id", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember(orgId);
    const r = await dismiss(caller, "not-a-uuid");
    expect(r.statusCode).toBe(400);
    expect((r.body as { code: string }).code).toBe("INVALID_NOTIFICATION_ID");
  });
});
