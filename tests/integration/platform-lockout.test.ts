// FILE: platform-lockout.test.ts (integration)
// PURPOSE: [LOCKOUT-RECOVERY] HTTP-level coverage for the sole-admin
//          lockout recovery rail: POST /api/v1/platform/entities/:id/
//          clear-lockout (can_admin_niov). The victim's lockout is driven
//          through the REAL auth path (5 failed logins over HTTP flip the
//          entity to SUSPENDED and write the actorless ENTITY_SUSPENDED
//          audit row) so the rail is proven against exactly the state
//          auth.service.ts writes. Proves: operator clears a lockout
//          (ACTIVE + counter 0 + ENTITY_REACTIVATED audit with metadata,
//          no password material, TAR untouched, login works after); a
//          non-lockout suspension REFUSES (not a general unsuspend rail);
//          ACTIVE refuses; missing reason 400; unknown entity 404;
//          org-admin-only 403; unauthenticated 401.
// CONNECTS TO: apps/api/src/services/governance/lockout-recovery.service.ts,
//              apps/api/src/routes/platform.routes.ts,
//              apps/api/src/services/auth.service.ts (FAILED_AUTH_LOCKOUT),
//              tests/integration/break-glass-integration.test.ts (harness
//              this mirrors).

import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
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

const TEST_JWT_SECRET = "platform-lockout-test-secret-do-not-use";
const TEST_KEY = randomBytes(32);
const ROUTE = (id: string) => `/api/v1/platform/entities/${id}/clear-lockout`;
const REASON = "Sole-admin lockout recovery drill (integration test).";

let app: FastifyInstance;
const store = new MemoryRateLimitStore();

function randomIp(): string {
  return `10.98.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 254) + 1}`;
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

async function makePersonAndLogin(opts?: {
  can_admin_niov?: boolean;
  can_admin_org?: boolean;
}): Promise<{ entityId: string; email: string; password: string; token: string }> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const email = input.email as string;
  const entity = await createEntity(input);
  if (opts?.can_admin_niov === true) await grantCapability(entity.entity_id, "can_admin_niov");
  if (opts?.can_admin_org === true) await grantCapability(entity.entity_id, "can_admin_org");
  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email, password, requested_operations: ["read"] },
    remoteAddress: randomIp(),
  });
  if (login.statusCode !== 200) {
    throw new Error(`login failed: ${login.statusCode} ${login.body}`);
  }
  return {
    entityId: entity.entity_id,
    email,
    password,
    token: (login.json() as { token: string }).token,
  };
}

// Drive the REAL lockout: 5 failed logins over HTTP (distinct IPs so the
// login rate limiter never fires first). Leaves the entity exactly as
// auth.service.ts does: SUSPENDED, counter at threshold, actorless
// ENTITY_SUSPENDED audit row with reason "5 failed attempts".
async function lockOut(email: string): Promise<void> {
  for (let i = 0; i < 5; i++) {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email, password: "wrong-password-on-purpose", requested_operations: ["read"] },
      remoteAddress: randomIp(),
    });
    expect([401, 403]).toContain(res.statusCode);
  }
}

async function makeLockedOutVictim(): Promise<{
  entityId: string;
  email: string;
  password: string;
}> {
  const password = "victim-correct-password-1";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const email = input.email as string;
  const entity = await createEntity(input);
  await lockOut(email);
  const row = await prisma.entity.findUnique({
    where: { entity_id: entity.entity_id },
  });
  expect(row?.status).toBe("SUSPENDED");
  expect(row?.failed_auth_attempts ?? 0).toBeGreaterThanOrEqual(5);
  return { entityId: entity.entity_id, email, password };
}

beforeAll(async () => {
  await ensureAuditTriggers();
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
  await cleanupTestData();
  await prisma.$disconnect();
});

withCleanRateLimits(store);

beforeEach(async () => {
  await cleanupTestData();
});

describe("[LOCKOUT-RECOVERY] platform clear-lockout rail", () => {
  it("operator clears a REAL failed-login lockout: ACTIVE, counter 0, audited, TAR untouched, login works", async () => {
    const operator = await makePersonAndLogin({ can_admin_niov: true });
    const victim = await makeLockedOutVictim();

    // The victim's correct password is refused while suspended (fail-closed).
    const whileSuspended = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: victim.email, password: victim.password, requested_operations: ["read"] },
      remoteAddress: randomIp(),
    });
    expect(whileSuspended.statusCode).toBe(403);

    const tarBefore = await prisma.tokenAttributeRepository.findUnique({
      where: { entity_id: victim.entityId },
    });

    const res = await app.inject({
      method: "POST",
      url: ROUTE(victim.entityId),
      headers: { authorization: `Bearer ${operator.token}` },
      payload: { reason: REASON },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      ok: boolean;
      entity_id: string;
      status: string;
      prior_failed_attempts: number;
      audit_event_id: string | null;
    };
    expect(body.ok).toBe(true);
    expect(body.entity_id).toBe(victim.entityId);
    expect(body.status).toBe("ACTIVE");
    expect(body.prior_failed_attempts).toBeGreaterThanOrEqual(5);
    // The reason is stored in audit, never echoed back.
    expect(res.body).not.toContain(REASON);

    // Entity state: ACTIVE, counter reset, suspension cleared.
    const after = await prisma.entity.findUnique({
      where: { entity_id: victim.entityId },
    });
    expect(after?.status).toBe("ACTIVE");
    expect(after?.failed_auth_attempts).toBe(0);
    expect(after?.suspended_at).toBeNull();

    // TAR untouched: no capability or hash drift (this rail grants nothing).
    const tarAfter = await prisma.tokenAttributeRepository.findUnique({
      where: { entity_id: victim.entityId },
    });
    expect(tarAfter?.tar_hash).toBe(tarBefore?.tar_hash);
    expect(tarAfter?.can_admin_org).toBe(tarBefore?.can_admin_org);
    expect(tarAfter?.can_admin_niov).toBe(tarBefore?.can_admin_niov);

    // Org membership untouched (none existed; none appeared).
    const memberships = await prisma.entityMembership.count({
      where: { child_id: victim.entityId },
    });
    expect(memberships).toBe(0);

    // Audit of record: ENTITY_REACTIVATED with full actor/target/reason
    // metadata and ZERO password material.
    const audit = await prisma.auditEvent.findFirst({
      where: {
        event_type: "ENTITY_REACTIVATED",
        target_entity_id: victim.entityId,
      },
      orderBy: { timestamp: "desc" },
    });
    expect(audit).not.toBeNull();
    expect(audit?.actor_entity_id).toBe(operator.entityId);
    const details = (audit?.details ?? {}) as Record<string, unknown>;
    expect(details.action).toBe("PLATFORM_LOCKOUT_CLEARED");
    expect(details.reason).toBe(REASON);
    expect(details.target_email).toBe(victim.email);
    expect(details.prior_status).toBe("SUSPENDED");
    expect(details.prior_failed_attempts).toBeGreaterThanOrEqual(5);
    const rawDetails = JSON.stringify(details);
    expect(rawDetails).not.toContain("password");
    expect(rawDetails).not.toContain("hash");

    // The whole point: the current password now logs in; a wrong one fails.
    const loginAfter = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: victim.email, password: victim.password, requested_operations: ["read"] },
      remoteAddress: randomIp(),
    });
    expect(loginAfter.statusCode).toBe(200);
    const badAfter = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: victim.email, password: "still-wrong", requested_operations: ["read"] },
      remoteAddress: randomIp(),
    });
    expect(badAfter.statusCode).toBe(401);
  });

  it("clears a lockout addressed by EMAIL (the identifier operators actually have)", async () => {
    const operator = await makePersonAndLogin({ can_admin_niov: true });
    const victim = await makeLockedOutVictim();
    const res = await app.inject({
      method: "POST",
      url: ROUTE(encodeURIComponent(victim.email)),
      headers: { authorization: `Bearer ${operator.token}` },
      payload: { reason: REASON },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { entity_id: string }).entity_id).toBe(victim.entityId);
    const after = await prisma.entity.findUnique({ where: { entity_id: victim.entityId } });
    expect(after?.status).toBe("ACTIVE");
    expect(after?.failed_auth_attempts).toBe(0);
  });

  it("refuses a suspension that is NOT lockout-caused (no general unsuspend backdoor)", async () => {
    const operator = await makePersonAndLogin({ can_admin_niov: true });
    // Admin-authored suspension: status flipped deliberately, counter clean,
    // no actorless lockout audit row of record (mirrors the org PATCH rail).
    const person = await makePersonAndLogin({});
    await prisma.entity.update({
      where: { entity_id: person.entityId },
      data: { status: "SUSPENDED", suspended_at: new Date() },
    });
    const res = await app.inject({
      method: "POST",
      url: ROUTE(person.entityId),
      headers: { authorization: `Bearer ${operator.token}` },
      payload: { reason: REASON },
    });
    expect(res.statusCode).toBe(409);
    expect((res.json() as { code: string }).code).toBe("LOCKOUT_NOT_LOCKOUT_CAUSED");
    const still = await prisma.entity.findUnique({
      where: { entity_id: person.entityId },
    });
    expect(still?.status).toBe("SUSPENDED"); // untouched
  });

  it("refuses an ACTIVE entity, a blank reason, and an unknown entity", async () => {
    const operator = await makePersonAndLogin({ can_admin_niov: true });
    const active = await makePersonAndLogin({});

    const notSuspended = await app.inject({
      method: "POST",
      url: ROUTE(active.entityId),
      headers: { authorization: `Bearer ${operator.token}` },
      payload: { reason: REASON },
    });
    expect(notSuspended.statusCode).toBe(409);
    expect((notSuspended.json() as { code: string }).code).toBe("LOCKOUT_NOT_SUSPENDED");

    const victim = await makeLockedOutVictim();
    const noReason = await app.inject({
      method: "POST",
      url: ROUTE(victim.entityId),
      headers: { authorization: `Bearer ${operator.token}` },
      payload: { reason: "   " },
    });
    expect(noReason.statusCode).toBe(400);
    expect((noReason.json() as { code: string }).code).toBe("LOCKOUT_REASON_REQUIRED");
    // Still suspended after the refused attempts.
    const still = await prisma.entity.findUnique({ where: { entity_id: victim.entityId } });
    expect(still?.status).toBe("SUSPENDED");

    const ghost = await app.inject({
      method: "POST",
      url: ROUTE("00000000-0000-4000-8000-00000000dead"),
      headers: { authorization: `Bearer ${operator.token}` },
      payload: { reason: REASON },
    });
    expect(ghost.statusCode).toBe(404);
  });

  it("org-admin-only and unauthenticated callers are refused (platform tier)", async () => {
    const orgAdmin = await makePersonAndLogin({ can_admin_org: true });
    const victim = await makeLockedOutVictim();

    const asOrgAdmin = await app.inject({
      method: "POST",
      url: ROUTE(victim.entityId),
      headers: { authorization: `Bearer ${orgAdmin.token}` },
      payload: { reason: REASON },
    });
    expect(asOrgAdmin.statusCode).toBe(403);

    const unauthenticated = await app.inject({
      method: "POST",
      url: ROUTE(victim.entityId),
      payload: { reason: REASON },
    });
    expect(unauthenticated.statusCode).toBe(401);

    const still = await prisma.entity.findUnique({ where: { entity_id: victim.entityId } });
    expect(still?.status).toBe("SUSPENDED"); // nothing moved
  });
});
