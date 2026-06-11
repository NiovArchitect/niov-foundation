// FILE: onboarding.routes.ts
// PURPOSE: Phase 1230 — HTTP surface for the production onboarding
//          / admin readiness checklist.
//
//          - GET   /api/v1/onboarding/checklist
//          - POST  /api/v1/onboarding/steps/:step_id/complete
//          - PUT   /api/v1/onboarding/mode

import type { FastifyInstance } from "fastify";
import type { AuthService } from "../services/auth.service.js";
import {
  completeOnboardingStepForCaller,
  getOnboardingChecklistForCaller,
  setOnboardingModeForCaller,
  type OnboardingStepId,
} from "../services/onboarding/onboarding.service.js";
import { getHandoffReadinessForCaller } from "../services/onboarding/handoff-readiness.service.js";

function bearerFrom(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || !value.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token.length === 0 ? null : token;
}

const KNOWN_STEPS: OnboardingStepId[] = [
  "ORG_CREATED",
  "ADMINS_INVITED",
  "ROLES_ASSIGNED",
  "ROLE_ARCHETYPES_ASSIGNED",
  "ACTION_POLICY_CONFIGURED",
  "CONNECTOR_STATUS_REVIEWED",
  "DMW_DEFAULTS_CONFIGURED",
  "COSMP_DEFAULTS_CONFIGURED",
  "DEMO_SEED_LOADED",
  "PROD_SCHEMA_MIGRATION_ACKNOWLEDGED",
  "READY_FOR_PRODUCTION",
];

interface ModeBody {
  mode?: unknown;
}

export async function registerOnboardingRoutes(
  app: FastifyInstance,
  authService: AuthService,
): Promise<void> {
  // Phase 1242 — the enterprise handoff readiness aggregate.
  app.get("/api/v1/otzar/production-readiness", async (request, reply) => {
    const token = bearerFrom(request.headers.authorization);
    if (token === null)
      return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
    const session = await authService.validateSession(token, "read");
    if (!session.valid)
      return reply.code(401).send({ ok: false, code: session.code });
    const result = await getHandoffReadinessForCaller(session.entity_id);
    if (result.ok === false) {
      const status = result.code === "ADMIN_REQUIRED" ? 403 : 404;
      return reply.code(status).send({ ok: false, code: result.code });
    }
    return reply.code(200).send({ ok: true, readiness: result.readiness });
  });

  app.get("/api/v1/onboarding/checklist", async (request, reply) => {
    const token = bearerFrom(request.headers.authorization);
    if (token === null)
      return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
    const session = await authService.validateSession(token, "read");
    if (!session.valid)
      return reply.code(401).send({ ok: false, code: session.code });
    const result = await getOnboardingChecklistForCaller(session.entity_id);
    if (result.ok === false)
      return reply.code(404).send({ ok: false, code: result.code });
    return reply.code(200).send({ ok: true, checklist: result.checklist });
  });

  app.post<{ Params: { step_id: string } }>(
    "/api/v1/onboarding/steps/:step_id/complete",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const session = await authService.validateSession(token, "write");
      if (!session.valid)
        return reply.code(401).send({ ok: false, code: session.code });
      const step = KNOWN_STEPS.find((s) => s === request.params.step_id);
      if (step === undefined) {
        return reply.code(422).send({
          ok: false,
          code: "UNKNOWN_STEP",
          message: `step_id must be one of ${KNOWN_STEPS.join(", ")}`,
        });
      }
      const result = await completeOnboardingStepForCaller({
        callerEntityId: session.entity_id,
        step,
      });
      if (result.ok === false) {
        const status =
          result.code === "ADMIN_REQUIRED"
            ? 403
            : result.code === "NO_ORG_FOR_CALLER"
              ? 404
              : 422;
        return reply.code(status).send({ ok: false, code: result.code });
      }
      return reply.code(200).send({ ok: true, checklist: result.checklist });
    },
  );

  app.put<{ Body: ModeBody }>(
    "/api/v1/onboarding/mode",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const session = await authService.validateSession(token, "write");
      if (!session.valid)
        return reply.code(401).send({ ok: false, code: session.code });
      const mode =
        request.body?.mode === "PRODUCTION" ? "PRODUCTION" : "DEMO";
      const result = await setOnboardingModeForCaller({
        callerEntityId: session.entity_id,
        mode,
      });
      if (result.ok === false) {
        const status = result.code === "ADMIN_REQUIRED" ? 403 : 404;
        return reply.code(status).send({ ok: false, code: result.code });
      }
      return reply.code(200).send({ ok: true, checklist: result.checklist });
    },
  );
}
