// FILE: dual-control-binding-config.test.ts (integration)
// PURPOSE: HTTP-level coverage for the dual-control binding on
//          PATCH /api/v1/platform/monetization/config (Operation A;
//          sub-phase F [SEC-DUAL-CONTROL-BINDING-CONFIG]). Exercises the
//          full substrate end-to-end against real Postgres: the
//          requireDualControl preHandler (after requireAdminCapability),
//          the Zone U1 audit-event sequence, the EscalationRequest
//          lifecycle (get-or-create + approve), and the handler's own
//          MONETIZATION_CONFIG_UPDATE audit + the 422 body-validation
//          path (re-homed here from admin-routes.test.ts because the
//          route now carries the dual-control gate -- a caller without an
//          APPROVED dual-control EscalationRequest gets 403 before the
//          handler ever runs).
// CONNECTS TO: buildApp (full Fastify wiring), AuthService (direct-login
//              helper), prisma (test seeding + audit/escalation reads),
//              apps/api/src/routes/platform.routes.ts (the route under
//              test), apps/api/src/middleware/dual-control.middleware.ts
//              (the requireDualControl preHandler), escalation.service.ts
//              (createEscalationForCaller / approveEscalationForCaller for
//              the APPROVED-fixture), apps/api/src/security/privileged-endpoints.ts
//              (dualControlDescription -- the description carrier),
//              docs/architecture/dual-control-operations-canonical-record.md
//              §3 + §4 (verification flow + Zone U1 audit-event sequence),
//              tests/integration/admin-routes.test.ts (the makeAdminAndLogin
//              pattern this file mirrors; the prior home of the two
//              monetization-config route tests).
//
// cleanupTestEscalations RATIONALE: same as tests/unit/escalation.test.ts
// + tests/integration/escalation-routes.test.ts -- EscalationRequest
// entity relations have no onDelete: Cascade, so this file owns its
// escalation_requests cleanup, running BEFORE cleanupTestData(). It also
// clears monetization_config between tests (the route's findFirst-or-
// default fallback restores 0.3/0.7 on an empty table). audit_events are
// NOT cleaned (the ADR-0002 BEFORE DELETE trigger forbids it); test
// isolation comes from fresh-per-test admin entities + actor_entity_id
// filtering.

import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  approveEscalationForCaller,
  buildApp,
  createEscalationForCaller,
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

const TEST_JWT_SECRET = "dual-control-binding-config-test-secret-do-not-use";
const TEST_KEY = randomBytes(32);
const MONETIZATION_ACTION_TYPE = "PLATFORM_MONETIZATION_CONFIG_UPDATE" as const;
const ROUTE_URL = "/api/v1/platform/monetization/config";

let app: FastifyInstance;
const store = new MemoryRateLimitStore();

// ---------------------------------------------------------------------------
// Cleanup helpers
// ---------------------------------------------------------------------------

// WHAT: Delete every escalation_requests row referencing a test entity.
// INPUT: None.
// OUTPUT: A promise that resolves once the rows are gone.
// WHY: Must run BEFORE cleanupTestData() -- see the file-header rationale.
async function cleanupTestEscalations(): Promise<void> {
  const testEntities = await prisma.entity.findMany({
    where: { display_name: { startsWith: TEST_PREFIX } },
    select: { entity_id: true },
  });
  const ids = testEntities.map((e) => e.entity_id);
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

// WHAT: Clear the monetization_config table.
// INPUT: None.
// OUTPUT: A promise that resolves once the rows are gone.
// WHY: The route does findFirst-or-default; an empty table means the next
//      test (or file) sees the spec default 0.3/0.7. Keeps tests isolated.
async function cleanupMonetizationConfig(): Promise<void> {
  await prisma.monetizationConfig.deleteMany({});
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// WHAT: Create + login a PERSON entity with optional can_admin_niov on
//        its TAR (mirrors admin-routes.test.ts:makeAdminAndLogin).
// INPUT: { can_admin_niov?: boolean }.
// OUTPUT: { entityId, token, ip }.
// WHY: The route is can_admin_niov-gated; tests need a logged-in actor
//      whose TAR carries (or lacks) that capability. The first NIOV
//      Platform Admin cannot be minted via the API (the gate); tests
//      seed via prisma directly -- the documented bootstrap gap.
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

  const ip = `10.98.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 254) + 1}`;
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

// WHAT: Seed a distinct PERSON entity with can_admin_niov on its TAR so the
//        ADR-0026 Amendment 1 Phase E resolver can select a structurally
//        independent platform-admin approver. Does NOT log the entity in --
//        the resolver queries the persisted TAR/Entity state directly.
// INPUT: None.
// OUTPUT: The new platform-admin's entity_id.
// WHY: The resolver fails closed (503 ESCALATION_TARGET_NOT_FOUND + the
//      DUAL_CONTROL_NO_APPROVER_AVAILABLE marker) when the calling admin is
//      the only can_admin_niov entity. Tests that exercise the normal
//      "no APPROVED escalation -> 403 ESCALATION_PENDING + PENDING row created"
//      path must seed a second platform-admin so the resolver class C path
//      succeeds. Same TAR-hash recompute discipline as makeAdminAndLogin.
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

// WHAT: Create + approve a dual-control EscalationRequest for the caller
//        on the monetization-config action.
// INPUT: callerEntityId + optional expiresAt (defaults to null).
// OUTPUT: The approved escalation_id.
// WHY: The APPROVED-path fixture. GOVSEC.5 GAP-C1: the source/initiator may NOT
//      self-approve, so a DISTINCT second human is the target/approver. The caller
//      remains the source, so findApprovedDualControlForCaller(caller, …) — scoped
//      by source_entity_id — still discovers the row; evaluateDualControlState does
//      not branch on the target. This is a genuine two-person approval.
async function grantApproval(
  callerEntityId: string,
  expiresAt: Date | null = null,
): Promise<string> {
  const distinctApprover = await createEntity(
    makeEntityInput({ entity_type: "PERSON" }),
  );
  const created = await createEscalationForCaller(callerEntityId, {
    target_entity_id: distinctApprover.entity_id,
    escalation_type: "DUAL_CONTROL_REQUIRED",
    severity: "HIGH",
    description: dualControlDescription(MONETIZATION_ACTION_TYPE),
    expires_at: expiresAt,
  });
  await approveEscalationForCaller(
    distinctApprover.entity_id,
    created.escalation_id,
  );
  return created.escalation_id;
}

// ---------------------------------------------------------------------------
// Audit-read helpers
// ---------------------------------------------------------------------------

async function adminAuditEventsFor(entityId: string): Promise<
  Array<{
    event_type: string;
    actor_entity_id: string | null;
    denial_reason: string | null;
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
    details: r.details as Record<string, unknown>,
  }));
}

async function dualControlActionsFor(entityId: string): Promise<string[]> {
  const events = await adminAuditEventsFor(entityId);
  return events
    .map((e) => String(e.details.action ?? ""))
    .filter((a) => a.startsWith("DUAL_CONTROL_"));
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeAll(async () => {
  await ensureAuditTriggers();
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
  await cleanupTestEscalations();
  await cleanupMonetizationConfig();
  await cleanupTestData();
  await prisma.$disconnect();
});

withCleanRateLimits(store);

beforeEach(async () => {
  await cleanupTestEscalations();
  await cleanupMonetizationConfig();
  await cleanupTestData();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PATCH /platform/monetization/config + dual-control binding", () => {
  it("no APPROVED escalation -> 403, creates a PENDING one, writes PRE+LOOKUP+HANDLER_DENIED, handler never runs", async () => {
    const admin = await makeAdminAndLogin({ can_admin_niov: true });
    const distinctApprover = await seedDistinctPlatformAdmin();
    const res = await app.inject({
      method: "PATCH",
      url: ROUTE_URL,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { niov_fee_share: 0.4, holder_share: 0.6 },
      remoteAddress: admin.ip,
    });

    expect(res.statusCode).toBe(403);
    const body = res.json() as { ok: boolean; error: string; escalation_id: string | null };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("ESCALATION_PENDING");
    expect(body.escalation_id).toMatch(/^[0-9a-f-]{36}$/);

    const escRows = await prisma.escalationRequest.findMany({
      where: { source_entity_id: admin.entityId, escalation_type: "DUAL_CONTROL_REQUIRED" },
    });
    expect(escRows).toHaveLength(1);
    expect(escRows[0]!.status).toBe("PENDING");
    expect(escRows[0]!.description).toBe(dualControlDescription(MONETIZATION_ACTION_TYPE));
    expect(escRows[0]!.escalation_id).toBe(body.escalation_id);
    // ADR-0026 Amendment 1 Phase E (Test 7 of §9): auto-created target is a
    // structurally independent approver, never the caller. Class C selects
    // the lowest-entity_id non-caller can_admin_niov; with two admins, that
    // is whichever of {admin, distinctApprover} sorts first excluding admin
    // -- i.e. distinctApprover.
    expect(escRows[0]!.target_entity_id).not.toBe(admin.entityId);
    expect(escRows[0]!.target_entity_id).toBe(distinctApprover);
    expect(escRows[0]!.source_entity_id).toBe(admin.entityId);
    expect(escRows[0]!.resolved_by_entity_id).toBeNull();

    expect(await dualControlActionsFor(admin.entityId)).toEqual([
      "DUAL_CONTROL_VERIFICATION_PRE",
      "DUAL_CONTROL_ESCALATION_LOOKUP",
      "DUAL_CONTROL_HANDLER_DENIED",
    ]);
    const events = await adminAuditEventsFor(admin.entityId);
    expect(events.filter((e) => e.details.action === "ESCALATION_CREATED")).toHaveLength(1);
    expect(events.filter((e) => e.details.action === "MONETIZATION_CONFIG_UPDATE")).toHaveLength(0);
    // Handler never ran -> no config row.
    expect(await prisma.monetizationConfig.findFirst()).toBeNull();
  });

  it("APPROVED escalation -> 200, config lands, writes PRE+LOOKUP+VERIFIED+DELEGATED + the handler's MONETIZATION_CONFIG_UPDATE", async () => {
    const admin = await makeAdminAndLogin({ can_admin_niov: true });
    await grantApproval(admin.entityId);

    const res = await app.inject({
      method: "PATCH",
      url: ROUTE_URL,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { niov_fee_share: 0.4, holder_share: 0.6 },
      remoteAddress: admin.ip,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      ok: boolean;
      config: { niov_fee_share: number; holder_share: number };
    };
    expect(body.ok).toBe(true);
    expect(body.config.niov_fee_share).toBeCloseTo(0.4, 5);
    expect(body.config.holder_share).toBeCloseTo(0.6, 5);

    const cfg = await prisma.monetizationConfig.findFirst();
    expect(cfg).not.toBeNull();
    expect(cfg!.niov_fee_share).toBeCloseTo(0.4, 5);
    expect(cfg!.holder_share).toBeCloseTo(0.6, 5);

    expect(await dualControlActionsFor(admin.entityId)).toEqual([
      "DUAL_CONTROL_VERIFICATION_PRE",
      "DUAL_CONTROL_ESCALATION_LOOKUP",
      "DUAL_CONTROL_APPROVAL_VERIFIED",
      "DUAL_CONTROL_HANDLER_DELEGATED",
    ]);
    const events = await adminAuditEventsFor(admin.entityId);
    const monet = events.find((e) => e.details.action === "MONETIZATION_CONFIG_UPDATE");
    expect(monet).toBeDefined();
    const details = monet!.details as {
      old: { niov_fee_share: number };
      new: { niov_fee_share: number };
    };
    expect(typeof details.old.niov_fee_share).toBe("number");
    expect(details.new.niov_fee_share).toBeCloseTo(0.4, 5);
  });

  it("a PENDING escalation already exists -> 403, references the existing one, does NOT create a duplicate", async () => {
    const admin = await makeAdminAndLogin({ can_admin_niov: true });
    const preSeededApprover = await seedDistinctPlatformAdmin();
    // Pre-seed a PENDING dual-control row with a real distinct approver
    // (Phase E target shape -- target_entity_id !== source_entity_id is the
    // structural Invariant 2). The dedup query keys on
    // (source, escalation_type, status, description); the auto-create path
    // still finds and returns this row without writing a duplicate.
    const original = await createEscalationForCaller(admin.entityId, {
      target_entity_id: preSeededApprover,
      escalation_type: "DUAL_CONTROL_REQUIRED",
      severity: "HIGH",
      description: dualControlDescription(MONETIZATION_ACTION_TYPE),
    });

    const res = await app.inject({
      method: "PATCH",
      url: ROUTE_URL,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { niov_fee_share: 0.4, holder_share: 0.6 },
      remoteAddress: admin.ip,
    });

    expect(res.statusCode).toBe(403);
    expect((res.json() as { escalation_id: string }).escalation_id).toBe(original.escalation_id);

    const escRows = await prisma.escalationRequest.findMany({
      where: {
        source_entity_id: admin.entityId,
        escalation_type: "DUAL_CONTROL_REQUIRED",
        status: "PENDING",
      },
    });
    expect(escRows).toHaveLength(1);
    const events = await adminAuditEventsFor(admin.entityId);
    expect(events.filter((e) => e.details.action === "ESCALATION_CREATED")).toHaveLength(1);
  });

  it("an APPROVED but past-expiry escalation -> 403 with denial_reason ESCALATION_EXPIRED", async () => {
    const admin = await makeAdminAndLogin({ can_admin_niov: true });
    const escId = await grantApproval(admin.entityId, new Date(Date.now() - 60_000));

    const res = await app.inject({
      method: "PATCH",
      url: ROUTE_URL,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { niov_fee_share: 0.4, holder_share: 0.6 },
      remoteAddress: admin.ip,
    });

    expect(res.statusCode).toBe(403);
    const body = res.json() as { error: string; escalation_id: string | null };
    expect(body.error).toBe("ESCALATION_EXPIRED");
    expect(body.escalation_id).toBe(escId);

    expect(await dualControlActionsFor(admin.entityId)).toEqual([
      "DUAL_CONTROL_VERIFICATION_PRE",
      "DUAL_CONTROL_ESCALATION_LOOKUP",
      "DUAL_CONTROL_HANDLER_DENIED",
    ]);
    const events = await adminAuditEventsFor(admin.entityId);
    const denied = events.find((e) => e.details.action === "DUAL_CONTROL_HANDLER_DENIED")!;
    expect(denied.denial_reason).toBe("ESCALATION_EXPIRED");
    expect(await prisma.monetizationConfig.findFirst()).toBeNull();
  });

  it("caller lacking can_admin_niov -> 403 from requireAdminCapability BEFORE requireDualControl runs (zero dual-control audit events)", async () => {
    const nonAdmin = await makeAdminAndLogin({ can_admin_niov: false });
    const res = await app.inject({
      method: "PATCH",
      url: ROUTE_URL,
      headers: { authorization: `Bearer ${nonAdmin.token}` },
      payload: { niov_fee_share: 0.4, holder_share: 0.6 },
      remoteAddress: nonAdmin.ip,
    });

    expect(res.statusCode).toBe(403);
    expect((res.json() as { error: string }).error).toBe("ADMIN_CAPABILITY_REQUIRED");
    // requireDualControl never ran -> no DUAL_CONTROL_* events, no escalation created.
    expect(await dualControlActionsFor(nonAdmin.entityId)).toEqual([]);
    expect(
      await prisma.escalationRequest.findMany({
        where: { source_entity_id: nonAdmin.entityId, escalation_type: "DUAL_CONTROL_REQUIRED" },
      }),
    ).toHaveLength(0);
  });

  it("idempotent verification (Pattern 5): an APPROVED escalation replayed -> 200 both times, both DELEGATED events reference the same escalation_id", async () => {
    const admin = await makeAdminAndLogin({ can_admin_niov: true });
    const escId = await grantApproval(admin.entityId);

    const res1 = await app.inject({
      method: "PATCH",
      url: ROUTE_URL,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { niov_fee_share: 0.4, holder_share: 0.6 },
      remoteAddress: admin.ip,
    });
    expect(res1.statusCode).toBe(200);

    const res2 = await app.inject({
      method: "PATCH",
      url: ROUTE_URL,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { niov_fee_share: 0.25, holder_share: 0.75 },
      remoteAddress: admin.ip,
    });
    expect(res2.statusCode).toBe(200);

    const events = await adminAuditEventsFor(admin.entityId);
    const delegated = events.filter((e) => e.details.action === "DUAL_CONTROL_HANDLER_DELEGATED");
    expect(delegated).toHaveLength(2);
    expect(delegated.every((e) => e.details.escalation_id === escId)).toBe(true);

    const cfg = await prisma.monetizationConfig.findFirst();
    expect(cfg!.niov_fee_share).toBeCloseTo(0.25, 5);
  });

  it("invalid shares + APPROVED escalation -> 422 SHARES_DO_NOT_SUM_TO_ONE; dual-control still passes (4 events) but the handler rejects (no config change, no MONETIZATION_CONFIG_UPDATE)", async () => {
    const admin = await makeAdminAndLogin({ can_admin_niov: true });
    await grantApproval(admin.entityId);

    const res = await app.inject({
      method: "PATCH",
      url: ROUTE_URL,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { niov_fee_share: 0.5, holder_share: 0.6 },
      remoteAddress: admin.ip,
    });

    expect(res.statusCode).toBe(422);
    expect((res.json() as { code: string }).code).toBe("SHARES_DO_NOT_SUM_TO_ONE");

    expect(await dualControlActionsFor(admin.entityId)).toEqual([
      "DUAL_CONTROL_VERIFICATION_PRE",
      "DUAL_CONTROL_ESCALATION_LOOKUP",
      "DUAL_CONTROL_APPROVAL_VERIFIED",
      "DUAL_CONTROL_HANDLER_DELEGATED",
    ]);
    const events = await adminAuditEventsFor(admin.entityId);
    expect(events.filter((e) => e.details.action === "MONETIZATION_CONFIG_UPDATE")).toHaveLength(0);
    expect(await prisma.monetizationConfig.findFirst()).toBeNull();
  });
});
