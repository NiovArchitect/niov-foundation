// FILE: voice-transcription.test.ts (unit)
// PURPOSE: Phase 1264 verification pass — locks the OpenAI Whisper STT
//          runtime + its REFINED error classification. Proves: a real
//          transcript on success; missing key → honest
//          STT_NOT_CONFIGURED (never a fake transcript); and that the
//          previously-collapsed failures are now distinguished —
//          401/403 → AUTH_FAILED, 404 → MODEL_UNAVAILABLE, 400 →
//          BAD_AUDIO, 429+insufficient_quota → BILLING, 429 rate →
//          RATE_LIMITED, 402 → BILLING, 5xx → UNAVAILABLE, empty →
//          NO_SPEECH, empty/oversize bytes → INVALID_AUDIO. Every path
//          writes a SAFE audit event (no transcript, no audio).
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
  classifyOpenAiHttp,
  MAX_AUDIO_BYTES,
} from "@niov/api";

const ORIGINAL_KEY = process.env.OPENAI_API_KEY;

function audioBase64(byteLen = 64): string {
  return Buffer.alloc(byteLen, 7).toString("base64");
}

/** Build a fetch mock that returns a single OpenAI-shaped response. */
function fetchReturning(opts: {
  ok: boolean;
  status: number;
  json: unknown;
}): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: opts.ok,
      status: opts.status,
      json: async () => opts.json,
    }),
  );
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

describe("classifyOpenAiHttp — refined closed-vocab mapping", () => {
  it("401/403 → AUTH_FAILED", () => {
    expect(classifyOpenAiHttp(401)).toBe("STT_PROVIDER_AUTH_FAILED");
    expect(classifyOpenAiHttp(403)).toBe("STT_PROVIDER_AUTH_FAILED");
  });
  it("402 and 429+insufficient_quota → BILLING", () => {
    expect(classifyOpenAiHttp(402)).toBe("STT_PROVIDER_BILLING");
    expect(classifyOpenAiHttp(429, "insufficient_quota")).toBe(
      "STT_PROVIDER_BILLING",
    );
  });
  it("429 without quota signal → RATE_LIMITED (not billing)", () => {
    expect(classifyOpenAiHttp(429, "requests", "rate_limit_exceeded")).toBe(
      "STT_PROVIDER_RATE_LIMITED",
    );
  });
  it("404 → MODEL_UNAVAILABLE; 400 → BAD_AUDIO", () => {
    expect(classifyOpenAiHttp(404)).toBe("STT_MODEL_UNAVAILABLE");
    expect(classifyOpenAiHttp(400)).toBe("STT_BAD_AUDIO");
  });
  it("400 with a model error → MODEL_UNAVAILABLE", () => {
    expect(classifyOpenAiHttp(400, undefined, "model_not_found")).toBe(
      "STT_MODEL_UNAVAILABLE",
    );
  });
  it("5xx / unknown → UNAVAILABLE", () => {
    expect(classifyOpenAiHttp(500)).toBe("STT_PROVIDER_UNAVAILABLE");
    expect(classifyOpenAiHttp(503)).toBe("STT_PROVIDER_UNAVAILABLE");
  });
});

describe("callWhisperTranscription — provider honesty", () => {
  it("returns the transcript + provider on success", async () => {
    fetchReturning({ ok: true, status: 200, json: { text: "  take me to connectors  " } });
    const r = await callWhisperTranscription(Buffer.alloc(64, 1), "audio/webm");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.transcript).toBe("take me to connectors");
      expect(r.provider).toBe("openai-whisper");
    }
  });

  it("missing key → STT_NOT_CONFIGURED with no provider call", async () => {
    delete process.env.OPENAI_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const r = await callWhisperTranscription(Buffer.alloc(64, 1), "audio/webm");
    expect(r).toEqual({ ok: false, code: "STT_NOT_CONFIGURED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("401 → AUTH_FAILED (+ status)", async () => {
    fetchReturning({ ok: false, status: 401, json: { error: { type: "invalid_request_error", code: "invalid_api_key" } } });
    const r = await callWhisperTranscription(Buffer.alloc(64, 1), "audio/webm");
    expect(r).toEqual({ ok: false, code: "STT_PROVIDER_AUTH_FAILED", httpStatus: 401 });
  });

  it("429 insufficient_quota → BILLING", async () => {
    fetchReturning({ ok: false, status: 429, json: { error: { type: "insufficient_quota" } } });
    const r = await callWhisperTranscription(Buffer.alloc(64, 1), "audio/webm");
    expect(r).toEqual({ ok: false, code: "STT_PROVIDER_BILLING", httpStatus: 429 });
  });

  it("429 rate limit → RATE_LIMITED (not billing)", async () => {
    fetchReturning({ ok: false, status: 429, json: { error: { code: "rate_limit_exceeded" } } });
    const r = await callWhisperTranscription(Buffer.alloc(64, 1), "audio/webm");
    expect(r).toEqual({ ok: false, code: "STT_PROVIDER_RATE_LIMITED", httpStatus: 429 });
  });

  it("404 → MODEL_UNAVAILABLE", async () => {
    fetchReturning({ ok: false, status: 404, json: { error: { code: "model_not_found" } } });
    const r = await callWhisperTranscription(Buffer.alloc(64, 1), "audio/webm");
    expect(r).toEqual({ ok: false, code: "STT_MODEL_UNAVAILABLE", httpStatus: 404 });
  });

  it("400 → BAD_AUDIO", async () => {
    fetchReturning({ ok: false, status: 400, json: { error: { type: "invalid_request_error" } } });
    const r = await callWhisperTranscription(Buffer.alloc(64, 1), "audio/webm");
    expect(r).toEqual({ ok: false, code: "STT_BAD_AUDIO", httpStatus: 400 });
  });

  it("500 → UNAVAILABLE", async () => {
    fetchReturning({ ok: false, status: 500, json: {} });
    const r = await callWhisperTranscription(Buffer.alloc(64, 1), "audio/webm");
    expect(r).toEqual({ ok: false, code: "STT_PROVIDER_UNAVAILABLE", httpStatus: 500 });
  });

  it("empty transcript → NO_SPEECH", async () => {
    fetchReturning({ ok: true, status: 200, json: { text: "   " } });
    const r = await callWhisperTranscription(Buffer.alloc(64, 1), "audio/webm");
    expect(r).toEqual({ ok: false, code: "STT_NO_SPEECH", httpStatus: 200 });
  });

  it("network throw → UNAVAILABLE", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("socket hang up")));
    const r = await callWhisperTranscription(Buffer.alloc(64, 1), "audio/webm");
    expect(r).toEqual({ ok: false, code: "STT_PROVIDER_UNAVAILABLE" });
  });
});

describe("transcribeVoiceCommandForCaller — audit + governance", () => {
  it("writes a SAFE success audit (no transcript, no audio) and returns the transcript + provider", async () => {
    fetchReturning({ ok: true, status: 200, json: { text: "show me voice providers" } });
    const r = await transcribeVoiceCommandForCaller({
      callerEntityId: "1".repeat(36),
      audioBase64: audioBase64(),
      mimeType: "audio/webm",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.transcript).toBe("show me voice providers");
      expect(r.provider).toBe("openai-whisper");
    }
    expect(writeAuditEventMock).toHaveBeenCalledTimes(1);
    const event = writeAuditEventMock.mock.calls[0]![0] as {
      event_type: string;
      details: Record<string, unknown>;
    };
    expect(event.event_type).toBe("AUDIO_CAPTURE_TRANSCRIBED");
    expect(event.details.transcript_chars).toBe("show me voice providers".length);
    const serialized = JSON.stringify(event.details);
    expect(serialized).not.toContain("show me voice providers");
    expect(serialized).not.toContain(audioBase64());
  });

  it("billing failure → 503 + ERROR audit carrying provider_status", async () => {
    fetchReturning({ ok: false, status: 429, json: { error: { type: "insufficient_quota" } } });
    const r = await transcribeVoiceCommandForCaller({
      callerEntityId: "1".repeat(36),
      audioBase64: audioBase64(),
      mimeType: "audio/webm",
    });
    expect(r).toEqual({ ok: false, httpStatus: 503, code: "STT_PROVIDER_BILLING" });
    const event = writeAuditEventMock.mock.calls[0]![0] as {
      event_type: string;
      outcome: string;
      details: Record<string, unknown>;
    };
    expect(event.event_type).toBe("AUDIO_CAPTURE_FAILED");
    expect(event.outcome).toBe("ERROR");
    expect(event.details.failure_class).toBe("STT_PROVIDER_BILLING");
    expect(event.details.provider_status).toBe(429);
  });

  it("auth failure → 503 + AUTH_FAILED", async () => {
    fetchReturning({ ok: false, status: 401, json: { error: { code: "invalid_api_key" } } });
    const r = await transcribeVoiceCommandForCaller({
      callerEntityId: "1".repeat(36),
      audioBase64: audioBase64(),
      mimeType: "audio/webm",
    });
    expect(r).toEqual({ ok: false, httpStatus: 503, code: "STT_PROVIDER_AUTH_FAILED" });
  });

  it("bad audio (provider 400) → 422 + BAD_AUDIO", async () => {
    fetchReturning({ ok: false, status: 400, json: { error: { type: "invalid_request_error" } } });
    const r = await transcribeVoiceCommandForCaller({
      callerEntityId: "1".repeat(36),
      audioBase64: audioBase64(),
      mimeType: "audio/webm",
    });
    expect(r).toEqual({ ok: false, httpStatus: 422, code: "STT_BAD_AUDIO" });
  });

  it("not configured → 503 + STT_NOT_CONFIGURED", async () => {
    delete process.env.OPENAI_API_KEY;
    const r = await transcribeVoiceCommandForCaller({
      callerEntityId: "1".repeat(36),
      audioBase64: audioBase64(),
      mimeType: "audio/webm",
    });
    expect(r).toEqual({ ok: false, httpStatus: 503, code: "STT_NOT_CONFIGURED" });
  });

  it("empty audio → 422 INVALID_AUDIO + ERROR audit", async () => {
    const r = await transcribeVoiceCommandForCaller({
      callerEntityId: "1".repeat(36),
      audioBase64: "",
      mimeType: "audio/webm",
    });
    expect(r).toEqual({ ok: false, httpStatus: 422, code: "INVALID_AUDIO" });
    expect(writeAuditEventMock.mock.calls[0]![0].event_type).toBe(
      "AUDIO_CAPTURE_FAILED",
    );
  });

  it("oversize audio → 422 INVALID_AUDIO before any provider call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const oversize = Buffer.alloc(MAX_AUDIO_BYTES + 1, 9).toString("base64");
    const r = await transcribeVoiceCommandForCaller({
      callerEntityId: "1".repeat(36),
      audioBase64: oversize,
      mimeType: "audio/webm",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("INVALID_AUDIO");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("empty transcription → 422 NO_SPEECH", async () => {
    fetchReturning({ ok: true, status: 200, json: { text: "" } });
    const r = await transcribeVoiceCommandForCaller({
      callerEntityId: "1".repeat(36),
      audioBase64: audioBase64(),
      mimeType: "audio/webm",
    });
    expect(r).toEqual({ ok: false, httpStatus: 422, code: "STT_NO_SPEECH" });
  });
});
