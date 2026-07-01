// FILE: identity-reconciliation.test.ts (integration, real Postgres)
// PURPOSE: Slice C — cross-source identity reconciliation against the DB.
//          reconcileIdentity resolves email/handle/name to a canonical org entity,
//          org-scoped (no cross-tenant match). And the payoff: a person named
//          "David" in a transcript AND identified as "Dave" + david@… in a Slack
//          source event resolve to the SAME entity, so their work UNIFIES under
//          one owner in the one WorkLedger (instead of fragmenting per source).
//          NO LLM (deterministic).
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@niov/database";
import { ingestTranscript, ingestSourceEvent, reconcileIdentity } from "@niov/api";
import { createEntity } from "../../packages/database/src/queries/entity.js";
import { ensureAuditTriggers, cleanupTestData } from "../helpers.js";

const TEST_PREFIX = "__niov_test__ident__";
const pk = (s: string): string => `-----BEGIN PUBLIC KEY-----\n${s}\n-----END PUBLIC KEY-----`;
async function makeEntity(name: string, type: "PERSON" | "COMPANY", email?: string): Promise<string> {
  const e = await createEntity({
    email: email ?? `${TEST_PREFIX}${name.toLowerCase().replace(/\s/g, ".")}@niov-test.com`,
    public_key: pk(name), display_name: `${TEST_PREFIX} ${name}`, entity_type: type, clearance_level: 3, status: "ACTIVE",
  });
  return e.entity_id;
}
async function cleanup(): Promise<void> {
  const ents = await prisma.entity.findMany({ where: { display_name: { startsWith: TEST_PREFIX } }, select: { entity_id: true } });
  const ids = ents.map((e) => e.entity_id);
  if (ids.length === 0) return;
  await prisma.workLedgerEntry.deleteMany({ where: { org_entity_id: { in: ids } } });
  await prisma.entityProfile.deleteMany({ where: { entity_id: { in: ids } } });
  const caps = await prisma.meetingCapture.findMany({ where: { org_entity_id: { in: ids } }, select: { meeting_capture_id: true } });
  const capIds = caps.map((c) => c.meeting_capture_id);
  if (capIds.length > 0) {
    await prisma.meetingParticipantConsent.deleteMany({ where: { meeting_capture_id: { in: capIds } } });
    await prisma.meetingCapture.deleteMany({ where: { meeting_capture_id: { in: capIds } } });
  }
}

describe("identity reconciliation — cross-source, one canonical entity (DB)", () => {
  let orgId = "", callerId = "", davidId = "";
  const DAVID_EMAIL = `${TEST_PREFIX}david@niov-test.com`;

  beforeEach(async () => {
    await ensureAuditTriggers();
    await cleanup();
    await cleanupTestData();
    orgId = await makeEntity("Ident Org", "COMPANY");
    callerId = await makeEntity("Sadeil Caller", "PERSON");
    davidId = await makeEntity("David", "PERSON", DAVID_EMAIL);
    for (const id of [callerId, davidId]) {
      await prisma.entityMembership.create({ data: { parent_id: orgId, child_id: id, is_active: true } });
    }
    // David's connector handle lives on his profile username.
    await prisma.entityProfile.create({ data: { entity_id: davidId, username: `${TEST_PREFIX}dave` } });
  });
  afterAll(async () => {
    await cleanup();
    await cleanupTestData();
    await prisma.$disconnect();
  });

  it("resolves an org member by email, handle, and name — org-scoped", async () => {
    expect(await reconcileIdentity(orgId, { email: DAVID_EMAIL })).toMatchObject({ method: "email", entity_id: davidId });
    expect(await reconcileIdentity(orgId, { handle: `${TEST_PREFIX}dave` })).toMatchObject({ method: "username", entity_id: davidId });
    expect(await reconcileIdentity(orgId, { name: "David" })).toMatchObject({ method: "name", entity_id: davidId });
  });

  it("does NOT match across tenants (a member of another org)", async () => {
    const otherOrg = await makeEntity("Other Org", "COMPANY");
    // David is NOT a member of otherOrg → his email/handle must not resolve there.
    expect(await reconcileIdentity(otherOrg, { email: DAVID_EMAIL })).toMatchObject({ method: "none", entity_id: null });
    expect(await reconcileIdentity(otherOrg, { handle: `${TEST_PREFIX}dave` })).toMatchObject({ method: "none", entity_id: null });
  });

  it("UNIFIES the same person across sources: transcript 'David' + Slack 'Dave'+email → one owner", async () => {
    // Source 1 — transcript names him "David".
    const t = await ingestTranscript({ callerEntityId: callerId, capturedText: "David owns the repo access work and will grant write access.", llmProvider: null });
    expect(t.ok).toBe(true);

    // Source 2 — a Slack event names him "Dave" (won't match by display name) but
    // carries his email as a participant → reconciliation unifies to David.
    const s = await ingestSourceEvent(
      {
        sourceType: "CONNECTOR", sourceSystem: "SLACK", sourceId: "ident.slack.1",
        actor: { name: "Sadeil" },
        participants: [{ name: "Dave", email: DAVID_EMAIL }],
        timestamp: "2026-06-30T12:00:00Z", callerEntityId: callerId,
        content: "Dave owns the repo access work and will grant write access.",
      },
      { llmProvider: null },
    );
    expect(s.ok).toBe(true);

    // Both source's owned work resolves to the SAME canonical David entity.
    const davidRows = await prisma.workLedgerEntry.findMany({
      where: { org_entity_id: orgId, owner_entity_id: davidId, ledger_type: "COMMITMENT" },
      select: { source_type: true },
    });
    const sources = new Set(davidRows.map((r) => r.source_type));
    expect(davidRows.length, "David owns work from BOTH sources").toBeGreaterThanOrEqual(2);
    expect(sources.has("TRANSCRIPT"), "transcript-sourced work under David").toBe(true);
    expect(sources.has("CONNECTOR"), "connector-sourced work under David (reconciled from 'Dave'+email)").toBe(true);
  });

  it("an unknown Slack participant stays unresolved (NEEDS_OWNER, not a wrong match)", async () => {
    const s = await ingestSourceEvent(
      {
        sourceType: "CONNECTOR", sourceSystem: "SLACK", sourceId: "ident.slack.2",
        actor: { name: "Sadeil" },
        participants: [{ name: "Zephyr", email: "zephyr@stranger.com" }],
        timestamp: "2026-06-30T12:00:00Z", callerEntityId: callerId,
        content: "Zephyr owns the onboarding work.",
      },
      { llmProvider: null },
    );
    expect(s.ok).toBe(true);
    if (!s.ok) return;
    // Zephyr resolves to no org entity → the work is held for review, never
    // attributed to a wrong person.
    const zephyrOwned = s.work_items.filter((w) => w.owner_entity_id !== null && /zephyr/i.test(w.owner_name));
    expect(zephyrOwned.length).toBe(0);
    expect(s.work_items.some((w) => w.needs_review || w.owner_entity_id === null)).toBe(true);
  });
});
