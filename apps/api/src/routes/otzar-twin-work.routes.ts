// FILE: otzar-twin-work.routes.ts
// PURPOSE: AI Teammate work claim / clarity / complete / collab HTTP surface.
// CONNECTS TO: twin-work-claim.service, AuthService, getOrgEntityId

import type { FastifyInstance } from "fastify";
import type { AuthService } from "../services/auth.service.js";
import { getOrgEntityId } from "../services/governance/org.js";
import {
  claimWorkForTwin,
  twinMarkWorkComplete,
  twinRequestClarity,
  twinRequestCollaboration,
  openTwinWorkFromExtract,
} from "../services/otzar/twin-work-claim.service.js";
import type { StructuredFact } from "../services/otzar/project-document-body.js";

function bearerFrom(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || !value.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token.length === 0 ? null : token;
}

function statusFor(code: string): number {
  switch (code) {
    case "TWIN_REQUIRED":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "FORBIDDEN":
      return 403;
    case "INVALID_INPUT":
    case "INVALID_REQUEST":
      return 422;
    default:
      return 400;
  }
}

export async function registerOtzarTwinWorkRoutes(
  app: FastifyInstance,
  authService: AuthService,
): Promise<void> {
  async function orgOf(entityId: string): Promise<string | null> {
    try {
      return await getOrgEntityId(entityId);
    } catch {
      return null;
    }
  }

  app.post<{ Body: Record<string, unknown> }>(
    "/api/v1/otzar/twin-work/claim",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const session = await authService.validateSession(token, "write");
      if (!session.valid)
        return reply.code(401).send({ ok: false, code: session.code });
      const org = await orgOf(session.entity_id);
      if (org === null)
        return reply.code(404).send({ ok: false, code: "NO_ORG_FOR_CALLER" });
      const body = request.body ?? {};
      const result = await claimWorkForTwin({
        org_entity_id: org,
        human_entity_id: session.entity_id,
        title: typeof body.title === "string" ? body.title : "",
        ...(typeof body.summary === "string" ? { summary: body.summary } : {}),
        ...(typeof body.project_id === "string"
          ? { project_id: body.project_id }
          : {}),
        ...(typeof body.document_id === "string"
          ? { document_id: body.document_id }
          : {}),
        ...(typeof body.web_view_link === "string"
          ? { web_view_link: body.web_view_link }
          : {}),
        work_kind:
          body.work_kind === "DOCUMENT" ||
          body.work_kind === "CONNECTOR_UPDATE" ||
          body.work_kind === "TASK"
            ? body.work_kind
            : "OTHER",
      });
      if (!result.ok)
        return reply.code(statusFor(result.code)).send({ ok: false, code: result.code });
      return reply.code(200).send({
        ok: true,
        ledger_entry_id: result.entry.ledger_entry_id,
        status: result.entry.status,
        twin_entity_id: result.twin_entity_id,
        title: result.entry.title,
        notified: result.notified,
      });
    },
  );

  app.post<{ Params: { ledger_entry_id: string }; Body: Record<string, unknown> }>(
    "/api/v1/otzar/twin-work/:ledger_entry_id/request-clarity",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const session = await authService.validateSession(token, "write");
      if (!session.valid)
        return reply.code(401).send({ ok: false, code: session.code });
      const org = await orgOf(session.entity_id);
      if (org === null)
        return reply.code(404).send({ ok: false, code: "NO_ORG_FOR_CALLER" });
      const result = await twinRequestClarity({
        org_entity_id: org,
        human_entity_id: session.entity_id,
        ledger_entry_id: request.params.ledger_entry_id,
        question:
          typeof request.body?.question === "string"
            ? request.body.question
            : "",
      });
      if (!result.ok)
        return reply.code(statusFor(result.code)).send({ ok: false, code: result.code });
      return reply.code(200).send({
        ok: true,
        ledger_entry_id: result.entry.ledger_entry_id,
        status: result.entry.status,
        notified: true,
      });
    },
  );

  app.post<{ Params: { ledger_entry_id: string }; Body: Record<string, unknown> }>(
    "/api/v1/otzar/twin-work/:ledger_entry_id/complete",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const session = await authService.validateSession(token, "write");
      if (!session.valid)
        return reply.code(401).send({ ok: false, code: session.code });
      const org = await orgOf(session.entity_id);
      if (org === null)
        return reply.code(404).send({ ok: false, code: "NO_ORG_FOR_CALLER" });
      const result = await twinMarkWorkComplete({
        org_entity_id: org,
        human_entity_id: session.entity_id,
        ledger_entry_id: request.params.ledger_entry_id,
        ...(typeof request.body?.completion_note === "string"
          ? { completion_note: request.body.completion_note }
          : {}),
      });
      if (!result.ok)
        return reply.code(statusFor(result.code)).send({ ok: false, code: result.code });
      return reply.code(200).send({
        ok: true,
        ledger_entry_id: result.entry.ledger_entry_id,
        status: result.entry.status,
        notified: true,
      });
    },
  );

  app.post<{ Params: { ledger_entry_id: string }; Body: Record<string, unknown> }>(
    "/api/v1/otzar/twin-work/:ledger_entry_id/request-collaboration",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const session = await authService.validateSession(token, "write");
      if (!session.valid)
        return reply.code(401).send({ ok: false, code: session.code });
      const org = await orgOf(session.entity_id);
      if (org === null)
        return reply.code(404).send({ ok: false, code: "NO_ORG_FOR_CALLER" });
      const result = await twinRequestCollaboration({
        org_entity_id: org,
        human_entity_id: session.entity_id,
        ledger_entry_id: request.params.ledger_entry_id,
        safe_summary:
          typeof request.body?.safe_summary === "string"
            ? request.body.safe_summary
            : "Collaboration needed",
      });
      if (!result.ok)
        return reply.code(statusFor(result.code)).send({ ok: false, code: result.code });
      return reply.code(200).send({
        ok: true,
        ledger_entry_id: result.entry.ledger_entry_id,
        status: result.entry.status,
        notified: true,
      });
    },
  );

  // Open twin-claimed work after extract (document + next actions)
  app.post<{ Body: Record<string, unknown> }>(
    "/api/v1/otzar/twin-work/open-from-extract",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const session = await authService.validateSession(token, "write");
      if (!session.valid)
        return reply.code(401).send({ ok: false, code: session.code });
      const org = await orgOf(session.entity_id);
      if (org === null)
        return reply.code(404).send({ ok: false, code: "NO_ORG_FOR_CALLER" });
      const body = request.body ?? {};
      const actionsRaw = Array.isArray(body.next_actions)
        ? (body.next_actions as unknown[])
        : [];
      const next_actions: StructuredFact[] = actionsRaw.map((a) => {
        const o = (a ?? {}) as Record<string, unknown>;
        return {
          text: typeof o.text === "string" ? o.text : "",
          status:
            o.status === "confirmed" ||
            o.status === "proposed" ||
            o.status === "rejected" ||
            o.status === "unresolved" ||
            o.status === "corrected"
              ? o.status
              : "proposed",
          ...(typeof o.owner_label === "string"
            ? { owner_label: o.owner_label }
            : {}),
        };
      });
      const result = await openTwinWorkFromExtract({
        org_entity_id: org,
        human_entity_id: session.entity_id,
        ...(typeof body.project_id === "string"
          ? { project_id: body.project_id }
          : {}),
        ...(typeof body.document_id === "string"
          ? { document_id: body.document_id }
          : {}),
        ...(typeof body.web_view_link === "string"
          ? { web_view_link: body.web_view_link }
          : {}),
        ...(typeof body.document_title === "string"
          ? { document_title: body.document_title }
          : {}),
        next_actions,
      });
      if (!result.ok)
        return reply.code(statusFor(result.code)).send({ ok: false, code: result.code });
      return reply.code(200).send({
        ok: true,
        claims: result.claims.map((c) =>
          c.ok
            ? {
                ok: true,
                ledger_entry_id: c.entry.ledger_entry_id,
                status: c.entry.status,
                title: c.entry.title,
                twin_entity_id: c.twin_entity_id,
              }
            : { ok: false, code: c.code },
        ),
      });
    },
  );
}
