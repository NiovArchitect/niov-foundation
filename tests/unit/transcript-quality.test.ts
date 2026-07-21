// FILE: transcript-quality.test.ts (unit, no DB)
// PURPOSE: Prove the deterministic transcript-quality gate quarantines the noisy
//          post-meeting tail (filler loops / ASR gibberish / degenerate
//          repetition / charset drift) so it can NEVER seed commitments, work, or
//          memory — while preserving the real meeting content. A real-looking line
//          buried inside the tail is downgraded, not trusted.
// CONNECTS TO: services/otzar/transcript-quality.ts.

import { describe, expect, it } from "vitest";
import { segmentTranscriptQuality, WORK_ELIGIBLE, QUARANTINED } from "@niov/api";

const MEETING_THEN_NOISE = `Title: Launch Review
Sadeil: Let's run the launch review and confirm owners for the demo.
David: I will own the repo access work and grant Pratham write access today.
Pratham: I will connect Google sign-in to the WebA app using the admin console.
Shiney: I'll implement proactive agent tool access before the two o'clock demo.
Thank you.
Thank you.
you you you you you
♪♪♪♪♪♪♪♪
............
Thanks everyone.`;

describe("transcript quality segmentation quarantines the noisy tail", () => {
  it("keeps the real meeting content trusted and excludes the tail from trustedText", () => {
    const r = segmentTranscriptQuality(MEETING_THEN_NOISE);
    expect(r.noisyTailStartIndex).not.toBeNull();
    // The four substantive lines are trusted.
    expect(r.stats.trusted).toBe(4);
    expect(r.trustedText).toContain("repo access");
    expect(r.trustedText).toContain("Google sign-in");
    expect(r.trustedText).toContain("proactive agent tool access");
    // The tail never reaches the extractor.
    expect(r.trustedText).not.toContain("Thank you");
    expect(r.trustedText).not.toMatch(/you you you/);
  });

  it("classifies filler / degenerate / charset-drift utterances as quarantined", () => {
    const r = segmentTranscriptQuality(MEETING_THEN_NOISE);
    const tail = r.segments.filter((s) => s.inNoisyTail);
    expect(tail.length).toBeGreaterThanOrEqual(5);
    // Every tail segment is quarantined or downgraded (never trusted).
    expect(tail.every((s) => !WORK_ELIGIBLE.has(s.quality))).toBe(true);
    expect(r.stats.quarantined).toBeGreaterThanOrEqual(4);
  });

  it("strips a leading Title: header (metadata, not an utterance)", () => {
    const r = segmentTranscriptQuality(MEETING_THEN_NOISE);
    expect(r.segments.some((s) => /launch review/i.test(s.text) && s.text.toLowerCase().startsWith("title"))).toBe(false);
  });

  it("downgrades a real-looking line BURIED inside the noisy tail (not trusted)", () => {
    const buried = `Sadeil: Kick off the launch review now.
David: I will own the API integration and finish it by Friday.
Thank you.
you you you you
David will also handle the deployment checklist.
♪♪♪♪♪♪
Thank you.
Thanks.`;
    const r = segmentTranscriptQuality(buried);
    // The two genuine opening lines are trusted.
    expect(r.trustedText).toContain("API integration");
    // The buried line is swept into the tail and NOT work-eligible.
    expect(r.trustedText).not.toContain("deployment checklist");
    const buriedSeg = r.segments.find((s) => s.text.includes("deployment checklist"));
    expect(buriedSeg?.inNoisyTail).toBe(true);
    expect(WORK_ELIGIBLE.has(buriedSeg!.quality)).toBe(false);
  });

  it("a clean meeting with no tail keeps everything trusted (no false tail)", () => {
    const clean = `Sadeil: Confirm the owners for the launch.
David: I will own the repo access and finish it today.
Pratham: I will connect Google sign-in this week.`;
    const r = segmentTranscriptQuality(clean);
    expect(r.noisyTailStartIndex).toBeNull();
    expect(r.stats.trusted).toBe(3);
  });

  it("ISO datetime speaker stamps peel off so date-rich enterprise lines stay trusted", () => {
    // Production project-loop shape: [YYYY-MM-DD HH:MM] Handle: body
    // Prior gate treated hyphens as non-stamp → speaker=null + digit-poisoned
    // alpha ratio → asr_garbage on the final-date / rejected-date lines.
    const enterprise = `
[2026-07-21 09:12] R03P0: can we still target the pilot checkpoint next week for Enterprise Customer Pilot?
[2026-07-21 09:13] R03P4: engineering is blocked on the compliance memo — not ready for 2026-09-11.
[2026-07-21 09:15] R03P1: correction — product owns the brief; engineering owns the runtime cutover only.
[2026-07-21 09:18] R03P4: ok then lock 2026-09-18 for the go/no-go. Reject auto-booking 2026-09-11.
[2026-07-21 09:19] R03P0: decision: 2026-09-18 is final. R03P1 owns the brief; R03P4 owns cutover readiness.
[2026-07-21 09:20] R03P30: also the field contractor cannot see executive margin notes.
`.trim();
    const r = segmentTranscriptQuality(enterprise);
    expect(r.noisyTailStartIndex).toBeNull();
    // Speakers recovered from ISO stamps.
    expect(r.segments.every((s) => s.speaker !== null)).toBe(true);
    expect(r.segments.map((s) => s.speaker)).toEqual(
      expect.arrayContaining(["R03P0", "R03P4", "R03P1", "R03P30"]),
    );
    // Final agreed date + ownership must reach the extractor (trustedText).
    expect(r.trustedText).toMatch(/2026-09-18/);
    expect(r.trustedText).toMatch(/R03P1 owns the brief/);
    expect(r.trustedText).toMatch(/Reject auto-booking 2026-09-11|not ready for 2026-09-11/);
    // No line should be asr_garbage solely because it mentions ISO dates.
    expect(r.segments.every((s) => s.quality !== "asr_garbage")).toBe(true);
    expect(r.stats.trusted).toBeGreaterThanOrEqual(5);
  });

  it("a stray 'okay' mid-meeting does NOT trigger a tail", () => {
    const stray = `Sadeil: Let's start and assign the demo owners now.
David: Okay.
David: I will own the repo access work and grant write access today.
Pratham: I will connect Google sign-in to the WebA app this afternoon.`;
    const r = segmentTranscriptQuality(stray);
    // "Okay." is filler but the remainder is trusted-dominated → no tail.
    expect(r.noisyTailStartIndex).toBeNull();
    expect(r.trustedText).toContain("repo access");
    expect(r.trustedText).toContain("Google sign-in");
  });

  it("QUARANTINED and WORK_ELIGIBLE are disjoint and trusted-only", () => {
    expect(WORK_ELIGIBLE.has("trusted")).toBe(true);
    for (const q of QUARANTINED) expect(WORK_ELIGIBLE.has(q)).toBe(false);
  });
});
