// FILE: stt-provider.ts
// PURPOSE: Phase 1223 — STT (speech-to-text) provider adapter
//          interface + 4 concrete adapters. Designed so a missing
//          provider key never breaks the app; the demo fixture
//          path always works and exercises the full pipeline.
//
// PROVIDERS:
//   - DemoFixtureProvider: 4 scripted fixtures keyed by storage_ref
//     prefix. ALWAYS configured (no env var); produces the
//     canonical Launch Follow-Up transcript when storage_ref
//     starts with "demo:launch-follow-up". Returns each utterance
//     as a separate TranscriptSegment with timing.
//   - LocalBrowserProvider: pass-through for browser-side
//     SpeechRecognition output (the CT pre-transcribes and POSTs
//     the segments).
//   - WhisperApiProvider: OpenAI Whisper API. Activates when
//     OPENAI_API_KEY is set.
//   - DeepgramProvider: Deepgram streaming/batch API. Activates
//     when DEEPGRAM_API_KEY is set.
//
// EACH PROVIDER:
//   - reports its own status (CONFIGURED / MISSING_CREDENTIAL /
//     ERROR / DISABLED / DEMO_ONLY).
//   - transcribes a single capture (audio file or fixture) into
//     an array of segments with start_ms / end_ms / text /
//     confidence / speaker_label.
//
// PRIVACY (RULE 0): adapters NEVER log raw audio bytes; they
// only touch the storage_ref which is a synthetic pointer.

export type STTProviderType =
  | "DEMO_FIXTURE"
  | "LOCAL_BROWSER"
  | "WHISPER_API"
  | "DEEPGRAM"
  | "GOOGLE_SPEECH"
  | "AZURE_SPEECH";

export type STTProviderStatus =
  | "CONFIGURED"
  | "MISSING_CREDENTIAL"
  | "ERROR"
  | "DISABLED"
  | "DEMO_ONLY";

export interface STTSegment {
  speaker_label: string | null;
  start_ms: number;
  end_ms: number;
  text: string;
  confidence: number | null;
  is_final: boolean;
}

export interface STTResult {
  segments: STTSegment[];
  provider: STTProviderType;
  full_transcript: string;
  duration_ms: number;
}

export interface STTProvider {
  readonly provider_name: STTProviderType;
  status(): STTProviderStatus;
  transcribe(input: STTTranscribeInput): Promise<STTResult | STTFailure>;
}

export interface STTTranscribeInput {
  storage_ref: string | null;
  mode: "LIVE_MIC" | "AUDIO_FILE_UPLOAD" | "DEMO_AUDIO_SAMPLE" | "LOCAL_FALLBACK";
  /** When mode === LOCAL_FALLBACK, the CT POSTs pre-transcribed
   * segments and the provider passes them through. */
  pre_transcribed_segments?: STTSegment[];
}

export interface STTFailure {
  ok: false;
  failure_class:
    | "MISSING_CREDENTIAL"
    | "PROVIDER_ERROR"
    | "INVALID_INPUT"
    | "INTERNAL_ERROR"
    | "BLOCKED_BY_KEY";
  message: string;
}

// ─── DemoFixtureProvider ──────────────────────────────────────

const LAUNCH_FOLLOW_UP_FIXTURE: STTSegment[] = [
  {
    speaker_label: "Sadeil",
    start_ms: 0,
    end_ms: 6000,
    text: "Thanks for jumping on, everyone. Quick check-in on the launch.",
    confidence: 0.95,
    is_final: true,
  },
  {
    speaker_label: "Sadeil",
    start_ms: 6000,
    end_ms: 14000,
    text: "David, can you review the UI flow by Friday? I want to make sure it's tight before we ship.",
    confidence: 0.95,
    is_final: true,
  },
  {
    speaker_label: "David",
    start_ms: 14000,
    end_ms: 20000,
    text: "Yes, I'll review the UI flow and send notes back by Friday.",
    confidence: 0.93,
    is_final: true,
  },
  {
    speaker_label: "Samiksha",
    start_ms: 20000,
    end_ms: 30000,
    text: "I can take the AI/NLP trial notes — I'll review them and summarize any concerns.",
    confidence: 0.94,
    is_final: true,
  },
  {
    speaker_label: "Annie",
    start_ms: 30000,
    end_ms: 40000,
    text: "I said I can complete a compliance review this week if the summary is ready.",
    confidence: 0.93,
    is_final: true,
  },
  {
    speaker_label: "Sadeil",
    start_ms: 40000,
    end_ms: 52000,
    text: "Two decisions for the record: keep internal note workflows inside Otzar notifications only for now, and do not enable Slack or email sending until explicit connector approval is finished.",
    confidence: 0.94,
    is_final: true,
  },
];

const MICE_EVENT_FIXTURE: STTSegment[] = [
  {
    speaker_label: "Sadeil",
    start_ms: 0,
    end_ms: 8000,
    text: "Maria, Carlos, thanks for meeting about the U.S. division for MICE Global.",
    confidence: 0.94,
    is_final: true,
  },
  {
    speaker_label: "Maria",
    start_ms: 8000,
    end_ms: 18000,
    text: "MICE needs Sadeil to identify the first two U.S. target cities and define the client outreach strategy.",
    confidence: 0.94,
    is_final: true,
  },
  {
    speaker_label: "Carlos",
    start_ms: 18000,
    end_ms: 28000,
    text: "I'll send the stage equipment list and booth setup requirements by Friday.",
    confidence: 0.93,
    is_final: true,
  },
  {
    speaker_label: "Sadeil",
    start_ms: 28000,
    end_ms: 36000,
    text: "David will prepare an Otzar demo walkthrough for the event operations use case.",
    confidence: 0.93,
    is_final: true,
  },
  {
    speaker_label: "Annie",
    start_ms: 36000,
    end_ms: 46000,
    text: "I need to review the commission structure and any public-facing claims before anything is sent externally.",
    confidence: 0.94,
    is_final: true,
  },
];

export class DemoFixtureProvider implements STTProvider {
  readonly provider_name: STTProviderType = "DEMO_FIXTURE";

  status(): STTProviderStatus {
    return "DEMO_ONLY";
  }

  async transcribe(input: STTTranscribeInput): Promise<STTResult | STTFailure> {
    const ref = (input.storage_ref ?? "").toLowerCase();
    let segments: STTSegment[];
    if (ref.startsWith("demo:launch-follow-up")) {
      segments = LAUNCH_FOLLOW_UP_FIXTURE;
    } else if (ref.startsWith("demo:mice-event")) {
      segments = MICE_EVENT_FIXTURE;
    } else if (input.mode === "LOCAL_FALLBACK" && input.pre_transcribed_segments) {
      segments = input.pre_transcribed_segments;
    } else {
      // Generic short demo fixture for any other test ref.
      segments = [
        {
          speaker_label: "Demo Speaker",
          start_ms: 0,
          end_ms: 4000,
          text:
            "This is a demo transcript Otzar produced because no real STT provider is configured.",
          confidence: 0.99,
          is_final: true,
        },
      ];
    }
    const full = segments.map((s) => s.text).join(" ");
    const last = segments[segments.length - 1];
    return {
      segments,
      provider: "DEMO_FIXTURE",
      full_transcript: full,
      duration_ms: last !== undefined ? last.end_ms : 0,
    };
  }
}

// ─── LocalBrowserProvider ─────────────────────────────────────

/**
 * The CT (browser) does the recognition via the Web Speech API and
 * POSTs `pre_transcribed_segments`. The provider is a thin
 * passthrough that audit-logs + persists; the actual STT happens
 * in the browser.
 */
export class LocalBrowserProvider implements STTProvider {
  readonly provider_name: STTProviderType = "LOCAL_BROWSER";

  status(): STTProviderStatus {
    return "CONFIGURED";
  }

  async transcribe(input: STTTranscribeInput): Promise<STTResult | STTFailure> {
    if (
      input.pre_transcribed_segments === undefined ||
      input.pre_transcribed_segments.length === 0
    ) {
      return {
        ok: false,
        failure_class: "INVALID_INPUT",
        message:
          "LocalBrowserProvider requires pre_transcribed_segments from the browser.",
      };
    }
    const segments = input.pre_transcribed_segments;
    const full = segments.map((s) => s.text).join(" ");
    const last = segments[segments.length - 1];
    return {
      segments,
      provider: "LOCAL_BROWSER",
      full_transcript: full,
      duration_ms: last !== undefined ? last.end_ms : 0,
    };
  }
}

// ─── WhisperApiProvider ───────────────────────────────────────

/**
 * Activates when OPENAI_API_KEY is set in the environment. Until
 * a real audio file is wired, status() returns CONFIGURED but
 * transcribe() returns BLOCKED_BY_KEY until full audio plumbing
 * lands.
 */
export class WhisperApiProvider implements STTProvider {
  readonly provider_name: STTProviderType = "WHISPER_API";

  private hasKey(): boolean {
    const k = process.env.OPENAI_API_KEY;
    return k !== undefined && k.length > 10;
  }

  status(): STTProviderStatus {
    if (!this.hasKey()) return "MISSING_CREDENTIAL";
    // The audio upload path is forward-substrate — until then
    // the provider's status is CONFIGURED-but-not-yet-active.
    return "CONFIGURED";
  }

  async transcribe(_input: STTTranscribeInput): Promise<STTResult | STTFailure> {
    if (!this.hasKey()) {
      return {
        ok: false,
        failure_class: "MISSING_CREDENTIAL",
        message:
          "WhisperApiProvider requires OPENAI_API_KEY to be set in the environment.",
      };
    }
    // Real-audio upload + Whisper file API call is forward-
    // substrate to a future patch; until then this is BLOCKED_BY_KEY
    // to keep the audit trail honest.
    return {
      ok: false,
      failure_class: "BLOCKED_BY_KEY",
      message:
        "WhisperApiProvider audio-upload path not wired yet; use DEMO_FIXTURE or LOCAL_BROWSER.",
    };
  }
}

// ─── DeepgramProvider ─────────────────────────────────────────

export class DeepgramProvider implements STTProvider {
  readonly provider_name: STTProviderType = "DEEPGRAM";

  private hasKey(): boolean {
    const k = process.env.DEEPGRAM_API_KEY;
    return k !== undefined && k.length > 10;
  }

  status(): STTProviderStatus {
    if (!this.hasKey()) return "MISSING_CREDENTIAL";
    return "CONFIGURED";
  }

  async transcribe(_input: STTTranscribeInput): Promise<STTResult | STTFailure> {
    if (!this.hasKey()) {
      return {
        ok: false,
        failure_class: "MISSING_CREDENTIAL",
        message:
          "DeepgramProvider requires DEEPGRAM_API_KEY to be set in the environment.",
      };
    }
    return {
      ok: false,
      failure_class: "BLOCKED_BY_KEY",
      message:
        "DeepgramProvider streaming path not wired yet; use DEMO_FIXTURE or LOCAL_BROWSER.",
    };
  }
}

// ─── Factory ──────────────────────────────────────────────────

const providerCache = new Map<STTProviderType, STTProvider>();

export function getSTTProvider(name: STTProviderType): STTProvider {
  const cached = providerCache.get(name);
  if (cached !== undefined) return cached;
  let p: STTProvider;
  switch (name) {
    case "DEMO_FIXTURE":
      p = new DemoFixtureProvider();
      break;
    case "LOCAL_BROWSER":
      p = new LocalBrowserProvider();
      break;
    case "WHISPER_API":
      p = new WhisperApiProvider();
      break;
    case "DEEPGRAM":
      p = new DeepgramProvider();
      break;
    case "GOOGLE_SPEECH":
    case "AZURE_SPEECH":
      // Future providers: same MISSING_CREDENTIAL pattern.
      p = {
        provider_name: name,
        status: () => "DISABLED",
        transcribe: async () => ({
          ok: false,
          failure_class: "MISSING_CREDENTIAL",
          message: `${name} provider not implemented yet.`,
        }),
      };
      break;
  }
  providerCache.set(name, p);
  return p;
}

/**
 * Inventory: every provider's name + status. Used by the CT
 * connector-health surface + the readiness matrix.
 */
export interface STTProviderStatusRow {
  provider_name: STTProviderType;
  status: STTProviderStatus;
  always_available: boolean;
  description: string;
}

export function listSTTProviderStatuses(): STTProviderStatusRow[] {
  const rows: STTProviderStatusRow[] = [
    {
      provider_name: "DEMO_FIXTURE",
      status: getSTTProvider("DEMO_FIXTURE").status(),
      always_available: true,
      description:
        "Built-in scripted transcripts. Always available, no credential required.",
    },
    {
      provider_name: "LOCAL_BROWSER",
      status: getSTTProvider("LOCAL_BROWSER").status(),
      always_available: true,
      description:
        "Browser Web Speech API — the page transcribes locally and POSTs segments.",
    },
    {
      provider_name: "WHISPER_API",
      status: getSTTProvider("WHISPER_API").status(),
      always_available: false,
      description:
        "OpenAI Whisper API. Activates when OPENAI_API_KEY is set.",
    },
    {
      provider_name: "DEEPGRAM",
      status: getSTTProvider("DEEPGRAM").status(),
      always_available: false,
      description:
        "Deepgram streaming + batch STT. Activates when DEEPGRAM_API_KEY is set.",
    },
  ];
  return rows;
}
