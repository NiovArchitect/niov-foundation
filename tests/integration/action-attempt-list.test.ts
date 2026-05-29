// FILE: action-attempt-list.test.ts (integration)
// PURPOSE: HTTP coverage for the ADR-0057 Wave 10
//          `GET /api/v1/actions/:id/attempts` paginated list route.
//          Verifies bearer + read gate; ownership / admin scoping
//          (mirrors PR #39 detail-route spine); cross-org
//          enumeration-prevention; soft-delete invisibility;
//          outcome filter; page envelope shape; sort order
//          (attempt_number ASC); per-row no-leak across forbidden
//          tokens; timeout_ms surfacing per Wave 8.
// CONNECTS TO:
//   - apps/api/src/routes/actions.routes.ts (Wave 10 list route)
//   - apps/api/src/services/action/attempt-list.service.ts
//   - apps/api/src/services/action/attempt.service.ts
//     (SafeActionAttemptView projection)

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildApp,
  MemoryContentStore,
  MemoryNonceStore,
  MemoryRateLimitStore,
  TEST_MARKER_FORCE_FAILURE,
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

const TEST_JWT_SECRET = "attempt-list-test-secret";
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

const SECRET_SUMMARY = "ATTEMPT_LIST_SECRET_SUMMARY";
const SECRET_REDACTED_TITLE = "ATTEMPT_LIST_SECRET_TITLE";

async function postCreate(
  caller: { token: string; ip: string },
  payload_redacted: Record<string, unknown> = {
    kind: "notification",
    title: SECRET_REDACTED_TITLE,
  },
): Promise<string> {
  const r = await app.inject({
    method: "POST",
    url: "/api/v1/actions",
    headers: { authorization: `Bearer ${caller.token}` },
    payload: {
      action_type: "SEND_INTERNAL_NOTIFICATION",
      idempotency_key: `ik-${randomUUID()}`,
      payload_summary: SECRET_SUMMARY,
      payload_redacted,
    },
    remoteAddress: caller.ip,
  });
  if (r.statusCode !== 200) throw new Error(`create failed: ${r.statusCode}`);
  return (r.json() as { action: { action_id: string } }).action.action_id;
}

async function runOnceSuccess(): Promise<void> {
  await tickActionScheduler();
  await tickActionExecutor({
    workerId: "test-attempt-list-worker",
    attemptTimeoutMs: 2_000,
  });
}

async function runOnceFailingThreeAttempts(): Promise<void> {
  // FORCE_FAILURE marker drives the retry loop up to the default
  // SEND_INTERNAL_NOTIFICATION budget (3) in one executor tick.
  await tickActionScheduler();
  await tickActionExecutor({
    workerId: "test-attempt-list-worker-fail",
    attemptTimeoutMs: 1_000,
  });
}

async function listAttempts(
  caller: { token: string; ip: string },
  actionId: string,
  query: string = "",
): Promise<{ statusCode: number; body: unknown; raw: string }> {
  const r = await app.inject({
    method: "GET",
    url: `/api/v1/actions/${actionId}/attempts${query}`,
    headers: { authorization: `Bearer ${caller.token}` },
    remoteAddress: caller.ip,
  });
  return { statusCode: r.statusCode, body: r.json(), raw: r.body };
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
  SECRET_SUMMARY,
  SECRET_REDACTED_TITLE,
];

describe("GET /api/v1/actions/:id/attempts — auth + envelopes", () => {
  it("400 INVALID_ACTION_ID when action_id is not a UUID", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    const r = await listAttempts(caller, "not-a-uuid");
    expect(r.statusCode).toBe(400);
    expect((r.body as { code: string }).code).toBe("INVALID_ACTION_ID");
  });

  it("404 ACTION_NOT_FOUND for unknown action_id", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    const r = await listAttempts(caller, "11111111-1111-1111-8111-111111111111");
    expect(r.statusCode).toBe(404);
    expect((r.body as { code: string }).code).toBe("ACTION_NOT_FOUND");
  });

  it("422 INVALID_FIELD on bogus page", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    await seedAutoApprovePolicy(orgId, caller.entityId);
    const actionId = await postCreate(caller);
    await runOnceSuccess();
    const r = await listAttempts(caller, actionId, "?page=abc");
    expect(r.statusCode).toBe(422);
    const b = r.body as { code: string; invalid_fields: string[] };
    expect(b.code).toBe("INVALID_FIELD");
    expect(b.invalid_fields).toContain("page");
  });

  it("422 INVALID_FIELD on page_size above MAX cap", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    await seedAutoApprovePolicy(orgId, caller.entityId);
    const actionId = await postCreate(caller);
    await runOnceSuccess();
    const r = await listAttempts(caller, actionId, "?page_size=999");
    expect(r.statusCode).toBe(422);
    expect((r.body as { invalid_fields: string[] }).invalid_fields).toContain(
      "page_size",
    );
  });

  it("422 INVALID_FIELD on unknown outcome value", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    await seedAutoApprovePolicy(orgId, caller.entityId);
    const actionId = await postCreate(caller);
    await runOnceSuccess();
    const r = await listAttempts(caller, actionId, "?outcome=MADE_UP");
    expect(r.statusCode).toBe(422);
    expect((r.body as { invalid_fields: string[] }).invalid_fields).toContain(
      "outcome",
    );
  });
});

describe("GET /api/v1/actions/:id/attempts — happy paths", () => {
  it("source caller reads attempts ordered by attempt_number ASC with full no-leak per row", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    await seedAutoApprovePolicy(orgId, caller.entityId);
    const actionId = await postCreate(caller, {
      [TEST_MARKER_FORCE_FAILURE]: true,
    });
    await runOnceFailingThreeAttempts();
    const r = await listAttempts(caller, actionId);
    expect(r.statusCode).toBe(200);
    const b = r.body as {
      ok: true;
      action_id: string;
      page: number;
      page_size: number;
      total: number;
      attempts: Array<{
        attempt_id: string;
        action_id: string;
        attempt_number: number;
        outcome: string | null;
        timeout_ms: number | null;
      }>;
    };
    expect(b.ok).toBe(true);
    expect(b.action_id).toBe(actionId);
    expect(b.page).toBe(1);
    expect(b.total).toBe(3);
    expect(b.attempts.length).toBe(3);
    // ASC sort.
    expect(b.attempts[0]?.attempt_number).toBe(1);
    expect(b.attempts[1]?.attempt_number).toBe(2);
    expect(b.attempts[2]?.attempt_number).toBe(3);
    // Every row has the Wave 8 timeout_ms surfaced (executor option
    // wins; 1 000 from runOnceFailingThreeAttempts).
    for (const att of b.attempts) {
      expect(att.timeout_ms).toBe(1_000);
      expect(att.outcome).toBe("FAILED");
      expect(att.action_id).toBe(actionId);
    }
    for (const tok of FORBIDDEN_TOKENS) {
      expect(r.raw.includes(tok)).toBe(false);
    }
  });

  it("returns an empty attempts page when the action has not been executed yet", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    await seedAutoApprovePolicy(orgId, caller.entityId);
    const actionId = await postCreate(caller);
    // No runOnce — Action is APPROVED but never executed.
    const r = await listAttempts(caller, actionId);
    expect(r.statusCode).toBe(200);
    const b = r.body as {
      total: number;
      attempts: unknown[];
    };
    expect(b.total).toBe(0);
    expect(b.attempts).toEqual([]);
  });

  it("outcome filter narrows to FAILED rows only", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    await seedAutoApprovePolicy(orgId, caller.entityId);
    const actionId = await postCreate(caller, {
      [TEST_MARKER_FORCE_FAILURE]: true,
    });
    await runOnceFailingThreeAttempts();
    const r = await listAttempts(caller, actionId, "?outcome=FAILED");
    expect(r.statusCode).toBe(200);
    const b = r.body as {
      total: number;
      attempts: Array<{ outcome: string | null }>;
    };
    expect(b.total).toBe(3);
    for (const att of b.attempts) {
      expect(att.outcome).toBe("FAILED");
    }
  });

  it("outcome filter narrows to SUCCEEDED rows only (empty when all FAILED)", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    await seedAutoApprovePolicy(orgId, caller.entityId);
    const actionId = await postCreate(caller, {
      [TEST_MARKER_FORCE_FAILURE]: true,
    });
    await runOnceFailingThreeAttempts();
    const r = await listAttempts(caller, actionId, "?outcome=SUCCEEDED");
    expect(r.statusCode).toBe(200);
    const b = r.body as { total: number; attempts: unknown[] };
    expect(b.total).toBe(0);
    expect(b.attempts).toEqual([]);
  });

  it("page + page_size partitions the result set", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    await seedAutoApprovePolicy(orgId, caller.entityId);
    const actionId = await postCreate(caller, {
      [TEST_MARKER_FORCE_FAILURE]: true,
    });
    await runOnceFailingThreeAttempts();
    const r1 = await listAttempts(caller, actionId, "?page=1&page_size=2");
    expect(r1.statusCode).toBe(200);
    const b1 = r1.body as {
      total: number;
      page: number;
      page_size: number;
      attempts: Array<{ attempt_number: number }>;
    };
    expect(b1.total).toBe(3);
    expect(b1.page).toBe(1);
    expect(b1.page_size).toBe(2);
    expect(b1.attempts.length).toBe(2);
    expect(b1.attempts[0]?.attempt_number).toBe(1);
    expect(b1.attempts[1]?.attempt_number).toBe(2);
    const r2 = await listAttempts(caller, actionId, "?page=2&page_size=2");
    expect(r2.statusCode).toBe(200);
    const b2 = r2.body as { attempts: Array<{ attempt_number: number }> };
    expect(b2.attempts.length).toBe(1);
    expect(b2.attempts[0]?.attempt_number).toBe(3);
  });

  it("succeeded attempt carries result_summary + result_metadata in the list row", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    await seedAutoApprovePolicy(orgId, caller.entityId);
    const actionId = await postCreate(caller);
    await runOnceSuccess();
    const r = await listAttempts(caller, actionId);
    expect(r.statusCode).toBe(200);
    const b = r.body as {
      total: number;
      attempts: Array<{
        outcome: string | null;
        result_summary: string | null;
        result_metadata: Record<string, unknown> | null;
      }>;
    };
    expect(b.total).toBe(1);
    expect(b.attempts[0]?.outcome).toBe("SUCCEEDED");
    expect(b.attempts[0]?.result_summary).toBe(
      "stub_send_internal_notification_ok",
    );
    expect(b.attempts[0]?.result_metadata).toMatchObject({
      handler: "stub",
      action_type: "SEND_INTERNAL_NOTIFICATION",
      status: "completed_stub",
    });
  });
});

describe("GET /api/v1/actions/:id/attempts — authorization scoping", () => {
  it("non-source non-admin caller in same org gets 404 ACTION_NOT_FOUND (RULE 0 enumeration-prevention)", async () => {
    const orgId = await makeTestOrg();
    const owner = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    const stranger = await makeOrgMember({ orgId });
    await seedAutoApprovePolicy(orgId, owner.entityId);
    const actionId = await postCreate(owner);
    await runOnceSuccess();
    const r = await listAttempts(stranger, actionId);
    expect(r.statusCode).toBe(404);
    expect((r.body as { code: string }).code).toBe("ACTION_NOT_FOUND");
  });

  it("can_admin_org caller in same org can read attempts", async () => {
    const orgId = await makeTestOrg();
    const owner = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    const admin = await makeOrgMember({ orgId, can_admin_org: true });
    await seedAutoApprovePolicy(orgId, owner.entityId);
    const actionId = await postCreate(owner);
    await runOnceSuccess();
    const r = await listAttempts(admin, actionId);
    expect(r.statusCode).toBe(200);
    const b = r.body as { total: number };
    expect(b.total).toBe(1);
  });

  it("can_admin_org caller in DIFFERENT org gets 404", async () => {
    const orgA = await makeTestOrg();
    const owner = await makeOrgMember({
      orgId: orgA,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    const orgB = await makeTestOrg();
    const adminB = await makeOrgMember({ orgId: orgB, can_admin_org: true });
    await seedAutoApprovePolicy(orgA, owner.entityId);
    const actionId = await postCreate(owner);
    await runOnceSuccess();
    const r = await listAttempts(adminB, actionId);
    expect(r.statusCode).toBe(404);
    expect((r.body as { code: string }).code).toBe("ACTION_NOT_FOUND");
  });
});

describe("GET /api/v1/actions/:id/attempts — soft-delete invisibility", () => {
  it("soft-deleted Action returns 404 ACTION_NOT_FOUND", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    await seedAutoApprovePolicy(orgId, caller.entityId);
    const actionId = await postCreate(caller);
    await runOnceSuccess();
    await prisma.action.update({
      where: { action_id: actionId },
      data: { deleted_at: new Date() },
    });
    const r = await listAttempts(caller, actionId);
    expect(r.statusCode).toBe(404);
    expect((r.body as { code: string }).code).toBe("ACTION_NOT_FOUND");
  });

  it("soft-deleted ActionAttempt rows are excluded from the page", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    await seedAutoApprovePolicy(orgId, caller.entityId);
    const actionId = await postCreate(caller, {
      [TEST_MARKER_FORCE_FAILURE]: true,
    });
    await runOnceFailingThreeAttempts();
    // Soft-delete one attempt.
    const attempts = await prisma.actionAttempt.findMany({
      where: { action_id: actionId },
      orderBy: { attempt_number: "asc" },
    });
    expect(attempts.length).toBe(3);
    const victim = attempts[1]!;
    await prisma.actionAttempt.update({
      where: { attempt_id: victim.attempt_id },
      data: { deleted_at: new Date() },
    });
    const r = await listAttempts(caller, actionId);
    expect(r.statusCode).toBe(200);
    const b = r.body as {
      total: number;
      attempts: Array<{ attempt_number: number }>;
    };
    expect(b.total).toBe(2);
    expect(b.attempts.map((a) => a.attempt_number)).toEqual([1, 3]);
  });
});
