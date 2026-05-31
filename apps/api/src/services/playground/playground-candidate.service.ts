// FILE: playground-candidate.service.ts
// PURPOSE: Section 5 Wave 5 Option A — Agent Playground
//          deterministic / template-first candidate generation per
//          ADR-0072 (closed-vocab template library; computed-on-
//          read; bounded count; SAFE projection). Generates safe,
//          bounded, explainable scenario candidates for a stored
//          PlaygroundScenario WITHOUT persisting candidates,
//          calling any LLM, invoking any connector, creating any
//          Action row, touching any external provider, or producing
//          any ranking / best-path / outcome-comparison output.
//
//          Wave 5 Option A is the first scenario-tier surface above
//          the Wave 2 inspector foundation per ADR-0065 §7. Wave 6
//          (outcome comparison), Wave 7 (best-path recommender),
//          Wave 8 (governed transition to Section 2 Action
//          runtime), Wave 9 (multi-agent BEAM orchestration), and
//          Wave 10 (Control Tower frontend) all remain forward-
//          substrate behind separate Founder authorization.
//
//          Owner-first scenario lookup is delegated verbatim to
//          PlaygroundScenarioService.getScenario so the canonical
//          SCENARIO_NOT_FOUND enumeration-safe gate (cross-owner /
//          cross-org / unknown id all fold to 404) is reused
//          without re-implementation per ADR-0065 §12 RULE 0
//          universal.
//
//          Audit emission uses the canonical ADMIN_ACTION +
//          details.action discriminator pattern per ADR-0072 §13
//          (no new audit literal; safe metadata only; NEVER raw
//          candidate text, NEVER raw scenario fields, NEVER raw
//          input_refs / constraints / expected_outputs /
//          governance_findings JSON).
// CONNECTS TO:
//   - apps/api/src/services/auth.service.ts (bearer + "read"
//     session validation via the scenario service)
//   - apps/api/src/services/playground/playground-scenario.service.ts
//     (owner-first SCENARIO_NOT_FOUND gate + SAFE
//     PlaygroundScenarioView projection)
//   - packages/database/src/queries/audit.ts (writeAuditEvent —
//     ADMIN_ACTION + details.action="PLAYGROUND_CANDIDATES_GENERATED")
//   - ADR-0072 Section 5 Wave 5 Candidate-Generation Contract
//   - ADR-0065 §7 Wave 5 forward-queue line (closed at contract
//     register by ADR-0072; this service is the Option A
//     implementation surface)
//   - ADR-0068 §card_key (canonical SHA-256 16-char deterministic
//     identifier precedent that computeCandidateKey mirrors)
//   - ADR-0070 §9 (legal-advice boundary inherited verbatim;
//     forbidden copy enforced by closed-vocab templates)

import { createHash } from "node:crypto";
import { writeAuditEvent } from "@niov/database";
import type {
  PlaygroundScenarioService,
  PlaygroundScenarioFailureCode,
  PlaygroundScenarioView,
} from "./playground-scenario.service.js";

// WHAT: Closed-vocabulary candidate_type set per ADR-0072 §2.
// INPUT: Used as a constant + a type guard predicate source.
// OUTPUT: A readonly tuple of the 9 valid candidate_type labels.
// WHY: ADR-0072 §2 locks the 9 candidate_type values. Adding a new
//      value requires a future Founder-authorized ADR amendment to
//      ADR-0072 — service-tier validation is the enforcement site.
export const PLAYGROUND_CANDIDATE_TYPE_VALUES = [
  "STATUS_QUO",
  "LOW_RISK_INCREMENTAL",
  "SPEED_OPTIMIZED",
  "COST_OPTIMIZED",
  "COMPLIANCE_FIRST",
  "CUSTOMER_IMPACT_FIRST",
  "OPERATIONAL_RESILIENCE",
  "HUMAN_REVIEW_REQUIRED",
  "DO_NOT_PROCEED",
] as const;
export type PlaygroundCandidateType =
  (typeof PLAYGROUND_CANDIDATE_TYPE_VALUES)[number];

// WHAT: Closed-vocabulary governance_findings set per ADR-0072 §3.
// INPUT: Used as a constant + a type-narrowing source.
// OUTPUT: A readonly tuple of the 11 valid governance findings.
// WHY: ADR-0072 §3 locks the 11 values. Adding a new value
//      requires a future ADR amendment to ADR-0072.
export const PLAYGROUND_GOVERNANCE_FINDING_VALUES = [
  "POLICY_ALLOWED",
  "POLICY_REVIEW_REQUIRED",
  "APPROVAL_REQUIRED",
  "DUAL_CONTROL_REQUIRED",
  "CONNECTOR_UNAVAILABLE",
  "DATA_SCOPE_INSUFFICIENT",
  "COMPLIANCE_REVIEW_RECOMMENDED",
  "LEGAL_REVIEW_RECOMMENDED",
  "HUMAN_DECISION_REQUIRED",
  "ACTION_RUNTIME_REQUIRED",
  "DO_NOT_EXECUTE",
] as const;
export type PlaygroundGovernanceFinding =
  (typeof PLAYGROUND_GOVERNANCE_FINDING_VALUES)[number];

// WHAT: Closed-vocabulary required_approvals set per ADR-0072 §1.
// INPUT: Used as a constant + a type-narrowing source.
// OUTPUT: A readonly tuple of the 6 valid approval labels.
// WHY: ADR-0072 §18 bounds required_approvals to the 6-value set;
//      same vocabulary as a subset of governance_findings used at
//      the approval surface.
export const PLAYGROUND_REQUIRED_APPROVAL_VALUES = [
  "DUAL_CONTROL_REQUIRED",
  "APPROVAL_REQUIRED",
  "HUMAN_DECISION_REQUIRED",
  "POLICY_REVIEW_REQUIRED",
  "LEGAL_REVIEW_RECOMMENDED",
  "COMPLIANCE_REVIEW_RECOMMENDED",
] as const;
export type PlaygroundRequiredApproval =
  (typeof PLAYGROUND_REQUIRED_APPROVAL_VALUES)[number];

// WHAT: Closed-vocabulary action_runtime_transition_hint set per
//        ADR-0072 §5.
// INPUT: Used as a constant + a type-narrowing source.
// OUTPUT: A readonly tuple of the 7 valid hint labels.
// WHY: ADR-0072 §5 locks the 7 values. Candidates carry the hint
//      but NEVER an unexecuted Action payload (Wave 8 forward-
//      substrate).
export const PLAYGROUND_TRANSITION_HINT_VALUES = [
  "NO_ACTION",
  "MAY_PROPOSE_ACTION_LATER",
  "REQUIRES_APPROVAL_CHAIN",
  "REQUIRES_POLICY_REVIEW",
  "REQUIRES_CONNECTOR_CAPABILITY",
  "REQUIRES_HUMAN_DECISION",
  "BLOCKED",
] as const;
export type PlaygroundTransitionHint =
  (typeof PLAYGROUND_TRANSITION_HINT_VALUES)[number];

// WHAT: Closed-vocabulary confidence_label set per ADR-0072 §7.
// INPUT: Used as a constant + a type-narrowing source.
// OUTPUT: A readonly tuple of the 4 valid confidence labels.
// WHY: ADR-0072 §7 locks the 4 values. NO fabricated probabilistic
//      numbers permitted — confidence is an honest closed-vocab
//      signal only.
export const PLAYGROUND_CONFIDENCE_LABEL_VALUES = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "INSUFFICIENT_DATA",
] as const;
export type PlaygroundConfidenceLabel =
  (typeof PLAYGROUND_CONFIDENCE_LABEL_VALUES)[number];

// WHAT: Closed-vocabulary source_summary set per ADR-0072 §13
//        audit metadata + Founder paste enumeration.
// INPUT: Used as a constant + a type-narrowing source.
// OUTPUT: A readonly tuple of the safe source-category labels.
// WHY: Audit details.source_summary[] uses ONLY these labels so
//      the audit row's source attribution is closed-vocab and
//      never leaks scenario-specific fields. v1 implementation
//      uses SCENARIO_FIELDS + STATIC_TEMPLATE_LIBRARY only (Wave 2
//      inspectors deliberately NOT composed at v1 to minimize
//      surface).
export const PLAYGROUND_SOURCE_SUMMARY_VALUES = [
  "SCENARIO_FIELDS",
  "STATIC_TEMPLATE_LIBRARY",
  "POLICY_METADATA",
  "CONNECTOR_CAPABILITY_METADATA",
  "WORKING_SET_METADATA",
  "GOVERNANCE_FINDINGS_METADATA",
] as const;
export type PlaygroundSourceSummary =
  (typeof PLAYGROUND_SOURCE_SUMMARY_VALUES)[number];

// WHAT: The SAFE wire shape for one generated candidate per
//        ADR-0072 §1.
// INPUT: Used as a return type only.
// OUTPUT: None.
// WHY: Every field is enumerated here so the no-leak surface is
//      explicit. NO `candidate_id` is emitted because Wave 5
//      Option A is computed-on-read (no persistence); the
//      deterministic `candidate_key` is the stable identifier per
//      ADR-0072 §1 (candidate_id omitted; documented in the §1
//      "if response contract requires candidate_id, set it equal
//      to candidate_key only if ADR-0072 allows; otherwise omit
//      candidate_id and document why" guidance). Raw `input_refs`,
//      `constraints`, `expected_outputs`, `governance_findings`
//      Json fields are NEVER projected into the candidate output —
//      the template library is blind to scenario-specific JSON
//      content; only closed-vocab evidence_refs cite which source
//      categories informed the candidate.
export interface PlaygroundCandidateView {
  candidate_key: string;
  scenario_id: string;
  candidate_title: string;
  candidate_summary: string;
  candidate_type: PlaygroundCandidateType;
  assumptions: readonly string[];
  required_inputs: readonly string[];
  expected_benefits: readonly string[];
  known_risks: readonly string[];
  dependencies: readonly string[];
  governance_findings: readonly PlaygroundGovernanceFinding[];
  required_approvals: readonly PlaygroundRequiredApproval[];
  blocked_by_policy: boolean;
  action_runtime_transition_hint: PlaygroundTransitionHint;
  evidence_refs: readonly string[];
  confidence_label: PlaygroundConfidenceLabel;
  honest_note: string;
}

// WHAT: Body shape for POST /api/v1/playground/scenarios/:id/candidates.
// INPUT: Used as a parameter type at the service boundary.
// OUTPUT: None.
// WHY: Minimal v1 shape per Founder paste. Both fields optional;
//      omission yields the default deterministic candidate set.
//      No freeform prompt text, no objective override, no
//      generation-instructions field — the stored scenario itself
//      is the only input anchor (ADR-0072 §4 + RULE 0).
export interface GenerateCandidatesInput {
  candidate_types?: unknown;
  max_candidates?: unknown;
}

// WHAT: The unified failure code surface for the candidate route.
// INPUT: Used as a return discriminator only.
// OUTPUT: None.
// WHY: Reuses PlaygroundScenarioFailureCode verbatim (delegated
//      scenario lookup surfaces SESSION_* / OPERATION_NOT_PERMITTED
//      / SCENARIO_NOT_FOUND / INTERNAL_ERROR). INVALID_REQUEST also
//      flows from this surface for body-shape violations specific
//      to the candidate route (invalid candidate_type, invalid
//      max_candidates).
export type PlaygroundCandidateFailureCode = PlaygroundScenarioFailureCode;

export interface PlaygroundCandidateFailure {
  ok: false;
  code: PlaygroundCandidateFailureCode;
  message: string;
  invalid_fields?: readonly string[];
}

export interface GenerateCandidatesSuccess {
  ok: true;
  scenario_id: string;
  candidates: readonly PlaygroundCandidateView[];
  generated_at: string;
  audit_event_id: string;
}

// WHAT: ADR-0072 §18 bounded counts canonical at the discipline
//        register.
// INPUT: None.
// OUTPUT: Numeric caps per candidate output field.
// WHY: Per Founder paste + ADR-0072 §18; exact values may be
//      adjusted at the implementation slice but the cap discipline
//      is locked. Implementation enforces by-construction
//      (templates never exceed these counts) so caps are
//      defense-in-depth.
const CANDIDATES_PER_CALL_MAX = 8;
const ASSUMPTIONS_PER_CANDIDATE_MAX = 8;
const REQUIRED_INPUTS_PER_CANDIDATE_MAX = 12;
const EXPECTED_BENEFITS_PER_CANDIDATE_MAX = 8;
const KNOWN_RISKS_PER_CANDIDATE_MAX = 12;
const DEPENDENCIES_PER_CANDIDATE_MAX = 12;
const GOVERNANCE_FINDINGS_PER_CANDIDATE_MAX = 11;
const REQUIRED_APPROVALS_PER_CANDIDATE_MAX = 6;
const EVIDENCE_REFS_PER_CANDIDATE_MAX = 16;

// WHAT: The canonical honest_note string per ADR-0072 §11.
// INPUT: None.
// OUTPUT: A single closed-template string emitted on every
//         candidate.
// WHY: Every candidate MUST carry an honest_note stating advisory
//      + not executed + not legal advice + requires human/
//      governance review per ADR-0072 §11. Single canonical string
//      keeps the audit / no-leak surface stable and prevents copy
//      drift.
const HONEST_NOTE =
  "This candidate is advisory only. It has not been executed, is " +
  "not legal advice, and requires human/governance review before " +
  "any real-world action.";

// WHAT: Type guard for the closed-vocab candidate_type set.
// INPUT: An unknown value from the request body.
// OUTPUT: true iff value is one of the 9 closed-vocab labels.
// WHY: Service-tier validation per Wave 4 isStatus / isScenarioType
//      precedent.
function isCandidateType(value: unknown): value is PlaygroundCandidateType {
  return (
    typeof value === "string" &&
    (PLAYGROUND_CANDIDATE_TYPE_VALUES as readonly string[]).includes(value)
  );
}

// WHAT: Compute the deterministic SHA-256 16-char `candidate_key`
//        per ADR-0072 §1 (mirrors ADR-0068 `card_key` precedent).
// INPUT: scenario_id + candidate_type + sorted source summary tokens.
// OUTPUT: 16-character lowercase hex string.
// WHY: Stable across identical reads — same scenario + same
//      candidate_type + same source-summary set produces the same
//      key. Tests assert determinism. The hash inputs are ALL
//      closed-vocab tokens; no raw scenario content enters the
//      hash so even the key surface is leak-safe.
function computeCandidateKey(args: {
  scenario_id: string;
  candidate_type: PlaygroundCandidateType;
  source_summary: readonly PlaygroundSourceSummary[];
}): string {
  const sortedSources = [...args.source_summary].sort().join(",");
  const payload = [args.scenario_id, args.candidate_type, sortedSources].join(
    "|",
  );
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

// WHAT: One closed-template entry that produces a single candidate
//        for a given scenario.
// INPUT: A PlaygroundScenarioView (read-only; only generic surface
//        fields like status are inspected — raw Json fields are
//        deliberately NOT consulted by templates).
// OUTPUT: A PlaygroundCandidateView populated with closed-vocab
//         values + the deterministic candidate_key.
// WHY: Each template returns a deterministic, closed-vocab
//      candidate. Templates are blind to scenario-specific raw
//      Json content (input_refs / constraints / expected_outputs /
//      governance_findings) to guarantee no raw payload leakage at
//      the candidate output surface per ADR-0072 §6 + §14.
type CandidateTemplate = (
  scenario: PlaygroundScenarioView,
) => PlaygroundCandidateView;

// WHAT: Helper: build a single PlaygroundCandidateView with the
//        canonical honest_note attached + deterministic key
//        derived from the source-summary set.
// INPUT: scenario_id + closed-vocab fields per ADR-0072 §1.
// OUTPUT: A SAFE PlaygroundCandidateView.
// WHY: Centralizes the candidate-construction site so future
//      template additions cannot drift the honest_note or skip
//      the key computation.
function buildCandidate(args: {
  scenario_id: string;
  candidate_type: PlaygroundCandidateType;
  candidate_title: string;
  candidate_summary: string;
  assumptions: readonly string[];
  required_inputs: readonly string[];
  expected_benefits: readonly string[];
  known_risks: readonly string[];
  dependencies: readonly string[];
  governance_findings: readonly PlaygroundGovernanceFinding[];
  required_approvals: readonly PlaygroundRequiredApproval[];
  action_runtime_transition_hint: PlaygroundTransitionHint;
  evidence_refs: readonly string[];
  confidence_label: PlaygroundConfidenceLabel;
  source_summary: readonly PlaygroundSourceSummary[];
}): PlaygroundCandidateView {
  const blocked = args.governance_findings.some(
    (g) => g === "DO_NOT_EXECUTE" || g === "POLICY_REVIEW_REQUIRED",
  );
  return {
    candidate_key: computeCandidateKey({
      scenario_id: args.scenario_id,
      candidate_type: args.candidate_type,
      source_summary: args.source_summary,
    }),
    scenario_id: args.scenario_id,
    candidate_title: args.candidate_title,
    candidate_summary: args.candidate_summary,
    candidate_type: args.candidate_type,
    assumptions: args.assumptions.slice(0, ASSUMPTIONS_PER_CANDIDATE_MAX),
    required_inputs: args.required_inputs.slice(
      0,
      REQUIRED_INPUTS_PER_CANDIDATE_MAX,
    ),
    expected_benefits: args.expected_benefits.slice(
      0,
      EXPECTED_BENEFITS_PER_CANDIDATE_MAX,
    ),
    known_risks: args.known_risks.slice(0, KNOWN_RISKS_PER_CANDIDATE_MAX),
    dependencies: args.dependencies.slice(0, DEPENDENCIES_PER_CANDIDATE_MAX),
    governance_findings: args.governance_findings.slice(
      0,
      GOVERNANCE_FINDINGS_PER_CANDIDATE_MAX,
    ),
    required_approvals: args.required_approvals.slice(
      0,
      REQUIRED_APPROVALS_PER_CANDIDATE_MAX,
    ),
    blocked_by_policy: blocked,
    action_runtime_transition_hint: args.action_runtime_transition_hint,
    evidence_refs: args.evidence_refs.slice(0, EVIDENCE_REFS_PER_CANDIDATE_MAX),
    confidence_label: args.confidence_label,
    honest_note: HONEST_NOTE,
  };
}

// WHAT: Generic closed-vocab evidence references shared by every
//        deterministic template.
// INPUT: A scenario; only safe closed-vocab signals are read
//        (status, scenario_type — both already closed-vocab at the
//        column tier per Wave 4 ADR-0065 §7).
// OUTPUT: A closed-vocab list of evidence reference tokens.
// WHY: Every candidate cites which source categories informed it.
//      Raw input_refs / constraints / expected_outputs /
//      governance_findings JSON is NEVER consulted by templates so
//      these evidence_refs never leak scenario-specific payload.
function defaultEvidenceRefs(scenario: PlaygroundScenarioView): string[] {
  return [
    `SCENARIO_FIELDS:STATUS:${scenario.status}`,
    `SCENARIO_FIELDS:SCENARIO_TYPE:${scenario.scenario_type}`,
    "STATIC_TEMPLATE_LIBRARY",
  ];
}

// WHAT: Default closed-vocab source summary tokens used in audit
//        details + candidate_key derivation.
// INPUT: None.
// OUTPUT: A readonly tuple of source-summary labels.
// WHY: v1 deliberately consumes ONLY scenario fields + static
//      templates — Wave 2 inspector composition is forward-
//      substrate. Audit row's source_summary[] reflects this
//      verbatim.
const DEFAULT_SOURCE_SUMMARY: readonly PlaygroundSourceSummary[] = [
  "SCENARIO_FIELDS",
  "STATIC_TEMPLATE_LIBRARY",
];

// WHAT: STATUS_QUO closed-vocab template — the advisory baseline
//        every default response includes.
// INPUT: A PlaygroundScenarioView.
// OUTPUT: A SAFE PlaygroundCandidateView with candidate_type =
//         STATUS_QUO.
// WHY: STATUS_QUO is the "do not change current trajectory"
//      candidate. Conservative governance findings: HUMAN_DECISION_
//      REQUIRED. No execution. Hint = NO_ACTION.
const templateStatusQuo: CandidateTemplate = (scenario) =>
  buildCandidate({
    scenario_id: scenario.scenario_id,
    candidate_type: "STATUS_QUO",
    candidate_title: "Maintain current trajectory",
    candidate_summary:
      "Continue the current path without operational changes. This " +
      "candidate captures the no-change baseline for comparison.",
    assumptions: [
      "Current operational state remains stable.",
      "No external pressure forces immediate change.",
    ],
    required_inputs: ["Confirmation that current trajectory remains acceptable."],
    expected_benefits: [
      "Minimal disruption to ongoing operations.",
      "No new approval workload generated.",
    ],
    known_risks: [
      "Underlying issues may compound if change is in fact required.",
      "Opportunity cost of inaction is not measured at this tier.",
    ],
    dependencies: ["None beyond existing operational baseline."],
    governance_findings: ["POLICY_ALLOWED", "HUMAN_DECISION_REQUIRED"],
    required_approvals: ["HUMAN_DECISION_REQUIRED"],
    action_runtime_transition_hint: "NO_ACTION",
    evidence_refs: defaultEvidenceRefs(scenario),
    confidence_label: "MEDIUM",
    source_summary: DEFAULT_SOURCE_SUMMARY,
  });

// WHAT: LOW_RISK_INCREMENTAL closed-vocab template — small,
//        bounded, reversible iteration.
const templateLowRiskIncremental: CandidateTemplate = (scenario) =>
  buildCandidate({
    scenario_id: scenario.scenario_id,
    candidate_type: "LOW_RISK_INCREMENTAL",
    candidate_title: "Bounded incremental change",
    candidate_summary:
      "Propose a small, reversible incremental change scoped to the " +
      "stored scenario boundary. This candidate is advisory and requires " +
      "human review before execution.",
    assumptions: [
      "Incremental change is reversible if outcomes are unexpected.",
      "Existing operational baselines provide a fallback.",
    ],
    required_inputs: [
      "Owner confirmation of the bounded scope.",
      "Confirmation that rollback path remains viable.",
    ],
    expected_benefits: [
      "Lower blast radius than larger changes.",
      "Faster learning cycle than status-quo continuation.",
    ],
    known_risks: [
      "Incremental change may not address larger structural issues.",
      "Multiple small changes can accumulate complexity over time.",
    ],
    dependencies: ["Existing operational baseline."],
    governance_findings: [
      "POLICY_ALLOWED",
      "HUMAN_DECISION_REQUIRED",
      "APPROVAL_REQUIRED",
    ],
    required_approvals: ["APPROVAL_REQUIRED", "HUMAN_DECISION_REQUIRED"],
    action_runtime_transition_hint: "MAY_PROPOSE_ACTION_LATER",
    evidence_refs: defaultEvidenceRefs(scenario),
    confidence_label: "MEDIUM",
    source_summary: DEFAULT_SOURCE_SUMMARY,
  });

// WHAT: COMPLIANCE_FIRST closed-vocab template — prioritizes
//        compliance review + legal recommendation; never claims
//        legal sufficiency.
const templateComplianceFirst: CandidateTemplate = (scenario) =>
  buildCandidate({
    scenario_id: scenario.scenario_id,
    candidate_type: "COMPLIANCE_FIRST",
    candidate_title: "Compliance-prioritized path",
    candidate_summary:
      "Prioritize compliance review and human governance approval " +
      "before any operational step. This candidate is advisory; it is " +
      "not a legal determination and requires compliance review.",
    assumptions: [
      "Compliance review will surface any obligation-bound steps.",
      "Legal review may be required depending on jurisdiction.",
    ],
    required_inputs: [
      "Compliance review of the stored scenario inputs.",
      "Legal review where applicable.",
      "Owner / org governance approval.",
    ],
    expected_benefits: [
      "Reduces enforcement risk by surfacing review steps early.",
      "Aligns the candidate with examination-ready posture.",
    ],
    known_risks: [
      "May extend the timeline relative to less-cautious candidates.",
      "Compliance review may identify blocking conditions.",
    ],
    dependencies: ["Available compliance reviewer.", "Available legal reviewer."],
    governance_findings: [
      "POLICY_REVIEW_REQUIRED",
      "COMPLIANCE_REVIEW_RECOMMENDED",
      "LEGAL_REVIEW_RECOMMENDED",
      "HUMAN_DECISION_REQUIRED",
    ],
    required_approvals: [
      "POLICY_REVIEW_REQUIRED",
      "COMPLIANCE_REVIEW_RECOMMENDED",
      "LEGAL_REVIEW_RECOMMENDED",
      "HUMAN_DECISION_REQUIRED",
    ],
    action_runtime_transition_hint: "REQUIRES_POLICY_REVIEW",
    evidence_refs: defaultEvidenceRefs(scenario),
    confidence_label: "MEDIUM",
    source_summary: DEFAULT_SOURCE_SUMMARY,
  });

// WHAT: OPERATIONAL_RESILIENCE closed-vocab template — emphasizes
//        fallback paths + reversibility.
const templateOperationalResilience: CandidateTemplate = (scenario) =>
  buildCandidate({
    scenario_id: scenario.scenario_id,
    candidate_type: "OPERATIONAL_RESILIENCE",
    candidate_title: "Resilience-focused path",
    candidate_summary:
      "Prioritize operational resilience: ensure fallback paths, " +
      "reversibility, and dual-control for high-impact steps. This " +
      "candidate is advisory and requires governance approval.",
    assumptions: [
      "Fallback paths exist for high-impact steps.",
      "Dual-control reviewers are available when needed.",
    ],
    required_inputs: [
      "Identification of high-impact steps that require dual-control.",
      "Confirmation of available fallback paths.",
    ],
    expected_benefits: [
      "Reduces blast radius of unexpected failures.",
      "Aligns with operational continuity posture.",
    ],
    known_risks: [
      "Resilience overhead may slow execution relative to faster candidates.",
      "Fallback paths require maintenance over time.",
    ],
    dependencies: ["Available fallback substrate.", "Available dual-control reviewer."],
    governance_findings: [
      "POLICY_ALLOWED",
      "DUAL_CONTROL_REQUIRED",
      "HUMAN_DECISION_REQUIRED",
      "APPROVAL_REQUIRED",
    ],
    required_approvals: [
      "DUAL_CONTROL_REQUIRED",
      "APPROVAL_REQUIRED",
      "HUMAN_DECISION_REQUIRED",
    ],
    action_runtime_transition_hint: "REQUIRES_APPROVAL_CHAIN",
    evidence_refs: defaultEvidenceRefs(scenario),
    confidence_label: "MEDIUM",
    source_summary: DEFAULT_SOURCE_SUMMARY,
  });

// WHAT: HUMAN_REVIEW_REQUIRED closed-vocab template — surfaces
//        explicit governance escalation when the candidate clearly
//        requires a human decision before any further step.
const templateHumanReviewRequired: CandidateTemplate = (scenario) =>
  buildCandidate({
    scenario_id: scenario.scenario_id,
    candidate_type: "HUMAN_REVIEW_REQUIRED",
    candidate_title: "Escalate to human review",
    candidate_summary:
      "This scenario requires explicit human / governance review before " +
      "any further step. This candidate is advisory only; no execution " +
      "occurs at the playground tier.",
    assumptions: [
      "A qualified human reviewer is available.",
      "Governance escalation path is defined.",
    ],
    required_inputs: [
      "Human reviewer assignment.",
      "Governance review of the stored scenario inputs.",
    ],
    expected_benefits: [
      "Surfaces uncertainty to a human decision-maker.",
      "Prevents premature execution of a low-confidence path.",
    ],
    known_risks: [
      "Reviewer availability may extend the decision timeline.",
      "Reviewer may identify blocking conditions.",
    ],
    dependencies: ["Available human reviewer.", "Defined governance escalation path."],
    governance_findings: [
      "HUMAN_DECISION_REQUIRED",
      "APPROVAL_REQUIRED",
      "POLICY_REVIEW_REQUIRED",
    ],
    required_approvals: [
      "HUMAN_DECISION_REQUIRED",
      "APPROVAL_REQUIRED",
      "POLICY_REVIEW_REQUIRED",
    ],
    action_runtime_transition_hint: "REQUIRES_HUMAN_DECISION",
    evidence_refs: defaultEvidenceRefs(scenario),
    confidence_label: "INSUFFICIENT_DATA",
    source_summary: DEFAULT_SOURCE_SUMMARY,
  });

// WHAT: DO_NOT_PROCEED closed-vocab template — emitted only when a
//        deterministic safe-blocking condition holds (the scenario
//        is ARCHIVED, indicating the owner has retired it).
const templateDoNotProceed: CandidateTemplate = (scenario) =>
  buildCandidate({
    scenario_id: scenario.scenario_id,
    candidate_type: "DO_NOT_PROCEED",
    candidate_title: "Do not proceed at this time",
    candidate_summary:
      "The stored scenario is in an archived state. This candidate " +
      "advises against proceeding until the owner reactivates or " +
      "supersedes the scenario. Not legal advice; not an enforcement " +
      "determination.",
    assumptions: [
      "Archived state reflects an intentional owner decision.",
      "Reactivation requires explicit owner action.",
    ],
    required_inputs: ["Owner decision to reactivate or supersede the scenario."],
    expected_benefits: [
      "Avoids acting on a retired scenario.",
      "Surfaces the archived state to the caller explicitly.",
    ],
    known_risks: [
      "If archival was unintentional, blocked candidates may delay legitimate work.",
    ],
    dependencies: ["Owner action to leave or change archived state."],
    governance_findings: ["DO_NOT_EXECUTE", "HUMAN_DECISION_REQUIRED"],
    required_approvals: ["HUMAN_DECISION_REQUIRED"],
    action_runtime_transition_hint: "BLOCKED",
    evidence_refs: defaultEvidenceRefs(scenario),
    confidence_label: "HIGH",
    source_summary: DEFAULT_SOURCE_SUMMARY,
  });

// WHAT: SPEED_OPTIMIZED closed-vocab template — conservative
//        opt-in template; not in the default v1 set because the
//        "speed" framing can imply optimization-without-tradeoff.
//        Available via explicit candidate_types filter only.
const templateSpeedOptimized: CandidateTemplate = (scenario) =>
  buildCandidate({
    scenario_id: scenario.scenario_id,
    candidate_type: "SPEED_OPTIMIZED",
    candidate_title: "Speed-prioritized path (advisory)",
    candidate_summary:
      "Prioritize speed-to-execution within governance boundaries. " +
      "This candidate is advisory only and requires human review; speed " +
      "claims are not guaranteed and trade-offs may apply.",
    assumptions: [
      "Speed-prioritized path does not bypass required governance.",
      "Reviewer can validate the speed tradeoff is acceptable.",
    ],
    required_inputs: [
      "Owner confirmation of the speed-vs-rigor tradeoff.",
      "Governance review of the tradeoff.",
    ],
    expected_benefits: [
      "Faster decision cycle than balanced candidates.",
      "Surfaces speed as an explicit tradeoff dimension.",
    ],
    known_risks: [
      "Speed-prioritized paths may carry higher operational risk.",
      "Tradeoff may not be acceptable on regulator-touching scenarios.",
    ],
    dependencies: ["Available governance reviewer."],
    governance_findings: [
      "HUMAN_DECISION_REQUIRED",
      "POLICY_REVIEW_REQUIRED",
      "LEGAL_REVIEW_RECOMMENDED",
    ],
    required_approvals: ["HUMAN_DECISION_REQUIRED", "POLICY_REVIEW_REQUIRED"],
    action_runtime_transition_hint: "REQUIRES_HUMAN_DECISION",
    evidence_refs: defaultEvidenceRefs(scenario),
    confidence_label: "LOW",
    source_summary: DEFAULT_SOURCE_SUMMARY,
  });

// WHAT: COST_OPTIMIZED closed-vocab template — conservative
//        opt-in template; never claims a specific monetary
//        outcome.
const templateCostOptimized: CandidateTemplate = (scenario) =>
  buildCandidate({
    scenario_id: scenario.scenario_id,
    candidate_type: "COST_OPTIMIZED",
    candidate_title: "Cost-prioritized path (advisory)",
    candidate_summary:
      "Prioritize cost reduction within governance boundaries. This " +
      "candidate is advisory and does not project specific monetary " +
      "outcomes. Human review required before any action.",
    assumptions: [
      "Cost-prioritized path does not bypass required governance.",
      "Reviewer can validate the cost tradeoff is acceptable.",
    ],
    required_inputs: [
      "Owner confirmation of the cost-vs-quality tradeoff.",
      "Governance review of the tradeoff.",
    ],
    expected_benefits: [
      "Surfaces cost as an explicit tradeoff dimension.",
      "Encourages explicit review of cost-sensitive steps.",
    ],
    known_risks: [
      "Cost-prioritized paths may reduce quality or resilience.",
      "Specific monetary outcomes are not guaranteed.",
    ],
    dependencies: ["Available governance reviewer."],
    governance_findings: [
      "HUMAN_DECISION_REQUIRED",
      "POLICY_REVIEW_REQUIRED",
      "APPROVAL_REQUIRED",
    ],
    required_approvals: [
      "HUMAN_DECISION_REQUIRED",
      "APPROVAL_REQUIRED",
      "POLICY_REVIEW_REQUIRED",
    ],
    action_runtime_transition_hint: "REQUIRES_HUMAN_DECISION",
    evidence_refs: defaultEvidenceRefs(scenario),
    confidence_label: "LOW",
    source_summary: DEFAULT_SOURCE_SUMMARY,
  });

// WHAT: CUSTOMER_IMPACT_FIRST closed-vocab template — prioritizes
//        customer experience while preserving review obligations.
const templateCustomerImpactFirst: CandidateTemplate = (scenario) =>
  buildCandidate({
    scenario_id: scenario.scenario_id,
    candidate_type: "CUSTOMER_IMPACT_FIRST",
    candidate_title: "Customer-impact-prioritized path (advisory)",
    candidate_summary:
      "Prioritize positive customer impact within governance " +
      "boundaries. This candidate is advisory; customer outcomes are " +
      "not guaranteed and human review is required.",
    assumptions: [
      "Customer-impact-prioritized path does not bypass governance.",
      "Reviewer can validate the customer tradeoff.",
    ],
    required_inputs: [
      "Owner confirmation of the customer-impact framing.",
      "Governance review of the customer-impact tradeoff.",
    ],
    expected_benefits: [
      "Surfaces customer experience as an explicit dimension.",
      "Encourages explicit review of customer-touching steps.",
    ],
    known_risks: [
      "Customer-impact framing may not reflect downstream operational risk.",
      "Specific customer outcomes are not guaranteed.",
    ],
    dependencies: ["Available governance reviewer."],
    governance_findings: [
      "HUMAN_DECISION_REQUIRED",
      "APPROVAL_REQUIRED",
      "POLICY_REVIEW_REQUIRED",
    ],
    required_approvals: ["HUMAN_DECISION_REQUIRED", "APPROVAL_REQUIRED"],
    action_runtime_transition_hint: "REQUIRES_HUMAN_DECISION",
    evidence_refs: defaultEvidenceRefs(scenario),
    confidence_label: "LOW",
    source_summary: DEFAULT_SOURCE_SUMMARY,
  });

// WHAT: The canonical template registry mapping every closed-vocab
//        candidate_type to its deterministic template function.
// INPUT: None.
// OUTPUT: A frozen Record covering all 9 ADR-0072 §2 values.
// WHY: Single registry keeps the candidate-type → template binding
//      explicit; future template tuning happens in one place.
const TEMPLATE_REGISTRY: Record<PlaygroundCandidateType, CandidateTemplate> = {
  STATUS_QUO: templateStatusQuo,
  LOW_RISK_INCREMENTAL: templateLowRiskIncremental,
  SPEED_OPTIMIZED: templateSpeedOptimized,
  COST_OPTIMIZED: templateCostOptimized,
  COMPLIANCE_FIRST: templateComplianceFirst,
  CUSTOMER_IMPACT_FIRST: templateCustomerImpactFirst,
  OPERATIONAL_RESILIENCE: templateOperationalResilience,
  HUMAN_REVIEW_REQUIRED: templateHumanReviewRequired,
  DO_NOT_PROCEED: templateDoNotProceed,
};

// WHAT: The default candidate-type set when the request omits
//        `candidate_types`.
// INPUT: A PlaygroundScenarioView (status inspected to decide
//        whether to add DO_NOT_PROCEED).
// OUTPUT: A readonly list of candidate types in deterministic
//         emission order.
// WHY: Default set per Founder paste: STATUS_QUO + LOW_RISK_
//      INCREMENTAL + COMPLIANCE_FIRST + OPERATIONAL_RESILIENCE +
//      HUMAN_REVIEW_REQUIRED. DO_NOT_PROCEED is appended when the
//      scenario is ARCHIVED (deterministic safe-blocking
//      condition). The 3 framing-loaded types (SPEED_OPTIMIZED /
//      COST_OPTIMIZED / CUSTOMER_IMPACT_FIRST) are opt-in via
//      explicit `candidate_types` filter only.
function defaultCandidateTypesFor(
  scenario: PlaygroundScenarioView,
): readonly PlaygroundCandidateType[] {
  const base: PlaygroundCandidateType[] = [
    "STATUS_QUO",
    "LOW_RISK_INCREMENTAL",
    "COMPLIANCE_FIRST",
    "OPERATIONAL_RESILIENCE",
    "HUMAN_REVIEW_REQUIRED",
  ];
  if (scenario.status === "ARCHIVED") {
    base.push("DO_NOT_PROCEED");
  }
  return base;
}

// WHAT: The Agent Playground Wave 5 Option A deterministic
//        candidate-generation service.
// INPUT: AuthService (for bearer + "read" via the scenario
//        service) + PlaygroundScenarioService (for owner-first
//        SCENARIO_NOT_FOUND gate).
// OUTPUT: A single method `generateCandidates`.
// WHY: Single class so future Wave 6 (outcome comparison) + Wave
//      7 (best-path recommender) + Wave 8 (governed transition)
//      services can compose against a stable interface. The
//      service enforces: (1) auth via delegated scenario lookup;
//      (2) owner-first / same-org via delegated scenario lookup;
//      (3) closed-vocab body validation; (4) deterministic
//      candidate generation from the static template registry;
//      (5) safe-metadata-only audit emission. NO persistence, NO
//      LLM, NO connector invocation, NO Action creation, NO
//      external provider call.
export class PlaygroundCandidateService {
  constructor(
    private readonly scenarios: PlaygroundScenarioService,
  ) {}

  // WHAT: Generate the candidate set for a stored scenario.
  // INPUT: Session token + scenario_id + optional body
  //        ({ candidate_types?, max_candidates? }) + context
  //        (ip_address for audit attribution).
  // OUTPUT: GenerateCandidatesSuccess | PlaygroundCandidateFailure.
  // WHY: Computed-on-read pipeline:
  //      1. Body validation (closed-vocab candidate_types,
  //         positive-int max_candidates ≤ ADR-0072 §18 cap).
  //      2. Delegate to PlaygroundScenarioService.getScenario for
  //         auth + owner-first + same-org SCENARIO_NOT_FOUND
  //         enforcement (single canonical gate; cross-owner /
  //         cross-org / unknown id all fold to 404).
  //      3. Apply the closed-vocab template registry for each
  //         requested candidate_type (or the default set).
  //      4. Cap candidate count by ADR-0072 §18
  //         (CANDIDATES_PER_CALL_MAX = 8).
  //      5. Emit ADMIN_ACTION + details.action=
  //         "PLAYGROUND_CANDIDATES_GENERATED" with safe metadata
  //         only.
  //      6. Return SAFE PlaygroundCandidateView projection. The
  //         scenario itself is NEVER mutated; no row is created.
  async generateCandidates(
    sessionToken: string,
    scenarioId: string,
    body: GenerateCandidatesInput,
    context: { ip_address?: string | null } = {},
  ): Promise<GenerateCandidatesSuccess | PlaygroundCandidateFailure> {
    // 1. Body validation — closed-vocab + bounded count.
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
        raw > CANDIDATES_PER_CALL_MAX
      ) {
        invalidFields.push("max_candidates");
      } else {
        requestedMax = raw;
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

    // 2. Owner-first + same-org gate via the scenario service.
    //    SESSION_* / OPERATION_NOT_PERMITTED / SCENARIO_NOT_FOUND
    //    / INTERNAL_ERROR all flow through verbatim.
    const lookup = await this.scenarios.getScenario(sessionToken, scenarioId);
    if (lookup.ok === false) {
      return lookup;
    }
    const scenario = lookup.scenario;

    // 3. Decide candidate type set + cap by CANDIDATES_PER_CALL_MAX
    //    and the optional request-supplied max.
    const baseTypes =
      requestedTypes !== undefined
        ? requestedTypes
        : defaultCandidateTypesFor(scenario);
    const cap = Math.min(
      CANDIDATES_PER_CALL_MAX,
      requestedMax ?? CANDIDATES_PER_CALL_MAX,
    );
    const selectedTypes = baseTypes.slice(0, cap);

    // 4. Apply the closed-vocab template registry deterministically.
    const candidates: PlaygroundCandidateView[] = selectedTypes.map((t) =>
      TEMPLATE_REGISTRY[t](scenario),
    );

    // 5. Compute audit-only metadata + emit. Safe metadata only.
    const policyReviewRequired = candidates.some((c) =>
      c.governance_findings.some(
        (g) => g === "POLICY_REVIEW_REQUIRED" || g === "DO_NOT_EXECUTE",
      ),
    );
    const blockedCount = candidates.filter((c) => c.blocked_by_policy).length;

    const audit = await writeAuditEvent({
      event_type: "ADMIN_ACTION",
      outcome: "SUCCESS",
      actor_entity_id: scenario.owner_entity_id,
      target_entity_id: scenario.owner_entity_id,
      ip_address: context.ip_address ?? null,
      details: {
        action: "PLAYGROUND_CANDIDATES_GENERATED",
        scenario_id: scenario.scenario_id,
        candidate_count: candidates.length,
        generation_mode: "DETERMINISTIC",
        source_summary: [...DEFAULT_SOURCE_SUMMARY],
        policy_review_required: policyReviewRequired,
        blocked_count: blockedCount,
      },
    });

    // 6. Return SAFE projection. Scenario is NEVER mutated; no
    //    candidate rows created (computed-on-read).
    return {
      ok: true,
      scenario_id: scenario.scenario_id,
      candidates,
      generated_at: new Date().toISOString(),
      audit_event_id: audit.audit_id,
    };
  }
}
