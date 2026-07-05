// FILE: context-candidates.test.ts (integration, real Postgres, HTTP inject)
// PURPOSE: [AIX-3] lock derived-only deterministic candidate relevance:
//          a manager viewing a work row gets at most 3 "may relate —
//          needs confirmation" candidates from seeded documents, ONLY on
//          strong deterministic signals (≥2 shared title tokens, or an
//          internal participant's full name in the seeded text); a year
//          overlap alone NEVER creates a candidate; external names alone
//          NEVER create a candidate; AIX-2 human validation feeds back
//          (stale/wrong_scope/contradicted suppressed; confirmed keeps
//          its label); non-managers get silence (the pool is ownerless
//          org-wide context); cross-org is NOT_FOUND; seeded rows get no
//          candidates about other context; the endpoint is READ-ONLY
//          (zero rows/details/audits/notifications/capsules change);
//          the projection carries customer-safe labels with no raw
//          internal states and no overclaim vocabulary.
// CONNECTS TO: context-candidates.service.ts, GET
//          /work-os/ledger/:id/context-candidates, AIX doctrine Part 7,
//          context-relevance.service.ts (AIX-2 suppression input).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { computeTARHash, prisma } from "@niov/database";
import { buildApp, MemoryNonceStore } from "@niov/api";
import { seedDocumentContextForCaller } from "../../apps/api/src/services/otzar/document-context.service.js";
import { validateSeededContextRelevance } from "../../apps/api/src/services/work-os/context-relevance.service.js";
import {
  deriveContextRelevanceCandidates,
  getContextCandidatesForLedgerEntry,
} from "../../apps/api/src/services/work-os/context-candidates.service.js";
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

describe("[AIX-3] derived candidate relevance (DB + HTTP)", () => {
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
      jwtSecret: "aix3-context-candidates-test-secret",
      sessionNonceStore: new MemoryNonceStore(),
      declarationStore: new MemoryNonceStore(),
    });
  });
  beforeEach(async () => {
    await cleanup();
    await cleanupTestData();
    orgId = await makeEntity("Cand Org", "COMPANY");
    adminId = await makeEntity("Cand Admin", "PERSON");
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

  it("HTTP: strong title overlap surfaces at most 3 confirmation-first candidates; READ-ONLY end to end", async () => {
    // Four overlapping documents (cap check) + one unrelated.
    await seedDoc("Phoenix escalation runbook", "Escalation steps for Phoenix launch.", "2026");
    await seedDoc("Phoenix escalation checklist", "Checklist for Phoenix escalation duty.");
    await seedDoc("Phoenix escalation contacts", "Who to call for Phoenix escalation.");
    await seedDoc("Phoenix escalation postmortems", "Past Phoenix escalation reviews.");
    await seedDoc("Quarterly parking rota", "Rotation for garage spots.");
    const workId = await makeWorkRow("Handle the Phoenix escalation backlog", adminId);

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
      payload: { email, password, requested_operations: ["read", "write"] },
      remoteAddress: "10.97.1.10",
    });
    const token = (login.json() as { token: string }).token;

    // Snapshot AFTER login (login itself audits) — the candidates read
    // must change nothing from here.
    const auditsBefore = await prisma.auditEvent.count();
    const capsulesBefore = await prisma.memoryCapsule.count();
    const notificationsBefore = await prisma.notification.count();
    const rowsBefore = await prisma.workLedgerEntry.count({ where: { org_entity_id: orgId } });

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/work-os/ledger/${workId}/context-candidates`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean; candidates: Array<Record<string, unknown>> };
    expect(body.ok).toBe(true);
    // Noise cap: 4 matches → exactly 3 surface; the parking rota never does.
    expect(body.candidates.length).toBe(3);
    const raw = JSON.stringify(body.candidates);
    expect(raw).not.toContain("parking");
    for (const c of body.candidates) {
      expect(c.status_label).toBe("May relate to this work — needs confirmation");
      expect(String(c.reason_label)).toContain("Background until confirmed");
      expect(String(c.origin_label)).toContain("Seeded document context");
    }
    // No raw internal states, no overclaim vocabulary.
    expect(raw).not.toMatch(/candidate_needs_confirmation|suppressed_|deterministic_aix|human_validation|wrong_scope/);
    expect(raw).not.toMatch(/AI knows|current truth|assigned|trained/i);

    // READ-ONLY: nothing anywhere changed.
    expect(await prisma.auditEvent.count()).toBe(auditsBefore);
    expect(await prisma.memoryCapsule.count()).toBe(capsulesBefore);
    expect(await prisma.notification.count()).toBe(notificationsBefore);
    expect(await prisma.workLedgerEntry.count({ where: { org_entity_id: orgId } })).toBe(rowsBefore);
  });

  it("participant full-name match is strong; year overlap alone and external names alone are NOT candidates", async () => {
    const adminName = (await prisma.entity.findUnique({
      where: { entity_id: adminId },
      select: { display_name: true },
    }))!.display_name!;
    // Names the work owner (an internal participant) — strong signal.
    await seedDoc("Escalation ownership history", `${adminName} agreed to own escalations going forward.`);
    // Only a matching year — supporting signal alone, never a candidate.
    await seedDoc("Annual themes", "General direction notes.", String(new Date().getUTCFullYear()));
    // Only an external person's name — never a candidate (no name-only trust).
    await seedDoc("Vendor call notes", "Jordan Vale from Acme handles renewals.");
    const workId = await makeWorkRow("Prepare quarterly budget review", adminId);

    const r = await getContextCandidatesForLedgerEntry({
      ledger_entry_id: workId,
      org_entity_id: orgId,
      caller_entity_id: adminId,
      is_manager: true,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.candidates.length).toBe(1);
      expect(r.candidates[0]!.title_label).toBe("Escalation ownership history");
      expect(r.candidates[0]!.signal_labels.some((s) => s.includes("who is on this work"))).toBe(true);
    }
  });

  it("AIX-2 feedback loop: stale/wrong_scope/contradicted suppress; confirmed keeps its label; needs_clarifier surfaces", async () => {
    const staleId = await seedDoc("Phoenix launch plan draft", "Phoenix launch old plan.");
    const wrongId = await seedDoc("Phoenix launch vendor list", "Phoenix launch vendors.");
    const contraId = await seedDoc("Phoenix launch timeline", "Phoenix launch dates.");
    const confirmedId = await seedDoc("Phoenix launch runbook", "Phoenix launch steps.");
    const clarifierId = await seedDoc("Phoenix launch budget", "Phoenix launch costs.");
    const mark = (id: string, state: string): Promise<unknown> =>
      validateSeededContextRelevance({
        ledger_entry_id: id, org_entity_id: orgId, caller_entity_id: adminId,
        is_manager: true, state,
      });
    await mark(staleId, "stale");
    await mark(wrongId, "wrong_scope");
    await mark(contraId, "contradicted");
    await mark(confirmedId, "confirmed");
    await mark(clarifierId, "needs_clarifier");
    const workId = await makeWorkRow("Phoenix launch readiness check", adminId);

    const r = await getContextCandidatesForLedgerEntry({
      ledger_entry_id: workId, org_entity_id: orgId,
      caller_entity_id: adminId, is_manager: true,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const titles = r.candidates.map((c) => c.title_label);
      expect(titles).toContain("Phoenix launch runbook");
      expect(titles).toContain("Phoenix launch budget");
      expect(titles).not.toContain("Phoenix launch plan draft");
      expect(titles).not.toContain("Phoenix launch vendor list");
      expect(titles).not.toContain("Phoenix launch timeline");
      const confirmed = r.candidates.find((c) => c.title_label === "Phoenix launch runbook")!;
      expect(confirmed.status_label).toBe("Confirmed current");
      expect(confirmed.validation_guidance).toBe("Confirmed as current by your team.");
      const clarifier = r.candidates.find((c) => c.title_label === "Phoenix launch budget")!;
      expect(clarifier.status_label).toBe("Waiting on the right person");
    }
  });

  it("permissions: non-managers get silence; cross-org is NOT_FOUND; seeded rows get no candidates", async () => {
    const docId = await seedDoc("Phoenix escalation runbook", "Steps for Phoenix escalations.");
    const employeeId = await makeEntity("Cand Employee", "PERSON");
    await prisma.entityMembership.create({
      data: { parent_id: orgId, child_id: employeeId, is_active: true },
    });
    const workId = await makeWorkRow("Handle the Phoenix escalation backlog", employeeId);

    // The employee owns the work row and CAN see it — but the pool is
    // ownerless org-wide context they cannot open, so: silence.
    const emp = await getContextCandidatesForLedgerEntry({
      ledger_entry_id: workId, org_entity_id: orgId,
      caller_entity_id: employeeId, is_manager: false,
    });
    expect(emp.ok).toBe(true);
    if (emp.ok) expect(emp.candidates).toEqual([]);

    // Cross-org: enumeration-safe refusal on the target row.
    const otherOrg = await makeEntity("Cand Other Org", "COMPANY");
    const cross = await getContextCandidatesForLedgerEntry({
      ledger_entry_id: workId, org_entity_id: otherOrg,
      caller_entity_id: adminId, is_manager: true,
    });
    expect(cross.ok).toBe(false);

    // A seeded row asked about candidates: empty — context is never
    // suggested for context.
    const self = await getContextCandidatesForLedgerEntry({
      ledger_entry_id: docId, org_entity_id: orgId,
      caller_entity_id: adminId, is_manager: true,
    });
    expect(self.ok).toBe(true);
    if (self.ok) expect(self.candidates).toEqual([]);
  });

  it("pure derivation: one shared token is not enough; non-seeded pool rows are ignored", () => {
    const target = {
      title: "Handle the Phoenix escalation backlog",
      created_at: new Date("2026-07-01T00:00:00Z"),
      participant_names: [],
    };
    // One shared significant token ("phoenix") only → no candidate.
    const weak = deriveContextRelevanceCandidates(target, [
      {
        ledger_entry_id: "row-1",
        title: "Phoenix retrospective",
        summary: "General reflections.",
        details: { seeded_context: { provided_by: "x" } },
      },
    ]);
    expect(weak).toEqual([]);
    // A non-seeded row can never be a candidate even with full overlap.
    const nonSeeded = deriveContextRelevanceCandidates(target, [
      {
        ledger_entry_id: "row-2",
        title: "Handle the Phoenix escalation backlog",
        summary: "Same words entirely.",
        details: { source: "slack_ingest" },
      },
    ]);
    expect(nonSeeded).toEqual([]);
  });
});
