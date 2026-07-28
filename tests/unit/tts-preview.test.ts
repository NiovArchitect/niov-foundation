// FILE: tests/unit/tts-preview.test.ts
// PURPOSE: Premium TTS runtime locks: pronunciation transform,
//          xAI Orion primary (mocked), ElevenLabs fallback (mocked),
//          closed-vocab failures, no key leakage.

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  generateTtsPreview,
  prepareTextForTts,
  TTS_MAX_TEXT_LENGTH,
  XAI_DEFAULT_VOICE_ID,
} from "../../apps/api/src/services/voice/tts-preview.service.js";

const ENV_KEYS = [
  "ELEVENLABS_API_KEY",
  "ELEVENLABS_VOICE_ID",
  "XAI_API_KEY",
  "XAI_TTS_ENABLED",
  "XAI_TTS_VOICE_ID",
  "XAI_BASE_URL",
];
const saved: Record<string, string | undefined> = {};
for (const k of ENV_KEYS) saved[k] = process.env[k];

afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("pronunciation transform", () => {
  it("speaks OatZar while spelling stays Otzar", () => {
    expect(prepareTextForTts("Good morning. I'm Otzar.")).toBe(
      "Good morning. I'm OatZar.",
    );
    expect(prepareTextForTts("OtzarX Otzar")).toBe("OtzarX OatZar");
  });
});

describe("xAI Orion primary path (mocked)", () => {
  it("uses xAI /tts with orion when XAI_API_KEY is set", async () => {
    delete process.env.ELEVENLABS_API_KEY;
    process.env.XAI_API_KEY = "xai-test-key-not-real";
    process.env.XAI_TTS_ENABLED = "true";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new Uint8Array([9, 8, 7]).buffer,
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await generateTtsPreview({ text: "Hello from Otzar" });
    expect(r.ok).toBe(true);
    if (r.ok === false) throw new Error(r.code);
    expect(r.provider).toBe("XAI");
    expect(r.voice_id).toBe(XAI_DEFAULT_VOICE_ID);
    expect(r.audio.length).toBe(3);
    const url = String(fetchMock.mock.calls[0]?.[0] ?? "");
    expect(url).toContain("/tts");
    const init = fetchMock.mock.calls[0]?.[1] as {
      headers: Record<string, string>;
      body: string;
    };
    expect(init.headers.Authorization).toContain("Bearer ");
    const body = JSON.parse(init.body);
    expect(body.voice_id).toBe("orion");
    expect(body.text).toContain("OatZar");
    expect(JSON.stringify(r)).not.toContain("xai-test-key-not-real");
  });

  it("falls back to ElevenLabs when xAI fails and ElevenLabs is configured", async () => {
    process.env.XAI_API_KEY = "xai-test-key";
    process.env.ELEVENLABS_API_KEY = "el-test-key";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      });
    vi.stubGlobal("fetch", fetchMock);
    const r = await generateTtsPreview({ text: "Hello Otzar" });
    expect(r.ok).toBe(true);
    if (r.ok === false) throw new Error(r.code);
    expect(r.provider).toBe("ELEVENLABS");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("XAI_TTS_ENABLED=false skips xAI and uses ElevenLabs", async () => {
    process.env.XAI_API_KEY = "xai-test-key";
    process.env.XAI_TTS_ENABLED = "false";
    process.env.ELEVENLABS_API_KEY = "el-test-key";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new Uint8Array([4, 5]).buffer,
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await generateTtsPreview({ text: "hi" });
    expect(r.ok).toBe(true);
    if (r.ok === false) throw new Error(r.code);
    expect(r.provider).toBe("ELEVENLABS");
    const url = String(fetchMock.mock.calls[0]?.[0] ?? "");
    expect(url).toContain("elevenlabs.io");
  });
});

describe("ElevenLabs provider (mocked)", () => {
  it("returns MP3 audio and never includes the key in the result", async () => {
    delete process.env.XAI_API_KEY;
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
    const body = JSON.parse(
      (fetchMock.mock.calls[0]?.[1] as { body: string }).body,
    );
    expect(body.text).toContain("OatZar");
    expect(JSON.stringify(r)).not.toContain("test-key-not-real");
  });

  it("missing all keys → TTS_NOT_CONFIGURED (no fetch fired)", async () => {
    delete process.env.ELEVENLABS_API_KEY;
    delete process.env.XAI_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await generateTtsPreview({ text: "hi" })).toEqual({
      ok: false,
      code: "TTS_NOT_CONFIGURED",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("provider error → TTS_PROVIDER_UNAVAILABLE, no raw body", async () => {
    delete process.env.XAI_API_KEY;
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
});

describe("bounds", () => {
  it("exports a finite max text length for route validation", () => {
    expect(TTS_MAX_TEXT_LENGTH).toBeGreaterThan(100);
    expect(TTS_MAX_TEXT_LENGTH).toBeLessThanOrEqual(2000);
  });
});
