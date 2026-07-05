// FILE: context-retrieval.test.ts (integration, real Postgres, HTTP inject)
// PURPOSE: [AIX-4] lock the first retrieval of seeded context into
//          answers, and the live-work-wins ranking law around it:
//          - the WHAT_BACKGROUND clarity answer LEADS with live work
//            truth (rank 1) before any seeded background (ranks 4–5)
//          - unvalidated seeded context appears ONLY as background with
//            attribution + "needs confirmation" language, never as truth
//          - AIX-2 confirmed context appears as "Confirmed seeded
//            context … live work still wins", confidence capped at
//            medium (never high from seeded context)
//          - stale / wrong_scope / contradicted context is SUPPRESSED
//          - non-managers retrieve nothing from the ownerless org-wide
//            pool (silence, no titles/snippets); cross-org is refused
//          - retrieval is READ-ONLY (no rows/audits/notifications/
//            capsules change) and NEVER suggests or takes an action
//          - the retrieval contract carries should_not_act on every
//            result and the codified ranking law matches the doctrine
//          - overclaim sweep: no "Otzar knows"/"trained"/"the truth is";
//            "confirmed" appears only for AIX-2-confirmed sources.
// CONNECTS TO: context-retrieval.service.ts (ranking law + contract),
//          clarity-answer.service.ts (WHAT_BACKGROUND), the AIX-3 gate,
//          AIX doctrine Part 3.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { computeTARHash, prisma } from "@niov/database";
import { buildApp, MemoryNonceStore } from "@niov/api";
import { seedDocumentContextForCaller } from "../../apps/api/src/services/otzar/document-context.service.js";
import { validateSeededContextRelevance } from "../../apps/api/src/services/work-os/context-relevance.service.js";
import {
  CONTEXT_RANKING_LAW,
  retrieveSeededBackgroundForLedgerEntry,
} from "../../apps/api/src/services/work-os/context-retrieval.service.js";
import {
  answerClarityQuestion,
  classifyClarityQuestion,
} from "../../apps/api/src/services/work-os/clarity-answer.service.js";
import { createLedgerEntry } from "../../apps/api/src/services/work-os/work-ledger.service.js";
import { createEntity } from "../../packages/database/src/queries/entity.js";
import { cleanupTestData, ensureAuditTriggers, TEST_PREFIX } from "../helpers.js";
import type { FastifyInstance } from "fastify";

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

describe("[AIX-4] confidence-aware retrieval + the ranking law (DB)", () => {
  let app: FastifyInstance;
  let orgId = "";
  let adminId = "";

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

  async function seedDoc(title: string, body: string, period?: string): Promise<string> {
    const r = await seedDocumentContextForCaller(adminId, {
      source_kind: "SOP",
      title,
      body,
      currentness: "historical",
      ...(period !== undefined ? { covering_period: period } : {}),
    });
    if (r.ok === false) throw new Error("seed failed");
    return r.ledger_entry_id;
  }

  async function makeWorkRow(title: string, ownerId: string): Promise<string> {
    const created = await createLedgerEntry({
      org_entity_id: orgId,
      ledger_type: "TASK",
      title,
      owner_entity_id: ownerId,
      requester_entity_id: ownerId,
    });
    if (created.ok === false) throw new Error("create failed");
    return created.entry.ledger_entry_id;
  }

  beforeAll(async () => {
    await ensureAuditTriggers();
    app = await buildApp({
      jwtSecret: "aix4-context-retrieval-test-secret",
      sessionNonceStore: new MemoryNonceStore(),
      declarationStore: new MemoryNonceStore(),
    });
  });
  beforeEach(async () => {
    await cleanup();
    await cleanupTestData();
    orgId = await makeEntity("Ret Org", "COMPANY");
    adminId = await makeEntity("Ret Admin", "PERSON");
    await grantOrgAdmin(adminId);
    await prisma.entityMembership.create({
      data: { parent_id: orgId, child_id: adminId, is_active: true, is_admin: true },
    });
  });
  afterAll(async () => {
    await app.close();
    await cleanup();
    await cleanupTestData();
    await prisma.$disconnect();
  });

  it("the codified ranking law matches the doctrine, in order", () => {
    expect(CONTEXT_RANKING_LAW.map((r) => r.source)).toEqual([
      "live_work",
      "human_correction",
      "approved_decision",
      "confirmed_seeded",
      "candidate_relevance",
      "unvalidated_seeded",
      "historical_unknown",
      "suppressed",
    ]);
    expect(CONTEXT_RANKING_LAW.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(classifyClarityQuestion("What do we know about this?")).toBe("WHAT_BACKGROUND");
    expect(classifyClarityQuestion("Is there any background context for this?")).toBe("WHAT_BACKGROUND");
    // Existing intents are untouched by the new branch.
    expect(classifyClarityQuestion("Where did this come from?")).toBe("WHERE_FROM");
    expect(classifyClarityQuestion("What should I do next?")).toBe("NEXT_STEP");
  });

  it("live work LEADS; unvalidated seeded context follows as attributed background; confirmed is medium-capped; READ-ONLY", async () => {
    const plainId = await seedDoc("Phoenix escalation runbook", "Phoenix escalation steps.", "2025");
    const confirmedId = await seedDoc("Phoenix escalation contacts", "Phoenix escalation call list.");
    await validateSeededContextRelevance({
      ledger_entry_id: confirmedId, org_entity_id: orgId,
      caller_entity_id: adminId, is_manager: true, state: "confirmed",
    });
    const workId = await makeWorkRow("Handle the Phoenix escalation backlog", adminId);

    const auditsBefore = await prisma.auditEvent.count();
    const capsulesBefore = await prisma.memoryCapsule.count();
    const notificationsBefore = await prisma.notification.count();
    const rowsBefore = await prisma.workLedgerEntry.count({ where: { org_entity_id: orgId } });

    const r = await answerClarityQuestion({
      org_entity_id: orgId, caller_entity_id: adminId, is_manager: true,
      ledger_entry_id: workId, question: "What do we know about this?",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const a = r.answer;
      // Rank 1 leads: live work sentence appears BEFORE any seeded content.
      expect(a.answer.startsWith("Live work is the source of truth here:")).toBe(true);
      const liveIdx = a.answer.indexOf("Live work is the source of truth");
      const confirmedIdx = a.answer.indexOf("Confirmed seeded context");
      const possibleIdx = a.answer.indexOf("Possible background context");
      expect(confirmedIdx).toBeGreaterThan(liveIdx);
      expect(possibleIdx).toBeGreaterThan(liveIdx);
      // Ranking inside the background: confirmed (rank 4) before candidate (5).
      expect(confirmedIdx).toBeLessThan(possibleIdx);
      // Attribution + confidence + confirmation language, per source.
      expect(a.answer).toContain('"Phoenix escalation contacts"');
      expect(a.answer).toContain("Confirmed as current by your team — live work still wins if they conflict.");
      expect(a.answer).toContain('"Phoenix escalation runbook"');
      expect(a.answer).toContain("Not confirmed — use as background only, never for action.");
      expect(a.answer).toContain("Background only.");
      // Confidence capped at medium (never high from seeded context).
      expect(a.confidence).toBe("medium");
      expect(a.used_sources).toEqual(["work_ledger", "seeded_background_retrieval"]);
      // Explanatory only — no action suggested from seeded context.
      expect(a.suggested_next_action).toBeUndefined();
      // Overclaim sweep.
      expect(a.answer).not.toMatch(/Otzar knows|trained|the truth is|personal memory|your Twin remembers/i);
      // No raw internals.
      expect(a.answer).not.toMatch(/DOCUMENT_CONTEXT|seeded_context|context_relevance|source_lineage|human_validation/);
      expect(a.answer).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    }

    // READ-ONLY end to end.
    expect(await prisma.auditEvent.count()).toBe(auditsBefore);
    expect(await prisma.memoryCapsule.count()).toBe(capsulesBefore);
    expect(await prisma.notification.count()).toBe(notificationsBefore);
    expect(await prisma.workLedgerEntry.count({ where: { org_entity_id: orgId } })).toBe(rowsBefore);
    // The seeded rows themselves were not touched by retrieval.
    const plainRow = await prisma.workLedgerEntry.findUnique({ where: { ledger_entry_id: plainId } });
    expect((plainRow!.details as Record<string, unknown>).context_relevance).toBeUndefined();

    // The retrieval contract itself: should_not_act on EVERY result;
    // confirmed rank 4 with requires_confirmation false; candidate rank 5.
    const contract = await retrieveSeededBackgroundForLedgerEntry({
      ledger_entry_id: workId, org_entity_id: orgId,
      caller_entity_id: adminId, is_manager: true,
    });
    expect(contract.ok).toBe(true);
    if (contract.ok) {
      expect(contract.results.length).toBe(2);
      expect(contract.results.every((x) => x.should_not_act === true)).toBe(true);
      const confirmed = contract.results.find((x) => x.title_label === "Phoenix escalation contacts")!;
      expect(confirmed.confidence_rank).toBe(4);
      expect(confirmed.requires_confirmation).toBe(false);
      expect(confirmed.confidence_label).toBe("Medium confidence");
      const candidate = contract.results.find((x) => x.title_label === "Phoenix escalation runbook")!;
      expect(candidate.confidence_rank).toBe(5);
      expect(candidate.requires_confirmation).toBe(true);
      expect(candidate.validation_path).toContain("View/Why");
    }
  });

  it("stale/wrong_scope/contradicted context never reaches an answer; needs_clarifier says the right person is needed", async () => {
    const staleId = await seedDoc("Phoenix launch plan draft", "Phoenix launch plan v1.");
    const contraId = await seedDoc("Phoenix launch timeline", "Phoenix launch dates.");
    const clarifierId = await seedDoc("Phoenix launch budget", "Phoenix launch costs.");
    await validateSeededContextRelevance({
      ledger_entry_id: staleId, org_entity_id: orgId,
      caller_entity_id: adminId, is_manager: true, state: "stale",
    });
    await validateSeededContextRelevance({
      ledger_entry_id: contraId, org_entity_id: orgId,
      caller_entity_id: adminId, is_manager: true, state: "contradicted",
    });
    await validateSeededContextRelevance({
      ledger_entry_id: clarifierId, org_entity_id: orgId,
      caller_entity_id: adminId, is_manager: true, state: "needs_clarifier",
    });
    const workId = await makeWorkRow("Phoenix launch readiness check", adminId);

    const r = await answerClarityQuestion({
      org_entity_id: orgId, caller_entity_id: adminId, is_manager: true,
      ledger_entry_id: workId, question: "Any background context on this?",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.answer.answer).not.toContain("Phoenix launch plan draft");
      expect(r.answer.answer).not.toContain("Phoenix launch timeline");
      expect(r.answer.answer).toContain('"Phoenix launch budget"');
      expect(r.answer.answer).toContain("needs the right person to confirm this");
      expect(r.answer.answer).toContain("Needs confirmation.");
      // Everything shown requires confirmation → confidence stays low.
      expect(r.answer.confidence).toBe("low");
    }
  });

  it("permission scope: a non-manager gets live truth + honest 'no seeded background' (no titles); cross-org refused; a seeded row explains itself", async () => {
    await seedDoc("Phoenix escalation runbook", "Phoenix escalation steps.");
    const employeeId = await makeEntity("Ret Employee", "PERSON");
    await prisma.entityMembership.create({
      data: { parent_id: orgId, child_id: employeeId, is_active: true },
    });
    const workId = await makeWorkRow("Handle the Phoenix escalation backlog", employeeId);

    const emp = await answerClarityQuestion({
      org_entity_id: orgId, caller_entity_id: employeeId, is_manager: false,
      ledger_entry_id: workId, question: "What do we know about this?",
    });
    expect(emp.ok).toBe(true);
    if (emp.ok) {
      expect(emp.answer.answer).toContain("No seeded background context is linked to this work yet.");
      expect(emp.answer.answer).not.toContain("Phoenix escalation runbook");
      expect(emp.answer.used_sources).toEqual(["work_ledger"]);
      expect(emp.answer.confidence).toBe("low");
    }

    const otherOrg = await makeEntity("Ret Other Org", "COMPANY");
    const cross = await retrieveSeededBackgroundForLedgerEntry({
      ledger_entry_id: workId, org_entity_id: otherOrg,
      caller_entity_id: adminId, is_manager: true,
    });
    expect(cross.ok).toBe(false);

    // Asking "what do we know" ON a seeded row: it explains itself as
    // background — no retrieval about other context, no truth claim.
    const docId = await seedDoc("Support escalation SOP", "David owns escalations.", "2025");
    const self = await answerClarityQuestion({
      org_entity_id: orgId, caller_entity_id: adminId, is_manager: true,
      ledger_entry_id: docId, question: "What do we know about this?",
    });
    expect(self.ok).toBe(true);
    if (self.ok) {
      expect(self.answer.answer).toContain("itself seeded background context");
      expect(self.answer.answer).toContain("background until live work or the right person confirms it");
      expect(self.answer.used_sources).toEqual(["seeded_background"]);
      expect(self.answer.answer).not.toMatch(/current truth|Otzar knows/i);
    }
  });
});
