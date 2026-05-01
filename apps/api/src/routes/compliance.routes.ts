// FILE: compliance.routes.ts
// PURPOSE: HTTP surface for the Compliance Router.
// CONNECTS TO: ComplianceService.

import type { FastifyInstance } from "fastify";
import type { ComplianceService } from "../services/compliance/compliance.service.js";
import type { CapsuleType } from "@niov/database";

// WHAT: Pull the bearer token out of an Authorization header.
function bearerFrom(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || !value.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token.length === 0 ? null : token;
}

// WHAT: Map a service-level failure code to an HTTP status.
// INPUT: The code string.
// OUTPUT: An HTTP status number.
// WHY: 451 Unavailable for Legal Reasons is the right semantic
//      for a compliance-violation rejection.
function statusForCode(code: string): number {
  switch (code) {
    case "SESSION_INVALID":
    case "SESSION_EXPIRED":
    case "SESSION_REVOKED":
    case "SESSION_INVALIDATED":
      return 401;
    case "COMPLIANCE_CHECK_FAILED":
      return 451;
    case "INVALID_REQUEST":
      return 422;
    default:
      return 400;
  }
}

// WHAT: Register the three compliance routes on a Fastify instance.
// INPUT: Fastify instance and the ComplianceService.
// OUTPUT: A promise that resolves once routes are registered.
// WHY: One function = one place to wire the compliance HTTP surface.
export async function registerComplianceRoutes(
  app: FastifyInstance,
  complianceService: ComplianceService,
): Promise<void> {
  app.get("/api/v1/compliance/frameworks", async (_request, reply) => {
    const rows = await complianceService.listFrameworks();
    return reply.code(200).send({ ok: true, frameworks: rows });
  });

  app.post<{
    Body: {
      operation_type: string;
      target_id: string;
      capsule_id?: string | null;
      capsule_type?: CapsuleType | null;
    };
  }>("/api/v1/compliance/check", async (request, reply) => {
    const sessionToken = bearerFrom(request.headers.authorization);
    if (sessionToken === null) {
      return reply.code(401).send({
        ok: false,
        code: "SESSION_INVALID",
        message: "Missing bearer token",
      });
    }
    const body = request.body;
    if (
      !body ||
      typeof body.operation_type !== "string" ||
      typeof body.target_id !== "string"
    ) {
      return reply.code(422).send({
        ok: false,
        code: "INVALID_REQUEST",
        message: "operation_type and target_id are required",
      });
    }
    const result = await complianceService.checkOnBehalfOf(
      sessionToken,
      body.target_id,
      body.operation_type,
      body.capsule_id ?? null,
      body.capsule_type ?? null,
    );
    if (!result.ok) {
      return reply.code(statusForCode(result.code)).send(result);
    }
    if (!result.compliant) {
      return reply.code(451).send(result);
    }
    return reply.code(200).send(result);
  });

  app.get<{
    Querystring: {
      entity_id: string;
      framework?: string;
      date_from?: string;
      date_to?: string;
    };
  }>("/api/v1/compliance/report", async (request, reply) => {
    const sessionToken = bearerFrom(request.headers.authorization);
    if (sessionToken === null) {
      return reply.code(401).send({
        ok: false,
        code: "SESSION_INVALID",
        message: "Missing bearer token",
      });
    }
    const q = request.query;
    if (typeof q.entity_id !== "string" || q.entity_id.length === 0) {
      return reply.code(422).send({
        ok: false,
        code: "INVALID_REQUEST",
        message: "entity_id query parameter is required",
      });
    }
    const dateFrom = q.date_from
      ? new Date(q.date_from)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const dateTo = q.date_to ? new Date(q.date_to) : new Date();
    const report = await complianceService.generateComplianceReport(
      q.entity_id,
      q.framework ?? null,
      dateFrom,
      dateTo,
    );
    return reply.code(200).send({ ok: true, report });
  });
}
