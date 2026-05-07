// FILE: observation-extraction-shape.test.ts (real-llm tier)
// PURPOSE: Verify that POST /otzar/observe returns a structurally-
//          correct extraction summary when wired to the real
//          Anthropic provider. Asserts on shape only (decisions is
//          a number, capsule_ids is a non-empty string array, etc.)
//          -- never on exact extracted content -- because real
//          Anthropic extractions vary in specific items across
//          calls.
// CONNECTS TO: buildApp full Fastify wiring, ObservationService
//              routes, getLLMProvider() (real
//              circuit-breaker-wrapped Anthropic).
//
// COST: ~$0.005-0.013 per run. Single LLM call per run; the
// observation prompt is moderately long (synthetic transcript +
// extraction-shape system prompt) and the response is bounded by
// AnthropicProvider's hardcoded max_tokens: 4096
// (llm.service.ts:213).
//
// CADENCE: nightly schedule + on-demand workflow_dispatch only.
// Local invocation via `npm run test:real-llm` requires a real
// ANTHROPIC_API_KEY in .env.test.local.
//
// Per Track A Gate 5 G5.6 / Decision 4.

import { randomBytes, randomUUID } from "node:crypto";
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

const TEST_JWT_SECRET = "real-llm-observation-shape-secret-do-not-use-in-prod";
const TEST_KEY = randomBytes(32);

let app: FastifyInstance;
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
    otzarLLM: getLLMProvider(),
  });
});

afterAll(async () => {
  await app.close();
  await cleanupTestData();
  await prisma.$disconnect();
});

withCleanRateLimits(store);

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

// Synthetic short transcript designed to produce predictable
// extraction shapes (decisions + commitments + key_topics) without
// running up cost. Real Anthropic will pull at least 1 decision +
// 1 action_item from this content.
const SYNTHETIC_TRANSCRIPT = `
Pat: We're going to ship the Q3 release on Friday afternoon.
Sam: Sounds good. I'll handle the customer-facing announcement.
Pat: Ok, and I'll update the release tracker today.
Sam: Cool. We should also bump the version number to 2.4.0.
Pat: Agreed. Let's plan a retrospective for next Wednesday.
`.trim();

describe("real-llm: POST /otzar/observe structural shape", () => {
  it("returns 200 + structurally-correct extraction from real Anthropic provider", async () => {
    const ctx = await loginWithOrg();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/observe",
      headers: { authorization: `Bearer ${ctx.token}` },
      payload: {
        // randomUUID suffix prevents the dedup short-circuit on
        // re-runs against the same Postgres instance.
        content: `${SYNTHETIC_TRANSCRIPT}\n[uniq:${randomUUID()}]`,
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
    // Structural-shape assertions only. The transcript is concrete
    // enough that Anthropic should always produce >=1 decision +
    // >=1 capsule, but specific items vary; assert on the
    // route-response envelope shape, not on counts beyond the
    // happy-path-non-empty guarantee.
    expect(body.ok).toBe(true);
    expect(body.skipped).toBeFalsy();
    expect(Array.isArray(body.capsule_ids)).toBe(true);
    expect(body.capsule_ids.length).toBeGreaterThanOrEqual(1);
    expect(typeof body.extracted_summary).toBe("object");
    expect(typeof body.extracted_summary.decisions).toBe("number");
    expect(body.extracted_summary.decisions).toBeGreaterThanOrEqual(0);
  });
});
