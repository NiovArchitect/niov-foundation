// FILE: voice-transcription.test.ts (unit)
// PURPOSE: Phase 1264 — locks the OpenAI Whisper → Deepgram STT runtime:
//          refined error classification (auth/billing/rate-limit/model/
//          bad-audio split) AND the ordered fallback (OpenAI first;
//          Deepgram only on billing/rate-limit/unavailable; never on
//          auth/model/bad-audio/no-speech). Every path writes ONE SAFE
//          audit event recording providers_attempted + the winning
//          provider — never the transcript, never the audio.
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
  return { ...actual, writeAuditEvent: writeAuditEventMock };
});

import {
  callWhisperTranscription,
  transcribeVoiceCommandForCaller,
  classifyOpenAiHttp,
  classifyDeepgramHttp,
  MAX_AUDIO_BYTES,
} from "@niov/api";

const ORIGINAL_OPENAI = process.env.OPENAI_API_KEY;
const ORIGINAL_DEEPGRAM = process.env.DEEPGRAM_API_KEY;

function audioBase64(byteLen = 64): string {
  return Buffer.alloc(byteLen, 7).toString("base64");
}

type RespSpec = { ok: boolean; status: number; json: unknown } | "throw";

function mkResp(spec: Exclude<RespSpec, "throw">): {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
} {
  return { ok: spec.ok, status: spec.status, json: async () => spec.json };
}

/** A fetch mock that routes by provider host so a single test can set
 *  distinct OpenAI + Deepgram responses. */
function routedFetch(specs: { openai?: RespSpec; deepgram?: RespSpec }) {
  const fn = vi.fn(async (url: unknown) => {
    const u = String(url);
    if (u.includes("api.openai.com")) {
      if (specs.openai === undefined) throw new Error("unexpected openai call");
      if (specs.openai === "throw") throw new Error("network");
      return mkResp(specs.openai);
    }
    if (u.includes("api.deepgram.com")) {
      if (specs.deepgram === undefined) throw new Error("unexpected deepgram call");
      if (specs.deepgram === "throw") throw new Error("network");
      return mkResp(specs.deepgram);
    }
    throw new Error(`unexpected fetch url: ${u}`);
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const OPENAI_OK: RespSpec = { ok: true, status: 200, json: { text: "openai heard this" } };
const OPENAI_QUOTA: RespSpec = { ok: false, status: 429, json: { error: { type: "insufficient_quota" } } };
const OPENAI_RATE: RespSpec = { ok: false, status: 429, json: { error: { code: "rate_limit_exceeded" } } };
const OPENAI_500: RespSpec = { ok: false, status: 500, json: {} };
const OPENAI_400: RespSpec = { ok: false, status: 400, json: { error: { type: "invalid_request_error" } } };
const OPENAI_401: RespSpec = { ok: false, status: 401, json: { error: { code: "invalid_api_key" } } };
const OPENAI_EMPTY: RespSpec = { ok: true, status: 200, json: { text: "" } };
const DG_OK: RespSpec = {
  ok: true,
  status: 200,
  json: { results: { channels: [{ alternatives: [{ transcript: "deepgram heard this" }] }] } },
};
const DG_429: RespSpec = { ok: false, status: 429, json: {} };
const DG_402: RespSpec = { ok: false, status: 402, json: {} };

function urlsCalled(fn: ReturnType<typeof routedFetch>): string[] {
  return fn.mock.calls.map((c) => String(c[0]));
}
const hitOpenAi = (fn: ReturnType<typeof routedFetch>) =>
  urlsCalled(fn).some((u) => u.includes("api.openai.com"));
const hitDeepgram = (fn: ReturnType<typeof routedFetch>) =>
  urlsCalled(fn).some((u) => u.includes("api.deepgram.com"));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OPENAI_API_KEY = "sk-test-key-1234567890";
  process.env.DEEPGRAM_API_KEY = "dg-test-key-1234567890";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (ORIGINAL_OPENAI === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = ORIGINAL_OPENAI;
  if (ORIGINAL_DEEPGRAM === undefined) delete process.env.DEEPGRAM_API_KEY;
  else process.env.DEEPGRAM_API_KEY = ORIGINAL_DEEPGRAM;
});

describe("classifyOpenAiHttp + classifyDeepgramHttp", () => {
  it("OpenAI: 401/403→AUTH, 402/429-quota→BILLING, 429→RATE, 404→MODEL, 400→BAD, 5xx→UNAVAIL", () => {
    expect(classifyOpenAiHttp(401)).toBe("STT_PROVIDER_AUTH_FAILED");
    expect(classifyOpenAiHttp(403)).toBe("STT_PROVIDER_AUTH_FAILED");
    expect(classifyOpenAiHttp(402)).toBe("STT_PROVIDER_BILLING");
    expect(classifyOpenAiHttp(429, "insufficient_quota")).toBe("STT_PROVIDER_BILLING");
    expect(classifyOpenAiHttp(429, undefined, "rate_limit_exceeded")).toBe("STT_PROVIDER_RATE_LIMITED");
    expect(classifyOpenAiHttp(404)).toBe("STT_MODEL_UNAVAILABLE");
    expect(classifyOpenAiHttp(400)).toBe("STT_BAD_AUDIO");
    expect(classifyOpenAiHttp(500)).toBe("STT_PROVIDER_UNAVAILABLE");
  });
  it("Deepgram: 401/403→AUTH, 402/insufficient→BILLING, 429→RATE, 400→BAD, 5xx→UNAVAIL", () => {
    expect(classifyDeepgramHttp(401)).toBe("STT_PROVIDER_AUTH_FAILED");
    expect(classifyDeepgramHttp(402)).toBe("STT_PROVIDER_BILLING");
    expect(classifyDeepgramHttp(200, "INSUFFICIENT_CREDITS")).toBe("STT_PROVIDER_BILLING");
    expect(classifyDeepgramHttp(429)).toBe("STT_PROVIDER_RATE_LIMITED");
    expect(classifyDeepgramHttp(400)).toBe("STT_BAD_AUDIO");
    expect(classifyDeepgramHttp(503)).toBe("STT_PROVIDER_UNAVAILABLE");
  });
});

describe("callWhisperTranscription — provider honesty (sanity)", () => {
  it("success → transcript + provider openai-whisper", async () => {
    routedFetch({ openai: OPENAI_OK });
    const r = await callWhisperTranscription(Buffer.alloc(64, 1), "audio/webm");
    expect(r).toEqual({ ok: true, transcript: "openai heard this", provider: "openai-whisper" });
  });
  it("missing key → STT_NOT_CONFIGURED, no call", async () => {
    delete process.env.OPENAI_API_KEY;
    const fn = vi.fn();
    vi.stubGlobal("fetch", fn);
    const r = await callWhisperTranscription(Buffer.alloc(64, 1), "audio/webm");
    expect(r).toEqual({ ok: false, code: "STT_NOT_CONFIGURED" });
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("transcribeVoiceCommandForCaller — ordered fallback", () => {
  const caller = "1".repeat(36);

  it("1. OpenAI success → no Deepgram call", async () => {
    const fn = routedFetch({ openai: OPENAI_OK });
    const r = await transcribeVoiceCommandForCaller({ callerEntityId: caller, audioBase64: audioBase64(), mimeType: "audio/webm" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.provider).toBe("openai-whisper");
    expect(hitDeepgram(fn)).toBe(false);
  });

  it("2. OpenAI billing/quota → Deepgram success", async () => {
    const fn = routedFetch({ openai: OPENAI_QUOTA, deepgram: DG_OK });
    const r = await transcribeVoiceCommandForCaller({ callerEntityId: caller, audioBase64: audioBase64(), mimeType: "audio/webm" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.provider).toBe("deepgram");
    expect(hitOpenAi(fn)).toBe(true);
    expect(hitDeepgram(fn)).toBe(true);
  });

  it("3. OpenAI rate-limited → Deepgram success", async () => {
    routedFetch({ openai: OPENAI_RATE, deepgram: DG_OK });
    const r = await transcribeVoiceCommandForCaller({ callerEntityId: caller, audioBase64: audioBase64(), mimeType: "audio/webm" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.provider).toBe("deepgram");
  });

  it("4. OpenAI unavailable/network → Deepgram success", async () => {
    routedFetch({ openai: "throw", deepgram: DG_OK });
    const r = await transcribeVoiceCommandForCaller({ callerEntityId: caller, audioBase64: audioBase64(), mimeType: "audio/webm" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.provider).toBe("deepgram");
  });

  it("5. OpenAI not configured → Deepgram directly", async () => {
    delete process.env.OPENAI_API_KEY;
    const fn = routedFetch({ deepgram: DG_OK });
    const r = await transcribeVoiceCommandForCaller({ callerEntityId: caller, audioBase64: audioBase64(), mimeType: "audio/webm" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.provider).toBe("deepgram");
    expect(hitOpenAi(fn)).toBe(false);
  });

  it("6. OpenAI bad audio → NO fallback, STT_BAD_AUDIO", async () => {
    const fn = routedFetch({ openai: OPENAI_400 });
    const r = await transcribeVoiceCommandForCaller({ callerEntityId: caller, audioBase64: audioBase64(), mimeType: "audio/webm" });
    expect(r).toEqual({ ok: false, httpStatus: 422, code: "STT_BAD_AUDIO" });
    expect(hitDeepgram(fn)).toBe(false);
  });

  it("7. OpenAI no speech → NO fallback, STT_NO_SPEECH", async () => {
    const fn = routedFetch({ openai: OPENAI_EMPTY });
    const r = await transcribeVoiceCommandForCaller({ callerEntityId: caller, audioBase64: audioBase64(), mimeType: "audio/webm" });
    expect(r).toEqual({ ok: false, httpStatus: 422, code: "STT_NO_SPEECH" });
    expect(hitDeepgram(fn)).toBe(false);
  });

  it("8. OpenAI auth failed → NO fallback, STT_PROVIDER_AUTH_FAILED", async () => {
    const fn = routedFetch({ openai: OPENAI_401 });
    const r = await transcribeVoiceCommandForCaller({ callerEntityId: caller, audioBase64: audioBase64(), mimeType: "audio/webm" });
    expect(r).toEqual({ ok: false, httpStatus: 503, code: "STT_PROVIDER_AUTH_FAILED" });
    expect(hitDeepgram(fn)).toBe(false);
  });

  it("9. neither configured → STT_NOT_CONFIGURED", async () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.DEEPGRAM_API_KEY;
    const fn = vi.fn();
    vi.stubGlobal("fetch", fn);
    const r = await transcribeVoiceCommandForCaller({ callerEntityId: caller, audioBase64: audioBase64(), mimeType: "audio/webm" });
    expect(r).toEqual({ ok: false, httpStatus: 503, code: "STT_NOT_CONFIGURED" });
    expect(fn).not.toHaveBeenCalled();
  });

  it("10. OpenAI billing + Deepgram billing → final STT_PROVIDER_BILLING", async () => {
    routedFetch({ openai: OPENAI_QUOTA, deepgram: DG_402 });
    const r = await transcribeVoiceCommandForCaller({ callerEntityId: caller, audioBase64: audioBase64(), mimeType: "audio/webm" });
    expect(r).toEqual({ ok: false, httpStatus: 503, code: "STT_PROVIDER_BILLING" });
  });

  it("10b. OpenAI billing + Deepgram rate-limit → BILLING wins (clearest/actionable)", async () => {
    routedFetch({ openai: OPENAI_QUOTA, deepgram: DG_429 });
    const r = await transcribeVoiceCommandForCaller({ callerEntityId: caller, audioBase64: audioBase64(), mimeType: "audio/webm" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("STT_PROVIDER_BILLING");
  });
});

describe("transcribeVoiceCommandForCaller — SAFE audit", () => {
  const caller = "1".repeat(36);

  it("11. success audit records providers_attempted + winning_provider", async () => {
    routedFetch({ openai: OPENAI_QUOTA, deepgram: DG_OK });
    await transcribeVoiceCommandForCaller({ callerEntityId: caller, audioBase64: audioBase64(), mimeType: "audio/webm" });
    const event = writeAuditEventMock.mock.calls.at(-1)![0] as {
      event_type: string;
      details: Record<string, unknown>;
    };
    expect(event.event_type).toBe("AUDIO_CAPTURE_TRANSCRIBED");
    expect(event.details.winning_provider).toBe("deepgram");
    expect(event.details.providers_attempted).toEqual(["openai-whisper", "deepgram"]);
    expect(event.details.transcript_chars).toBe("deepgram heard this".length);
  });

  it("12. failure audit records providers_attempted + safe failure class", async () => {
    routedFetch({ openai: OPENAI_QUOTA, deepgram: DG_402 });
    await transcribeVoiceCommandForCaller({ callerEntityId: caller, audioBase64: audioBase64(), mimeType: "audio/webm" });
    const event = writeAuditEventMock.mock.calls.at(-1)![0] as {
      event_type: string;
      outcome: string;
      details: Record<string, unknown>;
    };
    expect(event.event_type).toBe("AUDIO_CAPTURE_FAILED");
    expect(event.outcome).toBe("ERROR");
    expect(event.details.providers_attempted).toEqual(["openai-whisper", "deepgram"]);
    expect(event.details.failure_class).toBe("STT_PROVIDER_BILLING");
  });

  it("13. no transcript text or raw audio appears in audit details", async () => {
    const audio = audioBase64(128);
    routedFetch({ openai: OPENAI_OK });
    await transcribeVoiceCommandForCaller({ callerEntityId: caller, audioBase64: audio, mimeType: "audio/webm" });
    const event = writeAuditEventMock.mock.calls.at(-1)![0] as {
      details: Record<string, unknown>;
    };
    const serialized = JSON.stringify(event.details);
    expect(serialized).not.toContain("openai heard this");
    expect(serialized).not.toContain(audio);
  });

  it("INVALID_AUDIO pre-flight rejects empty/oversize before any provider call", async () => {
    const fn = vi.fn();
    vi.stubGlobal("fetch", fn);
    const empty = await transcribeVoiceCommandForCaller({ callerEntityId: caller, audioBase64: "", mimeType: "audio/webm" });
    expect(empty).toEqual({ ok: false, httpStatus: 422, code: "INVALID_AUDIO" });
    const oversize = Buffer.alloc(MAX_AUDIO_BYTES + 1, 9).toString("base64");
    const big = await transcribeVoiceCommandForCaller({ callerEntityId: caller, audioBase64: oversize, mimeType: "audio/webm" });
    expect(big.ok).toBe(false);
    if (!big.ok) expect(big.code).toBe("INVALID_AUDIO");
    expect(fn).not.toHaveBeenCalled();
  });
});
