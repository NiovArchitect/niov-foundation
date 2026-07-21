// FILE: transcript-quality.ts
// PURPOSE: [SECTION-12-WORKGRAPH] Deterministic transcript-quality SEGMENTATION —
//          the governance gate that decides which parts of a captured transcript
//          are trustworthy enough to become commitments, work items, memory, or
//          org-seeding signals. A real meeting is often followed by a long noisy
//          tail (post-meeting side chatter, repeated "thank you" loops, ASR
//          gibberish, language/noise drift). That tail must NEVER produce
//          high-confidence work. This module classifies each utterance so the
//          ingest pipeline can extract ONLY from trusted segments and quarantine
//          the rest (kept as a raw source pointer, never as work memory).
//
// WHY TYPESCRIPT (language-strategy doctrine): this is a deterministic GOVERNANCE
//   decision about what may enter the organization's source of truth — it must be
//   auditable, reproducible, and live in the governance-authority runtime (TS),
//   exactly like recipient-governance.ts and responsibility-graph.ts. It is NOT
//   ML. The PYTHON BOUNDARY below is where model-grade scoring (perplexity,
//   language-id, ASR-confidence) plugs in later WITHOUT changing this contract:
//   a Python worker may REFINE a segment's quality, but the deterministic gate
//   here is the floor and the auditable record.
//
//   PYTHON BOUNDARY (per ADR-0090 Python Intelligence Runtime + ADR-0079 §6
//   classifyConversationRelevance, "bias toward privacy"): model-grade scoring
//   (perplexity / language-id / ASR-confidence / semantic work-vs-noise) is an
//   INTELLIGENCE concern that, when PY3 is Founder-authorized, runs via the
//   existing TS→Python envelope (PythonIntelligenceClient /
//   PythonComputationEnvelope in services/python/python-client.ts) and returns a
//   SAFE projection that REFINES a segment's quality. Per ADR-0090 §3 the
//   governance DECISION (what is work-eligible) stays here in TS; Python proposes,
//   TS decides. Today Python is fixture-only (no in-tree service), so this
//   deterministic pass is the sole, honest gate and the Work Ledger row is
//   recorded extraction_source=TYPESCRIPT_DETERMINISTIC (never a fake
//   PYTHON_ENRICHED claim).
//
// PURE: no IO, no LLM, no Date.now(); tenant-general; names/topics never hardcoded.
// CONNECTS TO: comms-ingest.service.ts (gates extraction), work-item-planner.ts,
//              tests/unit/transcript-quality.test.ts.

export type SegmentQuality =
  | "trusted" // substantive meeting content; may produce commitments/work
  | "side_conversation" // real but off-topic/social; no work extraction
  | "low_confidence" // partial/short/unclear; review only
  | "filler_loop" // repeated pleasantries ("thank you" x N); quarantine
  | "asr_garbage" // speech-recognition gibberish; quarantine
  | "noise_drift"; // language/charset drift or degenerate repetition; quarantine

// Only TRUSTED segments may create commitments, work items, memory, or seeds.
export const WORK_ELIGIBLE: ReadonlySet<SegmentQuality> = new Set<SegmentQuality>(["trusted"]);
// Quarantined qualities are retained only as a raw source pointer (never as work memory).
export const QUARANTINED: ReadonlySet<SegmentQuality> = new Set<SegmentQuality>([
  "filler_loop",
  "asr_garbage",
  "noise_drift",
]);

export interface TranscriptSegment {
  index: number;
  speaker: string | null;
  text: string;
  quality: SegmentQuality;
  reason: string;
  /** True once the post-meeting noisy tail has begun (everything after stays quarantined). */
  inNoisyTail: boolean;
}

export interface TranscriptQualityResult {
  segments: TranscriptSegment[];
  /** Concatenated trusted utterances — the ONLY text the extractor should see. */
  trustedText: string;
  /** Where the trusted meeting ends and the noisy tail begins (segment index, or null). */
  noisyTailStartIndex: number | null;
  stats: {
    total: number;
    trusted: number;
    quarantined: number;
    side_conversation: number;
    low_confidence: number;
  };
}

const FILLER_PHRASES: ReadonlySet<string> = new Set([
  "thank you",
  "thanks",
  "thank you so much",
  "thanks everyone",
  "thank you very much",
  "bye",
  "goodbye",
  "see you",
  "okay",
  "ok",
  "yeah",
  "yep",
  "uh huh",
  "mm hmm",
  "right",
  "cool",
  "great",
  "perfect",
]);

/**
 * Strip a leading "Speaker:" or "[timestamp] Speaker:" prefix.
 * Returns [speaker|null, text].
 *
 * Bracket content is intentionally broad (`[^\]]+`) so ISO datetimes
 * (`[2026-07-21 09:12]`), plain clocks (`[00:12]`), and chat stamps
 * (`[Mon 3:04 PM]`) all peel off. The prior `[0-9:.\s]+` class rejected
 * hyphens and left the full stamp in the utterance body, which:
 *   1) left speaker=null (roster/owner proof never saw "R03P1"), and
 *   2) poisoned alphabetic-ratio scoring with digit-heavy timestamps so
 *      date-rich enterprise lines were mislabeled asr_garbage.
 */
function splitSpeaker(line: string): [string | null, string] {
  const m = line.match(
    /^\s*(?:\[[^\]]+\]\s*)?([A-Z][A-Za-z0-9 .'-]{0,40}?):\s+(.*)$/,
  );
  if (m && m[1] && m[2] !== undefined) return [m[1].trim(), m[2].trim()];
  return [null, line.trim()];
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Strip ISO dates / clock times / residual bracket stamps before alpha
 * scoring. Enterprise work conversations legitimately say "lock 2026-09-18"
 * and "reject 2026-09-11"; those digits must not quarantine the line as ASR
 * garbage when the remaining prose is clearly human language.
 */
function contentForAlpha(s: string): string {
  return s
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, " ")
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function alphaRatio(s: string): number {
  const scored = contentForAlpha(s);
  if (scored.length === 0) {
    // Pure date/time stamp with no prose — treat as non-alpha so short
    // timestamp-only lines stay low_confidence / noise, not trusted.
    if (s.length === 0) return 0;
    return 0;
  }
  const letters = (scored.match(/[a-zA-Z]/g) ?? []).length;
  return letters / scored.length;
}

function asciiRatio(s: string): number {
  if (s.length === 0) return 1;
  // eslint-disable-next-line no-control-regex
  const ascii = (s.match(/[\x00-\x7F]/g) ?? []).length;
  return ascii / s.length;
}

/** Degenerate repetition: the same token repeated dominates the utterance. */
function maxTokenShare(norm: string): number {
  const toks = norm.split(" ").filter((t) => t.length > 0);
  if (toks.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const t of toks) counts.set(t, (counts.get(t) ?? 0) + 1);
  let max = 0;
  for (const c of counts.values()) max = Math.max(max, c);
  return max / toks.length;
}

function classifyUtterance(speaker: string | null, text: string): { quality: SegmentQuality; reason: string } {
  const norm = normalize(text);
  const words = norm.split(" ").filter((w) => w.length > 0);

  if (norm.length === 0) return { quality: "noise_drift", reason: "empty after normalization" };

  // ASR garbage: very low alpha ratio or mostly non-ascii (charset drift).
  if (asciiRatio(text) < 0.7) return { quality: "noise_drift", reason: "non-ascii / language drift" };
  if (alphaRatio(text) < 0.45 && text.length > 6) return { quality: "asr_garbage", reason: "low alphabetic ratio" };

  // Degenerate repetition of a single token ("you you you you", "music music").
  if (words.length >= 4 && maxTokenShare(norm) >= 0.6) {
    return { quality: "noise_drift", reason: "degenerate token repetition" };
  }

  // Pure filler / pleasantry.
  if (FILLER_PHRASES.has(norm) || (words.length <= 3 && words.every((w) => FILLER_PHRASES.has(w)))) {
    return { quality: "filler_loop", reason: "pleasantry/filler" };
  }

  // Very short and not clearly substantive → low confidence (review only).
  if (words.length < 4) return { quality: "low_confidence", reason: "too short to be a reliable signal" };

  // Substantive: has a speaker and enough real words → trusted.
  if (words.length >= 4 && alphaRatio(text) >= 0.6) {
    return { quality: "trusted", reason: "substantive utterance" };
  }
  return { quality: "low_confidence", reason: "unclear signal" };
}

/**
 * Segment a transcript by quality. Deterministic. The "noisy tail" is detected as
 * the first point after which quarantined utterances dominate a sliding window —
 * once the tail starts, subsequent low-value utterances stay quarantined so a long
 * gibberish/"thank you" coda cannot seed work even if a stray word looks real.
 */
export function segmentTranscriptQuality(raw: string): TranscriptQualityResult {
  const lines = raw
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    // drop a leading "Title: ..." header — metadata, not an utterance
    .filter((l) => !/^title:\s*/i.test(l));

  const base: TranscriptSegment[] = lines.map((line, index) => {
    const [speaker, text] = splitSpeaker(line);
    const { quality, reason } = classifyUtterance(speaker, text);
    return { index, speaker, text, quality, reason, inNoisyTail: false };
  });

  // Detect the noisy tail: the earliest QUARANTINED utterance from which the
  // remainder is noise-dominated (≥60% quarantined, min 3). The tail must START
  // at a quarantined utterance, so a clean boundary never eats trusted content
  // and a stray "okay" mid-meeting never triggers a tail (its suffix stays
  // mostly trusted). A real-looking line buried AFTER the tail begins is still
  // swept up and downgraded.
  let noisyTailStartIndex: number | null = null;
  for (let i = 0; i < base.length; i++) {
    if (!QUARANTINED.has(base[i]!.quality)) continue;
    const rest = base.slice(i);
    if (rest.length < 3) break;
    const bad = rest.filter((s) => QUARANTINED.has(s.quality)).length;
    if (bad / rest.length >= 0.6) {
      noisyTailStartIndex = i;
      break;
    }
  }

  // Anything inside the noisy tail that isn't already clearly trusted is quarantined.
  if (noisyTailStartIndex !== null) {
    for (let i = noisyTailStartIndex; i < base.length; i++) {
      const seg = base[i]!;
      seg.inNoisyTail = true;
      if (seg.quality === "trusted" || seg.quality === "low_confidence") {
        // A lone real-looking line buried in the tail is downgraded, not trusted.
        seg.quality = "low_confidence";
        seg.reason = "inside post-meeting noisy tail — not eligible for work";
      }
    }
  }

  const trusted = base.filter((s) => WORK_ELIGIBLE.has(s.quality) && !s.inNoisyTail);
  const trustedText = trusted.map((s) => (s.speaker ? `${s.speaker}: ${s.text}` : s.text)).join("\n");

  return {
    segments: base,
    trustedText,
    noisyTailStartIndex,
    stats: {
      total: base.length,
      trusted: trusted.length,
      quarantined: base.filter((s) => QUARANTINED.has(s.quality)).length,
      side_conversation: base.filter((s) => s.quality === "side_conversation").length,
      low_confidence: base.filter((s) => s.quality === "low_confidence").length,
    },
  };
}
