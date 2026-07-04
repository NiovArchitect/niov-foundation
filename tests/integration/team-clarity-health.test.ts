// FILE: team-clarity-health.test.ts (integration, real Postgres)
// PURPOSE: [CE-4] lock both halves: (A) the READ-ONLY clarity learn signal —
//          a resolved clarification annotates the same clarifier on SIMILAR
//          work ("They clarified similar work here before.") while writing
//          NOTHING to any memory store and suppressing NO approval state;
//          (B) the manager exception summary — safe counts + labels only,
//          manager-gated, org-isolated, never answer text or excerpts.
// CONNECTS TO: apps/api/src/services/work-os/clarity.service.ts ([CE-4A]),
//          team-clarity-health.service.ts, clarification-request.service.ts.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@niov/database";
import { ingestSourceEvent, slackMessageToSourceEvent } from "@niov/api";
import { rankClarifiers } from "../../apps/api/src/services/work-os/clarity.service.js";
import { requestClarificationForCaller } from "../../apps/api/src/services/work-os/clarification-request.service.js";
import { getTeamClarityHealth } from "../../apps/api/src/services/work-os/team-clarity-health.service.js";
import { approveEscalationForCaller } from "../../apps/api/src/services/governance/escalation.service.js";
import { makeNotificationService } from "../../apps/api/src/services/notification/notification.service.js";
import { projectRoutingDecision } from "../../apps/api/src/services/work-os/routing-decision.js";
import { getLedgerEntry } from "../../apps/api/src/services/work-os/work-ledger.service.js";
import { createEntity } from "../../packages/database/src/queries/entity.js";
import { ensureAuditTriggers, cleanupTestData } from "../helpers.js";

const TEST_PREFIX = "__niov_test__clarity_health__";

function fakePublicKey(seed: string): string {
  return `-----BEGIN PUBLIC KEY-----\n${seed}\n-----END PUBLIC KEY-----`;
}
async function makeEntity(displayName: string, entityType: "PERSON" | "COMPANY"): Promise<string> {
  const e = await createEntity({
    email: `${TEST_PREFIX}${displayName.toLowerCase().replace(/\s/g, ".")}@niov-test.com`,
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

describe("[CE-4] clarity learn-signal + manager exception summary (DB)", () => {
  let orgId = "";
  let callerId = "";
  let davidId = "";
  let eveId = "";
  const notificationService = makeNotificationService({});

  beforeEach(async () => {
    await ensureAuditTriggers();
    await cleanup();
    await cleanupTestData();
    orgId = await makeEntity("CH Org", "COMPANY");
    callerId = await makeEntity("Sadeil Caller", "PERSON");
    davidId = await makeEntity("David", "PERSON");
    eveId = await makeEntity("Eve", "PERSON");
    for (const id of [callerId, davidId, eveId]) {
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

  async function ingestRow(ts: string): Promise<string> {
    const event = slackMessageToSourceEvent(
      {
        ts,
        text: "David owns the repo access work and will grant write access today.",
        user: "U0AUTHOR",
        user_name: "Eve",
        channel_id: "C0HEALTH",
        channel_name: "health",
        team_id: "T0HEALTH",
      },
      callerId,
    );
    const r = await ingestSourceEvent(event, { llmProvider: null });
    expect(r.ok).toBe(true);
    const rows = await prisma.workLedgerEntry.findMany({
      where: { org_entity_id: orgId, owner_entity_id: davidId, ledger_type: "COMMITMENT" },
      orderBy: { created_at: "desc" },
    });
    return rows[0]!.ledger_entry_id;
  }

  it("[CE-4A] a resolved clarification annotates the clarifier on SIMILAR work — nothing written to any memory store, no approval suppressed", async () => {
    // Row 1: David asks Eve (the source author) and Eve resolves it.
    const row1 = await ingestRow("1751700000.100001");
    const req = await requestClarificationForCaller({
      org_entity_id: orgId, caller_entity_id: davidId, is_manager: false,
      ledger_entry_id: row1, clarifier_entity_id: eveId, notificationService,
    });
    expect(req.ok).toBe(true);
    if (!req.ok) return;
    await approveEscalationForCaller(eveId, req.escalation_id, {
      answer: "Repo grants go through David — he owns access.",
    });

    // Memory-store baseline AFTER the lifecycle, BEFORE the learn-signal read.
    const capsulesBefore = await prisma.memoryCapsule.count();
    const correctionsBefore = await prisma.twinCorrectionMemory.count();

    // Row 2: SIMILAR work (same source system + author). Eve gains the
    // read-only prior-clarification annotation.
    const row2 = await ingestRow("1751700000.200002");
    const ranked = await rankClarifiers({
      org_entity_id: orgId, caller_entity_id: davidId,
      ledger_entry_id: row2, is_manager: false,
    });
    expect(ranked.ok).toBe(true);
    if (!ranked.ok) return;
    const eve = ranked.clarity.candidates.find((c) => c.entity_id === eveId);
    expect(eve?.prior_clarifications).toBe(1);
    expect(eve?.reason).toContain("They clarified similar work here before.");
    // The ANSWER TEXT never leaks into the projection.
    expect(JSON.stringify(ranked.clarity)).not.toContain("Repo grants go through");

    // The learn signal wrote NOTHING: no capsule, no correction memory —
    // company clarification truth never enters portable personal memory.
    expect(await prisma.memoryCapsule.count()).toBe(capsulesBefore);
    expect(await prisma.twinCorrectionMemory.count()).toBe(correctionsBefore);

    // No approval/routing suppression: an approval-needing row still needs it.
    await prisma.workLedgerEntry.update({
      where: { ledger_entry_id: row2 },
      data: { status: "NEEDS_APPROVAL" },
    });
    const gated = await getLedgerEntry({
      ledger_entry_id: row2, org_entity_id: orgId,
      caller_entity_id: davidId, is_manager: false,
    });
    expect(gated.ok).toBe(true);
    if (gated.ok) {
      expect(gated.entry.status).toBe("NEEDS_APPROVAL");
      expect(projectRoutingDecision(gated.entry).lane).not.toBe("auto");
    }
  });

  it("[CE-4B] manager summary: safe counts + top exception; no private details; non-manager blocked; cross-org isolated", async () => {
    const row1 = await ingestRow("1751700000.300003");
    const req = await requestClarificationForCaller({
      org_entity_id: orgId, caller_entity_id: davidId, is_manager: false,
      ledger_entry_id: row1, clarifier_entity_id: eveId, notificationService,
    });
    expect(req.ok).toBe(true);
    if (!req.ok) return;
    // Make it overdue (canonical row, adjusted expiry — no new rails).
    await prisma.escalationRequest.update({
      where: { escalation_id: req.escalation_id },
      data: { expires_at: new Date(Date.now() - 60_000) },
    });
    // One ownerless active row → ownership-unclear signal.
    await prisma.workLedgerEntry.create({
      data: {
        org_entity_id: orgId,
        ledger_type: "TASK",
        source_type: "VOICE_COMMAND",
        title: `${TEST_PREFIX} unowned task`,
        status: "PROPOSED",
        priority: "ROUTINE",
        extraction_source: "TYPESCRIPT_DETERMINISTIC",
        details: {},
        evidence: [],
      },
    });

    const health = await getTeamClarityHealth({ org_entity_id: orgId, is_manager: true });
    expect(health.ok).toBe(true);
    if (!health.ok) return;
    expect(health.health.unresolved_clarifications_count).toBe(1);
    expect(health.health.overdue_clarifications_count).toBe(1);
    expect(health.health.ownership_unclear_count).toBeGreaterThanOrEqual(1);
    expect(health.health.top_exception?.label).toContain("overdue");
    // Counts + labels only — never answer text, excerpts, UUIDs, or enums.
    const raw = JSON.stringify(health.health);
    expect(raw).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/);
    expect(raw).not.toMatch(/HUMAN_REVIEW_REQUIRED|SLACK:|source_system/);
    expect(raw).not.toContain("Repo grants");

    // Non-manager: honest blocker.
    const blocked = await getTeamClarityHealth({ org_entity_id: orgId, is_manager: false });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.code).toBe("TEAM_SCOPE_NOT_CONFIGURED");

    // Cross-org: another org's manager sees NOTHING of this org.
    const otherOrg = await makeEntity("Other CH Org", "COMPANY");
    const otherMgr = await makeEntity("Other CH Manager", "PERSON");
    await prisma.entityMembership.create({
      data: { parent_id: otherOrg, child_id: otherMgr, is_active: true },
    });
    const other = await getTeamClarityHealth({ org_entity_id: otherOrg, is_manager: true });
    expect(other.ok).toBe(true);
    if (other.ok) {
      expect(other.health.unresolved_clarifications_count).toBe(0);
      expect(other.health.overdue_clarifications_count).toBe(0);
    }
  });

  it("[CE-4B] repeated-ambiguity topics group by source phrase (no content), only repeats count", async () => {
    // Two clarifications on same-source rows → one repeated topic.
    for (const ts of ["1751700000.400004", "1751700000.500005"]) {
      const rowId = await ingestRow(ts);
      const req = await requestClarificationForCaller({
        org_entity_id: orgId, caller_entity_id: davidId, is_manager: false,
        ledger_entry_id: rowId, clarifier_entity_id: eveId, notificationService,
      });
      expect(req.ok).toBe(true);
      if (req.ok && req.already_requested === false) {
        await approveEscalationForCaller(eveId, req.escalation_id, { answer: "ok" });
      }
    }
    const health = await getTeamClarityHealth({ org_entity_id: orgId, is_manager: true });
    expect(health.ok).toBe(true);
    if (!health.ok) return;
    const topic = health.health.repeated_ambiguity_topics.find(
      (t) => t.label === "Slack-sourced work",
    );
    expect(topic?.count).toBe(2);
  });
});
