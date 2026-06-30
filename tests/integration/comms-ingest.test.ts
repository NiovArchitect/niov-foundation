// FILE: comms-ingest.test.ts (integration, real Postgres)
// PURPOSE: Prove the transcript -> owned-work loop closes against the DB: a
//          captured transcript persists a durable conversation (MeetingCapture)
//          and creates per-OWNER Work Ledger rows under proof, while the noisy
//          tail is quarantined and an uninvolved member gets nothing. Runs with
//          NO LLM (LOCAL_FALLBACK) so the responsibility graph — and therefore
//          ownership — is deterministic.
// CONNECTS TO: services/otzar/comms-ingest.service.ts, work-item-planner.ts,
//              transcript-quality.ts, responsibility-graph.ts.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@niov/database";
import { ingestTranscript, buildResponsibilityGraph } from "@niov/api";
import { createEntity } from "../../packages/database/src/queries/entity.js";
import { ensureAuditTriggers, cleanupTestData } from "../helpers.js";

const TEST_PREFIX = "__niov_test__comms_ingest__";

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

async function cleanupIngestArtifacts(): Promise<void> {
  const ents = await prisma.entity.findMany({
    where: { display_name: { startsWith: TEST_PREFIX } },
    select: { entity_id: true },
  });
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

describe("comms-ingest — transcript becomes durable owned work (DB)", () => {
  let orgId = "";
  let callerId = "";
  let davidId = "";
  let eveId = "";

  // Explicit ownership for David; Eve is uninvolved. A noisy "thank you" + babble
  // tail must produce no work. The caller captures the meeting.
  const TRANSCRIPT = [
    "Sadeil: Let's confirm owners for the launch demo.",
    "David owns the repo access work and will grant write access today.",
    "Thank you.",
    "Thank you.",
    "you you you you you",
    "............",
  ].join("\n");

  beforeEach(async () => {
    await ensureAuditTriggers();
    await cleanupIngestArtifacts();
    await cleanupTestData();
    orgId = await makeEntity("Ingest Org", "COMPANY");
    callerId = await makeEntity("Sadeil Caller", "PERSON");
    davidId = await makeEntity("David", "PERSON");
    eveId = await makeEntity("Eve Uninvolved", "PERSON");
    for (const id of [callerId, davidId, eveId]) {
      await prisma.entityMembership.create({ data: { parent_id: orgId, child_id: id, is_active: true } });
    }
  });

  afterAll(async () => {
    await cleanupIngestArtifacts();
    await cleanupTestData();
    await prisma.$disconnect();
  });

  it("the responsibility graph deterministically makes David an owner (no LLM)", () => {
    const g = buildResponsibilityGraph(TRANSCRIPT);
    expect(g.nodes.some((n) => n.role === "owner" && /david/i.test(n.name))).toBe(true);
  });

  it("persists the conversation and creates an owned Work Ledger row for David; tail quarantined", async () => {
    const r = await ingestTranscript({ callerEntityId: callerId, capturedText: TRANSCRIPT, llmProvider: null });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    // Conversation persisted on the MeetingCapture rail.
    expect(r.conversation.meeting_capture_id.length).toBeGreaterThan(0);
    const cap = await prisma.meetingCapture.findUnique({
      where: { meeting_capture_id: r.conversation.meeting_capture_id },
    });
    expect(cap).not.toBeNull();
    expect(cap!.org_entity_id).toBe(orgId);

    // Noisy tail was quarantined (the thank-you / babble lines never seed work).
    expect(r.quality.quarantined).toBeGreaterThanOrEqual(2);
    expect(r.quality.noisy_tail_start_index).not.toBeNull();

    // An owned COMMITMENT row exists for David, sourced from the transcript.
    const davidRows = await prisma.workLedgerEntry.findMany({
      where: { org_entity_id: orgId, owner_entity_id: davidId, source_type: "TRANSCRIPT", ledger_type: "COMMITMENT" },
    });
    expect(davidRows.length).toBeGreaterThanOrEqual(1);
    expect(davidRows[0]!.status).toBe("PROPOSED");
    expect(davidRows[0]!.extraction_source).toBe("TYPESCRIPT_DETERMINISTIC");

    // Per-user scoping: the uninvolved member owns nothing.
    const eveRows = await prisma.workLedgerEntry.findMany({
      where: { org_entity_id: orgId, owner_entity_id: eveId },
    });
    expect(eveRows.length).toBe(0);

    // The conversation is recorded as a durable MEETING row (Recent Conversations).
    const meetingRows = await prisma.workLedgerEntry.findMany({
      where: { org_entity_id: orgId, ledger_type: "MEETING", source_type: "TRANSCRIPT" },
    });
    expect(meetingRows.length).toBe(1);

    // The API result agrees with the DB.
    expect(r.work_items.some((w) => w.owner_entity_id === davidId && !w.needs_review)).toBe(true);
  });

  it("an unproven owner (not on the roster) is held NEEDS_OWNER, never auto-assigned", async () => {
    const t = "Mallory owns the billing rewrite and will ship it next week.";
    const r = await ingestTranscript({ callerEntityId: callerId, capturedText: t, llmProvider: null });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // If the graph attributed ownership to "Mallory", it must be unowned + review.
    const mallory = r.work_items.find((w) => /mallory/i.test(w.owner_name));
    if (mallory) {
      expect(mallory.owner_entity_id).toBeNull();
      expect(mallory.needs_review).toBe(true);
      expect(mallory.status).toBe("NEEDS_OWNER");
    }
    // No work ledger row may be owned by a non-roster entity for this org.
    const owned = await prisma.workLedgerEntry.findMany({
      where: { org_entity_id: orgId, ledger_type: "COMMITMENT", owner_entity_id: { not: null } },
    });
    for (const row of owned) {
      expect([callerId, davidId, eveId]).toContain(row.owner_entity_id);
    }
  });

  it("the caller named as an owner resolves to themselves (not held as unknown)", async () => {
    // The caller ("Sadeil Caller") captures a meeting where they are the owner.
    const t = "Sadeil owns the launch checklist and will finish it today.";
    const r = await ingestTranscript({ callerEntityId: callerId, capturedText: t, llmProvider: null });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    if (r.work_items.some((w) => /sadeil/i.test(w.owner_name))) {
      const self = r.work_items.find((w) => w.owner_entity_id === callerId);
      expect(self).toBeDefined();
      expect(self?.needs_review).toBe(false);
      expect(self?.status).toBe("PROPOSED");
    }
  });

  it("attaches a typed execution plan; connector-backed work with no connector is connector_required (Phase 4/5)", async () => {
    const r = await ingestTranscript({ callerEntityId: callerId, capturedText: TRANSCRIPT, llmProvider: null });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const david = r.work_items.find((w) => w.owner_entity_id === davidId);
    expect(david).toBeDefined();
    // The repo-access commitment classifies to a GitHub-backed plan.
    expect(david!.execution.execution_type).toBe("repo_access");
    expect(david!.execution.required_connector).toBe("GITHUB");
    // The test org has no GitHub connector → a visible setup-required blocker, not dropped.
    expect(["not_connected", "connector_missing"]).toContain(david!.execution.capability_state);
    expect(david!.execution.execution_mode).toBe("connector_required");
    expect(david!.execution.blocker_reason).not.toBeNull();
    // The plan is persisted on the ledger row's details (survives reload).
    const row = await prisma.workLedgerEntry.findFirst({
      where: { org_entity_id: orgId, owner_entity_id: davidId, ledger_type: "COMMITMENT", source_type: "TRANSCRIPT" },
    });
    const plan = (row?.details as { execution_plan?: { executionType?: string } } | null)?.execution_plan;
    expect(plan?.executionType).toBe("repo_access");
  });
});
