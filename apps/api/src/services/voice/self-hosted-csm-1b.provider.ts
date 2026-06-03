// FILE: self-hosted-csm-1b.provider.ts
// PURPOSE: ADR-0089 §5 SelfHostedCsm1bVoiceProvider seat — the
//          adapter seam that ADR-0089 VS5 will eventually fill
//          with real CSM-1B inference via the Foundation-internal
//          HTTP boundary spec'd at VS4.
//
//          At THIS slice (per [FOUNDER-AUTH — CONTINUE AUTONOMOUS
//          LEI RUNTIME BUILD] authorized "SelfHostedCsm1bProvider
//          seam") the implementation delegates to
//          LocalMockVoiceProvider for actual transcription +
//          synthesis. NO real CSM-1B inference. NO real audio.
//          NO model weights downloaded. NO PyTorch / CUDA /
//          transformers / Llama-3.2-1B / Mimi runtime
//          dependencies. NO microphone capture. NO production
//          audio retention.
//
//          The seat exists so that:
//            1. ADR-0085 SESAME VoiceProviderType dispatch has a
//               concrete adapter to bind to when VS5 lands (no
//               dispatch-table churn at VS5)
//            2. Integration tests can wire SelfHostedCsm1bVoiceProvider
//               at the seat tier without altering the dispatch
//               factory
//            3. Foundation-internal HTTP boundary spec at VS4
//               replaces the LocalMockVoiceProvider delegate with
//               a real HTTP client without touching consumers
//
//          The `mode` field on every result is "fixture" at this
//          slice; VS5 will introduce "real" when the inference
//          service lands. Consumers MUST handle both values per
//          ADR-0085 §4 contract.
//
// CONNECTS TO:
//   - apps/api/src/services/voice/voice-provider.service.ts
//     (VoiceProviderAdapter interface + AudioRef + TranscribeResult +
//      SynthesizeResult)
//   - apps/api/src/services/voice/local-mock-voice.provider.ts
//     (LocalMockVoiceProvider delegate at this slice)
//   - ADR-0089 §5 VoiceProviderAdapter integration architecture
//   - ADR-0089 §9 VS1-VS10 ladder (this is the seat VS5 will fill)

import { LocalMockVoiceProvider } from "./local-mock-voice.provider.js";
import type {
  AudioRef,
  SynthesizeResult,
  TranscribeResult,
  VoiceProviderAdapter,
} from "./voice-provider.service.js";

// WHAT: The SelfHostedCsm1bVoiceProvider concrete adapter that
//        implements VoiceProviderAdapter per ADR-0085 §4.
// INPUT: Optional inner provider for dependency injection (defaults
//        to LocalMockVoiceProvider at this slice). VS5 will pass a
//        real CSM-1B HTTP client through the same DI hook.
// OUTPUT: A VoiceProviderAdapter instance.
// WHY: The seat-shaped design lets VS5 land a real CSM-1B client
//      via the same constructor signature without changing
//      consumers. Until VS5 fires, every result returns
//      `mode: "fixture"` so consumers never confuse a mock
//      output for real CSM-1B audio.
export class SelfHostedCsm1bVoiceProvider implements VoiceProviderAdapter {
  private readonly inner: VoiceProviderAdapter;

  constructor(inner?: VoiceProviderAdapter) {
    this.inner = inner ?? new LocalMockVoiceProvider();
  }

  // WHAT: STT entry. At this slice delegates to the inner provider.
  //        VS5 will replace this with a real HTTP call to the
  //        Foundation-internal CSM-1B inference service.
  // INPUT: AudioRef per ADR-0085 §4.
  // OUTPUT: TranscribeResult discriminated union.
  // WHY: Bounded scope at this slice — preserve consumer contract
  //      verbatim. The result's `mode` is downgraded to "fixture"
  //      regardless of the inner provider's reported mode so
  //      consumers cannot confuse a seat-tier mock for real
  //      CSM-1B inference.
  async transcribe(audio_ref: AudioRef): Promise<TranscribeResult> {
    const r = await this.inner.transcribe(audio_ref);
    if (r.ok === false) return r;
    return { ...r, mode: "fixture" };
  }

  // WHAT: TTS entry. At this slice delegates to the inner provider.
  //        VS5 will replace this with a real HTTP call to the
  //        Foundation-internal CSM-1B inference service.
  // INPUT: text + voice_id per ADR-0085 §4.
  // OUTPUT: SynthesizeResult discriminated union.
  // WHY: Bounded scope at this slice — preserve consumer contract
  //      verbatim. The result's `mode` is downgraded to "fixture"
  //      regardless of the inner provider's reported mode.
  async synthesize(
    text: string,
    voice_id: string,
  ): Promise<SynthesizeResult> {
    const r = await this.inner.synthesize(text, voice_id);
    if (r.ok === false) return r;
    return { ...r, mode: "fixture" };
  }
}
