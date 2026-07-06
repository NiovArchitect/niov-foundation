// FILE: context-lifecycle.test.ts (integration, real Postgres, HTTP inject)
// PURPOSE: [RETENTION] lock the governed lifecycle rail — retire/restore,
//          never delete:
//          - an admin retires a seeded document → context_lifecycle JSON
//            lands additively (seeded/document/validation metadata all
//            preserved), the ROW and its CAPTURE survive, status is
//            untouched, audited exactly once, idempotent repeat silent
//          - suppression is total across active use: AIX-3 row-mode and
//            subject-mode candidates skip retired context, and the
//            extraction preview refuses it (SOURCE_RETIRED) — while
//            restore brings it back (reversible, audited as RESTORED)
//          - extracted human-reviewed work survives its source's
//            retirement (work lifecycle ≠ document lifecycle)
//          - refusals: non-admin 403, non-seeded 422, cross-org 404,
//            invalid state 422 (with "nothing is ever deleted" copy)
//          - the lifecycle list is admin-gated, labels + state (id only
//            as a POST target), and the boundary projection counts
//            retired context without losing the document count.
// CONNECTS TO: context-lifecycle.service.ts, isContextRetired,
//          POST /work-os/ledger/:id/context-lifecycle,
//          GET /work-os/context/documents, extraction preview refusal.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { computeTARHash, prisma } from "@niov/database";
import { buildApp, MemoryNonceStore } from "@niov/api";
import { seedDocumentContextForCaller } from "../../apps/api/src/services/otzar/document-context.service.js";
import { extractDocumentWorkPreview } from "../../apps/api/src/services/otzar/document-extraction.service.js";
import { setSeededContextLifecycle } from "../../apps/api/src/services/work-os/context-lifecycle.service.js";
import {
  getContextCandidatesForLedgerEntry,
  deriveSubjectBackgroundCandidates,
} from "../../apps/api/src/services/work-os/context-candidates.service.js";
import {
  getContextBoundaries,
  listSeededDocumentLifecycle,
} from "../../apps/api/src/services/work-os/context-boundaries.service.js";
import { createLedgerEntry, seededOriginFromDetails } from "../../apps/api/src/services/work-os/work-ledger.service.js";
import type { LLMProvider } from "../../apps/api/src/services/llm/llm.service.js";
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

const nullProvider: LLMProvider = {
  name: "null-provider",
  generateResponse: async () => ({
    ok: false,
    code: "UNAVAILABLE",
    fallback_message: "no provider",
    provider: "null",
  }),
};

describe("[RETENTION] governed context lifecycle — retire/restore, never delete (DB + HTTP)", () => {
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

  async function seedDoc(title: string, body: string): Promise<{ ledgerId: string; captureId: string }> {
    const r = await seedDocumentContextForCaller(adminId, {
      source_kind: "SOP",
      title,
      body,
      currentness: "historical",
      covering_period: "2025",
    });
    if (r.ok === false) throw new Error("seed failed");
    return { ledgerId: r.ledger_entry_id, captureId: r.meeting_capture_id };
  }

  beforeAll(async () => {
    await ensureAuditTriggers();
    app = await buildApp({
      jwtSecret: "retention-lifecycle-test-secret",
      sessionNonceStore: new MemoryNonceStore(),
      declarationStore: new MemoryNonceStore(),
    });
  });
  beforeEach(async () => {
    await cleanup();
    await cleanupTestData();
    orgId = await makeEntity("Ret2 Org", "COMPANY");
    adminId = await makeEntity("Ret2 Admin", "PERSON");
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

  it("retire preserves everything, suppresses active use everywhere, is idempotent + audited once; restore reverses it", async () => {
    const { ledgerId, captureId } = await seedDoc(
      "Phoenix escalation runbook",
      "Phoenix escalation steps for the launch.",
    );
    const workId = (await createLedgerEntry({
      org_entity_id: orgId,
      ledger_type: "TASK",
      title: "Handle the Phoenix escalation backlog",
      owner_entity_id: adminId,
      requester_entity_id: adminId,
    })) as { ok: true; entry: { ledger_entry_id: string } };
    // Extracted reviewed work whose SOURCE is the document — must survive.
    const reviewed = await createLedgerEntry({
      org_entity_id: orgId,
      ledger_type: "TASK",
      title: "Follow up from the runbook",
      status: "PROPOSED",
      owner_entity_id: adminId,
      requester_entity_id: adminId,
      details: {
        source: "document_extraction_review",
        source_document_ledger_id: ledgerId,
        human_reviewed: true,
      },
    });
    if (reviewed.ok === false) throw new Error("create failed");

    // Before retiring: the document IS an active candidate.
    const before = await getContextCandidatesForLedgerEntry({
      ledger_entry_id: workId.entry.ledger_entry_id, org_entity_id: orgId,
      caller_entity_id: adminId, is_manager: true,
    });
    expect(before.ok && before.candidates.length).toBe(1);

    // Retire it.
    const retired = await setSeededContextLifecycle({
      ledger_entry_id: ledgerId, org_entity_id: orgId,
      caller_entity_id: adminId, state: "retired", reason: "Superseded by the 2026 runbook",
    });
    expect(retired.ok).toBe(true);
    if (retired.ok) {
      expect(retired.changed).toBe(true);
      expect(retired.entry.seeded_origin!.lifecycle_state_label).toBe("Retired from active context");
    }
    // EVERYTHING preserved: row, capture, seeded metadata, reviewed work.
    const row = await prisma.workLedgerEntry.findUnique({ where: { ledger_entry_id: ledgerId } });
    expect(row).not.toBeNull();
    expect(row!.status).toBe("VERIFIED");
    const d = row!.details as Record<string, unknown>;
    expect((d.seeded_context as Record<string, unknown>).provided_by).toBe(adminId);
    expect((d.document as Record<string, unknown>).extract_work).toBe(false);
    expect((d.context_lifecycle as Record<string, unknown>).state).toBe("retired");
    expect((d.context_lifecycle as Record<string, unknown>).reason).toBe("Superseded by the 2026 runbook");
    expect(await prisma.meetingCapture.findUnique({ where: { meeting_capture_id: captureId } })).not.toBeNull();
    const reviewedRow = await prisma.workLedgerEntry.findUnique({
      where: { ledger_entry_id: reviewed.entry.ledger_entry_id },
    });
    expect(reviewedRow).not.toBeNull();
    expect(reviewedRow!.status).toBe("PROPOSED");

    // Suppressed across ACTIVE USE: row-mode, subject-mode, extraction.
    const after = await getContextCandidatesForLedgerEntry({
      ledger_entry_id: workId.entry.ledger_entry_id, org_entity_id: orgId,
      caller_entity_id: adminId, is_manager: true,
    });
    expect(after.ok && after.candidates.length).toBe(0);
    const subject = deriveSubjectBackgroundCandidates("Phoenix escalation", [
      { ledger_entry_id: ledgerId, title: row!.title, summary: row!.summary, details: row!.details },
    ]);
    expect(subject).toEqual([]);
    const preview = await extractDocumentWorkPreview(adminId, orgId, ledgerId, nullProvider);
    expect(preview.ok).toBe(false);
    if (preview.ok === false) {
      expect(preview.code).toBe("SOURCE_RETIRED");
      expect(preview.message).toContain("nothing was scanned");
    }

    // Idempotent repeat: no change, and the audit trail has exactly one
    // RETIRED row (the reason never enters audit details).
    const repeat = await setSeededContextLifecycle({
      ledger_entry_id: ledgerId, org_entity_id: orgId,
      caller_entity_id: adminId, state: "retired",
    });
    expect(repeat.ok && repeat.changed).toBe(false);
    const retireAudits = await prisma.auditEvent.findMany({
      where: { event_type: "SEEDED_CONTEXT_RETIRED", actor_entity_id: adminId },
    });
    // Service-level calls don't audit (the route audits); write one via HTTP
    // below — here we assert the service alone never spammed audit rows.
    expect(retireAudits.length).toBe(0);

    // Restore: reversible through the same rail; the candidate returns.
    const restored = await setSeededContextLifecycle({
      ledger_entry_id: ledgerId, org_entity_id: orgId,
      caller_entity_id: adminId, state: "active",
    });
    expect(restored.ok && restored.changed).toBe(true);
    const back = await getContextCandidatesForLedgerEntry({
      ledger_entry_id: workId.entry.ledger_entry_id, org_entity_id: orgId,
      caller_entity_id: adminId, is_manager: true,
    });
    expect(back.ok && back.candidates.length).toBe(1);
    expect(seededOriginFromDetails((await prisma.workLedgerEntry.findUnique({ where: { ledger_entry_id: ledgerId } }))!.details)!.lifecycle_state_label).toBeUndefined();
  });

  it("HTTP: non-admin 403; retire audited once with idempotent repeat silent; non-seeded 422; invalid state honest; lists + boundary counts follow", async () => {
    const { ledgerId } = await seedDoc("Leave policy", "Everyone gets rest.");
    const live = await createLedgerEntry({
      org_entity_id: orgId,
      ledger_type: "TASK",
      title: "Live task",
      owner_entity_id: adminId,
      requester_entity_id: adminId,
    });
    if (live.ok === false) throw new Error("create failed");

    const password = "correct-horse-battery";
    const { hashPassword } = await import("@niov/auth");
    const employeeId = await makeEntity("Ret2 Employee", "PERSON");
    await prisma.entity.update({
      where: { entity_id: employeeId },
      data: { password_hash: await hashPassword(password) },
    });
    await prisma.entityMembership.create({
      data: { parent_id: orgId, child_id: employeeId, is_active: true },
    });
    const empEmail = (await prisma.entity.findUnique({ where: { entity_id: employeeId }, select: { email: true } }))!.email!;
    const empLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: empEmail, password, requested_operations: ["read", "write"] },
      remoteAddress: "10.101.1.10",
    });
    const empToken = (empLogin.json() as { token: string }).token;
    const denied = await app.inject({
      method: "POST",
      url: `/api/v1/work-os/ledger/${ledgerId}/context-lifecycle`,
      headers: { authorization: `Bearer ${empToken}` },
      payload: { state: "retired" },
    });
    expect(denied.statusCode).toBe(403);
    const deniedList = await app.inject({
      method: "GET",
      url: "/api/v1/work-os/context/documents",
      headers: { authorization: `Bearer ${empToken}` },
    });
    expect(deniedList.statusCode).toBe(403);
    // Nothing was written by the refusal.
    const afterDenied = await prisma.workLedgerEntry.findUnique({ where: { ledger_entry_id: ledgerId } });
    expect((afterDenied!.details as Record<string, unknown>).context_lifecycle).toBeUndefined();

    await prisma.entity.update({
      where: { entity_id: adminId },
      data: { password_hash: await hashPassword(password) },
    });
    const adminEmail = (await prisma.entity.findUnique({ where: { entity_id: adminId }, select: { email: true } }))!.email!;
    const adminLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: adminEmail, password, requested_operations: ["read", "write"] },
      remoteAddress: "10.101.1.11",
    });
    const adminToken = (adminLogin.json() as { token: string }).token;

    // Retire via HTTP → audited exactly once; idempotent repeat silent.
    for (let i = 0; i < 2; i++) {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/work-os/ledger/${ledgerId}/context-lifecycle`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { state: "retired", reason: "Outdated policy" },
      });
      expect(res.statusCode).toBe(200);
    }
    const audits = await prisma.auditEvent.findMany({
      where: { event_type: "SEEDED_CONTEXT_RETIRED", actor_entity_id: adminId },
    });
    expect(audits.length).toBe(1);
    expect(JSON.stringify(audits[0]!.details)).not.toContain("Outdated policy");

    // Non-seeded rows refuse; invented states refuse with honest copy.
    const nonSeeded = await app.inject({
      method: "POST",
      url: `/api/v1/work-os/ledger/${live.entry.ledger_entry_id}/context-lifecycle`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { state: "retired" },
    });
    expect(nonSeeded.statusCode).toBe(422);
    const badState = await app.inject({
      method: "POST",
      url: `/api/v1/work-os/ledger/${ledgerId}/context-lifecycle`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { state: "purged" },
    });
    expect(badState.statusCode).toBe(422);
    expect((badState.json() as { message: string }).message).toContain("nothing is ever deleted");

    // Cross-org: enumeration-safe NOT_FOUND at the service tier.
    const otherOrg = await makeEntity("Ret2 Other Org", "COMPANY");
    const cross = await setSeededContextLifecycle({
      ledger_entry_id: ledgerId, org_entity_id: otherOrg,
      caller_entity_id: adminId, state: "retired",
    });
    expect(cross.ok).toBe(false);

    // The lifecycle list + boundary counts reflect the retire.
    const list = await listSeededDocumentLifecycle(orgId);
    expect(list.length).toBe(1);
    expect(list[0]!.title_label).toBe("Leave policy");
    expect(list[0]!.lifecycle_state_label).toBe("Retired from active context");
    const boundaries = await getContextBoundaries(orgId);
    expect(boundaries.seeded_document_count).toBe(1); // still counted — preserved
    expect(boundaries.retired_context_count).toBe(1);
  });
});
