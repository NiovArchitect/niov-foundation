// FILE: proposed-action.routes.ts
// PURPOSE: HTTP surface for the W5 Action Promotion Runtime per
//          ADR-0086 §4. Two routes preserve the route-bound static
//          dual-control posture of ADR-0026:
//
//          POST /api/v1/proposed-actions/:catalog_id/promote
//            bearer + can_admin_org; dual_control_satisfied: false;
//            409 DUAL_CONTROL_REQUIRED when the catalog flags it.
//
//          POST /api/v1/proposed-actions/:catalog_id/promote-dual-control
//            bearer + can_admin_org + requireDualControl(
//              PROPOSED_ACTION_DUAL_CONTROL_PROMOTION);
//            dual_control_satisfied: true.
//
//          Both routes delegate to promoteProposedActionForCaller;
//          the service is the single conversion point and the audit
//          emitter (PROPOSED_ACTION_REFERENCED).
//
// CONNECTS TO:
//   - apps/api/src/services/proposed-action/proposed-action-promotion.service.ts
//   - apps/api/src/middleware/admin.middleware.ts (requireAdminCapability)
//   - apps/api/src/middleware/dual-control.middleware.ts (requireDualControl)
//   - apps/api/src/security/privileged-endpoints.ts (PRIVILEGED_ENDPOINTS;
//     PROPOSED_ACTION_DUAL_CONTROL_PROMOTION descriptor)
//   - ADR-0086 §4

import type { FastifyInstance } from "fastify";
import { requireAdminCapability } from "../middleware/admin.middleware.js";
import { requireDualControl } from "../middleware/dual-control.middleware.js";
import { PRIVILEGED_ENDPOINTS } from "../security/privileged-endpoints.js";
import type { AuthService } from "../services/auth.service.js";
import {
  promoteProposedActionForCaller,
  validatePromoteBody,
} from "../services/proposed-action/proposed-action-promotion.service.js";

// WHAT: Register the W5 Action Promotion Runtime routes on the Fastify
//        app per ADR-0086 §4.
// INPUT: A Fastify instance + the shared AuthService.
// OUTPUT: A Promise that resolves once both routes are registered.
// WHY: Mirrors the registration-function pattern used by every other
//      route module in apps/api/src/routes/. server.ts wires this into
//      the boot sequence.
export async function registerProposedActionRoutes(
  app: FastifyInstance,
  authService: AuthService,
): Promise<void> {
  const dualControlEndpoint = PRIVILEGED_ENDPOINTS.find(
    (e) =>
      e.actionDescriptor.type === "PROPOSED_ACTION_DUAL_CONTROL_PROMOTION",
  );
  if (!dualControlEndpoint) {
    throw new Error(
      "PRIVILEGED_ENDPOINTS registry missing required entry for PROPOSED_ACTION_DUAL_CONTROL_PROMOTION",
    );
  }

  app.post<{
    Params: { catalog_id: string };
    Body: Record<string, unknown>;
  }>(
    "/api/v1/proposed-actions/:catalog_id/promote",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const body = request.body ?? {};
      const validation = validatePromoteBody(body);
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
      const result = await promoteProposedActionForCaller(
        callerId,
        {
          catalog_id: request.params.catalog_id,
          ...validation.normalized,
        },
        { dual_control_satisfied: false },
      );
      if (result.ok === true) {
        return reply.code(result.httpStatus).send({
          ok: true,
          action: result.action,
          proposed_action_catalog_id: result.proposed_action_catalog_id,
        });
      }
      const responseBody: Record<string, unknown> = {
        ok: false,
        code: result.code,
      };
      if (result.message !== undefined) responseBody.message = result.message;
      if (result.unknown_fields !== undefined) {
        responseBody.unknown_fields = result.unknown_fields;
      }
      if (result.invalid_fields !== undefined) {
        responseBody.invalid_fields = result.invalid_fields;
      }
      return reply.code(result.httpStatus).send(responseBody);
    },
  );

  app.post<{
    Params: { catalog_id: string };
    Body: Record<string, unknown>;
  }>(
    "/api/v1/proposed-actions/:catalog_id/promote-dual-control",
    {
      preHandler: [
        requireAdminCapability(authService, "can_admin_org"),
        requireDualControl(dualControlEndpoint),
      ],
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const body = request.body ?? {};
      const validation = validatePromoteBody(body);
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
      const result = await promoteProposedActionForCaller(
        callerId,
        {
          catalog_id: request.params.catalog_id,
          ...validation.normalized,
        },
        { dual_control_satisfied: true },
      );
      if (result.ok === true) {
        return reply.code(result.httpStatus).send({
          ok: true,
          action: result.action,
          proposed_action_catalog_id: result.proposed_action_catalog_id,
        });
      }
      const responseBody: Record<string, unknown> = {
        ok: false,
        code: result.code,
      };
      if (result.message !== undefined) responseBody.message = result.message;
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
