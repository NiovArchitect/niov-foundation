// FILE: python-draft-tone.service.ts
// PURPOSE: Phase 1285-Y — the bounded, honest client for the Python DRAFT_TONE
//          capability (POST /jobs/draft-tone). ADVISORY ONLY: Foundation governs
//          the call and is the sole authority on send / approval / recipients /
//          intent. This client sends the proposed draft + context, never throws,
//          and degrades to a NAMED status (never a fake green) when Python is
//          absent / unhealthy / slow / drifting. Foundation re-validates the
//          suggested revision (no em dash, no new recipient, intent preserved)
//          and keeps approval gates intact in validateDraftToneEnvelope; the
//          original draft is never mutated.
// CONNECTS TO: services/python-intelligence (the FastAPI worker /jobs/draft-
//          tone), python-intelligence.ts (the envelope/contract), work-os/
//          draft-tone.service.ts (the consumer), tests/unit/python-draft-tone.test.ts.

import type { EnrichmentStatus } from "./python-enrichment.service.js";
import type {
  DraftToneCandidate,
  DraftToneExtractionResult,
} from "./python-intelligence.js";

export interface DraftToneRuntimeConfig {
  pythonUrl?: string | null;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export type DraftChannel =
  | "internal_message"
  | "email"
  | "meeting_follow_up"
  | "action_proposal"
  | "voice_draft"
  | "unknown";

// What Foundation sends Python. recipient_context carries a display name only —
// never a raw entity UUID.
export interface DraftTonePayload {
  draft_id?: string;
  draft_text: string;
  channel: DraftChannel;
  recipient_context?: {
    display_name?: string;
    relationship?: string;
    internal: boolean;
  };
  intent?: string;
  constraints?: {
    no_em_dash: true;
    preserve_intent: true;
    approval_required?: boolean;
  };
}

const DEFAULT_TIMEOUT_MS = 2_000;
const TONE_LABELS = ["CLEAR", "WARM", "DIRECT", "TOO_HARSH", "TOO_VAGUE", "TOO_LONG", "NEEDS_CONTEXT", "EXECUTIVE_READY", "RISKY"];
const RISK_FLAGS = ["EM_DASH", "HARSH_TONE", "BLAME_LANGUAGE", "AMBIGUOUS_RECIPIENT", "MISSING_CONTEXT", "TOO_MANY_WORDS", "POSSIBLE_POLICY_RISK", "EXTERNAL_SEND_REQUIRES_APPROVAL"];
const CONFIDENCES = ["HIGH", "MEDIUM", "LOW"];

function empty(status: EnrichmentStatus): DraftToneExtractionResult {
  return { status, assessment: null };
}

// WHAT: validate a raw Python draft-tone response into a closed-vocab result.
// OUTPUT: a normalized result on success; null when the shape drifts.
// WHY: Python is advisory but Foundation refuses to trust anything it cannot
//      prove is closed-vocab. score is clamped + reason/revision length-capped.
export function validateDraftToneResponse(
  raw: unknown,
): DraftToneExtractionResult | null {
  if (typeof raw !== "object" || raw === null) return null;
  const c = raw as Record<string, unknown>;
  if (typeof c.quality_score !== "number" || !Number.isFinite(c.quality_score)) return null;
  if (!TONE_LABELS.includes(c.tone_label as string)) return null;
  if (typeof c.suggested_revision !== "string" || c.suggested_revision.length === 0) return null;
  if (typeof c.reason !== "string" || c.reason.length === 0) return null;
  if (!CONFIDENCES.includes(c.confidence as string)) return null;
  if (typeof c.approval_required !== "boolean") return null;
  if (typeof c.preserves_intent !== "boolean") return null;
  const flags = Array.isArray(c.risk_flags)
    ? c.risk_flags.filter((f): f is string => typeof f === "string" && RISK_FLAGS.includes(f))
    : [];
  const assessment: DraftToneCandidate = {
    quality_score: Math.max(0, Math.min(100, Math.round(c.quality_score))),
    tone_label: c.tone_label as string,
    risk_flags: flags.slice(0, 12),
    suggested_revision: c.suggested_revision.slice(0, 8000),
    reason: c.reason.slice(0, 300),
    confidence: c.confidence as string,
    approval_required: c.approval_required,
    preserves_intent: c.preserves_intent,
  };
  return { status: "PYTHON_ENRICHED", assessment };
}

// WHAT: ask the Python worker to assess a proposed draft and suggest a revision.
// INPUT: the draft + channel/recipient/intent/constraints + runtime.
// OUTPUT: an honest DraftToneExtractionResult — never throws.
// WHY: deterministic Foundation assessment always exists as the fallback; this
//      only enriches it when Python is healthy.
export async function evaluateDraftTonePython(
  input: DraftTonePayload,
  runtime: DraftToneRuntimeConfig = {},
): Promise<DraftToneExtractionResult> {
  if (input.draft_text.trim().length === 0) return empty("PYTHON_INVALID_RESPONSE");
  const pythonUrl =
    runtime.pythonUrl ?? process.env.PYTHON_INTELLIGENCE_RUNTIME_URL ?? null;
  if (pythonUrl === null || pythonUrl.length === 0) {
    return empty("PYTHON_NOT_CONFIGURED");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), runtime.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const fetchFn = runtime.fetchImpl ?? fetch;
  try {
    const res = await fetchFn(`${pythonUrl}/jobs/draft-tone`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...(input.draft_id !== undefined ? { draft_id: input.draft_id } : {}),
        draft_text: input.draft_text,
        channel: input.channel,
        ...(input.recipient_context !== undefined ? { recipient_context: input.recipient_context } : {}),
        ...(input.intent !== undefined ? { intent: input.intent } : {}),
        ...(input.constraints !== undefined ? { constraints: input.constraints } : {}),
      }),
      signal: controller.signal,
    });
    if (!res.ok) return empty("PYTHON_JOB_FAILED");
    const raw = (await res.json()) as unknown;
    const validated = validateDraftToneResponse(raw);
    return validated ?? empty("PYTHON_INVALID_RESPONSE");
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return empty(aborted ? "PYTHON_TIMEOUT" : "PYTHON_UNHEALTHY");
  } finally {
    clearTimeout(timer);
  }
}
