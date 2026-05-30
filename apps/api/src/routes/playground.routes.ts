// FILE: playground.routes.ts
// PURPOSE: Section 5 Wave 2 — Agent Playground v1 routes per ADR-0060
//          §Forward queue. Three POST routes for the three inspector
//          contracts; all require bearer auth + "read" session scope;
//          all are self-scoped; all are sandbox-only (no DB writes,
//          no audit emission, no live provider calls, no persistence).
// CONNECTS TO:
//   - apps/api/src/services/playground/playground.service.ts
//   - ADR-0060 Section 5 Agent Playground v1 design

import type { FastifyInstance } from "fastify";
import type {
  PlaygroundService,
  PlaygroundFailureCode,
  PolicyEvaluatorInput,
  ConnectorDryRunInput,
  WorkingSetInspectorInput,
} from "../services/playground/playground.service.js";

// WHAT: Pull the bearer token out of an Authorization header.
// INPUT: The raw header value.
// OUTPUT: The token string, or null when missing/shaped wrong.
// WHY: Single point of header-shape validation; mirrors the local
//      helper pattern from hive.routes.ts.
function bearerFrom(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || !value.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token.length === 0 ? null : token;
}

// WHAT: Map a PlaygroundFailureCode to an HTTP status.
// INPUT: The failure code.
// OUTPUT: number (HTTP status).
// WHY: Centralizes the route-tier status mapping so all three
//      playground routes surface the same code → status table.
//      Auth failures → 401 (the AuthService discriminator drives
//      this); OPERATION_NOT_PERMITTED → 403; INVALID_REQUEST →
//      422; INTERNAL_ERROR → 500.
function statusFor(code: PlaygroundFailureCode): number {
  switch (code) {
    case "SESSION_INVALID":
    case "SESSION_EXPIRED":
    case "SESSION_REVOKED":
    case "SESSION_INVALIDATED":
      return 401;
    case "OPERATION_NOT_PERMITTED":
      return 403;
    case "INVALID_REQUEST":
      return 422;
    case "INTERNAL_ERROR":
      return 500;
  }
}

// WHAT: Register the three Agent Playground v1 routes per ADR-0060
//        §Forward queue (`POST /api/v1/playground/policy-evaluator` +
//        `POST /api/v1/playground/connector-dry-run` + `POST
//        /api/v1/playground/working-set`).
// INPUT: Fastify instance + PlaygroundService instance.
// OUTPUT: A promise that resolves once registration completes.
// WHY: Mirrors registerHiveRoutes / registerConnectorRoutes pattern.
//      No middleware preHandler (auth is enforced inside the service
//      via authService.validateSession; matches the existing
//      hive.routes.ts pattern where the bearer is parsed at the
//      handler tier and passed to the service).
export async function registerPlaygroundRoutes(
  app: FastifyInstance,
  playground: PlaygroundService,
): Promise<void> {
  app.post<{ Body: PolicyEvaluatorInput }>(
    "/api/v1/playground/policy-evaluator",
    async (request, reply) => {
      const sessionToken = bearerFrom(request.headers.authorization);
      if (sessionToken === null) {
        return reply.code(401).send({
          ok: false,
          code: "SESSION_INVALID",
          message: "Missing bearer token",
        });
      }
      const body = (request.body ?? {}) as PolicyEvaluatorInput;
      const result = await playground.runPolicyEvaluator(sessionToken, body);
      if (result.ok === true) {
        return reply.code(200).send(result);
      }
      return reply.code(statusFor(result.code)).send({
        ok: false,
        code: result.code,
        message: result.message,
      });
    },
  );

  app.post<{ Body: ConnectorDryRunInput }>(
    "/api/v1/playground/connector-dry-run",
    async (request, reply) => {
      const sessionToken = bearerFrom(request.headers.authorization);
      if (sessionToken === null) {
        return reply.code(401).send({
          ok: false,
          code: "SESSION_INVALID",
          message: "Missing bearer token",
        });
      }
      const body = (request.body ?? {}) as ConnectorDryRunInput;
      const result = await playground.runConnectorDryRun(sessionToken, body);
      if (result.ok === true) {
        return reply.code(200).send(result);
      }
      return reply.code(statusFor(result.code)).send({
        ok: false,
        code: result.code,
        message: result.message,
      });
    },
  );

  app.post<{ Body: WorkingSetInspectorInput }>(
    "/api/v1/playground/working-set",
    async (request, reply) => {
      const sessionToken = bearerFrom(request.headers.authorization);
      if (sessionToken === null) {
        return reply.code(401).send({
          ok: false,
          code: "SESSION_INVALID",
          message: "Missing bearer token",
        });
      }
      const body = (request.body ?? {}) as WorkingSetInspectorInput;
      const result = await playground.runWorkingSetInspector(
        sessionToken,
        body,
      );
      if (result.ok === true) {
        return reply.code(200).send(result);
      }
      return reply.code(statusFor(result.code)).send({
        ok: false,
        code: result.code,
        message: result.message,
      });
    },
  );
}
