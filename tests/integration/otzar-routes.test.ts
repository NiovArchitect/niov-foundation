// FILE: otzar-routes.test.ts (integration)
// PURPOSE: HTTP-level coverage for POST /otzar/conversation/message
//          and POST /otzar/conversation/close. Exercises the routes
//          end-to-end through buildApp's full Fastify wiring (with
//          a MockLLMProvider injected via BuildAppConfig.otzarLLM
//          so no real Anthropic API calls fire).
// CONNECTS TO: buildApp, OtzarService routes, AuthService for
//              login.

import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildApp,
  MemoryContentStore,
  MemoryKVCache,
  MemoryNonceStore,
  MemoryRateLimitStore,
  MockLLMProvider,
} from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import { createEntity, prisma } from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeEntityInput,
} from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "otzar-routes-test-secret-do-not-use-in-prod";
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
    otzarCache: new MemoryKVCache(),
    otzarLLM: new MockLLMProvider([
      {
        ok: true,
        text: "stub LLM response",
        provider: "mock",
        model: "mock-1",
      },
    ]),
  });
});

afterAll(async () => {
  await app.close();
  await cleanupTestData();
  await prisma.$disconnect();
});

async function loginAndAttachTwin(): Promise<{
  ownerId: string;
  token: string;
  ip: string;
}> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const owner = await createEntity(input);
  // Twin
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
  const ip = `10.99.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 254) + 1}`;
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
    throw new Error(`login failed: ${login.statusCode}`);
  }
  const body = login.json() as { token: string };
  return { ownerId: owner.entity_id, token: body.token, ip };
}

describe("POST /otzar/conversation/message", () => {
  it("happy path returns 200 + structured response", async () => {
    const ctx = await loginAndAttachTwin();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/conversation/message",
      headers: { authorization: `Bearer ${ctx.token}` },
      payload: { message: "hello otzar" },
      remoteAddress: ctx.ip,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      ok: boolean;
      response: string;
      conversation_id: string;
      context_used: number;
      tokens_consumed: number;
    };
    expect(body.ok).toBe(true);
    expect(body.response).toBe("stub LLM response");
    expect(body.conversation_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(typeof body.tokens_consumed).toBe("number");
    expect(typeof body.context_used).toBe("number");
  });

  it("rejects token_budget > 50000 with BUDGET_TOO_LARGE 422", async () => {
    const ctx = await loginAndAttachTwin();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/conversation/message",
      headers: { authorization: `Bearer ${ctx.token}` },
      payload: { message: "hi", token_budget: 60_000 },
      remoteAddress: ctx.ip,
    });
    expect(response.statusCode).toBe(422);
    expect((response.json() as { code: string }).code).toBe("BUDGET_TOO_LARGE");
  });

  it("returns 413 TOKEN_BUDGET_EXCEEDED with structured detail when identity floor exceeds budget", async () => {
    const ctx = await loginAndAttachTwin();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/conversation/message",
      headers: { authorization: `Bearer ${ctx.token}` },
      payload: { message: "hi", token_budget: 5 },
      remoteAddress: ctx.ip,
    });
    expect(response.statusCode).toBe(413);
    const body = response.json() as {
      ok: boolean;
      code: string;
      detail: {
        identity_floor: number;
        budget: number;
        trimmed: { L8: number; L5: number; L7: number };
      };
    };
    expect(body.ok).toBe(false);
    expect(body.code).toBe("TOKEN_BUDGET_EXCEEDED");
    expect(typeof body.detail.identity_floor).toBe("number");
    expect(body.detail.budget).toBe(5);
    expect(body.detail.trimmed).toMatchObject({ L8: 0, L5: 0 });
  });
});

describe("POST /otzar/conversation/close", () => {
  it("happy path returns 200 + capsule_id + topics", async () => {
    const ctx = await loginAndAttachTwin();
    const msg = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/conversation/message",
      headers: { authorization: `Bearer ${ctx.token}` },
      payload: { message: "hello" },
      remoteAddress: ctx.ip,
    });
    expect(msg.statusCode).toBe(200);
    const conv = (msg.json() as { conversation_id: string }).conversation_id;

    const close = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/conversation/close",
      headers: { authorization: `Bearer ${ctx.token}` },
      payload: { conversation_id: conv, capsule_ids_used: [] },
      remoteAddress: ctx.ip,
    });
    expect(close.statusCode).toBe(200);
    const body = close.json() as {
      ok: boolean;
      capsule_id: string;
      conversation_id: string;
      topics: string[];
    };
    expect(body.ok).toBe(true);
    expect(body.conversation_id).toBe(conv);
    expect(Array.isArray(body.topics)).toBe(true);
  });
});
