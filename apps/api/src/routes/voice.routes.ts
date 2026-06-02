// FILE: voice.routes.ts
// PURPOSE: VF.4a Foundation HTTP surface for voice-intent envelope
//          construction per ADR-0085 §5 + §8. Single route
//          POST /api/v1/voice/intents accepts a typed transcript +
//          source surface + risk-tier and returns the constructed
//          VoiceIntentEnvelope (sans transcript_text — never
//          returned over the wire). The envelope is persisted at
//          the audit substrate (RULE 4) by constructEnvelope itself.
//
//          The route is the operator-facing entry point for VF.4
//          CT voice surface scaffolding. CT will consume this
//          route via the existing api.* namespace pattern per
//          ADR-0085 §8 VF.4.
//
// PRIVACY INVARIANT (locked by ADR-0085 §5):
//   - The response NEVER carries transcript_text. CT renders the
//     transcript locally (typed input mirrors back to the
//     operator); the Foundation route only confirms the envelope
//     was constructed + the audit was written.
//   - The response NEVER carries Bearer / OAuth / secret /
//     proposed_action body. The SAFE response shape is documented
//     in the response envelope below.
// CONNECTS TO:
//   - apps/api/src/services/voice/voice-intent-envelope.ts
//     (constructEnvelope + VoiceSourceSurface + VoiceIntentClass +
//     VoiceRetentionClass + VoiceRedactionReason +
//     VOICE_SOURCE_SURFACES + isVoiceSourceSurface)
//   - apps/api/src/middleware/auth.middleware.ts (requireAuth)
//   - apps/api/src/services/governance/org.ts (getOrgEntityId)
//   - apps/api/src/services/auth.service.ts (AuthService)

import type { FastifyInstance, FastifyReply } from "fastify";
import { requireAuth } from "../middleware/auth.middleware.js";
import { getOrgEntityId } from "../services/governance/org.js";
import {
  VOICE_SOURCE_SURFACES,
  constructEnvelope,
  isVoiceSourceSurface,
  type VoiceIntentClass,
  type VoiceRedactionReason,
  type VoiceRetentionClass,
} from "../services/voice/voice-intent-envelope.js";
import type { AuthService } from "../services/auth.service.js";

// WHAT: Closed-vocab failure codes for the voice intent route.
// INPUT: Used as a discriminated string-literal union.
// OUTPUT: None.
// WHY: Audit-honest closed vocabulary so CT can map each code to
//      a customer-admin message without leaking backend prose.
export type VoiceIntentFailureCode =
  | "SESSION_INVALID"
  | "SESSION_EXPIRED"
  | "SESSION_REVOKED"
  | "OPERATION_NOT_PERMITTED"
  | "NO_ORG_FOR_CALLER"
  | "INVALID_FIELD"
  | "INVALID_SOURCE_SURFACE"
  | "INVALID_INTENT_CLASS"
  | "INVALID_RETENTION_CLASS"
  | "INVALID_REDACTION_REASON"
  | "INTERNAL_ERROR";

interface VoiceIntentRequestBody {
  source_surface?: unknown;
  transcript_text?: unknown;
  intent_class?: unknown;
  transcript_redacted?: unknown;
  transcript_redaction_reason?: unknown;
  retention_class?: unknown;
}

function statusForCode(code: VoiceIntentFailureCode): number {
  switch (code) {
    case "SESSION_INVALID":
    case "SESSION_EXPIRED":
    case "SESSION_REVOKED":
      return 401;
    case "OPERATION_NOT_PERMITTED":
      return 403;
    case "NO_ORG_FOR_CALLER":
      return 404;
    case "INVALID_FIELD":
    case "INVALID_SOURCE_SURFACE":
    case "INVALID_INTENT_CLASS":
    case "INVALID_RETENTION_CLASS":
    case "INVALID_REDACTION_REASON":
      return 422;
    case "INTERNAL_ERROR":
      return 500;
  }
}

const VALID_INTENT_CLASSES: ReadonlyArray<VoiceIntentClass> = Object.freeze([
  "LOW",
  "MEDIUM",
  "HIGH",
]);

const VALID_RETENTION_CLASSES: ReadonlyArray<VoiceRetentionClass> =
  Object.freeze(["STANDARD", "AGGREGATE_ONLY", "EPHEMERAL"]);

const VALID_REDACTION_REASONS: ReadonlyArray<Exclude<VoiceRedactionReason, null>> =
  Object.freeze(["NON_WORK", "PROTECTED_ATTRIBUTE", "FORBIDDEN_INTENT"]);

async function resolveOrgOrFail(
  entityId: string,
  reply: FastifyReply,
): Promise<string | null> {
  try {
    return await getOrgEntityId(entityId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    if (message === "NOT_IN_ANY_ORG" || message === "ORG_HIERARCHY_TOO_DEEP") {
      await reply.code(404).send({
        ok: false,
        code: "NO_ORG_FOR_CALLER",
        message: "Caller is not in an organization",
      });
      return null;
    }
    throw err;
  }
}

// WHAT: Register the VF.4a voice intent construction route.
// INPUT: Fastify instance + AuthService.
// OUTPUT: A promise resolved once the route is registered.
// WHY: Per ADR-0085 §8 VF.4 the CT voice surface needs a Foundation
//      route to POST typed transcripts against; this is that route.
export async function registerVoiceRoutes(
  app: FastifyInstance,
  authService: AuthService,
): Promise<void> {
  app.post<{ Body: VoiceIntentRequestBody }>(
    "/api/v1/voice/intents",
    {
      // "read" is the minimum operation scope — every authenticated
      // entity may emit voice intents into their own org. Risk-tier
      // gating happens INSIDE constructEnvelope per ADR-0085 §3 +
      // §5; the route surface itself is read-tier because the
      // envelope is the side effect, not a state-changing write.
      preHandler: requireAuth(authService, "read"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;

      const body = request.body ?? ({} as VoiceIntentRequestBody);

      // VALIDATION: source_surface required + must be one of the
      // 13 canonical VOICE_SOURCE_SURFACES.
      const sourceSurface = body.source_surface;
      if (!isVoiceSourceSurface(sourceSurface)) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_SOURCE_SURFACE",
          invalid_fields: ["source_surface"],
          valid_values: VOICE_SOURCE_SURFACES,
        });
      }

      // VALIDATION: transcript_text required + non-empty string.
      const transcriptText = body.transcript_text;
      if (typeof transcriptText !== "string" || transcriptText.length === 0) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_FIELD",
          invalid_fields: ["transcript_text"],
        });
      }

      // VALIDATION: intent_class required + one of LOW / MEDIUM /
      // HIGH.
      const intentClass = body.intent_class;
      if (
        typeof intentClass !== "string" ||
        !VALID_INTENT_CLASSES.includes(intentClass as VoiceIntentClass)
      ) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_INTENT_CLASS",
          invalid_fields: ["intent_class"],
          valid_values: VALID_INTENT_CLASSES,
        });
      }

      // VALIDATION: retention_class (optional) must be a known
      // value if present.
      const retentionClassRaw = body.retention_class;
      let retentionClass: VoiceRetentionClass | undefined;
      if (retentionClassRaw !== undefined) {
        if (
          typeof retentionClassRaw !== "string" ||
          !VALID_RETENTION_CLASSES.includes(
            retentionClassRaw as VoiceRetentionClass,
          )
        ) {
          return reply.code(422).send({
            ok: false,
            code: "INVALID_RETENTION_CLASS",
            invalid_fields: ["retention_class"],
            valid_values: VALID_RETENTION_CLASSES,
          });
        }
        retentionClass = retentionClassRaw as VoiceRetentionClass;
      }

      // VALIDATION: transcript_redacted (optional) must be boolean
      // if present; transcript_redaction_reason (optional) must be
      // a known value if present (or null if not redacted).
      const transcriptRedactedRaw = body.transcript_redacted;
      let transcriptRedacted: boolean | undefined;
      if (transcriptRedactedRaw !== undefined) {
        if (typeof transcriptRedactedRaw !== "boolean") {
          return reply.code(422).send({
            ok: false,
            code: "INVALID_FIELD",
            invalid_fields: ["transcript_redacted"],
          });
        }
        transcriptRedacted = transcriptRedactedRaw;
      }

      const transcriptRedactionReasonRaw = body.transcript_redaction_reason;
      let transcriptRedactionReason: VoiceRedactionReason | undefined;
      if (transcriptRedactionReasonRaw !== undefined) {
        if (transcriptRedactionReasonRaw === null) {
          transcriptRedactionReason = null;
        } else if (
          typeof transcriptRedactionReasonRaw === "string" &&
          VALID_REDACTION_REASONS.includes(
            transcriptRedactionReasonRaw as Exclude<
              VoiceRedactionReason,
              null
            >,
          )
        ) {
          transcriptRedactionReason =
            transcriptRedactionReasonRaw as VoiceRedactionReason;
        } else {
          return reply.code(422).send({
            ok: false,
            code: "INVALID_REDACTION_REASON",
            invalid_fields: ["transcript_redaction_reason"],
            valid_values: [...VALID_REDACTION_REASONS, null],
          });
        }
      }

      try {
        const envelope = await constructEnvelope({
          caller_entity_id: callerId,
          tenant_org_entity_id: orgEntityId,
          source_surface: sourceSurface,
          transcript_text: transcriptText,
          intent_class: intentClass as VoiceIntentClass,
          ...(transcriptRedacted !== undefined ? { transcript_redacted: transcriptRedacted } : {}),
          ...(transcriptRedactionReason !== undefined ? { transcript_redaction_reason: transcriptRedactionReason } : {}),
          ...(retentionClass !== undefined ? { retention_class: retentionClass } : {}),
        });

        // SAFE response: explicitly DOES NOT carry transcript_text,
        // transcript_redaction_reason details, or any internal
        // governance state beyond what the caller needs to render
        // the next UX state. CT renders the transcript locally;
        // the Foundation route only confirms construction.
        return reply.code(201).send({
          ok: true,
          intent_id: envelope.intent_id,
          audit_event_id: envelope.audit_event_id,
          source_surface: envelope.source_surface,
          intent_class: envelope.intent_class,
          confirmation_state: envelope.confirmation_state,
          approval_chain_state: envelope.approval_chain_state,
          transcript_redacted: envelope.transcript_redacted,
          retention_class: envelope.retention_class,
          created_at: envelope.created_at.toISOString(),
        });
      } catch (err) {
        // INTERNAL: audit write failure or unexpected error. The
        // RULE 4 enforcement at constructEnvelope means we get
        // here only if the audit chain itself rejected the write;
        // the envelope was NOT delivered. Fail closed with a
        // scrubbed message (never echo the original error text
        // because it may contain DB row data or chain prose).
        const message =
          err instanceof Error && typeof err.message === "string"
            ? err.message.slice(0, 120)
            : "voice intent construction failed";
        return reply.code(500).send({
          ok: false,
          code: "INTERNAL_ERROR",
          message,
        });
      }
    },
  );
}
