// FILE: otzar-overnight.routes.ts
// PURPOSE: Deterministic after-hours coordination + morning brief under
//          quiet-hours policy. Test clock via simulated_local_minutes.
// CONNECTS TO: OvernightCoordinationService, server.ts.

import type { FastifyInstance } from "fastify";
import type { AuthService } from "../services/auth.service.js";
import { OvernightCoordinationService } from "../services/otzar/overnight-coordination.service.js";

function bearerFrom(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || !value.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token.length === 0 ? null : token;
}

/**
 * WHAT: Register overnight coordination routes.
 * INPUT: Fastify app + AuthService.
 * OUTPUT: void.
 */
export async function registerOtzarOvernightRoutes(
  app: FastifyInstance,
  authService: AuthService,
): Promise<void> {
  const service = new OvernightCoordinationService(authService);

  app.post<{
    Body: {
      simulated_local_minutes?: number;
      force?: boolean;
      attempt_unauthorized_external_send?: boolean;
    };
  }>("/api/v1/otzar/overnight/run", async (request, reply) => {
    const token = bearerFrom(request.headers.authorization);
    if (token === null) {
      return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
    }
    const body = request.body ?? {};
    const result = await service.runForCaller({
      token,
      simulated_local_minutes:
        typeof body.simulated_local_minutes === "number"
          ? body.simulated_local_minutes
          : null,
      force: body.force === true,
      attempt_unauthorized_external_send:
        body.attempt_unauthorized_external_send === true,
    });
    if (!result.ok) {
      const status =
        result.code === "SESSION_INVALID"
          ? 401
          : result.code === "ORG_REQUIRED"
            ? 403
            : result.code === "NOT_QUIET_HOURS" ||
                result.code === "SILENT_AI_DISABLED"
              ? 422
              : 500;
      return reply.code(status).send({
        ok: false,
        code: result.code,
        message: result.message,
      });
    }
    return reply.code(200).send({
      ok: true,
      morning: result.morning,
    });
  });
}
