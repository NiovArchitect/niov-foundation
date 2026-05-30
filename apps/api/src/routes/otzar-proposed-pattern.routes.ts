// FILE: otzar-proposed-pattern.routes.ts
// PURPOSE: Section 1 Wave 5 — Otzar proposed-pattern review surface
//          per ADR-0066 §6. 4 self-scoped routes:
//            POST   /api/v1/otzar/my-twin/proposed-patterns/sweep
//            GET    /api/v1/otzar/my-twin/proposed-patterns
//            GET    /api/v1/otzar/my-twin/proposed-patterns/:id
//            PATCH  /api/v1/otzar/my-twin/proposed-patterns/:id
//          All routes require bearer + "read" scope; all are
//          owner-first self-scope (RULE 0); cross-owner / unknown
//          id fold to enumeration-safe 404 PROPOSED_PATTERN_NOT_FOUND.
// CONNECTS TO:
//   - apps/api/src/services/otzar/proposed-pattern.service.ts
//   - ADR-0066 §6 route surface

import type { FastifyInstance } from "fastify";
import type {
  OtzarProposedPatternService,
  OtzarProposedPatternFailureCode,
  OtzarProposedPatternStatus,
  TransitionInput,
} from "../services/otzar/proposed-pattern.service.js";
import { OTZAR_PROPOSED_PATTERN_STATUS_VALUES } from "../services/otzar/proposed-pattern.service.js";

// WHAT: Pull the bearer token out of an Authorization header.
function bearerFrom(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || !value.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token.length === 0 ? null : token;
}

// WHAT: Map an OtzarProposedPatternFailureCode to HTTP status.
// INPUT: The failure code.
// OUTPUT: number (HTTP status).
// WHY: ADR-0066 §6 status mapping — 401 auth / 403
//      OPERATION_NOT_PERMITTED / 404 PROPOSED_PATTERN_NOT_FOUND /
//      422 INVALID_STATE_TRANSITION + INVALID_REQUEST / 500
//      INTERNAL_ERROR.
function statusFor(code: OtzarProposedPatternFailureCode): number {
  switch (code) {
    case "SESSION_INVALID":
    case "SESSION_EXPIRED":
    case "SESSION_REVOKED":
    case "SESSION_INVALIDATED":
      return 401;
    case "OPERATION_NOT_PERMITTED":
      return 403;
    case "PROPOSED_PATTERN_NOT_FOUND":
      return 404;
    case "INVALID_STATE_TRANSITION":
    case "INVALID_REQUEST":
      return 422;
    case "INTERNAL_ERROR":
      return 500;
  }
}

// WHAT: Register the 4 Wave 5 proposed-pattern routes per ADR-0066
//        §6.
// INPUT: Fastify instance + OtzarProposedPatternService instance.
// OUTPUT: Promise resolving once registration completes.
// WHY: All routes parse the bearer at the handler tier and pass
//      the token to the service; the service enforces RULE 0
//      owner-first self-scope internally.
export async function registerOtzarProposedPatternRoutes(
  app: FastifyInstance,
  service: OtzarProposedPatternService,
): Promise<void> {
  // POST /api/v1/otzar/my-twin/proposed-patterns/sweep
  app.post(
    "/api/v1/otzar/my-twin/proposed-patterns/sweep",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) {
        return reply.code(401).send({
          ok: false,
          code: "SESSION_INVALID",
          message: "Missing bearer token",
        });
      }
      const result = await service.sweep(token, {
        ip_address: request.ip ?? null,
      });
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

  // GET /api/v1/otzar/my-twin/proposed-patterns
  app.get<{
    Querystring: {
      status?: string;
      limit?: string;
      include_archived?: string;
    };
  }>("/api/v1/otzar/my-twin/proposed-patterns", async (request, reply) => {
    const token = bearerFrom(request.headers.authorization);
    if (token === null) {
      return reply.code(401).send({
        ok: false,
        code: "SESSION_INVALID",
        message: "Missing bearer token",
      });
    }

    let statusFilter: OtzarProposedPatternStatus | undefined = undefined;
    const rawStatus = request.query.status;
    if (rawStatus !== undefined) {
      if (
        (OTZAR_PROPOSED_PATTERN_STATUS_VALUES as readonly string[]).includes(
          rawStatus,
        )
      ) {
        statusFilter = rawStatus as OtzarProposedPatternStatus;
      } else {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: `status must be one of ${OTZAR_PROPOSED_PATTERN_STATUS_VALUES.join(", ")}`,
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

    const result = await service.list(
      token,
      {
        ...(statusFilter !== undefined ? { status: statusFilter } : {}),
        ...(limit !== undefined ? { limit } : {}),
        ...(includeArchived === true ? { include_archived: true } : {}),
      },
      { ip_address: request.ip ?? null },
    );
    if (result.ok === true) {
      return reply.code(200).send(result);
    }
    return reply.code(statusFor(result.code)).send({
      ok: false,
      code: result.code,
      message: result.message,
    });
  });

  // GET /api/v1/otzar/my-twin/proposed-patterns/:id
  app.get<{ Params: { id: string } }>(
    "/api/v1/otzar/my-twin/proposed-patterns/:id",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) {
        return reply.code(401).send({
          ok: false,
          code: "SESSION_INVALID",
          message: "Missing bearer token",
        });
      }
      const result = await service.get(token, request.params.id, {
        ip_address: request.ip ?? null,
      });
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

  // PATCH /api/v1/otzar/my-twin/proposed-patterns/:id
  app.patch<{ Params: { id: string }; Body: TransitionInput }>(
    "/api/v1/otzar/my-twin/proposed-patterns/:id",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) {
        return reply.code(401).send({
          ok: false,
          code: "SESSION_INVALID",
          message: "Missing bearer token",
        });
      }
      const body = (request.body ?? {}) as TransitionInput;
      const result = await service.transition(token, request.params.id, body, {
        ip_address: request.ip ?? null,
      });
      if (result.ok === true) {
        return reply.code(200).send(result);
      }
      return reply.code(statusFor(result.code)).send({
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
