// FILE: decision-rights.test.ts (unit, no DB)
// PURPOSE: Lock the decision-rights model — hierarchy resolves accountability,
//          but evidence/expertise resolve truth and policy resolves safety. The
//          boss is not always right; the expert is not always authorized.
// CONNECTS TO: services/otzar/decision-rights.ts.

import { describe, expect, it } from "vitest";
import { computeDecisionRights, frameTaskFromStrategicDirection } from "@niov/api";

describe("decision-rights — hierarchy is not blind truth", () => {
  it("1. authority direction contradicted by the domain owner's evidence blocks autonomy", () => {
    const r = computeDecisionRights({
      decisionDomain: "technical",
      authority: { party: "Lead", authorityType: "meeting_leadership", strength: "strong", direction: "auth is integrated" },
      expertise: [
        { party: "AuthOwner", authorityType: "implementation_ownership", strength: "strong", direction: "auth refresh/logout incomplete", contradictsAuthority: true, evidence: "PR open" },
      ],
      evidence: [],
      policyAllows: true,
      finalDecisionMade: false,
    });
    expect(r.confidence).toBe("low");
    expect(r.autonomyBlocked).toBe(true);
    expect(r.alignmentState).toBe("disagreement_unresolved");
    expect(r.requiresClarificationReason).toBeTruthy();
    expect(r.escalationTarget).toBeTruthy();
  });

  it("2. a strong-authority finalized decision with agreeing expertise/evidence is high confidence", () => {
    const r = computeDecisionRights({
      decisionDomain: "execution",
      authority: { party: "Owner", authorityType: "project", strength: "strong", direction: "Shiney leads integration" },
      expertise: [{ party: "Shiney", authorityType: "implementation_ownership", strength: "strong" }],
      evidence: [{ party: "Ticket", authorityType: "project", strength: "strong", evidence: "JIRA-1 assigned" }],
      policyAllows: true,
      finalDecisionMade: true,
    });
    expect(r.confidence).toBe("high");
    expect(r.autonomyBlocked).toBe(false);
    expect(r.alignmentState).toBe("decision_made");
    // The expert signal is preserved.
    expect(r.expertiseSignals.length).toBe(1);
  });

  it("3. authority strong but evidence weak is NOT certain — hold for confirmation", () => {
    const r = computeDecisionRights({
      decisionDomain: "technical",
      authority: { party: "Lead", authorityType: "meeting_leadership", strength: "strong", direction: "ship it" },
      expertise: [],
      evidence: [{ party: "Lead", strength: "weak" }],
      policyAllows: true,
      finalDecisionMade: false,
    });
    expect(r.confidence).toBe("medium");
    expect(r.autonomyBlocked).toBe(true);
    expect(r.note).toMatch(/evidence/i);
  });

  it("4. a lower-hierarchy expert with strong evidence is recognized, not overridden", () => {
    const r = computeDecisionRights({
      decisionDomain: "technical",
      authority: null,
      expertise: [{ party: "Engineer", authorityType: "implementation_ownership", strength: "strong", evidence: "PR + tests" }],
      evidence: [{ party: "Engineer", authorityType: "technical", strength: "strong", evidence: "test results" }],
      policyAllows: true,
      finalDecisionMade: false,
    });
    expect(r.expertiseSignals[0]!.strength).toBe("strong");
    expect(r.confidence).toBe("medium"); // recognized, but awaiting owner confirmation
    expect(r.autonomyBlocked).toBe(true);
  });

  it("5. policy outranks hierarchy for safety", () => {
    const r = computeDecisionRights({
      decisionDomain: "security",
      authority: { party: "Founder", authorityType: "founder_executive", strength: "strong", direction: "send the restricted doc" },
      expertise: [],
      evidence: [],
      policyAllows: false,
      finalDecisionMade: true,
    });
    expect(r.autonomyBlocked).toBe(true);
    expect(r.escalationTarget).toBe("policy approver");
    expect(r.note).toMatch(/policy/i);
  });

  it("6. unresolved conflict between two plausible owners blocks autonomy", () => {
    const r = computeDecisionRights({
      decisionDomain: "execution",
      authority: { party: "Lead", authorityType: "meeting_leadership", strength: "moderate", direction: "Shiney owns integration" },
      expertise: [{ party: "Samiksha", authorityType: "implementation_ownership", strength: "strong", direction: "Samiksha owns integration", contradictsAuthority: true }],
      evidence: [],
      policyAllows: true,
      finalDecisionMade: false,
    });
    expect(r.autonomyBlocked).toBe(true);
    expect(r.dissentSignals.length).toBe(1);
  });

  it("7. meeting lead is the decision owner for execution, but technical truth still needs the owner", () => {
    const r = computeDecisionRights({
      decisionDomain: "execution",
      authority: { party: "David", authorityType: "meeting_leadership", strength: "strong", direction: "coordinate the push" },
      expertise: [{ party: "Shiney", authorityType: "implementation_ownership", strength: "moderate" }],
      evidence: [{ party: "Shiney", strength: "moderate" }],
      policyAllows: true,
      finalDecisionMade: true,
    });
    expect(r.decisionOwner).toBe("David");
    expect(r.confidence).toBe("high");
  });

  it("8. strategic priority frames a task toward modular scope (no overbuild)", () => {
    const framed = frameTaskFromStrategicDirection(
      "speed matters more than overbuilding",
      "rebuild the full MVP for OpenClaw",
    );
    expect(framed).toMatch(/modular|minimal|do not rebuild/i);
  });
});
