// FILE: otzar-my-day.routes.ts
// PURPOSE: Phase 1234 — HTTP surface for the ambient My Day
//          intelligence view. One read-only route; the response is
//          calm, user-safe, caller-scoped, and honest about whether
//          the Python intelligence runtime or the deterministic
//          fixture ranker produced the ranking.
//
//          - GET /api/v1/otzar/my-day/intelligence

import type { FastifyInstance } from "fastify";
import type { AuthService } from "../services/auth.service.js";
import { getMyDayIntelligenceForCaller } from "../services/otzar/my-day-intelligence.service.js";

function bearerFrom(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || !value.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token.length === 0 ? null : token;
}

export async function registerOtzarMyDayRoutes(
  app: FastifyInstance,
  authService: AuthService,
): Promise<void> {
  app.get("/api/v1/otzar/my-day/intelligence", async (request, reply) => {
    const token = bearerFrom(request.headers.authorization);
    if (token === null)
      return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
    const session = await authService.validateSession(token, "read");
    if (!session.valid)
      return reply.code(401).send({ ok: false, code: session.code });
    const result = await getMyDayIntelligenceForCaller(session.entity_id);
    if (result.ok === false)
      return reply.code(404).send({ ok: false, code: result.code });
    return reply
      .code(200)
      .send({ ok: true, intelligence: result.intelligence });
  });
}
