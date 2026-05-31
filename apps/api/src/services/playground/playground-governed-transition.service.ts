// FILE: playground-governed-transition.service.ts
// PURPOSE: Section 5 Wave 8 Option A — Agent Playground
//          deterministic / template-first governed-
//          transition service per ADR-0075. Takes a Wave 7
//          best-path recommendation + an explicit caller
//          confirmation and produces ONE of two safe
//          outcomes:
//          - ACTION_PROPOSED: a Section 2 Action row created
//            in PROPOSED status via the existing
//            createActionForCaller surface (Section 2's
//            policy evaluator + dual-control machinery then
//            governs approval per ADR-0057).
//          - NO_ACTION_PROPOSED: closed-vocab
//            reason_not_proposed when the recommendation
//            cannot safely be translated to an Action at v1
//            (STATUS_QUO / DO_NOT_PROCEED / blocked
//            recommendations).
//
//          Wave 8 NEVER executes the Action. Wave 8 NEVER
//          bypasses Section 2's policy evaluator. Wave 8
//          NEVER accepts caller-supplied recommendation /
//          comparison / candidate payloads. Wave 8 v1 ONLY
//          allows SEND_INTERNAL_NOTIFICATION as the target
//          ActionType (internal-only; safe-by-construction)
//          per ADR-0075 §4. Wave 8 ALWAYS requires
//          caller_confirmation: true in the request body.
//
//          NO persistence beyond the Section 2 Action row +
//          dual audit emission per ADR-0075 §16. NO new
//          Prisma model. NO schema migration. NO new audit
//          literal. NO LLM / model calls. NO Python. NO BEAM.
//          NO Action execution (Section 2 owns execution).
//          NO connector invocation. NO external provider
//          call. NO Control Tower frontend.
// CONNECTS TO:
//   - apps/api/src/services/playground/playground-best-path-recommendation.service.ts
//     (Wave 7 recommendation — internally invoked per
//     ADR-0075 §7)
//   - apps/api/src/services/playground/playground-scenario.service.ts
//     (for owner attribution on the Playground handoff
//     audit row; mirrors Wave 5/6/7 audit-attribution
//     pattern)
//   - apps/api/src/services/action/action.service.ts
//     (createActionForCaller — Section 2's canonical
//     Action-create entry point per ADR-0057; Wave 8
//     delegates verbatim per ADR-0075 §8)
//   - packages/database/src/queries/audit.ts (writeAuditEvent
//     — ADMIN_ACTION + details.action =
//     "PLAYGROUND_GOVERNED_TRANSITION_PROPOSED" / "_DECLINED")
//   - ADR-0075 Section 5 Wave 8 Governed-Transition Contract
//     (full sub-decision lineage at §1-§23)
//   - ADR-0074 Section 5 Wave 7 Best-Path Recommendation
//     Contract (input source verbatim via §7 internal
//     invocation)
//   - ADR-0057 Section 2 Action runtime substrate
//     (createActionForCaller is the canonical entry point;
//     Section 2's policy evaluator + dual-control + audit
//     chain govern approval verbatim)

import { writeAuditEvent } from "@niov/database";
import { createActionForCaller } from "../action/action.service.js";
import type {
  PlaygroundBestPathRecommendationService,
  PlaygroundRecommendationMode,
  PlaygroundActionTransitionReadiness,
  RecommendBestPathInput,
} from "./playground-best-path-recommendation.service.js";
import { PLAYGROUND_RECOMMENDATION_MODE_VALUES } from "./playground-best-path-recommendation.service.js";
import type { PlaygroundComparisonMode } from "./playground-outcome-comparison.service.js";
import {
  PLAYGROUND_CANDIDATE_TYPE_VALUES,
  type PlaygroundCandidateType,
} from "./playground-candidate.service.js";
import type {
  PlaygroundScenarioFailureCode,
  PlaygroundScenarioService,
} from "./playground-scenario.service.js";

// WHAT: Closed-vocabulary transition_outcome set per
//        ADR-0075 §3.
export const PLAYGROUND_TRANSITION_OUTCOME_VALUES = [
  "ACTION_PROPOSED",
  "NO_ACTION_PROPOSED",
] as const;
export type PlaygroundTransitionOutcome =
  (typeof PLAYGROUND_TRANSITION_OUTCOME_VALUES)[number];

// WHAT: Closed-vocabulary reason_not_proposed set per
//        ADR-0075 §5.
export const PLAYGROUND_REASON_NOT_PROPOSED_VALUES = [
  "STATUS_QUO_NOT_TRANSITIONABLE",
  "DO_NOT_PROCEED_BLOCKED",
  "BLOCKED_BY_POLICY_OR_GOVERNANCE",
  "BLOCKED_BY_ACTION_RUNTIME_TRANSITION_HINT",
] as const;
export type PlaygroundReasonNotProposed =
  (typeof PLAYGROUND_REASON_NOT_PROPOSED_VALUES)[number];

// WHAT: Allowed ActionType v1 mapping per ADR-0075 §4.
//        Conservative — only SEND_INTERNAL_NOTIFICATION.
//        Adding new ActionTypes requires future Founder-
//        authorized ADR-0075 amendment.
const ALLOWED_V1_ACTION_TYPES = [
  "SEND_INTERNAL_NOTIFICATION",
] as const;
type Wave8AllowedActionType = (typeof ALLOWED_V1_ACTION_TYPES)[number];

// WHAT: Body shape for POST
//        /api/v1/playground/scenarios/:id/governed-transitions.
// INPUT: Used as a parameter type at the service boundary.
// OUTPUT: None.
// WHY: Per ADR-0075 §2: caller_confirmation REQUIRED literal
//      boolean true; idempotency_key REQUIRED; optional
//      intended_action_type + Wave 7/6/5 passthrough params.
//      NO candidate_keys[] (inherited from Founder QLOCK 2).
//      NO caller-supplied recommendation/comparison/candidate
//      payloads. NO execute/auto_approve/bypass flags. NO
//      action_id (Wave 8 creates the Action; caller cannot
//      reuse an existing action_id).
export interface ProposeGovernedTransitionInput {
  caller_confirmation?: unknown;
  intended_action_type?: unknown;
  idempotency_key?: unknown;
  candidate_types?: unknown;
  max_candidates?: unknown;
  comparison_mode?: unknown;
  recommendation_mode?: unknown;
}

export type PlaygroundGovernedTransitionFailureCode =
  | PlaygroundScenarioFailureCode
  | "IDEMPOTENCY_KEY_COLLISION";

export interface PlaygroundGovernedTransitionFailure {
  ok: false;
  code: PlaygroundGovernedTransitionFailureCode;
  message: string;
  invalid_fields?: readonly string[];
}

export interface ProposeGovernedTransitionSuccess {
  ok: true;
  scenario_id: string;
  transitioned_at: string;
  transition_outcome: PlaygroundTransitionOutcome;
  recommended_candidate_key: string;
  recommended_candidate_type: PlaygroundCandidateType;
  recommendation_summary: string;

  // Only populated when transition_outcome = ACTION_PROPOSED:
  action_id?: string;
  action_status?: string;
  action_type?: string;
  action_risk_tier?: string;
  action_decision?: string;
  escalation_id?: string | null;

  // Only populated when transition_outcome = NO_ACTION_PROPOSED:
  reason_not_proposed?: PlaygroundReasonNotProposed;

  required_approvals: readonly string[];
  required_reviews: readonly string[];
  human_decision_required: boolean;
  honest_note: string;
  playground_audit_event_id: string;
  action_audit_event_id?: string;
}

// WHAT: ADR-0075 §14 bounded counts canonical at the
//        discipline register.
const PAYLOAD_SUMMARY_MAX_CHARS = 400;
// Section 2's SEND_INTERNAL_NOTIFICATION body_summary cap
// (NOTIFICATION_BODY_SUMMARY_MAX_CHARS = 200) is stricter;
// Wave 8 respects whichever is smaller.
const NOTIFICATION_BODY_SUMMARY_MAX_CHARS = 200;
const NOTIFICATION_CLASS_MAX_CHARS = 64;
const CANDIDATES_CONSIDERED_MAX = 8;

// WHAT: The canonical honest_note per ADR-0075 §18.
const HONEST_NOTE =
  "This governed transition is advisory only. Any resulting " +
  "Action is in PROPOSED, APPROVED, or REJECTED status only " +
  "at this response moment — NEVER executed by Wave 8. " +
  "Section 2 Action runtime governs all subsequent approvals " +
  "and execution per ADR-0057. This is not a final decision " +
  "and is not legal advice.";

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
  return (
    value === "DETERMINISTIC_RUBRIC" ||
    value === "CANDIDATE_FIELD_PROJECTION"
  );
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

// WHAT: Type guard for the v1-allowed ActionType mapping
//        per ADR-0075 §4.
function isAllowedV1ActionType(
  value: unknown,
): value is Wave8AllowedActionType {
  return (
    typeof value === "string" &&
    (ALLOWED_V1_ACTION_TYPES as readonly string[]).includes(value)
  );
}

// WHAT: Map recommended_candidate_type → ActionType per
//        ADR-0075 §4 v1 mapping.
// INPUT: A PlaygroundCandidateType.
// OUTPUT: { transitionable: true, action_type } |
//         { transitionable: false, reason }.
// WHY: Per ADR-0075 §4 v1 mapping table. STATUS_QUO and
//      DO_NOT_PROCEED are non-transitionable (closed-vocab
//      reason_not_proposed). All other types map to
//      SEND_INTERNAL_NOTIFICATION as the safe v1 default.
function mapRecommendationToActionType(
  candidateType: PlaygroundCandidateType,
):
  | { transitionable: true; action_type: Wave8AllowedActionType }
  | { transitionable: false; reason: PlaygroundReasonNotProposed } {
  switch (candidateType) {
    case "STATUS_QUO":
      return { transitionable: false, reason: "STATUS_QUO_NOT_TRANSITIONABLE" };
    case "DO_NOT_PROCEED":
      return { transitionable: false, reason: "DO_NOT_PROCEED_BLOCKED" };
    case "LOW_RISK_INCREMENTAL":
    case "SPEED_OPTIMIZED":
    case "COST_OPTIMIZED":
    case "COMPLIANCE_FIRST":
    case "CUSTOMER_IMPACT_FIRST":
    case "OPERATIONAL_RESILIENCE":
    case "HUMAN_REVIEW_REQUIRED":
      return { transitionable: true, action_type: "SEND_INTERNAL_NOTIFICATION" };
  }
}

// WHAT: Build the closed-style payload_summary for the
//        Action row per ADR-0075 §6.
function buildPayloadSummary(args: {
  scenario_id: string;
  candidate_type: PlaygroundCandidateType;
  recommendation_mode: PlaygroundRecommendationMode;
}): string {
  const summary =
    `Agent Playground governed transition: ${args.candidate_type} ` +
    `recommendation for scenario ${args.scenario_id} ` +
    `(mode=${args.recommendation_mode}). Internal notification ` +
    `proposed; not executed; requires governance review per Wave ` +
    `7 recommendation.`;
  return summary.slice(0, PAYLOAD_SUMMARY_MAX_CHARS);
}

// WHAT: Build the closed-style body_summary for the
//        SEND_INTERNAL_NOTIFICATION payload per Section 2's
//        validator (≤200 chars).
function buildNotificationBodySummary(args: {
  candidate_type: PlaygroundCandidateType;
}): string {
  const summary =
    `Playground recommended ${args.candidate_type}. ` +
    `Review and approve via Section 2 Action runtime; not ` +
    `executed.`;
  return summary.slice(0, NOTIFICATION_BODY_SUMMARY_MAX_CHARS);
}

// WHAT: Build the SAFE Wave 8 metadata for the
//        notification's body_redacted field per ADR-0075
//        §6. Closed-vocab JSON object; NEVER raw text.
function buildBodyRedactedMetadata(args: {
  scenario_id: string;
  recommended_candidate_key: string;
  recommended_candidate_type: PlaygroundCandidateType;
  recommendation_mode: PlaygroundRecommendationMode;
  comparison_mode: PlaygroundComparisonMode;
  recommendation_reasons: readonly string[];
  governance_findings: readonly string[];
  required_reviews: readonly string[];
  action_transition_readiness: PlaygroundActionTransitionReadiness;
  human_decision_required: boolean;
  playground_audit_event_id: string;
}): Record<string, unknown> {
  return {
    source: "agent_playground_wave_8",
    scenario_id: args.scenario_id,
    recommended_candidate_key: args.recommended_candidate_key,
    recommended_candidate_type: args.recommended_candidate_type,
    recommendation_mode: args.recommendation_mode,
    comparison_mode: args.comparison_mode,
    recommendation_reasons: [...args.recommendation_reasons],
    governance_findings: [...args.governance_findings],
    required_reviews: [...args.required_reviews],
    action_transition_readiness: args.action_transition_readiness,
    human_decision_required: args.human_decision_required,
    playground_audit_event_id: args.playground_audit_event_id,
  };
}

// WHAT: The Agent Playground Wave 8 Option A deterministic
//        governed-transition service.
// INPUT: PlaygroundBestPathRecommendationService (for
//        internal Wave 7 invocation per ADR-0075 §7) +
//        PlaygroundScenarioService (for owner attribution
//        on the Playground handoff audit row).
// OUTPUT: A single method `proposeTransition`.
// WHY: Single class so future Wave 9 / Wave 10 services can
//      compose against a stable interface. The service
//      enforces: (1) auth + owner-first + same-org via
//      Wave 7 → Wave 6 → Wave 5 → Wave 4 delegation;
//      (2) closed-vocab body validation incl. mandatory
//      caller_confirmation + idempotency_key per ADR-0075
//      §12 + §13; (3) deterministic recommendation →
//      ActionType mapping per ADR-0075 §4; (4) Section 2
//      delegation via createActionForCaller per ADR-0075
//      §8 (Section 2's policy evaluator + dual-control
//      machinery governs approval verbatim); (5) dual
//      audit emission per ADR-0075 §9. NO Action execution
//      (Section 2 owns execution).
export class PlaygroundGovernedTransitionService {
  constructor(
    private readonly recommendations: PlaygroundBestPathRecommendationService,
    private readonly scenarios: PlaygroundScenarioService,
  ) {}

  // WHAT: Propose a governed transition for a stored
  //        scenario per ADR-0075.
  async proposeTransition(
    sessionToken: string,
    scenarioId: string,
    body: ProposeGovernedTransitionInput,
    context: { ip_address?: string | null } = {},
  ): Promise<
    | ProposeGovernedTransitionSuccess
    | PlaygroundGovernedTransitionFailure
  > {
    // 1. Body validation — closed-vocab + mandatory fields.
    const invalidFields: string[] = [];

    // caller_confirmation MUST be literal boolean true per
    // ADR-0075 §12.
    if (body.caller_confirmation !== true) {
      invalidFields.push("caller_confirmation");
    }

    // idempotency_key REQUIRED per ADR-0075 §13. Section 2
    // also validates length + format; Wave 8 validates
    // shape + presence here.
    if (
      typeof body.idempotency_key !== "string" ||
      body.idempotency_key.length === 0 ||
      body.idempotency_key.length > 200
    ) {
      invalidFields.push("idempotency_key");
    }

    let intendedActionType: Wave8AllowedActionType | undefined = undefined;
    if (body.intended_action_type !== undefined) {
      if (!isAllowedV1ActionType(body.intended_action_type)) {
        invalidFields.push("intended_action_type");
      } else {
        intendedActionType = body.intended_action_type;
      }
    }

    // candidate_types[] / max_candidates / comparison_mode /
    // recommendation_mode validation — passes through to
    // Wave 7 + Wave 6 + Wave 5. Wave 7 itself validates
    // closed vocab; Wave 8 only validates basic shape here
    // to fail-fast on type mismatch.
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
      }
    }
    if (
      body.comparison_mode !== undefined &&
      !isComparisonMode(body.comparison_mode)
    ) {
      invalidFields.push("comparison_mode");
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

    // 2. Internally invoke Wave 7 per ADR-0075 §7. NEVER
    //    accept caller-supplied recommendation payloads.
    const recommendInput: RecommendBestPathInput = {};
    if (body.candidate_types !== undefined) {
      recommendInput.candidate_types = body.candidate_types;
    }
    if (body.max_candidates !== undefined) {
      recommendInput.max_candidates = body.max_candidates;
    }
    if (body.comparison_mode !== undefined) {
      recommendInput.comparison_mode = body.comparison_mode;
    }
    if (body.recommendation_mode !== undefined) {
      recommendInput.recommendation_mode = body.recommendation_mode;
    }

    const wave7Result = await this.recommendations.recommendBestPath(
      sessionToken,
      scenarioId,
      recommendInput,
      { ip_address: context.ip_address ?? null },
    );
    if (wave7Result.ok === false) {
      return wave7Result;
    }

    // 3. Validate that intendedActionType (if supplied)
    //    matches the §4 mapping for the recommended
    //    candidate_type.
    const mapping = mapRecommendationToActionType(
      wave7Result.recommended_candidate_type,
    );
    if (
      intendedActionType !== undefined &&
      mapping.transitionable === true &&
      intendedActionType !== mapping.action_type
    ) {
      return {
        ok: false,
        code: "INVALID_REQUEST",
        message:
          `intended_action_type does not match the v1 mapping for ` +
          `candidate_type ${wave7Result.recommended_candidate_type}`,
        invalid_fields: ["intended_action_type"],
      };
    }

    // 4. Look up the scenario owner for audit attribution +
    //    Action recipient. The Wave 7 service already
    //    validated session + owner-first scope; this is a
    //    fast indexed lookup mirroring the Wave 6/7 audit-
    //    attribution pattern.
    const scenarioLookup = await this.scenarios.getScenario(
      sessionToken,
      wave7Result.scenario_id,
    );
    if (scenarioLookup.ok === false) {
      return scenarioLookup;
    }
    const ownerEntityId = scenarioLookup.scenario.owner_entity_id;

    // 5. If the recommendation is non-transitionable
    //    (STATUS_QUO / DO_NOT_PROCEED), emit the
    //    Playground handoff DECLINED audit and return
    //    NO_ACTION_PROPOSED.
    if (mapping.transitionable === false) {
      const declinedAudit = await writeAuditEvent({
        event_type: "ADMIN_ACTION",
        outcome: "SUCCESS",
        actor_entity_id: ownerEntityId,
        target_entity_id: ownerEntityId,
        ip_address: context.ip_address ?? null,
        details: {
          action: "PLAYGROUND_GOVERNED_TRANSITION_DECLINED",
          scenario_id: wave7Result.scenario_id,
          recommended_candidate_key: wave7Result.recommended_candidate_key,
          recommended_candidate_type: wave7Result.recommended_candidate_type,
          recommendation_mode: wave7Result.recommendation_mode,
          reason_not_proposed: mapping.reason,
          caller_confirmation_received: true,
        },
      });
      return {
        ok: true,
        scenario_id: wave7Result.scenario_id,
        transitioned_at: new Date().toISOString(),
        transition_outcome: "NO_ACTION_PROPOSED",
        recommended_candidate_key: wave7Result.recommended_candidate_key,
        recommended_candidate_type: wave7Result.recommended_candidate_type,
        recommendation_summary: wave7Result.recommendation_summary,
        reason_not_proposed: mapping.reason,
        required_approvals: [],
        required_reviews: wave7Result.required_reviews.slice(0, 9),
        human_decision_required: true,
        honest_note: HONEST_NOTE,
        playground_audit_event_id: declinedAudit.audit_id,
      };
    }

    // 6. Wave 7 carries `blocked_by_policy` even on
    //    transitionable candidate types. If the Wave 7
    //    surfaces a blocked posture, decline at Wave 8
    //    rather than create an Action that Section 2 would
    //    immediately REJECT.
    if (
      wave7Result.blocked_by_policy === true ||
      wave7Result.action_runtime_transition_hint === "BLOCKED"
    ) {
      const blockedReason: PlaygroundReasonNotProposed =
        wave7Result.blocked_by_policy === true
          ? "BLOCKED_BY_POLICY_OR_GOVERNANCE"
          : "BLOCKED_BY_ACTION_RUNTIME_TRANSITION_HINT";
      const declinedAudit = await writeAuditEvent({
        event_type: "ADMIN_ACTION",
        outcome: "SUCCESS",
        actor_entity_id: ownerEntityId,
        target_entity_id: ownerEntityId,
        ip_address: context.ip_address ?? null,
        details: {
          action: "PLAYGROUND_GOVERNED_TRANSITION_DECLINED",
          scenario_id: wave7Result.scenario_id,
          recommended_candidate_key: wave7Result.recommended_candidate_key,
          recommended_candidate_type: wave7Result.recommended_candidate_type,
          recommendation_mode: wave7Result.recommendation_mode,
          reason_not_proposed: blockedReason,
          caller_confirmation_received: true,
        },
      });
      return {
        ok: true,
        scenario_id: wave7Result.scenario_id,
        transitioned_at: new Date().toISOString(),
        transition_outcome: "NO_ACTION_PROPOSED",
        recommended_candidate_key: wave7Result.recommended_candidate_key,
        recommended_candidate_type: wave7Result.recommended_candidate_type,
        recommendation_summary: wave7Result.recommendation_summary,
        reason_not_proposed: blockedReason,
        required_approvals: [],
        required_reviews: wave7Result.required_reviews.slice(0, 9),
        human_decision_required: true,
        honest_note: HONEST_NOTE,
        playground_audit_event_id: declinedAudit.audit_id,
      };
    }

    // 7. Emit the Playground handoff PROPOSED audit FIRST,
    //    so the body_redacted metadata can carry its
    //    audit_event_id for traceability.
    const playgroundAudit = await writeAuditEvent({
      event_type: "ADMIN_ACTION",
      outcome: "SUCCESS",
      actor_entity_id: ownerEntityId,
      target_entity_id: ownerEntityId,
      ip_address: context.ip_address ?? null,
      details: {
        action: "PLAYGROUND_GOVERNED_TRANSITION_PROPOSED",
        scenario_id: wave7Result.scenario_id,
        recommended_candidate_key: wave7Result.recommended_candidate_key,
        recommended_candidate_type: wave7Result.recommended_candidate_type,
        recommendation_mode: wave7Result.recommendation_mode,
        intended_action_type: mapping.action_type,
        caller_confirmation_received: true,
      },
    });

    // 8. Construct Section 2 Action payload per ADR-0075 §6.
    //    payload_redacted must satisfy Section 2's
    //    SEND_INTERNAL_NOTIFICATION shape:
    //    recipient_entity_id + notification_class +
    //    body_summary (+ optional body_redacted carrying
    //    Wave 8 metadata).
    const notificationPayload: Record<string, unknown> = {
      recipient_entity_id: ownerEntityId,
      notification_class: "PLAYGROUND_GOVERNED_TRANSITION",
      body_summary: buildNotificationBodySummary({
        candidate_type: wave7Result.recommended_candidate_type,
      }),
      body_redacted: buildBodyRedactedMetadata({
        scenario_id: wave7Result.scenario_id,
        recommended_candidate_key: wave7Result.recommended_candidate_key,
        recommended_candidate_type: wave7Result.recommended_candidate_type,
        recommendation_mode: wave7Result.recommendation_mode,
        comparison_mode:
          body.comparison_mode !== undefined &&
          isComparisonMode(body.comparison_mode)
            ? body.comparison_mode
            : "DETERMINISTIC_RUBRIC",
        recommendation_reasons: wave7Result.recommendation_reasons,
        governance_findings: wave7Result.governance_findings,
        required_reviews: wave7Result.required_reviews,
        action_transition_readiness: wave7Result.action_transition_readiness,
        human_decision_required: wave7Result.human_decision_required,
        playground_audit_event_id: playgroundAudit.audit_id,
      }),
    };

    // Validate notification_class length (defensive; the
    // constant value above is 30 chars which is well under
    // the 64-char cap, but we cap defensively in case
    // future extensions extend the string).
    if (
      (notificationPayload["notification_class"] as string).length >
      NOTIFICATION_CLASS_MAX_CHARS
    ) {
      // This should not occur with the static value above.
      return {
        ok: false,
        code: "INTERNAL_ERROR",
        message:
          "Wave 8 notification_class exceeded Section 2's length cap.",
      };
    }

    // 9. Delegate to Section 2's createActionForCaller per
    //    ADR-0075 §8. Section 2's policy evaluator + dual-
    //    control machinery governs approval verbatim.
    const actionResult = await createActionForCaller(ownerEntityId, {
      action_type: mapping.action_type,
      target_entity_id: null,
      idempotency_key: body.idempotency_key as string,
      payload_summary: buildPayloadSummary({
        scenario_id: wave7Result.scenario_id,
        candidate_type: wave7Result.recommended_candidate_type,
        recommendation_mode: wave7Result.recommendation_mode,
      }),
      payload_redacted: notificationPayload,
    });

    // 10. Map Section 2 result → Wave 8 response.
    if (actionResult.ok === false) {
      // Surface Section 2's failure verbatim. Common cases:
      // 409 idempotency collision; 401/403 auth failure;
      // 422 validation failure; 503 transient.
      const httpStatus = actionResult.httpStatus;
      const sectionTwoCode = actionResult.code;
      if (httpStatus === 409) {
        return {
          ok: false,
          code: "IDEMPOTENCY_KEY_COLLISION",
          message:
            actionResult.message ??
            "idempotency_key collides with an existing Action.",
        };
      }
      // Other Section 2 errors map back to scenario-failure
      // shape since Wave 8 has no native vocabulary for
      // them. Use INTERNAL_ERROR for anything not auth-
      // related; the Section 2 message + code is surfaced.
      if (httpStatus === 401 || httpStatus === 403) {
        return {
          ok: false,
          code: "OPERATION_NOT_PERMITTED",
          message:
            actionResult.message ??
            `Section 2 Action runtime rejected the transition: ${sectionTwoCode}`,
        };
      }
      return {
        ok: false,
        code: "INTERNAL_ERROR",
        message:
          actionResult.message ??
          `Section 2 Action runtime returned ${sectionTwoCode}`,
      };
    }

    // 11. Section 2 succeeded — populate the Wave 8
    //     ACTION_PROPOSED response from the SafeActionView
    //     (apps/api/src/services/action/views.ts:43). The
    //     view exposes action_id + status + action_type +
    //     risk_tier + requires_approval + optional
    //     escalation_id + optional decision_reason.
    const view = actionResult.view;
    const actionId = view.action_id;
    const actionStatus: string = view.status;
    const actionTypeReturned = view.action_type;
    const actionRiskTier = view.risk_tier;
    const escalationId: string | null = view.escalation_id ?? null;
    // Derive the closed-vocab action_decision from
    // status + escalation_id + decision_reason per ADR-0057
    // §1 + §5 lifecycle: APPROVED = AUTO_APPROVE;
    // PROPOSED + escalation_id = REQUIRE_DUAL_CONTROL;
    // PROPOSED + decision_reason="REQUIRE_BREAK_GLASS" =
    // REQUIRE_BREAK_GLASS; REJECTED = FORBIDDEN.
    let actionDecision: string | undefined;
    if (actionStatus === "APPROVED") {
      actionDecision = "AUTO_APPROVE";
    } else if (actionStatus === "PROPOSED" && escalationId !== null) {
      actionDecision = "REQUIRE_DUAL_CONTROL";
    } else if (
      actionStatus === "PROPOSED" &&
      view.decision_reason === "REQUIRE_BREAK_GLASS"
    ) {
      actionDecision = "REQUIRE_BREAK_GLASS";
    } else if (actionStatus === "REJECTED") {
      actionDecision = "FORBIDDEN";
    }

    // Wave 8 honest-note posture: human_decision_required is
    // TRUE whenever Wave 7's flag was true OR Section 2's
    // decision is not AUTO_APPROVE OR action_status is
    // REJECTED.
    const humanDecisionRequired =
      wave7Result.human_decision_required === true ||
      actionDecision !== "AUTO_APPROVE" ||
      actionStatus === "REJECTED";

    return {
      ok: true,
      scenario_id: wave7Result.scenario_id,
      transitioned_at: new Date().toISOString(),
      transition_outcome: "ACTION_PROPOSED",
      recommended_candidate_key: wave7Result.recommended_candidate_key,
      recommended_candidate_type: wave7Result.recommended_candidate_type,
      recommendation_summary: wave7Result.recommendation_summary,
      action_id: actionId,
      action_status: actionStatus,
      action_type: actionTypeReturned,
      action_risk_tier: actionRiskTier,
      ...(actionDecision !== undefined
        ? { action_decision: actionDecision }
        : {}),
      escalation_id: escalationId,
      required_approvals: [],
      required_reviews: wave7Result.required_reviews.slice(0, 9),
      human_decision_required: humanDecisionRequired,
      honest_note: HONEST_NOTE,
      playground_audit_event_id: playgroundAudit.audit_id,
      // Section 2's own audit_event_id is not exposed on
      // SafeActionView (per views.ts:43-53). Wave 8 omits
      // `action_audit_event_id` from the response when not
      // available; ADR-0075 §1 lists it as optional.
    };
  }
}
