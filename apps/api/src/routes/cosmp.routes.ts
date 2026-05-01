// FILE: cosmp.routes.ts
// PURPOSE: HTTP surface for the COSMP Protocol operations. Section 3A
//          adds POST /api/v1/cosmp/negotiate. Future sections (READ,
//          WRITE, etc) will register their handlers here too.
// CONNECTS TO: NegotiateService (does the real work).

import type { FastifyInstance } from "fastify";
import type { NegotiateService } from "../services/cosmp/negotiate.service.js";
import type { AccessScope } from "@niov/database";

// WHAT: Register the COSMP routes on a Fastify instance.
// INPUT: The Fastify instance and the NegotiateService.
// OUTPUT: A promise that resolves once routes are registered.
// WHY: Tests construct a small Fastify app, register only the routes
//      they need, and use inject() to hit them.
export async function registerCosmpRoutes(
  app: FastifyInstance,
  negotiateService: NegotiateService,
): Promise<void> {
  app.post<{
    Body: {
      capsule_id: string;
      requested_scope: AccessScope;
    };
  }>("/api/v1/cosmp/negotiate", async (request, reply) => {
    const body = request.body;
    if (
      body === null ||
      body === undefined ||
      typeof body.capsule_id !== "string" ||
      typeof body.requested_scope !== "string"
    ) {
      return reply.code(400).send({
        ok: false,
        code: "BAD_REQUEST",
        message: "capsule_id and requested_scope are required",
      });
    }

    const header = request.headers.authorization;
    if (typeof header !== "string" || !header.startsWith("Bearer ")) {
      return reply.code(401).send({
        ok: false,
        code: "SESSION_INVALID",
        message: "Missing bearer token",
      });
    }
    const token = header.slice("Bearer ".length).trim();

    const result = await negotiateService.negotiate(
      token,
      body.capsule_id,
      body.requested_scope,
      { ip_address: request.ip ?? null },
    );

    if (!result.ok) {
      const status = statusForCode(result.code);
      return reply.code(status).send(result);
    }

    return reply.code(200).send({
      ok: true,
      declaration_id: result.declaration_id,
      declaration_token: result.declaration_token,
      capsule_id: result.capsule_id,
      granted_scope: result.granted_scope,
      valid_until: result.valid_until.toISOString(),
    });
  });
}

// WHAT: Map a NegotiateFailure code to an HTTP status.
// INPUT: The failure code string.
// OUTPUT: A numeric HTTP status.
// WHY: One place to set the convention -- 401 for session-class
//      failures, 403 for forbidden-but-known (NO_PERMISSION,
//      ACCESS_DENIED), 400 only when the request itself is malformed.
function statusForCode(code: string): number {
  switch (code) {
    case "SESSION_INVALID":
    case "SESSION_EXPIRED":
    case "SESSION_REVOKED":
    case "SESSION_INVALIDATED":
      return 401;
    case "OPERATION_NOT_PERMITTED":
    case "ACCESS_DENIED":
    case "NO_PERMISSION":
      return 403;
    default:
      return 400;
  }
}
