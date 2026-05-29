// FILE: audit.routes.ts
// PURPOSE: Section 7 Wave 1 unified caller-scope audit viewer
//          routes. Self-scope only at sub-phase 1; org-admin +
//          niov-admin scopes are intentional future-substrate.
// CONNECTS TO:
//   - apps/api/src/services/audit/audit-view.service.ts
//   - apps/api/src/middleware/auth.middleware.ts (requireAuth)
//   - apps/api/src/server.ts (boot-time registration)

import type { FastifyInstance } from "fastify";
import type { AuthService } from "../services/auth.service.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import {
  getAuditEventForCaller,
  listAuditEventsForCaller,
  validateListAuditEventsQuery,
  verifyAuditChainForCaller,
} from "../services/audit/audit-view.service.js";

// WHAT: Register the 3 Wave 1 audit-viewer routes on the
//        Fastify app. Mirrors the registration-function pattern
//        used by every other Foundation route module.
export async function registerAuditRoutes(
  app: FastifyInstance,
  authService: AuthService,
): Promise<void> {
  // GET /api/v1/audit/events — caller's own audit-event list.
  // Bearer + "read"-gated. Self-scope; full filter set per
  // validateListAuditEventsQuery; emits an ADMIN_ACTION
  // AUDIT_VIEW_LIST audit on every read (RULE 4 + the
  // CONSOLE_READ precedent).
  app.get<{ Querystring: Record<string, unknown> }>(
    "/api/v1/audit/events",
    {
      preHandler: requireAuth(authService, "read"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const validation = validateListAuditEventsQuery(request.query);
      if (validation.ok === false) {
        return reply.code(422).send({
          ok: false,
          code: validation.code,
          invalid_fields: validation.invalid_fields,
        });
      }
      const result = await listAuditEventsForCaller(
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

  // GET /api/v1/audit/events/:id — single-event drilldown.
  // Self-scope; cross-actor + unknown id collapse to
  // enumeration-safe 404 AUDIT_EVENT_NOT_FOUND. Surfaces
  // previous_event + next_event references for hand-tracing.
  app.get<{ Params: { id: string } }>(
    "/api/v1/audit/events/:id",
    {
      preHandler: requireAuth(authService, "read"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const result = await getAuditEventForCaller(callerId, request.params.id);
      if (result.ok === true) {
        return reply.code(result.httpStatus).send({
          ok: true,
          event: result.view,
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

  // GET /api/v1/audit/verify-chain — verify the caller's own
  // audit chain via the LIVE verifyAuditChain primitive.
  app.get(
    "/api/v1/audit/verify-chain",
    {
      preHandler: requireAuth(authService, "read"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const result = await verifyAuditChainForCaller(callerId);
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
}
