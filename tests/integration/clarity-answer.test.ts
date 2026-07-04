// FILE: clarity-answer.test.ts (integration, real Postgres)
// PURPOSE: [CE-3] lock the read-only clarity ANSWER: each question category
//          answers from canonical truth in human copy (no raw ids, no
//          backend enums), unknown truth is honest, the suggested action
//          appears only when a real CE-1 candidate exists, and asking
//          NEVER mutates — no escalation, no notification, no ledger write.
// CONNECTS TO: apps/api/src/services/work-os/clarity-answer.service.ts.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@niov/database";
import { ingestSourceEvent, slackMessageToSourceEvent } from "@niov/api";
import {
  answerClarityQuestion,
  classifyClarityQuestion,
} from "../../apps/api/src/services/work-os/clarity-answer.service.js";
import { requestClarificationForCaller } from "../../apps/api/src/services/work-os/clarification-request.service.js";
import { approveEscalationForCaller } from "../../apps/api/src/services/governance/escalation.service.js";
import { makeNotificationService } from "../../apps/api/src/services/notification/notification.service.js";
import { createEntity } from "../../packages/database/src/queries/entity.js";
import { ensureAuditTriggers, cleanupTestData } from "../helpers.js";

const TEST_PREFIX = "__niov_test__clarity_answer__";

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

describe("[CE-3] clarity answer — truth-composed, honest, read-only (DB)", () => {
  let orgId = "";
  let callerId = "";
  let davidId = "";
  let eveId = "";
  const notificationService = makeNotificationService({});

  beforeEach(async () => {
    await ensureAuditTriggers();
    await cleanup();
    await cleanupTestData();
    orgId = await makeEntity("CA Org", "COMPANY");
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

  async function ingestRow(authorName: string, ts: string): Promise<string> {
    const event = slackMessageToSourceEvent(
      {
        ts,
        text: "David owns the repo access work and will grant write access today.",
        user: "U0AUTHOR",
        user_name: authorName,
        channel_id: "C0ANSWER",
        channel_name: "answers",
        team_id: "T0ANSWER",
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

  it("intent classification is deterministic for the six categories", () => {
    expect(classifyClarityQuestion("Where did this come from?")).toBe("WHERE_FROM");
    expect(classifyClarityQuestion("Why is this assigned to me?")).toBe("WHY_HERE");
    expect(classifyClarityQuestion("Who can clarify this?")).toBe("WHO_CLARIFIES");
    expect(classifyClarityQuestion("What happened to my clarification request?")).toBe("CLARIFICATION_STATUS");
    expect(classifyClarityQuestion("Why does this need approval?")).toBe("WHY_APPROVAL");
    expect(classifyClarityQuestion("What should I do next?")).toBe("NEXT_STEP");
    expect(classifyClarityQuestion("What is the weather?")).toBe("UNKNOWN");
    // Ownership phrasings route to the WHY_HERE composition (owner+requester).
    expect(classifyClarityQuestion("Who asked for this?")).toBe("WHY_HERE");
    expect(classifyClarityQuestion("Who owns this?")).toBe("WHY_HERE");
    expect(classifyClarityQuestion("Who requested this?")).toBe("WHY_HERE");
  });

  it("WHERE_FROM answers with the human source phrase + author; WHO_CLARIFIES names real candidates; no ids/enums leak", async () => {
    const ledgerId = await ingestRow("Eve", "1751600000.100001");
    const from = await answerClarityQuestion({
      org_entity_id: orgId, caller_entity_id: davidId, is_manager: false,
      ledger_entry_id: ledgerId, question: "Where did this come from?",
    });
    expect(from.ok).toBe(true);
    if (!from.ok) return;
    expect(from.answer.answer).toContain("This came from a Slack message.");
    expect(from.answer.answer).toContain("Eve");
    expect(from.answer.confidence).toBe("high");
    expect(from.answer.used_sources).toContain("source_lineage");

    const who = await answerClarityQuestion({
      org_entity_id: orgId, caller_entity_id: davidId, is_manager: false,
      ledger_entry_id: ledgerId, question: "Who can clarify this?",
    });
    expect(who.ok).toBe(true);
    if (!who.ok) return;
    expect(who.answer.answer).toMatch(/Eve can clarify — they sent the Slack message/);
    expect(who.answer.suggested_next_action?.type).toBe("request_clarification");
    expect(who.answer.suggested_next_action?.label).toMatch(/^Ask .* for clarification$/);

    for (const a of [from.answer, who.answer]) {
      // Customer copy (answer + label) never carries UUIDs or backend enums;
      // suggested_next_action.clarifier_entity_id is the ONE sanctioned id
      // field (a machine handle for the CE-2 call, never rendered as copy).
      const copy = `${a.answer} ${a.suggested_next_action?.label ?? ""}`;
      expect(copy).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/);
      expect(copy).not.toMatch(/HUMAN_REVIEW_REQUIRED|CONNECTOR|source_system|SLACK:/);
    }
  });

  it("CLARIFICATION_STATUS covers not-requested → waiting → the clarifier's stored ANSWER text", async () => {
    const ledgerId = await ingestRow("Eve", "1751600000.200002");
    const none = await answerClarityQuestion({
      org_entity_id: orgId, caller_entity_id: davidId, is_manager: false,
      ledger_entry_id: ledgerId, question: "What happened to my clarification?",
    });
    expect(none.ok).toBe(true);
    if (none.ok) {
      expect(none.answer.answer).toBe("You haven't requested clarification on this work.");
      expect(none.answer.suggested_next_action).toBeDefined();
    }

    const req = await requestClarificationForCaller({
      org_entity_id: orgId, caller_entity_id: davidId, is_manager: false,
      ledger_entry_id: ledgerId, clarifier_entity_id: eveId, notificationService,
    });
    expect(req.ok).toBe(true);
    if (!req.ok) return;

    const waiting = await answerClarityQuestion({
      org_entity_id: orgId, caller_entity_id: davidId, is_manager: false,
      ledger_entry_id: ledgerId, question: "Any update on my clarification?",
    });
    expect(waiting.ok).toBe(true);
    if (waiting.ok) {
      expect(waiting.answer.answer).toMatch(/A clarification was requested from .*Eve and is still waiting\./);
      expect(waiting.answer.suggested_next_action).toBeUndefined(); // one at a time
    }

    await approveEscalationForCaller(eveId, req.escalation_id, {
      answer: "You own repo access, so the grant falls to you.",
    });
    const resolved = await answerClarityQuestion({
      org_entity_id: orgId, caller_entity_id: davidId, is_manager: false,
      ledger_entry_id: ledgerId, question: "What happened to my clarification request?",
    });
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.answer.answer).toMatch(/clarified: "You own repo access/);
      expect(resolved.answer.used_sources).toContain("escalation_resolution");
    }
  });

  it("unknown source is honest; NEXT_STEP and WHY_APPROVAL answer from row truth", async () => {
    const ledgerId = await ingestRow("U0EXTERNAL", "1751600000.300003");
    // Strip lineage to simulate an unrecorded source.
    await prisma.workLedgerEntry.update({
      where: { ledger_entry_id: ledgerId },
      data: { details: {}, next_action: "Review and confirm the access list" },
    });
    const from = await answerClarityQuestion({
      org_entity_id: orgId, caller_entity_id: davidId, is_manager: false,
      ledger_entry_id: ledgerId, question: "Where did this come from?",
    });
    expect(from.ok).toBe(true);
    if (from.ok) {
      expect(from.answer.answer).toContain("was not recorded");
      expect(from.answer.confidence).toBe("low");
    }
    const next = await answerClarityQuestion({
      org_entity_id: orgId, caller_entity_id: davidId, is_manager: false,
      ledger_entry_id: ledgerId, question: "What should I do next?",
    });
    expect(next.ok).toBe(true);
    if (next.ok) expect(next.answer.answer).toBe("Review and confirm the access list");

    const approval = await answerClarityQuestion({
      org_entity_id: orgId, caller_entity_id: davidId, is_manager: false,
      ledger_entry_id: ledgerId, question: "Why does this need approval?",
    });
    expect(approval.ok).toBe(true);
    if (approval.ok) {
      expect(approval.answer.answer).toBe("This work doesn't currently need an approval.");
    }
  });

  it("cross-org NOT_FOUND; asking NEVER mutates (no escalation, no notification, no ledger write)", async () => {
    const ledgerId = await ingestRow("Eve", "1751600000.400004");
    const otherOrg = await makeEntity("Other CA Org", "COMPANY");
    const otherCaller = await makeEntity("Other CA Caller", "PERSON");
    await prisma.entityMembership.create({
      data: { parent_id: otherOrg, child_id: otherCaller, is_active: true },
    });
    const crossOrg = await answerClarityQuestion({
      org_entity_id: otherOrg, caller_entity_id: otherCaller, is_manager: true,
      ledger_entry_id: ledgerId, question: "Where did this come from?",
    });
    expect(crossOrg.ok).toBe(false);
    if (!crossOrg.ok) expect(crossOrg.code).toBe("NOT_FOUND");

    const ledgerBefore = await prisma.workLedgerEntry.count();
    const escBefore = await prisma.escalationRequest.count();
    const notifBefore = await prisma.notification.count();
    for (const q of [
      "Where did this come from?", "Who can clarify this?", "Why is this assigned to me?",
      "What happened to my clarification?", "Why does this need approval?", "What should I do next?",
    ]) {
      const r = await answerClarityQuestion({
        org_entity_id: orgId, caller_entity_id: davidId, is_manager: false,
        ledger_entry_id: ledgerId, question: q,
      });
      expect(r.ok).toBe(true);
    }
    expect(await prisma.workLedgerEntry.count()).toBe(ledgerBefore);
    expect(await prisma.escalationRequest.count()).toBe(escBefore);
    expect(await prisma.notification.count()).toBe(notifBefore);
  });
});
