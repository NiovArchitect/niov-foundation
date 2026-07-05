// FILE: seeded-context.test.ts (integration, real Postgres)
// PURPOSE: [CS-1] lock the seeded-context mode on the ONE ingestion spine
//          (Gap V doctrine): seeded history creates CONTEXT, never to-dos —
//          work rows land VERIFIED (terminal) with the seeded lineage label
//          and no action nudges; ZERO follow-up send cards are minted;
//          seeded rows never appear as open work in My Work; external names
//          in seeded content still flow ONLY through the observed→review
//          rail (seeding never creates trust); nothing enters personal
//          memory; and normal live ingestion is byte-for-byte unchanged.
// CONNECTS TO: comms-ingest.service.ts ([CS-1] seededContext deps flag),
//          docs/otzar OTZAR_ORG_CONTEXT_SEEDING_AND_TWIN_CALIBRATION_MODEL
//          (CT repo), Gap V.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@niov/database";
import { ingestSourceEvent, slackMessageToSourceEvent } from "@niov/api";
import { getMyWork } from "../../apps/api/src/services/work-os/work-ledger.service.js";
import { createEntity } from "../../packages/database/src/queries/entity.js";
import { cleanupTestData, ensureAuditTriggers, TEST_PREFIX } from "../helpers.js";

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
  await prisma.externalCollaboratorIdentifier.deleteMany({ where: { org_entity_id: { in: ids } } });
  await prisma.externalCollaborator.deleteMany({ where: { org_entity_id: { in: ids } } });
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

describe("[CS-1] seeded-context mode (DB)", () => {
  let orgId = "";
  let callerId = "";
  let davidId = "";

  beforeEach(async () => {
    await ensureAuditTriggers();
    await cleanup();
    await cleanupTestData();
    orgId = await makeEntity("CS Org", "COMPANY");
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

  function slackEvent(text: string, ts: string, actor = "Sadeil Caller") {
    return slackMessageToSourceEvent(
      {
        ts,
        text,
        user: "U0SEED",
        user_name: actor,
        channel_id: "C0SEED",
        channel_name: "history",
        team_id: "T0SEED",
      },
      callerId,
    );
  }
  const WORK_TEXT = "David owns the repo access work and will grant write access today.";

  it("seeded history becomes VERIFIED context with lineage — no to-dos, no nudges, no follow-up cards, absent from open work", async () => {
    const capsulesBefore = await prisma.memoryCapsule.count();
    const r = await ingestSourceEvent(slackEvent(WORK_TEXT, "1752200000.100001", "Morgan History"), {
      llmProvider: null as never,
      seededContext: { provided_by: callerId, covering_period: "2026-Q1" },
    });
    expect(r.ok).toBe(true);

    const rows = await prisma.workLedgerEntry.findMany({
      where: { org_entity_id: orgId, ledger_type: { notIn: ["ORG_SEEDING"] } },
    });
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const d = row.details as Record<string, unknown>;
      const sc = d.seeded_context as Record<string, unknown> | undefined;
      expect(sc).toBeDefined();
      expect(sc!.provided_by).toBe(callerId);
      expect(sc!.covering_period).toBe("2026-Q1");
      expect(typeof sc!.seeded_at).toBe("string");
    }
    // Work rows are terminal context, never open to-dos, never nudging.
    const workRows = rows.filter((x) => x.ledger_type !== "MEETING");
    expect(workRows.length).toBeGreaterThan(0);
    for (const row of workRows) {
      expect(row.status).toBe("VERIFIED");
      expect(row.next_action).toBeNull();
    }
    // The stale-transcript rule: ZERO follow-up send cards.
    expect(rows.filter((x) => x.ledger_type === "FOLLOW_UP").length).toBe(0);
    // Seeded rows never appear as David's open work.
    const myWork = await getMyWork({ org_entity_id: orgId, caller_entity_id: davidId });
    expect(myWork.filter((v) => v.status !== "VERIFIED").length).toBe(0);
    // Nothing entered personal memory.
    expect(await prisma.memoryCapsule.count()).toBe(capsulesBefore);
  });

  it("external names in seeded content get ONLY the review rail — no collaborator, no trust; the seed carries the seeded lineage", async () => {
    const externalName = `Jordan Vale ${RUN}`;
    await prisma.externalEntity.create({
      data: { org_entity_id: orgId, name: externalName, entity_type: "CLIENT" },
    });
    const r = await ingestSourceEvent(
      slackEvent(WORK_TEXT, "1752200000.200001", externalName),
      {
        llmProvider: null as never,
        seededContext: { provided_by: callerId },
      },
    );
    expect(r.ok).toBe(true);
    // No governed collaborator was created from seeded history.
    expect(await prisma.externalCollaborator.count({ where: { org_entity_id: orgId } })).toBe(0);
    // The review seed exists, marked as seeded context.
    const seeds = await prisma.workLedgerEntry.findMany({
      where: {
        org_entity_id: orgId,
        ledger_type: "ORG_SEEDING",
        details: { path: ["seed_type"], equals: "review_external_party" },
      },
    });
    expect(seeds.length).toBe(1);
    const d = seeds[0]!.details as Record<string, unknown>;
    expect((d.seeded_context as Record<string, unknown>).provided_by).toBe(callerId);
  });

  it("normal live ingestion is unchanged: actionable statuses, nudges, and follow-up cards still mint", async () => {
    const r = await ingestSourceEvent(slackEvent(WORK_TEXT, "1752200000.300001", "Morgan History"), {
      llmProvider: null as never,
    });
    expect(r.ok).toBe(true);
    const rows = await prisma.workLedgerEntry.findMany({
      where: { org_entity_id: orgId, ledger_type: { notIn: ["ORG_SEEDING", "MEETING"] } },
    });
    expect(rows.length).toBeGreaterThan(0);
    // Live rows carry NO seeded label and keep LIVE semantics: actionable
    // status + a real next-action nudge (this fixture yields a PROPOSED
    // commitment with a connector-setup nudge; FOLLOW_UP send-card minting
    // for governed-external actors is locked in external-resolution.test).
    for (const row of rows) {
      expect((row.details as Record<string, unknown>).seeded_context).toBeUndefined();
    }
    expect(rows.some((x) => x.status !== "VERIFIED")).toBe(true);
    expect(rows.some((x) => x.next_action !== null)).toBe(true);
  });
});
