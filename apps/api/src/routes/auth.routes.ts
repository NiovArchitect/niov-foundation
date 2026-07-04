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
import { redeemSetupToken } from "../services/auth-setup-token.service.js";

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
      // GOVSEC.3D-A / GAP-A3: pass the client user-agent so login can snapshot a
      // device-binding hash onto the session (the service computes the HMAC and
      // never stores the raw user-agent). ip_address unchanged.
      { ip_address: request.ip ?? null, user_agent: request.headers["user-agent"] ?? null },
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

  // ── [P0-ONBOARD] POST /auth/activate — PUBLIC one-time token redemption.
  // Redeems either an ACTIVATION or PASSWORD_RESET token and sets the
  // entity's own password. Unauthenticated by design (the invitee has no
  // session yet); safety comes from the token itself: 256-bit, sha256 at
  // rest, expiring, one-time, org-bound, minted only by an authenticated
  // org admin. Grants NOTHING beyond the password — TAR/membership/twin
  // come from the existing invite gates. Errors are honest and human.
  app.post<{ Body: { token?: unknown; password?: unknown } }>(
    "/api/v1/auth/activate",
    async (request, reply) => {
      const body = request.body ?? {};
      const token = typeof body.token === "string" ? body.token : "";
      const password = typeof body.password === "string" ? body.password : "";
      const result = await redeemSetupToken({ token, password });
      if (result.ok === false) {
        const status =
          result.code === "WEAK_PASSWORD" ? 422
          : result.code === "TOKEN_INVALID" ? 404
          : 410; // TOKEN_EXPIRED | TOKEN_USED
        return reply.code(status).send({ ok: false, code: result.code, message: result.message });
      }
      return reply.code(200).send({ ok: true, purpose: result.purpose });
    },
  );

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
