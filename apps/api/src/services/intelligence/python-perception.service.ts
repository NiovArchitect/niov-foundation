// FILE: python-perception.service.ts
// PURPOSE: Phase 1285-V — the bounded, honest client for the Python MEETING_
//          INTELLIGENCE capability (POST /jobs/meeting-intelligence). ADVISORY
//          ONLY: Foundation's deterministic capture stays primary and is the
//          sole policy/ownership/scope authority. This never throws, never
//          retains the transcript, and degrades to a NAMED status (never a fake
//          green) when Python is absent / unhealthy / slow / drifting.
// CONNECTS TO: services/python-intelligence (the FastAPI worker),
//          python-intelligence.ts (the envelope/contract), perception/
//          ambient-perception.service.ts (the consumer),
//          tests/unit/python-perception.test.ts.

import type { EnrichmentStatus } from "./python-enrichment.service.js";
import type {
  MeetingIntelligenceCandidate,
  MeetingIntelligenceExtractionResult,
  MeetingCandidateType,
} from "./python-intelligence.js";

export interface MeetingIntelligenceRuntimeConfig {
  pythonUrl?: string | null;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 2_000;

const MEETING_CANDIDATE_TYPES: ReadonlyArray<MeetingCandidateType> = [
  "SUMMARY",
  "DECISION",
  "ACTION_ITEM",
  "BLOCKER",
  "RISK",
  "OPEN_QUESTION",
  "COMMITMENT",
  "FOLLOW_UP",
  "DRAFT_SUGGESTION",
];
const CONFIDENCES = ["HIGH", "MEDIUM", "LOW"];

function empty(status: EnrichmentStatus): MeetingIntelligenceExtractionResult {
  return { status, summary: null, candidates: [] };
}

// WHAT: validate a raw Python meeting response into a closed-vocab result.
// OUTPUT: a normalized result on success; null when the shape drifts.
// WHY: Python is advisory but Foundation refuses to persist anything it cannot
//      prove is closed-vocab. evidence/text are length-capped defensively.
export function validateMeetingResponse(
  raw: unknown,
): MeetingIntelligenceExtractionResult | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.candidates)) return null;
  const candidates: MeetingIntelligenceCandidate[] = [];
  for (const item of obj.candidates) {
    if (typeof item !== "object" || item === null) return null;
    const c = item as Record<string, unknown>;
    if (!MEETING_CANDIDATE_TYPES.includes(c.candidate_type as MeetingCandidateType)) return null;
    if (!CONFIDENCES.includes(c.confidence as string)) return null;
    if (typeof c.text !== "string" || c.text.length === 0) return null;
    if (typeof c.evidence_phrase !== "string" || c.evidence_phrase.length === 0) return null;
    candidates.push({
      candidate_type: c.candidate_type as MeetingCandidateType,
      text: c.text.slice(0, 280),
      confidence: c.confidence as string,
      evidence_phrase: c.evidence_phrase.slice(0, 160),
    });
  }
  const summary =
    typeof obj.summary === "string" && obj.summary.length > 0 ? obj.summary.slice(0, 600) : null;
  return { status: "PYTHON_ENRICHED", summary, candidates };
}

// WHAT: ask the Python worker for advisory meeting/ambient-perception
//        intelligence over a captured stream.
// INPUT: the transcript/note + optional source type + runtime overrides.
// OUTPUT: an honest MeetingIntelligenceExtractionResult — never throws.
export async function extractMeetingIntelligence(
  input: { transcript: string; source_type?: string },
  runtime: MeetingIntelligenceRuntimeConfig = {},
): Promise<MeetingIntelligenceExtractionResult> {
  if (input.transcript.trim().length === 0) {
    return empty("PYTHON_INVALID_RESPONSE");
  }
  const pythonUrl =
    runtime.pythonUrl ?? process.env.PYTHON_INTELLIGENCE_RUNTIME_URL ?? null;
  if (pythonUrl === null || pythonUrl.length === 0) {
    return empty("PYTHON_NOT_CONFIGURED");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), runtime.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const fetchFn = runtime.fetchImpl ?? fetch;
  try {
    const res = await fetchFn(`${pythonUrl}/jobs/meeting-intelligence`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        transcript: input.transcript,
        ...(input.source_type !== undefined ? { source_type: input.source_type } : {}),
      }),
      signal: controller.signal,
    });
    if (!res.ok) return empty("PYTHON_JOB_FAILED");
    const raw = (await res.json()) as unknown;
    const validated = validateMeetingResponse(raw);
    return validated ?? empty("PYTHON_INVALID_RESPONSE");
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return empty(aborted ? "PYTHON_TIMEOUT" : "PYTHON_UNHEALTHY");
  } finally {
    clearTimeout(timer);
  }
}
