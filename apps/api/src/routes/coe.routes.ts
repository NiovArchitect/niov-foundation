// FILE: coe.routes.ts
// PURPOSE: HTTP surface for the Contextual Orchestration Engine.
// CONNECTS TO: COEService.

import type { FastifyInstance } from "fastify";
import type { COEService } from "../services/coe/coe.service.js";

// WHAT: Pull a Bearer token out of an Authorization header.
// INPUT: The raw header value.
// OUTPUT: The token, or null when the header is missing / shaped wrong.
// WHY: Keeps the auth-token shape check in one place per file.
function bearerFrom(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || !value.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token.length === 0 ? null : token;
}

// WHAT: Map a service-level failure code to an HTTP status.
// INPUT: The code string.
// OUTPUT: An HTTP status number.
// WHY: One mapping for all three COE routes.
function statusForCode(code: string): number {
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
    default:
      return 400;
  }
}

// WHAT: Register the three COE routes on a Fastify instance.
// INPUT: Fastify instance and the COEService.
// OUTPUT: A promise that resolves once routes are registered.
// WHY: One function = one place to wire the COE HTTP surface.
export async function registerCoeRoutes(
  app: FastifyInstance,
  coeService: COEService,
): Promise<void> {
  app.post<{
    Body: {
      request_text: string;
      token_budget: number;
      // Section 1 Wave 6B (ADR-0067) — explicit owner-control
      // opt-out for the symbiotic alignment-pattern sidecar. When
      // `false`, assembleContext suppresses the sidecar read +
      // omits `alignment_patterns` from the response (default
      // true symbiotic posture). When the optional
      // proposedPatternService dependency is not wired, this
      // flag is a no-op.
      include_alignment_patterns?: boolean;
    };
  }>("/api/v1/coe/context", async (request, reply) => {
    const sessionToken = bearerFrom(request.headers.authorization);
    if (sessionToken === null) {
      return reply.code(401).send({
        ok: false,
        code: "SESSION_INVALID",
        message: "Missing bearer token",
      });
    }
    const body =
      request.body ??
      ({} as {
        request_text: string;
        token_budget: number;
        include_alignment_patterns?: boolean;
      });
    const result = await coeService.assembleContext(
      sessionToken,
      body.request_text,
      body.token_budget,
      {
        ip_address: request.ip ?? null,
        ...(body.include_alignment_patterns === false
          ? { include_alignment_patterns: false }
          : {}),
      },
    );
    if (!result.ok) {
      return reply.code(statusForCode(result.code)).send(result);
    }
    return reply.code(200).send(result);
  });

  app.post<{ Body: { search_query: string } }>(
    "/api/v1/coe/recall",
    async (request, reply) => {
      const sessionToken = bearerFrom(request.headers.authorization);
      if (sessionToken === null) {
        return reply.code(401).send({
          ok: false,
          code: "SESSION_INVALID",
          message: "Missing bearer token",
        });
      }
      const result = await coeService.explicitRecall(
        sessionToken,
        request.body?.search_query,
        { ip_address: request.ip ?? null },
      );
      if (!result.ok) {
        return reply.code(statusForCode(result.code)).send(result);
      }
      return reply.code(200).send(result);
    },
  );

  app.post<{
    Body: {
      session_id?: string | null;
      capsule_ids_used: string[];
      success: boolean;
    };
  }>("/api/v1/coe/outcome", async (request, reply) => {
    const sessionToken = bearerFrom(request.headers.authorization);
    if (sessionToken === null) {
      return reply.code(401).send({
        ok: false,
        code: "SESSION_INVALID",
        message: "Missing bearer token",
      });
    }
    const body = request.body;
    const result = await coeService.recordOutcome(
      sessionToken,
      body?.session_id ?? null,
      body?.capsule_ids_used ?? [],
      body?.success ?? false,
      { ip_address: request.ip ?? null },
    );
    if (!result.ok) {
      return reply.code(statusForCode(result.code)).send(result);
    }
    return reply.code(201).send(result);
  });
}
