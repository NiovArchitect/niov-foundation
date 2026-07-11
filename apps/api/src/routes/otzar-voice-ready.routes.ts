// FILE: otzar-voice-ready.routes.ts
// PURPOSE: Phase 3 — Employee voice-ready route per the
//          [FOUNDER-AUTH — CONTINUE AFTER EDX-3/4/5/6 / AUTONOMOUS
//          ENTERPRISE COLLABORATION COMPLETION] directive. Tied to
//          ConductSession structured output so the employee can
//          submit a text transcript / voice-intent payload and
//          receive the same EDX-3 envelope (speech_ready_text +
//          voice_output_supported + next_step + approval +
//          collaboration + memory_used_summary + …) plus a closed-
//          vocab provider_mode field telling the UI which voice
//          provider is actually active.
//
//          - POST /api/v1/otzar/my-twin/voice-intents
//
// Coexists with the VF.2 voice-intent envelope route at
// /api/v1/voice/intents (per ADR-0085). The two routes serve
// different purposes:
//   - /voice/intents is the canonical voice-intent envelope
//     construction surface — proves voice interactions are
//     governed identically to visual ones.
//   - /otzar/my-twin/voice-intents is the chat-tier bridge that
//     translates a voice transcript into a ConductSession-style
//     reply, returning structured output the UI can render
//     (speech-ready text + approval / collaboration / memory
//     state).
//
// HONESTY POSTURE (per directive):
//   - Live mic / STT / TTS are NOT claimed live unless the
//     Foundation tier actually supports them. At today's tier the
//     provider_mode is TEXT_ONLY — the route accepts a typed
//     transcript only.
//   - Raw audio is NEVER stored by this route (it never sees
//     audio).
//   - No transcript vault.
//   - Voice MUST NOT bypass policy / DMW scope / approval / org
//     policy / audit — those gates are all already enforced by the
//     underlying conductSession + EDX-4 + Phase 2 wiring.
//
// CONNECTS TO:
//   - apps/api/src/services/otzar/otzar.service.ts (conductSession)
//   - apps/api/src/services/otzar/twin-voice-readiness.ts
//     (live_audio_input + live_audio_output values mirror this
//     route's provider_mode posture)

import type { FastifyInstance } from "fastify";
import type { OtzarService } from "../services/otzar/otzar.service.js";

// WHAT: Closed-vocab provider_mode the route emits with every
//        response. Mirrors the directive's spec and the EDX-1
//        voice_readiness_state.live_audio_* tri-state. At today's
//        Foundation tier the value is always TEXT_ONLY — live mic
//        / STT / TTS substrate remains forward-substrate Founder-
//        gated per ADR-0085 + ADR-0089.
export type VoiceProviderMode =
  | "TEXT_ONLY"
  | "LOCAL_MOCK"
  | "SELF_HOSTED_CSM1B_READY"
  | "SELF_HOSTED_CSM1B_ACTIVE"
  | "NOT_CONFIGURED";

function bearerFrom(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || !value.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token.length === 0 ? null : token;
}

function statusForCode(code: string): number {
  switch (code) {
    case "SESSION_INVALID":
    case "SESSION_EXPIRED":
    case "SESSION_REVOKED":
    case "SESSION_INVALIDATED":
      return 401;
    case "OPERATION_NOT_PERMITTED":
    case "NOT_CONVERSATION_OWNER":
    case "OTZAR_THREAD_FORBIDDEN":
      return 403;
    case "TWIN_NOT_FOUND":
    case "CONVERSATION_NOT_FOUND":
      return 404;
    case "INVALID_HISTORY":
    case "INVALID_REQUEST_ID":
      return 422;
    case "OTZAR_REQUEST_ID_CONFLICT":
    case "OTZAR_THREAD_CLOSED":
    case "OTZAR_REQUEST_IN_PROGRESS":
    case "OTZAR_CONTINUITY_STATE_CHANGED":
      return 409;
    case "TOKEN_BUDGET_EXCEEDED":
      return 413;
    case "LLM_UNAVAILABLE":
    case "OTZAR_TURN_PERSIST_FAILED":
    case "OTZAR_ASSISTANT_TURN_PERSIST_FAILED":
      return 503;
    default:
      return 400;
  }
}

export async function registerOtzarVoiceReadyRoutes(
  app: FastifyInstance,
  otzarService: OtzarService,
): Promise<void> {
  app.post<{
    Body: {
      transcript_text?: unknown;
      message?: unknown;
      conversation_id?: unknown;
      conversation_history?: unknown;
      token_budget?: unknown;
      client_timezone?: unknown;
      request_id?: unknown;
    };
  }>(
    "/api/v1/otzar/my-twin/voice-intents",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) {
        return reply.code(401).send({
          ok: false,
          code: "SESSION_INVALID",
          message: "Missing bearer token",
        });
      }
      const body = request.body ?? {};
      // Accept either `transcript_text` (canonical voice field) or
      // `message` (chat field) so the same client can submit either
      // shape. At the Foundation tier today both are typed text;
      // raw audio is NEVER accepted by this route.
      const text =
        typeof body.transcript_text === "string" &&
        body.transcript_text.length > 0
          ? body.transcript_text
          : typeof body.message === "string" && body.message.length > 0
            ? body.message
            : null;
      if (text === null) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message:
            "transcript_text or message is required (non-empty string)",
        });
      }
      const conversationId =
        typeof body.conversation_id === "string" &&
        body.conversation_id.length > 0
          ? body.conversation_id
          : undefined;
      const history = Array.isArray(body.conversation_history)
        ? body.conversation_history.filter(
            (h): h is string => typeof h === "string",
          )
        : [];
      const tokenBudget =
        typeof body.token_budget === "number" &&
        Number.isFinite(body.token_budget) &&
        body.token_budget > 0 &&
        body.token_budget <= 50_000
          ? body.token_budget
          : undefined;

      // Phase 1253: unexpected throws (e.g. transient DB-pool
      // pressure) become a calm retryable envelope, never a raw 500.
      let result: Awaited<ReturnType<typeof otzarService.conductSession>>;
      try {
        result = await otzarService.conductSession({
          token,
          message: text,
          conversation_id: conversationId,
          conversation_history: history,
          token_budget: tokenBudget,
          // [OTZAR-CONTINUITY P1] live device timezone (travel-correct), when sent.
          ...(typeof body.client_timezone === "string" && body.client_timezone.length > 0
            ? { client_timezone: body.client_timezone }
            : {}),
          // [OTZAR-CONTINUITY P5 Stage 1] client idempotency key (validated server-side).
          ...(typeof body.request_id === "string" && body.request_id.length > 0
            ? { request_id: body.request_id }
            : {}),
          // [OTZAR-CONTINUITY P5 Stage 1 §8] this surface is the voice-intent channel.
          source_channel: "VOICE",
        });
      } catch (err) {
        request.log.error({ err }, "voice-intent conductSession threw");
        return reply
          .code(503)
          .send({ ok: false, code: "OTZAR_BUSY_TRY_AGAIN" });
      }
      if (!result.ok) {
        return reply.code(statusForCode(result.code)).send(result);
      }
      // Augment the ConductSession success with the closed-vocab
      // provider_mode. At today's Foundation tier the value is
      // always TEXT_ONLY — the bridge accepted typed text, the
      // response is the same EDX-3 structured envelope, and live
      // audio remains forward-substrate Founder-gated.
      const provider_mode: VoiceProviderMode = "TEXT_ONLY";
      return reply.code(200).send({ ...result, provider_mode });
    },
  );
}
