// FILE: similarity-search.test.ts (integration)
// PURPOSE: Verify G3.6 retrieval at the HTTP route + DB tier per
//          ADR-0043 §Sub-decision 11 (Q-G3-κ) + Q-G3.6-ζ LOCK. J1
//          asserts response-body privacy invariant (no vector /
//          embedding / distance fields); J2 cross-wallet denial via
//          real DB; J3 CAPSULE_SIMILARITY_SEARCH audit row
//          persistence; J4 HNSW iterative scan substrate proof under
//          selective filters. G3.9 production-contract extension
//          (J5-J8) proves end-to-end ADD + UPDATE round-trip + RULE 0
//          joint adversarial fixture (4 disqualifying filters) +
//          NULL-embedding graceful exclusion under real HNSW.
// CONNECTS TO: SimilarityService via POST /api/v1/cosmp/search;
//              WriteService via POST /api/v1/cosmp/capsule + PATCH
//              /api/v1/cosmp/capsule/:id; FixtureBasedEmbeddingProvider;
//              prisma test substrate.
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

describe("G3.9 — production-contract end-to-end (J5-J8)", () => {
  it("J5 end-to-end ADD via WriteService persists embedding then SimilaritySearch retrieves same-wallet capsule", async () => {
    // J5 — Founder Q-G3.9-δ α LOCK. Real WriteService → real embedding
    // generation (FixtureBasedEmbeddingProvider) → real DB persistence →
    // real SimilaritySearch via HNSW. Includes audit safety assertions
    // (Founder Q-LOCK §Audit/privacy assertions).
    const owner = await createPerson();
    const cap = await createCapsuleViaApi(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["g3.9-j5"],
      payload_summary: "j5-summary",
      content: "j5-end-to-end-content-deterministic",
    });
    expect(cap.ok).toBe(true);
    if (!cap.ok || !cap.capsule_id) return;

    // Embedding persisted via WriteService raw SQL path (G3.5 substrate).
    const persistedRows = await prisma.$queryRawUnsafe<{ has_emb: boolean }[]>(
      "SELECT (embedding IS NOT NULL) AS has_emb FROM memory_capsules WHERE capsule_id = $1::uuid",
      cap.capsule_id,
    );
    expect(persistedRows[0]?.has_emb).toBe(true);

    const SENTINEL = `J5_PRIVATE_${randomBytes(8).toString("hex")}`;
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/cosmp/search",
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { query_text: SENTINEL, topK: 10 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      ok: boolean;
      matches: Array<{ capsule_id: string; payload_summary?: string }>;
    };
    expect(body.ok).toBe(true);
    expect(body.matches.map((m) => m.capsule_id)).toContain(cap.capsule_id);

    const serialized = res.body;
    expect(serialized).not.toContain("vector");
    expect(serialized).not.toContain("embedding");
    expect(serialized).not.toContain("distance");
    expect(serialized).not.toContain("cosine_distance");

    // CAPSULE_SIMILARITY_SEARCH audit row metadata safety. Founder Q-LOCK
    // §Audit/privacy assertions: no raw query / no keywords / no vector
    // hash / no embedding sample / no distances.
    const audit = await prisma.auditEvent.findFirst({
      where: {
        event_type: "CAPSULE_SIMILARITY_SEARCH",
        actor_entity_id: owner.entity.entity_id,
        outcome: "SUCCESS",
      },
      orderBy: { timestamp: "desc" },
    });
    expect(audit).not.toBeNull();
    const auditSerialized = JSON.stringify(audit?.details);
    expect(auditSerialized).not.toContain(SENTINEL);
    expect(auditSerialized).not.toContain("query_text");
    expect(auditSerialized).not.toContain("query_keywords");
    expect(auditSerialized).not.toContain("vector_hash");
    expect(auditSerialized).not.toContain("embedding_sample");
    expect(auditSerialized).not.toContain('"distances"');
  });

  it("J6 end-to-end UPDATE via WriteService regenerates embedding then SimilaritySearch reflects updated content", async () => {
    // J6 — Founder Q-G3.9-ε α LOCK. PATCH /api/v1/cosmp/capsule/:id;
    // OWNER write (no declaration token needed); content change triggers
    // UPDATE mutation_type + embedding regeneration (G3.5 substrate).
    const owner = await createPerson();
    const cap = await createCapsuleViaApi(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["g3.9-j6"],
      payload_summary: "j6-original",
      content: "j6-original-content-deterministic",
    });
    expect(cap.ok).toBe(true);
    if (!cap.ok || !cap.capsule_id) return;

    const patchRes = await app.inject({
      method: "PATCH",
      url: `/api/v1/cosmp/capsule/${cap.capsule_id}`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: {
        content: "j6-updated-content-deterministic",
        payload_summary: "j6-updated",
      },
    });
    expect(patchRes.statusCode).toBe(200);
    const patchBody = patchRes.json() as { ok: boolean; version: number };
    expect(patchBody.ok).toBe(true);
    expect(patchBody.version).toBeGreaterThan(1);

    // Embedding still persisted after UPDATE (regenerated).
    const persistedRows = await prisma.$queryRawUnsafe<{ has_emb: boolean }[]>(
      "SELECT (embedding IS NOT NULL) AS has_emb FROM memory_capsules WHERE capsule_id = $1::uuid",
      cap.capsule_id,
    );
    expect(persistedRows[0]?.has_emb).toBe(true);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/cosmp/search",
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { query_text: "j6-query", topK: 10 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      ok: boolean;
      matches: Array<{ capsule_id: string; payload_summary?: string }>;
    };
    expect(body.ok).toBe(true);
    const match = body.matches.find((m) => m.capsule_id === cap.capsule_id);
    expect(match).toBeDefined();
    expect(match?.payload_summary).toBe("j6-updated");

    const serialized = res.body;
    expect(serialized).not.toContain("vector");
    expect(serialized).not.toContain("embedding");
    expect(serialized).not.toContain("distance");
    expect(serialized).not.toContain("cosine_distance");
  });

  it("J7 integration-tier RULE 0 privacy filter joint adversarial fixture excludes all 4 disqualifying capsules under real HNSW", async () => {
    // J7 — Founder Q-G3.9-γ α LOCK joint adversarial fixture. 5 labeled
    // capsules: 1 ELIGIBLE + 4 disqualifying (one per RULE 0 SQL filter).
    // D-J4-ALREADY-COVERS-3-OF-4-J7-FILTERS-AT-INTEGRATION-TIER —
    // proceeds as defense-in-depth + adds clearance_required real-HNSW
    // proof (the one filter not covered by J4).
    const owner = await createPerson();

    const eligible = await createCapsuleViaApi(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["g3.9-j7-eligible"],
      payload_summary: "j7-eligible",
      content: "j7-eligible-content",
    });
    expect(eligible.ok).toBe(true);
    if (!eligible.ok || !eligible.capsule_id) return;

    const blocked = await createCapsuleViaApi(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["g3.9-j7-blocked"],
      payload_summary: "j7-blocked",
      content: "j7-blocked-content",
    });
    if (blocked.ok && blocked.capsule_id) {
      await prisma.memoryCapsule.update({
        where: { capsule_id: blocked.capsule_id },
        data: { ai_access_blocked: true },
      });
    }

    const pending = await createCapsuleViaApi(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["g3.9-j7-pending"],
      payload_summary: "j7-pending",
      content: "j7-pending-content",
    });
    if (pending.ok && pending.capsule_id) {
      await prisma.memoryCapsule.update({
        where: { capsule_id: pending.capsule_id },
        data: { requires_validation: true },
      });
    }

    const soft = await createCapsuleViaApi(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["g3.9-j7-soft"],
      payload_summary: "j7-soft",
      content: "j7-soft-content",
    });
    if (soft.ok && soft.capsule_id) {
      await prisma.memoryCapsule.update({
        where: { capsule_id: soft.capsule_id },
        data: { deleted_at: new Date() },
      });
    }

    const highClearance = await createCapsuleViaApi(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["g3.9-j7-clearance"],
      payload_summary: "j7-clearance",
      content: "j7-clearance-content",
    });
    if (highClearance.ok && highClearance.capsule_id) {
      await prisma.memoryCapsule.update({
        where: { capsule_id: highClearance.capsule_id },
        data: { clearance_required: 999 },
      });
    }

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/cosmp/search",
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { query_text: "j7-query", topK: 10 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      ok: boolean;
      matches: Array<{ capsule_id: string }>;
    };
    expect(body.ok).toBe(true);
    const ids = body.matches.map((m) => m.capsule_id);

    expect(ids).toContain(eligible.capsule_id);

    if (blocked.ok && blocked.capsule_id) expect(ids).not.toContain(blocked.capsule_id);
    if (pending.ok && pending.capsule_id) expect(ids).not.toContain(pending.capsule_id);
    if (soft.ok && soft.capsule_id) expect(ids).not.toContain(soft.capsule_id);
    if (highClearance.ok && highClearance.capsule_id) {
      expect(ids).not.toContain(highClearance.capsule_id);
    }

    const serialized = res.body;
    expect(serialized).not.toContain("vector");
    expect(serialized).not.toContain("embedding");
    expect(serialized).not.toContain("distance");
    expect(serialized).not.toContain("cosine_distance");
  });

  it("J8 integration-tier embedding-NULL capsule gracefully excluded without crash under real HNSW", async () => {
    // J8 — Founder Q-G3.9-ζ α LOCK. Force NULL via raw SQL after the
    // G3.5 write-time embedding generation; verify SimilarityService
    // gracefully excludes via WHERE embedding IS NOT NULL filter
    // (similarity.service.ts:308) without raising.
    const owner = await createPerson();

    const eligible = await createCapsuleViaApi(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["g3.9-j8-eligible"],
      payload_summary: "j8-eligible",
      content: "j8-eligible-content",
    });
    expect(eligible.ok).toBe(true);
    if (!eligible.ok || !eligible.capsule_id) return;

    const nullCap = await createCapsuleViaApi(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["g3.9-j8-null"],
      payload_summary: "j8-null",
      content: "j8-null-content",
    });
    expect(nullCap.ok).toBe(true);
    if (!nullCap.ok || !nullCap.capsule_id) return;

    await prisma.$executeRawUnsafe(
      "UPDATE memory_capsules SET embedding = NULL WHERE capsule_id = $1::uuid",
      nullCap.capsule_id,
    );

    const checkRows = await prisma.$queryRawUnsafe<{ has_emb: boolean }[]>(
      "SELECT (embedding IS NOT NULL) AS has_emb FROM memory_capsules WHERE capsule_id = $1::uuid",
      nullCap.capsule_id,
    );
    expect(checkRows[0]?.has_emb).toBe(false);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/cosmp/search",
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { query_text: "j8-query", topK: 10 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      ok: boolean;
      matches: Array<{ capsule_id: string }>;
    };
    expect(body.ok).toBe(true);
    const ids = body.matches.map((m) => m.capsule_id);
    expect(ids).toContain(eligible.capsule_id);
    expect(ids).not.toContain(nullCap.capsule_id);

    const serialized = res.body;
    expect(serialized).not.toContain("vector");
    expect(serialized).not.toContain("embedding");
    expect(serialized).not.toContain("distance");
    expect(serialized).not.toContain("cosine_distance");
  });
});
