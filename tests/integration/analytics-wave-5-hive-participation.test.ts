// FILE: analytics-wave-5-hive-participation.test.ts (integration)
// PURPOSE: Section 6 Wave 5 — fourth concrete analytics
//          aggregate (org-wide hive-participation rate +
//          closed-vocab signal label). Current-state snapshot
//          (no window).

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

const TEST_JWT_SECRET = "analytics-wave-5-test-secret";
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
  await refreshTARHash(entity.entity_id);
  const ip = `10.100.${Math.floor(Math.random() * 200) + 1}.${
    Math.floor(Math.random() * 254) + 1
  }`;
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

async function makeHiveWithMembers(opts: {
  orgEntityId: string;
  createdBy: string;
  memberEntityIds: string[];
  status?: "ACTIVE" | "DISSOLVED";
  memberStatus?: "ACTIVE" | "REMOVED";
}): Promise<string> {
  const hive = await prisma.hive.create({
    data: {
      hive_id: randomUUID(),
      hive_name: `${TEST_PREFIX}hive_${randomUUID()}`,
      created_by: opts.createdBy,
      hive_type: "ENTERPRISE",
      governance_terms: {},
      member_count: opts.memberEntityIds.length,
      status: opts.status ?? "ACTIVE",
      org_entity_id: opts.orgEntityId,
      is_default_enterprise: false,
    },
  });
  for (const memberId of opts.memberEntityIds) {
    await prisma.hiveMembership.create({
      data: {
        membership_id: randomUUID(),
        hive_id: hive.hive_id,
        entity_id: memberId,
        capsule_types_contributed: [],
        contribution_scope: "METADATA_ONLY",
        capsule_types_accessible: [],
        access_scope: "METADATA_ONLY",
        status: opts.memberStatus ?? "ACTIVE",
      },
    });
  }
  return hive.hive_id;
}

async function post(
  caller: { token: string; ip: string } | null,
  url: string,
  body: Record<string, unknown>,
): Promise<{ statusCode: number; body: any; raw: string }> {
  const r = await app.inject({
    method: "POST",
    url,
    headers:
      caller === null ? {} : { authorization: `Bearer ${caller.token}` },
    ...(caller === null ? {} : { remoteAddress: caller.ip }),
    payload: body,
  });
  return { statusCode: r.statusCode, body: r.json() as any, raw: r.body };
}

describe("Section 6 Wave 5 — hive-participation gates", () => {
  it("401 without bearer", async () => {
    const r = await post(null, "/api/v1/analytics/hive-participation", {});
    expect(r.statusCode).toBe(401);
  });

  it("403 without can_admin_org", async () => {
    const orgId = await makeTestOrg();
    const nonAdmin = await makeMember({ orgId, can_admin_org: false });
    const r = await post(
      nonAdmin,
      "/api/v1/analytics/hive-participation",
      {},
    );
    expect(r.statusCode).toBe(403);
  });

  it("INSUFFICIENT_POPULATION when member_count < 5", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    const r = await post(admin, "/api/v1/analytics/hive-participation", {});
    expect(r.body.signal_label).toBe("INSUFFICIENT_POPULATION");
    expect(r.body.redacted).toBe(true);
    expect(r.body.hive_count_active).toBeNull();
    expect(r.body.participation_rate).toBeNull();
  });
});

describe("Section 6 Wave 5 — closed-vocab signal labels", () => {
  it("NO_HIVES when org has zero active Hives", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    for (let i = 0; i < 4; i++) {
      await makeMember({ orgId, can_admin_org: false });
    }
    const r = await post(admin, "/api/v1/analytics/hive-participation", {});
    expect(r.body.signal_label).toBe("NO_HIVES");
    expect(r.body.hive_count_active).toBe(0);
    expect(r.body.participating_member_count).toBe(0);
    expect(r.body.participation_rate).toBe(0);
  });

  it("excludes DISSOLVED hives from hive_count_active", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    const memberIds: string[] = [];
    for (let i = 0; i < 4; i++) {
      const m = await makeMember({ orgId, can_admin_org: false });
      memberIds.push(m.entityId);
    }
    await makeHiveWithMembers({
      orgEntityId: orgId,
      createdBy: admin.entityId,
      memberEntityIds: [admin.entityId],
      status: "DISSOLVED",
    });
    const r = await post(admin, "/api/v1/analytics/hive-participation", {});
    expect(r.body.signal_label).toBe("NO_HIVES");
    expect(r.body.hive_count_active).toBe(0);
  });

  it("NARROW_PARTICIPATION when <20% of members in active Hives", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    const memberIds: string[] = [];
    for (let i = 0; i < 9; i++) {
      const m = await makeMember({ orgId, can_admin_org: false });
      memberIds.push(m.entityId);
    }
    // 10 total members; 1 in hive = 10% < 20%
    await makeHiveWithMembers({
      orgEntityId: orgId,
      createdBy: admin.entityId,
      memberEntityIds: [admin.entityId],
    });
    const r = await post(admin, "/api/v1/analytics/hive-participation", {});
    expect(r.body.member_count).toBe(10);
    expect(r.body.hive_count_active).toBe(1);
    expect(r.body.participating_member_count).toBe(1);
    expect(r.body.signal_label).toBe("NARROW_PARTICIPATION");
  });

  it("MODERATE_PARTICIPATION when 20-49% in active Hives", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    const memberIds: string[] = [];
    for (let i = 0; i < 9; i++) {
      const m = await makeMember({ orgId, can_admin_org: false });
      memberIds.push(m.entityId);
    }
    // 10 total members; 3 in hive = 30%
    await makeHiveWithMembers({
      orgEntityId: orgId,
      createdBy: admin.entityId,
      memberEntityIds: [admin.entityId, memberIds[0]!, memberIds[1]!],
    });
    const r = await post(admin, "/api/v1/analytics/hive-participation", {});
    expect(r.body.participating_member_count).toBe(3);
    expect(r.body.signal_label).toBe("MODERATE_PARTICIPATION");
  });

  it("BROAD_PARTICIPATION when >=50% in active Hives", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    const memberIds: string[] = [];
    for (let i = 0; i < 4; i++) {
      const m = await makeMember({ orgId, can_admin_org: false });
      memberIds.push(m.entityId);
    }
    // 5 total members; 5 in hive = 100%
    await makeHiveWithMembers({
      orgEntityId: orgId,
      createdBy: admin.entityId,
      memberEntityIds: [admin.entityId, ...memberIds],
    });
    const r = await post(admin, "/api/v1/analytics/hive-participation", {});
    expect(r.body.participating_member_count).toBe(5);
    expect(r.body.signal_label).toBe("BROAD_PARTICIPATION");
    expect(r.body.participation_rate).toBe(1);
  });

  it("counts DISTINCT members across multiple Hives (a member in 3 Hives counts once)", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    const memberIds: string[] = [];
    for (let i = 0; i < 4; i++) {
      const m = await makeMember({ orgId, can_admin_org: false });
      memberIds.push(m.entityId);
    }
    // 5 members total; admin in 3 separate Hives
    await makeHiveWithMembers({
      orgEntityId: orgId,
      createdBy: admin.entityId,
      memberEntityIds: [admin.entityId],
    });
    await makeHiveWithMembers({
      orgEntityId: orgId,
      createdBy: admin.entityId,
      memberEntityIds: [admin.entityId],
    });
    await makeHiveWithMembers({
      orgEntityId: orgId,
      createdBy: admin.entityId,
      memberEntityIds: [admin.entityId],
    });
    const r = await post(admin, "/api/v1/analytics/hive-participation", {});
    expect(r.body.hive_count_active).toBe(3);
    expect(r.body.participating_member_count).toBe(1);
  });

  it("excludes REMOVED memberships", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    const memberIds: string[] = [];
    for (let i = 0; i < 4; i++) {
      const m = await makeMember({ orgId, can_admin_org: false });
      memberIds.push(m.entityId);
    }
    await makeHiveWithMembers({
      orgEntityId: orgId,
      createdBy: admin.entityId,
      memberEntityIds: [admin.entityId, memberIds[0]!, memberIds[1]!],
      memberStatus: "REMOVED",
    });
    const r = await post(admin, "/api/v1/analytics/hive-participation", {});
    expect(r.body.participating_member_count).toBe(0);
  });
});

describe("Section 6 Wave 5 — same-org scoping", () => {
  it("org A Hives + memberships NEVER count for org B", async () => {
    const orgA = await makeTestOrg();
    const orgB = await makeTestOrg();
    const adminA = await makeMember({ orgId: orgA, can_admin_org: true });
    const adminB = await makeMember({ orgId: orgB, can_admin_org: true });
    const orgBMemberIds: string[] = [];
    for (let i = 0; i < 4; i++) {
      await makeMember({ orgId: orgA, can_admin_org: false });
      const m = await makeMember({ orgId: orgB, can_admin_org: false });
      orgBMemberIds.push(m.entityId);
    }
    await makeHiveWithMembers({
      orgEntityId: orgB,
      createdBy: adminB.entityId,
      memberEntityIds: [adminB.entityId, ...orgBMemberIds],
    });
    const r = await post(adminA, "/api/v1/analytics/hive-participation", {});
    expect(r.body.signal_label).toBe("NO_HIVES");
    expect(r.body.hive_count_active).toBe(0);
    expect(r.body.participating_member_count).toBe(0);
  });
});

describe("Section 6 Wave 5 — audit + no-leak", () => {
  it("emits ADMIN_ACTION + ANALYTICS_READ with HIVE_PARTICIPATION aggregate name", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    for (let i = 0; i < 4; i++) {
      await makeMember({ orgId, can_admin_org: false });
    }
    await post(admin, "/api/v1/analytics/hive-participation", {});
    const audit = await prisma.auditEvent.findFirst({
      where: {
        event_type: "ADMIN_ACTION",
        actor_entity_id: admin.entityId,
      },
      orderBy: { timestamp: "desc" },
    });
    const details = audit?.details as { action?: string; aggregate?: string };
    expect(details.action).toBe("ANALYTICS_READ");
    expect(details.aggregate).toBe("HIVE_PARTICIPATION");
  });

  it("response NEVER includes hive_id / member entity_id / hive_name / governance_terms", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    const memberIds: string[] = [];
    for (let i = 0; i < 4; i++) {
      const m = await makeMember({ orgId, can_admin_org: false });
      memberIds.push(m.entityId);
    }
    await makeHiveWithMembers({
      orgEntityId: orgId,
      createdBy: admin.entityId,
      memberEntityIds: [admin.entityId, memberIds[0]!],
    });
    const r = await post(admin, "/api/v1/analytics/hive-participation", {});
    expect(r.raw).not.toContain("hive_id");
    expect(r.raw).not.toContain("hive_name");
    expect(r.raw).not.toContain("governance_terms");
    expect(r.raw).not.toContain("membership_id");
    expect(r.raw).not.toContain("capsule_types_accessible");
    expect(r.raw).not.toContain("capsule_types_contributed");
    expect(r.raw).not.toContain(memberIds[0]!);
  });
});
