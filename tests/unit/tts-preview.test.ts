// FILE: tests/unit/tts-preview.test.ts
// PURPOSE: Phase 1259 — premium TTS runtime locks: pronunciation
//          transform (TTS payload only), ElevenLabs call shape with
//          a mocked fetch (never the real API), closed-vocab
//          failures (missing key / provider error), and no key
//          leakage in results.

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  generateTtsPreview,
  prepareTextForTts,
  TTS_MAX_TEXT_LENGTH,
} from "../../apps/api/src/services/voice/tts-preview.service.js";

const ENV_KEYS = ["ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_ID"];
const saved: Record<string, string | undefined> = {};
for (const k of ENV_KEYS) saved[k] = process.env[k];

afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("Phase 1259 — pronunciation transform", () => {
  it("speaks OatZar while spelling stays Otzar", () => {
    expect(prepareTextForTts("Good morning. I'm Otzar.")).toBe(
      "Good morning. I'm OatZar.",
    );
    // Only whole-word matches; embedded strings untouched.
    expect(prepareTextForTts("OtzarX Otzar")).toBe("OtzarX OatZar");
  });
});

describe("Phase 1259 — ElevenLabs provider (mocked)", () => {
  it("returns MP3 audio and never includes the key in the result", async () => {
    process.env.ELEVENLABS_API_KEY = "test-key-not-real";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await generateTtsPreview({ text: "Hello from Otzar" });
    expect(r.ok).toBe(true);
    if (r.ok === false) throw new Error(r.code);
    expect(r.provider).toBe("ELEVENLABS");
    expect(r.audio.length).toBe(3);
    // The call carried the pronunciation-transformed payload.
    const body = JSON.parse(
      (fetchMock.mock.calls[0]?.[1] as { body: string }).body,
    );
    expect(body.text).toContain("OatZar");
    expect(body.text).not.toContain("Otzar ");
    // Key travels only in the header, never in the result object.
    expect(JSON.stringify(r)).not.toContain("test-key-not-real");
  });

  it("missing key → TTS_NOT_CONFIGURED (no fetch fired)", async () => {
    delete process.env.ELEVENLABS_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await generateTtsPreview({ text: "hi" })).toEqual({
      ok: false,
      code: "TTS_NOT_CONFIGURED",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("provider error (e.g. 401/429) → TTS_PROVIDER_UNAVAILABLE, no raw body", async () => {
    process.env.ELEVENLABS_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 429 }),
    );
    expect(await generateTtsPreview({ text: "hi" })).toEqual({
      ok: false,
      code: "TTS_PROVIDER_UNAVAILABLE",
    });
  });

  it("bounds the spoken payload length", async () => {
    process.env.ELEVENLABS_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new Uint8Array([9]).buffer,
    });
    vi.stubGlobal("fetch", fetchMock);
    await generateTtsPreview({ text: "x".repeat(5000) });
    const body = JSON.parse(
      (fetchMock.mock.calls[0]?.[1] as { body: string }).body,
    );
    expect(body.text.length).toBeLessThanOrEqual(TTS_MAX_TEXT_LENGTH);
  });
});
