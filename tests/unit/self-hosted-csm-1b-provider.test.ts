// FILE: self-hosted-csm-1b-provider.test.ts (unit)
// PURPOSE: ADR-0089 §5 + §9 VS5 forward-substrate seat tests.
//          Verifies the SelfHostedCsm1bVoiceProvider adapter seam
//          implements VoiceProviderAdapter correctly,
//          delegates to the inner provider at this slice, and
//          downgrades mode to "fixture" so consumers can NEVER
//          confuse a seat-tier output for real CSM-1B inference.
// CONNECTS TO: apps/api/src/services/voice/self-hosted-csm-1b.provider.ts
//              via @niov/api.

import { describe, expect, it } from "vitest";
import {
  LocalMockVoiceProvider,
  SelfHostedCsm1bVoiceProvider,
  type AudioRef,
  type SynthesizeResult,
  type TranscribeResult,
  type VoiceProviderAdapter,
} from "@niov/api";

// =====================================================================
// 1. Constructor + default delegate
// =====================================================================

describe("SelfHostedCsm1bVoiceProvider — construction", () => {
  it("default constructor uses LocalMockVoiceProvider as the inner delegate", () => {
    const p = new SelfHostedCsm1bVoiceProvider();
    expect(p).toBeInstanceOf(SelfHostedCsm1bVoiceProvider);
  });

  it("accepts an explicit inner provider via DI", () => {
    const inner = new LocalMockVoiceProvider();
    const p = new SelfHostedCsm1bVoiceProvider(inner);
    expect(p).toBeInstanceOf(SelfHostedCsm1bVoiceProvider);
  });
});

// =====================================================================
// 2. transcribe — delegate + mode downgrade
// =====================================================================

describe("SelfHostedCsm1bVoiceProvider.transcribe", () => {
  it("delegates to the inner provider on happy path", async () => {
    const p = new SelfHostedCsm1bVoiceProvider();
    const r = await p.transcribe({ text_only_payload: "hello world" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(typeof r.transcript_text).toBe("string");
      expect(r.transcript_text.length).toBeGreaterThan(0);
      expect(typeof r.redacted).toBe("boolean");
    }
  });

  it("downgrades mode to \"fixture\" even when inner reports otherwise — VS5 invariant", async () => {
    // Fake inner that lies about being "real" — the seam must NEVER let
    // that propagate at this slice.
    const lyingInner: VoiceProviderAdapter = {
      async transcribe(_ref: AudioRef): Promise<TranscribeResult> {
        return {
          ok: true,
          transcript_text: "deceptive",
          redacted: false,
          mode: "real",
        };
      },
      async synthesize(_t: string, _v: string): Promise<SynthesizeResult> {
        return {
          ok: false,
          error_class: "PROVIDER_ERROR",
          message: "unused in this test",
        };
      },
    };
    const p = new SelfHostedCsm1bVoiceProvider(lyingInner);
    const r = await p.transcribe({ text_only_payload: "x" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.mode).toBe("fixture");
  });

  it("propagates inner failure verbatim (error_class + message intact)", async () => {
    const failingInner: VoiceProviderAdapter = {
      async transcribe(): Promise<TranscribeResult> {
        return {
          ok: false,
          error_class: "TIMEOUT",
          message: "inner timed out",
        };
      },
      async synthesize(): Promise<SynthesizeResult> {
        return {
          ok: false,
          error_class: "PROVIDER_ERROR",
          message: "unused",
        };
      },
    };
    const p = new SelfHostedCsm1bVoiceProvider(failingInner);
    const r = await p.transcribe({ text_only_payload: "x" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error_class).toBe("TIMEOUT");
      expect(r.message).toBe("inner timed out");
    }
  });
});

// =====================================================================
// 3. synthesize — delegate + mode downgrade
// =====================================================================

describe("SelfHostedCsm1bVoiceProvider.synthesize", () => {
  it("delegates to the inner provider on happy path", async () => {
    const p = new SelfHostedCsm1bVoiceProvider();
    const r = await p.synthesize("hello", "voice-1");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.audio_ref).toBeDefined();
    }
  });

  it("downgrades mode to \"fixture\" even when inner reports otherwise — VS5 invariant", async () => {
    const lyingInner: VoiceProviderAdapter = {
      async transcribe(): Promise<TranscribeResult> {
        return {
          ok: false,
          error_class: "PROVIDER_ERROR",
          message: "unused",
        };
      },
      async synthesize(): Promise<SynthesizeResult> {
        return {
          ok: true,
          audio_ref: { fixture_key: "lying" },
          mode: "real",
        };
      },
    };
    const p = new SelfHostedCsm1bVoiceProvider(lyingInner);
    const r = await p.synthesize("x", "v");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.mode).toBe("fixture");
  });

  it("propagates inner failure verbatim", async () => {
    const failingInner: VoiceProviderAdapter = {
      async transcribe(): Promise<TranscribeResult> {
        return {
          ok: false,
          error_class: "PROVIDER_ERROR",
          message: "unused",
        };
      },
      async synthesize(): Promise<SynthesizeResult> {
        return {
          ok: false,
          error_class: "NOT_CONFIGURED",
          message: "missing config",
        };
      },
    };
    const p = new SelfHostedCsm1bVoiceProvider(failingInner);
    const r = await p.synthesize("x", "v");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error_class).toBe("NOT_CONFIGURED");
      expect(r.message).toBe("missing config");
    }
  });
});

// =====================================================================
// 4. Substrate-honest invariant — seam never claims "real" output
// =====================================================================

describe("SelfHostedCsm1bVoiceProvider — substrate-honest invariant", () => {
  it("transcribe + synthesize round-trip across LocalMockVoiceProvider delegate", async () => {
    const p = new SelfHostedCsm1bVoiceProvider();
    const t = await p.transcribe({ text_only_payload: "round-trip" });
    expect(t.ok).toBe(true);
    if (t.ok) expect(t.mode).toBe("fixture");
    const s = await p.synthesize("round-trip", "voice-1");
    expect(s.ok).toBe(true);
    if (s.ok) expect(s.mode).toBe("fixture");
  });

  it("a consumer reading mode can NEVER receive \"real\" from this seat at this slice (VS5 invariant)", async () => {
    // Iterate across multiple inner providers — even ones that lie —
    // and assert mode is always "fixture" when ok is true. This is the
    // canonical seat-tier invariant that VS5 will be explicitly
    // authorized to lift.
    const inners: VoiceProviderAdapter[] = [
      new LocalMockVoiceProvider(),
      {
        async transcribe(): Promise<TranscribeResult> {
          return {
            ok: true,
            transcript_text: "test",
            redacted: false,
            mode: "real",
          };
        },
        async synthesize(): Promise<SynthesizeResult> {
          return {
            ok: true,
            audio_ref: { fixture_key: "x" },
            mode: "real",
          };
        },
      },
    ];
    for (const inner of inners) {
      const p = new SelfHostedCsm1bVoiceProvider(inner);
      const t = await p.transcribe({ text_only_payload: "x" });
      if (t.ok) expect(t.mode).toBe("fixture");
      const s = await p.synthesize("x", "v");
      if (s.ok) expect(s.mode).toBe("fixture");
    }
  });
});
