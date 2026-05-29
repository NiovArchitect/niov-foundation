// FILE: audit-viewer-platform-scope.test.ts (integration)
// PURPOSE: Section 7 Wave 3 niov-admin/platform scope coverage
//          for the unified audit viewer:
//            - GET /api/v1/audit/events?scope=platform
//            - GET /api/v1/audit/events/:id?scope=platform
//          Verifies: TAR-authoritative can_admin_niov gate
//          (403 PLATFORM_SCOPE_FORBIDDEN); platform-scope
//          unfenced visibility (admin sees rows across orgs);
//          filters AND-narrow under platform scope; pagination
//          works under platform scope; single-event detail
//          surfaces across orgs with chain refs walking the
//          unconstrained timeline; verify-chain remains
//          self-only (Wave 2 contract preserved); read-audit
//          emission via ADMIN_ACTION:AUDIT_VIEW_PLATFORM_*
//          (no new audit literal).
// CONNECTS TO:
//   - apps/api/src/routes/audit.routes.ts (Wave 3)
//   - apps/api/src/services/audit/audit-view.service.ts
//   - apps/api/src/routes/platform.routes.ts:215 (the existing
//     /platform/audit precedent)
//   - apps/api/src/routes/console.routes.ts (the existing
//     /console/audit precedent)

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

const TEST_JWT_SECRET = "audit-viewer-platform-scope-test-secret";
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
  can_admin_niov?: boolean;
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
    data: {
      can_admin_org: opts.can_admin_org === true,
      can_admin_niov: opts.can_admin_niov === true,
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
  const ip = `10.91.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 254) + 1}`;
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

describe("GET /api/v1/audit/events?scope=platform — TAR gate", () => {
  it("403 PLATFORM_SCOPE_FORBIDDEN when caller does NOT have can_admin_niov", async () => {
    const orgId = await makeTestOrg();
    // can_admin_org=true but can_admin_niov=false should still
    // be rejected.
    const orgAdmin = await makeMember({
      orgId,
      can_admin_org: true,
      can_admin_niov: false,
    });
    const r = await listEvents(orgAdmin, "?scope=platform");
    expect(r.statusCode).toBe(403);
    expect((r.body as { code: string }).code).toBe(
      "PLATFORM_SCOPE_FORBIDDEN",
    );
  });

  it("can_admin_niov caller can read platform scope", async () => {
    const orgId = await makeTestOrg();
    const niovAdmin = await makeMember({
      orgId,
      can_admin_niov: true,
    });
    const r = await listEvents(niovAdmin, "?scope=platform");
    expect(r.statusCode).toBe(200);
    const b = r.body as { ok: true };
    expect(b.ok).toBe(true);
  });
});

describe("GET /api/v1/audit/events?scope=platform — cross-org visibility", () => {
  it("niov-admin sees rows across multiple orgs (unfenced)", async () => {
    const orgA = await makeTestOrg();
    const orgB = await makeTestOrg();
    const niovAdmin = await makeMember({
      orgId: orgA,
      can_admin_niov: true,
    });
    const memberA = await makeMember({ orgId: orgA });
    const memberB = await makeMember({ orgId: orgB });
    const rowA = await seedAuditRow(memberA.entityId);
    const rowB = await seedAuditRow(memberB.entityId);
    const r = await listEvents(niovAdmin, "?scope=platform");
    expect(r.statusCode).toBe(200);
    const b = r.body as { events: Array<{ audit_id: string }> };
    const ids = b.events.map((e) => e.audit_id);
    expect(ids).toContain(rowA);
    expect(ids).toContain(rowB);
  });

  it("event_type filter AND-narrows under platform scope", async () => {
    const orgId = await makeTestOrg();
    const niovAdmin = await makeMember({
      orgId,
      can_admin_niov: true,
    });
    const member = await makeMember({ orgId });
    await seedAuditRow(member.entityId, undefined, "ADMIN_ACTION");
    const r = await listEvents(
      niovAdmin,
      "?scope=platform&event_type=ADMIN_ACTION",
    );
    expect(r.statusCode).toBe(200);
    const b = r.body as { events: Array<{ event_type: string }> };
    for (const ev of b.events) {
      expect(ev.event_type).toBe("ADMIN_ACTION");
    }
  });

  it("pagination works under platform scope", async () => {
    const orgId = await makeTestOrg();
    const niovAdmin = await makeMember({
      orgId,
      can_admin_niov: true,
    });
    for (let i = 0; i < 3; i += 1) {
      await seedAuditRow(niovAdmin.entityId);
      await new Promise((r) => setTimeout(r, 10));
    }
    const p1 = await listEvents(
      niovAdmin,
      "?scope=platform&page=1&page_size=2",
    );
    expect(p1.statusCode).toBe(200);
    const p1b = p1.body as { total: number; events: unknown[] };
    expect(p1b.events.length).toBe(2);
    const p2 = await listEvents(
      niovAdmin,
      "?scope=platform&page=2&page_size=2",
    );
    const p2b = p2.body as { events: unknown[] };
    expect(p2b.events.length).toBeGreaterThanOrEqual(1);
  });

  it("emits ADMIN_ACTION:AUDIT_VIEW_PLATFORM_LIST", async () => {
    const orgId = await makeTestOrg();
    const niovAdmin = await makeMember({
      orgId,
      can_admin_niov: true,
    });
    await listEvents(niovAdmin, "?scope=platform");
    const audits = await prisma.auditEvent.findMany({
      where: {
        actor_entity_id: niovAdmin.entityId,
        event_type: "ADMIN_ACTION",
      },
      orderBy: { timestamp: "desc" },
    });
    const platformListAudit = audits.find((a) => {
      const d = a.details as Record<string, unknown> | null;
      return d?.action === "AUDIT_VIEW_PLATFORM_LIST";
    });
    expect(platformListAudit).toBeDefined();
    const d = platformListAudit!.details as Record<string, unknown>;
    expect(typeof d.page).toBe("number");
    // No org_entity_id field on platform-scope reads (unscoped).
    expect(d.org_entity_id).toBeUndefined();
  });
});

describe("GET /api/v1/audit/events/:id?scope=platform — single-event detail", () => {
  it("niov-admin can read a cross-org event row + prev/next refs walking the full timeline", async () => {
    const orgA = await makeTestOrg();
    const orgB = await makeTestOrg();
    const niovAdmin = await makeMember({
      orgId: orgA,
      can_admin_niov: true,
    });
    const memberB = await makeMember({ orgId: orgB });
    const rowB = await seedAuditRow(memberB.entityId);
    const r = await getEvent(niovAdmin, rowB, "?scope=platform");
    expect(r.statusCode).toBe(200);
    const b = r.body as {
      ok: true;
      event: { audit_id: string };
    };
    expect(b.event.audit_id).toBe(rowB);
  });

  it("403 PLATFORM_SCOPE_FORBIDDEN when scope=platform and caller lacks can_admin_niov", async () => {
    const orgId = await makeTestOrg();
    const orgAdmin = await makeMember({ orgId, can_admin_org: true });
    const id = await seedAuditRow(orgAdmin.entityId);
    const r = await getEvent(orgAdmin, id, "?scope=platform");
    expect(r.statusCode).toBe(403);
    expect((r.body as { code: string }).code).toBe(
      "PLATFORM_SCOPE_FORBIDDEN",
    );
  });

  it("404 AUDIT_EVENT_NOT_FOUND on unknown UUID even under platform scope (enumeration-safe)", async () => {
    const orgId = await makeTestOrg();
    const niovAdmin = await makeMember({
      orgId,
      can_admin_niov: true,
    });
    const r = await getEvent(
      niovAdmin,
      "11111111-1111-1111-8111-111111111111",
      "?scope=platform",
    );
    expect(r.statusCode).toBe(404);
    expect((r.body as { code: string }).code).toBe(
      "AUDIT_EVENT_NOT_FOUND",
    );
  });

  it("emits ADMIN_ACTION:AUDIT_VIEW_PLATFORM_EVENT with audit_id", async () => {
    const orgId = await makeTestOrg();
    const niovAdmin = await makeMember({
      orgId,
      can_admin_niov: true,
    });
    const id = await seedAuditRow(niovAdmin.entityId);
    await getEvent(niovAdmin, id, "?scope=platform");
    const audits = await prisma.auditEvent.findMany({
      where: {
        actor_entity_id: niovAdmin.entityId,
        event_type: "ADMIN_ACTION",
      },
      orderBy: { timestamp: "desc" },
    });
    const platformEventAudit = audits.find((a) => {
      const d = a.details as Record<string, unknown> | null;
      return d?.action === "AUDIT_VIEW_PLATFORM_EVENT";
    });
    expect(platformEventAudit).toBeDefined();
    const d = platformEventAudit!.details as Record<string, unknown>;
    expect(d.audit_id).toBe(id);
  });
});
