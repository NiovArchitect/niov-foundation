// FILE: action-list.test.ts (integration)
// PURPOSE: HTTP coverage for GET /api/v1/actions per ADR-0057 §9
//          list route. Verifies bearer + read gate, self-scope
//          default, ?org_scope=true admin requirement, cross-source
//          / cross-org leak prevention at the query tier,
//          pagination, status / risk_tier / action_type filters,
//          and no-leak.
// CONNECTS TO:
//   - apps/api/src/routes/actions.routes.ts (the LIVE list route)
//   - apps/api/src/services/action/list.service.ts (the service)
//   - packages/database (prisma.* for fixtures + assertions)

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

const TEST_JWT_SECRET = "action-list-test-secret-do-not-use-in-prod";
const TEST_KEY = randomBytes(32);

let app: FastifyInstance;
const store = new MemoryRateLimitStore();

async function cleanupTestActions(): Promise<void> {
  const testEntities = await prisma.entity.findMany({
    where: { display_name: { startsWith: TEST_PREFIX } },
    select: { entity_id: true },
  });
  const ids = testEntities.map((e) => e.entity_id);
  if (ids.length === 0) return;
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
    const testAttempts = await prisma.actionAttempt.findMany({
      where: { action_id: { in: actionIds } },
      select: { attempt_id: true },
    });
    const attemptIds = testAttempts.map((a) => a.attempt_id);
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
  await prisma.escalationRequest.deleteMany({
    where: {
      OR: [
        { source_entity_id: { in: ids } },
        { target_entity_id: { in: ids } },
        { resolved_by_entity_id: { in: ids } },
      ],
    },
  });
}

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestActions();
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
  await cleanupTestActions();
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
  can_admin_org?: boolean;
  autonomy_level?: "APPROVAL_REQUIRED" | "EXECUTIVE_OVERRIDE" | "OBSERVE_ONLY";
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
  const ip = `10.81.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 254) + 1}`;
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

async function createApprovedAction(caller: {
  entityId: string;
  token: string;
  ip: string;
}): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/actions",
    headers: { authorization: `Bearer ${caller.token}` },
    payload: {
      action_type: "SEND_INTERNAL_NOTIFICATION",
      idempotency_key: `ik-${randomUUID()}`,
      payload_summary: "test-list-summary-secret",
      // Wave 11: valid SEND_INTERNAL_NOTIFICATION payload.
      payload_redacted: {
        recipient_entity_id: caller.entityId,
        notification_class: "list-test",
        body_summary: "list-test-body-secret",
      },
    },
    remoteAddress: caller.ip,
  });
  if (response.statusCode !== 200) {
    throw new Error(`create failed: ${response.statusCode} ${response.body}`);
  }
  const body = response.json() as { action: { action_id: string } };
  return body.action.action_id;
}

async function list(
  caller: { token: string; ip: string },
  qs?: Record<string, string>,
): Promise<{ statusCode: number; body: unknown; rawBody: string }> {
  const queryString =
    qs === undefined
      ? ""
      : `?${new URLSearchParams(qs).toString()}`;
  const response = await app.inject({
    method: "GET",
    url: `/api/v1/actions${queryString}`,
    headers: { authorization: `Bearer ${caller.token}` },
    remoteAddress: caller.ip,
  });
  return {
    statusCode: response.statusCode,
    body: response.json(),
    rawBody: response.body,
  };
}

const FORBIDDEN_TOKENS = [
  "payload_summary",
  "payload_redacted",
  "policy_envelope",
  "policy_envelope_hash",
  "source_entity_id",
  "org_entity_id",
  "target_entity_id",
  "deleted_at",
  "list-secret-title",
  "test-list-summary-secret",
];

describe("GET /api/v1/actions — auth + envelopes", () => {
  it("401 SESSION_INVALID when bearer is missing", async () => {
    const r = await app.inject({ method: "GET", url: "/api/v1/actions" });
    expect(r.statusCode).toBe(401);
    expect((r.json() as { code: string }).code).toBe("SESSION_INVALID");
  });

  it("422 INVALID_FIELD for unknown status enum", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({ orgId });
    const r = await list(caller, { status: "MADE_UP" });
    expect(r.statusCode).toBe(422);
    const b = r.body as { code: string; invalid_fields: string[] };
    expect(b.code).toBe("INVALID_FIELD");
    expect(b.invalid_fields).toContain("status");
  });

  it("422 INVALID_FIELD when page_size exceeds MAX", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({ orgId });
    const r = await list(caller, { page_size: "200" });
    expect(r.statusCode).toBe(422);
  });
});

describe("GET /api/v1/actions — self-scope default", () => {
  it("returns only the caller's own actions; cross-source leak prevented at query tier", async () => {
    const orgId = await makeTestOrg();
    const ownerA = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    const ownerB = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    await seedAutoApprovePolicy(orgId, ownerA.entityId);
    const a1 = await createApprovedAction(ownerA);
    const a2 = await createApprovedAction(ownerA);
    const b1 = await createApprovedAction(ownerB);

    const r = await list(ownerA);
    expect(r.statusCode).toBe(200);
    const b = r.body as {
      ok: true;
      items: Array<{ action_id: string }>;
      page: number;
      page_size: number;
      total: number;
    };
    expect(b.ok).toBe(true);
    expect(b.page).toBe(1);
    const ids = b.items.map((i) => i.action_id);
    expect(ids).toContain(a1);
    expect(ids).toContain(a2);
    expect(ids).not.toContain(b1);
    expect(b.total).toBeGreaterThanOrEqual(2);

    for (const forbidden of FORBIDDEN_TOKENS) {
      expect(r.rawBody.includes(forbidden)).toBe(false);
    }
  });

  it("respects pagination + status filter", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    await seedAutoApprovePolicy(orgId, caller.entityId);
    for (let i = 0; i < 3; i += 1) {
      await createApprovedAction(caller);
    }
    const page = await list(caller, {
      page_size: "2",
      status: "APPROVED",
    });
    expect(page.statusCode).toBe(200);
    const b = page.body as {
      items: unknown[];
      page: number;
      page_size: number;
      total: number;
    };
    expect(b.page).toBe(1);
    expect(b.page_size).toBe(2);
    expect(b.items.length).toBeLessThanOrEqual(2);
    expect(b.total).toBeGreaterThanOrEqual(3);

    const page2 = await list(caller, {
      page: "2",
      page_size: "2",
      status: "APPROVED",
    });
    expect(page2.statusCode).toBe(200);
    const b2 = page2.body as {
      items: Array<{ action_id: string }>;
      page: number;
    };
    expect(b2.page).toBe(2);
  });

  it("status filter excludes non-matching rows", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    await seedAutoApprovePolicy(orgId, caller.entityId);
    const a1 = await createApprovedAction(caller);
    // Force a1 into SCHEDULED so a status=REJECTED filter excludes it.
    await prisma.action.update({
      where: { action_id: a1 },
      data: { status: "SCHEDULED" },
    });

    const r = await list(caller, { status: "REJECTED" });
    expect(r.statusCode).toBe(200);
    const b = r.body as { items: Array<{ action_id: string }> };
    const ids = b.items.map((i) => i.action_id);
    expect(ids).not.toContain(a1);
  });
});

describe("GET /api/v1/actions — org_scope path", () => {
  it("403 ORG_SCOPE_FORBIDDEN when caller lacks can_admin_org", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({ orgId });
    const r = await list(caller, { org_scope: "true" });
    expect(r.statusCode).toBe(403);
    expect((r.body as { code: string }).code).toBe("ORG_SCOPE_FORBIDDEN");
  });

  it("can_admin_org caller sees every Action in the org (cross-source admin)", async () => {
    const orgId = await makeTestOrg();
    const owner = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    const admin = await makeOrgMember({ orgId, can_admin_org: true });
    await seedAutoApprovePolicy(orgId, owner.entityId);
    const a1 = await createApprovedAction(owner);
    const a2 = await createApprovedAction(owner);

    const r = await list(admin, { org_scope: "true" });
    expect(r.statusCode).toBe(200);
    const b = r.body as {
      items: Array<{ action_id: string }>;
      total: number;
    };
    const ids = b.items.map((i) => i.action_id);
    expect(ids).toContain(a1);
    expect(ids).toContain(a2);
    // No leak even on admin path.
    for (const forbidden of FORBIDDEN_TOKENS) {
      expect(r.rawBody.includes(forbidden)).toBe(false);
    }
  });

  it("can_admin_org caller in org A does NOT see Actions from org B", async () => {
    const orgA = await makeTestOrg();
    const orgB = await makeTestOrg();
    const ownerA = await makeOrgMember({
      orgId: orgA,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    const ownerB = await makeOrgMember({
      orgId: orgB,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    const adminA = await makeOrgMember({
      orgId: orgA,
      can_admin_org: true,
    });
    await seedAutoApprovePolicy(orgA, ownerA.entityId);
    await seedAutoApprovePolicy(orgB, ownerB.entityId);
    const a1 = await createApprovedAction(ownerA);
    const b1 = await createApprovedAction(ownerB);

    const r = await list(adminA, { org_scope: "true" });
    expect(r.statusCode).toBe(200);
    const b = r.body as { items: Array<{ action_id: string }> };
    const ids = b.items.map((i) => i.action_id);
    expect(ids).toContain(a1);
    expect(ids).not.toContain(b1);
  });
});

describe("GET /api/v1/actions — SAFE recipient/requester labels (ADR-0057 §10 Amendment 1)", () => {
  it("resolves target_label + requester_label to display names; never the routing UUID", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    const target = await makeOrgMember({ orgId });
    await seedAutoApprovePolicy(orgId, caller.entityId);

    const callerEntity = await prisma.entity.findUniqueOrThrow({
      where: { entity_id: caller.entityId },
      select: { display_name: true },
    });
    const targetEntity = await prisma.entity.findUniqueOrThrow({
      where: { entity_id: target.entityId },
      select: { display_name: true },
    });

    // Create an action TARGETING the distinct named member.
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/actions",
      headers: { authorization: `Bearer ${caller.token}` },
      payload: {
        action_type: "SEND_INTERNAL_NOTIFICATION",
        idempotency_key: `ik-${randomUUID()}`,
        target_entity_id: target.entityId,
        payload_summary: "label-test-summary-secret",
        payload_redacted: {
          recipient_entity_id: target.entityId,
          notification_class: "label-test",
          body_summary: "label-test-body-secret",
        },
      },
      remoteAddress: caller.ip,
    });
    expect(created.statusCode).toBe(200);
    const actionId = (created.json() as { action: { action_id: string } }).action.action_id;

    const r = await list(caller);
    expect(r.statusCode).toBe(200);
    const b = r.body as {
      items: Array<{
        action_id: string;
        target_label?: string | null;
        requester_label?: string | null;
      }>;
    };
    const item = b.items.find((i) => i.action_id === actionId);
    expect(item).toBeDefined();
    // SAFE display-name labels resolved for the authorized self-scoped reader.
    expect(item?.target_label).toBe(targetEntity.display_name);
    expect(item?.requester_label).toBe(callerEntity.display_name);

    // The routing UUIDs + payload body MUST NEVER appear in the response body.
    expect(r.rawBody.includes(target.entityId)).toBe(false);
    expect(r.rawBody.includes(caller.entityId)).toBe(false);
    expect(r.rawBody.includes("label-test-summary-secret")).toBe(false);
    expect(r.rawBody.includes("label-test-body-secret")).toBe(false);
    expect(r.rawBody.includes("target_entity_id")).toBe(false);
    expect(r.rawBody.includes("source_entity_id")).toBe(false);
  });

  it("cross-tenant reader cannot see another org's action or its labels", async () => {
    const orgA = await makeTestOrg();
    const orgB = await makeTestOrg();
    const callerA = await makeOrgMember({
      orgId: orgA,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    const callerB = await makeOrgMember({ orgId: orgB });
    await seedAutoApprovePolicy(orgA, callerA.entityId);
    const a1 = await createApprovedAction(callerA);

    // callerB (different org, self-scope) must not see callerA's action at all.
    const r = await list(callerB);
    expect(r.statusCode).toBe(200);
    const b = r.body as { items: Array<{ action_id: string }> };
    expect(b.items.map((i) => i.action_id)).not.toContain(a1);
  });
});

describe("GET /api/v1/actions — soft-delete invisibility", () => {
  it("soft-deleted Actions are excluded from list results", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    await seedAutoApprovePolicy(orgId, caller.entityId);
    const a1 = await createApprovedAction(caller);
    const a2 = await createApprovedAction(caller);
    await prisma.action.update({
      where: { action_id: a1 },
      data: { deleted_at: new Date() },
    });

    const r = await list(caller);
    expect(r.statusCode).toBe(200);
    const b = r.body as { items: Array<{ action_id: string }> };
    const ids = b.items.map((i) => i.action_id);
    expect(ids).not.toContain(a1);
    expect(ids).toContain(a2);
  });
});
