// FILE: voice-intent-envelope.ts
// PURPOSE: VF.2 VoiceIntentEnvelope substrate object + envelope-
//          construction service per ADR-0085 §5. The envelope is
//          the audit-honest substrate that proves voice
//          interactions are governed exactly like visual
//          interactions. No voice runtime ships without this
//          envelope.
//
//          Voice transcripts are NOT raw chat logs — every
//          utterance is encoded as a VoiceIntentEnvelope that
//          flows through Foundation governance the same way a
//          ConnectorInvocation flows.
//
//          The constructEnvelope service emits a
//          VOICE_INTENT_RECEIVED audit event BEFORE returning the
//          envelope per RULE 4 (every action that touches data
//          gets logged BEFORE the response is sent).
//
// PRIVACY INVARIANT (locked by ADR-0085 §5 + §6):
//   - The audit details schema is SAFE per ADR-0085 §5 + the
//     `AUDIT_EVENT_TYPE_VALUES` extension at packages/database/
//     src/queries/audit.ts. SAFE fields: intent_id /
//     source_surface / intent_class / confirmation_state /
//     approval_chain_state / transcript_redacted /
//     transcript_redaction_reason / retention_class.
//   - FORBIDDEN: transcript_text (lives on the envelope row, not
//     the audit details); raw audio_ref; OAuth/API key; Bearer
//     header; cross-tenant identifiers; proposed_action body.
//
// CONNECTS TO:
//   - apps/api/src/services/voice/voice-provider.service.ts
//     (TranscribeResult feeds envelope.transcript_text)
//   - packages/database/src/queries/audit.ts (writeAuditEvent +
//     6 NEW VOICE_INTENT_* audit literals)
//   - docs/architecture/decisions/0085-voice-first-product-doctrine.md
//   - docs/voice-first/voice-intent-envelope.md

import { writeAuditEvent } from "@niov/database";

// WHAT: Closed-vocab enum of the 13 Otzar product surfaces that
//        emit voice intents per ADR-0085 §7 + docs/voice-first/
//        interaction-map.md.
// INPUT: Used as a discriminated string-literal union.
// OUTPUT: None.
// WHY: Surface determines the canonical voice intents allowed at
//      this register. Unknown surfaces reject at envelope
//      construction.
export type VoiceSourceSurface =
  | "ONBOARDING"
  | "ADMIN_TWIN"
  | "AI_TWIN"
  | "AI_TEAMMATE"
  | "WORKFLOW_RECOMMENDATION"
  | "PROPOSED_ACTION"
  | "APPROVAL_REQUEST"
  | "CONNECTOR_QUESTION"
  | "MEETING_FOLLOWUP"
  | "HIVE"
  | "AGENT_PLAYGROUND"
  | "AUDIT_EXPLANATION"
  | "EXECUTIVE_BRIEFING";

// WHAT: Runtime-iterable list of every recognized
//        VoiceSourceSurface. Mirrors AUDIT_EVENT_TYPE_VALUES
//        pattern.
// INPUT: None.
// OUTPUT: Readonly tuple.
// WHY: Frozen-anchor source-of-truth so the construction service
//      can membership-check without duplicating the literal list.
export const VOICE_SOURCE_SURFACES: ReadonlyArray<VoiceSourceSurface> =
  Object.freeze([
    "ONBOARDING",
    "ADMIN_TWIN",
    "AI_TWIN",
    "AI_TEAMMATE",
    "WORKFLOW_RECOMMENDATION",
    "PROPOSED_ACTION",
    "APPROVAL_REQUEST",
    "CONNECTOR_QUESTION",
    "MEETING_FOLLOWUP",
    "HIVE",
    "AGENT_PLAYGROUND",
    "AUDIT_EXPLANATION",
    "EXECUTIVE_BRIEFING",
  ] as const);

export function isVoiceSourceSurface(
  value: unknown,
): value is VoiceSourceSurface {
  return (
    typeof value === "string" &&
    (VOICE_SOURCE_SURFACES as ReadonlyArray<string>).includes(value)
  );
}

// WHAT: Closed-vocab risk tier per ADR-0085 §3.
export type VoiceIntentClass = "LOW" | "MEDIUM" | "HIGH";

// WHAT: Closed-vocab confirmation state per ADR-0085 §5.
export type VoiceConfirmationState =
  | "NOT_NEEDED"
  | "PENDING"
  | "CONFIRMED"
  | "REJECTED"
  | "EXPIRED";

// WHAT: Closed-vocab approval-chain state per ADR-0085 §5.
export type VoiceApprovalChainState =
  | "NONE"
  | "PENDING"
  | "APPROVED"
  | "REJECTED";

// WHAT: Closed-vocab transcript redaction reasons per ADR-0085 §5.
//        null when transcript_redacted: false.
export type VoiceRedactionReason =
  | "NON_WORK"
  | "PROTECTED_ATTRIBUTE"
  | "FORBIDDEN_INTENT"
  | null;

// WHAT: Closed-vocab retention class per ADR-0079 transcript
//        substrate policy. VF.2 uses a stub enum; richer
//        retention classes forward-substrate.
export type VoiceRetentionClass = "STANDARD" | "AGGREGATE_ONLY" | "EPHEMERAL";

// WHAT: VoiceIntentEnvelope substrate object per ADR-0085 §5.
// INPUT: Used as a service return type + persistence target
//          (forward-substrate at VF.4 when CT consumes envelopes
//          via a route).
// OUTPUT: None.
// WHY: The audit-honest substrate that proves voice interactions
//      are governed exactly like visual interactions.
export interface VoiceIntentEnvelope {
  intent_id: string;
  caller_entity_id: string;
  tenant_org_entity_id: string;
  source_surface: VoiceSourceSurface;
  transcript_text: string;
  transcript_redacted: boolean;
  transcript_redaction_reason: VoiceRedactionReason;
  intent_class: VoiceIntentClass;
  confirmation_state: VoiceConfirmationState;
  approval_chain_state: VoiceApprovalChainState;
  audit_event_id: string;
  retention_class: VoiceRetentionClass;
  created_at: Date;
}

// WHAT: Input shape for constructEnvelope.
export interface ConstructEnvelopeInput {
  caller_entity_id: string;
  tenant_org_entity_id: string;
  source_surface: VoiceSourceSurface;
  transcript_text: string;
  transcript_redacted?: boolean;
  transcript_redaction_reason?: VoiceRedactionReason;
  intent_class: VoiceIntentClass;
  retention_class?: VoiceRetentionClass;
}

// WHAT: Construct a VoiceIntentEnvelope and emit the
//        VOICE_INTENT_RECEIVED audit event BEFORE returning. The
//        audit emission is RULE 4 enforcement — if the audit
//        write fails, the entire action fails.
// INPUT: ConstructEnvelopeInput.
// OUTPUT: Promise<VoiceIntentEnvelope>.
// WHY: This is the entry point through which every voice intent
//      enters the Foundation governance pipeline. Subsequent
//      lifecycle transitions (CONFIRMED / REJECTED / EXPIRED /
//      REDACTED / DELIVERED) emit their own audit events via
//      emitVoiceLifecycleAudit below.
export async function constructEnvelope(
  input: ConstructEnvelopeInput,
): Promise<VoiceIntentEnvelope> {
  // VALIDATION: source_surface must be a known canonical surface.
  if (!isVoiceSourceSurface(input.source_surface)) {
    throw new Error(
      "constructEnvelope: source_surface must be a known VoiceSourceSurface",
    );
  }
  // VALIDATION: intent_class must be LOW / MEDIUM / HIGH.
  if (
    input.intent_class !== "LOW" &&
    input.intent_class !== "MEDIUM" &&
    input.intent_class !== "HIGH"
  ) {
    throw new Error(
      "constructEnvelope: intent_class must be one of LOW / MEDIUM / HIGH",
    );
  }
  // VALIDATION: caller_entity_id + tenant_org_entity_id required.
  if (
    typeof input.caller_entity_id !== "string" ||
    input.caller_entity_id.length === 0
  ) {
    throw new Error("constructEnvelope: caller_entity_id required");
  }
  if (
    typeof input.tenant_org_entity_id !== "string" ||
    input.tenant_org_entity_id.length === 0
  ) {
    throw new Error("constructEnvelope: tenant_org_entity_id required");
  }

  const transcriptRedacted = input.transcript_redacted ?? false;
  const transcriptRedactionReason: VoiceRedactionReason = transcriptRedacted
    ? (input.transcript_redaction_reason ?? "FORBIDDEN_INTENT")
    : null;
  const retentionClass: VoiceRetentionClass =
    input.retention_class ?? "STANDARD";

  // Risk-tier discrimination per ADR-0085 §3:
  //   - LOW: voice intent is the confirmation; NOT_NEEDED.
  //   - MEDIUM: explicit confirmation required; PENDING.
  //   - HIGH: explicit confirmation + approval chain; PENDING + PENDING.
  const confirmationState: VoiceConfirmationState =
    input.intent_class === "LOW" ? "NOT_NEEDED" : "PENDING";
  const approvalChainState: VoiceApprovalChainState =
    input.intent_class === "HIGH" ? "PENDING" : "NONE";

  const intentId = crypto.randomUUID();

  // RULE 4 enforcement: emit VOICE_INTENT_RECEIVED BEFORE
  // returning the envelope. The audit details schema is SAFE per
  // ADR-0085 §5: intent_id + source_surface + intent_class +
  // confirmation_state + approval_chain_state + transcript_redacted
  // + transcript_redaction_reason + retention_class. NEVER
  // transcript_text (lives on the envelope row, not the audit
  // details); NEVER raw audio_ref; NEVER OAuth/API key; NEVER
  // Bearer header; NEVER cross-tenant identifiers; NEVER
  // proposed_action body.
  const auditRow = await writeAuditEvent({
    event_type: "VOICE_INTENT_RECEIVED",
    outcome: "SUCCESS",
    actor_entity_id: input.caller_entity_id,
    target_entity_id: input.tenant_org_entity_id,
    details: {
      intent_id: intentId,
      source_surface: input.source_surface,
      intent_class: input.intent_class,
      confirmation_state: confirmationState,
      approval_chain_state: approvalChainState,
      transcript_redacted: transcriptRedacted,
      transcript_redaction_reason: transcriptRedactionReason,
      retention_class: retentionClass,
    },
  });

  const envelope: VoiceIntentEnvelope = {
    intent_id: intentId,
    caller_entity_id: input.caller_entity_id,
    tenant_org_entity_id: input.tenant_org_entity_id,
    source_surface: input.source_surface,
    transcript_text: input.transcript_text,
    transcript_redacted: transcriptRedacted,
    transcript_redaction_reason: transcriptRedactionReason,
    intent_class: input.intent_class,
    confirmation_state: confirmationState,
    approval_chain_state: approvalChainState,
    audit_event_id: auditRow.audit_id,
    retention_class: retentionClass,
    created_at: new Date(),
  };

  return envelope;
}

// WHAT: Closed-vocab lifecycle audit literals per ADR-0085 §5.
//        Each literal is a member of AUDIT_EVENT_TYPE_VALUES (per
//        packages/database/src/queries/audit.ts).
export type VoiceLifecycleAuditLiteral =
  | "VOICE_INTENT_CONFIRMED"
  | "VOICE_INTENT_REJECTED"
  | "VOICE_INTENT_EXPIRED"
  | "VOICE_INTENT_REDACTED"
  | "VOICE_INTENT_DELIVERED";

// WHAT: Emit a lifecycle audit event for an existing envelope. Used
//        as envelopes transition through the confirmation +
//        approval flow per ADR-0085 §5 lifecycle.
// INPUT: literal + envelope (or envelope identifiers).
// OUTPUT: Promise<{ audit_event_id: string }>.
// WHY: RULE 4 enforcement at every lifecycle transition. Each
//      lifecycle audit row carries the same SAFE details schema
//      as the construction audit row above — never transcript
//      text, never proposed_action body.
export async function emitVoiceLifecycleAudit(input: {
  literal: VoiceLifecycleAuditLiteral;
  intent_id: string;
  caller_entity_id: string;
  tenant_org_entity_id: string;
  source_surface: VoiceSourceSurface;
  intent_class: VoiceIntentClass;
  confirmation_state: VoiceConfirmationState;
  approval_chain_state: VoiceApprovalChainState;
  transcript_redacted: boolean;
  transcript_redaction_reason: VoiceRedactionReason;
  retention_class: VoiceRetentionClass;
}): Promise<{ audit_event_id: string }> {
  const auditRow = await writeAuditEvent({
    event_type: input.literal,
    outcome: "SUCCESS",
    actor_entity_id: input.caller_entity_id,
    target_entity_id: input.tenant_org_entity_id,
    details: {
      intent_id: input.intent_id,
      source_surface: input.source_surface,
      intent_class: input.intent_class,
      confirmation_state: input.confirmation_state,
      approval_chain_state: input.approval_chain_state,
      transcript_redacted: input.transcript_redacted,
      transcript_redaction_reason: input.transcript_redaction_reason,
      retention_class: input.retention_class,
    },
  });
  return { audit_event_id: auditRow.audit_id };
}
