// FILE: local-mock-voice.provider.ts
// PURPOSE: VF.3 LocalMockVoiceProvider per ADR-0085 §4 adapter
//          slot #2. Deterministic mock that returns fixture-key-
//          controlled transcripts + synthesized audio refs. Used
//          in unit + integration tests where a richer transcript
//          shape is needed than TextOnlyVoiceProvider provides
//          (e.g., asserting envelope-to-audit-chain end-to-end
//          for the full risk-tier matrix without typing the
//          transcript at every call site).
//
//          The fixture-key dispatch mirrors ADR-0014
//          FixtureBasedLLMProvider + the connector C2/C3/C4
//          force-* fixture-key pattern. Tests pass an explicit
//          fixture_key in audio_ref to assert handler behavior
//          across the full Result discriminated union without
//          ever reaching a real STT/TTS engine.
//
// PRIVACY INVARIANT:
//   - The provider boundary NEVER receives caller_entity_id /
//     tenant_org_entity_id / source_surface. Those live at the
//     envelope-construction tier.
//   - Error messages NEVER echo any secret (this adapter doesn't
//     have any to leak, but the discipline is preserved for
//     adapter parity with SesameVoiceProvider at VF.6).
//   - Fixture transcripts are deterministic, work-relevant
//     prose; they never contain Bearer headers, OAuth tokens,
//     or other formats that look like real secrets.
// CONNECTS TO:
//   - apps/api/src/services/voice/voice-provider.service.ts
//     (VoiceProviderAdapter interface + AudioRef + Result types)
//   - tests/integration/voice-envelope-runtime.test.ts (uses
//     this provider to assert the envelope flows through the
//     real Foundation audit chain end-to-end)

import type {
  AudioRef,
  SynthesizeResult,
  TranscribeResult,
  VoiceProviderAdapter,
} from "./voice-provider.service.js";

// ────────────────────────────────────────────────────────────────
// Closed-vocab fixture keys. The same 8-code closed-vocab failure
// shape used by C2 Slack + C3 Google + C4-A Jira + C4-B Linear
// providers — mirrored here for the voice substrate so test
// authors can reuse the same fixture-key vocabulary across both
// connector + voice tests.
// ────────────────────────────────────────────────────────────────
const FIXTURE_KEYS = [
  "force-auth-failure",
  "force-network-failure",
  "force-timeout",
  "force-rate-limit",
  "force-provider-error",
  "force-validation-failure",
  "force-not-configured",
  "force-disabled",
] as const;
type FixtureKey = (typeof FIXTURE_KEYS)[number];

function isFixtureKey(value: unknown): value is FixtureKey {
  return (
    typeof value === "string" &&
    (FIXTURE_KEYS as ReadonlyArray<string>).includes(value)
  );
}

// ────────────────────────────────────────────────────────────────
// Deterministic fixture transcripts keyed by a fixture-name string.
// Tests can pass audio_ref.fixture_key = "<fixture-name>" to get a
// stable transcript without typing the prose at every call site.
// If no fixture_name is supplied the provider falls back to the
// generic prose below.
// ────────────────────────────────────────────────────────────────
const FIXTURE_TRANSCRIPTS: Readonly<Record<string, string>> = Object.freeze({
  "ai-twin-yesterday-meeting":
    "Tell me what I committed to in yesterday's meeting.",
  "ai-teammate-jira-summary":
    "Summarize the Jira project's risk for me.",
  "admin-twin-pending-approvals":
    "Show me the pending approvals on the org.",
  "workflow-propose-sprint-summary":
    "Propose a sprint risk summary workflow for my team.",
  "approval-request-grant":
    "Approve the workflow execution that's pending my review.",
  "meeting-followup-draft":
    "Draft action items from today's design review.",
  "connector-question-linear-health":
    "Is my Linear binding healthy?",
  "audit-explanation-policy-denial":
    "Why did the policy deny the proposed action earlier?",
  "executive-briefing-compliance":
    "Brief me on the compliance posture this quarter.",
  default:
    "Default fixture transcript — request the work prose explicitly.",
});

// ────────────────────────────────────────────────────────────────
// Deterministic fixture audio_ref payloads keyed by a synth-key
// string. Mirrors FIXTURE_TRANSCRIPTS — tests can assert the
// synthesize() round-trip returns a known audio_ref shape without
// invoking a real TTS engine.
// ────────────────────────────────────────────────────────────────
function makeFixtureAudioRef(text: string): AudioRef {
  // Stable, non-secret marker so the test can assert which fixture
  // synthesized this audio_ref. The text_only_payload carries the
  // synthesized prose verbatim — the same identity-equal pattern
  // TextOnlyVoiceProvider uses, but flagged with a fixture marker
  // so the integration test can discriminate between the two
  // adapters at the round-trip register.
  return {
    text_only_payload: text,
    fixture_key: "local-mock-synthesize-fixture",
  };
}

// ────────────────────────────────────────────────────────────────
// LocalMockVoiceProvider — production class.
// ────────────────────────────────────────────────────────────────
export class LocalMockVoiceProvider implements VoiceProviderAdapter {
  async transcribe(audio_ref: AudioRef): Promise<TranscribeResult> {
    // Fixture-mode forced-failure dispatch BEFORE any other path.
    // Tests rely on this to assert handler behavior across the
    // full Result discriminated union without typing a real
    // transcript.
    const fixtureKey = audio_ref.fixture_key;
    if (isFixtureKey(fixtureKey)) {
      return this.fixtureFailureResponse(fixtureKey);
    }

    // Deterministic transcript dispatch keyed by fixture_key. If
    // the fixture_key matches a known fixture name, return that
    // prose. Otherwise fall back to the default fixture.
    let transcriptText: string;
    if (
      typeof fixtureKey === "string" &&
      fixtureKey in FIXTURE_TRANSCRIPTS &&
      FIXTURE_TRANSCRIPTS[fixtureKey] !== undefined
    ) {
      transcriptText = FIXTURE_TRANSCRIPTS[fixtureKey]!;
    } else if (
      typeof audio_ref.text_only_payload === "string" &&
      audio_ref.text_only_payload.length > 0
    ) {
      // Allow the test to supply explicit prose; mirrors
      // TextOnlyVoiceProvider's typed-input behavior for parity.
      transcriptText = audio_ref.text_only_payload;
    } else {
      transcriptText = FIXTURE_TRANSCRIPTS["default"]!;
    }

    return {
      ok: true,
      transcript_text: transcriptText,
      redacted: false,
      mode: "fixture",
    };
  }

  async synthesize(text: string, voice_id: string): Promise<SynthesizeResult> {
    if (typeof text !== "string" || text.length === 0) {
      return {
        ok: false,
        error_class: "VALIDATION",
        message: "local_mock_voice: text must be a non-empty string",
      };
    }
    if (typeof voice_id !== "string" || voice_id.length === 0) {
      return {
        ok: false,
        error_class: "VALIDATION",
        message: "local_mock_voice: voice_id must be a non-empty string",
      };
    }
    return {
      ok: true,
      audio_ref: makeFixtureAudioRef(text),
      mode: "fixture",
    };
  }

  private fixtureFailureResponse(fixtureKey: FixtureKey): TranscribeResult {
    switch (fixtureKey) {
      case "force-auth-failure":
        return { ok: false, error_class: "AUTH", message: "fixture: forced AUTH failure" };
      case "force-network-failure":
        return { ok: false, error_class: "NETWORK", message: "fixture: forced NETWORK failure" };
      case "force-timeout":
        return { ok: false, error_class: "TIMEOUT", message: "fixture: forced TIMEOUT failure" };
      case "force-rate-limit":
        return { ok: false, error_class: "RATE_LIMIT", message: "fixture: forced RATE_LIMIT failure" };
      case "force-provider-error":
        return { ok: false, error_class: "PROVIDER_ERROR", message: "fixture: forced PROVIDER_ERROR failure" };
      case "force-validation-failure":
        return { ok: false, error_class: "VALIDATION", message: "fixture: forced VALIDATION failure" };
      case "force-not-configured":
        return { ok: false, error_class: "NOT_CONFIGURED", message: "fixture: forced NOT_CONFIGURED failure" };
      case "force-disabled":
        return { ok: false, error_class: "DISABLED", message: "fixture: forced DISABLED failure" };
    }
  }
}

// Exported for tests that want to assert against the canonical
// fixture-transcript catalog without redefining it.
export { FIXTURE_TRANSCRIPTS as LOCAL_MOCK_FIXTURE_TRANSCRIPTS };
