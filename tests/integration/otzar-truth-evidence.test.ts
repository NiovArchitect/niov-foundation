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

  it("recheck (§7): a still-current basis reports 'current' and raises NO remediation (idempotent)", async () => {
    const { auth, otzar } = makeServices();
    const u = await orgUser(auth);
    const ledger = await seedExecutedLedger(u);
    const o = await otzar.createObligation({ token: u.token, obligation_type: "ACTION_CONFIRMATION", title: "x", action_ref: ledger });
    if (!o.ok) throw new Error();
    await otzar.completeObligation({ token: u.token, obligation_id: o.obligation.obligation_id, expected_version: o.obligation.version });
    const r1 = await otzar.recheckObligationEvidence({ token: u.token, obligation_id: o.obligation.obligation_id });
    expect(r1.ok).toBe(true); if (!r1.ok) return;
    expect(r1.status).toBe("current");
    expect(r1.stale).toHaveLength(0);
    expect(r1.remediation_obligation_id).toBeNull();
    // No SAFETY_CONCERN raised, and a RECHECKED audit was written.
    expect(await prisma.obligation.count({ where: { org_entity_id: u.orgId, obligation_type: "SAFETY_CONCERN", parent_obligation_id: o.obligation.obligation_id } })).toBe(0);
    expect(await prisma.auditEvent.count({ where: { event_type: "TRUTH_EVIDENCE_RECHECKED", target_entity_id: u.orgId } })).toBeGreaterThanOrEqual(1);
  });

  it("recheck (§7): a later drift raises an idempotent SAFETY_CONCERN remediation for the responsible party — WITHOUT rewriting the captured basis", async () => {
    const { auth, otzar } = makeServices();
    const u = await orgUser(auth);
    const ledger = await seedExecutedLedger(u);
    const o = await otzar.createObligation({ token: u.token, obligation_type: "ACTION_CONFIRMATION", title: "x", action_ref: ledger });
    if (!o.ok) throw new Error();
    const completedVersion = o.obligation.version;
    await otzar.completeObligation({ token: u.token, obligation_id: o.obligation.obligation_id, expected_version: completedVersion });
    // Simulate a later upstream change (the completed, terminal obligation can't be superseded).
    await prisma.obligation.update({ where: { obligation_id: o.obligation.obligation_id }, data: { version: completedVersion + 5 } });

    const r1 = await otzar.recheckObligationEvidence({ token: u.token, obligation_id: o.obligation.obligation_id });
    expect(r1.ok).toBe(true); if (!r1.ok) return;
    expect(r1.status).toBe("remediation_open");
    expect(r1.remediation_created).toBe(true);
    expect(r1.stale.length).toBeGreaterThanOrEqual(1);
    expect(r1.stale.some((s) => s.current_source_status === "changed")).toBe(true);
    const remId = r1.remediation_obligation_id!;
    expect(remId).toBeTruthy();
    // The remediation is a real SAFETY_CONCERN obligation parented to the affected decision, and it
    // shows up in the responsible party's obligation list (governed, actionable work).
    const rem = await prisma.obligation.findUnique({ where: { obligation_id: remId }, select: { obligation_type: true, parent_obligation_id: true, responsible_entity_id: true, state: true, priority: true } });
    expect(rem?.obligation_type).toBe("SAFETY_CONCERN");
    expect(rem?.parent_obligation_id).toBe(o.obligation.obligation_id);
    expect(rem?.responsible_entity_id).toBe(u.userId);
    expect(rem?.state).toBe("OPEN");
    const list = await otzar.listObligations({ token: u.token, obligation_type: "SAFETY_CONCERN" });
    expect(list.ok && list.obligations.some((x) => x.obligation_id === remId)).toBe(true);
    // The captured snapshot is still immutable; RECHECK_REQUIRED audit exists.
    const ev = await otzar.getObligationEvidence({ token: u.token, obligation_id: o.obligation.obligation_id });
    if (ev.ok) expect(ev.evidence.find((e) => e.decision_point === "OBLIGATION_COMPLETION")!.source_version).toBe(completedVersion + 1);
    expect(await prisma.auditEvent.count({ where: { event_type: "TRUTH_EVIDENCE_RECHECK_REQUIRED", target_entity_id: u.orgId } })).toBeGreaterThanOrEqual(1);

    // Idempotent: the SAME drift rechecked again returns the SAME remediation, creates nothing new.
    const r2 = await otzar.recheckObligationEvidence({ token: u.token, obligation_id: o.obligation.obligation_id });
    expect(r2.ok).toBe(true); if (!r2.ok) return;
    expect(r2.remediation_created).toBe(false);
    expect(r2.remediation_obligation_id).toBe(remId);
    expect(await prisma.obligation.count({ where: { org_entity_id: u.orgId, obligation_type: "SAFETY_CONCERN", parent_obligation_id: o.obligation.obligation_id } })).toBe(1);
  });

  it("recheck (§7): a recheck-audit failure returns AUDIT_UNCOMMITTED and self-heals on retry (no duplicate remediation)", async () => {
    const { auth, otzar } = makeServices();
    const u = await orgUser(auth);
    const ledger = await seedExecutedLedger(u);
    const o = await otzar.createObligation({ token: u.token, obligation_type: "ACTION_CONFIRMATION", title: "x", action_ref: ledger });
    if (!o.ok) throw new Error();
    const completedVersion = o.obligation.version;
    await otzar.completeObligation({ token: u.token, obligation_id: o.obligation.obligation_id, expected_version: completedVersion });
    await prisma.obligation.update({ where: { obligation_id: o.obligation.obligation_id }, data: { version: completedVersion + 5 } });
    // The remediation obligation persists (its own atomic OBLIGATION_CREATED audit), but the
    // RECHECK_REQUIRED audit fails → typed AUDIT_UNCOMMITTED (never a silent success).
    __otzarTruthEvidenceTestHooks.failAudit = true;
    const failed = await otzar.recheckObligationEvidence({ token: u.token, obligation_id: o.obligation.obligation_id });
    __otzarTruthEvidenceTestHooks.failAudit = false;
    expect(failed.ok).toBe(false);
    if (!failed.ok) expect(failed.code).toBe("OTZAR_OBLIGATION_AUDIT_UNCOMMITTED");
    // Retry heals: the idempotent origin_key returns the SAME remediation (no duplicate) and now the
    // recheck audit commits.
    const healed = await otzar.recheckObligationEvidence({ token: u.token, obligation_id: o.obligation.obligation_id });
    expect(healed.ok).toBe(true); if (!healed.ok) return;
    expect(healed.status).toBe("remediation_open");
    expect(healed.remediation_created).toBe(false);
    expect(await prisma.obligation.count({ where: { org_entity_id: u.orgId, obligation_type: "SAFETY_CONCERN", parent_obligation_id: o.obligation.obligation_id } })).toBe(1);
  });

  it("recheck (§7): a foreign caller cannot recheck another's obligation and raises no remediation", async () => {
    const { auth, otzar } = makeServices();
    const u = await orgUser(auth);
    const foreign = await orgUser(auth);
    const ledger = await seedExecutedLedger(u);
    const o = await otzar.createObligation({ token: u.token, obligation_type: "ACTION_CONFIRMATION", title: "x", action_ref: ledger });
    if (!o.ok) throw new Error();
    await otzar.completeObligation({ token: u.token, obligation_id: o.obligation.obligation_id, expected_version: o.obligation.version });
    await prisma.obligation.update({ where: { obligation_id: o.obligation.obligation_id }, data: { version: o.obligation.version + 5 } });
    const r = await otzar.recheckObligationEvidence({ token: foreign.token, obligation_id: o.obligation.obligation_id });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("OTZAR_OBLIGATION_NOT_FOUND");
    expect(await prisma.obligation.count({ where: { org_entity_id: u.orgId, obligation_type: "SAFETY_CONCERN", parent_obligation_id: o.obligation.obligation_id } })).toBe(0);
  });

  // Two-party handoff driven to completion (send → receive → ack → complete). Returns the outgoing
  // party (a, who created it), the incoming party token, and the completed handoff id.
  async function completedHandoff(auth: AuthService, otzar: OtzarService): Promise<{ a: OrgUser; handoffId: string }> {
    const a = await orgUser(auth);
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
    if (!sent.ok) throw new Error();
    const ackTurn = await prisma.otzarConversationTurn.create({ data: { conversation_id: randomUUID(), org_entity_id: a.orgId, subject_entity_id: bUser.entity_id, author_entity_id: bUser.entity_id, role: "USER", content: "ack", content_hash: createHash("sha256").update(randomUUID()).digest("hex"), sequence: 424242, source_channel: "CHAT" }, select: { turn_id: true } });
    const ack = await otzar.transitionHandoff({ token: bLogin.token, handoff_id: h.handoff.handoff_id, expected_version: sent.handoff.version, transition: "acknowledge", acknowledged_turn_id: ackTurn.turn_id });
    if (!ack.ok) throw new Error();
    const done = await otzar.transitionHandoff({ token: bLogin.token, handoff_id: h.handoff.handoff_id, expected_version: ack.handoff.version, transition: "complete" });
    if (!done.ok) throw new Error();
    return { a, handoffId: h.handoff.handoff_id };
  }

  it("handoff recheck (§7): normal completion does NOT false-trigger — the point-in-time HANDOFF_SEND snapshot is excluded; only the terminal HANDOFF_COMPLETION basis gates remediation", async () => {
    const { auth, otzar } = makeServices();
    const { a, handoffId } = await completedHandoff(auth, otzar);
    // The SEND snapshot's version is BELOW the completed handoff version (normal progression) — a
    // naive recheck would read it "changed" and false-raise. The remediable filter excludes it.
    const ev = await otzar.getHandoffEvidence({ token: a.token, handoff_id: handoffId });
    expect(ev.ok).toBe(true); if (!ev.ok) return;
    const send = ev.evidence.find((e) => e.decision_point === "HANDOFF_SEND");
    expect(send?.current_source_status).toBe("changed"); // proves the hazard is real…
    const r = await otzar.recheckHandoffEvidence({ token: a.token, handoff_id: handoffId });
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.status).toBe("current"); // …and is correctly NOT treated as a remediation trigger
    expect(await prisma.obligation.count({ where: { org_entity_id: a.orgId, obligation_type: "SAFETY_CONCERN", subject_entity_id: a.userId } })).toBe(0);
  });

  it("handoff recheck (§7): a later drift in the completed handoff raises an idempotent SAFETY_CONCERN remediation in the caller's scope (handoff referenced in details)", async () => {
    const { auth, otzar } = makeServices();
    const { a, handoffId } = await completedHandoff(auth, otzar);
    const cur = await prisma.handoff.findUnique({ where: { handoff_id: handoffId }, select: { version: true } });
    // Out-of-band change to the terminal handoff → the HANDOFF_COMPLETION basis is no longer current.
    await prisma.handoff.update({ where: { handoff_id: handoffId }, data: { version: cur!.version + 7 } });
    const r1 = await otzar.recheckHandoffEvidence({ token: a.token, handoff_id: handoffId });
    expect(r1.ok).toBe(true); if (!r1.ok) return;
    expect(r1.status).toBe("remediation_open");
    expect(r1.remediation_created).toBe(true);
    expect(r1.stale.some((s) => s.decision_point === "HANDOFF_COMPLETION" && s.current_source_status === "changed")).toBe(true);
    const remId = r1.remediation_obligation_id!;
    const rem = await prisma.obligation.findUnique({ where: { obligation_id: remId }, select: { obligation_type: true, subject_entity_id: true, responsible_entity_id: true, details: true } });
    expect(rem?.obligation_type).toBe("SAFETY_CONCERN");
    expect(rem?.subject_entity_id).toBe(a.userId);
    expect(rem?.responsible_entity_id).toBe(a.userId);
    expect(JSON.stringify(rem?.details)).toContain(handoffId); // handoff referenced via safe details
    expect(await prisma.auditEvent.count({ where: { event_type: "TRUTH_EVIDENCE_RECHECK_REQUIRED", target_entity_id: a.orgId } })).toBeGreaterThanOrEqual(1);
    // Idempotent: same drift → same remediation, nothing new.
    const r2 = await otzar.recheckHandoffEvidence({ token: a.token, handoff_id: handoffId });
    expect(r2.ok && r2.remediation_created === false && r2.remediation_obligation_id === remId).toBe(true);
    expect(await prisma.obligation.count({ where: { org_entity_id: a.orgId, obligation_type: "SAFETY_CONCERN", subject_entity_id: a.userId } })).toBe(1);
  });

  it("handoff recheck (§7): a non-party caller is denied and raises no remediation", async () => {
    const { auth, otzar } = makeServices();
    const { a, handoffId } = await completedHandoff(auth, otzar);
    const cur = await prisma.handoff.findUnique({ where: { handoff_id: handoffId }, select: { version: true } });
    await prisma.handoff.update({ where: { handoff_id: handoffId }, data: { version: cur!.version + 7 } });
    const foreign = await orgUser(auth); // different org, not a party
    const r = await otzar.recheckHandoffEvidence({ token: foreign.token, handoff_id: handoffId });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("OTZAR_HANDOFF_NOT_FOUND");
    expect(await prisma.obligation.count({ where: { org_entity_id: a.orgId, obligation_type: "SAFETY_CONCERN", subject_entity_id: a.userId } })).toBe(0);
  });

  it("enrichment: completion resolves the substrate values (communication_act/truth_class/rank/authority/currentness/source-integrity) from the linked ledger's stamped lineage — and stays null when none exists", async () => {
    const { auth, otzar } = makeServices();
    const u = await orgUser(auth);
    // A work-ledger row carrying the 3B statement stamp (details.communication_lineage) + a
    // source-integrity state — exactly what comms-ingest writes.
    const stamped = await prisma.workLedgerEntry.create({
      data: {
        org_entity_id: u.orgId, ledger_type: "DECISION", owner_entity_id: u.userId, title: "Ship v2", status: "EXECUTED",
        details: { communication_lineage: { communication_act: "decision", authority_status: "within_authority", currentness: "current", superseded_by: null }, source_integrity: { state: "AVAILABLE" } },
      },
      select: { ledger_entry_id: true },
    });
    const o = await otzar.createObligation({ token: u.token, obligation_type: "ACTION_CONFIRMATION", title: "Confirm ship", action_ref: stamped.ledger_entry_id });
    if (!o.ok) throw new Error();
    const done = await otzar.completeObligation({ token: u.token, obligation_id: o.obligation.obligation_id, expected_version: o.obligation.version });
    expect(done.ok).toBe(true);
    const ev = await otzar.getObligationEvidence({ token: u.token, obligation_id: o.obligation.obligation_id });
    expect(ev.ok).toBe(true); if (!ev.ok) return;
    const snap = ev.evidence.find((e) => e.decision_point === "OBLIGATION_COMPLETION")!;
    // The resolved substrate values were captured point-in-time — reusing truth-weight, NOT invented.
    expect(snap.communication_act).toBe("decision");
    expect(snap.authority_class).toBe("within_authority");
    expect(snap.currentness).toBe("current");
    expect(snap.truth_class).toBe("authorized_decision"); // decision + within_authority → rank 2
    expect(snap.truth_weight_rank).toBe(2);
    expect(snap.source_integrity_state).toBe("AVAILABLE");

    // Control: a plain ledger with NO stamped lineage → enrichment absent (fields stay null; never
    // fabricated).
    const plain = await seedExecutedLedger(u);
    const o2 = await otzar.createObligation({ token: u.token, obligation_type: "ACTION_CONFIRMATION", title: "Confirm plain", action_ref: plain });
    if (!o2.ok) throw new Error();
    await otzar.completeObligation({ token: u.token, obligation_id: o2.obligation.obligation_id, expected_version: o2.obligation.version });
    const ev2 = await otzar.getObligationEvidence({ token: u.token, obligation_id: o2.obligation.obligation_id });
    if (!ev2.ok) return;
    const snap2 = ev2.evidence.find((e) => e.decision_point === "OBLIGATION_COMPLETION")!;
    expect(snap2.communication_act).toBeNull();
    expect(snap2.truth_class).toBeNull();
    expect(snap2.truth_weight_rank).toBeNull();
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
