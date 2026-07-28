// FILE: response-brevity.test.ts
// PURPOSE: Lock Founder P0 answer compression — strip filler, keep
//          substance, and keep spoken summaries shorter than text.
// CONNECTS TO: apps/api/src/services/otzar/response-brevity.ts

import { describe, expect, it } from "vitest";
import {
  polishResponseBrevity,
  RESPONSE_BREVITY_SYSTEM_STRIP,
  toSpokenSummary,
  wordCount,
} from "../../apps/api/src/services/otzar/response-brevity.js";

describe("response-brevity", () => {
  it("system strip requires answer-first and bans common filler", () => {
    expect(RESPONSE_BREVITY_SYSTEM_STRIP).toMatch(/FIRST sentence/i);
    expect(RESPONSE_BREVITY_SYSTEM_STRIP).toMatch(/20–60 words|20-60 words/i);
    expect(RESPONSE_BREVITY_SYSTEM_STRIP).toMatch(/Based on the information available/);
    expect(RESPONSE_BREVITY_SYSTEM_STRIP).toMatch(/What would you like to know/);
  });

  it("polishResponseBrevity strips opening and trailing noise", () => {
    const noisy =
      "Based on the information available, Casey owns security. " +
      "What would you like to know? I can help with decisions and risks.";
    const polished = polishResponseBrevity(noisy);
    expect(polished.toLowerCase()).not.toMatch(/^based on the information/);
    expect(polished.toLowerCase()).not.toMatch(/what would you like to know/);
    expect(polished).toMatch(/Casey owns security/);
  });

  it("polishResponseBrevity preserves material facts and risk language", () => {
    const text =
      "Advance to interview with conditions. Security checklist is still open.";
    expect(polishResponseBrevity(text)).toBe(text);
  });

  it("toSpokenSummary prefers 1–2 sentences and stays under max words", () => {
    const long =
      "Advance to interview with conditions. Casey’s security checklist remains open. " +
      "Riley verified the customer reference. The data-rights response is still required. " +
      "The final decision was made by the authorized review lead after legal review.";
    const spoken = toSpokenSummary(long, 45);
    expect(wordCount(spoken)).toBeLessThanOrEqual(45);
    expect(spoken.toLowerCase()).toMatch(/advance|interview|conditions/);
    // Must be shorter than full text for multi-sentence answers.
    expect(wordCount(spoken)).toBeLessThan(wordCount(long));
  });

  it("toSpokenSummary hard-trims a single runaway sentence", () => {
    const runaway = Array.from({ length: 80 }, (_, i) => `word${i}`).join(" ");
    const spoken = toSpokenSummary(runaway, 20);
    expect(wordCount(spoken)).toBeLessThanOrEqual(20);
  });

  it("wordCount ignores empty strings", () => {
    expect(wordCount("")).toBe(0);
    expect(wordCount("  one   two  ")).toBe(2);
  });
});
