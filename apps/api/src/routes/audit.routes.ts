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
  verifyAuditChainForScope,
} from "../services/audit/audit-view.service.js";
import type {
  VerifyChainScope,
  VerifyChainServiceInput,
} from "../services/audit/audit-view.service.js";
import { getOrgEntityId } from "../services/governance/org.js";
import { recordUsageForOrg } from "../services/billing/usage-meter.service.js";

// WHAT: UUID v4 (or relaxed UUID) regex used to validate the
//        verify-chain route's optional id query params.
// INPUT: A string to validate.
// OUTPUT: Boolean.
// WHY: Matches the existing audit-view.service `UUID_RE`
//      precedent; rejecting malformed UUIDs early avoids Prisma
//      throwing on the downstream count/findMany call.
const VERIFY_CHAIN_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VERIFY_CHAIN_SCOPES: ReadonlySet<VerifyChainScope> = new Set<VerifyChainScope>([
  "self",
  "org",
  "platform",
  "regulator",
]);

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

  // GET /api/v1/audit/verify-chain — ADR-0071 cross-scope
  // verify-chain. Accepts:
  //   scope?: self | org | platform | regulator (default self)
  //   subject_entity_id?: uuid (self/org/platform only)
  //   lawful_basis_id?:    uuid (REQUIRED for regulator)
  //   from?:               ISO timestamp
  //   to?:                 ISO timestamp
  //   max_events?:         positive integer
  //
  // Option A clean break per Founder QLOCK 2026-05-31. Response
  // shape is the ADR-0071 §3 SAFE VerifyChainView (verified /
  // checked_event_count / broken_at_event_id + boundary hashes
  // + closed-vocab failure_reason). Old fields are NOT aliased.
  app.get<{
    Querystring: {
      scope?: string;
      subject_entity_id?: string;
      lawful_basis_id?: string;
      from?: string;
      to?: string;
      max_events?: string;
    };
  }>(
    "/api/v1/audit/verify-chain",
    {
      preHandler: requireAuth(authService, "read"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;

      // Parse + validate query string. Closed-vocab failures
      // surface deterministic codes per ADR-0071 §9.
      const rawScope = request.query.scope;
      let scope: VerifyChainScope = "self";
      if (rawScope !== undefined) {
        if (
          typeof rawScope !== "string" ||
          !VERIFY_CHAIN_SCOPES.has(rawScope as VerifyChainScope)
        ) {
          return reply
            .code(400)
            .send({ ok: false, code: "INVALID_SCOPE" });
        }
        scope = rawScope as VerifyChainScope;
      }

      const input: VerifyChainServiceInput = {
        callerEntityId: callerId,
        scope,
      };

      if (request.query.lawful_basis_id !== undefined) {
        if (
          typeof request.query.lawful_basis_id !== "string" ||
          !VERIFY_CHAIN_UUID_RE.test(request.query.lawful_basis_id)
        ) {
          return reply
            .code(400)
            .send({ ok: false, code: "INVALID_FIELD" });
        }
        input.lawful_basis_id = request.query.lawful_basis_id;
      }

      if (request.query.subject_entity_id !== undefined) {
        if (
          typeof request.query.subject_entity_id !== "string" ||
          !VERIFY_CHAIN_UUID_RE.test(request.query.subject_entity_id)
        ) {
          return reply
            .code(400)
            .send({ ok: false, code: "INVALID_FIELD" });
        }
        input.subject_entity_id = request.query.subject_entity_id;
      }

      if (request.query.from !== undefined) {
        const t = Date.parse(request.query.from);
        if (Number.isNaN(t)) {
          return reply
            .code(400)
            .send({ ok: false, code: "INVALID_FIELD" });
        }
        input.from = new Date(t);
      }
      if (request.query.to !== undefined) {
        const t = Date.parse(request.query.to);
        if (Number.isNaN(t)) {
          return reply
            .code(400)
            .send({ ok: false, code: "INVALID_FIELD" });
        }
        input.to = new Date(t);
      }
      if (request.query.max_events !== undefined) {
        const n = Number(request.query.max_events);
        if (
          !Number.isInteger(n) ||
          n <= 0 ||
          !Number.isFinite(n)
        ) {
          return reply
            .code(400)
            .send({ ok: false, code: "INVALID_FIELD" });
        }
        input.max_events = n;
      }

      const result = await verifyAuditChainForScope(input);
      if (result.ok === true) {
        return reply.code(result.httpStatus).send(result.view);
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
        // B6-α telemetry counter — record audit-export volume
        // against the caller's org meter. Failure here MUST NOT
        // affect the export response (telemetry isolation per
        // ADR-0093 §5 Candidate C). The delta is the row_count so
        // capacity-planning surfaces can observe export volume,
        // not just call count. `meter.audit-exports.v1` matches
        // the B2 catalog vocabulary `meter.<name>.v<n>`.
        try {
          const orgEntityId = await getOrgEntityId(callerId);
          const rowCount = result.view.row_count;
          if (Number.isInteger(rowCount) && rowCount > 0) {
            await recordUsageForOrg(
              orgEntityId,
              "meter.audit-exports.v1",
              rowCount,
            );
          }
        } catch {
          // intentionally swallowed; telemetry must not affect
          // the export response.
        }
        // Content-type per format:
        //   NDJSON → application/x-ndjson per RFC 8259 + the
        //     de-facto media-type convention (formal registration
        //     pending at IETF).
        //   CSV    → text/csv per RFC 4180 §3. Header row is
        //     included; CRLF line terminators per the spec.
        // Response headers x-audit-row-count / x-audit-truncated /
        // x-audit-scope let streaming clients detect truncation +
        // scope without parsing the body. x-audit-format echoes
        // the chosen format so a generic operator client can
        // dispatch on it.
        const contentType =
          result.view.format === "csv"
            ? "text/csv; charset=utf-8"
            : "application/x-ndjson; charset=utf-8";
        return reply
          .code(200)
          .header("content-type", contentType)
          .header("x-audit-row-count", String(result.view.row_count))
          .header("x-audit-truncated", result.view.truncated ? "true" : "false")
          .header("x-audit-scope", result.view.scope)
          .header("x-audit-format", result.view.format)
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
