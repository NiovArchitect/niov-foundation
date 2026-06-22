// FILE: observation-routes.test.ts (integration)
// PURPOSE: HTTP-level coverage for the Section 11C observation
//          routes -- /otzar/observe (happy + dedup), /otzar/correction
//          (write CORRECTION).
// CONNECTS TO: buildApp full Fastify wiring with a fixture-replay
//              LLM provider injected via BuildAppConfig.otzarLLM.
//              ADR-0014 fixture-replay via makeFixtureProvider --
//              the single-key adapter is appropriate here because
//              both LLM-consuming calls in this file (test L118 +
//              test L143's first /observe) share the same recorded
//              extraction shape per Track A Gate 5 G5.4.2.

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
  makeFixtureProvider,
} from "../helpers.js";
import observationExtraction from "../fixtures/llm/observation-extraction-tech-release.json";
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
    // Fixture-replay: every LLM call in this file (test L118 +
    // test L143's first /observe) returns the recorded
    // observation-extraction-tech-release response. The dedup test
    // L143's second /observe short-circuits before the LLM, so
    // only 2 LLM calls fire in this file -- both serving the same
    // fixture is correct.
    otzarLLM: makeFixtureProvider("observation-extraction-tech-release"),
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
    // Decision 1 Option C: exact-equality matching the recorded
    // fixture's decisions array length (1). Re-recording with a
    // different count auto-fails this assertion, surfacing fixture-
    // content drift instead of silently passing.
    expect(body.extracted_summary.decisions).toBe(1);
    // Sanity-check the observation fixture import loaded correctly
    // (also serves as an unused-import guard).
    expect(observationExtraction.fixtureKey).toBe(
      "observation-extraction-tech-release",
    );
  });

  // [OTZAR-RETURN-10-FOUNDATION] forward-only voice-note grouping id.
  it("a voice-note observe (source) returns 200 + a UUID voice_note_id", async () => {
    const ctx = await loginWithOrg();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/observe",
      headers: { authorization: `Bearer ${ctx.token}` },
      payload: {
        content: `observe-voice-${randomUUID()}`,
        event_type: "NOTE",
        source: "voice_note_capture",
      },
      remoteAddress: ctx.ip,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { ok: boolean; voice_note_id?: string; capsule_ids: string[] };
    expect(body.ok).toBe(true);
    expect(typeof body.voice_note_id).toBe("string");
    expect(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        body.voice_note_id ?? "",
      ),
    ).toBe(true);
  });

  it("a non-voice observe returns 200 with NO voice_note_id (backward compatible)", async () => {
    const ctx = await loginWithOrg();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/observe",
      headers: { authorization: `Bearer ${ctx.token}` },
      payload: { content: `observe-plain-${randomUUID()}`, event_type: "MEETING" },
      remoteAddress: ctx.ip,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { ok: boolean; voice_note_id?: string };
    expect(body.ok).toBe(true);
    expect(body.voice_note_id).toBeUndefined();
  });

  it("a non-UUID voice_note_id is rejected with 422", async () => {
    const ctx = await loginWithOrg();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/observe",
      headers: { authorization: `Bearer ${ctx.token}` },
      payload: {
        content: `observe-badid-${randomUUID()}`,
        event_type: "NOTE",
        source: "voice_note_capture",
        voice_note_id: "not-a-uuid",
      },
      remoteAddress: ctx.ip,
    });
    expect(response.statusCode).toBe(422);
    const body = response.json() as { ok: boolean; message?: string };
    expect(body.ok).toBe(false);
    expect((body.message ?? "").toLowerCase()).toContain("voice_note_id");
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
  // ADR-0055 Wave 2C: helper to make a conversation owned by `entityId`.
  // No LLM -- deterministic.
  async function makeOwnedConversation(entityId: string): Promise<string> {
    const conversationId = randomUUID();
    await prisma.otzarConversation.create({
      data: {
        conversation_id: conversationId,
        entity_id: entityId,
        twin_id: entityId,
        source_type: "CHAT",
        participants: [entityId],
        message_count: 1,
        status: "ACTIVE",
      },
    });
    return conversationId;
  }

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

  // ADR-0055 Wave 2C: optional conversation_id linkage on the POST body.
  it("200 with conversation_id persists conversation_id on the capsule", async () => {
    const ctx = await loginWithOrg();
    const conversationId = await makeOwnedConversation(ctx.ownerId);
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/correction",
      headers: { authorization: `Bearer ${ctx.token}` },
      payload: {
        incorrect_description: "wrong link",
        correct_behavior: "right link",
        conversation_id: conversationId,
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
    expect(capsule?.conversation_id).toBe(conversationId);
  });

  it("200 without conversation_id (backward-compat) persists conversation_id null", async () => {
    const ctx = await loginWithOrg();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/correction",
      headers: { authorization: `Bearer ${ctx.token}` },
      payload: {
        incorrect_description: "backward-compat wrong",
        correct_behavior: "backward-compat right",
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
    expect(capsule?.conversation_id).toBeNull();
  });

  it("404 CONVERSATION_NOT_FOUND for an unknown conversation_id", async () => {
    const ctx = await loginWithOrg();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/correction",
      headers: { authorization: `Bearer ${ctx.token}` },
      payload: {
        incorrect_description: "wrong unknown",
        correct_behavior: "right unknown",
        conversation_id: randomUUID(),
      },
      remoteAddress: ctx.ip,
    });
    expect(response.statusCode).toBe(404);
    const body = response.json() as { code: string };
    expect(body.code).toBe("CONVERSATION_NOT_FOUND");
  });

  it("403 NOT_CONVERSATION_OWNER for a cross-caller conversation_id", async () => {
    const a = await loginWithOrg();
    const b = await loginWithOrg();
    const bConvId = await makeOwnedConversation(b.ownerId);
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/correction",
      headers: { authorization: `Bearer ${a.token}` },
      payload: {
        incorrect_description: "wrong cross",
        correct_behavior: "right cross",
        conversation_id: bConvId,
      },
      remoteAddress: a.ip,
    });
    expect(response.statusCode).toBe(403);
    const body = response.json() as { code: string };
    expect(body.code).toBe("NOT_CONVERSATION_OWNER");
    // No leak: no CORRECTION capsule written for A linked to B's conv.
    const leakCheck = await prisma.memoryCapsule.findFirst({
      where: {
        capsule_type: "CORRECTION",
        conversation_id: bConvId,
        entity_id: a.ownerId,
      },
    });
    expect(leakCheck).toBeNull();
  });
});
