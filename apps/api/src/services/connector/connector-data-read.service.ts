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

import { createHash } from "node:crypto";
import { writeAuditEvent } from "@niov/database";
import { getProviderAccessTokenForOrg } from "./connector-oauth.service.js";
import { validateImportedText } from "../otzar/source-integrity.js";

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
  // Phase 1271 — the stored token reached the provider but was
  // rejected for auth/scope reasons (HTTP 401/403): the granted
  // scopes don't cover this read, or the token is no longer valid.
  // The honest remedy is a re-consent (reconnect), NOT a retry. We
  // surface this distinctly so the UI can say "reconnect" rather than
  // a generic provider error — without introspecting token internals.
  | "SCOPE_REAUTH_REQUIRED"
  | "PROVIDER_ERROR"
  | "INVALID_REQUEST";

// WHAT: Map a provider HTTP status to the honest failure code.
// WHY: 401 (invalid/expired token) and 403 (insufficient scope) both
//      mean a re-consent is required — never a silent retry. Any other
//      non-2xx is an upstream provider error.
function codeForProviderStatus(status: number): ConnectorDataReadCode {
  if (status === 401 || status === 403) return "SCOPE_REAUTH_REQUIRED";
  return "PROVIDER_ERROR";
}

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
    return { ok: false, code: codeForProviderStatus(res.status) };
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
    return { ok: false, code: codeForProviderStatus(res.status) };
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
  resource: "recordings" | "freebusy" | "drive_docs" | "drive_doc_export" | "meet_records" | "meet_transcript",
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

// ── Google Drive documents (read-only, selected-doc discipline) ──

// WHAT: One Google Doc, SAFE-projected for selection.
// WHY: Enough for an admin to recognize and SELECT one document
//      (name + modified + owner + view link); never content, never
//      export/download URLs (exports happen server-side only).
export interface GoogleDocView {
  file_id: string;
  name: string;
  modified_time: string;
  owner: string | null;
  web_view_link: string | null;
}

export interface GoogleDocsListResult {
  ok: true;
  provider: "google";
  docs: GoogleDocView[];
}

interface DriveFileRaw {
  id?: unknown;
  name?: unknown;
  modifiedTime?: unknown;
  owners?: unknown;
  webViewLink?: unknown;
}

function projectDriveFile(raw: DriveFileRaw): GoogleDocView | null {
  if (typeof raw.id !== "string") return null;
  const owners = Array.isArray(raw.owners) ? raw.owners : [];
  const firstOwner =
    owners.length > 0 &&
    typeof (owners[0] as { displayName?: unknown }).displayName === "string"
      ? ((owners[0] as { displayName: string }).displayName)
      : null;
  return {
    file_id: raw.id,
    name: typeof raw.name === "string" ? raw.name : "(untitled)",
    modified_time: typeof raw.modifiedTime === "string" ? raw.modifiedTime : "",
    owner: firstOwner,
    web_view_link: typeof raw.webViewLink === "string" ? raw.webViewLink : null,
  };
}

// WHAT: List Google Docs visible to the org's granted drive.readonly
//        scope (native Docs only — the export path below is text/plain).
// INPUT: actor + org + optional page_size + optional name_query.
// OUTPUT: SAFE doc projections, or an honest failure code.
// WHY: SELECTED-DOC DISCIPLINE — this list exists so an admin picks ONE
//      document to import; nothing here reads content and nothing ever
//      auto-syncs a Drive. Audited as CONNECTOR_DATA_READ either way.
export async function listGoogleDocsForOrg(args: {
  actor_entity_id: string;
  org_entity_id: string;
  page_size?: number;
  name_query?: string;
}): Promise<GoogleDocsListResult | ConnectorDataReadFailure> {
  const token = await getProviderAccessTokenForOrg({
    provider: "GOOGLE_WORKSPACE",
    org_entity_id: args.org_entity_id,
  });
  if (token.ok === false) {
    await emitDataRead(args, "google", "drive_docs", 0, token.code);
    return { ok: false, code: token.code };
  }
  const pageSize = clampPageSize(args.page_size, 25, 100);
  let q = "mimeType='application/vnd.google-apps.document' and trashed=false";
  if (typeof args.name_query === "string" && args.name_query.trim().length > 0) {
    // Drive q-syntax: escape single quotes inside the contains term.
    const safe = args.name_query.trim().slice(0, 80).replace(/'/g, "\\'");
    q += ` and name contains '${safe}'`;
  }
  const params = new URLSearchParams({
    q,
    pageSize: String(pageSize),
    fields: "files(id,name,modifiedTime,owners(displayName),webViewLink)",
    orderBy: "modifiedTime desc",
  });
  let res: Response;
  try {
    res = await fetchWithTimeout(
      `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
      { method: "GET", headers: { Authorization: `Bearer ${token.access_token}` } },
    );
  } catch {
    await emitDataRead(args, "google", "drive_docs", 0, "fetch_failed");
    return { ok: false, code: "PROVIDER_ERROR" };
  }
  if (!res.ok) {
    await emitDataRead(args, "google", "drive_docs", 0, `http_${res.status}`);
    return { ok: false, code: codeForProviderStatus(res.status) };
  }
  let json: { files?: unknown };
  try {
    json = (await res.json()) as { files?: unknown };
  } catch {
    await emitDataRead(args, "google", "drive_docs", 0, "bad_json");
    return { ok: false, code: "PROVIDER_ERROR" };
  }
  const files = Array.isArray(json.files) ? (json.files as DriveFileRaw[]) : [];
  const docs = files
    .map(projectDriveFile)
    .filter((d): d is GoogleDocView => d !== null);
  await emitDataRead(args, "google", "drive_docs", docs.length, "ok");
  return { ok: true, provider: "google", docs };
}

export const GOOGLE_DOC_EXPORT_MAX_CHARS = 20_000;

export interface GoogleDocExportResult {
  ok: true;
  provider: "google";
  file_id: string;
  name: string;
  modified_time: string;
  web_view_link: string | null;
  content_sha256: string;
  text: string;
}

export type GoogleDocExportFailure =
  | ConnectorDataReadFailure
  // [SOURCE-INTEGRITY] SOURCE_EMPTY / SOURCE_UNREADABLE are content-integrity
  // refusals raised AFTER a successful export but BEFORE any trusted row: an
  // empty/whitespace-only or binary/corrupt export is quarantined, never
  // imported. The admin sees the honest code; no DOCUMENT_CONTEXT row exists.
  | { ok: false; code: "NOT_FOUND" | "DOC_TOO_LARGE" | "SOURCE_EMPTY" | "SOURCE_UNREADABLE" };

// WHAT: Export ONE selected Google Doc as plain text, with its SAFE
//        metadata and a content hash for lineage.
// INPUT: actor + org + file_id (the admin's explicit selection).
// OUTPUT: { name, modified_time, web_view_link, content_sha256, text }
//         or an honest failure (NOT_FOUND / DOC_TOO_LARGE / token codes).
// WHY: The export happens server-side over the org's sealed OAuth
//      envelope — content and export URLs never reach the client raw;
//      the caller routes the text into the DOCUMENT_CONTEXT rail with
//      full source lineage. Oversized docs refuse honestly rather than
//      silently truncating someone's source of truth.
export async function fetchGoogleDocTextForOrg(args: {
  actor_entity_id: string;
  org_entity_id: string;
  file_id: string;
}): Promise<GoogleDocExportResult | GoogleDocExportFailure> {
  if (typeof args.file_id !== "string" || args.file_id.length === 0) {
    return { ok: false, code: "INVALID_REQUEST" };
  }
  const token = await getProviderAccessTokenForOrg({
    provider: "GOOGLE_WORKSPACE",
    org_entity_id: args.org_entity_id,
  });
  if (token.ok === false) {
    await emitDataRead(args, "google", "drive_doc_export", 0, token.code);
    return { ok: false, code: token.code };
  }
  const headers = { Authorization: `Bearer ${token.access_token}` };
  const fileId = encodeURIComponent(args.file_id);

  let metaRes: Response;
  try {
    metaRes = await fetchWithTimeout(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,modifiedTime,webViewLink`,
      { method: "GET", headers },
    );
  } catch {
    await emitDataRead(args, "google", "drive_doc_export", 0, "fetch_failed");
    return { ok: false, code: "PROVIDER_ERROR" };
  }
  if (metaRes.status === 404) {
    await emitDataRead(args, "google", "drive_doc_export", 0, "http_404");
    return { ok: false, code: "NOT_FOUND" };
  }
  if (!metaRes.ok) {
    await emitDataRead(args, "google", "drive_doc_export", 0, `http_${metaRes.status}`);
    return { ok: false, code: codeForProviderStatus(metaRes.status) };
  }
  let meta: DriveFileRaw;
  try {
    meta = (await metaRes.json()) as DriveFileRaw;
  } catch {
    await emitDataRead(args, "google", "drive_doc_export", 0, "bad_json");
    return { ok: false, code: "PROVIDER_ERROR" };
  }

  let exportRes: Response;
  try {
    exportRes = await fetchWithTimeout(
      `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text%2Fplain`,
      { method: "GET", headers },
    );
  } catch {
    await emitDataRead(args, "google", "drive_doc_export", 0, "fetch_failed");
    return { ok: false, code: "PROVIDER_ERROR" };
  }
  if (!exportRes.ok) {
    await emitDataRead(args, "google", "drive_doc_export", 0, `http_${exportRes.status}`);
    return { ok: false, code: codeForProviderStatus(exportRes.status) };
  }
  const text = await exportRes.text();
  if (text.length > GOOGLE_DOC_EXPORT_MAX_CHARS) {
    await emitDataRead(args, "google", "drive_doc_export", 0, "doc_too_large");
    return { ok: false, code: "DOC_TOO_LARGE" };
  }
  // [SOURCE-INTEGRITY] HASH-BEFORE-COMMIT + NO-PARTIAL-ROW invariant: validate
  // the exported text HERE — before the content hash is computed and before the
  // caller ever creates a DOCUMENT_CONTEXT row. An empty/whitespace-only or
  // binary/corrupt export is QUARANTINED: the honest code returns to the admin,
  // the reject is audited (IMPORT_QUARANTINED, SAFE file_id + reason — never the
  // body), and NO trusted row is created on any reject path. The size gate
  // above still refuses oversized docs with NO truncation.
  const integrity = validateImportedText(text);
  if (integrity.ok === false) {
    const reason = integrity.code === "SOURCE_EMPTY" ? "source_empty" : "source_unreadable";
    await emitDataRead(args, "google", "drive_doc_export", 0, reason);
    await writeAuditEvent({
      event_type: "IMPORT_QUARANTINED",
      outcome: "DENIED",
      actor_entity_id: args.actor_entity_id,
      target_entity_id: args.org_entity_id,
      details: { provider: "google", file_id: args.file_id, reason, code: integrity.code },
    });
    return { ok: false, code: integrity.code };
  }
  const contentSha = createHash("sha256").update(text, "utf8").digest("hex");
  await emitDataRead(args, "google", "drive_doc_export", 1, "ok");
  return {
    ok: true,
    provider: "google",
    file_id: typeof meta.id === "string" ? meta.id : args.file_id,
    name: typeof meta.name === "string" ? meta.name : "(untitled)",
    modified_time: typeof meta.modifiedTime === "string" ? meta.modifiedTime : "",
    web_view_link: typeof meta.webViewLink === "string" ? meta.webViewLink : null,
    content_sha256: `sha256:${contentSha}`,
    text,
  };
}

// ── Google Meet conference records + transcripts (post-meeting) ──

// WHAT: One Meet conference record, SAFE-projected for selection.
// WHY: Post-meeting selection surface — the Meet API exposes records
//      AFTER a meeting ends; nothing here is (or claims to be)
//      real-time.
export interface MeetConferenceRecordView {
  record_id: string;
  meeting_code: string | null;
  start_time: string;
  end_time: string | null;
}

export interface MeetConferenceRecordsResult {
  ok: true;
  provider: "google";
  records: MeetConferenceRecordView[];
}

interface MeetRecordRaw {
  name?: unknown;
  space?: unknown;
  startTime?: unknown;
  endTime?: unknown;
}

// WHAT: List the org's Meet conference records (read-only, post-meeting).
// OUTPUT: SAFE record projections or an honest failure.
// WHY: Selection surface for transcript import; requires the
//      meetings.space.readonly consent — absent that scope the provider
//      answers 403 and this surfaces SCOPE_REAUTH_REQUIRED honestly.
export async function listMeetConferenceRecordsForOrg(args: {
  actor_entity_id: string;
  org_entity_id: string;
  page_size?: number;
}): Promise<MeetConferenceRecordsResult | ConnectorDataReadFailure> {
  const token = await getProviderAccessTokenForOrg({
    provider: "GOOGLE_WORKSPACE",
    org_entity_id: args.org_entity_id,
  });
  if (token.ok === false) {
    await emitDataRead(args, "google", "meet_records", 0, token.code);
    return { ok: false, code: token.code };
  }
  const pageSize = clampPageSize(args.page_size, 25, 100);
  let res: Response;
  try {
    res = await fetchWithTimeout(
      `https://meet.googleapis.com/v2/conferenceRecords?pageSize=${pageSize}`,
      { method: "GET", headers: { Authorization: `Bearer ${token.access_token}` } },
    );
  } catch {
    await emitDataRead(args, "google", "meet_records", 0, "fetch_failed");
    return { ok: false, code: "PROVIDER_ERROR" };
  }
  if (!res.ok) {
    await emitDataRead(args, "google", "meet_records", 0, `http_${res.status}`);
    return { ok: false, code: codeForProviderStatus(res.status) };
  }
  let json: { conferenceRecords?: unknown };
  try {
    json = (await res.json()) as { conferenceRecords?: unknown };
  } catch {
    await emitDataRead(args, "google", "meet_records", 0, "bad_json");
    return { ok: false, code: "PROVIDER_ERROR" };
  }
  const raws = Array.isArray(json.conferenceRecords)
    ? (json.conferenceRecords as MeetRecordRaw[])
    : [];
  const records = raws
    .map((r): MeetConferenceRecordView | null => {
      if (typeof r.name !== "string") return null;
      return {
        record_id: r.name.replace(/^conferenceRecords\//, ""),
        meeting_code:
          typeof r.space === "string" ? r.space.replace(/^spaces\//, "") : null,
        start_time: typeof r.startTime === "string" ? r.startTime : "",
        end_time: typeof r.endTime === "string" ? r.endTime : null,
      };
    })
    .filter((r): r is MeetConferenceRecordView => r !== null);
  await emitDataRead(args, "google", "meet_records", records.length, "ok");
  return { ok: true, provider: "google", records };
}

export const MEET_TRANSCRIPT_MAX_CHARS = 200_000;
const MEET_TRANSCRIPT_MAX_PAGES = 10;

export interface MeetTranscriptResult {
  ok: true;
  provider: "google";
  record_id: string;
  start_time: string;
  /** Speaker-attributed lines, "Name: text" — the comms-spine shape. */
  transcript: string;
  entry_count: number;
}

export type MeetTranscriptFailure =
  | ConnectorDataReadFailure
  | { ok: false; code: "NOT_FOUND" | "NO_TRANSCRIPT" | "TRANSCRIPT_TOO_LARGE" };

// WHAT: Fetch ONE conference record's transcript entries (post-meeting)
//        and flatten to speaker-attributed text for the comms spine.
// INPUT: actor + org + record_id (the admin's explicit selection).
// OUTPUT: transcript text + entry count, or an honest failure —
//         NO_TRANSCRIPT when the meeting has no Meet-generated
//         transcript (the API is post-meeting and permission-dependent;
//         we never fabricate one from anything else).
// WHY: This is the MEET-API transcript path, distinct by construction
//      from a Google-Docs transcript file (Drive export above) and a
//      manually pasted transcript (the manual rail) — lineage keeps
//      the three apart.
export async function fetchMeetTranscriptForOrg(args: {
  actor_entity_id: string;
  org_entity_id: string;
  record_id: string;
}): Promise<MeetTranscriptResult | MeetTranscriptFailure> {
  if (typeof args.record_id !== "string" || args.record_id.length === 0) {
    return { ok: false, code: "INVALID_REQUEST" };
  }
  const token = await getProviderAccessTokenForOrg({
    provider: "GOOGLE_WORKSPACE",
    org_entity_id: args.org_entity_id,
  });
  if (token.ok === false) {
    await emitDataRead(args, "google", "meet_transcript", 0, token.code);
    return { ok: false, code: token.code };
  }
  const headers = { Authorization: `Bearer ${token.access_token}` };
  const recordId = encodeURIComponent(args.record_id);

  // Record metadata (start time + existence).
  let recRes: Response;
  try {
    recRes = await fetchWithTimeout(
      `https://meet.googleapis.com/v2/conferenceRecords/${recordId}`,
      { method: "GET", headers },
    );
  } catch {
    await emitDataRead(args, "google", "meet_transcript", 0, "fetch_failed");
    return { ok: false, code: "PROVIDER_ERROR" };
  }
  if (recRes.status === 404) {
    await emitDataRead(args, "google", "meet_transcript", 0, "http_404");
    return { ok: false, code: "NOT_FOUND" };
  }
  if (!recRes.ok) {
    await emitDataRead(args, "google", "meet_transcript", 0, `http_${recRes.status}`);
    return { ok: false, code: codeForProviderStatus(recRes.status) };
  }
  const recJson = (await recRes.json().catch(() => ({}))) as MeetRecordRaw;
  const startTime =
    typeof recJson.startTime === "string" ? recJson.startTime : "";

  // Transcript resource (post-meeting; may honestly not exist).
  let listRes: Response;
  try {
    listRes = await fetchWithTimeout(
      `https://meet.googleapis.com/v2/conferenceRecords/${recordId}/transcripts`,
      { method: "GET", headers },
    );
  } catch {
    await emitDataRead(args, "google", "meet_transcript", 0, "fetch_failed");
    return { ok: false, code: "PROVIDER_ERROR" };
  }
  if (!listRes.ok) {
    await emitDataRead(args, "google", "meet_transcript", 0, `http_${listRes.status}`);
    return { ok: false, code: codeForProviderStatus(listRes.status) };
  }
  const listJson = (await listRes.json().catch(() => ({}))) as {
    transcripts?: Array<{ name?: unknown }>;
  };
  const transcriptName =
    Array.isArray(listJson.transcripts) &&
    typeof listJson.transcripts[0]?.name === "string"
      ? (listJson.transcripts[0].name)
      : null;
  if (transcriptName === null) {
    await emitDataRead(args, "google", "meet_transcript", 0, "no_transcript");
    return { ok: false, code: "NO_TRANSCRIPT" };
  }

  // Entries (paginated, bounded).
  const lines: string[] = [];
  let entryCount = 0;
  let pageToken: string | null = null;
  for (let page = 0; page < MEET_TRANSCRIPT_MAX_PAGES; page++) {
    const params = new URLSearchParams({ pageSize: "1000" });
    if (pageToken !== null) params.set("pageToken", pageToken);
    let entriesRes: Response;
    try {
      entriesRes = await fetchWithTimeout(
        `https://meet.googleapis.com/v2/${transcriptName}/entries?${params.toString()}`,
        { method: "GET", headers },
      );
    } catch {
      await emitDataRead(args, "google", "meet_transcript", 0, "fetch_failed");
      return { ok: false, code: "PROVIDER_ERROR" };
    }
    if (!entriesRes.ok) {
      await emitDataRead(args, "google", "meet_transcript", 0, `http_${entriesRes.status}`);
      return { ok: false, code: codeForProviderStatus(entriesRes.status) };
    }
    const entriesJson = (await entriesRes.json().catch(() => ({}))) as {
      transcriptEntries?: Array<{ participant?: unknown; text?: unknown }>;
      nextPageToken?: unknown;
    };
    for (const e of entriesJson.transcriptEntries ?? []) {
      if (typeof e.text !== "string" || e.text.length === 0) continue;
      const speaker =
        typeof e.participant === "string"
          ? e.participant.split("/").pop() ?? "Speaker"
          : "Speaker";
      lines.push(`${speaker}: ${e.text}`);
      entryCount += 1;
    }
    pageToken =
      typeof entriesJson.nextPageToken === "string" &&
      entriesJson.nextPageToken.length > 0
        ? entriesJson.nextPageToken
        : null;
    if (pageToken === null) break;
  }
  const transcript = lines.join("\n");
  if (transcript.length > MEET_TRANSCRIPT_MAX_CHARS) {
    await emitDataRead(args, "google", "meet_transcript", 0, "transcript_too_large");
    return { ok: false, code: "TRANSCRIPT_TOO_LARGE" };
  }
  if (transcript.length === 0) {
    await emitDataRead(args, "google", "meet_transcript", 0, "no_transcript");
    return { ok: false, code: "NO_TRANSCRIPT" };
  }
  await emitDataRead(args, "google", "meet_transcript", entryCount, "ok");
  return {
    ok: true,
    provider: "google",
    record_id: args.record_id,
    start_time: startTime,
    transcript,
    entry_count: entryCount,
  };
}
