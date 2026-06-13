// FILE: scripts/diagnostics/verify-openai-transcription.ts
// PURPOSE: Phase 1264 verification pass — a SAFE, local diagnostic that
//          answers "is the OpenAI Whisper STT path actually blocked, and
//          by what?" without exposing any secret. It calls the SAME
//          transcription service path the /otzar/voice/transcribe route
//          uses, then prints the closed-vocab result + a plain-English
//          likely cause (auth vs billing vs rate-limit vs model vs bad
//          audio vs network).
//
// SAFETY:
//   - Prints OPENAI_API_KEY presence as a boolean ONLY (true/false) —
//     never the value, never any part of it.
//   - Never reads or prints .env; it reads only process.env that the
//     caller's environment already provides.
//   - Generates a tiny in-memory silent WAV by default (no file
//     committed). Optionally accepts a path to a LOCAL audio file
//     (argv[2]) which is NOT committed.
//   - Prints transcript LENGTH only, never the transcript text; never
//     the audio bytes.
//
// USAGE (run with the API's environment loaded, e.g. from the demo
//   launcher shell so OPENAI_API_KEY is present):
//     npx tsx scripts/diagnostics/verify-openai-transcription.ts
//     npx tsx scripts/diagnostics/verify-openai-transcription.ts ./sample.webm
//
// CONNECTS TO: apps/api/src/services/voice/transcription.service.ts.

import { readFileSync } from "node:fs";
import {
  callWhisperTranscription,
  WHISPER_MODEL,
  WHISPER_ENDPOINT,
  type TranscribeFailureCode,
} from "@niov/api";

/** Build a tiny, valid 16-bit PCM mono WAV of silence — enough for a
 *  reachability/auth/billing probe. A successful auth+billed call on
 *  silence returns STT_NO_SPEECH, which PROVES the path works. */
function tinySilentWav(seconds = 0.3, sampleRate = 16000): Buffer {
  const numSamples = Math.floor(seconds * sampleRate);
  const dataSize = numSamples * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32); // block align
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  // Sample region is already zero-filled (silence).
  return buf;
}

function mimeFromPath(p: string): string {
  const lower = p.toLowerCase();
  if (lower.endsWith(".webm")) return "audio/webm";
  if (lower.endsWith(".mp4") || lower.endsWith(".m4a")) return "audio/mp4";
  if (lower.endsWith(".mp3") || lower.endsWith(".mpeg")) return "audio/mpeg";
  if (lower.endsWith(".ogg")) return "audio/ogg";
  return "audio/wav";
}

function diagnose(code: TranscribeFailureCode | "OK"): string {
  switch (code) {
    case "OK":
      return "OpenAI Whisper path is FULLY WORKING (auth + billing + model all good).";
    case "STT_NO_SPEECH":
      return "OpenAI is REACHABLE, AUTHORIZED, and BILLED — it processed the audio and heard no speech (expected for the silent probe). The Whisper path WORKS; the in-app billing error is NOT a key/billing problem for a real clip.";
    case "STT_NOT_CONFIGURED":
      return "OPENAI_API_KEY is not present in THIS process. Run this with the API's environment loaded, or set the key in the deployment.";
    case "STT_PROVIDER_AUTH_FAILED":
      return "Auth failed (401/403): the OpenAI key or project is wrong/forbidden. Check the key and that the project has audio access.";
    case "STT_PROVIDER_BILLING":
      return "Billing/quota block (402 or 429 insufficient_quota): the OpenAI account needs billing attention / has exhausted quota.";
    case "STT_PROVIDER_RATE_LIMITED":
      return "Rate limited (429, not a quota block): too many requests right now. Retry shortly; this is transient.";
    case "STT_MODEL_UNAVAILABLE":
      return `Model unavailable (404/model error): '${WHISPER_MODEL}' is not accessible to this OpenAI project.`;
    case "STT_BAD_AUDIO":
      return "OpenAI rejected the request (400): likely an audio format/parameter issue, not billing.";
    case "STT_PROVIDER_UNAVAILABLE":
      return "Network / 5xx: OpenAI was unreachable or returned a server error. Transient — retry.";
    case "INVALID_AUDIO":
      return "The probe audio was empty/oversize (should not happen for the built-in WAV).";
  }
}

async function main(): Promise<void> {
  const key = process.env.OPENAI_API_KEY;
  const keyPresent = typeof key === "string" && key.length >= 10;
  // Boolean only — never the value.
  console.log("OPENAI_API_KEY present:", keyPresent);
  console.log("model:", WHISPER_MODEL);
  console.log("endpoint:", WHISPER_ENDPOINT);

  const argPath = process.argv[2];
  let audio: Buffer;
  let mime: string;
  if (argPath !== undefined && argPath.length > 0) {
    audio = readFileSync(argPath);
    mime = mimeFromPath(argPath);
    console.log(`audio: local file (${audio.length} bytes, ${mime})`);
  } else {
    audio = tinySilentWav();
    mime = "audio/wav";
    console.log(`audio: in-memory silent WAV (${audio.length} bytes, ${mime})`);
  }

  const result = await callWhisperTranscription(audio, mime);
  if (result.ok) {
    console.log("provider:", result.provider);
    console.log("result_code:", "OK");
    console.log("transcript_length:", result.transcript.length); // length only
    console.log("DIAGNOSIS:", diagnose("OK"));
  } else {
    console.log("provider:", "openai-whisper");
    console.log("result_code:", result.code);
    console.log("http_status:", result.httpStatus ?? "n/a");
    console.log("DIAGNOSIS:", diagnose(result.code));
  }
}

main().catch((err: unknown) => {
  // Never print secrets; surface only an error class.
  console.error(
    "diagnostic failed:",
    err instanceof Error ? err.name : "unknown-error",
  );
  process.exitCode = 1;
});
