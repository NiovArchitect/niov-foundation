// FILE: response-brevity.ts
// PURPOSE: Force concise, professional Talk answers — answer first,
//          implication second, next action only when relevant. Strips
//          common assistant noise. Pure functions; no DB, no secrets.
// CONNECTS TO: otzar.service.ts conductSession (system strip + polish).

/** Injected into the system prompt so the model defaults to brief. */
export const RESPONSE_BREVITY_SYSTEM_STRIP = [
  "RESPONSE STYLE (MANDATORY — employee Work OS, not a chatbot):",
  "- Put the direct answer in the FIRST sentence.",
  "- Default length: 1–3 short sentences (about 20–60 words). Ordinary status, owner, decision, and blocker answers MUST stay under ~90 words.",
  "- Never open with filler: \"Based on the information available\", \"I can help with\", \"Here is a comprehensive\", \"It is important to note\", \"Let me break this down\", \"To provide some context\", \"As an AI\", or \"In summary\".",
  "- Do not repeat the user's question. Do not list Otzar capabilities. Do not end with \"What would you like to know?\".",
  "- If something is missing, name the missing fact in one sentence. If unauthorized, say so once.",
  "- Expand ONLY when the user asks for detail, why, history, comparison, or a full explanation.",
  "- Prefer concrete names, owners, and one next action over process narration.",
  "- Voice will speak a short summary separately — keep the main answer scannable on screen.",
].join("\n");

// Only strip whole trailing paragraphs that open with offer/filler — never
// mid-sentence "I can help with" (that would mutilate real answers).
const TRAILING_OFFER_PARAGRAPH =
  /(?:\n\s*)+(?:I can help with|What would you like to know\?|Would you like me to|If you(?:'d| would) like|Let me know if|Feel free to ask)[^\n]*(?:\n[^\n]*)*$/i;

const OPENING_NOISE =
  /^(?:Based on (?:the )?(?:information|context|records?) available[,:]?\s*|Here is a comprehensive overview[:\s]*|It is important to note that\s*|To provide some context[,:]?\s*|As an AI[,:]?\s*|In summary[,:]?\s*)/i;

// WHAT: Light post-LLM polish — removes known noise without rewriting facts.
// INPUT: model response text.
// OUTPUT: same substance, less filler.
// WHY: Prompt alone is not enough; catch recurring noise patterns.
export function polishResponseBrevity(text: string): string {
  if (text.length === 0) return text;
  let out = text.trim();
  out = out.replace(OPENING_NOISE, "");
  // Strip only a separate trailing offer paragraph (not mid-sentence).
  out = out.replace(TRAILING_OFFER_PARAGRAPH, "");
  // Single-line pure offer closers at the very end.
  out = out.replace(
    /\s+(?:What would you like to know\?|Feel free to ask(?: me)?[^.]*\.?)\s*$/i,
    "",
  );
  // Collapse 3+ blank lines
  out = out.replace(/\n{3,}/g, "\n\n").trim();
  return out;
}

// WHAT: Ultra-short spoken summary for TTS (shorter than on-screen text).
// INPUT: full answer text (already permitted).
// OUTPUT: 1–2 sentences, ~8–20 seconds of speech (~45 words max).
// WHY: Voice must not read essays; screen keeps detail.
export function toSpokenSummary(input: string, maxWords = 45): string {
  if (input.length === 0) return "";
  // Prefer first non-empty paragraphs / sentences
  const cleaned = input
    .replace(/[#>*_`]/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (sentences.length === 0) return cleaned.slice(0, 200);

  const picked: string[] = [];
  let words = 0;
  for (const s of sentences) {
    const w = s.split(/\s+/).filter(Boolean).length;
    if (picked.length >= 2) break;
    if (picked.length > 0 && words + w > maxWords) break;
    if (picked.length === 0 && w > maxWords) {
      // Hard-trim first long sentence
      return s.split(/\s+/).slice(0, maxWords).join(" ");
    }
    picked.push(s);
    words += w;
    // Prefer stopping after a solid first sentence when we already have enough.
    if (picked.length === 1 && words >= 18) break;
  }
  return picked.join(" ");
}

// WHAT: Word-count helper for tests / metrics.
export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
