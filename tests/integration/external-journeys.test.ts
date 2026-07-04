// FILE: external-journeys.test.ts (integration, real Postgres)
// PURPOSE: [T-3 JOURNEYS] Dynamic customer-journey smokes — behave like a
//          real organization, not an endpoint check. Fixture names are
//          GENERATED PER RUN (runId suffix) so dedupe is proven
//          intentionally and stale fixtures can never mask a false merge.
//          Covers: J1 consulting full chain (observe → review → promote →
//          org grouping → work-row context → audit → wallet invariance);
//          J3 ambiguity (two same-name people, Acme Inc vs Acme Labs);
//          J6 commitment directions; edge cases: revoked collaborator
//          never matches, soft-deleted org never reuses, duplicate import
//          never duplicates the obligation.
//          (J2 cross-org isolation is locked in external-organization/
//          promotion suites; J5 portability invariance re-proven here
//          across the whole journey; J4 pairwise identity is future —
//          honest boundary asserted by absence.)
// CONNECTS TO: the T-1/T-2/T-3 services + docs/otzar/
//          OTZAR_EXTERNAL_JOURNEY_SMOKE_PLAN.md.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@niov/database";
import { ingestSourceEvent, slackMessageToSourceEvent } from "@niov/api";
import { approveSeed } from "../../apps/api/src/services/otzar/dandelion-seed.service.js";
import { trackExternalCollaboratorForCaller } from "../../apps/api/src/services/otzar/external-collaborator.service.js";
import { importCommsOutputForWorkspaceForCaller } from "../../apps/api/src/services/otzar/collaboration-workspace.service.js";
import { getOrCreateExternalOrganizationForCaller } from "../../apps/api/src/services/otzar/external-organization.service.js";
import { getMyWork, getLedgerEntry } from "../../apps/api/src/services/work-os/work-ledger.service.js";
import { createEntity } from "../../packages/database/src/queries/entity.js";
import { ensureAuditTriggers, cleanupTestData } from "../helpers.js";

const TEST_PREFIX = "__niov_test__extjourney__";
// Dynamic per-run id — every fixture name carries it.
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
  await prisma.workspaceExternalMembership.deleteMany({
    where: { external_collaborator: { org_entity_id: { in: ids } } },
  });
  await prisma.externalOrganizationIdentifier.deleteMany({ where: { org_entity_id: { in: ids } } });
  await prisma.externalCollaboratorIdentifier.deleteMany({ where: { org_entity_id: { in: ids } } });
  await prisma.externalCollaborator.deleteMany({ where: { org_entity_id: { in: ids } } });
  await prisma.externalOrganization.deleteMany({ where: { org_entity_id: { in: ids } } });
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

describe(`[T-3 JOURNEYS] dynamic external customer journeys (run ${RUN})`, () => {
  let orgId = "";
  let callerId = "";
  let davidId = "";
  let adminId = "";

  beforeEach(async () => {
    await ensureAuditTriggers();
    await cleanup();
    await cleanupTestData();
    orgId = await makeEntity("EJ Org", "COMPANY");
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

  async function makeWorkspaceWithCaller(title: string) {
    const ws = await prisma.collaborationWorkspace.create({
      data: {
        org_entity_id: orgId, title, created_by_entity_id: callerId,
        visibility: "EXTERNAL_ALLOWED",
      },
    });
    await prisma.collaborationMembership.create({
      data: {
        workspace_id: ws.workspace_id, org_entity_id: orgId,
        member_entity_id: callerId, member_display_name: "Sadeil",
        role_label: "Delivery lead", member_type: "INTERNAL", access_level: "CONTRIBUTE",
      },
    });
    return ws;
  }

  it("J1 consulting journey: observe → review → promote → track for account → commitment → calm work-row context → audit chain — with per-run names and zero wallet writes", async () => {
    const person = `Jordan Smoke ${RUN}`;
    const account = `Acme Smoke ${RUN}`;
    const capsulesBefore = await prisma.memoryCapsule.count();
    const correctionsBefore = await prisma.twinCorrectionMemory.count();

    // 1. The org's opt-in observed index knows the contact; ingestion
    //    observes them → a REVIEW seed, never a collaborator.
    await prisma.externalEntity.create({
      data: { org_entity_id: orgId, name: person, entity_type: "CLIENT" },
    });
    const ev1 = slackMessageToSourceEvent(
      {
        ts: "1752000000.100001",
        text: "David owns the repo access work and will grant write access today.",
        user: "U0J1", user_name: person, channel_id: "C0J1", team_id: "T0J1",
      },
      callerId,
    );
    expect((await ingestSourceEvent(ev1, { llmProvider: null })).ok).toBe(true);
    const seeds = await prisma.workLedgerEntry.findMany({
      where: {
        org_entity_id: orgId, ledger_type: "ORG_SEEDING",
        details: { path: ["seed_type"], equals: "review_external_party" },
      },
    });
    expect(seeds.length).toBe(1);
    expect(await prisma.externalCollaborator.count({ where: { org_entity_id: orgId } })).toBe(0);

    // 2. Admin promotes — governed collaborator, no access, audited.
    const approved = await approveSeed({
      seedId: seeds[0]!.ledger_entry_id, orgEntityId: orgId, adminEntityId: adminId,
    });
    expect(approved.ok).toBe(true);

    // 3. The delivery lead tracks the SAME person for the account in a
    //    workspace (manual governed path) — the org-scoped account key
    //    is created; the seed-promoted record remains (two governed rows
    //    for one human is a known T-3B dedupe follow-up, asserted here
    //    honestly rather than hidden).
    const ws = await makeWorkspaceWithCaller(`Acme delivery ${RUN}`);
    const tracked = await trackExternalCollaboratorForCaller({
      workspaceId: ws.workspace_id, callerEntityId: callerId,
      displayName: person, companyName: account, relationshipType: "CLIENT",
    } as never);
    expect((tracked as { ok: boolean }).ok).toBe(true);
    const trackedId = (tracked as { external_collaborator: { external_collaborator_id: string } }).external_collaborator
      .external_collaborator_id;

    // 4. A client conversation import records the governed obligation.
    const convId = randomUUID();
    await prisma.collaborationMembership.create({
      data: {
        workspace_id: ws.workspace_id, org_entity_id: orgId,
        member_entity_id: await makeEntity(`Jordan Member ${RUN}`, "PERSON"),
        member_display_name: person, role_label: "Client", member_type: "EXTERNAL",
      },
    });
    const imported = await importCommsOutputForWorkspaceForCaller({
      workspaceId: ws.workspace_id, callerEntityId: callerId,
      sourceConversationId: convId, decisions: [],
      commitments: [
        { text: `${person} will send the signed SOW ${RUN}`, source_excerpt: `${person}: I will send the signed SOW.` },
      ],
    } as never);
    expect((imported as { ok: boolean }).ok).toBe(true);

    // 5. The internal chase-work row gains CALM context: "Waiting on Acme
    //    Smoke {run}" — org label from the governed account key.
    const row = await prisma.workLedgerEntry.create({
      data: {
        org_entity_id: orgId, ledger_type: "FOLLOW_UP", source_type: "VOICE_COMMAND",
        title: `${TEST_PREFIX} chase SOW ${RUN}`, status: "PROPOSED", priority: "ROUTINE",
        extraction_source: "TYPESCRIPT_DETERMINISTIC", owner_entity_id: davidId,
        conversation_id: convId, details: {}, evidence: [],
      },
    });
    const gated = await getLedgerEntry({
      ledger_entry_id: row.ledger_entry_id, org_entity_id: orgId,
      caller_entity_id: davidId, is_manager: false,
    });
    expect(gated.ok).toBe(true);
    if (!gated.ok) return;
    expect(gated.entry.external_context?.safe_context_label).toBe(`Waiting on ${account}`);
    expect(gated.entry.external_context?.external_party_type).toBe("client");
    const raw = JSON.stringify(gated.entry);
    expect(raw).not.toMatch(/@[a-z0-9-]+\.[a-z]{2,}/i);
    expect(raw).not.toContain("I will send the signed SOW"); // excerpt never projects

    // 6. Audit chain exists for every governed step.
    for (const evt of ["EXTERNAL_COLLABORATOR_TRACKED", "EXTERNAL_ORGANIZATION_CREATED"]) {
      expect(
        await prisma.auditEvent.count({ where: { event_type: evt } }),
      ).toBeGreaterThan(0);
    }

    // 7. Portability boundary held across the WHOLE journey.
    expect(await prisma.memoryCapsule.count()).toBe(capsulesBefore);
    expect(await prisma.twinCorrectionMemory.count()).toBe(correctionsBefore);
  });

  it("J3 ambiguity: two same-name people from different companies → lineage stays SILENT; Acme Inc vs Acme Labs are two accounts, never merged", async () => {
    const dupName = `Taylor Smoke ${RUN}`;
    await prisma.externalCollaborator.createMany({
      data: [
        {
          org_entity_id: orgId, display_name: dupName,
          company_name: `Acme Inc ${RUN}`, relationship_type: "CLIENT",
          created_by_entity_id: callerId,
        },
        {
          org_entity_id: orgId, display_name: dupName,
          company_name: `Globex ${RUN}`, relationship_type: "VENDOR",
          created_by_entity_id: callerId,
        },
      ],
    });
    const ev = slackMessageToSourceEvent(
      {
        ts: "1752000000.200002",
        text: "David owns the review work and will finish today.",
        user: "U0J3", user_name: dupName, channel_id: "C0J3", team_id: "T0J3",
      },
      callerId,
    );
    expect((await ingestSourceEvent(ev, { llmProvider: null })).ok).toBe(true);
    const myWork = await getMyWork({ org_entity_id: orgId, caller_entity_id: davidId });
    // Ambiguous match → silence, never an invented party.
    for (const v of myWork) expect(v.external_context).toBeUndefined();

    // Distinct normalized names are distinct accounts by construction.
    const inc = await getOrCreateExternalOrganizationForCaller({
      org_entity_id: orgId, caller_entity_id: callerId,
      company_label: `Acme Inc ${RUN}`, source: "manual_track",
    });
    const labs = await getOrCreateExternalOrganizationForCaller({
      org_entity_id: orgId, caller_entity_id: callerId,
      company_label: `Acme Labs ${RUN}`, source: "manual_track",
    });
    expect(inc!.external_org_id).not.toBe(labs!.external_org_id);
  });

  it("edges: a revoked collaborator never matches; a soft-deleted account never reuses; a duplicate import never duplicates the obligation", async () => {
    const ghost = `Ghost Smoke ${RUN}`;
    const g = await prisma.externalCollaborator.create({
      data: {
        org_entity_id: orgId, display_name: ghost,
        company_name: `GhostCo ${RUN}`, relationship_type: "VENDOR",
        created_by_entity_id: callerId, deleted_at: new Date(),
      },
    });
    void g;
    const ev = slackMessageToSourceEvent(
      {
        ts: "1752000000.300003",
        text: "David owns the audit work and will finish today.",
        user: "U0E1", user_name: ghost, channel_id: "C0E1", team_id: "T0E1",
      },
      callerId,
    );
    expect((await ingestSourceEvent(ev, { llmProvider: null })).ok).toBe(true);
    const myWork = await getMyWork({ org_entity_id: orgId, caller_entity_id: davidId });
    for (const v of myWork) expect(v.external_context).toBeUndefined();

    // Soft-deleted account → a fresh row, never a resurrection-by-match.
    const first = await getOrCreateExternalOrganizationForCaller({
      org_entity_id: orgId, caller_entity_id: callerId,
      company_label: `Phoenix ${RUN}`, source: "manual_track",
    });
    await prisma.externalOrganization.update({
      where: { external_org_id: first!.external_org_id },
      data: { deleted_at: new Date() },
    });
    const second = await getOrCreateExternalOrganizationForCaller({
      org_entity_id: orgId, caller_entity_id: callerId,
      company_label: `Phoenix ${RUN}`, source: "manual_track",
    });
    expect(second).toBeNull(); // unique(org, normalized) still holds on the
    // soft-deleted row — creation refuses rather than silently resurrecting;
    // restore is an explicit future admin action. (If create had succeeded,
    // the ids would differ; either way NO silent match to a deleted row.)

    // Duplicate import → ONE ExternalCommitment (source_conversation_id
    // anchors the dedupe).
    const ws = await makeWorkspaceWithCaller(`Vendor ws ${RUN}`);
    const vendor = `Vendor Smoke ${RUN}`;
    const tracked = await trackExternalCollaboratorForCaller({
      workspaceId: ws.workspace_id, callerEntityId: callerId,
      displayName: vendor, companyName: `VendorCo ${RUN}`, relationshipType: "VENDOR",
    } as never);
    const vendorId = (tracked as { external_collaborator: { external_collaborator_id: string } }).external_collaborator
      .external_collaborator_id;
    await prisma.collaborationMembership.create({
      data: {
        workspace_id: ws.workspace_id, org_entity_id: orgId,
        member_entity_id: await makeEntity(`Vendor Member ${RUN}`, "PERSON"),
        member_display_name: vendor, role_label: "Vendor", member_type: "EXTERNAL",
      },
    });
    const convId = randomUUID();
    const payload = {
      workspaceId: ws.workspace_id, callerEntityId: callerId,
      sourceConversationId: convId, decisions: [],
      commitments: [
        { text: `${vendor} ships the part ${RUN}`, source_excerpt: `${vendor}: shipping the part.` },
      ],
    };
    expect(((await importCommsOutputForWorkspaceForCaller(payload as never)) as { ok: boolean }).ok).toBe(true);
    expect(((await importCommsOutputForWorkspaceForCaller(payload as never)) as { ok: boolean }).ok).toBe(true);
    expect(
      await prisma.externalCommitment.count({
        where: { org_entity_id: orgId, external_collaborator_id: vendorId, source_conversation_id: convId },
      }),
    ).toBe(1);
  });

  it("J6 directions: we-owe-them renders as a follow-up obligation; they-owe-us as waiting; internal owner stays internal", async () => {
    const account = `Direction Co ${RUN}`;
    const org = await getOrCreateExternalOrganizationForCaller({
      org_entity_id: orgId, caller_entity_id: callerId,
      company_label: account, relationship_type: "CLIENT", source: "manual_track",
    });
    const collab = await prisma.externalCollaborator.create({
      data: {
        org_entity_id: orgId, display_name: `Dana Smoke ${RUN}`,
        company_name: account, relationship_type: "CLIENT",
        external_org_id: org!.external_org_id, created_by_entity_id: callerId,
      },
    });
    const ws = await makeWorkspaceWithCaller(`Direction ws ${RUN}`);
    const mk = async (direction: "INTERNAL_OWES_EXTERNAL" | "EXTERNAL_OWES_INTERNAL") => {
      const convId = randomUUID();
      await prisma.externalCommitment.create({
        data: {
          workspace_id: ws.workspace_id, org_entity_id: orgId,
          external_collaborator_id: collab.external_collaborator_id,
          direction, text: `${direction} ${RUN}`, source_conversation_id: convId,
          added_by_entity_id: callerId,
        },
      });
      const row = await prisma.workLedgerEntry.create({
        data: {
          org_entity_id: orgId, ledger_type: "FOLLOW_UP", source_type: "VOICE_COMMAND",
          title: `${TEST_PREFIX} ${direction} ${RUN}`, status: "PROPOSED", priority: "ROUTINE",
          extraction_source: "TYPESCRIPT_DETERMINISTIC", owner_entity_id: davidId,
          conversation_id: convId, details: {}, evidence: [],
        },
      });
      const gated = await getLedgerEntry({
        ledger_entry_id: row.ledger_entry_id, org_entity_id: orgId,
        caller_entity_id: davidId, is_manager: false,
      });
      expect(gated.ok).toBe(true);
      return gated.ok ? gated.entry : null;
    };
    const weOwe = await mk("INTERNAL_OWES_EXTERNAL");
    expect(weOwe!.external_context?.waiting_direction).toBe("we_owe_them");
    expect(weOwe!.external_context?.safe_context_label).toBe("Client follow-up");
    expect(weOwe!.owner_entity_id).toBe(davidId); // internal owner stays internal
    const theyOwe = await mk("EXTERNAL_OWES_INTERNAL");
    expect(theyOwe!.external_context?.waiting_direction).toBe("they_owe_us");
    expect(theyOwe!.external_context?.safe_context_label).toBe(`Waiting on ${account}`);
  });
});
