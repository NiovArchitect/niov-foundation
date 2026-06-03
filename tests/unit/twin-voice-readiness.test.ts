// FILE: twin-voice-readiness.test.ts (unit)
// PURPOSE: Phase EDX-1 employee Twin self-state extension per the
//          [FOUNDER-AUTH — EVERYDAY EMPLOYEE DOMAIN GENERAL
//          INTELLIGENCE EXPERIENCE] directive. Unit tests for the
//          constant-projection helper that exposes which voice
//          surfaces are LIVE today vs forward-substrate Founder-
//          gated.
//
// CONNECTS TO:
//   - apps/api/src/services/otzar/twin-voice-readiness.ts

import { describe, expect, it } from "vitest";
import { computeVoiceReadinessState } from "../../apps/api/src/services/otzar/twin-voice-readiness.js";

describe("computeVoiceReadinessState — canonical values", () => {
  it("returns envelope_construction = LIVE (VF.4 + ADR-0093 §10 base-tier)", () => {
    const state = computeVoiceReadinessState();
    expect(state.envelope_construction).toBe("LIVE");
  });

  it("returns live_audio_input = NOT_AVAILABLE_AT_FOUNDATION_TIER (Founder-gated per ADR-0085)", () => {
    const state = computeVoiceReadinessState();
    expect(state.live_audio_input).toBe("NOT_AVAILABLE_AT_FOUNDATION_TIER");
  });

  it("returns live_audio_output = NOT_AVAILABLE_AT_FOUNDATION_TIER (Founder-gated per ADR-0089)", () => {
    const state = computeVoiceReadinessState();
    expect(state.live_audio_output).toBe("NOT_AVAILABLE_AT_FOUNDATION_TIER");
  });
});

describe("computeVoiceReadinessState — shape invariant", () => {
  it("returns exactly 3 documented fields", () => {
    const state = computeVoiceReadinessState();
    expect(Object.keys(state).sort()).toEqual([
      "envelope_construction",
      "live_audio_input",
      "live_audio_output",
    ]);
  });

  it("never returns provider IDs / API keys / model names / vendor identifiers / endpoint URLs", () => {
    const state = computeVoiceReadinessState();
    const serialized = JSON.stringify(state);
    // Negative-presence sanity — any vendor / secret-shaped string
    // would be a red flag. The closed-vocab values are explicit.
    expect(serialized).not.toMatch(/api[_-]?key/i);
    expect(serialized).not.toMatch(/secret/i);
    expect(serialized).not.toMatch(/https?:\/\//);
    expect(serialized).not.toMatch(/Bearer/i);
    expect(serialized).not.toMatch(/sk[_-]/);
  });

  it("returns a deterministic value (same call = same shape)", () => {
    const a = computeVoiceReadinessState();
    const b = computeVoiceReadinessState();
    expect(a).toEqual(b);
  });
});
