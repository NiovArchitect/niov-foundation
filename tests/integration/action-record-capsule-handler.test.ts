// FILE: action-record-capsule-handler.test.ts (integration)
// PURPOSE: End-to-end coverage for the [ADR-0057-RECORD-CAPSULE-HANDLER]
//          real handler: AUTO_APPROVE action -> scheduler admits ->
//          executor runs WriteService.createCapsuleForActionRunner ->
//          real MemoryCapsule row exists in test DB -> safe
//          ActionResult.result_metadata -> CAPSULE_MUTATION_ADD audit
//          row with action_id back-reference -> ACTION_SUCCEEDED ->
//          no leak of source payload values.
//          Plus defensive paths: 422 INVALID_FIELD at create-time
//          for malformed payload; TAR_DEMOTED failure; wallet-missing
//          failure.
// CONNECTS TO:
//   - apps/api/src/services/action/handlers.ts (registry)
//   - apps/api/src/services/cosmp/write.service.ts
//     (createCapsuleForActionRunner)
//   - apps/api/src/services/action/scheduler.ts +
//     apps/api/src/services/action/executor.ts (drive the lifecycle)
//   - packages/database (prisma.*)

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

const TEST_JWT_SECRET = "record-capsule-handler-test-secret-do-not-use-in-prod";
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
  // Action graph
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
  // Capsules created by the handler are owned by the test entity's
  // wallet; the cleanupTestData helper that runs after this will
  // hard-delete wallets, but we soft-delete capsules to be safe.
  // (Wallets get cascaded.)
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
  const ip = `10.82.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 254) + 1}`;
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

const VALID_RECORD_CAPSULE_PAYLOAD = {
  capsule_type: "DOMAIN_KNOWLEDGE",
  topic_tags: ["alpha", "beta"],
  payload_summary: "summary-of-the-test-capsule",
  content: "the test capsule body content text",
};

async function postCreateAction(
  caller: { token: string; ip: string },
  payload_redacted: Record<string, unknown>,
  payload_summary = "the-summary",
): Promise<{ statusCode: number; body: unknown; raw: string }> {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/actions",
    headers: { authorization: `Bearer ${caller.token}` },
    payload: {
      action_type: "RECORD_CAPSULE",
      idempotency_key: `ik-${randomUUID()}`,
      payload_summary,
      payload_redacted,
    },
    remoteAddress: caller.ip,
  });
  return {
    statusCode: response.statusCode,
    body: response.json(),
    raw: response.body,
  };
}

describe("ADR-0057 — RECORD_CAPSULE real handler — create-time validation", () => {
  it("422 INVALID_FIELD when payload_redacted is missing capsule_type", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    await seedAutoApprovePolicy(orgId, caller.entityId);
    const r = await postCreateAction(caller, {
      topic_tags: ["x"],
      payload_summary: "s",
      content: "c",
    });
    expect(r.statusCode).toBe(422);
    const b = r.body as { code: string; invalid_fields: string[] };
    expect(b.code).toBe("INVALID_FIELD");
    expect(b.invalid_fields).toContain("payload_redacted.capsule_type");
  });

  it("422 INVALID_FIELD when content is empty", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    await seedAutoApprovePolicy(orgId, caller.entityId);
    const r = await postCreateAction(caller, {
      ...VALID_RECORD_CAPSULE_PAYLOAD,
      content: "",
    });
    expect(r.statusCode).toBe(422);
    const b = r.body as { code: string; invalid_fields: string[] };
    expect(b.invalid_fields).toContain("payload_redacted.content");
  });
});

describe("ADR-0057 — RECORD_CAPSULE real handler — happy path end-to-end", () => {
  it("creates a real MemoryCapsule + safe ActionResult + back-referenced CAPSULE_MUTATION_ADD + ACTION_SUCCEEDED + no payload leak", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    await seedAutoApprovePolicy(orgId, caller.entityId);

    const secretSummary = "SECRET_SUMMARY_DO_NOT_LEAK";
    const secretContent = "SECRET_CONTENT_BODY_DO_NOT_LEAK";
    const created = await postCreateAction(
      caller,
      { ...VALID_RECORD_CAPSULE_PAYLOAD, content: secretContent },
      secretSummary,
    );
    expect(created.statusCode).toBe(200);
    const body = created.body as {
      ok: true;
      action: { action_id: string; status: string };
    };
    expect(body.action.status).toBe("APPROVED");
    const actionId = body.action.action_id;

    // Drive lifecycle.
    await tickActionScheduler();
    const tick = await tickActionExecutor({
      workerId: "test-record-capsule-worker",
      attemptTimeoutMs: 5_000,
    });
    expect(tick.claimed).toBeGreaterThanOrEqual(1);
    expect(tick.succeeded).toBeGreaterThanOrEqual(1);

    const finalAction = await prisma.action.findUniqueOrThrow({
      where: { action_id: actionId },
    });
    expect(finalAction.status).toBe("SUCCEEDED");

    // ActionAttempt + ActionResult assertions.
    const attempts = await prisma.actionAttempt.findMany({
      where: { action_id: actionId },
      orderBy: { attempt_number: "asc" },
    });
    expect(attempts.length).toBe(1);
    expect(attempts[0]?.outcome).toBe("SUCCEEDED");

    const result = await prisma.actionResult.findFirstOrThrow({
      where: { attempt_id: attempts[0]?.attempt_id ?? "" },
    });
    expect(result.result_summary.startsWith("record_capsule_ok:")).toBe(true);
    expect(result.result_metadata).toMatchObject({
      handler: "record_capsule",
      action_type: "RECORD_CAPSULE",
      capsule_type: "DOMAIN_KNOWLEDGE",
    });
    const metaJson = JSON.stringify(result.result_metadata);
    expect(metaJson.includes(secretSummary)).toBe(false);
    expect(metaJson.includes(secretContent)).toBe(false);
    expect(metaJson.includes("payload_redacted")).toBe(false);
    expect(metaJson.includes("policy_envelope")).toBe(false);

    // Real MemoryCapsule row exists in the source entity's wallet.
    const wallet = await prisma.wallet.findUniqueOrThrow({
      where: { entity_id: caller.entityId },
    });
    const capsuleId = (
      result.result_metadata as { capsule_id: string }
    ).capsule_id;
    const capsule = await prisma.memoryCapsule.findUniqueOrThrow({
      where: { capsule_id: capsuleId },
    });
    expect(capsule.wallet_id).toBe(wallet.wallet_id);
    expect(capsule.entity_id).toBe(caller.entityId);
    expect(capsule.capsule_type).toBe("DOMAIN_KNOWLEDGE");
    expect(capsule.mutation_type).toBe("ADD");
    // The capsule's payload_summary is sourced from
    // payload_redacted.payload_summary (the inner CapsuleCreateInput
    // field). The outer Action.payload_summary (secretSummary above)
    // is the action-tier audit-input; the capsule-tier
    // payload_summary is a distinct value that lands on the
    // MemoryCapsule row. RULE 13: this is not a leak — the inner
    // field is what the caller *intended* to land on the capsule.
    expect(capsule.payload_summary).toBe(VALID_RECORD_CAPSULE_PAYLOAD.payload_summary);
    expect(typeof capsule.content_hash).toBe("string");

    // Back-referenced CAPSULE_MUTATION_ADD audit row carries action_id.
    const capsuleAudits = await prisma.auditEvent.findMany({
      where: {
        event_type: "CAPSULE_MUTATION_ADD",
        target_capsule_id: capsuleId,
      },
    });
    expect(capsuleAudits.length).toBe(1);
    const audit = capsuleAudits[0];
    expect(audit?.actor_entity_id).toBe(caller.entityId);
    expect(audit?.target_entity_id).toBe(caller.entityId);
    expect(audit?.session_id).toBe(null);
    const auditDetails = audit?.details as Record<string, unknown>;
    expect(auditDetails.action_id).toBe(actionId);
    expect(auditDetails.mutation_type).toBe("ADD");
    expect(auditDetails.write_type).toBe("OWNER");
    expect(auditDetails.capsule_type).toBe("DOMAIN_KNOWLEDGE");
    // Audit does NOT echo the secret values.
    const auditJson = JSON.stringify(auditDetails);
    expect(auditJson.includes(secretSummary)).toBe(false);
    expect(auditJson.includes(secretContent)).toBe(false);

    // ACTION_SUCCEEDED audit row exists for the action.
    const successAudits = await prisma.auditEvent.findMany({
      where: {
        event_type: "ACTION_SUCCEEDED",
        details: { path: ["action_id"], equals: actionId },
      },
    });
    expect(successAudits.length).toBe(1);
    const successDetails = successAudits[0]?.details as Record<string, unknown>;
    expect(successDetails.next_status).toBe("SUCCEEDED");
    const successJson = JSON.stringify(successDetails);
    expect(successJson.includes(secretSummary)).toBe(false);
    expect(successJson.includes(secretContent)).toBe(false);
  });
});

describe("ADR-0057 — RECORD_CAPSULE real handler — defensive paths", () => {
  it("TAR demoted between create and execute -> ACTION_FAILED with TAR_DEMOTED error_class", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    await seedAutoApprovePolicy(orgId, caller.entityId);
    const created = await postCreateAction(caller, VALID_RECORD_CAPSULE_PAYLOAD);
    expect(created.statusCode).toBe(200);
    const actionId = (created.body as { action: { action_id: string } })
      .action.action_id;

    // Demote TAR after create, before execute.
    await prisma.tokenAttributeRepository.update({
      where: { entity_id: caller.entityId },
      data: { can_write_capsules: false },
    });

    await tickActionScheduler();
    await tickActionExecutor({
      workerId: "test-tar-demoted-worker",
      attemptTimeoutMs: 5_000,
    });
    const final = await prisma.action.findUniqueOrThrow({
      where: { action_id: actionId },
    });
    expect(final.status).toBe("FAILED");

    const attempts = await prisma.actionAttempt.findMany({
      where: { action_id: actionId },
    });
    expect(attempts.length).toBe(3); // RECORD_CAPSULE retry budget
    for (const a of attempts) {
      expect(a.outcome).toBe("FAILED");
      expect(a.error_class).toBe("TAR_DEMOTED");
    }
    const failedAudits = await prisma.auditEvent.findMany({
      where: {
        event_type: "ACTION_FAILED",
        details: { path: ["action_id"], equals: actionId },
      },
    });
    expect(failedAudits.length).toBe(1);
    const details = failedAudits[0]?.details as Record<string, unknown>;
    expect(details.error_class).toBe("TAR_DEMOTED");
  });

  it("wallet missing -> ACTION_FAILED with WRITE_CAPSULE_DATA_INVALID error_class", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    await seedAutoApprovePolicy(orgId, caller.entityId);
    const created = await postCreateAction(caller, VALID_RECORD_CAPSULE_PAYLOAD);
    expect(created.statusCode).toBe(200);
    const actionId = (created.body as { action: { action_id: string } })
      .action.action_id;

    // Delete the wallet between create and execute. The handler's
    // defensive wallet lookup returns CAPSULE_DATA_INVALID, which the
    // handler maps to WRITE_CAPSULE_DATA_INVALID.
    await prisma.wallet.delete({
      where: { entity_id: caller.entityId },
    });

    await tickActionScheduler();
    await tickActionExecutor({
      workerId: "test-wallet-missing-worker",
      attemptTimeoutMs: 5_000,
    });
    const final = await prisma.action.findUniqueOrThrow({
      where: { action_id: actionId },
    });
    expect(final.status).toBe("FAILED");
    const attempts = await prisma.actionAttempt.findMany({
      where: { action_id: actionId },
    });
    expect(attempts.length).toBe(3);
    for (const a of attempts) {
      expect(a.outcome).toBe("FAILED");
      expect(a.error_class).toBe("WRITE_CAPSULE_DATA_INVALID");
    }
  });
});
