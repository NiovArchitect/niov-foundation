// FILE: operational-analytics.service.ts
// PURPOSE: Phase 1285-Z — advisory OPERATIONAL_ANALYTICS over the governed
//          execution substrate. Foundation assembles a SCOPED execution-health
//          snapshot (deterministic metrics + top risk items over durable Work
//          Ledger / watcher / risk / execution-attempt state), computes a
//          deterministic health score + status (PRIMARY — never depends on
//          Python), and OPTIONALLY asks the advisory Python analyzer to enrich
//          the qualitative narrative (summary / top risks / recurring blockers /
//          overloaded people / focus / recommended next actions). Foundation
//          re-validates + re-scopes the narrative; Python introduces no work, no
//          person, no id outside the snapshot, sends nothing, and creates
//          nothing. No flow blocks on Python.
// CONNECTS TO: routes/work-os-ledger.routes.ts (the /work-os/operational-health
//          route); work-os/watcher.service.ts + work-os/risk-scoring.service.ts
//          (deterministic finding + risk sources); intelligence/
//          python-analytics.service.ts (advisory client); intelligence/
//          python-intelligence.ts (envelope + validation); packages/database
//          (prisma); tests/unit/operational-analytics.test.ts.

import { randomUUID } from "node:crypto";
import { prisma } from "@niov/database";
import { getWatcherFeed } from "./watcher.service.js";
import { assessFindingsDeterministic } from "./risk-scoring.service.js";
import {
  analyzeOperationalSnapshot,
  type OperationalAnalyticsRuntimeConfig,
  type OperationalSnapshotItem,
  type OperationalSnapshotMetrics,
  type OperationalSnapshotPayload,
} from "../intelligence/python-analytics.service.js";
import {
  buildOperationalAnalyticsEnvelope,
  validateOperationalAnalyticsEnvelope,
  type OperationalAnalyticsCandidate,
  type PythonIntelligenceEnvelope,
} from "../intelligence/python-intelligence.js";

export type OperationalScope = "personal" | "team" | "org";

export interface OperationalHealthAssessment {
  scope: OperationalScope;
  health_score: number; // deterministic — Foundation-authoritative
  execution_status: string; // deterministic — HEALTHY | WATCH | AT_RISK | CRITICAL
  summary: string;
  top_risks: string[];
  recurring_blockers: string[];
  overloaded_people: string[];
  suggested_focus: string[];
  recommended_next_actions: string[];
  // Deterministic counts (primary).
  total_work: number;
  overdue_count: number;
  blocked_count: number;
  waiting_on_count: number;
  no_next_action_count: number;
  stale_work_count: number;
  high_risk_count: number;
  critical_risk_count: number;
  recent_completed_count: number;
  recent_failed_count: number;
  confidence: string;
  reasoning_summary: string | null; // short + audit-safe; never raw chain-of-thought
  human_review_needed: boolean;
  provenance: string; // "python:operational-analytics" | "foundation:deterministic-analytics"
}

// The Foundation-assembled snapshot (deterministic). known_people is the closed
// set of display names Python is allowed to reference in overloaded_people.
export interface HealthSnapshot {
  scope: OperationalScope;
  metrics: OperationalSnapshotMetrics;
  stale_work_count: number;
  top_items: OperationalSnapshotItem[];
  known_people: string[];
}

const DET_PROVENANCE = "foundation:deterministic-analytics";
const PY_PROVENANCE = "python:operational-analytics";
const TERMINAL_STATUSES = ["CANCELLED", "EXPIRED", "VERIFIED", "EXECUTED"];
const COMPLETED_STATUSES = ["VERIFIED", "EXECUTED"];
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const AGING_HOURS = 168;
const TOP_ITEMS = 10;

function statusFor(score: number): string {
  if (score >= 80) return "HEALTHY";
  if (score >= 60) return "WATCH";
  if (score >= 35) return "AT_RISK";
  return "CRITICAL";
}

function healthScore(m: OperationalSnapshotMetrics): number {
  let score = 100;
  score -= m.blocked_count * 8;
  score -= m.overdue_count * 5;
  score -= m.critical_risk_count * 10;
  score -= m.high_risk_count * 4;
  score -= m.no_next_action_count * 2;
  score -= m.waiting_on_count * 2;
  score -= m.recent_failed_count * 5;
  return Math.max(0, Math.min(100, score));
}

// WHAT: the deterministic analytics narrative — BOTH primary and the fallback.
// WHY: mirrors the Python heuristic so the two agree; uses ONLY snapshot data.
function deterministicNarrative(snapshot: HealthSnapshot): {
  summary: string;
  top_risks: string[];
  recurring_blockers: string[];
  overloaded_people: string[];
  suggested_focus: string[];
  recommended_next_actions: string[];
  confidence: string;
} {
  const { metrics: m, top_items } = snapshot;
  const status = statusFor(healthScore(m));
  const items = [...top_items].sort((a, b) => (b.risk_score ?? 0) - (a.risk_score ?? 0));
  const top_risks = items
    .filter((it) => it.severity === "HIGH" || it.severity === "CRITICAL" || (it.risk_score ?? 0) >= 60)
    .map((it) => `${it.title} (${it.severity ?? "risk"})`)
    .slice(0, 20);
  const recurring_blockers = items
    .filter((it) => it.item_type === "UNRESOLVED_BLOCKER" || it.status === "BLOCKED")
    .map((it) => it.title)
    .slice(0, 20);
  const counts = new Map<string, number>();
  for (const it of items) for (const p of it.related_people ?? []) counts.set(p, (counts.get(p) ?? 0) + 1);
  const overloaded_people = [...counts.entries()].filter(([, n]) => n >= 2).map(([name]) => name).slice(0, 20);
  const suggested_focus = items.slice(0, 3).map((it) => it.title);
  const recommended_next_actions: string[] = [];
  if (m.blocked_count) recommended_next_actions.push("Clear the blockers first.");
  if (m.overdue_count) recommended_next_actions.push("Bring overdue work current.");
  if (m.no_next_action_count) recommended_next_actions.push("Assign owners and next actions to unowned work.");
  if (m.waiting_on_count) recommended_next_actions.push("Follow up on what you are waiting on.");
  if (recommended_next_actions.length === 0) recommended_next_actions.push("Maintain current pace; no critical pressure detected.");
  const summary = `${m.total_work} active items: ${m.blocked_count} blocked, ${m.overdue_count} overdue, ${m.waiting_on_count} waiting on someone, ${m.no_next_action_count} with no next action. Execution status ${status}.`;
  const confidence = m.total_work >= 5 ? "HIGH" : m.total_work > 0 ? "MEDIUM" : "LOW";
  return { summary, top_risks, recurring_blockers, overloaded_people, suggested_focus, recommended_next_actions, confidence };
}

// WHAT: assemble the deterministic, scoped execution-health snapshot.
// INPUT: org + caller + manager flag + requested scope.
// OUTPUT: HealthSnapshot — metrics + top risk items + known people.
// WHY: scope is enforced HERE (personal = caller's own/owned/requested; team/org
//      = org-wide, manager-only). Tenant-isolated by org_entity_id. Python only
//      ever sees what this returns.
export async function buildHealthSnapshot(args: {
  org_entity_id: string;
  caller_entity_id: string;
  is_manager: boolean;
  scope: OperationalScope;
}): Promise<HealthSnapshot> {
  const orgWide = args.scope !== "personal" && args.is_manager;

  // Deterministic findings (scoped) + deterministic risk (no Python round-trip).
  const findings = await getWatcherFeed({
    org_entity_id: args.org_entity_id,
    caller_entity_id: args.caller_entity_id,
    is_manager: orgWide,
  });
  const assessed = assessFindingsDeterministic(findings);

  const overdue_count = findings.filter((f) => f.watcher_type === "OVERDUE_WORK").length;
  const blocked_count = findings.filter((f) => f.watcher_type === "UNRESOLVED_BLOCKER").length;
  const waiting_on_count = findings.filter((f) => f.watcher_type === "STALE_WAITING_ON").length;
  const no_next_action_count = findings.filter((f) => f.watcher_type === "NO_NEXT_ACTION").length;
  const stale_work_count = findings.filter(
    (f) => f.detection.age_hours !== null && f.detection.age_hours > AGING_HOURS,
  ).length;
  const high_risk_count = assessed.filter((f) => f.risk_assessment.severity === "HIGH").length;
  const critical_risk_count = assessed.filter((f) => f.risk_assessment.severity === "CRITICAL").length;

  // Scoped Work Ledger rows for total + completed counts + the failed-attempt scope.
  const rows = await prisma.workLedgerEntry.findMany({
    where: {
      org_entity_id: args.org_entity_id,
      ...(orgWide
        ? {}
        : {
            OR: [
              { owner_entity_id: args.caller_entity_id },
              { target_entity_id: args.caller_entity_id },
              { requester_entity_id: args.caller_entity_id },
            ],
          }),
    },
    select: { ledger_entry_id: true, status: true, updated_at: true },
    take: 1000,
  });
  const cutoff = Date.now() - SEVEN_DAYS_MS;
  const total_work = rows.filter((r) => !TERMINAL_STATUSES.includes(r.status)).length;
  const recent_completed_count = rows.filter(
    (r) => COMPLETED_STATUSES.includes(r.status) && r.updated_at.getTime() >= cutoff,
  ).length;
  const scopedIds = rows.map((r) => r.ledger_entry_id);

  let recent_failed_count = 0;
  if (scopedIds.length > 0) {
    recent_failed_count = await prisma.executionAttempt.count({
      where: {
        org_entity_id: args.org_entity_id,
        ledger_entry_id: { in: scopedIds },
        status: "FAILED",
        created_at: { gte: new Date(cutoff) },
      },
    });
  }

  const top_items: OperationalSnapshotItem[] = assessed.slice(0, TOP_ITEMS).map((f) => {
    const people = Array.from(
      new Set(
        [f.owner, f.requester, f.target, f.related_person]
          .filter((e): e is NonNullable<typeof e> => e !== null)
          .map((e) => e.display_name),
      ),
    );
    return {
      item_id: f.finding_id,
      item_type: f.watcher_type,
      title: f.title,
      summary: f.summary,
      severity: f.risk_assessment.severity,
      risk_score: f.risk_assessment.risk_score,
      related_people: people,
      age_hours: f.detection.age_hours,
    };
  });

  const known_people = Array.from(new Set(top_items.flatMap((it) => it.related_people ?? [])));

  return {
    scope: args.scope,
    metrics: {
      total_work,
      overdue_count,
      blocked_count,
      waiting_on_count,
      no_next_action_count,
      high_risk_count,
      critical_risk_count,
      recent_completed_count,
      recent_failed_count,
    },
    stale_work_count,
    top_items,
    known_people,
  };
}

// WHAT: analyze an already-assembled snapshot (deterministic primary + advisory
//        Python narrative) and return the governed assessment + honest envelope.
// INPUT: a HealthSnapshot (+ optional runtime/now).
// OUTPUT: { health, envelope }. health_score/execution_status/counts are ALWAYS
//          deterministic; the narrative is Python's only when validated.
// WHY: pure-ish core (Python via injectable runtime) so the validation rules are
//      unit-testable without a DB. No flow blocks on Python.
export async function analyzeSnapshot(args: {
  snapshot: HealthSnapshot;
  runtime?: OperationalAnalyticsRuntimeConfig;
  nowIso?: string;
}): Promise<{ health: OperationalHealthAssessment; envelope: PythonIntelligenceEnvelope }> {
  const { snapshot } = args;
  const nowIso = args.nowIso ?? new Date().toISOString();
  const m = snapshot.metrics;
  const score = healthScore(m); // deterministic — Foundation-authoritative
  const status = statusFor(score);
  const human_review_needed = status === "AT_RISK" || status === "CRITICAL" || m.critical_risk_count > 0;
  const det = deterministicNarrative(snapshot);

  const payload: OperationalSnapshotPayload = {
    snapshot_id: randomUUID(),
    scope: snapshot.scope,
    metrics: m,
    top_items: snapshot.top_items,
    max_results: 10,
  };
  const started = Date.now();
  const result = await analyzeOperationalSnapshot(payload, args.runtime ?? {});
  const latency = Date.now() - started;
  const envelope = validateOperationalAnalyticsEnvelope(
    buildOperationalAnalyticsEnvelope(result, latency, nowIso),
    { knownPeople: new Set(snapshot.known_people) },
  );

  // Narrative source: validated Python, else deterministic. Numbers are ALWAYS
  // the Foundation-deterministic values regardless.
  let narrative = det;
  let provenance = DET_PROVENANCE;
  if (envelope.authority === "FOUNDATION_VALIDATED") {
    const c = envelope.candidates[0] as OperationalAnalyticsCandidate;
    narrative = {
      summary: c.summary,
      top_risks: c.top_risks,
      recurring_blockers: c.recurring_blockers,
      overloaded_people: c.overloaded_people,
      suggested_focus: c.suggested_focus,
      recommended_next_actions: c.recommended_next_actions,
      confidence: c.confidence,
    };
    provenance = PY_PROVENANCE;
  }

  const health: OperationalHealthAssessment = {
    scope: snapshot.scope,
    health_score: score,
    execution_status: status,
    summary: narrative.summary,
    top_risks: narrative.top_risks,
    recurring_blockers: narrative.recurring_blockers,
    overloaded_people: narrative.overloaded_people,
    suggested_focus: narrative.suggested_focus,
    recommended_next_actions: narrative.recommended_next_actions,
    total_work: m.total_work,
    overdue_count: m.overdue_count,
    blocked_count: m.blocked_count,
    waiting_on_count: m.waiting_on_count,
    no_next_action_count: m.no_next_action_count,
    stale_work_count: snapshot.stale_work_count,
    high_risk_count: m.high_risk_count,
    critical_risk_count: m.critical_risk_count,
    recent_completed_count: m.recent_completed_count,
    recent_failed_count: m.recent_failed_count,
    confidence: narrative.confidence,
    reasoning_summary: null,
    human_review_needed,
    provenance,
  };
  return { health, envelope };
}

// WHAT: the governed operational-health entrypoint (assemble snapshot + analyze).
// INPUT: org + caller + manager flag + requested scope (+ runtime).
// OUTPUT: { health, envelope }.
// WHY: the route consumes this. Deterministic snapshot + numbers are primary;
//      Python narrative is advisory; Foundation is the authority end-to-end.
export async function evaluateOperationalHealth(args: {
  org_entity_id: string;
  caller_entity_id: string;
  is_manager: boolean;
  scope: OperationalScope;
  runtime?: OperationalAnalyticsRuntimeConfig;
}): Promise<{ health: OperationalHealthAssessment; envelope: PythonIntelligenceEnvelope }> {
  const snapshot = await buildHealthSnapshot({
    org_entity_id: args.org_entity_id,
    caller_entity_id: args.caller_entity_id,
    is_manager: args.is_manager,
    scope: args.scope,
  });
  return analyzeSnapshot({ snapshot, ...(args.runtime !== undefined ? { runtime: args.runtime } : {}) });
}

// Exposed for unit tests (the pure pieces).
export const __internals = { healthScore, statusFor, deterministicNarrative };
