// FILE: voice-transcription.test.ts (unit)
// PURPOSE: Phase 1264 — locks the desktop voice-input transcription
//          runtime (OpenAI Whisper). Proves: a real transcript is
//          returned on provider success; missing key → honest
//          STT_NOT_CONFIGURED (never a fake transcript); 429 →
//          STT_PROVIDER_BILLING; empty text → STT_NO_SPEECH; oversize
//          / empty audio → INVALID_AUDIO; and every path writes a
//          SAFE audit event (no transcript text, no audio bytes).
// CONNECTS TO: apps/api/src/services/voice/transcription.service.ts
//              via @niov/api.

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

const { writeAuditEventMock } = vi.hoisted(() => ({
  writeAuditEventMock: vi
    .fn()
    .mockResolvedValue({ audit_event_id: "0".repeat(36) }),
}));

vi.mock("@niov/database", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    writeAuditEvent: writeAuditEventMock,
  };
});

import {
  callWhisperTranscription,
  transcribeVoiceCommandForCaller,
  MAX_AUDIO_BYTES,
} from "@niov/api";

const ORIGINAL_KEY = process.env.OPENAI_API_KEY;

function audioBase64(byteLen = 64): string {
  return Buffer.alloc(byteLen, 7).toString("base64");
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OPENAI_API_KEY = "sk-test-key-1234567890";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (ORIGINAL_KEY === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = ORIGINAL_KEY;
});

describe("Phase 1264 — callWhisperTranscription provider honesty", () => {
  it("returns the transcript on provider success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ text: "  take me to connectors  " }),
      }),
    );
    const result = await callWhisperTranscription(
      Buffer.alloc(64, 1),
      "audio/webm",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.transcript).toBe("take me to connectors");
      expect(result.provider).toBe("WHISPER_API");
    }
  });

  it("returns STT_NOT_CONFIGURED when the key is absent (never a fake transcript)", async () => {
    delete process.env.OPENAI_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await callWhisperTranscription(
      Buffer.alloc(64, 1),
      "audio/webm",
    );
    expect(result).toEqual({ ok: false, code: "STT_NOT_CONFIGURED" });
    // No provider call happens without a key.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps a 429 to STT_PROVIDER_BILLING", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({}) }),
    );
    const result = await callWhisperTranscription(
      Buffer.alloc(64, 1),
      "audio/webm",
    );
    expect(result).toEqual({ ok: false, code: "STT_PROVIDER_BILLING" });
  });

  it("maps other non-OK responses to STT_PROVIDER_UNAVAILABLE", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }),
    );
    const result = await callWhisperTranscription(
      Buffer.alloc(64, 1),
      "audio/webm",
    );
    expect(result).toEqual({ ok: false, code: "STT_PROVIDER_UNAVAILABLE" });
  });

  it("returns STT_NO_SPEECH when the provider returns empty text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ text: "   " }),
      }),
    );
    const result = await callWhisperTranscription(
      Buffer.alloc(64, 1),
      "audio/webm",
    );
    expect(result).toEqual({ ok: false, code: "STT_NO_SPEECH" });
  });

  it("returns STT_PROVIDER_UNAVAILABLE on a network throw", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("socket hang up")),
    );
    const result = await callWhisperTranscription(
      Buffer.alloc(64, 1),
      "audio/webm",
    );
    expect(result).toEqual({ ok: false, code: "STT_PROVIDER_UNAVAILABLE" });
  });
});

describe("Phase 1264 — transcribeVoiceCommandForCaller audit + governance", () => {
  it("writes a SAFE success audit (no transcript text, no audio) and returns the transcript", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ text: "show me voice providers" }),
      }),
    );
    const result = await transcribeVoiceCommandForCaller({
      callerEntityId: "1".repeat(36),
      audioBase64: audioBase64(),
      mimeType: "audio/webm",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.transcript).toBe("show me voice providers");

    expect(writeAuditEventMock).toHaveBeenCalledTimes(1);
    const event = writeAuditEventMock.mock.calls[0]![0] as {
      event_type: string;
      outcome: string;
      details: Record<string, unknown>;
    };
    expect(event.event_type).toBe("AUDIO_CAPTURE_TRANSCRIBED");
    expect(event.outcome).toBe("SUCCESS");
    // The character count is recorded; the transcript text is NOT.
    expect(event.details.transcript_chars).toBe("show me voice providers".length);
    const serialized = JSON.stringify(event.details);
    expect(serialized).not.toContain("show me voice providers");
    expect(serialized).not.toContain(audioBase64());
  });

  it("rejects empty audio with INVALID_AUDIO + ERROR audit", async () => {
    const result = await transcribeVoiceCommandForCaller({
      callerEntityId: "1".repeat(36),
      audioBase64: "",
      mimeType: "audio/webm",
    });
    expect(result).toEqual({
      ok: false,
      httpStatus: 422,
      code: "INVALID_AUDIO",
    });
    expect(writeAuditEventMock).toHaveBeenCalledTimes(1);
    expect(writeAuditEventMock.mock.calls[0]![0].event_type).toBe(
      "AUDIO_CAPTURE_FAILED",
    );
  });

  it("rejects oversize audio with INVALID_AUDIO before any provider call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const oversize = Buffer.alloc(MAX_AUDIO_BYTES + 1, 9).toString("base64");
    const result = await transcribeVoiceCommandForCaller({
      callerEntityId: "1".repeat(36),
      audioBase64: oversize,
      mimeType: "audio/webm",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("INVALID_AUDIO");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("writes an ERROR audit and 503 when the provider is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) }),
    );
    const result = await transcribeVoiceCommandForCaller({
      callerEntityId: "1".repeat(36),
      audioBase64: audioBase64(),
      mimeType: "audio/webm",
    });
    expect(result).toEqual({
      ok: false,
      httpStatus: 503,
      code: "STT_PROVIDER_UNAVAILABLE",
    });
    const event = writeAuditEventMock.mock.calls[0]![0] as {
      event_type: string;
      outcome: string;
    };
    expect(event.event_type).toBe("AUDIO_CAPTURE_FAILED");
    expect(event.outcome).toBe("ERROR");
  });
});
