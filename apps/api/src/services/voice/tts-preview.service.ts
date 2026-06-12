// FILE: tts-preview.service.ts
// PURPOSE: Phase 1259 — the PREMIUM voice runtime. Turns text into
//          actual provider audio (ElevenLabs first) so the voice the
//          Founder hears is no longer browser TTS. Pronunciation is
//          enforced server-side: the product is SPELLED "Otzar" but
//          SPOKEN "OatZar" — only the TTS payload is transformed,
//          never stored or displayed text.
//
//          Provider priority: ElevenLabs (premium) when
//          ELEVENLABS_API_KEY exists. OpenAI audio is deliberately
//          NOT in the chain while the account returns 429 (billing);
//          the client's browser TTS remains the clearly-labeled
//          fallback, decided client-side when this service says
//          unavailable. No raw key, no raw provider error ever
//          leaves this module.
// CONNECTS TO: apps/api/src/routes/otzar-voice-tts.routes.ts,
//          otzar-control-tower src/lib/voice/premium-tts.ts,
//          tests/unit/tts-preview.test.ts.

import { logger } from "../../logger.js";

/** Bounded preview/assistant utterances — premium TTS is metered. */
export const TTS_MAX_TEXT_LENGTH = 600;

/** Configurable voice; default is a widely-available ElevenLabs
 *  stock voice (warm, calm register). Operators can pin their own
 *  original Otzar voice via ELEVENLABS_VOICE_ID — never a clone of
 *  any person or protected voice. */
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";
const DEFAULT_MODEL_ID = "eleven_turbo_v2_5";

// WHAT: TTS-payload-only pronunciation transform.
// INPUT: display text (spelling: Otzar).
// OUTPUT: spoken text (pronunciation: OatZar).
// WHY: PRONUNCIATION LAW — audio says "OatZar"; UI/storage never
//      changes spelling.
export function prepareTextForTts(text: string): string {
  return text.replace(/\bOtzar\b/g, "OatZar");
}

export type TtsPreviewResult =
  | {
      ok: true;
      audio: Buffer;
      content_type: "audio/mpeg";
      provider: "ELEVENLABS";
      voice_id: string;
    }
  | { ok: false; code: "TTS_NOT_CONFIGURED" | "TTS_PROVIDER_UNAVAILABLE" };

// WHAT: Generate premium speech audio for a short utterance.
// INPUT: display text (will be pronunciation-transformed) + optional
//        voice override.
// OUTPUT: MP3 bytes from ElevenLabs, or a closed-vocab failure the
//         client maps to its honest fallback copy.
// WHY: "configured" is not "premium" — this is the call that makes
//      the app actually sound like Otzar.
export async function generateTtsPreview(input: {
  text: string;
  voiceId?: string;
}): Promise<TtsPreviewResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (apiKey === undefined || apiKey.length === 0) {
    return { ok: false, code: "TTS_NOT_CONFIGURED" };
  }
  const voiceId =
    input.voiceId ?? process.env.ELEVENLABS_VOICE_ID ?? DEFAULT_VOICE_ID;
  const modelId = process.env.ELEVENLABS_MODEL_ID ?? DEFAULT_MODEL_ID;
  const spoken = prepareTextForTts(input.text).slice(0, TTS_MAX_TEXT_LENGTH);
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
          // Warm/calm premium register per the Otzar voice persona.
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
      // Redacted: status only — never the provider body (it can echo
      // request content) and never the key.
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
