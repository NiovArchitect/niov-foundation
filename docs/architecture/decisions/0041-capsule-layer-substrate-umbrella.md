# ADR-0041: Capsule Layer Substrate Umbrella

## Status

Proposed 2026-05-17

Author: niovarchitect (NIOV Labs Founder; patent-holder per US 12,517,919 + US 12,164,537 + US 12,399,904)

**CL.1 docs-only umbrella commit canonical at canonical-prose register
substantively at this commit register substantively; Sub-arc 2 remains
IN FLIGHT pending per-gap ADR mini-arcs (ADR-0042 + ADR-0043 + ADR-0044
+ ADR-0045 + optional ADR-0046) and later Sub-arc 2 closure cascade
canonical at canonical-state register substantively.** Status will
move to Accepted at Sub-arc 2 closure cascade register substantively
per ADR-0040 §Post-Closure Implementation Lineage precedent register
substantively.

## Context

Sub-arc 1 (DMW Worker + Hive Dispatch + Promote-on-Activity + DEVICE
Cold-Shard) CLOSED 2026-05-17 at sub-arc 1 sub-phase d Commit 4 of 4
per ADR-0040 §Post-Closure Implementation Lineage register
substantively per `3eaad71` commit register substantively. Sub-arc 1
closure delivers per-DMW dispatch substrate at hive scale for
ENTERPRISE + PERSONAL-promoted + DEVICE cold-shard tiers canonical at
canonical-execution register substantively.

Sub-arc 2 capsule layer substrate canonical at canonical-architectural
register substantively addresses the four gaps named at D.4 closure
forward-substrate register substantively (sub-arc 1 sub-phase d
closure body register substantively): Gap 1 (ADD/UPDATE/MERGE/NOOP
mutation discrimination), Gap 3 (pgvector embedding), Gap 4 (decay
execution), Gap 5 (capsule-level staleness detection); plus weighting
architecture per Entry #28 forward-substrate reference + AI_AGENT
EntityType-discriminated capsule routing disposition canonical at
canonical-decision register substantively per
D-AI-AGENT-ENTITY-TYPE-vs-WALLET-TYPE-DISCRIMINATION-DRIFT observation
canonical at C.3 commit body register substantively per `18300c3`
commit register substantively.

RULE 0 (Humans Always Sovereign; CLAUDE.md L134 canonical at
canonical-rule register substantively per Founder RULE 0 continuity
patch at `[BEAM-CAPSULE-LAYER-ADR-RULE0-PATCH]` register
substantively) governs every Sub-arc 2 substrate-architectural
decision: capsule layer is the substrate where human-entity data
lives at canonical-state register substantively; capsule mutation
discrimination governs write semantics that touch human-entity
revocable permission boundaries; pgvector embedding substrate
processes human-entity content at canonical-execution register
substantively; AI_AGENT EntityType-discriminated routing preserves
the lower default permission ceilings AI entities have vs human
entities per RULE 0 canonical at canonical-rule register substantively.

Substrate-state ground truth at sub-arc 2 register substantively per
CL.0 read-only research arc register substantively at prior turn
register substantively + this commit Step 1 pre-flight register
substantively:

- MemoryCapsule Prisma schema canonical at
  `packages/database/prisma/schema.prisma:95` register substantively
  with 27 fields including capsule_type, topic_tags, relevance_score,
  decay_type, decay_rate, feedback_loop_score, payload_summary,
  version, content_hash, storage_tier (NOT greenfield)
- CapsuleType enum at `packages/database/prisma/schema.prisma:413`
  with 20 values canonical at canonical-state register substantively
- DecayType enum at `packages/database/prisma/schema.prisma:438` with
  5 values (FOUNDATIONAL/TIME_BASED/ACCESS_BASED/PERMANENT/SESSION_ONLY)
  canonical at canonical-state register substantively
- EntityType enum at `packages/database/prisma/schema.prisma:391`
  distinct from WalletType at L407 canonical at canonical-knowledge
  register substantively per ADR-0033 cross-language data ownership
  register substantively
- COSMP TypeScript services at `apps/api/src/services/cosmp/`:
  negotiate, read, share, write, jurisdiction-enforcement,
  regulator-enforcement (substrate exists; NOT greenfield)
- Elixir capsule substrate at
  `apps/cosmp_router/lib/cosmp_router/capsule/` + `capsule.ex` +
  `schemas/memory_capsule.ex` canonical at canonical-state register
  substantively per ADR-0031 7-layer patent structure + ADR-0033
  cross-language data ownership register substantively
- Gap 1 mutation discrimination: GREENFIELD at MutationType/code
  register substantively (zero matches in apps/packages); version +
  previous_version + content_hash exist as anchor substrate canonical
  at canonical-knowledge register substantively
- Gap 3 pgvector embedding: GREENFIELD at code/schema register
  substantively (only TODO comments at
  `apps/api/src/services/otzar/priming.ts:150,158` register
  substantively)
- Gap 4 decay execution: PARTIAL canonical at canonical-state register
  substantively (lazy-at-read pattern at
  `apps/api/src/services/coe/coe.service.ts:235` register substantively
  + L387 forget-floor comment + L524 "Section 10 Loop 1 hook: bump used
  capsule relevance, decay"; scheduler/recompute substrate GREENFIELD)
- Gap 5 capsule-level staleness: GREENFIELD at capsule register
  substantively (no capsule.last_verified / capsule.freshness_score
  fields); feedback-loop staleness exists separately at
  `apps/api/src/services/feedback/feedback.service.ts:169` register
  substantively (`stale_loops` substrate) and MUST NOT be conflated
  canonical at canonical-honest register substantively
- AI_AGENT EntityType-discriminated capsule routing: PARTIAL canonical
  at canonical-state register substantively (EntityType enum + AI_AGENT
  detection at `apps/api/src/services/cosmp/negotiate.service.ts:143`
  register substantively exists; capsule-routing branch greenfield);
  per D-AI-AGENT-ENTITY-TYPE-vs-WALLET-TYPE-DISCRIMINATION-DRIFT
  observation register substantively AI_AGENT remains canonical at
  EntityType register substantively NOT WalletType register
  substantively + maps to PERSONAL wallet_type at INSERT register
  substantively per TS-side `defaultWalletTypeFor/1` helper canonical
  at `packages/database/src/queries/wallet.ts` register substantively
- Weighting architecture per Entry #28: document-register only
  canonical at canonical-knowledge register substantively (13 docs
  reference at canonical-prose register substantively); combined_score
  canonical at ADR-0022 register substantively (0.45/0.35/0.20
  coefficients); NOT implemented as canonical service at canonical-
  execution register substantively

### CL.0 Rule 21 research arc canonical at canonical-knowledge register substantively

Per RULE 21 D-PRE-AUTHORIZATION-RESEARCH-ARC canonical at canonical-
rule register substantively per `67f6112` commit substantively +
ADR-0035 27th + 28th observation D-PASTE-AUTHORING-FAILED-TO-GREP-
CANONICAL-STATE-BEFORE-PREMISE-LOCK + D-PASTE-AUTHORIZATION-FAILED-TO-
GREP-DISPATCH-HELPER-ARG-ORDER canonical at substrate-architectural
register substantively per `13da364` + `3eaad71` commits substantively,
CL.0 `[BEAM-CAPSULE-LAYER-RESEARCH-ARC]` read-only research arc
canonical at canonical-knowledge register substantively at prior turn
register substantively (5 parallel WebSearch queries) surfaced:

- **pgvector production architecture (Q-E LOCK Option recommended
  substantively):** HNSW + cosine = production default canonical at
  canonical-knowledge register substantively for active-write phase +
  high-recall requirement; HNSW O(log N) search + 2-5x memory vs
  IVFFlat + can build on empty table (no training step); IVFFlat =
  bulk-load preference for large mostly-static datasets (k-means
  training step required at CREATE INDEX). HNSW indexing strategy
  LOCKED at ADR-0041 umbrella register substantively per Founder Q-E
  LOCK; ADR-0043 forward-substrate at canonical-coherence register
  substantively must verify Supabase pgvector availability + Prisma
  vector handling + migration strategy + index creation strategy +
  cost/storage implications BEFORE code at canonical-execution
  register substantively.

- **Embedding model selection (Q-F LOCK Option recommended
  substantively):** text-embedding-3-small at 1536 dimensions =
  production default canonical at canonical-knowledge register
  substantively ($0.02/1M tokens Standard; most widely used; replaced
  ada-002 in early 2024; supported by every major vector database);
  text-embedding-3-large at 3072 dimensions = premium tier ($0.13/1M
  tokens; 6.5x cost; 2 points higher MTEB); Matryoshka support enables
  256/512/1024 truncation while preserving performance. text-embedding-
  3-small LOCKED at ADR-0041 umbrella register substantively per
  Founder Q-F LOCK; ADR-0043 forward-substrate at canonical-coherence
  register substantively must verify provider abstraction + cost
  projections + storage projections + whether Matryoshka truncation
  should be supported BEFORE code at canonical-execution register
  substantively.

- **Event sourcing mutation discrimination (Q-G LOCK Option
  recommended substantively):** ADD/UPDATE/MERGE/NOOP terminology
  NOT industry-standard canonical at canonical-knowledge register
  substantively (NIOV-domain enum at substrate-state register
  substantively). Standard pattern: at-least-once delivery +
  deduplication via sequence number tracking + idempotency via
  deterministic state mutations canonical at canonical-knowledge
  register substantively. NIOV substrate-coherent disposition
  canonical at canonical-coherence register substantively: define
  MutationType as NIOV-domain enum + anchor on existing `version` +
  `content_hash` + canonical_record/1 per ADR-0033 register
  substantively for deterministic discrimination at canonical-
  execution register substantively. ADD/UPDATE/MERGE/NOOP NIOV-domain
  semantics LOCKED at ADR-0041 umbrella register substantively per
  Founder Q-G LOCK; ADR-0042 forward-substrate at canonical-coherence
  register substantively must define exact semantic boundaries +
  idempotency behavior + canonical_record/content_hash usage + version
  behavior + audit event literals + Prisma enum migration strategy
  BEFORE code at canonical-execution register substantively.

- **Temporal decay execution (Q-H LOCK Option recommended
  substantively):** Two canonical patterns at canonical-knowledge
  register substantively — lazy at-query-time (Mem0: re-rank not
  filter; fire-and-forget bounded executor preserves search latency)
  + scheduled recompute (MuninnDB: engine-native primitives
  continuously recalculating). NIOV substrate-state ground truth
  canonical at canonical-state register substantively: lazy-at-read
  pattern already exists at `coe.service.ts` register substantively
  (FOUNDATIONAL exemption + forget-floor check + Loop 1 hook canonical
  at canonical-execution register substantively). Lazy at-read-time
  decay LOCKED at ADR-0041 umbrella register substantively per Founder
  Q-H LOCK (preserves existing substrate + matches BEAM-native
  simplicity disposition + avoids scheduler infrastructure dependency);
  ADR-0044 forward-substrate at canonical-coherence register
  substantively must distinguish existing lazy read-path behavior
  from missing formal decay execution substrate + decide whether
  scheduler/backfill is needed later BEFORE code at canonical-
  execution register substantively.

- **Knowledge staleness detection (Q-I LOCK Option recommended
  substantively):** 4-dimension framework canonical at canonical-
  knowledge register substantively (content age + embedding lag +
  stale retrieval rate + coverage drift); required substrate:
  `last_verified` metadata field + automated monitoring + freshness
  thresholds. NIOV substrate-state canonical at canonical-state
  register substantively: `updated_at` + `version` + `content_hash`
  exist (sufficient for content age + stale retrieval rate); capsule-
  level staleness GREENFIELD at canonical-honest register
  substantively; feedback-loop staleness exists at feedback.service.ts
  register substantively (Loop 7) and MUST NOT be conflated per
  Founder Q-I LOCK canonical at canonical-coherence register
  substantively. Capsule-level staleness LOCKED as distinct substrate
  at ADR-0041 umbrella register substantively per Founder Q-I LOCK;
  ADR-0045 forward-substrate at canonical-coherence register
  substantively must evaluate last_verified + freshness scoring +
  stale retrieval rate + coverage drift + Loop 7 integration + schema
  migration impact BEFORE code at canonical-execution register
  substantively.

- **AI_AGENT EntityType-discriminated capsule routing (Q-J LOCK Option
  recommended substantively):** Standard policy pattern at canonical-
  knowledge register substantively — entity type as routing
  discriminator; wallet type as economic/storage tier canonical at
  canonical-coherence register substantively per ADR-0039 L251-255 +
  26th/27th observation register substantively. AI_AGENT entities map
  to PERSONAL wallet_type at INSERT register substantively but should
  route differently at capsule layer per D-AI-AGENT-ENTITY-TYPE-vs-
  WALLET-TYPE-DISCRIMINATION-DRIFT observation register substantively.
  EntityType-discriminated capsule routing LOCKED at ADR-0041 umbrella
  register substantively per Founder Q-J LOCK (AI_AGENT remains
  EntityType NOT WalletType; AI_AGENT continues mapping to PERSONAL
  wallet_type for storage/economic tier; Sub-arc 2 decides capsule-
  layer routing using EntityType not WalletType); ADR-0042 (Gap 1
  mutation discrimination) OR optional ADR-0046 forward-substrate at
  canonical-coherence register substantively per Founder Q-C LOCK
  canonicalizes the routing branch at canonical-execution register
  substantively (ADR-0041 §Sub-decision 1 below determines whether
  AI_AGENT routing belongs inside Gap 1 or warrants ADR-0046).

Sources canonical at canonical-knowledge register substantively
(cited at D.0/CL.0 research arc register substantively per `67f6112`
RULE 21 promotion commit body precedent register substantively):

- github.com/pgvector/pgvector — pgvector canonical reference
- cloud.google.com/blog/products/databases/faster-similarity-search-performance-with-pgvector-indexes
  — Google Cloud HNSW vs IVFFlat
- aws.amazon.com/blogs/database/optimize-generative-ai-applications-with-pgvector-indexing-a-deep-dive-into-ivfflat-and-hnsw-techniques
  — AWS pgvector indexing deep dive
- platform.openai.com/docs/models/text-embedding-3-large +
  developers.openai.com/api/docs/models/text-embedding-3-small —
  OpenAI embedding models canonical
- openai.com/index/new-embedding-models-and-api-updates — OpenAI new
  embedding models announcement (Matryoshka support)
- learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing
  — Microsoft Azure event sourcing pattern
- domaincentric.net/blog/event-sourcing-projection-patterns-deduplication-strategies
  — Event sourcing deduplication strategies
- mem0.ai/blog/introducing-memory-decay-in-mem0 — Mem0 lazy at-query-
  time decay canonical
- arxiv.org/html/2604.02280 — Novel Memory Forgetting Techniques for
  Autonomous AI Agents
- arxiv.org/pdf/2509.18868 — Memory in LLMs: Mechanisms, Evaluation,
  Evolution
- arxiv.org/html/2511.06179v1 — MemoriesDB Temporal-Semantic-Relational
  Database
- atlan.com/know/llm-knowledge-base-freshness-scoring — 4-dimension
  freshness scoring framework
- researchgate.net/publication/395806121 — Solving Freshness in RAG
  (recency prior + heuristic trend detection limits)
- ADR-0033 cross-language data ownership (EntityType vs WalletType
  canonical at canonical-knowledge register substantively)
- ADR-0039 L251-255 + Amendment 1 (AI_AGENT routing distinction
  precedent)
- ADR-0022 combined_score formula canonical (0.45/0.35/0.20
  coefficients per relevance/recency/feedback)

### CL.1 substrate scope at canonical-honest register substantively

CL.1 docs-only commit substantively LOCKS the ADR-0041 umbrella
architectural substrate for Sub-arc 2 capsule layer canonical at
canonical-prose register substantively per Founder Q-K LOCKED.
**Implementation closure of per-gap substrate forward-substrate at
ADR-0042 + ADR-0043 + ADR-0044 + ADR-0045 + optional ADR-0046 per-gap
mini-arcs register substantively per Founder Q-C LOCKED.** CL.1 does
NOT:

- write code at canonical-execution register substantively
- modify Prisma schema at canonical-state register substantively
- add pgvector dependency or extension
- add embedding services or provider abstraction
- modify write.service.ts dispatch semantics
- modify Elixir capsule code at canonical-execution register
  substantively
- modify tests at canonical-execution register substantively
- modify AI_AGENT runtime behavior at canonical-state register
  substantively

CL.1 prepares the architecture + canonical row + catalog entries
only.

## Decision

NIOV Labs canonicalizes Sub-arc 2 capsule layer substrate at
canonical-architectural register substantively via umbrella ADR-0041
+ 4 per-gap forward-substrate ADRs (ADR-0042 + ADR-0043 + ADR-0044 +
ADR-0045) + optional ADR-0046 for AI_AGENT EntityType-discriminated
capsule routing if ADR-0041 §Sub-decision 6 determines it warrants
separate ADR canonical at canonical-prose register substantively per
Founder Q-A LOCKED Option B umbrella + per-gap ADR strategy register
substantively per Founder Q-C LOCKED.

### Sub-decision 1: Umbrella + per-gap ADR strategy

Per Founder Q-A LOCKED Option B at `[BEAM-CAPSULE-LAYER-QLOCK]`
register substantively. ADR-0041 umbrella canonicalizes Sub-arc 2
architectural inventory + sequencing + forward-substrate
decomposition + cross-cutting decisions (AI_AGENT routing + weighting
+ RULE 0 compliance) at canonical-prose register substantively.
Per-gap ADRs canonicalize implementation-depth decisions at canonical-
coherence register substantively.

Substrate-coherent rationale at canonical-honest register
substantively:

- Capsule layer is patent-implementation core canonical at canonical-
  architectural register substantively per US 12,517,919; warrants
  depth per gap canonical at canonical-prose register substantively
- Substrate state inventory shows 4 gaps with different substrate
  depths (Gap 1 + 3 greenfield; Gap 4 + 5 partial); unified ADR would
  imbalance depth per gap at canonical-coherence register
  substantively
- CAR Sub-box pattern precedent canonical at canonical-coherence
  register substantively (umbrella + per-substrate-area ADR; CAR
  Sub-box 2 + ADR-0037; CAR Sub-box 3 + ADR-0036)

### Sub-decision 2: Gap 1 Mutation Discrimination forward-substrate ADR-0042

Per Founder Q-G LOCKED at `[BEAM-CAPSULE-LAYER-QLOCK]` register
substantively. ADR-0042 (Gap 1 Mutation Discrimination) at canonical-
prose register substantively canonicalizes ADD/UPDATE/MERGE/NOOP
NIOV-domain MutationType semantics canonical at canonical-execution
register substantively:

- ADD = new capsule (no prior version exists for canonical_record
  match)
- UPDATE = field changes with version increment
- MERGE = semantic-equivalent payload triggering content_hash match
  (existing capsule reused)
- NOOP = idempotent re-submission (canonical_record byte-equivalent;
  no DB write)

ADR-0042 must define at canonical-prose register substantively: exact
semantic boundaries + idempotency behavior + canonical_record/content_hash
usage per ADR-0033 register substantively + version behavior + audit
event literals (CAPSULE_MUTATION_ADD/UPDATE/MERGE/NOOP candidates per
existing audit_event_type register substantively) + Prisma enum
migration strategy per ADR-0025 Schema-Push-Target Discipline register
substantively.

Substrate-state ground truth at canonical-state register substantively:
Gap 1 GREENFIELD at MutationType code register substantively; version
+ previous_version + content_hash fields exist on MemoryCapsule
canonical at canonical-state register substantively; canonical_record/1
14-field byte-equivalent canonical at ADR-0033 register substantively
at Elixir register substantively.

### Sub-decision 3: Gap 3 pgvector Embedding forward-substrate ADR-0043

Per Founder Q-E + Q-F LOCKED at `[BEAM-CAPSULE-LAYER-QLOCK]` register
substantively. ADR-0043 (Gap 3 pgvector Embedding) at canonical-prose
register substantively canonicalizes pgvector substrate + embedding
model + provider abstraction canonical at canonical-execution register
substantively:

- pgvector index strategy LOCKED at ADR-0041 umbrella register
  substantively as HNSW + cosine recommended default per Q-E
  (mathematically optimal for active-write phase + high-recall
  requirement); ADR-0043 must verify Supabase pgvector availability +
  Prisma vector handling + migration strategy + index creation strategy
  (CREATE INDEX CONCURRENTLY for zero-downtime per ADR-0025 register
  substantively) + cost/storage implications BEFORE code at canonical-
  execution register substantively
- Embedding model LOCKED at ADR-0041 umbrella register substantively
  as text-embedding-3-small at 1536 dimensions recommended default per
  Q-F; ADR-0043 must verify provider abstraction + cost projections at
  billion-capsule register substantively + storage projections +
  whether Matryoshka truncation should be supported BEFORE code at
  canonical-execution register substantively

Substrate-state ground truth at canonical-state register substantively:
Gap 3 GREENFIELD at code/schema register substantively (only
TODO/comment references at `apps/api/src/services/otzar/priming.ts:150,158`
register substantively); NEW pgvector field on MemoryCapsule =
breaking schema migration per ADR-0025 register substantively;
embedding generation pipeline NEW substrate.

### Sub-decision 4: Gap 4 Decay Execution Formalization forward-substrate ADR-0044

Per Founder Q-H LOCKED at `[BEAM-CAPSULE-LAYER-QLOCK]` register
substantively. ADR-0044 (Gap 4 Decay Execution Formalization) at
canonical-prose register substantively canonicalizes lazy-at-read
decay strengthening canonical at canonical-execution register
substantively:

- Lazy at-read decay LOCKED at ADR-0041 umbrella register substantively
  as recommended default per Q-H (preserves existing substrate at
  canonical-coherence register substantively + matches BEAM-native
  simplicity disposition + avoids scheduler infrastructure dependency);
  ADR-0044 must distinguish existing lazy read-path behavior from
  missing formal decay execution substrate + decide whether
  scheduler/backfill is needed later BEFORE code at canonical-execution
  register substantively

Substrate-state ground truth at canonical-state register substantively:
Gap 4 PARTIAL canonical at canonical-state register substantively;
lazy-at-read pattern at coe.service.ts:235 register substantively +
L387 forget-floor + L524 Loop 1 hook exist; scheduler/recompute
substrate GREENFIELD at canonical-honest register substantively.

### Sub-decision 5: Gap 5 Capsule-Level Staleness Detection forward-substrate ADR-0045

Per Founder Q-I LOCKED at `[BEAM-CAPSULE-LAYER-QLOCK]` register
substantively. ADR-0045 (Gap 5 Capsule-Level Staleness Detection) at
canonical-prose register substantively canonicalizes capsule-level
staleness substrate canonical at canonical-execution register
substantively:

- Capsule-level staleness LOCKED at ADR-0041 umbrella register
  substantively as distinct from feedback-loop staleness per Q-I (NEW
  last_verified field at MemoryCapsule recommended); ADR-0045 must
  evaluate last_verified + freshness scoring + stale retrieval rate +
  coverage drift + Loop 7 integration + schema migration impact BEFORE
  code at canonical-execution register substantively

Substrate-state ground truth at canonical-state register substantively:
Gap 5 GREENFIELD at capsule register substantively; feedback-loop
staleness exists at feedback.service.ts:169 register substantively
(`stale_loops` substrate) and MUST NOT be conflated canonical at
canonical-honest register substantively per Founder Q-I LOCK +
canonical at canonical-coherence register substantively.

### Sub-decision 6: AI_AGENT EntityType-discriminated capsule routing

Per Founder Q-J LOCKED at `[BEAM-CAPSULE-LAYER-QLOCK]` register
substantively + RULE 0 (Humans Always Sovereign) governance canonical
at canonical-rule register substantively per CLAUDE.md L134 register
substantively (AI entities have lower default permission ceilings than
humans; AI entities cannot grant access to other AI entities; only a
human entity can grant LONG_TERM or PERMANENT access).

EntityType-discriminated capsule routing LOCKED at ADR-0041 umbrella
register substantively per Q-J:

- AI_AGENT remains canonical at EntityType register substantively NOT
  WalletType register substantively at substrate-state register
  substantively per ADR-0033 cross-language data ownership register
  substantively
- AI_AGENT continues mapping to PERSONAL wallet_type for
  storage/economic tier at INSERT register substantively per TS-side
  `defaultWalletTypeFor/1` helper canonical at
  `packages/database/src/queries/wallet.ts` register substantively
- Sub-arc 2 decides capsule-layer routing using EntityType NOT
  WalletType canonical at canonical-coherence register substantively
  per Founder Q-J LOCK
- RULE 0 compliance canonical at canonical-rule register substantively:
  AI_AGENT capsule operations preserve lower default permission
  ceilings canonical at canonical-execution register substantively

ADR-0041 §Sub-decision 1 + ADR-0042 (Gap 1) determine at canonical-
prose register substantively whether AI_AGENT routing branch belongs
INSIDE Gap 1 mutation discrimination ADR (substrate-coherent if
MutationType discriminates per EntityType at write register
substantively) OR warrants separate ADR-0046 (substrate-coherent if
AI_AGENT routing cuts across multiple gaps register substantively).
Founder Q-C LOCKED Option register substantively allows optional
ADR-0046; ADR-0041 §Sub-decision 1 + ADR-0042 prose register
substantively will canonicalize the decision at canonical-coherence
register substantively.

### Sub-decision 7: Weighting architecture per Entry #28

Per Founder Q-B LOCKED (ADR-0041 docs-only umbrella) + Q-D LOCKED
(weighting at document register only) at `[BEAM-CAPSULE-LAYER-QLOCK]`
register substantively. ADR-0041 §Sub-decision 7 references weighting
architecture per Entry #28 forward-substrate at canonical-knowledge
register substantively WITHOUT claiming implementation canonical at
canonical-execution register substantively:

- Entry #28 weighting architecture canonical at operator memory entry
  register substantively (13 docs reference at canonical-prose
  register substantively per CL.0 inventory; not yet a canonical
  service at canonical-execution register substantively)
- ADR-0022 combined_score formula canonical at canonical-rule register
  substantively (0.45/0.35/0.20 coefficients per relevance/recency/
  feedback) — anchor exists at substrate-state register substantively
- Weighting architecture implementation forward-substrate at
  canonical-coherence register substantively per per-gap ADR mini-arcs
  register substantively (ADR-0043 embedding similarity + ADR-0044
  decay + ADR-0045 staleness all contribute to weighting decision at
  canonical-execution register substantively)
- NO standalone ADR for weighting architecture at this sub-arc 2
  register substantively per Founder Q-B + Q-D LOCKS canonical at
  canonical-coherence register substantively

### Sub-decision 8: Testability and migration discipline

Per ADR-0034 BEAM testability discipline canonical at canonical-
knowledge register substantively + ADR-0025 Schema-Push-Target
Discipline canonical at canonical-rule register substantively +
ADR-0011 three-tier test stratification canonical at canonical-rule
register substantively.

Sub-arc 2 testability canonical at canonical-coherence register
substantively:

- Per-gap unit tests at TypeScript + Elixir registers substantively
  per existing test patterns (mirror CosmpRouter.DeviceShardTest
  15-test precedent at D.2 register substantively)
- Per-gap integration tests at COSMP service + Elixir router registers
  substantively (mirror CosmpRouter.GRPC.DeviceShardDispatchTest
  7-test precedent at D.3 register substantively)
- Discriminator test pattern canonical at ADR-0035 28th observation
  register substantively (use invalid config / unexpected state to
  prove explicit branch is exercised)
- Migration discipline per ADR-0025: every Prisma schema change
  canonical at canonical-state register substantively requires
  explicit env-target per `prisma db push` discipline canonical at
  canonical-rule register substantively
- Cross-language data ownership per ADR-0033 register substantively:
  TypeScript + Elixir capsule schemas MUST stay byte-equivalent at
  canonical_record/1 + canonical_json/1 + sha256_hex/1 audit primitive
  register substantively

### Sub-decision 9: Patent-implementation evidence

Per ADR-0020 two-register IP discipline canonical at canonical-
architectural register substantively + RULE 0 (Humans Always
Sovereign) canonical at canonical-rule register substantively + RULE
20 (Founder authorization canonical at canonical-rule register
substantively; explicit at this ADR's creation per
`[BEAM-CAPSULE-LAYER-QLOCK]` + `[BEAM-CAPSULE-LAYER-ADR-RULE0-PATCH]`
+ `[BEAM-CAPSULE-LAYER-ADR-CL1-SCOPE-PATCH]` register substantively).

Sub-arc 2 capsule layer substrate canonical at canonical-architectural
register substantively delivers core patent-implementation evidence at
canonical-coherence register substantively per US 12,517,919 (COSMP
Protocol 7-layer Capsule structure) + US 12,164,537 + US 12,399,904
(DMW substrate):

- Capsule layer is the substrate where human-entity data lives at
  canonical-state register substantively per RULE 0 governance
  register substantively
- Mutation discrimination canonical at canonical-execution register
  substantively per ADR-0042 register substantively governs write
  semantics that touch human-entity revocable permission boundaries
- pgvector embedding canonical at canonical-execution register
  substantively per ADR-0043 register substantively processes human-
  entity content at substrate-state register substantively
- Decay execution canonical at canonical-execution register
  substantively per ADR-0044 register substantively governs human-
  entity memory lifecycle at canonical-coherence register substantively
- Capsule-level staleness canonical at canonical-execution register
  substantively per ADR-0045 register substantively governs human-
  entity memory freshness at canonical-coherence register substantively
- AI_AGENT EntityType-discriminated capsule routing canonical at
  canonical-execution register substantively per ADR-0041 §Sub-decision
  6 register substantively preserves RULE 0 lower default permission
  ceilings for AI entities at canonical-state register substantively
- Cryptographically-timestamped commit lineage CL.1 + per-gap mini-arc
  commits + Sub-arc 2 closure cascade canonical at canonical-state
  register substantively per ADR-0020 register substantively

## Consequences

### Easier

- Sub-arc 2 architecture LOCKED at single ADR-0041 umbrella register
  substantively per Founder Q-A LOCK
- Per-gap depth at separate ADRs (ADR-0042 + ADR-0043 + ADR-0044 +
  ADR-0045) per Founder Q-C LOCK
- Founder Q-locks (Q-E HNSW + cosine, Q-F text-embedding-3-small, Q-G
  ADD/UPDATE/MERGE/NOOP, Q-H lazy-at-read, Q-I capsule-level staleness,
  Q-J EntityType-discriminated routing) lock recommended defaults at
  canonical-coherence register substantively
- RULE 0 governance canonical at canonical-rule register substantively
  explicit at every Sub-arc 2 substrate-architectural decision
- Substrate-state ground truth canonical at canonical-honest register
  substantively per CL.0 4-gap inventory register substantively
  prevents premise drift at canonical-execution register substantively
- Discriminator test pattern canonical per ADR-0035 28th observation
  register substantively forward-substrate at per-gap ADR test
  registers substantively

### Harder

- 4 per-gap ADRs (+ optional ADR-0046) = significant documentation
  scope at canonical-prose register substantively (~5 ADRs total for
  Sub-arc 2 register substantively)
- Cross-ADR dependency management complexity at canonical-coherence
  register substantively (Gap 1 mutation discrimination affects Gap 3
  embedding pipeline; Gap 4 decay affects Gap 5 staleness scoring;
  weighting per Entry #28 cuts across all 4 gaps)
- pgvector dependency canonical at canonical-state register
  substantively per Q-E LOCK requires Supabase deployment-target
  verification per ADR-0018 register substantively (forward-substrate
  at ADR-0043 register substantively)
- text-embedding-3-small cost projection at billion-capsule register
  substantively forward-substrate at ADR-0043 register substantively
  (canonical OpenAI dependency canonical at canonical-state register
  substantively; provider abstraction canonical at canonical-coherence
  register substantively required per ADR-0018 deployment-target-
  agnosticism canonical)
- MutationType enum addition canonical at Prisma schema register
  substantively = breaking migration per ADR-0025 register
  substantively (forward-substrate at ADR-0042 register substantively)
- Capsule-level staleness substrate at canonical-state register
  substantively = NEW MemoryCapsule field (last_verified canonical at
  canonical-coherence register substantively) = schema migration per
  ADR-0025 register substantively (forward-substrate at ADR-0045
  register substantively)

## Alternatives Considered

### Option A: One large ADR-0041 for all 4 gaps + weighting + AI_AGENT routing

Rejected per Founder Q-A LOCKED Option B. Single 600+ line ADR would
imbalance depth per gap canonical at canonical-coherence register
substantively; each gap warrants its own substrate-architectural
decision at canonical-prose register substantively per ADR-0040
precedent register substantively.

### Option C: Gap-by-gap ADRs without umbrella

Rejected per Founder Q-A LOCKED Option B. No canonical coherence
anchor for sub-arc 2 substrate at canonical-architectural register
substantively; sub-phase decomposition unclear at canonical-prose
register substantively without umbrella ADR.

### Option D: Track A Gate 8g security FIRST, then capsule layer

Rejected per Founder explicit lane selection at
`[BEAM-CAPSULE-LAYER-QLOCK]` register substantively (Founder chose
patent-implementation substrate next; Track A Gate 8g remains
PROTECTED-PRIORITY forward-priority maintenance canonical at canonical-
state register substantively).

### Algorithm alternatives for Gap 3 (pgvector index strategy):

- IVFFlat = bulk-load preference (rejected per Q-E HNSW lock; NIOV is
  active-write phase canonical at canonical-state register
  substantively)

### Embedding model alternatives for Gap 3:

- text-embedding-3-large at 3072 dims (deferred to ADR-0043 forward-
  substrate as premium tier; not selected as default per Q-F LOCK)
- Cohere embed-multilingual + open-source alternatives (deferred to
  ADR-0043 provider abstraction forward-substrate per ADR-0018
  deployment-target-agnosticism canonical)

### Decay execution alternatives for Gap 4:

- Scheduled recompute via Oban / Quantum / cron (deferred to ADR-0044
  forward-substrate decision per Q-H lazy-at-read LOCK; scheduler
  dependency canonical at canonical-coherence register substantively
  NOT introduced at CL.1)

### Staleness substrate alternatives for Gap 5:

- Feedback-loop staleness extension at canonical-state register
  substantively (rejected per Q-I LOCK distinct-from-feedback-loop
  discipline canonical at canonical-coherence register substantively)

## References

- RULE 0 (Humans Always Sovereign; human/founder authority and safety
  baseline canonical at canonical-rule register substantively per
  CLAUDE.md L134 register substantively; explicit at every Sub-arc 2
  substrate-architectural decision per
  `[BEAM-CAPSULE-LAYER-ADR-RULE0-PATCH]` register substantively)
- RULE 11 (Elixir/BEAM iteration-loop research canonical at canonical-
  rule register substantively)
- RULE 13 (substrate-honest pre-flight surface canonical at canonical-
  rule register substantively; informed CL.0 + CL.1 paste-authoring
  discipline canonical at canonical-honest register substantively)
- RULE 20 (Founder authorization canonical at canonical-rule register
  substantively; explicit at this ADR's creation per
  `[BEAM-CAPSULE-LAYER-QLOCK]` + `[BEAM-CAPSULE-LAYER-ADR-RULE0-PATCH]`
  + `[BEAM-CAPSULE-LAYER-ADR-CL1-SCOPE-PATCH]` register substantively)
- RULE 21 (pre-authorization research arc canonical at canonical-rule
  register substantively per `67f6112` commit substantively; CL.0
  research arc embedded at §Context register substantively per RULE 21
  + `67f6112` precedent register substantively)
- ADR-0011 §Amendment (canonical precedent reserved at canonical-prose
  register substantively for in-place §Sub-decision body amendments;
  ADR-0041 distinct from amendment per Founder Q-A LOCKED Option B
  umbrella)
- ADR-0020 (two-register IP discipline canonical at canonical-
  architectural register substantively; cryptographically-timestamped
  commit lineage)
- ADR-0022 combined_score formula canonical (0.45/0.35/0.20
  coefficients per relevance/recency/feedback; anchor for weighting
  architecture per Entry #28 per Sub-decision 7)
- ADR-0025 Schema-Push-Target Discipline (Prisma migration discipline
  canonical at canonical-rule register substantively; per-gap forward-
  substrate at ADR-0042 Prisma enum + ADR-0043 pgvector field +
  ADR-0045 last_verified field register substantively)
- ADR-0026 §5 6 BEAM-compatibility patterns (preserved by construction;
  Pattern 6 pure transformation = canonical at canonical-coherence
  register substantively per CL.0 substrate-architectural
  recommendations)
- ADR-0028 §3 BEAM Coordination Layer + §Forward Queue (cross-citation
  preserved at canonical-coherence register substantively; ADR-0028
  UNCHANGED at CL.1 per Step 6 substrate-state disposition canonical
  at canonical-honest register substantively)
- ADR-0033 cross-language data ownership (EntityType vs WalletType
  canonical at canonical-knowledge register substantively; AI_AGENT
  discriminator canonical per Sub-decision 6; canonical_record/1
  14-field byte-equivalent anchor for Gap 1 mutation discrimination
  per Sub-decision 2)
- ADR-0034 BEAM testability discipline (name-configurable substrate;
  pure function trivially testable canonical at canonical-coherence
  register substantively per Sub-decision 8)
- ADR-0035 substrate-build discipline (26th observation
  D-SUPERVISION-TREE-EXPANSION-TEST-COHERENCE-DRIFT + 27th observation
  D-PASTE-AUTHORING-FAILED-TO-GREP-CANONICAL-STATE-BEFORE-PREMISE-LOCK
  + 28th observation D-PASTE-AUTHORIZATION-FAILED-TO-GREP-DISPATCH-
  HELPER-ARG-ORDER; all informed CL.1 paste-authoring discipline
  canonical at canonical-honest register substantively)
- ADR-0038 §Sub-decision 3 (WalletType 3-tier dispatch; AI_AGENT NOT
  WalletType discrimination canonical at substrate-state register
  substantively per Sub-decision 6)
- ADR-0039 §Sub-decision 7 + Sub-decision 8 + Amendment 1 (EntityType
  discriminator precedent + AI_AGENT routing distinction canonical
  per Sub-decision 6)
- ADR-0040 DEVICE Cold-Shard Substrate (sub-arc 1 sub-phase d closure
  register substantively per `3eaad71` commit substantively; sub-arc
  2 follows sub-arc 1 closure at canonical-coherence register
  substantively)
- arXiv:1406.2294 Lamping-Veach Jump Hash (precedent for in-tree
  pure-function substrate canonical at canonical-knowledge register
  substantively per ADR-0040 §Sub-decision 1 register substantively)
- hexdocs.pm/elixir/Bitwise.html Elixir Bitwise canonical (precedent
  for canonical-knowledge register research at canonical-coherence
  register substantively)
- pgvector + OpenAI text-embedding-3 + Mem0 decay + Atlan freshness
  sources canonical at canonical-knowledge register substantively per
  CL.0 §Context register substantively
- Entry #28 weighting architecture canonical at operator memory entry
  register substantively (forward-substrate per Sub-decision 7)

## Bidirectional Citation

- Cites: RULE 0 + RULE 11 + RULE 13 + RULE 20 + RULE 21 + ADR-0011 +
  ADR-0020 + ADR-0022 + ADR-0025 + ADR-0026 §5 + ADR-0028 §3 +
  ADR-0033 + ADR-0034 + ADR-0035 + ADR-0038 + ADR-0039 + ADR-0040 +
  arXiv:1406.2294 + Elixir Bitwise hexdocs + pgvector + OpenAI text-
  embedding-3 + Mem0 + Atlan freshness sources

- Cited by: ADR-0042 + ADR-0043 + ADR-0044 + ADR-0045 (+ optional
  ADR-0046) per-gap forward-substrate ADRs canonical at canonical-
  prose register substantively per Sub-decision 1 + Sub-decision 7
  4-gap decomposition register substantively. section-12-progress.md
  sub-arc 2 row IN FLIGHT canonical at canonical-state register
  substantively at this commit register substantively; sub-arc 2 row
  CLOSED at Sub-arc 2 closure cascade register substantively.
  CURRENT_BUILD_STATE.md sub-arc 2 H2 section canonical at canonical-
  state register substantively at this commit register substantively;
  H2 section updated to CLOSED at Sub-arc 2 closure cascade register
  substantively.
