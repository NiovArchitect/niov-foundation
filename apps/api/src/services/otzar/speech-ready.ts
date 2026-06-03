// FILE: speech-ready.ts
// PURPOSE: Phase EDX-3 slice 3 of the ConductSession output expansion
//          per the [FOUNDER-AUTH — EVERYDAY EMPLOYEE DOMAIN GENERAL
//          INTELLIGENCE EXPERIENCE] directive. Pure speech-ready text
//          sanitizer + voice-output-supported derivation. Used by
//          OtzarService.conductSession to attach a TTS-friendly
//          projection of the response text alongside a boolean
//          telling the UI whether live audio synthesis is wired
//          at the Foundation tier today (per ADR-0085 + ADR-0089
//          + the EDX-1 voice_readiness_state sidecar).
//
// PRIVACY INVARIANT:
//   - Pure function over an already-permitted response string. The
//     LLM has already produced this text and ConductSession already
//     returns it as `response`. `speech_ready_text` is a derived
//     projection — never re-reads memory, never queries the DB,
//     never adds new substance.
//   - The sanitizer NEVER injects content; it only removes
//     speech-hostile markup. If the input is empty, the output
//     is the empty string.
//   - No tokens / secrets / vendor identifiers / API keys / model
//     names are introduced.
//
// CONNECTS TO:
//   - apps/api/src/services/otzar/otzar.service.ts
//     (consumed by conductSession success return)
//   - apps/api/src/services/otzar/twin-voice-readiness.ts
//     (mirrors the same "NOT_AVAILABLE_AT_FOUNDATION_TIER" posture
//     for live audio output — the boolean here is a derived view
//     of that constant fact)

// WHAT: Strip the speech-hostile Markdown / code substrates from a
//        chat response so a downstream TTS engine (or a future
//        client-side device speech path) can speak it naturally.
// INPUT: The LLM response text (already produced by conductSession).
// OUTPUT: A speech-ready string. Empty string when input is empty.
// WHY: LLMs frequently emit Markdown (bold/italic/code/headers/
//      lists/links) that does not read well aloud. Removing these
//      markers cleans the audio path WITHOUT changing the
//      semantic content. Fenced code blocks are explicitly summarized
//      so the audio path never tries to read raw source code aloud.
export function toSpeechReadyText(input: string): string {
  if (input.length === 0) {
    return "";
  }
  let out = input;

  // Fenced code blocks → single-line summary. Run before any per-line
  // pass so the multi-line block is collapsed cleanly.
  out = out.replace(/```[\s\S]*?```/g, "(code omitted from speech)");

  // Markdown images ![alt](url) → alt. Done BEFORE the link pass so
  // the leading `!` is not orphaned by the link regex consuming
  // `[alt](url)` first.
  out = out.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, "$1");

  // Markdown links [text](url) → text. Done before bold/italic so
  // the inner emphasis markers fall to the next pass.
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1");

  // Strip Markdown headers (#, ##, ###, ...) — keep the heading text.
  out = out.replace(/^\s{0,3}#{1,6}\s+/gm, "");

  // Strip blockquote prefix `> ` — keep the quoted text.
  out = out.replace(/^\s{0,3}>\s?/gm, "");

  // Strip Markdown bold/italic markers. Order matters: triple before
  // double before single so we don't leave dangling asterisks.
  out = out.replace(/\*\*\*([^*]+)\*\*\*/g, "$1");
  out = out.replace(/___([^_]+)___/g, "$1");
  out = out.replace(/\*\*([^*]+)\*\*/g, "$1");
  out = out.replace(/__([^_]+)__/g, "$1");
  out = out.replace(/\*([^*]+)\*/g, "$1");
  // Underscore italic: only when surrounded by word boundaries so we
  // don't mangle snake_case identifiers the LLM might mention.
  out = out.replace(/(^|\s)_([^_]+)_(?=\s|[.,!?;:]|$)/g, "$1$2");

  // Inline code backticks → keep the text inside.
  out = out.replace(/`([^`]+)`/g, "$1");

  // Horizontal rules → drop entirely.
  out = out.replace(/^\s*-{3,}\s*$/gm, "");
  out = out.replace(/^\s*\*{3,}\s*$/gm, "");

  // Normalize 3+ consecutive newlines to 2 (a single paragraph break).
  out = out.replace(/\n{3,}/g, "\n\n");

  // Trim leading / trailing whitespace.
  return out.trim();
}

// WHAT: Compute whether the Foundation tier exposes live audio output
//        today. Mirrors the voice_readiness_state sidecar's
//        `live_audio_output` value — `LIVE` ⇒ true; otherwise false.
// INPUT: None (constant projection at the Foundation tier).
// OUTPUT: Boolean.
// WHY: The substrate gate is uniform across callers today (per ADR-0085
//      + ADR-0089: live audio output remains forward-substrate Founder-
//      gated). Lets the UI hide / disable a "speak aloud" affordance
//      that would otherwise produce no audio.
export function computeVoiceOutputSupported(): boolean {
  return false;
}
