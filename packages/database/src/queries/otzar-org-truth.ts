// FILE: queries/otzar-org-truth.ts
// PURPOSE: [SECTION-10 ORG-TRUTH §9-§15] The governed organizational-truth promotion + conflict
//          runtime. A promoted OrgTruthRecord is the org's CURRENT answer for one exact truth key —
//          a governed materialization that POINTS at the winning source (WorkLedger/etc.) and
//          preserves the promotion lineage; it never replaces the source, the evidence, or the
//          lineage. Promotion is decision-rights-authorized (owns/can_approve the domain; recommend-
//          only can NEVER finalize), captures a point-in-time ORG_TRUTH_PROMOTION evidence snapshot
//          ATOMICALLY with the mutation + audit, and supersedes the prior promoted answer (never
//          mutates a promoted record into a different answer). Truth weight INFORMS review; it never
//          auto-authorizes a winner. A material UNRESOLVED conflict is never silently won: both
//          candidates are preserved in a materialized conflict set and exactly ONE idempotent
//          governed review obligation is raised. Clean promotion/supersession raise NO obligation.
// CONNECTS TO: otzar-truth-evidence (captureEvidenceSnapshot + ORG_TRUTH_PROMOTION_DECISION_POINT +
//          computeEvidenceFingerprint + computeOrgTruthKey), otzar-obligations (createOrGetObligation),
//          otzar-obligation-validation (validateSafeJson), audit.ts. Decision-rights authority is
//          read here directly from entity_decision_rights (a DB read — no apps/api dependency).

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../client.js";
import { writeAuditEvent, type AuditEventType } from "./audit.js";
import { validateSafeJson } from "./otzar-obligation-validation.js";
import {
  captureEvidenceSnapshot,
  computeEvidenceFingerprint,
  computeOrgTruthKey,
  ORG_TRUTH_PROMOTION_DECISION_POINT,
} from "./otzar-truth-evidence.js";
import { createOrGetObligation, type ObligationScope } from "./otzar-obligations.js";

export type OrgTruthState = "CANDIDATE" | "PROMOTED" | "DISPUTED" | "SUPERSEDED" | "RETRACTED";
export type ConflictSetState = "OPEN" | "UNDER_REVIEW" | "RESOLVED" | "SUPERSEDED" | "CANCELLED";

// [§7] Statuses of a source that make it ineligible to be considered/promoted.
const INELIGIBLE_INTEGRITY = new Set(["CHANGED_UPSTREAM", "ACCESS_REVOKED", "SOURCE_DELETED", "CORRUPT_OR_INVALID", "UNREADABLE"]);

export const __otzarOrgTruthTestHooks = { failAudit: false, failSnapshot: false };

// ── Safe projections ────────────────────────────────────────────────────────────────────────────

export interface SafeOrgTruthRecord {
  truth_record_id: string;
  org_entity_id: string;
  decision_domain: string;
  subject_ref: string | null;
  subject_ref_class: string | null;
  truth_key: string;
  state: string;
  version: number;
  winning_source_record_type: string | null;
  winning_source_record_id: string | null;
  winning_source_version: number | null;
  promotion_evidence_snapshot_id: string | null;
  truth_class: string | null;
  truth_weight_rank: number | null;
  authority_ref: string | null;
  promoter_entity_id: string | null;
  promoted_at: Date | null;
  supersedes_truth_record_id: string | null;
  superseded_by_truth_record_id: string | null;
  retraction_reason: string | null;
  conflict_set_ref: string | null;
  title: string | null;
  value: Record<string, unknown>;
  value_type: string | null;
  visibility_scope: string;
  created_at: Date;
  updated_at: Date;
}

const RECORD_SELECT = {
  truth_record_id: true, org_entity_id: true, decision_domain: true, subject_ref: true, subject_ref_class: true,
  truth_key: true, state: true, version: true, winning_source_record_type: true, winning_source_record_id: true,
  winning_source_version: true, promotion_evidence_snapshot_id: true, truth_class: true, truth_weight_rank: true,
  authority_ref: true, promoter_entity_id: true, promoted_at: true, supersedes_truth_record_id: true,
  superseded_by_truth_record_id: true, retraction_reason: true, conflict_set_ref: true, title: true, value: true,
  value_type: true, visibility_scope: true, created_at: true, updated_at: true,
} as const;

function toSafeRecord(row: Record<string, unknown>): SafeOrgTruthRecord {
  return { ...(row as unknown as SafeOrgTruthRecord), value: (row.value ?? {}) as Record<string, unknown> };
}

export interface SafeConflictSet {
  conflict_set_id: string;
  org_entity_id: string;
  truth_key: string;
  decision_domain: string;
  subject_ref: string | null;
  state: string;
  version: number;
  review_obligation_id: string | null;
  candidate_set_fingerprint: string | null;
  resulting_truth_record_id: string | null;
  resolution_reason: string | null;
  created_at: Date;
  updated_at: Date;
}
const CONFLICT_SELECT = {
  conflict_set_id: true, org_entity_id: true, truth_key: true, decision_domain: true, subject_ref: true,
  state: true, version: true, review_obligation_id: true, candidate_set_fingerprint: true,
  resulting_truth_record_id: true, resolution_reason: true, created_at: true, updated_at: true,
} as const;

// ── Candidate description (caller-resolved: the winning/competing sources + their classifications) ─

export interface SourceCandidate {
  source_record_type: string;
  source_record_id: string;
  source_version?: number | null;
  source_hash?: string | null;
  communication_act?: string | null;
  truth_class?: string | null;
  truth_weight_rank?: number | null;
  authority_status?: string | null;
  currentness?: string | null;
  source_integrity_state?: string | null;
  /** The structured claim value this source asserts (for material-conflict comparison). */
  claim?: Record<string, unknown> | null;
}

/** [§7] eligible iff integrity permits + not marked superseded/retracted. */
function candidateEligible(c: SourceCandidate): boolean {
  if (c.source_integrity_state != null && INELIGIBLE_INTEGRITY.has(c.source_integrity_state)) return false;
  if (c.currentness === "superseded" || c.currentness === "retracted") return false;
  return true;
}

/** [§11] Two candidates MATERIALLY conflict when their normalized structured claims differ. Equal
 *  (or absent) claims are NOT a conflict — harmless wording never opens one. */
function claimKey(c: SourceCandidate): string {
  return computeEvidenceFingerprint({ claim: c.claim ?? null });
}
function hasMaterialConflict(winner: SourceCandidate, others: readonly SourceCandidate[]): boolean {
  const wk = claimKey(winner);
  return others.some((o) => candidateEligible(o) && claimKey(o) !== wk);
}

function fingerprintCandidateSet(cands: readonly SourceCandidate[]): string {
  return computeEvidenceFingerprint({
    set: [...cands]
      .map((c) => ({ t: c.source_record_type, id: c.source_record_id, v: c.source_version ?? null, claim: c.claim ?? null }))
      .sort((a, b) => (a.id + a.t).localeCompare(b.id + b.t)),
  });
}

// ── Decision-rights authority (read directly; a promoter must own/can_approve the domain) ─────────

export type AuthorityOutcome = "authorized" | "recommend_only" | "unauthorized";

/** [§8] The exact domain authority. owns/can_approve ⇒ may finalize a promotion; recommend_only for
 *  the domain (and nothing stronger) ⇒ may submit/request only; anything else ⇒ unauthorized. */
export async function resolveOrgTruthAuthority(orgEntityId: string, actorEntityId: string, domain: string): Promise<AuthorityOutcome> {
  const ent = await prisma.entity.findUnique({ where: { entity_id: actorEntityId }, select: { status: true } });
  if (ent === null || ent.status !== "ACTIVE") return "unauthorized";
  const membership = await prisma.entityMembership.findFirst({ where: { parent_id: orgEntityId, child_id: actorEntityId, is_active: true }, select: { membership_id: true } });
  if (membership === null) return "unauthorized";
  const dr = await prisma.entityDecisionRights.findUnique({ where: { org_entity_id_entity_id: { org_entity_id: orgEntityId, entity_id: actorEntityId } }, select: { owns: true, can_approve: true, recommend_only: true } });
  if (dr === null) return "unauthorized";
  const owns = (dr.owns as string[]) ?? [];
  const canApprove = (dr.can_approve as string[]) ?? [];
  const recommend = (dr.recommend_only as string[]) ?? [];
  if (owns.includes(domain) || canApprove.includes(domain)) return "authorized";
  if (recommend.includes(domain)) return "recommend_only";
  return "unauthorized";
}

/** [§6/§11/§I] The current authorized domain owner (owns first, then can_approve) — the deterministic
 *  assignee for a conflict-review obligation. Never the model/scheduler/arbitrary member. */
export async function resolveDomainOwner(orgEntityId: string, domain: string): Promise<string | null> {
  const rows = await prisma.entityDecisionRights.findMany({ where: { org_entity_id: orgEntityId }, select: { entity_id: true, owns: true, can_approve: true }, orderBy: { entity_id: "asc" } });
  const owner = rows.find((r) => ((r.owns as string[]) ?? []).includes(domain));
  if (owner !== undefined) return owner.entity_id;
  const approver = rows.find((r) => ((r.can_approve as string[]) ?? []).includes(domain));
  return approver?.entity_id ?? null;
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002";
}

async function writeOrgTruthAudit(tx: Prisma.TransactionClient, event: AuditEventType, orgEntityId: string, actorEntityId: string, details: Record<string, unknown>): Promise<void> {
  if (__otzarOrgTruthTestHooks.failAudit) throw new Error("injected org-truth audit failure");
  await writeAuditEvent({ event_type: event, outcome: "SUCCESS", actor_entity_id: actorEntityId, target_entity_id: orgEntityId, details }, tx);
}

// ── Inputs ────────────────────────────────────────────────────────────────────────────────────

export interface OrgTruthScope {
  org_entity_id: string;
  decision_domain: string;
  subject_ref?: string | null;
  subject_ref_class?: string | null;
  workspace_id?: string | null;
  topic: string;
}

export interface PromoteOrgTruthInput {
  scope: OrgTruthScope;
  actor_entity_id: string;
  winner: SourceCandidate;
  competing?: SourceCandidate[];
  title?: string | null;
  value?: Record<string, unknown> | null;
  value_type?: string | null;
  reason?: string | null;
  /** CAS: the caller's expected current promoted version when replacing (else null = expect none). */
  expected_current_version?: number | null;
  /** [§6] Where a conflict-review obligation is raised (the domain owner's obligation scope). Resolved
   *  lazily — only when a material unresolved conflict is found. */
  resolveOwnerScope?: () => Promise<ObligationScope | null>;
}

export type PromoteResult =
  | { kind: "promoted"; record: SafeOrgTruthRecord; created: boolean }
  | { kind: "conflict_open"; conflict_set: SafeConflictSet; review_obligation_id: string | null }
  | { kind: "unauthorized" }
  | { kind: "recommend_only" }
  | { kind: "ineligible_source"; reason: string }
  | { kind: "invalid_content"; reason: string }
  | { kind: "state_changed" }
  | { kind: "audit_consistency_failure" };

/**
 * [§9] Governed promotion. Authorizes the actor for the domain, validates the winner's eligibility,
 * detects a material unresolved conflict (→ materialize conflict + one idempotent obligation, promote
 * NOTHING), else promotes EXACTLY the selected winner: captures the ORG_TRUTH_PROMOTION evidence
 * snapshot, inserts the PROMOTED record, supersedes the prior promoted answer (bidirectional link,
 * old snapshot preserved), and writes the audit — ALL atomic (snapshot/audit failure rolls back).
 */
export async function promoteOrgTruth(input: PromoteOrgTruthInput): Promise<PromoteResult> {
  const { scope, actor_entity_id, winner } = input;
  const org = scope.org_entity_id;
  const domain = scope.decision_domain;

  const auth = await resolveOrgTruthAuthority(org, actor_entity_id, domain);
  if (auth === "unauthorized") return { kind: "unauthorized" };
  if (auth === "recommend_only") return { kind: "recommend_only" };

  if (!candidateEligible(winner)) return { kind: "ineligible_source", reason: "winner_ineligible" };
  if (input.value != null) {
    const c = validateSafeJson(input.value);
    if (!c.ok) return { kind: "invalid_content", reason: `value: ${c.reason}` };
  }

  const truthKey = computeOrgTruthKeyLocal(scope);
  const competing = (input.competing ?? []).filter((c) => c.source_record_id !== winner.source_record_id);
  const allCands = [winner, ...competing];

  // [§11] Material unresolved conflict → open/update the conflict set + one idempotent obligation.
  if (hasMaterialConflict(winner, competing)) {
    return openConflict(org, domain, truthKey, scope.subject_ref ?? null, allCands, actor_entity_id, input.resolveOwnerScope);
  }

  // Clean promotion path.
  return doPromote(input, truthKey, org, domain, actor_entity_id, null);
}

// [§9] The atomic promotion core (also used by resolveConflict with an explicit conflict-set link).
async function doPromote(
  input: PromoteOrgTruthInput,
  truthKey: string,
  org: string,
  domain: string,
  actor: string,
  conflictSetId: string | null,
): Promise<PromoteResult> {
  const { scope, winner } = input;
  const fingerprint = computeEvidenceFingerprint({
    truth_key: truthKey, source_type: winner.source_record_type, source_id: winner.source_record_id,
    source_version: winner.source_version ?? null, source_hash: winner.source_hash ?? null,
    truth_class: winner.truth_class ?? null, authority: winner.authority_status ?? null,
  });
  const originKey = `org-truth-promotion:${truthKey}:${fingerprint}`;

  // Idempotency (response-loss retry): the same promotion (same winner → same origin_key) returns the
  // existing record BEFORE any CAS/supersede/create — so a retry never re-supersedes or collides.
  const already = await prisma.orgTruthRecord.findUnique({ where: { org_entity_id_origin_key: { org_entity_id: org, origin_key: originKey } }, select: RECORD_SELECT });
  if (already !== null) return { kind: "promoted", record: toSafeRecord(already as Record<string, unknown>), created: false };

  try {
    const created = await prisma.$transaction(async (tx) => {
      // CAS on the current promoted record for this key (expected version, or expect none).
      const current = await tx.orgTruthRecord.findFirst({ where: { org_entity_id: org, truth_key: truthKey, state: "PROMOTED" }, select: { truth_record_id: true, version: true } });
      if (input.expected_current_version != null) {
        if (current === null || current.version !== input.expected_current_version) throw new StateChanged();
      } else if (current !== null) {
        // A promoted record exists but the caller didn't expect one → stale (must supersede explicitly).
        throw new StateChanged();
      }

      // [§12] Capture the point-in-time promotion evidence snapshot ATOMICALLY.
      if (__otzarOrgTruthTestHooks.failSnapshot) throw new Error("injected snapshot failure");
      const newRecordId = randomUUID();
      const snap = await captureEvidenceSnapshot({
        org_entity_id: org, decision_point: ORG_TRUTH_PROMOTION_DECISION_POINT,
        source_record_type: winner.source_record_type, source_record_id: winner.source_record_id,
        source_version: winner.source_version ?? null, source_hash: winner.source_hash ?? null,
        actor_entity_id: actor,
        ...(scope.subject_ref != null ? { subject_ref: scope.subject_ref } : {}),
        ...(winner.communication_act != null ? { communication_act: winner.communication_act } : {}),
        ...(winner.truth_class != null ? { truth_class: winner.truth_class } : {}),
        ...(winner.truth_weight_rank != null ? { truth_weight_rank: winner.truth_weight_rank } : {}),
        ...(winner.authority_status != null ? { authority_class: winner.authority_status } : {}),
        ...(winner.currentness != null ? { currentness: winner.currentness } : {}),
        ...(winner.source_integrity_state != null ? { source_integrity_state: winner.source_integrity_state } : {}),
        origin_key: `org-truth-evidence:${truthKey}:${fingerprint}`,
        metadata: { truth_key: truthKey, org_truth_record_id: newRecordId, reason: input.reason ?? null },
      }, tx);
      if (snap.kind !== "ok") throw new Error("evidence_capture_failed");

      // Supersede the prior promoted answer (never mutate it to a different answer).
      if (current !== null) {
        await tx.orgTruthRecord.update({ where: { truth_record_id: current.truth_record_id }, data: { state: "SUPERSEDED", superseded_by_truth_record_id: newRecordId, version: { increment: 1 } } });
      }

      const row = await tx.orgTruthRecord.create({
        select: RECORD_SELECT,
        data: {
          truth_record_id: newRecordId, org_entity_id: org, decision_domain: domain,
          subject_ref: scope.subject_ref ?? null, subject_ref_class: scope.subject_ref_class ?? null,
          workspace_id: scope.workspace_id ?? null, truth_key: truthKey, state: "PROMOTED", version: 1,
          winning_source_record_type: winner.source_record_type, winning_source_record_id: winner.source_record_id,
          winning_source_version: winner.source_version ?? null, winning_source_hash: winner.source_hash ?? null,
          promotion_evidence_snapshot_id: snap.snapshot.snapshot_id, truth_class: winner.truth_class ?? null,
          truth_weight_rank: winner.truth_weight_rank ?? null, authority_ref: winner.authority_status ?? null,
          promoter_entity_id: actor, promoted_at: new Date(),
          supersedes_truth_record_id: current?.truth_record_id ?? null,
          conflict_set_ref: conflictSetId, title: input.title ?? null,
          value: (input.value ?? {}) as Prisma.InputJsonValue, value_type: input.value_type ?? null,
          origin_key: originKey,
        },
      });
      await writeOrgTruthAudit(tx, "ORG_TRUTH_PROMOTED", org, actor, {
        truth_record_id: newRecordId, truth_key: truthKey, decision_domain: domain,
        winning_source_record_type: winner.source_record_type, winning_source_record_id: winner.source_record_id,
        snapshot_id: snap.snapshot.snapshot_id, superseded_truth_record_id: current?.truth_record_id ?? null,
        conflict_set_ref: conflictSetId,
      });
      if (current !== null) {
        await writeOrgTruthAudit(tx, "ORG_TRUTH_SUPERSEDED", org, actor, { truth_record_id: current.truth_record_id, superseded_by: newRecordId, truth_key: truthKey });
      }
      return row;
    });
    return { kind: "promoted", record: toSafeRecord(created as Record<string, unknown>), created: true };
  } catch (e) {
    if (e instanceof StateChanged) return { kind: "state_changed" };
    if (isUniqueViolation(e)) {
      const existing = await prisma.orgTruthRecord.findUnique({ where: { org_entity_id_origin_key: { org_entity_id: org, origin_key: originKey } }, select: RECORD_SELECT });
      if (existing !== null) return { kind: "promoted", record: toSafeRecord(existing as Record<string, unknown>), created: false };
    }
    return { kind: "audit_consistency_failure" };
  }
}

class StateChanged extends Error {}

// ── Conflict materialization (§6/§11) ────────────────────────────────────────────────────────────

/** Open (or update) the materialized conflict set for a truth key and raise exactly ONE idempotent
 *  review obligation to the domain owner. Never promotes a silent winner. */
async function openConflict(
  org: string, domain: string, truthKey: string, subjectRef: string | null,
  candidates: readonly SourceCandidate[], actor: string,
  resolveOwnerScope?: () => Promise<ObligationScope | null>,
): Promise<PromoteResult> {
  const fingerprint = fingerprintCandidateSet(candidates);
  const setOriginKey = `org-truth-conflict-set:${truthKey}`;

  // Create-or-get the conflict set (one open set per truth key).
  let setRow = await prisma.orgTruthConflictSet.findUnique({ where: { org_entity_id_origin_key: { org_entity_id: org, origin_key: setOriginKey } }, select: { ...CONFLICT_SELECT } });
  if (setRow === null) {
    try {
      setRow = await prisma.orgTruthConflictSet.create({ select: CONFLICT_SELECT, data: { org_entity_id: org, truth_key: truthKey, decision_domain: domain, subject_ref: subjectRef, state: "OPEN", version: 1, candidate_set_fingerprint: fingerprint, origin_key: setOriginKey } });
    } catch (e) {
      if (isUniqueViolation(e)) { const got = await prisma.orgTruthConflictSet.findUnique({ where: { org_entity_id_origin_key: { org_entity_id: org, origin_key: setOriginKey } }, select: CONFLICT_SELECT }); if (got) setRow = got; }
      if (setRow === null) return { kind: "audit_consistency_failure" };
    }
  }
  const conflictSetId = setRow.conflict_set_id;

  // Preserve every eligible candidate (idempotent per (set, source)).
  for (const c of candidates) {
    if (!candidateEligible(c)) continue;
    try {
      await prisma.orgTruthConflictCandidate.create({ data: {
        conflict_set_id: conflictSetId, org_entity_id: org, source_record_type: c.source_record_type, source_record_id: c.source_record_id,
        source_version: c.source_version ?? null, source_hash: c.source_hash ?? null, communication_act: c.communication_act ?? null,
        truth_class: c.truth_class ?? null, truth_weight_rank: c.truth_weight_rank ?? null, authority_status: c.authority_status ?? null,
        currentness: c.currentness ?? null, source_integrity_state: c.source_integrity_state ?? null,
      } });
    } catch (e) { if (!isUniqueViolation(e)) throw e; /* candidate already preserved */ }
  }

  // The one idempotent review obligation per (conflict set, candidate-set fingerprint) — to the owner.
  let reviewObligationId: string | null = setRow.review_obligation_id;
  const ownerScope = resolveOwnerScope ? await resolveOwnerScope() : null;
  if (ownerScope !== null) {
    const obligationOrigin = `org-truth-conflict:${conflictSetId}:${fingerprint}`;
    const details = { review_class: "ORG_TRUTH_CONFLICT", conflict_set_id: conflictSetId, truth_key: truthKey, decision_domain: domain, candidate_count: candidates.length };
    const res = await createOrGetObligation(ownerScope, {
      obligation_type: "CLARIFICATION", title: "Organizational truth conflict — review required",
      creator_entity_id: actor, responsible_entity_id: ownerScope.subject_entity_id,
      origin_key: obligationOrigin, priority: "ELEVATED", details,
    }, { actor_entity_id: actor, extra_details: details });
    if (res.kind === "ok") reviewObligationId = res.obligation.obligation_id;
  }

  // Update the set (fingerprint + review obligation) atomically with the conflict audit.
  const opened = setRow.review_obligation_id === null;
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.orgTruthConflictSet.update({ where: { conflict_set_id: conflictSetId }, select: CONFLICT_SELECT, data: { candidate_set_fingerprint: fingerprint, review_obligation_id: reviewObligationId, version: { increment: 1 } } });
    await writeOrgTruthAudit(tx, opened ? "ORG_TRUTH_CONFLICT_OPENED" : "ORG_TRUTH_CONFLICT_UPDATED", org, actor, { conflict_set_id: conflictSetId, truth_key: truthKey, candidate_set_fingerprint: fingerprint, candidate_count: candidates.length });
    if (reviewObligationId !== null && opened) await writeOrgTruthAudit(tx, "ORG_TRUTH_REVIEW_OBLIGATION_CREATED", org, actor, { conflict_set_id: conflictSetId, review_obligation_id: reviewObligationId, truth_key: truthKey });
    return row;
  });
  return { kind: "conflict_open", conflict_set: updated as SafeConflictSet, review_obligation_id: reviewObligationId };
}

// ── Resolve a conflict (§8) — an authorized owner selects the winner WITH a recorded reason ────────

export interface ResolveConflictInput {
  conflict_set_id: string;
  actor_entity_id: string;
  winner: SourceCandidate;
  reason: string;
  expected_conflict_version: number;
  title?: string | null;
  value?: Record<string, unknown> | null;
  value_type?: string | null;
  expected_current_version?: number | null;
}
export type ResolveConflictResult = PromoteResult | { kind: "conflict_not_found" } | { kind: "conflict_stale" };

/** [§8/§10] Resolve a conflict by promoting the explicitly-selected winner (a lower-ranked source may
 *  win, but only here, with a recorded reason). Marks the set RESOLVED + records the resulting truth. */
export async function resolveConflict(scope: OrgTruthScope, input: ResolveConflictInput): Promise<ResolveConflictResult> {
  const org = scope.org_entity_id;
  const set = await prisma.orgTruthConflictSet.findFirst({ where: { conflict_set_id: input.conflict_set_id, org_entity_id: org }, select: { ...CONFLICT_SELECT } });
  if (set === null) return { kind: "conflict_not_found" };
  if (set.version !== input.expected_conflict_version) return { kind: "conflict_stale" };
  if (set.state === "RESOLVED" || set.state === "CANCELLED") return { kind: "conflict_stale" };

  const promote = await doPromote({
    scope, actor_entity_id: input.actor_entity_id, winner: input.winner, reason: input.reason,
    ...(input.title !== undefined ? { title: input.title } : {}), ...(input.value !== undefined ? { value: input.value } : {}),
    ...(input.value_type !== undefined ? { value_type: input.value_type } : {}),
    ...(input.expected_current_version !== undefined ? { expected_current_version: input.expected_current_version } : {}),
    // Promote under the conflict's OWN stored truth_key/domain — never a caller-recomputed key
    // (a reviewer can't reconstruct the embedded topic, and a mismatched scope must never promote
    // under a different key than the conflict being resolved).
  }, set.truth_key, org, set.decision_domain, input.actor_entity_id, input.conflict_set_id);

  if (promote.kind !== "promoted") return promote;

  await prisma.$transaction(async (tx) => {
    await tx.orgTruthConflictSet.update({ where: { conflict_set_id: input.conflict_set_id }, data: { state: "RESOLVED", resolved_at: new Date(), resolver_entity_id: input.actor_entity_id, resolution_reason: input.reason, winning_source_record_id: input.winner.source_record_id, resulting_truth_record_id: promote.record.truth_record_id, version: { increment: 1 } } });
    await writeOrgTruthAudit(tx, "ORG_TRUTH_CONFLICT_RESOLVED", org, input.actor_entity_id, { conflict_set_id: input.conflict_set_id, resulting_truth_record_id: promote.record.truth_record_id, reason: input.reason });
  });
  return promote;
}

// ── Retraction (§14) ──────────────────────────────────────────────────────────────────────────

export type RetractResult = { kind: "retracted"; record: SafeOrgTruthRecord } | { kind: "unauthorized" } | { kind: "recommend_only" } | { kind: "not_found" } | { kind: "state_changed" } | { kind: "audit_consistency_failure" };

export async function retractOrgTruth(org: string, actor: string, truthRecordId: string, reason: string, expectedVersion: number): Promise<RetractResult> {
  const rec = await prisma.orgTruthRecord.findFirst({ where: { truth_record_id: truthRecordId, org_entity_id: org }, select: { decision_domain: true, state: true, version: true } });
  if (rec === null) return { kind: "not_found" };
  const auth = await resolveOrgTruthAuthority(org, actor, rec.decision_domain);
  if (auth === "unauthorized") return { kind: "unauthorized" };
  if (auth === "recommend_only") return { kind: "recommend_only" };
  if (rec.state !== "PROMOTED" || rec.version !== expectedVersion) return { kind: "state_changed" };
  try {
    const updated = await prisma.$transaction(async (tx) => {
      const n = await tx.$executeRawUnsafe(`UPDATE org_truth_records SET state='RETRACTED', retraction_reason=$1, version=version+1, updated_at=now() WHERE truth_record_id=$2::uuid AND org_entity_id=$3::uuid AND version=$4::int AND state='PROMOTED'`, reason, truthRecordId, org, expectedVersion);
      if (n !== 1) throw new StateChanged();
      await writeOrgTruthAudit(tx, "ORG_TRUTH_RETRACTED", org, actor, { truth_record_id: truthRecordId, reason });
      const row = await tx.orgTruthRecord.findUnique({ where: { truth_record_id: truthRecordId }, select: RECORD_SELECT });
      return row;
    });
    return { kind: "retracted", record: toSafeRecord(updated as Record<string, unknown>) };
  } catch (e) {
    if (e instanceof StateChanged) return { kind: "state_changed" };
    return { kind: "audit_consistency_failure" };
  }
}

// ── Reads (§15) — the caller/service gates authority before calling ──────────────────────────────

export async function getCurrentPromotedTruth(org: string, truthKey: string): Promise<SafeOrgTruthRecord | null> {
  const row = await prisma.orgTruthRecord.findFirst({ where: { org_entity_id: org, truth_key: truthKey, state: "PROMOTED" }, select: RECORD_SELECT });
  return row === null ? null : toSafeRecord(row as Record<string, unknown>);
}
export async function getTruthRecord(org: string, truthRecordId: string): Promise<SafeOrgTruthRecord | null> {
  const row = await prisma.orgTruthRecord.findFirst({ where: { org_entity_id: org, truth_record_id: truthRecordId }, select: RECORD_SELECT });
  return row === null ? null : toSafeRecord(row as Record<string, unknown>);
}
export async function listConflictSetsForOrg(org: string, states?: ConflictSetState[]): Promise<Array<SafeConflictSet & { candidate_count: number }>> {
  const rows = await prisma.orgTruthConflictSet.findMany({ where: { org_entity_id: org, ...(states !== undefined ? { state: { in: states } } : {}) }, orderBy: { created_at: "desc" }, take: 100, select: CONFLICT_SELECT });
  if (rows.length === 0) return [];
  const counts = await prisma.orgTruthConflictCandidate.groupBy({ by: ["conflict_set_id"], where: { conflict_set_id: { in: rows.map((r) => (r as SafeConflictSet).conflict_set_id) } }, _count: { candidate_id: true } });
  const byId = new Map(counts.map((c) => [c.conflict_set_id, c._count.candidate_id]));
  return rows.map((r) => ({ ...(r as SafeConflictSet), candidate_count: byId.get((r as SafeConflictSet).conflict_set_id) ?? 0 }));
}
/** Safe candidate projection — safe classifications only (source authority/currentness/integrity/
 *  truth-weight for the reviewer comparison); NEVER raw source content, hashes, or metadata. */
export interface SafeConflictCandidate {
  source_record_type: string;
  source_record_id: string;
  source_version: number | null;
  communication_act: string | null;
  truth_class: string | null;
  truth_weight_rank: number | null;
  authority_status: string | null;
  currentness: string | null;
  source_integrity_state: string | null;
  permission_eligible: boolean;
  superseded: boolean;
  retracted: boolean;
  is_winner: boolean;
}
const CANDIDATE_SELECT = {
  source_record_type: true, source_record_id: true, source_version: true, communication_act: true,
  truth_class: true, truth_weight_rank: true, authority_status: true, currentness: true,
  source_integrity_state: true, permission_eligible: true, superseded: true, retracted: true, is_winner: true,
} as const;

export async function getConflictSet(org: string, conflictSetId: string): Promise<{ set: SafeConflictSet; candidates: SafeConflictCandidate[]; current_promoted_truth: SafeOrgTruthRecord | null } | null> {
  const set = await prisma.orgTruthConflictSet.findFirst({ where: { org_entity_id: org, conflict_set_id: conflictSetId }, select: CONFLICT_SELECT });
  if (set === null) return null; // inaccessible/foreign conflict is indistinguishable from absent
  const cands = await prisma.orgTruthConflictCandidate.findMany({ where: { conflict_set_id: conflictSetId }, select: CANDIDATE_SELECT, orderBy: [{ truth_weight_rank: "asc" }, { source_record_id: "asc" }], take: 100 });
  // The reviewer must see what their selection would replace. Resolved server-side from the
  // conflict's OWN stored truth_key (the client never reconstructs it) — authorized through the
  // conflict access above. Only a currently-PROMOTED record; the partial-unique index guarantees
  // at most one per key, so no multiple-current inconsistency is reachable. null ⇒ no current answer.
  const current = await getCurrentPromotedTruth(org, (set as SafeConflictSet).truth_key);
  return { set: set as SafeConflictSet, candidates: cands as SafeConflictCandidate[], current_promoted_truth: current };
}

// Local wrapper around the exported computeOrgTruthKey (keeps call sites terse).
function computeOrgTruthKeyLocal(scope: OrgTruthScope): string {
  return computeOrgTruthKey({ org_entity_id: scope.org_entity_id, decision_domain: scope.decision_domain, subject_ref_class: scope.subject_ref_class ?? null, subject_ref: scope.subject_ref ?? null, workspace_id: scope.workspace_id ?? null, topic: scope.topic });
}
