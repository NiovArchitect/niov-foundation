// FILE: cohort.routes.ts
// PURPOSE: Phase 1305-A — HTTP surface for the Federation Cloud COHORT DATA
//          PRODUCT registry + policy evaluator. Backend-only governed substrate
//          (no UI, no real signal, no settlement). Every handler extracts a
//          bearer token inline and delegates to FederationCloudCohortService;
//          service failure codes map to HTTP via FAILURE_STATUS.
//
// CONNECTS TO: apps/api/src/services/foundation/federation-cloud-cohort.service.ts,
//              apps/api/src/server.ts (registerCohortRoutes wiring).
//
// SAFETY: bearer-gated; tenant-scoped + enumeration-safe in the service; the
// route returns only the SAFE projection / structured decision the service
// produces (no raw data, no provider internals, no contributor identities).

import type { FastifyInstance } from "fastify";
import type { FederationCloudCohortService } from "../services/foundation/federation-cloud-cohort.service.js";

// WHAT: Pull the bearer token out of an Authorization header.
// WHY: cohort routes are unauthenticated at the Fastify layer; the service
//      validates the session. Mirrors foundation.routes.ts:bearerFrom.
function bearerFrom(value: string | string[] | undefined): string | null {
  const header = Array.isArray(value) ? value[0] : value;
  if (typeof header !== "string") return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match && match[1] ? match[1].trim() : null;
}

// Service failure code → HTTP status. Unknown codes default to 403.
const FAILURE_STATUS: Record<string, number> = {
  SESSION_INVALID: 401,
  SESSION_EXPIRED: 401,
  NOT_AUTHORIZED: 403,
  DISCOVERY_BLOCKED_HIGH_SENSITIVITY: 403,
  COHORT_PRODUCT_NOT_FOUND: 404,
  INVALID_REQUEST: 422,
  INVALID_COHORT_TYPE: 422,
  INVALID_ACCESS_MODE: 422,
  INVALID_USE_RIGHT: 422,
  INVALID_SENSITIVE_CATEGORY: 422,
  INVALID_COHORT_SIZE: 422,
  INVALID_DISCOVERY_SCOPE: 422,
  INVALID_STATUS: 422,
};

function failureStatus(code: string): number {
  return FAILURE_STATUS[code] ?? 403;
}

// WHAT: Register the cohort data product routes.
// WHY: called from server.ts after the service is constructed.
export async function registerCohortRoutes(
  app: FastifyInstance,
  cohortService: FederationCloudCohortService,
): Promise<void> {
  // Register a cohort data product (caller is the provider).
  app.post<{ Body: Record<string, unknown> }>(
    "/api/v1/foundation/cohorts",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const b = request.body ?? {};
      if (typeof b.title !== "string" || typeof b.cohort_type !== "string")
        return reply.code(422).send({ ok: false, code: "INVALID_REQUEST" });
      const result = await cohortService.registerCohortForCaller(
        token,
        b as never,
      );
      if (result.ok === false)
        return reply
          .code(failureStatus(result.code))
          .send({ ok: false, code: result.code });
      return reply.code(201).send({ ok: true, cohort: result.cohort });
    },
  );

  // List cohort products visible to the caller (own + ACTIVE in org).
  app.get<{ Querystring: { cohort_type?: string } }>(
    "/api/v1/foundation/cohorts",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const result = await cohortService.listCohortsForCaller(token, {
        cohort_type: request.query.cohort_type,
      });
      if (result.ok === false)
        return reply
          .code(failureStatus(result.code))
          .send({ ok: false, code: result.code });
      return reply.code(200).send({ ok: true, cohorts: result.cohorts });
    },
  );

  // Read one cohort product (enumeration-safe).
  app.get<{ Params: { id: string } }>(
    "/api/v1/foundation/cohorts/:id",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const result = await cohortService.getCohortForCaller(
        token,
        request.params.id,
      );
      if (result.ok === false)
        return reply
          .code(failureStatus(result.code))
          .send({ ok: false, code: result.code });
      return reply.code(200).send({ ok: true, cohort: result.cohort });
    },
  );

  // Provider-only lifecycle transition (ARCHIVED soft-retires, RULE 10).
  app.patch<{ Params: { id: string }; Body: { status?: string } }>(
    "/api/v1/foundation/cohorts/:id/status",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const status = request.body?.status;
      if (typeof status !== "string")
        return reply.code(422).send({ ok: false, code: "INVALID_STATUS" });
      const result = await cohortService.updateCohortStatusForCaller(
        token,
        request.params.id,
        status,
      );
      if (result.ok === false)
        return reply
          .code(failureStatus(result.code))
          .send({ ok: false, code: result.code });
      return reply.code(200).send({ ok: true, cohort: result.cohort });
    },
  );

  // Evaluate a (use, access_mode) request — structured decision, never data.
  app.post<{
    Params: { id: string };
    Body: { requested_use?: string; requested_access_mode?: string };
  }>("/api/v1/foundation/cohorts/:id/evaluate", async (request, reply) => {
    const token = bearerFrom(request.headers.authorization);
    if (token === null)
      return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
    const b = request.body ?? {};
    const result = await cohortService.evaluateCohortAccessForCaller(
      token,
      request.params.id,
      { requested_use: b.requested_use, requested_access_mode: b.requested_access_mode },
    );
    if (result.ok === false)
      return reply
        .code(failureStatus(result.code))
        .send({ ok: false, code: result.code });
    return reply.code(200).send({
      ok: true,
      cohort_product_id: result.cohort_product_id,
      access: result.access,
    });
  });
}
