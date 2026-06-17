// FILE: python-rerank.service.ts
// PURPOSE: Phase 1285-W — the bounded, honest client for the Python
//          SEMANTIC_RETRIEVAL capability (POST /jobs/semantic-rerank). ADVISORY
//          ONLY: Foundation assembles the scoped, RBAC/ABAC-checked candidate set
//          and is the sole authority on what may be returned. This client sends
//          only safe candidate summaries, never throws, and degrades to a NAMED
//          status (never a fake green) when Python is absent / unhealthy / slow /
//          drifting. Foundation re-validates every returned candidate_id against
//          the allowed set in validateSemanticRetrievalEnvelope.
// CONNECTS TO: services/python-intelligence (the FastAPI worker /jobs/semantic-
//          rerank), python-intelligence.ts (the envelope/contract),
//          work-os/semantic-retrieval.service.ts (the consumer),
//          tests/unit/python-rerank.test.ts.

import type { EnrichmentStatus } from "./python-enrichment.service.js";
import type {
  SemanticRankCandidate,
  SemanticRerankExtractionResult,
} from "./python-intelligence.js";

export interface SemanticRerankRuntimeConfig {
  pythonUrl?: string | null;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

// The safe summary of ONE Foundation-allowed candidate sent to Python.
// related_people are resolved display names — never raw entity UUIDs.
export interface SemanticRerankPayloadCandidate {
  candidate_id: string;
  candidate_type: string;
  title: string;
  summary?: string | null;
  source_type?: string | null;
  created_at?: string;
  updated_at?: string;
  related_people?: string[];
  status?: string;
}

const DEFAULT_TIMEOUT_MS = 2_000;

function empty(status: EnrichmentStatus): SemanticRerankExtractionResult {
  return { status, ranked: [] };
}

// WHAT: validate a raw Python rerank response into a closed-vocab result.
// OUTPUT: a normalized result on success; null when the shape drifts.
// WHY: Python is advisory but Foundation refuses to trust anything it cannot
//      prove is closed-vocab. reason is length-capped defensively.
export function validateRerankResponse(
  raw: unknown,
): SemanticRerankExtractionResult | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.ranked_candidates)) return null;
  const ranked: SemanticRankCandidate[] = [];
  for (const item of obj.ranked_candidates) {
    if (typeof item !== "object" || item === null) return null;
    const c = item as Record<string, unknown>;
    if (typeof c.candidate_id !== "string" || c.candidate_id.length === 0) return null;
    if (typeof c.score !== "number" || !Number.isFinite(c.score)) return null;
    if (typeof c.reason !== "string" || c.reason.length === 0) return null;
    ranked.push({
      candidate_id: c.candidate_id,
      score: c.score,
      reason: c.reason.slice(0, 160),
    });
  }
  return { status: "PYTHON_ENRICHED", ranked };
}

// WHAT: ask the Python worker to rerank a Foundation-scoped candidate set.
// INPUT: the query + the safe candidate summaries (+ optional cap) + runtime.
// OUTPUT: an honest SemanticRerankExtractionResult — never throws.
// WHY: deterministic Foundation ordering always exists as the fallback; this
//      only enriches it when Python is healthy.
export async function rerankCandidates(
  input: {
    query: string;
    candidates: SemanticRerankPayloadCandidate[];
    max_results?: number;
  },
  runtime: SemanticRerankRuntimeConfig = {},
): Promise<SemanticRerankExtractionResult> {
  if (input.query.trim().length === 0) return empty("PYTHON_INVALID_RESPONSE");
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
    const res = await fetchFn(`${pythonUrl}/jobs/semantic-rerank`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: input.query,
        candidates: input.candidates,
        ...(input.max_results !== undefined ? { max_results: input.max_results } : {}),
      }),
      signal: controller.signal,
    });
    if (!res.ok) return empty("PYTHON_JOB_FAILED");
    const raw = (await res.json()) as unknown;
    const validated = validateRerankResponse(raw);
    return validated ?? empty("PYTHON_INVALID_RESPONSE");
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return empty(aborted ? "PYTHON_TIMEOUT" : "PYTHON_UNHEALTHY");
  } finally {
    clearTimeout(timer);
  }
}
