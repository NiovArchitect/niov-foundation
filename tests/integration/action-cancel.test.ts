// FILE: action-cancel.test.ts (integration)
// PURPOSE: HTTP coverage for POST /api/v1/actions/:id/cancel per
//          ADR-0057 §6: auth + body validation + ownership check +
//          PROPOSED -> CANCELLED + APPROVED -> CANCELLED +
//          SCHEDULED -> CANCELLED + RUNNING -> CANCELLED rejection
//          (privileged) + terminal-state 409 + idempotent replay +
//          ACTION_CANCELLED audit emission with safe details + no-leak.
// CONNECTS TO:
//   - apps/api/src/routes/actions.routes.ts (the LIVE route)
//   - apps/api/src/services/action/cancel.service.ts (the service)
//   - apps/api/src/services/action/scheduler.ts (tickActionScheduler
//     used to promote an action to SCHEDULED for the
//     SCHEDULED-cancellation case)
//   - packages/database (prisma.action.* + prisma.auditEvent.*)

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildApp,
  MemoryContentStore,
  MemoryNonceStore,
  MemoryRateLimitStore,
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

const TEST_JWT_SECRET = "action-cancel-test-secret-do-not-use-in-prod";
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
      payload_summary: "test-summary",
      payload_redacted: { kind: "capsule", title: "test" },
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

async function cancel(
  caller: { token: string; ip: string },
  actionId: string,
  body?: Record<string, unknown>,
): Promise<{ statusCode: number; body: unknown; rawBody: string }> {
  const response = await app.inject({
    method: "POST",
    url: `/api/v1/actions/${actionId}/cancel`,
    headers: { authorization: `Bearer ${caller.token}` },
    payload: body ?? {},
    remoteAddress: caller.ip,
  });
  return {
    statusCode: response.statusCode,
    body: response.json(),
    rawBody: response.body,
  };
}

describe("POST /api/v1/actions/:id/cancel — auth + body validation", () => {
  it("401 SESSION_INVALID when bearer is missing", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/actions/${randomUUID()}/cancel`,
      payload: {},
    });
    expect(response.statusCode).toBe(401);
    const b = response.json() as { code: string };
    expect(b.code).toBe("SESSION_INVALID");
  });

  it("400 INVALID_ACTION_ID when path id is not a UUID", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({ orgId });
    const r = await cancel(caller, "not-a-uuid");
    expect(r.statusCode).toBe(400);
    expect((r.body as { code: string }).code).toBe("INVALID_ACTION_ID");
  });

  it("422 UNKNOWN_FIELD when body has an extra field", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({ orgId });
    const r = await cancel(caller, randomUUID(), { extra: "x" });
    expect(r.statusCode).toBe(422);
    expect((r.body as { code: string }).code).toBe("UNKNOWN_FIELD");
  });
});

describe("POST /api/v1/actions/:id/cancel — happy paths", () => {
  it("APPROVED -> CANCELLED + emits ACTION_CANCELLED with safe details", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    await seedAutoApprovePolicy(orgId, caller.entityId);
    const actionId = await createApprovedAction(caller);

    const r = await cancel(caller, actionId, { reason: "user changed mind" });
    expect(r.statusCode).toBe(200);
    const b = r.body as {
      ok: true;
      action: { action_id: string; status: string };
    };
    expect(b.ok).toBe(true);
    expect(b.action.status).toBe("CANCELLED");

    const row = await prisma.action.findUniqueOrThrow({
      where: { action_id: actionId },
    });
    expect(row.status).toBe("CANCELLED");

    const audits = await prisma.auditEvent.findMany({
      where: {
        event_type: "ACTION_CANCELLED",
        actor_entity_id: caller.entityId,
        details: { path: ["action_id"], equals: actionId },
      },
    });
    expect(audits.length).toBe(1);
    const details = audits[0]?.details as Record<string, unknown>;
    expect(details.previous_status).toBe("APPROVED");
    expect(details.next_status).toBe("CANCELLED");
    expect(details.decision_reason).toBe("user changed mind");
    expect(details.action_type).toBe("RECORD_CAPSULE");
    // No-leak: response body excludes payload / envelope tokens.
    for (const forbidden of [
      "payload_summary",
      "payload_redacted",
      "policy_envelope",
      "policy_envelope_hash",
      "source_entity_id",
    ]) {
      expect(r.rawBody.includes(`"${forbidden}"`)).toBe(false);
    }
  });

  it("SCHEDULED -> CANCELLED works after scheduler admission", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    await seedAutoApprovePolicy(orgId, caller.entityId);
    const actionId = await createApprovedAction(caller);
    await tickActionScheduler();
    const scheduled = await prisma.action.findUniqueOrThrow({
      where: { action_id: actionId },
    });
    expect(scheduled.status).toBe("SCHEDULED");

    const r = await cancel(caller, actionId);
    expect(r.statusCode).toBe(200);
    expect((r.body as { action: { status: string } }).action.status).toBe(
      "CANCELLED",
    );

    const audits = await prisma.auditEvent.findMany({
      where: {
        event_type: "ACTION_CANCELLED",
        details: { path: ["action_id"], equals: actionId },
      },
    });
    expect(audits.length).toBe(1);
    const details = audits[0]?.details as Record<string, unknown>;
    expect(details.previous_status).toBe("SCHEDULED");
    expect(details.decision_reason).toBe("cancelled_by_source");
  });

  it("idempotent replay: cancelling an already-CANCELLED action returns 200 + same view + no second audit", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    await seedAutoApprovePolicy(orgId, caller.entityId);
    const actionId = await createApprovedAction(caller);

    const first = await cancel(caller, actionId);
    expect(first.statusCode).toBe(200);

    const second = await cancel(caller, actionId);
    expect(second.statusCode).toBe(200);
    const sb = second.body as {
      action: { status: string; decision_reason?: string };
    };
    expect(sb.action.status).toBe("CANCELLED");
    expect(sb.action.decision_reason).toBe("already_cancelled");

    const audits = await prisma.auditEvent.findMany({
      where: {
        event_type: "ACTION_CANCELLED",
        details: { path: ["action_id"], equals: actionId },
      },
    });
    expect(audits.length).toBe(1);
  });
});

describe("POST /api/v1/actions/:id/cancel — ownership + privileged paths", () => {
  it("403 NOT_ACTION_OWNER when caller is not the source entity (no field leak)", async () => {
    const orgId = await makeTestOrg();
    const owner = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    const stranger = await makeOrgMember({ orgId });
    await seedAutoApprovePolicy(orgId, owner.entityId);
    const actionId = await createApprovedAction(owner);

    const r = await cancel(stranger, actionId);
    expect(r.statusCode).toBe(403);
    expect((r.body as { code: string }).code).toBe("NOT_ACTION_OWNER");
    // Response must NOT echo any Action field (no status, no
    // action_type, no payload tokens).
    for (const forbidden of [
      "status",
      "action_type",
      "payload_summary",
      "payload_redacted",
      "source_entity_id",
    ]) {
      expect(r.rawBody.includes(`"${forbidden}"`)).toBe(false);
    }
  });

  it("404 ACTION_NOT_FOUND for an unknown action_id", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({ orgId });
    const r = await cancel(caller, randomUUID());
    expect(r.statusCode).toBe(404);
    expect((r.body as { code: string }).code).toBe("ACTION_NOT_FOUND");
  });

  it("403 RUNNING_CANCEL_PRIVILEGED when the row is RUNNING", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    await seedAutoApprovePolicy(orgId, caller.entityId);
    const actionId = await createApprovedAction(caller);
    // Force the row into RUNNING directly (the executor would normally
    // do this; here we want a deterministic state without racing).
    await prisma.action.update({
      where: { action_id: actionId },
      data: { status: "RUNNING" },
    });
    const r = await cancel(caller, actionId);
    expect(r.statusCode).toBe(403);
    expect((r.body as { code: string }).code).toBe("RUNNING_CANCEL_PRIVILEGED");
  });

  it("409 ACTION_ALREADY_TERMINAL for terminal non-CANCELLED states", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    await seedAutoApprovePolicy(orgId, caller.entityId);
    const actionId = await createApprovedAction(caller);
    await prisma.action.update({
      where: { action_id: actionId },
      data: { status: "SUCCEEDED" },
    });
    const r = await cancel(caller, actionId);
    expect(r.statusCode).toBe(409);
    expect((r.body as { code: string }).code).toBe("ACTION_ALREADY_TERMINAL");
  });
});
