// FILE: python-analytics.test.ts (unit)
// PURPOSE: Phase 1285-Z — lock the bounded, honest operational-analytics client:
//          closed-vocab validation (execution_status / confidence), score
//          clamping, list caps, NOT_CONFIGURED when no URL, JOB_FAILED on
//          non-2xx, TIMEOUT on abort, UNHEALTHY on throw. Never throws.
// CONNECTS TO: apps/api/src/services/intelligence/python-analytics.service.ts

import { describe, expect, it } from "vitest";
import {
  validateAnalyticsResponse,
  analyzeOperationalSnapshot,
  type OperationalSnapshotPayload,
} from "../../apps/api/src/services/intelligence/python-analytics.service.js";

const SNAP: OperationalSnapshotPayload = {
  snapshot_id: "snap-1",
  scope: "team",
  metrics: { total_work: 10, overdue_count: 1, blocked_count: 2, waiting_on_count: 1, no_next_action_count: 0, high_risk_count: 1, critical_risk_count: 1, recent_completed_count: 3, recent_failed_count: 0 },
  top_items: [{ item_id: "UNRESOLVED_BLOCKER:1", item_type: "UNRESOLVED_BLOCKER", title: "Blocker", severity: "CRITICAL", risk_score: 90, related_people: ["Sam"] }],
};

function body(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    health_score: 62,
    execution_status: "WATCH",
    summary: "All under control.",
    top_risks: ["Blocker (CRITICAL)"],
    recurring_blockers: ["Blocker"],
    overloaded_people: ["Sam"],
    suggested_focus: ["Blocker"],
    recommended_next_actions: ["Clear the blockers first."],
    confidence: "HIGH",
    human_review_needed: true,
    provider_mode: "PYTHON",
    ...over,
  };
}

describe("validateAnalyticsResponse", () => {
  it("accepts closed-vocab, clamps score, caps the summary + lists", () => {
    const r = validateAnalyticsResponse(body({ health_score: 250, summary: "x".repeat(900), top_risks: Array(40).fill("r") }));
    expect(r).not.toBeNull();
    expect(r!.analytics!.health_score).toBe(100);
    expect(r!.analytics!.summary.length).toBe(600);
    expect(r!.analytics!.top_risks.length).toBeLessThanOrEqual(20);
  });
  it("rejects drift (bad status / empty summary / bad confidence / non-boolean)", () => {
    expect(validateAnalyticsResponse(body({ execution_status: "MELTDOWN" }))).toBeNull();
    expect(validateAnalyticsResponse(body({ summary: "" }))).toBeNull();
    expect(validateAnalyticsResponse(body({ confidence: "MEH" }))).toBeNull();
    expect(validateAnalyticsResponse(body({ human_review_needed: "yes" }))).toBeNull();
    expect(validateAnalyticsResponse({ nope: true })).toBeNull();
  });
});

describe("analyzeOperationalSnapshot — honest, never throws", () => {
  it("NOT_CONFIGURED when no Python URL", async () => {
    const r = await analyzeOperationalSnapshot(SNAP, { pythonUrl: null });
    expect(r.status).toBe("PYTHON_NOT_CONFIGURED");
    expect(r.analytics).toBe(null);
  });
  it("JOB_FAILED on non-2xx", async () => {
    const fetchImpl = (async () => new Response("no", { status: 503 })) as unknown as typeof fetch;
    expect((await analyzeOperationalSnapshot(SNAP, { pythonUrl: "http://x", fetchImpl })).status).toBe("PYTHON_JOB_FAILED");
  });
  it("TIMEOUT on abort, UNHEALTHY on generic throw", async () => {
    const abort = (async () => { const e = new Error("a"); e.name = "AbortError"; throw e; }) as unknown as typeof fetch;
    expect((await analyzeOperationalSnapshot(SNAP, { pythonUrl: "http://x", fetchImpl: abort })).status).toBe("PYTHON_TIMEOUT");
    const boom = (async () => { throw new Error("c"); }) as unknown as typeof fetch;
    expect((await analyzeOperationalSnapshot(SNAP, { pythonUrl: "http://x", fetchImpl: boom })).status).toBe("PYTHON_UNHEALTHY");
  });
  it("enriches from a healthy worker response", async () => {
    const fetchImpl = (async () => new Response(JSON.stringify(body()), { status: 200, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
    const r = await analyzeOperationalSnapshot(SNAP, { pythonUrl: "http://x", fetchImpl });
    expect(r.status).toBe("PYTHON_ENRICHED");
    expect(r.analytics!.execution_status).toBe("WATCH");
  });
});
