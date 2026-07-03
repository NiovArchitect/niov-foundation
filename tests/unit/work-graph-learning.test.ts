// FILE: work-graph-learning.test.ts (unit, no DB)
// PURPOSE: Lock the closed-loop learning + correction-memory slice: scoped,
//          no-leak learning events; an org-scoped founder correction that
//          excludes the wrong recipient and aliases the right one; and the
//          correction-aware recipient-governance gate. No cross-tenant leakage.
// CONNECTS TO: services/otzar/work-graph-learning.ts,
//              services/otzar/recipient-governance.ts.

import { describe, expect, it } from "vitest";
import {
  buildLearningEvent,
  buildDisambiguationCorrection,
  correctionsForContext,
  classifyRecipient,
  type RosterEntry,
} from "@niov/api";

const ROSTER: RosterEntry[] = [
  { entity_id: "e-shiney", display_name: "Shiney Mathew", email: "shiney@x.com", title: "Integration Engineer" },
  { entity_id: "e-shweta", display_name: "Shweta Rao", email: "shweta@x.com", title: "Marketing Manager" },
];

describe("scoped, no-leak learning events", () => {
  it("a confirmed safe action may improve routing; an out_of_scope one may not", () => {
    const confirmed = buildLearningEvent({
      actionId: "a1",
      orgEntityId: "org-1",
      sourceType: "transcript",
      workItem: "YC demo integration",
      outcome: "accepted",
      governance: classifyRecipient({
        target: { entity_id: "e-shiney", display_name: "Shiney Mathew", email: "shiney@x.com", role: "Integration Engineer" },
        sourceExcerpt: "Shiney is the focal point.",
        transcriptText: "Shiney is the focal point for integration.",
        roster: ROSTER,
        participantEntityIds: new Set(["e-shiney"]),
        workDomain: "engineering",
        policyStatus: "allowed",
        sensitivity: "low",
      }),
    });
    expect(confirmed.impact).toContain("improves_recipient_resolution");
    expect(confirmed.people_involved).toEqual(["e-shiney"]);

    const blocked = buildLearningEvent({
      actionId: "a2",
      orgEntityId: "org-1",
      sourceType: "transcript",
      workItem: "YC demo integration",
      outcome: "blocked",
      governance: classifyRecipient({
        target: { entity_id: "e-shweta", display_name: "Shweta Rao", email: "shweta@x.com", role: "Marketing Manager" },
        sourceExcerpt: "Shiney is the focal point.",
        transcriptText: "Shiney is the focal point for integration.",
        roster: ROSTER,
        participantEntityIds: new Set(["e-shiney"]),
        workDomain: "engineering",
        policyStatus: "allowed",
      }),
    });
    // A blocked/out_of_scope recipient never widens reuse.
    expect(blocked.allowed_reuse).toEqual([]);
    expect(blocked.impact).toEqual([]);
  });

  it("a corrected outcome is correction-scoped and improves name disambiguation", () => {
    const ev = buildLearningEvent({
      actionId: "a3",
      orgEntityId: "org-1",
      sourceType: "correction",
      workItem: null,
      outcome: "corrected",
      governance: classifyRecipient({
        target: { entity_id: "e-shiney", display_name: "Shiney Mathew", email: "shiney@x.com", role: "Integration Engineer" },
        sourceExcerpt: null,
        transcriptText: "Shiney owns integration.",
        roster: ROSTER,
        participantEntityIds: null,
        workDomain: "engineering",
        policyStatus: "allowed",
        sensitivity: "low",
      }),
    });
    expect(ev.memory_scope).toBe("correction");
    expect(ev.impact).toContain("improves_name_disambiguation");
  });
});

describe("org-scoped correction memory (Shiney/Shweta)", () => {
  const resolveName = (n: string): string | null =>
    ROSTER.find((p) => p.display_name.split(" ")[0]!.toLowerCase() === n.toLowerCase())?.entity_id ?? null;

  it("parses the founder correction into a structured org-scoped correction", () => {
    const c = buildDisambiguationCorrection({
      orgEntityId: "org-1",
      feedbackText: "Shweta is marketing and was not supposed to be included. This should have been Shiney.",
      resolveName,
      workDomain: "engineering",
    });
    expect(c).not.toBeNull();
    expect(c!.exclude_entity_ids).toContain("e-shweta"); // the wrong person
    expect(c!.correct_entity_id).toBe("e-shiney"); // the right person
    expect(c!.aliases).toContain("shiney");
    expect(c!.org_entity_id).toBe("org-1");
  });

  it("never applies a correction across tenants", () => {
    const c = buildDisambiguationCorrection({
      orgEntityId: "org-1",
      feedbackText: "Shweta was not supposed to be included. This should have been Shiney.",
      resolveName,
      workDomain: "engineering",
    })!;
    const ctx = correctionsForContext([c], "org-2", "engineering"); // different org
    expect(ctx.excludeEntityIds.size).toBe(0); // not applied cross-tenant
    const same = correctionsForContext([c], "org-1", "engineering");
    expect(same.excludeEntityIds.has("e-shweta")).toBe(true);
  });

  it("after correction, the gate HARD-excludes Shweta even if otherwise matched", () => {
    const c = buildDisambiguationCorrection({
      orgEntityId: "org-1",
      feedbackText: "Shweta is marketing and was not supposed to be included. This should have been Shiney.",
      resolveName,
      workDomain: "engineering",
    })!;
    const ctx = correctionsForContext([c], "org-1", "engineering");
    const g = classifyRecipient({
      // Even if Shweta were somehow a participant, the correction excludes her.
      target: { entity_id: "e-shweta", display_name: "Shweta Rao", email: "shweta@x.com", role: "Marketing Manager" },
      sourceExcerpt: "ship the integration",
      transcriptText: "Shweta, ship the integration.", // contrived: even named
      roster: ROSTER,
      participantEntityIds: new Set(["e-shweta"]),
      workDomain: "engineering",
      policyStatus: "allowed",
      excludeEntityIds: ctx.excludeEntityIds,
    });
    expect(g.recipientSafety).toBe("out_of_scope");
    expect(g.autonomyEligibility).toBe("blocked");
  });
});

// ── [LEARN-LOOP] Deriving classifier inputs from resolved follow-ups ────────
// The BUG C rows ARE the correction store: these tests lock the deterministic
// parse (details -> decision) and aggregation (decisions -> classifier inputs).

import {
  derivePriorRecipientDecisions,
  resolvedDecisionFromFollowUpDetails,
} from "@niov/api";

function followUpDetails(args: {
  entityId: string | null;
  displayName: string;
  source: string;
  safety: string;
  alternatives?: string[];
}): unknown {
  return {
    follow_up: {
      local_id: "x",
      draft_text: "d",
      recipient_governance: {
        entity_id: args.entityId,
        display_name: args.displayName,
        recipientSafety: args.safety,
        evidence: {
          quote: null,
          source: args.source,
          matchedToken: null,
          alternativeCandidates: args.alternatives ?? [],
        },
      },
    },
  };
}

describe("[LEARN-LOOP] resolvedDecisionFromFollowUpDetails", () => {
  it("parses a caller-resolved SELECT row (alternatives preserved)", () => {
    const d = resolvedDecisionFromFollowUpDetails(
      followUpDetails({
        entityId: "e-priya-eng",
        displayName: "Priya Nair",
        source: "caller_confirmed",
        safety: "confirmed",
        alternatives: ["Priya Menon"],
      }),
    );
    expect(d).toEqual({
      entity_id: "e-priya-eng",
      display_name: "Priya Nair",
      alternative_names: ["Priya Menon"],
      evidence_source: "caller_confirmed",
      recipient_safety: "confirmed",
    });
  });

  it("rejects rows that are NOT caller-resolved decisions", () => {
    // Otzar-verified rows are not human corrections.
    expect(
      resolvedDecisionFromFollowUpDetails(
        followUpDetails({ entityId: "e-a", displayName: "A B", source: "explicit_mention", safety: "confirmed" }),
      ),
    ).toBeNull();
    // Unresolved reviews are not decisions.
    expect(
      resolvedDecisionFromFollowUpDetails(
        followUpDetails({ entityId: "e-a", displayName: "A B", source: "caller_confirmed", safety: "ambiguous" }),
      ),
    ).toBeNull();
    // Stable ids only — a decision without an entity_id is not usable.
    expect(
      resolvedDecisionFromFollowUpDetails(
        followUpDetails({ entityId: null, displayName: "A B", source: "caller_confirmed", safety: "confirmed" }),
      ),
    ).toBeNull();
  });

  it("never throws on malformed payloads", () => {
    for (const bad of [null, 7, "x", {}, { follow_up: null }, { follow_up: { recipient_governance: 3 } }]) {
      expect(resolvedDecisionFromFollowUpDetails(bad)).toBeNull();
    }
  });
});

describe("[LEARN-LOOP] derivePriorRecipientDecisions", () => {
  const select = (entityId: string, displayName: string, alternatives: string[]) => ({
    entity_id: entityId,
    display_name: displayName,
    alternative_names: alternatives,
    evidence_source: "caller_confirmed",
    recipient_safety: "confirmed",
  });
  const confirm = (entityId: string) => ({
    entity_id: entityId,
    display_name: "Someone Vouched",
    alternative_names: [],
    evidence_source: "caller_confirmed",
    recipient_safety: "confirmed",
  });

  it("selects map the COLLISION token (shared with every alternative) to the chosen stable entity", () => {
    const p = derivePriorRecipientDecisions([select("e-priya-eng", "Priya Nair", ["Priya Menon"])]);
    expect(p.selectionsByToken.get("priya")).toBe("e-priya-eng");
    // The distinguishing surname is NOT a collision token.
    expect(p.selectionsByToken.has("nair")).toBe(false);
    // A select is NOT a scope vouch — choosing between same-named people says
    // nothing about work-scope connection.
    expect(p.confirmedEntityIds.size).toBe(0);
  });

  it("conflicting selections drop the token entirely — humans disagreed, ambiguity stays", () => {
    const p = derivePriorRecipientDecisions([
      select("e-priya-eng", "Priya Nair", ["Priya Menon"]),
      select("e-priya-mkt", "Priya Menon", ["Priya Nair"]),
    ]);
    expect(p.selectionsByToken.has("priya")).toBe(false);
  });

  it("confirms populate the vouched-entity set", () => {
    const p = derivePriorRecipientDecisions([confirm("e-shweta")]);
    expect(p.confirmedEntityIds.has("e-shweta")).toBe(true);
    expect(p.selectionsByToken.size).toBe(0);
  });

  it("single-character tokens are dropped (no one-letter aliases)", () => {
    const p = derivePriorRecipientDecisions([select("e-x", "X A", ["X B"])]);
    expect(p.selectionsByToken.size).toBe(0);
  });
});
