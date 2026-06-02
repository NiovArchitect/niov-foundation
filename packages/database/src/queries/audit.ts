// FILE: queries/audit.ts
// PURPOSE: The compliance-grade, tamper-evident audit-of-record API.
//          Future services (auth, sessions, hive, monetization) call
//          writeAuditEvent here. Existing 1A-1D code keeps using the
//          lower-level AuditLog table -- they record different kinds
//          of facts.
// CONNECTS TO: The audit_events table in schema.prisma, the Postgres
//              BEFORE UPDATE OR DELETE trigger that enforces append-only
//              behavior, and the SHA-256 hash chain that lets anyone
//              verify the chain has not been tampered with.

import { createHash, randomUUID } from "node:crypto";
import { CRYPTO_CONFIG } from "@niov/auth";
import type { AuditEvent, AuditOutcome, Prisma } from "@prisma/client";
import { prisma } from "../client.js";

// WHAT: The canonical list of recognized event_type strings. The column
//        is plain text so future sections can extend, but this union
//        documents what the system knows today.
// INPUT: Used as a parameter type only.
// OUTPUT: None -- this is a type, not a value.
// WHY: TypeScript callers get autocomplete and a typo-catch; the DB
//      stays flexible for future event types we have not invented yet.
export type AuditEventType =
  | "ENTITY_REGISTERED"
  | "ENTITY_SUSPENDED"
  | "ENTITY_REACTIVATED"
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILED"
  | "LOGOUT"
  | "SESSION_CREATED"
  | "SESSION_EXPIRED"
  | "SESSION_REVOKED"
  | "CAPSULE_CREATED"
  | "CAPSULE_METADATA_READ"
  | "CAPSULE_CONTENT_READ"
  | "CAPSULE_UPDATED"
  | "CAPSULE_DELETED"
  // D-2D-D10-6: correction propagation chain audit event per RAA 12.8
  // §5.2. Fires when propagateCorrection (feedback.service.ts) snaps
  // the correction capsule + (if present) the corrected target capsule
  // relevance_score to RELEVANCE_MAX. Unlike FEEDBACK_LOOP_* below this
  // is a human-actor event (actor_entity_id = the entity submitting the
  // correction), not a SYSTEM-PRINCIPAL one.
  | "CORRECTION_PROPAGATED"
  | "PERMISSION_CREATED"
  | "PERMISSION_REVOKED"
  | "PERMISSION_EXPIRED"
  | "DATA_MONETIZED"
  | "HIVE_CREATED"
  | "HIVE_MEMBER_ADDED"
  | "HIVE_MEMBER_REMOVED"
  | "HIVE_INTELLIGENCE_READ"
  | "HIVE_AGGREGATE_BUILT"
  | "COMPLIANCE_CHECK_PASSED"
  | "COMPLIANCE_CHECK_FAILED"
  | "ANOMALY_DETECTED"
  | "RATE_LIMITED"
  | "ADMIN_ACTION"
  | "NEGOTIATE"
  // Section 11D: Otzar conversation lifecycle events. Emitted by
  // OtzarService.conductSession (on new-conversation creation
  // only; not on continuation) and OtzarService.closeConversation.
  // Hash-chained per Section 1E like every other audit event.
  | "CONVERSATION_STARTED"
  | "CONVERSATION_CLOSED"
  // 12C.0 Item 7: Foundation feedback-loop scheduler operational
  // events. Emitted by apps/api/src/services/feedback/scheduler.ts
  // wrapping each cron task in try/catch with timing. Both literals
  // are SYSTEM-PRINCIPAL events (system_principal:
  // SYSTEM_PRINCIPALS.SCHEDULER), not human ADMIN_ACTION events --
  // they sit alongside HIVE_AGGREGATE_BUILT in the operational
  // event class.
  | "FEEDBACK_LOOP_EXECUTED"
  | "FEEDBACK_LOOP_FAILED"
  // CAR Sub-box 3 sub-phase 5 [SUB-BOX-3-ROUTES] per ADR-0036
  // Sub-decision 4 hybrid-binding event_type literals. Emitted by
  // apps/api/src/routes/regulator.routes.ts when a tenant admin
  // grants or revokes regulator access (dual-control gated per
  // ADR-0036 Sub-decision 6 + ADR-0026). Each row carries
  // lawful_basis_id + lawful_basis_chain_hash at canonical_record/1
  // positions 13 + 14 per sub-phase 4 [SUB-BOX-3-AUDIT-CHAIN]
  // extension, so tampering with the LawfulBasis content invalidates
  // the AuditEvent event_hash and breaks chain verification per the
  // patent-implementation evidence binding (CAR §2.2 Family 1).
  // REGULATOR_ACCESS_EXPIRED is reserved at sub-phase 5 but NOT
  // emitted -- expiration handling is forward-queued to sub-phase 6
  // enforcement / scheduler tier per Q3 LOCKED Option α (would use
  // existing SYSTEM_PRINCIPALS.SCHEDULER per Q7 LOCKED Option α).
  | "REGULATOR_ACCESS_GRANTED"
  | "REGULATOR_ACCESS_REVOKED"
  | "REGULATOR_ACCESS_EXPIRED"
  // Phase 3 Sub-arc 2 Gap 1 [CAPSULE-MUTATION-PRISMA-MIGRATION] per
  // ADR-0042 Sub-decision Q-γ. 4 NEW append-only literals extending
  // the 36-literal set to 40 per RULE 10. Emission is forward-substrate
  // to G1.3 [CAPSULE-MUTATION-WRITE-SERVICE] at write.service.ts
  // discriminateMutation boundary; G1.2 lands the literal substrate
  // only. Each literal carries mutation-class semantic weight at the
  // audit register per ADR-0042 Decision.
  | "CAPSULE_MUTATION_ADD"
  | "CAPSULE_MUTATION_UPDATE"
  | "CAPSULE_MUTATION_MERGE"
  | "CAPSULE_MUTATION_NOOP"
  // Phase 3 Sub-arc 2 Gap 3 [CAPSULE-EMBEDDING-RETRIEVAL] per ADR-0043
  // §Sub-decision 7 (Q-G3-η) + Q-G3.6-δ + Q-γ.1 clean-transition:
  // 1 NEW append-only literal for similarity retrieval emitted by
  // SimilarityService.emitSimilarityAudit. Audit details schema is
  // outcome-only (query_length / topK / minSimilarity / result_count
  // / filters_applied / embedding_generated +
  // embedding_failure_class / embedding_failure_message in degraded
  // path). NEVER raw query text, query keywords, query vectors, or
  // per-result distance distribution per RULE 0 + Q-G3-ζ.
  | "CAPSULE_SIMILARITY_SEARCH"
  // Phase 3 Sub-Arc 3 personalization audit literals per ADR-0048
  // §Audit-Literal Proposals (Q-PERS-θ θ-2). AUDIT.1 clean-transition
  // (`[PERSONALIZATION-AUDIT-LITERAL-CLEAN-TRANSITION]`) DEFINES these 5
  // append-only literals only — there is NO emitter in AUDIT.1. Emission
  // is forward-substrate (AUDIT.2): WORKING_SET_BUILT + PERSONALIZATION_DEGRADED
  // emit from the working-set orchestrator and land with working-set API
  // exposure (arc 2); CONTEXT_USED_MANIFEST_RECORDED + CROSS_ENTITY_CONTEXT_REQUESTED
  // + PERSONALIZATION_SIGNAL_RECORDED land with their future production flows
  // (context-used manifest / cross-entity request / personalization-signal
  // recording — all greenfield per ADR-0048 §missing). Append-only per
  // ADR-0042 §Q-γ.1 (no removal/reorder of existing literals).
  //
  // SAFE audit metadata when emission lands (AUDIT.2): counts only +
  // outcome classes + domain classes ("personal"/"enterprise") + DegradedReason
  // class names + source/provenance classes. FORBIDDEN (RULE 0): no raw capsule
  // content, no raw memory text, no raw vectors, no embeddings, no distance/cosine
  // values, no raw query/request text (unless an existing audit policy explicitly
  // allows it), no private capsule content, no cross-wallet content leakage, no
  // precise sensitive location data, no consumer-facing diagnostic leakage —
  // preserve the consumer/admin view split + the single-wallet spine.
  | "WORKING_SET_BUILT"
  | "CONTEXT_USED_MANIFEST_RECORDED"
  | "PERSONALIZATION_DEGRADED"
  | "CROSS_ENTITY_CONTEXT_REQUESTED"
  | "PERSONALIZATION_SIGNAL_RECORDED"
  // GOVSEC.5 break-glass / time-boxed audit (GAP-K1) per ADR-0050, BG.1
  // substrate. 4 NEW append-only literals for the emergency-grant lifecycle,
  // emitted by apps/api/src/services/governance/break-glass.service.ts:
  // INVOKED (grant created) / USED (grant consumed for a privileged action) /
  // EXPIRED (grant time-box elapsed) / REVIEWED (mandatory post-hoc two-person
  // review; reviewer != source). BG.1 is substrate-only -- no middleware/route
  // wiring -- so BREAK_GLASS_USED is emitted only by the service substrate
  // (markBreakGlassUsed), NOT from dual-control.middleware.ts (deferred to BG.2).
  // Append-only per ADR-0042 §Q-γ.1; additive literals require no ADR-0002
  // amendment (ADR-0002 governs the chain mechanism + BEFORE-DELETE trigger).
  // SAFE audit metadata: grant_id + action_type (scope) + status + reviewer/
  // source ids + timestamps; FORBIDDEN (RULE 0): no raw justification leakage
  // beyond what the grant record already holds, no private content.
  | "BREAK_GLASS_INVOKED"
  | "BREAK_GLASS_USED"
  | "BREAK_GLASS_EXPIRED"
  | "BREAK_GLASS_REVIEWED"
  // ADR-0057 §10 Autonomous Execution Core (Section 2). 10 NEW append-only
  // literals for the Action lifecycle, mirroring the CAPSULE_MUTATION_* (4) +
  // BREAK_GLASS_* (4) extension precedent. No ADR-0002 amendment needed
  // (ADR-0002 governs the chain mechanism + BEFORE-DELETE trigger; additive
  // literals are append-only per ADR-0042 §Q-γ.1 clean-transition discipline).
  //
  // This slice DEFINES the literals only; emission is forward-substrate per
  // ADR-0057 §16 step 4-7 (action.service.ts + executor + scheduler land in
  // later QLOCKs). Per-event emitter mapping per ADR-0057 §10:
  //   ACTION_PROPOSED       - POST /api/v1/actions create-time (or _APPROVED
  //                           if AUTO_APPROVE decision short-circuits)
  //   ACTION_APPROVED       - EscalationRequest PENDING -> APPROVED transition
  //                           per ADR-0057 §5 + the AUTO_APPROVE short-circuit
  //   ACTION_REJECTED       - policy evaluator FORBIDDEN / POLICY_UNRESOLVED /
  //                           EscalationRequest REJECTED / NO_ELIGIBLE_TARGET
  //   ACTION_SCHEDULED      - scheduler moves APPROVED -> SCHEDULED
  //   ACTION_STARTED        - worker picks SCHEDULED row and begins attempt
  //   ACTION_SUCCEEDED      - terminal attempt outcome SUCCEEDED
  //   ACTION_FAILED         - terminal attempt outcome FAILED / TIMED_OUT
  //                           (error_class is enum-literal-bound)
  //   ACTION_CANCELLED      - cancel route or worker-cancel transition
  //   ACTION_EXPIRED        - expires_at elapsed before pick-up
  //   ACTION_POLICY_UPDATE  - PUT /api/v1/org/action-policies admin event
  //                           (paired with the NEW PRIVILEGED_ENDPOINTS
  //                           ORG_ACTION_POLICY_UPDATE binding per ADR-0057 §7)
  //
  // SAFE audit-details allowlist per ADR-0057 §10 (the per-event details JSON
  // is constrained to this set; emission sites enforce by construction):
  //   action_id / action_type / risk_tier / decision / policy_envelope_hash
  //   (SHA-256 of canonicalized envelope; NEVER the envelope itself) /
  //   actor_entity_id (a.k.a. source_entity_id) / target_entity_id
  //   (only where structurally safe; never disclosed in a fail-closed envelope
  //   per Phase E Invariant 6) / escalation_id (when paired) / attempt_number
  //   (for _STARTED / _SUCCEEDED / _FAILED) / outcome (enum-bound
  //   ActionAttemptOutcome) / error_class (enum-literal-only:
  //   EXECUTOR_TIMEOUT / POLICY_DRIFT / ENVELOPE_INVALID / PERMISSION_DENIED /
  //   INTERNAL_ERROR; NEVER free-form text) / route + method (for
  //   ACTION_POLICY_UPDATE admin events) / grant_id (when the path is
  //   break-glass-delegated per ADR-0050 §Amendment 1 +
  //   DUAL_CONTROL_BREAK_GLASS_DELEGATED precedent).
  //
  // FORBIDDEN audit-details per ADR-0057 §10 (the no-leak guard at
  // tests/unit/no-leak-guard.test.ts already enforces these as object
  // property keys in routes + middleware + security + safe-projection mappers):
  //   raw payload_summary body text / full payload_redacted JSON / raw
  //   external API responses / raw HTTP headers / secrets / credentials /
  //   API keys / capsule content (payload_summary / payload_content /
  //   storage_location / content_hash) / embeddings / vectors /
  //   per-dimension stats / candidate-pool identities / candidate-pool size /
  //   full policy envelope JSON / raw error text / stack traces / break-glass
  //   justification text (grant_id only).
  | "ACTION_PROPOSED"
  | "ACTION_APPROVED"
  | "ACTION_REJECTED"
  | "ACTION_SCHEDULED"
  | "ACTION_STARTED"
  | "ACTION_SUCCEEDED"
  | "ACTION_FAILED"
  | "ACTION_CANCELLED"
  | "ACTION_EXPIRED"
  | "ACTION_POLICY_UPDATE"
  // VF.2 voice-first runtime per ADR-0085 §5 (VoiceIntentEnvelope)
  // + §8 (implementation sequence). 6 NEW append-only literals
  // (40 + previous extensions → 6 voice literals appended). Each
  // is emitted by the voice-intent envelope construction service
  // before delivery per RULE 4. Audit details schema (SAFE):
  // intent_id (UUID) + source_surface (1 of 13 enum values from
  // ADR-0085 §7) + intent_class (LOW / MEDIUM / HIGH) +
  // confirmation_state (enum) + approval_chain_state (enum) +
  // transcript_redacted (boolean) + transcript_redaction_reason
  // (closed-vocab) + retention_class. FORBIDDEN: transcript_text
  // (lives in the envelope row, not the audit details); raw
  // audio_ref; OAuth/API key; Bearer header; cross-tenant
  // identifiers; proposed_action body. Append-only per ADR-0042
  // §Q-γ.1 clean-transition discipline.
  | "VOICE_INTENT_RECEIVED"
  | "VOICE_INTENT_CONFIRMED"
  | "VOICE_INTENT_REJECTED"
  | "VOICE_INTENT_EXPIRED"
  | "VOICE_INTENT_REDACTED"
  | "VOICE_INTENT_DELIVERED"
  // W5 Action Promotion Runtime per ADR-0086 + ADR-0042 §Q-γ.1
  // clean-transition discipline. 1 NEW append-only literal. Emitted
  // by proposed-action-promotion.service.ts after the Section 2
  // Action runtime returns from createActionForCaller — links the
  // resulting action_id back to the W4 catalog `id`. Audit details
  // schema (SAFE): catalog_id (catalog string) + action_id (UUID) +
  // plan_archetype_id (team/business/enterprise) + actor_role
  // (closed-vocab) + intended_external_system (closed-vocab) +
  // dual_control_required + dual_control_satisfied +
  // approval_chain_required + policy_decision_required +
  // retention_class + section2_outcome (PROPOSED / APPROVED / REJECTED
  // / NO_ELIGIBLE_TARGET; mirrors the Section 2 return shape). FORBIDDEN:
  // raw payload content, values of safe_field_set, values of
  // forbidden_field_set, raw secret material, vendor token, raw
  // transcript, raw prompt, chain-of-thought, OAuth header,
  // recipient PII, capsule content. The audit envelope carries
  // metadata only. Append-only per ADR-0042 §Q-γ.1.
  | "PROPOSED_ACTION_REFERENCED";

// WHAT: Runtime-iterable list of every recognized AuditEventType.
// INPUT: None.
// OUTPUT: A readonly array of AuditEventType literals.
// WHY: 12C.0 (Item 3) GET /org/audit ?event_type= filter validation
//      needs to reject unknown literals at the route layer (422
//      INVALID_REQUEST). TypeScript's type-only union is unavailable
//      at runtime; this constant is the compile-time-checked source
//      of truth so routes can `Set<AuditEventType>` membership-test
//      without duplicating the literal list. Add new event types to
//      BOTH this array AND the union above; the `satisfies` clause
//      catches drift at typecheck time.
export const AUDIT_EVENT_TYPE_VALUES = [
  "ENTITY_REGISTERED",
  "ENTITY_SUSPENDED",
  "ENTITY_REACTIVATED",
  "LOGIN_SUCCESS",
  "LOGIN_FAILED",
  "LOGOUT",
  "SESSION_CREATED",
  "SESSION_EXPIRED",
  "SESSION_REVOKED",
  "CAPSULE_CREATED",
  "CAPSULE_METADATA_READ",
  "CAPSULE_CONTENT_READ",
  "CAPSULE_UPDATED",
  "CAPSULE_DELETED",
  // D-2D-D10-6: correction propagation chain (RAA 12.8 §5.2)
  "CORRECTION_PROPAGATED",
  "PERMISSION_CREATED",
  "PERMISSION_REVOKED",
  "PERMISSION_EXPIRED",
  "DATA_MONETIZED",
  "HIVE_CREATED",
  "HIVE_MEMBER_ADDED",
  "HIVE_MEMBER_REMOVED",
  "HIVE_INTELLIGENCE_READ",
  "HIVE_AGGREGATE_BUILT",
  "COMPLIANCE_CHECK_PASSED",
  "COMPLIANCE_CHECK_FAILED",
  "ANOMALY_DETECTED",
  "RATE_LIMITED",
  "ADMIN_ACTION",
  "NEGOTIATE",
  "CONVERSATION_STARTED",
  "CONVERSATION_CLOSED",
  // 12C.0 Item 7
  "FEEDBACK_LOOP_EXECUTED",
  "FEEDBACK_LOOP_FAILED",
  // CAR Sub-box 3 sub-phase 5 [SUB-BOX-3-ROUTES] per ADR-0036
  // Sub-decision 4. EXPIRED reserved; not emitted at sub-phase 5.
  "REGULATOR_ACCESS_GRANTED",
  "REGULATOR_ACCESS_REVOKED",
  "REGULATOR_ACCESS_EXPIRED",
  // Phase 3 Sub-arc 2 Gap 1 [CAPSULE-MUTATION-PRISMA-MIGRATION] per
  // ADR-0042 Sub-decision Q-γ. 4 NEW append-only literals (36 → 40).
  "CAPSULE_MUTATION_ADD",
  "CAPSULE_MUTATION_UPDATE",
  "CAPSULE_MUTATION_MERGE",
  "CAPSULE_MUTATION_NOOP",
  // Phase 3 Sub-arc 2 Gap 3 [CAPSULE-EMBEDDING-RETRIEVAL] per ADR-0043
  // §G3.6 + Q-G3.6-δ. Append-only per Q-γ.1 clean-transition (no
  // removal of existing literals; new literal appended).
  "CAPSULE_SIMILARITY_SEARCH",
  // Phase 3 Sub-Arc 3 personalization literals per ADR-0048 §Audit-Literal
  // Proposals (Q-PERS-θ θ-2). AUDIT.1 defines only; emission forward-substrate
  // (AUDIT.2 / working-set API exposure + future manifest/cross-entity/signal
  // flows). Append-only per ADR-0042 §Q-γ.1.
  "WORKING_SET_BUILT",
  "CONTEXT_USED_MANIFEST_RECORDED",
  "PERSONALIZATION_DEGRADED",
  "CROSS_ENTITY_CONTEXT_REQUESTED",
  "PERSONALIZATION_SIGNAL_RECORDED",
  // GOVSEC.5 break-glass (GAP-K1, ADR-0050) BG.1. Append-only per Q-γ.1; emitted
  // by break-glass.service.ts (BG.1 substrate; no middleware wiring until BG.2).
  "BREAK_GLASS_INVOKED",
  "BREAK_GLASS_USED",
  "BREAK_GLASS_EXPIRED",
  "BREAK_GLASS_REVIEWED",
  // ADR-0057 §10 Autonomous Execution Core (Section 2). 10 NEW append-only
  // literals. DEFINED here only; emission is forward-substrate per ADR-0057
  // §16 step 4-7 (action.service.ts + executor + scheduler + ORG_ACTION_
  // POLICY_UPDATE binding land in later QLOCKs). Append-only per ADR-0042
  // §Q-γ.1. The SAFE allowlist + FORBIDDEN list for per-event details are
  // documented at the union-type extension above.
  "ACTION_PROPOSED",
  "ACTION_APPROVED",
  "ACTION_REJECTED",
  "ACTION_SCHEDULED",
  "ACTION_STARTED",
  "ACTION_SUCCEEDED",
  "ACTION_FAILED",
  "ACTION_CANCELLED",
  "ACTION_EXPIRED",
  "ACTION_POLICY_UPDATE",
  // VF.2 voice-first runtime per ADR-0085 §5 + §8. 6 NEW append-
  // only literals. Append-only per ADR-0042 §Q-γ.1.
  "VOICE_INTENT_RECEIVED",
  "VOICE_INTENT_CONFIRMED",
  "VOICE_INTENT_REJECTED",
  "VOICE_INTENT_EXPIRED",
  "VOICE_INTENT_REDACTED",
  "VOICE_INTENT_DELIVERED",
  // W5 Action Promotion Runtime per ADR-0086 + ADR-0042 §Q-γ.1.
  "PROPOSED_ACTION_REFERENCED",
] as const satisfies readonly AuditEventType[];

export function isKnownAuditEventType(
  value: unknown,
): value is AuditEventType {
  return (
    typeof value === "string" &&
    (AUDIT_EVENT_TYPE_VALUES as readonly string[]).includes(value)
  );
}

// WHAT: The shape callers hand to writeAuditEvent.
// INPUT: Used as a parameter type only.
// OUTPUT: None -- this is a type, not a value.
// WHY: All non-derived fields the spec lists. event_hash is computed
//      for the caller; previous_event_hash is looked up automatically.
export interface WriteAuditEventInput {
  event_type: AuditEventType | string;
  outcome: AuditOutcome;
  actor_entity_id?: string | null;
  target_entity_id?: string | null;
  target_capsule_id?: string | null;
  session_id?: string | null;
  denial_reason?: string | null;
  details?: Record<string, unknown>;
  ip_address?: string | null;
  // 12C.0 Item 7: optional system principal for system-initiated
  // emissions (scheduler ticks, boot validators, compliance seeders,
  // feedback loops). Selects which dedicated chain the event joins
  // when actor_entity_id is null. When BOTH actor_entity_id and
  // system_principal are absent, chainKey selection falls back to
  // the legacy SYSTEM_CHAIN_KEY (DRIFT 12 backwards-compat anchor).
  system_principal?: SystemPrincipal | null;
  // CAR Sub-box 3 sub-phase 4 [SUB-BOX-3-AUDIT-CHAIN-EXTENSION] per
  // ADR-0036 Sub-decision 5 hybrid binding. Top-level canonical_record/1
  // positions 13 + 14. Persisted on the AuditEvent row; verifyAuditChain
  // reads them from the row to recompute the canonical record. Default
  // "" at canonical hash time when nullish.
  lawful_basis_id?: string | null;
  lawful_basis_chain_hash?: string | null;
  // CAR Sub-box 2 sub-phase 3 [CAR-SUB-BOX-2-SERVICES] per ADR-0037
  // Sub-decisions 2 + 3 + 5 + Q-NEW-3 LOCKED Option α (passthrough
  // only). Optional jurisdictional anchor for the audit event row.
  // ROW METADATA ONLY — NOT included in canonicalRecord(...) call
  // below; preserves Sub-box 3 sub-phase 4 14-field canonical_record/1
  // byte-equivalence + 12 fixture pairs + cosmp_router default tier
  // 137/0 substrate canonical at substantive register substantively.
  // Operation-context defaulting (capsule.jurisdiction OR
  // actor.entity.jurisdiction OR LawfulBasis.jurisdiction_invoked)
  // lands at sub-phase 4 [CAR-SUB-BOX-2-COSMP-ENFORCEMENT] register
  // substantively where COSMP services pass operation-derived
  // jurisdiction explicitly.
  jurisdiction?: string | null;
}

// WHAT: Filters queryAuditEvents accepts.
// INPUT: Used as a parameter type only.
// OUTPUT: None -- this is a type, not a value.
// WHY: Pagination is mandatory (max 100 per page), other filters are
//      optional so callers can ask broad or narrow questions.
export interface QueryAuditEventsFilters {
  actor_entity_id?: string;
  target_entity_id?: string;
  target_capsule_id?: string;
  event_type?: string;
  outcome?: AuditOutcome;
  start_time?: Date;
  end_time?: Date;
  page?: number;
  page_size?: number;
}

// WHAT: The shape of a queryAuditEvents response.
// INPUT: Used as a return type only.
// OUTPUT: None -- this is a type, not a value.
// WHY: Lets callers know what page they got and how many total rows
//      match their filter, for pager UIs.
export interface QueryAuditEventsResult {
  events: AuditEvent[];
  page: number;
  page_size: number;
  total: number;
}

// WHAT: The shape of a verifyAuditChain response.
// INPUT: Used as a return type only.
// OUTPUT: None -- this is a type, not a value.
// WHY: Lets callers display "chain valid" / "chain broken at row X"
//      with a single object. ADR-0071 added the optional
//      `firstEventId`/`firstEventHash`/`lastEventId`/`lastEventHash`
//      boundary metadata so cross-scope callers can populate
//      the SAFE VerifyChainView projection without a second query.
export interface VerifyAuditChainResult {
  valid: boolean;
  totalEvents: number;
  brokenAt: string | null;
  firstEventId: string | null;
  firstEventHash: string | null;
  firstEventTimestamp: Date | null;
  lastEventId: string | null;
  lastEventHash: string | null;
  lastEventTimestamp: Date | null;
}

// WHAT: Optional window-aware opts for verifyAuditChain. ADR-0071
//        §11 — additive only; existing call sites pass no opts
//        and behavior is preserved.
// INPUT: Used as a parameter type.
// OUTPUT: None -- this is a type, not a value.
// WHY: Cross-scope verify-chain (org/platform/regulator) needs
//      bounded windows + perf caps so chain walks do not become
//      full-history scans. `from`/`to` clamp the timestamp range;
//      `maxEvents` is the perf cap mirroring the
//      VERIFY_CHAIN_MAX_EVENTS = 10_000 hard ceiling.
export interface VerifyAuditChainOptions {
  from?: Date;
  to?: Date;
  maxEvents?: number;
}

// WHAT: The maximum number of audit events one queryAuditEvents page
//        will ever return.
// INPUT: None.
// OUTPUT: The number 100.
// WHY: Spec says max 100 per page. Naming the constant means we can
//      change it later without grep.
export const MAX_AUDIT_EVENTS_PAGE_SIZE = 100;

// WHAT: Hard cap on the number of audit events a single cross-scope
//        verify-chain call may walk per ADR-0071 §6.
// INPUT: None.
// OUTPUT: The number 10_000.
// WHY: ADR-0071 perf bound mirroring EXPORT_AUDIT_EVENTS_MAX_ROWS
//      precedent. Cross-scope verification (org / platform /
//      regulator) MUST never become a full-history walk; the cap
//      protects route latency + DB load. Requests whose estimated
//      row count exceeds this cap fail with WINDOW_TOO_LARGE per
//      ADR-0071 §9.
export const VERIFY_CHAIN_MAX_EVENTS = 10_000;

// WHAT: Legacy sentinel used as chainKey when neither actor_entity_id
//        nor system_principal is provided.
// INPUT: None.
// OUTPUT: A literal string.
// WHY: pg_advisory_xact_lock needs a stable hash input. Pre-12C.0
//      every system-initiated emission collapsed onto this single
//      sentinel, joining one shared chain. 12C.0 Item 7 adds
//      SYSTEM_PRINCIPALS so subsystem-attributable emissions chain
//      separately, but this constant remains exported (DRIFT 12
//      backwards-compat anchor): existing audit rows written under
//      the legacy sentinel must remain verifiable, and existing
//      writeAuditEvent callers without system_principal must
//      continue working unchanged.
const SYSTEM_CHAIN_KEY = "__niov_system_chain__";

// WHAT: 12C.0 Item 7 enumerated system principals.
// INPUT: None.
// OUTPUT: A frozen object with sentinel chain-key strings keyed by
//         a small set of named subsystems.
// WHY: Pre-12C.0 every system-initiated audit event collapsed onto
//      one SYSTEM_CHAIN_KEY sentinel chain. FedRAMP / SOC 2 reviewers
//      prefer enumerated system identities so audit reconstruction
//      can attribute system actions to a specific subsystem.
//      Object.freeze is asserted by tests/unit/audit-system-principals.test.ts
//      so future engineers (or LLMs) cannot mutate the enum at
//      runtime without breaking a red test. New principals MUST be
//      added here AND have their chainKey value reviewed for
//      naming-collision (the "__niov_system_<subsystem>__" pattern
//      is the convention).
export const SYSTEM_PRINCIPALS = Object.freeze({
  SCHEDULER: "__niov_system_scheduler__",
  BOOT_VALIDATOR: "__niov_system_boot_validator__",
  COMPLIANCE_SEEDER: "__niov_system_compliance_seeder__",
  FEEDBACK_LOOP: "__niov_system_feedback_loop__",
  // Sub-phase 5b-ii [BEAM-COSMP-INTEROP-PERSISTENCE] per ADR-0033
  // §Decision 4d (D-5BII-EXEC-3): Elixir/BEAM register subsystem
  // attribution for system-initiated COSMP ops emitted from
  // CosmpRouter.Audit. Matched constant in
  // apps/cosmp_router/lib/cosmp_router/audit.ex @system_principals.
  COSMP_ROUTER: "__niov_system_cosmp_router__",
} as const);

export type SystemPrincipal =
  (typeof SYSTEM_PRINCIPALS)[keyof typeof SYSTEM_PRINCIPALS];

// WHAT: Convert any JS value into a deterministic JSON string with
//        sorted object keys.
// INPUT: Any JS value (object, array, primitive).
// OUTPUT: A canonical JSON string.
// WHY: The default JSON.stringify orders object keys by insertion,
//      which would change the hash even when the data is identical.
//      Sorting keys recursively gives us a stable canonical form.
// EXPORTED at sub-phase 5b-ii [BEAM-COSMP-INTEROP-PERSISTENCE] per
// ADR-0033 §Decision 4b: scripts/generate-canonical-fixtures.ts +
// future cross-language audit-chain tooling import this for
// byte-equivalence verification with Elixir register's port at
// apps/cosmp_router/lib/cosmp_router/audit.ex canonical_json/1.
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalJson).join(",") + "]";
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return (
    "{" +
    keys
      .map((k) => JSON.stringify(k) + ":" + canonicalJson(obj[k]))
      .join(",") +
    "}"
  );
}

// WHAT: Build the canonical input string that gets fed into SHA-256.
// INPUT: Every field that participates in the hash.
// OUTPUT: A delimited string suitable for hashing.
// WHY: Centralizing this here means the same logic runs at write time
//      and at verify time, so a single bug cannot make the chain
//      "valid" by mistake.
// EXPORTED at sub-phase 5b-ii per ADR-0033 §Decision 4a: same
// rationale as canonicalJson — fixture generator + byte-equivalence
// verification with Elixir port at CosmpRouter.Audit.canonical_record/1.
export function canonicalRecord(parts: {
  audit_id: string;
  event_type: string;
  actor_entity_id: string | null;
  target_entity_id: string | null;
  target_capsule_id: string | null;
  session_id: string | null;
  outcome: AuditOutcome;
  denial_reason: string | null;
  details: unknown;
  ip_address: string | null;
  timestamp: Date;
  previous_event_hash: string | null;
  // CAR Sub-box 3 sub-phase 4 [SUB-BOX-3-AUDIT-CHAIN-EXTENSION] per
  // ADR-0036 Sub-decision 5 hybrid binding. Positions 13 + 14.
  lawful_basis_id: string | null;
  lawful_basis_chain_hash: string | null;
}): string {
  return [
    parts.audit_id,
    parts.event_type,
    parts.actor_entity_id ?? "",
    parts.target_entity_id ?? "",
    parts.target_capsule_id ?? "",
    parts.session_id ?? "",
    parts.outcome,
    parts.denial_reason ?? "",
    canonicalJson(parts.details),
    parts.ip_address ?? "",
    parts.timestamp.toISOString(),
    parts.previous_event_hash ?? "",
    parts.lawful_basis_id ?? "",
    parts.lawful_basis_chain_hash ?? "",
  ].join("|");
}

// WHAT: Compute the SHA-256 hex digest of a canonical record string.
// INPUT: The canonical string built by canonicalRecord.
// OUTPUT: A 64-character hex string.
// WHY: Hex is human-readable in the database and easy to compare.
function sha256Hex(canonical: string): string {
  return createHash(CRYPTO_CONFIG.HASH_ALGORITHM).update(canonical).digest("hex");
}

// WHAT: Install the Postgres trigger that makes audit_events
//        append-only.
// INPUT: An optional Prisma client (defaults to the shared one).
// OUTPUT: A promise that resolves once the trigger is installed.
// WHY: Prisma cannot define triggers in schema.prisma, so we install
//      one here. The function is idempotent -- it drops any older
//      version of the trigger before recreating it -- so it can be
//      called from server boot or test setup safely.
export async function applyAuditEventTriggers(
  client: typeof prisma = prisma,
): Promise<void> {
  await client.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION audit_events_immutable() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'audit_events is append-only; UPDATE and DELETE are not permitted';
    END;
    $$ LANGUAGE plpgsql;
  `);
  await client.$executeRawUnsafe(
    "DROP TRIGGER IF EXISTS audit_events_no_update ON audit_events",
  );
  await client.$executeRawUnsafe(`
    CREATE TRIGGER audit_events_no_update
      BEFORE UPDATE ON audit_events
      FOR EACH ROW EXECUTE FUNCTION audit_events_immutable();
  `);
  await client.$executeRawUnsafe(
    "DROP TRIGGER IF EXISTS audit_events_no_delete ON audit_events",
  );
  await client.$executeRawUnsafe(`
    CREATE TRIGGER audit_events_no_delete
      BEFORE DELETE ON audit_events
      FOR EACH ROW EXECUTE FUNCTION audit_events_immutable();
  `);
}

// WHAT: Inner work: acquire the per-chain advisory lock, look up the
//        previous event hash, compute the new hash, and insert one row.
// INPUT: A transaction client and a WriteAuditEventInput.
// OUTPUT: The newly created AuditEvent record.
// WHY: Pulled out so writeAuditEvent can be called either standalone
//      (opens its own transaction) OR inside a caller-provided
//      transaction (composable with Phase 0's atomic create-org flow).
//      The advisory lock is acquired in whichever transaction is live
//      so per-chain serialization works in both modes.
async function writeAuditEventInTx(
  tx: Prisma.TransactionClient,
  input: WriteAuditEventInput,
): Promise<AuditEvent> {
  // 12C.0 Item 7 chainKey selection priority:
  //   1. actor_entity_id (real authenticated entity) -- existing path
  //   2. system_principal (named subsystem -- new in 12C.0)
  //   3. legacy SYSTEM_CHAIN_KEY (DRIFT 12 backwards-compat: existing
  //      callers without either parameter still produce verifiable
  //      audit rows, and historical rows under the legacy sentinel
  //      remain in their own chain).
  const chainKey =
    input.actor_entity_id ?? input.system_principal ?? SYSTEM_CHAIN_KEY;
  // Serialize per-chain writes so two concurrent writers cannot link
  // to the same previous event. Held until the transaction commits.
  await tx.$executeRawUnsafe(
    `SELECT pg_advisory_xact_lock(hashtext($1))`,
    chainKey,
  );

  const previous = await tx.auditEvent.findFirst({
    where: input.actor_entity_id
      ? { actor_entity_id: input.actor_entity_id }
      : { actor_entity_id: null },
    orderBy: { timestamp: "desc" },
    select: { event_hash: true },
  });

  const audit_id = randomUUID();
  const timestamp = new Date();
  // 12C.0 Item 7: merge system_principal into details so subsystem
  // attribution is preserved in the row AND participates in the
  // canonical hash (canonicalJson(details) walks every key). Existing
  // emissions without system_principal write unchanged details
  // (DRIFT 12 backwards-compat: legacy rows have no system_principal
  // key; the canonical hash for those continues to compute identically).
  const details: Record<string, unknown> =
    input.system_principal !== undefined && input.system_principal !== null
      ? { ...(input.details ?? {}), system_principal: input.system_principal }
      : (input.details ?? {});
  const previous_event_hash = previous?.event_hash ?? null;

  const event_hash = sha256Hex(
    canonicalRecord({
      audit_id,
      event_type: input.event_type,
      actor_entity_id: input.actor_entity_id ?? null,
      target_entity_id: input.target_entity_id ?? null,
      target_capsule_id: input.target_capsule_id ?? null,
      session_id: input.session_id ?? null,
      outcome: input.outcome,
      denial_reason: input.denial_reason ?? null,
      details,
      ip_address: input.ip_address ?? null,
      timestamp,
      previous_event_hash,
      lawful_basis_id: input.lawful_basis_id ?? null,
      lawful_basis_chain_hash: input.lawful_basis_chain_hash ?? null,
    }),
  );

  return tx.auditEvent.create({
    data: {
      audit_id,
      event_type: input.event_type,
      actor_entity_id: input.actor_entity_id ?? null,
      target_entity_id: input.target_entity_id ?? null,
      target_capsule_id: input.target_capsule_id ?? null,
      session_id: input.session_id ?? null,
      outcome: input.outcome,
      denial_reason: input.denial_reason ?? null,
      details: details as Prisma.InputJsonValue,
      ip_address: input.ip_address ?? null,
      timestamp,
      previous_event_hash,
      event_hash,
      lawful_basis_id: input.lawful_basis_id ?? null,
      lawful_basis_chain_hash: input.lawful_basis_chain_hash ?? null,
      // CAR Sub-box 2 sub-phase 3 [CAR-SUB-BOX-2-SERVICES] per
      // ADR-0037 Sub-decision 3: row metadata only; NOT in
      // canonicalRecord above (preserves Sub-box 3 sub-phase 4
      // 14-field byte-equivalence canonical at substantive register
      // substantively).
      jurisdiction: input.jurisdiction ?? null,
    },
  });
}

// WHAT: Insert one row into audit_events, computing the chain hash and
//        linking it to the previous event in the actor's chain.
// INPUT: A WriteAuditEventInput, plus an optional transaction client
//        for callers that want this write to happen inside their own
//        outer transaction (Phase 0, Phase 3, etc.).
// OUTPUT: The newly created AuditEvent record.
// WHY: This is the only legal way to put data into audit_events. We
//      hold an advisory lock on the chain so two concurrent writers
//      cannot link to the same previous event. When tx is omitted we
//      open our own transaction (existing behavior, Section 1E
//      baseline tests rely on this). When tx is provided we run the
//      lock + lookup + insert inside it -- the outer transaction's
//      commit/rollback determines whether the audit row persists,
//      which is exactly what hash-chain integrity requires when
//      composing with a multi-step atomic flow.
export async function writeAuditEvent(
  input: WriteAuditEventInput,
  tx?: Prisma.TransactionClient,
): Promise<AuditEvent> {
  if (tx !== undefined) {
    return writeAuditEventInTx(tx, input);
  }
  return prisma.$transaction((innerTx) => writeAuditEventInTx(innerTx, input));
}

// WHAT: Read a paginated, filtered slice of audit_events.
// INPUT: A QueryAuditEventsFilters object (any subset of the fields).
// OUTPUT: A QueryAuditEventsResult with events plus paging metadata.
// WHY: Compliance reviewers and admin dashboards need to browse the
//      audit-of-record. Hard-capping page_size at 100 makes it harder
//      for a careless query to drag the database down.
export async function queryAuditEvents(
  filters: QueryAuditEventsFilters = {},
): Promise<QueryAuditEventsResult> {
  const requestedSize = filters.page_size ?? 50;
  const page_size = Math.max(
    1,
    Math.min(MAX_AUDIT_EVENTS_PAGE_SIZE, requestedSize),
  );
  const page = Math.max(1, filters.page ?? 1);

  const where: Prisma.AuditEventWhereInput = {};
  if (filters.actor_entity_id) where.actor_entity_id = filters.actor_entity_id;
  if (filters.target_entity_id)
    where.target_entity_id = filters.target_entity_id;
  if (filters.target_capsule_id)
    where.target_capsule_id = filters.target_capsule_id;
  if (filters.event_type) where.event_type = filters.event_type;
  if (filters.outcome) where.outcome = filters.outcome;
  if (filters.start_time || filters.end_time) {
    where.timestamp = {};
    if (filters.start_time) where.timestamp.gte = filters.start_time;
    if (filters.end_time) where.timestamp.lte = filters.end_time;
  }

  const [events, total] = await Promise.all([
    prisma.auditEvent.findMany({
      where,
      orderBy: { timestamp: "desc" },
      skip: (page - 1) * page_size,
      take: page_size,
    }),
    prisma.auditEvent.count({ where }),
  ]);

  return { events, page, page_size, total };
}

// WHAT: Walk an entity's audit chain and confirm every link still
//        matches.
// INPUT: The entity_id whose chain to verify.
// OUTPUT: A VerifyAuditChainResult.
// WHY: Tamper detection. A break tells the operator either a row was
//      modified or the trigger was disabled and someone deleted /
//      reordered events. brokenAt names the first row whose stored
//      event_hash does not match a freshly recomputed hash, OR whose
//      previous_event_hash does not match the prior row's stored hash.
export async function verifyAuditChain(
  entityId: string,
  opts?: VerifyAuditChainOptions,
): Promise<VerifyAuditChainResult> {
  // ADR-0071 §11 — window-aware variant (additive). When opts is
  // omitted the where filter degenerates to the original
  // actor_entity_id-only walk; existing call sites are preserved
  // verbatim.
  const where: Prisma.AuditEventWhereInput = {
    actor_entity_id: entityId,
  };
  if (opts?.from !== undefined || opts?.to !== undefined) {
    const ts: { gte?: Date; lte?: Date } = {};
    if (opts.from !== undefined) ts.gte = opts.from;
    if (opts.to !== undefined) ts.lte = opts.to;
    where.timestamp = ts;
  }
  const take =
    opts?.maxEvents !== undefined && opts.maxEvents > 0
      ? opts.maxEvents
      : undefined;
  const events = await prisma.auditEvent.findMany({
    where,
    orderBy: { timestamp: "asc" },
    ...(take !== undefined ? { take } : {}),
  });

  const totalEvents = events.length;
  const firstEvent = events[0] ?? null;
  const lastEvent = events[totalEvents - 1] ?? null;
  const boundary = {
    firstEventId: firstEvent?.audit_id ?? null,
    firstEventHash: firstEvent?.event_hash ?? null,
    firstEventTimestamp: firstEvent?.timestamp ?? null,
    lastEventId: lastEvent?.audit_id ?? null,
    lastEventHash: lastEvent?.event_hash ?? null,
    lastEventTimestamp: lastEvent?.timestamp ?? null,
  };

  // When a window is applied we cannot assume the first event in
  // the window is the start of the entity's chain — its
  // `previous_event_hash` may legitimately point at an earlier
  // row outside the window. Anchor the priorHash to that
  // expected predecessor so the first iteration validates link
  // integrity (recompute still verifies the hash itself), and
  // subsequent iterations validate strict link continuity.
  let priorHash: string | null = null;
  if (opts !== undefined && firstEvent !== null) {
    priorHash = firstEvent.previous_event_hash ?? null;
  }
  for (const e of events) {
    if (e.previous_event_hash !== priorHash) {
      return {
        valid: false,
        totalEvents,
        brokenAt: e.audit_id,
        ...boundary,
      };
    }
    const recomputed = sha256Hex(
      canonicalRecord({
        audit_id: e.audit_id,
        event_type: e.event_type,
        actor_entity_id: e.actor_entity_id,
        target_entity_id: e.target_entity_id,
        target_capsule_id: e.target_capsule_id,
        session_id: e.session_id,
        outcome: e.outcome,
        denial_reason: e.denial_reason,
        details: e.details,
        ip_address: e.ip_address,
        timestamp: e.timestamp,
        previous_event_hash: e.previous_event_hash,
        lawful_basis_id: e.lawful_basis_id,
        lawful_basis_chain_hash: e.lawful_basis_chain_hash,
      }),
    );
    if (recomputed !== e.event_hash) {
      return {
        valid: false,
        totalEvents,
        brokenAt: e.audit_id,
        ...boundary,
      };
    }
    priorHash = e.event_hash;
  }

  return {
    valid: true,
    totalEvents,
    brokenAt: null,
    ...boundary,
  };
}

// WHAT: Return the most recent event_hash for an entity's chain.
// INPUT: The entity_id.
// OUTPUT: A 64-character hex string, or null if the chain is empty.
// WHY: External callers that batch-write events sometimes want to
//      preview the chain head without doing a write of their own.
export async function getLatestEventHash(
  entityId: string,
): Promise<string | null> {
  const latest = await prisma.auditEvent.findFirst({
    where: { actor_entity_id: entityId },
    orderBy: { timestamp: "desc" },
    select: { event_hash: true },
  });
  return latest?.event_hash ?? null;
}

export { prisma } from "../client.js";
