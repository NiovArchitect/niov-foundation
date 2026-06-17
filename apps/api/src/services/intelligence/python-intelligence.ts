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
  // Device-originated TEXT ambient packets (Phase 1287-A glasses/lens adapter).
  // These carry a short, user-confirmed TEXT note/context — never a raw camera
  // frame and never visual/biometric data (those stay reserved below).
  | "GLASSES_NOTE"
  | "LENS_CONTEXT"
  | "AMBIENT_DEVICE_PACKET"
  // Reserved for future ambient input adapters (not built now). GLASSES_VISUAL_
  // FRAME stays reserved — Foundation does NOT process raw frames / images /
  // appearance / biometrics in this or the 1287-A adapter phase.
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

// ── Semantic retrieval (Phase 1285-W) ───────────────────────────────────────
// An advisory rank for ONE candidate Foundation already allowed. Python returns
// only candidate_ids it was sent; Foundation re-validates every id against the
// allowed set before any result is surfaced. score is advisory; reason is a
// short closed phrase (never raw chain-of-thought).
export interface SemanticRankCandidate {
  candidate_id: string;
  score: number;
  reason: string;
}

// ── Risk scoring (Phase 1285-X) ─────────────────────────────────────────────
// An advisory risk assessment for ONE candidate Foundation already scoped (a
// deterministic watcher finding over durable work). Foundation re-validates the
// candidate_id against the allowed set; severity/signals are closed-vocab; the
// deterministic watcher finding stays primary. reason is a short closed phrase
// (never raw chain-of-thought).
export interface RiskScoreCandidate {
  candidate_id: string;
  risk_score: number; // 0..100
  severity: string; // LOW | MEDIUM | HIGH | CRITICAL
  confidence: string; // HIGH | MEDIUM | LOW
  reason: string;
  contributing_signals: string[];
  suggested_next_action: string;
  human_review_needed: boolean;
}

// ── Draft tone (Phase 1285-Y) ───────────────────────────────────────────────
// An advisory assessment of ONE proposed message + a SAFE suggested revision.
// Foundation re-validates the revision (no em dash, no new recipient/email/URL,
// intent preserved) and keeps approval gates authoritative; the original draft
// is always preserved and primary. reason is a short closed phrase (never raw
// chain-of-thought).
export interface DraftToneCandidate {
  quality_score: number; // 0..100
  tone_label: string;
  risk_flags: string[];
  suggested_revision: string;
  reason: string;
  confidence: string; // HIGH | MEDIUM | LOW
  approval_required: boolean;
  preserves_intent: boolean;
}

// ── Operational analytics (Phase 1285-Z) ────────────────────────────────────
// An advisory execution-health assessment over a Foundation-scoped snapshot.
// Foundation re-validates it: overloaded_people must be names from the snapshot;
// no id is referenced outside the snapshot; em dashes are sanitized from the
// recipient-facing prose. health_score/execution_status are advisory here — the
// surfaced numbers stay Foundation-deterministic.
export interface OperationalAnalyticsCandidate {
  health_score: number;
  execution_status: string; // HEALTHY | WATCH | AT_RISK | CRITICAL
  summary: string;
  top_risks: string[];
  recurring_blockers: string[];
  overloaded_people: string[];
  suggested_focus: string[];
  recommended_next_actions: string[];
  confidence: string;
  human_review_needed: boolean;
}

// The advisory items an envelope can carry, across capabilities.
export type PythonCandidate =
  | PythonSignalCandidate
  | MeetingIntelligenceCandidate
  | SemanticRankCandidate
  | RiskScoreCandidate
  | DraftToneCandidate
  | OperationalAnalyticsCandidate;

// The closed-vocab result the semantic-rerank client returns to Foundation.
export interface SemanticRerankExtractionResult {
  status: EnrichmentStatus;
  ranked: SemanticRankCandidate[];
}

// The closed-vocab result the risk-scoring client returns to Foundation.
export interface RiskScoringExtractionResult {
  status: EnrichmentStatus;
  scores: RiskScoreCandidate[];
}

// The closed-vocab result the draft-tone client returns to Foundation.
export interface DraftToneExtractionResult {
  status: EnrichmentStatus;
  assessment: DraftToneCandidate | null;
}

// The closed-vocab result the operational-analytics client returns to Foundation.
export interface OperationalAnalyticsExtractionResult {
  status: EnrichmentStatus;
  analytics: OperationalAnalyticsCandidate | null;
}

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
    (c) => "confidence" in c && (c.confidence === "HIGH" || c.confidence === "MEDIUM"),
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

// WHAT: wrap a SEMANTIC_RETRIEVAL rerank runtime result into the envelope.
// WHY: Phase 1285-W — the rerank is advisory ordering metadata over candidates
//      Foundation already scoped. A 200 with no ranked candidates is NO_SIGNAL
//      (Python found no relevance — Foundation's deterministic order stands);
//      unavailability/failure map to their explicit cause.
export function buildSemanticRetrievalEnvelope(
  result: SemanticRerankExtractionResult,
  latencyMs: number,
  nowIso: string,
): PythonIntelligenceEnvelope {
  let status: PythonEnrichmentStatus;
  switch (result.status) {
    case "PYTHON_ENRICHED":
      status = result.ranked.length > 0 ? "PYTHON_ENRICHED" : "NO_SIGNAL";
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
    capability: "SEMANTIC_RETRIEVAL",
    model: null,
    version: null,
    latency_ms: latencyMs,
    confidence: null,
    candidates: result.ranked,
    summary: enriched ? `Reranked ${result.ranked.length} candidate(s).` : null,
    reasoning_summary: null,
    provenance: "python:semantic-rerank",
    warnings: [],
    error_code: enriched ? null : status,
    updated_at: nowIso,
  };
}

// WHAT: Foundation's validation of a semantic-rerank envelope.
// INPUT: a pre-validation envelope + the set of candidate_ids Foundation allowed.
// OUTPUT: the envelope with unknown ids dropped + authority set.
// WHY: Foundation is the authority. Python may ONLY rank candidates Foundation
//      already scoped — any returned id NOT in the allowed set is a cross-tenant
//      / unknown / drift result and is rejected here before it can surface. A
//      rerank that, after rejection, has at least one allowed id is
//      FOUNDATION_VALIDATED; a rerank where EVERY id was unknown is
//      FOUNDATION_DOWNGRADED (drift — the deterministic order stands); anything
//      not enriched carries no authority.
export function validateSemanticRetrievalEnvelope(
  envelope: PythonIntelligenceEnvelope,
  allowedIds: ReadonlySet<string>,
): PythonIntelligenceEnvelope {
  if (envelope.status !== "PYTHON_ENRICHED") {
    return { ...envelope, authority: null };
  }
  const ranked = envelope.candidates.filter(
    (c): c is SemanticRankCandidate =>
      "candidate_id" in c && allowedIds.has((c as SemanticRankCandidate).candidate_id),
  );
  const droppedUnknown = envelope.candidates.length - ranked.length;
  const warnings = [...envelope.warnings];
  if (droppedUnknown > 0) {
    warnings.push(
      `${droppedUnknown} reranked candidate(s) rejected: not in the Foundation-allowed set`,
    );
  }
  if (ranked.length === 0) {
    // Python returned only ids Foundation never allowed — drift. Keep advisory
    // but mark needs-review; the deterministic ordering is what surfaces.
    return {
      ...envelope,
      status: "FOUNDATION_DOWNGRADED",
      authority: null,
      candidates: [],
      warnings,
    };
  }
  return { ...envelope, candidates: ranked, authority: "FOUNDATION_VALIDATED", warnings };
}

// WHAT: wrap a RISK_SCORING runtime result into the envelope.
// WHY: Phase 1285-X — risk scores are advisory metadata over deterministic
//      watcher findings. A 200 with no scores is NO_SIGNAL (nothing to assess —
//      the deterministic findings stand); unavailability/failure map to cause.
export function buildRiskScoringEnvelope(
  result: RiskScoringExtractionResult,
  latencyMs: number,
  nowIso: string,
): PythonIntelligenceEnvelope {
  let status: PythonEnrichmentStatus;
  switch (result.status) {
    case "PYTHON_ENRICHED":
      status = result.scores.length > 0 ? "PYTHON_ENRICHED" : "NO_SIGNAL";
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
    capability: "RISK_SCORING",
    model: null,
    version: null,
    latency_ms: latencyMs,
    confidence: null,
    candidates: result.scores,
    summary: enriched ? `Scored ${result.scores.length} risk candidate(s).` : null,
    reasoning_summary: null,
    provenance: "python:risk-scoring",
    warnings: [],
    error_code: enriched ? null : status,
    updated_at: nowIso,
  };
}

// WHAT: Foundation's validation of a risk-scoring envelope.
// INPUT: a pre-validation envelope + the set of candidate_ids Foundation allowed.
// OUTPUT: the envelope with unknown ids dropped + authority set.
// WHY: Foundation is the authority. Python may ONLY score candidates Foundation
//      already scoped — any returned id NOT in the allowed set is unknown /
//      cross-tenant / drift and is rejected here before it can surface. A
//      scoring that, after rejection, has at least one allowed id is
//      FOUNDATION_VALIDATED; an all-unknown result is FOUNDATION_DOWNGRADED (the
//      deterministic findings stand); anything not enriched carries no authority.
export function validateRiskScoringEnvelope(
  envelope: PythonIntelligenceEnvelope,
  allowedIds: ReadonlySet<string>,
): PythonIntelligenceEnvelope {
  if (envelope.status !== "PYTHON_ENRICHED") {
    return { ...envelope, authority: null };
  }
  const scored = envelope.candidates.filter(
    (c): c is RiskScoreCandidate =>
      "candidate_id" in c &&
      "risk_score" in c &&
      allowedIds.has((c as RiskScoreCandidate).candidate_id),
  );
  const droppedUnknown = envelope.candidates.length - scored.length;
  const warnings = [...envelope.warnings];
  if (droppedUnknown > 0) {
    warnings.push(
      `${droppedUnknown} risk score(s) rejected: not in the Foundation-allowed set`,
    );
  }
  if (scored.length === 0) {
    return {
      ...envelope,
      status: "FOUNDATION_DOWNGRADED",
      authority: null,
      candidates: [],
      warnings,
    };
  }
  return { ...envelope, candidates: scored, authority: "FOUNDATION_VALIDATED", warnings };
}

// WHAT: wrap a DRAFT_TONE runtime result into the envelope.
// WHY: Phase 1285-Y — the assessment + suggested revision are advisory. A 200
//      with no assessment is NO_SIGNAL; unavailability/failure map to cause.
export function buildDraftToneEnvelope(
  result: DraftToneExtractionResult,
  latencyMs: number,
  nowIso: string,
): PythonIntelligenceEnvelope {
  let status: PythonEnrichmentStatus;
  switch (result.status) {
    case "PYTHON_ENRICHED":
      status = result.assessment !== null ? "PYTHON_ENRICHED" : "NO_SIGNAL";
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
    capability: "DRAFT_TONE",
    model: null,
    version: null,
    latency_ms: latencyMs,
    confidence: enriched ? (result.assessment?.confidence ?? null) : null,
    candidates: result.assessment !== null ? [result.assessment] : [],
    summary: enriched ? `Assessed draft tone (${result.assessment?.tone_label}).` : null,
    reasoning_summary: null,
    provenance: "python:draft-tone",
    warnings: [],
    error_code: enriched ? null : status,
    updated_at: nowIso,
  };
}

const EM_DASH_RE = /[—–]/; // em dash + en dash
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const URL_RE = /https?:\/\/\S+/gi;

function emailsIn(text: string): Set<string> {
  return new Set((text.match(EMAIL_RE) ?? []).map((e) => e.toLowerCase()));
}
function urlsIn(text: string): Set<string> {
  return new Set((text.match(URL_RE) ?? []).map((u) => u.toLowerCase()));
}

// WHAT: Foundation's validation of a draft-tone envelope.
// INPUT: a pre-validation envelope + the original draft + the deterministic
//        approval_required (Foundation-authoritative — Python can never LOWER it).
// OUTPUT: the envelope with the assessment safety-checked + approval raised.
// WHY: Foundation is the authority. Python may only SUGGEST a revision. The
//      suggested_revision is DOWNGRADED (blanked, advisory metadata kept) when it
//      is empty, contains an em/en dash, injects a new recipient email or URL not
//      in the original (recipient / external-send guard), reports
//      preserves_intent=false, or balloons abnormally. The original draft is
//      never mutated here; approval_required is always raised to the deterministic
//      value. A safe, intent-preserving revision is FOUNDATION_VALIDATED.
export function validateDraftToneEnvelope(
  envelope: PythonIntelligenceEnvelope,
  ctx: { originalDraft: string; approvalRequired: boolean },
): PythonIntelligenceEnvelope {
  if (envelope.status !== "PYTHON_ENRICHED" || envelope.candidates.length === 0) {
    return { ...envelope, authority: null };
  }
  const raw = envelope.candidates[0] as DraftToneCandidate;
  // approval_required is Foundation-authoritative: Python can raise, never lower.
  const approval_required = ctx.approvalRequired || raw.approval_required === true;
  const candidate: DraftToneCandidate = { ...raw, approval_required };

  const revision = candidate.suggested_revision ?? "";
  const origEmails = emailsIn(ctx.originalDraft);
  const origUrls = urlsIn(ctx.originalDraft);
  const newEmail = [...emailsIn(revision)].some((e) => !origEmails.has(e));
  const newUrl = [...urlsIn(revision)].some((u) => !origUrls.has(u));
  const tooLong = revision.length > ctx.originalDraft.length * 4 + 200;

  const reasons: string[] = [];
  if (revision.trim().length === 0) reasons.push("empty suggested revision");
  if (EM_DASH_RE.test(revision)) reasons.push("suggested revision contains an em dash");
  if (newEmail) reasons.push("suggested revision injects a new recipient address");
  if (newUrl) reasons.push("suggested revision injects a new link / external send");
  if (candidate.preserves_intent === false) reasons.push("Python reported intent not preserved");
  if (tooLong) reasons.push("suggested revision balloons beyond the original");

  if (reasons.length > 0) {
    // Unsafe rewrite — keep the advisory tone metadata but drop the revision and
    // mark needs-review. The original draft (held by the caller) stays primary.
    return {
      ...envelope,
      status: "FOUNDATION_DOWNGRADED",
      authority: null,
      candidates: [{ ...candidate, suggested_revision: "" }],
      warnings: [...envelope.warnings, `suggested revision rejected: ${reasons.join("; ")}`],
    };
  }
  return { ...envelope, candidates: [candidate], authority: "FOUNDATION_VALIDATED" };
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
function sanitizeProse(s: string): string {
  return s.replace(/\s*[—–]\s*/g, ", ");
}

// WHAT: wrap an OPERATIONAL_ANALYTICS runtime result into the envelope.
// WHY: Phase 1285-Z — the analytics summary + lists are advisory. A 200 with no
//      analytics is NO_SIGNAL; unavailability/failure map to cause.
export function buildOperationalAnalyticsEnvelope(
  result: OperationalAnalyticsExtractionResult,
  latencyMs: number,
  nowIso: string,
): PythonIntelligenceEnvelope {
  let status: PythonEnrichmentStatus;
  switch (result.status) {
    case "PYTHON_ENRICHED":
      status = result.analytics !== null ? "PYTHON_ENRICHED" : "NO_SIGNAL";
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
    capability: "OPERATIONAL_ANALYTICS",
    model: null,
    version: null,
    latency_ms: latencyMs,
    confidence: enriched ? (result.analytics?.confidence ?? null) : null,
    candidates: result.analytics !== null ? [result.analytics] : [],
    summary: enriched ? (result.analytics?.summary ?? null) : null,
    reasoning_summary: null,
    provenance: "python:operational-analytics",
    warnings: [],
    error_code: enriched ? null : status,
    updated_at: nowIso,
  };
}

// WHAT: Foundation's validation of an operational-analytics envelope.
// INPUT: a pre-validation envelope + the snapshot's known display names.
// OUTPUT: the envelope with overloaded_people re-scoped + prose sanitized.
// WHY: Foundation is the authority. Python may NOT introduce a person who is not
//      in the snapshot (overloaded_people is filtered to known names), reference
//      an id outside the snapshot (a UUID-looking token in the prose is drift →
//      DOWNGRADED), or emit recipient-facing em dashes (sanitized). An empty
//      summary is DOWNGRADED. Note: health_score / execution_status here are
//      advisory — the SERVICE surfaces the Foundation-deterministic numbers.
export function validateOperationalAnalyticsEnvelope(
  envelope: PythonIntelligenceEnvelope,
  ctx: { knownPeople: ReadonlySet<string> },
): PythonIntelligenceEnvelope {
  if (envelope.status !== "PYTHON_ENRICHED" || envelope.candidates.length === 0) {
    return { ...envelope, authority: null };
  }
  const raw = envelope.candidates[0] as OperationalAnalyticsCandidate;
  const warnings = [...envelope.warnings];

  const keptPeople = raw.overloaded_people.filter((p) => ctx.knownPeople.has(p));
  if (keptPeople.length !== raw.overloaded_people.length) {
    warnings.push("overloaded_people entries not in the snapshot were dropped");
  }

  const candidate: OperationalAnalyticsCandidate = {
    ...raw,
    summary: sanitizeProse(raw.summary),
    top_risks: raw.top_risks.map(sanitizeProse),
    recurring_blockers: raw.recurring_blockers.map(sanitizeProse),
    overloaded_people: keptPeople.map(sanitizeProse),
    suggested_focus: raw.suggested_focus.map(sanitizeProse),
    recommended_next_actions: raw.recommended_next_actions.map(sanitizeProse),
  };

  const allProse = [
    candidate.summary,
    ...candidate.top_risks,
    ...candidate.recurring_blockers,
    ...candidate.suggested_focus,
    ...candidate.recommended_next_actions,
  ];
  if (candidate.summary.trim().length === 0) {
    return {
      ...envelope,
      status: "FOUNDATION_DOWNGRADED",
      authority: null,
      candidates: [],
      warnings: [...warnings, "empty analytics summary"],
    };
  }
  if (allProse.some((s) => UUID_RE.test(s))) {
    return {
      ...envelope,
      status: "FOUNDATION_DOWNGRADED",
      authority: null,
      candidates: [],
      warnings: [...warnings, "analytics referenced an id outside the snapshot"],
    };
  }
  return { ...envelope, candidates: [candidate], authority: "FOUNDATION_VALIDATED", warnings };
}
