// FILE: otzar-transparency.test.ts (unit)
// PURPOSE: Pure-function coverage for the ADR-0051 Wave 1 transparency
//          projection (projectOtzarTransparency). No DB, no LLM, no
//          network -- exercises status mapping, access_limited derivation,
//          provenance construction, friendly source_type mapping, and the
//          security invariant that raw content / raw denied counts / vectors
//          / permission internals never appear in the serialized output.
// CONNECTS TO: apps/api/src/services/otzar/transparency.ts.

import { describe, expect, it } from "vitest";
import { projectOtzarTransparency } from "@niov/api";

// Build a COE-success-like object. We deliberately attach a `content`
// field (with a sentinel) to each context item -- mirroring the real
// AssembleContextSuccess shape -- to prove the mapper never serializes it.
function coeSuccess(
  items: Array<{ capsule_id: string; capsule_type: string; topic_tags: string[] }>,
  opts: {
    skipped_low_relevance?: number;
    skipped_budget?: number;
    denied_permission?: number;
  } = {},
) {
  return {
    ok: true as const,
    capsules_loaded: items.length,
    tokens_consumed: 100,
    capsules_skipped_low_relevance: opts.skipped_low_relevance ?? 0,
    capsules_skipped_budget: opts.skipped_budget ?? 0,
    capsules_denied_permission: opts.denied_permission ?? 0,
    context: items.map((i) => ({
      ...i,
      content: `RAW_SECRET_CONTENT_${i.capsule_id}`,
    })),
  };
}

const RAW_CONTENT_SENTINEL = "RAW_SECRET_CONTENT_";

describe("projectOtzarTransparency -- status mapping", () => {
  it("USED when COE succeeds with context items", () => {
    const { transparency, context_provenance } = projectOtzarTransparency({
      coe: coeSuccess([
        { capsule_id: "c1", capsule_type: "WORK_PATTERN", topic_tags: ["roadmap"] },
        { capsule_id: "c2", capsule_type: "DECISION", topic_tags: ["pricing"] },
      ]),
      context_items_used: 2,
    });
    expect(transparency.retrieval_status).toBe("USED");
    expect(transparency.retrieval_source).toBe("COE_ASSEMBLE_CONTEXT");
    expect(transparency.context_items_used).toBe(2);
    expect(context_provenance.length).toBe(2);
  });

  it("NO_MATCHES when COE succeeds with zero context", () => {
    const { transparency, context_provenance } = projectOtzarTransparency({
      coe: coeSuccess([]),
      context_items_used: 0,
    });
    expect(transparency.retrieval_status).toBe("NO_MATCHES");
    expect(context_provenance).toEqual([]);
  });

  it("DEGRADED when COE failed but chat proceeds", () => {
    const { transparency, context_provenance } = projectOtzarTransparency({
      coe: { ok: false },
      context_items_used: 0,
    });
    expect(transparency.retrieval_status).toBe("DEGRADED");
    expect(transparency.access_limited).toBe(false);
    expect(context_provenance).toEqual([]);
  });
});

describe("projectOtzarTransparency -- access_limited (coarse boolean only)", () => {
  it("access_limited true when denied permission count > 0, raw count NEVER serialized", () => {
    const result = projectOtzarTransparency({
      coe: coeSuccess(
        [{ capsule_id: "c1", capsule_type: "PREFERENCE", topic_tags: ["tone"] }],
        { denied_permission: 7 },
      ),
      context_items_used: 1,
    });
    expect(result.transparency.access_limited).toBe(true);
    const json = JSON.stringify(result);
    // The raw denied count (7) and the raw field name must NOT appear.
    expect(json).not.toContain("capsules_denied_permission");
    expect(json).not.toContain('"denied"');
    // The transparency block exposes no numeric "7" attributable to the
    // denied count (no field carries it).
    expect(result.transparency).not.toHaveProperty("capsules_denied_permission");
  });

  it("access_limited false when denied permission count is 0", () => {
    const result = projectOtzarTransparency({
      coe: coeSuccess(
        [{ capsule_id: "c1", capsule_type: "PREFERENCE", topic_tags: ["tone"] }],
        { denied_permission: 0 },
      ),
      context_items_used: 1,
    });
    expect(result.transparency.access_limited).toBe(false);
  });

  it("surfaces relevance + budget skip counts as plain numbers", () => {
    const { transparency } = projectOtzarTransparency({
      coe: coeSuccess([], { skipped_low_relevance: 4, skipped_budget: 2 }),
      context_items_used: 0,
    });
    expect(transparency.items_skipped_low_relevance).toBe(4);
    expect(transparency.items_skipped_budget).toBe(2);
  });
});

describe("projectOtzarTransparency -- context_provenance construction", () => {
  it("builds provenance ONLY from loaded permitted items; opaque id + friendly source + UNKNOWN scope", () => {
    const { context_provenance } = projectOtzarTransparency({
      coe: coeSuccess([
        { capsule_id: "cap-123", capsule_type: "WORK_PATTERN", topic_tags: ["q3-roadmap"] },
      ]),
      context_items_used: 1,
    });
    expect(context_provenance).toHaveLength(1);
    const item = context_provenance[0]!;
    expect(item.context_id).toBe("cap-123"); // opaque ref = permitted capsule_id
    expect(item.title).toBe("q3-roadmap");
    expect(item.source_type).toBe("Work pattern"); // friendly, not raw enum
    expect(item.scope).toBe("UNKNOWN");
    expect(item.content_available).toBe(true);
    expect(typeof item.reason).toBe("string");
    // Wave 1: per-item tokens_used + created_at omitted.
    expect(item.tokens_used).toBeUndefined();
    expect(item.created_at).toBeUndefined();
  });

  it("title is null when topic_tags is empty", () => {
    const { context_provenance } = projectOtzarTransparency({
      coe: coeSuccess([
        { capsule_id: "c1", capsule_type: "IDENTITY", topic_tags: [] },
      ]),
      context_items_used: 1,
    });
    expect(context_provenance[0]!.title).toBeNull();
  });

  it("maps unknown capsule_type to the safe fallback label (no raw enum leak)", () => {
    const { context_provenance } = projectOtzarTransparency({
      coe: coeSuccess([
        { capsule_id: "c1", capsule_type: "SOME_FUTURE_TYPE", topic_tags: ["x"] },
      ]),
      context_items_used: 1,
    });
    expect(context_provenance[0]!.source_type).toBe("Context");
  });

  it("never serializes raw ContextItem.content, vectors, or permission internals", () => {
    const result = projectOtzarTransparency({
      coe: coeSuccess(
        [
          { capsule_id: "c1", capsule_type: "DECISION", topic_tags: ["pricing"] },
          { capsule_id: "c2", capsule_type: "RISK", topic_tags: ["latency"] },
        ],
        { denied_permission: 2, skipped_low_relevance: 1, skipped_budget: 1 },
      ),
      context_items_used: 2,
    });
    const json = JSON.stringify(result);
    // Raw content (sentinel attached to every input item) must be absent.
    expect(json).not.toContain(RAW_CONTENT_SENTINEL);
    // A field literally named "content" must not appear ("content_available" is fine).
    expect(json).not.toContain('"content":');
    // No vectors / embeddings / prompts / chain-of-thought / permission internals.
    expect(json).not.toContain("vector");
    expect(json).not.toContain("embedding");
    expect(json).not.toContain("prompt");
    expect(json).not.toContain("chain_of_thought");
    expect(json).not.toContain("bridge_id");
    expect(json).not.toContain("capability_flags");
    expect(json).not.toContain("capsules_denied_permission");
  });
});

describe("projectOtzarTransparency -- Wave 1 fixed fields", () => {
  it("memory_updated false, tool_calls empty, approval_required false, verification NOT_ACTIVE", () => {
    const { transparency } = projectOtzarTransparency({
      coe: coeSuccess([
        { capsule_id: "c1", capsule_type: "DECISION", topic_tags: ["t"] },
      ]),
      context_items_used: 1,
    });
    expect(transparency.memory_updated).toBe(false);
    expect(transparency.tool_calls).toEqual([]);
    expect(transparency.approval_required).toBe(false);
    expect(transparency.verification_status).toBe("NOT_ACTIVE");
  });
});
