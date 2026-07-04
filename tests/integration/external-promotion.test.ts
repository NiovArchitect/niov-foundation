// FILE: external-promotion.test.ts (integration, real Postgres)
// PURPOSE: [T-2] lock governed external promotion: an observed external
//          (opt-in mention index ∩ unresolved source actor) mints a
//          REVIEWABLE seed — never a trusted collaborator; approval creates
//          the governed org-scoped ExternalCollaborator (idempotent, audited,
//          access NOT granted); after promotion T-1's external_context lights
//          up via the lineage governed-name link; the revived workspace-import
//          wire records ExternalCommitment (source conversation preserved) so
//          T-1's conversation link lights up too; cross-org isolated; no
//          personal-memory writes.
// CONNECTS TO: comms-ingest.service.ts ([T-2A] seed mint),
//          dandelion-seed.service.ts (promotion on approve),
//          collaboration-workspace.service.ts ([T-2B] commitment wire),
//          external-context.service.ts (T-1 read path).

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@niov/database";
import { ingestSourceEvent, slackMessageToSourceEvent } from "@niov/api";
import { approveSeed } from "../../apps/api/src/services/otzar/dandelion-seed.service.js";
import { importCommsOutputForWorkspaceForCaller } from "../../apps/api/src/services/otzar/collaboration-workspace.service.js";
import { getMyWork, getLedgerEntry } from "../../apps/api/src/services/work-os/work-ledger.service.js";
import { createEntity } from "../../packages/database/src/queries/entity.js";
import { ensureAuditTriggers, cleanupTestData } from "../helpers.js";

const TEST_PREFIX = "__niov_test__extpromo__";

function fakePublicKey(seed: string): string {
  return `-----BEGIN PUBLIC KEY-----\n${seed}\n-----END PUBLIC KEY-----`;
}
async function makeEntity(displayName: string, entityType: "PERSON" | "COMPANY"): Promise<string> {
  const e = await createEntity({
    email: `${TEST_PREFIX}${displayName.toLowerCase().replace(/\s/g, ".")}@niov-test.com`,
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
  await prisma.workspaceExternalMembership.deleteMany({
    where: { external_collaborator: { org_entity_id: { in: ids } } },
  });
  await prisma.externalCollaboratorIdentifier.deleteMany({ where: { org_entity_id: { in: ids } } });
  await prisma.externalCollaborator.deleteMany({ where: { org_entity_id: { in: ids } } });
  await prisma.collaborationCommitment.deleteMany({ where: { org_entity_id: { in: ids } } });
  await prisma.collaborationMembership.deleteMany({ where: { org_entity_id: { in: ids } } });
  await prisma.collaborationWorkspace.deleteMany({ where: { org_entity_id: { in: ids } } });
  await prisma.externalEntity.deleteMany({ where: { org_entity_id: { in: ids } } });
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

async function openExternalSeeds(orgId: string) {
  return prisma.workLedgerEntry.findMany({
    where: {
      org_entity_id: orgId,
      ledger_type: "ORG_SEEDING",
      status: { in: ["SEED_NEEDS_REVIEW", "SEED_PROPOSED"] },
      details: { path: ["seed_type"], equals: "review_external_party" },
    },
  });
}

describe("[T-2] governed external promotion (DB)", () => {
  let orgId = "";
  let callerId = "";
  let davidId = "";
  let adminId = "";

  beforeEach(async () => {
    await ensureAuditTriggers();
    await cleanup();
    await cleanupTestData();
    orgId = await makeEntity("EP Org", "COMPANY");
    callerId = await makeEntity("Sadeil Caller", "PERSON");
    davidId = await makeEntity("David", "PERSON");
    adminId = await makeEntity("Admin Ada", "PERSON");
    for (const id of [callerId, davidId, adminId]) {
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

  async function ingestFrom(actorName: string, ts: string, org = orgId, caller = callerId) {
    const event = slackMessageToSourceEvent(
      {
        ts,
        text: "David owns the repo access work and will grant write access today.",
        user: "U0EXTP",
        user_name: actorName,
        channel_id: "C0EXTP",
        channel_name: "external",
        team_id: "T0EXTP",
      },
      caller,
    );
    const r = await ingestSourceEvent(event, { llmProvider: null });
    expect(r.ok).toBe(true);
    void org;
  }

  it("observed external mints a REVIEWABLE seed (never a collaborator); duplicates are idempotent; unobserved names mint nothing", async () => {
    await prisma.externalEntity.create({
      data: { org_entity_id: orgId, name: "Jordan Vale", entity_type: "CLIENT" },
    });
    const collabBefore = await prisma.externalCollaborator.count({ where: { org_entity_id: orgId } });

    await ingestFrom("Jordan Vale", "1751900000.100001");
    let seeds = await openExternalSeeds(orgId);
    expect(seeds.length).toBe(1);
    const d = seeds[0]!.details as Record<string, unknown>;
    expect(d.subject_name).toBe("Jordan Vale");
    expect(d.relationship_guess).toBe("CLIENT");
    expect(d.approval_required).toBe(true);
    // A mention NEVER auto-promotes.
    expect(await prisma.externalCollaborator.count({ where: { org_entity_id: orgId } })).toBe(collabBefore);

    // Second ingest, same actor → still exactly ONE open seed.
    await ingestFrom("Jordan Vale", "1751900000.200002");
    seeds = await openExternalSeeds(orgId);
    expect(seeds.length).toBe(1);

    // An unresolved actor NOT in the mention index mints no external seed.
    await ingestFrom("Unknown Stranger", "1751900000.300003");
    seeds = await openExternalSeeds(orgId);
    expect(seeds.length).toBe(1);
  });

  it("approval promotes to a governed collaborator (audited, idempotent); T-1 lineage context lights up afterwards", async () => {
    await prisma.externalEntity.create({
      data: { org_entity_id: orgId, name: "Morgan Reeve", entity_type: "PROSPECT" },
    });
    const capsulesBefore = await prisma.memoryCapsule.count();
    const correctionsBefore = await prisma.twinCorrectionMemory.count();

    await ingestFrom("Morgan Reeve", "1751900001.100001");
    const seeds = await openExternalSeeds(orgId);
    expect(seeds.length).toBe(1);

    const approved = await approveSeed({
      seedId: seeds[0]!.ledger_entry_id,
      orgEntityId: orgId,
      adminEntityId: adminId,
    });
    expect(approved.ok).toBe(true);

    const collab = await prisma.externalCollaborator.findFirst({
      where: { org_entity_id: orgId, display_name: "Morgan Reeve", deleted_at: null },
    });
    expect(collab).not.toBeNull();
    expect(collab!.relationship_type).toBe("PROSPECT");
    expect(collab!.created_by_entity_id).toBe(adminId);
    // Access is NOT granted — tracked only, default access via workspace
    // membership only (none exists).
    expect(collab!.status).toBe("TRACKED_EXTERNAL");
    // Audit exists for the promotion.
    const audit = await prisma.auditEvent.findFirst({
      where: {
        event_type: "EXTERNAL_COLLABORATOR_TRACKED",
        actor_entity_id: adminId,
      },
      orderBy: { timestamp: "desc" },
    });
    expect(audit).not.toBeNull();
    expect((audit!.details as Record<string, unknown>).source).toBe("dandelion_seed_approval");

    // Idempotent re-promotion: a fresh seed for the same name approves
    // without creating a duplicate collaborator.
    await ingestFrom("Morgan Reeve", "1751900001.200002");
    const seeds2 = await openExternalSeeds(orgId);
    expect(seeds2.length).toBe(1);
    const approved2 = await approveSeed({
      seedId: seeds2[0]!.ledger_entry_id, orgEntityId: orgId, adminEntityId: adminId,
    });
    expect(approved2.ok).toBe(true);
    expect(
      await prisma.externalCollaborator.count({
        where: { org_entity_id: orgId, display_name: "Morgan Reeve", deleted_at: null },
      }),
    ).toBe(1);

    // T-1 lights up: a NEW ingest from the promoted contact now projects
    // external_context on David's work via the lineage governed-name link.
    await ingestFrom("Morgan Reeve", "1751900001.300003");
    const myWork = await getMyWork({ org_entity_id: orgId, caller_entity_id: davidId });
    const withCtx = myWork.filter((v) => v.external_context !== undefined);
    expect(withCtx.length).toBeGreaterThan(0);
    expect(withCtx[0]!.external_context!.external_party_type).toBe("prospect");
    expect(withCtx[0]!.external_context!.source).toBe("source_lineage");

    // Nothing entered personal memory across seed + promotion + projection.
    expect(await prisma.memoryCapsule.count()).toBe(capsulesBefore);
    expect(await prisma.twinCorrectionMemory.count()).toBe(correctionsBefore);
  });

  it("[T-2B] the revived workspace-import wire records ExternalCommitment; T-1 conversation link lights up", async () => {
    // Governed, workspace-linked external (human-tracked — the doctrine gate).
    const collab = await prisma.externalCollaborator.create({
      data: {
        org_entity_id: orgId,
        display_name: "Riley Cross",
        company_name: "Acme",
        relationship_type: "CLIENT",
        created_by_entity_id: callerId,
      },
    });
    const ws = await prisma.collaborationWorkspace.create({
      data: {
        org_entity_id: orgId,
        title: `${TEST_PREFIX} Acme delivery`,
        created_by_entity_id: callerId,
        visibility: "EXTERNAL_ALLOWED",
      },
    });
    await prisma.workspaceExternalMembership.create({
      data: {
        workspace_id: ws.workspace_id,
        org_entity_id: orgId,
        external_collaborator_id: collab.external_collaborator_id,
        access_level: "VIEW_SHARED",
      },
    });
    // Caller is an internal workspace member; Riley is an ACTIVE external member.
    await prisma.collaborationMembership.create({
      data: {
        workspace_id: ws.workspace_id, org_entity_id: orgId,
        member_entity_id: callerId, member_display_name: "Sadeil",
        role_label: "Delivery lead", member_type: "INTERNAL",
      },
    });
    const rileyMemberId = await makeEntity("Riley Cross", "PERSON"); // external member entity
    await prisma.collaborationMembership.create({
      data: {
        workspace_id: ws.workspace_id, org_entity_id: orgId,
        member_entity_id: rileyMemberId, member_display_name: "Riley Cross",
        role_label: "Client", member_type: "EXTERNAL",
      },
    });

    const convId = randomUUID();
    const result = await importCommsOutputForWorkspaceForCaller({
      workspaceId: ws.workspace_id,
      callerEntityId: callerId,
      sourceConversationId: convId,
      decisions: [],
      commitments: [
        {
          text: "Riley Cross will send the signed SOW by Friday",
          source_excerpt: "Riley Cross: I will send the signed SOW by Friday.",
        },
      ],
    } as never);
    expect((result as { ok: boolean }).ok).toBe(true);

    // The governed ExternalCommitment exists with the conversation preserved.
    const extCommit = await prisma.externalCommitment.findFirst({
      where: {
        org_entity_id: orgId,
        external_collaborator_id: collab.external_collaborator_id,
        source_conversation_id: convId,
      },
    });
    expect(extCommit).not.toBeNull();
    expect(extCommit!.direction).toBe("EXTERNAL_OWES_INTERNAL");

    // T-1 conversation link: a work row on the same conversation now shows
    // "Waiting on Acme".
    const row = await prisma.workLedgerEntry.create({
      data: {
        org_entity_id: orgId, ledger_type: "FOLLOW_UP", source_type: "VOICE_COMMAND",
        title: `${TEST_PREFIX} chase the SOW`, status: "PROPOSED", priority: "ROUTINE",
        extraction_source: "TYPESCRIPT_DETERMINISTIC", owner_entity_id: davidId,
        conversation_id: convId, details: {}, evidence: [],
      },
    });
    const gated = await getLedgerEntry({
      ledger_entry_id: row.ledger_entry_id, org_entity_id: orgId,
      caller_entity_id: davidId, is_manager: false,
    });
    expect(gated.ok).toBe(true);
    if (gated.ok) {
      expect(gated.entry.external_context?.safe_context_label).toBe("Waiting on Acme");
      expect(gated.entry.external_context?.source).toBe("external_commitment");
    }
  });

  it("cross-org isolation: org B never sees org A's observed index, seeds, or collaborators", async () => {
    await prisma.externalEntity.create({
      data: { org_entity_id: orgId, name: "Casey Flint", entity_type: "VENDOR" },
    });
    const orgB = await makeEntity("EP Org B", "COMPANY");
    const callerB = await makeEntity("Caller B", "PERSON");
    await prisma.entityMembership.create({
      data: { parent_id: orgB, child_id: callerB, is_active: true },
    });
    // Same actor name ingested in org B (no observed index there) → no seed.
    await ingestFrom("Casey Flint", "1751900002.100001", orgB, callerB);
    expect((await openExternalSeeds(orgB)).length).toBe(0);
    // Org A gets its seed from its own ingest; org B admin cannot approve it.
    await ingestFrom("Casey Flint", "1751900002.200002");
    const seedsA = await openExternalSeeds(orgId);
    expect(seedsA.length).toBe(1);
    const crossOrg = await approveSeed({
      seedId: seedsA[0]!.ledger_entry_id, orgEntityId: orgB, adminEntityId: callerB,
    });
    expect(crossOrg.ok).toBe(false);
  });
});
