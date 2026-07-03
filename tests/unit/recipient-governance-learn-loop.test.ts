// FILE: recipient-governance-learn-loop.test.ts (unit, no DB)
// PURPOSE: [LEARN-LOOP] Lock the two correction-memory effects fed from
//          caller-resolved follow-ups (BUG C rows ARE the correction store):
//          (1) a prior ambiguous-name SELECT resolves the same collision for
//              the SAME entity only — never a different person;
//          (2) a prior CONFIRM vouch softens out_of_scope -> likely ONLY —
//              it can never bypass unauthorized, cross_team_needs_approval,
//              hard exclusions, or mint send-ready/auto-eligibility.
//          Every influence is explainable via evidence.source
//          (correction_memory / caller_confirmed).
// CONNECTS TO: services/otzar/recipient-governance.ts.

import { describe, expect, it } from "vitest";
import { classifyRecipient, isSendReady, type RosterEntry } from "@niov/api";

// Two people who collide on the first-name token "priya" — the repeated-
// ambiguity class: every new transcript naming "Priya" would re-ask the
// same "which Priya?" question.
const ROSTER_TWO_PRIYAS: RosterEntry[] = [
  { entity_id: "e-david", display_name: "David Odie", email: "david@x.com", title: "Tech Lead" },
  { entity_id: "e-priya-eng", display_name: "Priya Nair", email: "priya.n@x.com", title: "Integration Engineer" },
  { entity_id: "e-priya-mkt", display_name: "Priya Menon", email: "priya.m@x.com", title: "Marketing Manager" },
];

const AMBIGUOUS_TRANSCRIPT =
  "David: Priya will take the vendor integration follow-up and send the summary note.";

// The Shweta-class fixture: the proposed recipient is never named in the
// transcript and has no proof path at all.
const ROSTER_NO_SHINEY: RosterEntry[] = [
  { entity_id: "e-david", display_name: "David Odie", email: "david@x.com", title: "Tech Lead" },
  { entity_id: "e-shweta", display_name: "Shweta Rao", email: "shweta@x.com", title: "Marketing Manager" },
];
const SHINEY_TRANSCRIPT =
  "David: Shiney is going to lead the team on the YC demo integration; Shiney, you are the focal point.";

function classifyPriya(
  targetId: "e-priya-eng" | "e-priya-mkt",
  priorSelections?: ReadonlyMap<string, string>,
) {
  const person = ROSTER_TWO_PRIYAS.find((r) => r.entity_id === targetId);
  if (person === undefined) throw new Error("fixture");
  return classifyRecipient({
    target: {
      entity_id: person.entity_id,
      display_name: person.display_name,
      email: person.email,
      role: person.title,
    },
    sourceExcerpt: "Priya will take the vendor integration follow-up",
    transcriptText: AMBIGUOUS_TRANSCRIPT,
    roster: ROSTER_TWO_PRIYAS,
    participantEntityIds: null,
    policyStatus: "unknown",
    ...(priorSelections !== undefined ? { priorSelections } : {}),
  });
}

function classifyShweta(extra?: Partial<Parameters<typeof classifyRecipient>[0]>) {
  return classifyRecipient({
    target: { entity_id: "e-shweta", display_name: "Shweta Rao", email: "shweta@x.com", role: "Marketing Manager" },
    sourceExcerpt: "Shiney is going to lead the team",
    transcriptText: SHINEY_TRANSCRIPT,
    roster: ROSTER_NO_SHINEY,
    participantEntityIds: new Set(["e-david"]),
    workDomain: "engineering",
    policyStatus: "allowed",
    ...extra,
  });
}

describe("[LEARN-LOOP] prior SELECT resolves repeated ambiguity — same entity only", () => {
  it("without a prior correction the collision is ambiguous (the question is asked)", () => {
    const g = classifyPriya("e-priya-eng");
    expect(g.recipientSafety).toBe("ambiguous");
    expect(g.autonomyEligibility).toBe("clarification_required");
  });

  it("a prior org select of THIS entity answers the question — likely, explainable, never send-ready", () => {
    const g = classifyPriya("e-priya-eng", new Map([["priya", "e-priya-eng"]]));
    expect(g.recipientSafety).toBe("likely");
    expect(g.mentionStatus).toBe("alias_mentioned");
    // Explainability: the proof source IS the org correction.
    expect(g.evidence.source).toBe("correction_memory");
    expect(g.evidence.matchedToken).toBe("priya");
    // The ambiguity provenance stays visible.
    expect(g.evidence.alternativeCandidates).toContain("Priya Menon");
    // A correction never mints autonomy: human review still gates the send.
    expect(g.autonomyEligibility).toBe("approval_required");
    expect(isSendReady(g)).toBe(false);
  });

  it("a prior select of a DIFFERENT entity changes nothing — the other Priya stays ambiguous", () => {
    const g = classifyPriya("e-priya-mkt", new Map([["priya", "e-priya-eng"]]));
    expect(g.recipientSafety).toBe("ambiguous");
    expect(g.evidence.source).not.toBe("correction_memory");
  });

  it("a prior select for an unrelated token does not touch the collision", () => {
    const g = classifyPriya("e-priya-eng", new Map([["sam", "e-priya-eng"]]));
    expect(g.recipientSafety).toBe("ambiguous");
  });
});

describe("[LEARN-LOOP] prior CONFIRM vouch softens the repeated warning — never past policy", () => {
  it("without a prior vouch the Shweta case stays out_of_scope (regression)", () => {
    const g = classifyShweta();
    expect(g.recipientSafety).toBe("out_of_scope");
    expect(g.autonomyEligibility).toBe("blocked");
  });

  it("a prior org vouch softens out_of_scope -> likely with caller_confirmed provenance", () => {
    const g = classifyShweta({ priorConfirmedEntityIds: new Set(["e-shweta"]) });
    expect(g.recipientSafety).toBe("likely");
    expect(g.evidence.source).toBe("caller_confirmed");
    // Still a human-review path — a vouch never earns autonomy.
    expect(g.autonomyEligibility).toBe("approval_required");
    expect(isSendReady(g)).toBe(false);
  });

  it("a vouch for a DIFFERENT entity does not soften this one", () => {
    const g = classifyShweta({ priorConfirmedEntityIds: new Set(["e-david"]) });
    expect(g.recipientSafety).toBe("out_of_scope");
  });

  it("NEVER bypasses unauthorized: blocked policy wins over any vouch", () => {
    const g = classifyShweta({
      priorConfirmedEntityIds: new Set(["e-shweta"]),
      policyStatus: "blocked",
    });
    expect(g.recipientSafety).toBe("unauthorized");
    expect(g.autonomyEligibility).toBe("blocked");
  });

  it("NEVER bypasses cross_team_needs_approval: the approval boundary still holds", () => {
    const g = classifyShweta({
      priorConfirmedEntityIds: new Set(["e-shweta"]),
      hierarchyConnection: "cross_team",
    });
    expect(g.recipientSafety).toBe("cross_team_needs_approval");
    expect(g.autonomyEligibility).toBe("approval_required");
  });

  it("NEVER overrides a hard org exclusion: excludeEntityIds wins over any vouch", () => {
    const g = classifyShweta({
      priorConfirmedEntityIds: new Set(["e-shweta"]),
      excludeEntityIds: new Set(["e-shweta"]),
    });
    expect(g.recipientSafety).toBe("out_of_scope");
  });

  it("approval_required policy still routes to cross_team_needs_approval with a vouch", () => {
    const g = classifyShweta({
      priorConfirmedEntityIds: new Set(["e-shweta"]),
      policyStatus: "approval_required",
    });
    expect(g.recipientSafety).toBe("cross_team_needs_approval");
  });
});

// ── [LEARN-LOOP] governExtraction retargets a colliding token to the prior
//    human selection (deterministic, roster-validated, still human-reviewed) ──

import { governExtraction, derivePriorRecipientDecisions } from "@niov/api";

describe("[LEARN-LOOP] governExtraction retarget from a prior org select", () => {
  const pre = {
    summary: "Vendor sync",
    decisions: [],
    commitments: [],
    risks_or_blockers: [],
    suggested_actions: [
      {
        local_id: "a1",
        action_type: "SEND_INTERNAL_NOTIFICATION" as const,
        target: { entity_id: "e-priya-mkt", display_name: "Priya Menon", email: "priya.m@x.com" },
        draft_text: "Hi Priya — sending the vendor integration summary.",
        reason: "Named in the conversation.",
        source_excerpt: "Priya will take the vendor integration follow-up",
        confidence: "MEDIUM" as const,
        resolution_status: "RESOLVED" as const,
      },
    ],
    extraction_mode: "LLM" as const,
  };

  const priors = derivePriorRecipientDecisions([
    {
      entity_id: "e-priya-eng",
      display_name: "Priya Nair",
      alternative_names: ["Priya Menon"],
      evidence_source: "caller_confirmed",
      recipient_safety: "confirmed",
    },
  ]);

  it("the extractor's re-guess is replaced by the person the human chose — likely, explainable", () => {
    const out = governExtraction(pre, AMBIGUOUS_TRANSCRIPT, ROSTER_TWO_PRIYAS, priors);
    const a = out.suggested_actions[0];
    expect(a?.target.entity_id).toBe("e-priya-eng");
    expect(a?.target.display_name).toBe("Priya Nair");
    expect(a?.recipient_governance.recipientSafety).toBe("likely");
    expect(a?.recipient_governance.evidence.source).toBe("correction_memory");
    // Never send-ready by correction alone — the human still reviews.
    expect(a?.recipient_governance.autonomyEligibility).toBe("approval_required");
  });

  it("without priors the same extraction stays ambiguous (the question is asked)", () => {
    const out = governExtraction(pre, AMBIGUOUS_TRANSCRIPT, ROSTER_TWO_PRIYAS);
    expect(out.suggested_actions[0]?.recipient_governance.recipientSafety).toBe("ambiguous");
    expect(out.suggested_actions[0]?.target.entity_id).toBe("e-priya-mkt");
  });

  it("no retarget when the token does not collide — a unique strict match is stronger than memory", () => {
    const out = governExtraction(
      {
        ...pre,
        suggested_actions: [
          {
            ...pre.suggested_actions[0]!,
            target: { entity_id: "e-david", display_name: "David Odie", email: "david@x.com" },
            draft_text: "David — vendor summary attached.",
            source_excerpt: null,
          },
        ],
      },
      "David Odie will take the vendor integration follow-up.",
      ROSTER_TWO_PRIYAS,
      derivePriorRecipientDecisions([
        {
          entity_id: "e-priya-eng",
          display_name: "David Nair", // hostile prior: maps "david" elsewhere
          alternative_names: ["David Odie"],
          evidence_source: "caller_confirmed",
          recipient_safety: "confirmed",
        },
      ]),
    );
    expect(out.suggested_actions[0]?.target.entity_id).toBe("e-david");
  });
});
