// FILE: queries/otzar-conversation-requests.ts
// PURPOSE: [OTZAR-CONTINUITY P5 Stage 1 §2-§10] Durable logical-request processing
//          state — atomic ownership + idempotency for ONE user submission. Guarantees
//          exactly-once model/tool/provider work under concurrent duplicate submissions
//          via an atomic RECEIVED→PROCESSING lease (compare-and-set), and links the one
//          canonical assistant result. NO unrestricted response JSON — typed
//          response_class + linked refs only.
// CONNECTS TO: otzar_conversation_requests table, otzar-conversation-turns.ts (user +
//          canonical assistant turn), otzar.service.ts (conductSession — runtime wiring).

import { createHash } from "node:crypto";
import type { OtzarConversationRequest } from "@prisma/client";
import { prisma } from "../client.js";

export type RequestState =
  | "RECEIVED" | "PROCESSING" | "COMPLETED" | "FAILED_RETRYABLE" | "FAILED_FINAL";
export type ResponseClass =
  | "ANSWERED" | "CLARIFICATION" | "ACTION_PROPOSED" | "AWAITING_CONFIRMATION"
  | "REJECTED" | "CANCELLED" | "REVISED" | "EXECUTING" | "BLOCKED" | "SUCCEEDED" | "FAILED";

const DEFAULT_LEASE_MS = 60_000;

export interface CreateRequestInput {
  conversation_id: string;
  user_turn_id: string;
  org_entity_id: string;
  subject_entity_id: string;
  twin_entity_id: string;
  client_request_id?: string | null;
  content_hash: string;
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002";
}

/**
 * Create the request record (1:1 with its USER turn) or return the existing one — the
 * durable intake record. Idempotent on user_turn_id and on (conversation_id,
 * client_request_id): a concurrent duplicate resolves to the SAME record.
 */
export async function createOrGetRequest(
  input: CreateRequestInput,
): Promise<{ request: OtzarConversationRequest; created: boolean }> {
  try {
    const request = await prisma.otzarConversationRequest.create({
      data: {
        conversation_id: input.conversation_id,
        user_turn_id: input.user_turn_id,
        org_entity_id: input.org_entity_id,
        subject_entity_id: input.subject_entity_id,
        twin_entity_id: input.twin_entity_id,
        client_request_id: input.client_request_id ?? null,
        content_hash: input.content_hash,
        state: "RECEIVED",
      },
    });
    return { request, created: true };
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    // A record already exists for this user turn (or client_request_id) — return it.
    const existing =
      (await prisma.otzarConversationRequest.findUnique({ where: { user_turn_id: input.user_turn_id } })) ??
      (input.client_request_id != null
        ? await prisma.otzarConversationRequest.findUnique({
            where: { conversation_id_client_request_id: { conversation_id: input.conversation_id, client_request_id: input.client_request_id } },
          })
        : null);
    if (existing === null) throw e;
    return { request: existing, created: false };
  }
}

export interface ClaimResult {
  claimed: boolean;
  /** The request as observed (for the non-owner to inspect / replay). */
  request: OtzarConversationRequest;
}

/**
 * Atomically transition RECEIVED (or an expired FAILED_RETRYABLE / stale lease) →
 * PROCESSING for exactly one caller. Uses a compare-and-set on (state,
 * processing_version) so only ONE concurrent submission wins the lease; the loser gets
 * claimed=false and must wait/replay. A stale lease (lease_expires_at < now) on a
 * PROCESSING/FAILED_RETRYABLE row is reclaimable.
 */
export async function claimRequestProcessing(
  requestRecordId: string,
  leaseToken: string,
  nowMs: number,
  leaseMs: number = DEFAULT_LEASE_MS,
): Promise<ClaimResult> {
  const nowIso = new Date(nowMs).toISOString();
  const expiresIso = new Date(nowMs + leaseMs).toISOString();
  const rows = await prisma.$queryRaw<Array<{ request_record_id: string }>>`
    UPDATE otzar_conversation_requests
       SET state = 'PROCESSING',
           processing_version = processing_version + 1,
           lease_token = ${leaseToken},
           lease_acquired_at = ${nowIso}::timestamp,
           lease_expires_at = ${expiresIso}::timestamp,
           attempt_count = attempt_count + 1,
           updated_at = now()
     WHERE request_record_id = ${requestRecordId}::uuid
       AND (
         state = 'RECEIVED'
         OR (state IN ('PROCESSING', 'FAILED_RETRYABLE')
             AND (lease_expires_at IS NULL OR lease_expires_at < ${nowIso}::timestamp))
       )
    RETURNING request_record_id`;
  const request = await prisma.otzarConversationRequest.findUniqueOrThrow({ where: { request_record_id: requestRecordId } });
  return { claimed: rows.length === 1, request };
}

/** Mark the request COMPLETED and link its one canonical assistant result. */
export async function completeRequest(args: {
  request_record_id: string;
  leaseToken: string;
  canonical_assistant_turn_id: string;
  response_class: ResponseClass;
  action_ref?: string | null;
  provider_attempt_ref?: string | null;
}): Promise<boolean> {
  const n = await prisma.$executeRaw`
    UPDATE otzar_conversation_requests
       SET state = 'COMPLETED',
           canonical_assistant_turn_id = ${args.canonical_assistant_turn_id}::uuid,
           response_class = ${args.response_class},
           -- Preserve a previously linked action (C5): never null it out on completion.
           action_ref = COALESCE(action_ref, ${args.action_ref ?? null}::uuid),
           provider_attempt_ref = COALESCE(provider_attempt_ref, ${args.provider_attempt_ref ?? null}::uuid),
           completed_at = now(), updated_at = now()
     WHERE request_record_id = ${args.request_record_id}::uuid
       AND lease_token = ${args.leaseToken}
       -- Strict: only the lease owner completing from an in-flight/reclaimable state;
       -- idempotent when the SAME canonical turn is already linked.
       AND state IN ('PROCESSING', 'FAILED_RETRYABLE')
       AND (canonical_assistant_turn_id IS NULL
            OR canonical_assistant_turn_id = ${args.canonical_assistant_turn_id}::uuid)`;
  return n === 1;
}

/** Mark the request FAILED_RETRYABLE or FAILED_FINAL (lease-owner only). */
export async function failRequest(args: {
  request_record_id: string;
  leaseToken: string;
  final: boolean;
  failure_code: string;
}): Promise<boolean> {
  // A FAILED_RETRYABLE transition RELEASES the lease immediately (expire it now) so a
  // legitimate retry can reclaim without waiting out the full lease TTL — otherwise the
  // caller would be wrongly refused as still-in-progress for up to DEFAULT_LEASE_MS.
  // FAILED_FINAL is terminal and never reclaimed, so its lease state is immaterial.
  const n = await prisma.$executeRaw`
    UPDATE otzar_conversation_requests
       SET state = ${args.final ? "FAILED_FINAL" : "FAILED_RETRYABLE"},
           failure_code = ${args.failure_code},
           lease_expires_at = now() - interval '1 second',
           updated_at = now()
     WHERE request_record_id = ${args.request_record_id}::uuid
       AND lease_token = ${args.leaseToken}`;
  return n === 1;
}

export async function getRequestByUserTurn(userTurnId: string): Promise<OtzarConversationRequest | null> {
  return prisma.otzarConversationRequest.findUnique({ where: { user_turn_id: userTurnId } });
}

/** [OTZAR-CONTINUITY C3] Typed outcome of atomic canonical completion. */
export type CompleteCanonicalOutcome =
  | "completed"
  | "already_completed" // a VALIDATED canonical winner exists for this request → replay it
  | "canonical_inconsistent" // a canonical id is set but the turn/request is not coherent
  | "lease_lost"
  | "state_conflict"
  | "scope_mismatch"
  | "invalid_turn"
  | "consistency_error";

export interface CompleteCanonicalResult {
  outcome: CompleteCanonicalOutcome;
  /** Present for `completed` and `already_completed` — the ONE canonical assistant turn. */
  canonical_assistant_turn_id?: string;
}

export interface CompleteCanonicalInput {
  request_record_id: string;
  leaseToken: string;
  expected_version?: number | null;
  user_turn_id: string;
  org_entity_id: string;
  subject_entity_id: string;
  twin_entity_id: string;
  conversation_id: string;
  /** Canonical assistant response text (length-capped). */
  content: string;
  response_class: ResponseClass;
  action_ref?: string | null;
  provider_attempt_ref?: string | null;
  model_provider?: string | null;
  source_channel?: "CHAT" | "VOICE" | "AMBIENT";
}

const MAX_TURN_CONTENT_CHARS = 8000;

/**
 * Test-only injection seam (safe in prod: defaults false, zero runtime effect). Lets a
 * test force the canonical assistant insert to fail INSIDE the completion transaction —
 * which a Prisma method spy on the base client cannot reach (the tx client is separate).
 */
export const __otzarCompletionTestHooks = { failCanonicalInsert: false };

/** [OTZAR-CONTINUITY C3 hardening] Prove an existing canonical assistant turn is
 *  internally consistent with the request + expected scope. A non-null canonical id is
 *  NOT sufficient proof on its own. */
async function canonicalIsConsistent(
  client: { otzarConversationTurn: { findUnique: (a: { where: { turn_id: string } }) => Promise<{ role: string; conversation_id: string; org_entity_id: string; subject_entity_id: string; twin_entity_id: string | null; response_to_turn_id: string | null } | null> } },
  req: { state: string; canonical_assistant_turn_id: string | null; response_class: string | null },
  canonicalTurnId: string,
  input: CompleteCanonicalInput,
): Promise<boolean> {
  const t = await client.otzarConversationTurn.findUnique({ where: { turn_id: canonicalTurnId } });
  return (
    t !== null &&
    t.role === "ASSISTANT" &&
    t.conversation_id === input.conversation_id &&
    t.org_entity_id === input.org_entity_id &&
    t.subject_entity_id === input.subject_entity_id &&
    t.twin_entity_id === input.twin_entity_id &&
    t.response_to_turn_id === input.user_turn_id &&
    req.canonical_assistant_turn_id === canonicalTurnId &&
    req.state === "COMPLETED" &&
    req.response_class !== null
  );
}

/**
 * [OTZAR-CONTINUITY C3] Insert the canonical ASSISTANT turn AND complete the request in
 * ONE transaction — no orphan turn, no completed-request-without-canonical, no swallowed
 * finalization failure. The `response_to_turn_id` @unique enforces exactly ONE canonical
 * assistant per USER turn (a racing finalizer's insert hits P2002 → the whole tx rolls
 * back → we load + replay the durable winner). Scope (org/subject/twin/conversation),
 * lease ownership, processing version, USER-turn role/scope, and a valid state transition
 * are all verified inside the transaction. A linked action_ref is preserved (never nulled).
 */
export async function completeRequestWithCanonicalResponse(
  input: CompleteCanonicalInput,
): Promise<CompleteCanonicalResult> {
  const content =
    input.content.length > MAX_TURN_CONTENT_CHARS ? input.content.slice(0, MAX_TURN_CONTENT_CHARS) : input.content;
  const contentHash = createHash("sha256").update(content).digest("hex");
  try {
    return await prisma.$transaction(async (tx): Promise<CompleteCanonicalResult> => {
      const req = await tx.otzarConversationRequest.findUnique({ where: { request_record_id: input.request_record_id } });
      if (req === null) return { outcome: "consistency_error" };
      // Scope — fail closed, no foreign disclosure.
      if (
        req.org_entity_id !== input.org_entity_id ||
        req.subject_entity_id !== input.subject_entity_id ||
        req.twin_entity_id !== input.twin_entity_id ||
        req.conversation_id !== input.conversation_id
      ) {
        return { outcome: "scope_mismatch" };
      }
      // A canonical result already won (idempotent / concurrent finalizer). Do NOT treat
      // a non-null id alone as proof — validate the winner is internally coherent.
      if (req.canonical_assistant_turn_id !== null) {
        const ok = await canonicalIsConsistent(tx, req, req.canonical_assistant_turn_id, input);
        return ok
          ? { outcome: "already_completed", canonical_assistant_turn_id: req.canonical_assistant_turn_id }
          : { outcome: "canonical_inconsistent", canonical_assistant_turn_id: req.canonical_assistant_turn_id };
      }
      if (req.lease_token !== input.leaseToken) return { outcome: "lease_lost" };
      if (input.expected_version != null && req.processing_version !== input.expected_version) return { outcome: "state_conflict" };
      if (req.state !== "PROCESSING" && req.state !== "FAILED_RETRYABLE") return { outcome: "state_conflict" };
      // Validate the USER turn: exact scope + role.
      const userTurn = await tx.otzarConversationTurn.findUnique({ where: { turn_id: input.user_turn_id } });
      if (
        userTurn === null || userTurn.role !== "USER" ||
        userTurn.conversation_id !== input.conversation_id ||
        userTurn.org_entity_id !== input.org_entity_id ||
        userTurn.subject_entity_id !== input.subject_entity_id
      ) {
        return { outcome: "invalid_turn" };
      }
      // Allocate the monotonic sequence (scope-gated, same guard as allocateTurnSequence).
      const seqRows = await tx.$queryRaw<Array<{ turn_seq: number }>>`
        UPDATE otzar_conversations
           SET turn_seq = turn_seq + 1, last_active_at = now()
         WHERE conversation_id = ${input.conversation_id}::uuid
           AND (org_entity_id IS NULL OR org_entity_id = ${input.org_entity_id}::uuid)
           AND (entity_id = ${input.subject_entity_id}::uuid OR ${input.subject_entity_id} = ANY(participants))
           AND status <> 'DELETED' AND deleted_at IS NULL
        RETURNING turn_seq`;
      if (seqRows.length !== 1) return { outcome: "invalid_turn" };
      const sequence = seqRows[0]!.turn_seq;
      if (__otzarCompletionTestHooks.failCanonicalInsert) throw new Error("injected canonical-insert failure (test)");
      // Insert the canonical ASSISTANT turn. response_to_turn_id @unique = one canonical.
      const asst = await tx.otzarConversationTurn.create({
        data: {
          conversation_id: input.conversation_id,
          org_entity_id: input.org_entity_id,
          subject_entity_id: input.subject_entity_id,
          author_entity_id: input.twin_entity_id, // the Twin authors the assistant turn
          twin_entity_id: input.twin_entity_id,
          role: "ASSISTANT",
          content,
          content_hash: contentHash,
          sequence,
          reply_to_turn_id: input.user_turn_id,
          response_to_turn_id: input.user_turn_id,
          ...(input.action_ref != null ? { action_ref: input.action_ref } : {}),
          ...(input.model_provider != null ? { model_provider: input.model_provider } : {}),
          source_channel: input.source_channel ?? "CHAT",
          retention_class: "STANDARD",
        },
      });
      // Complete the request (canonical link + class + refs + COMPLETED + clear lease).
      await tx.otzarConversationRequest.update({
        where: { request_record_id: input.request_record_id },
        data: {
          state: "COMPLETED",
          canonical_assistant_turn_id: asst.turn_id,
          response_class: input.response_class,
          action_ref: req.action_ref ?? input.action_ref ?? null,
          provider_attempt_ref: req.provider_attempt_ref ?? input.provider_attempt_ref ?? null,
          completed_at: new Date(),
          updated_at: new Date(),
          lease_token: null,
          lease_expires_at: null,
        },
      });
      return { outcome: "completed", canonical_assistant_turn_id: asst.turn_id };
    });
  } catch (e) {
    if (isUniqueViolation(e)) {
      // A concurrent finalizer won the response_to_turn_id (one-canonical). The whole tx
      // rolled back (no orphan). Load the winner by FULL expected scope + re-load the
      // request, then validate the winner/request relationship — only a coherent winner
      // is `already_completed`; anything else is a typed consistency failure.
      const existing = await prisma.otzarConversationTurn.findFirst({
        where: {
          response_to_turn_id: input.user_turn_id,
          role: "ASSISTANT",
          conversation_id: input.conversation_id,
          org_entity_id: input.org_entity_id,
          subject_entity_id: input.subject_entity_id,
          twin_entity_id: input.twin_entity_id,
        },
      });
      if (existing !== null) {
        const req = await prisma.otzarConversationRequest.findUnique({ where: { request_record_id: input.request_record_id } });
        if (req !== null && (await canonicalIsConsistent(prisma, req, existing.turn_id, input))) {
          return { outcome: "already_completed", canonical_assistant_turn_id: existing.turn_id };
        }
        return { outcome: "canonical_inconsistent", canonical_assistant_turn_id: existing.turn_id };
      }
    }
    // Any other transaction failure: the whole tx rolled back (no orphan turn, request
    // NOT completed). Never surface as success — a typed consistency error → the caller
    // transitions FAILED_RETRYABLE and a retry reconstructs/regenerates.
    return { outcome: "consistency_error" };
  }
}

/** Outcome of a compare-and-set action linkage. */
export type LinkActionOutcome = "linked" | "already_same" | "conflict" | "not_owner";

/**
 * [OTZAR-CONTINUITY C5] Durably link the EXACT action this request produced to the
 * request record, BEFORE the assistant turn is persisted — so an assistant-persist
 * failure is recoverable by reconstructing from the action instead of re-executing.
 *
 * Compare-and-set: the lease owner may set action_ref only when it is currently NULL
 * (first link) or already equals the same action (idempotent). A DIFFERENT existing
 * action_ref is a consistency violation → `conflict`, never a silent overwrite. Lease
 * ownership is enforced (lease_token match) so a stolen/expired lease cannot relink.
 */
export async function linkRequestAction(args: {
  request_record_id: string;
  leaseToken: string;
  action_ref: string;
}): Promise<LinkActionOutcome> {
  const n = await prisma.$executeRaw`
    UPDATE otzar_conversation_requests
       SET action_ref = ${args.action_ref}::uuid, updated_at = now()
     WHERE request_record_id = ${args.request_record_id}::uuid
       AND lease_token = ${args.leaseToken}
       AND (action_ref IS NULL OR action_ref = ${args.action_ref}::uuid)`;
  if (n === 1) {
    // Distinguish a fresh link from an idempotent no-op-equivalent write.
    const row = await prisma.otzarConversationRequest.findUnique({
      where: { request_record_id: args.request_record_id },
      select: { action_ref: true },
    });
    return row?.action_ref === args.action_ref ? "linked" : "already_same";
  }
  // 0 rows: either not the lease owner, or a DIFFERENT action is already linked.
  const row = await prisma.otzarConversationRequest.findUnique({
    where: { request_record_id: args.request_record_id },
    select: { action_ref: true, lease_token: true },
  });
  if (row === null || row.lease_token !== args.leaseToken) return "not_owner";
  if (row.action_ref !== null && row.action_ref === args.action_ref) return "already_same";
  return "conflict";
}
