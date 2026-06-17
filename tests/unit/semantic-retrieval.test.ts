// FILE: semantic-retrieval.test.ts (unit)
// PURPOSE: Phase 1285-W — lock the retrieval RANKING contract over an assembled
//          candidate set (DB assembly is integration-tested separately):
//            - deterministic ordering works with NO Python (honest envelope)
//            - Python unavailability/failure degrade to NAMED statuses + keep
//              the deterministic order (no flow blocks on Python)
//            - a valid Python rerank is FOUNDATION_VALIDATED + reorders results
//            - Python can NOT introduce a candidate not in the allowed set
//            - a cross-tenant / unknown id never appears in results
//            - all-unknown rerank DOWNGRADES; deterministic order surfaces
//            - the primary label is the title, never a raw UUID
//            - results carry no raw payload fields
// CONNECTS TO: apps/api/src/services/work-os/semantic-retrieval.service.ts

import { describe, expect, it } from "vitest";
import {
  rankSemanticCandidates,
  __internals,
  type SemanticRetrievalCandidate,
} from "../../apps/api/src/services/work-os/semantic-retrieval.service.js";

const NOW = "2026-06-17T12:00:00.000Z";

function cand(over: Partial<SemanticRetrievalCandidate> & { candidate_id: string }): SemanticRetrievalCandidate {
  return {
    candidate_type: "TASK",
    title: "Untitled work",
    summary: null,
    source_type: "WORK_LEDGER",
    created_at: NOW,
    updated_at: NOW,
    status: "OPEN",
    related_people: [],
    related_person: null,
    ...over,
  };
}

const CANDIDATES: SemanticRetrievalCandidate[] = [
  cand({
    candidate_id: "led-decision",
    candidate_type: "DECISION",
    title: "Onboarding copy decision",
    summary: "We decided to go with the new onboarding copy.",
    related_people: ["Samiksha Rao"],
    related_person: { entity_id: "ent-sam", display_name: "Samiksha Rao", unresolved: false },
  }),
  cand({
    candidate_id: "led-blocker",
    candidate_type: "BLOCKER",
    title: "Compliance sign-off blocker",
    summary: "Blocked on the compliance sign-off from Vishesh.",
    status: "BLOCKED",
    related_people: ["Vishesh Patel"],
    related_person: { entity_id: "ent-vish", display_name: "Vishesh Patel", unresolved: false },
  }),
  cand({
    candidate_id: "led-chairs",
    candidate_type: "TASK",
    title: "Order standing desks",
    summary: "Facilities to order desks.",
    related_people: ["Annie Wu"],
  }),
];

// A fetch that returns a chosen Python rerank body.
function pyOk(ranked: Array<{ candidate_id: string; score: number; reason: string }>): typeof fetch {
  return (async () =>
    new Response(JSON.stringify({ ranked_candidates: ranked, provider_mode: "PYTHON" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
}

describe("rankSemanticCandidates — deterministic fallback (no Python)", () => {
  it("orders by lexical relevance and is FOUNDATION-honest about Python absence", async () => {
    const { results, envelope } = await rankSemanticCandidates({
      query: "what did we decide about onboarding",
      candidates: CANDIDATES,
      runtime: { pythonUrl: null }, // not configured
      nowIso: NOW,
    });
    expect(envelope.status).toBe("NOT_CONFIGURED");
    expect(envelope.authority).toBe(null);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.result_id).toBe("led-decision");
    expect(results[0]!.provenance).toBe("foundation:deterministic-lexical");
    // The irrelevant desks task carries no overlap and is excluded.
    expect(results.map((r) => r.result_id)).not.toContain("led-chairs");
  });

  it("a related person's name matches deterministically", async () => {
    const { results } = await rankSemanticCandidates({
      query: "show blockers related to Vishesh",
      candidates: CANDIDATES,
      runtime: { pythonUrl: null },
      nowIso: NOW,
    });
    expect(results[0]!.result_id).toBe("led-blocker");
  });

  it("degrades to NAMED statuses (unhealthy/timeout/error) but still returns deterministic results", async () => {
    const boom = (async () => { throw new Error("conn refused"); }) as unknown as typeof fetch;
    const unhealthy = await rankSemanticCandidates({ query: "onboarding", candidates: CANDIDATES, runtime: { pythonUrl: "http://x", fetchImpl: boom }, nowIso: NOW });
    expect(unhealthy.envelope.status).toBe("UNHEALTHY");
    expect(unhealthy.results[0]!.result_id).toBe("led-decision");

    const abort = (async () => { const e = new Error("a"); e.name = "AbortError"; throw e; }) as unknown as typeof fetch;
    const timeout = await rankSemanticCandidates({ query: "onboarding", candidates: CANDIDATES, runtime: { pythonUrl: "http://x", fetchImpl: abort }, nowIso: NOW });
    expect(timeout.envelope.status).toBe("TIMEOUT");
    expect(timeout.results.length).toBeGreaterThan(0);

    const fail = (async () => new Response("x", { status: 500 })) as unknown as typeof fetch;
    const errored = await rankSemanticCandidates({ query: "onboarding", candidates: CANDIDATES, runtime: { pythonUrl: "http://x", fetchImpl: fail }, nowIso: NOW });
    expect(errored.envelope.status).toBe("ERROR");
    expect(errored.results.length).toBeGreaterThan(0);
  });
});

describe("rankSemanticCandidates — advisory Python rerank (validated)", () => {
  it("a valid rerank is FOUNDATION_VALIDATED and reorders results in Python's order", async () => {
    // Python prefers the blocker over the decision.
    const fetchImpl = pyOk([
      { candidate_id: "led-blocker", score: 12, reason: "Matched a related person" },
      { candidate_id: "led-decision", score: 5, reason: "Matched query terms in the title" },
    ]);
    const { results, envelope } = await rankSemanticCandidates({
      query: "onboarding compliance",
      candidates: CANDIDATES,
      runtime: { pythonUrl: "http://x", fetchImpl },
      nowIso: NOW,
    });
    expect(envelope.status).toBe("PYTHON_ENRICHED");
    expect(envelope.authority).toBe("FOUNDATION_VALIDATED");
    expect(results.map((r) => r.result_id)).toEqual(["led-blocker", "led-decision"]);
    expect(results[0]!.provenance).toBe("python:semantic-rerank");
    expect(results[0]!.score).toBe(12);
  });

  it("Python can NOT introduce a candidate not in the allowed set (id is dropped)", async () => {
    const fetchImpl = pyOk([
      { candidate_id: "led-decision", score: 9, reason: "ok" },
      { candidate_id: "FOREIGN-TENANT-row", score: 99, reason: "drift" },
    ]);
    const { results, envelope } = await rankSemanticCandidates({
      query: "onboarding",
      candidates: CANDIDATES,
      runtime: { pythonUrl: "http://x", fetchImpl },
      nowIso: NOW,
    });
    expect(envelope.authority).toBe("FOUNDATION_VALIDATED");
    expect(results.map((r) => r.result_id)).toEqual(["led-decision"]);
    expect(results.map((r) => r.result_id)).not.toContain("FOREIGN-TENANT-row");
    expect(envelope.warnings.join(" ")).toMatch(/rejected/);
  });

  it("an all-unknown rerank DOWNGRADES and the deterministic order surfaces", async () => {
    const fetchImpl = pyOk([{ candidate_id: "FOREIGN", score: 99, reason: "drift" }]);
    const { results, envelope } = await rankSemanticCandidates({
      query: "onboarding",
      candidates: CANDIDATES,
      runtime: { pythonUrl: "http://x", fetchImpl },
      nowIso: NOW,
    });
    expect(envelope.status).toBe("FOUNDATION_DOWNGRADED");
    expect(envelope.authority).toBe(null);
    expect(results[0]!.result_id).toBe("led-decision"); // deterministic stands
    expect(results[0]!.provenance).toBe("foundation:deterministic-lexical");
  });

  it("NO_SIGNAL (Python ranks nothing) keeps the deterministic order", async () => {
    const fetchImpl = pyOk([]);
    const { results, envelope } = await rankSemanticCandidates({
      query: "onboarding",
      candidates: CANDIDATES,
      runtime: { pythonUrl: "http://x", fetchImpl },
      nowIso: NOW,
    });
    expect(envelope.status).toBe("NO_SIGNAL");
    expect(results[0]!.result_id).toBe("led-decision");
  });

  it("respects the limit cap", async () => {
    const fetchImpl = pyOk([
      { candidate_id: "led-blocker", score: 12, reason: "r" },
      { candidate_id: "led-decision", score: 5, reason: "r" },
    ]);
    const { results } = await rankSemanticCandidates({
      query: "onboarding compliance",
      candidates: CANDIDATES,
      limit: 1,
      runtime: { pythonUrl: "http://x", fetchImpl },
      nowIso: NOW,
    });
    expect(results.length).toBe(1);
  });
});

describe("rankSemanticCandidates — safety invariants", () => {
  it("the primary label is the title, never a raw UUID; identity is a display name", async () => {
    const { results } = await rankSemanticCandidates({
      query: "onboarding",
      candidates: CANDIDATES,
      runtime: { pythonUrl: null },
      nowIso: NOW,
    });
    const top = results[0]!;
    expect(top.title).toBe("Onboarding copy decision");
    expect(top.title).not.toBe(top.result_id);
    expect(top.related_person?.display_name).toBe("Samiksha Rao");
  });

  it("results carry only the safe contract fields (no raw payload / vectors / scores leak)", async () => {
    const { results } = await rankSemanticCandidates({
      query: "onboarding",
      candidates: CANDIDATES,
      runtime: { pythonUrl: null },
      nowIso: NOW,
    });
    const keys = Object.keys(results[0]!).sort();
    expect(keys).toEqual(
      [
        "created_at", "provenance", "reason", "related_person", "result_id",
        "result_type", "route", "scope_label", "score", "source", "summary",
        "title", "updated_at",
      ].sort(),
    );
  });
});

describe("__internals — deterministic primitives", () => {
  it("tokenize drops stopwords + sub-2-char fragments", () => {
    const t = __internals.tokenize("What did we decide about Onboarding?");
    expect(t.has("decide")).toBe(true);
    expect(t.has("onboarding")).toBe(true);
    expect(t.has("what")).toBe(false);
    expect(t.has("we")).toBe(false);
  });
  it("deterministicScore weights the title above the body and is zero on no match", () => {
    const q = __internals.tokenize("onboarding");
    expect(__internals.deterministicScore(q, CANDIDATES[0]!).score).toBeGreaterThan(0);
    expect(__internals.deterministicScore(__internals.tokenize("zzzzz"), CANDIDATES[0]!).score).toBe(0);
  });
});
