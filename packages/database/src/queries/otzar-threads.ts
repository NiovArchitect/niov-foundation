// FILE: queries/otzar-threads.ts
// PURPOSE: [OTZAR-CONTINUITY P5 Stage 1] Typed conversation-thread lifecycle service
//          over OtzarConversation — the single owner of thread state transitions
//          (open/touch/archive/reopen/close/delete-eligible) and the structural
//          ownership gate every turn append/read passes through. No scattered
//          string updates.
// DOCTRINE (docs/otzar/OTZAR_CONTINUITY_SCHEMA_CONTRACT.md): entity_id is the
//          SUBJECT/owner human user; twin_id the participating Twin; org_entity_id
//          the tenant. status ∈ ACTIVE|ARCHIVED|CLOSED|DELETED.
// CONNECTS TO: otzar_conversations table, otzar-conversation-turns.ts (append/read
//          validate scope + allocate sequence here).

import type { OtzarConversation } from "@prisma/client";
import { prisma } from "../client.js";

export type ThreadStatus = "ACTIVE" | "ARCHIVED" | "CLOSED" | "DELETED";

export interface ThreadScope {
  org_entity_id: string;
  /** The human user whose private thread this is (OtzarConversation.entity_id). */
  subject_entity_id: string;
  /** The participating Twin, when the check is material. */
  twin_entity_id?: string | null;
}

/** Thrown when a thread does not exist, is deleted, or fails an ownership predicate. */
export class ThreadScopeError extends Error {
  constructor(public readonly reason: string) {
    super(`otzar_thread_scope_violation: ${reason}`);
    this.name = "ThreadScopeError";
  }
}

export interface CreateThreadInput {
  /** Optional server-authoritative id to bind (e.g. a continuity-minted thread). */
  conversation_id?: string;
  org_entity_id: string;
  subject_entity_id: string;
  twin_entity_id: string;
  timezone?: string | null;
  source_type?: "CHAT" | "VOICE" | "AMBIENT";
  retention_class?: string;
  participants?: string[];
}

/** Create a thread (or return the existing row when `conversation_id` already exists). */
export async function createThread(input: CreateThreadInput): Promise<OtzarConversation> {
  const data = {
    org_entity_id: input.org_entity_id,
    entity_id: input.subject_entity_id,
    twin_id: input.twin_entity_id,
    source_type: input.source_type ?? "CHAT",
    timezone: input.timezone ?? null,
    retention_class: input.retention_class ?? "STANDARD",
    participants: input.participants ?? [input.subject_entity_id, input.twin_entity_id],
    status: "ACTIVE",
    message_count: 1,
    last_active_at: new Date(),
  };
  if (typeof input.conversation_id === "string" && input.conversation_id.length > 0) {
    return prisma.otzarConversation.upsert({
      where: { conversation_id: input.conversation_id },
      update: { last_active_at: new Date() },
      create: { conversation_id: input.conversation_id, ...data },
    });
  }
  return prisma.otzarConversation.create({ data });
}

export async function getThread(conversationId: string): Promise<OtzarConversation | null> {
  return prisma.otzarConversation.findUnique({ where: { conversation_id: conversationId } });
}

/**
 * Structural ownership gate (contract §3). Verifies the thread exists, belongs to the
 * expected org, is owned by the expected subject, matches the Twin (when supplied),
 * and is not DELETED. Returns the row or throws ThreadScopeError. Never silently
 * reads another tenant's/user's thread.
 */
export async function assertThreadScope(
  conversationId: string,
  scope: ThreadScope,
): Promise<OtzarConversation> {
  const t = await getThread(conversationId);
  if (t === null) throw new ThreadScopeError("thread_not_found");
  if (t.deleted_at !== null || t.status === "DELETED") throw new ThreadScopeError("thread_deleted");
  // org is enforced when the thread carries one (legacy rows may be null-org).
  if (t.org_entity_id !== null && t.org_entity_id !== scope.org_entity_id) {
    throw new ThreadScopeError("cross_org");
  }
  if (t.entity_id !== scope.subject_entity_id && !t.participants.includes(scope.subject_entity_id)) {
    throw new ThreadScopeError("cross_subject");
  }
  if (scope.twin_entity_id != null && t.twin_id !== scope.twin_entity_id) {
    throw new ThreadScopeError("cross_twin");
  }
  return t;
}

async function transition(
  conversationId: string,
  scope: ThreadScope,
  data: Record<string, unknown>,
): Promise<OtzarConversation> {
  await assertThreadScope(conversationId, scope);
  return prisma.otzarConversation.update({ where: { conversation_id: conversationId }, data });
}

export const touchThread = (id: string, scope: ThreadScope) =>
  transition(id, scope, { last_active_at: new Date() });
export const archiveThread = (id: string, scope: ThreadScope) =>
  transition(id, scope, { status: "ARCHIVED", archived_at: new Date() });
export const reopenThread = (id: string, scope: ThreadScope) =>
  transition(id, scope, { status: "ACTIVE", archived_at: null, closed_at: null });
export const closeThread = (id: string, scope: ThreadScope) =>
  transition(id, scope, { status: "CLOSED", closed_at: new Date() });

/**
 * Delete-eligible: mark the thread DELETED and redact its turn content (tombstone),
 * keeping rows for sequence/action/audit lineage (contract §10). Action/audit proof
 * and promoted org truth are NOT touched.
 */
export async function markThreadDeleted(id: string, scope: ThreadScope): Promise<void> {
  await assertThreadScope(id, scope);
  await prisma.$transaction([
    prisma.otzarConversationTurn.updateMany({
      where: { conversation_id: id },
      data: { content: "", retention_class: "REDACTED" },
    }),
    prisma.otzarConversation.update({
      where: { conversation_id: id },
      data: { status: "DELETED", deleted_at: new Date() },
    }),
  ]);
}

/**
 * Atomically allocate the next per-thread turn sequence (contract §5, Option B).
 * The UPDATE ... RETURNING is collision-free and requires the thread row to exist
 * AND pass the ownership predicates — a missing/foreign/deleted thread updates 0
 * rows and yields null (→ caller rejects). Also refreshes last_active_at.
 */
export async function allocateTurnSequence(
  conversationId: string,
  scope: ThreadScope,
): Promise<number | null> {
  const rows = await prisma.$queryRaw<Array<{ turn_seq: number }>>`
    UPDATE otzar_conversations
       SET turn_seq = turn_seq + 1, last_active_at = now()
     WHERE conversation_id = ${conversationId}::uuid
       AND (org_entity_id IS NULL OR org_entity_id = ${scope.org_entity_id}::uuid)
       AND (entity_id = ${scope.subject_entity_id}::uuid OR ${scope.subject_entity_id} = ANY(participants))
       AND status <> 'DELETED'
       AND deleted_at IS NULL
    RETURNING turn_seq`;
  return rows.length === 1 ? rows[0]!.turn_seq : null;
}
