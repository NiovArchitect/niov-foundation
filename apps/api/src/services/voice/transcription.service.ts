// FILE: transcription.service.ts
// PURPOSE: Phase 1264 — the DESKTOP voice-input runtime. The Tauri
//          macOS WKWebView has no Web Speech API, so the desktop app
//          records a short utterance with MediaRecorder and POSTs the
//          audio here; this service transcribes it with a real
//          provider (OpenAI Whisper) and returns the transcript STRING
//          so it can ride the SAME governed conductSession chat path
//          as typed input. This is the path that makes "talk to Otzar
//          on desktop" actually work — not a fixture, not a fake.
//
// PROVIDER: OpenAI Whisper (`whisper-1`) via the audio/transcriptions
//          endpoint. Activates when OPENAI_API_KEY is set. When the
//          key is absent the service returns STT_NOT_CONFIGURED so the
//          client shows an honest runtime-pending state — never a fake
//          transcript, never a fake green.
//
// PRIVACY (RULE 0 + RULE 4):
//   - Audio bytes live in memory for the single request only. They are
//     NEVER persisted, NEVER logged, NEVER written to any store.
//   - The transcript text is returned to the caller and NEVER logged
//     and NEVER put in an audit detail (only its character count is).
//   - The API key is never logged; provider errors are reduced to a
//     status code before they touch the logger.
//   - Every transcription emits an audit event BEFORE the response is
//     sent (AUDIO_CAPTURE_TRANSCRIBED on success / AUDIO_CAPTURE_FAILED
//     on failure). If the audit write throws, the action fails.
// CONNECTS TO: apps/api/src/routes/otzar-voice-transcribe.routes.ts,
//          otzar-control-tower src/hooks/useDesktopVoiceCapture.ts,
//          tests/unit/voice-transcription.test.ts.

import { writeAuditEvent } from "@niov/database";
import { logger } from "../../logger.js";

/** Hard ceiling on decoded audio bytes. A spoken command is a few
 *  seconds of Opus/AAC (tens of KB); 6 MB is a generous cap that
 *  still fits comfortably under OpenAI's 25 MB file limit and the
 *  route's body limit. Anything larger is rejected before any
 *  provider call. */
export const MAX_AUDIO_BYTES = 6 * 1024 * 1024;

/** Closed-vocab transcription outcome codes the client maps to honest
 *  copy. STT_NOT_CONFIGURED → runtime-pending; STT_PROVIDER_BILLING →
 *  provider-billing-pending; the rest → try-again copy. */
export type TranscribeFailureCode =
  | "STT_NOT_CONFIGURED"
  | "STT_PROVIDER_UNAVAILABLE"
  | "STT_PROVIDER_BILLING"
  | "STT_NO_SPEECH"
  | "INVALID_AUDIO";

export type WhisperResult =
  | { ok: true; transcript: string; provider: "WHISPER_API" }
  | { ok: false; code: TranscribeFailureCode };

/** Map a recorder MIME type to a filename extension Whisper accepts.
 *  MediaRecorder emits audio/webm (Chromium) or audio/mp4 (Safari /
 *  WKWebView). Both are accepted by the Whisper file API. */
function filenameForMime(mimeType: string): string {
  const base = mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  switch (base) {
    case "audio/webm":
      return "audio.webm";
    case "audio/mp4":
    case "audio/x-m4a":
    case "audio/m4a":
      return "audio.mp4";
    case "audio/mpeg":
    case "audio/mp3":
      return "audio.mp3";
    case "audio/wav":
    case "audio/x-wav":
      return "audio.wav";
    case "audio/ogg":
      return "audio.ogg";
    default:
      // Whisper sniffs the container; default to webm which is the
      // Chromium MediaRecorder default.
      return "audio.webm";
  }
}

// WHAT: Pure provider call — transcribe in-memory audio with Whisper.
// INPUT: decoded audio bytes + the recorder MIME type.
// OUTPUT: transcript string, or a closed-vocab failure code.
// WHY: kept free of DB/audit so it is unit-testable with a mocked
//      fetch; the caller owns the audit + org context.
export async function callWhisperTranscription(
  audio: Buffer,
  mimeType: string,
): Promise<WhisperResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey === undefined || apiKey.length < 10) {
    return { ok: false, code: "STT_NOT_CONFIGURED" };
  }
  try {
    const form = new FormData();
    // Blob keeps the bytes in memory; nothing is written to disk.
    const blob = new Blob([new Uint8Array(audio)], { type: mimeType });
    form.append("file", blob, filenameForMime(mimeType));
    form.append("model", "whisper-1");
    form.append("response_format", "json");
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!res.ok) {
      // Redacted: status only — never the provider body (it can echo
      // request content) and never the key.
      logger.warn(
        { provider: "WHISPER_API", status: res.status },
        "stt transcription provider error",
      );
      // 429 is the billing/rate-limit signal — surface it distinctly so
      // the client can say "provider-billing-pending", not a generic
      // failure.
      if (res.status === 429) return { ok: false, code: "STT_PROVIDER_BILLING" };
      return { ok: false, code: "STT_PROVIDER_UNAVAILABLE" };
    }
    const body = (await res.json()) as { text?: unknown };
    const transcript = typeof body.text === "string" ? body.text.trim() : "";
    if (transcript.length === 0) {
      return { ok: false, code: "STT_NO_SPEECH" };
    }
    return { ok: true, transcript, provider: "WHISPER_API" };
  } catch (err) {
    logger.warn({ err, provider: "WHISPER_API" }, "stt transcription failed");
    return { ok: false, code: "STT_PROVIDER_UNAVAILABLE" };
  }
}

export interface TranscribeInput {
  callerEntityId: string;
  audioBase64: string;
  mimeType: string;
}

export type TranscribeForCallerResult =
  | { ok: true; httpStatus: 200; transcript: string; provider: "WHISPER_API" }
  | { ok: false; httpStatus: 422 | 503; code: TranscribeFailureCode };

// WHAT: Transcribe a desktop voice command for the authenticated
//       caller, with audit.
// INPUT: caller entity id + base64 audio + MIME type.
// OUTPUT: transcript (success) or a closed-vocab failure + HTTP status.
// WHY: the single governed entry point the route calls. Audit is
//      written BEFORE the response per RULE 4; audio never persists.
export async function transcribeVoiceCommandForCaller(
  input: TranscribeInput,
): Promise<TranscribeForCallerResult> {
  // Decode + validate the audio entirely in memory.
  let audio: Buffer;
  try {
    audio = Buffer.from(input.audioBase64, "base64");
  } catch {
    audio = Buffer.alloc(0);
  }
  if (audio.length === 0) {
    await writeAuditEvent({
      event_type: "AUDIO_CAPTURE_FAILED",
      outcome: "ERROR",
      actor_entity_id: input.callerEntityId,
      details: { provider: "WHISPER_API", failure_class: "INVALID_AUDIO" },
    });
    return { ok: false, httpStatus: 422, code: "INVALID_AUDIO" };
  }
  if (audio.length > MAX_AUDIO_BYTES) {
    await writeAuditEvent({
      event_type: "AUDIO_CAPTURE_FAILED",
      outcome: "ERROR",
      actor_entity_id: input.callerEntityId,
      details: {
        provider: "WHISPER_API",
        failure_class: "INVALID_AUDIO",
        audio_bytes: audio.length,
      },
    });
    return { ok: false, httpStatus: 422, code: "INVALID_AUDIO" };
  }

  const result = await callWhisperTranscription(audio, input.mimeType);

  if (result.ok === false) {
    // SAFE audit details only: provider + failure code + byte count.
    // NEVER the transcript, NEVER the audio, NEVER the key.
    await writeAuditEvent({
      event_type: "AUDIO_CAPTURE_FAILED",
      outcome: "ERROR",
      actor_entity_id: input.callerEntityId,
      details: {
        provider: "WHISPER_API",
        failure_class: result.code,
        audio_bytes: audio.length,
      },
    });
    const httpStatus: 422 | 503 =
      result.code === "INVALID_AUDIO" ? 422 : 503;
    return { ok: false, httpStatus, code: result.code };
  }

  await writeAuditEvent({
    event_type: "AUDIO_CAPTURE_TRANSCRIBED",
    outcome: "SUCCESS",
    actor_entity_id: input.callerEntityId,
    details: {
      provider: "WHISPER_API",
      mode: "LIVE_MIC",
      audio_bytes: audio.length,
      // Character count only — proves a transcript was produced
      // without ever recording its content (RULE 0).
      transcript_chars: result.transcript.length,
    },
  });

  return {
    ok: true,
    httpStatus: 200,
    transcript: result.transcript,
    provider: "WHISPER_API",
  };
}
