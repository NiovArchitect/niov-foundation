// FILE: otzar-dandelion.routes.ts
// PURPOSE: Phase 1237 — HTTP surface for Dandelion org-growth
//          intelligence and consent-gated voice-first onboarding.
//
//          - GET  /api/v1/otzar/dandelion/org-growth   (org admin)
//          - GET  /api/v1/otzar/dandelion/onboarding   (employee)
//          - POST /api/v1/otzar/dandelion/onboarding/memory-candidates
//            (employee; creates Action(PROPOSED, RECORD_CAPSULE) —
//            memory is saved only after the user approves it)

import type { FastifyInstance } from "fastify";
import type { AuthService } from "../services/auth.service.js";
import {
  getOnboardingIntrosForCaller,
  getOrgGrowthForCaller,
  proposeOnboardingMemoryForCaller,
} from "../services/otzar/dandelion-growth.service.js";

function bearerFrom(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || !value.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token.length === 0 ? null : token;
}

function isStr(v: unknown): v is string {
  return typeof v === "string";
}

interface MemoryBody {
  preferred_name?: unknown;
  pronunciation?: unknown;
  communication_preference?: unknown;
  quiet_preference?: unknown;
  remember_text?: unknown;
}

export async function registerOtzarDandelionRoutes(
  app: FastifyInstance,
  authService: AuthService,
): Promise<void> {
  app.get("/api/v1/otzar/dandelion/org-growth", async (request, reply) => {
    const token = bearerFrom(request.headers.authorization);
    if (token === null)
      return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
    const session = await authService.validateSession(token, "read");
    if (!session.valid)
      return reply.code(401).send({ ok: false, code: session.code });
    const result = await getOrgGrowthForCaller(session.entity_id);
    if (result.ok === false) {
      const status =
        result.code === "ADMIN_REQUIRED"
          ? 403
          : result.code === "NO_ORG_FOR_CALLER"
            ? 404
            : 403;
      return reply.code(status).send({ ok: false, code: result.code });
    }
    return reply.code(200).send({ ok: true, growth: result.growth });
  });

  app.get("/api/v1/otzar/dandelion/onboarding", async (request, reply) => {
    const token = bearerFrom(request.headers.authorization);
    if (token === null)
      return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
    const session = await authService.validateSession(token, "read");
    if (!session.valid)
      return reply.code(401).send({ ok: false, code: session.code });
    const result = await getOnboardingIntrosForCaller(session.entity_id);
    if (result.ok === false)
      return reply.code(404).send({ ok: false, code: result.code });
    return reply.code(200).send({ ok: true, onboarding: result.onboarding });
  });

  app.post<{ Body: MemoryBody }>(
    "/api/v1/otzar/dandelion/onboarding/memory-candidates",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const session = await authService.validateSession(token, "write");
      if (!session.valid)
        return reply.code(401).send({ ok: false, code: session.code });
      const body = request.body ?? {};
      const result = await proposeOnboardingMemoryForCaller({
        callerEntityId: session.entity_id,
        ...(isStr(body.preferred_name)
          ? { preferred_name: body.preferred_name }
          : {}),
        ...(isStr(body.pronunciation)
          ? { pronunciation: body.pronunciation }
          : {}),
        ...(isStr(body.communication_preference)
          ? { communication_preference: body.communication_preference }
          : {}),
        ...(isStr(body.quiet_preference)
          ? { quiet_preference: body.quiet_preference }
          : {}),
        ...(isStr(body.remember_text)
          ? { remember_text: body.remember_text }
          : {}),
      });
      if (result.ok === false) {
        if ("httpStatus" in result) {
          return reply.code(result.httpStatus).send({
            ok: false,
            code: result.code,
            ...(result.message === undefined
              ? {}
              : { message: result.message }),
          });
        }
        return reply.code(422).send({
          ok: false,
          code: result.code,
          ...(result.message === undefined ? {} : { message: result.message }),
        });
      }
      return reply.code(201).send({ ok: true, action: result.view });
    },
  );
}
