// FILE: python-risk.test.ts (unit)
// PURPOSE: Phase 1285-X — lock the bounded, honest risk-scoring client:
//          closed-vocab validation (severity/confidence/signal sets), score
//          clamping, NOT_CONFIGURED when no URL, JOB_FAILED on non-2xx, TIMEOUT
//          on abort, UNHEALTHY on throw. Never throws. Nothing to score =>
//          INVALID_RESPONSE (no call).
// CONNECTS TO: apps/api/src/services/intelligence/python-risk.service.ts

import { describe, expect, it } from "vitest";
import {
  validateRiskResponse,
  scoreRisk,
  type RiskScoringPayloadCandidate,
} from "../../apps/api/src/services/intelligence/python-risk.service.js";

const CANDS: RiskScoringPayloadCandidate[] = [
  { candidate_id: "OVERDUE_WORK:led-1", candidate_type: "OVERDUE_WORK", title: "Ship it", base_severity: "HIGH", overdue: true },
];

function score(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    candidate_id: "OVERDUE_WORK:led-1",
    risk_score: 85,
    severity: "CRITICAL",
    confidence: "HIGH",
    reason: "overdue; critical risk.",
    contributing_signals: ["OVERDUE", "HIGH_BASE_SEVERITY"],
    suggested_next_action: "Follow up.",
    human_review_needed: true,
    ...over,
  };
}

describe("validateRiskResponse", () => {
  it("accepts a closed-vocab response, clamps the score, caps reason/action, filters bad signals", () => {
    const r = validateRiskResponse({
      scores: [score({ risk_score: 142, reason: "x".repeat(400), suggested_next_action: "y".repeat(400), contributing_signals: ["OVERDUE", "NONSENSE"] })],
      provider_mode: "PYTHON",
    });
    expect(r).not.toBeNull();
    expect(r!.status).toBe("PYTHON_ENRICHED");
    expect(r!.scores[0]!.risk_score).toBe(100); // clamped to 100
    expect(r!.scores[0]!.reason.length).toBe(200);
    expect(r!.scores[0]!.suggested_next_action.length).toBe(160);
    expect(r!.scores[0]!.contributing_signals).toEqual(["OVERDUE"]); // NONSENSE dropped
  });
  it("rejects a drift (missing id / bad severity / bad confidence / non-boolean review)", () => {
    expect(validateRiskResponse({ scores: [score({ candidate_id: "" })] })).toBeNull();
    expect(validateRiskResponse({ scores: [score({ severity: "WAT" })] })).toBeNull();
    expect(validateRiskResponse({ scores: [score({ confidence: "MAYBE" })] })).toBeNull();
    expect(validateRiskResponse({ scores: [score({ human_review_needed: "yes" })] })).toBeNull();
    expect(validateRiskResponse({ nope: true })).toBeNull();
  });
});

describe("scoreRisk — honest, never throws", () => {
  it("INVALID_RESPONSE when there is nothing to score (no call made)", async () => {
    expect((await scoreRisk({ candidates: [] }, { pythonUrl: "http://x" })).status).toBe("PYTHON_INVALID_RESPONSE");
  });
  it("NOT_CONFIGURED when no Python URL", async () => {
    const r = await scoreRisk({ candidates: CANDS }, { pythonUrl: null });
    expect(r.status).toBe("PYTHON_NOT_CONFIGURED");
    expect(r.scores).toEqual([]);
  });
  it("JOB_FAILED on non-2xx", async () => {
    const fetchImpl = (async () => new Response("nope", { status: 503 })) as unknown as typeof fetch;
    expect((await scoreRisk({ candidates: CANDS }, { pythonUrl: "http://x", fetchImpl })).status).toBe("PYTHON_JOB_FAILED");
  });
  it("TIMEOUT on abort, UNHEALTHY on generic throw", async () => {
    const abort = (async () => { const e = new Error("a"); e.name = "AbortError"; throw e; }) as unknown as typeof fetch;
    expect((await scoreRisk({ candidates: CANDS }, { pythonUrl: "http://x", fetchImpl: abort })).status).toBe("PYTHON_TIMEOUT");
    const boom = (async () => { throw new Error("conn"); }) as unknown as typeof fetch;
    expect((await scoreRisk({ candidates: CANDS }, { pythonUrl: "http://x", fetchImpl: boom })).status).toBe("PYTHON_UNHEALTHY");
  });
  it("enriches from a healthy worker response", async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ scores: [score()], provider_mode: "PYTHON" }), { status: 200, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
    const r = await scoreRisk({ candidates: CANDS }, { pythonUrl: "http://x", fetchImpl });
    expect(r.status).toBe("PYTHON_ENRICHED");
    expect(r.scores[0]!.candidate_id).toBe("OVERDUE_WORK:led-1");
  });
});
