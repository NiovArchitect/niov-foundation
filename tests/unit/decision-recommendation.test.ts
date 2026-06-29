// FILE: decision-recommendation.test.ts (unit, no DB)
// PURPOSE: Lock the decision-recommendation model — when direction is unclear,
//          Otzar RECOMMENDS the strongest direction (memory-first, research-
//          second, governed) with proof path / risks / alternatives / decision
//          owner / next-best-action, while keeping recommendation != decision !=
//          authority != execution.
// CONNECTS TO: services/otzar/decision-recommendation.ts, decision-rights.ts.

import { describe, expect, it } from "vitest";
import { recommendDirection, computeDecisionRights } from "@niov/api";

function rights(over: Parameters<typeof computeDecisionRights>[0]) {
  return computeDecisionRights(over);
}

describe("decision recommendation — recommend, don't just stall", () => {
  it("1. unclear direction still produces a recommendation, not only 'needs clarification'", () => {
    const r = recommendDirection({
      decision: rights({ decisionDomain: "execution", authority: null, expertise: [], evidence: [], policyAllows: true, finalDecisionMade: false }),
      proposedDirection: "Route integration follow-up to the owner",
    });
    expect(r.recommendedDirection.length).toBeGreaterThan(0);
    expect(r.nextBestAction).toBeDefined();
  });

  it("2. founder speed priority + history yields a modular recommendation", () => {
    const r = recommendDirection({
      decision: rights({ decisionDomain: "technical", authority: { party: "Founder", authorityType: "founder_executive", strength: "strong", direction: "explore OpenClaw" }, expertise: [], evidence: [{ party: "x", strength: "moderate" }], policyAllows: true, finalDecisionMade: true }),
      proposedDirection: "rebuild the full MVP",
      strategicPriority: "speed over overbuild",
    });
    expect(r.recommendedDirection).toMatch(/modular|minimal|do not rebuild/i);
    expect(r.risks.join(" ")).toMatch(/overbuild/i);
  });

  it("3. an expert contradiction lowers confidence and routes to the owner", () => {
    const r = recommendDirection({
      decision: rights({ decisionDomain: "technical", authority: { party: "Lead", authorityType: "meeting_leadership", strength: "strong", direction: "auth done" }, expertise: [{ party: "AuthOwner", authorityType: "implementation_ownership", strength: "strong", contradictsAuthority: true, direction: "auth not done" }], evidence: [], policyAllows: true, finalDecisionMade: false }),
    });
    expect(r.confidence).toBe("low");
    expect(r.requiresConfirmation).toBe(true);
    expect(r.decisionOwner).toBeTruthy();
  });

  it("4. internal memory is used before external research", () => {
    const r = recommendDirection({
      decision: rights({ decisionDomain: "technical", authority: null, expertise: [], evidence: [], policyAllows: true, finalDecisionMade: false }),
      internalEvidence: [{ kind: "prior_decision", detail: "prior push used modular testing" }],
    });
    expect(r.researchRecommended).toBe(false);
    expect(r.why.some((w) => w.kind === "prior_decision")).toBe(true);
  });

  it("5. external research is labeled and never overrides policy", () => {
    const r = recommendDirection({
      decision: rights({ decisionDomain: "security", authority: { party: "Lead", authorityType: "role", strength: "strong", direction: "send" }, expertise: [], evidence: [], policyAllows: false, finalDecisionMade: true }),
      internalEvidence: [{ kind: "research", detail: "OWASP says X", external: true, source: "owasp.org" }],
      policyAllows: false,
    });
    expect(r.policyBlocked).toBe(true);
    expect(r.nextBestAction).toBe("block"); // policy blocks even with research
    expect(r.why.find((w) => w.kind === "research")?.external).toBe(true);
  });

  it("6. policy can block a recommended action", () => {
    const r = recommendDirection({
      decision: rights({ decisionDomain: "legal", authority: { party: "Lead", authorityType: "role", strength: "strong" }, expertise: [], evidence: [], policyAllows: false, finalDecisionMade: true }),
      policyAllows: false,
    });
    expect(r.nextBestAction).toBe("block");
  });

  it("7. a high-confidence, policy-allowed recommendation is actionable (draft, not stalled)", () => {
    const r = recommendDirection({
      decision: rights({ decisionDomain: "execution", authority: { party: "Owner", authorityType: "project", strength: "strong", direction: "go" }, expertise: [{ party: "x", strength: "strong" }], evidence: [{ party: "y", strength: "strong" }], policyAllows: true, finalDecisionMade: true }),
      policyAllows: true,
    });
    expect(r.confidence).toBe("high");
    expect(r.requiresConfirmation).toBe(false);
    expect(["draft", "execute", "route"]).toContain(r.nextBestAction);
  });

  it("8. a medium-confidence recommendation asks the decision owner", () => {
    const r = recommendDirection({
      decision: rights({ decisionDomain: "technical", authority: { party: "Lead", authorityType: "role", strength: "strong", direction: "ship" }, expertise: [], evidence: [{ party: "Lead", strength: "weak" }], policyAllows: true, finalDecisionMade: false }),
      policyAllows: true,
    });
    expect(r.confidence).toBe("medium");
    expect(r.nextBestAction).toBe("request_approval");
    expect(r.decisionOwner).toBeTruthy();
  });

  it("9. a low-confidence technical recommendation with no internal memory recommends research", () => {
    const r = recommendDirection({
      decision: rights({ decisionDomain: "technical", authority: null, expertise: [], evidence: [], policyAllows: true, finalDecisionMade: false }),
      internalEvidence: [],
      policyAllows: true,
    });
    expect(r.confidence).toBe("low");
    expect(["research", "gather_evidence", "ask_one_question"]).toContain(r.nextBestAction);
  });

  it("10. a recommendation carries proof path, risks, alternatives, and next best action", () => {
    const r = recommendDirection({
      decision: rights({ decisionDomain: "execution", authority: { party: "Lead", authorityType: "meeting_leadership", strength: "moderate", direction: "Shiney owns it" }, expertise: [{ party: "Samiksha", authorityType: "implementation_ownership", strength: "strong", direction: "Samiksha owns it", contradictsAuthority: true }], evidence: [], policyAllows: true, finalDecisionMade: false }),
    });
    expect(r.why.length).toBeGreaterThan(0);
    expect(r.risks.length).toBeGreaterThan(0);
    expect(r.alternatives.length).toBeGreaterThan(0);
    expect(r.nextBestAction).toBeDefined();
  });
});
