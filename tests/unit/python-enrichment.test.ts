// FILE: python-enrichment.test.ts (unit)
// PURPOSE: Phase 1282 — lock the advisory Python conversation-to-work
//          enrichment client. PYTHON_ENRICHED only on a proven, closed-vocab
//          2xx; honest named status otherwise; never throws; validator
//          rejects contract drift.
// CONNECTS TO: apps/api/src/services/intelligence/python-enrichment.service.ts

import { describe, expect, it } from "vitest";
import {
  extractWorkSignals,
  validatePythonEnrichmentResponse,
} from "../../apps/api/src/services/intelligence/python-enrichment.service.js";

function okFetch(body: unknown): typeof fetch {
  return (async () => ({
    ok: true,
    status: 200,
    json: async () => body,
  })) as unknown as typeof fetch;
}

const GOOD_BODY = {
  signals: [
    { signal_type: "FOLLOW_UP", confidence: "MEDIUM", evidence_phrase: "follow up" },
    { signal_type: "COMMITMENT", confidence: "HIGH", evidence_phrase: "i'll" },
  ],
  primary_signal: "COMMITMENT",
  multi_intent: true,
  provider_mode: "PYTHON",
};

describe("extractWorkSignals", () => {
  it("PYTHON_NOT_CONFIGURED when no URL", async () => {
    const r = await extractWorkSignals({ text: "I'll follow up" }, { pythonUrl: null });
    expect(r.status).toBe("PYTHON_NOT_CONFIGURED");
    expect(r.signals).toEqual([]);
  });

  it("PYTHON_INVALID_RESPONSE on empty text (no call)", async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return { ok: true } as Response;
    }) as unknown as typeof fetch;
    const r = await extractWorkSignals({ text: "   " }, { pythonUrl: "http://p", fetchImpl });
    expect(r.status).toBe("PYTHON_INVALID_RESPONSE");
    expect(called).toBe(false);
  });

  it("PYTHON_ENRICHED on a proven, closed-vocab 2xx", async () => {
    const r = await extractWorkSignals(
      { text: "I'll follow up" },
      { pythonUrl: "http://p", fetchImpl: okFetch(GOOD_BODY) },
    );
    expect(r.status).toBe("PYTHON_ENRICHED");
    expect(r.signals).toHaveLength(2);
    expect(r.primary_signal).toBe("COMMITMENT");
    expect(r.multi_intent).toBe(true);
  });

  it("PYTHON_JOB_FAILED on a non-2xx", async () => {
    const fetchImpl = (async () => ({ ok: false, status: 500 })) as unknown as typeof fetch;
    const r = await extractWorkSignals({ text: "x" }, { pythonUrl: "http://p", fetchImpl });
    expect(r.status).toBe("PYTHON_JOB_FAILED");
  });

  it("PYTHON_TIMEOUT on an abort", async () => {
    const fetchImpl = (async () => {
      const e = new Error("aborted");
      e.name = "AbortError";
      throw e;
    }) as unknown as typeof fetch;
    const r = await extractWorkSignals({ text: "x" }, { pythonUrl: "http://p", fetchImpl });
    expect(r.status).toBe("PYTHON_TIMEOUT");
  });

  it("PYTHON_UNHEALTHY on a thrown fetch", async () => {
    const fetchImpl = (async () => {
      throw new Error("refused");
    }) as unknown as typeof fetch;
    const r = await extractWorkSignals({ text: "x" }, { pythonUrl: "http://p", fetchImpl });
    expect(r.status).toBe("PYTHON_UNHEALTHY");
  });

  it("PYTHON_INVALID_RESPONSE when a signal type drifts", async () => {
    const r = await extractWorkSignals(
      { text: "x" },
      {
        pythonUrl: "http://p",
        fetchImpl: okFetch({ signals: [{ signal_type: "ROGUE", confidence: "HIGH", evidence_phrase: "x" }] }),
      },
    );
    expect(r.status).toBe("PYTHON_INVALID_RESPONSE");
  });
});

describe("validatePythonEnrichmentResponse", () => {
  it("accepts a well-formed body", () => {
    expect(validatePythonEnrichmentResponse(GOOD_BODY)?.status).toBe("PYTHON_ENRICHED");
  });
  it("rejects a non-array signals field", () => {
    expect(validatePythonEnrichmentResponse({ signals: "nope" })).toBeNull();
  });
  it("rejects a bad confidence", () => {
    expect(
      validatePythonEnrichmentResponse({
        signals: [{ signal_type: "TASK", confidence: "MAYBE", evidence_phrase: "x" }],
      }),
    ).toBeNull();
  });
  it("rejects a drifted primary_signal", () => {
    expect(
      validatePythonEnrichmentResponse({ signals: [], primary_signal: "ROGUE" }),
    ).toBeNull();
  });
});
