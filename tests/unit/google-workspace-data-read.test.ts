// FILE: google-workspace-data-read.test.ts (unit)
// PURPOSE: [GOOGLE-DOCS + GOOGLE-MEET] Locks for the Google read bridges
//          (selected-doc Drive export + post-meeting Meet transcripts):
//            1. Docs list: token → live list → SAFE projection (id/name/
//               modified/owner/view link — never content, never export
//               URLs); audited CONNECTOR_DATA_READ SUCCESS
//            2. NOT_CONNECTED short-circuits before any provider fetch —
//               "connected" is never faked
//            3. 403 → SCOPE_REAUTH_REQUIRED (the honest "reconnect with
//               the new scope" answer, not a generic error)
//            4. Doc export: happy path carries content hash + metadata;
//               oversized doc refuses DOC_TOO_LARGE (never a silent
//               truncation of someone's source of truth)
//            5. Meet: a meeting with no transcript answers NO_TRANSCRIPT
//               honestly (post-meeting API; nothing fabricated); entries
//               flatten to speaker-attributed lines
//            6. the Meet source-event adapter stamps GOOGLE_MEET:<id>
//               lineage (distinct from Docs-file and manual transcripts)
//          No real Google credentials; token helper + fetch are stubbed.
// CONNECTS TO: connector-data-read.service.ts, source-event.ts,
//              connector-data.routes.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { tokenMock, writeAuditEventMock } = vi.hoisted(() => ({
  tokenMock: vi.fn(),
  writeAuditEventMock: vi
    .fn()
    .mockResolvedValue({ audit_id: "00000000-0000-0000-0000-000000000000" }),
}));

vi.mock("@niov/database", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, writeAuditEvent: writeAuditEventMock };
});

vi.mock(
  "../../apps/api/src/services/connector/connector-oauth.service.js",
  () => ({ getProviderAccessTokenForOrg: tokenMock }),
);

import {
  listGoogleDocsForOrg,
  fetchGoogleDocTextForOrg,
  listMeetConferenceRecordsForOrg,
  fetchMeetTranscriptForOrg,
  GOOGLE_DOC_EXPORT_MAX_CHARS,
} from "../../apps/api/src/services/connector/connector-data-read.service.js";
import { validateImportedText } from "../../apps/api/src/services/otzar/source-integrity.js";
import { googleMeetTranscriptToSourceEvent } from "../../apps/api/src/services/otzar/source-event.js";

const ACTOR = "actor-1";
const ORG = "org-1";
const ARGS = { actor_entity_id: ACTOR, org_entity_id: ORG };

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  } as unknown as Response;
}

function textResponse(status: number, text: string): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => JSON.parse(text),
    text: async () => text,
  } as unknown as Response;
}

const fetchMock = vi.fn();

beforeEach(() => {
  tokenMock.mockReset();
  writeAuditEventMock.mockClear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("[GOOGLE-DOCS] listGoogleDocsForOrg", () => {
  it("projects SAFE metadata only and audits SUCCESS", async () => {
    tokenMock.mockResolvedValue({ ok: true, access_token: "tok-abc" });
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        files: [
          {
            id: "f1",
            name: "Q3 Delivery Plan",
            modifiedTime: "2026-07-01T10:00:00Z",
            owners: [{ displayName: "Dana" }],
            webViewLink: "https://docs.google.com/document/d/f1/view",
          },
          { name: "no-id-dropped" },
        ],
      }),
    );
    const res = await listGoogleDocsForOrg(ARGS);
    expect(res.ok).toBe(true);
    if (res.ok !== true) throw new Error("expected ok");
    expect(res.docs).toHaveLength(1);
    expect(res.docs[0]).toEqual({
      file_id: "f1",
      name: "Q3 Delivery Plan",
      modified_time: "2026-07-01T10:00:00Z",
      owner: "Dana",
      web_view_link: "https://docs.google.com/document/d/f1/view",
    });
    // No content-ish keys in the projection.
    expect(JSON.stringify(res)).not.toContain("export");
    const audit = writeAuditEventMock.mock.calls.at(-1)?.[0] as {
      details: Record<string, unknown>;
      outcome: string;
    };
    expect(audit.outcome).toBe("SUCCESS");
    expect(audit.details.resource).toBe("drive_docs");
    expect(JSON.stringify(audit.details)).not.toContain("tok-abc");
  });

  it("NOT_CONNECTED short-circuits before any provider fetch (no fake list)", async () => {
    tokenMock.mockResolvedValue({ ok: false, code: "NOT_CONNECTED" });
    const res = await listGoogleDocsForOrg(ARGS);
    expect(res).toEqual({ ok: false, code: "NOT_CONNECTED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("provider 403 → SCOPE_REAUTH_REQUIRED (honest reconnect, not a retry)", async () => {
    tokenMock.mockResolvedValue({ ok: true, access_token: "tok-abc" });
    fetchMock.mockResolvedValue(jsonResponse(403, {}));
    const res = await listGoogleDocsForOrg(ARGS);
    expect(res).toEqual({ ok: false, code: "SCOPE_REAUTH_REQUIRED" });
  });
});

describe("[GOOGLE-DOCS] fetchGoogleDocTextForOrg", () => {
  it("exports ONE selected doc with metadata + content hash", async () => {
    tokenMock.mockResolvedValue({ ok: true, access_token: "tok-abc" });
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, {
          id: "f1",
          name: "SOW — Harborview",
          modifiedTime: "2026-06-15T09:00:00Z",
          webViewLink: "https://docs.google.com/document/d/f1/view",
        }),
      )
      .mockResolvedValueOnce(textResponse(200, "Scope: install 40 units."));
    const res = await fetchGoogleDocTextForOrg({ ...ARGS, file_id: "f1" });
    expect(res.ok).toBe(true);
    if (res.ok !== true) throw new Error("expected ok");
    expect(res.name).toBe("SOW — Harborview");
    expect(res.text).toBe("Scope: install 40 units.");
    expect(res.content_sha256).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(res.modified_time).toBe("2026-06-15T09:00:00Z");
  });

  it("refuses an oversized doc honestly (DOC_TOO_LARGE, never truncation)", async () => {
    tokenMock.mockResolvedValue({ ok: true, access_token: "tok-abc" });
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { id: "f1", name: "Huge" }))
      .mockResolvedValueOnce(
        textResponse(200, "x".repeat(GOOGLE_DOC_EXPORT_MAX_CHARS + 1)),
      );
    const res = await fetchGoogleDocTextForOrg({ ...ARGS, file_id: "f1" });
    expect(res).toEqual({ ok: false, code: "DOC_TOO_LARGE" });
  });

  it("unknown file → NOT_FOUND", async () => {
    tokenMock.mockResolvedValue({ ok: true, access_token: "tok-abc" });
    fetchMock.mockResolvedValueOnce(jsonResponse(404, {}));
    const res = await fetchGoogleDocTextForOrg({ ...ARGS, file_id: "ghost" });
    expect(res).toEqual({ ok: false, code: "NOT_FOUND" });
  });

  // [SOURCE-INTEGRITY] no partial trusted row: a bad export is quarantined
  // BEFORE the hash is computed and BEFORE any DOCUMENT_CONTEXT row exists.
  it("empty export → SOURCE_EMPTY, quarantined, NO row (no hash computed)", async () => {
    tokenMock.mockResolvedValue({ ok: true, access_token: "tok-abc" });
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { id: "f-empty", name: "Empty doc" }))
      .mockResolvedValueOnce(textResponse(200, ""));
    const res = await fetchGoogleDocTextForOrg({ ...ARGS, file_id: "f-empty" });
    expect(res).toEqual({ ok: false, code: "SOURCE_EMPTY" });
    const quarantined = writeAuditEventMock.mock.calls.some(
      (c) => (c[0] as { event_type: string }).event_type === "IMPORT_QUARANTINED",
    );
    expect(quarantined).toBe(true);
    // SAFE audit: file_id + reason present, no export/body leakage.
    const q = writeAuditEventMock.mock.calls.find(
      (c) => (c[0] as { event_type: string }).event_type === "IMPORT_QUARANTINED",
    )![0] as { details: Record<string, unknown> };
    expect(q.details.file_id).toBe("f-empty");
    expect(q.details.code).toBe("SOURCE_EMPTY");
  });

  it("whitespace-only export → SOURCE_EMPTY", async () => {
    tokenMock.mockResolvedValue({ ok: true, access_token: "tok-abc" });
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { id: "f-ws", name: "Blank doc" }))
      .mockResolvedValueOnce(textResponse(200, "   \n\t  \n "));
    const res = await fetchGoogleDocTextForOrg({ ...ARGS, file_id: "f-ws" });
    expect(res).toEqual({ ok: false, code: "SOURCE_EMPTY" });
  });

  it("binary/null-byte export -> SOURCE_UNREADABLE, quarantined, NO row", async () => {
    tokenMock.mockResolvedValue({ ok: true, access_token: "tok-abc" });
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { id: "f-bin", name: "Binary blob" }))
      .mockResolvedValueOnce(textResponse(200, "PK\u0000\u0000\u0001binary payload"));
    const res = await fetchGoogleDocTextForOrg({ ...ARGS, file_id: "f-bin" });
    expect(res).toEqual({ ok: false, code: "SOURCE_UNREADABLE" });
    const quarantined = writeAuditEventMock.mock.calls.some(
      (c) => (c[0] as { event_type: string }).event_type === "IMPORT_QUARANTINED",
    );
    expect(quarantined).toBe(true);
  });
});

// [SOURCE-INTEGRITY] the pure import-text validator, tested in isolation.
describe("[SOURCE-INTEGRITY] validateImportedText", () => {
  it("accepts real prose; rejects empty/whitespace, null bytes, and control-char binary", () => {
    expect(validateImportedText("Scope: install 40 units.")).toEqual({ ok: true });
    expect(validateImportedText("")).toEqual({ ok: false, code: "SOURCE_EMPTY" });
    expect(validateImportedText("   \n\t ")).toEqual({ ok: false, code: "SOURCE_EMPTY" });
    // A single null byte is an unambiguous binary signal on its own.
    expect(validateImportedText("ok\u0000here")).toEqual({ ok: false, code: "SOURCE_UNREADABLE" });
    // >10% control chars (excluding tab/newline/carriage-return) -> unreadable.
    expect(validateImportedText("a\u0001\u0002\u0003\u0004\u0005")).toEqual({
      ok: false,
      code: "SOURCE_UNREADABLE",
    });
    // Tabs / newlines / carriage returns are normal in real documents.
    expect(validateImportedText("line 1\nline 2\tcol\r\nline 3")).toEqual({ ok: true });
  });
});

describe("[GOOGLE-MEET] conference records + transcript", () => {
  it("lists post-meeting records (SAFE projection)", async () => {
    tokenMock.mockResolvedValue({ ok: true, access_token: "tok-abc" });
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        conferenceRecords: [
          {
            name: "conferenceRecords/rec-1",
            space: "spaces/abc-code",
            startTime: "2026-07-02T15:00:00Z",
            endTime: "2026-07-02T15:45:00Z",
          },
        ],
      }),
    );
    const res = await listMeetConferenceRecordsForOrg(ARGS);
    expect(res.ok).toBe(true);
    if (res.ok !== true) throw new Error("expected ok");
    expect(res.records[0]).toEqual({
      record_id: "rec-1",
      meeting_code: "abc-code",
      start_time: "2026-07-02T15:00:00Z",
      end_time: "2026-07-02T15:45:00Z",
    });
  });

  it("a meeting with NO transcript answers NO_TRANSCRIPT — nothing fabricated", async () => {
    tokenMock.mockResolvedValue({ ok: true, access_token: "tok-abc" });
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { name: "conferenceRecords/rec-1", startTime: "2026-07-02T15:00:00Z" }))
      .mockResolvedValueOnce(jsonResponse(200, { transcripts: [] }));
    const res = await fetchMeetTranscriptForOrg({ ...ARGS, record_id: "rec-1" });
    expect(res).toEqual({ ok: false, code: "NO_TRANSCRIPT" });
  });

  it("flattens transcript entries to speaker-attributed lines", async () => {
    tokenMock.mockResolvedValue({ ok: true, access_token: "tok-abc" });
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { name: "conferenceRecords/rec-1", startTime: "2026-07-02T15:00:00Z" }))
      .mockResolvedValueOnce(
        jsonResponse(200, { transcripts: [{ name: "conferenceRecords/rec-1/transcripts/t1" }] }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          transcriptEntries: [
            { participant: "conferenceRecords/rec-1/participants/p-dana", text: "Kickoff is July 24." },
            { participant: "conferenceRecords/rec-1/participants/p-lee", text: "Understood." },
          ],
        }),
      );
    const res = await fetchMeetTranscriptForOrg({ ...ARGS, record_id: "rec-1" });
    expect(res.ok).toBe(true);
    if (res.ok !== true) throw new Error("expected ok");
    expect(res.entry_count).toBe(2);
    expect(res.transcript).toBe("p-dana: Kickoff is July 24.\np-lee: Understood.");
    expect(res.start_time).toBe("2026-07-02T15:00:00Z");
  });
});

describe("[GOOGLE-MEET] source-event adapter lineage", () => {
  it("stamps GOOGLE_MEET:<record_id> — distinct from Docs-file and manual transcripts", () => {
    const e = googleMeetTranscriptToSourceEvent({
      recordId: "rec-1",
      meetingLabel: "meeting of 2026-07-02",
      transcript: "Dana: Kickoff is July 24.",
      callerEntityId: "admin-1",
      callerName: "Google Meet transcript import",
      orgEntityId: ORG,
      startTimeIso: "2026-07-02T15:00:00Z",
      nowIso: "2026-07-07T00:00:00Z",
    });
    expect(e.sourceSystem).toBe("MEETING");
    expect(e.sourceType).toBe("CONNECTOR");
    expect(e.sourceId).toBe("GOOGLE_MEET:rec-1");
    expect(e.sourceUrl).toBeNull();
    expect(e.timestamp).toBe("2026-07-02T15:00:00Z"); // meeting time, not now
    expect(e.title).toBe("Google Meet: meeting of 2026-07-02");
  });
});
