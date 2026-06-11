// FILE: dandelion-growth.test.ts
// PURPOSE: Phase 1237 — pure tests for the Dandelion helpers: calm
//          headline copy and the consent-gated onboarding memory
//          content builder (only user-offered fields enter).

import { describe, expect, it } from "vitest";
import {
  buildOnboardingMemoryContent,
  growthHeadline,
} from "../../apps/api/src/services/otzar/dandelion-growth.service.js";

describe("Phase 1237 — growthHeadline", () => {
  it("celebrates a healthy org and counts findings calmly", () => {
    expect(growthHeadline(0)).toBe(
      "Your organization looks healthy this week. Otzar will keep watching for ways to help it grow.",
    );
    expect(growthHeadline(1)).toBe(
      "Otzar found 1 way to strengthen your organization this week.",
    );
    expect(growthHeadline(3)).toBe(
      "Otzar found 3 ways to strengthen your organization this week.",
    );
  });

  it("never uses developer vocabulary", () => {
    for (const copy of [growthHeadline(0), growthHeadline(4)]) {
      for (const banned of ["payload", "schema", "graph node", "capsule"]) {
        expect(copy).not.toContain(banned);
      }
    }
  });
});

describe("Phase 1237 — buildOnboardingMemoryContent", () => {
  it("includes only the fields the user offered", () => {
    const content = buildOnboardingMemoryContent({
      preferred_name: "Sadeil",
      pronunciation: "sah-DAYL",
    });
    expect(content).toBe(
      "Preferred name: Sadeil\nName pronunciation: sah-DAYL",
    );
  });

  it("includes every offered field in stable order", () => {
    const content = buildOnboardingMemoryContent({
      preferred_name: "Sam",
      pronunciation: "SAM",
      communication_preference: "Short messages, no surprises",
      quiet_preference: "Quiet before 10am",
      remember_text: "I review PRs every Friday",
    });
    expect(content?.split("\n")).toEqual([
      "Preferred name: Sam",
      "Name pronunciation: SAM",
      "Communication preference: Short messages, no surprises",
      "Quiet-mode preference: Quiet before 10am",
      "Asked Otzar to remember: I review PRs every Friday",
    ]);
  });

  it("returns null when nothing meaningful was offered", () => {
    expect(buildOnboardingMemoryContent({})).toBeNull();
    expect(
      buildOnboardingMemoryContent({ preferred_name: "   ", remember_text: "" }),
    ).toBeNull();
  });
});
