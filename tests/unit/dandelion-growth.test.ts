// FILE: dandelion-growth.test.ts
// PURPOSE: Phase 1237 — pure tests for the Dandelion helpers: calm
//          headline copy and the consent-gated onboarding memory
//          content builder (only user-offered fields enter).

import { describe, expect, it } from "vitest";
import {
  buildOnboardingMemoryContent,
  growthHeadline,
  needsProjectOrWorkspaceCopy,
} from "../../apps/api/src/services/otzar/dandelion-growth.service.js";

// [PROD-UX-BUGD] The needs-a-first-project copy: states the person's TRUE org
// relationship first, names the ONE missing object, and NEVER uses broad
// connected/disconnected language for an org member.
describe("PROD-UX-BUGD — needsProjectOrWorkspaceCopy", () => {
  it("an org member with a manager is placed on their manager's team", () => {
    const c = needsProjectOrWorkspaceCopy({
      display_name: "Shweta",
      manager_name: "David Odie",
      department: "Marketing",
    });
    expect(c.title).toBe("Shweta needs a first project or workspace");
    expect(c.why).toContain("Shweta is already part of your organization on David Odie's team");
    expect(c.why).toContain("isn't assigned to a project or workspace yet");
  });

  it("with a department but no manager, the department places them", () => {
    const c = needsProjectOrWorkspaceCopy({
      display_name: "Annie",
      manager_name: null,
      department: "Compliance",
    });
    expect(c.why).toContain("Annie is already part of your organization in Compliance");
  });

  it("with neither, they are still 'already part of your organization' — never 'not connected'", () => {
    const c = needsProjectOrWorkspaceCopy({
      display_name: "Walter",
      manager_name: null,
      department: null,
    });
    expect(c.why).toContain("Walter is already part of your organization,");
    for (const text of [c.title, c.why]) {
      expect(text).not.toMatch(/isn't connected|not connected|disconnected/i);
    }
  });

  it("names the missing object precisely and stays in customer vocabulary", () => {
    const c = needsProjectOrWorkspaceCopy({ display_name: "Sam", manager_name: null, department: null });
    expect(c.title).toContain("project or workspace");
    for (const banned of ["entity", "membership", "edge", "hierarchy_level", "CONNECT_TEAMMATE"]) {
      expect(`${c.title} ${c.why}`).not.toContain(banned);
    }
  });
});

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
