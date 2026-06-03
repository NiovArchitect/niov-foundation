// FILE: voice-memory-scope.service.ts
// PURPOSE: DMW Runtime DM2-A per ADR-0092 §4 Candidate B (Scoped
//          Voice Memory Gate). Closes the "DMW scope integration"
//          gap from the Founder's voice-runtime authorized list
//          per ADR-0085 §5 + ADR-0089 §5.
//
//          The scope is per-(conversation_id, entity_id) and
//          binds what CapsuleType classes a voice (or other
//          governed session) flow may read from. context_signals_
//          only=true (the default) restricts the consumer to the
//          working-set governed signal projection per ADR-0048
//          rather than raw capsule content per ADR-0079 Layer
//          1-4 architecture.
//
//          The scope is mutable: subsequent declareConversation
//          MemoryScopeForCaller calls upsert the row in-place,
//          honoring RULE 10 (row preserved across changes; never
//          deleted). Each declaration emits CONVERSATION_MEMORY_
//          SCOPE_DECLARED audit per RULE 4.
//
//          VoiceAccessLog model is deferred to a follow-up DMW
//          DM2-B slice; V1 covers the scope-declaration register
//          only.
//
// CONNECTS TO:
//   - packages/database (prisma.conversationMemoryScope +
//     writeAuditEvent for CONVERSATION_MEMORY_SCOPE_DECLARED)
//   - ADR-0092 §4 Candidate B Scoped Voice Memory Gate
//   - ADR-0092 §2 7 inviolable bans (V1 scope substrate ban set)
//   - ADR-0048 working-set provenance + context_signals_only
//     mode
//   - ADR-0079 retention class + Layer 1-4 architecture
//   - ADR-0085 §5 VoiceIntentEnvelope
//   - ADR-0089 §5 VoiceProviderAdapter

import { prisma, writeAuditEvent } from "@niov/database";
import type { AccessScope } from "@prisma/client";

// WHAT: The closed-vocab CapsuleType allowlist that V1 voice
//        memory scopes may include. Future per-consumer slices
//        MAY extend via ADR amendment + RULE 20.
// INPUT: Used as a value namespace.
// OUTPUT: None.
// WHY: Defense-in-depth at the scope-declaration tier. Any
//      capsule_type outside the V1 allowlist is rejected at
//      validation; the consumer must explicitly authorize
//      extension via Founder per-slice authorization.
export const VOICE_SCOPE_ALLOWED_CAPSULE_TYPES: ReadonlySet<string> = new Set([
  "FOUNDATIONAL",
  "PREFERENCE",
  "RELATIONSHIP",
  "DOMAIN_KNOWLEDGE",
  "BEHAVIORAL_PATTERN",
  "IDENTITY",
  "CONVERSATION_LEARNING",
  "TASK_LEARNING",
  "WORK_PATTERN",
  "COMMUNICATION_PREF",
  "CORRECTION",
  "INTELLIGENCE_PATTERN",
  "DIGITAL_ARTIFACT",
]);

export type ConversationMemoryScopeSummary = {
  conversation_id: string;
  entity_id: string;
  access_scope: AccessScope;
  capsule_types: string[];
  context_signals_only: boolean;
  expires_at: Date | null;
  declared_by: string;
  created_at: Date;
  updated_at: Date;
};

export type DeclareConversationMemoryScopeInput = {
  conversation_id: string;
  entity_id: string;
  declared_by: string;
  access_scope?: AccessScope;
  capsule_types?: ReadonlyArray<string>;
  context_signals_only?: boolean;
  expires_at?: Date | null;
};

export type DeclareConversationMemoryScopeResult =
  | { ok: true; scope: ConversationMemoryScopeSummary }
  | {
      ok: false;
      code: "INVALID_FIELD";
      httpStatus: 422;
      invalid_fields: string[];
    };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_ACCESS_SCOPES: ReadonlySet<string> = new Set([
  "METADATA_ONLY",
  "SUMMARY",
  "FULL",
]);

function project(
  row: NonNullable<
    Awaited<ReturnType<typeof prisma.conversationMemoryScope.findUnique>>
  >,
): ConversationMemoryScopeSummary {
  return {
    conversation_id: row.conversation_id,
    entity_id: row.entity_id,
    access_scope: row.access_scope,
    capsule_types: row.capsule_types,
    context_signals_only: row.context_signals_only,
    expires_at: row.expires_at,
    declared_by: row.declared_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// WHAT: Declare (or update) a memory scope for a (conversation,
//        entity) tuple.
// INPUT: conversation_id + entity_id + declared_by + optional
//        access_scope (default METADATA_ONLY) + optional
//        capsule_types[] (default []) + optional context_signals_
//        only (default true) + optional expires_at.
// OUTPUT: DeclareConversationMemoryScopeResult.
// WHY: ADR-0092 §4 Candidate B canonical write helper. The
//      method is idempotent at the row tier (upsert) but each
//      declaration emits CONVERSATION_MEMORY_SCOPE_DECLARED so
//      the audit chain captures every change. Returns 422
//      INVALID_FIELD if validation fails; no row change or
//      audit emission on failure.
export async function declareConversationMemoryScopeForCaller(
  input: DeclareConversationMemoryScopeInput,
): Promise<DeclareConversationMemoryScopeResult> {
  const invalid: string[] = [];
  if (!UUID_RE.test(input.conversation_id)) invalid.push("conversation_id");
  if (!UUID_RE.test(input.entity_id)) invalid.push("entity_id");
  if (!UUID_RE.test(input.declared_by)) invalid.push("declared_by");
  if (
    input.access_scope !== undefined &&
    !VALID_ACCESS_SCOPES.has(input.access_scope)
  ) {
    invalid.push("access_scope");
  }
  if (input.capsule_types !== undefined) {
    for (const t of input.capsule_types) {
      if (!VOICE_SCOPE_ALLOWED_CAPSULE_TYPES.has(t)) {
        invalid.push("capsule_types");
        break;
      }
    }
  }
  if (
    input.expires_at !== undefined &&
    input.expires_at !== null &&
    input.expires_at <= new Date()
  ) {
    invalid.push("expires_at");
  }
  if (invalid.length > 0) {
    return {
      ok: false,
      code: "INVALID_FIELD",
      httpStatus: 422,
      invalid_fields: invalid,
    };
  }
  const access_scope: AccessScope = input.access_scope ?? "METADATA_ONLY";
  const capsule_types = input.capsule_types ? [...input.capsule_types] : [];
  const context_signals_only =
    input.context_signals_only === undefined
      ? true
      : input.context_signals_only;
  const expires_at = input.expires_at ?? null;
  const row = await prisma.conversationMemoryScope.upsert({
    where: {
      conversation_id_entity_id: {
        conversation_id: input.conversation_id,
        entity_id: input.entity_id,
      },
    },
    update: {
      access_scope,
      capsule_types,
      context_signals_only,
      expires_at,
      declared_by: input.declared_by,
    },
    create: {
      conversation_id: input.conversation_id,
      entity_id: input.entity_id,
      access_scope,
      capsule_types,
      context_signals_only,
      expires_at,
      declared_by: input.declared_by,
    },
  });
  await writeAuditEvent({
    event_type: "CONVERSATION_MEMORY_SCOPE_DECLARED",
    outcome: "SUCCESS",
    actor_entity_id: input.declared_by,
    target_entity_id: input.entity_id,
    details: {
      conversation_id: row.conversation_id,
      entity_id: row.entity_id,
      access_scope: row.access_scope,
      capsule_types: [...row.capsule_types],
      context_signals_only: row.context_signals_only,
      expires_at: row.expires_at?.toISOString() ?? null,
      declared_by: row.declared_by,
    },
  });
  return { ok: true, scope: project(row) };
}

// WHAT: Look up the memory scope for a (conversation, entity)
//        tuple.
// INPUT: conversation_id + entity_id.
// OUTPUT: A ConversationMemoryScopeSummary or null.
// WHY: Pure read; no audit emission. Voice intent processing
//      callers query this before deciding what capsule classes
//      to consult.
export async function getConversationMemoryScope(
  conversation_id: string,
  entity_id: string,
): Promise<ConversationMemoryScopeSummary | null> {
  if (!UUID_RE.test(conversation_id) || !UUID_RE.test(entity_id)) {
    return null;
  }
  const row = await prisma.conversationMemoryScope.findUnique({
    where: {
      conversation_id_entity_id: { conversation_id, entity_id },
    },
  });
  return row === null ? null : project(row);
}

// WHAT: Is this scope still in force at the given instant?
// INPUT: A ConversationMemoryScopeSummary + an Instant (default
//        now).
// OUTPUT: true if not expired; false if expires_at is in the
//         past.
// WHY: Pure decision function. Consumers call this BEFORE
//      consulting a scope so an expired scope does not silently
//      authorize reads. Returns true when expires_at is null
//      (scope is open-ended).
export function isScopeActive(
  scope: ConversationMemoryScopeSummary,
  now: Date = new Date(),
): boolean {
  if (scope.expires_at === null) return true;
  return scope.expires_at > now;
}
