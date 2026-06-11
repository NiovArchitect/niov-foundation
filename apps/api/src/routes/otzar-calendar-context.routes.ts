// FILE: otzar-calendar-context.routes.ts
// PURPOSE: Phase 1236 — HTTP surface for calendar-aware quiet mode.
//
//          - GET /api/v1/otzar/calendar/context
//
//          Passive read; not audited per the read-side noise policy
//          (same posture as my-twin/context-health).

import type { FastifyInstance } from "fastify";
import type { AuthService } from "../services/auth.service.js";
import { getCalendarContextForCaller } from "../services/otzar/calendar-context.service.js";

function bearerFrom(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || !value.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token.length === 0 ? null : token;
}

export async function registerOtzarCalendarContextRoutes(
  app: FastifyInstance,
  authService: AuthService,
): Promise<void> {
  app.get("/api/v1/otzar/calendar/context", async (request, reply) => {
    const token = bearerFrom(request.headers.authorization);
    if (token === null)
      return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
    const session = await authService.validateSession(token, "read");
    if (!session.valid)
      return reply.code(401).send({ ok: false, code: session.code });
    const result = await getCalendarContextForCaller(session.entity_id);
    if (result.ok === false)
      return reply.code(404).send({ ok: false, code: result.code });
    return reply.code(200).send({ ok: true, ...result.context });
  });
}
