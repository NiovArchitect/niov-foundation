// FILE: playground.routes.ts
// PURPOSE: Section 5 Agent Playground routes.
//          Wave 2 (ADR-0060): 3 sandbox-only inspector routes
//            (policy-evaluator / connector-dry-run / working-set);
//            all bearer + "read" scope; no DB writes; no audit;
//            no live provider calls; no persistence.
//          Wave 4 (ADR-0065 §7): 5 persistent named-scenarios CRUD
//            routes (POST list create / GET list / GET detail / PUT
//            update / DELETE soft-archive); all bearer + "read"
//            scope; owner-first self-scope; SAFE projection;
//            ADMIN_ACTION + details.action discriminator audit on
//            persistence boundaries (CREATED / UPDATED / ARCHIVED);
//            no new audit literal.
// CONNECTS TO:
//   - apps/api/src/services/playground/playground.service.ts
//   - apps/api/src/services/playground/playground-scenario.service.ts
//   - ADR-0060 Section 5 Agent Playground v1 design
//   - ADR-0065 §7 Wave 4 persistent named scenarios

import type { FastifyInstance } from "fastify";
import type {
  PlaygroundService,
  PlaygroundFailureCode,
  PolicyEvaluatorInput,
  ConnectorDryRunInput,
  WorkingSetInspectorInput,
} from "../services/playground/playground.service.js";
import type {
  PlaygroundScenarioService,
  PlaygroundScenarioFailureCode,
  CreateScenarioInput,
  UpdateScenarioInput,
  PlaygroundScenarioStatus,
} from "../services/playground/playground-scenario.service.js";
import { PLAYGROUND_SCENARIO_STATUS_VALUES } from "../services/playground/playground-scenario.service.js";
import type {
  PlaygroundCandidateService,
  GenerateCandidatesInput,
} from "../services/playground/playground-candidate.service.js";

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

// WHAT: Map a PlaygroundScenarioFailureCode to an HTTP status.
// INPUT: The failure code.
// OUTPUT: number (HTTP status).
// WHY: Centralizes the route-tier mapping for the 5 Wave 4 scenario
//      routes (CREATE / LIST / GET / UPDATE / ARCHIVE). Auth →
//      401; OPERATION_NOT_PERMITTED → 403; SCENARIO_NOT_FOUND →
//      404 (enumeration-safe; cross-owner folds here);
//      INVALID_REQUEST → 422; INTERNAL_ERROR → 500.
function scenarioStatusFor(code: PlaygroundScenarioFailureCode): number {
  switch (code) {
    case "SESSION_INVALID":
    case "SESSION_EXPIRED":
    case "SESSION_REVOKED":
    case "SESSION_INVALIDATED":
      return 401;
    case "OPERATION_NOT_PERMITTED":
      return 403;
    case "SCENARIO_NOT_FOUND":
      return 404;
    case "INVALID_REQUEST":
      return 422;
    case "INTERNAL_ERROR":
      return 500;
  }
}

// WHAT: Register the three Agent Playground v1 routes per ADR-0060
//        §Forward queue (`POST /api/v1/playground/policy-evaluator` +
//        `POST /api/v1/playground/connector-dry-run` + `POST
//        /api/v1/playground/working-set`) PLUS the five Wave 4
//        persistent named-scenario routes per ADR-0065 §7
//        (`POST/GET /api/v1/playground/scenarios` + `GET/PUT/DELETE
//        /api/v1/playground/scenarios/:id`).
// INPUT: Fastify instance + PlaygroundService instance +
//        PlaygroundScenarioService instance.
// OUTPUT: A promise that resolves once registration completes.
// WHY: Mirrors registerHiveRoutes / registerConnectorRoutes pattern.
//      No middleware preHandler (auth is enforced inside the service
//      via authService.validateSession; matches the existing
//      hive.routes.ts pattern where the bearer is parsed at the
//      handler tier and passed to the service).
export async function registerPlaygroundRoutes(
  app: FastifyInstance,
  playground: PlaygroundService,
  scenarios: PlaygroundScenarioService,
  candidates: PlaygroundCandidateService,
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

  // POST /api/v1/playground/scenarios — Wave 4 create.
  app.post<{ Body: CreateScenarioInput }>(
    "/api/v1/playground/scenarios",
    async (request, reply) => {
      const sessionToken = bearerFrom(request.headers.authorization);
      if (sessionToken === null) {
        return reply.code(401).send({
          ok: false,
          code: "SESSION_INVALID",
          message: "Missing bearer token",
        });
      }
      const body = (request.body ?? {}) as CreateScenarioInput;
      const result = await scenarios.createScenario(sessionToken, body, {
        ip_address: request.ip ?? null,
      });
      if (result.ok === true) {
        return reply.code(201).send(result);
      }
      return reply.code(scenarioStatusFor(result.code)).send({
        ok: false,
        code: result.code,
        message: result.message,
        ...(result.invalid_fields !== undefined
          ? { invalid_fields: result.invalid_fields }
          : {}),
      });
    },
  );

  // GET /api/v1/playground/scenarios — Wave 4 list (owner-scoped).
  app.get<{
    Querystring: {
      status?: string;
      limit?: string;
      include_archived?: string;
    };
  }>("/api/v1/playground/scenarios", async (request, reply) => {
    const sessionToken = bearerFrom(request.headers.authorization);
    if (sessionToken === null) {
      return reply.code(401).send({
        ok: false,
        code: "SESSION_INVALID",
        message: "Missing bearer token",
      });
    }

    // Parse optional status filter (closed vocab) at the route tier.
    let statusFilter: PlaygroundScenarioStatus | undefined = undefined;
    const rawStatus = request.query.status;
    if (rawStatus !== undefined) {
      if (
        (PLAYGROUND_SCENARIO_STATUS_VALUES as readonly string[]).includes(
          rawStatus,
        )
      ) {
        statusFilter = rawStatus as PlaygroundScenarioStatus;
      } else {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: `status must be one of ${PLAYGROUND_SCENARIO_STATUS_VALUES.join(", ")}`,
          invalid_fields: ["status"],
        });
      }
    }

    let limit: number | undefined = undefined;
    const rawLimit = request.query.limit;
    if (rawLimit !== undefined) {
      const parsed = Number(rawLimit);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: "limit must be a positive number",
          invalid_fields: ["limit"],
        });
      }
      limit = parsed;
    }

    const includeArchived =
      request.query.include_archived === "true" ? true : undefined;

    const result = await scenarios.listScenarios(sessionToken, {
      ...(statusFilter !== undefined ? { status: statusFilter } : {}),
      ...(limit !== undefined ? { limit } : {}),
      ...(includeArchived === true ? { include_archived: true } : {}),
    });
    if (result.ok === true) {
      return reply.code(200).send(result);
    }
    return reply.code(scenarioStatusFor(result.code)).send({
      ok: false,
      code: result.code,
      message: result.message,
    });
  });

  // GET /api/v1/playground/scenarios/:id — Wave 4 detail (owner only).
  app.get<{ Params: { id: string } }>(
    "/api/v1/playground/scenarios/:id",
    async (request, reply) => {
      const sessionToken = bearerFrom(request.headers.authorization);
      if (sessionToken === null) {
        return reply.code(401).send({
          ok: false,
          code: "SESSION_INVALID",
          message: "Missing bearer token",
        });
      }
      const result = await scenarios.getScenario(
        sessionToken,
        request.params.id,
      );
      if (result.ok === true) {
        return reply.code(200).send(result);
      }
      return reply.code(scenarioStatusFor(result.code)).send({
        ok: false,
        code: result.code,
        message: result.message,
      });
    },
  );

  // PUT /api/v1/playground/scenarios/:id — Wave 4 update (owner only).
  app.put<{ Params: { id: string }; Body: UpdateScenarioInput }>(
    "/api/v1/playground/scenarios/:id",
    async (request, reply) => {
      const sessionToken = bearerFrom(request.headers.authorization);
      if (sessionToken === null) {
        return reply.code(401).send({
          ok: false,
          code: "SESSION_INVALID",
          message: "Missing bearer token",
        });
      }
      const body = (request.body ?? {}) as UpdateScenarioInput;
      const result = await scenarios.updateScenario(
        sessionToken,
        request.params.id,
        body,
        { ip_address: request.ip ?? null },
      );
      if (result.ok === true) {
        return reply.code(200).send(result);
      }
      return reply.code(scenarioStatusFor(result.code)).send({
        ok: false,
        code: result.code,
        message: result.message,
        ...(result.invalid_fields !== undefined
          ? { invalid_fields: result.invalid_fields }
          : {}),
      });
    },
  );

  // DELETE /api/v1/playground/scenarios/:id — Wave 4 soft-archive
  // (owner only; RULE 10 — sets status=ARCHIVED + archived_at; row
  // is never deleted).
  app.delete<{ Params: { id: string } }>(
    "/api/v1/playground/scenarios/:id",
    async (request, reply) => {
      const sessionToken = bearerFrom(request.headers.authorization);
      if (sessionToken === null) {
        return reply.code(401).send({
          ok: false,
          code: "SESSION_INVALID",
          message: "Missing bearer token",
        });
      }
      const result = await scenarios.archiveScenario(
        sessionToken,
        request.params.id,
        { ip_address: request.ip ?? null },
      );
      if (result.ok === true) {
        return reply.code(200).send(result);
      }
      return reply.code(scenarioStatusFor(result.code)).send({
        ok: false,
        code: result.code,
        message: result.message,
      });
    },
  );

  // POST /api/v1/playground/scenarios/:id/candidates — Section 5
  // Wave 5 Option A deterministic / template-first candidate
  // generation per ADR-0072. Computed-on-read; no persistence; no
  // LLM; no Python; no BEAM; no connector invocation; no Action
  // creation; no external provider call. Owner-first + same-org
  // SCENARIO_NOT_FOUND gate is delegated verbatim to
  // PlaygroundScenarioService.getScenario (inside the candidate
  // service) so cross-owner / cross-org / unknown id all fold to
  // enumeration-safe 404. ADMIN_ACTION + details.action=
  // "PLAYGROUND_CANDIDATES_GENERATED" audit with safe metadata
  // only (no candidate text, no scenario fields beyond safe IDs +
  // closed-vocab counters).
  app.post<{
    Params: { id: string };
    Body: GenerateCandidatesInput;
  }>(
    "/api/v1/playground/scenarios/:id/candidates",
    async (request, reply) => {
      const sessionToken = bearerFrom(request.headers.authorization);
      if (sessionToken === null) {
        return reply.code(401).send({
          ok: false,
          code: "SESSION_INVALID",
          message: "Missing bearer token",
        });
      }
      const body = (request.body ?? {}) as GenerateCandidatesInput;
      const result = await candidates.generateCandidates(
        sessionToken,
        request.params.id,
        body,
        { ip_address: request.ip ?? null },
      );
      if (result.ok === true) {
        return reply.code(200).send(result);
      }
      return reply.code(scenarioStatusFor(result.code)).send({
        ok: false,
        code: result.code,
        message: result.message,
        ...(result.invalid_fields !== undefined
          ? { invalid_fields: result.invalid_fields }
          : {}),
      });
    },
  );
}
