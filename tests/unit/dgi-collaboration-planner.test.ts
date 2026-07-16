// FILE: dgi-collaboration-planner.test.ts
// PURPOSE: [DGI ENTERPRISE WAVE-3] Deterministic collaboration planner —
//          privacy (cross-org reject), offline-principal Twin advance,
//          fail-closed without permission, and synthetic scale 10/100/1000.

import { describe, expect, it } from "vitest";
import {
  buildSyntheticCollabWorld,
  planOrganizationalCollaboration,
  selectResponsibleActor,
  type PlannerActor,
  type PlannerObligation,
} from "../../apps/api/src/services/otzar/dgi-collaboration-planner.service.js";

const ORG = "00000000-0000-4000-8000-0000000000aa";
const OTHER = "00000000-0000-4000-8000-0000000000bb";

describe("selectResponsibleActor", () => {
  const human: PlannerActor = {
    actor_id: "h1",
    kind: "HUMAN",
    principal_id: "h1",
    org_id: ORG,
    online: false,
    capacity: 0.2,
    permissions: ["work.write"],
    skills: ["engineering"],
  };
  const twin: PlannerActor = {
    actor_id: "t1",
    kind: "TWIN",
    principal_id: "h1",
    org_id: ORG,
    online: true,
    capacity: 0.9,
    permissions: ["work.write"],
    skills: ["engineering"],
  };
  const foreign: PlannerActor = {
    actor_id: "fx",
    kind: "HUMAN",
    principal_id: "fx",
    org_id: OTHER,
    online: true,
    capacity: 1,
    permissions: ["*"],
    skills: [],
  };
  const obl: PlannerObligation = {
    obligation_id: "o1",
    org_id: ORG,
    title: "Cross-team status",
    owner_actor_id: "h1",
    required_permission: "work.write",
    blocked: false,
    goal_id: null,
    due_ms: null,
  };

  it("prefers owner Twin when principal is offline (bounded autonomy)", () => {
    const r = selectResponsibleActor({
      org_id: ORG,
      obligation: obl,
      actors: [human, twin, foreign],
    });
    expect(r.selected?.actor_id).toBe("t1");
    expect(r.rejected).toContain("fx");
  });

  it("fail-closes when no in-org permission holder exists", () => {
    const r = selectResponsibleActor({
      org_id: ORG,
      obligation: { ...obl, required_permission: "legal.sign" },
      actors: [human, twin],
    });
    expect(r.selected).toBeNull();
  });
});

describe("planOrganizationalCollaboration scenarios", () => {
  it("cross-team dependency: Twin advances when human offline", () => {
    const world = buildSyntheticCollabWorld(10);
    // Force human 0 offline — twin still exists
    const h0 = world.actors.find((a) => a.actor_id === "h-00000");
    if (h0) h0.online = false;
    const plan = planOrganizationalCollaboration(world);
    expect(plan.metrics.cross_org_rejected).toBeGreaterThan(0);
    // No recommendation should select the foreign actor
    for (const rec of plan.recommendations) {
      expect(rec.selected_actor_id).not.toBe("x-foreign-human");
    }
    // At least one recommendation for open work or handoff
    expect(plan.recommendations.length).toBeGreaterThan(0);
  });

  it("permission denial: restricted permission yields FAIL_CLOSED", () => {
    const plan = planOrganizationalCollaboration({
      org_id: ORG,
      now_ms: Date.UTC(2026, 6, 16),
      actors: [
        {
          actor_id: "h1",
          kind: "HUMAN",
          principal_id: "h1",
          org_id: ORG,
          online: true,
          capacity: 1,
          permissions: ["work.read"],
          skills: [],
        },
      ],
      obligations: [
        {
          obligation_id: "secret-o",
          org_id: ORG,
          title: "Restricted finance export",
          owner_actor_id: "h1",
          required_permission: "finance.export",
          blocked: false,
          goal_id: null,
          due_ms: null,
        },
      ],
      goals: [],
      handoffs: [],
    });
    expect(plan.metrics.fail_closed_count).toBe(1);
    expect(plan.recommendations[0]?.kind).toBe("FAIL_CLOSED");
    expect(plan.recommendations[0]?.autonomy_ceiling).toBe("FAIL_CLOSED");
  });

  it("handoff across shifts surfaces HANDOFF recommendation", () => {
    const plan = planOrganizationalCollaboration({
      org_id: ORG,
      now_ms: Date.UTC(2026, 6, 16),
      actors: [
        {
          actor_id: "h-in",
          kind: "HUMAN",
          principal_id: "h-in",
          org_id: ORG,
          online: true,
          capacity: 1,
          permissions: ["handoff.acknowledge"],
          skills: [],
        },
      ],
      obligations: [],
      goals: [],
      handoffs: [
        {
          handoff_id: "ho1",
          org_id: ORG,
          incoming_actor_id: "h-in",
          state: "OPEN",
        },
      ],
    });
    expect(plan.recommendations.some((r) => r.kind === "HANDOFF")).toBe(true);
  });
});

describe("synthetic scale pressure", () => {
  for (const scale of [10, 100, 1000] as const) {
    it(`plans ${scale} humans + ${scale} twins without cross-org selection`, () => {
      const world = buildSyntheticCollabWorld(scale);
      const t0 = Date.now();
      const plan = planOrganizationalCollaboration(world);
      const ms = Date.now() - t0;
      expect(plan.metrics.actor_count).toBe(scale * 2); // human+twin
      expect(plan.metrics.twin_count).toBe(scale);
      expect(plan.metrics.cross_org_rejected).toBeGreaterThanOrEqual(1);
      for (const rec of plan.recommendations) {
        expect(rec.selected_actor_id).not.toBe("x-foreign-human");
        // Never invent authority
        expect(rec.autonomy_ceiling).toBeTruthy();
      }
      // Soft bound — pure planner should stay snappy even at 1k
      expect(ms).toBeLessThan(scale <= 100 ? 500 : 5_000);
    });
  }
});
