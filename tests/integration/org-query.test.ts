// FILE: org-query.test.ts (integration, real Postgres)
// PURPOSE: Slice B — the UNIFIED ORG QUERY LAYER. Both a transcript source and a
//          Slack-shaped source event land in the ONE WorkLedger, then the governed
//          query answers self/project/team/org/admin with rich, evidence-bearing
//          results — and REFUSES what the caller may not see. Proves no-leak
//          (uninvolved user, non-manager, non-member, admin-only seeds, cross-
//          tenant), cross-source unification, connector-gap surfacing, noise
//          exclusion, and agent grounding (sufficient vs "not enough context").
//          NO LLM (deterministic).
// CONNECTS TO: services/work-os/org-query.service.ts.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@niov/database";
import { ingestTranscript, ingestSourceEvent } from "@niov/api";
import { queryOrgWork, groundContextForAgent } from "../../apps/api/src/services/work-os/org-query.service.js";
import { createLedgerEntry } from "../../apps/api/src/services/work-os/work-ledger.service.js";
import { createEntity } from "../../packages/database/src/queries/entity.js";
import { ensureAuditTriggers, cleanupTestData } from "../helpers.js";

const TEST_PREFIX = "__niov_test__org_query__";
const pk = (s: string): string => `-----BEGIN PUBLIC KEY-----\n${s}\n-----END PUBLIC KEY-----`;
async function makeEntity(name: string, type: "PERSON" | "COMPANY"): Promise<string> {
  const e = await createEntity({
    email: `${TEST_PREFIX}${name.toLowerCase().replace(/\s/g, ".")}@niov-test.com`,
    public_key: pk(name), display_name: `${TEST_PREFIX} ${name}`, entity_type: type, clearance_level: 3, status: "ACTIVE",
  });
  return e.entity_id;
}
async function cleanup(): Promise<void> {
  const ents = await prisma.entity.findMany({ where: { display_name: { startsWith: TEST_PREFIX } }, select: { entity_id: true } });
  const ids = ents.map((e) => e.entity_id);
  if (ids.length === 0) return;
  await prisma.workLedgerEntry.deleteMany({ where: { org_entity_id: { in: ids } } });
  await prisma.workProjectMember.deleteMany({ where: { org_entity_id: { in: ids } } });
  await prisma.workProject.deleteMany({ where: { org_entity_id: { in: ids } } });
  const caps = await prisma.meetingCapture.findMany({ where: { org_entity_id: { in: ids } }, select: { meeting_capture_id: true } });
  const capIds = caps.map((c) => c.meeting_capture_id);
  if (capIds.length > 0) {
    await prisma.meetingParticipantConsent.deleteMany({ where: { meeting_capture_id: { in: capIds } } });
    await prisma.meetingCapture.deleteMany({ where: { meeting_capture_id: { in: capIds } } });
  }
}

const TRANSCRIPT = [
  "Sadeil: Let's confirm owners for the launch demo.",
  "David owns the repo access work and will grant write access today.",
  "you you you you",
  "............",
].join("\n");

describe("org-query — unified governed org query layer (DB)", () => {
  let orgId = "", callerId = "", davidId = "", eveId = "", projectId = "";

  beforeEach(async () => {
    await ensureAuditTriggers();
    await cleanup();
    await cleanupTestData();
    orgId = await makeEntity("OQ Org", "COMPANY");
    callerId = await makeEntity("Sadeil Caller", "PERSON");
    davidId = await makeEntity("David", "PERSON");
    eveId = await makeEntity("Eve Uninvolved", "PERSON");
    for (const id of [callerId, davidId, eveId]) {
      await prisma.entityMembership.create({ data: { parent_id: orgId, child_id: id, is_active: true } });
    }
    // Populate the ONE ledger from TWO source types.
    await ingestTranscript({ callerEntityId: callerId, capturedText: TRANSCRIPT, llmProvider: null });
    await ingestSourceEvent(
      {
        sourceType: "CONNECTOR", sourceSystem: "SLACK", sourceId: "oq.slack.1",
        sourceUrl: "https://slack.com/archives/C1/p1", actor: { name: "Sadeil" },
        participants: [{ name: "David" }], timestamp: "2026-06-30T12:00:00Z",
        callerEntityId: callerId, title: "Slack thread",
        content: "David owns the repo access work and will grant write access.",
      },
      { llmProvider: null },
    );
    // A project-scoped row (project membership path).
    const proj = await prisma.workProject.create({ data: { org_entity_id: orgId, name: `${TEST_PREFIX} Launch`, created_by_entity_id: callerId } });
    projectId = proj.project_id;
    await prisma.workProjectMember.create({ data: { project_id: projectId, org_entity_id: orgId, entity_id: callerId } });
    await createLedgerEntry({
      org_entity_id: orgId, ledger_type: "COMMITMENT", source_type: "TRANSCRIPT",
      owner_entity_id: callerId, requester_entity_id: callerId, project_id: projectId,
      title: "Prepare the launch checklist", status: "PROPOSED", extraction_source: "TYPESCRIPT_DETERMINISTIC",
      evidence: [{ quote: "Sadeil will prepare the launch checklist." }],
    });
  });
  afterAll(async () => {
    await cleanup();
    await cleanupTestData();
    await prisma.$disconnect();
  });

  it("self scope returns the caller's own work across BOTH source types, with source evidence", async () => {
    const r = await queryOrgWork({ org_entity_id: orgId, caller_entity_id: callerId, is_manager: false, scope: "self", limit: 100 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.results.length).toBeGreaterThan(0);
    // Cross-source unification: transcript + connector rows in ONE query.
    const systems = new Set(r.results.map((x) => x.source_system));
    expect(systems.has("slack")).toBe(true);
    expect([...systems].some((s) => /transcript/.test(s))).toBe(true);
    // Source evidence present on results; no ORG_SEEDING in personal work.
    expect(r.results.some((x) => x.source_evidence !== null)).toBe(true);
    expect(r.results.every((x) => x.result_type !== "ORG_SEEDING")).toBe(true);
    // Noise never became a row → never appears.
    expect(r.results.every((x) => !/you you|^[.\s]+$/.test(x.title))).toBe(true);
  });

  it("an uninvolved user cannot see the caller's private work (no leak)", async () => {
    const r = await queryOrgWork({ org_entity_id: orgId, caller_entity_id: eveId, is_manager: false, scope: "self", limit: 100 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Eve is owner/target/requester of nothing here.
    expect(r.results.length).toBe(0);
  });

  it("team/org scope requires manager; a non-manager is refused (not leaked)", async () => {
    const denied = await queryOrgWork({ org_entity_id: orgId, caller_entity_id: eveId, is_manager: false, scope: "team" });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.code).toBe("SCOPE_NOT_PERMITTED");
    const allowed = await queryOrgWork({ org_entity_id: orgId, caller_entity_id: callerId, is_manager: true, scope: "org", limit: 100 });
    expect(allowed.ok).toBe(true);
    if (allowed.ok) expect(allowed.results.length).toBeGreaterThan(0);
  });

  it("project scope returns project work only to an active member", async () => {
    const member = await queryOrgWork({ org_entity_id: orgId, caller_entity_id: callerId, is_manager: false, scope: "project", project_id: projectId });
    expect(member.ok).toBe(true);
    if (member.ok) {
      expect(member.results.some((x) => x.title.includes("launch checklist"))).toBe(true);
      expect(member.results.every((x) => x.project_id === projectId)).toBe(true);
    }
    const nonMember = await queryOrgWork({ org_entity_id: orgId, caller_entity_id: eveId, is_manager: false, scope: "project", project_id: projectId });
    expect(nonMember.ok).toBe(false);
    if (!nonMember.ok) expect(nonMember.code).toBe("NOT_PROJECT_MEMBER");
  });

  it("connector_gaps filter surfaces the GitHub not_connected work", async () => {
    const r = await queryOrgWork({ org_entity_id: orgId, caller_entity_id: callerId, is_manager: true, scope: "org", filter: "connector_gaps", limit: 100 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.results.length).toBeGreaterThan(0);
    expect(r.results.every((x) => x.connector_gap !== null)).toBe(true);
    expect(r.results.some((x) => x.connector_gap?.required_connector === "GITHUB")).toBe(true);
  });

  it("Dandelion seeds are queryable ONLY in admin scope, only for a manager", async () => {
    const admin = await queryOrgWork({ org_entity_id: orgId, caller_entity_id: callerId, is_manager: true, scope: "admin", limit: 100 });
    expect(admin.ok).toBe(true);
    if (admin.ok) {
      expect(admin.results.length).toBeGreaterThan(0);
      expect(admin.results.every((x) => x.result_type === "ORG_SEEDING")).toBe(true);
      expect(admin.results.some((x) => x.dandelion_seed !== null)).toBe(true);
    }
    const nonAdmin = await queryOrgWork({ org_entity_id: orgId, caller_entity_id: callerId, is_manager: false, scope: "admin" });
    expect(nonAdmin.ok).toBe(false);
    if (!nonAdmin.ok) expect(nonAdmin.code).toBe("SCOPE_NOT_PERMITTED");
    // Seeds are also excluded from self/org scope entirely.
    const org = await queryOrgWork({ org_entity_id: orgId, caller_entity_id: callerId, is_manager: true, scope: "org", limit: 100 });
    if (org.ok) expect(org.results.every((x) => x.result_type !== "ORG_SEEDING")).toBe(true);
  });

  it("no cross-tenant leak: another org's caller sees only their own org", async () => {
    const otherOrg = await makeEntity("Other Org", "COMPANY");
    const otherCaller = await makeEntity("Other Caller", "PERSON");
    await prisma.entityMembership.create({ data: { parent_id: otherOrg, child_id: otherCaller, is_active: true } });
    const r = await queryOrgWork({ org_entity_id: otherOrg, caller_entity_id: otherCaller, is_manager: true, scope: "org", limit: 100 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.results.length).toBe(0); // this org's ledger is empty
  });

  it("agent grounding returns relevant context, and flags insufficient context (no hallucination)", async () => {
    const hit = await groundContextForAgent({ org_entity_id: orgId, caller_entity_id: callerId, is_manager: false, query: "repo access github" });
    expect(hit.sufficient).toBe(true);
    expect(hit.results.length).toBeGreaterThan(0);
    expect(hit.results.every((x) => x.result_id.length > 0)).toBe(true); // grounded to real rows

    const miss = await groundContextForAgent({ org_entity_id: orgId, caller_entity_id: callerId, is_manager: false, query: "quarterly revenue forecast for the Tokyo office" });
    expect(miss.sufficient).toBe(false);
    expect(miss.results.length).toBe(0);
    expect(miss.reason).toMatch(/not fabricate|don't have|do not fabricate/i);
  });
});
