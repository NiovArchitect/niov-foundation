// FILE: dual-control-phase-e.test.ts (integration)
// PURPOSE: HTTP-level coverage for ADR-0026 Amendment 1 Phase E target
//          resolution across the 4 LIVE PRIVILEGED_ENDPOINTS, plus the
//          fail-closed single-admin path with the
//          DUAL_CONTROL_NO_APPROVER_AVAILABLE marker, the independently-
//          resolved-target approve flow, GAP-C1 source-cannot-resolve
//          regression after Phase E, and the BG.2 break-glass regression.
//          Covers items 7-13 of ADR-0026 Amendment 1 §9 at the integration
//          tier; item 14 (cross-org leak for Class B) is covered at the
//          unit tier (tests/unit/escalation-target-resolver.test.ts) since
//          no LIVE PRIVILEGED_ENDPOINTS entry is can_admin_org today.
//
// CONNECTS TO:
//   - apps/api/src/middleware/dual-control.middleware.ts (the Phase E
//     resolver invocation + the DUAL_CONTROL_NO_APPROVER_AVAILABLE marker
//     emit + 503 ESCALATION_TARGET_NOT_FOUND fail-closed reply)
//   - apps/api/src/services/governance/escalation.service.ts
//     (resolveDualControlTarget + getOrCreatePendingDualControlForCaller
//     + approveEscalationForCaller + the GAP-C1 source-guard)
//   - apps/api/src/security/privileged-endpoints.ts (the 4 LIVE entries
//     under test: PLATFORM_MONETIZATION_CONFIG_UPDATE, PLATFORM_ORG_CREATION,
//     REGULATOR_ACCESS_GRANT, REGULATOR_ACCESS_REVOKE)
//   - apps/api/src/services/governance/break-glass.service.ts
//     (validateBreakGlassGrant + markBreakGlassUsed -- BG.2 regression)
//   - tests/integration/dual-control-binding-config.test.ts +
//     tests/integration/dual-control-binding-orgs.test.ts +
//     tests/integration/break-glass-integration.test.ts (sibling fixture
//     conventions this file mirrors)

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  approveEscalationForCaller,
  buildApp,
  createBreakGlassGrant,
  dualControlDescription,
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

const TEST_JWT_SECRET = "dual-control-phase-e-test-secret-do-not-use";
const TEST_KEY = randomBytes(32);
const MONETIZATION_ACTION_TYPE = "PLATFORM_MONETIZATION_CONFIG_UPDATE" as const;

let app: FastifyInstance;
const store = new MemoryRateLimitStore();

// ---------------------------------------------------------------------------
// Cleanup helpers
// ---------------------------------------------------------------------------

async function testEntityIds(): Promise<string[]> {
  const rows = await prisma.entity.findMany({
    where: { display_name: { startsWith: TEST_PREFIX } },
    select: { entity_id: true },
  });
  return rows.map((e) => e.entity_id);
}

async function cleanupTestBreakGlass(): Promise<void> {
  const ids = await testEntityIds();
  if (ids.length === 0) return;
  await prisma.breakGlassGrant.deleteMany({
    where: {
      OR: [
        { source_entity_id: { in: ids } },
        { reviewed_by_entity_id: { in: ids } },
      ],
    },
  });
}

async function cleanupTestEscalations(): Promise<void> {
  const ids = await testEntityIds();
  if (ids.length === 0) return;
  await prisma.escalationRequest.deleteMany({
    where: {
      OR: [
        { source_entity_id: { in: ids } },
        { target_entity_id: { in: ids } },
        { resolved_by_entity_id: { in: ids } },
      ],
    },
  });
}

async function cleanupMonetizationConfig(): Promise<void> {
  await prisma.monetizationConfig.deleteMany({});
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

async function makeAdminAndLogin(opts: {
  can_admin_niov?: boolean;
}): Promise<{ entityId: string; token: string; ip: string }> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const entity = await createEntity(input);

  if (opts.can_admin_niov === true) {
    await prisma.tokenAttributeRepository.update({
      where: { entity_id: entity.entity_id },
      data: { can_admin_niov: true },
    });
    const fresh = await prisma.tokenAttributeRepository.findUnique({
      where: { entity_id: entity.entity_id },
    });
    if (fresh === null) throw new Error("TAR vanished mid-test");
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
      where: { entity_id: entity.entity_id },
      data: { tar_hash: newHash },
    });
  }

  const ip = `10.94.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 254) + 1}`;
  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: {
      email: input.email,
      password,
      requested_operations: ["read", "write", "share"],
    },
    remoteAddress: ip,
  });
  if (login.statusCode !== 200) {
    throw new Error(`login failed: ${login.statusCode} ${login.body}`);
  }
  const body = login.json() as { token: string };
  return { entityId: entity.entity_id, token: body.token, ip };
}

// Seed a distinct platform-admin (does NOT log in). Mirrors the helper in the
// sibling dual-control-binding-* + break-glass-integration tests.
async function seedDistinctPlatformAdmin(): Promise<string> {
  const entity = await createEntity(
    makeEntityInput({ entity_type: "PERSON" }),
  );
  await prisma.tokenAttributeRepository.update({
    where: { entity_id: entity.entity_id },
    data: { can_admin_niov: true },
  });
  const fresh = await prisma.tokenAttributeRepository.findUnique({
    where: { entity_id: entity.entity_id },
  });
  if (fresh === null) throw new Error("TAR vanished mid-seed");
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
    where: { entity_id: entity.entity_id },
    data: { tar_hash: newHash },
  });
  return entity.entity_id;
}

// ---------------------------------------------------------------------------
// Audit-read helpers
// ---------------------------------------------------------------------------

async function adminAuditEventsFor(entityId: string): Promise<
  Array<{
    event_type: string;
    actor_entity_id: string | null;
    denial_reason: string | null;
    outcome: string;
    details: Record<string, unknown>;
  }>
> {
  const rows = await prisma.auditEvent.findMany({
    where: { event_type: "ADMIN_ACTION", actor_entity_id: entityId },
    orderBy: { timestamp: "asc" },
  });
  return rows.map((r) => ({
    event_type: r.event_type,
    actor_entity_id: r.actor_entity_id,
    denial_reason: r.denial_reason,
    outcome: r.outcome,
    details: r.details as Record<string, unknown>,
  }));
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestBreakGlass();
  await cleanupTestEscalations();
  await cleanupMonetizationConfig();
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
  await cleanupTestBreakGlass();
  await cleanupTestEscalations();
  await cleanupMonetizationConfig();
  await cleanupTestData();
  await prisma.$disconnect();
});

withCleanRateLimits(store);

beforeEach(async () => {
  await cleanupTestBreakGlass();
  await cleanupTestEscalations();
  await cleanupMonetizationConfig();
  await cleanupTestData();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ADR-0026 Amendment 1 Phase E: auto-create target across the 4 LIVE PRIVILEGED_ENDPOINTS (Test 7)", () => {
  // Each privileged endpoint shares the same dual-control gate; the minimal
  // payload need only get past Fastify routing -- the gate denies before the
  // handler runs. For routes with strict body schemas (regulator endpoints),
  // arbitrary placeholder fields are fine: the 403 path lands before body
  // validation runs on the route handler (the dual-control preHandler is
  // bound at the routes' preHandler array before the schema body parser
  // dispatches into the handler). What we assert is structural: an auto-
  // created PENDING row appears with target_entity_id != source_entity_id.
  const ENDPOINTS = [
    {
      label: "Operation A: PATCH /platform/monetization/config",
      method: "PATCH" as const,
      url: "/api/v1/platform/monetization/config",
      actionType: "PLATFORM_MONETIZATION_CONFIG_UPDATE" as const,
      payload: { niov_fee_share: 0.4, holder_share: 0.6 },
    },
    {
      label: "Operation B: POST /platform/orgs",
      method: "POST" as const,
      url: "/api/v1/platform/orgs",
      actionType: "PLATFORM_ORG_CREATION" as const,
      payload: {
        company_name: `${TEST_PREFIX}phaseE_${randomUUID()}`,
        admin_email: `${TEST_PREFIX}phaseE_${randomUUID()}@niov.test`,
        admin_password: "correct-horse-battery",
        industry: "TECH",
      },
    },
    {
      label: "Operation C: POST /regulator/access-grants",
      method: "POST" as const,
      url: "/api/v1/regulator/access-grants",
      actionType: "REGULATOR_ACCESS_GRANT" as const,
      payload: {
        regulator_entity_id: "00000000-0000-0000-0000-000000000000",
        lawful_basis_type: "SUBPOENA",
        jurisdiction: "US-FED",
        authority_reference: "phaseE-test",
        valid_until: new Date(Date.now() + 60_000).toISOString(),
      },
    },
    {
      label: "Operation D: POST /regulator/access-revocations",
      method: "POST" as const,
      url: "/api/v1/regulator/access-revocations",
      actionType: "REGULATOR_ACCESS_REVOKE" as const,
      payload: {
        lawful_basis_id: "00000000-0000-0000-0000-000000000000",
        revocation_reason: "phaseE-test",
      },
    },
  ];

  for (const ep of ENDPOINTS) {
    it(`${ep.label} -> auto-created PENDING has target_entity_id != source_entity_id`, async () => {
      const admin = await makeAdminAndLogin({ can_admin_niov: true });
      const distinctApprover = await seedDistinctPlatformAdmin();

      const res = await app.inject({
        method: ep.method,
        url: ep.url,
        headers: { authorization: `Bearer ${admin.token}` },
        payload: ep.payload as Record<string, unknown>,
        remoteAddress: admin.ip,
      });

      // The dual-control preHandler intercepts before any handler logic;
      // the response is 403 ESCALATION_PENDING with a fresh PENDING row.
      expect(res.statusCode).toBe(403);
      const body = res.json() as { error: string; escalation_id: string | null };
      expect(body.error).toBe("ESCALATION_PENDING");
      expect(body.escalation_id).toMatch(/^[0-9a-f-]{36}$/);

      const escRows = await prisma.escalationRequest.findMany({
        where: {
          source_entity_id: admin.entityId,
          escalation_type: "DUAL_CONTROL_REQUIRED",
          description: dualControlDescription(ep.actionType),
        },
      });
      expect(escRows).toHaveLength(1);
      expect(escRows[0]!.status).toBe("PENDING");
      // The structural Phase E Invariant 2.
      expect(escRows[0]!.target_entity_id).not.toBe(admin.entityId);
      expect(escRows[0]!.target_entity_id).toBe(distinctApprover);
      expect(escRows[0]!.source_entity_id).toBe(admin.entityId);
      // Invariant 3: resolved_by_entity_id null at creation.
      expect(escRows[0]!.resolved_by_entity_id).toBeNull();
    });
  }
});

describe("ADR-0026 Amendment 1 Phase E: end-to-end approve flow (Test 8) + GAP-C1 regression (Test 9)", () => {
  it("the independently-resolved target can approve the auto-created escalation; replay then delegates to the handler", async () => {
    const admin = await makeAdminAndLogin({ can_admin_niov: true });
    const distinctApprover = await seedDistinctPlatformAdmin();

    // First request: dual-control auto-creates a PENDING with the resolved target.
    const first = await app.inject({
      method: "PATCH",
      url: "/api/v1/platform/monetization/config",
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { niov_fee_share: 0.4, holder_share: 0.6 },
      remoteAddress: admin.ip,
    });
    expect(first.statusCode).toBe(403);
    const escId = (first.json() as { escalation_id: string }).escalation_id;

    // The resolved target (distinctApprover) can approve.
    const approved = await approveEscalationForCaller(distinctApprover, escId);
    expect(approved.status).toBe("APPROVED");
    expect(approved.resolved_by_entity_id).toBe(distinctApprover);

    // Replay: now the handler runs.
    const second = await app.inject({
      method: "PATCH",
      url: "/api/v1/platform/monetization/config",
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { niov_fee_share: 0.4, holder_share: 0.6 },
      remoteAddress: admin.ip,
    });
    expect(second.statusCode).toBe(200);
    const cfg = await prisma.monetizationConfig.findFirst();
    expect(cfg!.niov_fee_share).toBeCloseTo(0.4, 5);
  });

  it("Test 9 -- GAP-C1 still rejects source-side self-approval after Phase E", async () => {
    const admin = await makeAdminAndLogin({ can_admin_niov: true });
    await seedDistinctPlatformAdmin();

    const first = await app.inject({
      method: "PATCH",
      url: "/api/v1/platform/monetization/config",
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { niov_fee_share: 0.4, holder_share: 0.6 },
      remoteAddress: admin.ip,
    });
    const escId = (first.json() as { escalation_id: string }).escalation_id;

    // The source (admin) attempts to self-approve -- GAP-C1 source-guard fires
    // BEFORE the target/resolver gate at escalation.service.ts:406-407.
    await expect(
      approveEscalationForCaller(admin.entityId, escId),
    ).rejects.toThrow(/ESCALATION_FORBIDDEN/);
  });
});

describe("ADR-0026 Amendment 1 Phase E: fail-closed single-admin (Test 10) + no-leak (Test 12) + audit-details (Test 13)", () => {
  it("single-admin deployment fails closed 503 ESCALATION_TARGET_NOT_FOUND + DUAL_CONTROL_NO_APPROVER_AVAILABLE marker; handler never runs", async () => {
    // Critical: do NOT seed a second platform admin -- the admin is alone.
    const admin = await makeAdminAndLogin({ can_admin_niov: true });

    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/platform/monetization/config",
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { niov_fee_share: 0.4, holder_share: 0.6 },
      remoteAddress: admin.ip,
    });

    expect(res.statusCode).toBe(503);
    expect(res.headers["retry-after"]).toBe("5");
    const body = res.json() as { ok: boolean; error: string; message: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("ESCALATION_TARGET_NOT_FOUND");
    expect(typeof body.message).toBe("string");

    // Privileged handler never ran -> no config row.
    expect(await prisma.monetizationConfig.findFirst()).toBeNull();
    // No PENDING escalation was created -- fail-closed never reached
    // get-or-create.
    expect(
      await prisma.escalationRequest.findMany({
        where: {
          source_entity_id: admin.entityId,
          escalation_type: "DUAL_CONTROL_REQUIRED",
        },
      }),
    ).toHaveLength(0);
  });

  it("Test 12 + 13 -- fail-closed no-leak wire + audit details verification", async () => {
    const admin = await makeAdminAndLogin({ can_admin_niov: true });

    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/platform/monetization/config",
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { niov_fee_share: 0.4, holder_share: 0.6 },
      remoteAddress: admin.ip,
    });
    expect(res.statusCode).toBe(503);

    // Test 12 wire no-leak: the response body must not carry candidate
    // identities, candidate-pool size, organisation membership info, raw
    // request bodies, headers, permission envelope internals, secrets,
    // cross-org data, or any forbidden ADR-0026 Amendment 1 §6 field.
    const wire = res.body;
    const FORBIDDEN = [
      "candidate",
      "pool",
      "candidate_count",
      "candidates",
      "membership",
      "permission",
      "envelope",
      "header",
      "secret",
      "request_body",
      "raw",
    ];
    for (const banned of FORBIDDEN) {
      expect(wire.toLowerCase()).not.toContain(banned);
    }

    // Test 13 audit-details verification: the DUAL_CONTROL_NO_APPROVER_AVAILABLE
    // event was emitted with safe details only -- action_descriptor_type,
    // route, method, target_resolution_reason. No forbidden fields.
    const events = await adminAuditEventsFor(admin.entityId);
    const noApprover = events.find(
      (e) => e.details.action === "DUAL_CONTROL_NO_APPROVER_AVAILABLE",
    );
    expect(noApprover).toBeDefined();
    expect(noApprover!.outcome).toBe("DENIED");
    expect(noApprover!.denial_reason).toBe("ESCALATION_TARGET_NOT_FOUND");
    expect(noApprover!.details.action_descriptor_type).toBe(
      MONETIZATION_ACTION_TYPE,
    );
    expect(noApprover!.details.route).toBe(
      "/api/v1/platform/monetization/config",
    );
    expect(noApprover!.details.method).toBe("PATCH");
    expect(noApprover!.details.target_resolution_reason).toBe(
      "no-eligible-target",
    );

    // No forbidden keys in audit details.
    const auditKeys = Object.keys(noApprover!.details).map((k) => k.toLowerCase());
    const FORBIDDEN_AUDIT_KEYS = [
      "candidate_pool_size",
      "candidate_ids",
      "candidates",
      "secret",
      "request_body",
      "raw_body",
      "headers",
      "permission_envelope",
      "cross_org",
      "payload_summary",
      "payload_content",
      "storage_location",
      "content_hash",
      "embedding",
      "vector",
    ];
    for (const banned of FORBIDDEN_AUDIT_KEYS) {
      expect(auditKeys).not.toContain(banned);
    }

    // The standard PRE -> LOOKUP sequence still ran (they fire before the
    // resolver), then the fail-closed marker terminates the path. The
    // HANDLER_DENIED path is NOT taken; only NO_APPROVER_AVAILABLE.
    const dualControlActions = events
      .map((e) => String(e.details.action ?? ""))
      .filter((a) => a.startsWith("DUAL_CONTROL_"));
    expect(dualControlActions).toContain("DUAL_CONTROL_VERIFICATION_PRE");
    expect(dualControlActions).toContain("DUAL_CONTROL_ESCALATION_LOOKUP");
    expect(dualControlActions).toContain("DUAL_CONTROL_NO_APPROVER_AVAILABLE");
    expect(dualControlActions).not.toContain("DUAL_CONTROL_HANDLER_DENIED");
    expect(dualControlActions).not.toContain("DUAL_CONTROL_HANDLER_DELEGATED");
  });
});

describe("ADR-0026 Amendment 1 Phase E: BG.2 regression (Test 11)", () => {
  it("a valid break-glass grant short-circuits Phase E and delegates; resolver is NOT invoked", async () => {
    // Critical: single-admin deployment -- WITHOUT break-glass this request
    // would fail closed 503. Break-glass MUST short-circuit before the
    // resolver gets a chance to fail closed.
    const admin = await makeAdminAndLogin({ can_admin_niov: true });
    await createBreakGlassGrant(admin.entityId, {
      action_type: MONETIZATION_ACTION_TYPE,
      justification: "primary approver unreachable; phaseE bg regression",
      valid_until: new Date(Date.now() + 60 * 60 * 1000),
    });

    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/platform/monetization/config",
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { niov_fee_share: 0.4, holder_share: 0.6 },
      remoteAddress: admin.ip,
    });
    expect(res.statusCode).toBe(200);

    // BREAK_GLASS_DELEGATED fired; NO_APPROVER_AVAILABLE did NOT.
    const events = await adminAuditEventsFor(admin.entityId);
    const actions = events
      .map((e) => String(e.details.action ?? ""))
      .filter((a) => a.startsWith("DUAL_CONTROL_"));
    expect(actions).toContain("DUAL_CONTROL_BREAK_GLASS_DELEGATED");
    expect(actions).not.toContain("DUAL_CONTROL_NO_APPROVER_AVAILABLE");

    // Config landed.
    const cfg = await prisma.monetizationConfig.findFirst();
    expect(cfg).not.toBeNull();
    expect(cfg!.niov_fee_share).toBeCloseTo(0.4, 5);
  });
});
