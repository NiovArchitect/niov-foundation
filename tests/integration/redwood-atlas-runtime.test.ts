// FILE: redwood-atlas-runtime.test.ts (integration, real Postgres, HTTP)
// PURPOSE: [REDWOOD-RUNTIME] The smoke-org simulation run — the org
//          operating substrate arc proven END TO END through the
//          product's REAL HTTP surface, not engine calls:
//            provision the Redwood Atlas Studio org (8 people from
//            people.json) → set domain decision rights through the 3A
//            admin route → set org/person timezones through the
//            ORG-SUBSTRATE routes → ingest conflict-pattern
//            communications through POST /otzar/comms/ingest → verify
//            truth through GET /work-os/ledger/:id/clarity-answer and
//            the rights/summary/work-profile reads.
//          Binding doctrine exercised at runtime: supersession links on
//          explicit language and the clarity answer LEADS with the calm
//          correction; a sales promise in an engineering-owned domain is
//          flagged exceeds-authority, never approved truth; posture and
//          the safe org summary read back exactly; stored timezones feed
//          the scheduling engine's local-words verdicts.
//          TENANCY: this simulation runs against the LOCAL test DB. The
//          LIVE smoke-org run requires the founder-gated Phase-0 dual-
//          control org creation (runbook §3.1) — once `NIOV Smoke Org`
//          exists, this spec's flow is the script to point at it. The
//          Redwood corpus is NEVER loaded into the prod/demo org.
// CONNECTS TO: tests/fixtures/redwood-atlas/* (people + doctrine),
//          org.routes.ts (3A rights + work profiles), otzar.routes.ts
//          (comms ingest), work-os-ledger.routes.ts (clarity answer),
//          truth-weight.service.ts, supersession-linking.service.ts,
//          scheduling-policy.service.ts.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { computeTARHash, prisma } from "@niov/database";
import { buildApp, MemoryNonceStore } from "@niov/api";
import { evaluateMeetingProposal } from "../../apps/api/src/services/work-os/scheduling-policy.service.js";
import { lineageFromDetails, computeTruthWeight } from "../../apps/api/src/services/otzar/truth-weight.service.js";
import { createEntity } from "../../packages/database/src/queries/entity.js";
import { cleanupTestData, ensureAuditTriggers, TEST_PREFIX } from "../helpers.js";
import type { FastifyInstance } from "fastify";

const P = TEST_PREFIX; // display-name prefix; transcripts must use the full prefixed names

// The 8 Redwood people mapped from people.json free-text rights onto the
// DecisionDomain vocabulary (conservative, disjoint per person).
const REDWOOD_PEOPLE: Array<{
  name: string;
  timezone: string;
  owns: string[];
  can_approve: string[];
  recommend_only: string[];
}> = [
  { name: "Maya Chen", timezone: "America/Los_Angeles", owns: ["strategic"], can_approve: ["customer"], recommend_only: ["technical", "product"] },
  { name: "Jordan Ellis", timezone: "America/Los_Angeles", owns: ["execution", "deadline"], can_approve: [], recommend_only: ["product", "finance"] },
  { name: "Priya Shah", timezone: "America/Los_Angeles", owns: ["product"], can_approve: [], recommend_only: ["deadline", "finance"] },
  { name: "Marcus Reed", timezone: "America/Los_Angeles", owns: ["customer"], can_approve: [], recommend_only: ["product", "finance"] },
  { name: "Elena Torres", timezone: "America/Denver", owns: ["technical", "architecture"], can_approve: [], recommend_only: ["deadline"] },
  { name: "Naomi Brooks", timezone: "America/Los_Angeles", owns: ["design"], can_approve: [], recommend_only: ["product"] },
  { name: "Theo Williams", timezone: "America/New_York", owns: [], can_approve: [], recommend_only: ["technical", "product", "customer"] },
  { name: "Aisha Khan", timezone: "America/Los_Angeles", owns: ["finance", "legal"], can_approve: [], recommend_only: [] },
];

function fakePublicKey(seed: string): string {
  return `-----BEGIN PUBLIC KEY-----\n${seed}\n-----END PUBLIC KEY-----`;
}

// Per-run dynamic identity (runbook §3 discipline: smoke identities are
// never reused across runs).
const RUN_ID = randomUUID().slice(0, 8);

/** TRUE-UX sweep: everything a human reads must be human — no raw enum
 *  tokens, no UUIDs, no ranking mechanics, ever. */
function assertHumanCopy(text: string): void {
  const cleaned = text.replaceAll(TEST_PREFIX, "");
  expect(cleaned).not.toMatch(
    /\b(recommend_only|exceeds_authority|within_authority|superseding_decision|memory_reference|unresolved_question|policy_constraint|authorized_decision|weight_class)\b/,
  );
  expect(cleaned).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  expect(cleaned).not.toMatch(/\btruth[_ ]weight\b|\brank\b/i);
}

describe("[REDWOOD-RUNTIME] the smoke-org simulation — substrate arc over real HTTP", () => {
  let app: FastifyInstance;
  let orgId = "";
  let adminId = ""; // Jordan (Head of Operations) is the org admin
  const idByName = new Map<string, string>();
  const password = "correct-horse-battery";

  async function makeEntity(displayName: string, entityType: "PERSON" | "COMPANY"): Promise<string> {
    const e = await createEntity({
      email: `${P}redwood+${RUN_ID}.${displayName.toLowerCase().replace(/[^a-z0-9]/g, ".")}@niov-test.com`,
      public_key: fakePublicKey(displayName + randomUUID()),
      display_name: `${P} ${displayName}`,
      entity_type: entityType,
      clearance_level: 3,
      status: "ACTIVE",
    });
    return e.entity_id;
  }
  async function grantOrgAdmin(entityId: string): Promise<void> {
    await prisma.tokenAttributeRepository.update({ where: { entity_id: entityId }, data: { can_admin_org: true } });
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
  async function login(entityId: string, ip: string): Promise<string> {
    const { hashPassword } = await import("@niov/auth");
    await prisma.entity.update({ where: { entity_id: entityId }, data: { password_hash: await hashPassword(password) } });
    const email = (await prisma.entity.findUnique({ where: { entity_id: entityId }, select: { email: true } }))!.email!;
    const r = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email, password, requested_operations: ["read", "write", "admin_org"] },
      remoteAddress: ip,
    });
    return (r.json() as { token: string }).token;
  }

  /** Provision Redwood Atlas Studio: org + 8 people + memberships. */
  async function provisionRedwood(): Promise<void> {
    idByName.clear();
    orgId = await makeEntity("Redwood Atlas Studio", "COMPANY");
    for (const person of REDWOOD_PEOPLE) {
      const id = await makeEntity(person.name, "PERSON");
      idByName.set(person.name, id);
      await prisma.entityMembership.create({
        data: { parent_id: orgId, child_id: id, is_active: true, is_admin: person.name === "Jordan Ellis" },
      });
    }
    adminId = idByName.get("Jordan Ellis")!;
    await grantOrgAdmin(adminId);
  }

  beforeEach(async () => {
    await ensureAuditTriggers();
    await cleanupTestData();
    const stale = await prisma.entity.findMany({
      where: { display_name: { startsWith: P } },
      select: { entity_id: true },
    });
    const ids = stale.map((e) => e.entity_id);
    if (ids.length > 0) {
      await prisma.entityDecisionRights.deleteMany({ where: { org_entity_id: { in: ids } } });
      await prisma.workLedgerEntry.deleteMany({ where: { org_entity_id: { in: ids } } });
      const caps = await prisma.meetingCapture.findMany({ where: { org_entity_id: { in: ids } }, select: { meeting_capture_id: true } });
      if (caps.length > 0) {
        await prisma.meetingParticipantConsent.deleteMany({ where: { meeting_capture_id: { in: caps.map((c) => c.meeting_capture_id) } } });
        await prisma.meetingCapture.deleteMany({ where: { meeting_capture_id: { in: caps.map((c) => c.meeting_capture_id) } } });
      }
    }
    await provisionRedwood();
  });
  afterAll(async () => {
    await app.close();
    await cleanupTestData();
    await prisma.$disconnect();
  });

  it("PROVISION + RIGHTS + TIMEZONES over HTTP: 8 people, admin-authored rights, safe summary, self posture, work profiles", async () => {
    app = app ?? (await buildApp({ jwtSecret: "redwood-runtime-secret", sessionNonceStore: new MemoryNonceStore(), declarationStore: new MemoryNonceStore() }));
    const adminToken = await login(adminId, "10.120.1.9");

    // Admin authors every person's rights through the REAL 3A route.
    for (const person of REDWOOD_PEOPLE) {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/v1/org/members/${idByName.get(person.name)!}/decision-rights`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { owns: person.owns, can_approve: person.can_approve, recommend_only: person.recommend_only },
      });
      expect(res.statusCode).toBe(200);
    }

    // Org timezone through the operating-profile route.
    const orgTz = await app.inject({
      method: "PATCH",
      url: "/api/v1/org/operating-profile",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { org_timezone: "America/Los_Angeles" },
    });
    expect(orgTz.statusCode).toBe(200);

    // Each person sets their OWN timezone (self-scoped route).
    for (const person of REDWOOD_PEOPLE.filter((p) => p.timezone !== "America/Los_Angeles")) {
      const tok = await login(idByName.get(person.name)!, "10.120.1.20");
      const set = await app.inject({
        method: "PATCH",
        url: "/api/v1/org/me/work-profile",
        headers: { authorization: `Bearer ${tok}` },
        payload: { timezone: person.timezone },
      });
      expect(set.statusCode).toBe(200);
    }

    // TRUE-UX WALK — every one of the 8 people logs in and reads their
    // OWN posture; the assertion is DERIVED from the fixture mapping, not
    // hardcoded, so any drift between what the admin authored and what a
    // person experiences fails loudly.
    for (const person of REDWOOD_PEOPLE) {
      const tok = await login(idByName.get(person.name)!, "10.120.1.30");
      const posture = await app.inject({
        method: "GET",
        url: "/api/v1/org/me/decision-rights",
        headers: { authorization: `Bearer ${tok}` },
      });
      expect(posture.statusCode).toBe(200);
      const body = posture.json() as {
        rights: { owns: string[]; can_approve: string[]; recommend_only: string[] } | null;
        note: string;
      };
      expect(body.rights).not.toBeNull();
      expect(body.rights!.owns.sort()).toEqual([...person.owns].sort());
      expect(body.rights!.can_approve.sort()).toEqual([...person.can_approve].sort());
      expect(body.rights!.recommend_only.sort()).toEqual([...person.recommend_only].sort());
      expect(body.note).toContain("do not grant tool access");

      // The safe org summary as EACH person: names + domains only —
      // never emails, never TAR material, never other tenants.
      const summary = await app.inject({
        method: "GET",
        url: "/api/v1/org/decision-rights",
        headers: { authorization: `Bearer ${tok}` },
      });
      const members = (summary.json() as { members: Array<Record<string, unknown>> }).members;
      expect(members.length).toBe(8);
      expect(members.every((m) => !("email" in m) && !("tar_hash" in m) && !("password_hash" in m))).toBe(true);
    }

    // Stored timezones feed the scheduling engine's LOCAL-words verdicts:
    // Monday 2026-07-13 14:00 UTC = 07:00 Pacific (outside working hours
    // for Maya) / 10:00 Eastern (fine for Theo) — read from the profiles
    // the routes JUST stored, not from fixtures.
    const profiles = new Map<string, string>();
    for (const person of REDWOOD_PEOPLE) {
      const row = await prisma.entityProfile.findUnique({ where: { entity_id: idByName.get(person.name)! } });
      profiles.set(person.name, row?.timezone ?? "America/Los_Angeles");
    }
    expect(profiles.get("Elena Torres")).toBe("America/Denver");
    expect(profiles.get("Theo Williams")).toBe("America/New_York");
    const proposal = evaluateMeetingProposal({
      start_iso: "2026-07-13T14:00:00.000Z",
      duration_min: 30,
      attendees: [
        { name: "Maya Chen", timezone: profiles.get("Maya Chen")! },
        { name: "Theo Williams", timezone: profiles.get("Theo Williams")! },
      ],
      org_timezone: "America/Los_Angeles",
    });
    expect(proposal.ok).toBe(false);
    expect(proposal.conflict_summary).toContain("Maya Chen");
    expect(proposal.conflict_summary).toContain("outside working hours");
    const theoView = proposal.attendees.find((a) => a.name === "Theo Williams");
    expect(theoView?.ok).toBe(true);
    expect(theoView?.local_time_label).toContain("10:00");
    // A conforming same-day alternative is proposed AND re-verified.
    expect(proposal.suggested_alternative_iso).not.toBeNull();
    const recheck = evaluateMeetingProposal({
      start_iso: proposal.suggested_alternative_iso!,
      duration_min: 30,
      attendees: [
        { name: "Maya Chen", timezone: profiles.get("Maya Chen")! },
        { name: "Theo Williams", timezone: profiles.get("Theo Williams")! },
      ],
      org_timezone: "America/Los_Angeles",
    });
    expect(recheck.ok).toBe(true);
    expect(proposal.proposal_note).toContain("Proposed times only");
    assertHumanCopy(proposal.conflict_summary + " " + proposal.proposal_note);
  });

  it("CONFLICT PATTERNS over ingest + retrieval: supersession links + calm correction; sales overreach flagged, never approved truth", async () => {
    app = app ?? (await buildApp({ jwtSecret: "redwood-runtime-secret", sessionNonceStore: new MemoryNonceStore(), declarationStore: new MemoryNonceStore() }));
    const adminToken = await login(adminId, "10.120.2.9");
    // Rights first (the substrate the patterns depend on).
    for (const person of REDWOOD_PEOPLE) {
      await app.inject({
        method: "PATCH",
        url: `/api/v1/org/members/${idByName.get(person.name)!}/decision-rights`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { owns: person.owns, can_approve: person.can_approve, recommend_only: person.recommend_only },
      });
    }

    // Elena captures the July plan through the REAL ingest route.
    const elenaToken = await login(idByName.get("Elena Torres")!, "10.120.2.10");
    const elenaName = `${P} Elena Torres`;
    const first = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/comms/ingest",
      headers: { authorization: `Bearer ${elenaToken}` },
      payload: {
        captured_text: `${elenaName} owns the Northstar pilot integration endpoint kickoff work and will confirm the July 24 date this week.`,
        title: "Northstar planning sync",
        force_mode: "LOCAL_FALLBACK",
      },
    });
    expect(first.statusCode).toBe(200);

    // Then the explicit replacement — supersession must link at ingest.
    const second = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/comms/ingest",
      headers: { authorization: `Bearer ${elenaToken}` },
      payload: {
        captured_text: [
          `${elenaName} owns the Northstar pilot integration endpoint replan work and will move the kickoff to August 7 — this replaces the old July 24 plan.`,
          "I think the old date was July 24.",
          "Can we do daily syncs?",
        ].join("\n"),
        title: "Northstar replan sync",
        force_mode: "LOCAL_FALLBACK",
      },
    });
    expect(second.statusCode).toBe(200);

    const rows = await prisma.workLedgerEntry.findMany({
      where: { org_entity_id: orgId, ledger_type: "COMMITMENT" },
      orderBy: { created_at: "asc" },
    });
    expect(rows.length).toBe(2); // the memory line + the request created NO work rows
    const oldLineage = lineageFromDetails(rows[0]!.details);
    const newLineage = lineageFromDetails(rows[1]!.details);
    expect(newLineage?.communication_act).toBe("superseding_decision");
    expect(newLineage?.authority_basis).toBe("owns:technical"); // Elena's structured right, live
    expect(newLineage?.supersedes).toBe(rows[0]!.ledger_entry_id);
    expect(oldLineage?.currentness).toBe("superseded");

    // The clarity surface (REAL route, Elena is party): asking about the
    // OLD row leads with the calm correction + the current source.
    const answerRes = await app.inject({
      method: "GET",
      url: `/api/v1/work-os/ledger/${rows[0]!.ledger_entry_id}/clarity-answer?question=${encodeURIComponent("Any background on this?")}`,
      headers: { authorization: `Bearer ${elenaToken}` },
    });
    expect(answerRes.statusCode).toBe(200);
    const answer = (answerRes.json() as { answer: string }).answer;
    expect(answer).toContain("You may be looking at an older plan");
    expect(answer).toContain("superseded");
    expect(answer).toContain("The current decision is"); // the current source, named
    expect(answer.toLowerCase()).not.toContain("you are wrong");
    assertHumanCopy(answer); // brief, human, zero mechanics/ids

    // BOUNDARY AS UX: Naomi (design, not a party to Elena's rows, not a
    // manager) asks the same question — enumeration-safe NOT_FOUND, so
    // her experience is honest silence, never a leak.
    const naomiToken = await login(idByName.get("Naomi Brooks")!, "10.120.2.12");
    const naomiProbe = await app.inject({
      method: "GET",
      url: `/api/v1/work-os/ledger/${rows[0]!.ledger_entry_id}/clarity-answer?question=${encodeURIComponent("Any background on this?")}`,
      headers: { authorization: `Bearer ${naomiToken}` },
    });
    expect(naomiProbe.statusCode).toBe(404);
    expect(JSON.stringify(naomiProbe.json())).not.toContain("Northstar"); // not even the title leaks

    // Sales overreach: Theo (recommend-only in technical) promises full
    // automation in Elena's domain — flagged, never approved truth.
    const theoToken = await login(idByName.get("Theo Williams")!, "10.120.2.11");
    const theoName = `${P} Theo Williams`;
    const overreach = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/comms/ingest",
      headers: { authorization: `Bearer ${theoToken}` },
      payload: {
        captured_text: `${theoName} owns the Bluebird automation pitch work and will deliver full API integration automation by launch.`,
        title: "Bluebird client call",
        force_mode: "LOCAL_FALLBACK",
      },
    });
    expect(overreach.statusCode).toBe(200);
    const theoRow = await prisma.workLedgerEntry.findFirst({
      where: { org_entity_id: orgId, ledger_type: "COMMITMENT", owner_entity_id: idByName.get("Theo Williams")! },
      orderBy: { created_at: "desc" },
    });
    const theoLineage = lineageFromDetails(theoRow!.details);
    expect(theoLineage?.decision_domain).toBe("technical");
    expect(theoLineage?.authority_status).toBe("exceeds_authority");
    const weight = computeTruthWeight(theoLineage!);
    expect(weight.can_finalize).toBe(false);
    expect(weight.weight_class).toBe("exceeds_authority");
    // And the clarity surface says so, quietly, to Theo himself.
    const theoAnswer = await app.inject({
      method: "GET",
      url: `/api/v1/work-os/ledger/${theoRow!.ledger_entry_id}/clarity-answer?question=${encodeURIComponent("Any background on this?")}`,
      headers: { authorization: `Bearer ${theoToken}` },
    });
    expect(theoAnswer.statusCode).toBe(200);
    const theoAnswerText = (theoAnswer.json() as { answer: string }).answer;
    expect(theoAnswerText).toContain("beyond the speaker's decision rights");
    assertHumanCopy(theoAnswerText);

    // And the substrate stayed inside its lane at runtime: the whole
    // simulation minted ZERO tool grants, ZERO TAR changes beyond the one
    // admin bootstrap, ZERO twin authority — Theo's TAR is untouched by
    // his flagged commitment.
    const theoTar = await prisma.tokenAttributeRepository.findUnique({
      where: { entity_id: idByName.get("Theo Williams")! },
    });
    expect(theoTar?.can_admin_org).toBe(false);
    expect(theoTar?.can_admin_niov).toBe(false);
  });
});
