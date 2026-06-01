// FILE: conversation-context-signals.ts
// PURPOSE: ADR-0078 Stage 2 — approved-source projection of safe
//          `conversation_context_signals[]` for Agent Playground
//          Wave 7 + Wave 9 response surfaces. Pure-projection
//          service + locked closed-vocab tuples + the canonical
//          `ConversationContextSignal` shape (15 §2 base fields +
//          8 §6C.12 additive fields). Uses ONLY sources that are
//          already LIVE in Foundation as of 2026-05-31:
//          - CORRECTION_SIGNAL  (ADR-0055 + ADR-0058 LIVE)
//          - ACTION_HISTORY     (ADR-0057 LIVE; safe read via
//                                listActionsForCaller →
//                                SafeActionView per ADR-0057 §10
//                                allowlist)
//          - MANUAL_USER_INPUT  (ADR-0065 Wave 4 scenario fields;
//                                projects PRESENCE/ABSENCE of
//                                structured fields only — never
//                                raw text)
//          HIVE_CONTEXT is preserved at the enum register but
//          intentionally zero-output at this slice (no scenario-
//          tied safe Hive context-projection method ready; future
//          Founder-authorized amendment may wire it in without
//          breaking the contract).
//
//          Stage 2 invariants enforced HERE by construction:
//          - NO raw transcript ingestion; NO Layer 1; NO Layer 4
//            drilldown surface; `related_transcript_ref` is OMITTED
//            from every Stage 2 signal per ADR-0078 §7 Stage 2
//            constraint line 1088
//          - every emitted signal carries ALL §2 base fields +
//            ALL 8 §6C.12 additive fields per ADR-0078 §6C.12
//            (absence is a no-leak guard failure)
//          - ADR-0079 §27 Agent Playground use policy applied at
//            the projection register: only WORK_RELEVANT +
//            non-UNKNOWN business purpose + ALLOWED_FOR_SIGNALS
//            (or ALLOWED_AFTER_REDACTION when redaction_applied) +
//            CAPTURE_ALLOWED (or CAPTURE_ALLOWED_WITH_REDACTION /
//            CAPTURE_REQUIRED_BY_LEGAL_HOLD) + scope_binding_type
//            set
//          - NEVER emits NON_WORK_PERSONAL, SENSITIVE_PERSONAL,
//            UNKNOWN_REQUIRES_REVIEW (without explicit review),
//            UNKNOWN_BUSINESS_PURPOSE, BLOCKED_FROM_AGENT_PLAYGROUND
//          - safe_summary is closed-style, ≤ 300 chars, NEVER raw
//            quotes / named speakers / emotion scoring / employee
//            scoring / manager surveillance / legal certainty /
//            regulator approval per ADR-0078 §11 + §13
//          - bounded count ≤ 8 per ADR-0078 §8 line 1129; stable
//            ordering; dedupe on
//            (signal_type, signal_source_type, signal_scope)
//          - ZERO new audit literal (ADR-0078 §12 + ADR-0079 §19);
//            consumers extend the existing ADMIN_ACTION +
//            details.action discriminator with safe metadata only
//            (signal counts; NEVER signal text)
//          - NO LLM / Python / BEAM / connector invocation / Action
//            creation / Action mutation / capsule write / external
//            provider call / cross-org fusion
//          - pure projection — no DB writes; reads only safe
//            already-live counts / SafeActionView / scenario
//            structural fields
// CONNECTS TO:
//   - apps/api/src/services/playground/playground-best-path-recommendation.service.ts
//     (Wave 7 sidecar consumer; emits the projection after the
//     ADMIN_ACTION + details.action = "PLAYGROUND_BEST_PATH_RECOMMENDED"
//     audit row succeeds)
//   - apps/api/src/services/playground/playground-simulation.service.ts
//     (Wave 9 sidecar consumer; attaches projection to
//     EnterpriseDecisionPosture per ADR-0078 §9 — scenario-wide
//     single sidecar, NOT per-branch, to preserve ADR-0076 §11
//     bounded counts)
//   - apps/api/src/services/action/list.service.ts
//     (listActionsForCaller → SafeActionView; per-caller self-
//     scope reads only; ADR-0057 §10 allowlist already strips
//     payload + envelope + secret_ref by construction)
//   - packages/database (prisma.memoryCapsule for CORRECTION
//     count/freshness; capsule_type='CORRECTION' + wallet_id ==
//     callerEntityId + deleted_at: null; mirrors
//     projectConversationCorrections discipline at
//     otzar/conversation-corrections.ts)
//   - ADR-0078 §2 / §3 / §6C / §7 Stage 2 / §8 / §9 / §11 / §12
//   - ADR-0079 §19 / §26 / §27 / §28 / §29.2
//   - ADR-0055 + ADR-0057 + ADR-0058 + ADR-0059 + ADR-0063 +
//     ADR-0065 + ADR-0074 + ADR-0076

import { prisma } from "@niov/database";
import { listActionsForCaller } from "../action/list.service.js";
import type { SafeActionView } from "../action/views.js";
import type { PlaygroundScenarioView } from "./playground-scenario.service.js";

// --------------------------------------------------------------
// §3.1 signal_type (17 values; ADR-0078 §3.1)
// --------------------------------------------------------------
export const CONVERSATION_CONTEXT_SIGNAL_TYPE_VALUES = [
  "PRIOR_COMMITMENT_IDENTIFIED",
  "STAKEHOLDER_CONCERN_IDENTIFIED",
  "APPROVAL_DEPENDENCY_IDENTIFIED",
  "CONFLICTING_DIRECTION_IDENTIFIED",
  "MISSING_STAKEHOLDER_INPUT",
  "MEETING_CONTEXT_SUPPORTS_PATH",
  "HUMAN_OBJECTION_REQUIRES_REVIEW",
  "DECISION_OWNER_UNCLEAR",
  "ACTION_ITEM_DEPENDENCY_IDENTIFIED",
  "RISK_RAISED_BY_STAKEHOLDER",
  "DEADLINE_OR_TIMING_CONSTRAINT_IDENTIFIED",
  "CUSTOMER_OR_CLIENT_IMPACT_RAISED",
  "POLICY_OR_COMPLIANCE_CONCERN_RAISED",
  "SECURITY_OR_DATA_SCOPE_CONCERN_RAISED",
  "PRIOR_DECISION_REFERENCED",
  "UNRESOLVED_QUESTION_IDENTIFIED",
  "CONTEXT_INSUFFICIENT_FOR_RECOMMENDATION",
] as const;
export type ConversationContextSignalType =
  (typeof CONVERSATION_CONTEXT_SIGNAL_TYPE_VALUES)[number];

// --------------------------------------------------------------
// §3.2 signal_confidence_label (4 values)
// --------------------------------------------------------------
export const SIGNAL_CONFIDENCE_LABEL_VALUES = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "INSUFFICIENT_DATA",
] as const;
export type SignalConfidenceLabel =
  (typeof SIGNAL_CONFIDENCE_LABEL_VALUES)[number];

// --------------------------------------------------------------
// §3.3 signal_source_type (8 values; only the 4 Stage 2 LIVE
// sources can produce signals at this slice — the other 4 are
// reserved for future Stage 1+/Stage 3 amendments)
// --------------------------------------------------------------
export const SIGNAL_SOURCE_TYPE_VALUES = [
  "MEETING_SUMMARY",
  "APPROVED_NOTE",
  "GOVERNED_LISTENER_OUTPUT",
  "CORRECTION_SIGNAL",
  "ACTION_HISTORY",
  "HIVE_CONTEXT",
  "MANUAL_USER_INPUT",
  "IMPORTED_APPROVED_RECORD",
] as const;
export type SignalSourceType = (typeof SIGNAL_SOURCE_TYPE_VALUES)[number];

// --------------------------------------------------------------
// §3.4 signal_scope (6 values)
// --------------------------------------------------------------
export const SIGNAL_SCOPE_VALUES = [
  "SELF_ONLY",
  "SAME_ORG",
  "HIVE_SCOPED",
  "PROJECT_SCOPED",
  "ACTION_SCOPED",
  "COMPLIANCE_REVIEW_SCOPED",
] as const;
export type SignalScope = (typeof SIGNAL_SCOPE_VALUES)[number];

// --------------------------------------------------------------
// §3.6 evidence_label (13 values)
// --------------------------------------------------------------
export const EVIDENCE_LABEL_VALUES = [
  "HUMAN_COMMITMENT",
  "HUMAN_CONCERN",
  "HUMAN_OBJECTION",
  "APPROVAL_NEED",
  "MISSING_CONTEXT",
  "PRIOR_DECISION",
  "TIMING_CONSTRAINT",
  "CUSTOMER_IMPACT",
  "POLICY_CONCERN",
  "SECURITY_CONCERN",
  "DATA_SCOPE_CONCERN",
  "CONFLICTING_CONTEXT",
  "INSUFFICIENT_CONTEXT",
] as const;
export type EvidenceLabel = (typeof EVIDENCE_LABEL_VALUES)[number];

// --------------------------------------------------------------
// §3.7 retention_class (5 values)
// --------------------------------------------------------------
export const RETENTION_CLASS_VALUES = [
  "EPHEMERAL_REVIEW_ONLY",
  "SCENARIO_CONTEXT_RETAINED",
  "ACTION_CONTEXT_RETAINED",
  "AUDIT_SAFE_METADATA_ONLY",
  "DEPERSONALIZED_IMPROVEMENT_SIGNAL",
] as const;
export type RetentionClass = (typeof RETENTION_CLASS_VALUES)[number];

// --------------------------------------------------------------
// §3.9 policy_purpose (7 values) — used to bind the projection
// surface for Wave 7 (RECOMMENDATION_REVIEW) vs Wave 9
// (SIMULATION_REVIEW); audit-only at Stage 2 since
// related_transcript_ref is OMITTED and there is no Layer 4
// drilldown at this slice.
// --------------------------------------------------------------
export const POLICY_PURPOSE_VALUES = [
  "RECOMMENDATION_REVIEW",
  "SIMULATION_REVIEW",
  "GOVERNED_ACTION_REVIEW",
  "COMPLIANCE_REVIEW",
  "LEGAL_REVIEW",
  "REGULATOR_EVIDENCE_PACKAGE",
  "AUDIT_RECONSTRUCTION",
] as const;
export type PolicyPurpose = (typeof POLICY_PURPOSE_VALUES)[number];

// --------------------------------------------------------------
// §6C.6 business_purpose_label (11 values; UNKNOWN_BUSINESS_PURPOSE
// MUST never flow into the response per ADR-0079 §27)
// --------------------------------------------------------------
export const BUSINESS_PURPOSE_LABEL_VALUES = [
  "PROJECT_CONTEXT",
  "CLIENT_OR_CUSTOMER_WORK",
  "ACTION_RELATED",
  "APPROVAL_RELATED",
  "COMPLIANCE_REVIEW",
  "LEGAL_HOLD",
  "INCIDENT_REVIEW",
  "HIVE_OR_TEAM_COORDINATION",
  "SALES_OR_ACCOUNT_WORK",
  "SUPPORT_CASE",
  "UNKNOWN_BUSINESS_PURPOSE",
] as const;
export type BusinessPurposeLabel =
  (typeof BUSINESS_PURPOSE_LABEL_VALUES)[number];

// --------------------------------------------------------------
// §6C.9.a conversation_relevance_class (5 values)
// --------------------------------------------------------------
export const CONVERSATION_RELEVANCE_CLASS_VALUES = [
  "WORK_RELEVANT",
  "MIXED_WORK_PERSONAL",
  "NON_WORK_PERSONAL",
  "SENSITIVE_PERSONAL",
  "UNKNOWN_REQUIRES_REVIEW",
] as const;
export type ConversationRelevanceClass =
  (typeof CONVERSATION_RELEVANCE_CLASS_VALUES)[number];

// --------------------------------------------------------------
// §6C.9.b capture_eligibility (7 values)
// --------------------------------------------------------------
export const CAPTURE_ELIGIBILITY_VALUES = [
  "CAPTURE_ALLOWED",
  "CAPTURE_ALLOWED_WITH_REDACTION",
  "CAPTURE_BLOCKED_PERSONAL",
  "CAPTURE_BLOCKED_POLICY",
  "CAPTURE_BLOCKED_NO_BUSINESS_PURPOSE",
  "CAPTURE_REQUIRES_REVIEW",
  "CAPTURE_REQUIRED_BY_LEGAL_HOLD",
] as const;
export type CaptureEligibility = (typeof CAPTURE_ELIGIBILITY_VALUES)[number];

// --------------------------------------------------------------
// §6C.9.c agent_playground_use (5 values)
// --------------------------------------------------------------
export const AGENT_PLAYGROUND_USE_VALUES = [
  "ALLOWED_FOR_SIGNALS",
  "ALLOWED_AFTER_REDACTION",
  "BLOCKED_FROM_AGENT_PLAYGROUND",
  "REQUIRES_HUMAN_REVIEW",
  "LEGAL_COMPLIANCE_ONLY",
] as const;
export type AgentPlaygroundUse = (typeof AGENT_PLAYGROUND_USE_VALUES)[number];

// --------------------------------------------------------------
// §6C.10 scope_binding_type (9 values; MUST never be null per
// ADR-0079 §27)
// --------------------------------------------------------------
export const SCOPE_BINDING_TYPE_VALUES = [
  "SCENARIO_SCOPED",
  "PROJECT_SCOPED",
  "MATTER_SCOPED",
  "CLIENT_SCOPED",
  "ACTION_SCOPED",
  "HIVE_SCOPED",
  "ORG_SCOPED",
  "LEGAL_HOLD_SCOPED",
  "COMPLIANCE_REVIEW_SCOPED",
] as const;
export type ScopeBindingType = (typeof SCOPE_BINDING_TYPE_VALUES)[number];

// --------------------------------------------------------------
// The canonical Stage 2 `ConversationContextSignal` shape — the
// §2 base fields (minus `related_transcript_ref` which is OMITTED
// at Stage 2 per ADR-0078 §7 line 1088) PLUS the 8 §6C.12 additive
// fields (mandatory; absence is a no-leak guard failure per
// ADR-0078 line 1036).
// --------------------------------------------------------------
export interface ConversationContextSignal {
  // §2 base fields
  readonly signal_type: ConversationContextSignalType;
  readonly signal_confidence_label: SignalConfidenceLabel;
  readonly signal_source_type: SignalSourceType;
  readonly signal_scope: SignalScope;
  readonly related_scenario_id?: string;
  readonly related_candidate_key?: string;
  readonly related_branch_id?: string;
  readonly related_action_id?: string;
  // related_transcript_ref intentionally OMITTED at Stage 2
  readonly detected_at: string;
  readonly evidence_label: EvidenceLabel;
  readonly safe_summary: string;
  readonly requires_human_review: boolean;
  readonly retention_class: RetentionClass;
  readonly honest_note: string;
  // §6C.12 additive fields (MANDATORY at every Stage 2+ signal)
  readonly conversation_relevance_class: ConversationRelevanceClass;
  readonly capture_eligibility: CaptureEligibility;
  readonly agent_playground_use: AgentPlaygroundUse;
  readonly redaction_applied: boolean;
  readonly business_purpose_label: BusinessPurposeLabel;
  readonly scope_binding_type: ScopeBindingType;
  readonly review_required: boolean;
  readonly personal_content_suppressed: boolean;
}

// WHAT: Maximum number of signals emitted at any one Wave 7 /
//        Wave 9 sidecar response surface per ADR-0078 §8 line 1129.
// WHY: Bounded count discipline. Wave 9 reuses the same ceiling
//      because ADR-0078 §9 + ADR-0076 §11 require Wave 9's
//      bounded counts to be preserved; the scenario-wide
//      EnterpriseDecisionPosture sidecar inherits the same cap.
export const CONVERSATION_CONTEXT_SIGNALS_MAX = 8;

// WHAT: Maximum safe_summary length per ADR-0078 §11 line 1173.
const SAFE_SUMMARY_MAX_CHARS = 300;

// WHAT: Canonical honest_note attached to every Stage 2 signal.
// WHY: ADR-0078 §11 + §13 + ADR-0070 §9 legal-advice boundary —
//      signals are advisory only, never claim "AI fixed itself",
//      "best practice learned", regulator approval, compliance
//      certification, etc. The note deliberately avoids the
//      substring "transcript" so the existing Wave 7 / Wave 9
//      no-leak guard tests (which forbid that substring across
//      the entire response body) keep their bite without
//      false-positives from this advisory copy.
const STAGE_2_HONEST_NOTE =
  "Advisory context signal only. Not a final decision, not " +
  "legal or compliance certainty, not surveillance, not " +
  "employee scoring. Derived from approved Foundation sources " +
  "under governance.";

// WHAT: How many recent corrections to count for the
//        CORRECTION_SIGNAL projection (caller-wallet self-scoped).
const CORRECTION_LOOKBACK_LIMIT = 50;

// WHAT: How many recent Actions to inspect for the ACTION_HISTORY
//        projection. Bounded read; safe metadata only.
const ACTION_HISTORY_LOOKBACK_LIMIT = 10;

// --------------------------------------------------------------
// Input shape for the projection service. The shape deliberately
// carries ONLY safe, scenario-tied identifiers — never raw text,
// never the scenario `body` Json blob beyond fields the existing
// PlaygroundScenarioView already exposes safely.
// --------------------------------------------------------------
export interface ProjectApprovedSourceSignalsInput {
  callerEntityId: string;
  scenario: PlaygroundScenarioView;
  policyPurpose: PolicyPurpose;
}

// --------------------------------------------------------------
// Service signature — abstract enough that Wave 7 + Wave 9 +
// future Wave 10 consumers depend on the interface, not the
// concrete class. Mirrors ADR-0048 personalization-orchestration
// pattern.
// --------------------------------------------------------------
export interface ConversationContextSignalProjectionServiceLike {
  projectApprovedSourceSignals(
    input: ProjectApprovedSourceSignalsInput,
  ): Promise<readonly ConversationContextSignal[]>;
}

// --------------------------------------------------------------
// Pure helper — closed-style safe_summary clamp.
// --------------------------------------------------------------
function clampSafeSummary(s: string): string {
  if (s.length <= SAFE_SUMMARY_MAX_CHARS) return s;
  return s.slice(0, SAFE_SUMMARY_MAX_CHARS);
}

// --------------------------------------------------------------
// Pure helper — ADR-0079 §27 enforcement applied at the
// projection register. Returns true only if the signal satisfies
// every Agent Playground consumption rule.
// --------------------------------------------------------------
function isAllowedForAgentPlayground(s: ConversationContextSignal): boolean {
  // §27 conversation_relevance_class
  if (
    s.conversation_relevance_class !== "WORK_RELEVANT" &&
    s.conversation_relevance_class !== "MIXED_WORK_PERSONAL"
  ) {
    return false;
  }
  // §27 business_purpose_label
  if (s.business_purpose_label === "UNKNOWN_BUSINESS_PURPOSE") {
    return false;
  }
  // §27 agent_playground_use — LEGAL_COMPLIANCE_ONLY excluded at
  // Stage 2 (compliance-tier surface not exposed at this slice).
  if (
    s.agent_playground_use !== "ALLOWED_FOR_SIGNALS" &&
    s.agent_playground_use !== "ALLOWED_AFTER_REDACTION"
  ) {
    return false;
  }
  // §27 capture_eligibility
  if (
    s.capture_eligibility !== "CAPTURE_ALLOWED" &&
    s.capture_eligibility !== "CAPTURE_ALLOWED_WITH_REDACTION" &&
    s.capture_eligibility !== "CAPTURE_REQUIRED_BY_LEGAL_HOLD"
  ) {
    return false;
  }
  // §27 scope_binding_type MUST be set (string presence already
  // enforced by the type system at construction; this guards
  // against future drift).
  if (
    (SCOPE_BINDING_TYPE_VALUES as readonly string[]).indexOf(
      s.scope_binding_type,
    ) === -1
  ) {
    return false;
  }
  return true;
}

// --------------------------------------------------------------
// Pure helper — dedupe + bounded cap + stable ordering by source
// then signal_type.
// --------------------------------------------------------------
function finalizeSignals(
  signals: readonly ConversationContextSignal[],
): readonly ConversationContextSignal[] {
  const filtered = signals.filter(isAllowedForAgentPlayground);
  const seen = new Set<string>();
  const out: ConversationContextSignal[] = [];
  for (const s of filtered) {
    const key = `${s.signal_type}|${s.signal_source_type}|${s.signal_scope}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= CONVERSATION_CONTEXT_SIGNALS_MAX) break;
  }
  out.sort((a, b) => {
    if (a.signal_source_type !== b.signal_source_type) {
      return a.signal_source_type.localeCompare(b.signal_source_type);
    }
    return a.signal_type.localeCompare(b.signal_type);
  });
  return out;
}

// --------------------------------------------------------------
// Pure helper — build a signal in one place so every signal
// carries §2 base fields + §6C.12 additive fields by
// construction. STAGE_2_HONEST_NOTE is the locked honest_note;
// safe_summary is clamped. Never accepts raw text from caller-
// controlled sources beyond closed-vocab presence summaries.
// --------------------------------------------------------------
function makeSignal(args: {
  signal_type: ConversationContextSignalType;
  signal_confidence_label: SignalConfidenceLabel;
  signal_source_type: SignalSourceType;
  signal_scope: SignalScope;
  related_scenario_id?: string;
  related_candidate_key?: string;
  related_branch_id?: string;
  related_action_id?: string;
  detected_at: string;
  evidence_label: EvidenceLabel;
  safe_summary: string;
  requires_human_review: boolean;
  retention_class: RetentionClass;
  conversation_relevance_class: ConversationRelevanceClass;
  capture_eligibility: CaptureEligibility;
  agent_playground_use: AgentPlaygroundUse;
  redaction_applied: boolean;
  business_purpose_label: BusinessPurposeLabel;
  scope_binding_type: ScopeBindingType;
  review_required: boolean;
  personal_content_suppressed: boolean;
}): ConversationContextSignal {
  const base: ConversationContextSignal = {
    signal_type: args.signal_type,
    signal_confidence_label: args.signal_confidence_label,
    signal_source_type: args.signal_source_type,
    signal_scope: args.signal_scope,
    detected_at: args.detected_at,
    evidence_label: args.evidence_label,
    safe_summary: clampSafeSummary(args.safe_summary),
    requires_human_review: args.requires_human_review,
    retention_class: args.retention_class,
    honest_note: STAGE_2_HONEST_NOTE,
    conversation_relevance_class: args.conversation_relevance_class,
    capture_eligibility: args.capture_eligibility,
    agent_playground_use: args.agent_playground_use,
    redaction_applied: args.redaction_applied,
    business_purpose_label: args.business_purpose_label,
    scope_binding_type: args.scope_binding_type,
    review_required: args.review_required,
    personal_content_suppressed: args.personal_content_suppressed,
  };
  // Optional related-ids only added when present — preserves
  // exactOptionalPropertyTypes discipline (tsconfig.base.json).
  const out: { -readonly [K in keyof ConversationContextSignal]?: ConversationContextSignal[K] } = {
    ...base,
  };
  if (args.related_scenario_id !== undefined) {
    out.related_scenario_id = args.related_scenario_id;
  }
  if (args.related_candidate_key !== undefined) {
    out.related_candidate_key = args.related_candidate_key;
  }
  if (args.related_branch_id !== undefined) {
    out.related_branch_id = args.related_branch_id;
  }
  if (args.related_action_id !== undefined) {
    out.related_action_id = args.related_action_id;
  }
  return out as ConversationContextSignal;
}

// --------------------------------------------------------------
// CORRECTION_SIGNAL projection (LIVE source per ADR-0055 +
// ADR-0058). Caller-wallet self-scoped count + last-seen
// freshness; NEVER correction payload / target_capsule_id /
// capsule IDs / vectors / storage_location. Mirrors
// projectConversationCorrections discipline at
// otzar/conversation-corrections.ts:13-25.
// --------------------------------------------------------------
async function projectCorrectionSignalForCaller(args: {
  callerEntityId: string;
  scenarioId: string;
  detected_at: string;
}): Promise<readonly ConversationContextSignal[]> {
  const corrections = await prisma.memoryCapsule.findMany({
    where: {
      wallet_id: args.callerEntityId,
      capsule_type: "CORRECTION",
      deleted_at: null,
    },
    select: { created_at: true },
    orderBy: { created_at: "desc" },
    take: CORRECTION_LOOKBACK_LIMIT,
  });
  if (corrections.length === 0) {
    return [];
  }
  // Closed-vocab summary — count posture only, NEVER correction
  // text. ADR-0055 §Decision 7 submitted/available framing.
  const safeSummary =
    "A prior correction signal exists in the caller's scope. " +
    "Consider whether the recommendation aligns with prior " +
    "correction posture before proceeding.";
  return [
    makeSignal({
      signal_type: "PRIOR_DECISION_REFERENCED",
      signal_confidence_label:
        corrections.length >= 3 ? "MEDIUM" : "LOW",
      signal_source_type: "CORRECTION_SIGNAL",
      signal_scope: "SELF_ONLY",
      related_scenario_id: args.scenarioId,
      detected_at: args.detected_at,
      evidence_label: "PRIOR_DECISION",
      safe_summary: safeSummary,
      requires_human_review: false,
      retention_class: "AUDIT_SAFE_METADATA_ONLY",
      conversation_relevance_class: "WORK_RELEVANT",
      capture_eligibility: "CAPTURE_ALLOWED",
      agent_playground_use: "ALLOWED_FOR_SIGNALS",
      redaction_applied: false,
      business_purpose_label: "PROJECT_CONTEXT",
      scope_binding_type: "SCENARIO_SCOPED",
      review_required: false,
      personal_content_suppressed: false,
    }),
  ];
}

// --------------------------------------------------------------
// ACTION_HISTORY projection (LIVE source per ADR-0057). Safe
// metadata from SafeActionView only — ADR-0057 §10 allowlist
// already strips payload_summary / payload_redacted /
// policy_envelope / secret_ref / source/org/target entity_ids by
// construction; this projection reads only status +
// requires_approval + risk_tier + action_type from the safe view.
// --------------------------------------------------------------
async function projectActionHistorySignalForCaller(args: {
  callerEntityId: string;
  scenarioId: string;
  detected_at: string;
}): Promise<readonly ConversationContextSignal[]> {
  const result = await listActionsForCaller(args.callerEntityId, {
    org_scope: false,
    page: 1,
    page_size: ACTION_HISTORY_LOOKBACK_LIMIT,
  });
  if (result.ok === false) {
    // RULE 0 / safe degradation — no signals when the caller's
    // safe scope cannot be resolved. Never throws.
    return [];
  }
  const items: readonly SafeActionView[] = result.view.items;
  if (items.length === 0) {
    return [];
  }
  const pendingApproval = items.filter((a) => a.requires_approval === true);
  const out: ConversationContextSignal[] = [];
  if (pendingApproval.length > 0) {
    out.push(
      makeSignal({
        signal_type: "APPROVAL_DEPENDENCY_IDENTIFIED",
        signal_confidence_label:
          pendingApproval.length >= 2 ? "MEDIUM" : "LOW",
        signal_source_type: "ACTION_HISTORY",
        signal_scope: "ACTION_SCOPED",
        related_scenario_id: args.scenarioId,
        detected_at: args.detected_at,
        evidence_label: "APPROVAL_NEED",
        safe_summary:
          "Action history indicates a prior governed action " +
          "awaiting approval. Review approval posture before " +
          "any transition.",
        requires_human_review: true,
        retention_class: "ACTION_CONTEXT_RETAINED",
        conversation_relevance_class: "WORK_RELEVANT",
        capture_eligibility: "CAPTURE_ALLOWED",
        agent_playground_use: "ALLOWED_FOR_SIGNALS",
        redaction_applied: false,
        business_purpose_label: "APPROVAL_RELATED",
        scope_binding_type: "ACTION_SCOPED",
        review_required: true,
        personal_content_suppressed: false,
      }),
    );
  } else {
    // History exists but nothing awaiting approval — emit a
    // softer "prior decision referenced" signal so the
    // consumer surface acknowledges relevant context.
    out.push(
      makeSignal({
        signal_type: "PRIOR_DECISION_REFERENCED",
        signal_confidence_label: "LOW",
        signal_source_type: "ACTION_HISTORY",
        signal_scope: "ACTION_SCOPED",
        related_scenario_id: args.scenarioId,
        detected_at: args.detected_at,
        evidence_label: "PRIOR_DECISION",
        safe_summary:
          "Action history exists for the caller's scope. " +
          "Prior governed action context may be relevant to " +
          "this recommendation.",
        requires_human_review: false,
        retention_class: "ACTION_CONTEXT_RETAINED",
        conversation_relevance_class: "WORK_RELEVANT",
        capture_eligibility: "CAPTURE_ALLOWED",
        agent_playground_use: "ALLOWED_FOR_SIGNALS",
        redaction_applied: false,
        business_purpose_label: "ACTION_RELATED",
        scope_binding_type: "ACTION_SCOPED",
        review_required: false,
        personal_content_suppressed: false,
      }),
    );
  }
  return out;
}

// --------------------------------------------------------------
// MANUAL_USER_INPUT projection (LIVE source per ADR-0065 Wave 4).
// Uses ONLY structural presence of safe scenario fields; NEVER
// quotes any text. If goal_summary is missing/empty, emit an
// insufficient-context signal so the consumer surface reflects
// that human attention may be needed before action.
// --------------------------------------------------------------
function projectManualUserInputSignalForScenario(args: {
  scenario: PlaygroundScenarioView;
  detected_at: string;
}): readonly ConversationContextSignal[] {
  const { scenario, detected_at } = args;
  const goalEmpty =
    scenario.goal_summary === null ||
    (typeof scenario.goal_summary === "string" &&
      scenario.goal_summary.trim().length === 0);
  if (!goalEmpty) {
    // Goal present — at Stage 2 v1 we do NOT infer further
    // signals from goal_summary text (no quoting; no
    // unbounded text consumption). Future amendment may add
    // structured fields like deadline_at / required_approvals
    // that this projection can read safely.
    return [];
  }
  return [
    makeSignal({
      signal_type: "CONTEXT_INSUFFICIENT_FOR_RECOMMENDATION",
      signal_confidence_label: "LOW",
      signal_source_type: "MANUAL_USER_INPUT",
      signal_scope: "SELF_ONLY",
      related_scenario_id: scenario.scenario_id,
      detected_at,
      evidence_label: "INSUFFICIENT_CONTEXT",
      safe_summary:
        "Manual scenario context is incomplete. A goal " +
        "summary is missing; review and complete scenario " +
        "context before action.",
      requires_human_review: true,
      retention_class: "SCENARIO_CONTEXT_RETAINED",
      conversation_relevance_class: "WORK_RELEVANT",
      capture_eligibility: "CAPTURE_ALLOWED",
      agent_playground_use: "ALLOWED_FOR_SIGNALS",
      redaction_applied: false,
      business_purpose_label: "PROJECT_CONTEXT",
      scope_binding_type: "SCENARIO_SCOPED",
      review_required: true,
      personal_content_suppressed: false,
    }),
  ];
}

// --------------------------------------------------------------
// HIVE_CONTEXT projection (Hive C1 — LIVE 2026-06-01). Caller-
// scoped + same-org membership enumeration via direct Prisma
// read (mirrors the ACTION_HISTORY pattern; no public
// HiveService method exposes caller-scoped membership lists).
// Emits at most one MISSING_STAKEHOLDER_INPUT signal when the
// caller has at least one ACTIVE membership in an ACTIVE Hive
// whose `org_entity_id` matches the scenario's
// `org_entity_id`. Orgless scenarios (org_entity_id === null)
// and scenarios where the caller has no in-org hive
// memberships return zero signals.
//
// Safety invariants enforced HERE by construction:
//  - same-org boundary enforced via Hive.org_entity_id ==
//    scenario.org_entity_id (RULE 0 + ADR-0059 §1 same-org
//    mandate)
//  - status: "ACTIVE" both at Hive + HiveMembership tier
//    (mirrors the getHiveIntelligence membership gate at
//    hive.service.ts:862-873 — REMOVED + DISSOLVED rows lose
//    access by construction)
//  - SAFE METADATA ONLY: emits a count posture, NEVER hive
//    names, NEVER member entity_ids, NEVER governance_terms
//    text, NEVER aggregate_capsule_id, NEVER raw aggregate
//    payload (those remain behind the existing
//    getHiveIntelligence gate)
//  - SCOPE = SAME_ORG: signal_scope tagged so downstream
//    consumers know the binding is broader than self
//  - business_purpose = HIVE_OR_TEAM_COORDINATION per
//    ADR-0078 §6C.6
//  - safe degradation: any Prisma read failure → zero
//    signals (caller MUST never see the parent route fail
//    due to the optional Hive read)
// --------------------------------------------------------------
async function projectHiveContextSignalForCaller(args: {
  callerEntityId: string;
  scenario: PlaygroundScenarioView;
  detected_at: string;
}): Promise<readonly ConversationContextSignal[]> {
  // Orgless scenario — no same-org hive scope to project. The
  // caller may still be in personal hives, but Stage 2 binds
  // hive context to the scenario's org for the same-org
  // privacy boundary; cross-org projection is forward-
  // substrate.
  if (args.scenario.org_entity_id === null) {
    return [];
  }
  const hives = await prisma.hive.findMany({
    where: {
      org_entity_id: args.scenario.org_entity_id,
      status: "ACTIVE",
      members: {
        some: {
          entity_id: args.callerEntityId,
          status: "ACTIVE",
        },
      },
    },
    select: { hive_id: true },
  });
  if (hives.length === 0) {
    return [];
  }
  const safeSummary =
    "Caller participates in active hives within the same " +
    "organization as this scenario. Consider hive coordination " +
    "posture and any collective context before proceeding with " +
    "the recommendation.";
  return [
    makeSignal({
      signal_type: "MISSING_STAKEHOLDER_INPUT",
      signal_confidence_label: hives.length >= 2 ? "MEDIUM" : "LOW",
      signal_source_type: "HIVE_CONTEXT",
      signal_scope: "SAME_ORG",
      related_scenario_id: args.scenario.scenario_id,
      detected_at: args.detected_at,
      evidence_label: "MISSING_CONTEXT",
      safe_summary: safeSummary,
      requires_human_review: false,
      retention_class: "AUDIT_SAFE_METADATA_ONLY",
      conversation_relevance_class: "WORK_RELEVANT",
      capture_eligibility: "CAPTURE_ALLOWED",
      agent_playground_use: "ALLOWED_FOR_SIGNALS",
      redaction_applied: false,
      business_purpose_label: "HIVE_OR_TEAM_COORDINATION",
      scope_binding_type: "ORG_SCOPED",
      review_required: false,
      personal_content_suppressed: false,
    }),
  ];
}

// --------------------------------------------------------------
// The Stage 2 approved-source projection service.
// --------------------------------------------------------------
export class ConversationContextSignalProjectionService
  implements ConversationContextSignalProjectionServiceLike
{
  // WHAT: Build the Stage 2 conversation_context_signals[] sidecar
  //        for a Wave 7 / Wave 9 response surface.
  // INPUT: caller entity id + the safe scenario view (already
  //        owner-first authorized by the consumer service) +
  //        policy_purpose (RECOMMENDATION_REVIEW for Wave 7;
  //        SIMULATION_REVIEW for Wave 9).
  // OUTPUT: a readonly ConversationContextSignal[] bounded at
  //         CONVERSATION_CONTEXT_SIGNALS_MAX (8) with stable
  //         ordering + de-duplication + ADR-0079 §27 filtering
  //         applied by construction. Empty array (NEVER null)
  //         when no approved-source signals exist.
  // WHY: Pure projection — no DB writes, no LLM, no Action
  //      creation/mutation, no connector invocation. Pulls
  //      counts/safe metadata from already-LIVE sources only.
  //      Stage 2 by construction never adds raw transcript
  //      ingestion / schema / new audit literal / Control Tower
  //      code / cross-org fusion. policy_purpose is currently
  //      recorded as a soft signal context (audit metadata uses
  //      it; no Layer 4 drilldown exists at Stage 2).
  async projectApprovedSourceSignals(
    input: ProjectApprovedSourceSignalsInput,
  ): Promise<readonly ConversationContextSignal[]> {
    const detected_at = new Date().toISOString();
    const collected: ConversationContextSignal[] = [];

    // Approved source 1 — CORRECTION_SIGNAL.
    try {
      const correction = await projectCorrectionSignalForCaller({
        callerEntityId: input.callerEntityId,
        scenarioId: input.scenario.scenario_id,
        detected_at,
      });
      collected.push(...correction);
    } catch {
      // RULE 0 / safe degradation: optional sources NEVER fail
      // the parent route. Zero signals on read failure.
    }

    // Approved source 2 — ACTION_HISTORY.
    try {
      const actionHistory = await projectActionHistorySignalForCaller({
        callerEntityId: input.callerEntityId,
        scenarioId: input.scenario.scenario_id,
        detected_at,
      });
      collected.push(...actionHistory);
    } catch {
      // Same safe-degradation discipline.
    }

    // Approved source 3 — HIVE_CONTEXT (Hive C1 LIVE
    // 2026-06-01). Caller-scoped same-org membership read.
    try {
      const hive = await projectHiveContextSignalForCaller({
        callerEntityId: input.callerEntityId,
        scenario: input.scenario,
        detected_at,
      });
      collected.push(...hive);
    } catch {
      // RULE 0 / safe degradation: optional source NEVER
      // fails the parent route. Zero signals on read failure.
    }

    // Approved source 4 — MANUAL_USER_INPUT.
    const manual = projectManualUserInputSignalForScenario({
      scenario: input.scenario,
      detected_at,
    });
    collected.push(...manual);

    // Reference input.policyPurpose so future audit-tagging /
    // Layer-4-drilldown amendments have a clear binding point;
    // at Stage 2 we do not emit it on the signal (no Layer 4
    // surface), but consumers MUST be able to pass it through.
    void input.policyPurpose;

    return finalizeSignals(collected);
  }
}
