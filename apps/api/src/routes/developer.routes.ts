// FILE: developer.routes.ts
// PURPOSE: API key management for entities. Lists / creates /
//          revokes long-lived programmatic credentials. Actual
//          API-key authentication (as an alternative to JWT) is
//          a future feature; for now this route only manages the
//          key rows.
// CONNECTS TO: AuthService (validates the session driving the
//              management call), the api_keys table.

import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { prisma, writeAuditEvent } from "@niov/database";
import type { AuthService } from "../services/auth.service.js";

// WHAT: Pull the bearer token out of an Authorization header.
function bearerFrom(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || !value.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token.length === 0 ? null : token;
}

// WHAT: Generate a brand new API key string.
// INPUT: None.
// OUTPUT: A string shaped "niov_<64 hex chars>".
// WHY: Spec says "64-char random, prefix niov_". 32 random bytes
//      hex-encoded gives the 64-char random tail; we prefix the
//      product so the key is recognizable on sight.
function generateApiKey(): string {
  return `niov_${randomBytes(32).toString("hex")}`;
}

// WHAT: Register the three developer routes.
// INPUT: A Fastify instance and the AuthService.
// OUTPUT: A promise that resolves once routes are registered.
// WHY: One function = one place to wire the developer surface.
export async function registerDeveloperRoutes(
  app: FastifyInstance,
  authService: AuthService,
): Promise<void> {
  app.post<{ Body: { key_name?: string; expires_at?: string | null } }>(
    "/api/v1/developer/api-keys",
    async (request, reply) => {
      const sessionToken = bearerFrom(request.headers.authorization);
      if (sessionToken === null) {
        return reply.code(401).send({
          ok: false,
          code: "SESSION_INVALID",
          message: "Missing bearer token",
        });
      }
      const session = await authService.validateSession(sessionToken, "read");
      if (!session.valid) {
        return reply.code(401).send({
          ok: false,
          code: session.code,
          message: "API key creation denied",
        });
      }
      const body = request.body ?? {};
      const keyName =
        typeof body.key_name === "string" && body.key_name.length > 0
          ? body.key_name
          : "default";
      const expiresAt =
        typeof body.expires_at === "string" ? new Date(body.expires_at) : null;

      const apiKey = generateApiKey();
      const created = await prisma.apiKey.create({
        data: {
          entity_id: session.entity_id,
          api_key: apiKey,
          key_name: keyName,
          expires_at: expiresAt,
        },
      });

      await writeAuditEvent({
        event_type: "ADMIN_ACTION",
        outcome: "SUCCESS",
        actor_entity_id: session.entity_id,
        session_id: session.session_id,
        details: {
          action: "API_KEY_CREATED",
          key_id: created.key_id,
          key_name: keyName,
        },
      });

      return reply.code(201).send({
        ok: true,
        key_id: created.key_id,
        api_key: apiKey,
        key_name: keyName,
        created_at: created.created_at.toISOString(),
        expires_at: created.expires_at?.toISOString() ?? null,
      });
    },
  );

  app.get("/api/v1/developer/api-keys", async (request, reply) => {
    const sessionToken = bearerFrom(request.headers.authorization);
    if (sessionToken === null) {
      return reply.code(401).send({
        ok: false,
        code: "SESSION_INVALID",
        message: "Missing bearer token",
      });
    }
    const session = await authService.validateSession(sessionToken, "read");
    if (!session.valid) {
      return reply.code(401).send({
        ok: false,
        code: session.code,
        message: "API key list denied",
      });
    }
    const rows = await prisma.apiKey.findMany({
      where: { entity_id: session.entity_id },
      orderBy: { created_at: "desc" },
      // We deliberately omit the api_key column so a list call
      // never re-leaks the secret. The plaintext key is only
      // returned at create time.
      select: {
        key_id: true,
        key_name: true,
        is_active: true,
        created_at: true,
        last_used_at: true,
        expires_at: true,
      },
    });
    return reply.code(200).send({ ok: true, keys: rows });
  });

  app.delete<{ Params: { id: string } }>(
    "/api/v1/developer/api-keys/:id",
    async (request, reply) => {
      const sessionToken = bearerFrom(request.headers.authorization);
      if (sessionToken === null) {
        return reply.code(401).send({
          ok: false,
          code: "SESSION_INVALID",
          message: "Missing bearer token",
        });
      }
      const session = await authService.validateSession(sessionToken, "share");
      if (!session.valid) {
        return reply.code(401).send({
          ok: false,
          code: session.code,
          message: "API key revoke denied",
        });
      }
      const target = await prisma.apiKey.findUnique({
        where: { key_id: request.params.id },
      });
      if (target === null || target.entity_id !== session.entity_id) {
        return reply.code(404).send({
          ok: false,
          code: "API_KEY_NOT_FOUND",
          message: "API key not found",
        });
      }
      await prisma.apiKey.update({
        where: { key_id: target.key_id },
        data: { is_active: false },
      });
      await writeAuditEvent({
        event_type: "ADMIN_ACTION",
        outcome: "SUCCESS",
        actor_entity_id: session.entity_id,
        session_id: session.session_id,
        details: {
          action: "API_KEY_REVOKED",
          key_id: target.key_id,
        },
      });
      return reply.code(200).send({
        ok: true,
        key_id: target.key_id,
        is_active: false,
      });
    },
  );
}
