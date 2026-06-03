// FILE: actions.routes.ts
// PURPOSE: HTTP surface for POST /api/v1/actions per ADR-0057 §9
//          (create-time) + POST /api/v1/actions/:id/cancel per
//          ADR-0057 §6 (caller-initiated non-RUNNING cancellation).
//          Both routes are bearer + "write"-gated; NO dual-control
//          preHandler on create (per ADR-0057 §9 "NO at create (policy
//          evaluator decides)"); NO dual-control preHandler on cancel
//          (the source-entity ownership check at the service tier is
//          the gate; RUNNING -> CANCELLED is privileged and is
//          rejected with 403 / 409 by the cancel service, deferring
//          to a future break-glass-gated route).
// CONNECTS TO: services/action/action.service.ts (createActionForCaller +
//              validateCreateActionBody), services/action/cancel.service.ts
//              (cancelActionForCaller + validateCancelActionBody),
//              middleware/auth.middleware.ts (requireAuth),
//              services/auth.service.ts (AuthService type).

import type { FastifyInstance } from "fastify";
import { requireAuth } from "../middleware/auth.middleware.js";
import type { AuthService } from "../services/auth.service.js";
import {
  createActionForCaller,
  validateCreateActionBody,
} from "../services/action/action.service.js";
import {
  cancelActionForCaller,
  validateCancelActionBody,
} from "../services/action/cancel.service.js";
import { getActionForCaller } from "../services/action/get.service.js";
import {
  listActionsForCaller,
  validateListActionsQuery,
} from "../services/action/list.service.js";
import { getActionAttemptForCaller } from "../services/action/attempt.service.js";
import {
  listActionAttemptsForCaller,
  validateListAttemptsQuery,
} from "../services/action/attempt-list.service.js";
import { getOrgEntityId } from "../services/governance/org.js";
import { recordUsageForOrg } from "../services/billing/usage-meter.service.js";

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
        // B6-α telemetry counter — record one action creation
        // against the caller's org meter
        // `meter.actions-created.v1`. Closes the Section 2 Action
        // create-volume billing-tier surface. Telemetry isolation
        // try/catch swallows all failures so the action response
        // is never blocked by meter issues.
        try {
          const orgEntityId = await getOrgEntityId(callerId);
          await recordUsageForOrg(
            orgEntityId,
            "meter.actions-created.v1",
            1,
          );
        } catch {
          // intentionally swallowed; telemetry must not affect
          // the action response.
        }
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

  // ADR-0057 §6 cancel route. Bearer + "write"-gated; source-entity
  // ownership enforced at the service tier. Non-RUNNING cancellation
  // only at this slice; RUNNING -> CANCELLED requires the future
  // break-glass-gated privileged route per ADR-0050.
  app.post<{
    Params: { id: string };
    Body: Record<string, unknown> | undefined;
  }>(
    "/api/v1/actions/:id/cancel",
    {
      preHandler: requireAuth(authService, "write"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const actionId = request.params.id;
      const validation = validateCancelActionBody(request.body ?? undefined);
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
      const result = await cancelActionForCaller(
        callerId,
        actionId,
        validation.normalized,
      );
      if (result.ok === true) {
        return reply.code(result.httpStatus).send({
          ok: true,
          action: result.view,
        });
      }
      const responseBody: Record<string, unknown> = {
        ok: false,
        code: result.code,
      };
      if (result.message !== undefined) responseBody.message = result.message;
      if (result.view !== undefined) responseBody.action = result.view;
      return reply.code(result.httpStatus).send(responseBody);
    },
  );

  // ADR-0057 §9 GET viewer route. Bearer + "read"-gated.
  // Self-scope OR can_admin_org-over-same-org authorization at the
  // service tier. Returns the safe Action view + ActionAttempt
  // count + last ActionResult.result_summary. Forbidden fields per
  // ADR-0057 §10 are NEVER in the response.
  app.get<{ Params: { id: string } }>(
    "/api/v1/actions/:id",
    {
      preHandler: requireAuth(authService, "read"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const result = await getActionForCaller(callerId, request.params.id);
      if (result.ok === true) {
        return reply.code(result.httpStatus).send({
          ok: true,
          action: result.view,
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

  // ADR-0057 §9 list route. Bearer + "read"-gated.
  // Self-scope by default; ?org_scope=true requires can_admin_org.
  // Standard pagination + optional status / risk_tier / action_type
  // filters. Safe-view-only projection per ADR-0057 §10.
  app.get<{ Querystring: Record<string, unknown> }>(
    "/api/v1/actions",
    {
      preHandler: requireAuth(authService, "read"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const validation = validateListActionsQuery(request.query);
      if (validation.ok === false) {
        return reply.code(422).send({
          ok: false,
          code: validation.code,
          invalid_fields: validation.invalid_fields,
        });
      }
      const result = await listActionsForCaller(callerId, validation.normalized);
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

  // ADR-0057 §9 ActionAttempt detail route. Bearer + "read"-gated.
  // Same authorization spine as the GET viewer (source self-scope
  // OR can_admin_org-over-same-org). Returns the SAFE ActionAttempt
  // view + the attempt's latest ActionResult (when present).
  // Forbidden fields per ADR-0057 §10 are NEVER in the response.
  app.get<{ Params: { id: string; attempt_id: string } }>(
    "/api/v1/actions/:id/attempts/:attempt_id",
    {
      preHandler: requireAuth(authService, "read"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const result = await getActionAttemptForCaller(
        callerId,
        request.params.id,
        request.params.attempt_id,
      );
      if (result.ok === true) {
        return reply.code(result.httpStatus).send({
          ok: true,
          attempt: result.view,
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

  // ADR-0057 Wave 10 ActionAttempt list route. Bearer + "read"-gated.
  // Same authorization spine as the GET viewer + attempt-detail
  // (source self-scope OR can_admin_org-over-same-org). Returns a
  // paginated list of SafeActionAttemptView for the parent Action.
  // Standard pagination + optional outcome filter. Forbidden fields
  // per ADR-0057 §10 are NEVER in any item or page envelope.
  app.get<{
    Params: { id: string };
    Querystring: Record<string, unknown>;
  }>(
    "/api/v1/actions/:id/attempts",
    {
      preHandler: requireAuth(authService, "read"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const validation = validateListAttemptsQuery(request.query);
      if (validation.ok === false) {
        return reply.code(422).send({
          ok: false,
          code: validation.code,
          invalid_fields: validation.invalid_fields,
        });
      }
      const result = await listActionAttemptsForCaller(
        callerId,
        request.params.id,
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
