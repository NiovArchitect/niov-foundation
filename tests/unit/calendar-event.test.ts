// FILE: calendar-event.test.ts (unit)
// PURPOSE: Phase 1272 locks for the GATED calendar event lifecycle.
//          Proves event creation NEVER auto-runs:
//            1. the gate ladder blocks in priority order (selected time
//               → participants → participant confirmation → approval →
//               caller confirmation → connection → event-write scope)
//            2. createCalendarEvent blocks with EVENT_WRITE_SCOPE_MISSING
//               when the granted token has no event-write scope (today's
//               reality), and audits the DENIED attempt
//            3. even when every gate passes, it does NOT fabricate a
//               creation (returns CALENDAR_PROVIDER_UNAVAILABLE) — no
//               provider call, no fake "CREATED"
//            4. audit details carry a scrubbed gate code + counts only,
//               never attendee identities or titles
//          getProviderGrantedScopes + writeAuditEvent are mocked.
// CONNECTS TO:
//   - apps/api/src/services/connector/calendar-event.service.ts
//   - apps/api/src/services/connector/connector-oauth.service.ts

import { beforeEach, describe, expect, it, vi } from "vitest";

const { grantedScopesMock, writeAuditEventMock, tokenMock } = vi.hoisted(() => ({
  grantedScopesMock: vi.fn(),
  writeAuditEventMock: vi
    .fn()
    .mockResolvedValue({ audit_id: "00000000-0000-0000-0000-000000000000" }),
  tokenMock: vi.fn(),
}));

vi.mock("@niov/database", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, writeAuditEvent: writeAuditEventMock };
});

vi.mock(
  "../../apps/api/src/services/connector/connector-oauth.service.js",
  () => ({
    getProviderGrantedScopes: grantedScopesMock,
    getProviderAccessTokenForOrg: tokenMock,
  }),
);

import {
  firstUnmetGate,
  createCalendarEvent,
  deleteCalendarEvent,
  type CalendarEventProposalInput,
} from "../../apps/api/src/services/connector/calendar-event.service.js";

const SLOT = { start: "2026-06-14T16:00:00Z", end: "2026-06-14T16:30:00Z" };

// A fully-satisfied human-side proposal (time + resolved participant +
// confirmations + approval + caller confirmation).
function readyProposal(): CalendarEventProposalInput {
  return {
    title: "Sync",
    participants: [{ label: "Vishesh", resolved: true }],
    selected_time: SLOT,
    participant_confirmations_satisfied: true,
    requires_approval: false,
    approved: false,
    caller_confirmed: true,
  };
}

beforeEach(() => {
  grantedScopesMock.mockReset();
  writeAuditEventMock.mockClear();
});

describe("firstUnmetGate (pure ladder)", () => {
  it("blocks on missing selected time first", () => {
    const p = { ...readyProposal(), selected_time: null };
    expect(firstUnmetGate(p, true, true)).toBe("NEEDS_SELECTED_TIME");
  });

  it("blocks on unresolved participants", () => {
    const p = {
      ...readyProposal(),
      participants: [{ label: "Vishesh", resolved: false }],
    };
    expect(firstUnmetGate(p, true, true)).toBe("PARTICIPANT_UNRESOLVED");
  });

  it("blocks on unsatisfied participant confirmation", () => {
    const p = { ...readyProposal(), participant_confirmations_satisfied: false };
    expect(firstUnmetGate(p, true, true)).toBe("NEEDS_PARTICIPANT_CONFIRMATION");
  });

  it("blocks on required-but-missing approval", () => {
    const p = { ...readyProposal(), requires_approval: true, approved: false };
    expect(firstUnmetGate(p, true, true)).toBe("NEEDS_APPROVAL");
  });

  it("blocks on missing caller confirmation", () => {
    const p = { ...readyProposal(), caller_confirmed: false };
    expect(firstUnmetGate(p, true, true)).toBe("NEEDS_CALLER_CONFIRMATION");
  });

  it("blocks on policy before anything else", () => {
    const p = { ...readyProposal(), policy_blocked: true };
    expect(firstUnmetGate(p, true, true)).toBe("POLICY_BLOCKED");
  });

  it("reaches the scope gate only after human gates pass", () => {
    // not connected → reconnect; connected but no event-write → scope.
    expect(firstUnmetGate(readyProposal(), false, false)).toBe(
      "GOOGLE_RECONNECT_REQUIRED",
    );
    expect(firstUnmetGate(readyProposal(), false, true)).toBe(
      "EVENT_WRITE_SCOPE_MISSING",
    );
  });

  it("returns null (READY) only when every gate is satisfied", () => {
    expect(firstUnmetGate(readyProposal(), true, true)).toBeNull();
  });
});

describe("createCalendarEvent (hard enforcement, never auto-creates)", () => {
  it("blocks with EVENT_WRITE_SCOPE_MISSING when the token lacks event-write (today's reality)", async () => {
    // Connected with only read scopes — exactly the live Phase 1271 grant.
    grantedScopesMock.mockResolvedValue([
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/calendar.freebusy",
    ]);
    const r = await createCalendarEvent({
      actor_entity_id: "actor-1",
      org_entity_id: "org-1",
      input: readyProposal(),
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected blocked");
    expect(r.code).toBe("EVENT_WRITE_SCOPE_MISSING");
    const audit = writeAuditEventMock.mock.calls[0]![0];
    expect(audit.event_type).toBe("CALENDAR_EVENT_CREATE");
    expect(audit.outcome).toBe("DENIED");
    expect(audit.details.reason).toBe("EVENT_WRITE_SCOPE_MISSING");
    // SAFE details only — no attendee identities or titles.
    const s = JSON.stringify(audit);
    expect(s).not.toContain("Vishesh");
    expect(s).not.toContain("Sync");
  });

  it("blocks with GOOGLE_RECONNECT_REQUIRED when not connected", async () => {
    grantedScopesMock.mockResolvedValue(null);
    const r = await createCalendarEvent({
      actor_entity_id: "actor-1",
      org_entity_id: "org-1",
      input: readyProposal(),
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected blocked");
    expect(r.code).toBe("GOOGLE_RECONNECT_REQUIRED");
  });

  it("[CALENDAR-WRITE] creates the real event ONLY with event-write scope + every gate passed", async () => {
    grantedScopesMock.mockResolvedValue([
      "https://www.googleapis.com/auth/calendar.events",
    ]);
    tokenMock.mockResolvedValue({ ok: true, access_token: "tok-abc" });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ id: "evt-1", htmlLink: "https://calendar.google.com/e/evt-1", start: { dateTime: SLOT.start }, end: { dateTime: SLOT.end } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await createCalendarEvent({
      actor_entity_id: "actor-1", org_entity_id: "org-1", input: readyProposal(),
    });
    vi.unstubAllGlobals();
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected created");
    expect(r.event_id).toBe("evt-1");
    expect(r.calendar_id).toBe("primary");
    expect(r.html_link).toBe("https://calendar.google.com/e/evt-1");
    // The provider was actually called (not fabricated).
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Audit is SUCCESS + scrubbed (no title/attendee).
    const audit = writeAuditEventMock.mock.calls.at(-1)?.[0] as { outcome: string; details: Record<string, unknown> };
    expect(audit.outcome).toBe("SUCCESS");
    expect(JSON.stringify(audit.details)).not.toContain("tok-abc");
  });

  it("[CALENDAR-WRITE] a provider 403 on create → EVENT_WRITE_SCOPE_MISSING (never fake CREATED)", async () => {
    grantedScopesMock.mockResolvedValue(["https://www.googleapis.com/auth/calendar.events"]);
    tokenMock.mockResolvedValue({ ok: true, access_token: "tok-abc" });
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    const r = await createCalendarEvent({ actor_entity_id: "a", org_entity_id: "o", input: readyProposal() });
    vi.unstubAllGlobals();
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected blocked");
    expect(r.code).toBe("EVENT_WRITE_SCOPE_MISSING");
  });

  it("[CALENDAR-WRITE] delete is idempotent (204 deleted AND 404 already-gone both succeed)", async () => {
    tokenMock.mockResolvedValue({ ok: true, access_token: "tok-abc" });
    for (const status of [204, 404, 410]) {
      const fetchMock = vi.fn().mockResolvedValue({ ok: status === 204, status, json: async () => ({}) });
      vi.stubGlobal("fetch", fetchMock);
      const r = await deleteCalendarEvent({ actor_entity_id: "a", org_entity_id: "o", event_id: "evt-1" });
      vi.unstubAllGlobals();
      expect(r.ok, `status ${status}`).toBe(true);
    }
  });

  it("[CALENDAR-WRITE] delete without event-write scope → EVENT_WRITE_SCOPE_MISSING", async () => {
    tokenMock.mockResolvedValue({ ok: true, access_token: "tok-abc" });
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    const r = await deleteCalendarEvent({ actor_entity_id: "a", org_entity_id: "o", event_id: "evt-1" });
    vi.unstubAllGlobals();
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected blocked");
    expect(r.code).toBe("EVENT_WRITE_SCOPE_MISSING");
  });

  it("blocks a free/busy-only proposal (no selected time) before any scope check", async () => {
    grantedScopesMock.mockResolvedValue([
      "https://www.googleapis.com/auth/calendar.events",
    ]);
    const r = await createCalendarEvent({
      actor_entity_id: "actor-1",
      org_entity_id: "org-1",
      input: { ...readyProposal(), selected_time: null },
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected blocked");
    expect(r.code).toBe("NEEDS_SELECTED_TIME");
  });
});
