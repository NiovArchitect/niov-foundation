// FILE: action-payload-validators.ts
// PURPOSE: Per-ActionType create-time payload validators. The route
//          validator (validateCreateActionBody) checks the body shape
//          (UNKNOWN_FIELD / INVALID_FIELD). This module then dispatches
//          on action_type to validate the action-type-specific
//          payload_redacted contract so that no malformed Action ever
//          enters the executor queue. Pure functions; no DB; no I/O.
// CONNECTS TO:
//   - apps/api/src/services/action/action.service.ts
//     (validateCreateActionBody calls validatePayloadForActionType after
//      the shape check)
//   - apps/api/src/services/cosmp/write.service.ts
//     (the RECORD_CAPSULE validator unpacks payload_redacted into the
//      CapsuleCreateInput shape; the executor's RECORD_CAPSULE handler
//      then re-uses the same validator output to call
//      createCapsuleForActionRunner with a clean, typed input)
//   - ADR-0057 §9 (route-tier validation discipline)
//   - ADR-0021 (deliberate-blocker per-type validator pattern;
//     adding a new ActionType requires updating this map)
//
// PRINCIPLE:
//   The create-time validator is the FIRST defensive boundary —
//   reject malformed payloads with 422 INVALID_FIELD at create-time so
//   the executor never has to retry a structurally-bad Action through
//   the full retry budget before terminalizing FAILED. The validator
//   is ALSO the canonical "unpacker" — its normalized output is the
//   typed shape the handler reuses at execute-time (single source of
//   truth for the payload contract).

import type { ActionType, CapsuleType, DecayType, StorageTier } from "@prisma/client";

// WHAT: Discriminated-union result returned by every per-type
//        payload validator.
// INPUT: Used as a return type.
// OUTPUT: None.
// WHY: One shape so the dispatcher composes uniformly. The
//      `invalid_fields` array, when present, joins the
//      action-service-tier invalid_fields list and surfaces as
//      422 INVALID_FIELD at the route.
export type ActionPayloadValidationResult<TNormalized> =
  | { ok: true; normalized: TNormalized }
  | { ok: false; invalid_fields: string[] };

// WHAT: The typed normalized shape returned by the RECORD_CAPSULE
//        validator. Mirrors the COSMP CapsuleCreateInput contract
//        at apps/api/src/services/cosmp/write.service.ts:54 with the
//        same field semantics. Only the required-field-set is enforced
//        at this validator; optional fields pass through as-is.
// INPUT: Used as a return type.
// OUTPUT: None.
// WHY: The handler at execute-time receives this typed shape so it
//      can call WriteService.createCapsuleForActionRunner without
//      re-parsing the raw payload_redacted JSON.
export interface RecordCapsulePayload {
  capsule_type: CapsuleType;
  topic_tags: string[];
  payload_summary: string;
  content: string;

  decay_type?: DecayType;
  decay_rate?: number;
  storage_tier?: StorageTier;
  clearance_required?: number;
  connected_capsule_ids?: string[];
  connected_entity_ids?: string[];
  monetization_enabled?: boolean;
  monetization_category?: string | null;
  expires_at?: Date | null;
  ai_access_blocked?: boolean;
  requires_validation?: boolean;
  write_reason?: string;
}

// WHAT: Canonical CapsuleType values per the Prisma enum
//        (packages/database/prisma/schema.prisma). Centralized as a
//        runtime Set so the validator can reject unknown enum values
//        without leaking the full enum back to the caller.
// INPUT: None.
// OUTPUT: A frozen Set.
// WHY: The Prisma enum is the source of truth; this Set mirrors it
//      at the validator boundary. When the Prisma enum extends, this
//      Set must extend too (ADR-0021 deliberate-blocker pattern at
//      the service tier — exhaustiveness gap is intentional and
//      surfaces via failing tests if the new type is exercised).
const VALID_CAPSULE_TYPES: ReadonlySet<string> = new Set<string>([
  "FOUNDATIONAL",
  "PREFERENCE",
  "RELATIONSHIP",
  "DOMAIN_KNOWLEDGE",
  "BEHAVIORAL_PATTERN",
  "IDENTITY",
  "DEVICE_DATA",
  "SESSION_LEARNING",
  "COMPLIANCE_RECORD",
  "CONVERSATION_LEARNING",
  "TASK_LEARNING",
  "WORK_PATTERN",
  "COMMUNICATION_PREF",
  "DELIBERATE_CAPTURE",
  "DOMAIN_PRACTICE",
  "CORRECTION",
  "INTELLIGENCE_PATTERN",
  "AGENT_TEMPLATE",
  "SKILL_PACKAGE",
  "DIGITAL_ARTIFACT",
]);

const VALID_DECAY_TYPES: ReadonlySet<string> = new Set<string>([
  "TIME_BASED",
  "USE_BASED",
  "EVENT_BASED",
  "FOUNDATIONAL",
  "RELATIONAL",
]);

const VALID_STORAGE_TIERS: ReadonlySet<string> = new Set<string>([
  "HOT",
  "WARM",
  "COLD",
]);

// WHAT: Maximum bytes the `content` field may carry at create-time.
//        Mirrors the audit-row size discipline; keeps a runaway
//        client payload from inflating the queue.
// INPUT: None.
// OUTPUT: The number 256 * 1024 (256 KiB).
// WHY: Centralized so future tuning is a single edit. The constant
//      is the SOFT cap at the validator boundary; the storage layer
//      may enforce stricter limits.
export const RECORD_CAPSULE_MAX_CONTENT_BYTES = 256 * 1024;

// WHAT: Validate a RECORD_CAPSULE payload at create-time.
// INPUT: The raw payload_redacted value as supplied by the caller.
// OUTPUT: { ok: true, normalized: RecordCapsulePayload } |
//         { ok: false, invalid_fields: string[] }.
// WHY: Locked at create-time so the executor handler never sees a
//      structurally-malformed payload. The normalized shape feeds
//      directly into WriteService.createCapsuleForActionRunner at
//      execute-time.
export function validateRecordCapsulePayload(
  payload: unknown,
): ActionPayloadValidationResult<RecordCapsulePayload> {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, invalid_fields: ["payload_redacted"] };
  }
  const obj = payload as Record<string, unknown>;
  const invalid: string[] = [];

  const capsule_type = obj.capsule_type;
  if (typeof capsule_type !== "string" || !VALID_CAPSULE_TYPES.has(capsule_type)) {
    invalid.push("payload_redacted.capsule_type");
  }

  const topic_tags = obj.topic_tags;
  if (
    !Array.isArray(topic_tags) ||
    topic_tags.length < 1 ||
    !topic_tags.every((t) => typeof t === "string" && t.length > 0)
  ) {
    invalid.push("payload_redacted.topic_tags");
  }

  const payload_summary = obj.payload_summary;
  if (typeof payload_summary !== "string" || payload_summary.length === 0) {
    invalid.push("payload_redacted.payload_summary");
  }

  const content = obj.content;
  if (typeof content !== "string" || content.length === 0) {
    invalid.push("payload_redacted.content");
  } else if (Buffer.byteLength(content, "utf8") > RECORD_CAPSULE_MAX_CONTENT_BYTES) {
    invalid.push("payload_redacted.content");
  }

  // Optional fields — validated only when present.
  if (obj.decay_type !== undefined) {
    if (typeof obj.decay_type !== "string" || !VALID_DECAY_TYPES.has(obj.decay_type)) {
      invalid.push("payload_redacted.decay_type");
    }
  }
  if (obj.decay_rate !== undefined) {
    if (
      typeof obj.decay_rate !== "number" ||
      !Number.isFinite(obj.decay_rate) ||
      obj.decay_rate < 0 ||
      obj.decay_rate > 1
    ) {
      invalid.push("payload_redacted.decay_rate");
    }
  }
  if (obj.storage_tier !== undefined) {
    if (
      typeof obj.storage_tier !== "string" ||
      !VALID_STORAGE_TIERS.has(obj.storage_tier)
    ) {
      invalid.push("payload_redacted.storage_tier");
    }
  }
  if (obj.clearance_required !== undefined) {
    if (
      typeof obj.clearance_required !== "number" ||
      !Number.isInteger(obj.clearance_required) ||
      obj.clearance_required < 0
    ) {
      invalid.push("payload_redacted.clearance_required");
    }
  }
  if (obj.connected_capsule_ids !== undefined) {
    if (
      !Array.isArray(obj.connected_capsule_ids) ||
      !obj.connected_capsule_ids.every((v) => typeof v === "string")
    ) {
      invalid.push("payload_redacted.connected_capsule_ids");
    }
  }
  if (obj.connected_entity_ids !== undefined) {
    if (
      !Array.isArray(obj.connected_entity_ids) ||
      !obj.connected_entity_ids.every((v) => typeof v === "string")
    ) {
      invalid.push("payload_redacted.connected_entity_ids");
    }
  }
  if (
    obj.monetization_enabled !== undefined &&
    typeof obj.monetization_enabled !== "boolean"
  ) {
    invalid.push("payload_redacted.monetization_enabled");
  }
  if (
    obj.monetization_category !== undefined &&
    obj.monetization_category !== null &&
    typeof obj.monetization_category !== "string"
  ) {
    invalid.push("payload_redacted.monetization_category");
  }
  if (obj.expires_at !== undefined && obj.expires_at !== null) {
    if (typeof obj.expires_at !== "string") {
      invalid.push("payload_redacted.expires_at");
    } else {
      const d = new Date(obj.expires_at);
      if (Number.isNaN(d.getTime())) {
        invalid.push("payload_redacted.expires_at");
      }
    }
  }
  if (
    obj.ai_access_blocked !== undefined &&
    typeof obj.ai_access_blocked !== "boolean"
  ) {
    invalid.push("payload_redacted.ai_access_blocked");
  }
  if (
    obj.requires_validation !== undefined &&
    typeof obj.requires_validation !== "boolean"
  ) {
    invalid.push("payload_redacted.requires_validation");
  }
  if (obj.write_reason !== undefined) {
    if (typeof obj.write_reason !== "string" || obj.write_reason.length > 500) {
      invalid.push("payload_redacted.write_reason");
    }
  }

  if (invalid.length > 0) {
    return { ok: false, invalid_fields: invalid };
  }

  const normalized: RecordCapsulePayload = {
    capsule_type: obj.capsule_type as CapsuleType,
    topic_tags: obj.topic_tags as string[],
    payload_summary: obj.payload_summary as string,
    content: obj.content as string,
  };
  if (obj.decay_type !== undefined) normalized.decay_type = obj.decay_type as DecayType;
  if (obj.decay_rate !== undefined) normalized.decay_rate = obj.decay_rate as number;
  if (obj.storage_tier !== undefined) {
    normalized.storage_tier = obj.storage_tier as StorageTier;
  }
  if (obj.clearance_required !== undefined) {
    normalized.clearance_required = obj.clearance_required as number;
  }
  if (obj.connected_capsule_ids !== undefined) {
    normalized.connected_capsule_ids = obj.connected_capsule_ids as string[];
  }
  if (obj.connected_entity_ids !== undefined) {
    normalized.connected_entity_ids = obj.connected_entity_ids as string[];
  }
  if (obj.monetization_enabled !== undefined) {
    normalized.monetization_enabled = obj.monetization_enabled as boolean;
  }
  if (obj.monetization_category !== undefined) {
    normalized.monetization_category = obj.monetization_category as string | null;
  }
  if (obj.expires_at !== undefined) {
    normalized.expires_at =
      obj.expires_at === null ? null : new Date(obj.expires_at as string);
  }
  if (obj.ai_access_blocked !== undefined) {
    normalized.ai_access_blocked = obj.ai_access_blocked as boolean;
  }
  if (obj.requires_validation !== undefined) {
    normalized.requires_validation = obj.requires_validation as boolean;
  }
  if (obj.write_reason !== undefined) {
    normalized.write_reason = obj.write_reason as string;
  }
  return { ok: true, normalized };
}

// WHAT: No-op validator placeholder for ActionTypes whose real handler
//        has not yet landed. Accepts any object-shaped payload (the
//        route validator already rejected non-object payloads).
// INPUT: The payload_redacted value.
// OUTPUT: ok:true with an empty normalized record.
// WHY: Preserves the current stub-handler contract for
//      SEND_INTERNAL_NOTIFICATION and PROPOSE_PERMISSION_GRANT while
//      RECORD_CAPSULE becomes the first real handler. When a future
//      slice lands a real handler, the placeholder is replaced with a
//      type-specific validator and the deliberate-blocker pattern
//      catches any mismatch at TypeScript exhaustiveness check time.
export function validateStubPayload(
  _payload: unknown,
): ActionPayloadValidationResult<Record<string, never>> {
  return { ok: true, normalized: {} };
}

// WHAT: Per-ActionType validator dispatcher. Called from
//        validateCreateActionBody after the route-shape check
//        passes.
// INPUT: action_type + the raw payload_redacted value.
// OUTPUT: { ok: true } | { ok: false, invalid_fields }.
// WHY: One entry point so the action service stays thin. The
//      dispatcher returns a SHAPE-erased result; the typed
//      normalized output is recovered at execute-time by the
//      type-specific handler calling its validator directly.
export function validatePayloadForActionType(
  action_type: ActionType | string,
  payload: unknown,
): { ok: true } | { ok: false; invalid_fields: string[] } {
  switch (action_type) {
    case "RECORD_CAPSULE": {
      const r = validateRecordCapsulePayload(payload);
      return r.ok ? { ok: true } : { ok: false, invalid_fields: r.invalid_fields };
    }
    case "SEND_INTERNAL_NOTIFICATION":
    case "PROPOSE_PERMISSION_GRANT": {
      const r = validateStubPayload(payload);
      return r.ok ? { ok: true } : { ok: false, invalid_fields: r.invalid_fields };
    }
    default:
      // Unknown action_type — defensive; the route validator would
      // have already rejected this before we got here.
      return { ok: false, invalid_fields: ["action_type"] };
  }
}
