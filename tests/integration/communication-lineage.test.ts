// FILE: communication-lineage.test.ts (integration, real Postgres)
// PURPOSE: [BLOCK-3B] lock the speech-act + authority lineage substrate:
//          - the runtime act vocabulary is EXACTLY the Redwood Atlas
//            corpus 16-act vocabulary (no invented acts, none missing);
//          - the seven doctrine examples classify and authority-resolve
//            correctly (approval within authority; a memory reference
//            never becomes a decision; a request never becomes policy;
//            an agreed change is a decision; an out-of-authority sales
//            promise is marked exceeds_authority, not approved truth; an
//            engineering objection stays an objection; a CEO "let's do
//            it" on a finance item still respects finance approval);
//          - ingest stamps details.communication_lineage on derived work
//            rows, FOLLOW_UP rows, and the MEETING row — with structured
//            rights reflected when they exist and an honest "unknown"
//            fallback (never broken extraction) when they don't;
//          - stamping mutates NOTHING else (TAR untouched) and changes
//            no customer-facing ingest response shape.
// CONNECTS TO: communication-lineage.service.ts, comms-ingest.service.ts,
//          decision-rights-store.service.ts,
//          tests/fixtures/redwood-atlas/corpus.json.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "@niov/database";
import { ingestTranscript } from "@niov/api";
import {
  buildCommunicationLineage,
  classifyCommunicationAct,
  COMMUNICATION_ACTS,
  type CommunicationAct,
} from "../../apps/api/src/services/otzar/communication-lineage.service.js";
import type { PartyDomainRights } from "../../apps/api/src/services/otzar/decision-rights-store.service.js";
import { createEntity } from "../../packages/database/src/queries/entity.js";
import { ensureAuditTriggers, cleanupTestData } from "../helpers.js";

const TEST_PREFIX = "__niov_test__comm_lineage__";

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

// Redwood-style structured rights for the doctrine examples.
const RIGHTS: PartyDomainRights[] = [
  { entity_id: "e-maya", party: "Maya Chen", owns: ["strategic"], can_approve: [], recommend_only: ["technical"] },
  { entity_id: "e-elena", party: "Elena Torres", owns: ["technical", "architecture"], can_approve: ["execution"], recommend_only: [] },
  { entity_id: "e-aisha", party: "Aisha Khan", owns: [], can_approve: ["finance"], recommend_only: [] },
  { entity_id: "e-marcus", party: "Marcus Reed", owns: ["customer"], can_approve: [], recommend_only: ["technical"] },
];

function lineage(
  quote: string,
  speaker: string,
  domain: PartyDomainRights["owns"][number],
  participants: string[],
  fallback: CommunicationAct = "commitment",
) {
  return buildCommunicationLineage({
    quote,
    speaker,
    speakerEntityId: null,
    speakerRoleAtTime: null,
    fallbackAct: fallback,
    decisionDomain: domain,
    structuredRights: RIGHTS,
    artifact: {
      communicationType: "transcript_ingest",
      sourceArtifactId: "cap-1",
      sourceTitle: "Weekly sync",
      sourceDate: "2026-07-06T17:00:00.000Z",
      participants,
    },
    confidence: "high",
  });
}

describe("[BLOCK-3B] communication lineage — vocabulary, doctrine examples, ingest stamping", () => {
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

  it("VOCABULARY: the runtime 16-act vocabulary is EXACTLY the Redwood Atlas corpus vocabulary", () => {
    const corpus = JSON.parse(
      readFileSync(path.join(process.cwd(), "tests/fixtures/redwood-atlas/corpus.json"), "utf8"),
    ) as { artifacts: Array<{ statements?: Array<{ act: string }> }> };
    const corpusActs = new Set<string>();
    for (const a of corpus.artifacts) for (const s of a.statements ?? []) corpusActs.add(s.act);
    expect([...corpusActs].sort()).toEqual([...COMMUNICATION_ACTS].sort());
    expect(COMMUNICATION_ACTS).toHaveLength(16);
  });

  it("DOCTRINE 1–4: approval within authority is current; a memory reference never becomes a decision; a request never becomes policy; an agreed change is a decision", () => {
    // 1. Owner approves a date move — within authority, current; supersession
    //    left null (unresolved beats wrong — deterministic linking is 3C).
    const approval = lineage(
      "Approved. Move the Northstar pilot kickoff to August 7.",
      "Elena Torres",
      "technical",
      ["Elena Torres", "Maya Chen"],
    );
    expect(approval.communication_act).toBe("approval");
    expect(approval.authority_basis).toBe("owns:technical");
    expect(approval.authority_status).toBe("within_authority");
    expect(approval.currentness).toBe("current");
    expect(approval.supersedes).toBeNull();
    expect(approval.agreement_participants).toEqual(["Elena Torres", "Maya Chen"]);

    // 2. Memory reference: carries no authority, is not current truth, and
    //    can never supersede anything.
    const memory = lineage("I think the old date was July 24.", "Marcus Reed", "technical", ["Marcus Reed"]);
    expect(memory.communication_act).toBe("memory_reference");
    expect(memory.authority_status).toBe("unknown");
    expect(memory.currentness).toBe("unknown");
    expect(memory.agreement_participants).toEqual([]);
    expect(memory.supersedes).toBeNull();

    // 3. A request is a request — not policy, not a decision.
    const request = lineage("Can we do daily syncs?", "Maya Chen", "execution", ["Maya Chen"]);
    expect(request.communication_act).toBe("request");
    expect(request.communication_act).not.toBe("policy_constraint");
    expect(request.currentness).toBe("current");

    // 4. An agreed change IS a decision act (decision or superseding_decision).
    const agreed = lineage(
      "We agreed on twice-weekly syncs after the client pushed back.",
      "Elena Torres",
      "execution",
      ["Elena Torres", "Jordan Ellis"],
    );
    expect(["decision", "superseding_decision"]).toContain(agreed.communication_act);
    expect(agreed.authority_status).toBe("within_authority"); // Elena can_approve execution
  });

  it("DOCTRINE 5–7: out-of-authority commitment is MARKED; an engineering objection stays an objection; the CEO does not bypass finance approval; recommend-only never finalizes", () => {
    // 5. Sales-style promise in a domain owned by engineering: marked
    //    exceeds_authority — confidence does not make it approved truth.
    const promise = lineage(
      "We will deliver full automation by launch.",
      "Marcus Reed",
      "technical",
      ["Marcus Reed", "Elena Torres"],
    );
    expect(promise.communication_act).toBe("commitment");
    expect(promise.authority_basis).toBe("recommend_only:technical");
    expect(promise.authority_status).toBe("exceeds_authority");

    // 6. Engineering constraint is an objection — a real signal, not a
    //    decision, and within nothing/exceeding nothing (non-final act by
    //    the domain owner = within authority).
    const objection = lineage(
      "The auth dependency is unresolved — this is blocked until it lands.",
      "Elena Torres",
      "technical",
      ["Elena Torres"],
    );
    expect(objection.communication_act).toBe("objection");
    expect(objection.authority_status).toBe("within_authority");

    // 7. CEO "let's do it" on a finance item: the act is a decision, but
    //    authority still respects the finance approval holder.
    const ceoFinance = lineage("Let's do it.", "Maya Chen", "finance", ["Maya Chen", "Aisha Khan"]);
    expect(ceoFinance.communication_act).toBe("decision");
    expect(ceoFinance.authority_status).toBe("exceeds_authority");
    expect(ceoFinance.decision_makers_present).toEqual(["Aisha Khan"]);
    expect(ceoFinance.required_approvers_present).toBe(true);

    // Recommend-only speaker making a proposal: marked recommend_only, and
    // an unresolved question is never promoted to a decision.
    const rec = lineage("Maybe we should refactor the auth module.", "Maya Chen", "technical", ["Maya Chen"]);
    expect(rec.communication_act).toBe("proposal");
    expect(rec.authority_status).toBe("recommend_only");
    const question = classifyCommunicationAct("What happens to the legacy tenants?", "commitment");
    expect(question).toBe("unresolved_question");
    const qLineage = lineage("What happens to the legacy tenants?", "Elena Torres", "technical", ["Elena Torres"]);
    expect(qLineage.currentness).toBe("unresolved");
    expect(qLineage.authority_status).toBe("unknown");
  });

  it("INGEST: derived work rows + the MEETING row carry details.communication_lineage; structured rights resolve authority; TAR untouched", async () => {
    const orgId = await makeEntity("Lineage Org", "COMPANY");
    const callerId = await makeEntity("Sadeil", "PERSON");
    const elenaId = await makeEntity("Elena Torres", "PERSON");
    for (const id of [callerId, elenaId]) {
      await prisma.entityMembership.create({ data: { parent_id: orgId, child_id: id, is_active: true } });
    }
    // Elena owns technical (Block 3A structured rights).
    await prisma.entityDecisionRights.create({
      data: {
        org_entity_id: orgId,
        entity_id: elenaId,
        owns: ["technical", "execution"],
        can_approve: [],
        recommend_only: [],
        updated_by: callerId,
      },
    });
    const tarBefore = await prisma.tokenAttributeRepository.findUnique({ where: { entity_id: elenaId } });

    const result = await ingestTranscript({
      callerEntityId: callerId,
      capturedText: [
        "Sadeil: Let's confirm owners for the auth integration work.",
        `${TEST_PREFIX} Elena Torres owns the auth integration endpoint work and will grant repo access today.`,
      ].join("\n"),
      title: "Auth integration sync",
      llmProvider: null,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Every STATEMENT-derived row (owned work / follow-ups) carries the
    // lineage stamp. ORG_SEEDING rows are Otzar's own suggestions — not
    // human speech acts — and are deliberately unstamped.
    const rows = await prisma.workLedgerEntry.findMany({
      where: { org_entity_id: orgId, ledger_type: { in: ["COMMITMENT", "FOLLOW_UP"] } },
    });
    expect(rows.length).toBeGreaterThan(0);
    const stamped = rows
      .map((r) => (r.details as { communication_lineage?: Record<string, unknown> }).communication_lineage)
      .filter((l): l is Record<string, unknown> => l !== undefined);
    expect(stamped.length).toBe(rows.length); // EVERY derived row is stamped
    const l = stamped[0]!;
    expect(COMMUNICATION_ACTS).toContain(l.communication_act as CommunicationAct);
    expect(l.communication_type).toBe("transcript_ingest");
    expect(typeof l.source_artifact_id).toBe("string");
    expect(l.source_title).toBe("Auth integration sync");
    expect(l.decision_domain).toBe("technical"); // auth/integration/endpoint text
    expect(l.permission_scope).toBe("follows_row_visibility");
    expect(l.supersedes).toBeNull(); // never guessed
    // Elena owns technical → her assignment stamp resolves authority.
    const elenaRow = stamped.find((s) => String(s.speaker ?? "").includes("Elena"));
    if (elenaRow !== undefined) {
      expect(elenaRow.authority_basis).toBe("owns:technical");
      expect(elenaRow.authority_status).toBe("within_authority");
    }

    // The MEETING row carries artifact-level lineage (participants, source).
    const meeting = await prisma.workLedgerEntry.findFirst({
      where: { org_entity_id: orgId, ledger_type: "MEETING" },
    });
    expect(meeting).not.toBeNull();
    const ml = (meeting!.details as { communication_lineage?: Record<string, unknown> }).communication_lineage;
    expect(ml).toBeDefined();
    expect(Array.isArray(ml!.participants)).toBe(true);
    expect(ml!.communication_act).toBeUndefined(); // artifact-level: no single act

    // Boundary: stamping wrote NO authority anywhere — TAR byte-identical.
    const tarAfter = await prisma.tokenAttributeRepository.findUnique({ where: { entity_id: elenaId } });
    expect(tarAfter).toEqual(tarBefore);
  });

  it("INGEST fallback: with NO rights rows, ingestion is unbroken and authority is honestly unknown; FOLLOW_UP rows are stamped as the caller's action items (demo path)", async () => {
    const orgId = await makeEntity("NoRights Org", "COMPANY");
    const callerId = await makeEntity("Priya", "PERSON");
    const davidId = await makeEntity("David", "PERSON");
    for (const id of [callerId, davidId]) {
      await prisma.entityMembership.create({ data: { parent_id: orgId, child_id: id, is_active: true } });
    }

    // Demo-scripted extraction (allowed under NODE_ENV=test) produces
    // suggested actions → durable FOLLOW_UP rows, each stamped.
    const result = await ingestTranscript({
      callerEntityId: callerId,
      capturedText:
        "Launch follow-up meeting with David, Samiksha and Annie. David owns the repo access work and will grant write access today.",
      title: "Launch follow-up",
      forceMode: "DEMO_SCRIPTED",
      llmProvider: null,
    });
    expect(result.ok).toBe(true);

    const rows = await prisma.workLedgerEntry.findMany({ where: { org_entity_id: orgId } });
    expect(rows.length).toBeGreaterThan(0);
    const followUps = rows.filter((r) => r.ledger_type === "FOLLOW_UP");
    expect(followUps.length).toBeGreaterThan(0);
    for (const f of followUps) {
      const fl = (f.details as { communication_lineage?: Record<string, unknown> }).communication_lineage;
      expect(fl).toBeDefined();
      expect(COMMUNICATION_ACTS).toContain(fl!.communication_act as CommunicationAct);
      expect(fl!.speaker_entity_id).toBe(callerId); // the drafter's action item
    }
    // No structured rights in this org → every stamped authority is the
    // honest fallback, never invented.
    for (const r of rows) {
      const rl = (r.details as { communication_lineage?: Record<string, unknown> }).communication_lineage;
      if (rl !== undefined && rl.authority_status !== undefined) {
        expect(rl.authority_status).toBe("unknown");
        expect(rl.authority_basis).toBeNull();
      }
    }
  });
});
