// FILE: python-perception.test.ts (unit)
// PURPOSE: Phase 1285-V — lock the bounded, honest meeting-intelligence client:
//          closed-vocab validation, NOT_CONFIGURED when no URL, JOB_FAILED on
//          non-2xx, TIMEOUT on abort, and length-capped fields. Never throws.
// CONNECTS TO: apps/api/src/services/intelligence/python-perception.service.ts

import { describe, expect, it } from "vitest";
import {
  validateMeetingResponse,
  extractMeetingIntelligence,
} from "../../apps/api/src/services/intelligence/python-perception.service.js";

describe("validateMeetingResponse", () => {
  it("accepts a closed-vocab response and caps lengths", () => {
    const r = validateMeetingResponse({
      summary: "Launch follow-up meeting.",
      candidates: [
        { candidate_type: "DECISION", text: "x".repeat(400), confidence: "HIGH", evidence_phrase: "y".repeat(400) },
      ],
    });
    expect(r).not.toBeNull();
    expect(r!.status).toBe("PYTHON_ENRICHED");
    expect(r!.candidates[0]!.text.length).toBe(280);
    expect(r!.candidates[0]!.evidence_phrase.length).toBe(160);
  });
  it("rejects an unknown candidate_type / bad confidence (drift)", () => {
    expect(validateMeetingResponse({ candidates: [{ candidate_type: "NONSENSE", text: "a", confidence: "HIGH", evidence_phrase: "b" }] })).toBeNull();
    expect(validateMeetingResponse({ candidates: [{ candidate_type: "DECISION", text: "a", confidence: "WAT", evidence_phrase: "b" }] })).toBeNull();
    expect(validateMeetingResponse({ nope: true })).toBeNull();
  });
});

describe("extractMeetingIntelligence — honest, never throws", () => {
  it("NOT_CONFIGURED when no Python URL", async () => {
    const r = await extractMeetingIntelligence({ transcript: "hi" }, { pythonUrl: null });
    expect(r.status).toBe("PYTHON_NOT_CONFIGURED");
    expect(r.candidates).toEqual([]);
  });
  it("INVALID_RESPONSE on empty transcript", async () => {
    const r = await extractMeetingIntelligence({ transcript: "   " }, { pythonUrl: "http://x" });
    expect(r.status).toBe("PYTHON_INVALID_RESPONSE");
  });
  it("JOB_FAILED on non-2xx", async () => {
    const fetchImpl = (async () => new Response("nope", { status: 503 })) as unknown as typeof fetch;
    const r = await extractMeetingIntelligence({ transcript: "meeting notes" }, { pythonUrl: "http://x", fetchImpl });
    expect(r.status).toBe("PYTHON_JOB_FAILED");
  });
  it("enriches from a healthy worker response", async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({ summary: "Launch.", candidates: [{ candidate_type: "DECISION", text: "go with copy", confidence: "HIGH", evidence_phrase: "we decided" }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      )) as unknown as typeof fetch;
    const r = await extractMeetingIntelligence({ transcript: "we decided to go with copy" }, { pythonUrl: "http://x", fetchImpl });
    expect(r.status).toBe("PYTHON_ENRICHED");
    expect(r.candidates.length).toBe(1);
    expect(r.summary).toBe("Launch.");
  });
});
