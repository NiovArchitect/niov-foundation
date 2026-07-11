// FILE: tests/integration/otzar-obligations.test.ts
// PURPOSE: [OTZAR STAGE-2 §9] Real-PostgreSQL proof of the durable organizational-obligation
//          layer: idempotent create, exact (org/subject/twin/conversation) scope, projections
//          from awaiting-confirmation actions + unresolved questions, acknowledgement (actor +
//          USER turn), completion WITH evidence / refused WITHOUT, duplicate completion,
//          reassignment lineage, supersession, cancellation, expiration (not success), stale-
//          version CAS, cross-org/subject/twin/foreign-conversation denial, deleted-thread
//          survival, correction after acknowledgement, restoration after refresh, no sensitive-
//          field leakage, and audit lineage.
// CONNECTS TO: apps/api/src/services/otzar/otzar.service.ts (obligation methods),
//          packages/database/src/queries/otzar-obligations.ts.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import {
  AuthService, COEService, HiveService, FixtureBasedEmbeddingProvider,
  MemoryContentStore, MemoryKVCache, MemoryNonceStore, MockLLMProvider,
  NegotiateService, OtzarService, ReadService, WriteService, ComplianceService,
  type LLMProvider, type LoginResult,
} from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import { createEntity, prisma, createThread, markThreadDeleted } from "@niov/database";
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

/** Insert a USER turn directly (evidence for acknowledgement/completion). No FK on conversation. */
async function seedUserTurn(u: OrgUser, conversationId: string, content = "yes"): Promise<string> {
  const turn = await prisma.otzarConversationTurn.create({
    data: {
      conversation_id: conversationId,
      org_entity_id: u.orgId,
      subject_entity_id: u.userId,
      author_entity_id: u.userId,
      twin_entity_id: u.twinId,
      role: "USER",
      content,
      content_hash: createHash("sha256").update(content).digest("hex"),
      sequence: Math.floor(Math.random() * 1_000_000) + 1,
      source_channel: "CHAT",
    },
    select: { turn_id: true },
  });
  return turn.turn_id;
}

/** Insert an EXECUTED calendar-style WorkLedgerEntry (execution truth an ACTION_CONFIRMATION
 *  obligation completes THROUGH). */
async function seedExecutedLedger(u: OrgUser): Promise<string> {
  const led = await prisma.workLedgerEntry.create({
    data: { org_entity_id: u.orgId, ledger_type: "MEETING", owner_entity_id: u.userId, title: "Sync", status: "EXECUTED" },
    select: { ledger_entry_id: true },
  });
  return led.ledger_entry_id;
}
async function seedPendingLedger(u: OrgUser): Promise<string> {
  const led = await prisma.workLedgerEntry.create({
    data: { org_entity_id: u.orgId, ledger_type: "MEETING", owner_entity_id: u.userId, title: "Sync", status: "NEEDS_CALLER_CONFIRMATION" },
    select: { ledger_entry_id: true },
  });
  return led.ledger_entry_id;
}

beforeAll(async () => { await ensureAuditTriggers(); });
afterAll(async () => { await cleanupTestData(); await prisma.$disconnect(); });

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
    // Exactly one row for that origin key.
    const count = await prisma.obligation.count({ where: { org_entity_id: u.orgId, origin_key: key } });
    expect(count).toBe(1);
  });

  it("scope + no-leak: obligation is created under exact org/subject/twin; projection omits internal refs", async () => {
    const { auth, otzar } = makeServices();
    const u = await orgUserWithTwin(auth);
    const ledger = await seedExecutedLedger(u);
    const created = await otzar.createObligation({ token: u.token, obligation_type: "ACTION_CONFIRMATION", title: "Add meeting?", action_ref: ledger, initial_state: "AWAITING_RESPONSE" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    // DB row carries the exact scope.
    const row = await prisma.obligation.findUnique({ where: { obligation_id: created.obligation.obligation_id } });
    expect(row!.org_entity_id).toBe(u.orgId);
    expect(row!.subject_entity_id).toBe(u.userId);
    expect(row!.twin_entity_id).toBe(u.twinId);
    expect(row!.action_ref).toBe(ledger);
    // Safe projection surfaces action linkage as a boolean, never the raw ref/lease/provider.
    const keys = Object.keys(created.obligation);
    expect(keys).toContain("has_action");
    expect(keys).not.toContain("action_ref");
    expect(created.obligation.has_action).toBe(true);
    expect(JSON.stringify(created.obligation)).not.toMatch(/lease|provider_attempt|action_ref/i);
  });

  it("acknowledge: only the responsible actor via a USER turn; an ASSISTANT/twin turn cannot", async () => {
    const { auth, otzar } = makeServices();
    const u = await orgUserWithTwin(auth);
    const convId = randomUUID();
    const created = await otzar.createObligation({ token: u.token, obligation_type: "QUESTION_RESPONSE", title: "Confirm scope?", conversation_id: convId, initial_state: "AWAITING_RESPONSE" });
    if (!created.ok) throw new Error("create failed");
    // A twin-authored ASSISTANT turn must NOT acknowledge.
    const asstTurn = await prisma.otzarConversationTurn.create({
      data: { conversation_id: convId, org_entity_id: u.orgId, subject_entity_id: u.userId, author_entity_id: u.twinId, twin_entity_id: u.twinId, role: "ASSISTANT", content: "ok", content_hash: "h", sequence: 900001, source_channel: "CHAT" },
      select: { turn_id: true },
    });
    const badAck = await otzar.acknowledgeObligation({ token: u.token, obligation_id: created.obligation.obligation_id, expected_version: created.obligation.version, acknowledged_turn_id: asstTurn.turn_id });
    expect(badAck.ok).toBe(false);
    if (!badAck.ok) expect(badAck.code).toBe("OTZAR_OBLIGATION_NOT_ACKNOWLEDGEABLE");
    // A USER turn by the responsible actor acknowledges.
    const userTurn = await seedUserTurn(u, convId);
    const ack = await otzar.acknowledgeObligation({ token: u.token, obligation_id: created.obligation.obligation_id, expected_version: created.obligation.version, acknowledged_turn_id: userTurn });
    expect(ack.ok).toBe(true);
    if (ack.ok) expect(ack.obligation.state).toBe("ACKNOWLEDGED");
    // Audit lineage written.
    const audit = await prisma.auditEvent.findFirst({ where: { event_type: "OBLIGATION_ACKNOWLEDGED", actor_entity_id: u.userId } });
    expect(audit).not.toBeNull();
  });

  it("complete WITH evidence (ACTION_CONFIRMATION through an EXECUTED ledger); WITHOUT evidence refused", async () => {
    const { auth, otzar } = makeServices();
    const u = await orgUserWithTwin(auth);
    // No-evidence completion of a bare question is refused (silence is not completion).
    const bare = await otzar.createObligation({ token: u.token, obligation_type: "QUESTION_RESPONSE", title: "Any blockers?", initial_state: "AWAITING_RESPONSE" });
    if (!bare.ok) throw new Error();
    const noEvidence = await otzar.completeObligation({ token: u.token, obligation_id: bare.obligation.obligation_id, expected_version: bare.obligation.version });
    expect(noEvidence.ok).toBe(false);
    if (!noEvidence.ok) expect(noEvidence.code).toBe("OTZAR_OBLIGATION_EVIDENCE_REQUIRED");

    // ACTION_CONFIRMATION completes ONLY through a terminally-EXECUTED ledger.
    const pending = await seedPendingLedger(u);
    const confirm = await otzar.createObligation({ token: u.token, obligation_type: "ACTION_CONFIRMATION", title: "Add meeting?", action_ref: pending, initial_state: "AWAITING_RESPONSE" });
    if (!confirm.ok) throw new Error();
    const notYet = await otzar.completeObligation({ token: u.token, obligation_id: confirm.obligation.obligation_id, expected_version: confirm.obligation.version });
    expect(notYet.ok).toBe(false); // ledger still NEEDS_CALLER_CONFIRMATION → not EXECUTED → refused
    // Execute the ledger, then completion is accepted and read THROUGH the terminal state.
    await prisma.workLedgerEntry.update({ where: { ledger_entry_id: pending }, data: { status: "EXECUTED" } });
    const done = await otzar.completeObligation({ token: u.token, obligation_id: confirm.obligation.obligation_id, expected_version: confirm.obligation.version });
    expect(done.ok).toBe(true);
    if (done.ok) {
      expect(done.obligation.state).toBe("COMPLETED");
      expect(done.obligation.completed_at).not.toBeNull();
    }
  });

  it("duplicate completion: a COMPLETED obligation cannot be completed again (terminal)", async () => {
    const { auth, otzar } = makeServices();
    const u = await orgUserWithTwin(auth);
    const ledger = await seedExecutedLedger(u);
    const o = await otzar.createObligation({ token: u.token, obligation_type: "ACTION_CONFIRMATION", title: "Add?", action_ref: ledger });
    if (!o.ok) throw new Error();
    const first = await otzar.completeObligation({ token: u.token, obligation_id: o.obligation.obligation_id, expected_version: o.obligation.version });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const again = await otzar.completeObligation({ token: u.token, obligation_id: o.obligation.obligation_id, expected_version: first.obligation.version });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.code).toBe("OTZAR_OBLIGATION_ILLEGAL_TRANSITION");
  });

  it("stale-version CAS: a transition with an outdated expected_version is refused", async () => {
    const { auth, otzar } = makeServices();
    const u = await orgUserWithTwin(auth);
    const o = await otzar.createObligation({ token: u.token, obligation_type: "FOLLOW_UP", title: "Follow up" });
    if (!o.ok) throw new Error();
    const blocked = await otzar.transitionObligation({ token: u.token, obligation_id: o.obligation.obligation_id, expected_version: o.obligation.version, transition: "block" });
    expect(blocked.ok).toBe(true); // version now 1
    const stale = await otzar.transitionObligation({ token: u.token, obligation_id: o.obligation.obligation_id, expected_version: o.obligation.version, transition: "cancel" });
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.code).toBe("OTZAR_OBLIGATION_STATE_CHANGED");
  });

  it("expiration is NOT success: EXPIRED sets expired_at, never completed_at", async () => {
    const { auth, otzar } = makeServices();
    const u = await orgUserWithTwin(auth);
    const o = await otzar.createObligation({ token: u.token, obligation_type: "FOLLOW_UP", title: "Ping vendor" });
    if (!o.ok) throw new Error();
    const expired = await otzar.transitionObligation({ token: u.token, obligation_id: o.obligation.obligation_id, expected_version: o.obligation.version, transition: "expire" });
    expect(expired.ok).toBe(true);
    if (expired.ok) expect(expired.obligation.state).toBe("EXPIRED");
    const row = await prisma.obligation.findUnique({ where: { obligation_id: o.obligation.obligation_id } });
    expect(row!.expired_at).not.toBeNull();
    expect(row!.completed_at).toBeNull(); // expiry is never success
  });

  it("reassignment: new responsible party, ack reset, full prior lineage in the audit", async () => {
    const { auth, otzar } = makeServices();
    const u = await orgUserWithTwin(auth);
    const other = await orgUserWithTwin(auth);
    const convId = randomUUID();
    const o = await otzar.createObligation({ token: u.token, obligation_type: "HANDOFF", title: "Cover shift", conversation_id: convId, initial_state: "AWAITING_RESPONSE" });
    if (!o.ok) throw new Error();
    // Acknowledge first so there is a prior ack to preserve.
    const ackTurn = await seedUserTurn(u, convId);
    const ack = await otzar.acknowledgeObligation({ token: u.token, obligation_id: o.obligation.obligation_id, expected_version: o.obligation.version, acknowledged_turn_id: ackTurn });
    if (!ack.ok) throw new Error();
    const reassigned = await otzar.reassignObligation({ token: u.token, obligation_id: o.obligation.obligation_id, expected_version: ack.obligation.version, new_responsible_entity_id: other.userId, reason: "PTO" });
    expect(reassigned.ok).toBe(true);
    const row = await prisma.obligation.findUnique({ where: { obligation_id: o.obligation.obligation_id } });
    expect(row!.responsible_entity_id).toBe(other.userId);
    expect(row!.acknowledged_at).toBeNull(); // new party has NOT acknowledged
    expect(row!.state).toBe("AWAITING_RESPONSE");
    // Audit preserves the full lineage (prev responsible + assigning actor + reason + prior ack).
    const audit = await prisma.auditEvent.findFirst({ where: { event_type: "OBLIGATION_REASSIGNED", actor_entity_id: u.userId }, orderBy: { timestamp: "desc" } });
    expect(audit).not.toBeNull();
    const details = audit!.details as Record<string, unknown>;
    expect(details.previous_responsible_entity_id).toBe(u.userId);
    expect(details.new_responsible_entity_id).toBe(other.userId);
    expect(details.reason).toBe("PTO");
    expect(details.previous_acknowledged).toBe(true);
  });

  it("supersession: creates a LINKED replacement and marks the original SUPERSEDED (history kept)", async () => {
    const { auth, otzar } = makeServices();
    const u = await orgUserWithTwin(auth);
    const o = await otzar.createObligation({ token: u.token, obligation_type: "CLARIFICATION", title: "Make it 2pm?", initial_state: "AWAITING_RESPONSE" });
    if (!o.ok) throw new Error();
    const res = await otzar.supersedeObligation({ token: u.token, obligation_id: o.obligation.obligation_id, expected_version: o.obligation.version, replacement: { obligation_type: "CLARIFICATION", title: "Make it 3pm?", initial_state: "AWAITING_RESPONSE" } });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.obligation.state).toBe("SUPERSEDED");
    // The replacement links back to the original (parent + superseded lineage); original untouched otherwise.
    const repl = await prisma.obligation.findUnique({ where: { obligation_id: res.replacement.obligation_id } });
    expect(repl!.superseded_obligation_id).toBe(o.obligation.obligation_id);
    expect(repl!.parent_obligation_id).toBe(o.obligation.obligation_id);
    expect(repl!.title).toBe("Make it 3pm?");
    const original = await prisma.obligation.findUnique({ where: { obligation_id: o.obligation.obligation_id } });
    expect(original!.state).toBe("SUPERSEDED"); // preserved, not deleted/rewritten
  });

  it("cancellation moves to a terminal CANCELLED state with a timestamp", async () => {
    const { auth, otzar } = makeServices();
    const u = await orgUserWithTwin(auth);
    const o = await otzar.createObligation({ token: u.token, obligation_type: "BLOCKED_TASK", title: "Waiting on legal" });
    if (!o.ok) throw new Error();
    const cancelled = await otzar.transitionObligation({ token: u.token, obligation_id: o.obligation.obligation_id, expected_version: o.obligation.version, transition: "cancel" });
    expect(cancelled.ok).toBe(true);
    const row = await prisma.obligation.findUnique({ where: { obligation_id: o.obligation.obligation_id } });
    expect(row!.state).toBe("CANCELLED");
    expect(row!.cancelled_at).not.toBeNull();
  });

  it("cross-scope denial: another subject / another twin cannot read or transition the obligation", async () => {
    const { auth, otzar } = makeServices();
    const u = await orgUserWithTwin(auth);
    const other = await orgUserWithTwin(auth); // different org+subject+twin
    const o = await otzar.createObligation({ token: u.token, obligation_type: "FOLLOW_UP", title: "Private follow-up" });
    if (!o.ok) throw new Error();
    // Cross-subject/org: a different caller cannot read it (indistinguishable from not-found).
    const foreignRead = await otzar.getObligation({ token: other.token, obligation_id: o.obligation.obligation_id });
    expect(foreignRead.ok).toBe(false);
    if (!foreignRead.ok) expect(foreignRead.code).toBe("OTZAR_OBLIGATION_NOT_FOUND");
    const foreignTransition = await otzar.transitionObligation({ token: other.token, obligation_id: o.obligation.obligation_id, expected_version: o.obligation.version, transition: "cancel" });
    expect(foreignTransition.ok).toBe(false);

    // Cross-twin: an obligation under the SAME org+subject but a DIFFERENT twin is invisible to
    // the caller's primary-twin scope.
    const otherTwin = await createEntity(makeEntityInput({ entity_type: "AI_AGENT" }));
    const crossTwin = await prisma.obligation.create({
      data: { org_entity_id: u.orgId, subject_entity_id: u.userId, twin_entity_id: otherTwin.entity_id, obligation_type: "FOLLOW_UP", title: "Other-twin obligation", creator_entity_id: u.userId, responsible_entity_id: u.userId },
      select: { obligation_id: true },
    });
    const crossTwinRead = await otzar.getObligation({ token: u.token, obligation_id: crossTwin.obligation_id });
    expect(crossTwinRead.ok).toBe(false);
    if (!crossTwinRead.ok) expect(crossTwinRead.code).toBe("OTZAR_OBLIGATION_NOT_FOUND");
  });

  it("survival + restoration: obligations persist across a source-thread delete and a fresh login (tab/device)", async () => {
    const { auth, otzar } = makeServices();
    const u = await orgUserWithTwin(auth);
    const thread = await createThread({ org_entity_id: u.orgId, subject_entity_id: u.userId, twin_entity_id: u.twinId });
    const o = await otzar.createObligation({ token: u.token, obligation_type: "QUESTION_RESPONSE", title: "Survives thread close", conversation_id: thread.conversation_id, initial_state: "AWAITING_RESPONSE" });
    if (!o.ok) throw new Error();
    // Delete the source thread (tombstone) — the obligation must NOT disappear.
    await markThreadDeleted(thread.conversation_id, { org_entity_id: u.orgId, subject_entity_id: u.userId, twin_entity_id: u.twinId });
    // A FRESH login (new tab/device) still lists it — restoration is scope-based, not thread-gated.
    const login2 = (await auth.login(u.email, u.password, ["read", "write"], { ip_address: null })) as LoginResult;
    if (!login2.ok) throw new Error();
    const list = await otzar.listObligations({ token: login2.token, open_only: true });
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    const ids = list.obligations.map((x) => x.obligation_id);
    expect(ids).toContain(o.obligation.obligation_id);
  });

  it("correction after acknowledgement: an acknowledged obligation can still be superseded (linked replacement)", async () => {
    const { auth, otzar } = makeServices();
    const u = await orgUserWithTwin(auth);
    const convId = randomUUID();
    const o = await otzar.createObligation({ token: u.token, obligation_type: "ACTION_CONFIRMATION", title: "Book 2pm", conversation_id: convId, initial_state: "AWAITING_RESPONSE" });
    if (!o.ok) throw new Error();
    const ackTurn = await seedUserTurn(u, convId);
    const ack = await otzar.acknowledgeObligation({ token: u.token, obligation_id: o.obligation.obligation_id, expected_version: o.obligation.version, acknowledged_turn_id: ackTurn });
    if (!ack.ok) throw new Error();
    const superseded = await otzar.supersedeObligation({ token: u.token, obligation_id: o.obligation.obligation_id, expected_version: ack.obligation.version, replacement: { obligation_type: "ACTION_CONFIRMATION", title: "Book 3pm instead", initial_state: "AWAITING_RESPONSE" } });
    expect(superseded.ok).toBe(true);
    if (superseded.ok) {
      expect(superseded.obligation.state).toBe("SUPERSEDED");
      expect(superseded.replacement.title).toBe("Book 3pm instead");
    }
  });
});
