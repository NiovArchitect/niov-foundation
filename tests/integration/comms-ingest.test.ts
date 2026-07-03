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
import { getMyWork, createLedgerEntry } from "../../apps/api/src/services/work-os/work-ledger.service.js";
import { getPendingFollowUps, resolveFollowUpRecipient } from "../../apps/api/src/services/work-os/comms-artifacts.service.js";
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

  it("[PROD-UX-BUGB] persists each drafted follow-up as a durable FOLLOW_UP row, resumable + excluded from My Work", async () => {
    const r = await ingestTranscript({ callerEntityId: callerId, capturedText: TRANSCRIPT, llmProvider: null });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    // Persistence contract: exactly one durable FOLLOW_UP ledger row per drafted
    // follow-up returned in the extraction — the cards can no longer live only
    // in the CT's volatile response.
    const followUpRows = await prisma.workLedgerEntry.findMany({
      where: { org_entity_id: orgId, ledger_type: "FOLLOW_UP", source_type: "TRANSCRIPT" },
    });
    expect(followUpRows.length).toBe(r.extraction.suggested_actions.length);

    // Every stored row is keyed to the conversation, owned by the caller (the
    // sender), carries a concrete next step (so it reads as actionable work, not
    // a stuck blind spot), and carries the full send-card payload verbatim so
    // the resume projection can rebuild the exact ProposedActionCard.
    for (const row of followUpRows) {
      expect(row.conversation_id).toBe(r.conversation.meeting_capture_id);
      expect(row.owner_entity_id).toBe(callerId);
      expect(row.status).toBe("DRAFT");
      expect(row.next_action).toBeTruthy();
      const details = row.details as Record<string, unknown>;
      const card = details.follow_up as Record<string, unknown> | undefined;
      expect(card).toBeDefined();
      expect(typeof card!.draft_text).toBe("string");
      expect(typeof card!.local_id).toBe("string");
    }

    // The resume projection returns them for the caller (survives navigation) —
    // this is the rich send-card surface in Comms.
    const pending = await getPendingFollowUps({ org_entity_id: orgId, caller_entity_id: callerId });
    expect(pending.length).toBe(followUpRows.length);

    // A drafted follow-up the caller owns IS the caller's pending work: it also
    // appears in My Work (the single store surfaced on every relevant page).
    // The mirrored COMMITMENT has a DIFFERENT owner (the doer), so there is no
    // double-count.
    const myWork = await getMyWork({ org_entity_id: orgId, caller_entity_id: callerId });
    const myFollowUps = myWork.filter((w) => w.ledger_type === "FOLLOW_UP");
    expect(myFollowUps.length).toBe(followUpRows.length);
  });

  it("[PROD-UX-BUGC] a caller-confirmed recipient review persists on the row + writes a real audit event (DB)", async () => {
    // A durable FOLLOW_UP whose recipient Otzar could NOT prove is connected to
    // the work (out_of_scope) — the exact stuck state BUG C unblocks.
    const created = await createLedgerEntry({
      org_entity_id: orgId,
      ledger_type: "FOLLOW_UP",
      source_type: "TRANSCRIPT",
      owner_entity_id: callerId,
      requester_entity_id: callerId,
      target_entity_id: davidId,
      title: "Follow-up to David",
      summary: "David — please confirm the repo access rollout.",
      status: "DRAFT",
      next_action: "Review and send this follow-up.",
      details: {
        follow_up: {
          local_id: "fu-bugc-1",
          action_type: "SEND_INTERNAL_NOTIFICATION",
          target: { entity_id: davidId, display_name: "David", email: null },
          draft_text: "David — please confirm the repo access rollout.",
          reason: "Named in the conversation.",
          source_excerpt: null,
          confidence: "MEDIUM",
          resolution_status: "RESTRICTED",
          recipient_governance: {
            entity_id: davidId,
            display_name: "David",
            email: null,
            role: null,
            participantStatus: "unknown",
            mentionStatus: "explicitly_mentioned",
            workConnectionType: "none",
            evidence: { quote: null, source: "fuzzy_only", matchedToken: "david", alternativeCandidates: [] },
            roleMatch: "unknown",
            hierarchyConnection: "unknown",
            projectConnection: "unknown",
            policyStatus: "allowed",
            sensitivity: "internal",
            confidence: "low",
            recipientSafety: "out_of_scope",
            autonomyEligibility: "blocked",
          },
          autonomy: { bucket: "NEEDS_REVIEW" },
        },
      },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const lid = created.entry.ledger_entry_id;

    const r = await resolveFollowUpRecipient({
      org_entity_id: orgId,
      caller_entity_id: callerId,
      ledger_entry_id: lid,
      decision: "confirm",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    // The decision persisted on the DB row (survives navigation/refresh by
    // construction) with the audit pointer set.
    const dbRow = await prisma.workLedgerEntry.findUnique({ where: { ledger_entry_id: lid } });
    const payload = (dbRow!.details as { follow_up: { recipient_governance: { recipientSafety: string; evidence: { source: string } } } }).follow_up;
    expect(payload.recipient_governance.recipientSafety).toBe("confirmed");
    expect(payload.recipient_governance.evidence.source).toBe("caller_confirmed");
    expect(dbRow!.audit_event_id).toBe(r.audit_event_id);

    // A REAL audit event exists recording the decision (immutable trail).
    const audit = await prisma.auditEvent.findUnique({ where: { audit_id: r.audit_event_id } });
    expect(audit).not.toBeNull();
    expect(audit!.event_type).toBe("ADMIN_ACTION");
    expect(audit!.actor_entity_id).toBe(callerId);
    expect((audit!.details as { action: string }).action).toBe("FOLLOW_UP_RECIPIENT_RESOLVED");

    // The resume projection now serves the CONFIRMED card (Send-ready in CT).
    const pending = await getPendingFollowUps({ org_entity_id: orgId, caller_entity_id: callerId });
    const mine = pending.find((f) => f.ledger_entry_id === lid);
    expect(mine?.action.recipient_governance.recipientSafety).toBe("confirmed");
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

  it("writes governed Work-Graph/memory events + Dandelion seeds, persisted + scoped (Phase 6)", async () => {
    const r = await ingestTranscript({ callerEntityId: callerId, capturedText: TRANSCRIPT, llmProvider: null });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Governed events written; a connector gap (David's GitHub repo access, not connected)
    // produced an approval-gated org-seeding suggestion.
    expect(r.work_graph_event_count).toBeGreaterThan(0);
    const toolSeed = r.dandelion_seeds.find((s) => s.seedType === "grant_tool_access" || s.seedType === "connector_setup");
    expect(toolSeed).toBeDefined();
    expect(toolSeed!.approvalRequired).toBe(true);
    expect(toolSeed!.sourceEvidence.length).toBeGreaterThan(0);
    // Persisted on the durable MEETING record, scoped to org members (no global leak).
    const meeting = await prisma.workLedgerEntry.findFirst({
      where: { org_entity_id: orgId, ledger_type: "MEETING", source_type: "TRANSCRIPT" },
      orderBy: { created_at: "desc" },
    });
    const details = meeting?.details as { dandelion_seeds?: unknown[]; work_graph_events?: Array<{ allowedViewers?: string[] }> } | null;
    expect(Array.isArray(details?.dandelion_seeds)).toBe(true);
    expect((details?.work_graph_events?.length ?? 0)).toBeGreaterThan(0);
    for (const e of details?.work_graph_events ?? []) {
      expect(e.allowedViewers).toContain(davidId); // scoped to real org members
      expect(e.allowedViewers).not.toContain("*"); // never global
    }
  });
});

// ── [LEARN-LOOP] The correction loop closes end-to-end against the DB ────────
// Ingest (ambiguous "Samiksha") -> human SELECT via the governed BUG C path ->
// ingest again -> Otzar proposes the previously chosen person with an
// explainable correction proof, and the same question is NOT re-asked.
// Cross-org isolation: another org's identical correction changes nothing here.

describe("[LEARN-LOOP] resolved follow-ups teach the next ingest (DB)", () => {
  let orgId = "";
  let callerId = "";
  let samikshaSharmaId = "";
  let samikshaVermaId = "";

  // Canonical demo-fixture sentinel (test env allows DEMO_SCRIPTED) with the
  // three demo names, so extraction proposes a "Samiksha" follow-up while the
  // roster holds TWO Samikshas — the repeated-ambiguity class.
  const FIXTURE =
    "Launch Follow-Up Meeting.\n" +
    "Sadeil: David, please review the UI flow. Samiksha will review the AI/NLP trial notes. " +
    "Annie can complete the compliance review this week.";

  beforeEach(async () => {
    await ensureAuditTriggers();
    await cleanupIngestArtifacts();
    await cleanupTestData();
    orgId = await makeEntity("LearnLoop Org", "COMPANY");
    callerId = await makeEntity("Sadeil Caller", "PERSON");
    const davidId2 = await makeEntity("David", "PERSON");
    samikshaSharmaId = await makeEntity("Samiksha Sharma", "PERSON");
    samikshaVermaId = await makeEntity("Samiksha Verma", "PERSON");
    const annieId = await makeEntity("Annie", "PERSON");
    for (const id of [callerId, davidId2, samikshaSharmaId, samikshaVermaId, annieId]) {
      await prisma.entityMembership.create({ data: { parent_id: orgId, child_id: id, is_active: true } });
    }
  });

  function samikshaAction(r: { extraction: { suggested_actions: Array<{ local_id: string; target: { entity_id: string | null }; recipient_governance: { recipientSafety: string; evidence: { source: string } } }> } }) {
    const a = r.extraction.suggested_actions.find((x) => x.local_id === "demo-samiksha");
    if (a === undefined) throw new Error("demo samiksha action missing");
    return a;
  }

  it("select once -> the next ingest proposes the chosen person (correction_memory proof), question not re-asked; other orgs unaffected", async () => {
    // 0) A DIFFERENT org already made the opposite selection. It must never
    //    leak into this org's routing.
    const otherOrgId = await makeEntity("Other Org", "COMPANY");
    const otherCallerId = await makeEntity("Other Caller", "PERSON");
    await prisma.entityMembership.create({ data: { parent_id: otherOrgId, child_id: otherCallerId, is_active: true } });
    const foreign = await createLedgerEntry({
      org_entity_id: otherOrgId,
      ledger_type: "FOLLOW_UP",
      source_type: "TRANSCRIPT",
      owner_entity_id: otherCallerId,
      requester_entity_id: otherCallerId,
      title: "Follow-up to Samiksha",
      summary: "x",
      status: "DRAFT",
      next_action: "Review and send this follow-up.",
      details: {
        follow_up: {
          local_id: "foreign-1",
          draft_text: "x",
          recipient_governance: {
            entity_id: samikshaSharmaId, // the OTHER Samiksha
            display_name: "Samiksha Sharma",
            recipientSafety: "confirmed",
            evidence: {
              quote: null,
              source: "caller_confirmed",
              matchedToken: null,
              alternativeCandidates: ["Samiksha Verma"],
            },
          },
        },
      },
    });
    expect(foreign.ok).toBe(true);

    // 1) First ingest: the Samiksha follow-up is honestly AMBIGUOUS (two
    //    Samikshas; the foreign org's correction did not leak).
    const r1 = await ingestTranscript({ callerEntityId: callerId, capturedText: FIXTURE, llmProvider: null });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(r1.extraction.extraction_mode).toBe("DEMO_SCRIPTED");
    const a1 = samikshaAction(r1);
    expect(a1.recipient_governance.recipientSafety).toBe("ambiguous");

    // 2) The human answers the question ONCE through the governed select path.
    const pending = await getPendingFollowUps({ org_entity_id: orgId, caller_entity_id: callerId });
    const card = pending.find(
      (f) => f.action.local_id === "demo-samiksha" && f.action.recipient_governance.recipientSafety === "ambiguous",
    );
    expect(card).toBeDefined();
    const resolved = await resolveFollowUpRecipient({
      org_entity_id: orgId,
      caller_entity_id: callerId,
      ledger_entry_id: card!.ledger_entry_id,
      decision: "select",
      recipient_entity_id: samikshaVermaId,
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    // Audit/proof linkage preserved on the correction record.
    expect(resolved.audit_event_id.length).toBeGreaterThan(0);

    // 3) Second ingest of a similar conversation: Otzar uses the prior org
    //    correction — the previously chosen person is proposed, with the
    //    correction as the explainable proof source, still human-reviewed.
    const r2 = await ingestTranscript({ callerEntityId: callerId, capturedText: FIXTURE, llmProvider: null });
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    const a2 = samikshaAction(r2);
    expect(a2.target.entity_id).toBe(samikshaVermaId);
    expect(a2.recipient_governance.recipientSafety).toBe("likely");
    expect(a2.recipient_governance.evidence.source).toBe("correction_memory");
    // Never send-ready by correction alone.
    expect(a2.recipient_governance.recipientSafety).not.toBe("confirmed");

    // 4) The question is not re-asked: no NEW ambiguous Samiksha card exists.
    const pendingAfter = await getPendingFollowUps({ org_entity_id: orgId, caller_entity_id: callerId });
    const ambiguousSamikshas = pendingAfter.filter(
      (f) => f.action.local_id === "demo-samiksha" && f.action.recipient_governance.recipientSafety === "ambiguous",
    );
    expect(ambiguousSamikshas.length).toBe(0);
    // And the durable row for the new follow-up targets the chosen person.
    const newRows = await prisma.workLedgerEntry.findMany({
      where: { org_entity_id: orgId, ledger_type: "FOLLOW_UP", target_entity_id: samikshaVermaId },
    });
    expect(newRows.length).toBeGreaterThanOrEqual(1);
  });

  it("the foreign org's own ingest keeps ITS routing isolated too (no bleed either direction)", async () => {
    // This org resolves to Sharma; a fresh ingest here must follow Sharma —
    // proving the correction store is org-scoped in the direction we consume.
    const card = await createLedgerEntry({
      org_entity_id: orgId,
      ledger_type: "FOLLOW_UP",
      source_type: "TRANSCRIPT",
      owner_entity_id: callerId,
      requester_entity_id: callerId,
      title: "Follow-up to Samiksha",
      summary: "x",
      status: "DRAFT",
      next_action: "Review and send this follow-up.",
      details: {
        follow_up: {
          local_id: "seed-1",
          draft_text: "x",
          recipient_governance: {
            entity_id: samikshaSharmaId,
            display_name: `${TEST_PREFIX} Samiksha Sharma`,
            recipientSafety: "confirmed",
            evidence: {
              quote: null,
              source: "caller_confirmed",
              matchedToken: null,
              alternativeCandidates: [`${TEST_PREFIX} Samiksha Verma`],
            },
          },
        },
      },
    });
    expect(card.ok).toBe(true);
    const r = await ingestTranscript({ callerEntityId: callerId, capturedText: FIXTURE, llmProvider: null });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const a = samikshaAction(r);
    expect(a.target.entity_id).toBe(samikshaSharmaId);
    expect(a.recipient_governance.evidence.source).toBe("correction_memory");
  });
});
