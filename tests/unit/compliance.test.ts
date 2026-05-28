// FILE: compliance.test.ts (unit + integration)
// PURPOSE: Verify the Compliance Router -- seven seed frameworks,
//          getApplicableFrameworks, runComplianceChecks (HIPAA
//          predicate exercised), and the integration into NEGOTIATE
//          (compliance failure prevents the operation from executing).
// CONNECTS TO: ComplianceService, AuthService, NegotiateService,
//              WriteService, the compliance + entity tables, the
//              audit_events table.

import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AuthService,
  ComplianceService,
  FixtureBasedEmbeddingProvider,
  MemoryContentStore,
  MemoryNonceStore,
  NegotiateService,
  SEED_FRAMEWORKS,
  WriteService,
  seedComplianceFrameworks,
  type LoginResult,
} from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import { createEntity, createPermission, prisma } from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeEntityInput,
} from "../helpers.js";

const TEST_JWT_SECRET = "compliance-test-secret-do-not-use-in-prod";
const TEST_KEY = randomBytes(32);

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
  await seedComplianceFrameworks();
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

// WHAT: Build a fresh stack of services with isolated stores AND
//        a NegotiateService that has compliance wired in.
// INPUT: None.
// OUTPUT: All services + stores.
// WHY: Section 7 tests the whole NEGOTIATE flow with compliance,
//      not the predicate in isolation.
function makeServices() {
  const sessionStore = new MemoryNonceStore();
  const declarationStore = new MemoryNonceStore();
  const contentStore = new MemoryContentStore();
  const encryption = new ContentEncryption(TEST_KEY);
  const auth = new AuthService({
    jwtSecret: TEST_JWT_SECRET,
    nonceStore: sessionStore,
  });
  const compliance = new ComplianceService(auth);
  const negotiate = new NegotiateService(
    auth,
    declarationStore,
    TEST_JWT_SECRET,
    compliance,
  );
  const write = new WriteService(
    auth,
    declarationStore,
    contentStore,
    encryption,
    TEST_JWT_SECRET,
    new FixtureBasedEmbeddingProvider(),
  );
  return { auth, compliance, negotiate, write, contentStore };
}

// WHAT: Create + login a PERSON entity.
// INPUT: AuthService, ops to request.
// OUTPUT: { entity, token }.
// WHY: Most tests need a logged-in actor.
async function loginAs(auth: AuthService, ops: string[] = ["read", "write", "share"]) {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const entity = await createEntity(input);
  const login = await auth.login(input.email!, password, ops, {
    ip_address: null,
  });
  if (!login.ok) throw new Error(`login failed: ${login.code}`);
  return { entity, token: login.token };
}

// WHAT: Attach a compliance profile to an entity.
// INPUT: entity_id, frameworks, sector, jurisdiction.
// OUTPUT: A promise that resolves once the row is upserted.
// WHY: Tests need to declare which frameworks an entity is bound
//      by; in production this would happen via a future
//      registration / admin path.
async function setComplianceProfile(
  entityId: string,
  frameworks: string[],
  sector: string,
  jurisdiction: string[] = [],
): Promise<void> {
  await prisma.entityComplianceProfile.upsert({
    where: { entity_id: entityId },
    update: { frameworks, sector, jurisdiction },
    create: { entity_id: entityId, frameworks, sector, jurisdiction },
  });
}

describe("seed data + listFrameworks", () => {
  it("the seven spec frameworks exist after seedComplianceFrameworks", async () => {
    const { compliance } = makeServices();
    const frameworks = await compliance.listFrameworks();
    const names = frameworks.map((f) => f.framework_name);
    for (const seed of SEED_FRAMEWORKS) {
      expect(names).toContain(seed.framework_name);
    }
  });

  it("HIPAA carries the requires_consent_for_health_data rule", async () => {
    const { compliance } = makeServices();
    const frameworks = await compliance.listFrameworks();
    const hipaa = frameworks.find((f) => f.framework_name === "HIPAA");
    expect(hipaa).toBeDefined();
    const rules = hipaa?.rules as Record<string, unknown>;
    expect(rules.requires_consent_for_health_data).toBe(true);
  });
});

describe("getApplicableFrameworks", () => {
  it("returns empty list for an entity without a profile", async () => {
    const { auth, compliance } = makeServices();
    const fresh = await loginAs(auth);
    const list = await compliance.getApplicableFrameworks(fresh.entity.entity_id);
    expect(list).toHaveLength(0);
  });

  it("returns the entity's declared frameworks", async () => {
    const { auth, compliance } = makeServices();
    const owner = await loginAs(auth);
    await setComplianceProfile(
      owner.entity.entity_id,
      ["HIPAA", "SOC2_Type2"],
      "HEALTHCARE",
      ["US"],
    );
    const list = await compliance.getApplicableFrameworks(owner.entity.entity_id);
    const names = list.map((f) => f.framework_name).sort();
    expect(names).toEqual(["HIPAA", "SOC2_Type2"]);
  });
});

describe("runComplianceChecks -- HIPAA predicate", () => {
  it("blocks IDENTITY access without health_data_consent", async () => {
    const { auth, compliance, write } = makeServices();
    const owner = await loginAs(auth);
    const accessor = await loginAs(auth);
    await setComplianceProfile(
      owner.entity.entity_id,
      ["HIPAA"],
      "HEALTHCARE",
      ["US"],
    );
    const created = await write.createCapsule(owner.token, {
      capsule_type: "IDENTITY",
      topic_tags: ["medical-record"],
      payload_summary: "patient identity",
      content: "John Doe, DOB 1980-01-01",
    });
    if (!created.ok) throw new Error("create failed");
    const permission = await createPermission({
      capsule_id: created.capsule_id,
      grantor_entity_id: owner.entity.entity_id,
      grantee_entity_id: accessor.entity.entity_id,
      access_scope: "FULL",
      duration_type: "TEMPORARY",
    });

    const result = await compliance.runComplianceChecks({
      operation_type: "NEGOTIATE",
      actor_entity_id: accessor.entity.entity_id,
      target_entity_id: owner.entity.entity_id,
      capsule_id: created.capsule_id,
      capsule_type: "IDENTITY",
      permission,
    });
    expect(result.compliant).toBe(false);
    expect(result.failing_framework).toBe("HIPAA");
    expect(result.reason).toMatch(/health_data_consent/i);
  });

  it("permits IDENTITY access when health_data_consent is in conditions", async () => {
    const { auth, compliance, write } = makeServices();
    const owner = await loginAs(auth);
    const accessor = await loginAs(auth);
    await setComplianceProfile(
      owner.entity.entity_id,
      ["HIPAA"],
      "HEALTHCARE",
      ["US"],
    );
    const created = await write.createCapsule(owner.token, {
      capsule_type: "IDENTITY",
      topic_tags: ["medical-record"],
      payload_summary: "patient identity with consent",
      content: "John Doe, DOB 1980-01-01",
    });
    if (!created.ok) throw new Error("create failed");
    const permission = await createPermission({
      capsule_id: created.capsule_id,
      grantor_entity_id: owner.entity.entity_id,
      grantee_entity_id: accessor.entity.entity_id,
      access_scope: "FULL",
      duration_type: "TEMPORARY",
      conditions: { health_data_consent: true },
    });

    const result = await compliance.runComplianceChecks({
      operation_type: "NEGOTIATE",
      actor_entity_id: accessor.entity.entity_id,
      target_entity_id: owner.entity.entity_id,
      capsule_id: created.capsule_id,
      capsule_type: "IDENTITY",
      permission,
    });
    expect(result.compliant).toBe(true);
    expect(result.evaluated_frameworks).toContain("HIPAA");
  });

  it("ignores HIPAA when capsule_type is not IDENTITY or SESSION_LEARNING", async () => {
    const { auth, compliance, write } = makeServices();
    const owner = await loginAs(auth);
    const accessor = await loginAs(auth);
    await setComplianceProfile(
      owner.entity.entity_id,
      ["HIPAA"],
      "HEALTHCARE",
      ["US"],
    );
    const created = await write.createCapsule(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["x"],
      payload_summary: "x",
      content: "x",
    });
    if (!created.ok) throw new Error("create failed");
    const permission = await createPermission({
      capsule_id: created.capsule_id,
      grantor_entity_id: owner.entity.entity_id,
      grantee_entity_id: accessor.entity.entity_id,
      access_scope: "SUMMARY",
      duration_type: "TEMPORARY",
    });

    const result = await compliance.runComplianceChecks({
      operation_type: "NEGOTIATE",
      actor_entity_id: accessor.entity.entity_id,
      target_entity_id: owner.entity.entity_id,
      capsule_id: created.capsule_id,
      capsule_type: "PREFERENCE",
      permission,
    });
    expect(result.compliant).toBe(true);
  });

  it("P2 PATCH: HIPAA predicate triggers on CONVERSATION_LEARNING capsule_type", async () => {
    const { auth, compliance, write } = makeServices();
    const owner = await loginAs(auth);
    const accessor = await loginAs(auth);
    await setComplianceProfile(
      owner.entity.entity_id,
      ["HIPAA"],
      "HEALTHCARE",
      ["US"],
    );
    const created = await write.createCapsule(owner.token, {
      capsule_type: "CONVERSATION_LEARNING",
      topic_tags: ["p2-patch"],
      payload_summary: "convo extract",
      content: "patient mentioned chronic back pain",
    });
    if (!created.ok) throw new Error("create failed");

    // Without consent → blocked.
    const denyPermission = await createPermission({
      capsule_id: created.capsule_id,
      grantor_entity_id: owner.entity.entity_id,
      grantee_entity_id: accessor.entity.entity_id,
      access_scope: "SUMMARY",
      duration_type: "TEMPORARY",
    });
    const denied = await compliance.runComplianceChecks({
      operation_type: "NEGOTIATE",
      actor_entity_id: accessor.entity.entity_id,
      target_entity_id: owner.entity.entity_id,
      capsule_id: created.capsule_id,
      capsule_type: "CONVERSATION_LEARNING",
      permission: denyPermission,
    });
    expect(denied.compliant).toBe(false);
    expect(denied.reason ?? "").toMatch(/CONVERSATION_LEARNING/);

    // With consent → permitted.
    const owner2 = await loginAs(auth);
    const accessor2 = await loginAs(auth);
    await setComplianceProfile(
      owner2.entity.entity_id,
      ["HIPAA"],
      "HEALTHCARE",
      ["US"],
    );
    const created2 = await write.createCapsule(owner2.token, {
      capsule_type: "CONVERSATION_LEARNING",
      topic_tags: ["p2-patch-with-consent"],
      payload_summary: "convo extract 2",
      content: "patient discussed sleep issues",
    });
    if (!created2.ok) throw new Error("create failed");
    const consentPermission = await createPermission({
      capsule_id: created2.capsule_id,
      grantor_entity_id: owner2.entity.entity_id,
      grantee_entity_id: accessor2.entity.entity_id,
      access_scope: "SUMMARY",
      duration_type: "TEMPORARY",
      conditions: { health_data_consent: true },
    });
    const allowed = await compliance.runComplianceChecks({
      operation_type: "NEGOTIATE",
      actor_entity_id: accessor2.entity.entity_id,
      target_entity_id: owner2.entity.entity_id,
      capsule_id: created2.capsule_id,
      capsule_type: "CONVERSATION_LEARNING",
      permission: consentPermission,
    });
    expect(allowed.compliant).toBe(true);
  });

  it("writes a COMPLIANCE_CHECK_FAILED audit event when blocking", async () => {
    const { auth, compliance, write } = makeServices();
    const owner = await loginAs(auth);
    const accessor = await loginAs(auth);
    await setComplianceProfile(
      owner.entity.entity_id,
      ["HIPAA"],
      "HEALTHCARE",
      ["US"],
    );
    const created = await write.createCapsule(owner.token, {
      capsule_type: "IDENTITY",
      topic_tags: ["x"],
      payload_summary: "x",
      content: "x",
    });
    if (!created.ok) throw new Error("create failed");
    const permission = await createPermission({
      capsule_id: created.capsule_id,
      grantor_entity_id: owner.entity.entity_id,
      grantee_entity_id: accessor.entity.entity_id,
      access_scope: "FULL",
      duration_type: "TEMPORARY",
    });

    await compliance.runComplianceChecks({
      operation_type: "NEGOTIATE",
      actor_entity_id: accessor.entity.entity_id,
      target_entity_id: owner.entity.entity_id,
      capsule_id: created.capsule_id,
      capsule_type: "IDENTITY",
      permission,
    });
    const events = await prisma.auditEvent.findMany({
      where: {
        actor_entity_id: accessor.entity.entity_id,
        target_entity_id: owner.entity.entity_id,
        event_type: "COMPLIANCE_CHECK_FAILED",
      },
    });
    expect(events.length).toBeGreaterThanOrEqual(1);
  });
});

describe("NEGOTIATE integration -- compliance failure prevents operation", () => {
  it("HIPAA-bound capsule without consent returns COMPLIANCE_CHECK_FAILED from negotiate", async () => {
    const { auth, write, negotiate } = makeServices();
    const owner = await loginAs(auth);
    const accessor = await loginAs(auth);
    await setComplianceProfile(
      owner.entity.entity_id,
      ["HIPAA"],
      "HEALTHCARE",
      ["US"],
    );
    const created = await write.createCapsule(owner.token, {
      capsule_type: "IDENTITY",
      topic_tags: ["medical-record"],
      payload_summary: "patient identity",
      content: "John Doe",
    });
    if (!created.ok) throw new Error("create failed");

    // Permission WITHOUT health_data_consent.
    await createPermission({
      capsule_id: created.capsule_id,
      grantor_entity_id: owner.entity.entity_id,
      grantee_entity_id: accessor.entity.entity_id,
      access_scope: "FULL",
      duration_type: "TEMPORARY",
    });

    const result = await negotiate.negotiate(
      accessor.token,
      created.capsule_id,
      "FULL",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("COMPLIANCE_CHECK_FAILED");
    expect(result.failing_framework).toBe("HIPAA");
  });

  it("HIPAA-bound capsule WITH consent passes negotiate", async () => {
    const { auth, write, negotiate } = makeServices();
    const owner = await loginAs(auth);
    const accessor = await loginAs(auth);
    await setComplianceProfile(
      owner.entity.entity_id,
      ["HIPAA"],
      "HEALTHCARE",
      ["US"],
    );
    const created = await write.createCapsule(owner.token, {
      capsule_type: "IDENTITY",
      topic_tags: ["medical-record"],
      payload_summary: "patient identity",
      content: "John Doe",
    });
    if (!created.ok) throw new Error("create failed");
    await createPermission({
      capsule_id: created.capsule_id,
      grantor_entity_id: owner.entity.entity_id,
      grantee_entity_id: accessor.entity.entity_id,
      access_scope: "FULL",
      duration_type: "TEMPORARY",
      conditions: { health_data_consent: true },
    });

    const result = await negotiate.negotiate(
      accessor.token,
      created.capsule_id,
      "FULL",
    );
    expect(result.ok).toBe(true);
  });

  it("owner shortcut bypasses compliance even when HIPAA is on the profile", async () => {
    const { auth, write, negotiate } = makeServices();
    const owner = await loginAs(auth);
    await setComplianceProfile(
      owner.entity.entity_id,
      ["HIPAA"],
      "HEALTHCARE",
      ["US"],
    );
    const created = await write.createCapsule(owner.token, {
      capsule_type: "IDENTITY",
      topic_tags: ["self"],
      payload_summary: "self",
      content: "self",
    });
    if (!created.ok) throw new Error("create failed");

    const result = await negotiate.negotiate(
      owner.token,
      created.capsule_id,
      "FULL",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.granted_scope).toBe("FULL");
  });
});

describe("generateComplianceReport", () => {
  it("counts COMPLIANCE_CHECK_PASSED and FAILED events for a target entity", async () => {
    const { auth, compliance, write } = makeServices();
    const owner = await loginAs(auth);
    const accessor = await loginAs(auth);
    await setComplianceProfile(
      owner.entity.entity_id,
      ["HIPAA"],
      "HEALTHCARE",
      ["US"],
    );
    const idCapsule = await write.createCapsule(owner.token, {
      capsule_type: "IDENTITY",
      topic_tags: ["x"],
      payload_summary: "x",
      content: "x",
    });
    const prefCapsule = await write.createCapsule(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["x"],
      payload_summary: "x",
      content: "x",
    });
    if (!idCapsule.ok || !prefCapsule.ok) throw new Error("create failed");

    // One blocked check (IDENTITY without consent).
    const idPerm = await createPermission({
      capsule_id: idCapsule.capsule_id,
      grantor_entity_id: owner.entity.entity_id,
      grantee_entity_id: accessor.entity.entity_id,
      access_scope: "FULL",
      duration_type: "TEMPORARY",
    });
    await compliance.runComplianceChecks({
      operation_type: "NEGOTIATE",
      actor_entity_id: accessor.entity.entity_id,
      target_entity_id: owner.entity.entity_id,
      capsule_id: idCapsule.capsule_id,
      capsule_type: "IDENTITY",
      permission: idPerm,
    });
    // One passing check (PREFERENCE bypasses HIPAA's IDENTITY/SESSION
    // filter).
    const prefPerm = await createPermission({
      capsule_id: prefCapsule.capsule_id,
      grantor_entity_id: owner.entity.entity_id,
      grantee_entity_id: accessor.entity.entity_id,
      access_scope: "SUMMARY",
      duration_type: "TEMPORARY",
    });
    await compliance.runComplianceChecks({
      operation_type: "NEGOTIATE",
      actor_entity_id: accessor.entity.entity_id,
      target_entity_id: owner.entity.entity_id,
      capsule_id: prefCapsule.capsule_id,
      capsule_type: "PREFERENCE",
      permission: prefPerm,
    });

    const since = new Date(Date.now() - 60 * 60 * 1000);
    const until = new Date(Date.now() + 60 * 1000);
    const report = await compliance.generateComplianceReport(
      owner.entity.entity_id,
      null,
      since,
      until,
    );
    expect(report.passed_count).toBeGreaterThanOrEqual(1);
    expect(report.failed_count).toBeGreaterThanOrEqual(1);
  });
});
