// FILE: otzar-voice-note.routes.ts
// PURPOSE: [OTZAR-RETURN-11-FOUNDATION] HTTP surface for the READ-ONLY,
//          note-scoped voice-note revoke PLAN. One route:
//            POST /api/v1/otzar/voice-notes/:voice_note_id/revoke-plan
//          Bearer-validated ("read"), no admin gate. It plans only — it never
//          revokes, deletes, applies, or writes audit, and never returns capsule
//          payload. The :voice_note_id must be a UUID.
// CONNECTS TO: voiceNoteRevokePlanForCaller, AuthService.

import type { FastifyInstance } from "fastify";
import type { AuthService } from "../services/auth.service.js";
import { voiceNoteRevokePlanForCaller } from "../services/otzar/voice-note-revoke-plan.service.js";

function bearerFrom(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || !value.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token.length === 0 ? null : token;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function registerOtzarVoiceNoteRoutes(
  app: FastifyInstance,
  authService: AuthService,
): void {
  app.post<{
    Params: { voice_note_id: string };
    Body: { reason?: unknown };
  }>("/api/v1/otzar/voice-notes/:voice_note_id/revoke-plan", async (request, reply) => {
    const token = bearerFrom(request.headers.authorization);
    if (token === null) {
      return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
    }
    // "read" — planning is a read; it mutates nothing.
    const session = await authService.validateSession(token, "read");
    if (!session.valid) {
      return reply.code(401).send({ ok: false, code: session.code });
    }
    const voiceNoteId = request.params.voice_note_id;
    if (!UUID_RE.test(voiceNoteId)) {
      return reply.code(422).send({
        ok: false,
        code: "INVALID_REQUEST",
        message: "voice_note_id must be a UUID",
      });
    }
    const plan = await voiceNoteRevokePlanForCaller({
      callerEntityId: session.entity_id,
      voiceNoteId,
    });
    return reply.code(200).send(plan);
  });
}
