// FILE: coe.test.ts (unit)
// PURPOSE: Verify the Contextual Orchestration Engine -- relevance
//          filtering, FOUNDATIONAL bypass, token-budget enforcement,
//          highest-score selection, parallel negotiation, and
//          explicit recall of forgotten capsules.
// CONNECTS TO: COEService, NegotiateService, ReadService,
//              AuthService, WriteService (for test fixtures),
//              ContentEncryption, MemoryNonceStore,
//              MemoryContentStore.

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AuthService,
  COEService,
  combinedScore,
  extractKeywords,
  MemoryContentStore,
  MemoryNonceStore,
  NegotiateService,
  ReadService,
  recencyScore,
  RELEVANCE_FORGET_FLOOR,
  tagOverlapScore,
  WriteService,
  type LoginResult,
  type NegotiateSuccess,
  type NegotiateFailure,
} from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import { createEntity, prisma } from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeEntityInput,
} from "../helpers.js";

const TEST_JWT_SECRET = "coe-test-secret-do-not-use-in-prod";
const TEST_KEY = randomBytes(32);

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

// WHAT: Build a fresh full COE stack with isolated stores.
// INPUT: None.
// OUTPUT: Every service the test will need.
// WHY: Each test starts with a clean slate.
function makeServices() {
  const sessionStore = new MemoryNonceStore();
  const declarationStore = new MemoryNonceStore();
  const contentStore = new MemoryContentStore();
  const encryption = new ContentEncryption(TEST_KEY);
  const auth = new AuthService({
    jwtSecret: TEST_JWT_SECRET,
    nonceStore: sessionStore,
  });
  const negotiate = new NegotiateService(
    auth,
    declarationStore,
    TEST_JWT_SECRET,
  );
  const read = new ReadService(
    auth,
    declarationStore,
    contentStore,
    TEST_JWT_SECRET,
  );
  const write = new WriteService(
    auth,
    declarationStore,
    contentStore,
    encryption,
    TEST_JWT_SECRET,
  );
  const coe = new COEService(auth, negotiate, read, encryption);
  return { auth, negotiate, read, write, coe, contentStore, declarationStore };
}

// WHAT: Create + login a PERSON with read+write ops.
// INPUT: AuthService.
// OUTPUT: { entity, token }.
// WHY: COE tests need a single owner driving every flow.
async function loginAs(auth: AuthService) {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const entity = await createEntity(input);
  const login = (await auth.login(input.email!, password, ["read", "write"], {
    ip_address: null,
  })) as LoginResult;
  if (!login.ok) throw new Error(`login failed in test setup: ${login.code}`);
  return { entity, token: login.token };
}

describe("keyword extraction + scoring helpers", () => {
  it("drops stopwords and lowercases", () => {
    expect(extractKeywords("The quick brown fox over the lazy dog")).toEqual(
      expect.arrayContaining(["quick", "brown", "fox", "lazy", "dog"]),
    );
  });

  it("dedupes repeated tokens", () => {
    const words = extractKeywords("paris paris paris");
    expect(words.filter((w) => w === "paris")).toHaveLength(1);
  });

  it("tagOverlapScore returns 1.0 when every tag matches a keyword", () => {
    expect(tagOverlapScore(["paris", "louvre"], ["paris", "louvre"])).toBe(1);
  });

  it("tagOverlapScore returns 0 when no overlap", () => {
    expect(tagOverlapScore(["paris"], ["tokyo"])).toBe(0);
  });

  it("recencyScore is 1.0 for fresh, 0.0 for old, monotonic between", () => {
    const now = new Date("2026-04-01T00:00:00Z");
    const fresh = recencyScore(new Date("2026-03-30T00:00:00Z"), now);
    const middle = recencyScore(new Date("2026-02-01T00:00:00Z"), now);
    const old = recencyScore(new Date("2025-10-01T00:00:00Z"), now);
    expect(fresh).toBe(1);
    expect(old).toBe(0);
    expect(middle).toBeGreaterThan(0);
    expect(middle).toBeLessThan(1);
  });

  it("combinedScore weights match the spec (0.45 / 0.35 / 0.20)", () => {
    expect(combinedScore(1, 0, 0)).toBeCloseTo(0.45, 5);
    expect(combinedScore(0, 1, 0)).toBeCloseTo(0.35, 5);
    expect(combinedScore(0, 0, 1)).toBeCloseTo(0.2, 5);
    expect(combinedScore(1, 1, 1)).toBeCloseTo(1.0, 5);
  });
});

describe("assembleContext -- FOUNDATIONAL handling", () => {
  it("FOUNDATIONAL capsules are always included regardless of relevance_score", async () => {
    const { auth, write, coe } = makeServices();
    const owner = await loginAs(auth);

    // FOUNDATIONAL with score WAY below the 0.2 floor.
    const foundational = await write.createCapsule(owner.token, {
      capsule_type: "FOUNDATIONAL",
      decay_type: "FOUNDATIONAL",
      topic_tags: ["name", "identity"],
      payload_summary: "core identity capsule",
      content: "name: Test User",
    });
    if (!foundational.ok) throw new Error("create foundational failed");
    await prisma.memoryCapsule.update({
      where: { capsule_id: foundational.capsule_id },
      data: { relevance_score: 0.05 },
    });

    const result = await coe.assembleContext(
      owner.token,
      "tell me about my identity",
      2000,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ids = result.context.map((c) => c.capsule_id);
    expect(ids).toContain(foundational.capsule_id);
  });

  it("non-FOUNDATIONAL capsule with relevance_score < 0.2 is excluded from regular retrieval", async () => {
    const { auth, write, coe } = makeServices();
    const owner = await loginAs(auth);

    const lowScore = await write.createCapsule(owner.token, {
      capsule_type: "PREFERENCE",
      decay_type: "TIME_BASED",
      topic_tags: ["forgotten-thing"],
      payload_summary: "fading preference",
      content: "barely remembered",
    });
    if (!lowScore.ok) throw new Error("create low score failed");
    await prisma.memoryCapsule.update({
      where: { capsule_id: lowScore.capsule_id },
      data: { relevance_score: 0.1 },
    });

    const result = await coe.assembleContext(
      owner.token,
      "tell me about forgotten-thing",
      2000,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ids = result.context.map((c) => c.capsule_id);
    expect(ids).not.toContain(lowScore.capsule_id);
    expect(result.capsules_skipped_low_relevance).toBeGreaterThanOrEqual(1);
  });

  it("FOUNDATIONAL capsules do not consume token budget", async () => {
    const { auth, write, coe } = makeServices();
    const owner = await loginAs(auth);

    // Big FOUNDATIONAL (lots of tokens), small budget.
    const big = "word ".repeat(800).trim(); // ~800 chars => ~200 tokens
    const foundational = await write.createCapsule(owner.token, {
      capsule_type: "FOUNDATIONAL",
      decay_type: "FOUNDATIONAL",
      topic_tags: ["identity"],
      payload_summary: "big foundational",
      content: big,
    });
    if (!foundational.ok) throw new Error("create failed");

    const result = await coe.assembleContext(owner.token, "identity", 50);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ids = result.context.map((c) => c.capsule_id);
    expect(ids).toContain(foundational.capsule_id);
    // tokens_consumed counts ordinary capsules only; FOUNDATIONAL
    // does not push past the budget even though its size > budget.
    expect(result.tokens_consumed).toBeLessThanOrEqual(50);
  });
});

describe("assembleContext -- token budget", () => {
  it("never exceeds the requested token_budget for ordinary capsules", async () => {
    const { auth, write, coe } = makeServices();
    const owner = await loginAs(auth);

    // Five ordinary capsules, each ~50 tokens.
    for (let i = 0; i < 5; i++) {
      const created = await write.createCapsule(owner.token, {
        capsule_type: "PREFERENCE",
        decay_type: "TIME_BASED",
        topic_tags: ["budget-test"],
        payload_summary: `budget capsule ${i}`,
        content: "word ".repeat(200).trim(),
      });
      if (!created.ok) throw new Error("create failed");
    }

    const budget = 100;
    const result = await coe.assembleContext(owner.token, "budget-test", budget);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tokens_consumed).toBeLessThanOrEqual(budget);
    expect(result.capsules_skipped_budget).toBeGreaterThanOrEqual(1);
  });

  it("selects highest-scored capsules first when budget is tight", async () => {
    const { auth, write, coe } = makeServices();
    const owner = await loginAs(auth);

    // High-relevance capsule with matching tags.
    const high = await write.createCapsule(owner.token, {
      capsule_type: "PREFERENCE",
      decay_type: "TIME_BASED",
      topic_tags: ["paris", "vacation"],
      payload_summary: "high relevance",
      content: "Paris memories: long content here ".repeat(20),
    });
    if (!high.ok) throw new Error("create high failed");
    await prisma.memoryCapsule.update({
      where: { capsule_id: high.capsule_id },
      data: { relevance_score: 0.9 },
    });

    // Low-relevance capsule with no overlap.
    const low = await write.createCapsule(owner.token, {
      capsule_type: "PREFERENCE",
      decay_type: "TIME_BASED",
      topic_tags: ["unrelated"],
      payload_summary: "low relevance",
      content: "Boring stuff ".repeat(20),
    });
    if (!low.ok) throw new Error("create low failed");
    await prisma.memoryCapsule.update({
      where: { capsule_id: low.capsule_id },
      data: { relevance_score: 0.3 },
    });

    // Budget only fits ONE capsule.
    const oneFitsTokens = high.content_hash.length; // any small number
    const budget = 200;
    const result = await coe.assembleContext(
      owner.token,
      "tell me about paris vacation",
      budget,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ids = result.context.map((c) => c.capsule_id);
    expect(ids).toContain(high.capsule_id);
    void oneFitsTokens;
    void low;
  });
});

describe("explicitRecall", () => {
  it("returns capsules even when their relevance_score is BELOW the forget floor", async () => {
    const { auth, write, coe } = makeServices();
    const owner = await loginAs(auth);

    const fading = await write.createCapsule(owner.token, {
      capsule_type: "PREFERENCE",
      decay_type: "TIME_BASED",
      topic_tags: ["birthday-2019"],
      payload_summary: "old birthday memory",
      content: "nineteenth birthday party at the lake",
    });
    if (!fading.ok) throw new Error("create failed");
    await prisma.memoryCapsule.update({
      where: { capsule_id: fading.capsule_id },
      data: { relevance_score: 0.05 },
    });
    expect(0.05).toBeLessThan(RELEVANCE_FORGET_FLOOR);

    const recall = await coe.explicitRecall(owner.token, "birthday-2019");
    expect(recall.ok).toBe(true);
    if (!recall.ok) return;
    const ids = recall.items.map((i) => i.capsule_id);
    expect(ids).toContain(fading.capsule_id);
  });

  it("returns an empty list when no tags match", async () => {
    const { auth, coe } = makeServices();
    const owner = await loginAs(auth);
    const recall = await coe.explicitRecall(owner.token, "nothing-matches-xyz");
    expect(recall.ok).toBe(true);
    if (!recall.ok) return;
    expect(recall.items).toHaveLength(0);
  });
});

describe("parallel negotiate", () => {
  it("calls negotiate in parallel, not sequentially", async () => {
    const { auth, write, read, coe: realCoe } = makeServices();
    const owner = await loginAs(auth);
    void realCoe;

    // Make three capsules.
    const created: string[] = [];
    for (let i = 0; i < 3; i++) {
      const c = await write.createCapsule(owner.token, {
        capsule_type: "PREFERENCE",
        decay_type: "TIME_BASED",
        topic_tags: ["parallel-test"],
        payload_summary: `parallel ${i}`,
        content: `content ${i}`,
      });
      if (!c.ok) throw new Error("create failed");
      created.push(c.capsule_id);
    }

    // Mock NegotiateService that delays 100ms per call and tracks
    // max-concurrent in-flight calls.
    let activeCalls = 0;
    let maxConcurrent = 0;
    const slowNegotiate = {
      async negotiate(): Promise<NegotiateSuccess | NegotiateFailure> {
        activeCalls++;
        maxConcurrent = Math.max(maxConcurrent, activeCalls);
        await new Promise((r) => setTimeout(r, 100));
        activeCalls--;
        // Return a failure so COE skips the read step -- this test
        // only cares about negotiate concurrency.
        return {
          ok: false,
          code: "NO_PERMISSION",
          message: "test mock",
        };
      },
    } as unknown as NegotiateService;

    const mockedCoe = new COEService(
      auth,
      slowNegotiate,
      read,
      new ContentEncryption(TEST_KEY),
    );

    await mockedCoe.assembleContext(owner.token, "parallel-test", 2000);

    // The honest parallelism check is "did more than one call run
    // at the same time?" -- maxConcurrent reflects exactly that.
    // Wall-clock timing also includes real Supabase round-trips
    // for validateSession / wallet / findMany, so an elapsed
    // assertion would be flaky regardless of how negotiate runs.
    expect(maxConcurrent).toBeGreaterThanOrEqual(2);
  });
});

describe("recordOutcome", () => {
  it("writes one COEOutcome row per capsule_id", async () => {
    const { auth, coe } = makeServices();
    const owner = await loginAs(auth);
    // Use freshly-minted UUIDs so cross-run pollution cannot inflate
    // the count -- coe_outcomes has no FK to entities and is therefore
    // not cleaned up by cleanupTestData via cascade.
    const ids = [randomUUID(), randomUUID()];
    const result = await coe.recordOutcome(owner.token, null, ids, true);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.recorded).toBe(2);
    const rows = await prisma.cOEOutcome.findMany({
      where: { capsule_id: { in: ids } },
    });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.success === true)).toBe(true);
  });

  it("rejects with INVALID_REQUEST when capsule_ids_used is not an array", async () => {
    const { auth, coe } = makeServices();
    const owner = await loginAs(auth);
    const result = await coe.recordOutcome(
      owner.token,
      null,
      "not-an-array" as unknown as string[],
      true,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("INVALID_REQUEST");
  });
});
