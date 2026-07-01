// FILE: work-graph-memory.test.ts (unit, no DB)
// PURPOSE: Phase 6 — a processed ingest produces governed Work-Graph/memory events
//          + Dandelion org-seeding suggestions, sourced ONLY from trusted work,
//          evidence-backed, scoped, approval-gated, no auto-invite, no leak. An
//          unproven owner never becomes a trusted edge; a connector gap becomes a
//          setup seed; support roles never become owners.
// CONNECTS TO: services/otzar/work-graph-memory.ts.

import { describe, expect, it } from "vitest";
import { buildWorkGraphMemory } from "@niov/api";
import type { BuildWorkGraphMemoryInput, WorkGraphWorkItem } from "@niov/api";

const NOW = "2026-06-30T20:00:00.000Z";
const VIEWERS = ["e-org", "e-david", "e-pratham"];

function item(over: Partial<WorkGraphWorkItem>): WorkGraphWorkItem {
  return {
    ownerName: "David",
    ownerEntityId: "e-david",
    title: "grant write access to the WebA repo",
    needsReview: false,
    confidence: "high",
    sourceEvidence: "David owns the repo access work",
    executionType: "repo_access",
    requiredConnector: "GITHUB",
    capabilityState: null,
    ...over,
  };
}
function build(over: Partial<BuildWorkGraphMemoryInput> = {}) {
  return buildWorkGraphMemory({
    sourceConversationId: "conv-1",
    nowIso: NOW,
    allowedViewers: VIEWERS,
    decisions: [],
    workItems: [],
    supportEdges: [],
    ...over,
  });
}

describe("Phase 6 — governed work-graph/memory events + Dandelion seeds", () => {
  it("always emits a conversation_processed event; empty ingest seeds nothing", () => {
    const r = build();
    expect(r.events.some((e) => e.eventType === "conversation_processed")).toBe(true);
    expect(r.seeds).toHaveLength(0);
  });

  it("every event/seed carries source evidence, conversation id, scope, sensitivity, policy + viewers (no global leak)", () => {
    const r = build({ workItems: [item({})], decisions: ["Ship the MVP"] });
    for (const e of [...r.events]) {
      expect(e.sourceConversationId).toBe("conv-1");
      expect(e.sourceEvidence.length).toBeGreaterThan(0);
      expect(e.timestamp).toBe(NOW);
      expect(["individual", "team", "project", "org", "policy", "correction"]).toContain(e.scope);
      expect(e.allowedViewers).toEqual(VIEWERS); // scoped, never global
    }
  });

  it("a proven owner becomes commitment + owner + execution-plan events (no identity seed)", () => {
    const r = build({ workItems: [item({})] });
    expect(r.events.some((e) => e.eventType === "commitment" && e.subjectEntityId === "e-david")).toBe(true);
    expect(r.events.some((e) => e.eventType === "owner_relationship" && e.subjectEntityId === "e-david")).toBe(true);
    expect(r.seeds.some((s) => s.seedType === "confirm_or_activate_person")).toBe(false);
  });

  it("an UNPROVEN owner becomes an identity/activation seed, NOT a trusted ownership edge", () => {
    const r = build({ workItems: [item({ ownerName: "Mallory", ownerEntityId: null, needsReview: true })] });
    expect(r.events.some((e) => e.eventType === "owner_relationship")).toBe(false); // no trusted edge
    const seed = r.seeds.find((s) => s.seedType === "confirm_or_activate_person");
    expect(seed).toBeDefined();
    expect(seed!.subjectEntityId).toBeNull();
    expect(seed!.approvalRequired).toBe(true);
    expect(seed!.policyStatus).toBe("needs_review");
  });

  it("a connector capability gap becomes a tool-gap event + a connector-setup seed (approval-gated for admin grant)", () => {
    const r = build({ workItems: [item({ capabilityState: "not_connected" })] });
    expect(r.events.some((e) => e.eventType === "tool_capability_gap")).toBe(true);
    const seed = r.seeds.find((s) => s.seedType === "grant_tool_access" || s.seedType === "connector_setup");
    expect(seed).toBeDefined();
    expect(seed!.approvalRequired).toBe(true); // admin must connect/authorize
    expect(seed!.recommendedAction).toMatch(/github/i);
  });

  it("a support edge becomes a support relationship + confirm-support seed (never an owner)", () => {
    const r = build({ supportEdges: [{ name: "Vishesh", entityId: "e-vishesh", relation: "advisor", workItem: "UI/UX", evidence: "Vishesh advises on UI" }] });
    expect(r.events.some((e) => e.eventType === "support_relationship" && e.subjectName === "Vishesh")).toBe(true);
    expect(r.events.some((e) => e.eventType === "owner_relationship")).toBe(false);
    expect(r.seeds.some((s) => s.seedType === "confirm_support_role" && s.subjectName === "Vishesh")).toBe(true);
  });

  it("no Dandelion seed is created without evidence (every seed has a source quote)", () => {
    const r = build({ workItems: [item({ ownerEntityId: null, needsReview: true }), item({ capabilityState: "connector_missing" })] });
    expect(r.seeds.length).toBeGreaterThan(0);
    for (const s of r.seeds) expect(s.sourceEvidence.length).toBeGreaterThan(0);
  });
});

describe("P0D — identity-activation seeds cluster by person, skip phantom owners", () => {
  it("five NEEDS_OWNER items for the same 'David' produce ONE confirm_or_activate_person seed", () => {
    const r = build({
      workItems: [
        item({ ownerName: "David", ownerEntityId: null, needsReview: true, title: "task 1" }),
        item({ ownerName: "David", ownerEntityId: null, needsReview: true, title: "task 2" }),
        item({ ownerName: "david", ownerEntityId: null, needsReview: true, title: "task 3" }),
        item({ ownerName: "David", ownerEntityId: null, needsReview: true, title: "task 4" }),
        item({ ownerName: "David", ownerEntityId: null, needsReview: true, title: "task 5" }),
      ],
    });
    const personSeeds = r.seeds.filter((s) => s.seedType === "confirm_or_activate_person" && s.subjectName === "David");
    expect(personSeeds).toHaveLength(1);
  });

  it("two distinct missing people each get their own seed (no over-merge)", () => {
    const r = build({
      workItems: [
        item({ ownerName: "David", ownerEntityId: null, needsReview: true }),
        item({ ownerName: "Dishant", ownerEntityId: null, needsReview: true }),
      ],
    });
    const names = r.seeds.filter((s) => s.seedType === "confirm_or_activate_person").map((s) => s.subjectName);
    expect(new Set(names)).toEqual(new Set(["David", "Dishant"]));
  });

  it("an owner with no named person (empty ownerName from a pronoun) seeds no phantom person", () => {
    const r = build({ workItems: [item({ ownerName: "", ownerEntityId: null, needsReview: true })] });
    expect(r.seeds.some((s) => s.seedType === "confirm_or_activate_person")).toBe(false);
  });
});
