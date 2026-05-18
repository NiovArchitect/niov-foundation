# ADR-0043 — pgvector Embedding (text-embedding-3-small @ 1536 dims; HNSW + cosine)

## Status

Accepted 2026-05-18

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

## G3.2 Progress — Image Pin LANDED (2026-05-17)

G3.2 `[CAPSULE-EMBEDDING-INFRA]` LANDS the pgvector-enabled Postgres
image pin per §Sub-decision 1 (Q-G3-α LOCK). ADR-0013 + ADR-0015 +
ADR-0016 amended in-place at G3.2 per Q-G3.2-γ / Q-G3.2-δ / Q-G3.2-ε
LOCKS at `[CAPSULE-EMBEDDING-INFRA-G3.2-QLOCK]`.

**LOCKED image pin** (Founder α-A selection per Q-G3.2-α):
`pgvector/pgvector:0.8.2-pg16-trixie`

**Substrate sites at G3.2 LANDED register:**

- 5 substantive image substitutions across 3 infra files
  (`docker-compose.test.yml` L7 + `.github/workflows/ci.yml` 3 service
  blocks at Unit / Integration / Elixir tiers + `.github/workflows/nightly-real-llm.yml`).
- 4 prose/comment refresh sites at `.github/workflows/ci.yml` per
  Q-G3.2-β LOCK (header comment + 2 `docker ps --filter ancestor=` failure-diagnostic lines + Elixir tier comment).
- Post-G3.2 invariant: zero `postgres:16.4-alpine` references remain
  in `docker-compose.test.yml` + `.github/workflows/`.

**Scope boundaries preserved at G3.2:**

- G3.2 does NOT close Gap 3 at canonical-state register substantively;
  Gap 3 remains IN FLIGHT.
- G3.2 does NOT change `schema.prisma`; the Prisma `embedding
  Unsupported("vector(1536)")?` field remains forward-substrate to G3.3.
- G3.2 does NOT add `scripts/apply-pgvector-extension.ts` or
  `scripts/apply-hnsw-index.ts`; raw-SQL post-push scripts remain
  forward-substrate to G3.3 per §Sub-decision 2 (Q-G3-β LOCK).
- G3.2 does NOT run `CREATE EXTENSION vector`; the extension binary is
  present in the new image but the extension is inert until G3.3.
- G3.2 does NOT touch `scripts/test-db-up.sh`; the 3-step bring-up
  delegates the image choice entirely to `docker-compose.test.yml`.
- ADR-0022 NOT amended at G3.2 — Q-G3-δ LOCK preserved; the
  `combined_score` formula at `apps/api/src/services/coe/keywords.ts:87-93`
  is untouched.
- ADR-0041 NOT amended at G3.2 (parent umbrella unchanged).
- CI label staleness (Unit tier `(371 tests)` / Integration tier
  `(111 tests + 1 skipped)`) remains DEFERRED per Q-G3.2-ζ KEEP DEFERRED;
  preserved forward-substrate from G1.6.

**Forward-substrate at G3.3 register substantively:** Prisma schema
field + `apply-pgvector-extension.ts` + `apply-hnsw-index.ts` +
`test-db-up.sh` post-push integration + (conditional)
`previewFeatures = ["postgresqlExtensions"]` per §Sub-decision 2
Q-G3-β LOCK; G3.4-G3.10 unchanged from §Sub-decision 11 Q-G3-κ
mini-arc decomposition.

**Founder authorization explicit at G3.2 substantive landing per
RULE 20 at `[CAPSULE-EMBEDDING-INFRA-G3.2-EXECUTE-VERIFY-AUTH]`.**

ADR-0043 Status preserved at `Proposed 2026-05-17` (the ADR remains
Proposed; G3.10 closure cascade is the eventual Status transition
to Accepted at canonical-state register substantively per
§Sub-decision 11 Q-G3-κ).

## G3.3 Progress — Schema + Extension + HNSW Index LANDED (2026-05-17)

G3.3 `[CAPSULE-EMBEDDING-SCHEMA]` LANDS the Prisma `embedding
Unsupported("vector(1536)")?` field per §Sub-decision 2 (Q-G3-β LOCK) +
`previewFeatures = ["postgresqlExtensions"]` + `extensions = [vector]`
per Q-G3.3-γ LOCK + NEW raw-SQL post-push scripts per Q-G3.3-ζ LOCK +
5-step `test-db-up.sh` orchestration per Q-G3.3-θ LOCK + CI/nightly
orchestration per Q-G3.3-η LOCK.

**Schema substrate at G3.3 LANDED register:**

- `packages/database/prisma/schema.prisma` generator block extended
  with `previewFeatures = ["postgresqlExtensions"]`; datasource block
  extended with `extensions = [vector]`.
- MemoryCapsule nullable `embedding Unsupported("vector(1536)")?` field
  placed immediately after `mutation_type` per Q-G3.3-δ LOCK (content-
  derived sibling clustering with Gap-1 attribution chain + content_hash
  + version).
- Per RS-2 (Prisma Issue #27857), the generated TypeScript client OMITS
  the `Unsupported(...)` field from the `MemoryCapsule` type. All 30+
  existing `prisma.memoryCapsule.*` call sites continue to work
  unchanged. Runtime vector access (forward-substrate G3.4-G3.6) uses
  `prisma.$queryRaw` / `$executeRaw` only.

**Extension substrate at G3.3 LANDED register:**

- NEW `scripts/apply-pgvector-extension.ts` per Q-G3.3-ζ LOCK. Wraps
  `CREATE EXTENSION IF NOT EXISTS vector;` for command-line invocation
  via `prisma.$executeRawUnsafe`. Idempotent. MUST run BEFORE
  `prisma db push` so the `vector` type is registered when Prisma
  applies the `embedding` column ALTER TABLE.

**HNSW index substrate at G3.3 LANDED register:**

- NEW `scripts/apply-hnsw-index.ts` per Q-G3.3-ζ LOCK. Wraps:
  `CREATE INDEX IF NOT EXISTS memory_capsules_embedding_hnsw_idx ON
  memory_capsules USING hnsw (embedding vector_cosine_ops) WHERE
  embedding IS NOT NULL AND deleted_at IS NULL;` — partial index per
  Q-G3.3-β LOCK (skips legacy unembedded capsules + RULE 10 soft-
  deleted rows); defaults `m = 16`, `ef_construction = 64` per
  Q-G3.3-ε LOCK + RS-4 pgvector canonical defaults (no explicit WITH
  clause). Idempotent. MUST run AFTER `prisma db push` so the
  `embedding` column exists.

**5-step `scripts/test-db-up.sh` bring-up per Q-G3.3-θ LOCK:**

1. `docker compose up postgres`
2. `npx tsx scripts/apply-pgvector-extension.ts` (extension; before db push)
3. `bash scripts/prisma-db-push-test.sh` (schema push)
4. `npx tsx scripts/apply-audit-triggers.ts` (audit triggers)
5. `npx tsx scripts/apply-hnsw-index.ts` (HNSW index; after db push)

**CI orchestration per Q-G3.3-η LOCK:**

`.github/workflows/ci.yml` 3 service-bearing jobs (Unit + Integration +
Elixir tiers) + `.github/workflows/nightly-real-llm.yml` real-LLM tier
all run the same 4 substrate steps in canonical order: extension →
prisma push → audit triggers → HNSW index.

**Scope boundaries preserved at G3.3:**

- G3.3 does NOT close Gap 3 at canonical-state register substantively;
  Gap 3 remains IN FLIGHT.
- G3.3 does NOT add the embedding provider (forward-substrate to G3.4).
- G3.3 does NOT touch `write.service.ts` (forward-substrate to G3.5).
- G3.3 does NOT add `searchBySimilarity` or COE integration (forward-
  substrate to G3.6).
- G3.3 does NOT touch any application code, tests, Elixir source,
  `.husky/pre-commit`, `package.json`, `docker-compose.test.yml`, or
  any other ADR (no ADR-0011/0013/0015/0016/0022/0025/0033/0034/0035/
  0041/0042 amendments).
- ADR-0022 NOT amended (Q-G3-δ LOCK preserved); the `combined_score`
  formula at `apps/api/src/services/coe/keywords.ts:87-93` remains
  untouched.
- ADR-0041 NOT amended (parent umbrella unchanged).
- ADR-0043 Status preserved at `Proposed 2026-05-17` (the ADR remains
  Proposed through G3.4-G3.9; G3.10 closure cascade is the eventual
  Status transition to Accepted).
- Elixir Ecto schema at `apps/cosmp_router/lib/cosmp_router/schemas/
  memory_capsule.ex` NOT updated (Q-G3-θ β-A LOCK preserved); Ecto
  schema field_list stays at 30; DB has 31 columns; extra column is
  invisible to Ecto via subset-only field discipline.

**Substrate-state observation surfaced at G3.3 register substantively
per Q-G3.3-λ LOCK (docs-only acknowledgment; NO ADR-0035 promotion
at G3.3):**

**D-G3.3-LOCAL-CONTAINER-DRIFT.** During G3.3.0 preflight (post-G3.2),
`docker ps` showed the running local test DB container was still using
the stale `postgres:16.4-alpine` image (started ~7 hours pre-G3.2);
the docker-compose.test.yml declaration (G3.2 substrate) correctly
specified `pgvector/pgvector:0.8.2-pg16-trixie`. CI uses fresh
containers per job and was unaffected (G3.2 CI 4/4 success at run
`26012726529` verified). G3.3 verification refreshed the local
container per Q-G3.3-ι (β): `docker compose down` + `up -d postgres`
re-pulled the pgvector image. Observation deferred to G3.10 closure
cascade for potential ADR-0035 cluster expansion if recurrence is
proven across future mini-arc cycles.

**Forward-substrate at G3.4-G3.10 register substantively (unchanged
from G3.1 §Sub-decision 11 Q-G3-κ enumeration):** G3.4
`[CAPSULE-EMBEDDING-PROVIDER]` NEW `embedding.service.ts` +
OpenAIEmbeddingProvider + FixtureBasedEmbeddingProvider; G3.5
`[CAPSULE-EMBEDDING-WRITE-INTEGRATION]` write-service via Q-G3-ι
mutation_type matrix; G3.6 `[CAPSULE-EMBEDDING-RETRIEVAL]`
searchBySimilarity + CAPSULE_SIMILARITY_SEARCH audit literal + COE
integration disposition per Q-G3-δ; G3.7 conditional backfill; G3.8
conditional Elixir; G3.9 tests; G3.10 docs-only closure cascade.

**Founder authorization explicit at G3.3 substantive landing per
RULE 20 at `[CAPSULE-EMBEDDING-SCHEMA-G3.3-EXECUTE-VERIFY-AUTH]`.**

## G3.4 Progress — Embedding Provider Substrate LANDED (2026-05-17)

G3.4 `[CAPSULE-EMBEDDING-PROVIDER]` LANDS the embedding provider
abstraction per §Sub-decision 11 (Q-G3-κ) + 12 Q-G3.4 sub-decisions /
locks Q-G3.4-α through Q-G3.4-λ at
`[CAPSULE-EMBEDDING-PROVIDER-G3.4-QLOCK]`.

**Single-file structure per Q-G3.4-α LOCK** at
`apps/api/src/services/embedding/embedding.service.ts` mirroring
`apps/api/src/services/llm/llm.service.ts` pattern.

**Exports:**

- `interface EmbeddingProvider` — single-text-per-call signature per
  Q-G3.4-ε LOCK; opts.fixtureKey enables ADR-0014-style test dispatch.
- `type EmbeddingResult` — discriminated union per Q-G3.4-γ + Q-G3.4-δ
  + Q-G3.4-κ LOCKS. `ok: true` exposes `vector: number[]` (1536 dims;
  pgvector-compatible) + `model: "text-embedding-3-small"` +
  `dimensions: 1536` + `tokens_used: number`. `ok: false` exposes one
  of 5 error_class values: AUTH / RATE_LIMIT / PROVIDER_ERROR /
  DIMENSION_MISMATCH / VALIDATION.
- `class OpenAIEmbeddingProvider implements EmbeddingProvider` —
  production default per Q-G3.4-β LOCK. Reuses `OPENAI_API_KEY` per
  Q-G3.4-θ LOCK (no new env var; openai SDK 6.35.0 already at
  `package.json` L42 — no new dependency at G3.4). Hardcoded
  `text-embedding-3-small` per Q-G3-γ LOCK; hardcoded 1536 dimensions
  per Q-G3.3-γ Prisma lockstep. Maps OpenAI errors to discriminated
  classes via status-code + message inspection.
- `class FixtureBasedEmbeddingProvider implements EmbeddingProvider` —
  deterministic CI test provider. opts.fixtureKey REQUIRED
  (strict-failure per ADR-0014 precedent). Validates text input
  identically to OpenAI provider; returns
  `vector: computeFixtureVector(fixtureKey)` + tokens_used: 0.
- `function getEmbeddingProvider(): EmbeddingProvider` — factory
  returns OpenAIEmbeddingProvider by default per Q-G3.4-β LOCK. No
  PREFERRED_EMBEDDING env switching at G3.4.
- `function computeFixtureVector(fixtureKey: string): number[]` —
  deterministic SHA-256-iterated algorithm per Q-G3.4-γ LOCK. Same
  fixtureKey always yields identical 1536-element vector with values
  in `[-1, 1]`. No file-based fixtures required at G3.4.

**No CircuitBreaker wrapper at G3.4 per Q-G3.4-ζ LOCK** — provider is
not yet integrated into write path; circuit-breaker can be added at
G3.5 only if write-path latency/rate-limit posture requires it.

**Barrel re-export per Q-G3.4-ι LOCK** at `apps/api/src/index.ts`
following the canonical `llm.service.ts` precedent at L264-275 (verified
during preflight): `EmbeddingProvider` + `EmbeddingResult` (types) +
`OpenAIEmbeddingProvider` + `FixtureBasedEmbeddingProvider` +
`getEmbeddingProvider` + `computeFixtureVector` (classes/functions)
exported via `./services/embedding/embedding.service.js` path.

**Unit tests per Q-G3.4-η LOCK** at `tests/unit/embedding.test.ts` —
10 test cases covering: computeFixtureVector determinism / uniqueness
/ dimension / range; FixtureBasedEmbeddingProvider strict-fixtureKey
behavior / validation / canonical success shape; OpenAIEmbeddingProvider
constructor missing-key fail-fast / instantiates-with-explicit-apiKey;
getEmbeddingProvider factory shape; discriminated-union narrowing;
no-network independence proof. No real OpenAI calls in any test.

**Privacy invariant per Q-G3-ζ LOCK + RULE 0:** vectors are server-side
substrate only; never returned at the HTTP/gRPC API response boundary;
never logged (model / dimensions / tokens_used metadata is permissible;
vector content is NOT); never sent to AI_AGENT entities denied content
access per future G3.5 write + G3.6 retrieval gate enforcement at
wallet_id + ai_access_blocked + requires_validation registers. The
embedding service contains NO logger.* calls referencing vector
content (Tier 1 Gate 8 verifies).

**Scope boundaries preserved at G3.4:**

- G3.4 does NOT close Gap 3 at canonical-state register substantively;
  Gap 3 remains IN FLIGHT.
- G3.4 does NOT integrate into write.service.ts (forward-substrate to
  G3.5 per Q-G3-ι mutation_type matrix).
- G3.4 does NOT integrate into read.service.ts / coe.service.ts
  (forward-substrate to G3.6).
- G3.4 does NOT add the `CAPSULE_SIMILARITY_SEARCH` audit literal
  (forward-substrate to G3.6).
- G3.4 does NOT amend ADR-0022 (Q-G3-δ LOCK preserved); the
  `combined_score` formula remains untouched.
- G3.4 does NOT touch `schema.prisma`, DB scripts
  (`apply-pgvector-extension.ts` / `apply-hnsw-index.ts` /
  `test-db-up.sh` / `prisma-db-push-test.sh`), CI workflows,
  `docker-compose.test.yml`, `.husky/pre-commit`, `package.json`,
  lockfiles, or any other ADR (no ADR-0011 / 0013 / 0014 / 0015 /
  0016 / 0022 / 0025 / 0033 / 0034 / 0035 / 0041 / 0042 amendments).
- G3.4 does NOT add a new dependency — `openai: ^6.35.0` already at
  `package.json` L42.
- ADR-0043 Status preserved at `Proposed 2026-05-17`.

**Forward-substrate at G3.5-G3.10 register substantively (unchanged
from G3.1 §Sub-decision 11 Q-G3-κ enumeration):** G3.5
`[CAPSULE-EMBEDDING-WRITE-INTEGRATION]` write.service.ts via Q-G3-ι
mutation_type matrix (ADD→generate / UPDATE+MERGE→regenerate /
NOOP→preserve); G3.6 `[CAPSULE-EMBEDDING-RETRIEVAL]` searchBySimilarity
+ CAPSULE_SIMILARITY_SEARCH audit literal + COE integration disposition
per Q-G3-δ; G3.7 conditional backfill; G3.8 conditional Elixir; G3.9
integration tests; G3.10 docs-only closure cascade.

**Founder authorization explicit at G3.4 substantive landing per
RULE 20 at `[CAPSULE-EMBEDDING-PROVIDER-G3.4-EXECUTE-VERIFY-AUTH]`.**

## G3.5 Progress — Write Integration LANDED (2026-05-17)

G3.5 `[CAPSULE-EMBEDDING-WRITE-INTEGRATION]` LANDS the write-path
embedding integration per §Sub-decision 9 (Q-G3-ι mutation_type
matrix) + 12 Q-G3.5 sub-decisions / locks Q-G3.5-α through Q-G3.5-λ
at `[CAPSULE-EMBEDDING-WRITE-G3.5-QLOCK]`.

**Failure policy — degrade gracefully per Q-G3.5-α LOCK (RULE 0):**
embedding provider errors do NOT block the user write. The capsule
row lands; the embedding column remains NULL on failure; audit
metadata records the failure class + message for observability;
G3.7 lazy backfill catches missing embeddings. The Founder
disposition reasoning is that an OpenAI outage MUST NOT block
human entities from exercising their RULE 0 sovereignty over
their own memory.

**MERGE skips provider regeneration per Q-G3.5-β LOCK:** when
`discriminateMutation` returns `MERGE` (content_hash unchanged;
metadata-only delta), the provider is NOT called and the
existing embedding column is preserved by skipping the raw SQL
write. The MERGE audit details record
`embedding_generated: false` +
`embedding_skip_reason: "merge_metadata_only_content_unchanged"`.

**Inline raw SQL per Q-G3.5-γ LOCK:** Prisma generated client
cannot project the `Unsupported("vector(1536)")` column (per
§G3.3 + Q-G3-β + RS-2 Prisma Issue #27857). Embedding
persistence runs inside the existing `prisma.$transaction` block
via
`tx.$executeRawUnsafe('UPDATE memory_capsules SET embedding = $1::vector(1536) WHERE capsule_id = $2::uuid', vectorLiteral, capsuleId)`
at 2 substantive sites (`createCapsule` post-`tx.memoryCapsule.create`
+ `updateCapsule` UPDATE branch post-`tx.memoryCapsule.update`).
The `vectorLiteral` = `'[' + vector.join(',') + ']'` is the
canonical pgvector text input form. No new helper in
`packages/database/src/queries/capsule.ts` per Q-G3.5-γ — the
raw SQL is co-located with the call site.

**6th constructor arg per Q-G3.5-δ LOCK:** `WriteService`
constructor accepts `embeddingProvider: EmbeddingProvider` as
the 6th positional arg. `apps/api/src/server.ts` passes
`getEmbeddingProvider()` (returns `OpenAIEmbeddingProvider`
default per Q-G3.4-β). No new env-var; no
`PREFERRED_EMBEDDING` switching at G3.5.

**Test injection per Q-G3.5-ε LOCK:** `tests/unit/cosmp/write.test.ts`
`makeServices()` defaults to `FixtureBasedEmbeddingProvider` so
the 26 baseline G1.5 tests run unchanged. The 9 NEW G3.5 tests
E1-E9 inject custom mock providers via plain object `{ generateEmbedding: vi.fn().mockResolvedValue(...) }`
to exercise success / MERGE-skip / NOOP-skip / degrade behavior.
`tests/unit/feedback.test.ts` `makeServices()` updated
identically with `FixtureBasedEmbeddingProvider` 6th arg.

**Integration tests per Q-G3.5-ζ LOCK:** NEW
`tests/integration/embedding-write.test.ts` exercises 3 substrate-
state invariants — I1 createCapsule persists non-NULL embedding
via `prisma.$queryRawUnsafe` round-trip; I2 HTTP response shape
has no `vector` / `embedding` field at the API-boundary privacy
register; I3 MERGE branch preserves the prior embedding column
byte-equal across `embedding::text` cast read-back. No real
OpenAI calls; `FixtureBasedEmbeddingProvider` only.

**Audit metadata fields per Q-G3.5-η LOCK:**

| mutation_type | Provider called | Embedding DB write | Audit metadata |
|---|---|---|---|
| ADD (createCapsule) | yes | yes on `ok: true`; skip on `ok: false` | success: `embedding_generated/embedding_model/embedding_dimensions/embedding_tokens_used`; degrade: `embedding_generated: false, embedding_failure_class, embedding_failure_message` |
| UPDATE (updateCapsule UPDATE branch) | yes | yes on `ok: true`; skip on `ok: false` | identical to ADD |
| MERGE (updateCapsule MERGE branch) | no | no (existing preserved) | `embedding_generated: false, embedding_skip_reason: "merge_metadata_only_content_unchanged"` |
| NOOP (updateCapsule NOOP branch) | no | no | unchanged from G1.3 (no embedding fields added) |

NEVER vector content / `vector_hash` / `embedding_sample` /
per-dimension stats in audit details per Q-G3-ζ + RULE 0
inversion-attack disposition (RS-5: Vec2Text + ALGEN + Zero2Text).

**No CircuitBreaker wrapper at G3.5 per Q-G3.5-θ LOCK** — the
graceful-degrade catch already absorbs single-call provider
failures. Bursting backoff / circuit-breaker substrate remains
forward-substrate if production rate-limit posture later
requires it.

**No `CAPSULE_SIMILARITY_SEARCH` audit literal at G3.5 per
Q-G3.5-ι LOCK** — that literal is forward-substrate to G3.6
retrieval per Q-γ.1 clean-transition pattern (add literal at
the commit that first emits it).

**Single G3.5 commit per Q-G3.5-κ LOCK:** code + tests +
docs + state in one substantive landing commit. No code-only
+ doc-only split.

**Minimal updates to existing 26 write.test.ts tests per
Q-G3.5-λ LOCK:** only the `makeServices()` signature change
ripples; existing test bodies are untouched (the new
embeddingProvider param defaults to `FixtureBasedEmbeddingProvider`
which provides deterministic vectors via opts.fixtureKey =
capsuleId).

**Scope boundaries preserved at G3.5:**

- G3.5 does NOT close Gap 3 at canonical-state register
  substantively; Gap 3 remains IN FLIGHT.
- G3.5 does NOT add `searchBySimilarity` or COE integration
  (forward-substrate to G3.6).
- G3.5 does NOT add the `CAPSULE_SIMILARITY_SEARCH` audit
  literal (forward-substrate to G3.6 per Q-G3.5-ι).
- G3.5 does NOT amend ADR-0022 (Q-G3-δ LOCK preserved); the
  `combined_score` formula at
  `apps/api/src/services/coe/keywords.ts:87-93` remains
  untouched.
- G3.5 does NOT touch `schema.prisma`, DB scripts
  (`apply-pgvector-extension.ts` / `apply-hnsw-index.ts` /
  `test-db-up.sh` / `prisma-db-push-test.sh`), CI workflows,
  `docker-compose.test.yml`, `.husky/pre-commit`, `package.json`,
  lockfiles, the embedding service itself
  (`apps/api/src/services/embedding/embedding.service.ts`
  unchanged from G3.4), `read.service.ts`, `coe.service.ts`,
  any cosmp route, Elixir source, or any other ADR (no
  ADR-0011 / 0013 / 0014 / 0015 / 0016 / 0022 / 0025 / 0033 /
  0034 / 0035 / 0041 / 0042 amendments).
- ADR-0043 Status preserved at `Proposed 2026-05-17`.

**Privacy invariant per Q-G3-ζ + Q-G3.5-η + RULE 0:** vectors
remain server-side substrate only at G3.5 (write path) just as
at G3.4 (provider). No HTTP/gRPC response carries vector
content. No audit row carries vector content. No log line carries
vector content. The boundary is enforced at three registers:
(1) the `WriteSuccess` response interface omits any embedding
field (Prisma's `Unsupported("vector(1536)")` typegen omits it
automatically; the response shape never reaches it); (2) the
audit-metadata schema records outcome metadata only (Tier 1
Gate 25 verifies); (3) the structured logger has no `vector`-
mentioning log call in write.service.ts (Tier 1 Gate 8 verifies).

**Forward-substrate at G3.6-G3.10 register substantively
(unchanged from G3.1 §Sub-decision 11 Q-G3-κ enumeration):**
G3.6 `[CAPSULE-EMBEDDING-RETRIEVAL]` searchBySimilarity +
`CAPSULE_SIMILARITY_SEARCH` audit literal + COE integration
disposition per Q-G3-δ; G3.7 conditional backfill; G3.8
conditional Elixir; G3.9 integration tests; G3.10 docs-only
closure cascade.

**Founder authorization explicit at G3.5 substantive landing per
RULE 20 at `[CAPSULE-EMBEDDING-WRITE-G3.5-EXECUTE-VERIFY-AUTH]`.**

## G3.6 Progress — Retrieval Service + Route + Audit Literal LANDED (2026-05-18)

G3.6 `[CAPSULE-EMBEDDING-RETRIEVAL]` LANDS the standalone similarity
retrieval API per §Sub-decision 11 (Q-G3-κ) + 10 Q-G3.6 LOCKS at
`[CAPSULE-EMBEDDING-RETRIEVAL-G3.6-QLOCK]`.

**Service location per Q-G3.6-α α-1**: NEW
`apps/api/src/services/cosmp/similarity.service.ts`. Clean separation
from read.service.ts; explicit dependency injection per Q-G3.6-ζ
(AuthService + EmbeddingProvider; no production defaults).

**Route per Q-G3.6-β β-1**: NEW `POST /api/v1/cosmp/search` registered
in `apps/api/src/routes/cosmp.routes.ts`. Mirrors existing route
auth pattern (`bearerFrom(request.headers.authorization)` + return
401 on missing token). 422 mapping added for `QUERY_INVALID` +
`TOPK_OUT_OF_RANGE` + `WALLET_MISSING` (caller-bug class) at
`statusForCode`.

**Raw SQL with 6 RULE 0 SQL-tier privacy filters per Q-G3.6-γ**:

```sql
SELECT capsule_id, capsule_type, payload_summary
FROM memory_capsules
WHERE wallet_id = $2::uuid
  AND deleted_at IS NULL
  AND ai_access_blocked = false
  AND requires_validation = false
  AND clearance_required <= $3
  AND embedding IS NOT NULL
ORDER BY embedding <=> $1::vector(1536) ASC
LIMIT $4
```

All 6 privacy filters fire BEFORE ranking (no post-fetch privacy
filtering; the filter set is mandatory at the SQL tier so the
HNSW iterative scan can backfill candidates that would otherwise be
discarded post-filter).

**HNSW iterative scan posture per Q-G3.6-γ.2**: each query runs inside
`prisma.$transaction` with two SET LOCAL statements applied first:

```ts
await tx.$executeRawUnsafe("SET LOCAL hnsw.iterative_scan = strict_order");
await tx.$executeRawUnsafe("SET LOCAL hnsw.ef_search = 100");
```

RULE 21 research arc citation: pgvector's HNSW index applies WHERE
filters AFTER the index scan (default `hnsw.ef_search = 40`). Without
iterative scan, privacy-first filter selectivity can cause topK
matches to fall below requested LIMIT even when matching capsules
exist. Iterative scan (canonical remediation in pgvector 0.8.0+; our
pinned image is `pgvector/pgvector:0.8.2-pg16-trixie`) keeps scanning
the index until enough matches accumulate or `hnsw.max_scan_tuples`
(default 20,000) caps the work. `strict_order` mode preserves exact
distance ordering at the cost of some recall — chosen for
audit-trail determinism over `relaxed_order`.

**Response shape per Q-G3.6-γ.1**: matches[] return capsule_id +
capsule_type + payload_summary only. NO vector / NO distance / NO
embedding fields. Prisma's `Unsupported("vector(1536)")` typegen
omits the embedding column from the generated client by
construction; the response shape never accesses it. Tier 1 Gate 9
scans interface bodies; Gate 11 scans the route handler body for
forbidden response keys.

**NEW audit literal per Q-G3.6-δ + Q-γ.1 clean-transition**:
`CAPSULE_SIMILARITY_SEARCH` appended to AUDIT_EVENT_TYPE_VALUES in
`packages/database/src/queries/audit.ts` (both type union AND array
constant). No removal of existing literals (RULE 10).

**V2 Correction 5 — neutral `emitSimilarityAudit(outcome, ...)`
helper**: single audit-emission helper with explicit `outcome`
discriminator. Provider failure per Q-G3.6-θ is **degraded SUCCESS**
(NEVER DENIED) with `embedding_generated: false +
embedding_failure_class + embedding_failure_message + result_count:
0`. Empty result per Q-G3.6-ι is **SUCCESS** (NEVER DENIED) with
`result_count: 0 + filters_applied + embedding_generated: true`. Only
auth/session/permission/caller-bug failures (SESSION_INVALID /
SESSION_EXPIRED / SESSION_REVOKED / SESSION_INVALIDATED /
OPERATION_NOT_PERMITTED / QUERY_INVALID / TOPK_OUT_OF_RANGE /
WALLET_MISSING) emit `outcome: "DENIED"`.

**Audit metadata schema per Q-G3.6-δ**:

| Field | Type | Path |
|---|---|---|
| `query_length` | number | always |
| `topK` | number | always |
| `minSimilarity` | number \| null | always |
| `result_count` | number | always |
| `filters_applied` | string[] | always (`[]` in degraded path; 6-tag array in SUCCESS path) |
| `embedding_generated` | boolean | always |
| `embedding_failure_class` | string | degraded path only |
| `embedding_failure_message` | string | degraded path only |

**Audit metadata FORBIDDEN fields (NEVER appear in any code path)**:
raw query text, truncated query, query keywords, `query_keywords_redacted`,
query vector, result vectors, vector_hash, embedding_sample,
embedding_first_*, vector_dim_*, per_result_distance distribution,
per-dimension stats, cosine_distance, distances.

**topK enforcement per Q-G3.6-η**: default 10; maximum 50; integers
in `[1, 50]` only; out-of-range requests are rejected with
`TOPK_OUT_OF_RANGE` (HTTP 422) and emit a DENIED audit row. No
silent clamping.

**Tests per Q-G3.6-ζ + Q-G3.5-ε pattern**:
- NEW `tests/unit/cosmp/similarity.test.ts` 12 unit tests S1-S12
  with stable verbatim names. S3+S4+S5+S6+S7+S8+S9+S11 named-block
  isolation per Tier 1 Gate 15. Tests use real test DB (containerized
  Postgres) to verify SQL-tier filters; embedding provider is either
  FixtureBasedEmbeddingProvider (deterministic vector) or in-test
  mock object (degraded path proof).
- NEW `tests/integration/similarity-search.test.ts` 4 integration
  tests J1-J4. J1 named-block isolation per Tier 1 Gate 16 (V2
  Correction 4): asserts HTTP response body contains no `vector` /
  `embedding` / `distance` / `cosine_distance` field. J2 cross-wallet
  denial via real DB. J3 audit row persistence with allowed fields +
  forbidden tokens absent. J4 HNSW iterative scan substrate proof
  (1 capsule passing all filters + 3 failing one each; passing
  capsule must surface).

**COE integration DEFERRED past G3.6 per Q-G3.6-ε**:
`apps/api/src/services/coe/**` UNTOUCHED. `keywords.ts` UNTOUCHED.
ADR-0022 UNTOUCHED. Paths (a) replace_tagOverlap and (b)
4th_coefficient REQUIRE Founder-authorized ADR-0022 amendment per
RULE 20; paths (c) rerank post-fetch and (d) prefilter remain
candidate dispositions for a future commit AFTER G3.6 standalone
substrate proves out under CI. G3.6 is the standalone retrieval API
landing; integration is a separate question.

**Scope boundaries preserved at G3.6**:

- G3.6 does NOT close Gap 3 at canonical-state register substantively;
  Gap 3 remains IN FLIGHT pending G3.7 (conditional backfill) + G3.8
  (conditional Elixir) + G3.9 (broader integration tests) + G3.10
  (docs-only closure cascade).
- G3.6 does NOT touch `apps/api/src/services/cosmp/write.service.ts`,
  `read.service.ts`, `negotiate.service.ts`, `share.service.ts`,
  `jurisdiction-enforcement.ts`, or `regulator-enforcement.ts`.
- G3.6 does NOT touch `apps/api/src/services/embedding/embedding.service.ts`
  (G3.4 substrate unchanged).
- G3.6 does NOT touch `apps/api/src/services/coe/**` (Q-G3.6-ε).
- G3.6 does NOT touch `apps/api/src/services/coe/keywords.ts`
  (Q-G3-δ + Q-G3.6-ε both preserved).
- G3.6 does NOT amend ADR-0011/0013/0014/0015/0016/0022/0025/0033/
  0034/0035/0041/0042.
- G3.6 does NOT touch `schema.prisma`, DB scripts
  (`apply-pgvector-extension.ts` / `apply-hnsw-index.ts` /
  `test-db-up.sh` / `prisma-db-push-test.sh`), CI workflows,
  `docker-compose.test.yml`, `.husky/pre-commit`, `package.json`,
  or lockfiles.
- G3.6 does NOT touch `apps/cosmp_router/**` or
  `apps/dbgi_supervisor/**` (Q-G3-θ β-A preserved).
- G3.6 does NOT add a `CircuitBreaker` wrapper (provider-failure
  degrade catch absorbs single-call failures).
- ADR-0043 Status preserved at `Proposed 2026-05-17`.

**Privacy invariant per Q-G3-ζ + Q-G3.6-γ.1 + RULE 0**: vectors and
distances are server-side substrate only. WriteSuccess and
SimilaritySuccess response shapes omit any embedding/vector/distance
field by construction. Audit-metadata schema records outcome metadata
only; Tier 1 Gate 14 verifies inside `emitSimilarityAudit({ ...details: {...} })`
balanced-brace bodies that forbidden tokens do not appear. Structured
logger in similarity.service.ts has no `vector`-mentioning log line
(Tier 1 Gate 8 verifies).

**Forward-substrate at G3.7-G3.10 register substantively (unchanged
from G3.1 §Sub-decision 11 Q-G3-κ enumeration)**: G3.7
`[CAPSULE-EMBEDDING-BACKFILL]` conditional (lazy-on-first-read default
per Q-G3-ε; bulk-backfill script forward-substrate only); G3.8
`[CAPSULE-EMBEDDING-ELIXIR]` conditional (default skip per Q-G3-θ
β-A); G3.9 broader integration tests; G3.10
`[BEAM-CAPSULE-EMBEDDING-CLOSURE]` docs-only closure cascade (closes
Gap 3 at canonical-state register substantively).

**Founder authorization explicit at G3.6 substantive landing per
RULE 20 at `[CAPSULE-EMBEDDING-RETRIEVAL-G3.6-EXECUTE-VERIFY-AUTH]`.**

## G3.7 SKIP — Conditional Lazy Backfill Formally Deferred (2026-05-18)

G3.7 `[CAPSULE-EMBEDDING-BACKFILL]` formally SKIPPED per
`[CAPSULE-EMBEDDING-BACKFILL-G3.7-QLOCK]` Q-G3.7-α α-1 LOCK +
Q-G3.7-η 5-MOD-docs-only scope LOCK. ADR-0043 Status preserved as
`Proposed 2026-05-17`. G3.7 does NOT close Gap 3 at canonical-state
register substantively; G3 mini-arc advances 6/10 → 7/10 after the
G3.7 SKIP record lands.

**Substrate-state rationale.** At HEAD `371e108`, the current
production substrate has no proven production population of legacy
capsules requiring lazy backfill. Every capsule on origin/main was
created via the post-G3.5 `WriteService` with embedding generation
at create-time (G3.5 LANDS the create/update embedding path). The
hypothetical NULL-embedding population reduces to (a) test-DB
artifacts from S8 NULLed via raw SQL (controlled-test scenario;
not production) and (b) rare degraded-provider writes per Q-G3.5-α
(provider outage degrades to capsule write succeeds with embedding
NULL; subsequent UPDATE re-generates). Both are negligible at
canonical-state register.

**Q-G3-ε wording authorized this disposition.** ADR-0043
§Sub-decision 5 (Q-G3-ε) explicitly canonicalizes the default
posture: "lazy-on-first-read default suffices for production
rollout. Bulk-backfill script (`scripts/backfill-embeddings.ts`)
remains forward-substrate at G3.7 conditional register
substantively unless Founder explicitly authorizes later." The
default was always SKIP unless substrate-state warranted lazy
hook. At G3.7 Hawkseye preflight, the substrate-state ground
truth confirmed SKIP is the substrate-coherent path.

**G3.6 already provides graceful exclusion.** G3.6 similarity
service at `apps/api/src/services/cosmp/similarity.service.ts:307`
enforces `AND embedding IS NOT NULL` in the raw SQL filter set
(part of the 6 RULE 0 SQL-tier privacy filters per Q-G3.6-γ).
NULL-embedding capsules are silently excluded from similarity
search results. This is the **graceful exclusion** semantics that
makes lazy backfill non-load-bearing at current substrate-state.
Lazy backfill would convert exclusion to inclusion — solving a
non-problem.

**G1.4 SKIP precedent.** ADR-0042 §Sub-decision Q-ι default LOCK
landed a formal SKIP record at commit `3505fde`
`[CAPSULE-MUTATION-ELIXIR-AUDIT]` for conditional Elixir audit
work that pre-flight grep proved unnecessary at substrate-state
register. G3.7 follows the same pattern: docs-only formal SKIP
record preserves G3 mini-arc lineage coherence (mini-arc advances
6/10 → 7/10) without expanding scope into a non-existent
population. The SKIP record IS the substrate-honest discipline
applied at the gate; pretending the population exists and
landing a lazy hook anyway would be substrate-incoherent.

**Forward-substrate posture.** Bulk-backfill script remains
forward-substrate per Q-G3-ε. Lazy-on-read hook remains
forward-substrate. If a future migration scenario surfaces a real
NULL-embedding population (e.g., adopting NIOV for an existing
capsule store via import; large-scale extended-duration provider
outage backlog; cross-tenant aggregation of pre-NIOV capsule
data), Founder authorization at that point may re-open G3.7 via
ADR-0043 amendment OR new gap-substrate per ADR-0041 umbrella
capsule layer. Until then, default disposition = SKIP.

**Q-G3.7 sub-decisions under α-1 SKIP.** Q-G3.7-β trigger path
N/A (no readContent / readMetadata / similarity-fallback /
runtime trigger); Q-G3.7-γ update pattern N/A (no new raw SQL
update site; no helper extraction; no write.service.ts refactor);
Q-G3.7-δ concurrency/idempotency N/A (no read-path mutation; no
advisory lock; no transaction change); Q-G3.7-ε audit posture
N/A (no `CAPSULE_EMBEDDING_BACKFILL` literal at G3.7; audit.ts
UNTOUCHED); Q-G3.7-ζ failure behavior N/A (no provider call; no
read-path degradation change).

**Scope-boundary discipline at G3.7 SKIP register.** 5 docs files
modified (this ADR + section-12-progress + CURRENT_BUILD_STATE +
README + CLAUDE). NO code changes; NO test changes; NO
schema/CI/package/Elixir/audit-literal changes. ADR-0022 +
ADR-0011/0013/0014/0015/0016/0025/0033/0034/0035/0041/0042 ALL
UNTOUCHED. ADR-0043 Status preserved as `Proposed 2026-05-17`.

**Substrate-state observations forward-queued at commit-body-only
register substantively per Option β substrate-honest discipline
(NOT promoted to ADR-0035 §9 cluster at G3.7).**

**D-PRODUCTION-LAZY-BACKFILL-POPULATION-NON-EXISTENT-AT-G3.7-LANDING**
— substrate-state at HEAD `371e108` has zero capsules predating
G3.5; lazy backfill semantics solve a hypothetical not actual
population. This observation is the canonical substrate-honesty
catch that authorized α-1 SKIP at Hawkseye preflight. Future
recurrence (migration scenario surfacing a real legacy population)
would re-open G3.7 substrate per Founder authorization.

**D-RAW-SQL-EMBEDDING-UPDATE-DUPLICATION-CANDIDATE** — 2 sites in
`apps/api/src/services/cosmp/write.service.ts` (L699-703
createCapsule + L1330-1334 updateCapsule UPDATE branch) share an
identical 4-line raw SQL `tx.$executeRawUnsafe('UPDATE
memory_capsules SET embedding = $1::vector(1536) WHERE capsule_id
= $2::uuid', vectorLiteral, capsuleId)` pattern. Helper-
extraction candidate but rejected for G3.7 SKIP scope (no
write.service.ts touch per Q-G3.7-γ N/A); remains forward-queue
for future cleanup commit (likely G3.10 closure cascade or
post-Gap-3 maintenance commit).

**Forward G3.8-G3.10 (unchanged from G3.1 §Sub-decision 11 Q-G3-κ
enumeration):** G3.8 `[CAPSULE-EMBEDDING-ELIXIR]` conditional
(default β-A skip per Q-G3-θ; Elixir untouched at current
substrate); G3.9 broader integration tests; G3.10
`[BEAM-CAPSULE-EMBEDDING-CLOSURE]` docs-only closure cascade
closes Gap 3 at canonical-state register substantively.

**Founder authorization explicit at G3.7 substantive landing per
RULE 20 at `[CAPSULE-EMBEDDING-BACKFILL-G3.7-EXECUTE-VERIFY-AUTH]`.**

## G3.8 Elixir-Boundary Contract LANDED — Embedding Column Prisma-Owned, Not Ecto-Visible (2026-05-18)

G3.8 `[CAPSULE-EMBEDDING-ELIXIR]` LANDS the Elixir-side boundary
contract per `[CAPSULE-EMBEDDING-ELIXIR-G3.8-QLOCK]` Q-G3.8-α α-2
LOCK + Q-G3.8-β/γ/δ/ε. **This is a substantive landing, NOT a SKIP.**
ADR-0043 Status preserved as `Proposed 2026-05-17`. G3.8 does NOT
close Gap 3 at canonical-state register substantively; G3 mini-arc
advances 7/10 → 8/10 after G3.8 LANDS.

**Consumer-driven framing per Founder reframing at
[CAPSULE-EMBEDDING-ELIXIR-G3.8-CONSUMER-DRIVEN-HAWKSEYE-ADDENDUM]:**
Foundation production readiness DELIBERATELY EXCLUDES Elixir-side
vector access at HEAD `ee0b01b`. This is an architectural decision
per ADR-0033 §Decision 7 cross-language data-ownership boundary +
Q-G3-θ β-A LOCK + ADR-0028 / ADR-0030 / ADR-0039 BEAM coordination
layer scope, NOT a not-yet state. "No current Elixir consumer" is
not the decision metric; the decision metric is "what production
API/runtime consumer would require Elixir/BEAM to understand
embedding/vector/pgvector substrate, and is that consumer part of
Foundation production readiness?" — answered NO by architectural
design.

**Substrate-state evidence at HEAD `ee0b01b`:**

- TypeScript/Prisma own vector write (G3.5 WriteService `createCapsule`
  + `updateCapsule` UPDATE branch with inline raw SQL
  `tx.$executeRawUnsafe('UPDATE memory_capsules SET embedding =
  $1::vector(1536) WHERE capsule_id = $2::uuid', ...)`).
- TypeScript/Prisma own vector retrieval (G3.6 SimilarityService raw
  SQL pgvector cosine query with 6 RULE 0 SQL-tier privacy filters +
  HNSW iterative scan; HTTP route `POST /api/v1/cosmp/search`).
- BEAM/COSMP coordination layer (`apps/cosmp_router/priv/protos/cosmp.proto`
  7-RPC service surface — Authenticate / Negotiate / Read / Write /
  Share / Revoke / Audit — with NO Search/Similarity RPC; `Capsule`
  proto message with 7 patent-canonical layers per ADR-0031 + NO
  embedding field) operates over MemoryCapsule lifecycle/routing
  WITHOUT embedding distance.
- `CosmpRouter.MemoryCapsule` 30-field Ecto mirror per ADR-0033 §3a
  remains canonical; `embedding` column intentionally absent.
- `mix.exs` + `mix.lock`: no `pgvector` / `pgvector_ex` Hex dependency.
- `apps/dbgi_supervisor/**` per-DMW supervised processes route by
  wallet_type (PERSONAL promote-on-activity + ENTERPRISE always-hot +
  DEVICE cold-shard) — NOT embedding distance.

**Q-G3-θ β-A LOCK preserved:** "skip Ecto vector field for now" per
ADR-0043 §Sub-decision 8 L282-300. G3.8 substrate landing
explicitly preserves the LOCK: NO `pgvector` / `pgvector_ex` hex
dep added; NO Ecto vector field; NO Translator pack/unpack
extension. ADR-0033 §Decision 7 cross-language data-ownership
boundary preserved without amendment at G3.8.

**RULE 11 substrate-honest discipline preserved.** G3.8 Hawkseye
preflight + Consumer-Driven Addendum confirmed via repo grep that
no proven Elixir consumer of vector data exists at HEAD `ee0b01b`.
RULE 11 (Wider Knowledge Check for Elixir/BEAM Substrate) requires
"research before authorizing fix at substrate-state register" — the
research conclusion is α-2 boundary-doc guardrail, not α-3 vector
implementation.

**RULE 0 substrate-honest discipline preserved.** Adding Elixir-side
vector access would create new RULE 0 attack surfaces (BEAM struct
serialization; Logger; telemetry events; gRPC envelopes). Without
a proven consumer, the boundary contract is the substrate-coherent
posture per Foundation production readiness scope.

**Substrate landing at G3.8 (7 MOD + 0 NEW):**

- MOD `apps/cosmp_router/lib/cosmp_router/schemas/memory_capsule.ex`
  extends moduledoc with NEW H2 section "Embedding column boundary
  (G3.8 / Q-G3-θ β-A LOCK)" containing 8 required content elements
  per Q-G3.8-γ: (1) `embedding` column is Prisma-owned and
  TypeScript/Prisma-managed; (2) `embedding` is intentionally not
  Ecto-visible; (3) no `:embedding` field should be added to the
  Ecto schema without Founder authorization; (4) any future Elixir
  vector access requires a proven production consumer; (5) requires
  ADR-0033 amendment OR explicit cross-language ownership
  authorization; (6) requires RULE 0 safeguards for
  structs/logs/telemetry/gRPC/serialization; (7) Q-G3-θ β-A
  currently preserves no Ecto vector field; (8) test anchor at
  `memory_capsule_test.exs`.
- MOD `apps/cosmp_router/test/cosmp_router/schemas/memory_capsule_test.exs`
  adds NEW explicit named test per Q-G3.8-β: `test "embedding column
  is Prisma-owned and intentionally absent from Ecto schema per
  Q-G3-θ β-A LOCK + ADR-0043 §Sub-decision 8"` with body asserting
  `refute :embedding in MemoryCapsule.__schema__(:fields)`. Test
  converts the pre-existing implicit "extra == []" check into an
  EXPLICIT NAMED CONTRACT contributors can grep for.

**Forward-substrate path preserved per Q-G3.8-δ.** Future Elixir
vector access requires ALL of:

1. Real Elixir/BEAM production consumer is proven (e.g., AI_AGENT
   EntityType-discriminated capsule routing per ADR-0041
   §Sub-decision 6 forward-substrate; hive-scale semantic
   clustering per ADR-0028 §Forward Queue).
2. Founder authorization per RULE 20.
3. ADR-0033 §Decision 7 amendment OR explicit cross-language
   ownership authorization.
4. Correct Hex package naming reconciled: canonical package is
   `pgvector` (no `_ex` suffix); Q-G3-θ prose at ADR-0043 L289
   references `pgvector_ex` which is forward-queued as
   `D-PGVECTOR-EX-HEX-PACKAGE-NAME-DRIFT-AT-Q-G3-θ` and reconciled
   only if/when implementation is authorized.
5. RULE 0 safeguards: no gRPC/protobuf/telemetry/log/struct
   serialization leaks vector content.
6. Prisma remains DDL owner unless explicitly changed.

**Scope-boundary discipline at G3.8 LANDING register.** 7 docs +
Elixir files (2 Elixir MOD + 5 docs MOD; 0 NEW). NO `mix.exs` /
`mix.lock` changes. NO `pgvector` / `pgvector_ex` dependency. NO
Ecto vector field. NO Translator pack/unpack extension. NO
protobuf / gRPC vector extension. NO ADR-0033 amendment at G3.8.
ADR-0022 + ADR-0011/0013/0014/0015/0016/0025/0034/0035/0041/0042
ALL UNTOUCHED. ADR-0043 Status preserved as `Proposed 2026-05-17`.
`coe/**` + `keywords.ts` + `read.service.ts` + `write.service.ts` +
`similarity.service.ts` UNTOUCHED. `apps/dbgi_supervisor/**`
UNTOUCHED. All other `apps/cosmp_router/**` paths beyond the 2
authorized Elixir files UNTOUCHED.

**G1.4 SKIP precedent + G3.7 SKIP precedent comparison.** G3.8
mirrors the docs-only + minimal-Elixir-touch DISCIPLINE of G1.4
(`3505fde` `[CAPSULE-MUTATION-ELIXIR-AUDIT]` per ADR-0042
§Sub-decision Q-ι default LOCK) and G3.7 (`ee0b01b`
`[CAPSULE-EMBEDDING-BACKFILL]` per Q-G3-ε default + Q-G3.7-α α-1
SKIP) but is SUBSTANTIVE (Elixir-boundary contract LANDED) NOT a
SKIP per Founder reframing at
[CAPSULE-EMBEDDING-ELIXIR-G3.8-QLOCK]. The reframing is
substrate-coherent: a SKIP record alone is too passive for
Foundation API production-bound surfaces; the boundary contract
must be explicit and test-enforced at the Elixir register.

**Substrate-state observations forward-queued at commit-body-only
register substantively per Option β substrate-honest discipline
(NOT promoted to ADR-0035 §9 cluster at G3.8).**

**D-PGVECTOR-EX-HEX-PACKAGE-NAME-DRIFT-AT-Q-G3-θ** — Q-G3-θ prose
at ADR-0043 L289 references `pgvector_ex` as the hypothetical
future hex dep; the canonical Hex package appears to be
`pgvector` (no `_ex` suffix). Non-blocking under α-2 SKIP-pattern
substantive landing; reconcile only if/when α-3 substantive
implementation is later Founder-authorized.

**D-ELIXIR-VECTOR-CONSUMER-DELIBERATELY-EXCLUDED-AT-FOUNDATION-PRODUCTION-READINESS**
— substrate-state at HEAD `ee0b01b` confirms NIOV Foundation
production readiness DELIBERATELY EXCLUDES Elixir-side vector
access. Architectural decision per ADR-0033 §Decision 7 + Q-G3-θ
β-A + BEAM coordination scope per ADR-0028 / ADR-0030 / ADR-0039.
The boundary contract IS the production substrate at G3.8.

**D-IMPLICIT-VS-EXPLICIT-BOUNDARY-CONTRACT-AT-Q-G3-θ-G3.3-DEFERRAL**
— Q-G3-θ §G3.3 deferral language at ADR-0043 L291-295 anticipated
a moduledoc note declaring "embedding column is Prisma-owned; not
exposed at Ecto register" "deferred to G3.3 register substantively
(forward; not at G3.1)". G3.3 shipped without it. G3.8 is the
substrate-coherent landing point for the explicit named contract
(6 commits later; Foundation production posture now durably
established).

**Forward G3.9-G3.10 (unchanged from G3.1 §Sub-decision 11 Q-G3-κ
enumeration):** G3.9 broader integration tests; G3.10
`[BEAM-CAPSULE-EMBEDDING-CLOSURE]` docs-only closure cascade
(closes Gap 3 at canonical-state register substantively).

**G3.8 boundary preservation summary (verbatim Tier 1 Gate 13 token anchors):** consumer-driven framing per Founder reframing; G3.8 does NOT close Gap 3; no mix.exs / no mix.lock / no pgvector / no Ecto vector field / no Translator / no ADR-0033 amendment at G3.8.

**Founder authorization explicit at G3.8 substantive landing per
RULE 20 at `[CAPSULE-EMBEDDING-ELIXIR-G3.8-EXECUTE-VERIFY-AUTH]`.**

## G3.9 Production-Contract Integration Tests LANDED (2026-05-18)

G3.9 `[CAPSULE-EMBEDDING-PRODUCTION-CONTRACT]` LANDED 2026-05-18 at commit
`fa80624`. Substantive test-only landing. 1 MOD + 0 NEW. ADR-0043 Status
preserved as `Proposed 2026-05-17` at G3.9 (G3.10 flips to Accepted at the
closure register substantively). G3.9 does NOT close Gap 3.

**Production-contract framing.** Foundation production readiness requires
integration-tier round-trip proof of write → search composition; unit-tier
mocks are insufficient as sole proof for production-bound surfaces. G3.9
proves end-to-end ADD + UPDATE roundtrip under real DB/HNSW, integration-tier
RULE 0 privacy filter joint adversarial fixture, and NULL embedding graceful
exclusion under real HNSW.

**11 Q-G3.9 sub-decisions / LOCKs canonical at `[CAPSULE-EMBEDDING-PRODUCTION-CONTRACT-G3.9-QLOCK]`:**

- Q-G3.9-α α-1 LOCK: test-only MOD existing file.
- Q-G3.9-β LOCK: `tests/integration/similarity-search.test.ts`.
- Q-G3.9-γ α LOCK: joint J7 adversarial fixture.
- Q-G3.9-δ α LOCK: 4 tests J5-J8.
- Q-G3.9-ε α LOCK: include end-to-end UPDATE roundtrip.
- Q-G3.9-ζ α LOCK: include real-HNSW NULL graceful exclusion.
- Q-G3.9-η α LOCK: FixtureBasedEmbeddingProvider deterministic; no real
  OpenAI.
- Q-G3.9-θ LOCK: ~25s additional integration tier budget accepted.
- Q-G3.9-ι LOCK: 1 MOD + 0 NEW.
- Q-G3.9-κ LOCK: no ADR amendment.
- Q-G3.9-λ LOCK: G3.9 does NOT close Gap 3.

**4 NEW integration tests at `tests/integration/similarity-search.test.ts`
(verbatim titles):**

- J5 end-to-end ADD via WriteService persists embedding then SimilaritySearch
  retrieves same-wallet capsule
- J6 end-to-end UPDATE via WriteService regenerates embedding then
  SimilaritySearch reflects updated content
- J7 integration-tier RULE 0 privacy filter joint adversarial fixture
  excludes all 4 disqualifying capsules under real HNSW
- J8 integration-tier embedding-NULL capsule gracefully excluded without
  crash under real HNSW

**J7 5-capsule fixture composition** (1 ELIGIBLE + 4 disqualifying): ELIGIBLE
capsule + BLOCKED capsule with `ai_access_blocked = true` + PENDING capsule
with `requires_validation = true` + SOFT capsule with `deleted_at IS NOT
NULL` + HIGH-CLEARANCE capsule with `clearance_required > caller ceiling`
(value 999 above default session ceiling). Real DB + real HNSW exercise the
6 RULE 0 SQL-tier filters at similarity.service.ts:303-308 jointly.

**HTTP response privacy invariants** (asserted in all 4 NEW tests via verbatim
substring negative assertions): no `vector` / `embedding` / `distance` /
`cosine_distance` substrings in response body. **Audit metadata safety**
(asserted at J5): CAPSULE_SIMILARITY_SEARCH audit row contains no raw query
text / no `query_keywords` / no `query_text` / no `vector_hash` / no
`embedding_sample` / no `"distances"`.

**Integration baseline shift:** 207 passed + 1 skipped → 211 passed + 1
skipped after G3.9 LANDS (4 NEW J5-J8 tests added).

**Critical coherence preserved at G3.9:** no production code changes; no
`apps/**` / `apps/cosmp_router/**` / `apps/dbgi_supervisor/**` / `packages/**`
/ `scripts/**` / `schema.prisma` / DB scripts / CI workflows / package /
lockfile / `mix.exs` / `mix.lock` / `audit.ts` / new audit literals / new
files. ADR-0022 + ADR-0033 + ADR-0043 Status untouched.
`coe/**` + `keywords.ts` + `read.service.ts` + `write.service.ts` +
`similarity.service.ts` + `embedding.service.ts` UNTOUCHED.

**3 in-arc RULE 13 observations** (commit-body-only register substantively at
G3.9 commit `fa80624`; NOT promoted to ADR-0035 §9 at G3.9; 2 of the 3 absorb
into 37th + 38th §9 promotions at G3.10):

- D-J4-ALREADY-COVERS-3-OF-4-J7-FILTERS-AT-INTEGRATION-TIER (commit-body-only;
  defense-in-depth disposition preserved at G3.10 register substantively;
  NOT promoted)
- D-VITEST-NPX-CONFIG-DEFAULT-LOADS-PRODUCTION-SUPABASE-AT-G3.9-TIER-2
  (PROMOTED to 37th §9 observation at G3.10; canonical D-VITEST-NPX-CONFIG-
  DEFAULT-LOADS-PRODUCTION-SUPABASE)
- D-PRISMA-ECTO-CROSS-LANGUAGE-SCHEMA-MIGRATIONS-OWNERSHIP-COLLISION-AT-
  LOCAL-REFRESH (folded into 38th §9 observation umbrella at G3.10; canonical
  D-LOCAL-DEV-ENV-CROSS-LANGUAGE-OWNERSHIP-DRIFT)

**Patent-implementation evidence per ADR-0020 two-register IP discipline:**
the 4 NEW integration tests J5-J8 prove end-to-end production-contract
behavior of the embedding write-and-search pipeline at substrate-architectural
register substantively. Cryptographically-timestamped G3.9 commit `fa80624`
distinguishes NIOV substrate from any unauthorized parallel build at
canonical-execution register substantively.

**Founder authorization explicit at G3.9 substantive landing per
RULE 20 at `[CAPSULE-EMBEDDING-PRODUCTION-CONTRACT-G3.9-EXECUTE-VERIFY-AUTH]`
+ `[CAPSULE-EMBEDDING-PRODUCTION-CONTRACT-G3.9-COMMIT-AUTH]`.**

## G3.10 Gap 3 pgvector Embedding CLOSED (2026-05-18)

G3.10 `[BEAM-CAPSULE-EMBEDDING-CLOSURE]` LANDED 2026-05-18. **Gap 3 pgvector
Embedding CLOSED at canonical-state register substantively.** Docs-only
closure cascade. 6 MOD + 0 NEW. ADR-0043 Status flipped from `Proposed
2026-05-17` to **`Accepted 2026-05-18`** at this commit register substantively.
G3 mini-arc advances 9/10 → **10/10** after G3.10 LANDS.

**11 Q-G3.10 sub-decisions / LOCKs canonical at `[BEAM-CAPSULE-EMBEDDING-CLOSURE-G3.10-QLOCK]`:**

- Q-G3.10-α LOCK: docs-only closure cascade.
- Q-G3.10-β LOCK: 6 MOD + 0 NEW.
- Q-G3.10-γ LOCK: ADR-0043 Status Proposed 2026-05-17 → Accepted 2026-05-18.
- Q-G3.10-δ LOCK: Sub-arc 2 remains IN FLIGHT.
- Q-G3.10-ε LOCK: Option α ADR-0035 §9 promotions (37th + 38th).
- Q-G3.10-ζ LOCK: no ADR-0022 / ADR-0033 amendment.
- Q-G3.10-η LOCK: no production code/schema/test/CI/package/Elixir/audit
  changes.
- Q-G3.10-θ LOCK: G3.10 closes Gap 3 at canonical-state register substantively.
- Q-G3.10-ι LOCK: Sub-arc 2 closure remains forward-substrate.
- Q-G3.10-κ LOCK: COE / ADR-0022 integration remains forward-substrate; NOT
  a Gap 3 closure dependency.

**Sub-arc 2 remains IN FLIGHT** pending Gap 4 (ADR-0044 Decay Execution
Formalization) + Gap 5 (ADR-0045 Capsule-Level Staleness Detection) + optional
Gap 6 (ADR-0046 AI_AGENT EntityType-Discriminated Capsule Routing) + later
Sub-arc 2 closure cascade per ADR-0041 CL.1 scope patch register
substantively. Sub-arc 2 status field at section-12-progress remains
**IN FLIGHT** unchanged by G3.10.

**COE / ADR-0022 integration remains forward-substrate.** ADR-0022
combined_score formula at `apps/api/src/services/coe/keywords.ts:87-93`
preserved verbatim at G3.10. COE integration paths enumerated at ADR-0043
§Sub-decision 4 (replace tagOverlap / 4th coefficient / rerank / prefilter)
remain forward-substrate; paths (a) + (b) require Founder-authorized ADR-0022
amendment if/when authorized. NOT a Gap 3 closure dependency.

**ADR-0035 §9 cluster expansion (Option α; 37th + 38th observations
promoted).** Cluster size 36 → 38 after G3.10 LANDS:

- **37th**: D-VITEST-NPX-CONFIG-DEFAULT-LOADS-PRODUCTION-SUPABASE — critical
  production-safety substrate trap. Bare `npx vitest run <file>` routes
  through `vitest.config.ts` which loads `.env` and points focused tests at
  production Supabase. Canonical commands MUST use `--config
  vitest.{unit,integration}.config.ts` OR the `npm run test:{unit,integration}`
  scripts (which load `.env.test`). Bare `npx vitest run <file>` FORBIDDEN at
  substrate-build register substantively until `vitest.config.ts` itself is
  amended at substrate-architectural register substantively (forward-substrate;
  Drift G4-A acknowledged at ADR-0011 register but not yet remediated).
- **38th**: D-LOCAL-DEV-ENV-CROSS-LANGUAGE-OWNERSHIP-DRIFT — umbrella
  unifying D-G3.3-LOCAL-CONTAINER-DRIFT (recurrence-1; G3.3 register) +
  D-LOCAL-ECTO-MIGRATION-STATE-DRIFT-AT-G3.8-TIER-2 (recurrence-2; G3.8
  register) + D-PRISMA-ECTO-CROSS-LANGUAGE-SCHEMA-MIGRATIONS-OWNERSHIP-
  COLLISION-AT-LOCAL-REFRESH (recurrence-3; G3.9 register). Captures the
  recurring local-development environment + cross-language data ownership
  boundary pattern per ADR-0033 §Decision 7 + Q-5BII-EXEC-5. Canonical
  local-refresh sequence canonicalized at the 38th observation register
  substantively.

**Commit-body-only observations preserved at G3.10** (NOT §9 promoted per
Founder Q-G3.10-ε LOCK Option α): D-PGVECTOR-EX-HEX-PACKAGE-NAME-DRIFT-AT-
Q-G3-θ (cosmetic label; reconcile at α-3 future implementation only) +
D-ELIXIR-VECTOR-CONSUMER-DELIBERATELY-EXCLUDED-AT-FOUNDATION-PRODUCTION-
READINESS (already canonical at G3.8 H2 substantive body) + D-IMPLICIT-VS-
EXPLICIT-BOUNDARY-CONTRACT-AT-Q-G3-θ-G3.3-DEFERRAL (already captured at G3.8
amendment register) + D-J4-ALREADY-COVERS-3-OF-4-J7-FILTERS-AT-INTEGRATION-
TIER (G3.9-paste-specific; no broader pattern warranting §9 promotion).

**Critical coherence preserved at G3.10** (Founder Q-G3.10-η enumeration):
no `apps/**` / no `tests/**` / no `packages/**` / no `scripts/**` / no
`schema.prisma` / no DB scripts / no CI workflows / no package/lockfiles /
no `mix.exs` / no `mix.lock` / no `audit.ts` / no new audit literals / no
ADR-0022 amendment / no ADR-0033 amendment / no new files. `coe/**` +
`keywords.ts` + `read.service.ts` + `write.service.ts` + `similarity.service.ts`
+ `embedding.service.ts` UNTOUCHED. All G3.9 production-contract test
evidence preserved by construction (docs-only closure cascade does not
mutate G3.9 substrate).

**Patent-implementation evidence per ADR-0020 two-register IP discipline:**
Gap 3 closure at G3.10 canonicalizes the pgvector embedding substrate as
patent-implementation evidence per US 12,517,919 + US 12,164,537 +
US 12,399,904. The G3.1-G3.10 lineage at the §Post-Closure Implementation
Lineage register substantively below provides cryptographically-timestamped
commit evidence distinguishing NIOV substrate from any unauthorized parallel
build at canonical-execution register substantively per ADR-0020 register.

**Founder authorization explicit at G3.10 closure landing per
RULE 20 at `[BEAM-CAPSULE-EMBEDDING-CLOSURE-G3.10-QLOCK]` +
`[BEAM-CAPSULE-EMBEDDING-CLOSURE-G3.10-EXECUTE-VERIFY-AUTH]` +
`[BEAM-CAPSULE-EMBEDDING-CLOSURE-G3.10-COMMIT-AUTH]`.**

## Post-Closure Implementation Lineage

ADR-0043 Gap 3 pgvector Embedding implementation lineage canonical at
canonical-execution register substantively per ADR-0020 two-register IP
discipline. 10-sub-phase mini-arc decomposition per ADR-0043 §Sub-decision 11
(Q-G3-κ) — G3.1 docs-only ADR + G3.2 infra image switch + G3.3 schema +
G3.4 provider + G3.5 write-integration + G3.6 retrieval + G3.7 conditional
backfill SKIP + G3.8 Elixir-boundary contract LANDED + G3.9 production-
contract integration tests + G3.10 docs-only closure cascade.

| Sub-phase | Commit SHA | Tag + verbatim subject |
|-----------|------------|------------------------|
| G3.1 | `78f94c7` | `[BEAM-CAPSULE-EMBEDDING-ADR]` G3.1: ADR-0043 NEW Proposed — pgvector embedding architecture |
| G3.2 | `302d6c9` | `[CAPSULE-EMBEDDING-INFRA]` G3.2: pgvector image pin LANDED — infra parity for ADR-0043 |
| G3.3 | `bcba7d1` | `[CAPSULE-EMBEDDING-SCHEMA]` G3.3: Prisma embedding field + pgvector extension + HNSW index |
| G3.4 | `7c04e13` | `[CAPSULE-EMBEDDING-PROVIDER]` G3.4: embedding provider substrate |
| G3.5 | `bdaffef` | `[CAPSULE-EMBEDDING-WRITE-INTEGRATION]` G3.5: write-path embedding integration (mutation_type matrix; degrade-on-failure) |
| G3.6 | `371e108` | `[CAPSULE-EMBEDDING-RETRIEVAL]` G3.6: similarity retrieval service + route + audit literal (RULE 0 SQL filters; HNSW iterative scan) |
| G3.7 | `ee0b01b` | `[CAPSULE-EMBEDDING-BACKFILL]` G3.7: formal SKIP/no-op record (lazy-on-first-read default; bulk-backfill forward-substrate) |
| G3.8 | `55984e3` | `[CAPSULE-EMBEDDING-ELIXIR]` G3.8: Elixir-boundary contract LANDED (embedding column Prisma-owned; not Ecto-visible; explicit named test) |
| G3.9 | `fa80624` | `[CAPSULE-EMBEDDING-PRODUCTION-CONTRACT]` G3.9: broader integration tests (4 NEW J5-J8; end-to-end ADD+UPDATE + RULE 0 joint adversarial + NULL graceful under real HNSW) |
| G3.10 | this commit | `[BEAM-CAPSULE-EMBEDDING-CLOSURE]` G3.10: close Gap 3; accept ADR-0043; add ADR-0035 observations 37-38 |

**Gap 3 CLOSED at canonical-state register substantively at G3.10.** G3 mini-
arc 10/10. ADR-0043 Status `Accepted 2026-05-18`. Sub-arc 2 closure remains
forward-substrate per ADR-0041 CL.1 scope patch register substantively.
