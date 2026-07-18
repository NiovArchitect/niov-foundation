// FILE: otzar-enterprise-tools.routes.ts
// PURPOSE: Phase E.1 HTTP surface — employee capability catalog,
//          admin inventory KPIs, employee tool access request.
//          Never auto-grants connectors.

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { AuthService } from "../services/auth.service.js";
import {
  decideEnterpriseToolRequest,
  getEnterpriseToolsCatalogForCaller,
  getEnterpriseToolsInventoryForAdmin,
  requestEnterpriseToolAccess,
  revokeEnterpriseEmployeeGrant,
  revokeEnterpriseOrgTool,
} from "../services/otzar/enterprise-tools.service.js";
import { startOAuthForOrg } from "../services/connector/connector-oauth.service.js";
import { getOrgEntityId } from "../services/governance/org.js";

function bearerFrom(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || !value.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token.length === 0 ? null : token;
}

async function sessionRead(
  request: FastifyRequest,
  reply: FastifyReply,
  authService: AuthService,
): Promise<{ entityId: string } | null> {
  const token = bearerFrom(request.headers.authorization);
  if (token === null) {
    await reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
    return null;
  }
  const session = await authService.validateSession(token, "read");
  if (!session.valid) {
    await reply
      .code(session.code === "OPERATION_NOT_PERMITTED" ? 403 : 401)
      .send({ ok: false, code: session.code });
    return null;
  }
  return { entityId: session.entity_id };
}

async function sessionAdminOrg(
  request: FastifyRequest,
  reply: FastifyReply,
  authService: AuthService,
): Promise<{ entityId: string } | null> {
  const token = bearerFrom(request.headers.authorization);
  if (token === null) {
    await reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
    return null;
  }
  const session = await authService.validateSession(token, "admin_org");
  if (!session.valid) {
    await reply
      .code(session.code === "OPERATION_NOT_PERMITTED" ? 403 : 401)
      .send({ ok: false, code: session.code });
    return null;
  }
  return { entityId: session.entity_id };
}

export async function registerOtzarEnterpriseToolsRoutes(
  app: FastifyInstance,
  authService: AuthService,
): Promise<void> {
  // Employee + admin: human capability catalog with honest connect status.
  app.get("/api/v1/otzar/enterprise-tools/catalog", async (request, reply) => {
    const s = await sessionRead(request, reply, authService);
    if (s === null) return;
    const result = await getEnterpriseToolsCatalogForCaller(s.entityId);
    if (result.ok === false) {
      return reply.code(404).send({ ok: false, code: result.code });
    }
    return reply.code(200).send({ ok: true, catalog: result.catalog });
  });

  // Admin: inventory + KPI strip + pending access requests.
  app.get("/api/v1/otzar/enterprise-tools/inventory", async (request, reply) => {
    const s = await sessionAdminOrg(request, reply, authService);
    if (s === null) return;
    const result = await getEnterpriseToolsInventoryForAdmin(s.entityId);
    if (result.ok === false) {
      const status = result.code === "ADMIN_REQUIRED" ? 403 : 404;
      return reply.code(status).send({ ok: false, code: result.code });
    }
    return reply.code(200).send({ ok: true, inventory: result.inventory });
  });

  // Employee: request a tool (admin confirms — never auto-connect).
  app.post<{
    Body: { capability_id?: unknown; provider?: unknown };
  }>("/api/v1/otzar/enterprise-tools/request", async (request, reply) => {
    const s = await sessionRead(request, reply, authService);
    if (s === null) return;
    const body = request.body ?? {};
    if (typeof body.capability_id !== "string" || body.capability_id.length === 0) {
      return reply.code(422).send({
        ok: false,
        code: "INVALID_FIELD",
        message: "capability_id is required.",
      });
    }
    const result = await requestEnterpriseToolAccess({
      callerEntityId: s.entityId,
      capability_id: body.capability_id,
      provider: typeof body.provider === "string" ? body.provider : undefined,
    });
    if (result.ok === false) {
      const status =
        result.code === "UNKNOWN_CAPABILITY"
          ? 422
          : result.code === "ALREADY_OPEN"
            ? 409
            : result.code === "NO_ORG_FOR_CALLER"
              ? 404
              : 500;
      return reply.code(status).send({
        ok: false,
        code: result.code,
        ...(result.message !== undefined ? { message: result.message } : {}),
      });
    }
    return reply.code(201).send({ ok: true, seed_id: result.seed_id });
  });

  /**
   * Click-and-play connect: employees may start OAuth when the catalog
   * marks the provider ready (org app credentials present). Same start
   * path as admin — governed, audited, no silent grants.
   */
  app.post<{ Params: { slug: string } }>(
    "/api/v1/otzar/enterprise-tools/oauth/:slug/start",
    async (request, reply) => {
      const s = await sessionRead(request, reply, authService);
      if (s === null) return;
      let orgEntityId: string;
      try {
        orgEntityId = await getOrgEntityId(s.entityId);
      } catch {
        return reply.code(404).send({ ok: false, code: "NO_ORG_FOR_CALLER" });
      }
      const result = await startOAuthForOrg({
        provider_slug: request.params.slug,
        org_entity_id: orgEntityId,
        actor_entity_id: s.entityId,
      });
      if (result.ok === true) {
        return reply
          .code(200)
          .send({ ok: true, authorize_url: result.authorize_url });
      }
      const status =
        result.code === "APP_CREDENTIALS_MISSING"
          ? 409
          : result.code === "UNKNOWN_PROVIDER"
            ? 404
            : 422;
      return reply.code(status).send({
        ok: false,
        code: result.code,
        ...(result.message !== undefined ? { message: result.message } : {}),
      });
    },
  );

  // Phase E.2 — admin approve/deny a tool request in inventory (no silent grant).
  app.post<{
    Body: { seed_id?: unknown; decision?: unknown };
  }>("/api/v1/otzar/enterprise-tools/requests/decide", async (request, reply) => {
    const s = await sessionAdminOrg(request, reply, authService);
    if (s === null) return;
    const body = request.body ?? {};
    if (typeof body.seed_id !== "string" || body.seed_id.length === 0) {
      return reply.code(422).send({
        ok: false,
        code: "INVALID_FIELD",
        message: "seed_id is required.",
      });
    }
    if (body.decision !== "approve" && body.decision !== "deny") {
      return reply.code(422).send({
        ok: false,
        code: "INVALID_FIELD",
        message: "decision must be approve or deny.",
      });
    }
    const result = await decideEnterpriseToolRequest({
      adminEntityId: s.entityId,
      seedId: body.seed_id,
      decision: body.decision,
    });
    if (result.ok === false) {
      const status =
        result.code === "NOT_FOUND"
          ? 404
          : result.code === "ADMIN_REQUIRED"
            ? 403
            : result.code === "NO_ORG_FOR_CALLER"
              ? 404
              : 422;
      return reply.code(status).send({
        ok: false,
        code: result.code,
        ...(result.message !== undefined ? { message: result.message } : {}),
      });
    }
    return reply.code(200).send(result);
  });

  // Phase E.2 — force-revoke org OAuth connection.
  app.post<{ Params: { slug: string } }>(
    "/api/v1/otzar/enterprise-tools/oauth/:slug/revoke",
    async (request, reply) => {
      const s = await sessionAdminOrg(request, reply, authService);
      if (s === null) return;
      const result = await revokeEnterpriseOrgTool({
        adminEntityId: s.entityId,
        provider_slug: request.params.slug,
      });
      if (result.ok === false) {
        const status =
          result.code === "NOT_CONNECTED"
            ? 409
            : result.code === "UNKNOWN_PROVIDER"
              ? 404
              : result.code === "ADMIN_REQUIRED"
                ? 403
                : 422;
        return reply.code(status).send({
          ok: false,
          code: result.code,
          ...(result.message !== undefined ? { message: result.message } : {}),
        });
      }
      return reply.code(200).send({ ok: true });
    },
  );

  // Phase E.2 — revoke employee-scoped connector grant.
  app.post<{ Params: { grantId: string } }>(
    "/api/v1/otzar/enterprise-tools/grants/:grantId/revoke",
    async (request, reply) => {
      const s = await sessionAdminOrg(request, reply, authService);
      if (s === null) return;
      const result = await revokeEnterpriseEmployeeGrant({
        adminEntityId: s.entityId,
        grantId: request.params.grantId,
      });
      if (result.ok === false) {
        const status =
          result.code === "GRANT_NOT_FOUND"
            ? 404
            : result.code === "ADMIN_REQUIRED"
              ? 403
              : 404;
        return reply.code(status).send({ ok: false, code: result.code });
      }
      return reply.code(200).send({ ok: true, grant_id: result.grant_id });
    },
  );
}
