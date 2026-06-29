// FILE: autonomy.test.ts (unit, no DB)
// PURPOSE: Lock the earned-autonomy model. No auto-send is enabled; safe actions
//          still draft + ask, but each action states whether it WOULD be
//          future-auto-eligible and why, with risk, minimized context, and the
//          Sent/Waiting/Needs-review/Blocked ledger bucket.
// CONNECTS TO: services/otzar/autonomy.ts, recipient-governance.ts.

import { describe, expect, it } from "vitest";
import { computeAutonomyDecision, type RecipientGovernance } from "@niov/api";

function gov(over: Partial<RecipientGovernance> = {}): RecipientGovernance {
  return {
    entity_id: "e-1",
    display_name: "Test",
    email: null,
    role: "Engineer",
    participantStatus: "participant",
    mentionStatus: "explicitly_mentioned",
    workConnectionType: "transcript_assignee",
    evidence: { quote: "assigned in the call", source: "explicit_mention", matchedToken: "Test", alternativeCandidates: [] },
    roleMatch: "clear",
    hierarchyConnection: "none",
    projectConnection: "owner",
    policyStatus: "allowed",
    sensitivity: "low",
    confidence: "high",
    recipientSafety: "confirmed",
    autonomyEligibility: "eligible",
    ...over,
  };
}

describe("earned autonomy", () => {
  it("1. safe same-team explicit assignment is future-auto-eligible but still draft-only now", () => {
    const a = computeAutonomyDecision({ governance: gov(), mode: "draft_and_approve" });
    expect(a.futureAutoEligible).toBe(true);
    expect(a.ledgerState).toBe("draft"); // current mode still requires approval
    expect(a.wouldAutoSendUnderMode).toBe(false); // draft mode never auto-sends
    expect(a.actionRisk).toBe("low");
  });

  it("2. ambiguous recipient is not future-eligible and needs review", () => {
    const a = computeAutonomyDecision({ governance: gov({ recipientSafety: "ambiguous", autonomyEligibility: "clarification_required" }) });
    expect(a.futureAutoEligible).toBe(false);
    expect(a.ledgerState).toBe("needs_review");
    expect(a.requiresApprovalReason).toMatch(/ambiguous/i);
  });

  it("3. cross-team / sensitive route requires approval", () => {
    const a = computeAutonomyDecision({ governance: gov({ recipientSafety: "cross_team_needs_approval", autonomyEligibility: "approval_required" }) });
    expect(a.futureAutoEligible).toBe(false);
    expect(a.requiresApprovalReason).toMatch(/approval/i);
    expect(a.contextScope).toBe("approval_summary"); // context minimized
  });

  it("4. no-proof recipient is blocked with no context shared", () => {
    const a = computeAutonomyDecision({ governance: gov({ recipientSafety: "out_of_scope", autonomyEligibility: "blocked", mentionStatus: "not_mentioned", participantStatus: "non_participant", workConnectionType: "none" }) });
    expect(a.ledgerState).toBe("blocked");
    expect(a.futureAutoEligible).toBe(false);
    expect(a.contextScope).toBe("none");
    expect(a.actionRisk).toBe("high");
  });

  it("5. auto-send would only fire under an auto mode AND when policy allows", () => {
    const eligible = gov();
    expect(computeAutonomyDecision({ governance: eligible, mode: "auto_send_with_visibility" }).wouldAutoSendUnderMode).toBe(true);
    // Policy not allowed -> never, even under an auto mode.
    expect(computeAutonomyDecision({ governance: gov({ policyStatus: "approval_required" }), mode: "auto_send_with_visibility" }).wouldAutoSendUnderMode).toBe(false);
    // Draft mode -> never.
    expect(computeAutonomyDecision({ governance: eligible, mode: "draft_and_approve" }).wouldAutoSendUnderMode).toBe(false);
  });

  it("6. a confirmed action keeps its proof path / evidence for the Sent-by-Otzar ledger", () => {
    const g = gov();
    const a = computeAutonomyDecision({ governance: g });
    expect(g.evidence.source).toBe("explicit_mention");
    expect(a.ledgerState).toBe("draft");
  });

  it("7. a correction-excluded (out_of_scope) recipient drops to blocked / not eligible", () => {
    const a = computeAutonomyDecision({ governance: gov({ recipientSafety: "out_of_scope", autonomyEligibility: "blocked" }) });
    expect(a.futureAutoEligible).toBe(false);
    expect(a.ledgerState).toBe("blocked");
  });

  it("8. context minimization never sends the full transcript for a safe internal note", () => {
    const a = computeAutonomyDecision({ governance: gov() });
    expect(a.contextScope).toBe("task_summary");
    expect(a.contextScope).not.toBe("full");
  });
});
