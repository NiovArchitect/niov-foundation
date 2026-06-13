// FILE: transcription.service.ts
// PURPOSE: Phase 1264 — the DESKTOP voice-input runtime. The Tauri
//          macOS WKWebView has no Web Speech API, so the desktop app
//          records a short utterance with MediaRecorder and POSTs the
//          audio here; this service transcribes it with a REAL provider
//          (OpenAI Whisper) and returns the transcript STRING so it can
//          ride the SAME governed conductSession chat path as typed
//          input. Not a fixture, not a fake.
//
// PROVIDER: OpenAI Whisper (`whisper-1`) via the audio/transcriptions
//          endpoint. Activates when OPENAI_API_KEY is set. (Deepgram
//          fallback is deliberately NOT added in this verification
//          pass.)
//
// ERROR CLASSIFICATION (Phase 1264 verification pass):
//   The previous slice collapsed a 429 into a single "billing" code and
//   everything else into "unavailable" — which made it impossible to
//   tell a real OpenAI quota/billing block from a transient rate limit,
//   an auth failure, a model-access problem, or a bad-audio request.
//   This pass distinguishes them with closed-vocab codes derived from
//   the HTTP status + OpenAI's safe `error.type`/`error.code` fields:
//     STT_NOT_CONFIGURED     — no key in this process
//     STT_PROVIDER_AUTH_FAILED — 401 / 403 (bad/forbidden key or project)
//     STT_PROVIDER_BILLING   — 402, or 429 with type "insufficient_quota"
//     STT_PROVIDER_RATE_LIMITED — 429 rate limit (not quota)
//     STT_MODEL_UNAVAILABLE  — 404 / model_not_found
//     STT_BAD_AUDIO          — 400 (provider rejected the audio/params)
//     STT_PROVIDER_UNAVAILABLE — 5xx / network / unknown
//     STT_NO_SPEECH          — provider processed audio, heard nothing
//     INVALID_AUDIO          — pre-flight: empty / oversize bytes
//
// PRIVACY (RULE 0 + RULE 4):
//   - Audio bytes live in memory for the single request only. They are
//     NEVER persisted, NEVER logged, NEVER written to any store.
//   - The transcript text is returned to the caller and NEVER logged
//     and NEVER put in an audit detail (only its character count is).
//   - The API key is never logged. Only SAFE provider metadata is
//     logged: status code + sanitized error.type/error.code (matched
//     against a strict identifier pattern) — never the response body,
//     never the audio.
//   - Every transcription emits an audit event BEFORE the response is
//     sent. If the audit write throws, the action fails.
// CONNECTS TO: apps/api/src/routes/otzar-voice-transcribe.routes.ts,
//          scripts/diagnostics/verify-openai-transcription.ts,
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

/** The Whisper transcription model + endpoint, exported so the
 *  diagnostic script reports exactly what the runtime calls. */
export const WHISPER_MODEL = "whisper-1";
export const WHISPER_ENDPOINT =
  "https://api.openai.com/v1/audio/transcriptions";

/** Provider identifier returned to the client so the UI can show
 *  which engine produced the transcript. */
export type TranscriptionProvider = "openai-whisper";

/** Closed-vocab transcription outcome codes the client maps to honest
 *  copy. */
export type TranscribeFailureCode =
  | "STT_NOT_CONFIGURED"
  | "STT_PROVIDER_AUTH_FAILED"
  | "STT_PROVIDER_BILLING"
  | "STT_PROVIDER_RATE_LIMITED"
  | "STT_MODEL_UNAVAILABLE"
  | "STT_BAD_AUDIO"
  | "STT_PROVIDER_UNAVAILABLE"
  | "STT_NO_SPEECH"
  | "INVALID_AUDIO";

/** A provider call result. `httpStatus` is SAFE metadata (a number) the
 *  audit + diagnostic surface; it is NEVER returned to the client. */
export type ProviderTranscriptionResult =
  | { ok: true; transcript: string; provider: TranscriptionProvider }
  | { ok: false; code: TranscribeFailureCode; httpStatus?: number };

/** Back-compat alias (was the result type in the first Phase 1264 slice). */
export type WhisperResult = ProviderTranscriptionResult;

/** Only allow short identifier-shaped strings into logs (e.g.
 *  "insufficient_quota", "model_not_found"). Anything else is dropped
 *  so a provider can never coax sensitive content into our logs. */
function safeIdent(value: unknown): string | undefined {
  return typeof value === "string" && /^[a-z0-9_.-]{1,64}$/i.test(value)
    ? value
    : undefined;
}

/** Map an OpenAI HTTP status + safe error fields to a closed-vocab
 *  code. The key disambiguation: a 429 may be a transient RATE LIMIT
 *  or a quota/BILLING block — `error.type === "insufficient_quota"`
 *  (or a 402) is the billing signal. */
export function classifyOpenAiHttp(
  status: number,
  errorType?: string,
  errorCode?: string,
): TranscribeFailureCode {
  const t = (errorType ?? "").toLowerCase();
  const c = (errorCode ?? "").toLowerCase();
  if (status === 401) return "STT_PROVIDER_AUTH_FAILED";
  if (status === 403) {
    if (c.includes("model") || t.includes("model")) return "STT_MODEL_UNAVAILABLE";
    return "STT_PROVIDER_AUTH_FAILED";
  }
  if (status === 402) return "STT_PROVIDER_BILLING";
  if (status === 404) return "STT_MODEL_UNAVAILABLE";
  if (status === 400) {
    if (c.includes("model") || t.includes("model")) return "STT_MODEL_UNAVAILABLE";
    return "STT_BAD_AUDIO";
  }
  if (status === 429) {
    if (t.includes("insufficient_quota") || c.includes("insufficient_quota"))
      return "STT_PROVIDER_BILLING";
    return "STT_PROVIDER_RATE_LIMITED";
  }
  return "STT_PROVIDER_UNAVAILABLE";
}

/** Map a recorder MIME type to a filename extension Whisper accepts.
 *  MediaRecorder emits audio/webm (Chromium) or audio/mp4 (Safari /
 *  WKWebView). Both are accepted by the Whisper file API. */
export function filenameForMime(mimeType: string): string {
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

// WHAT: Pure provider call — transcribe in-memory audio with OpenAI
//       Whisper, with refined error classification.
// INPUT: decoded audio bytes + the recorder MIME type.
// OUTPUT: transcript (success) or a closed-vocab failure code + the
//         HTTP status (safe metadata).
// WHY: kept free of DB/audit so it is unit-testable with a mocked
//      fetch; the caller owns the audit + org context.
export async function callWhisperTranscription(
  audio: Buffer,
  mimeType: string,
): Promise<ProviderTranscriptionResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey === undefined || apiKey.length < 10) {
    return { ok: false, code: "STT_NOT_CONFIGURED" };
  }
  try {
    const form = new FormData();
    // Blob keeps the bytes in memory; nothing is written to disk.
    const blob = new Blob([new Uint8Array(audio)], { type: mimeType });
    form.append("file", blob, filenameForMime(mimeType));
    form.append("model", WHISPER_MODEL);
    form.append("response_format", "json");
    const res = await fetch(WHISPER_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!res.ok) {
      // Read ONLY the safe error.type/error.code identifiers — never
      // log the full body (it can echo request content) or the key.
      let errorType: string | undefined;
      let errorCode: string | undefined;
      try {
        const eb = (await res.json()) as {
          error?: { type?: unknown; code?: unknown };
        };
        errorType = safeIdent(eb.error?.type);
        errorCode = safeIdent(eb.error?.code);
      } catch {
        /* non-JSON error body — status alone drives classification */
      }
      const mapped = classifyOpenAiHttp(res.status, errorType, errorCode);
      logger.warn(
        {
          provider: "openai-whisper",
          status: res.status,
          ...(errorType !== undefined ? { error_type: errorType } : {}),
          ...(errorCode !== undefined ? { error_code: errorCode } : {}),
          code: mapped,
        },
        "stt transcription provider error",
      );
      return { ok: false, code: mapped, httpStatus: res.status };
    }
    const body = (await res.json()) as { text?: unknown };
    const transcript = typeof body.text === "string" ? body.text.trim() : "";
    if (transcript.length === 0) {
      return { ok: false, code: "STT_NO_SPEECH", httpStatus: res.status };
    }
    return { ok: true, transcript, provider: "openai-whisper" };
  } catch (err) {
    logger.warn({ err, provider: "openai-whisper" }, "stt transcription failed");
    return { ok: false, code: "STT_PROVIDER_UNAVAILABLE" };
  }
}

export interface TranscribeInput {
  callerEntityId: string;
  audioBase64: string;
  mimeType: string;
}

export type TranscribeForCallerResult =
  | {
      ok: true;
      httpStatus: 200;
      transcript: string;
      provider: TranscriptionProvider;
    }
  | { ok: false; httpStatus: 422 | 503; code: TranscribeFailureCode };

/** Client input problems answer 422; provider/runtime problems answer
 *  503. */
function httpStatusForFailure(code: TranscribeFailureCode): 422 | 503 {
  return code === "INVALID_AUDIO" ||
    code === "STT_BAD_AUDIO" ||
    code === "STT_NO_SPEECH"
    ? 422
    : 503;
}

// WHAT: Transcribe a desktop voice command for the authenticated
//       caller, with audit + refined classification.
// INPUT: caller entity id + base64 audio + MIME type.
// OUTPUT: transcript + provider (success) or a closed-vocab failure +
//         HTTP status.
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
  if (audio.length === 0 || audio.length > MAX_AUDIO_BYTES) {
    await writeAuditEvent({
      event_type: "AUDIO_CAPTURE_FAILED",
      outcome: "ERROR",
      actor_entity_id: input.callerEntityId,
      details: {
        provider: "openai-whisper",
        failure_class: "INVALID_AUDIO",
        audio_bytes: audio.length,
      },
    });
    return { ok: false, httpStatus: 422, code: "INVALID_AUDIO" };
  }

  const result = await callWhisperTranscription(audio, input.mimeType);

  if (result.ok === false) {
    // SAFE audit details only: provider + failure code + HTTP status +
    // byte count. NEVER the transcript, NEVER the audio, NEVER the key.
    await writeAuditEvent({
      event_type: "AUDIO_CAPTURE_FAILED",
      outcome: "ERROR",
      actor_entity_id: input.callerEntityId,
      details: {
        provider: "openai-whisper",
        failure_class: result.code,
        ...(result.httpStatus !== undefined
          ? { provider_status: result.httpStatus }
          : {}),
        audio_bytes: audio.length,
      },
    });
    return {
      ok: false,
      httpStatus: httpStatusForFailure(result.code),
      code: result.code,
    };
  }

  await writeAuditEvent({
    event_type: "AUDIO_CAPTURE_TRANSCRIBED",
    outcome: "SUCCESS",
    actor_entity_id: input.callerEntityId,
    details: {
      provider: result.provider,
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
    provider: result.provider,
  };
}
