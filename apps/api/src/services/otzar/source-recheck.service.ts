// FILE: source-recheck.service.ts
// PURPOSE: [INBOUND-RECHECK · Slice 1] The scheduled, bounded, per-org source
//          re-verification tick — the first safe inbound/ambient capability.
//          It periodically re-validates each configured org's ALREADY-IMPORTED
//          trusted Google-Doc sources using the existing source-integrity sink
//          (sourceHealthSweepForCaller → revalidateImportedDocForCaller), so a
//          trusted snapshot that rots upstream (changed / access-revoked /
//          deleted / corrupt) is surfaced proactively instead of only on manual
//          pull. It is NOT broad sync, NOT a Drive crawl, NOT a webhook, NOT
//          source ingestion — only bounded revalidation of sources the org
//          already imported.
// CONNECTS TO: source-health.service.ts (the bounded sweep sink),
//          governance/org.js (getOrgEntityId), source-recheck/scheduler.ts
//          (the node-cron registration), tests/integration/source-recheck.test.ts.
//
// SAFETY MODEL (why this cannot touch the demo org):
//   - FAIL-CLOSED ALLOWLIST. The rail acts ONLY on explicit `org:actor` targets
//     from SOURCE_RECHECK_TARGETS. Empty/unset ⇒ the tick is a no-op. An org that
//     is not listed CANNOT be touched — demo-org safety is structural, not a
//     denylist that a config miss could defeat.
//   - GOVERNED ACTOR. Each target names a real, ACTIVE org-admin entity as the
//     actor. The org's Google token is org-scoped; the actor is the audit actor
//     and the single notification recipient. NOT a synthetic system entity.
//   - ACTOR→ORG GUARD. A target is processed only if the actor is ACTIVE and
//     getOrgEntityId(actor) === the configured org — so a config typo can never
//     act on the wrong org.
//   - BOUNDED. ≤ SOURCE_HEALTH_SWEEP_MAX (50) docs/org (existing cap) and
//     ≤ maxOrgsPerRun orgs/run; a single in-process guard prevents overlapping
//     ticks. NO token/PII in logs.
//   - QUIET. auditMode + notifyMode "on_transition": unchanged rechecks emit no
//     audit and no notification; only real state changes are recorded/notified.
//
// SINGLE-INSTANCE ASSUMPTION: like the existing action/feedback schedulers, this
// cron has no distributed lock — it relies on the FND service running a single
// instance (render.yaml `plan: starter`, no scaling block). If the service is
// ever scaled to >1 instance, ALL existing cron schedulers would double; a Redis
// SETNX+TTL lock (the NonceStore substrate exists) would be the fix then.

import { prisma } from "@niov/database";
import { getOrgEntityId } from "../governance/org.js";
import {
  SOURCE_HEALTH_SWEEP_MAX,
  sourceHealthSweepForCaller,
  type SourceHealthSweepSummary,
} from "./source-health.service.js";
import type { RevalidateOptions } from "./document-context.service.js";

export interface RecheckTarget {
  orgEntityId: string;
  actorEntityId: string;
}

export interface SourceRecheckTickResult {
  /** Targets that ran a sweep. */
  orgs_processed: number;
  /** Targets skipped (bad config / actor not active / actor→org mismatch / ineligible). */
  orgs_skipped: number;
  /** Aggregate per-outcome tallies across all processed orgs. */
  totals: SourceHealthSweepSummary;
  /** True when a run was already in progress and this tick was skipped whole. */
  already_running: boolean;
}

/** Per-run cap on orgs (env SOURCE_RECHECK_MAX_ORGS_PER_RUN, default 10). */
export function maxOrgsPerRun(): number {
  const raw = Number.parseInt(process.env.SOURCE_RECHECK_MAX_ORGS_PER_RUN ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 10;
}

// WHAT: Parse the fail-closed target allowlist from env.
// INPUT: `SOURCE_RECHECK_TARGETS` = "<orgId>:<actorId>[,<orgId>:<actorId>...]".
// OUTPUT: the parsed targets (empty array when unset/blank/malformed).
// WHY: The rail acts ONLY on explicitly-listed orgs — the structural demo-org
//      guard. Malformed entries are dropped (not guessed).
export function parseRecheckTargets(raw: string | undefined): RecheckTarget[] {
  if (raw === undefined || raw.trim().length === 0) return [];
  const targets: RecheckTarget[] = [];
  for (const chunk of raw.split(",")) {
    const [org, actor] = chunk.split(":").map((s) => s.trim());
    if (typeof org === "string" && org.length > 0 && typeof actor === "string" && actor.length > 0) {
      targets.push({ orgEntityId: org, actorEntityId: actor });
    }
  }
  return targets;
}

// In-process concurrency guard — one tick at a time (single-instance assumption).
let running = false;

const EMPTY_TOTALS: () => SourceHealthSweepSummary = () => ({
  checked: 0,
  verified: 0,
  changed_upstream: 0,
  access_revoked: 0,
  source_deleted: 0,
  corrupt: 0,
  unavailable: 0,
  notified: 0,
});

// WHAT: One scheduled recheck tick over the configured targets.
// INPUT: the parsed targets (+ an injectable fetch seam so tests drive the
//        changed/deleted/revoked/transient branches with NO real network).
// OUTPUT: an aggregate summary; token/PII-free.
// WHY: bounded, quiet, governed proactive re-verification — reuses the exact
//      snapshot-preserving per-doc probe + the class-aware notification.
export async function tickSourceRecheck(
  targets: RecheckTarget[],
  opts?: RevalidateOptions,
): Promise<SourceRecheckTickResult> {
  const totals = EMPTY_TOTALS();
  if (targets.length === 0) {
    return { orgs_processed: 0, orgs_skipped: 0, totals, already_running: false };
  }
  if (running) {
    // Never overlap sweeps — a slow run must not be doubled by the next tick.
    return { orgs_processed: 0, orgs_skipped: targets.length, totals, already_running: true };
  }
  running = true;
  let processed = 0;
  let skipped = 0;
  try {
    const bounded = targets.slice(0, maxOrgsPerRun());
    skipped += targets.length - bounded.length; // over-cap targets are skipped this run
    for (const target of bounded) {
      // ACTOR→ORG guard: the actor must be ACTIVE and resolve to exactly the
      // configured org — a config typo can never act on / notify the wrong org.
      const entity = await prisma.entity.findUnique({
        where: { entity_id: target.actorEntityId },
        select: { status: true },
      });
      if (entity === null || entity.status !== "ACTIVE") {
        skipped += 1;
        continue;
      }
      let resolvedOrg: string | null = null;
      try {
        resolvedOrg = await getOrgEntityId(target.actorEntityId);
      } catch {
        resolvedOrg = null;
      }
      if (resolvedOrg !== target.orgEntityId) {
        skipped += 1;
        continue;
      }

      // Reuse the bounded sweep with transition-gated audit + notification.
      const result = await sourceHealthSweepForCaller(
        target.actorEntityId,
        { ...opts, auditMode: "on_transition" },
        { notifyMode: "on_transition" },
      );
      if (result.ok === false) {
        skipped += 1;
        continue;
      }
      processed += 1;
      const s = result.summary;
      totals.checked += s.checked;
      totals.verified += s.verified;
      totals.changed_upstream += s.changed_upstream;
      totals.access_revoked += s.access_revoked;
      totals.source_deleted += s.source_deleted;
      totals.corrupt += s.corrupt;
      totals.unavailable += s.unavailable;
      totals.notified += s.notified;
    }
  } finally {
    running = false;
  }
  return { orgs_processed: processed, orgs_skipped: skipped, totals, already_running: false };
}

// Re-export the per-org cap so callers/tests can assert the bound in one place.
export { SOURCE_HEALTH_SWEEP_MAX };
