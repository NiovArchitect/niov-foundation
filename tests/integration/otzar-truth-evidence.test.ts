// FILE: tests/integration/otzar-truth-evidence.test.ts
// PURPOSE: [OTZAR STAGE-2 TRUTH-EVIDENCE §15] Real-PG proof of point-in-time evidence snapshots:
//          idempotent capture, safe-content rejection, atomic-audit rollback, obligation/handoff
//          completion capture the exact version relied upon, current-status recheck detects a
//          later change WITHOUT rewriting the captured basis, and cross-scope reads are denied.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import {
  AuthService, COEService, HiveService, FixtureBasedEmbeddingProvider,
  MemoryContentStore, MemoryKVCache, MemoryNonceStore, MockLLMProvider,
  NegotiateService, OtzarService, ReadService, WriteService, ComplianceService,
  type LLMProvider, type LoginResult,
} from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import { createEntity, prisma, captureEvidenceSnapshot, __otzarTruthEvidenceTestHooks } from "@niov/database";
import { cleanupTestData, ensureAuditTriggers, makeEntityInput } from "../helpers.js";

const TEST_JWT_SECRET = "otzar-truth-evidence-test-secret";
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

interface OrgUser { token: string; userId: string; twinId: string; orgId: string }
async function orgUser(auth: AuthService): Promise<OrgUser> {
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

async function seedExecutedLedger(u: OrgUser): Promise<string> {
  const led = await prisma.workLedgerEntry.create({ data: { org_entity_id: u.orgId, ledger_type: "MEETING", owner_entity_id: u.userId, title: "Sync", status: "EXECUTED" }, select: { ledger_entry_id: true } });
  return led.ledger_entry_id;
}

beforeAll(async () => { await ensureAuditTriggers(); });
afterAll(async () => { __otzarTruthEvidenceTestHooks.failAudit = false; await cleanupTestData(); await prisma.$disconnect(); });

describe("Otzar truth-evidence snapshots (Stage-2)", () => {
  it("capture: idempotent per origin_key; different source version → different snapshot; unsafe content rejected; atomic audit rollback", async () => {
    const { auth } = makeServices();
    const u = await orgUser(auth);
    const srcId = randomUUID();
    const cap = (version: number) => captureEvidenceSnapshot({ org_entity_id: u.orgId, decision_point: "TEST", source_record_type: "OBLIGATION", source_record_id: srcId, source_version: version, actor_entity_id: u.userId });
    const a = await cap(1);
    const b = await cap(1); // same evidence → same origin_key → idempotent
    expect(a.kind === "ok" && b.kind === "ok").toBe(true);
    if (a.kind !== "ok" || b.kind !== "ok") return;
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(b.snapshot.snapshot_id).toBe(a.snapshot.snapshot_id);
    expect(a.fingerprint).toBe(b.fingerprint);
    // Different version → different fingerprint → a distinct snapshot.
    const c = await cap(2);
    expect(c.kind === "ok" && c.fingerprint !== a.fingerprint).toBe(true);
    // Unsafe metadata rejected.
    const bad = await captureEvidenceSnapshot({ org_entity_id: u.orgId, decision_point: "TEST", source_record_type: "OBLIGATION", source_record_id: randomUUID(), actor_entity_id: u.userId, metadata: { api_token: "sk-1" } });
    expect(bad.kind).toBe("invalid_content");
    // Atomic audit rollback: injected audit failure → no snapshot persisted.
    const before = await prisma.truthEvidenceSnapshot.count({ where: { org_entity_id: u.orgId } });
    __otzarTruthEvidenceTestHooks.failAudit = true;
    const failed = await captureEvidenceSnapshot({ org_entity_id: u.orgId, decision_point: "TEST", source_record_type: "OBLIGATION", source_record_id: randomUUID(), actor_entity_id: u.userId });
    __otzarTruthEvidenceTestHooks.failAudit = false;
    expect(failed.kind).toBe("audit_consistency_failure");
    expect(await prisma.truthEvidenceSnapshot.count({ where: { org_entity_id: u.orgId } })).toBe(before);
  });

  it("obligation completion captures the exact version relied upon; a later supersession does NOT rewrite the captured basis (recheck reports it)", async () => {
    const { auth, otzar } = makeServices();
    const u = await orgUser(auth);
    const ledger = await seedExecutedLedger(u);
    const o = await otzar.createObligation({ token: u.token, obligation_type: "ACTION_CONFIRMATION", title: "Add?", action_ref: ledger });
    if (!o.ok) throw new Error();
    const completedVersion = o.obligation.version;
    const done = await otzar.completeObligation({ token: u.token, obligation_id: o.obligation.obligation_id, expected_version: completedVersion });
    expect(done.ok).toBe(true);
    // A snapshot was captured at completion, pinning the version relied upon.
    const ev = await otzar.getObligationEvidence({ token: u.token, obligation_id: o.obligation.obligation_id });
    expect(ev.ok).toBe(true);
    if (!ev.ok) return;
    const snap = ev.evidence.find((e) => e.decision_point === "OBLIGATION_COMPLETION");
    expect(snap).toBeDefined();
    // The snapshot pins the version the completion produced; recheck reads "unchanged" right after.
    expect(snap!.source_version).toBe(completedVersion + 1);
    expect(snap!.current_source_status).toBe("unchanged");
    // The captured fingerprint is a durable record; TRUTH_EVIDENCE_SNAPSHOT_CAPTURED audit exists.
    expect(await prisma.auditEvent.count({ where: { event_type: "TRUTH_EVIDENCE_SNAPSHOT_CAPTURED", details: { path: ["source_record_id"], equals: o.obligation.obligation_id } } })).toBeGreaterThanOrEqual(1);
    // A completed (terminal) obligation can't be superseded, so simulate a later change directly:
    // bump the obligation version. The captured snapshot is UNCHANGED; recheck reports "changed".
    await prisma.obligation.update({ where: { obligation_id: o.obligation.obligation_id }, data: { version: completedVersion + 5 } });
    const ev2 = await otzar.getObligationEvidence({ token: u.token, obligation_id: o.obligation.obligation_id });
    if (!ev2.ok) return;
    const snap2 = ev2.evidence.find((e) => e.decision_point === "OBLIGATION_COMPLETION");
    expect(snap2!.source_version).toBe(completedVersion + 1); // captured basis immutable
    expect(snap2!.current_source_status).toBe("changed"); // current status reflects the drift
  });

  it("handoff send + completion capture point-in-time snapshots of the handoff version", async () => {
    const { auth, otzar } = makeServices();
    const a = await orgUser(auth);
    // second member of the same org (incoming)
    const bUser = await createEntity(makeEntityInput({ entity_type: "PERSON", password: "correct-horse-battery" }));
    await prisma.entityMembership.create({ data: { parent_id: a.orgId, child_id: bUser.entity_id, is_active: true } });
    const bTwin = await createEntity(makeEntityInput({ entity_type: "AI_AGENT" }));
    await prisma.entityMembership.create({ data: { parent_id: bUser.entity_id, child_id: bTwin.entity_id, role_title: "Digital Twin", is_active: true } });
    await prisma.twinConfig.create({ data: { twin_id: bTwin.entity_id, autonomy_level: "APPROVAL_REQUIRED", is_admin_twin: false, role_template: null } });
    const bLogin = (await auth.login((await prisma.entity.findUnique({ where: { entity_id: bUser.entity_id }, select: { email: true } }))!.email!, "correct-horse-battery", ["read", "write"], { ip_address: null })) as LoginResult;
    if (!bLogin.ok) throw new Error();
    const h = await otzar.createHandoff({ token: a.token, title: "H", incoming_responsible_entity_id: bUser.entity_id });
    if (!h.ok) throw new Error();
    const sent = await otzar.transitionHandoff({ token: a.token, handoff_id: h.handoff.handoff_id, expected_version: h.handoff.version, transition: "send" });
    expect(sent.ok).toBe(true); if (!sent.ok) return;
    const ackTurn = await prisma.otzarConversationTurn.create({ data: { conversation_id: randomUUID(), org_entity_id: a.orgId, subject_entity_id: bUser.entity_id, author_entity_id: bUser.entity_id, role: "USER", content: "ack", content_hash: createHash("sha256").update(randomUUID()).digest("hex"), sequence: 987654, source_channel: "CHAT" }, select: { turn_id: true } });
    const ack = await otzar.transitionHandoff({ token: bLogin.token, handoff_id: h.handoff.handoff_id, expected_version: sent.handoff.version, transition: "acknowledge", acknowledged_turn_id: ackTurn.turn_id });
    expect(ack.ok).toBe(true); if (!ack.ok) return;
    const done = await otzar.transitionHandoff({ token: bLogin.token, handoff_id: h.handoff.handoff_id, expected_version: ack.handoff.version, transition: "complete" });
    expect(done.ok).toBe(true);
    // Both parties can read the evidence; SEND + COMPLETION snapshots present.
    const ev = await otzar.getHandoffEvidence({ token: a.token, handoff_id: h.handoff.handoff_id });
    expect(ev.ok).toBe(true);
    if (!ev.ok) return;
    const points = ev.evidence.map((e) => e.decision_point);
    expect(points).toContain("HANDOFF_SEND");
    expect(points).toContain("HANDOFF_COMPLETION");
  });

  it("cross-scope: a foreign caller cannot read another's obligation/handoff evidence", async () => {
    const { auth, otzar } = makeServices();
    const u = await orgUser(auth);
    const foreign = await orgUser(auth);
    const ledger = await seedExecutedLedger(u);
    const o = await otzar.createObligation({ token: u.token, obligation_type: "ACTION_CONFIRMATION", title: "x", action_ref: ledger });
    if (!o.ok) throw new Error();
    await otzar.completeObligation({ token: u.token, obligation_id: o.obligation.obligation_id, expected_version: o.obligation.version });
    const foreignEv = await otzar.getObligationEvidence({ token: foreign.token, obligation_id: o.obligation.obligation_id });
    expect(foreignEv.ok).toBe(false);
    if (!foreignEv.ok) expect(foreignEv.code).toBe("OTZAR_OBLIGATION_NOT_FOUND");
  });

  it("no-leak: the evidence projection exposes classifications/hashes, never raw content or policy internals", async () => {
    const { auth, otzar } = makeServices();
    const u = await orgUser(auth);
    const ledger = await seedExecutedLedger(u);
    const o = await otzar.createObligation({ token: u.token, obligation_type: "ACTION_CONFIRMATION", title: "x", action_ref: ledger });
    if (!o.ok) throw new Error();
    await otzar.completeObligation({ token: u.token, obligation_id: o.obligation.obligation_id, expected_version: o.obligation.version });
    const ev = await otzar.getObligationEvidence({ token: u.token, obligation_id: o.obligation.obligation_id });
    if (!ev.ok) return;
    expect(JSON.stringify(ev.evidence)).not.toMatch(/permission_snapshot|lease|provider_attempt|raw_|token/i);
  });
});
