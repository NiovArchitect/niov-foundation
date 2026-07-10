// FILE: queries/otzar-conversation-turns.ts
// PURPOSE: [OTZAR-CONTINUITY P5A] Durable server-side conversation-turn transcript
//          API. Appends user/assistant turns idempotently with a monotonic
//          per-thread sequence, and lists them for reference resolution
//          ("what did we decide?", "the one David mentioned") and cross-device
//          restoration. The OtzarConversation shell holds counters/lifecycle;
//          these rows hold turn CONTENT.
// SAFETY: SAFE natural-language content ONLY — callers must never pass tokens,
//         secrets, authorization codes, raw provider bodies, or uncontrolled tool
//         payloads (ADR-0057 §16). Content is length-capped here as a backstop
//         against an unbounded transcript warehouse.
// CONNECTS TO: otzar_conversation_turns table (schema.prisma),
//              OtzarConversation (thread shell), otzar.service.ts (conductSession
//              persistence — P5A wiring lands next), calendar-continuity.service.ts
//              (action_ref → WorkLedgerEntry proposals).

import type { OtzarConversationTurn, Prisma } from "@prisma/client";
import { prisma } from "../client.js";

/** Max stored characters per turn — a backstop against a runaway warehouse. */
export const MAX_TURN_CONTENT_CHARS = 8000;

export type ConversationTurnRole = "USER" | "ASSISTANT" | "SYSTEM";
export type ConversationTurnChannel = "CHAT" | "VOICE" | "AMBIENT";
export type ConversationTurnVisibility = "PRIVATE" | "ORG";

export interface AppendConversationTurnInput {
  conversation_id: string;
  actor_entity_id: string;
  role: ConversationTurnRole;
  content: string;
  /** Exact org for isolation (P5B). Null only for orgless/legacy callers. */
  org_entity_id?: string | null;
  /** Client idempotency key — a repeated (thread, request_id) returns the same turn. */
  request_id?: string | null;
  reply_to_turn_id?: string | null;
  /** WorkLedgerEntry (proposal/action) this turn concerns. */
  action_ref?: string | null;
  /** Correction/supersession lineage. */
  supersedes_turn_id?: string | null;
  source_channel?: ConversationTurnChannel;
  model_provider?: string | null;
  retention_class?: string;
  visibility?: ConversationTurnVisibility;
}

export interface AppendConversationTurnResult {
  turn_id: string;
  sequence: number;
  /** True when an existing turn was returned for a duplicate request_id (idempotent). */
  deduped: boolean;
}

function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    (e as { code?: unknown }).code === "P2002"
  );
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
 * Append a turn durably. Idempotent on `request_id` (a retried request resolves
 * to the same row) and safe under concurrency: the monotonic `sequence` is
 * guarded by a unique index, so two racing appends never collide — the loser
 * recomputes and retries. Returns the persisted turn's id + sequence.
 *
 * Persist the USER turn BEFORE model invocation; persist the ASSISTANT turn
 * BEFORE the response is considered durable. A duplicate request, a retry, a
 * lost-delivery re-send, or two tabs/devices all converge on one stored turn.
 */
export async function appendConversationTurn(
  input: AppendConversationTurnInput,
): Promise<AppendConversationTurnResult> {
  const requestId = input.request_id ?? null;

  // Fast path: a prior identical request already landed.
  if (requestId !== null) {
    const existing = await findByRequestId(input.conversation_id, requestId);
    if (existing !== null) {
      return { turn_id: existing.turn_id, sequence: existing.sequence, deduped: true };
    }
  }

  const content =
    input.content.length > MAX_TURN_CONTENT_CHARS
      ? input.content.slice(0, MAX_TURN_CONTENT_CHARS)
      : input.content;

  const base: Prisma.OtzarConversationTurnUncheckedCreateInput = {
    conversation_id: input.conversation_id,
    org_entity_id: input.org_entity_id ?? null,
    actor_entity_id: input.actor_entity_id,
    role: input.role,
    content,
    sequence: 0, // set per attempt below
    request_id: requestId,
    reply_to_turn_id: input.reply_to_turn_id ?? null,
    action_ref: input.action_ref ?? null,
    supersedes_turn_id: input.supersedes_turn_id ?? null,
    source_channel: input.source_channel ?? "CHAT",
    model_provider: input.model_provider ?? null,
    retention_class: input.retention_class ?? "STANDARD",
    visibility: input.visibility ?? "PRIVATE",
  };

  // Allocate the monotonic sequence under a per-thread transaction advisory lock,
  // so concurrent appends (two tabs, two devices) serialize per thread with zero
  // sequence collisions and no read-max/retry storm. The lock is keyed on the
  // thread uuid and auto-releases at transaction end. Turns within one thread are
  // inherently sequential, so per-thread serialization is the correct granularity.
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.conversation_id}))`;
      const agg = await tx.otzarConversationTurn.aggregate({
        _max: { sequence: true },
        where: { conversation_id: input.conversation_id },
      });
      const sequence = (agg._max.sequence ?? 0) + 1;
      const row = await tx.otzarConversationTurn.create({ data: { ...base, sequence } });
      return { turn_id: row.turn_id, sequence, deduped: false };
    });
  } catch (e) {
    // The only expected clash under the lock is a concurrent duplicate request_id
    // (checked pre-lock above but two identical requests can race the fast path).
    if (isUniqueViolation(e) && requestId !== null) {
      const existing = await findByRequestId(input.conversation_id, requestId);
      if (existing !== null) {
        return { turn_id: existing.turn_id, sequence: existing.sequence, deduped: true };
      }
    }
    throw e;
  }
}

export interface ListConversationTurnsOptions {
  /** Scope to an exact org (P5B isolation). */
  org_entity_id?: string | null;
  /** Most recent N turns (returned in ascending sequence order). Default 50. */
  limit?: number;
  /** Exclude SYSTEM turns from the reference window. */
  roles?: ConversationTurnRole[];
}

/**
 * List a thread's turns in ascending sequence order (oldest→newest). When
 * `limit` is set, returns the most recent N (still ascending). Org-scoped when
 * `org_entity_id` is provided — a cross-org read returns nothing.
 */
export async function listConversationTurns(
  conversationId: string,
  options: ListConversationTurnsOptions = {},
): Promise<OtzarConversationTurn[]> {
  const where: Prisma.OtzarConversationTurnWhereInput = { conversation_id: conversationId };
  if (options.org_entity_id != null) where.org_entity_id = options.org_entity_id;
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

/** The most recent turn for a thread, or null. */
export async function latestConversationTurn(
  conversationId: string,
  options: { org_entity_id?: string | null } = {},
): Promise<OtzarConversationTurn | null> {
  const where: Prisma.OtzarConversationTurnWhereInput = { conversation_id: conversationId };
  if (options.org_entity_id != null) where.org_entity_id = options.org_entity_id;
  return prisma.otzarConversationTurn.findFirst({ where, orderBy: { sequence: "desc" } });
}
