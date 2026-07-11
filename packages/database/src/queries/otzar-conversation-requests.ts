// FILE: queries/otzar-conversation-requests.ts
// PURPOSE: [OTZAR-CONTINUITY P5 Stage 1 §2-§10] Durable logical-request processing
//          state — atomic ownership + idempotency for ONE user submission. Guarantees
//          exactly-once model/tool/provider work under concurrent duplicate submissions
//          via an atomic RECEIVED→PROCESSING lease (compare-and-set), and links the one
//          canonical assistant result. NO unrestricted response JSON — typed
//          response_class + linked refs only.
// CONNECTS TO: otzar_conversation_requests table, otzar-conversation-turns.ts (user +
//          canonical assistant turn), otzar.service.ts (conductSession — runtime wiring).

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
           action_ref = ${args.action_ref ?? null}::uuid,
           provider_attempt_ref = ${args.provider_attempt_ref ?? null}::uuid,
           completed_at = now(), updated_at = now()
     WHERE request_record_id = ${args.request_record_id}::uuid
       AND lease_token = ${args.leaseToken}`;
  return n === 1;
}

/** Mark the request FAILED_RETRYABLE or FAILED_FINAL (lease-owner only). */
export async function failRequest(args: {
  request_record_id: string;
  leaseToken: string;
  final: boolean;
  failure_code: string;
}): Promise<boolean> {
  const n = await prisma.$executeRaw`
    UPDATE otzar_conversation_requests
       SET state = ${args.final ? "FAILED_FINAL" : "FAILED_RETRYABLE"},
           failure_code = ${args.failure_code},
           updated_at = now()
     WHERE request_record_id = ${args.request_record_id}::uuid
       AND lease_token = ${args.leaseToken}`;
  return n === 1;
}

export async function getRequestByUserTurn(userTurnId: string): Promise<OtzarConversationRequest | null> {
  return prisma.otzarConversationRequest.findUnique({ where: { user_turn_id: userTurnId } });
}
