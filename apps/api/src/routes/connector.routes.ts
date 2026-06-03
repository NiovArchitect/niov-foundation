// FILE: connector.routes.ts
// PURPOSE: Section 4 Wave 2 admin routes for ConnectorBinding
//          governance. All routes are can_admin_org-gated + scoped
//          to the caller's org via getOrgEntityId (the canonical
//          org.routes.ts pattern). Cross-org binding probes collapse
//          to enumeration-safe 404 BINDING_NOT_FOUND.
// CONNECTS TO:
//   - apps/api/src/services/connector/connector-binding.service.ts
//   - apps/api/src/middleware/admin.middleware.ts (requireAdminCapability)
//   - apps/api/src/services/governance/org.js (getOrgEntityId)

import type { FastifyInstance, FastifyReply } from "fastify";
import { requireAdminCapability } from "../middleware/admin.middleware.js";
import { getOrgEntityId } from "../services/governance/org.js";
import type { AuthService } from "../services/auth.service.js";
import {
  getConnectorBindingForOrgService,
  listConnectorBindingsForOrgService,
  registerConnectorBindingForOrg,
  softDeleteConnectorBindingForOrgService,
  updateConnectorBindingForOrgService,
} from "../services/connector/connector-binding.service.js";
import type {
  ConnectorBindingFailure,
  RegisterConnectorBindingInput,
  UpdateConnectorBindingInput,
} from "../services/connector/connector-binding.service.js";

// WHAT: Resolve the caller's org_entity_id or send a 404 and return
//        null. Mirrors the canonical resolveOrgOrFail helper in
//        org.routes.ts (kept local to avoid cross-route coupling).
// INPUT: entityId + reply.
// OUTPUT: Promise<string | null>.
// WHY: Cross-tenant fail-closed: an admin without an org gets a
//      404 NO_ORG_FOR_CALLER before any binding-row read happens.
async function resolveOrgOrFail(
  entityId: string,
  reply: FastifyReply,
): Promise<string | null> {
  try {
    return await getOrgEntityId(entityId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    if (message === "NOT_IN_ANY_ORG" || message === "ORG_HIERARCHY_TOO_DEEP") {
      await reply.code(404).send({
        ok: false,
        code: "NO_ORG_FOR_CALLER",
        message: "Caller is not in an organization",
      });
      return null;
    }
    throw err;
  }
}

// WHAT: Map a ConnectorBindingFailure code to an HTTP status.
// INPUT: ConnectorBindingFailure.
// OUTPUT: number (HTTP status).
// WHY: Centralizes the route-tier status mapping so all four routes
//      surface the same code → status table.
function statusFor(failure: ConnectorBindingFailure): number {
  switch (failure.code) {
    case "INVALID_FIELD":
    case "UNKNOWN_CONNECTOR_TYPE":
    case "SECRET_REF_REQUIRED":
    case "SECRET_REF_INVALID":
      return 422;
    case "ENTITLEMENT_INSUFFICIENT":
      return 403;
    case "BINDING_NOT_FOUND":
      return 404;
    case "DUPLICATE_DISPLAY_NAME":
      return 409;
    case "INTERNAL_ERROR":
      return 500;
  }
}

// WHAT: Register the 5 Wave 2 admin connector routes.
// INPUT: Fastify instance + AuthService.
// OUTPUT: A promise resolving once registration completes.
// WHY: Mirrors registerOrgRoutes / registerAuditRoutes pattern. All
//      routes require can_admin_org TAR capability + an org. The
//      can_admin_niov path is intentionally NOT a shortcut here —
//      platform admins manage connectors through their own org
//      membership like everyone else (no cross-org connector mgmt).
export async function registerConnectorRoutes(
  app: FastifyInstance,
  authService: AuthService,
): Promise<void> {
  // POST /api/v1/org/connectors — register a new binding.
  app.post<{ Body: RegisterConnectorBindingInput }>(
    "/api/v1/org/connectors",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;
      const result = await registerConnectorBindingForOrg({
        org_entity_id: orgEntityId,
        actor_entity_id: callerId,
        body: request.body ?? {},
      });
      if (result.ok === true) {
        return reply.code(201).send({
          ok: true,
          binding: result.view,
          audit_event_id: result.audit_event_id,
        });
      }
      return reply.code(statusFor(result)).send({
        ok: false,
        code: result.code,
        ...(result.message !== undefined ? { message: result.message } : {}),
        ...(result.invalid_fields !== undefined
          ? { invalid_fields: result.invalid_fields }
          : {}),
        ...(result.reason_code !== undefined
          ? { reason_code: result.reason_code }
          : {}),
        ...(result.feature_id !== undefined
          ? { feature_id: result.feature_id }
          : {}),
      });
    },
  );

  // GET /api/v1/org/connectors — list bindings for caller's org.
  app.get<{ Querystring: { enabled?: string } }>(
    "/api/v1/org/connectors",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;
      // Optional enabled filter at the route tier — string parse
      // because Fastify query values are strings.
      let enabled: boolean | undefined = undefined;
      const raw = request.query.enabled;
      if (raw === "true") enabled = true;
      else if (raw === "false") enabled = false;
      else if (raw !== undefined) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_FIELD",
          invalid_fields: ["enabled"],
        });
      }
      const result = await listConnectorBindingsForOrgService({
        org_entity_id: orgEntityId,
        enabled,
      });
      return reply.code(200).send({
        ok: true,
        bindings: result.bindings,
      });
    },
  );

  // GET /api/v1/org/connectors/:id — single binding view.
  app.get<{ Params: { id: string } }>(
    "/api/v1/org/connectors/:id",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;
      const result = await getConnectorBindingForOrgService({
        binding_id: request.params.id,
        org_entity_id: orgEntityId,
      });
      if (result.ok === true) {
        return reply.code(200).send({ ok: true, binding: result.view });
      }
      return reply.code(statusFor(result)).send({
        ok: false,
        code: result.code,
        ...(result.message !== undefined ? { message: result.message } : {}),
        ...(result.invalid_fields !== undefined
          ? { invalid_fields: result.invalid_fields }
          : {}),
      });
    },
  );

  // PATCH /api/v1/org/connectors/:id — update / enable / disable.
  app.patch<{
    Params: { id: string };
    Body: UpdateConnectorBindingInput;
  }>(
    "/api/v1/org/connectors/:id",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;
      const result = await updateConnectorBindingForOrgService({
        binding_id: request.params.id,
        org_entity_id: orgEntityId,
        actor_entity_id: callerId,
        body: request.body ?? {},
      });
      if (result.ok === true) {
        return reply.code(200).send({
          ok: true,
          binding: result.view,
          audit_event_id: result.audit_event_id,
        });
      }
      return reply.code(statusFor(result)).send({
        ok: false,
        code: result.code,
        ...(result.message !== undefined ? { message: result.message } : {}),
        ...(result.invalid_fields !== undefined
          ? { invalid_fields: result.invalid_fields }
          : {}),
      });
    },
  );

  // DELETE /api/v1/org/connectors/:id — soft-delete (RULE 10).
  app.delete<{ Params: { id: string } }>(
    "/api/v1/org/connectors/:id",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;
      const result = await softDeleteConnectorBindingForOrgService({
        binding_id: request.params.id,
        org_entity_id: orgEntityId,
        actor_entity_id: callerId,
      });
      if (result.ok === true) {
        return reply.code(200).send({
          ok: true,
          audit_event_id: result.audit_event_id,
        });
      }
      return reply.code(statusFor(result)).send({
        ok: false,
        code: result.code,
        ...(result.message !== undefined ? { message: result.message } : {}),
        ...(result.invalid_fields !== undefined
          ? { invalid_fields: result.invalid_fields }
          : {}),
      });
    },
  );
}
