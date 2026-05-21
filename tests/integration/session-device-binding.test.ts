// FILE: session-device-binding.test.ts (integration)
// PURPOSE: GOVSEC.3D-A / GAP-A3 -- prove the device-binding SNAPSHOT substrate
//          (no enforcement): login + refresh snapshot an HMAC-SHA256 of the
//          normalized client user-agent onto Session.device_binding_hash; the
//          raw user-agent is never stored; the same user-agent yields the same
//          hash and different user-agents yield different hashes; a missing
//          user-agent snapshots null; refresh preserves GOVSEC.3A rotation;
//          validateSession is UNCHANGED (a bound session still validates with no
//          live-UA check); GOVSEC.3C-A activity tracking + 3C-B2 idle enforcement
//          remain intact; and NO device-mismatch audit event is emitted.
// CONNECTS TO: AuthService.login/validateSession/deviceBindingHash + createSession
//              snapshot + refresh route; @niov/database (prisma / createEntity /
//              computeTARHash).

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

const TEST_JWT_SECRET = "govsec3da-device-binding-secret-not-for-prod";
const PASSWORD = "govsec3da-correct-horse-battery";
const UA_A = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) NiovTest/1.0";
const UA_B = "Mozilla/5.0 (X11; Linux x86_64) NiovTest/2.0";
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

async function makePerson(): Promise<string> {
  const input = makeEntityInput({ entity_type: "PERSON", password: PASSWORD });
  await createEntity(input);
  return input.email!;
}

async function login(email: string, userAgent: string | null): Promise<{ session_id: string; token: string }> {
  const res = (await seedAuth.login(email, PASSWORD, ["read", "write"], {
    ip_address: null,
    user_agent: userAgent,
  })) as LoginResult;
  if (!res.ok) throw new Error(`login failed: ${JSON.stringify(res)}`);
  return { session_id: res.session_id, token: res.token };
}

async function bindingHashOf(sessionId: string): Promise<string | null> {
  const row = await prisma.session.findUnique({ where: { session_id: sessionId } });
  return row?.device_binding_hash ?? null;
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

describe("GOVSEC.3D-A device-binding snapshot substrate (GAP-A3; no enforcement)", () => {
  it("login with a user-agent snapshots a non-null device_binding_hash equal to the HMAC", async () => {
    const email = await makePerson();
    const s = await login(email, UA_A);
    const hash = await bindingHashOf(s.session_id);
    expect(hash).not.toBeNull();
    expect(hash).toBe(seedAuth.deviceBindingHash(UA_A));
  });

  it("the snapshot is not the raw user-agent and contains no raw user-agent substring", async () => {
    const email = await makePerson();
    const s = await login(email, UA_A);
    const hash = (await bindingHashOf(s.session_id))!;
    expect(hash).not.toBe(UA_A);
    expect(hash.includes(UA_A)).toBe(false);
    // a hex HMAC-SHA256 is 64 hex chars
    expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true);
  });

  it("the same normalized user-agent produces the same hash across logins", async () => {
    const e1 = await makePerson();
    const e2 = await makePerson();
    const s1 = await login(e1, UA_A);
    const s2 = await login(e2, `  ${UA_A}  `); // surrounding whitespace -> trimmed to the same
    expect(await bindingHashOf(s1.session_id)).toBe(await bindingHashOf(s2.session_id));
  });

  it("different user-agents produce different hashes", async () => {
    const e1 = await makePerson();
    const e2 = await makePerson();
    const s1 = await login(e1, UA_A);
    const s2 = await login(e2, UA_B);
    expect(await bindingHashOf(s1.session_id)).not.toBe(await bindingHashOf(s2.session_id));
  });

  it("a missing / empty / whitespace user-agent snapshots null", async () => {
    const eNull = await makePerson();
    const eEmpty = await makePerson();
    const eSpace = await makePerson();
    expect(await bindingHashOf((await login(eNull, null)).session_id)).toBeNull();
    expect(await bindingHashOf((await login(eEmpty, "")).session_id)).toBeNull();
    expect(await bindingHashOf((await login(eSpace, "   ")).session_id)).toBeNull();
  });

  it("refresh snapshots device_binding_hash onto the new session AND preserves GOVSEC.3A rotation", async () => {
    const email = await makePerson();
    const s = await login(email, UA_A);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      headers: { authorization: `Bearer ${s.token}`, "user-agent": UA_B },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { token: string; session_id: string };
    // new session carries the binding hash for the refresh client's user-agent
    expect(await bindingHashOf(body.session_id)).toBe(seedAuth.deviceBindingHash(UA_B));
    // GOVSEC.3A preserved: old session TERMINATED, old token denied, new token works
    const oldRow = await prisma.session.findUnique({ where: { session_id: s.session_id } });
    expect(oldRow!.status).toBe("TERMINATED");
    expect((await seedAuth.validateSession(s.token, "read")).valid).toBe(false);
    expect((await seedAuth.validateSession(body.token, "read")).valid).toBe(true);
  });

  it("3D-A does NOT enforce device binding: a bound session still validates (validateSession unchanged)", async () => {
    const email = await makePerson();
    const s = await login(email, UA_A);
    expect(await bindingHashOf(s.session_id)).toBe(seedAuth.deviceBindingHash(UA_A));
    // validateSession takes no client context and performs no binding check
    const check = await seedAuth.validateSession(s.token, "read");
    expect(check.valid).toBe(true);
  });

  it("GOVSEC.3C-A activity tracking still works on a bound session", async () => {
    const email = await makePerson();
    const s = await login(email, UA_A);
    await prisma.session.update({
      where: { session_id: s.session_id },
      data: { last_activity_at: new Date(Date.now() - 5 * 60_000) },
    });
    const before = (await prisma.session.findUnique({ where: { session_id: s.session_id } }))!.last_activity_at!;
    await seedAuth.validateSession(s.token, "read");
    const after = (await prisma.session.findUnique({ where: { session_id: s.session_id } }))!.last_activity_at!;
    expect(after.getTime()).toBeGreaterThan(before.getTime());
  });

  it("no device-mismatch / device-binding audit event is emitted in 3D-A", async () => {
    const email = await makePerson();
    const s = await login(email, UA_A);
    const entityId = (await prisma.session.findUnique({ where: { session_id: s.session_id } }))!.entity_id;
    await seedAuth.validateSession(s.token, "read");
    const rows = await prisma.auditEvent.findMany({ where: { actor_entity_id: entityId } });
    const deviceRows = rows.filter((r) => {
      const reason = ((r.details ?? {}) as Record<string, unknown>).reason;
      return reason === "device_mismatch" || r.event_type === "DEVICE_MISMATCH";
    });
    expect(deviceRows.length).toBe(0);
  });

  it("3C-B2 idle enforcement remains intact for a bound session with an idle window", async () => {
    const platform = await makePlatformAdmin();
    const adminEmail = `${TEST_PREFIX}g3da_${randomUUID()}@niov.test`;
    const body = await executePhase0({
      company_name: `${TEST_PREFIX}g3daco_${randomUUID()}`,
      industry: "TECH",
      admin_email: adminEmail,
      admin_password: PASSWORD,
      admin_first_name: null,
      admin_last_name: null,
      actor_entity_id: platform,
    });
    await prisma.orgSettings.upsert({
      where: { org_entity_id: body.org_entity_id },
      update: { idle_timeout_minutes: 1 },
      create: { org_entity_id: body.org_entity_id, idle_timeout_minutes: 1 },
    });
    const s = await login(adminEmail, UA_A);
    expect(await bindingHashOf(s.session_id)).toBe(seedAuth.deviceBindingHash(UA_A));
    await prisma.session.update({
      where: { session_id: s.session_id },
      data: { last_activity_at: new Date(Date.now() - 2 * HOUR_MS) },
    });
    const check = await seedAuth.validateSession(s.token, "read");
    expect(check.valid).toBe(false);
    if (!check.valid) expect(check.code).toBe("SESSION_EXPIRED");
  });
});
