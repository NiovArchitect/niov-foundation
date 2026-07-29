// FILE: auto-clarify.test.ts
// PURPOSE: Slice 6 — autonomous routine clarification.

import { describe, expect, it } from "vitest";
import { autoClarifyRoutineAmbiguity } from "../../apps/api/src/services/work-os/auto-clarify.js";

describe("autoClarifyRoutineAmbiguity", () => {
  it("clarifies security circle-back without human interrupt", () => {
    const r = autoClarifyRoutineAmbiguity({
      raw_phrase: "We should circle back with Casey before moving.",
      known_people: ["Casey"],
      project_subject: "HelioGrid application review (fictional)",
      dependency: "security checklist",
    });
    expect(r.clarified).toBe(true);
    expect(r.needs_human).toBe(false);
    expect(r.title).toMatch(/Casey|security/i);
    expect(r.summary).toMatch(/encryption|security|checklist|interview/i);
  });

  it("needs human when no person or project signal", () => {
    const r = autoClarifyRoutineAmbiguity({
      raw_phrase: "We should circle back sometime.",
    });
    expect(r.needs_human).toBe(true);
  });
});
