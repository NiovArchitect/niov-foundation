// FILE: risk-scoring.service.ts
// PURPOSE: Phase 1285-X — advisory RISK_SCORING over the deterministic watcher
//          findings. The watcher findings (overdue / blocked / waiting-on /
//          no-next-action over durable, scoped, tenant-isolated work) ARE the
//          Foundation-allowed candidate set; this layer ENRICHES each finding
//          with an advisory risk_assessment (score / severity / confidence /
//          reason / contributing signals / suggested next action / human-review
//          flag). It NEVER replaces the deterministic finding, creates work,
//          notifies anyone, decides scope/ownership/permission, or surfaces a
//          candidate Foundation did not scope. When Python is absent / unhealthy
//          / slow / drifting, a deterministic risk_assessment surfaces and the
//          envelope status is honest — no flow blocks on Python.
// CONNECTS TO: routes/work-os-ledger.routes.ts (the /work-os/risk/assessment
//          route); work-os/watcher.service.ts (the deterministic finding source,
//          untouched); intelligence/python-risk.service.ts (advisory client);
//          intelligence/python-intelligence.ts (envelope + validation);
//          tests/unit/risk-scoring.test.ts.

import {
  getWatcherFeed,
  type WatcherFinding,
} from "./watcher.service.js";
import {
  scoreRisk,
  type RiskScoringPayloadCandidate,
  type RiskScoringRuntimeConfig,
} from "../intelligence/python-risk.service.js";
import {
  buildRiskScoringEnvelope,
  validateRiskScoringEnvelope,
  type PythonIntelligenceEnvelope,
  type RiskScoreCandidate,
} from "../intelligence/python-intelligence.js";

// The advisory risk metadata attached to a deterministic watcher finding.
export interface RiskAssessment {
  risk_score: number; // 0..100
  severity: string; // LOW | MEDIUM | HIGH | CRITICAL
  confidence: string; // HIGH | MEDIUM | LOW
  reason: string;
  contributing_signals: string[];
  suggested_next_action: string;
  human_review_needed: boolean;
  provenance: string; // "python:risk-scoring" | "foundation:deterministic-risk"
}

// The deterministic watcher finding + its advisory risk assessment. The watcher
// finding (and its deterministic severity) is unchanged — risk_assessment is
// purely additive.
export type RiskAssessedFinding = WatcherFinding & { risk_assessment: RiskAssessment };

const BASE: Record<string, number> = { LOW: 20, MEDIUM: 45, HIGH: 70, CRITICAL: 90 };
const AGING_HOURS = 168; // 7 days
const DET_PROVENANCE = "foundation:deterministic-risk";
const PY_PROVENANCE = "python:risk-scoring";

const SIGNAL_WORDS: Record<string, string> = {
  OVERDUE: "overdue",
  BLOCKED: "blocked",
  WAITING_ON: "waiting on someone",
  NO_NEXT_ACTION: "no next action",
  AGING: "aging",
  HIGH_BASE_SEVERITY: "high base severity",
};

// WHAT: the boolean risk signals derived from a deterministic watcher finding.
// WHY: Foundation derives them (Python never re-interprets watcher_type), so the
//      advisory layer is generic and the deterministic rule stays the source.
function signalsOf(f: WatcherFinding): {
  overdue: boolean;
  blocked: boolean;
  waiting_on: boolean;
  no_next_action: boolean;
  aging: boolean;
} {
  return {
    overdue: f.watcher_type === "OVERDUE_WORK",
    blocked: f.watcher_type === "UNRESOLVED_BLOCKER",
    waiting_on: f.watcher_type === "STALE_WAITING_ON",
    no_next_action: f.watcher_type === "NO_NEXT_ACTION",
    aging: f.detection.age_hours !== null && f.detection.age_hours > AGING_HOURS,
  };
}

function severityFor(score: number): string {
  if (score >= 85) return "CRITICAL";
  if (score >= 60) return "HIGH";
  if (score >= 30) return "MEDIUM";
  return "LOW";
}

function confidenceFor(score: number): string {
  if (score >= 70) return "HIGH";
  if (score >= 40) return "MEDIUM";
  return "LOW";
}

function actionFor(s: ReturnType<typeof signalsOf>): string {
  if (s.blocked) return "Escalate to unblock this work.";
  if (s.overdue) return "Follow up to bring overdue work current.";
  if (s.waiting_on) return "Nudge the person you are waiting on.";
  if (s.no_next_action) return "Assign an owner and a clear next action.";
  if (s.aging) return "Review aging work and confirm it is still needed.";
  return "Review and confirm the current status.";
}

// WHAT: the deterministic risk assessment for a finding — BOTH the safe base and
//        the fallback when Python is down. Mirrors the Python heuristic so the
//        two agree.
function deterministicAssessment(f: WatcherFinding): RiskAssessment {
  const s = signalsOf(f);
  const base = BASE[f.severity] ?? 20;
  const signals: string[] = [];
  let boost = 0;
  if (s.overdue) { boost += 15; signals.push("OVERDUE"); }
  if (s.blocked) { boost += 20; signals.push("BLOCKED"); }
  if (s.waiting_on) { boost += 10; signals.push("WAITING_ON"); }
  if (s.no_next_action) { boost += 12; signals.push("NO_NEXT_ACTION"); }
  if (s.aging) { boost += 10; signals.push("AGING"); }
  if (f.severity === "HIGH" || f.severity === "CRITICAL") signals.push("HIGH_BASE_SEVERITY");
  const score = Math.max(0, Math.min(100, base + boost));
  const severity = severityFor(score);
  const words = signals.map((sig) => SIGNAL_WORDS[sig]).filter((w): w is string => !!w);
  const reason =
    words.length > 0
      ? `${words.join(", ")}; ${severity.toLowerCase()} risk.`
      : `No active risk signals; ${severity.toLowerCase()} risk.`;
  return {
    risk_score: score,
    severity,
    confidence: confidenceFor(score),
    reason,
    contributing_signals: signals.slice(0, 8),
    suggested_next_action: actionFor(s),
    human_review_needed: severity === "HIGH" || severity === "CRITICAL" || s.blocked,
    provenance: DET_PROVENANCE,
  };
}

function toPayload(f: WatcherFinding): RiskScoringPayloadCandidate {
  const s = signalsOf(f);
  const people = [f.owner, f.requester, f.target, f.related_person]
    .filter((e): e is NonNullable<typeof e> => e !== null)
    .map((e) => e.display_name);
  return {
    candidate_id: f.finding_id,
    candidate_type: f.watcher_type,
    title: f.title,
    summary: f.summary,
    base_severity: f.severity,
    age_hours: f.detection.age_hours,
    overdue: s.overdue,
    blocked: s.blocked,
    waiting_on: s.waiting_on,
    no_next_action: s.no_next_action,
    related_people: Array.from(new Set(people)),
  };
}

function fromPython(c: RiskScoreCandidate): RiskAssessment {
  return {
    risk_score: c.risk_score,
    severity: c.severity,
    confidence: c.confidence,
    reason: c.reason,
    contributing_signals: c.contributing_signals,
    suggested_next_action: c.suggested_next_action,
    human_review_needed: c.human_review_needed,
    provenance: PY_PROVENANCE,
  };
}

// WHAT: score an already-assembled set of deterministic watcher findings.
// INPUT: findings (Foundation-scoped) + optional runtime/now.
// OUTPUT: { findings: RiskAssessedFinding[], envelope }. Ordered by risk_score
//          desc (advisory ordering); the watcher findings themselves are
//          unchanged.
// WHY: pure-ish core (Python via injectable runtime) so the validation rules are
//      unit-testable without a DB. Deterministic assessment ALWAYS exists; Python
//      only refines it when validated. No flow blocks on Python.
export async function scoreWatcherFindings(args: {
  findings: WatcherFinding[];
  runtime?: RiskScoringRuntimeConfig;
  nowIso?: string;
}): Promise<{ findings: RiskAssessedFinding[]; envelope: PythonIntelligenceEnvelope }> {
  const nowIso = args.nowIso ?? new Date().toISOString();
  const allowedIds = new Set(args.findings.map((f) => f.finding_id));

  const started = Date.now();
  const result = await scoreRisk({ candidates: args.findings.map(toPayload) }, args.runtime ?? {});
  const latency = Date.now() - started;
  const envelope = validateRiskScoringEnvelope(
    buildRiskScoringEnvelope(result, latency, nowIso),
    allowedIds,
  );

  // Build the per-finding assessment: validated Python scores where present,
  // deterministic everywhere else (Foundation is authority either way).
  const pyById = new Map<string, RiskAssessment>();
  if (envelope.authority === "FOUNDATION_VALIDATED") {
    for (const c of envelope.candidates) {
      if ("candidate_id" in c && "risk_score" in c) {
        pyById.set((c as RiskScoreCandidate).candidate_id, fromPython(c as RiskScoreCandidate));
      }
    }
  }

  const assessed: RiskAssessedFinding[] = args.findings.map((f) => ({
    ...f,
    risk_assessment: pyById.get(f.finding_id) ?? deterministicAssessment(f),
  }));
  // Highest risk first; stable on ties (preserves the watcher stalest-first order).
  assessed.sort((a, b) => b.risk_assessment.risk_score - a.risk_assessment.risk_score);
  return { findings: assessed, envelope };
}

// WHAT: the governed risk-assessment entrypoint (assemble deterministic watcher
//        findings, then enrich with advisory risk).
// INPUT: org + caller + manager flag (+ optional runtime).
// OUTPUT: { findings, envelope }.
// WHY: the route consumes this. Watcher findings are deterministic-primary +
//      scope-enforced; risk is advisory; Foundation is the authority end-to-end.
export async function assessWorkRisk(args: {
  org_entity_id: string;
  caller_entity_id: string;
  is_manager: boolean;
  runtime?: RiskScoringRuntimeConfig;
}): Promise<{ findings: RiskAssessedFinding[]; envelope: PythonIntelligenceEnvelope }> {
  const findings = await getWatcherFeed({
    org_entity_id: args.org_entity_id,
    caller_entity_id: args.caller_entity_id,
    is_manager: args.is_manager,
  });
  return scoreWatcherFindings({
    findings,
    ...(args.runtime !== undefined ? { runtime: args.runtime } : {}),
  });
}

// Exposed for unit tests (the pure pieces).
export const __internals = { deterministicAssessment, signalsOf, toPayload };
