// FILE: auth.routes.ts
// PURPOSE: Wire the three Section 2A HTTP endpoints onto a Fastify
//          instance: POST /api/v1/auth/login, POST /api/v1/auth/logout,
//          GET /api/v1/auth/validate.
// CONNECTS TO: AuthService (does the real work) and the auth
//              middleware (gates /logout and /validate behind a valid
//              session).

import type { FastifyInstance } from "fastify";
import { requireAuth } from "../middleware/auth.middleware.js";
import type { AuthService } from "../services/auth.service.js";

// WHAT: Register the three auth routes on a Fastify instance.
// INPUT: The Fastify instance and the AuthService (with its config
//        already injected).
// OUTPUT: A promise that resolves once all routes are registered.
// WHY: Building this as a function lets tests construct a small
//      Fastify app, register only auth routes, and use inject() to
//      hit them without binding a port.
export async function registerAuthRoutes(
  app: FastifyInstance,
  authService: AuthService,
): Promise<void> {
  app.post<{
    Body: {
      email: string;
      password: string;
      requested_operations?: string[];
    };
  }>("/api/v1/auth/login", async (request, reply) => {
    const body = request.body;
    if (
      body === null ||
      body === undefined ||
      typeof body.email !== "string" ||
      typeof body.password !== "string"
    ) {
      return reply
        .code(400)
        .send({ ok: false, code: "BAD_REQUEST", message: "email and password are required" });
    }
    const requested = Array.isArray(body.requested_operations)
      ? body.requested_operations
      : [];
    const result = await authService.login(
      body.email,
      body.password,
      requested,
      { ip_address: request.ip ?? null },
    );
    if (!result.ok) {
      const status = result.code === "SUSPENDED" ? 403 : 401;
      return reply.code(status).send(result);
    }
    return reply.code(200).send({
      ok: true,
      token: result.token,
      session_id: result.session_id,
      expires_at: result.expires_at.toISOString(),
      allowed_operations: result.allowed_operations,
      clearance_ceiling: result.clearance_ceiling,
    });
  });

  app.post(
    "/api/v1/auth/logout",
    { preHandler: requireAuth(authService, "read") },
    async (request, reply) => {
      const auth = request.auth!;
      await authService.logout(auth.session_id, auth.entity_id, {
        ip_address: request.ip ?? null,
      });
      return reply.code(200).send({ ok: true });
    },
  );

  app.get(
    "/api/v1/auth/validate",
    { preHandler: requireAuth(authService, "read") },
    async (request, reply) => {
      const auth = request.auth!;
      return reply.code(200).send({
        ok: true,
        entity_id: auth.entity_id,
        session_id: auth.session_id,
        clearance_ceiling: auth.clearance_ceiling,
        allowed_operations: auth.allowed_operations,
      });
    },
  );
}
