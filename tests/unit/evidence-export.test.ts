// FILE: evidence-export.test.ts (unit)
// PURPOSE: GOVSEC.2B / GAP-G2 -- verify the pure generateEvidenceExport core
//          produces an OSCAL-compatible assessment-results SUMMARY (counts /
//          classes only), is deterministic for seeded data, contains no
//          forbidden fields (no raw AuditEvent rows / ip / event_hash / details /
//          actor-target ids / vectors), and creates no audit rows (read-only).
// CONNECTS TO: ComplianceService.generateEvidenceExport, the compliance
//              framework seed + EntityComplianceProfile, the audit_events table.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AuthService,
  ComplianceService,
  MemoryNonceStore,
  seedComplianceFrameworks,
} from "@niov/api";
import { createEntity, prisma, writeAuditEvent } from "@niov/database";
import { cleanupTestData, ensureAuditTriggers, makeEntityInput } from "../helpers.js";

const TEST_JWT_SECRET = "govsec2b-evidence-export-secret-not-for-prod";

function makeService(): ComplianceService {
  const auth = new AuthService({ jwtSecret: TEST_JWT_SECRET, nonceStore: new MemoryNonceStore() });
  return new ComplianceService(auth);
}

async function makeOrg(frameworks: string[]): Promise<string> {
  const input = makeEntityInput({ entity_type: "COMPANY" });
  const entity = await createEntity(input);
  await prisma.entityComplianceProfile.upsert({
    where: { entity_id: entity.entity_id },
    update: { frameworks, sector: "gov", jurisdiction: [] },
    create: { entity_id: entity.entity_id, frameworks, sector: "gov", jurisdiction: [] },
  });
  return entity.entity_id;
}

async function emitPassed(orgId: string): Promise<void> {
  await writeAuditEvent({
    event_type: "COMPLIANCE_CHECK_PASSED",
    outcome: "SUCCESS",
    target_entity_id: orgId,
    details: { operation_type: "NEGOTIATE" },
  });
}
async function emitFailed(orgId: string, framework: string): Promise<void> {
  await writeAuditEvent({
    event_type: "COMPLIANCE_CHECK_FAILED",
    outcome: "DENIED",
    target_entity_id: orgId,
    denial_reason: "FRAMEWORK_VIOLATION",
    details: { failing_framework: framework, operation_type: "NEGOTIATE" },
  });
}

async function orgAuditCount(orgId: string): Promise<number> {
  return prisma.auditEvent.count({ where: { target_entity_id: orgId } });
}

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
  await seedComplianceFrameworks();
});
afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

const FORBIDDEN = [
  "ip_address",
  "event_hash",
  "previous_event_hash",
  "\"details\"",
  "actor_entity_id",
  "target_entity_id",
  "target_capsule_id",
  "vector",
  "embedding",
  "distance",
  "cosine",
  "recent_failures",
];

describe("GOVSEC.2B generateEvidenceExport (GAP-G2)", () => {
  it("returns an OSCAL_ASSESSMENT_RESULTS_SUMMARY with oscal_compatible=true", async () => {
    const svc = makeService();
    const org = await makeOrg(["FedRAMP_Moderate"]);
    await emitPassed(org);
    const ev = await svc.generateEvidenceExport(org);
    expect(ev.export_type).toBe("OSCAL_ASSESSMENT_RESULTS_SUMMARY");
    expect(ev.oscal_compatible).toBe(true);
    expect(ev.org_entity_id).toBe(org);
    expect(Array.isArray(ev.results)).toBe(true);
    expect(Array.isArray(ev.audit_event_summary)).toBe(true);
  });

  it("includes the seeded framework with control_id au-2 and numeric counts", async () => {
    const svc = makeService();
    const org = await makeOrg(["FedRAMP_Moderate"]);
    await emitPassed(org);
    await emitFailed(org, "FedRAMP_Moderate");
    const ev = await svc.generateEvidenceExport(org);
    const fr = ev.results.find((r) => r.framework_name === "FedRAMP_Moderate");
    expect(fr).toBeDefined();
    expect(fr!.observations[0]!.control_id).toBe("au-2");
    expect(typeof fr!.observations[0]!.counts.passed).toBe("number");
    expect(typeof fr!.observations[0]!.counts.failed).toBe("number");
    expect(fr!.observations[0]!.counts.failed).toBe(1);
  });

  it("finding status is class-only and reflects compliance (not-satisfied when failures exist)", async () => {
    const svc = makeService();
    const org = await makeOrg(["FedRAMP_Moderate"]);
    await emitFailed(org, "FedRAMP_Moderate");
    const ev = await svc.generateEvidenceExport(org);
    const fr = ev.results.find((r) => r.framework_name === "FedRAMP_Moderate");
    expect(fr!.compliant).toBe(false);
    expect(fr!.findings[0]!.status).toBe("not-satisfied");
    expect(fr!.findings[0]!.related_observation_count).toBe(1);
  });

  it("finding status satisfied when no failures in window", async () => {
    const svc = makeService();
    const org = await makeOrg(["FedRAMP_Moderate"]);
    await emitPassed(org);
    const ev = await svc.generateEvidenceExport(org);
    const fr = ev.results.find((r) => r.framework_name === "FedRAMP_Moderate");
    expect(fr!.compliant).toBe(true);
    expect(fr!.findings[0]!.status).toBe("satisfied");
  });

  it("audit_event_summary carries (event_type, outcome, count) class entries only", async () => {
    const svc = makeService();
    const org = await makeOrg(["FedRAMP_Moderate"]);
    await emitPassed(org);
    await emitFailed(org, "FedRAMP_Moderate");
    const ev = await svc.generateEvidenceExport(org);
    const passed = ev.audit_event_summary.find((e) => e.event_type === "COMPLIANCE_CHECK_PASSED");
    const failed = ev.audit_event_summary.find((e) => e.event_type === "COMPLIANCE_CHECK_FAILED");
    expect(passed!.outcome).toBe("SUCCESS");
    expect(passed!.count).toBe(1);
    expect(failed!.outcome).toBe("DENIED");
    expect(failed!.count).toBe(1);
  });

  it("is deterministic for the same seeded data (counts/verdicts, excluding point-in-time timestamps)", async () => {
    const svc = makeService();
    const org = await makeOrg(["FedRAMP_Moderate"]);
    await emitFailed(org, "FedRAMP_Moderate");
    const a = await svc.generateEvidenceExport(org);
    const b = await svc.generateEvidenceExport(org);
    // `collected`/`window`/`generated_at` are point-in-time and legitimately
    // differ per call; the data (counts, verdicts, event summary) is deterministic.
    const stripCollected = (ev: typeof a) =>
      ev.results.map((r) => ({
        framework_name: r.framework_name,
        compliant: r.compliant,
        counts: r.observations[0]!.counts,
        status: r.findings[0]!.status,
      }));
    expect(stripCollected(a)).toEqual(stripCollected(b));
    expect(a.audit_event_summary).toEqual(b.audit_event_summary);
  });

  it("export contains NO forbidden fields (raw rows / ip / hash / details / ids / vectors)", async () => {
    const svc = makeService();
    const org = await makeOrg(["FedRAMP_Moderate"]);
    await emitPassed(org);
    await emitFailed(org, "FedRAMP_Moderate");
    const ev = await svc.generateEvidenceExport(org);
    const serialized = JSON.stringify(ev);
    for (const forbidden of FORBIDDEN) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("generateEvidenceExport creates NO audit rows (read-only)", async () => {
    const svc = makeService();
    const org = await makeOrg(["FedRAMP_Moderate"]);
    await emitPassed(org);
    const before = await orgAuditCount(org);
    await svc.generateEvidenceExport(org);
    const after = await orgAuditCount(org);
    expect(after).toBe(before);
  });

  it("an org with no compliance profile yields an empty results set (no leakage)", async () => {
    const svc = makeService();
    const input = makeEntityInput({ entity_type: "COMPANY" });
    const entity = await createEntity(input);
    const ev = await svc.generateEvidenceExport(entity.entity_id);
    expect(ev.results).toEqual([]);
    expect(ev.export_type).toBe("OSCAL_ASSESSMENT_RESULTS_SUMMARY");
  });
});
