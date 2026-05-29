// FILE: action-propose-permission-grant-handler.test.ts (integration)
// PURPOSE: End-to-end coverage for the
//          [ADR-0057-PROPOSE-PERMISSION-GRANT-HANDLER] real handler:
//          AUTO_APPROVE action -> scheduler admits -> executor runs
//          handler -> createPermission produces real Permission row +
//          legacy PERMISSION_CREATE audit row -> canonical
//          PERMISSION_CREATED AuditEvent with action_id back-reference
//          -> ACTION_SUCCEEDED with SAFE result_metadata. Defensive
//          paths: invalid payload at create-time, sovereignty
//          violation at execute-time, missing capsule, missing
//          grantee.
// CONNECTS TO:
//   - apps/api/src/services/action/handlers.ts (real handler)
//   - apps/api/src/services/action/action-payload-validators.ts
//   - packages/database/src/queries/permission.ts (createPermission)

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

const TEST_JWT_SECRET = "ppg-handler-test-secret";
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
  // Permission rows seeded by handler.
  await prisma.permission.deleteMany({
    where: {
      OR: [
        { grantor_entity_id: { in: ids } },
        { grantee_entity_id: { in: ids } },
      ],
    },
  });
  // Capsule rows + wallets seeded for grantor.
  const testWallets = await prisma.wallet.findMany({
    where: { entity_id: { in: ids } },
    select: { wallet_id: true },
  });
  const walletIds = testWallets.map((w) => w.wallet_id);
  if (walletIds.length > 0) {
    await prisma.memoryCapsule.deleteMany({
      where: { wallet_id: { in: walletIds } },
    });
  }
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
        action_type: "PROPOSE_PERMISSION_GRANT",
        risk_tier: "MEDIUM",
      },
    },
    create: {
      org_entity_id: orgEntityId,
      action_type: "PROPOSE_PERMISSION_GRANT",
      risk_tier: "MEDIUM",
      default_decision: "AUTO_APPROVE",
      require_admin_capability: null,
      updated_by,
    },
    update: { default_decision: "AUTO_APPROVE", updated_by },
  });
}

// Seed a capsule directly via Prisma (faster than going through the
// COSMP write pipeline for test fixtures).
async function seedCapsule(opts: {
  ownerEntityId: string;
  capsule_type?: string;
}): Promise<string> {
  const wallet = await prisma.wallet.findUniqueOrThrow({
    where: { entity_id: opts.ownerEntityId },
  });
  const capsule = await prisma.memoryCapsule.create({
    data: {
      wallet_id: wallet.wallet_id,
      entity_id: opts.ownerEntityId,
      version: 1,
      mutation_type: "ADD",
      capsule_type: (opts.capsule_type ?? "DOMAIN_KNOWLEDGE") as never,
      topic_tags: ["test"],
      decay_type: "TIME_BASED",
      decay_rate: 0.01,
      payload_summary: "test-capsule-for-permission-grant",
      payload_size_tokens: 1,
      tokens: 1,
      tokens_tokenizer: "anthropic",
      storage_location: `niov://capsule/${randomUUID()}`,
      storage_tier: "WARM",
      clearance_required: 0,
      content_hash: "test-hash",
      connected_capsule_ids: [],
      connected_entity_ids: [],
      monetization_enabled: false,
      monetization_category: null,
      ai_access_blocked: false,
      requires_validation: false,
      created_by: opts.ownerEntityId,
      created_session_id: null,
    },
  });
  return capsule.capsule_id;
}

async function postCreatePPG(
  caller: { token: string; ip: string },
  payload_redacted: Record<string, unknown>,
): Promise<{ statusCode: number; body: unknown; raw: string }> {
  const r = await app.inject({
    method: "POST",
    url: "/api/v1/actions",
    headers: { authorization: `Bearer ${caller.token}` },
    payload: {
      action_type: "PROPOSE_PERMISSION_GRANT",
      idempotency_key: `ik-${randomUUID()}`,
      payload_summary: "test-ppg-summary",
      payload_redacted,
    },
    remoteAddress: caller.ip,
  });
  return { statusCode: r.statusCode, body: r.json(), raw: r.body };
}

async function runOnce(): Promise<void> {
  await tickActionScheduler();
  await tickActionExecutor({
    workerId: "test-ppg-worker",
    attemptTimeoutMs: 5_000,
  });
}

describe("PROPOSE_PERMISSION_GRANT real handler — create-time validation", () => {
  it("422 INVALID_FIELD when capsule_id is missing", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    await seedAutoApprovePolicy(orgId, caller.entityId);
    const r = await postCreatePPG(caller, {
      grantee_entity_id: randomUUID(),
      access_scope: "FULL",
    });
    expect(r.statusCode).toBe(422);
    const b = r.body as { code: string; invalid_fields: string[] };
    expect(b.code).toBe("INVALID_FIELD");
    expect(b.invalid_fields).toContain("payload_redacted.capsule_id");
  });

  it("422 INVALID_FIELD when access_scope is not a valid enum", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    await seedAutoApprovePolicy(orgId, caller.entityId);
    const r = await postCreatePPG(caller, {
      capsule_id: randomUUID(),
      grantee_entity_id: randomUUID(),
      access_scope: "MADE_UP",
    });
    expect(r.statusCode).toBe(422);
    expect((r.body as { invalid_fields: string[] }).invalid_fields).toContain(
      "payload_redacted.access_scope",
    );
  });

  it("422 INVALID_FIELD when duration_type is unknown", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    await seedAutoApprovePolicy(orgId, caller.entityId);
    const r = await postCreatePPG(caller, {
      capsule_id: randomUUID(),
      grantee_entity_id: randomUUID(),
      access_scope: "FULL",
      duration_type: "FOREVER",
    });
    expect(r.statusCode).toBe(422);
    expect((r.body as { invalid_fields: string[] }).invalid_fields).toContain(
      "payload_redacted.duration_type",
    );
  });
});

describe("PROPOSE_PERMISSION_GRANT real handler — happy path", () => {
  it("AUTO_APPROVE -> scheduler -> executor -> Permission row + canonical PERMISSION_CREATED + SAFE result_metadata + no leak", async () => {
    const orgId = await makeTestOrg();
    const grantor = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    const grantee = await makeOrgMember({ orgId });
    await seedAutoApprovePolicy(orgId, grantor.entityId);
    const capsuleId = await seedCapsule({ ownerEntityId: grantor.entityId });

    const created = await postCreatePPG(grantor, {
      capsule_id: capsuleId,
      grantee_entity_id: grantee.entityId,
      access_scope: "SUMMARY",
      duration_type: "TEMPORARY",
    });
    expect(created.statusCode).toBe(200);
    const actionId = (created.body as { action: { action_id: string } })
      .action.action_id;

    await runOnce();
    const finalAction = await prisma.action.findUniqueOrThrow({
      where: { action_id: actionId },
    });
    expect(finalAction.status).toBe("SUCCEEDED");

    // Attempt + Result
    const attempts = await prisma.actionAttempt.findMany({
      where: { action_id: actionId },
    });
    expect(attempts.length).toBe(1);
    expect(attempts[0]?.outcome).toBe("SUCCEEDED");
    const result = await prisma.actionResult.findFirstOrThrow({
      where: { attempt_id: attempts[0]?.attempt_id ?? "" },
    });
    expect(result.result_summary.startsWith("propose_permission_grant_ok:")).toBe(true);
    expect(result.result_metadata).toMatchObject({
      handler: "propose_permission_grant",
      action_type: "PROPOSE_PERMISSION_GRANT",
      capsule_id: capsuleId,
      grantee_entity_id: grantee.entityId,
      access_scope: "SUMMARY",
      duration_type: "TEMPORARY",
    });

    // Permission row landed.
    const meta = result.result_metadata as { permission_id: string };
    const permission = await prisma.permission.findUniqueOrThrow({
      where: { permission_id: meta.permission_id },
    });
    expect(permission.grantor_entity_id).toBe(grantor.entityId);
    expect(permission.grantee_entity_id).toBe(grantee.entityId);
    expect(permission.capsule_id).toBe(capsuleId);
    expect(permission.access_scope).toBe("SUMMARY");
    expect(permission.duration_type).toBe("TEMPORARY");

    // Canonical PERMISSION_CREATED audit row with action_id back-ref.
    const audits = await prisma.auditEvent.findMany({
      where: {
        event_type: "PERMISSION_CREATED",
        target_capsule_id: capsuleId,
      },
    });
    expect(audits.length).toBe(1);
    const details = audits[0]?.details as Record<string, unknown>;
    expect(details.action_id).toBe(actionId);
    expect(details.permission_id).toBe(permission.permission_id);
    expect(details.via).toBe("ACTION_RUNNER");
    expect(audits[0]?.actor_entity_id).toBe(grantor.entityId);
    expect(audits[0]?.target_entity_id).toBe(grantee.entityId);

    // No-leak: ACTION_SUCCEEDED + result_metadata exclude raw
    // payload-derived strings.
    const successAudit = await prisma.auditEvent.findFirstOrThrow({
      where: {
        event_type: "ACTION_SUCCEEDED",
        details: { path: ["action_id"], equals: actionId },
      },
    });
    const successJson = JSON.stringify(successAudit.details);
    expect(successJson.includes("test-ppg-summary")).toBe(false);
    const metaJson = JSON.stringify(result.result_metadata);
    expect(metaJson.includes("test-ppg-summary")).toBe(false);
    expect(metaJson.includes("policy_envelope")).toBe(false);
    expect(metaJson.includes("payload_redacted")).toBe(false);
  });
});

describe("PROPOSE_PERMISSION_GRANT real handler — defensive paths", () => {
  it("non-existent capsule -> Action terminalizes FAILED with PERMISSION_CAPSULE_NOT_FOUND error_class (after retry budget)", async () => {
    const orgId = await makeTestOrg();
    const grantor = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    const grantee = await makeOrgMember({ orgId });
    await seedAutoApprovePolicy(orgId, grantor.entityId);
    const created = await postCreatePPG(grantor, {
      capsule_id: randomUUID(), // not a real capsule
      grantee_entity_id: grantee.entityId,
      access_scope: "FULL",
    });
    expect(created.statusCode).toBe(200);
    const actionId = (created.body as { action: { action_id: string } })
      .action.action_id;
    await runOnce();
    const final = await prisma.action.findUniqueOrThrow({
      where: { action_id: actionId },
    });
    // PROPOSE_PERMISSION_GRANT retry budget is 1, so a single
    // attempt failure terminalizes immediately.
    expect(final.status).toBe("FAILED");
    const attempts = await prisma.actionAttempt.findMany({
      where: { action_id: actionId },
    });
    expect(attempts.length).toBe(1);
    expect(attempts[0]?.outcome).toBe("FAILED");
    expect(attempts[0]?.error_class).toBe("PERMISSION_CAPSULE_NOT_FOUND");
  });

  it("non-existent grantee -> handler FAILURE with PERMISSION_GRANTEE_NOT_FOUND error_class", async () => {
    const orgId = await makeTestOrg();
    const grantor = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    await seedAutoApprovePolicy(orgId, grantor.entityId);
    const capsuleId = await seedCapsule({ ownerEntityId: grantor.entityId });

    const created = await postCreatePPG(grantor, {
      capsule_id: capsuleId,
      grantee_entity_id: randomUUID(), // not a real entity
      access_scope: "FULL",
    });
    expect(created.statusCode).toBe(200);
    const actionId = (created.body as { action: { action_id: string } })
      .action.action_id;
    await runOnce();
    const final = await prisma.action.findUniqueOrThrow({
      where: { action_id: actionId },
    });
    expect(final.status).toBe("FAILED");
    const attempts = await prisma.actionAttempt.findMany({
      where: { action_id: actionId },
    });
    expect(attempts[0]?.error_class).toBe("PERMISSION_GRANTEE_NOT_FOUND");
  });

  it("sovereignty violation: grantor does not own capsule -> PERMISSION_SOVEREIGNTY_VIOLATION", async () => {
    const orgId = await makeTestOrg();
    const grantor = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    const grantee = await makeOrgMember({ orgId });
    const other = await makeOrgMember({ orgId });
    await seedAutoApprovePolicy(orgId, grantor.entityId);
    // Capsule is owned by `other`, NOT by the grantor.
    const capsuleId = await seedCapsule({ ownerEntityId: other.entityId });

    const created = await postCreatePPG(grantor, {
      capsule_id: capsuleId,
      grantee_entity_id: grantee.entityId,
      access_scope: "FULL",
    });
    expect(created.statusCode).toBe(200);
    const actionId = (created.body as { action: { action_id: string } })
      .action.action_id;
    await runOnce();
    const final = await prisma.action.findUniqueOrThrow({
      where: { action_id: actionId },
    });
    expect(final.status).toBe("FAILED");
    const attempts = await prisma.actionAttempt.findMany({
      where: { action_id: actionId },
    });
    expect(attempts[0]?.error_class).toBe("PERMISSION_SOVEREIGNTY_VIOLATION");
  });
});
