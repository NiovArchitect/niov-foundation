// FILE: otzar-voice-ready-routes.test.ts (integration)
// PURPOSE: Phase 3 — HTTP-level coverage for the voice-ready route
//          that bridges a text transcript into the ConductSession
//          structured envelope.
// CONNECTS TO:
//   - apps/api/src/routes/otzar-voice-ready.routes.ts

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildApp,
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
  makeSequencedFixtureProvider,
} from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "otzar-voice-ready-routes-test-secret";
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
    otzarLLM: makeSequencedFixtureProvider([
      "otzar-conversation-happy-path",
      "otzar-conversation-happy-path",
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
  const ip = `10.85.${Math.floor(Math.random() * 200) + 1}.${
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
    throw new Error(`login failed: ${login.statusCode}`);
  }
  const body = login.json() as { token: string };
  return { ownerId: owner.entity_id, token: body.token, ip };
}

describe("POST /api/v1/otzar/my-twin/voice-intents", () => {
  it("happy path returns ConductSession envelope + provider_mode TEXT_ONLY (200)", async () => {
    const ctx = await loginAndAttachTwin();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/my-twin/voice-intents",
      headers: { authorization: `Bearer ${ctx.token}` },
      payload: { transcript_text: "hello otzar" },
      remoteAddress: ctx.ip,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      ok: boolean;
      response: string;
      speech_ready_text: string;
      voice_output_supported: boolean;
      next_step: string;
      memory_used_summary: { total_capsules: number };
      provider_mode: string;
    };
    expect(body.ok).toBe(true);
    expect(typeof body.response).toBe("string");
    expect(typeof body.speech_ready_text).toBe("string");
    expect(body.voice_output_supported).toBe(false);
    expect(body.next_step).toBe("ANSWERED");
    expect(typeof body.memory_used_summary.total_capsules).toBe("number");
    // The route's signature field.
    expect(body.provider_mode).toBe("TEXT_ONLY");
    // No leakage of internals.
    expect(response.payload).not.toContain('"content":');
    expect(response.payload).not.toContain("capsules_denied_permission");
  });

  it("accepts 'message' as an alias for transcript_text", async () => {
    const ctx = await loginAndAttachTwin();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/my-twin/voice-intents",
      headers: { authorization: `Bearer ${ctx.token}` },
      payload: { message: "alias path" },
      remoteAddress: ctx.ip,
    });
    expect(response.statusCode).toBe(200);
  });

  it("rejects missing bearer with 401", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/my-twin/voice-intents",
      payload: { transcript_text: "hi" },
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects missing transcript_text / message with 422", async () => {
    const ctx = await loginAndAttachTwin();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/my-twin/voice-intents",
      headers: { authorization: `Bearer ${ctx.token}` },
      payload: {},
      remoteAddress: ctx.ip,
    });
    expect(response.statusCode).toBe(422);
  });
});
