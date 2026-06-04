// FILE: org-collaboration-policy-routes.test.ts (integration)
// PURPOSE: Phase 2 PR 3 — HTTP-level coverage for the OrgCollaboration
//          Policy admin routes (PR #284 substrate). can_admin_org-gated.
// CONNECTS TO:
//   - apps/api/src/routes/org-collaboration-policy.routes.ts
//   - apps/api/src/services/governance/org-collaboration-policy.service.ts

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

const TEST_JWT_SECRET = "org-collab-policy-routes-test-secret";
const TEST_KEY = randomBytes(32);

let app: FastifyInstance;
let ORG_ID: string;

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
  const org = await createEntity({
    entity_type: "COMPANY",
    display_name: `${TEST_PREFIX}org_${randomUUID()}`,
    email: `${TEST_PREFIX}org_${randomUUID()}@niov.test`,
    public_key: "test-public-key",
    clearance_level: 0,
  });
  ORG_ID = org.entity_id;
});

afterAll(async () => {
  await app.close();
  await cleanupTestData();
  await prisma.$disconnect();
});

async function makeOrgAdmin(opts: {
  can_admin_org?: boolean;
}): Promise<{ entityId: string; token: string; ip: string }> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const entity = await createEntity(input);
  await prisma.entityMembership.create({
    data: {
      parent_id: ORG_ID,
      child_id: entity.entity_id,
      role_title: "MEMBER",
      is_active: true,
    },
  });
  await prisma.tokenAttributeRepository.update({
    where: { entity_id: entity.entity_id },
    data: { can_admin_org: opts.can_admin_org === true },
  });
  const fresh = await prisma.tokenAttributeRepository.findUnique({
    where: { entity_id: entity.entity_id },
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
    where: { entity_id: entity.entity_id },
    data: { tar_hash: newHash },
  });
  const ip = `10.86.${Math.floor(Math.random() * 200) + 1}.${
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

describe("POST /api/v1/orgs/me/collaboration-policy", () => {
  it("admin upserts a policy row (200)", async () => {
    const admin = await makeOrgAdmin({ can_admin_org: true });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/orgs/me/collaboration-policy",
      headers: { authorization: `Bearer ${admin.token}` },
      payload: {
        collaboration_scope: "CROSS_TEAM",
        outcome: "ALLOW",
      },
      remoteAddress: admin.ip,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      ok: boolean;
      policy: {
        policy_id: string;
        collaboration_scope: string;
        outcome: string;
      };
    };
    expect(body.policy.collaboration_scope).toBe("CROSS_TEAM");
    expect(body.policy.outcome).toBe("ALLOW");
    // org_entity_id never leaks.
    expect(response.payload).not.toContain("org_entity_id");
  });

  it("rejects non-admin caller with 403", async () => {
    const member = await makeOrgAdmin({ can_admin_org: false });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/orgs/me/collaboration-policy",
      headers: { authorization: `Bearer ${member.token}` },
      payload: {
        collaboration_scope: "CROSS_TEAM",
        outcome: "ALLOW",
      },
      remoteAddress: member.ip,
    });
    expect(response.statusCode).toBe(403);
  });

  it("rejects unknown collaboration_scope with 422", async () => {
    const admin = await makeOrgAdmin({ can_admin_org: true });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/orgs/me/collaboration-policy",
      headers: { authorization: `Bearer ${admin.token}` },
      payload: {
        collaboration_scope: "GALAXY_WIDE",
        outcome: "ALLOW",
      },
      remoteAddress: admin.ip,
    });
    expect(response.statusCode).toBe(422);
  });

  it("rejects unknown outcome with 422", async () => {
    const admin = await makeOrgAdmin({ can_admin_org: true });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/orgs/me/collaboration-policy",
      headers: { authorization: `Bearer ${admin.token}` },
      payload: {
        collaboration_scope: "ORG_WIDE",
        outcome: "MAYBE",
      },
      remoteAddress: admin.ip,
    });
    expect(response.statusCode).toBe(422);
  });
});

describe("GET /api/v1/orgs/me/collaboration-policy", () => {
  it("admin lists the org's policies (200)", async () => {
    const admin = await makeOrgAdmin({ can_admin_org: true });
    // Seed at least one row.
    await app.inject({
      method: "POST",
      url: "/api/v1/orgs/me/collaboration-policy",
      headers: { authorization: `Bearer ${admin.token}` },
      payload: {
        collaboration_scope: "ORG_WIDE",
        outcome: "ALLOW",
      },
      remoteAddress: admin.ip,
    });
    const list = await app.inject({
      method: "GET",
      url: "/api/v1/orgs/me/collaboration-policy",
      headers: { authorization: `Bearer ${admin.token}` },
      remoteAddress: admin.ip,
    });
    expect(list.statusCode).toBe(200);
    const body = list.json() as {
      ok: boolean;
      policies: { policy_id: string }[];
    };
    expect(body.ok).toBe(true);
    expect(body.policies.length).toBeGreaterThan(0);
  });

  it("rejects non-admin caller with 403", async () => {
    const member = await makeOrgAdmin({ can_admin_org: false });
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/orgs/me/collaboration-policy",
      headers: { authorization: `Bearer ${member.token}` },
      remoteAddress: member.ip,
    });
    expect(response.statusCode).toBe(403);
  });
});
