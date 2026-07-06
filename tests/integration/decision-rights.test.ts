// FILE: decision-rights.test.ts (integration, real Postgres, HTTP inject)
// PURPOSE: [BLOCK-3A] lock the decision-rights truth store — plane 3 of the
//          org operating substrate — and its overlay onto the production
//          computeDecisionRights engine:
//          - HTTP: admin writes a member's domain rights (validated against
//            the DecisionDomain vocabulary; cross-org 404; employee refused;
//            audited DECISION_RIGHTS_UPDATED with ids + domain lists only);
//            member self-read posture; safe org summary (names + domains,
//            no emails, no TAR data).
//          - Engine: a structured domain OWNER beats a recommend-only
//            floor-holder (the executive does not always win); can_approve
//            seats when no owner; recommend_only can never finalize; no
//            rights rows → the heuristic input is byte-identical; policy
//            outranks rights; hierarchy/admin flags alone confer ZERO
//            decision rights.
//          - Boundary: writing rights mutates NOTHING else (TAR, profile,
//            memberships untouched); rights key to the HUMAN and an
//            AI_AGENT row can never surface (Twin resolves through its
//            human; no authority inversion).
// CONNECTS TO: decision-rights-store.service.ts, decision-rights.ts,
//          decision-rights-extraction.ts, org.routes.ts, comms-extract
//          governExtraction, EntityDecisionRights (schema.prisma).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { computeTARHash, prisma } from "@niov/database";
import { buildApp, MemoryNonceStore } from "@niov/api";
import {
  applyStructuredRightsToDecisionInput,
  listOrgDecisionRights,
  loadStructuredRightsForRoster,
  SETTABLE_DECISION_DOMAINS,
  type PartyDomainRights,
} from "../../apps/api/src/services/otzar/decision-rights-store.service.js";
import { computeDecisionRights } from "../../apps/api/src/services/otzar/decision-rights.js";
import { buildDecisionInputFromTranscript } from "../../apps/api/src/services/otzar/decision-rights-extraction.js";
import { createEntity } from "../../packages/database/src/queries/entity.js";
import { cleanupTestData, ensureAuditTriggers, TEST_PREFIX } from "../helpers.js";
import type { FastifyInstance } from "fastify";

function fakePublicKey(seed: string): string {
  return `-----BEGIN PUBLIC KEY-----\n${seed}\n-----END PUBLIC KEY-----`;
}
async function makeEntity(displayName: string, entityType: "PERSON" | "COMPANY" | "AI_AGENT"): Promise<string> {
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

describe("[BLOCK-3A] decision-rights truth (DB + HTTP + engine)", () => {
  let app: FastifyInstance;
  let orgId = "";
  let adminId = "";
  let memberId = "";

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
  async function login(entityId: string, password: string, ip: string): Promise<string> {
    const { hashPassword } = await import("@niov/auth");
    await prisma.entity.update({
      where: { entity_id: entityId },
      data: { password_hash: await hashPassword(password) },
    });
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
      jwtSecret: "decision-rights-test-secret",
      sessionNonceStore: new MemoryNonceStore(),
      declarationStore: new MemoryNonceStore(),
    });
  });
  beforeEach(async () => {
    await cleanupTestData();
    orgId = await makeEntity("Rights Org", "COMPANY");
    adminId = await makeEntity("Rights Admin", "PERSON");
    memberId = await makeEntity("Elena Torres", "PERSON");
    await grantOrgAdmin(adminId);
    await prisma.entityMembership.create({
      data: { parent_id: orgId, child_id: adminId, is_active: true, is_admin: true },
    });
    await prisma.entityMembership.create({
      data: { parent_id: orgId, child_id: memberId, is_active: true },
    });
  });
  afterAll(async () => {
    await app.close();
    await cleanupTestData();
    await prisma.$disconnect();
  });

  it("HTTP write matrix: admin sets validated rights (audited, ids + domains only); invalid/unknown/overlap refuse; employee refused; cross-org 404", async () => {
    const password = "correct-horse-battery";
    const adminToken = await login(adminId, password, "10.106.1.9");

    // Invalid domain refuses with the vocabulary in the message.
    const bad = await app.inject({
      method: "PATCH",
      url: `/api/v1/org/members/${memberId}/decision-rights`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { owns: ["engineering feasibility"] },
    });
    expect(bad.statusCode).toBe(422);
    expect((bad.json() as { code: string }).code).toBe("INVALID_DECISION_DOMAIN");

    // "unknown" is a classifier bucket, never an assignable right.
    const unknown = await app.inject({
      method: "PATCH",
      url: `/api/v1/org/members/${memberId}/decision-rights`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { owns: ["unknown"] },
    });
    expect(unknown.statusCode).toBe(422);

    // A domain holds ONE posture per person.
    const overlap = await app.inject({
      method: "PATCH",
      url: `/api/v1/org/members/${memberId}/decision-rights`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { owns: ["technical"], recommend_only: ["technical"] },
    });
    expect(overlap.statusCode).toBe(422);
    expect((overlap.json() as { code: string }).code).toBe("CONFLICTING_RIGHTS");

    // The real write.
    const set = await app.inject({
      method: "PATCH",
      url: `/api/v1/org/members/${memberId}/decision-rights`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { owns: ["technical", "architecture"], can_approve: ["execution"], recommend_only: ["deadline"] },
    });
    expect(set.statusCode).toBe(200);
    const saved = (set.json() as { rights: { owns: string[] } }).rights;
    expect(saved.owns).toEqual(["technical", "architecture"]);
    const row = await prisma.entityDecisionRights.findUnique({
      where: { org_entity_id_entity_id: { org_entity_id: orgId, entity_id: memberId } },
    });
    expect(row).not.toBeNull();
    expect(row!.can_approve).toEqual(["execution"]);
    expect(row!.updated_by).toBe(adminId);

    // Audited with ids + domain lists ONLY — no free text, no names, no secrets.
    const audits = await prisma.auditEvent.findMany({
      where: { event_type: "DECISION_RIGHTS_UPDATED", actor_entity_id: adminId },
    });
    expect(audits.length).toBe(1);
    expect(audits[0]!.target_entity_id).toBe(memberId);
    const details = audits[0]!.details as Record<string, unknown>;
    expect(Object.keys(details).sort()).toEqual(["can_approve", "org_entity_id", "owns", "recommend_only"]);
    expect(details.owns).toEqual(["technical", "architecture"]);

    // Employee cannot write rights.
    const employeeToken = await login(memberId, password, "10.106.1.10");
    const denied = await app.inject({
      method: "PATCH",
      url: `/api/v1/org/members/${adminId}/decision-rights`,
      headers: { authorization: `Bearer ${employeeToken}` },
      payload: { owns: ["technical"] },
    });
    expect([401, 403]).toContain(denied.statusCode);

    // Cross-org target 404s — no existence leak beyond the caller's org.
    const otherOrgId = await makeEntity("Other Org", "COMPANY");
    const outsiderId = await makeEntity("Outside Person", "PERSON");
    await prisma.entityMembership.create({
      data: { parent_id: otherOrgId, child_id: outsiderId, is_active: true },
    });
    const crossOrg = await app.inject({
      method: "PATCH",
      url: `/api/v1/org/members/${outsiderId}/decision-rights`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { owns: ["technical"] },
    });
    expect(crossOrg.statusCode).toBe(404);
    expect(await prisma.entityDecisionRights.count({ where: { entity_id: outsiderId } })).toBe(0);
  });

  it("HTTP read tier: self posture (honest when unset), safe org summary (names + domains only, never emails/TAR), settable domains exclude 'unknown'", async () => {
    const password = "correct-horse-battery";
    const adminToken = await login(adminId, password, "10.106.2.9");
    const employeeToken = await login(memberId, password, "10.106.2.10");

    // Unset posture is honest, not fake-empty-authority.
    const before = await app.inject({
      method: "GET",
      url: "/api/v1/org/me/decision-rights",
      headers: { authorization: `Bearer ${employeeToken}` },
    });
    expect(before.statusCode).toBe(200);
    const beforeBody = before.json() as { rights: unknown; note: string };
    expect(beforeBody.rights).toBeNull();
    expect(beforeBody.note).toContain("No structured decision rights");

    await app.inject({
      method: "PATCH",
      url: `/api/v1/org/members/${memberId}/decision-rights`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { owns: ["technical"], recommend_only: ["deadline"] },
    });

    const after = await app.inject({
      method: "GET",
      url: "/api/v1/org/me/decision-rights",
      headers: { authorization: `Bearer ${employeeToken}` },
    });
    const afterBody = after.json() as {
      rights: { owns: string[]; recommend_only: string[] };
      note: string;
    };
    expect(afterBody.rights.owns).toEqual(["technical"]);
    expect(afterBody.note).toContain("do not grant tool access");

    // Org summary: member-readable, names + domains only.
    const summary = await app.inject({
      method: "GET",
      url: "/api/v1/org/decision-rights",
      headers: { authorization: `Bearer ${employeeToken}` },
    });
    expect(summary.statusCode).toBe(200);
    const summaryBody = summary.json() as {
      members: Array<Record<string, unknown>>;
      settable_domains: string[];
    };
    expect(summaryBody.members.length).toBe(1);
    const entry = summaryBody.members[0]!;
    expect(entry.display_name).toContain("Elena Torres");
    expect(Object.keys(entry).sort()).toEqual([
      "can_approve",
      "display_name",
      "entity_id",
      "owns",
      "recommend_only",
    ]);
    expect(summaryBody.settable_domains).toHaveLength(12);
    expect(summaryBody.settable_domains).not.toContain("unknown");

    // Unauthenticated read refuses.
    const unauth = await app.inject({ method: "GET", url: "/api/v1/org/decision-rights" });
    expect(unauth.statusCode).toBe(401);
  });

  it("ENGINE: owner beats recommend-only floor-holder (executive does not always win); approver seats when no owner; recommend-only can never finalize; policy outranks rights", () => {
    // Maya (CEO) holds the floor and "finalizes"; structured rights say Maya
    // is recommend-only in technical and Elena OWNS technical.
    const transcript = "Maya will lead the rollout. We agreed to ship the migration Friday.";
    const heuristic = buildDecisionInputFromTranscript(transcript, "technical");
    expect(heuristic.authority?.party).toBe("Maya");

    const rights: PartyDomainRights[] = [
      { entity_id: "e-maya", party: "Maya Chen", owns: ["strategic"], can_approve: [], recommend_only: ["technical"] },
      { entity_id: "e-elena", party: "Elena Torres", owns: ["technical"], can_approve: [], recommend_only: [] },
    ];
    const adjusted = applyStructuredRightsToDecisionInput(heuristic, rights);
    expect(adjusted.authority?.party).toBe("Elena Torres");
    expect(adjusted.authority?.authorityType).toBe("role");
    const verdict = computeDecisionRights(adjusted);
    expect(verdict.decisionOwner).toBe("Elena Torres");
    // Maya's floor-holding survives only as an expertise signal.
    expect(adjusted.expertise.some((s) => s.party === "Maya")).toBe(true);

    // Approver seats when no owner exists for the domain.
    const financeInput = buildDecisionInputFromTranscript("We should approve the vendor invoice.", "finance");
    const financeRights: PartyDomainRights[] = [
      { entity_id: "e-aisha", party: "Aisha Khan", owns: [], can_approve: ["finance"], recommend_only: [] },
    ];
    const financeAdjusted = applyStructuredRightsToDecisionInput(financeInput, financeRights);
    expect(financeAdjusted.authority?.party).toBe("Aisha Khan");
    expect(financeAdjusted.authority?.authorityType).toBe("approval");

    // Recommend-only alone can never finalize: the seat falls empty and the
    // engine holds.
    const soloInput = buildDecisionInputFromTranscript(
      "Maya will lead this. We agreed to change the database schema.",
      "technical",
    );
    const soloRights: PartyDomainRights[] = [
      { entity_id: "e-maya", party: "Maya Chen", owns: ["strategic"], can_approve: [], recommend_only: ["technical"] },
    ];
    const soloAdjusted = applyStructuredRightsToDecisionInput(soloInput, soloRights);
    expect(soloAdjusted.authority).toBeNull();
    expect(soloAdjusted.finalDecisionMade).toBe(false);
    const soloVerdict = computeDecisionRights(soloAdjusted);
    expect(soloVerdict.autonomyBlocked).toBe(true);
    expect(soloVerdict.decisionOwner).toBeNull();

    // Policy outranks rights: even a structured owner is blocked when policy
    // refuses.
    const policyBlocked = computeDecisionRights({ ...adjusted, policyAllows: false });
    expect(policyBlocked.autonomyBlocked).toBe(true);
    expect(policyBlocked.note).toContain("Policy outranks hierarchy");
  });

  it("ENGINE: no rights rows → heuristic input byte-identical; hierarchy/admin flags alone confer ZERO decision rights", async () => {
    // Manager edge + admin flag + admin TAR — and NO rights rows.
    await prisma.entityMembership.create({
      data: { parent_id: adminId, child_id: memberId, is_active: true, hierarchy_level: 2 },
    });
    const roster = [
      { entity_id: adminId, display_name: "Rights Admin" },
      { entity_id: memberId, display_name: "Elena Torres" },
    ];
    const loaded = await loadStructuredRightsForRoster(orgId, roster);
    expect(loaded).toEqual([]);

    const input = buildDecisionInputFromTranscript("Elena owns the migration. It is not ready.", "technical");
    const untouched = applyStructuredRightsToDecisionInput(input, loaded);
    expect(untouched).toBe(input); // same reference — byte-identical fallback

    // An org with rights for OTHER domains still leaves this domain's
    // heuristics alone (no owner/approver/recommender in "design").
    await prisma.entityDecisionRights.create({
      data: {
        org_entity_id: orgId,
        entity_id: memberId,
        owns: ["technical"],
        can_approve: [],
        recommend_only: [],
        updated_by: adminId,
      },
    });
    const designInput = buildDecisionInputFromTranscript("Naomi will lead the redesign.", "design");
    const designLoaded = await loadStructuredRightsForRoster(orgId, roster);
    const designAdjusted = applyStructuredRightsToDecisionInput(designInput, designLoaded);
    expect(designAdjusted.authority?.party).toBe(designInput.authority?.party ?? null);
  });

  it("BOUNDARY: a rights write mutates nothing else (TAR/profile/memberships untouched); rights key to the HUMAN and an AI_AGENT row never surfaces", async () => {
    const password = "correct-horse-battery";
    const adminToken = await login(adminId, password, "10.106.3.9");

    const tarBefore = await prisma.tokenAttributeRepository.findUnique({ where: { entity_id: memberId } });
    const profileBefore = await prisma.entityProfile.findUnique({ where: { entity_id: memberId } });
    const membershipsBefore = await prisma.entityMembership.findMany({
      where: { child_id: memberId },
      orderBy: { membership_id: "asc" },
    });

    const set = await app.inject({
      method: "PATCH",
      url: `/api/v1/org/members/${memberId}/decision-rights`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { owns: ["technical"], can_approve: ["execution"] },
    });
    expect(set.statusCode).toBe(200);

    // Rights inform decision logic ONLY: no TAR capability, profile, or
    // hierarchy mutation of any kind.
    const tarAfter = await prisma.tokenAttributeRepository.findUnique({ where: { entity_id: memberId } });
    expect(tarAfter).toEqual(tarBefore);
    const profileAfter = await prisma.entityProfile.findUnique({ where: { entity_id: memberId } });
    expect(profileAfter).toEqual(profileBefore);
    const membershipsAfter = await prisma.entityMembership.findMany({
      where: { child_id: memberId },
      orderBy: { membership_id: "asc" },
    });
    expect(membershipsAfter).toEqual(membershipsBefore);

    // The row keys to the HUMAN entity — and a twin cannot be written to:
    // an AI_AGENT org member is not a PERSON, so the admin write 404s.
    const twinId = await makeEntity("Elena Twin", "AI_AGENT");
    await prisma.entityMembership.create({
      data: { parent_id: orgId, child_id: twinId, is_active: true },
    });
    const twinWrite = await app.inject({
      method: "PATCH",
      url: `/api/v1/org/members/${twinId}/decision-rights`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { owns: ["technical"] },
    });
    expect(twinWrite.statusCode).toBe(404);

    // Defense-in-depth: even a force-created AI_AGENT row never surfaces in
    // the safe summary (Twins resolve THROUGH their human, never carry
    // rights of their own).
    await prisma.entityDecisionRights.create({
      data: {
        org_entity_id: orgId,
        entity_id: twinId,
        owns: ["technical"],
        can_approve: [],
        recommend_only: [],
        updated_by: adminId,
      },
    });
    const summary = await listOrgDecisionRights(orgId);
    expect(summary.some((m) => m.entity_id === twinId)).toBe(false);
    expect(summary.some((m) => m.entity_id === memberId)).toBe(true);

    // And the roster loader only ever sees the human roster — the twin is
    // not on it, so twin "rights" can never reach the engine.
    const loaded = await loadStructuredRightsForRoster(orgId, [
      { entity_id: memberId, display_name: "Elena Torres" },
    ]);
    expect(loaded.map((r) => r.entity_id)).toEqual([memberId]);

    // Sanity: the vocabulary the store validates is exactly the engine's.
    expect(SETTABLE_DECISION_DOMAINS).toContain("technical");
    expect(SETTABLE_DECISION_DOMAINS).not.toContain("unknown");
  });
});
