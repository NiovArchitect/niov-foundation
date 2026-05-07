// FILE: otzar-conversation-shape.test.ts (real-llm tier)
// PURPOSE: Verify that POST /otzar/conversation/message returns a
//          structurally-correct response when wired to the real
//          Anthropic provider (no MockLLMProvider, no
//          FixtureBasedLLMProvider). Asserts on shape only -- never
//          on exact text -- because real-LLM responses vary across
//          calls and across model versions.
// CONNECTS TO: buildApp full Fastify wiring, OtzarService routes,
//              getLLMProvider() (which returns
//              withCircuitBreaker(new AnthropicProvider()) per
//              llm.service.ts:296-307).
//
// COST: ~$0.005-0.010 per run. AnthropicProvider hardcodes
// max_tokens: 4096 (llm.service.ts:213); typical conduct response
// is 200-500 tokens. Single LLM call per run.
//
// CADENCE: nightly schedule + on-demand workflow_dispatch ONLY,
// never on PR/push (cost control). Local invocation via
// `npm run test:real-llm` requires a real ANTHROPIC_API_KEY in
// .env.test.local; vitest.real-llm.config.ts fails fast if the
// stub value from .env.test is still in place.
//
// Per Track A Gate 5 G5.6 / Decision 4 (real-LLM tier
// introduction).

import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildApp,
  getLLMProvider,
  MemoryContentStore,
  MemoryKVCache,
  MemoryNonceStore,
  MemoryRateLimitStore,
} from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import { createEntity, prisma } from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeEntityInput,
  withCleanRateLimits,
} from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "real-llm-otzar-shape-secret-do-not-use-in-prod";
const TEST_KEY = randomBytes(32);

let app: FastifyInstance;
// Per Track A Gate 5 Decision 8 Option A canonical pattern.
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
    otzarCache: new MemoryKVCache(),
    // Real Anthropic provider via getLLMProvider(). This is the
    // distinguishing characteristic of the real-llm tier per
    // ADR-0011 -- everything else mirrors the integration tier.
    otzarLLM: getLLMProvider(),
  });
});

afterAll(async () => {
  await app.close();
  await cleanupTestData();
  await prisma.$disconnect();
});

withCleanRateLimits(store);

async function loginAndAttachTwin(): Promise<{
  ownerId: string;
  token: string;
  ip: string;
}> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const owner = await createEntity(input);
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

describe("real-llm: POST /otzar/conversation/message structural shape", () => {
  it("returns 200 + structurally-correct response from real Anthropic provider", async () => {
    const ctx = await loginAndAttachTwin();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/conversation/message",
      headers: { authorization: `Bearer ${ctx.token}` },
      payload: { message: "hello" },
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
    // Structural-shape assertions only. Real Anthropic responses
    // vary across calls + model versions; never assert on exact
    // text. The real-llm tier exists to catch shape regressions
    // (provider API changes, response-envelope drift), not
    // content-level changes.
    expect(body.ok).toBe(true);
    expect(typeof body.response).toBe("string");
    expect(body.response.length).toBeGreaterThan(0);
    expect(body.conversation_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(typeof body.tokens_consumed).toBe("number");
    expect(body.tokens_consumed).toBeGreaterThan(0);
    expect(typeof body.context_used).toBe("number");
  });
});
