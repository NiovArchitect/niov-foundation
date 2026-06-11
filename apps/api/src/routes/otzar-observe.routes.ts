// FILE: otzar-observe.routes.ts
// PURPOSE: Phase 1227 — HTTP surface for governed OCR/Observe.
//
//          - GET  /api/v1/otzar/observe/providers
//          - POST /api/v1/otzar/observe/extract
//          - GET  /api/v1/otzar/observe
//          - POST /api/v1/otzar/observe/:observe_capture_id/attach-workspace
//
//          Suggested follow-ups returned by extract are draft
//          proposals only — Action rows land exclusively through the
//          existing Phase 1208 POST /api/v1/actions confirm path.

import type { FastifyInstance } from "fastify";
import type { AuthService } from "../services/auth.service.js";
import type { LLMProvider } from "../services/llm/llm.service.js";
import {
  attachObserveCaptureToWorkspaceForCaller,
  extractObserveCaptureForCaller,
  listObserveCapturesForCaller,
  listObserveProvidersForCaller,
  OBSERVE_PROVIDERS,
  OBSERVE_SOURCE_TYPES,
} from "../services/otzar/observe-intake.service.js";

function bearerFrom(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || !value.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token.length === 0 ? null : token;
}

function isStr(v: unknown): v is string {
  return typeof v === "string";
}

const FAILURE_STATUS: Record<string, number> = {
  NO_ORG_FOR_CALLER: 404,
  PLAIN_TEXT_REQUIRED: 422,
  PROVIDER_BLOCKED_BY_KEY: 409,
  PROVIDER_NEEDS_INSTALL: 409,
  OBSERVE_CAPTURE_NOT_FOUND: 404,
  OBSERVE_CAPTURE_NOT_EXTRACTED: 409,
  WORKSPACE_NOT_FOUND: 404,
};

function failureStatus(code: string): number {
  return FAILURE_STATUS[code] ?? 403;
}

interface ExtractBody {
  provider?: unknown;
  source_type?: unknown;
  title?: unknown;
  plain_text?: unknown;
  force_mode?: unknown;
}

interface AttachBody {
  workspace_id?: unknown;
}

export async function registerOtzarObserveRoutes(
  app: FastifyInstance,
  authService: AuthService,
  llmProvider: LLMProvider | null,
): Promise<void> {
  app.get("/api/v1/otzar/observe/providers", async (request, reply) => {
    const token = bearerFrom(request.headers.authorization);
    if (token === null)
      return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
    const session = await authService.validateSession(token, "read");
    if (!session.valid)
      return reply.code(401).send({ ok: false, code: session.code });
    const result = await listObserveProvidersForCaller(session.entity_id);
    if (result.ok === false)
      return reply
        .code(failureStatus(result.code))
        .send({ ok: false, code: result.code });
    return reply.code(200).send({ ok: true, providers: result.providers });
  });

  app.post<{ Body: ExtractBody }>(
    "/api/v1/otzar/observe/extract",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const session = await authService.validateSession(token, "write");
      if (!session.valid)
        return reply.code(401).send({ ok: false, code: session.code });
      const body = request.body ?? {};
      const provider = OBSERVE_PROVIDERS.find((p) => p === body.provider);
      const sourceType = OBSERVE_SOURCE_TYPES.find(
        (s) => s === body.source_type,
      );
      if (provider === undefined || sourceType === undefined) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: `provider must be one of ${OBSERVE_PROVIDERS.join(", ")}; source_type one of ${OBSERVE_SOURCE_TYPES.join(", ")}`,
        });
      }
      const forceMode =
        body.force_mode === "DEMO_SCRIPTED" ||
        body.force_mode === "LLM" ||
        body.force_mode === "LOCAL_FALLBACK"
          ? body.force_mode
          : undefined;
      const result = await extractObserveCaptureForCaller(
        {
          callerEntityId: session.entity_id,
          provider,
          sourceType,
          ...(isStr(body.title) ? { title: body.title } : {}),
          ...(isStr(body.plain_text) ? { plainText: body.plain_text } : {}),
          ...(forceMode !== undefined ? { forceMode } : {}),
        },
        llmProvider,
      );
      if (result.ok === false) {
        return reply.code(failureStatus(result.code)).send({
          ok: false,
          code: result.code,
          ...(result.message === undefined ? {} : { message: result.message }),
        });
      }
      return reply.code(201).send({ ok: true, capture: result.capture });
    },
  );

  app.get("/api/v1/otzar/observe", async (request, reply) => {
    const token = bearerFrom(request.headers.authorization);
    if (token === null)
      return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
    const session = await authService.validateSession(token, "read");
    if (!session.valid)
      return reply.code(401).send({ ok: false, code: session.code });
    const result = await listObserveCapturesForCaller(session.entity_id);
    if (result.ok === false)
      return reply
        .code(failureStatus(result.code))
        .send({ ok: false, code: result.code });
    return reply.code(200).send({ ok: true, captures: result.captures });
  });

  app.post<{ Params: { observe_capture_id: string }; Body: AttachBody }>(
    "/api/v1/otzar/observe/:observe_capture_id/attach-workspace",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const session = await authService.validateSession(token, "write");
      if (!session.valid)
        return reply.code(401).send({ ok: false, code: session.code });
      const body = request.body ?? {};
      if (!isStr(body.workspace_id)) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: "workspace_id is required",
        });
      }
      const result = await attachObserveCaptureToWorkspaceForCaller({
        callerEntityId: session.entity_id,
        observeCaptureId: request.params.observe_capture_id,
        workspaceId: body.workspace_id,
      });
      if (result.ok === false)
        return reply
          .code(failureStatus(result.code))
          .send({ ok: false, code: result.code });
      return reply.code(200).send({
        ok: true,
        capture: result.capture,
        imported_decisions: result.imported_decisions,
        imported_commitments: result.imported_commitments,
      });
    },
  );
}
