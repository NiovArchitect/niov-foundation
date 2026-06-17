// FILE: python-risk.service.ts
// PURPOSE: Phase 1285-X — the bounded, honest client for the Python RISK_SCORING
//          capability (POST /jobs/score-risk). ADVISORY ONLY: Foundation
//          assembles the deterministic, scoped candidate set (watcher findings)
//          and is the sole authority on what may be returned. This client sends
//          only safe candidate summaries + boolean signal flags, never throws,
//          and degrades to a NAMED status (never a fake green) when Python is
//          absent / unhealthy / slow / drifting. Foundation re-validates every
//          returned candidate_id against the allowed set in
//          validateRiskScoringEnvelope; the deterministic watcher finding stays
//          primary.
// CONNECTS TO: services/python-intelligence (the FastAPI worker /jobs/score-
//          risk), python-intelligence.ts (the envelope/contract), work-os/
//          risk-scoring.service.ts (the consumer), tests/unit/python-risk.test.ts.

import type { EnrichmentStatus } from "./python-enrichment.service.js";
import type {
  RiskScoreCandidate,
  RiskScoringExtractionResult,
} from "./python-intelligence.js";

export interface RiskScoringRuntimeConfig {
  pythonUrl?: string | null;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

// The safe summary of ONE Foundation-scoped candidate sent to Python.
// related_people are resolved display names — never raw entity UUIDs.
export interface RiskScoringPayloadCandidate {
  candidate_id: string;
  candidate_type: string;
  title: string;
  summary?: string | null;
  base_severity: string; // LOW | MEDIUM | HIGH | CRITICAL
  age_hours?: number | null;
  overdue?: boolean;
  blocked?: boolean;
  waiting_on?: boolean;
  no_next_action?: boolean;
  related_people?: string[];
}

const DEFAULT_TIMEOUT_MS = 2_000;
const SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const CONFIDENCES = ["HIGH", "MEDIUM", "LOW"];
const SIGNALS = ["OVERDUE", "BLOCKED", "WAITING_ON", "NO_NEXT_ACTION", "AGING", "HIGH_BASE_SEVERITY"];

function empty(status: EnrichmentStatus): RiskScoringExtractionResult {
  return { status, scores: [] };
}

// WHAT: validate a raw Python risk response into a closed-vocab result.
// OUTPUT: a normalized result on success; null when the shape drifts.
// WHY: Python is advisory but Foundation refuses to trust anything it cannot
//      prove is closed-vocab. score is clamped + reason/action length-capped.
export function validateRiskResponse(
  raw: unknown,
): RiskScoringExtractionResult | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.scores)) return null;
  const scores: RiskScoreCandidate[] = [];
  for (const item of obj.scores) {
    if (typeof item !== "object" || item === null) return null;
    const c = item as Record<string, unknown>;
    if (typeof c.candidate_id !== "string" || c.candidate_id.length === 0) return null;
    if (typeof c.risk_score !== "number" || !Number.isFinite(c.risk_score)) return null;
    if (!SEVERITIES.includes(c.severity as string)) return null;
    if (!CONFIDENCES.includes(c.confidence as string)) return null;
    if (typeof c.reason !== "string" || c.reason.length === 0) return null;
    if (typeof c.suggested_next_action !== "string" || c.suggested_next_action.length === 0) return null;
    if (typeof c.human_review_needed !== "boolean") return null;
    const signals = Array.isArray(c.contributing_signals)
      ? c.contributing_signals.filter((s): s is string => typeof s === "string" && SIGNALS.includes(s))
      : [];
    scores.push({
      candidate_id: c.candidate_id,
      risk_score: Math.max(0, Math.min(100, Math.round(c.risk_score))),
      severity: c.severity as string,
      confidence: c.confidence as string,
      reason: c.reason.slice(0, 200),
      contributing_signals: signals.slice(0, 8),
      suggested_next_action: c.suggested_next_action.slice(0, 160),
      human_review_needed: c.human_review_needed,
    });
  }
  return { status: "PYTHON_ENRICHED", scores };
}

// WHAT: ask the Python worker to score a Foundation-scoped candidate set.
// INPUT: the safe candidate summaries (+ optional cap) + runtime.
// OUTPUT: an honest RiskScoringExtractionResult — never throws.
// WHY: deterministic Foundation risk always exists as the fallback; this only
//      enriches it when Python is healthy.
export async function scoreRisk(
  input: { candidates: RiskScoringPayloadCandidate[]; max_results?: number },
  runtime: RiskScoringRuntimeConfig = {},
): Promise<RiskScoringExtractionResult> {
  if (input.candidates.length === 0) return empty("PYTHON_INVALID_RESPONSE");
  const pythonUrl =
    runtime.pythonUrl ?? process.env.PYTHON_INTELLIGENCE_RUNTIME_URL ?? null;
  if (pythonUrl === null || pythonUrl.length === 0) {
    return empty("PYTHON_NOT_CONFIGURED");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), runtime.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const fetchFn = runtime.fetchImpl ?? fetch;
  try {
    const res = await fetchFn(`${pythonUrl}/jobs/score-risk`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        candidates: input.candidates,
        ...(input.max_results !== undefined ? { max_results: input.max_results } : {}),
      }),
      signal: controller.signal,
    });
    if (!res.ok) return empty("PYTHON_JOB_FAILED");
    const raw = (await res.json()) as unknown;
    const validated = validateRiskResponse(raw);
    return validated ?? empty("PYTHON_INVALID_RESPONSE");
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return empty(aborted ? "PYTHON_TIMEOUT" : "PYTHON_UNHEALTHY");
  } finally {
    clearTimeout(timer);
  }
}
