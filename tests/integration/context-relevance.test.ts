// FILE: context-relevance.test.ts (integration, real Postgres, HTTP inject)
// PURPOSE: [AIX-2] lock the FIRST relevance write path — in-context human
//          validation of seeded background context. An authorized human
//          (manager/admin, or a party the row is about) can mark a seeded
//          row confirmed/stale/wrong_scope/contradicted/needs_clarifier;
//          the write is additive details JSON preserving all seeded
//          lineage; the projection renders customer-safe labels only.
//          REFUSED: non-seeded rows, non-party employees (enumeration-safe
//          NOT_FOUND), cross-org callers, invalid states. Idempotent:
//          repeating the same validation changes nothing and audits once.
//          Boundaries: zero new ledger rows, zero notifications, zero
//          personal-wallet capsules, no status change, open-work exclusion
//          intact, audit details carry state but never the free-text note.
// CONNECTS TO: context-relevance.service.ts, work-os-ledger.routes.ts
//          (POST /work-os/ledger/:id/context-validation),
//          seededOriginFromDetails, AIX doctrine Part 7 (AIX-2).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { computeTARHash, prisma } from "@niov/database";
import { buildApp, MemoryNonceStore } from "@niov/api";
import { seedDocumentContextForCaller } from "../../apps/api/src/services/otzar/document-context.service.js";
import { validateSeededContextRelevance } from "../../apps/api/src/services/work-os/context-relevance.service.js";
import {
  createLedgerEntry,
  getMyWork,
  seededOriginFromDetails,
} from "../../apps/api/src/services/work-os/work-ledger.service.js";
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

describe("[AIX-2] seeded-context validation — the first relevance write path", () => {
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

  async function loginToken(entityId: string, ip: string): Promise<string> {
    const password = "correct-horse-battery";
    const { hashPassword } = await import("@niov/auth");
    await prisma.entity.update({
      where: { entity_id: entityId },
      data: { password_hash: await hashPassword(password) },
    });
    const email = (await prisma.entity.findUnique({
      where: { entity_id: entityId },
      select: { email: true },
    }))!.email!;
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email, password, requested_operations: ["read", "write"] },
      remoteAddress: ip,
    });
    return (login.json() as { token: string }).token;
  }

  async function seedDocumentRow(): Promise<string> {
    const r = await seedDocumentContextForCaller(adminId, {
      source_kind: "SOP",
      title: "Support escalation SOP",
      body: "David owns escalations. Always respond within one day.",
      currentness: "historical",
      covering_period: "2025",
    });
    if (r.ok === false) throw new Error("seed failed");
    return r.ledger_entry_id;
  }

  beforeAll(async () => {
    await ensureAuditTriggers();
    app = await buildApp({
      jwtSecret: "aix2-context-relevance-test-secret",
      sessionNonceStore: new MemoryNonceStore(),
      declarationStore: new MemoryNonceStore(),
    });
  });
  beforeEach(async () => {
    await cleanup();
    await cleanupTestData();
    orgId = await makeEntity("Rel Org", "COMPANY");
    adminId = await makeEntity("Rel Admin", "PERSON");
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

  it("HTTP: an admin confirms a seeded document row — details land, lineage preserved, labels safe, audited once (idempotent repeat)", async () => {
    const ledgerId = await seedDocumentRow();
    const capsulesBefore = await prisma.memoryCapsule.count();
    const notificationsBefore = await prisma.notification.count();
    const rowsBefore = await prisma.workLedgerEntry.count({ where: { org_entity_id: orgId } });
    const token = await loginToken(adminId, "10.96.1.10");

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/work-os/ledger/${ledgerId}/context-validation`,
      headers: { authorization: `Bearer ${token}` },
      payload: { state: "confirmed", note: "Checked with support lead." },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean; entry: { seeded_origin?: Record<string, unknown> } };
    expect(body.ok).toBe(true);
    // The projection carries labels only — no raw state enum, no validator id.
    const so = body.entry.seeded_origin!;
    expect(so.validation_state_label).toBe("Confirmed current");
    expect(so.validation_guidance).toBe("Confirmed as current by your team.");
    const rawProjection = JSON.stringify(so);
    expect(rawProjection).not.toMatch(/wrong_scope|needs_clarifier|human_validation|confirmed_by|context_relevance/);
    expect(rawProjection).not.toContain(adminId);

    // The row: additive JSON — validation written, ALL seeded lineage kept,
    // status untouched (no work-state mutation).
    const row = await prisma.workLedgerEntry.findUnique({ where: { ledger_entry_id: ledgerId } });
    const d = row!.details as Record<string, unknown>;
    const cr = d.context_relevance as Record<string, unknown>;
    expect(cr.state).toBe("confirmed");
    expect(cr.confirmed_by).toBe(adminId);
    expect(typeof cr.confirmed_at).toBe("string");
    expect(cr.note).toBe("Checked with support lead.");
    expect(cr.source).toBe("human_validation");
    expect(cr.applies_to).toBe("seeded_context");
    expect((d.seeded_context as Record<string, unknown>).provided_by).toBe(adminId);
    expect((d.seeded_context as Record<string, unknown>).covering_period).toBe("2025");
    expect((d.document as Record<string, unknown>).source_kind).toBe("SOP");
    expect((d.document as Record<string, unknown>).extract_work).toBe(false);
    expect(row!.status).toBe("VERIFIED");

    // Idempotent repeat: same person, same state, same note — no new write,
    // the recorded timestamp survives, and the audit trail has exactly one row.
    const firstConfirmedAt = cr.confirmed_at;
    const repeat = await app.inject({
      method: "POST",
      url: `/api/v1/work-os/ledger/${ledgerId}/context-validation`,
      headers: { authorization: `Bearer ${token}` },
      payload: { state: "confirmed", note: "Checked with support lead." },
    });
    expect(repeat.statusCode).toBe(200);
    const rowAfter = await prisma.workLedgerEntry.findUnique({ where: { ledger_entry_id: ledgerId } });
    expect((rowAfter!.details as Record<string, unknown>).context_relevance).toMatchObject({
      confirmed_at: firstConfirmedAt,
    });
    const audits = await prisma.auditEvent.findMany({
      where: { event_type: "SEEDED_CONTEXT_VALIDATED", actor_entity_id: adminId },
    });
    expect(audits.length).toBe(1);
    // Audit details: state + row id, NEVER the free-text note.
    const auditRaw = JSON.stringify(audits[0]!.details);
    expect(auditRaw).toContain(ledgerId);
    expect(auditRaw).toContain("confirmed");
    expect(auditRaw).not.toContain("Checked with support lead");

    // Boundaries: nothing else moved.
    expect(await prisma.memoryCapsule.count()).toBe(capsulesBefore);
    expect(await prisma.notification.count()).toBe(notificationsBefore);
    expect(await prisma.workLedgerEntry.count({ where: { org_entity_id: orgId } })).toBe(rowsBefore);
    // Open-work exclusion intact: the validated document row still never
    // appears as open work.
    const myWork = await getMyWork({ org_entity_id: orgId, caller_entity_id: adminId });
    expect(myWork.some((v) => v.ledger_entry_id === ledgerId)).toBe(false);
  });

  it("a non-manager OWNER of a seeded history row can mark it stale / contradicted; the labels follow", async () => {
    const employeeId = await makeEntity("Rel Employee", "PERSON");
    await prisma.entityMembership.create({
      data: { parent_id: orgId, child_id: employeeId, is_active: true },
    });
    // A seeded-history work item (CS-1 shape): owned, VERIFIED, seeded lineage.
    const created = await createLedgerEntry({
      org_entity_id: orgId,
      ledger_type: "COMMITMENT",
      source_type: "MEETING",
      title: "Old commitment from seeded history",
      status: "VERIFIED",
      owner_entity_id: employeeId,
      requester_entity_id: adminId,
      extraction_source: "TYPESCRIPT_DETERMINISTIC",
      details: {
        source: "transcript_ingest",
        seeded_context: { provided_by: adminId, covering_period: "2024", seeded_at: new Date().toISOString() },
      },
    });
    if (created.ok === false) throw new Error("create failed");
    const ledgerId = created.entry.ledger_entry_id;

    const stale = await validateSeededContextRelevance({
      ledger_entry_id: ledgerId,
      org_entity_id: orgId,
      caller_entity_id: employeeId,
      is_manager: false,
      state: "stale",
    });
    expect(stale.ok).toBe(true);
    if (stale.ok) {
      expect(stale.changed).toBe(true);
      expect(stale.entry.seeded_origin!.validation_state_label).toBe("Marked outdated");
      expect(stale.entry.seeded_origin!.validation_guidance).toBe(
        "Otzar should use newer or live work instead.",
      );
    }
    // The owner changes their mind: contradicted overwrites (latest human
    // validation wins), and changed=true because the state differs.
    const contradicted = await validateSeededContextRelevance({
      ledger_entry_id: ledgerId,
      org_entity_id: orgId,
      caller_entity_id: employeeId,
      is_manager: false,
      state: "contradicted",
    });
    expect(contradicted.ok).toBe(true);
    if (contradicted.ok) {
      expect(contradicted.changed).toBe(true);
      expect(contradicted.entry.seeded_origin!.validation_state_label).toBe(
        "Marked as conflicting with newer work",
      );
    }
    // needs_clarifier + wrong_scope render their own safe labels.
    const pure = seededOriginFromDetails({
      seeded_context: { provided_by: adminId },
      context_relevance: { state: "needs_clarifier" },
    });
    expect(pure!.validation_state_label).toBe("Waiting on the right person");
    const wrong = seededOriginFromDetails({
      seeded_context: { provided_by: adminId },
      context_relevance: { state: "wrong_scope" },
    });
    expect(wrong!.validation_state_label).toBe("Marked as wrong context");
    // Unknown/garbage stored state: silence, never an invented label.
    const garbage = seededOriginFromDetails({
      seeded_context: { provided_by: adminId },
      context_relevance: { state: "DELETED" },
    });
    expect(garbage!.validation_state_label).toBeUndefined();
  });

  it("REFUSALS: non-seeded row 422, random employee NOT_FOUND, cross-org NOT_FOUND, bad state 422 — nothing written", async () => {
    const ledgerId = await seedDocumentRow();
    // 1) A live (non-seeded) row refuses validation.
    const live = await createLedgerEntry({
      org_entity_id: orgId,
      ledger_type: "TASK",
      title: "Live task",
      owner_entity_id: adminId,
      requester_entity_id: adminId,
    });
    if (live.ok === false) throw new Error("create failed");
    const token = await loginToken(adminId, "10.96.1.11");
    const nonSeeded = await app.inject({
      method: "POST",
      url: `/api/v1/work-os/ledger/${live.entry.ledger_entry_id}/context-validation`,
      headers: { authorization: `Bearer ${token}` },
      payload: { state: "confirmed" },
    });
    expect(nonSeeded.statusCode).toBe(422);
    expect((nonSeeded.json() as { code: string }).code).toBe("NOT_SEEDED_CONTEXT");

    // 2) A random employee (org member, but not a party and not a manager)
    //    cannot validate ownerless org-wide seeded context — enumeration-safe.
    const randoId = await makeEntity("Rel Rando", "PERSON");
    await prisma.entityMembership.create({
      data: { parent_id: orgId, child_id: randoId, is_active: true },
    });
    const rando = await validateSeededContextRelevance({
      ledger_entry_id: ledgerId,
      org_entity_id: orgId,
      caller_entity_id: randoId,
      is_manager: false,
      state: "confirmed",
    });
    expect(rando.ok).toBe(false);
    if (rando.ok === false) expect(rando.code).toBe("NOT_FOUND");

    // 3) Cross-org caller: NOT_FOUND, even as a manager of the other org.
    const otherOrg = await makeEntity("Rel Other Org", "COMPANY");
    const crossOrg = await validateSeededContextRelevance({
      ledger_entry_id: ledgerId,
      org_entity_id: otherOrg,
      caller_entity_id: adminId,
      is_manager: true,
      state: "confirmed",
    });
    expect(crossOrg.ok).toBe(false);
    if (crossOrg.ok === false) expect(crossOrg.code).toBe("NOT_FOUND");

    // 4) An invented state refuses honestly.
    const bad = await validateSeededContextRelevance({
      ledger_entry_id: ledgerId,
      org_entity_id: orgId,
      caller_entity_id: adminId,
      is_manager: true,
      state: "purge",
    });
    expect(bad.ok).toBe(false);
    if (bad.ok === false) expect(bad.code).toBe("INVALID_REQUEST");

    // NOTHING was written by any refusal.
    const row = await prisma.workLedgerEntry.findUnique({ where: { ledger_entry_id: ledgerId } });
    expect((row!.details as Record<string, unknown>).context_relevance).toBeUndefined();
    const liveRow = await prisma.workLedgerEntry.findUnique({
      where: { ledger_entry_id: live.entry.ledger_entry_id },
    });
    expect((liveRow!.details as Record<string, unknown>).context_relevance).toBeUndefined();
    expect(
      await prisma.auditEvent.count({ where: { event_type: "SEEDED_CONTEXT_VALIDATED" } }),
    ).toBe(0);
  });

  it("the free-text note is trimmed and capped at 280 characters", async () => {
    const ledgerId = await seedDocumentRow();
    const r = await validateSeededContextRelevance({
      ledger_entry_id: ledgerId,
      org_entity_id: orgId,
      caller_entity_id: adminId,
      is_manager: true,
      state: "stale",
      note: `  ${"x".repeat(500)}  `,
    });
    expect(r.ok).toBe(true);
    const row = await prisma.workLedgerEntry.findUnique({ where: { ledger_entry_id: ledgerId } });
    const cr = (row!.details as Record<string, unknown>).context_relevance as Record<string, unknown>;
    expect((cr.note as string).length).toBe(280);
  });
});
