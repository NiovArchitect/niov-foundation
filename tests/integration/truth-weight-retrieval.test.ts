// FILE: truth-weight-retrieval.test.ts (integration, real Postgres)
// PURPOSE: [BLOCK-3C] lock truth-weight retrieval over the 3A/3B
//          substrate:
//          - RANKING: a within-authority decision beats a NEWER proposal;
//            a memory reference never beats a decision; a request never
//            becomes policy; an unresolved question is not current truth;
//            recommend-only informs but cannot finalize; an
//            exceeds-authority commitment is flagged and cannot finalize;
//            a policy constraint outranks an authorized decision;
//            superseded rows lose to everything.
//          - SUPERSESSION: explicit language + same domain + unique older
//            match links supersedes/superseded_by and marks the old row
//            superseded; ambiguity links NOTHING (unresolved beats
//            guessed).
//          - SURFACE: the clarity WHAT_BACKGROUND answer LEADS with the
//            calm correction ("older plan … superseded") — brief, with
//            the current source, never a dump.
//          - PERMISSIONS + TWIN BOUNDARY: inaccessible rows are excluded
//            BEFORE ranking (party-or-manager gate, tenant-safe); an
//            AI_AGENT caller retrieves nothing beyond its human; a twin
//            can never inherit another person's authority or turn a
//            recommend-only posture into finality.
// CONNECTS TO: truth-weight.service.ts, supersession-linking.service.ts,
//          clarity-answer.service.ts, communication-lineage.service.ts,
//          decision-rights-store.service.ts.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@niov/database";
import { ingestTranscript } from "@niov/api";
import {
  computeTruthWeight,
  compareTruthWeight,
  lineageFromDetails,
  composeSupersededCorrection,
} from "../../apps/api/src/services/otzar/truth-weight.service.js";
import {
  buildCommunicationLineage,
  type CommunicationLineage,
} from "../../apps/api/src/services/otzar/communication-lineage.service.js";
import { linkSupersessionDeterministically } from "../../apps/api/src/services/otzar/supersession-linking.service.js";
import { loadStructuredRightsForRoster, type PartyDomainRights } from "../../apps/api/src/services/otzar/decision-rights-store.service.js";
import { answerClarityQuestion } from "../../apps/api/src/services/work-os/clarity-answer.service.js";
import { answerNamedSubjectBackground } from "../../apps/api/src/services/work-os/background-answer.service.js";
import { createLedgerEntry } from "../../apps/api/src/services/work-os/work-ledger.service.js";
import { createEntity } from "../../packages/database/src/queries/entity.js";
import { ensureAuditTriggers, cleanupTestData } from "../helpers.js";

const TEST_PREFIX = "__niov_test__truth_weight__";

function fakePublicKey(seed: string): string {
  return `-----BEGIN PUBLIC KEY-----\n${seed}\n-----END PUBLIC KEY-----`;
}
async function makeEntity(displayName: string, entityType: "PERSON" | "COMPANY" | "AI_AGENT"): Promise<string> {
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
async function cleanupArtifacts(): Promise<void> {
  const ents = await prisma.entity.findMany({
    where: { display_name: { startsWith: TEST_PREFIX } },
    select: { entity_id: true },
  });
  const ids = ents.map((e) => e.entity_id);
  if (ids.length === 0) return;
  await prisma.entityDecisionRights.deleteMany({ where: { org_entity_id: { in: ids } } });
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

const RIGHTS: PartyDomainRights[] = [
  { entity_id: "e-elena", party: "Elena Torres", owns: ["technical", "execution"], can_approve: [], recommend_only: [] },
  { entity_id: "e-maya", party: "Maya Chen", owns: ["strategic"], can_approve: [], recommend_only: ["technical"] },
];

function mkLineage(
  quote: string,
  speaker: string,
  domain: CommunicationLineage["decision_domain"],
  sourceDate: string,
): CommunicationLineage {
  return buildCommunicationLineage({
    quote,
    speaker,
    speakerEntityId: null,
    speakerRoleAtTime: null,
    fallbackAct: "commitment",
    decisionDomain: domain,
    structuredRights: RIGHTS,
    artifact: {
      communicationType: "transcript_ingest",
      sourceArtifactId: `cap-${sourceDate}`,
      sourceTitle: "Sync",
      sourceDate,
      participants: [speaker],
    },
    confidence: "high",
  });
}

describe("[BLOCK-3C] truth-weight retrieval + supersession + boundaries", () => {
  beforeEach(async () => {
    await ensureAuditTriggers();
    await cleanupArtifacts();
    await cleanupTestData();
  });
  afterAll(async () => {
    await cleanupArtifacts();
    await cleanupTestData();
    await prisma.$disconnect();
  });

  it("RANKING: the ten conservative rules hold — never newest-wins, never executive-wins", () => {
    // A within-authority decision (OLDER) beats a NEWER proposal.
    const decision = mkLineage("We agreed to ship the auth migration Friday.", "Elena Torres", "technical", "2026-07-01T00:00:00Z");
    const newerProposal = mkLineage("Maybe we should delay the migration.", "Maya Chen", "technical", "2026-07-05T00:00:00Z");
    const dW = computeTruthWeight(decision);
    const pW = computeTruthWeight(newerProposal);
    expect(dW.weight_class).toBe("authorized_decision");
    expect(
      compareTruthWeight(
        { weight: dW, source_date: decision.source_date },
        { weight: pW, source_date: newerProposal.source_date },
      ),
    ).toBeLessThan(0); // decision first despite being older

    // A memory reference never beats a decision, and is never current truth.
    const memory = mkLineage("I think the old date was July 24.", "Elena Torres", "technical", "2026-07-06T00:00:00Z");
    const mW = computeTruthWeight(memory);
    expect(mW.weight_class).toBe("reference_only");
    expect(mW.is_current_truth).toBe(false);
    expect(mW.rank).toBeGreaterThan(dW.rank);

    // A request/proposal does not become policy; an actual policy
    // constraint outranks even an authorized decision.
    const request = mkLineage("Can we do daily syncs?", "Maya Chen", "execution", "2026-07-06T00:00:00Z");
    expect(computeTruthWeight(request).weight_class).toBe("recommendation");
    const policy = mkLineage("Contract changes must go through legal review.", "Elena Torres", "legal", "2026-06-01T00:00:00Z");
    const polW = computeTruthWeight(policy);
    expect(polW.weight_class).toBe("policy_constraint");
    expect(polW.rank).toBeLessThan(dW.rank);

    // An unresolved question is not current truth.
    const question = mkLineage("What happens to the legacy tenants?", "Elena Torres", "technical", "2026-07-06T00:00:00Z");
    expect(computeTruthWeight(question).is_current_truth).toBe(false);

    // Recommend-only informs but cannot finalize.
    const rec = mkLineage("Maybe we should refactor the auth module.", "Maya Chen", "technical", "2026-07-06T00:00:00Z");
    const recW = computeTruthWeight(rec);
    expect(recW.weight_class).toBe("recommendation");
    expect(recW.can_finalize).toBe(false);

    // An exceeds-authority commitment is FLAGGED and cannot finalize.
    const overreach = mkLineage("We will deliver full automation by launch.", "Maya Chen", "technical", "2026-07-06T00:00:00Z");
    const oW = computeTruthWeight(overreach);
    expect(oW.weight_class).toBe("exceeds_authority");
    expect(oW.can_finalize).toBe(false);
    expect(oW.flags.some((f) => f.includes("beyond the speaker's decision rights"))).toBe(true);

    // Superseded loses to everything — even a recommendation outranks it.
    const superseded: CommunicationLineage = { ...decision, superseded_by: "row-2", currentness: "superseded" };
    const sW = computeTruthWeight(superseded);
    expect(sW.weight_class).toBe("superseded");
    expect(sW.rank).toBeGreaterThan(recW.rank);
    expect(sW.is_current_truth).toBe(false);
  });

  it("SUPERSESSION e2e: explicit language + unique match links both pointers; the clarity answer leads with the calm correction", async () => {
    const orgId = await makeEntity("Truth Org", "COMPANY");
    const callerId = await makeEntity("Sadeil", "PERSON");
    const elenaId = await makeEntity("Elena Torres", "PERSON");
    for (const id of [callerId, elenaId]) {
      await prisma.entityMembership.create({ data: { parent_id: orgId, child_id: id, is_active: true } });
    }

    // Capture 1 — the original July plan.
    const first = await ingestTranscript({
      callerEntityId: callerId,
      capturedText: `${TEST_PREFIX} Elena Torres owns the Northstar pilot kickoff planning work and will confirm the July 24 date this week.`,
      title: "Northstar planning sync",
      llmProvider: null,
    });
    expect(first.ok).toBe(true);
    const oldRow = await prisma.workLedgerEntry.findFirst({
      where: { org_entity_id: orgId, ledger_type: "COMMITMENT" },
    });
    expect(oldRow).not.toBeNull();

    // Capture 2 — the explicit replacement.
    const second = await ingestTranscript({
      callerEntityId: callerId,
      capturedText: `${TEST_PREFIX} Elena Torres owns the Northstar pilot kickoff replan work and will move the kickoff to August 7 — this replaces the old July 24 plan.`,
      title: "Northstar replan sync",
      llmProvider: null,
    });
    expect(second.ok).toBe(true);

    const rows = await prisma.workLedgerEntry.findMany({
      where: { org_entity_id: orgId, ledger_type: "COMMITMENT" },
      orderBy: { created_at: "asc" },
    });
    expect(rows.length).toBe(2);
    const oldLineage = lineageFromDetails(rows[0]!.details);
    const newLineage = lineageFromDetails(rows[1]!.details);
    expect(newLineage?.communication_act).toBe("superseding_decision");
    expect(newLineage?.supersedes).toBe(rows[0]!.ledger_entry_id);
    expect(oldLineage?.superseded_by).toBe(rows[1]!.ledger_entry_id);
    expect(oldLineage?.currentness).toBe("superseded");
    // The superseded row now loses to everything.
    expect(computeTruthWeight(oldLineage!).weight_class).toBe("superseded");

    // The clarity surface: asking about the OLD row leads with the calm
    // correction + the current source — brief, no dump, no "you are wrong".
    const answer = await answerClarityQuestion({
      org_entity_id: orgId,
      caller_entity_id: callerId,
      is_manager: true,
      ledger_entry_id: rows[0]!.ledger_entry_id,
      question: "Any background on this?",
    });
    expect(answer.ok).toBe(true);
    if (!answer.ok) return;
    expect(answer.answer.answer).toContain("You may be looking at an older plan");
    expect(answer.answer.answer).toContain("superseded");
    expect(answer.answer.answer).toContain(rows[1]!.title);
    expect(answer.answer.answer.toLowerCase()).not.toContain("you are wrong");
    // No raw ranking mechanics leak (strip the test prefix first — it
    // deliberately contains "truth_weight" and rides display names).
    const cleaned = answer.answer.answer.replaceAll(TEST_PREFIX, "");
    expect(cleaned).not.toMatch(/\brank\b|weight_class|truth[_ ]weight/i);
    // Sanity on the correction composer itself.
    expect(composeSupersededCorrection({ staleTitle: "A", currentTitle: "B" })).toContain("was superseded");
  });

  it("SUPERSESSION: ambiguity links NOTHING (two plausible older rows → both untouched)", async () => {
    const orgId = await makeEntity("Ambiguous Org", "COMPANY");
    const callerId = await makeEntity("Priya", "PERSON");
    await prisma.entityMembership.create({ data: { parent_id: orgId, child_id: callerId, is_active: true } });

    // Two older captures that BOTH match "Northstar pilot kickoff".
    for (const [title, text] of [
      ["Northstar kickoff A", `${TEST_PREFIX} Priya owns the Northstar pilot kickoff scheduling work and will confirm dates.`],
      ["Northstar kickoff B", `${TEST_PREFIX} Priya owns the Northstar pilot kickoff logistics work and will book the room.`],
    ] as const) {
      const r = await ingestTranscript({ callerEntityId: callerId, capturedText: text, title, llmProvider: null });
      expect(r.ok).toBe(true);
    }
    const before = await prisma.workLedgerEntry.findMany({
      where: { org_entity_id: orgId, ledger_type: "COMMITMENT" },
    });
    expect(before.length).toBe(2);

    // A new superseding statement matching BOTH → ambiguous → no link.
    const newLineage = mkLineage(
      "This replaces the old Northstar pilot kickoff plan entirely.",
      "Priya",
      "execution",
      "2026-07-06T00:00:00Z",
    );
    const result = await linkSupersessionDeterministically({
      orgEntityId: orgId,
      newLedgerEntryId: before[0]!.ledger_entry_id, // any id ≠ targets is fine for the probe
      newTitle: "Northstar pilot kickoff replacement",
      quote: "This replaces the old Northstar pilot kickoff plan entirely.",
      lineage: newLineage,
    });
    expect(result.linked).toBe(false);
    expect(result.reason).toBe("ambiguous_candidates");
    for (const row of await prisma.workLedgerEntry.findMany({
      where: { org_entity_id: orgId, ledger_type: "COMMITMENT" },
    })) {
      const l = lineageFromDetails(row.details);
      expect(l?.superseded_by ?? null).toBeNull();
      expect(l?.currentness).not.toBe("superseded");
    }
  });

  it("SUPERSESSION: CANCELLED/EXPIRED rows are settled history — cancelling the extra contenders turns ambiguous into a unique live match", async () => {
    const orgId = await makeEntity("Settled Org", "COMPANY");
    const callerId = await makeEntity("Priya", "PERSON");
    await prisma.entityMembership.create({ data: { parent_id: orgId, child_id: callerId, is_active: true } });

    // Two captures matching the same tokens → 2 COMMITMENT + 2 MEETING
    // rows, all stamped in the same domain (the ambiguity-test setup).
    for (const [title, text] of [
      ["Northstar kickoff A", `${TEST_PREFIX} Priya owns the Northstar pilot kickoff scheduling work and will confirm dates.`],
      ["Northstar kickoff B", `${TEST_PREFIX} Priya owns the Northstar pilot kickoff logistics work and will book the room.`],
    ] as const) {
      const r = await ingestTranscript({ callerEntityId: callerId, capturedText: text, title, llmProvider: null });
      expect(r.ok).toBe(true);
    }
    const commitments = await prisma.workLedgerEntry.findMany({
      where: { org_entity_id: orgId, ledger_type: "COMMITMENT" },
      orderBy: { created_at: "asc" },
    });
    expect(commitments.length).toBe(2);
    const meetings = await prisma.workLedgerEntry.findMany({
      where: { org_entity_id: orgId, ledger_type: "MEETING" },
    });

    // Cancel/expire every contender EXCEPT commitment B — withdrawn work
    // is settled history and must drop out of candidacy (the smoke-org
    // live probe's cleanup rail relies on exactly this).
    for (const m of meetings) {
      await prisma.workLedgerEntry.update({
        where: { ledger_entry_id: m.ledger_entry_id },
        data: { status: "CANCELLED" },
      });
    }
    await prisma.workLedgerEntry.update({
      where: { ledger_entry_id: commitments[0]!.ledger_entry_id },
      data: { status: "EXPIRED" },
    });

    const newLineage = mkLineage(
      "This replaces the old Northstar pilot kickoff plan entirely.",
      "Priya",
      "execution",
      "2026-07-06T00:00:00Z",
    );
    const result = await linkSupersessionDeterministically({
      orgEntityId: orgId,
      newLedgerEntryId: commitments[0]!.ledger_entry_id, // ≠ the live target
      newTitle: "Northstar pilot kickoff replacement",
      quote: "This replaces the old Northstar pilot kickoff plan entirely.",
      lineage: newLineage,
    });
    expect(result.linked).toBe(true);
    expect(result.superseded_ledger_entry_id).toBe(commitments[1]!.ledger_entry_id);
    const target = await prisma.workLedgerEntry.findUnique({
      where: { ledger_entry_id: commitments[1]!.ledger_entry_id },
    });
    expect(lineageFromDetails(target!.details)?.currentness).toBe("superseded");
    // The settled rows stayed untouched.
    for (const m of meetings) {
      const row = await prisma.workLedgerEntry.findUnique({ where: { ledger_entry_id: m.ledger_entry_id } });
      expect(row!.status).toBe("CANCELLED");
      const l = lineageFromDetails(row!.details);
      expect(l?.superseded_by ?? null).toBeNull();
    }
  });

  it("PERMISSIONS + TWIN BOUNDARY: inaccessible rows are excluded before ranking; a twin retrieves nothing beyond its human and inherits no authority", async () => {
    const orgId = await makeEntity("Boundary Org", "COMPANY");
    const managerId = await makeEntity("Manager", "PERSON");
    const elenaId = await makeEntity("Elena Torres", "PERSON");
    const outsiderOrgId = await makeEntity("Other Org", "COMPANY");
    const outsiderId = await makeEntity("Outsider", "PERSON");
    const twinId = await makeEntity("Elena Twin", "AI_AGENT");
    await prisma.entityMembership.create({ data: { parent_id: orgId, child_id: managerId, is_active: true, is_admin: true } });
    await prisma.entityMembership.create({ data: { parent_id: orgId, child_id: elenaId, is_active: true } });
    await prisma.entityMembership.create({ data: { parent_id: orgId, child_id: twinId, is_active: true } });
    await prisma.entityMembership.create({ data: { parent_id: outsiderOrgId, child_id: outsiderId, is_active: true } });

    const r = await ingestTranscript({
      callerEntityId: elenaId,
      capturedText: `${TEST_PREFIX} Elena Torres owns the payroll data cleanup work and will finish it this week.`,
      title: "Private payroll sync",
      llmProvider: null,
    });
    expect(r.ok).toBe(true);
    const row = await prisma.workLedgerEntry.findFirst({
      where: { org_entity_id: orgId, ledger_type: "COMMITMENT" },
    });
    expect(row).not.toBeNull();

    // Cross-org caller: NOT_FOUND (tenant-safe, enumeration-safe).
    const crossOrg = await answerClarityQuestion({
      org_entity_id: outsiderOrgId,
      caller_entity_id: outsiderId,
      is_manager: true,
      ledger_entry_id: row!.ledger_entry_id,
      question: "Any background on this?",
    });
    expect(crossOrg.ok).toBe(false);

    // The TWIN as caller: not a party to its human's row and never a
    // manager — the same gate excludes it BEFORE any ranking happens. A
    // twin reaches work only through its human's authenticated session.
    const twinProbe = await answerClarityQuestion({
      org_entity_id: orgId,
      caller_entity_id: twinId,
      is_manager: false,
      ledger_entry_id: row!.ledger_entry_id,
      question: "Any background on this?",
    });
    expect(twinProbe.ok).toBe(false);
    if (twinProbe.ok === false) expect(twinProbe.code).toBe("NOT_FOUND");

    // A twin can never inherit authority: rights load through the HUMAN
    // roster only — the twin's entity id yields nothing even with a
    // force-created rights row (defense-in-depth, mirrors 3A locks).
    await prisma.entityDecisionRights.create({
      data: { org_entity_id: orgId, entity_id: twinId, owns: ["technical"], can_approve: [], recommend_only: [], updated_by: managerId },
    });
    const loaded = await loadStructuredRightsForRoster(orgId, [
      { entity_id: elenaId, display_name: "Elena Torres" },
    ]);
    expect(loaded.every((x) => x.entity_id !== twinId)).toBe(true);

    // And no caller — twin or human — can turn a recommend-only posture
    // into finality: the pure invariant holds regardless of who asks.
    const recLineage = mkLineage("Maybe we should rebuild the pipeline.", "Maya Chen", "technical", "2026-07-06T00:00:00Z");
    expect(computeTruthWeight(recLineage).can_finalize).toBe(false);
  });

  it("AIX-6 NAMED-SUBJECT + AIX-5 AMBIENT: superseded rows never present as live truth; flags ride quietly; every ambient phrasing corrects calmly", async () => {
    const orgId = await makeEntity("Surface Org", "COMPANY");
    const callerId = await makeEntity("Elena Torres", "PERSON");
    await prisma.entityMembership.create({ data: { parent_id: orgId, child_id: callerId, is_active: true } });

    const noMechanics = (text: string): void => {
      expect(text).not.toMatch(
        /\b(recommend_only|exceeds_authority|within_authority|superseding_decision|weight_class)\b/,
      );
      expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    };

    const mk = async (title: string, lineage: CommunicationLineage): Promise<string> => {
      const created = await createLedgerEntry({
        org_entity_id: orgId,
        ledger_type: "COMMITMENT",
        source_type: "VOICE_COMMAND",
        owner_entity_id: callerId,
        requester_entity_id: callerId,
        title,
        status: "VERIFIED",
        extraction_source: "TYPESCRIPT_DETERMINISTIC",
        details: { communication_lineage: lineage },
      });
      expect(created.ok).toBe(true);
      return created.ok ? created.entry.ledger_entry_id : "";
    };

    // The old plan (will be superseded), the current decision, and an
    // out-of-authority promise — all matching "Northstar pilot".
    const oldId = await mk(
      "Northstar pilot kickoff planning",
      mkLineage("We agreed to target July 24 for the Northstar pilot kickoff.", "Elena Torres", "technical", "2026-06-20T00:00:00Z"),
    );
    const newId = await mk(
      "Northstar pilot kickoff replan",
      { ...mkLineage("We agreed to move the Northstar pilot kickoff to August 7.", "Elena Torres", "technical", "2026-07-01T00:00:00Z"), supersedes: oldId },
    );
    await mk(
      "Northstar pilot automation promise",
      mkLineage("We will deliver full automation for the Northstar pilot by launch.", "Maya Chen", "technical", "2026-07-05T00:00:00Z"),
    );
    // Mark the old plan superseded (what the 3C linker does at ingest).
    const oldRow = await prisma.workLedgerEntry.findUnique({ where: { ledger_entry_id: oldId }, select: { details: true } });
    await prisma.workLedgerEntry.update({
      where: { ledger_entry_id: oldId },
      data: {
        details: {
          ...(oldRow!.details as Record<string, unknown>),
          communication_lineage: {
            ...((oldRow!.details as { communication_lineage: Record<string, unknown> }).communication_lineage),
            superseded_by: newId,
            currentness: "superseded",
          },
        },
      },
    });

    // AIX-6 named subject, as the row owner (employee scope).
    const result = await answerNamedSubjectBackground({
      org_entity_id: orgId,
      caller_entity_id: callerId,
      is_manager: false,
      question: "What do we know about the Northstar pilot?",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const text = result.answer.answer;
    // The calm correction LEADS and names the current source.
    expect(text).toContain("was superseded");
    expect(text).toContain('The current decision is "Northstar pilot kickoff replan"');
    // The superseded title never appears in the live-truth list.
    const liveSection = text.slice(text.indexOf("Live work is the source of truth"));
    expect(liveSection).toContain("Northstar pilot kickoff replan");
    expect(liveSection).not.toContain("Northstar pilot kickoff planning");
    // The over-authority promise is listed WITH its quiet flag, and the
    // authorized decision outranks it in presentation order.
    expect(liveSection).toContain("Northstar pilot automation promise");
    expect(liveSection).toContain("beyond the speaker's decision rights");
    expect(liveSection.indexOf("kickoff replan")).toBeLessThan(liveSection.indexOf("automation promise"));
    noMechanics(text);

    // AIX-5 AMBIENT LOCK: every ambient recognizer phrasing rides the
    // clarity rail, so each one corrects calmly on the superseded row.
    for (const phrasing of [
      "What do we know about this?",
      "Any background on this?",
      "Is there historical context for this?",
    ]) {
      const ambient = await answerClarityQuestion({
        org_entity_id: orgId,
        caller_entity_id: callerId,
        is_manager: false,
        ledger_entry_id: oldId,
        question: phrasing,
      });
      expect(ambient.ok).toBe(true);
      if (!ambient.ok) continue;
      expect(ambient.answer.answer).toContain("You may be looking at an older plan");
      expect(ambient.answer.answer).toContain("Northstar pilot kickoff replan");
      noMechanics(ambient.answer.answer);
    }
  });
});
