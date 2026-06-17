// FILE: python-rerank.test.ts (unit)
// PURPOSE: Phase 1285-W — lock the bounded, honest semantic-rerank client:
//          closed-vocab validation, NOT_CONFIGURED when no URL, JOB_FAILED on
//          non-2xx, TIMEOUT on abort, UNHEALTHY on throw, and a reason length
//          cap. Never throws. Nothing to rank => INVALID_RESPONSE (no call).
// CONNECTS TO: apps/api/src/services/intelligence/python-rerank.service.ts

import { describe, expect, it } from "vitest";
import {
  validateRerankResponse,
  rerankCandidates,
  type SemanticRerankPayloadCandidate,
} from "../../apps/api/src/services/intelligence/python-rerank.service.js";

const CANDS: SemanticRerankPayloadCandidate[] = [
  { candidate_id: "led-1", candidate_type: "DECISION", title: "Onboarding copy", summary: "We decided.", related_people: ["Sam"] },
];

describe("validateRerankResponse", () => {
  it("accepts a closed-vocab response and caps the reason length", () => {
    const r = validateRerankResponse({
      ranked_candidates: [{ candidate_id: "led-1", score: 9, reason: "x".repeat(400) }],
      provider_mode: "PYTHON",
    });
    expect(r).not.toBeNull();
    expect(r!.status).toBe("PYTHON_ENRICHED");
    expect(r!.ranked[0]!.reason.length).toBe(160);
  });
  it("rejects a drifting shape (missing id / non-number score / blank reason)", () => {
    expect(validateRerankResponse({ ranked_candidates: [{ score: 1, reason: "r" }] })).toBeNull();
    expect(validateRerankResponse({ ranked_candidates: [{ candidate_id: "a", score: "9", reason: "r" }] })).toBeNull();
    expect(validateRerankResponse({ ranked_candidates: [{ candidate_id: "a", score: 1, reason: "" }] })).toBeNull();
    expect(validateRerankResponse({ nope: true })).toBeNull();
  });
});

describe("rerankCandidates — honest, never throws", () => {
  it("INVALID_RESPONSE on empty query or empty candidate set (no call made)", async () => {
    expect((await rerankCandidates({ query: "   ", candidates: CANDS }, { pythonUrl: "http://x" })).status).toBe("PYTHON_INVALID_RESPONSE");
    expect((await rerankCandidates({ query: "hi", candidates: [] }, { pythonUrl: "http://x" })).status).toBe("PYTHON_INVALID_RESPONSE");
  });
  it("NOT_CONFIGURED when no Python URL", async () => {
    const r = await rerankCandidates({ query: "hi", candidates: CANDS }, { pythonUrl: null });
    expect(r.status).toBe("PYTHON_NOT_CONFIGURED");
    expect(r.ranked).toEqual([]);
  });
  it("JOB_FAILED on non-2xx", async () => {
    const fetchImpl = (async () => new Response("nope", { status: 503 })) as unknown as typeof fetch;
    const r = await rerankCandidates({ query: "hi", candidates: CANDS }, { pythonUrl: "http://x", fetchImpl });
    expect(r.status).toBe("PYTHON_JOB_FAILED");
  });
  it("TIMEOUT on abort, UNHEALTHY on generic throw", async () => {
    const abort = (async () => { const e = new Error("aborted"); e.name = "AbortError"; throw e; }) as unknown as typeof fetch;
    expect((await rerankCandidates({ query: "hi", candidates: CANDS }, { pythonUrl: "http://x", fetchImpl: abort })).status).toBe("PYTHON_TIMEOUT");
    const boom = (async () => { throw new Error("connrefused"); }) as unknown as typeof fetch;
    expect((await rerankCandidates({ query: "hi", candidates: CANDS }, { pythonUrl: "http://x", fetchImpl: boom })).status).toBe("PYTHON_UNHEALTHY");
  });
  it("enriches from a healthy worker response", async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({ ranked_candidates: [{ candidate_id: "led-1", score: 9, reason: "Matched query terms in the title" }], provider_mode: "PYTHON" }),
        { status: 200, headers: { "content-type": "application/json" } },
      )) as unknown as typeof fetch;
    const r = await rerankCandidates({ query: "onboarding", candidates: CANDS }, { pythonUrl: "http://x", fetchImpl });
    expect(r.status).toBe("PYTHON_ENRICHED");
    expect(r.ranked.length).toBe(1);
    expect(r.ranked[0]!.candidate_id).toBe("led-1");
  });
  it("INVALID_RESPONSE when the worker drifts (200 but bad shape)", async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ junk: 1 }), { status: 200, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
    const r = await rerankCandidates({ query: "hi", candidates: CANDS }, { pythonUrl: "http://x", fetchImpl });
    expect(r.status).toBe("PYTHON_INVALID_RESPONSE");
  });
});
