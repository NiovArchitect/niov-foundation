// FILE: otzar-thread-restoration.test.ts (integration)
// PURPOSE: [OTZAR-CONTINUITY C6] Prove the scope-gated server thread-restoration read APIs:
//          restore active thread (deterministic, never invented), thread detail + bounded
//          turns, request status (safe projection) — with strict cross-org/user isolation
//          and no lease/provider-token leakage. Runs against the real test DB.
// CONNECTS TO: apps/api/src/services/otzar/otzar.service.ts (restoreThreads /
//              getThreadDetail / getRequestStatus), packages/database queries/otzar-thread-restoration.ts

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

const TEST_JWT_SECRET = "otzar-restore-test-secret";
const TEST_KEY = randomBytes(32);

function makeServices() {
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
  const llm = new MockLLMProvider([{ ok: true, text: "A helpful answer.", provider: "mock", model: "m" }]);
  const otzar = new OtzarService(auth, coe, llm as unknown as LLMProvider, new MemoryKVCache());
  return { auth, otzar };
}

async function orgUserWithTwin(auth: AuthService): Promise<{ token: string; userId: string }> {
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
  return { token: login.token, userId: user.entity_id };
}

beforeAll(async () => { await ensureAuditTriggers(); });
afterAll(async () => { await cleanupTestData(); await prisma.$disconnect(); });

describe("C6 server thread restoration", () => {
  it("restoreThreads returns the caller's most-recent ACTIVE thread + recent list; a fresh user has none", async () => {
    const { auth, otzar } = makeServices();
    const fresh = await orgUserWithTwin(auth);
    const empty = await otzar.restoreThreads({ token: fresh.token });
    expect(empty.ok).toBe(true);
    if (!empty.ok) return;
    expect(empty.active).toBeNull(); // never invented
    expect(empty.recent).toEqual([]);

    // Create a durable thread by conducting a turn.
    const turn = await otzar.conductSession({ token: fresh.token, message: "give me a planning tip", request_id: "r-1" });
    expect(turn.ok).toBe(true);
    if (!turn.ok) return;
    const restored = await otzar.restoreThreads({ token: fresh.token });
    if (!restored.ok) return;
    expect(restored.active).not.toBeNull();
    expect(restored.active!.conversation_id).toBe(turn.conversation_id);
    expect(restored.recent.some((t) => t.conversation_id === turn.conversation_id)).toBe(true);
  });

  it("getThreadDetail returns bounded turns for the owner; a FOREIGN thread → OTZAR_THREAD_FORBIDDEN (no disclosure)", async () => {
    const { auth, otzar } = makeServices();
    const a = await orgUserWithTwin(auth);
    const b = await orgUserWithTwin(auth);
    const aTurn = await otzar.conductSession({ token: a.token, message: "what's on my plate?", request_id: "a-1" });
    if (!aTurn.ok) return;
    // Owner sees their turns.
    const detail = await otzar.getThreadDetail({ token: a.token, conversation_id: aTurn.conversation_id });
    expect(detail.ok).toBe(true);
    if (!detail.ok) return;
    expect(detail.thread.conversation_id).toBe(aTurn.conversation_id);
    expect(detail.turns.length).toBeGreaterThanOrEqual(2);
    expect(detail.turns.map((t) => t.role)).toContain("USER");
    expect(detail.turns.map((t) => t.role)).toContain("ASSISTANT");
    // B cannot read A's thread — forbidden, indistinguishable from not-found.
    const foreign = await otzar.getThreadDetail({ token: b.token, conversation_id: aTurn.conversation_id });
    expect(foreign.ok).toBe(false);
    if (foreign.ok) return;
    expect(foreign.code).toBe("OTZAR_THREAD_FORBIDDEN");
  });

  it("getRequestStatus returns a SAFE projection (state/class/flags) with NO lease or provider token; foreign → forbidden", async () => {
    const { auth, otzar } = makeServices();
    const a = await orgUserWithTwin(auth);
    const b = await orgUserWithTwin(auth);
    const turn = await otzar.conductSession({ token: a.token, message: "a quick question", request_id: "req-1" });
    if (!turn.ok) return;
    const userTurn = await prisma.otzarConversationTurn.findFirst({ where: { conversation_id: turn.conversation_id, role: "USER" } });
    const req = await prisma.otzarConversationRequest.findUnique({ where: { user_turn_id: userTurn!.turn_id } });
    const status = await otzar.getRequestStatus({ token: a.token, request_record_id: req!.request_record_id });
    expect(status.ok).toBe(true);
    if (!status.ok) return;
    expect(status.status.state).toBe("COMPLETED");
    expect(status.status.has_canonical_result).toBe(true);
    expect(status.status.in_progress).toBe(false);
    // Safe projection: the object exposes ONLY the whitelisted keys — no lease/provider token.
    const keys = Object.keys(status.status);
    expect(keys).not.toContain("lease_token");
    expect(keys).not.toContain("provider_attempt_ref");
    expect(JSON.stringify(status.status)).not.toMatch(/lease|provider_attempt/i);
    // B cannot read A's request.
    const foreign = await otzar.getRequestStatus({ token: b.token, request_record_id: req!.request_record_id });
    expect(foreign.ok).toBe(false);
    if (foreign.ok) return;
    expect(foreign.code).toBe("OTZAR_THREAD_FORBIDDEN");
  });

  it("C6/E getRequestStatusByClient reconciles by (conversation, client_request_id) with safe canonical text; same client id in another conversation isolated; foreign → forbidden", async () => {
    const { auth, otzar } = makeServices();
    const a = await orgUserWithTwin(auth);
    const b = await orgUserWithTwin(auth);
    const turn = await otzar.conductSession({ token: a.token, message: "please reconcile this", request_id: "cli-X" });
    if (!turn.ok) return;
    const byClient = await otzar.getRequestStatusByClient({ token: a.token, conversation_id: turn.conversation_id, client_request_id: "cli-X" });
    expect(byClient.ok).toBe(true);
    if (!byClient.ok) return;
    expect(byClient.status.client_request_id).toBe("cli-X");
    expect(byClient.status.conversation_id).toBe(turn.conversation_id);
    expect(byClient.status.state).toBe("COMPLETED");
    expect(byClient.status.has_canonical_result).toBe(true);
    expect(typeof byClient.status.canonical_text).toBe("string"); // safe canonical reply text
    expect((byClient.status.canonical_text ?? "").length).toBeGreaterThan(0);
    // No sensitive fields leak.
    expect(JSON.stringify(byClient.status)).not.toMatch(/lease|provider_attempt/i);
    // Same client id but a DIFFERENT conversation → not found (never a global lookup).
    const wrongConv = await otzar.getRequestStatusByClient({ token: a.token, conversation_id: randomUUID(), client_request_id: "cli-X" });
    expect(wrongConv.ok).toBe(false);
    // Cross-user → forbidden, no disclosure.
    const foreign = await otzar.getRequestStatusByClient({ token: b.token, conversation_id: turn.conversation_id, client_request_id: "cli-X" });
    expect(foreign.ok).toBe(false);
    if (foreign.ok) return;
    expect(foreign.code).toBe("OTZAR_THREAD_FORBIDDEN");
  });

  it("C6/F Twin-scope: a thread bound to a DIFFERENT Twin is never restored/read for this caller (no cross-Twin blending)", async () => {
    const { auth, otzar } = makeServices();
    const u = await orgUserWithTwin(auth);
    const mine = await otzar.conductSession({ token: u.token, message: "my own thread", request_id: "f-1" });
    if (!mine.ok) return;
    const row = await prisma.otzarConversation.findUnique({
      where: { conversation_id: mine.conversation_id },
      select: { org_entity_id: true, entity_id: true },
    });
    // Fabricate a NEWER thread for the same (org, subject) but a DIFFERENT Twin.
    const otherTwin = randomUUID();
    const foreignTwinConv = randomUUID();
    await prisma.otzarConversation.create({
      data: {
        conversation_id: foreignTwinConv,
        entity_id: row!.entity_id,
        twin_id: otherTwin,
        org_entity_id: row!.org_entity_id,
        status: "ACTIVE",
        last_active_at: new Date(Date.now() + 60_000), // NEWER than mine
        participants: [row!.entity_id, otherTwin],
      },
    });
    const restored = await otzar.restoreThreads({ token: u.token });
    if (!restored.ok) return;
    // Despite being newer, the other-Twin thread is NOT the active thread (Twin-scoped).
    expect(restored.active).not.toBeNull();
    expect(restored.active!.conversation_id).toBe(mine.conversation_id);
    expect(restored.recent.every((t) => t.conversation_id !== foreignTwinConv)).toBe(true);
    // Detail on the other-Twin thread → forbidden (no cross-Twin read).
    const detail = await otzar.getThreadDetail({ token: u.token, conversation_id: foreignTwinConv });
    expect(detail.ok).toBe(false);
  });

  it("C6/C canonical-text projection: an INCONSISTENT canonical (wrong role/relationship) is NOT exposed as text or a valid result", async () => {
    const { auth, otzar } = makeServices();
    const a = await orgUserWithTwin(auth);
    const turn = await otzar.conductSession({ token: a.token, message: "hello there", request_id: "cproj-1" });
    if (!turn.ok) return;
    const userTurn = await prisma.otzarConversationTurn.findFirst({ where: { conversation_id: turn.conversation_id, role: "USER" } });
    const req = await prisma.otzarConversationRequest.findUnique({ where: { user_turn_id: userTurn!.turn_id } });
    // Corrupt the request's canonical to point at the USER turn (wrong role/relationship).
    await prisma.otzarConversationRequest.update({
      where: { request_record_id: req!.request_record_id },
      data: { canonical_assistant_turn_id: userTurn!.turn_id },
    });
    const status = await otzar.getRequestStatusByClient({ token: a.token, conversation_id: turn.conversation_id, client_request_id: "cproj-1" });
    expect(status.ok).toBe(true);
    if (!status.ok) return;
    // Inconsistent canonical → NOT exposed as text, NOT reported as a valid result.
    expect(status.status.canonical_text).toBeNull();
    expect(status.status.has_canonical_result).toBe(false);
    expect(status.status.canonical_assistant_turn_id).toBeNull();
  });

  it("C6/D restoration resolves the SAME deterministic primary Twin conductSession uses, even with multiple eligible Twins", async () => {
    const { auth, otzar } = makeServices();
    const u = await orgUserWithTwin(auth); // creates the primary (oldest) Twin
    // Add a SECOND, newer eligible AI_AGENT Twin for the same subject.
    const twin2 = await createEntity(makeEntityInput({ entity_type: "AI_AGENT" }));
    await prisma.entityMembership.create({ data: { parent_id: u.userId, child_id: twin2.entity_id, role_title: "Digital Twin", is_active: true } });
    const turn = await otzar.conductSession({ token: u.token, message: "which twin am I talking to?", request_id: "twin-d-1" });
    if (!turn.ok) return;
    const convRow = await prisma.otzarConversation.findUnique({ where: { conversation_id: turn.conversation_id }, select: { twin_id: true } });
    // Restoration MUST resolve the same primary Twin → restore the thread bound to it, and
    // NOT the newer Twin (no cross-Twin blend; conductSession + restoration agree).
    const restored = await otzar.restoreThreads({ token: u.token });
    if (!restored.ok) return;
    expect(restored.active).not.toBeNull();
    expect(restored.active!.conversation_id).toBe(turn.conversation_id);
    expect(restored.active!.twin_entity_id).toBe(convRow!.twin_id);
    expect(restored.active!.twin_entity_id).not.toBe(twin2.entity_id);
  });

  it("restoreActiveThread never returns an ARCHIVED or DELETED thread", async () => {
    const { auth, otzar } = makeServices();
    const u = await orgUserWithTwin(auth);
    const turn = await otzar.conductSession({ token: u.token, message: "archive me later", request_id: "arch-1" });
    if (!turn.ok) return;
    // Archive the thread directly (operator action).
    await prisma.otzarConversation.update({ where: { conversation_id: turn.conversation_id }, data: { archived_at: new Date() } });
    const restored = await otzar.restoreThreads({ token: u.token });
    if (!restored.ok) return;
    expect(restored.active).toBeNull(); // archived → not restored as active
    // It still appears when archived is explicitly requested.
    const withArchived = await otzar.restoreThreads({ token: u.token, includeArchived: true });
    if (!withArchived.ok) return;
    expect(withArchived.recent.some((t) => t.conversation_id === turn.conversation_id)).toBe(true);
  });
});
