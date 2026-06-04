// FILE: otzar-collaboration.routes.ts
// PURPOSE: Phase EDX-6 PR 2 — HTTP surface for the
//          TwinCollaborationRequest substrate landed at EDX-6 PR 1
//          (#276). Self-scoped employee routes (no admin gate) for
//          the request lifecycle.
//
//          - POST /api/v1/otzar/my-twin/collaboration-requests
//          - GET  /api/v1/otzar/my-twin/collaboration-requests/inbound
//          - GET  /api/v1/otzar/my-twin/collaboration-requests/outbound
//          - POST /api/v1/otzar/my-twin/collaboration-requests/:id/accept
//          - POST /api/v1/otzar/my-twin/collaboration-requests/:id/reject
//          - POST /api/v1/otzar/my-twin/collaboration-requests/:id/cancel
//          - POST /api/v1/otzar/my-twin/collaboration-requests/:id/complete
//
// PRIVACY INVARIANT:
//   - Response always projects through projectCollaborationRequestSafeView.
//   - Cross-tenant guards at the service tier.
//
// CONNECTS TO:
//   - apps/api/src/services/otzar/twin-collaboration.service.ts
//   - apps/api/src/services/auth.service.ts
//   - apps/api/src/services/governance/org.ts

import type { FastifyInstance } from "fastify";
import type { AuthService } from "../services/auth.service.js";
import {
  acceptTwinCollaborationRequestForCaller,
  cancelTwinCollaborationRequestForCaller,
  completeTwinCollaborationRequestForCaller,
  createTwinCollaborationRequestForCaller,
  listInboundCollaborationRequestsForCaller,
  listOutboundCollaborationRequestsForCaller,
  rejectTwinCollaborationRequestForCaller,
  type TwinCollaborationRequestType,
  type TwinCollaborationState,
  type TwinCollaborationTargetType,
} from "../services/otzar/twin-collaboration.service.js";

function bearerFrom(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || !value.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token.length === 0 ? null : token;
}

const VALID_TARGET_TYPES: ReadonlyArray<TwinCollaborationTargetType> = [
  "EMPLOYEE",
  "EMPLOYEE_TWIN",
  "TEAM",
  "PROJECT",
  "HIVE",
  "WORKFLOW",
];
const VALID_REQUEST_TYPES: ReadonlyArray<TwinCollaborationRequestType> = [
  "STATUS_REQUEST",
  "REVIEW_REQUEST",
  "BLOCKER_RESOLUTION",
  "FOLLOW_UP",
  "HANDOFF",
  "CONTEXT_REQUEST",
  "APPROVAL_REQUEST",
  "PROJECT_COORDINATION",
  "CROSS_TEAM_COORDINATION",
  "WORKFLOW_COORDINATION",
];
const VALID_STATES: ReadonlyArray<TwinCollaborationState> = [
  "REQUESTED",
  "ACCEPTED",
  "NEEDS_APPROVAL",
  "BLOCKED",
  "IN_PROGRESS",
  "COMPLETED",
  "REJECTED",
  "EXPIRED",
  "CANCELED",
];

function httpCodeForFailure(code: string): number {
  switch (code) {
    case "COLLABORATION_NOT_FOUND":
    case "TARGET_NOT_FOUND":
      return 404;
    case "NOT_REQUESTER":
    case "NOT_TARGET":
    case "CROSS_ORG_DENIED":
      return 403;
    case "INVALID_STATE_TRANSITION":
      return 409;
    default:
      return 400;
  }
}

export async function registerOtzarCollaborationRoutes(
  app: FastifyInstance,
  authService: AuthService,
): Promise<void> {
  // POST create
  app.post<{
    Body: {
      target_type?: unknown;
      request_type?: unknown;
      safe_summary?: unknown;
      target_entity_id?: unknown;
      target_twin_entity_id?: unknown;
      target_team_id?: unknown;
      target_project_id?: unknown;
      requester_twin_entity_id?: unknown;
      requested_by_ai?: unknown;
      requires_approval?: unknown;
    };
  }>(
    "/api/v1/otzar/my-twin/collaboration-requests",
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
      const callerEntityId = session.entity_id;
      const body = request.body ?? {};

      if (
        typeof body.target_type !== "string" ||
        !(VALID_TARGET_TYPES as ReadonlyArray<string>).includes(body.target_type)
      ) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: "target_type is required (closed vocab)",
        });
      }
      if (
        typeof body.request_type !== "string" ||
        !(VALID_REQUEST_TYPES as ReadonlyArray<string>).includes(
          body.request_type,
        )
      ) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: "request_type is required (closed vocab)",
        });
      }
      if (
        typeof body.safe_summary !== "string" ||
        body.safe_summary.length === 0
      ) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: "safe_summary is required (non-empty string)",
        });
      }
      const { getOrgEntityId } = await import(
        "../services/governance/org.js"
      );
      let orgEntityId: string | null;
      try {
        orgEntityId = await getOrgEntityId(callerEntityId);
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
      const result = await createTwinCollaborationRequestForCaller({
        callerEntityId,
        orgEntityId,
        targetType: body.target_type as TwinCollaborationTargetType,
        requestType: body.request_type as TwinCollaborationRequestType,
        safeSummary: body.safe_summary,
        targetEntityId:
          typeof body.target_entity_id === "string"
            ? body.target_entity_id
            : null,
        targetTwinEntityId:
          typeof body.target_twin_entity_id === "string"
            ? body.target_twin_entity_id
            : null,
        targetTeamId:
          typeof body.target_team_id === "string"
            ? body.target_team_id
            : null,
        targetProjectId:
          typeof body.target_project_id === "string"
            ? body.target_project_id
            : null,
        requesterTwinEntityId:
          typeof body.requester_twin_entity_id === "string"
            ? body.requester_twin_entity_id
            : null,
        requestedByAi:
          typeof body.requested_by_ai === "boolean"
            ? body.requested_by_ai
            : undefined,
        requiresApproval:
          typeof body.requires_approval === "boolean"
            ? body.requires_approval
            : undefined,
      });
      if (!result.ok) {
        return reply.code(httpCodeForFailure(result.code)).send(result);
      }
      return reply.code(201).send(result);
    },
  );

  // GET inbound
  app.get<{ Querystring: { state?: string; take?: string } }>(
    "/api/v1/otzar/my-twin/collaboration-requests/inbound",
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
      let stateFilter: TwinCollaborationState | undefined;
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
        stateFilter = request.query.state as TwinCollaborationState;
      }
      let takeNum: number | undefined;
      if (typeof request.query.take === "string") {
        const parsed = Number.parseInt(request.query.take, 10);
        if (Number.isFinite(parsed) && parsed > 0) takeNum = parsed;
      }
      const collaborations =
        await listInboundCollaborationRequestsForCaller({
          callerEntityId: session.entity_id,
          state: stateFilter,
          take: takeNum,
        });
      return reply.code(200).send({ ok: true, collaborations });
    },
  );

  // GET outbound
  app.get<{ Querystring: { state?: string; take?: string } }>(
    "/api/v1/otzar/my-twin/collaboration-requests/outbound",
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
      let stateFilter: TwinCollaborationState | undefined;
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
        stateFilter = request.query.state as TwinCollaborationState;
      }
      let takeNum: number | undefined;
      if (typeof request.query.take === "string") {
        const parsed = Number.parseInt(request.query.take, 10);
        if (Number.isFinite(parsed) && parsed > 0) takeNum = parsed;
      }
      const collaborations =
        await listOutboundCollaborationRequestsForCaller({
          callerEntityId: session.entity_id,
          state: stateFilter,
          take: takeNum,
        });
      return reply.code(200).send({ ok: true, collaborations });
    },
  );

  // POST accept
  app.post<{ Params: { id: string } }>(
    "/api/v1/otzar/my-twin/collaboration-requests/:id/accept",
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
      const result = await acceptTwinCollaborationRequestForCaller({
        callerEntityId: session.entity_id,
        collaborationId: request.params.id,
      });
      if (!result.ok) {
        return reply.code(httpCodeForFailure(result.code)).send(result);
      }
      return reply.code(200).send(result);
    },
  );

  // POST reject
  app.post<{ Params: { id: string } }>(
    "/api/v1/otzar/my-twin/collaboration-requests/:id/reject",
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
      const result = await rejectTwinCollaborationRequestForCaller({
        callerEntityId: session.entity_id,
        collaborationId: request.params.id,
      });
      if (!result.ok) {
        return reply.code(httpCodeForFailure(result.code)).send(result);
      }
      return reply.code(200).send(result);
    },
  );

  // POST cancel
  app.post<{ Params: { id: string } }>(
    "/api/v1/otzar/my-twin/collaboration-requests/:id/cancel",
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
      const result = await cancelTwinCollaborationRequestForCaller({
        callerEntityId: session.entity_id,
        collaborationId: request.params.id,
      });
      if (!result.ok) {
        return reply.code(httpCodeForFailure(result.code)).send(result);
      }
      return reply.code(200).send(result);
    },
  );

  // POST complete
  app.post<{ Params: { id: string } }>(
    "/api/v1/otzar/my-twin/collaboration-requests/:id/complete",
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
      const result = await completeTwinCollaborationRequestForCaller({
        callerEntityId: session.entity_id,
        collaborationId: request.params.id,
      });
      if (!result.ok) {
        return reply.code(httpCodeForFailure(result.code)).send(result);
      }
      return reply.code(200).send(result);
    },
  );
}
