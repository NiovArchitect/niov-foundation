// FILE: autonomy-policy.test.ts (unit, no DB)
// PURPOSE: Prove no action can ever auto-send under the shipped default (the
//          feature flag is hard-off), and that governed research is memory-first,
//          never overrides policy, and never leaks private context.
// CONNECTS TO: services/otzar/autonomy-policy.ts, decision-recommendation.ts.

import { describe, expect, it } from "vitest";
import {
  isAutoSendEnabled,
  canAutoSend,
  AUTO_SEND_DISABLED,
  computeAutonomyDecision,
  recommendResearch,
  computeDecisionRights,
  type RecipientGovernance,
} from "@niov/api";

function gov(over: Partial<RecipientGovernance> = {}): RecipientGovernance {
  return {
    entity_id: "e-1", display_name: "T", email: null, role: "Engineer",
    participantStatus: "participant", mentionStatus: "explicitly_mentioned",
    workConnectionType: "transcript_assignee",
    evidence: { quote: "assigned", source: "explicit_mention", matchedToken: "T", alternativeCandidates: [] },
    roleMatch: "clear", hierarchyConnection: "none", projectConnection: "owner",
    policyStatus: "allowed", sensitivity: "low", confidence: "high",
    recipientSafety: "confirmed", autonomyEligibility: "eligible", ...over,
  };
}

describe("B4 — autonomous send is hard-disabled", () => {
  it("the shipped policy is disabled", () => {
    expect(AUTO_SEND_DISABLED.enabled).toBe(false);
    expect(isAutoSendEnabled()).toBe(false);
  });

  it("even a fully-safe, future-eligible action never auto-sends under the default", () => {
    const g = gov();
    const autonomy = computeAutonomyDecision({ governance: g, mode: "auto_send_with_visibility" });
    expect(autonomy.futureAutoEligible).toBe(true); // it WOULD be eligible...
    // ...but the shipped policy is off, so canAutoSend is false.
    expect(
      canAutoSend({ governance: g, autonomy, actionType: "SEND_INTERNAL_NOTIFICATION", hasAuditTrail: true, hasUndoPath: true }),
    ).toBe(false);
  });

  it("even with the flag flipped on, all guards must hold (action type, proof, policy, audit, undo)", () => {
    const g = gov();
    const autonomy = computeAutonomyDecision({ governance: g });
    const enabled = { ...AUTO_SEND_DISABLED, enabled: true, actionTypesAllowed: ["SEND_INTERNAL_NOTIFICATION"] };
    // Missing audit trail -> still false.
    expect(canAutoSend({ governance: g, autonomy, actionType: "SEND_INTERNAL_NOTIFICATION", hasAuditTrail: false, hasUndoPath: true, policy: enabled })).toBe(false);
    // An unsafe recipient -> still false even with the flag on + audit + undo.
    const unsafe = gov({ recipientSafety: "out_of_scope", autonomyEligibility: "blocked" });
    const ua = computeAutonomyDecision({ governance: unsafe });
    expect(canAutoSend({ governance: unsafe, autonomy: ua, actionType: "SEND_INTERNAL_NOTIFICATION", hasAuditTrail: true, hasUndoPath: true, policy: enabled })).toBe(false);
  });
});

describe("B2 — governed research recommendation", () => {
  const rights = (over: Parameters<typeof computeDecisionRights>[0]) => computeDecisionRights(over);

  it("internal memory is used first — no research when internal evidence exists", () => {
    const r = recommendResearch({
      decision: rights({ decisionDomain: "technical", authority: null, expertise: [], evidence: [], policyAllows: true, finalDecisionMade: false }),
      internalEvidence: [{ kind: "prior_decision", detail: "we did modular last time" }],
    });
    expect(r.researchNeeded).toBe(false);
  });

  it("research is suggested when evidence is thin (low confidence, technical, no internal)", () => {
    const r = recommendResearch({
      decision: rights({ decisionDomain: "security", authority: null, expertise: [], evidence: [], policyAllows: true, finalDecisionMade: false }),
      internalEvidence: [],
    });
    expect(r.researchNeeded).toBe(true);
    expect(r.allowedResearchScope).toContain("security_guidance");
  });

  it("research never overrides policy — policy-blocked routes to approval, not research", () => {
    const r = recommendResearch({
      decision: rights({ decisionDomain: "technical", authority: { party: "Lead", authorityType: "role", strength: "strong" }, expertise: [], evidence: [], policyAllows: false, finalDecisionMade: true }),
      internalEvidence: [],
      policyAllows: false,
    });
    expect(r.researchNeeded).toBe(false);
  });

  it("private context is NEVER sent externally (always prohibited)", () => {
    const secret = "ACME confidential merger with Globex";
    const r = recommendResearch({
      decision: rights({ decisionDomain: "technical", authority: { party: "Lead", authorityType: "role", strength: "moderate", direction: secret }, expertise: [], evidence: [], policyAllows: true, finalDecisionMade: false }),
    });
    expect(r.privateContextProhibited).toBe(true);
    // The recommendation carries only generic labels — the private direction text
    // never appears in the externally-facing research recommendation.
    expect(JSON.stringify(r)).not.toContain(secret);
    expect(r.sourceTypesSuggested.every((s) => /^[a-z_]+$/.test(s))).toBe(true);
  });
});
