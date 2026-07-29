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

  it("does not rewrite ordinary checklist titles as security gates", () => {
    const r = autoClarifyRoutineAmbiguity({
      raw_phrase: "Phoenix launch checklist",
    });
    // No person + no security signal → not auto-rewritten as security gate
    expect(r.title).not.toMatch(/security lead|interview invite/i);
  });

  it("needs human when no person or project signal", () => {
    const r = autoClarifyRoutineAmbiguity({
      raw_phrase: "We should circle back sometime.",
    });
    expect(r.needs_human).toBe(true);
  });
});
