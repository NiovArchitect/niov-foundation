// FILE: similarity.test.ts (unit)
// PURPOSE: Cover G3.6 SimilarityService at the unit register substantively
//          per ADR-0043 §Sub-decision 11 (Q-G3-κ) + 10 Q-G3.6 LOCKS.
//          Tests verify RULE 0 SQL-tier privacy filters (wallet / blocked
//          / validation / deleted / clearance / NULL embedding); audit
//          shape (allowed fields present + forbidden tokens absent);
//          topK ceiling; provider-failure degraded SUCCESS path; empty
//          result SUCCESS path; cross-wallet boundary.
// CONNECTS TO: SimilarityService, AuthService, WriteService (capsule
//              fixture creation), FixtureBasedEmbeddingProvider,
//              prisma test substrate (real DB).
//
// CI RULE: no real OpenAI calls. FixtureBasedEmbeddingProvider or
//          in-test mock objects only.

import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  AuthService,
  FixtureBasedEmbeddingProvider,
  MemoryContentStore,
  MemoryNonceStore,
  SimilarityService,
  WriteService,
  type EmbeddingProvider,
  type EmbeddingResult,
  type LoginResult,
} from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import { createEntity, prisma } from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeEntityInput,
} from "../../helpers.js";

const TEST_JWT_SECRET = "similarity-test-secret-do-not-use-in-prod";
const TEST_KEY = randomBytes(32);

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

// WHAT: Build a fresh AuthService + WriteService + SimilarityService
//        stack with isolated stores and an injectable embedding
//        provider.
// INPUT: Optional embedding provider override. Default =
//        FixtureBasedEmbeddingProvider (deterministic 1536-dim vector
//        per session_entity_id fixtureKey).
// OUTPUT: { auth, write, similarity, embeddingProvider }.
// WHY: Each test gets a clean dependency graph; tests that need to
//      control embedding generation behavior (degrade, etc.) pass a
//      custom mock provider.
function makeServices(embeddingProviderOverride?: EmbeddingProvider) {
  const sessionStore = new MemoryNonceStore();
  const declarationStore = new MemoryNonceStore();
  const contentStore = new MemoryContentStore();
  const encryption = new ContentEncryption(TEST_KEY);
  const auth = new AuthService({
    jwtSecret: TEST_JWT_SECRET,
    nonceStore: sessionStore,
  });
  const embeddingProvider: EmbeddingProvider =
    embeddingProviderOverride ?? new FixtureBasedEmbeddingProvider();
  const write = new WriteService(
    auth,
    declarationStore,
    contentStore,
    encryption,
    TEST_JWT_SECRET,
    embeddingProvider,
  );
  const similarity = new SimilarityService(auth, embeddingProvider);
  return { auth, write, similarity, embeddingProvider };
}

async function loginAs(auth: AuthService, ops: string[] = ["read", "write"]) {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const entity = await createEntity(input);
  const login = (await auth.login(input.email!, password, ops, {
    ip_address: null,
  })) as LoginResult;
  if (!login.ok) throw new Error("login failed");
  return { entity, token: login.token };
}

describe("G3.6 — SimilarityService (Q-G3.6 mutation_type matrix)", () => {
  it("S1 searchBySimilarity returns SimilaritySuccess with matches bounded by topK", async () => {
    const { auth, write, similarity } = makeServices();
    const owner = await loginAs(auth);
    // Seed 3 capsules so any reasonable topK has rows to return.
    for (let i = 0; i < 3; i++) {
      const r = await write.createCapsule(owner.token, {
        capsule_type: "PREFERENCE",
        topic_tags: [`g3.6-s1-${i}`],
        payload_summary: `s1-summary-${i}`,
        content: `s1-content-${i}`,
      });
      expect(r.ok).toBe(true);
    }
    const result = await similarity.searchBySimilarity(owner.token, {
      query_text: "s1-query",
      topK: 2,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.matches.length).toBeLessThanOrEqual(2);
    expect(result.topK).toBe(2);
    // Q-G3.6-γ.1 + V2 Correction 4: happy-path response has no
    // embedding_* fields. Presence is signaled by ok:true with no
    // degraded:true marker; audit details still carry
    // embedding_generated for observability.
  });

  it("S2 searchBySimilarity emits CAPSULE_SIMILARITY_SEARCH audit event with allowed fields only", async () => {
    const { auth, write, similarity } = makeServices();
    const owner = await loginAs(auth);
    const created = await write.createCapsule(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["g3.6-s2"],
      payload_summary: "s2-summary",
      content: "s2-content",
    });
    expect(created.ok).toBe(true);
    const result = await similarity.searchBySimilarity(owner.token, {
      query_text: "s2-query",
      topK: 5,
    });
    expect(result.ok).toBe(true);

    const audit = await prisma.auditEvent.findFirst({
      where: {
        event_type: "CAPSULE_SIMILARITY_SEARCH",
        outcome: "SUCCESS",
        actor_entity_id: owner.entity.entity_id,
      },
      orderBy: { timestamp: "desc" },
    });
    expect(audit).not.toBeNull();
    const details = audit?.details as Record<string, unknown>;
    expect(details.query_length).toBe("s2-query".length);
    expect(details.topK).toBe(5);
    expect(details.result_count).toBeDefined();
    expect(Array.isArray(details.filters_applied)).toBe(true);
    expect(details.embedding_generated).toBe(true);
  });

  it("S3 searchBySimilarity audit details never contain raw query text or vector content", async () => {
    const { auth, write, similarity } = makeServices();
    const owner = await loginAs(auth);
    await write.createCapsule(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["g3.6-s3"],
      payload_summary: "s3-summary",
      content: "s3-content",
    });
    const SENTINEL = `S3_PRIVATE_SENTINEL_${randomBytes(8).toString("hex")}`;
    const result = await similarity.searchBySimilarity(owner.token, {
      query_text: SENTINEL,
      topK: 3,
    });
    expect(result.ok).toBe(true);

    const audits = await prisma.auditEvent.findMany({
      where: {
        event_type: "CAPSULE_SIMILARITY_SEARCH",
        actor_entity_id: owner.entity.entity_id,
      },
    });
    const serialized = JSON.stringify(audits.map((a) => a.details));
    // Raw query text must never appear in audit details
    expect(serialized).not.toContain(SENTINEL);
    expect(serialized).not.toContain("query_text");
    expect(serialized).not.toContain("query_keywords");
    expect(serialized).not.toContain("query_vector");
    expect(serialized).not.toContain("vector_hash");
    expect(serialized).not.toContain("embedding_sample");
    // No large floating-point array signature anywhere
    expect(serialized).not.toMatch(/\[(-?\d+\.\d+,){10,}/);
  });

  it("S4 searchBySimilarity excludes capsules with ai_access_blocked true", async () => {
    const { auth, write, similarity } = makeServices();
    const owner = await loginAs(auth);
    const open = await write.createCapsule(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["g3.6-s4-open"],
      payload_summary: "s4-open",
      content: "s4-open-content",
      ai_access_blocked: false,
    });
    const blocked = await write.createCapsule(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["g3.6-s4-blocked"],
      payload_summary: "s4-blocked",
      content: "s4-blocked-content",
      ai_access_blocked: true,
    });
    expect(open.ok).toBe(true);
    expect(blocked.ok).toBe(true);
    if (!open.ok || !blocked.ok) return;

    const result = await similarity.searchBySimilarity(owner.token, {
      query_text: "s4-query",
      topK: 10,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ids = result.matches.map((m) => m.capsule_id);
    expect(ids).not.toContain(blocked.capsule_id);
  });

  it("S5 searchBySimilarity excludes capsules with requires_validation true", async () => {
    const { auth, write, similarity } = makeServices();
    const owner = await loginAs(auth);
    const open = await write.createCapsule(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["g3.6-s5-open"],
      payload_summary: "s5-open",
      content: "s5-open-content",
      requires_validation: false,
    });
    const pending = await write.createCapsule(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["g3.6-s5-pending"],
      payload_summary: "s5-pending",
      content: "s5-pending-content",
      requires_validation: true,
    });
    expect(open.ok).toBe(true);
    expect(pending.ok).toBe(true);
    if (!open.ok || !pending.ok) return;

    const result = await similarity.searchBySimilarity(owner.token, {
      query_text: "s5-query",
      topK: 10,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ids = result.matches.map((m) => m.capsule_id);
    expect(ids).not.toContain(pending.capsule_id);
  });

  it("S6 searchBySimilarity excludes capsules with deleted_at not null", async () => {
    const { auth, write, similarity } = makeServices();
    const owner = await loginAs(auth);
    const live = await write.createCapsule(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["g3.6-s6-live"],
      payload_summary: "s6-live",
      content: "s6-live-content",
    });
    const soft = await write.createCapsule(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["g3.6-s6-soft"],
      payload_summary: "s6-soft",
      content: "s6-soft-content",
    });
    expect(live.ok).toBe(true);
    expect(soft.ok).toBe(true);
    if (!live.ok || !soft.ok) return;
    // Soft-delete via raw SQL (deleted_at NOT NULL); RULE 10
    // discipline: no DELETE, just set timestamp.
    await prisma.memoryCapsule.update({
      where: { capsule_id: soft.capsule_id },
      data: { deleted_at: new Date() },
    });

    const result = await similarity.searchBySimilarity(owner.token, {
      query_text: "s6-query",
      topK: 10,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ids = result.matches.map((m) => m.capsule_id);
    expect(ids).not.toContain(soft.capsule_id);
  });

  it("S7 searchBySimilarity excludes capsules with clearance_required above session ceiling", async () => {
    const { auth, write, similarity } = makeServices();
    const owner = await loginAs(auth);
    // session.clearance_ceiling defaults to a PERSON-tier value.
    // Create one capsule at clearance_required=0 (passes) and one
    // at clearance_required=10 (above default ceiling; excluded).
    const open = await write.createCapsule(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["g3.6-s7-open"],
      payload_summary: "s7-open",
      content: "s7-open-content",
      clearance_required: 0,
    });
    const elevated = await write.createCapsule(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["g3.6-s7-elevated"],
      payload_summary: "s7-elevated",
      content: "s7-elevated-content",
      clearance_required: 99,
    });
    expect(open.ok).toBe(true);
    expect(elevated.ok).toBe(true);
    if (!open.ok || !elevated.ok) return;

    const result = await similarity.searchBySimilarity(owner.token, {
      query_text: "s7-query",
      topK: 10,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ids = result.matches.map((m) => m.capsule_id);
    expect(ids).not.toContain(elevated.capsule_id);
  });

  it("S8 searchBySimilarity excludes capsules with NULL embedding", async () => {
    const { auth, write, similarity } = makeServices();
    const owner = await loginAs(auth);
    const present = await write.createCapsule(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["g3.6-s8-present"],
      payload_summary: "s8-present",
      content: "s8-present-content",
    });
    const nulled = await write.createCapsule(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["g3.6-s8-nulled"],
      payload_summary: "s8-nulled",
      content: "s8-nulled-content",
    });
    expect(present.ok).toBe(true);
    expect(nulled.ok).toBe(true);
    if (!present.ok || !nulled.ok) return;
    // Force embedding column to NULL via raw SQL (legacy-capsule
    // scenario; Prisma cannot project the Unsupported field).
    await prisma.$executeRawUnsafe(
      "UPDATE memory_capsules SET embedding = NULL WHERE capsule_id = $1::uuid",
      nulled.capsule_id,
    );

    const result = await similarity.searchBySimilarity(owner.token, {
      query_text: "s8-query",
      topK: 10,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ids = result.matches.map((m) => m.capsule_id);
    expect(ids).not.toContain(nulled.capsule_id);
  });

  it("S9 searchBySimilarity does not return capsules from other wallets", async () => {
    const { auth, write, similarity } = makeServices();
    const alice = await loginAs(auth);
    const bob = await loginAs(auth);
    const aliceCapsule = await write.createCapsule(alice.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["g3.6-s9-alice"],
      payload_summary: "alice-cap",
      content: "alice-content",
    });
    const bobCapsule = await write.createCapsule(bob.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["g3.6-s9-bob"],
      payload_summary: "bob-cap",
      content: "bob-content",
    });
    expect(aliceCapsule.ok).toBe(true);
    expect(bobCapsule.ok).toBe(true);
    if (!aliceCapsule.ok || !bobCapsule.ok) return;

    const result = await similarity.searchBySimilarity(alice.token, {
      query_text: "cross-wallet-query",
      topK: 10,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ids = result.matches.map((m) => m.capsule_id);
    expect(ids).not.toContain(bobCapsule.capsule_id);
  });

  it("S10 searchBySimilarity rejects topK above maximum", async () => {
    const { auth, similarity } = makeServices();
    const owner = await loginAs(auth);
    const result = await similarity.searchBySimilarity(owner.token, {
      query_text: "s10-query",
      topK: 51,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("TOPK_OUT_OF_RANGE");
  });

  it("S11 searchBySimilarity emits SUCCESS audit with result_count 0 when provider fails", async () => {
    const degradedProvider: EmbeddingProvider = {
      generateEmbedding: async (): Promise<EmbeddingResult> => ({
        ok: false,
        error_class: "PROVIDER_ERROR",
        message: "simulated S11 outage",
      }),
    };
    const { auth, similarity } = makeServices(degradedProvider);
    const owner = await loginAs(auth);

    const result = await similarity.searchBySimilarity(owner.token, {
      query_text: "s11-query",
      topK: 5,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // V2 Correction 4: response shape uses `degraded: true` flag
    // (no embedding_* fields in HTTP body); audit details retain
    // embedding_generated per Q-G3.6-δ LOCK below.
    if ("degraded" in result) {
      expect(result.degraded).toBe(true);
    }
    expect(result.result_count).toBe(0);

    const audit = await prisma.auditEvent.findFirst({
      where: {
        event_type: "CAPSULE_SIMILARITY_SEARCH",
        actor_entity_id: owner.entity.entity_id,
      },
      orderBy: { timestamp: "desc" },
    });
    expect(audit).not.toBeNull();
    // V2 Correction 5: provider failure is SUCCESS-shaped, not DENIED.
    expect(audit?.outcome).toBe("SUCCESS");
    const details = audit?.details as Record<string, unknown>;
    expect(details.result_count).toBe(0);
    expect(details.embedding_generated).toBe(false);
    expect(details.embedding_failure_class).toBe("PROVIDER_ERROR");
  });

  it("S12 searchBySimilarity empty result returns SUCCESS not DENIED", async () => {
    const { auth, similarity } = makeServices();
    const owner = await loginAs(auth);
    // Fresh owner with no capsules in wallet → empty match set.
    const result = await similarity.searchBySimilarity(owner.token, {
      query_text: "s12-query-no-capsules",
      topK: 10,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.matches.length).toBe(0);
    expect(result.result_count).toBe(0);

    const audit = await prisma.auditEvent.findFirst({
      where: {
        event_type: "CAPSULE_SIMILARITY_SEARCH",
        actor_entity_id: owner.entity.entity_id,
      },
      orderBy: { timestamp: "desc" },
    });
    expect(audit?.outcome).toBe("SUCCESS");
    const details = audit?.details as Record<string, unknown>;
    expect(details.result_count).toBe(0);
  });
});

void vi;
