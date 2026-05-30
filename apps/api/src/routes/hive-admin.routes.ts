// FILE: hive-admin.routes.ts
// PURPOSE: Section 3 Wave 3 admin routes for Hive governance per
//          ADR-0062. Mirrors the Section 4 connector admin route
//          pattern verbatim — every route is can_admin_org-gated +
//          scoped to caller's org via getOrgEntityId, with
//          enumeration-safe 404s for cross-org probes.
// CONNECTS TO:
//   - apps/api/src/services/hive/hive.service.ts (HiveService admin methods)
//   - apps/api/src/middleware/admin.middleware.ts (requireAdminCapability)
//   - apps/api/src/services/governance/org.ts (getOrgEntityId)

import type { FastifyInstance, FastifyReply } from "fastify";
import { requireAdminCapability } from "../middleware/admin.middleware.js";
import { getOrgEntityId } from "../services/governance/org.js";
import type { AuthService } from "../services/auth.service.js";
import type {
  HiveService,
  HiveAdminFailure,
} from "../services/hive/hive.service.js";

// WHAT: Resolve the caller's org_entity_id or send a 404 and return
//        null. Mirrors the canonical resolveOrgOrFail helper in
//        connector.routes.ts (kept local to avoid cross-route
//        coupling).
// INPUT: entityId + reply.
// OUTPUT: Promise<string | null>.
// WHY: Cross-tenant fail-closed: an admin without an org gets a
//      404 NO_ORG_FOR_CALLER before any hive-row read happens.
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

// WHAT: Map a HiveAdminFailure code to an HTTP status.
// INPUT: HiveAdminFailure.
// OUTPUT: number (HTTP status).
// WHY: ADR-0062 Sub-decision 6 — centralized statusFor mapping so
//      all four admin routes surface the same code → status table.
function statusFor(failure: HiveAdminFailure): number {
  switch (failure.code) {
    case "HIVE_NOT_FOUND":
    case "MEMBERSHIP_NOT_FOUND":
      return 404;
    case "INVALID_FIELD":
      return 422;
    case "INTERNAL_ERROR":
      return 500;
  }
}

// WHAT: Register the 4 Wave 3 admin hive routes.
// INPUT: Fastify instance + AuthService + HiveService.
// OUTPUT: A promise that resolves once routes are registered.
// WHY: Mirrors registerConnectorRoutes pattern verbatim. All routes
//      require can_admin_org TAR capability + org membership.
//      can_admin_niov is NOT a shortcut — platform admins manage
//      their own org's hives through their own org membership, not
//      a cross-org bypass.
export async function registerHiveAdminRoutes(
  app: FastifyInstance,
  authService: AuthService,
  hiveService: HiveService,
): Promise<void> {
  // GET /api/v1/org/hives — list hives for caller's org.
  app.get<{ Querystring: { status?: string } }>(
    "/api/v1/org/hives",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;

      // Optional status filter at the route tier — string parse
      // because Fastify query values are strings.
      let statusFilter: "ACTIVE" | "DISSOLVED" | undefined = undefined;
      const raw = request.query.status;
      if (raw === "ACTIVE") statusFilter = "ACTIVE";
      else if (raw === "DISSOLVED") statusFilter = "DISSOLVED";
      else if (raw !== undefined) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_FIELD",
          invalid_fields: ["status"],
          message: "status must be ACTIVE or DISSOLVED",
        });
      }

      const result = await hiveService.listHivesForOrg(orgEntityId, {
        ...(statusFilter !== undefined ? { status: statusFilter } : {}),
      });
      if (result.ok === true) {
        return reply.code(200).send({ ok: true, hives: result.hives });
      }
      return reply.code(422).send({
        ok: false,
        code: result.code,
        invalid_fields: result.invalid_fields,
        message: result.message,
      });
    },
  );

  // GET /api/v1/org/hives/:id — detail + safe member roster.
  app.get<{ Params: { id: string } }>(
    "/api/v1/org/hives/:id",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;

      const result = await hiveService.getHiveAdminDetail(
        orgEntityId,
        request.params.id,
      );
      if (result.ok === true) {
        return reply.code(200).send({
          ok: true,
          hive: result.hive,
          members: result.members,
        });
      }
      return reply.code(statusFor(result)).send({
        ok: false,
        code: result.code,
        message: result.message,
      });
    },
  );

  // DELETE /api/v1/org/hives/:id — soft-archive via DISSOLVED.
  app.delete<{ Params: { id: string } }>(
    "/api/v1/org/hives/:id",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;

      const result = await hiveService.dissolveHive(
        orgEntityId,
        request.params.id,
        callerId,
        { ip_address: request.ip ?? null },
      );
      if (result.ok === true) {
        return reply.code(200).send({
          ok: true,
          status: result.status,
          already_dissolved: result.already_dissolved,
          audit_event_id: result.audit_event_id,
        });
      }
      return reply.code(statusFor(result)).send({
        ok: false,
        code: result.code,
        message: result.message,
      });
    },
  );

  // DELETE /api/v1/org/hives/:id/member/:entityId — admin force-remove.
  app.delete<{ Params: { id: string; entityId: string } }>(
    "/api/v1/org/hives/:id/member/:entityId",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;

      const result = await hiveService.forceRemoveMember(
        orgEntityId,
        request.params.id,
        request.params.entityId,
        callerId,
        { ip_address: request.ip ?? null },
      );
      if (result.ok === true) {
        return reply.code(200).send({
          ok: true,
          membership_id: result.membership_id,
          member_count: result.member_count,
          audit_event_id: result.audit_event_id,
        });
      }
      return reply.code(statusFor(result)).send({
        ok: false,
        code: result.code,
        message: result.message,
      });
    },
  );
}
