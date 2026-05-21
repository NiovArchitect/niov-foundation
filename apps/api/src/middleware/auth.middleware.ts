// FILE: auth.middleware.ts
// PURPOSE: Drop-in Fastify hook that gates a route behind a valid
//          session AND a specific required operation.
// CONNECTS TO: auth.service.ts (does the actual validation), and
//              every protected route in apps/api/src/routes.

import type { FastifyReply, FastifyRequest } from "fastify";
import type {
  AuthService,
  ValidateFailure,
} from "../services/auth.service.js";
import { clientContextFrom } from "./request-context.js";

// WHAT: Augment FastifyRequest so handlers can read req.auth after
//        the middleware runs.
// INPUT: Used as a type augmentation only.
// OUTPUT: None.
// WHY: TypeScript-friendly way to attach auth context without using
//      'any' inside route handlers.
declare module "fastify" {
  interface FastifyRequest {
    auth?: {
      entity_id: string;
      session_id: string;
      clearance_ceiling: number;
      allowed_operations: string[];
    };
  }
}

// WHAT: Map a ValidateFailure code to an HTTP status code.
// INPUT: A failure code from validateSession.
// OUTPUT: An HTTP status code.
// WHY: Centralizing the mapping means routes get consistent status
//      codes without re-implementing the switch in every handler.
function statusForFailure(code: ValidateFailure["code"]): number {
  switch (code) {
    case "OPERATION_NOT_PERMITTED":
      return 403;
    case "SESSION_INVALID":
    case "SESSION_EXPIRED":
    case "SESSION_REVOKED":
    case "SESSION_INVALIDATED":
      return 401;
  }
}

// WHAT: Build a Fastify preHandler hook that requires a specific
//        operation to be allowed by the session.
// INPUT: The AuthService and the operation name (e.g., "read").
// OUTPUT: A preHandler function suitable for fastify.route({ preHandler }).
// WHY: Routes describe what they need ("requireAuth('read')") and the
//      hook does the seven-step validation. If validation fails the
//      hook ends the request with a clear error code; if it passes
//      the handler can read req.auth for context.
export function requireAuth(
  authService: AuthService,
  requiredOperation: string,
) {
  return async function preHandler(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const header = request.headers.authorization;
    if (typeof header !== "string" || !header.startsWith("Bearer ")) {
      await reply.code(401).send({
        ok: false,
        code: "SESSION_INVALID",
        message: "Missing bearer token",
      });
      return;
    }
    const token = header.slice("Bearer ".length).trim();

    const result = await authService.validateSession(token, requiredOperation, clientContextFrom(request));
    if (!result.valid) {
      await reply
        .code(statusForFailure(result.code))
        .send({ ok: false, code: result.code });
      return;
    }

    request.auth = {
      entity_id: result.entity_id,
      session_id: result.session_id,
      clearance_ceiling: result.clearance_ceiling,
      allowed_operations: result.allowed_operations,
    };
  };
}
