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
  humanVerifyTwinWork,
} from "../services/otzar/twin-work-claim.service.js";
import {
  detectTwinWorkDocumentEdits,
  detectTwinWorkDocumentEditsBatch,
} from "../services/otzar/twin-work-doc-edit.js";
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
    case "NO_DOCUMENT":
    case "NO_TWIN_CLAIM":
    case "VERIFICATION_REQUIRED":
      return 422;
    case "GOOGLE_RECONNECT_REQUIRED":
      return 403;
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
        ...(body.accuracy_class === "REGULATED_HEALTH" ||
        body.accuracy_class === "REGULATED_FINANCE" ||
        body.accuracy_class === "INSURANCE" ||
        body.accuracy_class === "STANDARD"
          ? { accuracy_class: body.accuracy_class }
          : {}),
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
        return reply
          .code(statusFor(result.code))
          .send({
            ok: false,
            code: result.code,
            ...(result.code === "VERIFICATION_REQUIRED"
              ? {
                  message:
                    "Accuracy-critical work needs human verification before complete",
                }
              : {}),
          });
      return reply.code(200).send({
        ok: true,
        ledger_entry_id: result.entry.ledger_entry_id,
        status: result.entry.status,
        notified: true,
      });
    },
  );

  // [C.3c] Human verifies accuracy-critical Twin work (dual-control).
  app.post<{ Params: { ledger_entry_id: string }; Body: Record<string, unknown> }>(
    "/api/v1/otzar/twin-work/:ledger_entry_id/verify",
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
      const result = await humanVerifyTwinWork({
        org_entity_id: org,
        human_entity_id: session.entity_id,
        ledger_entry_id: request.params.ledger_entry_id,
        ...(typeof body.note === "string" ? { note: body.note } : {}),
        complete_after: body.complete_after === true,
      });
      if (!result.ok)
        return reply.code(statusFor(result.code)).send({ ok: false, code: result.code });
      return reply.code(200).send({
        ok: true,
        ledger_entry_id: result.entry.ledger_entry_id,
        status: result.entry.status,
        twin_work: result.entry.twin_work ?? null,
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

  // [C.3b] Detect Drive edits on a Twin-claimed document.
  app.post<{ Params: { ledger_entry_id: string } }>(
    "/api/v1/otzar/twin-work/:ledger_entry_id/detect-edits",
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
      const result = await detectTwinWorkDocumentEdits({
        org_entity_id: org,
        human_entity_id: session.entity_id,
        ledger_entry_id: request.params.ledger_entry_id,
      });
      if (!result.ok)
        return reply.code(statusFor(result.code)).send({ ok: false, code: result.code });
      return reply.code(200).send({
        ok: true,
        ledger_entry_id: result.entry.ledger_entry_id,
        edit_detected: result.edit_detected,
        edit_signal: result.edit_signal,
        drive_modified_at: result.drive_modified_at,
        twin_work: result.entry.twin_work ?? null,
        notified: result.notified,
      });
    },
  );

  // [C.3b] Batch edit detection for Today refresh (max 10).
  app.post<{ Body: Record<string, unknown> }>(
    "/api/v1/otzar/twin-work/detect-edits-batch",
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
      const raw = request.body?.ledger_entry_ids;
      const ids = Array.isArray(raw)
        ? raw.filter((x): x is string => typeof x === "string" && x.length > 0)
        : [];
      if (ids.length === 0)
        return reply.code(422).send({ ok: false, code: "INVALID_INPUT" });
      const result = await detectTwinWorkDocumentEditsBatch({
        org_entity_id: org,
        human_entity_id: session.entity_id,
        ledger_entry_ids: ids,
      });
      return reply.code(200).send(result);
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
