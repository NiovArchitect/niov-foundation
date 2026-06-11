// FILE: otzar-ai-employees.routes.ts
// PURPOSE: Phase 1240 — HTTP surface for AI Employee governance.
//
//          - POST /api/v1/otzar/ai-employees              (org admin)
//          - GET  /api/v1/otzar/ai-employees              (org member)
//          - POST /api/v1/otzar/ai-employees/:entity_id/deactivate
//            (org admin; suspends + revokes all ACTIVE authority
//            grants — the RULE 0 kill switch)

import type { FastifyInstance } from "fastify";
import type { AuthService } from "../services/auth.service.js";
import {
  deactivateAiEmployeeForCaller,
  listAiEmployeesForCaller,
  provisionAiEmployeeForCaller,
} from "../services/governance/ai-employee.service.js";

function bearerFrom(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || !value.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token.length === 0 ? null : token;
}

function isStr(v: unknown): v is string {
  return typeof v === "string";
}

const FAILURE_STATUS: Record<string, number> = {
  NO_ORG_FOR_CALLER: 404,
  ADMIN_REQUIRED: 403,
  ROLE_TITLE_REQUIRED: 422,
  AI_EMPLOYEE_ALREADY_EXISTS: 409,
  AI_EMPLOYEE_NOT_FOUND: 404,
  ALREADY_DEACTIVATED: 409,
  PROVISION_FAILED: 500,
};

function failureStatus(code: string): number {
  return FAILURE_STATUS[code] ?? 403;
}

interface ProvisionBody {
  role_title?: unknown;
  display_name?: unknown;
}

export async function registerOtzarAiEmployeesRoutes(
  app: FastifyInstance,
  authService: AuthService,
): Promise<void> {
  app.post<{ Body: ProvisionBody }>(
    "/api/v1/otzar/ai-employees",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const session = await authService.validateSession(token, "write");
      if (!session.valid)
        return reply.code(401).send({ ok: false, code: session.code });
      const body = request.body ?? {};
      if (!isStr(body.role_title)) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: "role_title is required",
        });
      }
      const result = await provisionAiEmployeeForCaller({
        callerEntityId: session.entity_id,
        roleTitle: body.role_title,
        ...(isStr(body.display_name)
          ? { displayName: body.display_name }
          : {}),
      });
      if (result.ok === false)
        return reply.code(failureStatus(result.code)).send({
          ok: false,
          code: result.code,
          ...(result.message === undefined ? {} : { message: result.message }),
        });
      return reply
        .code(201)
        .send({ ok: true, ai_employee: result.ai_employee });
    },
  );

  app.get("/api/v1/otzar/ai-employees", async (request, reply) => {
    const token = bearerFrom(request.headers.authorization);
    if (token === null)
      return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
    const session = await authService.validateSession(token, "read");
    if (!session.valid)
      return reply.code(401).send({ ok: false, code: session.code });
    const result = await listAiEmployeesForCaller(session.entity_id);
    if (result.ok === false)
      return reply
        .code(failureStatus(result.code))
        .send({ ok: false, code: result.code });
    return reply
      .code(200)
      .send({ ok: true, ai_employees: result.ai_employees });
  });

  app.post<{ Params: { entity_id: string } }>(
    "/api/v1/otzar/ai-employees/:entity_id/deactivate",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const session = await authService.validateSession(token, "write");
      if (!session.valid)
        return reply.code(401).send({ ok: false, code: session.code });
      const result = await deactivateAiEmployeeForCaller({
        callerEntityId: session.entity_id,
        aiEmployeeEntityId: request.params.entity_id,
      });
      if (result.ok === false)
        return reply
          .code(failureStatus(result.code))
          .send({ ok: false, code: result.code });
      return reply.code(200).send({
        ok: true,
        entity_id: result.entity_id,
        revoked_grants_count: result.revoked_grants_count,
      });
    },
  );
}
