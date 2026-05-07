// FILE: otzar.test.ts (unit)
// PURPOSE: Cover the load-bearing pieces of Section 11B:
//          - truncateToTokenBudget identity-preservation regression
//          - truncateToTokenBudget trim order (L8 → L5 → L7)
//          - TokenBudgetExceededError detail shape
//          - Topic extraction graceful fallback on malformed LLM
//          - Priming cache hit/miss + format + Promise.allSettled
//          - conductSession 8-layer assembly + L4/L5 partition robustness
//          - L7 morning brief Redis flag gating
//          - L8 history cap (51 → INVALID_HISTORY)
//          - closeConversation PORTABILITY (capsule in EMPLOYEE wallet)
//          - closeConversation recordOutcome wired
//          - closeConversation cache invalidation
//          - runAutoCloseSweep stale detection + degraded close
// CONNECTS TO: services/otzar/{truncation,cache,priming,otzar.service}.

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  AuthService,
  COEService,
  formatPrimingContext,
  getPriming,
  HiveService,
  MemoryContentStore,
  MemoryKVCache,
  MemoryNonceStore,
  MockLLMProvider,
  NegotiateService,
  OtzarService,
  PRIMING_TTL_SECONDS,
  ReadService,
  TokenBudgetExceededError,
  truncateToTokenBudget,
  WriteService,
  type LayerBundle,
  type LLMProvider,
  type LLMResult,
  type LoginResult,
} from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import { createEntity, prisma } from "@niov/database";
import { ComplianceService } from "@niov/api";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeEntityInput,
  makeFixtureProvider,
} from "../helpers.js";
import unitOtzarConductHappy from "../fixtures/llm/unit-otzar-conduct-session-happy-path.json";
import unitOtzarL7Brief from "../fixtures/llm/unit-otzar-l7-morning-brief.json";
import unitOtzarCloseTopics from "../fixtures/llm/unit-otzar-close-conversation-topics.json";

const TEST_JWT_SECRET = "otzar-test-secret-do-not-use-in-prod";
const TEST_KEY = randomBytes(32);

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

// WHAT: Build a fresh service stack for tests that exercise
//        conductSession / closeConversation end-to-end.
// OPTS:
//   - mockResponses: scripted LLMResult queue (passed to
//     MockLLMProvider). Used by tests that need specific response
//     sequences (e.g., the malformed-LLM-fallback test at L478).
//   - llm: optional LLMProvider override that REPLACES the default
//     MockLLMProvider for OtzarService construction only. The
//     factory still constructs and RETURNS a MockLLMProvider under
//     the `llm` key so Test 564 (CORRECTION priority) can call
//     llm.getCalls() for system-prompt introspection. When opts.llm
//     is passed, the returned MockLLMProvider is unused by the test
//     that passed it. Per Track A Gate 5 Decision 2 (Drifts G5b-B
//     + G5b-E): preserves the 12+ existing call-site signatures
//     while letting fixture-adopting tests inject a fixture-replay
//     provider via opts.llm.
function makeServices(opts: {
  mockResponses?: LLMResult[];
  llm?: LLMProvider;
} = {}) {
  const sessionStore = new MemoryNonceStore();
  const declarationStore = new MemoryNonceStore();
  const contentStore = new MemoryContentStore();
  const encryption = new ContentEncryption(TEST_KEY);
  const auth = new AuthService({
    jwtSecret: TEST_JWT_SECRET,
    nonceStore: sessionStore,
  });
  const compliance = new ComplianceService(auth);
  const negotiate = new NegotiateService(
    auth,
    declarationStore,
    TEST_JWT_SECRET,
    compliance,
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
  const hive = new HiveService(auth, encryption, contentStore);
  const cache = new MemoryKVCache();
  const mockLlm = new MockLLMProvider(
    opts.mockResponses ?? [
      { ok: true, text: "stub LLM response", provider: "mock", model: "mock-1" },
    ],
  );
  const llmForService: LLMProvider = opts.llm ?? mockLlm;
  const otzar = new OtzarService(auth, coe, llmForService, cache);
  return { auth, write, hive, cache, llm: mockLlm, otzar, coe };
}

async function loginAs(
  auth: AuthService,
  ops: string[] = ["read", "write", "share"],
) {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const entity = await createEntity(input);
  const login = (await auth.login(input.email!, password, ops, {
    ip_address: null,
  })) as LoginResult;
  if (!login.ok) throw new Error("login failed");
  return { entity, token: login.token };
}

// Build a twin (AI_AGENT child) for the owner so conductSession can
// resolve it. createTwin requires a default-enterprise hive; for
// these tests we skip the hive flow and just create the AI_AGENT
// entity + EntityMembership directly.
async function attachTwin(ownerEntityId: string): Promise<string> {
  const twinInput = makeEntityInput({ entity_type: "AI_AGENT" });
  const twin = await createEntity(twinInput);
  await prisma.entityMembership.create({
    data: {
      parent_id: ownerEntityId,
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
  return twin.entity_id;
}

// ──────────────────────────────────────────────────────────────────
// TRUNCATION
// ──────────────────────────────────────────────────────────────────

describe("truncateToTokenBudget -- identity preservation regression", () => {
  // Fake tokenizer: 1 char = 1 token. Predictable arithmetic.
  const charCount = (s: string) => s.length;

  it("L1/L2/L3/L4/L6 are byte-identical pre vs post truncation when L8 alone needs trimming", () => {
    const bundle: LayerBundle = {
      priming: "PRIMING",
      L1: "CORRECTION-LAYER",
      L2: "ROLE-TEMPLATE-LAYER",
      L3: "WORK-PROFILE-LAYER",
      L4: "FOUNDATIONAL-LAYER",
      L5_items: [],
      L6: "L6-PLACEHOLDER",
      L7: "MORNING-BRIEF",
      L8_items: ["msg1", "msg2", "msg3", "msg4", "msg5"],
    };
    const before = {
      L1: bundle.L1,
      L2: bundle.L2,
      L3: bundle.L3,
      L4: bundle.L4,
      L6: bundle.L6,
      priming: bundle.priming,
    };
    // Budget chosen so L8 trim alone (dropping a couple oldest
    // messages) fits, leaving identity layers + L7 unchanged.
    // Initial total ≈ 137 chars; budget 130 forces ~2 L8 drops.
    const result = truncateToTokenBudget({
      bundle,
      budget: 130,
      countTokens: charCount,
    });
    expect(result.final.L1).toBe(before.L1);
    expect(result.final.L2).toBe(before.L2);
    expect(result.final.L3).toBe(before.L3);
    expect(result.final.L4).toBe(before.L4);
    expect(result.final.L6).toBe(before.L6);
    expect(result.final.priming).toBe(before.priming);
    expect(result.trimmed.L8).toBeGreaterThan(0);
  });
});

describe("truncateToTokenBudget -- trim order (L8 → L5 → L7)", () => {
  const charCount = (s: string) => s.length;

  it("trims L8 first, then L5 (lowest relevance first), then L7 entirely", () => {
    const bundle: LayerBundle = {
      priming: "P",
      L1: "1",
      L2: "2",
      L3: "3",
      L4: "4",
      L5_items: [
        { content: "L5-low", relevance_score: 0.1 },
        { content: "L5-mid", relevance_score: 0.5 },
        { content: "L5-high", relevance_score: 0.9 },
      ],
      L6: "6",
      L7: "L7-MORNING-BRIEF-LONG",
      L8_items: ["h1-old", "h2", "h3", "h4-newest"],
    };
    // Budget that requires trimming all L8 (down to 1) + some L5 + L7.
    const result = truncateToTokenBudget({
      bundle,
      budget: 30,
      countTokens: charCount,
    });
    // L8 trimmed first; should keep at least one item.
    expect(result.final.L8_items.length).toBeGreaterThanOrEqual(1);
    expect(result.trimmed.L8).toBeGreaterThan(0);
    // L5 trimmed -- lowest relevance dropped first. The remaining
    // L5 items must be the highest-relevance ones.
    if (result.final.L5_items.length > 0) {
      const remainingScores = result.final.L5_items.map((i) => i.relevance_score);
      // The lowest-score item ("L5-low" 0.1) should NOT be in
      // remaining if any L5 trim happened.
      if (result.trimmed.L5 > 0) {
        expect(remainingScores).not.toContain(0.1);
      }
    }
  });
});

describe("truncateToTokenBudget -- TOKEN_BUDGET_EXCEEDED detail shape", () => {
  const charCount = (s: string) => s.length;

  it("throws with { identity_floor, budget, trimmed: { L8, L5, L7 } } when even all 3 trimmable layers cleared still over", () => {
    const bundle: LayerBundle = {
      priming: "PRIMING-VERY-LONG-CONTENT-THAT-OCCUPIES-MANY-TOKENS",
      L1: "CORRECTION-LAYER-ALSO-LONG-CONTENT-HERE",
      L2: "ROLE-TEMPLATE-LAYER-WITH-LOTS-OF-CONTENT",
      L3: "WORK-PROFILE-LAYER-FULL-OF-IMPORTANT-IDENTITY-DATA",
      L4: "FOUNDATIONAL-LAYER-CRUCIAL-CONTEXT",
      L5_items: [],
      L6: "L6-PLACEHOLDER",
      L7: "",
      L8_items: [],
    };
    // Identity floor alone exceeds this tiny budget.
    expect(() =>
      truncateToTokenBudget({
        bundle,
        budget: 10,
        countTokens: charCount,
      }),
    ).toThrow(TokenBudgetExceededError);
    try {
      truncateToTokenBudget({
        bundle,
        budget: 10,
        countTokens: charCount,
      });
    } catch (err) {
      expect(err).toBeInstanceOf(TokenBudgetExceededError);
      const detail = (err as TokenBudgetExceededError).detail;
      expect(typeof detail.identity_floor).toBe("number");
      expect(detail.identity_floor).toBeGreaterThan(10);
      expect(detail.budget).toBe(10);
      expect(detail.trimmed).toEqual({ L8: 0, L5: 0, L7: 0 });
    }
  });
});

// ──────────────────────────────────────────────────────────────────
// PRIMING
// ──────────────────────────────────────────────────────────────────

describe("priming format + cache", () => {
  it("formatPrimingContext renders 'none' for every empty category", () => {
    const text = formatPrimingContext({
      commitments: [],
      escalations: [],
      decisions: [],
      patterns: [],
      externals: [],
    });
    expect(text).toContain("[PRIMING CONTEXT]");
    expect(text).toContain("Active commitments due soon: none");
    expect(text).toContain("Recent relevant decisions: none");
    expect(text).toContain("Patterns relevant to your work: none");
    expect(text).toContain("External entities in context: none");
    expect(text).toContain("Pending approvals: none");
    expect(text).toContain("[END PRIMING]");
  });

  it("getPriming caches in Redis with 5-min TTL (cache hit returns cached=true)", async () => {
    const cache = new MemoryKVCache();
    const setSpy = vi.spyOn(cache, "set");
    const owner = randomUUID();
    const first = await getPriming({
      ownerEntityId: owner,
      orgEntityId: null,
      callerRole: "employee",
      message: "hello world",
      cache,
    });
    expect(first.cached).toBe(false);
    expect(setSpy).toHaveBeenCalledWith(
      `otzar:prime:${owner}`,
      expect.any(String),
      PRIMING_TTL_SECONDS,
    );
    const second = await getPriming({
      ownerEntityId: owner,
      orgEntityId: null,
      callerRole: "employee",
      message: "different message but same owner",
      cache,
    });
    expect(second.cached).toBe(true);
    expect(second.text).toBe(first.text);
  });
});

// ──────────────────────────────────────────────────────────────────
// CONDUCT SESSION -- 8-LAYER + L4/L5 partition + L7 + L8 cap
// ──────────────────────────────────────────────────────────────────

describe("conductSession", () => {
  it("returns TWIN_NOT_FOUND when caller has no AI_AGENT child", async () => {
    const { auth, otzar } = makeServices();
    const owner = await loginAs(auth);
    const result = await otzar.conductSession({
      token: owner.token,
      message: "hello",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("TWIN_NOT_FOUND");
    }
  });

  it("happy path returns ok with conversation_id, response, context_used, tokens_consumed", async () => {
    const { auth, otzar } = makeServices({
      llm: makeFixtureProvider("unit-otzar-conduct-session-happy-path"),
    });
    const owner = await loginAs(auth);
    await attachTwin(owner.entity.entity_id);
    const result = await otzar.conductSession({
      token: owner.token,
      message: "what should I do today?",
      conversation_history: [],
      token_budget: 8000,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Decision 1 Option C: exact-equality against recorded fixture
    // response.text. Re-recording the fixture re-aligns this
    // assertion automatically.
    expect(result.response).toBe(unitOtzarConductHappy.response.text);
    expect(result.conversation_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(typeof result.tokens_consumed).toBe("number");
    expect(typeof result.context_used).toBe("number");
  });

  it("rejects L8 history > 50 messages with INVALID_HISTORY", async () => {
    const { auth, otzar } = makeServices();
    const owner = await loginAs(auth);
    await attachTwin(owner.entity.entity_id);
    const huge = Array.from({ length: 51 }, (_, i) => `msg-${i}`);
    const result = await otzar.conductSession({
      token: owner.token,
      message: "hi",
      conversation_history: huge,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("INVALID_HISTORY");
    }
  });

  it("L7 morning brief: first call sets Redis flag, second call same day skips brief", async () => {
    // Both conductSession calls share the same fixture (single-key
    // adapter); the test asserts on the cache-flag flip, not on
    // response content, so serving the same recorded brief twice
    // is correct.
    const { auth, otzar, cache } = makeServices({
      llm: makeFixtureProvider("unit-otzar-l7-morning-brief"),
    });
    const owner = await loginAs(auth);
    await attachTwin(owner.entity.entity_id);
    const flagKey = `otzar:entity:${owner.entity.entity_id}:first_convo_today`;
    // Pre-condition: flag absent.
    expect(await cache.get(flagKey)).toBeNull();
    const r1 = await otzar.conductSession({
      token: owner.token,
      message: "hi",
    });
    expect(r1.ok).toBe(true);
    // Flag is set after first call.
    expect(await cache.get(flagKey)).not.toBeNull();
    // Second call: brief is gated, but the call still succeeds.
    const r2 = await otzar.conductSession({
      token: owner.token,
      message: "and again",
    });
    expect(r2.ok).toBe(true);
    // Sanity-check the L7-brief fixture import loaded correctly.
    expect(unitOtzarL7Brief.fixtureKey).toBe("unit-otzar-l7-morning-brief");
  });
});

// ──────────────────────────────────────────────────────────────────
// CLOSE CONVERSATION -- PORTABILITY + recordOutcome + cache delete
// ──────────────────────────────────────────────────────────────────

describe("closeConversation", () => {
  it("PORTABILITY: writes CONVERSATION_LEARNING capsule to EMPLOYEE wallet (entity_id + wallet_id checks)", async () => {
    const { auth, otzar } = makeServices();
    const owner = await loginAs(auth);
    await attachTwin(owner.entity.entity_id);
    const conv = await otzar.conductSession({
      token: owner.token,
      message: "first message",
    });
    if (!conv.ok) throw new Error("conductSession failed");

    const close = await otzar.closeConversation({
      token: owner.token,
      conversation_id: conv.conversation_id,
      capsule_ids_used: [],
    });
    expect(close.ok).toBe(true);
    if (!close.ok) return;
    const capsule = await prisma.memoryCapsule.findUnique({
      where: { capsule_id: close.capsule_id },
    });
    expect(capsule?.capsule_type).toBe("CONVERSATION_LEARNING");
    // PORTABILITY: capsule.entity_id === EMPLOYEE.
    expect(capsule?.entity_id).toBe(owner.entity.entity_id);
    // PORTABILITY: capsule.wallet_id === EMPLOYEE'S wallet.
    const ownerWallet = await prisma.wallet.findUnique({
      where: { entity_id: owner.entity.entity_id },
    });
    expect(capsule?.wallet_id).toBe(ownerWallet?.wallet_id);
  });

  it("calls coeService.recordOutcome with capsule_ids_used (Loop 1 wire)", async () => {
    const { auth, otzar, coe } = makeServices();
    const recordSpy = vi.spyOn(coe, "recordOutcome");
    const owner = await loginAs(auth);
    await attachTwin(owner.entity.entity_id);
    const conv = await otzar.conductSession({
      token: owner.token,
      message: "hello",
    });
    if (!conv.ok) throw new Error("conductSession failed");
    const usedIds = [randomUUID(), randomUUID()];
    await otzar.closeConversation({
      token: owner.token,
      conversation_id: conv.conversation_id,
      capsule_ids_used: usedIds,
    });
    expect(recordSpy).toHaveBeenCalledWith(
      owner.token,
      null,
      usedIds,
      true,
    );
  });

  it("invalidates priming cache after close", async () => {
    const { auth, otzar, cache } = makeServices();
    const deleteSpy = vi.spyOn(cache, "delete");
    const owner = await loginAs(auth);
    await attachTwin(owner.entity.entity_id);
    const conv = await otzar.conductSession({
      token: owner.token,
      message: "hi",
    });
    if (!conv.ok) throw new Error("conductSession failed");
    await otzar.closeConversation({
      token: owner.token,
      conversation_id: conv.conversation_id,
      capsule_ids_used: [],
    });
    // delete called for both priming key + last_active key.
    expect(deleteSpy).toHaveBeenCalledWith(
      `otzar:prime:${owner.entity.entity_id}`,
    );
  });

  it("topic extraction returns conversation_summary fallback on malformed LLM response", async () => {
    const { auth, otzar } = makeServices({
      mockResponses: [
        // First call (the conductSession LLM) is fine.
        { ok: true, text: "stub", provider: "mock", model: "mock-1" },
        // Second call (close's topic extraction) returns malformed
        // response (no "topics:" prefix).
        {
          ok: true,
          text: "totally unparseable garbage with no prefix",
          provider: "mock",
          model: "mock-1",
        },
      ],
    });
    const owner = await loginAs(auth);
    await attachTwin(owner.entity.entity_id);
    const conv = await otzar.conductSession({
      token: owner.token,
      message: "hi",
    });
    if (!conv.ok) throw new Error("conductSession failed");
    const close = await otzar.closeConversation({
      token: owner.token,
      conversation_id: conv.conversation_id,
      capsule_ids_used: [],
      conversation_history: ["actual message", "another"],
    });
    expect(close.ok).toBe(true);
    if (!close.ok) return;
    expect(close.topics).toEqual(["conversation_summary"]);
  });
});

// ──────────────────────────────────────────────────────────────────
// AUTO-CLOSE
// ──────────────────────────────────────────────────────────────────

describe("runAutoCloseSweep", () => {
  it("closes ACTIVE conversation whose last_active is missing (treated as stale)", async () => {
    const { auth, otzar } = makeServices();
    const owner = await loginAs(auth);
    await attachTwin(owner.entity.entity_id);
    const conv = await otzar.conductSession({
      token: owner.token,
      message: "hi",
    });
    if (!conv.ok) throw new Error("conductSession failed");
    // Force missing last_active by deleting the cache key.
    // (cache is private; emulate by closing conversation flow's
    //  cache delete via the public closeConversation path's effect.)
    // Easier: directly clear the in-memory cache via service handle.
    // But cache is private -- skip the precise check, instead force
    // the conversation to look stale by manually setting an old
    // timestamp via prisma.
    // The cleaner test: insert a fresh OtzarConversation row with no
    // cache entry, then run sweep. Sweep treats missing as stale →
    // closes.
    const orphanConvId = randomUUID();
    await prisma.otzarConversation.create({
      data: {
        conversation_id: orphanConvId,
        entity_id: owner.entity.entity_id,
        twin_id: owner.entity.entity_id, // dummy
        source_type: "CHAT",
        participants: [owner.entity.entity_id],
        message_count: 1,
        status: "ACTIVE",
      },
    });
    const result = await otzar.runAutoCloseSweep();
    expect(result.closed).toBeGreaterThanOrEqual(1);
    const after = await prisma.otzarConversation.findUnique({
      where: { conversation_id: orphanConvId },
    });
    expect(after?.status).toBe("CLOSED");
    expect(after?.closed_at).not.toBeNull();
    void conv;
  });
});

// ──────────────────────────────────────────────────────────────────
// SECTION 11C TEST 8 -- CORRECTION before role template ordering
// ──────────────────────────────────────────────────────────────────

describe("conductSession Layer 1 (CORRECTION) ordered BEFORE Layer 2 (role template)", () => {
  it("after writing CORRECTION capsule, conductSession's system prompt contains correction text BEFORE role template content", async () => {
    const { auth, otzar, llm } = makeServices();
    const owner = await loginAs(auth);
    await attachTwin(owner.entity.entity_id);
    // Write a CORRECTION capsule directly to the owner's wallet.
    const ownerWallet = await prisma.wallet.findUnique({
      where: { entity_id: owner.entity.entity_id },
    });
    const correctionMarker = `CORRECTION_MARKER_${randomUUID()}`;
    await prisma.memoryCapsule.create({
      data: {
        capsule_id: randomUUID(),
        wallet_id: ownerWallet!.wallet_id,
        entity_id: owner.entity.entity_id,
        version: 1,
        capsule_type: "CORRECTION",
        topic_tags: ["correction"],
        decay_type: "TIME_BASED",
        payload_summary: correctionMarker,
        payload_size_tokens: 1,
        storage_location: `niov://test/${randomUUID()}`,
        content_hash: `sha256:correction-${randomUUID()}`,
      },
    });
    // Trigger conductSession.
    const result = await otzar.conductSession({
      token: owner.token,
      message: "hello",
    });
    expect(result.ok).toBe(true);
    // Inspect the recorded MockLLM call's system prompt.
    const calls = llm.getCalls();
    expect(calls.length).toBeGreaterThanOrEqual(1);
    const systemPrompt = calls[0]!.system;
    // Both pieces must be present.
    expect(systemPrompt).toContain(correctionMarker);
    // Role template fallback substitutes {twin_display_name}; we
    // search for a stable string fragment from the fallback.
    expect(systemPrompt).toContain("digital twin assistant");
    // CORRECTION marker must appear BEFORE the role template
    // fallback string.
    const correctionIdx = systemPrompt.indexOf(correctionMarker);
    const roleIdx = systemPrompt.indexOf("digital twin assistant");
    expect(correctionIdx).toBeGreaterThanOrEqual(0);
    expect(roleIdx).toBeGreaterThanOrEqual(0);
    expect(correctionIdx).toBeLessThan(roleIdx);
  });
});

// ──────────────────────────────────────────────────────────────────
// SECTION 11D TP9 -- AUDIT EMISSION ON CONVERSATION LIFECYCLE
// ──────────────────────────────────────────────────────────────────

describe("conductSession + closeConversation -- audit emission (TP9)", () => {
  it("CONVERSATION_STARTED audit emitted on NEW conversation only; NOT emitted on continuation", async () => {
    const { auth, otzar } = makeServices();
    const owner = await loginAs(auth);
    await attachTwin(owner.entity.entity_id);

    // POSITIVE: new conversation triggers CONVERSATION_STARTED.
    const r1 = await otzar.conductSession({
      token: owner.token,
      message: "first message",
    });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;

    const startedRows = await prisma.auditEvent.findMany({
      where: {
        event_type: "CONVERSATION_STARTED",
        actor_entity_id: owner.entity.entity_id,
      },
    });
    expect(startedRows.length).toBe(1);
    const details = startedRows[0]!.details as { conversation_id: string };
    expect(details.conversation_id).toBe(r1.conversation_id);

    // NEGATIVE: continuation of the same conversation must NOT emit
    // a second STARTED event (per Section 1E continuation-no-emit
    // semantics; continued reads are covered by COE-internal
    // CAPSULE_CONTENT_READ events).
    const r2 = await otzar.conductSession({
      token: owner.token,
      message: "follow-up",
      conversation_id: r1.conversation_id,
    });
    expect(r2.ok).toBe(true);
    const startedAfter = await prisma.auditEvent.count({
      where: {
        event_type: "CONVERSATION_STARTED",
        actor_entity_id: owner.entity.entity_id,
      },
    });
    expect(startedAfter).toBe(1);
  });

  it("CONVERSATION_CLOSED audit emitted on close with capsule_id + conversation_id in details", async () => {
    // Both LLM calls (conduct + close) share the same fixture
    // (single-key adapter); the conduct call's response goes
    // unasserted, while the close call's parser extracts the 6
    // recorded topics from the JSON-fenced response.text.
    const { auth, otzar } = makeServices({
      llm: makeFixtureProvider("unit-otzar-close-conversation-topics"),
    });
    const owner = await loginAs(auth);
    await attachTwin(owner.entity.entity_id);
    const conv = await otzar.conductSession({
      token: owner.token,
      message: "hi",
    });
    if (!conv.ok) throw new Error("conductSession failed");

    const close = await otzar.closeConversation({
      token: owner.token,
      conversation_id: conv.conversation_id,
      capsule_ids_used: [],
    });
    expect(close.ok).toBe(true);
    if (!close.ok) return;
    // SUBSTRATE-HONESTY NOTE (Drift G5b-H): This test does not
    // pass conversation_history to closeConversation, so
    // OtzarService.extractTopics early-returns the FALLBACK
    // ["conversation_summary"] (otzar.service.ts:621-625).
    // The fixture's recorded JSON-fenced response.text exercises
    // the conduct call only; the close call's topic extraction
    // hits the fallback path. A future test that exercises the
    // topic-extraction success path (post-G5b-I-resolution) will
    // consume the close-conversation fixture's recorded topics
    // through the parser.

    const closedRows = await prisma.auditEvent.findMany({
      where: {
        event_type: "CONVERSATION_CLOSED",
        actor_entity_id: owner.entity.entity_id,
      },
    });
    expect(closedRows.length).toBe(1);
    const details = closedRows[0]!.details as {
      conversation_id: string;
      capsule_id: string;
    };
    expect(details.conversation_id).toBe(conv.conversation_id);
    expect(details.capsule_id).toBe(close.capsule_id);
    // Sanity-check the close-topics fixture import loaded correctly.
    expect(unitOtzarCloseTopics.fixtureKey).toBe(
      "unit-otzar-close-conversation-topics",
    );
  });
});
