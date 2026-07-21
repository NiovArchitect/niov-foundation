// FILE: google-doc.routes.ts
// PURPOSE: [GOOGLE-DOCS-WRITE] HTTP surface for gated Google Doc create:
//            - POST /api/v1/google/docs/create  (HARD gate; never auto-creates)
//          Bearer-gated; org resolved from the caller.
// CONNECTS TO: google-doc.service.ts, getOrgEntityId, AuthService.

import type { FastifyInstance, FastifyReply } from "fastify";
import type { AuthService } from "../services/auth.service.js";
import { getOrgEntityId } from "../services/governance/org.js";
import {
  appendGoogleDocBody,
  createGoogleDoc,
  type GoogleDocCreateInput,
} from "../services/connector/google-doc.service.js";
import { shareGoogleDoc } from "../services/connector/google-doc-share.service.js";

function bearerFrom(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || !value.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token.length === 0 ? null : token;
}

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

function statusForGate(code: string): number {
  switch (code) {
    case "POLICY_BLOCKED":
      return 403;
    default:
      return 409;
  }
}

function parseCreateInput(body: Record<string, unknown>): GoogleDocCreateInput {
  return {
    title: typeof body.title === "string" ? body.title : "",
    ...(typeof body.body_text === "string" ? { body_text: body.body_text } : {}),
    ...(typeof body.require_body === "boolean"
      ? { require_body: body.require_body }
      : {}),
    requires_approval: body.requires_approval === true,
    approved: body.approved === true,
    caller_confirmed: body.caller_confirmed === true,
    policy_blocked: body.policy_blocked === true,
    ...(typeof body.source_command === "string"
      ? { source_command: body.source_command }
      : {}),
    ...(typeof body.owner_entity_id === "string" &&
    body.owner_entity_id.length > 0
      ? { owner_entity_id: body.owner_entity_id }
      : {}),
    ...(typeof body.project_id === "string" && body.project_id.length > 0
      ? { project_id: body.project_id }
      : {}),
    ...(typeof body.conversation_id === "string" &&
    body.conversation_id.length > 0
      ? { conversation_id: body.conversation_id }
      : {}),
    ...(typeof body.artifact_type === "string"
      ? { artifact_type: body.artifact_type }
      : {}),
    ...(typeof body.idempotency_key === "string" &&
    body.idempotency_key.length > 0
      ? { idempotency_key: body.idempotency_key }
      : {}),
  };
}

export async function registerGoogleDocRoutes(
  app: FastifyInstance,
  authService: AuthService,
): Promise<void> {
  app.post<{ Body: Record<string, unknown> }>(
    "/api/v1/google/docs/create",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const session = await authService.validateSession(token, "write");
      if (!session.valid)
        return reply.code(401).send({ ok: false, code: session.code });

      const orgEntityId = await resolveOrgOrFail(session.entity_id, reply);
      if (orgEntityId === null) return;

      const result = await createGoogleDoc({
        actor_entity_id: session.entity_id,
        org_entity_id: orgEntityId,
        input: parseCreateInput(request.body ?? {}),
      });
      if (result.ok === false) {
        return reply
          .code(
            result.code === "PROVIDER_ERROR"
              ? 502
              : statusForGate(result.code),
          )
          .send({ ok: false, code: result.code });
      }
      return reply.code(200).send({
        ok: true,
        status: result.status,
        source_kind: "google_docs",
        document_id: result.document_id,
        title: result.title,
        web_view_link: result.web_view_link,
        body_inserted: result.body_inserted,
        body_char_count: result.body_char_count,
        project_id: result.project_id,
        already_applied: result.already_applied,
      });
    },
  );

  // POST share — gated permissions.create (email never audited)
  app.post<{ Body: Record<string, unknown> }>(
    "/api/v1/google/docs/share",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const session = await authService.validateSession(token, "write");
      if (!session.valid)
        return reply.code(401).send({ ok: false, code: session.code });
      const orgEntityId = await resolveOrgOrFail(session.entity_id, reply);
      if (orgEntityId === null) return;
      const body = request.body ?? {};
      const roleRaw = body.role;
      const role =
        roleRaw === "reader" || roleRaw === "commenter" || roleRaw === "writer"
          ? roleRaw
          : undefined;
      const result = await shareGoogleDoc({
        actor_entity_id: session.entity_id,
        org_entity_id: orgEntityId,
        document_id: typeof body.document_id === "string" ? body.document_id : "",
        email: typeof body.email === "string" ? body.email : "",
        ...(role ? { role } : {}),
        caller_confirmed: body.caller_confirmed === true,
      });
      if (result.ok === false) {
        return reply
          .code(result.code === "PROVIDER_ERROR" ? 502 : statusForGate(result.code))
          .send({ ok: false, code: result.code });
      }
      return reply.code(200).send({
        ok: true,
        permission_id: result.permission_id,
        role: result.role,
      });
    },
  );

  // POST append — material / formatting mutation for edit-propagation.
  app.post<{ Body: Record<string, unknown> }>(
    "/api/v1/google/docs/append",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const session = await authService.validateSession(token, "write");
      if (!session.valid)
        return reply.code(401).send({ ok: false, code: session.code });
      const orgEntityId = await resolveOrgOrFail(session.entity_id, reply);
      if (orgEntityId === null) return;
      const body = request.body ?? {};
      const changeKind =
        body.change_kind === "FORMATTING_ONLY" ? "FORMATTING_ONLY" : "MATERIAL";
      const result = await appendGoogleDocBody({
        actor_entity_id: session.entity_id,
        org_entity_id: orgEntityId,
        input: {
          document_id:
            typeof body.document_id === "string" ? body.document_id : "",
          body_text: typeof body.body_text === "string" ? body.body_text : "",
          caller_confirmed: body.caller_confirmed === true,
          policy_blocked: body.policy_blocked === true,
          change_kind: changeKind,
          ...(typeof body.idempotency_key === "string" &&
          body.idempotency_key.length > 0
            ? { idempotency_key: body.idempotency_key }
            : {}),
        },
      });
      if (result.ok === false) {
        const providerish =
          result.code === "PROVIDER_ERROR" ||
          result.code === "APPEND_FAILED" ||
          result.code === "DOC_PROVIDER_WRITE_FAILED" ||
          result.code === "DOC_PROVIDER_REQUEST_INVALID" ||
          result.code === "DOC_WRITE_PERMISSION_DENIED" ||
          result.code === "DOC_ARTIFACT_NOT_FOUND" ||
          result.code === "DOC_INVALID_INSERT_INDEX" ||
          result.code === "DOC_REVISION_CONFLICT";
        return reply
          .code(providerish ? 502 : statusForGate(result.code))
          .send({
            ok: false,
            code: result.code,
            ...(result.provider_http_status !== undefined
              ? { provider_http_status: result.provider_http_status }
              : {}),
          });
      }
      return reply.code(200).send({
        ok: true,
        document_id: result.document_id,
        appended: true,
        body_char_count: result.body_char_count,
        web_view_link: result.web_view_link,
        change_kind: result.change_kind,
        materiality: result.materiality,
        already_applied: result.already_applied,
      });
    },
  );
}
