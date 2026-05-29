// FILE: action-attempt-detail.test.ts (integration)
// PURPOSE: HTTP coverage for GET
//          /api/v1/actions/:id/attempts/:attempt_id per ADR-0057 §9
//          attempt-drilldown route. Verifies bearer + read gate,
//          path-param validation, ownership / admin scoping
//          (mirroring the GET viewer pattern), latest-result
//          attachment, no-leak across forbidden tokens, soft-delete
//          invisibility, and path-mismatch 404.
// CONNECTS TO:
//   - apps/api/src/routes/actions.routes.ts
//   - apps/api/src/services/action/attempt.service.ts

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

const TEST_JWT_SECRET = "attempt-detail-test-secret";
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
  const ip = `10.84.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 254) + 1}`;
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

const SECRET_SUMMARY = "ATTEMPT_DETAIL_SECRET_SUMMARY";
const SECRET_REDACTED_TITLE = "ATTEMPT_DETAIL_SECRET_TITLE";

async function postCreate(caller: {
  entityId: string;
  token: string;
  ip: string;
}): Promise<string> {
  const r = await app.inject({
    method: "POST",
    url: "/api/v1/actions",
    headers: { authorization: `Bearer ${caller.token}` },
    payload: {
      action_type: "SEND_INTERNAL_NOTIFICATION",
      idempotency_key: `ik-${randomUUID()}`,
      payload_summary: SECRET_SUMMARY,
      // Wave 11: valid SEND_INTERNAL_NOTIFICATION payload. The
      // SECRET_REDACTED_TITLE marker stays inside body_redacted so
      // the no-leak assertions still catch any leakage of the
      // body content into audit / result_metadata.
      payload_redacted: {
        recipient_entity_id: caller.entityId,
        notification_class: "attempt-detail-test",
        body_summary: "attempt-detail-body",
        body_redacted: { title: SECRET_REDACTED_TITLE },
      },
    },
    remoteAddress: caller.ip,
  });
  if (r.statusCode !== 200) throw new Error(`create failed: ${r.statusCode}`);
  return (r.json() as { action: { action_id: string } }).action.action_id;
}

async function runOnce(): Promise<void> {
  await tickActionScheduler();
  await tickActionExecutor({
    workerId: "test-attempt-worker",
    attemptTimeoutMs: 2_000,
  });
}

async function getAttempt(
  caller: { token: string; ip: string },
  actionId: string,
  attemptId: string,
): Promise<{ statusCode: number; body: unknown; raw: string }> {
  const r = await app.inject({
    method: "GET",
    url: `/api/v1/actions/${actionId}/attempts/${attemptId}`,
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

describe("GET /api/v1/actions/:id/attempts/:attempt_id — auth + envelopes", () => {
  it("401 SESSION_INVALID without bearer", async () => {
    const r = await app.inject({
      method: "GET",
      url: `/api/v1/actions/${randomUUID()}/attempts/${randomUUID()}`,
    });
    expect(r.statusCode).toBe(401);
    expect((r.json() as { code: string }).code).toBe("SESSION_INVALID");
  });
  it("400 INVALID_ACTION_ID when action_id is not a UUID", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({ orgId });
    const r = await getAttempt(caller, "not-a-uuid", randomUUID());
    expect(r.statusCode).toBe(400);
    expect((r.body as { code: string }).code).toBe("INVALID_ACTION_ID");
  });
  it("400 INVALID_ATTEMPT_ID when attempt_id is not a UUID", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({ orgId });
    const r = await getAttempt(caller, randomUUID(), "not-a-uuid");
    expect(r.statusCode).toBe(400);
    expect((r.body as { code: string }).code).toBe("INVALID_ATTEMPT_ID");
  });
  it("404 ACTION_NOT_FOUND for unknown action_id", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({ orgId });
    const r = await getAttempt(caller, randomUUID(), randomUUID());
    expect(r.statusCode).toBe(404);
    expect((r.body as { code: string }).code).toBe("ACTION_NOT_FOUND");
  });
});

describe("GET /api/v1/actions/:id/attempts/:attempt_id — happy path", () => {
  it("source caller reads SUCCEEDED attempt + result_metadata; no payload leak", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    await seedAutoApprovePolicy(orgId, caller.entityId);
    const actionId = await postCreate(caller);
    await runOnce();
    const attempt = await prisma.actionAttempt.findFirstOrThrow({
      where: { action_id: actionId },
      orderBy: { attempt_number: "asc" },
    });
    const r = await getAttempt(caller, actionId, attempt.attempt_id);
    expect(r.statusCode).toBe(200);
    const b = r.body as {
      ok: true;
      attempt: {
        attempt_id: string;
        action_id: string;
        attempt_number: number;
        outcome: string | null;
        worker_id: string | null;
        error_class: string | null;
        result_summary: string | null;
        result_metadata: Record<string, unknown> | null;
      };
    };
    expect(b.attempt.attempt_id).toBe(attempt.attempt_id);
    expect(b.attempt.action_id).toBe(actionId);
    expect(b.attempt.attempt_number).toBe(1);
    expect(b.attempt.outcome).toBe("SUCCEEDED");
    expect(b.attempt.worker_id).toBe("test-attempt-worker");
    expect(b.attempt.error_class).toBe(null);
    // Wave 11 made SEND_INTERNAL_NOTIFICATION a REAL handler.
    expect(b.attempt.result_summary).toMatch(
      /^internal_notification_dispatched:/,
    );
    expect(b.attempt.result_metadata).toMatchObject({
      handler: "send_internal_notification",
      action_type: "SEND_INTERNAL_NOTIFICATION",
      status: "dispatched_internal",
    });
    for (const tok of FORBIDDEN_TOKENS) {
      expect(r.raw.includes(tok)).toBe(false);
    }
  });
});

describe("GET /api/v1/actions/:id/attempts/:attempt_id — authorization scoping", () => {
  it("non-source non-admin caller in same org gets 404 (RULE 0 enumeration-prevention)", async () => {
    const orgId = await makeTestOrg();
    const owner = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    const stranger = await makeOrgMember({ orgId });
    await seedAutoApprovePolicy(orgId, owner.entityId);
    const actionId = await postCreate(owner);
    await runOnce();
    const attempt = await prisma.actionAttempt.findFirstOrThrow({
      where: { action_id: actionId },
    });
    const r = await getAttempt(stranger, actionId, attempt.attempt_id);
    expect(r.statusCode).toBe(404);
    expect((r.body as { code: string }).code).toBe("ACTION_NOT_FOUND");
  });

  it("can_admin_org caller in same org can read", async () => {
    const orgId = await makeTestOrg();
    const owner = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    const admin = await makeOrgMember({ orgId, can_admin_org: true });
    await seedAutoApprovePolicy(orgId, owner.entityId);
    const actionId = await postCreate(owner);
    await runOnce();
    const attempt = await prisma.actionAttempt.findFirstOrThrow({
      where: { action_id: actionId },
    });
    const r = await getAttempt(admin, actionId, attempt.attempt_id);
    expect(r.statusCode).toBe(200);
    const b = r.body as { attempt: { attempt_id: string } };
    expect(b.attempt.attempt_id).toBe(attempt.attempt_id);
    for (const tok of FORBIDDEN_TOKENS) {
      expect(r.raw.includes(tok)).toBe(false);
    }
  });

  it("can_admin_org caller in DIFFERENT org gets 404", async () => {
    const orgA = await makeTestOrg();
    const orgB = await makeTestOrg();
    const ownerA = await makeOrgMember({
      orgId: orgA,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    const adminB = await makeOrgMember({ orgId: orgB, can_admin_org: true });
    await seedAutoApprovePolicy(orgA, ownerA.entityId);
    const actionId = await postCreate(ownerA);
    await runOnce();
    const attempt = await prisma.actionAttempt.findFirstOrThrow({
      where: { action_id: actionId },
    });
    const r = await getAttempt(adminB, actionId, attempt.attempt_id);
    expect(r.statusCode).toBe(404);
    expect((r.body as { code: string }).code).toBe("ACTION_NOT_FOUND");
  });
});

describe("GET /api/v1/actions/:id/attempts/:attempt_id — defensive paths", () => {
  it("404 ATTEMPT_NOT_FOUND when attempt belongs to a different action (path mismatch)", async () => {
    const orgId = await makeTestOrg();
    const owner = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    await seedAutoApprovePolicy(orgId, owner.entityId);
    const actionA = await postCreate(owner);
    const actionB = await postCreate(owner);
    await runOnce();
    const attemptA = await prisma.actionAttempt.findFirstOrThrow({
      where: { action_id: actionA },
    });
    // Request attemptA under actionB's id -> mismatch -> 404 ATTEMPT_NOT_FOUND.
    const r = await getAttempt(owner, actionB, attemptA.attempt_id);
    expect(r.statusCode).toBe(404);
    expect((r.body as { code: string }).code).toBe("ATTEMPT_NOT_FOUND");
  });

  it("404 ACTION_NOT_FOUND when action is soft-deleted", async () => {
    const orgId = await makeTestOrg();
    const owner = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    await seedAutoApprovePolicy(orgId, owner.entityId);
    const actionId = await postCreate(owner);
    await runOnce();
    const attempt = await prisma.actionAttempt.findFirstOrThrow({
      where: { action_id: actionId },
    });
    await prisma.action.update({
      where: { action_id: actionId },
      data: { deleted_at: new Date() },
    });
    const r = await getAttempt(owner, actionId, attempt.attempt_id);
    expect(r.statusCode).toBe(404);
    expect((r.body as { code: string }).code).toBe("ACTION_NOT_FOUND");
  });
});

describe("GET /api/v1/actions/:id/attempts/:attempt_id — ADR-0057 Wave 8 timeout_ms forensic visibility", () => {
  it("projects timeout_ms = the executor-option value when option wins absolutely", async () => {
    // runOnce passes attemptTimeoutMs: 2_000 to tickActionExecutor;
    // per the PR #47 + #49 precedence the option wins over any policy
    // override and over the default. The resolved value persists onto
    // the row + must surface on the attempt-detail viewer per Wave 8.
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    await seedAutoApprovePolicy(orgId, caller.entityId);
    const actionId = await postCreate(caller);
    await runOnce();
    const attempt = await prisma.actionAttempt.findFirstOrThrow({
      where: { action_id: actionId },
      orderBy: { attempt_number: "asc" },
    });
    expect(attempt.timeout_ms).toBe(2_000);
    const r = await getAttempt(caller, actionId, attempt.attempt_id);
    expect(r.statusCode).toBe(200);
    const b = r.body as {
      ok: true;
      attempt: { timeout_ms: number | null };
    };
    expect(b.attempt.timeout_ms).toBe(2_000);
  });

  it("projects timeout_ms = the ActionPolicy.attempt_timeout_ms_override when executor option is omitted", async () => {
    // Seed an ActionPolicy with a positive override + drive the
    // executor WITHOUT the option override. Wave 6 PR #47 resolver
    // path makes the row carry the policy value; Wave 8 surfaces it
    // on the attempt-detail viewer.
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    await prisma.actionPolicy.upsert({
      where: {
        org_entity_id_action_type_risk_tier: {
          org_entity_id: orgId,
          action_type: "SEND_INTERNAL_NOTIFICATION",
          risk_tier: "LOW",
        },
      },
      create: {
        org_entity_id: orgId,
        action_type: "SEND_INTERNAL_NOTIFICATION",
        risk_tier: "LOW",
        default_decision: "AUTO_APPROVE",
        require_admin_capability: null,
        attempt_timeout_ms_override: 6_543,
        updated_by: caller.entityId,
      },
      update: {
        default_decision: "AUTO_APPROVE",
        attempt_timeout_ms_override: 6_543,
        updated_by: caller.entityId,
      },
    });
    const actionId = await postCreate(caller);
    await tickActionScheduler();
    // No attemptTimeoutMs option — the policy override resolves.
    await tickActionExecutor({ workerId: "test-attempt-worker-wave8" });
    const attempt = await prisma.actionAttempt.findFirstOrThrow({
      where: { action_id: actionId },
      orderBy: { attempt_number: "asc" },
    });
    expect(attempt.timeout_ms).toBe(6_543);
    const r = await getAttempt(caller, actionId, attempt.attempt_id);
    expect(r.statusCode).toBe(200);
    const b = r.body as {
      ok: true;
      attempt: { timeout_ms: number | null };
    };
    expect(b.attempt.timeout_ms).toBe(6_543);
  });
});
