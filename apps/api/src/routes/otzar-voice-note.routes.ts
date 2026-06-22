// FILE: otzar-voice-note.routes.ts
// PURPOSE: HTTP surface for the note-scoped voice-note revoke chain. Two routes:
//   [OTZAR-RETURN-11-FOUNDATION] READ-ONLY plan:
//     POST /api/v1/otzar/voice-notes/:voice_note_id/revoke-plan  ("read")
//       Plans only — never revokes, deletes, applies, or writes audit, and never
//       returns capsule payload.
//   [OTZAR-RETURN-12-FOUNDATION] MUTATING supervised apply:
//     POST /api/v1/otzar/voice-notes/:voice_note_id/revoke-apply ("write")
//       Soft-revokes (deleted_at) ONLY the caller-owned, active capsules grouped
//       under the note. Org/unknown capsules are skipped; never hard-deletes;
//       never returns capsule payload. Bearer-validated, no admin gate.
//   The :voice_note_id must be a UUID for both.
// CONNECTS TO: voiceNoteRevokePlanForCaller, voiceNoteRevokeApplyForCaller,
//   AuthService.

import type { FastifyInstance } from "fastify";
import type { AuthService } from "../services/auth.service.js";
import { voiceNoteRevokePlanForCaller } from "../services/otzar/voice-note-revoke-plan.service.js";
import { voiceNoteRevokeApplyForCaller } from "../services/otzar/voice-note-revoke-apply.service.js";

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

  app.post<{
    Params: { voice_note_id: string };
    Body: { reason?: unknown };
  }>("/api/v1/otzar/voice-notes/:voice_note_id/revoke-apply", async (request, reply) => {
    const token = bearerFrom(request.headers.authorization);
    if (token === null) {
      return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
    }
    // "write" — apply mutates (soft-revoke + audit). Matches the per-capsule
    // COSMP revoke route, which also validates the "write" scope.
    const session = await authService.validateSession(token, "write");
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
    const rawReason = request.body?.reason;
    if (rawReason !== undefined && typeof rawReason !== "string") {
      return reply.code(422).send({
        ok: false,
        code: "INVALID_REQUEST",
        message: "reason must be a string",
      });
    }
    const result = await voiceNoteRevokeApplyForCaller({
      callerEntityId: session.entity_id,
      voiceNoteId,
      ...(rawReason === undefined ? {} : { reason: rawReason }),
    });
    return reply.code(200).send(result);
  });
}
