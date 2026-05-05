// FILE: compliance-state.test.ts (integration)
// PURPOSE: 12C.0 Item 9 anchor tests for GET /api/v1/compliance/state.
//          Verifies the live compliance posture surface returns
//          per-framework verdicts based on recent
//          COMPLIANCE_CHECK_PASSED / COMPLIANCE_CHECK_FAILED audit
//          events, scoped to the caller's org via the org-level
//          EntityComplianceProfile lookup (DRIFT 15).
// CONNECTS TO: apps/api/src/services/compliance/compliance.service.ts
//              (the getComplianceStateForCaller method),
//              apps/api/src/routes/compliance.routes.ts (the new
//              GET handler), prisma (test-only EntityComplianceProfile
//              seeding so we can drive the per-framework verdict).

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
} from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "compliance-state-test-secret-do-not-use-in-prod";
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

// WHAT: Mint a PERSON entity, flip its TAR to grant the listed admin
//        capabilities, log them in.
async function makeAdminAndLogin(opts: {
  can_admin_niov?: boolean;
  can_admin_org?: boolean;
}): Promise<{ entityId: string; token: string; ip: string }> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const entity = await createEntity(input);

  if (opts.can_admin_niov === true || opts.can_admin_org === true) {
    await prisma.tokenAttributeRepository.update({
      where: { entity_id: entity.entity_id },
      data: {
        can_admin_niov: opts.can_admin_niov === true,
        can_admin_org: opts.can_admin_org === true,
      },
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

  const ip = `10.99.${Math.floor(Math.random() * 200) + 1}.${Math.floor(
    Math.random() * 254,
  ) + 1}`;
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
  return {
    entityId: entity.entity_id,
    token: (login.json() as { token: string }).token,
    ip,
  };
}

// WHAT: Build a full org via Phase 0 and login the admin.
async function createOrgAndAdmin(): Promise<{
  orgId: string;
  adminId: string;
  adminToken: string;
  adminIp: string;
}> {
  const platformAdmin = await makeAdminAndLogin({ can_admin_niov: true });
  const companyName = `${TEST_PREFIX}cstateco_${randomUUID()}`;
  const adminEmail = `${TEST_PREFIX}cstateadmin_${randomUUID()}@niov.test`;
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
  return {
    orgId: orgBody.org_entity_id,
    adminId: orgBody.admin_entity_id,
    adminToken: (adminLogin.json() as { token: string }).token,
    adminIp,
  };
}

// WHAT: Attach a set of frameworks to an org via
//        EntityComplianceProfile so getComplianceState has
//        applicable frameworks to evaluate.
async function attachFrameworksToOrg(
  orgEntityId: string,
  frameworks: string[],
): Promise<void> {
  await prisma.entityComplianceProfile.upsert({
    where: { entity_id: orgEntityId },
    create: {
      profile_id: randomUUID(),
      entity_id: orgEntityId,
      frameworks,
      sector: "ALL",
      jurisdiction: ["US"],
    },
    update: { frameworks },
  });
}

describe("GET /api/v1/compliance/state -- 12C.0 Item 9", () => {
  it("requires bearer token (DRIFT 14 auth gate)", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/compliance/state",
      remoteAddress: "10.99.99.1",
    });
    expect(response.statusCode).toBe(401);
    const body = response.json() as { code: string };
    expect(body.code).toBe("SESSION_INVALID");
  });

  it("returns empty frameworks array when org has no EntityComplianceProfile", async () => {
    const ctx = await createOrgAndAdmin();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/compliance/state",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      remoteAddress: ctx.adminIp,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      ok: boolean;
      state: {
        org_entity_id: string;
        frameworks: unknown[];
      };
    };
    expect(body.ok).toBe(true);
    expect(body.state.org_entity_id).toBe(ctx.orgId);
    expect(body.state.frameworks).toEqual([]);
  });

  it("returns posture for all applicable frameworks attached to the org", async () => {
    const ctx = await createOrgAndAdmin();
    await attachFrameworksToOrg(ctx.orgId, ["HIPAA", "SOC2_Type2"]);

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/compliance/state",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      remoteAddress: ctx.adminIp,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      state: {
        frameworks: Array<{
          framework_name: string;
          compliant: boolean;
          sample_failure_count_24h: number;
        }>;
      };
    };
    const names = body.state.frameworks.map((f) => f.framework_name).sort();
    expect(names).toEqual(["HIPAA", "SOC2_Type2"]);
    // No FAILED rows seeded -> all frameworks compliant=true.
    for (const f of body.state.frameworks) {
      expect(f.compliant).toBe(true);
      expect(f.sample_failure_count_24h).toBe(0);
    }
  });

  it("framework with recent FAILED returns compliant=false + sample_failure_count_24h matches", async () => {
    const ctx = await createOrgAndAdmin();
    await attachFrameworksToOrg(ctx.orgId, ["HIPAA"]);

    // Seed two COMPLIANCE_CHECK_FAILED rows targeting the org with
    // failing_framework=HIPAA. The audit chain trigger requires
    // hash-chained writes; we use writeAuditEvent rather than raw
    // prisma.auditEvent.create.
    const { writeAuditEvent } = await import("@niov/database");
    await writeAuditEvent({
      event_type: "COMPLIANCE_CHECK_FAILED",
      outcome: "DENIED",
      actor_entity_id: null,
      target_entity_id: ctx.orgId,
      details: {
        failing_framework: "HIPAA",
        operation_type: "READ",
      },
    });
    await writeAuditEvent({
      event_type: "COMPLIANCE_CHECK_FAILED",
      outcome: "DENIED",
      actor_entity_id: null,
      target_entity_id: ctx.orgId,
      details: {
        failing_framework: "HIPAA",
        operation_type: "READ",
      },
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/compliance/state",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      remoteAddress: ctx.adminIp,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      state: {
        frameworks: Array<{
          framework_name: string;
          compliant: boolean;
          sample_failure_count_24h: number;
        }>;
      };
    };
    const hipaa = body.state.frameworks.find(
      (f) => f.framework_name === "HIPAA",
    );
    expect(hipaa).toBeDefined();
    expect(hipaa!.compliant).toBe(false);
    expect(hipaa!.sample_failure_count_24h).toBe(2);
  });

  it("scopes to caller's org only (DRIFT 15)", async () => {
    const orgA = await createOrgAndAdmin();
    const orgB = await createOrgAndAdmin();
    await attachFrameworksToOrg(orgA.orgId, ["HIPAA"]);
    await attachFrameworksToOrg(orgB.orgId, ["GDPR", "CCPA"]);

    // OrgA admin queries -> sees only HIPAA, never GDPR/CCPA.
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/compliance/state",
      headers: { authorization: `Bearer ${orgA.adminToken}` },
      remoteAddress: orgA.adminIp,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      state: {
        org_entity_id: string;
        frameworks: Array<{ framework_name: string }>;
      };
    };
    expect(body.state.org_entity_id).toBe(orgA.orgId);
    const names = body.state.frameworks.map((f) => f.framework_name);
    expect(names).toEqual(["HIPAA"]);
    expect(names).not.toContain("GDPR");
    expect(names).not.toContain("CCPA");
  });

  it("evaluated_at is a recent timestamp (response freshness signal)", async () => {
    const ctx = await createOrgAndAdmin();
    await attachFrameworksToOrg(ctx.orgId, ["SOC2_Type2"]);
    const before = new Date();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/compliance/state",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      remoteAddress: ctx.adminIp,
    });
    const after = new Date();
    expect(response.statusCode).toBe(200);
    const body = response.json() as { state: { evaluated_at: string } };
    const evaluatedAt = new Date(body.state.evaluated_at);
    expect(evaluatedAt.getTime()).toBeGreaterThanOrEqual(
      before.getTime() - 1000,
    );
    expect(evaluatedAt.getTime()).toBeLessThanOrEqual(after.getTime() + 1000);
  });
});
