// FILE: notification-reply.service.ts
// PURPOSE: Phase 1215 [OTZAR-NOTIFICATION-REPLY] -- recipient-side
//          reply mediator. The recipient knows the notification_id
//          (the GET /api/v1/notifications surface returns it). They
//          do NOT know the original sender's entity_id (the
//          SafeNotificationView projection deliberately excludes
//          source_entity_id per the privacy invariant at
//          notification-read.service.ts:225-228). This service
//          looks up the row server-side, resolves the source_entity_id
//          to the reply recipient, and routes through the existing
//          createActionForCaller pipeline (ADR-0057) so policy,
//          executor, audit, and recipient Notification all run
//          unchanged.
//
// CONNECTS TO:
//   - apps/api/src/services/action/action.service.ts
//     (createActionForCaller; existing governed pipeline)
//   - apps/api/src/services/notification/notification-read.service.ts
//     (SafeNotificationView privacy invariant preserved)
//   - apps/api/src/routes/notification.routes.ts (the new POST
//     /api/v1/notifications/:id/reply route)
//
// PRIVACY INVARIANT:
//   - The recipient never sees the sender's entity_id directly.
//   - Cross-recipient enumeration is blocked: a lookup for an id
//     that doesn't belong to the caller returns
//     NOTIFICATION_NOT_FOUND, identical to "id does not exist".
//   - We do NOT enable reply for system-source notifications (the
//     source MUST be a real entity_id; if not present, refuse).
//   - The reply Action is created via the same governed pipeline;
//     external writes remain gated.

import { prisma } from "@niov/database";
import { createActionForCaller } from "../action/action.service.js";
// [OTZAR-LIVE-6] response reconciliation — the reply must land in the A↔B thread.
import { createLedgerEntry } from "../work-os/work-ledger.service.js";
import { getOrgEntityId } from "../governance/org.js";

const REPLY_BODY_MAX = 2000;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ReplyToNotificationInput {
  notificationId: string;
  body_summary: string;
  idempotency_key: string;
}

export type ReplyToNotificationResult =
  | {
      ok: true;
      httpStatus: 200;
      reply_action_id: string;
      reply_action_status: string;
    }
  | {
      ok: false;
      httpStatus: 400 | 401 | 403 | 404 | 409 | 422 | 503;
      code: string;
      message?: string;
    };

/**
 * Send a reply to an internal notification on behalf of the caller.
 * The caller must own the notification (recipient_entity_id = caller).
 * The reply target is the original notification's source_entity_id,
 * resolved server-side so the caller never sees it.
 */
export async function replyToNotificationForCaller(
  callerEntityId: string,
  input: ReplyToNotificationInput,
): Promise<ReplyToNotificationResult> {
  if (typeof input.notificationId !== "string" || !UUID_RE.test(input.notificationId)) {
    return { ok: false, httpStatus: 400, code: "INVALID_NOTIFICATION_ID" };
  }
  const body = input.body_summary.trim();
  if (body.length === 0) {
    return {
      ok: false,
      httpStatus: 422,
      code: "INVALID_REQUEST",
      message: "body_summary is required (non-empty after trim)",
    };
  }
  if (typeof input.idempotency_key !== "string" || input.idempotency_key.length === 0) {
    return {
      ok: false,
      httpStatus: 422,
      code: "INVALID_REQUEST",
      message: "idempotency_key is required",
    };
  }

  // Look up the notification. Enumeration-safe 404: cross-recipient,
  // unknown id, and soft-deleted all collapse to NOTIFICATION_NOT_FOUND.
  const row = await prisma.notification.findFirst({
    where: {
      notification_id: input.notificationId,
      recipient_entity_id: callerEntityId,
      deleted_at: null,
    },
    select: { source_entity_id: true },
  });
  if (row === null) {
    return { ok: false, httpStatus: 404, code: "NOTIFICATION_NOT_FOUND" };
  }
  // Reply target = original sender. Refuse on system-source rows so
  // a future SYSTEM-source notification class can't be replied to
  // accidentally. (At Phase 1215 every Notification row carries a
  // real source_entity_id; this is defense in depth.)
  if (
    typeof row.source_entity_id !== "string" ||
    !UUID_RE.test(row.source_entity_id)
  ) {
    return {
      ok: false,
      httpStatus: 422,
      code: "REPLY_NOT_SUPPORTED",
      message: "This notification does not support inline reply.",
    };
  }

  // Build the reply payload + delegate to the existing governed
  // create pipeline. NO new mutation surface; same policy +
  // executor + audit + Notification chain that Phase 1209 wired.
  const result = await createActionForCaller(callerEntityId, {
    action_type: "SEND_INTERNAL_NOTIFICATION",
    idempotency_key: input.idempotency_key,
    payload_summary: "Reply to an internal Otzar note",
    payload_redacted: {
      recipient_entity_id: row.source_entity_id,
      notification_class: "OTZAR_INTERNAL_NOTE",
      body_summary: body,
    },
  });

  if (!result.ok) {
    return {
      ok: false,
      httpStatus: result.httpStatus,
      code: result.code,
      ...(result.message !== undefined ? { message: result.message } : {}),
    };
  }

  // [OTZAR-LIVE-6] Response reconciliation. The outbound internal-message path
  // (deliverHumanInternalMessage) writes BOTH a Notification and a durable
  // Work-Ledger NOTIFICATION row; getDirectMessageThread (the A↔B thread the
  // sender's "did they respond?" lookups read) queries WorkLedgerEntry, NOT
  // Notification. The reply path above only created a Notification, so a reply
  // was invisible to the original sender. Mirror the outbound row for the reply —
  // requester = replier (caller), target = original sender — so the reply appears
  // in the thread. Best-effort: the reply itself already succeeded; a missing
  // thread row must never fail the (delivered) reply.
  try {
    const orgEntityId = await getOrgEntityId(callerEntityId);
    await createLedgerEntry({
      org_entity_id: orgEntityId,
      ledger_type: "NOTIFICATION",
      source_type: "CHAT",
      source_command: body.slice(0, REPLY_BODY_MAX),
      title: "Reply to internal note",
      summary: body.slice(0, 200),
      requester_entity_id: callerEntityId,
      owner_entity_id: callerEntityId,
      target_entity_id: row.source_entity_id,
      status: "EXECUTED",
      priority: "ROUTINE",
      next_action: "Reply delivered",
    });
  } catch {
    // Non-fatal — the governed reply was already delivered above.
  }

  return {
    ok: true,
    httpStatus: 200,
    reply_action_id: result.view.action_id,
    reply_action_status: result.view.status,
  };
}
