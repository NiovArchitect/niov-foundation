// FILE: action-policy-overrides.test.ts (integration)
// PURPOSE: End-to-end coverage for ADR-0057 Wave 6 — the
//          ActionPolicy.retry_budget + ActionPolicy.attempt_timeout_ms_override
//          schema fields. Proves the executor consumes the row-level
//          override (instead of the service-tier RETRY_BUDGET /
//          ATTEMPT_TIMEOUT_MS_DEFAULT constants) and persists the
//          resolved timeout to ActionAttempt.timeout_ms.
// CONNECTS TO:
//   - apps/api/src/services/action/executor.ts (per-action policy
//     lookup + resolveRetryBudget / resolveAttemptTimeoutMs)
//   - apps/api/src/services/action/lifecycle.service.ts (resolver
//     helpers + createActionAttempt timeout_ms persistence)
//   - packages/database/prisma/schema.prisma (ActionPolicy.retry_budget
//     + ActionPolicy.attempt_timeout_ms_override + ActionAttempt.timeout_ms)
//   - tests/integration/action-lifecycle.test.ts (fixture helper
//     precedent; copied locally per the established discipline)
//   - tests/helpers.ts (fixture synthesis + cleanup)

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

const TEST_JWT_SECRET = "action-policy-overrides-test-secret-do-not-use-in-prod";
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
  const ip = `10.79.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 254) + 1}`;
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

async function seedPolicyWithOverrides(opts: {
  orgEntityId: string;
  updated_by: string;
  action_type?:
    | "RECORD_CAPSULE"
    | "PROPOSE_PERMISSION_GRANT"
    | "SEND_INTERNAL_NOTIFICATION";
  risk_tier?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  retry_budget?: number | null;
  attempt_timeout_ms_override?: number | null;
}): Promise<void> {
  const action_type = opts.action_type ?? "SEND_INTERNAL_NOTIFICATION";
  const risk_tier = opts.risk_tier ?? "LOW";
  await prisma.actionPolicy.upsert({
    where: {
      org_entity_id_action_type_risk_tier: {
        org_entity_id: opts.orgEntityId,
        action_type,
        risk_tier,
      },
    },
    create: {
      org_entity_id: opts.orgEntityId,
      action_type,
      risk_tier,
      default_decision: "AUTO_APPROVE",
      require_admin_capability: null,
      retry_budget: opts.retry_budget ?? null,
      attempt_timeout_ms_override: opts.attempt_timeout_ms_override ?? null,
      updated_by: opts.updated_by,
    },
    update: {
      default_decision: "AUTO_APPROVE",
      retry_budget: opts.retry_budget ?? null,
      attempt_timeout_ms_override: opts.attempt_timeout_ms_override ?? null,
      updated_by: opts.updated_by,
    },
  });
}

async function createApprovedAction(
  caller: { entityId: string; token: string; ip: string },
  payload_redacted?: Record<string, unknown>,
): Promise<string> {
  // Wave 11: valid SEND_INTERNAL_NOTIFICATION payload (self-notif)
  // as the default; tests that need FORCE_FAILURE override with
  // the marker + required fields.
  const resolvedPayload: Record<string, unknown> = payload_redacted ?? {
    recipient_entity_id: caller.entityId,
    notification_class: "policy-overrides-test",
    body_summary: "policy-overrides-body",
  };
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/actions",
    headers: { authorization: `Bearer ${caller.token}` },
    payload: {
      action_type: "SEND_INTERNAL_NOTIFICATION",
      idempotency_key: `ik-${randomUUID()}`,
      payload_summary: "wave-6-overrides-test",
      payload_redacted: resolvedPayload,
    },
    remoteAddress: caller.ip,
  });
  if (response.statusCode !== 200) {
    throw new Error(`create failed: ${response.statusCode} ${response.body}`);
  }
  const body = response.json() as {
    ok: boolean;
    action: { action_id: string; status: string };
  };
  expect(body.ok).toBe(true);
  expect(body.action.status).toBe("APPROVED");
  return body.action.action_id;
}

describe("ADR-0057 Wave 6 — ActionPolicy.retry_budget override", () => {
  it("policy retry_budget=1 → only 1 attempt before FAILED (overrides SEND_INTERNAL_NOTIFICATION default of 3)", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    await seedPolicyWithOverrides({
      orgEntityId: orgId,
      updated_by: caller.entityId,
      retry_budget: 1,
    });
    const actionId = await createApprovedAction(caller, {
      recipient_entity_id: caller.entityId,
      notification_class: "force-fail-test",
      body_summary: "force-fail",
      [TEST_MARKER_FORCE_FAILURE]: true,
    });

    await tickActionScheduler();
    await tickActionExecutor({
      workerId: "test-worker-retry-budget-override",
      attemptTimeoutMs: 1_000,
    });

    const row = await prisma.action.findUniqueOrThrow({
      where: { action_id: actionId },
    });
    expect(row.status).toBe("FAILED");

    const attempts = await prisma.actionAttempt.findMany({
      where: { action_id: actionId },
      orderBy: { attempt_number: "asc" },
    });
    // Without the Wave 6 override the SEND_INTERNAL_NOTIFICATION
    // default budget is 3 — this assertion is the regression guard.
    expect(attempts.length).toBe(1);
    expect(attempts[0]?.outcome).toBe("FAILED");
    expect(attempts[0]?.error_class).toBe("STUB_FORCED_FAILURE");
  });

  it("policy retry_budget=null → falls back to SEND_INTERNAL_NOTIFICATION default of 3 attempts", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    await seedPolicyWithOverrides({
      orgEntityId: orgId,
      updated_by: caller.entityId,
      retry_budget: null,
    });
    const actionId = await createApprovedAction(caller, {
      recipient_entity_id: caller.entityId,
      notification_class: "force-fail-test",
      body_summary: "force-fail",
      [TEST_MARKER_FORCE_FAILURE]: true,
    });

    await tickActionScheduler();
    await tickActionExecutor({
      workerId: "test-worker-retry-budget-fallback",
      attemptTimeoutMs: 1_000,
    });

    const attempts = await prisma.actionAttempt.findMany({
      where: { action_id: actionId },
      orderBy: { attempt_number: "asc" },
    });
    expect(attempts.length).toBe(3);
  });
});

describe("ADR-0057 Wave 6 — ActionPolicy.attempt_timeout_ms_override persistence", () => {
  it("policy attempt_timeout_ms_override=7777 → persists onto ActionAttempt.timeout_ms when executor option is omitted", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    await seedPolicyWithOverrides({
      orgEntityId: orgId,
      updated_by: caller.entityId,
      attempt_timeout_ms_override: 7_777,
    });
    const actionId = await createApprovedAction(caller);

    await tickActionScheduler();
    // No attemptTimeoutMs option — the policy override must win.
    await tickActionExecutor({
      workerId: "test-worker-timeout-override",
    });

    const attempts = await prisma.actionAttempt.findMany({
      where: { action_id: actionId },
      orderBy: { attempt_number: "asc" },
    });
    expect(attempts.length).toBeGreaterThanOrEqual(1);
    expect(attempts[0]?.timeout_ms).toBe(7_777);
  });

  it("policy attempt_timeout_ms_override=null + executor option omitted → ActionAttempt.timeout_ms records the 30000 default", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    await seedPolicyWithOverrides({
      orgEntityId: orgId,
      updated_by: caller.entityId,
      attempt_timeout_ms_override: null,
    });
    const actionId = await createApprovedAction(caller);

    await tickActionScheduler();
    await tickActionExecutor({
      workerId: "test-worker-timeout-fallback",
    });

    const attempts = await prisma.actionAttempt.findMany({
      where: { action_id: actionId },
    });
    expect(attempts.length).toBeGreaterThanOrEqual(1);
    expect(attempts[0]?.timeout_ms).toBe(30_000);
  });

  it("executor option attemptTimeoutMs wins over policy override (test-ergonomics precedence preserved)", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    await seedPolicyWithOverrides({
      orgEntityId: orgId,
      updated_by: caller.entityId,
      attempt_timeout_ms_override: 7_777,
    });
    const actionId = await createApprovedAction(caller);

    await tickActionScheduler();
    await tickActionExecutor({
      workerId: "test-worker-option-wins",
      attemptTimeoutMs: 2_222,
    });

    const attempts = await prisma.actionAttempt.findMany({
      where: { action_id: actionId },
    });
    expect(attempts.length).toBeGreaterThanOrEqual(1);
    expect(attempts[0]?.timeout_ms).toBe(2_222);
  });
});
