// FILE: otzar-voice-tts.routes.ts
// PURPOSE: Phase 1259 — POST /api/v1/otzar/voice/tts-preview. Turns
//          a short utterance into premium provider audio (MP3) for
//          the "Hear it" test and assistant speech. Auth-gated;
//          bounded text; closed-vocab failures so the client can
//          fall back to the device voice with HONEST labeling. No
//          audio is stored; no key or raw provider error escapes.
// CONNECTS TO: services/voice/tts-preview.service.ts,
//          otzar-control-tower src/lib/voice/premium-tts.ts.

import type { FastifyInstance } from "fastify";
import type { AuthService } from "../services/auth.service.js";
import {
  generateTtsPreview,
  TTS_MAX_TEXT_LENGTH,
} from "../services/voice/tts-preview.service.js";

function bearerFrom(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || !value.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token.length === 0 ? null : token;
}

export async function registerOtzarVoiceTtsRoutes(
  app: FastifyInstance,
  authService: AuthService,
): Promise<void> {
  app.post<{ Body: { text?: unknown; voice_id?: unknown } }>(
    "/api/v1/otzar/voice/tts-preview",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const session = await authService.validateSession(token, "read");
      if (!session.valid)
        return reply.code(401).send({ ok: false, code: session.code });
      const body = request.body ?? {};
      if (
        typeof body.text !== "string" ||
        body.text.trim().length === 0 ||
        body.text.length > TTS_MAX_TEXT_LENGTH
      ) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: `text is required (1-${TTS_MAX_TEXT_LENGTH} chars)`,
        });
      }
      const result = await generateTtsPreview({
        text: body.text,
        ...(typeof body.voice_id === "string"
          ? { voiceId: body.voice_id }
          : {}),
      });
      if (result.ok === false) {
        return reply.code(503).send({ ok: false, code: result.code });
      }
      return reply
        .code(200)
        .header("Content-Type", result.content_type)
        .header("X-Voice-Provider", result.provider)
        .send(result.audio);
    },
  );
}
