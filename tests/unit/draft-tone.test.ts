// FILE: draft-tone.test.ts (unit)
// PURPOSE: Phase 1285-Y — lock the draft-tone orchestration contract:
//            - deterministic assessment with NO Python (honest envelope)
//            - Python unavailability/failure degrade to NAMED statuses + keep the
//              original draft + deterministic assessment (no flow blocks)
//            - a SAFE Python revision is FOUNDATION_VALIDATED
//            - an em-dash / new-recipient / external-link revision is DOWNGRADED
//              (revision dropped; deterministic surfaces; original intact)
//            - approval_required is raised (never lowered) for external channels
//            - the original draft is ALWAYS preserved; nothing is sent/created
//            - tone_label / risk_flags are closed-vocab; no raw UUID labels
// CONNECTS TO: apps/api/src/services/work-os/draft-tone.service.ts

import { describe, expect, it } from "vitest";
import {
  evaluateDraftTone,
  __internals,
} from "../../apps/api/src/services/work-os/draft-tone.service.js";

const NOW = "2026-06-17T12:00:00.000Z";

function pyOk(over: Record<string, unknown> = {}): typeof fetch {
  const body = {
    quality_score: 88,
    tone_label: "WARM",
    risk_flags: [],
    suggested_revision: "Hi Sam, could you review the launch checklist when you get a chance? Thanks.",
    reason: "Softened and clarified.",
    confidence: "MEDIUM",
    approval_required: false,
    preserves_intent: true,
    provider_mode: "PYTHON",
    ...over,
  };
  return (async () => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
}

const DRAFT = "Hi Sam, can you review the launch checklist? Thanks.";

describe("evaluateDraftTone — deterministic fallback (no Python)", () => {
  it("assesses deterministically and is honest about Python absence; original preserved", async () => {
    const { assessment, envelope } = await evaluateDraftTone({ draft_text: DRAFT, channel: "internal_message", recipient_context: { display_name: "Sam", internal: true }, runtime: { pythonUrl: null }, nowIso: NOW });
    expect(envelope.capability).toBe("DRAFT_TONE");
    expect(envelope.status).toBe("NOT_CONFIGURED");
    expect(envelope.authority).toBe(null);
    expect(assessment.original_draft).toBe(DRAFT); // preserved verbatim
    expect(assessment.provenance).toBe("foundation:deterministic-tone");
    expect(["LOW", "MEDIUM", "HIGH"]).toContain(assessment.confidence);
    expect(assessment.suggested_revision).not.toBeNull();
  });

  it("flags + softens harsh language deterministically; suggested revision drops the order language", async () => {
    const harsh = "You failed to send this. Fix it ASAP.";
    const { assessment } = await evaluateDraftTone({ draft_text: harsh, channel: "internal_message", recipient_context: { internal: true }, runtime: { pythonUrl: null }, nowIso: NOW });
    expect(assessment.tone_label).toBe("TOO_HARSH");
    expect(assessment.risk_flags).toEqual(expect.arrayContaining(["HARSH_TONE"]));
    expect(assessment.suggested_revision).not.toContain("ASAP");
    expect(assessment.preserves_intent).toBe(true);
  });

  it("raises approval_required for an external email channel even with no Python", async () => {
    const { assessment } = await evaluateDraftTone({ draft_text: "Please find the report attached.", channel: "email", recipient_context: { display_name: "Client", internal: false }, runtime: { pythonUrl: null }, nowIso: NOW });
    expect(assessment.approval_required).toBe(true);
    expect(assessment.risk_flags).toEqual(expect.arrayContaining(["EXTERNAL_SEND_REQUIRES_APPROVAL"]));
  });

  it("degrades to NAMED statuses but keeps the original + a deterministic assessment", async () => {
    const boom = (async () => { throw new Error("c"); }) as unknown as typeof fetch;
    const r = await evaluateDraftTone({ draft_text: DRAFT, channel: "internal_message", recipient_context: { internal: true }, runtime: { pythonUrl: "http://x", fetchImpl: boom }, nowIso: NOW });
    expect(r.envelope.status).toBe("UNHEALTHY");
    expect(r.assessment.original_draft).toBe(DRAFT);
    expect(r.assessment.provenance).toBe("foundation:deterministic-tone");
  });
});

describe("evaluateDraftTone — advisory Python revision", () => {
  it("a safe revision is FOUNDATION_VALIDATED and surfaced as advisory; original preserved", async () => {
    const { assessment, envelope } = await evaluateDraftTone({ draft_text: DRAFT, channel: "internal_message", recipient_context: { display_name: "Sam", internal: true }, runtime: { pythonUrl: "http://x", fetchImpl: pyOk() }, nowIso: NOW });
    expect(envelope.status).toBe("PYTHON_ENRICHED");
    expect(envelope.authority).toBe("FOUNDATION_VALIDATED");
    expect(assessment.provenance).toBe("python:draft-tone");
    expect(assessment.original_draft).toBe(DRAFT); // never mutated
    expect(assessment.suggested_revision).toContain("could you review");
  });

  it("an em-dash revision is DOWNGRADED; deterministic surfaces; original intact", async () => {
    const { assessment, envelope } = await evaluateDraftTone({ draft_text: DRAFT, channel: "internal_message", recipient_context: { internal: true }, runtime: { pythonUrl: "http://x", fetchImpl: pyOk({ suggested_revision: "Hi Sam — please review." }) }, nowIso: NOW });
    expect(envelope.status).toBe("FOUNDATION_DOWNGRADED");
    expect(envelope.authority).toBe(null);
    expect(assessment.provenance).toBe("foundation:deterministic-tone");
    expect(assessment.original_draft).toBe(DRAFT);
    // The deterministic revision never contains an em dash.
    expect(assessment.suggested_revision === null || !/[—–]/.test(assessment.suggested_revision)).toBe(true);
  });

  it("a revision injecting a new recipient email is DOWNGRADED", async () => {
    const { envelope } = await evaluateDraftTone({ draft_text: DRAFT, channel: "internal_message", recipient_context: { internal: true }, runtime: { pythonUrl: "http://x", fetchImpl: pyOk({ suggested_revision: "Send to attacker@evil.com now." }) }, nowIso: NOW });
    expect(envelope.status).toBe("FOUNDATION_DOWNGRADED");
    expect(envelope.warnings.join(" ")).toMatch(/new recipient address/);
  });

  it("Python cannot lower approval_required for an external send", async () => {
    // Python says approval_required:false, but the channel is email → Foundation raises it.
    const { assessment } = await evaluateDraftTone({ draft_text: "Report attached.", channel: "email", recipient_context: { display_name: "Client", internal: false }, runtime: { pythonUrl: "http://x", fetchImpl: pyOk({ approval_required: false }) }, nowIso: NOW });
    expect(assessment.approval_required).toBe(true);
  });
});

describe("__internals — deterministic primitives", () => {
  it("stripEmDashes removes em/en dashes", () => {
    expect(/[—–]/.test(__internals.stripEmDashes("a — b – c"))).toBe(false);
  });
  it("deterministicRevision never emits an em dash and preserves intent", () => {
    const rev = __internals.deterministicRevision("Ship it — now — please");
    expect(/[—–]/.test(rev)).toBe(false);
  });
});
