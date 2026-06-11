// FILE: otzar-beam-status.routes.ts
// PURPOSE: Phase 1241 — the BEAM coordination runtime joins the live
//          HTTP surface (production-path consumer per ADR-0030's
//          migration plan; observation-only, never a policy
//          authority).
//
//          - GET /api/v1/otzar/beam/status
//            Honest closed-vocab runtime status for diagnostics.
//          - GET /api/v1/otzar/collaboration/:collaboration_id/supervised-status
//            Per-collaboration supervised status — BEAM process state
//            when live, deterministic Foundation fallback otherwise.
//            Participant-scoped (requester or target only).

import type { FastifyInstance } from "fastify";
import type { AuthService } from "../services/auth.service.js";
import {
  getBeamRuntimeStatus,
  getCollaborationSupervisedStatusForCaller,
} from "../services/coordination/beam-collaboration-supervisor.service.js";

function bearerFrom(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || !value.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token.length === 0 ? null : token;
}

export async function registerOtzarBeamStatusRoutes(
  app: FastifyInstance,
  authService: AuthService,
): Promise<void> {
  app.get("/api/v1/otzar/beam/status", async (request, reply) => {
    const token = bearerFrom(request.headers.authorization);
    if (token === null)
      return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
    const session = await authService.validateSession(token, "read");
    if (!session.valid)
      return reply.code(401).send({ ok: false, code: session.code });
    const status = await getBeamRuntimeStatus();
    return reply.code(200).send({ ok: true, ...status });
  });

  app.get<{ Params: { collaboration_id: string } }>(
    "/api/v1/otzar/collaboration/:collaboration_id/supervised-status",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const session = await authService.validateSession(token, "read");
      if (!session.valid)
        return reply.code(401).send({ ok: false, code: session.code });
      const result = await getCollaborationSupervisedStatusForCaller(
        session.entity_id,
        request.params.collaboration_id,
      );
      if (result.ok === false)
        return reply.code(404).send({ ok: false, code: result.code });
      return reply.code(200).send({ ok: true, status: result.status });
    },
  );
}
