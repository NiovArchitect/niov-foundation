// FILE: recipient-governance.test.ts (unit, no DB)
// PURPOSE: Lock the deterministic recipient-governance gate against the
//          Shiney->Shweta wrong-recipient class of bug. The gate must NEVER mark
//          a recipient send-ready unless a deterministic proof path backs the
//          exact entity_id. Pure, no LLM, no DB — the safety guarantee is
//          testable in isolation.
// CONNECTS TO: services/otzar/recipient-governance.ts.

import { describe, expect, it } from "vitest";
import {
  classifyRecipient,
  provablyReferenced,
  resolveTokenToEntities,
  isSendReady,
  type RosterEntry,
} from "@niov/api";

// A roster that contains Shweta (marketing) but NOT Shiney — the exact
// condition that produced the bug: the transcript names Shiney, the LLM
// phonetically guessed the nearest roster name (Shweta).
const ROSTER_NO_SHINEY: RosterEntry[] = [
  { entity_id: "e-david", display_name: "David Odie", email: "david@x.com", title: "Tech Lead" },
  { entity_id: "e-samiksha", display_name: "Samiksha Sharma", email: "samiksha@x.com", title: "Engineer" },
  { entity_id: "e-shweta", display_name: "Shweta Rao", email: "shweta@x.com", title: "Marketing Manager" },
];

const ROSTER_WITH_SHINEY: RosterEntry[] = [
  ...ROSTER_NO_SHINEY,
  { entity_id: "e-shiney", display_name: "Shiney Mathew", email: "shiney@x.com", title: "Integration Engineer" },
];

const TRANSCRIPT =
  "David: Shiney is going to lead the team on the YC demo integration; Shiney, you are the focal point. " +
  "Samiksha will support the auth token sessions.";

describe("strict roster matching never bridges Shiney->Shweta", () => {
  it("'shiney' resolves to nobody in a roster without Shiney", () => {
    expect(resolveTokenToEntities("Shiney", ROSTER_NO_SHINEY)).toEqual([]);
  });
  it("'shiney' never matches 'Shweta' by substring", () => {
    expect(resolveTokenToEntities("Shiney", ROSTER_WITH_SHINEY)).toEqual(["e-shiney"]);
  });
  it("a first name resolves only by exact/token/prefix, not substring", () => {
    expect(resolveTokenToEntities("David", ROSTER_NO_SHINEY)).toEqual(["e-david"]);
  });
});

describe("THE SHWETA CASE — LLM proposed an unprovable recipient", () => {
  it("Shweta is out_of_scope and NOT send-ready for Shiney's integration work", () => {
    const g = classifyRecipient({
      target: { entity_id: "e-shweta", display_name: "Shweta Rao", email: "shweta@x.com", role: "Marketing Manager" },
      sourceExcerpt: "Shiney is going to lead the team... you are the focal point.",
      transcriptText: TRANSCRIPT,
      roster: ROSTER_NO_SHINEY,
      participantEntityIds: new Set(["e-david", "e-samiksha"]), // Shweta not a participant
      workDomain: "engineering",
      policyStatus: "allowed",
    });
    expect(g.mentionStatus).toBe("not_mentioned"); // transcript never names Shweta
    expect(g.recipientSafety).toBe("out_of_scope");
    expect(g.autonomyEligibility).toBe("blocked");
    expect(isSendReady(g)).toBe(false);
  });
});

describe("Shiney — the correct recipient when present + assigned", () => {
  it("is confirmed and send-ready (explicit mention + participant + role clear)", () => {
    const g = classifyRecipient({
      target: { entity_id: "e-shiney", display_name: "Shiney Mathew", email: "shiney@x.com", role: "Integration Engineer" },
      sourceExcerpt: "Shiney is going to lead the team... you are the focal point.",
      transcriptText: TRANSCRIPT,
      roster: ROSTER_WITH_SHINEY,
      participantEntityIds: new Set(["e-david", "e-shiney", "e-samiksha"]),
      workDomain: "engineering",
      policyStatus: "allowed",
      sensitivity: "low",
    });
    expect(g.mentionStatus).toBe("explicitly_mentioned");
    expect(g.workConnectionType).toBe("transcript_assignee");
    expect(g.roleMatch).toBe("clear");
    expect(g.recipientSafety).toBe("confirmed");
    expect(isSendReady(g)).toBe(true);
    // Computed autonomy-eligible (future trusted mode) — but UI still requires approval.
    expect(g.autonomyEligibility).toBe("eligible");
  });
});

describe("ambiguous name -> clarify, never silently choose", () => {
  it("when a token strictly matches two members, the recipient is ambiguous", () => {
    // Both "Shiney Patel" and "Shiney Mathew" -> token 'Shiney' matches 2.
    const dupe: RosterEntry[] = [
      ...ROSTER_NO_SHINEY,
      { entity_id: "e-shiney1", display_name: "Shiney Mathew", email: "s1@x.com", title: "Integration Engineer" },
      { entity_id: "e-shiney2", display_name: "Shiney Patel", email: "s2@x.com", title: "Engineer" },
    ];
    const g = classifyRecipient({
      target: { entity_id: "e-shiney1", display_name: "Shiney Mathew", email: "s1@x.com", role: "Integration Engineer" },
      sourceExcerpt: "Shiney is the focal point.",
      transcriptText: "Shiney is the focal point for integration.",
      roster: dupe,
      participantEntityIds: null,
      workDomain: "engineering",
      policyStatus: "allowed",
    });
    expect(g.recipientSafety).toBe("ambiguous");
    expect(g.autonomyEligibility).toBe("clarification_required");
    expect(g.evidence.alternativeCandidates).toContain("Shiney Patel");
  });
});

describe("role mismatch with no explicit assignment downgrades", () => {
  it("marketing recipient for engineering work, only project-connected, is reviewed not sent", () => {
    const g = classifyRecipient({
      target: { entity_id: "e-shweta", display_name: "Shweta Rao", email: "shweta@x.com", role: "Marketing Manager" },
      sourceExcerpt: "ship the integration",
      transcriptText: "We need to ship the integration.",
      roster: ROSTER_NO_SHINEY,
      participantEntityIds: new Set<string>(), // not a participant
      projectConnection: "support", // some weak work tie, but...
      workDomain: "engineering", // ...role mismatch and not mentioned
      policyStatus: "allowed",
    });
    expect(g.roleMatch).toBe("mismatch");
    expect(["out_of_scope", "ambiguous"]).toContain(g.recipientSafety);
    expect(isSendReady(g)).toBe(false);
  });
});

describe("non-participant is valid WITH a proof path (not auto-excluded by absence)", () => {
  it("a policy-required reviewer not in the transcript can be likely/approval, not out_of_scope", () => {
    const g = classifyRecipient({
      target: { entity_id: "e-legal", display_name: "Lena Counsel", email: "legal@x.com", role: "Legal Counsel" },
      sourceExcerpt: "legal needs to review this before sending",
      transcriptText: "We need legal to review this before sending.",
      roster: [
        ...ROSTER_NO_SHINEY,
        { entity_id: "e-legal", display_name: "Lena Counsel", email: "legal@x.com", title: "Legal Counsel" },
      ],
      participantEntityIds: new Set(["e-david"]), // absent from the call
      workConnectionType: "policy_required_reviewer", // proven by policy
      workDomain: "legal",
      policyStatus: "approval_required",
    });
    expect(g.recipientSafety).not.toBe("out_of_scope"); // absence alone never excludes
    expect(["cross_team_needs_approval", "likely", "confirmed"]).toContain(g.recipientSafety);
    expect(g.autonomyEligibility).toBe("approval_required");
  });
});

describe("provablyReferenced surfaces exactly the named entities", () => {
  it("the transcript provably references David, Shiney, Samiksha — not Shweta", () => {
    const ref = provablyReferenced(TRANSCRIPT, null, ROSTER_WITH_SHINEY);
    expect(ref.ids.has("e-david")).toBe(true);
    expect(ref.ids.has("e-shiney")).toBe(true);
    expect(ref.ids.has("e-samiksha")).toBe(true);
    expect(ref.ids.has("e-shweta")).toBe(false);
  });
});
