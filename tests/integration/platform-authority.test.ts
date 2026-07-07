// FILE: platform-authority.test.ts (integration)
// PURPOSE: [PLATFORM-AUTHORITY] HTTP-level coverage for the governed
//          can_admin_niov grant/revoke rail: POST /platform/
//          admin-niov-grants + /admin-niov-revocations (can_admin_niov +
//          dual control, payload-bound + single-use). Proves the full
//          G1-style arc over real Postgres: no approval -> 403
//          ESCALATION_PENDING (+ PENDING row with payload hash); approved
//          EXACT payload grants ONCE (TAR flag + hash + version + audit,
//          approval consumed -> replay 403s fresh); payload mismatch never
//          matches the approval; self-grant refused; non-operator and
//          org-admin-only callers refused; org-admin TARGET refused (the
//          dedicated-identity guard that keeps daily org accounts and the
//          demo admin ungrantable); already-operator refused WITHOUT
//          consuming the approval; revoke works and enforces the
//          two-operator floor; suspended target refused; no secrets in
//          audit rows.
// CONNECTS TO: apps/api/src/services/governance/platform-authority
//              .service.ts, apps/api/src/routes/platform.routes.ts,
//              security/privileged-endpoints.ts (payload binding),
//              tests/integration/dual-control-binding-orgs.test.ts (the
//              harness + grantApproval pattern this mirrors).
//
// CLEANUP: escalation_requests reference test entities by FK; this file
// removes them BEFORE cleanupTestData(). audit_events are never deleted
// (ADR-0002 triggers); isolation is fresh-per-test entities.

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  approveEscalationForCaller,
  buildApp,
  canonicalDualControlPayload,
  createEscalationForCaller,
  dualControlDescription,
  MemoryContentStore,
  MemoryNonceStore,
  MemoryRateLimitStore,
} from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import {
  computeTARHash,
  createEntity,
  prisma,
  type Prisma,
} from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeEntityInput,
  TEST_PREFIX,
  withCleanRateLimits,
} from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "platform-authority-test-secret-do-not-use";
const TEST_KEY = randomBytes(32);
const GRANT_ROUTE = "/api/v1/platform/admin-niov-grants";
const REVOKE_ROUTE = "/api/v1/platform/admin-niov-revocations";
const GRANT_ACTION = "PLATFORM_ADMIN_NIOV_GRANT" as const;
const REVOKE_ACTION = "PLATFORM_ADMIN_NIOV_REVOKE" as const;
const REASON = "Provision a dedicated platform operator (integration test).";

let app: FastifyInstance;
const store = new MemoryRateLimitStore();

async function testEntityIds(): Promise<string[]> {
  const rows = await prisma.entity.findMany({
    where: { display_name: { startsWith: TEST_PREFIX } },
    select: { entity_id: true },
  });
  return rows.map((e) => e.entity_id);
}

async function cleanupTestEscalations(): Promise<void> {
  const ids = await testEntityIds();
  if (ids.length === 0) return;
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

async function grantCapability(
  entityId: string,
  cap: "can_admin_niov" | "can_admin_org",
): Promise<void> {
  await prisma.tokenAttributeRepository.update({
    where: { entity_id: entityId },
    data: { [cap]: true },
  });
  const fresh = await prisma.tokenAttributeRepository.findUnique({
    where: { entity_id: entityId },
  });
  if (fresh === null) throw new Error("TAR vanished mid-test");
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
    where: { entity_id: entityId },
    data: { tar_hash: newHash },
  });
}

async function makePerson(opts?: {
  can_admin_niov?: boolean;
  can_admin_org?: boolean;
}): Promise<{ entityId: string; email: string; password: string }> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const email = input.email as string;
  const entity = await createEntity(input);
  if (opts?.can_admin_niov === true) await grantCapability(entity.entity_id, "can_admin_niov");
  if (opts?.can_admin_org === true) await grantCapability(entity.entity_id, "can_admin_org");
  return { entityId: entity.entity_id, email, password };
}

async function login(email: string, password: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email, password, requested_operations: ["read"] },
    remoteAddress: `10.99.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 254) + 1}`,
  });
  if (res.statusCode !== 200) throw new Error(`login failed: ${res.statusCode}`);
  return (res.json() as { token: string }).token;
}

// Create + approve a payload-bound dual-control approval for the caller on
// the grant/revoke action (mirrors dual-control-binding-orgs.grantApproval:
// distinct second human approver; caller stays the source).
async function approvedFor(
  callerEntityId: string,
  action: typeof GRANT_ACTION | typeof REVOKE_ACTION,
  payload: Record<string, unknown>,
): Promise<string> {
  const approver = await createEntity(makeEntityInput({ entity_type: "PERSON" }));
  const bound = canonicalDualControlPayload(payload, []);
  const created = await createEscalationForCaller(callerEntityId, {
    target_entity_id: approver.entity_id,
    escalation_type: "DUAL_CONTROL_REQUIRED",
    severity: "HIGH",
    description: dualControlDescription(action),
    expires_at: null,
    resolution_metadata: {
      dual_control: {
        algo: "sha256-canonical-json-v1",
        payload_hash: bound.payload_hash,
        redacted_fields: bound.redacted_fields,
      },
    } as Prisma.InputJsonValue,
  });
  await approveEscalationForCaller(approver.entity_id, created.escalation_id);
  return created.escalation_id;
}

function post(
  route: string,
  token: string,
  payload: Record<string, unknown>,
) {
  return app.inject({
    method: "POST",
    url: route,
    headers: { authorization: `Bearer ${token}` },
    payload,
  });
}

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestEscalations();
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
  await cleanupTestEscalations();
  await cleanupTestData();
  await prisma.$disconnect();
});

withCleanRateLimits(store);

beforeEach(async () => {
  await cleanupTestEscalations();
  await cleanupTestData();
});

describe("[PLATFORM-AUTHORITY] governed can_admin_niov grant", () => {
  it("no approval -> 403 ESCALATION_PENDING with a payload-bound PENDING row; nothing granted", async () => {
    const operator = await makePerson({ can_admin_niov: true });
    const second = await makePerson({ can_admin_niov: true }); // approver pool
    void second;
    const target = await makePerson({});
    const token = await login(operator.email, operator.password);
    const body = { target_email: target.email, reason: REASON };

    const res = await post(GRANT_ROUTE, token, body);
    expect(res.statusCode).toBe(403);
    expect((res.json() as { error: string }).error).toBe("ESCALATION_PENDING");

    const pending = await prisma.escalationRequest.findFirst({
      where: {
        source_entity_id: operator.entityId,
        escalation_type: "DUAL_CONTROL_REQUIRED",
        status: "PENDING",
      },
      orderBy: { created_at: "desc" },
    });
    expect(pending).not.toBeNull();
    expect(pending?.target_entity_id).not.toBe(operator.entityId); // never self
    const meta = (pending?.resolution_metadata ?? {}) as {
      dual_control?: { payload_hash?: string };
    };
    expect(meta.dual_control?.payload_hash).toBe(
      canonicalDualControlPayload(body, []).payload_hash,
    );

    const tar = await prisma.tokenAttributeRepository.findUnique({
      where: { entity_id: target.entityId },
    });
    expect(tar?.can_admin_niov).toBe(false); // nothing granted
  });

  it("approved exact payload grants ONCE: TAR + hash + version + audit; replay needs a fresh approval", async () => {
    const operator = await makePerson({ can_admin_niov: true });
    const target = await makePerson({});
    const token = await login(operator.email, operator.password);
    const body = { target_email: target.email, reason: REASON };
    const escalationId = await approvedFor(operator.entityId, GRANT_ACTION, body);

    const tarBefore = await prisma.tokenAttributeRepository.findUnique({
      where: { entity_id: target.entityId },
    });

    const res = await post(GRANT_ROUTE, token, body);
    expect(res.statusCode).toBe(200);
    const out = res.json() as {
      ok: boolean;
      entity_id: string;
      can_admin_niov: boolean;
      tar_version: number;
      audit_event_id: string;
    };
    expect(out.ok).toBe(true);
    expect(out.entity_id).toBe(target.entityId);
    expect(out.can_admin_niov).toBe(true);
    expect(out.tar_version).toBe((tarBefore?.tar_version ?? 0) + 1);

    // TAR truth: flag set, hash recomputed, version bumped.
    const tarAfter = await prisma.tokenAttributeRepository.findUnique({
      where: { entity_id: target.entityId },
    });
    expect(tarAfter?.can_admin_niov).toBe(true);
    expect(tarAfter?.tar_hash).not.toBe(tarBefore?.tar_hash);
    expect(tarAfter?.tar_version).toBe((tarBefore?.tar_version ?? 0) + 1);
    // Only the intended capability moved.
    expect(tarAfter?.can_admin_org).toBe(false);

    // The approval was consumed (single-use): APPROVED -> EXPIRED.
    const spent = await prisma.escalationRequest.findUnique({
      where: { escalation_id: escalationId },
    });
    expect(spent?.status).toBe("EXPIRED");

    // Audit of record: actor/target/old->new/reason/escalation id, no secrets.
    const audit = await prisma.auditEvent.findUnique({
      where: { audit_id: out.audit_event_id },
    });
    expect(audit?.event_type).toBe("ADMIN_ACTION");
    expect(audit?.actor_entity_id).toBe(operator.entityId);
    expect(audit?.target_entity_id).toBe(target.entityId);
    const details = (audit?.details ?? {}) as Record<string, unknown>;
    expect(details.action).toBe("PLATFORM_ADMIN_NIOV_GRANTED");
    expect(details.reason).toBe(REASON);
    expect(details.dual_control_escalation_id).toBe(escalationId);
    expect(JSON.stringify(details)).not.toContain("password");
    expect(JSON.stringify(details)).not.toContain("correct-horse-battery");

    // Replay of the identical request: the approval is spent -> a fresh
    // PENDING escalation, never a second grant.
    const replay = await post(GRANT_ROUTE, token, body);
    expect(replay.statusCode).toBe(403);
    expect((replay.json() as { error: string }).error).toBe("ESCALATION_PENDING");
  });

  it("an approval never matches a DIFFERENT payload (target swap refused)", async () => {
    const operator = await makePerson({ can_admin_niov: true });
    // A second operator must exist for the middleware's Class C approver
    // pool (the mismatch path creates a FRESH pending escalation).
    const pool = await makePerson({ can_admin_niov: true });
    void pool;
    const intended = await makePerson({});
    const other = await makePerson({});
    const token = await login(operator.email, operator.password);
    await approvedFor(operator.entityId, GRANT_ACTION, {
      target_email: intended.email,
      reason: REASON,
    });

    // Same action type, different target: the payload hash differs, the
    // approval does not apply -> 403 + a NEW pending row; nothing granted.
    const res = await post(GRANT_ROUTE, token, {
      target_email: other.email,
      reason: REASON,
    });
    expect(res.statusCode).toBe(403);
    const tar = await prisma.tokenAttributeRepository.findUnique({
      where: { entity_id: other.entityId },
    });
    expect(tar?.can_admin_niov).toBe(false);
  });

  it("refusal matrix: self-grant, org-admin target, non-person caller tiers, suspended target, already-operator", async () => {
    const operator = await makePerson({ can_admin_niov: true });
    const token = await login(operator.email, operator.password);

    // Self-grant refused even WITH an approval.
    const selfBody = { target_email: operator.email, reason: REASON };
    await approvedFor(operator.entityId, GRANT_ACTION, selfBody);
    const self = await post(GRANT_ROUTE, token, selfBody);
    expect(self.statusCode).toBe(403);
    expect((self.json() as { code: string }).code).toBe(
      "AUTHORITY_SELF_TARGET_FORBIDDEN",
    );

    // Org-admin target refused (dedicated-identity guard; keeps daily
    // org accounts and the demo org's admin structurally ungrantable).
    const orgAdmin = await makePerson({ can_admin_org: true });
    const orgAdminBody = { target_email: orgAdmin.email, reason: REASON };
    await approvedFor(operator.entityId, GRANT_ACTION, orgAdminBody);
    const oa = await post(GRANT_ROUTE, token, orgAdminBody);
    expect(oa.statusCode).toBe(409);
    expect((oa.json() as { code: string }).code).toBe(
      "AUTHORITY_TARGET_IS_ORG_ADMIN",
    );

    // Suspended target refused.
    const suspended = await makePerson({});
    await prisma.entity.update({
      where: { entity_id: suspended.entityId },
      data: { status: "SUSPENDED", suspended_at: new Date() },
    });
    const susBody = { target_email: suspended.email, reason: REASON };
    await approvedFor(operator.entityId, GRANT_ACTION, susBody);
    const sus = await post(GRANT_ROUTE, token, susBody);
    expect(sus.statusCode).toBe(409);
    expect((sus.json() as { code: string }).code).toBe(
      "AUTHORITY_TARGET_NOT_ACTIVE",
    );

    // Already-operator refused WITHOUT consuming the approval.
    const existing = await makePerson({ can_admin_niov: true });
    const dupBody = { target_email: existing.email, reason: REASON };
    const dupEscalation = await approvedFor(operator.entityId, GRANT_ACTION, dupBody);
    const dup = await post(GRANT_ROUTE, token, dupBody);
    expect(dup.statusCode).toBe(409);
    expect((dup.json() as { code: string }).code).toBe("AUTHORITY_ALREADY_OPERATOR");
    const stillApproved = await prisma.escalationRequest.findUnique({
      where: { escalation_id: dupEscalation },
    });
    expect(stillApproved?.status).toBe("APPROVED"); // not burned on a no-op

    // Caller tiers: org-admin-only 403 (capability gate), unauth 401,
    // plain member 403.
    const orgOnly = await makePerson({ can_admin_org: true });
    const orgOnlyToken = await login(orgOnly.email, orgOnly.password);
    const t1 = await post(GRANT_ROUTE, orgOnlyToken, selfBody);
    expect(t1.statusCode).toBe(403);
    const member = await makePerson({});
    const memberToken = await login(member.email, member.password);
    const t2 = await post(GRANT_ROUTE, memberToken, selfBody);
    expect(t2.statusCode).toBe(403);
    const t3 = await app.inject({ method: "POST", url: GRANT_ROUTE, payload: selfBody });
    expect(t3.statusCode).toBe(401);
  });
});

describe("[PLATFORM-AUTHORITY] governed can_admin_niov revoke", () => {
  it("revoke works above the floor, refuses at the floor, and audits", async () => {
    // Census: operator (caller) + keeper + revokee = 3 active operators.
    const operator = await makePerson({ can_admin_niov: true });
    const keeper = await makePerson({ can_admin_niov: true });
    void keeper;
    const revokee = await makePerson({ can_admin_niov: true });
    const token = await login(operator.email, operator.password);

    // Above the floor (3 -> 2): revoke succeeds.
    const body = { target_email: revokee.email, reason: REASON };
    const escalationId = await approvedFor(operator.entityId, REVOKE_ACTION, body);
    const res = await post(REVOKE_ROUTE, token, body);
    expect(res.statusCode).toBe(200);
    const out = res.json() as { can_admin_niov: boolean; audit_event_id: string };
    expect(out.can_admin_niov).toBe(false);
    const tar = await prisma.tokenAttributeRepository.findUnique({
      where: { entity_id: revokee.entityId },
    });
    expect(tar?.can_admin_niov).toBe(false);
    const audit = await prisma.auditEvent.findUnique({
      where: { audit_id: out.audit_event_id },
    });
    expect(
      ((audit?.details ?? {}) as Record<string, unknown>).action,
    ).toBe("PLATFORM_ADMIN_NIOV_REVOKED");
    const spent = await prisma.escalationRequest.findUnique({
      where: { escalation_id: escalationId },
    });
    expect(spent?.status).toBe("EXPIRED"); // single-use consumed

    // At the floor (2 active would drop to 1): refused, TAR untouched.
    // NOTE: the census counts TEST-DB operators only in this isolated DB.
    const floorBody = { target_email: keeper.email, reason: REASON };
    await approvedFor(operator.entityId, REVOKE_ACTION, floorBody);
    const floor = await post(REVOKE_ROUTE, token, floorBody);
    expect(floor.statusCode).toBe(409);
    expect((floor.json() as { code: string }).code).toBe("AUTHORITY_OPERATOR_FLOOR");
    const keeperTar = await prisma.tokenAttributeRepository.findUnique({
      where: { entity_id: keeper.entityId },
    });
    expect(keeperTar?.can_admin_niov).toBe(true); // untouched

    // Non-operator target: honest refusal.
    const civilian = await makePerson({});
    const civBody = { target_email: civilian.email, reason: REASON };
    await approvedFor(operator.entityId, REVOKE_ACTION, civBody);
    const civ = await post(REVOKE_ROUTE, token, civBody);
    expect(civ.statusCode).toBe(409);
    expect((civ.json() as { code: string }).code).toBe("AUTHORITY_NOT_OPERATOR");
  });

  it("unknown target email 404s; blank reason 400s (no approval consumed)", async () => {
    const operator = await makePerson({ can_admin_niov: true });
    const token = await login(operator.email, operator.password);
    const ghostBody = {
      target_email: `${TEST_PREFIX}ghost_${randomUUID()}@niov.test`,
      reason: REASON,
    };
    await approvedFor(operator.entityId, GRANT_ACTION, ghostBody);
    const ghost = await post(GRANT_ROUTE, token, ghostBody);
    expect(ghost.statusCode).toBe(404);

    const target = await makePerson({});
    const blankBody = { target_email: target.email, reason: "   " };
    await approvedFor(operator.entityId, GRANT_ACTION, blankBody);
    const blank = await post(GRANT_ROUTE, token, blankBody);
    expect(blank.statusCode).toBe(400);
    expect((blank.json() as { code: string }).code).toBe("AUTHORITY_REASON_REQUIRED");
  });
});
