// FILE: similarity.service.ts
// PURPOSE: COSMP similarity search via pgvector cosine distance with
//          RULE 0 SQL-tier privacy filters + HNSW iterative scan
//          posture + audit emission BEFORE response per RULE 4.
//          Standalone retrieval API per ADR-0043 §G3.6; does NOT
//          integrate with COE retrieval (Q-G3.6-ε defers integration).
// CONNECTS TO: AuthService (validates session); EmbeddingProvider
//              (generates query embedding); MemoryCapsule via raw SQL
//              (Prisma generated client cannot project the
//              Unsupported("vector(1536)") column per ADR-0043 §G3.3);
//              audit_events via writeAuditEvent emitting
//              CAPSULE_SIMILARITY_SEARCH literal per ADR-0043 §G3.6.

import { prisma, writeAuditEvent } from "@niov/database";
import type { AuthService } from "../auth.service.js";
import type { EmbeddingProvider, EmbeddingResult } from "../embedding/embedding.service.js";

// WHAT: Caller input for similarity search.
// INPUT: Used as a parameter type only.
// OUTPUT: None -- this is a type.
// WHY: query_text is server-side only; never logged, persisted, or
//      audited per Q-G3-ζ + Q-G3.6-δ + RULE 0.
export interface SimilaritySearchInput {
  query_text: string;
  topK?: number;
  minSimilarity?: number;
}

// WHAT: A single match returned by similarity search.
// INPUT: Used as a return type only.
// OUTPUT: None -- this is a type.
// WHY: Q-G3.6-γ.1: NO vector / NO distance / NO embedding fields exposed
//      at the API boundary. Only capsule_id + capsule_type +
//      payload_summary cross the trust boundary.
export interface SimilarityMatch {
  capsule_id: string;
  capsule_type: string;
  payload_summary: string;
}

// WHAT: Happy-path success result.
// INPUT: Used as a return type only.
// OUTPUT: None -- this is a type.
// WHY: Provider call succeeded; pgvector returned matches (possibly
//      0 -- empty result is still SUCCESS per Q-G3.6-ι). HTTP
//      response shape per Q-G3.6-γ.1 + V2 Correction 4: capsule
//      identifiers and minimal non-vector metadata only; no
//      embedding-prefixed fields (those live in audit details only
//      per Q-G3.6-δ).
export interface SimilaritySuccess {
  ok: true;
  matches: SimilarityMatch[];
  result_count: number;
  topK: number;
}

// WHAT: Degraded-path SUCCESS (provider failure).
// INPUT: Used as a return type only.
// OUTPUT: None -- this is a type.
// WHY: Q-G3.6-θ degrade-on-failure: provider failure is NEVER DENIED.
//      Capsule retrieval is gracefully empty; failure_class +
//      failure_message surface the provider-tier error for client
//      observability (NEVER raw vector content). Audit details use
//      embedding_* prefixed names per Q-G3.6-δ LOCK; HTTP response
//      uses prefix-free names per V2 Correction 4 (no "embedding"
//      substring in HTTP body).
export interface SimilarityDegraded {
  ok: true;
  matches: [];
  result_count: 0;
  topK: number;
  degraded: true;
  failure_class: string;
  failure_message: string;
}

// WHAT: Auth/session/permission/caller-bug failure shape.
// INPUT: Used as a return type only.
// OUTPUT: None -- this is a type.
// WHY: Only true denials surface as ok:false. Provider failure +
//      empty result both stay ok:true per Q-G3.6-θ + Q-G3.6-ι.
export interface SimilarityFailure {
  ok: false;
  code:
    | "SESSION_INVALID"
    | "SESSION_EXPIRED"
    | "SESSION_REVOKED"
    | "SESSION_INVALIDATED"
    | "OPERATION_NOT_PERMITTED"
    | "QUERY_INVALID"
    | "TOPK_OUT_OF_RANGE"
    | "WALLET_MISSING";
  message: string;
}

const TOPK_DEFAULT = 10;
const TOPK_MAX = 50;

const FILTERS_APPLIED = [
  "wallet_scope",
  "deleted_at_null",
  "ai_access_blocked_false",
  "requires_validation_false",
  "clearance_required_lte",
  "embedding_not_null",
] as const;

// WHAT: Coordinates COSMP similarity search.
// INPUT: AuthService + EmbeddingProvider (explicit deps; no
//        production defaults per Q-G3.6-ζ).
// OUTPUT: A class with searchBySimilarity method.
// WHY: Constructor injection keeps tests cleanly composable -- they
//      can swap in a FixtureBasedEmbeddingProvider or a custom mock
//      provider per E1-E12 pattern from G3.5.
export class SimilarityService {
  constructor(
    private readonly authService: AuthService,
    private readonly embeddingProvider: EmbeddingProvider,
  ) {}

  // WHAT: Search for capsules whose embedding is nearest to the
  //        embedding of the query_text, scoped to the session's wallet
  //        and filtered by RULE 0 privacy invariants.
  // INPUT: Session token, search input (query_text + optional topK +
  //        optional minSimilarity), optional context (ip_address).
  // OUTPUT: SimilaritySuccess / SimilarityDegraded / SimilarityFailure.
  // WHY: Q-G3.6-γ raw SQL with 6 mandatory privacy filters BEFORE
  //      ORDER BY; HNSW iterative scan posture per Q-G3.6-γ.2.
  //      Audit emission BEFORE response per RULE 4 (CAPSULE_SIMILARITY_SEARCH).
  async searchBySimilarity(
    sessionToken: string,
    input: SimilaritySearchInput,
    context: { ip_address?: string | null } = {},
  ): Promise<SimilaritySuccess | SimilarityDegraded | SimilarityFailure> {
    // Compute query_length once at the top so details bodies do
    // not need to reference input.query_text inline (audit-details
    // privacy boundary per Q-G3.6-δ + Tier 1 Gate 14 scoped scan).
    const queryLength =
      typeof input.query_text === "string" ? input.query_text.length : 0;

    // Step 1: validateSession per RULE 5
    const session = await this.authService.validateSession(
      sessionToken,
      "read",
    );
    if (!session.valid) {
      await this.emitSimilarityAudit({
        outcome: "DENIED",
        actorEntityId: null,
        code: session.code,
        ipAddress: context.ip_address ?? null,
        details: {
          query_length: queryLength,
          topK: input.topK ?? TOPK_DEFAULT,
          minSimilarity: input.minSimilarity ?? null,
          result_count: 0,
          filters_applied: [],
          embedding_generated: false,
        },
      });
      return { ok: false, code: session.code, message: "Search denied" };
    }

    // Step 2: validate query_text presence + non-empty
    if (typeof input.query_text !== "string" || queryLength === 0) {
      await this.emitSimilarityAudit({
        outcome: "DENIED",
        actorEntityId: session.entity_id,
        code: "QUERY_INVALID",
        ipAddress: context.ip_address ?? null,
        details: {
          query_length: 0,
          topK: input.topK ?? TOPK_DEFAULT,
          minSimilarity: input.minSimilarity ?? null,
          result_count: 0,
          filters_applied: [],
          embedding_generated: false,
        },
      });
      return {
        ok: false,
        code: "QUERY_INVALID",
        message: "Query input must be a non-empty string",
      };
    }

    // Step 3: validate topK per Q-G3.6-η (default 10; max 50; reject larger)
    const requestedTopK = input.topK ?? TOPK_DEFAULT;
    if (
      typeof requestedTopK !== "number" ||
      !Number.isInteger(requestedTopK) ||
      requestedTopK < 1 ||
      requestedTopK > TOPK_MAX
    ) {
      await this.emitSimilarityAudit({
        outcome: "DENIED",
        actorEntityId: session.entity_id,
        code: "TOPK_OUT_OF_RANGE",
        ipAddress: context.ip_address ?? null,
        details: {
          query_length: queryLength,
          topK: requestedTopK,
          minSimilarity: input.minSimilarity ?? null,
          result_count: 0,
          filters_applied: [],
          embedding_generated: false,
        },
      });
      return {
        ok: false,
        code: "TOPK_OUT_OF_RANGE",
        message: `topK must be an integer in [1, ${TOPK_MAX}]`,
      };
    }
    const resolvedTopK = requestedTopK;

    // Step 4: resolve wallet (mandatory per Q-G3-ζ wallet-scoping)
    const wallet = await prisma.wallet.findUnique({
      where: { entity_id: session.entity_id },
      select: { wallet_id: true },
    });
    if (wallet === null) {
      await this.emitSimilarityAudit({
        outcome: "DENIED",
        actorEntityId: session.entity_id,
        code: "WALLET_MISSING",
        ipAddress: context.ip_address ?? null,
        details: {
          query_length: queryLength,
          topK: resolvedTopK,
          minSimilarity: input.minSimilarity ?? null,
          result_count: 0,
          filters_applied: [],
          embedding_generated: false,
        },
      });
      return {
        ok: false,
        code: "WALLET_MISSING",
        message: "Session entity has no wallet",
      };
    }

    // Step 5: query embedding generation per Q-G3.6-θ degrade
    let embeddingResult: EmbeddingResult;
    try {
      embeddingResult = await this.embeddingProvider.generateEmbedding(
        { text: input.query_text },
        { fixtureKey: session.entity_id },
      );
    } catch (err) {
      embeddingResult = {
        ok: false,
        error_class: "PROVIDER_ERROR",
        message: err instanceof Error ? err.message : String(err),
      };
    }

    if (!embeddingResult.ok) {
      // Q-G3.6-θ: provider failure is degraded SUCCESS (NOT DENIED).
      // No vector SQL is issued; existing embeddings preserved; the
      // caller gets an empty match set and observability metadata.
      await this.emitSimilarityAudit({
        outcome: "SUCCESS",
        actorEntityId: session.entity_id,
        ipAddress: context.ip_address ?? null,
        details: {
          query_length: queryLength,
          topK: resolvedTopK,
          minSimilarity: input.minSimilarity ?? null,
          result_count: 0,
          filters_applied: [],
          embedding_generated: false,
          embedding_failure_class: embeddingResult.error_class,
          embedding_failure_message: embeddingResult.message,
        },
      });
      return {
        ok: true,
        matches: [],
        result_count: 0,
        topK: resolvedTopK,
        degraded: true,
        failure_class: embeddingResult.error_class,
        failure_message: embeddingResult.message,
      };
    }

    // Step 6: build pgvector text literal for parameterized cast
    const vectorLiteral = `[${embeddingResult.vector.join(",")}]`;

    // Step 7: issue raw SQL inside transaction so SET LOCAL applies
    // to the SELECT. Q-G3.6-γ.2: HNSW iterative scan posture per
    // RULE 21 research arc (pgvector filter-after-scan default
    // caveat; iterative scan canonical remediation in pgvector
    // 0.8.0+; our pinned image is 0.8.2).
    const matches = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL hnsw.iterative_scan = strict_order");
      await tx.$executeRawUnsafe("SET LOCAL hnsw.ef_search = 100");
      return await tx.$queryRawUnsafe<SimilarityMatch[]>(
        `SELECT capsule_id, capsule_type, payload_summary
         FROM memory_capsules
         WHERE wallet_id = $2::uuid
           AND deleted_at IS NULL
           AND ai_access_blocked = false
           AND requires_validation = false
           AND clearance_required <= $3
           AND embedding IS NOT NULL
         ORDER BY embedding <=> $1::vector(1536) ASC
         LIMIT $4`,
        vectorLiteral,
        wallet.wallet_id,
        session.clearance_ceiling,
        resolvedTopK,
      );
    });

    // Step 8: emit SUCCESS audit BEFORE response per RULE 4.
    // Q-G3.6-ι: empty matches is SUCCESS (not DENIED).
    await this.emitSimilarityAudit({
      outcome: "SUCCESS",
      actorEntityId: session.entity_id,
      ipAddress: context.ip_address ?? null,
      details: {
        query_length: queryLength,
        topK: resolvedTopK,
        minSimilarity: input.minSimilarity ?? null,
        result_count: matches.length,
        filters_applied: [...FILTERS_APPLIED],
        embedding_generated: true,
      },
    });

    return {
      ok: true,
      matches,
      result_count: matches.length,
      topK: resolvedTopK,
    };
  }

  // WHAT: Single-source audit emitter for CAPSULE_SIMILARITY_SEARCH.
  // INPUT: outcome ("SUCCESS" | "DENIED") + actor + optional code +
  //        ip_address + details object.
  // OUTPUT: void promise; resolves once the audit row is durably
  //         persisted by writeAuditEvent.
  // WHY: V2 Correction 5: neutral helper name. Single helper for
  //      both SUCCESS (happy / empty / degraded) and DENIED (auth /
  //      caller-bug) paths. Forbidden audit fields per Q-G3.6-δ are
  //      NEVER constructed inside details: no query_text,
  //      no truncated query, no query_keywords, no query vector,
  //      no result vectors. Details object only carries the 8
  //      allowed-field set (query_length / topK / minSimilarity /
  //      result_count / filters_applied / embedding_generated +
  //      embedding_failure_class / embedding_failure_message in
  //      degraded path).
  private async emitSimilarityAudit(input: {
    outcome: "SUCCESS" | "DENIED";
    actorEntityId: string | null;
    code?: string;
    ipAddress: string | null;
    details: Record<string, unknown>;
  }): Promise<void> {
    await writeAuditEvent({
      event_type: "CAPSULE_SIMILARITY_SEARCH",
      outcome: input.outcome,
      actor_entity_id: input.actorEntityId,
      ip_address: input.ipAddress,
      denial_reason: input.outcome === "DENIED" ? (input.code ?? null) : null,
      details: input.details,
    });
  }
}
