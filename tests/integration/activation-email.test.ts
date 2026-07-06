// FILE: activation-email.test.ts (integration, real Postgres, HTTP inject)
// PURPOSE: [ACT-EMAIL] lock activation-email delivery on the existing
//          rail: a fake ACCEPTED provider sends exactly one safe message
//          (activation link present; no password; the freshly minted
//          token appears ONLY in the link and supersedes priors);
//          "sent" audits ACTIVATION_EMAIL_SENT with token_id + category
//          and NEVER the token/URL/body; provider failure returns an
//          honest PROVIDER_FAILED (audited as ERROR) and the copy-link
//          fallback wording; the not-configured provider refuses BEFORE
//          minting (no token burned, honest EMAIL_NOT_CONFIGURED);
//          already-active members refuse 409; cross-org / unknown refuse
//          404; non-admins are blocked by the capability preHandler;
//          the batch endpoint caps at 20 and reports per-row results;
//          activation semantics are unchanged (the emailed token
//          activates through the existing public /auth/activate rail).
// CONNECTS TO: activation-email.service.ts, org.routes.ts (send/batch/
//          status), auth-setup-token.service.ts (the one token rail),
//          P0-ONBOARD onboarding-activation.test.ts.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { computeTARHash, prisma } from "@niov/database";
import { buildApp, MemoryNonceStore } from "@niov/api";
import {
  composeActivationEmail,
  isActivationEmailConfigured,
  sendActivationEmailForMember,
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
const failingProvider: ActivationEmailProvider = {
  name: "fake-failing",
  send: async () => ({ ok: false, category: "provider_error", detail: "status 500" }),
};
const notConfiguredProvider: ActivationEmailProvider = {
  name: "not-configured",
  send: async () => ({ ok: false, category: "not_configured" }),
};

describe("[ACT-EMAIL] activation-email delivery (DB + HTTP)", () => {
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

  async function makePendingMember(name: string): Promise<string> {
    const id = await makeEntity(name, "PERSON");
    // Pending = no password_hash yet.
    await prisma.entityMembership.create({
      data: { parent_id: orgId, child_id: id, is_active: true },
    });
    return id;
  }

  beforeAll(async () => {
    await ensureAuditTriggers();
    app = await buildApp({
      jwtSecret: "activation-email-test-secret",
      sessionNonceStore: new MemoryNonceStore(),
      declarationStore: new MemoryNonceStore(),
    });
  });
  beforeEach(async () => {
    await cleanupTestData();
    orgId = await makeEntity("Mail Org", "COMPANY");
    adminId = await makeEntity("Mail Admin", "PERSON");
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

  it("accepted send: safe message, token only in the link, prior tokens superseded, audited clean; the emailed link ACTIVATES", async () => {
    const memberId = await makePendingMember("Mail Pending");
    const outbox: ActivationEmailMessage[] = [];

    // Pre-existing token — the send must supersede it.
    const { mintSetupToken } = await import("../../apps/api/src/services/auth-setup-token.service.js");
    const prior = await mintSetupToken({
      entity_id: memberId, org_entity_id: orgId, purpose: "ACTIVATION", created_by: adminId,
    });

    const r = await sendActivationEmailForMember({
      caller_entity_id: adminId,
      org_entity_id: orgId,
      target_entity_id: memberId,
      provider: acceptingProvider(outbox),
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.status).toBe("sent");

    // Exactly one message, to the member's recorded email, safe content.
    expect(outbox.length).toBe(1);
    const msg = outbox[0]!;
    const memberEmail = (await prisma.entity.findUnique({
      where: { entity_id: memberId }, select: { email: true },
    }))!.email!;
    expect(msg.to).toBe(memberEmail);
    expect(msg.subject).toBe("Activate your Otzar account");
    expect(msg.text).toContain("/activate?token=");
    expect(msg.text).toContain("can be used once");
    expect(msg.text).toContain("If you did not expect this invite");
    expect(msg.text).toContain("choose your own password");
    expect(msg.text.toLowerCase()).not.toMatch(/your password is|full access|account is active|ai twin is ready/);
    // No internal ids outside the link.
    expect(msg.text).not.toContain(memberId);
    expect(msg.text).not.toContain(orgId);

    // The prior token was superseded; the emailed token is the live one.
    const priorRow = await prisma.authSetupToken.findUnique({ where: { token_id: prior.token_id } });
    expect(priorRow!.used_at).not.toBeNull();
    const emailedToken = /\/activate\?token=([A-Za-z0-9_-]+)/.exec(msg.text)![1]!;
    expect(emailedToken).not.toBe(prior.token);

    // Audit: SENT once, token_id + category only — never token/URL/body.
    const audits = await prisma.auditEvent.findMany({
      where: { event_type: "ACTIVATION_EMAIL_SENT", target_entity_id: memberId },
    });
    expect(audits.length).toBe(1);
    const raw = JSON.stringify(audits[0]!.details);
    expect(raw).toContain("accepted");
    expect(raw).not.toContain(emailedToken);
    expect(raw).not.toContain("/activate");
    expect(raw).not.toContain("Activate your Otzar account");

    // Activation semantics unchanged: the emailed link activates through
    // the EXISTING public rail.
    const activate = await app.inject({
      method: "POST",
      url: "/api/v1/auth/activate",
      payload: { token: emailedToken, password: "brand-new-strong-pass-1" },
      remoteAddress: "10.102.1.9",
    });
    expect(activate.statusCode).toBe(200);
    const activated = await prisma.entity.findUnique({
      where: { entity_id: memberId }, select: { password_hash: true },
    });
    expect(typeof activated!.password_hash).toBe("string");
  });

  it("honest refusals: not-configured refuses BEFORE minting; provider failure audits ERROR with fallback wording; already-active 409-shaped; unknown/cross-org refused", async () => {
    const memberId = await makePendingMember("Mail Pending Two");

    // Not configured: refuse before minting — zero tokens burned.
    const before = await prisma.authSetupToken.count({ where: { entity_id: memberId } });
    const nc = await sendActivationEmailForMember({
      caller_entity_id: adminId, org_entity_id: orgId,
      target_entity_id: memberId, provider: notConfiguredProvider,
    });
    expect(nc.ok).toBe(false);
    if (nc.ok === false) {
      expect(nc.code).toBe("EMAIL_NOT_CONFIGURED");
      expect(nc.message).toContain("copy the activation link instead");
    }
    expect(await prisma.authSetupToken.count({ where: { entity_id: memberId } })).toBe(before);
    expect(isActivationEmailConfigured()).toBe(false); // test env has no key

    // Provider failure: honest result + ERROR audit, no token in audit.
    const pf = await sendActivationEmailForMember({
      caller_entity_id: adminId, org_entity_id: orgId,
      target_entity_id: memberId, provider: failingProvider,
    });
    expect(pf.ok).toBe(false);
    if (pf.ok === false) {
      expect(pf.code).toBe("PROVIDER_FAILED");
      expect(pf.message).toContain("Nothing was delivered");
    }
    const failAudits = await prisma.auditEvent.findMany({
      where: { event_type: "ACTIVATION_EMAIL_FAILED", target_entity_id: memberId },
    });
    expect(failAudits.length).toBe(1);
    expect(failAudits[0]!.outcome).toBe("ERROR");
    expect(JSON.stringify(failAudits[0]!.details)).not.toContain("/activate");

    // Already-active member refuses.
    const { hashPassword } = await import("@niov/auth");
    await prisma.entity.update({
      where: { entity_id: memberId },
      data: { password_hash: await hashPassword("already-set-pass-1") },
    });
    const active = await sendActivationEmailForMember({
      caller_entity_id: adminId, org_entity_id: orgId,
      target_entity_id: memberId, provider: failingProvider,
    });
    expect(active.ok === false && active.code).toBe("ALREADY_ACTIVE");

    // Cross-org / unknown target refuses without minting or sending.
    const otherOrg = await makeEntity("Mail Other Org", "COMPANY");
    const cross = await sendActivationEmailForMember({
      caller_entity_id: adminId, org_entity_id: otherOrg,
      target_entity_id: memberId, provider: failingProvider,
    });
    expect(cross.ok === false && cross.code).toBe("ENTITY_NOT_IN_ORG");

    // Pure compose: the message never carries a password field.
    const composed = composeActivationEmail({
      to: "person@example.com",
      orgDisplayName: "Acme",
      activationUrl: "https://app.otzar.ai/activate?token=abc",
      expiresAt: new Date(Date.now() + 7 * 86_400_000),
    });
    expect(composed.text).toContain("Acme");
    expect(composed.text.toLowerCase()).not.toContain("your password is");
  });

  it("HTTP: status endpoint honest; non-admin blocked; batch caps at 20 with per-row results", async () => {
    const password = "correct-horse-battery";
    const { hashPassword } = await import("@niov/auth");
    const employeeId = await makePendingMember("Mail Employee");
    await prisma.entity.update({
      where: { entity_id: employeeId },
      data: { password_hash: await hashPassword(password) },
    });
    const empEmail = (await prisma.entity.findUnique({ where: { entity_id: employeeId }, select: { email: true } }))!.email!;
    const empLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: empEmail, password, requested_operations: ["read", "write", "admin_org"] },
      remoteAddress: "10.102.1.10",
    });
    const empToken = (empLogin.json() as { token: string }).token;
    const denied = await app.inject({
      method: "POST",
      url: `/api/v1/org/members/${employeeId}/activation-email`,
      headers: { authorization: `Bearer ${empToken}` },
    });
    expect([401, 403]).toContain(denied.statusCode);

    await prisma.entity.update({
      where: { entity_id: adminId },
      data: { password_hash: await hashPassword(password) },
    });
    const adminEmail = (await prisma.entity.findUnique({ where: { entity_id: adminId }, select: { email: true } }))!.email!;
    const adminLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: adminEmail, password, requested_operations: ["read", "write", "admin_org"] },
      remoteAddress: "10.102.1.11",
    });
    const adminToken = (adminLogin.json() as { token: string }).token;

    // Status: honest not-configured in the test environment.
    const status = await app.inject({
      method: "GET",
      url: "/api/v1/org/activation-email/status",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(status.statusCode).toBe(200);
    expect((status.json() as { configured: boolean }).configured).toBe(false);

    // Single send via HTTP with no provider configured → honest 422, and
    // the response NEVER contains a token.
    const pending = await makePendingMember("Mail Pending Three");
    const send = await app.inject({
      method: "POST",
      url: `/api/v1/org/members/${pending}/activation-email`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(send.statusCode).toBe(422);
    expect((send.json() as { code: string }).code).toBe("EMAIL_NOT_CONFIGURED");
    expect(JSON.stringify(send.json())).not.toMatch(/token"/);

    // Batch: cap enforced; per-row results returned.
    const over = await app.inject({
      method: "POST",
      url: "/api/v1/org/members/activation-emails",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { entity_ids: Array.from({ length: 21 }, () => randomUUID()) },
    });
    expect(over.statusCode).toBe(422);
    const batch = await app.inject({
      method: "POST",
      url: "/api/v1/org/members/activation-emails",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { entity_ids: [pending, randomUUID()] },
    });
    expect(batch.statusCode).toBe(200);
    const bj = batch.json() as { sent: number; failed: number; results: Array<{ ok: boolean; code?: string }> };
    expect(bj.sent).toBe(0); // not configured — every row honest-fails
    expect(bj.failed).toBe(2);
    expect(bj.results.every((r) => r.ok === false)).toBe(true);
  });
});
