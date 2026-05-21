// FILE: admin.middleware.ts
// PURPOSE: Layer the per-route admin-capability check (can_admin_org
//          or can_admin_niov) on top of the existing requireAuth
//          flow. /platform/* routes use can_admin_niov;
//          /org/* routes use can_admin_org. The 403 response carries
//          a specific error code so the caller can distinguish
//          "your token is fine but you don't have this capability"
//          from "your token is bad".
// CONNECTS TO: AuthService.validateSession (Section 2A), TAR via
//              getTARByEntityId (Section 1F), every route under
//              /platform/* and /org/*.

import type { FastifyReply, FastifyRequest } from "fastify";
import { getTARByEntityId } from "@niov/database";
import type { AuthService } from "../services/auth.service.js";
import { clientContextFrom } from "./request-context.js";

// WHAT: The two TAR fields this middleware can gate on.
// INPUT: Used as a parameter type only.
// OUTPUT: None.
// WHY: Type-narrowed so callers cannot accidentally request a
//      capability the middleware does not support.
export type AdminCapability = "can_admin_org" | "can_admin_niov";

// WHAT: Decode the bearer token, validate the session for "read"
//        access, fetch the TAR, and confirm the requested
//        capability is true.
// INPUT: AuthService and the capability to check.
// OUTPUT: A Fastify preHandler hook.
// WHY: Routes describe what they need; this hook does the four-step
//      check (token shape, session validity, TAR lookup, flag
//      check). On success it populates req.auth so handlers can
//      read entity_id without a second decode.
export function requireAdminCapability(
  authService: AuthService,
  capability: AdminCapability,
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

    // The session itself is gated to "read" -- admin actions can
    // happen via any active session, the capability flag does the
    // heavier lifting.
    const result = await authService.validateSession(token, "read", clientContextFrom(request));
    if (!result.valid) {
      const status =
        result.code === "OPERATION_NOT_PERMITTED" ? 403 : 401;
      await reply.code(status).send({ ok: false, code: result.code });
      return;
    }

    const tar = await getTARByEntityId(result.entity_id);
    if (tar === null || tar.status !== "ACTIVE" || tar[capability] !== true) {
      await reply.code(403).send({
        ok: false,
        error: "ADMIN_CAPABILITY_REQUIRED",
        required: capability,
        message: "Caller's TAR does not grant this admin capability",
      });
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
