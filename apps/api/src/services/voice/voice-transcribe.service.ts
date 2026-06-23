// FILE: voice-transcribe.service.ts
// PURPOSE: [OTZAR-V1-LIVE-4A-FOUNDATION] Real inline speech-to-text for the
//   live-mic / desktop / browser-fallback path. The Otzar client records a short
//   utterance (MediaRecorder) and POSTs { audio_base64, mime_type }; this service
//   transcribes it with a server-side, repo-native STT provider and returns the
//   transcript TEXT only.
//
//   v1 PROVIDER: ElevenLabs (Scribe) is the selected v1 voice provider — one
//   coherent provider for both speech-in (this service) and speak-back (TTS).
//   Deepgram remains an explicit, non-default secondary (VOICE_STT_PROVIDER=
//   deepgram) for a future streaming/cost path; it is never the default.
//
// WHY THIS EXISTS: the browser Web Speech path already produces a transcript in a
//   secure (HTTPS) Chrome context, but Tauri WKWebView, Firefox, and non-secure
//   contexts have no Web Speech — and the client's POST to /otzar/voice/transcribe
//   previously had NO Foundation handler (a dead call).
//
// GOVERNANCE / PRIVACY:
//   - Raw audio lives in memory for the single provider call only. It is NEVER
//     persisted (no DB write, no capsule, no file). Otzar keeps transcript text.
//   - This service ONLY transcribes. It creates no MemoryCapsule, executes no
//     work, and routes nothing — the transcript re-enters the governed Twin/work
//     loop through the existing client surfaces (Ask Twin / ambient bar).
//   - Provider keys are server-side only; they never reach the client and are
//     never returned in any response.
//   - Honest when unconfigured: VOICE_STT_PROVIDER_NOT_CONFIGURED (no fake text).

/** Stable code returned when no real server-side STT provider is configured. */
export const VOICE_STT_PROVIDER_NOT_CONFIGURED = "VOICE_STT_PROVIDER_NOT_CONFIGURED";

/** Decoded-audio ceiling for a short push-to-talk utterance (8 MB). */
export const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

/** Container/codec allowlist for browser MediaRecorder + common uploads. */
export const ALLOWED_AUDIO_MIME = new Set<string>([
  "audio/webm",
  "audio/ogg",
  "audio/wav",
  "audio/x-wav",
  "audio/mp4",
  "audio/mpeg",
  "audio/m4a",
  "audio/x-m4a",
]);

export type TranscribeResult =
  | { ok: true; transcript: string; provider: string }
  | {
      ok: false;
      code:
        | "VOICE_STT_PROVIDER_NOT_CONFIGURED"
        | "UNSUPPORTED_STT_PROVIDER"
        | "INVALID_AUDIO_TYPE"
        | "AUDIO_TOO_LARGE"
        | "EMPTY_AUDIO"
        | "PROVIDER_ERROR";
      message: string;
    };

/** A server-side STT call over inline audio bytes. Injected in tests; the real
 *  implementations (ElevenLabs / Deepgram) run only when a key is configured. */
export interface InlineSttProvider {
  name: string;
  call: (audio: Buffer, mimeType: string) => Promise<string>;
}

export type SttSelection =
  | { ok: true; provider: InlineSttProvider }
  | { ok: false; code: "VOICE_STT_PROVIDER_NOT_CONFIGURED" | "UNSUPPORTED_STT_PROVIDER" };

// WHAT: pick the configured server-side STT provider from env (ElevenLabs-first).
// INPUT: process.env (overridable for tests).
// OUTPUT: a provider, or an honest error code (not-configured / unsupported).
// WHY: v1 uses ElevenLabs. VOICE_STT_PROVIDER pins a choice; if unset, ElevenLabs
//      wins when its key is present (then Deepgram). An explicit provider with no
//      key is "not configured"; an unknown provider name is "unsupported".
export function selectInlineSttProvider(
  env: NodeJS.ProcessEnv = process.env,
): SttSelection {
  const pref = (env.VOICE_STT_PROVIDER ?? "").trim().toLowerCase();
  const hasEleven = (env.ELEVENLABS_API_KEY ?? "").length > 10;
  const hasDeepgram = (env.DEEPGRAM_API_KEY ?? "").length > 10;

  if (pref === "elevenlabs") {
    return hasEleven
      ? { ok: true, provider: elevenLabsProvider() }
      : { ok: false, code: "VOICE_STT_PROVIDER_NOT_CONFIGURED" };
  }
  if (pref === "deepgram") {
    return hasDeepgram
      ? { ok: true, provider: deepgramProvider() }
      : { ok: false, code: "VOICE_STT_PROVIDER_NOT_CONFIGURED" };
  }
  if (pref !== "") {
    return { ok: false, code: "UNSUPPORTED_STT_PROVIDER" };
  }
  // Auto: ElevenLabs first (the v1 provider), then Deepgram if only it is set.
  if (hasEleven) return { ok: true, provider: elevenLabsProvider() };
  if (hasDeepgram) return { ok: true, provider: deepgramProvider() };
  return { ok: false, code: "VOICE_STT_PROVIDER_NOT_CONFIGURED" };
}

function extFor(mime: string): string {
  if (mime.includes("wav")) return "wav";
  if (mime.includes("mp4") || mime.includes("m4a")) return "m4a";
  if (mime.includes("mpeg")) return "mp3";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
}

// ElevenLabs Speech-to-Text (Scribe). Multipart body is built manually as a
// Buffer so it does not depend on DOM-only FormData/Blob/BlobPart typings — fully
// typed against Node's Buffer. Model is overridable via ELEVENLABS_STT_MODEL.
function elevenLabsProvider(): InlineSttProvider {
  return {
    name: "ELEVENLABS",
    call: async (audio, mimeType) => {
      const model =
        (process.env.ELEVENLABS_STT_MODEL ?? "").trim() || "scribe_v1";
      const boundary = "----OtzarSTTBoundary7MA4YWxkTrZu0gW";
      const CRLF = "\r\n";
      const pre = Buffer.from(
        `--${boundary}${CRLF}` +
          `Content-Disposition: form-data; name="file"; filename="utterance.${extFor(mimeType)}"${CRLF}` +
          `Content-Type: ${mimeType}${CRLF}${CRLF}`,
        "utf8",
      );
      const between = Buffer.from(
        `${CRLF}--${boundary}${CRLF}` +
          `Content-Disposition: form-data; name="model_id"${CRLF}${CRLF}` +
          model,
        "utf8",
      );
      const post = Buffer.from(`${CRLF}--${boundary}--${CRLF}`, "utf8");
      const init = {
        method: "POST",
        headers: {
          "xi-api-key": process.env.ELEVENLABS_API_KEY ?? "",
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
        },
        body: Buffer.concat([pre, audio, between, post]),
      } as unknown as Parameters<typeof fetch>[1];
      const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", init);
      if (!res.ok) throw new Error(`elevenlabs_http_${res.status}`);
      // Sanitized: only the transcript text is read; no raw provider response,
      // no word-level timestamps are surfaced.
      const json = (await res.json()) as { text?: string };
      return json.text ?? "";
    },
  };
}

// Deepgram (non-default secondary). Accepts the raw bytes directly.
function deepgramProvider(): InlineSttProvider {
  return {
    name: "DEEPGRAM",
    call: async (audio, mimeType) => {
      const init = {
        method: "POST",
        headers: {
          Authorization: `Token ${process.env.DEEPGRAM_API_KEY ?? ""}`,
          "Content-Type": mimeType,
        },
        body: audio,
      } as unknown as Parameters<typeof fetch>[1];
      const res = await fetch(
        "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true",
        init,
      );
      if (!res.ok) throw new Error(`deepgram_http_${res.status}`);
      const json = (await res.json()) as {
        results?: {
          channels?: Array<{ alternatives?: Array<{ transcript?: string }> }>;
        };
      };
      return json.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
    },
  };
}

// WHAT: transcribe one inline base64 utterance to text.
// INPUT: { audioBase64, mimeType }; opts.provider overrides selection (tests).
// OUTPUT: TranscribeResult — transcript text on success, an honest code otherwise.
// WHY: the real speech-to-Otzar path for non-Web-Speech contexts. Validates
//      type + size, never persists audio, never executes work.
export async function transcribeInlineAudio(
  input: { audioBase64: string; mimeType: string },
  opts: { provider?: InlineSttProvider | null } = {},
): Promise<TranscribeResult> {
  const mime = input.mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!ALLOWED_AUDIO_MIME.has(mime)) {
    return {
      ok: false,
      code: "INVALID_AUDIO_TYPE",
      message: `Unsupported audio type "${input.mimeType}".`,
    };
  }
  let audio: Buffer;
  try {
    audio = Buffer.from(input.audioBase64, "base64");
  } catch {
    return { ok: false, code: "EMPTY_AUDIO", message: "Audio could not be decoded." };
  }
  if (audio.length === 0) {
    return { ok: false, code: "EMPTY_AUDIO", message: "No audio was provided." };
  }
  if (audio.length > MAX_AUDIO_BYTES) {
    return {
      ok: false,
      code: "AUDIO_TOO_LARGE",
      message: "Audio exceeds the maximum size for a single utterance.",
    };
  }

  let provider: InlineSttProvider;
  if (opts.provider !== undefined) {
    if (opts.provider === null) {
      return {
        ok: false,
        code: "VOICE_STT_PROVIDER_NOT_CONFIGURED",
        message:
          "No server-side speech provider is configured. Set VOICE_STT_PROVIDER=elevenlabs + ELEVENLABS_API_KEY, or use a browser with built-in speech recognition.",
      };
    }
    provider = opts.provider;
  } else {
    const selection = selectInlineSttProvider();
    if (!selection.ok) {
      return selection.code === "UNSUPPORTED_STT_PROVIDER"
        ? {
            ok: false,
            code: "UNSUPPORTED_STT_PROVIDER",
            message: "The configured speech provider is not supported.",
          }
        : {
            ok: false,
            code: "VOICE_STT_PROVIDER_NOT_CONFIGURED",
            message:
              "No server-side speech provider is configured. Set VOICE_STT_PROVIDER=elevenlabs + ELEVENLABS_API_KEY, or use a browser with built-in speech recognition.",
          };
    }
    provider = selection.provider;
  }

  try {
    const transcript = (await provider.call(audio, mime)).trim();
    // `audio` is a local Buffer only; it is now out of scope and never persisted.
    return { ok: true, transcript, provider: provider.name };
  } catch {
    return {
      ok: false,
      code: "PROVIDER_ERROR",
      message: "The speech provider could not transcribe the audio.",
    };
  }
}
