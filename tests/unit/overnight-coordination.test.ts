// FILE: overnight-coordination.test.ts
// PURPOSE: Pure overnight / quiet-hours planning + morning brief assembly.

import { describe, expect, it } from "vitest";
import {
  assembleMorningBriefProse,
  planOvernightWindow,
} from "../../apps/api/src/services/otzar/overnight-coordination.service.js";
import { DEFAULT_WORKING_POLICY } from "../../apps/api/src/services/work-os/scheduling-policy.service.js";

describe("planOvernightWindow", () => {
  it("refuses daytime without force", () => {
    const p = planOvernightWindow({
      minutes: 10 * 60,
      isoWeekday: 1,
      policy: DEFAULT_WORKING_POLICY,
    });
    expect(p.may_run).toBe(false);
    expect(p.in_quiet).toBe(false);
  });

  it("allows 8:30 PM quiet window with silent AI", () => {
    const p = planOvernightWindow({
      minutes: 20 * 60 + 30,
      isoWeekday: 1,
      policy: DEFAULT_WORKING_POLICY,
    });
    expect(p.in_quiet).toBe(true);
    expect(p.may_run).toBe(true);
    expect(p.may_silent_ai).toBe(true);
    expect(p.suppress_nonessential).toBe(true);
  });

  it("force allows daytime demo run", () => {
    const p = planOvernightWindow({
      minutes: 10 * 60,
      isoWeekday: 1,
      policy: DEFAULT_WORKING_POLICY,
      force: true,
    });
    expect(p.may_run).toBe(true);
  });
});

describe("assembleMorningBriefProse", () => {
  it("builds completed list and none needs-person when clean", () => {
    const m = assembleMorningBriefProse({
      executed_titles: ["Casey security complete"],
      open_titles: [],
      collab_completed: 2,
      recommendation: "Conditional interview",
    });
    expect(m.completed.length).toBeGreaterThan(1);
    expect(m.needs_person[0]).toBe("None");
    expect(m.headline).toMatch(/Conditional/i);
  });
});
