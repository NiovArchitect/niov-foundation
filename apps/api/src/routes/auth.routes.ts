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
import { mintSetupToken, redeemSetupToken } from "../services/auth-setup-token.service.js";
// [PASSWORD-LIFECYCLE] self-service change + enumeration-safe forgot.
import { hashPassword, verifyPassword } from "@niov/auth";
import { prisma, writeAuditEvent } from "@niov/database";
import {
  composePasswordResetEmail,
  envActivationEmailProvider,
  isActivationEmailConfigured,
} from "../services/activation-email.service.js";

const MIN_PASSWORD_LENGTH = 10;

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

  // ── [PASSWORD-LIFECYCLE] POST /auth/change-password — self-service.
  // Requires the CURRENT password (a stolen session alone can't rotate
  // the credential) + a strong new one. Invalidates every OTHER active
  // session (the current one stays — explicit policy: the person who
  // just proved the password keeps working). Audited PASSWORD_CHANGED;
  // passwords never logged, never in audit.
  app.post<{ Body: { current_password?: unknown; new_password?: unknown } }>(
    "/api/v1/auth/change-password",
    { preHandler: requireAuth(authService, "read") },
    async (request, reply) => {
      const auth = request.auth!;
      const body = request.body ?? {};
      const current = typeof body.current_password === "string" ? body.current_password : "";
      const next = typeof body.new_password === "string" ? body.new_password : "";
      if (next.length < MIN_PASSWORD_LENGTH) {
        return reply.code(422).send({
          ok: false,
          code: "WEAK_PASSWORD",
          message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
        });
      }
      const entity = await prisma.entity.findUnique({
        where: { entity_id: auth.entity_id },
        select: { password_hash: true },
      });
      const currentOk =
        typeof entity?.password_hash === "string" && entity.password_hash.length > 0
          ? await verifyPassword(current, entity.password_hash)
          : false;
      if (!currentOk) {
        return reply.code(403).send({
          ok: false,
          code: "CURRENT_PASSWORD_INCORRECT",
          message: "Your current password didn't match. Nothing was changed.",
        });
      }
      const newHash = await hashPassword(next);
      await prisma.$transaction(async (tx) => {
        await tx.entity.update({
          where: { entity_id: auth.entity_id },
          data: { password_hash: newHash, failed_auth_attempts: 0 },
        });
        // Every OTHER session dies; this one continues by policy.
        await tx.session.updateMany({
          where: {
            entity_id: auth.entity_id,
            status: "ACTIVE",
            session_id: { not: auth.session_id },
          },
          data: { status: "INVALIDATED", invalidated_at: new Date() },
        });
      });
      await writeAuditEvent({
        event_type: "PASSWORD_CHANGED",
        outcome: "SUCCESS",
        actor_entity_id: auth.entity_id,
        target_entity_id: auth.entity_id,
        details: { other_sessions_invalidated: true },
      });
      return reply.code(200).send({ ok: true, other_sessions_invalidated: true });
    },
  );

  // ── [PASSWORD-LIFECYCLE] POST /auth/forgot-password — PUBLIC and
  // ENUMERATION-SAFE: the response is IDENTICAL whether or not the email
  // exists, is active, or is eligible. Internally: an ACTIVE member with
  // a password and an active org membership gets a one-time PASSWORD_RESET
  // token (1h, supersedes priors) emailed via the provider — audited
  // SENT/FAILED with token_id + category only. No token, URL, or
  // existence signal ever reaches the caller.
  app.post<{ Body: { email?: unknown } }>(
    "/api/v1/auth/forgot-password",
    async (request, reply) => {
      const SAFE_RESPONSE = {
        ok: true,
        message: "If an account exists for that email, we sent reset instructions.",
      };
      const email = typeof request.body?.email === "string" ? request.body.email.trim() : "";
      if (email.length === 0 || email.length > 254) {
        return reply.code(200).send(SAFE_RESPONSE);
      }
      try {
        const entity = await prisma.entity.findFirst({
          where: { email, status: "ACTIVE", entity_type: "PERSON" },
          select: { entity_id: true, password_hash: true },
        });
        const eligible =
          entity !== null &&
          typeof entity.password_hash === "string" &&
          entity.password_hash.length > 0;
        if (eligible && isActivationEmailConfigured()) {
          const membership = await prisma.entityMembership.findFirst({
            where: { child_id: entity.entity_id, is_active: true },
            orderBy: { created_at: "asc" },
            select: { parent_id: true },
          });
          if (membership !== null) {
            const minted = await mintSetupToken({
              entity_id: entity.entity_id,
              org_entity_id: membership.parent_id,
              purpose: "PASSWORD_RESET",
              created_by: entity.entity_id, // self-service request
            });
            const org = await prisma.entity.findUnique({
              where: { entity_id: membership.parent_id },
              select: { display_name: true },
            });
            const base = (process.env.CONTROL_TOWER_URL ?? "https://app.otzar.ai").replace(/\/+$/, "");
            const sent = await envActivationEmailProvider().send(
              composePasswordResetEmail({
                to: email,
                orgDisplayName: org?.display_name ?? null,
                resetUrl: `${base}/activate?token=${minted.token}`,
              }),
            );
            await writeAuditEvent({
              event_type: sent.ok ? "PASSWORD_RESET_EMAIL_SENT" : "PASSWORD_RESET_EMAIL_FAILED",
              outcome: sent.ok ? "SUCCESS" : "ERROR",
              actor_entity_id: entity.entity_id,
              target_entity_id: entity.entity_id,
              details: {
                org_entity_id: membership.parent_id,
                token_id: minted.token_id,
                provider_category: sent.ok ? "accepted" : sent.category,
                trigger: "forgot_password",
              },
            });
          }
        }
      } catch {
        // Enumeration safety extends to failures: the caller learns nothing.
      }
      return reply.code(200).send(SAFE_RESPONSE);
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
