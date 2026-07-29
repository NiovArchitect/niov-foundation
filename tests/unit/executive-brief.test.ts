// FILE: executive-brief.test.ts
// PURPOSE: Unit tests for Daily executive brief pure assembly.
// CONNECTS TO: executive-brief.service assembleExecutiveBriefContent.

import { describe, expect, it } from "vitest";
import { assembleExecutiveBriefContent } from "../../apps/api/src/services/otzar/executive-brief.service.js";

describe("assembleExecutiveBriefContent", () => {
  it("grounds outcome and risk from open work titles", () => {
    const brief = assembleExecutiveBriefContent({
      open_active_work_titles: [
        "Casey: complete remaining security controls",
        "Ava: send interview invite after security green",
      ],
      open_obligation_titles: [],
      open_incoming_handoff_titles: [],
      collab_outbound_count: 2,
      collab_completed_titles: ["Security evidence package shared"],
      recommendation_hint: "Conditional interview for HelioGrid",
    });
    expect(brief.current_outcome).toMatch(/Conditional interview|Casey/);
    expect(brief.material_risk.toLowerCase()).toMatch(/security|gate|risk|blocker/);
    expect(brief.human_decision.toLowerCase()).toMatch(/interview|invite|decision/);
    expect(brief.work_otzar_handled).toMatch(/Security evidence|collaboration/);
    expect(brief.sources).toContain("work_ledger_active");
    expect(brief.relevant_proof.length).toBeGreaterThan(0);
  });

  it("handles empty work without hard-coded static narrative", () => {
    const brief = assembleExecutiveBriefContent({
      open_active_work_titles: [],
      open_obligation_titles: [],
      open_incoming_handoff_titles: [],
      collab_outbound_count: 0,
      collab_completed_titles: [],
      recommendation_hint: null,
    });
    expect(brief.current_outcome).toMatch(/No current recommendation|No open/);
    expect(brief.sources).toEqual(
      expect.arrayContaining([
        "work_ledger_active",
        "dgi_coherence",
        "collaboration_requests_outbound",
      ]),
    );
  });
});
