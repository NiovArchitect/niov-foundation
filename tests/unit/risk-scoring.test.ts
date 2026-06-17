// FILE: risk-scoring.test.ts (unit)
// PURPOSE: Phase 1285-X — lock the risk-scoring contract over deterministic
//          watcher findings (DB assembly is integration-tested separately):
//            - deterministic assessment with NO Python (honest envelope)
//            - Python unavailability/failure degrade to NAMED statuses + keep
//              the deterministic assessment (no flow blocks on Python)
//            - a valid Python scoring is FOUNDATION_VALIDATED + refines findings
//            - Python can NOT introduce a candidate not in the allowed set
//            - all-unknown scoring DOWNGRADES; deterministic surfaces
//            - the watcher finding (and its deterministic severity) is unchanged
//            - severity rises with the signal load; signals are closed-vocab
//            - the primary label is the title, never a raw UUID
// CONNECTS TO: apps/api/src/services/work-os/risk-scoring.service.ts

import { describe, expect, it } from "vitest";
import {
  scoreWatcherFindings,
  __internals,
  type RiskAssessedFinding,
} from "../../apps/api/src/services/work-os/risk-scoring.service.js";
import type { WatcherFinding, WatcherType, WatcherSeverity } from "../../apps/api/src/services/work-os/watcher.service.js";

const NOW = "2026-06-17T12:00:00.000Z";

function finding(
  id: string,
  type: WatcherType,
  severity: WatcherSeverity,
  ageHours: number | null,
  over: Partial<WatcherFinding> = {},
): WatcherFinding {
  return {
    finding_id: `${type}:${id}`,
    watcher_type: type,
    severity,
    title: `Work ${id}`,
    summary: `summary ${id}`,
    org_id: "org-1",
    owner: { entity_id: "ent-own", display_name: "Owner One", unresolved: false },
    requester: { entity_id: "ent-req", display_name: "Req Two", unresolved: false },
    target: null,
    related_person: { entity_id: "ent-own", display_name: "Owner One", unresolved: false },
    source: { source_system: "work_ledger", ledger_entry_id: id, source_message_id: null, source_thread_key: null, relationship_key: null },
    detection: { rule_id: "R", detected_at: NOW, age_hours: ageHours, due_at: null, threshold_hours: null, reason: "r" },
    recommendation: { next_action: "do it", action_kind: "view_work" },
    ...over,
  };
}

const FINDINGS: WatcherFinding[] = [
  finding("led-1", "UNRESOLVED_BLOCKER", "HIGH", 50), // blocked + high base
  finding("led-2", "NO_NEXT_ACTION", "LOW", 5), // low
  finding("led-3", "OVERDUE_WORK", "HIGH", 240), // overdue + aging + high base
];

function pyOk(scores: Array<Record<string, unknown>>): typeof fetch {
  return (async () =>
    new Response(JSON.stringify({ scores, provider_mode: "PYTHON" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
}

function byId(findings: RiskAssessedFinding[]): Map<string, RiskAssessedFinding> {
  return new Map(findings.map((f) => [f.finding_id, f]));
}

describe("scoreWatcherFindings — deterministic fallback (no Python)", () => {
  it("assesses every finding, orders by risk_score desc, and is honest about Python absence", async () => {
    const { findings, envelope } = await scoreWatcherFindings({ findings: FINDINGS, runtime: { pythonUrl: null }, nowIso: NOW });
    expect(envelope.capability).toBe("RISK_SCORING");
    expect(envelope.status).toBe("NOT_CONFIGURED");
    expect(envelope.authority).toBe(null);
    expect(findings.length).toBe(3);
    // Highest risk first; all deterministic.
    expect(findings[0]!.risk_assessment.risk_score).toBeGreaterThanOrEqual(findings[1]!.risk_assessment.risk_score);
    expect(findings.every((f) => f.risk_assessment.provenance === "foundation:deterministic-risk")).toBe(true);
    // The blocker + the overdue/aging item outrank the low no-next-action item.
    const m = byId(findings);
    expect(m.get("NO_NEXT_ACTION:led-2")!.risk_assessment.risk_score).toBeLessThan(m.get("UNRESOLVED_BLOCKER:led-1")!.risk_assessment.risk_score);
  });

  it("keeps the deterministic watcher finding (and its severity) unchanged; risk is additive", async () => {
    const { findings } = await scoreWatcherFindings({ findings: FINDINGS, runtime: { pythonUrl: null }, nowIso: NOW });
    const blocker = byId(findings).get("UNRESOLVED_BLOCKER:led-1")!;
    expect(blocker.severity).toBe("HIGH"); // deterministic watcher severity untouched
    expect(blocker.watcher_type).toBe("UNRESOLVED_BLOCKER");
    expect(blocker.risk_assessment.contributing_signals).toContain("BLOCKED");
    expect(blocker.risk_assessment.human_review_needed).toBe(true);
  });

  it("degrades to NAMED statuses but still attaches deterministic assessments", async () => {
    const boom = (async () => { throw new Error("conn"); }) as unknown as typeof fetch;
    const unhealthy = await scoreWatcherFindings({ findings: FINDINGS, runtime: { pythonUrl: "http://x", fetchImpl: boom }, nowIso: NOW });
    expect(unhealthy.envelope.status).toBe("UNHEALTHY");
    expect(unhealthy.findings.every((f) => f.risk_assessment.provenance === "foundation:deterministic-risk")).toBe(true);

    const abort = (async () => { const e = new Error("a"); e.name = "AbortError"; throw e; }) as unknown as typeof fetch;
    const timeout = await scoreWatcherFindings({ findings: FINDINGS, runtime: { pythonUrl: "http://x", fetchImpl: abort }, nowIso: NOW });
    expect(timeout.envelope.status).toBe("TIMEOUT");
    expect(timeout.findings.length).toBe(3);
  });
});

describe("scoreWatcherFindings — advisory Python scoring (validated)", () => {
  function score(id: string, over: Record<string, unknown> = {}): Record<string, unknown> {
    return { candidate_id: id, risk_score: 90, severity: "CRITICAL", confidence: "HIGH", reason: "r", contributing_signals: ["BLOCKED"], suggested_next_action: "Escalate.", human_review_needed: true, ...over };
  }

  it("a valid scoring is FOUNDATION_VALIDATED and refines the findings (python provenance)", async () => {
    const fetchImpl = pyOk([
      score("UNRESOLVED_BLOCKER:led-1", { risk_score: 95 }),
      score("OVERDUE_WORK:led-3", { risk_score: 80, severity: "HIGH", contributing_signals: ["OVERDUE", "AGING"] }),
      score("NO_NEXT_ACTION:led-2", { risk_score: 30, severity: "MEDIUM", confidence: "LOW", contributing_signals: ["NO_NEXT_ACTION"], human_review_needed: false }),
    ]);
    const { findings, envelope } = await scoreWatcherFindings({ findings: FINDINGS, runtime: { pythonUrl: "http://x", fetchImpl }, nowIso: NOW });
    expect(envelope.status).toBe("PYTHON_ENRICHED");
    expect(envelope.authority).toBe("FOUNDATION_VALIDATED");
    expect(findings[0]!.finding_id).toBe("UNRESOLVED_BLOCKER:led-1"); // highest python score
    expect(findings[0]!.risk_assessment.risk_score).toBe(95);
    expect(findings.every((f) => f.risk_assessment.provenance === "python:risk-scoring")).toBe(true);
  });

  it("Python can NOT introduce a finding not in the allowed set; known ones still scored", async () => {
    const fetchImpl = pyOk([
      score("UNRESOLVED_BLOCKER:led-1", { risk_score: 95 }),
      score("FOREIGN-TENANT-finding", { risk_score: 99 }),
    ]);
    const { findings, envelope } = await scoreWatcherFindings({ findings: FINDINGS, runtime: { pythonUrl: "http://x", fetchImpl }, nowIso: NOW });
    expect(envelope.authority).toBe("FOUNDATION_VALIDATED");
    expect(envelope.warnings.join(" ")).toMatch(/rejected/);
    // No foreign finding leaks into the surface.
    expect(findings.map((f) => f.finding_id)).not.toContain("FOREIGN-TENANT-finding");
    // The validated finding uses Python; the unscored allowed ones fall back to deterministic.
    const m = byId(findings);
    expect(m.get("UNRESOLVED_BLOCKER:led-1")!.risk_assessment.provenance).toBe("python:risk-scoring");
    expect(m.get("NO_NEXT_ACTION:led-2")!.risk_assessment.provenance).toBe("foundation:deterministic-risk");
  });

  it("an all-unknown scoring DOWNGRADES and deterministic assessments surface", async () => {
    const fetchImpl = pyOk([score("FOREIGN", { risk_score: 99 })]);
    const { findings, envelope } = await scoreWatcherFindings({ findings: FINDINGS, runtime: { pythonUrl: "http://x", fetchImpl }, nowIso: NOW });
    expect(envelope.status).toBe("FOUNDATION_DOWNGRADED");
    expect(envelope.authority).toBe(null);
    expect(findings.every((f) => f.risk_assessment.provenance === "foundation:deterministic-risk")).toBe(true);
  });
});

describe("scoreWatcherFindings — safety invariants", () => {
  it("the primary label is the title, never a raw UUID; identity is a display name", async () => {
    const { findings } = await scoreWatcherFindings({ findings: FINDINGS, runtime: { pythonUrl: null }, nowIso: NOW });
    const top = findings[0]!;
    expect(top.title.startsWith("Work ")).toBe(true);
    expect(top.title).not.toBe(top.finding_id);
    expect(top.related_person?.display_name).toBe("Owner One");
  });
});

describe("__internals — deterministic primitives", () => {
  it("derives signals from watcher_type and computes a higher score for blocked+high than low", () => {
    const blocker = __internals.deterministicAssessment(FINDINGS[0]!);
    const low = __internals.deterministicAssessment(FINDINGS[1]!);
    expect(blocker.contributing_signals).toContain("BLOCKED");
    expect(blocker.risk_score).toBeGreaterThan(low.risk_score);
    expect(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).toContain(blocker.severity);
  });
  it("overdue + aging stacks signals", () => {
    const overdue = __internals.deterministicAssessment(FINDINGS[2]!);
    expect(overdue.contributing_signals).toEqual(expect.arrayContaining(["OVERDUE", "AGING", "HIGH_BASE_SEVERITY"]));
  });
});
