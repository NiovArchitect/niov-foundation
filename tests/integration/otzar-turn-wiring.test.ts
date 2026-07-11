// FILE: otzar-turn-wiring.test.ts (integration)
// PURPOSE: [OTZAR-CONTINUITY P5 Stage 1 wiring] Prove conductSession now persists
//          durable turns for an ORG'd caller: USER turn before the model, ASSISTANT
//          turn (author = Twin) before the response, monotonic ordering, request_id
//          retry-replay (no second LLM call, no duplicate turn), and different-content
//          conflict. Runs against the real test DB.
// CONNECTS TO: apps/api/src/services/otzar/otzar.service.ts (beginTurnPersistence /
//              persistAssistantTurn / reconstructFromAssistantTurn).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import {
  AuthService, COEService, HiveService, FixtureBasedEmbeddingProvider,
  MemoryContentStore, MemoryKVCache, MemoryNonceStore, MockLLMProvider,
  NegotiateService, OtzarService, ReadService, WriteService, ComplianceService,
  type LLMProvider, type LoginResult,
} from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import { createEntity, prisma } from "@niov/database";
import { cleanupTestData, ensureAuditTriggers, makeEntityInput } from "../helpers.js";

const TEST_JWT_SECRET = "otzar-wiring-test-secret";
const TEST_KEY = randomBytes(32);

function makeServicesWithLLM(llm: LLMProvider) {
  const auth = new AuthService({ jwtSecret: TEST_JWT_SECRET, nonceStore: new MemoryNonceStore() });
  const declarationStore = new MemoryNonceStore();
  const contentStore = new MemoryContentStore();
  const encryption = new ContentEncryption(TEST_KEY);
  const compliance = new ComplianceService(auth);
  const negotiate = new NegotiateService(auth, declarationStore, TEST_JWT_SECRET, compliance);
  const read = new ReadService(auth, declarationStore, contentStore, TEST_JWT_SECRET);
  void new WriteService(auth, declarationStore, contentStore, encryption, TEST_JWT_SECRET, new FixtureBasedEmbeddingProvider());
  const coe = new COEService(auth, negotiate, read, encryption);
  void new HiveService(auth, encryption, contentStore);
  const otzar = new OtzarService(auth, coe, llm, new MemoryKVCache());
  return { auth, otzar };
}

function makeServices() {
  const llm = new MockLLMProvider([
    { ok: true, text: "Here is what I can help with.", provider: "mock", model: "mock-1" },
    { ok: true, text: "Second distinct response.", provider: "mock", model: "mock-1" },
    { ok: true, text: "Third response.", provider: "mock", model: "mock-1" },
  ]);
  return { ...makeServicesWithLLM(llm as unknown as LLMProvider), llm };
}

async function orgUserWithTwin(auth: AuthService): Promise<{ token: string; userId: string; twinId: string; orgId: string }> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const user = await createEntity(input);
  const org = await createEntity(makeEntityInput({ entity_type: "COMPANY" }));
  await prisma.entityMembership.create({ data: { parent_id: org.entity_id, child_id: user.entity_id, is_active: true } });
  const twin = await createEntity(makeEntityInput({ entity_type: "AI_AGENT" }));
  await prisma.entityMembership.create({ data: { parent_id: user.entity_id, child_id: twin.entity_id, role_title: "Digital Twin", is_active: true } });
  await prisma.twinConfig.create({ data: { twin_id: twin.entity_id, autonomy_level: "APPROVAL_REQUIRED", is_admin_twin: false, role_template: null } });
  const login = (await auth.login(input.email!, password, ["read", "write"], { ip_address: null })) as LoginResult;
  if (!login.ok) throw new Error("login failed");
  return { token: login.token, userId: user.entity_id, twinId: twin.entity_id, orgId: org.entity_id };
}

const turnsOf = (conversationId: string) =>
  prisma.otzarConversationTurn.findMany({ where: { conversation_id: conversationId }, orderBy: { sequence: "asc" } });

// A provider whose response can be parked mid-flight so a concurrent duplicate is
// forced to observe the winner's in-flight PROCESSING state (real barrier, not luck).
class GatedLLM implements LLMProvider {
  readonly name = "gated";
  private count = 0;
  private blocking = false;
  private gate: Promise<void> | null = null;
  private opener: (() => void) | null = null;
  arm(): void { this.gate = new Promise<void>((r) => { this.opener = r; }); this.blocking = true; }
  release(): void { this.blocking = false; this.opener?.(); this.opener = null; }
  getCalls(): number { return this.count; }
  async generateResponse(): Promise<{ ok: true; text: string; provider: string; model: string }> {
    this.count += 1;
    if (this.blocking && this.gate !== null) await this.gate;
    return { ok: true, text: "gated answer", provider: "gated", model: "g-1" };
  }
}

async function waitUntil(fn: () => boolean, timeoutMs = 4000): Promise<void> {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitUntil timed out");
    await new Promise((r) => setTimeout(r, 5));
  }
}

// [C2/C5 failure injection] Force the ASSISTANT-turn insert to fail for exactly ONE
// conductSession call, then restore synchronously in `finally` — BEFORE any other test or
// file runs. Directly swaps the method (no vi.spyOn global state) so it can never leak
// across files in the shared `forks` pool (a spy on the shared prisma singleton did).
async function withAssistantPersistFailing<T>(fn: () => Promise<T>): Promise<T> {
  const model = prisma.otzarConversationTurn as unknown as { create: (a: unknown) => Promise<unknown> };
  const original = model.create.bind(prisma.otzarConversationTurn);
  model.create = (a: unknown) =>
    (a as { data?: { role?: string } })?.data?.role === "ASSISTANT"
      ? Promise.reject(new Error("injected assistant-persist failure"))
      : original(a);
  try {
    return await fn();
  } finally {
    model.create = original; // ALWAYS restore, even on throw
  }
}

beforeAll(async () => { await ensureAuditTriggers(); });
afterAll(async () => { await cleanupTestData(); await prisma.$disconnect(); });

describe("conductSession durable turn wiring (P5 Stage 1)", () => {
  it("persists a USER turn then an ASSISTANT (Twin-authored) turn, ordered 1/2, with correct identity", async () => {
    const { auth, otzar } = makeServices();
    const { token, userId, twinId } = await orgUserWithTwin(auth);
    const r = await otzar.conductSession({ token, message: "hello, what can you help me with today?" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const turns = await turnsOf(r.conversation_id);
    expect(turns.map((t) => t.role)).toEqual(["USER", "ASSISTANT"]);
    expect(turns.map((t) => t.sequence)).toEqual([1, 2]);
    expect(turns[0]!.subject_entity_id).toBe(userId);
    expect(turns[0]!.author_entity_id).toBe(userId); // human authored their turn
    expect(turns[1]!.author_entity_id).toBe(twinId); // Twin authored the assistant turn
    expect(turns[1]!.reply_to_turn_id).toBe(turns[0]!.turn_id);
    expect(turns[1]!.content).toContain("help");
  });

  it("retry with the same request_id replays the stored result — no second LLM call, no duplicate turns", async () => {
    const { auth, otzar, llm } = makeServices();
    const { token } = await orgUserWithTwin(auth);
    const first = await otzar.conductSession({ token, message: "what can you do?", request_id: "req-abc-1" });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const callsAfterFirst = llm.getCalls().length;
    const turnsAfterFirst = (await turnsOf(first.conversation_id)).length;

    const retry = await otzar.conductSession({ token, message: "what can you do?", request_id: "req-abc-1", conversation_id: first.conversation_id });
    expect(retry.ok).toBe(true);
    if (!retry.ok) return;
    expect(retry.response).toBe(first.response); // replayed, identical
    expect(llm.getCalls().length).toBe(callsAfterFirst); // ZERO additional LLM calls
    expect((await turnsOf(first.conversation_id)).length).toBe(turnsAfterFirst); // no duplicate turns
  });

  it("same request_id + DIFFERENT content → OTZAR_REQUEST_ID_CONFLICT (no processing)", async () => {
    const { auth, otzar, llm } = makeServices();
    const { token } = await orgUserWithTwin(auth);
    const first = await otzar.conductSession({ token, message: "original content", request_id: "req-xyz-9" });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const calls = llm.getCalls().length;
    const conflict = await otzar.conductSession({ token, message: "DIFFERENT content", request_id: "req-xyz-9", conversation_id: first.conversation_id });
    expect(conflict.ok).toBe(false);
    if (conflict.ok) return;
    expect(conflict.code).toBe("OTZAR_REQUEST_ID_CONFLICT");
    expect(llm.getCalls().length).toBe(calls); // conflict short-circuits before the model
  });

  it("rejects a malformed request_id", async () => {
    const { auth, otzar } = makeServices();
    const { token } = await orgUserWithTwin(auth);
    const r = await otzar.conductSession({ token, message: "hi", request_id: "bad id with spaces!" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("INVALID_REQUEST_ID");
  });

  it("§7: a supplied thread owned by ANOTHER user → OTZAR_THREAD_FORBIDDEN (never attached)", async () => {
    const { auth, otzar } = makeServices();
    const a = await orgUserWithTwin(auth);
    const b = await orgUserWithTwin(auth);
    // User B starts a conversation; capture B's server thread id.
    const bConv = await otzar.conductSession({ token: b.token, message: "hello from B" });
    expect(bConv.ok).toBe(true);
    if (!bConv.ok) return;
    // User A tries to use B's thread → explicit forbidden, no attach, no leak.
    const forbidden = await otzar.conductSession({ token: a.token, message: "sneaking in", conversation_id: bConv.conversation_id });
    expect(forbidden.ok).toBe(false);
    if (forbidden.ok) return;
    expect(forbidden.code).toBe("OTZAR_THREAD_FORBIDDEN");
  });

  it("§1A: resolveContinuityThread is READ-ONLY (Phase A performs no WorkLedger write)", async () => {
    const { auth } = makeServices();
    const { userId, orgId } = await orgUserWithTwin(auth);
    const { resolveContinuityThread, resolveTemporalContext } = await import(
      "../../apps/api/src/services/otzar/calendar-continuity.service.js"
    );
    const temporal = await resolveTemporalContext({ actor_entity_id: userId });
    const before = await prisma.workLedgerEntry.count({ where: { owner_entity_id: userId } });
    const res = await resolveContinuityThread({ actor_entity_id: userId, org_entity_id: orgId, message: "put a strategy review on my calendar tomorrow at 2pm", temporal });
    const after = await prisma.workLedgerEntry.count({ where: { owner_entity_id: userId } });
    expect(after).toBe(before); // no proposal created by the read-only resolve
    expect(res.will_mutate).toBe(true);
    expect(res.kind).toBe("propose");
    expect(typeof res.thread_id).toBe("string");
  });

  it("§1A: ambient propose persists the USER turn BEFORE the proposal (mutation never precedes the turn)", async () => {
    const { auth, otzar } = makeServices();
    const { token, userId } = await orgUserWithTwin(auth);
    const r = await otzar.conductSession({ token, message: "put a budget review on my calendar tomorrow at 3pm" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.action_proposed).toBe(true);
    const turns = await turnsOf(r.conversation_id);
    expect(turns[0]!.role).toBe("USER");
    const proposal = await prisma.workLedgerEntry.findFirst({ where: { owner_entity_id: userId, ledger_type: "MEETING", conversation_id: r.conversation_id } });
    expect(proposal).not.toBeNull();
    expect(turns[0]!.created_at.getTime()).toBeLessThanOrEqual(proposal!.created_at.getTime());
  });

  it("§9 REAL BARRIER: two concurrent duplicates (same request_id) → exactly ONE processes, ONE canonical result", async () => {
    // Build services with a gated provider so the winner is provably still processing
    // when the loser attempts its claim (not a timing accident).
    const gated = new GatedLLM();
    const wired = makeServicesWithLLM(gated as unknown as LLMProvider);
    const { token } = await orgUserWithTwin(wired.auth);

    // Warm-up establishes the server thread id (gate not armed → returns immediately).
    const warm = await wired.otzar.conductSession({ token, message: "warmup" });
    expect(warm.ok).toBe(true);
    if (!warm.ok) return;
    const convId = warm.conversation_id;
    const callsAfterWarm = gated.getCalls();

    // Arm the gate, then fire two identical requests concurrently.
    gated.arm();
    const p1 = wired.otzar.conductSession({ token, message: "do the thing", request_id: "race-9", conversation_id: convId });
    const p2 = wired.otzar.conductSession({ token, message: "do the thing", request_id: "race-9", conversation_id: convId });

    // Wait until the winner is parked inside the provider (its claim succeeded and it
    // reached the LLM). The loser, meanwhile, must have hit PROCESSING and bailed.
    await waitUntil(() => gated.getCalls() === callsAfterWarm + 1);
    gated.release();
    const [r1, r2] = await Promise.all([p1, p2]);

    // Exactly ONE provider call for the raced request (warm + 1). No duplicate provider.
    expect(gated.getCalls()).toBe(callsAfterWarm + 1);

    // Exactly one USER turn and one ASSISTANT turn for the raced content.
    const turns = await turnsOf(convId);
    const racedUser = turns.filter((t) => t.role === "USER" && t.content === "do the thing");
    expect(racedUser).toHaveLength(1);
    const racedAsst = turns.filter((t) => t.role === "ASSISTANT" && t.reply_to_turn_id === racedUser[0]!.turn_id);
    expect(racedAsst).toHaveLength(1);

    // Exactly one request record for the raced turn, COMPLETED, canonical link set.
    const reqs = await prisma.otzarConversationRequest.findMany({ where: { user_turn_id: racedUser[0]!.turn_id } });
    expect(reqs).toHaveLength(1);
    expect(reqs[0]!.state).toBe("COMPLETED");
    expect(reqs[0]!.canonical_assistant_turn_id).toBe(racedAsst[0]!.turn_id);

    // One caller got the real answer; the other either replayed it or was refused
    // as in-progress. Never two distinct answers, never a duplicate side effect.
    const outcomes = [r1, r2];
    const answered = outcomes.filter((r) => r.ok && r.response === "gated answer");
    const inProgress = outcomes.filter((r) => !r.ok && r.code === "OTZAR_REQUEST_IN_PROGRESS");
    expect(answered.length + inProgress.length).toBe(2);
    expect(answered.length).toBeGreaterThanOrEqual(1);
  });

  it("§10 FAILURE INJECTION: provider fails after the claim → FAILED_RETRYABLE, then a same-request_id retry reclaims and succeeds", async () => {
    const llm = new MockLLMProvider([
      { ok: true, text: "warmup ok", provider: "mock", model: "m" }, // warm-up
      { ok: false, code: "DOWN", fallback_message: "temporarily unavailable", provider: "mock" }, // first real attempt
      { ok: true, text: "recovered answer", provider: "mock", model: "m" }, // retry
    ]);
    const wired = makeServicesWithLLM(llm as unknown as LLMProvider);
    const { token } = await orgUserWithTwin(wired.auth);

    const warm = await wired.otzar.conductSession({ token, message: "warmup" });
    expect(warm.ok).toBe(true);
    if (!warm.ok) return;
    const convId = warm.conversation_id;

    // First real attempt: provider fails AFTER the request was claimed.
    const fail = await wired.otzar.conductSession({ token, message: "do it", request_id: "retry-10", conversation_id: convId });
    expect(fail.ok).toBe(false);
    if (fail.ok) return;
    expect(fail.code).toBe("LLM_UNAVAILABLE");

    const userTurn = (await turnsOf(convId)).find((t) => t.role === "USER" && t.content === "do it");
    expect(userTurn).toBeDefined();
    const afterFail = await prisma.otzarConversationRequest.findUnique({ where: { user_turn_id: userTurn!.turn_id } });
    // The claim was released as retryable — NOT left PROCESSING for the lease to decay.
    expect(afterFail!.state).toBe("FAILED_RETRYABLE");
    expect(afterFail!.canonical_assistant_turn_id).toBeNull();
    // No ASSISTANT turn was persisted for the failed attempt.
    expect((await turnsOf(convId)).filter((t) => t.role === "ASSISTANT" && t.reply_to_turn_id === userTurn!.turn_id)).toHaveLength(0);

    // Retry with the SAME request_id reclaims the request and completes.
    const ok = await wired.otzar.conductSession({ token, message: "do it", request_id: "retry-10", conversation_id: convId });
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.response).toBe("recovered answer");
    const asst = (await turnsOf(convId)).filter((t) => t.role === "ASSISTANT" && t.reply_to_turn_id === userTurn!.turn_id);
    expect(asst).toHaveLength(1);
    const afterOk = await prisma.otzarConversationRequest.findUnique({ where: { user_turn_id: userTurn!.turn_id } });
    expect(afterOk!.state).toBe("COMPLETED");
    expect(afterOk!.canonical_assistant_turn_id).toBe(asst[0]!.turn_id);
    // Still exactly ONE USER turn for the raced request_id (idempotent).
    expect((await turnsOf(convId)).filter((t) => t.role === "USER" && t.content === "do it")).toHaveLength(1);
  });

  it("C1: an ambient GENERIC (no client thread) org turn is request-gated — thread + USER turn + request record claimed before the model, canonical link on completion", async () => {
    const llm = new MockLLMProvider([{ ok: true, text: "Here is a general answer.", provider: "mock", model: "m" }]);
    const wired = makeServicesWithLLM(llm as unknown as LLMProvider);
    const { token } = await orgUserWithTwin(wired.auth);
    // No conversation_id → deferred/ambient path. A non-calendar message → generic LLM.
    const r = await wired.otzar.conductSession({ token, message: "what should I keep in mind while planning this quarter?", request_id: "amb-gen-1" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const turns = await turnsOf(r.conversation_id);
    const userTurn = turns.find((t) => t.role === "USER");
    const asstTurn = turns.find((t) => t.role === "ASSISTANT");
    expect(userTurn).toBeDefined();
    expect(asstTurn).toBeDefined();
    // The invariant: a request record exists 1:1 with the durable USER turn (gated before
    // the model), COMPLETED, with the ONE canonical assistant turn linked.
    const req = await prisma.otzarConversationRequest.findUnique({ where: { user_turn_id: userTurn!.turn_id } });
    expect(req).not.toBeNull();
    expect(req!.state).toBe("COMPLETED");
    expect(req!.canonical_assistant_turn_id).toBe(asstTurn!.turn_id);
    expect(req!.response_class).toBe("ANSWERED");
    expect(asstTurn!.reply_to_turn_id).toBe(userTurn!.turn_id);
    // The USER turn was durable BEFORE the assistant/model (sequence ordering).
    expect(userTurn!.sequence).toBeLessThan(asstTurn!.sequence);
  });

  it("C5: assistant persist fails AFTER a proposal is created → FAILED_RETRYABLE with the action linked; retry RECONSTRUCTS the same proposal (no 2nd proposal, no model)", async () => {
    const { auth, otzar, llm } = makeServices();
    const { token, userId } = await orgUserWithTwin(auth);
    const convId = randomUUID();
    const llmBefore = llm.getCalls().length;
    const msg = "put a budget review on my calendar tomorrow at 3pm";
    const first = await withAssistantPersistFailing(() =>
      otzar.conductSession({ token, message: msg, request_id: "c5-1", conversation_id: convId }),
    );
    expect(first.ok).toBe(false);
    if (first.ok) return;
    expect(first.code).toBe("OTZAR_ASSISTANT_TURN_PERSIST_FAILED");

    // The proposal WAS created + linked to the request; the request is FAILED_RETRYABLE.
    const proposalsAfterFail = await prisma.workLedgerEntry.count({ where: { owner_entity_id: userId, ledger_type: "MEETING" } });
    expect(proposalsAfterFail).toBe(1);
    const userTurn = (await turnsOf(convId)).find((t) => t.role === "USER");
    expect(userTurn).toBeDefined();
    const reqFail = await prisma.otzarConversationRequest.findUnique({ where: { user_turn_id: userTurn!.turn_id } });
    expect(reqFail!.state).toBe("FAILED_RETRYABLE");
    expect(reqFail!.action_ref).not.toBeNull();
    // No ASSISTANT turn was durably written.
    expect((await turnsOf(convId)).filter((t) => t.role === "ASSISTANT")).toHaveLength(0);

    // Retry with the SAME request_id (persistence restored) → reconstruct from the action.
    const retry = await otzar.conductSession({ token, message: msg, request_id: "c5-1", conversation_id: convId });
    expect(retry.ok).toBe(true);
    if (!retry.ok) return;
    expect(retry.action_proposed).toBe(true);
    expect(retry.response.toLowerCase()).toContain("budget review");
    // NO second proposal; request COMPLETED; the model was NEVER used (pure continuity).
    expect(await prisma.workLedgerEntry.count({ where: { owner_entity_id: userId, ledger_type: "MEETING" } })).toBe(1);
    const reqOk = await prisma.otzarConversationRequest.findUnique({ where: { user_turn_id: userTurn!.turn_id } });
    expect(reqOk!.state).toBe("COMPLETED");
    expect(reqOk!.canonical_assistant_turn_id).not.toBeNull();
    expect((await turnsOf(convId)).filter((t) => t.role === "ASSISTANT")).toHaveLength(1);
    expect(llm.getCalls().length).toBe(llmBefore);
  });

  it("C2: pure-LLM assistant persist failure → FAILED_RETRYABLE (no action); retry regenerates under exclusive lease — one USER turn, one canonical ASSISTANT", async () => {
    const llm = new MockLLMProvider([
      { ok: true, text: "first answer", provider: "mock", model: "m" },
      { ok: true, text: "regenerated answer", provider: "mock", model: "m" },
    ]);
    const wired = makeServicesWithLLM(llm as unknown as LLMProvider);
    const { token } = await orgUserWithTwin(wired.auth);
    const convId = randomUUID();
    const first = await withAssistantPersistFailing(() =>
      wired.otzar.conductSession({ token, message: "give me a quick planning tip", request_id: "c2-1", conversation_id: convId }),
    );
    expect(first.ok).toBe(false);
    if (first.ok) return;
    expect(first.code).toBe("OTZAR_ASSISTANT_TURN_PERSIST_FAILED");
    const userTurn = (await turnsOf(convId)).find((t) => t.role === "USER");
    const reqFail = await prisma.otzarConversationRequest.findUnique({ where: { user_turn_id: userTurn!.turn_id } });
    expect(reqFail!.state).toBe("FAILED_RETRYABLE");
    expect(reqFail!.action_ref).toBeNull(); // pure LLM → no action to reconstruct from

    const retry = await wired.otzar.conductSession({ token, message: "give me a quick planning tip", request_id: "c2-1", conversation_id: convId });
    expect(retry.ok).toBe(true);
    if (!retry.ok) return;
    // Exactly one USER turn (deduped) + one canonical ASSISTANT; request COMPLETED.
    const turns = await turnsOf(convId);
    expect(turns.filter((t) => t.role === "USER")).toHaveLength(1);
    expect(turns.filter((t) => t.role === "ASSISTANT")).toHaveLength(1);
    const reqOk = await prisma.otzarConversationRequest.findUnique({ where: { user_turn_id: userTurn!.turn_id } });
    expect(reqOk!.state).toBe("COMPLETED");
    expect(reqOk!.canonical_assistant_turn_id).toBe(turns.find((t) => t.role === "ASSISTANT")!.turn_id);
  });

  it("§8: source_channel is carried into durable turn lineage (VOICE / AMBIENT / CHAT)", async () => {
    const { auth, otzar } = makeServices();
    const { token } = await orgUserWithTwin(auth);
    const voice = await otzar.conductSession({ token, message: "voice turn", source_channel: "VOICE" });
    expect(voice.ok).toBe(true);
    if (!voice.ok) return;
    const turns = await turnsOf(voice.conversation_id);
    expect(turns.length).toBeGreaterThanOrEqual(2);
    expect(turns.every((t) => t.source_channel === "VOICE")).toBe(true);
    // Default channel is CHAT.
    const chat = await otzar.conductSession({ token, message: "chat turn" });
    if (!chat.ok) return;
    const chatTurns = await turnsOf(chat.conversation_id);
    expect(chatTurns.every((t) => t.source_channel === "CHAT")).toBe(true);
  });
});
