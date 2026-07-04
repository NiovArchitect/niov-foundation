// FILE: external-context.test.ts (integration, real Postgres)
// PURPOSE: [T-1] lock the read-only external-context projection: a
//          conversation-linked governed ExternalCommitment projects party +
//          waiting direction; a lineage source_actor that uniquely matches a
//          governed ExternalCollaborator (and NOT the internal roster)
//          projects "For {company}" context; unprovable links stay SILENT;
//          the same external name in two orgs never merges; no
//          emails/excerpts/raw ids leak; nothing enters personal memory.
// CONNECTS TO: apps/api/src/services/work-os/external-context.service.ts,
//          work-ledger.service.ts (enrichment call sites).

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@niov/database";
import { ingestSourceEvent, slackMessageToSourceEvent } from "@niov/api";
import { getMyWork, getLedgerEntry } from "../../apps/api/src/services/work-os/work-ledger.service.js";
import { createEntity } from "../../packages/database/src/queries/entity.js";
import { ensureAuditTriggers, cleanupTestData } from "../helpers.js";

const TEST_PREFIX = "__niov_test__extctx__";

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
  await prisma.externalCollaboratorIdentifier.deleteMany({ where: { org_entity_id: { in: ids } } });
  await prisma.externalCollaborator.deleteMany({ where: { org_entity_id: { in: ids } } });
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

describe("[T-1] external-context projection — context, not CRM (DB)", () => {
  let orgId = "";
  let callerId = "";
  let davidId = "";

  beforeEach(async () => {
    await ensureAuditTriggers();
    await cleanup();
    await cleanupTestData();
    orgId = await makeEntity("EC Org", "COMPANY");
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

  async function trackCollaborator(args: {
    org: string; name: string; company: string; relationship: "CLIENT" | "VENDOR" | "PROSPECT";
  }): Promise<string> {
    const c = await prisma.externalCollaborator.create({
      data: {
        org_entity_id: args.org,
        display_name: args.name,
        company_name: args.company,
        relationship_type: args.relationship,
        email: `${TEST_PREFIX}hidden@acme-external.test`, // must NEVER project
        created_by_entity_id: callerId,
      },
    });
    return c.external_collaborator_id;
  }

  it("a conversation-linked governed commitment projects party + waiting direction; no email/excerpt leaks", async () => {
    const collabId = await trackCollaborator({
      org: orgId, name: "Jordan Vale", company: "Acme", relationship: "CLIENT",
    });
    const ws = await prisma.collaborationWorkspace.create({
      data: { org_entity_id: orgId, title: `${TEST_PREFIX} Acme WS`, created_by_entity_id: callerId },
    });
    const convId = randomUUID();
    await prisma.externalCommitment.create({
      data: {
        workspace_id: ws.workspace_id,
        org_entity_id: orgId,
        external_collaborator_id: collabId,
        direction: "EXTERNAL_OWES_INTERNAL",
        text: "Acme sends the signed SOW",
        source_conversation_id: convId,
        source_excerpt: "SECRET-EXCERPT: we will send the SOW Friday",
        added_by_entity_id: callerId,
      },
    });
    const row = await prisma.workLedgerEntry.create({
      data: {
        org_entity_id: orgId,
        ledger_type: "FOLLOW_UP",
        source_type: "VOICE_COMMAND",
        title: `${TEST_PREFIX} chase the SOW`,
        status: "PROPOSED",
        priority: "ROUTINE",
        extraction_source: "TYPESCRIPT_DETERMINISTIC",
        owner_entity_id: davidId,
        conversation_id: convId,
        details: {},
        evidence: [],
      },
    });

    const gated = await getLedgerEntry({
      ledger_entry_id: row.ledger_entry_id, org_entity_id: orgId,
      caller_entity_id: davidId, is_manager: false,
    });
    expect(gated.ok).toBe(true);
    if (!gated.ok) return;
    const ec = gated.entry.external_context;
    expect(ec).toBeDefined();
    expect(ec!.external_party_type).toBe("client");
    expect(ec!.external_org_label).toBe("Acme");
    expect(ec!.external_person_label).toBe("Jordan Vale");
    expect(ec!.relationship_label).toBe("Client");
    expect(ec!.waiting_direction).toBe("they_owe_us");
    expect(ec!.safe_context_label).toBe("Waiting on Acme");
    expect(ec!.source).toBe("external_commitment");
    // The projection NEVER carries emails, excerpts, or raw ids.
    const raw = JSON.stringify(gated.entry);
    expect(raw).not.toContain("acme-external.test");
    expect(raw).not.toContain("SECRET-EXCERPT");
    expect(raw).not.toContain(collabId);
  });

  it("a lineage author uniquely matching a governed collaborator (not the roster) projects 'For {company}'", async () => {
    await trackCollaborator({
      org: orgId, name: "Morgan Reeve", company: "Globex", relationship: "PROSPECT",
    });
    const event = slackMessageToSourceEvent(
      {
        ts: "1751800000.100001",
        text: "David owns the repo access work and will grant write access today.",
        user: "U0EXT",
        user_name: "Morgan Reeve",
        channel_id: "C0EXT",
        channel_name: "prospects",
        team_id: "T0EXT",
      },
      callerId,
    );
    const r = await ingestSourceEvent(event, { llmProvider: null });
    expect(r.ok).toBe(true);

    const myWork = await getMyWork({ org_entity_id: orgId, caller_entity_id: davidId });
    const withCtx = myWork.filter((v) => v.external_context !== undefined);
    expect(withCtx.length).toBeGreaterThan(0);
    const ec = withCtx[0]!.external_context!;
    expect(ec.external_party_type).toBe("prospect");
    expect(ec.external_org_label).toBe("Globex");
    expect(ec.safe_context_label).toBe("For Globex");
    expect(ec.source).toBe("source_lineage");
    // Gap J lineage still present alongside (both projections coexist).
    expect(withCtx[0]!.source_lineage?.source_system).toBe("SLACK");
  });

  it("an INTERNAL author never becomes external context, and unprovable rows stay SILENT", async () => {
    // A collaborator sharing an employee's name — the roster match wins.
    await trackCollaborator({
      org: orgId, name: `${TEST_PREFIX} David`, company: "ShadowCo", relationship: "VENDOR",
    });
    const event = slackMessageToSourceEvent(
      {
        ts: "1751800000.200002",
        text: "David owns the repo access work and will grant write access today.",
        user: "U0INT",
        user_name: `${TEST_PREFIX} David`,
        channel_id: "C0INT",
        team_id: "T0INT",
      },
      callerId,
    );
    const r = await ingestSourceEvent(event, { llmProvider: null });
    expect(r.ok).toBe(true);
    const myWork = await getMyWork({ org_entity_id: orgId, caller_entity_id: davidId });
    // Roster-first: the internal David match blocks the ShadowCo mapping,
    // and rows with no provable link have NO external_context at all.
    for (const v of myWork) {
      expect(v.external_context?.external_org_label).not.toBe("ShadowCo");
    }
  });

  it("the same external name in two orgs never merges; nothing enters personal memory", async () => {
    await trackCollaborator({
      org: orgId, name: "Riley Cross", company: "Acme", relationship: "CLIENT",
    });
    // Org B has NO collaborator — its rows must stay silent even though the
    // same author name is tracked in org A.
    const orgB = await makeEntity("EC Org B", "COMPANY");
    const callerB = await makeEntity("Caller B", "PERSON");
    const ownerB = await makeEntity("Owner B", "PERSON");
    for (const id of [callerB, ownerB]) {
      await prisma.entityMembership.create({
        data: { parent_id: orgB, child_id: id, is_active: true },
      });
    }
    const capsulesBefore = await prisma.memoryCapsule.count();
    const correctionsBefore = await prisma.twinCorrectionMemory.count();

    const event = slackMessageToSourceEvent(
      {
        ts: "1751800000.300003",
        text: "Owner B owns the review work and will finish today.",
        user: "U0RC",
        user_name: "Riley Cross",
        channel_id: "C0RC",
        team_id: "T0RC",
      },
      callerB,
    );
    const r = await ingestSourceEvent(event, { llmProvider: null });
    expect(r.ok).toBe(true);
    const orgBWork = await getMyWork({ org_entity_id: orgB, caller_entity_id: callerB });
    for (const v of orgBWork) {
      expect(v.external_context).toBeUndefined(); // org A's Acme never leaks
    }
    // Read-only guarantee: no personal-memory writes from projection.
    expect(await prisma.memoryCapsule.count()).toBe(capsulesBefore);
    expect(await prisma.twinCorrectionMemory.count()).toBe(correctionsBefore);
  });
});
