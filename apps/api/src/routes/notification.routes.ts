// FILE: notification.routes.ts
// PURPOSE: ADR-0057 Wave 12 internal-only notification inbox routes.
//          GET self-scope list + idempotent mark-as-read + RULE 10
//          soft-delete dismiss. Consumes the Wave 12
//          notification-read.service.ts read-side substrate; the
//          Wave 11 NotificationService remains the write-side.
// CONNECTS TO:
//   - apps/api/src/services/notification/notification-read.service.ts
//   - apps/api/src/middleware/auth.middleware.ts (requireAuth gate)
//   - apps/api/src/server.ts (boot-time registration)

import type { FastifyInstance } from "fastify";
import type { AuthService } from "../services/auth.service.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import {
  dismissNotificationForCaller,
  listNotificationsForCaller,
  markNotificationReadForCaller,
  validateListNotificationsQuery,
} from "../services/notification/notification-read.service.js";
import { replyToNotificationForCaller } from "../services/notification/notification-reply.service.js";

// WHAT: Register the 3 inbox routes on the Fastify app. Mirrors
//        the registration-function pattern used by every other
//        Foundation route module.
export async function registerNotificationRoutes(
  app: FastifyInstance,
  authService: AuthService,
): Promise<void> {
  // ADR-0057 Wave 12 GET inbox list. Bearer + "read"-gated.
  // Self-scope only at sub-phase 1 per Founder direction —
  // recipient_entity_id = caller. Standard pagination + optional
  // unread_only / notification_class filters. SAFE projection
  // excludes body_redacted by default; only body_summary surfaces.
  app.get<{ Querystring: Record<string, unknown> }>(
    "/api/v1/notifications",
    {
      preHandler: requireAuth(authService, "read"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const validation = validateListNotificationsQuery(request.query);
      if (validation.ok === false) {
        return reply.code(422).send({
          ok: false,
          code: validation.code,
          invalid_fields: validation.invalid_fields,
        });
      }
      const result = await listNotificationsForCaller(
        callerId,
        validation.normalized,
      );
      if (result.ok === true) {
        return reply.code(result.httpStatus).send({
          ok: true,
          ...result.view,
        });
      }
      const responseBody: Record<string, unknown> = {
        ok: false,
        code: result.code,
      };
      if (result.message !== undefined) responseBody.message = result.message;
      return reply.code(result.httpStatus).send(responseBody);
    },
  );

  // Phase 1215 [OTZAR-NOTIFICATION-REPLY] -- recipient-side inline
  // reply. The caller knows the notification_id; Foundation looks up
  // the row server-side, resolves the original sender, and creates a
  // governed SEND_INTERNAL_NOTIFICATION Action back to them via the
  // existing createActionForCaller path (ADR-0057). Privacy invariant
  // preserved: the recipient never sees source_entity_id directly.
  app.post<{
    Params: { id: string };
    Body: { body_summary?: unknown; idempotency_key?: unknown };
  }>(
    "/api/v1/notifications/:id/reply",
    { preHandler: requireAuth(authService, "write") },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const body = request.body ?? {};
      const result = await replyToNotificationForCaller(callerId, {
        notificationId: request.params.id,
        body_summary:
          typeof body.body_summary === "string" ? body.body_summary : "",
        idempotency_key:
          typeof body.idempotency_key === "string" ? body.idempotency_key : "",
      });
      if (result.ok === true) {
        return reply.code(result.httpStatus).send({
          ok: true,
          reply_action_id: result.reply_action_id,
          reply_action_status: result.reply_action_status,
        });
      }
      const responseBody: Record<string, unknown> = {
        ok: false,
        code: result.code,
      };
      if (result.message !== undefined) responseBody.message = result.message;
      return reply.code(result.httpStatus).send(responseBody);
    },
  );

  // ADR-0057 Wave 12 mark-as-read. Bearer + "write"-gated
  // (mutates the row). Idempotent: if read_at is already set,
  // returns 200 with the same SafeNotificationView and does NOT
  // re-fire the timestamp. Cross-recipient / unknown id /
  // soft-deleted all collapse to enumeration-safe 404
  // NOTIFICATION_NOT_FOUND.
  app.put<{ Params: { id: string } }>(
    "/api/v1/notifications/:id/read",
    {
      preHandler: requireAuth(authService, "write"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const result = await markNotificationReadForCaller(
        callerId,
        request.params.id,
      );
      if (result.ok === true) {
        return reply.code(result.httpStatus).send({
          ok: true,
          notification: result.view,
        });
      }
      const responseBody: Record<string, unknown> = {
        ok: false,
        code: result.code,
      };
      if (result.message !== undefined) responseBody.message = result.message;
      return reply.code(result.httpStatus).send(responseBody);
    },
  );

  // ADR-0057 Wave 12 dismiss (RULE 10 soft-delete). Bearer +
  // "write"-gated. Idempotent — re-dismissing an already-dismissed
  // row collapses to enumeration-safe 404 (the row is already
  // hidden from the caller's perspective).
  app.put<{ Params: { id: string } }>(
    "/api/v1/notifications/:id/dismiss",
    {
      preHandler: requireAuth(authService, "write"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const result = await dismissNotificationForCaller(
        callerId,
        request.params.id,
      );
      if (result.ok === true) {
        return reply.code(result.httpStatus).send({
          ok: true,
          notification: result.view,
        });
      }
      const responseBody: Record<string, unknown> = {
        ok: false,
        code: result.code,
      };
      if (result.message !== undefined) responseBody.message = result.message;
      return reply.code(result.httpStatus).send(responseBody);
    },
  );
}
