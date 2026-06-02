// FILE: local-mock-voice-provider.test.ts
// PURPOSE: VF.3 unit tests for the LocalMockVoiceProvider per
//          ADR-0085 §4 adapter slot #2. Verifies:
//            - 8 closed-vocab forced-failure fixture keys
//              dispatch to the correct VoiceErrorClass
//            - Known fixture_key keys resolve to deterministic
//              fixture transcripts from the
//              LOCAL_MOCK_FIXTURE_TRANSCRIPTS catalog
//            - Unknown fixture_key with explicit
//              text_only_payload falls back to typed prose
//              (mirrors TextOnlyVoiceProvider parity)
//            - Unknown fixture_key without payload falls back
//              to the "default" catalog entry
//            - synthesize round-trip carries the fixture marker
//              + identity-equal text
//            - Privacy invariant: deterministic fixtures never
//              contain Bearer / OAuth tokens / secrets
// CONNECTS TO:
//   - apps/api/src/services/voice/local-mock-voice.provider.ts
//   - apps/api/src/services/voice/voice-provider.service.ts

import { describe, expect, it } from "vitest";
import {
  LOCAL_MOCK_FIXTURE_TRANSCRIPTS,
  LocalMockVoiceProvider,
  getVoiceProviderAsync,
  type AudioRef,
} from "@niov/api";

describe("VF.3 — LocalMockVoiceProvider forced-failure fixture keys", () => {
  const forced: Array<[string, string]> = [
    ["force-auth-failure", "AUTH"],
    ["force-network-failure", "NETWORK"],
    ["force-timeout", "TIMEOUT"],
    ["force-rate-limit", "RATE_LIMIT"],
    ["force-provider-error", "PROVIDER_ERROR"],
    ["force-validation-failure", "VALIDATION"],
    ["force-not-configured", "NOT_CONFIGURED"],
    ["force-disabled", "DISABLED"],
  ];

  it.each(forced)(
    "fixture_key %s maps to error_class %s",
    async (fixtureKey, expectedClass) => {
      const provider = new LocalMockVoiceProvider();
      const result = await provider.transcribe({ fixture_key: fixtureKey });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error_class).toBe(expectedClass);
      }
    },
  );
});

describe("VF.3 — LocalMockVoiceProvider deterministic transcripts", () => {
  it.each(Object.keys(LOCAL_MOCK_FIXTURE_TRANSCRIPTS))(
    "fixture_key %s resolves to the catalog transcript",
    async (key) => {
      const provider = new LocalMockVoiceProvider();
      const result = await provider.transcribe({ fixture_key: key });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.transcript_text).toBe(
          LOCAL_MOCK_FIXTURE_TRANSCRIPTS[key],
        );
        expect(result.mode).toBe("fixture");
        expect(result.redacted).toBe(false);
      }
    },
  );

  it("identical fixture_key returns identical transcript across calls (deterministic)", async () => {
    const provider = new LocalMockVoiceProvider();
    const a = await provider.transcribe({
      fixture_key: "ai-twin-yesterday-meeting",
    });
    const b = await provider.transcribe({
      fixture_key: "ai-twin-yesterday-meeting",
    });
    expect(a).toEqual(b);
  });
});

describe("VF.3 — LocalMockVoiceProvider fallback paths", () => {
  it("unknown fixture_key with explicit text_only_payload returns the typed prose", async () => {
    const provider = new LocalMockVoiceProvider();
    const result = await provider.transcribe({
      fixture_key: "unknown-fixture-name",
      text_only_payload: "What's on my calendar today?",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.transcript_text).toBe("What's on my calendar today?");
    }
  });

  it("unknown fixture_key without payload returns the default catalog entry", async () => {
    const provider = new LocalMockVoiceProvider();
    const result = await provider.transcribe({
      fixture_key: "unknown-fixture-name",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.transcript_text).toBe(
        LOCAL_MOCK_FIXTURE_TRANSCRIPTS["default"],
      );
    }
  });

  it("empty AudioRef returns the default catalog entry", async () => {
    const provider = new LocalMockVoiceProvider();
    const result = await provider.transcribe({} satisfies AudioRef);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.transcript_text).toBe(
        LOCAL_MOCK_FIXTURE_TRANSCRIPTS["default"],
      );
    }
  });
});

describe("VF.3 — LocalMockVoiceProvider synthesize", () => {
  it("returns fixture audio_ref with identity-equal text + fixture marker", async () => {
    const provider = new LocalMockVoiceProvider();
    const result = await provider.synthesize(
      "Your Twin will draft a reply.",
      "default-voice",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.audio_ref.text_only_payload).toBe(
        "Your Twin will draft a reply.",
      );
      expect(result.audio_ref.fixture_key).toBe(
        "local-mock-synthesize-fixture",
      );
      expect(result.mode).toBe("fixture");
    }
  });

  it("rejects empty text as VALIDATION", async () => {
    const provider = new LocalMockVoiceProvider();
    const result = await provider.synthesize("", "default-voice");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error_class).toBe("VALIDATION");
    }
  });

  it("rejects empty voice_id as VALIDATION", async () => {
    const provider = new LocalMockVoiceProvider();
    const result = await provider.synthesize("Hello", "");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error_class).toBe("VALIDATION");
    }
  });
});

describe("VF.3 — LocalMockVoiceProvider privacy invariant", () => {
  it("fixture catalog never contains Bearer / OAuth / secret patterns", () => {
    const serialized = JSON.stringify(LOCAL_MOCK_FIXTURE_TRANSCRIPTS);
    expect(serialized).not.toMatch(/bearer/i);
    expect(serialized).not.toMatch(/xoxb-/);
    expect(serialized).not.toMatch(/ya29\./);
    expect(serialized).not.toMatch(/ATATT3xFfGF0/);
    expect(serialized).not.toMatch(/lin_oauth_/);
    expect(serialized).not.toMatch(/lin_api_/);
    expect(serialized).not.toMatch(/-----BEGIN PRIVATE KEY-----/);
  });
});

describe("VF.3 — getVoiceProviderAsync(LOCAL_MOCK) dispatch landed", () => {
  it("returns a LocalMockVoiceProvider instance (no longer a TextOnlyVoiceProvider fallback)", async () => {
    const provider = await getVoiceProviderAsync("LOCAL_MOCK");
    expect(provider).toBeInstanceOf(LocalMockVoiceProvider);
  });
});
