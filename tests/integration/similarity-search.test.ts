// FILE: similarity-search.test.ts (integration)
// PURPOSE: Verify G3.6 retrieval at the HTTP route + DB tier per
//          ADR-0043 §Sub-decision 11 (Q-G3-κ) + Q-G3.6-ζ LOCK. J1
//          asserts response-body privacy invariant (no vector /
//          embedding / distance fields); J2 cross-wallet denial via
//          real DB; J3 CAPSULE_SIMILARITY_SEARCH audit row
//          persistence; J4 HNSW iterative scan substrate proof under
//          selective filters.
// CONNECTS TO: SimilarityService via POST /api/v1/cosmp/search;
//              FixtureBasedEmbeddingProvider; prisma test substrate.
//
// CI RULE: no real OpenAI calls; FixtureBasedEmbeddingProvider only.

import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, MemoryNonceStore, type LoginResult } from "@niov/api";
import { createEntity, prisma } from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeEntityInput,
} from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "similarity-search-test-secret-do-not-use";

let app: FastifyInstance;

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
  app = await buildApp({
    jwtSecret: TEST_JWT_SECRET,
    sessionNonceStore: new MemoryNonceStore(),
    declarationStore: new MemoryNonceStore(),
  });
});

afterAll(async () => {
  await app.close();
  await cleanupTestData();
  await prisma.$disconnect();
});

async function loginViaApi(
  email: string,
  password: string,
): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: {
      email,
      password,
      requested_operations: ["read", "write"],
    },
  });
  const body = res.json() as LoginResult;
  if (!body.ok) {
    throw new Error(
      `login failed: status=${res.statusCode} body=${JSON.stringify(body)}`,
    );
  }
  return body.token;
}

async function createPerson() {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const entity = await createEntity(input);
  const token = await loginViaApi(input.email!, password);
  return { entity, token };
}

async function createCapsuleViaApi(token: string, payload: {
  capsule_type: string;
  topic_tags: string[];
  payload_summary: string;
  content: string;
}) {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/cosmp/capsule",
    headers: { authorization: `Bearer ${token}` },
    payload,
  });
  const body = res.json() as { ok: boolean; capsule_id?: string };
  return body;
}

describe("G3.6 — similarity search HTTP route (J1-J4)", () => {
  it("J1 POST /api/v1/cosmp/search response body has no vector or distance fields", async () => {
    const owner = await createPerson();
    await createCapsuleViaApi(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["g3.6-j1"],
      payload_summary: "j1-summary",
      content: "j1-content",
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/cosmp/search",
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { query_text: "j1-query", topK: 5 },
    });
    expect(res.statusCode).toBe(200);
    const serialized = res.body;
    // V2 Correction 4: HTTP boundary privacy invariant. Response body
    // must NOT contain any vector / embedding / distance field at the
    // API boundary. Tier 1 Gate 16 verifies these assertions exist
    // verbatim inside this named test block.
    expect(serialized).not.toContain("vector");
    expect(serialized).not.toContain("embedding");
    expect(serialized).not.toContain("distance");
    expect(serialized).not.toContain("cosine_distance");
    // No large floating-point array signature either
    expect(serialized).not.toMatch(/\[(-?\d+\.\d+,){10,}/);
  });

  it("J2 cross-wallet denial via real DB returns zero matches", async () => {
    const alice = await createPerson();
    const bob = await createPerson();
    const aliceCap = await createCapsuleViaApi(alice.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["g3.6-j2-alice"],
      payload_summary: "j2-alice",
      content: "j2-alice-content",
    });
    expect(aliceCap.ok).toBe(true);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/cosmp/search",
      headers: { authorization: `Bearer ${bob.token}` },
      payload: { query_text: "j2-cross-wallet", topK: 10 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      ok: boolean;
      matches: Array<{ capsule_id: string }>;
    };
    expect(body.ok).toBe(true);
    const ids = body.matches.map((m) => m.capsule_id);
    // Bob's session must NOT see Alice's capsule
    expect(ids).not.toContain(aliceCap.capsule_id);
  });

  it("J3 CAPSULE_SIMILARITY_SEARCH audit row persists with allowed fields only", async () => {
    const owner = await createPerson();
    await createCapsuleViaApi(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["g3.6-j3"],
      payload_summary: "j3-summary",
      content: "j3-content",
    });
    const SENTINEL = `J3_PRIVATE_${randomBytes(8).toString("hex")}`;

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/cosmp/search",
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { query_text: SENTINEL, topK: 3 },
    });
    expect(res.statusCode).toBe(200);

    const audit = await prisma.auditEvent.findFirst({
      where: {
        event_type: "CAPSULE_SIMILARITY_SEARCH",
        actor_entity_id: owner.entity.entity_id,
        outcome: "SUCCESS",
      },
      orderBy: { timestamp: "desc" },
    });
    expect(audit).not.toBeNull();
    const details = audit?.details as Record<string, unknown>;
    expect(details.query_length).toBe(SENTINEL.length);
    expect(details.topK).toBe(3);
    expect(details.result_count).toBeDefined();
    expect(Array.isArray(details.filters_applied)).toBe(true);
    expect(details.embedding_generated).toBe(true);
    // Forbidden tokens never appear in audit details
    const serialized = JSON.stringify(audit?.details);
    expect(serialized).not.toContain(SENTINEL);
    expect(serialized).not.toContain("query_text");
    expect(serialized).not.toContain("vector_hash");
  });

  it("J4 HNSW iterative scan returns matches under selective filter set", async () => {
    const owner = await createPerson();
    // 1 capsule passing all filters
    const pass = await createCapsuleViaApi(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["g3.6-j4-pass"],
      payload_summary: "j4-pass",
      content: "j4-pass-content",
    });
    expect(pass.ok).toBe(true);
    if (!pass.ok || !pass.capsule_id) return;

    // 3 capsules each failing one filter
    const blocked = await createCapsuleViaApi(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["g3.6-j4-blocked"],
      payload_summary: "j4-blocked",
      content: "j4-blocked-content",
    });
    if (blocked.ok && blocked.capsule_id) {
      await prisma.memoryCapsule.update({
        where: { capsule_id: blocked.capsule_id },
        data: { ai_access_blocked: true },
      });
    }
    const pending = await createCapsuleViaApi(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["g3.6-j4-pending"],
      payload_summary: "j4-pending",
      content: "j4-pending-content",
    });
    if (pending.ok && pending.capsule_id) {
      await prisma.memoryCapsule.update({
        where: { capsule_id: pending.capsule_id },
        data: { requires_validation: true },
      });
    }
    const soft = await createCapsuleViaApi(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["g3.6-j4-soft"],
      payload_summary: "j4-soft",
      content: "j4-soft-content",
    });
    if (soft.ok && soft.capsule_id) {
      await prisma.memoryCapsule.update({
        where: { capsule_id: soft.capsule_id },
        data: { deleted_at: new Date() },
      });
    }

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/cosmp/search",
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { query_text: "j4-query", topK: 10 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      ok: boolean;
      matches: Array<{ capsule_id: string }>;
      result_count: number;
    };
    expect(body.ok).toBe(true);
    const ids = body.matches.map((m) => m.capsule_id);
    // The passing capsule must be in the result set
    expect(ids).toContain(pass.capsule_id);
    // None of the failing capsules surface
    if (blocked.ok && blocked.capsule_id) expect(ids).not.toContain(blocked.capsule_id);
    if (pending.ok && pending.capsule_id) expect(ids).not.toContain(pending.capsule_id);
    if (soft.ok && soft.capsule_id) expect(ids).not.toContain(soft.capsule_id);
  });
});
