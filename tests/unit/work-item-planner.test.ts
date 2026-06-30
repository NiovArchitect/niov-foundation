// FILE: work-item-planner.test.ts (unit, no DB)
// PURPOSE: Prove commitments become per-OWNER work items ONLY under proof, the
//          founder's actual bar: a proven owner (responsibility-graph owner +
//          single roster match) gets an owned PROPOSED item; an unproven or
//          ambiguous owner becomes UNOWNED + NEEDS_OWNER (review, never auto-
//          assigned — the Shweta/Shiney leak class for work); support/advisor
//          roles (Vishesh) become support edges, not owned tasks; a person with
//          no committed work (Samiksha as availability/support) is NOT over-tasked.
// CONNECTS TO: services/otzar/work-item-planner.ts, responsibility-graph.ts.

import { describe, expect, it } from "vitest";
import { planWorkItems } from "@niov/api";
import type { ResponsibilityGraph, ResponsibilityNode, NameResolution, ResolveName } from "@niov/api";

function node(name: string, role: ResponsibilityNode["role"], workItem: string | null): ResponsibilityNode {
  return { name, role, workItem, evidence: `${name}: ${workItem ?? "..."}`, confidence: "high" };
}
function graph(nodes: ResponsibilityNode[]): ResponsibilityGraph {
  return { lead: null, founderAuthority: null, nodes };
}
// A roster resolver wired to the now-provisioned demo team.
const ROSTER: Record<string, string> = {
  david: "e-david",
  pratham: "e-pratham",
  shiney: "e-shiney",
  annie: "e-annie",
  vishesh: "e-vishesh",
  samiksha: "e-samiksha",
};
const resolve: ResolveName = (name): NameResolution => {
  const id = ROSTER[name.toLowerCase()];
  return id ? { entityId: id, ambiguous: false, alternatives: [] } : { entityId: null, ambiguous: false, alternatives: [] };
};

describe("commitments → per-owner work items, governed by proof", () => {
  it("a proven owner gets an owned PROPOSED work item with source evidence", () => {
    const r = planWorkItems(graph([node("David", "owner", "grant Pratham write access to the WebA repo")]), resolve);
    expect(r.workItems).toHaveLength(1);
    const w = r.workItems[0]!;
    expect(w.ownerEntityId).toBe("e-david");
    expect(w.status).toBe("PROPOSED");
    expect(w.needsReview).toBe(false);
    expect(w.proofPath).toBe("responsibility_graph_owner");
    expect(w.title.toLowerCase()).toContain("write access");
    expect(w.sourceEvidence.quote.length).toBeGreaterThan(0);
  });

  it("Pratham + Shiney owners resolve to owned items (provisioned roster)", () => {
    const r = planWorkItems(
      graph([
        node("Pratham", "owner", "connect Google sign-in to the WebA app"),
        node("Shiney", "owner", "implement proactive agent tool access for the demo"),
      ]),
      resolve,
    );
    const owners = r.workItems.map((w) => w.ownerEntityId).sort();
    expect(owners).toEqual(["e-pratham", "e-shiney"]);
    expect(r.workItems.every((w) => w.status === "PROPOSED" && !w.needsReview)).toBe(true);
  });

  it("an UNPROVEN owner (not on the roster) becomes NEEDS_OWNER, never auto-assigned", () => {
    const r = planWorkItems(graph([node("Mallory", "owner", "ship the billing rewrite")]), resolve);
    expect(r.workItems).toHaveLength(1);
    const w = r.workItems[0]!;
    expect(w.ownerEntityId).toBeNull();
    expect(w.status).toBe("NEEDS_OWNER");
    expect(w.needsReview).toBe(true);
    expect(w.proofPath).toBe("unproven_owner");
    expect(w.reviewReason).toMatch(/not a confirmed member/i);
    expect(r.needsReviewCount).toBe(1);
  });

  it("an AMBIGUOUS owner is held for clarification, not assigned", () => {
    const ambiguous: ResolveName = () => ({ entityId: null, ambiguous: true, alternatives: ["Shiney", "Shweta"] });
    const r = planWorkItems(graph([node("Shi", "owner", "own the integration")]), ambiguous);
    const w = r.workItems[0]!;
    expect(w.ownerEntityId).toBeNull();
    expect(w.needsReview).toBe(true);
    expect(w.reviewReason).toMatch(/more than one/i);
    expect(w.reviewReason).toContain("Shweta");
  });

  it("Vishesh (support/advisor) becomes a support edge, NOT an owned task", () => {
    const r = planWorkItems(
      graph([
        node("Pratham", "owner", "coordinate the UI/UX work"),
        node("Vishesh", "optional_advisor", "advise on UI/UX direction"),
      ]),
      resolve,
    );
    // Only Pratham owns work.
    expect(r.workItems.map((w) => w.ownerName)).toEqual(["Pratham"]);
    // Vishesh is a support edge.
    expect(r.supportEdges).toHaveLength(1);
    expect(r.supportEdges[0]!.name).toBe("Vishesh");
    expect(r.supportEdges[0]!.relation).toBe("advisor");
    expect(r.supportEdges[0]!.entityId).toBe("e-vishesh");
  });

  it("Samiksha (support/availability only) is NOT over-tasked — no owned item", () => {
    const r = planWorkItems(
      graph([
        node("David", "owner", "send Annie the ticket links"),
        node("Samiksha", "support", "available to help if needed"),
      ]),
      resolve,
    );
    const owners = r.workItems.map((w) => w.ownerName);
    expect(owners).toContain("David");
    expect(owners).not.toContain("Samiksha");
    expect(r.supportEdges.some((e) => e.name === "Samiksha")).toBe(true);
  });

  it("the meeting lead is NOT auto-given an IC task", () => {
    const r = planWorkItems(graph([node("David", "meeting_lead", "run the launch review")]), resolve);
    expect(r.workItems).toHaveLength(0);
    expect(r.supportEdges).toHaveLength(0);
  });
});
