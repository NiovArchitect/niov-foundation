// FILE: break-glass-integration.test.ts (integration)
// PURPOSE: HTTP-level coverage for GOVSEC.5 break-glass / time-boxed audit
//          (GAP-K1, ADR-0050) BG.2 live integration. Exercises end-to-end
//          against real Postgres: (1) the invoke + review route surface
//          (break-glass.routes.ts, can_admin_niov), and (2) the live
//          recognition seam in dual-control.middleware.ts -- a valid,
//          single-use, time-boxed grant lets a privileged request proceed
//          when no APPROVED dual-control escalation exists, while a normal
//          APPROVED escalation still wins first, expired/mismatched/used
//          grants do not authorize, and GAP-C1 self-approval is untouched.
//          The privileged route under test is
//          PATCH /api/v1/platform/monetization/config (Operation A).
// CONNECTS TO: buildApp (full Fastify wiring), AuthService (direct-login),
//              prisma (seeding + audit/grant reads),
//              apps/api/src/routes/break-glass.routes.ts (routes under test),
//              apps/api/src/middleware/dual-control.middleware.ts (the BG.2
//              seam), apps/api/src/routes/platform.routes.ts (the privileged
//              route the seam fronts), escalation.service.ts
//              (createEscalationForCaller / approveEscalationForCaller for the
//              APPROVED-wins fixture), privileged-endpoints.ts
//              (dualControlDescription), tests/integration/
//              dual-control-binding-config.test.ts (the harness this mirrors).
//
// CLEANUP: break_glass_grants + escalation_requests have no onDelete: Cascade
// to test entities, so this file owns their cleanup BEFORE cleanupTestData().
// monetization_config is cleared between tests (the route findFirst-or-default
// restores 0.3/0.7 on an empty table). audit_events are NOT cleaned (ADR-0002
// BEFORE DELETE trigger); isolation is by fresh-per-test admins +
// actor/grant filtering.

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

const TEST_JWT_SECRET = "break-glass-integration-test-secret-do-not-use";
const TEST_KEY = randomBytes(32);
const MONETIZATION_ACTION_TYPE = "PLATFORM_MONETIZATION_CONFIG_UPDATE" as const;
const ORG_ACTION_TYPE = "PLATFORM_ORG_CREATION" as const;
const PRIVILEGED_ROUTE = "/api/v1/platform/monetization/config";
const BG_GRANTS_ROUTE = "/api/v1/break-glass/grants";
const PRIVATE_JUSTIFICATION =
  "primary approver unreachable; urgent revenue-split correction xyz-secret";

let app: FastifyInstance;
const store = new MemoryRateLimitStore();

function future(ms = 60 * 60 * 1000): Date {
  return new Date(Date.now() + ms);
}

// ---------------------------------------------------------------------------
// Cleanup helpers (run BEFORE cleanupTestData)
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

// Create + login a PERSON, optionally with can_admin_niov on its TAR (mirrors
// dual-control-binding-config.test.ts:makeAdminAndLogin).
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

  const ip = `10.97.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 254) + 1}`;
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

// Seed a distinct PERSON entity with can_admin_niov on its TAR so the
// ADR-0026 Amendment 1 Phase E resolver can select a structurally independent
// platform-admin approver. Tests that exercise the ordinary "no APPROVED ->
// 403 ESCALATION_PENDING + PENDING row created" path (post-break-glass-consume
// retry, expired grant, action mismatch, no grant at all) must seed a second
// platform-admin so the resolver class C path succeeds; otherwise the single-
// admin deployment fails closed at 503 with DUAL_CONTROL_NO_APPROVER_AVAILABLE.
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

// Create + approve a dual-control EscalationRequest for the caller (distinct
// approver -- GAP-C1: source may NOT self-approve). The APPROVED-wins fixture.
async function grantApproval(callerEntityId: string): Promise<string> {
  const distinctApprover = await createEntity(
    makeEntityInput({ entity_type: "PERSON" }),
  );
  const created = await createEscalationForCaller(callerEntityId, {
    target_entity_id: distinctApprover.entity_id,
    escalation_type: "DUAL_CONTROL_REQUIRED",
    severity: "HIGH",
    description: dualControlDescription(MONETIZATION_ACTION_TYPE),
    expires_at: null,
  });
  await approveEscalationForCaller(
    distinctApprover.entity_id,
    created.escalation_id,
  );
  return created.escalation_id;
}

// Invoke (create) a break-glass grant via the route.
async function invokeGrant(
  actor: { token: string; ip: string },
  body: { action_type?: string; justification?: string; valid_until?: unknown },
) {
  return app.inject({
    method: "POST",
    url: BG_GRANTS_ROUTE,
    headers: { authorization: `Bearer ${actor.token}` },
    payload: body as Record<string, unknown>,
    remoteAddress: actor.ip,
  });
}

async function patchConfig(
  actor: { token: string; ip: string },
  payload: { niov_fee_share: number; holder_share: number },
) {
  return app.inject({
    method: "PATCH",
    url: PRIVILEGED_ROUTE,
    headers: { authorization: `Bearer ${actor.token}` },
    payload,
    remoteAddress: actor.ip,
  });
}

// ---------------------------------------------------------------------------
// Audit-read helpers
// ---------------------------------------------------------------------------

async function breakGlassUsedFor(
  grantId: string,
): Promise<{ actor_entity_id: string | null; details: Record<string, unknown> } | undefined> {
  const rows = await prisma.auditEvent.findMany({
    where: { event_type: "BREAK_GLASS_USED" },
    orderBy: { timestamp: "desc" },
    take: 50,
  });
  const match = rows.find(
    (r) => (r.details as Record<string, unknown>).grant_id === grantId,
  );
  return match === undefined
    ? undefined
    : { actor_entity_id: match.actor_entity_id, details: match.details as Record<string, unknown> };
}

async function adminActionsFor(entityId: string): Promise<
  Array<{ details: Record<string, unknown>; denial_reason: string | null }>
> {
  const rows = await prisma.auditEvent.findMany({
    where: { event_type: "ADMIN_ACTION", actor_entity_id: entityId },
    orderBy: { timestamp: "asc" },
  });
  return rows.map((r) => ({
    details: r.details as Record<string, unknown>,
    denial_reason: r.denial_reason,
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
// Route tests
// ---------------------------------------------------------------------------

describe("GOVSEC.5 break-glass BG.2 routes (GAP-K1, ADR-0050)", () => {
  it("can_admin_niov invokes an ACTIVE grant; response carries lifecycle metadata, NOT justification", async () => {
    const admin = await makeAdminAndLogin({ can_admin_niov: true });
    const res = await invokeGrant(admin, {
      action_type: MONETIZATION_ACTION_TYPE,
      justification: PRIVATE_JUSTIFICATION,
      valid_until: future().toISOString(),
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { ok: boolean; grant: Record<string, unknown> };
    expect(body.ok).toBe(true);
    expect(body.grant.action_type).toBe(MONETIZATION_ACTION_TYPE);
    expect(body.grant.status).toBe("ACTIVE");
    expect(typeof body.grant.grant_id).toBe("string");
    expect(body.grant.valid_from).toBeDefined();
    expect(body.grant.valid_until).toBeDefined();
    expect(body.grant.justification).toBeUndefined();
    expect(res.body).not.toContain("xyz-secret");
  });

  it("invoke rejects empty justification -> 400", async () => {
    const admin = await makeAdminAndLogin({ can_admin_niov: true });
    const res = await invokeGrant(admin, {
      action_type: MONETIZATION_ACTION_TYPE,
      justification: "   ",
      valid_until: future().toISOString(),
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { code: string }).code).toBe("BREAK_GLASS_JUSTIFICATION_REQUIRED");
  });

  it("invoke rejects missing valid_until -> 400", async () => {
    const admin = await makeAdminAndLogin({ can_admin_niov: true });
    const res = await invokeGrant(admin, {
      action_type: MONETIZATION_ACTION_TYPE,
      justification: "x",
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { code: string }).code).toBe("BREAK_GLASS_VALID_UNTIL_REQUIRED");
  });

  it("invoke rejects a past valid_until -> 400", async () => {
    const admin = await makeAdminAndLogin({ can_admin_niov: true });
    const res = await invokeGrant(admin, {
      action_type: MONETIZATION_ACTION_TYPE,
      justification: "x",
      valid_until: new Date(Date.now() - 60_000).toISOString(),
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { code: string }).code).toBe("BREAK_GLASS_VALID_UNTIL_IN_PAST");
  });

  it("invoke rejects an out-of-scope action -> 400", async () => {
    const admin = await makeAdminAndLogin({ can_admin_niov: true });
    const res = await invokeGrant(admin, {
      action_type: "NOT_A_PRIVILEGED_ACTION",
      justification: "x",
      valid_until: future().toISOString(),
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { code: string }).code).toBe("BREAK_GLASS_ACTION_NOT_PRIVILEGED");
  });

  it("invoke without can_admin_niov -> 403 ADMIN_CAPABILITY_REQUIRED", async () => {
    const nonAdmin = await makeAdminAndLogin({ can_admin_niov: false });
    const res = await invokeGrant(nonAdmin, {
      action_type: MONETIZATION_ACTION_TYPE,
      justification: "x",
      valid_until: future().toISOString(),
    });
    expect(res.statusCode).toBe(403);
    expect((res.json() as { error: string }).error).toBe("ADMIN_CAPABILITY_REQUIRED");
  });

  it("a DISTINCT reviewer can review a grant -> 200 REVIEWED; response has no justification", async () => {
    const source = await makeAdminAndLogin({ can_admin_niov: true });
    const reviewer = await makeAdminAndLogin({ can_admin_niov: true });
    const created = await invokeGrant(source, {
      action_type: MONETIZATION_ACTION_TYPE,
      justification: PRIVATE_JUSTIFICATION,
      valid_until: future().toISOString(),
    });
    const grantId = (created.json() as { grant: { grant_id: string } }).grant.grant_id;

    const res = await app.inject({
      method: "POST",
      url: `${BG_GRANTS_ROUTE}/${grantId}/review`,
      headers: { authorization: `Bearer ${reviewer.token}` },
      remoteAddress: reviewer.ip,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean; grant: Record<string, unknown> };
    expect(body.grant.status).toBe("REVIEWED");
    expect(body.grant.reviewed_by_entity_id).toBe(reviewer.entityId);
    expect(body.grant.reviewed_at).toBeDefined();
    expect(body.grant.justification).toBeUndefined();
    expect(res.body).not.toContain("xyz-secret");
  });

  it("self-review (reviewer === source) -> 403 BREAK_GLASS_SELF_REVIEW_FORBIDDEN", async () => {
    const source = await makeAdminAndLogin({ can_admin_niov: true });
    const created = await invokeGrant(source, {
      action_type: MONETIZATION_ACTION_TYPE,
      justification: "x",
      valid_until: future().toISOString(),
    });
    const grantId = (created.json() as { grant: { grant_id: string } }).grant.grant_id;

    const res = await app.inject({
      method: "POST",
      url: `${BG_GRANTS_ROUTE}/${grantId}/review`,
      headers: { authorization: `Bearer ${source.token}` },
      remoteAddress: source.ip,
    });
    expect(res.statusCode).toBe(403);
    expect((res.json() as { code: string }).code).toBe("BREAK_GLASS_SELF_REVIEW_FORBIDDEN");
  });
});

// ---------------------------------------------------------------------------
// Live dual-control seam tests
// ---------------------------------------------------------------------------

describe("GOVSEC.5 break-glass BG.2 live dual-control seam", () => {
  it("a valid grant authorizes the privileged route when NO approved escalation exists; emits BREAK_GLASS_USED + DELEGATED marker (no justification leak)", async () => {
    const admin = await makeAdminAndLogin({ can_admin_niov: true });
    const created = await invokeGrant(admin, {
      action_type: MONETIZATION_ACTION_TYPE,
      justification: PRIVATE_JUSTIFICATION,
      valid_until: future().toISOString(),
    });
    const grantId = (created.json() as { grant: { grant_id: string } }).grant.grant_id;

    const res = await patchConfig(admin, { niov_fee_share: 0.4, holder_share: 0.6 });
    expect(res.statusCode).toBe(200);
    const cfg = await prisma.monetizationConfig.findFirst();
    expect(cfg!.niov_fee_share).toBeCloseTo(0.4, 5);

    // BREAK_GLASS_USED emitted, grant/action only, no justification.
    const used = await breakGlassUsedFor(grantId);
    expect(used).toBeDefined();
    expect(used!.actor_entity_id).toBe(admin.entityId);
    expect(used!.details.action_type).toBe(MONETIZATION_ACTION_TYPE);
    expect(JSON.stringify(used!.details)).not.toContain("xyz-secret");

    // The dual-control-side marker is present; the normal APPROVAL_VERIFIED is NOT.
    const actions = (await adminActionsFor(admin.entityId)).map((a) => String(a.details.action ?? ""));
    expect(actions).toContain("DUAL_CONTROL_BREAK_GLASS_DELEGATED");
    expect(actions).not.toContain("DUAL_CONTROL_APPROVAL_VERIFIED");

    // The grant is now consumed (single-use).
    const after = await prisma.breakGlassGrant.findUnique({ where: { grant_id: grantId } });
    expect(after!.status).toBe("USED");
  });

  it("single-use: a second privileged request under the same grant is denied (403 ESCALATION_PENDING)", async () => {
    const admin = await makeAdminAndLogin({ can_admin_niov: true });
    // Phase E: seed an independent approver so the post-consume retry's
    // resolver class C succeeds and the ordinary 403 ESCALATION_PENDING path
    // is reached rather than the 503 NO_APPROVER_AVAILABLE fail-closed path.
    await seedDistinctPlatformAdmin();
    await invokeGrant(admin, {
      action_type: MONETIZATION_ACTION_TYPE,
      justification: "x",
      valid_until: future().toISOString(),
    });

    const first = await patchConfig(admin, { niov_fee_share: 0.4, holder_share: 0.6 });
    expect(first.statusCode).toBe(200);

    const second = await patchConfig(admin, { niov_fee_share: 0.25, holder_share: 0.75 });
    expect(second.statusCode).toBe(403);
    expect((second.json() as { error: string }).error).toBe("ESCALATION_PENDING");
  });

  it("an expired grant does NOT authorize the privileged route -> 403", async () => {
    const admin = await makeAdminAndLogin({ can_admin_niov: true });
    // Phase E: independent approver so the ordinary 403 path is reached
    // (else single-admin fails closed at 503).
    await seedDistinctPlatformAdmin();
    const created = await invokeGrant(admin, {
      action_type: MONETIZATION_ACTION_TYPE,
      justification: "x",
      valid_until: future().toISOString(),
    });
    const grantId = (created.json() as { grant: { grant_id: string } }).grant.grant_id;
    // Force the window closed (cannot create with a past valid_until).
    await prisma.breakGlassGrant.update({
      where: { grant_id: grantId },
      data: { valid_until: new Date(Date.now() - 1000) },
    });

    const res = await patchConfig(admin, { niov_fee_share: 0.4, holder_share: 0.6 });
    expect(res.statusCode).toBe(403);
    // Grant untouched by the request path (no auto-expire write).
    const after = await prisma.breakGlassGrant.findUnique({ where: { grant_id: grantId } });
    expect(after!.status).toBe("ACTIVE");
  });

  it("a grant for a DIFFERENT action does NOT authorize the privileged route -> 403", async () => {
    const admin = await makeAdminAndLogin({ can_admin_niov: true });
    // Phase E: independent approver so the ordinary 403 path is reached.
    await seedDistinctPlatformAdmin();
    await invokeGrant(admin, {
      action_type: ORG_ACTION_TYPE,
      justification: "x",
      valid_until: future().toISOString(),
    });

    const res = await patchConfig(admin, { niov_fee_share: 0.4, holder_share: 0.6 });
    expect(res.statusCode).toBe(403);
  });

  it("normal APPROVED dual-control still wins (no break-glass grant) -> 200 via APPROVAL_VERIFIED", async () => {
    const admin = await makeAdminAndLogin({ can_admin_niov: true });
    await grantApproval(admin.entityId);

    const res = await patchConfig(admin, { niov_fee_share: 0.4, holder_share: 0.6 });
    expect(res.statusCode).toBe(200);
    const actions = (await adminActionsFor(admin.entityId)).map((a) => String(a.details.action ?? ""));
    expect(actions).toContain("DUAL_CONTROL_APPROVAL_VERIFIED");
    expect(actions).not.toContain("DUAL_CONTROL_BREAK_GLASS_DELEGATED");
  });

  it("an APPROVED escalation wins over a present break-glass grant; the grant is NOT consumed", async () => {
    const admin = await makeAdminAndLogin({ can_admin_niov: true });
    await grantApproval(admin.entityId);
    const created = await invokeGrant(admin, {
      action_type: MONETIZATION_ACTION_TYPE,
      justification: "x",
      valid_until: future().toISOString(),
    });
    const grantId = (created.json() as { grant: { grant_id: string } }).grant.grant_id;

    const res = await patchConfig(admin, { niov_fee_share: 0.4, holder_share: 0.6 });
    expect(res.statusCode).toBe(200);
    const actions = (await adminActionsFor(admin.entityId)).map((a) => String(a.details.action ?? ""));
    expect(actions).toContain("DUAL_CONTROL_APPROVAL_VERIFIED");
    expect(actions).not.toContain("DUAL_CONTROL_BREAK_GLASS_DELEGATED");
    // The break-glass grant remains ACTIVE -- approved path never reached it.
    const after = await prisma.breakGlassGrant.findUnique({ where: { grant_id: grantId } });
    expect(after!.status).toBe("ACTIVE");
  });

  it("the ordinary denied path is unchanged when no grant exists -> 403 ESCALATION_PENDING + a PENDING escalation is created", async () => {
    const admin = await makeAdminAndLogin({ can_admin_niov: true });
    // Phase E: independent approver so the ordinary 403 path is reached
    // (else single-admin fails closed at 503 NO_APPROVER_AVAILABLE).
    const distinctApprover = await seedDistinctPlatformAdmin();

    const res = await patchConfig(admin, { niov_fee_share: 0.4, holder_share: 0.6 });
    expect(res.statusCode).toBe(403);
    expect((res.json() as { error: string }).error).toBe("ESCALATION_PENDING");
    const escRows = await prisma.escalationRequest.findMany({
      where: { source_entity_id: admin.entityId, escalation_type: "DUAL_CONTROL_REQUIRED" },
    });
    expect(escRows).toHaveLength(1);
    expect(escRows[0]!.status).toBe("PENDING");
    // ADR-0026 Amendment 1 Phase E: auto-created target is the independently
    // resolved class-C approver, never the caller.
    expect(escRows[0]!.target_entity_id).toBe(distinctApprover);
    expect(escRows[0]!.target_entity_id).not.toBe(admin.entityId);
  });
});
