// FILE: hive-wave-3-admin-routes.test.ts (integration)
// PURPOSE: Section 3 Wave 3 admin route coverage per ADR-0062.
//          Verifies: bearer + can_admin_org gate at every route;
//          cross-org hive probes collapse to enumeration-safe 404
//          HIVE_NOT_FOUND; cross-org member probes collapse to
//          enumeration-safe 404; safe roster projection (capsule_types
//          surfaced as COUNTS not value strings; no governance_terms /
//          aggregate_capsule_id / wallet internals / permission
//          internals / bridge IDs / secret refs); DELETE hive
//          idempotency on already-DISSOLVED (no new audit row);
//          force-remove member emits HIVE_MEMBER_REMOVED literal +
//          details.action = "HIVE_MEMBER_FORCE_REMOVED" + actor_role
//          = "ORG_ADMIN" discriminators; AI_AGENT force-remove
//          permitted at admin tier (cleanup surface); list/detail
//          reads emit NO audit row (Section 4 precedent); zero new
//          audit literals.
// CONNECTS TO:
//   - apps/api/src/routes/hive-admin.routes.ts (Wave 3 admin routes)
//   - apps/api/src/services/hive/hive.service.ts (4 admin methods)
//   - ADR-0062 Section 3 Hives Wave 3 Admin Routes Design

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildApp,
  MemoryContentStore,
  MemoryNonceStore,
  MemoryRateLimitStore,
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

const TEST_JWT_SECRET = "hive-wave-3-admin-test-secret";
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

async function refreshTARHash(entityId: string): Promise<void> {
  const fresh = await prisma.tokenAttributeRepository.findUnique({
    where: { entity_id: entityId },
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
    where: { entity_id: entityId },
    data: { tar_hash: newHash },
  });
}

async function makeMember(opts: {
  orgId: string;
  can_admin_org?: boolean;
  can_create_hives?: boolean;
  entity_type?: "PERSON" | "AI_AGENT";
}): Promise<{ entityId: string; token: string; ip: string }> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({
    entity_type: opts.entity_type ?? "PERSON",
    password,
  });
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
      can_create_hives: opts.can_create_hives === true,
    },
  });
  await refreshTARHash(entity.entity_id);
  const ip = `10.84.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 254) + 1}`;
  if (opts.entity_type === "AI_AGENT") {
    // AI_AGENT entities don't log in via password — they are added
    // directly via prisma so admin force-remove tests can target them.
    return { entityId: entity.entity_id, token: "n/a", ip };
  }
  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: {
      email: input.email,
      password,
      requested_operations: ["read", "write", "create_hives"],
    },
    remoteAddress: ip,
  });
  if (login.statusCode !== 200) {
    throw new Error(`login failed: ${login.statusCode} ${login.body}`);
  }
  const body = login.json() as { token: string };
  return { entityId: entity.entity_id, token: body.token, ip };
}

async function get(
  caller: { token: string; ip: string },
  url: string,
): Promise<{ statusCode: number; body: any; raw: string }> {
  const r = await app.inject({
    method: "GET",
    url,
    headers: { authorization: `Bearer ${caller.token}` },
    remoteAddress: caller.ip,
  });
  return { statusCode: r.statusCode, body: r.json() as any, raw: r.body };
}

async function del(
  caller: { token: string; ip: string },
  url: string,
): Promise<{ statusCode: number; body: any; raw: string }> {
  const r = await app.inject({
    method: "DELETE",
    url,
    headers: { authorization: `Bearer ${caller.token}` },
    remoteAddress: caller.ip,
  });
  return { statusCode: r.statusCode, body: r.json() as any, raw: r.body };
}

async function createHiveDirectly(opts: {
  orgId: string;
  createdBy: string;
  hiveName?: string;
  status?: "ACTIVE" | "DISSOLVED";
  is_default_enterprise?: boolean;
}): Promise<string> {
  const h = await prisma.hive.create({
    data: {
      hive_id: randomUUID(),
      hive_name: opts.hiveName ?? `${TEST_PREFIX}hive_${randomUUID()}`,
      created_by: opts.createdBy,
      hive_type: "ENTERPRISE",
      governance_terms: { secret_policy: "internal-only" },
      member_count: 1,
      status: opts.status ?? "ACTIVE",
      org_entity_id: opts.orgId,
      is_default_enterprise: opts.is_default_enterprise ?? false,
    },
  });
  await prisma.hiveMembership.create({
    data: {
      membership_id: randomUUID(),
      hive_id: h.hive_id,
      entity_id: opts.createdBy,
      capsule_types_contributed: ["PREFERENCE"],
      contribution_scope: "SUMMARY",
      capsule_types_accessible: ["PREFERENCE"],
      access_scope: "SUMMARY",
      status: "ACTIVE",
    },
  });
  return h.hive_id;
}

async function addMembership(opts: {
  hiveId: string;
  entityId: string;
  status?: "ACTIVE" | "REMOVED";
  capsule_types_accessible?: string[];
  capsule_types_contributed?: string[];
}): Promise<string> {
  const m = await prisma.hiveMembership.create({
    data: {
      membership_id: randomUUID(),
      hive_id: opts.hiveId,
      entity_id: opts.entityId,
      capsule_types_contributed: opts.capsule_types_contributed ?? [],
      contribution_scope: "METADATA_ONLY",
      capsule_types_accessible: opts.capsule_types_accessible ?? [],
      access_scope: "METADATA_ONLY",
      status: opts.status ?? "ACTIVE",
    },
  });
  await prisma.hive.update({
    where: { hive_id: opts.hiveId },
    data: { member_count: { increment: opts.status === "REMOVED" ? 0 : 1 } },
  });
  return m.membership_id;
}

describe("Section 3 Wave 3 — admin gate enforcement", () => {
  it("403 ADMIN_CAPABILITY_REQUIRED on list when caller lacks can_admin_org", async () => {
    const orgId = await makeTestOrg();
    const nonAdmin = await makeMember({ orgId, can_admin_org: false });
    const r = await get(nonAdmin, "/api/v1/org/hives");
    expect(r.statusCode).toBe(403);
    expect(r.body.error).toBe("ADMIN_CAPABILITY_REQUIRED");
  });

  it("403 ADMIN_CAPABILITY_REQUIRED on detail / dissolve / force-remove without can_admin_org", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    const hiveId = await createHiveDirectly({
      orgId,
      createdBy: admin.entityId,
    });
    const nonAdmin = await makeMember({ orgId, can_admin_org: false });
    const detail = await get(nonAdmin, `/api/v1/org/hives/${hiveId}`);
    expect(detail.statusCode).toBe(403);
    const dissolve = await del(nonAdmin, `/api/v1/org/hives/${hiveId}`);
    expect(dissolve.statusCode).toBe(403);
    const fr = await del(
      nonAdmin,
      `/api/v1/org/hives/${hiveId}/member/${admin.entityId}`,
    );
    expect(fr.statusCode).toBe(403);
  });

  it("401 SESSION_INVALID without bearer", async () => {
    const r = await app.inject({
      method: "GET",
      url: "/api/v1/org/hives",
    });
    expect(r.statusCode).toBe(401);
  });

  it("404 NO_ORG_FOR_CALLER when admin has no EntityMembership", async () => {
    const password = "correct-horse-battery";
    const input = makeEntityInput({ entity_type: "PERSON", password });
    const entity = await createEntity(input);
    await prisma.tokenAttributeRepository.update({
      where: { entity_id: entity.entity_id },
      data: { can_admin_org: true },
    });
    await refreshTARHash(entity.entity_id);
    const ip = `10.85.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 254) + 1}`;
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
    expect(login.statusCode).toBe(200);
    const body = login.json() as { token: string };
    const r = await get({ token: body.token, ip }, "/api/v1/org/hives");
    expect(r.statusCode).toBe(404);
    expect(r.body.code).toBe("NO_ORG_FOR_CALLER");
  });
});

describe("Section 3 Wave 3 — list (GET /api/v1/org/hives)", () => {
  it("returns only same-org hives; cross-org hives absent", async () => {
    const orgA = await makeTestOrg();
    const orgB = await makeTestOrg();
    const adminA = await makeMember({ orgId: orgA, can_admin_org: true });
    const adminB = await makeMember({ orgId: orgB, can_admin_org: true });
    await createHiveDirectly({
      orgId: orgA,
      createdBy: adminA.entityId,
      hiveName: "ALPHA_HIVE_001",
    });
    await createHiveDirectly({
      orgId: orgB,
      createdBy: adminB.entityId,
      hiveName: "BETA_HIVE_001",
    });
    const r = await get(adminA, "/api/v1/org/hives");
    expect(r.statusCode).toBe(200);
    const names: string[] = (r.body.hives as Array<{ hive_name: string }>).map(
      (h) => h.hive_name,
    );
    expect(names).toContain("ALPHA_HIVE_001");
    expect(names).not.toContain("BETA_HIVE_001");
  });

  it("optional status filter (DISSOLVED) returns only dissolved hives", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    const activeId = await createHiveDirectly({
      orgId,
      createdBy: admin.entityId,
    });
    const dissolvedId = await createHiveDirectly({
      orgId,
      createdBy: admin.entityId,
      status: "DISSOLVED",
    });
    const r = await get(admin, "/api/v1/org/hives?status=DISSOLVED");
    expect(r.statusCode).toBe(200);
    const ids: string[] = (r.body.hives as Array<{ hive_id: string }>).map(
      (h) => h.hive_id,
    );
    expect(ids).toContain(dissolvedId);
    expect(ids).not.toContain(activeId);
  });

  it("invalid status filter → 422 INVALID_FIELD", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    const r = await get(admin, "/api/v1/org/hives?status=PURPLE");
    expect(r.statusCode).toBe(422);
    expect(r.body.code).toBe("INVALID_FIELD");
    expect(r.body.invalid_fields).toContain("status");
  });

  it("list response wire shape excludes forbidden fields", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    await createHiveDirectly({ orgId, createdBy: admin.entityId });
    const r = await get(admin, "/api/v1/org/hives");
    expect(r.statusCode).toBe(200);
    // governance_terms ("secret_policy: internal-only") MUST NOT
    // leak into list responses per ADR-0062 Sub-decision 2.
    expect(r.raw).not.toContain("governance_terms");
    expect(r.raw).not.toContain("secret_policy");
    expect(r.raw).not.toContain("aggregate_capsule_id");
  });
});

describe("Section 3 Wave 3 — detail (GET /api/v1/org/hives/:id)", () => {
  it("returns hive + safe member roster", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    const member = await makeMember({ orgId });
    const hiveId = await createHiveDirectly({
      orgId,
      createdBy: admin.entityId,
    });
    await addMembership({
      hiveId,
      entityId: member.entityId,
      capsule_types_accessible: ["PREFERENCE", "DOMAIN_KNOWLEDGE"],
      capsule_types_contributed: ["PREFERENCE"],
    });
    const r = await get(admin, `/api/v1/org/hives/${hiveId}`);
    expect(r.statusCode).toBe(200);
    expect(r.body.hive.hive_id).toBe(hiveId);
    expect(r.body.hive.org_entity_id).toBe(orgId);
    expect(r.body.members).toHaveLength(2);
    const memberEntry = r.body.members.find(
      (m: any) => m.entity_id === member.entityId,
    );
    expect(memberEntry).toBeDefined();
    expect(memberEntry.capsule_types_accessible_count).toBe(2);
    expect(memberEntry.capsule_types_contributed_count).toBe(1);
    expect(memberEntry).not.toHaveProperty("capsule_types_accessible");
    expect(memberEntry).not.toHaveProperty("capsule_types_contributed");
  });

  it("404 HIVE_NOT_FOUND for cross-org hive id (enumeration-safe)", async () => {
    const orgA = await makeTestOrg();
    const orgB = await makeTestOrg();
    const adminA = await makeMember({ orgId: orgA, can_admin_org: true });
    const adminB = await makeMember({ orgId: orgB, can_admin_org: true });
    const hiveB = await createHiveDirectly({
      orgId: orgB,
      createdBy: adminB.entityId,
    });
    const r = await get(adminA, `/api/v1/org/hives/${hiveB}`);
    expect(r.statusCode).toBe(404);
    expect(r.body.code).toBe("HIVE_NOT_FOUND");
  });

  it("detail response wire shape excludes forbidden fields", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    const member = await makeMember({ orgId });
    const hiveId = await createHiveDirectly({
      orgId,
      createdBy: admin.entityId,
    });
    await addMembership({
      hiveId,
      entityId: member.entityId,
      capsule_types_accessible: ["PREFERENCE"],
    });
    const r = await get(admin, `/api/v1/org/hives/${hiveId}`);
    expect(r.statusCode).toBe(200);
    expect(r.raw).not.toContain("governance_terms");
    expect(r.raw).not.toContain("secret_policy");
    expect(r.raw).not.toContain("aggregate_capsule_id");
    expect(r.raw).not.toContain("storage_location");
    expect(r.raw).not.toContain("content_hash");
    expect(r.raw).not.toContain("secret_ref");
    expect(r.raw).not.toContain("bridge_id");
    expect(r.raw).not.toContain("payload_content");
    expect(r.raw).not.toContain("payload_summary");
  });
});

describe("Section 3 Wave 3 — dissolve (DELETE /api/v1/org/hives/:id)", () => {
  it("active → DISSOLVED transition flips status + emits ADMIN_ACTION audit", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    const hiveId = await createHiveDirectly({
      orgId,
      createdBy: admin.entityId,
    });
    const r = await del(admin, `/api/v1/org/hives/${hiveId}`);
    expect(r.statusCode).toBe(200);
    expect(r.body.status).toBe("DISSOLVED");
    expect(r.body.already_dissolved).toBe(false);
    expect(r.body.audit_event_id).toBeTruthy();
    const row = await prisma.hive.findUnique({ where: { hive_id: hiveId } });
    expect(row?.status).toBe("DISSOLVED");
    // Verify ADMIN_ACTION audit row with HIVE_DISSOLVED discriminator.
    const audit = await prisma.auditEvent.findUnique({
      where: { audit_id: r.body.audit_event_id },
    });
    expect(audit?.event_type).toBe("ADMIN_ACTION");
    const details = audit?.details as { action?: string; hive_id?: string };
    expect(details.action).toBe("HIVE_DISSOLVED");
    expect(details.hive_id).toBe(hiveId);
  });

  it("idempotent on already-DISSOLVED: no new audit row, already_dissolved=true", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    const hiveId = await createHiveDirectly({
      orgId,
      createdBy: admin.entityId,
      status: "DISSOLVED",
    });
    const beforeAudits = await prisma.auditEvent.count({
      where: {
        event_type: "ADMIN_ACTION",
        actor_entity_id: admin.entityId,
      },
    });
    const r = await del(admin, `/api/v1/org/hives/${hiveId}`);
    expect(r.statusCode).toBe(200);
    expect(r.body.already_dissolved).toBe(true);
    expect(r.body.audit_event_id).toBeNull();
    const afterAudits = await prisma.auditEvent.count({
      where: {
        event_type: "ADMIN_ACTION",
        actor_entity_id: admin.entityId,
      },
    });
    expect(afterAudits).toBe(beforeAudits);
  });

  it("404 HIVE_NOT_FOUND for cross-org dissolve attempt", async () => {
    const orgA = await makeTestOrg();
    const orgB = await makeTestOrg();
    const adminA = await makeMember({ orgId: orgA, can_admin_org: true });
    const adminB = await makeMember({ orgId: orgB, can_admin_org: true });
    const hiveB = await createHiveDirectly({
      orgId: orgB,
      createdBy: adminB.entityId,
    });
    const r = await del(adminA, `/api/v1/org/hives/${hiveB}`);
    expect(r.statusCode).toBe(404);
    expect(r.body.code).toBe("HIVE_NOT_FOUND");
    // Verify orgB's hive remained ACTIVE.
    const row = await prisma.hive.findUnique({ where: { hive_id: hiveB } });
    expect(row?.status).toBe("ACTIVE");
  });
});

describe("Section 3 Wave 3 — force-remove (DELETE /api/v1/org/hives/:id/member/:entityId)", () => {
  it("admin force-remove flips membership ACTIVE → REMOVED + emits HIVE_MEMBER_REMOVED audit with admin discriminators", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    const member = await makeMember({ orgId });
    const hiveId = await createHiveDirectly({
      orgId,
      createdBy: admin.entityId,
    });
    await addMembership({ hiveId, entityId: member.entityId });
    const r = await del(
      admin,
      `/api/v1/org/hives/${hiveId}/member/${member.entityId}`,
    );
    expect(r.statusCode).toBe(200);
    expect(r.body.audit_event_id).toBeTruthy();
    // Creator membership (count=1) + addMembership (count=2) -
    // force-remove (count=1). Final state is creator-only.
    expect(r.body.member_count).toBe(1);
    const ms = await prisma.hiveMembership.findUnique({
      where: {
        hive_id_entity_id: { hive_id: hiveId, entity_id: member.entityId },
      },
    });
    expect(ms?.status).toBe("REMOVED");
    const audit = await prisma.auditEvent.findUnique({
      where: { audit_id: r.body.audit_event_id },
    });
    expect(audit?.event_type).toBe("HIVE_MEMBER_REMOVED");
    const details = audit?.details as {
      action?: string;
      actor_role?: string;
      hive_id?: string;
    };
    expect(details.action).toBe("HIVE_MEMBER_FORCE_REMOVED");
    expect(details.actor_role).toBe("ORG_ADMIN");
    expect(details.hive_id).toBe(hiveId);
  });

  it("404 MEMBERSHIP_NOT_FOUND for already-REMOVED member (enumeration-safe + idempotent)", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    const member = await makeMember({ orgId });
    const hiveId = await createHiveDirectly({
      orgId,
      createdBy: admin.entityId,
    });
    await addMembership({
      hiveId,
      entityId: member.entityId,
      status: "REMOVED",
    });
    const r = await del(
      admin,
      `/api/v1/org/hives/${hiveId}/member/${member.entityId}`,
    );
    expect(r.statusCode).toBe(404);
    expect(r.body.code).toBe("MEMBERSHIP_NOT_FOUND");
  });

  it("404 HIVE_NOT_FOUND for cross-org hive in force-remove URL", async () => {
    const orgA = await makeTestOrg();
    const orgB = await makeTestOrg();
    const adminA = await makeMember({ orgId: orgA, can_admin_org: true });
    const adminB = await makeMember({ orgId: orgB, can_admin_org: true });
    const memberB = await makeMember({ orgId: orgB });
    const hiveB = await createHiveDirectly({
      orgId: orgB,
      createdBy: adminB.entityId,
    });
    await addMembership({ hiveId: hiveB, entityId: memberB.entityId });
    const r = await del(
      adminA,
      `/api/v1/org/hives/${hiveB}/member/${memberB.entityId}`,
    );
    expect(r.statusCode).toBe(404);
    expect(r.body.code).toBe("HIVE_NOT_FOUND");
    // Verify orgB's membership remained ACTIVE.
    const ms = await prisma.hiveMembership.findUnique({
      where: {
        hive_id_entity_id: { hive_id: hiveB, entity_id: memberB.entityId },
      },
    });
    expect(ms?.status).toBe("ACTIVE");
  });

  it("AI_AGENT force-remove permitted at admin tier (ADR-0062 Sub-decision 4)", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    const aiAgent = await makeMember({ orgId, entity_type: "AI_AGENT" });
    const hiveId = await createHiveDirectly({
      orgId,
      createdBy: admin.entityId,
    });
    await addMembership({ hiveId, entityId: aiAgent.entityId });
    const r = await del(
      admin,
      `/api/v1/org/hives/${hiveId}/member/${aiAgent.entityId}`,
    );
    expect(r.statusCode).toBe(200);
    expect(r.body.audit_event_id).toBeTruthy();
    const ms = await prisma.hiveMembership.findUnique({
      where: {
        hive_id_entity_id: { hive_id: hiveId, entity_id: aiAgent.entityId },
      },
    });
    expect(ms?.status).toBe("REMOVED");
  });
});

describe("Section 3 Wave 3 — list/detail reads emit NO audit row", () => {
  it("GET list emits no audit row (Section 4 connector precedent)", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    await createHiveDirectly({ orgId, createdBy: admin.entityId });
    const before = await prisma.auditEvent.count({
      where: { actor_entity_id: admin.entityId },
    });
    const r = await get(admin, "/api/v1/org/hives");
    expect(r.statusCode).toBe(200);
    const after = await prisma.auditEvent.count({
      where: { actor_entity_id: admin.entityId },
    });
    expect(after).toBe(before);
  });

  it("GET detail emits no audit row", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    const hiveId = await createHiveDirectly({
      orgId,
      createdBy: admin.entityId,
    });
    const before = await prisma.auditEvent.count({
      where: { actor_entity_id: admin.entityId },
    });
    const r = await get(admin, `/api/v1/org/hives/${hiveId}`);
    expect(r.statusCode).toBe(200);
    const after = await prisma.auditEvent.count({
      where: { actor_entity_id: admin.entityId },
    });
    expect(after).toBe(before);
  });
});
