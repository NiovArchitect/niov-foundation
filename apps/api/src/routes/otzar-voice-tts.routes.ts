// FILE: otzar-voice-tts.routes.ts
// PURPOSE: Auth-gated premium TTS proxy. Turns a short utterance into
//          provider audio (MP3) for assistant speech and walkthrough
//          narration. Primary provider is xAI Orion when configured;
//          ElevenLabs remains fallback. Keys never leave the server.
//
//          Routes (identical handler):
//            POST /api/v1/otzar/voice/tts-preview  (existing clients)
//            POST /api/v1/otzar/voice/speak         (canonical name)
//
// CONNECTS TO: services/voice/tts-preview.service.ts,
//          otzar-control-tower src/lib/voice/premium-tts.ts.

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
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

type TtsBody = { text?: unknown; voice_id?: unknown };

async function handleTts(
  authService: AuthService,
  request: FastifyRequest<{ Body: TtsBody }>,
  reply: FastifyReply,
): Promise<void> {
  const token = bearerFrom(request.headers.authorization);
  if (token === null) {
    await reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
    return;
  }
  const session = await authService.validateSession(token, "read");
  if (!session.valid) {
    await reply.code(401).send({ ok: false, code: session.code });
    return;
  }
  const body = request.body ?? {};
  if (
    typeof body.text !== "string" ||
    body.text.trim().length === 0 ||
    body.text.length > TTS_MAX_TEXT_LENGTH
  ) {
    await reply.code(422).send({
      ok: false,
      code: "INVALID_REQUEST",
      message: `text is required (1-${TTS_MAX_TEXT_LENGTH} chars)`,
    });
    return;
  }
  const result = await generateTtsPreview({
    text: body.text,
    ...(typeof body.voice_id === "string" ? { voiceId: body.voice_id } : {}),
  });
  if (result.ok === false) {
    await reply.code(503).send({ ok: false, code: result.code });
    return;
  }
  await reply
    .code(200)
    .header("Content-Type", result.content_type)
    .header("X-Voice-Provider", result.provider)
    .header("X-Voice-Id", result.voice_id)
    .send(result.audio);
}

export async function registerOtzarVoiceTtsRoutes(
  app: FastifyInstance,
  authService: AuthService,
): Promise<void> {
  const opts = {};
  app.post<{ Body: TtsBody }>(
    "/api/v1/otzar/voice/tts-preview",
    opts,
    async (request, reply) => handleTts(authService, request, reply),
  );
  // Canonical speak route — same auth, bounds, and provider chain.
  app.post<{ Body: TtsBody }>(
    "/api/v1/otzar/voice/speak",
    opts,
    async (request, reply) => handleTts(authService, request, reply),
  );
}
