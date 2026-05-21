// FILE: evidence-export.test.ts (integration)
// PURPOSE: GOVSEC.2B / GAP-G2 -- prove generateEvidenceExportForCaller validates
//          the session, org-scopes via getOrgEntityId, fails closed on invalid
//          session, never leaks another org's evidence (cross-org isolation),
//          carries no forbidden fields, creates no audit rows, and leaves the
//          audit hash chain valid. Helper-only -- there is NO route in GOVSEC.2B.
// CONNECTS TO: ComplianceService.generateEvidenceExportForCaller +
//              getOrgEntityId + executePhase0 org-setup primitive +
//              @niov/database (createEntity / computeTARHash / writeAuditEvent /
//              verifyAuditChain / prisma).

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AuthService,
  ComplianceService,
  MemoryNonceStore,
  executePhase0,
  seedComplianceFrameworks,
  type LoginResult,
} from "@niov/api";
import {
  createEntity,
  computeTARHash,
  writeAuditEvent,
  verifyAuditChain,
  prisma,
} from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeEntityInput,
  TEST_PREFIX,
} from "../helpers.js";

const TEST_JWT_SECRET = "govsec2b-evidence-export-integration-secret-not-for-prod";
const PASSWORD = "correct-horse-battery";

let auth: AuthService;
let compliance: ComplianceService;

async function makePlatformAdmin(): Promise<string> {
  const input = makeEntityInput({ entity_type: "PERSON", password: PASSWORD });
  const entity = await createEntity(input);
  await prisma.tokenAttributeRepository.update({
    where: { entity_id: entity.entity_id },
    data: { can_admin_niov: true },
  });
  const fresh = await prisma.tokenAttributeRepository.findUnique({
    where: { entity_id: entity.entity_id },
  });
  const newHash = computeTARHash({
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
  });
  await prisma.tokenAttributeRepository.update({
    where: { entity_id: entity.entity_id },
    data: { tar_hash: newHash },
  });
  return entity.entity_id;
}

interface Org {
  orgId: string;
  adminEmail: string;
  adminPassword: string;
}

async function createOrg(actorId: string, frameworks: string[]): Promise<Org> {
  const adminEmail = `${TEST_PREFIX}g2b_${randomUUID()}@niov.test`;
  const body = await executePhase0({
    company_name: `${TEST_PREFIX}g2bco_${randomUUID()}`,
    industry: "TECH",
    admin_email: adminEmail,
    admin_password: PASSWORD,
    admin_first_name: null,
    admin_last_name: null,
    actor_entity_id: actorId,
  });
  await prisma.entityComplianceProfile.upsert({
    where: { entity_id: body.org_entity_id },
    update: { frameworks, sector: "gov", jurisdiction: [] },
    create: {
      profile_id: randomUUID(),
      entity_id: body.org_entity_id,
      frameworks,
      sector: "gov",
      jurisdiction: [],
    },
  });
  return { orgId: body.org_entity_id, adminEmail, adminPassword: PASSWORD };
}

async function emit(orgId: string, type: "COMPLIANCE_CHECK_PASSED" | "COMPLIANCE_CHECK_FAILED", framework?: string) {
  await writeAuditEvent({
    event_type: type,
    outcome: type === "COMPLIANCE_CHECK_PASSED" ? "SUCCESS" : "DENIED",
    target_entity_id: orgId,
    ...(type === "COMPLIANCE_CHECK_FAILED" ? { denial_reason: "FRAMEWORK_VIOLATION" } : {}),
    details: framework === undefined ? { operation_type: "NEGOTIATE" } : { failing_framework: framework, operation_type: "NEGOTIATE" },
  });
}

async function loginToken(email: string): Promise<string> {
  const res = (await auth.login(email, PASSWORD, ["read"], { ip_address: null })) as LoginResult;
  if (!res.ok) throw new Error(`login failed: ${JSON.stringify(res)}`);
  return res.token;
}

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
  await seedComplianceFrameworks();
  auth = new AuthService({ jwtSecret: TEST_JWT_SECRET, nonceStore: new MemoryNonceStore() });
  compliance = new ComplianceService(auth);
}, 300_000);

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

describe("GOVSEC.2B generateEvidenceExportForCaller (GAP-G2)", () => {
  it("validates session and returns an org-scoped export for a valid caller", async () => {
    const platform = await makePlatformAdmin();
    const org = await createOrg(platform, ["FedRAMP_Moderate"]);
    await emit(org.orgId, "COMPLIANCE_CHECK_PASSED");
    await emit(org.orgId, "COMPLIANCE_CHECK_FAILED", "FedRAMP_Moderate");
    const token = await loginToken(org.adminEmail);
    const result = await compliance.generateEvidenceExportForCaller(token);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.evidence.org_entity_id).toBe(org.orgId);
    expect(result.evidence.results.some((r) => r.framework_name === "FedRAMP_Moderate")).toBe(true);
  });

  it("fails closed on an invalid session (no evidence returned)", async () => {
    const result = await compliance.generateEvidenceExportForCaller("not-a-real-token");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(typeof result.code).toBe("string");
  });

  it("cross-org isolation: org A export contains no org B evidence", async () => {
    const platform = await makePlatformAdmin();
    const orgA = await createOrg(platform, ["FedRAMP_Moderate"]);
    const orgB = await createOrg(platform, ["HIPAA"]);
    await emit(orgA.orgId, "COMPLIANCE_CHECK_PASSED");
    await emit(orgA.orgId, "COMPLIANCE_CHECK_FAILED", "FedRAMP_Moderate");
    // org B accrues a distinct, larger failure volume under a different framework.
    await emit(orgB.orgId, "COMPLIANCE_CHECK_FAILED", "HIPAA");
    await emit(orgB.orgId, "COMPLIANCE_CHECK_FAILED", "HIPAA");
    await emit(orgB.orgId, "COMPLIANCE_CHECK_FAILED", "HIPAA");

    const tokenA = await loginToken(orgA.adminEmail);
    const result = await compliance.generateEvidenceExportForCaller(tokenA);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ev = result.evidence;
    // Only org A's framework + counts; org B's framework name + id never appear.
    expect(ev.results.every((r) => r.framework_name !== "HIPAA")).toBe(true);
    const failed = ev.audit_event_summary.find((e) => e.event_type === "COMPLIANCE_CHECK_FAILED");
    expect(failed!.count).toBe(1); // org A's single failure, NOT org B's 3
    const serialized = JSON.stringify(ev);
    expect(serialized).not.toContain(orgB.orgId);
    expect(serialized).not.toContain("HIPAA");
  });

  it("serialized export contains no forbidden fields and no raw audit rows", async () => {
    const platform = await makePlatformAdmin();
    const org = await createOrg(platform, ["FedRAMP_Moderate"]);
    await emit(org.orgId, "COMPLIANCE_CHECK_FAILED", "FedRAMP_Moderate");
    const token = await loginToken(org.adminEmail);
    const result = await compliance.generateEvidenceExportForCaller(token);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const serialized = JSON.stringify(result.evidence);
    for (const forbidden of [
      "ip_address",
      "event_hash",
      "previous_event_hash",
      "\"details\"",
      "actor_entity_id",
      "target_capsule_id",
      "recent_failures",
      "vector",
      "embedding",
      "distance",
      "cosine",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("export generation creates no audit rows and leaves the chain valid", async () => {
    const platform = await makePlatformAdmin();
    const org = await createOrg(platform, ["FedRAMP_Moderate"]);
    await emit(org.orgId, "COMPLIANCE_CHECK_PASSED");
    const token = await loginToken(org.adminEmail);
    const before = await prisma.auditEvent.count();
    await compliance.generateEvidenceExportForCaller(token);
    const after = await prisma.auditEvent.count();
    expect(after).toBe(before);
    // The org admin's own chain remains verifiable after the export call.
    const chain = await verifyAuditChain(platform);
    expect(chain.valid).toBe(true);
  });
});
