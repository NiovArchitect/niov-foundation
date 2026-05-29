// FILE: actions.routes.ts
// PURPOSE: HTTP surface for POST /api/v1/actions per ADR-0057 §9.
//          The route is bearer + "write"-gated; NO dual-control
//          preHandler (per ADR-0057 §9 "NO at create (policy evaluator
//          decides)"). All semantic + transactional work lives in
//          apps/api/src/services/action/action.service.ts.
// CONNECTS TO: services/action/action.service.ts (createActionForCaller +
//              validateCreateActionBody), middleware/auth.middleware.ts
//              (requireAuth), services/auth.service.ts (AuthService type).

import type { FastifyInstance } from "fastify";
import { requireAuth } from "../middleware/auth.middleware.js";
import type { AuthService } from "../services/auth.service.js";
import {
  createActionForCaller,
  validateCreateActionBody,
} from "../services/action/action.service.js";

// WHAT: Register the POST /api/v1/actions route on the Fastify app.
// INPUT: A Fastify instance + the shared AuthService.
// OUTPUT: A Promise that resolves once the route is registered.
// WHY: Mirrors the registration-function pattern used by every other
//      route module (registerOrgRoutes / registerEscalationRoutes /
//      etc.). server.ts wires this into the boot sequence.
export async function registerActionsRoutes(
  app: FastifyInstance,
  authService: AuthService,
): Promise<void> {
  app.post<{ Body: Record<string, unknown> }>(
    "/api/v1/actions",
    {
      preHandler: requireAuth(authService, "write"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const body = request.body ?? {};
      // Step 1 — body validation (UNKNOWN_FIELD / INVALID_FIELD).
      const validation = validateCreateActionBody(body);
      if (validation.ok === false) {
        return reply.code(422).send({
          ok: false,
          code: validation.code,
          ...(validation.unknown_fields !== undefined && {
            unknown_fields: validation.unknown_fields,
          }),
          ...(validation.invalid_fields !== undefined && {
            invalid_fields: validation.invalid_fields,
          }),
        });
      }
      // Step 2 — call the service.
      const result = await createActionForCaller(callerId, validation.normalized);
      // Step 3 — map result to HTTP response.
      if (result.ok === true) {
        return reply.code(result.httpStatus).send({
          ok: true,
          action: result.view,
        });
      }
      // result.ok === false
      const responseBody: Record<string, unknown> = {
        ok: false,
        code: result.code,
      };
      if (result.message !== undefined) responseBody.message = result.message;
      if (result.view !== undefined) responseBody.action = result.view;
      if (result.unknown_fields !== undefined) {
        responseBody.unknown_fields = result.unknown_fields;
      }
      if (result.invalid_fields !== undefined) {
        responseBody.invalid_fields = result.invalid_fields;
      }
      return reply.code(result.httpStatus).send(responseBody);
    },
  );
}
