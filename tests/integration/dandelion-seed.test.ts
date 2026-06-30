// FILE: dandelion-seed.test.ts (integration, real Postgres)
// PURPOSE: The admin-governed Dandelion seed lifecycle: list (tenant-isolated),
//          approve (creates a setup action, NEVER grants access), reject (records
//          the correction), hold (visible but inactive). Seeds persist as
//          ORG_SEEDING WorkLedgerEntry rows — no duplicate model.
// CONNECTS TO: services/otzar/dandelion-seed.service.ts, work-os/work-ledger.service.ts.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@niov/database";
import { listOrgSeeds, approveSeed, rejectSeed, holdSeed } from "@niov/api";
import { createLedgerEntry } from "../../apps/api/src/services/work-os/work-ledger.service.js";
import { createEntity } from "../../packages/database/src/queries/entity.js";
import { ensureAuditTriggers, cleanupTestData } from "../helpers.js";

const TEST_PREFIX = "__niov_test__dandelion_seed__";

async function makeEntity(name: string, type: "PERSON" | "COMPANY"): Promise<string> {
  const e = await createEntity({
    email: `${TEST_PREFIX}${name.toLowerCase().replace(/\s/g, ".")}@niov-test.com`,
    public_key: `-----BEGIN PUBLIC KEY-----\n${name}\n-----END PUBLIC KEY-----`,
    display_name: `${TEST_PREFIX} ${name}`,
    entity_type: type,
    clearance_level: 3,
    status: "ACTIVE",
  });
  return e.entity_id;
}

async function seed(orgId: string, seedType = "grant_tool_access"): Promise<string> {
  const r = await createLedgerEntry({
    org_entity_id: orgId,
    ledger_type: "ORG_SEEDING",
    source_type: "TRANSCRIPT",
    title: "GitHub access needed for David's repo work",
    status: "SEED_NEEDS_REVIEW",
    extraction_source: "TYPESCRIPT_DETERMINISTIC",
    evidence: [{ quote: "David owns the repo access work" }],
    details: {
      seed_type: seedType,
      subject_name: "David",
      recommended_action: "GitHub is needed but isn't ready — an admin should connect/authorize it.",
      source_conversation_id: "conv-1",
      confidence: "high",
      approval_required: true,
      policy_status: "needs_review",
      scope: "org",
      sensitivity: "internal",
      risk_if_ignored: "The committed work is blocked until the tool is connected.",
    },
  });
  if (!r.ok) throw new Error("seed create failed");
  return r.entry.ledger_entry_id;
}

async function cleanup(): Promise<void> {
  const ents = await prisma.entity.findMany({ where: { display_name: { startsWith: TEST_PREFIX } }, select: { entity_id: true } });
  const ids = ents.map((e) => e.entity_id);
  if (ids.length > 0) await prisma.workLedgerEntry.deleteMany({ where: { org_entity_id: { in: ids } } });
}

describe("dandelion seed — admin approve/reject/hold lifecycle (DB)", () => {
  let orgA = "";
  let orgB = "";
  let adminId = "";

  beforeEach(async () => {
    await ensureAuditTriggers();
    await cleanup();
    await cleanupTestData();
    orgA = await makeEntity("Org A", "COMPANY");
    orgB = await makeEntity("Org B", "COMPANY");
    adminId = await makeEntity("Admin", "PERSON");
  });
  afterAll(async () => { await cleanup(); await cleanupTestData(); await prisma.$disconnect(); });

  it("lists an org's seeds with evidence; another org's seeds are NOT visible (tenant isolation)", async () => {
    await seed(orgA);
    await seed(orgB);
    const a = await listOrgSeeds(orgA);
    expect(a).toHaveLength(1);
    expect(a[0]!.seed_type).toBe("grant_tool_access");
    expect(a[0]!.source_evidence).toMatch(/repo access/);
    expect(a[0]!.approval_required).toBe(true);
    expect(a[0]!.status).toBe("SEED_NEEDS_REVIEW");
    // Cross-tenant: orgA's queue never shows orgB's seed.
    const aIds = a.map((s) => s.seed_id);
    const b = await listOrgSeeds(orgB);
    expect(b).toHaveLength(1);
    expect(aIds).not.toContain(b[0]!.seed_id);
  });

  it("APPROVE creates a setup-required action and does NOT grant access", async () => {
    const id = await seed(orgA, "grant_tool_access");
    const res = await approveSeed({ seedId: id, orgEntityId: orgA, adminEntityId: adminId });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.seed.status).toBe("SEED_APPROVED");
    expect(res.seed.resulting_action).toMatch(/setup action created/i);
    expect(res.seed.resulting_action).toMatch(/not granted automatically/i);
    // A setup-required TASK exists, awaiting approval — NOT an executed grant.
    const setup = await prisma.workLedgerEntry.findFirst({
      where: { org_entity_id: orgA, ledger_type: "TASK", source_type: "CONNECTOR" },
    });
    expect(setup).not.toBeNull();
    expect(setup!.status).toBe("NEEDS_APPROVAL");
    expect((setup!.details as { from_seed_id?: string }).from_seed_id).toBe(id);
    // No connector binding / grant was created (nothing auto-applied).
    const bindings = await prisma.connectorBinding.findMany({ where: { org_entity_id: orgA } });
    expect(bindings).toHaveLength(0);
    // An audit event was written.
    const audit = await prisma.auditEvent.findFirst({ where: { actor_entity_id: adminId, event_type: "ADMIN_ACTION" }, orderBy: { timestamp: "desc" } });
    expect((audit?.details as { action?: string } | null)?.action).toBe("DANDELION_SEED_APPROVED");
  });

  it("REJECT records the reason + audit; HOLD keeps it visible but inactive", async () => {
    const r1 = await seed(orgA);
    const rej = await rejectSeed({ seedId: r1, orgEntityId: orgA, adminEntityId: adminId, reason: "David already has access." });
    expect(rej.ok).toBe(true);
    if (rej.ok) {
      expect(rej.seed.status).toBe("SEED_REJECTED");
      expect(rej.seed.rejection_reason).toMatch(/already has access/i);
    }
    const r2 = await seed(orgA);
    const held = await holdSeed({ seedId: r2, orgEntityId: orgA, adminEntityId: adminId, reason: "Revisit next sprint." });
    expect(held.ok).toBe(true);
    if (held.ok) expect(held.seed.status).toBe("SEED_HELD");
    // Held + rejected seeds remain in the queue (status persists, still visible).
    const all = await listOrgSeeds(orgA);
    const statuses = all.map((s) => s.status).sort();
    expect(statuses).toContain("SEED_REJECTED");
    expect(statuses).toContain("SEED_HELD");
  });

  it("acting on a seed from another tenant is NOT_FOUND (no cross-tenant write)", async () => {
    const id = await seed(orgA);
    const res = await approveSeed({ seedId: id, orgEntityId: orgB, adminEntityId: adminId });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("NOT_FOUND");
  });
});
