# ADR-0043 — pgvector Embedding (text-embedding-3-small @ 1536 dims; HNSW + cosine)

## Status

Proposed 2026-05-17

G3.1 LOCKS architecture only at canonical-prose register substantively. G3.1
does NOT close Gap 3 at canonical-state register substantively. G3.1 does NOT
change schema, CI, code, tests, or Elixir. G3.1 is docs-only. Gap 3 closure
requires G3.2-G3.10 substantively per §Sub-decision 11 (Q-G3-κ) — including
conditional G3.7 backfill and conditional G3.8 Elixir.

## Context

Per ADR-0041 §Sub-decision 3 (CL.1 LOCKED 2026-05-17 at
`[BEAM-CAPSULE-LAYER-QLOCK]`), Sub-arc 2 Gap 3 pgvector Embedding canonicalizes
semantic retrieval for the Memory Capsule layer. ADR-0041 LOCKED the index
strategy (HNSW + cosine per Q-E) and the embedding model (text-embedding-3-small
at 1536 dimensions per Q-F) at the umbrella register substantively; ADR-0043
canonicalizes the substrate decisions at canonical-execution register
substantively for the G3.2-G3.10 mini-arc.

### Substrate-state ground truth (G1.6 register substantively)

1. `MemoryCapsule` has no vector field. Schema at
   `packages/database/prisma/schema.prisma:95-187`. Indexes:
   wallet_id / entity_id / capsule_type / decay_type / storage_tier /
   deleted_at / jurisdiction / topic_tags (Gin). No vector / HNSW / IVFFlat
   index.
2. Test + CI Postgres image is vanilla `postgres:16.4-alpine` —
   `docker-compose.test.yml` L7; `.github/workflows/ci.yml` L70/L134/L202;
   `.github/workflows/nightly-real-llm.yml` L41. Vanilla image does NOT
   include pgvector.
3. Prisma 6.1.0 at `packages/database/package.json` (`"prisma": "^6.1.0"`,
   `"@prisma/client": "^6.1.0"`).
4. No pre-existing OpenAI embedding code substrate. Existing OpenAI usage is
   chat-completion only at `apps/api/src/services/llm/llm.service.ts` +
   `apps/api/src/services/otzar/*.ts` + `scripts/record-llm-fixtures.ts`.
5. `apps/api/src/services/otzar/priming.ts:150` + L158 contain `// vector
   similarity is Section 14+` and `// vector similarity replaces this in
   Section 14+` TODO comments — the existing "Section 14+" anchors are the
   substrate that ADR-0043 closes.

### Gap 1 mutation_type substrate (load-bearing for Q-G3-ι)

Gap 1 G1.2-G1.5 LANDED `dfcbbb1` / `16c562c` / `8f047de` / `3505fde` /
`16567eb` per ADR-0042 §G1.6 Closure Cascade. `mutation_type MutationType?`
nullable column on MemoryCapsule + `discriminateMutation` helper at
`apps/api/src/services/cosmp/write.service.ts` + content_hash split-discriminator
collectively provide the substrate that drives embedding regeneration policy.

### RULE 21 research arc (embedded; current public sources retrieved 2026-05-17)

Per RULE 21 (PRE-AUTHORIZATION RESEARCH ARC), G3.1 executed 7 WebSearches +
1 WebFetch against current public sources before authoring this ADR.

- **RS-1 — pgvector-enabled Postgres Docker image (2026):** the pgvector
  project publishes official Docker images at
  `https://hub.docker.com/r/pgvector/pgvector`. Canonical tag pattern for
  PostgreSQL 16: `pgvector/pgvector:pg16` (also `pg16-trixie`,
  `pg16-bookworm`). Current pgvector library version: **0.8.2**. The
  pgvector/pgvector image follows the same release cadence as the upstream
  postgres image; recent release was 2 days prior to retrieval date.
- **RS-2 — Prisma 6 + postgresqlExtensions preview feature status (2026):**
  Native pgvector support in Prisma ORM is "coming soon" per Prisma blog
  (`https://www.prisma.io/blog/orm-6-13-0-ci-cd-workflows-and-pgvector-for-prisma-postgres`).
  As of Prisma 6, `Unsupported("vector")` fields are NOT generated in the
  TypeScript types (Prisma Issue #27857), making typed Prisma Client access
  to vector columns infeasible. `previewFeatures = ["postgresqlExtensions"]`
  + `extensions = [vector]` enables migrations with vector columns but
  Prisma Studio + generated client remain incomplete. **Implication for
  Q-G3-β:** G3.3 must use raw SQL (`$queryRaw` / `$executeRaw`) for vector
  reads + writes, not generated Prisma Client typed access. The Prisma
  schema declaration documents the column for documentation + migration
  purposes; runtime access is raw-SQL.
- **RS-3 — OpenAI text-embedding-3-small pricing (2026):** $0.02 per million
  tokens (Standard API) per
  `https://developers.openai.com/api/docs/models/text-embedding-3-small`.
  Batch API discount: $0.01 per million tokens. Rate limit specifics
  (tokens/minute ceiling) require operator-tier dashboard access; not
  publicly documented at fixed numbers; ADR-0043 §Consequences acknowledges
  rate-limit handling is a G3.4 provider-implementation concern.
- **RS-4 — pgvector HNSW canonical defaults (2026):** Default `m = 16`,
  `ef_construction = 64` per pgvector README + Neon canonical guide
  (`https://neon.com/blog/understanding-vector-search-and-hnsw-index-with-pgvector`).
  Reasonable `m` range: 5-48. Canonical SQL pattern: `CREATE INDEX ON items
  USING hnsw (embedding vector_cosine_ops);` — defaults applied
  automatically when WITH clause omitted. Higher `ef_construction` (e.g.,
  100) trades index build time for higher recall.
- **RS-5 — Embedding inversion attack literature (2024-2026):** Vec2Text
  (Morris et al. 2023) recovers ~92% of 32-token sequences from victim
  embeddings using T5 encoder-decoder + iterative correction. ALGEN
  (`https://arxiv.org/html/2507.07700v1`) demonstrates ~1000 paired samples
  suffice for cross-encoder linear alignment, achieving ROUGE-L 45-50.
  Zero2Text + ZSInvert (`https://arxiv.org/html/2602.01757v2`) perform
  zero-shot inversion in black-box cross-domain settings without paired
  training data. Mitigations: noise injection (significant utility cost),
  embedding quantization (8-bit naive + zeropoint reduces reconstruction
  while preserving retrieval). **Implication for Q-G3-ζ:** embeddings ARE
  PII-bearing under RULE 0; access policy must treat them as source-content-
  equivalent.
- **RS-6 — Matryoshka Representation Learning truncation (2024-2026):**
  OpenAI text-embedding-3 family uses MRL natively. Truncation to any
  dimension between 256 and 1536 via the `dimensions` API parameter without
  retraining
  (`https://medium.com/data-science-collective/matryoshka-embeddings-how-to-make-vector-search-5x-faster-f9fdc54d5ffd`).
  text-embedding-3-large at 256 dimensions outperforms text-embedding-ada-002
  at its full 1536 dimensions on MTEB benchmarks per OpenAI publication.
  **Implication for Q-G3-γ + Q-G3-α:** Matryoshka truncation is a real
  forward-substrate option for storage/compute optimization without
  retraining; ADR-0043 documents it as forward-substrate only — no
  truncation in first implementation.
- **RS-7 — Supabase pgvector availability (2026):** HNSW is the 2026 default
  on Supabase per Supabase HNSW Indexes guide
  (`https://supabase.com/docs/guides/ai/vector-indexes/hnsw-indexes`).
  pgvector 0.7.0 (March 2024) added HNSW indexing; pgvector 0.8.2 (late
  2025) is included by default on Supabase. Both HNSW and IVFFlat index
  types are production-supported; Supabase recommends HNSW for most use
  cases. **Production parity confirmed:** ADR-0018 deployment-target
  agnosticism preserved — Supabase (production), AWS RDS for PostgreSQL
  (sovereign-cloud), self-hosted Postgres (on-premise + air-gapped) all
  support pgvector + HNSW.

### ADR-0041 Q-E and Q-F LOCK contradiction check

RS-1 through RS-7 evaluated against ADR-0041 §Sub-decision 3 LOCKS:

- **Q-E LOCK (HNSW + cosine for active-write + high-recall):** RS-4 + RS-7
  CONFIRM. HNSW is the 2026 production default. Cosine (`vector_cosine_ops`)
  is canonical operator class. No contradiction.
- **Q-F LOCK (text-embedding-3-small at 1536 dimensions production default):**
  RS-3 CONFIRMS pricing at $0.02/1M tokens (matches umbrella assumption).
  RS-6 documents Matryoshka truncation as forward-substrate option without
  invalidating the 1536-dim production default. No contradiction.

Per Q-G3-ε hard-STOP discipline: no Q-E/Q-F contradiction surfaced. ADR-0043
proceeds at canonical-prose register substantively.

## Decision

ADR-0043 LOCKS 11 sub-decisions Q-G3-α through Q-G3-κ canonicalized at Founder
disposition `[CAPSULE-EMBEDDING-ADR-0043-QLOCK-DISPOSITION]`.

### Sub-decision 1 (Q-G3-α): pgvector-enabled Postgres image

Pinning a pgvector-enabled Postgres image at local/test/CI register
substantively LOCKED. The specific image pin is forward-substrate to G3.2.
Substrate-state acknowledged: current image is vanilla `postgres:16.4-alpine`
at `docker-compose.test.yml`, `.github/workflows/ci.yml` (3 service blocks),
`.github/workflows/nightly-real-llm.yml`. ADR-0013 + ADR-0015 + ADR-0016
amendment forward-authorized at G3.2 to land the image pin via the
Pin-and-Optimize framework. **No image change at G3.1.** RS-1 + RS-4 + RS-7
canonical evidence: `pgvector/pgvector:pg16` family (e.g., `pg16-trixie` /
`pg16-bookworm` / `pg16`) is the canonical pgvector-enabled image lineage;
G3.2 selects the exact tag and pins it per ADR-0016.

### Sub-decision 2 (Q-G3-β): Prisma-owned DDL with raw-SQL post-push support

Per ADR-0033 §Decision 7 cross-language data-ownership boundary, Prisma owns
MemoryCapsule DDL. ADR-0043 specifies:

- The nullable `embedding Unsupported("vector(1536)")?` field declaration is
  deferred to G3.3 substantively at `packages/database/prisma/schema.prisma`.
- Raw-SQL post-push scripts are deferred to G3.3 substantively:
  `scripts/apply-pgvector-extension.ts` (`CREATE EXTENSION IF NOT EXISTS
  vector;`) + `scripts/apply-hnsw-index.ts` (`CREATE INDEX ... USING hnsw
  (embedding vector_cosine_ops);` with `CONCURRENTLY` in production).
- The pattern follows `scripts/apply-audit-triggers.ts` (the ADR-0002
  audit-trigger application precedent at ADR-0013 §Decision step 3).
- `previewFeatures = ["postgresqlExtensions"]` + `extensions = [vector]`
  declared at the Prisma schema only if RS-2 substrate-state at G3.3
  execution confirms compatibility; otherwise raw-SQL-only approach.
- Per RS-2 finding: Prisma generated client does NOT typed-expose
  `Unsupported("vector(N)")` columns (Prisma Issue #27857). Vector read +
  write at runtime MUST use `prisma.$queryRaw` / `prisma.$executeRaw`, not
  generated typed access. The Prisma schema declaration is documentation +
  migration-tier only.
- NO Prisma Migrate. NO migrations directory. ADR-0025 schema-push-target
  discipline preserved (`scripts/prisma-db-push-test.sh` fail-closed
  localhost validation).

### Sub-decision 3 (Q-G3-γ): embedding model

`text-embedding-3-small` at **1536 dimensions** production default LOCKED
(matches ADR-0041 Q-F LOCK). `text-embedding-3-large` documented as premium /
future tier per RS-3 ($0.13/1M tokens; ~2 MTEB points higher; 3072 dims
default). Matryoshka truncation (256 / 512 / 1024 dims per RS-6) forward-
substrate only — no truncation in first implementation unless RS-3 cost
projections or RS-1 storage projections at later operational evaluation
prove truncation is required. Forward-substrate disposition is documented;
ADR-0043 §Sub-decision 3 does NOT authorize truncation at G3.4 or later
unless Founder explicitly amends.

### Sub-decision 4 (Q-G3-δ): combined_score / ADR-0022 preservation

**NO ADR-0022 amendment at G3.1.** **NO `combined_score` change at G3.1.**
The substrate-locked formula at `apps/api/src/services/coe/keywords.ts:87-93`
(`tagOverlap * 0.45 + baseRelevance * 0.35 + recency * 0.20`) is preserved
verbatim. Vector similarity is treated first as a retrieval/ranking
candidate signal at G3.6 register substantively; one of four downstream
integration paths must be selected by Founder at G3.6:

- (a) replace `tagOverlap` with `vectorSim` (re-coefficient with sum = 1.00)
- (b) introduce `vectorSim` as a 4th coefficient (re-coefficient all four;
  sum = 1.00)
- (c) rerank top-K results from existing `combined_score` by `vectorSim`
  (no formula change)
- (d) prefilter candidate pool by `vectorSim` then score by existing
  `combined_score` (no formula change)

Paths (c) and (d) do NOT touch ADR-0022. Paths (a) and (b) REQUIRE
Founder-authorized ADR-0022 amendment per RULE 20 at the relevant later G3
commit. ADR-0043 §G3.1 makes no commitment to any specific path — disposition
is forward-substrate to G3.6.

### Sub-decision 5 (Q-G3-ε): hybrid write-first / lazy-backfill

Embedding generation strategy LOCKED hybrid:

- ADD writes generate embedding inline at create-time (G3.5 register).
- UPDATE re-generates embedding when content_hash differs (G3.5 register).
- MERGE re-generates embedding (G3.5 register).
- NOOP preserves existing embedding; performs zero embedding work; zero
  storage/schema side effect (G3.5 register).
- Legacy capsules (created before G3.5 LANDS) are embedded lazily on first
  read/search at G3.6 register substantively OR via optional operator
  backfill at G3.7 register substantively.
- Bulk-backfill script (`scripts/backfill-embeddings.ts`) remains
  forward-substrate at G3.7 conditional register substantively unless
  Founder explicitly authorizes later. Default disposition: lazy-on-first-
  read suffices for production rollout.

Rationale: avoids blocking Gap 3 closure on expensive historical backfill
($10K+ at billion-capsule scale per RS-3 projection) while making new
substrate immediately useful.

### Sub-decision 6 (Q-G3-ζ): RULE 0 / embedding privacy

Embeddings = source-content-derived + potentially PII-bearing per RULE 0
(HUMANS ARE ALWAYS SOVEREIGN). RS-5 canonical evidence: Vec2Text recovers
~92% of 32-token sequences; ALGEN linear alignment at ~1000 paired samples
achieves ROUGE-L 45-50; Zero2Text + ZSInvert perform zero-shot black-box
cross-domain inversion. Embeddings cannot be treated as anonymized
representations.

ADR-0043 LOCKS the following privacy invariants:

- Embeddings live inside the same trust boundary as source content
  (Supabase Postgres production; on-premise Postgres for air-gapped
  deployments per ADR-0018).
- Raw embedding vectors are NEVER returned to users, AI_AGENT entities, or
  external clients by default. Embeddings are server-side substrate only.
- Similarity search at G3.6 register substantively MUST enforce all of:
  `wallet_id` (no cross-wallet leakage; ADR-0006 pattern) + entity
  permissions (Permission rows per ADR-0001) + `clearance_required <=
  session.clearance_ceiling` + `deleted_at IS NULL` + `ai_access_blocked`
  pre-check (ADR-0026 + negotiate.service.ts:436 pattern) +
  `requires_validation` gate (negotiate.service.ts:457 pattern).
- AI_AGENT entities MUST never receive embedding-derived access to content
  they could not otherwise read via NEGOTIATE+READ. The vector retrieval
  path does NOT bypass the per-capsule access scope.
- Embedding search MUST NOT become cross-wallet or cross-entity retrieval.
  Wallet-scoping is mandatory at every search invocation.

### Sub-decision 7 (Q-G3-η): audit literal proposal

NEW append-only audit-event literal `CAPSULE_SIMILARITY_SEARCH` proposed at
canonical-prose register substantively at G3.1 (docs-only mention; ADR
prose only). G3.1 does NOT add the literal to
`packages/database/src/queries/audit.ts` `AUDIT_EVENT_TYPE_VALUES` set; that
substantive edit is deferred to G3.6 retrieval commit per ADR-0042 §G1.2
+ Q-γ.1 clean-transition pattern (extend AUDIT_EVENT_TYPE_VALUES by
appending; no replacement; no deletion per RULE 10).

Similarity search at G3.6 register substantively MUST audit before response
per RULE 4 (AUDIT TRAIL IS SACRED). The audit event details include:
`wallet_id`, `actor_id`, `query_keywords_redacted` (no raw vectors in audit
details per Q-G3-ζ), `result_count`, `topK`, `minSimilarity` threshold.

### Sub-decision 8 (Q-G3-θ): Elixir disposition

**β-A LOCKED: skip Ecto vector field for now.** Per ADR-0033 §Decision 7
cross-language data-ownership boundary, Prisma owns `memory_capsules` DDL.
Elixir does NOT currently need vector reads — the cosmp_router COSMP
coordination layer at `apps/cosmp_router/lib/cosmp_router/` operates over
7-layer Capsule struct (ADR-0031) + 30-field MemoryCapsule Ecto mirror
(ADR-0033 §3a) without vector-similarity requirements. ADR-0043 LOCKS:

- `pgvector_ex` hex dependency NOT added in first implementation.
- Ecto `embedding` field NOT added to `CosmpRouter.MemoryCapsule` mirror.
- A contributor-discipline note at
  `apps/cosmp_router/lib/cosmp_router/schemas/memory_capsule.ex` moduledoc
  declaring "embedding column is Prisma-owned; not exposed at Ecto
  register" is deferred to G3.3 register substantively (forward; not at
  G3.1).
- If a later preflight proves Elixir vector access is needed (e.g., for
  Phase 4+ cross-language ranking or COSMP-tier semantic policy), G3.8
  conditional register substantively lands the `pgvector_ex` dependency +
  Ecto field + Translator extension via Founder authorization. Until then,
  β-A skip is the default disposition.

### Sub-decision 9 (Q-G3-ι): mutation_type integration

Direct dependency on Gap 1 mutation_type semantics LOCKED. The embedding
regeneration matrix is governed by `mutation_type`:

| `mutation_type` | content_hash behavior | embedding action |
|---|---|---|
| `ADD` | NEW (capsule create) | generate embedding |
| `UPDATE` | changed (content replacement) | regenerate embedding |
| `MERGE` | changed (content merged) | regenerate embedding |
| `NOOP` | UNCHANGED (audit-only path) | preserve; zero embedding work; zero storage write |

The "content changes" detection is already substrate at G1.3 — per ADR-0042
§Sub-decision Q-ε split-discriminator (content_hash + canonical_record +
version/expected_version), `discriminateMutation` at
`apps/api/src/services/cosmp/write.service.ts` returns one of
ADD/UPDATE/MERGE/NOOP. G3.5 retrieval commit reads the discriminator value
and gates the embedding-generation call accordingly.

### Sub-decision 10 (deployment-agnosticism)

Per ADR-0018 deployment-target agnosticism posture, pgvector substrate
preserves deployment-target agnosticism:

- Supabase (production current operator deployment) — pgvector + HNSW
  production-supported per RS-7.
- AWS RDS for PostgreSQL (sovereign-cloud target per ADR-0018) — pgvector
  available; HNSW supported on RDS Postgres 15.4+ and 16.x.
- Self-hosted Postgres (on-premise + air-gapped) — `pgvector/pgvector:pg16`
  image + manual extension install.

The embedding provider abstraction at G3.4 register substantively preserves
the same posture — OpenAI text-embedding-3-small as default, self-hosted
local model (bge-small / sentence-transformers / similar) forward-substrate
for air-gapped deployments per ADR-0019 cryptographic-suite-posture +
ADR-0018 deployment-target-agnosticism worked-example pattern.

### Sub-decision 11 (Q-G3-κ): mini-arc decomposition

G3 mini-arc: 10 commits with G3.7 + G3.8 conditional. Per-commit tag prefix:
mixed `BEAM-CAPSULE-EMBEDDING-*` and `CAPSULE-EMBEDDING-*` (per ADR-0042
§Q-ν G1 LOCK precedent).

- **G3.1** `[BEAM-CAPSULE-EMBEDDING-ADR]` — docs-only ADR-0043 NEW Proposed
  + Q-G3-α through Q-G3-κ LOCKS + RULE 21 research arc embedded.
- **G3.2** `[CAPSULE-EMBEDDING-INFRA]` — pgvector image switch
  (`docker-compose.test.yml` + 3 CI workflow service blocks) + ADR-0013 /
  ADR-0015 / ADR-0016 amendments. No capsule behavior change.
- **G3.3** `[CAPSULE-EMBEDDING-SCHEMA]` — Prisma `embedding
  Unsupported("vector(1536)")?` field + `apply-pgvector-extension.ts` +
  `apply-hnsw-index.ts` + `test-db-up.sh` integration + (conditional)
  `postgresqlExtensions` preview feature. No write-service behavior change.
- **G3.4** `[CAPSULE-EMBEDDING-PROVIDER]` — `embedding.service.ts` +
  OpenAIEmbeddingProvider + FixtureBasedEmbeddingProvider (ADR-0014 mirror
  pattern). No capsule write integration.
- **G3.5** `[CAPSULE-EMBEDDING-WRITE-INTEGRATION]` — write.service.ts
  integration via Q-G3-ι regeneration matrix. Per-mutation audit metadata
  minimalism.
- **G3.6** `[CAPSULE-EMBEDDING-RETRIEVAL]` — `searchBySimilarity` +
  wallet-scoped + permission-scoped retrieval per Q-G3-ζ +
  `CAPSULE_SIMILARITY_SEARCH` audit literal + COE integration disposition
  per Q-G3-δ.
- **G3.7** (conditional) `[CAPSULE-EMBEDDING-BACKFILL]` — lazy-on-first-
  read default; optional bulk operator script only if Founder authorizes.
- **G3.8** (conditional) `[CAPSULE-EMBEDDING-ELIXIR]` — default skip per
  Q-G3-θ β-A LOCK unless Elixir vector access becomes necessary.
- **G3.9** `[CAPSULE-EMBEDDING-TESTS]` — unit + integration coverage +
  RULE 0 access boundary tests + provider fixture tests + vector search
  tests.
- **G3.10** `[BEAM-CAPSULE-EMBEDDING-CLOSURE]` — docs-only closure cascade;
  ADR-0043 Status Proposed → Accepted; Gap 3 CLOSED; Sub-arc 2 remains
  IN FLIGHT pending Gap 4 + Gap 5 + optional Gap 6.

Founder authorization explicit at G3.1 substantive landing per RULE 20 at
`[BEAM-CAPSULE-EMBEDDING-ADR-G3.1-EXECUTE-VERIFY-AUTH]`.

## Consequences

**Positive:**

- Semantic retrieval enabled at Foundation register substantively; closes
  the "Section 14+ vector similarity" anchors at `priming.ts:150` + L158.
- Gap 1 mutation_type integration is clean: NOOP preserves embedding with
  zero work; UPDATE/MERGE regenerate; ADD generates fresh.
- Lazy-on-first-read backfill default avoids billion-scale up-front
  embedding cost (~$10K+ at OpenAI text-embedding-3-small $0.02/1M token
  pricing per RS-3 + ~500 tokens/capsule average).
- RULE 0 preservation explicit at every privacy boundary; AI_AGENT vector-
  retrieval scope locked to entity-permitted content only.
- Deployment-target agnosticism preserved per ADR-0018 — Supabase + AWS RDS
  + self-hosted all support pgvector + HNSW per RS-7.
- `combined_score` formula at ADR-0022 preserved verbatim at G3.1; vector
  similarity integration disposition deferred to G3.6 with four candidate
  paths enumerated.

**Negative:**

- pgvector image change at G3.2 cascades to ADR-0013 + ADR-0015 + ADR-0016
  amendments (the Pin-and-Optimize framework substrate).
- Prisma `Unsupported("vector(1536)")` field-type support is INCOMPLETE per
  RS-2 (Prisma Issue #27857) — runtime access at G3.4 + G3.5 + G3.6 MUST
  use `prisma.$queryRaw` / `prisma.$executeRaw` instead of generated typed
  Prisma Client access.
- OpenAI dependency widens (already present for chat completions; now
  extended to embeddings via NEW `embedding.service.ts` at G3.4).
- Embedding storage at billion-capsule scale = ~12 TB raw (1536 dims × 8
  bytes × 1B); HNSW index adds 2-5× overhead. Q-G3-γ + Q-G3-α forward-
  substrate Matryoshka truncation per RS-6 is the canonical mitigation
  path if cost/storage pressure emerges.

**Risks (carried from G3.0 preflight R-1 through R-12; no new risks
introduced at G3.1):**

R-1 through R-12 per G3.0 preflight enumerated. R-2 (Prisma vector handling)
is partially mitigated by Sub-decision 2 explicit raw-SQL discipline per RS-2
finding. R-3 (ADR-0022 amendment) is fully deferred per Sub-decision 4 LOCK.
R-5 (embedding inversion) is mitigated by Sub-decision 6 trust-boundary +
no-raw-vector-return invariants.

## Alternatives Considered

- **(a) Vanilla Postgres + extension-install-at-startup:** rejected. Q-G3-α
  prefers pinned pgvector-enabled image for reliability + Pin-and-Optimize
  framework discipline (ADR-0016). Container-startup install adds failure
  surface + slowdown without correlated benefit.
- **(b) Self-hosted local embedding model (bge-small, sentence-transformers):**
  forward-substrate per ADR-0018 air-gapped deployment-target pattern.
  OpenAI default at G3.4 preserves provider abstraction; local model is a
  drop-in alternate provider for air-gapped deployments. Not in G3.1 scope.
- **(c) Replace `combined_score` formula at G3.1:** Q-G3-δ LOCKED NO. ADR-0022
  preserved verbatim; integration disposition deferred to G3.6 with four
  candidate paths.
- **(d) Bulk-script-only backfill:** rejected per Q-G3-ε hybrid LOCK.
  Rate-limit + cost-projection unacceptable up-front for legacy capsule
  fleet. Lazy-on-first-read default suffices for production rollout.
- **(e) Add Ecto vector mirror at G3.1:** rejected per Q-G3-θ β-A LOCK.
  Elixir does not need vector access at current substrate register. β-B
  forward-substrate available if proven necessary.
- **(f) Async embedding queue at write path:** deferred. Sub-decision 5
  LOCKS inline generation at create-time + update-time. Async queue is a
  forward-substrate scaling option if write-path latency exceeds RULE 4
  audit-before-response budget at production load (not currently
  evidenced).

## References

**RULES + ADRs:**

- RULE 0 (HUMANS ARE ALWAYS SOVEREIGN) — Q-G3-ζ embedding privacy invariants
- RULE 4 (AUDIT TRAIL IS SACRED) — Q-G3-η audit-before-response
- RULE 10 (NOTHING IS EVER DELETED) — Q-G3-η audit-literal extension
  (append-only)
- RULE 11 (WIDER KNOWLEDGE CHECK FOR ELIXIR/BEAM SUBSTRATE) — Q-G3-θ Elixir
  disposition basis
- RULE 13 (SURFACE DRIFTS INLINE OVER SILENT FIX) — Q-G3-ε hard-STOP
  discipline on Q-E/Q-F contradiction
- RULE 20 (RULE-MODIFICATION AUTHORITY) — ADR-0022 amendment requires
  Founder authorization at G3.6
- RULE 21 (PRE-AUTHORIZATION RESEARCH ARC FOR SUBSTRATE-ARCHITECTURAL
  PASTES) — RS-1 through RS-7 + WebFetch embedded at §Context
- ADR-0002 (append-only audit chain) — Q-G3-η audit-literal precedent
- ADR-0011 (three-tier test stratification) — G3.2 + G3.9 test-substrate
  reference
- ADR-0013 (containerized Postgres test substrate) — G3.2 forward amendment
- ADR-0015 (CI workflow architecture Decision E) — G3.2 forward amendment
- ADR-0016 (Pin-and-Optimize framework) — G3.2 forward worked example
- ADR-0018 (deployment-target agnosticism posture) — Sub-decision 10
- ADR-0020 (two-register IP discipline) — patent-implementation evidence
  register
- ADR-0022 (combined_score formula canonicalization) — Q-G3-δ explicit NO
  amendment at G3.1
- ADR-0025 (schema-push-target discipline) — Sub-decision 2 preservation
- ADR-0026 §5 (6 BEAM-compatibility patterns) — Q-G3-ζ + Q-G3-θ posture
- ADR-0033 §Decision 7 (cross-language data-ownership boundary) — Q-G3-β
  Prisma-owned DDL + Q-G3-θ β-A skip Ecto
- ADR-0034 (BEAM testability discipline) — G3.9 forward test pattern
- ADR-0035 (substrate-build discipline) — potential cluster expansion at
  G3.10
- ADR-0041 §Sub-decision 3 (parent umbrella; Gap 3 forward-substrate;
  Q-E + Q-F LOCKS load-bearing)
- ADR-0042 (Gap 1 mutation_type substrate; Q-G3-ι integration load-bearing)

**Patents:**

- US 12,517,919 (COSMP Protocol; 7-layer Capsule semantic structure)
- US 12,164,537 (DMW + Foundation primitives)
- US 12,399,904 (DMW + Foundation primitives)

**RS-1 through RS-7 current public sources (retrieved 2026-05-17):**

- RS-1: `https://hub.docker.com/r/pgvector/pgvector` +
  `https://github.com/pgvector/pgvector` (WebFetch) — pgvector Docker
  image canonical tags + version 0.8.2 + HNSW canonical SQL.
- RS-2:
  `https://www.prisma.io/blog/orm-6-13-0-ci-cd-workflows-and-pgvector-for-prisma-postgres`
  + Prisma Issue #27857 (`Unsupported("vector")?` not generated) — Prisma
  6 vector-type generated-client incomplete state; raw-SQL discipline
  required.
- RS-3: `https://developers.openai.com/api/docs/models/text-embedding-3-small`
  + 2026 pricing references — $0.02/1M Standard, $0.01/1M Batch.
- RS-4: `https://neon.com/blog/understanding-vector-search-and-hnsw-index-with-pgvector`
  + pgvector README — default m=16, ef_construction=64 with cosine ops.
- RS-5: `https://arxiv.org/html/2507.07700v1` (ALGEN reproducibility) +
  `https://arxiv.org/html/2602.01757v2` (Zero2Text) + Vec2Text canonical
  source — embedding inversion threat landscape + mitigations.
- RS-6: `https://medium.com/data-science-collective/matryoshka-embeddings-how-to-make-vector-search-5x-faster-f9fdc54d5ffd`
  + OpenAI Matryoshka announcement — MRL native in text-embedding-3 family;
  256-1536 truncation via `dimensions` API parameter.
- RS-7: `https://supabase.com/docs/guides/ai/vector-indexes/hnsw-indexes`
  + Supabase pgvector documentation — HNSW + IVFFlat production-supported;
  HNSW 2026 default; pgvector 0.8.2 bundled.
