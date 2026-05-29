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
  exportAuditEventsForCaller,
  getAuditEventForCaller,
  listAuditEventsForCaller,
  listRegulatorAuditEventsForCaller,
  validateExportAuditEventsQuery,
  validateListAuditEventsQuery,
  validateListRegulatorAuditEventsQuery,
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
        rawScope !== "org" &&
        rawScope !== "platform"
      ) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_FIELD",
          invalid_fields: ["scope"],
        });
      }
      const scope: "self" | "org" | "platform" =
        rawScope === "platform"
          ? "platform"
          : rawScope === "org"
            ? "org"
            : "self";
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

  // ADR-0057 Section 7 Wave 4 NDJSON audit export. Bearer +
  // "read"-gated; same scope=self|org|platform gate as the list
  // route; bounded by EXPORT_AUDIT_EVENTS_MAX_ROWS (10_000) hard
  // cap with an optional smaller operator-controlled max_rows.
  // Format is application/x-ndjson at sub-phase 1 (CSV is
  // forward-substrate). Read-audit emission via
  // ADMIN_ACTION:AUDIT_VIEW_EXPORT — no new audit literal.
  app.get<{ Querystring: Record<string, unknown> }>(
    "/api/v1/audit/events/export",
    {
      preHandler: requireAuth(authService, "read"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const validation = validateExportAuditEventsQuery(request.query);
      if (validation.ok === false) {
        return reply.code(422).send({
          ok: false,
          code: validation.code,
          invalid_fields: validation.invalid_fields,
        });
      }
      const result = await exportAuditEventsForCaller(
        callerId,
        validation.normalized,
      );
      if (result.ok === true) {
        // NDJSON content-type per RFC 8259 + media-type
        // convention (application/x-ndjson is the de-facto
        // standard before the IETF formal registration). The
        // body is plain UTF-8 text with one JSON value per
        // line; no trailing newline. row_count + truncated
        // surfaced as response headers so a streaming client
        // can detect the truncation without parsing the body.
        return reply
          .code(200)
          .header("content-type", "application/x-ndjson; charset=utf-8")
          .header("x-audit-row-count", String(result.view.row_count))
          .header("x-audit-truncated", result.view.truncated ? "true" : "false")
          .header("x-audit-scope", result.view.scope)
          .send(result.view.body);
      }
      const responseBody: Record<string, unknown> = {
        ok: false,
        code: result.code,
      };
      if (result.message !== undefined) responseBody.message = result.message;
      return reply.code(result.httpStatus).send(responseBody);
    },
  );

  // ADR-0036 Section 7 Wave 5 regulator-tier audit access.
  // Bearer + "read"-gated. lawful_basis_id required; the
  // service calls into getActiveLawfulBasisForRegulator for
  // the 9-condition LawfulBasis enforcement check; on success
  // returns audit_events bound to that grant. Read-audit
  // emission via ADMIN_ACTION:AUDIT_VIEW_REGULATOR — no new
  // audit literal.
  app.get<{ Querystring: Record<string, unknown> }>(
    "/api/v1/audit/events/regulator-view",
    {
      preHandler: requireAuth(authService, "read"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const validation = validateListRegulatorAuditEventsQuery(request.query);
      if (validation.ok === false) {
        return reply.code(422).send({
          ok: false,
          code: validation.code,
          invalid_fields: validation.invalid_fields,
        });
      }
      const result = await listRegulatorAuditEventsForCaller(
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
}
