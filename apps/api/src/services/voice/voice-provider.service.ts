// FILE: voice-provider.service.ts
// PURPOSE: VF.2 voice-first runtime substrate per ADR-0085 §4 +
//          §8. Canonical VoiceProviderAdapter interface + 4 closed-
//          vocab adapter slot enum (TEXT_ONLY / LOCAL_MOCK / SESAME
//          / FUTURE) + dispatch factory mirroring
//          getConnectorProviderAsync (connector.service.ts:332).
//          Concrete adapters live in sibling files:
//            - text-only-voice.provider.ts (VF.2 baseline; this PR)
//            - local-mock-voice.provider.ts (VF.3 forward-substrate)
//            - sesame-voice.provider.ts (VF.6 forward-substrate;
//              Founder-gated per ADR-0085 §8)
//          The dispatch is fail-closed: unknown VoiceProviderType
//          values default to TEXT_ONLY (safest fallback — typed
//          input only, never reaches Sesame).
//
// PRIVACY INVARIANT (locked by ADR-0085 §4):
//   - The provider boundary NEVER receives caller_entity_id /
//     tenant_org_entity_id / source_surface. Those live at the
//     envelope-construction tier (voice-intent-envelope.ts), not
//     at the provider boundary. The provider sees only opaque
//     audio_ref / text payload + voice_id.
//   - Error messages NEVER echo the access token / API key /
//     OAuth bearer.
//   - Failure codes are closed-vocab; mirrors ConnectorProvider.
// CONNECTS TO:
//   - apps/api/src/services/voice/text-only-voice.provider.ts
//   - apps/api/src/services/voice/voice-intent-envelope.ts
//   - apps/api/src/services/connector/connector.service.ts (the
//     ConnectorProvider precedent the adapter pattern mirrors)
//   - docs/architecture/decisions/0085-voice-first-product-doctrine.md
//   - docs/voice-first/voice-provider-adapter.md

// WHAT: Closed-vocab adapter slot enum per ADR-0085 §4. Adding a
//        new slot requires an ADR amendment per RULE 20.
// INPUT: Used as a discriminated string-literal union.
// OUTPUT: None — type only.
// WHY: Mirrors ConnectorType union pattern; same fail-closed
//      discipline for dispatch.
export type VoiceProviderType =
  | "TEXT_ONLY" // VF.2 baseline; typed input → envelope
  | "LOCAL_MOCK" // VF.3 forward-substrate; deterministic fixture mode
  | "SESAME" // VF.6 forward-substrate; Founder-gated
  | "FUTURE"; // VF.6+ forward-substrate; adapter seam for vendor evolution

// WHAT: Opaque audio reference. Wraps an STT input payload that
//        could be raw audio bytes (real adapters), a typed text
//        string (text-only adapter), or a fixture key (local mock
//        adapter). The provider boundary owns interpretation of
//        the ref; downstream services see only the result.
// INPUT: Used as a parameter type.
// OUTPUT: None.
// WHY: Decouples the envelope-construction service from the
//      concrete audio substrate. VF.2 ships with text_only_payload
//      ONLY; raw bytes substrate forward-substrate to VF.6.
export interface AudioRef {
  text_only_payload?: string;
  fixture_key?: string;
}

// WHAT: STT result discriminated union.
// INPUT: Used as a return type.
// OUTPUT: None.
// WHY: 8-code closed-vocab failure enum mirrors ConnectorProvider
//      (the connector + voice substrate share the same failure-
//      classification discipline per ADR-0085 §4).
export type TranscribeResult =
  | {
      ok: true;
      transcript_text: string;
      redacted: boolean;
      mode: "fixture" | "real";
    }
  | {
      ok: false;
      error_class: VoiceErrorClass;
      message: string;
    };

// WHAT: TTS result discriminated union.
export type SynthesizeResult =
  | {
      ok: true;
      audio_ref: AudioRef;
      mode: "fixture" | "real";
    }
  | {
      ok: false;
      error_class: VoiceErrorClass;
      message: string;
    };

// WHAT: Closed-vocab voice provider error classes. Mirrors
//        ConnectorResult error_class verbatim.
// INPUT: Used as a discriminated string-literal union.
// OUTPUT: None.
// WHY: A second hardened failure classification would diverge from
//      ConnectorProvider; shared 8-code vocabulary keeps both
//      substrates auditable through the same error taxonomy.
export type VoiceErrorClass =
  | "AUTH"
  | "RATE_LIMIT"
  | "PROVIDER_ERROR"
  | "NETWORK"
  | "TIMEOUT"
  | "VALIDATION"
  | "NOT_CONFIGURED"
  | "DISABLED";

// WHAT: The canonical VoiceProviderAdapter interface per ADR-0085 §4.
// INPUT: None — interface declaration.
// OUTPUT: None.
// WHY: Two methods — transcribe (STT) + synthesize (TTS) — keep the
//      surface minimal at VF.2; richer streaming + diarization
//      forward-substrate per ADR-0085 §4 out-of-scope inventory.
export interface VoiceProviderAdapter {
  transcribe(audio_ref: AudioRef): Promise<TranscribeResult>;
  synthesize(text: string, voice_id: string): Promise<SynthesizeResult>;
}

// WHAT: Dispatch factory — returns the concrete provider for a
//        given VoiceProviderType. Mirrors getConnectorProviderAsync
//        (connector.service.ts:332).
// INPUT: VoiceProviderType.
// OUTPUT: Promise<VoiceProviderAdapter>.
// WHY: Dynamic-import pattern avoids circular dependencies between
//      this file and the concrete provider modules. TEXT_ONLY is
//      always the fail-closed default — unknown types collapse to
//      TextOnlyVoiceProvider (typed input only; never reaches
//      Sesame or any external vendor).
export async function getVoiceProviderAsync(
  type: VoiceProviderType,
): Promise<VoiceProviderAdapter> {
  if (type === "TEXT_ONLY") {
    const mod = await import("./text-only-voice.provider.js");
    return new mod.TextOnlyVoiceProvider();
  }
  if (type === "LOCAL_MOCK") {
    // VF.3 LANDED per ADR-0085 §8: LocalMockVoiceProvider is now
    // a real concrete adapter (apps/api/src/services/voice/
    // local-mock-voice.provider.ts). Tests + dev environments can
    // dispatch through this slot for richer fixture transcripts +
    // 8-code forced-failure fixture-key dispatch than
    // TextOnlyVoiceProvider provides.
    const mod = await import("./local-mock-voice.provider.js");
    return new mod.LocalMockVoiceProvider();
  }
  if (type === "SESAME") {
    // Forward-substrate to VF.6 per ADR-0085 §8.
    // Requires explicit Founder authorization per the Sesame
    // readiness assessment closeout (docs/voice-first/sesame-
    // readiness-assessment.md). Until that authorization lands,
    // dispatch falls back to TEXT_ONLY rather than calling the
    // real Sesame API.
    const mod = await import("./text-only-voice.provider.js");
    return new mod.TextOnlyVoiceProvider();
  }
  if (type === "FUTURE") {
    // Adapter seam for any vendor that emerges. Until a concrete
    // FutureVoiceProvider lands, dispatch falls back to TEXT_ONLY.
    const mod = await import("./text-only-voice.provider.js");
    return new mod.TextOnlyVoiceProvider();
  }
  // Unknown VoiceProviderType: fail-closed to TEXT_ONLY. This
  // mirrors the safe-default discipline at getConnectorProviderAsync
  // (connector.service.ts) where unknown types fall back to the
  // FixtureBasedConnectorProvider rather than throwing.
  const mod = await import("./text-only-voice.provider.js");
  return new mod.TextOnlyVoiceProvider();
}

// WHAT: Closed-vocab list of all VoiceProviderType values. Used by
//        the frozen-anchor unit test to assert no new types were
//        added without an ADR-0085 amendment (per RULE 20).
// INPUT: None.
// OUTPUT: Readonly tuple.
// WHY: Mirrors the CONNECTOR_REGISTRY frozen-anchor pattern.
export const VOICE_PROVIDER_TYPES: ReadonlyArray<VoiceProviderType> =
  Object.freeze(["TEXT_ONLY", "LOCAL_MOCK", "SESAME", "FUTURE"] as const);
