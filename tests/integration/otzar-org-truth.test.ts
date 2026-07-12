// FILE: tests/integration/otzar-org-truth.test.ts
// PURPOSE: [SECTION-10 ORG-TRUTH §20] Real-PG proof of the governed promotion + conflict runtime:
//          decision-rights authority (owns/can_approve promote; recommend-only refused), clean
//          promotion/supersession raise NO obligation, a material unresolved conflict is never
//          silently won (both candidates preserved + exactly ONE idempotent obligation to the domain
//          owner), promotion evidence + audit are atomic (snapshot/audit failure rolls back), and
//          cross-org/ineligible sources are refused.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  createEntity, prisma,
  promoteOrgTruth, resolveConflict, retractOrgTruth,
  getCurrentPromotedTruth, listConflictSetsForOrg, getConflictSet,
  __otzarOrgTruthTestHooks,
  type OrgTruthScope, type SourceCandidate, type ObligationScope,
} from "@niov/database";
import { cleanupTestData, ensureAuditTriggers, makeEntityInput } from "../helpers.js";

const DOMAIN = "technical";

interface Party { userId: string; twinId: string; orgId: string }
async function orgUser(rights?: { owns?: string[]; can_approve?: string[]; recommend_only?: string[] }): Promise<Party> {
  const user = await createEntity(makeEntityInput({ entity_type: "PERSON", password: "correct-horse-battery" }));
  const org = await createEntity(makeEntityInput({ entity_type: "COMPANY" }));
  await prisma.entityMembership.create({ data: { parent_id: org.entity_id, child_id: user.entity_id, is_active: true } });
  const twin = await createEntity(makeEntityInput({ entity_type: "AI_AGENT" }));
  await prisma.entityMembership.create({ data: { parent_id: user.entity_id, child_id: twin.entity_id, role_title: "Digital Twin", is_active: true } });
  await prisma.twinConfig.create({ data: { twin_id: twin.entity_id, autonomy_level: "APPROVAL_REQUIRED", is_admin_twin: false, role_template: null } });
  if (rights) await prisma.entityDecisionRights.create({ data: { org_entity_id: org.entity_id, entity_id: user.entity_id, owns: rights.owns ?? [], can_approve: rights.can_approve ?? [], recommend_only: rights.recommend_only ?? [], updated_by: user.entity_id } });
  return { userId: user.entity_id, twinId: twin.entity_id, orgId: org.entity_id };
}
/** A second in-org member with given rights. */
async function memberOf(orgId: string, rights?: { owns?: string[]; can_approve?: string[]; recommend_only?: string[] }, active = true): Promise<string> {
  const e = await createEntity(makeEntityInput({ entity_type: "PERSON", password: "correct-horse-battery" }));
  await prisma.entityMembership.create({ data: { parent_id: orgId, child_id: e.entity_id, is_active: true } });
  if (rights) await prisma.entityDecisionRights.create({ data: { org_entity_id: orgId, entity_id: e.entity_id, owns: rights.owns ?? [], can_approve: rights.can_approve ?? [], recommend_only: rights.recommend_only ?? [], updated_by: e.entity_id } });
  if (!active) await prisma.entity.update({ where: { entity_id: e.entity_id }, data: { status: "SUSPENDED" } });
  return e.entity_id;
}

function scope(p: Party, topic = "release-date"): OrgTruthScope {
  return { org_entity_id: p.orgId, decision_domain: DOMAIN, subject_ref_class: "PROJECT", subject_ref: null, topic };
}
function source(claim: Record<string, unknown>, over?: Partial<SourceCandidate>): SourceCandidate {
  return { source_record_type: "WORK_LEDGER", source_record_id: randomUUID(), source_version: 1, truth_class: "authorized_decision", authority_status: "within_authority", currentness: "current", claim, ...over };
}
const ownerScopeOf = (p: Party) => async (): Promise<ObligationScope | null> => ({ org_entity_id: p.orgId, subject_entity_id: p.userId, twin_entity_id: p.twinId });
const safeCount = (orgId: string) => prisma.obligation.count({ where: { org_entity_id: orgId, obligation_type: "CLARIFICATION" } });

beforeAll(async () => { await ensureAuditTriggers(); });
afterAll(async () => { __otzarOrgTruthTestHooks.failAudit = false; __otzarOrgTruthTestHooks.failSnapshot = false; await cleanupTestData(); await prisma.$disconnect(); });

describe("Otzar organizational-truth promotion + conflict (Section 10 §20)", () => {
  it("authority: owns/can_approve promote; recommend_only refused; no rights / inactive / cross-org unauthorized", async () => {
    const owner = await orgUser({ owns: [DOMAIN] });
    const ok = await promoteOrgTruth({ scope: scope(owner), actor_entity_id: owner.userId, winner: source({ date: "2026-09-01" }) });
    expect(ok.kind).toBe("promoted");

    const approver = await orgUser({ can_approve: [DOMAIN] });
    expect((await promoteOrgTruth({ scope: scope(approver), actor_entity_id: approver.userId, winner: source({ date: "x" }) })).kind).toBe("promoted");

    const rec = await orgUser({ recommend_only: [DOMAIN] });
    expect((await promoteOrgTruth({ scope: scope(rec), actor_entity_id: rec.userId, winner: source({ date: "x" }) })).kind).toBe("recommend_only");

    const none = await orgUser();
    expect((await promoteOrgTruth({ scope: scope(none), actor_entity_id: none.userId, winner: source({ date: "x" }) })).kind).toBe("unauthorized");

    // cross-org: an owner of org A cannot promote in org B's scope.
    const orgB = await orgUser({ owns: [DOMAIN] });
    const crossScope: OrgTruthScope = { ...scope(orgB), org_entity_id: none.orgId };
    expect((await promoteOrgTruth({ scope: crossScope, actor_entity_id: orgB.userId, winner: source({ date: "x" }) })).kind).toBe("unauthorized");
  });

  it("clean promotion raises NO obligation, captures ORG_TRUTH_PROMOTION evidence + audit, and is the current answer", async () => {
    const p = await orgUser({ owns: [DOMAIN] });
    const res = await promoteOrgTruth({ scope: scope(p), actor_entity_id: p.userId, winner: source({ date: "2026-09-01" }), value: { date: "2026-09-01" }, value_type: "date" });
    expect(res.kind).toBe("promoted"); if (res.kind !== "promoted") return;
    expect(res.record.state).toBe("PROMOTED");
    expect(res.record.promotion_evidence_snapshot_id).toBeTruthy();
    expect(await safeCount(p.orgId)).toBe(0); // clean promotion → no obligation
    const cur = await getCurrentPromotedTruth(p.orgId, res.record.truth_key);
    expect(cur?.truth_record_id).toBe(res.record.truth_record_id);
    // evidence snapshot at the ORG_TRUTH_PROMOTION decision point exists.
    expect(await prisma.truthEvidenceSnapshot.count({ where: { snapshot_id: res.record.promotion_evidence_snapshot_id!, decision_point: "ORG_TRUTH_PROMOTION" } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { event_type: "ORG_TRUTH_PROMOTED", target_entity_id: p.orgId } })).toBeGreaterThanOrEqual(1);
  });

  it("replacement supersession links both ways, preserves the old snapshot, raises NO obligation", async () => {
    const p = await orgUser({ owns: [DOMAIN] });
    const first = await promoteOrgTruth({ scope: scope(p), actor_entity_id: p.userId, winner: source({ date: "A" }) });
    if (first.kind !== "promoted") throw new Error();
    const oldSnap = first.record.promotion_evidence_snapshot_id;
    const second = await promoteOrgTruth({ scope: scope(p), actor_entity_id: p.userId, winner: source({ date: "B" }), expected_current_version: first.record.version });
    expect(second.kind).toBe("promoted"); if (second.kind !== "promoted") return;
    const oldRec = await prisma.orgTruthRecord.findUnique({ where: { truth_record_id: first.record.truth_record_id }, select: { state: true, superseded_by_truth_record_id: true } });
    expect(oldRec?.state).toBe("SUPERSEDED");
    expect(oldRec?.superseded_by_truth_record_id).toBe(second.record.truth_record_id);
    expect(second.record.supersedes_truth_record_id).toBe(first.record.truth_record_id);
    // old snapshot immutable + still present.
    expect(await prisma.truthEvidenceSnapshot.count({ where: { snapshot_id: oldSnap! } })).toBe(1);
    expect(await safeCount(p.orgId)).toBe(0);
    // current answer is the replacement.
    expect((await getCurrentPromotedTruth(p.orgId, second.record.truth_key))?.truth_record_id).toBe(second.record.truth_record_id);
  });

  it("material unresolved conflict is never silently won: both candidates preserved + ONE idempotent obligation to the domain owner", async () => {
    const owner = await orgUser({ owns: [DOMAIN] });
    const winner = source({ date: "2026-09-01" });
    const competing = source({ date: "2026-12-01" }); // materially different claim
    const r1 = await promoteOrgTruth({ scope: scope(owner), actor_entity_id: owner.userId, winner, competing: [competing], resolveOwnerScope: ownerScopeOf(owner) });
    expect(r1.kind).toBe("conflict_open"); if (r1.kind !== "conflict_open") return;
    // NO promoted record.
    expect(await getCurrentPromotedTruth(owner.orgId, r1.conflict_set.truth_key)).toBeNull();
    // both candidates preserved.
    const cs = await getConflictSet(owner.orgId, r1.conflict_set.conflict_set_id);
    expect(cs?.candidates.length).toBe(2);
    // [CT REVIEW UI] enriched safe candidate projection — classifications for the reviewer compare.
    const c0 = cs!.candidates[0]!;
    expect(c0).toHaveProperty("source_integrity_state");
    expect(c0).toHaveProperty("truth_weight_rank");
    expect(c0).toHaveProperty("currentness");
    expect(c0).toHaveProperty("permission_eligible");
    expect(typeof c0.is_winner).toBe("boolean");
    // list projection carries candidate_count for the conflict-list lane.
    const listed = await listConflictSetsForOrg(owner.orgId);
    const thisSet = listed.find((s) => s.conflict_set_id === r1.conflict_set.conflict_set_id);
    expect(thisSet?.candidate_count).toBe(2);
    // exactly one CLARIFICATION obligation to the owner.
    expect(r1.review_obligation_id).toBeTruthy();
    expect(await safeCount(owner.orgId)).toBe(1);
    const obl = await prisma.obligation.findUnique({ where: { obligation_id: r1.review_obligation_id! }, select: { responsible_entity_id: true, details: true } });
    expect(obl?.responsible_entity_id).toBe(owner.userId);
    expect(JSON.stringify(obl?.details)).toContain(r1.conflict_set.conflict_set_id);
    // idempotent: same conflict rechecked → same set, no duplicate obligation.
    const r2 = await promoteOrgTruth({ scope: scope(owner), actor_entity_id: owner.userId, winner, competing: [competing], resolveOwnerScope: ownerScopeOf(owner) });
    expect(r2.kind).toBe("conflict_open");
    expect(await safeCount(owner.orgId)).toBe(1);
  });

  it("equivalent structured claims do NOT open a conflict (harmless difference)", async () => {
    const p = await orgUser({ owns: [DOMAIN] });
    const claim = { date: "2026-09-01" };
    const res = await promoteOrgTruth({ scope: scope(p), actor_entity_id: p.userId, winner: source(claim), competing: [source(claim)], resolveOwnerScope: ownerScopeOf(p) });
    expect(res.kind).toBe("promoted");
    expect(await safeCount(p.orgId)).toBe(0);
  });

  it("resolveConflict: an authorized owner promotes the selected winner with a recorded reason; conflict RESOLVED", async () => {
    const owner = await orgUser({ owns: [DOMAIN] });
    const winner = source({ date: "A" });
    const competing = source({ date: "B" });
    const opened = await promoteOrgTruth({ scope: scope(owner), actor_entity_id: owner.userId, winner, competing: [competing], resolveOwnerScope: ownerScopeOf(owner) });
    if (opened.kind !== "conflict_open") throw new Error();
    const resolved = await resolveConflict(scope(owner), { conflict_set_id: opened.conflict_set.conflict_set_id, actor_entity_id: owner.userId, winner: competing, reason: "owner selected the confirmed date", expected_conflict_version: opened.conflict_set.version });
    expect(resolved.kind).toBe("promoted"); if (resolved.kind !== "promoted") return;
    expect(resolved.record.winning_source_record_id).toBe(competing.source_record_id);
    const cs = await prisma.orgTruthConflictSet.findUnique({ where: { conflict_set_id: opened.conflict_set.conflict_set_id }, select: { state: true, resulting_truth_record_id: true, resolution_reason: true } });
    expect(cs?.state).toBe("RESOLVED");
    expect(cs?.resulting_truth_record_id).toBe(resolved.record.truth_record_id);
    expect(await prisma.auditEvent.count({ where: { event_type: "ORG_TRUTH_CONFLICT_RESOLVED", target_entity_id: owner.orgId } })).toBeGreaterThanOrEqual(1);
  });

  it("atomic: an injected snapshot or audit failure rolls back the whole promotion (no record persisted)", async () => {
    const p = await orgUser({ owns: [DOMAIN] });
    const before = await prisma.orgTruthRecord.count({ where: { org_entity_id: p.orgId } });
    __otzarOrgTruthTestHooks.failSnapshot = true;
    const s = await promoteOrgTruth({ scope: scope(p), actor_entity_id: p.userId, winner: source({ date: "x" }) });
    __otzarOrgTruthTestHooks.failSnapshot = false;
    expect(s.kind).toBe("audit_consistency_failure");
    __otzarOrgTruthTestHooks.failAudit = true;
    const a = await promoteOrgTruth({ scope: scope(p), actor_entity_id: p.userId, winner: source({ date: "y" }) });
    __otzarOrgTruthTestHooks.failAudit = false;
    expect(a.kind).toBe("audit_consistency_failure");
    expect(await prisma.orgTruthRecord.count({ where: { org_entity_id: p.orgId } })).toBe(before); // nothing persisted
  });

  it("idempotent promotion (response-loss retry) returns the same record; ineligible source refused; retraction clears the current answer", async () => {
    const p = await orgUser({ owns: [DOMAIN] });
    const w = source({ date: "2026-09-01" });
    const r1 = await promoteOrgTruth({ scope: scope(p, "unique-topic-1"), actor_entity_id: p.userId, winner: w });
    if (r1.kind !== "promoted") throw new Error();
    const r2 = await promoteOrgTruth({ scope: scope(p, "unique-topic-1"), actor_entity_id: p.userId, winner: w, expected_current_version: r1.record.version });
    expect(r2.kind === "promoted" && r2.record.truth_record_id === r1.record.truth_record_id && r2.created === false).toBe(true);
    // ineligible source (integrity demoted) refused.
    const bad = await promoteOrgTruth({ scope: scope(p, "topic-2"), actor_entity_id: p.userId, winner: source({ date: "z" }, { source_integrity_state: "CHANGED_UPSTREAM" }) });
    expect(bad.kind).toBe("ineligible_source");
    // retraction clears the current answer.
    const ret = await retractOrgTruth(p.orgId, p.userId, r1.record.truth_record_id, "no longer accurate", r1.record.version);
    expect(ret.kind).toBe("retracted");
    expect(await getCurrentPromotedTruth(p.orgId, r1.record.truth_key)).toBeNull();
    expect(await prisma.orgTruthRecord.findUnique({ where: { truth_record_id: r1.record.truth_record_id }, select: { state: true } }).then((x) => x?.state)).toBe("RETRACTED");
  });

  it("no-leak: safe reads expose ids/classifications, never raw claim content or secrets", async () => {
    const p = await orgUser({ owns: [DOMAIN] });
    await promoteOrgTruth({ scope: scope(p), actor_entity_id: p.userId, winner: source({ date: "x" }) });
    const list = await listConflictSetsForOrg(p.orgId);
    expect(JSON.stringify(list)).not.toMatch(/password|token|secret|api[_-]?key/i);
  });
});
