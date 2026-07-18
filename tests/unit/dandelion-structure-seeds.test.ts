// FILE: dandelion-structure-seeds.test.ts
// PURPOSE: Phase A — pure plan of structure seeds from org-growth people.
// CONNECTS TO: planStructureSeedsFromGrowth (dandelion-seed.service).

import { describe, expect, it } from "vitest";
import { planStructureSeedsFromGrowth } from "../../apps/api/src/services/otzar/dandelion-seed.service.js";

describe("planStructureSeedsFromGrowth", () => {
  it("maps people without projects to add_project_membership seeds", () => {
    const plan = planStructureSeedsFromGrowth([
      { person_entity_id: "p1", display_name: "David Odie" },
      { person_entity_id: "p2", display_name: "Vishesh Sharma" },
    ]);
    expect(plan).toHaveLength(2);
    expect(plan[0]).toMatchObject({
      seed_type: "add_project_membership",
      subject_entity_id: "p1",
      subject_name: "David Odie",
    });
    expect(plan[0]!.recommended_action).toMatch(/David Odie/);
    expect(plan[0]!.source_evidence.toLowerCase()).toContain("org member");
  });

  it("dedupes by person id and skips empty names", () => {
    const plan = planStructureSeedsFromGrowth([
      { person_entity_id: "p1", display_name: "David" },
      { person_entity_id: "p1", display_name: "David again" },
      { person_entity_id: "p3", display_name: "  " },
      { person_entity_id: "", display_name: "Ghost" },
    ]);
    expect(plan).toHaveLength(1);
    expect(plan[0]!.subject_entity_id).toBe("p1");
  });
});
