// FILE: otzar-correction-memory-routes.test.ts (integration)
// PURPOSE: Phase EDX-5 PR 2 — HTTP-level coverage for the
//          TwinCorrectionMemory routes. End-to-end through buildApp
//          against the test DB (twin_correction_memories table
//          populated by CI's npm run db:push).
// CONNECTS TO:
//   - apps/api/src/routes/otzar-correction-memory.routes.ts
//   - apps/api/src/services/otzar/twin-correction-memory.service.ts

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

const TEST_JWT_SECRET = "otzar-correction-memory-routes-test-secret";
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

async function loginInOrg(): Promise<{
  ownerId: string;
  token: string;
  ip: string;
}> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const owner = await createEntity(input);
  await prisma.entityMembership.create({
    data: {
      parent_id: SHARED_ORG_ID,
      child_id: owner.entity_id,
      role_title: "MEMBER",
      is_active: true,
    },
  });
  const ip = `10.94.${Math.floor(Math.random() * 200) + 1}.${
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
  return { ownerId: owner.entity_id, token: body.token, ip };
}

describe("POST /api/v1/otzar/my-twin/corrections", () => {
  it("creates an ACTIVE correction with safe projection (201)", async () => {
    const ctx = await loginInOrg();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/my-twin/corrections",
      headers: { authorization: `Bearer ${ctx.token}` },
      payload: {
        scope_type: "PERSONAL",
        correction_type: "TONE_PREFERENCE",
        safe_summary: "Use direct, concise language when summarizing reports.",
      },
      remoteAddress: ctx.ip,
    });
    expect(response.statusCode).toBe(201);
    const body = response.json() as {
      ok: boolean;
      correction: {
        correction_id: string;
        correction_type: string;
        scope_type: string;
        state: string;
        revocable: boolean;
        safe_summary: string;
      };
    };
    expect(body.ok).toBe(true);
    expect(body.correction.correction_type).toBe("TONE_PREFERENCE");
    expect(body.correction.scope_type).toBe("PERSONAL");
    expect(body.correction.state).toBe("ACTIVE");
    expect(body.correction.revocable).toBe(true);
    // No leakage of internals.
    expect(response.payload).not.toContain("source_message_id");
    expect(response.payload).not.toContain("source_conversation_id");
    expect(response.payload).not.toContain("owner_entity_id");
    expect(response.payload).not.toContain("created_by_entity_id");
  });

  it("rejects missing bearer with 401", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/my-twin/corrections",
      payload: {
        scope_type: "PERSONAL",
        correction_type: "PREFERENCE",
        safe_summary: "x",
      },
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects unknown correction_type with 422", async () => {
    const ctx = await loginInOrg();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/my-twin/corrections",
      headers: { authorization: `Bearer ${ctx.token}` },
      payload: {
        scope_type: "PERSONAL",
        correction_type: "MAKE_UP_SOMETHING",
        safe_summary: "x",
      },
      remoteAddress: ctx.ip,
    });
    expect(response.statusCode).toBe(422);
  });

  it("rejects ORG-less callers with 403 ORG_NOT_RESOLVED", async () => {
    const password = "correct-horse-battery";
    const orgless = makeEntityInput({ entity_type: "PERSON", password });
    await createEntity(orgless);
    const ip = `10.93.99.1`;
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
      url: "/api/v1/otzar/my-twin/corrections",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        scope_type: "PERSONAL",
        correction_type: "PREFERENCE",
        safe_summary: "x",
      },
      remoteAddress: ip,
    });
    expect(response.statusCode).toBe(403);
    const body = response.json() as { code: string };
    expect(body.code).toBe("ORG_NOT_RESOLVED");
  });
});

describe("GET /api/v1/otzar/my-twin/corrections", () => {
  it("returns only the caller's own corrections (self-scope)", async () => {
    const ctxA = await loginInOrg();
    const ctxB = await loginInOrg();
    await app.inject({
      method: "POST",
      url: "/api/v1/otzar/my-twin/corrections",
      headers: { authorization: `Bearer ${ctxA.token}` },
      payload: {
        scope_type: "PERSONAL",
        correction_type: "PREFERENCE",
        safe_summary: "A's preference",
      },
      remoteAddress: ctxA.ip,
    });
    await app.inject({
      method: "POST",
      url: "/api/v1/otzar/my-twin/corrections",
      headers: { authorization: `Bearer ${ctxB.token}` },
      payload: {
        scope_type: "PERSONAL",
        correction_type: "PREFERENCE",
        safe_summary: "B's preference",
      },
      remoteAddress: ctxB.ip,
    });
    const listA = await app.inject({
      method: "GET",
      url: "/api/v1/otzar/my-twin/corrections",
      headers: { authorization: `Bearer ${ctxA.token}` },
      remoteAddress: ctxA.ip,
    });
    const bodyA = listA.json() as {
      ok: boolean;
      corrections: { safe_summary: string }[];
    };
    expect(bodyA.ok).toBe(true);
    expect(
      bodyA.corrections.every((c) => c.safe_summary !== "B's preference"),
    ).toBe(true);
    expect(
      bodyA.corrections.some((c) => c.safe_summary === "A's preference"),
    ).toBe(true);
  });

  it("respects correction_type filter", async () => {
    const ctx = await loginInOrg();
    await app.inject({
      method: "POST",
      url: "/api/v1/otzar/my-twin/corrections",
      headers: { authorization: `Bearer ${ctx.token}` },
      payload: {
        scope_type: "PERSONAL",
        correction_type: "ASK_BEFORE_ACTING",
        safe_summary: "Filter target",
      },
      remoteAddress: ctx.ip,
    });
    const list = await app.inject({
      method: "GET",
      url: "/api/v1/otzar/my-twin/corrections?correction_type=ASK_BEFORE_ACTING",
      headers: { authorization: `Bearer ${ctx.token}` },
      remoteAddress: ctx.ip,
    });
    const body = list.json() as {
      corrections: { correction_type: string }[];
    };
    expect(
      body.corrections.every((c) => c.correction_type === "ASK_BEFORE_ACTING"),
    ).toBe(true);
  });
});

describe("POST /api/v1/otzar/my-twin/corrections/:id/revoke", () => {
  it("transitions ACTIVE → REVOKED for the owner", async () => {
    const ctx = await loginInOrg();
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/my-twin/corrections",
      headers: { authorization: `Bearer ${ctx.token}` },
      payload: {
        scope_type: "PERSONAL",
        correction_type: "PREFERENCE",
        safe_summary: "Will be revoked",
      },
      remoteAddress: ctx.ip,
    });
    const created = (create.json() as { correction: { correction_id: string } })
      .correction;
    const revoke = await app.inject({
      method: "POST",
      url: `/api/v1/otzar/my-twin/corrections/${created.correction_id}/revoke`,
      headers: { authorization: `Bearer ${ctx.token}` },
      remoteAddress: ctx.ip,
    });
    expect(revoke.statusCode).toBe(200);
    const body = revoke.json() as {
      ok: boolean;
      correction: { state: string; revocable: boolean };
    };
    expect(body.correction.state).toBe("REVOKED");
    expect(body.correction.revocable).toBe(false);
  });

  it("returns 403 NOT_OWNER when another caller tries to revoke", async () => {
    const ctxA = await loginInOrg();
    const ctxB = await loginInOrg();
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/my-twin/corrections",
      headers: { authorization: `Bearer ${ctxA.token}` },
      payload: {
        scope_type: "PERSONAL",
        correction_type: "PREFERENCE",
        safe_summary: "A's correction",
      },
      remoteAddress: ctxA.ip,
    });
    const created = (create.json() as { correction: { correction_id: string } })
      .correction;
    const revoke = await app.inject({
      method: "POST",
      url: `/api/v1/otzar/my-twin/corrections/${created.correction_id}/revoke`,
      headers: { authorization: `Bearer ${ctxB.token}` },
      remoteAddress: ctxB.ip,
    });
    expect(revoke.statusCode).toBe(403);
    const body = revoke.json() as { code: string };
    expect(body.code).toBe("NOT_OWNER");
  });

  it("returns 404 CORRECTION_NOT_FOUND for unknown id", async () => {
    const ctx = await loginInOrg();
    const revoke = await app.inject({
      method: "POST",
      url: `/api/v1/otzar/my-twin/corrections/${randomUUID()}/revoke`,
      headers: { authorization: `Bearer ${ctx.token}` },
      remoteAddress: ctx.ip,
    });
    expect(revoke.statusCode).toBe(404);
    const body = revoke.json() as { code: string };
    expect(body.code).toBe("CORRECTION_NOT_FOUND");
  });

  it("returns 409 ALREADY_REVOKED on idempotent revoke", async () => {
    const ctx = await loginInOrg();
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/my-twin/corrections",
      headers: { authorization: `Bearer ${ctx.token}` },
      payload: {
        scope_type: "PERSONAL",
        correction_type: "PREFERENCE",
        safe_summary: "Will be revoked twice",
      },
      remoteAddress: ctx.ip,
    });
    const created = (create.json() as { correction: { correction_id: string } })
      .correction;
    await app.inject({
      method: "POST",
      url: `/api/v1/otzar/my-twin/corrections/${created.correction_id}/revoke`,
      headers: { authorization: `Bearer ${ctx.token}` },
      remoteAddress: ctx.ip,
    });
    const revoke2 = await app.inject({
      method: "POST",
      url: `/api/v1/otzar/my-twin/corrections/${created.correction_id}/revoke`,
      headers: { authorization: `Bearer ${ctx.token}` },
      remoteAddress: ctx.ip,
    });
    expect(revoke2.statusCode).toBe(409);
    const body = revoke2.json() as { code: string };
    expect(body.code).toBe("ALREADY_REVOKED");
  });
});
