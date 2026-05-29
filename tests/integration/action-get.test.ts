// FILE: action-get.test.ts (integration)
// PURPOSE: HTTP coverage for GET /api/v1/actions/:id per ADR-0057
//          §9 viewer route. Verifies bearer + read gate, self-scope
//          access, can_admin_org cross-scope access, RULE 0
//          enumeration-prevention 404 for non-admin strangers,
//          attempt_count + last_result_summary aggregates after the
//          executor runs, no-leak guarantees for the forbidden-fields
//          set, and the standard 400 / 404 envelopes.
// CONNECTS TO:
//   - apps/api/src/routes/actions.routes.ts (the LIVE route)
//   - apps/api/src/services/action/get.service.ts (the service)
//   - apps/api/src/services/action/scheduler.ts +
//     apps/api/src/services/action/executor.ts (drive a SUCCEEDED
//     attempt + ActionResult so the aggregates are non-zero)
//   - packages/database (prisma.* for fixtures + assertions)

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

const TEST_JWT_SECRET = "action-get-test-secret-do-not-use-in-prod";
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
  const ip = `10.80.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 254) + 1}`;
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
        action_type: "RECORD_CAPSULE",
        risk_tier: "LOW",
      },
    },
    create: {
      org_entity_id: orgEntityId,
      action_type: "RECORD_CAPSULE",
      risk_tier: "LOW",
      default_decision: "AUTO_APPROVE",
      require_admin_capability: null,
      updated_by,
    },
    update: { default_decision: "AUTO_APPROVE", updated_by },
  });
}

async function createApprovedAction(caller: {
  token: string;
  ip: string;
}): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/actions",
    headers: { authorization: `Bearer ${caller.token}` },
    payload: {
      action_type: "RECORD_CAPSULE",
      idempotency_key: `ik-${randomUUID()}`,
      payload_summary: "test-summary-secret",
      payload_redacted: { kind: "capsule", title: "secret-title" },
    },
    remoteAddress: caller.ip,
  });
  if (response.statusCode !== 200) {
    throw new Error(`create failed: ${response.statusCode} ${response.body}`);
  }
  const body = response.json() as { action: { action_id: string } };
  return body.action.action_id;
}

async function getAction(
  caller: { token: string; ip: string },
  actionId: string,
): Promise<{ statusCode: number; body: unknown; rawBody: string }> {
  const response = await app.inject({
    method: "GET",
    url: `/api/v1/actions/${actionId}`,
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
  "secret-title",
  "test-summary-secret",
];

describe("GET /api/v1/actions/:id — auth + envelopes", () => {
  it("401 SESSION_INVALID when bearer is missing", async () => {
    const r = await app.inject({
      method: "GET",
      url: `/api/v1/actions/${randomUUID()}`,
    });
    expect(r.statusCode).toBe(401);
    expect((r.json() as { code: string }).code).toBe("SESSION_INVALID");
  });

  it("400 INVALID_ACTION_ID when path id is not a UUID", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({ orgId });
    const r = await getAction(caller, "not-a-uuid");
    expect(r.statusCode).toBe(400);
    expect((r.body as { code: string }).code).toBe("INVALID_ACTION_ID");
  });

  it("404 ACTION_NOT_FOUND for unknown action_id", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({ orgId });
    const r = await getAction(caller, randomUUID());
    expect(r.statusCode).toBe(404);
    expect((r.body as { code: string }).code).toBe("ACTION_NOT_FOUND");
  });
});

describe("GET /api/v1/actions/:id — self-scope happy path + safe view", () => {
  it("source caller reads APPROVED row with attempt_count=0 + last_result_summary=null + no leak", async () => {
    const orgId = await makeTestOrg();
    const owner = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    await seedAutoApprovePolicy(orgId, owner.entityId);
    const actionId = await createApprovedAction(owner);

    const r = await getAction(owner, actionId);
    expect(r.statusCode).toBe(200);
    const b = r.body as {
      ok: true;
      action: {
        action_id: string;
        status: string;
        action_type: string;
        risk_tier: string;
        attempt_count: number;
        last_result_summary: string | null;
      };
    };
    expect(b.ok).toBe(true);
    expect(b.action.action_id).toBe(actionId);
    expect(b.action.status).toBe("APPROVED");
    expect(b.action.action_type).toBe("RECORD_CAPSULE");
    expect(b.action.risk_tier).toBe("LOW");
    expect(b.action.attempt_count).toBe(0);
    expect(b.action.last_result_summary).toBe(null);
    // No-leak: response excludes every forbidden token + every
    // payload-derived value.
    for (const forbidden of FORBIDDEN_TOKENS) {
      expect(r.rawBody.includes(forbidden)).toBe(false);
    }
  });

  it("source caller reads SUCCEEDED row with attempt_count=1 + last_result_summary populated after executor", async () => {
    const orgId = await makeTestOrg();
    const owner = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    await seedAutoApprovePolicy(orgId, owner.entityId);
    const actionId = await createApprovedAction(owner);
    await tickActionScheduler();
    await tickActionExecutor({
      workerId: "test-get-worker",
      attemptTimeoutMs: 1_000,
    });

    const r = await getAction(owner, actionId);
    expect(r.statusCode).toBe(200);
    const b = r.body as {
      ok: true;
      action: {
        status: string;
        attempt_count: number;
        last_result_summary: string | null;
      };
    };
    expect(b.action.status).toBe("SUCCEEDED");
    expect(b.action.attempt_count).toBe(1);
    expect(b.action.last_result_summary).toBe("stub_record_capsule_ok");
    for (const forbidden of FORBIDDEN_TOKENS) {
      expect(r.rawBody.includes(forbidden)).toBe(false);
    }
  });
});

describe("GET /api/v1/actions/:id — authorization scoping", () => {
  it("non-source non-admin caller in same org gets 404 (RULE 0 enumeration-prevention)", async () => {
    const orgId = await makeTestOrg();
    const owner = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    const stranger = await makeOrgMember({ orgId });
    await seedAutoApprovePolicy(orgId, owner.entityId);
    const actionId = await createApprovedAction(owner);

    const r = await getAction(stranger, actionId);
    // Per the service's RULE 0 enumeration-prevention contract, the
    // stranger sees the same 404 the unknown-id branch produces.
    expect(r.statusCode).toBe(404);
    expect((r.body as { code: string }).code).toBe("ACTION_NOT_FOUND");
  });

  it("can_admin_org caller in same org reads the row (admin cross-scope)", async () => {
    const orgId = await makeTestOrg();
    const owner = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    const admin = await makeOrgMember({ orgId, can_admin_org: true });
    await seedAutoApprovePolicy(orgId, owner.entityId);
    const actionId = await createApprovedAction(owner);

    const r = await getAction(admin, actionId);
    expect(r.statusCode).toBe(200);
    const b = r.body as { action: { action_id: string; status: string } };
    expect(b.action.action_id).toBe(actionId);
    expect(b.action.status).toBe("APPROVED");
    // Still no leak even on the admin path.
    for (const forbidden of FORBIDDEN_TOKENS) {
      expect(r.rawBody.includes(forbidden)).toBe(false);
    }
  });

  it("can_admin_org caller in a DIFFERENT org gets 404 (cross-org enumeration-prevention)", async () => {
    const orgA = await makeTestOrg();
    const orgB = await makeTestOrg();
    const ownerA = await makeOrgMember({
      orgId: orgA,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    const adminB = await makeOrgMember({ orgId: orgB, can_admin_org: true });
    await seedAutoApprovePolicy(orgA, ownerA.entityId);
    const actionId = await createApprovedAction(ownerA);

    const r = await getAction(adminB, actionId);
    expect(r.statusCode).toBe(404);
    expect((r.body as { code: string }).code).toBe("ACTION_NOT_FOUND");
  });
});

describe("GET /api/v1/actions/:id — soft-delete + terminal aggregates", () => {
  it("soft-deleted Action returns 404", async () => {
    const orgId = await makeTestOrg();
    const owner = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    await seedAutoApprovePolicy(orgId, owner.entityId);
    const actionId = await createApprovedAction(owner);
    await prisma.action.update({
      where: { action_id: actionId },
      data: { deleted_at: new Date() },
    });

    const r = await getAction(owner, actionId);
    expect(r.statusCode).toBe(404);
  });
});
