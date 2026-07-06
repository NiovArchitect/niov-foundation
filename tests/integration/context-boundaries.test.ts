// FILE: context-boundaries.test.ts (integration, real Postgres, HTTP inject)
// PURPOSE: [CTX-BOUNDARY] lock the admin boundary projection: counts are
//          exact and category-faithful (seeded history vs seeded
//          documents vs human-reviewed extracted work vs plain live
//          work), recent documents carry AIX-1 labels only (never
//          bodies, ids, or enums), the read is READ-ONLY, employees get
//          an honest 403 (a boundary view is admin governance), and
//          tenants are isolated (another org's context never counts).
// CONNECTS TO: context-boundaries.service.ts, GET
//          /work-os/context/boundaries, CT /setup/context-boundaries.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { computeTARHash, prisma } from "@niov/database";
import { buildApp, MemoryNonceStore } from "@niov/api";
import { seedDocumentContextForCaller } from "../../apps/api/src/services/otzar/document-context.service.js";
import { getContextBoundaries } from "../../apps/api/src/services/work-os/context-boundaries.service.js";
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

describe("[CTX-BOUNDARY] admin context-boundary projection (DB + HTTP)", () => {
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

  beforeAll(async () => {
    await ensureAuditTriggers();
    app = await buildApp({
      jwtSecret: "ctx-boundary-test-secret",
      sessionNonceStore: new MemoryNonceStore(),
      declarationStore: new MemoryNonceStore(),
    });
  });
  beforeEach(async () => {
    await cleanup();
    await cleanupTestData();
    orgId = await makeEntity("Bnd Org", "COMPANY");
    adminId = await makeEntity("Bnd Admin", "PERSON");
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

  it("counts are exact + category-faithful; recent documents are labels only; the read is READ-ONLY", async () => {
    // 2 seeded documents.
    for (const [title, currentness] of [
      ["Support escalation SOP", "historical"],
      ["Leave policy", "current"],
    ] as const) {
      const r = await seedDocumentContextForCaller(adminId, {
        source_kind: "SOP",
        title,
        body: "Reference material.",
        currentness,
        covering_period: "2025",
      });
      if (r.ok === false) throw new Error("seed failed");
    }
    // 1 seeded-history work item (CS-1 shape: seeded lineage, non-document).
    const hist = await createLedgerEntry({
      org_entity_id: orgId,
      ledger_type: "COMMITMENT",
      source_type: "MEETING",
      title: "Old seeded commitment",
      status: "VERIFIED",
      owner_entity_id: adminId,
      requester_entity_id: adminId,
      details: {
        source: "transcript_ingest",
        seeded_context: { provided_by: adminId, covering_period: "2024", seeded_at: new Date().toISOString() },
      },
    });
    if (hist.ok === false) throw new Error("create failed");
    // 1 human-reviewed extracted item (DOC-EXTRACT approval lineage).
    const approved = await createLedgerEntry({
      org_entity_id: orgId,
      ledger_type: "TASK",
      title: "Follow up with Finance",
      status: "PROPOSED",
      owner_entity_id: adminId,
      requester_entity_id: adminId,
      details: {
        source: "document_extraction_review",
        source_document_ledger_id: randomUUID(),
        human_reviewed: true,
      },
    });
    if (approved.ok === false) throw new Error("create failed");
    // 1 plain live task — counts in NO boundary bucket.
    const plain = await createLedgerEntry({
      org_entity_id: orgId,
      ledger_type: "TASK",
      title: "Plain live task",
      owner_entity_id: adminId,
      requester_entity_id: adminId,
    });
    if (plain.ok === false) throw new Error("create failed");

    const rowsBefore = await prisma.workLedgerEntry.count({ where: { org_entity_id: orgId } });
    const auditsBefore = await prisma.auditEvent.count();

    const b = await getContextBoundaries(orgId);
    expect(b.seeded_history_count).toBe(1);
    expect(b.seeded_document_count).toBe(2);
    expect(b.extracted_reviewed_count).toBe(1);
    expect(b.recent_documents.length).toBe(2);
    const titles = b.recent_documents.map((d) => d.title_label);
    expect(titles).toContain("Support escalation SOP");
    expect(titles).toContain("Leave policy");
    for (const d of b.recent_documents) {
      expect(d.origin_label).toContain("Seeded document context");
      expect(d.covering_period_label).toBe("Covers 2025");
      expect(d.seeded_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    // Labels only — no bodies, ids, enums, or raw metadata cross.
    const raw = JSON.stringify(b);
    expect(raw).not.toContain("Reference material");
    expect(raw).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(raw).not.toMatch(/DOCUMENT_CONTEXT|seeded_context|source_lineage|VERIFIED|PROPOSED|document_extraction_review/);

    // READ-ONLY.
    expect(await prisma.workLedgerEntry.count({ where: { org_entity_id: orgId } })).toBe(rowsBefore);
    expect(await prisma.auditEvent.count()).toBe(auditsBefore);
  });

  it("HTTP: employees get an honest 403; admins get the projection; other tenants never leak in", async () => {
    // A second org with its own document — must never count for orgId.
    const otherOrg = await makeEntity("Bnd Other Org", "COMPANY");
    const otherAdmin = await makeEntity("Bnd Other Admin", "PERSON");
    await grantOrgAdmin(otherAdmin);
    await prisma.entityMembership.create({
      data: { parent_id: otherOrg, child_id: otherAdmin, is_active: true, is_admin: true },
    });
    const otherDoc = await seedDocumentContextForCaller(otherAdmin, {
      source_kind: "POLICY",
      title: "Other org policy",
      body: "Not yours.",
      currentness: "current",
    });
    if (otherDoc.ok === false) throw new Error("seed failed");

    const password = "correct-horse-battery";
    const { hashPassword } = await import("@niov/auth");
    const employeeId = await makeEntity("Bnd Employee", "PERSON");
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
      payload: { email: empEmail, password, requested_operations: ["read"] },
      remoteAddress: "10.100.1.10",
    });
    const empToken = (empLogin.json() as { token: string }).token;
    const denied = await app.inject({
      method: "GET",
      url: "/api/v1/work-os/context/boundaries",
      headers: { authorization: `Bearer ${empToken}` },
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
      payload: { email: adminEmail, password, requested_operations: ["read"] },
      remoteAddress: "10.100.1.11",
    });
    const adminToken = (adminLogin.json() as { token: string }).token;
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/work-os/context/boundaries",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean; boundaries: { seeded_document_count: number; recent_documents: Array<{ title_label: string }> } };
    expect(body.ok).toBe(true);
    // Tenant isolation: the other org's document never counts or lists.
    expect(body.boundaries.seeded_document_count).toBe(0);
    expect(JSON.stringify(body.boundaries)).not.toContain("Other org policy");
  });
});
