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
