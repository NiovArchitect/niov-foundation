// FILE: tests/integration/otzar-handoffs.test.ts
// PURPOSE: [OTZAR STAGE-2 §L] Real-PostgreSQL proof of the governed handoff layer: MULTI-PARTY
//          scoping (the receiver sees what was sent), party-authorized transitions, incoming-party
//          acknowledgement via a real USER turn (a sent handoff is NOT acknowledged), completion
//          GATED on ack + all linked obligations disposed, atomic audit (rollback on audit
//          failure), idempotency, stale-version CAS, and cross-party scope denial.
// CONNECTS TO: apps/api/src/services/otzar/otzar.service.ts, packages/database/src/queries/otzar-handoffs.ts.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import {
  AuthService, COEService, HiveService, FixtureBasedEmbeddingProvider,
  MemoryContentStore, MemoryKVCache, MemoryNonceStore, MockLLMProvider,
  NegotiateService, OtzarService, ReadService, WriteService, ComplianceService,
  type LLMProvider, type LoginResult,
} from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import { createEntity, prisma, __otzarHandoffTestHooks } from "@niov/database";
import { cleanupTestData, ensureAuditTriggers, makeEntityInput } from "../helpers.js";

const TEST_JWT_SECRET = "otzar-handoffs-test-secret";
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

/** An org with a twin + a member user (the outgoing party). */
async function orgWithUser(auth: AuthService): Promise<{ orgId: string; token: string; userId: string; twinId: string }> {
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
  return { orgId: org.entity_id, token: login.token, userId: user.entity_id, twinId: twin.entity_id };
}

/** A second member of an existing org (the incoming party) with a login token + its own twin. */
async function memberOf(auth: AuthService, orgId: string): Promise<{ token: string; userId: string }> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const user = await createEntity(input);
  await prisma.entityMembership.create({ data: { parent_id: orgId, child_id: user.entity_id, is_active: true } });
  const twin = await createEntity(makeEntityInput({ entity_type: "AI_AGENT" }));
  await prisma.entityMembership.create({ data: { parent_id: user.entity_id, child_id: twin.entity_id, role_title: "Digital Twin", is_active: true } });
  await prisma.twinConfig.create({ data: { twin_id: twin.entity_id, autonomy_level: "APPROVAL_REQUIRED", is_admin_twin: false, role_template: null } });
  const login = (await auth.login(input.email!, password, ["read", "write"], { ip_address: null })) as LoginResult;
  if (!login.ok) throw new Error("login failed");
  return { token: login.token, userId: user.entity_id };
}

async function seedUserTurn(orgId: string, userId: string): Promise<string> {
  const t = await prisma.otzarConversationTurn.create({
    data: { conversation_id: randomUUID(), org_entity_id: orgId, subject_entity_id: userId, author_entity_id: userId, role: "USER", content: "ack", content_hash: createHash("sha256").update(randomUUID()).digest("hex"), sequence: Math.floor(Math.random() * 1_000_000) + 1, source_channel: "CHAT" },
    select: { turn_id: true },
  });
  return t.turn_id;
}

async function seedObligation(orgId: string, subjectId: string, twinId: string): Promise<string> {
  const o = await prisma.obligation.create({ data: { org_entity_id: orgId, subject_entity_id: subjectId, twin_entity_id: twinId, obligation_type: "FOLLOW_UP", title: "carry me", creator_entity_id: subjectId, responsible_entity_id: subjectId, state: "OPEN" }, select: { obligation_id: true } });
  return o.obligation_id;
}

async function withHandoffAuditFailing<T>(fn: () => Promise<T>): Promise<T> {
  __otzarHandoffTestHooks.failAudit = true;
  try { return await fn(); } finally { __otzarHandoffTestHooks.failAudit = false; }
}

beforeAll(async () => { await ensureAuditTriggers(); });
afterAll(async () => { __otzarHandoffTestHooks.failAudit = false; await cleanupTestData(); await prisma.$disconnect(); });

describe("Otzar handoffs (Stage-2 §L)", () => {
  it("create (DRAFTED) + idempotency; outgoing must be the caller", async () => {
    const { auth, otzar } = makeServices();
    const a = await orgWithUser(auth);
    const key = `handoff:${randomUUID()}`;
    const first = await otzar.createHandoff({ token: a.token, title: "Night shift", origin_key: key });
    const second = await otzar.createHandoff({ token: a.token, title: "Night shift", origin_key: key });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.handoff.handoff_id).toBe(first.handoff.handoff_id);
    expect(first.handoff.state).toBe("DRAFTED");
    expect(first.handoff.caller_is_outgoing).toBe(true);
  });

  it("MULTI-PARTY read: the incoming party sees a SENT handoff; a non-party does not", async () => {
    const { auth, otzar } = makeServices();
    const a = await orgWithUser(auth);          // outgoing
    const b = await memberOf(auth, a.orgId);    // incoming
    const c = await memberOf(auth, a.orgId);    // uninvolved co-member
    const h = await otzar.createHandoff({ token: a.token, title: "Handoff to B", incoming_responsible_entity_id: b.userId });
    if (!h.ok) throw new Error();
    // Before send, B cannot see it (not yet a party by the read rule? B IS incoming already set) —
    // B is incoming from creation, so B can read it even in DRAFTED. Confirm.
    expect((await otzar.getHandoff({ token: b.token, handoff_id: h.handoff.handoff_id })).ok).toBe(true);
    // Send it.
    const sent = await otzar.transitionHandoff({ token: a.token, handoff_id: h.handoff.handoff_id, expected_version: h.handoff.version, transition: "send" });
    expect(sent.ok).toBe(true);
    // Incoming B reads it (the whole point of multi-party scoping).
    const bRead = await otzar.getHandoff({ token: b.token, handoff_id: h.handoff.handoff_id });
    expect(bRead.ok).toBe(true);
    if (bRead.ok) expect(bRead.handoff.caller_is_incoming).toBe(true);
    // Uninvolved co-member C cannot read it.
    const cRead = await otzar.getHandoff({ token: c.token, handoff_id: h.handoff.handoff_id });
    expect(cRead.ok).toBe(false);
    if (!cRead.ok) expect(cRead.code).toBe("OTZAR_HANDOFF_NOT_FOUND");
    // B lists incoming; sees it. A lists outgoing; sees it.
    const bList = await otzar.listHandoffs({ token: b.token, role: "incoming" });
    expect(bList.ok && bList.handoffs.some((x) => x.handoff_id === h.handoff.handoff_id)).toBe(true);
  });

  it("party authority + acknowledgement: outgoing cannot acknowledge; incoming acknowledges only via a real USER turn (a sent handoff is NOT acknowledged)", async () => {
    const { auth, otzar } = makeServices();
    const a = await orgWithUser(auth);
    const b = await memberOf(auth, a.orgId);
    let h = (await otzar.createHandoff({ token: a.token, title: "H", incoming_responsible_entity_id: b.userId }));
    if (!h.ok) throw new Error();
    let ver = h.handoff.version;
    const sent = await otzar.transitionHandoff({ token: a.token, handoff_id: h.handoff.handoff_id, expected_version: ver, transition: "send" });
    if (!sent.ok) throw new Error();
    ver = sent.handoff.version;
    // The SENT handoff is NOT acknowledged.
    expect(sent.handoff.state).toBe("SENT");
    expect(sent.handoff.acknowledged_at).toBeNull();
    // Outgoing A cannot acknowledge.
    const aAck = await otzar.transitionHandoff({ token: a.token, handoff_id: h.handoff.handoff_id, expected_version: ver, transition: "acknowledge", acknowledged_turn_id: await seedUserTurn(a.orgId, a.userId) });
    expect(aAck.ok).toBe(false);
    if (!aAck.ok) expect(aAck.code).toBe("OTZAR_HANDOFF_NOT_AUTHORIZED");
    // Incoming B acknowledges via B's own USER turn.
    const bAck = await otzar.transitionHandoff({ token: b.token, handoff_id: h.handoff.handoff_id, expected_version: ver, transition: "acknowledge", acknowledged_turn_id: await seedUserTurn(a.orgId, b.userId) });
    expect(bAck.ok).toBe(true);
    if (bAck.ok) expect(bAck.handoff.state).toBe("ACKNOWLEDGED");
    expect(await prisma.auditEvent.findFirst({ where: { event_type: "HANDOFF_ACKNOWLEDGED", actor_entity_id: b.userId } })).not.toBeNull();
  });

  it("completion is GATED on ack + every linked obligation disposed", async () => {
    const { auth, otzar } = makeServices();
    const a = await orgWithUser(auth);
    const b = await memberOf(auth, a.orgId);
    const h = await otzar.createHandoff({ token: a.token, title: "H", incoming_responsible_entity_id: b.userId });
    if (!h.ok) throw new Error();
    // Link one of A's own obligations.
    const obId = await seedObligation(a.orgId, a.userId, a.twinId);
    expect((await otzar.linkHandoffObligation({ token: a.token, handoff_id: h.handoff.handoff_id, obligation_id: obId })).ok).toBe(true);
    let ver = h.handoff.version;
    ver = (await otzar.transitionHandoff({ token: a.token, handoff_id: h.handoff.handoff_id, expected_version: ver, transition: "send" }) as { ok: true; handoff: { version: number } }).handoff.version;
    // Cannot complete before ack.
    const early = await otzar.transitionHandoff({ token: b.token, handoff_id: h.handoff.handoff_id, expected_version: ver, transition: "complete" });
    expect(early.ok).toBe(false);
    const ack = await otzar.transitionHandoff({ token: b.token, handoff_id: h.handoff.handoff_id, expected_version: ver, transition: "acknowledge", acknowledged_turn_id: await seedUserTurn(a.orgId, b.userId) });
    if (!ack.ok) throw new Error();
    ver = ack.handoff.version;
    // Cannot complete while the linked obligation is PENDING disposition.
    const pending = await otzar.transitionHandoff({ token: b.token, handoff_id: h.handoff.handoff_id, expected_version: ver, transition: "complete" });
    expect(pending.ok).toBe(false);
    if (!pending.ok) expect(pending.code).toBe("OTZAR_HANDOFF_PRECONDITION");
    // Incoming B disposes the obligation (ACCEPTED), then completion succeeds.
    expect((await otzar.disposeHandoffObligation({ token: b.token, handoff_id: h.handoff.handoff_id, obligation_id: obId, disposition: "ACCEPTED" })).ok).toBe(true);
    const done = await otzar.transitionHandoff({ token: b.token, handoff_id: h.handoff.handoff_id, expected_version: ver, transition: "complete" });
    expect(done.ok).toBe(true);
    if (done.ok) { expect(done.handoff.state).toBe("COMPLETED"); expect(done.handoff.completed_at).not.toBeNull(); }
  });

  it("stale-version CAS: an outdated expected_version is refused", async () => {
    const { auth, otzar } = makeServices();
    const a = await orgWithUser(auth);
    const b = await memberOf(auth, a.orgId);
    const h = await otzar.createHandoff({ token: a.token, title: "H", incoming_responsible_entity_id: b.userId });
    if (!h.ok) throw new Error();
    expect((await otzar.transitionHandoff({ token: a.token, handoff_id: h.handoff.handoff_id, expected_version: h.handoff.version, transition: "ready" })).ok).toBe(true);
    const stale = await otzar.transitionHandoff({ token: a.token, handoff_id: h.handoff.handoff_id, expected_version: h.handoff.version, transition: "send" });
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.code).toBe("OTZAR_HANDOFF_STATE_CHANGED");
  });

  it("[atomic audit] audit failure on a transition rolls back (state + version unchanged); retry succeeds", async () => {
    const { auth, otzar } = makeServices();
    const a = await orgWithUser(auth);
    const b = await memberOf(auth, a.orgId);
    const h = await otzar.createHandoff({ token: a.token, title: "H", incoming_responsible_entity_id: b.userId });
    if (!h.ok) throw new Error();
    const failed = await withHandoffAuditFailing(() => otzar.transitionHandoff({ token: a.token, handoff_id: h.handoff.handoff_id, expected_version: h.handoff.version, transition: "send" }));
    expect(failed.ok).toBe(false);
    if (!failed.ok) expect(failed.code).toBe("OTZAR_HANDOFF_AUDIT_UNCOMMITTED");
    const row = await prisma.handoff.findUnique({ where: { handoff_id: h.handoff.handoff_id } });
    expect(row!.state).toBe("DRAFTED");
    expect(row!.version).toBe(h.handoff.version);
    expect((await otzar.transitionHandoff({ token: a.token, handoff_id: h.handoff.handoff_id, expected_version: h.handoff.version, transition: "send" })).ok).toBe(true);
  });

  it("supersede: outgoing creates a LINKED replacement, original SUPERSEDED", async () => {
    const { auth, otzar } = makeServices();
    const a = await orgWithUser(auth);
    const b = await memberOf(auth, a.orgId);
    const h = await otzar.createHandoff({ token: a.token, title: "v1", incoming_responsible_entity_id: b.userId });
    if (!h.ok) throw new Error();
    const res = await otzar.supersedeHandoff({ token: a.token, handoff_id: h.handoff.handoff_id, expected_version: h.handoff.version, replacement: { title: "v2" } });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.handoff.state).toBe("SUPERSEDED");
    const repl = await prisma.handoff.findUnique({ where: { handoff_id: res.replacement.handoff_id } });
    expect(repl!.superseded_handoff_id).toBe(h.handoff.handoff_id);
    expect(repl!.parent_handoff_id).toBe(h.handoff.handoff_id);
    expect(repl!.title).toBe("v2");
  });

  it("cross-party denial: a foreign org member cannot read or transition", async () => {
    const { auth, otzar } = makeServices();
    const a = await orgWithUser(auth);
    const foreign = await orgWithUser(auth); // different org
    const h = await otzar.createHandoff({ token: a.token, title: "H" });
    if (!h.ok) throw new Error();
    expect((await otzar.getHandoff({ token: foreign.token, handoff_id: h.handoff.handoff_id })).ok).toBe(false);
    expect((await otzar.transitionHandoff({ token: foreign.token, handoff_id: h.handoff.handoff_id, expected_version: h.handoff.version, transition: "ready" })).ok).toBe(false);
  });
});
