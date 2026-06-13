// FILE: connector-data-read.test.ts (unit)
// PURPOSE: Phase 1270 locks for the read-only connector data bridges
//          (Zoom cloud recordings + Google Calendar free/busy). Proves:
//            1. Zoom recordings: token → live list → SAFE projection
//               (topic/when/duration/file-types) with NO download/play
//               URLs; audited CONNECTOR_DATA_READ SUCCESS + result_count
//            2. NOT_CONNECTED / TOKEN_REFRESH_FAILED short-circuit before
//               any provider fetch and audit DENIED (no fake empty list)
//            3. provider non-200 → PROVIDER_ERROR, audited DENIED with a
//               scrubbed http_<status> reason
//            4. Calendar free/busy: valid RFC3339 window → busy intervals
//               only; invalid window → INVALID_REQUEST with NO token call
//               and NO fetch; per-calendar provider errors → PROVIDER_ERROR
//            5. no token material ever appears in audit details
//          No real provider credentials; token helper + fetch are stubbed.
// CONNECTS TO:
//   - apps/api/src/services/connector/connector-data-read.service.ts
//   - apps/api/src/services/connector/connector-oauth.service.ts
//   - packages/database/src/queries/audit.ts (CONNECTOR_DATA_READ literal)

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
  listZoomRecordingsForOrg,
  getCalendarFreeBusyForOrg,
} from "../../apps/api/src/services/connector/connector-data-read.service.js";

const ACTOR = "actor-1";
const ORG = "org-1";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

beforeEach(() => {
  tokenMock.mockReset();
  writeAuditEventMock.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("listZoomRecordingsForOrg", () => {
  it("projects a SAFE recording list (no download/play URLs) and audits success", async () => {
    tokenMock.mockResolvedValue({ ok: true, access_token: "zoom-tok" });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        jsonResponse(200, {
          meetings: [
            {
              uuid: "uuid-A",
              topic: "Quarterly review",
              start_time: "2026-06-01T15:00:00Z",
              duration: 42,
              recording_count: 2,
              total_size: 12345,
              recording_files: [
                {
                  file_type: "MP4",
                  download_url: "https://zoom.us/rec/dl?access_token=SECRET",
                  play_url: "https://zoom.us/rec/play/SECRET",
                },
                { file_type: "TRANSCRIPT" },
              ],
            },
          ],
        }),
      );

    const r = await listZoomRecordingsForOrg({
      actor_entity_id: ACTOR,
      org_entity_id: ORG,
    });

    expect(r.ok).toBe(true);
    if (r.ok === false) throw new Error("expected ok");
    expect(r.recordings).toHaveLength(1);
    const rec = r.recordings[0]!;
    expect(rec.meeting_uuid).toBe("uuid-A");
    expect(rec.topic).toBe("Quarterly review");
    expect(rec.duration_minutes).toBe(42);
    expect(rec.file_types).toEqual(["MP4", "TRANSCRIPT"]);

    // SAFE invariant: no download/play URLs anywhere in the payload.
    const serialized = JSON.stringify(r);
    expect(serialized).not.toContain("download_url");
    expect(serialized).not.toContain("play_url");
    expect(serialized).not.toContain("SECRET");

    // Bearer header carried the token; audit never did.
    const call = fetchSpy.mock.calls[0]!;
    expect((call[1] as RequestInit).headers).toMatchObject({
      Authorization: "Bearer zoom-tok",
    });
    expect(writeAuditEventMock).toHaveBeenCalledTimes(1);
    const audit = writeAuditEventMock.mock.calls[0]![0];
    expect(audit.event_type).toBe("CONNECTOR_DATA_READ");
    expect(audit.outcome).toBe("SUCCESS");
    expect(audit.details.result_count).toBe(1);
    expect(JSON.stringify(audit)).not.toContain("zoom-tok");
  });

  it("returns NOT_CONNECTED and audits DENIED without any provider fetch", async () => {
    tokenMock.mockResolvedValue({ ok: false, code: "NOT_CONNECTED" });
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const r = await listZoomRecordingsForOrg({
      actor_entity_id: ACTOR,
      org_entity_id: ORG,
    });

    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected failure");
    expect(r.code).toBe("NOT_CONNECTED");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(writeAuditEventMock.mock.calls[0]![0].outcome).toBe("DENIED");
  });

  it("maps a provider 5xx to PROVIDER_ERROR with a scrubbed reason", async () => {
    tokenMock.mockResolvedValue({ ok: true, access_token: "zoom-tok" });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(500, {}));

    const r = await listZoomRecordingsForOrg({
      actor_entity_id: ACTOR,
      org_entity_id: ORG,
    });

    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected failure");
    expect(r.code).toBe("PROVIDER_ERROR");
    const audit = writeAuditEventMock.mock.calls[0]![0];
    expect(audit.outcome).toBe("DENIED");
    expect(audit.details.reason).toBe("http_500");
  });

  it("maps a provider 401/403 to SCOPE_REAUTH_REQUIRED (reconnect, not retry)", async () => {
    tokenMock.mockResolvedValue({ ok: true, access_token: "zoom-tok" });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(403, {}));

    const r = await listZoomRecordingsForOrg({
      actor_entity_id: ACTOR,
      org_entity_id: ORG,
    });

    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected failure");
    expect(r.code).toBe("SCOPE_REAUTH_REQUIRED");
    expect(writeAuditEventMock.mock.calls[0]![0].outcome).toBe("DENIED");
  });
});

describe("getCalendarFreeBusyForOrg", () => {
  it("returns busy intervals for a valid window and audits success", async () => {
    tokenMock.mockResolvedValue({ ok: true, access_token: "g-tok" });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(200, {
        calendars: {
          primary: {
            busy: [{ start: "2026-06-01T09:00:00Z", end: "2026-06-01T10:00:00Z" }],
          },
        },
      }),
    );

    const r = await getCalendarFreeBusyForOrg({
      actor_entity_id: ACTOR,
      org_entity_id: ORG,
      time_min: "2026-06-01T00:00:00Z",
      time_max: "2026-06-02T00:00:00Z",
    });

    expect(r.ok).toBe(true);
    if (r.ok === false) throw new Error("expected ok");
    expect(r.calendar_id).toBe("primary");
    expect(r.busy).toEqual([
      { start: "2026-06-01T09:00:00Z", end: "2026-06-01T10:00:00Z" },
    ]);
    const audit = writeAuditEventMock.mock.calls[0]![0];
    expect(audit.event_type).toBe("CONNECTOR_DATA_READ");
    expect(audit.outcome).toBe("SUCCESS");
    expect(audit.details.result_count).toBe(1);
  });

  it("rejects a malformed window with INVALID_REQUEST and never calls the provider", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const r = await getCalendarFreeBusyForOrg({
      actor_entity_id: ACTOR,
      org_entity_id: ORG,
      time_min: "yesterday",
      time_max: "2026-06-02T00:00:00Z",
    });

    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected failure");
    expect(r.code).toBe("INVALID_REQUEST");
    expect(tokenMock).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(writeAuditEventMock).not.toHaveBeenCalled();
  });

  it("maps a per-calendar provider error to PROVIDER_ERROR", async () => {
    tokenMock.mockResolvedValue({ ok: true, access_token: "g-tok" });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(200, {
        calendars: { primary: { errors: [{ reason: "notFound" }] } },
      }),
    );

    const r = await getCalendarFreeBusyForOrg({
      actor_entity_id: ACTOR,
      org_entity_id: ORG,
      time_min: "2026-06-01T00:00:00Z",
      time_max: "2026-06-02T00:00:00Z",
    });

    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected failure");
    expect(r.code).toBe("PROVIDER_ERROR");
    expect(writeAuditEventMock.mock.calls[0]![0].outcome).toBe("DENIED");
  });
});
