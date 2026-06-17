// FILE: python-intelligence.test.ts (unit)
// PURPOSE: Phase 1285-U — lock the general Python advisory-intelligence
//          contract: the envelope shape, the honest status mapping, Foundation
//          validation (advisory acceptance only), and the extraction-upgrade
//          gate. Pure functions; no I/O.
// CONNECTS TO: apps/api/src/services/intelligence/python-intelligence.ts

import { describe, expect, it } from "vitest";
import {
  pendingEnvelope,
  buildWorkSignalEnvelope,
  validateAdvisoryEnvelope,
  envelopeUpgradesExtraction,
} from "../../apps/api/src/services/intelligence/python-intelligence.js";
import type { WorkSignalExtractionResult } from "../../apps/api/src/services/intelligence/python-enrichment.service.js";

const NOW = "2026-06-17T12:00:00.000Z";

function extraction(over: Partial<WorkSignalExtractionResult> = {}): WorkSignalExtractionResult {
  return {
    status: "PYTHON_ENRICHED",
    signals: [{ signal_type: "TASK", confidence: "HIGH", evidence_phrase: "review the flow" }],
    primary_signal: "TASK",
    multi_intent: false,
    ...over,
  };
}

describe("pendingEnvelope", () => {
  it("is a PYTHON_ADVISORY envelope marked PENDING with no authority", () => {
    const e = pendingEnvelope("WORK_SIGNAL_EXTRACTION", NOW);
    expect(e.status).toBe("PENDING");
    expect(e.source).toBe("PYTHON_ADVISORY");
    expect(e.authority).toBe(null);
    expect(e.capability).toBe("WORK_SIGNAL_EXTRACTION");
    expect(e.candidates).toEqual([]);
  });
});

describe("buildWorkSignalEnvelope — honest status mapping", () => {
  it("PYTHON_ENRICHED with signals stays PYTHON_ENRICHED + carries candidates/latency", () => {
    const e = buildWorkSignalEnvelope(extraction(), 42, NOW);
    expect(e.status).toBe("PYTHON_ENRICHED");
    expect(e.candidates.length).toBe(1);
    expect(e.latency_ms).toBe(42);
    expect(e.source).toBe("PYTHON_ADVISORY");
    expect(e.reasoning_summary).toBe(null); // never raw chain-of-thought
    expect(e.error_code).toBe(null);
  });
  it("200 with no signals is NO_SIGNAL (not enrichment)", () => {
    expect(buildWorkSignalEnvelope(extraction({ status: "PYTHON_ENRICHED", signals: [] }), 5, NOW).status).toBe("NO_SIGNAL");
  });
  it("maps unavailability + failure to explicit statuses", () => {
    expect(buildWorkSignalEnvelope(extraction({ status: "PYTHON_NOT_CONFIGURED", signals: [] }), 0, NOW).status).toBe("NOT_CONFIGURED");
    expect(buildWorkSignalEnvelope(extraction({ status: "PYTHON_UNHEALTHY", signals: [] }), 0, NOW).status).toBe("UNHEALTHY");
    expect(buildWorkSignalEnvelope(extraction({ status: "PYTHON_TIMEOUT", signals: [] }), 0, NOW).status).toBe("TIMEOUT");
    expect(buildWorkSignalEnvelope(extraction({ status: "PYTHON_JOB_FAILED", signals: [] }), 0, NOW).status).toBe("ERROR");
    expect(buildWorkSignalEnvelope(extraction({ status: "PYTHON_INVALID_RESPONSE", signals: [] }), 0, NOW).status).toBe("ERROR");
  });
});

describe("validateAdvisoryEnvelope — Foundation is the authority", () => {
  it("FOUNDATION_VALIDATED only for real signal-bearing enrichment", () => {
    const e = validateAdvisoryEnvelope(buildWorkSignalEnvelope(extraction(), 10, NOW));
    expect(e.authority).toBe("FOUNDATION_VALIDATED");
  });
  it("no authority for NO_SIGNAL / unavailable / error", () => {
    for (const status of ["PYTHON_ENRICHED", "PYTHON_NOT_CONFIGURED", "PYTHON_TIMEOUT", "PYTHON_JOB_FAILED"] as const) {
      const signals = status === "PYTHON_ENRICHED" ? [] : [];
      const e = validateAdvisoryEnvelope(buildWorkSignalEnvelope(extraction({ status, signals }), 0, NOW));
      expect(e.authority).toBe(null);
    }
  });
});

describe("envelopeUpgradesExtraction — deterministic truth stays primary", () => {
  it("upgrades only when validated + enriched + caller did not pin", () => {
    const ok = validateAdvisoryEnvelope(buildWorkSignalEnvelope(extraction(), 10, NOW));
    expect(envelopeUpgradesExtraction(ok, false)).toBe(true);
    expect(envelopeUpgradesExtraction(ok, true)).toBe(false); // caller pinned
    const noSig = validateAdvisoryEnvelope(buildWorkSignalEnvelope(extraction({ signals: [] }), 0, NOW));
    expect(envelopeUpgradesExtraction(noSig, false)).toBe(false);
    expect(envelopeUpgradesExtraction(pendingEnvelope("WORK_SIGNAL_EXTRACTION", NOW), false)).toBe(false);
  });
});
