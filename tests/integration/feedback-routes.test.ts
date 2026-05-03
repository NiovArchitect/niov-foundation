// FILE: feedback-routes.test.ts (integration)
// PURPOSE: HTTP-level coverage for the Section 10 read endpoints
//          backed by feedback-loop output: GET /org/suggestions
//          (Loop 3), GET /wallet/suggestions (Loop 6), GET
//          /platform/loops (Loop 7 health table).
// CONNECTS TO: buildApp, prisma seeding, AuthService for direct
//              login.

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

const TEST_JWT_SECRET = "feedback-routes-test-secret-do-not-use-in-prod";
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

async function makeAdminAndLogin(opts: {
  can_admin_org?: boolean;
  remoteAddress?: string;
}): Promise<{ entityId: string; token: string; ip: string }> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const entity = await createEntity(input);
  if (opts.can_admin_org === true) {
    await prisma.tokenAttributeRepository.update({
      where: { entity_id: entity.entity_id },
      data: { can_admin_org: true },
    });
    const fresh = await prisma.tokenAttributeRepository.findUnique({
      where: { entity_id: entity.entity_id },
    });
    if (fresh === null) throw new Error("TAR vanished");
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
  const ip =
    opts.remoteAddress ?? `10.99.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 254) + 1}`;
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
    throw new Error(`login failed: ${login.statusCode}`);
  }
  const body = login.json() as { token: string };
  return { entityId: entity.entity_id, token: body.token, ip };
}

describe("GET /org/suggestions", () => {
  it("returns PermissionSuggestion rows tied to caller's org and excludes other orgs", async () => {
    const orgA = await createEntity(makeEntityInput({ entity_type: "COMPANY" }));
    const orgB = await createEntity(makeEntityInput({ entity_type: "COMPANY" }));
    const adminA = await makeAdminAndLogin({ can_admin_org: true });
    const memberB = await createEntity(makeEntityInput({ entity_type: "PERSON" }));

    // Wire admin into orgA.
    await prisma.entityMembership.create({
      data: {
        parent_id: orgA.entity_id,
        child_id: adminA.entityId,
        is_active: true,
        is_admin: true,
      },
    });
    await prisma.entityMembership.create({
      data: {
        parent_id: orgB.entity_id,
        child_id: memberB.entity_id,
        is_active: true,
      },
    });

    // Seed two suggestions: one in orgA scope, one entirely in orgB.
    await prisma.permissionSuggestion.createMany({
      data: [
        {
          grantor_id: adminA.entityId,
          grantee_id: orgA.entity_id,
          capsule_type: "DOMAIN_KNOWLEDGE",
          suggestion_text: "orgA pattern",
        },
        {
          grantor_id: memberB.entity_id,
          grantee_id: orgB.entity_id,
          capsule_type: "DOMAIN_KNOWLEDGE",
          suggestion_text: "orgB pattern",
        },
      ],
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/org/suggestions",
      headers: { authorization: `Bearer ${adminA.token}` },
      remoteAddress: adminA.ip,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      items: Array<{ suggestion_text: string }>;
    };
    const texts = body.items.map((s) => s.suggestion_text);
    expect(texts).toContain("orgA pattern");
    expect(texts).not.toContain("orgB pattern");
  });
});

describe("GET /wallet/suggestions", () => {
  it("returns MonetizationSuggestion rows for caller's wallet only", async () => {
    const me = await makeAdminAndLogin({});
    const someoneElse = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    await prisma.monetizationSuggestion.createMany({
      data: [
        {
          entity_id: me.entityId,
          capsule_type: "DOMAIN_KNOWLEDGE",
          demand_level: "HIGH",
          estimated_value_usd: 12.5,
        },
        {
          entity_id: someoneElse.entity_id,
          capsule_type: "DOMAIN_KNOWLEDGE",
          demand_level: "LOW",
          estimated_value_usd: 0.5,
        },
      ],
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/wallet/suggestions",
      headers: { authorization: `Bearer ${me.token}` },
      remoteAddress: me.ip,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      items: Array<{ entity_id: string; demand_level: string }>;
    };
    expect(body.items.length).toBeGreaterThanOrEqual(1);
    expect(body.items.every((s) => s.entity_id === me.entityId)).toBe(true);
  });
});

describe("GET /platform/loops -- Section 10 upgrade from stub", () => {
  it("returns the 7 FeedbackLoopHealth rows seeded on boot", async () => {
    const platformAdmin = await makeAdminAndLogin({ can_admin_org: false });
    // Flip can_admin_niov for platform access.
    await prisma.tokenAttributeRepository.update({
      where: { entity_id: platformAdmin.entityId },
      data: { can_admin_niov: true },
    });
    const fresh = await prisma.tokenAttributeRepository.findUnique({
      where: { entity_id: platformAdmin.entityId },
    });
    if (fresh === null) throw new Error("TAR vanished");
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
      where: { entity_id: platformAdmin.entityId },
      data: { tar_hash: newHash },
    });
    // Re-login so the session JWT carries the new TAR hash.
    const password = "correct-horse-battery";
    const refreshed = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: (
          await prisma.entity.findUnique({
            where: { entity_id: platformAdmin.entityId },
          })
        )?.email,
        password,
        requested_operations: ["read"],
      },
      remoteAddress: `10.99.250.${Math.floor(Math.random() * 200) + 1}`,
    });
    expect(refreshed.statusCode).toBe(200);
    const newToken = (refreshed.json() as { token: string }).token;

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/platform/loops",
      headers: { authorization: `Bearer ${newToken}` },
      remoteAddress: `10.99.250.${Math.floor(Math.random() * 200) + 1}`,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      items: Array<{ loop_id: string; loop_name: string }>;
      total: number;
    };
    expect(body.total).toBeGreaterThanOrEqual(7);
    const ids = body.items.map((l) => l.loop_id).sort();
    for (const expected of [
      "loop_1",
      "loop_2",
      "loop_3",
      "loop_4",
      "loop_5",
      "loop_6",
      "loop_7",
    ]) {
      expect(ids).toContain(expected);
    }
    void TEST_PREFIX;
    void randomUUID;
  });
});
