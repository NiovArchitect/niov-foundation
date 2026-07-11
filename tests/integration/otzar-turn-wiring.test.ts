// FILE: otzar-turn-wiring.test.ts (integration)
// PURPOSE: [OTZAR-CONTINUITY P5 Stage 1 wiring] Prove conductSession now persists
//          durable turns for an ORG'd caller: USER turn before the model, ASSISTANT
//          turn (author = Twin) before the response, monotonic ordering, request_id
//          retry-replay (no second LLM call, no duplicate turn), and different-content
//          conflict. Runs against the real test DB.
// CONNECTS TO: apps/api/src/services/otzar/otzar.service.ts (beginTurnPersistence /
//              persistAssistantTurn / reconstructFromAssistantTurn).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
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

function makeServices() {
  const auth = new AuthService({ jwtSecret: TEST_JWT_SECRET, nonceStore: new MemoryNonceStore() });
  const declarationStore = new MemoryNonceStore();
  const contentStore = new MemoryContentStore();
  const encryption = new ContentEncryption(TEST_KEY);
  const compliance = new ComplianceService(auth);
  const negotiate = new NegotiateService(auth, declarationStore, TEST_JWT_SECRET, compliance);
  const read = new ReadService(auth, declarationStore, contentStore, TEST_JWT_SECRET);
  const write = new WriteService(auth, declarationStore, contentStore, encryption, TEST_JWT_SECRET, new FixtureBasedEmbeddingProvider());
  const coe = new COEService(auth, negotiate, read, encryption);
  void new HiveService(auth, encryption, contentStore);
  const llm = new MockLLMProvider([
    { ok: true, text: "Here is what I can help with.", provider: "mock", model: "mock-1" },
    { ok: true, text: "Second distinct response.", provider: "mock", model: "mock-1" },
    { ok: true, text: "Third response.", provider: "mock", model: "mock-1" },
  ]);
  const otzar = new OtzarService(auth, coe, llm as LLMProvider, new MemoryKVCache());
  return { auth, otzar, llm };
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
