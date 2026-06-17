// FILE: operational-analytics.test.ts (unit)
// PURPOSE: Phase 1285-Z — lock the operational-health analysis contract over an
//          assembled snapshot (DB assembly is integration-tested separately):
//            - deterministic health with NO Python (honest envelope)
//            - health_score / execution_status / counts are ALWAYS deterministic
//              (never depend on Python)
//            - Python unavailability/failure degrade to NAMED statuses + keep the
//              deterministic narrative (no flow blocks)
//            - a clean Python narrative is FOUNDATION_VALIDATED
//            - Python cannot introduce an unknown person (dropped)
//            - a UUID leak in the narrative DOWNGRADES (deterministic surfaces)
//            - no raw UUID primary labels; nothing created/sent
// CONNECTS TO: apps/api/src/services/work-os/operational-analytics.service.ts

import { describe, expect, it } from "vitest";
import {
  analyzeSnapshot,
  __internals,
  type HealthSnapshot,
} from "../../apps/api/src/services/work-os/operational-analytics.service.js";

const NOW = "2026-06-17T12:00:00.000Z";

const SNAPSHOT: HealthSnapshot = {
  scope: "team",
  metrics: {
    total_work: 12,
    overdue_count: 2,
    blocked_count: 3,
    waiting_on_count: 1,
    no_next_action_count: 1,
    high_risk_count: 2,
    critical_risk_count: 1,
    recent_completed_count: 4,
    recent_failed_count: 1,
  },
  stale_work_count: 2,
  top_items: [
    { item_id: "UNRESOLVED_BLOCKER:1", item_type: "UNRESOLVED_BLOCKER", title: "Compliance blocker", severity: "CRITICAL", risk_score: 90, related_people: ["Vishesh Patel"] },
    { item_id: "OVERDUE_WORK:2", item_type: "OVERDUE_WORK", title: "Launch checklist", severity: "HIGH", risk_score: 70, related_people: ["Vishesh Patel"] },
    { item_id: "NO_NEXT_ACTION:3", item_type: "NO_NEXT_ACTION", title: "Vendor intro", severity: "LOW", risk_score: 22, related_people: ["Annie Wu"] },
  ],
  known_people: ["Vishesh Patel", "Annie Wu"],
};

function pyOk(over: Record<string, unknown> = {}): typeof fetch {
  const body = {
    health_score: 5, // deliberately absurd — Foundation must IGNORE this number
    execution_status: "HEALTHY", // also ignored for the surfaced status
    summary: "Team is under pressure with several blockers.",
    top_risks: ["Compliance blocker (CRITICAL)"],
    recurring_blockers: ["Compliance blocker"],
    overloaded_people: ["Vishesh Patel"],
    suggested_focus: ["Compliance blocker"],
    recommended_next_actions: ["Clear the blockers first."],
    confidence: "HIGH",
    human_review_needed: true,
    provider_mode: "PYTHON",
    ...over,
  };
  return (async () => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
}

describe("analyzeSnapshot — deterministic primary (no Python)", () => {
  it("computes health deterministically and is honest about Python absence", async () => {
    const { health, envelope } = await analyzeSnapshot({ snapshot: SNAPSHOT, runtime: { pythonUrl: null }, nowIso: NOW });
    expect(envelope.capability).toBe("OPERATIONAL_ANALYTICS");
    expect(envelope.status).toBe("NOT_CONFIGURED");
    expect(envelope.authority).toBe(null);
    expect(health.provenance).toBe("foundation:deterministic-analytics");
    // Deterministic score: 100 - 3*8 - 2*5 - 1*10 - 2*4 - 1*2 - 1*2 - 1*5 = 39 => AT_RISK
    expect(health.health_score).toBe(39);
    expect(health.execution_status).toBe("AT_RISK");
    expect(health.blocked_count).toBe(3);
    expect(health.stale_work_count).toBe(2);
    expect(health.human_review_needed).toBe(true);
    expect(health.overloaded_people).toEqual(["Vishesh Patel"]); // appears twice
  });

  it("degrades to NAMED statuses but keeps the deterministic narrative + numbers", async () => {
    const boom = (async () => { throw new Error("c"); }) as unknown as typeof fetch;
    const r = await analyzeSnapshot({ snapshot: SNAPSHOT, runtime: { pythonUrl: "http://x", fetchImpl: boom }, nowIso: NOW });
    expect(r.envelope.status).toBe("UNHEALTHY");
    expect(r.health.provenance).toBe("foundation:deterministic-analytics");
    expect(r.health.health_score).toBe(39);
  });
});

describe("analyzeSnapshot — advisory Python narrative (validated)", () => {
  it("uses the Python narrative but the deterministic numbers regardless", async () => {
    const { health, envelope } = await analyzeSnapshot({ snapshot: SNAPSHOT, runtime: { pythonUrl: "http://x", fetchImpl: pyOk() }, nowIso: NOW });
    expect(envelope.status).toBe("PYTHON_ENRICHED");
    expect(envelope.authority).toBe("FOUNDATION_VALIDATED");
    expect(health.provenance).toBe("python:operational-analytics");
    expect(health.summary).toContain("under pressure"); // python narrative
    // Foundation IGNORED Python's absurd health_score=5 and HEALTHY status.
    expect(health.health_score).toBe(39);
    expect(health.execution_status).toBe("AT_RISK");
  });

  it("drops an unknown person Python invented", async () => {
    const { health } = await analyzeSnapshot({ snapshot: SNAPSHOT, runtime: { pythonUrl: "http://x", fetchImpl: pyOk({ overloaded_people: ["Vishesh Patel", "Ghost Person"] }) }, nowIso: NOW });
    expect(health.overloaded_people).toEqual(["Vishesh Patel"]);
    expect(health.overloaded_people).not.toContain("Ghost Person");
  });

  it("a UUID leak in the narrative DOWNGRADES; deterministic narrative surfaces", async () => {
    const { health, envelope } = await analyzeSnapshot({ snapshot: SNAPSHOT, runtime: { pythonUrl: "http://x", fetchImpl: pyOk({ top_risks: ["see 11111111-2222-3333-4444-555555555555"] }) }, nowIso: NOW });
    expect(envelope.status).toBe("FOUNDATION_DOWNGRADED");
    expect(envelope.authority).toBe(null);
    expect(health.provenance).toBe("foundation:deterministic-analytics");
    expect(health.health_score).toBe(39); // numbers unaffected
  });
});

describe("__internals — deterministic primitives", () => {
  it("healthScore + statusFor map as expected", () => {
    expect(__internals.statusFor(90)).toBe("HEALTHY");
    expect(__internals.statusFor(65)).toBe("WATCH");
    expect(__internals.statusFor(40)).toBe("AT_RISK");
    expect(__internals.statusFor(10)).toBe("CRITICAL");
    expect(__internals.healthScore(SNAPSHOT.metrics)).toBe(39);
  });
  it("deterministicNarrative names risks/people only from the snapshot", () => {
    const n = __internals.deterministicNarrative(SNAPSHOT);
    expect(n.top_risks.some((r) => r.includes("Compliance blocker"))).toBe(true);
    expect(n.recurring_blockers).toContain("Compliance blocker");
    expect(n.overloaded_people).toEqual(["Vishesh Patel"]);
    expect(n.top_risks.every((r) => !r.includes("Vendor intro"))).toBe(true); // low severity excluded
  });
});
