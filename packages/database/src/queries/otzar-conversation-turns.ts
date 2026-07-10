// FILE: queries/otzar-conversation-turns.ts
// PURPOSE: [OTZAR-CONTINUITY P5 Stage 1] Durable server-side conversation-turn
//          transcript API. Appends user/assistant turns idempotently with an
//          atomically-allocated, ownership-gated monotonic sequence, and lists them
//          for reference resolution ("what did we decide?", "the one David
//          mentioned", "send that") and cross-device restoration.
// IDENTITY (contract §Identity): every turn is tenant-scoped (org NON-NULL) and
//          separates subject (the human user whose private thread) from author (who
//          wrote the turn). No ambiguous actor; no visibility=ORG switch.
// SAFETY: SAFE natural-language content ONLY — never tokens, secrets, authorization
//          codes, raw provider bodies, or uncontrolled tool payloads (ADR-0057 §16).
//          Content is length-capped as a warehouse backstop.
// CONNECTS TO: otzar_conversation_turns table, otzar-threads.ts (scope gate + atomic
//          sequence), otzar.service.ts (conductSession persistence — later stage).

import { createHash } from "node:crypto";
import type { OtzarConversationTurn, Prisma } from "@prisma/client";
import { prisma } from "../client.js";
import {
  allocateTurnSequence,
  assertThreadScope,
  ThreadScopeError,
  type ThreadScope,
} from "./otzar-threads.js";

/** Max stored characters per turn — a backstop against a runaway warehouse. */
export const MAX_TURN_CONTENT_CHARS = 8000;

export type ConversationTurnRole = "USER" | "ASSISTANT" | "SYSTEM";
export type ConversationTurnChannel = "CHAT" | "VOICE" | "AMBIENT";

/** Same thread + same request_id but DIFFERENT content — a client bug or collision. */
export class IdempotencyConflictError extends Error {
  constructor() {
    super("otzar_turn_idempotency_conflict: request_id reused with different content");
    this.name = "IdempotencyConflictError";
  }
}

export interface AppendConversationTurnInput {
  conversation_id: string;
  /** Tenant — NON-NULL. */
  org_entity_id: string;
  /** The human user whose private thread this is. */
  subject_entity_id: string;
  /** Who authored: the subject (USER), the Twin (ASSISTANT), or a system entity. */
  author_entity_id: string;
  twin_entity_id?: string | null;
  role: ConversationTurnRole;
  content: string;
  request_id?: string | null;
  reply_to_turn_id?: string | null;
  action_ref?: string | null;
  supersedes_turn_id?: string | null;
  source_channel?: ConversationTurnChannel;
  model_provider?: string | null;
  retention_class?: string;
}

export interface AppendConversationTurnResult {
  turn_id: string;
  sequence: number;
  /** True when an existing turn was returned for a duplicate request_id (idempotent). */
  deduped: boolean;
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002";
}

function scopeOf(input: AppendConversationTurnInput): ThreadScope {
  return {
    org_entity_id: input.org_entity_id,
    subject_entity_id: input.subject_entity_id,
    ...(input.twin_entity_id != null ? { twin_entity_id: input.twin_entity_id } : {}),
  };
}

async function findByRequestId(
  conversationId: string,
  requestId: string,
): Promise<OtzarConversationTurn | null> {
  return prisma.otzarConversationTurn.findUnique({
    where: { conversation_id_request_id: { conversation_id: conversationId, request_id: requestId } },
  });
}

/**
 * Append a turn durably (contract §2–§5). Ownership-gated (the thread must exist and
 * belong to the caller's org+subject), idempotent on `request_id` (same content →
 * same row; different content → IdempotencyConflictError), and race-safe: the
 * monotonic `sequence` is allocated atomically from `OtzarConversation.turn_seq`, so
 * concurrent appends (two tabs/devices) get distinct gapless sequences with no retry.
 *
 * Persist the USER turn BEFORE model invocation; the ASSISTANT turn BEFORE the
 * response is considered durable. A response-lost retry with the same request_id
 * returns the persisted result rather than re-invoking the model.
 */
export async function appendConversationTurn(
  input: AppendConversationTurnInput,
): Promise<AppendConversationTurnResult> {
  const requestId = input.request_id ?? null;
  const content =
    input.content.length > MAX_TURN_CONTENT_CHARS
      ? input.content.slice(0, MAX_TURN_CONTENT_CHARS)
      : input.content;
  const contentHash = sha256(content);

  // Idempotency fast path: a prior identical request already landed.
  if (requestId !== null) {
    const existing = await findByRequestId(input.conversation_id, requestId);
    if (existing !== null) {
      if (existing.content_hash !== contentHash) throw new IdempotencyConflictError();
      return { turn_id: existing.turn_id, sequence: existing.sequence, deduped: true };
    }
  }

  // Atomically allocate the sequence AND enforce ownership: a missing/foreign/deleted
  // thread updates 0 rows → null → reject (no orphan turn by arbitrary UUID).
  const sequence = await allocateTurnSequence(input.conversation_id, scopeOf(input));
  if (sequence === null) throw new ThreadScopeError("thread_not_appendable");

  const data: Prisma.OtzarConversationTurnUncheckedCreateInput = {
    conversation_id: input.conversation_id,
    org_entity_id: input.org_entity_id,
    subject_entity_id: input.subject_entity_id,
    author_entity_id: input.author_entity_id,
    twin_entity_id: input.twin_entity_id ?? null,
    role: input.role,
    content,
    content_hash: contentHash,
    sequence,
    request_id: requestId,
    reply_to_turn_id: input.reply_to_turn_id ?? null,
    action_ref: input.action_ref ?? null,
    supersedes_turn_id: input.supersedes_turn_id ?? null,
    source_channel: input.source_channel ?? "CHAT",
    model_provider: input.model_provider ?? null,
    retention_class: input.retention_class ?? "STANDARD",
  };

  try {
    const row = await prisma.otzarConversationTurn.create({ data });
    return { turn_id: row.turn_id, sequence, deduped: false };
  } catch (e) {
    // A concurrent duplicate request_id raced the fast path → return the winner.
    if (isUniqueViolation(e) && requestId !== null) {
      const existing = await findByRequestId(input.conversation_id, requestId);
      if (existing !== null) {
        if (existing.content_hash !== contentHash) throw new IdempotencyConflictError();
        return { turn_id: existing.turn_id, sequence: existing.sequence, deduped: true };
      }
    }
    throw e;
  }
}

export interface ListConversationTurnsOptions {
  /** Most recent N turns (returned ascending). Default 50. */
  limit?: number;
  roles?: ConversationTurnRole[];
}

/**
 * List a thread's turns in ascending sequence order (oldest→newest), after validating
 * the caller's scope (contract §3) — a cross-org/cross-user/deleted thread throws
 * ThreadScopeError rather than leaking another tenant's turns.
 */
export async function listConversationTurns(
  conversationId: string,
  scope: ThreadScope,
  options: ListConversationTurnsOptions = {},
): Promise<OtzarConversationTurn[]> {
  await assertThreadScope(conversationId, scope);
  const where: Prisma.OtzarConversationTurnWhereInput = { conversation_id: conversationId };
  if (options.roles && options.roles.length > 0) where.role = { in: options.roles };
  if (options.limit != null) {
    const recent = await prisma.otzarConversationTurn.findMany({
      where,
      orderBy: { sequence: "desc" },
      take: options.limit,
    });
    return recent.reverse();
  }
  return prisma.otzarConversationTurn.findMany({ where, orderBy: { sequence: "asc" } });
}

/** The most recent turn for a thread (scope-validated), or null. */
export async function latestConversationTurn(
  conversationId: string,
  scope: ThreadScope,
): Promise<OtzarConversationTurn | null> {
  await assertThreadScope(conversationId, scope);
  return prisma.otzarConversationTurn.findFirst({
    where: { conversation_id: conversationId },
    orderBy: { sequence: "desc" },
  });
}
