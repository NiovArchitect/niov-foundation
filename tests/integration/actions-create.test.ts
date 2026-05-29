// FILE: actions-create.test.ts (integration)
// PURPOSE: HTTP-level coverage for POST /api/v1/actions per ADR-0057 §9.
//          Exercises the full create-time pipeline: auth → body
//          validation → org resolution → policy envelope build → policy
//          evaluator → branch (AUTO_APPROVE / REQUIRE_DUAL_CONTROL /
//          FORBIDDEN / REQUIRE_BREAK_GLASS / NO_ELIGIBLE_TARGET) → Action
//          row + EscalationRequest pairing + ACTION_PROPOSED /
//          ACTION_APPROVED / ACTION_REJECTED audit emission → safe
//          response projection. Mirrors the
//          tests/integration/dual-control-binding-orgs.test.ts dual-
//          control fixture pattern + the
//          tests/integration/org-action-policies.test.ts auth/org-admin
//          pattern from PR #22.
// CONNECTS TO: apps/api/src/routes/actions.routes.ts (the LIVE route
//              under test), apps/api/src/services/action/action.service.ts
//              (the service), packages/database (prisma.action.* +
//              prisma.actionPolicy.* + prisma.escalationRequest.* +
//              prisma.auditEvent.* for assertions), tests/helpers.ts
//              (fixtures + cleanup).

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

const TEST_JWT_SECRET = "actions-create-test-secret-do-not-use-in-prod";
const TEST_KEY = randomBytes(32);

let app: FastifyInstance;
const store = new MemoryRateLimitStore();

// WHAT: Hard-clean Action + EscalationRequest + ActionPolicy rows that
//        reference test entities; mirrors the org-action-policies
//        cleanup precedent.
async function cleanupTestActions(): Promise<void> {
  const testEntities = await prisma.entity.findMany({
    where: { display_name: { startsWith: TEST_PREFIX } },
    select: { entity_id: true },
  });
  const ids = testEntities.map((e) => e.entity_id);
  if (ids.length === 0) return;
  await prisma.action.deleteMany({
    where: {
      OR: [
        { source_entity_id: { in: ids } },
        { org_entity_id: { in: ids } },
      ],
    },
  });
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

// WHAT: Make a parent org Entity + an OrgSettings row tuned for the
//        test scenario.
async function makeTestOrg(opts: {
  require_human_approval?: boolean;
  auto_approve_low_risk?: boolean;
} = {}): Promise<string> {
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
      require_human_approval: opts.require_human_approval ?? false,
      auto_approve_low_risk: opts.auto_approve_low_risk ?? true,
      audit_ai_actions: true,
    },
    update: {
      require_human_approval: opts.require_human_approval ?? false,
      auto_approve_low_risk: opts.auto_approve_low_risk ?? true,
    },
  });
  return org.entity_id;
}

// WHAT: Create + login an entity inside the given org with optional
//        TAR flag flips + optional TwinConfig autonomy override.
async function makeOrgMember(opts: {
  orgId: string;
  can_admin_org?: boolean;
  autonomy_level?: "APPROVAL_REQUIRED" | "EXECUTIVE_OVERRIDE" | "OBSERVE_ONLY";
  remoteAddress?: string;
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
  const ip =
    opts.remoteAddress ??
    `10.77.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 254) + 1}`;
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

// WHAT: Seed an ActionPolicy row for the given org + tuple.
async function seedPolicy(
  orgEntityId: string,
  action_type: "RECORD_CAPSULE" | "PROPOSE_PERMISSION_GRANT" | "SEND_INTERNAL_NOTIFICATION",
  risk_tier: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  default_decision:
    | "AUTO_APPROVE"
    | "REQUIRE_DUAL_CONTROL"
    | "REQUIRE_BREAK_GLASS"
    | "FORBIDDEN",
  updated_by: string,
): Promise<void> {
  await prisma.actionPolicy.upsert({
    where: {
      org_entity_id_action_type_risk_tier: {
        org_entity_id: orgEntityId,
        action_type,
        risk_tier,
      },
    },
    create: {
      org_entity_id: orgEntityId,
      action_type,
      risk_tier,
      default_decision,
      require_admin_capability: null,
      updated_by,
    },
    update: { default_decision, updated_by },
  });
}

// WHAT: Make a minimal valid request body. Default action_type is
//        SEND_INTERNAL_NOTIFICATION so the body passes the
//        [ADR-0057-RECORD-CAPSULE-HANDLER] per-type validator (the
//        stub validator accepts any object payload). Tests that need
//        RECORD_CAPSULE-specific create-flow assertions override
//        action_type AND supply a properly-shaped CapsuleCreateInput
//        payload.
// Wave 11 made validateSendInternalNotificationPayload real. The
// default payload now carries the three required fields
// (recipient_entity_id + notification_class + body_summary). These
// tests are pure create-time-validation tests — none of them tick
// the executor — so a syntactically-valid stable UUID for
// recipient_entity_id is sufficient (no membership check fires at
// create-time).
const ACTIONS_CREATE_TEST_RECIPIENT_UUID =
  "00000000-0000-0000-8000-000000000001";

function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    action_type: "SEND_INTERNAL_NOTIFICATION",
    idempotency_key: `ik-${randomUUID()}`,
    payload_summary: "test-summary",
    payload_redacted: {
      recipient_entity_id: ACTIONS_CREATE_TEST_RECIPIENT_UUID,
      notification_class: "actions-create-test",
      body_summary: "actions-create-test-body",
    },
    ...overrides,
  };
}

describe("POST /api/v1/actions — auth + body validation", () => {
  it("401 SESSION_INVALID when bearer is missing", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/actions",
      payload: body(),
    });
    expect(response.statusCode).toBe(401);
    const b = response.json() as { code: string };
    expect(b.code).toBe("SESSION_INVALID");
  });

  it("422 UNKNOWN_FIELD when body has an extra field", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({ orgId });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/actions",
      headers: { authorization: `Bearer ${caller.token}` },
      payload: { ...body(), unknown_extra: "bad" },
      remoteAddress: caller.ip,
    });
    expect(response.statusCode).toBe(422);
    const b = response.json() as { code: string; unknown_fields: string[] };
    expect(b.code).toBe("UNKNOWN_FIELD");
    expect(b.unknown_fields).toContain("unknown_extra");
  });

  it("422 INVALID_FIELD when action_type is unknown", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({ orgId });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/actions",
      headers: { authorization: `Bearer ${caller.token}` },
      payload: body({ action_type: "MADE_UP_TYPE" }),
      remoteAddress: caller.ip,
    });
    expect(response.statusCode).toBe(422);
    const b = response.json() as { code: string; invalid_fields: string[] };
    expect(b.code).toBe("INVALID_FIELD");
    expect(b.invalid_fields).toContain("action_type");
  });

  it("422 INVALID_FIELD when idempotency_key is empty", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({ orgId });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/actions",
      headers: { authorization: `Bearer ${caller.token}` },
      payload: body({ idempotency_key: "" }),
      remoteAddress: caller.ip,
    });
    expect(response.statusCode).toBe(422);
    const b = response.json() as { invalid_fields: string[] };
    expect(b.invalid_fields).toContain("idempotency_key");
  });
});

describe("POST /api/v1/actions — AUTO_APPROVE happy path", () => {
  it("upserts Action with status=APPROVED + emits ACTION_PROPOSED + ACTION_APPROVED; requires_approval=false", async () => {
    const orgId = await makeTestOrg({
      require_human_approval: false,
      auto_approve_low_risk: true,
    });
    const caller = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    await seedPolicy(orgId, "SEND_INTERNAL_NOTIFICATION", "LOW", "AUTO_APPROVE", caller.entityId);
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/actions",
      headers: { authorization: `Bearer ${caller.token}` },
      payload: body(),
      remoteAddress: caller.ip,
    });
    expect(response.statusCode).toBe(200);
    const b = response.json() as {
      ok: true;
      action: { action_id: string; status: string; requires_approval: boolean };
    };
    expect(b.ok).toBe(true);
    expect(b.action.status).toBe("APPROVED");
    expect(b.action.requires_approval).toBe(false);

    // DB row exists with status=APPROVED.
    const action = await prisma.action.findUnique({
      where: { action_id: b.action.action_id },
    });
    expect(action?.status).toBe("APPROVED");
    expect(action?.source_entity_id).toBe(caller.entityId);
    expect(action?.org_entity_id).toBe(orgId);

    // Both ACTION_PROPOSED + ACTION_APPROVED audits emitted.
    const audits = await prisma.auditEvent.findMany({
      where: { actor_entity_id: caller.entityId },
      orderBy: { timestamp: "asc" },
    });
    const types = audits.map((a) => a.event_type);
    expect(types).toContain("ACTION_PROPOSED");
    expect(types).toContain("ACTION_APPROVED");

    // No-leak guard at runtime tier: response body excludes forbidden tokens.
    for (const forbidden of [
      "payload_summary",
      "payload_redacted",
      "policy_envelope",
      "policy_envelope_hash",
      "source_entity_id",
    ]) {
      expect(response.body.includes(`"${forbidden}"`)).toBe(false);
    }
  });
});

describe("POST /api/v1/actions — REQUIRE_DUAL_CONTROL paths", () => {
  it("eligible target: Action.status=PROPOSED + EscalationRequest paired + ACTION_PROPOSED emitted; requires_approval=true", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({
      orgId,
      can_admin_org: true,
      autonomy_level: "APPROVAL_REQUIRED",
    });
    // A distinct second admin in the same org so Class B resolves.
    await makeOrgMember({ orgId, can_admin_org: true });
    await seedPolicy(
      orgId,
      "PROPOSE_PERMISSION_GRANT",
      "MEDIUM",
      "REQUIRE_DUAL_CONTROL",
      caller.entityId,
    );
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/actions",
      headers: { authorization: `Bearer ${caller.token}` },
      payload: body({ action_type: "PROPOSE_PERMISSION_GRANT", payload_redacted: { capsule_id: "11111111-1111-1111-1111-111111111111", grantee_entity_id: "22222222-2222-2222-2222-222222222222", access_scope: "FULL" } }),
      remoteAddress: caller.ip,
    });
    expect(response.statusCode).toBe(200);
    const b = response.json() as {
      ok: true;
      action: {
        action_id: string;
        status: string;
        requires_approval: boolean;
        escalation_id?: string;
      };
    };
    expect(b.ok).toBe(true);
    expect(b.action.status).toBe("PROPOSED");
    expect(b.action.requires_approval).toBe(true);
    expect(b.action.escalation_id).toBeDefined();

    // DB: Action row backfilled with escalation_id.
    const action = await prisma.action.findUnique({
      where: { action_id: b.action.action_id },
    });
    expect(action?.status).toBe("PROPOSED");
    expect(action?.escalation_id).toBe(b.action.escalation_id);

    // DB: paired EscalationRequest exists with source=caller, target≠caller.
    const escalation = await prisma.escalationRequest.findUnique({
      where: { escalation_id: b.action.escalation_id! },
    });
    expect(escalation).not.toBeNull();
    expect(escalation?.source_entity_id).toBe(caller.entityId);
    expect(escalation?.target_entity_id).not.toBe(caller.entityId);

    // ACTION_PROPOSED audit emitted, ACTION_APPROVED + ACTION_REJECTED NOT.
    const audits = await prisma.auditEvent.findMany({
      where: {
        actor_entity_id: caller.entityId,
        event_type: { in: ["ACTION_PROPOSED", "ACTION_APPROVED", "ACTION_REJECTED"] },
      },
    });
    expect(audits.filter((a) => a.event_type === "ACTION_PROPOSED").length).toBeGreaterThan(0);
    expect(audits.filter((a) => a.event_type === "ACTION_APPROVED").length).toBe(0);
    expect(audits.filter((a) => a.event_type === "ACTION_REJECTED").length).toBe(0);
  });

  it("no eligible target: Action.status=REJECTED + ACTION_REJECTED with no-eligible-target + 503", async () => {
    const orgId = await makeTestOrg();
    // Caller is the ONLY admin in the org.
    const caller = await makeOrgMember({
      orgId,
      can_admin_org: true,
      autonomy_level: "APPROVAL_REQUIRED",
    });
    await seedPolicy(
      orgId,
      "PROPOSE_PERMISSION_GRANT",
      "MEDIUM",
      "REQUIRE_DUAL_CONTROL",
      caller.entityId,
    );
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/actions",
      headers: { authorization: `Bearer ${caller.token}` },
      payload: body({ action_type: "PROPOSE_PERMISSION_GRANT", payload_redacted: { capsule_id: "11111111-1111-1111-1111-111111111111", grantee_entity_id: "22222222-2222-2222-2222-222222222222", access_scope: "FULL" } }),
      remoteAddress: caller.ip,
    });
    expect(response.statusCode).toBe(503);
    const b = response.json() as {
      ok: false;
      code: string;
      action: { status: string; decision_reason: string };
    };
    expect(b.code).toBe("DUAL_CONTROL_NO_APPROVER_AVAILABLE");
    expect(b.action.status).toBe("REJECTED");
    expect(b.action.decision_reason).toBe("no-eligible-target");

    // ACTION_REJECTED audit emitted; NO ACTION_PROPOSED audit for this caller's REQUIRE_DUAL_CONTROL Action.
    const audits = await prisma.auditEvent.findMany({
      where: { actor_entity_id: caller.entityId, event_type: "ACTION_REJECTED" },
    });
    expect(audits.length).toBeGreaterThan(0);
    const details = audits[0]!.details as Record<string, unknown>;
    expect(details.decision_reason).toBe("no-eligible-target");
    // Target identity NOT exposed in audit details for fail-closed path.
    expect(details.target_entity_id ?? null).toBeNull();
  });
});

describe("POST /api/v1/actions — FORBIDDEN (OBSERVE_ONLY twin)", () => {
  it("Action.status=REJECTED + ACTION_REJECTED + 403 ACTION_FORBIDDEN", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({
      orgId,
      autonomy_level: "OBSERVE_ONLY",
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/actions",
      headers: { authorization: `Bearer ${caller.token}` },
      payload: body(),
      remoteAddress: caller.ip,
    });
    expect(response.statusCode).toBe(403);
    const b = response.json() as {
      ok: false;
      code: string;
      action: { status: string; decision_reason: string };
    };
    expect(b.code).toBe("ACTION_FORBIDDEN");
    expect(b.action.status).toBe("REJECTED");
    expect(b.action.decision_reason).toBe("observe-only-twin");

    const audits = await prisma.auditEvent.findMany({
      where: { actor_entity_id: caller.entityId, event_type: "ACTION_REJECTED" },
    });
    expect(audits.length).toBeGreaterThan(0);
  });
});

describe("POST /api/v1/actions — idempotency replay", () => {
  it("same idempotency_key returns same action_id + status; no duplicate audit", async () => {
    const orgId = await makeTestOrg({
      require_human_approval: false,
      auto_approve_low_risk: true,
    });
    const caller = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    await seedPolicy(orgId, "SEND_INTERNAL_NOTIFICATION", "LOW", "AUTO_APPROVE", caller.entityId);
    const sharedKey = `ik-replay-${randomUUID()}`;
    const first = await app.inject({
      method: "POST",
      url: "/api/v1/actions",
      headers: { authorization: `Bearer ${caller.token}` },
      payload: body({ idempotency_key: sharedKey }),
      remoteAddress: caller.ip,
    });
    expect(first.statusCode).toBe(200);
    const firstId = (first.json() as { action: { action_id: string } }).action.action_id;

    const proposedBefore = await prisma.auditEvent.count({
      where: { actor_entity_id: caller.entityId, event_type: "ACTION_PROPOSED" },
    });

    const second = await app.inject({
      method: "POST",
      url: "/api/v1/actions",
      headers: { authorization: `Bearer ${caller.token}` },
      payload: body({ idempotency_key: sharedKey }),
      remoteAddress: caller.ip,
    });
    expect(second.statusCode).toBe(200);
    const secondId = (second.json() as { action: { action_id: string } }).action.action_id;
    expect(secondId).toBe(firstId);

    const proposedAfter = await prisma.auditEvent.count({
      where: { actor_entity_id: caller.entityId, event_type: "ACTION_PROPOSED" },
    });
    expect(proposedAfter).toBe(proposedBefore);
  });

  it("409 ACTION_IDEMPOTENCY_CONFLICT when key collides across callers", async () => {
    const orgId = await makeTestOrg({
      require_human_approval: false,
      auto_approve_low_risk: true,
    });
    const callerA = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    const callerB = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    await seedPolicy(orgId, "SEND_INTERNAL_NOTIFICATION", "LOW", "AUTO_APPROVE", callerA.entityId);
    const sharedKey = `ik-collide-${randomUUID()}`;
    const first = await app.inject({
      method: "POST",
      url: "/api/v1/actions",
      headers: { authorization: `Bearer ${callerA.token}` },
      payload: body({ idempotency_key: sharedKey }),
      remoteAddress: callerA.ip,
    });
    expect(first.statusCode).toBe(200);
    const second = await app.inject({
      method: "POST",
      url: "/api/v1/actions",
      headers: { authorization: `Bearer ${callerB.token}` },
      payload: body({ idempotency_key: sharedKey }),
      remoteAddress: callerB.ip,
    });
    expect(second.statusCode).toBe(409);
    const b = second.json() as { code: string };
    expect(b.code).toBe("ACTION_IDEMPOTENCY_CONFLICT");
  });
});

describe("POST /api/v1/actions — cross-org ActionPolicy isolation", () => {
  it("a policy in org B does not affect a caller in org A", async () => {
    const orgA = await makeTestOrg();
    const orgB = await makeTestOrg();
    const caller = await makeOrgMember({
      orgId: orgA,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    // Seed AUTO_APPROVE for (org B, RECORD_CAPSULE, LOW) — but caller is in org A.
    await seedPolicy(orgB, "SEND_INTERNAL_NOTIFICATION", "LOW", "AUTO_APPROVE", caller.entityId);
    // Org A has no policy → falls through to APPROVAL_REQUIRED-tier default.
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/actions",
      headers: { authorization: `Bearer ${caller.token}` },
      payload: body(),
      remoteAddress: caller.ip,
    });
    // Under EXECUTIVE_OVERRIDE + no AUTO_APPROVE policy + no eligible target
    // → REJECTED with no-eligible-target. Or with one eligible distinct admin
    // → PROPOSED. Either way, NOT APPROVED (because org B's policy is not
    // visible).
    const b = response.json() as { ok?: boolean; action?: { status: string } };
    if (response.statusCode === 200) {
      expect(b.action?.status).not.toBe("APPROVED");
    } else {
      expect(response.statusCode).not.toBe(200);
    }
  });
});

describe("POST /api/v1/actions — audit details no-leak", () => {
  it("ACTION_PROPOSED + ACTION_APPROVED details exclude raw payload + envelope tokens", async () => {
    const orgId = await makeTestOrg({
      require_human_approval: false,
      auto_approve_low_risk: true,
    });
    const caller = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    await seedPolicy(orgId, "SEND_INTERNAL_NOTIFICATION", "LOW", "AUTO_APPROVE", caller.entityId);
    const secretSummary = "SECRET_TEXT_THAT_MUST_NOT_LEAK";
    const secretRedacted = {
      // Wave 11: SEND_INTERNAL_NOTIFICATION payload now has required
      // fields. Include them alongside the secret marker so the
      // create-time validator passes; the no-leak assertion below
      // still proves none of the body content leaks into audit.
      recipient_entity_id: ACTIONS_CREATE_TEST_RECIPIENT_UUID,
      notification_class: "no-leak-test",
      body_summary: "no-leak-test-body",
      secret_marker: "REDACTED_TEXT_THAT_MUST_NOT_LEAK",
    };
    await app.inject({
      method: "POST",
      url: "/api/v1/actions",
      headers: { authorization: `Bearer ${caller.token}` },
      payload: body({
        payload_summary: secretSummary,
        payload_redacted: secretRedacted,
      }),
      remoteAddress: caller.ip,
    });
    const audits = await prisma.auditEvent.findMany({
      where: {
        actor_entity_id: caller.entityId,
        event_type: { in: ["ACTION_PROPOSED", "ACTION_APPROVED"] },
      },
    });
    expect(audits.length).toBeGreaterThanOrEqual(2);
    for (const audit of audits) {
      const detailsRaw = JSON.stringify(audit.details);
      expect(detailsRaw).not.toContain(secretSummary);
      expect(detailsRaw).not.toContain("REDACTED_TEXT_THAT_MUST_NOT_LEAK");
      for (const forbidden of [
        "payload_summary",
        "payload_redacted",
        "policy_envelope",
        "embedding",
        "vector",
        "candidate_pool",
      ]) {
        expect(detailsRaw).not.toContain(`"${forbidden}"`);
      }
      // SAFE allowlist present.
      const details = audit.details as Record<string, unknown>;
      expect(details.action_id).toBeDefined();
      expect(details.action_type).toBeDefined();
      expect(details.risk_tier).toBeDefined();
      expect(details.decision).toBeDefined();
      expect(details.policy_envelope_hash).toBeDefined();
      expect(typeof details.policy_envelope_hash).toBe("string");
    }
  });
});
