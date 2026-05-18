// FILE: embedding.test.ts (unit)
// PURPOSE: Cover the embedding provider abstraction at G3.4 per
//          ADR-0043 §Sub-decision 3 (Q-G3-γ LOCK: text-embedding-3-small
//          @ 1536 dims). Tests use FixtureBasedEmbeddingProvider +
//          computeFixtureVector helper for deterministic behavior;
//          OpenAIEmbeddingProvider is tested only at construction time
//          (no network calls).
// CONNECTS TO: apps/api/src/services/embedding/embedding.service.ts
//              via @niov/api barrel re-export (per Q-G3.4-ι LOCK).
//
// CI RULE: no real OpenAI API calls. OpenAIEmbeddingProvider is
// instantiated only in tests that verify constructor behavior (missing
// env throws); never has generateEmbedding() called. All vector
// generation is deterministic via computeFixtureVector.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FixtureBasedEmbeddingProvider,
  OpenAIEmbeddingProvider,
  computeFixtureVector,
  getEmbeddingProvider,
  type EmbeddingProvider,
  type EmbeddingResult,
} from "@niov/api";

describe("computeFixtureVector", () => {
  it("is deterministic — same fixtureKey returns identical vector across calls", () => {
    const a = computeFixtureVector("test-key-001");
    const b = computeFixtureVector("test-key-001");
    expect(a).toEqual(b);
  });

  it("is unique — different fixtureKeys return different vectors", () => {
    const a = computeFixtureVector("test-key-001");
    const b = computeFixtureVector("test-key-002");
    const c = computeFixtureVector("test-key-003");
    expect(a).not.toEqual(b);
    expect(a).not.toEqual(c);
    expect(b).not.toEqual(c);
  });

  it("returns exactly 1536 elements (Q-G3-γ + Q-G3.3-γ dimension lock)", () => {
    const v = computeFixtureVector("any-key");
    expect(v.length).toBe(1536);
  });

  it("returns only finite numbers in the range [-1, 1]", () => {
    const v = computeFixtureVector("range-check-key");
    for (const x of v) {
      expect(Number.isFinite(x)).toBe(true);
      expect(x).toBeGreaterThanOrEqual(-1);
      expect(x).toBeLessThanOrEqual(1);
    }
  });
});

describe("FixtureBasedEmbeddingProvider", () => {
  const provider: EmbeddingProvider = new FixtureBasedEmbeddingProvider();

  it("requires opts.fixtureKey — throws when missing (strict-failure per ADR-0014 precedent)", async () => {
    await expect(provider.generateEmbedding({ text: "hello" })).rejects.toThrow(
      /fixtureKey is required/,
    );
    await expect(
      provider.generateEmbedding({ text: "hello" }, {}),
    ).rejects.toThrow(/fixtureKey is required/);
    await expect(
      provider.generateEmbedding({ text: "hello" }, { fixtureKey: "" }),
    ).rejects.toThrow(/fixtureKey is required/);
  });

  it("rejects empty/whitespace text with VALIDATION error_class", async () => {
    const emptyResult = await provider.generateEmbedding(
      { text: "" },
      { fixtureKey: "any-key" },
    );
    expect(emptyResult.ok).toBe(false);
    if (!emptyResult.ok) {
      expect(emptyResult.error_class).toBe("VALIDATION");
    }
    const whitespaceResult = await provider.generateEmbedding(
      { text: "   \n\t" },
      { fixtureKey: "any-key" },
    );
    expect(whitespaceResult.ok).toBe(false);
    if (!whitespaceResult.ok) {
      expect(whitespaceResult.error_class).toBe("VALIDATION");
    }
  });

  it("returns the canonical success shape with text-embedding-3-small + 1536 dims + tokens_used=0", async () => {
    const result = await provider.generateEmbedding(
      { text: "the quick brown fox" },
      { fixtureKey: "happy-path-001" },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.model).toBe("text-embedding-3-small");
      expect(result.dimensions).toBe(1536);
      expect(result.vector.length).toBe(1536);
      expect(result.tokens_used).toBe(0);
      // Vector should match the deterministic helper output for the same key.
      expect(result.vector).toEqual(computeFixtureVector("happy-path-001"));
    }
  });
});

describe("OpenAIEmbeddingProvider constructor", () => {
  const originalKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    if (originalKey !== undefined) {
      process.env.OPENAI_API_KEY = originalKey;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
  });

  it("throws when OPENAI_API_KEY env var is unset (fail-fast; no network call attempted)", () => {
    expect(() => new OpenAIEmbeddingProvider()).toThrow(
      /OPENAI_API_KEY env var is required/,
    );
  });

  it("instantiates cleanly when an apiKey is supplied via constructor arg", () => {
    expect(
      () => new OpenAIEmbeddingProvider({ apiKey: "sk-test-stub-not-real" }),
    ).not.toThrow();
  });
});

describe("getEmbeddingProvider factory", () => {
  it("returns an EmbeddingProvider instance (Q-G3.4-β: OpenAI default)", () => {
    const stubKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "sk-test-stub-not-real";
    try {
      const p = getEmbeddingProvider();
      expect(p).toBeInstanceOf(OpenAIEmbeddingProvider);
      expect(typeof p.generateEmbedding).toBe("function");
    } finally {
      if (stubKey !== undefined) {
        process.env.OPENAI_API_KEY = stubKey;
      } else {
        delete process.env.OPENAI_API_KEY;
      }
    }
  });
});

describe("EmbeddingResult discriminated-union narrowing", () => {
  it("ok:true branch exposes vector + model + dimensions + tokens_used; ok:false branch exposes error_class + message", async () => {
    const provider = new FixtureBasedEmbeddingProvider();
    const success = await provider.generateEmbedding(
      { text: "narrow-success" },
      { fixtureKey: "narrowing-001" },
    );
    if (success.ok) {
      // TypeScript narrowing: vector is number[], model is literal,
      // dimensions is 1536, tokens_used is number.
      expect(Array.isArray(success.vector)).toBe(true);
      expect(success.model).toBe("text-embedding-3-small");
      expect(success.dimensions).toBe(1536);
      expect(typeof success.tokens_used).toBe("number");
    } else {
      throw new Error("success path was expected; got ok:false");
    }

    const failure: EmbeddingResult = await provider.generateEmbedding(
      { text: "" },
      { fixtureKey: "narrowing-002" },
    );
    if (!failure.ok) {
      expect(failure.error_class).toBe("VALIDATION");
      expect(typeof failure.message).toBe("string");
      expect(failure.message.length).toBeGreaterThan(0);
    } else {
      throw new Error("failure path was expected; got ok:true");
    }
  });
});

describe("provider does not call OpenAI in unit tests", () => {
  it("FixtureBasedEmbeddingProvider has no network dependency (verified by import + run completing without OPENAI_API_KEY)", async () => {
    const originalKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const provider = new FixtureBasedEmbeddingProvider();
      const result = await provider.generateEmbedding(
        { text: "no-network-here" },
        { fixtureKey: "no-network-key" },
      );
      expect(result.ok).toBe(true);
      // vi.fn / vi.spyOn intentionally not used — the absence of an
      // OPENAI_API_KEY at this point would have caused a real OpenAI
      // call to fail. Fixture provider is provably independent.
    } finally {
      if (originalKey !== undefined) {
        process.env.OPENAI_API_KEY = originalKey;
      }
    }
  });
});

// Sanity for vi import usage (avoids unused-import lint if vi were not
// referenced elsewhere; some tests stub env directly without spies).
void vi;
