// FILE: otzar-meeting-capture.routes.ts
// PURPOSE: Phase 1222 — HTTP surface for the MeetingCapture
//          substrate.
//
//          - POST  /api/v1/otzar/meeting-captures        (receive)
//          - GET   /api/v1/otzar/meeting-captures        (list; optional ?workspace_id=)
//          - GET   /api/v1/otzar/meeting-captures/:id    (detail)
//          - POST  /api/v1/otzar/meeting-captures/:id/attach
//          - PUT   /api/v1/otzar/meeting-captures/participants/:participant_id/consent
//
// PRIVACY: bearer + capability check on every route; service-tier
//          gate enforces same-org + workspace membership.

import type { FastifyInstance } from "fastify";
import type { AuthService } from "../services/auth.service.js";
import {
  attachCaptureToWorkspaceForCaller,
  getMeetingCaptureDetailForCaller,
  listMeetingCapturesForCaller,
  receiveMeetingCaptureForCaller,
  updateParticipantConsentForCaller,
} from "../services/otzar/meeting-capture.service.js";

function bearerFrom(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || !value.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token.length === 0 ? null : token;
}

function isStr(v: unknown): v is string {
  return typeof v === "string";
}

const PROVIDERS = [
  "GOOGLE_MEET",
  "ZOOM",
  "MICROSOFT_TEAMS",
  "MANUAL_UPLOAD",
  "API_INGEST",
] as const;

const CONSENT_STATES = [
  "CONSENTED",
  "NOT_CONSENTED",
  "PENDING",
  "EXTERNAL_TRACKED",
] as const;

interface ReceiveBody {
  provider?: unknown;
  provider_meeting_id?: unknown;
  title?: unknown;
  scheduled_start?: unknown;
  scheduled_end?: unknown;
  recorded_start?: unknown;
  recorded_end?: unknown;
  summary?: unknown;
  transcript?: unknown;
  participants?: unknown;
  workspace_id?: unknown;
}

interface AttachBody {
  decisions?: unknown;
  commitments?: unknown;
}

interface ConsentBody {
  consent_state?: unknown;
  consent_source?: unknown;
}

export async function registerOtzarMeetingCaptureRoutes(
  app: FastifyInstance,
  authService: AuthService,
): Promise<void> {
  // POST receive
  app.post<{ Body: ReceiveBody }>(
    "/api/v1/otzar/meeting-captures",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const session = await authService.validateSession(token, "write");
      if (!session.valid)
        return reply.code(401).send({ ok: false, code: session.code });
      const body = request.body ?? {};
      if (!isStr(body.title) || body.title.trim().length === 0) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: "title is required",
        });
      }
      const provider = PROVIDERS.find((p) => p === body.provider) ?? "MANUAL_UPLOAD";
      const participantsRaw = Array.isArray(body.participants)
        ? body.participants
        : [];
      const participants: Array<{
        display_name: string;
        email?: string;
        participant_entity_id?: string;
        external_collaborator_id?: string;
        consent_state?: (typeof CONSENT_STATES)[number];
        consent_source?: string;
      }> = [];
      for (const p of participantsRaw) {
        if (typeof p !== "object" || p === null) continue;
        const display_name = (p as Record<string, unknown>).display_name;
        if (!isStr(display_name)) continue;
        const email = (p as Record<string, unknown>).email;
        const participant_entity_id = (p as Record<string, unknown>).participant_entity_id;
        const external_collaborator_id = (p as Record<string, unknown>).external_collaborator_id;
        const consent_state = CONSENT_STATES.find(
          (s) => s === (p as Record<string, unknown>).consent_state,
        );
        const consent_source = (p as Record<string, unknown>).consent_source;
        const entry: {
          display_name: string;
          email?: string;
          participant_entity_id?: string;
          external_collaborator_id?: string;
          consent_state?: (typeof CONSENT_STATES)[number];
          consent_source?: string;
        } = { display_name };
        if (isStr(email)) entry.email = email;
        if (isStr(participant_entity_id))
          entry.participant_entity_id = participant_entity_id;
        if (isStr(external_collaborator_id))
          entry.external_collaborator_id = external_collaborator_id;
        if (consent_state !== undefined) entry.consent_state = consent_state;
        if (isStr(consent_source)) entry.consent_source = consent_source;
        participants.push(entry);
      }
      const result = await receiveMeetingCaptureForCaller({
        callerEntityId: session.entity_id,
        provider,
        ...(isStr(body.provider_meeting_id)
          ? { providerMeetingId: body.provider_meeting_id }
          : {}),
        title: body.title,
        ...(isStr(body.scheduled_start)
          ? { scheduledStart: body.scheduled_start }
          : {}),
        ...(isStr(body.scheduled_end) ? { scheduledEnd: body.scheduled_end } : {}),
        ...(isStr(body.recorded_start) ? { recordedStart: body.recorded_start } : {}),
        ...(isStr(body.recorded_end) ? { recordedEnd: body.recorded_end } : {}),
        ...(isStr(body.summary) ? { summary: body.summary } : {}),
        ...(isStr(body.transcript) ? { transcript: body.transcript } : {}),
        participants,
        ...(isStr(body.workspace_id) ? { workspaceId: body.workspace_id } : {}),
      });
      if (result.ok === false) {
        return reply.code(result.httpStatus).send({
          ok: false,
          code: result.code,
          ...(result.message === undefined ? {} : { message: result.message }),
        });
      }
      return reply.code(result.httpStatus).send({
        ok: true,
        meeting_capture: result.meeting_capture,
        participants: result.participants,
      });
    },
  );

  // GET list
  app.get<{ Querystring: { workspace_id?: string } }>(
    "/api/v1/otzar/meeting-captures",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const session = await authService.validateSession(token, "read");
      if (!session.valid)
        return reply.code(401).send({ ok: false, code: session.code });
      const items = await listMeetingCapturesForCaller(
        session.entity_id,
        request.query.workspace_id,
      );
      return reply.code(200).send({ ok: true, meeting_captures: items });
    },
  );

  // GET detail
  app.get<{ Params: { meeting_capture_id: string } }>(
    "/api/v1/otzar/meeting-captures/:meeting_capture_id",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const session = await authService.validateSession(token, "read");
      if (!session.valid)
        return reply.code(401).send({ ok: false, code: session.code });
      const result = await getMeetingCaptureDetailForCaller(
        request.params.meeting_capture_id,
        session.entity_id,
      );
      if (result.ok === false)
        return reply.code(result.httpStatus).send({ ok: false, code: result.code });
      return reply.code(200).send({
        ok: true,
        meeting_capture: result.meeting_capture,
        participants: result.participants,
      });
    },
  );

  // POST attach to workspace
  app.post<{
    Params: { meeting_capture_id: string };
    Body: AttachBody & { workspace_id?: unknown };
  }>(
    "/api/v1/otzar/meeting-captures/:meeting_capture_id/attach",
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
      const decisions = Array.isArray(body.decisions)
        ? body.decisions.filter(isStr)
        : [];
      const commitmentsRaw = Array.isArray(body.commitments)
        ? body.commitments
        : [];
      const commitments: Array<{ text: string; source_excerpt: string }> = [];
      for (const c of commitmentsRaw) {
        if (typeof c !== "object" || c === null) continue;
        const text = (c as Record<string, unknown>).text;
        const source_excerpt = (c as Record<string, unknown>).source_excerpt;
        if (isStr(text) && isStr(source_excerpt)) {
          commitments.push({ text, source_excerpt });
        }
      }
      const result = await attachCaptureToWorkspaceForCaller({
        meetingCaptureId: request.params.meeting_capture_id,
        workspaceId: body.workspace_id,
        callerEntityId: session.entity_id,
        decisions,
        commitments,
      });
      if (result.ok === false) {
        return reply.code(result.httpStatus).send({
          ok: false,
          code: result.code,
          ...(result.message === undefined ? {} : { message: result.message }),
        });
      }
      return reply
        .code(200)
        .send({ ok: true, meeting_capture: result.meeting_capture });
    },
  );

  // PUT participant consent
  app.put<{
    Params: { participant_id: string };
    Body: ConsentBody;
  }>(
    "/api/v1/otzar/meeting-captures/participants/:participant_id/consent",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const session = await authService.validateSession(token, "write");
      if (!session.valid)
        return reply.code(401).send({ ok: false, code: session.code });
      const body = request.body ?? {};
      const consent_state = CONSENT_STATES.find((s) => s === body.consent_state);
      if (consent_state === undefined) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: "consent_state must be one of CONSENTED/NOT_CONSENTED/PENDING/EXTERNAL_TRACKED",
        });
      }
      const result = await updateParticipantConsentForCaller({
        meetingParticipantConsentId: request.params.participant_id,
        callerEntityId: session.entity_id,
        consentState: consent_state,
        ...(isStr(body.consent_source) ? { consentSource: body.consent_source } : {}),
      });
      if (result.ok === false)
        return reply.code(result.httpStatus).send({ ok: false, code: result.code });
      return reply.code(200).send({ ok: true, participant: result.participant });
    },
  );
}
