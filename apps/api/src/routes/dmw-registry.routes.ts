// FILE: dmw-registry.routes.ts
// PURPOSE: Phase 1228 — HTTP surface for the DMW Registry.
//
//          - GET   /api/v1/dmw/me
//          - GET   /api/v1/dmw/org
//          - GET   /api/v1/dmw/:dmw_id
//          - POST  /api/v1/dmw/:dmw_id/delegations
//          - POST  /api/v1/dmw/delegations/:delegation_id/revoke
//          - GET   /api/v1/dmw/:dmw_id/audit

import type { FastifyInstance } from "fastify";
import type { AuthService } from "../services/auth.service.js";
import {
  createDMWDelegationForCaller,
  getDMWByIdForCaller,
  getMyDMWForCaller,
  listDMWAuditForCaller,
  listOrgDMWForCaller,
  revokeDMWDelegationForCaller,
} from "../services/dmw/dmw-registry.service.js";

function bearerFrom(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || !value.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token.length === 0 ? null : token;
}

function isStr(v: unknown): v is string {
  return typeof v === "string";
}

interface DelegationBody {
  team_entity_id?: unknown;
  capability_scope?: unknown;
  supervision_required?: unknown;
  valid_until?: unknown;
}

export async function registerDMWRegistryRoutes(
  app: FastifyInstance,
  authService: AuthService,
): Promise<void> {
  app.get("/api/v1/dmw/me", async (request, reply) => {
    const token = bearerFrom(request.headers.authorization);
    if (token === null)
      return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
    const session = await authService.validateSession(token, "read");
    if (!session.valid)
      return reply.code(401).send({ ok: false, code: session.code });
    const entry = await getMyDMWForCaller(session.entity_id);
    if (entry === null)
      return reply.code(404).send({ ok: false, code: "DMW_NOT_FOUND" });
    return reply.code(200).send({ ok: true, dmw: entry });
  });

  app.get("/api/v1/dmw/org", async (request, reply) => {
    const token = bearerFrom(request.headers.authorization);
    if (token === null)
      return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
    const session = await authService.validateSession(token, "read");
    if (!session.valid)
      return reply.code(401).send({ ok: false, code: session.code });
    const result = await listOrgDMWForCaller(session.entity_id);
    if (result.ok === false)
      return reply.code(404).send({ ok: false, code: result.code });
    return reply.code(200).send({
      ok: true,
      org_entity_id: result.org_entity_id,
      entries: result.entries,
    });
  });

  app.get<{ Params: { dmw_id: string } }>(
    "/api/v1/dmw/:dmw_id",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const session = await authService.validateSession(token, "read");
      if (!session.valid)
        return reply.code(401).send({ ok: false, code: session.code });
      const result = await getDMWByIdForCaller(
        request.params.dmw_id,
        session.entity_id,
      );
      if (result.ok === false) {
        const status =
          result.code === "DMW_NOT_FOUND"
            ? 404
            : result.code === "NOT_ALLOWED"
              ? 403
              : 404;
        return reply.code(status).send({ ok: false, code: result.code });
      }
      return reply.code(200).send({ ok: true, dmw: result.entry });
    },
  );

  app.post<{
    Params: { dmw_id: string };
    Body: DelegationBody;
  }>(
    "/api/v1/dmw/:dmw_id/delegations",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const session = await authService.validateSession(token, "write");
      if (!session.valid)
        return reply.code(401).send({ ok: false, code: session.code });
      const body = request.body ?? {};
      if (!isStr(body.team_entity_id)) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: "team_entity_id required",
        });
      }
      const scope = Array.isArray(body.capability_scope)
        ? body.capability_scope.filter(isStr)
        : [];
      const result = await createDMWDelegationForCaller({
        callerEntityId: session.entity_id,
        targetDmwId: request.params.dmw_id,
        teamEntityId: body.team_entity_id,
        capabilityScope: scope,
        supervisionRequired: body.supervision_required === false ? false : true,
        ...(isStr(body.valid_until) ? { validUntil: body.valid_until } : {}),
      });
      if (result.ok === false) {
        const status =
          result.code === "DMW_NOT_FOUND"
            ? 404
            : result.code === "NOT_CONTROLLER"
              ? 403
              : 422;
        return reply.code(status).send({
          ok: false,
          code: result.code,
          ...(result.message === undefined ? {} : { message: result.message }),
        });
      }
      return reply.code(201).send({
        ok: true,
        delegation_id: result.delegation_id,
        status: result.status,
        capability_scope: result.capability_scope,
        valid_until: result.valid_until,
      });
    },
  );

  app.post<{ Params: { delegation_id: string } }>(
    "/api/v1/dmw/delegations/:delegation_id/revoke",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const session = await authService.validateSession(token, "write");
      if (!session.valid)
        return reply.code(401).send({ ok: false, code: session.code });
      const result = await revokeDMWDelegationForCaller({
        delegationId: request.params.delegation_id,
        callerEntityId: session.entity_id,
      });
      if (result.ok === false) {
        const status =
          result.code === "DELEGATION_NOT_FOUND"
            ? 404
            : result.code === "NOT_ALLOWED"
              ? 403
              : 409;
        return reply.code(status).send({ ok: false, code: result.code });
      }
      return reply.code(200).send({
        ok: true,
        delegation_id: result.delegation_id,
        revoked_at: result.revoked_at,
      });
    },
  );

  app.get<{ Params: { dmw_id: string } }>(
    "/api/v1/dmw/:dmw_id/audit",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const session = await authService.validateSession(token, "read");
      if (!session.valid)
        return reply.code(401).send({ ok: false, code: session.code });
      const result = await listDMWAuditForCaller({
        dmwId: request.params.dmw_id,
        callerEntityId: session.entity_id,
      });
      if (result.ok === false) {
        const status =
          result.code === "DMW_NOT_FOUND"
            ? 404
            : result.code === "NOT_ALLOWED"
              ? 403
              : 404;
        return reply.code(status).send({ ok: false, code: result.code });
      }
      return reply.code(200).send({ ok: true, events: result.events });
    },
  );
}
