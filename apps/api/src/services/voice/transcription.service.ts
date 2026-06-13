// FILE: transcription.service.ts
// PURPOSE: Phase 1264 — the DESKTOP voice-input runtime. The Tauri
//          macOS WKWebView has no Web Speech API, so the desktop app
//          records a short utterance with MediaRecorder and POSTs the
//          audio here; this service transcribes it with a REAL provider
//          and returns the transcript STRING so it can ride the SAME
//          governed conductSession chat path as typed input. Not a
//          fixture, not a fake.
//
// PROVIDERS + FALLBACK (Phase 1264 hardening):
//   - OpenAI Whisper (`whisper-1`) FIRST when OPENAI_API_KEY is set.
//   - If OpenAI is blocked by BILLING / RATE_LIMIT / UNAVAILABLE, fall
//     back to Deepgram (nova-2) when DEEPGRAM_API_KEY is set. (The live
//     OpenAI account is currently `insufficient_quota`/429 — this
//     fallback keeps desktop voice working while billing is fixed.)
//   - OpenAI AUTH_FAILED / MODEL_UNAVAILABLE / BAD_AUDIO / NO_SPEECH do
//     NOT trigger fallback — those are config/audio facts another
//     provider can't fix. INVALID_AUDIO is client input (pre-flight).
//   - Only Deepgram configured → use it directly. Neither → honest
//     STT_NOT_CONFIGURED.
//
// ERROR CLASSIFICATION: each provider's HTTP status + safe error
//   identifiers map to closed-vocab codes (no body, no key, no audio
//   ever logged):
//     STT_NOT_CONFIGURED / STT_PROVIDER_AUTH_FAILED / STT_PROVIDER_BILLING
//     / STT_PROVIDER_RATE_LIMITED / STT_MODEL_UNAVAILABLE / STT_BAD_AUDIO
//     / STT_PROVIDER_UNAVAILABLE / STT_NO_SPEECH / INVALID_AUDIO
//
// PRIVACY (RULE 0 + RULE 4):
//   - Audio bytes live in memory for the single request only. NEVER
//     persisted, NEVER logged, NEVER written to any store.
//   - The transcript text is returned to the caller and NEVER logged
//     and NEVER put in an audit detail (only its character count is).
//   - Provider keys are never logged. Only SAFE provider metadata is
//     logged: status + sanitized error.type/code (strict identifier
//     pattern). The provider response body is never logged.
//   - Every transcription emits ONE audit event BEFORE the response is
//     sent, recording providers_attempted + the winning provider (or
//     the safe terminal failure class). If the audit write throws, the
//     action fails.
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

/** OpenAI Whisper model + endpoint, exported so the diagnostic script
 *  reports exactly what the runtime calls. */
export const WHISPER_MODEL = "whisper-1";
export const WHISPER_ENDPOINT =
  "https://api.openai.com/v1/audio/transcriptions";

/** Deepgram prerecorded model + endpoint. */
export const DEEPGRAM_MODEL = "nova-2";
export const DEEPGRAM_ENDPOINT =
  "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true";

/** Provider identifiers returned to the client so the UI can show
 *  which engine produced the transcript. */
export type TranscriptionProvider = "openai-whisper" | "deepgram";

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

/** A single provider's result. `httpStatus` is SAFE metadata the audit
 *  + diagnostic surface; it is NEVER returned to the client. */
export type ProviderTranscriptionResult =
  | { ok: true; transcript: string; provider: TranscriptionProvider }
  | { ok: false; code: TranscribeFailureCode; httpStatus?: number };

/** Back-compat alias (was the result type in the first Phase 1264 slice). */
export type WhisperResult = ProviderTranscriptionResult;

/** Failure codes that justify trying the NEXT provider. Everything
 *  else (auth/model/bad-audio/no-speech) is definitive for the audio
 *  or is a config fact a second provider cannot fix. */
const FALLBACK_ELIGIBLE: ReadonlySet<TranscribeFailureCode> = new Set([
  "STT_PROVIDER_BILLING",
  "STT_PROVIDER_RATE_LIMITED",
  "STT_PROVIDER_UNAVAILABLE",
]);

/** When the whole chain fails, pick the clearest/most-actionable code
 *  across the attempts (billing first — it's the human action; then
 *  rate-limit; then whatever a provider definitively reported about
 *  the audio; unavailable last). */
const FINAL_CODE_PRIORITY: readonly TranscribeFailureCode[] = [
  "STT_PROVIDER_BILLING",
  "STT_PROVIDER_RATE_LIMITED",
  "STT_NO_SPEECH",
  "STT_BAD_AUDIO",
  "STT_PROVIDER_AUTH_FAILED",
  "STT_MODEL_UNAVAILABLE",
  "STT_PROVIDER_UNAVAILABLE",
];

function clearestFailure(codes: TranscribeFailureCode[]): TranscribeFailureCode {
  for (const c of FINAL_CODE_PRIORITY) if (codes.includes(c)) return c;
  return "STT_PROVIDER_UNAVAILABLE";
}

function hasKey(name: "OPENAI_API_KEY" | "DEEPGRAM_API_KEY"): boolean {
  const k = process.env[name];
  return k !== undefined && k.length >= 10;
}

/** Only allow short identifier-shaped strings into logs (e.g.
 *  "insufficient_quota", "model_not_found"). Anything else is dropped
 *  so a provider can never coax sensitive content into our logs. */
function safeIdent(value: unknown): string | undefined {
  return typeof value === "string" && /^[a-z0-9_.-]{1,64}$/i.test(value)
    ? value
    : undefined;
}

/** Map an OpenAI HTTP status + safe error fields to a closed-vocab
 *  code. A 429 may be a transient RATE LIMIT or a quota/BILLING block —
 *  `error.type === "insufficient_quota"` (or a 402) is the billing
 *  signal. */
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

/** Map a Deepgram HTTP status + safe error code to a closed-vocab code.
 *  Deepgram returns 402/INSUFFICIENT-style signals for balance/quota
 *  problems and 429 for rate limits. */
export function classifyDeepgramHttp(
  status: number,
  errorCode?: string,
): TranscribeFailureCode {
  const c = (errorCode ?? "").toLowerCase();
  if (status === 401 || status === 403) return "STT_PROVIDER_AUTH_FAILED";
  if (status === 402 || c.includes("insufficient") || c.includes("balance"))
    return "STT_PROVIDER_BILLING";
  if (status === 429) return "STT_PROVIDER_RATE_LIMITED";
  if (status === 400) return "STT_BAD_AUDIO";
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
      // Providers sniff the container; default to webm (Chromium
      // MediaRecorder default).
      return "audio.webm";
  }
}

// WHAT: Pure provider call — OpenAI Whisper, refined classification.
// INPUT: decoded audio bytes + the recorder MIME type.
// OUTPUT: transcript (success) or a closed-vocab failure + HTTP status.
// WHY: kept free of DB/audit so it is unit-testable with a mocked
//      fetch; the orchestrator owns audit + fallback.
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

// WHAT: Pure provider call — Deepgram prerecorded (`nova-2`). The audio
//       bytes are sent RAW with the recorder MIME type as Content-Type.
// OUTPUT: transcript (success) or a closed-vocab failure + HTTP status.
// WHY: the billing/rate-limit/unavailable fallback for OpenAI Whisper.
//      Same privacy posture: no key logged, no audio logged, no body
//      echoed.
export async function callDeepgramTranscription(
  audio: Buffer,
  mimeType: string,
): Promise<ProviderTranscriptionResult> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (apiKey === undefined || apiKey.length < 10) {
    return { ok: false, code: "STT_NOT_CONFIGURED" };
  }
  try {
    const res = await fetch(DEEPGRAM_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": mimeType,
      },
      body: new Uint8Array(audio),
    });
    if (!res.ok) {
      let errorCode: string | undefined;
      try {
        const eb = (await res.json()) as { err_code?: unknown };
        errorCode = safeIdent(eb.err_code);
      } catch {
        /* non-JSON error body — status alone drives classification */
      }
      const mapped = classifyDeepgramHttp(res.status, errorCode);
      logger.warn(
        {
          provider: "deepgram",
          status: res.status,
          ...(errorCode !== undefined ? { error_code: errorCode } : {}),
          code: mapped,
        },
        "stt transcription provider error",
      );
      return { ok: false, code: mapped, httpStatus: res.status };
    }
    const body = (await res.json()) as {
      results?: {
        channels?: Array<{ alternatives?: Array<{ transcript?: unknown }> }>;
      };
    };
    const raw = body.results?.channels?.[0]?.alternatives?.[0]?.transcript;
    const transcript = typeof raw === "string" ? raw.trim() : "";
    if (transcript.length === 0) {
      return { ok: false, code: "STT_NO_SPEECH", httpStatus: res.status };
    }
    return { ok: true, transcript, provider: "deepgram" };
  } catch (err) {
    logger.warn({ err, provider: "deepgram" }, "stt transcription failed");
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

/** Client input problems answer 422; provider/runtime problems 503. */
function httpStatusForFailure(code: TranscribeFailureCode): 422 | 503 {
  return code === "INVALID_AUDIO" ||
    code === "STT_BAD_AUDIO" ||
    code === "STT_NO_SPEECH"
    ? 422
    : 503;
}

// WHAT: Transcribe a desktop voice command for the authenticated
//       caller — OpenAI Whisper first, Deepgram fallback on
//       billing/rate-limit/unavailable — with one safe audit event.
// INPUT: caller entity id + base64 audio + MIME type.
// OUTPUT: transcript + winning provider (success) or a closed-vocab
//         failure + HTTP status.
// WHY: the single governed entry point the route calls. Audit is
//      written BEFORE the response per RULE 4; audio never persists.
export async function transcribeVoiceCommandForCaller(
  input: TranscribeInput,
): Promise<TranscribeForCallerResult> {
  // Decode + validate the audio entirely in memory (pre-flight).
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
        providers_attempted: [],
        failure_class: "INVALID_AUDIO",
        audio_bytes: audio.length,
      },
    });
    return { ok: false, httpStatus: 422, code: "INVALID_AUDIO" };
  }

  const attempted: TranscriptionProvider[] = [];
  const failureCodes: TranscribeFailureCode[] = [];
  let lastStatus: number | undefined;

  const openaiConfigured = hasKey("OPENAI_API_KEY");
  const deepgramConfigured = hasKey("DEEPGRAM_API_KEY");

  if (!openaiConfigured && !deepgramConfigured) {
    await writeAuditEvent({
      event_type: "AUDIO_CAPTURE_FAILED",
      outcome: "ERROR",
      actor_entity_id: input.callerEntityId,
      details: {
        providers_attempted: [],
        failure_class: "STT_NOT_CONFIGURED",
        audio_bytes: audio.length,
      },
    });
    return { ok: false, httpStatus: 503, code: "STT_NOT_CONFIGURED" };
  }

  // ── Provider 1: OpenAI Whisper (when configured) ──────────────
  if (openaiConfigured) {
    attempted.push("openai-whisper");
    const r = await callWhisperTranscription(audio, input.mimeType);
    if (r.ok) {
      return await succeed(input.callerEntityId, r.provider, attempted, audio.length, r.transcript.length, r.transcript);
    }
    failureCodes.push(r.code);
    lastStatus = r.httpStatus;
    // Only billing / rate-limit / unavailable justify trying Deepgram.
    // Auth / model / bad-audio / no-speech are definitive here.
    if (!FALLBACK_ELIGIBLE.has(r.code)) {
      return await fail(input.callerEntityId, attempted, r.code, lastStatus, audio.length);
    }
    if (!deepgramConfigured) {
      return await fail(input.callerEntityId, attempted, r.code, lastStatus, audio.length);
    }
    // fall through to Deepgram
  }

  // ── Provider 2: Deepgram (fallback, or sole provider) ─────────
  if (deepgramConfigured) {
    attempted.push("deepgram");
    const d = await callDeepgramTranscription(audio, input.mimeType);
    if (d.ok) {
      return await succeed(input.callerEntityId, d.provider, attempted, audio.length, d.transcript.length, d.transcript);
    }
    failureCodes.push(d.code);
    lastStatus = d.httpStatus ?? lastStatus;
  }

  // Whole chain failed — surface the clearest/most-actionable code.
  const finalCode = clearestFailure(failureCodes);
  return await fail(input.callerEntityId, attempted, finalCode, lastStatus, audio.length);
}

// WHAT: Write the SAFE success audit and return the success result.
// WHY: one place owns the audit shape so a transcript/audio can never
//      leak into the audit trail. `_transcript` is accepted only to
//      keep the call sites symmetric; its CONTENT is never recorded.
async function succeed(
  callerEntityId: string,
  provider: TranscriptionProvider,
  attempted: TranscriptionProvider[],
  audioBytes: number,
  transcriptChars: number,
  _transcript: string,
): Promise<TranscribeForCallerResult> {
  await writeAuditEvent({
    event_type: "AUDIO_CAPTURE_TRANSCRIBED",
    outcome: "SUCCESS",
    actor_entity_id: callerEntityId,
    details: {
      winning_provider: provider,
      providers_attempted: attempted,
      mode: "LIVE_MIC",
      audio_bytes: audioBytes,
      // Character count only — proves a transcript was produced
      // without ever recording its content (RULE 0).
      transcript_chars: transcriptChars,
    },
  });
  return { ok: true, httpStatus: 200, transcript: _transcript, provider };
}

// WHAT: Write the SAFE failure audit and return the failure result.
async function fail(
  callerEntityId: string,
  attempted: TranscriptionProvider[],
  code: TranscribeFailureCode,
  providerStatus: number | undefined,
  audioBytes: number,
): Promise<TranscribeForCallerResult> {
  await writeAuditEvent({
    event_type: "AUDIO_CAPTURE_FAILED",
    outcome: "ERROR",
    actor_entity_id: callerEntityId,
    details: {
      providers_attempted: attempted,
      failure_class: code,
      ...(providerStatus !== undefined ? { provider_status: providerStatus } : {}),
      audio_bytes: audioBytes,
    },
  });
  return { ok: false, httpStatus: httpStatusForFailure(code), code };
}
