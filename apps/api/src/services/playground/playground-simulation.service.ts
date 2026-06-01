// FILE: playground-simulation.service.ts
// PURPOSE: Section 5 Wave 9 Option A — Agent Playground
//          deterministic multi-agent simulation orchestration
//          service per ADR-0076. Enumerates (branch_definition
//          × agent_role) sub-invocations against Wave 7's
//          deterministic best-path recommendation surface,
//          aggregates Wave 7 results into convergence /
//          disagreement summaries, and recommends a NEXT
//          REVIEW item — WITHOUT executing, creating Section
//          2 Actions, invoking connectors, exchanging raw
//          chain-of-thought between agents, producing hidden
//          scoring, accepting caller-supplied agent prompts /
//          payloads, or bypassing Wave 8 governed transition.
//
//          Computed-on-read; NO persistence (ADR-0076 §13);
//          NO new Prisma model; NO schema migration; NO new
//          audit literal; NO LLM / model calls; NO Python;
//          NO BEAM (ADR-0076 §12 8-question check locks v1 at
//          TypeScript §2.1; Option C BEAM is forward-substrate
//          pending ADR-0028 amendment); NO Action creation
//          (Wave 8 owns transitions; Wave 9 NEVER bypasses
//          Wave 8); NO connector invocation; NO external
//          provider call; NO Control Tower frontend; NO multi-
//          agent runtime that survives between requests; NO
//          agent-to-agent message-passing; NO LLM-generated
//          agent personas; NO numeric scoring / ranking /
//          probability claims; NO score / rank / winner /
//          probability / roi field names. Branches are
//          INDEPENDENT (ADR-0076 §5 + §9) — each
//          (branch_definition, agent_role) pair fires ONE
//          internal `recommendBestPath` call via
//          Promise.allSettled, then projects the Wave 7
//          result through a closed-vocab agent_role lens.
//
//          Owner-first + same-org SCENARIO_NOT_FOUND
//          enumeration-safe gate is inherited verbatim via
//          Wave 7 → Wave 6 → Wave 5 → Wave 4 delegation;
//          cross-owner / cross-org / unknown id all fold to
//          404 per ADR-0065 §12 universal.
//
//          Mandatory `caller_confirmation: true` per ADR-0076
//          §2. NO `idempotency_key` (Wave 9 creates no Action
//          rows; ADR-0076 §13 + §16 + §18 explicitly forbid
//          Action creation at this slice).
//
//          Audit emission uses the canonical ADMIN_ACTION +
//          details.action discriminator per ADR-0076 §14 with
//          `details.action = "PLAYGROUND_SIMULATION_EXECUTED"`;
//          ZERO new audit literal. Safe metadata only —
//          NEVER raw branch text, NEVER raw chain-of-thought,
//          NEVER raw scenario JSON, NEVER agent prompts,
//          NEVER model outputs, NEVER scores. Each Wave 7
//          sub-invocation emits its own
//          PLAYGROUND_BEST_PATH_RECOMMENDED audit row per
//          ADR-0074 §14; Wave 9 does NOT suppress those.
// CONNECTS TO:
//   - apps/api/src/services/playground/playground-best-path-recommendation.service.ts
//     (Wave 7 best-path — internally invoked per ADR-0076 §9;
//     once per branch_definition × agent_role combination)
//   - apps/api/src/services/playground/playground-scenario.service.ts
//     (for owner attribution on the Wave 9 simulation audit
//     row; mirrors Wave 5/6/7/8 audit-attribution pattern)
//   - packages/database/src/queries/audit.ts (writeAuditEvent
//     — ADMIN_ACTION + details.action =
//     "PLAYGROUND_SIMULATION_EXECUTED")
//   - ADR-0076 Section 5 Wave 9 Multi-Agent Simulation
//     Orchestration Contract (full sub-decision lineage at
//     §1-§18 + §12 8-question check + §15 three-method
//     comparison)
//   - ADR-0074 Section 5 Wave 7 Best-Path Recommendation
//     Contract (input source verbatim via §9 internal
//     invocation)
//   - ADR-0075 Section 5 Wave 8 Governed-Transition Contract
//     (Wave 9 NEVER invokes Wave 8; Wave 8 owns all Section
//     2 Action transitions)

import { createHash } from "node:crypto";
import { writeAuditEvent } from "@niov/database";
import type {
  PlaygroundBestPathRecommendationService,
  PlaygroundRecommendationMode,
  PlaygroundRecommendationReason,
  RecommendBestPathSuccess,
  RecommendBestPathInput,
} from "./playground-best-path-recommendation.service.js";
import { PLAYGROUND_RECOMMENDATION_MODE_VALUES } from "./playground-best-path-recommendation.service.js";
import type {
  PlaygroundComparisonMode,
} from "./playground-outcome-comparison.service.js";
import {
  PLAYGROUND_CANDIDATE_TYPE_VALUES,
  type PlaygroundCandidateType,
  type PlaygroundGovernanceFinding,
  type PlaygroundConfidenceLabel,
} from "./playground-candidate.service.js";
import type {
  PlaygroundRequiredReview,
} from "./playground-outcome-comparison.service.js";
import type {
  PlaygroundScenarioFailureCode,
  PlaygroundScenarioService,
} from "./playground-scenario.service.js";
import type {
  ConversationContextSignal,
  ConversationContextSignalProjectionServiceLike,
} from "./conversation-context-signals.js";

// WHAT: Closed-vocabulary orchestration_mode set per ADR-0076
//        §3.
// INPUT: Used as a constant + a type-narrowing source.
// OUTPUT: A readonly tuple of the 3 valid orchestration modes.
// WHY: ADR-0076 §3 locks the 3 values. Adding a new value
//      requires a future Founder-authorized ADR amendment.
export const PLAYGROUND_ORCHESTRATION_MODE_VALUES = [
  "DETERMINISTIC_BRANCH_ENUMERATION",
  "DETERMINISTIC_CONSTRAINT_VARIATION",
  "DETERMINISTIC_GOVERNANCE_SCOPE_VARIATION",
] as const;
export type PlaygroundOrchestrationMode =
  (typeof PLAYGROUND_ORCHESTRATION_MODE_VALUES)[number];

// WHAT: Closed-vocabulary branch_definition set per ADR-0076
//        §4 Amendment 1 (vNext runtime LIVE since
//        `[FOUNDER-SECTION-5-WAVE-9-VNEXT-IMPLEMENTATION-AUTH]`
//        2026-05-31). Six values total — the 4 default values
//        plus 2 opt-in values; default 4 × default 6 roles =
//        24 sub-invocations preserves the ADR-0076 §11
//        24-branch ceiling.
//
//        v1 vocabulary (BASELINE / POLICY_FIRST_BRANCH /
//        GOVERNANCE_FIRST_BRANCH / RESILIENCE_FIRST_BRANCH /
//        HUMAN_REVIEW_FIRST_BRANCH) was the LIVE runtime
//        from Wave 9 Option A PR #147 `340d37f` 2026-05-31
//        through ADR-0076 Amendment 1 docs landing at PR
//        #151 `401fdee` 2026-05-31. This commit performs
//        the clean v1 → vNext replacement per ADR-0076
//        §17A migration posture.
export const PLAYGROUND_BRANCH_DEFINITION_VALUES = [
  "RECOMMENDED_PATH",
  "LOW_RISK_PATH",
  "COMPLIANCE_FIRST_PATH",
  "RESILIENCE_FIRST_PATH",
  "HUMAN_REVIEW_PATH",
  "DO_NOT_PROCEED_PATH",
] as const;
export type PlaygroundBranchDefinition =
  (typeof PLAYGROUND_BRANCH_DEFINITION_VALUES)[number];

// WHAT: Default branch_definition set per Founder paste at
//        `[FOUNDER-SECTION-5-WAVE-9-VNEXT-IMPLEMENTATION-AUTH]`
//        2026-05-31. Four values × six default roles =
//        24-branch ceiling. RESILIENCE_FIRST_PATH +
//        DO_NOT_PROCEED_PATH are opt-in via explicit
//        `branch_definitions[]` body param.
const DEFAULT_BRANCH_DEFINITIONS: readonly PlaygroundBranchDefinition[] = [
  "RECOMMENDED_PATH",
  "LOW_RISK_PATH",
  "COMPLIANCE_FIRST_PATH",
  "HUMAN_REVIEW_PATH",
];

// WHAT: Closed-vocabulary agent_role set per ADR-0076 §5
//        Amendment 1 vNext (LIVE since
//        `[FOUNDER-SECTION-5-WAVE-9-VNEXT-IMPLEMENTATION-AUTH]`
//        2026-05-31). Ten values total — 6 default plus 4
//        opt-in. Each agent_role is a closed-vocab lens
//        projecting Wave 7 output; NEVER an LLM persona;
//        NEVER exchanges raw text or chain-of-thought with
//        another agent_role.
//
//        v1 vocabulary (OPERATIONS_AGENT / COMPLIANCE_AGENT /
//        RISK_AGENT / CUSTOMER_AGENT / RESILIENCE_AGENT /
//        HUMAN_REVIEW_AGENT) replaced cleanly per ADR-0076
//        §17A migration posture.
export const PLAYGROUND_AGENT_ROLE_VALUES = [
  "OWNER_OPERATOR",
  "POLICY_REVIEWER",
  "COMPLIANCE_REVIEWER",
  "SECURITY_REVIEWER",
  "DATA_GOVERNANCE_REVIEWER",
  "CONNECTOR_ADMIN",
  "ACTION_APPROVER",
  "CUSTOMER_OR_STAKEHOLDER_ADVOCATE",
  "OPERATIONS_LEAD",
  "RESILIENCE_REVIEWER",
] as const;
export type PlaygroundAgentRole =
  (typeof PLAYGROUND_AGENT_ROLE_VALUES)[number];

// WHAT: Default agent_role set per Founder paste at
//        `[FOUNDER-SECTION-5-WAVE-9-VNEXT-IMPLEMENTATION-AUTH]`
//        2026-05-31. Six values × four default branches =
//        24-branch ceiling. SECURITY_REVIEWER +
//        DATA_GOVERNANCE_REVIEWER + CONNECTOR_ADMIN +
//        CUSTOMER_OR_STAKEHOLDER_ADVOCATE are opt-in via
//        explicit `agent_roles[]` body param.
const DEFAULT_AGENT_ROLES: readonly PlaygroundAgentRole[] = [
  "OWNER_OPERATOR",
  "POLICY_REVIEWER",
  "COMPLIANCE_REVIEWER",
  "ACTION_APPROVER",
  "OPERATIONS_LEAD",
  "RESILIENCE_REVIEWER",
];

// WHAT: Closed-vocab assumed_constraints set per ADR-0076 §6.1.
export const PLAYGROUND_ASSUMED_CONSTRAINT_VALUES = [
  "OWNER_COSMP_SCOPE_ONLY",
  "SAME_ORG_ONLY",
  "NO_EXTERNAL_PROVIDERS",
  "NO_CONNECTOR_INVOCATION",
  "NO_RAW_MEMORY_ACCESS",
  "NO_AUTONOMOUS_EXECUTION",
  "WAVE_8_TRANSITION_REQUIRED_BEFORE_ACTION",
  "HUMAN_REVIEW_BEFORE_FINAL_DECISION",
  "LEGAL_COMPLIANCE_REVIEW_WHERE_APPLICABLE",
  "BLOCKED_CANDIDATES_NEVER_TRANSITIONABLE",
] as const;
export type PlaygroundAssumedConstraint =
  (typeof PLAYGROUND_ASSUMED_CONSTRAINT_VALUES)[number];

// WHAT: Closed-vocab expected_outcomes set per ADR-0076 §6.2.
export const PLAYGROUND_EXPECTED_OUTCOME_VALUES = [
  "WAVE_7_RECOMMENDATION_PRODUCED",
  "WAVE_7_RECOMMENDATION_BLOCKED",
  "WAVE_7_RECOMMENDATION_REQUIRES_HUMAN_DECISION",
  "WAVE_8_TRANSITION_POSSIBLE_AFTER_REVIEW",
  "WAVE_8_TRANSITION_DECLINED_BY_POLICY",
  "INSUFFICIENT_DATA_REQUIRES_REVIEW",
  "COMPLIANCE_REVIEW_RECOMMENDED",
  "OPERATIONAL_RESILIENCE_FAVORABLE",
] as const;
export type PlaygroundExpectedOutcome =
  (typeof PLAYGROUND_EXPECTED_OUTCOME_VALUES)[number];

// WHAT: Closed-vocab governance_conflicts set per ADR-0076 §6.3.
export const PLAYGROUND_GOVERNANCE_CONFLICT_VALUES = [
  "BRANCH_RECOMMENDS_DIFFERENT_CANDIDATE_TYPE",
  "BRANCH_BLOCKED_BY_POLICY",
  "BRANCH_REQUIRES_DUAL_CONTROL",
  "BRANCH_REQUIRES_LEGAL_REVIEW",
  "BRANCH_REQUIRES_COMPLIANCE_REVIEW",
  "BRANCH_INSUFFICIENT_DATA",
  "BRANCH_HUMAN_DECISION_REQUIRED",
  "BRANCH_ACTION_RUNTIME_REQUIRED",
  "BRANCH_NO_TRANSITION_POSSIBLE",
  "NO_NOTABLE_CONFLICT",
] as const;
export type PlaygroundGovernanceConflict =
  (typeof PLAYGROUND_GOVERNANCE_CONFLICT_VALUES)[number];

// WHAT: Closed-vocab unresolved_questions set per ADR-0076 §6.4.
export const PLAYGROUND_UNRESOLVED_QUESTION_VALUES = [
  "WHICH_CANDIDATE_TYPE_TO_RECOMMEND",
  "WHETHER_TO_PROCEED_GIVEN_INSUFFICIENT_DATA",
  "WHETHER_GOVERNANCE_REVIEW_IS_SUFFICIENT",
  "WHETHER_LEGAL_REVIEW_IS_REQUIRED",
  "WHETHER_DUAL_CONTROL_IS_REQUIRED",
  "WHETHER_TO_BLOCK_OR_PROCEED",
  "WHETHER_HUMAN_REVIEWER_IS_AVAILABLE",
  "NO_UNRESOLVED_QUESTIONS_IDENTIFIED",
] as const;
export type PlaygroundUnresolvedQuestion =
  (typeof PLAYGROUND_UNRESOLVED_QUESTION_VALUES)[number];

// WHAT: Closed-vocab next_review_label set per ADR-0076 §7.
export const PLAYGROUND_NEXT_REVIEW_LABEL_VALUES = [
  "HUMAN_GOVERNANCE_REVIEW",
  "POLICY_OWNER_REVIEW",
  "COMPLIANCE_REVIEW",
  "LEGAL_REVIEW",
  "OPERATIONAL_RESILIENCE_REVIEW",
  "DATA_GOVERNANCE_REVIEW",
  "RERUN_WITH_DIFFERENT_RECOMMENDATION_MODE",
  "NO_FURTHER_REVIEW_IDENTIFIED",
] as const;
export type PlaygroundNextReviewLabel =
  (typeof PLAYGROUND_NEXT_REVIEW_LABEL_VALUES)[number];

// WHAT: Closed-vocab evidence_posture labels per Founder
//        enterprise decision-output clarification 2026-05-31.
// INPUT: Constant + type-narrowing source.
// OUTPUT: A readonly tuple of evidence-posture labels.
// WHY: Surfaces what supported the recommendation as
//      closed-vocab labels only — NEVER raw evidence
//      content / raw conversation text / raw audit details.
//      Wave 9 v1 derives these from Wave 7 sub-invocation
//      outputs only; future Wave 9 amendments may wire in
//      conversation-listener / hive / analytics signals
//      under explicit Founder authorization.
export const PLAYGROUND_EVIDENCE_POSTURE_VALUES = [
  "HIERARCHY_SUPPORTS_PATH",
  "POLICY_SUPPORTS_PATH",
  "PRIOR_ACTION_HISTORY_SUPPORTS_PATH",
  "CONVERSATION_CONTEXT_SUPPORTS_PATH",
  "ANALYTICS_SUPPORTS_PATH",
  "CONNECTOR_READINESS_SUPPORTS_PATH",
  "AUDIT_HISTORY_SUPPORTS_PATH",
  "COMPLIANCE_REVIEW_REQUIRED",
  "LEGAL_REVIEW_REQUIRED",
  "INSUFFICIENT_CONTEXT",
  "CONFLICTING_SIGNALS",
  "AUTHORITY_CHAIN_UNCLEAR",
] as const;
export type PlaygroundEvidencePosture =
  (typeof PLAYGROUND_EVIDENCE_POSTURE_VALUES)[number];

// WHAT: Closed-vocab safe_next_step labels per Founder
//        enterprise decision-output clarification 2026-05-31.
// INPUT: Constant + type-narrowing source.
// OUTPUT: A readonly tuple of safe-next-step labels.
// WHY: Wave 9 NEVER executes; it only RECOMMENDS a next
//      review posture. Closed-vocab labels only.
export const PLAYGROUND_SAFE_NEXT_STEP_VALUES = [
  "PROCEED_TO_HUMAN_REVIEW",
  "REQUEST_MISSING_CONTEXT",
  "REQUEST_APPROVAL_CHAIN",
  "REQUEST_COMPLIANCE_REVIEW",
  "REQUEST_LEGAL_REVIEW",
  "PROPOSE_GOVERNED_ACTION",
  "DO_NOT_PROCEED",
] as const;
export type PlaygroundSafeNextStep =
  (typeof PLAYGROUND_SAFE_NEXT_STEP_VALUES)[number];

// WHAT: Closed-vocab primary_recommendation_reason labels.
//       Inherits PlaygroundRecommendationReason vocab from
//       Wave 7 verbatim per ADR-0074 §3 — these are the
//       recommendation_reasons surfaced by the primary branch's
//       Wave 7 sub-invocation. Re-exported here for the
//       enterprise-posture extension at the service boundary.
// WHAT: Closed-vocab blocker_before_action labels per
//        Founder enterprise decision-output clarification
//        2026-05-31. Distinct from governance_conflicts —
//        blockers are the action-blocking subset.
export const PLAYGROUND_BLOCKER_BEFORE_ACTION_VALUES = [
  "POLICY_BLOCKS_ACTION",
  "MISSING_COMPLIANCE_REVIEW",
  "MISSING_LEGAL_REVIEW",
  "MISSING_DUAL_CONTROL_APPROVAL",
  "MISSING_HUMAN_DECISION",
  "INSUFFICIENT_DATA",
  "CONNECTOR_UNAVAILABLE",
  "AUTHORITY_CHAIN_UNCLEAR",
  "NO_TRANSITION_POSSIBLE",
  "NO_KNOWN_BLOCKER",
] as const;
export type PlaygroundBlockerBeforeAction =
  (typeof PLAYGROUND_BLOCKER_BEFORE_ACTION_VALUES)[number];

// WHAT: ADR-0076 §11 bounded counts canonical at the
//        discipline register.
const BRANCHES_PER_RESPONSE_MAX = 24;
const ASSUMED_CONSTRAINTS_PER_BRANCH_MAX = 10;
const EXPECTED_OUTCOMES_PER_BRANCH_MAX = 8;
const GOVERNANCE_CONFLICTS_PER_BRANCH_MAX = 10;
const UNRESOLVED_QUESTIONS_PER_RESPONSE_MAX = 8;
const BRANCH_SUMMARY_MAX_CHARS = 600;
const RATIONALE_SUMMARY_MAX_CHARS = 300;

// WHAT: The canonical honest_note for Wave 9.
const HONEST_NOTE =
  "This simulation is advisory only. Branches are independent " +
  "Wave 7 sub-invocations projected through closed-vocab " +
  "agent_role lenses; no agent-to-agent communication, no LLM " +
  "reasoning, no hidden scoring. Any transition to a real " +
  "action requires Wave 8 governed transition + Section 2 " +
  "approval. Not a final decision; not legal advice.";

// WHAT: Type guard for the closed-vocab orchestration_mode set.
function isOrchestrationMode(value: unknown): value is PlaygroundOrchestrationMode {
  return (
    typeof value === "string" &&
    (PLAYGROUND_ORCHESTRATION_MODE_VALUES as readonly string[]).includes(value)
  );
}

// WHAT: Type guard for the closed-vocab branch_definition set.
function isBranchDefinition(value: unknown): value is PlaygroundBranchDefinition {
  return (
    typeof value === "string" &&
    (PLAYGROUND_BRANCH_DEFINITION_VALUES as readonly string[]).includes(value)
  );
}

// WHAT: Type guard for the closed-vocab agent_role set.
function isAgentRole(value: unknown): value is PlaygroundAgentRole {
  return (
    typeof value === "string" &&
    (PLAYGROUND_AGENT_ROLE_VALUES as readonly string[]).includes(value)
  );
}

// WHAT: Type guard for the closed-vocab candidate_type set.
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
    (value === "DETERMINISTIC_RUBRIC" || value === "CANDIDATE_FIELD_PROJECTION")
  );
}

// WHAT: Type guard for the closed-vocab recommendation_mode set.
function isRecommendationMode(value: unknown): value is PlaygroundRecommendationMode {
  return (
    typeof value === "string" &&
    (PLAYGROUND_RECOMMENDATION_MODE_VALUES as readonly string[]).includes(value)
  );
}

// WHAT: Map a branch_definition → Wave 7 recommendation_mode
//        per ADR-0076 §4 Amendment 1 + Founder vNext
//        implementation paste 2026-05-31. RECOMMENDED_PATH +
//        LOW_RISK_PATH map to POLICY_FIRST (Wave 7 default
//        priority ladder). COMPLIANCE_FIRST_PATH maps to
//        GOVERNANCE_FIRST. RESILIENCE_FIRST_PATH maps to
//        RESILIENCE_FIRST. HUMAN_REVIEW_PATH and
//        DO_NOT_PROCEED_PATH both map to HUMAN_REVIEW_FIRST
//        (Wave 7's HUMAN_REVIEW_FIRST mode short-circuits to
//        HUMAN_REVIEW_REQUIRED + safety-blocking gates so
//        DO_NOT_PROCEED_PATH safely surfaces a non-action
//        posture per §4.2 + Founder paste branch-mapping
//        guidance). DO_NOT_PROCEED_PATH NEVER creates an
//        Action and NEVER invokes Wave 8; the safety-first
//        posture is communicated through the closed-vocab
//        projection labels (governance_conflicts /
//        expected_outcomes / blockers_before_action).
function recommendationModeForBranch(
  branch: PlaygroundBranchDefinition,
): PlaygroundRecommendationMode {
  switch (branch) {
    case "RECOMMENDED_PATH":
    case "LOW_RISK_PATH":
      return "DETERMINISTIC_POLICY_FIRST";
    case "COMPLIANCE_FIRST_PATH":
      return "DETERMINISTIC_GOVERNANCE_FIRST";
    case "RESILIENCE_FIRST_PATH":
      return "DETERMINISTIC_RESILIENCE_FIRST";
    case "HUMAN_REVIEW_PATH":
    case "DO_NOT_PROCEED_PATH":
      return "DETERMINISTIC_HUMAN_REVIEW_FIRST";
  }
}

// WHAT: Compute the deterministic 16-char hex branch_id per
//        ADR-0076 §10. SHA-256 over (scenario_id,
//        orchestration_mode, branch_definition, agent_role)
//        truncated to 16 hex chars — mirrors ADR-0072
//        candidate_key precedent.
function computeBranchId(args: {
  scenario_id: string;
  orchestration_mode: PlaygroundOrchestrationMode;
  branch_definition: PlaygroundBranchDefinition;
  agent_role: PlaygroundAgentRole;
}): string {
  const hash = createHash("sha256");
  hash.update(args.scenario_id);
  hash.update("|");
  hash.update(args.orchestration_mode);
  hash.update("|");
  hash.update(args.branch_definition);
  hash.update("|");
  hash.update(args.agent_role);
  return hash.digest("hex").slice(0, 16);
}

// WHAT: Wire shape for a single simulation branch per
//        ADR-0076 §1.
export interface SimulationBranch {
  branch_id: string;
  branch_definition: PlaygroundBranchDefinition;
  agent_role: PlaygroundAgentRole;
  assumed_constraints: readonly PlaygroundAssumedConstraint[];
  expected_outcomes: readonly PlaygroundExpectedOutcome[];
  governance_conflicts: readonly PlaygroundGovernanceConflict[];
  branch_summary: string;
  branch_recommended_candidate_key: string;
  branch_recommended_candidate_type: PlaygroundCandidateType;
  confidence_label: PlaygroundConfidenceLabel;
}

// WHAT: Wire shape for the convergence summary per ADR-0076 §1.
export interface ConvergenceSummary {
  candidate_keys_agreed_upon: readonly string[];
  governance_findings_all_branches_share: readonly PlaygroundGovernanceFinding[];
  required_reviews_all_branches_share: readonly PlaygroundRequiredReview[];
}

// WHAT: Wire shape for the disagreement summary per ADR-0076 §1.
export interface DisagreementSummary {
  candidate_types_diverged: readonly PlaygroundCandidateType[];
  recommendation_modes_diverged: readonly PlaygroundRecommendationMode[];
  unresolved_branches: readonly string[];
}

// WHAT: Wire shape for the recommended next review per
//        ADR-0076 §1 + §7.
export interface RecommendedNextReview {
  next_review_label: PlaygroundNextReviewLabel;
  rationale_summary: string;
  applies_to_branch_ids: readonly string[];
}

// WHAT: Wire shape for the enterprise decision posture per
//        Founder enterprise-decision-output clarification
//        2026-05-31. Additive extension to ADR-0076 §1 —
//        all closed-vocab labels; NEVER raw text, NEVER
//        chain-of-thought, NEVER raw conversation content,
//        NEVER hidden scoring. Wave 9 v1 derives every field
//        from the same Wave 7 sub-invocation outputs that
//        produce the §1 SimulationBranches; no external data
//        sources at v1.
export interface EnterpriseDecisionPosture {
  // The branch_id that the simulation surfaces as the
  // strongest path FOR REVIEW. Wave 9 NEVER decides; it
  // RECOMMENDS for human review.
  primary_recommended_branch_id: string;
  // Closed-vocab reasons (inherited from Wave 7 vocab) why
  // the primary branch was favored.
  primary_recommendation_reasons: readonly PlaygroundRecommendationReason[];
  // Up to 3 viable alternative branch_ids (different
  // candidate_type or different recommendation_mode).
  viable_alternative_branch_ids: readonly string[];
  // Closed-vocab evidence labels surfacing what supported
  // the recommendation. NEVER raw evidence.
  evidence_posture: readonly PlaygroundEvidencePosture[];
  // Closed-vocab labels naming what blocks any real-world
  // action transition at the current moment.
  blockers_before_action: readonly PlaygroundBlockerBeforeAction[];
  // ONE closed-vocab safe next step.
  safe_next_step: PlaygroundSafeNextStep;
  // ADR-0078 Stage 2 — approved-source projection of safe
  // `conversation_context_signals[]`. Attached at the
  // EnterpriseDecisionPosture per ADR-0078 §9 (line 1144-1148)
  // so the scenario-wide sidecar lives in ONE place rather
  // than per-branch — preserves ADR-0076 §11 bounded counts
  // for SimulationBranch and stays inside the §8 ≤ 8 ceiling.
  // Always present; empty array when no approved-source
  // signals exist. NEVER carries raw transcript content /
  // chain-of-thought / raw correction payload / raw Action
  // payload / connector payload / secret refs.
  conversation_context_signals: readonly ConversationContextSignal[];
}

// WHAT: Body shape for POST
//        /api/v1/playground/scenarios/:id/simulations.
// INPUT: Used as a parameter type at the service boundary.
// OUTPUT: None.
// WHY: Per ADR-0076 §2: caller_confirmation REQUIRED literal
//      boolean true; optional orchestration_mode (default
//      DETERMINISTIC_BRANCH_ENUMERATION); optional
//      branch_definitions[] (closed-vocab; default per §4);
//      optional agent_roles[] (closed-vocab; default per §5);
//      optional candidate_types[] passes through to Wave 7;
//      optional max_branches (capped per §11); optional
//      comparison_mode / recommendation_mode pass through.
//      NO caller-supplied agent prompts / branch payloads /
//      scoring weights / execute / auto_approve / bypass /
//      create_action / action_id flags.
export interface SimulateInput {
  caller_confirmation?: unknown;
  orchestration_mode?: unknown;
  branch_definitions?: unknown;
  agent_roles?: unknown;
  candidate_types?: unknown;
  max_branches?: unknown;
  comparison_mode?: unknown;
  recommendation_mode?: unknown;
}

// WHAT: The unified failure code surface for the simulation
//        route. Wave 9 inherits PlaygroundScenarioFailureCode
//        verbatim (Wave 7 delegation surfaces SESSION_* /
//        OPERATION_NOT_PERMITTED / SCENARIO_NOT_FOUND /
//        INTERNAL_ERROR). INVALID_REQUEST flows through for
//        body-shape violations.
export type PlaygroundSimulationFailureCode = PlaygroundScenarioFailureCode;

export interface PlaygroundSimulationFailure {
  ok: false;
  code: PlaygroundSimulationFailureCode;
  message: string;
  invalid_fields?: readonly string[];
}

export interface SimulationSuccess {
  ok: true;
  scenario_id: string;
  simulated_at: string;
  orchestration_mode: PlaygroundOrchestrationMode;
  branch_count: number;
  branches: readonly SimulationBranch[];
  convergence_summary: ConvergenceSummary;
  disagreement_summary: DisagreementSummary;
  unresolved_questions: readonly PlaygroundUnresolvedQuestion[];
  recommended_next_review: RecommendedNextReview;
  // Enterprise decision posture (additive extension per
  // Founder clarification 2026-05-31).
  enterprise_decision_posture: EnterpriseDecisionPosture;
  human_decision_required: boolean;
  honest_note: string;
  simulation_audit_event_id: string;
}

// WHAT: Map a vNext agent_role → closed-style lens phrase
//        per ADR-0076 §5.2 + Founder paste role-behavior
//        guidance 2026-05-31.
// INPUT: A PlaygroundAgentRole.
// OUTPUT: A short noun phrase describing the role lens.
// WHY: The branch_summary uses this phrase to make the role
//      perspective legible without exposing chain-of-thought.
//      Each phrase is closed-style; NEVER raw reasoning.
function lensClauseForRole(role: PlaygroundAgentRole): string {
  switch (role) {
    case "OWNER_OPERATOR":
      return "decision-owner / accountable-party lens";
    case "POLICY_REVIEWER":
      return "policy-review lens";
    case "COMPLIANCE_REVIEWER":
      return "compliance-review lens";
    case "SECURITY_REVIEWER":
      return "security-review lens";
    case "DATA_GOVERNANCE_REVIEWER":
      return "data-governance lens";
    case "CONNECTOR_ADMIN":
      return "connector-readiness lens";
    case "ACTION_APPROVER":
      return "approval-chain lens";
    case "CUSTOMER_OR_STAKEHOLDER_ADVOCATE":
      return "customer / stakeholder-impact lens";
    case "OPERATIONS_LEAD":
      return "operational-feasibility lens";
    case "RESILIENCE_REVIEWER":
      return "operational-resilience / reversibility lens";
  }
}

// WHAT: Helper — project a Wave 7 success result + agent_role
//        lens into a single SimulationBranch's closed-vocab
//        labels per ADR-0076 §6 + §5.2 vNext.
// INPUT: Wave 7 success result + branch_definition + agent_role
//        + scenario_id + orchestration_mode.
// OUTPUT: A SimulationBranch with closed-vocab labels only.
// WHY: The agent_role acts as a lens that filters / orders
//      the closed-vocab signals that surface in
//      assumed_constraints / expected_outcomes /
//      governance_conflicts. NEVER projects raw text, raw
//      reasoning, or scenario internals.
function projectBranchFromWave7Success(args: {
  scenario_id: string;
  orchestration_mode: PlaygroundOrchestrationMode;
  branch_definition: PlaygroundBranchDefinition;
  agent_role: PlaygroundAgentRole;
  wave7: RecommendBestPathSuccess;
}): SimulationBranch {
  const branchId = computeBranchId({
    scenario_id: args.scenario_id,
    orchestration_mode: args.orchestration_mode,
    branch_definition: args.branch_definition,
    agent_role: args.agent_role,
  });

  // assumed_constraints — universal RULE 0 / ADR-0026 / ADR-0046
  // boundaries always assumed; agent_role-specific items appended.
  const assumed = new Set<PlaygroundAssumedConstraint>([
    "OWNER_COSMP_SCOPE_ONLY",
    "SAME_ORG_ONLY",
    "NO_EXTERNAL_PROVIDERS",
    "NO_CONNECTOR_INVOCATION",
    "NO_RAW_MEMORY_ACCESS",
    "NO_AUTONOMOUS_EXECUTION",
    "WAVE_8_TRANSITION_REQUIRED_BEFORE_ACTION",
    "HUMAN_REVIEW_BEFORE_FINAL_DECISION",
  ]);
  if (
    args.agent_role === "COMPLIANCE_REVIEWER" ||
    args.agent_role === "POLICY_REVIEWER" ||
    args.wave7.required_reviews.includes("LEGAL_REVIEW") ||
    args.wave7.required_reviews.includes("COMPLIANCE_REVIEW")
  ) {
    assumed.add("LEGAL_COMPLIANCE_REVIEW_WHERE_APPLICABLE");
  }
  if (
    args.wave7.blocked_by_policy === true ||
    args.branch_definition === "DO_NOT_PROCEED_PATH"
  ) {
    assumed.add("BLOCKED_CANDIDATES_NEVER_TRANSITIONABLE");
  }

  // expected_outcomes — derived from Wave 7's readiness +
  // confidence + blocked flag + agent_role lens.
  const expected = new Set<PlaygroundExpectedOutcome>();
  if (args.wave7.blocked_by_policy === true) {
    expected.add("WAVE_7_RECOMMENDATION_BLOCKED");
    expected.add("WAVE_8_TRANSITION_DECLINED_BY_POLICY");
  } else {
    expected.add("WAVE_7_RECOMMENDATION_PRODUCED");
  }
  if (args.wave7.human_decision_required === true) {
    expected.add("WAVE_7_RECOMMENDATION_REQUIRES_HUMAN_DECISION");
  }
  if (
    args.wave7.action_transition_readiness === "MAY_PROPOSE_ACTION_LATER" &&
    args.wave7.blocked_by_policy === false
  ) {
    expected.add("WAVE_8_TRANSITION_POSSIBLE_AFTER_REVIEW");
  }
  if (args.wave7.confidence_label === "INSUFFICIENT_DATA") {
    expected.add("INSUFFICIENT_DATA_REQUIRES_REVIEW");
  }
  if (
    args.agent_role === "COMPLIANCE_REVIEWER" ||
    args.wave7.required_reviews.includes("LEGAL_REVIEW") ||
    args.wave7.required_reviews.includes("COMPLIANCE_REVIEW")
  ) {
    expected.add("COMPLIANCE_REVIEW_RECOMMENDED");
  }
  if (
    args.agent_role === "RESILIENCE_REVIEWER" &&
    args.wave7.recommendation_reasons.includes(
      "STRONGEST_RESILIENCE_POSTURE",
    )
  ) {
    expected.add("OPERATIONAL_RESILIENCE_FAVORABLE");
  }
  if (args.branch_definition === "DO_NOT_PROCEED_PATH") {
    // DO_NOT_PROCEED_PATH surfaces a safe non-action posture
    // per ADR-0076 §4.2 + Founder paste branch-mapping
    // guidance. It MUST NOT create an Action and MUST NOT
    // invoke Wave 8 — the closed-vocab projection
    // communicates "do not proceed" as a review posture.
    expected.add("WAVE_7_RECOMMENDATION_REQUIRES_HUMAN_DECISION");
    expected.add("WAVE_8_TRANSITION_DECLINED_BY_POLICY");
  }

  // governance_conflicts — derived from Wave 7 closed-vocab
  // posture; agent_role lens emphasizes domain-specific
  // conflicts.
  const conflicts = new Set<PlaygroundGovernanceConflict>();
  if (args.wave7.blocked_by_policy === true) {
    conflicts.add("BRANCH_BLOCKED_BY_POLICY");
  }
  if (args.wave7.action_transition_readiness === "REQUIRES_APPROVAL_CHAIN") {
    conflicts.add("BRANCH_REQUIRES_DUAL_CONTROL");
  }
  if (
    args.wave7.action_transition_readiness ===
      "REQUIRES_LEGAL_OR_COMPLIANCE_REVIEW" ||
    args.wave7.required_reviews.includes("LEGAL_REVIEW")
  ) {
    conflicts.add("BRANCH_REQUIRES_LEGAL_REVIEW");
  }
  if (args.wave7.required_reviews.includes("COMPLIANCE_REVIEW")) {
    conflicts.add("BRANCH_REQUIRES_COMPLIANCE_REVIEW");
  }
  if (args.wave7.confidence_label === "INSUFFICIENT_DATA") {
    conflicts.add("BRANCH_INSUFFICIENT_DATA");
  }
  if (args.wave7.human_decision_required === true) {
    conflicts.add("BRANCH_HUMAN_DECISION_REQUIRED");
  }
  if (args.wave7.action_transition_readiness === "REQUIRES_HUMAN_DECISION") {
    conflicts.add("BRANCH_HUMAN_DECISION_REQUIRED");
  }
  if (args.wave7.action_transition_readiness === "REQUIRES_CONNECTOR_CAPABILITY") {
    conflicts.add("BRANCH_ACTION_RUNTIME_REQUIRED");
  }
  if (
    args.wave7.action_transition_readiness === "NOT_READY" ||
    args.wave7.action_transition_readiness === "BLOCKED" ||
    args.wave7.recommended_candidate_type === "STATUS_QUO" ||
    args.wave7.recommended_candidate_type === "DO_NOT_PROCEED" ||
    args.branch_definition === "DO_NOT_PROCEED_PATH"
  ) {
    conflicts.add("BRANCH_NO_TRANSITION_POSSIBLE");
  }
  if (conflicts.size === 0) {
    conflicts.add("NO_NOTABLE_CONFLICT");
  }

  // branch_summary — closed-style ≤600 chars. NEVER raw
  // reasoning; closed-vocab labels only. Lens phrasing per
  // ADR-0076 §5.2 vNext role discipline + Founder paste
  // role-behavior guidance. Roles are simulation LENSES,
  // NEVER independent authorities.
  const lensClause = lensClauseForRole(args.agent_role);
  const summary =
    `Branch ${args.branch_definition} viewed through the ${lensClause} ` +
    `surfaced ${args.wave7.recommended_candidate_type} as the recommended ` +
    `candidate (mode=${args.wave7.recommendation_mode}, ` +
    `readiness=${args.wave7.action_transition_readiness}, ` +
    `confidence=${args.wave7.confidence_label}). ` +
    `Human / governance review required before any real-world action.`;

  return {
    branch_id: branchId,
    branch_definition: args.branch_definition,
    agent_role: args.agent_role,
    assumed_constraints: [...assumed].slice(
      0,
      ASSUMED_CONSTRAINTS_PER_BRANCH_MAX,
    ),
    expected_outcomes: [...expected].slice(
      0,
      EXPECTED_OUTCOMES_PER_BRANCH_MAX,
    ),
    governance_conflicts: [...conflicts].slice(
      0,
      GOVERNANCE_CONFLICTS_PER_BRANCH_MAX,
    ),
    branch_summary: summary.slice(0, BRANCH_SUMMARY_MAX_CHARS),
    branch_recommended_candidate_key: args.wave7.recommended_candidate_key,
    branch_recommended_candidate_type: args.wave7.recommended_candidate_type,
    confidence_label: args.wave7.confidence_label,
  };
}

// WHAT: Compute the convergence_summary per ADR-0076 §1.
//        candidate_keys_agreed_upon = intersection across all
//        branches; governance_findings_all_branches_share +
//        required_reviews_all_branches_share = same.
function computeConvergence(args: {
  branches: SimulationBranch[];
  wave7Results: RecommendBestPathSuccess[];
}): ConvergenceSummary {
  if (args.branches.length === 0 || args.wave7Results.length === 0) {
    return {
      candidate_keys_agreed_upon: [],
      governance_findings_all_branches_share: [],
      required_reviews_all_branches_share: [],
    };
  }
  // candidate_keys agreed upon: keys that appear in every
  // branch's recommended_candidate_key. With one recommendation
  // per branch, this is the set of keys that are recommended
  // by EVERY branch (i.e., a key shared in all 24 branches).
  const keyCounts = new Map<string, number>();
  for (const b of args.branches) {
    keyCounts.set(
      b.branch_recommended_candidate_key,
      (keyCounts.get(b.branch_recommended_candidate_key) ?? 0) + 1,
    );
  }
  const agreedKeys: string[] = [];
  for (const [key, count] of keyCounts) {
    if (count === args.branches.length) agreedKeys.push(key);
  }
  agreedKeys.sort();

  // governance_findings intersection across Wave 7 results.
  const governanceShared = intersectArrays(
    args.wave7Results.map((r) => r.governance_findings),
  ) as PlaygroundGovernanceFinding[];

  // required_reviews intersection across Wave 7 results.
  const reviewsShared = intersectArrays(
    args.wave7Results.map((r) => r.required_reviews),
  ) as PlaygroundRequiredReview[];

  return {
    candidate_keys_agreed_upon: agreedKeys,
    governance_findings_all_branches_share: governanceShared,
    required_reviews_all_branches_share: reviewsShared,
  };
}

// WHAT: Intersect N readonly arrays of string-like items
//        preserving the first array's ordering.
function intersectArrays<T extends string>(
  arrays: readonly (readonly T[])[],
): T[] {
  if (arrays.length === 0) return [];
  const first = arrays[0];
  if (first === undefined) return [];
  const result: T[] = [];
  for (const item of first) {
    let inAll = true;
    for (let i = 1; i < arrays.length; i++) {
      const a = arrays[i];
      if (a === undefined || !a.includes(item)) {
        inAll = false;
        break;
      }
    }
    if (inAll && !result.includes(item)) {
      result.push(item);
    }
  }
  return result;
}

// WHAT: Compute the disagreement_summary per ADR-0076 §1.
function computeDisagreement(args: {
  branches: SimulationBranch[];
  wave7Results: RecommendBestPathSuccess[];
}): DisagreementSummary {
  const candidateTypes = new Set<PlaygroundCandidateType>();
  for (const b of args.branches) {
    candidateTypes.add(b.branch_recommended_candidate_type);
  }
  const recommendationModes = new Set<PlaygroundRecommendationMode>();
  for (const r of args.wave7Results) {
    recommendationModes.add(r.recommendation_mode);
  }
  // unresolved_branches: branches whose closed-vocab posture
  // surfaces an unresolved governance conflict (anything
  // other than NO_NOTABLE_CONFLICT, OR confidence
  // INSUFFICIENT_DATA, OR human_decision_required at the
  // Wave 7 result).
  const unresolved: string[] = [];
  for (let i = 0; i < args.branches.length; i++) {
    const b = args.branches[i];
    const r = args.wave7Results[i];
    if (b === undefined || r === undefined) continue;
    const hasReal = b.governance_conflicts.some(
      (c) => c !== "NO_NOTABLE_CONFLICT",
    );
    if (
      hasReal ||
      b.confidence_label === "INSUFFICIENT_DATA" ||
      r.human_decision_required === true
    ) {
      unresolved.push(b.branch_id);
    }
  }
  return {
    candidate_types_diverged: [...candidateTypes].sort() as PlaygroundCandidateType[],
    recommendation_modes_diverged: [...recommendationModes].sort() as PlaygroundRecommendationMode[],
    unresolved_branches: unresolved,
  };
}

// WHAT: Compute the closed-vocab unresolved_questions list per
//        ADR-0076 §1 + §6.4.
function computeUnresolvedQuestions(args: {
  branches: SimulationBranch[];
  wave7Results: RecommendBestPathSuccess[];
  disagreement: DisagreementSummary;
}): PlaygroundUnresolvedQuestion[] {
  const out = new Set<PlaygroundUnresolvedQuestion>();
  if (args.disagreement.candidate_types_diverged.length > 1) {
    out.add("WHICH_CANDIDATE_TYPE_TO_RECOMMEND");
  }
  if (
    args.branches.some((b) => b.confidence_label === "INSUFFICIENT_DATA")
  ) {
    out.add("WHETHER_TO_PROCEED_GIVEN_INSUFFICIENT_DATA");
  }
  if (
    args.branches.some((b) =>
      b.governance_conflicts.includes("BRANCH_REQUIRES_LEGAL_REVIEW"),
    )
  ) {
    out.add("WHETHER_LEGAL_REVIEW_IS_REQUIRED");
  }
  if (
    args.branches.some((b) =>
      b.governance_conflicts.includes("BRANCH_REQUIRES_COMPLIANCE_REVIEW"),
    ) ||
    args.branches.some((b) =>
      b.governance_conflicts.includes("BRANCH_REQUIRES_LEGAL_REVIEW"),
    )
  ) {
    out.add("WHETHER_GOVERNANCE_REVIEW_IS_SUFFICIENT");
  }
  if (
    args.branches.some((b) =>
      b.governance_conflicts.includes("BRANCH_REQUIRES_DUAL_CONTROL"),
    )
  ) {
    out.add("WHETHER_DUAL_CONTROL_IS_REQUIRED");
  }
  if (
    args.branches.some((b) =>
      b.governance_conflicts.includes("BRANCH_BLOCKED_BY_POLICY"),
    ) ||
    args.branches.some((b) =>
      b.governance_conflicts.includes("BRANCH_NO_TRANSITION_POSSIBLE"),
    )
  ) {
    out.add("WHETHER_TO_BLOCK_OR_PROCEED");
  }
  if (
    args.branches.some((b) =>
      b.governance_conflicts.includes("BRANCH_HUMAN_DECISION_REQUIRED"),
    )
  ) {
    out.add("WHETHER_HUMAN_REVIEWER_IS_AVAILABLE");
  }
  if (out.size === 0) {
    out.add("NO_UNRESOLVED_QUESTIONS_IDENTIFIED");
  }
  return [...out].slice(0, UNRESOLVED_QUESTIONS_PER_RESPONSE_MAX);
}

// WHAT: Compute recommended_next_review per ADR-0076 §1 + §7
//        priority ladder.
function computeRecommendedNextReview(args: {
  branches: SimulationBranch[];
  wave7Results: RecommendBestPathSuccess[];
  unresolved_questions: readonly PlaygroundUnresolvedQuestion[];
  disagreement: DisagreementSummary;
}): RecommendedNextReview {
  const branchesNeedingLegal = args.branches.filter((b) =>
    b.governance_conflicts.includes("BRANCH_REQUIRES_LEGAL_REVIEW"),
  );
  const branchesNeedingCompliance = args.branches.filter((b) =>
    b.governance_conflicts.includes("BRANCH_REQUIRES_COMPLIANCE_REVIEW"),
  );
  const branchesBlocked = args.branches.filter((b) =>
    b.governance_conflicts.includes("BRANCH_BLOCKED_BY_POLICY"),
  );
  const branchesNeedingHuman = args.branches.filter((b) =>
    b.governance_conflicts.includes("BRANCH_HUMAN_DECISION_REQUIRED"),
  );
  const branchesInsufficient = args.branches.filter(
    (b) => b.confidence_label === "INSUFFICIENT_DATA",
  );
  const branchesResilience = args.branches.filter((b) =>
    b.expected_outcomes.includes("OPERATIONAL_RESILIENCE_FAVORABLE"),
  );

  let label: PlaygroundNextReviewLabel;
  let appliesTo: string[];
  let rationale: string;

  if (branchesNeedingLegal.length > 0) {
    label = "LEGAL_REVIEW";
    appliesTo = branchesNeedingLegal.map((b) => b.branch_id);
    rationale =
      `At least one branch surfaced BRANCH_REQUIRES_LEGAL_REVIEW; ` +
      `legal review is recommended before any action transition.`;
  } else if (branchesNeedingCompliance.length > 0) {
    label = "COMPLIANCE_REVIEW";
    appliesTo = branchesNeedingCompliance.map((b) => b.branch_id);
    rationale =
      `At least one branch surfaced BRANCH_REQUIRES_COMPLIANCE_REVIEW; ` +
      `compliance review is recommended before any action transition.`;
  } else if (branchesBlocked.length > 0) {
    label = "POLICY_OWNER_REVIEW";
    appliesTo = branchesBlocked.map((b) => b.branch_id);
    rationale =
      `At least one branch is BRANCH_BLOCKED_BY_POLICY; ` +
      `policy-owner review is recommended.`;
  } else if (
    args.disagreement.candidate_types_diverged.length > 1 ||
    branchesNeedingHuman.length > 0
  ) {
    label = "HUMAN_GOVERNANCE_REVIEW";
    appliesTo = (
      branchesNeedingHuman.length > 0
        ? branchesNeedingHuman
        : args.branches
    ).map((b) => b.branch_id);
    rationale =
      `Branches diverge on candidate_type or require human ` +
      `decision; human / governance review is recommended.`;
  } else if (branchesInsufficient.length > 0) {
    label = "DATA_GOVERNANCE_REVIEW";
    appliesTo = branchesInsufficient.map((b) => b.branch_id);
    rationale =
      `At least one branch surfaced INSUFFICIENT_DATA confidence; ` +
      `data governance review is recommended.`;
  } else if (branchesResilience.length > 0 && branchesResilience.length < args.branches.length) {
    label = "OPERATIONAL_RESILIENCE_REVIEW";
    appliesTo = branchesResilience.map((b) => b.branch_id);
    rationale =
      `Some branches surfaced OPERATIONAL_RESILIENCE_FAVORABLE; ` +
      `operational resilience review is recommended.`;
  } else if (args.disagreement.recommendation_modes_diverged.length > 1) {
    label = "RERUN_WITH_DIFFERENT_RECOMMENDATION_MODE";
    appliesTo = args.branches.map((b) => b.branch_id);
    rationale =
      `Recommendation modes diverged; rerunning with a different ` +
      `recommendation_mode may surface additional signals.`;
  } else {
    label = "NO_FURTHER_REVIEW_IDENTIFIED";
    appliesTo = [];
    rationale =
      `All branches converge on the recommendation; ` +
      `no further review identified beyond standard governance.`;
  }

  return {
    next_review_label: label,
    rationale_summary: rationale.slice(0, RATIONALE_SUMMARY_MAX_CHARS),
    applies_to_branch_ids: appliesTo,
  };
}

// WHAT: Compute the EnterpriseDecisionPosture per Founder
//        enterprise-decision-output clarification 2026-05-31.
// INPUT: branches + wave7Results + recommendedNextReview.
// OUTPUT: An EnterpriseDecisionPosture with closed-vocab
//         labels only.
// WHY: Surfaces the enterprise decision-output framing —
//      one primary recommended path for review, 2-3
//      transparent alternatives, evidence posture, blockers,
//      safe next step — WITHOUT executing, WITHOUT bypassing
//      Wave 8 / Section 2, and WITHOUT exposing raw evidence
//      content. All values are closed-vocab labels derived
//      from the same Wave 7 sub-invocation outputs at v1.
function computeEnterpriseDecisionPosture(args: {
  branches: SimulationBranch[];
  wave7Results: RecommendBestPathSuccess[];
  nextReview: RecommendedNextReview;
  anyFailure: boolean;
  conversation_context_signals: readonly ConversationContextSignal[];
}): EnterpriseDecisionPosture {
  // 1. Primary branch — prefer:
  //    (a) a non-failure branch whose Wave 7 result is the
  //        safest action_transition_readiness (NOT BLOCKED,
  //        NOT REQUIRES_HUMAN_DECISION, NOT NOT_READY) +
  //        non-policy-blocked + non-INSUFFICIENT_DATA;
  //    (b) else: a HUMAN_REVIEW_REQUIRED or HUMAN_REVIEW
  //        candidate;
  //    (c) else: the first branch by branch_id lexical (safe
  //        deterministic tiebreak).
  // Map each branch to its corresponding wave7 success (if
  // any). We rebuild the map by branch ordering since both
  // arrays are produced from the same combinations list.
  const branchToWave7 = new Map<string, RecommendBestPathSuccess>();
  // Reconstruct via branch ordering: branches[] is appended
  // in the same combinations order as wave7Successes[], but
  // wave7Successes only contains successes. Re-map by
  // (branch_definition, agent_role) tuple from each Wave 7
  // result's recommendation_mode + scenario_id — but
  // recommendation_mode + scenario_id alone do not uniquely
  // identify a branch (multiple roles share the same mode).
  // Instead, walk both arrays in parallel using the
  // simulation's invariant that branches[] preserves
  // combination order: indices align — wave7Successes[i]
  // belongs to the i-th branch IF that branch did not fail.
  // Track separately via a fail mask: we tracked failures by
  // having wave7Successes shorter than branches when at
  // least one fail, but ordering may diverge. Safest: store
  // an explicit alignment in computeEnterpriseDecisionPosture
  // by carrying a list of {branch, wave7|null} pairs.
  // For this v1 implementation, we re-derive the alignment
  // by re-matching wave7Results to branches by
  // recommendation_mode + the order of appearance:
  // build a queue of wave7Results and pop the front for each
  // non-failure branch in order. A branch is a failure if
  // its recommended_candidate_key === "" (sentinel set by
  // the failure projection).
  const wave7Queue = [...args.wave7Results];
  for (const b of args.branches) {
    if (b.branch_recommended_candidate_key === "") continue;
    const head = wave7Queue.shift();
    if (head !== undefined) {
      branchToWave7.set(b.branch_id, head);
    }
  }

  const isSafePrimary = (b: SimulationBranch): boolean => {
    if (b.branch_recommended_candidate_key === "") return false;
    if (b.confidence_label === "INSUFFICIENT_DATA") return false;
    const w = branchToWave7.get(b.branch_id);
    if (w === undefined) return false;
    if (w.blocked_by_policy === true) return false;
    if (
      w.action_transition_readiness === "BLOCKED" ||
      w.action_transition_readiness === "NOT_READY"
    ) {
      return false;
    }
    return true;
  };

  let primary: SimulationBranch | undefined = args.branches
    .filter(isSafePrimary)
    .sort((a, b) => a.branch_id.localeCompare(b.branch_id))[0];
  if (primary === undefined) {
    primary =
      args.branches.find(
        (b) =>
          b.branch_recommended_candidate_type === "HUMAN_REVIEW_REQUIRED" &&
          b.branch_recommended_candidate_key !== "",
      ) ??
      args.branches
        .filter((b) => b.branch_recommended_candidate_key !== "")
        .sort((a, b) => a.branch_id.localeCompare(b.branch_id))[0] ??
      args.branches
        .slice()
        .sort((a, b) => a.branch_id.localeCompare(b.branch_id))[0];
  }
  // Defensive: branches[] cannot be empty (we validated
  // combinations.length > 0 above), but keep a fallback.
  if (primary === undefined) {
    return {
      primary_recommended_branch_id: "",
      primary_recommendation_reasons: [],
      viable_alternative_branch_ids: [],
      evidence_posture: ["INSUFFICIENT_CONTEXT"],
      blockers_before_action: ["INSUFFICIENT_DATA"],
      safe_next_step: "DO_NOT_PROCEED",
      conversation_context_signals: args.conversation_context_signals,
    };
  }

  const primaryWave7 = branchToWave7.get(primary.branch_id);

  // 2. primary_recommendation_reasons — inherit Wave 7
  //    recommendation_reasons from the primary branch's
  //    sub-invocation.
  const primaryReasons: readonly PlaygroundRecommendationReason[] =
    primaryWave7 !== undefined ? primaryWave7.recommendation_reasons : [];

  // 3. Viable alternatives — up to 3 branches with a
  //    different candidate_type OR a different
  //    recommendation_mode than the primary, excluding the
  //    primary itself. Failures excluded.
  const alternatives: string[] = [];
  const seenTypes = new Set<string>([
    primary.branch_recommended_candidate_type,
  ]);
  for (const b of args.branches) {
    if (alternatives.length >= 3) break;
    if (b.branch_id === primary.branch_id) continue;
    if (b.branch_recommended_candidate_key === "") continue;
    if (seenTypes.has(b.branch_recommended_candidate_type)) continue;
    alternatives.push(b.branch_id);
    seenTypes.add(b.branch_recommended_candidate_type);
  }

  // 4. evidence_posture — closed-vocab labels surfacing what
  //    supported the recommendation. v1 derives from Wave 7
  //    outputs only.
  const evidence = new Set<PlaygroundEvidencePosture>();
  if (primaryWave7 !== undefined) {
    if (primaryWave7.blocked_by_policy === false) {
      evidence.add("POLICY_SUPPORTS_PATH");
    }
    if (
      primaryWave7.action_transition_readiness ===
      "REQUIRES_CONNECTOR_CAPABILITY"
    ) {
      // Connector readiness signal is present (REQUIRES means
      // the readiness is gated, not absent); future Wave 9
      // amendments may distinguish.
      evidence.add("CONNECTOR_READINESS_SUPPORTS_PATH");
    }
    if (primaryWave7.required_reviews.includes("COMPLIANCE_REVIEW")) {
      evidence.add("COMPLIANCE_REVIEW_REQUIRED");
    }
    if (primaryWave7.required_reviews.includes("LEGAL_REVIEW")) {
      evidence.add("LEGAL_REVIEW_REQUIRED");
    }
    if (primaryWave7.confidence_label === "INSUFFICIENT_DATA") {
      evidence.add("INSUFFICIENT_CONTEXT");
    }
  } else {
    evidence.add("INSUFFICIENT_CONTEXT");
  }
  // Divergence across branches → conflicting signals.
  const distinctTypes = new Set(
    args.branches
      .filter((b) => b.branch_recommended_candidate_key !== "")
      .map((b) => b.branch_recommended_candidate_type),
  );
  if (distinctTypes.size > 1) {
    evidence.add("CONFLICTING_SIGNALS");
  }
  // Audit-history signal: every Wave 7 sub-invocation emitted
  // its own audit row per ADR-0074 §14 — the Wave 9 audit
  // trail is itself evidence that the simulation considered
  // governed paths.
  evidence.add("AUDIT_HISTORY_SUPPORTS_PATH");
  // If primary requires human decision OR there is any
  // unresolved authority signal (next_review label is
  // HUMAN_GOVERNANCE_REVIEW / POLICY_OWNER_REVIEW), mark
  // AUTHORITY_CHAIN_UNCLEAR.
  if (
    (primaryWave7 !== undefined &&
      primaryWave7.human_decision_required === true) ||
    args.nextReview.next_review_label === "HUMAN_GOVERNANCE_REVIEW" ||
    args.nextReview.next_review_label === "POLICY_OWNER_REVIEW"
  ) {
    evidence.add("AUTHORITY_CHAIN_UNCLEAR");
  }
  if (evidence.size === 0) {
    evidence.add("INSUFFICIENT_CONTEXT");
  }

  // 5. blockers_before_action — closed-vocab labels for what
  //    blocks any real-world transition at the current
  //    moment.
  const blockers = new Set<PlaygroundBlockerBeforeAction>();
  if (primaryWave7 !== undefined) {
    if (primaryWave7.blocked_by_policy === true) {
      blockers.add("POLICY_BLOCKS_ACTION");
    }
    if (primaryWave7.required_reviews.includes("COMPLIANCE_REVIEW")) {
      blockers.add("MISSING_COMPLIANCE_REVIEW");
    }
    if (primaryWave7.required_reviews.includes("LEGAL_REVIEW")) {
      blockers.add("MISSING_LEGAL_REVIEW");
    }
    if (
      primaryWave7.action_transition_readiness === "REQUIRES_APPROVAL_CHAIN"
    ) {
      blockers.add("MISSING_DUAL_CONTROL_APPROVAL");
    }
    if (primaryWave7.human_decision_required === true) {
      blockers.add("MISSING_HUMAN_DECISION");
    }
    if (primaryWave7.confidence_label === "INSUFFICIENT_DATA") {
      blockers.add("INSUFFICIENT_DATA");
    }
    if (
      primaryWave7.action_transition_readiness ===
      "REQUIRES_CONNECTOR_CAPABILITY"
    ) {
      blockers.add("CONNECTOR_UNAVAILABLE");
    }
    if (
      primaryWave7.action_transition_readiness === "BLOCKED" ||
      primaryWave7.action_transition_readiness === "NOT_READY" ||
      primaryWave7.recommended_candidate_type === "STATUS_QUO" ||
      primaryWave7.recommended_candidate_type === "DO_NOT_PROCEED"
    ) {
      blockers.add("NO_TRANSITION_POSSIBLE");
    }
  } else {
    blockers.add("INSUFFICIENT_DATA");
    blockers.add("NO_TRANSITION_POSSIBLE");
  }
  if (
    args.nextReview.next_review_label === "HUMAN_GOVERNANCE_REVIEW" ||
    args.nextReview.next_review_label === "POLICY_OWNER_REVIEW"
  ) {
    blockers.add("AUTHORITY_CHAIN_UNCLEAR");
  }
  if (blockers.size === 0) {
    blockers.add("NO_KNOWN_BLOCKER");
  }

  // 6. safe_next_step — derive priority ladder.
  let nextStep: PlaygroundSafeNextStep;
  if (blockers.has("MISSING_LEGAL_REVIEW")) {
    nextStep = "REQUEST_LEGAL_REVIEW";
  } else if (blockers.has("MISSING_COMPLIANCE_REVIEW")) {
    nextStep = "REQUEST_COMPLIANCE_REVIEW";
  } else if (
    blockers.has("MISSING_DUAL_CONTROL_APPROVAL") ||
    blockers.has("AUTHORITY_CHAIN_UNCLEAR")
  ) {
    nextStep = "REQUEST_APPROVAL_CHAIN";
  } else if (
    blockers.has("INSUFFICIENT_DATA") ||
    blockers.has("CONNECTOR_UNAVAILABLE")
  ) {
    nextStep = "REQUEST_MISSING_CONTEXT";
  } else if (
    blockers.has("POLICY_BLOCKS_ACTION") ||
    blockers.has("NO_TRANSITION_POSSIBLE")
  ) {
    nextStep = "DO_NOT_PROCEED";
  } else if (
    blockers.has("MISSING_HUMAN_DECISION") ||
    blockers.size > 0 // any remaining blocker → human review
  ) {
    nextStep = "PROCEED_TO_HUMAN_REVIEW";
  } else {
    // No blockers other than NO_KNOWN_BLOCKER → safe to
    // propose a governed action via Wave 8. Wave 9 NEVER
    // creates the Action itself; it RECOMMENDS the next step.
    nextStep = "PROPOSE_GOVERNED_ACTION";
  }

  return {
    primary_recommended_branch_id: primary.branch_id,
    primary_recommendation_reasons: primaryReasons,
    viable_alternative_branch_ids: alternatives,
    evidence_posture: [...evidence].sort() as PlaygroundEvidencePosture[],
    blockers_before_action: [...blockers].sort() as PlaygroundBlockerBeforeAction[],
    safe_next_step: nextStep,
    conversation_context_signals: args.conversation_context_signals,
  };
}

// WHAT: Vary the comparison_mode per branch index for
//        DETERMINISTIC_CONSTRAINT_VARIATION orchestration mode
//        per ADR-0076 §3.
function comparisonModeForCombination(args: {
  orchestration_mode: PlaygroundOrchestrationMode;
  base_comparison_mode: PlaygroundComparisonMode;
  branch_index: number;
}): PlaygroundComparisonMode {
  if (args.orchestration_mode === "DETERMINISTIC_CONSTRAINT_VARIATION") {
    return args.branch_index % 2 === 0
      ? "DETERMINISTIC_RUBRIC"
      : "CANDIDATE_FIELD_PROJECTION";
  }
  return args.base_comparison_mode;
}

// WHAT: The Agent Playground Wave 9 Option A deterministic
//        multi-agent simulation orchestration service.
// INPUT: PlaygroundBestPathRecommendationService (for
//        internal Wave 7 invocation per ADR-0076 §9) +
//        PlaygroundScenarioService (for owner attribution
//        on the Wave 9 simulation audit row).
// OUTPUT: A single method `simulate`.
// WHY: Single class so future Wave 10 frontends + future Wave
//      9 Option C BEAM-orchestrated implementations can
//      compose against a stable interface. The service
//      enforces: (1) auth + owner-first + same-org via Wave 7
//      → Wave 6 → Wave 5 → Wave 4 delegation; (2) closed-vocab
//      body validation incl. mandatory caller_confirmation +
//      bounded (branch × role) ≤ 24 per ADR-0076 §11; (3)
//      sequential Promise.allSettled Wave 7 sub-invocation
//      fan-out per ADR-0076 §12 + §15.1; (4) closed-vocab
//      projection through agent_role lens per §5 + §6; (5)
//      single ADMIN_ACTION + details.action audit row per §14
//      with safe metadata only. NO Action creation. NO Wave 8
//      invocation. NO connector / LLM / Python / BEAM at v1.
export class PlaygroundSimulationService {
  constructor(
    private readonly recommendations: PlaygroundBestPathRecommendationService,
    private readonly scenarios: PlaygroundScenarioService,
    private readonly conversationContextSignals: ConversationContextSignalProjectionServiceLike,
  ) {}

  // WHAT: Simulate a multi-agent exploration for a stored
  //        scenario per ADR-0076.
  async simulate(
    sessionToken: string,
    scenarioId: string,
    body: SimulateInput,
    context: { ip_address?: string | null } = {},
  ): Promise<SimulationSuccess | PlaygroundSimulationFailure> {
    // 1. Body validation — closed-vocab + mandatory fields.
    const invalidFields: string[] = [];

    // caller_confirmation MUST be literal boolean true per
    // ADR-0076 §2.
    if (body.caller_confirmation !== true) {
      invalidFields.push("caller_confirmation");
    }

    // orchestration_mode — optional, default
    // DETERMINISTIC_BRANCH_ENUMERATION.
    let orchestrationMode: PlaygroundOrchestrationMode =
      "DETERMINISTIC_BRANCH_ENUMERATION";
    if (body.orchestration_mode !== undefined) {
      if (!isOrchestrationMode(body.orchestration_mode)) {
        invalidFields.push("orchestration_mode");
      } else {
        orchestrationMode = body.orchestration_mode;
      }
    }

    // branch_definitions — optional closed-vocab array.
    let branchDefinitions: readonly PlaygroundBranchDefinition[] =
      DEFAULT_BRANCH_DEFINITIONS;
    if (body.branch_definitions !== undefined) {
      if (!Array.isArray(body.branch_definitions)) {
        invalidFields.push("branch_definitions");
      } else if (body.branch_definitions.length === 0) {
        invalidFields.push("branch_definitions");
      } else {
        const collected: PlaygroundBranchDefinition[] = [];
        for (const raw of body.branch_definitions) {
          if (!isBranchDefinition(raw)) {
            invalidFields.push("branch_definitions");
            break;
          }
          if (!collected.includes(raw)) collected.push(raw);
        }
        if (!invalidFields.includes("branch_definitions")) {
          branchDefinitions = collected;
        }
      }
    }

    // agent_roles — optional closed-vocab array.
    let agentRoles: readonly PlaygroundAgentRole[] = DEFAULT_AGENT_ROLES;
    if (body.agent_roles !== undefined) {
      if (!Array.isArray(body.agent_roles)) {
        invalidFields.push("agent_roles");
      } else if (body.agent_roles.length === 0) {
        invalidFields.push("agent_roles");
      } else {
        const collected: PlaygroundAgentRole[] = [];
        for (const raw of body.agent_roles) {
          if (!isAgentRole(raw)) {
            invalidFields.push("agent_roles");
            break;
          }
          if (!collected.includes(raw)) collected.push(raw);
        }
        if (!invalidFields.includes("agent_roles")) {
          agentRoles = collected;
        }
      }
    }

    // candidate_types — passes through to Wave 7. Validate
    // shape + closed-vocab here so the failure surfaces
    // before any sub-invocation runs.
    if (body.candidate_types !== undefined) {
      if (!Array.isArray(body.candidate_types)) {
        invalidFields.push("candidate_types");
      } else {
        for (const t of body.candidate_types) {
          if (!isCandidateType(t)) {
            invalidFields.push("candidate_types");
            break;
          }
        }
      }
    }

    // max_branches — optional integer in (0, 24].
    let maxBranches = BRANCHES_PER_RESPONSE_MAX;
    if (body.max_branches !== undefined) {
      const raw = body.max_branches;
      if (
        typeof raw !== "number" ||
        !Number.isFinite(raw) ||
        !Number.isInteger(raw) ||
        raw <= 0 ||
        raw > BRANCHES_PER_RESPONSE_MAX
      ) {
        invalidFields.push("max_branches");
      } else {
        maxBranches = raw;
      }
    }

    let baseComparisonMode: PlaygroundComparisonMode = "DETERMINISTIC_RUBRIC";
    if (body.comparison_mode !== undefined) {
      if (!isComparisonMode(body.comparison_mode)) {
        invalidFields.push("comparison_mode");
      } else {
        baseComparisonMode = body.comparison_mode;
      }
    }

    if (
      body.recommendation_mode !== undefined &&
      !isRecommendationMode(body.recommendation_mode)
    ) {
      invalidFields.push("recommendation_mode");
    }

    if (invalidFields.length > 0) {
      return {
        ok: false,
        code: "INVALID_REQUEST",
        message: "One or more body fields are invalid",
        invalid_fields: invalidFields,
      };
    }

    // 2. Enumerate (branch_definition × agent_role)
    //    combinations. Bounded — reject when the product
    //    exceeds the ADR-0076 §11 ceiling OR the caller's
    //    max_branches.
    const combinations: Array<{
      branch_definition: PlaygroundBranchDefinition;
      agent_role: PlaygroundAgentRole;
    }> = [];
    for (const bd of branchDefinitions) {
      for (const ar of agentRoles) {
        combinations.push({ branch_definition: bd, agent_role: ar });
      }
    }
    if (combinations.length === 0) {
      return {
        ok: false,
        code: "INVALID_REQUEST",
        message:
          "branch_definitions × agent_roles produced zero combinations",
        invalid_fields: ["branch_definitions", "agent_roles"],
      };
    }
    if (combinations.length > maxBranches) {
      return {
        ok: false,
        code: "INVALID_REQUEST",
        message:
          `branch_definitions × agent_roles (${combinations.length}) exceeds ` +
          `max_branches (${maxBranches}); cap is ${BRANCHES_PER_RESPONSE_MAX}`,
        invalid_fields: ["max_branches"],
      };
    }

    // 3. Look up the scenario owner for audit attribution.
    //    Wave 7 will re-validate session + owner-first scope
    //    on each sub-invocation; this lookup is for the Wave
    //    9 audit row + early enumeration-safe 404 surface
    //    when the scenario does not exist OR is cross-owner.
    const scenarioLookup = await this.scenarios.getScenario(
      sessionToken,
      scenarioId,
    );
    if (scenarioLookup.ok === false) {
      return scenarioLookup;
    }
    const ownerEntityId = scenarioLookup.scenario.owner_entity_id;
    const resolvedScenarioId = scenarioLookup.scenario.scenario_id;

    // 4. Sequential Promise.allSettled over Wave 7
    //    sub-invocations per ADR-0076 §12 + §15.1.
    const subInvocations = combinations.map((combo, index) => {
      const recommendationMode = recommendationModeForBranch(
        combo.branch_definition,
      );
      const comparisonMode = comparisonModeForCombination({
        orchestration_mode: orchestrationMode,
        base_comparison_mode: baseComparisonMode,
        branch_index: index,
      });
      const input: RecommendBestPathInput = {
        recommendation_mode: recommendationMode,
        comparison_mode: comparisonMode,
      };
      if (body.candidate_types !== undefined) {
        input.candidate_types = body.candidate_types;
      }
      return this.recommendations.recommendBestPath(
        sessionToken,
        resolvedScenarioId,
        input,
        { ip_address: context.ip_address ?? null },
      );
    });
    const settled = await Promise.allSettled(subInvocations);

    // 5. Project results — each fulfilled Wave 7 success →
    //    SimulationBranch; rejections / Wave 7 failures
    //    project a closed-vocab BRANCH_NO_TRANSITION_POSSIBLE
    //    + INSUFFICIENT_DATA branch per ADR-0076 §12 fault-
    //    isolation guarantee.
    const branches: SimulationBranch[] = [];
    const wave7Successes: RecommendBestPathSuccess[] = [];
    for (let i = 0; i < settled.length; i++) {
      const combo = combinations[i];
      const result = settled[i];
      if (combo === undefined || result === undefined) continue;
      if (result.status === "fulfilled" && result.value.ok === true) {
        const wave7 = result.value;
        wave7Successes.push(wave7);
        branches.push(
          projectBranchFromWave7Success({
            scenario_id: resolvedScenarioId,
            orchestration_mode: orchestrationMode,
            branch_definition: combo.branch_definition,
            agent_role: combo.agent_role,
            wave7,
          }),
        );
      } else {
        // Branch failure — project a SAFE no-transition
        // branch with closed-vocab labels only. NEVER
        // surfaces the underlying error message / stack
        // trace per ADR-0076 §8 no-leak boundary.
        const branchId = computeBranchId({
          scenario_id: resolvedScenarioId,
          orchestration_mode: orchestrationMode,
          branch_definition: combo.branch_definition,
          agent_role: combo.agent_role,
        });
        branches.push({
          branch_id: branchId,
          branch_definition: combo.branch_definition,
          agent_role: combo.agent_role,
          assumed_constraints: [
            "OWNER_COSMP_SCOPE_ONLY",
            "SAME_ORG_ONLY",
            "NO_EXTERNAL_PROVIDERS",
            "NO_CONNECTOR_INVOCATION",
            "NO_RAW_MEMORY_ACCESS",
            "NO_AUTONOMOUS_EXECUTION",
            "WAVE_8_TRANSITION_REQUIRED_BEFORE_ACTION",
            "HUMAN_REVIEW_BEFORE_FINAL_DECISION",
          ],
          expected_outcomes: ["INSUFFICIENT_DATA_REQUIRES_REVIEW"],
          governance_conflicts: [
            "BRANCH_INSUFFICIENT_DATA",
            "BRANCH_NO_TRANSITION_POSSIBLE",
          ],
          branch_summary:
            `Branch ${combo.branch_definition} viewed through the ` +
            `${combo.agent_role} lens could not produce a Wave 7 ` +
            `recommendation; safe-by-construction projection treats ` +
            `the branch as insufficient-data + non-transitionable.`,
          branch_recommended_candidate_key: "",
          branch_recommended_candidate_type: "HUMAN_REVIEW_REQUIRED",
          confidence_label: "INSUFFICIENT_DATA",
        });
      }
    }

    // 6. Compute convergence + disagreement + unresolved +
    //    recommended_next_review summaries.
    const convergence = computeConvergence({
      branches,
      wave7Results: wave7Successes,
    });
    const disagreement = computeDisagreement({
      branches,
      wave7Results: wave7Successes,
    });
    const unresolvedQuestions = computeUnresolvedQuestions({
      branches,
      wave7Results: wave7Successes,
      disagreement,
    });
    const nextReview = computeRecommendedNextReview({
      branches,
      wave7Results: wave7Successes,
      unresolved_questions: unresolvedQuestions,
      disagreement,
    });

    // 7. human_decision_required — conservative posture per
    //    ADR-0076 §1: TRUE whenever ANY branch's Wave 7 result
    //    required human decision OR ANY branch surfaces a
    //    governance conflict beyond NO_NOTABLE_CONFLICT OR
    //    branches diverge on candidate_type OR a branch
    //    failed sub-invocation.
    const anyHumanDecision = wave7Successes.some(
      (r) => r.human_decision_required === true,
    );
    const anyConflict = branches.some((b) =>
      b.governance_conflicts.some((c) => c !== "NO_NOTABLE_CONFLICT"),
    );
    const candidateTypesDiverged =
      disagreement.candidate_types_diverged.length > 1;
    const anyFailure = wave7Successes.length !== branches.length;
    const humanDecisionRequired =
      anyHumanDecision || anyConflict || candidateTypesDiverged || anyFailure;

    // 7b. Compute enterprise decision posture (additive
    //     extension per Founder enterprise-decision-output
    //     clarification 2026-05-31). Closed-vocab labels
    //     derived from the same Wave 7 outputs already
    //     consumed above.
    //
    //     ADR-0078 Stage 2 — also project safe approved-source
    //     `conversation_context_signals[]` and attach to the
    //     enterprise_decision_posture per ADR-0078 §9 (scenario-
    //     wide single sidecar; NOT per-branch — preserves
    //     ADR-0076 §11 bounded counts). Pure projection — no
    //     mutation, no LLM, no connector invocation, no Action
    //     creation/mutation, no transcript ingest. Filtered by
    //     construction per ADR-0079 §27.
    const conversationContextSignals =
      await this.conversationContextSignals.projectApprovedSourceSignals({
        callerEntityId: ownerEntityId,
        scenario: scenarioLookup.scenario,
        policyPurpose: "SIMULATION_REVIEW",
      });

    const enterprisePosture = computeEnterpriseDecisionPosture({
      branches,
      wave7Results: wave7Successes,
      nextReview,
      anyFailure,
      conversation_context_signals: conversationContextSignals,
    });

    // 8. Emit the single ADR-0076 §14 audit row. Safe
    //    metadata only — NEVER raw branch text /
    //    chain-of-thought / scenario JSON / agent prompts /
    //    model outputs / scores.
    const audit = await writeAuditEvent({
      event_type: "ADMIN_ACTION",
      outcome: "SUCCESS",
      actor_entity_id: ownerEntityId,
      target_entity_id: ownerEntityId,
      ip_address: context.ip_address ?? null,
      details: {
        action: "PLAYGROUND_SIMULATION_EXECUTED",
        scenario_id: resolvedScenarioId,
        orchestration_mode: orchestrationMode,
        branch_count: branches.length,
        branch_definitions_used: [...new Set(branches.map((b) => b.branch_definition))],
        agent_roles_used: [...new Set(branches.map((b) => b.agent_role))],
        convergence_summary_size: convergence.candidate_keys_agreed_upon.length,
        disagreement_summary_size:
          disagreement.candidate_types_diverged.length,
        unresolved_questions_count: unresolvedQuestions.length,
        caller_confirmation_received: true,
        // ADR-0078 §12 + ADR-0079 §19 — ZERO new audit literal.
        // Safe metadata counts only; NEVER raw signal text /
        // safe_summary / honest_note / signal content.
        conversation_context_signals_count:
          conversationContextSignals.length,
        conversation_context_signal_sources: [
          ...new Set(
            conversationContextSignals.map((s) => s.signal_source_type),
          ),
        ],
      },
    });

    return {
      ok: true,
      scenario_id: resolvedScenarioId,
      simulated_at: new Date().toISOString(),
      orchestration_mode: orchestrationMode,
      branch_count: branches.length,
      branches,
      convergence_summary: convergence,
      disagreement_summary: disagreement,
      unresolved_questions: unresolvedQuestions,
      recommended_next_review: nextReview,
      enterprise_decision_posture: enterprisePosture,
      human_decision_required: humanDecisionRequired,
      honest_note: HONEST_NOTE,
      simulation_audit_event_id: audit.audit_id,
    };
  }
}
