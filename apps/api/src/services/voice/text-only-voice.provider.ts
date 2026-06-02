// FILE: text-only-voice.provider.ts
// PURPOSE: VF.2 baseline VoiceProviderAdapter per ADR-0085 §4
//          adapter slot #1. TextOnlyVoiceProvider accepts typed
//          input and emits typed output; verifies the entire
//          voice-intent pipeline without any audio dependency.
//          Always available; no secrets required; no env-var gate.
//          Used in CI + unit tests + dev environments + customer
//          environments where voice is intentionally disabled.
//
// PRIVACY INVARIANT:
//   - The provider boundary NEVER receives caller_entity_id /
//     tenant_org_entity_id / source_surface. Those live at the
//     envelope-construction tier (voice-intent-envelope.ts).
//   - On error, message is a short scrubbed summary; never
//     includes any secret (this adapter doesn't have any to
//     leak, but the discipline is preserved for adapter parity).
// CONNECTS TO:
//   - apps/api/src/services/voice/voice-provider.service.ts
//     (VoiceProviderAdapter interface + AudioRef + Result types)

import type {
  AudioRef,
  SynthesizeResult,
  TranscribeResult,
  VoiceProviderAdapter,
} from "./voice-provider.service.js";

// WHAT: Production class — TextOnlyVoiceProvider.
// INPUT: AudioRef wrapping a typed text_only_payload string.
// OUTPUT: TranscribeResult containing the payload as the
//          transcript verbatim.
// WHY: Validates the entire voice-intent envelope flow without
//      any audio dependency. CI and dev always use this provider.
export class TextOnlyVoiceProvider implements VoiceProviderAdapter {
  async transcribe(audio_ref: AudioRef): Promise<TranscribeResult> {
    const payload = audio_ref.text_only_payload;
    if (typeof payload !== "string") {
      return {
        ok: false,
        error_class: "VALIDATION",
        message:
          "text_only_voice: audio_ref.text_only_payload required (string)",
      };
    }
    if (payload.length === 0) {
      return {
        ok: false,
        error_class: "VALIDATION",
        message:
          "text_only_voice: audio_ref.text_only_payload must be non-empty",
      };
    }
    return {
      ok: true,
      transcript_text: payload,
      redacted: false,
      mode: "fixture",
    };
  }

  async synthesize(text: string, voice_id: string): Promise<SynthesizeResult> {
    if (typeof text !== "string" || text.length === 0) {
      return {
        ok: false,
        error_class: "VALIDATION",
        message: "text_only_voice: text must be a non-empty string",
      };
    }
    if (typeof voice_id !== "string" || voice_id.length === 0) {
      return {
        ok: false,
        error_class: "VALIDATION",
        message: "text_only_voice: voice_id must be a non-empty string",
      };
    }
    // For the text-only adapter, "synthesizing" is identity-equal
    // to the input — the audio_ref carries the typed payload back
    // through so a CT surface that calls synthesize() can render
    // the typed text as the spoken response without ever invoking
    // a real TTS engine.
    return {
      ok: true,
      audio_ref: { text_only_payload: text },
      mode: "fixture",
    };
  }
}
