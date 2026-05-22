// FILE: console.routes.ts
// PURPOSE: CONSOLE.1 P0 read-only HTTP surface for the Foundation Console
//          control plane (`/api/v1/console/*`). Seven GET endpoints — overview,
//          audit, entities, break-glass/grants, escalations, reports catalog,
//          report detail — every one NIOV-operator-gated
//          (requireAdminCapability "can_admin_niov") and read-only. Each read
//          emits an existing ADMIN_ACTION audit with details.action =
//          "CONSOLE_READ" (no new AuditEventType literal; no ADR-0002 change).
//          NO mutations, NO raw capsule content, NO break-glass justification in
//          lists, NO fabricated live market pricing. The data shaping lives in
//          console.service.ts.
// CONNECTS TO: apps/api/src/middleware/admin.middleware.ts
//              (requireAdminCapability "can_admin_niov"); console.service.ts
//              (read aggregation + report catalog); @niov/database
//              (writeAuditEvent — the CONSOLE_READ marker); server.ts
//              (registerConsoleRoutes alongside the other route registrars).

import type { FastifyInstance, FastifyRequest } from "fastify";
import { writeAuditEvent } from "@niov/database";
import { requireAdminCapability } from "../middleware/admin.middleware.js";
import type { AuthService } from "../services/auth.service.js";
import {
  buildConsoleOverview,
  listConsoleAudit,
  listConsoleEntities,
  listConsoleBreakGlassGrants,
  listConsoleEscalations,
  getConsoleReportCatalog,
  getConsoleReport,
  type ConsoleAuditQuery,
  type ConsoleEntityQuery,
  type ConsoleBreakGlassQuery,
  type ConsoleEscalationQuery,
} from "../services/console.service.js";

// WHAT: Emit the Console read-audit marker. INPUT: callerEntityId + route +
//        high-level (non-sensitive) query metadata. OUTPUT: a promise.
// WHY: Console reads are audited (RULE 4 + ADR-0002) via the EXISTING
//      ADMIN_ACTION event_type with details.action = "CONSOLE_READ" — no new
//      literal. Metadata carries route/report identifiers + which filter keys
//      were supplied (never raw sensitive payloads, never capsule content).
async function emitConsoleRead(
  callerEntityId: string,
  route: string,
  meta: Record<string, unknown> = {},
): Promise<void> {
  await writeAuditEvent({
    event_type: "ADMIN_ACTION",
    outcome: "SUCCESS",
    actor_entity_id: callerEntityId,
    details: { action: "CONSOLE_READ", route, ...meta },
  });
}

// WHAT: The non-sensitive filter keys that were supplied (presence only).
// WHY: Audit which filters were applied without logging raw values.
function filterKeys(q: Record<string, unknown>): string[] {
  return Object.keys(q).filter(
    (k) => k !== "skip" && k !== "take" && q[k] !== undefined && q[k] !== "",
  );
}

// WHAT: Register the read-only Foundation Console `/api/v1/console/*` routes.
// INPUT: the Fastify instance + the AuthService (for requireAdminCapability).
// OUTPUT: a promise that resolves once routes are registered.
// WHY: CONSOLE.1 P0. Every route is can_admin_niov-gated; enterprise/org,
//      regulator, developer, student, and educator actors do NOT receive
//      substrate-wide Console access here.
export async function registerConsoleRoutes(
  app: FastifyInstance,
  authService: AuthService,
): Promise<void> {
  const guard = { preHandler: requireAdminCapability(authService, "can_admin_niov") };

  // A. GET /api/v1/console/overview -- Foundation Command Center aggregate.
  app.get("/api/v1/console/overview", guard, async (request, reply) => {
    await emitConsoleRead(request.auth!.entity_id, "/api/v1/console/overview");
    const overview = await buildConsoleOverview();
    return reply.code(200).send(overview);
  });

  // B. GET /api/v1/console/audit -- filterable audit read.
  app.get<{ Querystring: ConsoleAuditQuery }>(
    "/api/v1/console/audit",
    guard,
    async (request: FastifyRequest<{ Querystring: ConsoleAuditQuery }>, reply) => {
      await emitConsoleRead(request.auth!.entity_id, "/api/v1/console/audit", {
        filters: filterKeys(request.query as Record<string, unknown>),
      });
      const result = await listConsoleAudit(request.query);
      return reply.code(200).send(result);
    },
  );

  // C. GET /api/v1/console/entities -- wallet & entity explorer.
  app.get<{ Querystring: ConsoleEntityQuery }>(
    "/api/v1/console/entities",
    guard,
    async (request: FastifyRequest<{ Querystring: ConsoleEntityQuery }>, reply) => {
      await emitConsoleRead(request.auth!.entity_id, "/api/v1/console/entities", {
        filters: filterKeys(request.query as Record<string, unknown>),
      });
      const result = await listConsoleEntities(request.query);
      return reply.code(200).send(result);
    },
  );

  // D. GET /api/v1/console/break-glass/grants -- break-glass review (NO justification).
  app.get<{ Querystring: ConsoleBreakGlassQuery }>(
    "/api/v1/console/break-glass/grants",
    guard,
    async (
      request: FastifyRequest<{ Querystring: ConsoleBreakGlassQuery }>,
      reply,
    ) => {
      await emitConsoleRead(
        request.auth!.entity_id,
        "/api/v1/console/break-glass/grants",
        { filters: filterKeys(request.query as Record<string, unknown>) },
      );
      const result = await listConsoleBreakGlassGrants(request.query);
      return reply.code(200).send(result);
    },
  );

  // E. GET /api/v1/console/escalations -- NIOV-wide dual-control/escalation read.
  app.get<{ Querystring: ConsoleEscalationQuery }>(
    "/api/v1/console/escalations",
    guard,
    async (
      request: FastifyRequest<{ Querystring: ConsoleEscalationQuery }>,
      reply,
    ) => {
      await emitConsoleRead(request.auth!.entity_id, "/api/v1/console/escalations", {
        filters: filterKeys(request.query as Record<string, unknown>),
      });
      const result = await listConsoleEscalations(request.query);
      return reply.code(200).send(result);
    },
  );

  // F. GET /api/v1/console/reports -- static report catalog (18 reports).
  app.get("/api/v1/console/reports", guard, async (request, reply) => {
    await emitConsoleRead(request.auth!.entity_id, "/api/v1/console/reports");
    const reports = getConsoleReportCatalog();
    return reply.code(200).send({
      ok: true,
      reports,
      total: reports.length,
      generated_at: new Date().toISOString(),
    });
  });

  // G. GET /api/v1/console/reports/:report_id -- one report envelope.
  app.get<{ Params: { report_id: string } }>(
    "/api/v1/console/reports/:report_id",
    guard,
    async (request: FastifyRequest<{ Params: { report_id: string } }>, reply) => {
      await emitConsoleRead(
        request.auth!.entity_id,
        "/api/v1/console/reports/:report_id",
        { report_id: request.params.report_id },
      );
      const report = getConsoleReport(request.params.report_id);
      if (report === null) {
        return reply
          .code(404)
          .send({ ok: false, code: "REPORT_NOT_FOUND", message: "Unknown report_id" });
      }
      return reply.code(200).send({ ok: true, report, generated_at: new Date().toISOString() });
    },
  );
}
