// FILE: python-analytics.service.ts
// PURPOSE: Phase 1285-Z — the bounded, honest client for the Python
//          OPERATIONAL_ANALYTICS capability (POST /jobs/operational-analytics).
//          ADVISORY ONLY: Foundation assembles the scoped execution-health
//          snapshot and is the sole authority. This client sends only safe
//          summaries + metrics, never throws, and degrades to a NAMED status
//          (never a fake green) when Python is absent / unhealthy / slow /
//          drifting. Foundation re-validates + re-scopes the result in
//          validateOperationalAnalyticsEnvelope; deterministic metrics stay
//          primary.
// CONNECTS TO: services/python-intelligence (the FastAPI worker /jobs/
//          operational-analytics), python-intelligence.ts (the envelope/
//          contract), work-os/operational-analytics.service.ts (the consumer),
//          tests/unit/python-analytics.test.ts.

import type { EnrichmentStatus } from "./python-enrichment.service.js";
import type {
  OperationalAnalyticsCandidate,
  OperationalAnalyticsExtractionResult,
} from "./python-intelligence.js";

export interface OperationalAnalyticsRuntimeConfig {
  pythonUrl?: string | null;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface OperationalSnapshotMetrics {
  total_work: number;
  overdue_count: number;
  blocked_count: number;
  waiting_on_count: number;
  no_next_action_count: number;
  high_risk_count: number;
  critical_risk_count: number;
  recent_completed_count: number;
  recent_failed_count: number;
}

// One safe item in the snapshot. related_people are resolved display names —
// never raw entity UUIDs.
export interface OperationalSnapshotItem {
  item_id: string;
  item_type: string;
  title: string;
  summary?: string | null;
  status?: string | null;
  severity?: string | null;
  risk_score?: number | null;
  related_people?: string[];
  age_hours?: number | null;
}

export interface OperationalSnapshotPayload {
  snapshot_id: string;
  scope: "personal" | "team" | "org";
  metrics: OperationalSnapshotMetrics;
  top_items: OperationalSnapshotItem[];
  max_results?: number;
}

const DEFAULT_TIMEOUT_MS = 2_000;
const STATUSES = ["HEALTHY", "WATCH", "AT_RISK", "CRITICAL"];
const CONFIDENCES = ["HIGH", "MEDIUM", "LOW"];

function empty(status: EnrichmentStatus): OperationalAnalyticsExtractionResult {
  return { status, analytics: null };
}

function strList(v: unknown, cap: number): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((s): s is string => typeof s === "string" && s.length > 0).slice(0, cap).map((s) => s.slice(0, 280));
}

// WHAT: validate a raw Python analytics response into a closed-vocab result.
// OUTPUT: a normalized result on success; null when the shape drifts.
// WHY: Python is advisory but Foundation refuses to trust anything it cannot
//      prove is closed-vocab. score is clamped + lists are length/count capped.
export function validateAnalyticsResponse(
  raw: unknown,
): OperationalAnalyticsExtractionResult | null {
  if (typeof raw !== "object" || raw === null) return null;
  const c = raw as Record<string, unknown>;
  if (typeof c.health_score !== "number" || !Number.isFinite(c.health_score)) return null;
  if (!STATUSES.includes(c.execution_status as string)) return null;
  if (typeof c.summary !== "string" || c.summary.length === 0) return null;
  if (!CONFIDENCES.includes(c.confidence as string)) return null;
  if (typeof c.human_review_needed !== "boolean") return null;
  const analytics: OperationalAnalyticsCandidate = {
    health_score: Math.max(0, Math.min(100, Math.round(c.health_score))),
    execution_status: c.execution_status as string,
    summary: c.summary.slice(0, 600),
    top_risks: strList(c.top_risks, 20),
    recurring_blockers: strList(c.recurring_blockers, 20),
    overloaded_people: strList(c.overloaded_people, 20),
    suggested_focus: strList(c.suggested_focus, 20),
    recommended_next_actions: strList(c.recommended_next_actions, 20),
    confidence: c.confidence as string,
    human_review_needed: c.human_review_needed,
  };
  return { status: "PYTHON_ENRICHED", analytics };
}

// WHAT: ask the Python worker to analyze a Foundation-scoped health snapshot.
// INPUT: the snapshot + runtime.
// OUTPUT: an honest OperationalAnalyticsExtractionResult — never throws.
// WHY: deterministic Foundation health always exists as the fallback; this only
//      enriches it when Python is healthy.
export async function analyzeOperationalSnapshot(
  input: OperationalSnapshotPayload,
  runtime: OperationalAnalyticsRuntimeConfig = {},
): Promise<OperationalAnalyticsExtractionResult> {
  const pythonUrl =
    runtime.pythonUrl ?? process.env.PYTHON_INTELLIGENCE_RUNTIME_URL ?? null;
  if (pythonUrl === null || pythonUrl.length === 0) {
    return empty("PYTHON_NOT_CONFIGURED");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), runtime.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const fetchFn = runtime.fetchImpl ?? fetch;
  try {
    const res = await fetchFn(`${pythonUrl}/jobs/operational-analytics`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        snapshot_id: input.snapshot_id,
        scope: input.scope,
        metrics: input.metrics,
        top_items: input.top_items,
        ...(input.max_results !== undefined ? { max_results: input.max_results } : {}),
      }),
      signal: controller.signal,
    });
    if (!res.ok) return empty("PYTHON_JOB_FAILED");
    const raw = (await res.json()) as unknown;
    const validated = validateAnalyticsResponse(raw);
    return validated ?? empty("PYTHON_INVALID_RESPONSE");
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return empty(aborted ? "PYTHON_TIMEOUT" : "PYTHON_UNHEALTHY");
  } finally {
    clearTimeout(timer);
  }
}
