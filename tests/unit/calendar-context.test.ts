// FILE: calendar-context.test.ts
// PURPOSE: Phase 1236 — pure tests for the calendar-context helpers:
//          provider-mode resolution from credential envs, meeting
//          provider mapping, consent derivation, title bounding.

import { describe, expect, it } from "vitest";
import {
  deriveCaptureAllowed,
  mapMeetingProvider,
  resolveProviderMode,
  summarizeTitle,
} from "../../apps/api/src/services/otzar/calendar-context.service.js";

describe("Phase 1236 — resolveProviderMode", () => {
  it("MOCK_CALENDAR when no calendar credentials exist", () => {
    expect(resolveProviderMode({})).toBe("MOCK_CALENDAR");
  });

  it("GOOGLE_CALENDAR_CONFIGURED when google oauth envs are present", () => {
    expect(
      resolveProviderMode({
        GOOGLE_OAUTH_CLIENT_ID: "id",
        GOOGLE_OAUTH_CLIENT_SECRET: "secret",
      }),
    ).toBe("GOOGLE_CALENDAR_CONFIGURED");
  });

  it("MICROSOFT_CALENDAR_CONFIGURED when graph envs are present", () => {
    expect(
      resolveProviderMode({
        MICROSOFT_GRAPH_CLIENT_ID: "id",
        MICROSOFT_GRAPH_CLIENT_SECRET: "secret",
      }),
    ).toBe("MICROSOFT_CALENDAR_CONFIGURED");
  });

  it("empty-string envs do not count as configured", () => {
    expect(
      resolveProviderMode({
        GOOGLE_OAUTH_CLIENT_ID: "",
        GOOGLE_OAUTH_CLIENT_SECRET: "",
      }),
    ).toBe("MOCK_CALENDAR");
  });
});

describe("Phase 1236 — mapMeetingProvider", () => {
  it("maps the three named providers and folds the rest to OTHER", () => {
    expect(mapMeetingProvider("GOOGLE_MEET")).toBe("GOOGLE_MEET");
    expect(mapMeetingProvider("ZOOM")).toBe("ZOOM");
    expect(mapMeetingProvider("MICROSOFT_TEAMS")).toBe("MICROSOFT_TEAMS");
    expect(mapMeetingProvider("MANUAL_UPLOAD")).toBe("OTHER");
    expect(mapMeetingProvider("API_INGEST")).toBe("OTHER");
  });
});

describe("Phase 1236 — deriveCaptureAllowed", () => {
  it("derives the safe consent label", () => {
    expect(deriveCaptureAllowed([])).toBe("UNKNOWN");
    expect(deriveCaptureAllowed(["CONSENTED", "EXTERNAL_TRACKED"])).toBe(
      "ALLOWED",
    );
    expect(deriveCaptureAllowed(["CONSENTED", "PENDING"])).toBe(
      "NEEDS_CONSENT",
    );
    expect(deriveCaptureAllowed(["CONSENTED", "NOT_CONSENTED"])).toBe(
      "BLOCKED",
    );
    // BLOCKED outranks NEEDS_CONSENT.
    expect(
      deriveCaptureAllowed(["PENDING", "NOT_CONSENTED", "CONSENTED"]),
    ).toBe("BLOCKED");
  });
});

describe("Phase 1236 — summarizeTitle", () => {
  it("bounds long titles and trims whitespace", () => {
    expect(summarizeTitle("  Launch sync  ")).toBe("Launch sync");
    const long = "x".repeat(200);
    const out = summarizeTitle(long);
    expect(out.length).toBe(80);
    expect(out.endsWith("…")).toBe(true);
  });
});
