// FILE: python-enrichment.service.ts
// PURPOSE: Phase 1282 — Foundation-side client for the Python intelligence
//          worker's conversation-to-work enrichment job
//          (POST /jobs/extract-work-signals). ADVISORY ONLY: Foundation's
//          deterministic TypeScript extraction is always primary and the
//          sole policy/ownership/target/audit authority. This wrapper asks
//          Python for ADDITIONAL closed-vocab work signals, validates the
//          response, and NEVER throws — enrichment failure degrades to an
//          honest status, never a fake success and never a blocked write.
// CONNECTS TO: services/python-intelligence/app/main.py (the route),
//          work-os/work-ledger.service.ts (createLedgerEntry enrichment).
//
// SECURITY: reads only PYTHON_INTELLIGENCE_RUNTIME_URL (name, not printed).
// The request body carries one safe utterance the caller already governs;
// the response is closed-vocab only — no chain-of-thought, no raw memory.

// WHAT: The safe utterance Foundation hands Python to analyse.
export interface WorkSignalExtractionInput {
  text: string;
  source_type?: string;
}

// WHAT: Closed-vocab signal types — must match the Python Literal exactly.
export const WORK_SIGNAL_TYPES = [
  "FOLLOW_UP",
  "COMMITMENT",
  "TASK",
  "DELEGATION",
  "DECISION",
  "BLOCKER",
  "APPROVAL_NEEDED",
] as const;
export type WorkSignalType = (typeof WORK_SIGNAL_TYPES)[number];

export const WORK_SIGNAL_CONFIDENCES = ["HIGH", "MEDIUM", "LOW"] as const;
export type WorkSignalConfidence = (typeof WORK_SIGNAL_CONFIDENCES)[number];

export interface WorkSignal {
  signal_type: WorkSignalType;
  confidence: WorkSignalConfidence;
  evidence_phrase: string;
}

// WHAT: The honest outcome of an enrichment attempt. PYTHON_ENRICHED is the
//        only status where `signals` may be non-empty and where the caller
//        is permitted to attribute extraction_source = "PYTHON_ENRICHED".
export type EnrichmentStatus =
  | "PYTHON_ENRICHED"
  | "PYTHON_NOT_CONFIGURED"
  | "PYTHON_UNHEALTHY"
  | "PYTHON_TIMEOUT"
  | "PYTHON_JOB_FAILED"
  | "PYTHON_INVALID_RESPONSE";

export interface WorkSignalExtractionResult {
  status: EnrichmentStatus;
  signals: WorkSignal[];
  primary_signal: WorkSignalType | null;
  multi_intent: boolean;
}

export interface EnrichmentRuntimeConfig {
  pythonUrl?: string | null;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 2_000;

function empty(status: EnrichmentStatus): WorkSignalExtractionResult {
  return { status, signals: [], primary_signal: null, multi_intent: false };
}

// WHAT: Validate a raw Python response into a closed-vocab result.
// OUTPUT: A normalized result on success; null when the shape drifts.
// WHY: Python is advisory but Foundation still refuses to persist anything
//      it cannot prove is closed-vocab — defense against contract drift.
export function validatePythonEnrichmentResponse(
  raw: unknown,
): WorkSignalExtractionResult | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.signals)) return null;

  const signals: WorkSignal[] = [];
  for (const item of obj.signals) {
    if (typeof item !== "object" || item === null) return null;
    const s = item as Record<string, unknown>;
    if (!WORK_SIGNAL_TYPES.includes(s.signal_type as WorkSignalType)) return null;
    if (!WORK_SIGNAL_CONFIDENCES.includes(s.confidence as WorkSignalConfidence)) {
      return null;
    }
    if (typeof s.evidence_phrase !== "string" || s.evidence_phrase.length === 0) {
      return null;
    }
    signals.push({
      signal_type: s.signal_type as WorkSignalType,
      confidence: s.confidence as WorkSignalConfidence,
      evidence_phrase: s.evidence_phrase.slice(0, 120),
    });
  }

  let primary: WorkSignalType | null = null;
  if (obj.primary_signal !== null && obj.primary_signal !== undefined) {
    if (!WORK_SIGNAL_TYPES.includes(obj.primary_signal as WorkSignalType)) {
      return null;
    }
    primary = obj.primary_signal as WorkSignalType;
  }

  return {
    status: "PYTHON_ENRICHED",
    signals,
    primary_signal: primary,
    multi_intent: obj.multi_intent === true,
  };
}

// WHAT: Ask the Python worker for advisory work signals on one utterance.
// INPUT: the safe utterance + optional runtime overrides (tests inject mocks).
// OUTPUT: an honest WorkSignalExtractionResult — never throws.
// WHY: Foundation enriches when Python is healthy, and degrades to a named
//      status (never a fake green) when it is not.
export async function extractWorkSignals(
  input: WorkSignalExtractionInput,
  runtime: EnrichmentRuntimeConfig = {},
): Promise<WorkSignalExtractionResult> {
  if (input.text.trim().length === 0) {
    return empty("PYTHON_INVALID_RESPONSE");
  }
  const pythonUrl =
    runtime.pythonUrl ?? process.env.PYTHON_INTELLIGENCE_RUNTIME_URL ?? null;
  if (pythonUrl === null || pythonUrl.length === 0) {
    return empty("PYTHON_NOT_CONFIGURED");
  }

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    runtime.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  const fetchFn = runtime.fetchImpl ?? fetch;

  try {
    const res = await fetchFn(`${pythonUrl}/jobs/extract-work-signals`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: input.text,
        ...(input.source_type !== undefined ? { source_type: input.source_type } : {}),
      }),
      signal: controller.signal,
    });
    if (!res.ok) return empty("PYTHON_JOB_FAILED");
    const raw = (await res.json()) as unknown;
    const validated = validatePythonEnrichmentResponse(raw);
    return validated ?? empty("PYTHON_INVALID_RESPONSE");
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return empty(aborted ? "PYTHON_TIMEOUT" : "PYTHON_UNHEALTHY");
  } finally {
    clearTimeout(timer);
  }
}
