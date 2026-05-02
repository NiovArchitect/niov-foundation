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
} from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "admin-routes-test-secret-do-not-use-in-prod";
const TEST_KEY = randomBytes(32);

let app: FastifyInstance;

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
  app = await buildApp({
    jwtSecret: TEST_JWT_SECRET,
    sessionNonceStore: new MemoryNonceStore(),
    declarationStore: new MemoryNonceStore(),
    contentStore: new MemoryContentStore(),
    contentEncryption: new ContentEncryption(TEST_KEY),
    rateLimitStore: new MemoryRateLimitStore(),
  });
});

afterAll(async () => {
  await app.close();
  await cleanupTestData();
  await prisma.$disconnect();
});

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

describe("POST /platform/orgs -- can_admin_niov gate", () => {
  it("returns 403 ADMIN_CAPABILITY_REQUIRED for callers without can_admin_niov", async () => {
    const caller = await makeAdminAndLogin({ can_admin_niov: false });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/platform/orgs",
      headers: { authorization: `Bearer ${caller.token}` },
      payload: {
        company_name: `${TEST_PREFIX}gateco_${randomUUID()}`,
        admin_email: `${TEST_PREFIX}gate_${randomUUID()}@niov.test`,
        admin_password: "any",
        industry: "TECH",
      },
      remoteAddress: caller.ip,
    });
    expect(response.statusCode).toBe(403);
    const body = response.json() as { error: string; required: string };
    expect(body.error).toBe("ADMIN_CAPABILITY_REQUIRED");
    expect(body.required).toBe("can_admin_niov");
  });

  it("creates a new org end-to-end for callers with can_admin_niov=true", async () => {
    const platformAdmin = await makeAdminAndLogin({ can_admin_niov: true });
    const companyName = `${TEST_PREFIX}fullco_${randomUUID()}`;
    const adminEmail = `${TEST_PREFIX}fulladmin_${randomUUID()}@niov.test`;
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/platform/orgs",
      headers: { authorization: `Bearer ${platformAdmin.token}` },
      payload: {
        company_name: companyName,
        admin_email: adminEmail,
        admin_password: "correct-horse-battery",
        industry: "TECH",
        admin_first_name: "Full",
        admin_last_name: "Admin",
      },
      remoteAddress: platformAdmin.ip,
    });
    expect(response.statusCode).toBe(201);
    const body = response.json() as {
      ok: boolean;
      org_entity_id: string;
      admin_entity_id: string;
      admin_twin_id: string;
      default_hive_id: string;
    };
    expect(body.ok).toBe(true);
    expect(body.org_entity_id).toMatch(/^[0-9a-f-]{36}$/);
    // The created admin can log in with the password we set.
    const adminLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: adminEmail,
        password: "correct-horse-battery",
        requested_operations: ["read"],
      },
      remoteAddress: `10.99.77.${Math.floor(Math.random() * 254) + 1}`,
    });
    expect(adminLogin.statusCode).toBe(200);
  });
});

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

describe("POST /org/members -- happy path + cross-tenant", () => {
  // WHAT: Build an entire org via Phase 0 and login the admin so we
  //        can call /org/members against a real org context.
  async function createOrgAndAdmin(): Promise<{
    orgId: string;
    adminId: string;
    adminToken: string;
    adminIp: string;
  }> {
    // Direct service call: bypass HTTP for setup since we're not
    // testing the platform route here.
    const platformAdmin = await makeAdminAndLogin({ can_admin_niov: true });
    const companyName = `${TEST_PREFIX}orgco_${randomUUID()}`;
    const adminEmail = `${TEST_PREFIX}orgadmin_${randomUUID()}@niov.test`;
    const adminPassword = "correct-horse-battery";
    const orgResponse = await app.inject({
      method: "POST",
      url: "/api/v1/platform/orgs",
      headers: { authorization: `Bearer ${platformAdmin.token}` },
      payload: {
        company_name: companyName,
        admin_email: adminEmail,
        admin_password: adminPassword,
        industry: "TECH",
      },
      remoteAddress: platformAdmin.ip,
    });
    if (orgResponse.statusCode !== 201) {
      throw new Error(`createOrg failed: ${orgResponse.statusCode}`);
    }
    const orgBody = orgResponse.json() as {
      org_entity_id: string;
      admin_entity_id: string;
    };
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
    };
  }

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
