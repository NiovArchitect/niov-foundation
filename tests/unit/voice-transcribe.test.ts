// FILE: voice-transcribe.test.ts (unit)
// PURPOSE: [OTZAR-V1-LIVE-4A-FOUNDATION] Lock the inline speech-to-text service:
//          ElevenLabs-first provider selection, honest not-configured /
//          unsupported behavior, type/size validation, a mocked happy path,
//          provider-error handling, and that no provider KEY is ever returned.
//          No real provider is called (injected). Raw audio is never persisted
//          (the service imports nothing persistent).
// CONNECTS TO: apps/api/src/services/voice/voice-transcribe.service.ts.

import { describe, expect, it } from "vitest";
import {
  selectInlineSttProvider,
  transcribeInlineAudio,
  MAX_AUDIO_BYTES,
  type InlineSttProvider,
} from "../../apps/api/src/services/voice/voice-transcribe.service.js";

const VALID_B64 = Buffer.from("fake-audio-bytes").toString("base64");
const KEY = "x".repeat(20);

function mockProvider(transcript: string): InlineSttProvider {
  return { name: "MOCK", call: async () => transcript };
}

describe("selectInlineSttProvider — ElevenLabs-first (LIVE-4A)", () => {
  it("uses ElevenLabs when VOICE_STT_PROVIDER=elevenlabs + key present", () => {
    const s = selectInlineSttProvider({ VOICE_STT_PROVIDER: "elevenlabs", ELEVENLABS_API_KEY: KEY });
    expect(s.ok).toBe(true);
    if (s.ok) expect(s.provider.name).toBe("ELEVENLABS");
  });

  it("returns NOT_CONFIGURED when VOICE_STT_PROVIDER=elevenlabs but the key is missing", () => {
    const s = selectInlineSttProvider({ VOICE_STT_PROVIDER: "elevenlabs" });
    expect(s.ok).toBe(false);
    if (!s.ok) expect(s.code).toBe("VOICE_STT_PROVIDER_NOT_CONFIGURED");
  });

  it("auto-selects ElevenLabs first when no preference is set", () => {
    const s = selectInlineSttProvider({ ELEVENLABS_API_KEY: KEY, DEEPGRAM_API_KEY: KEY });
    expect(s.ok).toBe(true);
    if (s.ok) expect(s.provider.name).toBe("ELEVENLABS");
  });

  it("falls back to Deepgram (non-default secondary) only when it is the sole key", () => {
    const s = selectInlineSttProvider({ DEEPGRAM_API_KEY: KEY });
    expect(s.ok).toBe(true);
    if (s.ok) expect(s.provider.name).toBe("DEEPGRAM");
  });

  it("returns NOT_CONFIGURED when no key is set", () => {
    const s = selectInlineSttProvider({});
    expect(s.ok).toBe(false);
    if (!s.ok) expect(s.code).toBe("VOICE_STT_PROVIDER_NOT_CONFIGURED");
  });

  it("returns UNSUPPORTED_STT_PROVIDER for an unknown provider name", () => {
    const s = selectInlineSttProvider({ VOICE_STT_PROVIDER: "acme-voice", ELEVENLABS_API_KEY: KEY });
    expect(s.ok).toBe(false);
    if (!s.ok) expect(s.code).toBe("UNSUPPORTED_STT_PROVIDER");
  });
});

describe("transcribeInlineAudio (LIVE-4A)", () => {
  it("transcribes a valid utterance via the configured provider", async () => {
    const r = await transcribeInlineAudio(
      { audioBase64: VALID_B64, mimeType: "audio/webm" },
      { provider: mockProvider("ask david to review the client note") },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.transcript).toBe("ask david to review the client note");
      expect(r.provider).toBe("MOCK");
    }
  });

  it("never leaks a provider key in the result (only transcript + provider name)", async () => {
    const r = await transcribeInlineAudio(
      { audioBase64: VALID_B64, mimeType: "audio/webm" },
      { provider: mockProvider("hello") },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(Object.keys(r).sort()).toEqual(["ok", "provider", "transcript"]);
      expect(JSON.stringify(r)).not.toContain(KEY);
    }
  });

  it("strips codec params from the mime type (audio/webm;codecs=opus)", async () => {
    const r = await transcribeInlineAudio(
      { audioBase64: VALID_B64, mimeType: "audio/webm;codecs=opus" },
      { provider: mockProvider("hi") },
    );
    expect(r.ok).toBe(true);
  });

  it("returns VOICE_STT_PROVIDER_NOT_CONFIGURED when no provider is available", async () => {
    const r = await transcribeInlineAudio(
      { audioBase64: VALID_B64, mimeType: "audio/webm" },
      { provider: null },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("VOICE_STT_PROVIDER_NOT_CONFIGURED");
  });

  it("rejects an unsupported audio type", async () => {
    const r = await transcribeInlineAudio(
      { audioBase64: VALID_B64, mimeType: "application/json" },
      { provider: mockProvider("x") },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("INVALID_AUDIO_TYPE");
  });

  it("rejects empty audio", async () => {
    const r = await transcribeInlineAudio(
      { audioBase64: "", mimeType: "audio/webm" },
      { provider: mockProvider("x") },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("EMPTY_AUDIO");
  });

  it("rejects audio over the size ceiling", async () => {
    const tooBig = Buffer.alloc(MAX_AUDIO_BYTES + 1, 1).toString("base64");
    const r = await transcribeInlineAudio(
      { audioBase64: tooBig, mimeType: "audio/webm" },
      { provider: mockProvider("x") },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("AUDIO_TOO_LARGE");
  });

  it("maps a provider failure to PROVIDER_ERROR (no throw to the caller)", async () => {
    const failing: InlineSttProvider = {
      name: "MOCK",
      call: async () => {
        throw new Error("provider down");
      },
    };
    const r = await transcribeInlineAudio(
      { audioBase64: VALID_B64, mimeType: "audio/webm" },
      { provider: failing },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("PROVIDER_ERROR");
  });
});
