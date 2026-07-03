// FILE: admin-routes.test.ts (integration)
// PURPOSE: HTTP-level coverage for the new /platform/* and /org/*
//          admin routes -- capability gating (can_admin_niov,
//          can_admin_org), org scope resolution, cross-tenant
//          isolation on /org/onboarding/invite, and end-to-end
//          createOrg via POST /platform/orgs.
// CONNECTS TO: buildApp (full Fastify wiring), AuthService for
//              direct-login helpers, prisma (test seeding +
//              capability flips), the admin / dandelion services
//              that the routes wrap.
//
// BOOTSTRAP NOTE: The very first NIOV Platform Admin (an entity
// whose TAR has can_admin_niov=true) cannot be created via this
// API (POST /platform/orgs requires the gate). Production
// bootstrap of that first admin happens via Section 14 admin
// tooling (or a one-time SQL seed for initial deployment). Tests
// here seed via prisma directly, which is documented as the
// known bootstrap gap and out of scope for Section 9.

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildApp,
  executePhase0,
  MemoryContentStore,
  MemoryNonceStore,
  MemoryRateLimitStore,
} from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import { createEntity, prisma } from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeEntityInput,
  TEST_PREFIX,
  withCleanRateLimits,
} from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "admin-routes-test-secret-do-not-use-in-prod";
const TEST_KEY = randomBytes(32);

let app: FastifyInstance;
// Per Track A Gate 5 Decision 8 (Drift G5b-J): const-at-module-top
// composes cleanly with withCleanRateLimits' value-capture semantics.
// MemoryRateLimitStore's constructor is sync + side-effect-free
// (allocates two empty Maps), so deferring to beforeAll is unnecessary.
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

// Reset the rate-limit store before every test in this file. Per
// Drift G4-G: containerized Postgres runs ~37x faster than real
// Supabase, so rapid-fire test logins now collide with the auth
// rate limiter. Module-top placement covers all 42 tests across 19
// describe blocks via vitest's beforeEach scoping.
withCleanRateLimits(store);

// WHAT: Create + login a PERSON entity with optional admin flags
//        flipped on its TAR.
// INPUT: Optional flags ({ can_admin_niov, can_admin_org }).
// OUTPUT: { entity, token, ip }.
// WHY: Most route tests need a logged-in actor whose TAR carries a
//      specific admin capability. We bypass /platform/orgs's gate
//      by mutating the TAR via prisma + recompute hash via our own
//      login (login captures the fresh hash).
async function makeAdminAndLogin(opts: {
  can_admin_niov?: boolean;
  can_admin_org?: boolean;
  remoteAddress?: string;
}): Promise<{ entityId: string; token: string; ip: string }> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const entity = await createEntity(input);

  if (opts.can_admin_niov === true || opts.can_admin_org === true) {
    // Flip the admin flags on the TAR. We don't need to recompute
    // the hash here because the next login reads the live TAR and
    // builds the session from it.
    await prisma.tokenAttributeRepository.update({
      where: { entity_id: entity.entity_id },
      data: {
        can_admin_niov: opts.can_admin_niov === true,
        can_admin_org: opts.can_admin_org === true,
      },
    });
    // Recompute hash so requireAdminCapability sees the right shape.
    const fresh = await prisma.tokenAttributeRepository.findUnique({
      where: { entity_id: entity.entity_id },
    });
    if (fresh === null) throw new Error("TAR vanished mid-test");
    // Recompute via the exported computeTARHash to keep the shape
    // canonical.
    const { computeTARHash } = await import("@niov/database");
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

  const ip = opts.remoteAddress ?? `10.99.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 254) + 1}`;
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

// POST /platform/orgs moved to
// tests/integration/dual-control-binding-orgs.test.ts at
// [SEC-DUAL-CONTROL-BINDING-ORGS] (sub-phase G): the route now carries
// the requireDualControl preHandler, so its behavior (the dual-control
// gate + the re-homed can_admin_niov-gate and end-to-end-create cases)
// is exercised in the dedicated dual-control binding test file. The
// createOrgAndAdmin helper below bypasses the route via executePhase0
// (it is an org-setup primitive, not a test of the route).

describe("/org/* -- can_admin_org gate", () => {
  it("returns 403 ADMIN_CAPABILITY_REQUIRED on POST /org/members for callers without can_admin_org", async () => {
    const caller = await makeAdminAndLogin({ can_admin_org: false });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/org/members",
      headers: { authorization: `Bearer ${caller.token}` },
      payload: {
        email: `${TEST_PREFIX}m_${randomUUID()}@niov.test`,
        password: "x",
      },
      remoteAddress: caller.ip,
    });
    expect(response.statusCode).toBe(403);
    const body = response.json() as { error: string; required: string };
    expect(body.error).toBe("ADMIN_CAPABILITY_REQUIRED");
    expect(body.required).toBe("can_admin_org");
  });
});

// WHAT: Build an entire org via Phase 0 and login the admin so we
//        can call /org/* routes against a real org context.
// INPUT: Optional industry override (default TECH).
// OUTPUT: { orgId, adminId, adminToken, adminIp, adminEmail,
//          defaultHiveId }.
// WHY: Hoisted to module scope so the new /org/* describe blocks
//      below can reuse it without re-declaring the helper.
async function createOrgAndAdmin(
  industry: string = "TECH",
): Promise<{
  orgId: string;
  adminId: string;
  adminToken: string;
  adminIp: string;
  adminEmail: string;
  defaultHiveId: string;
}> {
  const platformAdmin = await makeAdminAndLogin({ can_admin_niov: true });
  const companyName = `${TEST_PREFIX}orgco_${randomUUID()}`;
  const adminEmail = `${TEST_PREFIX}orgadmin_${randomUUID()}@niov.test`;
  const adminPassword = "correct-horse-battery";
  // Bypass the dual-control-gated POST /platform/orgs route -- this helper
  // is an org-setup primitive, not a test of the route; create the org
  // via the executePhase0 service function directly. (Sub-box 2 Phase 1
  // sub-phase G [SEC-DUAL-CONTROL-BINDING-ORGS] -- the route's behavior is
  // exercised in tests/integration/dual-control-binding-orgs.test.ts.)
  const orgBody = await executePhase0({
    company_name: companyName,
    industry,
    admin_email: adminEmail,
    admin_password: adminPassword,
    admin_first_name: null,
    admin_last_name: null,
    actor_entity_id: platformAdmin.entityId,
  });
  const adminIp = `10.99.88.${Math.floor(Math.random() * 254) + 1}`;
  const adminLogin = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: {
      email: adminEmail,
      password: adminPassword,
      requested_operations: ["read", "write", "share"],
    },
    remoteAddress: adminIp,
  });
  if (adminLogin.statusCode !== 200) {
    throw new Error(`admin login failed: ${adminLogin.statusCode}`);
  }
  const adminBody = adminLogin.json() as { token: string };
  return {
    orgId: orgBody.org_entity_id,
    adminId: orgBody.admin_entity_id,
    adminToken: adminBody.token,
    adminIp,
    adminEmail,
    defaultHiveId: orgBody.default_hive_id,
  };
}

describe("POST /org/members -- happy path + cross-tenant", () => {
  it("admin can add a member to their own org", async () => {
    const ctx = await createOrgAndAdmin();
    const newEmail = `${TEST_PREFIX}newmem_${randomUUID()}@niov.test`;
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/org/members",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      payload: {
        email: newEmail,
        password: "correct-horse-battery",
        first_name: "New",
        last_name: "Member",
        role_title: "Engineer",
        hierarchy_level: 1,
      },
      remoteAddress: ctx.adminIp,
    });
    expect(response.statusCode).toBe(201);
    const body = response.json() as { ok: boolean; entity_id: string };
    expect(body.ok).toBe(true);
    // Membership exists under the right org.
    const membership = await prisma.entityMembership.findFirst({
      where: { parent_id: ctx.orgId, child_id: body.entity_id },
    });
    expect(membership).not.toBeNull();
  });

  it("CROSS-TENANT: org-A admin attempting Phase 3 invite of an org-B entity returns 404 PENDING_MEMBER_NOT_FOUND", async () => {
    const orgA = await createOrgAndAdmin();
    const orgB = await createOrgAndAdmin();
    // Add a real member to orgB (we'll attack with that entity_id).
    const orgBMemberEmail = `${TEST_PREFIX}orgBpend_${randomUUID()}@niov.test`;
    const addOrgB = await app.inject({
      method: "POST",
      url: "/api/v1/org/members",
      headers: { authorization: `Bearer ${orgB.adminToken}` },
      payload: {
        email: orgBMemberEmail,
        password: "x",
        hierarchy_level: 1,
      },
      remoteAddress: orgB.adminIp,
    });
    expect(addOrgB.statusCode).toBe(201);
    const orgBMemberId = (addOrgB.json() as { entity_id: string }).entity_id;

    // Org-A admin tries to invite that orgB entity.
    const cross = await app.inject({
      method: "POST",
      url: "/api/v1/org/onboarding/invite",
      headers: { authorization: `Bearer ${orgA.adminToken}` },
      payload: { entity_id: orgBMemberId },
      remoteAddress: orgA.adminIp,
    });
    expect(cross.statusCode).toBe(404);
    const body = cross.json() as { code: string };
    expect(body.code).toBe("PENDING_MEMBER_NOT_FOUND");
  });

  it("GET /org/onboarding/status returns the expected shape for the caller's org", async () => {
    const ctx = await createOrgAndAdmin();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/org/onboarding/status",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      remoteAddress: ctx.adminIp,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      ok: boolean;
      total_users: number;
      onboarded_count: number;
      pending_count: number;
      compound_score: number;
      propagation_order: unknown[];
    };
    expect(body.ok).toBe(true);
    expect(typeof body.compound_score).toBe("number");
    expect(Array.isArray(body.propagation_order)).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════
// SECTION 9 FINAL BOX -- read-side endpoint surface
// ════════════════════════════════════════════════════════════════

describe("GET /org/entities + /org/hierarchy", () => {
  it("returns own-org entities with type filter, never other orgs'", async () => {
    const orgA = await createOrgAndAdmin();
    const orgB = await createOrgAndAdmin();

    // Add a member to orgB so we have something to leak.
    const orgBMemberEmail = `${TEST_PREFIX}orgB_${randomUUID()}@niov.test`;
    await app.inject({
      method: "POST",
      url: "/api/v1/org/members",
      headers: { authorization: `Bearer ${orgB.adminToken}` },
      payload: {
        email: orgBMemberEmail,
        password: "x",
        hierarchy_level: 1,
      },
      remoteAddress: orgB.adminIp,
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/org/entities",
      headers: { authorization: `Bearer ${orgA.adminToken}` },
      remoteAddress: orgA.adminIp,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      ok: boolean;
      items: Array<{ entity_id: string; email: string | null }>;
      total: number;
    };
    expect(body.ok).toBe(true);
    // Cross-tenant: orgB's member email must not appear in orgA's list.
    const emails = body.items.map((e) => e.email);
    expect(emails).not.toContain(orgBMemberEmail);
  });

  // [SEC — PROD-UX-APPROVAL-LOOP finding] The raw Entity row carries
  // password_hash; both org-admin entity reads previously returned the
  // unselected row. Credential material must NEVER cross the wire.
  it("entity list AND detail never expose password_hash (safe-field allowlist)", async () => {
    const ctx = await createOrgAndAdmin();
    const list = await app.inject({
      method: "GET",
      url: "/api/v1/org/entities",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      remoteAddress: ctx.adminIp,
    });
    expect(list.statusCode).toBe(200);
    expect(list.body).not.toContain("password_hash");
    const first = (list.json() as { items: Array<{ entity_id: string; display_name: string }> }).items[0];
    expect(first).toBeDefined();
    // The customer-facing contract still holds (display fields present).
    expect(first!.display_name.length).toBeGreaterThan(0);

    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/org/entities/${first!.entity_id}`,
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      remoteAddress: ctx.adminIp,
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.body).not.toContain("password_hash");
    const entity = (detail.json() as { entity: { display_name: string; entity_id: string } }).entity;
    expect(entity.entity_id).toBe(first!.entity_id);
    expect(entity.display_name.length).toBeGreaterThan(0);
  });

  it("GET /org/hierarchy returns memberships for caller's org only", async () => {
    const ctx = await createOrgAndAdmin();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/org/hierarchy",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      remoteAddress: ctx.adminIp,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      ok: boolean;
      org_entity_id: string;
      memberships: Array<{ parent_id: string; child_id: string }>;
    };
    expect(body.org_entity_id).toBe(ctx.orgId);
    expect(body.memberships.every((m) => m.parent_id === ctx.orgId)).toBe(true);
  });
});

describe("GET + PATCH /org/settings", () => {
  it("GET returns the live row when present", async () => {
    const ctx = await createOrgAndAdmin();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/org/settings",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      remoteAddress: ctx.adminIp,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { ok: boolean; settings: { industry: string | null } };
    expect(body.ok).toBe(true);
    expect(body.settings.industry).toBe("TECH");
  });

  it("PATCH updates writable fields", async () => {
    const ctx = await createOrgAndAdmin();
    const response = await app.inject({
      method: "PATCH",
      url: "/api/v1/org/settings",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      payload: { session_timeout_minutes: 720, mfa_required: true },
      remoteAddress: ctx.adminIp,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      ok: boolean;
      settings: { session_timeout_minutes: number; mfa_required: boolean };
    };
    expect(body.settings.session_timeout_minutes).toBe(720);
    expect(body.settings.mfa_required).toBe(true);
  });

  it("PATCH rejects unknown / immutable fields with UNKNOWN_FIELD 422", async () => {
    const ctx = await createOrgAndAdmin();
    const response = await app.inject({
      method: "PATCH",
      url: "/api/v1/org/settings",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      payload: { org_entity_id: "deadbeef-dead-beef-dead-beefdeadbeef", random_field: 42 },
      remoteAddress: ctx.adminIp,
    });
    expect(response.statusCode).toBe(422);
    const body = response.json() as { code: string; unknown_fields: string[] };
    expect(body.code).toBe("UNKNOWN_FIELD");
    expect(body.unknown_fields).toContain("org_entity_id");
    expect(body.unknown_fields).toContain("random_field");
  });
});

describe("GET /org/analytics", () => {
  it("returns compound_score from latest CompoundingMetrics", async () => {
    const ctx = await createOrgAndAdmin();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/org/analytics",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      remoteAddress: ctx.adminIp,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      ok: boolean;
      compound_score: number;
      active_twins: number;
      pending_approvals_count: number;
    };
    expect(body.compound_score).toBe(0); // freshly seeded
    expect(body.active_twins).toBe(1); // admin twin from Phase 0
    expect(body.pending_approvals_count).toBe(0); // stub
  });
});

describe("GET /org/audit -- cross-tenant", () => {
  it("orgA admin sees only orgA audit events", async () => {
    const orgA = await createOrgAndAdmin();
    const orgB = await createOrgAndAdmin();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/org/audit?take=100",
      headers: { authorization: `Bearer ${orgA.adminToken}` },
      remoteAddress: orgA.adminIp,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      items: Array<{ actor_entity_id: string | null; target_entity_id: string | null }>;
    };
    // No event in the response should reference orgB IDs.
    const orgBIds = [orgB.orgId, orgB.adminId];
    for (const e of body.items) {
      expect(orgBIds).not.toContain(e.actor_entity_id);
      expect(orgBIds).not.toContain(e.target_entity_id);
    }
  });
});

// 12C.0 Item 3: GET /org/audit query-param filters.
// Filters AND-narrow within the existing OR-of-actor-or-target
// org-scope; they NEVER widen it. The cross-org leak prevention
// test below is the architectural invariant anchor for all current
// and future filter additions on this endpoint.
describe("GET /org/audit -- 12C.0 query-param filters", () => {
  it("?event_type=ADMIN_ACTION returns only ADMIN_ACTION rows", async () => {
    const ctx = await createOrgAndAdmin();
    // Generate a known ADMIN_ACTION event by inviting a member.
    const memberResp = await app.inject({
      method: "POST",
      url: "/api/v1/org/members",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      payload: {
        email: `${TEST_PREFIX}auditfilter_${randomUUID()}@niov.test`,
        password: "x",
      },
      remoteAddress: ctx.adminIp,
    });
    expect(memberResp.statusCode).toBe(201);
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/org/audit?event_type=ADMIN_ACTION&take=100",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      remoteAddress: ctx.adminIp,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      items: Array<{ event_type: string }>;
    };
    expect(body.items.length).toBeGreaterThan(0);
    for (const e of body.items) expect(e.event_type).toBe("ADMIN_ACTION");
  });

  it("?actor_entity_id=<uuid> narrows to only that actor's events", async () => {
    const ctx = await createOrgAndAdmin();
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/org/audit?actor_entity_id=${ctx.adminId}&take=100`,
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      remoteAddress: ctx.adminIp,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      items: Array<{ actor_entity_id: string | null }>;
    };
    expect(body.items.length).toBeGreaterThan(0);
    for (const e of body.items)
      expect(e.actor_entity_id).toBe(ctx.adminId);
  });

  it("?target_entity_id=<uuid> narrows to only events targeting that entity", async () => {
    const ctx = await createOrgAndAdmin();
    // The org admin's CREATE_ORG audit row targets the org entity.
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/org/audit?target_entity_id=${ctx.orgId}&take=100`,
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      remoteAddress: ctx.adminIp,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      items: Array<{ target_entity_id: string | null }>;
    };
    for (const e of body.items)
      expect(e.target_entity_id).toBe(ctx.orgId);
  });

  it("combined filters compose with AND semantics (event_type + actor_entity_id)", async () => {
    const ctx = await createOrgAndAdmin();
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/org/audit?event_type=ADMIN_ACTION&actor_entity_id=${ctx.adminId}&take=100`,
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      remoteAddress: ctx.adminIp,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      items: Array<{ event_type: string; actor_entity_id: string | null }>;
    };
    for (const e of body.items) {
      expect(e.event_type).toBe("ADMIN_ACTION");
      expect(e.actor_entity_id).toBe(ctx.adminId);
    }
  });

  it("?event_type=INVALID_LITERAL returns 422 INVALID_REQUEST", async () => {
    const ctx = await createOrgAndAdmin();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/org/audit?event_type=NOT_A_REAL_EVENT_TYPE",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      remoteAddress: ctx.adminIp,
    });
    expect(response.statusCode).toBe(422);
    const body = response.json() as { code: string };
    expect(body.code).toBe("INVALID_REQUEST");
  });

  it("?actor_entity_id=not-a-uuid returns 422 INVALID_REQUEST", async () => {
    const ctx = await createOrgAndAdmin();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/org/audit?actor_entity_id=not-a-uuid",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      remoteAddress: ctx.adminIp,
    });
    expect(response.statusCode).toBe(422);
    const body = response.json() as { code: string };
    expect(body.code).toBe("INVALID_REQUEST");
  });

  // ⭐ DRIFT 9 ARCHITECTURAL ANCHOR ⭐
  // Cross-org leak prevention: when an orgA admin filters with an
  // actor_entity_id belonging to orgB, the response is empty. The
  // filter narrows WITHIN the OR-of-actor-or-target org-scope; it
  // CANNOT widen the scope to reach orgB's events. Future devs
  // adding new filters MUST preserve this invariant — any filter
  // addition that allows cross-org reach is a security regression.
  it("⭐ DRIFT 9: ?actor_entity_id=<other-org-entity-id> returns empty (cross-org leak prevention)", async () => {
    const orgA = await createOrgAndAdmin();
    const orgB = await createOrgAndAdmin();
    // Generate at least one ADMIN_ACTION row for orgB so we know
    // such a row EXISTS — and confirm orgA's filter still returns
    // empty for that actor.
    const memberResp = await app.inject({
      method: "POST",
      url: "/api/v1/org/members",
      headers: { authorization: `Bearer ${orgB.adminToken}` },
      payload: {
        email: `${TEST_PREFIX}leak_${randomUUID()}@niov.test`,
        password: "x",
      },
      remoteAddress: orgB.adminIp,
    });
    expect(memberResp.statusCode).toBe(201);
    // OrgA filtering with orgB.adminId as actor: filter narrows
    // within orgA's OR-scope, never widens. orgB.adminId is NOT in
    // orgA's orgScope, so the AND-composed where clause yields
    // empty.
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/org/audit?actor_entity_id=${orgB.adminId}&take=100`,
      headers: { authorization: `Bearer ${orgA.adminToken}` },
      remoteAddress: orgA.adminIp,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { items: unknown[] };
    expect(body.items).toEqual([]);
  });
});

// 12C.0 Item 4: GET /org/permissions ?bridge_id= filter.
// Same cross-org leak prevention invariant as Item 3. Lifts the
// 12B.4 BridgeDetailDrawer client-side filter to server-side.
describe("GET /org/permissions -- 12C.0 ?bridge_id= filter", () => {
  it("?bridge_id=<uuid> narrows correctly to permissions in that bridge", async () => {
    const ctx = await createOrgAndAdmin();
    // Insert a fixture Permission row directly via prisma so we
    // have a known bridge_id with at least one row visible in the
    // org's permissions scope. createSystemPermission emits zero
    // rows when the grantor's wallet has zero capsules (Phase 0
    // mints empty bridges in this state), so synthesizing the
    // permission via prisma is the clean test path.
    const adminWallet = await prisma.wallet.findUniqueOrThrow({
      where: { entity_id: ctx.adminId },
    });
    const fixtureCapsuleId = randomUUID();
    await prisma.memoryCapsule.create({
      data: {
        capsule_id: fixtureCapsuleId,
        wallet_id: adminWallet.wallet_id,
        entity_id: ctx.adminId,
        capsule_type: "FOUNDATIONAL",
        topic_tags: [],
        payload_summary: `${TEST_PREFIX}fixture`,
        payload_size_tokens: 10,
        storage_location: "test://memory/fixture",
        content_hash: "test-fixture-hash",
        decay_type: "PERMANENT",
        decay_rate: 0,
      },
    });
    const fixtureBridgeId = randomUUID();
    await prisma.permission.create({
      data: {
        permission_id: randomUUID(),
        bridge_id: fixtureBridgeId,
        capsule_id: fixtureCapsuleId,
        grantor_entity_id: ctx.adminId,
        grantee_entity_id: ctx.adminId,
        access_scope: "FULL",
        duration_type: "PERMANENT",
        status: "ACTIVE",
        valid_from: new Date(),
      },
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/org/permissions?bridge_id=${fixtureBridgeId}`,
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      remoteAddress: ctx.adminIp,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      items: Array<{ bridge_id: string; capsule_id: string }>;
    };
    expect(body.items.length).toBe(1);
    expect(body.items[0]!.bridge_id).toBe(fixtureBridgeId);
    expect(body.items[0]!.capsule_id).toBe(fixtureCapsuleId);
  });

  it("?bridge_id=not-a-uuid returns 422 INVALID_REQUEST", async () => {
    const ctx = await createOrgAndAdmin();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/org/permissions?bridge_id=not-a-uuid",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      remoteAddress: ctx.adminIp,
    });
    expect(response.statusCode).toBe(422);
    const body = response.json() as { code: string };
    expect(body.code).toBe("INVALID_REQUEST");
  });

  // Cross-org leak prevention — same architectural invariant as
  // the audit endpoint's DRIFT 9 anchor.
  it("?bridge_id=<other-org-bridge> returns empty (cross-org leak prevention)", async () => {
    const orgA = await createOrgAndAdmin();
    const orgB = await createOrgAndAdmin();
    // Build a bridge_id in orgB.
    const bEmpEmail = `${TEST_PREFIX}bemp_${randomUUID()}@niov.test`;
    const bAddResp = await app.inject({
      method: "POST",
      url: "/api/v1/org/members",
      headers: { authorization: `Bearer ${orgB.adminToken}` },
      payload: { email: bEmpEmail, password: "x", hierarchy_level: 1 },
      remoteAddress: orgB.adminIp,
    });
    const bEmpId = (bAddResp.json() as { entity_id: string }).entity_id;
    const bTwinResp = await app.inject({
      method: "POST",
      url: "/api/v1/org/ai-teammates",
      headers: { authorization: `Bearer ${orgB.adminToken}` },
      payload: {
        owner_entity_id: bEmpId,
        role_title: `${TEST_PREFIX}brole_${randomUUID()}`,
      },
      remoteAddress: orgB.adminIp,
    });
    expect(bTwinResp.statusCode).toBe(201);
    const bBridgeId = (bTwinResp.json() as {
      owner_permission_bridge_id: string;
    }).owner_permission_bridge_id;

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/org/permissions?bridge_id=${bBridgeId}`,
      headers: { authorization: `Bearer ${orgA.adminToken}` },
      remoteAddress: orgA.adminIp,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { items: unknown[] };
    expect(body.items).toEqual([]);
  });
});

// 12C.0 Item 1: DELETE /org/ai-teammates/:id/skills/:packageId
// auth + org-scope tests. The audit_event_id surfacing test for
// this endpoint lives in audit-event-id-surfacing.test.ts.
describe("DELETE /org/ai-teammates/:id/skills/:packageId -- 12C.0 Item 1", () => {
  it("rejects 403 without can_admin_org", async () => {
    const ctx = await createOrgAndAdmin();
    // Caller without can_admin_org tries to delete.
    const caller = await makeAdminAndLogin({ can_admin_org: false });
    const response = await app.inject({
      method: "DELETE",
      url: `/api/v1/org/ai-teammates/${ctx.adminId}/skills/${randomUUID()}`,
      headers: { authorization: `Bearer ${caller.token}` },
      remoteAddress: caller.ip,
    });
    expect(response.statusCode).toBe(403);
    const body = response.json() as { error: string; required: string };
    expect(body.error).toBe("ADMIN_CAPABILITY_REQUIRED");
    expect(body.required).toBe("can_admin_org");
  });

  it("rejects 404 when twin entity is not in caller's org", async () => {
    const orgA = await createOrgAndAdmin();
    const orgB = await createOrgAndAdmin();
    // Build a twin in orgB.
    const bTwinResp = await app.inject({
      method: "POST",
      url: "/api/v1/org/ai-teammates",
      headers: { authorization: `Bearer ${orgB.adminToken}` },
      payload: {
        owner_entity_id: orgB.adminId,
        role_title: `${TEST_PREFIX}orgbrole_${randomUUID()}`,
      },
      remoteAddress: orgB.adminIp,
    });
    const orgBTwinId = (bTwinResp.json() as { entity_id: string })
      .entity_id;
    // OrgA admin tries to delete a skill from orgB's twin.
    const response = await app.inject({
      method: "DELETE",
      url: `/api/v1/org/ai-teammates/${orgBTwinId}/skills/${randomUUID()}`,
      headers: { authorization: `Bearer ${orgA.adminToken}` },
      remoteAddress: orgA.adminIp,
    });
    expect(response.statusCode).toBe(404);
    const body = response.json() as { code: string };
    expect(body.code).toBe("TWIN_NOT_FOUND");
  });

  it("rejects 404 when packageId is not a known SkillPackage", async () => {
    const ctx = await createOrgAndAdmin();
    const response = await app.inject({
      method: "DELETE",
      url: `/api/v1/org/ai-teammates/${ctx.adminId}/skills/${randomUUID()}`,
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      remoteAddress: ctx.adminIp,
    });
    expect(response.statusCode).toBe(404);
    const body = response.json() as { code: string };
    expect(body.code).toBe("SKILL_PACKAGE_NOT_FOUND");
  });

  it("rejects 404 SKILL_NOT_ASSIGNED when package exists but is not assigned to the twin", async () => {
    const ctx = await createOrgAndAdmin();
    // The admin entity itself is not a twin in the strict sense
    // (TwinConfig row doesn't exist), but our scope check uses
    // EntityMembership which DOES include the admin under the org.
    // Use a real twin instead so we exercise the SKILL_NOT_ASSIGNED
    // path.
    const empResp = await app.inject({
      method: "POST",
      url: "/api/v1/org/members",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      payload: {
        email: `${TEST_PREFIX}sknotemp_${randomUUID()}@niov.test`,
        password: "x",
        hierarchy_level: 1,
      },
      remoteAddress: ctx.adminIp,
    });
    const empId = (empResp.json() as { entity_id: string }).entity_id;
    const twinResp = await app.inject({
      method: "POST",
      url: "/api/v1/org/ai-teammates",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      payload: {
        owner_entity_id: empId,
        role_title: `${TEST_PREFIX}sknotrole_${randomUUID()}`,
      },
      remoteAddress: ctx.adminIp,
    });
    const twinId = (twinResp.json() as { entity_id: string }).entity_id;
    // seedSkillPackages() at apps/api/src/services/governance/seeds.ts is
    // a no-op stub (Section 9 product work pending), so we manually
    // insert one for this test to avoid fresh-vs-warm-container state
    // dependency. Mirrors the canonical pattern at line 1248.
    const pkg = await prisma.skillPackage.create({
      data: {
        name: `${TEST_PREFIX}admin_skill_not_assigned_${randomUUID()}`,
        category: "test",
        description: "Test package for SKILL_NOT_ASSIGNED",
        capability_flags: ["test_flag"],
      },
    });
    // Try to remove the unassigned skill.
    const response = await app.inject({
      method: "DELETE",
      url: `/api/v1/org/ai-teammates/${twinId}/skills/${pkg.package_id}`,
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      remoteAddress: ctx.adminIp,
    });
    expect(response.statusCode).toBe(404);
    const body = response.json() as { code: string };
    expect(body.code).toBe("SKILL_NOT_ASSIGNED");
  });
});

describe("GET + POST /org/vocabulary", () => {
  it("TECH org has Sprint, API in seeded vocabulary; cross-tenant is isolated", async () => {
    const techOrg = await createOrgAndAdmin("TECH");
    const financeOrg = await createOrgAndAdmin("FINANCE");

    const techResp = await app.inject({
      method: "GET",
      url: "/api/v1/org/vocabulary?take=100",
      headers: { authorization: `Bearer ${techOrg.adminToken}` },
      remoteAddress: techOrg.adminIp,
    });
    const techBody = techResp.json() as { items: Array<{ term: string }> };
    const techTerms = techBody.items.map((v) => v.term);
    expect(techTerms).toContain("Sprint");
    expect(techTerms).toContain("API");
    expect(techTerms).not.toContain("EBITDA");

    const finResp = await app.inject({
      method: "GET",
      url: "/api/v1/org/vocabulary?take=100",
      headers: { authorization: `Bearer ${financeOrg.adminToken}` },
      remoteAddress: financeOrg.adminIp,
    });
    const finTerms = (finResp.json() as { items: Array<{ term: string }> }).items.map(
      (v) => v.term,
    );
    expect(finTerms).toContain("EBITDA");
    expect(finTerms).not.toContain("Sprint");
  });

  it("POST /org/vocabulary adds a term, second call same term is idempotent", async () => {
    const ctx = await createOrgAndAdmin();
    const customTerm = `custom-${randomUUID().slice(0, 8)}`;
    const r1 = await app.inject({
      method: "POST",
      url: "/api/v1/org/vocabulary",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      payload: { term: customTerm, term_type: "PRODUCT", definition: "A test product" },
      remoteAddress: ctx.adminIp,
    });
    expect(r1.statusCode).toBe(201);
    const r2 = await app.inject({
      method: "POST",
      url: "/api/v1/org/vocabulary",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      payload: { term: customTerm, term_type: "PRODUCT" },
      remoteAddress: ctx.adminIp,
    });
    expect(r2.statusCode).toBe(201);
    const count = await prisma.domainVocabulary.count({
      where: { org_entity_id: ctx.orgId, term: customTerm },
    });
    expect(count).toBe(1);
  });
});

describe("GET /org/intelligence/compound-score", () => {
  it("returns the latest CompoundingMetrics row for the org", async () => {
    const ctx = await createOrgAndAdmin();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/org/intelligence/compound-score",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      remoteAddress: ctx.adminIp,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      ok: boolean;
      compound_score: number;
      org_entity_id: string;
    };
    expect(body.org_entity_id).toBe(ctx.orgId);
    expect(typeof body.compound_score).toBe("number");
  });
});

describe("POST /org/ai-teammates", () => {
  it("admin creates a standard twin via the route -- APPROVAL_REQUIRED + Hive joined", async () => {
    const ctx = await createOrgAndAdmin();
    // Add a non-admin employee via /org/members so we have an owner.
    const empEmail = `${TEST_PREFIX}emp_${randomUUID()}@niov.test`;
    const addResp = await app.inject({
      method: "POST",
      url: "/api/v1/org/members",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      payload: {
        email: empEmail,
        password: "x",
        hierarchy_level: 1,
      },
      remoteAddress: ctx.adminIp,
    });
    const empId = (addResp.json() as { entity_id: string }).entity_id;

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/org/ai-teammates",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      payload: { owner_entity_id: empId, role_title: "Engineering Twin" },
      remoteAddress: ctx.adminIp,
    });
    expect(response.statusCode).toBe(201);
    const body = response.json() as {
      ok: boolean;
      entity_id: string;
      is_admin_twin: boolean;
      default_hive_membership_id: string | null;
    };
    expect(body.is_admin_twin).toBe(false);
    expect(body.default_hive_membership_id).not.toBeNull();
    const config = await prisma.twinConfig.findUnique({
      where: { twin_id: body.entity_id },
    });
    expect(config?.autonomy_level).toBe("APPROVAL_REQUIRED");
  });
});

describe("GET /org/ai-teammates", () => {
  it("lists admin twin + standard twins with autonomy_level + is_admin_twin badges", async () => {
    const ctx = await createOrgAndAdmin();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/org/ai-teammates",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      remoteAddress: ctx.adminIp,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      items: Array<{
        entity_id: string;
        config: { is_admin_twin: boolean; autonomy_level: string } | null;
      }>;
    };
    // The Phase 0 admin twin must appear with is_admin_twin=true.
    const adminTwin = body.items.find((t) => t.config?.is_admin_twin === true);
    expect(adminTwin).toBeDefined();
    expect(adminTwin?.config?.autonomy_level).toBe("EXECUTIVE_OVERRIDE");
  });
});

describe("GET /org/ai-teammates/:id", () => {
  it("returns one twin with owner and assigned SkillPackages for the detail drawer", async () => {
    const ctx = await createOrgAndAdmin();
    const pkg = await prisma.skillPackage.create({
      data: {
        name: `${TEST_PREFIX}detailpkg_${randomUUID()}`,
        category: "test",
        description: "Detail drawer package",
        capability_flags: ["detail_drawer"],
      },
    });
    const list = await app.inject({
      method: "GET",
      url: "/api/v1/org/ai-teammates",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      remoteAddress: ctx.adminIp,
    });
    const adminTwinId = (
      list.json() as {
        items: Array<{ entity_id: string; config: { is_admin_twin: boolean } | null }>;
      }
    ).items.find((t) => t.config?.is_admin_twin === true)!.entity_id;
    await app.inject({
      method: "POST",
      url: `/api/v1/org/ai-teammates/${adminTwinId}/skills`,
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      payload: { package_id: pkg.package_id },
      remoteAddress: ctx.adminIp,
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/org/ai-teammates/${adminTwinId}`,
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      remoteAddress: ctx.adminIp,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      ok: boolean;
      entity: { entity_id: string; entity_type: string };
      twin_config: { twin_id: string; is_admin_twin: boolean };
      owner_entity_id: string;
      skills: Array<{
        twin_id: string;
        package_id: string;
        package: { package_id: string; name: string };
      }>;
    };
    expect(body.ok).toBe(true);
    expect(body.entity.entity_id).toBe(adminTwinId);
    expect(body.entity.entity_type).toBe("AI_AGENT");
    expect(body.twin_config.twin_id).toBe(adminTwinId);
    expect(body.owner_entity_id).toBe(ctx.adminId);
    expect(body.skills).toHaveLength(1);
    expect(body.skills[0]?.twin_id).toBe(adminTwinId);
    expect(body.skills[0]?.package_id).toBe(pkg.package_id);
    expect(body.skills[0]?.package.package_id).toBe(pkg.package_id);
    expect(body.skills[0]?.package.name).toBe(pkg.name);
  });

  it("returns 404 instead of leaking twins from another org", async () => {
    const orgA = await createOrgAndAdmin();
    const orgB = await createOrgAndAdmin();
    const listB = await app.inject({
      method: "GET",
      url: "/api/v1/org/ai-teammates",
      headers: { authorization: `Bearer ${orgB.adminToken}` },
      remoteAddress: orgB.adminIp,
    });
    const orgBTwinId = (
      listB.json() as {
        items: Array<{ entity_id: string; config: { is_admin_twin: boolean } | null }>;
      }
    ).items.find((t) => t.config?.is_admin_twin === true)!.entity_id;

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/org/ai-teammates/${orgBTwinId}`,
      headers: { authorization: `Bearer ${orgA.adminToken}` },
      remoteAddress: orgA.adminIp,
    });
    expect(response.statusCode).toBe(404);
    expect((response.json() as { code: string }).code).toBe("TWIN_NOT_IN_ORG");
  });

  it("returns 404 for a missing twin id", async () => {
    const ctx = await createOrgAndAdmin();
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/org/ai-teammates/${randomUUID()}`,
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      remoteAddress: ctx.adminIp,
    });
    expect(response.statusCode).toBe(404);
    expect((response.json() as { code: string }).code).toBe("TWIN_NOT_FOUND");
  });
});

describe("PATCH /org/ai-teammates/:id immutable + invalid-approver", () => {
  it("rejects is_admin_twin escalation with IMMUTABLE_FIELD 422", async () => {
    const ctx = await createOrgAndAdmin();
    // Get the admin twin id.
    const list = await app.inject({
      method: "GET",
      url: "/api/v1/org/ai-teammates",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      remoteAddress: ctx.adminIp,
    });
    const items = (list.json() as { items: Array<{ entity_id: string; config: { is_admin_twin: boolean } | null }> }).items;
    const standardTwin = items.find((t) => t.config?.is_admin_twin === false);
    // If no standard twin yet, create one for this test.
    let twinId: string;
    if (standardTwin === undefined) {
      const empEmail = `${TEST_PREFIX}immemp_${randomUUID()}@niov.test`;
      const addResp = await app.inject({
        method: "POST",
        url: "/api/v1/org/members",
        headers: { authorization: `Bearer ${ctx.adminToken}` },
        payload: { email: empEmail, password: "x", hierarchy_level: 1 },
        remoteAddress: ctx.adminIp,
      });
      const empId = (addResp.json() as { entity_id: string }).entity_id;
      const twinResp = await app.inject({
        method: "POST",
        url: "/api/v1/org/ai-teammates",
        headers: { authorization: `Bearer ${ctx.adminToken}` },
        payload: { owner_entity_id: empId, role_title: "Imm Test Twin" },
        remoteAddress: ctx.adminIp,
      });
      twinId = (twinResp.json() as { entity_id: string }).entity_id;
    } else {
      twinId = standardTwin.entity_id;
    }
    const response = await app.inject({
      method: "PATCH",
      url: `/api/v1/org/ai-teammates/${twinId}`,
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      payload: { is_admin_twin: true },
      remoteAddress: ctx.adminIp,
    });
    expect(response.statusCode).toBe(422);
    const body = response.json() as { code: string; immutable_fields: string[] };
    expect(body.code).toBe("IMMUTABLE_FIELD");
    expect(body.immutable_fields).toContain("is_admin_twin");
  });

  it("rejects approver_entity_id pointing at a SUSPENDED entity with INVALID_APPROVER 422", async () => {
    const ctx = await createOrgAndAdmin();
    // Create a member, then suspend them, then attempt to set as approver.
    const empEmail = `${TEST_PREFIX}susp_${randomUUID()}@niov.test`;
    const addResp = await app.inject({
      method: "POST",
      url: "/api/v1/org/members",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      payload: { email: empEmail, password: "x", hierarchy_level: 1 },
      remoteAddress: ctx.adminIp,
    });
    const empId = (addResp.json() as { entity_id: string }).entity_id;
    await prisma.entity.update({
      where: { entity_id: empId },
      data: { status: "SUSPENDED" },
    });
    // Use a fresh standard twin for the patch target.
    const owner2Email = `${TEST_PREFIX}o2_${randomUUID()}@niov.test`;
    const owner2Resp = await app.inject({
      method: "POST",
      url: "/api/v1/org/members",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      payload: { email: owner2Email, password: "x", hierarchy_level: 1 },
      remoteAddress: ctx.adminIp,
    });
    const owner2Id = (owner2Resp.json() as { entity_id: string }).entity_id;
    const twinResp = await app.inject({
      method: "POST",
      url: "/api/v1/org/ai-teammates",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      payload: { owner_entity_id: owner2Id, role_title: "Approver Test" },
      remoteAddress: ctx.adminIp,
    });
    const twinId = (twinResp.json() as { entity_id: string }).entity_id;

    const response = await app.inject({
      method: "PATCH",
      url: `/api/v1/org/ai-teammates/${twinId}`,
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      payload: { approver_entity_id: empId },
      remoteAddress: ctx.adminIp,
    });
    expect(response.statusCode).toBe(422);
    expect((response.json() as { code: string }).code).toBe("INVALID_APPROVER");
  });
});

describe("POST /org/ai-teammates/:id/skills", () => {
  it("assigns a SkillPackage and second call with same package is idempotent", async () => {
    const ctx = await createOrgAndAdmin();
    // Need a twin and a SkillPackage. Section 9C ships
    // seedSkillPackages() as a no-op stub, so we manually insert
    // one for the test and then assign it.
    const pkg = await prisma.skillPackage.create({
      data: {
        name: `${TEST_PREFIX}pkg_${randomUUID()}`,
        category: "test",
        description: "Test package",
        capability_flags: ["test_flag"],
      },
    });
    // Phase 0 admin twin id.
    const twinList = await app.inject({
      method: "GET",
      url: "/api/v1/org/ai-teammates",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      remoteAddress: ctx.adminIp,
    });
    const adminTwinId = (
      twinList.json() as {
        items: Array<{ entity_id: string; config: { is_admin_twin: boolean } | null }>;
      }
    ).items.find((t) => t.config?.is_admin_twin === true)!.entity_id;

    const r1 = await app.inject({
      method: "POST",
      url: `/api/v1/org/ai-teammates/${adminTwinId}/skills`,
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      payload: { package_id: pkg.package_id },
      remoteAddress: ctx.adminIp,
    });
    expect(r1.statusCode).toBe(200);
    const r2 = await app.inject({
      method: "POST",
      url: `/api/v1/org/ai-teammates/${adminTwinId}/skills`,
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      payload: { package_id: pkg.package_id },
      remoteAddress: ctx.adminIp,
    });
    expect(r2.statusCode).toBe(200);
    const count = await prisma.twinSkill.count({
      where: { twin_id: adminTwinId, package_id: pkg.package_id },
    });
    expect(count).toBe(1);
  });
});

describe("POST /auth/refresh", () => {
  it("returns a fresh token whose JWT exp - issued_at exactly matches OrgSettings.session_timeout_minutes", async () => {
    const ctx = await createOrgAndAdmin();
    // Set the org's session timeout to a distinctive value so the
    // refresh response can be verified against it.
    const customTimeout = 720; // minutes
    const ttlMs = customTimeout * 60 * 1000;
    await prisma.orgSettings.update({
      where: { org_entity_id: ctx.orgId },
      data: { session_timeout_minutes: customTimeout },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      remoteAddress: ctx.adminIp,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      ok: boolean;
      token: string;
      expires_at: string;
      ttl_minutes: number;
    };
    expect(body.ok).toBe(true);
    expect(body.ttl_minutes).toBe(customTimeout);

    // Decode the new JWT and verify the TTL via internal anchors:
    // payload.expires_at - payload.issued_at must exactly equal
    // ttlMs. This is wall-clock independent so Supabase tail
    // latency in the route handler can never make it flake.
    const jwt = await import("jsonwebtoken");
    const payload = jwt.default.verify(
      body.token,
      "admin-routes-test-secret-do-not-use-in-prod",
    ) as { exp: number; expires_at: number; issued_at: number };
    expect(payload.expires_at - payload.issued_at).toBe(ttlMs);

    // Body's expires_at must match the JWT's expires_at field exactly
    // (both come from the same JS-clock anchor in the handler).
    const bodyExpMs = new Date(body.expires_at).getTime();
    expect(bodyExpMs).toBe(payload.expires_at);

    // JWT standard exp claim (seconds) must be within 1 second of
    // floor(expires_at / 1000). The jsonwebtoken library generates
    // exp internally from a fresh Date.now() call inside sign(),
    // which can land 1ms after our custom issuedAt, occasionally
    // crossing a second boundary. The 1-second tolerance absorbs
    // that wall-clock race; the TTL semantics above are exact.
    const expFromMs = Math.floor(payload.expires_at / 1000);
    expect(Math.abs(payload.exp - expFromMs)).toBeLessThanOrEqual(1);
  });
});

// PATCH /platform/monetization/config moved to
// tests/integration/dual-control-binding-config.test.ts at
// [SEC-DUAL-CONTROL-BINDING-CONFIG] (sub-phase F): the route now
// carries the requireDualControl preHandler, so its behavior (the
// dual-control gate + the re-homed 422 body-validation and the
// 200-with-MONETIZATION_CONFIG_UPDATE-audit cases) is exercised in
// the dedicated dual-control binding test file.

// TEST 12 from the green box -- standard twin offboarding cuts the
// twin from the default Hive and from org-knowledge access. The
// offboarding flow lives in Section 15 (P4 patch); the route to
// trigger offboarding doesn't exist yet, so this test is skipped
// here and tracked for that section.
describe.skip("standard twin removed from default Hive on offboarding loses org-knowledge access", () => {
  it("placeholder -- Section 15 (P4 patch) ships the offboarding flow", () => {
    // Implementation: invoke the future POST /org/members/:id/offboard
    // route, then verify the twin's HiveMembership.status is REMOVED
    // and the twin's session is invalidated.
  });
});

// ── [PROD-UX-HIER] POST /org/hierarchy/assign — admin authoring of the
//    person→person reporting structure (manager + role/department). ──
describe("POST /org/hierarchy/assign (PROD-UX-HIER)", () => {
  async function addMember(ctx: Awaited<ReturnType<typeof createOrgAndAdmin>>, tag: string) {
    const email = `${TEST_PREFIX}${tag}_${randomUUID()}@niov.test`;
    const r = await app.inject({
      method: "POST",
      url: "/api/v1/org/members",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      payload: { email, password: "correct-horse-battery", hierarchy_level: 1 },
      remoteAddress: ctx.adminIp,
    });
    expect(r.statusCode).toBe(201);
    return { entity_id: (r.json() as { entity_id: string }).entity_id, email };
  }
  const assign = (
    token: string,
    ip: string,
    payload: Record<string, unknown>,
  ) =>
    app.inject({
      method: "POST",
      url: "/api/v1/org/hierarchy/assign",
      headers: { authorization: `Bearer ${token}` },
      payload,
      remoteAddress: ip,
    });

  it("admin assigns a manager + role + department; the person edge becomes readable", async () => {
    const ctx = await createOrgAndAdmin();
    const manager = await addMember(ctx, "mgr");
    const person = await addMember(ctx, "person");
    const r = await assign(ctx.adminToken, ctx.adminIp, {
      person_entity_id: person.entity_id,
      manager_entity_id: manager.entity_id,
      role_title: "Engineer",
      department: "Product",
    });
    expect(r.statusCode).toBe(200);
    const body = r.json() as { ok: boolean; membership_id: string; audit_event_id: string };
    expect(body.ok).toBe(true);
    expect(body.audit_event_id.length).toBeGreaterThan(0);
    const hier = await app.inject({
      method: "GET",
      url: "/api/v1/org/hierarchy",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      remoteAddress: ctx.adminIp,
    });
    const ms = (hier.json() as { memberships: Array<{ parent_id: string; child_id: string; role_title: string | null; department: string | null }> }).memberships;
    const edge = ms.find((m) => m.parent_id === manager.entity_id && m.child_id === person.entity_id);
    expect(edge).toBeDefined();
    expect(edge!.role_title).toBe("Engineer");
    expect(edge!.department).toBe("Product");
  });

  it("a non-admin member is refused (403), same gate as the read", async () => {
    const ctx = await createOrgAndAdmin();
    const member = await addMember(ctx, "emp");
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: member.email, password: "correct-horse-battery", requested_operations: ["read", "write"] },
      remoteAddress: "10.99.77.7",
    });
    const token = (login.json() as { token: string }).token;
    const r = await assign(token, "10.99.77.7", {
      person_entity_id: member.entity_id,
      manager_entity_id: null,
      role_title: "Self promotion",
    });
    expect(r.statusCode).toBe(403);
  });

  it("cross-org assignment is a 404 (no leak); unknown ids are 404", async () => {
    const orgA = await createOrgAndAdmin();
    const orgB = await createOrgAndAdmin();
    const bPerson = await addMember(orgB, "bperson");
    const cross = await assign(orgA.adminToken, orgA.adminIp, {
      person_entity_id: bPerson.entity_id,
      manager_entity_id: null,
    });
    expect(cross.statusCode).toBe(404);
    const unknown = await assign(orgA.adminToken, orgA.adminIp, {
      person_entity_id: randomUUID(),
      manager_entity_id: null,
    });
    expect(unknown.statusCode).toBe(404);
  });

  it("cycles are refused (422 CYCLE) and re-parenting retires the old edge", async () => {
    const ctx = await createOrgAndAdmin();
    const a = await addMember(ctx, "ha");
    const b = await addMember(ctx, "hb");
    const c = await addMember(ctx, "hc");
    expect((await assign(ctx.adminToken, ctx.adminIp, { person_entity_id: b.entity_id, manager_entity_id: a.entity_id })).statusCode).toBe(200);
    const cycle = await assign(ctx.adminToken, ctx.adminIp, { person_entity_id: a.entity_id, manager_entity_id: b.entity_id });
    expect(cycle.statusCode).toBe(422);
    expect((cycle.json() as { code: string }).code).toBe("CYCLE");
    // Re-parent b under c: exactly ONE active manager edge for b remains.
    expect((await assign(ctx.adminToken, ctx.adminIp, { person_entity_id: b.entity_id, manager_entity_id: c.entity_id })).statusCode).toBe(200);
    const hier = await app.inject({
      method: "GET",
      url: "/api/v1/org/hierarchy",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      remoteAddress: ctx.adminIp,
    });
    const ms = (hier.json() as { memberships: Array<{ parent_id: string; child_id: string }> }).memberships;
    const managersOfB = ms.filter((m) => m.child_id === b.entity_id && m.parent_id !== ctx.orgId);
    expect(managersOfB).toHaveLength(1);
    expect(managersOfB[0]!.parent_id).toBe(c.entity_id);
  });
});

// ── [CX-SLICE-3] POST /zoom/recordings/ingest — governed meeting ingestion
//    (admin-triggered; transcript fetched server-side; fed to the EXISTING
//    comms-ingest pipeline). CI has no Zoom OAuth: the honest refusal chain
//    is what we prove here (gate → validation → NOT_CONFIGURED); the happy
//    path needs a live org with Zoom connected (founder-run).
describe("POST /zoom/recordings/ingest (CX-SLICE-3)", () => {
  it("non-admins are refused by the capability gate (403)", async () => {
    const ctx = await createOrgAndAdmin();
    const email = `${TEST_PREFIX}zoomemp_${randomUUID()}@niov.test`;
    await app.inject({
      method: "POST", url: "/api/v1/org/members",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      payload: { email, password: "correct-horse-battery", hierarchy_level: 1 },
      remoteAddress: ctx.adminIp,
    });
    const login = await app.inject({
      method: "POST", url: "/api/v1/auth/login",
      payload: { email, password: "correct-horse-battery", requested_operations: ["read", "write"] },
      remoteAddress: "10.99.66.6",
    });
    const token = (login.json() as { token: string }).token;
    const r = await app.inject({
      method: "POST", url: "/api/v1/zoom/recordings/ingest",
      headers: { authorization: `Bearer ${token}` },
      payload: { meeting_id: "123" },
      remoteAddress: "10.99.66.6",
    });
    expect(r.statusCode).toBe(403);
  });

  it("admin without meeting_id → 422; without Zoom connected → 409 NOT_CONFIGURED", async () => {
    const ctx = await createOrgAndAdmin();
    const bad = await app.inject({
      method: "POST", url: "/api/v1/zoom/recordings/ingest",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      payload: {},
      remoteAddress: ctx.adminIp,
    });
    expect(bad.statusCode).toBe(422);
    const noZoom = await app.inject({
      method: "POST", url: "/api/v1/zoom/recordings/ingest",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      payload: { meeting_id: "123" },
      remoteAddress: ctx.adminIp,
    });
    expect(noZoom.statusCode).toBe(409);
    expect((noZoom.json() as { code: string }).code).toBe("NOT_CONFIGURED");
  });
});

// ── [PROD-UX-ASSIGN] org assignment targets + assignments ────────────────────
// The People & Collaboration "Assign" flow: admin-gated org-wide picker feed +
// admin assignment through the EXISTING membership write paths (org-admin
// override — one write path, one audit vocabulary, via_org_admin provenance).
describe("[PROD-UX-ASSIGN] GET /org/assignment-targets + POST /org/assignments", () => {
  async function seedTargets(orgId: string, creatorId: string) {
    const project = await prisma.workProject.create({
      data: {
        org_entity_id: orgId,
        name: `${TEST_PREFIX} Assign Project`,
        state: "ACTIVE",
        created_by_entity_id: creatorId,
      },
    });
    const workspace = await prisma.collaborationWorkspace.create({
      data: {
        org_entity_id: orgId,
        title: `${TEST_PREFIX} Assign Workspace`,
        created_by_entity_id: creatorId,
      },
    });
    return { projectId: project.project_id, workspaceId: workspace.workspace_id };
  }

  async function addEmployee(ctx: { orgId: string; adminToken: string; adminIp: string }) {
    const email = `${TEST_PREFIX}assignee_${randomUUID()}@niov.test`;
    const password = "correct-horse-battery";
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/org/members",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      payload: { email, password, hierarchy_level: 1 },
      remoteAddress: ctx.adminIp,
    });
    expect(created.statusCode).toBeLessThan(300);
    const entity = await prisma.entity.findFirst({ where: { email }, select: { entity_id: true } });
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email, password, requested_operations: ["read", "write"] },
      remoteAddress: "10.97.1.1",
    });
    return { entityId: entity!.entity_id, token: (login.json() as { token: string }).token };
  }

  it("admin lists org-wide ACTIVE targets — both kinds, safe scalars, no cross-org leakage", async () => {
    const orgA = await createOrgAndAdmin();
    const orgB = await createOrgAndAdmin();
    const a = await seedTargets(orgA.orgId, orgA.adminId);
    await seedTargets(orgB.orgId, orgB.adminId);
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/org/assignment-targets",
      headers: { authorization: `Bearer ${orgA.adminToken}` },
      remoteAddress: orgA.adminIp,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean; targets: Array<{ kind: string; target_id: string; label: string; status: string }> };
    const ids = body.targets.map((t) => t.target_id);
    expect(ids).toContain(a.projectId);
    expect(ids).toContain(a.workspaceId);
    expect(body.targets.find((t) => t.target_id === a.projectId)?.kind).toBe("project");
    expect(body.targets.find((t) => t.target_id === a.workspaceId)?.kind).toBe("workspace");
    // Cross-org isolation: none of orgB's targets appear.
    for (const t of body.targets) {
      const inA = ids.includes(t.target_id);
      expect(inA).toBe(true);
    }
    expect(res.body).not.toContain(orgB.orgId);
    // Safe scalars only.
    for (const banned of ["password_hash", "secret", "payload_redacted", "public_key"]) {
      expect(res.body).not.toContain(banned);
    }
  });

  it("employees (non-admin) cannot list assignment targets; unauth is refused", async () => {
    const ctx = await createOrgAndAdmin();
    const emp = await addEmployee(ctx);
    const asEmployee = await app.inject({
      method: "GET",
      url: "/api/v1/org/assignment-targets",
      headers: { authorization: `Bearer ${emp.token}` },
      remoteAddress: "10.97.1.1",
    });
    expect(asEmployee.statusCode).toBe(403);
    const unauth = await app.inject({ method: "GET", url: "/api/v1/org/assignment-targets" });
    expect(unauth.statusCode).toBe(401);
  });

  it("admin assigns a person to a PROJECT through the existing write path — audited with via_org_admin", async () => {
    const ctx = await createOrgAndAdmin();
    const { projectId } = await seedTargets(ctx.orgId, ctx.adminId);
    const emp = await addEmployee(ctx);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/org/assignments",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      payload: { person_entity_id: emp.entityId, target_kind: "project", target_id: projectId },
      remoteAddress: ctx.adminIp,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean; membership_id: string; audit_event_id: string };
    expect(body.ok).toBe(true);
    expect(body.membership_id.length).toBeGreaterThan(0);
    // Canonical membership written (ONE write path — WorkProjectMember).
    const member = await prisma.workProjectMember.findFirst({
      where: { project_id: projectId, entity_id: emp.entityId },
    });
    expect(member).not.toBeNull();
    // Audit: existing vocabulary + org-admin provenance.
    const audit = await prisma.auditEvent.findUnique({ where: { audit_id: body.audit_event_id } });
    expect(audit).not.toBeNull();
    const d = audit!.details as Record<string, unknown>;
    expect(d.action).toBe("WORK_PROJECT_MEMBER_ADDED");
    expect(d.via_org_admin).toBe(true);
    expect(audit!.actor_entity_id).toBe(ctx.adminId);
    expect(audit!.target_entity_id).toBe(emp.entityId);
  });

  it("admin assigns a person to a WORKSPACE through the existing write path — audited with via_org_admin", async () => {
    const ctx = await createOrgAndAdmin();
    const { workspaceId } = await seedTargets(ctx.orgId, ctx.adminId);
    const emp = await addEmployee(ctx);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/org/assignments",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      payload: { person_entity_id: emp.entityId, target_kind: "workspace", target_id: workspaceId },
      remoteAddress: ctx.adminIp,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean; membership_id: string; audit_event_id: string };
    const membership = await prisma.collaborationMembership.findFirst({
      where: { workspace_id: workspaceId, member_entity_id: emp.entityId, deleted_at: null },
    });
    expect(membership).not.toBeNull();
    expect(membership!.membership_id).toBe(body.membership_id);
    const audit = await prisma.auditEvent.findUnique({ where: { audit_id: body.audit_event_id } });
    expect(audit!.event_type).toBe("WORKSPACE_MEMBER_ADDED");
    expect((audit!.details as Record<string, unknown>).via_org_admin).toBe(true);
  });

  it("[GAP-C] an archived workspace leaves the targets list and refuses assignment via the ARCHIVE RAIL", async () => {
    const ctx = await createOrgAndAdmin();
    const { workspaceId } = await seedTargets(ctx.orgId, ctx.adminId);
    const emp = await addEmployee(ctx);
    // The rail is APPROVE-gated: give the admin the creator-style membership,
    // then archive through the canonical HTTP route.
    await prisma.collaborationMembership.create({
      data: {
        workspace_id: workspaceId,
        org_entity_id: ctx.orgId,
        member_entity_id: ctx.adminId,
        member_display_name: `${TEST_PREFIX} Admin`,
        role_label: "Workspace creator",
        access_level: "APPROVE",
        status: "ACTIVE",
      },
    });
    const archived = await app.inject({
      method: "POST",
      url: `/api/v1/otzar/collaboration/workspaces/${workspaceId}/archive`,
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      remoteAddress: ctx.adminIp,
    });
    expect(archived.statusCode).toBe(200);
    expect((archived.json() as { audit_event_id: string }).audit_event_id.length).toBeGreaterThan(0);

    // Gone from assignment targets…
    const targets = await app.inject({
      method: "GET",
      url: "/api/v1/org/assignment-targets",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      remoteAddress: ctx.adminIp,
    });
    const rows = (targets.json() as { targets: Array<{ target_id: string }> }).targets;
    expect(rows.some((t) => t.target_id === workspaceId)).toBe(false);

    // …and honestly refuses new assignments.
    const assign = await app.inject({
      method: "POST",
      url: "/api/v1/org/assignments",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      payload: { person_entity_id: emp.entityId, target_kind: "workspace", target_id: workspaceId },
      remoteAddress: ctx.adminIp,
    });
    expect(assign.statusCode).toBe(422);
    expect((assign.json() as { code: string }).code).toBe("TARGET_NOT_ACTIVE");
  });

  it("employees cannot use the assignment route", async () => {
    const ctx = await createOrgAndAdmin();
    const { projectId } = await seedTargets(ctx.orgId, ctx.adminId);
    const emp = await addEmployee(ctx);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/org/assignments",
      headers: { authorization: `Bearer ${emp.token}` },
      payload: { person_entity_id: emp.entityId, target_kind: "project", target_id: projectId },
      remoteAddress: "10.97.1.1",
    });
    expect(res.statusCode).toBe(403);
  });

  it("cross-org person and cross-org target are honest 404s; unknown ids too", async () => {
    const orgA = await createOrgAndAdmin();
    const orgB = await createOrgAndAdmin();
    const aTargets = await seedTargets(orgA.orgId, orgA.adminId);
    const bTargets = await seedTargets(orgB.orgId, orgB.adminId);
    const bEmp = await addEmployee(orgB);
    // Cross-org person.
    const p = await app.inject({
      method: "POST",
      url: "/api/v1/org/assignments",
      headers: { authorization: `Bearer ${orgA.adminToken}` },
      payload: { person_entity_id: bEmp.entityId, target_kind: "project", target_id: aTargets.projectId },
      remoteAddress: orgA.adminIp,
    });
    expect(p.statusCode).toBe(404);
    expect((p.json() as { code: string }).code).toBe("PERSON_NOT_IN_ORG");
    // Cross-org target (orgB's project via orgA admin) — 404, no existence leak.
    const aEmp = await addEmployee(orgA);
    const t = await app.inject({
      method: "POST",
      url: "/api/v1/org/assignments",
      headers: { authorization: `Bearer ${orgA.adminToken}` },
      payload: { person_entity_id: aEmp.entityId, target_kind: "project", target_id: bTargets.projectId },
      remoteAddress: orgA.adminIp,
    });
    expect(t.statusCode).toBe(404);
    expect((t.json() as { code: string }).code).toBe("TARGET_NOT_FOUND");
    // Unknown ids.
    const u1 = await app.inject({
      method: "POST",
      url: "/api/v1/org/assignments",
      headers: { authorization: `Bearer ${orgA.adminToken}` },
      payload: { person_entity_id: randomUUID(), target_kind: "project", target_id: aTargets.projectId },
      remoteAddress: orgA.adminIp,
    });
    expect(u1.statusCode).toBe(404);
    const u2 = await app.inject({
      method: "POST",
      url: "/api/v1/org/assignments",
      headers: { authorization: `Bearer ${orgA.adminToken}` },
      payload: { person_entity_id: aEmp.entityId, target_kind: "workspace", target_id: randomUUID() },
      remoteAddress: orgA.adminIp,
    });
    expect(u2.statusCode).toBe(404);
    // Bad kind is a 422.
    const u3 = await app.inject({
      method: "POST",
      url: "/api/v1/org/assignments",
      headers: { authorization: `Bearer ${orgA.adminToken}` },
      payload: { person_entity_id: aEmp.entityId, target_kind: "team", target_id: aTargets.projectId },
      remoteAddress: orgA.adminIp,
    });
    expect(u3.statusCode).toBe(422);
  });

  it("assigning twice is idempotent — already_member, no duplicate rows", async () => {
    const ctx = await createOrgAndAdmin();
    const { projectId } = await seedTargets(ctx.orgId, ctx.adminId);
    const emp = await addEmployee(ctx);
    const payload = { person_entity_id: emp.entityId, target_kind: "project", target_id: projectId };
    const first = await app.inject({
      method: "POST", url: "/api/v1/org/assignments",
      headers: { authorization: `Bearer ${ctx.adminToken}` }, payload, remoteAddress: ctx.adminIp,
    });
    expect(first.statusCode).toBe(200);
    const second = await app.inject({
      method: "POST", url: "/api/v1/org/assignments",
      headers: { authorization: `Bearer ${ctx.adminToken}` }, payload, remoteAddress: ctx.adminIp,
    });
    expect(second.statusCode).toBe(200);
    const sb = second.json() as { ok: boolean; already_member?: boolean };
    expect(sb.ok).toBe(true);
    expect(sb.already_member).toBe(true);
    const count = await prisma.workProjectMember.count({
      where: { project_id: projectId, entity_id: emp.entityId },
    });
    expect(count).toBe(1);
  });
});
