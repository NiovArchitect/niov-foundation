// FILE: source-event-ingest.test.ts (integration, real Postgres)
// PURPOSE: Slice A — prove a NON-transcript source flows through the SAME governed
//          chain into the SAME canonical WorkLedger as transcripts. A Slack-shaped
//          source event: persists a durable capture (API_INGEST + external id),
//          resolves the right owner (David), carries sourceType + source evidence
//          on every ledger row, runs the execution planner (GitHub connector gap),
//          writes Work-Graph events + Dandelion seeds — and re-ingesting the SAME
//          event is idempotent (no duplicate work). Noisy content mints no work;
//          an uninvolved member owns nothing. NO LLM (deterministic).
// CONNECTS TO: services/otzar/comms-ingest.service.ts (ingestSourceEvent),
//              source-event.ts, meeting-capture.service.ts (findCaptureByExternalId).

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@niov/database";
import { ingestSourceEvent, type WorkSourceEvent } from "@niov/api";
import { createEntity } from "../../packages/database/src/queries/entity.js";
import { ensureAuditTriggers, cleanupTestData } from "../helpers.js";

const TEST_PREFIX = "__niov_test__source_event__";

function fakePublicKey(seed: string): string {
  return `-----BEGIN PUBLIC KEY-----\n${seed}\n-----END PUBLIC KEY-----`;
}
async function makeEntity(displayName: string, entityType: "PERSON" | "COMPANY"): Promise<string> {
  const e = await createEntity({
    email: `${TEST_PREFIX}${displayName.toLowerCase().replace(/\s/g, ".")}@niov-test.com`,
    public_key: fakePublicKey(displayName),
    display_name: `${TEST_PREFIX} ${displayName}`,
    entity_type: entityType,
    clearance_level: 3,
    status: "ACTIVE",
  });
  return e.entity_id;
}
async function cleanup(): Promise<void> {
  const ents = await prisma.entity.findMany({ where: { display_name: { startsWith: TEST_PREFIX } }, select: { entity_id: true } });
  const ids = ents.map((e) => e.entity_id);
  if (ids.length === 0) return;
  await prisma.workLedgerEntry.deleteMany({ where: { org_entity_id: { in: ids } } });
  const caps = await prisma.meetingCapture.findMany({ where: { org_entity_id: { in: ids } }, select: { meeting_capture_id: true } });
  const capIds = caps.map((c) => c.meeting_capture_id);
  if (capIds.length > 0) {
    await prisma.meetingParticipantConsent.deleteMany({ where: { meeting_capture_id: { in: capIds } } });
    await prisma.meetingCapture.deleteMany({ where: { meeting_capture_id: { in: capIds } } });
  }
}

const CONTENT = [
  "David owns the repo access work and will grant write access today.",
  "you you you you",
  "............",
].join("\n");

function slackEvent(callerId: string, over: Partial<WorkSourceEvent> = {}): WorkSourceEvent {
  return {
    sourceType: "CONNECTOR",
    sourceSystem: "SLACK",
    sourceId: "1699900000.123456",
    sourceUrl: "https://slack.com/archives/C1/p1699900000123456",
    actor: { name: "Sadeil", handle: "@sadeil" },
    participants: [{ name: "David" }],
    timestamp: "2026-06-30T12:00:00Z",
    callerEntityId: callerId,
    title: "Launch demo Slack thread",
    content: CONTENT,
    ...over,
  };
}

describe("source-event ingest — non-transcript intake, one ledger (DB)", () => {
  let orgId = "";
  let callerId = "";
  let davidId = "";
  let eveId = "";

  beforeEach(async () => {
    await ensureAuditTriggers();
    await cleanup();
    await cleanupTestData();
    orgId = await makeEntity("SE Org", "COMPANY");
    callerId = await makeEntity("Sadeil Caller", "PERSON");
    davidId = await makeEntity("David", "PERSON");
    eveId = await makeEntity("Eve Uninvolved", "PERSON");
    for (const id of [callerId, davidId, eveId]) {
      await prisma.entityMembership.create({ data: { parent_id: orgId, child_id: id, is_active: true } });
    }
  });
  afterAll(async () => {
    await cleanup();
    await cleanupTestData();
    await prisma.$disconnect();
  });

  it("feeds the SAME WorkLedger path: owner resolved, sourceType + source evidence, execution plan, scoping", async () => {
    const r = await ingestSourceEvent(slackEvent(callerId), { llmProvider: null });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    // Durable capture on the SAME MeetingCapture rail, via API_INGEST + external id (dedupe anchor).
    const cap = await prisma.meetingCapture.findUnique({ where: { meeting_capture_id: r.conversation.meeting_capture_id } });
    expect(cap).not.toBeNull();
    expect(cap!.org_entity_id).toBe(orgId);
    expect(cap!.provider).toBe("API_INGEST");
    expect(cap!.provider_meeting_id).toBe("SLACK:1699900000.123456");

    // Noisy tail quarantined — noise cannot mint work.
    expect(r.quality.quarantined).toBeGreaterThanOrEqual(1);

    // Owner resolution works the same way (David → owned COMMITMENT), and the row
    // carries the source TYPE + full source EVIDENCE so it can prove its origin.
    const davidRows = await prisma.workLedgerEntry.findMany({
      where: { org_entity_id: orgId, owner_entity_id: davidId, ledger_type: "COMMITMENT" },
    });
    expect(davidRows.length).toBeGreaterThanOrEqual(1);
    const row = davidRows[0]!;
    expect(row.source_type).toBe("CONNECTOR");
    const details = row.details as Record<string, unknown>;
    expect(details.source).toBe("slack_ingest");
    expect(details.source_system).toBe("SLACK");
    expect(details.source_id).toBe("1699900000.123456");
    expect(details.source_url).toBe("https://slack.com/archives/C1/p1699900000123456");
    expect(details.dedupe_key).toBe("SLACK:1699900000.123456");

    // Execution planner ran; the repo work needs GitHub and surfaces the gap.
    const gh = r.work_items.find((w) => w.execution.required_connector === "GITHUB");
    expect(gh, "GitHub-connector work item exists").toBeTruthy();
    expect(gh!.execution.capability_state).not.toBe("connected");

    // Work-Graph/memory events + Dandelion seeds still generate.
    expect(r.work_graph_event_count).toBeGreaterThan(0);
    const seedRows = await prisma.workLedgerEntry.findMany({ where: { org_entity_id: orgId, ledger_type: "ORG_SEEDING" } });
    expect(seedRows.length).toBeGreaterThanOrEqual(1);
    expect((seedRows[0]!.details as Record<string, unknown>).source_system).toBe("SLACK");

    // Per-user scoping: the uninvolved member owns nothing.
    const eveRows = await prisma.workLedgerEntry.findMany({ where: { org_entity_id: orgId, owner_entity_id: eveId } });
    expect(eveRows.length).toBe(0);
  });

  it("is idempotent: re-ingesting the SAME source event creates no duplicate work", async () => {
    const first = await ingestSourceEvent(slackEvent(callerId), { llmProvider: null });
    expect(first.ok).toBe(true);
    const before = await prisma.workLedgerEntry.count({ where: { org_entity_id: orgId } });

    const dup = await ingestSourceEvent(slackEvent(callerId), { llmProvider: null });
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.code).toBe("ALREADY_INGESTED");

    const after = await prisma.workLedgerEntry.count({ where: { org_entity_id: orgId } });
    expect(after).toBe(before); // no duplicate work
  });

  it("a DIFFERENT source id re-ingests (dedupe is per-event, not per-content)", async () => {
    await ingestSourceEvent(slackEvent(callerId), { llmProvider: null });
    const second = await ingestSourceEvent(slackEvent(callerId, { sourceId: "1699900999.000000" }), { llmProvider: null });
    expect(second.ok).toBe(true);
  });

  it("noisy-only content mints no owned work (noise cannot become high-confidence work)", async () => {
    const r = await ingestSourceEvent(
      slackEvent(callerId, { sourceId: "noise-1", content: "you you you\n....\nok ok ok" }),
      { llmProvider: null },
    );
    // Either an honest empty result or a result with zero owned work — never invented work.
    if (r.ok) {
      const owned = r.work_items.filter((w) => w.owner_entity_id !== null && !w.needs_review);
      expect(owned.length).toBe(0);
    }
  });

  it("[GAP-I ZOOM] a Zoom-shaped event lands with ZOOM lineage and is idempotent on re-ingest", async () => {
    const { zoomRecordingToSourceEvent } = await import("@niov/api");
    const zoomEvent: WorkSourceEvent = zoomRecordingToSourceEvent({
      meetingId: `zm-${Date.now()}`,
      topic: "Launch sync",
      transcript: "Sadeil: David owns the repo access work and will grant write access today.",
      callerEntityId: callerId,
      callerName: "Zoom recording import",
      orgEntityId: orgId,
      nowIso: new Date().toISOString(),
    });
    const first = await ingestSourceEvent(zoomEvent, { llmProvider: null });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    // Ledger rows carry the ZOOM source lineage (source_system + source_id).
    const rows = await prisma.workLedgerEntry.findMany({
      where: { org_entity_id: orgId, source_type: "CONNECTOR" },
    });
    expect(rows.length).toBeGreaterThan(0);
    const withLineage = rows.filter((r) => {
      const d = r.details as Record<string, unknown>;
      return d.source_system === "ZOOM" && d.source_id === zoomEvent.sourceId;
    });
    expect(withLineage.length).toBeGreaterThan(0);
    const countAfterFirst = rows.length;

    // Re-ingesting the SAME recording: honest refusal, zero duplicate work.
    const dup = await ingestSourceEvent(zoomEvent, { llmProvider: null });
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.code).toBe("ALREADY_INGESTED");
    const rowsAfter = await prisma.workLedgerEntry.count({
      where: { org_entity_id: orgId, source_type: "CONNECTOR" },
    });
    expect(rowsAfter).toBe(countAfterFirst);

    // No tokenized URLs / secrets anywhere in the stored details.
    for (const r of rows) {
      const raw = JSON.stringify(r.details);
      expect(raw).not.toContain("access_token");
      expect(raw).not.toContain("download_url");
    }
  });

  it("[GAP-I ZOOM] cross-org isolation: the SAME Zoom meeting id ingests independently per org — dedupe never collides across orgs", async () => {
    const { zoomRecordingToSourceEvent } = await import("@niov/api");
    const meetingId = `zm-shared-${Date.now()}`;
    const build = (caller: string, org: string) =>
      zoomRecordingToSourceEvent({
        meetingId,
        topic: "Shared-id sync",
        transcript: "Sadeil: David owns the repo access work and will grant write access today.",
        callerEntityId: caller,
        callerName: "Zoom recording import",
        orgEntityId: org,
        nowIso: new Date().toISOString(),
      });

    // Org 1 ingests the recording.
    const first = await ingestSourceEvent(build(callerId, orgId), { llmProvider: null });
    expect(first.ok).toBe(true);

    // A DIFFERENT org ingesting the same provider meeting id must SUCCEED —
    // dedupe is org-scoped (Zoom for Org A is not Zoom for Org B).
    const otherOrgId = await makeEntity("Other Zoom Org", "COMPANY");
    const otherCallerId = await makeEntity("Other Zoom Caller", "PERSON");
    await prisma.entityMembership.create({
      data: { parent_id: otherOrgId, child_id: otherCallerId, is_active: true },
    });
    const second = await ingestSourceEvent(build(otherCallerId, otherOrgId), {
      llmProvider: null,
    });
    expect(second.ok).toBe(true);

    // …while re-ingesting within the SAME org still refuses.
    const dup = await ingestSourceEvent(build(callerId, orgId), { llmProvider: null });
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.code).toBe("ALREADY_INGESTED");

    // Rows stay inside their own orgs.
    const org1Rows = await prisma.workLedgerEntry.findMany({
      where: { org_entity_id: orgId, source_type: "CONNECTOR" },
    });
    const org2Rows = await prisma.workLedgerEntry.findMany({
      where: { org_entity_id: otherOrgId, source_type: "CONNECTOR" },
    });
    const lineage1 = org1Rows.filter(
      (r) => (r.details as Record<string, unknown>).source_id === meetingId,
    );
    const lineage2 = org2Rows.filter(
      (r) => (r.details as Record<string, unknown>).source_id === meetingId,
    );
    expect(lineage1.length).toBeGreaterThan(0);
    expect(lineage2.length).toBeGreaterThan(0);
  });

  it("no cross-tenant leak: another org's caller ingesting does not write into this org", async () => {
    const otherOrg = await makeEntity("Other Org", "COMPANY");
    const otherCaller = await makeEntity("Other Caller", "PERSON");
    await prisma.entityMembership.create({ data: { parent_id: otherOrg, child_id: otherCaller, is_active: true } });

    const before = await prisma.workLedgerEntry.count({ where: { org_entity_id: orgId } });
    const r = await ingestSourceEvent(
      slackEvent(otherCaller, { sourceId: "other-1", content: "David owns the repo access work." }),
      { llmProvider: null },
    );
    expect(r.ok).toBe(true);
    // Work landed in the OTHER org, never leaked into this org.
    const after = await prisma.workLedgerEntry.count({ where: { org_entity_id: orgId } });
    expect(after).toBe(before);
    if (r.ok) {
      const cap = await prisma.meetingCapture.findUnique({ where: { meeting_capture_id: r.conversation.meeting_capture_id } });
      expect(cap!.org_entity_id).toBe(otherOrg);
    }
  });
});
