// FILE: queries/otzar-thread-restoration.ts
// PURPOSE: [OTZAR-CONTINUITY C6] The ONE canonical, scope-gated read layer for server
//          thread restoration over the durable model (otzar_conversations +
//          otzar_conversation_turns + otzar_conversation_requests). Every query REQUIRES
//          the caller's (org, subject) scope — NEVER keyed on conversation_id alone — so a
//          foreign or deleted thread is indistinguishable from "not found" (no disclosure).
// SAFETY: returns SAFE projections only — never lease tokens, provider tokens, sealed
//          payloads, raw errors, or unrestricted action internals (ADR-0057 §16).
// CONNECTS TO: otzar.service.ts (restoration read endpoints), CT login/refresh restore.

import { prisma } from "../client.js";
import { listConversationTurns } from "./otzar-conversation-turns.js";

/** Caller scope for every restoration read. [C6/F] Twin is REQUIRED — distinct human–Twin
 *  relationship threads must never blend into one restoration. */
export interface RestoreScope {
  org_entity_id: string;
  subject_entity_id: string;
  twin_entity_id: string;
}

/** Safe, bounded thread summary. No transcript bodies, no internal refs. */
export interface ThreadSummary {
  conversation_id: string;
  twin_entity_id: string;
  status: string;
  timezone: string | null;
  source_type: string;
  started_at: Date;
  last_active_at: Date | null;
  message_count: number;
  archived: boolean;
  /** Count of the caller's non-terminal requests (RECEIVED/PROCESSING/FAILED_RETRYABLE)
   *  or awaiting-confirmation results — a truthful "needs attention" signal. */
  unresolved_count: number;
}

/** Safe turn projection for restoration (bounded content, no hashes/internal ids). */
export interface SafeTurn {
  turn_id: string;
  role: string;
  content: string;
  sequence: number;
  source_channel: string;
  created_at: Date;
}

/** Safe request-status projection. NEVER lease/provider tokens or raw action internals. */
export interface SafeRequestStatus {
  request_record_id: string;
  conversation_id: string;
  client_request_id: string | null;
  state: string;
  response_class: string | null;
  has_canonical_result: boolean;
  has_action: boolean;
  in_progress: boolean;
  retryable: boolean;
  /** The failure code when FAILED_RETRYABLE/FAILED_FINAL, for a safe CT retry affordance. */
  failure_code: string | null;
  canonical_assistant_turn_id: string | null;
  /** The canonical assistant reply text when COMPLETED (safe natural language only). */
  canonical_text: string | null;
  created_at: Date;
  completed_at: Date | null;
}

const REQUEST_STATUS_SELECT = {
  request_record_id: true, conversation_id: true, client_request_id: true, state: true,
  response_class: true, canonical_assistant_turn_id: true, action_ref: true,
  failure_code: true, created_at: true, completed_at: true,
  // [C] the request scope + its durable USER turn — needed to VALIDATE the canonical turn
  // relationship before exposing any text (never a second unscoped lookup).
  user_turn_id: true, org_entity_id: true, subject_entity_id: true, twin_entity_id: true,
} as const;

type RequestStatusRow = {
  request_record_id: string; conversation_id: string; client_request_id: string | null;
  state: string; response_class: string | null; canonical_assistant_turn_id: string | null;
  action_ref: string | null; failure_code: string | null; created_at: Date; completed_at: Date | null;
  user_turn_id: string; org_entity_id: string; subject_entity_id: string; twin_entity_id: string;
};

async function toRequestStatus(req: RequestStatusRow): Promise<SafeRequestStatus> {
  // [OTZAR-CONTINUITY C] Expose canonical text ONLY when the whole relationship is coherent:
  // request COMPLETED, canonical id matches, turn is ASSISTANT in the exact conversation/
  // org/subject/twin, and its response_to_turn_id is the request's OWN user_turn_id.
  let canonicalText: string | null = null;
  if (req.state === "COMPLETED" && req.canonical_assistant_turn_id !== null) {
    const t = await prisma.otzarConversationTurn.findUnique({
      where: { turn_id: req.canonical_assistant_turn_id },
      select: {
        content: true, role: true, conversation_id: true,
        org_entity_id: true, subject_entity_id: true, twin_entity_id: true, response_to_turn_id: true,
      },
    });
    if (
      t !== null && t.role === "ASSISTANT" &&
      t.conversation_id === req.conversation_id &&
      t.org_entity_id === req.org_entity_id &&
      t.subject_entity_id === req.subject_entity_id &&
      t.twin_entity_id === req.twin_entity_id &&
      t.response_to_turn_id === req.user_turn_id
    ) {
      canonicalText = t.content;
    }
    // else: inconsistent canonical — do NOT expose text; leave canonicalText null.
  }
  return {
    request_record_id: req.request_record_id,
    conversation_id: req.conversation_id,
    client_request_id: req.client_request_id,
    state: req.state,
    response_class: req.response_class,
    // A canonical result is "valid" only when its relationship is coherent (canonicalText
    // set). An inconsistent canonical is NOT reported as a valid result.
    has_canonical_result: canonicalText !== null,
    has_action: req.action_ref !== null,
    in_progress: req.state === "PROCESSING" || req.state === "RECEIVED",
    retryable: req.state === "FAILED_RETRYABLE",
    failure_code: req.state === "FAILED_RETRYABLE" || req.state === "FAILED_FINAL" ? req.failure_code : null,
    canonical_assistant_turn_id: canonicalText !== null ? req.canonical_assistant_turn_id : null,
    canonical_text: canonicalText,
    created_at: req.created_at,
    completed_at: req.completed_at,
  };
}

const NON_TERMINAL_STATES = ["RECEIVED", "PROCESSING", "FAILED_RETRYABLE"];

async function unresolvedCount(conversationId: string, scope: RestoreScope): Promise<number> {
  return prisma.otzarConversationRequest.count({
    where: {
      conversation_id: conversationId,
      org_entity_id: scope.org_entity_id,
      subject_entity_id: scope.subject_entity_id,
      OR: [{ state: { in: NON_TERMINAL_STATES } }, { response_class: "AWAITING_CONFIRMATION" }],
    },
  });
}

function toSummary(row: {
  conversation_id: string; twin_id: string; status: string; timezone: string | null; source_type: string;
  started_at: Date; last_active_at: Date | null; message_count: number; archived_at: Date | null;
}, unresolved: number): ThreadSummary {
  return {
    conversation_id: row.conversation_id,
    twin_entity_id: row.twin_id,
    status: row.status,
    timezone: row.timezone,
    source_type: row.source_type,
    started_at: row.started_at,
    last_active_at: row.last_active_at,
    message_count: row.message_count,
    archived: row.archived_at !== null,
    unresolved_count: unresolved,
  };
}

const SUMMARY_SELECT = {
  conversation_id: true, twin_id: true, status: true, timezone: true, source_type: true,
  started_at: true, last_active_at: true, message_count: true, archived_at: true,
} as const;

/**
 * The most-recent eligible ACTIVE thread for (org, subject), or null. Never reopens
 * ARCHIVED / CLOSED / DELETED threads. `null` means "no active thread" — the caller must
 * NOT invent one.
 */
export async function restoreActiveThread(scope: RestoreScope): Promise<ThreadSummary | null> {
  const row = await prisma.otzarConversation.findFirst({
    where: {
      org_entity_id: scope.org_entity_id,
      entity_id: scope.subject_entity_id,
      twin_id: scope.twin_entity_id,
      status: "ACTIVE",
      archived_at: null,
      deleted_at: null,
    },
    orderBy: [{ last_active_at: "desc" }, { started_at: "desc" }],
    select: SUMMARY_SELECT,
  });
  if (row === null) return null;
  return toSummary(row, await unresolvedCount(row.conversation_id, scope));
}

/** Recent threads for (org, subject), newest-active first. ACTIVE + CLOSED by default;
 *  ARCHIVED only when requested; DELETED never. Bounded. */
export async function listRecentThreads(
  scope: RestoreScope,
  options: { limit?: number; includeArchived?: boolean } = {},
): Promise<ThreadSummary[]> {
  const take = Math.min(Math.max(options.limit ?? 20, 1), 50);
  const rows = await prisma.otzarConversation.findMany({
    where: {
      org_entity_id: scope.org_entity_id,
      entity_id: scope.subject_entity_id,
      twin_id: scope.twin_entity_id,
      deleted_at: null,
      status: { not: "DELETED" },
      ...(options.includeArchived === true ? {} : { archived_at: null }),
    },
    orderBy: [{ last_active_at: "desc" }, { started_at: "desc" }],
    take,
    select: SUMMARY_SELECT,
  });
  const out: ThreadSummary[] = [];
  for (const row of rows) out.push(toSummary(row, await unresolvedCount(row.conversation_id, scope)));
  return out;
}

/**
 * A specific thread + its bounded recent turns + unresolved summary — scope-gated. Returns
 * null for a foreign or DELETED thread (indistinguishable from not-found; no disclosure).
 */
export async function getThreadForRestore(
  conversationId: string,
  scope: RestoreScope,
  options: { turnLimit?: number } = {},
): Promise<{ thread: ThreadSummary; turns: SafeTurn[] } | null> {
  const row = await prisma.otzarConversation.findFirst({
    where: {
      conversation_id: conversationId,
      org_entity_id: scope.org_entity_id,
      entity_id: scope.subject_entity_id,
      twin_id: scope.twin_entity_id,
      deleted_at: null,
    },
    select: SUMMARY_SELECT,
  });
  if (row === null) return null;
  const limit = Math.min(Math.max(options.turnLimit ?? 30, 1), 100);
  const turns = await listConversationTurns(
    conversationId,
    { org_entity_id: scope.org_entity_id, subject_entity_id: scope.subject_entity_id },
    { limit },
  );
  const safeTurns: SafeTurn[] = turns.map((t) => ({
    turn_id: t.turn_id,
    role: t.role,
    content: t.content,
    sequence: t.sequence,
    source_channel: t.source_channel,
    created_at: t.created_at,
  }));
  return { thread: toSummary(row, await unresolvedCount(conversationId, scope)), turns: safeTurns };
}

/** Safe status of the caller's own request by SERVER record id, or null (foreign → not
 *  found). Twin-scoped — a request never crosses a Twin boundary. */
export async function getRequestStatusForUser(
  scope: RestoreScope,
  requestRecordId: string,
): Promise<SafeRequestStatus | null> {
  const req = await prisma.otzarConversationRequest.findFirst({
    where: {
      request_record_id: requestRecordId,
      org_entity_id: scope.org_entity_id,
      subject_entity_id: scope.subject_entity_id,
      twin_entity_id: scope.twin_entity_id,
    },
    select: REQUEST_STATUS_SELECT,
  });
  if (req === null) return null;
  return toRequestStatus(req);
}

/**
 * [OTZAR-CONTINUITY C6/E] Safe status of the caller's request by the CLIENT-KNOWN identity
 * (conversation + client_request_id) — the identifier CT actually owns when a response is
 * lost. REQUIRES exact (org, subject, twin, conversation, client_request_id); NEVER a global
 * lookup by client_request_id. Foreign/absent → null (no existence disclosure).
 */
export async function getRequestByClient(
  scope: RestoreScope,
  conversationId: string,
  clientRequestId: string,
): Promise<SafeRequestStatus | null> {
  const req = await prisma.otzarConversationRequest.findFirst({
    where: {
      conversation_id: conversationId,
      client_request_id: clientRequestId,
      org_entity_id: scope.org_entity_id,
      subject_entity_id: scope.subject_entity_id,
      twin_entity_id: scope.twin_entity_id,
    },
    select: REQUEST_STATUS_SELECT,
  });
  if (req === null) return null;
  return toRequestStatus(req);
}
