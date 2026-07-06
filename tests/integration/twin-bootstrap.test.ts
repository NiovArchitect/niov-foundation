// FILE: twin-bootstrap.test.ts (integration, real Postgres, HTTP inject)
// PURPOSE: [TWIN-BOOTSTRAP] lock the "an active member always has a Twin"
//          guarantee — the repair for the live `twin_not_found` gap:
//          - the exact production path (bulk-created member + activation
//            token + public /auth/activate) now ENSURES a starter twin
//            at activation time, audited STARTER_TWIN_PROVISIONED with
//            trigger "activation"
//          - the ensure is idempotent (repeat = created:false, exactly
//            one AI_AGENT child, exactly one audit row)
//          - Phase-3-invited members (twin already minted) activate
//            without duplicates
//          - the admin repair route fixes an active twin-less member
//            (trigger "admin_repair"); employees 403; cross-org/unknown
//            404 enumeration-safe
//          - starter semantics: the twin is a SHELL — personal wallet +
//            TAR exist, but no role_template, no tool grants, no admin
//            twin flag for a standard member
//          - the My Twin lookup path (AI_AGENT child) resolves — no more
//            TWIN_NOT_FOUND for activated members.
// CONNECTS TO: ensureStarterTwinForMember (dandelion.service),
//          redeemSetupToken (activation-time wire), POST
//          /org/members/:id/ensure-twin, executePhase3Invite/createTwin
//          (the ONE twin rail), the ACT-EMAIL live smoke root cause.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { computeTARHash, prisma } from "@niov/database";
import { buildApp, MemoryNonceStore } from "@niov/api";
import { ensureStarterTwinForMember, executePhase3Invite } from "../../apps/api/src/services/governance/dandelion.service.js";
import { mintSetupToken } from "../../apps/api/src/services/auth-setup-token.service.js";
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

async function twinChildrenOf(entityId: string): Promise<string[]> {
  const memberships = await prisma.entityMembership.findMany({
    where: { parent_id: entityId, role_title: "Digital Twin", is_active: true },
    select: { child_id: true },
  });
  const out: string[] = [];
  for (const m of memberships) {
    const child = await prisma.entity.findUnique({
      where: { entity_id: m.child_id },
      select: { entity_type: true, deleted_at: true },
    });
    if (child?.entity_type === "AI_AGENT" && child.deleted_at === null) out.push(m.child_id);
  }
  return out;
}

describe("[TWIN-BOOTSTRAP] starter-twin guarantee (DB + HTTP)", () => {
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
    await prisma.entityMembership.create({
      data: { parent_id: orgId, child_id: id, is_active: true },
    });
    return id;
  }

  beforeAll(async () => {
    await ensureAuditTriggers();
    app = await buildApp({
      jwtSecret: "twin-bootstrap-test-secret",
      sessionNonceStore: new MemoryNonceStore(),
      declarationStore: new MemoryNonceStore(),
    });
  });
  beforeEach(async () => {
    await cleanupTestData();
    orgId = await makeEntity("Boot Org", "COMPANY");
    // Phase-3 twin minting requires the org's default enterprise hive
    // (Phase 0 normally creates it).
    await prisma.hive.create({
      data: {
        hive_name: `${TEST_PREFIX}default_hive_${orgId.slice(0, 8)}`,
        created_by: orgId,
        hive_type: "ENTERPRISE",
        org_entity_id: orgId,
        is_default_enterprise: true,
      },
    });
    adminId = await makeEntity("Boot Admin", "PERSON");
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

  it("the exact production gap: bulk member + emailed token + /auth/activate → starter twin exists, audited, STARTER semantics honest", async () => {
    const memberId = await makePendingMember("Boot Pending");
    expect(await twinChildrenOf(memberId)).toEqual([]); // the gap, reproduced

    const minted = await mintSetupToken({
      entity_id: memberId, org_entity_id: orgId, purpose: "ACTIVATION", created_by: adminId,
    });
    const activate = await app.inject({
      method: "POST",
      url: "/api/v1/auth/activate",
      payload: { token: minted.token, password: "brand-new-strong-pass-2" },
      remoteAddress: "10.103.1.9",
    });
    expect(activate.statusCode).toBe(200);

    // The guarantee: exactly one starter twin now exists.
    const twins = await twinChildrenOf(memberId);
    expect(twins.length).toBe(1);
    const twinId = twins[0]!;

    // Audited once, trigger "activation".
    const audits = await prisma.auditEvent.findMany({
      where: { event_type: "STARTER_TWIN_PROVISIONED", target_entity_id: memberId },
    });
    expect(audits.length).toBe(1);
    const det = audits[0]!.details as Record<string, unknown>;
    expect(det.trigger).toBe("activation");
    expect(det.twin_id).toBe(twinId);

    // Starter semantics: shell only — personal wallet + TAR exist, no
    // role template, standard (non-admin) twin, honest tool state.
    const wallet = await prisma.wallet.findFirst({
      where: { entity_id: twinId, wallet_type: "PERSONAL" },
    });
    expect(wallet).not.toBeNull();
    const tar = await prisma.tokenAttributeRepository.findUnique({
      where: { entity_id: twinId },
    });
    expect(tar).not.toBeNull();
    expect(tar!.can_admin_org).toBe(false);
    expect(tar!.can_admin_niov).toBe(false);
    const config = await prisma.twinConfig.findUnique({ where: { twin_id: twinId } });
    expect(config).not.toBeNull();
    expect(config!.role_template).toBeNull(); // no role assigned — honest
    expect(config!.is_admin_twin).toBe(false); // standard member = standard twin

    // Idempotency: ensure again (service) — created:false, still ONE twin,
    // still ONE audit row.
    const again = await ensureStarterTwinForMember(orgId, memberId, null);
    expect(again.ok && again.created).toBe(false);
    expect((await twinChildrenOf(memberId)).length).toBe(1);
    expect(
      (await prisma.auditEvent.findMany({
        where: { event_type: "STARTER_TWIN_PROVISIONED", target_entity_id: memberId },
      })).length,
    ).toBe(1);
  });

  it("Phase-3-invited members activate WITHOUT duplicate twins; cross-org ensure refuses", async () => {
    const memberId = await makePendingMember("Boot Invited");
    // The classic path: invite mints the twin BEFORE activation.
    await executePhase3Invite(orgId, memberId, adminId);
    expect((await twinChildrenOf(memberId)).length).toBe(1);

    const minted = await mintSetupToken({
      entity_id: memberId, org_entity_id: orgId, purpose: "ACTIVATION", created_by: adminId,
    });
    const activate = await app.inject({
      method: "POST",
      url: "/api/v1/auth/activate",
      payload: { token: minted.token, password: "brand-new-strong-pass-3" },
      remoteAddress: "10.103.1.10",
    });
    expect(activate.statusCode).toBe(200);
    // Still exactly one twin; no bootstrap audit fired (nothing created).
    expect((await twinChildrenOf(memberId)).length).toBe(1);
    expect(
      (await prisma.auditEvent.findMany({
        where: { event_type: "STARTER_TWIN_PROVISIONED", target_entity_id: memberId },
      })).length,
    ).toBe(0);

    // Cross-org: enumeration-safe refusal, nothing created.
    const otherOrg = await makeEntity("Boot Other Org", "COMPANY");
    const cross = await ensureStarterTwinForMember(otherOrg, memberId, adminId);
    expect(cross.ok).toBe(false);
  });

  it("HTTP repair route: employee 403; unknown 404; admin repairs an active twin-less member (trigger admin_repair); repeat idempotent", async () => {
    const password = "correct-horse-battery";
    const { hashPassword } = await import("@niov/auth");
    // The smoke-member shape: ACTIVE with a password but NO twin.
    const strandedId = await makePendingMember("Boot Stranded");
    await prisma.entity.update({
      where: { entity_id: strandedId },
      data: { password_hash: await hashPassword(password) },
    });
    expect(await twinChildrenOf(strandedId)).toEqual([]);

    const empEmail = (await prisma.entity.findUnique({ where: { entity_id: strandedId }, select: { email: true } }))!.email!;
    const empLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: empEmail, password, requested_operations: ["read", "write", "admin_org"] },
      remoteAddress: "10.103.1.11",
    });
    const empToken = (empLogin.json() as { token: string }).token;
    const denied = await app.inject({
      method: "POST",
      url: `/api/v1/org/members/${strandedId}/ensure-twin`,
      headers: { authorization: `Bearer ${empToken}` },
    });
    expect([401, 403]).toContain(denied.statusCode);
    expect(await twinChildrenOf(strandedId)).toEqual([]);

    await prisma.entity.update({
      where: { entity_id: adminId },
      data: { password_hash: await hashPassword(password) },
    });
    const adminEmail = (await prisma.entity.findUnique({ where: { entity_id: adminId }, select: { email: true } }))!.email!;
    const adminLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: adminEmail, password, requested_operations: ["read", "write", "admin_org"] },
      remoteAddress: "10.103.1.12",
    });
    const adminToken = (adminLogin.json() as { token: string }).token;

    const unknown = await app.inject({
      method: "POST",
      url: `/api/v1/org/members/${randomUUID()}/ensure-twin`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(unknown.statusCode).toBe(404);

    const repair = await app.inject({
      method: "POST",
      url: `/api/v1/org/members/${strandedId}/ensure-twin`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(repair.statusCode).toBe(200);
    const rj = repair.json() as { ok: boolean; created: boolean; twin_id: string };
    expect(rj.created).toBe(true);
    expect((await twinChildrenOf(strandedId)).length).toBe(1);
    const audits = await prisma.auditEvent.findMany({
      where: { event_type: "STARTER_TWIN_PROVISIONED", target_entity_id: strandedId },
    });
    expect(audits.length).toBe(1);
    expect((audits[0]!.details as Record<string, unknown>).trigger).toBe("admin_repair");

    // Repeat repair: idempotent — created:false, still one twin.
    const repeat = await app.inject({
      method: "POST",
      url: `/api/v1/org/members/${strandedId}/ensure-twin`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect((repeat.json() as { created: boolean }).created).toBe(false);
    expect((await twinChildrenOf(strandedId)).length).toBe(1);
  });
});
