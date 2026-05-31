// FILE: playground-outcome-comparison.service.ts
// PURPOSE: Section 5 Wave 6 Option A — Agent Playground
//          deterministic / template-first outcome-comparison
//          service per ADR-0073. Projects N Wave 5
//          PlaygroundCandidateView outputs into a closed-
//          vocabulary comparison matrix WITHOUT selecting a
//          winner, producing numeric scores, fabricating
//          probabilistic claims, producing employee scoring,
//          producing legal conclusions, or producing
//          autonomous decisions.
//
//          Computed-on-read; NO persistence; NO new Prisma
//          model; NO schema migration; NO new audit literal;
//          NO LLM / model calls; NO Python; NO BEAM; NO
//          Action creation; NO connector invocation; NO
//          external provider call; NO Control Tower frontend;
//          NO best-path recommendation (Wave 7 forward-
//          substrate); NO governed transition to Action
//          runtime (Wave 8 forward-substrate); NO multi-agent
//          simulation runtime (Wave 9 forward-substrate).
//
//          Owner-first + same-org SCENARIO_NOT_FOUND
//          enumeration-safe gate is inherited verbatim via
//          PlaygroundCandidateService.generateCandidates
//          delegation (which itself delegates to
//          PlaygroundScenarioService.getScenario); cross-
//          owner / cross-org / unknown id all fold to 404
//          without re-implementation per ADR-0073 §18 + RULE
//          0 + ADR-0065 §12 universal.
//
//          The "Wave 6 calls Wave 5 internally" canonical
//          decision at ADR-0073 §10 is enforced by
//          construction: the service NEVER accepts caller-
//          supplied candidate payloads; the only inputs are
//          (a) optional `candidate_types[]` closed-vocab
//          filter passed through to the internal
//          generateCandidates call, (b) optional
//          `max_candidates` (capped at ADR-0073 §11), and
//          (c) optional `comparison_mode` (closed-vocab).
//          Per Founder QLOCK 2 (2026-05-31), v1 does NOT
//          accept `candidate_keys[]` in the request body —
//          if needed later, a small ADR-0073 amendment or
//          implementation QLOCK is required.
//
//          Audit emission uses the canonical ADMIN_ACTION +
//          details.action discriminator pattern per ADR-0073
//          §14 with `details.action =
//          "PLAYGROUND_OUTCOMES_COMPARED"`; ZERO new audit
//          literal. Safe metadata only — NEVER raw
//          comparison text, NEVER raw candidate text, NEVER
//          raw scenario JSON, NEVER legal/compliance
//          conclusions, NEVER scores.
// CONNECTS TO:
//   - apps/api/src/services/playground/playground-candidate.service.ts
//     (Wave 5 candidate generation — internally invoked)
//   - apps/api/src/services/playground/playground-scenario.service.ts
//     (transitively via the candidate service for the owner-
//     first SCENARIO_NOT_FOUND gate)
//   - packages/database/src/queries/audit.ts (writeAuditEvent
//     — ADMIN_ACTION + details.action =
//     "PLAYGROUND_OUTCOMES_COMPARED")
//   - ADR-0073 Section 5 Wave 6 Outcome-Comparison Contract
//   - ADR-0072 Section 5 Wave 5 Candidate-Generation Contract
//     (input source verbatim)
//   - ADR-0065 §7 Wave 6 forward-queue line (closed at
//     contract register by ADR-0073; this service is the
//     Option A implementation surface)
//   - ADR-0070 §9 legal-advice boundary (inherited verbatim;
//     forbidden copy enforced by closed-vocab templates)

import { createHash } from "node:crypto";
import { writeAuditEvent } from "@niov/database";
import {
  PLAYGROUND_CANDIDATE_TYPE_VALUES,
  type PlaygroundCandidateService,
  type PlaygroundCandidateType,
  type PlaygroundCandidateView,
  type PlaygroundGovernanceFinding,
  type PlaygroundConfidenceLabel,
  type PlaygroundTransitionHint,
} from "./playground-candidate.service.js";
import type {
  PlaygroundScenarioFailureCode,
  PlaygroundScenarioService,
} from "./playground-scenario.service.js";

// WHAT: Closed-vocabulary outcome_dimensions set per
//        ADR-0073 §2.
// INPUT: Used as a constant + a type-narrowing source.
// OUTPUT: A readonly tuple of the 12 valid outcome dimensions.
// WHY: ADR-0073 §2 locks the 12 values. Adding a new value
//      requires a future Founder-authorized ADR amendment.
export const PLAYGROUND_OUTCOME_DIMENSION_VALUES = [
  "GOVERNANCE_ALIGNMENT",
  "EXECUTION_COMPLEXITY",
  "OPERATIONAL_RISK",
  "COMPLIANCE_REVIEW_NEED",
  "HUMAN_REVIEW_NEED",
  "DATA_SCOPE_READINESS",
  "CONNECTOR_READINESS",
  "CUSTOMER_OR_STAKEHOLDER_IMPACT",
  "COST_SENSITIVITY",
  "SPEED_TO_EXECUTION",
  "RESILIENCE_IMPACT",
  "REVERSIBILITY",
] as const;
export type PlaygroundOutcomeDimension =
  (typeof PLAYGROUND_OUTCOME_DIMENSION_VALUES)[number];

// WHAT: Closed-vocabulary dimension_rating set per ADR-0073
//        §2.
export const PLAYGROUND_DIMENSION_RATING_VALUES = [
  "FAVORABLE",
  "MIXED",
  "UNFAVORABLE",
  "INSUFFICIENT_DATA",
  "NOT_APPLICABLE",
] as const;
export type PlaygroundDimensionRating =
  (typeof PLAYGROUND_DIMENSION_RATING_VALUES)[number];

// WHAT: Closed-vocabulary risk_findings set per ADR-0073 §3.
export const PLAYGROUND_RISK_FINDING_VALUES = [
  "POLICY_RISK",
  "COMPLIANCE_REVIEW_RISK",
  "LEGAL_REVIEW_RISK",
  "DATA_SCOPE_RISK",
  "CONNECTOR_READINESS_RISK",
  "EXECUTION_COMPLEXITY_RISK",
  "OPERATIONAL_RESILIENCE_RISK",
  "STAKEHOLDER_IMPACT_RISK",
  "INSUFFICIENT_INFORMATION_RISK",
  "HUMAN_DECISION_REQUIRED_RISK",
] as const;
export type PlaygroundRiskFinding =
  (typeof PLAYGROUND_RISK_FINDING_VALUES)[number];

// WHAT: Closed-vocabulary dependency_findings set per
//        ADR-0073 §4.
export const PLAYGROUND_DEPENDENCY_FINDING_VALUES = [
  "REQUIRES_POLICY_REVIEW",
  "REQUIRES_APPROVAL_CHAIN",
  "REQUIRES_DUAL_CONTROL",
  "REQUIRES_CONNECTOR_CAPABILITY",
  "REQUIRES_DATA_SCOPE_EXPANSION",
  "REQUIRES_HUMAN_DECISION",
  "REQUIRES_LEGAL_OR_COMPLIANCE_REVIEW",
  "REQUIRES_ACTION_RUNTIME",
  "REQUIRES_ADDITIONAL_CONTEXT",
  "NO_BLOCKING_DEPENDENCY_IDENTIFIED",
] as const;
export type PlaygroundDependencyFinding =
  (typeof PLAYGROUND_DEPENDENCY_FINDING_VALUES)[number];

// WHAT: Closed-vocabulary required_reviews set per ADR-0073 §5.
export const PLAYGROUND_REQUIRED_REVIEW_VALUES = [
  "HUMAN_OWNER_REVIEW",
  "POLICY_OWNER_REVIEW",
  "COMPLIANCE_REVIEW",
  "LEGAL_REVIEW",
  "SECURITY_REVIEW",
  "DATA_GOVERNANCE_REVIEW",
  "CONNECTOR_ADMIN_REVIEW",
  "ACTION_APPROVER_REVIEW",
  "NO_ADDITIONAL_REVIEW_IDENTIFIED",
] as const;
export type PlaygroundRequiredReview =
  (typeof PLAYGROUND_REQUIRED_REVIEW_VALUES)[number];

// WHAT: Closed-vocabulary comparison_mode set per ADR-0073 §6.1.
export const PLAYGROUND_COMPARISON_MODE_VALUES = [
  "DETERMINISTIC_RUBRIC",
  "CANDIDATE_FIELD_PROJECTION",
] as const;
export type PlaygroundComparisonMode =
  (typeof PLAYGROUND_COMPARISON_MODE_VALUES)[number];

// WHAT: Closed-vocabulary comparison_notes set per ADR-0073
//        §6.2.
export const PLAYGROUND_COMPARISON_NOTE_VALUES = [
  "MORE_REVIEW_NEEDED_THAN_AVERAGE",
  "LESS_REVIEW_NEEDED_THAN_AVERAGE",
  "LOWER_OPERATIONAL_COMPLEXITY",
  "HIGHER_OPERATIONAL_COMPLEXITY",
  "HIGHER_CONNECTOR_READINESS",
  "LOWER_CONNECTOR_READINESS",
  "MORE_REVERSIBLE_THAN_AVERAGE",
  "LESS_REVERSIBLE_THAN_AVERAGE",
  "INSUFFICIENT_DATA_RELATIVE_TO_PEERS",
  "BLOCKED_BY_POLICY_OR_GOVERNANCE",
  "HUMAN_DECISION_REQUIRED",
  "NO_NOTABLE_RELATIVE_POSTURE",
] as const;
export type PlaygroundComparisonNote =
  (typeof PLAYGROUND_COMPARISON_NOTE_VALUES)[number];

// WHAT: Per-candidate outcome-dimension rating projection.
export interface PlaygroundOutcomeDimensionRating {
  dimension: PlaygroundOutcomeDimension;
  rating: PlaygroundDimensionRating;
}

// WHAT: The SAFE wire shape for one matrix item per ADR-0073
//        §1 (13 canonical fields).
// INPUT: Used as a return type only.
// OUTPUT: None.
// WHY: Every field is enumerated here so the no-leak surface
//      is explicit. Raw `candidate_summary` text from Wave 5
//      is NEVER projected through; only the closed-template
//      Wave 5 `candidate_title` echoes verbatim. The
//      `comparison_summary` is a Wave-6-template-generated
//      closed-style paragraph derived from closed-vocab
//      candidate fields (NEVER raw text fields like
//      assumptions/known_risks/expected_benefits are
//      concatenated into it).
export interface PlaygroundComparisonMatrixItem {
  candidate_key: string;
  candidate_type: PlaygroundCandidateType;
  candidate_title: string;
  comparison_summary: string;
  outcome_dimensions: readonly PlaygroundOutcomeDimensionRating[];
  risk_findings: readonly PlaygroundRiskFinding[];
  dependency_findings: readonly PlaygroundDependencyFinding[];
  governance_findings: readonly PlaygroundGovernanceFinding[];
  required_reviews: readonly PlaygroundRequiredReview[];
  blocked_by_policy: boolean;
  action_runtime_transition_hint: PlaygroundTransitionHint;
  confidence_label: PlaygroundConfidenceLabel;
  comparison_notes: readonly PlaygroundComparisonNote[];
  honest_note: string;
}

// WHAT: The SAFE wire shape for the TradeoffSummary per
//        ADR-0073 §1.
// INPUT: Used as a return type only.
// OUTPUT: None.
// WHY: NEVER a ranking. The lists are sets of candidate_keys
//      (not ordered by score); they help humans discriminate
//      between candidates without implying a winner per
//      ADR-0073 §1 + §7.
export interface PlaygroundTradeoffSummary {
  candidates_favoring_governance: readonly string[];
  candidates_favoring_resilience: readonly string[];
  candidates_with_blocking_signals: readonly string[];
  candidates_requiring_human_decision: readonly string[];
}

// WHAT: Body shape for POST /api/v1/playground/scenarios/:id/outcome-comparisons.
// INPUT: Used as a parameter type at the service boundary.
// OUTPUT: None.
// WHY: Minimal v1 shape per Founder paste + QLOCK 2: only
//      `candidate_types?[]`, `max_candidates?`, and
//      `comparison_mode?` are accepted. NO `candidate_keys[]`
//      (deferred per QLOCK 2). NO freeform prompt text. NO
//      caller-supplied candidate payloads. NO scoring
//      weights. NO "choose best" flag. NO "rank" flag. NO
//      "execute" flag.
export interface CompareOutcomesInput {
  candidate_types?: unknown;
  max_candidates?: unknown;
  comparison_mode?: unknown;
}

// WHAT: The unified failure code surface for the comparison
//        route.
// INPUT: Used as a return discriminator only.
// OUTPUT: None.
// WHY: Reuses PlaygroundScenarioFailureCode verbatim
//      (delegated candidate lookup surfaces SESSION_* /
//      OPERATION_NOT_PERMITTED / SCENARIO_NOT_FOUND /
//      INTERNAL_ERROR). INVALID_REQUEST also flows through for
//      body-shape violations (invalid candidate_type, invalid
//      max_candidates, invalid comparison_mode).
export type PlaygroundOutcomeComparisonFailureCode =
  PlaygroundScenarioFailureCode;

export interface PlaygroundOutcomeComparisonFailure {
  ok: false;
  code: PlaygroundOutcomeComparisonFailureCode;
  message: string;
  invalid_fields?: readonly string[];
}

export interface CompareOutcomesSuccess {
  ok: true;
  scenario_id: string;
  compared_at: string;
  comparison_mode: PlaygroundComparisonMode;
  candidate_count: number;
  comparison_matrix: readonly PlaygroundComparisonMatrixItem[];
  tradeoff_summary: PlaygroundTradeoffSummary;
  blocked_candidates_count: number;
  review_required_count: number;
  honest_note: string;
  audit_event_id: string;
}

// WHAT: ADR-0073 §11 bounded counts canonical at the
//        discipline register.
const CANDIDATES_PER_COMPARISON_MAX = 8;
const OUTCOME_DIMENSIONS_PER_ITEM_MAX = 12;
const RISK_FINDINGS_PER_ITEM_MAX = 12;
const DEPENDENCY_FINDINGS_PER_ITEM_MAX = 12;
const REQUIRED_REVIEWS_PER_ITEM_MAX = 9;
const COMPARISON_NOTES_PER_ITEM_MAX = 8;
const COMPARISON_SUMMARY_MAX_CHARS = 600;
const CANDIDATE_TITLE_MAX_CHARS = 120;

// WHAT: The canonical top-level honest_note string per
//        ADR-0073 §16.
const TOP_LEVEL_HONEST_NOTE =
  "This comparison is advisory only. It does not select a " +
  "winner, has not been executed, is not legal advice, and " +
  "requires human/governance review before any real-world " +
  "action.";

// WHAT: The canonical per-matrix-item honest_note string per
//        ADR-0073 §16.
const ITEM_HONEST_NOTE =
  "This candidate comparison is advisory only. It does not " +
  "select a winner, has not been executed, is not legal " +
  "advice, and requires human/governance review before any " +
  "real-world action.";

// WHAT: Type guard for the closed-vocab candidate_type set
//        (re-exported via the Wave 5 source-of-truth).
function isCandidateType(value: unknown): value is PlaygroundCandidateType {
  return (
    typeof value === "string" &&
    (PLAYGROUND_CANDIDATE_TYPE_VALUES as readonly string[]).includes(value)
  );
}

// WHAT: Type guard for the closed-vocab comparison_mode set.
function isComparisonMode(value: unknown): value is PlaygroundComparisonMode {
  return (
    typeof value === "string" &&
    (PLAYGROUND_COMPARISON_MODE_VALUES as readonly string[]).includes(value)
  );
}

// WHAT: Compute the SHA-256 16-char audit hash over the
//        sorted set of input candidate_keys.
// INPUT: An array of candidate_keys.
// OUTPUT: 16-character lowercase hex string.
// WHY: Per ADR-0073 §14 — audit row includes optional
//      `generated_from_candidate_keys_hash` so the comparison
//      output is reproducibility-traceable without leaking
//      individual candidate identities. Mirrors the ADR-0068
//      `card_key` + ADR-0072 §1 `candidate_key` SHA-256/16-char
//      precedent.
function computeCandidateKeysHash(keys: readonly string[]): string {
  const sorted = [...keys].sort().join(",");
  return createHash("sha256").update(sorted).digest("hex").slice(0, 16);
}

// WHAT: Helper — does a candidate have a given governance
//        finding?
function hasGovernance(
  c: PlaygroundCandidateView,
  finding: PlaygroundGovernanceFinding,
): boolean {
  return c.governance_findings.includes(finding);
}

// WHAT: DETERMINISTIC_RUBRIC mode — map candidate.candidate_type
//        + candidate closed-vocab fields → outcome_dimensions
//        ratings via a closed template library.
// INPUT: A SAFE PlaygroundCandidateView.
// OUTPUT: A closed-vocab list of outcome_dimension ratings.
// WHY: Templates are blind to scenario-specific raw JSON
//      content; only candidate closed-vocab fields and the
//      candidate_type drive ratings. Ratings are honest:
//      INSUFFICIENT_DATA fires when confidence_label =
//      INSUFFICIENT_DATA; NEVER fabricated.
function inferOutcomeDimensionsRubric(
  c: PlaygroundCandidateView,
): PlaygroundOutcomeDimensionRating[] {
  const ratings: Map<PlaygroundOutcomeDimension, PlaygroundDimensionRating> =
    new Map();

  // Default everything to INSUFFICIENT_DATA — the rubric
  // overrides where it has signal.
  for (const dim of PLAYGROUND_OUTCOME_DIMENSION_VALUES) {
    ratings.set(dim, "INSUFFICIENT_DATA");
  }

  // INSUFFICIENT_DATA candidates surface that posture
  // verbatim and do not get rubric overrides beyond
  // candidate-type-driven defaults.
  if (c.confidence_label === "INSUFFICIENT_DATA") {
    return PLAYGROUND_OUTCOME_DIMENSION_VALUES.map((d) => ({
      dimension: d,
      rating: ratings.get(d) ?? "INSUFFICIENT_DATA",
    }));
  }

  // candidate_type drives the base rating set.
  switch (c.candidate_type) {
    case "STATUS_QUO":
      ratings.set("GOVERNANCE_ALIGNMENT", "FAVORABLE");
      ratings.set("EXECUTION_COMPLEXITY", "FAVORABLE");
      ratings.set("OPERATIONAL_RISK", "FAVORABLE");
      ratings.set("COMPLIANCE_REVIEW_NEED", "FAVORABLE");
      ratings.set("HUMAN_REVIEW_NEED", "MIXED");
      ratings.set("DATA_SCOPE_READINESS", "FAVORABLE");
      ratings.set("CONNECTOR_READINESS", "NOT_APPLICABLE");
      ratings.set("CUSTOMER_OR_STAKEHOLDER_IMPACT", "MIXED");
      ratings.set("COST_SENSITIVITY", "FAVORABLE");
      ratings.set("SPEED_TO_EXECUTION", "FAVORABLE");
      ratings.set("RESILIENCE_IMPACT", "MIXED");
      ratings.set("REVERSIBILITY", "FAVORABLE");
      break;
    case "LOW_RISK_INCREMENTAL":
      ratings.set("GOVERNANCE_ALIGNMENT", "FAVORABLE");
      ratings.set("EXECUTION_COMPLEXITY", "FAVORABLE");
      ratings.set("OPERATIONAL_RISK", "FAVORABLE");
      ratings.set("REVERSIBILITY", "FAVORABLE");
      ratings.set("HUMAN_REVIEW_NEED", "MIXED");
      ratings.set("RESILIENCE_IMPACT", "MIXED");
      break;
    case "SPEED_OPTIMIZED":
      ratings.set("SPEED_TO_EXECUTION", "FAVORABLE");
      ratings.set("OPERATIONAL_RISK", "UNFAVORABLE");
      ratings.set("GOVERNANCE_ALIGNMENT", "MIXED");
      ratings.set("EXECUTION_COMPLEXITY", "MIXED");
      ratings.set("RESILIENCE_IMPACT", "UNFAVORABLE");
      break;
    case "COST_OPTIMIZED":
      ratings.set("COST_SENSITIVITY", "FAVORABLE");
      ratings.set("OPERATIONAL_RISK", "MIXED");
      ratings.set("GOVERNANCE_ALIGNMENT", "MIXED");
      break;
    case "COMPLIANCE_FIRST":
      ratings.set("GOVERNANCE_ALIGNMENT", "FAVORABLE");
      ratings.set("COMPLIANCE_REVIEW_NEED", "UNFAVORABLE");
      ratings.set("HUMAN_REVIEW_NEED", "UNFAVORABLE");
      ratings.set("SPEED_TO_EXECUTION", "UNFAVORABLE");
      ratings.set("OPERATIONAL_RISK", "FAVORABLE");
      break;
    case "CUSTOMER_IMPACT_FIRST":
      ratings.set("CUSTOMER_OR_STAKEHOLDER_IMPACT", "FAVORABLE");
      ratings.set("EXECUTION_COMPLEXITY", "MIXED");
      ratings.set("GOVERNANCE_ALIGNMENT", "MIXED");
      break;
    case "OPERATIONAL_RESILIENCE":
      ratings.set("RESILIENCE_IMPACT", "FAVORABLE");
      ratings.set("OPERATIONAL_RISK", "FAVORABLE");
      ratings.set("REVERSIBILITY", "FAVORABLE");
      ratings.set("EXECUTION_COMPLEXITY", "UNFAVORABLE");
      ratings.set("SPEED_TO_EXECUTION", "UNFAVORABLE");
      break;
    case "HUMAN_REVIEW_REQUIRED":
      ratings.set("HUMAN_REVIEW_NEED", "UNFAVORABLE");
      ratings.set("SPEED_TO_EXECUTION", "UNFAVORABLE");
      ratings.set("GOVERNANCE_ALIGNMENT", "MIXED");
      ratings.set("OPERATIONAL_RISK", "MIXED");
      break;
    case "DO_NOT_PROCEED":
      ratings.set("GOVERNANCE_ALIGNMENT", "UNFAVORABLE");
      ratings.set("OPERATIONAL_RISK", "UNFAVORABLE");
      ratings.set("SPEED_TO_EXECUTION", "NOT_APPLICABLE");
      ratings.set("EXECUTION_COMPLEXITY", "NOT_APPLICABLE");
      ratings.set("REVERSIBILITY", "NOT_APPLICABLE");
      break;
  }

  // governance_findings override specific dimensions where
  // the candidate carries an explicit signal.
  if (hasGovernance(c, "POLICY_REVIEW_REQUIRED")) {
    ratings.set("GOVERNANCE_ALIGNMENT", "MIXED");
  }
  if (hasGovernance(c, "DO_NOT_EXECUTE")) {
    ratings.set("GOVERNANCE_ALIGNMENT", "UNFAVORABLE");
  }
  if (hasGovernance(c, "CONNECTOR_UNAVAILABLE")) {
    ratings.set("CONNECTOR_READINESS", "UNFAVORABLE");
  }
  if (hasGovernance(c, "DATA_SCOPE_INSUFFICIENT")) {
    ratings.set("DATA_SCOPE_READINESS", "UNFAVORABLE");
  }
  if (hasGovernance(c, "COMPLIANCE_REVIEW_RECOMMENDED")) {
    ratings.set("COMPLIANCE_REVIEW_NEED", "UNFAVORABLE");
  }
  if (
    hasGovernance(c, "HUMAN_DECISION_REQUIRED") ||
    c.action_runtime_transition_hint === "REQUIRES_HUMAN_DECISION"
  ) {
    ratings.set("HUMAN_REVIEW_NEED", "UNFAVORABLE");
  }
  if (hasGovernance(c, "DUAL_CONTROL_REQUIRED")) {
    const current = ratings.get("EXECUTION_COMPLEXITY");
    if (current === "FAVORABLE") {
      ratings.set("EXECUTION_COMPLEXITY", "MIXED");
    } else if (current === "INSUFFICIENT_DATA") {
      ratings.set("EXECUTION_COMPLEXITY", "MIXED");
    }
  }

  // BLOCKED transition_hint forces several dimensions to
  // NOT_APPLICABLE because the candidate cannot proceed.
  if (c.action_runtime_transition_hint === "BLOCKED") {
    ratings.set("SPEED_TO_EXECUTION", "NOT_APPLICABLE");
    ratings.set("EXECUTION_COMPLEXITY", "NOT_APPLICABLE");
    ratings.set("REVERSIBILITY", "NOT_APPLICABLE");
    ratings.set("GOVERNANCE_ALIGNMENT", "UNFAVORABLE");
  }

  return PLAYGROUND_OUTCOME_DIMENSION_VALUES.map((d) => ({
    dimension: d,
    rating: ratings.get(d) ?? "INSUFFICIENT_DATA",
  })).slice(0, OUTCOME_DIMENSIONS_PER_ITEM_MAX);
}

// WHAT: CANDIDATE_FIELD_PROJECTION mode — every dimension
//        rates INSUFFICIENT_DATA (no rubric inference).
// INPUT: A SAFE PlaygroundCandidateView (unused beyond
//        shape).
// OUTPUT: A flat closed-vocab list of all 12 dimensions at
//         INSUFFICIENT_DATA.
// WHY: CANDIDATE_FIELD_PROJECTION is the minimal-projection
//      mode (Founder paste + ADR-0073 §6.1 opt-in). It
//      echoes candidate closed-vocab fields verbatim without
//      inferring outcome ratings. INSUFFICIENT_DATA is the
//      honest signal that this mode does not perform
//      inference.
function projectOutcomeDimensions(
  _c: PlaygroundCandidateView,
): PlaygroundOutcomeDimensionRating[] {
  return PLAYGROUND_OUTCOME_DIMENSION_VALUES.map((d) => ({
    dimension: d,
    rating: "INSUFFICIENT_DATA" as const,
  })).slice(0, OUTCOME_DIMENSIONS_PER_ITEM_MAX);
}

// WHAT: Derive risk_findings deterministically from
//        candidate closed-vocab fields.
function deriveRiskFindings(
  c: PlaygroundCandidateView,
): PlaygroundRiskFinding[] {
  const findings = new Set<PlaygroundRiskFinding>();
  if (
    hasGovernance(c, "POLICY_REVIEW_REQUIRED") ||
    c.action_runtime_transition_hint === "REQUIRES_POLICY_REVIEW"
  ) {
    findings.add("POLICY_RISK");
  }
  if (hasGovernance(c, "COMPLIANCE_REVIEW_RECOMMENDED")) {
    findings.add("COMPLIANCE_REVIEW_RISK");
  }
  if (hasGovernance(c, "LEGAL_REVIEW_RECOMMENDED")) {
    findings.add("LEGAL_REVIEW_RISK");
  }
  if (hasGovernance(c, "DATA_SCOPE_INSUFFICIENT")) {
    findings.add("DATA_SCOPE_RISK");
  }
  if (
    hasGovernance(c, "CONNECTOR_UNAVAILABLE") ||
    c.action_runtime_transition_hint === "REQUIRES_CONNECTOR_CAPABILITY"
  ) {
    findings.add("CONNECTOR_READINESS_RISK");
  }
  if (
    c.candidate_type === "SPEED_OPTIMIZED" ||
    c.candidate_type === "COST_OPTIMIZED" ||
    c.candidate_type === "CUSTOMER_IMPACT_FIRST" ||
    c.candidate_type === "OPERATIONAL_RESILIENCE"
  ) {
    if (c.candidate_type !== "OPERATIONAL_RESILIENCE") {
      // OPERATIONAL_RESILIENCE addresses execution complexity
      // by construction; the other three may carry it.
      findings.add("EXECUTION_COMPLEXITY_RISK");
    }
  }
  if (c.candidate_type === "CUSTOMER_IMPACT_FIRST") {
    findings.add("STAKEHOLDER_IMPACT_RISK");
  }
  if (
    hasGovernance(c, "HUMAN_DECISION_REQUIRED") ||
    c.action_runtime_transition_hint === "REQUIRES_HUMAN_DECISION"
  ) {
    findings.add("HUMAN_DECISION_REQUIRED_RISK");
  }
  if (
    c.confidence_label === "INSUFFICIENT_DATA" ||
    c.candidate_type === "HUMAN_REVIEW_REQUIRED"
  ) {
    findings.add("INSUFFICIENT_INFORMATION_RISK");
  }
  if (c.candidate_type === "SPEED_OPTIMIZED") {
    findings.add("OPERATIONAL_RESILIENCE_RISK");
  }
  return [...findings].slice(0, RISK_FINDINGS_PER_ITEM_MAX);
}

// WHAT: Derive dependency_findings deterministically.
function deriveDependencyFindings(
  c: PlaygroundCandidateView,
): PlaygroundDependencyFinding[] {
  const findings = new Set<PlaygroundDependencyFinding>();
  if (
    hasGovernance(c, "POLICY_REVIEW_REQUIRED") ||
    c.action_runtime_transition_hint === "REQUIRES_POLICY_REVIEW"
  ) {
    findings.add("REQUIRES_POLICY_REVIEW");
  }
  if (
    hasGovernance(c, "APPROVAL_REQUIRED") ||
    c.action_runtime_transition_hint === "REQUIRES_APPROVAL_CHAIN"
  ) {
    findings.add("REQUIRES_APPROVAL_CHAIN");
  }
  if (hasGovernance(c, "DUAL_CONTROL_REQUIRED")) {
    findings.add("REQUIRES_DUAL_CONTROL");
  }
  if (
    hasGovernance(c, "CONNECTOR_UNAVAILABLE") ||
    c.action_runtime_transition_hint === "REQUIRES_CONNECTOR_CAPABILITY"
  ) {
    findings.add("REQUIRES_CONNECTOR_CAPABILITY");
  }
  if (hasGovernance(c, "DATA_SCOPE_INSUFFICIENT")) {
    findings.add("REQUIRES_DATA_SCOPE_EXPANSION");
  }
  if (
    hasGovernance(c, "HUMAN_DECISION_REQUIRED") ||
    c.action_runtime_transition_hint === "REQUIRES_HUMAN_DECISION"
  ) {
    findings.add("REQUIRES_HUMAN_DECISION");
  }
  if (
    hasGovernance(c, "LEGAL_REVIEW_RECOMMENDED") ||
    hasGovernance(c, "COMPLIANCE_REVIEW_RECOMMENDED")
  ) {
    findings.add("REQUIRES_LEGAL_OR_COMPLIANCE_REVIEW");
  }
  if (
    hasGovernance(c, "ACTION_RUNTIME_REQUIRED") ||
    c.action_runtime_transition_hint === "MAY_PROPOSE_ACTION_LATER" ||
    c.action_runtime_transition_hint === "REQUIRES_APPROVAL_CHAIN"
  ) {
    findings.add("REQUIRES_ACTION_RUNTIME");
  }
  if (c.confidence_label === "INSUFFICIENT_DATA") {
    findings.add("REQUIRES_ADDITIONAL_CONTEXT");
  }
  if (findings.size === 0) {
    findings.add("NO_BLOCKING_DEPENDENCY_IDENTIFIED");
  }
  return [...findings].slice(0, DEPENDENCY_FINDINGS_PER_ITEM_MAX);
}

// WHAT: Derive required_reviews deterministically.
function deriveRequiredReviews(
  c: PlaygroundCandidateView,
): PlaygroundRequiredReview[] {
  const reviews = new Set<PlaygroundRequiredReview>();
  if (hasGovernance(c, "LEGAL_REVIEW_RECOMMENDED")) {
    reviews.add("LEGAL_REVIEW");
  }
  if (hasGovernance(c, "COMPLIANCE_REVIEW_RECOMMENDED")) {
    reviews.add("COMPLIANCE_REVIEW");
  }
  if (hasGovernance(c, "POLICY_REVIEW_REQUIRED")) {
    reviews.add("POLICY_OWNER_REVIEW");
  }
  if (
    hasGovernance(c, "HUMAN_DECISION_REQUIRED") ||
    c.action_runtime_transition_hint === "REQUIRES_HUMAN_DECISION"
  ) {
    reviews.add("HUMAN_OWNER_REVIEW");
  }
  if (hasGovernance(c, "DATA_SCOPE_INSUFFICIENT")) {
    reviews.add("DATA_GOVERNANCE_REVIEW");
  }
  if (hasGovernance(c, "CONNECTOR_UNAVAILABLE")) {
    reviews.add("CONNECTOR_ADMIN_REVIEW");
  }
  if (
    hasGovernance(c, "APPROVAL_REQUIRED") ||
    c.action_runtime_transition_hint === "REQUIRES_APPROVAL_CHAIN"
  ) {
    reviews.add("ACTION_APPROVER_REVIEW");
  }
  if (c.candidate_type === "COMPLIANCE_FIRST") {
    reviews.add("SECURITY_REVIEW");
  }
  if (reviews.size === 0) {
    reviews.add("NO_ADDITIONAL_REVIEW_IDENTIFIED");
  }
  return [...reviews].slice(0, REQUIRED_REVIEWS_PER_ITEM_MAX);
}

// WHAT: Count the number of substantive reviews on a
//        per-candidate basis (excludes the placeholder
//        NO_ADDITIONAL_REVIEW_IDENTIFIED value).
function countSubstantiveReviews(
  reviews: readonly PlaygroundRequiredReview[],
): number {
  return reviews.filter((r) => r !== "NO_ADDITIONAL_REVIEW_IDENTIFIED")
    .length;
}

// WHAT: Look up a single dimension rating from a per-candidate
//        outcome_dimensions list.
function dimensionRating(
  dims: readonly PlaygroundOutcomeDimensionRating[],
  dim: PlaygroundOutcomeDimension,
): PlaygroundDimensionRating | undefined {
  return dims.find((d) => d.dimension === dim)?.rating;
}

// WHAT: Derive comparison_notes per matrix item by comparing
//        the candidate's per-dimension ratings + review
//        burden against peer averages.
// INPUT: This candidate's matrix-item draft (before
//        comparison_notes are computed) + the full peer
//        set's review-burden + per-dimension stats.
// OUTPUT: A closed-vocab list of comparison notes.
// WHY: comparison_notes is the relative-posture surface per
//      ADR-0073 §6.2 — it surfaces "more / less than average"
//      WITHOUT implying a winner. NEVER use comparative
//      language outside this closed vocabulary.
function deriveComparisonNotes(args: {
  candidate: PlaygroundCandidateView;
  dims: readonly PlaygroundOutcomeDimensionRating[];
  required_reviews: readonly PlaygroundRequiredReview[];
  avg_review_burden: number;
}): PlaygroundComparisonNote[] {
  const notes = new Set<PlaygroundComparisonNote>();

  // Review-burden relative posture.
  const myBurden = countSubstantiveReviews(args.required_reviews);
  if (myBurden > args.avg_review_burden + 0.5) {
    notes.add("MORE_REVIEW_NEEDED_THAN_AVERAGE");
  } else if (myBurden < args.avg_review_burden - 0.5) {
    notes.add("LESS_REVIEW_NEEDED_THAN_AVERAGE");
  }

  // Operational complexity relative posture.
  const complexity = dimensionRating(args.dims, "EXECUTION_COMPLEXITY");
  if (complexity === "UNFAVORABLE") {
    notes.add("HIGHER_OPERATIONAL_COMPLEXITY");
  } else if (complexity === "FAVORABLE") {
    notes.add("LOWER_OPERATIONAL_COMPLEXITY");
  }

  // Connector readiness relative posture.
  const connector = dimensionRating(args.dims, "CONNECTOR_READINESS");
  if (connector === "FAVORABLE") {
    notes.add("HIGHER_CONNECTOR_READINESS");
  } else if (connector === "UNFAVORABLE") {
    notes.add("LOWER_CONNECTOR_READINESS");
  }

  // Reversibility relative posture.
  const reversibility = dimensionRating(args.dims, "REVERSIBILITY");
  if (reversibility === "FAVORABLE") {
    notes.add("MORE_REVERSIBLE_THAN_AVERAGE");
  } else if (reversibility === "UNFAVORABLE") {
    notes.add("LESS_REVERSIBLE_THAN_AVERAGE");
  }

  // Insufficient-data posture.
  if (args.candidate.confidence_label === "INSUFFICIENT_DATA") {
    notes.add("INSUFFICIENT_DATA_RELATIVE_TO_PEERS");
  }

  // Blocked-by-policy posture.
  if (
    args.candidate.blocked_by_policy ||
    args.candidate.action_runtime_transition_hint === "BLOCKED"
  ) {
    notes.add("BLOCKED_BY_POLICY_OR_GOVERNANCE");
  }

  // Human-decision posture.
  if (
    args.candidate.action_runtime_transition_hint === "REQUIRES_HUMAN_DECISION" ||
    args.candidate.governance_findings.includes("HUMAN_DECISION_REQUIRED")
  ) {
    notes.add("HUMAN_DECISION_REQUIRED");
  }

  if (notes.size === 0) {
    notes.add("NO_NOTABLE_RELATIVE_POSTURE");
  }

  return [...notes].slice(0, COMPARISON_NOTES_PER_ITEM_MAX);
}

// WHAT: Build a closed-style comparison_summary string from
//        closed-vocab signals only.
// INPUT: A candidate + derived metadata (governance count,
//        review count, relative-posture set).
// OUTPUT: A short closed-style paragraph ≤ COMPARISON_SUMMARY_MAX_CHARS.
// WHY: NEVER concatenate raw candidate text (assumptions /
//      expected_benefits / known_risks). The summary cites
//      candidate_type + closed-vocab counts + relative
//      posture only. Templates produce honest advisory
//      language per ADR-0073 §7.
function buildComparisonSummary(args: {
  candidate: PlaygroundCandidateView;
  governance_count: number;
  review_count: number;
  notes: readonly PlaygroundComparisonNote[];
}): string {
  const noteFragment = args.notes.includes("BLOCKED_BY_POLICY_OR_GOVERNANCE")
    ? "this candidate is blocked by policy or governance"
    : args.notes.includes("MORE_REVIEW_NEEDED_THAN_AVERAGE")
      ? "more review is needed before action than for peer candidates"
      : args.notes.includes("LESS_REVIEW_NEEDED_THAN_AVERAGE")
        ? "less review is needed than for peer candidates"
        : args.notes.includes("INSUFFICIENT_DATA_RELATIVE_TO_PEERS")
          ? "insufficient data relative to peers"
          : "relative posture is not notable";
  const summary =
    `This ${args.candidate.candidate_type} candidate has ` +
    `${args.governance_count} governance finding(s) and ` +
    `${args.review_count} required review(s). Compared to ` +
    `peers, ${noteFragment}. Comparison is advisory; not a ` +
    `winner; not legal advice.`;
  return summary.slice(0, COMPARISON_SUMMARY_MAX_CHARS);
}

// WHAT: Build the canonical TradeoffSummary from the full
//        comparison matrix per ADR-0073 §1.
// INPUT: The full matrix (per-item ratings already computed).
// OUTPUT: A SAFE PlaygroundTradeoffSummary with 4
//         closed-vocab candidate_key sets (NEVER a ranking).
// WHY: The 4 sets help humans discriminate between candidates
//      without implying a winner. They are SETS, not ordered
//      lists, so callers cannot misread them as ranking.
function buildTradeoffSummary(
  items: readonly PlaygroundComparisonMatrixItem[],
): PlaygroundTradeoffSummary {
  const favoringGovernance: string[] = [];
  const favoringResilience: string[] = [];
  const blocking: string[] = [];
  const humanDecision: string[] = [];

  for (const item of items) {
    const govRating = dimensionRating(
      item.outcome_dimensions,
      "GOVERNANCE_ALIGNMENT",
    );
    const resRating = dimensionRating(
      item.outcome_dimensions,
      "RESILIENCE_IMPACT",
    );

    if (
      govRating === "FAVORABLE" &&
      !item.blocked_by_policy &&
      item.action_runtime_transition_hint !== "BLOCKED"
    ) {
      favoringGovernance.push(item.candidate_key);
    }
    if (
      item.candidate_type === "OPERATIONAL_RESILIENCE" ||
      resRating === "FAVORABLE"
    ) {
      favoringResilience.push(item.candidate_key);
    }
    if (
      item.blocked_by_policy ||
      item.action_runtime_transition_hint === "BLOCKED"
    ) {
      blocking.push(item.candidate_key);
    }
    if (
      item.action_runtime_transition_hint === "REQUIRES_HUMAN_DECISION" ||
      item.required_reviews.includes("HUMAN_OWNER_REVIEW") ||
      item.required_reviews.includes("POLICY_OWNER_REVIEW") ||
      item.required_reviews.includes("LEGAL_REVIEW") ||
      item.required_reviews.includes("COMPLIANCE_REVIEW")
    ) {
      humanDecision.push(item.candidate_key);
    }
  }

  return {
    candidates_favoring_governance: favoringGovernance,
    candidates_favoring_resilience: favoringResilience,
    candidates_with_blocking_signals: blocking,
    candidates_requiring_human_decision: humanDecision,
  };
}

// WHAT: The Agent Playground Wave 6 Option A deterministic
//        outcome-comparison service.
// INPUT: PlaygroundCandidateService (for internal Wave 5
//        candidate generation).
// OUTPUT: A single method `compareOutcomes`.
// WHY: Single class so future Wave 7 best-path recommender
//      services can compose against a stable interface. The
//      service enforces: (1) auth + owner-first + same-org
//      via the Wave 5 candidate-service delegation;
//      (2) closed-vocab body validation; (3) deterministic
//      rubric inference from the static template library;
//      (4) safe-metadata-only audit emission; (5) NO winner
//      selection; (6) NO numeric scoring. NO persistence, NO
//      LLM, NO connector invocation, NO Action creation, NO
//      external provider call.
export class PlaygroundOutcomeComparisonService {
  constructor(
    private readonly candidates: PlaygroundCandidateService,
    private readonly scenarios: PlaygroundScenarioService,
  ) {}

  // WHAT: Compare the candidate set for a stored scenario
  //        per ADR-0073.
  // INPUT: Session token + scenario_id + optional body
  //        ({ candidate_types?, max_candidates?,
  //        comparison_mode? }) + context (ip_address for
  //        audit attribution).
  // OUTPUT: CompareOutcomesSuccess |
  //         PlaygroundOutcomeComparisonFailure.
  // WHY: Computed-on-read pipeline:
  //      1. Body validation (closed-vocab candidate_types[],
  //         positive-integer max_candidates ≤ ADR-0073 §11
  //         cap, closed-vocab comparison_mode).
  //      2. Internally invoke
  //         PlaygroundCandidateService.generateCandidates
  //         (which delegates to PlaygroundScenarioService.
  //         getScenario for the owner-first + same-org
  //         SCENARIO_NOT_FOUND enforcement). NEVER accept
  //         caller-supplied candidate payloads per ADR-0073
  //         §10.
  //      3. Apply the closed-vocab rubric library to each
  //         candidate (DETERMINISTIC_RUBRIC mode) OR project
  //         candidate fields verbatim (CANDIDATE_FIELD_PROJECTION
  //         mode).
  //      4. Compute relative-posture comparison_notes against
  //         peer averages.
  //      5. Build the TradeoffSummary (4 closed-vocab
  //         candidate_key sets — NEVER a ranking).
  //      6. Emit ADMIN_ACTION + details.action=
  //         "PLAYGROUND_OUTCOMES_COMPARED" with safe metadata
  //         only.
  //      7. Return SAFE CompareOutcomesSuccess projection.
  //         NEVER mutates the scenario; never persists
  //         comparison output (computed-on-read).
  async compareOutcomes(
    sessionToken: string,
    scenarioId: string,
    body: CompareOutcomesInput,
    context: { ip_address?: string | null } = {},
  ): Promise<CompareOutcomesSuccess | PlaygroundOutcomeComparisonFailure> {
    // 1. Body validation — closed-vocab + bounded counts.
    const invalidFields: string[] = [];

    let requestedTypes: readonly PlaygroundCandidateType[] | undefined =
      undefined;
    if (body.candidate_types !== undefined) {
      if (!Array.isArray(body.candidate_types)) {
        invalidFields.push("candidate_types");
      } else {
        const collected: PlaygroundCandidateType[] = [];
        for (const raw of body.candidate_types) {
          if (!isCandidateType(raw)) {
            invalidFields.push("candidate_types");
            break;
          }
          if (!collected.includes(raw)) {
            collected.push(raw);
          }
        }
        if (!invalidFields.includes("candidate_types")) {
          requestedTypes = collected;
        }
      }
    }

    let requestedMax: number | undefined = undefined;
    if (body.max_candidates !== undefined) {
      const raw = body.max_candidates;
      if (
        typeof raw !== "number" ||
        !Number.isFinite(raw) ||
        !Number.isInteger(raw) ||
        raw <= 0 ||
        raw > CANDIDATES_PER_COMPARISON_MAX
      ) {
        invalidFields.push("max_candidates");
      } else {
        requestedMax = raw;
      }
    }

    let comparisonMode: PlaygroundComparisonMode = "DETERMINISTIC_RUBRIC";
    if (body.comparison_mode !== undefined) {
      if (!isComparisonMode(body.comparison_mode)) {
        invalidFields.push("comparison_mode");
      } else {
        comparisonMode = body.comparison_mode;
      }
    }

    if (invalidFields.length > 0) {
      return {
        ok: false,
        code: "INVALID_REQUEST",
        message: "One or more body fields are invalid",
        invalid_fields: invalidFields,
      };
    }

    // 2. Internally invoke the Wave 5 candidate service.
    //    SCENARIO_NOT_FOUND / SESSION_* / INVALID_REQUEST /
    //    INTERNAL_ERROR all flow through verbatim. NEVER
    //    accept caller-supplied candidate payloads per
    //    ADR-0073 §10.
    const candidateBody: {
      candidate_types?: readonly PlaygroundCandidateType[];
      max_candidates?: number;
    } = {};
    if (requestedTypes !== undefined) {
      candidateBody.candidate_types = requestedTypes;
    }
    if (requestedMax !== undefined) {
      candidateBody.max_candidates = requestedMax;
    }
    const candidatesResult = await this.candidates.generateCandidates(
      sessionToken,
      scenarioId,
      candidateBody,
      { ip_address: context.ip_address ?? null },
    );
    if (candidatesResult.ok === false) {
      return candidatesResult;
    }

    const candidateList = candidatesResult.candidates.slice(
      0,
      CANDIDATES_PER_COMPARISON_MAX,
    );

    // 3. Compute per-candidate ratings + review burden
    //    (mode-dependent).
    const perItemRatings = candidateList.map((c) =>
      comparisonMode === "DETERMINISTIC_RUBRIC"
        ? inferOutcomeDimensionsRubric(c)
        : projectOutcomeDimensions(c),
    );
    const perItemRiskFindings = candidateList.map((c) =>
      comparisonMode === "DETERMINISTIC_RUBRIC"
        ? deriveRiskFindings(c)
        : ([] as PlaygroundRiskFinding[]),
    );
    const perItemDependencyFindings = candidateList.map((c) =>
      comparisonMode === "DETERMINISTIC_RUBRIC"
        ? deriveDependencyFindings(c)
        : ([
            "NO_BLOCKING_DEPENDENCY_IDENTIFIED",
          ] as PlaygroundDependencyFinding[]),
    );
    const perItemRequiredReviews = candidateList.map((c) =>
      comparisonMode === "DETERMINISTIC_RUBRIC"
        ? deriveRequiredReviews(c)
        : ([
            "NO_ADDITIONAL_REVIEW_IDENTIFIED",
          ] as PlaygroundRequiredReview[]),
    );

    // 4. Average review burden across the peer set (used by
    //    deriveComparisonNotes for relative posture).
    const reviewBurdens = perItemRequiredReviews.map(countSubstantiveReviews);
    const avgReviewBurden =
      reviewBurdens.length > 0
        ? reviewBurdens.reduce((a, b) => a + b, 0) / reviewBurdens.length
        : 0;

    // 5. Build per-item matrix entries.
    const matrix: PlaygroundComparisonMatrixItem[] = candidateList.map(
      (c, i) => {
        const dims = perItemRatings[i] ?? [];
        const risks = perItemRiskFindings[i] ?? [];
        const deps = perItemDependencyFindings[i] ?? [];
        const reviews = perItemRequiredReviews[i] ?? [];
        const notes = deriveComparisonNotes({
          candidate: c,
          dims,
          required_reviews: reviews,
          avg_review_burden: avgReviewBurden,
        });
        const governanceCount = c.governance_findings.length;
        const reviewCount = countSubstantiveReviews(reviews);
        const summary = buildComparisonSummary({
          candidate: c,
          governance_count: governanceCount,
          review_count: reviewCount,
          notes,
        });
        return {
          candidate_key: c.candidate_key,
          candidate_type: c.candidate_type,
          candidate_title: c.candidate_title.slice(
            0,
            CANDIDATE_TITLE_MAX_CHARS,
          ),
          comparison_summary: summary,
          outcome_dimensions: dims,
          risk_findings: risks,
          dependency_findings: deps,
          governance_findings: c.governance_findings,
          required_reviews: reviews,
          blocked_by_policy: c.blocked_by_policy,
          action_runtime_transition_hint: c.action_runtime_transition_hint,
          confidence_label: c.confidence_label,
          comparison_notes: notes,
          honest_note: ITEM_HONEST_NOTE,
        };
      },
    );

    // 6. TradeoffSummary (4 closed-vocab candidate_key sets;
    //    NEVER a ranking).
    const tradeoffSummary = buildTradeoffSummary(matrix);

    // 7. Top-level counts for audit metadata + response.
    const blockedCount = matrix.filter((m) => m.blocked_by_policy).length;
    const reviewRequiredCount = matrix.filter(
      (m) => countSubstantiveReviews(m.required_reviews) > 0,
    ).length;

    // 8. Compute candidate_keys hash for audit metadata
    //    (reproducibility-traceable; never leaks individual
    //    candidate identities per ADR-0073 §14).
    const candidateKeysHash = computeCandidateKeysHash(
      matrix.map((m) => m.candidate_key),
    );

    // 9. Look up scenario owner for audit attribution. The
    //    Wave 5 service already validated the session +
    //    enforced owner-first; this second getScenario is a
    //    fast indexed lookup that lets the Wave 6 audit row
    //    carry the canonical Section 5 actor attribution
    //    (mirrors Wave 4/5 audit patterns; matches the
    //    substrate-honest discipline of every Section 5
    //    audit row carrying owner_entity_id).
    const scenarioLookup = await this.scenarios.getScenario(
      sessionToken,
      candidatesResult.scenario_id,
    );
    if (scenarioLookup.ok === false) {
      // Should not occur — the Wave 5 generateCandidates
      // call just succeeded for the same caller + scenario.
      // Return the failure verbatim if the substrate state
      // shifted between the two calls (e.g., session was
      // invalidated mid-request).
      return scenarioLookup;
    }
    const ownerEntityId = scenarioLookup.scenario.owner_entity_id;

    // 10. Emit audit. Safe metadata only — NEVER raw
    //     comparison text / candidate text / scenario JSON /
    //     legal-compliance conclusions / scores.
    const audit = await writeAuditEvent({
      event_type: "ADMIN_ACTION",
      outcome: "SUCCESS",
      actor_entity_id: ownerEntityId,
      target_entity_id: ownerEntityId,
      ip_address: context.ip_address ?? null,
      details: {
        action: "PLAYGROUND_OUTCOMES_COMPARED",
        scenario_id: candidatesResult.scenario_id,
        candidate_count: matrix.length,
        comparison_mode: comparisonMode,
        blocked_candidates_count: blockedCount,
        review_required_count: reviewRequiredCount,
        generated_from_candidate_keys_hash: candidateKeysHash,
      },
    });

    // 11. Return SAFE projection. Scenario is NEVER mutated;
    //     no comparison rows created (computed-on-read).
    return {
      ok: true,
      scenario_id: candidatesResult.scenario_id,
      compared_at: new Date().toISOString(),
      comparison_mode: comparisonMode,
      candidate_count: matrix.length,
      comparison_matrix: matrix,
      tradeoff_summary: tradeoffSummary,
      blocked_candidates_count: blockedCount,
      review_required_count: reviewRequiredCount,
      honest_note: TOP_LEVEL_HONEST_NOTE,
      audit_event_id: audit.audit_id,
    };
  }
}
