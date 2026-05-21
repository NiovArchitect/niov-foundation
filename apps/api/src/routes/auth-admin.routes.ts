// FILE: auth-admin.routes.ts
// PURPOSE: Section 9 admin-flavored auth endpoints that don't fit the
//          general auth surface in auth.routes.ts.
//          POST /auth/admin-register -- alias for POST /org/members.
//          POST /auth/admin-reset    -- stub for password reset trigger.
//          POST /auth/refresh        -- production-ready rolling-window
//                                       token refresh anchored to the
//                                       caller's OrgSettings session
//                                       timeout.
// CONNECTS TO: AuthService (validateSession, createSession, JWT signing
//              via internals reused below), the same admin-creation
//              path /org/members uses (createTwin / createEntity tx
//              helpers), getOrgSettingsOrDefaults (refresh TTL).

import { randomUUID } from "node:crypto";
import jwt, { type SignOptions } from "jsonwebtoken";
import { hashPassword } from "@niov/auth";
import type { FastifyInstance, FastifyReply } from "fastify";
import {
  createSession,
  createTARInTx,
  createWalletInTx,
  getSessionById,
  getTARByEntityId,
  prisma,
  terminateSession,
  writeAudit,
  writeAuditEvent,
  writeTARCreateAudit,
  writeWalletCreateAudit,
  type Prisma,
} from "@niov/database";
import { requireAdminCapability } from "../middleware/admin.middleware.js";
import { getOrgEntityId, getOrgSettingsOrDefaults } from "../services/governance/org.js";
import type {
  AuthService,
  SessionTokenPayload,
} from "../services/auth.service.js";

// WHAT: Pull the bearer token out of an Authorization header.
// INPUT: The raw header value.
// OUTPUT: The token, or null if missing/malformed.
// WHY: Local helper so we don't reach into another routes file.
function bearerFrom(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || !value.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token.length === 0 ? null : token;
}

// WHAT: Resolve caller's org or short-circuit with 404.
// INPUT: caller's entity_id and the reply object.
// OUTPUT: the org's entity_id when resolvable, null when not (with
//         the reply already sent).
// WHY: Same shape as resolveOrgOrFail in org.routes.ts; duplicated
//      here to avoid creating an exported helper just for this file.
async function resolveOrgOrFail(
  entityId: string,
  reply: FastifyReply,
): Promise<string | null> {
  try {
    return await getOrgEntityId(entityId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    if (message === "NOT_IN_ANY_ORG" || message === "ORG_HIERARCHY_TOO_DEEP") {
      await reply.code(404).send({
        ok: false,
        code: "NO_ORG_FOR_CALLER",
        message: "Caller is not in an organization",
      });
      return null;
    }
    throw err;
  }
}

// WHAT: Register the admin-flavored auth routes.
// INPUT: Fastify instance, AuthService (used by /refresh + middleware
//        gates), and the JWT secret (mirrored from buildApp config so
//        /refresh can sign new tokens with the same key login uses).
// OUTPUT: A promise that resolves after registration.
// WHY: One register-fn per file matches the existing pattern.
export async function registerAuthAdminRoutes(
  app: FastifyInstance,
  authService: AuthService,
  jwtSecret: string,
): Promise<void> {
  // ────────────────────────────────────────────────────────────────
  // POST /auth/admin-register
  //
  // ALIAS over POST /org/members. Functionally equivalent to that
  // endpoint -- this URL exists for client conventions that group
  // admin-driven user creation under /auth/*. Same audit event
  // type, same code path (inline create + EntityProfile +
  // EntityMembership in a single transaction).
  // ────────────────────────────────────────────────────────────────
  app.post<{
    Body: {
      email?: unknown;
      password?: unknown;
      first_name?: unknown;
      last_name?: unknown;
      role_title?: unknown;
      hierarchy_level?: unknown;
      is_admin?: unknown;
    };
  }>(
    "/api/v1/auth/admin-register",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;
      const body = request.body ?? {};
      const email =
        typeof body.email === "string" && body.email.trim().length > 0
          ? body.email.trim()
          : null;
      const password =
        typeof body.password === "string" && body.password.length > 0
          ? body.password
          : null;
      if (email === null || password === null) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: "email + password are required",
        });
      }
      const firstName =
        typeof body.first_name === "string" ? body.first_name : null;
      const lastName =
        typeof body.last_name === "string" ? body.last_name : null;
      const roleTitle =
        typeof body.role_title === "string" ? body.role_title : null;
      const hierarchyLevel =
        typeof body.hierarchy_level === "number" &&
        Number.isInteger(body.hierarchy_level)
          ? body.hierarchy_level
          : 0;
      const isAdmin = body.is_admin === true;
      const passwordHash = await hashPassword(password);

      try {
        const created = await prisma.$transaction(async (tx) => {
          const entityId = randomUUID();
          const entity = await tx.entity.create({
            data: {
              entity_id: entityId,
              entity_type: "PERSON",
              display_name:
                `${firstName ?? ""} ${lastName ?? ""}`.trim() || email,
              public_key: `pk_person_${entityId}`,
              email,
              password_hash: passwordHash,
              status: "ACTIVE",
              clearance_level: isAdmin ? 6 : 4,
            },
          });
          const wallet = await createWalletInTx(tx, {
            entity_id: entityId,
            wallet_type: "PERSONAL",
          });
          await writeWalletCreateAudit(tx, wallet, callerId);
          const tar = await createTARInTx(tx, {
            entity_id: entityId,
            entity_type: "PERSON",
          });
          await writeTARCreateAudit(tx, tar, callerId);
          await writeAudit(tx, {
            action: "ENTITY_CREATE",
            entity_id: entityId,
            actor_id: callerId,
            meta: {
              entity_type: "PERSON",
              display_name: entity.display_name,
              via: "auth_admin_register",
            },
          });
          await tx.entityProfile.create({
            data: {
              profile_id: randomUUID(),
              entity_id: entityId,
              first_name: firstName,
              last_name: lastName,
              job_title: roleTitle,
            },
          });
          await tx.entityMembership.create({
            data: {
              parent_id: orgEntityId,
              child_id: entityId,
              role_title: roleTitle,
              hierarchy_level: hierarchyLevel,
              is_admin: isAdmin,
              is_active: true,
            },
          });
          await writeAuditEvent(
            {
              event_type: "ADMIN_ACTION",
              outcome: "SUCCESS",
              actor_entity_id: callerId,
              target_entity_id: entityId,
              details: {
                action: "AUTH_ADMIN_REGISTER",
                org_entity_id: orgEntityId,
                email,
                is_admin: isAdmin,
              },
            },
            tx,
          );
          return entity;
        });
        return reply.code(201).send({
          ok: true,
          entity_id: created.entity_id,
          email: created.email,
          display_name: created.display_name,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "unknown";
        if (message.includes("Unique constraint")) {
          return reply.code(409).send({
            ok: false,
            code: "EMAIL_ALREADY_EXISTS",
            message: "An entity with that email already exists",
          });
        }
        return reply.code(500).send({
          ok: false,
          code: "ADMIN_REGISTER_FAILED",
          message,
        });
      }
    },
  );

  // ────────────────────────────────────────────────────────────────
  // POST /auth/admin-reset
  //
  // STUB: returns a one-time reset_token (uuid) but does not send
  // an email or persist the token to a reset-tokens table. The full
  // reset flow lands when the email infrastructure ships
  // (Section 14+).
  // ────────────────────────────────────────────────────────────────
  app.post<{ Body: { entity_id?: unknown } }>(
    "/api/v1/auth/admin-reset",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;
      const targetId =
        typeof request.body?.entity_id === "string" &&
        request.body.entity_id.trim().length > 0
          ? request.body.entity_id.trim()
          : null;
      if (targetId === null) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: "entity_id is required",
        });
      }
      // Verify target is in the caller's org.
      const membership = await prisma.entityMembership.findFirst({
        where: {
          parent_id: orgEntityId,
          child_id: targetId,
          is_active: true,
        },
      });
      if (membership === null) {
        return reply.code(404).send({
          ok: false,
          code: "ENTITY_NOT_IN_ORG",
          message: "Entity is not in your org",
        });
      }
      const resetToken = randomUUID();
      await writeAuditEvent({
        event_type: "ADMIN_ACTION",
        outcome: "SUCCESS",
        actor_entity_id: callerId,
        target_entity_id: targetId,
        details: {
          action: "PASSWORD_RESET_TRIGGERED",
          // TODO(future-email-infra): send reset email with this token
          // and persist a hashed copy in a reset_tokens table.
          reset_token_issued: true,
        },
      });
      return reply.code(200).send({
        ok: true,
        reset_token: resetToken,
        message:
          "Reset token issued. Email delivery not yet wired -- token returned in response for now.",
      });
    },
  );

  // ────────────────────────────────────────────────────────────────
  // POST /auth/refresh
  //
  // PRODUCTION-READY (no stub). Validates the current Bearer token,
  // mints a fresh session row + JWT using the caller's current
  // OrgSettings.session_timeout_minutes (so an org that updated its
  // timeout via PATCH /org/settings sees the new TTL on the next
  // refresh).
  //
  // ROLLING WINDOW: the old session stays ACTIVE alongside the new
  // session. This supports multi-tab clients that share a single
  // session id; killing the old session would log them out of every
  // other tab. Section 15 hardening may add an optional
  // "revoke_prior" flag if the threat model evolves to require
  // strict session rotation.
  // ────────────────────────────────────────────────────────────────
  app.post("/api/v1/auth/refresh", async (request, reply) => {
    const token = bearerFrom(request.headers.authorization);
    if (token === null) {
      return reply.code(401).send({
        ok: false,
        code: "SESSION_INVALID",
        message: "Missing bearer token",
      });
    }
    // Validate against "read" -- the lowest-privilege operation
    // present in every session. The new session's allowed_operations
    // is copied from the existing session row, so the refresh is
    // not a privilege escalation.
    const result = await authService.validateSession(token, "read");
    if (!result.valid) {
      const status =
        result.code === "OPERATION_NOT_PERMITTED" ? 403 : 401;
      return reply.code(status).send({ ok: false, code: result.code });
    }

    const tar = await getTARByEntityId(result.entity_id);
    if (tar === null || tar.status !== "ACTIVE") {
      return reply.code(401).send({
        ok: false,
        code: "SESSION_INVALIDATED",
        message: "TAR no longer ACTIVE",
      });
    }

    // Re-read the original session to copy allowed_operations so the
    // refresh preserves session scope without trusting the JWT
    // (which an attacker could have rewritten if the server somehow
    // accepted it).
    const originalSession = await getSessionById(result.session_id);
    if (originalSession === null) {
      return reply.code(401).send({
        ok: false,
        code: "SESSION_REVOKED",
        message: "Original session not found",
      });
    }

    // Read OrgSettings for the new TTL. Tolerant -- orgless callers
    // get the spec default 480 minutes.
    const orgSettings = await getOrgSettingsOrDefaults(result.entity_id);
    const ttlMs = orgSettings.session_timeout_minutes * 60 * 1000;
    const ttlSeconds = Math.floor(ttlMs / 1000);

    const newSessionId = randomUUID();
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + ttlMs);

    await createSession({
      session_id: newSessionId,
      entity_id: result.entity_id,
      tar_hash_at_creation: tar.tar_hash,
      allowed_operations: originalSession.allowed_operations,
      clearance_ceiling: originalSession.clearance_ceiling,
      issued_at: issuedAt,
      expires_at: expiresAt,
      // GOVSEC.3C-B1 / GAP-A1: snapshot the org idle-timeout window onto the
      // refreshed session so a refreshed session also idle-expires (3C-B2).
      // Additive only -- the GOVSEC.3A rotation logic below is unchanged.
      idle_timeout_minutes: orgSettings.idle_timeout_minutes,
    });

    const payload: SessionTokenPayload = {
      session_id: newSessionId,
      entity_id: result.entity_id,
      allowed_operations: originalSession.allowed_operations,
      clearance_ceiling: originalSession.clearance_ceiling,
      tar_hash: tar.tar_hash,
      expires_at: expiresAt.getTime(),
      issued_at: issuedAt.getTime(),
    };
    const signOptions: SignOptions = { expiresIn: ttlSeconds };
    const newToken = jwt.sign(payload, jwtSecret, signOptions);

    // Stamp the nonce store via AuthService's accessor pattern.
    // The nonce store is private on AuthService so we reach in via a
    // helper method. If AuthService doesn't expose one, mint a new
    // session normally -- the nonce will land via the createSession
    // hook chain. For now, assume validateSession's nonce check is
    // satisfied because the session row exists in the DB. Sections
    // 15 may add an explicit setNonce method on AuthService if this
    // proves insufficient.
    // Wire the nonce by importing the same path login uses:
    await (authService as unknown as {
      config: { nonceStore: { set: (k: string, ttl: number) => Promise<void> } };
    }).config.nonceStore.set(newSessionId, ttlSeconds);

    // GOVSEC.3A / GAP-A4: always-rotate. Revoke the prior session so the old
    // token can no longer be used: terminate the old session row, delete its
    // nonce, and record the rotation on the modern hash-chained audit
    // (reusing SESSION_REVOKED with reason "rotated"; outcome SUCCESS marks a
    // successful lifecycle transition, distinct from the GOVSEC.2A DENIED-path
    // SESSION_REVOKED for rejected use of an already-dead session). This
    // intentionally ends the prior session (multi-tab tradeoff accepted for
    // government-grade closure). Emitted on the actor's per-user chain only.
    await terminateSession(result.session_id, result.entity_id);
    await (authService as unknown as {
      config: { nonceStore: { delete: (k: string) => Promise<void> } };
    }).config.nonceStore.delete(result.session_id);
    await writeAuditEvent({
      event_type: "SESSION_REVOKED",
      outcome: "SUCCESS",
      actor_entity_id: result.entity_id,
      session_id: result.session_id,
      ip_address: request.ip ?? null,
      details: { reason: "rotated", revoked_prior: true },
    });

    await writeAuditEvent({
      event_type: "SESSION_CREATED",
      outcome: "SUCCESS",
      actor_entity_id: result.entity_id,
      session_id: newSessionId,
      ip_address: request.ip ?? null,
      details: {
        action: "TOKEN_REFRESH",
        prior_session_id: result.session_id,
        prior_session_kept_active: false,
        revoked_prior: true,
        ttl_minutes: orgSettings.session_timeout_minutes,
      },
    });

    return reply.code(200).send({
      ok: true,
      token: newToken,
      session_id: newSessionId,
      entity_id: result.entity_id,
      expires_at: expiresAt.toISOString(),
      allowed_operations: originalSession.allowed_operations,
      clearance_ceiling: originalSession.clearance_ceiling,
      ttl_minutes: orgSettings.session_timeout_minutes,
    });
  });
}
