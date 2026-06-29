// FILE: work-graph-evidence.test.ts (unit, no DB)
// PURPOSE: Lock the generic evidence-based Work Graph model: transcripts are ONE
//          sourceType; multi-source agreement raises confidence; conflicting
//          sources lower confidence, ask clarification, and block autonomy;
//          durable identity edges vs temporary work-state edges are distinguished.
// CONNECTS TO: services/otzar/work-graph-evidence.ts.

import { describe, expect, it } from "vitest";
import {
  reconcileEvidence,
  transcriptGraphToEvidence,
  relationDurability,
  buildResponsibilityGraph,
  type EvidenceEvent,
} from "@niov/api";

const T0 = "2026-06-29T18:00:00.000Z";

function ev(partial: Partial<EvidenceEvent> & Pick<EvidenceEvent, "sourceType" | "sourceId" | "sourceSystem" | "subjectName" | "relation">): EvidenceEvent {
  return {
    evidencePointer: `${partial.sourceType}:${partial.sourceId}`,
    evidenceExcerpt: null,
    sourceTimestamp: T0,
    extractedAt: T0,
    subjectEntityId: partial.subjectEntityId ?? null,
    workItem: partial.workItem ?? "yc demo integration",
    confidence: partial.confidence ?? "medium",
    scope: "project",
    sensitivity: "internal",
    allowedViewers: [],
    allowedActors: [],
    policyStatus: "unknown",
    recency: T0,
    expiresAt: null,
    revalidateAfter: null,
    correctionState: "none",
    durability: relationDurability(partial.relation),
    ...partial,
  };
}

describe("transcript is ONE sourceType in the generic model", () => {
  it("a transcript responsibility graph emits generic evidence events", () => {
    const graph = buildResponsibilityGraph(
      "David will lead this push. Shiney is going to lead the team on the integration. Samiksha will support the auth.",
    );
    const events = transcriptGraphToEvidence(graph, { sourceId: "cap-1", extractedAt: T0 });
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => e.sourceType === "transcript")).toBe(true);
    expect(events.every((e) => e.sourceSystem === "otzar-comms")).toBe(true);
    // The model carries the generic fields a future Slack/Jira connector reuses.
    const sample = events[0]!;
    expect(sample).toHaveProperty("evidencePointer");
    expect(sample).toHaveProperty("expiresAt");
    expect(sample).toHaveProperty("correctionState");
    expect(sample).toHaveProperty("allowedViewers");
  });
});

describe("multi-source reconciliation", () => {
  it("agreement across sources raises confidence and (eventually) unblocks autonomy", () => {
    // Same subject + relation + work, from transcript AND a ticket AND a PR.
    const events = [
      ev({ sourceType: "transcript", sourceId: "t1", sourceSystem: "otzar-comms", subjectName: "Shiney", subjectEntityId: "e-shiney", relation: "integration_owner", confidence: "medium" }),
      ev({ sourceType: "ticket", sourceId: "JIRA-9", sourceSystem: "jira", subjectName: "Shiney", subjectEntityId: "e-shiney", relation: "integration_owner", confidence: "medium" }),
      ev({ sourceType: "pr", sourceId: "PR-12", sourceSystem: "github", subjectName: "Shiney", subjectEntityId: "e-shiney", relation: "integration_owner", confidence: "medium" }),
    ];
    const edges = reconcileEvidence(events);
    expect(edges).toHaveLength(1);
    expect(edges[0]!.sourceCount).toBe(3);
    expect(edges[0]!.confidence).toBe("high"); // corroborated
    expect(edges[0]!.conflicting).toBe(false);
    expect(edges[0]!.autonomyBlocked).toBe(false); // multi-source temporary edge clears
  });

  it("conflicting owners lower confidence, need clarification, and block autonomy", () => {
    // Transcript says Shiney owns integration; a ticket says Samiksha owns it.
    const events = [
      ev({ sourceType: "transcript", sourceId: "t1", sourceSystem: "otzar-comms", subjectName: "Shiney", subjectEntityId: "e-shiney", relation: "integration_owner", confidence: "high" }),
      ev({ sourceType: "ticket", sourceId: "JIRA-9", sourceSystem: "jira", subjectName: "Samiksha", subjectEntityId: "e-samiksha", relation: "integration_owner", confidence: "high" }),
    ];
    const edges = reconcileEvidence(events);
    expect(edges).toHaveLength(2); // two competing claimants
    for (const e of edges) {
      expect(e.conflicting).toBe(true);
      expect(e.needsClarification).toBe(true);
      expect(e.autonomyBlocked).toBe(true);
      expect(e.confidence).toBe("low");
    }
  });

  it("a lone temporary work-state edge blocks autonomy; a durable identity edge does not", () => {
    const temp = reconcileEvidence([
      ev({ sourceType: "transcript", sourceId: "t1", sourceSystem: "otzar-comms", subjectName: "Shiney", relation: "meeting_lead", confidence: "high" }),
    ]);
    expect(temp[0]!.durability).toBe("temporary");
    expect(temp[0]!.autonomyBlocked).toBe(true); // single-source meeting assignment

    const durable = reconcileEvidence([
      ev({ sourceType: "admin_assignment", sourceId: "adm-1", sourceSystem: "otzar-admin", subjectName: "Shiney", relation: "role", workItem: null, confidence: "high" }),
    ]);
    expect(durable[0]!.durability).toBe("durable");
    expect(durable[0]!.autonomyBlocked).toBe(false); // durable identity edge
  });
});
