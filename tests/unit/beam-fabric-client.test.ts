// FILE: beam-fabric-client.test.ts (unit)
// PURPOSE: Phase 1281 — lock governed BEAM fanout. BEAM_DISPATCHED only on
//          a real 2xx accept; BEAM_UNAVAILABLE when disabled/unaddressed;
//          BEAM_FAILED on error. Never throws (ledger create must not
//          depend on it). Event payload carries ids + safe scalars only.
// CONNECTS TO: apps/api/src/services/coordination/beam-fabric-client.ts

import { describe, expect, it } from "vitest";
import {
  dispatchWorkOsEvent,
  eventTypeForLedger,
  evaluateWatchersOnBeam,
  type WorkOsEvent,
  type BeamWatcherCandidateInput,
} from "../../apps/api/src/services/coordination/beam-fabric-client.js";

const wcands: BeamWatcherCandidateInput[] = [
  { candidate_id: "led-1", watcher_type: "UNRESOLVED_BLOCKER", severity: "HIGH", blocked: true },
];

describe("evaluateWatchersOnBeam — advisory, honest, never throws", () => {
  it("NOT_CONFIGURED when BEAM is disabled (no fetch attempted)", async () => {
    let called = false;
    const fetchImpl = (async () => { called = true; return new Response("{}", { status: 202 }); }) as unknown as typeof fetch;
    const r = await evaluateWatchersOnBeam({ tenant_id: "org-1", correlation_id: "c1", candidates: wcands }, { enabled: false, beamUrl: "http://x", fetchImpl });
    expect(r.status).toBe("NOT_CONFIGURED");
    expect(called).toBe(false);
  });
  it("BEAM_ENRICHED with no fetch when there are no candidates", async () => {
    let called = false;
    const fetchImpl = (async () => { called = true; return new Response("{}", { status: 202 }); }) as unknown as typeof fetch;
    const r = await evaluateWatchersOnBeam({ tenant_id: "org-1", correlation_id: "c1", candidates: [] }, { enabled: true, beamUrl: "http://x", fetchImpl });
    expect(r.status).toBe("BEAM_ENRICHED");
    expect(r.candidates).toEqual([]);
    expect(called).toBe(false);
  });
  it("BEAM_ENRICHED on 202; parses closed-vocab candidates + actor metadata", async () => {
    const body = JSON.stringify({ ok: true, runtime: "BEAM", correlation_id: "c1", actor_id: "watcher_actor", evaluated_at: "2026-06-17T20:00:00Z", candidates: [{ candidate_id: "led-1", watcher_type: "UNRESOLVED_BLOCKER", severity: "HIGH", reason: "Open blocker confirmed.", recommendation: "Escalate.", confidence: "HIGH", source: "BEAM_ADVISORY" }, { candidate_id: "x", watcher_type: "NONSENSE" }] });
    const fetchImpl = (async () => new Response(body, { status: 202, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
    const r = await evaluateWatchersOnBeam({ tenant_id: "org-1", correlation_id: "c1", candidates: wcands }, { enabled: true, beamUrl: "http://x", fetchImpl });
    expect(r.status).toBe("BEAM_ENRICHED");
    expect(r.actor_id).toBe("watcher_actor");
    expect(r.candidates.length).toBe(1); // the NONSENSE type is dropped at parse
    expect(r.candidates[0]!.candidate_id).toBe("led-1");
  });
  it("ERROR on non-2xx; TIMEOUT on abort; UNHEALTHY on throw", async () => {
    const fail = (async () => new Response("no", { status: 500 })) as unknown as typeof fetch;
    expect((await evaluateWatchersOnBeam({ tenant_id: "o", correlation_id: "c", candidates: wcands }, { enabled: true, beamUrl: "http://x", fetchImpl: fail })).status).toBe("ERROR");
    const abort = (async () => { const e = new Error("a"); e.name = "AbortError"; throw e; }) as unknown as typeof fetch;
    expect((await evaluateWatchersOnBeam({ tenant_id: "o", correlation_id: "c", candidates: wcands }, { enabled: true, beamUrl: "http://x", fetchImpl: abort })).status).toBe("TIMEOUT");
    const boom = (async () => { throw new Error("conn"); }) as unknown as typeof fetch;
    expect((await evaluateWatchersOnBeam({ tenant_id: "o", correlation_id: "c", candidates: wcands }, { enabled: true, beamUrl: "http://x", fetchImpl: boom })).status).toBe("UNHEALTHY");
  });
});

function event(over: Partial<WorkOsEvent> = {}): WorkOsEvent {
  return {
    event_id: "ev-1",
    org_entity_id: "org-1",
    ledger_entry_id: "led-1",
    event_type: "FOLLOW_UP_CREATED",
    ledger_type: "FOLLOW_UP",
    status: "DRAFT",
    priority: "ROUTINE",
    source_type: "VOICE_COMMAND",
    extraction_source: "TYPESCRIPT_DETERMINISTIC",
    audit_required: true,
    created_at: "2026-06-13T18:00:00.000Z",
    ...over,
  };
}

describe("dispatchWorkOsEvent", () => {
  it("BEAM_UNAVAILABLE when disabled (no fetch attempted)", async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return { ok: true } as Response;
    }) as unknown as typeof fetch;
    const r = await dispatchWorkOsEvent(event(), { enabled: false, fetchImpl });
    expect(r.coordination_runtime).toBe("BEAM_UNAVAILABLE");
    expect(called).toBe(false);
  });

  it("BEAM_UNAVAILABLE when enabled but no URL", async () => {
    const r = await dispatchWorkOsEvent(event(), { enabled: true, beamUrl: null });
    expect(r.coordination_runtime).toBe("BEAM_UNAVAILABLE");
  });

  it("BEAM_DISPATCHED on a 2xx accept, surfacing the watcher", async () => {
    const fetchImpl = (async () => ({
      ok: true,
      status: 202,
      json: async () => ({ accepted: true, watcher: "confirmation" }),
    })) as unknown as typeof fetch;
    const r = await dispatchWorkOsEvent(event({ status: "NEEDS_PARTICIPANT_CONFIRMATION" }), {
      enabled: true,
      beamUrl: "http://beam.internal",
      fetchImpl,
    });
    expect(r.coordination_runtime).toBe("BEAM_DISPATCHED");
    expect(r.watcher).toBe("confirmation");
  });

  it("BEAM_FAILED on non-2xx — never throws", async () => {
    const fetchImpl = (async () => ({ ok: false, status: 500 })) as unknown as typeof fetch;
    const r = await dispatchWorkOsEvent(event(), { enabled: true, beamUrl: "http://beam.internal", fetchImpl });
    expect(r.coordination_runtime).toBe("BEAM_FAILED");
    expect(r.error_code).toBe("http_500");
  });

  it("BEAM_FAILED on a thrown fetch — never throws", async () => {
    const fetchImpl = (async () => {
      throw new Error("refused");
    }) as unknown as typeof fetch;
    const r = await dispatchWorkOsEvent(event(), { enabled: true, beamUrl: "http://beam.internal", fetchImpl });
    expect(r.coordination_runtime).toBe("BEAM_FAILED");
  });

  it("the event payload carries no tokens/secrets (ids + safe scalars only)", async () => {
    let captured = "";
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      captured = String(init.body);
      return { ok: true, status: 202, json: async () => ({}) } as Response;
    }) as unknown as typeof fetch;
    await dispatchWorkOsEvent(event(), { enabled: true, beamUrl: "http://b", fetchImpl });
    expect(captured).not.toMatch(/token|secret|password|authorization/i);
    expect(captured).toContain("led-1");
  });

  it("includes tenant_id (= org_entity_id) so the BEAM contract validates", async () => {
    let captured = "";
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      captured = String(init.body);
      return { ok: true, status: 202, json: async () => ({}) } as Response;
    }) as unknown as typeof fetch;
    await dispatchWorkOsEvent(event({ org_entity_id: "org-xyz" }), {
      enabled: true,
      beamUrl: "http://b",
      fetchImpl,
    });
    const body = JSON.parse(captured) as { tenant_id?: string; org_entity_id?: string };
    expect(body.tenant_id).toBe("org-xyz");
    expect(body.org_entity_id).toBe("org-xyz");
  });
});

describe("eventTypeForLedger", () => {
  it("maps status/type to event_type", () => {
    expect(eventTypeForLedger("FOLLOW_UP", "DRAFT")).toBe("FOLLOW_UP_CREATED");
    expect(eventTypeForLedger("TASK", "PROPOSED")).toBe("TASK_CREATED");
    expect(eventTypeForLedger("MEETING", "PROPOSED")).toBe("MEETING_PROPOSAL_CREATED");
    expect(eventTypeForLedger("FOLLOW_UP", "BLOCKED")).toBe("BLOCKER_CREATED");
    expect(eventTypeForLedger("TASK", "NEEDS_APPROVAL")).toBe("APPROVAL_REQUIRED");
  });
});
