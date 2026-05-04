// FILE: observation-routes.test.ts (integration)
// PURPOSE: HTTP-level coverage for the Section 11C observation
//          routes -- /otzar/observe (happy + dedup), /otzar/correction
//          (write CORRECTION).
// CONNECTS TO: buildApp full Fastify wiring with MockLLMProvider
//              injected.

import { randomBytes, randomUUID } from "node:crypto";
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

const TEST_JWT_SECRET = "obs-routes-test-secret-do-not-use-in-prod";
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
      // Used by the first /observe call.
      {
        ok: true,
        text: JSON.stringify({
          decisions: [{ topic: "release", outcome: "ship Friday" }],
          commitments: [],
          key_topics: ["release"],
          external_entities_mentioned: [],
        }),
        provider: "mock",
        model: "mock-1",
      },
      // Subsequent calls reuse the last entry per MockLLMProvider's
      // queue semantics.
    ]),
  });
});

afterAll(async () => {
  await app.close();
  await cleanupTestData();
  await prisma.$disconnect();
});

async function loginWithOrg(): Promise<{
  ownerId: string;
  orgId: string;
  token: string;
  ip: string;
}> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const owner = await createEntity(input);
  const company = await createEntity(
    makeEntityInput({ entity_type: "COMPANY" }),
  );
  await prisma.entityMembership.create({
    data: {
      parent_id: company.entity_id,
      child_id: owner.entity_id,
      is_active: true,
    },
  });
  await prisma.orgSettings.create({
    data: {
      org_entity_id: company.entity_id,
      industry: "TECH",
      track_external_entities: true,
    },
  });
  const ip = `10.99.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 254) + 1}`;
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
    throw new Error(`login failed: ${login.statusCode}`);
  }
  const body = login.json() as { token: string };
  return {
    ownerId: owner.entity_id,
    orgId: company.entity_id,
    token: body.token,
    ip,
  };
}

describe("POST /otzar/observe", () => {
  it("happy path returns 200 + capsule_ids + extracted_summary", async () => {
    const ctx = await loginWithOrg();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/observe",
      headers: { authorization: `Bearer ${ctx.token}` },
      payload: {
        content: `observe-happy-${randomUUID()}`,
        event_type: "MEETING",
      },
      remoteAddress: ctx.ip,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      ok: boolean;
      capsule_ids: string[];
      extracted_summary: { decisions: number };
      skipped?: boolean;
    };
    expect(body.ok).toBe(true);
    expect(body.skipped).toBeFalsy();
    expect(body.capsule_ids.length).toBeGreaterThanOrEqual(1);
    expect(body.extracted_summary.decisions).toBeGreaterThanOrEqual(1);
  });

  it("duplicate content within 24h returns { skipped: true }", async () => {
    const ctx = await loginWithOrg();
    const content = `observe-dedup-${randomUUID()}`;
    const r1 = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/observe",
      headers: { authorization: `Bearer ${ctx.token}` },
      payload: { content, event_type: "MEETING" },
      remoteAddress: ctx.ip,
    });
    expect(r1.statusCode).toBe(200);
    const r2 = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/observe",
      headers: { authorization: `Bearer ${ctx.token}` },
      payload: { content, event_type: "MEETING" },
      remoteAddress: ctx.ip,
    });
    expect(r2.statusCode).toBe(200);
    const body = r2.json() as { ok: boolean; skipped?: boolean; reason?: string };
    expect(body.skipped).toBe(true);
    expect(body.reason).toBe("DUPLICATE_CONTENT");
  });
});

describe("POST /otzar/correction", () => {
  it("writes a CORRECTION capsule and returns 200 + correction_capsule_id", async () => {
    const ctx = await loginWithOrg();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/correction",
      headers: { authorization: `Bearer ${ctx.token}` },
      payload: {
        incorrect_description: "you scheduled the meeting for 9am Pacific",
        correct_behavior: "always default to 9am Eastern when not specified",
      },
      remoteAddress: ctx.ip,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      ok: boolean;
      correction_capsule_id: string;
    };
    expect(body.ok).toBe(true);
    const capsule = await prisma.memoryCapsule.findUnique({
      where: { capsule_id: body.correction_capsule_id },
    });
    expect(capsule?.capsule_type).toBe("CORRECTION");
    expect(capsule?.entity_id).toBe(ctx.ownerId);
  });
});
