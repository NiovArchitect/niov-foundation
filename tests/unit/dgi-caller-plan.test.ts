// FILE: dgi-caller-plan.test.ts
// PURPOSE: [DGI WAVE-4] Caller collaboration plan degrades safely when
//          org or twin is missing (no private data, no throw).

import { describe, expect, it } from "vitest";
import { buildCallerCollaborationPlan } from "../../apps/api/src/services/otzar/dgi-caller-plan.service.js";

describe("buildCallerCollaborationPlan", () => {
  it("returns empty plan when org is null (no org bucket)", async () => {
    const plan = await buildCallerCollaborationPlan({
      orgEntityId: null,
      subjectEntityId: "11111111-1111-1111-1111-111111111111",
      twinEntityId: null,
    });
    expect(plan.recommendation_count).toBe(0);
    expect(plan.recommendations).toEqual([]);
    expect(plan.metrics.actor_count).toBe(0);
  });
});
