// FILE: queries/otzar-truth-evidence.ts
// PURPOSE: [OTZAR STAGE-2 TRUTH-EVIDENCE] Persist + read POINT-IN-TIME evidence snapshots for
//          governed responsibility decisions. Reuses the existing truth substrate (communication-
//          lineage / truth-weight / source-integrity) as the RESOLVER of the values; this layer
//          only PERSISTS the resolved result + a deterministic evidence fingerprint + the governed
//          target, so a later correction/retraction/upstream-change never rewrites a past
//          decision's evidentiary basis (the captured basis is immutable; current status is a
//          separate re-resolvable projection). Capture is ATOMIC with its
//          TRUTH_EVIDENCE_SNAPSHOT_CAPTURED audit (and composes inside a decision transaction when
//          a tx is supplied). SAFE content only — never raw source content, tokens, or policy
//          internals (ADR-0057 §16).
// CONNECTS TO: otzar.service.ts (obligation/handoff decision points), otzar-obligation-validation
//          (safe-JSON), audit.ts. Resolver enrichment (communication_act/truth_class/…) is
//          supplied by the caller from the existing truth services.

import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../client.js";
import { writeAuditEvent, type AuditEventType } from "./audit.js";
import { validateSafeJson } from "./otzar-obligation-validation.js";

export const RESOLVER_VERSION = "truth-evidence/1";

export const __otzarTruthEvidenceTestHooks = { failAudit: false };

/** Safe projection — identifiers, hashes, safe classifications, versions; never raw source
 *  content or unrestricted policy internals. */
export interface SafeEvidenceSnapshot {
  snapshot_id: string;
  decision_point: string;
  source_record_type: string;
  source_record_id: string;
  source_version: number | null;
  source_hash: string | null;
  source_timestamp: Date | null;
  source_system: string | null;
  source_integrity_state: string | null;
  communication_act: string | null;
  truth_class: string | null;
  truth_weight_rank: number | null;
  authority_class: string | null;
  currentness: string | null;
  conflict_indicator: boolean;
  superseded_at_capture: boolean;
  captured_at: Date;
  resolver_version: string;
  evidence_fingerprint: string;
  obligation_id: string | null;
  handoff_id: string | null;
}

const SNAPSHOT_SELECT = {
  snapshot_id: true, decision_point: true, source_record_type: true, source_record_id: true,
  source_version: true, source_hash: true, source_timestamp: true, source_system: true,
  source_integrity_state: true, communication_act: true, truth_class: true, truth_weight_rank: true,
  authority_class: true, currentness: true, conflict_indicator: true, superseded_at_capture: true,
  captured_at: true, resolver_version: true, evidence_fingerprint: true, obligation_id: true, handoff_id: true,
} as const;

type SnapshotRow = {
  snapshot_id: string; decision_point: string; source_record_type: string; source_record_id: string;
  source_version: number | null; source_hash: string | null; source_timestamp: Date | null; source_system: string | null;
  source_integrity_state: string | null; communication_act: string | null; truth_class: string | null; truth_weight_rank: number | null;
  authority_class: string | null; currentness: string | null; conflict_indicator: boolean; superseded_at_capture: boolean;
  captured_at: Date; resolver_version: string; evidence_fingerprint: string; obligation_id: string | null; handoff_id: string | null;
};

function toSafe(row: SnapshotRow): SafeEvidenceSnapshot {
  return { ...row };
}

// ── Deterministic evidence fingerprint ─────────────────────────────────────────────────────────

/** Canonical (sorted-key, null-omitted) serialization → sha-256. Deterministic: equivalent
 *  evidence yields the same fingerprint; a changed source version/hash/lineage yields a different
 *  one. Never includes volatile fields (capture time, ids of the snapshot itself). */
export function computeEvidenceFingerprint(fields: Record<string, unknown>): string {
  const canonical = (v: unknown): unknown => {
    if (v === null || v === undefined) return null;
    if (Array.isArray(v)) return v.map(canonical);
    if (typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(v as Record<string, unknown>).sort()) {
        const cv = canonical((v as Record<string, unknown>)[k]);
        if (cv !== null) out[k] = cv;
      }
      return out;
    }
    return v;
  };
  return createHash("sha256").update(JSON.stringify(canonical(fields))).digest("hex");
}

// ── Capture ────────────────────────────────────────────────────────────────────────────────────

/**
 * The resolved truth-substrate values a decision relied upon, resolved by the SERVICE from the
 * EXISTING substrate (communication-lineage → truth-weight → source-integrity) and threaded into
 * the atomic capture. Data-only (the query layer can't import the apps/api resolvers — dependency
 * direction). Only fields with a real resolver are here; the `*_ref` fields are intentionally
 * absent (no producer exists — we never fabricate provenance).
 */
export interface EvidenceEnrichment {
  communication_act?: string | null;
  truth_class?: string | null;
  truth_weight_rank?: number | null;
  authority_class?: string | null;
  currentness?: string | null;
  source_integrity_state?: string | null;
}

export interface CaptureEvidenceInput {
  org_entity_id: string;
  decision_point: string;
  source_record_type: string;
  source_record_id: string;
  actor_entity_id: string;
  // point-in-time
  source_version?: number | null;
  source_hash?: string | null;
  source_timestamp?: Date | null;
  source_system?: string | null;
  source_integrity_state?: string | null;
  // resolved lineage/truth (from the existing services; optional enrichment)
  communication_act?: string | null;
  truth_class?: string | null;
  truth_weight_rank?: number | null;
  authority_class?: string | null;
  authority_lineage_ref?: string | null;
  agreement_lineage_ref?: string | null;
  decision_rights_ref?: string | null;
  currentness?: string | null;
  permission_snapshot?: Record<string, unknown> | null;
  conflict_indicator?: boolean;
  conflict_set_ref?: string | null;
  superseded_at_capture?: boolean;
  metadata?: Record<string, unknown>;
  // scope + linkage
  subject_entity_id?: string | null;
  twin_entity_id?: string | null;
  subject_ref?: string | null;
  subject_ref_class?: string | null;
  obligation_id?: string | null;
  handoff_id?: string | null;
  handoff_obligation_id?: string | null;
  request_record_id?: string | null;
  action_ref?: string | null;
  source_turn_id?: string | null;
  conversation_id?: string | null;
  /** Deterministic idempotency key per decision. When omitted, one is derived from
   *  (decision_point, target/source, fingerprint). */
  origin_key?: string | null;
}

export type CaptureResult =
  | { kind: "ok"; snapshot: SafeEvidenceSnapshot; created: boolean; fingerprint: string }
  | { kind: "invalid_content"; reason: string }
  | { kind: "audit_consistency_failure" };

function fingerprintOf(input: CaptureEvidenceInput): string {
  return computeEvidenceFingerprint({
    org: input.org_entity_id, decision_point: input.decision_point,
    source_record_type: input.source_record_type, source_record_id: input.source_record_id,
    source_version: input.source_version ?? null, source_hash: input.source_hash ?? null,
    communication_act: input.communication_act ?? null, truth_class: input.truth_class ?? null,
    truth_weight_rank: input.truth_weight_rank ?? null, authority_class: input.authority_class ?? null,
    authority_lineage_ref: input.authority_lineage_ref ?? null, agreement_lineage_ref: input.agreement_lineage_ref ?? null,
    decision_rights_ref: input.decision_rights_ref ?? null, source_integrity_state: input.source_integrity_state ?? null,
    currentness: input.currentness ?? null, conflict_set_ref: input.conflict_set_ref ?? null,
    superseded_at_capture: input.superseded_at_capture ?? false, resolver_version: RESOLVER_VERSION,
  });
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002";
}

/**
 * Capture (or idempotently return) an evidence snapshot, ATOMIC with its
 * TRUTH_EVIDENCE_SNAPSHOT_CAPTURED audit. When `tx` is supplied it composes inside the caller's
 * decision transaction (so the snapshot lands iff the decision commits). Idempotent per
 * (org, origin_key). Safe-JSON validates metadata + permission_snapshot.
 */
export async function captureEvidenceSnapshot(input: CaptureEvidenceInput, tx?: Prisma.TransactionClient): Promise<CaptureResult> {
  if (input.metadata !== undefined) {
    const c = validateSafeJson(input.metadata);
    if (!c.ok) return { kind: "invalid_content", reason: `metadata: ${c.reason}` };
  }
  if (input.permission_snapshot != null) {
    const c = validateSafeJson(input.permission_snapshot);
    if (!c.ok) return { kind: "invalid_content", reason: `permission_snapshot: ${c.reason}` };
  }
  const fingerprint = fingerprintOf(input);
  const originKey = input.origin_key ?? `${input.decision_point}:${input.handoff_id ?? input.obligation_id ?? input.source_record_id}:${fingerprint}`;

  const data: Prisma.TruthEvidenceSnapshotUncheckedCreateInput = {
    org_entity_id: input.org_entity_id, decision_point: input.decision_point,
    source_record_type: input.source_record_type, source_record_id: input.source_record_id,
    source_version: input.source_version ?? null, source_hash: input.source_hash ?? null,
    source_timestamp: input.source_timestamp ?? null, source_system: input.source_system ?? null,
    source_integrity_state: input.source_integrity_state ?? null,
    communication_act: input.communication_act ?? null, truth_class: input.truth_class ?? null,
    truth_weight_rank: input.truth_weight_rank ?? null, authority_class: input.authority_class ?? null,
    authority_lineage_ref: input.authority_lineage_ref ?? null, agreement_lineage_ref: input.agreement_lineage_ref ?? null,
    decision_rights_ref: input.decision_rights_ref ?? null, currentness: input.currentness ?? null,
    permission_snapshot: input.permission_snapshot != null ? (input.permission_snapshot as Prisma.InputJsonValue) : Prisma.JsonNull,
    conflict_indicator: input.conflict_indicator ?? false, conflict_set_ref: input.conflict_set_ref ?? null,
    superseded_at_capture: input.superseded_at_capture ?? false,
    resolver_version: RESOLVER_VERSION, evidence_fingerprint: fingerprint,
    metadata: (input.metadata ?? {}) as Prisma.InputJsonValue, origin_key: originKey,
    subject_entity_id: input.subject_entity_id ?? null, twin_entity_id: input.twin_entity_id ?? null,
    subject_ref: input.subject_ref ?? null, subject_ref_class: input.subject_ref_class ?? null,
    obligation_id: input.obligation_id ?? null, handoff_id: input.handoff_id ?? null,
    handoff_obligation_id: input.handoff_obligation_id ?? null, request_record_id: input.request_record_id ?? null,
    action_ref: input.action_ref ?? null, source_turn_id: input.source_turn_id ?? null, conversation_id: input.conversation_id ?? null,
  };

  const run = async (client: Prisma.TransactionClient): Promise<{ row: SnapshotRow; created: boolean }> => {
    const row = await client.truthEvidenceSnapshot.create({ select: SNAPSHOT_SELECT, data });
    if (__otzarTruthEvidenceTestHooks.failAudit) throw new Error("injected truth-evidence audit failure");
    await writeAuditEvent({
      event_type: "TRUTH_EVIDENCE_SNAPSHOT_CAPTURED", outcome: "SUCCESS", actor_entity_id: input.actor_entity_id, target_entity_id: input.org_entity_id,
      details: { snapshot_id: row.snapshot_id, decision_point: input.decision_point, source_record_type: input.source_record_type, source_record_id: input.source_record_id, evidence_fingerprint: fingerprint, truth_class: input.truth_class ?? null },
    }, client);
    return { row: row as unknown as SnapshotRow, created: true };
  };

  try {
    const result = tx !== undefined ? await run(tx) : await prisma.$transaction((c) => run(c));
    return { kind: "ok", snapshot: toSafe(result.row), created: result.created, fingerprint };
  } catch (e) {
    if (isUniqueViolation(e)) {
      const existing = await prisma.truthEvidenceSnapshot.findUnique({ where: { org_entity_id_origin_key: { org_entity_id: input.org_entity_id, origin_key: originKey } }, select: SNAPSHOT_SELECT });
      if (existing !== null) return { kind: "ok", snapshot: toSafe(existing as unknown as SnapshotRow), created: false, fingerprint };
    }
    // Audit (or the tx) failed → the capture (and, when composed, the decision) rolls back.
    return { kind: "audit_consistency_failure" };
  }
}

// ── Reads (parent access is verified by the caller/service before listing) ──────────────────────

export async function listSnapshotsForObligation(orgEntityId: string, obligationId: string): Promise<SafeEvidenceSnapshot[]> {
  const rows = await prisma.truthEvidenceSnapshot.findMany({ where: { org_entity_id: orgEntityId, obligation_id: obligationId }, orderBy: { captured_at: "desc" }, take: 100, select: SNAPSHOT_SELECT });
  return rows.map((r) => toSafe(r as unknown as SnapshotRow));
}

export async function listSnapshotsForHandoff(orgEntityId: string, handoffId: string): Promise<SafeEvidenceSnapshot[]> {
  const rows = await prisma.truthEvidenceSnapshot.findMany({ where: { org_entity_id: orgEntityId, handoff_id: handoffId }, orderBy: { captured_at: "desc" }, take: 100, select: SNAPSHOT_SELECT });
  return rows.map((r) => toSafe(r as unknown as SnapshotRow));
}

// ── Current-status recheck (§6: captured vs current — never mutates the snapshot) ───────────────

export type CurrentSourceStatus = "unchanged" | "changed" | "superseded" | "retracted" | "unavailable" | "unknown";

/**
 * Re-resolve whether the captured source is currently unchanged. The captured snapshot is NEVER
 * mutated; this is a separate projection (§6). For OBLIGATION/HANDOFF sources it compares the
 * captured source_version to the current row's version and terminal state.
 */
export async function resolveCurrentSourceStatus(orgEntityId: string, snapshot: { source_record_type: string; source_record_id: string; source_version: number | null }): Promise<CurrentSourceStatus> {
  if (snapshot.source_version === null) return "unknown";
  if (snapshot.source_record_type === "OBLIGATION") {
    const o = await prisma.obligation.findFirst({ where: { obligation_id: snapshot.source_record_id, org_entity_id: orgEntityId }, select: { version: true, state: true } });
    if (o === null) return "unavailable";
    if (o.state === "SUPERSEDED") return "superseded";
    if (o.state === "CANCELLED" || o.state === "EXPIRED") return "retracted";
    return o.version === snapshot.source_version ? "unchanged" : "changed";
  }
  if (snapshot.source_record_type === "HANDOFF") {
    const h = await prisma.handoff.findFirst({ where: { handoff_id: snapshot.source_record_id, org_entity_id: orgEntityId }, select: { version: true, state: true } });
    if (h === null) return "unavailable";
    if (h.state === "SUPERSEDED") return "superseded";
    return h.version === snapshot.source_version ? "unchanged" : "changed";
  }
  return "unknown";
}

// ── Recheck → remediation (§7: a changed/retracted basis must be surfaced, not silently kept) ────

/** Statuses that mean a past decision's captured basis is NO LONGER current — the trigger for a
 *  governed remediation. `unchanged`/`unknown` are NOT stale (unknown = no version to compare, so
 *  we never raise a false remediation on it). */
export const EVIDENCE_STALE_STATUSES: readonly CurrentSourceStatus[] = ["changed", "superseded", "retracted", "unavailable"];

/**
 * Decision points whose snapshot is a DURABLE FINAL basis — the recorded decision is terminal and
 * its evidence is expected to remain current, so a later drift IS a governed remediation. Point-in-
 * time-by-design snapshots (e.g. HANDOFF_SEND, which pins the send-time version and is EXPECTED to
 * diverge as the handoff progresses through receive/ack/complete) are deliberately EXCLUDED — they
 * must never raise a false remediation on normal lifecycle progression. Only final-decision
 * snapshots gate remediation.
 */
export const REMEDIABLE_DECISION_POINTS: readonly string[] = ["OBLIGATION_COMPLETION", "HANDOFF_COMPLETION"];

export type EvidenceRecheckEvent = "TRUTH_EVIDENCE_RECHECK_REQUIRED" | "TRUTH_EVIDENCE_RECHECKED";

/**
 * Write the recheck audit (RECHECKED when the basis is still current; RECHECK_REQUIRED when a
 * remediation was raised). A single append-only audit row — atomic on its own. Returns a typed
 * failure (never swallows to a silent success): the caller surfaces AUDIT_UNCOMMITTED and retries.
 * The remediation obligation is idempotent (origin_key), so a retry heals a rare failure here
 * without duplicating the alert.
 */
export async function writeEvidenceRecheckAudit(input: { org_entity_id: string; actor_entity_id: string; event_type: EvidenceRecheckEvent; details: Record<string, unknown> }): Promise<{ ok: boolean }> {
  try {
    if (__otzarTruthEvidenceTestHooks.failAudit) throw new Error("injected recheck audit failure");
    await writeAuditEvent({ event_type: input.event_type, outcome: "SUCCESS", actor_entity_id: input.actor_entity_id, target_entity_id: input.org_entity_id, details: input.details });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
