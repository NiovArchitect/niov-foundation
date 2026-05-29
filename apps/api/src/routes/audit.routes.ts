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
  // Self-scope by default; scope=org enables the can_admin_org
  // path (Section 7 Wave 2). Cross-actor / cross-org / unknown
  // id all collapse to enumeration-safe 404
  // AUDIT_EVENT_NOT_FOUND. Surfaces previous_event +
  // next_event references for hand-tracing (refs scoped to the
  // same caller-or-org scope as the row lookup).
  app.get<{
    Params: { id: string };
    Querystring: { scope?: string };
  }>(
    "/api/v1/audit/events/:id",
    {
      preHandler: requireAuth(authService, "read"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      // Validate scope at the route tier — service accepts the
      // typed enum, so reject anything other than "self" / "org"
      // / omitted with a 422 INVALID_FIELD to keep the surface
      // honest.
      const rawScope = request.query.scope;
      if (
        rawScope !== undefined &&
        rawScope !== "self" &&
        rawScope !== "org"
      ) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_FIELD",
          invalid_fields: ["scope"],
        });
      }
      const scope: "self" | "org" = rawScope === "org" ? "org" : "self";
      const result = await getAuditEventForCaller(
        callerId,
        request.params.id,
        scope,
      );
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
