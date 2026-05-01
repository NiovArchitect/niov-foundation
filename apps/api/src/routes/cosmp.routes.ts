// FILE: cosmp.routes.ts
// PURPOSE: HTTP surface for the COSMP Protocol operations. Section 3A
//          adds POST /api/v1/cosmp/negotiate. Future sections (READ,
//          WRITE, etc) will register their handlers here too.
// CONNECTS TO: NegotiateService (does the real work).

import type { FastifyInstance } from "fastify";
import type { NegotiateService } from "../services/cosmp/negotiate.service.js";
import type { ReadService } from "../services/cosmp/read.service.js";
import type { AccessScope } from "@niov/database";

// WHAT: Register the COSMP routes on a Fastify instance.
// INPUT: The Fastify instance and the NegotiateService.
// OUTPUT: A promise that resolves once routes are registered.
// WHY: Tests construct a small Fastify app, register only the routes
//      they need, and use inject() to hit them.
export async function registerCosmpRoutes(
  app: FastifyInstance,
  negotiateService: NegotiateService,
  readService: ReadService,
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

  app.get<{ Params: { id: string } }>(
    "/api/v1/cosmp/capsule/:id/metadata",
    async (request, reply) => {
      const sessionToken = bearerFrom(request.headers.authorization);
      const declarationToken = headerString(
        request.headers["x-declaration-token"],
      );
      if (sessionToken === null || declarationToken === null) {
        return reply.code(400).send({
          ok: false,
          code: "BAD_REQUEST",
          message: "Authorization Bearer and X-Declaration-Token are required",
        });
      }

      const result = await readService.readMetadata(
        sessionToken,
        request.params.id,
        declarationToken,
        { ip_address: request.ip ?? null },
      );

      if (!result.ok) {
        return reply.code(statusForCode(result.code)).send(result);
      }

      return reply.code(200).send({
        ok: true,
        metadata: result.metadata,
        metadata_fingerprint: result.metadata_fingerprint,
      });
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/v1/cosmp/capsule/:id/content",
    async (request, reply) => {
      const sessionToken = bearerFrom(request.headers.authorization);
      const declarationToken = headerString(
        request.headers["x-declaration-token"],
      );
      const fingerprint = headerString(
        request.headers["x-metadata-fingerprint"],
      );
      if (
        sessionToken === null ||
        declarationToken === null ||
        fingerprint === null
      ) {
        return reply.code(400).send({
          ok: false,
          code: "BAD_REQUEST",
          message:
            "Authorization Bearer, X-Declaration-Token, and X-Metadata-Fingerprint are required",
        });
      }

      const result = await readService.readContent(
        sessionToken,
        request.params.id,
        declarationToken,
        fingerprint,
        { ip_address: request.ip ?? null },
      );

      if (!result.ok) {
        return reply.code(statusForCode(result.code)).send(result);
      }

      // Schedule the post-response increment AFTER our handler
      // returns. setImmediate runs once the current tick completes,
      // which is after Fastify has begun sending the response body.
      const capsuleId = request.params.id;
      setImmediate(() => {
        void readService.postResponseIncrement(capsuleId, null);
      });

      return reply.code(200).send({
        ok: true,
        capsule_id: result.capsule_id,
        granted_scope: result.granted_scope,
        content: result.content,
        truncated: result.truncated,
      });
    },
  );
}

// WHAT: Pull a string out of a header that Node's typings sometimes
//        return as string | string[] | undefined.
// INPUT: The raw header value.
// OUTPUT: The string when it is one, otherwise null.
// WHY: Centralizes the header-shape guard in one place.
function headerString(value: string | string[] | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

// WHAT: Extract the bearer token from an Authorization header.
// INPUT: The raw header value.
// OUTPUT: The token string when the header is shaped right, null
//         otherwise.
// WHY: Same one-liner three places asked for it; one helper keeps
//      the convention consistent.
function bearerFrom(value: string | string[] | undefined): string | null {
  const s = headerString(value);
  if (s === null || !s.startsWith("Bearer ")) return null;
  const token = s.slice("Bearer ".length).trim();
  return token.length === 0 ? null : token;
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
    case "ACCESS_DECLARATION_INVALID":
    case "ACCESS_DECLARATION_EXPIRED":
    case "ACCESS_DECLARATION_MISMATCH":
      return 401;
    case "OPERATION_NOT_PERMITTED":
    case "ACCESS_DENIED":
    case "NO_PERMISSION":
    case "CLEARANCE_INSUFFICIENT":
    case "SCOPE_INSUFFICIENT_FOR_CONTENT":
      return 403;
    case "CAPSULE_NOT_FOUND":
    case "CONTENT_NOT_FOUND":
      return 404;
    case "METADATA_FINGERPRINT_MISMATCH":
      return 409;
    default:
      return 400;
  }
}
