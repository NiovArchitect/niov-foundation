# ADR-0045: Capsule-Level Staleness Detection (Sub-arc 2 Gap 5)

## Status

Proposed 2026-05-18

## Context

Phase 3 (Dynamic Memory Accuracy at Scale) Sub-arc 2 Gap 5
canonicalized at substrate-architectural register substantively per
ADR-0041 §Sub-decision 5 (Capsule-Level Staleness Detection per
ADR-0045). G5.1 `[BEAM-CAPSULE-STALENESS-ADR]` is the canonical first
sub-phase per Founder Q-G5-α α-1 LOCK at
`[BEAM-CAPSULE-STALENESS-G5-QLOCK]` register substantively.

This ADR canonicalizes the **capsule-level staleness detection model**
at substrate-architectural register substantively for the
`MemoryCapsule` layer. Gap 5 is **GREENFIELD at capsule register
substantively** per ADR-0041 §Sub-decision 5 Q-I LOCK — existing
feedback-loop staleness substrate at `feedback.service.ts` is
operational/loop-health staleness at the FeedbackLoopHealth row
register and **MUST NOT be conflated** with capsule semantic/
currentness validity at the MemoryCapsule row register per RULE 13
substrate-honest discipline.

### Research arc (RULE 21 pre-authorization research at canonical-knowledge register substantively)

Per RULE 21 substantive register pre-authorization research arc at
canonical-knowledge register substantively, 5 research streams
canonical at canonical-knowledge register substantively informed
this ADR's substrate-architectural decisions. All claims grounded in
public sources retrieved 2026-05-18 per RULE 21 substantive register.

**RS-G5-1 — Memory systems and stale memory handling**:

- STALE benchmark (arXiv:2605.06527) — formal taxonomy of memory
  staleness in LLM agents; Implicit Conflict failure mode (later
  observation invalidates earlier memory without explicit negation);
  Type I co-referential invalidation vs Type II propagated
  invalidation across structurally dependent attributes; 400 expert-
  validated conflict scenarios; 1,200 evaluation queries across three
  probing dimensions; contexts up to 150K tokens
- Mem0 State of AI Agent Memory 2026 — memory staleness is
  "unresolved in most frameworks"; `custom_update_memory_prompt`
  instructs LLM to choose ADD / UPDATE / DELETE / NONE actions when
  reconciling new facts with existing memory (analog to NIOV
  ADR-0042 mutation discrimination ADD/UPDATE/MERGE/NOOP); **decay
  handles low-relevance memories; staleness in high-relevance
  memories is a harder, open problem**
- MemPalace (2026) — implements **validity windows** for facts with
  **invalidation marking end-dates without deletion**; non-destructive
  pattern aligns with RULE 0 + RULE 10
- Memory Worth (MW) two-counter primitive — per-memory signal tracks
  memory co-occurrence with successful vs failed outcomes;
  lightweight foundation for staleness detection / retrieval
  suppression / deprecation decisions

**RS-G5-2 — RAG freshness / temporal validity**:

- arXiv:2509.19376 ("Solving Freshness in RAG: A Simple Recency Prior
  and the Limits of Heuristic Trend Detection") — simple recency
  prior achieves 1.00 on freshness tasks; Temporal-aware Matryoshka
  Representation Learning (TMRL) augments text embeddings with
  Matryoshka structure where certain dimensions encode temporal cues
  while others encode general semantics
- RisingWave RAG Architecture 2026 — **stale retrieval rate** =
  fraction of retrievals returning a document whose embedding was
  computed BEFORE its most recent update; **staleness gap** = time
  between document change and vector index reflection (nightly batch
  = up to 24h staleness gap; hourly batch = up to 60min)
- Continuous-ETL RAG Freshness Measurement (ResearchGate) — formal
  accuracy degradation as temporal lag increases between source
  data updates and index regeneration

**RS-G5-3 — Knowledge base staleness / data quality (Atlan
canonical framework)**:

Atlan LLM Knowledge Base Freshness Scoring framework canonicalizes
**4 canonical staleness dimensions**:

1. **Content age** — when the source was last updated
2. **Embedding lag** — delay between document update and re-indexing
3. **Stale retrieval rate** — fraction of queries returning outdated
   documents
4. **Coverage drift** — share of the corpus past its staleness
   threshold

**3-layer monitoring architecture** canonical at Atlan:

1. Retrieval logging — capture embedding timestamps at query time
2. Corpus scanning — scheduled checks of document staleness across
   the full index
3. Source-system monitoring — detect upstream changes before they
   propagate to retrieval

**Context drift signals** canonical at Atlan: schema version
staleness + glossary age + lineage gaps + ownership freshness

**RS-G5-4 — Embedding lag / stale embeddings**:

- DeDrift (arXiv:2308.02752) — robust similarity search under
  content drift
- Self-Aware Vector Embeddings for RAG (arXiv:2604.20598) —
  evaluation protocol targeting versioned-query accuracy + stale-
  answer rate + update latency + indexing cost; addresses failure
  modes like stale/version-invalid context
- Multi-Probe Zero Collision Hash MPZCH (arXiv:2602.17050) — retires
  obsolete IDs + resets reassigned slots to prevent stale embedding
  inheritance
- Encord 2026 Complete Guide to Embeddings — monitoring + iteration
  patterns for detecting drift + refreshing embeddings when models
  or data change

**RS-G5-5 — Safety and governance**:

- "When to Forget: A Memory Governance Primitive" (arXiv:2604.12007)
  — memory governance primitives for safe deprecation
- Acuvity Memory Governance — transparency cornerstone: "all memory
  operations (writes, reads, deletions) logged and observable by
  design"
- LinkedIn Cognitive Memory Agent (InfoQ 2026) — incorporates
  **human validation into the workflow** ensuring AI-generated
  outputs augmented by persistent memory remain aligned with user
  intent (RULE 0 alignment)
- Memory infrastructure pattern observed across research: complete
  memory infrastructure includes graph DB + vector store + event
  log + rules engine + **governance layer for approval / retention /
  access / invalidation** — separates detection (signals) from
  action (deletion/suppression)

## Governing RULES

This ADR governs the capsule-level staleness detection model at
substrate-architectural register substantively under:

- **RULE 0** — Humans Always Sovereign. Staleness detection MUST
  preserve the cryptographic governance boundary. No automatic
  deletion. No silent memory destruction. No autonomy erosion. Stale
  marking and stale-aware ranking pressure and stale-aware context
  filtering are non-destructive operations only. Explicit recall
  remains possible. FOUNDATIONAL / critical memory policy preserved.
- **RULE 11** — Prisma/Ecto cross-language ownership boundary
  preserved. TypeScript owns capsule-level staleness semantics at
  Foundation production-readiness register per Q-G5-κ κ-1 LOCK.
  BEAM observes only at G5.1; no Elixir-side staleness computation;
  no scheduler dependency; no Oban/Quantum hex-dep. Per ADR-0033
  §Decision 7 + Q-5BII-EXEC-5 cross-language data ownership
  boundary; staleness fields owned by Prisma DDL if introduced at
  G5.2/G5.3.
- **RULE 12** — Pre-flight grep substrate-state ground truth
  verified for schema.prisma + feedback.service.ts + coe.service.ts
  + read.service.ts + similarity.service.ts + write.service.ts +
  audit.ts + tests/** at G5.1 PRE-FLIGHT register substantively.
- **RULE 13** — Mandatory discrimination at substrate-architectural
  register substantively: existing feedback-loop staleness
  (`feedback.service.ts` Loop 7) MUST NOT be conflated with capsule-
  level staleness (this ADR). See §Substrate-State Observations
  §A. Operational/loop-health staleness exists separately and is
  preserved untouched at G5.1.
- **RULE 20** — Founder authorization required and granted at
  `[BEAM-CAPSULE-STALENESS-G5-QLOCK]` +
  `[BEAM-CAPSULE-STALENESS-G5.1-EXECUTE-VERIFY-AUTH]`.
- **RULE 21** — Current-source inspection + research arc embedded
  at §Context above (RS-G5-1 through RS-G5-5; 14+ public sources
  retrieved 2026-05-18).

## Decision

Canonicalize capsule-level staleness detection at substrate-
architectural register substantively as a **hybrid detection +
ranking + lifecycle metadata model with no automatic deletion** per
Founder Q-G5-β β-4 LOCK, scoped to **4 canonical staleness
dimensions** per Founder Q-G5-γ γ-5 LOCK + Atlan canonical 4-
dimension framework:

1. **Content age** — how long since `last_updated_at` AND/OR how
   long since `source_updated_at` (if upstream source tracked)
2. **Embedding lag** — whether `embedding` was generated against an
   older `content_hash` than the capsule's current `content_hash`
   (skew between embedding-time content fingerprint vs current
   content fingerprint)
3. **Coverage drift** — fraction of the wallet's / hive's / org's
   capsule corpus past its staleness threshold (corpus-level metric,
   not per-capsule)
4. **Semantic validity** — whether a later mutation / observation /
   correction has implicitly invalidated this capsule (per STALE
   benchmark Implicit Conflict + Mem0 reconciliation semantics)

G5.1 is **docs-only ADR-0045 NEW Proposed** per Founder Q-G5-α α-1
LOCK + Q-G5-δ δ-1 + δ-5 LOCK (no schema changes at G5.1; schema
disposition deferred to G5.2 substrate observation phase). No
audit literals at G5.1 per Q-G5-ε ε-4 LOCK. No code at G5.1 per
Q-G5-ζ ζ-5 LOCK. BEAM observer-only per Q-G5-κ κ-1 LOCK. Existing
tests only per Q-G5-λ λ-1 LOCK.

## Sub-decisions

### Sub-decision 1 — Q-G5-α α-1 LOCK: docs-only ADR-0045 first

G5.1 lands ADR-0045 NEW Proposed as docs-only architectural
canonicalization. No code / schema / test / audit-literal /
integration substrate at G5.1. Mirrors G1.1 + G3.1 + G4.1 + PR.1
canonical first-sub-phase pattern.

### Sub-decision 2 — Q-G5-β β-4 LOCK: hybrid detection + ranking + lifecycle, no deletion

Capsule-level staleness model is **hybrid 3-layer**:

- **Detection layer** — staleness signals computed and stored as
  metadata (e.g., `stale_score` / `stale_reason` / `stale_checked_at`
  / `embedding_content_hash` / `embedding_generated_at` / etc. —
  specific field set deferred to Q-G5-δ G5.2 substrate observation)
- **Ranking layer** — staleness signals influence COE / similarity
  retrieval ranking (lower priority for stale capsules; not exclusion)
- **Lifecycle layer** — capsule moves through observable lifecycle
  states (fresh / aging / stale / explicitly-revalidated) as
  non-destructive metadata

**No automatic deletion** at any layer per Q-G5-η RULE 0 governance
+ RULE 10 + ADR-0044 Q-G4-ζ no-auto-deletion inheritance. Stale
capsules are filtered/ranked/marked, NEVER deleted. Explicit recall
remains possible via direct capsule_id lookup bypassing staleness
filter.

### Sub-decision 3 — Q-G5-γ γ-5 LOCK: 4 canonical staleness dimensions

Capsule-level staleness canonicalized across 4 dimensions per Atlan
canonical 4-dimension framework + ADR-0041 §Sub-decision 5 explicit
enumeration:

1. **Content age** (per-capsule) — `last_updated_at` recency;
   optional `source_updated_at` if upstream source tracked. Maps to
   "content age" in Atlan framework. Time-based dimension.
2. **Embedding lag** (per-capsule) — gap between `content_hash` and
   `embedding_content_hash` (hypothetical G5.2 field; would track
   embedding-time content fingerprint to detect skew when content
   updates land without embedding regeneration). Maps to "embedding
   lag" in Atlan framework. Skew dimension. **Distinct from Gap 3
   embedding generation/retrieval per Q-G5-ι**.
3. **Coverage drift** (corpus-level) — fraction of wallet's / hive's
   / org's capsule corpus past its staleness threshold; aggregated
   metric NOT per-capsule. Maps to "coverage drift" in Atlan
   framework. Aggregate dimension.
4. **Semantic validity** (per-capsule + cross-capsule) — whether a
   later mutation / observation / correction has implicitly
   invalidated this capsule. Per STALE benchmark Implicit Conflict
   Type I (co-referential) + Type II (propagated) invalidation
   taxonomy. **Hardest dimension**; high-relevance staleness is
   "unresolved in most frameworks" per Mem0 2026.

### Sub-decision 4 — Q-G5-δ δ-1 + δ-5 LOCK: no schema changes at G5.1; defer schema disposition

No schema changes at G5.1. Schema field additions evaluated at G5.2
`[BEAM-CAPSULE-STALENESS-SUBSTRATE-OBSERVATION]` substrate observation
phase. Candidate field disposition at G5.2:

- `stale_score Float?` — composite staleness score (0.0 = fresh; 1.0
  = maximally stale)
- `stale_reason String?` — human-readable explanation per RULE 0
  ("stale status must be explainable")
- `stale_checked_at DateTime?` — when staleness signals were last
  computed
- `embedding_content_hash String?` — content_hash at embedding-
  generation time (detects embedding lag per RS-G5-4)
- `embedding_generated_at DateTime?` — when current embedding was
  generated (detects embedding age per Atlan embedding lag dimension)
- `source_updated_at DateTime?` — upstream source last-update
  timestamp (optional; for capsules with upstream source tracking)
- `validity_window_end DateTime?` — MemPalace-style explicit-
  invalidation end-date marker (no deletion)
- `staleness_lifecycle_state` enum — fresh / aging / stale /
  revalidated (lifecycle layer per Q-G5-β β-4)

G5.2 substrate observation determines which fields are required;
G5.3 conditional implementation adds them via Prisma migration
(Prisma owns shared-table DDL per ADR-0025 + ADR-0033 §Decision 7).
**No fields added at G5.1**.

### Sub-decision 5 — Q-G5-ε ε-4 LOCK: defer audit literals to G5.2/G5.3

No new audit literals at G5.1. Candidate audit literals at G5.2/G5.3:

- `CAPSULE_STALENESS_CHECKED` — staleness signals computed for a
  capsule (detection)
- `CAPSULE_STALENESS_MARKED` — capsule transitioned to stale
  lifecycle state (lifecycle transition)
- `CAPSULE_STALENESS_CLEARED` — capsule explicitly revalidated by
  user/entity (RULE 0 user authority preserved)

Audit literal additions at G5.2/G5.3 follow ADR-0042 §Q-γ.1 clean-
transition discipline + Founder authorization at the specific
commit. Mirrors Q-G4-η η-1 audit literal deferral pattern from
Gap 4.

### Sub-decision 6 — Q-G5-ζ ζ-5 LOCK: phased integration; no code at G5.1

Integration target disposition deferred to G5.2/G5.3. Integration
candidates at canonical-execution register substantively:

- **COE / context assembly** at `apps/api/src/services/coe/**` —
  staleness-aware ranking pressure; stale capsules deprioritized
  in retrieval ranking (NOT excluded)
- **SimilarityService** at
  `apps/api/src/services/cosmp/similarity.service.ts` — staleness-
  aware filter / ranking; **MUST preserve G3.9 J5-J8 privacy proofs
  per Q-G5-ι** (no vector / distance / raw query leakage)
- **read.service.ts** — staleness-aware metadata in read response
  (optional, scoped, reversible per RULE 0)
- **write.service.ts** — staleness signal updates on mutation (ADD/
  UPDATE/MERGE updates `stale_checked_at` + `embedding_content_hash`
  + `embedding_generated_at` if those fields land at G5.2/G5.3)

No code modifications at G5.1. G5.2 substrate observation determines
integration scope; G5.3 conditional implementation lands integration.

### Sub-decision 7 — Q-G5-η canonical RULE 0 governance

RULE 0 + RULE 10 governance discipline canonical at substrate-
architectural register substantively:

- **staleness never deletes** — no auto-deletion path; soft-delete
  via `deleted_at` is unrelated and remains explicit-action-only
- **stale status must be explainable** — `stale_reason` field
  candidate at G5.2; staleness signals MUST be inspectable by user/
  entity per Acuvity Memory Governance transparency cornerstone +
  RS-G5-5
- **explicit recall remains possible** — direct capsule_id lookup
  bypasses staleness filter; stale capsules remain accessible via
  explicit recall surface
- **FOUNDATIONAL / critical memory policy preserved** — FOUNDATIONAL
  capsules per ADR-0021 / ADR-0044 §Sub-decision 3 inheritance
  bypass staleness filtering (mirror Q-G4-ζ pattern)
- **stale context filtering must be scoped and reversible** —
  filtering is per-retrieval-call scope; `CAPSULE_STALENESS_CLEARED`
  audit literal candidate at G5.3 enables user-initiated
  revalidation
- **user/entity authority preserved** — user/entity may override
  any staleness mark via explicit revalidation per RULE 0 sovereignty

### Sub-decision 8 — Q-G5-θ canonical Gap 4 boundary

Gap 4 / Gap 5 boundary canonical at substrate-architectural register
substantively per ADR-0041 §Sub-decision 5:

- **Gap 4 (ADR-0044 Accepted 2026-05-18) = time/use-based ranking
  pressure** — decay_rate + relevance_score + recency_score +
  access_count + lazy-at-read forget-floor; per-capsule signals
  derived from time elapsed + read activity; FOUNDATIONAL bypass
  preserved
- **Gap 5 (this ADR) = semantic/currentness/validity detection** —
  content age + embedding lag + coverage drift + semantic validity;
  per-capsule signals derived from content/source/embedding/cross-
  capsule contradiction; Gap 4 decay continues to operate
  independently

**Do not collapse Gap 5 staleness into decay_score**. The
`combined_score` formula per ADR-0022 is FROZEN at G4.1 + G4.4
canonical-execution register substantively (tagOverlap·0.45 +
baseRelevance·0.35 + recency·0.20). Staleness integration at G5.3
(if implementation lands) MUST be an additional signal at the
ranking layer, NOT a modification to `combined_score` formula. Any
modification of `combined_score` coefficients requires separate
ADR-0022 amendment + Founder authorization.

### Sub-decision 9 — Q-G5-ι canonical Gap 3 boundary

Gap 3 / Gap 5 boundary canonical at substrate-architectural register
substantively:

- **Gap 3 (ADR-0043 Accepted 2026-05-18) = embedding generation /
  retrieval substrate** — pgvector + HNSW + text-embedding-3-small @
  1536 dims + SimilarityService at `similarity.service.ts` with
  G3.9 J5-J8 privacy proofs canonical at canonical-execution
  register substantively
- **Gap 5 (this ADR) = detecting embedding-content skew** — whether
  `embedding_content_hash` (hypothetical G5.2 field) matches
  capsule's current `content_hash`; gap between embedding-time
  content fingerprint vs current content fingerprint detects
  embedding lag per RS-G5-4 + Atlan canonical "embedding lag"
  dimension

**G3.9 J5-J8 privacy proofs preserved at all G5 register
substantively**:

- No vector content returned to users / AI_AGENT / external clients
  by default at any G5 surface
- No distance / cosine_distance / score values exposed at any G5
  surface
- No raw query text / truncated query / query_keywords logged in
  any G5 audit detail
- No embedding_sample / vector_hash / per-dimension stats exposed
  at any G5 surface
- **No vector / distance / raw query leakage in any G5 surface**

G5.3 conditional implementation (if it lands) MUST preserve these
proofs by construction. SimilarityService modifications at G5.3
(if needed) MUST extend the G3.6 SQL filter set with staleness-
aware filtering WITHOUT exposing vector/distance/query content.

### Sub-decision 10 — Q-G5-κ κ-1 LOCK: BEAM observer-only at G5.1

BEAM observer-only canonical at G5.1 register substantively. No
Elixir-side staleness computation. No scheduler dependency. No
Oban/Quantum hex-dep. Mirrors Q-G4-κ κ-1 LOCK from ADR-0044.

Per ADR-0033 §Decision 7 + Q-5BII-EXEC-5 cross-language data
ownership boundary canonical at substrate-architectural register
substantively:

- TypeScript owns capsule-level staleness semantics at Foundation
  production-readiness register substantively
- BEAM Translator round-trip preservation only — `CosmpRouter.Capsule
  .Translator` pack/unpack handles any G5.2/G5.3 staleness fields as
  opaque pass-through fields per ADR-0033 cross-language data
  ownership
- BEAM forward-substrate at G5.4+ may evolve to staleness
  coordinator role (Q-G5-κ κ-2 forward-substrate) but NOT at G5.1

### Sub-decision 11 — Q-G5-λ λ-1 LOCK: cite existing tests at G5.1

No new tests at G5.1 register substantively. Existing tests cited
at canonical-prose register substantively:

- `tests/unit/feedback.test.ts` — feedback-loop staleness tests
  (Loop 7); preserved untouched at G5.1; do not conflate with
  capsule-level staleness
- `tests/unit/coe.test.ts:121-129` + `:132-136` — ADR-0022
  `combined_score` anchor tests preserved per Q-G4-λ inheritance
- `tests/integration/similarity-search.test.ts` (G3.6 J5-J8) —
  G3.9 privacy proof tests preserved per Q-G5-ι

New tests at G5.3 conditional implementation if implementation
lands. New tests at G5.2 only if explicit Founder authorization
extends scope.

### Sub-decision 12 — Q-G5-μ LOCK: 4-phase G5 mini-arc decomposition

G5 mini-arc canonical at canonical-state register substantively per
Q-G5-μ LOCK mirroring Gap 4 4-phase canonical pattern:

- **G5.1** `[BEAM-CAPSULE-STALENESS-ADR]` — this commit; docs-only
  ADR-0045 NEW Proposed; 4 MOD + 1 NEW; RULE 21 research arc
  embedded; canonical staleness model + 4 dimensions + 12 sub-
  decisions
- **G5.2** `[BEAM-CAPSULE-STALENESS-SUBSTRATE-OBSERVATION]` — docs-
  only substrate observation phase; surface schema additions
  disposition (Q-G5-δ resolution) + audit literal disposition
  (Q-G5-ε resolution) + integration target disposition (Q-G5-ζ
  resolution); G5.3 SKIP-or-implement determination; forward-
  substrate
- **G5.3** `[BEAM-CAPSULE-STALENESS-IMPL]` — conditional substantive
  code if G5.2 proves implementation needed (Prisma migration +
  service-tier integration); OR formal SKIP record per G1.4 + G3.7
  + G4.3 canonical SKIP precedent; forward-substrate
- **G5.4** `[BEAM-CAPSULE-STALENESS-CLOSURE]` — docs-only closure
  cascade; ADR-0045 Status Proposed → Accepted; Gap 5 row Status
  IN FLIGHT → CLOSED; optional ADR-0035 §9 cluster decision; Sub-arc
  2 closure decision deferred to separate commit (UNLESS Founder
  elects to bundle Sub-arc 2 closure with G5.4 in same commit OR
  Founder elects optional Gap 6 / ADR-0046); forward-substrate

## Substrate-State Observations

Substrate-state observations surfaced at G5.1 PRE-FLIGHT register
substantively per RULE 12 + RULE 13 substrate-honest discipline.

### §A — Mandatory feedback-loop vs capsule-level staleness discrimination

**Critical RULE 13 surface canonical at substrate-architectural
register substantively**:

#### Existing feedback-loop staleness (operational/loop-health)

**Location**: `apps/api/src/services/feedback/feedback.service.ts`

- **Target**: `FeedbackLoopHealth` rows (representing **feedback
  loop runs**, NOT capsules)
- **Signal**: `last_run` recency vs configured cron cadence at
  `LOOP_EXPECTED_INTERVAL_MINUTES` (loop_1 = 1440min; loop_5 =
  10080min; etc.)
- **Mechanism**: `runLoop7Once()` at `feedback.service.ts:683` —
  reads all `FeedbackLoopHealth` rows; flags any whose `last_run`
  is older than `2x expected interval` as stale; emits
  `ADMIN_ACTION` audit event with `action: "FEEDBACK_LOOP_STALE"`
  + `stale_loops` array under `SYSTEM_PRINCIPALS.FEEDBACK_LOOP`
  system principal
- **Result shape**: `Loop7Result.stale_loops: string[]` at
  `feedback.service.ts:169`
- **Touch mechanism**: `touchLoopHealth(loop_id, status)` upserts
  `FeedbackLoopHealth` row with `last_run = new Date()` after each
  loop execution
- **Register**: operational/observability — answers "is our cron
  loop infrastructure healthy?"
- **Action**: operator alerting via `FEEDBACK_LOOP_STALE` audit
  event; NOT capsule retrieval suppression
- **Audit literal**: `FEEDBACK_LOOP_STALE` (emitted as `details
  .action`; under `ADMIN_ACTION` event_type; NOT a CAPSULE_*
  literal)

#### Gap 5 capsule-level staleness (semantic/currentness validity; THIS ADR)

- **Target**: `MemoryCapsule` rows (knowledge artifacts; NOT loop-
  run rows)
- **Signal**: content age + embedding lag + coverage drift +
  semantic validity (4 canonical dimensions per Atlan framework)
- **Mechanism**: deferred to G5.2 substrate observation + G5.3
  conditional implementation; candidate fields include
  `stale_score` / `stale_reason` / `stale_checked_at` /
  `embedding_content_hash` / `embedding_generated_at` /
  `source_updated_at` / `validity_window_end` /
  `staleness_lifecycle_state` (all GREENFIELD at G5.1)
- **Register**: capsule semantic/temporal validity — answers "is
  this capsule safe/current enough for context assembly?"
- **Action**: COE/similarity retrieval ranking pressure + scoped
  + reversible context filtering + non-destructive lifecycle
  marking; NOT operator alerting
- **Audit literals**: candidate `CAPSULE_STALENESS_CHECKED` +
  `CAPSULE_STALENESS_MARKED` + `CAPSULE_STALENESS_CLEARED` at
  G5.2/G5.3 (NOT at G5.1 per Q-G5-ε ε-4 LOCK)

**Why these two MUST NOT be conflated**:

1. Target divergence — `FeedbackLoopHealth` rows (loop runs) vs
   `MemoryCapsule` rows (knowledge artifacts)
2. Signal divergence — cron cadence recency vs content/embedding/
   source/validity dimensions
3. Action divergence — operator alerting vs context-assembly
   filtering
4. Register divergence — operational observability vs capsule
   semantic validity
5. Audit literal divergence — `FEEDBACK_LOOP_STALE` vs CAPSULE_*
   staleness literals
6. Mechanism divergence — cron-driven Loop 7 vs read-tier /
   write-tier / scheduled-tier staleness computation

Per ADR-0041 §Sub-decision 5 Q-I LOCK explicit "feedback-loop
staleness exists separately at `feedback.service.ts:169` substrate
and MUST NOT be conflated", Gap 5 substrate is GREENFIELD at capsule
register substantively. **`feedback.service.ts` substrate is
preserved untouched at G5.1**.

### §B — Schema substrate-state ground truth at HEAD `a05040f`

**Existing MemoryCapsule fields that could inform staleness** (per
RULE 12 PRE-FLIGHT grep):

- `content_hash String` (`schema.prisma:132`) — set by Gap 1 ADD/
  UPDATE/MERGE per ADR-0042; canonical-record byte-equivalent
  baseline; **CAN serve as embedding-skew baseline if
  `embedding_content_hash` is added at G5.2**
- `ai_access_blocked Boolean @default(false)` (`schema.prisma:133`)
  — RULE 0 boundary; SimilarityService filter per G3.6
- `requires_validation Boolean @default(false)` (`schema.prisma:139`)
  — D-2D-D10-4 validation gate flag (RAA 12.8 §5.2); when true, AI
  access withheld until human clears gate; **closest existing
  "validity" signal** but binary + manual-clear not capsule-tier
  staleness
- `last_accessed_at DateTime?` (`schema.prisma:163`) — bumped at
  `read.service.ts:772-788` per ADR-0044 G4.1; access tracking
- `last_updated_at DateTime @updatedAt` (`schema.prisma:164`) —
  auto-Prisma; **content age dimension primary input**
- `expires_at DateTime?` (`schema.prisma:165`) — **DORMANT** per
  Gap 4 G4.2 O-G4.1-1 (settable at create, immutable post-create,
  no enforcement); related but distinct from Gap 5 (TTL vs
  staleness)
- `relevance_score Float @default(1.0)` (`schema.prisma:107`) —
  ADR-0022 + ADR-0044 lazy-at-read decay
- `decay_type DecayType` (`schema.prisma:108`) — ADR-0044 (only
  FOUNDATIONAL has explicit behavior per O-G4.1-2)

**Greenfield substrate canonical at G5.1 PRE-FLIGHT register
substantively** (no current schema field):

- **NO** `stale_score` / `stale_reason` / `stale_checked_at` field
- **NO** `embedding_content_hash` field (embedding-skew detection
  greenfield per RS-G5-4)
- **NO** `embedding_generated_at` field (embedding age greenfield)
- **NO** `source_updated_at` / `observed_at` field
- **NO** `validity_window_end` field (MemPalace pattern greenfield)
- **NO** `coverage_drift` / `confidence_score` field (beyond
  `requires_validation`)
- **NO** `staleness_lifecycle_state` enum

### §C — Service substrate-state ground truth at HEAD `a05040f`

**No staleness signals at any service tier** (per RULE 12 PRE-FLIGHT
grep):

- `coe.service.ts` — only `validateSession()` (`:valid` field);
  `keywords.ts:71` recency-only comment per ADR-0022; **no
  capsule-level staleness signal**
- `read.service.ts` — only `validateSession()` + clearance +
  jurisdiction + TOCTOU; **no capsule-level staleness signal**
- `similarity.service.ts` G3.6 SQL filter set — `wallet_id +
  deleted_at + ai_access_blocked + requires_validation +
  clearance_required + embedding IS NOT NULL`; **no capsule-level
  staleness filter**
- `write.service.ts` — persists `content_hash` via Gap 1; **no
  `embedding_content_hash` comparison; no staleness signal update**

### §D — Audit literal substrate-state ground truth at HEAD `a05040f`

**Existing capsule-class audit literals** (per
`packages/database/src/queries/audit.ts`):

- `CAPSULE_CREATED` / `CAPSULE_METADATA_READ` / `CAPSULE_CONTENT_READ`
  / `CAPSULE_UPDATED` / `CAPSULE_DELETED` (5 literals; foundational)
- `CAPSULE_MUTATION_ADD` / `CAPSULE_MUTATION_UPDATE` /
  `CAPSULE_MUTATION_MERGE` / `CAPSULE_MUTATION_NOOP` (4 literals;
  Gap 1 / ADR-0042)
- `CAPSULE_SIMILARITY_SEARCH` (1 literal; Gap 3 / ADR-0043)

**Greenfield capsule-class staleness audit literals** (no current
literal):

- **NO** `CAPSULE_STALENESS_CHECKED` literal
- **NO** `CAPSULE_STALENESS_MARKED` literal
- **NO** `CAPSULE_STALENESS_CLEARED` literal

All staleness audit literal additions deferred to G5.2/G5.3 per
Q-G5-ε ε-4 LOCK. ADR-0042 §Q-γ.1 clean-transition discipline
inherited if/when staleness literals land at G5.2/G5.3.

### §E — Test substrate-state ground truth at HEAD `a05040f`

**No tests at capsule-level staleness register** (greenfield):

- `tests/unit/feedback.test.ts` — Loop 7 feedback-loop staleness
  tests (operational/loop-health; NOT capsule-level staleness;
  preserved untouched at G5.1)
- No `tests/unit/coe.test.ts` capsule-level staleness tests
- No `tests/unit/cosmp/staleness.test.ts` greenfield
- No `tests/integration/staleness-*.test.ts` greenfield

New capsule-level staleness tests at G5.3 conditional implementation
if implementation lands.

## Consequences

### Positive

- Capsule-level staleness model canonicalized at substrate-
  architectural register substantively per ADR-0041 §Sub-decision 5
  expected closure path
- 4 canonical staleness dimensions (content age + embedding lag +
  coverage drift + semantic validity) aligned with Atlan canonical
  framework + STALE benchmark Implicit Conflict + Mem0 ADD/UPDATE/
  DELETE/NONE reconciliation
- Mandatory feedback-loop vs capsule-level staleness discrimination
  canonical at substrate-architectural register substantively per
  RULE 13 substrate-honest discipline
- RULE 0 no-auto-deletion + RULE 10 soft-delete-only + explicit-
  recall + FOUNDATIONAL bypass + user/entity authority preservation
  canonical at substrate-architectural register substantively
- Gap 3 / Gap 5 boundary canonical (embedding-content skew vs
  embedding generation/retrieval); G3.9 J5-J8 privacy proofs
  preserved by construction at all G5 surfaces
- Gap 4 / Gap 5 boundary canonical (semantic/currentness validity
  vs time/use-based ranking pressure); ADR-0022 `combined_score`
  formula FROZEN
- BEAM observer-only at G5.1 preserves Prisma/Ecto cross-language
  ownership boundary per RULE 11 + ADR-0033 §Decision 7
- Forward-substrate at G5.2/G5.3 enables Founder-authorized schema
  + audit + integration disposition at substrate observation phase

### Negative

- Greenfield substrate at capsule register substantively requires
  G5.2/G5.3 implementation work if Founder elects substantive G5.3
  (vs SKIP)
- Semantic validity dimension (4th) is "unresolved in most
  frameworks" per Mem0 2026 — high-relevance staleness is open
  problem; G5.3 implementation may surface partial coverage with
  forward-substrate reservation
- Coverage drift dimension is corpus-level metric requiring
  aggregation infrastructure not yet present in Foundation; G5.3
  may scope down to per-capsule dimensions only at first
  implementation

### Neutral

- ADR-0035 §9 cluster expansion deferred to G5.4 closure cascade
  per Q-G5-δ + Q-G4.3-δ δ-3 inheritance pattern
- Sub-arc 2 closure cascade forward-substrate after G5.4 (or after
  optional Gap 6 / ADR-0046 if Founder elects) per ADR-0041 CL.1
  scope patch

## Alternatives Considered

### β-1 Detection-only metadata model — DEFERRED

A minimum-viable staleness model would surface detection signals
(stale_score + stale_reason + stale_checked_at) at metadata register
WITHOUT ranking or lifecycle layers. Simpler scope; matches MemPalace
validity-window pattern. **DEFERRED** in favor of β-4 hybrid model
because ranking + lifecycle layers are required for the staleness
signals to influence retrieval / context assembly per Atlan 4-
dimension framework. Future Founder-authorized ADR amendment may
scope back to β-1 if substantive implementation proves β-4 surface
too large.

### β-2 Ranking-pressure-only model — DEFERRED

A ranking-only staleness model would influence COE / similarity
retrieval ranking WITHOUT explicit metadata exposure or lifecycle
state. Simpler audit surface (no `CAPSULE_STALENESS_MARKED` literal
needed). **DEFERRED** because users/entities cannot inspect or
understand why a capsule was demoted in retrieval without explicit
metadata + lifecycle visibility per Acuvity Memory Governance
transparency cornerstone + RULE 0 "stale status must be
explainable".

### β-3 Lifecycle-state-only model — DEFERRED

A lifecycle-only model would expose enum state transitions (fresh
→ aging → stale → revalidated) WITHOUT detection signals or ranking
pressure. **DEFERRED** because lifecycle transitions require
underlying detection signals to trigger; lifecycle-only would
require manual user/entity transitions only.

### Automatic deletion of stale capsules — REJECTED

Automatic deletion violates RULE 0 sovereignty + RULE 10 soft-
delete-only discipline + ADR-0044 Q-G4-ζ no-auto-deletion
inheritance. Staleness signals MAY influence ranking and filtering
but MUST NOT trigger deletion. MemPalace validity-window pattern
(end-date marking without deletion) is the canonical non-destructive
analog.

### γ-1 Content age only — REJECTED (too narrow)

Content age alone misses embedding lag (RS-G5-4 critical for RAG
freshness) + coverage drift (RS-G5-3 corpus-level metric) + semantic
validity (STALE benchmark Implicit Conflict). Single-dimension
staleness model is insufficient.

### γ-4 Semantic validity only — REJECTED (too narrow + unresolved)

Semantic validity alone is the hardest dimension (Mem0 2026
"unresolved in most frameworks") and would not address content age
+ embedding lag + coverage drift dimensions that have more mature
detection patterns.

### κ-3 Elixir staleness computation now — REJECTED at G5.1

Elixir-side staleness computation now would violate Q-G5-κ κ-1 LOCK
+ ADR-0033 §Decision 7 cross-language data ownership boundary
(TypeScript owns capsule-level staleness semantics at G5.1; BEAM
forward-substrate at G5.4+). Future Founder-authorized ADR amendment
may evolve BEAM to staleness coordinator role.

### α-3 Defer Gap 5 entirely — REJECTED

Deferring Gap 5 entirely would leave Sub-arc 2 incomplete per
ADR-0041 §Sub-decision 5 canonical next-Gap ordering. Gap 5 ADR-0045
NEW Proposed at G5.1 is the canonical ADR-0041 closure path. Gap 5
implementation scope (G5.2/G5.3) may evolve substantively; ADR-tier
canonicalization at G5.1 is foundational.

## References

### Foundation RULES

- RULE 0 — Humans Always Sovereign (no auto-deletion preserved)
- RULE 10 — Soft-delete-only discipline
- RULE 11 — Prisma/Ecto cross-language ownership boundary
- RULE 12 — Pre-flight grep substrate-state ground truth
- RULE 13 — Substrate-honest discipline; mandatory discrimination
- RULE 20 — Founder authorization required
- RULE 21 — Current-source research arc canonical

### Foundation ADRs

- ADR-0002 — append-only audit chain (canonical-record byte-
  equivalence; baseline for any G5.2/G5.3 audit literal additions)
- ADR-0011 §Amendment — strict 12-error baseline (preserved at G5.1)
- ADR-0015 — CI Workflow Architecture (preserved at G5.1)
- ADR-0018 — Deployment-Target Agnosticism Posture (G5.3
  implementation must remain agnostic if it lands)
- ADR-0020 — Two-Register IP Discipline (G5.1 Register 2
  business/canonical surface; patent-implementation evidence
  lineage)
- ADR-0021 — Capsule Type Extension Protocol (FOUNDATIONAL bypass
  inheritance at Q-G5-η governance)
- ADR-0022 — combined_score formula canonicalization (FROZEN;
  no amendment at G5.1; staleness integration at G5.3 must be
  additional signal NOT formula modification)
- ADR-0025 — Schema-Push-Target Discipline (Prisma migration
  discipline for G5.2/G5.3 if schema changes land)
- ADR-0026 §5 — BEAM-compatibility patterns (preserved at G5.1)
- ADR-0027 — Governance + Rule-Modification Authority (RULE 20
  inheritance)
- ADR-0033 §Decision 7 + Q-5BII-EXEC-5 — cross-language data
  ownership boundary (Prisma owns shared-table DDL; Ecto owns
  Elixir-internal DDL; BEAM Translator round-trip preservation)
- ADR-0034 — BEAM testability discipline (G5.3 implementation
  testing if it lands)
- ADR-0035 — Substrate-build discipline canonical (no modification
  at G5.1; deferred to G5.4 closure)
- ADR-0041 §Sub-decision 5 — Gap 5 forward-substrate reservation
  closed by this ADR (Q-G5-α α-1 LOCK is the closure path)
- ADR-0042 §Q-γ.1 — clean-transition audit literal expansion
  discipline (forward-citation for G5.2/G5.3 audit literal
  additions)
- ADR-0043 — Gap 3 pgvector Embedding closure parent (G3.9 J5-J8
  privacy proofs preserved at all G5 surfaces per Q-G5-ι)
- ADR-0044 — Gap 4 Decay Execution Formalization closure parent
  (Gap 4 / Gap 5 boundary canonical per Q-G5-θ)
- ADR-0047 — Post-Gap-3 Production-Readiness Hardening (closure
  parent; production-readiness baselines preserved at G5.1)
- Patent US 12,517,919 — COSMP claims; capsule layer is patent-
  implementation core
- Patent US 12,164,537 + US 12,399,904 — DMW + Foundation
  primitives

### Research arc sources (RS-G5-1 through RS-G5-5; embedded at §Context register substantively per RULE 21)

- arXiv:2605.06527 — STALE: Can LLM Agents Know When Their
  Memories Are No Longer Valid? (STALE benchmark; Implicit Conflict;
  Type I / Type II invalidation taxonomy)
- mem0.ai/blog/state-of-ai-agent-memory-2026 — State of AI Agent
  Memory 2026 (Mem0 memory staleness unresolved analysis; ADD/
  UPDATE/DELETE/NONE reconciliation)
- mem0.ai docs cookbook memory expiration — MemPalace validity-
  window pattern (non-destructive invalidation)
- arXiv:2509.19376 — Solving Freshness in RAG (simple recency
  prior; TMRL; cited at ADR-0044 RS-4)
- risingwave.com/blog/rag-architecture-2026 — RAG Architecture
  2026 (stale retrieval rate; staleness gap)
- atlan.com/know/llm-knowledge-base-freshness-scoring — Atlan LLM
  Knowledge Base Freshness Scoring (4 canonical dimensions; 3-layer
  monitoring)
- atlan.com/know/context-drift-detection — Atlan Context Drift
  Detection (schema version + glossary + lineage + ownership signals)
- arXiv:2308.02752 — DeDrift: Robust Similarity Search under
  Content Drift
- arXiv:2604.20598 — Self-Aware Vector Embeddings for RAG (versioned
  query accuracy; stale-answer rate)
- arXiv:2602.17050 — Multi-Probe Zero Collision Hash MPZCH (stale
  embedding inheritance prevention)
- arXiv:2604.12007 — When to Forget: A Memory Governance Primitive
- acuvity.ai/what-is-memory-governance-why-important-for-ai-security
  — Memory Governance (transparency cornerstone)
- infoq.com/news/2026/04/linkedin-cognitive-memory-agent — LinkedIn
  Cognitive Memory Agent (human-validation hybrid pattern)

## Founder Authorization

Founder authorization explicit at G5.1 substantive landing per RULE
20 at:

- `[BEAM-CAPSULE-STALENESS-G5-QLOCK]`
- `[BEAM-CAPSULE-STALENESS-G5.1-EXECUTE-VERIFY-AUTH]`

## Implementation Lineage (forward-substrate G5.1-G5.4)

| Sub-phase | Tag | Authorized scope | Status |
|-----------|-----|------------------|--------|
| G5.1 | `[BEAM-CAPSULE-STALENESS-ADR]` | 4 MOD + 1 NEW docs-only ADR-0045 NEW Proposed; RULE 21 research arc embedded (RS-G5-1 through RS-G5-5); canonical 4-dimension staleness model (content age + embedding lag + coverage drift + semantic validity); 12 sub-decisions canonical; mandatory feedback-loop vs capsule-level discrimination canonical | this commit |
| G5.2 | `[BEAM-CAPSULE-STALENESS-SUBSTRATE-OBSERVATION]` | Docs-only substrate observation phase; surface schema additions disposition (Q-G5-δ G5.2 resolution) + audit literal disposition (Q-G5-ε G5.2 resolution) + integration target disposition (Q-G5-ζ G5.2 resolution); G5.3 SKIP-or-implement determination | forward-substrate |
| G5.3 | `[BEAM-CAPSULE-STALENESS-IMPL]` | Conditional substantive code if G5.2 proves implementation needed (Prisma migration + service-tier integration); OR formal SKIP record per G1.4 + G3.7 + G4.3 canonical SKIP precedent | forward-substrate |
| G5.4 | `[BEAM-CAPSULE-STALENESS-CLOSURE]` | Docs-only closure cascade; ADR-0045 Status Proposed → Accepted; Gap 5 row Status IN FLIGHT → CLOSED; optional ADR-0035 §9 cluster expansion if Founder authorizes; Sub-arc 2 closure decision deferred to separate commit OR bundled per Founder authorization | forward-substrate |

Status flips from `Proposed 2026-05-18` to `Accepted 2026-05-1X` at
G5.4 closure cascade canonical at canonical-state register
substantively per Q-G5-μ LOCK.

**Sub-arc 2 status field remains IN FLIGHT throughout G5.1-G5.4**
per Q-G5-μ + ADR-0041 CL.1 scope patch. Sub-arc 2 closure cascade
forward-substrate pending G5.4 + optional Gap 6 (ADR-0046 reserved)
+ later Sub-arc 2 closure cascade per ADR-0041 CL.1 scope patch
register substantively.
