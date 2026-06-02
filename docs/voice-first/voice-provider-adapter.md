# `VoiceProviderAdapter` — Proposed Architecture

Per ADR-0085 §4. The adapter seam keeps Otzar from being irreversibly bound to Sesame at the runtime layer even though Sesame is the intended primary voice partner at the product layer.

## Interface

```typescript
// Pseudocode — actual TypeScript types land at VF.2 per ADR-0085 §8.

export type VoiceProviderType =
  | "TEXT_ONLY"      // VF.2 baseline; typed input → voice-intent envelope
  | "LOCAL_MOCK"     // VF.3 deterministic fixture-mode adapter
  | "SESAME"         // VF.6 production adapter (Founder-gated)
  | "FUTURE";        // VF.6+ adapter seam for any vendor that emerges

export interface VoiceProviderAdapter {
  // STT: caller-bound utterance → transcript + intent
  transcribe(audio_ref: AudioRef): Promise<TranscribeResult>;
  // TTS: governed message → audio_ref
  synthesize(text: string, voice_id: string): Promise<SynthesizeResult>;
}

export type TranscribeResult =
  | { ok: true; transcript_text: string; redacted: boolean; mode: "fixture" | "real" }
  | { ok: false; error_class: "AUTH" | "RATE_LIMIT" | "PROVIDER_ERROR" | "NETWORK" | "TIMEOUT" | "VALIDATION" | "NOT_CONFIGURED" | "DISABLED"; message: string };

export type SynthesizeResult =
  | { ok: true; audio_ref: AudioRef; mode: "fixture" | "real" }
  | { ok: false; error_class: "AUTH" | "RATE_LIMIT" | "PROVIDER_ERROR" | "NETWORK" | "TIMEOUT" | "VALIDATION" | "NOT_CONFIGURED" | "DISABLED"; message: string };
```

The 8-code closed-vocab failure enum mirrors `ConnectorProvider` (per `connector.service.ts`) so voice + connector substrate share the same failure-classification discipline.

## Adapter slots (in implementation order)

### 1. `TextOnlyVoiceProvider` (VF.2)

- **Purpose:** Baseline fallback. Accepts typed input and emits typed output; verifies the entire voice-intent pipeline without any audio dependency.
- **STT:** `transcribe(audio_ref)` accepts a typed string wrapped in `audio_ref.text_only_payload` and returns it as the transcript verbatim. Always `mode: "fixture"`.
- **TTS:** `synthesize(text, voice_id)` returns an `audio_ref` whose `text_only_payload === text`. Always `mode: "fixture"`.
- **When used:** CI + unit tests + dev environments + customer environments where voice is intentionally disabled.
- **Availability:** Always available; no secrets required; no env-var gate.

### 2. `LocalMockVoiceProvider` (VF.3)

- **Purpose:** Deterministic mock that returns fixture-controlled transcripts + synthesized audio refs. Used in unit + integration tests where a richer transcript shape is needed than `TextOnlyVoiceProvider` provides.
- **STT:** `transcribe(audio_ref)` returns a fixture transcript keyed by `audio_ref.fixture_key` (mirrors `ADR-0014` FixtureBasedLLMProvider dispatch). Forced-failure fixture keys mirror C2/C3/C4-A/C4-B providers (`force-auth-failure` / `force-network-failure` / etc.).
- **TTS:** Returns a fixture `audio_ref` keyed by `text` hash; deterministic.
- **When used:** Unit + integration tests for VF.4 CT scaffolding + voice-intent envelope flow tests.

### 3. `SesameVoiceProvider` (VF.6)

- **Purpose:** Production voice runtime. Intended primary voice partner per ADR-0085 §1.
- **STT:** `transcribe(audio_ref)` calls Sesame's STT endpoint with the secret_ref-resolved OAuth/API key. Defensive triple gate (`SESAME_USE_REAL=1` + `binding.config.use_real=true` + `secret_ref` resolves to non-empty env-var VALUE) mirrors C2/C3/C4-A/C4-B providers.
- **TTS:** Same defensive triple gate.
- **When used:** Production tenants where the per-tenant Sesame readiness flip has fired AND all 10 readiness gates are VERIFIED.
- **Availability:** Forward-substrate. **Requires explicit Founder authorization per the Sesame readiness assessment closeout.**

### 4. `FutureVoiceProvider` (forward-substrate)

- **Purpose:** Adapter seam for any vendor that emerges (e.g., on-prem voice for air-gapped deployments per ADR-0018; alternative voice partner if Sesame readiness assessment surfaces a blocking gate).
- **When used:** When tenant deployment posture or vendor availability requires a non-Sesame voice runtime.

## Dispatch + registry

The adapter dispatch mirrors `getConnectorProviderAsync` (per `connector.service.ts:332`):

```typescript
export async function getVoiceProviderAsync(
  type: VoiceProviderType,
): Promise<VoiceProviderAdapter> {
  if (type === "TEXT_ONLY") {
    const mod = await import("./text-only-voice.provider.js");
    return new mod.TextOnlyVoiceProvider();
  }
  if (type === "LOCAL_MOCK") {
    const mod = await import("./local-mock-voice.provider.js");
    return new mod.LocalMockVoiceProvider();
  }
  if (type === "SESAME") {
    const mod = await import("./sesame-voice.provider.js");
    return new mod.SesameVoiceProvider();
  }
  if (type === "FUTURE") {
    throw new Error("INTERNAL: FutureVoiceProvider dispatch is forward-substrate");
  }
  // Default safety: text-only if a caller passes an unknown type.
  const mod = await import("./text-only-voice.provider.js");
  return new mod.TextOnlyVoiceProvider();
}
```

## Privacy + audit invariant

Every `VoiceProviderAdapter` must:

- NEVER echo the access token / API key / OAuth bearer
- NEVER echo the raw audio bytes
- NEVER echo the transcript text in error messages
- NEVER echo per-utterance metadata (caller_entity_id / tenant_org_entity_id / source_surface) to the provider; the envelope construction lives at the Foundation governance tier, not at the provider boundary
- Surface deterministic counts + status + retry counts + the 8-code failure enum only
- Fail-closed on any unhandled provider response shape (collapse to PROVIDER_ERROR)

## Out-of-scope at the adapter tier

- Voice activity detection (VAD) — forward-substrate; the adapter receives a discrete `audio_ref` per utterance
- Diarization (speaker separation) — forward-substrate
- Multilingual / accent-tier features — forward-substrate per Sesame capability + tenant policy
- Real-time streaming TTS — forward-substrate; VF.2-VF.6 ship discrete utterance round-trips first

## Reading

- [ADR-0085 §4](../architecture/decisions/0085-voice-first-product-doctrine.md) — VoiceProviderAdapter seam (canonical decision substrate)
- [ADR-0014](../architecture/decisions/0014-fixturebasedllmprovider-key-based-dispatch.md) — Key-based dispatch precedent
- [`apps/api/src/services/connector/connector.service.ts`](../../apps/api/src/services/connector/connector.service.ts) — `ConnectorProvider` precedent
- [`apps/api/src/services/embedding/embedding.service.ts`](../../apps/api/src/services/embedding/embedding.service.ts) — `EmbeddingProvider` precedent
- [voice-intent-envelope.md](./voice-intent-envelope.md) — `VoiceIntentEnvelope` substrate object
- [implementation-sequence.md](./implementation-sequence.md) — VF.1 → VF.7 ladder
