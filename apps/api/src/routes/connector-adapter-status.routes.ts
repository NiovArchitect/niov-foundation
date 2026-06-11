// FILE: connector-adapter-status.routes.ts
// PURPOSE: Phase 1224 / 1225 / 1226 / 1227 — read-only HTTP
//          surface listing every connector adapter + its status.
//          Reused by the CT readiness matrix surface.

import type { FastifyInstance } from "fastify";
import type { AuthService } from "../services/auth.service.js";
import { listConnectorAdapters } from "../services/connectors/connector-adapter-registry.js";

function bearerFrom(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || !value.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token.length === 0 ? null : token;
}

export async function registerConnectorAdapterStatusRoutes(
  app: FastifyInstance,
  authService: AuthService,
): Promise<void> {
  app.get("/api/v1/connectors/adapters", async (request, reply) => {
    const token = bearerFrom(request.headers.authorization);
    if (token === null)
      return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
    const session = await authService.validateSession(token, "read");
    if (!session.valid)
      return reply.code(401).send({ ok: false, code: session.code });
    const rows = listConnectorAdapters();
    return reply.code(200).send({ ok: true, adapters: rows });
  });
}
