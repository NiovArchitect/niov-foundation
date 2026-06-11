// FILE: otzar-voice-capture.routes.ts
// PURPOSE: Phase 1223 — HTTP surface for the voice/STT pipeline.
//
//          - GET   /api/v1/otzar/voice-captures/providers     (status)
//          - POST  /api/v1/otzar/voice-captures               (receive)
//          - GET   /api/v1/otzar/voice-captures               (list)
//          - GET   /api/v1/otzar/voice-captures/:id           (detail)

import type { FastifyInstance } from "fastify";
import type { AuthService } from "../services/auth.service.js";
import {
  getAudioCaptureDetailForCaller,
  listAudioCapturesForCaller,
  listSTTProvidersForCaller,
  receiveAudioCaptureForCaller,
} from "../services/voice/voice-capture.service.js";
import type { STTProviderType } from "../services/voice/stt-provider.js";

function bearerFrom(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || !value.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token.length === 0 ? null : token;
}

function isStr(v: unknown): v is string {
  return typeof v === "string";
}

const PROVIDERS: STTProviderType[] = [
  "DEMO_FIXTURE",
  "LOCAL_BROWSER",
  "WHISPER_API",
  "DEEPGRAM",
  "GOOGLE_SPEECH",
  "AZURE_SPEECH",
];
const MODES = [
  "LIVE_MIC",
  "AUDIO_FILE_UPLOAD",
  "DEMO_AUDIO_SAMPLE",
  "LOCAL_FALLBACK",
] as const;
const CONSENT_STATES = [
  "CONSENTED",
  "NOT_CONSENTED",
  "PENDING",
  "EXTERNAL_TRACKED",
] as const;

interface ReceiveBody {
  provider?: unknown;
  mode?: unknown;
  storage_ref?: unknown;
  title?: unknown;
  pre_transcribed_segments?: unknown;
  meeting_capture_id?: unknown;
  workspace_id?: unknown;
  handoff_to_meeting_capture?: unknown;
  participants?: unknown;
}

export async function registerOtzarVoiceCaptureRoutes(
  app: FastifyInstance,
  authService: AuthService,
): Promise<void> {
  // GET providers
  app.get(
    "/api/v1/otzar/voice-captures/providers",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const session = await authService.validateSession(token, "read");
      if (!session.valid)
        return reply.code(401).send({ ok: false, code: session.code });
      const rows = listSTTProvidersForCaller();
      return reply.code(200).send({ ok: true, providers: rows });
    },
  );

  // POST receive
  app.post<{ Body: ReceiveBody }>(
    "/api/v1/otzar/voice-captures",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const session = await authService.validateSession(token, "write");
      if (!session.valid)
        return reply.code(401).send({ ok: false, code: session.code });
      const body = request.body ?? {};
      const provider = PROVIDERS.find((p) => p === body.provider) ?? "DEMO_FIXTURE";
      const mode = MODES.find((m) => m === body.mode) ?? "DEMO_AUDIO_SAMPLE";
      const segmentsRaw = Array.isArray(body.pre_transcribed_segments)
        ? body.pre_transcribed_segments
        : [];
      const segments: Array<{
        speaker_label: string | null;
        start_ms: number;
        end_ms: number;
        text: string;
        confidence: number | null;
        is_final: boolean;
      }> = [];
      for (const s of segmentsRaw) {
        if (typeof s !== "object" || s === null) continue;
        const r = s as Record<string, unknown>;
        if (!isStr(r.text)) continue;
        const startMs = typeof r.start_ms === "number" ? r.start_ms : 0;
        const endMs = typeof r.end_ms === "number" ? r.end_ms : startMs;
        const confidence = typeof r.confidence === "number" ? r.confidence : null;
        const isFinal = typeof r.is_final === "boolean" ? r.is_final : true;
        const speaker = isStr(r.speaker_label) ? r.speaker_label : null;
        segments.push({
          speaker_label: speaker,
          start_ms: startMs,
          end_ms: endMs,
          text: r.text,
          confidence,
          is_final: isFinal,
        });
      }
      const participantsRaw = Array.isArray(body.participants)
        ? body.participants
        : [];
      const participants: Array<{
        display_name: string;
        email?: string;
        participant_entity_id?: string;
        consent_state?: (typeof CONSENT_STATES)[number];
        consent_source?: string;
      }> = [];
      for (const p of participantsRaw) {
        if (typeof p !== "object" || p === null) continue;
        const r = p as Record<string, unknown>;
        if (!isStr(r.display_name)) continue;
        const entry: {
          display_name: string;
          email?: string;
          participant_entity_id?: string;
          consent_state?: (typeof CONSENT_STATES)[number];
          consent_source?: string;
        } = { display_name: r.display_name };
        if (isStr(r.email)) entry.email = r.email;
        if (isStr(r.participant_entity_id))
          entry.participant_entity_id = r.participant_entity_id;
        const c = CONSENT_STATES.find((s) => s === r.consent_state);
        if (c !== undefined) entry.consent_state = c;
        if (isStr(r.consent_source)) entry.consent_source = r.consent_source;
        participants.push(entry);
      }
      const result = await receiveAudioCaptureForCaller({
        callerEntityId: session.entity_id,
        provider,
        mode,
        ...(isStr(body.storage_ref) ? { storageRef: body.storage_ref } : {}),
        ...(isStr(body.title) ? { title: body.title } : {}),
        ...(segments.length > 0 ? { preTranscribedSegments: segments } : {}),
        ...(isStr(body.meeting_capture_id)
          ? { meetingCaptureId: body.meeting_capture_id }
          : {}),
        ...(isStr(body.workspace_id) ? { workspaceId: body.workspace_id } : {}),
        ...(body.handoff_to_meeting_capture === true
          ? { handoff_to_meeting_capture: true }
          : {}),
        ...(participants.length > 0 ? { participants } : {}),
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
        audio_capture: result.audio_capture,
        segments: result.segments,
        ...(result.handoff_meeting_capture_id === undefined
          ? {}
          : { handoff_meeting_capture_id: result.handoff_meeting_capture_id }),
      });
    },
  );

  // GET list
  app.get("/api/v1/otzar/voice-captures", async (request, reply) => {
    const token = bearerFrom(request.headers.authorization);
    if (token === null)
      return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
    const session = await authService.validateSession(token, "read");
    if (!session.valid)
      return reply.code(401).send({ ok: false, code: session.code });
    const rows = await listAudioCapturesForCaller(session.entity_id);
    return reply.code(200).send({ ok: true, audio_captures: rows });
  });

  // GET detail
  app.get<{ Params: { audio_capture_id: string } }>(
    "/api/v1/otzar/voice-captures/:audio_capture_id",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const session = await authService.validateSession(token, "read");
      if (!session.valid)
        return reply.code(401).send({ ok: false, code: session.code });
      const result = await getAudioCaptureDetailForCaller(
        request.params.audio_capture_id,
        session.entity_id,
      );
      if (result.ok === false)
        return reply.code(result.httpStatus).send({ ok: false, code: result.code });
      return reply.code(200).send({
        ok: true,
        audio_capture: result.audio_capture,
        segments: result.segments,
      });
    },
  );
}
