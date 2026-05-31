// FILE: playground-best-path-recommendation.service.ts
// PURPOSE: Section 5 Wave 7 Option A — Agent Playground
//          deterministic / template-first best-path
//          recommendation service per ADR-0074. Projects N
//          Wave 6 ComparisonMatrixItems into ONE advisory
//          recommended candidate + reasons + evidence +
//          governance findings + required reviews + transition
//          readiness, WITHOUT selecting a winner that bypasses
//          human review, fabricating probabilistic claims,
//          producing employee scoring, producing legal
//          conclusions, or producing autonomous decisions.
//
//          Computed-on-read; NO persistence (Founder QLOCK 1);
//          NO new Prisma model; NO schema migration; NO new
//          audit literal; NO LLM / model calls; NO Python; NO
//          BEAM; NO Action creation; NO connector invocation;
//          NO external provider call; NO Control Tower
//          frontend; NO governed-transition implementation
//          (Wave 8 forward-substrate); NO multi-agent
//          simulation runtime (Wave 9 forward-substrate); NO
//          numeric ranking; NO score / rank / winner /
//          probability / roi / recommendation field names.
//
//          NO `candidate_keys[]` in v1 request body per
//          Founder QLOCK 2 (inherits Wave 6 deferral). v1
//          accepts only `candidate_types?[]` +
//          `max_candidates?` + `comparison_mode?` +
//          `recommendation_mode?`.
//
//          Owner-first + same-org SCENARIO_NOT_FOUND
//          enumeration-safe gate is inherited verbatim via
//          PlaygroundOutcomeComparisonService.compareOutcomes
//          delegation (which itself delegates to Wave 5
//          PlaygroundCandidateService.generateCandidates →
//          PlaygroundScenarioService.getScenario); cross-
//          owner / cross-org / unknown id all fold to 404
//          without re-implementation per ADR-0074 §18 + RULE
//          0 + ADR-0065 §12 universal.
//
//          The "Wave 7 calls Wave 6 internally" canonical
//          decision at ADR-0074 §10 is enforced by
//          construction: the service NEVER accepts caller-
//          supplied comparison or candidate payloads; the
//          only inputs are (a) optional `candidate_types[]`
//          closed-vocab filter passed through to the internal
//          compareOutcomes call, (b) optional
//          `max_candidates` (capped at ADR-0074 §11), (c)
//          optional `comparison_mode` passed through to
//          Wave 6, and (d) optional `recommendation_mode`
//          (closed-vocab; default DETERMINISTIC_POLICY_FIRST).
//
//          Audit emission uses the canonical ADMIN_ACTION +
//          details.action discriminator pattern per ADR-0074
//          §14 with `details.action =
//          "PLAYGROUND_BEST_PATH_RECOMMENDED"`; ZERO new
//          audit literal. Safe metadata only — NEVER raw
//          recommendation text, NEVER raw comparison text,
//          NEVER raw candidate text, NEVER raw scenario JSON,
//          NEVER legal/compliance conclusions, NEVER scores.
// CONNECTS TO:
//   - apps/api/src/services/playground/playground-outcome-comparison.service.ts
//     (Wave 6 outcome comparison — internally invoked)
//   - apps/api/src/services/playground/playground-scenario.service.ts
//     (for owner attribution on the Wave 7 audit row;
//     mirrors the Wave 6 audit-attribution pattern)
//   - packages/database/src/queries/audit.ts (writeAuditEvent
//     — ADMIN_ACTION + details.action =
//     "PLAYGROUND_BEST_PATH_RECOMMENDED")
//   - ADR-0074 Section 5 Wave 7 Best-Path Recommendation
//     Contract (full sub-decision lineage at §1-§23)
//   - ADR-0073 Section 5 Wave 6 Outcome-Comparison Contract
//     (input source verbatim)
//   - ADR-0072 Section 5 Wave 5 Candidate-Generation
//     Contract (input source transitively via Wave 6)
//   - ADR-0065 §7 Wave 7 forward-queue line (closed at
//     contract register by ADR-0074; this service is the
//     Option A implementation surface)
//   - ADR-0070 §9 legal-advice boundary (inherited verbatim;
//     forbidden copy enforced by closed-vocab templates +
//     extended for Wave 7 to forbid "final decision" /
//     "the system decided" / "ranked #1" / "AI approved")

import { writeAuditEvent } from "@niov/database";
import type {
  PlaygroundOutcomeComparisonService,
  PlaygroundComparisonMatrixItem,
  PlaygroundComparisonMode,
  PlaygroundOutcomeDimension,
  PlaygroundDimensionRating,
  PlaygroundRiskFinding,
  PlaygroundDependencyFinding,
  PlaygroundRequiredReview,
  CompareOutcomesSuccess,
} from "./playground-outcome-comparison.service.js";
import {
  PLAYGROUND_CANDIDATE_TYPE_VALUES,
  type PlaygroundCandidateType,
  type PlaygroundGovernanceFinding,
  type PlaygroundConfidenceLabel,
  type PlaygroundTransitionHint,
} from "./playground-candidate.service.js";
import type {
  PlaygroundScenarioFailureCode,
  PlaygroundScenarioService,
} from "./playground-scenario.service.js";

// WHAT: Closed-vocabulary recommendation_mode set per
//        ADR-0074 §6.
// INPUT: Used as a constant + a type-narrowing source.
// OUTPUT: A readonly tuple of the 4 valid recommendation modes.
// WHY: ADR-0074 §6 locks the 4 values. Adding a new value
//      requires a future Founder-authorized ADR amendment.
export const PLAYGROUND_RECOMMENDATION_MODE_VALUES = [
  "DETERMINISTIC_POLICY_FIRST",
  "DETERMINISTIC_GOVERNANCE_FIRST",
  "DETERMINISTIC_RESILIENCE_FIRST",
  "DETERMINISTIC_HUMAN_REVIEW_FIRST",
] as const;
export type PlaygroundRecommendationMode =
  (typeof PLAYGROUND_RECOMMENDATION_MODE_VALUES)[number];

// WHAT: Closed-vocabulary recommendation_reasons set per
//        ADR-0074 §3.
export const PLAYGROUND_RECOMMENDATION_REASON_VALUES = [
  "FEWEST_BLOCKING_FINDINGS",
  "STRONGEST_GOVERNANCE_ALIGNMENT",
  "LOWEST_REVIEW_BURDEN",
  "STRONGEST_RESILIENCE_POSTURE",
  "LOWEST_EXECUTION_COMPLEXITY",
  "HIGHEST_DATA_SCOPE_READINESS",
  "HIGHEST_CONNECTOR_READINESS",
  "CLEAREST_HUMAN_REVIEW_PATH",
  "SAFEST_INCREMENTAL_PATH",
  "DO_NOT_PROCEED_SELECTED_FOR_SAFETY",
  "INSUFFICIENT_DATA_RECOMMENDS_HUMAN_REVIEW",
] as const;
export type PlaygroundRecommendationReason =
  (typeof PLAYGROUND_RECOMMENDATION_REASON_VALUES)[number];

// WHAT: Closed-vocabulary action_transition_readiness set
//        per ADR-0074 §4.
export const PLAYGROUND_ACTION_TRANSITION_READINESS_VALUES = [
  "NOT_READY",
  "MAY_PROPOSE_ACTION_LATER",
  "REQUIRES_HUMAN_DECISION",
  "REQUIRES_POLICY_REVIEW",
  "REQUIRES_APPROVAL_CHAIN",
  "REQUIRES_LEGAL_OR_COMPLIANCE_REVIEW",
  "REQUIRES_CONNECTOR_CAPABILITY",
  "BLOCKED",
] as const;
export type PlaygroundActionTransitionReadiness =
  (typeof PLAYGROUND_ACTION_TRANSITION_READINESS_VALUES)[number];

// WHAT: Closed-vocabulary reason_not_recommended set per
//        ADR-0074 §5.
export const PLAYGROUND_REASON_NOT_RECOMMENDED_VALUES = [
  "MORE_BLOCKING_FINDINGS",
  "MORE_REQUIRED_REVIEWS",
  "LOWER_GOVERNANCE_ALIGNMENT",
  "HIGHER_OPERATIONAL_RISK",
  "LOWER_DATA_SCOPE_READINESS",
  "LOWER_CONNECTOR_READINESS",
  "LESS_RESILIENT",
  "LESS_REVERSIBLE",
  "INSUFFICIENT_DATA",
  "NOT_SELECTED_THIS_ROUND",
] as const;
export type PlaygroundReasonNotRecommended =
  (typeof PLAYGROUND_REASON_NOT_RECOMMENDED_VALUES)[number];

// WHAT: The SAFE wire shape for an AlternativeConsidered
//        item per ADR-0074 §1 (6 canonical fields).
export interface PlaygroundAlternativeConsidered {
  candidate_key: string;
  candidate_type: PlaygroundCandidateType;
  candidate_title: string;
  reason_not_recommended: PlaygroundReasonNotRecommended;
  blocking_findings: readonly (
    | PlaygroundRiskFinding
    | PlaygroundDependencyFinding
  )[];
  review_findings: readonly PlaygroundRequiredReview[];
  confidence_label: PlaygroundConfidenceLabel;
}

// WHAT: Body shape for POST
//        /api/v1/playground/scenarios/:id/best-path-recommendations.
// INPUT: Used as a parameter type at the service boundary.
// OUTPUT: None.
// WHY: Minimal v1 shape per Founder paste + QLOCK 2: only
//      `candidate_types?[]`, `max_candidates?`,
//      `comparison_mode?`, `recommendation_mode?` are
//      accepted. NO `candidate_keys[]` (deferred per Wave 6
//      Founder QLOCK 2 inherited verbatim). NO freeform
//      prompt text. NO caller-supplied comparison or
//      candidate payloads. NO scoring weights. NO "choose
//      best" flag. NO "execute" flag. NO "create_action"
//      flag.
export interface RecommendBestPathInput {
  candidate_types?: unknown;
  max_candidates?: unknown;
  comparison_mode?: unknown;
  recommendation_mode?: unknown;
}

// WHAT: The unified failure code surface for the
//        recommendation route.
// INPUT: Used as a return discriminator only.
// OUTPUT: None.
// WHY: Reuses PlaygroundScenarioFailureCode verbatim
//      (delegated Wave 6 surface returns SESSION_* /
//      OPERATION_NOT_PERMITTED / SCENARIO_NOT_FOUND /
//      INTERNAL_ERROR). INVALID_REQUEST flows through for
//      body-shape violations.
export type PlaygroundBestPathRecommendationFailureCode =
  PlaygroundScenarioFailureCode;

export interface PlaygroundBestPathRecommendationFailure {
  ok: false;
  code: PlaygroundBestPathRecommendationFailureCode;
  message: string;
  invalid_fields?: readonly string[];
}

export interface RecommendBestPathSuccess {
  ok: true;
  scenario_id: string;
  recommended_at: string;
  recommendation_mode: PlaygroundRecommendationMode;
  recommended_candidate_key: string;
  recommended_candidate_type: PlaygroundCandidateType;
  recommended_candidate_title: string;
  recommendation_summary: string;
  recommendation_reasons: readonly PlaygroundRecommendationReason[];
  evidence_refs: readonly string[];
  governance_findings: readonly PlaygroundGovernanceFinding[];
  required_reviews: readonly PlaygroundRequiredReview[];
  risk_findings: readonly PlaygroundRiskFinding[];
  dependency_findings: readonly PlaygroundDependencyFinding[];
  blocked_by_policy: boolean;
  action_runtime_transition_hint: PlaygroundTransitionHint;
  action_transition_readiness: PlaygroundActionTransitionReadiness;
  alternatives_considered: readonly PlaygroundAlternativeConsidered[];
  not_recommended_reasons: readonly PlaygroundReasonNotRecommended[];
  confidence_label: PlaygroundConfidenceLabel;
  human_decision_required: boolean;
  honest_note: string;
  audit_event_id: string;
}

// WHAT: ADR-0074 §11 bounded counts canonical at the
//        discipline register.
const CANDIDATES_CONSIDERED_MAX = 8;
const RECOMMENDATION_REASONS_MAX = 6;
const EVIDENCE_REFS_MAX = 16;
const GOVERNANCE_FINDINGS_MAX = 11;
const REQUIRED_REVIEWS_MAX = 9;
const RISK_FINDINGS_MAX = 12;
const DEPENDENCY_FINDINGS_MAX = 12;
const ALTERNATIVES_CONSIDERED_MAX = 7;
const NOT_RECOMMENDED_REASONS_MAX = 6;
const RECOMMENDATION_SUMMARY_MAX_CHARS = 600;
const RECOMMENDED_CANDIDATE_TITLE_MAX_CHARS = 120;
const BLOCKING_FINDINGS_PER_ALTERNATIVE_MAX = 8;
const REVIEW_FINDINGS_PER_ALTERNATIVE_MAX = 6;

// WHAT: The canonical honest_note per ADR-0074 §16.
const HONEST_NOTE =
  "This recommendation is advisory only. It is not a final " +
  "decision, has not been executed, is not legal advice, and " +
  "requires human/governance review before any real-world " +
  "action.";

// WHAT: Type guard for the closed-vocab candidate_type set.
function isCandidateType(value: unknown): value is PlaygroundCandidateType {
  return (
    typeof value === "string" &&
    (PLAYGROUND_CANDIDATE_TYPE_VALUES as readonly string[]).includes(value)
  );
}

// WHAT: Type guard for the closed-vocab comparison_mode set.
function isComparisonMode(value: unknown): value is PlaygroundComparisonMode {
  if (typeof value !== "string") return false;
  return value === "DETERMINISTIC_RUBRIC" ||
    value === "CANDIDATE_FIELD_PROJECTION";
}

// WHAT: Type guard for the closed-vocab recommendation_mode
//        set.
function isRecommendationMode(
  value: unknown,
): value is PlaygroundRecommendationMode {
  return (
    typeof value === "string" &&
    (PLAYGROUND_RECOMMENDATION_MODE_VALUES as readonly string[]).includes(
      value,
    )
  );
}

// WHAT: Helper — lookup a single dimension rating from a
//        matrix item's outcome_dimensions list.
function dimensionRating(
  item: PlaygroundComparisonMatrixItem,
  dim: PlaygroundOutcomeDimension,
): PlaygroundDimensionRating | undefined {
  return item.outcome_dimensions.find((d) => d.dimension === dim)?.rating;
}

// WHAT: Helper — count substantive required_reviews on a
//        matrix item (excludes NO_ADDITIONAL_REVIEW_IDENTIFIED).
function countSubstantiveReviews(
  item: PlaygroundComparisonMatrixItem,
): number {
  return item.required_reviews.filter(
    (r) => r !== "NO_ADDITIONAL_REVIEW_IDENTIFIED",
  ).length;
}

// WHAT: Helper — is the matrix item blocked (policy or hint)?
function isBlocked(item: PlaygroundComparisonMatrixItem): boolean {
  return (
    item.blocked_by_policy ||
    item.action_runtime_transition_hint === "BLOCKED"
  );
}

// WHAT: Helper — does the matrix item have any legal /
//        compliance required-review?
function hasLegalOrComplianceReview(
  item: PlaygroundComparisonMatrixItem,
): boolean {
  return (
    item.required_reviews.includes("LEGAL_REVIEW") ||
    item.required_reviews.includes("COMPLIANCE_REVIEW")
  );
}

// WHAT: A filter gate — takes the surviving-set, returns the
//        subset that satisfies the gate's criterion. If the
//        gate's filtered subset is empty, the original
//        surviving set is returned (the gate "skips") so the
//        priority ladder continues with the previous-step
//        survivors.
type GateFn = (
  items: PlaygroundComparisonMatrixItem[],
) => PlaygroundComparisonMatrixItem[];

// WHAT: Gate — prefer candidates with FAVORABLE
//        GOVERNANCE_ALIGNMENT; fall back to MIXED when no
//        FAVORABLE candidate exists.
const gateStrongestGovernanceAlignment: GateFn = (items) => {
  const favorable = items.filter(
    (i) => dimensionRating(i, "GOVERNANCE_ALIGNMENT") === "FAVORABLE",
  );
  if (favorable.length > 0) return favorable;
  const mixed = items.filter(
    (i) => dimensionRating(i, "GOVERNANCE_ALIGNMENT") === "MIXED",
  );
  if (mixed.length > 0) return mixed;
  return items;
};

// WHAT: Gate — prefer candidates with the fewest substantive
//        required_reviews.
const gateLowestReviewBurden: GateFn = (items) => {
  if (items.length === 0) return items;
  const min = Math.min(...items.map((i) => countSubstantiveReviews(i)));
  return items.filter((i) => countSubstantiveReviews(i) === min);
};

// WHAT: Gate — prefer candidates without LEGAL_REVIEW or
//        COMPLIANCE_REVIEW in required_reviews.
const gateLowestLegalComplianceReviewNeed: GateFn = (items) => {
  const clean = items.filter((i) => !hasLegalOrComplianceReview(i));
  return clean.length > 0 ? clean : items;
};

// WHAT: Gate — prefer candidates with FAVORABLE
//        EXECUTION_COMPLEXITY.
const gateLowestExecutionComplexity: GateFn = (items) => {
  const fav = items.filter(
    (i) => dimensionRating(i, "EXECUTION_COMPLEXITY") === "FAVORABLE",
  );
  return fav.length > 0 ? fav : items;
};

// WHAT: Gate — prefer candidates with FAVORABLE
//        RESILIENCE_IMPACT and REVERSIBILITY.
const gateStrongestResilience: GateFn = (items) => {
  const both = items.filter(
    (i) =>
      dimensionRating(i, "RESILIENCE_IMPACT") === "FAVORABLE" &&
      dimensionRating(i, "REVERSIBILITY") === "FAVORABLE",
  );
  if (both.length > 0) return both;
  const either = items.filter(
    (i) =>
      dimensionRating(i, "RESILIENCE_IMPACT") === "FAVORABLE" ||
      dimensionRating(i, "REVERSIBILITY") === "FAVORABLE",
  );
  return either.length > 0 ? either : items;
};

// WHAT: Gate — safety-bias incremental over speed when
//        signals are mixed.
const gateSafetyBiasIncremental: GateFn = (items) => {
  const hasIncremental = items.some(
    (i) => i.candidate_type === "LOW_RISK_INCREMENTAL",
  );
  const hasSpeed = items.some((i) => i.candidate_type === "SPEED_OPTIMIZED");
  if (hasIncremental && hasSpeed) {
    return items.filter((i) => i.candidate_type === "LOW_RISK_INCREMENTAL");
  }
  return items;
};

// WHAT: Gate — compliance-bias when legal/compliance review
//        signals are present anywhere in the matrix.
const gateComplianceBias: GateFn = (items) => {
  const anyLegalCompliance = items.some(
    (i) =>
      i.governance_findings.includes("LEGAL_REVIEW_RECOMMENDED") ||
      i.governance_findings.includes("COMPLIANCE_REVIEW_RECOMMENDED"),
  );
  if (!anyLegalCompliance) return items;
  const compliance = items.filter(
    (i) => i.candidate_type === "COMPLIANCE_FIRST",
  );
  return compliance.length > 0 ? compliance : items;
};

// WHAT: Gate — when the dominant signal is INSUFFICIENT_DATA
//        across the majority of items, prefer
//        HUMAN_REVIEW_REQUIRED.
const gateInsufficientDataBias: GateFn = (items) => {
  if (items.length === 0) return items;
  const insufficient = items.filter(
    (i) => i.confidence_label === "INSUFFICIENT_DATA",
  );
  if (insufficient.length * 2 < items.length) {
    // Not dominant — gate skips.
    return items;
  }
  const humanReview = items.filter(
    (i) => i.candidate_type === "HUMAN_REVIEW_REQUIRED",
  );
  return humanReview.length > 0 ? humanReview : items;
};

// WHAT: Deterministic tie-breaker — sort candidates by
//        candidate_key lexical ASC and take the first.
function tieBreakByKeyAsc(
  items: PlaygroundComparisonMatrixItem[],
): PlaygroundComparisonMatrixItem {
  const sorted = [...items].sort((a, b) =>
    a.candidate_key < b.candidate_key
      ? -1
      : a.candidate_key > b.candidate_key
        ? 1
        : 0,
  );
  const winner = sorted[0];
  if (winner === undefined) {
    throw new Error("PlaygroundBestPathRecommendationService: empty matrix");
  }
  return winner;
}

// WHAT: Apply a single gate to surviving candidates; if the
//        gate produces exactly one survivor, that's the
//        winner; otherwise the surviving set is replaced
//        with the gate's filtered set and the ladder
//        continues.
function applyGate(
  surviving: PlaygroundComparisonMatrixItem[],
  gate: GateFn,
): { winner?: PlaygroundComparisonMatrixItem; remaining: PlaygroundComparisonMatrixItem[]; gateFired: boolean } {
  const filtered = gate(surviving);
  if (filtered.length === 1) {
    return { winner: filtered[0], remaining: filtered, gateFired: true };
  }
  // Gate either tied or skipped (returned full surviving set).
  // Detect whether the gate actually filtered something (so
  // its reason can be attached).
  const gateFired = filtered.length < surviving.length && filtered.length > 0;
  return {
    remaining: filtered.length > 0 ? filtered : surviving,
    gateFired,
  };
}

// WHAT: Compute the ordered gate sequence per recommendation_mode
//        (ADR-0074 §6). Gates 1, 2, 10, 11 are preserved
//        verbatim across all modes; gates 3-9 vary.
function gateSequenceFor(mode: PlaygroundRecommendationMode): Array<{
  gate: GateFn;
  reason: PlaygroundRecommendationReason;
}> {
  const policyOrder = [
    {
      gate: gateStrongestGovernanceAlignment,
      reason: "STRONGEST_GOVERNANCE_ALIGNMENT" as const,
    },
    {
      gate: gateLowestReviewBurden,
      reason: "LOWEST_REVIEW_BURDEN" as const,
    },
    {
      gate: gateLowestLegalComplianceReviewNeed,
      reason: "LOWEST_REVIEW_BURDEN" as const,
    },
    {
      gate: gateLowestExecutionComplexity,
      reason: "LOWEST_EXECUTION_COMPLEXITY" as const,
    },
    {
      gate: gateStrongestResilience,
      reason: "STRONGEST_RESILIENCE_POSTURE" as const,
    },
    {
      gate: gateSafetyBiasIncremental,
      reason: "SAFEST_INCREMENTAL_PATH" as const,
    },
    {
      gate: gateComplianceBias,
      reason: "STRONGEST_GOVERNANCE_ALIGNMENT" as const,
    },
  ];
  switch (mode) {
    case "DETERMINISTIC_POLICY_FIRST":
    case "DETERMINISTIC_GOVERNANCE_FIRST":
    case "DETERMINISTIC_HUMAN_REVIEW_FIRST":
      // POLICY / GOVERNANCE both use the default ordering at
      // v1 (governance gate is already first; the modes
      // exist as namespaces for future tuning). HUMAN_REVIEW
      // mode short-circuits BEFORE this sequence is invoked,
      // so its falls-through ordering matches POLICY.
      return policyOrder;
    case "DETERMINISTIC_RESILIENCE_FIRST":
      // Resilience fires BEFORE execution complexity (gate 5
      // before gate 4 in default).
      return [
        {
          gate: gateStrongestGovernanceAlignment,
          reason: "STRONGEST_GOVERNANCE_ALIGNMENT" as const,
        },
        {
          gate: gateLowestReviewBurden,
          reason: "LOWEST_REVIEW_BURDEN" as const,
        },
        {
          gate: gateLowestLegalComplianceReviewNeed,
          reason: "LOWEST_REVIEW_BURDEN" as const,
        },
        {
          gate: gateStrongestResilience,
          reason: "STRONGEST_RESILIENCE_POSTURE" as const,
        },
        {
          gate: gateLowestExecutionComplexity,
          reason: "LOWEST_EXECUTION_COMPLEXITY" as const,
        },
        {
          gate: gateSafetyBiasIncremental,
          reason: "SAFEST_INCREMENTAL_PATH" as const,
        },
        {
          gate: gateComplianceBias,
          reason: "STRONGEST_GOVERNANCE_ALIGNMENT" as const,
        },
      ];
  }
}

// WHAT: Compute the safety-blocking gate per ADR-0074 §2
//        gate 1.
// INPUT: A full comparison matrix.
// OUTPUT: { winner, reason } if every matrix item is
//         blocked; null otherwise.
// WHY: ADR-0074 §2 gate 1 — if every candidate is blocked,
//      recommend the HUMAN_REVIEW_REQUIRED candidate if
//      present; else DO_NOT_PROCEED; else first by
//      candidate_key lexical with reason DO_NOT_PROCEED_SELECTED_FOR_SAFETY.
function safetyBlockingGate(
  matrix: PlaygroundComparisonMatrixItem[],
): { winner: PlaygroundComparisonMatrixItem; reason: PlaygroundRecommendationReason } | null {
  if (matrix.length === 0) return null;
  if (!matrix.every(isBlocked)) return null;
  const humanReview = matrix.find(
    (i) => i.candidate_type === "HUMAN_REVIEW_REQUIRED",
  );
  if (humanReview !== undefined) {
    return {
      winner: humanReview,
      reason: "CLEAREST_HUMAN_REVIEW_PATH",
    };
  }
  const doNotProceed = matrix.find(
    (i) => i.candidate_type === "DO_NOT_PROCEED",
  );
  if (doNotProceed !== undefined) {
    return {
      winner: doNotProceed,
      reason: "DO_NOT_PROCEED_SELECTED_FOR_SAFETY",
    };
  }
  return {
    winner: tieBreakByKeyAsc(matrix),
    reason: "DO_NOT_PROCEED_SELECTED_FOR_SAFETY",
  };
}

// WHAT: Compute the insufficient-data bias gate per ADR-0074
//        §2 gate 10.
// INPUT: Surviving candidates.
// OUTPUT: { winner, reason } if INSUFFICIENT_DATA dominates
//         the majority and a HUMAN_REVIEW_REQUIRED is
//         available; null otherwise.
function insufficientDataBiasGate(
  items: PlaygroundComparisonMatrixItem[],
): { winner: PlaygroundComparisonMatrixItem; reason: PlaygroundRecommendationReason } | null {
  if (items.length === 0) return null;
  const insufficient = items.filter(
    (i) => i.confidence_label === "INSUFFICIENT_DATA",
  );
  if (insufficient.length * 2 < items.length) {
    return null;
  }
  const humanReview = items.find(
    (i) => i.candidate_type === "HUMAN_REVIEW_REQUIRED",
  );
  if (humanReview !== undefined) {
    return {
      winner: humanReview,
      reason: "INSUFFICIENT_DATA_RECOMMENDS_HUMAN_REVIEW",
    };
  }
  return null;
}

// WHAT: Compute the reason_not_recommended for an
//        alternative candidate by comparing it to the
//        winner across closed-vocab dimensions.
function deriveReasonNotRecommended(args: {
  alternative: PlaygroundComparisonMatrixItem;
  winner: PlaygroundComparisonMatrixItem;
}): PlaygroundReasonNotRecommended {
  const alt = args.alternative;
  const win = args.winner;
  // Order matters — pick the most discriminating reason.
  if (isBlocked(alt) && !isBlocked(win)) {
    return "MORE_BLOCKING_FINDINGS";
  }
  if (countSubstantiveReviews(alt) > countSubstantiveReviews(win)) {
    return "MORE_REQUIRED_REVIEWS";
  }
  if (
    dimensionRating(alt, "GOVERNANCE_ALIGNMENT") === "UNFAVORABLE" &&
    dimensionRating(win, "GOVERNANCE_ALIGNMENT") !== "UNFAVORABLE"
  ) {
    return "LOWER_GOVERNANCE_ALIGNMENT";
  }
  if (
    dimensionRating(alt, "OPERATIONAL_RISK") === "UNFAVORABLE" &&
    dimensionRating(win, "OPERATIONAL_RISK") !== "UNFAVORABLE"
  ) {
    return "HIGHER_OPERATIONAL_RISK";
  }
  if (
    dimensionRating(alt, "DATA_SCOPE_READINESS") === "UNFAVORABLE" &&
    dimensionRating(win, "DATA_SCOPE_READINESS") !== "UNFAVORABLE"
  ) {
    return "LOWER_DATA_SCOPE_READINESS";
  }
  if (
    dimensionRating(alt, "CONNECTOR_READINESS") === "UNFAVORABLE" &&
    dimensionRating(win, "CONNECTOR_READINESS") !== "UNFAVORABLE"
  ) {
    return "LOWER_CONNECTOR_READINESS";
  }
  if (
    dimensionRating(alt, "RESILIENCE_IMPACT") !== "FAVORABLE" &&
    dimensionRating(win, "RESILIENCE_IMPACT") === "FAVORABLE"
  ) {
    return "LESS_RESILIENT";
  }
  if (
    dimensionRating(alt, "REVERSIBILITY") !== "FAVORABLE" &&
    dimensionRating(win, "REVERSIBILITY") === "FAVORABLE"
  ) {
    return "LESS_REVERSIBLE";
  }
  if (alt.confidence_label === "INSUFFICIENT_DATA") {
    return "INSUFFICIENT_DATA";
  }
  return "NOT_SELECTED_THIS_ROUND";
}

// WHAT: Derive the action_transition_readiness per ADR-0074
//        §4 from the winner's closed-vocab fields.
function deriveActionTransitionReadiness(
  winner: PlaygroundComparisonMatrixItem,
): PlaygroundActionTransitionReadiness {
  if (isBlocked(winner)) return "BLOCKED";
  switch (winner.action_runtime_transition_hint) {
    case "BLOCKED":
      return "BLOCKED";
    case "NO_ACTION":
      return "NOT_READY";
    case "REQUIRES_APPROVAL_CHAIN":
      return "REQUIRES_APPROVAL_CHAIN";
    case "REQUIRES_POLICY_REVIEW":
      return "REQUIRES_POLICY_REVIEW";
    case "REQUIRES_CONNECTOR_CAPABILITY":
      return "REQUIRES_CONNECTOR_CAPABILITY";
    case "REQUIRES_HUMAN_DECISION":
      return "REQUIRES_HUMAN_DECISION";
    case "MAY_PROPOSE_ACTION_LATER":
      // If legal / compliance review is required, surface
      // that as the readiness so callers see the strongest
      // gating signal.
      if (hasLegalOrComplianceReview(winner)) {
        return "REQUIRES_LEGAL_OR_COMPLIANCE_REVIEW";
      }
      if (winner.required_reviews.includes("POLICY_OWNER_REVIEW")) {
        return "REQUIRES_POLICY_REVIEW";
      }
      if (winner.required_reviews.includes("HUMAN_OWNER_REVIEW")) {
        return "REQUIRES_HUMAN_DECISION";
      }
      return "MAY_PROPOSE_ACTION_LATER";
  }
}

// WHAT: Determine whether human_decision_required is TRUE
//        per ADR-0074 §16. v1 conservative posture: TRUE
//        unless ALL 6 conditions hold simultaneously.
function deriveHumanDecisionRequired(
  winner: PlaygroundComparisonMatrixItem,
  readiness: PlaygroundActionTransitionReadiness,
): boolean {
  const inSafeReadinessSet =
    readiness !== "NOT_READY" &&
    readiness !== "REQUIRES_HUMAN_DECISION" &&
    readiness !== "BLOCKED";
  const conditionsHold =
    winner.candidate_type !== "HUMAN_REVIEW_REQUIRED" &&
    winner.candidate_type !== "DO_NOT_PROCEED" &&
    winner.blocked_by_policy === false &&
    winner.action_runtime_transition_hint !== "BLOCKED" &&
    winner.action_runtime_transition_hint !== "REQUIRES_HUMAN_DECISION" &&
    winner.confidence_label !== "INSUFFICIENT_DATA" &&
    inSafeReadinessSet;
  return !conditionsHold;
}

// WHAT: Build the recommendation_summary closed-style
//        paragraph.
function buildRecommendationSummary(args: {
  winner: PlaygroundComparisonMatrixItem;
  reasons: readonly PlaygroundRecommendationReason[];
  candidateCount: number;
  humanDecisionRequired: boolean;
}): string {
  const reasonsList = args.reasons.length > 0
    ? args.reasons.join(", ")
    : "deterministic tie-break by candidate_key";
  const reviewClause = args.humanDecisionRequired
    ? "Human / governance review is required before any real-world action."
    : "Human / governance review remains recommended before any real-world action.";
  const summary =
    `The ${args.winner.candidate_type} candidate is recommended for ` +
    `human review out of ${args.candidateCount} compared candidate(s). ` +
    `Selected because: ${reasonsList}. ${reviewClause} ` +
    `Recommendation is advisory; not a final decision; not legal advice.`;
  return summary.slice(0, RECOMMENDATION_SUMMARY_MAX_CHARS);
}

// WHAT: Build the evidence_refs SAFE projected-metadata-token
//        list per ADR-0074 §1 + §17 (NEVER raw IDs that leak
//        cross-entity scope; NEVER raw content; closed-vocab
//        tokens only).
function buildEvidenceRefs(args: {
  scenario_id: string;
  winner: PlaygroundComparisonMatrixItem;
  reasons: readonly PlaygroundRecommendationReason[];
  comparison_mode: PlaygroundComparisonMode;
  recommendation_mode: PlaygroundRecommendationMode;
}): string[] {
  const refs: string[] = [
    `COMPARISON_MODE:${args.comparison_mode}`,
    `RECOMMENDATION_MODE:${args.recommendation_mode}`,
    `CANDIDATE_TYPE:${args.winner.candidate_type}`,
    `CONFIDENCE_LABEL:${args.winner.confidence_label}`,
    `TRANSITION_HINT:${args.winner.action_runtime_transition_hint}`,
  ];
  for (const reason of args.reasons) {
    refs.push(`RECOMMENDATION_REASON:${reason}`);
  }
  return refs.slice(0, EVIDENCE_REFS_MAX);
}

// WHAT: Build the alternatives_considered list from the
//        non-recommended matrix items, capped per ADR-0074
//        §11.
function buildAlternativesConsidered(args: {
  matrix: readonly PlaygroundComparisonMatrixItem[];
  winner: PlaygroundComparisonMatrixItem;
}): {
  alternatives: PlaygroundAlternativeConsidered[];
  notRecommendedReasons: PlaygroundReasonNotRecommended[];
} {
  const alternatives: PlaygroundAlternativeConsidered[] = [];
  const reasonsSet = new Set<PlaygroundReasonNotRecommended>();
  for (const item of args.matrix) {
    if (item.candidate_key === args.winner.candidate_key) continue;
    if (alternatives.length >= ALTERNATIVES_CONSIDERED_MAX) break;
    const reason = deriveReasonNotRecommended({
      alternative: item,
      winner: args.winner,
    });
    reasonsSet.add(reason);
    const blockingFindings = [
      ...item.risk_findings,
      ...item.dependency_findings.filter(
        (d) => d !== "NO_BLOCKING_DEPENDENCY_IDENTIFIED",
      ),
    ].slice(0, BLOCKING_FINDINGS_PER_ALTERNATIVE_MAX) as readonly (
      | PlaygroundRiskFinding
      | PlaygroundDependencyFinding
    )[];
    const reviewFindings = item.required_reviews
      .filter((r) => r !== "NO_ADDITIONAL_REVIEW_IDENTIFIED")
      .slice(0, REVIEW_FINDINGS_PER_ALTERNATIVE_MAX);
    alternatives.push({
      candidate_key: item.candidate_key,
      candidate_type: item.candidate_type,
      candidate_title: item.candidate_title.slice(
        0,
        RECOMMENDED_CANDIDATE_TITLE_MAX_CHARS,
      ),
      reason_not_recommended: reason,
      blocking_findings: blockingFindings,
      review_findings: reviewFindings,
      confidence_label: item.confidence_label,
    });
  }
  return {
    alternatives,
    notRecommendedReasons: [...reasonsSet].slice(0, NOT_RECOMMENDED_REASONS_MAX),
  };
}

// WHAT: The Agent Playground Wave 7 Option A deterministic
//        best-path recommendation service.
// INPUT: PlaygroundOutcomeComparisonService (for internal
//        Wave 6 invocation) + PlaygroundScenarioService (for
//        owner attribution on the Wave 7 audit row; mirrors
//        the Wave 6 audit-attribution pattern).
// OUTPUT: A single method `recommendBestPath`.
// WHY: Single class so future Wave 8 governed-transition
//      services can compose against a stable interface. The
//      service enforces: (1) auth + owner-first + same-org
//      via Wave 6 → Wave 5 → Wave 4 delegation; (2) closed-
//      vocab body validation; (3) deterministic priority-
//      ladder selection (NO numeric scoring; NO winner
//      framing beyond explicit advisory posture); (4)
//      mandatory honest_note + human_decision_required
//      conservative posture per ADR-0074 §16; (5) safe-
//      metadata-only audit emission. NO persistence, NO
//      LLM, NO connector invocation, NO Action creation, NO
//      external provider call.
export class PlaygroundBestPathRecommendationService {
  constructor(
    private readonly comparisons: PlaygroundOutcomeComparisonService,
    private readonly scenarios: PlaygroundScenarioService,
  ) {}

  // WHAT: Recommend the best path for a stored scenario per
  //        ADR-0074.
  async recommendBestPath(
    sessionToken: string,
    scenarioId: string,
    body: RecommendBestPathInput,
    context: { ip_address?: string | null } = {},
  ): Promise<
    RecommendBestPathSuccess | PlaygroundBestPathRecommendationFailure
  > {
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
        raw > CANDIDATES_CONSIDERED_MAX
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

    let recommendationMode: PlaygroundRecommendationMode =
      "DETERMINISTIC_POLICY_FIRST";
    if (body.recommendation_mode !== undefined) {
      if (!isRecommendationMode(body.recommendation_mode)) {
        invalidFields.push("recommendation_mode");
      } else {
        recommendationMode = body.recommendation_mode;
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

    // 2. Internally invoke Wave 6 outcome-comparison per
    //    ADR-0074 §10. SCENARIO_NOT_FOUND / SESSION_* /
    //    INVALID_REQUEST / INTERNAL_ERROR all flow through
    //    verbatim. NEVER accept caller-supplied comparison
    //    or candidate payloads.
    const comparisonBody: {
      candidate_types?: readonly PlaygroundCandidateType[];
      max_candidates?: number;
      comparison_mode?: PlaygroundComparisonMode;
    } = {};
    if (requestedTypes !== undefined) {
      comparisonBody.candidate_types = requestedTypes;
    }
    if (requestedMax !== undefined) {
      comparisonBody.max_candidates = requestedMax;
    }
    comparisonBody.comparison_mode = comparisonMode;
    const compareResult = (await this.comparisons.compareOutcomes(
      sessionToken,
      scenarioId,
      comparisonBody,
      { ip_address: context.ip_address ?? null },
    )) as CompareOutcomesSuccess | PlaygroundBestPathRecommendationFailure;
    if (compareResult.ok === false) {
      return compareResult;
    }

    const matrix = compareResult.comparison_matrix.slice(
      0,
      CANDIDATES_CONSIDERED_MAX,
    );

    if (matrix.length === 0) {
      // No candidates produced — defensive return; should
      // not occur because Wave 6 → Wave 5 default set
      // always emits at least 5 candidates.
      return {
        ok: false,
        code: "INTERNAL_ERROR",
        message: "Comparison matrix is empty; cannot recommend.",
      };
    }

    // 3. Apply the priority ladder.
    let winner: PlaygroundComparisonMatrixItem | undefined;
    let reasons: PlaygroundRecommendationReason[] = [];

    // Gate 1: Safety-blocking.
    const safetyChoice = safetyBlockingGate([...matrix]);
    if (safetyChoice !== null) {
      winner = safetyChoice.winner;
      reasons = [safetyChoice.reason];
    }

    if (winner === undefined) {
      // Mode short-circuit: DETERMINISTIC_HUMAN_REVIEW_FIRST.
      if (recommendationMode === "DETERMINISTIC_HUMAN_REVIEW_FIRST") {
        const humanReview = matrix.find(
          (i) => i.candidate_type === "HUMAN_REVIEW_REQUIRED",
        );
        if (humanReview !== undefined) {
          winner = humanReview;
          reasons = ["CLEAREST_HUMAN_REVIEW_PATH"];
        }
      }
    }

    if (winner === undefined) {
      // Gate 2: filter to unblocked candidates.
      let surviving: PlaygroundComparisonMatrixItem[] = matrix.filter(
        (i) => !isBlocked(i),
      );
      if (surviving.length === 0) {
        // Defensive — gate 1 should have caught this.
        surviving = [...matrix];
      }
      const earnedReasons = new Set<PlaygroundRecommendationReason>();
      // Capture "fewest blocking findings" as an
      // independent earned-reason if the unblocked subset is
      // strictly smaller than the full matrix.
      if (surviving.length < matrix.length) {
        earnedReasons.add("FEWEST_BLOCKING_FINDINGS");
      }

      const sequence = gateSequenceFor(recommendationMode);
      for (const { gate, reason } of sequence) {
        const step = applyGate(surviving, gate);
        if (step.winner !== undefined) {
          winner = step.winner;
          if (step.gateFired) earnedReasons.add(reason);
          break;
        }
        surviving = step.remaining;
        if (step.gateFired) earnedReasons.add(reason);
      }

      if (winner === undefined) {
        // Gate 10: insufficient-data bias.
        const dataBias = insufficientDataBiasGate(surviving);
        if (dataBias !== null) {
          winner = dataBias.winner;
          earnedReasons.add(dataBias.reason);
        }
      }

      if (winner === undefined) {
        // Gate 11: deterministic tie-breaker.
        winner = tieBreakByKeyAsc(surviving);
        if (earnedReasons.size === 0) {
          earnedReasons.add("FEWEST_BLOCKING_FINDINGS");
        }
      }

      reasons = [...earnedReasons].slice(0, RECOMMENDATION_REASONS_MAX);
    }

    // Safety net — must have a winner by now.
    if (winner === undefined) {
      return {
        ok: false,
        code: "INTERNAL_ERROR",
        message: "Recommendation selection failed; this should not occur.",
      };
    }

    // 4. Compute action_transition_readiness +
    //    human_decision_required per ADR-0074 §4 + §16.
    const readiness = deriveActionTransitionReadiness(winner);
    const humanDecisionRequired = deriveHumanDecisionRequired(winner, readiness);

    // 5. Build alternatives_considered + not_recommended_reasons.
    const { alternatives, notRecommendedReasons } = buildAlternativesConsidered(
      {
        matrix,
        winner,
      },
    );

    // 6. Build evidence_refs (closed-vocab only).
    const evidenceRefs = buildEvidenceRefs({
      scenario_id: compareResult.scenario_id,
      winner,
      reasons,
      comparison_mode: comparisonMode,
      recommendation_mode: recommendationMode,
    });

    // 7. Build recommendation_summary (closed-style).
    const recommendationSummary = buildRecommendationSummary({
      winner,
      reasons,
      candidateCount: matrix.length,
      humanDecisionRequired,
    });

    // 8. Look up scenario owner for audit attribution
    //    (mirrors Wave 6 pattern; Wave 6 already validated
    //    session + owner-first scope).
    const scenarioLookup = await this.scenarios.getScenario(
      sessionToken,
      compareResult.scenario_id,
    );
    if (scenarioLookup.ok === false) {
      return scenarioLookup;
    }
    const ownerEntityId = scenarioLookup.scenario.owner_entity_id;

    // 9. Emit audit. Safe metadata only — NEVER raw
    //    recommendation / comparison / candidate text;
    //    NEVER raw scenario JSON; NEVER scores; NEVER legal-
    //    compliance conclusions.
    const audit = await writeAuditEvent({
      event_type: "ADMIN_ACTION",
      outcome: "SUCCESS",
      actor_entity_id: ownerEntityId,
      target_entity_id: ownerEntityId,
      ip_address: context.ip_address ?? null,
      details: {
        action: "PLAYGROUND_BEST_PATH_RECOMMENDED",
        scenario_id: compareResult.scenario_id,
        recommendation_mode: recommendationMode,
        candidate_count: matrix.length,
        recommended_candidate_key: winner.candidate_key,
        recommended_candidate_type: winner.candidate_type,
        blocked_by_policy: winner.blocked_by_policy,
        human_decision_required: humanDecisionRequired,
        action_transition_readiness: readiness,
      },
    });

    // 10. Return SAFE projection. NEVER mutates scenario;
    //     NEVER persists recommendation (computed-on-read).
    return {
      ok: true,
      scenario_id: compareResult.scenario_id,
      recommended_at: new Date().toISOString(),
      recommendation_mode: recommendationMode,
      recommended_candidate_key: winner.candidate_key,
      recommended_candidate_type: winner.candidate_type,
      recommended_candidate_title: winner.candidate_title.slice(
        0,
        RECOMMENDED_CANDIDATE_TITLE_MAX_CHARS,
      ),
      recommendation_summary: recommendationSummary,
      recommendation_reasons: reasons,
      evidence_refs: evidenceRefs,
      governance_findings: winner.governance_findings.slice(
        0,
        GOVERNANCE_FINDINGS_MAX,
      ),
      required_reviews: winner.required_reviews.slice(0, REQUIRED_REVIEWS_MAX),
      risk_findings: winner.risk_findings.slice(0, RISK_FINDINGS_MAX),
      dependency_findings: winner.dependency_findings.slice(
        0,
        DEPENDENCY_FINDINGS_MAX,
      ),
      blocked_by_policy: winner.blocked_by_policy,
      action_runtime_transition_hint: winner.action_runtime_transition_hint,
      action_transition_readiness: readiness,
      alternatives_considered: alternatives,
      not_recommended_reasons: notRecommendedReasons,
      confidence_label: winner.confidence_label,
      human_decision_required: humanDecisionRequired,
      honest_note: HONEST_NOTE,
      audit_event_id: audit.audit_id,
    };
  }
}
