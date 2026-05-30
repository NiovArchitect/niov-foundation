// FILE: analytics-wave-2-correction-velocity.test.ts (integration)
// PURPOSE: Section 6 Wave 2 — Enterprise Analytics first
//          concrete aggregate (org-wide CORRECTION velocity
//          7d) contract coverage per ADR-0061. Verifies:
//          bearer + can_admin_org gate; same-org scoping;
//          orgless 404; k=5 minimum-population redacted
//          projection; above-threshold counts; time-window
//          enforcement; soft-deleted CORRECTION exclusion;
//          ADMIN_ACTION + ANALYTICS_READ audit emission;
//          SAFE projection (no raw correction content / no
//          per-entity attribution / no wallet internals);
//          no new audit literal.
// CONNECTS TO:
//   - apps/api/src/routes/analytics.routes.ts
//   - apps/api/src/services/analytics/analytics.service.ts
//   - ADR-0061 Section 6 Enterprise Analytics v1 SAFE Projection

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

const TEST_JWT_SECRET = "analytics-wave-2-test-secret";
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
  const ip = `10.96.${Math.floor(Math.random() * 200) + 1}.${
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

async function ensureWalletAndCorrectionCapsule(opts: {
  entityId: string;
  createdAt?: Date;
  deleted?: boolean;
  contentSecret?: string;
}): Promise<void> {
  let wallet = await prisma.wallet.findUnique({
    where: { entity_id: opts.entityId },
  });
  if (wallet === null) {
    wallet = await prisma.wallet.create({
      data: {
        wallet_id: randomUUID(),
        entity_id: opts.entityId,
        wallet_type: "PERSONAL",
        niov_can_access_contents: false,
      },
    });
  }
  await prisma.memoryCapsule.create({
    data: {
      capsule_id: randomUUID(),
      wallet_id: wallet.wallet_id,
      entity_id: opts.entityId,
      capsule_type: "CORRECTION",
      version: 1,
      content_hash: `${TEST_PREFIX}hash-${randomUUID()}`,
      storage_location: `${TEST_PREFIX}loc-${randomUUID()}`,
      payload_summary: opts.contentSecret ?? `${TEST_PREFIX}summary`,
      payload_size_tokens: 10,
      relevance_score: 1.0,
      decay_type: "PERMANENT",
      topic_tags: opts.contentSecret ? [opts.contentSecret] : [],
      clearance_required: 0,
      ai_access_blocked: false,
      requires_validation: false,
      ...(opts.createdAt ? { created_at: opts.createdAt } : {}),
      ...(opts.deleted ? { deleted_at: new Date() } : {}),
    },
  });
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

describe("Section 6 Wave 2 — analytics admin gate enforcement", () => {
  it("401 SESSION_INVALID without bearer", async () => {
    const r = await post(
      null,
      "/api/v1/analytics/correction-velocity",
      {},
    );
    expect(r.statusCode).toBe(401);
  });

  it("403 ADMIN_CAPABILITY_REQUIRED when caller lacks can_admin_org", async () => {
    const orgId = await makeTestOrg();
    const nonAdmin = await makeMember({ orgId, can_admin_org: false });
    const r = await post(
      nonAdmin,
      "/api/v1/analytics/correction-velocity",
      {},
    );
    expect(r.statusCode).toBe(403);
    expect(r.body.error).toBe("ADMIN_CAPABILITY_REQUIRED");
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
    const ip = `10.97.${Math.floor(Math.random() * 200) + 1}.${
      Math.floor(Math.random() * 254) + 1
    }`;
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: input.email,
        password,
        requested_operations: ["read"],
      },
      remoteAddress: ip,
    });
    const body = login.json() as { token: string };
    const r = await post(
      { token: body.token, ip },
      "/api/v1/analytics/correction-velocity",
      {},
    );
    expect(r.statusCode).toBe(404);
    expect(r.body.code).toBe("NO_ORG_FOR_CALLER");
  });
});

describe("Section 6 Wave 2 — k=5 minimum-population gate", () => {
  it("returns SAFE redacted projection when org has < 5 members", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    // Org has 1 active member (the admin). Below k=5.
    const r = await post(admin, "/api/v1/analytics/correction-velocity", {});
    expect(r.statusCode).toBe(200);
    expect(r.body.aggregate).toBe("CORRECTION_VELOCITY_7D");
    expect(r.body.member_count).toBe(1);
    expect(r.body.redacted).toBe(true);
    expect(r.body.correction_count).toBeNull();
    expect(r.body.signal_label).toBe("INSUFFICIENT_POPULATION");
    expect(r.body.honest_note).toContain("k=5");
  });

  it("returns non-redacted projection once member_count >= 5", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    // Add 4 more members to reach 5 total.
    for (let i = 0; i < 4; i++) {
      await makeMember({ orgId, can_admin_org: false });
    }
    const r = await post(admin, "/api/v1/analytics/correction-velocity", {});
    expect(r.statusCode).toBe(200);
    expect(r.body.member_count).toBe(5);
    expect(r.body.redacted).toBe(false);
    expect(typeof r.body.correction_count).toBe("number");
    expect(["ELEVATED", "TYPICAL", "QUIET"]).toContain(r.body.signal_label);
  });
});

describe("Section 6 Wave 2 — correction counting + window enforcement", () => {
  it("counts CORRECTION capsules inside the 7d window across member wallets", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    const members: Awaited<ReturnType<typeof makeMember>>[] = [];
    for (let i = 0; i < 4; i++) {
      members.push(await makeMember({ orgId, can_admin_org: false }));
    }
    // Plant 3 recent corrections + 2 old corrections (outside
    // 7d window).
    await ensureWalletAndCorrectionCapsule({ entityId: members[0]!.entityId });
    await ensureWalletAndCorrectionCapsule({ entityId: members[1]!.entityId });
    await ensureWalletAndCorrectionCapsule({ entityId: members[2]!.entityId });
    const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    await ensureWalletAndCorrectionCapsule({
      entityId: members[0]!.entityId,
      createdAt: fortyDaysAgo,
    });
    await ensureWalletAndCorrectionCapsule({
      entityId: members[1]!.entityId,
      createdAt: fortyDaysAgo,
    });
    const r = await post(admin, "/api/v1/analytics/correction-velocity", {});
    expect(r.statusCode).toBe(200);
    expect(r.body.member_count).toBe(5);
    expect(r.body.redacted).toBe(false);
    expect(r.body.correction_count).toBe(3);
  });

  it("excludes soft-deleted CORRECTION capsules", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    const members: Awaited<ReturnType<typeof makeMember>>[] = [];
    for (let i = 0; i < 4; i++) {
      members.push(await makeMember({ orgId, can_admin_org: false }));
    }
    await ensureWalletAndCorrectionCapsule({ entityId: members[0]!.entityId });
    await ensureWalletAndCorrectionCapsule({
      entityId: members[1]!.entityId,
      deleted: true,
    });
    const r = await post(admin, "/api/v1/analytics/correction-velocity", {});
    expect(r.body.correction_count).toBe(1);
  });

  it("respects custom window_days within clamp range", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    for (let i = 0; i < 4; i++) {
      await makeMember({ orgId, can_admin_org: false });
    }
    const r = await post(admin, "/api/v1/analytics/correction-velocity", {
      window_days: 14,
    });
    expect(r.statusCode).toBe(200);
    expect(r.body.window_days).toBe(14);
  });
});

describe("Section 6 Wave 2 — input validation", () => {
  it("422 INVALID_REQUEST when window_days = 0", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    const r = await post(admin, "/api/v1/analytics/correction-velocity", {
      window_days: 0,
    });
    expect(r.statusCode).toBe(422);
    expect(r.body.code).toBe("INVALID_REQUEST");
    expect(r.body.invalid_fields).toContain("window_days");
  });

  it("422 INVALID_REQUEST when window_days > 30", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    const r = await post(admin, "/api/v1/analytics/correction-velocity", {
      window_days: 365,
    });
    expect(r.statusCode).toBe(422);
    expect(r.body.code).toBe("INVALID_REQUEST");
  });

  it("422 INVALID_REQUEST when window_days is non-integer", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    const r = await post(admin, "/api/v1/analytics/correction-velocity", {
      window_days: 7.5,
    });
    expect(r.statusCode).toBe(422);
  });
});

describe("Section 6 Wave 2 — same-org scoping", () => {
  it("org A admin's correction count NEVER includes org B corrections", async () => {
    const orgA = await makeTestOrg();
    const orgB = await makeTestOrg();
    const adminA = await makeMember({ orgId: orgA, can_admin_org: true });
    // Org B has 5 members + 5 corrections.
    for (let i = 0; i < 5; i++) {
      const memberB = await makeMember({ orgId: orgB, can_admin_org: false });
      await ensureWalletAndCorrectionCapsule({ entityId: memberB.entityId });
    }
    // Org A has admin alone — below k=5; redacted.
    const r = await post(adminA, "/api/v1/analytics/correction-velocity", {});
    expect(r.body.member_count).toBe(1);
    expect(r.body.redacted).toBe(true);
    expect(r.body.correction_count).toBeNull();
    // Now bring org A to 5 members but plant NO corrections in
    // org A. Counts MUST be 0 (org B's 5 corrections are
    // ignored).
    for (let i = 0; i < 4; i++) {
      await makeMember({ orgId: orgA, can_admin_org: false });
    }
    const r2 = await post(adminA, "/api/v1/analytics/correction-velocity", {});
    expect(r2.body.member_count).toBe(5);
    expect(r2.body.redacted).toBe(false);
    expect(r2.body.correction_count).toBe(0);
  });
});

describe("Section 6 Wave 2 — ADMIN_ACTION + ANALYTICS_READ audit emission", () => {
  it("emits ADMIN_ACTION audit with correct discriminator + redacted=true on below-threshold read", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    await post(admin, "/api/v1/analytics/correction-velocity", {});
    const audit = await prisma.auditEvent.findFirst({
      where: {
        event_type: "ADMIN_ACTION",
        actor_entity_id: admin.entityId,
      },
      orderBy: { timestamp: "desc" },
    });
    expect(audit).not.toBeNull();
    const details = audit?.details as {
      action?: string;
      aggregate?: string;
      org_entity_id?: string;
      redacted?: boolean;
    };
    expect(details.action).toBe("ANALYTICS_READ");
    expect(details.aggregate).toBe("CORRECTION_VELOCITY_7D");
    expect(details.org_entity_id).toBe(orgId);
    expect(details.redacted).toBe(true);
  });

  it("emits ADMIN_ACTION audit with redacted=false on above-threshold read", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    for (let i = 0; i < 4; i++) {
      await makeMember({ orgId, can_admin_org: false });
    }
    await post(admin, "/api/v1/analytics/correction-velocity", {});
    const audit = await prisma.auditEvent.findFirst({
      where: {
        event_type: "ADMIN_ACTION",
        actor_entity_id: admin.entityId,
      },
      orderBy: { timestamp: "desc" },
    });
    const details = audit?.details as { redacted?: boolean };
    expect(details.redacted).toBe(false);
  });
});

describe("Section 6 Wave 2 — SAFE projection no-leak", () => {
  it("response NEVER includes raw correction content / capsule IDs / wallet internals", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    const members: Awaited<ReturnType<typeof makeMember>>[] = [];
    for (let i = 0; i < 4; i++) {
      members.push(await makeMember({ orgId, can_admin_org: false }));
    }
    const SECRET_MARKER = "ANALYTICS_LEAK_DO_NOT_SURFACE";
    await ensureWalletAndCorrectionCapsule({
      entityId: members[0]!.entityId,
      contentSecret: SECRET_MARKER,
    });
    const r = await post(admin, "/api/v1/analytics/correction-velocity", {});
    expect(r.statusCode).toBe(200);
    expect(r.raw).not.toContain(SECRET_MARKER);
    expect(r.raw).not.toContain("storage_location");
    expect(r.raw).not.toContain("content_hash");
    expect(r.raw).not.toContain("payload");
    expect(r.raw).not.toContain("wallet_id");
    expect(r.raw).not.toContain("capsule_id");
    expect(r.raw).not.toContain("topic_tags");
  });

  it("audit details NEVER include raw correction content", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    const members: Awaited<ReturnType<typeof makeMember>>[] = [];
    for (let i = 0; i < 4; i++) {
      members.push(await makeMember({ orgId, can_admin_org: false }));
    }
    const SECRET_MARKER = "AUDIT_ANALYTICS_LEAK_MARKER";
    await ensureWalletAndCorrectionCapsule({
      entityId: members[0]!.entityId,
      contentSecret: SECRET_MARKER,
    });
    await post(admin, "/api/v1/analytics/correction-velocity", {});
    const audit = await prisma.auditEvent.findFirst({
      where: {
        event_type: "ADMIN_ACTION",
        actor_entity_id: admin.entityId,
      },
      orderBy: { timestamp: "desc" },
    });
    const serialized = JSON.stringify(audit?.details ?? {});
    expect(serialized).not.toContain(SECRET_MARKER);
  });
});

describe("Section 6 Wave 2 — no new audit literal", () => {
  it("no audit row with event_type containing 'ANALYTICS' substring", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    for (let i = 0; i < 4; i++) {
      await makeMember({ orgId, can_admin_org: false });
    }
    await post(admin, "/api/v1/analytics/correction-velocity", {});
    const rows = await prisma.auditEvent.findMany({
      where: { event_type: { contains: "ANALYTICS" } },
      select: { event_type: true },
    });
    expect(rows).toHaveLength(0);
  });
});
