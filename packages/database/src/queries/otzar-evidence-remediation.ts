// FILE: queries/otzar-evidence-remediation.ts
// PURPOSE: [OTZAR STAGE-2 TRUTH-EVIDENCE §7] The SINGLE recheck→remediation core, shared by the
//          interactive per-record recheck (OtzarService.recheck{Obligation,Handoff}Evidence) and
//          the bounded auto-remediation SWEEP. Given a governed record (obligation/handoff), it
//          rechecks its FINAL-decision snapshots (REMEDIABLE_DECISION_POINTS only — never the
//          point-in-time HANDOFF_SEND) against the current source, and on a stale basis raises an
//          IDEMPOTENT SAFETY_CONCERN remediation obligation (atomic with its OBLIGATION_CREATED +
//          TRUTH_EVIDENCE_RECHECK_REQUIRED audits). The captured snapshots are NEVER mutated.
//          Idempotent per (record, exact stale-set) via origin_key — the same drift never
//          duplicates; a new drift raises a fresh remediation; concurrent workers converge to one.
// CONNECTS TO: otzar-truth-evidence (snapshots + recheck + audit), otzar-obligations
//          (createOrGetObligation). Imported by NEITHER of those (no cycle): the service + sweep
//          import THIS. This module implements the governed mutation ONLY — scope/responsible-party
//          resolution + access-gating are the caller's job (they differ: token vs. sweep principal).

import {
  createOrGetObligation,
  type ObligationScope,
} from "./otzar-obligations.js";
import {
  listSnapshotsForObligation,
  listSnapshotsForHandoff,
  resolveCurrentSourceStatus,
  writeEvidenceRecheckAudit,
  computeEvidenceFingerprint,
  EVIDENCE_STALE_STATUSES,
  REMEDIABLE_DECISION_POINTS,
} from "./otzar-truth-evidence.js";

export type RemediableRecordKind = "OBLIGATION" | "HANDOFF";

export interface StaleBasisRef {
  snapshot_id: string;
  decision_point: string;
  current_source_status: string;
}

/** The core outcome — the callers map it to their own response shape / failure codes / metrics. */
export type RecheckRemediateOutcome =
  | { kind: "current"; stale: []; snapshot_count: number }
  | { kind: "remediation"; stale: StaleBasisRef[]; remediation_obligation_id: string; created: boolean }
  | { kind: "would_remediate"; stale: StaleBasisRef[] } // dry-run only: stale found, nothing written
  | { kind: "no_remediation_scope"; stale: StaleBasisRef[] }
  | { kind: "invalid"; reason: string }
  | { kind: "invalid_reference"; reason: string }
  | { kind: "audit_uncommitted" };

export interface RecheckRemediateArgs {
  org_entity_id: string;
  record_kind: RemediableRecordKind;
  record_id: string;
  /** Where the remediation obligation is raised. Resolved LAZILY — only when a stale basis is
   *  found — so a still-current record never pays (or fails on) a scope resolution it doesn't need.
   *  Returns null when no governed obligation scope exists for the responsible party. */
  resolveRemediationScope: () => Promise<ObligationScope | null>;
  /** The party the remediation is assigned to. For an obligation: its current responsible party.
   *  For a handoff: the party that relied on the completed basis (caller / incoming party). */
  responsible_entity_id: string;
  /** Audit actor + remediation creator. */
  actor_entity_id: string;
  /** Link the remediation to the affected obligation (OBLIGATION only; handoffs have no FK link). */
  parent_obligation_id?: string;
  /** Write a TRUTH_EVIDENCE_RECHECKED audit on the still-current path. Interactive reads set this
   *  (a user action deserves a record); the sweep sets it false (bounded summary metrics instead —
   *  never one audit per unchanged record). The stale path ALWAYS audits (governed). */
  audit_current: boolean;
  /** [§L] Dry-run: perform the real scoped reads + status resolution, but on a stale basis create
   *  NO obligation and write NO audit — return `would_remediate` with the safe stale refs. Used by
   *  the sweep's administrative preview before activation. */
  dry_run?: boolean;
}

const REMEDIATION_TITLE: Record<RemediableRecordKind, string> = {
  OBLIGATION: "Evidence changed for a completed decision — review required",
  HANDOFF: "Evidence changed for a completed handoff — review required",
};

/**
 * Recheck one record's final-decision basis and, if stale, raise the idempotent remediation. Pure
 * governed logic — no token, no access-gate (the caller gates + resolves scope/party). Never
 * mutates a captured snapshot; never executes the affected record.
 */
export async function recheckRecordAndRemediate(args: RecheckRemediateArgs): Promise<RecheckRemediateOutcome> {
  const idKey = args.record_kind === "OBLIGATION" ? "obligation_id" : "handoff_id";
  const snapshots = (
    args.record_kind === "OBLIGATION"
      ? await listSnapshotsForObligation(args.org_entity_id, args.record_id)
      : await listSnapshotsForHandoff(args.org_entity_id, args.record_id)
  ).filter((s) => REMEDIABLE_DECISION_POINTS.includes(s.decision_point));

  const withStatus = await Promise.all(
    snapshots.map(async (s) => ({ s, status: await resolveCurrentSourceStatus(args.org_entity_id, s) })),
  );
  const stale: StaleBasisRef[] = withStatus
    .filter((x) => (EVIDENCE_STALE_STATUSES as readonly string[]).includes(x.status))
    .map((x) => ({ snapshot_id: x.s.snapshot_id, decision_point: x.s.decision_point, current_source_status: x.status }));

  // Still current → optionally record the recheck; no governed state changes.
  if (stale.length === 0) {
    if (args.audit_current) {
      const a = await writeEvidenceRecheckAudit({
        org_entity_id: args.org_entity_id, actor_entity_id: args.actor_entity_id,
        event_type: "TRUTH_EVIDENCE_RECHECKED", details: { [idKey]: args.record_id, snapshot_count: snapshots.length },
      });
      if (!a.ok) return { kind: "audit_uncommitted" };
    }
    return { kind: "current", stale: [], snapshot_count: snapshots.length };
  }

  // [§L] Dry-run stops here on a stale basis — real reads happened, nothing is written.
  if (args.dry_run === true) return { kind: "would_remediate", stale };

  // Stale basis → resolve the target scope only now (lazily), then raise the idempotent remediation.
  const scope = await args.resolveRemediationScope();
  if (scope === null) return { kind: "no_remediation_scope", stale };

  // The key binds to the exact stale set: the same drift is idempotent (no duplicate alert) while a
  // new drift raises a fresh remediation. Concurrent workers converge on one row via origin_key.
  const staleKey = computeEvidenceFingerprint({
    record_id: args.record_id,
    stale: [...stale].map((x) => ({ id: x.snapshot_id, status: x.current_source_status })).sort((p, q) => p.id.localeCompare(q.id)),
  });
  const originKey = `truth-remediation:${args.record_kind}:${args.record_id}:${staleKey}`;
  // SAFE content only — ids + safe status classes, never source text (validated by createOrGet).
  const recheckDetails: Record<string, unknown> = { evidence_recheck: { of_record_type: args.record_kind, of_record_id: args.record_id, stale } };

  const res = await createOrGetObligation(
    scope,
    {
      obligation_type: "SAFETY_CONCERN",
      title: REMEDIATION_TITLE[args.record_kind],
      creator_entity_id: args.actor_entity_id,
      responsible_entity_id: args.responsible_entity_id,
      origin_key: originKey,
      priority: "ELEVATED",
      ...(args.parent_obligation_id !== undefined ? { parent_obligation_id: args.parent_obligation_id } : {}),
      details: recheckDetails,
    },
    { actor_entity_id: args.actor_entity_id, extra_details: recheckDetails },
  );
  if (res.kind === "invalid_content" || res.kind === "invalid_state") return { kind: "invalid", reason: res.kind === "invalid_content" ? res.reason : res.reason };
  if (res.kind === "invalid_reference") return { kind: "invalid_reference", reason: res.reason };
  if (res.kind === "audit_consistency_failure") return { kind: "audit_uncommitted" };

  // Remediation persisted (atomic OBLIGATION_CREATED). Record RECHECK_REQUIRED. On the rare audit
  // failure here the remediation already exists + is itself audited; the idempotent origin_key lets
  // a retry return the same remediation and re-attempt this audit (self-healing).
  const a = await writeEvidenceRecheckAudit({
    org_entity_id: args.org_entity_id, actor_entity_id: args.actor_entity_id,
    event_type: "TRUTH_EVIDENCE_RECHECK_REQUIRED",
    details: { [idKey]: args.record_id, remediation_obligation_id: res.obligation.obligation_id, stale_count: stale.length },
  });
  if (!a.ok) return { kind: "audit_uncommitted" };

  return { kind: "remediation", stale, remediation_obligation_id: res.obligation.obligation_id, created: res.created };
}
