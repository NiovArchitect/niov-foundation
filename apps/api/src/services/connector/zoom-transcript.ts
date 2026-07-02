// FILE: zoom-transcript.ts
// PURPOSE: [CX-SLICE-3] Meeting-ingestion safe first slice — turn a Zoom
//          cloud-recording TRANSCRIPT file (WebVTT) into the plain
//          speaker-labeled text the EXISTING comms-ingest pipeline consumes.
//          Pure parsing here; the route does the governed fetch (OAuth token
//          server-side only, download URLs never exposed) and hands the text
//          to otzarService.ingestComms — no second ingestion pipeline.
// CONNECTS TO: connector-data.routes.ts (POST /zoom/recordings/ingest),
//              connector-data-read.service.ts (token + list invariants),
//              tests/unit/zoom-transcript.test.ts.

// WHAT: parse Zoom's WebVTT transcript into "Speaker: line" text.
// INPUT: the raw VTT body. Zoom cues look like:
//          1\n00:00:01.000 --> 00:00:04.000\nSadeil Lewis: We ship Friday.
//        Speaker prefixes may be absent on continuation cues.
// OUTPUT: newline-joined "Name: text" lines (consecutive same-speaker cues
//         merged); empty string for empty/malformed input — never throws.
export function parseVttTranscript(vtt: string): string {
  const lines = vtt.split(/\r?\n/);
  const out: Array<{ speaker: string | null; text: string }> = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (!line.includes("-->")) continue; // only cue-timing lines anchor text
    // Collect the cue's text lines until a blank line.
    const texts: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      const t = (lines[j] ?? "").trim();
      if (t.length === 0) break;
      texts.push(t);
    }
    for (const t of texts) {
      const m = /^([^:]{1,80}?):\s+(.*)$/.exec(t);
      const speaker = m !== null ? (m[1] ?? "").trim() : null;
      const text = m !== null ? (m[2] ?? "").trim() : t;
      if (text.length === 0) continue;
      const last = out[out.length - 1];
      if (last !== undefined && (speaker === null || speaker === last.speaker)) {
        last.text = `${last.text} ${text}`.trim();
      } else {
        out.push({ speaker, text });
      }
    }
  }
  return out
    .map((c) => (c.speaker !== null ? `${c.speaker}: ${c.text}` : c.text))
    .join("\n");
}

/** Max transcript size accepted (guards the ingest pipeline). */
export const MAX_TRANSCRIPT_CHARS = 200_000;
