// FILE: otzar-topic-extraction-shape.test.ts (real-llm tier)
// PURPOSE: Verify Claude's actual response to the production
//          extractTopics prompt matches what the parser at
//          otzar.service.ts:634 expects. Catches future Anthropic
//          model drift or prompt-template regressions that would
//          silently push production users into the parser's
//          fallback path.
// CONNECTS TO: apps/api/src/services/otzar/otzar.service.ts:629
//              (production prompt verbatim) and :634 (parser regex).
//
// COST: ~$0.001 per run. Single LLM call. Annualized via nightly:
// ~$0.37/year per Decision 4 (real-LLM tier cost discipline).
//
// DESIGN NOTE: This test diverges from the buildApp + app.inject
// pattern used by sibling real-LLM tests (otzar-conversation-shape,
// observation-extraction-shape) by calling AnthropicProvider
// directly. Rationale: this test specifically targets the
// prompt/parser boundary that G5b-I Resolution addresses. Going
// through the full closeConversation HTTP flow would also exercise
// conductSession (already covered by otzar-conversation-shape.test
// .ts) and double the API cost without adding scoped coverage.
// Direct provider call exercises the exact production prompt with
// minimal additional surface.
//
// CADENCE: nightly + workflow_dispatch only.
//
// Per G5b-I Resolution Gate.

import { describe, expect, it } from "vitest";
import { AnthropicProvider } from "@niov/api";

// Production prompt verbatim from otzar.service.ts:629.
const PRODUCTION_TOPICS_PROMPT =
  "Extract the top 3 topics from this conversation. Respond with exactly: 'topics: a, b, c'.";

// Representative transcript with 3 obvious topics. Mirrors the
// shape production's `history.join("\n")` produces (no leading
// "Conversation transcript:" header).
const REPRESENTATIVE_TRANSCRIPT = [
  "user: I need to plan the Q3 release notes for the iOS client.",
  "assistant: Sure. What features shipped this quarter?",
  "user: Dark mode, push notifications, and an offline mode.",
  "assistant: Got it. I'll draft sections for each.",
  "user: Also, the onboarding flow was redesigned.",
].join("\n");

describe("real-llm: extractTopics production prompt + parser shape", () => {
  it("Claude returns 'topics: a, b, c' format that the production parser regex extracts cleanly", async () => {
    const provider = new AnthropicProvider();
    const result = await provider.generateResponse({
      system: PRODUCTION_TOPICS_PROMPT,
      user: REPRESENTATIVE_TRANSCRIPT,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(typeof result.text).toBe("string");
    expect(result.text!.length).toBeGreaterThan(0);

    // Production parser regex from otzar.service.ts:634.
    const match = result.text!.match(/topics:\s*(.+)/i);
    expect(match).not.toBeNull();
    if (match === null) return;
    const items = match[1]!
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    // Shape-only assertions: at least 1 topic; all non-empty
    // strings. NOT asserting on exact extracted topics (varies
    // per call + model version).
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items.every((t) => typeof t === "string" && t.length > 0)).toBe(true);
  });
});
