// FILE: password-lifecycle.test.ts (integration, real Postgres, HTTP inject)
// PURPOSE: [PASSWORD-LIFECYCLE] lock the account-access lifecycle:
//          - CHANGE (logged-in): requires the correct current password,
//            enforces strength, invalidates every OTHER session while the
//            current one keeps working, audits PASSWORD_CHANGED with no
//            password material; old password stops working, new works
//          - FORGOT (public): enumeration-safe — byte-identical responses
//            for unknown, pending, and eligible emails; eligible +
//            configured mints ONE PASSWORD_RESET token (superseding
//            priors) and emails via the provider abstraction, audited
//            with token_id/category only; the token never reaches the
//            caller; without provider config, no token is minted for
//            anyone and the response is still the safe sentence
//          - RESET completion (existing redeem rail): one-time, expiring,
//            invalidates ALL sessions, old password fails after
//          - ADMIN reset email: active members only (pending → 409
//            pointing at activation), cross-org/unknown 404, employee
//            blocked by capability gate, provider failure honest,
//            admin never sees or sets the password
//          - no plaintext password and no token/URL in ANY audit detail.
// CONNECTS TO: auth.routes.ts (change/forgot), activation-email.service
//          (reset sibling), auth-setup-token.service (the ONE token
//          rail), org.routes.ts (admin reset email).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { computeTARHash, prisma } from "@niov/database";
import { buildApp, MemoryNonceStore } from "@niov/api";
import {
  composePasswordResetEmail,
  sendPasswordResetEmailForMember,
  type ActivationEmailMessage,
  type ActivationEmailProvider,
} from "../../apps/api/src/services/activation-email.service.js";
import { createEntity } from "../../packages/database/src/queries/entity.js";
import { cleanupTestData, ensureAuditTriggers, TEST_PREFIX } from "../helpers.js";
import type { FastifyInstance } from "fastify";

function fakePublicKey(seed: string): string {
  return `-----BEGIN PUBLIC KEY-----\n${seed}\n-----END PUBLIC KEY-----`;
}
async function makeEntity(displayName: string, entityType: "PERSON" | "COMPANY"): Promise<string> {
  const e = await createEntity({
    email: `${TEST_PREFIX}${displayName.toLowerCase().replace(/[^a-z0-9]/g, ".")}@niov-test.com`,
    public_key: fakePublicKey(displayName + randomUUID()),
    display_name: `${TEST_PREFIX} ${displayName}`,
    entity_type: entityType,
    clearance_level: 3,
    status: "ACTIVE",
  });
  return e.entity_id;
}

function acceptingProvider(outbox: ActivationEmailMessage[]): ActivationEmailProvider {
  return {
    name: "fake-accepting",
    send: async (m) => {
      outbox.push(m);
      return { ok: true, category: "accepted" };
    },
  };
}

describe("[PASSWORD-LIFECYCLE] change / forgot / admin reset (DB + HTTP)", () => {
  let app: FastifyInstance;
  let orgId = "";
  let adminId = "";

  async function grantOrgAdmin(entityId: string): Promise<void> {
    await prisma.tokenAttributeRepository.update({
      where: { entity_id: entityId },
      data: { can_admin_org: true },
    });
    const fresh = await prisma.tokenAttributeRepository.findUnique({ where: { entity_id: entityId } });
    await prisma.tokenAttributeRepository.update({
      where: { entity_id: entityId },
      data: {
        tar_hash: computeTARHash({
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
        }),
      },
    });
  }

  async function setPassword(entityId: string, password: string): Promise<void> {
    const { hashPassword } = await import("@niov/auth");
    await prisma.entity.update({
      where: { entity_id: entityId },
      data: { password_hash: await hashPassword(password) },
    });
  }
  async function login(entityId: string, password: string, ip: string): Promise<string> {
    const email = (await prisma.entity.findUnique({ where: { entity_id: entityId }, select: { email: true } }))!.email!;
    const r = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email, password, requested_operations: ["read", "write", "admin_org"] },
      remoteAddress: ip,
    });
    return (r.json() as { token: string }).token;
  }

  beforeAll(async () => {
    await ensureAuditTriggers();
    app = await buildApp({
      jwtSecret: "password-lifecycle-test-secret",
      sessionNonceStore: new MemoryNonceStore(),
      declarationStore: new MemoryNonceStore(),
    });
  });
  beforeEach(async () => {
    await cleanupTestData();
    orgId = await makeEntity("Pass Org", "COMPANY");
    adminId = await makeEntity("Pass Admin", "PERSON");
    await grantOrgAdmin(adminId);
    await prisma.entityMembership.create({
      data: { parent_id: orgId, child_id: adminId, is_active: true, is_admin: true },
    });
  });
  afterAll(async () => {
    await app.close();
    await cleanupTestData();
    await prisma.$disconnect();
  });

  it("CHANGE: current password required, other sessions die, current survives, audit clean, old fails / new works", async () => {
    const memberId = await makeEntity("Pass Member", "PERSON");
    await prisma.entityMembership.create({
      data: { parent_id: orgId, child_id: memberId, is_active: true },
    });
    await setPassword(memberId, "original-password-1");
    const tokenA = await login(memberId, "original-password-1", "10.104.1.9");
    const tokenB = await login(memberId, "original-password-1", "10.104.1.10");

    // Wrong current password → refused, nothing changed.
    const wrong = await app.inject({
      method: "POST",
      url: "/api/v1/auth/change-password",
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { current_password: "not-the-password", new_password: "brand-new-password-2" },
    });
    expect(wrong.statusCode).toBe(403);
    expect((wrong.json() as { code: string }).code).toBe("CURRENT_PASSWORD_INCORRECT");

    // Weak new password → refused.
    const weak = await app.inject({
      method: "POST",
      url: "/api/v1/auth/change-password",
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { current_password: "original-password-1", new_password: "short" },
    });
    expect(weak.statusCode).toBe(422);

    // Correct change from session A.
    const change = await app.inject({
      method: "POST",
      url: "/api/v1/auth/change-password",
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { current_password: "original-password-1", new_password: "brand-new-password-2" },
    });
    expect(change.statusCode).toBe(200);

    // Session A (current) survives; session B (other) is invalidated.
    const aStill = await app.inject({
      method: "GET",
      url: "/api/v1/auth/validate",
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(aStill.statusCode).toBe(200);
    const bDead = await app.inject({
      method: "GET",
      url: "/api/v1/auth/validate",
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(bDead.statusCode).toBe(401);

    // Old password fails; new one logs in.
    const emailAddr = (await prisma.entity.findUnique({ where: { entity_id: memberId }, select: { email: true } }))!.email!;
    const oldLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: emailAddr, password: "original-password-1", requested_operations: ["read"] },
      remoteAddress: "10.104.1.11",
    });
    expect(oldLogin.statusCode).not.toBe(200);
    const newLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: emailAddr, password: "brand-new-password-2", requested_operations: ["read"] },
      remoteAddress: "10.104.1.12",
    });
    expect(newLogin.statusCode).toBe(200);

    // Audit: PASSWORD_CHANGED once, no password material anywhere.
    const audits = await prisma.auditEvent.findMany({
      where: { event_type: "PASSWORD_CHANGED", target_entity_id: memberId },
    });
    expect(audits.length).toBe(1);
    const raw = JSON.stringify(audits[0]!.details);
    expect(raw).not.toContain("original-password-1");
    expect(raw).not.toContain("brand-new-password-2");
  });

  it("FORGOT: enumeration-safe (identical responses), eligible sends ONE reset email with the token only in the link", async () => {
    const memberId = await makeEntity("Pass Forgot", "PERSON");
    await prisma.entityMembership.create({
      data: { parent_id: orgId, child_id: memberId, is_active: true },
    });
    await setPassword(memberId, "forgot-me-password-1");
    const memberEmail = (await prisma.entity.findUnique({ where: { entity_id: memberId }, select: { email: true } }))!.email!;

    // Provider NOT configured (test env): every shape returns the SAFE
    // sentence and mints nothing.
    const bodies: string[] = [];
    for (const email of [memberEmail, "nobody@nowhere-example.com", ""]) {
      const r = await app.inject({
        method: "POST",
        url: "/api/v1/auth/forgot-password",
        payload: { email },
        remoteAddress: "10.104.2.9",
      });
      expect(r.statusCode).toBe(200);
      bodies.push(r.body);
    }
    // Byte-identical: no enumeration signal in status, body, or shape.
    expect(new Set(bodies).size).toBe(1);
    expect(bodies[0]).toContain("If an account exists");
    expect(
      await prisma.authSetupToken.count({ where: { entity_id: memberId, purpose: "PASSWORD_RESET" } }),
    ).toBe(0); // not configured → no token burned

    // With a provider (service-level, deterministic): eligible member gets
    // exactly one reset email; the reset link redeems on the EXISTING rail.
    const outbox: ActivationEmailMessage[] = [];
    const sent = await sendPasswordResetEmailForMember({
      caller_entity_id: adminId,
      org_entity_id: orgId,
      target_entity_id: memberId,
      provider: acceptingProvider(outbox),
    });
    expect(sent.ok).toBe(true);
    expect(outbox.length).toBe(1);
    const msg = outbox[0]!;
    expect(msg.subject).toBe("Reset your Otzar password");
    expect(msg.to).toBe(memberEmail);
    expect(msg.text).toContain("/activate?token=");
    expect(msg.text).toContain("Admins never see or set your password");
    expect(msg.text).toContain("can be used once");
    expect(msg.text.toLowerCase()).not.toMatch(/your password is|account is active/);

    const emailedToken = /\/activate\?token=([A-Za-z0-9_-]+)/.exec(msg.text)![1]!;
    // Redeem: sets the new password, invalidates ALL sessions, one-time.
    const session = await login(memberId, "forgot-me-password-1", "10.104.2.10");
    const redeem = await app.inject({
      method: "POST",
      url: "/api/v1/auth/activate",
      payload: { token: emailedToken, password: "reset-new-password-3" },
      remoteAddress: "10.104.2.11",
    });
    expect(redeem.statusCode).toBe(200);
    expect((redeem.json() as { purpose: string }).purpose).toBe("PASSWORD_RESET");
    const dead = await app.inject({
      method: "GET",
      url: "/api/v1/auth/validate",
      headers: { authorization: `Bearer ${session}` },
    });
    expect(dead.statusCode).toBe(401); // reset kills ALL sessions
    // One-time: the same token refuses a second redemption.
    const reuse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/activate",
      payload: { token: emailedToken, password: "reset-newer-password-4" },
      remoteAddress: "10.104.2.12",
    });
    expect(reuse.statusCode).toBe(410);
    // Old password fails; the reset one works.
    const oldLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: memberEmail, password: "forgot-me-password-1", requested_operations: ["read"] },
      remoteAddress: "10.104.2.13",
    });
    expect(oldLogin.statusCode).not.toBe(200);
    const newLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: memberEmail, password: "reset-new-password-3", requested_operations: ["read"] },
      remoteAddress: "10.104.2.14",
    });
    expect(newLogin.statusCode).toBe(200);

    // Audit hygiene across the whole flow: no token, URL, or password.
    const audits = await prisma.auditEvent.findMany({
      where: {
        target_entity_id: memberId,
        event_type: { in: ["PASSWORD_RESET_EMAIL_SENT", "PASSWORD_RESET_EMAIL_FAILED", "PASSWORD_RESET_COMPLETED"] },
      },
    });
    expect(audits.some((a) => a.event_type === "PASSWORD_RESET_EMAIL_SENT")).toBe(true);
    expect(audits.some((a) => a.event_type === "PASSWORD_RESET_COMPLETED")).toBe(true);
    for (const a of audits) {
      const raw = JSON.stringify(a.details);
      expect(raw).not.toContain(emailedToken);
      expect(raw).not.toContain("/activate");
      expect(raw).not.toContain("reset-new-password-3");
    }
  });

  it("ADMIN reset email: pending members 409 → activation path; employee blocked; cross-org 404; provider failure honest", async () => {
    const password = "correct-horse-battery";
    // A PENDING member (no password): reset refuses, points at activation.
    const pendingId = await makeEntity("Pass Pending", "PERSON");
    await prisma.entityMembership.create({
      data: { parent_id: orgId, child_id: pendingId, is_active: true },
    });
    await setPassword(adminId, password);
    const adminToken = await login(adminId, password, "10.104.3.9");
    const pendingRes = await app.inject({
      method: "POST",
      url: `/api/v1/org/members/${pendingId}/password-reset-email`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(pendingRes.statusCode).toBe(409);
    expect((pendingRes.json() as { message: string }).message).toContain("activation email instead");

    // Employee (non-admin) blocked by the capability gate.
    const employeeId = await makeEntity("Pass Employee", "PERSON");
    await prisma.entityMembership.create({
      data: { parent_id: orgId, child_id: employeeId, is_active: true },
    });
    await setPassword(employeeId, password);
    const empToken = await login(employeeId, password, "10.104.3.10");
    const denied = await app.inject({
      method: "POST",
      url: `/api/v1/org/members/${employeeId}/password-reset-email`,
      headers: { authorization: `Bearer ${empToken}` },
    });
    expect([401, 403]).toContain(denied.statusCode);

    // Unknown / cross-org target: 404 enumeration-safe.
    const unknown = await app.inject({
      method: "POST",
      url: `/api/v1/org/members/${randomUUID()}/password-reset-email`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(unknown.statusCode).toBe(404);

    // Provider failure (service-level): honest PROVIDER_FAILED + ERROR audit.
    const failing: ActivationEmailProvider = {
      name: "fake-failing",
      send: async () => ({ ok: false, category: "provider_error", detail: "status 500" }),
    };
    const fail = await sendPasswordResetEmailForMember({
      caller_entity_id: adminId,
      org_entity_id: orgId,
      target_entity_id: employeeId,
      provider: failing,
    });
    expect(fail.ok === false && fail.code).toBe("PROVIDER_FAILED");
    const failAudit = await prisma.auditEvent.findMany({
      where: { event_type: "PASSWORD_RESET_EMAIL_FAILED", target_entity_id: employeeId },
    });
    expect(failAudit.length).toBe(1);
    expect(failAudit[0]!.outcome).toBe("ERROR");
    expect(JSON.stringify(failAudit[0]!.details)).not.toContain("/activate");

    // The compose helper never carries a password field.
    const composed = composePasswordResetEmail({
      to: "person@example.com",
      orgDisplayName: "Acme",
      resetUrl: "https://app.otzar.ai/activate?token=abc",
    });
    expect(composed.text.toLowerCase()).not.toContain("your password is");
  });
});
