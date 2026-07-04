// FILE: external-resolution.test.ts (integration, real Postgres)
// PURPOSE: [T-2.5] lock the NAMED external state in identity reconciliation:
//          classifyExternalActor tells an unknown coworker apart from an
//          external party without creating false certainty. Internal roster
//          wins over any external name collision; a governed collaborator is
//          named governed_external and their conversations become calm
//          external_context (NO redundant review seed); an observed
//          ExternalEntity keeps the exact T-2A review-seed rail; possible
//          matches stay admin-review-only; unknown stays unknown; internal
//          ambiguity never leaks external tables; cross-org and deleted
//          collaborators are invisible; nothing leaks, nothing writes to
//          personal memory.
// CONNECTS TO: external-collaborator-identity.service.ts
//          (classifyExternalActor), comms-ingest.service.ts (T-2A rewired
//          through the classifier), external-context.service.ts (T-1
//          projection the governed path lights up).

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@niov/database";
import { ingestSourceEvent, slackMessageToSourceEvent } from "@niov/api";
import { classifyExternalActor } from "../../apps/api/src/services/otzar/external-collaborator-identity.service.js";
import { getLedgerEntry } from "../../apps/api/src/services/work-os/work-ledger.service.js";
import { createEntity } from "../../packages/database/src/queries/entity.js";
import { ensureAuditTriggers, cleanupTestData } from "../helpers.js";

const TEST_PREFIX = "__niov_test__extres__";
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
  await prisma.externalEntity.deleteMany({ where: { org_entity_id: { in: ids } } });
  await prisma.collaborationWorkspace.deleteMany({ where: { org_entity_id: { in: ids } } });
  await prisma.workLedgerEntry.deleteMany({ where: { org_entity_id: { in: ids } } });
  const caps = await prisma.meetingCapture.findMany({
    where: { org_entity_id: { in: ids } },
    select: { meeting_capture_id: true },
  });
  const capIds = caps.map((c) => c.meeting_capture_id);
  if (capIds.length > 0) {
    await prisma.meetingParticipantConsent.deleteMany({ where: { meeting_capture_id: { in: capIds } } });
    await prisma.meetingCapture.deleteMany({ where: { meeting_capture_id: { in: capIds } } });
  }
}

describe("[T-2.5] name the external state (DB)", () => {
  let orgId = "";
  let callerId = "";
  let davidId = "";

  beforeEach(async () => {
    await ensureAuditTriggers();
    await cleanup();
    await cleanupTestData();
    orgId = await makeEntity("ER Org", "COMPANY");
    callerId = await makeEntity("Sadeil Caller", "PERSON");
    davidId = await makeEntity("David", "PERSON");
    for (const id of [callerId, davidId]) {
      await prisma.entityMembership.create({
        data: { parent_id: orgId, child_id: id, is_active: true },
      });
    }
  });
  afterAll(async () => {
    await cleanup();
    await cleanupTestData();
    await prisma.$disconnect();
  });

  async function mkGoverned(name: string, opts?: { company?: string; email?: string; deleted?: boolean; org?: string }) {
    return prisma.externalCollaborator.create({
      data: {
        org_entity_id: opts?.org ?? orgId,
        display_name: name,
        ...(opts?.company !== undefined ? { company_name: opts.company } : {}),
        ...(opts?.email !== undefined ? { email: opts.email } : {}),
        relationship_type: "CLIENT",
        created_by_entity_id: callerId,
        ...(opts?.deleted === true ? { deleted_at: new Date() } : {}),
      },
    });
  }

  async function ingestFrom(actorName: string, ts: string) {
    const event = slackMessageToSourceEvent(
      {
        ts,
        text: "David owns the repo access work and will grant write access today.",
        user: "U0EXTR",
        user_name: actorName,
        channel_id: "C0EXTR",
        channel_name: "external",
        team_id: "T0EXTR",
      },
      callerId,
    );
    const r = await ingestSourceEvent(event, { llmProvider: null });
    expect(r.ok).toBe(true);
    return r;
  }

  async function openExternalSeeds() {
    return prisma.workLedgerEntry.findMany({
      where: {
        org_entity_id: orgId,
        ledger_type: "ORG_SEEDING",
        status: { in: ["SEED_NEEDS_REVIEW", "SEED_PROPOSED"] },
        details: { path: ["seed_type"], equals: "review_external_party" },
      },
    });
  }

  it("1+8: internal roster wins over an external name collision; internal ambiguity stays internal (external tables never consulted)", async () => {
    // Same name exists as a GOVERNED external — the member still wins.
    await mkGoverned(`${TEST_PREFIX} David`);
    const r = await classifyExternalActor({ org_entity_id: orgId, name: `${TEST_PREFIX} David` });
    expect(r.state).toBe("internal_member");
    expect(r.confidence).toBe("high");

    // Two internal Davids → internal ambiguity, NOT an external state, even
    // though a same-name governed collaborator exists.
    const david2 = await makeEntity("David Two", "PERSON");
    await prisma.entity.update({ where: { entity_id: david2 }, data: { display_name: `${TEST_PREFIX} David` } });
    await prisma.entityMembership.create({ data: { parent_id: orgId, child_id: david2, is_active: true } });
    const amb = await classifyExternalActor({ org_entity_id: orgId, name: `${TEST_PREFIX} David` });
    expect(amb.state).toBe("unknown");
    expect(amb.label).toBeUndefined();
  });

  it("2+9+10: governed collaborator names governed_external (email + alias + unique name evidence); cross-org and deleted stay invisible; read-only (no identifier backfill)", async () => {
    const jordan = await mkGoverned(`Jordan Vale ${RUN}`, {
      company: `Acme ${RUN}`, email: `${TEST_PREFIX}jordan@client-secret.test`,
    });
    // Email column evidence — high confidence, and NO identifier row appears
    // (classification is read-only, unlike the T-3B matcher's backfill).
    const idsBefore = await prisma.externalCollaboratorIdentifier.count({ where: { org_entity_id: orgId } });
    const viaEmail = await classifyExternalActor({
      org_entity_id: orgId, name: "Completely Different Name", email: `${TEST_PREFIX}jordan@client-secret.test`,
    });
    expect(viaEmail.state).toBe("governed_external");
    expect(viaEmail.confidence).toBe("high");
    expect(viaEmail.label).toBe(`Jordan Vale ${RUN}`);
    expect(viaEmail.external_org_label).toBe(`Acme ${RUN}`);
    expect(viaEmail.relationship_label).toBe("Client");
    expect(await prisma.externalCollaboratorIdentifier.count({ where: { org_entity_id: orgId } })).toBe(idsBefore);

    // Unique consistent name — medium confidence.
    const viaName = await classifyExternalActor({ org_entity_id: orgId, name: `Jordan Vale ${RUN}` });
    expect(viaName.state).toBe("governed_external");
    expect(viaName.confidence).toBe("medium");

    // Verified alias — high confidence.
    await prisma.externalCollaboratorIdentifier.create({
      data: {
        org_entity_id: orgId, external_collaborator_id: jordan.external_collaborator_id,
        identifier_type: "MANUAL_ALIAS", identifier_value_normalized: `jordy vale ${RUN}`,
        confidence: "high", verified_by_entity_id: callerId, verified_at: new Date(),
      },
    });
    const viaAlias = await classifyExternalActor({ org_entity_id: orgId, name: `Jordy Vale ${RUN}` });
    expect(viaAlias.state).toBe("governed_external");
    expect(viaAlias.confidence).toBe("high");

    // Cross-org collaborator is invisible; a deleted one never matches.
    const orgB = await makeEntity("ER Org B", "COMPANY");
    await mkGoverned(`Foreign Party ${RUN}`, { org: orgB });
    expect((await classifyExternalActor({ org_entity_id: orgId, name: `Foreign Party ${RUN}` })).state).toBe("unknown");
    await mkGoverned(`Gone Party ${RUN}`, { deleted: true });
    expect((await classifyExternalActor({ org_entity_id: orgId, name: `Gone Party ${RUN}` })).state).toBe("unknown");
  });

  it("3+4: a governed external actor creates NO review seed and their conversation rows carry safe external_context (T-1 lights up)", async () => {
    const actor = `Casey Client ${RUN}`;
    await mkGoverned(actor, { company: `Acme Ctx ${RUN}` });
    // The observed index ALSO knows the name — pre-T-2.5 this minted a
    // redundant review seed for an already-governed person.
    await prisma.externalEntity.create({
      data: { org_entity_id: orgId, name: actor, entity_type: "CLIENT" },
    });

    await ingestFrom(actor, "1751990000.100001");
    expect((await openExternalSeeds()).length).toBe(0); // no redundant seed

    const rows = await prisma.workLedgerEntry.findMany({
      where: { org_entity_id: orgId, ledger_type: { notIn: ["ORG_SEEDING", "MEETING"] } },
    });
    expect(rows.length).toBeGreaterThan(0);
    const withCtx = rows.filter((r) => {
      const d = r.details as Record<string, unknown>;
      return typeof d.external_context === "object" && d.external_context !== null;
    });
    expect(withCtx.length).toBe(rows.length);
    const ctx = (withCtx[0]!.details as Record<string, { [k: string]: unknown }>).external_context!;
    expect(ctx.external_person_label).toBe(actor);
    expect(ctx.external_org_label).toBe(`Acme Ctx ${RUN}`);
    expect(ctx.relationship_label).toBe("Client");
    expect(ctx.external_party_type).toBe("client");

    // T-1 projection renders it through the validated read-through.
    const view = await getLedgerEntry({
      ledger_entry_id: withCtx[0]!.ledger_entry_id, org_entity_id: orgId,
      caller_entity_id: callerId, is_manager: false,
    });
    expect(view.ok).toBe(true);
    if (view.ok) {
      expect(view.entry.external_context?.external_org_label).toBe(`Acme Ctx ${RUN}`);
      expect(view.entry.external_context?.safe_context_label).toBe(`For Acme Ctx ${RUN}`);
    }
  });

  it("5+10(T-2): an observed non-governed actor keeps the EXACT review-seed rail — created once, reused while open", async () => {
    const actor = `Robin Observed ${RUN}`;
    await prisma.externalEntity.create({
      data: { org_entity_id: orgId, name: actor, entity_type: "VENDOR" },
    });
    const first = await classifyExternalActor({ org_entity_id: orgId, name: actor });
    expect(first.state).toBe("observed_external_needs_review");
    expect(first.review_seed_id).toBeUndefined();

    await ingestFrom(actor, "1751990000.200001");
    const seeds = await openExternalSeeds();
    expect(seeds.length).toBe(1);
    expect((seeds[0]!.details as Record<string, unknown>).relationship_guess).toBe("VENDOR");

    // Second sighting: the classifier now POINTS at the open seed and ingest
    // creates no duplicate.
    const again = await classifyExternalActor({ org_entity_id: orgId, name: actor });
    expect(again.review_seed_id).toBe(seeds[0]!.ledger_entry_id);
    await ingestFrom(actor, "1751990000.200002");
    expect((await openExternalSeeds()).length).toBe(1);
    // Observed stays review state — no collaborator, no external_context.
    expect(await prisma.externalCollaborator.count({ where: { org_entity_id: orgId } })).toBe(0);
  });

  it("6+7: ambiguous governed evidence stays possible_external_match (no certainty labels, no seed); unknown stays unknown (no seed)", async () => {
    const dup = `Morgan Two ${RUN}`;
    await mkGoverned(dup, { company: `Acme ${RUN}` });
    await mkGoverned(dup, { company: `Globex ${RUN}` });
    const possible = await classifyExternalActor({ org_entity_id: orgId, name: dup });
    expect(possible.state).toBe("possible_external_match");
    expect(possible.confidence).toBe("low");
    // No employee-facing certainty: no org/relationship labels, no ids.
    expect(possible.external_org_label).toBeUndefined();
    expect(possible.relationship_label).toBeUndefined();

    await ingestFrom(dup, "1751990000.300001");
    await ingestFrom(`Total Stranger ${RUN}`, "1751990000.300002");
    expect((await openExternalSeeds()).length).toBe(0); // neither minted a seed

    const unknown = await classifyExternalActor({ org_entity_id: orgId, name: `Total Stranger ${RUN}` });
    expect(unknown.state).toBe("unknown");
    const rows = await prisma.workLedgerEntry.findMany({
      where: { org_entity_id: orgId, ledger_type: { notIn: ["ORG_SEEDING", "MEETING"] } },
    });
    // Neither ambiguous nor unknown actors put external_context on rows.
    for (const r of rows) {
      expect((r.details as Record<string, unknown>).external_context).toBeUndefined();
    }
  });

  it("11+12: no raw email/domain/id/excerpt leaks in any resolution; MemoryCapsule and TwinCorrectionMemory counts unchanged", async () => {
    const capsulesBefore = await prisma.memoryCapsule.count();
    const correctionsBefore = await prisma.twinCorrectionMemory.count();

    await mkGoverned(`Leaky Person ${RUN}`, {
      company: `Sweep Co ${RUN}`, email: `${TEST_PREFIX}leak@secret-domain.test`,
    });
    await prisma.externalEntity.create({
      data: { org_entity_id: orgId, name: `Watched Person ${RUN}`, entity_type: "CLIENT", notes: "private observed notes" },
    });
    const resolutions = await Promise.all([
      classifyExternalActor({ org_entity_id: orgId, name: `Leaky Person ${RUN}`, email: `${TEST_PREFIX}leak@secret-domain.test` }),
      classifyExternalActor({ org_entity_id: orgId, name: `Watched Person ${RUN}` }),
      classifyExternalActor({ org_entity_id: orgId, name: `Nobody Here ${RUN}` }),
    ]);
    for (const r of resolutions) {
      const raw = JSON.stringify({ ...r, review_seed_id: undefined });
      expect(raw).not.toContain("@");
      expect(raw).not.toContain("secret-domain.test");
      expect(raw).not.toContain("private observed notes");
      expect(raw).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/);
    }
    expect(await prisma.memoryCapsule.count()).toBe(capsulesBefore);
    expect(await prisma.twinCorrectionMemory.count()).toBe(correctionsBefore);
  });
});
