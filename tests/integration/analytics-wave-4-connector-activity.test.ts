// FILE: analytics-wave-4-connector-activity.test.ts (integration)
// PURPOSE: Section 6 Wave 4 — third concrete analytics
//          aggregate (org-wide connector-activity counts +
//          closed-vocab signal label).

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

const TEST_JWT_SECRET = "analytics-wave-4-test-secret";
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
  const ip = `10.99.${Math.floor(Math.random() * 200) + 1}.${
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

async function makeConnectorBinding(opts: {
  orgEntityId: string;
  createdByEntityId: string;
  enabled?: boolean;
  deleted?: boolean;
  secret?: string;
}): Promise<string> {
  const binding = await prisma.connectorBinding.create({
    data: {
      binding_id: randomUUID(),
      org_entity_id: opts.orgEntityId,
      type: "OUTBOUND_WEBHOOK",
      display_name: opts.secret ?? `${TEST_PREFIX}wh-${randomUUID()}`,
      config: { url: "https://example.test/hook" },
      ...(opts.secret ? { secret_ref: opts.secret } : {}),
      enabled: opts.enabled ?? true,
      created_by_entity_id: opts.createdByEntityId,
      ...(opts.deleted ? { deleted_at: new Date() } : {}),
    },
  });
  return binding.binding_id;
}

async function makeInvokeConnectorAttempt(opts: {
  orgEntityId: string;
  sourceEntityId: string;
  attemptEndedAt?: Date;
}): Promise<void> {
  const action = await prisma.action.create({
    data: {
      source_entity_id: opts.sourceEntityId,
      org_entity_id: opts.orgEntityId,
      action_type: "INVOKE_CONNECTOR",
      risk_tier: "LOW",
      policy_envelope: {},
      payload_summary: `${TEST_PREFIX}invoke`,
      payload_redacted: { kind: "invoke_connector" },
      idempotency_key: `ik-${TEST_PREFIX}${randomUUID()}`,
      status: "SUCCEEDED",
    },
  });
  await prisma.actionAttempt.create({
    data: {
      action_id: action.action_id,
      attempt_number: 1,
      ended_at: opts.attemptEndedAt ?? new Date(),
      outcome: "SUCCEEDED",
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

describe("Section 6 Wave 4 — connector-activity gates", () => {
  it("401 without bearer", async () => {
    const r = await post(null, "/api/v1/analytics/connector-activity", {});
    expect(r.statusCode).toBe(401);
  });

  it("403 without can_admin_org", async () => {
    const orgId = await makeTestOrg();
    const nonAdmin = await makeMember({ orgId, can_admin_org: false });
    const r = await post(
      nonAdmin,
      "/api/v1/analytics/connector-activity",
      {},
    );
    expect(r.statusCode).toBe(403);
  });

  it("INSUFFICIENT_POPULATION when member_count < 5", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    const r = await post(admin, "/api/v1/analytics/connector-activity", {});
    expect(r.body.signal_label).toBe("INSUFFICIENT_POPULATION");
    expect(r.body.redacted).toBe(true);
    expect(r.body.binding_count_active).toBeNull();
  });
});

describe("Section 6 Wave 4 — closed-vocab signal labels", () => {
  it("NOT_CONFIGURED when org has zero active bindings", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    for (let i = 0; i < 4; i++) {
      await makeMember({ orgId, can_admin_org: false });
    }
    const r = await post(admin, "/api/v1/analytics/connector-activity", {});
    expect(r.body.signal_label).toBe("NOT_CONFIGURED");
    expect(r.body.redacted).toBe(false);
    expect(r.body.binding_count_active).toBe(0);
    expect(r.body.binding_count_total).toBe(0);
    expect(r.body.invocation_count).toBe(0);
  });

  it("CONFIGURED_INACTIVE when bindings exist but no invocations", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    for (let i = 0; i < 4; i++) {
      await makeMember({ orgId, can_admin_org: false });
    }
    await makeConnectorBinding({
      orgEntityId: orgId,
      createdByEntityId: admin.entityId,
    });
    const r = await post(admin, "/api/v1/analytics/connector-activity", {});
    expect(r.body.signal_label).toBe("CONFIGURED_INACTIVE");
    expect(r.body.binding_count_active).toBe(1);
    expect(r.body.invocation_count).toBe(0);
  });

  it("ACTIVE when bindings exist + invocations in window", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    for (let i = 0; i < 4; i++) {
      await makeMember({ orgId, can_admin_org: false });
    }
    await makeConnectorBinding({
      orgEntityId: orgId,
      createdByEntityId: admin.entityId,
    });
    await makeInvokeConnectorAttempt({
      orgEntityId: orgId,
      sourceEntityId: admin.entityId,
    });
    const r = await post(admin, "/api/v1/analytics/connector-activity", {});
    expect(r.body.signal_label).toBe("ACTIVE");
    expect(r.body.binding_count_active).toBe(1);
    expect(r.body.invocation_count).toBe(1);
  });

  it("excludes disabled bindings from binding_count_active", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    for (let i = 0; i < 4; i++) {
      await makeMember({ orgId, can_admin_org: false });
    }
    await makeConnectorBinding({
      orgEntityId: orgId,
      createdByEntityId: admin.entityId,
      enabled: true,
    });
    await makeConnectorBinding({
      orgEntityId: orgId,
      createdByEntityId: admin.entityId,
      enabled: false,
    });
    const r = await post(admin, "/api/v1/analytics/connector-activity", {});
    expect(r.body.binding_count_active).toBe(1);
    expect(r.body.binding_count_total).toBe(2);
  });

  it("excludes soft-deleted bindings from both counts", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    for (let i = 0; i < 4; i++) {
      await makeMember({ orgId, can_admin_org: false });
    }
    await makeConnectorBinding({
      orgEntityId: orgId,
      createdByEntityId: admin.entityId,
    });
    await makeConnectorBinding({
      orgEntityId: orgId,
      createdByEntityId: admin.entityId,
      deleted: true,
    });
    const r = await post(admin, "/api/v1/analytics/connector-activity", {});
    expect(r.body.binding_count_total).toBe(1);
    expect(r.body.binding_count_active).toBe(1);
  });
});

describe("Section 6 Wave 4 — window enforcement + same-org scoping", () => {
  it("excludes invocations outside the window", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    for (let i = 0; i < 4; i++) {
      await makeMember({ orgId, can_admin_org: false });
    }
    await makeConnectorBinding({
      orgEntityId: orgId,
      createdByEntityId: admin.entityId,
    });
    await makeInvokeConnectorAttempt({
      orgEntityId: orgId,
      sourceEntityId: admin.entityId,
    });
    await makeInvokeConnectorAttempt({
      orgEntityId: orgId,
      sourceEntityId: admin.entityId,
      attemptEndedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
    });
    const r = await post(admin, "/api/v1/analytics/connector-activity", {});
    expect(r.body.invocation_count).toBe(1);
  });

  it("org A bindings/invocations NEVER counted for org B", async () => {
    const orgA = await makeTestOrg();
    const orgB = await makeTestOrg();
    const adminA = await makeMember({ orgId: orgA, can_admin_org: true });
    const adminB = await makeMember({ orgId: orgB, can_admin_org: true });
    for (let i = 0; i < 4; i++) {
      await makeMember({ orgId: orgA, can_admin_org: false });
      await makeMember({ orgId: orgB, can_admin_org: false });
    }
    // Org B has bindings + invocations. Org A has nothing.
    await makeConnectorBinding({
      orgEntityId: orgB,
      createdByEntityId: adminB.entityId,
    });
    await makeInvokeConnectorAttempt({
      orgEntityId: orgB,
      sourceEntityId: adminB.entityId,
    });
    const r = await post(adminA, "/api/v1/analytics/connector-activity", {});
    expect(r.body.binding_count_active).toBe(0);
    expect(r.body.invocation_count).toBe(0);
    expect(r.body.signal_label).toBe("NOT_CONFIGURED");
  });
});

describe("Section 6 Wave 4 — audit + no-leak", () => {
  it("emits ADMIN_ACTION + ANALYTICS_READ with CONNECTOR_ACTIVITY aggregate name", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    for (let i = 0; i < 4; i++) {
      await makeMember({ orgId, can_admin_org: false });
    }
    await post(admin, "/api/v1/analytics/connector-activity", {});
    const audit = await prisma.auditEvent.findFirst({
      where: {
        event_type: "ADMIN_ACTION",
        actor_entity_id: admin.entityId,
      },
      orderBy: { timestamp: "desc" },
    });
    const details = audit?.details as { action?: string; aggregate?: string };
    expect(details.action).toBe("ANALYTICS_READ");
    expect(details.aggregate).toBe("CONNECTOR_ACTIVITY");
  });

  it("response NEVER includes binding_id / display_name / secret_ref / config", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    for (let i = 0; i < 4; i++) {
      await makeMember({ orgId, can_admin_org: false });
    }
    const SECRET = "WAVE_4_CONNECTOR_LEAK_MARKER";
    await makeConnectorBinding({
      orgEntityId: orgId,
      createdByEntityId: admin.entityId,
      secret: SECRET,
    });
    const r = await post(admin, "/api/v1/analytics/connector-activity", {});
    expect(r.raw).not.toContain(SECRET);
    expect(r.raw).not.toContain("binding_id");
    expect(r.raw).not.toContain("display_name");
    expect(r.raw).not.toContain("secret_ref");
    expect(r.raw).not.toContain("config");
    expect(r.raw).not.toContain("created_by_entity_id");
  });
});
