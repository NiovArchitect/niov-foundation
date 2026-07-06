// FILE: redwood-atlas-simulation.test.ts (integration, real Postgres + pure engines)
// PURPOSE: [REDWOOD-ATLAS] the domain-general-intelligence harness: prove
//          Otzar's existing rails behave correctly inside a realistic
//          8-week customer org (Redwood Atlas Studio) whose corpus carries
//          statement-level COMMUNICATION LINEAGE — who said what, at what
//          time, in what role, as what communication act, with which
//          decision-makers present. Four mechanisms, one binding matrix:
//          - corpus: deterministic fixture-integrity checks (acts, rights,
//            supersession lineage, honesty labels)
//          - rights: the production computeDecisionRights engine resolves
//            all 8 conflict patterns (truth = decision rights + act +
//            lineage + currentness — never newest-doc-wins, never
//            hierarchy-always-wins, policy outranks both)
//          - sched: the production scheduling engine (working hours,
//            per-person lunch, timezones, proposal-only connector truth)
//          - db: real seeding + governed retrieval (suppression of the
//            contradicted stale brief; confirmed decision log outranks
//            background; read-only; should_not_act)
//          Every check id in expected-behavior-matrix.json MUST be covered
//          by an executed assertion — the final test fails on any gap.
// CONNECTS TO: tests/fixtures/redwood-atlas/*, decision-rights.ts,
//          scheduling-policy.service.ts, document-context.service.ts,
//          context-relevance.service.ts, context-retrieval.service.ts,
//          CT docs/otzar/simulation/redwood-atlas/README.md (doctrine).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { computeTARHash, prisma } from "@niov/database";
import { computeDecisionRights } from "../../apps/api/src/services/otzar/decision-rights.js";
import {
  evaluateMeetingProposal,
} from "../../apps/api/src/services/work-os/scheduling-policy.service.js";
import { seedDocumentContextForCaller } from "../../apps/api/src/services/otzar/document-context.service.js";
import { validateSeededContextRelevance } from "../../apps/api/src/services/work-os/context-relevance.service.js";
import {
  CONTEXT_RANKING_LAW,
  retrieveSeededBackgroundForLedgerEntry,
} from "../../apps/api/src/services/work-os/context-retrieval.service.js";
import { createLedgerEntry } from "../../apps/api/src/services/work-os/work-ledger.service.js";
import { createEntity } from "../../packages/database/src/queries/entity.js";
import { cleanupTestData, ensureAuditTriggers, TEST_PREFIX } from "../helpers.js";

// ---------- fixtures ----------

interface Person {
  name: string;
  role: string;
  timezone: string;
  owns: string[];
  can_approve: string[];
  recommend_only: string[];
}
interface ClientFixture {
  name: string;
  key_contact: { name: string; title: string; timezone: string };
}
interface Statement {
  speaker: string;
  role: string;
  at: string;
  text: string;
  act: string;
}
interface RightsBearing {
  text: string;
  by: string;
  at: string;
  domain: string;
  authority_basis: string;
  exceeds_authority?: boolean;
}
interface Artifact {
  id: string;
  week: number;
  communication_type: string;
  date: string;
  title: string;
  classification: string;
  client: string | null;
  participants: Array<{ name: string; role: string; timezone: string }>;
  decision_makers_present: string[];
  decision_rights_basis: string;
  statements: Statement[];
  body?: string;
  decisions: RightsBearing[];
  approvals: RightsBearing[];
  assignments: RightsBearing[];
  commitments: RightsBearing[];
  supersedes: string | null;
  superseded_by: string | null;
  authority_level: string;
  confidence: string;
  currentness: string;
  source_lineage: string;
  conflict_patterns: number[];
}
interface Corpus {
  org_timezone: string;
  act_vocabulary: string[];
  artifacts: Artifact[];
}
interface MatrixCheck {
  id: string;
  mechanism: string;
  expect: string;
}

function loadFixture<T>(name: string): T {
  const p = fileURLToPath(new URL(`../fixtures/redwood-atlas/${name}`, import.meta.url));
  return JSON.parse(readFileSync(p, "utf8")) as T;
}

const corpus = loadFixture<Corpus>("corpus.json");
const people = loadFixture<{ people: Person[] }>("people.json").people;
const clients = loadFixture<{ clients: ClientFixture[] }>("clients.json").clients;
const matrix = loadFixture<{ checks: MatrixCheck[] }>("expected-behavior-matrix.json").checks;

const covered = new Set<string>();
function cover(...ids: string[]): void {
  for (const id of ids) covered.add(id);
}

const internalNames = new Set(people.map((p) => p.name));
const clientContactNames = new Set(clients.map((c) => c.key_contact.name));
function rightsOf(name: string): Set<string> {
  const p = people.find((x) => x.name === name);
  return new Set([...(p?.owns ?? []), ...(p?.can_approve ?? [])]);
}

// ---------- DB plumbing (mirrors context-retrieval.test.ts) ----------

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
async function grantOrgAdmin(entityId: string): Promise<void> {
  await prisma.tokenAttributeRepository.update({
    where: { entity_id: entityId },
    data: { can_admin_org: true },
  });
  const fresh = await prisma.tokenAttributeRepository.findUnique({ where: { entity_id: entityId } });
  await prisma.tokenAttributeRepository.update({
    where: { entity_id: entityId },
    data: {
      tar_hash: computeTARHash({
        can_login: fresh!.can_login,
        can_read_capsules: fresh!.can_read_capsules,
        can_write_capsules: fresh!.can_write_capsules,
        can_share_capsules: fresh!.can_share_capsules,
        can_create_hives: fresh!.can_create_hives,
        can_access_external_api: fresh!.can_access_external_api,
        can_admin_niov: fresh!.can_admin_niov,
        can_admin_org: fresh!.can_admin_org,
        clearance_ceiling: fresh!.clearance_ceiling,
        monetization_role: fresh!.monetization_role,
        compliance_frameworks: fresh!.compliance_frameworks,
        status: fresh!.status,
      }),
    },
  });
}
async function cleanup(): Promise<void> {
  const ents = await prisma.entity.findMany({
    where: { display_name: { startsWith: TEST_PREFIX } },
    select: { entity_id: true },
  });
  const ids = ents.map((e) => e.entity_id);
  if (ids.length === 0) return;
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

describe("[REDWOOD-ATLAS] communication-lineage simulation harness", () => {
  beforeAll(async () => {
    await ensureAuditTriggers();
  });
  afterAll(async () => {
    await cleanup();
    await cleanupTestData();
    await prisma.$disconnect();
  });

  // ================= corpus integrity =================

  it("C01/C02: 40-60 artifacts across all 8 weeks; 20+ statement-bearing conversations", () => {
    expect(corpus.artifacts.length).toBeGreaterThanOrEqual(40);
    expect(corpus.artifacts.length).toBeLessThanOrEqual(60);
    expect(new Set(corpus.artifacts.map((a) => a.week))).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8]));
    const conversations = corpus.artifacts.filter(
      (a) =>
        (a.communication_type === "meeting_transcript" || a.communication_type === "call_notes") &&
        a.statements.length > 0,
    );
    expect(conversations.length).toBeGreaterThanOrEqual(20);
    cover("C01", "C02");
  });

  it("C03-C07: every statement is who/what/when/act from the vocabulary, all 16 acts exercised, timestamps ordered, no anonymous speakers", () => {
    const vocab = new Set(corpus.act_vocabulary);
    expect(vocab.size).toBe(16);
    const actsSeen = new Set<string>();
    for (const a of corpus.artifacts) {
      let prev = 0;
      for (const s of a.statements) {
        expect(s.speaker.length).toBeGreaterThan(0);
        expect(s.role.length).toBeGreaterThan(0);
        expect(s.text.length).toBeGreaterThan(0);
        expect(vocab.has(s.act)).toBe(true);
        actsSeen.add(s.act);
        const t = Date.parse(s.at);
        expect(Number.isNaN(t)).toBe(false);
        expect(s.at.startsWith(a.date)).toBe(true);
        expect(t).toBeGreaterThanOrEqual(prev);
        prev = t;
        expect(internalNames.has(s.speaker) || clientContactNames.has(s.speaker)).toBe(true);
      }
    }
    expect(actsSeen).toEqual(vocab);
    cover("C03", "C04", "C05", "C06", "C07");
  });

  it("C08-C10: no decision without decision rights; client approvals stay client-attributed; out-of-authority commitments are flagged", () => {
    let exceedersSeen = 0;
    for (const a of corpus.artifacts) {
      for (const d of [...a.decisions, ...a.assignments]) {
        expect(internalNames.has(d.by)).toBe(true);
        expect(rightsOf(d.by).has(d.authority_basis)).toBe(true);
      }
      for (const ap of a.approvals) {
        if (internalNames.has(ap.by)) {
          expect(rightsOf(ap.by).has(ap.authority_basis)).toBe(true);
        } else {
          expect(clientContactNames.has(ap.by)).toBe(true);
          expect(ap.authority_basis).toBe("client counterparty approval");
        }
      }
      for (const c of a.commitments) {
        expect(typeof c.exceeds_authority).toBe("boolean");
        if (c.exceeds_authority === true) {
          exceedersSeen += 1;
          expect(c.by).toBe("Theo Williams");
          expect(a.currentness).toBe("contradicted");
          expect(rightsOf(c.by).has(c.authority_basis)).toBe(false);
        }
      }
    }
    expect(exceedersSeen).toBeGreaterThanOrEqual(1);
    cover("C08", "C09", "C10");
  });

  it("C11-C13: supersession lineage resolves, non-current currentness follows it, all 8 conflict patterns have build-up and resolution", () => {
    const byId = new Map(corpus.artifacts.map((a) => [a.id, a]));
    for (const a of corpus.artifacts) {
      if (a.supersedes !== null) expect(byId.has(a.supersedes)).toBe(true);
      if (a.superseded_by !== null) {
        expect(byId.has(a.superseded_by)).toBe(true);
        expect(["superseded", "stale", "contradicted"]).toContain(a.currentness);
      }
    }
    for (let p = 1; p <= 8; p += 1) {
      const carriers = corpus.artifacts.filter((a) => a.conflict_patterns.includes(p));
      expect(carriers.length).toBeGreaterThanOrEqual(2);
    }
    cover("C11", "C12", "C13");
  });

  it("C14-C18: simulation honesty labels, currentness beats recency, authority context explicit, documentation follows communication, real timezones", () => {
    for (const a of corpus.artifacts) {
      if (a.communication_type === "seeded_google_doc_simulation") {
        expect(a.source_lineage).toContain("seeded_google_doc_simulation");
      }
      expect(Array.isArray(a.decision_makers_present)).toBe(true);
      expect(a.decision_rights_basis.length).toBeGreaterThan(0);
      for (const part of a.participants) {
        expect(() => new Intl.DateTimeFormat("en-US", { timeZone: part.timezone })).not.toThrow();
      }
    }
    // C15 — currentness governs, not recency: the July 24 brief is early,
    // superseded, and every CURRENT artifact that still says "July 24" only
    // does so to name it as replaced.
    const brief = corpus.artifacts.find((a) => a.id === "w1-northstar-brief")!;
    const decision = corpus.artifacts.find((a) => a.id === "w7-northstar-decision")!;
    expect(brief.currentness).toBe("superseded");
    expect(brief.superseded_by).toBe("w7-northstar-decision");
    expect(decision.date > brief.date).toBe(true);
    for (const a of corpus.artifacts) {
      if (a.currentness !== "current") continue;
      const text = [a.body ?? "", ...a.statements.map((s) => s.text)].join(" ");
      if (text.includes("July 24")) {
        expect(/supersed|replac|stragglers/i.test(text)).toBe(true);
      }
    }
    // C17 — the doc catches up to the decision, citing it.
    const v2 = corpus.artifacts.find((a) => a.id === "w6-ownership-matrix-v2")!;
    const reassign = corpus.artifacts.find((a) => a.id === "w6-reassignment")!;
    expect(v2.date >= reassign.date).toBe(true);
    expect(v2.source_lineage).toContain("w6-reassignment");
    // C18 — the org genuinely spans four US timezones.
    const tzs = new Set(corpus.artifacts.flatMap((a) => a.participants.map((p) => p.timezone)));
    for (const tz of ["America/Los_Angeles", "America/Denver", "America/New_York", "America/Chicago"]) {
      expect(tzs.has(tz)).toBe(true);
    }
    cover("C14", "C15", "C16", "C17", "C18");
  });

  // ================= decision rights (production engine) =================

  it("R01/R02: the approved August 7 decision is actionable; the stale July 24 target never is", () => {
    const approved = computeDecisionRights({
      decisionDomain: "customer",
      authority: {
        party: "Maya Chen",
        authorityType: "founder_executive",
        strength: "strong",
        direction: "Northstar pilot moves to August 7",
        evidence: "w7-northstar-decision: 'Approved. Move the pilot to August 7.'",
      },
      expertise: [
        { party: "Jordan Ellis", authorityType: "implementation_ownership", strength: "moderate", direction: "resequence prep to August 7" },
      ],
      evidence: [
        { party: "Dr. Lena Morris", authorityType: "customer_account", strength: "strong", evidence: "compliance signed off; August 7 confirmed by the client COO" },
      ],
      policyAllows: true,
      finalDecisionMade: true,
    });
    expect(approved.alignmentState).toBe("decision_made");
    expect(approved.confidence).toBe("high");
    expect(approved.autonomyBlocked).toBe(false);
    expect(approved.decisionOwner).toBe("Maya Chen");

    const stale = computeDecisionRights({
      decisionDomain: "customer",
      authority: null,
      expertise: [{ party: "Marcus Reed", authorityType: "customer_account", strength: "weak", direction: "July 24 working target" }],
      evidence: [{ party: "w1-northstar-brief", strength: "weak", evidence: "draft brief; compliance review pending" }],
      policyAllows: true,
      finalDecisionMade: false,
    });
    expect(stale.alignmentState).not.toBe("decision_made");
    expect(stale.autonomyBlocked).toBe(true);
    expect(stale.confidence).toBe("low");
    cover("R01", "R02");
  });

  it("R03/R04: the sales promise conflicts with the scope owner and blocks; the authorized correction resolves it", () => {
    const overreach = computeDecisionRights({
      decisionDomain: "product",
      authority: {
        party: "Priya Shah",
        authorityType: "role",
        strength: "strong",
        direction: "Phase 1 = transcript summarization + routing only",
        evidence: "w1-bluebird-scope approved brief",
      },
      expertise: [
        {
          party: "Theo Williams",
          authorityType: "customer_account",
          strength: "moderate",
          direction: "full automation of the review pipeline",
          contradictsAuthority: true,
        },
      ],
      evidence: [],
      policyAllows: true,
      finalDecisionMade: false,
    });
    expect(overreach.alignmentState).toBe("disagreement_unresolved");
    expect(overreach.confidence).toBe("low");
    expect(overreach.autonomyBlocked).toBe(true);
    expect(overreach.escalationTarget).toBe("Priya Shah");

    const corrected = computeDecisionRights({
      decisionDomain: "product",
      authority: {
        party: "Priya Shah",
        authorityType: "role",
        strength: "strong",
        direction: "Phase 1 scope re-affirmed to the client",
        evidence: "w4-bluebird-checkin correction, client acknowledged",
      },
      expertise: [{ party: "Marcus Reed", authorityType: "customer_account", strength: "moderate", direction: "recap sent in writing" }],
      evidence: [{ party: "w1-bluebird-scope", strength: "strong", evidence: "approved scope of record" }],
      policyAllows: true,
      finalDecisionMade: true,
    });
    expect(corrected.alignmentState).toBe("decision_made");
    expect(corrected.confidence).toBe("high");
    expect(corrected.autonomyBlocked).toBe(false);
    cover("R03", "R04");
  });

  it("R05/R06: a client request is not policy while an expert objects; the finalized cadence decision is", () => {
    const request = computeDecisionRights({
      decisionDomain: "execution",
      authority: {
        party: "Rafael Ortiz",
        authorityType: "customer_account",
        strength: "weak",
        direction: "daily syncs",
      },
      expertise: [
        {
          party: "Elena Torres",
          authorityType: "technical",
          strength: "strong",
          direction: "no daily focus-block loss during hardening",
          contradictsAuthority: true,
        },
      ],
      evidence: [],
      policyAllows: true,
      finalDecisionMade: false,
    });
    expect(request.alignmentState).toBe("disagreement_unresolved");
    expect(request.autonomyBlocked).toBe(true);

    const decided = computeDecisionRights({
      decisionDomain: "execution",
      authority: {
        party: "Jordan Ellis",
        authorityType: "role",
        strength: "strong",
        direction: "twice-weekly syncs + async updates M/W/F",
        evidence: "w6-harborlight-cadence-decision: 'Locked.'",
      },
      expertise: [{ party: "Marcus Reed", authorityType: "customer_account", strength: "moderate", direction: "cadence workable for the client" }],
      evidence: [{ party: "Rafael Ortiz", authorityType: "customer_account", strength: "moderate", evidence: "'Agreed — twice-weekly works.'" }],
      policyAllows: true,
      finalDecisionMade: true,
    });
    expect(decided.alignmentState).toBe("decision_made");
    expect(decided.confidence).toBe("high");
    expect(decided.autonomyBlocked).toBe(false);
    cover("R05", "R06");
  });

  it("R07/R08: 'ship Friday' is aspirational against the engineering owner's evidence; the gate-cleared date is actionable", () => {
    const aspirational = computeDecisionRights({
      decisionDomain: "deadline",
      authority: {
        party: "Jordan Ellis",
        authorityType: "role",
        strength: "strong",
        direction: "ship the Harborlight connector Friday",
      },
      expertise: [
        {
          party: "Elena Torres",
          authorityType: "implementation_ownership",
          strength: "strong",
          direction: "gate clears next week at the earliest",
          evidence: "ingestion pipeline dependency; feasibility gate not cleared",
          contradictsAuthority: true,
        },
      ],
      evidence: [],
      policyAllows: true,
      finalDecisionMade: false,
    });
    expect(aspirational.alignmentState).toBe("disagreement_unresolved");
    expect(aspirational.confidence).toBe("low");
    expect(aspirational.autonomyBlocked).toBe(true);
    expect(aspirational.note).toContain("Elena Torres");
    expect(aspirational.note).toContain("implementation");

    const gated = computeDecisionRights({
      decisionDomain: "deadline",
      authority: {
        party: "Jordan Ellis",
        authorityType: "role",
        strength: "strong",
        direction: "connector ships Friday May 15",
        evidence: "w5-eng-feasibility-clear: date committed after the gate",
      },
      expertise: [{ party: "Elena Torres", authorityType: "implementation_ownership", strength: "strong", direction: "connector unblocked" }],
      evidence: [{ party: "feasibility gate", strength: "strong", evidence: "ingestion pipeline cleared the gate" }],
      policyAllows: true,
      finalDecisionMade: true,
    });
    expect(gated.alignmentState).toBe("decision_made");
    expect(gated.confidence).toBe("high");
    expect(gated.autonomyBlocked).toBe(false);
    cover("R07", "R08");
  });

  it("R09/R10: policy outranks the CEO's enthusiasm; the joint approval clears it", () => {
    const heldByPolicy = computeDecisionRights({
      decisionDomain: "finance",
      authority: {
        party: "Maya Chen",
        authorityType: "founder_executive",
        strength: "strong",
        direction: "buy the $18k annotation tool",
      },
      expertise: [{ party: "Aisha Khan", authorityType: "policy", strength: "strong", direction: "joint sign-off required above $15k" }],
      evidence: [],
      policyAllows: false,
      finalDecisionMade: false,
    });
    expect(heldByPolicy.alignmentState).toBe("needs_authority_decision");
    expect(heldByPolicy.autonomyBlocked).toBe(true);
    expect(heldByPolicy.escalationTarget).toBe("policy approver");
    expect(heldByPolicy.note).toContain("Policy outranks hierarchy");

    const jointlyApproved = computeDecisionRights({
      decisionDomain: "finance",
      authority: {
        party: "Maya Chen",
        authorityType: "founder_executive",
        strength: "strong",
        direction: "purchase approved under the joint-approval policy",
        evidence: "w4-annotation-tool-approval: co-signed",
      },
      expertise: [{ party: "Aisha Khan", authorityType: "policy", strength: "strong", direction: "vendor check clean; approving" }],
      evidence: [{ party: "vendor check", strength: "moderate", evidence: "clean" }],
      policyAllows: true,
      finalDecisionMade: true,
    });
    expect(jointlyApproved.alignmentState).toBe("decision_made");
    expect(jointlyApproved.confidence).toBe("high");
    expect(jointlyApproved.autonomyBlocked).toBe(false);
    cover("R09", "R10");
  });

  it("R11/R12: routing follows the latest valid assignment; strong expertise alone never finalizes", () => {
    const reassignment = computeDecisionRights({
      decisionDomain: "execution",
      authority: {
        party: "Jordan Ellis",
        authorityType: "role",
        strength: "strong",
        direction: "Jordan owns exec follow-ups; Marcus keeps weekly check-ins",
        evidence: "w6-reassignment: effective 2026-05-11",
      },
      expertise: [{ party: "Marcus Reed", authorityType: "customer_account", strength: "moderate", direction: "handing over exec threads" }],
      evidence: [{ party: "Maya Chen", authorityType: "founder_executive", strength: "moderate", evidence: "'Agreed — exec follow-ups sit better with ops.'" }],
      policyAllows: true,
      finalDecisionMade: true,
    });
    expect(reassignment.alignmentState).toBe("decision_made");
    expect(reassignment.decisionOwner).toBe("Jordan Ellis");
    expect(reassignment.autonomyBlocked).toBe(false);

    const expertOnly = computeDecisionRights({
      decisionDomain: "technical",
      authority: null,
      expertise: [{ party: "Elena Torres", authorityType: "domain_expertise", strength: "strong", direction: "pipeline needs two weeks of hardening" }],
      evidence: [],
      policyAllows: true,
      finalDecisionMade: false,
    });
    expect(expertOnly.alignmentState).toBe("decision_proposed");
    expect(expertOnly.confidence).toBe("medium");
    expect(expertOnly.autonomyBlocked).toBe(true);
    cover("R11", "R12");
  });

  // ================= scheduling (production engine) =================

  it("S01-S04: Theo's 8AM-Pacific ask names the Pacific conflict in local words, offers a conforming alternative, and never claims event creation", () => {
    // w7-scheduling-chat: 11 AM EDT on Friday 2026-05-22 = 15:00Z = 8 AM PDT.
    const attendees = [
      { name: "Maya Chen", timezone: "America/Los_Angeles" },
      { name: "Jordan Ellis", timezone: "America/Los_Angeles" },
      { name: "Theo Williams", timezone: "America/New_York" },
    ];
    const r = evaluateMeetingProposal({
      start_iso: "2026-05-22T15:00:00.000Z",
      duration_min: 30,
      attendees,
      org_timezone: corpus.org_timezone,
    });
    expect(r.ok).toBe(false);
    expect(r.conflict_summary).toContain("Maya Chen");
    expect(r.conflict_summary).toContain("outside working hours");
    const maya = r.attendees.find((a) => a.name === "Maya Chen")!;
    expect(maya.ok).toBe(false);
    expect(maya.local_time_label).toContain("8:00 AM");
    expect(maya.local_time_label).toContain("PDT");
    const theo = r.attendees.find((a) => a.name === "Theo Williams")!;
    expect(theo.ok).toBe(true);
    expect(theo.local_time_label).toContain("11:00 AM");
    expect(theo.local_time_label).toContain("EDT");
    for (const a of r.attendees) {
      expect(a.local_time_label).toMatch(/(AM|PM)/);
      expect(a.local_time_label).toMatch(/[A-Z]{2,4}$/);
    }
    expect(r.suggested_alternative_iso).not.toBeNull();
    const alt = evaluateMeetingProposal({
      start_iso: r.suggested_alternative_iso!,
      duration_min: 30,
      attendees,
      org_timezone: corpus.org_timezone,
    });
    expect(alt.ok).toBe(true);
    expect(r.proposal_note).toContain("Proposed times only");
    expect(r.proposal_note).not.toMatch(/created the event|scheduled the event|calendar event created/i);
    cover("S01", "S02", "S03", "S04");
  });

  it("S05-S08: lunch stays protected per-person by default, weekends refuse, a clean cross-timezone slot passes", () => {
    // w8-lunch-scheduling-chat: 12:15 PM PDT on Thursday 2026-05-28 = 19:15Z.
    const lunchAttendees = [
      { name: "Priya Shah", timezone: "America/Los_Angeles" },
      { name: "Naomi Brooks", timezone: "America/Los_Angeles" },
      { name: "Theo Williams", timezone: "America/New_York" },
    ];
    const lunch = evaluateMeetingProposal({
      start_iso: "2026-05-28T19:15:00.000Z",
      duration_min: 45,
      attendees: lunchAttendees,
      org_timezone: corpus.org_timezone,
    });
    expect(lunch.ok).toBe(false);
    expect(lunch.conflict_summary).toContain("lunch");
    expect(lunch.conflict_summary).toContain("Priya Shah");
    // 3:15 PM EDT is nowhere near Theo's lunch — per-person, not org-global.
    expect(lunch.attendees.find((a) => a.name === "Theo Williams")!.ok).toBe(true);

    // Saturday 2026-05-30.
    const weekend = evaluateMeetingProposal({
      start_iso: "2026-05-30T18:00:00.000Z",
      duration_min: 30,
      attendees: lunchAttendees,
      org_timezone: corpus.org_timezone,
    });
    expect(weekend.ok).toBe(false);
    expect(weekend.conflict_summary).toContain("not a working day");

    // Thursday 2026-05-28 21:00Z = 2 PM PDT / 3 PM MDT / 5 PM EDT (ends 5:30 EDT).
    const clean = evaluateMeetingProposal({
      start_iso: "2026-05-28T21:00:00.000Z",
      duration_min: 30,
      attendees: [
        { name: "Maya Chen", timezone: "America/Los_Angeles" },
        { name: "Elena Torres", timezone: "America/Denver" },
        { name: "Theo Williams", timezone: "America/New_York" },
      ],
      org_timezone: corpus.org_timezone,
    });
    expect(clean.ok).toBe(true);
    expect(clean.conflict_summary).toBe("");
    cover("S05", "S06", "S07", "S08");
  });

  // ================= governed retrieval (real Postgres) =================

  it("D01-D06: the contradicted July 24 brief is suppressed, the confirmed August 7 log leads, retrieval is read-only and never authorizes action", async () => {
    await cleanup();
    await cleanupTestData();
    const orgId = await makeEntity("Redwood Atlas Org", "COMPANY");
    const adminId = await makeEntity("Redwood Atlas Admin", "PERSON");
    await grantOrgAdmin(adminId);
    await prisma.entityMembership.create({
      data: { parent_id: orgId, child_id: adminId, is_active: true, is_admin: true },
    });

    // Seed the three Northstar sources exactly as the corpus frames them.
    const brief = await seedDocumentContextForCaller(adminId, {
      source_kind: "PROJECT_BRIEF",
      title: "Northstar pilot brief July 24 target",
      body: "Northstar pilot working target July 24; compliance review pending.",
      currentness: "historical",
      covering_period: "April 2026",
    });
    const log = await seedDocumentContextForCaller(adminId, {
      source_kind: "DECISION_LOG",
      title: "Northstar pilot decision August 7",
      body: "DECISION: pilot moves to August 7, approved by Maya Chen with Dr. Lena Morris after compliance sign-off. Supersedes the July 24 target.",
      currentness: "current",
    });
    const background = await seedDocumentContextForCaller(adminId, {
      source_kind: "CUSTOMER_CONTEXT",
      title: "Northstar pilot background notes",
      body: "Northstar is compliance-sensitive and cautious about data.",
      currentness: "current",
    });
    expect(brief.ok && log.ok && background.ok).toBe(true);
    if (!brief.ok || !log.ok || !background.ok) return;

    // Communication lineage lands as validation: the brief is CONTRADICTED
    // by the superseding decision; the decision log is CONFIRMED.
    const markBad = await validateSeededContextRelevance({
      ledger_entry_id: brief.ledger_entry_id,
      org_entity_id: orgId,
      caller_entity_id: adminId,
      is_manager: true,
      state: "contradicted",
      note: "Superseded by the approved August 7 decision (w7-northstar-decision).",
    });
    const markGood = await validateSeededContextRelevance({
      ledger_entry_id: log.ledger_entry_id,
      org_entity_id: orgId,
      caller_entity_id: adminId,
      is_manager: true,
      state: "confirmed",
    });
    expect(markBad.ok).toBe(true);
    expect(markGood.ok).toBe(true);

    const work = await createLedgerEntry({
      org_entity_id: orgId,
      ledger_type: "TASK",
      title: "Prep the Northstar pilot kickoff",
      owner_entity_id: adminId,
      requester_entity_id: adminId,
    });
    expect(work.ok).toBe(true);
    if (!work.ok) return;

    const auditsBefore = await prisma.auditEvent.count();
    const capsulesBefore = await prisma.memoryCapsule.count();
    const notificationsBefore = await prisma.notification.count();
    const rowsBefore = await prisma.workLedgerEntry.count({ where: { org_entity_id: orgId } });

    const r = await retrieveSeededBackgroundForLedgerEntry({
      ledger_entry_id: work.entry.ledger_entry_id,
      org_entity_id: orgId,
      caller_entity_id: adminId,
      is_manager: true,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    // D01 — the contradicted brief never surfaces.
    const titles = r.results.map((x) => x.title_label).join(" | ");
    expect(titles).not.toContain("July 24 target");
    // D02 — the confirmed decision log leads and outranks background.
    expect(r.results.length).toBeGreaterThanOrEqual(2);
    const first = r.results[0]!;
    expect(first.title_label).toContain("August 7");
    expect(first.source_label).toBe("Confirmed seeded context");
    expect(first.confidence_rank).toBe(4);
    const bg = r.results.find((x) => x.title_label.includes("background notes"))!;
    expect(bg.source_label).toBe("Possible background context");
    expect(bg.confidence_rank).toBeGreaterThan(first.confidence_rank);

    // D03 — read-only.
    expect(await prisma.auditEvent.count()).toBe(auditsBefore);
    expect(await prisma.memoryCapsule.count()).toBe(capsulesBefore);
    expect(await prisma.notification.count()).toBe(notificationsBefore);
    expect(await prisma.workLedgerEntry.count({ where: { org_entity_id: orgId } })).toBe(rowsBefore);

    // D04/D05 — informs, never acts; attributed, never omniscient.
    for (const res of r.results) {
      expect(res.should_not_act).toBe(true);
      expect(res.origin_label.length).toBeGreaterThan(0);
      expect(res.source_label.length).toBeGreaterThan(0);
    }
    expect(JSON.stringify(r.results)).not.toMatch(/otzar knows|trained on|the truth is/i);

    // D06 — the codified ranking law is the doctrine's, in order.
    expect(CONTEXT_RANKING_LAW.map((x) => x.source)).toEqual([
      "live_work",
      "human_correction",
      "approved_decision",
      "confirmed_seeded",
      "candidate_relevance",
      "unvalidated_seeded",
      "historical_unknown",
      "suppressed",
    ]);
    cover("D01", "D02", "D03", "D04", "D05", "D06");
  });

  // ================= the matrix is binding =================

  it("every expected-behavior check in the matrix was executed — no silent coverage gaps", () => {
    const wanted = new Set(matrix.map((c) => c.id));
    const missing = [...wanted].filter((id) => !covered.has(id));
    expect(missing).toEqual([]);
    expect(covered.size).toBe(wanted.size);
    expect(wanted.size).toBeGreaterThanOrEqual(40);
  });
});
