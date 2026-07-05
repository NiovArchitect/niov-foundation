// FILE: document-context.test.ts (integration, real Postgres, HTTP inject)
// PURPOSE: [CS-5] lock the document-context adapter: one seeded document =
//          exactly one durable capture + ONE VERIFIED ownerless
//          DOCUMENT_CONTEXT row with full seeded/document lineage and
//          extract_work:false recorded on the row — ZERO work items, ZERO
//          follow-up cards, ZERO Dandelion seeds, ZERO personal-wallet
//          capsules, ZERO external collaborators, absent from open work;
//          normalization refuses bad kinds/lengths honestly; the route is
//          admin-gated (employee 403, nothing created).
// CONNECTS TO: document-context.service.ts, otzar.service.ts wrapper,
//          POST /otzar/context/seed-document, Gap V doctrine CS-5.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { computeTARHash, prisma } from "@niov/database";
import { buildApp, MemoryNonceStore } from "@niov/api";
import {
  DOCUMENT_BODY_MAX,
  normalizeDocumentContextSeed,
  seedDocumentContextForCaller,
} from "../../apps/api/src/services/otzar/document-context.service.js";
import { getMyWork } from "../../apps/api/src/services/work-os/work-ledger.service.js";
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

describe("[CS-5] document-context adapter (DB + HTTP)", () => {
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
      jwtSecret: "cs5-doc-context-test-secret",
      sessionNonceStore: new MemoryNonceStore(),
      declarationStore: new MemoryNonceStore(),
    });
  });
  beforeEach(async () => {
    await cleanup();
    await cleanupTestData();
    orgId = await makeEntity("Doc Org", "COMPANY");
    adminId = await makeEntity("Doc Admin", "PERSON");
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

  it("normalization: bad kind / missing title / oversize body / bad currentness refuse with human copy", () => {
    expect("error" in normalizeDocumentContextSeed({ source_kind: "EVERYTHING", title: "t", body: "b", currentness: "current" })).toBe(true);
    expect("error" in normalizeDocumentContextSeed({ source_kind: "SOP", title: "", body: "b", currentness: "current" })).toBe(true);
    expect("error" in normalizeDocumentContextSeed({ source_kind: "SOP", title: "t", body: "x".repeat(DOCUMENT_BODY_MAX + 1), currentness: "current" })).toBe(true);
    expect("error" in normalizeDocumentContextSeed({ source_kind: "SOP", title: "t", body: "b", currentness: "sometimes" })).toBe(true);
    const good = normalizeDocumentContextSeed({
      source_kind: "POLICY", title: "  Leave policy ", body: " Everyone gets rest. ",
      currentness: "historical", covering_period: " 2024 ",
    });
    expect("error" in good).toBe(false);
    if (!("error" in good)) {
      expect(good.title).toBe("Leave policy");
      expect(good.covering_period).toBe("2024");
    }
  });

  it("one document = capture + ONE VERIFIED ownerless lineaged context row — zero work/follow-ups/seeds/capsules/external, absent from open work", async () => {
    const capsulesBefore = await prisma.memoryCapsule.count();
    const body =
      "Our support SOP: David owns escalations and Jordan Vale from Acme handles vendor renewals. Always respond within one day.";
    const r = await seedDocumentContextForCaller(adminId, {
      source_kind: "SOP",
      title: "Support escalation SOP",
      body,
      currentness: "historical",
      covering_period: "2025",
    });
    if (r.ok === false) throw new Error(`expected ok: ${JSON.stringify(r)}`);

    const rows = await prisma.workLedgerEntry.findMany({ where: { org_entity_id: orgId } });
    expect(rows.length).toBe(1); // exactly ONE row — no work items, no seeds, no follow-ups
    const row = rows[0]!;
    expect(row.ledger_entry_id).toBe(r.ledger_entry_id);
    expect(row.ledger_type).toBe("DOCUMENT_CONTEXT");
    expect(row.status).toBe("VERIFIED");
    expect(row.owner_entity_id).toBeNull();
    expect(row.next_action).toBeNull();
    const d = row.details as Record<string, unknown>;
    const sc = d.seeded_context as Record<string, unknown>;
    expect(sc.provided_by).toBe(adminId);
    expect(sc.covering_period).toBe("2025");
    const doc = d.document as Record<string, unknown>;
    expect(doc.source_kind).toBe("SOP");
    expect(doc.currentness).toBe("historical");
    expect(doc.extract_work).toBe(false);
    // The durable capture exists and holds the full text.
    const capture = await prisma.meetingCapture.findUnique({
      where: { meeting_capture_id: r.meeting_capture_id },
    });
    expect(capture).not.toBeNull();

    // Boundaries: nothing personal, nothing external-trusted, nothing open.
    expect(await prisma.memoryCapsule.count()).toBe(capsulesBefore);
    expect(await prisma.externalCollaborator.count({ where: { org_entity_id: orgId } })).toBe(0);
    const myWork = await getMyWork({ org_entity_id: orgId, caller_entity_id: adminId });
    expect(myWork.filter((v) => v.status !== "VERIFIED").length).toBe(0);
  });

  it("HTTP: employee gets 403 with nothing created; admin seeds through the route", async () => {
    const password = "correct-horse-battery";
    const { hashPassword } = await import("@niov/auth");
    const employeeId = await makeEntity("Doc Employee", "PERSON");
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
      remoteAddress: "10.95.1.10",
    });
    const empToken = (empLogin.json() as { token: string }).token;
    const denied = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/context/seed-document",
      headers: { authorization: `Bearer ${empToken}` },
      payload: { source_kind: "SOP", title: "t", body: "b", currentness: "current" },
    });
    expect(denied.statusCode).toBe(403);
    expect(await prisma.workLedgerEntry.count({ where: { org_entity_id: orgId } })).toBe(0);

    await prisma.entity.update({
      where: { entity_id: adminId },
      data: { password_hash: await hashPassword(password) },
    });
    const adminEmail = (await prisma.entity.findUnique({ where: { entity_id: adminId }, select: { email: true } }))!.email!;
    const adminLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: adminEmail, password, requested_operations: ["read", "write", "admin_org"] },
      remoteAddress: "10.95.1.11",
    });
    const adminToken = (adminLogin.json() as { token: string }).token;
    const seeded = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/context/seed-document",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        source_kind: "DECISION_LOG",
        title: "2025 platform decisions",
        body: "We chose the governed spine over parallel stores.",
        currentness: "current",
      },
    });
    expect(seeded.statusCode).toBe(201);
    const bodyJson = seeded.json() as { ok: boolean; ledger_entry_id: string };
    expect(bodyJson.ok).toBe(true);
    expect(await prisma.workLedgerEntry.count({ where: { org_entity_id: orgId, ledger_type: "DOCUMENT_CONTEXT" } })).toBe(1);
  });
});
