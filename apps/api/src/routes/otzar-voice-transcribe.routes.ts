// FILE: otzar-voice-transcribe.routes.ts
// PURPOSE: Phase 1264 — POST /api/v1/otzar/voice/transcribe. The
//          desktop voice-input bridge: the Tauri app (no Web Speech
//          API) records a short utterance with MediaRecorder and POSTs
//          the audio here; we transcribe it with a real provider
//          (OpenAI Whisper) and return the transcript STRING so it can
//          ride the SAME governed conductSession chat path as typed
//          input. Auth-gated (write); bounded body; closed-vocab
//          failures so the client shows honest runtime-pending /
//          provider-billing-pending states. Audio is never stored.
// CONNECTS TO: services/voice/transcription.service.ts,
//          otzar-control-tower src/hooks/useDesktopVoiceCapture.ts.

import type { FastifyInstance } from "fastify";
import type { AuthService } from "../services/auth.service.js";
import { transcribeVoiceCommandForCaller } from "../services/voice/transcription.service.js";

function bearerFrom(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || !value.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token.length === 0 ? null : token;
}

export async function registerOtzarVoiceTranscribeRoutes(
  app: FastifyInstance,
  authService: AuthService,
): Promise<void> {
  app.post<{ Body: { audio_base64?: unknown; mime_type?: unknown } }>(
    "/api/v1/otzar/voice/transcribe",
    {
      // Base64 audio inflates ~33%; allow ~8 MB of JSON so a ~6 MB
      // decoded clip (the service ceiling) fits. Per-route so the
      // global 1 MB default still guards every other endpoint.
      bodyLimit: 8 * 1024 * 1024,
    },
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const session = await authService.validateSession(token, "write");
      if (!session.valid)
        return reply.code(401).send({ ok: false, code: session.code });
      const body = request.body ?? {};
      if (
        typeof body.audio_base64 !== "string" ||
        body.audio_base64.trim().length === 0
      ) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_AUDIO",
          message: "audio_base64 is required",
        });
      }
      const mimeType =
        typeof body.mime_type === "string" && body.mime_type.length > 0
          ? body.mime_type
          : "audio/webm";
      const result = await transcribeVoiceCommandForCaller({
        callerEntityId: session.entity_id,
        audioBase64: body.audio_base64,
        mimeType,
      });
      if (result.ok === false) {
        return reply
          .code(result.httpStatus)
          .send({ ok: false, code: result.code });
      }
      return reply.code(200).send({
        ok: true,
        transcript: result.transcript,
        provider: result.provider,
      });
    },
  );
}
