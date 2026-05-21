// FILE: wallet.routes.ts
// PURPOSE: HTTP surface for wallet-balance + monetization-history
//          + per-capsule monetization toggle.
// CONNECTS TO: MonetizationService.

import type { FastifyInstance } from "fastify";
import { prisma, type Prisma } from "@niov/database";
import type { AuthService } from "../services/auth.service.js";
import type { MonetizationService } from "../services/monetization/monetization.service.js";
import { clientContextFrom } from "../middleware/request-context.js";

// WHAT: Pull the bearer token out of an Authorization header.
// INPUT: The raw header value.
// OUTPUT: The token, or null when missing/shaped wrong.
// WHY: One place for header-shape validation per file.
function bearerFrom(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || !value.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token.length === 0 ? null : token;
}

// WHAT: Map a service-level failure code to an HTTP status.
// INPUT: The code string.
// OUTPUT: An HTTP status number.
// WHY: One mapping for every wallet route.
function statusForCode(code: string): number {
  switch (code) {
    case "SESSION_INVALID":
    case "SESSION_EXPIRED":
    case "SESSION_REVOKED":
    case "SESSION_INVALIDATED":
      return 401;
    case "OPERATION_NOT_PERMITTED":
    case "NOT_CAPSULE_OWNER":
      return 403;
    case "CAPSULE_NOT_FOUND":
      return 404;
    case "INVALID_REQUEST":
      return 422;
    default:
      return 400;
  }
}

// WHAT: Register the three wallet routes on a Fastify instance.
// INPUT: Fastify instance and the MonetizationService.
// OUTPUT: A promise that resolves once routes are registered.
// WHY: Tests construct a small Fastify app and inject() requests
//      against these routes.
export async function registerWalletRoutes(
  app: FastifyInstance,
  monetizationService: MonetizationService,
  authService?: AuthService,
): Promise<void> {
  app.get("/api/v1/wallet/balance", async (request, reply) => {
    const sessionToken = bearerFrom(request.headers.authorization);
    if (sessionToken === null) {
      return reply.code(401).send({
        ok: false,
        code: "SESSION_INVALID",
        message: "Missing bearer token",
      });
    }
    const result = await monetizationService.getBalance(sessionToken);
    if (!result.ok) {
      return reply.code(statusForCode(result.code)).send(result);
    }
    return reply.code(200).send(result);
  });

  app.get<{
    Querystring: { page?: string; page_size?: string };
  }>("/api/v1/wallet/history", async (request, reply) => {
    const sessionToken = bearerFrom(request.headers.authorization);
    if (sessionToken === null) {
      return reply.code(401).send({
        ok: false,
        code: "SESSION_INVALID",
        message: "Missing bearer token",
      });
    }
    const page = Number.parseInt(request.query.page ?? "1", 10);
    const pageSize = Number.parseInt(request.query.page_size ?? "50", 10);
    const result = await monetizationService.getHistory(
      sessionToken,
      Number.isFinite(page) ? page : 1,
      Number.isFinite(pageSize) ? pageSize : 50,
    );
    if (!result.ok) {
      return reply.code(statusForCode(result.code)).send(result);
    }
    return reply.code(200).send(result);
  });

  app.patch<{
    Body: { capsule_id: string; enabled: boolean };
  }>("/api/v1/wallet/monetization/toggle", async (request, reply) => {
    const sessionToken = bearerFrom(request.headers.authorization);
    if (sessionToken === null) {
      return reply.code(401).send({
        ok: false,
        code: "SESSION_INVALID",
        message: "Missing bearer token",
      });
    }
    const body = request.body;
    if (
      !body ||
      typeof body.capsule_id !== "string" ||
      typeof body.enabled !== "boolean"
    ) {
      return reply.code(422).send({
        ok: false,
        code: "INVALID_REQUEST",
        message: "capsule_id (string) and enabled (boolean) are required",
      });
    }
    const result = await monetizationService.toggleMonetization(
      sessionToken,
      body.capsule_id,
      body.enabled,
    );
    if (!result.ok) {
      return reply.code(statusForCode(result.code)).send(result);
    }
    return reply.code(200).send(result);
  });

  // GET /wallet/suggestions -- MonetizationSuggestion rows for the
  // caller's wallet HOLDER (entity_id). Section 10 Loop 6 produces
  // these. Privacy invariant: rows here NEVER carry accessor
  // identity -- only capsule_type + demand_level + estimated value.
  if (authService !== undefined) {
    app.get<{ Querystring: { skip?: string; take?: string } }>(
      "/api/v1/wallet/suggestions",
      async (request, reply) => {
        const sessionToken = bearerFrom(request.headers.authorization);
        if (sessionToken === null) {
          return reply.code(401).send({
            ok: false,
            code: "SESSION_INVALID",
            message: "Missing bearer token",
          });
        }
        const session = await authService.validateSession(sessionToken, "read", clientContextFrom(request));
        if (!session.valid) {
          return reply.code(statusForCode(session.code)).send({
            ok: false,
            code: session.code,
          });
        }
        const skipNum = Number.parseInt(request.query.skip ?? "0", 10);
        const takeNum = Number.parseInt(request.query.take ?? "50", 10);
        const skip = Number.isFinite(skipNum) && skipNum >= 0 ? skipNum : 0;
        const take = Math.max(
          1,
          Math.min(200, Number.isFinite(takeNum) ? takeNum : 50),
        );
        const where: Prisma.MonetizationSuggestionWhereInput = {
          entity_id: session.entity_id,
        };
        const [items, total] = await Promise.all([
          prisma.monetizationSuggestion.findMany({
            where,
            skip,
            take,
            orderBy: { created_at: "desc" },
          }),
          prisma.monetizationSuggestion.count({ where }),
        ]);
        return reply.code(200).send({
          ok: true,
          items,
          total,
          has_more: skip + take < total,
        });
      },
    );
  }
}
