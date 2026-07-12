// FILE: otzar.service.ts
// PURPOSE: The Otzar conversational service. conductSession runs
//          STEP 0 priming + 8-layer context assembly + P3 token-
//          budget truncation + LLM call. closeConversation writes
//          a CONVERSATION_LEARNING capsule to the EMPLOYEE wallet
//          (portability invariant) and fires the COE recordOutcome
//          hook so Loop 1 (relevance scoring) updates. Auto-close
//          sweep iterates ACTIVE OtzarConversation rows and closes
//          those idle for >30 minutes.
// CONNECTS TO: AuthService (session), COEService (assembleContext +
//              recordOutcome), LLMProvider (generation), KVCache
//              (priming + last_active + first-convo-today flag),
//              prisma (capsule + conversation + metrics rows).

import { createHash, randomUUID } from "node:crypto";
import {
  normalizeDocumentContextSeed,
  seedDocumentContextForCaller,
} from "./document-context.service.js";
// [DOC-EXTRACT] review-first extraction preview (read-only).
import { extractDocumentWorkPreview } from "./document-extraction.service.js";
import {
  prisma,
  writeAuditEvent,
  appendConversationTurn,
  createThread,
  createOrGetRequest,
  claimRequestProcessing,
  completeRequestWithCanonicalResponse,
  failRequest,
  linkRequestAction,
  restoreActiveThread,
  listRecentThreads,
  getThreadForRestore,
  getRequestStatusForUser,
  getRequestByClient,
  listUnresolvedRequests,
  type ThreadSummary,
  type SafeTurn,
  type SafeRequestStatus,
  IdempotencyConflictError,
  ThreadScopeError,
  type CapsuleType,
  type ResponseClass,
  // [OTZAR STAGE-2 §5] Obligation layer.
  createOrGetObligation,
  listObligations,
  getObligationForScope,
  acknowledgeObligation,
  startObligation,
  blockObligation,
  escalateObligation,
  cancelObligation,
  expireObligation,
  completeObligation,
  reassignObligation,
  supersedeObligation,
  projectObligationFromAwaitingConfirmation,
  projectObligationFromUnresolvedQuestion,
  validateResponsibleEntity,
  // [OTZAR STAGE-2 §L] Handoff layer.
  createOrGetHandoff,
  listHandoffs,
  getHandoffForScope,
  listHandoffObligations,
  readyHandoff,
  sendHandoff,
  receiveHandoff,
  acknowledgeHandoff,
  requestClarificationHandoff,
  escalateHandoff,
  linkObligationToHandoff,
  disposeHandoffObligation,
  completeHandoff,
  supersedeHandoff,
  // [OTZAR STAGE-2 TRUTH-EVIDENCE] evidence-snapshot reads.
  listSnapshotsForObligation,
  listSnapshotsForHandoff,
  resolveCurrentSourceStatus,
  type SafeEvidenceSnapshot,
  type SafeHandoff,
  type HandoffScope,
  type HandoffState,
  type HandoffDisposition,
  type CreateHandoffInput,
  type HandoffOutcome,
  type SafeObligation,
  type ObligationScope,
  type CreateObligationInput,
  type ListObligationsOptions,
  type ObligationState,
  type ObligationType,
  type TransitionOutcome,
} from "@niov/database";
import type { OtzarConversationTurn } from "@prisma/client";
import { resolveAuthoritativeThread } from "./thread-resolution.service.js";
import { logger } from "../../logger.js";
import type { AuthService } from "../auth.service.js";
import type { COEService } from "../coe/coe.service.js";
import type { LLMProvider, LLMResult } from "../llm/llm.service.js";
import type { KVCache } from "./cache.js";
import type {
  AcceptedPatternAdvisoryView,
  OtzarProposedPatternService,
} from "./proposed-pattern.service.js";
import { getPriming } from "./priming.js";
import {
  buildIdentityContext,
  renderIdentityPreamble,
  type IdentityContext,
} from "./identity-context.js";
import {
  extractProposedAction,
  type ProposedAction,
} from "./proposed-action-extractor.js";
import {
  extractFromCapturedText,
  type CommsExtractionResult,
  type CommsExtractionMode,
} from "./comms-extract.service.js";
import { ingestTranscript, ingestSourceEvent as ingestSourceEventCore } from "./comms-ingest.service.js";
import type { WorkSourceEvent, SourceSystem } from "./source-event.js";
import { groundContextForAgent } from "../work-os/org-query.service.js";
import { formatWorkGroundingBlock } from "../work-os/work-grounding.js";
import type { IngestTranscriptResult } from "./comms-ingest.service.js";
import {
  truncateToTokenBudget,
  TokenBudgetExceededError,
  type LayerBundle,
} from "./truncation.js";
import {
  projectOtzarTransparency,
  type ChatTransparency,
  type ContextProvenanceItem,
} from "./transparency.js";
import {
  projectConversationDetail,
  type ConversationDetailView,
} from "./conversation-detail.js";
import {
  projectConversationCorrections,
  type ConversationCorrectionsView,
} from "./conversation-corrections.js";
import {
  analyzeConversationDrift,
  type ConversationDriftSignalsSuccess,
  type GetConversationDriftSignalsInput,
} from "./drift-signal.service.js";
import {
  analyzeStaleContextForCaller,
  computeStaleContextLabelForEntity,
  type GetStaleContextSignalInput,
  type StaleContextSignalSuccess,
  type StaleContextSignalFailure,
} from "./stale-context-signal.service.js";
import {
  analyzeDriftRollupForCaller,
  computeDriftRollupLabelForEntity,
  type GetDriftRollupInput,
  type DriftRollupSuccess,
  type DriftRollupFailure,
} from "./drift-rollup.service.js";
import {
  assembleProactiveCards,
  type ProactiveCardView,
} from "./proactivity.service.js";
import {
  computePendingApprovalsSummaryForCaller,
  type TwinPendingApprovalsSummary,
} from "./twin-pending-approvals.js";
import {
  computeRecentActionSummaryForCaller,
  type TwinRecentActionSummary,
} from "./twin-recent-actions.js";
import {
  computeMemoryScopeSummaryForCaller,
  type TwinMemoryScopeSummary,
} from "./twin-memory-scope.js";
import {
  computeActiveGrantsSummaryForCaller,
  type TwinActiveGrantsSummary,
} from "./twin-active-grants.js";
import {
  computeActiveAuthoritySummaryForCaller,
  type TwinActiveAuthoritySummary,
} from "./twin-active-authority.js";
import {
  computePersonalPreferencesSummaryForCaller,
  type TwinPersonalPreferencesSummary,
} from "./twin-personal-preferences.js";
import {
  computeCollaborationInboxSummaryForCaller,
  type TwinCollaborationInboxSummary,
} from "./twin-collaboration-inbox.js";
import {
  computeProjectContextSummaryForCaller,
  type TwinProjectContextSummary,
} from "./twin-project-context.js";
import {
  computeVoiceReadinessState,
  type TwinVoiceReadinessState,
} from "./twin-voice-readiness.js";
import {
  computeVoiceOutputSupported,
  toSpeechReadyText,
} from "./speech-ready.js";
import {
  detectApprovalRequirement,
  type ApprovalReason,
} from "./approval-detection.js";
import type {
  TwinAuthorityDurationClass,
  TwinCollaborationTargetType,
} from "@prisma/client";

// WHAT: Maximum messages allowed in client-supplied L8 history.
const L8_MAX_MESSAGES = 50;

// WHAT: Section 11B null-role-template fallback. Substituted with
//        twin display_name + owner display_name at build time.
//        Documented as a deliberate fallback so future maintainers
//        know it's intentional (not a bug to "fix" by stripping the
//        template).
const NULL_ROLE_TEMPLATE_FALLBACK =
  "You are {twin_display_name}, a digital twin assistant for {owner_display_name}. " +
  "You exist to extend their working capacity. Defer to your owner on permission " +
  "grants, financial decisions, and any high-stakes external commitments. When " +
  "uncertain, ask before acting.";

// WHAT: How long the Redis flag for "first conversation of the day"
//        survives. Computed dynamically each set: seconds until
//        next 04:00 local. Tests that need to skip the morning
//        brief just pre-populate the flag.
function secondsUntilNext4amLocal(): number {
  const now = new Date();
  const target = new Date(now);
  target.setHours(4, 0, 0, 0);
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  return Math.ceil((target.getTime() - now.getTime()) / 1000);
}

// WHAT: How long Redis caches the "last active" timestamp for an
//        OtzarConversation. Auto-close sweep treats missing OR
//        stale-by-30min as eligible for close.
const LAST_ACTIVE_TTL_SECONDS = 7200;
const AUTO_CLOSE_STALE_THRESHOLD_MS = 30 * 60 * 1000;

// WHAT: Caller-facing input shape for conductSession.
export interface ConductSessionInput {
  token: string;
  message: string;
  conversation_id?: string;
  conversation_history?: string[];
  token_budget?: number;
  // [OTZAR-CONTINUITY P1] The caller's LIVE device timezone (IANA, e.g.
  // "America/Los_Angeles"), sent per-request so a traveling user's calendar
  // times resolve to where they actually are. Falls back to the stored per-user
  // EntityProfile.timezone, then a documented org fallback.
  client_timezone?: string;
  // [OTZAR-CONTINUITY P5 Stage 1] Stable client idempotency key for ONE logical user
  // submission. Retained across retries so a response-lost retry replays the stored
  // result instead of re-invoking the model/tool. Bounded, safe charset; validated.
  request_id?: string;
  // [OTZAR-CONTINUITY P5 Stage 1 §8] Accurate source channel for durable turn lineage.
  source_channel?: "CHAT" | "VOICE" | "AMBIENT";
}

// WHAT: Closed-vocab next-step label per the
//       [FOUNDER-AUTH — EVERYDAY EMPLOYEE DOMAIN GENERAL INTELLIGENCE
//       EXPERIENCE] directive Phase EDX-3 (ConductSession output
//       expansion). Each value names the next thing the employee /
//       UI should expect after the response is delivered. Closed-vocab
//       (no free-form strings) so consumers can switch on the value
//       without parsing prose.
//
// At this slice (slice 1 of the EDX-3 output expansion), conductSession
// always returns "ANSWERED" — there is no detection logic yet for
// clarification, action proposing, policy/scope blocking, or
// collaboration suggesting. Future EDX-3 slices add the detection
// substrate that flips this value to the other states; the closed-
// vocab is locked here so consumers can rely on it.
export type ConductNextStep =
  | "ANSWERED"
  | "NEEDS_CLARIFICATION"
  | "NEEDS_APPROVAL"
  | "ACTION_PROPOSED"
  | "ACTION_CREATED"
  | "BLOCKED_BY_POLICY"
  | "BLOCKED_BY_SCOPE"
  | "COLLABORATION_REQUEST_SUGGESTED"
  | "MEMORY_CORRECTION_AVAILABLE";

// WHAT: Successful conductSession return.
// ADR-0051 (Wave 1): `transparency` and `context_provenance` are ADDITIVE
// OPTIONAL fields surfacing the governed context metadata COE already
// produced. `ok`, `response`, `context_used`, `tokens_consumed`, and
// `conversation_id` are unchanged (backward-compatible).
//
// Phase EDX-3 slice 1 (Founder directive): `next_step` is an ADDITIVE
// closed-vocab field. Always populated when ok=true. At this slice the
// value is always "ANSWERED" because conductSession in its current form
// only answers; future slices wire in the detection logic for the other
// closed-vocab states without changing this contract.
//
// Phase EDX-3 slice 2: `correction_capture_available` is an ADDITIVE
// boolean signaling that the caller can submit a correction against
// the conversation via the LIVE `POST /api/v1/otzar/correction`
// endpoint (ADR-0055 Wave 2C). Always true at the Foundation tier —
// the substrate is always available for authenticated employees with
// a `read`-capable bearer session (the same session that conducted
// the chat). Lets the UI render the "correct this" affordance without
// guessing whether the substrate is ready.
//
// Phase EDX-3 slice 3: `speech_ready_text` is the response sanitized
// for TTS / device speech (Markdown / code blocks / links / headers
// stripped). `voice_output_supported` mirrors the EDX-1
// voice_readiness_state.live_audio_output — false at the Foundation
// tier today per ADR-0085 + ADR-0089 (live audio synthesis remains
// forward-substrate Founder-gated). Lets the UI hide / disable a
// "speak aloud" affordance that would otherwise produce no audio
// while still letting downstream consumers (e.g. a future client-side
// device TTS) reuse the speech-ready projection of the response.
//
// Phase EDX-3 slice 5: safe layer-breakdown projection of how memory
// was used to produce this response. Pure summary of the 8-layer COE
// assembly counts conductSession ALREADY computes internally for the
// `context_used` scalar — no new DB reads, no content surfaced, no
// per-item scores, no capsule IDs (those live on the existing
// ADR-0051 `context_provenance` array, not here). Lets the UI render
// a calm "what your Twin considered" panel without consumers having
// to invert the COE truncation result themselves.
export interface MemoryUsedSummary {
  // L1 -- never-trim CORRECTION capsules read from the caller's wallet.
  layer_1_corrections: number;
  // L3 -- WORK_PATTERN / COMMUNICATION_PREF / DECISION_STYLE capsules.
  layer_3_work_profile: number;
  // L4 -- FOUNDATIONAL items returned by COE.assembleContext.
  layer_4_foundational: number;
  // L5 -- non-FOUNDATIONAL items returned by COE.assembleContext that
  //       survived truncation.
  layer_5_relevant_context: number;
  // L8 -- conversation_history messages supplied by the client that
  //       survived truncation.
  layer_8_history_messages: number;
  // Sum across the layers that participate in the response — matches
  // the existing top-level `context_used` scalar by construction so
  // the UI can use either value interchangeably.
  total_capsules: number;
}

// Phase EDX-3 slice 4: deterministic-false "denial of preconditions"
// envelope. Six required booleans naming the conditions that
// conductSession at this slice does NOT detect:
//   - `clarification_needed`     — no clarification-detection logic
//                                   yet (always false).
//   - `action_proposed`          — no action-proposing logic yet.
//                                   conductSession answers; it does
//                                   not propose into the Section 2
//                                   Action runtime from chat (always
//                                   false).
//   - `approval_required`        — no approval-detection logic yet.
//                                   ConductSession does not create
//                                   approval-blocked actions from
//                                   chat (always false).
//   - `policy_blocked`           — happy-path responses are not
//                                   policy-blocked. ConductSession
//                                   does not currently detect policy
//                                   blocking from chat (always false).
//   - `dmw_scope_blocked`        — COE handles wallet-scope filtering
//                                   internally; conductSession does
//                                   not surface a chat-tier DMW-scope-
//                                   blocked condition (always false).
//   - `collaboration_suggested`  — no collaboration substrate yet;
//                                   the collaboration model itself
//                                   is forward-substrate per Phase
//                                   EDX-6 (always false).
// Future EDX-3 slices add the detection substrate that flips
// individual booleans true and introduces the closed-vocab companion
// fields (`approval_reason` / `policy_block_reason` /
// `collaboration_target_type` / etc.) alongside their detection
// logic. The structural envelope is locked here so consumers can
// switch on the booleans without crashing when conditions are not
// detected.
export interface ConductSessionSuccess {
  ok: true;
  response: string;
  context_used: number;
  tokens_consumed: number;
  conversation_id: string;
  transparency?: ChatTransparency;
  context_provenance?: ContextProvenanceItem[];
  next_step: ConductNextStep;
  correction_capture_available: boolean;
  speech_ready_text: string;
  voice_output_supported: boolean;
  clarification_needed: boolean;
  action_proposed: boolean;
  approval_required: boolean;
  policy_blocked: boolean;
  dmw_scope_blocked: boolean;
  collaboration_suggested: boolean;
  // Phase EDX-3 slice 5: safe layer-breakdown projection of memory
  // usage. Pure summary of counts conductSession already computes
  // internally for the existing `context_used` scalar — see the
  // MemoryUsedSummary doc-comment above.
  memory_used_summary: MemoryUsedSummary;
  // Phase EDX-4 PR 4 — closed-vocab companion fields surfaced only
  // when approval_required flips true. The conservative detection
  // helper (`detectApprovalRequirement`) scans the caller's message
  // for action-like verbs / connector names / cross-team phrases
  // and supplies the reason + the duration options the UI offers
  // when the user opts to grant authority. Always omitted when
  // approval_required is false so consumers can treat their absence
  // as "no detection".
  approval_reason?: ApprovalReason;
  approval_duration_options?: ReadonlyArray<TwinAuthorityDurationClass>;
  // Phase EDX-6 — collaboration_suggested closed-vocab companion.
  // Surfaced only when collaboration_suggested flips true (the EDX-4
  // verb-scan detected CROSS_TEAM_REQUEST or CROSS_PROJECT_REQUEST).
  // Value names the kind of target the UI should suggest opening
  // a collaboration request against; the actual collaboration row
  // is NEVER auto-created from chat — the user explicitly opens
  // the collaboration affordance on the My Twin view.
  collaboration_target_type?: TwinCollaborationTargetType;
  // Phase 1208 [OTZAR-CHAT-ACTION-PROPOSE] -- structured envelope the
  // UI consumes to render an inline approval card under the chat
  // response. Surfaced only when the Phase 1207 canonical draft shape
  // is detected ("I found <Name>... Draft: '<text>'... Send this to
  // <Name>?"). Recipient is resolved against the IdentityContext
  // org_roster; falls back to the LLM's quoted name when not in
  // roster. NEVER auto-executes -- the Action row is created on
  // explicit operator approve click via POST /api/v1/actions.
  proposed_action?: ProposedAction;
}

// WHAT: Failure shape for conductSession + closeConversation.
export interface OtzarFailure {
  ok: false;
  code:
    | "SESSION_INVALID"
    | "SESSION_EXPIRED"
    | "SESSION_REVOKED"
    | "SESSION_INVALIDATED"
    | "OPERATION_NOT_PERMITTED"
    | "TWIN_NOT_FOUND"
    | "INVALID_HISTORY"
    | "TOKEN_BUDGET_EXCEEDED"
    | "LLM_UNAVAILABLE"
    | "CONVERSATION_NOT_FOUND"
    | "NOT_CONVERSATION_OWNER"
    // [OTZAR-CONTINUITY P5 Stage 1] durable-turn / idempotency / thread failures.
    | "INVALID_REQUEST_ID"
    | "OTZAR_REQUEST_ID_CONFLICT"
    | "OTZAR_TURN_PERSIST_FAILED"
    | "OTZAR_THREAD_FORBIDDEN"
    | "OTZAR_THREAD_CLOSED"
    | "OTZAR_REQUEST_IN_PROGRESS"
    | "OTZAR_ASSISTANT_TURN_PERSIST_FAILED"
    | "OTZAR_CONTINUITY_STATE_CHANGED"
    // [OTZAR STAGE-2 §5] obligation lifecycle failures.
    | "OTZAR_OBLIGATION_NOT_FOUND"
    | "OTZAR_OBLIGATION_STATE_CHANGED"
    | "OTZAR_OBLIGATION_ILLEGAL_TRANSITION"
    | "OTZAR_OBLIGATION_EVIDENCE_REQUIRED"
    | "OTZAR_OBLIGATION_NOT_ACKNOWLEDGEABLE"
    // [HARDENING] validation + audit-consistency failures.
    | "OTZAR_OBLIGATION_INVALID_INPUT"
    | "OTZAR_OBLIGATION_INVALID_REFERENCE"
    | "OTZAR_OBLIGATION_AUDIT_UNCOMMITTED"
    // [OTZAR STAGE-2 §L] handoff lifecycle failures.
    | "OTZAR_HANDOFF_NOT_FOUND"
    | "OTZAR_HANDOFF_STATE_CHANGED"
    | "OTZAR_HANDOFF_ILLEGAL_TRANSITION"
    | "OTZAR_HANDOFF_NOT_AUTHORIZED"
    | "OTZAR_HANDOFF_PRECONDITION"
    | "OTZAR_HANDOFF_INVALID_INPUT"
    | "OTZAR_HANDOFF_INVALID_REFERENCE"
    | "OTZAR_HANDOFF_AUDIT_UNCOMMITTED";
  message: string;
  detail?: unknown;
}

// [OTZAR-CONTINUITY C3] The only three safe conclusions of an atomic completion attempt:
// WE completed it (caller returns its own success), an existing validated canonical winner
// must be replayed instead, or a typed safe failure. Reconstructed/generated text is NEVER
// returned as success unless it was durably committed.
type FinishResult =
  | { kind: "durable" }
  | { kind: "replay"; success: ConductSessionSuccess }
  | { kind: "failure"; failure: OtzarFailure };

// WHAT: Inputs for closeConversation.
export interface CloseConversationInput {
  token: string;
  conversation_id: string;
  capsule_ids_used?: string[];
  conversation_history?: string[];
}

// WHAT: Successful closeConversation return.
export interface CloseConversationSuccess {
  ok: true;
  capsule_id: string;
  conversation_id: string;
  topics: string[];
}

// WHAT: Inputs for extractFromComms (Phase 1213).
// WHY: Token + the assembled captured text. force_mode lets the
//      operator (or tests) pin DEMO_SCRIPTED / LOCAL_FALLBACK
//      explicitly without changing the input text.
export interface ExtractCommsInput {
  token: string;
  captured_text: string;
  force_mode?: CommsExtractionMode;
}

// WHAT: Successful extractFromComms return.
// WHY: Closed-vocab; no DB ids leak. The CommsExtractionResult
//      carries the demo/LLM/local-fallback discriminator so the
//      CT UI can render an honest "this is demo capture mode"
//      banner when relevant.
export interface ExtractCommsSuccess {
  ok: true;
  extraction: CommsExtractionResult;
}

// WHAT: Inputs for ingestComms — the governed transcript → owned-work pass.
// WHY: Token + captured text (+ optional title / force_mode). Unlike
//      extractFromComms (ephemeral, read-only), ingest PERSISTS a durable
//      conversation record and creates per-owner Work Ledger rows, so it
//      requires "write" authority.
export interface IngestCommsInput {
  token: string;
  captured_text: string;
  title?: string;
  force_mode?: CommsExtractionMode;
  /** [CS-2] org-history seeding: ADMIN-GATED at the route; provided_by is
   *  always the authenticated caller (never client-supplied). */
  seeded?: { covering_period?: string | null };
}

export interface IngestCommsSuccess {
  ok: true;
  result: IngestTranscriptResult;
}

// WHAT: Inputs for ingestSourceEvent — Slice A source-agnostic intake. A
//       normalized source payload (any non-transcript source) + optional mode.
export interface IngestSourceEventInput {
  token: string;
  source: {
    sourceType?: string;
    sourceSystem: SourceSystem;
    sourceId: string;
    sourceUrl?: string | null;
    actor?: { name?: string; handle?: string; email?: string };
    participants?: Array<{ name: string; email?: string; handle?: string }>;
    timestamp?: string;
    title?: string | null;
    content: string;
    sensitivity?: "public" | "internal" | "confidential" | "restricted";
    connectorIdentity?: string | null;
    dedupeKey?: string | null;
    ingestionRunId?: string | null;
  };
  force_mode?: CommsExtractionMode;
}

export interface IngestCommsFailure {
  ok: false;
  code: string;
  message: string;
}

// WHAT: Inputs for getContextHealth.
// WHY: Token only -- caller is self-scoped via session.entity_id.
export interface GetContextHealthInput {
  token: string;
}

// WHAT: Successful getContextHealth return.
// WHY: Surfaces the same IdentityContext fields the LLM sees as
//      L0_IDENTITY, plus a discrete READY|PARTIAL|UNCONFIGURED
//      status for the Voice page badge.
export interface ContextHealthSuccess {
  ok: true;
  status: "READY" | "PARTIAL" | "UNCONFIGURED";
  identity: IdentityContext;
}

// WHAT: Inputs for getMyTwin.
export interface GetMyTwinInput {
  token: string;
  // Section 1 Wave 3 (ADR-0068) — explicit owner control. When
  // false, the proactive_cards sidecar is omitted from the
  // response. Default true (the symbiotic default; owners who
  // are working with their Twin probably want gentle proactive
  // signals).
  include_proactive_cards?: boolean;
}

// WHAT: One safe skill-package view for the My Twin contract.
// INPUT: Used as a value type only.
// OUTPUT: None.
// WHY: Friendly name + category ONLY. SkillPackage.capability_flags
//      (the raw capability envelope) is NEVER projected to the
//      employee-facing surface.
export interface MyTwinSkillView {
  name: string;
  category: string;
}

// WHAT: The employee's optional approver identity (the human who
//        approves this twin's escalations).
// INPUT: Used as a value type only.
// OUTPUT: None.
// WHY: entity_id + display_name ONLY -- no org-hierarchy internals.
export interface MyTwinApproverView {
  entity_id: string;
  display_name: string;
}

// ──────────────────────────────────────────────────────────────────
// ADR-0053 Wave 2A: the employee AI Twin role-scope profile.
//
// Every sub-shape below is a SAFE, SELF-SCOPED projection or a calm,
// product-facing label. These types NEVER carry raw permission internals,
// bridge IDs, capability flags, raw clearance values, permission-condition
// JSON, can_share_forward, capsule IDs, storage locations, transcript /
// message content, or any other employee's / cross-tenant data. No
// surveillance / monitoring / productivity-policing framing.
// ──────────────────────────────────────────────────────────────────

// WHAT: Identity block of the role-scope profile (mirrors safe twin fields).
export interface RoleScopeIdentity {
  twin_id: string;
  display_name: string;
  status: string;
}

// WHAT: Role block. Describes the EMPLOYEE's place (job_title / department /
//        hierarchy from the caller's own org membership) plus the twin's
//        role_title + admin flag. Self-scoped to the caller only.
export interface RoleScopeRole {
  role_title: string | null;
  job_title: string | null;
  department: string | null;
  hierarchy_level: number | null;
  is_admin_twin: boolean;
}

// WHAT: Scope summary. Counts + calm posture LABELS derived from the
//        caller's own active memberships. permission_posture /
//        approval_posture are friendly labels — NEVER raw RBAC/ABAC rows,
//        clearance, capability flags, or permission envelopes.
export interface RoleScopeSummary {
  scope_label: string;
  membership_count: number;
  active_membership_count: number;
  department_count: number;
  has_department_scope: boolean;
  has_multiple_memberships: boolean;
  permission_posture: string;
  approval_posture: string;
}

// WHAT: Assistance profile. What the twin is configured to help with.
export interface RoleScopeAssistanceProfile {
  autonomy_mode: string;
  swarm_enabled: boolean;
  role_template_status: "CONFIGURED" | "NOT_CONFIGURED";
  skills_status: "AVAILABLE" | "NOT_CONFIGURED";
  current_assistance_boundaries: string[];
}

// WHAT: Governance block. States the human-in-control posture in fixed,
//        safe literals — sensitive actions require permission/policy/
//        approval; observation is permissioned work context, NOT surveillance.
export interface RoleScopeGovernance {
  approver_configured: boolean;
  approver: MyTwinApproverView | null;
  sensitive_actions_require: "PERMISSION_POLICY_OR_APPROVAL";
  observation_mode: "PERMISSIONED_WORK_CONTEXT_NOT_SURVEILLANCE";
}

// WHAT: Continuity block. SELF-SCOPED COUNTS ONLY (caller's own
//        conversations + own-wallet CORRECTION / CONVERSATION_LEARNING
//        capsules). No raw content, no capsule IDs, no storage locations.
//        Wave 2A uses total self-scoped counts; the `recent_` prefix
//        reserves a future time-window refinement without a contract change.
export interface RoleScopeContinuity {
  recent_conversation_count: number;
  recent_correction_count: number;
  recent_learning_summary_count: number;
  alignment_signals_available: boolean;
}

// WHAT: The full role-scope profile (ADR-0053 Wave 2A). Additive, optional,
//        self-scoped projection attached to MyTwinView.
export interface MyTwinRoleScopeProfile {
  identity: RoleScopeIdentity;
  role: RoleScopeRole;
  scope_summary: RoleScopeSummary;
  assistance_profile: RoleScopeAssistanceProfile;
  governance: RoleScopeGovernance;
  continuity: RoleScopeContinuity;
}

// WHAT: The safe, product-facing projection of the caller's OWN twin.
// INPUT: Used as a value type only.
// OUTPUT: None.
// WHY: Identity + alignment fields only. Deliberately EXCLUDES
//      AgentTemplate.template_content (the system prompt),
//      SkillPackage.capability_flags (the raw capability envelope),
//      permission bridge IDs, and any memory / capsule / vector data.
export interface MyTwinView {
  twin_id: string;
  display_name: string;
  role_title: string | null;
  autonomy_mode: string;
  swarm_enabled: boolean;
  role_template: string | null;
  is_admin_twin: boolean;
  status: string;
  skills: MyTwinSkillView[];
  approver: MyTwinApproverView | null;
  created_at: Date;
  updated_at: Date;
  // ADR-0053 Wave 2A: additive, optional, self-scoped role-scope profile.
  // Existing fields above are unchanged (backward-compatible).
  role_scope_profile?: MyTwinRoleScopeProfile;
  // Section 1 Wave 6A: additive, optional, self-scoped symbiotic
  // advisory surface — the caller's OWN ACCEPTED OtzarProposedPattern
  // rows projected as alignment guidance per ADR-0066 + Founder
  // Wave 6A clarification. Absent when there are no accepted
  // patterns (preserves Wave 2A backward-compat for clients that
  // don't yet consume this field). NEVER includes pattern lifecycle
  // internals, raw correction text, occurrence counts, signal
  // timestamps, owner_entity_id, conversation IDs, embeddings,
  // capsule content, or cross-owner data — every field on each
  // row is the SAFE advisory subset enforced by
  // `AcceptedPatternAdvisoryView` at the proposed-pattern service.
  accepted_patterns?: readonly AcceptedPatternAdvisoryView[];
  // Section 1 Wave 3 (ADR-0068) — sidecar SAFE projection of
  // bounded closed-vocab proactive cards derived from the
  // caller's OWN existing self-scoped substrate (Wave 5 PROPOSED
  // / ACCEPTED readers + Wave 4A wallet-stale signal + Wave 4C
  // cross-conversation rollup + ACCEPTED reviewed_at periodic
  // check-in). Absent when no cards apply OR when the caller
  // explicitly disables via include_proactive_cards=false.
  // NO new schema; NO persistence; NO Action creation; NO
  // connector invocation; NO external delivery; NO manager
  // visibility; NO LLM-generated text. Owner-scope enforced
  // by-construction via session.entity_id; per-source read
  // failures swallowed silently per ADR-0068 §6.
  proactive_cards?: readonly ProactiveCardView[];
  // Phase EDX-1 employee Twin self-state extension per the
  // [FOUNDER-AUTH — EVERYDAY EMPLOYEE DOMAIN GENERAL
  // INTELLIGENCE EXPERIENCE] directive. SAFE projection of the
  // caller's pending approval inbox count + most-recent
  // timestamp from EscalationRequest substrate where the caller
  // is the *approver* (target_entity_id). NEVER includes
  // escalation_id / description / severity / source_entity_id /
  // capsule_id / resolution_metadata / raw EscalationType values.
  // Per-source read failures swallowed silently per the same
  // ADR-0068 §6 pattern the proactive_cards sidecar uses, so a
  // transient miss never breaks the My Twin read.
  pending_approvals_summary?: TwinPendingApprovalsSummary;
  // Phase EDX-1 employee Twin self-state extension —
  // recent_action_summary sidecar. SAFE projection of the
  // caller's recent action substance volume — bounded window +
  // count + most-recent timestamp — from the Section 2 Action
  // substrate where the caller is the source_entity_id. NEVER
  // includes action_id / action_type / status / payload_redacted
  // / payload_encrypted / target_entity_id / handler error
  // details / connector substance. Per-source read failures
  // swallowed silently per the same ADR-0068 §6 pattern.
  recent_action_summary?: TwinRecentActionSummary;
  // Phase EDX-1 employee Twin self-state extension —
  // memory_scope_summary sidecar. SAFE projection of the
  // caller's currently-active ConversationMemoryScope inventory
  // from DM2-A DMW substrate. NEVER includes conversation_id /
  // access_scope / capsule_types / context_signals_only /
  // declared_by / any per-scope substance. Per-source read
  // failures swallowed silently per ADR-0068 §6.
  memory_scope_summary?: TwinMemoryScopeSummary;
  // Phase EDX-1 employee Twin self-state extension —
  // active_grants_summary sidecar. SAFE projection of the
  // caller's currently-active grants across the DM1-A
  // ConsentGrant substrate and the DM3-A TeamDelegation
  // substrate. NEVER includes consent_id / delegation_id /
  // grantee_entity_id / team_entity_id / purpose / permission_id
  // / capability_scope / supervision_required /
  // revocation_bridge_id / status / consent_state / any
  // per-grant substance. Per-source read failures swallowed
  // silently per ADR-0068 §6.
  active_grants_summary?: TwinActiveGrantsSummary;
  // Phase EDX-1 employee Twin self-state extension —
  // voice_readiness_state sidecar. Constant projection
  // exposing which voice surfaces are LIVE today (envelope
  // construction at VF.4) vs forward-substrate Founder-gated
  // (live mic capture + live audio synthesis per ADR-0085 +
  // ADR-0089). Lets the Control Tower UI render the right
  // voice panel affordances without false promises.
  voice_readiness_state?: TwinVoiceReadinessState;
  // Phase EDX-4 PR 3 employee Twin self-state extension —
  // active_authority_summary sidecar. SAFE capacity-only
  // projection of the caller's TwinAuthorityGrant inventory
  // (PR #269 substrate; PR #270 routes). Distinct from
  // active_grants_summary above (which aggregates DM1-A
  // ConsentGrant + DM3-A TeamDelegation). NEVER includes
  // grant_id / grantee_entity_id / scope_id / purpose_summary
  // / constraints_json / connector_binding_id / per-grant
  // substance. Per-source read failures swallowed silently per
  // ADR-0068 §6.
  active_authority_summary?: TwinActiveAuthoritySummary;
  // Phase EDX-5 PR 3 employee Twin self-state extension —
  // personal_preferences_summary sidecar. SAFE capacity-only
  // projection of the caller's TwinCorrectionMemory inventory
  // (PR #273 substrate; PR #274 routes). NEVER includes
  // correction_id / safe_summary / scope_id / source_message_id
  // / source_conversation_id / per-row substance. Per-source
  // read failures swallowed silently per ADR-0068 §6.
  personal_preferences_summary?: TwinPersonalPreferencesSummary;
  // Phase EDX-6 PR 3 employee Twin self-state extension —
  // collaboration_inbox_summary sidecar. SAFE capacity-only
  // projection of the caller's collaboration inbox (where the
  // caller is the target). Closes the EDX-1 forward-substrate
  // item that was blocked on collaboration substrate (PR #276 +
  // #277). NEVER includes collaboration_id / safe_summary /
  // requester identity / per-row substance. Per-source read
  // failures swallowed silently per ADR-0068 §6.
  collaboration_inbox_summary?: TwinCollaborationInboxSummary;
  // Phase 1 PR 3 employee Twin self-state extension —
  // project_context_summary sidecar. SAFE capacity-only projection
  // of the caller's WorkProject membership inventory (PR #280
  // substrate; PR #281 routes). Closes the EDX-1 forward-substrate
  // item that was blocked on project substrate. NEVER includes
  // project_id / name / per-row substance / other members'
  // identities. Per-source read failures swallowed silently per
  // ADR-0068 §6.
  project_context_summary?: TwinProjectContextSummary;
}

// WHAT: Successful getMyTwin return.
// INPUT: Used as a return type only.
// OUTPUT: None.
// WHY: One deterministic primary twin plus multi-twin metadata so a
//      future UI can expand when an owner has more than one twin.
export interface MyTwinSuccess {
  ok: true;
  twin: MyTwinView;
  has_multiple_twins: boolean;
  twin_count: number;
}

// WHAT: Conversation status filter accepted by listConversations.
export type ConversationStatus = "ACTIVE" | "CLOSED";

// WHAT: Inputs for listConversations.
export interface ListConversationsInput {
  token: string;
  skip: number;
  take: number;
  status?: ConversationStatus;
}

// WHAT: One conversation's metadata-only projection.
// INPUT: Used as a value type only.
// OUTPUT: None.
// WHY: Continuity metadata ONLY -- NO transcript, NO message bodies,
//      NO conversation_history, NO capsule references (OtzarConversation
//      stores none of those).
export interface ConversationListItem {
  conversation_id: string;
  twin_id: string;
  source_type: string;
  status: string;
  message_count: number;
  started_at: Date;
  closed_at: Date | null;
}

// WHAT: Successful listConversations return (paginated).
export interface ConversationListSuccess {
  ok: true;
  items: ConversationListItem[];
  total: number;
  has_more: boolean;
}

// WHAT: Inputs for getConversationDetail (ADR-0054 Wave 2B).
export interface GetConversationDetailInput {
  token: string;
  conversation_id: string;
}

// WHAT: Successful getConversationDetail return (single safe look-back).
export interface ConversationDetailSuccess {
  ok: true;
  conversation: ConversationDetailView;
}

// WHAT: Inputs for getConversationCorrections (ADR-0055 Wave 2C).
export interface GetConversationCorrectionsInput {
  token: string;
  conversation_id: string;
}

// WHAT: Successful getConversationCorrections return (per-conversation
//        correction-signal projection — counts + last-seen freshness +
//        anti-overclaim notes). The fields live at the top level (not
//        nested under `corrections`) per ADR-0055 §Decision 5.
export interface ConversationCorrectionsSuccess
  extends ConversationCorrectionsView {
  ok: true;
}

// Section 1 Wave 3B — Otzar drift detection per ADR-0058. Inputs +
// success-return symmetric with Wave 2C's correction surface.
export type {
  ConversationDriftSignalsSuccess,
  GetConversationDriftSignalsInput,
} from "./drift-signal.service.js";

// WHAT: The Otzar service.
// INPUT: AuthService, COEService, LLMProvider, KVCache.
// OUTPUT: A class with conductSession, closeConversation, and
//         runAutoCloseSweep methods.
// WHY: Constructor injection keeps tests cleanly composable -- they
//      can swap in MockLLMProvider + MemoryKVCache without any env
//      coupling.
export class OtzarService {
  constructor(
    private readonly authService: AuthService,
    private readonly coeService: COEService,
    private readonly llmProvider: LLMProvider,
    private readonly cache: KVCache,
    // Section 1 Wave 6A — symbiotic advisory surface. Optional 5th
    // arg so existing test fixtures (unit + integration) constructed
    // with the 4-arg form continue to work; when absent, getMyTwin
    // simply does not surface accepted_patterns. Wired in production
    // at apps/api/src/server.ts adjacent to the existing
    // OtzarProposedPatternService instantiation.
    private readonly proposedPatternService?: OtzarProposedPatternService,
  ) {}

  // ──────────────────────────────────────────────────────────────
  // conductSession -- the 8-layer assembly + truncation + LLM call.
  //
  // MONETIZATION DESIGN NOTE (Section 11): conductSession reads many
  // capsules during 8-layer assembly via coeService. These internal
  // reads do NOT fire monetization events. Monetization fires only at
  // user-driven HTTP boundaries (e.g., POST /cosmp/read at the route
  // level). The user-facing event here is "user sent a message"; the
  // internal context retrieval is implementation detail. A future
  // section may introduce per-agent-action monetization at a different
  // granularity for autonomous agent activity, but that is out of
  // scope for the user-driven conductSession path.
  // ──────────────────────────────────────────────────────────────
  async conductSession(
    input: ConductSessionInput,
  ): Promise<ConductSessionSuccess | OtzarFailure> {
    const session = await this.authService.validateSession(input.token, "read");
    if (!session.valid) {
      return { ok: false, code: session.code, message: "Otzar denied" };
    }
    const ownerEntityId = session.entity_id;

    // Membership set (kept for callerRole below). Twin selection itself is delegated to
    // the ONE shared resolver so conductSession, getMyTwin, and C6 restoration all agree.
    const memberships = await prisma.entityMembership.findMany({
      where: { parent_id: ownerEntityId, is_active: true },
      select: { child_id: true },
    });
    // [OTZAR-CONTINUITY D] Deterministic primary-twin selection via the shared resolver
    // (oldest active AI_AGENT; created_at ASC, entity_id ASC) — the IDENTICAL twin the user
    // SEES (/otzar/my-twin) and the server RESTORES (C6). No duplicated selection logic.
    const { resolvePrimaryTwin } = await import("./twin-resolution.js");
    const resolvedTwin = await resolvePrimaryTwin(ownerEntityId);
    const twin = resolvedTwin?.twin;
    if (twin === undefined) {
      return {
        ok: false,
        code: "TWIN_NOT_FOUND",
        message: "Caller has no digital twin",
      };
    }
    const twinConfig = await prisma.twinConfig.findUnique({
      where: { twin_id: twin.entity_id },
    });
    const owner = await prisma.entity.findUnique({
      where: { entity_id: ownerEntityId },
    });
    const ownerDisplayName = owner?.display_name ?? "Owner";
    const twinDisplayName = twin.display_name ?? "Twin";

    // Resolve org for priming. Tolerant -- orgless callers get null.
    const { getOrgEntityId } = await import("../governance/org.js");
    let orgEntityId: string | null;
    try {
      orgEntityId = await getOrgEntityId(ownerEntityId);
    } catch {
      orgEntityId = null;
    }

    const callerRole =
      memberships.length > 0
        ? "employee"
        : "individual";
    const tokenBudget = input.token_budget ?? 8000;

    // [OTZAR-CONTINUITY P0/P1/P2/P3] Deterministic, server-authoritative calendar
    // continuity runs BEFORE the LLM: resolve the real current date+timezone,
    // resolve a "yes"/"no" against the caller's single pending prior-turn
    // proposal (idempotent, gated execution), or persist a new proposal. When it
    // handles the turn we short-circuit with a deterministic answer — the LLM is
    // never asked whether "yes" means approval, and never invents a date.
    const { handleCalendarContinuity, resolveTemporalContext, temporalPromptLine, resolveContinuityThread } =
      await import("./calendar-continuity.service.js");
    const temporalCtx = await resolveTemporalContext({
      actor_entity_id: ownerEntityId,
      client_timezone: input.client_timezone,
    });

    // [OTZAR-CONTINUITY P5 Stage 1] Resolve the ONE server-authoritative thread and
    // persist the USER turn BEFORE continuity / references / model / tools. A
    // response-lost retry (same request_id) replays the durable result here without
    // re-invoking anything. Fail closed if the user turn cannot be recorded.
    const turnCtx = await this.beginTurnPersistence({
      input,
      subjectEntityId: ownerEntityId,
      orgEntityId,
      twinId: twin.entity_id,
      timezone: temporalCtx.timezone,
      nowMs: temporalCtx.now_ms,
    });
    if (turnCtx.failure !== null) return turnCtx.failure;
    if (turnCtx.replay !== null) return turnCtx.replay;

    // [OTZAR-CONTINUITY P5 Stage 1 §1-§3] Request-processing spine. Every accepted
    // org-scoped turn materializes exactly one OtzarConversationRequest (1:1 with its
    // durable USER turn) and is claimed with an atomic lease BEFORE any continuity
    // mutation / LLM / tool / provider call. Only the lease winner processes; a
    // concurrent duplicate replays a COMPLETED result or is refused as in-progress.
    // The lease is finalized (canonical assistant link + COMPLETED) at the response.
    let requestLease: { id: string; token: string } | null = null;
    if (orgEntityId !== null && !turnCtx.deferred && turnCtx.conversationId !== null && turnCtx.userTurnId !== null) {
      const gate = await this.openRequestGate({
        conversationId: turnCtx.conversationId,
        userTurnId: turnCtx.userTurnId,
        orgEntityId,
        subjectEntityId: ownerEntityId,
        twinId: twin.entity_id,
        clientRequestId: input.request_id,
        content: input.message,
        nowMs: temporalCtx.now_ms,
      });
      if (gate.replay !== null) return gate.replay;
      if (gate.inProgress !== null) return gate.inProgress;
      requestLease = gate.lease;
    }

    // [OTZAR-CONTINUITY P5 Stage 1A] Phase A (read-only) + Phase B for the AMBIENT path:
    // when the ambient act WILL mutate (propose/confirm/reject/revise/ordinal), resolve
    // the target thread read-only and persist the USER turn to it BEFORE any mutation.
    // Non-mutating ambient acts (disambiguation/clarification/none) defer as before.
    let ambientUserTurnId: string | null = null;
    let ambientContinuityConvId: string | undefined = undefined;
    // [OTZAR-CONTINUITY C1] The durable thread a DEFERRED (ambient) turn's USER +
    // ASSISTANT turns are persisted to. For a mutating act it is the resolved
    // obligation/proposal thread; for a non-mutating act (disambiguate / clarify_past /
    // generic) it is a freshly minted per-turn thread (same as the legacy late mint,
    // only earlier so the USER turn is durable + the request is claimed BEFORE the model
    // or any continuity work). It is KEPT SEPARATE from the conversation_id passed to
    // handleCalendarContinuity — that must stay org-wide (undefined) for non-mutating
    // acts, or findActorPendingProposals would scope pending lookup to the empty new
    // thread and break ambient confirm/ordinal/revise (the #620 hazard).
    let ambientThreadId: string | null = null;
    if (turnCtx.deferred && orgEntityId !== null) {
      const resolution = await resolveContinuityThread({
        actor_entity_id: ownerEntityId,
        org_entity_id: orgEntityId,
        message: input.message,
        temporal: temporalCtx,
      });
      if (resolution.will_mutate && resolution.thread_id !== null) {
        ambientThreadId = resolution.thread_id;
        // §1 FAIL-CLOSED: the thread must be created AND the USER turn persisted BEFORE
        // any Phase-C mutation. If either fails, return a stable failure and perform NO
        // WorkLedger create/update, no proposal, no confirmation claim, no provider call.
        try {
          await createThread({
            conversation_id: resolution.thread_id,
            org_entity_id: orgEntityId,
            subject_entity_id: ownerEntityId,
            twin_entity_id: twin.entity_id,
            timezone: temporalCtx.timezone,
          });
        } catch (e) {
          logger.error({ err: e, conversationId: resolution.thread_id }, "otzar ambient thread create failed (fail-closed)");
          return { ok: false, code: "OTZAR_TURN_PERSIST_FAILED", message: "Could not durably start this conversation; it was not processed. Please retry." };
        }
        ambientUserTurnId = await this.persistDeferredUserTurn({
          conversationId: resolution.thread_id,
          orgEntityId,
          subjectEntityId: ownerEntityId,
          twinId: twin.entity_id,
          requestId: input.request_id,
          content: input.message,
          sourceChannel: input.source_channel ?? "CHAT",
        });
        if (ambientUserTurnId === null) {
          // The USER turn is NOT durable → never mutate. (persistDeferredUserTurn
          // returns null only on a persistence error; a dedup returns the existing id.)
          return { ok: false, code: "OTZAR_TURN_PERSIST_FAILED", message: "Could not durably record your message; it was not processed. Please retry." };
        }
        ambientContinuityConvId = resolution.continuity_conversation_id;
        // §1-§3: claim the request BEFORE the Phase-C continuity mutation below. Same
        // spine as the supplied path; a duplicate ambient turn deduped onto the same
        // USER turn resolves to the same request → one winner, loser replays/refused.
        const gate = await this.openRequestGate({
          conversationId: resolution.thread_id,
          userTurnId: ambientUserTurnId,
          orgEntityId,
          subjectEntityId: ownerEntityId,
          twinId: twin.entity_id,
          clientRequestId: input.request_id,
          content: input.message,
          nowMs: temporalCtx.now_ms,
        });
        if (gate.replay !== null) return gate.replay;
        if (gate.inProgress !== null) return gate.inProgress;
        requestLease = gate.lease;
      } else {
        // [OTZAR-CONTINUITY C1] Non-mutating DEFERRED act (disambiguate / clarify_past /
        // generic-LLM): still an accepted org-scoped turn → it MUST have a durable USER
        // turn + request record + processing claim BEFORE handleCalendarContinuity or the
        // model. Mint a per-turn thread (fail-closed), persist the USER turn, claim the
        // request. ambientContinuityConvId stays undefined so continuity's pending lookup
        // remains org-wide by recency (see the #620 note above).
        const minted = randomUUID();
        try {
          await createThread({
            conversation_id: minted,
            org_entity_id: orgEntityId,
            subject_entity_id: ownerEntityId,
            twin_entity_id: twin.entity_id,
            timezone: temporalCtx.timezone,
          });
        } catch (e) {
          logger.error({ err: e, conversationId: minted }, "otzar ambient (non-mutating) thread create failed (fail-closed)");
          return { ok: false, code: "OTZAR_TURN_PERSIST_FAILED", message: "Could not durably start this conversation; it was not processed. Please retry." };
        }
        ambientUserTurnId = await this.persistDeferredUserTurn({
          conversationId: minted,
          orgEntityId,
          subjectEntityId: ownerEntityId,
          twinId: twin.entity_id,
          requestId: input.request_id,
          content: input.message,
          sourceChannel: input.source_channel ?? "CHAT",
        });
        if (ambientUserTurnId === null) {
          return { ok: false, code: "OTZAR_TURN_PERSIST_FAILED", message: "Could not durably record your message; it was not processed. Please retry." };
        }
        ambientThreadId = minted;
        const gate = await this.openRequestGate({
          conversationId: minted,
          userTurnId: ambientUserTurnId,
          orgEntityId,
          subjectEntityId: ownerEntityId,
          twinId: twin.entity_id,
          clientRequestId: input.request_id,
          content: input.message,
          nowMs: temporalCtx.now_ms,
        });
        if (gate.replay !== null) return gate.replay;
        if (gate.inProgress !== null) return gate.inProgress;
        requestLease = gate.lease;
      }
    }

    const continuity = await handleCalendarContinuity({
      actor_entity_id: ownerEntityId,
      org_entity_id: orgEntityId,
      // Supplied thread (normal CT path) → the validated authoritative id. Ambient
      // mutating (Phase A resolved) → the target thread (or undefined for ordinal, which
      // must see all pending). Ambient non-mutating → undefined (shipped recency).
      conversation_id: turnCtx.conversationId ?? ambientContinuityConvId ?? input.conversation_id,
      message: input.message,
      temporal: temporalCtx,
    });
    if (continuity !== null) {
      // [OTZAR-CONTINUITY C1] For a deferred turn the USER turn + request were persisted
      // to ambientThreadId in Phase B; the ASSISTANT turn + finalize MUST use that same
      // thread (for every mutating act it already equals the continuity response thread).
      const convId = turnCtx.deferred && ambientThreadId !== null
        ? ambientThreadId
        : await this.resolveContinuityConversationId(
            continuity.conversation_id ?? turnCtx.conversationId ?? ambientContinuityConvId ?? input.conversation_id,
            ownerEntityId,
            twin.entity_id,
          );
      if (orgEntityId !== null) {
        // Ambient mutating → the USER turn was already persisted (Phase B, before the
        // mutation). Ambient non-mutating → persist it now (no mutation occurred).
        // Supplied path → already persisted before the model.
        const userTurnId = turnCtx.deferred
          ? (ambientUserTurnId ?? await this.persistDeferredUserTurn({
              conversationId: convId,
              orgEntityId,
              subjectEntityId: ownerEntityId,
              twinId: twin.entity_id,
              requestId: input.request_id,
              content: input.message,
              sourceChannel: input.source_channel ?? "CHAT",
            }))
          : turnCtx.userTurnId;
        // [OTZAR-CONTINUITY C5] Link the EXACT durable action to the request BEFORE the
        // assistant turn — so an assistant-persist failure is recoverable by
        // reconstructing from the action (not by re-running continuity / the provider).
        if (requestLease !== null && continuity.ledger_entry_id != null) {
          const outcome = await linkRequestAction({
            request_record_id: requestLease.id,
            leaseToken: requestLease.token,
            action_ref: continuity.ledger_entry_id,
          });
          if (outcome === "conflict") {
            // A DIFFERENT action is already linked → fail closed; never silently switch.
            await this.abortRequest(requestLease, false, "OTZAR_CONTINUITY_STATE_CHANGED");
            return { ok: false, code: "OTZAR_CONTINUITY_STATE_CHANGED", message: "This request changed state before it finished; please retry." };
          }
        }
        // [OTZAR-CONTINUITY C3] Atomic canonical completion: insert the ONE canonical
        // assistant turn AND complete the request in a single transaction. A non-durable
        // outcome NEVER returns as success — it transitions FAILED_RETRYABLE (action_ref
        // preserved) so a retry reconstructs from the durable action.
        if (requestLease !== null && userTurnId !== null) {
          const done = await this.completeCanonical({
            lease: requestLease, userTurnId, orgEntityId, subjectEntityId: ownerEntityId,
            twinId: twin.entity_id, conversationId: convId, content: continuity.response,
            responseClass: OtzarService.continuityResponseClass(continuity.state),
            actionRef: continuity.ledger_entry_id ?? null,
            sourceChannel: input.source_channel ?? "CHAT",
          });
          if (done.kind === "replay") return done.success;
          if (done.kind === "failure") return done.failure;
          // done.kind === "durable" → fall through to build the continuity success.
        } else {
          // No lease (orgless-legacy defensive): best-effort persist, no request record.
          await this.persistAssistantTurn({
            conversationId: convId, orgEntityId, subjectEntityId: ownerEntityId,
            twinId: twin.entity_id, userTurnId, content: continuity.response,
            actionRef: continuity.ledger_entry_id ?? null, sourceChannel: input.source_channel ?? "CHAT",
          });
        }
      }
      return this.buildContinuitySuccess(convId, continuity);
    }

    // Validate L8 history length up front.
    const history = input.conversation_history ?? [];
    if (history.length > L8_MAX_MESSAGES) {
      await this.abortRequest(requestLease, true, "INVALID_HISTORY"); // deterministic → FINAL
      return {
        ok: false,
        code: "INVALID_HISTORY",
        message: `conversation_history capped at ${L8_MAX_MESSAGES} messages`,
      };
    }

    // STEP 0 -- priming.
    const priming = await getPriming({
      ownerEntityId,
      orgEntityId,
      callerRole,
      message: input.message,
      cache: this.cache,
    });

    // Look up the caller's wallet for layer queries.
    const ownerWallet = await prisma.wallet.findUnique({
      where: { entity_id: ownerEntityId },
      select: { wallet_id: true },
    });
    const ownerWalletId = ownerWallet?.wallet_id ?? null;

    // LAYER 1 -- CORRECTION capsules (NEVER TRIM).
    const l1Caps =
      ownerWalletId === null
        ? []
        : await prisma.memoryCapsule.findMany({
            where: {
              wallet_id: ownerWalletId,
              capsule_type: "CORRECTION",
              deleted_at: null,
            },
            take: 50,
            select: { payload_summary: true },
          });
    const L1 =
      l1Caps.length > 0
        ? "[CORRECTIONS]\n" + l1Caps.map((c) => c.payload_summary).join("\n")
        : "";

    // LAYER 2 -- role template (or null-template fallback).
    let L2: string;
    if (typeof twinConfig?.role_template === "string") {
      const tpl = await prisma.agentTemplate.findUnique({
        where: { role_name: twinConfig.role_template },
      });
      L2 =
        tpl?.template_content ??
        NULL_ROLE_TEMPLATE_FALLBACK.replace(
          "{twin_display_name}",
          twinDisplayName,
        ).replace("{owner_display_name}", ownerDisplayName);
    } else {
      L2 = NULL_ROLE_TEMPLATE_FALLBACK.replace(
        "{twin_display_name}",
        twinDisplayName,
      ).replace("{owner_display_name}", ownerDisplayName);
    }

    // LAYER 3 -- WORK_PATTERN / COMMUNICATION_PREF / DECISION_STYLE.
    const l3Caps =
      ownerWalletId === null
        ? []
        : await prisma.memoryCapsule.findMany({
            where: {
              wallet_id: ownerWalletId,
              capsule_type: {
                in: [
                  "WORK_PATTERN",
                  "COMMUNICATION_PREF",
                  "DECISION_STYLE",
                ] as CapsuleType[],
              },
              deleted_at: null,
            },
            orderBy: { relevance_score: "desc" },
            take: 5,
            select: { payload_summary: true },
          });
    const L3 =
      l3Caps.length > 0
        ? "[WORK PROFILE]\n" + l3Caps.map((c) => c.payload_summary).join("\n")
        : "";

    // LAYERS 4 + 5 via single COE call, partitioned by capsule_type.
    const coe = await this.coeService.assembleContext(
      input.token,
      input.message,
      tokenBudget,
    );
    let L4 = "";
    let L5_items: { content: string; relevance_score: number }[] = [];
    // Section 1 Wave 6B (ADR-0067) — symbiotic alignment-pattern
    // priming section. Captured from the optional Wave 6B sidecar
    // on AssembleContextSuccess. When the caller has at least one
    // ACCEPTED non-archived OtzarProposedPattern, render a clearly
    // labeled prompt section so the Twin sees the SAME alignment
    // guidance the owner already accepted on the Wave 6A getMyTwin
    // surface. Closed-vocab label per ADR-0067 §6; never silent
    // injection; never raw correction text; never pattern_id
    // (debug-only metadata excluded from the LLM prompt per
    // ADR-0067 §6 + Founder preference).
    let L_ALIGNMENT = "";
    if (coe.ok) {
      const foundational = coe.context.filter(
        (c) => c.capsule_type === "FOUNDATIONAL",
      );
      const others = coe.context.filter(
        (c) => c.capsule_type !== "FOUNDATIONAL",
      );
      L4 =
        foundational.length > 0
          ? "[FOUNDATIONAL]\n" + foundational.map((c) => c.content).join("\n")
          : "";
      // L5 items keep relevance_score for truncation ordering.
      // ContextItem doesn't carry relevance_score in its shape; for
      // 11B we approximate with the position in the COE-returned
      // list (earlier items have higher COE-computed relevance).
      L5_items = others.map((c, idx) => ({
        content: c.content,
        relevance_score: 1 - idx * 0.01,
      }));
      // Wave 6B alignment section assembly — visible labeled
      // header + bulleted SAFE rows. Bounded by Wave 6A limits
      // (default 5 / cap 25) on the sidecar reader; size impact
      // is small (~4-5 KB max). Not run through the truncation
      // budget because it is owner-controlled alignment context,
      // not capsule content; truncating it would silently degrade
      // alignment fidelity. The owner can disable it explicitly
      // via include_alignment_patterns=false on a future
      // conductSession surface (route-tier opt-out hook is
      // forward-substrate; default-true symbiotic posture
      // preserved at v1).
      const alignmentPatterns = coe.alignment_patterns;
      if (alignmentPatterns !== undefined && alignmentPatterns.length > 0) {
        const lines: string[] = [
          "[OWNER'S ACCEPTED ALIGNMENT PATTERNS — visible advisory",
          "context the owner has reviewed and accepted as alignment",
          "guidance. These are owner-controlled hints, not memory",
          "rewrites; the owner remains sovereign over which patterns",
          "are accepted, archived, or ignored.]",
          "",
        ];
        for (const p of alignmentPatterns) {
          lines.push(
            `- pattern_label: ${p.pattern_label}`,
            `  source_signal_type: ${p.source_signal_type}`,
            `  confidence_label: ${p.confidence_label}`,
            `  accepted_at: ${p.accepted_at}`,
            `  safe_summary: ${p.safe_summary}`,
            `  advisory_note: ${p.advisory_note}`,
            "",
          );
        }
        L_ALIGNMENT = lines.join("\n").trimEnd();
      }
    }

    // Slice E — DATA-GROUNDED ANSWERING (gated dark by default via
    // OTZAR_WORK_GROUNDING=on). When enabled, inject a BOUNDED, caller-scoped
    // block of the caller's OWN governed work (org-query grounding, self-scope)
    // as an OUTSIDE-BUDGET sidecar — appended to the system prompt like
    // L_ALIGNMENT, NOT added to the truncation bundle — so it never displaces the
    // L8 conversation history. Empty when grounding is insufficient (no facts →
    // no block → the model is told to say it doesn't know, not fabricate). Never
    // fatal: any failure degrades to the prior prompt. Absence of the flag leaves
    // the prompt byte-identical to before.
    let L_WORK_GROUNDING = "";
    if (process.env.OTZAR_WORK_GROUNDING === "on" && orgEntityId !== null) {
      try {
        const grounded = await groundContextForAgent({
          org_entity_id: orgEntityId,
          caller_entity_id: ownerEntityId,
          is_manager: false, // self-scope only — the caller's own record, never org-wide
          query: input.message,
        });
        if (grounded.sufficient) L_WORK_GROUNDING = formatWorkGroundingBlock(grounded.results);
      } catch {
        L_WORK_GROUNDING = "";
      }
    }

    // LAYER 6 -- TaskQueue (stub: no table yet, returns []).
    // TODO(Section 14 admin tooling): query TaskQueue where
    // assignee_id = twin.entity_id AND status IN ('OPEN',
    // 'IN_PROGRESS') AND priority >= 5, order by priority desc,
    // limit 5. L6 stays an identity layer (NEVER TRIM) so the
    // architectural slot is preserved.
    const L6 = "";

    // LAYER 7 -- morning brief gated by Redis flag.
    const briefFlagKey = `otzar:entity:${ownerEntityId}:first_convo_today`;
    const briefFlag = await this.cache.get(briefFlagKey);
    let L7 = "";
    if (briefFlag === null) {
      L7 = `[TODAY'S BRIEF]\nGood morning, ${ownerDisplayName}. You have ${l1Caps.length} active corrections to keep in mind and ${l3Caps.length} work-profile signals loaded.`;
      await this.cache.set(
        briefFlagKey,
        "1",
        secondsUntilNext4amLocal(),
      );
    }

    // LAYER 8 -- conversation_history from client.
    const L8_items = [...history];

    // P3 truncation. Tokenizer used at write time was anthropic;
    // we use the same tokenizer here for consistency. Lazy import
    // to avoid WASM load in tests that don't reach this path.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { countTokens } = require("@anthropic-ai/tokenizer") as {
      countTokens: (text: string) => number;
    };

    const bundle: LayerBundle = {
      priming: priming.text,
      L1,
      L2,
      L3,
      L4,
      L5_items,
      L6,
      L7,
      L8_items,
    };

    let truncated;
    try {
      truncated = truncateToTokenBudget({
        bundle,
        budget: tokenBudget,
        countTokens,
      });
    } catch (err) {
      if (err instanceof TokenBudgetExceededError) {
        await this.abortRequest(requestLease, true, "TOKEN_BUDGET_EXCEEDED"); // deterministic → FINAL
        return {
          ok: false,
          code: "TOKEN_BUDGET_EXCEEDED",
          message: "Token budget exceeded after exhausting trimmable layers",
          detail: err.detail,
        };
      }
      throw err;
    }

    // Build the final system prompt + user message.
    //
    // L0_IDENTITY (Phase 1205 per [FOUNDER-AUTH -- FIX AI TWIN
    // IDENTITY CONTEXT]): a SHORT viewer-identity preamble is
    // prepended outside the truncation budget so Otzar always knows
    // who it is talking to even when L1-L7 get trimmed. The block is
    // closed-vocab + size-bounded + privacy-scoped per
    // identity-context.ts (no secrets, no raw memory, no cross-user
    // private data; only the viewer's own org/title/twin/projects
    // and context-signal counts). Failure to build the block is NOT
    // fatal -- we degrade to the legacy L1-L7-only path so a
    // partially-seeded org never blocks a conversation.
    //
    // Wave 6B alignment section is injected immediately after the
    // priming layer (so the symbiotic alignment context frames
    // every layer that follows) and outside the truncation budget
    // (bounded by the Wave 6A sidecar reader's limit of 5 patterns;
    // small enough to not require truncation participation).
    let identityPreamble = "";
    let identityForExtractor: IdentityContext | null = null;
    try {
      const identity = await buildIdentityContext(ownerEntityId);
      identityPreamble = renderIdentityPreamble(identity);
      identityForExtractor = identity;
    } catch (err) {
      // Degrade gracefully -- log + continue without L0_IDENTITY so
      // a partially-seeded org never blocks a conversation.
      logger.warn(
        { err, ownerEntityId },
        "otzar.conductSession: identity-context build failed; degrading",
      );
    }

    const systemPrompt = [
      identityPreamble,
      // [OTZAR-CONTINUITY P1] Server-grounded current date/time/timezone so the
      // model never invents a date (the "January 2025" failure). Authoritative.
      temporalPromptLine(temporalCtx),
      truncated.final.priming,
      L_ALIGNMENT,
      // Slice E — grounded work context (outside the truncation budget; "" unless
      // OTZAR_WORK_GROUNDING=on and there are caller-scoped facts to ground on).
      L_WORK_GROUNDING,
      truncated.final.L1,
      truncated.final.L2,
      truncated.final.L3,
      truncated.final.L4,
      truncated.final.L5_items.map((i) => i.content).join("\n"),
      truncated.final.L6,
      truncated.final.L7,
    ]
      .filter((s) => s.length > 0)
      .join("\n\n");
    const userPrompt =
      truncated.final.L8_items.length > 0
        ? truncated.final.L8_items.join("\n") + "\n\n" + input.message
        : input.message;

    const llmResult: LLMResult = await this.llmProvider.generateResponse({
      system: systemPrompt,
      user: userPrompt,
    });
    if (!llmResult.ok) {
      // Provider failed AFTER the claim → FAILED_RETRYABLE so a retry reclaims the
      // request immediately (never refuse a legitimate retry as still-in-progress).
      await this.abortRequest(requestLease, false, "LLM_UNAVAILABLE");
      return {
        ok: false,
        code: "LLM_UNAVAILABLE",
        message: llmResult.fallback_message,
      };
    }

    // Persist conversation row (create or update). Check existence first: a
    // client may send a conversation_id whose row does not exist (a stale/fresh
    // id, or a cross-thread probe). A blind update would both log a spurious
    // `prisma:error: No record was found for an update` AND throw uncaught — so
    // resolve existence, then update-or-create. A supplied-but-unknown id is
    // treated as a NEW conversation (create + CONVERSATION_STARTED audit).
    let conversationId: string;
    if (turnCtx.conversationId !== null) {
      // [OTZAR-CONTINUITY P5 Stage 1] The ONE authoritative thread was resolved up
      // front and its row already exists (the user turn was persisted to it). Just
      // count the message — no re-resolution, no recency guessing.
      conversationId = turnCtx.conversationId;
      await prisma.otzarConversation
        .update({ where: { conversation_id: conversationId }, data: { message_count: { increment: 1 } } })
        .catch(() => undefined);
    } else if (turnCtx.deferred && ambientThreadId !== null) {
      // [OTZAR-CONTINUITY C1] Deferred (ambient) org turn: the thread was minted + the
      // USER turn persisted + the request claimed in Phase B, BEFORE the model ran. Reuse
      // it — never mint a second thread here (which would orphan the USER turn + request).
      conversationId = ambientThreadId;
      await prisma.otzarConversation
        .update({ where: { conversation_id: conversationId }, data: { message_count: { increment: 1 } } })
        .catch(() => undefined);
    } else {
      // Orgless legacy path (no durable turns): resolve/create the conversation row.
      // Check existence first: a client may send a conversation_id whose row does
      // not exist — a blind update would log a spurious prisma:error and throw.
      const suppliedId =
        typeof input.conversation_id === "string" && input.conversation_id.length > 0
          ? input.conversation_id
          : null;
      const existing =
        suppliedId !== null
          ? await prisma.otzarConversation.findUnique({
              where: { conversation_id: suppliedId },
              select: { conversation_id: true },
            })
          : null;
      if (suppliedId !== null && existing !== null) {
        conversationId = suppliedId;
        await prisma.otzarConversation.update({
          where: { conversation_id: conversationId },
          data: { message_count: { increment: 1 } },
        });
      } else {
        conversationId = suppliedId ?? randomUUID();
        await prisma.otzarConversation.create({
          data: {
            conversation_id: conversationId,
            entity_id: ownerEntityId,
            twin_id: twin.entity_id,
            source_type: "CHAT",
            participants: [ownerEntityId, twin.entity_id],
            message_count: 1,
            status: "ACTIVE",
          },
        });
        await writeAuditEvent({
          event_type: "CONVERSATION_STARTED",
          outcome: "SUCCESS",
          actor_entity_id: ownerEntityId,
          target_entity_id: ownerEntityId,
          details: { conversation_id: conversationId, twin_id: twin.entity_id },
        });
      }
    }
    // Refresh last_active so the auto-close sweep keeps this
    // conversation marked as ACTIVE for another 30 minutes.
    await this.cache.set(
      `otzar:conv:${conversationId}:last_active`,
      String(Date.now()),
      LAST_ACTIVE_TTL_SECONDS,
    );

    const contextUsed =
      l1Caps.length +
      l3Caps.length +
      (L4.length > 0 ? 1 : 0) +
      truncated.final.L5_items.length;

    // ADR-0051 Wave 1: additive transparency projection. Pure mapping of
    // the `coe` metadata already computed above (and the existing
    // context_used count) -- no new retrieval, no scoring change, no COE
    // re-call. The mapper never serializes raw content or the raw
    // denied-permission count.
    const { transparency, context_provenance } = projectOtzarTransparency({
      coe,
      context_items_used: contextUsed,
    });

    // Phase EDX-3 slice 2: `correction_capture_available` is always
    // true at the Foundation tier. The LIVE `POST /api/v1/otzar/
    // correction` endpoint (ADR-0055 Wave 2C) accepts a correction
    // from any caller with a `read`-capable bearer session — the
    // same session that just authenticated this conductSession call.
    // No per-conversation gating exists; the substrate is uniformly
    // available, so the UI can render the "correct this" affordance
    // without guessing.
    const correctionCaptureAvailable = true;

    // Phase EDX-3 slice 3: speech-ready projection of the response
    // text + voice-output-supported signal. `toSpeechReadyText` is a
    // pure markdown / code / link stripper that produces text safe
    // to hand to a downstream TTS or client-side device speech
    // engine. `computeVoiceOutputSupported` mirrors the EDX-1
    // voice_readiness_state.live_audio_output value (false at the
    // Foundation tier today per ADR-0085 + ADR-0089) so the UI can
    // hide / disable a "speak aloud" affordance that would produce
    // no audio while still letting the speech-ready text reach
    // future audio consumers.
    const speechReadyText = toSpeechReadyText(llmResult.text);
    const voiceOutputSupported = computeVoiceOutputSupported();

    // Phase EDX-4 PR 4 — conservative deterministic verb-scan over
    // the caller's message. When the user clearly intends a material
    // action (send / email / post / connector access / cross-team
    // handoff / destructive verb), flip `approval_required: true`
    // + supply the closed-vocab `approval_reason` and the
    // `approval_duration_options` array the UI offers when the user
    // opts to grant authority. The chat surface NEVER auto-creates
    // a TwinAuthorityGrant or auto-executes an action; the detection
    // only updates the envelope so the UI can render the right
    // approval panel.
    const approval = detectApprovalRequirement(input.message);

    // Phase EDX-3 slice 4: deterministic-false "denial of preconditions"
    // envelope, refined at EDX-4 PR 4 to flip `approval_required`
    // when verb-scan detection fires. The other five booleans
    // (clarification / action_proposed / policy_blocked /
    // dmw_scope_blocked / collaboration_suggested) remain
    // deterministic-false until their EDX-5 / EDX-6 / Section 2 +
    // Section 9 detection substrates wire in.
    const clarificationNeeded = false;
    // Phase 1208 -- pure extractor parses the LLM's canonical Phase
    // 1207 draft shape. Returns null when the response is not a
    // draft (clarification / answer / etc.), so we tolerate every
    // shape. action_proposed flips to true only when the extractor
    // succeeds; the structured envelope is surfaced on the response
    // for the CT inline approval card.
    const proposedAction: ProposedAction | null =
      identityForExtractor !== null
        ? extractProposedAction(
            llmResult.text,
            identityForExtractor.org_roster.map((p) => ({
              entity_id: p.entity_id,
              display_name: p.display_name,
              email: p.email,
            })),
          )
        : null;
    const actionProposed = proposedAction !== null;
    const approvalRequired = approval.approval_required;
    const policyBlocked = false;
    const dmwScopeBlocked = false;

    // Phase EDX-6 — `collaboration_suggested` flips true when the
    // EDX-4 verb-scan classified the message as CROSS_TEAM_REQUEST
    // or CROSS_PROJECT_REQUEST. The companion
    // collaboration_target_type reflects the directive's vocab
    // (TEAM for cross-team handoffs; PROJECT for cross-project).
    // ConductSession NEVER auto-creates the collaboration request
    // row — the user explicitly opens the collaboration affordance.
    let collaborationSuggested = false;
    let collaborationTargetType: TwinCollaborationTargetType | undefined;
    if (
      approval.approval_required &&
      (approval.approval_reason === "CROSS_TEAM_REQUEST" ||
        approval.approval_reason === "CROSS_PROJECT_REQUEST")
    ) {
      collaborationSuggested = true;
      collaborationTargetType =
        approval.approval_reason === "CROSS_TEAM_REQUEST" ? "TEAM" : "PROJECT";
    }

    // Phase EDX-3 slice 1: `next_step` defaults to "ANSWERED" — the
    // chat surface answered the user's question. EDX-4 PR 4 flips
    // to "NEEDS_APPROVAL" when approval detection fires (catches
    // EXTERNAL_WRITE / SENSITIVE_CONTEXT / CONNECTOR_ACCESS) and
    // EDX-6 surfaces COLLABORATION_REQUEST_SUGGESTED when the
    // CROSS_TEAM_REQUEST / CROSS_PROJECT_REQUEST classification
    // wins (the chat path that explicitly maps to the collaboration
    // substrate).
    const nextStep: ConductNextStep = collaborationSuggested
      ? "COLLABORATION_REQUEST_SUGGESTED"
      : approvalRequired
        ? "NEEDS_APPROVAL"
        : "ANSWERED";

    // Phase EDX-3 slice 5: safe layer-breakdown projection. Pure
    // summary of the per-layer counts conductSession already used to
    // compute the existing `context_used` scalar — no new DB reads,
    // no content surfaced. layer_1 / layer_3 reflect the L1
    // (CORRECTION) + L3 (WORK_PATTERN / COMMUNICATION_PREF /
    // DECISION_STYLE) capsule reads above. layer_4 is 0 or 1 (the
    // FOUNDATIONAL bundle is collapsed into a single context slot
    // by `contextUsed`'s `L4.length > 0 ? 1 : 0` form). layer_5
    // reflects the COE-returned non-FOUNDATIONAL items that survived
    // truncation. layer_8 reflects the conversation_history messages
    // that survived truncation. total_capsules equals contextUsed by
    // construction so a UI consumer can use either value.
    const memoryUsedSummary: MemoryUsedSummary = {
      layer_1_corrections: l1Caps.length,
      layer_3_work_profile: l3Caps.length,
      layer_4_foundational: L4.length > 0 ? 1 : 0,
      layer_5_relevant_context: truncated.final.L5_items.length,
      layer_8_history_messages: truncated.final.L8_items.length,
      total_capsules: contextUsed,
    };

    // [OTZAR-CONTINUITY P5 Stage 1] Persist the ASSISTANT turn (author = Twin)
    // before the HTTP response is considered durable, linked to its user turn.
    if (orgEntityId !== null) {
      // Deferred (ambient) → persist the user turn now to the resolved thread (unless
      // Phase B already did, which only happens on a mutating act that continuity
      // handled — reuse it defensively to avoid a duplicate). Supplied path → already
      // recorded before the model.
      const llmUserTurnId = turnCtx.deferred
        ? (ambientUserTurnId ?? await this.persistDeferredUserTurn({
            conversationId,
            orgEntityId,
            subjectEntityId: ownerEntityId,
            twinId: twin.entity_id,
            requestId: input.request_id,
            content: input.message,
            sourceChannel: input.source_channel ?? "CHAT",
          }))
        : turnCtx.userTurnId;
      const llmClass: ResponseClass = actionProposed || approvalRequired
        ? "ACTION_PROPOSED"
        : clarificationNeeded ? "CLARIFICATION" : "ANSWERED";
      // [OTZAR-CONTINUITY C3] Atomic canonical completion (insert + complete in one tx).
      // A pure-LLM answer has no durable action; a non-durable outcome → FAILED_RETRYABLE
      // and a retry regenerates under exclusive lease ownership (one USER turn, no dup).
      if (requestLease !== null && llmUserTurnId !== null) {
        const done = await this.completeCanonical({
          lease: requestLease, userTurnId: llmUserTurnId, orgEntityId, subjectEntityId: ownerEntityId,
          twinId: twin.entity_id, conversationId, content: llmResult.text, responseClass: llmClass,
          modelProvider: llmResult.provider ?? null, sourceChannel: input.source_channel ?? "CHAT",
        });
        if (done.kind === "replay") return done.success;
        if (done.kind === "failure") return done.failure;
        // done.kind === "durable" → fall through to the full success response below.
      } else {
        await this.persistAssistantTurn({
          conversationId, orgEntityId, subjectEntityId: ownerEntityId, twinId: twin.entity_id,
          userTurnId: llmUserTurnId, content: llmResult.text, modelProvider: llmResult.provider ?? null,
          sourceChannel: input.source_channel ?? "CHAT",
        });
      }
    }

    return {
      ok: true,
      response: llmResult.text,
      context_used: contextUsed,
      tokens_consumed: truncated.total_tokens,
      conversation_id: conversationId,
      transparency,
      context_provenance,
      next_step: nextStep,
      correction_capture_available: correctionCaptureAvailable,
      speech_ready_text: speechReadyText,
      voice_output_supported: voiceOutputSupported,
      clarification_needed: clarificationNeeded,
      action_proposed: actionProposed,
      approval_required: approvalRequired,
      policy_blocked: policyBlocked,
      dmw_scope_blocked: dmwScopeBlocked,
      collaboration_suggested: collaborationSuggested,
      memory_used_summary: memoryUsedSummary,
      ...(proposedAction !== null ? { proposed_action: proposedAction } : {}),
      ...(approval.approval_required
        ? {
            approval_reason: approval.approval_reason,
            approval_duration_options: approval.approval_duration_options,
          }
        : {}),
      ...(collaborationTargetType !== undefined
        ? { collaboration_target_type: collaborationTargetType }
        : {}),
    };
  }

  // [OTZAR-CONTINUITY] Resolve (or tolerantly restore/create) the conversation
  // row for a deterministic continuity turn, mirroring the main path's counter
  // semantics so the client always gets a stable conversation_id back.
  private async resolveContinuityConversationId(
    clientId: string | undefined,
    ownerEntityId: string,
    twinEntityId: string,
  ): Promise<string> {
    // Correction #1 makes the continuity layer pass a server-minted bound thread on
    // every propose, so the id usually has no row yet. Use upsert (not
    // update-then-catch-create) so a first-touch never logs a spurious
    // `prisma:error: No record was found for an update`.
    const id = typeof clientId === "string" && clientId.length > 0 ? clientId : randomUUID();
    await prisma.otzarConversation
      .upsert({
        where: { conversation_id: id },
        update: { message_count: { increment: 1 } },
        create: {
          conversation_id: id,
          entity_id: ownerEntityId,
          twin_id: twinEntityId,
          source_type: "CHAT",
          participants: [ownerEntityId, twinEntityId],
          message_count: 1,
          status: "ACTIVE",
        },
      })
      .catch(() => undefined);
    return id;
  }

  // [OTZAR-CONTINUITY] Wrap a deterministic continuity result in a valid
  // ConductSessionSuccess. Honest state flags: a pending proposal sets
  // action_proposed + approval_required; nothing else is fabricated.
  // Map a deterministic continuity state to the request record's canonical
  // response_class (used for action-aware recovery + audit clarity).
  private static continuityResponseClass(state: string): ResponseClass {
    switch (state) {
      case "AWAITING_CONFIRMATION": return "AWAITING_CONFIRMATION";
      case "REVISED": return "REVISED";
      case "CREATED": return "SUCCEEDED";
      case "CANCELLED": return "CANCELLED";
      case "PROVIDER_BLOCKED": return "BLOCKED";
      case "DISAMBIGUATE":
      case "NEEDS_TIME_CLARIFICATION": return "CLARIFICATION";
      default: return "ANSWERED";
    }
  }

  private buildContinuitySuccess(
    conversationId: string,
    continuity: { state: string; response: string; event_id?: string },
  ): ConductSessionSuccess {
    const awaiting =
      continuity.state === "AWAITING_CONFIRMATION" || continuity.state === "REVISED";
    const clarify =
      continuity.state === "DISAMBIGUATE" ||
      continuity.state === "NEEDS_TIME_CLARIFICATION";
    return {
      ok: true,
      response: continuity.response,
      context_used: 0,
      tokens_consumed: 0,
      conversation_id: conversationId,
      next_step: awaiting ? "ACTION_PROPOSED" : "ANSWERED",
      correction_capture_available: true,
      speech_ready_text: continuity.response,
      voice_output_supported: false,
      clarification_needed: clarify,
      action_proposed: awaiting,
      approval_required: awaiting,
      policy_blocked: false,
      dmw_scope_blocked: false,
      collaboration_suggested: false,
      memory_used_summary: {
        layer_1_corrections: 0,
        layer_3_work_profile: 0,
        layer_4_foundational: 0,
        layer_5_relevant_context: 0,
        layer_8_history_messages: 0,
        total_capsules: 0,
      },
    };
  }

  // ──────────────────────────────────────────────────────────────
  // [OTZAR-CONTINUITY P5 Stage 1] Durable turn persistence + idempotency.
  // ──────────────────────────────────────────────────────────────

  private static readonly REQUEST_ID_RE = /^[A-Za-z0-9._:-]{1,200}$/;

  // WHAT: resolve the authoritative thread, persist the USER turn BEFORE any
  // continuity/model/tool work, and short-circuit a response-lost retry with the
  // stored assistant result. Orgless sessions keep legacy behaviour (no durable
  // turns). Returns a failure (fail-closed) when the user turn cannot be recorded.
  private async beginTurnPersistence(args: {
    input: ConductSessionInput;
    subjectEntityId: string;
    orgEntityId: string | null;
    twinId: string;
    timezone: string;
    nowMs: number;
  }): Promise<{
    conversationId: string | null;
    userTurnId: string | null;
    replay: ConductSessionSuccess | null;
    failure: OtzarFailure | null;
    /** true when a no-id (ambient) turn defers persistence until continuity resolves
     * its own thread — so continuity's shipped ambient behaviour is left UNCHANGED. */
    deferred: boolean;
  }> {
    if (args.orgEntityId === null) {
      // Orgless: legacy path, no durable turns. Return null so the LLM path runs the
      // legacy create-or-update (+ CONVERSATION_STARTED) block, and continuity still
      // receives the raw client id via the `?? input.conversation_id` fallback.
      return { conversationId: null, userTurnId: null, replay: null, failure: null, deferred: false };
    }
    const rid = args.input.request_id;
    if (rid !== undefined && !OtzarService.REQUEST_ID_RE.test(rid)) {
      return {
        conversationId: null, userTurnId: null, replay: null, deferred: false,
        failure: { ok: false, code: "INVALID_REQUEST_ID", message: "request_id must be 1-200 safe characters ([A-Za-z0-9._:-])." },
      };
    }

    // Ambient (no client thread id): DEFER. We must not force a thread onto the
    // calendar-continuity layer — its ambient path resolves the caller's pending
    // obligation/thread by recency (multi-pending disambiguation included). Passing a
    // freshly-resolved thread here would pull unrelated new proposals into one thread.
    // The user + assistant turns are persisted to continuity's own resolved thread.
    if (args.input.conversation_id === undefined || args.input.conversation_id.length === 0) {
      return { conversationId: null, userTurnId: null, replay: null, failure: null, deferred: true };
    }

    // Supplied thread id (the normal CT contract): resolve authoritatively (validate
    // exact scope / create-if-missing) and persist the USER turn BEFORE the model, so
    // this path is fully thread-first + idempotent + retry-replayable.
    let conversationId: string;
    try {
      const resolved = await resolveAuthoritativeThread({
        conversation_id: args.input.conversation_id,
        org_entity_id: args.orgEntityId,
        subject_entity_id: args.subjectEntityId,
        twin_entity_id: args.twinId,
        timezone: args.timezone,
        now_ms: args.nowMs,
      });
      conversationId = resolved.conversation_id;
    } catch (e) {
      // §7: a supplied thread that exists but is foreign / deleted fails explicitly,
      // never silently minted over. Safe error doctrine — no existence disclosure.
      if (e instanceof ThreadScopeError) {
        const code = e.reason === "thread_deleted" ? "OTZAR_THREAD_CLOSED" : "OTZAR_THREAD_FORBIDDEN";
        return {
          conversationId: null, userTurnId: null, replay: null, deferred: false,
          failure: { ok: false, code, message: code === "OTZAR_THREAD_CLOSED" ? "This conversation is no longer active." : "This conversation is not available to you." },
        };
      }
      throw e;
    }

    let userTurn: { turn_id: string; deduped: boolean };
    try {
      userTurn = await appendConversationTurn({
        conversation_id: conversationId,
        org_entity_id: args.orgEntityId,
        subject_entity_id: args.subjectEntityId,
        author_entity_id: args.subjectEntityId,
        twin_entity_id: args.twinId,
        role: "USER",
        content: args.input.message,
        ...(rid !== undefined ? { request_id: rid } : {}),
        source_channel: args.input.source_channel ?? "CHAT",
      });
    } catch (e) {
      if (e instanceof IdempotencyConflictError) {
        return {
          conversationId, userTurnId: null, replay: null, deferred: false,
          failure: { ok: false, code: "OTZAR_REQUEST_ID_CONFLICT", message: "This request_id was already used with different content." },
        };
      }
      logger.error({ err: e, conversationId }, "otzar user-turn persistence failed");
      return {
        conversationId, userTurnId: null, replay: null, deferred: false,
        failure: { ok: false, code: "OTZAR_TURN_PERSIST_FAILED", message: "Could not durably record your message; it was not processed. Please retry." },
      };
    }

    if (userTurn.deduped) {
      const asst = await prisma.otzarConversationTurn.findFirst({
        where: { conversation_id: conversationId, role: "ASSISTANT", reply_to_turn_id: userTurn.turn_id },
        orderBy: { sequence: "desc" },
      });
      if (asst !== null) {
        const replay = await this.reconstructFromAssistantTurn(asst, conversationId);
        return { conversationId, userTurnId: userTurn.turn_id, replay, failure: null, deferred: false };
      }
    }
    return { conversationId, userTurnId: userTurn.turn_id, replay: null, failure: null, deferred: false };
  }

  // Persist a deferred (ambient) USER turn to continuity's own resolved thread.
  // Best-effort + returns the turn id for assistant linkage. Model-free continuity
  // path, so this still precedes any tool execution within the turn.
  private async persistDeferredUserTurn(args: {
    conversationId: string;
    orgEntityId: string;
    subjectEntityId: string;
    twinId: string;
    requestId?: string | undefined;
    content: string;
    sourceChannel: "CHAT" | "VOICE" | "AMBIENT";
  }): Promise<string | null> {
    try {
      const u = await appendConversationTurn({
        conversation_id: args.conversationId,
        org_entity_id: args.orgEntityId,
        subject_entity_id: args.subjectEntityId,
        author_entity_id: args.subjectEntityId,
        twin_entity_id: args.twinId,
        role: "USER",
        content: args.content,
        ...(args.requestId !== undefined ? { request_id: args.requestId } : {}),
        source_channel: args.sourceChannel,
      });
      return u.turn_id;
    } catch (e) {
      logger.warn({ err: e, conversationId: args.conversationId }, "otzar deferred user-turn persistence failed");
      return null;
    }
  }

  // WHAT: persist the ASSISTANT turn (author = Twin) linked to its user turn +
  // action. Availability-preserving: a transcript-write failure is logged but does
  // not fail the already-generated response (it degrades retry-replay to a safe
  // re-generate, never a wrong answer).
  private async persistAssistantTurn(args: {
    conversationId: string | null;
    orgEntityId: string | null;
    subjectEntityId: string;
    twinId: string;
    userTurnId: string | null;
    content: string;
    actionRef?: string | null;
    modelProvider?: string | null;
    sourceChannel: "CHAT" | "VOICE" | "AMBIENT";
  }): Promise<string | null> {
    if (args.conversationId === null || args.orgEntityId === null) return null;
    try {
      const t = await appendConversationTurn({
        conversation_id: args.conversationId,
        org_entity_id: args.orgEntityId,
        subject_entity_id: args.subjectEntityId,
        author_entity_id: args.twinId, // the Twin authored the assistant turn
        twin_entity_id: args.twinId,
        role: "ASSISTANT",
        content: args.content,
        ...(args.userTurnId ? { reply_to_turn_id: args.userTurnId } : {}),
        ...(args.actionRef ? { action_ref: args.actionRef } : {}),
        ...(args.modelProvider ? { model_provider: args.modelProvider } : {}),
        source_channel: args.sourceChannel,
      });
      return t.turn_id;
    } catch (e) {
      logger.warn({ err: e, conversationId: args.conversationId }, "otzar assistant-turn persistence failed (response already generated)");
      return null;
    }
  }

  // [OTZAR-CONTINUITY P5 Stage 1 §1-§3] Request-processing gate for the SUPPLIED-ID
  // path (the normal CT contract): after the durable USER turn, materialize the
  // OtzarConversationRequest and atomically claim it. Only the lease winner processes;
  // a concurrent duplicate replays a COMPLETED result or returns OTZAR_REQUEST_IN_
  // PROGRESS. A missed completion self-heals: the lease expires and a retry reclaims.
  private async openRequestGate(args: {
    conversationId: string; userTurnId: string; orgEntityId: string;
    subjectEntityId: string; twinId: string; clientRequestId: string | undefined;
    content: string; nowMs: number;
  }): Promise<{ lease: { id: string; token: string } | null; replay: ConductSessionSuccess | null; inProgress: OtzarFailure | null }> {
    const contentHash = createHash("sha256").update(args.content).digest("hex");
    const { request } = await createOrGetRequest({
      conversation_id: args.conversationId,
      user_turn_id: args.userTurnId,
      org_entity_id: args.orgEntityId,
      subject_entity_id: args.subjectEntityId,
      twin_entity_id: args.twinId,
      client_request_id: args.clientRequestId ?? null,
      content_hash: contentHash,
    });
    const token = randomUUID();
    const claim = await claimRequestProcessing(request.request_record_id, token, args.nowMs);
    if (claim.claimed) {
      // [OTZAR-CONTINUITY C5] Action-aware recovery. If a PRIOR attempt already linked a
      // durable action (created/executed/blocked a proposal) but did not finish — the
      // assistant turn or finalization failed — DO NOT reprocess (re-entering continuity
      // would find no pending proposal for an executed action and misroute to the LLM, or
      // re-execute). Reconstruct the response from the durable action state, repair the
      // canonical assistant turn + complete the request, and replay. No provider replay.
      if (claim.request.action_ref !== null) {
        const recovered = await this.reconstructFromAction(claim.request.action_ref, args.conversationId, { subjectEntityId: args.subjectEntityId });
        if (recovered !== null) {
          const lease = { id: request.request_record_id, token };
          // [OTZAR-CONTINUITY C3 fix] Repair the canonical result atomically. Return the
          // reconstructed text as a normal replay ONLY when it was durably committed. If
          // completion is non-durable, DO NOT return reconstructed text as success —
          // reconcile: replay a validated existing winner, surface deterministic
          // in-progress, or a typed retryable failure. Never a locally-fabricated success.
          const cls: ResponseClass = recovered.approval_required ? "AWAITING_CONFIRMATION" : "ANSWERED";
          const done = await this.completeCanonical({
            lease, userTurnId: args.userTurnId, orgEntityId: args.orgEntityId,
            subjectEntityId: args.subjectEntityId, twinId: args.twinId,
            conversationId: args.conversationId, content: recovered.response, responseClass: cls,
            actionRef: claim.request.action_ref, sourceChannel: "CHAT",
          });
          if (done.kind === "durable") return { lease: null, replay: recovered, inProgress: null };
          if (done.kind === "replay") return { lease: null, replay: done.success, inProgress: null };
          return { lease: null, replay: null, inProgress: done.failure };
        }
        // Action exists but is not reconstructable (unknown status) → fall through to
        // reprocess under the freshly claimed lease. Safe: the proposal-level CAS
        // (claimProposalForExecution) still prevents any double execution.
      }
      return { lease: { id: request.request_record_id, token }, replay: null, inProgress: null };
    }
    // A concurrent owner holds the lease. Replay if it already COMPLETED.
    if (claim.request.state === "COMPLETED" && claim.request.canonical_assistant_turn_id !== null) {
      const asst = await prisma.otzarConversationTurn.findUnique({ where: { turn_id: claim.request.canonical_assistant_turn_id } });
      if (asst !== null) return { lease: null, replay: await this.reconstructFromAssistantTurn(asst, args.conversationId), inProgress: null };
    }
    // [OTZAR-CONTINUITY C5] Concurrent owner still PROCESSING but a durable action is
    // already linked → surface the durable action state rather than a bare in-progress.
    if (claim.request.action_ref !== null) {
      const recovered = await this.reconstructFromAction(claim.request.action_ref, args.conversationId, { subjectEntityId: args.subjectEntityId });
      if (recovered !== null) return { lease: null, replay: recovered, inProgress: null };
    }
    return {
      lease: null, replay: null,
      inProgress: { ok: false, code: "OTZAR_REQUEST_IN_PROGRESS", message: "This request is already being processed. Please retry shortly." },
    };
  }

  // [OTZAR-CONTINUITY C3] Insert the ONE canonical assistant turn AND complete the request
  // in a single transaction, then decide the ONLY safe outcome. `durable` → caller returns
  // its freshly-built success. `replay` → a validated existing canonical winner to return
  // instead. `failure` → a typed, safe failure. It NEVER reports success for locally
  // reconstructed/generated text that was not durably completed.
  private async completeCanonical(args: {
    lease: { id: string; token: string };
    userTurnId: string;
    orgEntityId: string; subjectEntityId: string; twinId: string;
    conversationId: string; content: string; responseClass: ResponseClass;
    actionRef?: string | null; modelProvider?: string | null;
    sourceChannel: "CHAT" | "VOICE" | "AMBIENT";
  }): Promise<FinishResult> {
    const res = await completeRequestWithCanonicalResponse({
      request_record_id: args.lease.id,
      leaseToken: args.lease.token,
      user_turn_id: args.userTurnId,
      org_entity_id: args.orgEntityId,
      subject_entity_id: args.subjectEntityId,
      twin_entity_id: args.twinId,
      conversation_id: args.conversationId,
      content: args.content,
      response_class: args.responseClass,
      action_ref: args.actionRef ?? null,
      model_provider: args.modelProvider ?? null,
      source_channel: args.sourceChannel,
    });
    // WE durably completed it → the caller returns its freshly-built success.
    if (res.outcome === "completed") return { kind: "durable" };
    // A canonical winner already exists → load + replay the EXACT validated winner (never
    // the locally reconstructed/generated text).
    if (res.outcome === "already_completed" && res.canonical_assistant_turn_id != null) {
      const canon = await this.loadScopedCanonical(res.canonical_assistant_turn_id, args);
      if (canon !== null) return { kind: "replay", success: await this.reconstructFromAssistantTurn(canon, args.conversationId) };
    }
    // Every other outcome (lease_lost / state_conflict / scope_mismatch / invalid_turn /
    // canonical_inconsistent / consistency_error) is NON-DURABLE → NEVER return the local
    // text as success. Reconcile against the durable, scoped request state.
    logger.warn({ requestRecordId: args.lease.id, outcome: res.outcome }, "otzar canonical completion not durable → reconcile");
    return this.reconcileNonDurable(args);
  }

  // Load a canonical ASSISTANT turn only when it fully matches the expected scope + the
  // reply relationship — never trust a bare turn id.
  private async loadScopedCanonical(
    turnId: string,
    scope: { orgEntityId: string; subjectEntityId: string; twinId: string; conversationId: string; userTurnId: string },
  ): Promise<OtzarConversationTurn | null> {
    return prisma.otzarConversationTurn.findFirst({
      where: {
        turn_id: turnId, role: "ASSISTANT",
        conversation_id: scope.conversationId,
        org_entity_id: scope.orgEntityId,
        subject_entity_id: scope.subjectEntityId,
        twin_entity_id: scope.twinId,
        response_to_turn_id: scope.userTurnId,
      },
    });
  }

  // [OTZAR-CONTINUITY C3 hardening] After a non-durable completion, decide the ONLY safe
  // outcomes — never return reconstructed/generated text as normal success:
  //  • a valid canonical winner now exists → replay it;
  //  • still PROCESSING under ANOTHER owner → deterministic in-progress;
  //  • we still validly own the lease → FAILED_RETRYABLE + retryable failure (no overwrite);
  //  • otherwise → a typed state-changed failure.
  private async reconcileNonDurable(args: {
    lease: { id: string; token: string };
    userTurnId: string; orgEntityId: string; subjectEntityId: string; twinId: string; conversationId: string;
  }): Promise<FinishResult> {
    const req = await prisma.otzarConversationRequest.findFirst({
      where: {
        request_record_id: args.lease.id,
        org_entity_id: args.orgEntityId,
        subject_entity_id: args.subjectEntityId,
        twin_entity_id: args.twinId,
        conversation_id: args.conversationId,
      },
    });
    if (req === null) {
      return { kind: "failure", failure: { ok: false, code: "OTZAR_CONTINUITY_STATE_CHANGED", message: "This request changed state before it finished; please retry." } };
    }
    if (req.state === "COMPLETED" && req.canonical_assistant_turn_id !== null) {
      const canon = await this.loadScopedCanonical(req.canonical_assistant_turn_id, args);
      if (canon !== null) return { kind: "replay", success: await this.reconstructFromAssistantTurn(canon, args.conversationId) };
      // COMPLETED but the canonical turn is not coherent → do not fabricate success.
      return { kind: "failure", failure: { ok: false, code: "OTZAR_CONTINUITY_STATE_CHANGED", message: "This request changed state before it finished; please retry." } };
    }
    if (req.state === "PROCESSING" && req.lease_token !== args.lease.token) {
      return { kind: "failure", failure: { ok: false, code: "OTZAR_REQUEST_IN_PROGRESS", message: "This request is already being processed. Please retry shortly." } };
    }
    // We still own the lease (or it is FAILED_RETRYABLE ours) → mark retryable. abortRequest
    // is lease-gated, so it can NEVER overwrite a winner or another owner's live lease.
    if (req.lease_token === args.lease.token) {
      await this.abortRequest(args.lease, false, "OTZAR_ASSISTANT_TURN_PERSIST_FAILED");
    }
    return { kind: "failure", failure: { ok: false, code: "OTZAR_ASSISTANT_TURN_PERSIST_FAILED", message: "I couldn't durably record my reply; your request is saved — please retry." } };
  }

  // §6: an accepted turn that returns a failure AFTER the claim but BEFORE the
  // canonical result must transition the request out of PROCESSING explicitly —
  // never leave it PROCESSING for the lease to decay (which would wrongly refuse a
  // legitimate retry as in-progress). `final=false` (FAILED_RETRYABLE) lets a retry
  // reclaim immediately; `final=true` (FAILED_FINAL) for deterministic rejections.
  private async abortRequest(
    lease: { id: string; token: string } | null,
    final: boolean,
    failureCode: string,
  ): Promise<void> {
    if (lease === null) return;
    try {
      await failRequest({ request_record_id: lease.id, leaseToken: lease.token, final, failure_code: failureCode });
    } catch (e) {
      logger.warn({ err: e, requestRecordId: lease.id }, "otzar request abort failed (lease will expire → retry reclaims)");
    }
  }

  // WHAT: rebuild a faithful ConductSessionSuccess for a retry replay from the stored
  // assistant turn + its linked action state (never inferred from prose): a pending
  // action → ACTION_PROPOSED/awaiting; otherwise ANSWERED.
  private async reconstructFromAssistantTurn(
    asst: OtzarConversationTurn,
    conversationId: string,
  ): Promise<ConductSessionSuccess> {
    let awaiting = false;
    if (asst.action_ref !== null) {
      const led = await prisma.workLedgerEntry.findUnique({
        where: { ledger_entry_id: asst.action_ref },
        select: { status: true },
      });
      awaiting = led?.status === "NEEDS_CALLER_CONFIRMATION" || led?.status === "EXECUTING";
    }
    return {
      ok: true,
      response: asst.content,
      context_used: 0,
      tokens_consumed: 0,
      conversation_id: conversationId,
      next_step: awaiting ? "ACTION_PROPOSED" : "ANSWERED",
      correction_capture_available: true,
      speech_ready_text: asst.content,
      voice_output_supported: false,
      clarification_needed: false,
      action_proposed: awaiting,
      approval_required: awaiting,
      policy_blocked: false,
      dmw_scope_blocked: false,
      collaboration_suggested: false,
      memory_used_summary: {
        layer_1_corrections: 0, layer_3_work_profile: 0, layer_4_foundational: 0,
        layer_5_relevant_context: 0, layer_8_history_messages: 0, total_capsules: 0,
      },
    };
  }

  // [OTZAR-CONTINUITY C5] Reconstruct the response for a request whose action already
  // reached a durable state but whose assistant turn / finalization did not land. Built
  // ONLY from durable ledger state (status + details.proposal + event_id) — never from
  // model memory, never by re-running continuity (which for an executed action would find
  // no pending proposal and misroute to the LLM). Ownership is verified (the action must
  // belong to the subject); a foreign/absent action fails closed (null → caller decides).
  private async reconstructFromAction(
    actionRef: string,
    conversationId: string,
    scope: { subjectEntityId: string },
  ): Promise<ConductSessionSuccess | null> {
    const led = await prisma.workLedgerEntry.findUnique({
      where: { ledger_entry_id: actionRef },
      select: { status: true, details: true, title: true, owner_entity_id: true },
    });
    if (led === null || led.owner_entity_id !== scope.subjectEntityId) return null; // fail closed
    const details = (led.details ?? {}) as Record<string, unknown>;
    const proposal = (details.proposal ?? {}) as { title?: string; resolved_label?: string };
    const title = proposal.title ?? led.title ?? "that";
    const label = typeof proposal.resolved_label === "string" ? proposal.resolved_label : undefined;
    const eventId = typeof details.event_id === "string" ? details.event_id : undefined;
    let state: string;
    let response: string;
    switch (led.status) {
      case "NEEDS_CALLER_CONFIRMATION":
        state = "AWAITING_CONFIRMATION";
        response = label ? `I've got "${title}" for ${label}. Want me to add it?` : `I've got "${title}" ready. Want me to add it?`;
        break;
      case "EXECUTING":
        state = "AWAITING_CONFIRMATION";
        response = `I'm already working on "${title}".`;
        break;
      case "EXECUTED":
        state = "CREATED";
        response = `That's already done — "${title}" is on your calendar.`;
        break;
      case "CANCELLED":
        state = "CANCELLED";
        response = `Okay — I won't add "${title}". Cancelled.`;
        break;
      case "BLOCKED":
        state = "PROVIDER_BLOCKED";
        response = typeof details.blocked_reason === "string"
          ? details.blocked_reason
          : `I couldn't finish adding "${title}" — the calendar provider is unavailable. Your request is saved; try again shortly.`;
        break;
      default:
        return null; // unknown status → let the caller decide (never fabricate)
    }
    return this.buildContinuitySuccess(conversationId, { state, response, ...(eventId !== undefined ? { event_id: eventId } : {}) });
  }

  // ──────────────────────────────────────────────────────────────
  // closeConversation -- PORTABILITY: writes CONVERSATION_LEARNING
  // capsule to EMPLOYEE wallet (NOT org wallet). Fires Loop 1 hook
  // via coeService.recordOutcome. Invalidates priming cache.
  // ──────────────────────────────────────────────────────────────
  async closeConversation(
    input: CloseConversationInput,
  ): Promise<CloseConversationSuccess | OtzarFailure> {
    const session = await this.authService.validateSession(input.token, "read");
    if (!session.valid) {
      return { ok: false, code: session.code, message: "Otzar close denied" };
    }
    const ownerEntityId = session.entity_id;

    const conv = await prisma.otzarConversation.findUnique({
      where: { conversation_id: input.conversation_id },
    });
    if (conv === null) {
      return {
        ok: false,
        code: "CONVERSATION_NOT_FOUND",
        message: "Conversation not found",
      };
    }
    if (conv.entity_id !== ownerEntityId) {
      return {
        ok: false,
        code: "NOT_CONVERSATION_OWNER",
        message: "Caller does not own this conversation",
      };
    }

    // Topic extraction. Degraded path (auto-close) skips LLM call
    // and uses a generic topic. Otherwise prompt the LLM, parse,
    // fall back to "conversation_summary" on any malformed shape.
    const topics = await this.extractTopics(input.conversation_history);

    // PORTABILITY: write CONVERSATION_LEARNING capsule to the
    // EMPLOYEE wallet, never the org wallet. Section 15 P4
    // offboarding will preserve this -- the employee's
    // CONVERSATION_LEARNING capsules travel with them.
    const ownerWallet = await prisma.wallet.findUnique({
      where: { entity_id: ownerEntityId },
      select: { wallet_id: true },
    });
    if (ownerWallet === null) {
      return {
        ok: false,
        code: "TWIN_NOT_FOUND",
        message: "Caller has no wallet",
      };
    }
    const newCapsuleId = randomUUID();
    const summary = `Conversation ${input.conversation_id} closed; topics: ${topics.join(", ")}`;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { countTokens } = require("@anthropic-ai/tokenizer") as {
      countTokens: (text: string) => number;
    };
    await prisma.memoryCapsule.create({
      data: {
        capsule_id: newCapsuleId,
        wallet_id: ownerWallet.wallet_id,
        entity_id: ownerEntityId, // EMPLOYEE -- portability invariant
        version: 1,
        capsule_type: "CONVERSATION_LEARNING",
        topic_tags: topics,
        decay_type: "TIME_BASED",
        payload_summary: summary,
        payload_size_tokens: Math.ceil(summary.length / 4),
        tokens: countTokens(summary),
        tokens_tokenizer: "anthropic",
        storage_location: `niov://otzar/conv/${input.conversation_id}/${newCapsuleId}`,
        // [CS-P1] REAL tamper-evidence: the hash is the sha256 of the
        // capsule's summary content (previously a placeholder — the twin
        // audit's named integrity gap). Pre-existing rows keep their
        // historical placeholder values; verification treats them as
        // legacy, never as tampered.
        content_hash: `sha256:${createHash("sha256").update(summary, "utf8").digest("hex")}`,
        created_by: ownerEntityId,
      },
    });

    // Fire Loop 1 hook via coeService.recordOutcome (Section 10
    // wiring already in place via buildApp's COEFeedbackHook).
    const used = input.capsule_ids_used ?? [];
    if (used.length > 0) {
      await this.coeService.recordOutcome(input.token, null, used, true);
    }

    // Flip conversation status.
    await prisma.otzarConversation.update({
      where: { conversation_id: input.conversation_id },
      // ADR-0054 Wave 2B: link the conversation to the
      // CONVERSATION_LEARNING summary capsule written above (additive;
      // the canonical conversation->summary link for look-back detail).
      data: {
        status: "CLOSED",
        closed_at: new Date(),
        summary_capsule_id: newCapsuleId,
      },
    });

    // Increment latest CompoundingMetrics.capsule_count for the org.
    try {
      const { getOrgEntityId } = await import("../governance/org.js");
      const orgEntityId = await getOrgEntityId(ownerEntityId);
      const latestMetric = await prisma.compoundingMetrics.findFirst({
        where: { org_entity_id: orgEntityId },
        orderBy: { measured_at: "desc" },
      });
      if (latestMetric !== null) {
        await prisma.compoundingMetrics.update({
          where: { metric_id: latestMetric.metric_id },
          data: { capsule_count: { increment: 1 } },
        });
      }
    } catch {
      // Orgless caller -- nothing to update. Silent.
    }

    // Invalidate priming cache so the next conversation sees fresh
    // data.
    await this.cache.delete(`otzar:prime:${ownerEntityId}`);
    // Clear last_active so the auto-close sweep doesn't reprocess.
    await this.cache.delete(`otzar:conv:${input.conversation_id}:last_active`);

    // Section 11D TP9 -- emit CONVERSATION_CLOSED audit event with
    // hash-chained trail. Carries the conversation_id, the
    // CONVERSATION_LEARNING capsule_id we just wrote, and the
    // capsule_ids_used the caller passed in (for downstream Loop 1
    // attribution analysis if needed).
    await writeAuditEvent({
      event_type: "CONVERSATION_CLOSED",
      outcome: "SUCCESS",
      actor_entity_id: ownerEntityId,
      target_entity_id: ownerEntityId,
      details: {
        conversation_id: input.conversation_id,
        capsule_id: newCapsuleId,
        capsule_ids_used: used,
      },
    });

    return {
      ok: true,
      capsule_id: newCapsuleId,
      conversation_id: input.conversation_id,
      topics,
    };
  }

  // ──────────────────────────────────────────────────────────────
  // getMyTwin -- the employee's own aligned-twin identity.
  //
  // WHAT: Resolve + return the caller's OWN primary digital twin.
  // INPUT: GetMyTwinInput { token }.
  // OUTPUT: MyTwinSuccess (200) or OtzarFailure (SESSION_* / TWIN_NOT_FOUND).
  // WHY: Self-read; "read" capability only (no admin gate, no org
  //      scope -- the twin is the caller's own AI_AGENT child). Resolves
  //      the SAME primary twin conductSession talks to (oldest active by
  //      created_at ASC, entity_id ASC tie-break) so the twin a user
  //      SEES equals the twin they TALK TO. Returns identity + alignment
  //      fields ONLY -- never the role-template body
  //      (AgentTemplate.template_content), capability flags, permission
  //      bridge IDs, or any memory / capsule / vector data. When the
  //      owner has more than one twin we do NOT error: we return the
  //      primary twin plus has_multiple_twins + twin_count.
  // ──────────────────────────────────────────────────────────────
  async getMyTwin(
    input: GetMyTwinInput,
  ): Promise<MyTwinSuccess | OtzarFailure> {
    const session = await this.authService.validateSession(input.token, "read");
    if (!session.valid) {
      return { ok: false, code: session.code, message: "My Twin denied" };
    }
    const ownerEntityId = session.entity_id;

    // Active memberships of the caller. role_title travels with the
    // membership row; twin identity travels with the child entity.
    const memberships = await prisma.entityMembership.findMany({
      where: { parent_id: ownerEntityId, is_active: true },
      select: { child_id: true, role_title: true },
    });
    const childIds = memberships.map((m) => m.child_id);
    // IDENTICAL orderBy to conductSession (QLOCK D-OTZ-2 alignment) so
    // the seen twin == the talked-to twin.
    const twins = await prisma.entity.findMany({
      where: {
        entity_id: { in: childIds },
        entity_type: "AI_AGENT",
        deleted_at: null,
      },
      orderBy: [{ created_at: "asc" }, { entity_id: "asc" }],
    });
    const primary = twins[0];
    if (primary === undefined) {
      return {
        ok: false,
        code: "TWIN_NOT_FOUND",
        message: "Caller has no digital twin",
      };
    }

    const config = await prisma.twinConfig.findUnique({
      where: { twin_id: primary.entity_id },
    });

    // Friendly skill name + category ONLY. capability_flags is NOT
    // selected -- the raw capability envelope stays server-side.
    const twinSkills = await prisma.twinSkill.findMany({
      where: { twin_id: primary.entity_id },
      include: { package: { select: { name: true, category: true } } },
      orderBy: { assigned_at: "asc" },
    });
    const skills: MyTwinSkillView[] = twinSkills.map((s) => ({
      name: s.package.name,
      category: s.package.category,
    }));

    // Approver identity (the human who approves this twin's
    // escalations): entity_id + display_name ONLY, and only when set +
    // still live.
    let approver: MyTwinApproverView | null = null;
    if (config?.approver_entity_id != null) {
      const approverEntity = await prisma.entity.findFirst({
        where: { entity_id: config.approver_entity_id, deleted_at: null },
        select: { entity_id: true, display_name: true },
      });
      if (approverEntity !== null) {
        approver = {
          entity_id: approverEntity.entity_id,
          display_name: approverEntity.display_name,
        };
      }
    }

    const roleTitle =
      memberships.find((m) => m.child_id === primary.entity_id)?.role_title ??
      null;

    // ── ADR-0053 Wave 2A: safe, self-scoped role-scope profile ──
    // Derived ONLY from the caller's own substrate. NEVER exposes raw
    // permission internals, bridge IDs, capability flags, clearance
    // values, permission-condition JSON, can_share_forward, transcript /
    // message content, capsule IDs, or storage locations. No surveillance
    // framing. derive-first per ADR-0053 (no new models/migrations).

    // The HUMAN owner's OWN org memberships (owner as the CHILD of an org /
    // parent). role_title / department / hierarchy here describe the
    // human's place in the org — distinct from the twin's "Digital Twin"
    // role (which is the parent=owner -> child=twin membership above).
    const ownerMemberships = await prisma.entityMembership.findMany({
      where: { child_id: ownerEntityId },
      select: {
        is_active: true,
        department: true,
        hierarchy_level: true,
        is_admin: true,
      },
      orderBy: { created_at: "asc" },
    });
    const activeOwnerMemberships = ownerMemberships.filter((m) => m.is_active);
    const ownerDepartments = Array.from(
      new Set(
        activeOwnerMemberships
          .map((m) => m.department)
          .filter((d): d is string => typeof d === "string" && d.length > 0),
      ),
    );
    const ownerIsOrgAdmin = activeOwnerMemberships.some((m) => m.is_admin);
    const primaryOwnerMembership = activeOwnerMemberships[0] ?? null;

    const ownerProfile = await prisma.entityProfile.findUnique({
      where: { entity_id: ownerEntityId },
      select: { job_title: true },
    });

    // Self-scoped continuity COUNTS only (no content, no IDs, no storage
    // locations). Wave 2A uses total self-scoped counts; the `recent_`
    // prefix reserves a future time-window without a contract change.
    const profileWallet = await prisma.wallet.findUnique({
      where: { entity_id: ownerEntityId },
      select: { wallet_id: true },
    });
    const [
      recentConversationCount,
      recentCorrectionCount,
      recentLearningCount,
    ] = await Promise.all([
      prisma.otzarConversation.count({ where: { entity_id: ownerEntityId } }),
      profileWallet === null
        ? Promise.resolve(0)
        : prisma.memoryCapsule.count({
            where: {
              wallet_id: profileWallet.wallet_id,
              capsule_type: "CORRECTION",
              deleted_at: null,
            },
          }),
      profileWallet === null
        ? Promise.resolve(0)
        : prisma.memoryCapsule.count({
            where: {
              wallet_id: profileWallet.wallet_id,
              capsule_type: "CONVERSATION_LEARNING",
              deleted_at: null,
            },
          }),
    ]);

    const scopeLabel = ownerIsOrgAdmin
      ? "Organization-admin scoped context"
      : activeOwnerMemberships.length > 0
        ? "Role-scoped enterprise context"
        : "Personal work scope";

    const roleScopeProfile: MyTwinRoleScopeProfile = {
      identity: {
        twin_id: primary.entity_id,
        display_name: primary.display_name,
        status: primary.status,
      },
      role: {
        role_title: roleTitle,
        job_title: ownerProfile?.job_title ?? null,
        department: primaryOwnerMembership?.department ?? null,
        hierarchy_level: primaryOwnerMembership?.hierarchy_level ?? null,
        is_admin_twin: config?.is_admin_twin ?? false,
      },
      scope_summary: {
        scope_label: scopeLabel,
        membership_count: ownerMemberships.length,
        active_membership_count: activeOwnerMemberships.length,
        department_count: ownerDepartments.length,
        has_department_scope: ownerDepartments.length > 0,
        has_multiple_memberships: activeOwnerMemberships.length > 1,
        permission_posture:
          activeOwnerMemberships.length > 0
            ? "Governed by role and organization access rules"
            : "Personal work scope only",
        approval_posture:
          approver !== null
            ? "Approval required for sensitive actions"
            : "No approver configured",
      },
      assistance_profile: {
        autonomy_mode: config?.autonomy_level ?? "APPROVAL_REQUIRED",
        swarm_enabled: config?.swarm_enabled ?? false,
        role_template_status:
          typeof config?.role_template === "string" &&
          config.role_template.length > 0
            ? "CONFIGURED"
            : "NOT_CONFIGURED",
        skills_status: skills.length > 0 ? "AVAILABLE" : "NOT_CONFIGURED",
        current_assistance_boundaries: [
          "Operates within your role and organization access scope",
          "Sensitive actions require permission, policy, or approval",
          "Observes permissioned work context to reduce drift and keep your work aligned",
        ],
      },
      governance: {
        approver_configured: approver !== null,
        approver,
        sensitive_actions_require: "PERMISSION_POLICY_OR_APPROVAL",
        observation_mode: "PERMISSIONED_WORK_CONTEXT_NOT_SURVEILLANCE",
      },
      continuity: {
        recent_conversation_count: recentConversationCount,
        recent_correction_count: recentCorrectionCount,
        recent_learning_summary_count: recentLearningCount,
        alignment_signals_available:
          recentCorrectionCount > 0 || recentLearningCount > 0,
      },
    };

    // Section 1 Wave 6A — symbiotic advisory surface. When the
    // optional proposedPatternService dependency is wired (production
    // at server.ts), surface the caller's OWN ACCEPTED patterns as
    // alignment guidance. The owner sees the same alignment context
    // their Twin sees — review-and-acceptance is how the owner
    // teaches the Twin per Founder Wave 6A clarification.
    //
    // Deliberately NO assembleContext touch — that's forward-substrate
    // per Wave 6B ADR/design. Deliberately NO audit emission —
    // getMyTwin is a no-audit self-read by ADR-0053 Wave 2A design.
    let acceptedPatterns: readonly AcceptedPatternAdvisoryView[] | undefined =
      undefined;
    if (this.proposedPatternService !== undefined) {
      acceptedPatterns =
        await this.proposedPatternService.listAcceptedPatternsForOwner(
          ownerEntityId,
        );
    }

    // Section 1 Wave 3 — symbiotic proactive cards sidecar per
    // ADR-0068. Pull-based, computed-on-read; derived purely
    // from existing self-scoped substrate; never persisted;
    // never emits a new audit row (inherits Wave 2A no-audit
    // posture). Owner-scope is by-construction: the same
    // ownerEntityId used for the Wave 6A accepted_patterns
    // read is reused here, so there is no cross-owner path.
    // Per-source read failures are swallowed inside
    // assembleProactiveCards per ADR-0068 §6.
    //
    // Sidecar is omitted (a) when the caller explicitly opts
    // out via include_proactive_cards=false, or (b) when the
    // optional proposedPatternService dependency is not wired
    // (mirrors the Wave 6A backward-compat posture for older
    // test fixtures constructed without the 5th arg), or
    // (c) when zero cards apply.
    let proactiveCards: readonly ProactiveCardView[] | undefined = undefined;
    if (
      input.include_proactive_cards !== false &&
      this.proposedPatternService !== undefined
    ) {
      try {
        const cards = await assembleProactiveCards({
          ownerEntityId,
          proposedPatternService: this.proposedPatternService,
          computeStaleContext: computeStaleContextLabelForEntity,
          computeDriftRollup: computeDriftRollupLabelForEntity,
        });
        if (cards.length > 0) {
          proactiveCards = cards;
        }
      } catch {
        // ADR-0068 §6 swallow pattern: a transient read miss on
        // the proactive sidecar must never break getMyTwin.
        proactiveCards = undefined;
      }
    }

    // Phase EDX-1 employee Twin self-state extension —
    // pending_approvals_summary sidecar. Self-scoped via
    // primary.entity_id as the approver-side target. Per-source
    // read miss swallowed silently per the same ADR-0068 §6
    // pattern proactive_cards uses, so a transient DB miss
    // never breaks the My Twin read.
    let pendingApprovalsSummary: TwinPendingApprovalsSummary | undefined;
    try {
      pendingApprovalsSummary = await computePendingApprovalsSummaryForCaller(
        primary.entity_id,
      );
    } catch {
      pendingApprovalsSummary = undefined;
    }

    // Phase EDX-1 employee Twin self-state extension —
    // recent_action_summary sidecar. Self-scoped via
    // primary.entity_id as the action source. Default 7-day
    // window. Per-source read miss swallowed silently per
    // ADR-0068 §6.
    let recentActionSummary: TwinRecentActionSummary | undefined;
    try {
      recentActionSummary = await computeRecentActionSummaryForCaller(
        primary.entity_id,
      );
    } catch {
      recentActionSummary = undefined;
    }

    // Phase EDX-1 employee Twin self-state extension —
    // memory_scope_summary sidecar. Self-scoped via
    // primary.entity_id as the scoped entity. Per-source read
    // miss swallowed silently per ADR-0068 §6.
    let memoryScopeSummary: TwinMemoryScopeSummary | undefined;
    try {
      memoryScopeSummary = await computeMemoryScopeSummaryForCaller(
        primary.entity_id,
      );
    } catch {
      memoryScopeSummary = undefined;
    }

    // Phase EDX-1 employee Twin self-state extension —
    // active_grants_summary sidecar. Self-scoped via
    // primary.entity_id as the grantor/delegator. Composes
    // DM1-A ConsentGrant + DM3-A TeamDelegation reads. Per-source
    // read miss swallowed silently per ADR-0068 §6.
    let activeGrantsSummary: TwinActiveGrantsSummary | undefined;
    try {
      activeGrantsSummary = await computeActiveGrantsSummaryForCaller(
        primary.entity_id,
      );
    } catch {
      activeGrantsSummary = undefined;
    }

    // Phase EDX-4 PR 3 employee Twin self-state extension —
    // active_authority_summary sidecar. Self-scoped via
    // primary.entity_id as the grantor. Distinct from
    // active_grants_summary above (which aggregates DM1-A
    // ConsentGrant + DM3-A TeamDelegation). Per-source read miss
    // swallowed silently per ADR-0068 §6.
    let activeAuthoritySummary: TwinActiveAuthoritySummary | undefined;
    try {
      activeAuthoritySummary = await computeActiveAuthoritySummaryForCaller(
        primary.entity_id,
      );
    } catch {
      activeAuthoritySummary = undefined;
    }

    // Phase EDX-5 PR 3 employee Twin self-state extension —
    // personal_preferences_summary sidecar. Self-scoped via
    // primary.entity_id as the owner. Distinct from the existing
    // ADR-0055 Wave 2C CORRECTION MemoryCapsule (which is read at
    // L1 of conductSession, not surfaced via this sidecar).
    // Per-source read miss swallowed silently per ADR-0068 §6.
    let personalPreferencesSummary:
      | TwinPersonalPreferencesSummary
      | undefined;
    try {
      personalPreferencesSummary =
        await computePersonalPreferencesSummaryForCaller(primary.entity_id);
    } catch {
      personalPreferencesSummary = undefined;
    }

    // Phase EDX-6 PR 3 employee Twin self-state extension —
    // collaboration_inbox_summary sidecar. Self-scoped via
    // primary.entity_id (the human owner; the helper's where
    // clause checks target_entity_id OR target_twin_entity_id so
    // requests addressed to either the owner or their primary
    // Twin are counted). Per-source read miss swallowed silently
    // per ADR-0068 §6.
    let collaborationInboxSummary: TwinCollaborationInboxSummary | undefined;
    try {
      collaborationInboxSummary =
        await computeCollaborationInboxSummaryForCaller(primary.entity_id);
    } catch {
      collaborationInboxSummary = undefined;
    }

    // Phase 1 PR 3 employee Twin self-state extension —
    // project_context_summary sidecar. Self-scoped via
    // primary.entity_id (the human owner; project membership lives
    // on the human, not the Twin). Per-source read miss swallowed
    // silently per ADR-0068 §6.
    let projectContextSummary: TwinProjectContextSummary | undefined;
    try {
      projectContextSummary = await computeProjectContextSummaryForCaller(
        primary.entity_id,
      );
    } catch {
      projectContextSummary = undefined;
    }

    // Phase EDX-1 employee Twin self-state extension —
    // voice_readiness_state sidecar. Constant projection (no
    // DB hit, no caller-specific gating at the Foundation tier).
    const voiceReadinessState: TwinVoiceReadinessState =
      computeVoiceReadinessState();

    const twin: MyTwinView = {
      twin_id: primary.entity_id,
      display_name: primary.display_name,
      role_title: roleTitle,
      autonomy_mode: config?.autonomy_level ?? "APPROVAL_REQUIRED",
      swarm_enabled: config?.swarm_enabled ?? false,
      role_template: config?.role_template ?? null,
      is_admin_twin: config?.is_admin_twin ?? false,
      status: primary.status,
      skills,
      approver,
      created_at: primary.created_at,
      updated_at: config?.updated_at ?? primary.updated_at,
      role_scope_profile: roleScopeProfile,
      ...(acceptedPatterns !== undefined
        ? { accepted_patterns: acceptedPatterns }
        : {}),
      ...(proactiveCards !== undefined
        ? { proactive_cards: proactiveCards }
        : {}),
      ...(pendingApprovalsSummary !== undefined
        ? { pending_approvals_summary: pendingApprovalsSummary }
        : {}),
      ...(recentActionSummary !== undefined
        ? { recent_action_summary: recentActionSummary }
        : {}),
      ...(memoryScopeSummary !== undefined
        ? { memory_scope_summary: memoryScopeSummary }
        : {}),
      ...(activeGrantsSummary !== undefined
        ? { active_grants_summary: activeGrantsSummary }
        : {}),
      ...(activeAuthoritySummary !== undefined
        ? { active_authority_summary: activeAuthoritySummary }
        : {}),
      ...(personalPreferencesSummary !== undefined
        ? { personal_preferences_summary: personalPreferencesSummary }
        : {}),
      ...(collaborationInboxSummary !== undefined
        ? { collaboration_inbox_summary: collaborationInboxSummary }
        : {}),
      ...(projectContextSummary !== undefined
        ? { project_context_summary: projectContextSummary }
        : {}),
      voice_readiness_state: voiceReadinessState,
    };

    return {
      ok: true,
      twin,
      has_multiple_twins: twins.length > 1,
      twin_count: twins.length,
    };
  }

  // ──────────────────────────────────────────────────────────────
  // extractFromComms -- Phase 1213 [OTZAR-AMBIENT-COMMS] entry
  // point. Given a "captured" conversation text from the CT Comms
  // page (demo-capture timer, manual paste, or future live STT),
  // organize it into summary + decisions + commitments + suggested
  // governed-Action follow-ups. Suggested actions become real
  // Action rows ONLY when the operator clicks Send on the CT
  // approval card -- exactly the existing Phase 1208 path.
  //
  // WHAT: Closed-vocab CommsExtractionResult; no DB writes; no
  //       new mutation surface.
  // INPUT: ExtractCommsInput { token, captured_text, force_mode? }.
  // OUTPUT: ExtractCommsSuccess (200) or OtzarFailure (SESSION_*).
  // WHY: Reuses identity-context (Phase 1205) for roster
  //      resolution + existing llmProvider for LLM extraction
  //      mode. Demo-scripted mode honors the Founder-provided
  //      canonical fixture so the demo proves the loop without
  //      depending on LLM provisioning. The path is read-only at
  //      Foundation tier; persistence comes via the existing
  //      Action pipeline when the operator confirms a follow-up.
  // ──────────────────────────────────────────────────────────────
  async extractFromComms(
    input: ExtractCommsInput,
  ): Promise<ExtractCommsSuccess | OtzarFailure> {
    const session = await this.authService.validateSession(input.token, "read");
    if (!session.valid) {
      return { ok: false, code: session.code, message: "Comms extract denied" };
    }
    if (typeof input.captured_text !== "string" || input.captured_text.length === 0) {
      return {
        ok: false,
        code: "INVALID_HISTORY",
        message: "captured_text is required (non-empty string)",
      };
    }
    const result = await extractFromCapturedText(
      {
        viewerEntityId: session.entity_id,
        captured_text: input.captured_text,
        ...(input.force_mode !== undefined
          ? { force_mode: input.force_mode }
          : {}),
      },
      this.llmProvider,
    );
    return {
      ok: true,
      extraction: result,
    };
  }

  // ──────────────────────────────────────────────────────────────
  // ingestComms -- the governed transcript → owned-work pass. Persists
  // the captured conversation as a durable source-of-truth record and
  // turns commitments into per-owner Work Ledger rows under proof (the
  // noisy tail is quarantined; unproven owners become NEEDS_OWNER for
  // review, never auto-assigned). Gated on "read" (the authenticated-
  // employee tier, EmployeeGuard / can_read_capsules) like the other
  // employee self-scoped governed writes (correction-memory): the real
  // write governance — ownership proof, no-auto-send, no-leak, audit —
  // is enforced in-service, not by the capability tier.
  // ──────────────────────────────────────────────────────────────
  // ── [CS-5] seedDocumentContext — Gap V lane 1 corpus entry. ADMIN-GATED
  // (admin_org); provided_by is always the session caller; extraction OFF
  // by v1 contract (see document-context.service.ts).
  async seedDocumentContext(input: {
    token: string;
    raw: Record<string, unknown>;
  }): Promise<
    | Awaited<ReturnType<typeof seedDocumentContextForCaller>>
    | { ok: false; code: string; message: string }
  > {
    const session = await this.authService.validateSession(input.token, "admin_org");
    if (!session.valid) {
      return { ok: false, code: session.code, message: "Seeding organization context requires admin authority." };
    }
    const normalized = normalizeDocumentContextSeed(input.raw);
    if ("error" in normalized) {
      return { ok: false, code: "INVALID_REQUEST", message: normalized.error };
    }
    return seedDocumentContextForCaller(session.entity_id, normalized);
  }

  // ── [DOC-EXTRACT] extractDocumentWorkPreview — review-first extraction
  // over ONE seeded document. ADMIN-GATED (admin_org), explicit request
  // only, READ-ONLY (preview candidates are never persisted; a human
  // creates approved items through the existing work rail).
  async extractDocumentWorkPreview(input: {
    token: string;
    ledger_entry_id: string;
  }): Promise<
    | Awaited<ReturnType<typeof extractDocumentWorkPreview>>
    | { ok: false; code: string; message: string }
  > {
    const session = await this.authService.validateSession(input.token, "admin_org");
    if (!session.valid) {
      return {
        ok: false,
        code: session.code,
        message: "Scanning seeded documents for possible work requires admin authority.",
      };
    }
    if (typeof input.ledger_entry_id !== "string" || input.ledger_entry_id.length === 0) {
      return { ok: false, code: "INVALID_REQUEST", message: "ledger_entry_id is required" };
    }
    const { getOrgEntityId } = await import("../governance/org.js");
    let orgEntityId: string;
    try {
      orgEntityId = await getOrgEntityId(session.entity_id);
    } catch {
      return { ok: false, code: "NO_ORG_FOR_CALLER", message: "Caller is not in an organization" };
    }
    return extractDocumentWorkPreview(
      session.entity_id,
      orgEntityId,
      input.ledger_entry_id,
      this.llmProvider,
    );
  }

  async ingestComms(
    input: IngestCommsInput,
  ): Promise<IngestCommsSuccess | IngestCommsFailure> {
    // [CS-2] seeding org history is a privileged mode: the session must
    // carry admin_org; normal live ingestion stays on the employee tier.
    const session = await this.authService.validateSession(
      input.token,
      input.seeded !== undefined ? "admin_org" : "read",
    );
    if (!session.valid) {
      return { ok: false, code: session.code, message: "Comms ingest denied" };
    }
    if (typeof input.captured_text !== "string" || input.captured_text.trim().length === 0) {
      return { ok: false, code: "INVALID_HISTORY", message: "captured_text is required (non-empty string)" };
    }
    // [CS-2] seeding is a privileged mode — the route enforces admin_org;
    // this service re-derives provided_by from the SESSION, never the body.
    const result = await ingestTranscript({
      callerEntityId: session.entity_id,
      capturedText: input.captured_text,
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.force_mode !== undefined ? { forceMode: input.force_mode } : {}),
      ...(input.seeded !== undefined
        ? {
            seededContext: {
              provided_by: session.entity_id,
              ...(input.seeded.covering_period != null
                ? { covering_period: input.seeded.covering_period }
                : {}),
            },
          }
        : {}),
      llmProvider: this.llmProvider,
    });
    if (!result.ok) {
      return { ok: false, code: result.code, message: result.message };
    }
    return { ok: true, result };
  }

  // ──────────────────────────────────────────────────────────────
  // ingestSourceEvent -- Slice A. The source-agnostic sibling of ingestComms:
  // any NON-transcript source (Slack message, email thread, webhook, MCP event,
  // manual capture) is normalized to a WorkSourceEvent and flows through the
  // SAME governed chain into the SAME WorkLedger. Same "read"-tier gate + in-
  // service write governance as ingestComms. Re-ingesting the same source event
  // is idempotent (dedupe on the stable external id). Transcripts stay on
  // /comms/ingest — this endpoint refuses TRANSCRIPT to keep the paths honest.
  // ──────────────────────────────────────────────────────────────
  async ingestSourceEvent(
    input: IngestSourceEventInput,
  ): Promise<IngestCommsSuccess | IngestCommsFailure> {
    const session = await this.authService.validateSession(input.token, "read");
    if (!session.valid) {
      return { ok: false, code: session.code, message: "Source-event ingest denied" };
    }
    const s = input.source;
    if (s === undefined || s === null || typeof s.content !== "string" || s.content.trim().length === 0) {
      return { ok: false, code: "INVALID_REQUEST", message: "source.content is required (non-empty string)" };
    }
    if (typeof s.sourceId !== "string" || s.sourceId.trim().length === 0) {
      return { ok: false, code: "INVALID_REQUEST", message: "source.sourceId is required" };
    }
    if (s.sourceSystem === "TRANSCRIPT") {
      return { ok: false, code: "INVALID_REQUEST", message: "Use /otzar/comms/ingest for transcripts." };
    }
    const event: WorkSourceEvent = {
      sourceType: typeof s.sourceType === "string" && s.sourceType.length > 0 ? s.sourceType : "CONNECTOR",
      sourceSystem: s.sourceSystem,
      sourceId: s.sourceId,
      sourceUrl: s.sourceUrl ?? null,
      actor: {
        name: s.actor?.name ?? "",
        ...(s.actor?.handle ? { handle: s.actor.handle } : {}),
        ...(s.actor?.email ? { email: s.actor.email } : {}),
      },
      participants: Array.isArray(s.participants)
        ? s.participants.map((p) => ({
            name: p.name,
            ...(p.email ? { email: p.email } : {}),
            ...(p.handle ? { handle: p.handle } : {}),
          }))
        : [],
      timestamp: s.timestamp ?? new Date().toISOString(),
      callerEntityId: session.entity_id,
      title: s.title ?? null,
      content: s.content,
      ...(s.sensitivity ? { sensitivity: s.sensitivity } : {}),
      connectorIdentity: s.connectorIdentity ?? null,
      dedupeKey: s.dedupeKey ?? null,
      ingestionRunId: s.ingestionRunId ?? null,
    };
    const result = await ingestSourceEventCore(event, {
      llmProvider: this.llmProvider,
      ...(input.force_mode !== undefined ? { forceMode: input.force_mode } : {}),
    });
    if (!result.ok) {
      return { ok: false, code: result.code, message: result.message };
    }
    return { ok: true, result };
  }

  // ──────────────────────────────────────────────────────────────
  // getContextHealth -- closed-vocab projection of the L0_IDENTITY
  // block conductSession prepends, served to the Voice UI so the
  // operator can see at a glance whether Otzar will recognize them.
  //
  // WHAT: Surface viewer/org/twin/projects/context-signal/safety
  //       facts the LLM ALREADY sees, as a small JSON object suitable
  //       for an "AI Twin context" badge on the Voice page.
  // INPUT: GetContextHealthInput { token }.
  // OUTPUT: ContextHealthSuccess (200) or OtzarFailure (SESSION_*).
  // WHY: Closes the "is Otzar actually loaded with my identity?"
  //      observability gap surfaced by [FOUNDER-AUTH -- FIX AI TWIN
  //      IDENTITY CONTEXT]. The response NEVER includes secrets,
  //      raw memory text, raw transcripts, cross-user data, TAR
  //      hashes, password fields, grant identifiers, or any field
  //      not already present in IdentityContext.
  // ──────────────────────────────────────────────────────────────
  async getContextHealth(
    input: GetContextHealthInput,
  ): Promise<ContextHealthSuccess | OtzarFailure> {
    const session = await this.authService.validateSession(input.token, "read");
    if (!session.valid) {
      return {
        ok: false,
        code: session.code,
        message: "Context health denied",
      };
    }
    const ownerEntityId = session.entity_id;
    const identity: IdentityContext = await buildIdentityContext(ownerEntityId);
    const status: "READY" | "PARTIAL" | "UNCONFIGURED" =
      identity.org.org_id !== null && identity.twin.active
        ? "READY"
        : identity.viewer.display_name !== "Unknown viewer"
          ? "PARTIAL"
          : "UNCONFIGURED";
    return {
      ok: true,
      status,
      identity,
    };
  }

  // ──────────────────────────────────────────────────────────────
  // listConversations -- metadata-only continuity feed.
  //
  // WHAT: List the caller's OWN OtzarConversation rows, metadata only.
  // INPUT: ListConversationsInput { token, skip, take, status? }.
  // OUTPUT: ConversationListSuccess (200) or OtzarFailure (SESSION_*).
  // WHY: Self-scoped (entity_id === caller; no admin gate, no org
  //      scope). Returns conversation metadata ONLY -- NO transcript, NO
  //      message bodies, NO conversation_history, NO capsule references
  //      (OtzarConversation persists none of those). Newest first,
  //      paginated (skip / take / has_more), optional ACTIVE/CLOSED
  //      status filter. An empty result is a SUCCESS with items: [].
  // ──────────────────────────────────────────────────────────────
  async listConversations(
    input: ListConversationsInput,
  ): Promise<ConversationListSuccess | OtzarFailure> {
    const session = await this.authService.validateSession(input.token, "read");
    if (!session.valid) {
      return { ok: false, code: session.code, message: "Conversations denied" };
    }
    const ownerEntityId = session.entity_id;

    // Self-scope: caller's own conversations only. Status filter (when
    // supplied) is composed AS AND with the entity_id predicate -- it
    // never broadens scope.
    const where = {
      entity_id: ownerEntityId,
      ...(input.status !== undefined ? { status: input.status } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.otzarConversation.findMany({
        where,
        orderBy: { started_at: "desc" },
        skip: input.skip,
        take: input.take,
        // Metadata-only projection. Deliberately omits `participants`
        // and never touches message/transcript content (none stored).
        select: {
          conversation_id: true,
          twin_id: true,
          source_type: true,
          status: true,
          message_count: true,
          started_at: true,
          closed_at: true,
        },
      }),
      prisma.otzarConversation.count({ where }),
    ]);

    return {
      ok: true,
      items,
      total,
      has_more: input.skip + input.take < total,
    };
  }

  // [OTZAR-CONTINUITY C6/F] Resolve the caller's (org, subject, twin) restoration scope.
  // The Twin is the caller's deterministic primary Twin — the IDENTICAL oldest-active
  // selection conductSession + getMyTwin use, so restoration reads the same human–Twin
  // relationship the user talks to (never blends across Twins). Orgless or twin-less
  // callers have no durable server threads to restore → null.
  private async restoreScope(ownerEntityId: string): Promise<{ org_entity_id: string; subject_entity_id: string; twin_entity_id: string } | null> {
    const { getOrgEntityId } = await import("../governance/org.js");
    let orgEntityId: string | null;
    try { orgEntityId = await getOrgEntityId(ownerEntityId); } catch { orgEntityId = null; }
    if (orgEntityId === null) return null;
    // [OTZAR-CONTINUITY D] Same shared resolver conductSession uses → restoration reads the
    // exact human–Twin relationship the user talks to (never a different/blended Twin).
    const { resolvePrimaryTwin } = await import("./twin-resolution.js");
    const resolved = await resolvePrimaryTwin(ownerEntityId);
    if (resolved === null) return null;
    return { org_entity_id: orgEntityId, subject_entity_id: ownerEntityId, twin_entity_id: resolved.twin.entity_id };
  }

  // [OTZAR-CONTINUITY C6] Server thread restoration: the caller's most-recent ACTIVE thread
  // (or null — never invented) + a bounded recent list. Scope-gated; the SERVER is the
  // authority CT restores from on login/refresh (not localStorage).
  async restoreThreads(
    input: { token: string; limit?: number; includeArchived?: boolean },
  ): Promise<{ ok: true; active: ThreadSummary | null; recent: ThreadSummary[] } | OtzarFailure> {
    const session = await this.authService.validateSession(input.token, "read");
    if (!session.valid) return { ok: false, code: session.code, message: "Restore denied" };
    const scope = await this.restoreScope(session.entity_id);
    if (scope === null) return { ok: true, active: null, recent: [] };
    const [active, recent] = await Promise.all([
      restoreActiveThread(scope),
      listRecentThreads(scope, { ...(input.limit !== undefined ? { limit: input.limit } : {}), includeArchived: input.includeArchived === true }),
    ]);
    return { ok: true, active, recent };
  }

  // [OTZAR-CONTINUITY C6] A specific thread + bounded recent turns + unresolved summary.
  // Foreign/deleted → OTZAR_THREAD_FORBIDDEN (no existence disclosure).
  async getThreadDetail(
    input: { token: string; conversation_id: string; turn_limit?: number },
  ): Promise<{ ok: true; thread: ThreadSummary; turns: SafeTurn[] } | OtzarFailure> {
    const session = await this.authService.validateSession(input.token, "read");
    if (!session.valid) return { ok: false, code: session.code, message: "Restore denied" };
    const scope = await this.restoreScope(session.entity_id);
    if (scope === null) return { ok: false, code: "OTZAR_THREAD_FORBIDDEN", message: "This conversation is not available to you." };
    const res = await getThreadForRestore(input.conversation_id, scope, input.turn_limit !== undefined ? { turnLimit: input.turn_limit } : {});
    if (res === null) return { ok: false, code: "OTZAR_THREAD_FORBIDDEN", message: "This conversation is not available to you." };
    return { ok: true, thread: res.thread, turns: res.turns };
  }

  // [OTZAR-CONTINUITY C6] Safe status of the caller's own request (for CT reconcile of a
  // locally-pending submission). Foreign → OTZAR_THREAD_FORBIDDEN. Never leaks lease/
  // provider tokens or raw action internals.
  async getRequestStatus(
    input: { token: string; request_record_id: string },
  ): Promise<{ ok: true; status: SafeRequestStatus } | OtzarFailure> {
    const session = await this.authService.validateSession(input.token, "read");
    if (!session.valid) return { ok: false, code: session.code, message: "Restore denied" };
    const scope = await this.restoreScope(session.entity_id);
    if (scope === null) return { ok: false, code: "OTZAR_THREAD_FORBIDDEN", message: "This request is not available to you." };
    const status = await getRequestStatusForUser(scope, input.request_record_id);
    if (status === null) return { ok: false, code: "OTZAR_THREAD_FORBIDDEN", message: "This request is not available to you." };
    return { ok: true, status };
  }

  // [OTZAR-CONTINUITY C6/E] Reconcile a locally-pending submission by the CLIENT-known
  // identity (conversation + client_request_id) — the identifier CT owns after a lost
  // response. Scope-gated (org/subject/twin/conversation/client_request_id); foreign →
  // OTZAR_THREAD_FORBIDDEN (no disclosure).
  async getRequestStatusByClient(
    input: { token: string; conversation_id: string; client_request_id: string },
  ): Promise<{ ok: true; status: SafeRequestStatus } | OtzarFailure> {
    const session = await this.authService.validateSession(input.token, "read");
    if (!session.valid) return { ok: false, code: session.code, message: "Restore denied" };
    const scope = await this.restoreScope(session.entity_id);
    if (scope === null) return { ok: false, code: "OTZAR_THREAD_FORBIDDEN", message: "This request is not available to you." };
    const status = await getRequestByClient(scope, input.conversation_id, input.client_request_id);
    if (status === null) return { ok: false, code: "OTZAR_THREAD_FORBIDDEN", message: "This request is not available to you." };
    return { ok: true, status };
  }

  // [OTZAR-CONTINUITY cross-tab] The caller's UNRESOLVED requests (in-flight or awaiting
  // confirmation) — so a second tab/device discovers the first's obligations from SERVER
  // authority, not tab-local storage. Scope-gated; optionally narrowed to one conversation.
  async listUnresolved(
    input: { token: string; conversation_id?: string; limit?: number; recent_completed_ms?: number },
  ): Promise<{ ok: true; unresolved: SafeRequestStatus[] } | OtzarFailure> {
    const session = await this.authService.validateSession(input.token, "read");
    if (!session.valid) return { ok: false, code: session.code, message: "Restore denied" };
    const scope = await this.restoreScope(session.entity_id);
    if (scope === null) return { ok: true, unresolved: [] };
    const unresolved = await listUnresolvedRequests(scope, {
      ...(input.conversation_id !== undefined ? { conversation_id: input.conversation_id } : {}),
      ...(input.limit !== undefined ? { limit: input.limit } : {}),
      ...(input.recent_completed_ms !== undefined ? { recent_completed_ms: input.recent_completed_ms } : {}),
    });
    return { ok: true, unresolved };
  }

  // ──────────────────────────────────────────────────────────────
  // [OTZAR STAGE-2 §5] Durable organizational obligations. A first-class unresolved
  // responsibility that LINKS the request/action/conversation spine (never copies execution
  // state). All reads/transitions are (org, subject, twin) scope-gated; terminal states are
  // append-only; completion requires validated durable evidence; every mutation emits a
  // leak-safe OBLIGATION_* audit event.

  /** Map a query-layer transition failure to the safe API failure envelope. */
  private mapObligationFailure(outcome: Exclude<TransitionOutcome, { kind: "ok" }>): OtzarFailure {
    switch (outcome.kind) {
      case "not_found":
        return { ok: false, code: "OTZAR_OBLIGATION_NOT_FOUND", message: "This obligation is not available to you." };
      case "stale_version":
        return { ok: false, code: "OTZAR_OBLIGATION_STATE_CHANGED", message: "This obligation changed since you last read it." };
      case "illegal_transition":
        return { ok: false, code: "OTZAR_OBLIGATION_ILLEGAL_TRANSITION", message: "That change isn't allowed from the obligation's current state." };
      case "evidence_required":
        return { ok: false, code: "OTZAR_OBLIGATION_EVIDENCE_REQUIRED", message: "Completion requires durable evidence — silence is not completion." };
      case "not_acknowledgeable":
        return { ok: false, code: "OTZAR_OBLIGATION_NOT_ACKNOWLEDGEABLE", message: "This obligation can't be acknowledged by you here." };
      case "audit_consistency_failure":
        // The transition rolled back because its audit evidence could not be persisted. Never a
        // governed success without durable audit.
        return { ok: false, code: "OTZAR_OBLIGATION_AUDIT_UNCOMMITTED", message: "The change could not be recorded and was rolled back. Please retry." };
    }
  }

  private async obligationScope(token: string): Promise<{ scope: ObligationScope; entity_id: string } | OtzarFailure> {
    const session = await this.authService.validateSession(token, "read");
    if (!session.valid) return { ok: false, code: session.code, message: "Obligation access denied" };
    const scope = await this.restoreScope(session.entity_id);
    if (scope === null) return { ok: false, code: "OTZAR_OBLIGATION_NOT_FOUND", message: "No obligation context for this caller." };
    return { scope, entity_id: session.entity_id };
  }

  // [HARDENING J] Leak-safe obligation monitoring — ids + event/state/reason ONLY. NEVER titles,
  // details, patient content, or source text. Counters are derived downstream from these events.
  private oblLog(event: string, scope: ObligationScope, extra: Record<string, unknown> = {}, level: "info" | "warn" = "info"): void {
    logger[level]({ event: `obligation.${event}`, org: scope.org_entity_id, subject: scope.subject_entity_id, ...extra }, `obligation ${event}`);
  }

  // Map a transition outcome to a monitoring event on the failure paths (§J).
  private oblLogOutcome(scope: ObligationScope, obligationId: string, outcome: Exclude<TransitionOutcome, { kind: "ok" }>): void {
    const map: Record<string, string> = {
      not_found: "cross_scope_denied", stale_version: "stale_conflict", illegal_transition: "illegal_transition",
      evidence_required: "evidence_refused", not_acknowledgeable: "ack_denied", audit_consistency_failure: "audit_uncommitted",
    };
    this.oblLog(map[outcome.kind] ?? outcome.kind, scope, { obligation_id: obligationId }, "warn");
  }

  /** Create (or idempotently return) an obligation. The caller is the creator; the responsible
   *  party defaults to the caller unless specified. Audit is written atomically in the query tx. */
  async createObligation(input: {
    token: string;
    obligation_type: ObligationType;
    title: string;
    responsible_entity_id?: string;
    origin_key?: string | null;
    initial_state?: ObligationState;
    priority?: string;
    required_response_class?: string | null;
    source_channel?: string;
    provenance_class?: string;
    details?: Record<string, unknown>;
    conversation_id?: string | null;
    source_turn_id?: string | null;
    request_record_id?: string | null;
    action_ref?: string | null;
    due_at?: Date | null;
  }): Promise<{ ok: true; obligation: SafeObligation; created: boolean } | OtzarFailure> {
    const resolved = await this.obligationScope(input.token);
    if ("ok" in resolved) return resolved;
    const { scope, entity_id } = resolved;
    const createInput: CreateObligationInput = {
      obligation_type: input.obligation_type,
      title: input.title,
      creator_entity_id: entity_id,
      responsible_entity_id: input.responsible_entity_id ?? entity_id,
      ...(input.origin_key !== undefined ? { origin_key: input.origin_key } : {}),
      ...(input.initial_state !== undefined ? { initial_state: input.initial_state } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.required_response_class !== undefined ? { required_response_class: input.required_response_class } : {}),
      ...(input.source_channel !== undefined ? { source_channel: input.source_channel } : {}),
      ...(input.provenance_class !== undefined ? { provenance_class: input.provenance_class } : {}),
      ...(input.details !== undefined ? { details: input.details } : {}),
      ...(input.conversation_id !== undefined ? { conversation_id: input.conversation_id } : {}),
      ...(input.source_turn_id !== undefined ? { source_turn_id: input.source_turn_id } : {}),
      ...(input.request_record_id !== undefined ? { request_record_id: input.request_record_id } : {}),
      ...(input.action_ref !== undefined ? { action_ref: input.action_ref } : {}),
      ...(input.due_at !== undefined ? { due_at: input.due_at } : {}),
    };
    const res = await createOrGetObligation(scope, createInput, { actor_entity_id: entity_id });
    if (res.kind === "invalid_content" || res.kind === "invalid_state") {
      this.oblLog("invalid_input", scope, { reason: res.kind }, "warn");
      return { ok: false, code: "OTZAR_OBLIGATION_INVALID_INPUT", message: "The obligation input was rejected." };
    }
    if (res.kind === "invalid_reference") {
      this.oblLog("invalid_reference", scope, { reason: res.reason }, "warn");
      return { ok: false, code: "OTZAR_OBLIGATION_INVALID_REFERENCE", message: "A linked reference is invalid or not available to you." };
    }
    if (res.kind === "audit_consistency_failure") {
      this.oblLog("audit_uncommitted", scope, {}, "warn");
      return { ok: false, code: "OTZAR_OBLIGATION_AUDIT_UNCOMMITTED", message: "The obligation could not be recorded and was rolled back. Please retry." };
    }
    if (res.created) this.oblLog("created", scope, { obligation_id: res.obligation.obligation_id, obligation_type: res.obligation.obligation_type });
    return { ok: true, obligation: res.obligation, created: res.created };
  }

  /** List the caller's obligations (restoration read — survives thread close/archive/staff
   *  change; scoped by (org, subject, twin, state), never join-gated on conversation status). */
  async listObligations(input: {
    token: string; states?: ObligationState[]; obligation_type?: ObligationType; conversation_id?: string; open_only?: boolean; limit?: number;
  }): Promise<{ ok: true; obligations: SafeObligation[] } | OtzarFailure> {
    const resolved = await this.obligationScope(input.token);
    if ("ok" in resolved) {
      // A caller with no obligation context legitimately has an empty list, not an error.
      return resolved.code === "OTZAR_OBLIGATION_NOT_FOUND" ? { ok: true, obligations: [] } : resolved;
    }
    const options: ListObligationsOptions = {
      ...(input.states !== undefined ? { states: input.states } : {}),
      ...(input.obligation_type !== undefined ? { obligation_type: input.obligation_type } : {}),
      ...(input.conversation_id !== undefined ? { conversation_id: input.conversation_id } : {}),
      ...(input.open_only !== undefined ? { open_only: input.open_only } : {}),
      ...(input.limit !== undefined ? { limit: input.limit } : {}),
    };
    const obligations = await listObligations(resolved.scope, options);
    return { ok: true, obligations };
  }

  /** A single obligation, scope-gated. Foreign/absent → OTZAR_OBLIGATION_NOT_FOUND. */
  async getObligation(input: { token: string; obligation_id: string }): Promise<{ ok: true; obligation: SafeObligation } | OtzarFailure> {
    const resolved = await this.obligationScope(input.token);
    if ("ok" in resolved) return resolved;
    const obligation = await getObligationForScope(resolved.scope, input.obligation_id);
    if (obligation === null) return { ok: false, code: "OTZAR_OBLIGATION_NOT_FOUND", message: "This obligation is not available to you." };
    return { ok: true, obligation };
  }

  /** Acknowledge — only the responsible actor (or delegate) via a USER turn. Audit is atomic. */
  async acknowledgeObligation(input: { token: string; obligation_id: string; expected_version: number; acknowledged_turn_id: string }): Promise<{ ok: true; obligation: SafeObligation } | OtzarFailure> {
    const resolved = await this.obligationScope(input.token);
    if ("ok" in resolved) return resolved;
    const outcome = await acknowledgeObligation(resolved.scope, {
      obligation_id: input.obligation_id, expected_version: input.expected_version,
      acknowledged_turn_id: input.acknowledged_turn_id, actor_entity_id: resolved.entity_id,
    });
    if (outcome.kind !== "ok") { this.oblLogOutcome(resolved.scope, input.obligation_id, outcome); return this.mapObligationFailure(outcome); }
    this.oblLog("acknowledged", resolved.scope, { obligation_id: input.obligation_id });
    return { ok: true, obligation: outcome.obligation };
  }

  /** Complete — requires validated durable evidence (ACTION_CONFIRMATION: linked ledger
   *  EXECUTED; else a real in-scope USER completion turn). Audit is atomic. */
  async completeObligation(input: { token: string; obligation_id: string; expected_version: number; completion_turn_id?: string | null; completion_action_ref?: string | null; completion_evidence?: Record<string, unknown> | null }): Promise<{ ok: true; obligation: SafeObligation } | OtzarFailure> {
    const resolved = await this.obligationScope(input.token);
    if ("ok" in resolved) return resolved;
    const outcome = await completeObligation(resolved.scope, {
      obligation_id: input.obligation_id, expected_version: input.expected_version, actor_entity_id: resolved.entity_id,
      ...(input.completion_turn_id !== undefined ? { completion_turn_id: input.completion_turn_id } : {}),
      ...(input.completion_action_ref !== undefined ? { completion_action_ref: input.completion_action_ref } : {}),
      ...(input.completion_evidence !== undefined ? { completion_evidence: input.completion_evidence } : {}),
    });
    if (outcome.kind !== "ok") { this.oblLogOutcome(resolved.scope, input.obligation_id, outcome); return this.mapObligationFailure(outcome); }
    this.oblLog("completed", resolved.scope, { obligation_id: input.obligation_id });
    return { ok: true, obligation: outcome.obligation };
  }

  /** A simple state transition (cancel / block / start / escalate / expire). Audit is atomic. */
  async transitionObligation(input: { token: string; obligation_id: string; expected_version: number; transition: "cancel" | "block" | "start" | "escalate" | "expire"; escalation_id?: string | null }): Promise<{ ok: true; obligation: SafeObligation } | OtzarFailure> {
    const resolved = await this.obligationScope(input.token);
    if ("ok" in resolved) return resolved;
    const actor = resolved.entity_id;
    const args = { obligation_id: input.obligation_id, expected_version: input.expected_version };
    let outcome: TransitionOutcome;
    switch (input.transition) {
      case "cancel": outcome = await cancelObligation(resolved.scope, { ...args, actor_entity_id: actor }); break;
      case "block": outcome = await blockObligation(resolved.scope, { ...args, actor_entity_id: actor }); break;
      case "start": outcome = await startObligation(resolved.scope, args); break;
      case "expire": outcome = await expireObligation(resolved.scope, { ...args, actor_entity_id: actor }); break;
      case "escalate":
        outcome = await escalateObligation(resolved.scope, { ...args, actor_entity_id: actor, ...(input.escalation_id != null ? { escalation_id: input.escalation_id } : {}) });
        break;
    }
    if (outcome.kind !== "ok") { this.oblLogOutcome(resolved.scope, input.obligation_id, outcome); return this.mapObligationFailure(outcome); }
    this.oblLog(input.transition, resolved.scope, { obligation_id: input.obligation_id });
    return { ok: true, obligation: outcome.obligation };
  }

  /** Reassign — new responsible party; resets ack; full prior lineage in the atomic audit.
   *  [HARDENING F] the new responsible party must be a real, active, in-scope entity. */
  async reassignObligation(input: { token: string; obligation_id: string; expected_version: number; new_responsible_entity_id: string; reason: string }): Promise<{ ok: true; obligation: SafeObligation } | OtzarFailure> {
    const resolved = await this.obligationScope(input.token);
    if ("ok" in resolved) return resolved;
    const respErr = await validateResponsibleEntity(resolved.scope, input.new_responsible_entity_id);
    if (respErr !== null) {
      this.oblLog("invalid_reference", resolved.scope, { reason: respErr }, "warn");
      return { ok: false, code: "OTZAR_OBLIGATION_INVALID_REFERENCE", message: "The new responsible party is not a valid, active member of this organization." };
    }
    const { outcome } = await reassignObligation(resolved.scope, {
      obligation_id: input.obligation_id, expected_version: input.expected_version,
      new_responsible_entity_id: input.new_responsible_entity_id, assigning_actor_entity_id: resolved.entity_id, reason: input.reason,
    });
    if (outcome.kind !== "ok") { this.oblLogOutcome(resolved.scope, input.obligation_id, outcome); return this.mapObligationFailure(outcome); }
    this.oblLog("reassigned", resolved.scope, { obligation_id: input.obligation_id });
    return { ok: true, obligation: outcome.obligation };
  }

  /** Supersede — create a linked replacement and mark the original SUPERSEDED (history kept). */
  async supersedeObligation(input: {
    token: string; obligation_id: string; expected_version: number;
    replacement: { obligation_type: ObligationType; title: string; responsible_entity_id?: string; priority?: string; required_response_class?: string | null; details?: Record<string, unknown>; conversation_id?: string | null; source_turn_id?: string | null; action_ref?: string | null; initial_state?: ObligationState; due_at?: Date | null };
  }): Promise<{ ok: true; obligation: SafeObligation; replacement: SafeObligation } | OtzarFailure> {
    const resolved = await this.obligationScope(input.token);
    if ("ok" in resolved) return resolved;
    const replacementInput: CreateObligationInput = {
      obligation_type: input.replacement.obligation_type,
      title: input.replacement.title,
      creator_entity_id: resolved.entity_id,
      responsible_entity_id: input.replacement.responsible_entity_id ?? resolved.entity_id,
      ...(input.replacement.priority !== undefined ? { priority: input.replacement.priority } : {}),
      ...(input.replacement.required_response_class !== undefined ? { required_response_class: input.replacement.required_response_class } : {}),
      ...(input.replacement.details !== undefined ? { details: input.replacement.details } : {}),
      ...(input.replacement.conversation_id !== undefined ? { conversation_id: input.replacement.conversation_id } : {}),
      ...(input.replacement.source_turn_id !== undefined ? { source_turn_id: input.replacement.source_turn_id } : {}),
      ...(input.replacement.action_ref !== undefined ? { action_ref: input.replacement.action_ref } : {}),
      ...(input.replacement.initial_state !== undefined ? { initial_state: input.replacement.initial_state } : {}),
      ...(input.replacement.due_at !== undefined ? { due_at: input.replacement.due_at } : {}),
    };
    const { outcome, replacement } = await supersedeObligation(resolved.scope, {
      obligation_id: input.obligation_id, expected_version: input.expected_version, replacement: replacementInput, actor_entity_id: resolved.entity_id,
    });
    if (outcome.kind !== "ok" || replacement === undefined) {
      if (outcome.kind !== "ok") this.oblLogOutcome(resolved.scope, input.obligation_id, outcome);
      return outcome.kind === "ok" ? { ok: false, code: "OTZAR_OBLIGATION_STATE_CHANGED", message: "Supersession did not complete." } : this.mapObligationFailure(outcome);
    }
    this.oblLog("superseded", resolved.scope, { obligation_id: input.obligation_id, replacement_obligation_id: replacement.obligation_id });
    return { ok: true, obligation: outcome.obligation, replacement };
  }

  /** Project an obligation from an existing awaiting-confirmation action (a NEEDS_CALLER_
   *  CONFIRMATION WorkLedgerEntry). Idempotent — re-projecting yields the same obligation. The
   *  obligation LINKS the ledger; execution truth stays on the ledger. Audit is atomic. */
  async projectAwaitingConfirmationObligation(input: { token: string; ledger_entry_id: string }): Promise<{ ok: true; obligation: SafeObligation; created: boolean } | OtzarFailure> {
    const resolved = await this.obligationScope(input.token);
    if ("ok" in resolved) return resolved;
    const res = await projectObligationFromAwaitingConfirmation(resolved.scope, input.ledger_entry_id, { actor_entity_id: resolved.entity_id });
    if (res.kind === "audit_consistency_failure") { this.oblLog("audit_uncommitted", resolved.scope, {}, "warn"); return { ok: false, code: "OTZAR_OBLIGATION_AUDIT_UNCOMMITTED", message: "The obligation could not be recorded and was rolled back. Please retry." }; }
    if (res.kind !== "projected") { this.oblLog("projection_inconsistent", resolved.scope, { reason: res.reason }, "warn"); return { ok: false, code: "OTZAR_OBLIGATION_NOT_FOUND", message: "Nothing awaiting confirmation to project here." }; }
    if (res.created) this.oblLog("created", resolved.scope, { obligation_id: res.obligation.obligation_id, projected_from: "awaiting_confirmation" });
    return { ok: true, obligation: res.obligation, created: res.created };
  }

  /** Project an obligation from an unresolved assistant question (a COMPLETED CLARIFICATION
   *  request with a coherent canonical). Idempotent. Audit is atomic. */
  async projectUnresolvedQuestionObligation(input: { token: string; request_record_id: string }): Promise<{ ok: true; obligation: SafeObligation; created: boolean } | OtzarFailure> {
    const resolved = await this.obligationScope(input.token);
    if ("ok" in resolved) return resolved;
    const res = await projectObligationFromUnresolvedQuestion(resolved.scope, input.request_record_id, { actor_entity_id: resolved.entity_id });
    if (res.kind === "audit_consistency_failure") { this.oblLog("audit_uncommitted", resolved.scope, {}, "warn"); return { ok: false, code: "OTZAR_OBLIGATION_AUDIT_UNCOMMITTED", message: "The obligation could not be recorded and was rolled back. Please retry." }; }
    if (res.kind !== "projected") { this.oblLog("projection_inconsistent", resolved.scope, { reason: res.reason }, "warn"); return { ok: false, code: "OTZAR_OBLIGATION_NOT_FOUND", message: "No unresolved question to project here." }; }
    if (res.created) this.oblLog("created", resolved.scope, { obligation_id: res.obligation.obligation_id, projected_from: "unresolved_question" });
    return { ok: true, obligation: res.obligation, created: res.created };
  }

  // ──────────────────────────────────────────────────────────────
  // [OTZAR STAGE-2 §L] Governed responsibility handoffs. MULTI-PARTY: reads scoped by (org,
  // caller-is-a-party) so the receiver sees what was sent; mutations are party-authorized; every
  // governed mutation's HANDOFF_* audit is atomic with the transition; completion is gated on ack
  // + all linked obligations disposed.

  /** Resolve the caller's handoff scope (org + caller entity). No twin (handoffs are inter-party). */
  private async handoffScope(token: string): Promise<{ scope: HandoffScope; entity_id: string } | OtzarFailure> {
    const session = await this.authService.validateSession(token, "read");
    if (!session.valid) return { ok: false, code: session.code, message: "Handoff access denied" };
    const { getOrgEntityId } = await import("../governance/org.js");
    let orgEntityId: string | null;
    try { orgEntityId = await getOrgEntityId(session.entity_id); } catch { orgEntityId = null; }
    if (orgEntityId === null) return { ok: false, code: "OTZAR_HANDOFF_NOT_FOUND", message: "No handoff context for this caller." };
    return { scope: { org_entity_id: orgEntityId, caller_entity_id: session.entity_id }, entity_id: session.entity_id };
  }

  private mapHandoffFailure(outcome: Exclude<HandoffOutcome, { kind: "ok" }>): OtzarFailure {
    switch (outcome.kind) {
      case "not_found": return { ok: false, code: "OTZAR_HANDOFF_NOT_FOUND", message: "This handoff is not available to you." };
      case "stale_version": return { ok: false, code: "OTZAR_HANDOFF_STATE_CHANGED", message: "This handoff changed since you last read it." };
      case "illegal_transition": return { ok: false, code: "OTZAR_HANDOFF_ILLEGAL_TRANSITION", message: "That change isn't allowed from the handoff's current state." };
      case "not_authorized": return { ok: false, code: "OTZAR_HANDOFF_NOT_AUTHORIZED", message: "You aren't the party authorized for this handoff action." };
      case "precondition": return { ok: false, code: "OTZAR_HANDOFF_PRECONDITION", message: "A precondition for this handoff action is not met.", detail: outcome.reason };
      case "audit_consistency_failure": return { ok: false, code: "OTZAR_HANDOFF_AUDIT_UNCOMMITTED", message: "The change could not be recorded and was rolled back. Please retry." };
    }
  }

  private hoffLog(event: string, scope: HandoffScope, extra: Record<string, unknown> = {}, level: "info" | "warn" = "info"): void {
    logger[level]({ event: `handoff.${event}`, org: scope.org_entity_id, caller: scope.caller_entity_id, ...extra }, `handoff ${event}`);
  }

  async createHandoff(input: {
    token: string; title: string; incoming_responsible_entity_id?: string; workspace_id?: string; conversation_id?: string;
    summary?: string; details?: Record<string, unknown>; priority?: string; origin_key?: string; due_at?: Date;
  }): Promise<{ ok: true; handoff: SafeHandoff; created: boolean } | OtzarFailure> {
    const resolved = await this.handoffScope(input.token);
    if ("ok" in resolved) return resolved;
    const { scope, entity_id } = resolved;
    const createInput: CreateHandoffInput = {
      title: input.title, outgoing_responsible_entity_id: entity_id, creator_entity_id: entity_id,
      ...(input.incoming_responsible_entity_id !== undefined ? { incoming_responsible_entity_id: input.incoming_responsible_entity_id } : {}),
      ...(input.workspace_id !== undefined ? { workspace_id: input.workspace_id } : {}),
      ...(input.conversation_id !== undefined ? { conversation_id: input.conversation_id } : {}),
      ...(input.summary !== undefined ? { summary: input.summary } : {}),
      ...(input.details !== undefined ? { details: input.details } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.origin_key !== undefined ? { origin_key: input.origin_key } : {}),
      ...(input.due_at !== undefined ? { due_at: input.due_at } : {}),
    };
    const res = await createOrGetHandoff(scope, createInput, { actor_entity_id: entity_id });
    if (res.kind === "invalid_content") { this.hoffLog("invalid_input", scope, { reason: res.reason }, "warn"); return { ok: false, code: "OTZAR_HANDOFF_INVALID_INPUT", message: "The handoff input was rejected." }; }
    if (res.kind === "invalid_reference") { this.hoffLog("invalid_reference", scope, { reason: res.reason }, "warn"); return { ok: false, code: "OTZAR_HANDOFF_INVALID_REFERENCE", message: "A linked reference is invalid or not available to you." }; }
    if (res.kind === "audit_consistency_failure") { this.hoffLog("audit_uncommitted", scope, {}, "warn"); return { ok: false, code: "OTZAR_HANDOFF_AUDIT_UNCOMMITTED", message: "The handoff could not be recorded and was rolled back. Please retry." }; }
    if (res.created) this.hoffLog("created", scope, { handoff_id: res.handoff.handoff_id });
    return { ok: true, handoff: res.handoff, created: res.created };
  }

  async listHandoffs(input: { token: string; states?: HandoffState[]; role?: "outgoing" | "incoming"; limit?: number }): Promise<{ ok: true; handoffs: SafeHandoff[] } | OtzarFailure> {
    const resolved = await this.handoffScope(input.token);
    if ("ok" in resolved) return resolved.code === "OTZAR_HANDOFF_NOT_FOUND" ? { ok: true, handoffs: [] } : resolved;
    const handoffs = await listHandoffs(resolved.scope, {
      ...(input.states !== undefined ? { states: input.states } : {}),
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.limit !== undefined ? { limit: input.limit } : {}),
    });
    return { ok: true, handoffs };
  }

  async getHandoff(input: { token: string; handoff_id: string }): Promise<{ ok: true; handoff: SafeHandoff; obligations: Array<{ obligation_id: string; disposition: string }> } | OtzarFailure> {
    const resolved = await this.handoffScope(input.token);
    if ("ok" in resolved) return resolved;
    const handoff = await getHandoffForScope(resolved.scope, input.handoff_id);
    if (handoff === null) return { ok: false, code: "OTZAR_HANDOFF_NOT_FOUND", message: "This handoff is not available to you." };
    const obligations = (await listHandoffObligations(resolved.scope, input.handoff_id)) ?? [];
    return { ok: true, handoff, obligations: obligations.map((o) => ({ obligation_id: o.obligation_id, disposition: o.disposition })) };
  }

  /** Link one of the caller's own obligations to a DRAFTED/READY handoff (outgoing party). */
  async linkHandoffObligation(input: { token: string; handoff_id: string; obligation_id: string }): Promise<{ ok: true } | OtzarFailure> {
    const resolved = await this.handoffScope(input.token);
    if ("ok" in resolved) return resolved;
    const res = await linkObligationToHandoff(resolved.scope, input.handoff_id, input.obligation_id);
    if ("kind" in res && res.kind === "linked") { this.hoffLog("obligation_linked", resolved.scope, { handoff_id: input.handoff_id }); return { ok: true }; }
    return this.mapHandoffFailure(res as Exclude<HandoffOutcome, { kind: "ok" }>);
  }

  /** Set the receiver's disposition for a linked obligation (incoming party). REASSIGNED requires
   *  new_responsible_entity_id and actually reassigns the underlying obligation. */
  async disposeHandoffObligation(input: { token: string; handoff_id: string; obligation_id: string; disposition: Exclude<HandoffDisposition, "PENDING">; new_responsible_entity_id?: string }): Promise<{ ok: true } | OtzarFailure> {
    const resolved = await this.handoffScope(input.token);
    if ("ok" in resolved) return resolved;
    const res = await disposeHandoffObligation(resolved.scope, input.handoff_id, input.obligation_id, input.disposition, input.new_responsible_entity_id !== undefined ? { new_responsible_entity_id: input.new_responsible_entity_id } : {});
    if ("kind" in res && res.kind === "disposed") { this.hoffLog("obligation_disposed", resolved.scope, { handoff_id: input.handoff_id, disposition: input.disposition }); return { ok: true }; }
    return this.mapHandoffFailure(res as Exclude<HandoffOutcome, { kind: "ok" }>);
  }

  /** A handoff lifecycle transition (ready / send / receive / acknowledge / request_clarification /
   *  escalate / complete). Party authority + atomic audit are enforced in the query layer. */
  async transitionHandoff(input: {
    token: string; handoff_id: string; expected_version: number;
    transition: "ready" | "send" | "receive" | "acknowledge" | "request_clarification" | "escalate" | "complete";
    incoming_responsible_entity_id?: string; acknowledged_turn_id?: string; escalation_id?: string;
  }): Promise<{ ok: true; handoff: SafeHandoff } | OtzarFailure> {
    const resolved = await this.handoffScope(input.token);
    if ("ok" in resolved) return resolved;
    const a = { handoff_id: input.handoff_id, expected_version: input.expected_version };
    let outcome: HandoffOutcome;
    switch (input.transition) {
      case "ready": outcome = await readyHandoff(resolved.scope, a); break;
      case "send": outcome = await sendHandoff(resolved.scope, { ...a, ...(input.incoming_responsible_entity_id !== undefined ? { incoming_responsible_entity_id: input.incoming_responsible_entity_id } : {}) }); break;
      case "receive": outcome = await receiveHandoff(resolved.scope, a); break;
      case "acknowledge":
        if (input.acknowledged_turn_id === undefined) return { ok: false, code: "OTZAR_HANDOFF_INVALID_INPUT", message: "acknowledged_turn_id is required" };
        outcome = await acknowledgeHandoff(resolved.scope, { ...a, acknowledged_turn_id: input.acknowledged_turn_id }); break;
      case "request_clarification": outcome = await requestClarificationHandoff(resolved.scope, a); break;
      case "escalate": outcome = await escalateHandoff(resolved.scope, { ...a, ...(input.escalation_id !== undefined ? { escalation_id: input.escalation_id } : {}) }); break;
      case "complete": outcome = await completeHandoff(resolved.scope, a); break;
    }
    if (outcome.kind !== "ok") { this.hoffLog(input.transition + "_failed", resolved.scope, { handoff_id: input.handoff_id, reason: outcome.kind }, "warn"); return this.mapHandoffFailure(outcome); }
    this.hoffLog(input.transition, resolved.scope, { handoff_id: input.handoff_id });
    return { ok: true, handoff: outcome.handoff };
  }

  async supersedeHandoff(input: { token: string; handoff_id: string; expected_version: number; replacement: { title: string; incoming_responsible_entity_id?: string; workspace_id?: string; conversation_id?: string; summary?: string; details?: Record<string, unknown>; priority?: string } }): Promise<{ ok: true; handoff: SafeHandoff; replacement: SafeHandoff } | OtzarFailure> {
    const resolved = await this.handoffScope(input.token);
    if ("ok" in resolved) return resolved;
    const replacement: CreateHandoffInput = {
      title: input.replacement.title, outgoing_responsible_entity_id: resolved.entity_id, creator_entity_id: resolved.entity_id,
      ...(input.replacement.incoming_responsible_entity_id !== undefined ? { incoming_responsible_entity_id: input.replacement.incoming_responsible_entity_id } : {}),
      ...(input.replacement.workspace_id !== undefined ? { workspace_id: input.replacement.workspace_id } : {}),
      ...(input.replacement.conversation_id !== undefined ? { conversation_id: input.replacement.conversation_id } : {}),
      ...(input.replacement.summary !== undefined ? { summary: input.replacement.summary } : {}),
      ...(input.replacement.details !== undefined ? { details: input.replacement.details } : {}),
      ...(input.replacement.priority !== undefined ? { priority: input.replacement.priority } : {}),
    };
    const { outcome, replacement: repl } = await supersedeHandoff(resolved.scope, { handoff_id: input.handoff_id, expected_version: input.expected_version, replacement });
    if (outcome.kind !== "ok" || repl === undefined) {
      if (outcome.kind !== "ok") this.hoffLog("supersede_failed", resolved.scope, { handoff_id: input.handoff_id, reason: outcome.kind }, "warn");
      return outcome.kind === "ok" ? { ok: false, code: "OTZAR_HANDOFF_STATE_CHANGED", message: "Supersession did not complete." } : this.mapHandoffFailure(outcome);
    }
    this.hoffLog("superseded", resolved.scope, { handoff_id: input.handoff_id, replacement_handoff_id: repl.handoff_id });
    return { ok: true, handoff: outcome.handoff, replacement: repl };
  }

  // ──────────────────────────────────────────────────────────────
  // [OTZAR STAGE-2 TRUTH-EVIDENCE] Read the point-in-time evidence snapshots a governed record's
  // decisions relied upon. Access is gated THROUGH the parent record (obligation/handoff), and
  // each snapshot additionally reports current_source_status (captured vs now) WITHOUT mutating
  // the immutable captured basis.

  /** Evidence snapshots for one of the caller's obligations (safe projection + live source status). */
  async getObligationEvidence(input: { token: string; obligation_id: string }): Promise<{ ok: true; evidence: Array<SafeEvidenceSnapshot & { current_source_status: string }> } | OtzarFailure> {
    const resolved = await this.obligationScope(input.token);
    if ("ok" in resolved) return resolved;
    const obligation = await getObligationForScope(resolved.scope, input.obligation_id);
    if (obligation === null) return { ok: false, code: "OTZAR_OBLIGATION_NOT_FOUND", message: "This obligation is not available to you." };
    const snapshots = await listSnapshotsForObligation(resolved.scope.org_entity_id, input.obligation_id);
    const evidence = await Promise.all(snapshots.map(async (s) => ({ ...s, current_source_status: await resolveCurrentSourceStatus(resolved.scope.org_entity_id, s) })));
    return { ok: true, evidence };
  }

  /** Evidence snapshots for a handoff the caller is a party to. The receiver can see that evidence
   *  changed after acknowledgement (current_source_status). */
  async getHandoffEvidence(input: { token: string; handoff_id: string }): Promise<{ ok: true; evidence: Array<SafeEvidenceSnapshot & { current_source_status: string }> } | OtzarFailure> {
    const resolved = await this.handoffScope(input.token);
    if ("ok" in resolved) return resolved;
    const handoff = await getHandoffForScope(resolved.scope, input.handoff_id);
    if (handoff === null) return { ok: false, code: "OTZAR_HANDOFF_NOT_FOUND", message: "This handoff is not available to you." };
    const snapshots = await listSnapshotsForHandoff(resolved.scope.org_entity_id, input.handoff_id);
    const evidence = await Promise.all(snapshots.map(async (s) => ({ ...s, current_source_status: await resolveCurrentSourceStatus(resolved.scope.org_entity_id, s) })));
    return { ok: true, evidence };
  }

  // ──────────────────────────────────────────────────────────────
  // getConversationDetail -- safe, self-scoped conversation look-back.
  //
  // WHAT: Return one of the caller's OWN conversations as a safe detail
  //        view (metadata + close summary + topics).
  // INPUT: GetConversationDetailInput { token, conversation_id }.
  // OUTPUT: ConversationDetailSuccess (200) or OtzarFailure
  //         (SESSION_* / CONVERSATION_NOT_FOUND / NOT_CONVERSATION_OWNER).
  // WHY: ADR-0054 Wave 2B. Self-scoped (entity_id === caller; no admin
  //      gate, no cross-tenant). The summary is resolved ONLY via the
  //      explicit summary_capsule_id link (no storage_location parsing),
  //      and only the capsule's payload_summary + topic_tags are read --
  //      NEVER content / storage_location / vectors. transparency /
  //      corrections / per-conversation continuity are NOT fabricated
  //      (ADR-0051 transparency is response-only and not persisted). No
  //      transcripts. Read-only projection -- no new audit literal.
  // ──────────────────────────────────────────────────────────────
  async getConversationDetail(
    input: GetConversationDetailInput,
  ): Promise<ConversationDetailSuccess | OtzarFailure> {
    const session = await this.authService.validateSession(input.token, "read");
    if (!session.valid) {
      return {
        ok: false,
        code: session.code,
        message: "Conversation detail denied",
      };
    }
    const ownerEntityId = session.entity_id;

    const conv = await prisma.otzarConversation.findUnique({
      where: { conversation_id: input.conversation_id },
      select: {
        conversation_id: true,
        entity_id: true,
        twin_id: true,
        source_type: true,
        status: true,
        started_at: true,
        closed_at: true,
        message_count: true,
        summary_capsule_id: true,
      },
    });
    if (conv === null) {
      return {
        ok: false,
        code: "CONVERSATION_NOT_FOUND",
        message: "Conversation not found",
      };
    }
    // Self-scope: caller may read only their OWN conversation.
    if (conv.entity_id !== ownerEntityId) {
      return {
        ok: false,
        code: "NOT_CONVERSATION_OWNER",
        message: "Caller does not own this conversation",
      };
    }

    // Resolve the summary capsule ONLY by the explicit summary_capsule_id
    // link (ADR-0054; no storage_location parsing). Safe projection only --
    // never selects content / storage_location / content_hash / vectors.
    let summaryCapsule: { payload_summary: string; topic_tags: string[] } | null =
      null;
    if (conv.summary_capsule_id !== null) {
      const cap = await prisma.memoryCapsule.findFirst({
        where: { capsule_id: conv.summary_capsule_id, deleted_at: null },
        select: { payload_summary: true, topic_tags: true },
      });
      if (cap !== null) {
        summaryCapsule = {
          payload_summary: cap.payload_summary,
          topic_tags: cap.topic_tags,
        };
      }
    }

    const conversation = projectConversationDetail({
      conversation: {
        conversation_id: conv.conversation_id,
        twin_id: conv.twin_id,
        source_type: conv.source_type,
        status: conv.status,
        started_at: conv.started_at,
        closed_at: conv.closed_at,
        message_count: conv.message_count,
        summary_capsule_id: conv.summary_capsule_id,
      },
      summaryCapsule,
    });

    return { ok: true, conversation };
  }

  // ──────────────────────────────────────────────────────────────
  // getConversationCorrections -- safe, self-scoped per-conversation
  // correction-signal projection (ADR-0055 Wave 2C).
  //
  // WHAT: Return the caller's OWN per-conversation correction signal
  //        count + last-seen freshness + anti-overclaim notes.
  // INPUT: GetConversationCorrectionsInput { token, conversation_id }.
  // OUTPUT: ConversationCorrectionsSuccess (200) or OtzarFailure
  //         (SESSION_* / CONVERSATION_NOT_FOUND / NOT_CONVERSATION_OWNER /
  //         OPERATION_NOT_PERMITTED).
  // WHY: ADR-0055 closes ADR-0054's deferred conversation→correction
  //      linkage non-goal. Self-scoped (entity_id === caller; no admin
  //      gate, no cross-tenant). Counts only CORRECTION capsules in the
  //      caller's own wallet linked to this conversation. NEVER selects
  //      payload_summary / payload_content / target_capsule_id /
  //      storage_location / content_hash / vectors. ConversationDetailView
  //      is unchanged. Submitted/available — NOT learned/applied. Read-
  //      only projection — no new audit literal.
  // ──────────────────────────────────────────────────────────────
  async getConversationCorrections(
    input: GetConversationCorrectionsInput,
  ): Promise<ConversationCorrectionsSuccess | OtzarFailure> {
    const session = await this.authService.validateSession(input.token, "read");
    if (!session.valid) {
      return {
        ok: false,
        code: session.code,
        message: "Conversation corrections denied",
      };
    }
    const ownerEntityId = session.entity_id;

    // Conversation existence + self-scope BEFORE the count query so we
    // never disclose another caller's correction footprint via the count.
    const conv = await prisma.otzarConversation.findUnique({
      where: { conversation_id: input.conversation_id },
      select: { conversation_id: true, entity_id: true },
    });
    if (conv === null) {
      return {
        ok: false,
        code: "CONVERSATION_NOT_FOUND",
        message: "Conversation not found",
      };
    }
    if (conv.entity_id !== ownerEntityId) {
      return {
        ok: false,
        code: "NOT_CONVERSATION_OWNER",
        message: "Caller does not own this conversation",
      };
    }

    // Resolve the caller's wallet so the count is wallet-bound (per
    // ADR-0055 §Decision 5 + §Patent-Implementation Evidence — scoped
    // wallet-bound continuity signal).
    const wallet = await prisma.wallet.findUnique({
      where: { entity_id: ownerEntityId },
      select: { wallet_id: true },
    });
    if (wallet === null) {
      // Caller authenticated but has no wallet — same shape as a
      // zero-state response (no corrections possible). Honest absence.
      const view = projectConversationCorrections({
        conversation_id: conv.conversation_id,
        corrections_count: 0,
        last_correction_at: null,
      });
      return { ok: true, ...view };
    }

    // ADR-0055 §Decision 5: real Prisma count of CORRECTION capsules in
    // the caller's wallet linked to this conversation; deleted_at IS NULL
    // (RULE 10 soft-delete-aware). The composite
    // @@index([wallet_id, capsule_type, conversation_id]) added at the
    // schema phase supports this query.
    const corrections_count = await prisma.memoryCapsule.count({
      where: {
        wallet_id: wallet.wallet_id,
        capsule_type: "CORRECTION",
        conversation_id: conv.conversation_id,
        deleted_at: null,
      },
    });
    // last_correction_at: created_at of the most-recent linked
    // CORRECTION capsule, or null when count is 0. SAFE projection —
    // select only created_at; never payload_summary / target_capsule_id /
    // storage_location / content_hash.
    let last_correction_at: Date | null = null;
    if (corrections_count > 0) {
      const latest = await prisma.memoryCapsule.findFirst({
        where: {
          wallet_id: wallet.wallet_id,
          capsule_type: "CORRECTION",
          conversation_id: conv.conversation_id,
          deleted_at: null,
        },
        select: { created_at: true },
        orderBy: { created_at: "desc" },
      });
      last_correction_at = latest?.created_at ?? null;
    }

    const view = projectConversationCorrections({
      conversation_id: conv.conversation_id,
      corrections_count,
      last_correction_at,
    });
    return { ok: true, ...view };
  }

  // ──────────────────────────────────────────────────────────────
  // Section 1 Wave 3B — Otzar drift detection coaching/alignment
  // trust loop per ADR-0058.
  //
  // WHAT: Return the caller's OWN per-conversation drift signals.
  // INPUT: GetConversationDriftSignalsInput { token, conversation_id }.
  // OUTPUT: ConversationDriftSignalsSuccess (200) or OtzarFailure
  //         (SESSION_* / CONVERSATION_NOT_FOUND / NOT_CONVERSATION_OWNER).
  // WHY: ADR-0058 §"Implementation detail" — OtzarService surfaces
  //      the analyzeConversationDrift seam alongside the Wave 2C
  //      getConversationCorrections sibling. Pure delegation to the
  //      analyzeConversationDrift helper which owns the indexed
  //      query + closed-vocabulary signal evaluation + safe
  //      projection + watching-the-watchers audit emission.
  //      Self-scoped (entity_id === caller; no admin gate, no
  //      cross-tenant). NEVER selects payload_summary, target_capsule_id,
  //      capsule IDs list, topic tag values, transcripts, numeric
  //      scores, or per-employee comparison fields. NO new audit
  //      literal (rides ADMIN_ACTION + details.action = DRIFT_SIGNAL_READ
  //      per Section 7 + Section 4 Wave 2/4/5/7 precedent).
  // ──────────────────────────────────────────────────────────────
  async analyzeConversationDrift(
    input: GetConversationDriftSignalsInput,
  ): Promise<ConversationDriftSignalsSuccess | OtzarFailure> {
    return analyzeConversationDrift({
      authService: this.authService,
      input,
    });
  }

  // ──────────────────────────────────────────────────────────────
  // Section 1 Wave 4A: stale-context drift signal per ADR-0058 §9 +
  //                    ADR-0045 G5.1 + Founder Wave 4A direction.
  //                    Self-scoped wallet-level signal; closed-vocab
  //                    label set (FRESH_CONTEXT / STALE_CONTEXT_RISK /
  //                    INSUFFICIENT_DATA); reuses existing
  //                    ADMIN_ACTION:DRIFT_SIGNAL_READ audit with
  //                    source_signal: "STALE_CONTEXT_WALLET"
  //                    discriminator (NO new audit literal). NEVER
  //                    raw capsule content, content_hash values,
  //                    embedding_content_hash values, capsule IDs,
  //                    or per-capsule attribution.
  // ──────────────────────────────────────────────────────────────
  async analyzeStaleContextForCaller(
    input: GetStaleContextSignalInput,
  ): Promise<StaleContextSignalSuccess | StaleContextSignalFailure> {
    return analyzeStaleContextForCaller({
      authService: this.authService,
      input,
    });
  }

  // ──────────────────────────────────────────────────────────────
  // Section 1 Wave 4C: cross-conversation drift rollup per
  //                    ADR-0058 §9 + Founder Wave 4C direction.
  //                    Self-scoped per-caller holistic posture
  //                    label (AT_RISK / NORMAL / INSUFFICIENT_DATA)
  //                    that folds in Wave 3 per-conversation
  //                    correction-velocity signal + Wave 4A
  //                    wallet-level stale-context signal. Reuses
  //                    ADMIN_ACTION + DRIFT_SIGNAL_READ literal
  //                    with source_signal:
  //                    "CROSS_CONVERSATION_ROLLUP" discriminator
  //                    (NO new audit literal). NEVER conversation
  //                    IDs / capsule IDs / per-conversation
  //                    attribution / transcripts / raw content.
  // ──────────────────────────────────────────────────────────────
  async analyzeDriftRollupForCaller(
    input: GetDriftRollupInput,
  ): Promise<DriftRollupSuccess | DriftRollupFailure> {
    return analyzeDriftRollupForCaller({
      authService: this.authService,
      input,
    });
  }

  // WHAT: Extract conversation topics via the LLM, with robust
  //        fallbacks.
  // INPUT: Optional history string array.
  // OUTPUT: An array of topic strings; ["conversation_summary"]
  //         on any failure / malformed response.
  // WHY: Auto-close path passes no history -- we shortcut to the
  //      fallback. For the user-driven close path, the LLM might
  //      return malformed shapes; we never throw, just fall back.
  private async extractTopics(history?: string[]): Promise<string[]> {
    const FALLBACK = ["conversation_summary"];
    if (!Array.isArray(history) || history.length === 0) {
      return FALLBACK;
    }
    try {
      const result = await this.llmProvider.generateResponse({
        system:
          "Extract the top 3 topics from this conversation. Respond with exactly: 'topics: a, b, c'.",
        user: history.join("\n"),
      });
      if (!result.ok) return FALLBACK;
      const text = result.text ?? "";
      const match = text.match(/topics:\s*(.+)/i);
      if (match === null) return FALLBACK;
      const items = match[1]!
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      return items.length > 0 ? items : FALLBACK;
    } catch {
      return FALLBACK;
    }
  }

  // ──────────────────────────────────────────────────────────────
  // runAutoCloseSweep -- iterate ACTIVE conversations, close any
  // whose last_active is missing or > 30 minutes old. Defensive
  // per-row try/catch so one bad row doesn't tank the sweep.
  //
  // FAILURE OBSERVABILITY: per-row failures land in console.warn for
  // 11B. Section 14 may wire structured audit events here when admin
  // tooling is on top of this metric stream.
  // ──────────────────────────────────────────────────────────────
  async runAutoCloseSweep(): Promise<{ closed: number; skipped: number }> {
    const active = await prisma.otzarConversation.findMany({
      where: { status: "ACTIVE" },
      select: {
        conversation_id: true,
        entity_id: true,
      },
    });
    const now = Date.now();
    let closed = 0;
    let skipped = 0;
    for (const conv of active) {
      try {
        const lastActiveStr = await this.cache.get(
          `otzar:conv:${conv.conversation_id}:last_active`,
        );
        const lastActive =
          lastActiveStr === null ? null : Number.parseInt(lastActiveStr, 10);
        const stale =
          lastActive === null ||
          !Number.isFinite(lastActive) ||
          now - lastActive > AUTO_CLOSE_STALE_THRESHOLD_MS;
        if (!stale) {
          skipped++;
          continue;
        }
        // Degraded close: no token (cron context), no history.
        // Manually do what closeConversation does WITHOUT session
        // validation, since cron has no JWT to validate.
        await this.degradedClose(conv.conversation_id, conv.entity_id);
        closed++;
      } catch (err) {
        logger.warn(
          { err, conversation_id: conv.conversation_id },
          "[otzar.autoClose] failed to close conversation",
        );
      }
    }
    return { closed, skipped };
  }

  // WHAT: Degraded close path used by auto-close cron. No session
  //        validation, no LLM topic extraction, no recordOutcome
  //        (cron has no token).
  // INPUT: conversation_id, owner entity_id.
  // OUTPUT: A promise resolving once the row is flipped + capsule
  //         written.
  // WHY: Auto-close runs without a request context. We still
  //      preserve PORTABILITY (capsule lands in employee wallet)
  //      and the status transition; only the LLM topic extraction
  //      and recordOutcome are skipped (those are user-context
  //      operations).
  private async degradedClose(
    conversationId: string,
    ownerEntityId: string,
  ): Promise<void> {
    const ownerWallet = await prisma.wallet.findUnique({
      where: { entity_id: ownerEntityId },
      select: { wallet_id: true },
    });
    if (ownerWallet === null) return;
    const newCapsuleId = randomUUID();
    const summary = `Conversation ${conversationId} auto-closed (idle > 30 min)`;
    await prisma.memoryCapsule.create({
      data: {
        capsule_id: newCapsuleId,
        wallet_id: ownerWallet.wallet_id,
        entity_id: ownerEntityId,
        version: 1,
        capsule_type: "CONVERSATION_LEARNING",
        topic_tags: ["auto_closed"],
        decay_type: "TIME_BASED",
        payload_summary: summary,
        payload_size_tokens: Math.ceil(summary.length / 4),
        tokens: 0,
        tokens_tokenizer: "anthropic",
        storage_location: `niov://otzar/conv/${conversationId}/${newCapsuleId}`,
        content_hash: `sha256:auto-${newCapsuleId}`,
        created_by: ownerEntityId,
      },
    });
    await prisma.otzarConversation.update({
      where: { conversation_id: conversationId },
      // ADR-0054 Wave 2B: link the conversation to the
      // CONVERSATION_LEARNING summary capsule written above (additive;
      // the canonical conversation->summary link for look-back detail).
      data: {
        status: "CLOSED",
        closed_at: new Date(),
        summary_capsule_id: newCapsuleId,
      },
    });
    await this.cache.delete(`otzar:conv:${conversationId}:last_active`);
    await this.cache.delete(`otzar:prime:${ownerEntityId}`);
  }
}
