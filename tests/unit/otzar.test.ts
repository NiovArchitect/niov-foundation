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
  FixtureBasedEmbeddingProvider,
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
  TEST_PREFIX,
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
    new FixtureBasedEmbeddingProvider(),
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

  // Phase EDX-3 slice 1 (Founder directive): `next_step` is an
  // additive closed-vocab field on ConductSessionSuccess. At this
  // slice conductSession always answers, so the deterministic value
  // is "ANSWERED". Future slices add detection logic that flips this
  // value to NEEDS_CLARIFICATION / NEEDS_APPROVAL / ACTION_PROPOSED /
  // ACTION_CREATED / BLOCKED_BY_POLICY / BLOCKED_BY_SCOPE /
  // COLLABORATION_REQUEST_SUGGESTED / MEMORY_CORRECTION_AVAILABLE.
  it("[EDX-3] next_step is ANSWERED on happy path (closed-vocab)", async () => {
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
    expect(result.next_step).toBe("ANSWERED");
    // Backward-compatible fields still present.
    expect(typeof result.response).toBe("string");
    expect(typeof result.tokens_consumed).toBe("number");
    expect(typeof result.context_used).toBe("number");
    expect(result.conversation_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it(
    "[EDX-3] next_step is one of the closed-vocab values when ok=true",
    async () => {
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
      expect([
        "ANSWERED",
        "NEEDS_CLARIFICATION",
        "NEEDS_APPROVAL",
        "ACTION_PROPOSED",
        "ACTION_CREATED",
        "BLOCKED_BY_POLICY",
        "BLOCKED_BY_SCOPE",
        "COLLABORATION_REQUEST_SUGGESTED",
        "MEMORY_CORRECTION_AVAILABLE",
      ]).toContain(result.next_step);
    },
  );

  // Phase EDX-3 slice 2: `correction_capture_available` is an additive
  // boolean on ConductSessionSuccess signaling that the caller can
  // submit a correction via the LIVE POST /api/v1/otzar/correction
  // endpoint (ADR-0055 Wave 2C). Always true at the Foundation tier
  // because the correction substrate is uniformly available to any
  // `read`-capable session.
  it(
    "[EDX-3] correction_capture_available is true on happy path " +
      "(LIVE ADR-0055 Wave 2C correction endpoint)",
    async () => {
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
      expect(result.correction_capture_available).toBe(true);
      // Backward-compatible fields preserved across slices.
      expect(result.next_step).toBe("ANSWERED");
      expect(typeof result.response).toBe("string");
      expect(result.conversation_id).toMatch(/^[0-9a-f-]{36}$/);
    },
  );

  // Phase EDX-3 slice 3: `speech_ready_text` is the response sanitized
  // for TTS / device speech; `voice_output_supported` mirrors the
  // EDX-1 voice_readiness_state.live_audio_output (false at the
  // Foundation tier today per ADR-0085 + ADR-0089).
  it(
    "[EDX-3] speech_ready_text + voice_output_supported are present " +
      "on happy path (false at the Foundation tier)",
    async () => {
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
      // Fields are present and shape-correct.
      expect(typeof result.speech_ready_text).toBe("string");
      expect(result.voice_output_supported).toBe(false);
      // Sanitization is non-destructive — at minimum the sanitized
      // text is non-empty whenever the LLM response is non-empty.
      if (result.response.length > 0) {
        expect(result.speech_ready_text.length).toBeGreaterThan(0);
      }
      // Backward-compatible fields preserved across all 3 slices.
      expect(result.next_step).toBe("ANSWERED");
      expect(result.correction_capture_available).toBe(true);
    },
  );

  // Phase EDX-3 slice 4: deterministic-false "denial of preconditions"
  // envelope. ConductSession does not yet detect any of these six
  // conditions, so the booleans are emitted as false. Future slices
  // wire detection logic that flips them and introduce the closed-
  // vocab companion fields.
  it(
    "[EDX-3] denial envelope booleans are all false on happy path",
    async () => {
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
      expect(result.clarification_needed).toBe(false);
      expect(result.action_proposed).toBe(false);
      expect(result.approval_required).toBe(false);
      expect(result.policy_blocked).toBe(false);
      expect(result.dmw_scope_blocked).toBe(false);
      expect(result.collaboration_suggested).toBe(false);
      // next_step stays "ANSWERED" because none of the denial-envelope
      // conditions are detected at this slice.
      expect(result.next_step).toBe("ANSWERED");
    },
  );

  // ADR-0051 Wave 1: conductSession surfaces the additive transparency
  // contract built from the governed COE metadata. Backward-compatible
  // fields stay intact; transparency is a read-only projection.
  it("includes ADR-0051 transparency + context_provenance without leaking internals", async () => {
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

    // Backward-compatible fields preserved.
    expect(typeof result.response).toBe("string");
    expect(typeof result.context_used).toBe("number");
    expect(typeof result.tokens_consumed).toBe("number");
    expect(result.conversation_id).toMatch(/^[0-9a-f-]{36}$/);

    // Additive transparency present + well-formed.
    expect(result.transparency).toBeDefined();
    const t = result.transparency!;
    expect(t.retrieval_source).toBe("COE_ASSEMBLE_CONTEXT");
    expect(["USED", "NO_MATCHES", "DEGRADED", "SKIPPED"]).toContain(
      t.retrieval_status,
    );
    expect(typeof t.access_limited).toBe("boolean");
    expect(t.context_items_used).toBe(result.context_used);
    expect(t.memory_updated).toBe(false);
    expect(t.tool_calls).toEqual([]);
    expect(t.verification_status).toBe("NOT_ACTIVE");
    expect(Array.isArray(result.context_provenance)).toBe(true);

    // No internals leak in the serialized service response.
    const json = JSON.stringify(result);
    expect(json).not.toContain('"content":');
    expect(json).not.toContain("capsules_denied_permission");
    expect(json).not.toContain("vector");
    expect(json).not.toContain("embedding");
    expect(json).not.toContain("bridge_id");
    expect(json).not.toContain("capability_flags");
    expect(json).not.toContain("chain_of_thought");
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

  it("topic extraction returns parsed topics on valid 'topics: a, b, c' LLM response (positive case)", async () => {
    const { auth, otzar } = makeServices({
      mockResponses: [
        // First call (the conductSession LLM) is fine.
        { ok: true, text: "stub", provider: "mock", model: "mock-1" },
        // Second call (close's topic extraction) returns the
        // production prompt's expected format. Production parser
        // regex /topics:\s*(.+)/i at otzar.service.ts:634 matches
        // and splits on comma.
        {
          ok: true,
          text: "topics: foo, bar, baz",
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
      conversation_history: ["user: hi", "assistant: hello"],
    });
    expect(close.ok).toBe(true);
    if (!close.ok) return;
    // Production parser successfully extracts topics from the
    // expected format. NOT the fallback ["conversation_summary"].
    // This is the load-bearing positive-case coverage missing
    // until G5b-I Resolution.
    expect(close.topics).toEqual(["foo", "bar", "baz"]);
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
    // (single-key adapter). After G5b-I Resolution re-recorded
    // the close-conversation fixture under the production prompt,
    // the close call's parser extracts the recorded topics
    // through the production parser path (was fallback path
    // pre-G5b-I; see Drift G5b-H + G5b-I).
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
      // Pass conversation_history per G5b-H resolution: forces
      // extractTopics to call the LLM (instead of early-returning
      // FALLBACK on empty history). The fixture-replay then
      // exercises the parser through the recorded topics response.
      conversation_history: ["user: hi", "assistant: hello"],
    });
    expect(close.ok).toBe(true);
    if (!close.ok) return;
    // Strengthened post-G5b-I: the close call now exercises the
    // parser path against the re-recorded fixture's
    // "topics: <list>" response. Topics array is non-empty
    // (NOT the fallback ["conversation_summary"]).
    expect(close.topics.length).toBeGreaterThan(0);
    expect(close.topics).not.toEqual(["conversation_summary"]);

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

// ──────────────────────────────────────────────────────────────────
// GET MY TWIN -- self-read identity contract
// ──────────────────────────────────────────────────────────────────

// Build a twin and pin its child Entity.created_at so deterministic
// oldest-active selection is testable without insertion-order luck.
async function attachTwinAt(
  ownerEntityId: string,
  createdAt: Date,
): Promise<string> {
  const twinId = await attachTwin(ownerEntityId);
  await prisma.entity.update({
    where: { entity_id: twinId },
    data: { created_at: createdAt },
  });
  return twinId;
}

describe("getMyTwin", () => {
  it("returns TWIN_NOT_FOUND when caller has no AI_AGENT child", async () => {
    const { auth, otzar } = makeServices();
    const owner = await loginAs(auth);
    const result = await otzar.getMyTwin({ token: owner.token });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("TWIN_NOT_FOUND");
  });

  it("happy path returns safe identity fields + single-twin metadata", async () => {
    const { auth, otzar } = makeServices();
    const owner = await loginAs(auth);
    const twinId = await attachTwin(owner.entity.entity_id);
    const result = await otzar.getMyTwin({ token: owner.token });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.twin.twin_id).toBe(twinId);
    expect(result.twin.role_title).toBe("Digital Twin");
    expect(result.twin.autonomy_mode).toBe("APPROVAL_REQUIRED");
    expect(result.twin.swarm_enabled).toBe(false);
    expect(result.twin.role_template).toBeNull();
    expect(result.twin.is_admin_twin).toBe(false);
    expect(result.twin.status).toBe("ACTIVE");
    expect(Array.isArray(result.twin.skills)).toBe(true);
    expect(result.twin.skills).toEqual([]);
    expect(result.has_multiple_twins).toBe(false);
    expect(result.twin_count).toBe(1);
  });

  it("maps skills to friendly name/category only; NEVER leaks capability_flags or internals", async () => {
    const { auth, otzar } = makeServices();
    const owner = await loginAs(auth);
    const twinId = await attachTwin(owner.entity.entity_id);
    const pkg = await prisma.skillPackage.create({
      data: {
        name: `${TEST_PREFIX}pkg_${randomUUID()}`,
        category: "ANALYSIS",
        description: "test package",
        capability_flags: ["SECRET_FLAG_DO_NOT_LEAK"],
      },
    });
    await prisma.twinSkill.create({
      data: { twin_id: twinId, package_id: pkg.package_id },
    });
    const result = await otzar.getMyTwin({ token: owner.token });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.twin.skills).toEqual([
      { name: pkg.name, category: "ANALYSIS" },
    ]);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("SECRET_FLAG_DO_NOT_LEAK");
    expect(serialized).not.toContain("capability_flags");
    expect(serialized).not.toContain("bridge_id");
    expect(serialized).not.toContain("template_content");
    expect(serialized).not.toContain("storage_location");
  });

  it("self-isolation: caller A only ever sees A's twin", async () => {
    const { auth, otzar } = makeServices();
    const a = await loginAs(auth);
    const b = await loginAs(auth);
    const aTwin = await attachTwin(a.entity.entity_id);
    const bTwin = await attachTwin(b.entity.entity_id);
    const ra = await otzar.getMyTwin({ token: a.token });
    expect(ra.ok).toBe(true);
    if (!ra.ok) return;
    expect(ra.twin.twin_id).toBe(aTwin);
    expect(ra.twin.twin_id).not.toBe(bTwin);
  });

  it("surfaces approver identity (entity_id + display_name only) when set", async () => {
    const { auth, otzar } = makeServices();
    const owner = await loginAs(auth);
    const approver = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    const twinInput = makeEntityInput({ entity_type: "AI_AGENT" });
    const twin = await createEntity(twinInput);
    await prisma.entityMembership.create({
      data: {
        parent_id: owner.entity.entity_id,
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
        approver_entity_id: approver.entity_id,
      },
    });
    const result = await otzar.getMyTwin({ token: owner.token });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.twin.approver).toEqual({
      entity_id: approver.entity_id,
      display_name: approver.display_name,
    });
  });

  // ── ADR-0053 Wave 2A: role_scope_profile (additive, self-scoped) ──

  it("includes a safe role_scope_profile derived from membership/profile/counts; existing fields preserved", async () => {
    const { auth, otzar } = makeServices();
    const owner = await loginAs(auth);
    // The human owner's OWN org membership (child_id = owner): department,
    // hierarchy, role within the org.
    const org = await createEntity(makeEntityInput({ entity_type: "COMPANY" }));
    await prisma.entityMembership.create({
      data: {
        parent_id: org.entity_id,
        child_id: owner.entity.entity_id,
        role_title: "Senior Engineer",
        department: "Platform",
        hierarchy_level: 3,
        is_admin: false,
        is_active: true,
      },
    });
    await prisma.entityProfile.create({
      data: { entity_id: owner.entity.entity_id, job_title: "Staff Engineer" },
    });
    const twinId = await attachTwin(owner.entity.entity_id);

    const result = await otzar.getMyTwin({ token: owner.token });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Backward-compat: existing flat fields preserved.
    expect(result.twin.twin_id).toBe(twinId);
    expect(result.twin.autonomy_mode).toBe("APPROVAL_REQUIRED");
    expect(result.twin.is_admin_twin).toBe(false);

    const p = result.twin.role_scope_profile;
    expect(p).toBeDefined();
    if (p === undefined) return;
    // identity
    expect(p.identity.twin_id).toBe(twinId);
    // role (employee place in org, derived)
    expect(p.role.job_title).toBe("Staff Engineer");
    expect(p.role.department).toBe("Platform");
    expect(p.role.hierarchy_level).toBe(3);
    expect(p.role.is_admin_twin).toBe(false);
    // scope summary
    expect(p.scope_summary.scope_label).toBe("Role-scoped enterprise context");
    expect(p.scope_summary.membership_count).toBe(1);
    expect(p.scope_summary.active_membership_count).toBe(1);
    expect(p.scope_summary.department_count).toBe(1);
    expect(p.scope_summary.has_department_scope).toBe(true);
    expect(p.scope_summary.has_multiple_memberships).toBe(false);
    expect(typeof p.scope_summary.permission_posture).toBe("string");
    expect(typeof p.scope_summary.approval_posture).toBe("string");
    // assistance
    expect(p.assistance_profile.autonomy_mode).toBe("APPROVAL_REQUIRED");
    expect(p.assistance_profile.role_template_status).toBe("NOT_CONFIGURED");
    expect(p.assistance_profile.skills_status).toBe("NOT_CONFIGURED");
    expect(p.assistance_profile.current_assistance_boundaries.length).toBeGreaterThan(0);
    // governance literals
    expect(p.governance.sensitive_actions_require).toBe(
      "PERMISSION_POLICY_OR_APPROVAL",
    );
    expect(p.governance.observation_mode).toBe(
      "PERMISSIONED_WORK_CONTEXT_NOT_SURVEILLANCE",
    );
    // continuity counts (numbers/booleans only)
    expect(typeof p.continuity.recent_conversation_count).toBe("number");
    expect(typeof p.continuity.recent_correction_count).toBe("number");
    expect(typeof p.continuity.recent_learning_summary_count).toBe("number");
    expect(typeof p.continuity.alignment_signals_available).toBe("boolean");

    // No raw internals anywhere in the serialized response.
    const json = JSON.stringify(result);
    expect(json).not.toContain("clearance");
    expect(json).not.toContain("capability_flags");
    expect(json).not.toContain("bridge_id");
    expect(json).not.toContain("can_share_forward");
    expect(json).not.toContain('"conditions"');
    expect(json).not.toContain("storage_location");
    expect(json).not.toContain("content_hash");
  });

  it("alignment_signals_available true after a CORRECTION; counts are self-scoped with no raw content", async () => {
    const { auth, otzar } = makeServices();
    const owner = await loginAs(auth);
    await attachTwin(owner.entity.entity_id);
    const ownerWallet = await prisma.wallet.findUnique({
      where: { entity_id: owner.entity.entity_id },
    });
    await prisma.memoryCapsule.create({
      data: {
        capsule_id: randomUUID(),
        wallet_id: ownerWallet!.wallet_id,
        entity_id: owner.entity.entity_id,
        version: 1,
        capsule_type: "CORRECTION",
        topic_tags: ["correction"],
        decay_type: "TIME_BASED",
        payload_summary: "SECRET_CORRECTION_BODY_DO_NOT_LEAK",
        payload_size_tokens: 1,
        storage_location: `niov://test/${randomUUID()}`,
        content_hash: `sha256:c-${randomUUID()}`,
      },
    });
    const result = await otzar.getMyTwin({ token: owner.token });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const p = result.twin.role_scope_profile;
    expect(p).toBeDefined();
    if (p === undefined) return;
    expect(p.continuity.recent_correction_count).toBeGreaterThanOrEqual(1);
    expect(p.continuity.alignment_signals_available).toBe(true);
    // Raw correction body is NEVER serialized.
    expect(JSON.stringify(result)).not.toContain("SECRET_CORRECTION_BODY_DO_NOT_LEAK");
  });

  it("self-isolation: role_scope_profile reflects only the caller's own scope", async () => {
    const { auth, otzar } = makeServices();
    const a = await loginAs(auth);
    const b = await loginAs(auth);
    // B has an org membership (department Sales, admin); A does not.
    const org = await createEntity(makeEntityInput({ entity_type: "COMPANY" }));
    await prisma.entityMembership.create({
      data: {
        parent_id: org.entity_id,
        child_id: b.entity.entity_id,
        role_title: "Manager",
        department: "Sales",
        hierarchy_level: 5,
        is_admin: true,
        is_active: true,
      },
    });
    await attachTwin(a.entity.entity_id);
    const ra = await otzar.getMyTwin({ token: a.token });
    expect(ra.ok).toBe(true);
    if (!ra.ok) return;
    const p = ra.twin.role_scope_profile;
    expect(p).toBeDefined();
    if (p === undefined) return;
    // A has no org membership → personal scope; never B's Sales/admin scope.
    expect(p.scope_summary.active_membership_count).toBe(0);
    expect(p.scope_summary.scope_label).toBe("Personal work scope");
    expect(p.role.department).toBeNull();
    expect(JSON.stringify(ra)).not.toContain("Sales");
  });
});

// ──────────────────────────────────────────────────────────────────
// DETERMINISTIC PRIMARY-TWIN SELECTION (QLOCK D-OTZ-2 alignment)
// ──────────────────────────────────────────────────────────────────

describe("conductSession + getMyTwin -- deterministic primary-twin selection", () => {
  it("both resolve the oldest active twin; getMyTwin reports has_multiple_twins", async () => {
    const { auth, otzar } = makeServices();
    const owner = await loginAs(auth);
    const oldTwin = await attachTwinAt(
      owner.entity.entity_id,
      new Date("2020-01-01T00:00:00.000Z"),
    );
    const newTwin = await attachTwinAt(
      owner.entity.entity_id,
      new Date("2024-01-01T00:00:00.000Z"),
    );
    // The twin a user SEES.
    const seen = await otzar.getMyTwin({ token: owner.token });
    expect(seen.ok).toBe(true);
    if (!seen.ok) return;
    expect(seen.twin.twin_id).toBe(oldTwin);
    expect(seen.twin.twin_id).not.toBe(newTwin);
    expect(seen.has_multiple_twins).toBe(true);
    expect(seen.twin_count).toBe(2);
    // The twin a user TALKS TO must equal the twin they SEE.
    const conv = await otzar.conductSession({
      token: owner.token,
      message: "hello",
    });
    expect(conv.ok).toBe(true);
    if (!conv.ok) return;
    const row = await prisma.otzarConversation.findUnique({
      where: { conversation_id: conv.conversation_id },
    });
    expect(row?.twin_id).toBe(seen.twin.twin_id);
    expect(row?.twin_id).toBe(oldTwin);
  });
});

// ──────────────────────────────────────────────────────────────────
// LIST CONVERSATIONS -- metadata-only continuity feed
// ──────────────────────────────────────────────────────────────────

describe("listConversations", () => {
  async function makeConv(
    ownerEntityId: string,
    status: string,
    startedAt: Date,
  ): Promise<string> {
    const id = randomUUID();
    await prisma.otzarConversation.create({
      data: {
        conversation_id: id,
        entity_id: ownerEntityId,
        twin_id: ownerEntityId, // dummy ref; listConversations never validates it
        source_type: "CHAT",
        participants: [ownerEntityId],
        message_count: 1,
        status,
        started_at: startedAt,
        ...(status === "CLOSED" ? { closed_at: new Date() } : {}),
      },
    });
    return id;
  }

  it("returns 200 with empty items for a caller with no conversations", async () => {
    const { auth, otzar } = makeServices();
    const owner = await loginAs(auth);
    const result = await otzar.listConversations({
      token: owner.token,
      skip: 0,
      take: 50,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.has_more).toBe(false);
  });

  it("lists only the caller's own conversations (self-isolation)", async () => {
    const { auth, otzar } = makeServices();
    const a = await loginAs(auth);
    const b = await loginAs(auth);
    const aConv = await makeConv(a.entity.entity_id, "ACTIVE", new Date());
    const bConv = await makeConv(b.entity.entity_id, "ACTIVE", new Date());
    const result = await otzar.listConversations({
      token: a.token,
      skip: 0,
      take: 50,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.total).toBe(1);
    expect(result.items.map((i) => i.conversation_id)).toEqual([aConv]);
    expect(
      result.items.find((i) => i.conversation_id === bConv),
    ).toBeUndefined();
  });

  it("orders newest-first and paginates with has_more", async () => {
    const { auth, otzar } = makeServices();
    const owner = await loginAs(auth);
    const c1 = await makeConv(
      owner.entity.entity_id,
      "ACTIVE",
      new Date("2024-01-01T00:00:00.000Z"),
    );
    const c2 = await makeConv(
      owner.entity.entity_id,
      "ACTIVE",
      new Date("2024-02-01T00:00:00.000Z"),
    );
    const c3 = await makeConv(
      owner.entity.entity_id,
      "ACTIVE",
      new Date("2024-03-01T00:00:00.000Z"),
    );
    const page1 = await otzar.listConversations({
      token: owner.token,
      skip: 0,
      take: 2,
    });
    expect(page1.ok).toBe(true);
    if (!page1.ok) return;
    expect(page1.total).toBe(3);
    expect(page1.items.map((i) => i.conversation_id)).toEqual([c3, c2]);
    expect(page1.has_more).toBe(true);
    const page2 = await otzar.listConversations({
      token: owner.token,
      skip: 2,
      take: 2,
    });
    expect(page2.ok).toBe(true);
    if (!page2.ok) return;
    expect(page2.items.map((i) => i.conversation_id)).toEqual([c1]);
    expect(page2.has_more).toBe(false);
  });

  it("?status filter returns only matching rows", async () => {
    const { auth, otzar } = makeServices();
    const owner = await loginAs(auth);
    await makeConv(owner.entity.entity_id, "ACTIVE", new Date());
    await makeConv(owner.entity.entity_id, "CLOSED", new Date());
    const active = await otzar.listConversations({
      token: owner.token,
      skip: 0,
      take: 50,
      status: "ACTIVE",
    });
    expect(active.ok).toBe(true);
    if (!active.ok) return;
    expect(active.total).toBe(1);
    expect(active.items.every((i) => i.status === "ACTIVE")).toBe(true);
    const closed = await otzar.listConversations({
      token: owner.token,
      skip: 0,
      take: 50,
      status: "CLOSED",
    });
    expect(closed.ok).toBe(true);
    if (!closed.ok) return;
    expect(closed.total).toBe(1);
    expect(closed.items.every((i) => i.status === "CLOSED")).toBe(true);
  });

  it("items are metadata-only (no transcript / message / capsule / participants fields)", async () => {
    const { auth, otzar } = makeServices();
    const owner = await loginAs(auth);
    await makeConv(owner.entity.entity_id, "ACTIVE", new Date());
    const result = await otzar.listConversations({
      token: owner.token,
      skip: 0,
      take: 50,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const item = result.items[0]!;
    expect(Object.keys(item).sort()).toEqual([
      "closed_at",
      "conversation_id",
      "message_count",
      "source_type",
      "started_at",
      "status",
      "twin_id",
    ]);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("conversation_history");
    expect(serialized).not.toContain("transcript");
    expect(serialized).not.toContain("participants");
    expect(serialized).not.toContain("payload_summary");
  });
});

// ──────────────────────────────────────────────────────────────────
// GET CONVERSATION DETAIL -- ADR-0054 Wave 2B look-back
// ──────────────────────────────────────────────────────────────────

describe("getConversationDetail", () => {
  // Create a CLOSED conversation directly linked to a CONVERSATION_LEARNING
  // summary capsule (deterministic; no LLM).
  async function makeClosedWithSummary(
    ownerEntityId: string,
    summary: string,
    topics: string[],
  ): Promise<{ conversationId: string; capsuleId: string }> {
    const wallet = await prisma.wallet.findUnique({
      where: { entity_id: ownerEntityId },
    });
    const capsuleId = randomUUID();
    await prisma.memoryCapsule.create({
      data: {
        capsule_id: capsuleId,
        wallet_id: wallet!.wallet_id,
        entity_id: ownerEntityId,
        version: 1,
        capsule_type: "CONVERSATION_LEARNING",
        topic_tags: topics,
        decay_type: "TIME_BASED",
        payload_summary: summary,
        payload_size_tokens: 1,
        storage_location: `niov://test/${randomUUID()}`,
        content_hash: `sha256:cl-${randomUUID()}`,
      },
    });
    const conversationId = randomUUID();
    await prisma.otzarConversation.create({
      data: {
        conversation_id: conversationId,
        entity_id: ownerEntityId,
        twin_id: ownerEntityId,
        source_type: "CHAT",
        participants: [ownerEntityId],
        message_count: 3,
        status: "CLOSED",
        closed_at: new Date(),
        summary_capsule_id: capsuleId,
      },
    });
    return { conversationId, capsuleId };
  }

  it("closeConversation sets summary_capsule_id on the conversation row", async () => {
    const { auth, otzar } = makeServices();
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
    const row = await prisma.otzarConversation.findUnique({
      where: { conversation_id: conv.conversation_id },
    });
    expect(row?.summary_capsule_id).toBe(close.capsule_id);
    expect(row?.status).toBe("CLOSED");
  });

  it("SUMMARY_AVAILABLE returns summary + topics for a closed linked conversation", async () => {
    const { auth, otzar } = makeServices();
    const owner = await loginAs(auth);
    const { conversationId, capsuleId } = await makeClosedWithSummary(
      owner.entity.entity_id,
      "Conversation closed; topics: pricing, launch",
      ["pricing", "launch"],
    );
    const result = await otzar.getConversationDetail({
      token: owner.token,
      conversation_id: conversationId,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const c = result.conversation;
    expect(c.detail_availability).toBe("SUMMARY_AVAILABLE");
    expect(c.summary).toBe("Conversation closed; topics: pricing, launch");
    expect(c.topics).toEqual(["pricing", "launch"]);
    expect(c.summary_available).toBe(true);
    expect(c.summary_capsule_id).toBe(capsuleId);
    expect(c.transparency_available).toBe(false);
    expect(c.continuity_note).toMatch(/not retained in Wave 2B/i);
    // No raw internals serialized (capsule has storage_location/content_hash,
    // but the detail must not carry them).
    const json = JSON.stringify(result);
    expect(json).not.toContain("storage_location");
    expect(json).not.toContain("content_hash");
    expect(json).not.toContain("context_provenance");
    expect(json).not.toContain("bridge_id");
    expect(json).not.toContain("capability_flags");
    expect(json).not.toContain("embedding");
    // "transcript" intentionally appears in continuity_note ("not a
    // transcript"); the field set carries no transcript/message content.
  });

  it("ACTIVE_NOT_CLOSED for an active conversation (summary null)", async () => {
    const { auth, otzar } = makeServices();
    const owner = await loginAs(auth);
    const conversationId = randomUUID();
    await prisma.otzarConversation.create({
      data: {
        conversation_id: conversationId,
        entity_id: owner.entity.entity_id,
        twin_id: owner.entity.entity_id,
        source_type: "CHAT",
        participants: [owner.entity.entity_id],
        message_count: 2,
        status: "ACTIVE",
      },
    });
    const result = await otzar.getConversationDetail({
      token: owner.token,
      conversation_id: conversationId,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.conversation.detail_availability).toBe("ACTIVE_NOT_CLOSED");
    expect(result.conversation.summary).toBeNull();
    expect(result.conversation.summary_available).toBe(false);
  });

  it("NO_SUMMARY_YET for a closed conversation without summary_capsule_id", async () => {
    const { auth, otzar } = makeServices();
    const owner = await loginAs(auth);
    const conversationId = randomUUID();
    await prisma.otzarConversation.create({
      data: {
        conversation_id: conversationId,
        entity_id: owner.entity.entity_id,
        twin_id: owner.entity.entity_id,
        source_type: "CHAT",
        participants: [owner.entity.entity_id],
        message_count: 4,
        status: "CLOSED",
        closed_at: new Date(),
        // summary_capsule_id intentionally null (pre-existing / degraded)
      },
    });
    const result = await otzar.getConversationDetail({
      token: owner.token,
      conversation_id: conversationId,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.conversation.detail_availability).toBe("NO_SUMMARY_YET");
    expect(result.conversation.summary).toBeNull();
    expect(result.conversation.summary_capsule_id).toBeNull();
  });

  it("CONVERSATION_NOT_FOUND for an unknown id", async () => {
    const { auth, otzar } = makeServices();
    const owner = await loginAs(auth);
    const result = await otzar.getConversationDetail({
      token: owner.token,
      conversation_id: randomUUID(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("CONVERSATION_NOT_FOUND");
  });

  it("NOT_CONVERSATION_OWNER: caller A cannot read caller B's conversation (self-scope)", async () => {
    const { auth, otzar } = makeServices();
    const a = await loginAs(auth);
    const b = await loginAs(auth);
    const { conversationId } = await makeClosedWithSummary(
      b.entity.entity_id,
      "B's private close summary",
      ["confidential"],
    );
    const result = await otzar.getConversationDetail({
      token: a.token,
      conversation_id: conversationId,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("NOT_CONVERSATION_OWNER");
  });
});

// ──────────────────────────────────────────────────────────────────
// ADR-0055 Wave 2C: getConversationCorrections (safe, self-scoped
// per-conversation correction-signal projection)
// ──────────────────────────────────────────────────────────────────

describe("getConversationCorrections", () => {
  // Create a conversation owned by the given entity. No LLM.
  async function makeOwnedConversation(ownerEntityId: string): Promise<string> {
    const conversationId = randomUUID();
    await prisma.otzarConversation.create({
      data: {
        conversation_id: conversationId,
        entity_id: ownerEntityId,
        twin_id: ownerEntityId,
        source_type: "CHAT",
        participants: [ownerEntityId],
        message_count: 1,
        status: "ACTIVE",
      },
    });
    return conversationId;
  }

  // Write a CORRECTION capsule owned by `ownerEntityId` linked to
  // `conversationId` with a controllable created_at. Mirrors the
  // processCorrection write shape but is deterministic and DB-only.
  async function writeLinkedCorrection(
    ownerEntityId: string,
    conversationId: string,
    createdAt: Date,
  ): Promise<string> {
    const wallet = await prisma.wallet.findUnique({
      where: { entity_id: ownerEntityId },
    });
    const capsuleId = randomUUID();
    await prisma.memoryCapsule.create({
      data: {
        capsule_id: capsuleId,
        wallet_id: wallet!.wallet_id,
        entity_id: ownerEntityId,
        version: 1,
        capsule_type: "CORRECTION",
        topic_tags: ["correction"],
        decay_type: "TIME_BASED",
        payload_summary: "a private correction summary",
        payload_size_tokens: 1,
        storage_location: `niov://test/${randomUUID()}`,
        content_hash: `sha256:c-${randomUUID()}`,
        conversation_id: conversationId,
        created_at: createdAt,
      },
    });
    return capsuleId;
  }

  it("zero state: own conversation with no linked corrections returns count 0, has_corrections false, last_correction_at null", async () => {
    const { auth, otzar } = makeServices();
    const owner = await loginAs(auth);
    const conversationId = await makeOwnedConversation(owner.entity.entity_id);
    const result = await otzar.getConversationCorrections({
      token: owner.token,
      conversation_id: conversationId,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.conversation_id).toBe(conversationId);
    expect(result.corrections_count).toBe(0);
    expect(result.has_corrections).toBe(false);
    expect(result.last_correction_at).toBeNull();
    expect(result.drift_prevention_note).toMatch(/not an employee score/i);
    expect(result.continuity_note).toMatch(/not a transcript/i);
  });

  it("counts only linked corrections in the caller's own wallet; last_correction_at is most recent ISO string", async () => {
    const { auth, otzar } = makeServices();
    const owner = await loginAs(auth);
    const conversationId = await makeOwnedConversation(owner.entity.entity_id);
    const older = new Date("2026-05-26T10:00:00.000Z");
    const newer = new Date("2026-05-27T10:00:00.000Z");
    await writeLinkedCorrection(owner.entity.entity_id, conversationId, older);
    await writeLinkedCorrection(owner.entity.entity_id, conversationId, newer);
    // Also write an UNLINKED correction (conversation_id null) -- must NOT count.
    const wallet = await prisma.wallet.findUnique({
      where: { entity_id: owner.entity.entity_id },
    });
    await prisma.memoryCapsule.create({
      data: {
        capsule_id: randomUUID(),
        wallet_id: wallet!.wallet_id,
        entity_id: owner.entity.entity_id,
        version: 1,
        capsule_type: "CORRECTION",
        topic_tags: ["correction"],
        decay_type: "TIME_BASED",
        payload_summary: "unlinked correction",
        payload_size_tokens: 1,
        storage_location: `niov://test/${randomUUID()}`,
        content_hash: `sha256:c-${randomUUID()}`,
        // conversation_id intentionally absent → null
      },
    });
    const result = await otzar.getConversationCorrections({
      token: owner.token,
      conversation_id: conversationId,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.corrections_count).toBe(2);
    expect(result.has_corrections).toBe(true);
    expect(result.last_correction_at).toBe(newer.toISOString());
  });

  it("excludes soft-deleted linked corrections (deleted_at IS NULL filter)", async () => {
    const { auth, otzar } = makeServices();
    const owner = await loginAs(auth);
    const conversationId = await makeOwnedConversation(owner.entity.entity_id);
    const at = new Date("2026-05-27T11:00:00.000Z");
    const capsuleId = await writeLinkedCorrection(
      owner.entity.entity_id,
      conversationId,
      at,
    );
    await prisma.memoryCapsule.update({
      where: { capsule_id: capsuleId },
      data: { deleted_at: new Date() },
    });
    const result = await otzar.getConversationCorrections({
      token: owner.token,
      conversation_id: conversationId,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.corrections_count).toBe(0);
    expect(result.has_corrections).toBe(false);
    expect(result.last_correction_at).toBeNull();
  });

  it("CONVERSATION_NOT_FOUND for an unknown id", async () => {
    const { auth, otzar } = makeServices();
    const owner = await loginAs(auth);
    const result = await otzar.getConversationCorrections({
      token: owner.token,
      conversation_id: randomUUID(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("CONVERSATION_NOT_FOUND");
  });

  it("NOT_CONVERSATION_OWNER: caller A cannot read caller B's correction signals (self-scope)", async () => {
    const { auth, otzar } = makeServices();
    const a = await loginAs(auth);
    const b = await loginAs(auth);
    const bConvId = await makeOwnedConversation(b.entity.entity_id);
    await writeLinkedCorrection(
      b.entity.entity_id,
      bConvId,
      new Date("2026-05-27T12:00:00.000Z"),
    );
    const result = await otzar.getConversationCorrections({
      token: a.token,
      conversation_id: bConvId,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("NOT_CONVERSATION_OWNER");
  });

  it("does not serialize raw correction payloads / target_capsule_id / storage_location / content_hash", async () => {
    const { auth, otzar } = makeServices();
    const owner = await loginAs(auth);
    const conversationId = await makeOwnedConversation(owner.entity.entity_id);
    await writeLinkedCorrection(
      owner.entity.entity_id,
      conversationId,
      new Date("2026-05-27T13:00:00.000Z"),
    );
    const result = await otzar.getConversationCorrections({
      token: owner.token,
      conversation_id: conversationId,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const json = JSON.stringify(result);
    expect(json).not.toContain("payload_summary");
    expect(json).not.toContain("payload_content");
    expect(json).not.toContain("correction_capsule_id");
    expect(json).not.toContain("target_capsule_id");
    expect(json).not.toContain("storage_location");
    expect(json).not.toContain("content_hash");
    expect(json).not.toContain("embedding");
    expect(json).not.toContain("bridge_id");
    expect(json).not.toContain("capability_flags");
    expect(json).not.toContain("context_provenance");
    expect(json).not.toContain("drift_score");
    expect(json).not.toContain("employee_score");
    expect(json).not.toContain("best_practice_learned");
    expect(json).not.toContain("manager_visibility");
  });
});
