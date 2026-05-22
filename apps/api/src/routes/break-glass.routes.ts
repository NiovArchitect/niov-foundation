// FILE: break-glass.routes.ts
// PURPOSE: HTTP surface for GOVSEC.5 break-glass / time-boxed audit
//          (GAP-K1, ADR-0050) BG.2 live integration. Two operator-tier
//          routes: invoke (create) a time-boxed emergency grant, and record
//          the mandatory post-hoc two-person review. The grant becomes
//          usable in the live dual-control request path via the recognition
//          seam in dual-control.middleware.ts (BG.2) -- these routes only
//          create and review grants; they do NOT execute privileged actions
//          and do NOT bypass anything themselves. justification is private
//          (it is stored + audited but NEVER returned in a response body).
// CONNECTS TO: admin.middleware.ts (requireAdminCapability "can_admin_niov"
//              -- both routes are platform-tier, matching the 4 dual-control
//              PRIVILEGED_ENDPOINTS actions); break-glass.service.ts
//              (createBreakGlassGrant / reviewBreakGlassGrant -- the BG.1
//              substrate; the service emits BREAK_GLASS_INVOKED /
//              BREAK_GLASS_REVIEWED audit in-tx and enforces mandatory
//              justification + future valid_until + 4-action scope +
//              reviewer != source); server.ts (registered alongside
//              registerEscalationRoutes).
//
// ERROR MAPPING (service domain-string throws -> stable HTTP codes):
//   - BREAK_GLASS_JUSTIFICATION_REQUIRED -> 400 (client validation)
//   - BREAK_GLASS_VALID_UNTIL_REQUIRED   -> 400 (client validation)
//   - BREAK_GLASS_VALID_UNTIL_IN_PAST    -> 400 (client validation)
//   - BREAK_GLASS_ACTION_NOT_PRIVILEGED  -> 400 (client validation: out of
//     the 4 dual-control privileged-action scope)
//   - BREAK_GLASS_NOT_FOUND              -> 404
//   - BREAK_GLASS_INVALID_TRANSITION     -> 409 (already reviewed, etc.)
//   - BREAK_GLASS_SELF_REVIEW_FORBIDDEN  -> 403 (reviewer === source)
//   - anything else                      -> rethrow (500)

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { requireAdminCapability } from "../middleware/admin.middleware.js";
import {
  createBreakGlassGrant,
  reviewBreakGlassGrant,
} from "../services/governance/break-glass.service.js";
import type { AuthService } from "../services/auth.service.js";

// WHAT: Map a break-glass service domain-string throw to an HTTP reply.
// INPUT: the caught error, the Fastify reply.
// OUTPUT: boolean -- true if it sent a reply, false if the caller should
//         rethrow.
// WHY: The break-glass service throws stable domain strings; this maps the
//      client-validation set to 400, self-review to 403, not-found to 404,
//      invalid-transition to 409, and lets anything unexpected bubble to a
//      500. The error message is the stable code; no private content (e.g.
//      justification) is ever echoed.
async function mapBreakGlassError(
  err: unknown,
  reply: FastifyReply,
): Promise<boolean> {
  if (!(err instanceof Error)) return false;
  const code = err.message;
  const map400 = new Set([
    "BREAK_GLASS_JUSTIFICATION_REQUIRED",
    "BREAK_GLASS_VALID_UNTIL_REQUIRED",
    "BREAK_GLASS_VALID_UNTIL_IN_PAST",
    "BREAK_GLASS_ACTION_NOT_PRIVILEGED",
  ]);
  if (map400.has(code)) {
    await reply.code(400).send({ ok: false, code });
    return true;
  }
  if (code === "BREAK_GLASS_SELF_REVIEW_FORBIDDEN") {
    await reply.code(403).send({
      ok: false,
      code,
      message: "The grant initiator may not review their own break-glass grant",
    });
    return true;
  }
  if (code === "BREAK_GLASS_NOT_FOUND") {
    await reply.code(404).send({ ok: false, code, message: "Grant not found" });
    return true;
  }
  if (code === "BREAK_GLASS_INVALID_TRANSITION") {
    await reply.code(409).send({
      ok: false,
      code,
      message: "Grant is not in a state that permits this transition",
    });
    return true;
  }
  return false;
}

// WHAT: Register the /api/v1/break-glass/* HTTP routes.
// INPUT: the Fastify instance + the AuthService (for requireAdminCapability).
// OUTPUT: A promise that resolves once the routes are registered.
// WHY: Exposes the break-glass invoke + review surface. Both routes are
//      can_admin_niov-gated (the platform tier of the 4 dual-control
//      privileged endpoints). The source/initiator and reviewer come from
//      the authenticated request context (request.auth.entity_id), never
//      from the body, so a caller cannot impersonate another actor.
export async function registerBreakGlassRoutes(
  app: FastifyInstance,
  authService: AuthService,
): Promise<void> {
  // POST /api/v1/break-glass/grants -- invoke (create) a time-boxed grant.
  // The caller (request.auth.entity_id) is the source/invoker. The service
  // enforces mandatory justification + future valid_until + 4-action scope
  // and emits BREAK_GLASS_INVOKED in-tx. justification is NOT echoed.
  app.post<{
    Body: { action_type?: string; justification?: string; valid_until?: string };
  }>(
    "/api/v1/break-glass/grants",
    { preHandler: requireAdminCapability(authService, "can_admin_niov") },
    async (
      request: FastifyRequest<{
        Body: {
          action_type?: string;
          justification?: string;
          valid_until?: string;
        };
      }>,
      reply,
    ) => {
      const sourceEntityId = request.auth!.entity_id;
      const body = request.body ?? {};
      // new Date(undefined) / new Date(garbage) -> Invalid Date (NaN); the
      // service maps that to BREAK_GLASS_VALID_UNTIL_REQUIRED. A past date
      // maps to BREAK_GLASS_VALID_UNTIL_IN_PAST. Mandatory valid_until.
      const validUntil = new Date(body.valid_until as unknown as string);
      try {
        const grant = await createBreakGlassGrant(sourceEntityId, {
          action_type: body.action_type as unknown as string,
          justification: body.justification as unknown as string,
          valid_until: validUntil,
        });
        // Response carries lifecycle metadata only -- NEVER justification.
        return reply.code(201).send({
          ok: true,
          grant: {
            grant_id: grant.grant_id,
            action_type: grant.action_type,
            status: grant.status,
            valid_from: grant.valid_from,
            valid_until: grant.valid_until,
          },
        });
      } catch (err) {
        if (await mapBreakGlassError(err, reply)) return;
        throw err;
      }
    },
  );

  // POST /api/v1/break-glass/grants/:grant_id/review -- record the mandatory
  // post-hoc two-person review. The reviewer (request.auth.entity_id) must be
  // distinct from the grant's source (the service throws
  // BREAK_GLASS_SELF_REVIEW_FORBIDDEN otherwise -> 403). Emits
  // BREAK_GLASS_REVIEWED in-tx. justification is NOT echoed.
  app.post<{ Params: { grant_id: string } }>(
    "/api/v1/break-glass/grants/:grant_id/review",
    { preHandler: requireAdminCapability(authService, "can_admin_niov") },
    async (
      request: FastifyRequest<{ Params: { grant_id: string } }>,
      reply,
    ) => {
      const reviewerEntityId = request.auth!.entity_id;
      try {
        const grant = await reviewBreakGlassGrant(
          request.params.grant_id,
          reviewerEntityId,
        );
        return reply.code(200).send({
          ok: true,
          grant: {
            grant_id: grant.grant_id,
            action_type: grant.action_type,
            status: grant.status,
            reviewed_at: grant.reviewed_at,
            reviewed_by_entity_id: grant.reviewed_by_entity_id,
          },
        });
      } catch (err) {
        if (await mapBreakGlassError(err, reply)) return;
        throw err;
      }
    },
  );
}
