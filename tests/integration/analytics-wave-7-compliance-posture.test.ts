// FILE: analytics-wave-7-compliance-posture.test.ts (integration)
// PURPOSE: Section 6 Wave 7 — org-level compliance-posture
//          aggregate contract coverage per ADR-0061 §8 forward
//          queue. Verifies the same auth + same-org + k=5 +
//          ANALYTICS_READ + SAFE projection contract as Waves
//          2-6 + per-label resolution (NOT_CONFIGURED zero-state
//          when org has no profile / no frameworks; HEALTHY when
//          all subscribed frameworks active + no recent failures;
//          WATCH on inactive or unknown framework presence;
//          DEGRADED on recent COMPLIANCE_CHECK_FAILED).
// CONNECTS TO:
//   - apps/api/src/routes/analytics.routes.ts (Wave 7 route)
//   - apps/api/src/services/analytics/analytics.service.ts
//     (getCompliancePostureForOrg method)
//   - ADR-0061 Section 6 SAFE Projection Pattern

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildApp,
  MemoryContentStore,
  MemoryNonceStore,
  MemoryRateLimitStore,
} from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import { computeTARHash, createEntity, prisma } from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeEntityInput,
  TEST_PREFIX,
  withCleanRateLimits,
} from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "analytics-wave-7-test-secret";
const TEST_KEY = randomBytes(32);

let app: FastifyInstance;
const store = new MemoryRateLimitStore();

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
  app = await buildApp({
    jwtSecret: TEST_JWT_SECRET,
    sessionNonceStore: new MemoryNonceStore(),
    declarationStore: new MemoryNonceStore(),
    contentStore: new MemoryContentStore(),
    contentEncryption: new ContentEncryption(TEST_KEY),
    rateLimitStore: store,
  });
});

afterAll(async () => {
  await app.close();
  await cleanupTestData();
  await prisma.$disconnect();
});

withCleanRateLimits(store);

async function makeTestOrg(): Promise<string> {
  const org = await createEntity({
    entity_type: "COMPANY",
    display_name: `${TEST_PREFIX}org_${randomUUID()}`,
    email: `${TEST_PREFIX}org_${randomUUID()}@niov.test`,
    public_key: "test-public-key",
    clearance_level: 0,
  });
  return org.entity_id;
}

async function refreshTARHash(entityId: string): Promise<void> {
  const fresh = await prisma.tokenAttributeRepository.findUnique({
    where: { entity_id: entityId },
  });
  if (fresh === null) throw new Error("TAR vanished");
  const newHash = computeTARHash({
    can_login: fresh.can_login,
    can_read_capsules: fresh.can_read_capsules,
    can_write_capsules: fresh.can_write_capsules,
    can_share_capsules: fresh.can_share_capsules,
    can_create_hives: fresh.can_create_hives,
    can_access_external_api: fresh.can_access_external_api,
    can_admin_niov: fresh.can_admin_niov,
    can_admin_org: fresh.can_admin_org,
    clearance_ceiling: fresh.clearance_ceiling,
    monetization_role: fresh.monetization_role,
    compliance_frameworks: fresh.compliance_frameworks,
    status: fresh.status,
  });
  await prisma.tokenAttributeRepository.update({
    where: { entity_id: entityId },
    data: { tar_hash: newHash },
  });
}

async function makeMember(opts: {
  orgId: string;
  can_admin_org?: boolean;
}): Promise<{ entityId: string; token: string; ip: string }> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const entity = await createEntity(input);
  await prisma.entityMembership.create({
    data: {
      parent_id: opts.orgId,
      child_id: entity.entity_id,
      role_title: "MEMBER",
      is_active: true,
    },
  });
  await prisma.tokenAttributeRepository.update({
    where: { entity_id: entity.entity_id },
    data: { can_admin_org: opts.can_admin_org === true },
  });
  await refreshTARHash(entity.entity_id);
  const ip = `10.107.${Math.floor(Math.random() * 200) + 1}.${
    Math.floor(Math.random() * 254) + 1
  }`;
  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: {
      email: input.email,
      password,
      requested_operations: ["read", "write"],
    },
    remoteAddress: ip,
  });
  if (login.statusCode !== 200) {
    throw new Error(`login failed: ${login.statusCode} ${login.body}`);
  }
  const body = login.json() as { token: string };
  return { entityId: entity.entity_id, token: body.token, ip };
}

async function seedFiveOrgMembers(
  orgId: string,
): Promise<{ entityId: string; token: string; ip: string }> {
  const admin = await makeMember({ orgId, can_admin_org: true });
  for (let i = 0; i < 4; i++) {
    await makeMember({ orgId, can_admin_org: false });
  }
  return admin;
}

async function ensureFramework(
  name: string,
  isActive: boolean,
): Promise<void> {
  await prisma.complianceFramework.upsert({
    where: { framework_name: name },
    create: {
      framework_name: name,
      jurisdiction: [],
      applicable_entity_sectors: [],
      applicable_capsule_types: [],
      rules: {},
      required_audit_events: [],
      is_active: isActive,
    },
    update: { is_active: isActive },
  });
}

async function setOrgFrameworks(
  orgId: string,
  frameworks: string[],
): Promise<void> {
  await prisma.entityComplianceProfile.upsert({
    where: { entity_id: orgId },
    create: {
      entity_id: orgId,
      frameworks,
      sector: `${TEST_PREFIX}sector`,
      jurisdiction: [],
    },
    update: { frameworks },
  });
}

async function emitComplianceCheck(
  orgId: string,
  outcome: "PASSED" | "FAILED",
): Promise<void> {
  const { writeAuditEvent } = await import("@niov/database");
  await writeAuditEvent({
    event_type:
      outcome === "PASSED"
        ? "COMPLIANCE_CHECK_PASSED"
        : "COMPLIANCE_CHECK_FAILED",
    outcome: outcome === "PASSED" ? "SUCCESS" : "DENIED",
    actor_entity_id: orgId,
    target_entity_id: orgId,
    details: { test: true },
  });
}

async function post(
  caller: { token: string; ip: string } | null,
  url: string,
  body: Record<string, unknown>,
): Promise<{ statusCode: number; body: any; raw: string }> {
  const r = await app.inject({
    method: "POST",
    url,
    headers:
      caller === null ? {} : { authorization: `Bearer ${caller.token}` },
    ...(caller === null ? {} : { remoteAddress: caller.ip }),
    payload: body,
  });
  return { statusCode: r.statusCode, body: r.json() as any, raw: r.body };
}

const ROUTE = "/api/v1/analytics/compliance-posture";

const FORBIDDEN_NO_LEAK_MARKERS = [
  "actor_entity_id",
  "target_entity_id",
  "audit_id",
  "basis_reference",
  "jurisdiction_invoked",
  "regulator",
  "lawful_basis",
  "payload_summary",
  "payload_redacted",
  "storage_location",
  "content_hash",
  "secret_ref",
  "bridge_id",
  "rules",
  "framework_id",
];

function assertNoLeak(raw: string): void {
  for (const marker of FORBIDDEN_NO_LEAK_MARKERS) {
    expect(raw.toLowerCase()).not.toContain(marker.toLowerCase());
  }
}

describe("Section 6 Wave 7 — auth gates", () => {
  it("401 without bearer", async () => {
    const r = await post(null, ROUTE, {});
    expect(r.statusCode).toBe(401);
  });
  it("403 without can_admin_org", async () => {
    const orgId = await makeTestOrg();
    const nonAdmin = await makeMember({ orgId, can_admin_org: false });
    const r = await post(nonAdmin, ROUTE, {});
    expect(r.statusCode).toBe(403);
  });
});

describe("Section 6 Wave 7 — k=5 population gate", () => {
  it("INSUFFICIENT_POPULATION when org has < 5 members", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    const r = await post(admin, ROUTE, {});
    expect(r.statusCode).toBe(200);
    expect(r.body.aggregate).toBe("COMPLIANCE_POSTURE");
    expect(r.body.signal_label).toBe("INSUFFICIENT_POPULATION");
    expect(r.body.redacted).toBe(true);
    expect(r.body.frameworks_subscribed_count).toBe(0);
    expect(r.body.recent_check_passed_count).toBe(0);
    expect(r.body.recent_check_failed_count).toBe(0);
  });
});

describe("Section 6 Wave 7 — NOT_CONFIGURED zero-state", () => {
  it("NOT_CONFIGURED when org has no EntityComplianceProfile", async () => {
    const orgId = await makeTestOrg();
    const admin = await seedFiveOrgMembers(orgId);
    const r = await post(admin, ROUTE, {});
    expect(r.statusCode).toBe(200);
    expect(r.body.signal_label).toBe("NOT_CONFIGURED");
    expect(r.body.redacted).toBe(false);
    expect(r.body.frameworks_subscribed_count).toBe(0);
  });

  it("NOT_CONFIGURED when org's profile has empty frameworks[]", async () => {
    const orgId = await makeTestOrg();
    const admin = await seedFiveOrgMembers(orgId);
    await setOrgFrameworks(orgId, []);
    const r = await post(admin, ROUTE, {});
    expect(r.statusCode).toBe(200);
    expect(r.body.signal_label).toBe("NOT_CONFIGURED");
  });
});

describe("Section 6 Wave 7 — HEALTHY happy path", () => {
  it("HEALTHY when all subscribed frameworks active + no recent failures", async () => {
    const orgId = await makeTestOrg();
    const admin = await seedFiveOrgMembers(orgId);
    const fwA = `${TEST_PREFIX}HIPAA-${randomUUID()}`;
    const fwB = `${TEST_PREFIX}GDPR-${randomUUID()}`;
    await ensureFramework(fwA, true);
    await ensureFramework(fwB, true);
    await setOrgFrameworks(orgId, [fwA, fwB]);

    const r = await post(admin, ROUTE, {});
    expect(r.statusCode).toBe(200);
    expect(r.body.signal_label).toBe("HEALTHY");
    expect(r.body.redacted).toBe(false);
    expect(r.body.frameworks_subscribed_count).toBe(2);
    expect(r.body.frameworks_active_count).toBe(2);
    expect(r.body.frameworks_inactive_count).toBe(0);
    expect(r.body.frameworks_unknown_count).toBe(0);
    expect(r.body.recent_check_failed_count).toBe(0);
  });
});

describe("Section 6 Wave 7 — WATCH labels", () => {
  it("WATCH when a subscribed framework is INACTIVE", async () => {
    const orgId = await makeTestOrg();
    const admin = await seedFiveOrgMembers(orgId);
    const fwActive = `${TEST_PREFIX}A-${randomUUID()}`;
    const fwInactive = `${TEST_PREFIX}I-${randomUUID()}`;
    await ensureFramework(fwActive, true);
    await ensureFramework(fwInactive, false);
    await setOrgFrameworks(orgId, [fwActive, fwInactive]);
    const r = await post(admin, ROUTE, {});
    expect(r.statusCode).toBe(200);
    expect(r.body.signal_label).toBe("WATCH");
    expect(r.body.frameworks_active_count).toBe(1);
    expect(r.body.frameworks_inactive_count).toBe(1);
    expect(r.body.frameworks_unknown_count).toBe(0);
  });

  it("WATCH when a subscribed framework name has no ComplianceFramework row (unknown)", async () => {
    const orgId = await makeTestOrg();
    const admin = await seedFiveOrgMembers(orgId);
    const fwActive = `${TEST_PREFIX}A-${randomUUID()}`;
    const fwUnknown = `${TEST_PREFIX}UNK-${randomUUID()}`; // never inserted
    await ensureFramework(fwActive, true);
    await setOrgFrameworks(orgId, [fwActive, fwUnknown]);
    const r = await post(admin, ROUTE, {});
    expect(r.statusCode).toBe(200);
    expect(r.body.signal_label).toBe("WATCH");
    expect(r.body.frameworks_active_count).toBe(1);
    expect(r.body.frameworks_unknown_count).toBe(1);
  });
});

describe("Section 6 Wave 7 — DEGRADED on recent FAILED", () => {
  it("DEGRADED when COMPLIANCE_CHECK_FAILED exists in window", async () => {
    const orgId = await makeTestOrg();
    const admin = await seedFiveOrgMembers(orgId);
    const fw = `${TEST_PREFIX}A-${randomUUID()}`;
    await ensureFramework(fw, true);
    await setOrgFrameworks(orgId, [fw]);
    await emitComplianceCheck(orgId, "PASSED");
    await emitComplianceCheck(orgId, "FAILED");
    const r = await post(admin, ROUTE, {});
    expect(r.statusCode).toBe(200);
    expect(r.body.signal_label).toBe("DEGRADED");
    expect(r.body.recent_check_passed_count).toBe(1);
    expect(r.body.recent_check_failed_count).toBe(1);
  });
});

describe("Section 6 Wave 7 — same-org isolation", () => {
  it("Cross-org ComplianceFramework subscriptions are EXCLUDED", async () => {
    const orgA = await makeTestOrg();
    const orgB = await makeTestOrg();
    const adminA = await seedFiveOrgMembers(orgA);
    const adminB = await seedFiveOrgMembers(orgB);
    const fwShared = `${TEST_PREFIX}shared-${randomUUID()}`;
    const fwBOnly = `${TEST_PREFIX}b-only-${randomUUID()}`;
    await ensureFramework(fwShared, true);
    await ensureFramework(fwBOnly, true);
    // A subscribes to shared only; B subscribes to shared + b-only
    await setOrgFrameworks(orgA, [fwShared]);
    await setOrgFrameworks(orgB, [fwShared, fwBOnly]);
    const rA = await post(adminA, ROUTE, {});
    const rB = await post(adminB, ROUTE, {});
    expect(rA.body.frameworks_subscribed_count).toBe(1);
    expect(rB.body.frameworks_subscribed_count).toBe(2);
  });

  it("Cross-org COMPLIANCE_CHECK audits are EXCLUDED", async () => {
    const orgA = await makeTestOrg();
    const orgB = await makeTestOrg();
    const adminA = await seedFiveOrgMembers(orgA);
    await seedFiveOrgMembers(orgB);
    const fw = `${TEST_PREFIX}fw-${randomUUID()}`;
    await ensureFramework(fw, true);
    await setOrgFrameworks(orgA, [fw]);
    await setOrgFrameworks(orgB, [fw]);
    // Failure in org B should NOT degrade org A.
    await emitComplianceCheck(orgB, "FAILED");
    const rA = await post(adminA, ROUTE, {});
    expect(rA.body.signal_label).toBe("HEALTHY");
    expect(rA.body.recent_check_failed_count).toBe(0);
  });
});

describe("Section 6 Wave 7 — window_days input validation", () => {
  it("422 on non-integer window_days", async () => {
    const orgId = await makeTestOrg();
    const admin = await seedFiveOrgMembers(orgId);
    const r = await post(admin, ROUTE, { window_days: "abc" });
    expect(r.statusCode).toBe(422);
    expect(r.body.code).toBe("INVALID_REQUEST");
  });
  it("422 on window_days out of range", async () => {
    const orgId = await makeTestOrg();
    const admin = await seedFiveOrgMembers(orgId);
    const r = await post(admin, ROUTE, { window_days: 999 });
    expect(r.statusCode).toBe(422);
  });
  it("COMPLIANCE_CHECK_FAILED outside window is EXCLUDED", async () => {
    const orgId = await makeTestOrg();
    const admin = await seedFiveOrgMembers(orgId);
    const fw = `${TEST_PREFIX}fw-${randomUUID()}`;
    await ensureFramework(fw, true);
    await setOrgFrameworks(orgId, [fw]);
    // Insert a COMPLIANCE_CHECK_FAILED row directly with a
    // backdated timestamp. The audit append-only trigger blocks
    // UPDATE/DELETE but not INSERT (ADR-0002); we bypass
    // writeAuditEvent's chain hashing here because this test
    // only exercises the window-filter predicate, not chain
    // integrity.
    await prisma.auditEvent.create({
      data: {
        audit_id: randomUUID(),
        event_type: "COMPLIANCE_CHECK_FAILED",
        outcome: "DENIED",
        actor_entity_id: orgId,
        target_entity_id: orgId,
        timestamp: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000),
        event_hash: `${TEST_PREFIX}h-${randomUUID()}`,
        details: { test: true, backdated: true },
      },
    });
    const r = await post(admin, ROUTE, { window_days: 7 });
    expect(r.statusCode).toBe(200);
    expect(r.body.signal_label).toBe("HEALTHY");
    expect(r.body.recent_check_failed_count).toBe(0);
  });
});

describe("Section 6 Wave 7 — no-leak invariants", () => {
  it("no forbidden markers in HEALTHY response", async () => {
    const orgId = await makeTestOrg();
    const admin = await seedFiveOrgMembers(orgId);
    const fw = `${TEST_PREFIX}fw-${randomUUID()}`;
    await ensureFramework(fw, true);
    await setOrgFrameworks(orgId, [fw]);
    const r = await post(admin, ROUTE, {});
    expect(r.statusCode).toBe(200);
    assertNoLeak(r.raw);
  });

  it("no forbidden markers in DEGRADED response", async () => {
    const orgId = await makeTestOrg();
    const admin = await seedFiveOrgMembers(orgId);
    const fw = `${TEST_PREFIX}fw-${randomUUID()}`;
    await ensureFramework(fw, true);
    await setOrgFrameworks(orgId, [fw]);
    await emitComplianceCheck(orgId, "FAILED");
    const r = await post(admin, ROUTE, {});
    expect(r.statusCode).toBe(200);
    assertNoLeak(r.raw);
  });

  it("response does NOT include framework names / sector / jurisdiction strings", async () => {
    const orgId = await makeTestOrg();
    const admin = await seedFiveOrgMembers(orgId);
    const distinctiveName = `${TEST_PREFIX}DISTINCT-${randomUUID()}`;
    await ensureFramework(distinctiveName, true);
    await setOrgFrameworks(orgId, [distinctiveName]);
    const r = await post(admin, ROUTE, {});
    expect(r.statusCode).toBe(200);
    expect(r.raw).not.toContain(distinctiveName);
    // sector + jurisdiction never selected → cannot leak by construction.
    expect(r.raw.toLowerCase()).not.toContain("sector");
    expect(r.raw.toLowerCase()).not.toContain("jurisdiction");
  });
});

describe("Section 6 Wave 7 — audit emission", () => {
  it("emits ADMIN_ACTION + ANALYTICS_READ + aggregate=COMPLIANCE_POSTURE on HEALTHY read", async () => {
    const orgId = await makeTestOrg();
    const admin = await seedFiveOrgMembers(orgId);
    const fw = `${TEST_PREFIX}fw-${randomUUID()}`;
    await ensureFramework(fw, true);
    await setOrgFrameworks(orgId, [fw]);
    await post(admin, ROUTE, {});
    const audit = await prisma.auditEvent.findFirst({
      where: {
        event_type: "ADMIN_ACTION",
        actor_entity_id: admin.entityId,
      },
      orderBy: { timestamp: "desc" },
    });
    expect(audit).not.toBeNull();
    const details = audit!.details as Record<string, unknown>;
    expect(details.action).toBe("ANALYTICS_READ");
    expect(details.aggregate).toBe("COMPLIANCE_POSTURE");
    expect(details.org_entity_id).toBe(orgId);
    expect(details.redacted).toBe(false);
    expect(typeof details.result_count).toBe("number");
    // No raw counts in audit:
    expect(details).not.toHaveProperty("frameworks_active_count");
    expect(details).not.toHaveProperty("recent_check_failed_count");
    expect(details).not.toHaveProperty("signal_label");
  });

  it("redacted audit when k=5 population gate fails", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    await post(admin, ROUTE, {});
    const audit = await prisma.auditEvent.findFirst({
      where: {
        event_type: "ADMIN_ACTION",
        actor_entity_id: admin.entityId,
      },
      orderBy: { timestamp: "desc" },
    });
    expect(audit).not.toBeNull();
    const details = audit!.details as Record<string, unknown>;
    expect(details.aggregate).toBe("COMPLIANCE_POSTURE");
    expect(details.redacted).toBe(true);
    expect(details.result_count).toBe(0);
  });

  it("does NOT emit any new audit literal (event_type stays ADMIN_ACTION)", async () => {
    const orgId = await makeTestOrg();
    const admin = await seedFiveOrgMembers(orgId);
    await post(admin, ROUTE, {});
    const rows = await prisma.auditEvent.findMany({
      where: { actor_entity_id: admin.entityId },
      select: { event_type: true },
    });
    for (const row of rows) {
      expect(row.event_type).not.toMatch(/COMPLIANCE_POSTURE/);
      expect(row.event_type).not.toMatch(/POSTURE_/);
    }
  });
});
