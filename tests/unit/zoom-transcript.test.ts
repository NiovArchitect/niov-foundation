// FILE: tests/unit/zoom-transcript.test.ts
// PURPOSE: [CX-SLICE-3] The VTT→transcript contract: speaker labels
//          preserved, consecutive same-speaker cues merged, continuation
//          cues (no speaker prefix) attach to the current speaker, cue
//          numbers/timestamps/headers never leak, malformed input → "".
import { describe, expect, it } from "vitest";
import { parseVttTranscript } from "../../apps/api/src/services/connector/zoom-transcript.js";

const VTT = `WEBVTT

1
00:00:01.000 --> 00:00:04.000
Sadeil Lewis: We ship Friday.

2
00:00:04.100 --> 00:00:06.000
Sadeil Lewis: Walter owns the launch video.

3
00:00:06.100 --> 00:00:08.000
and the teaser cut.

4
00:00:08.100 --> 00:00:10.000
Annie: I'll review the risk items.
`;

describe("zoom-transcript — parseVttTranscript", () => {
  it("produces speaker-labeled lines, merging same-speaker and continuation cues", () => {
    const out = parseVttTranscript(VTT);
    expect(out).toBe(
      "Sadeil Lewis: We ship Friday. Walter owns the launch video. and the teaser cut.\n" +
        "Annie: I'll review the risk items.",
    );
  });

  it("never leaks headers, cue numbers, or timestamps", () => {
    const out = parseVttTranscript(VTT);
    expect(out).not.toMatch(/WEBVTT|-->|00:00/);
  });

  it("malformed/empty input degrades to an empty string — never throws", () => {
    expect(parseVttTranscript("")).toBe("");
    expect(parseVttTranscript("not a vtt at all")).toBe("");
    expect(parseVttTranscript("WEBVTT\n\ngarbage")).toBe("");
  });
});
