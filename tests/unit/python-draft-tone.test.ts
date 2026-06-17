// FILE: python-draft-tone.test.ts (unit)
// PURPOSE: Phase 1285-Y — lock the bounded, honest draft-tone client:
//          closed-vocab validation (tone_label / risk_flags / confidence), score
//          clamping, NOT_CONFIGURED when no URL, JOB_FAILED on non-2xx, TIMEOUT
//          on abort, UNHEALTHY on throw. Never throws. Empty draft =>
//          INVALID_RESPONSE (no call).
// CONNECTS TO: apps/api/src/services/intelligence/python-draft-tone.service.ts

import { describe, expect, it } from "vitest";
import {
  validateDraftToneResponse,
  evaluateDraftTonePython,
} from "../../apps/api/src/services/intelligence/python-draft-tone.service.js";

function body(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    quality_score: 82,
    tone_label: "WARM",
    risk_flags: ["EM_DASH"],
    suggested_revision: "Hi Sam, could you review the checklist? Thanks.",
    reason: "Reads clearly.",
    confidence: "MEDIUM",
    approval_required: false,
    preserves_intent: true,
    provider_mode: "PYTHON",
    ...over,
  };
}

describe("validateDraftToneResponse", () => {
  it("accepts closed-vocab, clamps score, caps reason/revision, filters bad flags", () => {
    const r = validateDraftToneResponse(body({ quality_score: 142, reason: "x".repeat(400), risk_flags: ["EM_DASH", "NONSENSE"] }));
    expect(r).not.toBeNull();
    expect(r!.status).toBe("PYTHON_ENRICHED");
    expect(r!.assessment!.quality_score).toBe(100);
    expect(r!.assessment!.reason.length).toBe(300);
    expect(r!.assessment!.risk_flags).toEqual(["EM_DASH"]); // NONSENSE dropped
  });
  it("rejects drift (bad tone_label / empty revision / bad confidence / non-boolean)", () => {
    expect(validateDraftToneResponse(body({ tone_label: "SASSY" }))).toBeNull();
    expect(validateDraftToneResponse(body({ suggested_revision: "" }))).toBeNull();
    expect(validateDraftToneResponse(body({ confidence: "MEH" }))).toBeNull();
    expect(validateDraftToneResponse(body({ approval_required: "yes" }))).toBeNull();
    expect(validateDraftToneResponse({ nope: true })).toBeNull();
  });
});

describe("evaluateDraftTonePython — honest, never throws", () => {
  const draft = { draft_text: "review this", channel: "internal_message" as const };
  it("INVALID_RESPONSE on empty draft (no call made)", async () => {
    expect((await evaluateDraftTonePython({ draft_text: "   ", channel: "internal_message" }, { pythonUrl: "http://x" })).status).toBe("PYTHON_INVALID_RESPONSE");
  });
  it("NOT_CONFIGURED when no Python URL", async () => {
    const r = await evaluateDraftTonePython(draft, { pythonUrl: null });
    expect(r.status).toBe("PYTHON_NOT_CONFIGURED");
    expect(r.assessment).toBe(null);
  });
  it("JOB_FAILED on non-2xx", async () => {
    const fetchImpl = (async () => new Response("no", { status: 503 })) as unknown as typeof fetch;
    expect((await evaluateDraftTonePython(draft, { pythonUrl: "http://x", fetchImpl })).status).toBe("PYTHON_JOB_FAILED");
  });
  it("TIMEOUT on abort, UNHEALTHY on generic throw", async () => {
    const abort = (async () => { const e = new Error("a"); e.name = "AbortError"; throw e; }) as unknown as typeof fetch;
    expect((await evaluateDraftTonePython(draft, { pythonUrl: "http://x", fetchImpl: abort })).status).toBe("PYTHON_TIMEOUT");
    const boom = (async () => { throw new Error("c"); }) as unknown as typeof fetch;
    expect((await evaluateDraftTonePython(draft, { pythonUrl: "http://x", fetchImpl: boom })).status).toBe("PYTHON_UNHEALTHY");
  });
  it("enriches from a healthy worker response", async () => {
    const fetchImpl = (async () => new Response(JSON.stringify(body()), { status: 200, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
    const r = await evaluateDraftTonePython(draft, { pythonUrl: "http://x", fetchImpl });
    expect(r.status).toBe("PYTHON_ENRICHED");
    expect(r.assessment!.tone_label).toBe("WARM");
  });
});
