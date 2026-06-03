// FILE: speech-ready.test.ts
// PURPOSE: Phase EDX-3 slice 3 of the ConductSession output expansion
//          per the [FOUNDER-AUTH — EVERYDAY EMPLOYEE DOMAIN GENERAL
//          INTELLIGENCE EXPERIENCE] directive. Unit coverage for the
//          pure speech-ready sanitizer + voice-output-supported
//          derivation used by OtzarService.conductSession.
// CONNECTS TO:
//   - apps/api/src/services/otzar/speech-ready.ts

import { describe, expect, it } from "vitest";
import {
  computeVoiceOutputSupported,
  toSpeechReadyText,
} from "../../apps/api/src/services/otzar/speech-ready.js";

describe("toSpeechReadyText", () => {
  it("returns empty string for empty input", () => {
    expect(toSpeechReadyText("")).toBe("");
  });

  it("preserves plain text unchanged (no markdown)", () => {
    expect(toSpeechReadyText("Hello, how can I help today?")).toBe(
      "Hello, how can I help today?",
    );
  });

  it("strips bold markers (**) while preserving inner text", () => {
    expect(toSpeechReadyText("This is **really important** advice.")).toBe(
      "This is really important advice.",
    );
  });

  it("strips italic markers (*) while preserving inner text", () => {
    expect(toSpeechReadyText("This is *important* advice.")).toBe(
      "This is important advice.",
    );
  });

  it("strips bold-italic markers (***) while preserving inner text", () => {
    expect(toSpeechReadyText("This is ***critical*** advice.")).toBe(
      "This is critical advice.",
    );
  });

  it("strips underscore bold (__) while preserving inner text", () => {
    expect(toSpeechReadyText("This is __really important__ advice.")).toBe(
      "This is really important advice.",
    );
  });

  it("does NOT mangle snake_case identifiers in prose", () => {
    expect(
      toSpeechReadyText("Use the snake_case_identifier carefully."),
    ).toBe("Use the snake_case_identifier carefully.");
  });

  it("strips inline code backticks while preserving inner text", () => {
    expect(toSpeechReadyText("Run `npm test` to verify.")).toBe(
      "Run npm test to verify.",
    );
  });

  it("replaces fenced code blocks with a speech-friendly summary", () => {
    const input =
      "Here is the snippet:\n```ts\nconst foo = 1;\n```\nDoes that help?";
    expect(toSpeechReadyText(input)).toBe(
      "Here is the snippet:\n(code omitted from speech)\nDoes that help?",
    );
  });

  it("strips Markdown headers while preserving heading text", () => {
    expect(toSpeechReadyText("# Section\n## Sub\n### Detail")).toBe(
      "Section\nSub\nDetail",
    );
  });

  it("flattens Markdown links to their visible text", () => {
    expect(
      toSpeechReadyText("See [the docs](https://example.com) for details."),
    ).toBe("See the docs for details.");
  });

  it("flattens Markdown images to their alt text", () => {
    expect(toSpeechReadyText("![diagram](https://example.com/diagram.png)")).toBe(
      "diagram",
    );
  });

  it("strips blockquote prefix while preserving quoted text", () => {
    expect(toSpeechReadyText("> Quoted line\nFollowing line")).toBe(
      "Quoted line\nFollowing line",
    );
  });

  it("removes horizontal rules", () => {
    expect(toSpeechReadyText("Above\n---\nBelow")).toBe("Above\n\nBelow");
  });

  it("normalizes 3+ consecutive newlines to 2", () => {
    expect(toSpeechReadyText("A\n\n\n\nB")).toBe("A\n\nB");
  });

  it("trims leading and trailing whitespace", () => {
    expect(toSpeechReadyText("   hello   ")).toBe("hello");
  });

  it("does not introduce new content (purity guarantee)", () => {
    // The sanitizer must NEVER add prose; only remove markup. The fenced
    // code block summary "(code omitted from speech)" is the single
    // documented insertion and only occurs when the input contained
    // a fenced code block.
    expect(toSpeechReadyText("normal sentence")).toBe("normal sentence");
    expect(toSpeechReadyText("no fences here `inline only`")).toBe(
      "no fences here inline only",
    );
  });
});

describe("computeVoiceOutputSupported", () => {
  it("returns false at the Foundation tier today (ADR-0085 + ADR-0089)", () => {
    // Live audio output remains forward-substrate Founder-gated per the
    // EDX-1 voice_readiness_state sidecar contract (live_audio_output =
    // NOT_AVAILABLE_AT_FOUNDATION_TIER). This boolean mirrors that fact.
    expect(computeVoiceOutputSupported()).toBe(false);
  });
});
