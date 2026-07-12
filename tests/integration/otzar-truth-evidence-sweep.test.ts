// FILE: tests/integration/otzar-truth-evidence-sweep.test.ts
// PURPOSE: [OTZAR STAGE-2 TRUTH-EVIDENCE §7 — SWEEP §M] Real-PG proof of the bounded, fail-closed
//          auto-remediation sweep: disabled-by-default config, ACTOR→ORG authority, remediable-only
//          selection (HANDOFF_SEND never false-triggers), current→no-op, stale→one idempotent
//          remediation to the correct party, dry-run creates nothing, cross-org isolation, bounds,
//          and leak-safe counts.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import {
  AuthService, COEService, HiveService, FixtureBasedEmbeddingProvider,
  MemoryContentStore, MemoryKVCache, MemoryNonceStore, MockLLMProvider,
  NegotiateService, OtzarService, ReadService, WriteService, ComplianceService,
  type LLMProvider, type LoginResult,
} from "@niov/api";
import {
  tickTruthEvidenceRecheck, truthEvidenceRecheckEnabled,
} from "../../apps/api/src/services/otzar/truth-evidence-recheck.service.js";
import { ContentEncryption } from "@niov/auth";
import { createEntity, prisma } from "@niov/database";
import { cleanupTestData, ensureAuditTriggers, makeEntityInput } from "../helpers.js";

const TEST_JWT_SECRET = "otzar-te-sweep-test-secret";
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

/** An in-org actor; can_admin_org toggled on the TAR; optionally made inactive. */
async function makeActor(orgId: string, opts: { admin: boolean; active?: boolean } = { admin: true }): Promise<string> {
  const e = await createEntity(makeEntityInput({ entity_type: "PERSON", password: "correct-horse-battery" }));
  await prisma.entityMembership.create({ data: { parent_id: orgId, child_id: e.entity_id, is_active: true } });
  await prisma.tokenAttributeRepository.update({ where: { entity_id: e.entity_id }, data: { can_admin_org: opts.admin } });
  if (opts.active === false) await prisma.entity.update({ where: { entity_id: e.entity_id }, data: { status: "SUSPENDED" } });
  return e.entity_id;
}

async function seedExecutedLedger(u: OrgUser): Promise<string> {
  const led = await prisma.workLedgerEntry.create({ data: { org_entity_id: u.orgId, ledger_type: "MEETING", owner_entity_id: u.userId, title: "Sync", status: "EXECUTED" }, select: { ledger_entry_id: true } });
  return led.ledger_entry_id;
}

/** A completed obligation (has an OBLIGATION_COMPLETION snapshot). `drift` bumps its version so the
 *  captured basis reads stale. */
async function completedObligation(otzar: OtzarService, u: OrgUser, drift: boolean): Promise<string> {
  const ledger = await seedExecutedLedger(u);
  const o = await otzar.createObligation({ token: u.token, obligation_type: "ACTION_CONFIRMATION", title: "x", action_ref: ledger });
  if (!o.ok) throw new Error();
  await otzar.completeObligation({ token: u.token, obligation_id: o.obligation.obligation_id, expected_version: o.obligation.version });
  if (drift) await prisma.obligation.update({ where: { obligation_id: o.obligation.obligation_id }, data: { version: o.obligation.version + 9 } });
  return o.obligation.obligation_id;
}

beforeAll(async () => { await ensureAuditTriggers(); });
afterAll(async () => { await cleanupTestData(); await prisma.$disconnect(); });

const safeCount = (orgId: string, parentId?: string) =>
  prisma.obligation.count({ where: { org_entity_id: orgId, obligation_type: "SAFETY_CONCERN", ...(parentId !== undefined ? { parent_obligation_id: parentId } : {}) } });

describe("Otzar truth-evidence auto-remediation sweep (Stage-2 §M)", () => {
  it("config: disabled by default; empty allowlist is a no-op", async () => {
    expect(truthEvidenceRecheckEnabled()).toBe(false); // no env flag set
    const r = await tickTruthEvidenceRecheck([]);
    expect(r.orgs_processed).toBe(0);
    expect(r.orgs_skipped).toBe(0);
    expect(r.totals.records_scanned).toBe(0);
  });

  it("authority: unauthorized / inactive / wrong-org actors are skipped and touch nothing", async () => {
    const { auth, otzar } = makeServices();
    const u = await orgUser(auth);
    const oblId = await completedObligation(otzar, u, true); // a genuinely stale record exists
    // (a) actor with no can_admin_org
    const nonAdmin = await makeActor(u.orgId, { admin: false });
    // (b) inactive admin
    const inactive = await makeActor(u.orgId, { admin: true, active: false });
    // (c) admin of a DIFFERENT org, pointed at u.orgId
    const otherOrg = await orgUser(auth);
    const foreignAdmin = await makeActor(otherOrg.orgId, { admin: true });
    for (const actor of [nonAdmin, inactive, foreignAdmin]) {
      const r = await tickTruthEvidenceRecheck([{ orgEntityId: u.orgId, actorEntityId: actor }]);
      expect(r.orgs_processed).toBe(0);
      expect(r.orgs_skipped).toBe(1);
    }
    expect(await safeCount(u.orgId, oblId)).toBe(0); // never remediated by an unauthorized sweep
  });

  it("stale obligation: dry-run counts but creates nothing; a real run raises ONE idempotent remediation to the responsible party", async () => {
    const { auth, otzar } = makeServices();
    const u = await orgUser(auth);
    const admin = await makeActor(u.orgId, { admin: true });
    const oblId = await completedObligation(otzar, u, true);
    const target = [{ orgEntityId: u.orgId, actorEntityId: admin }];

    // Dry-run: real reads, stale detected, nothing written.
    const dry = await tickTruthEvidenceRecheck(target, { dry_run: true });
    expect(dry.dry_run).toBe(true);
    expect(dry.totals.stale_found).toBeGreaterThanOrEqual(1);
    expect(dry.totals.remediation_created).toBe(0);
    expect(await safeCount(u.orgId, oblId)).toBe(0);
    expect(await prisma.auditEvent.count({ where: { event_type: "TRUTH_EVIDENCE_RECHECK_REQUIRED", target_entity_id: u.orgId } })).toBe(0);

    // Real run: exactly one remediation, correct party + parent + safe details + audit.
    const run = await tickTruthEvidenceRecheck(target);
    expect(run.totals.remediation_created).toBe(1);
    expect(await safeCount(u.orgId, oblId)).toBe(1);
    const rem = await prisma.obligation.findFirst({ where: { org_entity_id: u.orgId, obligation_type: "SAFETY_CONCERN", parent_obligation_id: oblId }, select: { responsible_entity_id: true, details: true } });
    expect(rem?.responsible_entity_id).toBe(u.userId);
    expect(JSON.stringify(rem?.details)).toContain(oblId);
    expect(await prisma.auditEvent.count({ where: { event_type: "TRUTH_EVIDENCE_RECHECK_REQUIRED", target_entity_id: u.orgId } })).toBeGreaterThanOrEqual(1);

    // Idempotent: a second run creates nothing new (existed).
    const again = await tickTruthEvidenceRecheck(target);
    expect(again.totals.remediation_created).toBe(0);
    expect(again.totals.remediation_existed).toBeGreaterThanOrEqual(1);
    expect(await safeCount(u.orgId, oblId)).toBe(1);
  });

  it("current obligation: no remediation, no mutation (and no per-record audit noise)", async () => {
    const { auth, otzar } = makeServices();
    const u = await orgUser(auth);
    const admin = await makeActor(u.orgId, { admin: true });
    const oblId = await completedObligation(otzar, u, false); // current basis
    const before = await prisma.auditEvent.count({ where: { event_type: "TRUTH_EVIDENCE_RECHECKED", target_entity_id: u.orgId } });
    const r = await tickTruthEvidenceRecheck([{ orgEntityId: u.orgId, actorEntityId: admin }]);
    expect(r.totals.current).toBeGreaterThanOrEqual(1);
    expect(r.totals.remediation_created).toBe(0);
    expect(await safeCount(u.orgId, oblId)).toBe(0);
    // Sweep is QUIET on the current path — no per-unchanged-record audit.
    expect(await prisma.auditEvent.count({ where: { event_type: "TRUTH_EVIDENCE_RECHECKED", target_entity_id: u.orgId } })).toBe(before);
  });

  it("selection: a normally-completed handoff does NOT false-trigger (HANDOFF_SEND excluded); a terminal drift remediates to the incoming party", async () => {
    const { auth, otzar } = makeServices();
    const a = await orgUser(auth);
    const admin = await makeActor(a.orgId, { admin: true });
    // second member (incoming), with a twin so a remediation scope resolves
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
    const ackTurn = await prisma.otzarConversationTurn.create({ data: { conversation_id: randomUUID(), org_entity_id: a.orgId, subject_entity_id: bUser.entity_id, author_entity_id: bUser.entity_id, role: "USER", content: "ack", content_hash: createHash("sha256").update(randomUUID()).digest("hex"), sequence: 777001, source_channel: "CHAT" }, select: { turn_id: true } });
    const ack = await otzar.transitionHandoff({ token: bLogin.token, handoff_id: h.handoff.handoff_id, expected_version: sent.handoff.version, transition: "acknowledge", acknowledged_turn_id: ackTurn.turn_id });
    if (!ack.ok) throw new Error();
    const done = await otzar.transitionHandoff({ token: bLogin.token, handoff_id: h.handoff.handoff_id, expected_version: ack.handoff.version, transition: "complete" });
    if (!done.ok) throw new Error();
    const target = [{ orgEntityId: a.orgId, actorEntityId: admin }];

    // Normal completion (SEND version diverged) must NOT remediate — only HANDOFF_COMPLETION gates.
    const clean = await tickTruthEvidenceRecheck(target);
    expect(clean.totals.remediation_created).toBe(0);
    expect(await prisma.obligation.count({ where: { org_entity_id: a.orgId, obligation_type: "SAFETY_CONCERN" } })).toBe(0);

    // Out-of-band drift on the completed handoff → one remediation, owned by the incoming party (b).
    const cur = await prisma.handoff.findUnique({ where: { handoff_id: h.handoff.handoff_id }, select: { version: true } });
    await prisma.handoff.update({ where: { handoff_id: h.handoff.handoff_id }, data: { version: cur!.version + 7 } });
    const run = await tickTruthEvidenceRecheck(target);
    expect(run.totals.remediation_created).toBe(1);
    const rem = await prisma.obligation.findFirst({ where: { org_entity_id: a.orgId, obligation_type: "SAFETY_CONCERN" }, select: { subject_entity_id: true, responsible_entity_id: true, details: true } });
    expect(rem?.subject_entity_id).toBe(bUser.entity_id);
    expect(rem?.responsible_entity_id).toBe(bUser.entity_id);
    expect(JSON.stringify(rem?.details)).toContain(h.handoff.handoff_id);
  });

  it("isolation + bounds + leak-safe: a sweep never touches another org, honors the record cap, and reports counts only", async () => {
    const { auth, otzar } = makeServices();
    const a = await orgUser(auth);
    const b = await orgUser(auth);
    const adminA = await makeActor(a.orgId, { admin: true });
    const staleB = await completedObligation(otzar, b, true); // b's stale record
    // a's admin sweeps a's org only — b is never scanned.
    const r = await tickTruthEvidenceRecheck([{ orgEntityId: a.orgId, actorEntityId: adminA }]);
    expect(await safeCount(b.orgId, staleB)).toBe(0);
    // Bounds: two stale records in a, cap of 1 → only one scanned this run.
    await completedObligation(otzar, a, true);
    await completedObligation(otzar, a, true);
    const capped = await tickTruthEvidenceRecheck([{ orgEntityId: a.orgId, actorEntityId: adminA }], { dry_run: true, maxRecordsPerOrg: 1 });
    expect(capped.totals.records_scanned).toBe(1);
    // Leak-safe: the result surface is counts + booleans only — no ids/content strings.
    expect(JSON.stringify(r.totals)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
    expect(Object.values(r.totals).every((v) => typeof v === "number")).toBe(true);
  });
});
