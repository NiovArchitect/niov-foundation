// FILE: recipient-governance-generic.test.ts (unit, no DB)
// PURPOSE: Prove the recipient-governance mechanism is TENANT-GENERAL — not a
//          NIOV/Shiney-Shweta patch. Uses synthetic generic-org fixtures (Acme /
//          Globex) with unrelated names to exercise the founder's universal
//          cases A-E + tenant isolation. The SAME gate that excludes Shweta must
//          protect any Otzar customer.
// CONNECTS TO: services/otzar/recipient-governance.ts,
//              services/otzar/work-graph-learning.ts.

import { describe, expect, it } from "vitest";
import {
  classifyRecipient,
  buildDisambiguationCorrection,
  correctionsForContext,
  type RosterEntry,
} from "@niov/api";

// A synthetic org with deliberately close names (Alex/Alice) in different depts.
const ACME: RosterEntry[] = [
  { entity_id: "e-alex", display_name: "Alex Morgan", email: "alex@acme.com", title: "Backend Engineer" },
  { entity_id: "e-alice", display_name: "Alice Brown", email: "alice@acme.com", title: "Marketing Lead" },
  { entity_id: "e-lena", display_name: "Lena Cole", email: "lena@acme.com", title: "Legal Counsel" },
  { entity_id: "e-frank", display_name: "Frank Diaz", email: "frank@acme.com", title: "Finance Manager" },
  { entity_id: "e-sam1", display_name: "Sam Lee", email: "sam.lee@acme.com", title: "Engineer" },
  { entity_id: "e-sam2", display_name: "Sam Patel", email: "sam.patel@acme.com", title: "Engineer" },
];

describe("Case A — route to the connected person, not the close fuzzy name", () => {
  const transcript = "Alex owns the billing API and will ship the integration.";
  it("Alex (engineering, mentioned) is confirmed", () => {
    const g = classifyRecipient({
      target: { entity_id: "e-alex", display_name: "Alex Morgan", email: "alex@acme.com", role: "Backend Engineer" },
      sourceExcerpt: "Alex owns the billing API",
      transcriptText: transcript,
      roster: ACME,
      participantEntityIds: null,
      workDomain: "engineering",
      policyStatus: "allowed",
    });
    expect(g.recipientSafety).toBe("confirmed");
  });
  it("Alice (marketing, NOT mentioned) is out_of_scope even though the name is close", () => {
    const g = classifyRecipient({
      target: { entity_id: "e-alice", display_name: "Alice Brown", email: "alice@acme.com", role: "Marketing Lead" },
      sourceExcerpt: "Alex owns the billing API",
      transcriptText: transcript,
      roster: ACME,
      participantEntityIds: null,
      workDomain: "engineering",
      policyStatus: "allowed",
    });
    expect(g.mentionStatus).toBe("not_mentioned");
    expect(g.recipientSafety).toBe("out_of_scope");
  });
});

describe("Case B/C — absent but valid reviewer/approver (proof path, not auto-excluded)", () => {
  it("an absent legal reviewer required by policy is approval-gated, not out_of_scope", () => {
    const g = classifyRecipient({
      target: { entity_id: "e-lena", display_name: "Lena Cole", email: "lena@acme.com", role: "Legal Counsel" },
      sourceExcerpt: "Legal needs to review this before sending.",
      transcriptText: "Legal needs to review this before sending.",
      roster: ACME,
      participantEntityIds: new Set(["e-alex"]), // Lena absent
      workConnectionType: "policy_required_reviewer",
      workDomain: "legal",
      policyStatus: "approval_required",
    });
    expect(g.recipientSafety).not.toBe("out_of_scope");
    expect(g.autonomyEligibility).toBe("approval_required");
  });
  it("an absent finance approver with authority proof is approval-gated", () => {
    const g = classifyRecipient({
      target: { entity_id: "e-frank", display_name: "Frank Diaz", email: "frank@acme.com", role: "Finance Manager" },
      sourceExcerpt: "Get finance approval.",
      transcriptText: "Get finance approval before we proceed.",
      roster: ACME,
      participantEntityIds: new Set(["e-alex"]),
      workConnectionType: "approval_owner",
      workDomain: "finance",
      policyStatus: "approval_required",
    });
    expect(["cross_team_needs_approval", "likely", "confirmed"]).toContain(g.recipientSafety);
    expect(g.autonomyEligibility).toBe("approval_required");
  });
});

describe("Case D — unrelated department mismatch is not send-ready", () => {
  it("a marketing person for engineering work, unmentioned, has no proof", () => {
    const g = classifyRecipient({
      target: { entity_id: "e-alice", display_name: "Alice Brown", email: "alice@acme.com", role: "Marketing Lead" },
      sourceExcerpt: "ship the integration",
      transcriptText: "We must ship the integration this week.",
      roster: ACME,
      participantEntityIds: new Set<string>(),
      workDomain: "engineering",
      policyStatus: "allowed",
    });
    expect(g.recipientSafety).toBe("out_of_scope");
    expect(g.autonomyEligibility).toBe("blocked");
  });
});

describe("Case E — ambiguous name asks, never silently chooses", () => {
  it("two 'Sam' entries make the recipient ambiguous", () => {
    const g = classifyRecipient({
      target: { entity_id: "e-sam1", display_name: "Sam Lee", email: "sam.lee@acme.com", role: "Engineer" },
      sourceExcerpt: "Sam will handle the deployment.",
      transcriptText: "Sam will handle the deployment.",
      roster: ACME,
      participantEntityIds: null,
      workDomain: "engineering",
      policyStatus: "allowed",
    });
    expect(g.recipientSafety).toBe("ambiguous");
    expect(g.autonomyEligibility).toBe("clarification_required");
    expect(g.evidence.alternativeCandidates).toContain("Sam Patel");
  });
});

describe("fuzzy-only candidate (no proof) is blocked in any org", () => {
  it("a roster member never named and not work-connected is out_of_scope", () => {
    const g = classifyRecipient({
      target: { entity_id: "e-frank", display_name: "Frank Diaz", email: "frank@acme.com", role: "Finance Manager" },
      sourceExcerpt: "Alex owns the billing API",
      transcriptText: "Alex owns the billing API.",
      roster: ACME,
      participantEntityIds: null,
      workDomain: "engineering",
      policyStatus: "allowed",
    });
    expect(g.recipientSafety).toBe("out_of_scope");
  });
});

describe("tenant isolation — a correction never crosses orgs", () => {
  it("a correction in org Acme does not exclude anyone in org Globex", () => {
    const resolveName = (n: string): string | null =>
      ACME.find((p) => p.display_name.split(" ")[0]!.toLowerCase() === n.toLowerCase())?.entity_id ?? null;
    const correction = buildDisambiguationCorrection({
      orgEntityId: "org-acme",
      feedbackText: "Alice was not supposed to be included. This should have been Alex.",
      resolveName,
      workDomain: "engineering",
    })!;
    // Same tenant: the exclusion applies.
    const acme = correctionsForContext([correction], "org-acme", "engineering");
    expect(acme.excludeEntityIds.has("e-alice")).toBe(true);
    // Different tenant: never applied.
    const globex = correctionsForContext([correction], "org-globex", "engineering");
    expect(globex.excludeEntityIds.size).toBe(0);
  });
});
