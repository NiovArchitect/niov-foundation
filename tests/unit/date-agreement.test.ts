// FILE: date-agreement.test.ts
// PURPOSE: Multi-person date agreement oracle — suggestions must not win;
//          decision-owner supersession beats bare CEO move; unavailable
//          is classified distinctly.

import { describe, expect, it } from "vitest";
import { classifyDateAgreement } from "../../apps/api/src/services/otzar/date-agreement.service.js";
import {
  detectCalendarProposal,
  resolveWeekdayOffset,
  addCivilDays,
  type TemporalContext,
} from "../../apps/api/src/services/otzar/calendar-continuity.service.js";

const TRANSCRIPT = `
Sadeil (CEO / project sponsor): I suggest Tuesday at 2:00 PM.
David (Engineering lead): I'm unavailable Tuesday afternoon.
Priya (Product lead): Wednesday at 10:00 AM works for me.
Sadeil: Wednesday at 10:00 AM works. Let's lock it.
Maya (Project owner): Confirmed — Wednesday 10:00 AM. Please create the calendar.
Sadeil (CEO): Actually move the meeting to Thursday at 11:30 AM.
Maya (Project owner): Acknowledged — final meeting is Thursday at 11:30 AM.
`;

describe("classifyDateAgreement", () => {
  it("does not finalize on first suggestion", () => {
    const r = classifyDateAgreement(TRANSCRIPT);
    expect(r.final_agreed_phrase?.toLowerCase()).not.toContain("tuesday");
    expect(r.candidates.some((c) => c.stance === "SUGGESTED")).toBe(true);
  });

  it("records unavailable distinctly", () => {
    const r = classifyDateAgreement(TRANSCRIPT);
    expect(r.candidates.some((c) => c.stance === "UNAVAILABLE")).toBe(true);
  });

  it("final is decision-owner Thursday supersession", () => {
    const r = classifyDateAgreement(TRANSCRIPT);
    expect(r.final_agreed_phrase?.toLowerCase()).toMatch(/thursday/);
    expect(r.authority_basis).toMatch(/OWNER|DECISION/);
    expect(r.confirmed_by?.toLowerCase()).toContain("maya");
  });

  it("flags executive suggestion vs owner final when they differ", () => {
    // CEO suggests Thursday; if owner had confirmed Wednesday earlier,
    // then owner re-confirms Thursday — conflict flag may be false if
    // they end same. Force a case:
    const t = `
Boss (CEO): Let's do Friday at 9:00 AM.
Owner (Project owner): Confirmed — Monday at 3:00 PM.
`;
    const r = classifyDateAgreement(t);
    expect(r.final_agreed_phrase?.toLowerCase()).toMatch(/monday/);
    expect(r.executive_conflict_with_owner).toBe(true);
  });
});

describe("weekday calendar resolution", () => {
  it("resolveWeekdayOffset next Thursday when today is Thursday → +7", () => {
    // Thursday = 4
    const r = resolveWeekdayOffset("schedule next thursday at 11:30 am", 4);
    expect(r).not.toBeNull();
    expect(r!.daysAhead).toBe(7);
  });

  it("detectCalendarProposal next Thursday is not clarify_past_time", () => {
    // Fixed: Wed 2026-07-15 local America/New_York
    const temporal: TemporalContext = {
      now_ms: Date.parse("2026-07-15T18:00:00.000Z"),
      now_iso: "2026-07-15T18:00:00.000Z",
      timezone: "America/New_York",
      timezone_source: "profile",
      local: { year: 2026, month: 7, day: 15, hour: 14, minute: 0 },
    };
    const d = detectCalendarProposal(
      "Schedule Project Alpha launch brief next Thursday at 11:30 AM Eastern",
      temporal,
    );
    expect(d).not.toBeNull();
    expect(d!.kind).toBe("proposal");
    if (d?.kind === "proposal") {
      // next Thursday from Wed 15 → Thu 16
      expect(d.proposal.resolved_label.toLowerCase()).toMatch(/thu|jul/);
      expect(d.proposal.start_iso).toMatch(/2026-07-1[6]/);
    }
  });

  it("addCivilDays crosses month", () => {
    expect(addCivilDays(2026, 7, 30, 3)).toEqual({
      year: 2026,
      month: 8,
      day: 2,
    });
  });
});
