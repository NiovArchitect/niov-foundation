// FILE: team-external-exceptions.test.ts (integration, real Postgres)
// PURPOSE: [T-4] lock the manager external-relationship exception summary on
//          CE-4B team clarity health: counts from GOVERNED records only
//          (ExternalCommitment/Collaborator/Organization + open review
//          seeds), governed account labels, founder-approved top-exception
//          priority, the same manager gate as Team Work, org isolation,
//          deleted/completed exclusion, no raw ids/emails/domains/backend
//          enums/excerpts in copy, no wallet writes, silence when zero, and
//          the pre-existing clarity summary unchanged.
// CONNECTS TO: apps/api/src/services/work-os/team-clarity-health.service.ts
//          ([T-4] computeExternalExceptions), external-collaborator-
//          identity.service.ts (RELATIONSHIP_LABELS reuse).

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@niov/database";
import { getTeamClarityHealth } from "../../apps/api/src/services/work-os/team-clarity-health.service.js";
import { createEntity } from "../../packages/database/src/queries/entity.js";
import { ensureAuditTriggers, cleanupTestData } from "../helpers.js";

const TEST_PREFIX = "__niov_test__extexc__";
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

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

async function cleanup(): Promise<void> {
  const ents = await prisma.entity.findMany({
    where: { display_name: { startsWith: TEST_PREFIX } },
    select: { entity_id: true },
  });
  const ids = ents.map((e) => e.entity_id);
  if (ids.length === 0) return;
  await prisma.externalCommitment.deleteMany({ where: { org_entity_id: { in: ids } } });
  await prisma.externalCollaboratorIdentifier.deleteMany({ where: { org_entity_id: { in: ids } } });
  await prisma.workspaceExternalMembership.deleteMany({
    where: { external_collaborator: { org_entity_id: { in: ids } } },
  });
  await prisma.externalOrganizationIdentifier.deleteMany({ where: { org_entity_id: { in: ids } } });
  await prisma.externalCollaborator.deleteMany({ where: { org_entity_id: { in: ids } } });
  await prisma.externalOrganization.deleteMany({ where: { org_entity_id: { in: ids } } });
  await prisma.collaborationWorkspace.deleteMany({ where: { org_entity_id: { in: ids } } });
  await prisma.workLedgerEntry.deleteMany({ where: { org_entity_id: { in: ids } } });
}

describe("[T-4] manager external exception summary (DB)", () => {
  let orgId = "";
  let callerId = "";
  let wsId = "";

  beforeEach(async () => {
    await ensureAuditTriggers();
    await cleanup();
    await cleanupTestData();
    orgId = await makeEntity("T4 Org", "COMPANY");
    callerId = await makeEntity("T4 Manager", "PERSON");
    await prisma.entityMembership.create({
      data: { parent_id: orgId, child_id: callerId, is_active: true },
    });
    const ws = await prisma.collaborationWorkspace.create({
      data: { org_entity_id: orgId, title: `${TEST_PREFIX} ws ${RUN}`, created_by_entity_id: callerId },
    });
    wsId = ws.workspace_id;
  });
  afterAll(async () => {
    await cleanup();
    await cleanupTestData();
    await prisma.$disconnect();
  });

  async function mkCollaborator(name: string, opts?: {
    company?: string; relationship?: string; deleted?: boolean; orgOverride?: string; withGovernedOrg?: string;
  }) {
    let externalOrgId: string | null = null;
    if (opts?.withGovernedOrg !== undefined) {
      const eo = await prisma.externalOrganization.create({
        data: {
          org_entity_id: opts.orgOverride ?? orgId,
          display_name: opts.withGovernedOrg,
          normalized_name: opts.withGovernedOrg.toLowerCase(),
          relationship_type: "CLIENT",
          created_by_entity_id: callerId,
        },
      });
      externalOrgId = eo.external_org_id;
    }
    return prisma.externalCollaborator.create({
      data: {
        org_entity_id: opts?.orgOverride ?? orgId,
        display_name: `${name} ${RUN}`,
        ...(opts?.company !== undefined ? { company_name: opts.company } : {}),
        ...(externalOrgId !== null ? { external_org_id: externalOrgId } : {}),
        relationship_type: (opts?.relationship ?? "CLIENT") as never,
        created_by_entity_id: callerId,
        ...(opts?.deleted === true ? { deleted_at: new Date() } : {}),
      },
    });
  }

  async function mkCommitment(collabId: string, opts?: {
    direction?: "EXTERNAL_OWES_INTERNAL" | "INTERNAL_OWES_EXTERNAL";
    owner?: string | null; due?: Date; status?: string; deleted?: boolean; orgOverride?: string; wsOverride?: string;
  }) {
    return prisma.externalCommitment.create({
      data: {
        workspace_id: opts?.wsOverride ?? wsId,
        org_entity_id: opts?.orgOverride ?? orgId,
        external_collaborator_id: collabId,
        direction: opts?.direction ?? "EXTERNAL_OWES_INTERNAL",
        text: `${TEST_PREFIX} secret commitment text ${RUN}`,
        source_excerpt: `${TEST_PREFIX} private excerpt ${RUN}`,
        ...(opts?.owner !== undefined && opts.owner !== null ? { internal_owner_entity_id: opts.owner } : {}),
        ...(opts?.due !== undefined ? { due_date: opts.due } : {}),
        ...(opts?.status !== undefined ? { status: opts.status as never } : {}),
        ...(opts?.deleted === true ? { deleted_at: new Date() } : {}),
        added_by_entity_id: callerId,
      },
    });
  }

  async function mkReviewSeed(subject: string) {
    return prisma.workLedgerEntry.create({
      data: {
        org_entity_id: orgId, ledger_type: "ORG_SEEDING", source_type: "VOICE_COMMAND",
        title: `${TEST_PREFIX} review ${subject}`, status: "SEED_NEEDS_REVIEW", priority: "ROUTINE",
        extraction_source: "TYPESCRIPT_DETERMINISTIC", evidence: [],
        details: { seed_type: "review_external_party", subject_name: subject, approval_required: true },
      },
    });
  }

  async function health() {
    const r = await getTeamClarityHealth({ org_entity_id: orgId, is_manager: true });
    if (r.ok === false) throw new Error("expected ok");
    return r.health;
  }

  it("1+2: counts waiting-on-external and internal-commitments-to-external from open governed commitments", async () => {
    const acme = await mkCollaborator("Ann Client", { company: `Acme ${RUN}` });
    await mkCommitment(acme.external_collaborator_id, { direction: "EXTERNAL_OWES_INTERNAL", owner: callerId });
    await mkCommitment(acme.external_collaborator_id, { direction: "EXTERNAL_OWES_INTERNAL", owner: callerId });
    await mkCommitment(acme.external_collaborator_id, { direction: "INTERNAL_OWES_EXTERNAL", owner: callerId });
    const h = await health();
    expect(h.external_relationships?.waiting_on_external_count).toBe(2);
    expect(h.external_relationships?.internal_commitments_to_external_count).toBe(1);
    expect(h.external_relationships?.top_external_exception?.label).toContain("waiting on");
  });

  it("3: topics prefer the governed ExternalOrganization display label; overdue + unowned drive the top exception in priority order", async () => {
    const gov = await mkCollaborator("Gina Governed", {
      company: `LegacyName ${RUN}`, withGovernedOrg: `Acme Governed ${RUN}`,
    });
    await mkCommitment(gov.external_collaborator_id, {
      owner: callerId, due: new Date(Date.now() - 86_400_000),
    });
    await mkCommitment(gov.external_collaborator_id, { owner: null });
    const h = await health();
    const ext = h.external_relationships!;
    // Governed label wins over company_name.
    expect(ext.external_topics[0]?.label).toBe(`Acme Governed ${RUN}`);
    expect(JSON.stringify(ext.external_topics)).not.toContain("LegacyName");
    // Priority 1: overdue beats unowned.
    expect(ext.overdue_external_count).toBe(1);
    expect(ext.external_ownership_unclear_count).toBe(1);
    expect(ext.top_external_exception?.label).toContain("overdue");
    expect(ext.top_external_exception?.label).toContain("client");
  });

  it("4+6: deleted/completed/cross-org records never count", async () => {
    const live = await mkCollaborator("Live Person", { company: `LiveCo ${RUN}` });
    await mkCommitment(live.external_collaborator_id, { owner: callerId });
    // Completed, soft-deleted, and deleted-collaborator commitments: excluded.
    await mkCommitment(live.external_collaborator_id, { owner: callerId, status: "COMPLETED" });
    await mkCommitment(live.external_collaborator_id, { owner: callerId, deleted: true });
    const dead = await mkCollaborator("Dead Person", { deleted: true });
    await mkCommitment(dead.external_collaborator_id, { owner: callerId });
    // Cross-org: a different org's commitment never counts here.
    const orgB = await makeEntity("T4 Org B", "COMPANY");
    const wsB = await prisma.collaborationWorkspace.create({
      data: { org_entity_id: orgB, title: `${TEST_PREFIX} wsB ${RUN}`, created_by_entity_id: callerId },
    });
    const foreign = await mkCollaborator("Foreign Person", { orgOverride: orgB });
    await mkCommitment(foreign.external_collaborator_id, {
      owner: callerId, orgOverride: orgB, wsOverride: wsB.workspace_id,
    });
    const h = await health();
    expect(h.external_relationships?.waiting_on_external_count).toBe(1);
    expect(h.external_relationships?.external_ownership_unclear_count).toBe(0);
  });

  it("5: non-manager gets the same honest Team Work gate (no external data)", async () => {
    const acme = await mkCollaborator("Gated Person");
    await mkCommitment(acme.external_collaborator_id, { owner: null });
    const r = await getTeamClarityHealth({ org_entity_id: orgId, is_manager: false });
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.code).toBe("TEAM_SCOPE_NOT_CONFIGURED");
    expect(JSON.stringify(r)).not.toContain("external");
  });

  it("7: no raw ids/emails/domains/source excerpts/backend enums anywhere in the summary", async () => {
    const col = await mkCollaborator("Leaky Person", { company: `Sweep Co ${RUN}` });
    await prisma.externalCollaborator.update({
      where: { external_collaborator_id: col.external_collaborator_id },
      data: { email: `${TEST_PREFIX}leak@secret-domain.test` },
    });
    await mkCommitment(col.external_collaborator_id, {
      owner: null, due: new Date(Date.now() - 3_600_000),
    });
    await mkReviewSeed(`Ambiguous Person ${RUN}`);
    const h = await health();
    const raw = JSON.stringify(h.external_relationships);
    expect(raw).not.toContain("@");
    expect(raw).not.toContain("secret-domain.test");
    expect(raw).not.toContain(col.external_collaborator_id);
    expect(raw).not.toContain("EXTERNAL_OWES_INTERNAL");
    expect(raw).not.toContain("INTERNAL_OWES_EXTERNAL");
    expect(raw).not.toContain("CLIENT"); // enum — the copy word is lowercase "client"
    expect(raw).not.toContain("secret commitment text");
    expect(raw).not.toContain("private excerpt");
    expect(raw).not.toMatch(/pipeline|deal stage|opportunity/i);
  });

  it("8: computing the summary writes nothing to personal wallets or memory stores", async () => {
    const acme = await mkCollaborator("Wallet Person");
    await mkCommitment(acme.external_collaborator_id, { owner: null });
    const capsulesBefore = await prisma.memoryCapsule.count();
    const correctionsBefore = await prisma.twinCorrectionMemory.count();
    await health();
    expect(await prisma.memoryCapsule.count()).toBe(capsulesBefore);
    expect(await prisma.twinCorrectionMemory.count()).toBe(correctionsBefore);
  });

  it("9: all-zero orgs get NO external_relationships block — silence-friendly", async () => {
    const h = await health();
    expect(h.external_relationships).toBeUndefined();
  });

  it("review seeds drive both pending and repeated-ambiguity counts; review-pending copy surfaces when commitments are calm", async () => {
    await mkReviewSeed(`Solo Person ${RUN}`);
    await mkReviewSeed(`Repeat Person ${RUN}`);
    await mkReviewSeed(`Repeat Person ${RUN}`);
    const h = await health();
    const ext = h.external_relationships!;
    expect(ext.external_review_pending_count).toBe(3);
    expect(ext.repeated_external_ambiguity_count).toBe(1);
    expect(ext.top_external_exception?.label).toContain("review");
    // Nothing invented: no commitments → zero commitment counts, no topics.
    expect(ext.waiting_on_external_count).toBe(0);
    expect(ext.external_topics).toEqual([]);
  });

  it("10: the pre-existing clarity summary is unchanged by the external block", async () => {
    await prisma.workLedgerEntry.create({
      data: {
        org_entity_id: orgId, ledger_type: "FOLLOW_UP", source_type: "VOICE_COMMAND",
        title: `${TEST_PREFIX} unowned ${RUN}`, status: "PROPOSED", priority: "ROUTINE",
        extraction_source: "TYPESCRIPT_DETERMINISTIC", details: {}, evidence: [],
      },
    });
    const acme = await mkCollaborator("Side Person");
    await mkCommitment(acme.external_collaborator_id, { owner: callerId });
    const h = await health();
    // Clarity half still reports internal ownership exactly as before.
    expect(h.ownership_unclear_count).toBe(1);
    expect(h.unresolved_clarifications_count).toBe(0);
    expect(h.top_exception?.label).toContain("ownership clarity");
    // And the external half coexists without touching it.
    expect(h.external_relationships?.waiting_on_external_count).toBe(1);
  });
});
