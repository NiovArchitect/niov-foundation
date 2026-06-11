// FILE: compliance-sharing.test.ts
// PURPOSE: Phase 1233 — integration test for company-controlled
//          compliance share packages: create / list / revoke on the
//          company side, purpose-bound redacted evidence on the
//          regulator side, expiry handling, and the no-leak boundary.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@niov/database";
import { ensureAuditTriggers, cleanupTestData } from "../helpers.js";
import { createEntity } from "../../packages/database/src/queries/entity.js";
import {
  createSharePackageForCaller,
  getEvidenceForRegulator,
  listSharePackagesForCaller,
  revokeSharePackageForCaller,
} from "../../apps/api/src/services/compliance/compliance-sharing.service.js";

const TEST_PREFIX = "__niov_test__phase1233__";

function fakePublicKey(seed: string): string {
  return `-----BEGIN PUBLIC KEY-----\n${seed}\n-----END PUBLIC KEY-----`;
}

function futureIso(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

async function makeEntity(
  displayName: string,
  entityType: "PERSON" | "COMPANY" | "REGULATOR",
  clearance: number,
): Promise<string> {
  const e = await createEntity({
    email: `${TEST_PREFIX}${displayName.toLowerCase().replace(/\s/g, ".")}@niov-test.com`,
    public_key: fakePublicKey(displayName),
    display_name: `${TEST_PREFIX} ${displayName}`,
    entity_type: entityType,
    clearance_level: clearance,
    status: "ACTIVE",
  });
  return e.entity_id;
}

async function cleanupPackages(): Promise<void> {
  await prisma.complianceSharePackage.deleteMany({
    where: { purpose: { startsWith: TEST_PREFIX } },
  });
}

describe("Phase 1233 — compliance share packages", () => {
  let orgId = "";
  let adminId = "";
  let regularId = "";
  let regulatorId = "";
  let otherRegulatorId = "";

  beforeEach(async () => {
    await ensureAuditTriggers();
    await cleanupPackages();
    await cleanupTestData();
    orgId = await makeEntity("Sharing Org", "COMPANY", 5);
    adminId = await makeEntity("Sharing Admin", "PERSON", 4);
    regularId = await makeEntity("Sharing Regular", "PERSON", 3);
    regulatorId = await makeEntity("Sharing Regulator", "REGULATOR", 3);
    otherRegulatorId = await makeEntity("Other Regulator", "REGULATOR", 3);
    for (const childId of [adminId, regularId]) {
      await prisma.entityMembership.create({
        data: { parent_id: orgId, child_id: childId, is_active: true },
      });
    }
  });

  afterAll(async () => {
    await cleanupPackages();
    await cleanupTestData();
    await prisma.$disconnect();
  });

  async function createPackage(scopes: string[] = ["AUDIT_SUMMARY"]) {
    return createSharePackageForCaller({
      callerEntityId: adminId,
      regulatorEntityId: regulatorId,
      purpose: `${TEST_PREFIX} quarterly conduct review`,
      scopes,
      validUntil: futureIso(30),
    });
  }

  it("org admin creates a package; lifecycle audit is written", async () => {
    const r = await createPackage(["AUDIT_SUMMARY", "ACTION_COMPLIANCE"]);
    expect(r.ok).toBe(true);
    if (r.ok === false) throw new Error("expected ok");
    expect(r.package.org_entity_id).toBe(orgId);
    expect(r.package.regulator_entity_id).toBe(regulatorId);
    expect(r.package.status).toBe("ACTIVE");
    expect(r.package.scopes).toEqual(["AUDIT_SUMMARY", "ACTION_COMPLIANCE"]);
    expect(r.package.redaction_profile).toBe("METADATA_ONLY");

    const audit = await prisma.auditEvent.findFirst({
      where: {
        event_type: "COMPLIANCE_SHARE_PACKAGE_CREATED",
        actor_entity_id: adminId,
      },
      orderBy: { timestamp: "desc" },
    });
    expect(audit).not.toBeNull();
  });

  it("non-admin member cannot create or list packages", async () => {
    const create = await createSharePackageForCaller({
      callerEntityId: regularId,
      regulatorEntityId: regulatorId,
      purpose: `${TEST_PREFIX} should fail`,
      scopes: ["AUDIT_SUMMARY"],
      validUntil: futureIso(30),
    });
    expect(create).toEqual({ ok: false, code: "ADMIN_REQUIRED" });
    const list = await listSharePackagesForCaller(regularId);
    expect(list).toEqual({ ok: false, code: "ADMIN_REQUIRED" });
  });

  it("rejects unknown scopes, past valid_until, and non-regulator targets", async () => {
    const badScopes = await createSharePackageForCaller({
      callerEntityId: adminId,
      regulatorEntityId: regulatorId,
      purpose: `${TEST_PREFIX} bad scopes`,
      scopes: ["EVERYTHING"],
      validUntil: futureIso(30),
    });
    expect(badScopes.ok).toBe(false);
    if (badScopes.ok === false) expect(badScopes.code).toBe("INVALID_SCOPES");

    const pastValidity = await createSharePackageForCaller({
      callerEntityId: adminId,
      regulatorEntityId: regulatorId,
      purpose: `${TEST_PREFIX} past validity`,
      scopes: ["AUDIT_SUMMARY"],
      validUntil: new Date(Date.now() - 1000).toISOString(),
    });
    expect(pastValidity.ok).toBe(false);
    if (pastValidity.ok === false)
      expect(pastValidity.code).toBe("INVALID_VALID_UNTIL");

    const notRegulator = await createSharePackageForCaller({
      callerEntityId: adminId,
      regulatorEntityId: regularId,
      purpose: `${TEST_PREFIX} not a regulator`,
      scopes: ["AUDIT_SUMMARY"],
      validUntil: futureIso(30),
    });
    expect(notRegulator.ok).toBe(false);
    if (notRegulator.ok === false)
      expect(notRegulator.code).toBe("REGULATOR_REQUIRED");
  });

  it("addressed regulator reads redacted, scope-bound evidence; access is audited", async () => {
    const created = await createPackage(["AUDIT_SUMMARY", "MEMORY_LINEAGE"]);
    if (created.ok === false) throw new Error("expected ok");

    const r = await getEvidenceForRegulator({
      callerEntityId: regulatorId,
      packageId: created.package.package_id,
    });
    expect(r.ok).toBe(true);
    if (r.ok === false) throw new Error("expected ok");

    // Requested scopes are present...
    expect(r.evidence.audit_summary).toBeDefined();
    expect(r.evidence.memory_lineage).toBeDefined();
    // ...and unrequested scopes are absent (purpose-bound).
    expect(r.evidence.action_compliance).toBeUndefined();
    expect(r.evidence.connector_access).toBeUndefined();
    expect(r.evidence.onboarding_readiness).toBeUndefined();

    // Redaction boundary: recent events carry ONLY the safe triple.
    for (const entry of r.evidence.audit_summary?.recent_events ?? []) {
      expect(Object.keys(entry).sort()).toEqual([
        "event_type",
        "occurred_at",
        "outcome",
      ]);
    }
    const serialized = JSON.stringify(r.evidence);
    expect(serialized).not.toContain('"details"');
    expect(serialized).not.toContain("chain_hash");
    expect(serialized).not.toContain("payload_content");
    expect(serialized).not.toContain("payload_summary");

    // Access bookkeeping + audit.
    const row = await prisma.complianceSharePackage.findUnique({
      where: { package_id: created.package.package_id },
    });
    expect(row?.access_count).toBe(1);
    expect(row?.last_accessed_at).not.toBeNull();
    const audit = await prisma.auditEvent.findFirst({
      where: {
        event_type: "COMPLIANCE_SHARE_PACKAGE_ACCESSED",
        actor_entity_id: regulatorId,
      },
    });
    expect(audit).not.toBeNull();
  });

  it("a different regulator cannot read the package (no existence oracle)", async () => {
    const created = await createPackage();
    if (created.ok === false) throw new Error("expected ok");
    const r = await getEvidenceForRegulator({
      callerEntityId: otherRegulatorId,
      packageId: created.package.package_id,
    });
    expect(r).toEqual({ ok: false, code: "PACKAGE_NOT_FOUND" });
  });

  it("revocation cuts regulator access immediately; double revoke conflicts", async () => {
    const created = await createPackage();
    if (created.ok === false) throw new Error("expected ok");
    const revoked = await revokeSharePackageForCaller({
      callerEntityId: adminId,
      packageId: created.package.package_id,
      reason: "review concluded",
    });
    expect(revoked.ok).toBe(true);

    const read = await getEvidenceForRegulator({
      callerEntityId: regulatorId,
      packageId: created.package.package_id,
    });
    expect(read).toEqual({ ok: false, code: "PACKAGE_REVOKED" });

    const again = await revokeSharePackageForCaller({
      callerEntityId: adminId,
      packageId: created.package.package_id,
    });
    expect(again).toEqual({ ok: false, code: "ALREADY_REVOKED" });
  });

  it("a lapsed package flips to EXPIRED on first regulator touch and is refused", async () => {
    const created = await createPackage();
    if (created.ok === false) throw new Error("expected ok");
    await prisma.complianceSharePackage.update({
      where: { package_id: created.package.package_id },
      data: { valid_until: new Date(Date.now() - 60_000) },
    });
    const read = await getEvidenceForRegulator({
      callerEntityId: regulatorId,
      packageId: created.package.package_id,
    });
    expect(read).toEqual({ ok: false, code: "PACKAGE_EXPIRED" });
    const row = await prisma.complianceSharePackage.findUnique({
      where: { package_id: created.package.package_id },
    });
    expect(row?.status).toBe("EXPIRED");
    const audit = await prisma.auditEvent.findFirst({
      where: { event_type: "COMPLIANCE_SHARE_PACKAGE_EXPIRED" },
      orderBy: { timestamp: "desc" },
    });
    expect(audit).not.toBeNull();
  });
});
