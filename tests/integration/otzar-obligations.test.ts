// FILE: tests/integration/otzar-obligations.test.ts
// PURPOSE: [OTZAR STAGE-2 §9 + HARDENING C/E/F/G/I] Real-PostgreSQL proof of the obligation
//          layer AND its hardening: atomic audit (rollback on audit failure, no swallow),
//          reference-coherence validation, responsibility authority, projection coherence, and
//          evidence coherence — plus the original lifecycle/scope/idempotency invariants.
// CONNECTS TO: apps/api/src/services/otzar/otzar.service.ts, packages/database/src/queries/
//          otzar-obligations.ts.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import {
  AuthService, COEService, HiveService, FixtureBasedEmbeddingProvider,
  MemoryContentStore, MemoryKVCache, MemoryNonceStore, MockLLMProvider,
  NegotiateService, OtzarService, ReadService, WriteService, ComplianceService,
  type LLMProvider, type LoginResult,
} from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import { createEntity, prisma, createThread, markThreadDeleted, __otzarObligationTestHooks } from "@niov/database";
import { cleanupTestData, ensureAuditTriggers, makeEntityInput } from "../helpers.js";

const TEST_JWT_SECRET = "otzar-obligations-test-secret";
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
  const llm = new MockLLMProvider([{ ok: true, text: "ok", provider: "mock", model: "mock-1" }]);
  const otzar = new OtzarService(auth, coe, llm as unknown as LLMProvider, new MemoryKVCache());
  return { auth, otzar };
}

interface OrgUser { token: string; userId: string; twinId: string; orgId: string; email: string; password: string }

async function orgUserWithTwin(auth: AuthService): Promise<OrgUser> {
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
  return { token: login.token, userId: user.entity_id, twinId: twin.entity_id, orgId: org.entity_id, email: input.email!, password };
}

/** An additional ACTIVE member of the SAME org (a valid reassignment target). */
async function coMember(orgId: string): Promise<string> {
  const m = await createEntity(makeEntityInput({ entity_type: "PERSON" }));
  await prisma.entityMembership.create({ data: { parent_id: orgId, child_id: m.entity_id, is_active: true } });
  return m.entity_id;
}

/** A real conversation the caller owns (obligation references now require the conversation to exist). */
async function seedConversation(u: OrgUser): Promise<string> {
  const t = await createThread({ org_entity_id: u.orgId, subject_entity_id: u.userId, twin_entity_id: u.twinId });
  return t.conversation_id;
}

async function seedTurn(u: OrgUser, conversationId: string, role: "USER" | "ASSISTANT", content = "yes", createdAt?: Date, authorId?: string): Promise<string> {
  const turn = await prisma.otzarConversationTurn.create({
    data: {
      conversation_id: conversationId, org_entity_id: u.orgId, subject_entity_id: u.userId,
      author_entity_id: authorId ?? (role === "USER" ? u.userId : u.twinId), twin_entity_id: u.twinId,
      role, content, content_hash: createHash("sha256").update(content + randomUUID()).digest("hex"),
      sequence: Math.floor(Math.random() * 1_000_000) + 1, source_channel: "CHAT",
      ...(createdAt !== undefined ? { created_at: createdAt } : {}),
    },
    select: { turn_id: true },
  });
  return turn.turn_id;
}

async function seedLedger(u: OrgUser, status: string, ownerId?: string | null): Promise<string> {
  const led = await prisma.workLedgerEntry.create({
    data: { org_entity_id: u.orgId, ledger_type: "MEETING", owner_entity_id: ownerId === undefined ? u.userId : ownerId, title: "Sync", status },
    select: { ledger_entry_id: true },
  });
  return led.ledger_entry_id;
}

async function withAuditFailing<T>(fn: () => Promise<T>): Promise<T> {
  __otzarObligationTestHooks.failAudit = true;
  try { return await fn(); } finally { __otzarObligationTestHooks.failAudit = false; }
}

beforeAll(async () => { await ensureAuditTriggers(); });
afterAll(async () => { __otzarObligationTestHooks.failAudit = false; await cleanupTestData(); await prisma.$disconnect(); });

describe("Otzar obligations (Stage-2)", () => {
  it("idempotent create: same origin_key returns the SAME obligation (created flips to false)", async () => {
    const { auth, otzar } = makeServices();
    const u = await orgUserWithTwin(auth);
    const key = `question:${randomUUID()}`;
    const first = await otzar.createObligation({ token: u.token, obligation_type: "QUESTION_RESPONSE", title: "Which vendor?", origin_key: key, initial_state: "AWAITING_RESPONSE" });
    const second = await otzar.createObligation({ token: u.token, obligation_type: "QUESTION_RESPONSE", title: "Which vendor?", origin_key: key });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.obligation.obligation_id).toBe(first.obligation.obligation_id);
    expect(await prisma.obligation.count({ where: { org_entity_id: u.orgId, origin_key: key } })).toBe(1);
  });

  it("scope + no-leak: created under exact org/subject/twin; projection omits internal refs", async () => {
    const { auth, otzar } = makeServices();
    const u = await orgUserWithTwin(auth);
    const ledger = await seedLedger(u, "EXECUTED");
    const created = await otzar.createObligation({ token: u.token, obligation_type: "ACTION_CONFIRMATION", title: "Add meeting?", action_ref: ledger, initial_state: "AWAITING_RESPONSE" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const row = await prisma.obligation.findUnique({ where: { obligation_id: created.obligation.obligation_id } });
    expect(row!.org_entity_id).toBe(u.orgId);
    expect(row!.subject_entity_id).toBe(u.userId);
    expect(row!.twin_entity_id).toBe(u.twinId);
    expect(row!.action_ref).toBe(ledger);
    const keys = Object.keys(created.obligation);
    expect(keys).toContain("has_action");
    expect(keys).not.toContain("action_ref");
    expect(JSON.stringify(created.obligation)).not.toMatch(/lease|provider_attempt|"action_ref"/i);
  });

  it("acknowledge: only the responsible actor via a USER turn; an ASSISTANT/twin turn cannot", async () => {
    const { auth, otzar } = makeServices();
    const u = await orgUserWithTwin(auth);
    const convId = await seedConversation(u);
    const created = await otzar.createObligation({ token: u.token, obligation_type: "CLARIFICATION", title: "Confirm scope?", conversation_id: convId, source_turn_id: await seedTurn(u, convId, "ASSISTANT", "which one?"), initial_state: "AWAITING_RESPONSE" });
    if (!created.ok) throw new Error("create failed: " + (created.ok ? "" : created.code));
    const asstTurn = await seedTurn(u, convId, "ASSISTANT", "ok");
    const badAck = await otzar.acknowledgeObligation({ token: u.token, obligation_id: created.obligation.obligation_id, expected_version: created.obligation.version, acknowledged_turn_id: asstTurn });
    expect(badAck.ok).toBe(false);
    if (!badAck.ok) expect(badAck.code).toBe("OTZAR_OBLIGATION_NOT_ACKNOWLEDGEABLE");
    const userTurn = await seedTurn(u, convId, "USER");
    const ack = await otzar.acknowledgeObligation({ token: u.token, obligation_id: created.obligation.obligation_id, expected_version: created.obligation.version, acknowledged_turn_id: userTurn });
    expect(ack.ok).toBe(true);
    if (ack.ok) expect(ack.obligation.state).toBe("ACKNOWLEDGED");
    expect(await prisma.auditEvent.findFirst({ where: { event_type: "OBLIGATION_ACKNOWLEDGED", actor_entity_id: u.userId } })).not.toBeNull();
  });

  it("complete WITH evidence (ACTION_CONFIRMATION via EXECUTED ledger); WITHOUT refused", async () => {
    const { auth, otzar } = makeServices();
    const u = await orgUserWithTwin(auth);
    const bare = await otzar.createObligation({ token: u.token, obligation_type: "QUESTION_RESPONSE", title: "Any blockers?", initial_state: "AWAITING_RESPONSE" });
    if (!bare.ok) throw new Error();
    const noEvidence = await otzar.completeObligation({ token: u.token, obligation_id: bare.obligation.obligation_id, expected_version: bare.obligation.version });
    expect(noEvidence.ok).toBe(false);
    if (!noEvidence.ok) expect(noEvidence.code).toBe("OTZAR_OBLIGATION_EVIDENCE_REQUIRED");

    const pending = await seedLedger(u, "NEEDS_CALLER_CONFIRMATION");
    const confirm = await otzar.createObligation({ token: u.token, obligation_type: "ACTION_CONFIRMATION", title: "Add meeting?", action_ref: pending, initial_state: "AWAITING_RESPONSE" });
    if (!confirm.ok) throw new Error();
    const notYet = await otzar.completeObligation({ token: u.token, obligation_id: confirm.obligation.obligation_id, expected_version: confirm.obligation.version });
    expect(notYet.ok).toBe(false); // ledger not EXECUTED → refused
    await prisma.workLedgerEntry.update({ where: { ledger_entry_id: pending }, data: { status: "EXECUTED" } });
    const done = await otzar.completeObligation({ token: u.token, obligation_id: confirm.obligation.obligation_id, expected_version: confirm.obligation.version });
    expect(done.ok).toBe(true);
    if (done.ok) { expect(done.obligation.state).toBe("COMPLETED"); expect(done.obligation.completed_at).not.toBeNull(); }
  });

  it("[I] completion turn-path coherence: assistant / another-actor / pre-obligation / wrong-conversation turns refused; a valid designated USER turn succeeds", async () => {
    const { auth, otzar } = makeServices();
    const u = await orgUserWithTwin(auth);
    const convId = await seedConversation(u);
    const other = await orgUserWithTwin(auth);
    const make = async () => {
      const o = await otzar.createObligation({ token: u.token, obligation_type: "FOLLOW_UP", title: "close me", conversation_id: convId, initial_state: "AWAITING_RESPONSE" });
      if (!o.ok) throw new Error(); return o.obligation;
    };
    // assistant turn → refused (role)
    let ob = await make();
    let r = await otzar.completeObligation({ token: u.token, obligation_id: ob.obligation_id, expected_version: ob.version, completion_turn_id: await seedTurn(u, convId, "ASSISTANT") });
    expect(r.ok).toBe(false);
    // another actor's USER turn → refused (author check: the turn is authored by `other`, but the
    // completing actor is u; the turn's subject/scope also mismatches)
    ob = await make();
    const foreignConv = await seedConversation(other);
    r = await otzar.completeObligation({ token: u.token, obligation_id: ob.obligation_id, expected_version: ob.version, completion_turn_id: await seedTurn(other, foreignConv, "USER") });
    expect(r.ok).toBe(false);
    // pre-obligation turn → refused (created_before)
    ob = await make();
    const oldTurn = await seedTurn(u, convId, "USER", "early", new Date(Date.now() - 3_600_000));
    r = await otzar.completeObligation({ token: u.token, obligation_id: ob.obligation_id, expected_version: ob.version, completion_turn_id: oldTurn });
    expect(r.ok).toBe(false);
    // wrong conversation → refused (scope)
    ob = await make();
    const otherConv = await seedConversation(u);
    r = await otzar.completeObligation({ token: u.token, obligation_id: ob.obligation_id, expected_version: ob.version, completion_turn_id: await seedTurn(u, otherConv, "USER") });
    expect(r.ok).toBe(false);
    // valid: in-scope USER turn, same conversation, created after → succeeds
    ob = await make();
    const good = await otzar.completeObligation({ token: u.token, obligation_id: ob.obligation_id, expected_version: ob.version, completion_turn_id: await seedTurn(u, convId, "USER", "done") });
    expect(good.ok).toBe(true);
    if (good.ok) expect(good.obligation.state).toBe("COMPLETED");
  });

  it("[I] action-path completion: attempted/failed not EXECUTED → refused; EXECUTED → ok", async () => {
    const { auth, otzar } = makeServices();
    const u = await orgUserWithTwin(auth);
    for (const bad of ["EXECUTING", "FAILED", "NEEDS_CALLER_CONFIRMATION"]) {
      const led = await seedLedger(u, bad);
      const o = await otzar.createObligation({ token: u.token, obligation_type: "ACTION_CONFIRMATION", title: "x", action_ref: led });
      if (!o.ok) throw new Error();
      const r = await otzar.completeObligation({ token: u.token, obligation_id: o.obligation.obligation_id, expected_version: o.obligation.version });
      expect(r.ok).toBe(false);
    }
    const led = await seedLedger(u, "EXECUTED");
    const o = await otzar.createObligation({ token: u.token, obligation_type: "ACTION_CONFIRMATION", title: "x", action_ref: led });
    if (!o.ok) throw new Error();
    expect((await otzar.completeObligation({ token: u.token, obligation_id: o.obligation.obligation_id, expected_version: o.obligation.version })).ok).toBe(true);
  });

  it("duplicate completion: a COMPLETED obligation cannot be completed again (terminal)", async () => {
    const { auth, otzar } = makeServices();
    const u = await orgUserWithTwin(auth);
    const led = await seedLedger(u, "EXECUTED");
    const o = await otzar.createObligation({ token: u.token, obligation_type: "ACTION_CONFIRMATION", title: "Add?", action_ref: led });
    if (!o.ok) throw new Error();
    const first = await otzar.completeObligation({ token: u.token, obligation_id: o.obligation.obligation_id, expected_version: o.obligation.version });
    if (!first.ok) throw new Error();
    const again = await otzar.completeObligation({ token: u.token, obligation_id: o.obligation.obligation_id, expected_version: first.obligation.version });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.code).toBe("OTZAR_OBLIGATION_ILLEGAL_TRANSITION");
  });

  it("stale-version CAS: a transition with an outdated expected_version is refused", async () => {
    const { auth, otzar } = makeServices();
    const u = await orgUserWithTwin(auth);
    const o = await otzar.createObligation({ token: u.token, obligation_type: "FOLLOW_UP", title: "Follow up" });
    if (!o.ok) throw new Error();
    expect((await otzar.transitionObligation({ token: u.token, obligation_id: o.obligation.obligation_id, expected_version: o.obligation.version, transition: "block" })).ok).toBe(true);
    const stale = await otzar.transitionObligation({ token: u.token, obligation_id: o.obligation.obligation_id, expected_version: o.obligation.version, transition: "cancel" });
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.code).toBe("OTZAR_OBLIGATION_STATE_CHANGED");
  });

  it("expiration is NOT success: EXPIRED sets expired_at, never completed_at", async () => {
    const { auth, otzar } = makeServices();
    const u = await orgUserWithTwin(auth);
    const o = await otzar.createObligation({ token: u.token, obligation_type: "FOLLOW_UP", title: "Ping vendor" });
    if (!o.ok) throw new Error();
    expect((await otzar.transitionObligation({ token: u.token, obligation_id: o.obligation.obligation_id, expected_version: o.obligation.version, transition: "expire" })).ok).toBe(true);
    const row = await prisma.obligation.findUnique({ where: { obligation_id: o.obligation.obligation_id } });
    expect(row!.expired_at).not.toBeNull();
    expect(row!.completed_at).toBeNull();
  });

  it("[F] reassignment: rejects a non-member; accepts an active co-member; preserves prior lineage; resets ack", async () => {
    const { auth, otzar } = makeServices();
    const u = await orgUserWithTwin(auth);
    const foreign = await orgUserWithTwin(auth); // different org
    const mate = await coMember(u.orgId); // same org, active
    const convId = await seedConversation(u);
    const o = await otzar.createObligation({ token: u.token, obligation_type: "HANDOFF", title: "Cover shift", conversation_id: convId, initial_state: "AWAITING_RESPONSE" });
    if (!o.ok) throw new Error();
    const ack = await otzar.acknowledgeObligation({ token: u.token, obligation_id: o.obligation.obligation_id, expected_version: o.obligation.version, acknowledged_turn_id: await seedTurn(u, convId, "USER") });
    if (!ack.ok) throw new Error();
    // A non-member cannot be assigned responsibility.
    const bad = await otzar.reassignObligation({ token: u.token, obligation_id: o.obligation.obligation_id, expected_version: ack.obligation.version, new_responsible_entity_id: foreign.userId, reason: "x" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.code).toBe("OTZAR_OBLIGATION_INVALID_REFERENCE");
    // A co-member is accepted.
    const ok = await otzar.reassignObligation({ token: u.token, obligation_id: o.obligation.obligation_id, expected_version: ack.obligation.version, new_responsible_entity_id: mate, reason: "PTO" });
    expect(ok.ok).toBe(true);
    const row = await prisma.obligation.findUnique({ where: { obligation_id: o.obligation.obligation_id } });
    expect(row!.responsible_entity_id).toBe(mate);
    expect(row!.acknowledged_at).toBeNull();
    const audit = await prisma.auditEvent.findFirst({ where: { event_type: "OBLIGATION_REASSIGNED", actor_entity_id: u.userId }, orderBy: { timestamp: "desc" } });
    const d = audit!.details as Record<string, unknown>;
    expect(d.previous_responsible_entity_id).toBe(u.userId);
    expect(d.new_responsible_entity_id).toBe(mate);
    expect(d.reason).toBe("PTO");
    expect(d.previous_acknowledged).toBe(true);
    expect(d.re_acknowledgement_required).toBe(true);
  });

  it("supersession: LINKED replacement, original SUPERSEDED (history kept)", async () => {
    const { auth, otzar } = makeServices();
    const u = await orgUserWithTwin(auth);
    const o = await otzar.createObligation({ token: u.token, obligation_type: "CLARIFICATION", title: "Make it 2pm?", initial_state: "AWAITING_RESPONSE" });
    if (!o.ok) throw new Error();
    const res = await otzar.supersedeObligation({ token: u.token, obligation_id: o.obligation.obligation_id, expected_version: o.obligation.version, replacement: { obligation_type: "CLARIFICATION", title: "Make it 3pm?", initial_state: "AWAITING_RESPONSE" } });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.obligation.state).toBe("SUPERSEDED");
    const repl = await prisma.obligation.findUnique({ where: { obligation_id: res.replacement.obligation_id } });
    expect(repl!.superseded_obligation_id).toBe(o.obligation.obligation_id);
    expect(repl!.parent_obligation_id).toBe(o.obligation.obligation_id);
    expect((await prisma.obligation.findUnique({ where: { obligation_id: o.obligation.obligation_id } }))!.state).toBe("SUPERSEDED");
  });

  it("cancellation moves to a terminal CANCELLED state with a timestamp", async () => {
    const { auth, otzar } = makeServices();
    const u = await orgUserWithTwin(auth);
    const o = await otzar.createObligation({ token: u.token, obligation_type: "BLOCKED_TASK", title: "Waiting on legal" });
    if (!o.ok) throw new Error();
    expect((await otzar.transitionObligation({ token: u.token, obligation_id: o.obligation.obligation_id, expected_version: o.obligation.version, transition: "cancel" })).ok).toBe(true);
    const row = await prisma.obligation.findUnique({ where: { obligation_id: o.obligation.obligation_id } });
    expect(row!.state).toBe("CANCELLED");
    expect(row!.cancelled_at).not.toBeNull();
  });

  it("cross-scope denial: another subject / another twin cannot read or transition", async () => {
    const { auth, otzar } = makeServices();
    const u = await orgUserWithTwin(auth);
    const other = await orgUserWithTwin(auth);
    const o = await otzar.createObligation({ token: u.token, obligation_type: "FOLLOW_UP", title: "Private" });
    if (!o.ok) throw new Error();
    expect((await otzar.getObligation({ token: other.token, obligation_id: o.obligation.obligation_id })).ok).toBe(false);
    expect((await otzar.transitionObligation({ token: other.token, obligation_id: o.obligation.obligation_id, expected_version: o.obligation.version, transition: "cancel" })).ok).toBe(false);
    // cross-twin: same org+subject, different twin → invisible to primary-twin scope
    const otherTwin = await createEntity(makeEntityInput({ entity_type: "AI_AGENT" }));
    const crossTwin = await prisma.obligation.create({ data: { org_entity_id: u.orgId, subject_entity_id: u.userId, twin_entity_id: otherTwin.entity_id, obligation_type: "FOLLOW_UP", title: "Other twin", creator_entity_id: u.userId, responsible_entity_id: u.userId }, select: { obligation_id: true } });
    const r = await otzar.getObligation({ token: u.token, obligation_id: crossTwin.obligation_id });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("OTZAR_OBLIGATION_NOT_FOUND");
  });

  it("[E] invalid references: nonexistent/foreign conversation, foreign/null-owner action, non-member responsible are rejected", async () => {
    const { auth, otzar } = makeServices();
    const u = await orgUserWithTwin(auth);
    const other = await orgUserWithTwin(auth);
    // nonexistent conversation
    let r = await otzar.createObligation({ token: u.token, obligation_type: "FOLLOW_UP", title: "x", conversation_id: randomUUID() });
    expect(r.ok).toBe(false); if (!r.ok) expect(r.code).toBe("OTZAR_OBLIGATION_INVALID_REFERENCE");
    // foreign conversation (owned by another subject)
    const foreignConv = await seedConversation(other);
    r = await otzar.createObligation({ token: u.token, obligation_type: "FOLLOW_UP", title: "x", conversation_id: foreignConv });
    expect(r.ok).toBe(false); if (!r.ok) expect(r.code).toBe("OTZAR_OBLIGATION_INVALID_REFERENCE");
    // foreign-owned action
    const foreignLed = await seedLedger(other, "NEEDS_CALLER_CONFIRMATION");
    r = await otzar.createObligation({ token: u.token, obligation_type: "ACTION_CONFIRMATION", title: "x", action_ref: foreignLed });
    expect(r.ok).toBe(false); if (!r.ok) expect(r.code).toBe("OTZAR_OBLIGATION_INVALID_REFERENCE");
    // null-owner action
    const nullOwnerLed = await seedLedger(u, "NEEDS_CALLER_CONFIRMATION", null);
    r = await otzar.createObligation({ token: u.token, obligation_type: "ACTION_CONFIRMATION", title: "x", action_ref: nullOwnerLed });
    expect(r.ok).toBe(false); if (!r.ok) expect(r.code).toBe("OTZAR_OBLIGATION_INVALID_REFERENCE");
    // non-member responsible
    r = await otzar.createObligation({ token: u.token, obligation_type: "FOLLOW_UP", title: "x", responsible_entity_id: other.userId });
    expect(r.ok).toBe(false); if (!r.ok) expect(r.code).toBe("OTZAR_OBLIGATION_INVALID_REFERENCE");
  });

  it("[H] invalid content: a forbidden secret-bearing key in details is rejected", async () => {
    const { auth, otzar } = makeServices();
    const u = await orgUserWithTwin(auth);
    const r = await otzar.createObligation({ token: u.token, obligation_type: "FOLLOW_UP", title: "x", details: { note: "ok", api_token: "sk-123" } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("OTZAR_OBLIGATION_INVALID_INPUT");
  });

  it("cannot create directly in a terminal state (COMPLETED)", async () => {
    const { auth, otzar } = makeServices();
    const u = await orgUserWithTwin(auth);
    const r = await otzar.createObligation({ token: u.token, obligation_type: "FOLLOW_UP", title: "x", initial_state: "COMPLETED" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("OTZAR_OBLIGATION_INVALID_INPUT");
  });

  it("[C] audit failure on create is NOT swallowed — the obligation is rolled back", async () => {
    const { auth, otzar } = makeServices();
    const u = await orgUserWithTwin(auth);
    const before = await prisma.obligation.count({ where: { org_entity_id: u.orgId } });
    const res = await withAuditFailing(() => otzar.createObligation({ token: u.token, obligation_type: "FOLLOW_UP", title: "rolls back" }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("OTZAR_OBLIGATION_AUDIT_UNCOMMITTED");
    expect(await prisma.obligation.count({ where: { org_entity_id: u.orgId } })).toBe(before); // nothing persisted
  });

  it("[C] audit failure on a transition rolls back (state + version unchanged); retry succeeds with exactly one audit; stale retry is a no-op", async () => {
    const { auth, otzar } = makeServices();
    const u = await orgUserWithTwin(auth);
    const o = await otzar.createObligation({ token: u.token, obligation_type: "FOLLOW_UP", title: "cancel me" });
    if (!o.ok) throw new Error();
    const failed = await withAuditFailing(() => otzar.transitionObligation({ token: u.token, obligation_id: o.obligation.obligation_id, expected_version: o.obligation.version, transition: "cancel" }));
    expect(failed.ok).toBe(false);
    if (!failed.ok) expect(failed.code).toBe("OTZAR_OBLIGATION_AUDIT_UNCOMMITTED");
    // ROLLBACK proof: state + version unchanged.
    let row = await prisma.obligation.findUnique({ where: { obligation_id: o.obligation.obligation_id } });
    expect(row!.state).toBe(o.obligation.state);
    expect(row!.version).toBe(o.obligation.version);
    // Retry with the SAME expected_version now succeeds.
    const ok = await otzar.transitionObligation({ token: u.token, obligation_id: o.obligation.obligation_id, expected_version: o.obligation.version, transition: "cancel" });
    expect(ok.ok).toBe(true);
    row = await prisma.obligation.findUnique({ where: { obligation_id: o.obligation.obligation_id } });
    expect(row!.state).toBe("CANCELLED");
    // Exactly ONE audit for this obligation's cancellation (the failed attempt wrote none).
    const audits = await prisma.auditEvent.findMany({ where: { event_type: "OBLIGATION_CANCELLED", details: { path: ["obligation_id"], equals: o.obligation.obligation_id } } });
    expect(audits.length).toBe(1);
    // Duplicate retry with the stale version → no second transition (version CAS gives idempotency).
    const dup = await otzar.transitionObligation({ token: u.token, obligation_id: o.obligation.obligation_id, expected_version: o.obligation.version, transition: "cancel" });
    expect(dup.ok).toBe(false);
  });

  it("survival + restoration: obligations persist across a source-thread delete and a fresh login", async () => {
    const { auth, otzar } = makeServices();
    const u = await orgUserWithTwin(auth);
    const convId = await seedConversation(u);
    const o = await otzar.createObligation({ token: u.token, obligation_type: "QUESTION_RESPONSE", title: "Survives", conversation_id: convId, initial_state: "AWAITING_RESPONSE" });
    if (!o.ok) throw new Error();
    await markThreadDeleted(convId, { org_entity_id: u.orgId, subject_entity_id: u.userId, twin_entity_id: u.twinId });
    const login2 = (await auth.login(u.email, u.password, ["read", "write"], { ip_address: null })) as LoginResult;
    if (!login2.ok) throw new Error();
    const list = await otzar.listObligations({ token: login2.token, open_only: true });
    expect(list.ok).toBe(true);
    if (list.ok) expect(list.obligations.map((x) => x.obligation_id)).toContain(o.obligation.obligation_id);
  });

  it("correction after acknowledgement: an acknowledged obligation can still be superseded", async () => {
    const { auth, otzar } = makeServices();
    const u = await orgUserWithTwin(auth);
    const convId = await seedConversation(u);
    const led = await seedLedger(u, "NEEDS_CALLER_CONFIRMATION");
    const o = await otzar.createObligation({ token: u.token, obligation_type: "ACTION_CONFIRMATION", title: "Book 2pm", conversation_id: convId, action_ref: led, initial_state: "AWAITING_RESPONSE" });
    if (!o.ok) throw new Error();
    const ack = await otzar.acknowledgeObligation({ token: u.token, obligation_id: o.obligation.obligation_id, expected_version: o.obligation.version, acknowledged_turn_id: await seedTurn(u, convId, "USER") });
    if (!ack.ok) throw new Error();
    const superseded = await otzar.supersedeObligation({ token: u.token, obligation_id: o.obligation.obligation_id, expected_version: ack.obligation.version, replacement: { obligation_type: "ACTION_CONFIRMATION", title: "Book 3pm instead", initial_state: "AWAITING_RESPONSE" } });
    expect(superseded.ok).toBe(true);
    if (superseded.ok) expect(superseded.obligation.state).toBe("SUPERSEDED");
  });

  it("§8 projection — awaiting-confirmation: derives from an EXISTING NEEDS_CALLER_CONFIRMATION ledger; idempotent; null-owner NOT projectable; foreign refused", async () => {
    const { auth, otzar } = makeServices();
    const u = await orgUserWithTwin(auth);
    const ledger = await seedLedger(u, "NEEDS_CALLER_CONFIRMATION");
    const first = await otzar.projectAwaitingConfirmationObligation({ token: u.token, ledger_entry_id: ledger });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.created).toBe(true);
    expect(first.obligation.has_action).toBe(true);
    expect((await prisma.obligation.findUnique({ where: { obligation_id: first.obligation.obligation_id } }))!.action_ref).toBe(ledger);
    const again = await otzar.projectAwaitingConfirmationObligation({ token: u.token, ledger_entry_id: ledger });
    if (!again.ok) throw new Error();
    expect(again.created).toBe(false);
    expect(again.obligation.obligation_id).toBe(first.obligation.obligation_id);
    // [G] a null-owner ledger is NOT projectable.
    const nullOwner = await seedLedger(u, "NEEDS_CALLER_CONFIRMATION", null);
    expect((await otzar.projectAwaitingConfirmationObligation({ token: u.token, ledger_entry_id: nullOwner })).ok).toBe(false);
    // foreign caller cannot project another subject's ledger.
    const other = await orgUserWithTwin(auth);
    expect((await otzar.projectAwaitingConfirmationObligation({ token: other.token, ledger_entry_id: ledger })).ok).toBe(false);
  });

  it("§8 projection — unresolved question: derives a QUESTION_RESPONSE obligation from a coherent COMPLETED CLARIFICATION request; idempotent", async () => {
    const { auth, otzar } = makeServices();
    const u = await orgUserWithTwin(auth);
    const { requestId, asstTurn } = await seedClarification(u);
    const first = await otzar.projectUnresolvedQuestionObligation({ token: u.token, request_record_id: requestId });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.created).toBe(true);
    expect(first.obligation.obligation_type).toBe("QUESTION_RESPONSE");
    expect(first.obligation.source_turn_id).toBe(asstTurn);
    const again = await otzar.projectUnresolvedQuestionObligation({ token: u.token, request_record_id: requestId });
    if (again.ok) expect(again.obligation.obligation_id).toBe(first.obligation.obligation_id);
  });

  it("[G] unresolved-question projection: incoherent canonical / wrong state / wrong class do NOT project", async () => {
    const { auth, otzar } = makeServices();
    const u = await orgUserWithTwin(auth);
    // not COMPLETED
    let s = await seedClarification(u, { state: "PROCESSING" });
    expect((await otzar.projectUnresolvedQuestionObligation({ token: u.token, request_record_id: s.requestId })).ok).toBe(false);
    // not CLARIFICATION
    s = await seedClarification(u, { responseClass: "ANSWERED" });
    expect((await otzar.projectUnresolvedQuestionObligation({ token: u.token, request_record_id: s.requestId })).ok).toBe(false);
    // canonical role USER (not ASSISTANT)
    s = await seedClarification(u, { canonicalRole: "USER" });
    expect((await otzar.projectUnresolvedQuestionObligation({ token: u.token, request_record_id: s.requestId })).ok).toBe(false);
    // canonical response_to_turn_id points at a DIFFERENT user turn
    s = await seedClarification(u, { wrongResponseTo: true });
    expect((await otzar.projectUnresolvedQuestionObligation({ token: u.token, request_record_id: s.requestId })).ok).toBe(false);
    // missing canonical
    s = await seedClarification(u, { noCanonical: true });
    expect((await otzar.projectUnresolvedQuestionObligation({ token: u.token, request_record_id: s.requestId })).ok).toBe(false);
  });
});

/** Seed a COMPLETED CLARIFICATION request with a coherent (or deliberately incoherent) canonical
 *  assistant turn, for the unresolved-question projection tests. */
async function seedClarification(
  u: OrgUser,
  opts: { state?: string; responseClass?: string; canonicalRole?: "USER" | "ASSISTANT"; wrongResponseTo?: boolean; noCanonical?: boolean } = {},
): Promise<{ requestId: string; asstTurn: string | null }> {
  const convId = await seedConversation(u);
  const userTurnId = await seedTurn(u, convId, "USER", "what should I do?");
  let asstTurn: string | null = null;
  if (opts.noCanonical !== true) {
    const t = await prisma.otzarConversationTurn.create({
      data: {
        conversation_id: convId, org_entity_id: u.orgId, subject_entity_id: u.userId, author_entity_id: u.twinId, twin_entity_id: u.twinId,
        role: opts.canonicalRole ?? "ASSISTANT", content: "Which vendor — Acme or Globex?", content_hash: "q" + randomUUID(),
        sequence: Math.floor(Math.random() * 1_000_000) + 1, source_channel: "CHAT",
        response_to_turn_id: opts.wrongResponseTo === true ? await seedTurn(u, convId, "USER", "unrelated") : userTurnId,
      },
      select: { turn_id: true },
    });
    asstTurn = t.turn_id;
  }
  const req = await prisma.otzarConversationRequest.create({
    data: {
      conversation_id: convId, user_turn_id: userTurnId, org_entity_id: u.orgId, subject_entity_id: u.userId, twin_entity_id: u.twinId,
      content_hash: "c" + randomUUID(), state: opts.state ?? "COMPLETED", response_class: opts.responseClass ?? "CLARIFICATION",
      ...(asstTurn !== null ? { canonical_assistant_turn_id: asstTurn } : {}),
    },
    select: { request_record_id: true },
  });
  return { requestId: req.request_record_id, asstTurn };
}
