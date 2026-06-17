// FILE: python-intelligence.ts
// PURPOSE: Phase 1285-U — the general Python advisory-intelligence CONTRACT for
//          Otzar. Python is an ADVISORY layer: it returns candidates, scores,
//          summaries, and enrichment metadata. It NEVER grants permission,
//          decides scope, becomes the source of truth, or mutates governed
//          state. Foundation validates, scopes, audits, and accepts / rejects /
//          downgrades every Python output. This module defines the envelope +
//          status model + the Foundation validation step once, so future
//          capabilities (meeting/transcript intelligence, semantic retrieval,
//          risk scoring, draft tone, operational analytics) plug in WITHOUT
//          redesigning the architecture. Phase 1285-U ships the
//          WORK_SIGNAL_EXTRACTION capability through this contract; the rest
//          are designed-for, not built.
// CONNECTS TO: python-enrichment.service.ts (the narrow HTTP extractor this
//          wraps), work-os/work-ledger.service.ts (the first consumer),
//          tests/unit/python-intelligence.test.ts.

import type {
  WorkSignalExtractionResult,
  EnrichmentStatus,
} from "./python-enrichment.service.js";

// WHAT: the honest lifecycle status of a Python advisory enrichment, including
//        Foundation's verdict. PENDING is stamped before the async call;
//        terminal Python states map from the runtime; FOUNDATION_REJECTED /
//        FOUNDATION_DOWNGRADED record Foundation's validation outcome when
//        Python proposed something the substrate could not safely accept.
export type PythonEnrichmentStatus =
  | "PENDING"
  | "PYTHON_ENRICHED"
  | "NOT_CONFIGURED"
  | "UNHEALTHY"
  | "TIMEOUT"
  | "ERROR"
  | "NO_SIGNAL"
  | "SKIPPED"
  | "FOUNDATION_REJECTED"
  | "FOUNDATION_DOWNGRADED";

// Foundation's verdict on the advisory output. null until validation runs.
export type PythonAuthority = "FOUNDATION_VALIDATED" | "FOUNDATION_REJECTED";

// The capabilities Python may serve. Only WORK_SIGNAL_EXTRACTION is live in
// 1285-U; the rest are reserved so the contract is stable for 1285-V..Z.
export type PythonCapability =
  | "WORK_SIGNAL_EXTRACTION"
  | "MEETING_INTELLIGENCE"
  | "SEMANTIC_RETRIEVAL"
  | "RISK_SCORING"
  | "DRAFT_TONE"
  | "ENTITY_RESOLUTION"
  | "DOCUMENT_ANALYSIS"
  | "OPERATIONAL_ANALYTICS"
  | "SIMULATION";

// A single advisory candidate. Closed-vocab fields only; future capabilities
// extend via additional optional fields, never by widening the meaning.
export interface PythonSignalCandidate {
  signal_type: string;
  confidence: string; // HIGH | MEDIUM | LOW
  evidence_phrase: string;
}

// ── Ambient perception (Phase 1285-V) ───────────────────────────────────────
// AmbientSourceType is the runway for glasses/lenses + other ambient inputs;
// only the transcript/note sources are wired now, the rest are reserved so the
// pipeline (capture -> normalize -> deterministic -> advisory -> Foundation
// validation -> governed surfaces) is not a transcript-only dead end.
export type AmbientSourceType =
  | "MEETING_TRANSCRIPT"
  | "VOICE_NOTE"
  | "CONVERSATION_SNIPPET"
  | "IMPORTED_NOTES"
  // Reserved for future ambient input adapters (not built now):
  | "GLASSES_VISUAL_FRAME"
  | "SCREEN_CONTEXT"
  | "DOCUMENT_CONTEXT"
  | "LOCATION_SIGNAL";

export type MeetingCandidateType =
  | "SUMMARY"
  | "DECISION"
  | "ACTION_ITEM"
  | "BLOCKER"
  | "RISK"
  | "OPEN_QUESTION"
  | "COMMITMENT"
  | "FOLLOW_UP"
  | "DRAFT_SUGGESTION";

export interface MeetingIntelligenceCandidate {
  candidate_type: MeetingCandidateType;
  text: string; // a short, safe extraction — never the full transcript
  confidence: string; // HIGH | MEDIUM | LOW
  evidence_phrase: string;
}

// The advisory items an envelope can carry, across capabilities.
export type PythonCandidate = PythonSignalCandidate | MeetingIntelligenceCandidate;

// The closed-vocab result the meeting/perception client returns to Foundation.
export interface MeetingIntelligenceExtractionResult {
  status: EnrichmentStatus;
  summary: string | null;
  candidates: MeetingIntelligenceCandidate[];
}

// WHAT: the canonical envelope every Python advisory result is wrapped in.
// WHY: one shape across all capabilities so Foundation validation, audit, and
//      View/Why proof are uniform. NEVER carries raw chain-of-thought; only a
//      short, audit-safe reasoning_summary.
export interface PythonIntelligenceEnvelope {
  status: PythonEnrichmentStatus;
  source: "PYTHON_ADVISORY";
  authority: PythonAuthority | null;
  capability: PythonCapability;
  model: string | null;
  version: string | null;
  latency_ms: number | null;
  confidence: string | null;
  candidates: PythonCandidate[];
  summary: string | null;
  reasoning_summary: string | null; // short + audit-safe; NEVER raw CoT
  provenance: string | null;
  warnings: string[];
  error_code: string | null;
  updated_at: string;
}

// Phase 1285-V — the perception envelope is the SAME shape as the intelligence
// envelope; the alias names the ambient-perception use (transcripts now,
// glasses/lenses later) so callers read intent clearly.
export type PythonPerceptionEnvelope = PythonIntelligenceEnvelope;

// WHAT: the PENDING envelope stamped on a record before the async call runs.
// WHY: the deterministic write happens immediately; the row honestly reads
//      PENDING until the fire-and-forget task resolves it.
export function pendingEnvelope(
  capability: PythonCapability,
  nowIso: string,
): PythonIntelligenceEnvelope {
  return {
    status: "PENDING",
    source: "PYTHON_ADVISORY",
    authority: null,
    capability,
    model: null,
    version: null,
    latency_ms: null,
    confidence: null,
    candidates: [],
    summary: null,
    reasoning_summary: null,
    provenance: null,
    warnings: [],
    error_code: null,
    updated_at: nowIso,
  };
}

// WHAT: map the narrow extractor's status to the envelope status.
// WHY: PYTHON_ENRICHED is only honest when signals were actually returned; a
//      200 with no signals is NO_SIGNAL. Unavailability maps to its cause;
//      malformed/failed maps to ERROR.
function statusFromExtraction(result: WorkSignalExtractionResult): PythonEnrichmentStatus {
  switch (result.status) {
    case "PYTHON_ENRICHED":
      return result.signals.length > 0 ? "PYTHON_ENRICHED" : "NO_SIGNAL";
    case "PYTHON_NOT_CONFIGURED":
      return "NOT_CONFIGURED";
    case "PYTHON_UNHEALTHY":
      return "UNHEALTHY";
    case "PYTHON_TIMEOUT":
      return "TIMEOUT";
    case "PYTHON_JOB_FAILED":
    case "PYTHON_INVALID_RESPONSE":
      return "ERROR";
    default:
      return "ERROR";
  }
}

// WHAT: wrap a WORK_SIGNAL_EXTRACTION runtime result into the general envelope.
// INPUT: the extractor result + measured latency.
// OUTPUT: a pre-validation envelope (authority still null).
// WHY: the work-signal capability is the first to flow through the contract.
export function buildWorkSignalEnvelope(
  result: WorkSignalExtractionResult,
  latencyMs: number,
  nowIso: string,
): PythonIntelligenceEnvelope {
  const status = statusFromExtraction(result);
  const enriched = status === "PYTHON_ENRICHED";
  return {
    status,
    source: "PYTHON_ADVISORY",
    authority: null,
    capability: "WORK_SIGNAL_EXTRACTION",
    model: null, // runtime does not report model/version yet (see investigation)
    version: null,
    latency_ms: latencyMs,
    confidence: enriched ? (result.signals[0]?.confidence ?? null) : null,
    candidates: result.signals,
    summary: enriched ? `Detected ${result.signals.length} work signal(s).` : null,
    reasoning_summary: null,
    provenance: "python:extract-work-signals",
    warnings: [],
    error_code: enriched ? null : status,
    updated_at: nowIso,
  };
}

// WHAT: Foundation's validation of a Python advisory envelope.
// INPUT: a pre-validation envelope.
// OUTPUT: the envelope with `authority` set (and status possibly downgraded).
// WHY: Foundation is the authority. Advisory signals are accepted ONLY as
//      metadata (no governed-state mutation, no entity/owner/scope acceptance).
//      A successful, signal-bearing envelope is FOUNDATION_VALIDATED; anything
//      else carries no acceptance (authority null). This is the seam future
//      capabilities use to REJECT (cross-tenant / unknown-entity / unsafe
//      proposal) or DOWNGRADE Python output before it touches the substrate.
export function validateAdvisoryEnvelope(
  envelope: PythonIntelligenceEnvelope,
): PythonIntelligenceEnvelope {
  if (envelope.status === "PYTHON_ENRICHED" && envelope.candidates.length > 0) {
    // Work-signal candidates are advisory metadata only — safe to accept as
    // enrichment without mutating any governed field.
    return { ...envelope, authority: "FOUNDATION_VALIDATED" };
  }
  // Nothing actionable to accept; record no authority. (Future capabilities
  // that propose governed changes set FOUNDATION_REJECTED / _DOWNGRADED here.)
  return { ...envelope, authority: null };
}

// WHAT: may Foundation upgrade the record's extraction_source to PYTHON_ENRICHED?
// WHY: only when Python genuinely enriched AND Foundation validated it AND the
//      caller did not pin an explicit extraction_source. Deterministic truth
//      stays primary otherwise.
export function envelopeUpgradesExtraction(
  envelope: PythonIntelligenceEnvelope,
  callerPinnedExtraction: boolean,
): boolean {
  return (
    envelope.status === "PYTHON_ENRICHED" &&
    envelope.authority === "FOUNDATION_VALIDATED" &&
    !callerPinnedExtraction
  );
}

// WHAT: wrap a MEETING_INTELLIGENCE runtime result into the perception envelope.
// WHY: Phase 1285-V — meeting/transcript intelligence is the first ambient
//      perception capability. The summary + candidates are advisory metadata;
//      capability is MEETING_INTELLIGENCE.
export function buildMeetingIntelligenceEnvelope(
  result: MeetingIntelligenceExtractionResult,
  latencyMs: number,
  nowIso: string,
): PythonPerceptionEnvelope {
  let status: PythonEnrichmentStatus;
  switch (result.status) {
    case "PYTHON_ENRICHED":
      status = result.candidates.length > 0 ? "PYTHON_ENRICHED" : "NO_SIGNAL";
      break;
    case "PYTHON_NOT_CONFIGURED":
      status = "NOT_CONFIGURED";
      break;
    case "PYTHON_UNHEALTHY":
      status = "UNHEALTHY";
      break;
    case "PYTHON_TIMEOUT":
      status = "TIMEOUT";
      break;
    default:
      status = "ERROR"; // PYTHON_JOB_FAILED / PYTHON_INVALID_RESPONSE
  }
  const enriched = status === "PYTHON_ENRICHED";
  return {
    status,
    source: "PYTHON_ADVISORY",
    authority: null,
    capability: "MEETING_INTELLIGENCE",
    model: null,
    version: null,
    latency_ms: latencyMs,
    confidence: enriched ? (result.candidates[0]?.confidence ?? null) : null,
    candidates: result.candidates,
    summary: enriched ? result.summary : null,
    reasoning_summary: null,
    provenance: "python:meeting-intelligence",
    warnings: [],
    error_code: enriched ? null : status,
    updated_at: nowIso,
  };
}

// WHAT: Foundation validation of a meeting-intelligence envelope.
// WHY: Foundation is the authority. Meeting candidates are advisory metadata
//      (no governed-state mutation, no owner/requester/target acceptance, no
//      cross-tenant refs, no external send; DRAFT_SUGGESTION stays a proposal).
//      A signal-bearing envelope with at least one non-LOW candidate is
//      FOUNDATION_VALIDATED; an enrichment that is ALL low-confidence is
//      DOWNGRADED to advisory-needs-review; everything else carries no
//      acceptance. This is the seam future capabilities use to REJECT unsafe
//      proposals before they touch the substrate.
export function validateMeetingEnvelope(
  envelope: PythonPerceptionEnvelope,
): PythonPerceptionEnvelope {
  if (envelope.status !== "PYTHON_ENRICHED" || envelope.candidates.length === 0) {
    return { ...envelope, authority: null };
  }
  const hasConfident = envelope.candidates.some(
    (c) => c.confidence === "HIGH" || c.confidence === "MEDIUM",
  );
  if (!hasConfident) {
    // Only low-confidence candidates: keep as advisory but mark it needs review.
    return {
      ...envelope,
      status: "FOUNDATION_DOWNGRADED",
      authority: null,
      warnings: [...envelope.warnings, "all candidates low-confidence; review required"],
    };
  }
  return { ...envelope, authority: "FOUNDATION_VALIDATED" };
}
