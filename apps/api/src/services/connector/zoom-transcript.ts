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

// ── [CX-SLICE-3 part 2] governed transcript fetch ────────────────────────
// Server-side only: the org's Zoom OAuth token is used as an outbound
// Authorization header; download URLs and tokens are never returned, logged,
// or persisted (the same invariants as connector-data-read.service.ts).

import { writeAuditEvent } from "@niov/database";
import { getProviderAccessTokenForOrg } from "./connector-oauth.service.js";

export type ZoomTranscriptFetch =
  | { ok: true; topic: string; transcript: string }
  | { ok: false; code: "NOT_CONFIGURED" | "AUTH" | "NOT_FOUND" | "NO_TRANSCRIPT" | "PROVIDER_ERROR" | "TRANSCRIPT_TOO_LARGE" };

async function audit(
  args: { actor_entity_id: string; org_entity_id: string },
  resource: string,
  resultCount: number,
  reason: string | null,
): Promise<void> {
  await writeAuditEvent({
    event_type: "CONNECTOR_DATA_READ",
    outcome: reason === null ? "SUCCESS" : "DENIED",
    actor_entity_id: args.actor_entity_id,
    target_entity_id: args.org_entity_id,
    details: { provider: "zoom", resource, result_count: resultCount, reason },
  });
}

// WHAT: fetch + parse ONE Zoom recording's transcript for governed ingestion.
// INPUT: actor + org (caller-resolved, never from the body) + meeting id.
// OUTPUT: { topic, transcript } or an honest failure code. Audited either way.
export async function fetchZoomTranscriptForOrg(args: {
  actor_entity_id: string;
  org_entity_id: string;
  meeting_id: string;
}): Promise<ZoomTranscriptFetch> {
  const token = await getProviderAccessTokenForOrg({
    provider: "ZOOM",
    org_entity_id: args.org_entity_id,
  });
  if (token.ok === false) {
    await audit(args, "recording_transcript", 0, token.code);
    return { ok: false, code: token.code === "NOT_CONNECTED" ? "NOT_CONFIGURED" : "AUTH" };
  }
  const headers = { Authorization: `Bearer ${token.access_token}` };
  let meta: Response;
  try {
    meta = await fetch(
      `https://api.zoom.us/v2/meetings/${encodeURIComponent(args.meeting_id)}/recordings`,
      { headers },
    );
  } catch {
    await audit(args, "recording_transcript", 0, "fetch_failed");
    return { ok: false, code: "PROVIDER_ERROR" };
  }
  if (meta.status === 404) {
    await audit(args, "recording_transcript", 0, "http_404");
    return { ok: false, code: "NOT_FOUND" };
  }
  if (!meta.ok) {
    await audit(args, "recording_transcript", 0, `http_${meta.status}`);
    return { ok: false, code: "PROVIDER_ERROR" };
  }
  const json = (await meta.json().catch(() => ({}))) as {
    topic?: unknown;
    recording_files?: Array<{ file_type?: unknown; download_url?: unknown }>;
  };
  const files = Array.isArray(json.recording_files) ? json.recording_files : [];
  const vttFile = files.find((f) => f.file_type === "TRANSCRIPT" && typeof f.download_url === "string");
  if (vttFile === undefined) {
    await audit(args, "recording_transcript", 0, "no_transcript_file");
    return { ok: false, code: "NO_TRANSCRIPT" };
  }
  let body: Response;
  try {
    body = await fetch(vttFile.download_url as string, { headers });
  } catch {
    await audit(args, "recording_transcript", 0, "download_failed");
    return { ok: false, code: "PROVIDER_ERROR" };
  }
  if (!body.ok) {
    await audit(args, "recording_transcript", 0, `download_http_${body.status}`);
    return { ok: false, code: "PROVIDER_ERROR" };
  }
  const raw = await body.text();
  if (raw.length > MAX_TRANSCRIPT_CHARS) {
    await audit(args, "recording_transcript", 0, "too_large");
    return { ok: false, code: "TRANSCRIPT_TOO_LARGE" };
  }
  const transcript = parseVttTranscript(raw);
  if (transcript.length === 0) {
    await audit(args, "recording_transcript", 0, "empty_transcript");
    return { ok: false, code: "NO_TRANSCRIPT" };
  }
  await audit(args, "recording_transcript", 1, null);
  return {
    ok: true,
    topic: typeof json.topic === "string" && json.topic.length > 0 ? json.topic : "Zoom meeting",
    transcript,
  };
}
