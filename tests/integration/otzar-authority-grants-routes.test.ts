// FILE: otzar-authority-grants-routes.test.ts (integration)
// PURPOSE: Phase EDX-4 PR 2 — HTTP-level coverage for the Twin
//          Authority Grant routes landed at PR 2 of EDX-4. Exercises:
//            - POST /api/v1/otzar/my-twin/authority-grants
//            - GET  /api/v1/otzar/my-twin/authority-grants
//            - POST /api/v1/otzar/my-twin/authority-grants/:id/revoke
//          end-to-end through buildApp's full Fastify wiring with a
//          real test DB (twin_authority_grants table populated via
//          npm run db:push at CI setup).
// CONNECTS TO:
//   - apps/api/src/routes/otzar-authority-grants.routes.ts
//   - apps/api/src/services/otzar/twin-authority-grant.service.ts

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

const TEST_JWT_SECRET = "otzar-authority-grants-routes-test-secret";
const TEST_KEY = randomBytes(32);

let app: FastifyInstance;
let SHARED_ORG_ID: string;

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
  SHARED_ORG_ID = org.entity_id;
});

afterAll(async () => {
  await app.close();
  await cleanupTestData();
  await prisma.$disconnect();
});

async function loginAndAttachTwin(): Promise<{
  ownerId: string;
  twinId: string;
  token: string;
  ip: string;
}> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const owner = await createEntity(input);
  // Same-org membership so getOrgEntityId resolves.
  await prisma.entityMembership.create({
    data: {
      parent_id: SHARED_ORG_ID,
      child_id: owner.entity_id,
      role_title: "MEMBER",
      is_active: true,
    },
  });
  // Twin (AI_AGENT) as child of owner.
  const twinInput = makeEntityInput({ entity_type: "AI_AGENT" });
  const twin = await createEntity(twinInput);
  await prisma.entityMembership.create({
    data: {
      parent_id: owner.entity_id,
      child_id: twin.entity_id,
      role_title: "Digital Twin",
      is_active: true,
    },
  });
  await prisma.twinConfig.create({
    data: {
      twin_id: twin.entity_id,
      autonomy_level: "APPROVAL_REQUIRED",
      is_admin_twin: false,
      role_template: null,
    },
  });
  const ip = `10.96.${Math.floor(Math.random() * 200) + 1}.${
    Math.floor(Math.random() * 254) + 1
  }`;
  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: {
      email: input.email,
      password,
      requested_operations: ["read"],
    },
    remoteAddress: ip,
  });
  if (login.statusCode !== 200) {
    throw new Error(`login failed: ${login.statusCode} ${login.body}`);
  }
  const body = login.json() as { token: string };
  return {
    ownerId: owner.entity_id,
    twinId: twin.entity_id,
    token: body.token,
    ip,
  };
}

describe("POST /api/v1/otzar/my-twin/authority-grants", () => {
  it("creates an ACTIVE grant defaulting grantee to caller's primary Twin (201)", async () => {
    const ctx = await loginAndAttachTwin();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/my-twin/authority-grants",
      headers: { authorization: `Bearer ${ctx.token}` },
      payload: {
        scope_type: "PERSONAL",
        duration_class: "SESSION",
        purpose_summary: "Test session grant",
      },
      remoteAddress: ctx.ip,
    });
    expect(response.statusCode).toBe(201);
    const body = response.json() as {
      ok: boolean;
      grant: {
        grant_id: string;
        duration_class: string;
        state: string;
        scope_type: string;
        purpose_summary: string;
        has_connector_binding: boolean;
        revocable: boolean;
      };
    };
    expect(body.ok).toBe(true);
    expect(body.grant.duration_class).toBe("SESSION");
    expect(body.grant.state).toBe("ACTIVE");
    expect(body.grant.scope_type).toBe("PERSONAL");
    expect(body.grant.has_connector_binding).toBe(false);
    expect(body.grant.revocable).toBe(true);
    // No leakage of internals across the wire.
    expect(response.payload).not.toContain("constraints_json");
    expect(response.payload).not.toContain("connector_binding_id");
    expect(response.payload).not.toContain("revoked_by_entity_id");
    expect(response.payload).not.toContain("grantor_entity_id");
  });

  it("rejects missing bearer with 401", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/my-twin/authority-grants",
      payload: { scope_type: "PERSONAL", duration_class: "SESSION", purpose_summary: "x" },
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects unknown duration_class with 422", async () => {
    const ctx = await loginAndAttachTwin();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/my-twin/authority-grants",
      headers: { authorization: `Bearer ${ctx.token}` },
      payload: {
        scope_type: "PERSONAL",
        duration_class: "FOREVER",
        purpose_summary: "x",
      },
      remoteAddress: ctx.ip,
    });
    expect(response.statusCode).toBe(422);
  });

  it("rejects past expires_at with 422", async () => {
    const ctx = await loginAndAttachTwin();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/my-twin/authority-grants",
      headers: { authorization: `Bearer ${ctx.token}` },
      payload: {
        scope_type: "PERSONAL",
        duration_class: "SHORT_TERM",
        purpose_summary: "Test",
        expires_at: "2020-01-01T00:00:00.000Z",
      },
      remoteAddress: ctx.ip,
    });
    expect(response.statusCode).toBe(422);
  });

  it("rejects ORG-less callers with 403 ORG_NOT_RESOLVED", async () => {
    const password = "correct-horse-battery";
    const orgless = makeEntityInput({ entity_type: "PERSON", password });
    await createEntity(orgless);
    const ip = `10.95.99.1`;
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: orgless.email,
        password,
        requested_operations: ["read"],
      },
      remoteAddress: ip,
    });
    const token = (login.json() as { token: string }).token;
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/my-twin/authority-grants",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        scope_type: "PERSONAL",
        duration_class: "SESSION",
        purpose_summary: "x",
      },
      remoteAddress: ip,
    });
    expect(response.statusCode).toBe(403);
    const body = response.json() as { code: string };
    expect(body.code).toBe("ORG_NOT_RESOLVED");
  });
});

describe("GET /api/v1/otzar/my-twin/authority-grants", () => {
  it("returns only the caller's own grants (self-scope)", async () => {
    const ctxA = await loginAndAttachTwin();
    const ctxB = await loginAndAttachTwin();
    // Each caller creates a grant.
    await app.inject({
      method: "POST",
      url: "/api/v1/otzar/my-twin/authority-grants",
      headers: { authorization: `Bearer ${ctxA.token}` },
      payload: {
        scope_type: "PERSONAL",
        duration_class: "SESSION",
        purpose_summary: "A's grant",
      },
      remoteAddress: ctxA.ip,
    });
    await app.inject({
      method: "POST",
      url: "/api/v1/otzar/my-twin/authority-grants",
      headers: { authorization: `Bearer ${ctxB.token}` },
      payload: {
        scope_type: "PERSONAL",
        duration_class: "SESSION",
        purpose_summary: "B's grant",
      },
      remoteAddress: ctxB.ip,
    });
    // Caller A sees only A's grant.
    const listA = await app.inject({
      method: "GET",
      url: "/api/v1/otzar/my-twin/authority-grants",
      headers: { authorization: `Bearer ${ctxA.token}` },
      remoteAddress: ctxA.ip,
    });
    expect(listA.statusCode).toBe(200);
    const bodyA = listA.json() as {
      ok: boolean;
      grants: { purpose_summary: string }[];
    };
    expect(bodyA.grants.every((g) => g.purpose_summary !== "B's grant")).toBe(
      true,
    );
    expect(
      bodyA.grants.some((g) => g.purpose_summary === "A's grant"),
    ).toBe(true);
  });

  it("respects state filter when provided", async () => {
    const ctx = await loginAndAttachTwin();
    await app.inject({
      method: "POST",
      url: "/api/v1/otzar/my-twin/authority-grants",
      headers: { authorization: `Bearer ${ctx.token}` },
      payload: {
        scope_type: "PERSONAL",
        duration_class: "SESSION",
        purpose_summary: "Filter target",
      },
      remoteAddress: ctx.ip,
    });
    const listRevoked = await app.inject({
      method: "GET",
      url: "/api/v1/otzar/my-twin/authority-grants?state=REVOKED",
      headers: { authorization: `Bearer ${ctx.token}` },
      remoteAddress: ctx.ip,
    });
    expect(listRevoked.statusCode).toBe(200);
    const body = listRevoked.json() as {
      grants: { state: string }[];
    };
    // None of the caller's grants are REVOKED at this point.
    expect(body.grants.length).toBe(0);
  });
});

describe("POST /api/v1/otzar/my-twin/authority-grants/:id/revoke", () => {
  it("transitions ACTIVE → REVOKED for the grantor", async () => {
    const ctx = await loginAndAttachTwin();
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/my-twin/authority-grants",
      headers: { authorization: `Bearer ${ctx.token}` },
      payload: {
        scope_type: "PERSONAL",
        duration_class: "SESSION",
        purpose_summary: "Will be revoked",
      },
      remoteAddress: ctx.ip,
    });
    const createdId = (create.json() as { grant: { grant_id: string } }).grant
      .grant_id;
    const revoke = await app.inject({
      method: "POST",
      url: `/api/v1/otzar/my-twin/authority-grants/${createdId}/revoke`,
      headers: { authorization: `Bearer ${ctx.token}` },
      remoteAddress: ctx.ip,
    });
    expect(revoke.statusCode).toBe(200);
    const body = revoke.json() as {
      ok: boolean;
      grant: { state: string; revocable: boolean };
    };
    expect(body.ok).toBe(true);
    expect(body.grant.state).toBe("REVOKED");
    expect(body.grant.revocable).toBe(false);
  });

  it("returns 403 NOT_GRANTOR when another caller tries to revoke", async () => {
    const ctxA = await loginAndAttachTwin();
    const ctxB = await loginAndAttachTwin();
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/my-twin/authority-grants",
      headers: { authorization: `Bearer ${ctxA.token}` },
      payload: {
        scope_type: "PERSONAL",
        duration_class: "SESSION",
        purpose_summary: "A's grant",
      },
      remoteAddress: ctxA.ip,
    });
    const createdId = (create.json() as { grant: { grant_id: string } }).grant
      .grant_id;
    const revoke = await app.inject({
      method: "POST",
      url: `/api/v1/otzar/my-twin/authority-grants/${createdId}/revoke`,
      headers: { authorization: `Bearer ${ctxB.token}` },
      remoteAddress: ctxB.ip,
    });
    expect(revoke.statusCode).toBe(403);
    const body = revoke.json() as { code: string };
    expect(body.code).toBe("NOT_GRANTOR");
  });

  it("returns 404 GRANT_NOT_FOUND for unknown grant_id", async () => {
    const ctx = await loginAndAttachTwin();
    const revoke = await app.inject({
      method: "POST",
      url: `/api/v1/otzar/my-twin/authority-grants/${randomUUID()}/revoke`,
      headers: { authorization: `Bearer ${ctx.token}` },
      remoteAddress: ctx.ip,
    });
    expect(revoke.statusCode).toBe(404);
    const body = revoke.json() as { code: string };
    expect(body.code).toBe("GRANT_NOT_FOUND");
  });

  it("returns 409 ALREADY_REVOKED on idempotent revoke", async () => {
    const ctx = await loginAndAttachTwin();
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/my-twin/authority-grants",
      headers: { authorization: `Bearer ${ctx.token}` },
      payload: {
        scope_type: "PERSONAL",
        duration_class: "SESSION",
        purpose_summary: "Will be revoked twice",
      },
      remoteAddress: ctx.ip,
    });
    const createdId = (create.json() as { grant: { grant_id: string } }).grant
      .grant_id;
    await app.inject({
      method: "POST",
      url: `/api/v1/otzar/my-twin/authority-grants/${createdId}/revoke`,
      headers: { authorization: `Bearer ${ctx.token}` },
      remoteAddress: ctx.ip,
    });
    const revoke2 = await app.inject({
      method: "POST",
      url: `/api/v1/otzar/my-twin/authority-grants/${createdId}/revoke`,
      headers: { authorization: `Bearer ${ctx.token}` },
      remoteAddress: ctx.ip,
    });
    expect(revoke2.statusCode).toBe(409);
    const body = revoke2.json() as { code: string };
    expect(body.code).toBe("ALREADY_REVOKED");
  });
});
