// FILE: work-graph-sourcetype-extensibility.test.ts (unit, no DB)
// PURPOSE: B3 — prove the generic evidence model can represent FUTURE sourceTypes
//          (chat / email / calendar / ticket / pr / commit / approval / ...)
//          without redesign, and that they reconcile against transcript evidence.
//          No connectors are built — only the shape is proven extensible.
// CONNECTS TO: services/otzar/work-graph-evidence.ts.

import { describe, expect, it } from "vitest";
import {
  reconcileEvidence,
  relationDurability,
  type EvidenceEvent,
  type EvidenceSourceType,
} from "@niov/api";

const T0 = "2026-06-29T23:00:00.000Z";

function ev(sourceType: EvidenceSourceType, sourceSystem: string, sourceId: string): EvidenceEvent {
  return {
    sourceType,
    sourceId,
    sourceSystem,
    evidencePointer: `${sourceType}:${sourceId}`,
    evidenceExcerpt: null,
    sourceTimestamp: T0,
    extractedAt: T0,
    subjectEntityId: "e-shiney",
    subjectName: "Shiney",
    relation: "integration_owner",
    workItem: "yc demo integration",
    confidence: "medium",
    scope: "project",
    sensitivity: "internal",
    allowedViewers: [],
    allowedActors: [],
    policyStatus: "unknown",
    recency: T0,
    expiresAt: null,
    revalidateAfter: null,
    correctionState: "none",
    durability: relationDurability("integration_owner"),
  };
}

describe("future sourceTypes are representable without redesign", () => {
  // Every reserved sourceType the doctrine names (no connectors built yet).
  const FUTURE: EvidenceSourceType[] = [
    "chat", "email", "doc", "ticket", "pr", "commit", "deployment",
    "calendar", "approval", "admin_assignment", "role_template",
    "work_ledger", "ai_twin_interaction", "voice_command", "manual_input",
  ];

  it("each future sourceType produces a valid evidence event + edge", () => {
    for (const st of FUTURE) {
      const edges = reconcileEvidence([ev(st, st, `${st}-1`)]);
      expect(edges).toHaveLength(1);
      expect(edges[0]!.evidence[0]!.sourceType).toBe(st);
    }
  });

  it("a transcript edge is corroborated by a chat + a ticket (cross-source agreement)", () => {
    const edges = reconcileEvidence([
      ev("transcript", "otzar-comms", "t1"),
      ev("chat", "slack", "c1"),
      ev("ticket", "jira", "JIRA-1"),
    ]);
    expect(edges).toHaveLength(1);
    expect(edges[0]!.sourceCount).toBe(3);
    expect(edges[0]!.confidence).toBe("high"); // corroborated across sources
  });
});
