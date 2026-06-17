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
  buildMeetingIntelligenceEnvelope,
  validateMeetingEnvelope,
  buildSemanticRetrievalEnvelope,
  validateSemanticRetrievalEnvelope,
  buildRiskScoringEnvelope,
  validateRiskScoringEnvelope,
  buildDraftToneEnvelope,
  validateDraftToneEnvelope,
  type MeetingIntelligenceExtractionResult,
  type SemanticRerankExtractionResult,
  type RiskScoringExtractionResult,
  type DraftToneExtractionResult,
} from "../../apps/api/src/services/intelligence/python-intelligence.js";
import type { WorkSignalExtractionResult } from "../../apps/api/src/services/intelligence/python-enrichment.service.js";

function meetingResult(over: Partial<MeetingIntelligenceExtractionResult> = {}): MeetingIntelligenceExtractionResult {
  return {
    status: "PYTHON_ENRICHED",
    summary: "Launch follow-up meeting.",
    candidates: [
      { candidate_type: "DECISION", text: "We decided to go with the new copy.", confidence: "HIGH", evidence_phrase: "we decided" },
    ],
    ...over,
  };
}

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

describe("buildMeetingIntelligenceEnvelope + validateMeetingEnvelope (Phase 1285-V)", () => {
  it("builds a MEETING_INTELLIGENCE perception envelope with candidates + summary", () => {
    const e = buildMeetingIntelligenceEnvelope(meetingResult(), 30, NOW);
    expect(e.capability).toBe("MEETING_INTELLIGENCE");
    expect(e.source).toBe("PYTHON_ADVISORY");
    expect(e.status).toBe("PYTHON_ENRICHED");
    expect(e.candidates.length).toBe(1);
    expect(e.summary).toBe("Launch follow-up meeting.");
    expect(e.reasoning_summary).toBe(null); // never raw chain-of-thought
  });
  it("200 with no candidates is NO_SIGNAL; unavailability/error map explicitly", () => {
    expect(buildMeetingIntelligenceEnvelope(meetingResult({ status: "PYTHON_ENRICHED", candidates: [] }), 0, NOW).status).toBe("NO_SIGNAL");
    expect(buildMeetingIntelligenceEnvelope(meetingResult({ status: "PYTHON_NOT_CONFIGURED", candidates: [] }), 0, NOW).status).toBe("NOT_CONFIGURED");
    expect(buildMeetingIntelligenceEnvelope(meetingResult({ status: "PYTHON_TIMEOUT", candidates: [] }), 0, NOW).status).toBe("TIMEOUT");
    expect(buildMeetingIntelligenceEnvelope(meetingResult({ status: "PYTHON_JOB_FAILED", candidates: [] }), 0, NOW).status).toBe("ERROR");
  });
  it("FOUNDATION_VALIDATED when a confident candidate exists", () => {
    const e = validateMeetingEnvelope(buildMeetingIntelligenceEnvelope(meetingResult(), 10, NOW));
    expect(e.authority).toBe("FOUNDATION_VALIDATED");
  });
  it("DOWNGRADES to needs-review when ALL candidates are low-confidence", () => {
    const lowOnly = meetingResult({
      candidates: [{ candidate_type: "FOLLOW_UP", text: "maybe circle back", confidence: "LOW", evidence_phrase: "circle back" }],
    });
    const e = validateMeetingEnvelope(buildMeetingIntelligenceEnvelope(lowOnly, 10, NOW));
    expect(e.status).toBe("FOUNDATION_DOWNGRADED");
    expect(e.authority).toBe(null);
    expect(e.warnings.join(" ")).toMatch(/low-confidence/);
  });
  it("no authority for NO_SIGNAL / unavailable", () => {
    const e = validateMeetingEnvelope(buildMeetingIntelligenceEnvelope(meetingResult({ status: "PYTHON_NOT_CONFIGURED", candidates: [] }), 0, NOW));
    expect(e.authority).toBe(null);
  });
});

describe("buildSemanticRetrievalEnvelope + validateSemanticRetrievalEnvelope (Phase 1285-W)", () => {
  function rerank(over: Partial<SemanticRerankExtractionResult> = {}): SemanticRerankExtractionResult {
    return {
      status: "PYTHON_ENRICHED",
      ranked: [
        { candidate_id: "led-1", score: 9, reason: "Matched query terms in the title" },
        { candidate_id: "led-2", score: 4, reason: "Matched a related person" },
      ],
      ...over,
    };
  }

  it("builds a SEMANTIC_RETRIEVAL envelope carrying the ranked candidates", () => {
    const e = buildSemanticRetrievalEnvelope(rerank(), 12, NOW);
    expect(e.capability).toBe("SEMANTIC_RETRIEVAL");
    expect(e.source).toBe("PYTHON_ADVISORY");
    expect(e.status).toBe("PYTHON_ENRICHED");
    expect(e.candidates.length).toBe(2);
    expect(e.reasoning_summary).toBe(null); // never raw chain-of-thought
    expect(e.provenance).toBe("python:semantic-rerank");
  });

  it("200 with no ranked candidates is NO_SIGNAL; unavailability/error map explicitly", () => {
    expect(buildSemanticRetrievalEnvelope(rerank({ status: "PYTHON_ENRICHED", ranked: [] }), 0, NOW).status).toBe("NO_SIGNAL");
    expect(buildSemanticRetrievalEnvelope(rerank({ status: "PYTHON_NOT_CONFIGURED", ranked: [] }), 0, NOW).status).toBe("NOT_CONFIGURED");
    expect(buildSemanticRetrievalEnvelope(rerank({ status: "PYTHON_UNHEALTHY", ranked: [] }), 0, NOW).status).toBe("UNHEALTHY");
    expect(buildSemanticRetrievalEnvelope(rerank({ status: "PYTHON_TIMEOUT", ranked: [] }), 0, NOW).status).toBe("TIMEOUT");
    expect(buildSemanticRetrievalEnvelope(rerank({ status: "PYTHON_JOB_FAILED", ranked: [] }), 0, NOW).status).toBe("ERROR");
  });

  it("FOUNDATION_VALIDATED only over ids in the allowed set", () => {
    const e = validateSemanticRetrievalEnvelope(buildSemanticRetrievalEnvelope(rerank(), 10, NOW), new Set(["led-1", "led-2"]));
    expect(e.authority).toBe("FOUNDATION_VALIDATED");
    expect(e.candidates.length).toBe(2);
  });

  it("rejects an unknown / cross-tenant id and warns; keeps the allowed ones", () => {
    const drift = rerank({
      ranked: [
        { candidate_id: "led-1", score: 9, reason: "ok" },
        { candidate_id: "FOREIGN-TENANT-row", score: 99, reason: "drift" },
      ],
    });
    const e = validateSemanticRetrievalEnvelope(buildSemanticRetrievalEnvelope(drift, 10, NOW), new Set(["led-1"]));
    expect(e.authority).toBe("FOUNDATION_VALIDATED");
    expect(e.candidates.map((c) => (c as { candidate_id: string }).candidate_id)).toEqual(["led-1"]);
    expect(e.warnings.join(" ")).toMatch(/rejected: not in the Foundation-allowed set/);
  });

  it("DOWNGRADES when EVERY reranked id is unknown (pure drift)", () => {
    const allForeign = rerank({ ranked: [{ candidate_id: "FOREIGN", score: 99, reason: "drift" }] });
    const e = validateSemanticRetrievalEnvelope(buildSemanticRetrievalEnvelope(allForeign, 10, NOW), new Set(["led-1"]));
    expect(e.status).toBe("FOUNDATION_DOWNGRADED");
    expect(e.authority).toBe(null);
    expect(e.candidates).toEqual([]);
  });

  it("no authority for NO_SIGNAL / unavailable", () => {
    const e = validateSemanticRetrievalEnvelope(buildSemanticRetrievalEnvelope(rerank({ status: "PYTHON_NOT_CONFIGURED", ranked: [] }), 0, NOW), new Set(["led-1"]));
    expect(e.authority).toBe(null);
  });
});

describe("buildRiskScoringEnvelope + validateRiskScoringEnvelope (Phase 1285-X)", () => {
  function risk(over: Partial<RiskScoringExtractionResult> = {}): RiskScoringExtractionResult {
    return {
      status: "PYTHON_ENRICHED",
      scores: [
        { candidate_id: "OVERDUE_WORK:led-1", risk_score: 85, severity: "CRITICAL", confidence: "HIGH", reason: "overdue; critical risk.", contributing_signals: ["OVERDUE", "HIGH_BASE_SEVERITY"], suggested_next_action: "Follow up.", human_review_needed: true },
        { candidate_id: "NO_NEXT_ACTION:led-2", risk_score: 32, severity: "MEDIUM", confidence: "LOW", reason: "no next action; medium risk.", contributing_signals: ["NO_NEXT_ACTION"], suggested_next_action: "Assign owner.", human_review_needed: false },
      ],
      ...over,
    };
  }

  it("builds a RISK_SCORING envelope carrying the scored candidates", () => {
    const e = buildRiskScoringEnvelope(risk(), 14, NOW);
    expect(e.capability).toBe("RISK_SCORING");
    expect(e.source).toBe("PYTHON_ADVISORY");
    expect(e.status).toBe("PYTHON_ENRICHED");
    expect(e.candidates.length).toBe(2);
    expect(e.reasoning_summary).toBe(null); // never raw chain-of-thought
    expect(e.provenance).toBe("python:risk-scoring");
  });

  it("200 with no scores is NO_SIGNAL; unavailability/error map explicitly", () => {
    expect(buildRiskScoringEnvelope(risk({ status: "PYTHON_ENRICHED", scores: [] }), 0, NOW).status).toBe("NO_SIGNAL");
    expect(buildRiskScoringEnvelope(risk({ status: "PYTHON_NOT_CONFIGURED", scores: [] }), 0, NOW).status).toBe("NOT_CONFIGURED");
    expect(buildRiskScoringEnvelope(risk({ status: "PYTHON_UNHEALTHY", scores: [] }), 0, NOW).status).toBe("UNHEALTHY");
    expect(buildRiskScoringEnvelope(risk({ status: "PYTHON_TIMEOUT", scores: [] }), 0, NOW).status).toBe("TIMEOUT");
    expect(buildRiskScoringEnvelope(risk({ status: "PYTHON_JOB_FAILED", scores: [] }), 0, NOW).status).toBe("ERROR");
  });

  it("FOUNDATION_VALIDATED only over ids in the allowed set", () => {
    const e = validateRiskScoringEnvelope(buildRiskScoringEnvelope(risk(), 10, NOW), new Set(["OVERDUE_WORK:led-1", "NO_NEXT_ACTION:led-2"]));
    expect(e.authority).toBe("FOUNDATION_VALIDATED");
    expect(e.candidates.length).toBe(2);
  });

  it("rejects an unknown / cross-tenant id and warns; keeps the allowed ones", () => {
    const drift = risk({
      scores: [
        { candidate_id: "OVERDUE_WORK:led-1", risk_score: 85, severity: "CRITICAL", confidence: "HIGH", reason: "r", contributing_signals: ["OVERDUE"], suggested_next_action: "a", human_review_needed: true },
        { candidate_id: "FOREIGN-TENANT-finding", risk_score: 99, severity: "CRITICAL", confidence: "HIGH", reason: "drift", contributing_signals: ["BLOCKED"], suggested_next_action: "a", human_review_needed: true },
      ],
    });
    const e = validateRiskScoringEnvelope(buildRiskScoringEnvelope(drift, 10, NOW), new Set(["OVERDUE_WORK:led-1"]));
    expect(e.authority).toBe("FOUNDATION_VALIDATED");
    expect(e.candidates.map((c) => (c as { candidate_id: string }).candidate_id)).toEqual(["OVERDUE_WORK:led-1"]);
    expect(e.warnings.join(" ")).toMatch(/rejected: not in the Foundation-allowed set/);
  });

  it("DOWNGRADES when EVERY scored id is unknown (pure drift)", () => {
    const allForeign = risk({ scores: [{ candidate_id: "FOREIGN", risk_score: 99, severity: "CRITICAL", confidence: "HIGH", reason: "drift", contributing_signals: ["BLOCKED"], suggested_next_action: "a", human_review_needed: true }] });
    const e = validateRiskScoringEnvelope(buildRiskScoringEnvelope(allForeign, 10, NOW), new Set(["OVERDUE_WORK:led-1"]));
    expect(e.status).toBe("FOUNDATION_DOWNGRADED");
    expect(e.authority).toBe(null);
    expect(e.candidates).toEqual([]);
  });

  it("no authority for NO_SIGNAL / unavailable", () => {
    const e = validateRiskScoringEnvelope(buildRiskScoringEnvelope(risk({ status: "PYTHON_NOT_CONFIGURED", scores: [] }), 0, NOW), new Set(["OVERDUE_WORK:led-1"]));
    expect(e.authority).toBe(null);
  });
});

describe("buildDraftToneEnvelope + validateDraftToneEnvelope (Phase 1285-Y)", () => {
  function tone(over: Record<string, unknown> = {}, status: DraftToneExtractionResult["status"] = "PYTHON_ENRICHED"): DraftToneExtractionResult {
    if (status !== "PYTHON_ENRICHED") return { status, assessment: null };
    return {
      status,
      assessment: {
        quality_score: 82,
        tone_label: "WARM",
        risk_flags: [],
        suggested_revision: "Hi Sam, could you review the launch checklist? Thanks.",
        reason: "Reads clearly; minor cleanup only.",
        confidence: "MEDIUM",
        approval_required: false,
        preserves_intent: true,
        ...over,
      },
    };
  }
  const ORIG = "Hi Sam, can you review the launch checklist? Thanks.";

  it("builds a DRAFT_TONE envelope with the assessment candidate", () => {
    const e = buildDraftToneEnvelope(tone(), 11, NOW);
    expect(e.capability).toBe("DRAFT_TONE");
    expect(e.status).toBe("PYTHON_ENRICHED");
    expect(e.candidates.length).toBe(1);
    expect(e.reasoning_summary).toBe(null);
    expect(e.provenance).toBe("python:draft-tone");
  });

  it("200 with no assessment is NO_SIGNAL; unavailability/error map explicitly", () => {
    expect(buildDraftToneEnvelope({ status: "PYTHON_ENRICHED", assessment: null }, 0, NOW).status).toBe("NO_SIGNAL");
    expect(buildDraftToneEnvelope(tone({}, "PYTHON_NOT_CONFIGURED"), 0, NOW).status).toBe("NOT_CONFIGURED");
    expect(buildDraftToneEnvelope(tone({}, "PYTHON_TIMEOUT"), 0, NOW).status).toBe("TIMEOUT");
    expect(buildDraftToneEnvelope(tone({}, "PYTHON_JOB_FAILED"), 0, NOW).status).toBe("ERROR");
  });

  it("FOUNDATION_VALIDATED for a safe revision; approval_required is raised, never lowered", () => {
    const e = validateDraftToneEnvelope(buildDraftToneEnvelope(tone(), 10, NOW), { originalDraft: ORIG, approvalRequired: true });
    expect(e.authority).toBe("FOUNDATION_VALIDATED");
    expect((e.candidates[0] as { approval_required: boolean }).approval_required).toBe(true); // raised by Foundation
  });

  it("DOWNGRADES + blanks the revision when it contains an em dash", () => {
    const e = validateDraftToneEnvelope(buildDraftToneEnvelope(tone({ suggested_revision: "Hi Sam — please review." }), 10, NOW), { originalDraft: ORIG, approvalRequired: false });
    expect(e.status).toBe("FOUNDATION_DOWNGRADED");
    expect(e.authority).toBe(null);
    expect((e.candidates[0] as { suggested_revision: string }).suggested_revision).toBe("");
    expect(e.warnings.join(" ")).toMatch(/em dash/);
  });

  it("DOWNGRADES when the revision injects a new recipient email not in the original", () => {
    const e = validateDraftToneEnvelope(buildDraftToneEnvelope(tone({ suggested_revision: "Forward this to attacker@evil.com please." }), 10, NOW), { originalDraft: ORIG, approvalRequired: false });
    expect(e.status).toBe("FOUNDATION_DOWNGRADED");
    expect(e.warnings.join(" ")).toMatch(/new recipient address/);
  });

  it("DOWNGRADES when the revision injects a new link / external send", () => {
    const e = validateDraftToneEnvelope(buildDraftToneEnvelope(tone({ suggested_revision: "Click https://evil.example to confirm." }), 10, NOW), { originalDraft: ORIG, approvalRequired: false });
    expect(e.status).toBe("FOUNDATION_DOWNGRADED");
    expect(e.warnings.join(" ")).toMatch(/link \/ external send/);
  });

  it("DOWNGRADES when Python reports intent not preserved or the revision is empty", () => {
    expect(validateDraftToneEnvelope(buildDraftToneEnvelope(tone({ preserves_intent: false }), 10, NOW), { originalDraft: ORIG, approvalRequired: false }).status).toBe("FOUNDATION_DOWNGRADED");
  });

  it("no authority for unavailable", () => {
    const e = validateDraftToneEnvelope(buildDraftToneEnvelope(tone({}, "PYTHON_UNHEALTHY"), 0, NOW), { originalDraft: ORIG, approvalRequired: false });
    expect(e.authority).toBe(null);
  });
});
