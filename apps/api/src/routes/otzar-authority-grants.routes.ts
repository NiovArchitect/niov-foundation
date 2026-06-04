// FILE: otzar-authority-grants.routes.ts
// PURPOSE: Phase EDX-4 PR 2 — HTTP surface for the Twin Authority
//          Grant substrate landed at EDX-4 PR 1. Self-scoped
//          employee routes (no admin gate) so an employee can
//          create, list, and revoke authority grants for their
//          own primary Twin.
//
//          - POST /api/v1/otzar/my-twin/authority-grants
//          - GET  /api/v1/otzar/my-twin/authority-grants
//          - POST /api/v1/otzar/my-twin/authority-grants/:grant_id/revoke
//
//          Bearer-validated via authService.validateSession.
//          Org resolution via getOrgEntityId. Primary Twin
//          resolution mirrors conductSession (oldest AI_AGENT
//          child via EntityMembership; deterministic by
//          created_at ASC, entity_id ASC).
//
// PRIVACY INVARIANT:
//   - The response is always a TwinAuthorityGrantSafeView (no
//     connector_binding_id / constraints_json / revoked_by /
//     grantor_entity_id leakage).
//   - Cross-tenant guard is enforced at the service tier
//     (caller-must-be-grantor on revoke; self-scoped list).
//
// CONNECTS TO:
//   - apps/api/src/services/otzar/twin-authority-grant.service.ts
//   - apps/api/src/services/auth.service.ts
//   - apps/api/src/services/governance/org.ts (getOrgEntityId)
//   - packages/database (prisma)

import type { FastifyInstance } from "fastify";
import { prisma } from "@niov/database";
import type { AuthService } from "../services/auth.service.js";
import {
  checkAuthorityForAction,
  createTwinAuthorityGrantForCaller,
  listTwinAuthorityGrantsForCaller,
  revokeTwinAuthorityGrantForCaller,
  type TwinAuthorityDurationClass,
  type TwinAuthorityScopeType,
  type TwinAuthoritySensitivityClass,
  type TwinAuthorityGrantState,
} from "../services/otzar/twin-authority-grant.service.js";

// Re-export so consumers of the API barrel can import the route-
// surface vocab without reaching into the service path.
export {
  checkAuthorityForAction,
  createTwinAuthorityGrantForCaller,
  listTwinAuthorityGrantsForCaller,
  revokeTwinAuthorityGrantForCaller,
};

function bearerFrom(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || !value.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token.length === 0 ? null : token;
}

const VALID_DURATION_CLASSES: ReadonlyArray<TwinAuthorityDurationClass> = [
  "ONE_TIME",
  "SESSION",
  "SHORT_TERM",
  "PROJECT_SCOPED",
  "LONG_TERM",
  "INDEFINITE",
  "UNTIL_REVOKED",
  "SENSITIVE_CASE_BY_CASE",
];

const VALID_SCOPE_TYPES: ReadonlyArray<TwinAuthorityScopeType> = [
  "PERSONAL",
  "SESSION",
  "PROJECT",
  "TEAM",
  "ORG",
  "CONNECTOR",
  "ACTION_TYPE",
  "WORKFLOW",
  "CONVERSATION",
];

const VALID_SENSITIVITY_CLASSES: ReadonlyArray<TwinAuthoritySensitivityClass> = [
  "LOW",
  "MODERATE",
  "HIGH",
  "REGULATED",
  "CUSTOMER_SENSITIVE",
  "FINANCIAL",
  "LEGAL",
  "SECURITY",
  "PERSONAL_MEMORY",
  "CONNECTOR_WRITE",
];

const VALID_STATES: ReadonlyArray<TwinAuthorityGrantState> = [
  "ACTIVE",
  "EXPIRED",
  "REVOKED",
  "SUPERSEDED",
  "CONSUMED",
  "BLOCKED",
];

// WHAT: Resolve the authenticated caller's primary Twin (AI_AGENT
//        child via EntityMembership). Mirrors conductSession's
//        deterministic selection so an authority-grant default
//        grantee == the same Twin the chat surface talks to.
async function resolvePrimaryTwinFor(
  ownerEntityId: string,
): Promise<string | null> {
  const memberships = await prisma.entityMembership.findMany({
    where: { parent_id: ownerEntityId, is_active: true },
    select: { child_id: true },
  });
  const childIds = memberships.map((m) => m.child_id);
  if (childIds.length === 0) return null;
  const twins = await prisma.entity.findMany({
    where: {
      entity_id: { in: childIds },
      entity_type: "AI_AGENT",
      deleted_at: null,
    },
    orderBy: [{ created_at: "asc" }, { entity_id: "asc" }],
    select: { entity_id: true },
  });
  return twins[0]?.entity_id ?? null;
}

export async function registerOtzarAuthorityGrantsRoutes(
  app: FastifyInstance,
  authService: AuthService,
): Promise<void> {
  // POST /api/v1/otzar/my-twin/authority-grants
  app.post<{
    Body: {
      grantee_entity_id?: unknown;
      scope_type?: unknown;
      scope_id?: unknown;
      action_type?: unknown;
      connector_type?: unknown;
      connector_binding_id?: unknown;
      duration_class?: unknown;
      sensitivity_class?: unknown;
      purpose_summary?: unknown;
      expires_at?: unknown;
    };
  }>("/api/v1/otzar/my-twin/authority-grants", async (request, reply) => {
    const token = bearerFrom(request.headers.authorization);
    if (token === null) {
      return reply
        .code(401)
        .send({ ok: false, code: "SESSION_INVALID", message: "Missing bearer token" });
    }
    const session = await authService.validateSession(token, "read");
    if (!session.valid) {
      return reply.code(401).send({ ok: false, code: session.code, message: "denied" });
    }
    const callerEntityId = session.entity_id;
    const body = request.body ?? {};

    if (
      typeof body.duration_class !== "string" ||
      !(VALID_DURATION_CLASSES as ReadonlyArray<string>).includes(
        body.duration_class,
      )
    ) {
      return reply.code(422).send({
        ok: false,
        code: "INVALID_REQUEST",
        message: "duration_class is required (closed vocab)",
      });
    }
    if (
      typeof body.scope_type !== "string" ||
      !(VALID_SCOPE_TYPES as ReadonlyArray<string>).includes(body.scope_type)
    ) {
      return reply.code(422).send({
        ok: false,
        code: "INVALID_REQUEST",
        message: "scope_type is required (closed vocab)",
      });
    }
    if (
      typeof body.purpose_summary !== "string" ||
      body.purpose_summary.length === 0
    ) {
      return reply.code(422).send({
        ok: false,
        code: "INVALID_REQUEST",
        message: "purpose_summary is required (non-empty string)",
      });
    }
    if (
      body.sensitivity_class !== undefined &&
      (typeof body.sensitivity_class !== "string" ||
        !(VALID_SENSITIVITY_CLASSES as ReadonlyArray<string>).includes(
          body.sensitivity_class,
        ))
    ) {
      return reply.code(422).send({
        ok: false,
        code: "INVALID_REQUEST",
        message: "sensitivity_class must be a closed-vocab value when provided",
      });
    }
    let expiresAt: Date | undefined;
    if (typeof body.expires_at === "string" && body.expires_at.length > 0) {
      const parsed = new Date(body.expires_at);
      if (Number.isNaN(parsed.getTime())) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: "expires_at must be a valid ISO-8601 timestamp when provided",
        });
      }
      if (parsed.getTime() <= Date.now()) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: "expires_at must be in the future",
        });
      }
      expiresAt = parsed;
    }

    // Org resolution — tolerant; orgless callers cannot create
    // grants (the grant is org-scoped). Lazy import mirrors
    // otzar.service.ts.
    const { getOrgEntityId } = await import("../services/governance/org.js");
    let orgEntityId: string | null;
    try {
      orgEntityId = await getOrgEntityId(callerEntityId);
    } catch {
      orgEntityId = null;
    }
    if (orgEntityId === null) {
      return reply.code(403).send({
        ok: false,
        code: "ORG_NOT_RESOLVED",
        message: "Caller has no resolvable org context",
      });
    }

    // Default grantee = caller's primary Twin. Explicit grantee
    // must be a known entity; cross-org check is a future hardening
    // (the service-tier scope check at use-time enforces org
    // boundary via org_entity_id on the grant row).
    let granteeEntityId: string;
    if (
      typeof body.grantee_entity_id === "string" &&
      body.grantee_entity_id.length > 0
    ) {
      granteeEntityId = body.grantee_entity_id;
    } else {
      const twin = await resolvePrimaryTwinFor(callerEntityId);
      if (twin === null) {
        return reply.code(404).send({
          ok: false,
          code: "TWIN_NOT_FOUND",
          message: "Caller has no resolvable primary Twin to grant authority to",
        });
      }
      granteeEntityId = twin;
    }

    const view = await createTwinAuthorityGrantForCaller({
      callerEntityId,
      orgEntityId,
      granteeEntityId,
      scopeType: body.scope_type as TwinAuthorityScopeType,
      scopeId: typeof body.scope_id === "string" ? body.scope_id : null,
      actionType: typeof body.action_type === "string" ? body.action_type : null,
      connectorType:
        typeof body.connector_type === "string" ? body.connector_type : null,
      connectorBindingId:
        typeof body.connector_binding_id === "string"
          ? body.connector_binding_id
          : null,
      durationClass: body.duration_class as TwinAuthorityDurationClass,
      sensitivityClass:
        typeof body.sensitivity_class === "string"
          ? (body.sensitivity_class as TwinAuthoritySensitivityClass)
          : undefined,
      purposeSummary: body.purpose_summary,
      expiresAt: expiresAt ?? null,
    });

    return reply.code(201).send({ ok: true, grant: view });
  });

  // GET /api/v1/otzar/my-twin/authority-grants
  app.get<{
    Querystring: { state?: string; take?: string };
  }>("/api/v1/otzar/my-twin/authority-grants", async (request, reply) => {
    const token = bearerFrom(request.headers.authorization);
    if (token === null) {
      return reply
        .code(401)
        .send({ ok: false, code: "SESSION_INVALID", message: "Missing bearer token" });
    }
    const session = await authService.validateSession(token, "read");
    if (!session.valid) {
      return reply.code(401).send({ ok: false, code: session.code, message: "denied" });
    }
    const callerEntityId = session.entity_id;

    let stateFilter: TwinAuthorityGrantState | undefined;
    if (typeof request.query.state === "string") {
      if (
        !(VALID_STATES as ReadonlyArray<string>).includes(request.query.state)
      ) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: "state must be a closed-vocab value when provided",
        });
      }
      stateFilter = request.query.state as TwinAuthorityGrantState;
    }

    let takeNum: number | undefined;
    if (typeof request.query.take === "string") {
      const parsed = Number.parseInt(request.query.take, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        takeNum = parsed;
      }
    }

    const grants = await listTwinAuthorityGrantsForCaller({
      callerEntityId,
      state: stateFilter,
      take: takeNum,
    });
    return reply.code(200).send({ ok: true, grants });
  });

  // POST /api/v1/otzar/my-twin/authority-grants/:grant_id/revoke
  app.post<{
    Params: { grant_id: string };
  }>(
    "/api/v1/otzar/my-twin/authority-grants/:grant_id/revoke",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) {
        return reply.code(401).send({
          ok: false,
          code: "SESSION_INVALID",
          message: "Missing bearer token",
        });
      }
      const session = await authService.validateSession(token, "read");
      if (!session.valid) {
        return reply
          .code(401)
          .send({ ok: false, code: session.code, message: "denied" });
      }
      const result = await revokeTwinAuthorityGrantForCaller({
        callerEntityId: session.entity_id,
        grantId: request.params.grant_id,
      });
      if (!result.ok) {
        const code = result.code;
        let httpCode = 400;
        switch (code) {
          case "GRANT_NOT_FOUND":
            httpCode = 404;
            break;
          case "NOT_GRANTOR":
            httpCode = 403;
            break;
          case "ALREADY_REVOKED":
          case "ALREADY_CONSUMED":
          case "ALREADY_EXPIRED":
            httpCode = 409;
            break;
        }
        return reply.code(httpCode).send(result);
      }
      return reply.code(200).send(result);
    },
  );
}
