// FILE: system-runtime.routes.ts
// PURPOSE: Phase 1277 — HTTP surface for the polyglot runtime fabric:
//            - GET /api/v1/system/runtime-capabilities
//          Honest, aggregated status of TypeScript / Python / BEAM /
//          desktop / queue runtimes. Observation-only; env KEY NAMES
//          only (never values/secrets). Bearer + read.
// CONNECTS TO: system/runtime-capability-registry.service.ts.

import type { FastifyInstance } from "fastify";
import type { AuthService } from "../services/auth.service.js";
import { getRuntimeCapabilities } from "../services/system/runtime-capability-registry.service.js";

function bearerFrom(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || !value.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token.length === 0 ? null : token;
}

export async function registerSystemRuntimeRoutes(
  app: FastifyInstance,
  authService: AuthService,
): Promise<void> {
  app.get("/api/v1/system/runtime-capabilities", async (request, reply) => {
    const token = bearerFrom(request.headers.authorization);
    if (token === null)
      return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
    const session = await authService.validateSession(token, "read");
    if (!session.valid)
      return reply.code(401).send({ ok: false, code: session.code });
    const runtimes = await getRuntimeCapabilities();
    return reply.code(200).send({ ok: true, runtimes });
  });
}
