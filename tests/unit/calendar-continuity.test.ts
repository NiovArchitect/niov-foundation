// FILE: calendar-continuity.test.ts (unit)
// PURPOSE: [OTZAR-CONTINUITY P0/P1] Lock the deterministic, LLM-free engine:
//          time-phrase parsing (incl. "at one o'clock"), confirmation
//          classification, server-side date resolution + DST correctness +
//          temporal sanity (never a past year / January 2025), and the
//          pre-fix reproduction: the OLD proposal extractor forms NO calendar
//          proposal for the reported message (the proven loss point).
// CONNECTS TO: apps/api/src/services/otzar/calendar-continuity.service.ts
//              apps/api/src/services/otzar/proposed-action-extractor.ts

import { describe, expect, it } from "vitest";
import {
  parseTimePhrase,
  classifyConfirmation,
  detectCalendarProposal,
  resolveTemporalContext,
  temporalPromptLine,
  parseOrdinalSelection,
  parseTimeRevision,
  type TemporalContext,
} from "../../apps/api/src/services/otzar/calendar-continuity.service.js";
import { extractProposedAction } from "../../apps/api/src/services/otzar/proposed-action-extractor.js";

async function temporalAt(nowMs: number, tz = "America/New_York"): Promise<TemporalContext> {
  return resolveTemporalContext({ actor_entity_id: "x", client_timezone: tz, now_ms: nowMs });
}

describe("parseTimePhrase", () => {
  it('"at one o\'clock" → 13:00 (documented PM default)', () => {
    expect(parseTimePhrase("at one o'clock")).toMatchObject({ hour24: 13, minute: 0, meridiem_explicit: false });
  });
  it('"1 pm" → 13:00 explicit', () => {
    expect(parseTimePhrase("at 1 pm")).toMatchObject({ hour24: 13, minute: 0, meridiem_explicit: true });
  });
  it('"1:30pm" → 13:30', () => {
    expect(parseTimePhrase("meet at 1:30pm")).toMatchObject({ hour24: 13, minute: 30 });
  });
  it('"at 9 am" → 09:00', () => {
    expect(parseTimePhrase("at 9 am")).toMatchObject({ hour24: 9, meridiem_explicit: true });
  });
  it('"noon" → 12:00', () => {
    expect(parseTimePhrase("at noon")).toMatchObject({ hour24: 12 });
  });
  it('bare "at 8" (7–11) → AM default', () => {
    expect(parseTimePhrase("at 8")).toMatchObject({ hour24: 8, meridiem_explicit: false });
  });
  it("no time → null", () => {
    expect(parseTimePhrase("put something on my calendar")).toBeNull();
  });
  it('"tomorrow" hint captured', () => {
    expect(parseTimePhrase("tomorrow at 3pm")).toMatchObject({ day_hint: "tomorrow", hour24: 15 });
  });
});

describe("classifyConfirmation", () => {
  it.each(["yes", "Yes", "yep", "sure", "do it", "go ahead", "confirm", "add it", "sounds good"])(
    '"%s" → confirm', (s) => expect(classifyConfirmation(s)).toBe("confirm"),
  );
  it.each(["no", "cancel", "nope", "not now", "never mind", "don't"])(
    '"%s" → reject', (s) => expect(classifyConfirmation(s)).toBe("reject"),
  );
  it.each(["the second one", "make it 2pm", "what did we decide?", "tell David"])(
    '"%s" → none (not a bare confirmation)', (s) => expect(classifyConfirmation(s)).toBe("none"),
  );
});

describe("detectCalendarProposal — server-side date resolution", () => {
  const OLIVIA = "Put on my calendar that at one o'clock I'll be at Olivia's event.";

  // Narrow the CalendarDetection union to the confirmable proposal draft.
  const asProposal = (d: ReturnType<typeof detectCalendarProposal>) => {
    if (d?.kind !== "proposal") throw new Error(`expected proposal, got ${JSON.stringify(d)}`);
    return d.proposal;
  };

  it("resolves to the CURRENT year at 1 PM local — never January 2025", async () => {
    // 2026-07-10 15:00Z = 11:00 EDT → 1 PM today is future → today 17:00Z.
    const t = await temporalAt(Date.UTC(2026, 6, 10, 15, 0, 0));
    const p = asProposal(detectCalendarProposal(OLIVIA, t));
    expect(p.start_iso).toBe("2026-07-10T17:00:00.000Z");
    expect(new Date(p.start_iso).getUTCFullYear()).toBe(2026);
    // Clean title — leading filler ("be at") stripped.
    expect(p.title).toBe("Olivia's Event");
  });

  it("title extraction strips leading fillers/prepositions", async () => {
    const t = await temporalAt(Date.UTC(2026, 6, 10, 15, 0, 0));
    expect(asProposal(detectCalendarProposal("schedule the budget review at 3pm", t)).title).toBe("Budget Review");
    expect(asProposal(detectCalendarProposal("put a dentist appointment on my calendar at 2pm", t)).title).toBe("Dentist Appointment");
  });

  it("DST-correct: same wall-clock 1 PM resolves to a DIFFERENT UTC offset in winter (EST) vs summer (EDT)", async () => {
    const summer = await temporalAt(Date.UTC(2026, 6, 10, 15, 0, 0)); // EDT (-4)
    const winter = await temporalAt(Date.UTC(2026, 0, 10, 15, 0, 0)); // EST (-5)
    const ps = asProposal(detectCalendarProposal(OLIVIA, summer));
    const pw = asProposal(detectCalendarProposal(OLIVIA, winter));
    expect(ps.start_iso).toBe("2026-07-10T17:00:00.000Z"); // 13:00 EDT
    expect(pw.start_iso).toBe("2026-01-10T18:00:00.000Z"); // 13:00 EST
  });

  it("past time today → truthful clarification (Correction #2), persists nothing, never silently tomorrow", async () => {
    // 2026-07-10 20:00Z = 16:00 EDT → 1 PM already passed → ask, don't guess tomorrow.
    const t = await temporalAt(Date.UTC(2026, 6, 10, 20, 0, 0));
    const d = detectCalendarProposal(OLIVIA, t);
    expect(d?.kind).toBe("clarify_past_time");
    if (d?.kind !== "clarify_past_time") throw new Error("expected clarify_past_time");
    expect(d.time_label).toMatch(/1(:00)?\s*PM/i);
    expect(d.timezone).toBe("America/New_York");
  });

  it("respects the traveling user's live timezone (client tz overrides)", async () => {
    const la = await temporalAt(Date.UTC(2026, 6, 10, 15, 0, 0), "America/Los_Angeles"); // 08:00 PDT
    expect(la.timezone_source).toBe("client");
    const p = asProposal(detectCalendarProposal(OLIVIA, la));
    // 1 PM PDT (-7) today = 20:00Z
    expect(p.start_iso).toBe("2026-07-10T20:00:00.000Z");
  });

  it("non-calendar message → null (no false proposal)", async () => {
    const t = await temporalAt(Date.UTC(2026, 6, 10, 15, 0, 0));
    expect(detectCalendarProposal("how are you today?", t)).toBeNull();
    expect(detectCalendarProposal("what did Olivia say?", t)).toBeNull();
  });

  it("temporalPromptLine states the real grounded date (not a guess)", async () => {
    const t = await temporalAt(Date.UTC(2026, 6, 10, 15, 0, 0));
    const line = temporalPromptLine(t);
    expect(line).toMatch(/2026/);
    expect(line).toMatch(/America\/New_York/);
    expect(line).toMatch(/do not guess or invent a date/i);
  });
});

describe("P4 — ordinal selection (disambiguation resolution)", () => {
  it("maps ordinal words/numbers to a 0-based index in the ASC-ordered list", () => {
    expect(parseOrdinalSelection("the first one", 3)).toBe(0);
    expect(parseOrdinalSelection("second", 3)).toBe(1);
    expect(parseOrdinalSelection("the last one", 3)).toBe(2);
    expect(parseOrdinalSelection("number 2", 3)).toBe(1);
    expect(parseOrdinalSelection("option 3", 3)).toBe(2);
    expect(parseOrdinalSelection("2", 3)).toBe(1);
  });
  it("out-of-range and non-ordinal → null (never a wrong pick)", () => {
    expect(parseOrdinalSelection("the fourth one", 3)).toBeNull();
    expect(parseOrdinalSelection("yes please", 3)).toBeNull();
    expect(parseOrdinalSelection("how are you", 3)).toBeNull();
  });
});

describe("P4 — time revision (supersession) parsing", () => {
  it("recognizes a bare time-change against a pending proposal", () => {
    expect(parseTimeRevision("make it 2pm")).toMatchObject({ hour24: 14, minute: 0 });
    expect(parseTimeRevision("change it to 3:30pm")).toMatchObject({ hour24: 15, minute: 30 });
    expect(parseTimeRevision("no, 2pm")).toMatchObject({ hour24: 14, minute: 0 });
    expect(parseTimeRevision("2pm instead")).toMatchObject({ hour24: 14, minute: 0 });
  });
  it("does NOT fire on a fresh calendar request or plain chat (no revision cue)", () => {
    expect(parseTimeRevision("schedule a meeting at 2pm")).toBeNull();
    expect(parseTimeRevision("what's on my calendar")).toBeNull();
    expect(parseTimeRevision("make it happen")).toBeNull(); // cue but no time
  });
});

describe("PRE-FIX reproduction (the proven loss point)", () => {
  it("the OLD proposal extractor forms NO calendar proposal for the reported message", () => {
    // The pre-fix chat path only ran extractProposedAction, which recognizes
    // ONLY internal-message sends — so a calendar request never became a
    // structured, persistable proposal, and a later bare 'yes' had nothing on
    // the server to resolve against. This asserts that loss point directly.
    const result = extractProposedAction(
      "Put on my calendar that at one o'clock I'll be at Olivia's event.",
      [],
    );
    expect(result).toBeNull();
  });
});
