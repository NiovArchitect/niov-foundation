// FILE: audit-viewer-org-scope.test.ts (integration)
// PURPOSE: Section 7 Wave 2 org-admin scope coverage for the
//          unified audit viewer:
//            - GET /api/v1/audit/events?scope=org
//            - GET /api/v1/audit/events/:id?scope=org
//          Verifies: TAR-authoritative can_admin_org gate (403
//          ORG_SCOPE_FORBIDDEN); org-scope OR-fence (actor OR
//          target IN caller's org); cross-org leak prevention;
//          filter AND-narrow under org-scope; pagination under
//          org-scope; single-event org-scope detail access;
//          enumeration-safe 404 on cross-org detail lookup;
//          read-audit emission via ADMIN_ACTION:AUDIT_VIEW_ORG_*;
//          orgless caller path (404 NOT_IN_ANY_ORG).
// CONNECTS TO:
//   - apps/api/src/routes/audit.routes.ts (Wave 2)
//   - apps/api/src/services/audit/audit-view.service.ts
//   - apps/api/src/routes/org.routes.ts:1316 (the existing
//     /org/audit cross-org leak guard precedent)
//   - tests/integration/admin-routes.test.ts:454 (cross-tenant
//     anchor)

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildApp,
  MemoryContentStore,
  MemoryNonceStore,
  MemoryRateLimitStore,
} from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import {
  computeTARHash,
  createEntity,
  prisma,
  writeAuditEvent,
} from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeEntityInput,
  TEST_PREFIX,
  withCleanRateLimits,
} from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "audit-viewer-org-scope-test-secret";
const TEST_KEY = randomBytes(32);

let app: FastifyInstance;
const store = new MemoryRateLimitStore();

beforeAll(async () => {
  await ensureAuditTriggers();
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

async function makeMember(opts: {
  orgId: string;
  can_admin_org?: boolean;
}): Promise<{ entityId: string; token: string; ip: string }> {
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
  await prisma.tokenAttributeRepository.update({
    where: { entity_id: entity.entity_id },
    data: { can_admin_org: opts.can_admin_org === true },
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
  const ip = `10.89.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 254) + 1}`;
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

async function makeOrglessPerson(): Promise<{
  entityId: string;
  token: string;
  ip: string;
}> {
  // Login-capable PERSON entity that is NOT a member of any
  // org. getOrgEntityId() must throw for this caller →
  // 404 NOT_IN_ANY_ORG on scope=org.
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const entity = await createEntity(input);
  // Grant can_admin_org so the admin gate passes; the org
  // resolution is what fails.
  await prisma.tokenAttributeRepository.update({
    where: { entity_id: entity.entity_id },
    data: { can_admin_org: true },
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
  const ip = `10.90.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 254) + 1}`;
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

async function seedAuditRow(
  actorEntityId: string,
  targetEntityId?: string,
  eventType: string = "ADMIN_ACTION",
): Promise<string> {
  const row = await writeAuditEvent({
    event_type: eventType,
    outcome: "SUCCESS",
    actor_entity_id: actorEntityId,
    target_entity_id: targetEntityId,
    details: { action: "TEST_SEED" },
  });
  return row.audit_id;
}

async function listEvents(
  caller: { token: string; ip: string },
  query: string = "",
): Promise<{ statusCode: number; body: unknown; raw: string }> {
  const r = await app.inject({
    method: "GET",
    url: `/api/v1/audit/events${query}`,
    headers: { authorization: `Bearer ${caller.token}` },
    remoteAddress: caller.ip,
  });
  return { statusCode: r.statusCode, body: r.json(), raw: r.body };
}

async function getEvent(
  caller: { token: string; ip: string },
  auditId: string,
  query: string = "",
): Promise<{ statusCode: number; body: unknown; raw: string }> {
  const r = await app.inject({
    method: "GET",
    url: `/api/v1/audit/events/${auditId}${query}`,
    headers: { authorization: `Bearer ${caller.token}` },
    remoteAddress: caller.ip,
  });
  return { statusCode: r.statusCode, body: r.json(), raw: r.body };
}

describe("GET /api/v1/audit/events?scope=org — TAR gate", () => {
  it("422 INVALID_FIELD on bogus scope value", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeMember({ orgId, can_admin_org: true });
    const r = await listEvents(caller, "?scope=enterprise");
    expect(r.statusCode).toBe(422);
    expect((r.body as { invalid_fields: string[] }).invalid_fields).toContain(
      "scope",
    );
  });

  it("403 ORG_SCOPE_FORBIDDEN when caller does NOT have can_admin_org", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeMember({ orgId, can_admin_org: false });
    const r = await listEvents(caller, "?scope=org");
    expect(r.statusCode).toBe(403);
    expect((r.body as { code: string }).code).toBe("ORG_SCOPE_FORBIDDEN");
  });

  it("404 NOT_IN_ANY_ORG when caller has can_admin_org but is not a member of any org", async () => {
    const caller = await makeOrglessPerson();
    const r = await listEvents(caller, "?scope=org");
    expect(r.statusCode).toBe(404);
    expect((r.body as { code: string }).code).toBe("NOT_IN_ANY_ORG");
  });

  it("self-scope behavior is unchanged when scope is omitted (Wave 1 contract)", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeMember({ orgId, can_admin_org: false });
    const r = await listEvents(caller);
    expect(r.statusCode).toBe(200);
    const b = r.body as { events: Array<{ actor_entity_id: string | null }> };
    for (const ev of b.events) {
      expect(ev.actor_entity_id).toBe(caller.entityId);
    }
  });
});

describe("GET /api/v1/audit/events?scope=org — happy path + cross-org isolation", () => {
  it("org-admin sees rows where actor OR target is in their org (OR-fence)", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    const member = await makeMember({ orgId });
    // Seed a row where another member is the ACTOR.
    const memberRowId = await seedAuditRow(member.entityId);
    // Seed a row where another member is the TARGET (actor is
    // the admin themselves so it stays inside the org).
    const targetRowId = await seedAuditRow(admin.entityId, member.entityId);
    const r = await listEvents(admin, "?scope=org");
    expect(r.statusCode).toBe(200);
    const b = r.body as {
      ok: true;
      events: Array<{ audit_id: string }>;
    };
    expect(b.ok).toBe(true);
    const ids = b.events.map((e) => e.audit_id);
    expect(ids).toContain(memberRowId);
    expect(ids).toContain(targetRowId);
  });

  it("org-admin NEVER sees rows from a different org (cross-org leak guard)", async () => {
    const orgA = await makeTestOrg();
    const orgB = await makeTestOrg();
    const adminA = await makeMember({ orgId: orgA, can_admin_org: true });
    const memberB = await makeMember({ orgId: orgB });
    // Seed a row purely on org B (actor + target both in B).
    const orgBRowId = await seedAuditRow(memberB.entityId, memberB.entityId);
    const r = await listEvents(adminA, "?scope=org");
    const b = r.body as { events: Array<{ audit_id: string }> };
    expect(b.events.map((e) => e.audit_id)).not.toContain(orgBRowId);
  });

  it("event_type filter AND-narrows under org-scope (does not widen)", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    const member = await makeMember({ orgId });
    await seedAuditRow(member.entityId, undefined, "ADMIN_ACTION");
    const r = await listEvents(admin, "?scope=org&event_type=ADMIN_ACTION");
    expect(r.statusCode).toBe(200);
    const b = r.body as { events: Array<{ event_type: string }> };
    for (const ev of b.events) {
      expect(ev.event_type).toBe("ADMIN_ACTION");
    }
  });

  it("pagination works under org-scope", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    for (let i = 0; i < 3; i += 1) {
      await seedAuditRow(admin.entityId);
      await new Promise((r) => setTimeout(r, 10));
    }
    const p1 = await listEvents(admin, "?scope=org&page=1&page_size=2");
    expect(p1.statusCode).toBe(200);
    const p1b = p1.body as { total: number; events: unknown[] };
    expect(p1b.events.length).toBe(2);
    const p2 = await listEvents(admin, "?scope=org&page=2&page_size=2");
    const p2b = p2.body as { events: unknown[] };
    expect(p2b.events.length).toBeGreaterThanOrEqual(1);
  });

  it("emits ADMIN_ACTION:AUDIT_VIEW_ORG_LIST with org_entity_id and scope-distinguished from AUDIT_VIEW_LIST", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    await listEvents(admin, "?scope=org");
    const audits = await prisma.auditEvent.findMany({
      where: {
        actor_entity_id: admin.entityId,
        event_type: "ADMIN_ACTION",
      },
      orderBy: { timestamp: "desc" },
    });
    const orgListAudit = audits.find((a) => {
      const d = a.details as Record<string, unknown> | null;
      return d?.action === "AUDIT_VIEW_ORG_LIST";
    });
    expect(orgListAudit).toBeDefined();
    const d = orgListAudit!.details as Record<string, unknown>;
    expect(d.org_entity_id).toBe(orgId);
    // Make sure the filter_keys metadata does NOT contain
    // "scope" as a leaked filter value (we strip it before
    // recording the keys per the no-leak discipline).
    expect((d.filter_keys as string[]).includes("scope")).toBe(false);
  });
});

describe("GET /api/v1/audit/events/:id?scope=org — single-event drilldown", () => {
  it("org-admin can read a same-org event row + prev/next refs scoped to org", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    const member = await makeMember({ orgId });
    await seedAuditRow(member.entityId, undefined, "ADMIN_ACTION");
    await new Promise((r) => setTimeout(r, 25));
    const middleId = await seedAuditRow(member.entityId);
    await new Promise((r) => setTimeout(r, 25));
    await seedAuditRow(member.entityId);
    const r = await getEvent(admin, middleId, "?scope=org");
    expect(r.statusCode).toBe(200);
    const b = r.body as {
      ok: true;
      event: {
        audit_id: string;
        previous_event: { audit_id: string } | null;
        next_event: { audit_id: string } | null;
      };
    };
    expect(b.event.audit_id).toBe(middleId);
    // Both refs should exist (the seeded rows above + below).
    expect(b.event.previous_event).not.toBeNull();
    expect(b.event.next_event).not.toBeNull();
  });

  it("403 ORG_SCOPE_FORBIDDEN when scope=org and caller lacks can_admin_org", async () => {
    const orgId = await makeTestOrg();
    const stranger = await makeMember({ orgId, can_admin_org: false });
    const member = await makeMember({ orgId });
    const id = await seedAuditRow(member.entityId);
    const r = await getEvent(stranger, id, "?scope=org");
    expect(r.statusCode).toBe(403);
    expect((r.body as { code: string }).code).toBe("ORG_SCOPE_FORBIDDEN");
  });

  it("404 AUDIT_EVENT_NOT_FOUND enumeration-safe on cross-org id lookup", async () => {
    const orgA = await makeTestOrg();
    const orgB = await makeTestOrg();
    const adminA = await makeMember({ orgId: orgA, can_admin_org: true });
    const memberB = await makeMember({ orgId: orgB });
    const orgBRowId = await seedAuditRow(memberB.entityId, memberB.entityId);
    const r = await getEvent(adminA, orgBRowId, "?scope=org");
    expect(r.statusCode).toBe(404);
    expect((r.body as { code: string }).code).toBe("AUDIT_EVENT_NOT_FOUND");
  });

  it("422 INVALID_FIELD on bogus scope value at detail route", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    const id = await seedAuditRow(admin.entityId);
    const r = await getEvent(admin, id, "?scope=enterprise");
    expect(r.statusCode).toBe(422);
    expect((r.body as { invalid_fields: string[] }).invalid_fields).toContain(
      "scope",
    );
  });

  it("emits ADMIN_ACTION:AUDIT_VIEW_ORG_EVENT with org_entity_id", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    const id = await seedAuditRow(admin.entityId);
    await getEvent(admin, id, "?scope=org");
    const audits = await prisma.auditEvent.findMany({
      where: {
        actor_entity_id: admin.entityId,
        event_type: "ADMIN_ACTION",
      },
      orderBy: { timestamp: "desc" },
    });
    const orgEventAudit = audits.find((a) => {
      const d = a.details as Record<string, unknown> | null;
      return d?.action === "AUDIT_VIEW_ORG_EVENT";
    });
    expect(orgEventAudit).toBeDefined();
    const d = orgEventAudit!.details as Record<string, unknown>;
    expect(d.audit_id).toBe(id);
    expect(d.org_entity_id).toBe(orgId);
  });
});
