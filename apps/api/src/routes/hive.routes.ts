// FILE: hive.routes.ts
// PURPOSE: HTTP surface for the Hive Intelligence flows.
// CONNECTS TO: HiveService.

import type { FastifyInstance } from "fastify";
import type {
  HiveService,
  MembershipSettings,
} from "../services/hive/hive.service.js";
import type { HiveType } from "@niov/database";

// WHAT: Pull the bearer token out of an Authorization header.
// INPUT: The raw header value.
// OUTPUT: The token, or null when missing/shaped wrong.
// WHY: Single point of header-shape validation.
function bearerFrom(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || !value.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token.length === 0 ? null : token;
}

// WHAT: Map a service-level failure code to an HTTP status.
// INPUT: The code string.
// OUTPUT: An HTTP status number.
// WHY: One mapping for every Hive route.
function statusForCode(code: string): number {
  switch (code) {
    case "SESSION_INVALID":
    case "SESSION_EXPIRED":
    case "SESSION_REVOKED":
    case "SESSION_INVALIDATED":
      return 401;
    case "OPERATION_NOT_PERMITTED":
    case "NOT_HIVE_CREATOR":
    case "NOT_HIVE_MEMBER":
    case "HIVE_DISSOLVED":
      return 403;
    case "HIVE_NOT_FOUND":
    case "INVITEE_NOT_FOUND":
    case "INVITEE_NO_WALLET":
    case "MEMBERSHIP_NOT_FOUND":
    case "AGGREGATE_NOT_BUILT":
      return 404;
    case "ALREADY_MEMBER":
      return 409;
    case "INVALID_REQUEST":
      return 422;
    default:
      return 400;
  }
}

// WHAT: Register the four Hive routes on a Fastify instance.
// INPUT: Fastify instance and the HiveService.
// OUTPUT: A promise that resolves once routes are registered.
// WHY: One function = one place to wire the Hive HTTP surface.
export async function registerHiveRoutes(
  app: FastifyInstance,
  hiveService: HiveService,
): Promise<void> {
  app.post<{
    Body: {
      hive_name: string;
      hive_type: HiveType;
      governance_terms?: Record<string, unknown>;
      settings?: MembershipSettings;
    };
  }>("/api/v1/hive", async (request, reply) => {
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
      typeof body.hive_name !== "string" ||
      typeof body.hive_type !== "string"
    ) {
      return reply.code(422).send({
        ok: false,
        code: "INVALID_REQUEST",
        message: "hive_name and hive_type are required",
      });
    }
    const result = await hiveService.createHive(
      sessionToken,
      body.hive_name,
      body.hive_type,
      body.governance_terms ?? {},
      body.settings ?? {},
      { ip_address: request.ip ?? null },
    );
    if (!result.ok) {
      return reply.code(statusForCode(result.code)).send(result);
    }
    return reply.code(201).send(result);
  });

  app.post<{
    Params: { id: string };
    Body: { entity_id: string; settings?: MembershipSettings };
  }>("/api/v1/hive/:id/invite", async (request, reply) => {
    const sessionToken = bearerFrom(request.headers.authorization);
    if (sessionToken === null) {
      return reply.code(401).send({
        ok: false,
        code: "SESSION_INVALID",
        message: "Missing bearer token",
      });
    }
    const body = request.body;
    if (!body || typeof body.entity_id !== "string") {
      return reply.code(422).send({
        ok: false,
        code: "INVALID_REQUEST",
        message: "entity_id is required",
      });
    }
    const result = await hiveService.inviteToHive(
      sessionToken,
      request.params.id,
      body.entity_id,
      body.settings ?? {},
      { ip_address: request.ip ?? null },
    );
    if (!result.ok) {
      return reply.code(statusForCode(result.code)).send(result);
    }
    return reply.code(201).send(result);
  });

  app.delete<{ Params: { id: string; entityId: string } }>(
    "/api/v1/hive/:id/member/:entityId",
    async (request, reply) => {
      const sessionToken = bearerFrom(request.headers.authorization);
      if (sessionToken === null) {
        return reply.code(401).send({
          ok: false,
          code: "SESSION_INVALID",
          message: "Missing bearer token",
        });
      }
      const result = await hiveService.removeMember(
        sessionToken,
        request.params.id,
        request.params.entityId,
        { ip_address: request.ip ?? null },
      );
      if (!result.ok) {
        return reply.code(statusForCode(result.code)).send(result);
      }
      return reply.code(200).send(result);
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/v1/hive/:id/intelligence",
    async (request, reply) => {
      const sessionToken = bearerFrom(request.headers.authorization);
      if (sessionToken === null) {
        return reply.code(401).send({
          ok: false,
          code: "SESSION_INVALID",
          message: "Missing bearer token",
        });
      }
      const result = await hiveService.getHiveIntelligence(
        sessionToken,
        request.params.id,
        { ip_address: request.ip ?? null },
      );
      if (!result.ok) {
        return reply.code(statusForCode(result.code)).send(result);
      }
      return reply.code(200).send(result);
    },
  );
}
