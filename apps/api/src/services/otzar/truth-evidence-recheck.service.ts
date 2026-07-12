// FILE: truth-evidence-recheck.service.ts
// PURPOSE: [OTZAR STAGE-2 TRUTH-EVIDENCE §7 — SWEEP] The bounded, fail-closed, per-org auto-
//          remediation sweep. It proactively closes DETECTION LATENCY: a completed decision's
//          basis that has gone stale (changed / superseded / retracted / unavailable) must not
//          stay unnoticed just because no user opened the record. The sweep ONLY identifies stale
//          FINAL-decision evidence and raises the existing idempotent SAFETY_CONCERN remediation
//          (via the shared recheckRecordAndRemediate core). It NEVER executes a clinical /
//          financial / legal / provider / customer action; it creates governed review work only.
//
// SAFETY MODEL (mirrors source-recheck.service.ts — the sanctioned rail):
//   - DISABLED BY DEFAULT. The scheduler fires the tick only when
//     OTZAR_TRUTH_EVIDENCE_RECHECK_ENABLED === "true". Merging/deploying does NOT activate scanning.
//   - FAIL-CLOSED ALLOWLIST. Acts ONLY on explicit org:actor pairs from
//     OTZAR_TRUTH_EVIDENCE_RECHECK_TARGETS. Empty/unset ⇒ no-op. An unlisted org cannot be touched —
//     demo-org safety is structural, not a denylist a config miss could defeat.
//   - GOVERNED ACTOR + ACTOR→ORG GUARD. Each target names a real, ACTIVE entity that resolves to
//     EXACTLY the configured org AND holds can_admin_org (governed remediation authority). It is the
//     audit actor + remediation creator — NOT a synthetic system identity, NEVER a global scan.
//   - BOUNDED. ≤ maxOrgsPerRun orgs, ≤ maxRecordsPerOrg records/org, ≤ maxRemediationsPerRun
//     creations/run; deterministic ordering; per-record isolation (one bad record never blocks the
//     sweep); no single sweep-wide transaction (each remediation keeps its own atomic obl+audit).
//   - IDEMPOTENT. The remediation origin_key is the final boundary: one remediation per (record,
//     exact stale-set), even across concurrent workers.
//   - QUIET + LEAK-SAFE. No per-unchanged-record audit; counts only; NO titles / details / source
//     text / PII / secrets in logs or metrics.
//   - SINGLE-INSTANCE. In-process running-guard (same assumption as the existing schedulers).
//
// CONNECTS TO: otzar-evidence-remediation (recheckRecordAndRemediate core), truth-evidence-recheck-
//          scheduler.ts (node-cron), governance/org.js (getOrgEntityId), twin-resolution.js
//          (resolvePrimaryTwin), @niov/database (getTARByEntityId).

import {
  prisma,
  getTARByEntityId,
  recheckRecordAndRemediate,
  REMEDIABLE_DECISION_POINTS,
  type ObligationScope,
} from "@niov/database";
import { getOrgEntityId } from "../governance/org.js";
import { resolvePrimaryTwin } from "./twin-resolution.js";
import { parseRecheckTargets, type RecheckTarget } from "./source-recheck.service.js";
import { logger } from "../../logger.js";

export const TRUTH_EVIDENCE_RECHECK_ENABLED_ENV = "OTZAR_TRUTH_EVIDENCE_RECHECK_ENABLED";
export const TRUTH_EVIDENCE_RECHECK_TARGETS_ENV = "OTZAR_TRUTH_EVIDENCE_RECHECK_TARGETS";

/** Per-outcome tallies — counts ONLY (leak-safe; no ids/content). */
export interface TruthEvidenceRecheckTotals {
  records_scanned: number;
  current: number;
  stale_found: number;          // stale bases detected (dry-run) OR that led to a create/existing
  remediation_created: number;
  remediation_existed: number;
  unresolved_assignment: number; // no valid responsible party / scope — never misassigned
  resolution_failed: number;
  audit_failed: number;
  skipped_limit: number;         // over the per-run remediation cap
}

export interface TruthEvidenceRecheckTickResult {
  enabled: boolean;
  dry_run: boolean;
  orgs_processed: number;
  orgs_skipped: number;          // bad config / actor not active / actor→org mismatch / not authorized
  totals: TruthEvidenceRecheckTotals;
  already_running: boolean;
}

export interface TruthEvidenceRecheckTickOptions {
  /** [§L] Real reads + resolution, but create nothing and write no audit. */
  dry_run?: boolean;
  /** Test/override caps (else the env-configured bounds apply). */
  maxOrgsPerRun?: number;
  maxRecordsPerOrg?: number;
  maxRemediationsPerRun?: number;
}

// WHAT: The activation flag. Missing / anything but "true" ⇒ disabled (fail-closed).
export function truthEvidenceRecheckEnabled(): boolean {
  return process.env[TRUTH_EVIDENCE_RECHECK_ENABLED_ENV] === "true";
}

// WHAT: Parse the fail-closed org:actor allowlist from this rail's own env var (reusing the shared
//       parser + convention). Empty/unset/malformed ⇒ [].
export function parseTruthEvidenceTargets(raw: string | undefined): RecheckTarget[] {
  return parseRecheckTargets(raw);
}

function boundedInt(envName: string, fallback: number, hardCap: number): number {
  const raw = Number.parseInt(process.env[envName] ?? "", 10);
  const v = Number.isFinite(raw) && raw > 0 ? raw : fallback;
  return Math.min(v, hardCap);
}
export function maxOrgsPerRun(): number { return boundedInt("OTZAR_TRUTH_EVIDENCE_RECHECK_MAX_ORGS_PER_RUN", 5, 50); }
export function maxRecordsPerOrg(): number { return boundedInt("OTZAR_TRUTH_EVIDENCE_RECHECK_MAX_RECORDS_PER_ORG", 100, 500); }
export function maxRemediationsPerRun(): number { return boundedInt("OTZAR_TRUTH_EVIDENCE_RECHECK_MAX_REMEDIATIONS_PER_RUN", 50, 500); }

const emptyTotals = (): TruthEvidenceRecheckTotals => ({
  records_scanned: 0, current: 0, stale_found: 0, remediation_created: 0, remediation_existed: 0,
  unresolved_assignment: 0, resolution_failed: 0, audit_failed: 0, skipped_limit: 0,
});

// In-process concurrency guard — one tick at a time (single-instance assumption).
let running = false;

/** Resolve a governed obligation scope for an arbitrary entity (org + primary twin), the same way
 *  interactive restoration does. Returns null when the entity is orgless/twin-less. */
async function scopeForEntity(entityId: string): Promise<ObligationScope | null> {
  let org: string | null;
  try { org = await getOrgEntityId(entityId); } catch { org = null; }
  if (org === null) return null;
  const twin = await resolvePrimaryTwin(entityId);
  if (twin === null) return null;
  return { org_entity_id: org, subject_entity_id: entityId, twin_entity_id: twin.twin.entity_id };
}

// WHAT: One sweep tick over the configured targets. The TEST SEAM — tests call this directly (the
//       scheduler gates enablement at fire time). Empty targets ⇒ no-op. Per-record isolation.
// WHY: bounded, quiet, governed proactive detection — reuses the exact idempotent remediation core.
export async function tickTruthEvidenceRecheck(
  targets: RecheckTarget[],
  opts: TruthEvidenceRecheckTickOptions = {},
): Promise<TruthEvidenceRecheckTickResult> {
  const dryRun = opts.dry_run === true;
  const totals = emptyTotals();
  const base: Omit<TruthEvidenceRecheckTickResult, "orgs_processed" | "orgs_skipped" | "already_running"> = {
    enabled: truthEvidenceRecheckEnabled(), dry_run: dryRun, totals,
  };
  if (targets.length === 0) return { ...base, orgs_processed: 0, orgs_skipped: 0, already_running: false };
  if (running) return { ...base, orgs_processed: 0, orgs_skipped: targets.length, already_running: true };

  running = true;
  let processed = 0;
  let skipped = 0;
  let remediationsThisRun = 0;
  const orgCap = opts.maxOrgsPerRun ?? maxOrgsPerRun();
  const recordCap = opts.maxRecordsPerOrg ?? maxRecordsPerOrg();
  const remediationCap = opts.maxRemediationsPerRun ?? maxRemediationsPerRun();
  try {
    const boundedTargets = targets.slice(0, orgCap);
    skipped += targets.length - boundedTargets.length;
    for (const target of boundedTargets) {
      // ── ACTOR→ORG authority guard ─────────────────────────────────────────────────────────────
      const ent = await prisma.entity.findUnique({ where: { entity_id: target.actorEntityId }, select: { status: true } });
      if (ent === null || ent.status !== "ACTIVE") { skipped += 1; logger.warn({ event: "truth_evidence_recheck.skip", org: target.orgEntityId, reason: "actor_inactive" }, "sweep skip"); continue; }
      let resolvedOrg: string | null;
      try { resolvedOrg = await getOrgEntityId(target.actorEntityId); } catch { resolvedOrg = null; }
      if (resolvedOrg !== target.orgEntityId) { skipped += 1; logger.warn({ event: "truth_evidence_recheck.skip", org: target.orgEntityId, reason: "actor_org_mismatch" }, "sweep skip"); continue; }
      const tar = await getTARByEntityId(target.actorEntityId);
      if (tar === null || tar.status !== "ACTIVE" || tar.can_admin_org !== true) { skipped += 1; logger.warn({ event: "truth_evidence_recheck.skip", org: target.orgEntityId, reason: "actor_unauthorized" }, "sweep skip"); continue; }
      processed += 1;

      // ── Eligible records: distinct sources with a FINAL-decision snapshot, deterministic + bounded ─
      const rows = await prisma.truthEvidenceSnapshot.findMany({
        where: { org_entity_id: target.orgEntityId, decision_point: { in: [...REMEDIABLE_DECISION_POINTS] }, source_record_type: { in: ["OBLIGATION", "HANDOFF"] } },
        select: { source_record_type: true, source_record_id: true },
        distinct: ["source_record_type", "source_record_id"],
        orderBy: [{ source_record_type: "asc" }, { source_record_id: "asc" }],
        take: recordCap,
      });

      for (const row of rows) {
        totals.records_scanned += 1;
        try {
          // Cap governed creations per run (dry-run never creates, so it is never capped here).
          if (!dryRun && remediationsThisRun >= remediationCap) { totals.skipped_limit += 1; continue; }
          const outcome = row.source_record_type === "OBLIGATION"
            ? await recheckOneObligation(target, row.source_record_id, dryRun)
            : await recheckOneHandoff(target, row.source_record_id, dryRun);
          switch (outcome) {
            case "current": totals.current += 1; break;
            case "would_remediate": totals.stale_found += 1; break;
            case "created": totals.stale_found += 1; totals.remediation_created += 1; remediationsThisRun += 1; break;
            case "existed": totals.stale_found += 1; totals.remediation_existed += 1; break;
            case "unresolved": totals.unresolved_assignment += 1; break;
            case "audit_failed": totals.audit_failed += 1; break;
            case "unavailable": totals.resolution_failed += 1; break;
          }
        } catch {
          // Per-record isolation (§F): a single failure never aborts the sweep. Fail closed — a
          // failed recheck is NOT treated as current.
          totals.resolution_failed += 1;
        }
      }
    }
  } finally {
    running = false;
  }
  return { ...base, orgs_processed: processed, orgs_skipped: skipped, already_running: false };
}

type RecordSweepOutcome = "current" | "would_remediate" | "created" | "existed" | "unresolved" | "audit_failed" | "unavailable";

async function recheckOneObligation(target: RecheckTarget, obligationId: string, dryRun: boolean): Promise<RecordSweepOutcome> {
  const o = await prisma.obligation.findFirst({
    where: { obligation_id: obligationId, org_entity_id: target.orgEntityId },
    select: { subject_entity_id: true, twin_entity_id: true, responsible_entity_id: true },
  });
  if (o === null) return "unavailable";
  // A governed obligation always has a twin scope; a null one can't be safely scoped → unresolved.
  if (o.twin_entity_id === null) return "unresolved";
  const scope: ObligationScope = { org_entity_id: target.orgEntityId, subject_entity_id: o.subject_entity_id, twin_entity_id: o.twin_entity_id };
  const outcome = await recheckRecordAndRemediate({
    org_entity_id: target.orgEntityId, record_kind: "OBLIGATION", record_id: obligationId,
    resolveRemediationScope: async () => scope, responsible_entity_id: o.responsible_entity_id,
    actor_entity_id: target.actorEntityId, parent_obligation_id: obligationId, audit_current: false, dry_run: dryRun,
  });
  return mapCoreOutcome(outcome);
}

async function recheckOneHandoff(target: RecheckTarget, handoffId: string, dryRun: boolean): Promise<RecordSweepOutcome> {
  const h = await prisma.handoff.findFirst({
    where: { handoff_id: handoffId, org_entity_id: target.orgEntityId },
    select: { incoming_responsible_entity_id: true },
  });
  // A completed handoff's basis is owned by the INCOMING party (who acted on it). No incoming party
  // ⇒ ambiguous ownership (§I) — do NOT guess; record as unresolved.
  if (h === null) return "unavailable";
  const incoming = h.incoming_responsible_entity_id;
  if (incoming === null) return "unresolved";
  const outcome = await recheckRecordAndRemediate({
    org_entity_id: target.orgEntityId, record_kind: "HANDOFF", record_id: handoffId,
    resolveRemediationScope: () => scopeForEntity(incoming), responsible_entity_id: incoming,
    actor_entity_id: target.actorEntityId, audit_current: false, dry_run: dryRun,
  });
  return mapCoreOutcome(outcome);
}

function mapCoreOutcome(outcome: Awaited<ReturnType<typeof recheckRecordAndRemediate>>): RecordSweepOutcome {
  switch (outcome.kind) {
    case "current": return "current";
    case "would_remediate": return "would_remediate";
    case "remediation": return outcome.created ? "created" : "existed";
    case "no_remediation_scope": return "unresolved";
    case "invalid": case "invalid_reference": return "unresolved"; // party/ref invalid ⇒ never misassigned
    case "audit_uncommitted": return "audit_failed";
  }
}
