// FILE: connector-data-read.service.ts
// PURPOSE: Phase 1270 — read-only connector data bridges that turn a
//          verified OAuth connection into live, governed data the
//          Otzar Work OS can act on:
//            - listZoomRecordingsForOrg     (Zoom cloud recordings)
//            - getCalendarFreeBusyForOrg    (Google Calendar free/busy)
//          Both are READ-ONLY external egress made with the org's
//          stored OAuth token. Neither creates, sends, or mutates
//          anything on the provider side.
// CONNECTS TO: connector-oauth.service.ts (getProviderAccessTokenForOrg
//          resolves a live Bearer token), packages/database audit chain
//          (CONNECTOR_DATA_READ on every egress), and the
//          connector-data.routes.ts HTTP surface.
//
// SECURITY INVARIANTS (RULE 0 / RULE 4):
//   - The raw access token is used ONLY as an outbound Authorization
//     header. It is never logged, persisted here, or returned.
//   - Audit details carry provider + resource + result_count +
//     scrubbed reason code ONLY. No tokens, no provider response
//     bodies, no recording download URLs, no meeting topics, no
//     attendee identities, no free/busy event details.
//   - Recording download/play URLs (which can embed short-lived
//     access tokens) are deliberately NOT projected to the caller.
//   - Nothing is fabricated: a missing connection, an expired token,
//     or a provider error returns an honest failure code — never an
//     empty-but-green list standing in for real data.

import { writeAuditEvent } from "@niov/database";
import { getProviderAccessTokenForOrg } from "./connector-oauth.service.js";

// ── Shared outbound-fetch timeout (provider calls must not hang a
//    request indefinitely; mirrors the oauth service's posture). ──
const PROVIDER_TIMEOUT_MS = 10_000;

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export type ConnectorDataReadCode =
  | "NOT_CONNECTED"
  | "TOKEN_REFRESH_FAILED"
  | "PROVIDER_ERROR"
  | "INVALID_REQUEST";

export interface ConnectorDataReadFailure {
  ok: false;
  code: ConnectorDataReadCode;
}

// ── Zoom cloud recordings ────────────────────────────────────────

// WHAT: One Zoom cloud recording session, SAFE-projected.
// WHY: Enough for the caller to recognize and select a recording
//      (topic + when + how long + how many files); deliberately NO
//      download/play URLs (they can embed access tokens).
export interface ZoomRecordingView {
  meeting_uuid: string;
  topic: string;
  start_time: string;
  duration_minutes: number;
  recording_count: number;
  total_size_bytes: number;
  file_types: string[];
}

export interface ZoomRecordingsResult {
  ok: true;
  provider: "zoom";
  recordings: ZoomRecordingView[];
}

interface ZoomRecordingFileRaw {
  file_type?: unknown;
}
interface ZoomRecordingMeetingRaw {
  uuid?: unknown;
  topic?: unknown;
  start_time?: unknown;
  duration?: unknown;
  recording_count?: unknown;
  total_size?: unknown;
  recording_files?: unknown;
}

function projectZoomMeeting(
  raw: ZoomRecordingMeetingRaw,
): ZoomRecordingView | null {
  if (typeof raw.uuid !== "string") return null;
  const files = Array.isArray(raw.recording_files)
    ? (raw.recording_files as ZoomRecordingFileRaw[])
    : [];
  const fileTypes = Array.from(
    new Set(
      files
        .map((f) => (typeof f.file_type === "string" ? f.file_type : null))
        .filter((t): t is string => t !== null),
    ),
  );
  return {
    meeting_uuid: raw.uuid,
    topic: typeof raw.topic === "string" ? raw.topic : "(untitled)",
    start_time: typeof raw.start_time === "string" ? raw.start_time : "",
    duration_minutes: typeof raw.duration === "number" ? raw.duration : 0,
    recording_count:
      typeof raw.recording_count === "number" ? raw.recording_count : 0,
    total_size_bytes: typeof raw.total_size === "number" ? raw.total_size : 0,
    file_types: fileTypes,
  };
}

// WHAT: List the org's Zoom cloud recordings (read-only).
// INPUT: actor + org + optional from/to (YYYY-MM-DD) + page_size.
// OUTPUT: SAFE recording projections, or an honest failure code.
// WHY: The verify probe already proves the recording:read scope on
//      this token; this turns that proof into the actual list the
//      Work OS surfaces. Audited as CONNECTOR_DATA_READ either way.
export async function listZoomRecordingsForOrg(args: {
  actor_entity_id: string;
  org_entity_id: string;
  from?: string;
  to?: string;
  page_size?: number;
}): Promise<ZoomRecordingsResult | ConnectorDataReadFailure> {
  const token = await getProviderAccessTokenForOrg({
    provider: "ZOOM",
    org_entity_id: args.org_entity_id,
  });
  if (token.ok === false) {
    await emitDataRead(args, "zoom", "recordings", 0, token.code);
    return { ok: false, code: token.code };
  }

  const pageSize = clampPageSize(args.page_size, 30, 300);
  const params = new URLSearchParams({ page_size: String(pageSize) });
  if (isIsoDate(args.from)) params.set("from", args.from);
  if (isIsoDate(args.to)) params.set("to", args.to);

  let res: Response;
  try {
    res = await fetchWithTimeout(
      `https://api.zoom.us/v2/users/me/recordings?${params.toString()}`,
      { method: "GET", headers: { Authorization: `Bearer ${token.access_token}` } },
    );
  } catch {
    await emitDataRead(args, "zoom", "recordings", 0, "fetch_failed");
    return { ok: false, code: "PROVIDER_ERROR" };
  }
  if (!res.ok) {
    await emitDataRead(args, "zoom", "recordings", 0, `http_${res.status}`);
    return { ok: false, code: "PROVIDER_ERROR" };
  }

  let json: { meetings?: unknown };
  try {
    json = (await res.json()) as { meetings?: unknown };
  } catch {
    await emitDataRead(args, "zoom", "recordings", 0, "bad_json");
    return { ok: false, code: "PROVIDER_ERROR" };
  }

  const meetings = Array.isArray(json.meetings)
    ? (json.meetings as ZoomRecordingMeetingRaw[])
    : [];
  const recordings = meetings
    .map(projectZoomMeeting)
    .filter((m): m is ZoomRecordingView => m !== null);

  await emitDataRead(args, "zoom", "recordings", recordings.length, "ok");
  return { ok: true, provider: "zoom", recordings };
}

// ── Google Calendar free/busy ────────────────────────────────────

export interface FreeBusyInterval {
  start: string;
  end: string;
}
export interface CalendarFreeBusyResult {
  ok: true;
  provider: "google";
  calendar_id: string;
  time_min: string;
  time_max: string;
  busy: FreeBusyInterval[];
}

// WHAT: Read the org's Google Calendar busy intervals for a window.
// INPUT: actor + org + RFC3339 time_min/time_max + optional calendar_id.
// OUTPUT: busy [{start,end}] intervals, or an honest failure code.
// WHY: free/busy is the read-only, lowest-risk, highest-value
//      scheduling signal. The granted calendar.readonly scope covers
//      the freeBusy query; this never reads event titles (the freeBusy
//      API does not return them) and never writes an event.
export async function getCalendarFreeBusyForOrg(args: {
  actor_entity_id: string;
  org_entity_id: string;
  time_min: string;
  time_max: string;
  calendar_id?: string;
}): Promise<CalendarFreeBusyResult | ConnectorDataReadFailure> {
  if (!isRfc3339(args.time_min) || !isRfc3339(args.time_max)) {
    return { ok: false, code: "INVALID_REQUEST" };
  }
  const calendarId =
    typeof args.calendar_id === "string" && args.calendar_id.length > 0
      ? args.calendar_id
      : "primary";

  const token = await getProviderAccessTokenForOrg({
    provider: "GOOGLE_WORKSPACE",
    org_entity_id: args.org_entity_id,
  });
  if (token.ok === false) {
    await emitDataRead(args, "google", "freebusy", 0, token.code);
    return { ok: false, code: token.code };
  }

  let res: Response;
  try {
    res = await fetchWithTimeout(
      "https://www.googleapis.com/calendar/v3/freeBusy",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          timeMin: args.time_min,
          timeMax: args.time_max,
          items: [{ id: calendarId }],
        }),
      },
    );
  } catch {
    await emitDataRead(args, "google", "freebusy", 0, "fetch_failed");
    return { ok: false, code: "PROVIDER_ERROR" };
  }
  if (!res.ok) {
    await emitDataRead(args, "google", "freebusy", 0, `http_${res.status}`);
    return { ok: false, code: "PROVIDER_ERROR" };
  }

  let json: { calendars?: Record<string, unknown> };
  try {
    json = (await res.json()) as { calendars?: Record<string, unknown> };
  } catch {
    await emitDataRead(args, "google", "freebusy", 0, "bad_json");
    return { ok: false, code: "PROVIDER_ERROR" };
  }

  const cal = json.calendars?.[calendarId] as
    | { busy?: unknown; errors?: unknown }
    | undefined;
  if (cal === undefined || Array.isArray(cal.errors)) {
    await emitDataRead(args, "google", "freebusy", 0, "calendar_error");
    return { ok: false, code: "PROVIDER_ERROR" };
  }
  const rawBusy = Array.isArray(cal.busy)
    ? (cal.busy as Array<{ start?: unknown; end?: unknown }>)
    : [];
  const busy: FreeBusyInterval[] = rawBusy
    .filter(
      (b) => typeof b.start === "string" && typeof b.end === "string",
    )
    .map((b) => ({ start: b.start as string, end: b.end as string }));

  await emitDataRead(args, "google", "freebusy", busy.length, "ok");
  return {
    ok: true,
    provider: "google",
    calendar_id: calendarId,
    time_min: args.time_min,
    time_max: args.time_max,
    busy,
  };
}

// ── Internal helpers ─────────────────────────────────────────────

function clampPageSize(
  value: number | undefined,
  fallback: number,
  max: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const n = Math.floor(value);
  if (n < 1) return 1;
  if (n > max) return max;
  return n;
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isRfc3339(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    )
  );
}

// WHAT: Audit one external read egress (RULE 4) with SAFE details.
// WHY: Outcome reflects reality — SUCCESS for a completed read (even
//      an empty list), DENIED for a connection/token/provider failure.
//      details NEVER carry tokens, provider bodies, or content.
async function emitDataRead(
  args: { actor_entity_id: string; org_entity_id: string },
  provider: "zoom" | "google",
  resource: "recordings" | "freebusy",
  resultCount: number,
  reason: string,
): Promise<void> {
  await writeAuditEvent({
    event_type: "CONNECTOR_DATA_READ",
    outcome: reason === "ok" ? "SUCCESS" : "DENIED",
    actor_entity_id: args.actor_entity_id,
    target_entity_id: args.org_entity_id,
    details: { provider, resource, result_count: resultCount, reason },
  });
}
