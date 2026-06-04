// FILE: otzar-work-project.routes.ts
// PURPOSE: Phase 1 PR 2 — HTTP surface for the WorkProject
//          substrate landed at PR #280. Self-scoped employee
//          routes (no admin gate) for the project lifecycle.
//
//          - POST /api/v1/otzar/work-projects
//          - GET  /api/v1/otzar/work-projects
//          - POST /api/v1/otzar/work-projects/:project_id/archive
//          - POST /api/v1/otzar/work-projects/:project_id/members
//          - GET  /api/v1/otzar/work-projects/:project_id/members
//
// PRIVACY INVARIANT:
//   - Response always projects through projectWorkProjectSafeView
//     / projectWorkProjectMemberSafeView (no archived_at /
//     created_by_entity_id / org_entity_id surface).
//   - Cross-tenant + membership guards at the service tier.
//
// CONNECTS TO:
//   - apps/api/src/services/otzar/work-project.service.ts
//   - apps/api/src/services/auth.service.ts
//   - apps/api/src/services/governance/org.ts (getOrgEntityId)

import type { FastifyInstance } from "fastify";
import type { AuthService } from "../services/auth.service.js";
import {
  addWorkProjectMemberForCaller,
  archiveWorkProjectForCaller,
  createWorkProjectForCaller,
  listWorkProjectMembersForCaller,
  listWorkProjectsForCaller,
  type WorkProjectMemberRole,
  type WorkProjectState,
} from "../services/otzar/work-project.service.js";

function bearerFrom(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || !value.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token.length === 0 ? null : token;
}

const VALID_STATES: ReadonlyArray<WorkProjectState> = ["ACTIVE", "ARCHIVED"];
const VALID_ROLES: ReadonlyArray<WorkProjectMemberRole> = [
  "OWNER",
  "MEMBER",
  "REVIEWER",
];

function httpCodeForFailure(code: string): number {
  switch (code) {
    case "PROJECT_NOT_FOUND":
      return 404;
    case "NOT_PROJECT_OWNER":
    case "NOT_PROJECT_MEMBER":
    case "CROSS_ORG_DENIED":
      return 403;
    case "PROJECT_ARCHIVED":
    case "ALREADY_ARCHIVED":
    case "ALREADY_MEMBER":
      return 409;
    default:
      return 400;
  }
}

export async function registerOtzarWorkProjectRoutes(
  app: FastifyInstance,
  authService: AuthService,
): Promise<void> {
  // POST create
  app.post<{ Body: { name?: unknown } }>(
    "/api/v1/otzar/work-projects",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) {
        return reply.code(401).send({
          ok: false,
          code: "SESSION_INVALID",
          message: "Missing bearer token",
        });
      }
      const session = await authService.validateSession(token, "read");
      if (!session.valid) {
        return reply
          .code(401)
          .send({ ok: false, code: session.code, message: "denied" });
      }
      const body = request.body ?? {};
      if (typeof body.name !== "string" || body.name.length === 0) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: "name is required (non-empty string)",
        });
      }
      const { getOrgEntityId } = await import(
        "../services/governance/org.js"
      );
      let orgEntityId: string | null;
      try {
        orgEntityId = await getOrgEntityId(session.entity_id);
      } catch {
        orgEntityId = null;
      }
      if (orgEntityId === null) {
        return reply.code(403).send({
          ok: false,
          code: "ORG_NOT_RESOLVED",
          message: "Caller has no resolvable org context",
        });
      }
      const view = await createWorkProjectForCaller({
        callerEntityId: session.entity_id,
        orgEntityId,
        name: body.name,
      });
      return reply.code(201).send({ ok: true, project: view });
    },
  );

  // GET list
  app.get<{ Querystring: { state?: string; take?: string } }>(
    "/api/v1/otzar/work-projects",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) {
        return reply.code(401).send({
          ok: false,
          code: "SESSION_INVALID",
          message: "Missing bearer token",
        });
      }
      const session = await authService.validateSession(token, "read");
      if (!session.valid) {
        return reply
          .code(401)
          .send({ ok: false, code: session.code, message: "denied" });
      }
      let stateFilter: WorkProjectState | undefined;
      if (typeof request.query.state === "string") {
        if (
          !(VALID_STATES as ReadonlyArray<string>).includes(
            request.query.state,
          )
        ) {
          return reply.code(422).send({
            ok: false,
            code: "INVALID_REQUEST",
            message: "state must be a closed-vocab value when provided",
          });
        }
        stateFilter = request.query.state as WorkProjectState;
      }
      let takeNum: number | undefined;
      if (typeof request.query.take === "string") {
        const parsed = Number.parseInt(request.query.take, 10);
        if (Number.isFinite(parsed) && parsed > 0) takeNum = parsed;
      }
      const projects = await listWorkProjectsForCaller({
        callerEntityId: session.entity_id,
        state: stateFilter,
        take: takeNum,
      });
      return reply.code(200).send({ ok: true, projects });
    },
  );

  // POST archive
  app.post<{ Params: { project_id: string } }>(
    "/api/v1/otzar/work-projects/:project_id/archive",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) {
        return reply.code(401).send({
          ok: false,
          code: "SESSION_INVALID",
          message: "Missing bearer token",
        });
      }
      const session = await authService.validateSession(token, "read");
      if (!session.valid) {
        return reply
          .code(401)
          .send({ ok: false, code: session.code, message: "denied" });
      }
      const result = await archiveWorkProjectForCaller({
        callerEntityId: session.entity_id,
        projectId: request.params.project_id,
      });
      if (!result.ok) {
        return reply.code(httpCodeForFailure(result.code)).send(result);
      }
      return reply.code(200).send(result);
    },
  );

  // POST addMember
  app.post<{
    Params: { project_id: string };
    Body: { entity_id?: unknown; role?: unknown };
  }>(
    "/api/v1/otzar/work-projects/:project_id/members",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) {
        return reply.code(401).send({
          ok: false,
          code: "SESSION_INVALID",
          message: "Missing bearer token",
        });
      }
      const session = await authService.validateSession(token, "read");
      if (!session.valid) {
        return reply
          .code(401)
          .send({ ok: false, code: session.code, message: "denied" });
      }
      const body = request.body ?? {};
      if (typeof body.entity_id !== "string" || body.entity_id.length === 0) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: "entity_id is required (non-empty string)",
        });
      }
      if (
        body.role !== undefined &&
        (typeof body.role !== "string" ||
          !(VALID_ROLES as ReadonlyArray<string>).includes(body.role))
      ) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: "role must be a closed-vocab value when provided",
        });
      }
      const result = await addWorkProjectMemberForCaller({
        callerEntityId: session.entity_id,
        projectId: request.params.project_id,
        entityId: body.entity_id,
        role:
          typeof body.role === "string"
            ? (body.role as WorkProjectMemberRole)
            : undefined,
      });
      if (!result.ok) {
        return reply.code(httpCodeForFailure(result.code)).send(result);
      }
      return reply.code(201).send(result);
    },
  );

  // GET members
  app.get<{ Params: { project_id: string } }>(
    "/api/v1/otzar/work-projects/:project_id/members",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) {
        return reply.code(401).send({
          ok: false,
          code: "SESSION_INVALID",
          message: "Missing bearer token",
        });
      }
      const session = await authService.validateSession(token, "read");
      if (!session.valid) {
        return reply
          .code(401)
          .send({ ok: false, code: session.code, message: "denied" });
      }
      const result = await listWorkProjectMembersForCaller({
        callerEntityId: session.entity_id,
        projectId: request.params.project_id,
      });
      if (!result.ok) {
        return reply.code(httpCodeForFailure(result.code)).send(result);
      }
      return reply.code(200).send(result);
    },
  );
}
