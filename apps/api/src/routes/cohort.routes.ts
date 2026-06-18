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
import type { CohortContributionService } from "../services/foundation/cohort-contribution.service.js";
import type { CohortAccessRequestService } from "../services/foundation/cohort-access-request.service.js";

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
  // Phase 1306-A contribution accounting.
  INVALID_CONTRIBUTION_SCOPE: 422,
  CONSENT_REQUIRED: 422,
  CONSENT_NOT_FOUND: 404,
  CONSENT_MISMATCH: 422,
  CONSENT_INACTIVE: 409,
  CONTRIBUTION_NOT_FOUND: 404,
  // Phase 1307-A access request lifecycle.
  COHORT_NOT_ACTIVE: 409,
  ACCESS_MODE_NOT_OFFERED: 422,
  USE_NOT_PERMITTED: 422,
  TRAINING_NOT_PERMITTED: 422,
  MODEL_IMPROVEMENT_NOT_PERMITTED: 422,
  ACCESS_REQUEST_NOT_FOUND: 404,
  INVALID_DECISION: 422,
  INVALID_EXPIRY: 422,
  SELF_APPROVAL_FORBIDDEN: 403,
  REQUEST_NOT_PENDING: 409,
  REQUEST_NOT_REVOCABLE: 409,
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

// WHAT: Register the Phase 1306-A cohort CONTRIBUTION accounting routes.
// WHY: provider/admin-only internal accounting; NO buyer-facing identities.
export async function registerCohortContributionRoutes(
  app: FastifyInstance,
  contributionService: CohortContributionService,
): Promise<void> {
  // Record a contribution (provider/admin only).
  app.post<{ Params: { id: string }; Body: Record<string, unknown> }>(
    "/api/v1/foundation/cohorts/:id/contributions",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const result = await contributionService.recordContributionForCaller(
        token,
        request.params.id,
        (request.body ?? {}) as never,
      );
      if (result.ok === false)
        return reply
          .code(failureStatus(result.code))
          .send({ ok: false, code: result.code });
      return reply.code(201).send({ ok: true, contribution: result.contribution });
    },
  );

  // List contributions (provider/admin only) — safe rows + eligible summary.
  app.get<{ Params: { id: string } }>(
    "/api/v1/foundation/cohorts/:id/contributions",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const result = await contributionService.listContributionsForCaller(
        token,
        request.params.id,
      );
      if (result.ok === false)
        return reply
          .code(failureStatus(result.code))
          .send({ ok: false, code: result.code });
      return reply
        .code(200)
        .send({ ok: true, contributions: result.contributions, summary: result.summary });
    },
  );

  // Revoke a contribution (provider/admin only).
  app.post<{ Params: { id: string; cid: string } }>(
    "/api/v1/foundation/cohorts/:id/contributions/:cid/revoke",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const result = await contributionService.revokeContributionForCaller(
        token,
        request.params.id,
        request.params.cid,
      );
      if (result.ok === false)
        return reply
          .code(failureStatus(result.code))
          .send({ ok: false, code: result.code });
      return reply.code(200).send({ ok: true, contribution: result.contribution });
    },
  );
}

// WHAT: Register the Phase 1307-A cohort ACCESS REQUEST lifecycle routes.
// WHY: a buyer requests access (open to AI buyers — requesting ≠ granting); a
//      HUMAN provider/admin decides or revokes (the service enforces the
//      human-decider gate + self-approval forbidden). No data delivered here.
export async function registerCohortAccessRequestRoutes(
  app: FastifyInstance,
  accessRequestService: CohortAccessRequestService,
): Promise<void> {
  // Create an access request (the caller is the buyer).
  app.post<{ Params: { id: string }; Body: Record<string, unknown> }>(
    "/api/v1/foundation/cohorts/:id/access-requests",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const b = request.body ?? {};
      const result = await accessRequestService.createAccessRequestForCaller(
        token,
        request.params.id,
        {
          intended_use: b.intended_use as string | undefined,
          requested_access_mode: b.requested_access_mode as string | undefined,
          retention_policy: b.retention_policy as string | null | undefined,
        },
      );
      if (result.ok === false)
        return reply
          .code(failureStatus(result.code))
          .send({ ok: false, code: result.code });
      return reply.code(201).send({ ok: true, access_request: result.access_request });
    },
  );

  // List access requests — manager sees all; buyer sees own.
  app.get<{ Params: { id: string } }>(
    "/api/v1/foundation/cohorts/:id/access-requests",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const result = await accessRequestService.listAccessRequestsForCaller(
        token,
        request.params.id,
      );
      if (result.ok === false)
        return reply
          .code(failureStatus(result.code))
          .send({ ok: false, code: result.code });
      return reply.code(200).send({
        ok: true,
        access_requests: result.access_requests,
        is_manager: result.is_manager,
      });
    },
  );

  // Decide a PENDING request (APPROVED / DENIED) — human provider/admin only.
  app.post<{
    Params: { id: string; rid: string };
    Body: { decision?: string; decision_reason?: string | null; expires_at?: string | null };
  }>(
    "/api/v1/foundation/cohorts/:id/access-requests/:rid/decide",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const b = request.body ?? {};
      const result = await accessRequestService.decideAccessRequestForCaller(
        token,
        request.params.id,
        request.params.rid,
        {
          decision: b.decision,
          decision_reason: b.decision_reason,
          expires_at: b.expires_at,
        },
      );
      if (result.ok === false)
        return reply
          .code(failureStatus(result.code))
          .send({ ok: false, code: result.code });
      return reply.code(200).send({ ok: true, access_request: result.access_request });
    },
  );

  // Revoke a PENDING / APPROVED request — human provider/admin only.
  app.post<{
    Params: { id: string; rid: string };
    Body: { decision_reason?: string | null };
  }>(
    "/api/v1/foundation/cohorts/:id/access-requests/:rid/revoke",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const result = await accessRequestService.revokeAccessRequestForCaller(
        token,
        request.params.id,
        request.params.rid,
        { decision_reason: (request.body ?? {}).decision_reason },
      );
      if (result.ok === false)
        return reply
          .code(failureStatus(result.code))
          .send({ ok: false, code: result.code });
      return reply.code(200).send({ ok: true, access_request: result.access_request });
    },
  );
}
