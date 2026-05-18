// FILE: embedding.service.ts
// PURPOSE: Embedding provider abstraction for ADR-0043 Gap 3 per
//          §Sub-decision 3 (Q-G3-γ LOCK: text-embedding-3-small @
//          1536 dimensions) + §Sub-decision 6 (Q-G3-ζ LOCK:
//          embeddings as PII per RULE 0). Single-file pattern per
//          Q-G3.4-α LOCK mirroring apps/api/src/services/llm/llm.service.ts.
// CONNECTS TO: openai SDK (already at package.json:42; no new dep
//              added at G3.4); future G3.5 write.service.ts
//              integration (mutation_type matrix per Q-G3-ι);
//              future G3.6 read.service.ts retrieval + COE
//              integration per Q-G3-δ. G3.4 ships provider only —
//              no caller integration at this register.
//
// PRIVACY INVARIANT (Q-G3-ζ LOCK + RULE 0):
//   Embedding vectors are server-side substrate ONLY.
//   - NEVER returned at the HTTP/gRPC API response boundary.
//   - NEVER logged (model, dimensions, tokens_used metadata is
//     permissible; vector content is NOT).
//   - NEVER sent to AI_AGENT entities denied content access (G3.5
//     write + G3.6 retrieval enforce per-capsule wallet_id +
//     ai_access_blocked + requires_validation gates per Q-G3-ζ).
//   - Embeddings are source-content-derived + PII-bearing per
//     RS-5 (Vec2Text + ALGEN + Zero2Text inversion attack
//     literature); they stay inside the Supabase trust boundary.

import { createHash } from "crypto";
import OpenAI from "openai";

// WHAT: The unified result shape every EmbeddingProvider must return.
// INPUT: Used as a return type only.
// OUTPUT: None — this is a discriminated union type.
// WHY: Mirrors LLMResult discriminated-union pattern at llm.service.ts:31.
//      `ok: true` exposes the vector + metadata; `ok: false` exposes
//      an error_class for caller branching. Per Q-G3.4-γ + Q-G3.4-δ
//      + Q-G3.4-κ LOCKS: 5 error classes (AUTH / RATE_LIMIT /
//      PROVIDER_ERROR / DIMENSION_MISMATCH / VALIDATION); vector type
//      is number[] (pgvector-compatible; JSON-friendly).
export type EmbeddingResult =
  | {
      ok: true;
      vector: number[];
      model: "text-embedding-3-small";
      dimensions: 1536;
      tokens_used: number;
    }
  | {
      ok: false;
      error_class:
        | "AUTH"
        | "RATE_LIMIT"
        | "PROVIDER_ERROR"
        | "DIMENSION_MISMATCH"
        | "VALIDATION";
      message: string;
    };

// WHAT: The unified embedding-provider interface.
// INPUT: { text } single-text input per Q-G3.4-ε LOCK (no batch
//        at G3.4; batch interface forward-substrate to G3.7 if
//        bulk backfill is later authorized).
//        opts.fixtureKey enables test-controlled dispatch for
//        FixtureBasedEmbeddingProvider per ADR-0014 precedent.
// OUTPUT: EmbeddingResult.
// WHY: Production code calls without opts (real OpenAI). Tests
//      pass opts.fixtureKey to opt into deterministic replay.
//      OpenAIEmbeddingProvider ignores opts; FixtureBasedEmbeddingProvider
//      requires opts.fixtureKey (strict-failure per ADR-0014).
export interface EmbeddingProvider {
  generateEmbedding(
    args: { text: string },
    opts?: { fixtureKey?: string },
  ): Promise<EmbeddingResult>;
}

// WHAT: Compute a deterministic 1536-dimensional number[] vector
//        from a fixtureKey via iterated SHA-256.
// INPUT: fixtureKey (operator-chosen, descriptive, kebab-case
//        identifier).
// OUTPUT: number[] of length 1536; each element in [-1, 1].
// WHY: Per Q-G3.4-γ LOCK: deterministic algorithmic fixture
//      generation; no file-based fixtures required; no network
//      dependency. Algorithm: iteratively hash `${fixtureKey}|${counter}`
//      until 1536 numbers are produced; each 32-byte SHA-256 digest
//      yields 16 numbers via 16-bit unsigned int pairs → /65535 * 2
//      - 1. Same fixtureKey always yields identical vector;
//      different keys yield different vectors (collision risk is
//      cryptographically negligible).
export function computeFixtureVector(fixtureKey: string): number[] {
  const vector: number[] = [];
  let counter = 0;
  while (vector.length < 1536) {
    const hash = createHash("sha256")
      .update(`${fixtureKey}|${counter}`)
      .digest();
    for (let i = 0; i + 1 < hash.length && vector.length < 1536; i += 2) {
      const high = hash[i];
      const low = hash[i + 1];
      if (high === undefined || low === undefined) {
        // Defensive: should never happen given the loop guard, but
        // satisfies noUncheckedIndexedAccess. Skip silently if it does.
        continue;
      }
      const word = (high << 8) | low;
      vector.push((word / 65535) * 2 - 1);
    }
    counter += 1;
  }
  return vector;
}

// WHAT: Validate input text and return a discriminated VALIDATION
//        error if it's not a usable string.
// INPUT: The raw input text.
// OUTPUT: null when input is valid; an EmbeddingResult error when not.
// WHY: Centralize the same validation in both providers so the
//      error_class:"VALIDATION" semantics are uniform.
function validateText(text: string): EmbeddingResult | null {
  if (typeof text !== "string" || text.trim().length === 0) {
    return {
      ok: false,
      error_class: "VALIDATION",
      message: "text must be a non-empty string",
    };
  }
  return null;
}

// WHAT: OpenAI embedding provider — production default.
// INPUT: { text } single-text input.
// OUTPUT: EmbeddingResult.
// WHY: Per Q-G3.4-β LOCK: getEmbeddingProvider() returns this
//      class by default. Hardcoded "text-embedding-3-small" per
//      Q-G3-γ LOCK + ADR-0043 §Sub-decision 3; hardcoded 1536
//      dimensions per Q-G3.3-γ Prisma lockstep. OPENAI_API_KEY
//      reused per Q-G3.4-θ LOCK (no new env var). Errors are
//      mapped to the 5 discriminated classes; vectors are returned
//      to the caller but NEVER logged (privacy invariant per
//      Q-G3-ζ + RULE 0). No CircuitBreaker wrapper at G3.4 per
//      Q-G3.4-ζ LOCK.
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  private readonly client: OpenAI;
  private readonly model = "text-embedding-3-small" as const;
  private readonly dimensions = 1536 as const;

  constructor(args: { apiKey?: string } = {}) {
    const apiKey = args.apiKey ?? process.env.OPENAI_API_KEY;
    if (typeof apiKey !== "string" || apiKey.length === 0) {
      throw new Error(
        "OpenAIEmbeddingProvider: OPENAI_API_KEY env var is required",
      );
    }
    this.client = new OpenAI({ apiKey });
  }

  async generateEmbedding(
    args: { text: string },
    _opts?: { fixtureKey?: string },
  ): Promise<EmbeddingResult> {
    const validation = validateText(args.text);
    if (validation !== null) {
      return validation;
    }
    try {
      const response = await this.client.embeddings.create({
        model: this.model,
        input: args.text,
        dimensions: this.dimensions,
      });
      const datum = response.data[0];
      const vector = datum?.embedding ?? [];
      if (vector.length !== this.dimensions) {
        return {
          ok: false,
          error_class: "DIMENSION_MISMATCH",
          message: `expected ${this.dimensions} dimensions; got ${vector.length}`,
        };
      }
      return {
        ok: true,
        vector,
        model: this.model,
        dimensions: 1536,
        tokens_used: response.usage.total_tokens,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // OpenAI SDK throws different error subclasses for AUTH (401)
      // and rate-limit (429). Map by status code when available;
      // fall back to message inspection; default to PROVIDER_ERROR.
      const statusFromErr = (err as { status?: unknown })?.status;
      const status = typeof statusFromErr === "number" ? statusFromErr : 0;
      let error_class: "AUTH" | "RATE_LIMIT" | "PROVIDER_ERROR" = "PROVIDER_ERROR";
      if (status === 401 || /unauthorized|invalid api key/i.test(message)) {
        error_class = "AUTH";
      } else if (status === 429 || /rate limit/i.test(message)) {
        error_class = "RATE_LIMIT";
      }
      return { ok: false, error_class, message };
    }
  }
}

// WHAT: Fixture-based embedding provider for deterministic CI tests.
// INPUT: { text } single-text input.
//        opts.fixtureKey is REQUIRED (strict-failure per ADR-0014
//        precedent at llm.service.ts FixtureBasedLLMProvider).
// OUTPUT: EmbeddingResult.
// WHY: Per Q-G3.4-γ LOCK: deterministic algorithmic fixture
//      provider (computeFixtureVector). Same fixtureKey always
//      yields identical vector. No file-based fixtures at G3.4
//      (Q-G3.4-γ defers file fixtures to later mini-arcs if
//      needed). Validates text input identically to
//      OpenAIEmbeddingProvider so error_class semantics are
//      uniform across providers. tokens_used returned as 0
//      (no real tokenization).
export class FixtureBasedEmbeddingProvider implements EmbeddingProvider {
  async generateEmbedding(
    args: { text: string },
    opts?: { fixtureKey?: string },
  ): Promise<EmbeddingResult> {
    if (
      opts === undefined ||
      typeof opts.fixtureKey !== "string" ||
      opts.fixtureKey.length === 0
    ) {
      throw new Error(
        "FixtureBasedEmbeddingProvider: opts.fixtureKey is required (strict-failure per ADR-0014 precedent)",
      );
    }
    const validation = validateText(args.text);
    if (validation !== null) {
      return validation;
    }
    return {
      ok: true,
      vector: computeFixtureVector(opts.fixtureKey),
      model: "text-embedding-3-small",
      dimensions: 1536,
      tokens_used: 0,
    };
  }
}

// WHAT: Production factory — returns the default embedding provider.
// INPUT: None.
// OUTPUT: EmbeddingProvider.
// WHY: Per Q-G3.4-β LOCK: returns OpenAIEmbeddingProvider by
//      default. No PREFERRED_EMBEDDING env switching at G3.4 (only
//      one production provider per Q-G3-γ LOCK; alternative
//      providers / self-hosted embeddings remain forward-substrate
//      per ADR-0043 §Sub-decision 10 deployment-target agnosticism).
//      Tests inject FixtureBasedEmbeddingProvider directly rather
//      than going through this factory.
export function getEmbeddingProvider(): EmbeddingProvider {
  return new OpenAIEmbeddingProvider();
}
