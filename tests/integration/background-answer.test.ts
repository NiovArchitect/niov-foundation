// FILE: background-answer.test.ts (integration, real Postgres, HTTP inject)
// PURPOSE: [AIX-6] lock org-scoped named-subject background answers:
//          tight subject extraction (deictic subjects and action
//          phrasings refuse — honest INVALID_REQUEST, never a guess);
//          subject FIDELITY (every significant subject token must match —
//          "Project Phoenix" never returns Atlas material); live work
//          leads and is permission-scoped (employees see only their own
//          party rows; managers org-wide); seeded background follows
//          under the AIX-4 contract labels, manager-only, AIX-2
//          suppression honored, confirmed-first; the no-match answer is
//          the honest sentence; the endpoint is READ-ONLY (no rows/
//          audits/notifications/capsules change); no raw enums/UUIDs;
//          overclaim sweep; confidence never exceeds medium.
// CONNECTS TO: background-answer.service.ts, GET
//          /work-os/context/background-answer,
//          deriveSubjectBackgroundCandidates, AIX doctrine Part 7.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { computeTARHash, prisma } from "@niov/database";
import { buildApp, MemoryNonceStore } from "@niov/api";
import { seedDocumentContextForCaller } from "../../apps/api/src/services/otzar/document-context.service.js";
import { validateSeededContextRelevance } from "../../apps/api/src/services/work-os/context-relevance.service.js";
import {
  answerNamedSubjectBackground,
  extractBackgroundSubject,
} from "../../apps/api/src/services/work-os/background-answer.service.js";
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

describe("[AIX-6] org-scoped named-subject background answers (DB + HTTP)", () => {
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
      jwtSecret: "aix6-background-answer-test-secret",
      sessionNonceStore: new MemoryNonceStore(),
      declarationStore: new MemoryNonceStore(),
    });
  });
  beforeEach(async () => {
    await cleanup();
    await cleanupTestData();
    orgId = await makeEntity("Sub Org", "COMPANY");
    adminId = await makeEntity("Sub Admin", "PERSON");
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

  it("subject extraction: tight patterns match; deictic subjects, action requests, and vague subjects refuse", () => {
    expect(extractBackgroundSubject("What do we know about Project Phoenix?")).toBe("Project Phoenix");
    expect(extractBackgroundSubject("any background on the Q1 launch")).toBe("the Q1 launch");
    expect(extractBackgroundSubject("What context do we have on the onboarding rollout?")).toBe(
      "the onboarding rollout",
    );
    expect(extractBackgroundSubject("Is there historical context for the Atlas migration?")).toBe(
      "the Atlas migration",
    );
    // Deictic subjects belong to the item-scoped AIX-5 rail — refuse here.
    expect(extractBackgroundSubject("Any background on this customer?")).toBeNull();
    expect(extractBackgroundSubject("What do we know about this?")).toBeNull();
    expect(extractBackgroundSubject("what do we know about it")).toBeNull();
    // Action phrasings never match the extractor at all.
    for (const q of [
      "Send this to the customer",
      "Assign this to Sarah",
      "Approve this",
      "Create tasks from this doc",
      "Update the CRM with Project Phoenix",
      "Tell the client we committed to Friday",
    ]) {
      expect(extractBackgroundSubject(q), q).toBeNull();
    }
    // A subject with no significant tokens gets an honest ask-for-a-name.
    // (service-level check below)
  });

  it("HTTP: live work leads (permission-scoped), seeded follows confirmed-first with attribution; subject fidelity; suppression; READ-ONLY", async () => {
    // Live rows: two Phoenix (one owned by an employee), one Atlas.
    const employeeId = await makeEntity("Sub Employee", "PERSON");
    await prisma.entityMembership.create({
      data: { parent_id: orgId, child_id: employeeId, is_active: true },
    });
    await makeWorkRow("Phoenix launch checklist", adminId);
    await makeWorkRow("Phoenix vendor renewal", employeeId);
    await makeWorkRow("Atlas migration cutover", adminId);
    // Seeded: one confirmed Phoenix doc, one unvalidated Phoenix doc,
    // one stale Phoenix doc (suppressed), one Atlas doc (subject fidelity).
    const confirmedId = await seedDoc("Phoenix launch runbook", "Phoenix launch steps.", "2025");
    await validateSeededContextRelevance({
      ledger_entry_id: confirmedId, org_entity_id: orgId,
      caller_entity_id: adminId, is_manager: true, state: "confirmed",
    });
    await seedDoc("Phoenix retro notes", "Phoenix retrospective learnings.");
    const staleId = await seedDoc("Phoenix plan draft", "Phoenix old plan.");
    await validateSeededContextRelevance({
      ledger_entry_id: staleId, org_entity_id: orgId,
      caller_entity_id: adminId, is_manager: true, state: "stale",
    });
    await seedDoc("Atlas migration guide", "Atlas steps.");

    const password = "correct-horse-battery";
    const { hashPassword } = await import("@niov/auth");
    await prisma.entity.update({
      where: { entity_id: adminId },
      data: { password_hash: await hashPassword(password) },
    });
    const email = (await prisma.entity.findUnique({ where: { entity_id: adminId }, select: { email: true } }))!.email!;
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email, password, requested_operations: ["read"] },
      remoteAddress: "10.98.1.10",
    });
    const token = (login.json() as { token: string }).token;

    const auditsBefore = await prisma.auditEvent.count();
    const capsulesBefore = await prisma.memoryCapsule.count();
    const rowsBefore = await prisma.workLedgerEntry.count({ where: { org_entity_id: orgId } });

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/work-os/context/background-answer?question=${encodeURIComponent("What do we know about Phoenix?")}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean; answer: string; confidence: string; used_sources: string[] };
    // Live leads; org-wide for the manager (both Phoenix rows, not Atlas).
    expect(body.answer.startsWith("Live work is the source of truth here")).toBe(true);
    expect(body.answer).toContain('"Phoenix launch checklist"');
    expect(body.answer).toContain('"Phoenix vendor renewal"');
    expect(body.answer).not.toContain("Atlas");
    // Seeded follows, confirmed first, with the contract copy.
    const liveIdx = body.answer.indexOf("Live work is the source of truth");
    const confirmedIdx = body.answer.indexOf('Confirmed seeded context — "Phoenix launch runbook"');
    const possibleIdx = body.answer.indexOf('Possible background context — "Phoenix retro notes"');
    expect(confirmedIdx).toBeGreaterThan(liveIdx);
    expect(possibleIdx).toBeGreaterThan(confirmedIdx);
    expect(body.answer).toContain("confirmed as current by your team — live work still wins if they conflict");
    expect(body.answer).toContain("not confirmed — use as background only, never for action");
    // Suppressed stale doc never appears.
    expect(body.answer).not.toContain("Phoenix plan draft");
    expect(body.confidence).toBe("medium");
    expect(body.used_sources).toEqual(["work_ledger", "seeded_background_retrieval"]);
    // Leak + overclaim sweeps.
    expect(body.answer).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(body.answer).not.toMatch(/DOCUMENT_CONTEXT|seeded_context|context_relevance|Otzar knows|trained|the truth is/i);

    // READ-ONLY.
    expect(await prisma.auditEvent.count()).toBe(auditsBefore);
    expect(await prisma.memoryCapsule.count()).toBe(capsulesBefore);
    expect(await prisma.workLedgerEntry.count({ where: { org_entity_id: orgId } })).toBe(rowsBefore);
  });

  it("permission scope: an employee sees only their own party rows and NO seeded titles; refusals are honest", async () => {
    const employeeId = await makeEntity("Sub Employee Two", "PERSON");
    await prisma.entityMembership.create({
      data: { parent_id: orgId, child_id: employeeId, is_active: true },
    });
    await makeWorkRow("Phoenix launch checklist", adminId); // not the employee's
    await makeWorkRow("Phoenix vendor renewal", employeeId); // theirs
    await seedDoc("Phoenix launch runbook", "Phoenix launch steps.");

    const emp = await answerNamedSubjectBackground({
      org_entity_id: orgId, caller_entity_id: employeeId, is_manager: false,
      question: "What do we know about Phoenix?",
    });
    expect(emp.ok).toBe(true);
    if (emp.ok) {
      expect(emp.answer.answer).toContain('"Phoenix vendor renewal"');
      expect(emp.answer.answer).not.toContain("Phoenix launch checklist");
      expect(emp.answer.answer).not.toContain("Phoenix launch runbook");
      expect(emp.answer.used_sources).toEqual(["work_ledger"]);
    }

    // Nothing matches → the honest sentence, never a guess.
    const none = await answerNamedSubjectBackground({
      org_entity_id: orgId, caller_entity_id: employeeId, is_manager: false,
      question: "What do we know about the Jupiter initiative?",
    });
    expect(none.ok).toBe(true);
    if (none.ok) {
      expect(none.answer.answer).toContain('doesn\'t have live work or seeded background matching "the Jupiter initiative"');
      expect(none.answer.answer).toContain("nothing was guessed");
      expect(none.answer.confidence).toBe("low");
    }

    // Unresolvable shapes refuse with 422 honesty (never 500, never a guess).
    const bad = await answerNamedSubjectBackground({
      org_entity_id: orgId, caller_entity_id: employeeId, is_manager: false,
      question: "Approve this",
    });
    expect(bad.ok).toBe(false);
    if (bad.ok === false) expect(bad.code).toBe("INVALID_REQUEST");
    const vague = await answerNamedSubjectBackground({
      org_entity_id: orgId, caller_entity_id: employeeId, is_manager: false,
      question: "Any background on the the?",
    });
    expect(vague.ok).toBe(false);
  });
});
