// FILE: onboarding-activation.test.ts (integration, real Postgres, HTTP inject)
// PURPOSE: [P0-ONBOARD] lock the repaired onboarding activation loop:
//          invite creates a credential-less (login-fails-closed) member and
//          mints a REAL one-time activation token (hashed at rest, expiring,
//          org-scoped); the public /auth/activate redeems it exactly once to
//          set the member's own password; resets ride the same rail via the
//          admin-gated mint endpoint (old sessions invalidated, old password
//          dead); the legacy /auth/admin-reset stub is GONE; non-admins and
//          cross-org admins are refused; nothing leaks (no plaintext token /
//          token_hash / password_hash in any response or audit row).
// CONNECTS TO: services/auth-setup-token.service.ts, routes/auth.routes.ts
//          (POST /auth/activate), routes/org.routes.ts (invite + mint +
//          activation_status projections).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { buildApp, MemoryNonceStore } from "@niov/api";
import { computeTARHash, createEntity, prisma } from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeEntityInput,
  TEST_PREFIX,
} from "../helpers.js";
import {
  mintSetupToken,
  redeemSetupToken,
} from "../../apps/api/src/services/auth-setup-token.service.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "onboarding-activation-test-secret";
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

let app: FastifyInstance;

async function cleanupTokens(): Promise<void> {
  const ents = await prisma.entity.findMany({
    where: { display_name: { startsWith: TEST_PREFIX } },
    select: { entity_id: true },
  });
  const ids = ents.map((e) => e.entity_id);
  if (ids.length === 0) return;
  await prisma.authSetupToken.deleteMany({
    where: { OR: [{ entity_id: { in: ids } }, { org_entity_id: { in: ids } }] },
  });
}

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTokens();
  await cleanupTestData();
  app = await buildApp({
    jwtSecret: TEST_JWT_SECRET,
    sessionNonceStore: new MemoryNonceStore(),
    declarationStore: new MemoryNonceStore(),
  });
});
afterAll(async () => {
  await app.close();
  await cleanupTokens();
  await cleanupTestData();
  await prisma.$disconnect();
});

async function makeOrg(): Promise<string> {
  const org = await createEntity({
    entity_type: "COMPANY",
    display_name: `${TEST_PREFIX}org_${randomUUID()}`,
    email: `${TEST_PREFIX}org_${randomUUID()}@niov.test`,
    public_key: "test-public-key",
    clearance_level: 0,
  });
  // Phase-3 twin minting requires the org's default enterprise hive
  // (Phase 0 normally creates it).
  await prisma.hive.create({
    data: {
      hive_name: `${TEST_PREFIX}default_hive_${org.entity_id.slice(0, 8)}`,
      created_by: org.entity_id,
      hive_type: "ENTERPRISE",
      org_entity_id: org.entity_id,
      is_default_enterprise: true,
    },
  });
  return org.entity_id;
}

async function makeAdmin(orgId: string): Promise<{ entityId: string; token: string }> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const entity = await createEntity(input);
  await prisma.entityMembership.create({
    data: { parent_id: orgId, child_id: entity.entity_id, role_title: "ADMIN", is_active: true, is_admin: true },
  });
  await prisma.tokenAttributeRepository.update({
    where: { entity_id: entity.entity_id },
    data: { can_admin_org: true },
  });
  const fresh = await prisma.tokenAttributeRepository.findUnique({
    where: { entity_id: entity.entity_id },
  });
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
  await prisma.tokenAttributeRepository.update({
    where: { entity_id: entity.entity_id },
    data: { tar_hash: newHash },
  });
  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: input.email, password, requested_operations: ["read", "write"] },
    remoteAddress: `10.91.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 254) + 1}`,
  });
  expect(login.statusCode).toBe(200);
  return { entityId: entity.entity_id, token: (login.json() as { token: string }).token };
}

/** Invite one member through the REAL admin flow: create (no password) →
 *  Phase-3 invite (twin mint + activation token). */
async function inviteMember(
  adminToken: string,
  email: string,
): Promise<{ entityId: string; activationToken: string; twinId: string }> {
  const created = await app.inject({
    method: "POST",
    url: "/api/v1/org/members",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { email, first_name: `${TEST_PREFIX}Invitee`, last_name: RUN },
  });
  expect(created.statusCode).toBe(201);
  const entityId = (created.json() as { entity_id: string }).entity_id;
  const invited = await app.inject({
    method: "POST",
    url: "/api/v1/org/onboarding/invite",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { entity_id: entityId },
  });
  if (invited.statusCode !== 200) {
    throw new Error(`invite failed: ${invited.statusCode} ${invited.body}`);
  }
  const body = invited.json() as Record<string, unknown>;
  // The legacy unpersisted credential is GONE from the response.
  expect(body.activation_credential).toBeUndefined();
  expect(typeof body.activation_token).toBe("string");
  expect(typeof body.activation_expires_at).toBe("string");
  return {
    entityId,
    activationToken: body.activation_token as string,
    twinId: body.twin_id as string,
  };
}

async function loginAs(email: string, password: string) {
  return app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email, password, requested_operations: ["read"] },
    remoteAddress: `10.92.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 254) + 1}`,
  });
}

describe("[P0-ONBOARD] activation-token onboarding loop (DB + HTTP)", () => {
  it("1+2+7: invite creates an activation-pending member with NO usable credential; the token is stored HASHED", async () => {
    const orgId = await makeOrg();
    const admin = await makeAdmin(orgId);
    const email = `${TEST_PREFIX}invitee1.${RUN}@niov.test`;
    const { entityId, activationToken } = await inviteMember(admin.token, email);

    // No credential exists — login fails closed BEFORE activation.
    const row = await prisma.entity.findUnique({
      where: { entity_id: entityId },
      select: { password_hash: true },
    });
    expect(row!.password_hash).toBeNull();
    expect((await loginAs(email, "anything-at-all")).statusCode).toBe(401);

    // Stored hashed, never plaintext; sha256 binding verified.
    const tokenRow = await prisma.authSetupToken.findFirst({
      where: { entity_id: entityId, purpose: "ACTIVATION" },
    });
    expect(tokenRow).not.toBeNull();
    expect(tokenRow!.token_hash).not.toBe(activationToken);
    expect(tokenRow!.token_hash).toBe(
      createHash("sha256").update(activationToken, "utf8").digest("hex"),
    );
    expect(tokenRow!.used_at).toBeNull();
    expect(tokenRow!.expires_at.getTime()).toBeGreaterThan(Date.now());

    // Admin list projection names the state — safely.
    const list = await app.inject({
      method: "GET",
      url: "/api/v1/org/entities?type=PERSON&take=100",
      headers: { authorization: `Bearer ${admin.token}` },
    });
    const items = (list.json() as { items: Array<Record<string, unknown>> }).items;
    const me = items.find((i) => i.entity_id === entityId);
    expect(me?.activation_status).toBe("activation_pending");
    const rawList = JSON.stringify(list.json());
    expect(rawList).not.toContain("password_hash");
    expect(rawList).not.toContain("token_hash");
    expect(rawList).not.toContain(activationToken);

    // USER_INVITED audited with token_id — never the token.
    const audit = await prisma.auditEvent.findFirst({
      where: { event_type: "USER_INVITED", target_entity_id: entityId },
      orderBy: { timestamp: "desc" },
    });
    expect(audit).not.toBeNull();
    const auditRaw = JSON.stringify(audit!.details);
    expect(auditRaw).toContain(tokenRow!.token_id);
    expect(auditRaw).not.toContain(activationToken);
    expect(auditRaw).not.toContain(tokenRow!.token_hash);
  });

  it("3+4+6+12: activation sets the password ONCE (reuse fails 410), login works, twin + membership stay coherent", async () => {
    const orgId = await makeOrg();
    const admin = await makeAdmin(orgId);
    const email = `${TEST_PREFIX}invitee2.${RUN}@niov.test`;
    const { entityId, activationToken, twinId } = await inviteMember(admin.token, email);

    const newPassword = `Activated-${RUN}-pw1`;
    const redeemed = await app.inject({
      method: "POST",
      url: "/api/v1/auth/activate",
      payload: { token: activationToken, password: newPassword },
    });
    expect(redeemed.statusCode).toBe(200);
    expect((redeemed.json() as { purpose: string }).purpose).toBe("ACTIVATION");

    // Login now works; the invitee is NOT an admin.
    const login = await loginAs(email, newPassword);
    expect(login.statusCode).toBe(200);
    expect((login.json() as { allowed_operations: string[] }).allowed_operations).not.toContain("admin_org");

    // Reuse fails one-time, honestly.
    const reuse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/activate",
      payload: { token: activationToken, password: "Another-pass-123" },
    });
    expect(reuse.statusCode).toBe(410);
    expect((reuse.json() as { code: string }).code).toBe("TOKEN_USED");

    // Twin + membership survived activation untouched.
    const twin = await prisma.twinConfig.findUnique({ where: { twin_id: twinId } });
    expect(twin).not.toBeNull();
    const membership = await prisma.entityMembership.findFirst({
      where: { parent_id: orgId, child_id: entityId, is_active: true },
    });
    expect(membership).not.toBeNull();
    // USER_ACTIVATED audited.
    expect(
      await prisma.auditEvent.findFirst({
        where: { event_type: "USER_ACTIVATED", target_entity_id: entityId },
      }),
    ).not.toBeNull();
    // Status projection flips to active.
    const list = await app.inject({
      method: "GET",
      url: "/api/v1/org/entities?type=PERSON&take=100",
      headers: { authorization: `Bearer ${admin.token}` },
    });
    const me = (list.json() as { items: Array<Record<string, unknown>> }).items.find(
      (i) => i.entity_id === entityId,
    );
    expect(me?.activation_status).toBe("active");
  });

  it("5: an expired token fails with honest copy and sets nothing", async () => {
    const orgId = await makeOrg();
    const admin = await makeAdmin(orgId);
    const email = `${TEST_PREFIX}invitee3.${RUN}@niov.test`;
    const { entityId, activationToken } = await inviteMember(admin.token, email);
    await prisma.authSetupToken.updateMany({
      where: { entity_id: entityId, purpose: "ACTIVATION" },
      data: { expires_at: new Date(Date.now() - 1000) },
    });
    const redeemed = await app.inject({
      method: "POST",
      url: "/api/v1/auth/activate",
      payload: { token: activationToken, password: `Late-${RUN}-pw111` },
    });
    expect(redeemed.statusCode).toBe(410);
    expect((redeemed.json() as { code: string }).code).toBe("TOKEN_EXPIRED");
    const row = await prisma.entity.findUnique({
      where: { entity_id: entityId },
      select: { password_hash: true },
    });
    expect(row!.password_hash).toBeNull();
    // Admin regenerates — the expired member becomes pending again.
    const regen = await app.inject({
      method: "POST",
      url: `/api/v1/org/members/${entityId}/activation-link`,
      headers: { authorization: `Bearer ${admin.token}` },
    });
    expect(regen.statusCode).toBe(200);
    const fresh = (regen.json() as { token: string }).token;
    expect(fresh).not.toBe(activationToken);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/auth/activate",
          payload: { token: fresh, password: `Fresh-${RUN}-pw111` },
        })
      ).statusCode,
    ).toBe(200);
  });

  it("8: no unauthenticated reset endpoint exists — the admin-reset stub is GONE and /auth/activate never mints", async () => {
    const gone = await app.inject({
      method: "POST",
      url: "/api/v1/auth/admin-reset",
      payload: { entity_id: randomUUID() },
    });
    expect(gone.statusCode).toBe(404);
    // A bogus token gets a clean 404 — no oracle, nothing created.
    const before = await prisma.authSetupToken.count();
    const bogus = await app.inject({
      method: "POST",
      url: "/api/v1/auth/activate",
      payload: { token: "not-a-real-token-aaaaaaaaaaaa", password: "Whatever-123456" },
    });
    expect(bogus.statusCode).toBe(404);
    expect(await prisma.authSetupToken.count()).toBe(before);
  });

  it("9+10: mint endpoints are admin-gated and org-scoped — non-admins 403, cross-org admins 404", async () => {
    const orgA = await makeOrg();
    const orgB = await makeOrg();
    const adminA = await makeAdmin(orgA);
    const adminB = await makeAdmin(orgB);
    const email = `${TEST_PREFIX}invitee4.${RUN}@niov.test`;
    const { entityId, activationToken } = await inviteMember(adminA.token, email);

    // Activate, then try minting as a non-admin (the invitee themselves).
    await app.inject({
      method: "POST",
      url: "/api/v1/auth/activate",
      payload: { token: activationToken, password: `Member-${RUN}-pw1` },
    });
    const memberLogin = await loginAs(email, `Member-${RUN}-pw1`);
    const memberToken = (memberLogin.json() as { token: string }).token;
    const asMember = await app.inject({
      method: "POST",
      url: `/api/v1/org/members/${entityId}/password-reset-link`,
      headers: { authorization: `Bearer ${memberToken}` },
    });
    expect(asMember.statusCode).toBe(403);

    // Cross-org admin: honest 404, no token minted.
    const crossOrg = await app.inject({
      method: "POST",
      url: `/api/v1/org/members/${entityId}/password-reset-link`,
      headers: { authorization: `Bearer ${adminB.token}` },
    });
    expect(crossOrg.statusCode).toBe(404);
    expect(
      await prisma.authSetupToken.count({
        where: { entity_id: entityId, purpose: "PASSWORD_RESET" },
      }),
    ).toBe(0);

    // Already-active member cannot get a SECOND activation link.
    const secondActivation = await app.inject({
      method: "POST",
      url: `/api/v1/org/members/${entityId}/activation-link`,
      headers: { authorization: `Bearer ${adminA.token}` },
    });
    expect(secondActivation.statusCode).toBe(409);
  });

  it("reset rail: old password dies, new works, active sessions invalidated, audited — same one-time semantics", async () => {
    const orgId = await makeOrg();
    const admin = await makeAdmin(orgId);
    const email = `${TEST_PREFIX}invitee5.${RUN}@niov.test`;
    const { entityId, activationToken } = await inviteMember(admin.token, email);
    const firstPassword = `First-${RUN}-pw111`;
    await app.inject({
      method: "POST",
      url: "/api/v1/auth/activate",
      payload: { token: activationToken, password: firstPassword },
    });
    const oldSession = await loginAs(email, firstPassword);
    const oldToken = (oldSession.json() as { token: string }).token;

    const mint = await app.inject({
      method: "POST",
      url: `/api/v1/org/members/${entityId}/password-reset-link`,
      headers: { authorization: `Bearer ${admin.token}` },
    });
    expect(mint.statusCode).toBe(200);
    const resetToken = (mint.json() as { token: string }).token;
    expect(
      await prisma.auditEvent.findFirst({
        where: { event_type: "PASSWORD_RESET_LINK_CREATED", target_entity_id: entityId },
      }),
    ).not.toBeNull();

    const secondPassword = `Second-${RUN}-pw222`;
    const redeemed = await app.inject({
      method: "POST",
      url: "/api/v1/auth/activate",
      payload: { token: resetToken, password: secondPassword },
    });
    expect(redeemed.statusCode).toBe(200);
    expect((redeemed.json() as { purpose: string }).purpose).toBe("PASSWORD_RESET");

    // Old password dead; new works; old session invalidated.
    expect((await loginAs(email, firstPassword)).statusCode).toBe(401);
    expect((await loginAs(email, secondPassword)).statusCode).toBe(200);
    const validate = await app.inject({
      method: "GET",
      url: "/api/v1/auth/validate",
      headers: { authorization: `Bearer ${oldToken}` },
    });
    expect(validate.statusCode).toBe(401);
    expect(
      await prisma.auditEvent.findFirst({
        where: { event_type: "PASSWORD_RESET_COMPLETED", target_entity_id: entityId },
      }),
    ).not.toBeNull();
  });

  it("11: leak sweep — no plaintext token, token_hash, or password material in ANY response or audit row", async () => {
    const orgId = await makeOrg();
    const admin = await makeAdmin(orgId);
    const email = `${TEST_PREFIX}invitee6.${RUN}@niov.test`;
    const { entityId, activationToken } = await inviteMember(admin.token, email);
    const password = `Sweep-${RUN}-pw111`;
    await app.inject({
      method: "POST",
      url: "/api/v1/auth/activate",
      payload: { token: activationToken, password },
    });
    const tokenRow = await prisma.authSetupToken.findFirst({
      where: { entity_id: entityId },
      select: { token_hash: true },
    });
    // Every admin projection stays clean.
    for (const url of [
      "/api/v1/org/entities?type=PERSON&take=100",
      `/api/v1/org/entities/${entityId}`,
    ]) {
      const r = await app.inject({
        method: "GET",
        url,
        headers: { authorization: `Bearer ${admin.token}` },
      });
      const raw = JSON.stringify(r.json());
      expect(raw).not.toContain("password_hash");
      expect(raw).not.toContain(tokenRow!.token_hash);
      expect(raw).not.toContain(activationToken);
      expect(raw).not.toContain(password);
    }
    // Every onboarding audit row stays clean.
    const audits = await prisma.auditEvent.findMany({
      where: {
        target_entity_id: entityId,
        event_type: {
          in: ["USER_INVITED", "USER_ACTIVATED", "ACTIVATION_LINK_CREATED", "PASSWORD_RESET_LINK_CREATED", "PASSWORD_RESET_COMPLETED"],
        },
      },
    });
    expect(audits.length).toBeGreaterThan(0);
    for (const a of audits) {
      const raw = JSON.stringify(a.details);
      expect(raw).not.toContain(activationToken);
      expect(raw).not.toContain(tokenRow!.token_hash);
      expect(raw).not.toContain(password);
      expect(raw).not.toContain("password_hash");
    }
  });

  it("service hardening: weak passwords refused; minting invalidates the prior open link", async () => {
    const orgId = await makeOrg();
    const admin = await makeAdmin(orgId);
    const email = `${TEST_PREFIX}invitee7.${RUN}@niov.test`;
    const { entityId, activationToken } = await inviteMember(admin.token, email);
    const weak = await redeemSetupToken({ token: activationToken, password: "short" });
    expect(weak.ok).toBe(false);
    if (weak.ok === false) expect(weak.code).toBe("WEAK_PASSWORD");
    // A second mint kills the first link.
    const second = await mintSetupToken({
      entity_id: entityId,
      org_entity_id: orgId,
      purpose: "ACTIVATION",
      created_by: admin.entityId,
    });
    const oldOne = await redeemSetupToken({
      token: activationToken,
      password: `Valid-${RUN}-pw111`,
    });
    expect(oldOne.ok).toBe(false);
    const newOne = await redeemSetupToken({
      token: second.token,
      password: `Valid-${RUN}-pw111`,
    });
    expect(newOne.ok).toBe(true);
  });
});
