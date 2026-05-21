// FILE: session-idle-snapshot.test.ts (integration)
// PURPOSE: GOVSEC.3C-B1 / GAP-A1 -- prove the idle-window SNAPSHOT substrate
//          (Option B; no enforcement): login + refresh snapshot
//          OrgSettings.idle_timeout_minutes onto Session.idle_timeout_minutes;
//          orgless/default/null orgs snapshot null; validateSession performs NO
//          idle enforcement (a snapshot-set + aged session still validates) and
//          NO new org-settings read drives a rejection; the GOVSEC.3A refresh
//          rotation is preserved; GOVSEC.3C-A activity tracking still works; and
//          no SESSION_EXPIRED idle_timeout audit is emitted.
// CONNECTS TO: AuthService.login/validateSession + createSession snapshot +
//              getOrgSettingsOrDefaults + executePhase0 + refresh route;
//              @niov/database (prisma / createEntity / computeTARHash).

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildApp,
  AuthService,
  MemoryNonceStore,
  executePhase0,
  type LoginResult,
} from "@niov/api";
import { createEntity, computeTARHash, prisma } from "@niov/database";
import { cleanupTestData, ensureAuditTriggers, makeEntityInput, TEST_PREFIX } from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "govsec3cb1-idle-snapshot-secret-not-for-prod";
const PASSWORD = "govsec3cb1-correct-horse-battery";

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
  const adminEmail = `${TEST_PREFIX}g3cb1_${randomUUID()}@niov.test`;
  const body = await executePhase0({
    company_name: `${TEST_PREFIX}g3cb1co_${randomUUID()}`,
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

async function login(email: string): Promise<{ session_id: string; token: string }> {
  const res = (await seedAuth.login(email, PASSWORD, ["read", "write"], { ip_address: null })) as LoginResult;
  if (!res.ok) throw new Error(`login failed: ${JSON.stringify(res)}`);
  return { session_id: res.session_id, token: res.token };
}

async function idleSnapshot(sessionId: string): Promise<number | null> {
  const row = await prisma.session.findUnique({ where: { session_id: sessionId } });
  return row?.idle_timeout_minutes ?? null;
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

describe("GOVSEC.3C-B1 idle-window snapshot substrate (GAP-A1; no enforcement)", () => {
  it("login snapshots OrgSettings.idle_timeout_minutes onto the created session", async () => {
    const platform = await makePlatformAdmin();
    const { adminEmail } = await createOrgWithIdle(platform, 30);
    const s = await login(adminEmail);
    expect(await idleSnapshot(s.session_id)).toBe(30);
  });

  it("login by an orgless entity (defaults) snapshots null", async () => {
    const input = makeEntityInput({ entity_type: "PERSON", password: PASSWORD });
    await createEntity(input);
    const s = await login(input.email!);
    expect(await idleSnapshot(s.session_id)).toBeNull();
  });

  it("login with OrgSettings.idle_timeout_minutes null snapshots null", async () => {
    const platform = await makePlatformAdmin();
    const { adminEmail } = await createOrgWithIdle(platform, null);
    const s = await login(adminEmail);
    expect(await idleSnapshot(s.session_id)).toBeNull();
  });

  it("refresh snapshots idle_timeout_minutes onto the new session AND preserves GOVSEC.3A rotation", async () => {
    const platform = await makePlatformAdmin();
    const { adminEmail } = await createOrgWithIdle(platform, 45);
    const s = await login(adminEmail);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      headers: { authorization: `Bearer ${s.token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { token: string; session_id: string };
    // new session carries the snapshot
    expect(await idleSnapshot(body.session_id)).toBe(45);
    // GOVSEC.3A preserved: old session TERMINATED, old token denied, new token works
    const oldRow = await prisma.session.findUnique({ where: { session_id: s.session_id } });
    expect(oldRow!.status).toBe("TERMINATED");
    const oldValidate = await seedAuth.validateSession(s.token, "read");
    expect(oldValidate.valid).toBe(false);
    const newValidate = await seedAuth.validateSession(body.token, "read");
    expect(newValidate.valid).toBe(true);
  });

  it("3C-B1 does NOT enforce idle: a snapshot-set + aged session still validates", async () => {
    const platform = await makePlatformAdmin();
    const { adminEmail } = await createOrgWithIdle(platform, 1); // 1-min idle window
    const s = await login(adminEmail);
    expect(await idleSnapshot(s.session_id)).toBe(1);
    // age last_activity_at far past the 1-min window
    await prisma.session.update({
      where: { session_id: s.session_id },
      data: { last_activity_at: new Date(Date.now() - 60 * 60_000) },
    });
    const check = await seedAuth.validateSession(s.token, "read");
    // no enforcement in 3C-B1 -> still valid despite being idle
    expect(check.valid).toBe(true);
  });

  it("no SESSION_EXPIRED idle_timeout audit event is emitted in 3C-B1", async () => {
    const platform = await makePlatformAdmin();
    const { adminEmail } = await createOrgWithIdle(platform, 1);
    const s = await login(adminEmail);
    const entityId = (await prisma.session.findUnique({ where: { session_id: s.session_id } }))!.entity_id;
    await prisma.session.update({
      where: { session_id: s.session_id },
      data: { last_activity_at: new Date(Date.now() - 60 * 60_000) },
    });
    await seedAuth.validateSession(s.token, "read");
    const rows = await prisma.auditEvent.findMany({ where: { actor_entity_id: entityId, event_type: "SESSION_EXPIRED" } });
    const idle = rows.filter((r) => ((r.details ?? {}) as Record<string, unknown>).reason === "idle_timeout");
    expect(idle.length).toBe(0);
  });

  it("GOVSEC.3C-A activity tracking still works (last_activity_at touched on validate)", async () => {
    const platform = await makePlatformAdmin();
    const { adminEmail } = await createOrgWithIdle(platform, 30);
    const s = await login(adminEmail);
    await prisma.session.update({
      where: { session_id: s.session_id },
      data: { last_activity_at: new Date(Date.now() - 5 * 60_000) },
    });
    const before = (await prisma.session.findUnique({ where: { session_id: s.session_id } }))!.last_activity_at!;
    await seedAuth.validateSession(s.token, "read");
    const after = (await prisma.session.findUnique({ where: { session_id: s.session_id } }))!.last_activity_at!;
    expect(after.getTime()).toBeGreaterThan(before.getTime());
    // and the session remains valid (nonce intact -> no Redis refresh broke it)
    const again = await seedAuth.validateSession(s.token, "read");
    expect(again.valid).toBe(true);
  });
});
