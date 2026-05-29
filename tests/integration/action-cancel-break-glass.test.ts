// FILE: action-cancel-break-glass.test.ts (integration)
// PURPOSE: End-to-end coverage for the
//          [ADR-0057-RUNNING-CANCEL-BREAK-GLASS] Wave 2 privileged
//          RUNNING-cancel path. Verifies:
//          - 403 RUNNING_CANCEL_PRIVILEGED when caller has no
//            valid break-glass grant (regression vs Wave 1 cancel).
//          - 200 RUNNING -> CANCELLED + grant marked USED + audit
//            chain (BREAK_GLASS_USED -> ACTION_CANCELLED with
//            grant_id back-reference) when caller holds a valid
//            ACTIVE grant.
//          - 403 when grant is for a different action_type.
//          - 403 when grant is for a different source entity.
//          - 403 when grant is EXPIRED (used / outside window).
//          - Already-USED grant cannot be reused (single-use).
// CONNECTS TO:
//   - apps/api/src/services/action/cancel.service.ts (the LIVE
//     RUNNING-cancel path)
//   - apps/api/src/services/governance/break-glass.service.ts
//     (createBreakGlassGrant + validateBreakGlassGrant +
//     markBreakGlassUsed)
//   - packages/database (prisma.action.* + prisma.breakGlassGrant.*
//     + prisma.auditEvent.* for assertions)

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildApp,
  BREAK_GLASS_ACTION_TYPE_RUNNING_CANCEL,
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

const TEST_JWT_SECRET = "running-cancel-break-glass-test-secret";
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
  // Break-glass grants by source.
  await prisma.breakGlassGrant.deleteMany({
    where: { source_entity_id: { in: ids } },
  });
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
    await prisma.action.deleteMany({ where: { action_id: { in: actionIds } } });
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
  const ip = `10.83.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 254) + 1}`;
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

// Build an Action row in RUNNING status directly so the test stays
// deterministic (no race with the scheduler / executor cron). The
// cancel service treats RUNNING the same regardless of how the row
// got there.
async function makeRunningAction(opts: {
  source_entity_id: string;
  org_entity_id: string;
}): Promise<string> {
  const row = await prisma.action.create({
    data: {
      source_entity_id: opts.source_entity_id,
      org_entity_id: opts.org_entity_id,
      action_type: "SEND_INTERNAL_NOTIFICATION",
      risk_tier: "LOW",
      policy_envelope: {},
      payload_summary: "running-action-test",
      payload_redacted: { kind: "notification" },
      idempotency_key: `ik-running-${randomUUID()}`,
      status: "RUNNING",
    },
  });
  return row.action_id;
}

async function makeBreakGlassGrant(opts: {
  source_entity_id: string;
  action_type: string;
  validForMinutes?: number;
  expiredInPast?: boolean;
}): Promise<string> {
  const now = new Date();
  const validUntil = opts.expiredInPast
    ? new Date(now.getTime() - 60_000)
    : new Date(now.getTime() + (opts.validForMinutes ?? 30) * 60_000);
  const validFrom = opts.expiredInPast
    ? new Date(now.getTime() - 120_000)
    : now;
  const grant = await prisma.breakGlassGrant.create({
    data: {
      source_entity_id: opts.source_entity_id,
      action_type: opts.action_type,
      justification: "test grant",
      status: "ACTIVE",
      valid_from: validFrom,
      valid_until: validUntil,
    },
  });
  return grant.grant_id;
}

async function cancelAction(
  caller: { token: string; ip: string },
  actionId: string,
): Promise<{ statusCode: number; body: unknown; raw: string }> {
  const response = await app.inject({
    method: "POST",
    url: `/api/v1/actions/${actionId}/cancel`,
    headers: { authorization: `Bearer ${caller.token}` },
    payload: {},
    remoteAddress: caller.ip,
  });
  return {
    statusCode: response.statusCode,
    body: response.json(),
    raw: response.body,
  };
}

describe("ADR-0057 §6 + ADR-0050 — RUNNING-cancel break-glass — denial paths", () => {
  it("403 RUNNING_CANCEL_PRIVILEGED when caller has no break-glass grant (regression)", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    await seedAutoApprovePolicy(orgId, caller.entityId);
    const actionId = await makeRunningAction({
      source_entity_id: caller.entityId,
      org_entity_id: orgId,
    });
    const r = await cancelAction(caller, actionId);
    expect(r.statusCode).toBe(403);
    expect((r.body as { code: string }).code).toBe("RUNNING_CANCEL_PRIVILEGED");
  });

  it("403 RUNNING_CANCEL_PRIVILEGED when grant is for a different action_type", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    await seedAutoApprovePolicy(orgId, caller.entityId);
    const actionId = await makeRunningAction({
      source_entity_id: caller.entityId,
      org_entity_id: orgId,
    });
    await makeBreakGlassGrant({
      source_entity_id: caller.entityId,
      action_type: "SOME_OTHER_ACTION",
    });
    const r = await cancelAction(caller, actionId);
    expect(r.statusCode).toBe(403);
    expect((r.body as { code: string }).code).toBe("RUNNING_CANCEL_PRIVILEGED");
  });

  it("403 RUNNING_CANCEL_PRIVILEGED when grant belongs to a different source entity", async () => {
    const orgId = await makeTestOrg();
    const owner = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    const other = await makeOrgMember({ orgId });
    await seedAutoApprovePolicy(orgId, owner.entityId);
    const actionId = await makeRunningAction({
      source_entity_id: owner.entityId,
      org_entity_id: orgId,
    });
    // Grant exists, but for `other`, not for `owner`.
    await makeBreakGlassGrant({
      source_entity_id: other.entityId,
      action_type: BREAK_GLASS_ACTION_TYPE_RUNNING_CANCEL,
    });
    const r = await cancelAction(owner, actionId);
    expect(r.statusCode).toBe(403);
    expect((r.body as { code: string }).code).toBe("RUNNING_CANCEL_PRIVILEGED");
  });

  it("403 RUNNING_CANCEL_PRIVILEGED when grant is EXPIRED (outside window)", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    await seedAutoApprovePolicy(orgId, caller.entityId);
    const actionId = await makeRunningAction({
      source_entity_id: caller.entityId,
      org_entity_id: orgId,
    });
    await makeBreakGlassGrant({
      source_entity_id: caller.entityId,
      action_type: BREAK_GLASS_ACTION_TYPE_RUNNING_CANCEL,
      expiredInPast: true,
    });
    const r = await cancelAction(caller, actionId);
    expect(r.statusCode).toBe(403);
    expect((r.body as { code: string }).code).toBe("RUNNING_CANCEL_PRIVILEGED");
  });
});

describe("ADR-0057 §6 + ADR-0050 — RUNNING-cancel break-glass — happy path", () => {
  it("200 RUNNING -> CANCELLED + grant marked USED + ACTION_CANCELLED with grant_id back-reference + BREAK_GLASS_USED audit", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    await seedAutoApprovePolicy(orgId, caller.entityId);
    const actionId = await makeRunningAction({
      source_entity_id: caller.entityId,
      org_entity_id: orgId,
    });
    const grantId = await makeBreakGlassGrant({
      source_entity_id: caller.entityId,
      action_type: BREAK_GLASS_ACTION_TYPE_RUNNING_CANCEL,
    });

    const r = await cancelAction(caller, actionId);
    expect(r.statusCode).toBe(200);
    const body = r.body as {
      ok: true;
      action: { action_id: string; status: string; decision_reason?: string };
    };
    expect(body.ok).toBe(true);
    expect(body.action.action_id).toBe(actionId);
    expect(body.action.status).toBe("CANCELLED");
    expect(body.action.decision_reason).toBe("running_cancel_via_break_glass");

    // Action row terminalized.
    const finalRow = await prisma.action.findUniqueOrThrow({
      where: { action_id: actionId },
    });
    expect(finalRow.status).toBe("CANCELLED");

    // Grant marked USED.
    const grantRow = await prisma.breakGlassGrant.findUniqueOrThrow({
      where: { grant_id: grantId },
    });
    expect(grantRow.status).toBe("USED");
    expect(grantRow.used_at).not.toBeNull();

    // BREAK_GLASS_USED audit row exists.
    const bgUsed = await prisma.auditEvent.findMany({
      where: {
        event_type: "BREAK_GLASS_USED",
        actor_entity_id: caller.entityId,
        details: { path: ["grant_id"], equals: grantId },
      },
    });
    expect(bgUsed.length).toBe(1);

    // ACTION_CANCELLED audit row exists + carries grant_id back-reference.
    const acAudits = await prisma.auditEvent.findMany({
      where: {
        event_type: "ACTION_CANCELLED",
        actor_entity_id: caller.entityId,
        details: { path: ["action_id"], equals: actionId },
      },
    });
    expect(acAudits.length).toBe(1);
    const details = acAudits[0]?.details as Record<string, unknown>;
    expect(details.previous_status).toBe("RUNNING");
    expect(details.next_status).toBe("CANCELLED");
    expect(details.grant_id).toBe(grantId);
    expect(details.decision_reason).toBe("running_cancel_via_break_glass");
    // No-leak: assert no payload-derived tokens in audit details.
    const json = JSON.stringify(details);
    expect(json.includes("running-action-test")).toBe(false);
    expect(json.includes("policy_envelope")).toBe(false);
  });

  it("single-use enforcement: a grant marked USED cannot authorize a second RUNNING-cancel", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    await seedAutoApprovePolicy(orgId, caller.entityId);

    const action1 = await makeRunningAction({
      source_entity_id: caller.entityId,
      org_entity_id: orgId,
    });
    const action2 = await makeRunningAction({
      source_entity_id: caller.entityId,
      org_entity_id: orgId,
    });
    await makeBreakGlassGrant({
      source_entity_id: caller.entityId,
      action_type: BREAK_GLASS_ACTION_TYPE_RUNNING_CANCEL,
    });

    // First cancel consumes the grant.
    const first = await cancelAction(caller, action1);
    expect(first.statusCode).toBe(200);

    // Second cancel finds no ACTIVE grant -> 403.
    const second = await cancelAction(caller, action2);
    expect(second.statusCode).toBe(403);
    expect((second.body as { code: string }).code).toBe(
      "RUNNING_CANCEL_PRIVILEGED",
    );
  });
});
