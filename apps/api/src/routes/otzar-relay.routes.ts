// FILE: otzar-relay.routes.ts
// PURPOSE: Otzar Relay first messaging HTTP surface — simple, human
//          vocabulary responses. Foundation is authority; Relay is the
//          channel. No MCP/ledger jargon in payloads.
// CONNECTS TO: relay-messaging.service, AuthService.

import type { FastifyInstance } from "fastify";
import type { AuthService } from "../services/auth.service.js";
import {
  draftTwinInThread,
  extractWorkFromThread,
  listRelayMessages,
  listRelayThreads,
  sendRelayMessage,
} from "../services/otzar/relay-messaging.service.js";

function bearerFrom(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || !value.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token.length === 0 ? null : token;
}

function statusFor(code: string): number {
  switch (code) {
    case "SESSION_INVALID":
      return 401;
    case "FORBIDDEN":
    case "TWIN_REQUIRED":
      return 403;
    case "NOT_FOUND":
    case "NO_ORG":
      return 404;
    case "INVALID_INPUT":
      return 422;
    default:
      return 400;
  }
}

export async function registerOtzarRelayRoutes(
  app: FastifyInstance,
  authService: AuthService,
): Promise<void> {
  app.post<{ Body: Record<string, unknown> }>(
    "/api/v1/relay/messages",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) {
        return reply.code(401).send({
          ok: false,
          code: "SESSION_INVALID",
          message: "Missing bearer token",
        });
      }
      const session = await authService.validateSession(token, "write");
      if (!session.valid) {
        return reply
          .code(401)
          .send({ ok: false, code: session.code, message: "Relay send denied" });
      }
      const body = request.body ?? {};
      if (typeof body.body !== "string") {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_INPUT",
          message: "body is required",
        });
      }
      const result = await sendRelayMessage({
        actor_entity_id: session.entity_id,
        body: body.body,
        ...(typeof body.thread_id === "string" ? { thread_id: body.thread_id } : {}),
        ...(typeof body.recipient_entity_id === "string"
          ? { recipient_entity_id: body.recipient_entity_id }
          : {}),
      });
      if (!result.ok) return reply.code(statusFor(result.code)).send(result);
      return reply.code(200).send(result);
    },
  );

  app.get("/api/v1/relay/threads", async (request, reply) => {
    const token = bearerFrom(request.headers.authorization);
    if (token === null) {
      return reply.code(401).send({
        ok: false,
        code: "SESSION_INVALID",
        message: "Missing bearer token",
      });
    }
    const session = await authService.validateSession(token, "read");
    if (!session.valid) {
      return reply
        .code(401)
        .send({ ok: false, code: session.code, message: "Relay list denied" });
    }
    const result = await listRelayThreads({ actor_entity_id: session.entity_id });
    if (!result.ok) return reply.code(statusFor(result.code)).send(result);
    return reply.code(200).send(result);
  });

  app.get<{ Params: { thread_id: string } }>(
    "/api/v1/relay/threads/:thread_id/messages",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) {
        return reply.code(401).send({
          ok: false,
          code: "SESSION_INVALID",
          message: "Missing bearer token",
        });
      }
      const session = await authService.validateSession(token, "read");
      if (!session.valid) {
        return reply
          .code(401)
          .send({ ok: false, code: session.code, message: "Relay read denied" });
      }
      const result = await listRelayMessages({
        actor_entity_id: session.entity_id,
        thread_id: request.params.thread_id,
      });
      if (!result.ok) return reply.code(statusFor(result.code)).send(result);
      return reply.code(200).send(result);
    },
  );

  /** AI Teammate draft in-thread — always labeled, never auto-sent as human. */
  app.post<{ Params: { thread_id: string }; Body: Record<string, unknown> }>(
    "/api/v1/relay/threads/:thread_id/twin-draft",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) {
        return reply.code(401).send({
          ok: false,
          code: "SESSION_INVALID",
          message: "Missing bearer token",
        });
      }
      const session = await authService.validateSession(token, "write");
      if (!session.valid) {
        return reply
          .code(401)
          .send({ ok: false, code: session.code, message: "Relay draft denied" });
      }
      const body = request.body ?? {};
      const result = await draftTwinInThread({
        actor_entity_id: session.entity_id,
        thread_id: request.params.thread_id,
        ...(typeof body.prompt === "string" ? { prompt: body.prompt } : {}),
      });
      if (!result.ok) return reply.code(statusFor(result.code)).send(result);
      return reply.code(200).send(result);
    },
  );

  /** Extract work signals from a thread (preview only — no silent actions). */
  app.post<{ Params: { thread_id: string } }>(
    "/api/v1/relay/threads/:thread_id/extract-work",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) {
        return reply.code(401).send({
          ok: false,
          code: "SESSION_INVALID",
          message: "Missing bearer token",
        });
      }
      const session = await authService.validateSession(token, "read");
      if (!session.valid) {
        return reply
          .code(401)
          .send({ ok: false, code: session.code, message: "Relay extract denied" });
      }
      const result = await extractWorkFromThread({
        actor_entity_id: session.entity_id,
        thread_id: request.params.thread_id,
      });
      if (!result.ok) return reply.code(statusFor(result.code)).send(result);
      return reply.code(200).send(result);
    },
  );
}
