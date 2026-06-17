// FILE: beam-watcher-merge.test.ts (unit)
// PURPOSE: Phase 1287-B — lock the Foundation validation/merge of BEAM watcher
//          candidates. Deterministic findings stay primary; BEAM can only
//          ANNOTATE a finding whose ledger_entry_id it was given AND whose
//          watcher_type matches; it can NOT introduce unknown ids, cross-scope
//          rows, unknown types, bad severity, or unsafe text. Pure functions.
// CONNECTS TO: apps/api/src/services/work-os/watcher.service.ts

import { describe, expect, it } from "vitest";
import {
  mergeBeamWatcherAdvisory,
  toBeamWatcherCandidate,
} from "../../apps/api/src/services/work-os/watcher.service.js";
import type { WatcherFinding, WatcherType, WatcherSeverity } from "../../apps/api/src/services/work-os/watcher.service.js";
import type { BeamWatcherResult } from "../../apps/api/src/services/coordination/beam-fabric-client.js";

function finding(id: string, type: WatcherType, severity: WatcherSeverity = "HIGH"): WatcherFinding {
  return {
    finding_id: `${type}:${id}`,
    watcher_type: type,
    severity,
    title: `Work ${id}`,
    summary: `summary ${id}`,
    org_id: "org-1",
    owner: null,
    requester: null,
    target: null,
    related_person: null,
    source: { source_system: "work_ledger", ledger_entry_id: id, source_message_id: null, source_thread_key: null, relationship_key: null },
    detection: { rule_id: "R", detected_at: "t", age_hours: 240, due_at: null, threshold_hours: null, reason: "r" },
    recommendation: { next_action: "do it", action_kind: "view_work" },
  };
}

function beamResult(candidates: BeamWatcherResult["candidates"], over: Partial<BeamWatcherResult> = {}): BeamWatcherResult {
  return { status: "BEAM_ENRICHED", candidates, correlation_id: "corr-1", actor_id: "watcher_actor", evaluated_at: "2026-06-17T20:00:00Z", ...over };
}
function bc(candidate_id: string, watcher_type: string, over: Record<string, unknown> = {}): BeamWatcherResult["candidates"][number] {
  return { candidate_id, watcher_type, severity: "HIGH", reason: "Open blocker confirmed.", recommendation: "Escalate to unblock.", confidence: "HIGH", source: "BEAM_ADVISORY", ...over } as BeamWatcherResult["candidates"][number];
}

const FINDINGS = [finding("led-1", "UNRESOLVED_BLOCKER"), finding("led-2", "OVERDUE_WORK")];

describe("toBeamWatcherCandidate", () => {
  it("derives a safe scoped candidate (ids + closed-vocab + signals only)", () => {
    const c = toBeamWatcherCandidate(FINDINGS[0]!);
    expect(c).not.toBeNull();
    expect(c!.candidate_id).toBe("led-1");
    expect(c!.watcher_type).toBe("UNRESOLVED_BLOCKER");
    expect(c!.blocked).toBe(true);
    expect(c!.overdue).toBe(false);
  });
});

describe("mergeBeamWatcherAdvisory — Foundation validates + annotates", () => {
  it("annotates a matching, valid candidate without creating new findings", () => {
    const r = mergeBeamWatcherAdvisory(FINDINGS, beamResult([bc("led-1", "UNRESOLVED_BLOCKER")]), "corr-1");
    expect(r.findings.length).toBe(2); // no new findings
    expect(r.confirmed_count).toBe(1);
    const blocker = r.findings.find((f) => f.finding_id === "UNRESOLVED_BLOCKER:led-1")!;
    expect(blocker.beam_advisory?.confirmed).toBe(true);
    expect(blocker.beam_advisory?.source).toBe("BEAM_ADVISORY");
    expect(blocker.beam_advisory?.correlation_id).toBe("corr-1");
    // the unannotated finding is untouched
    expect(r.findings.find((f) => f.finding_id === "OVERDUE_WORK:led-2")!.beam_advisory).toBeUndefined();
  });

  it("drops an unknown / cross-scope candidate_id BEAM was never given", () => {
    const r = mergeBeamWatcherAdvisory(FINDINGS, beamResult([bc("FOREIGN-TENANT-row", "UNRESOLVED_BLOCKER")]), "corr-1");
    expect(r.confirmed_count).toBe(0);
    expect(r.dropped_count).toBe(1);
    expect(r.findings.every((f) => f.beam_advisory === undefined)).toBe(true);
  });

  it("drops a candidate whose watcher_type does not match the deterministic finding", () => {
    const r = mergeBeamWatcherAdvisory(FINDINGS, beamResult([bc("led-1", "OVERDUE_WORK")]), "corr-1"); // led-1 is a BLOCKER
    expect(r.confirmed_count).toBe(0);
    expect(r.dropped_count).toBe(1);
  });

  it("drops bad severity and unsafe text (em dash / leaked UUID)", () => {
    const badSeverity = mergeBeamWatcherAdvisory(FINDINGS, beamResult([bc("led-1", "UNRESOLVED_BLOCKER", { severity: "ULTRA" })]), "corr-1");
    expect(badSeverity.confirmed_count).toBe(0);
    const emDash = mergeBeamWatcherAdvisory(FINDINGS, beamResult([bc("led-1", "UNRESOLVED_BLOCKER", { reason: "Open blocker — escalate" })]), "corr-1");
    expect(emDash.confirmed_count).toBe(0);
    const uuid = mergeBeamWatcherAdvisory(FINDINGS, beamResult([bc("led-1", "UNRESOLVED_BLOCKER", { recommendation: "see 11111111-2222-3333-4444-555555555555" })]), "corr-1");
    expect(uuid.confirmed_count).toBe(0);
  });

  it("is a no-op when BEAM is not enriched (down / empty)", () => {
    const down = mergeBeamWatcherAdvisory(FINDINGS, beamResult([], { status: "UNHEALTHY" }), "corr-1");
    expect(down.confirmed_count).toBe(0);
    expect(down.findings).toEqual(FINDINGS);
  });
});
