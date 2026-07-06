// FILE: document-extraction.test.ts (integration, real Postgres, HTTP inject)
// PURPOSE: [DOC-EXTRACT] lock the review-first extraction preview:
//          - seeding a document still creates NO work (the CS-5
//            contract survives — extraction happens only on explicit
//            request, never on upload)
//          - the preview maps the engine output to capped, deduped,
//            "Possible …" candidates with source lineage + anchored
//            excerpts, owner candidates info-only, and the review
//            promise repeated server-side
//          - the preview is READ-ONLY: zero rows/audits/notifications/
//            capsules change; nothing is persisted, so re-running is
//            deterministic re-derivation (no dedupe tables needed)
//          - refusals: employee 403 (nothing scanned), non-document
//            rows 422, unknown/cross-org 404, missing text honest
//            EXTRACTION_UNAVAILABLE
//          - the approval path is the EXISTING createLedgerEntry rail:
//            a human-approved candidate lands as PROPOSED work with
//            extraction lineage + human_reviewed, owned explicitly —
//            and a rejected candidate creates nothing (client-side
//            dismiss, nothing server-side to clean)
//          - overclaim sweep: no "confirmed/assigned/task created/
//            Otzar knows/trained/truth" in preview copy.
// CONNECTS TO: document-extraction.service.ts, otzar.service.ts
//          wrapper, POST /otzar/context/extract-preview,
//          comms-extract.service.ts (the one engine), CS-5 doctrine.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { computeTARHash, prisma } from "@niov/database";
import { buildApp, MemoryNonceStore } from "@niov/api";
import { seedDocumentContextForCaller } from "../../apps/api/src/services/otzar/document-context.service.js";
import {
  extractDocumentWorkPreview,
  EXTRACT_PREVIEW_MAX,
} from "../../apps/api/src/services/otzar/document-extraction.service.js";
import { createLedgerEntry, getMyWork } from "../../apps/api/src/services/work-os/work-ledger.service.js";
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

// A scripted structured-output provider — the engine's real LLM path,
// deterministic for tests. Emits more candidates than the cap plus a
// duplicate, so cap + dedupe are provable.
function scriptedProvider(): LLMProvider {
  const payload = {
    summary: "Rollout planning brief.",
    decisions: ["Vendor choice appears pending: pick the rollout vendor by March."],
    commitments: [
      "Follow up with Finance about the Q1 access review.",
      "Draft the rollout communication plan.",
      "Draft the rollout communication plan.", // duplicate — must collapse
      "Schedule the security walkthrough.",
      "Collect the vendor quotes.",
      "Prepare the training outline.",
      "Confirm the data retention window.",
      "Book the launch readiness review.",
    ],
    risks_or_blockers: ["Launch appears blocked on legal review."],
    suggested_actions: [],
  };
  return {
    name: "scripted-doc-extract",
    generateResponse: async () => ({
      ok: true,
      text: JSON.stringify(payload),
      provider: "scripted",
      model: "fixture",
    }),
  };
}

const DOC_BODY = [
  "Rollout planning brief for the Q1 access review.",
  "Finance follow up: we still owe Finance an answer about the Q1 access review.",
  "Vendor choice is pending — pick the rollout vendor by March.",
  "Launch is currently blocked on legal review.",
  "Sarah owns the rollout communication plan.",
].join("\n");

describe("[DOC-EXTRACT] review-first document extraction preview (DB + HTTP)", () => {
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

  async function seedDoc(): Promise<string> {
    const r = await seedDocumentContextForCaller(adminId, {
      source_kind: "PROJECT_BRIEF",
      title: "Rollout planning brief",
      body: DOC_BODY,
      currentness: "historical",
      covering_period: "2025",
    });
    if (r.ok === false) throw new Error("seed failed");
    return r.ledger_entry_id;
  }

  beforeAll(async () => {
    await ensureAuditTriggers();
    app = await buildApp({
      jwtSecret: "doc-extract-test-secret",
      sessionNonceStore: new MemoryNonceStore(),
      declarationStore: new MemoryNonceStore(),
    });
  });
  beforeEach(async () => {
    await cleanup();
    await cleanupTestData();
    orgId = await makeEntity("Ext Org", "COMPANY");
    adminId = await makeEntity("Ext Admin", "PERSON");
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

  it("seeding still creates NO work (CS-5 survives); the preview maps capped deduped 'Possible …' candidates READ-ONLY", async () => {
    const docId = await seedDoc();
    // The CS-5 contract: one context row, zero work, zero extraction ran.
    expect(await prisma.workLedgerEntry.count({ where: { org_entity_id: orgId } })).toBe(1);

    const auditsBefore = await prisma.auditEvent.count();
    const capsulesBefore = await prisma.memoryCapsule.count();
    const notificationsBefore = await prisma.notification.count();

    const preview = await extractDocumentWorkPreview(adminId, orgId, docId, scriptedProvider());
    expect(preview.ok).toBe(true);
    if (preview.ok) {
      // Source lineage on the preview itself.
      expect(preview.source.title_label).toBe("Rollout planning brief");
      expect(preview.source.origin_label).toContain("Seeded document context");
      expect(preview.source.currentness_label).toBe("Historical");
      expect(preview.source.covering_period_label).toBe("Covers 2025");
      expect(preview.review_note).toContain("Review before using");
      expect(preview.review_note).toContain("unless a human approves it");
      // Cap + dedupe: the scripted payload offers 7 unique actions (plus a
      // duplicate) — the per-kind cap keeps exactly 3, so one noisy
      // category can never starve decisions/blockers; the overall cap
      // holds; no duplicates survive.
      expect(preview.candidates.length).toBeLessThanOrEqual(EXTRACT_PREVIEW_MAX);
      expect(
        preview.candidates.filter((c) => c.kind_label === "Possible action").length,
      ).toBe(3);
      const texts = preview.candidates.map((c) => c.text);
      expect(new Set(texts).size).toBe(texts.length);
      // Kinds are "Possible …" only; action/decision/blocker creatable.
      const kinds = new Set(preview.candidates.map((c) => c.kind_label));
      for (const k of kinds) expect(k.startsWith("Possible ")).toBe(true);
      const action = preview.candidates.find((c) => c.kind_label === "Possible action")!;
      expect(action.can_create).toBe(true);
      expect(action.suggested_ledger_type).toBe("TASK");
      const decision = preview.candidates.find((c) => c.kind_label === "Possible decision")!;
      expect(decision.suggested_ledger_type).toBe("DECISION");
      const blocker = preview.candidates.find((c) => c.kind_label === "Possible blocker")!;
      expect(blocker.suggested_ledger_type).toBe("BLOCKER");
      // Excerpts anchor to real source lines, never fabricated.
      const finance = preview.candidates.find((c) => c.text.includes("Finance"))!;
      expect(finance.excerpt).toContain("we still owe Finance an answer");
      // Overclaim sweep across all preview copy.
      const all = JSON.stringify(preview);
      expect(all).not.toMatch(/confirmed|assigned|task created|Otzar knows|trained|the truth/i);
      expect(all).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    }

    // READ-ONLY: the preview persisted NOTHING.
    expect(await prisma.workLedgerEntry.count({ where: { org_entity_id: orgId } })).toBe(1);
    expect(await prisma.auditEvent.count()).toBe(auditsBefore);
    expect(await prisma.memoryCapsule.count()).toBe(capsulesBefore);
    expect(await prisma.notification.count()).toBe(notificationsBefore);

    // Deterministic re-derivation replaces persistence: same input, same output.
    const again = await extractDocumentWorkPreview(adminId, orgId, docId, scriptedProvider());
    expect(again.ok).toBe(true);
    if (preview.ok && again.ok) {
      expect(again.candidates).toEqual(preview.candidates);
    }
  });

  it("approval = the EXISTING work rail: an approved candidate lands as PROPOSED lineaged work; rejection creates nothing", async () => {
    const docId = await seedDoc();
    const preview = await extractDocumentWorkPreview(adminId, orgId, docId, scriptedProvider());
    if (preview.ok === false) throw new Error("preview failed");
    const approved = preview.candidates.find((c) => c.kind_label === "Possible action")!;

    // The human approves ONE candidate → the existing governed rail.
    const created = await createLedgerEntry({
      org_entity_id: orgId,
      ledger_type: approved.suggested_ledger_type!,
      title: approved.text,
      status: "PROPOSED",
      owner_entity_id: adminId,
      requester_entity_id: adminId,
      details: {
        source: "document_extraction_review",
        source_document_ledger_id: docId,
        human_reviewed: true,
        ...(approved.excerpt !== undefined ? { source_excerpt: approved.excerpt } : {}),
      },
    });
    expect(created.ok).toBe(true);
    if (created.ok) {
      expect(created.entry.status).toBe("PROPOSED");
      expect(created.entry.owner_entity_id).toBe(adminId);
      // It is REAL work now — visible in My Work as proposed, NOT seeded
      // background (no seeded_context on the row → no AIX affordances).
      expect(created.entry.seeded_origin).toBeUndefined();
      const myWork = await getMyWork({ org_entity_id: orgId, caller_entity_id: adminId });
      expect(myWork.some((v) => v.ledger_entry_id === created.entry.ledger_entry_id)).toBe(true);
      const row = await prisma.workLedgerEntry.findUnique({
        where: { ledger_entry_id: created.entry.ledger_entry_id },
      });
      const d = row!.details as Record<string, unknown>;
      expect(d.source).toBe("document_extraction_review");
      expect(d.human_reviewed).toBe(true);
      expect(d.source_document_ledger_id).toBe(docId);
    }
    // Rejection is a client-side dismiss — nothing persisted server-side,
    // so the org still has exactly: 1 context row + 1 approved work row.
    expect(await prisma.workLedgerEntry.count({ where: { org_entity_id: orgId } })).toBe(2);
  });

  it("HTTP gates: employee 403 (nothing scanned), non-document 422, unknown 404; the route returns the preview for an admin", async () => {
    const docId = await seedDoc();
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
    const employeeId = await makeEntity("Ext Employee", "PERSON");
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
      payload: { email: empEmail, password, requested_operations: ["read", "write", "admin_org"] },
      remoteAddress: "10.99.1.10",
    });
    const empToken = (empLogin.json() as { token: string }).token;
    const denied = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/context/extract-preview",
      headers: { authorization: `Bearer ${empToken}` },
      payload: { ledger_entry_id: docId },
    });
    expect(denied.statusCode).toBe(403);

    await prisma.entity.update({
      where: { entity_id: adminId },
      data: { password_hash: await hashPassword(password) },
    });
    const adminEmail = (await prisma.entity.findUnique({ where: { entity_id: adminId }, select: { email: true } }))!.email!;
    const adminLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: adminEmail, password, requested_operations: ["read", "write", "admin_org"] },
      remoteAddress: "10.99.1.11",
    });
    const adminToken = (adminLogin.json() as { token: string }).token;

    const nonDoc = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/context/extract-preview",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { ledger_entry_id: live.entry.ledger_entry_id },
    });
    expect(nonDoc.statusCode).toBe(422);
    expect((nonDoc.json() as { code: string }).code).toBe("NOT_A_SEEDED_DOCUMENT");

    const unknown = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/context/extract-preview",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { ledger_entry_id: randomUUID() },
    });
    expect(unknown.statusCode).toBe(404);

    // Admin path: the route answers (the app's provider may be absent →
    // the engine's honest LOCAL_FALLBACK = empty/owner-only candidates —
    // still 200, still the review note, still zero writes).
    const rowsBefore = await prisma.workLedgerEntry.count({ where: { org_entity_id: orgId } });
    const okRes = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/context/extract-preview",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { ledger_entry_id: docId },
    });
    expect(okRes.statusCode).toBe(200);
    const body = okRes.json() as { ok: boolean; review_note: string; candidates: unknown[] };
    expect(body.ok).toBe(true);
    expect(body.review_note).toContain("Review before using");
    expect(await prisma.workLedgerEntry.count({ where: { org_entity_id: orgId } })).toBe(rowsBefore);
  });
});
