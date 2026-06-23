// FILE: otzar-voice-transcribe.routes.ts
// PURPOSE: [OTZAR-V1-LIVE-4A-FOUNDATION] HTTP surface for inline speech-to-text.
//   POST /api/v1/otzar/voice/transcribe — the route the Otzar client already
//   calls (api.otzar.voice.transcribe) for the live-mic / desktop / Web-Speech-
//   fallback path. Bearer-validated. Accepts { audio_base64, mime_type }, returns
//   { ok, transcript, provider }. Transcribes only — it persists no raw audio,
//   creates no MemoryCapsule, and executes no work; the transcript re-enters the
//   governed Twin/work loop through the existing client surfaces.
// CONNECTS TO: voice-transcribe.service.ts, AuthService.

import type { FastifyInstance } from "fastify";
import type { AuthService } from "../services/auth.service.js";
import {
  transcribeInlineAudio,
  VOICE_STT_PROVIDER_NOT_CONFIGURED,
} from "../services/voice/voice-transcribe.service.js";

function bearerFrom(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || !value.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token.length === 0 ? null : token;
}

export function registerOtzarVoiceTranscribeRoutes(
  app: FastifyInstance,
  authService: AuthService,
): void {
  app.post<{
    Body: { audio_base64?: unknown; mime_type?: unknown };
  }>("/api/v1/otzar/voice/transcribe", async (request, reply) => {
    const token = bearerFrom(request.headers.authorization);
    if (token === null) {
      return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
    }
    // "read": transcription produces text only — it writes nothing to the
    // caller's memory/wallet, so it does not require the "write" scope.
    const session = await authService.validateSession(token, "read");
    if (!session.valid) {
      return reply.code(401).send({ ok: false, code: session.code });
    }
    const body = request.body ?? {};
    if (
      typeof body.audio_base64 !== "string" ||
      body.audio_base64.length === 0 ||
      typeof body.mime_type !== "string" ||
      body.mime_type.length === 0
    ) {
      return reply.code(422).send({
        ok: false,
        code: "INVALID_REQUEST",
        message: "audio_base64 and mime_type are required",
      });
    }

    const result = await transcribeInlineAudio({
      audioBase64: body.audio_base64,
      mimeType: body.mime_type,
    });

    if (!result.ok) {
      const status =
        result.code === VOICE_STT_PROVIDER_NOT_CONFIGURED ||
        result.code === "UNSUPPORTED_STT_PROVIDER"
          ? 503
          : result.code === "PROVIDER_ERROR"
            ? 502
            : 422;
      return reply.code(status).send(result);
    }
    return reply.code(200).send({
      ok: true,
      transcript: result.transcript,
      provider: result.provider,
    });
  });
}
