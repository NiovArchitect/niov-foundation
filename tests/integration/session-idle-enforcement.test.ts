// FILE: session-idle-enforcement.test.ts (integration)
// PURPOSE: GOVSEC.3C-B2 / GAP-A1 + GAP-A2 -- prove runtime idle-timeout
//          enforcement built on the GOVSEC.3C-A activity substrate + the
//          GOVSEC.3C-B1 idle-window snapshot. Covers: the markSessionIdleExpired
//          helper (atomic ACTIVE->EXPIRED, idempotent, non-ACTIVE untouched);
//          validateSession denies an idle-expired session with SESSION_EXPIRED +
//          flips the row to EXPIRED; emits exactly one SESSION_EXPIRED
//          idle_timeout audit event (DENIED, on the actor's chain, safe metadata
//          only); best-effort nonce delete with DB EXPIRED authoritative; null
//          snapshot => no enforcement; within-window => valid; idle-expired
//          session is never touched; single-emit under concurrency; replay stays
//          denied with no duplicate idle_timeout row; verifyAuditChain stays
//          valid. No new audit literal, no schema change, no org-settings lookup
//          in validateSession.
// CONNECTS TO: AuthService.validateSession + markSessionIdleExpired +
//              emitSessionDenial + createSession snapshot + executePhase0;
//              @niov/database (prisma / createEntity / computeTARHash /
//              markSessionIdleExpired / verifyAuditChain).

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildApp,
  AuthService,
  MemoryNonceStore,
  executePhase0,
  type LoginResult,
} from "@niov/api";
import {
  createEntity,
  computeTARHash,
  markSessionIdleExpired,
  verifyAuditChain,
  prisma,
} from "@niov/database";
import { cleanupTestData, ensureAuditTriggers, makeEntityInput, TEST_PREFIX } from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "govsec3cb2-idle-enforcement-secret-not-for-prod";
const PASSWORD = "govsec3cb2-correct-horse-battery";
const HOUR_MS = 60 * 60_000;

let app: FastifyInstance;
let seedAuth: AuthService;
let sessionNonceStore: MemoryNonceStore;

async function makePlatformAdmin(): Promise<string> {
  const input = makeEntityInput({ entity_type: "PERSON", password: PASSWORD });
  const entity = await createEntity(input);
  await prisma.tokenAttributeRepository.update({
    where: { entity_id: entity.entity_id },
    data: { can_admin_niov: true },
  });
  const fresh = await prisma.tokenAttributeRepository.findUnique({ where: { entity_id: entity.entity_id } });
  const newHash = computeTARHash({
    can_login: fresh!.can_login,
    can_read_capsules: fresh!.can_read_capsules,
    can_write_capsules: fresh!.can_write_capsules,
    can_share_capsules: fresh!.can_share_capsules,
    can_create_hives: fresh!.can_create_hives,
    can_access_external_api: fresh!.can_access_external_api,
    can_admin_niov: fresh!.can_admin_niov,
    can_admin_org: fresh!.can_admin_org,
    clearance_ceiling: fresh!.clearance_ceiling,
    monetization_role: fresh!.monetization_role,
    compliance_frameworks: fresh!.compliance_frameworks,
    status: fresh!.status,
  });
  await prisma.tokenAttributeRepository.update({ where: { entity_id: entity.entity_id }, data: { tar_hash: newHash } });
  return entity.entity_id;
}

async function createOrgWithIdle(actorId: string, idleMinutes: number | null): Promise<{ adminEmail: string }> {
  const adminEmail = `${TEST_PREFIX}g3cb2_${randomUUID()}@niov.test`;
  const body = await executePhase0({
    company_name: `${TEST_PREFIX}g3cb2co_${randomUUID()}`,
    industry: "TECH",
    admin_email: adminEmail,
    admin_password: PASSWORD,
    admin_first_name: null,
    admin_last_name: null,
    actor_entity_id: actorId,
  });
  await prisma.orgSettings.upsert({
    where: { org_entity_id: body.org_entity_id },
    update: { idle_timeout_minutes: idleMinutes },
    create: { org_entity_id: body.org_entity_id, idle_timeout_minutes: idleMinutes },
  });
  return { adminEmail };
}

async function login(email: string): Promise<{ session_id: string; token: string; entity_id: string }> {
  const res = (await seedAuth.login(email, PASSWORD, ["read", "write"], { ip_address: null })) as LoginResult;
  if (!res.ok) throw new Error(`login failed: ${JSON.stringify(res)}`);
  const row = await prisma.session.findUnique({ where: { session_id: res.session_id } });
  return { session_id: res.session_id, token: res.token, entity_id: row!.entity_id };
}

async function age(sessionId: string, ms: number): Promise<void> {
  await prisma.session.update({
    where: { session_id: sessionId },
    data: { last_activity_at: new Date(Date.now() - ms) },
  });
}

async function statusOf(sessionId: string): Promise<string> {
  return (await prisma.session.findUnique({ where: { session_id: sessionId } }))!.status;
}

async function idleAuditRows(entityId: string): Promise<Array<Record<string, unknown>>> {
  const rows = await prisma.auditEvent.findMany({
    where: { actor_entity_id: entityId, event_type: "SESSION_EXPIRED" },
  });
  return rows.filter((r) => ((r.details ?? {}) as Record<string, unknown>).reason === "idle_timeout") as unknown as Array<Record<string, unknown>>;
}

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
  sessionNonceStore = new MemoryNonceStore();
  app = await buildApp({ jwtSecret: TEST_JWT_SECRET, sessionNonceStore });
  seedAuth = new AuthService({ jwtSecret: TEST_JWT_SECRET, nonceStore: sessionNonceStore });
}, 300_000);

afterAll(async () => {
  await app.close();
  await cleanupTestData();
  await prisma.$disconnect();
});

describe("GOVSEC.3C-B2 markSessionIdleExpired helper", () => {
  it("transitions an ACTIVE session to EXPIRED and returns true", async () => {
    const input = makeEntityInput({ entity_type: "PERSON", password: PASSWORD });
    await createEntity(input);
    const s = await login(input.email!);
    expect(await statusOf(s.session_id)).toBe("ACTIVE");
    const won = await markSessionIdleExpired(s.session_id);
    expect(won).toBe(true);
    expect(await statusOf(s.session_id)).toBe("EXPIRED");
  });

  it("is idempotent: a second call returns false and the status stays EXPIRED", async () => {
    const input = makeEntityInput({ entity_type: "PERSON", password: PASSWORD });
    await createEntity(input);
    const s = await login(input.email!);
    expect(await markSessionIdleExpired(s.session_id)).toBe(true);
    expect(await markSessionIdleExpired(s.session_id)).toBe(false);
    expect(await statusOf(s.session_id)).toBe("EXPIRED");
  });

  it("does not change a non-ACTIVE (TERMINATED) session", async () => {
    const input = makeEntityInput({ entity_type: "PERSON", password: PASSWORD });
    await createEntity(input);
    const s = await login(input.email!);
    await prisma.session.update({ where: { session_id: s.session_id }, data: { status: "TERMINATED" } });
    expect(await markSessionIdleExpired(s.session_id)).toBe(false);
    expect(await statusOf(s.session_id)).toBe("TERMINATED");
  });
});

describe("GOVSEC.3C-B2 idle-timeout enforcement (GAP-A1 + GAP-A2)", () => {
  it("denies an idle-expired session with SESSION_EXPIRED and flips the row to EXPIRED", async () => {
    const platform = await makePlatformAdmin();
    const { adminEmail } = await createOrgWithIdle(platform, 1); // 1-min idle window
    const s = await login(adminEmail);
    await age(s.session_id, 2 * HOUR_MS);
    const check = await seedAuth.validateSession(s.token, "read");
    expect(check.valid).toBe(false);
    if (!check.valid) expect(check.code).toBe("SESSION_EXPIRED");
    expect(await statusOf(s.session_id)).toBe("EXPIRED");
  });

  it("emits exactly one SESSION_EXPIRED idle_timeout audit event (DENIED, actor + session bound)", async () => {
    const platform = await makePlatformAdmin();
    const { adminEmail } = await createOrgWithIdle(platform, 1);
    const s = await login(adminEmail);
    await age(s.session_id, 2 * HOUR_MS);
    await seedAuth.validateSession(s.token, "read");
    const rows = await prisma.auditEvent.findMany({
      where: { actor_entity_id: s.entity_id, event_type: "SESSION_EXPIRED" },
    });
    const idle = rows.filter((r) => ((r.details ?? {}) as Record<string, unknown>).reason === "idle_timeout");
    expect(idle.length).toBe(1);
    expect(idle[0]!.outcome).toBe("DENIED");
    expect(idle[0]!.session_id).toBe(s.session_id);
    expect(idle[0]!.actor_entity_id).toBe(s.entity_id);
  });

  it("idle_timeout audit details carry only safe-class metadata (no secrets / content / vectors)", async () => {
    const platform = await makePlatformAdmin();
    const { adminEmail } = await createOrgWithIdle(platform, 1);
    const s = await login(adminEmail);
    await age(s.session_id, 2 * HOUR_MS);
    await seedAuth.validateSession(s.token, "read");
    const idle = await idleAuditRows(s.entity_id);
    expect(idle.length).toBe(1);
    const details = (idle[0]!.details ?? {}) as Record<string, unknown>;
    expect(details.reason).toBe("idle_timeout");
    const serialized = JSON.stringify(idle[0]!.details).toLowerCase();
    for (const forbidden of [
      s.token.toLowerCase(),
      "bearer ",
      "jwt",
      "nonce",
      "password",
      "secret",
      "tar_hash",
      "vector",
      "embedding",
      "distance",
      "cosine",
      "raw_query",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("old token cannot pass after idle expiration -- DB EXPIRED is authoritative", async () => {
    const platform = await makePlatformAdmin();
    const { adminEmail } = await createOrgWithIdle(platform, 1);
    const s = await login(adminEmail);
    await age(s.session_id, 2 * HOUR_MS);
    const first = await seedAuth.validateSession(s.token, "read");
    expect(first.valid).toBe(false);
    // even re-presenting the same (now-EXPIRED) token is denied
    const replay = await seedAuth.validateSession(s.token, "read");
    expect(replay.valid).toBe(false);
    if (!replay.valid) expect(replay.code).toBe("SESSION_EXPIRED");
  });

  it("null idle_timeout_minutes snapshot => no idle enforcement (aged session still validates)", async () => {
    const platform = await makePlatformAdmin();
    const { adminEmail } = await createOrgWithIdle(platform, null);
    const s = await login(adminEmail);
    await age(s.session_id, 2 * HOUR_MS);
    const check = await seedAuth.validateSession(s.token, "read");
    expect(check.valid).toBe(true);
    expect(await statusOf(s.session_id)).toBe("ACTIVE");
    expect((await idleAuditRows(s.entity_id)).length).toBe(0);
  });

  it("activity within the idle window remains valid", async () => {
    const platform = await makePlatformAdmin();
    const { adminEmail } = await createOrgWithIdle(platform, 30); // 30-min window
    const s = await login(adminEmail);
    await age(s.session_id, 5 * 60_000); // 5 min ago -- well within 30
    const check = await seedAuth.validateSession(s.token, "read");
    expect(check.valid).toBe(true);
    expect(await statusOf(s.session_id)).toBe("ACTIVE");
  });

  it("an idle-expired session is NOT touched (last_activity_at unchanged on denial)", async () => {
    const platform = await makePlatformAdmin();
    const { adminEmail } = await createOrgWithIdle(platform, 1);
    const s = await login(adminEmail);
    await age(s.session_id, 2 * HOUR_MS);
    const before = (await prisma.session.findUnique({ where: { session_id: s.session_id } }))!.last_activity_at!;
    await seedAuth.validateSession(s.token, "read");
    const after = (await prisma.session.findUnique({ where: { session_id: s.session_id } }))!.last_activity_at!;
    expect(after.getTime()).toBe(before.getTime());
  });

  it("under concurrency only one idle_timeout audit row is emitted and both calls deny", async () => {
    const platform = await makePlatformAdmin();
    const { adminEmail } = await createOrgWithIdle(platform, 1);
    const s = await login(adminEmail);
    await age(s.session_id, 2 * HOUR_MS);
    const [a, b] = await Promise.all([
      seedAuth.validateSession(s.token, "read"),
      seedAuth.validateSession(s.token, "read"),
    ]);
    expect(a.valid).toBe(false);
    expect(b.valid).toBe(false);
    if (!a.valid) expect(a.code).toBe("SESSION_EXPIRED");
    if (!b.valid) expect(b.code).toBe("SESSION_EXPIRED");
    expect(await statusOf(s.session_id)).toBe("EXPIRED");
    expect((await idleAuditRows(s.entity_id)).length).toBe(1);
  });

  it("replay after idle expiry stays denied with no duplicate idle_timeout row (later uses are row_expired)", async () => {
    const platform = await makePlatformAdmin();
    const { adminEmail } = await createOrgWithIdle(platform, 1);
    const s = await login(adminEmail);
    await age(s.session_id, 2 * HOUR_MS);
    await seedAuth.validateSession(s.token, "read"); // transition + idle_timeout
    await seedAuth.validateSession(s.token, "read"); // EXPIRED branch -> row_expired
    await seedAuth.validateSession(s.token, "read"); // EXPIRED branch -> row_expired
    expect((await idleAuditRows(s.entity_id)).length).toBe(1);
    const rows = await prisma.auditEvent.findMany({
      where: { actor_entity_id: s.entity_id, event_type: "SESSION_EXPIRED" },
    });
    const rowExpired = rows.filter((r) => ((r.details ?? {}) as Record<string, unknown>).reason === "row_expired");
    expect(rowExpired.length).toBeGreaterThanOrEqual(2);
  });

  it("verifyAuditChain remains valid after an idle_timeout emission", async () => {
    const platform = await makePlatformAdmin();
    const { adminEmail } = await createOrgWithIdle(platform, 1);
    const s = await login(adminEmail);
    await age(s.session_id, 2 * HOUR_MS);
    await seedAuth.validateSession(s.token, "read");
    const chain = await verifyAuditChain(s.entity_id);
    expect(chain.valid).toBe(true);
  });
});
