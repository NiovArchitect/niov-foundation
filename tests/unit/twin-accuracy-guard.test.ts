import { describe, expect, it } from "vitest";
import { applyTwinAccuracyGuard } from "../../apps/api/src/services/otzar/twin-accuracy-guard.js";

const empty = {
  open_incoming_handoffs_count: 0,
  open_obligations_count: 0,
  open_org_truth_conflicts_count: 0,
};

describe("applyTwinAccuracyGuard", () => {
  it("rewrites status answers that invent open handoffs", () => {
    const r = applyTwinAccuracyGuard({
      userMessage: "What open handoffs need my attention right now?",
      assistantText:
        "You have an open handoff waiting — 1 incoming handoff needs acknowledgment.",
      grounding: empty,
    });
    expect(r.corrected).toBe(true);
    expect(r.text).toMatch(/Open incoming handoffs: none/i);
    expect(r.reasons).toContain("overclaim_open_handoff");
  });

  it("leaves honest zero claims alone", () => {
    const r = applyTwinAccuracyGuard({
      userMessage: "What needs me?",
      assistantText: "Open Incoming Handoffs: none. One open obligation remains.",
      grounding: {
        open_incoming_handoffs_count: 0,
        open_obligations_count: 1,
        open_org_truth_conflicts_count: 0,
        open_obligation_titles: ["Ship notes"],
      },
    });
    expect(r.corrected).toBe(false);
  });

  it("does not invent obligation titles beyond grounding", () => {
    const r = applyTwinAccuracyGuard({
      userMessage: "What open work do I have?",
      assistantText: "You have 3 open obligations that need progress.",
      grounding: {
        open_incoming_handoffs_count: 0,
        open_obligations_count: 0,
        open_org_truth_conflicts_count: 0,
      },
    });
    expect(r.corrected).toBe(true);
    expect(r.text).toMatch(/Open obligations: none/i);
  });
});
