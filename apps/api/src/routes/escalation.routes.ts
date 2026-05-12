// FILE: escalation.routes.ts
// PURPOSE: HTTP surface for EscalationRequest resolution operations
//          (approve / reject / get-one / get-pending). The
//          source != resolver dual-control gate is enforced
//          SERVICE-TIER at transitionPendingForCaller's skeleton gate
//          (a source-only caller fails per [D-2D-D10-2]); these routes
//          map the domain-string throws to HTTP codes and add no
//          route-tier dual-control middleware. That is the D-2D-D10-7
//          scope decision per the COMPLIANCE_ARCHITECTURE_REVIEW.md
//          two-person-rule dimension ("enumerated set, not a general
//          primitive"); the generalized requireDualControl preHandler
//          that Section 12.5 Sub-box 2's "specific endpoint families"
//          will consume is forward-queue, built when that second
//          consumer lands.
// CONNECTS TO: auth.middleware.ts (requireAuth preHandler -- validates
//              the Bearer token, populates request.auth.entity_id);
//              services/governance/escalation.service.ts
//              (approveEscalationForCaller / rejectEscalationForCaller
//              / getEscalationForCaller / listEscalationsPendingForCaller
//              -- the service-tier gate + the canonical
//              ESCALATION_APPROVED / ESCALATION_REJECTED audit events
//              fire from transitionPendingForCaller, so these routes
//              write nothing additional); server.ts (registered
//              alongside registerOrgRoutes).
//
// 4-FRAMING-REGISTER CROSS-REFERENCE (RULE 17 load-on-open):
//   - RAA 12.8 §5.2 -- approval workflow primitives (the resolution-
//     side surface of the escalation status workflow PENDING ->
//     APPROVED/REJECTED; the service-tier gate is "transition
//     restricted to authorized resolver per §5.8")
//   - Section 12.5 Sub-box 1 -- D-2D-D10-7 dual-control HTTP surface
//     (consumer-facing resolution; the generalized requireDualControl
//     preHandler is deferred to Sub-box 2 per the "enumerated set"
//     framing)
//   - ADDENDUM-DMW-SLM §5 -- substantiates the "Audit lineage per
//     operation (Zone U1-U4)" + "Permission-governed composition"
//     categorical distinctions at the route tier (sequential with the
//     [D-2D-D10-5] / [D-2D-D10-6] runtime-register substantiations)
//   - COMPLIANCE_ARCHITECTURE_REVIEW.md (two-person rule dimension) --
//     Patent Relevance: None; conventional implementation; enumerated
//     dual-control set, not a general primitive

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Prisma } from "@niov/database";
import { requireAuth } from "../middleware/auth.middleware.js";
import {
  approveEscalationForCaller,
  getEscalationForCaller,
  listEscalationsPendingForCaller,
  rejectEscalationForCaller,
} from "../services/governance/escalation.service.js";
import type { AuthService } from "../services/auth.service.js";

// WHAT: Default page size for GET /api/v1/escalations/pending.
// INPUT: None.
// OUTPUT: A number.
// WHY: A caller without ?limit= gets a sensible bound; a caller with
//      a bad ?limit= falls back to this rather than erroring.
const DEFAULT_PENDING_LIMIT = 50;
// WHAT: Hard ceiling on the pending page size so a hostile ?limit=
//        cannot demand an unbounded scan.
const MAX_PENDING_LIMIT = 200;

// WHAT: Map an escalation-service domain-string throw to an HTTP
//        reply. Returns true if it handled the error (sent a reply),
//        false if the caller should rethrow.
// INPUT: the caught error, the Fastify reply.
// OUTPUT: boolean -- handled?
// WHY: The three escalation domain errors (ESCALATION_FORBIDDEN /
//      ESCALATION_NOT_FOUND / ESCALATION_INVALID_TRANSITION) map to
//      403 / 404 / 409; anything else is an unexpected 500 the route
//      should not swallow.
async function mapEscalationError(
  err: unknown,
  reply: FastifyReply,
): Promise<boolean> {
  if (!(err instanceof Error)) return false;
  if (err.message === "ESCALATION_FORBIDDEN") {
    await reply.code(403).send({
      ok: false,
      code: "ESCALATION_FORBIDDEN",
      message: "Caller is not authorized to resolve or view this escalation",
    });
    return true;
  }
  if (err.message === "ESCALATION_NOT_FOUND") {
    await reply.code(404).send({
      ok: false,
      code: "ESCALATION_NOT_FOUND",
      message: "Escalation not found",
    });
    return true;
  }
  if (err.message === "ESCALATION_INVALID_TRANSITION") {
    await reply.code(409).send({
      ok: false,
      code: "ESCALATION_INVALID_TRANSITION",
      message: "Escalation is not in PENDING state",
    });
    return true;
  }
  return false;
}

// WHAT: Register the /api/v1/escalations/* HTTP routes.
// INPUT: the Fastify instance and the AuthService (for the
//        requireAuth preHandler).
// OUTPUT: A promise that resolves once the routes are registered.
// WHY: Exposes the EscalationRequest resolution surface. The
//      authorization (is this caller the target/resolver?) is the
//      service-tier gate's job; these routes do auth (token validity)
//      + error mapping. POST /api/v1/escalations (general create) is
//      deliberately NOT exposed -- the only escalation-creation path
//      is the gate-fail coupling at negotiate.service.ts per
//      [D-2D-D10-5] (createGateEscalationForCaller).
export async function registerEscalationRoutes(
  app: FastifyInstance,
  authService: AuthService,
): Promise<void> {
  // POST /api/v1/escalations/:id/approve -- transition PENDING ->
  // APPROVED. The service-tier gate rejects a source-only caller
  // (dual-control: source != resolver) with ESCALATION_FORBIDDEN.
  app.post<{
    Params: { id: string };
    Body: { resolution_metadata?: Prisma.InputJsonValue };
  }>(
    "/api/v1/escalations/:id/approve",
    { preHandler: requireAuth(authService, "write") },
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { resolution_metadata?: Prisma.InputJsonValue };
      }>,
      reply,
    ) => {
      try {
        const escalation = await approveEscalationForCaller(
          request.auth!.entity_id,
          request.params.id,
          request.body?.resolution_metadata,
        );
        return reply.code(200).send({ ok: true, escalation });
      } catch (err) {
        if (await mapEscalationError(err, reply)) return;
        throw err;
      }
    },
  );

  // POST /api/v1/escalations/:id/reject -- transition PENDING ->
  // REJECTED. Same gate + error mapping as approve.
  app.post<{
    Params: { id: string };
    Body: { resolution_metadata?: Prisma.InputJsonValue };
  }>(
    "/api/v1/escalations/:id/reject",
    { preHandler: requireAuth(authService, "write") },
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { resolution_metadata?: Prisma.InputJsonValue };
      }>,
      reply,
    ) => {
      try {
        const escalation = await rejectEscalationForCaller(
          request.auth!.entity_id,
          request.params.id,
          request.body?.resolution_metadata,
        );
        return reply.code(200).send({ ok: true, escalation });
      } catch (err) {
        if (await mapEscalationError(err, reply)) return;
        throw err;
      }
    },
  );

  // GET /api/v1/escalations/pending -- the caller's own pending
  // escalations (newest first). listEscalationsPendingForCaller's gate
  // requires callerEntityId === targetEntityId, so this always passes
  // the caller as both.
  app.get<{ Querystring: { limit?: string } }>(
    "/api/v1/escalations/pending",
    { preHandler: requireAuth(authService, "read") },
    async (
      request: FastifyRequest<{ Querystring: { limit?: string } }>,
      reply,
    ) => {
      const rawLimit = Number.parseInt(request.query.limit ?? "", 10);
      const limit =
        Number.isFinite(rawLimit) && rawLimit > 0
          ? Math.min(rawLimit, MAX_PENDING_LIMIT)
          : DEFAULT_PENDING_LIMIT;
      const callerId = request.auth!.entity_id;
      const escalations = await listEscalationsPendingForCaller(
        callerId,
        callerId,
        limit,
      );
      return reply.code(200).send({ ok: true, escalations });
    },
  );

  // GET /api/v1/escalations/:id -- one escalation, if the caller is a
  // party (source / target / resolver). getEscalationForCaller returns
  // null for a non-existent id (-> 404) and throws ESCALATION_FORBIDDEN
  // for a non-party caller (-> 403).
  app.get<{ Params: { id: string } }>(
    "/api/v1/escalations/:id",
    { preHandler: requireAuth(authService, "read") },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      try {
        const escalation = await getEscalationForCaller(
          request.auth!.entity_id,
          request.params.id,
        );
        if (escalation === null) {
          return reply.code(404).send({
            ok: false,
            code: "ESCALATION_NOT_FOUND",
            message: "Escalation not found",
          });
        }
        return reply.code(200).send({ ok: true, escalation });
      } catch (err) {
        if (await mapEscalationError(err, reply)) return;
        throw err;
      }
    },
  );
}
