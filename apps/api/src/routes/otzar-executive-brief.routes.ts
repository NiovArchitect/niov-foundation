// FILE: otzar-executive-brief.routes.ts
// PURPOSE: HTTP surface for Daily executive brief schedule + run-now
//          + list deliveries (inside Otzar only; no email/Slack).
// CONNECTS TO: ExecutiveBriefService, AuthService, server.ts.

import type { FastifyInstance } from "fastify";
import type { AuthService } from "../services/auth.service.js";
import { ExecutiveBriefService } from "../services/otzar/executive-brief.service.js";

function bearerFrom(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || !value.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token.length === 0 ? null : token;
}

function statusFor(code: string): number {
  switch (code) {
    case "SESSION_INVALID":
      return 401;
    case "ORG_REQUIRED":
    case "NOT_SCHEDULE_OWNER":
      return 403;
    case "SCHEDULE_NOT_FOUND":
      return 404;
    case "DUPLICATE_DELIVERY":
      return 409;
    case "DELIVERY_FAILED":
    case "GENERATION_FAILED":
      return 500;
    default:
      return 400;
  }
}

/**
 * WHAT: Register executive brief routes.
 * INPUT: Fastify app + AuthService.
 * OUTPUT: void.
 * WHY: Founder acceptance — internal scheduled report path.
 */
export async function registerOtzarExecutiveBriefRoutes(
  app: FastifyInstance,
  authService: AuthService,
): Promise<void> {
  const service = new ExecutiveBriefService(authService);

  app.post("/api/v1/otzar/reports/executive-brief/schedule", async (request, reply) => {
    const token = bearerFrom(request.headers.authorization);
    if (token === null) {
      return reply.code(401).send({
        ok: false,
        code: "SESSION_INVALID",
        message: "Missing bearer token",
      });
    }
    const result = await service.createScheduleForCaller(token);
    if (!result.ok) {
      return reply.code(statusFor(result.code)).send(result);
    }
    return reply.code(200).send({ ok: true, schedule: result.data });
  });

  app.get("/api/v1/otzar/reports/executive-brief/schedules", async (request, reply) => {
    const token = bearerFrom(request.headers.authorization);
    if (token === null) {
      return reply.code(401).send({
        ok: false,
        code: "SESSION_INVALID",
        message: "Missing bearer token",
      });
    }
    const result = await service.listSchedulesForCaller(token);
    if (!result.ok) {
      return reply.code(statusFor(result.code)).send(result);
    }
    return reply.code(200).send({ ok: true, ...result.data });
  });

  app.post<{
    Body: { schedule_id?: string; force_retry?: boolean };
  }>("/api/v1/otzar/reports/executive-brief/run-now", async (request, reply) => {
    const token = bearerFrom(request.headers.authorization);
    if (token === null) {
      return reply.code(401).send({
        ok: false,
        code: "SESSION_INVALID",
        message: "Missing bearer token",
      });
    }
    const schedule_id =
      typeof request.body?.schedule_id === "string"
        ? request.body.schedule_id.trim()
        : "";
    if (schedule_id.length === 0) {
      return reply.code(400).send({
        ok: false,
        code: "BAD_REQUEST",
        message: "schedule_id is required",
      });
    }
    const result = await service.runNowForCaller({
      token,
      schedule_id,
      force_retry: request.body?.force_retry === true,
    });
    if (!result.ok) {
      return reply.code(statusFor(result.code)).send(result);
    }
    return reply.code(200).send({ ok: true, ...result.data });
  });

  app.get("/api/v1/otzar/reports/executive-brief/deliveries", async (request, reply) => {
    const token = bearerFrom(request.headers.authorization);
    if (token === null) {
      return reply.code(401).send({
        ok: false,
        code: "SESSION_INVALID",
        message: "Missing bearer token",
      });
    }
    const result = await service.listDeliveriesForCaller(token);
    if (!result.ok) {
      return reply.code(statusFor(result.code)).send(result);
    }
    return reply.code(200).send({ ok: true, ...result.data });
  });
}
