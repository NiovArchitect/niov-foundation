// FILE: tts-preview.service.ts
// PURPOSE: Premium voice runtime. Turns text into provider audio
//          (xAI Orion first when configured, then ElevenLabs) so
//          Otzar does not rely on browser TTS as the primary path.
//          Pronunciation is enforced server-side: the product is
//          SPELLED "Otzar" but SPOKEN "OatZar" — only the TTS payload
//          is transformed, never stored or displayed text.
//
//          Provider priority:
//            1. xAI TTS (voice_id orion by default) when XAI_API_KEY
//               is set and XAI_TTS_ENABLED is not false
//            2. ElevenLabs when ELEVENLABS_API_KEY is set
//            3. TTS_NOT_CONFIGURED → client-labeled browser fallback
//
//          No raw key, no raw provider error ever leaves this module.
// CONNECTS TO: apps/api/src/routes/otzar-voice-tts.routes.ts,
//          otzar-control-tower src/lib/voice/premium-tts.ts,
//          tests/unit/tts-preview.test.ts.

import { logger } from "../../logger.js";

/** Bounded preview/assistant utterances — premium TTS is metered. */
export const TTS_MAX_TEXT_LENGTH = 800;

/** Founder-selected primary Otzar voice on xAI. */
export const XAI_DEFAULT_VOICE_ID = "orion";

/** ElevenLabs premade fallback voice (Sarah). */
const ELEVEN_DEFAULT_VOICE_ID = "EXAVITQu4vr4xnSDxMaL";
const ELEVEN_DEFAULT_MODEL_ID = "eleven_turbo_v2_5";

const XAI_DEFAULT_BASE_URL = "https://api.x.ai/v1";

// WHAT: TTS-payload-only pronunciation transform.
// INPUT: display text (spelling: Otzar).
// OUTPUT: spoken text (pronunciation: OatZar).
// WHY: PRONUNCIATION LAW — audio says "OatZar"; UI/storage never
//      changes spelling.
export function prepareTextForTts(text: string): string {
  return text.replace(/\bOtzar\b/g, "OatZar");
}

export type TtsProviderName = "XAI" | "ELEVENLABS";

export type TtsPreviewResult =
  | {
      ok: true;
      audio: Buffer;
      content_type: "audio/mpeg";
      provider: TtsProviderName;
      voice_id: string;
    }
  | { ok: false; code: "TTS_NOT_CONFIGURED" | "TTS_PROVIDER_UNAVAILABLE" };

// WHAT: Whether xAI TTS is allowed in the production voice path.
// INPUT: XAI_TTS_ENABLED env (default true when unset).
// OUTPUT: boolean.
// WHY: Operators can disable xAI voice without removing the LLM key.
export function isXaiTtsEnabled(): boolean {
  const flag = (process.env.XAI_TTS_ENABLED ?? "true").toLowerCase();
  return flag !== "false" && flag !== "0" && flag !== "no" && flag !== "off";
}

function xaiConfigured(): boolean {
  const key = process.env.XAI_API_KEY;
  return (
    isXaiTtsEnabled() &&
    typeof key === "string" &&
    key.length > 0 &&
    !key.startsWith("test-stub")
  );
}

function elevenConfigured(): boolean {
  const key = process.env.ELEVENLABS_API_KEY;
  return typeof key === "string" && key.length > 0;
}

// WHAT: Synthesize speech via official xAI TTS (Orion preferred).
// INPUT: spoken text + optional voice override.
// OUTPUT: TtsPreviewResult.
// WHY: Founder-selected premium voice; keys stay server-side only.
async function synthesizeWithXai(
  spoken: string,
  voiceId: string,
): Promise<TtsPreviewResult> {
  const apiKey = process.env.XAI_API_KEY;
  if (apiKey === undefined || apiKey.length === 0) {
    return { ok: false, code: "TTS_NOT_CONFIGURED" };
  }
  const base =
    (process.env.XAI_BASE_URL ?? XAI_DEFAULT_BASE_URL).replace(/\/$/, "");
  const language =
    typeof process.env.XAI_TTS_LANGUAGE === "string" &&
    process.env.XAI_TTS_LANGUAGE.length > 0
      ? process.env.XAI_TTS_LANGUAGE
      : "en";
  try {
    const res = await fetch(`${base}/tts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: spoken,
        voice_id: voiceId,
        language,
      }),
    });
    if (!res.ok) {
      logger.warn(
        { provider: "XAI", status: res.status, voice_id: voiceId },
        "tts preview xai provider error",
      );
      return { ok: false, code: "TTS_PROVIDER_UNAVAILABLE" };
    }
    const audio = Buffer.from(await res.arrayBuffer());
    if (audio.length === 0) {
      return { ok: false, code: "TTS_PROVIDER_UNAVAILABLE" };
    }
    return {
      ok: true,
      audio,
      content_type: "audio/mpeg",
      provider: "XAI",
      voice_id: voiceId,
    };
  } catch (err) {
    logger.warn({ err, provider: "XAI" }, "tts preview xai fetch failed");
    return { ok: false, code: "TTS_PROVIDER_UNAVAILABLE" };
  }
}

// WHAT: Synthesize speech via ElevenLabs (fallback seat).
// INPUT: spoken text + optional voice override.
// OUTPUT: TtsPreviewResult.
// WHY: Preserve existing premium path when xAI is unavailable.
async function synthesizeWithElevenLabs(
  spoken: string,
  voiceId: string,
): Promise<TtsPreviewResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (apiKey === undefined || apiKey.length === 0) {
    return { ok: false, code: "TTS_NOT_CONFIGURED" };
  }
  const modelId = process.env.ELEVENLABS_MODEL_ID ?? ELEVEN_DEFAULT_MODEL_ID;
  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: spoken,
          model_id: modelId,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.25,
            use_speaker_boost: true,
          },
        }),
      },
    );
    if (!res.ok) {
      logger.warn(
        { provider: "ELEVENLABS", status: res.status },
        "tts preview provider error",
      );
      return { ok: false, code: "TTS_PROVIDER_UNAVAILABLE" };
    }
    const audio = Buffer.from(await res.arrayBuffer());
    if (audio.length === 0) {
      return { ok: false, code: "TTS_PROVIDER_UNAVAILABLE" };
    }
    return {
      ok: true,
      audio,
      content_type: "audio/mpeg",
      provider: "ELEVENLABS",
      voice_id: voiceId,
    };
  } catch (err) {
    logger.warn({ err, provider: "ELEVENLABS" }, "tts preview fetch failed");
    return { ok: false, code: "TTS_PROVIDER_UNAVAILABLE" };
  }
}

// WHAT: Generate premium speech audio for a short utterance.
// INPUT: display text (will be pronunciation-transformed) + optional
//        voice override.
// OUTPUT: MP3 bytes from xAI or ElevenLabs, or a closed-vocab failure
//         the client maps to its honest fallback copy.
// WHY: Founder selected Orion as preferred Otzar voice; ElevenLabs
//      remains the fallback when xAI is down or disabled.
export async function generateTtsPreview(input: {
  text: string;
  voiceId?: string;
}): Promise<TtsPreviewResult> {
  const spoken = prepareTextForTts(input.text).slice(0, TTS_MAX_TEXT_LENGTH);

  // Preferred path: xAI Orion (or explicit xAI voice id).
  if (xaiConfigured()) {
    const xaiVoice =
      input.voiceId &&
      // Client may still send ElevenLabs UUID-style IDs; only honor
      // short/name-like overrides for xAI. Otherwise use Orion.
      !/^[0-9a-f-]{20,}$/i.test(input.voiceId)
        ? input.voiceId
        : (process.env.XAI_TTS_VOICE_ID ?? XAI_DEFAULT_VOICE_ID);
    const xai = await synthesizeWithXai(spoken, xaiVoice);
    if (xai.ok) return xai;
    // Fall through to ElevenLabs if configured.
    logger.warn(
      { code: xai.ok === false ? xai.code : "unknown" },
      "tts xai unavailable; trying elevenlabs fallback",
    );
  }

  if (elevenConfigured()) {
    const elevenVoice =
      input.voiceId && /^[0-9a-f-]{20,}$/i.test(input.voiceId)
        ? input.voiceId
        : (process.env.ELEVENLABS_VOICE_ID ?? ELEVEN_DEFAULT_VOICE_ID);
    return synthesizeWithElevenLabs(spoken, elevenVoice);
  }

  return { ok: false, code: "TTS_NOT_CONFIGURED" };
}
