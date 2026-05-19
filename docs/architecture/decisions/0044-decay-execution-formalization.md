# ADR-0044 — Decay Execution Formalization (Gap 4)

## Status

Proposed 2026-05-18

G4.1 docs-only ADR creation per Founder Q-G4-α α-1 LOCK at
`[BEAM-CAPSULE-DECAY-G4-QLOCK]`. Status flips to Accepted at G4.4
closure cascade per Q-G4-μ μ-2 LOCK 4-phase mini-arc decomposition.
G4.1 LOCKS architectural canonicalization of existing lazy-at-read
decay substrate; G4.2 substrate-observation phase resolves
`expires_at` TTL + DecayType enum semantics disposition; G4.3
conditional implementation phase (SKIP by default); G4.4 docs-only
closure cascade.

## Context

Sub-arc 2 Gap 4 (Decay Execution Formalization) is PARTIAL canonical
at canonical-state register substantively per ADR-0041 §Sub-decision 4.
Existing lazy-at-read substrate canonical at canonical-execution
register substantively at multiple sites at HEAD `e60122c`:

- `apps/api/src/services/coe/coe.service.ts:44` —
  `RELEVANCE_FORGET_FLOOR = 0.2` exported constant (intentional-
  forgetting threshold per ADR-0022 §References)
- `apps/api/src/services/coe/coe.service.ts:235-238` — Filter 2
  forget-floor gate (FOUNDATIONAL bypass + relevance_score ≥ 0.2 keep;
  else filtered to `capsules_skipped_low_relevance` metric)
- `apps/api/src/services/coe/coe.service.ts:524-545` — Loop 1 hook
  `feedbackHook.onRecordOutcome` fire-and-await with logged-not-failed
  semantics
- `apps/api/src/services/feedback/feedback.service.ts:91-104` —
  canonical decay constants: `RELEVANCE_USED_BUMP = 0.05`,
  `RELEVANCE_UNUSED_DECAY = 0.02`, `RELEVANCE_MIN = 0.0`,
  `RELEVANCE_MAX = 1.0`, `RELEVANCE_CORRECTION_BUMP = RELEVANCE_MAX`
  (per ADR-0022 §Amendment 1)
- `apps/api/src/services/cosmp/read.service.ts:328-335` — raw SQL
  `UPDATE memory_capsules SET last_accessed_at = NOW()` after each
  read
- `apps/api/src/services/cosmp/read.service.ts:772-788` — async
  `access_count` increment AFTER response per spec "AFTER response
  (async): increment access_count"
- `apps/api/src/services/cosmp/write.service.ts:60-61, 635-637,
  661-662` — `decay_type` / `decay_rate` persistence at create-time
  (default `TIME_BASED` unless FOUNDATIONAL)
- `apps/api/src/services/coe/keywords.ts:74-92` — `recencyScore` +
  `combinedScore` formula canonical at ADR-0022 (`0.45 + 0.35 + 0.20`
  coefficient lock + 7-day plateau + 90-day floor)

Prisma `MemoryCapsule` schema fields (no schema change required at
G4.1 per Q-G4-δ δ-1 LOCK):

- `relevance_score` Float @default(1.0)
- `decay_type` DecayType (5 values: FOUNDATIONAL / TIME_BASED /
  ACCESS_BASED / PERMANENT / SESSION_ONLY)
- `decay_rate` Float @default(0.01)
- `commitment_date` DateTime?
- `access_count` Int @default(0)
- `last_accessed_at` DateTime?
- `last_updated_at` DateTime @updatedAt
- `expires_at` DateTime?
- `@@index([decay_type])`

BEAM/COSMP coordination at `apps/cosmp_router/lib/cosmp_router/
capsule/translator.ex` round-trips `decay_type` / `decay_rate` /
`relevance_score` across the Translator pack/unpack boundary per
ADR-0033 §Decision 7 + Q-5BII-EXEC-5 cross-language data ownership
discipline. No Elixir-side decay computation at HEAD `e60122c`.

### Research arc (RULE 21 pre-authorization research at canonical-knowledge register substantively)

**RS-1 Mem0 + AI memory framework precedents** (cited at canonical-
knowledge register substantively per Founder Q-G4-QLOCK research
requirement). Mem0's April 2026 algorithm canonicalizes memory decay
at search-time ranking ONLY (not stored): fresh-access boost up to
1.5× + stale-dampening to 0.3× = 5× spread between fresh and stale.
Hybrid retrieval combines semantic similarity + BM25 + entity matching
scored in parallel and fused. Single-pass ADD-only extraction (no
UPDATE/DELETE in their model) contrasts with NIOV's explicit
MUTATION matrix per ADR-0042 (ADD/UPDATE/MERGE/NOOP discrimination).
Architectural implication: Mem0's ranking-time-only decay is a
canonical industry pattern that aligns with NIOV's Q-G4-ζ LOCK
no-auto-deletion + Q-G4-β β-1 LOCK lazy-at-read-only discipline.
Source: `mem0.ai/blog/introducing-memory-decay-in-mem0` +
`mem0.ai/blog/state-of-ai-agent-memory-2026`.

**RS-2 Ebbinghaus + SM-2 + FSRS spaced repetition** (cited at
canonical-knowledge register substantively). Ebbinghaus 1885 forgetting
curve: 42% loss in 20 min; 56% in 1 hr; ~67% in 1 day (most replicated
finding in experimental psychology). SM-2 (1987): fixed multipliers
+ easiness factor; powers Anki + SuperMemo. FSRS (2022 Jarrett Ye):
ML approach using **power-law forgetting curve**; trained on ~1,000
reviews per user; outperforms SM-2 for 99.5% of users; 20-30%
workload reduction with equivalent retention. Architectural
implication: NIOV's current `combined_score` recency component
(per ADR-0022) uses linear decay (7-day plateau → 90-day floor; per
`keywords.ts:74-80`). Exponential/power-law alternatives exist as
future-substrate consideration; NOT in-scope for G4.1 per Q-G4-β β-1
LOCK. Source: `mindomax.com/fsrs-vs-sm2-spaced-repetition-algorithm`
+ `mindomax.com/spaced-repetition-algorithms` +
`expertium.github.io/History.html`.

**RS-3 LRU / LFU / ARC cache eviction (analogy only per Q-G4-QLOCK
RS-3 explicit "use as analogy only; do not convert memory decay into
eviction/deletion")**. LRU = recency-based (PostgreSQL uses LRU-K
variant tracking k-th most recent access). LFU = frequency-based.
ARC (Adaptive Replacement Cache) = hybrid LRU + LFU. Architectural
implication: NIOV substrate combines recency (`last_accessed_at`),
frequency (`access_count`), and bilateral feedback (`relevance_score`
maintained by Loop 1 per Zone B1) — analogous to a hybrid recency-
frequency-feedback signal mix. BUT: per Q-G4-ζ LOCK + RULE 0 + RULE 10,
NIOV decay is **filtering/ranking only**, NOT eviction or deletion.
The cache-eviction analogy is descriptive of signal mix, NOT of
deletion policy. Source: `redis.io/blog/lfu-vs-lru-how-to-choose-
the-right-cache-eviction-policy`.

**RS-4 RAG temporal weighting + recency-relevance formulas** (cited
at canonical-knowledge register substantively). Common industry
formula 1: `score(q,d,t) = α·cos(q,d) + (1-α)·0.5^(age_days/h)`
(alpha + exponential decay). Common formula 2: `final_score =
semantic_penalty × [(1-w)·vector_score + w·(decay × recency ×
validity × event_relevance)]` (multi-factor). Time-bucket approach:
weight 1.0 if <1hr, decreasing buckets. Recent academic work at
arXiv:2509.19376 + arXiv:2510.16715 (2025) on temporal RAG.
Architectural implication: NIOV's ADR-0022 fixed-weight 3-component
`combined_score = tagOverlap·0.45 + baseRelevance·0.35 + recency·0.20`
is a discrete instance of the broader temporal-weighting design
space. Per Q-G4-θ θ-1 LOCK: similarity integration with decay is
EXPLICITLY DEFERRED at G4.1; ADR-0022 NOT amended at G4.1; any future
COE-similarity integration requires SEPARATE Founder authorization +
ADR-0022 amendment. Source:
`docs.ragie.ai/docs/retrievals-recency-bias` +
`langflow.org/blog/beyond-basic-rag-retrieval-weighting` +
arXiv:2509.19376.

**RS-5 Oban + Quantum BEAM scheduler context (future-substrate ONLY
per Q-G4-κ κ-1 LOCK; NOT in-scope for G4.1)**. Oban: PostgreSQL-
backed; ACID guarantees with application data; cron-like schedule +
priority + retries + unique-jobs + concurrency control;
production-grade for persistent jobs. Quantum: cron-like; OTP-based;
in-memory by default; lighter-weight for simple recurring tasks.
Architectural implication: IF Gap 4 decay execution ever needs
scheduled recompute (deferred per Q-G4-β β-1 LOCK + Q-G4-κ κ-1 LOCK),
Oban is the canonical BEAM-native choice given NIOV's existing
Postgres substrate per ADR-0033 cross-language ownership. NO
scheduler dependency added at G4.1; NO `mix.exs` changes; NO
hex-dependency additions. Source: `github.com/oban-bg/oban` +
`victorbjorklund.com/job-scheduling-cron-job-elixir-phoenix-quantum`.

## Governing RULES

This mini-arc is governed by RULE 0 + RULE 11 + RULE 12 + RULE 13 +
RULE 20 + RULE 21 canonical per CLAUDE.md operating manual.

- **RULE 0** — Humans Always Sovereign. Decay never deletes capsules;
  decay never silently destroys memory; low relevance is non-
  destructive filtering only; direct lookup and explicit recall
  remain possible; FOUNDATIONAL bypass preserved; soft-delete remains
  the only deletion path per RULE 10; any decay-driven deletion or
  expiry enforcement requires SEPARATE ADR + audit-literal
  authorization.

- **RULE 11** — Prisma/Ecto cross-language data ownership boundary
  preserved per ADR-0033 §Decision 7 + Q-5BII-EXEC-5. TypeScript owns
  scoring/decay execution; BEAM observes via Translator round-trip
  only at G4.1.

- **RULE 12** — Pre-flight grep before drafting. All claims grep /
  repo-evidence grounded. Substrate-state ground truth verified at
  file/line register substantively (per §Context substrate inventory).

- **RULE 13** — Surface substrate traps and uncertainty inline. Never
  silently fix or normalize them. ADR-0044 surfaces 2 substrate-state
  observations (O-G4.1-1 + O-G4.1-2) requiring Founder disposition at
  G4.2.

- **RULE 20** — Rule-Modification Authority (Founder-only). Founder
  authorization required BEFORE any edit, staging, commit, push, OR
  production-affecting action.

- **RULE 21** — Pre-Authorization Research Arc. Current source / repo
  inspection at canonical-knowledge register substantively REQUIRED
  before architecture/build recommendations. RS-1 through RS-5
  research arc canonical at §Context register substantively per
  Founder Q-G4-QLOCK §Required G4.1 research arc enumeration.

## Decision

Canonicalize the existing lazy-at-read decay substrate as the formal
Gap 4 substrate at canonical-execution register substantively per
ADR-0041 §Sub-decision 4 Q-H LOCK + Founder Q-G4-β β-1 LOCK +
Q-G4-ι ι-1 LOCK. The substrate at COE forget-floor + Loop 1 feedback
+ ADR-0022 combined_score recency + read-path last_accessed_at touch
+ async access_count increment + write-path decay_type/decay_rate
persistence + BEAM Translator round-trip preservation **IS** the
formal Gap 4 substrate canonical at canonical-execution register
substantively.

ADR-0044 G4.1 docs-only canonicalization at canonical-prose register
substantively per Q-G4-α α-1 LOCK + Q-G4-μ μ-2 LOCK 4-phase mini-arc
decomposition. No code changes at G4.1; no schema changes per Q-G4-δ
δ-1 LOCK; no audit literal expansion per Q-G4-η η-1 LOCK; no
SimilarityService integration per Q-G4-θ θ-1 LOCK; no Elixir-side
decay computation per Q-G4-κ κ-1 LOCK.

## Sub-decisions

### Sub-decision 1 — Q-G4-α α-1 LOCK: docs-only ADR-0044 first

Create ADR-0044 NEW Proposed at G4.1 docs-only commit register
substantively per canonical mini-arc opening pattern (mirrors G3.1
[BEAM-CAPSULE-EMBEDDING-ADR] + G1.1 [BEAM-CAPSULE-MUTATION-
DISCRIMINATION-ADR] + PR.1 [PR-HARDENING-ADR] precedents). Architecture
LOCKED at canonical-prose register substantively before any code
implementation.

### Sub-decision 2 — Q-G4-β β-1 LOCK: lazy-at-read only

Decay execution model canonical at canonical-execution register
substantively: lazy-at-read only. Per ADR-0041 §Sub-decision 4 Q-H
LOCK explicit "Lazy at-read decay LOCKED at ADR-0041 umbrella register
substantively per Founder Q-H LOCK (preserves existing substrate +
matches BEAM-native simplicity disposition + avoids scheduler
infrastructure dependency)". Scheduled recompute + background worker
+ hybrid scheduled compaction EXPLICITLY DEFERRED unless later
Founder-authorized via separate ADR amendment.

### Sub-decision 3 — Q-G4-γ γ-5 LOCK: multiple targets formalized

6 decay-related targets canonical at canonical-execution register
substantively (4 canonical + 2 substrate-state observations):

**Canonical (already at canonical-execution register substantively)**:

1. **`relevance_score`** — Float [0.0, 1.0]; default 1.0; maintained
   by Loop 1 bilateral feedback (Zone B1) per ADR-0022 §Amendment 1
   constants; filtered at `coe.service.ts:235-238` via
   `RELEVANCE_FORGET_FLOOR = 0.2` (FOUNDATIONAL bypass).
2. **`combined_score` recency component** — per ADR-0022 canonical
   formula `combined_score = tagOverlap·0.45 + baseRelevance·0.35 +
   recency·0.20`; `recencyScore` at `keywords.ts:74-80` returns 1.0
   if `last_accessed_at` is within 7 days, linear decay between day
   7 and day 90, 0.0 after 90 days.
3. **`last_accessed_at` touch on read** — `read.service.ts:328-335`
   raw SQL `UPDATE memory_capsules SET last_accessed_at = NOW()`
   after each capsule read; supports recency scoring per #2.
4. **`access_count` async increment** — `read.service.ts:772-788`
   async `bumpAccessCount` AFTER response per spec; informational
   metric (not yet a scoring input but available for ACCESS_BASED
   DecayType future implementation per O-G4.1-2).

**Substrate-state observations (require G4.2 disposition)**:

5. **`expires_at` TTL field** — see §Substrate Observation O-G4.1-1.
6. **DecayType enum semantics beyond FOUNDATIONAL** — see §Substrate
   Observation O-G4.1-2.

### Sub-decision 4 — Q-G4-δ δ-1 LOCK: no schema changes at G4.1

Prisma `MemoryCapsule` schema fields are sufficient for ADR
formalization. All required fields (relevance_score, decay_type,
decay_rate, commitment_date, access_count, last_accessed_at,
last_updated_at, expires_at) already exist at HEAD `e60122c`. Any
future schema change requires SEPARATE Founder authorization per
ADR-0025 schema-push-target discipline.

### Sub-decision 5 — Q-G4-ε LOCK: Gap 4 / Gap 5 boundary canonical

**Gap 4 (this ADR; Decay Execution)** = time/use-based ranking
pressure + lazy-at-read filtering + relevance decay/bump + recency
scoring + access tracking. Inputs: `last_accessed_at`, `access_count`,
`relevance_score`. Outputs: filter at COE retrieval + recency
component of combined_score. **NO automatic deletion.**

**Gap 5 (ADR-0045 reserved; Capsule-Level Staleness Detection)** =
semantic/content validity detection. 4-dimension framework per
ADR-0041 §Sub-decision 5 + Q-I LOCK: content age + embedding lag +
stale retrieval rate + coverage drift. Distinct from feedback-loop
staleness at `feedback.service.ts:169` (which is Loop-health
staleness, not capsule-content staleness).

**Do NOT collapse Gap 4 + Gap 5.** The two register at distinct
substrate-architectural registers canonical at canonical-coherence
register substantively per ADR-0041 §Q-H + §Q-I LOCKs.

Note: `apps/cosmp_router/lib/cosmp_router/storage.ex` comment "ETS
may temporarily hold stale data on the [Postgres commit]" describes
caching-tier staleness (ETS read-cache vs Postgres source-of-truth),
which is neither Gap 4 (decay) NOR Gap 5 (semantic staleness) — it
is a caching-coherence concern at the BEAM storage register
substantively. Surfaced here for boundary clarity only.

### Sub-decision 6 — Q-G4-ζ LOCK: RULE 0 no-auto-deletion canonical

RULE 0 binding canonical at canonical-rule register substantively:

- **Decay never deletes capsules.** Filtering at COE forget-floor is
  non-destructive; the row remains in DB with `relevance_score < 0.2`
  and remains readable via direct lookup (`getCapsuleMetadata` /
  `getCapsuleContent`).
- **Decay never silently destroys memory.**
  `capsules_skipped_low_relevance` metric is logged at COE retrieval;
  future canonical-state surface to entity-tier transparency UI as
  forward-substrate observability.
- **FOUNDATIONAL bypass preserved** per ADR-0021 §Capsule Type
  Extension Protocol + `coe.service.ts:235`
  (`c.decay_type === "FOUNDATIONAL"` returns true unconditionally,
  bypassing forget-floor).
- **Explicit-recall bypass preserved** per `coe.service.ts:438-466`
  (the `explicitRecallCapsules` path bypasses forget-floor for
  explicit-by-tag retrieval; user/entity can always pull a low-
  relevance capsule back if explicitly named).
- **Soft-delete (`deleted_at`) is the ONLY deletion path** per RULE
  10. Decay-driven soft-delete would require SEPARATE ADR + audit
  literal authorization per Q-G4-η LOCK + RULE 20.
- Any decay-driven deletion or expiry enforcement requires SEPARATE
  ADR + audit-literal authorization (per Q-G4-η η-1 LOCK forward-
  substrate clause).

### Sub-decision 7 — Q-G4-η η-1 LOCK: existing audit literals suffice

Existing 41 audit literals at
`packages/database/src/queries/audit.ts` SUFFICE for canonical
lazy-at-read substrate at G4.1. No new audit literal added.
Relevant existing literals: `SESSION_EXPIRED`, `PERMISSION_EXPIRED`,
`REGULATOR_ACCESS_EXPIRED` (reserved), `CAPSULE_METADATA_READ`,
`CAPSULE_CONTENT_READ`, `CAPSULE_MUTATION_ADD/UPDATE/MERGE/NOOP`,
`CAPSULE_SIMILARITY_SEARCH`, `ADMIN_ACTION` (used at Loop 1 outcome
recording).

Future audit-literal extensions (if G4.2 surfaces required `expires_at`
enforcement or G4.3 conditional implementation lands) MUST follow
ADR-0042 §Q-γ.1 clean-transition discipline canonical at canonical-
execution register substantively.

### Sub-decision 8 — Q-G4-θ θ-1 LOCK: similarity integration explicit DEFER

Similarity-search decay integration EXPLICITLY DEFERRED at G4.1.
`SimilarityService` at `apps/api/src/services/cosmp/similarity.service.ts`
remains UNTOUCHED. ADR-0043 G3.9 production-contract privacy proofs
(J5-J8) remain preserved. NO ADR-0022 amendment at G4.1.

Per ADR-0043 §Q-G3-δ + §Q-G3.6-ε explicit deferral, COE integration
with similarity is forward-substrate. 4 integration paths enumerated
at ADR-0043 §Sub-decision 4 (replace tagOverlap / 4th coefficient /
rerank / prefilter); paths (a) + (b) require Founder-authorized
ADR-0022 amendment. Any future similarity/COE combined-score
integration requires SEPARATE Founder authorization + likely ADR-0022
amendment.

### Sub-decision 9 — Q-G4-ι ι-1 LOCK: canonicalize existing substrate

ADR-0044 G4.1 canonicalizes the existing substrate at canonical-
execution register substantively. Per Sub-decision 3 enumeration: 4
canonical sites + 2 substrate-state observations. No new code at
G4.1; existing substrate IS the formal Gap 4 substrate canonical at
canonical-state register substantively.

### Sub-decision 10 — Q-G4-κ κ-1 LOCK: BEAM observer only

BEAM observes only at G4.1. Per RULE 11 + ADR-0033 §Decision 7 +
Q-5BII-EXEC-5: TypeScript owns scoring/decay execution; Translator
round-trip at `apps/cosmp_router/lib/cosmp_router/capsule/translator.ex`
preserves `decay_type` / `decay_rate` / `relevance_score` across
pack/unpack pure transformation per ADR-0026 §5 Pattern 6.

- No Elixir-side decay computation at G4.1 (per Founder Q-G4-κ κ-1
  LOCK; mirrors ADR-0043 G3.8 β-A LOCK precedent for vector access
  exclusion).
- No Ecto-owned decay DDL.
- No scheduler dependency (no Oban / Quantum / hex-dep additions).
- Translator/schema round-trip preservation is sufficient unless a
  later implementation phase proves otherwise (forward-substrate
  per Q-G4-β β-1 + Q-G4-κ κ-1 LOCKS).

### Sub-decision 11 — Q-G4-λ λ-1 LOCK: cite existing anchor tests only

G4.1 cites existing frozen anchor tests canonical at canonical-
execution register substantively:

- `tests/unit/coe.test.ts:121-129` — recency monotonicity anchor
  (per ADR-0022 §Substrate-Test Anchors)
- `tests/unit/coe.test.ts:132-136` — `combined_score` coefficient
  anchor (`combinedScore(1,0,0) === 0.45`, `combinedScore(0,1,0)
  === 0.35`, `combinedScore(0,0,1) === 0.20`, `combinedScore(1,1,1)
  === 1.00`)

These anchors are sufficient for G4.1 substrate-state ground truth
validation. New tests are DEFERRED unless a substantive
implementation phase (G4.3) is later authorized via SEPARATE Founder
authorization.

### Sub-decision 12 — Q-G4-μ μ-2 LOCK: 4-phase mini-arc decomposition

4-phase mini-arc per Founder Q-G4-μ μ-2 LOCK:

1. **G4.1** `[BEAM-CAPSULE-DECAY-ADR]` — this commit. NEW ADR-0044
   Proposed. Docs-only. 4 MOD + 1 NEW. RULE 21 research arc embedded
   at §Context register substantively. Canonicalizes existing lazy-
   at-read substrate.
2. **G4.2** `[BEAM-CAPSULE-DECAY-SUBSTRATE-OBSERVATION]` — forward-
   substrate. Docs-only or minimal verification. Resolves whether
   `expires_at` TTL + non-FOUNDATIONAL DecayType semantics require
   implementation or can be explicitly deferred per Founder Q-G4.2
   disposition.
3. **G4.3** `[BEAM-CAPSULE-DECAY-IMPL]` — forward-substrate.
   Conditional code-tier landing. SKIP by default unless G4.2 proves
   required implementation per Founder Q-G4.3 authorization.
4. **G4.4** `[BEAM-CAPSULE-DECAY-CLOSURE]` — forward-substrate.
   Docs-only closure cascade. ADR-0044 Status Proposed → Accepted if
   G4.1-G4.3 satisfy locks. Cluster expansion at ADR-0035 §9 if
   Founder authorizes substrate-build observation promotion.

## Substrate-State Observations

Two substrate-state observations surfaced at G4.1 PRE-FLIGHT grep per
RULE 12 + RULE 13 substrate-honest discipline. Both require G4.2
disposition per Founder Q-G4-γ γ-5 LOCK explicit enumeration.

### O-G4.1-1: `expires_at` TTL field substrate-state observation

**Substrate-state ground truth**: Prisma `MemoryCapsule` schema has
`expires_at DateTime?` at L165 (with optional `@@index([expires_at])`
on other models like CapsulePermission). However, **no service-tier
TTL enforcement** is found at COE register substantively. Grep
verification:

- `coe.service.ts` does NOT filter on `expires_at` (Filter 1 is
  permission check; Filter 2 is forget-floor; Filter 3 is budget).
- `read.service.ts` does NOT check `expires_at` before returning
  capsule content.
- `write.service.ts` does NOT enforce `expires_at` at create-time or
  update-time.
- `similarity.service.ts` filters on `deleted_at IS NULL` +
  `ai_access_blocked = false` + `requires_validation = false` +
  `clearance_required <= $3` + `embedding IS NOT NULL` per G3.6
  substrate, but does NOT filter on `expires_at`.

**Disposition**: surface at G4.2 substrate observation phase per
Founder Q-G4-μ μ-2 LOCK. Founder Q-G4.2 disposition required:
- Option A: implement TTL enforcement at COE register + new
  `CAPSULE_EXPIRED` audit literal per ADR-0042 §Q-γ.1 clean-transition
  discipline (G4.3 substantive landing)
- Option B: explicitly defer TTL enforcement to a future Founder-
  authorized ADR amendment (G4.3 SKIP)
- Option C: deprecate `expires_at` field if not needed (separate ADR
  amendment + Prisma schema migration)

NO disposition at G4.1; surfacing for canonical-state register
substantively per RULE 13.

### O-G4.1-2: DecayType enum semantics substrate-state observation

**Substrate-state ground truth**: DecayType enum has 5 values at
`packages/database/prisma/schema.prisma:442-448`:

- `FOUNDATIONAL` — has explicit substrate behavior at
  `coe.service.ts:235` (bypasses forget-floor) + ADR-0021 §Capsule
  Type Extension Protocol references
- `TIME_BASED` — default for non-FOUNDATIONAL writes per
  `write.service.ts:635-637`; **no semantics beyond default at
  substrate-execution register substantively**
- `ACCESS_BASED` — declared but **no explicit substrate behavior at
  COE / read / similarity registers** beyond default ranking
- `PERMANENT` — declared but **no explicit substrate behavior beyond
  default ranking**; semantically might overlap with FOUNDATIONAL?
- `SESSION_ONLY` — declared but **no explicit substrate behavior at
  any register**; session-scoped lifecycle not implemented

**Disposition**: surface at G4.2 substrate observation phase per
Founder Q-G4-μ μ-2 LOCK. Founder Q-G4.2 disposition required:
- Option A: implement explicit substrate behavior for TIME_BASED
  (time-based decay rate application) + ACCESS_BASED (access-count-
  weighted decay) + PERMANENT (FOUNDATIONAL-bypass-equivalent +
  retention semantics) + SESSION_ONLY (session-scoped lifecycle with
  auto-cleanup on session end) at G4.3 substantive landing
- Option B: explicitly defer enum semantics to a future Founder-
  authorized ADR amendment (G4.3 SKIP); document current state as
  canonical "default ranking" for all non-FOUNDATIONAL values
- Option C: deprecate unused enum values (separate ADR amendment +
  Prisma schema migration; preserves FOUNDATIONAL + TIME_BASED only)

NO disposition at G4.1; surfacing for canonical-state register
substantively per RULE 13.

## G4.2 Substrate Observation Resolution (2026-05-18)

G4.2 `[BEAM-CAPSULE-DECAY-SUBSTRATE-OBSERVATION]` resolves the two
substrate-state observations surfaced at G4.1 per Founder Q-G4.2
LOCKs at `[BEAM-CAPSULE-DECAY-SUBSTRATE-OBSERVATION-G4.2-QLOCK]` +
`[BEAM-CAPSULE-DECAY-SUBSTRATE-OBSERVATION-G4.2-EXECUTE-VERIFY-AUTH]`
register substantively. G4.2 is docs-only 3 MOD per Founder Q-G4.2-δ
δ-1 LOCK. G4.2 does NOT flip ADR-0044 Status; preserved as
`Proposed 2026-05-18`. G4.2 does NOT close Gap 4; G4.3 SKIP forward-
substrate + G4.4 closure cascade forward-substrate remain canonical.

### G4.2 Q-LOCKs canonical at canonical-state register substantively

- **Q-G4.2-α α-2 LOCK** — defer `MemoryCapsule.expires_at` TTL
  enforcement to a future Founder-authorized ADR amendment. Rationale:
  MemoryCapsule.expires_at is settable at create-time, immutable
  post-create, has no service-tier enforcement at COE / read /
  similarity registers, has no MemoryCapsule-level audit literal, and
  has no `@@index` on MemoryCapsule (only on CapsulePermission +
  Session + RegulatorAccess). Enforcing TTL now would introduce
  runtime semantics + audit implications + RULE 0 review surface.
  Deferral is substrate-honest and preserves RULE 0 no-automatic-
  deletion + RULE 10 soft-delete-only discipline.
- **Q-G4.2-β β-2 LOCK** — defer explicit non-FOUNDATIONAL DecayType
  enum semantics to a future Founder-authorized ADR amendment.
  Rationale: FOUNDATIONAL has explicit runtime behavior at
  `coe.service.ts:235` (forget-floor bypass) + `:250` (isFoundational
  flag) + `:253-259` (FOUNDATIONAL-first ordering + zero token budget
  consumption); TIME_BASED is the write-time default at
  `write.service.ts:635` with no distinct behavior beyond
  `combined_score` recency component per ADR-0022 (which applies to
  ALL non-FOUNDATIONAL types equally); ACCESS_BASED / PERMANENT /
  SESSION_ONLY have no explicit substrate behavior at any register.
  Implementing distinct semantics now would require product-level
  decisions + tests per type + possible audit-literal expansion +
  potential ADR-0022 amendment surface. Current canonical runtime
  state at HEAD `7097bb8` is "**FOUNDATIONAL is special; all non-
  FOUNDATIONAL values share default ranking behavior**".
- **Q-G4.2-γ γ-1 LOCK** — G4.3 `[BEAM-CAPSULE-DECAY-IMPL]` formal SKIP
  by default; separate SKIP commit canonical at canonical-state
  register substantively per G1.4 (`3505fde`) + G3.7 (`ee0b01b`) +
  G3.8 (`ee0b01b` variant) canonical mini-arc SKIP precedents. SKIP
  NOT folded into G4.2 or G4.4; preserves canonical SKIP commit
  pattern.
- **Q-G4.2-δ δ-1 LOCK** — docs-only 3 MOD scope: ADR-0044 +
  section-12-progress + CURRENT_BUILD_STATE. No code / test / script
  / schema / CI / package / lockfile / vitest config / docker-compose
  / .husky / mix / audit.ts / .env / README / CLAUDE.md changes at
  G4.2.

### G4.2 disposition resolution for O-G4.1-1 (`expires_at` TTL)

Per Founder Q-G4.2-α α-2 LOCK, MemoryCapsule.expires_at TTL
enforcement is **deferred to a future Founder-authorized ADR
amendment**. Substrate-state ground truth at HEAD `7097bb8`:

- MemoryCapsule.expires_at field exists at `schema.prisma:165`
  (`DateTime?`); persisted at create-time at `write.service.ts:675`
  (`expires_at: input.expires_at ?? null`).
- **Immutable post-create** per inline comment at
  `write.service.ts:1102` ("CapsuleUpdateInput has no `expires_at`
  field (immutable post-create)") + omission from `CapsuleUpdateInput`
  type.
- **No `@@index` on MemoryCapsule.expires_at** (indices at L270 +
  L368 + L617 belong to CapsulePermission + Session + RegulatorAccess
  respectively).
- **No service-tier enforcement** at `coe.service.ts` /
  `read.service.ts` / `similarity.service.ts`.
- Other models' `expires_at` ARE actively enforced via dedicated
  audit literals (`SESSION_EXPIRED` + `PERMISSION_EXPIRED` +
  `REGULATOR_ACCESS_EXPIRED`); MemoryCapsule has no such audit
  literal and Q-G4-η η-1 LOCK preserves "no new audit literals at G4".

RULE 0 preserved: no automatic deletion path introduced; user/entity
autonomy preserved; explicit-recall + FOUNDATIONAL bypass + soft-
delete-only discipline canonical at canonical-rule register
substantively.

### G4.2 disposition resolution for O-G4.1-2 (DecayType enum semantics)

Per Founder Q-G4.2-β β-2 LOCK, explicit non-FOUNDATIONAL DecayType
enum semantics are **deferred to a future Founder-authorized ADR
amendment**. Canonical runtime state at HEAD `7097bb8` documented
verbatim:

| DecayType value | Behavior at HEAD `7097bb8` |
|---|---|
| `FOUNDATIONAL` | **EXPLICIT runtime behavior**: forget-floor bypass at `coe.service.ts:235`; `isFoundational` flag at `coe.service.ts:250`; FOUNDATIONAL-first ordering + zero token budget consumption at `coe.service.ts:253-259`; storage_tier defaults to HOT at `write.service.ts:637` |
| `TIME_BASED` | **DEFAULT** at `write.service.ts:635` for non-FOUNDATIONAL writes; **no distinct behavior** beyond `combined_score` recency component per ADR-0022 |
| `ACCESS_BASED` | **NO distinct runtime behavior** at any register; `access_count` is tracked at `read.service.ts:772-788` but NOT wired into any DecayType-conditional logic |
| `PERMANENT` | **NO distinct runtime behavior** at any register; does NOT bypass forget-floor |
| `SESSION_ONLY` | **NO distinct runtime behavior** at any register; session-scoped lifecycle NOT implemented; no auto-cleanup on session end; no integration with `Session.expires_at` |

Canonical state: "**FOUNDATIONAL is special; all non-FOUNDATIONAL
values share default ranking behavior**". Future product feature
requiring distinct non-FOUNDATIONAL semantics requires a separate
Founder-authorized ADR amendment.

### O-G4.2-3 NEW substrate-state observation (surfaced at G4.2 PRE-FLIGHT per RULE 13)

**Substrate-state ground truth**: `MemoryCapsule.expires_at` is
write-set-only — settable at `write.service.ts:675` at create-time,
but **explicitly immutable post-create** per inline comment at
`write.service.ts:1102` + omission from `CapsuleUpdateInput`. Combined
with the absence of any service-tier enforcement documented in
O-G4.1-1, MemoryCapsule.expires_at is currently a **persisted-but-
unused metadata field** at the capsule tier. The field has no
`@@index` on MemoryCapsule (indices at schema.prisma L270 + L368 +
L617 belong to CapsulePermission + Session + RegulatorAccess
respectively, NOT MemoryCapsule). No production data depends on the
field's semantics.

**Disposition**: reinforces Q-G4.2-α α-2 defer disposition. No
separate Q-LOCK required; folds into Q-G4.2-α α-2 LOCK rationale at
canonical-coherence register substantively. Surfaced inline per RULE
13 substrate-honest discipline. Future Founder-authorized ADR
amendment may address all three dimensions (write-settable +
post-create-mutable + service-tier enforcement) together if product
requirements surface capsule-tier TTL.

### G4.2 critical coherence preserved

- ADR-0044 Status preserved `Proposed 2026-05-18` (G4.2 NOT a Status-
  flip commit; G4.4 closure cascade is the Status-flip commit)
- Sub-arc 2 status field preserved IN FLIGHT throughout G4.1-G4.4
- Gap 4 row Status preserved IN FLIGHT
- Gap 4 / Gap 5 / Gap 6 reservations preserved at ADR-0041
- ADR-0022 + ADR-0033 + ADR-0035 + ADR-0043 + ADR-0047 + ADR-0041
  untouched at G4.2
- No new audit literals (Q-G4-η η-1 LOCK + RULE 0 + Q-G4-ζ no-auto-
  deletion preserved)
- No code / test / script / schema / CI / package / vitest /
  docker-compose / .husky / mix / audit.ts / .env / README /
  CLAUDE.md changes at G4.2
- No production-affecting actions; no Elixir decay computation; no
  secret exposure

## G4.3 Formal SKIP Record (2026-05-18)

G4.3 `[BEAM-CAPSULE-DECAY-IMPL]` formally SKIPPED at canonical-state
register substantively per Founder Q-G4.3-α α-1 LOCK + Q-G4.3-β β-1
LOCK + Q-G4.3-γ γ-1 LOCK + Q-G4.3-δ δ-3 LOCK at
`[BEAM-CAPSULE-DECAY-IMPL-G4.3-QLOCK]` +
`[BEAM-CAPSULE-DECAY-IMPL-G4.3-EXECUTE-VERIFY-AUTH]` register
substantively. **No implementation landed at G4.3.** G4.3 is a formal
docs-only SKIP record per the canonical mini-arc SKIP commit pattern
established at G1.4 (`3505fde` `[CAPSULE-MUTATION-ELIXIR-AUDIT]` per
ADR-0042 §Sub-decision Q-ι default LOCK) + G3.7 (`ee0b01b`
`[CAPSULE-EMBEDDING-BACKFILL]` per ADR-0043 §Sub-decision Q-G3.7-α
α-1 LOCK).

### G4.3 Q-LOCKs canonical at canonical-state register substantively

- **Q-G4.3-α α-1 LOCK** — formal SKIP record now (NOT folded into
  G4.4 closure cascade per Founder Q-G4.2-γ γ-1 LOCK explicit
  directive "SKIP NOT folded into G4.2 or G4.4"). Canonical SKIP
  commit pattern preserves mini-arc traceability.
- **Q-G4.3-β β-1 LOCK** — docs-only 3 MOD scope (ADR-0044 +
  section-12-progress + CURRENT_BUILD_STATE). No code / test / script
  / schema / CI / package / lockfile / vitest config / docker-compose
  / .husky / mix / audit.ts / .env / README / CLAUDE.md changes at
  G4.3.
- **Q-G4.3-γ γ-1 LOCK** — ADR-0044 Status preserved
  `Proposed 2026-05-18` (G4.4 closure cascade is the canonical
  Status-flip commit per ADR-0044 §Implementation Lineage).
- **Q-G4.3-δ δ-3 LOCK** — ADR-0035 §9 cluster promotion decision
  deferred to G4.4 closure cascade per canonical mini-arc cluster
  expansion pattern (G3.10 + PR.4 precedents at closure register
  substantively).

### G4.3 SKIP rationale — substrate-state ground truth

After G4.2 LANDED (`ce33c3a`), G4.3 has no implementation substrate
left:

- **Q-G4.2-α α-2 LOCK** at G4.2 deferred MemoryCapsule.expires_at
  TTL enforcement to a future Founder-authorized ADR amendment →
  **removed TTL enforcement implementation from G4.3 scope**.
- **Q-G4.2-β β-2 LOCK** at G4.2 deferred explicit non-FOUNDATIONAL
  DecayType enum semantics to a future Founder-authorized ADR
  amendment → **removed DecayType enum semantics implementation from
  G4.3 scope**.
- **Q-G4-η η-1 LOCK** at G4 mini-arc level: existing audit literals
  suffice; no new audit literals at G4 → **removed audit-literal
  expansion from G4.3 scope**.
- **Q-G4-θ θ-1 LOCK** at G4 mini-arc level: SimilarityService
  UNTOUCHED; ADR-0043 G3.9 J5-J8 privacy proofs preserved → **removed
  COE integration + similarity-search integration from G4.3 scope**.
- **Q-G4-κ κ-1 LOCK** at G4 mini-arc level: BEAM observer only; no
  Elixir-side decay computation; no scheduler dependency; no
  Oban/Quantum hex-dep → **removed Elixir implementation from G4.3
  scope**.
- **RULE 0 + RULE 10 + Q-G4-ζ LOCK**: decay never deletes; no
  automatic deletion; soft-delete-only discipline; FOUNDATIONAL
  bypass + explicit-recall bypass preserved → **removed any
  deletion-class implementation from G4.3 scope**.

**Conclusion**: every implementation surface that G4.3 could
substantively touch was deferred or excluded by prior locks. Formal
SKIP preserves mini-arc traceability without pretending implementation
landed (RULE 13 substrate-honest discipline).

### Canonical SKIP precedent citations

- **G1.4** commit `3505fde` `[CAPSULE-MUTATION-ELIXIR-AUDIT]` —
  formal SKIP per ADR-0042 §Sub-decision Q-ι default LOCK; substrate-
  state proof that Elixir audit/canonical/idempotency support was not
  substantively needed at Gap 1 mini-arc register (Elixir
  canonical_record treats event_type as opaque string; Elixir
  write_audit_event accepts event_type as opaque string; TS API
  remains canonical capsule write path; MemoryCapsule Ecto schema
  absence of mutation_type is benign because Elixir does not depend
  on the column). G1.4 SKIP scope: 1 MOD docs-only (ADR-0042 only).
- **G3.7** commit `ee0b01b` `[CAPSULE-EMBEDDING-BACKFILL]` — formal
  SKIP per ADR-0043 §Sub-decision Q-G3.7-α α-1 LOCK + Q-G3.7-η 5-MOD-
  docs-only scope LOCK; substrate-state proof that legacy capsule
  bulk-backfill was not substantively needed (every capsule on
  origin/main was created via post-G3.5 WriteService with embedding
  generation at create-time; G3.6 similarity service already enforces
  `embedding IS NOT NULL` graceful-exclusion in raw SQL filter set).
  G3.7 SKIP scope: 5 MOD docs-only (ADR-0043 + section-12-progress +
  CURRENT_BUILD_STATE + architecture/README + CLAUDE.md).

G4.3 SKIP scope (3 MOD docs-only) is smaller than G3.7 SKIP scope
because ADR-0044 catalog entries in README + CLAUDE.md were added at
G4.1 (`7097bb8`) and remain current; G4.3 SKIP does not need a
catalog refresh because ADR-0044 Status is preserved and the catalog
entry is unchanged. G4.3 SKIP scope is closer to G1.4 minimum-touch
pattern.

### G4.3 critical coherence preserved

- ADR-0044 Status preserved `Proposed 2026-05-18` (G4.4 closure
  cascade is the Status-flip commit per Q-G4.3-γ γ-1 LOCK)
- Sub-arc 2 status field preserved IN FLIGHT
- Gap 4 row Status preserved IN FLIGHT (G4.3 SKIP advances Gap 4
  mini-arc 2/4 → 3/4; G4.4 closure forward-substrate)
- Gap 4 / Gap 5 / Gap 6 reservations preserved at ADR-0041
- ADR-0022 + ADR-0033 + ADR-0035 + ADR-0043 + ADR-0047 + ADR-0041
  untouched at G4.3
- No new audit literals (Q-G4-η η-1 LOCK + RULE 0 + Q-G4-ζ no-auto-
  deletion preserved)
- No code / test / script / schema / CI / package / vitest /
  docker-compose / .husky / mix / audit.ts / .env / README /
  CLAUDE.md changes at G4.3
- No production-affecting actions; no Elixir vector access; no
  Elixir decay computation; no secret exposure

## Consequences

### Positive

- Formalization at canonical-state register substantively canonical
  per ADR-0041 §Sub-decision 4 expected closure path
- Existing lazy-at-read substrate canonical at canonical-execution
  register substantively (no code disruption at G4.1)
- 2 substrate-state observations surfaced inline per RULE 13
  substrate-honest discipline (no silent normalization)
- Gap 4 / Gap 5 boundary clarification canonical at canonical-
  coherence register substantively
- RULE 0 no-auto-deletion discipline canonical at canonical-rule
  register substantively (preserves user/entity autonomy)
- ADR-0044 / ADR-0045 / ADR-0046 forward-substrate reservations
  preserved per ADR-0020 patent-implementation evidence lineage
- BEAM observer-only canonical at G4.1 preserves Prisma/Ecto cross-
  language ownership boundary per RULE 11 + ADR-0033
- 4-phase mini-arc decomposition (G4.1-G4.4) mirrors PR.1-PR.4 +
  G3.1-G3.10 precedent at substrate-architectural register
  substantively

### Negative

- G4.2 substrate-observation phase requires Founder disposition for
  O-G4.1-1 + O-G4.1-2 (may surface required implementation work at
  G4.3)
- 4 of 5 DecayType enum values currently have no explicit substrate
  behavior beyond default (substrate-state-honest acknowledgment)
- `expires_at` TTL field at Prisma schema is not enforced at any
  service-tier (substrate-state-honest acknowledgment)
- Adds 1 ADR + 4 docs MOD between Gap 3 closure + Gap 4 substantive
  implementation (mini-arc overhead vs single-commit landing)

### Neutral

- Sub-arc 2 status field remains IN FLIGHT throughout G4.1-G4.4 per
  Q-G4-δ + Q-G4-μ + Q-G4.1-Sub-decision-12 LOCK
- ADR-0043 + ADR-0047 Status preserved as Accepted 2026-05-18 (no
  G4-tier impact)
- ADR-0022 + ADR-0033 + ADR-0035 substantive bodies preserved (no
  amendment at G4.1)

## Alternatives Considered

### β-2 Scheduled recompute (Oban / Quantum / cron) — REJECTED

Per Founder Q-H LOCK at ADR-0041 §Sub-decision 4 + Q-G4-β β-1 LOCK
at this ADR: lazy-at-read selected as canonical default. Scheduled
recompute would require Oban or Quantum hex-dep addition + scheduler
infrastructure dependency, contrary to BEAM-native simplicity
disposition. RS-5 Oban context cited as future-substrate context
ONLY; not in-scope for G4.1. **Rejected** at G4.1 per Founder LOCK.

### β-3 Hybrid lazy-at-read + scheduled compaction — REJECTED

Hybrid pattern (Mem0-style ranking-time decay + MuninnDB-style
scheduled recompute) considered. Per Q-G4-β β-1 LOCK + Q-G4-κ κ-1
LOCK: scheduler dependency NOT introduced at G4.1; hybrid pattern
EXPLICITLY DEFERRED. **Rejected** at G4.1; forward-substrate to
G4.3 conditional or future ADR amendment.

### FSRS power-law forgetting curve — DEFERRED (RS-2)

RS-2 research arc surfaced FSRS power-law decay as the modern
spaced-repetition canonical (99.5%+ outperforms SM-2; per-user
training). NIOV's current `combined_score` recency component uses
linear decay (7-day plateau → 90-day floor per ADR-0022). Power-law
or exponential decay would require ADR-0022 amendment + frozen-
anchor test updates at `tests/unit/coe.test.ts:121-129`. Per Q-G4-θ
θ-1 LOCK + Q-G4-λ λ-1 LOCK: no ADR-0022 amendment at G4.1.
**Deferred** as future-substrate consideration.

### LRU/LFU eviction — REJECTED (RS-3)

RS-3 research arc surfaced LRU/LFU/ARC cache eviction patterns.
Per Founder Q-G4-QLOCK RS-3 explicit clause: "use as analogy only.
Do not convert memory decay into eviction/deletion." Per RULE 0 +
RULE 10 + Q-G4-ζ LOCK: NIOV decay is filtering/ranking only, NEVER
eviction or deletion. Cache-eviction analogy is descriptive of
signal mix (recency + frequency + bilateral feedback) but NOT of
deletion policy. **Rejected** as a deletion model; signal-mix
analogy acknowledged at §Context RS-3.

### α-2 Direct code implementation first — REJECTED

α-2 disposition (direct code implementation before ADR) would
violate ADR-0041 §Sub-decision 4 explicit clause: "ADR-0044 forward-
substrate at canonical-coherence register substantively must
distinguish existing lazy read-path behavior from missing formal
decay execution substrate + decide whether scheduler/backfill is
needed later BEFORE code at canonical-execution register
substantively." Per Founder Q-G4-α α-1 LOCK: docs-only ADR-0044
first. **Rejected** at G4.1.

### α-3 Defer Gap 4 entirely — REJECTED

α-3 disposition (defer Gap 4 entirely) considered but contrary to
Sub-arc 2 forward-substrate path per ADR-0041 §Sub-decision 1. Gap 4
is part of the canonical 4-gap capsule layer substrate
(ADR-0042 Gap 1 CLOSED + ADR-0043 Gap 3 CLOSED + ADR-0044 Gap 4
[this ADR] + ADR-0045 Gap 5 + optional ADR-0046 Gap 6); deferring
Gap 4 would block Sub-arc 2 closure cascade. **Rejected** per
Sub-arc 2 substrate-architectural integrity.

## References

- **RULE 0** — Humans Always Sovereign (CLAUDE.md L130-150)
- **RULE 11** — Wider Knowledge Check for Elixir/BEAM Substrate +
  Prisma/Ecto cross-language ownership boundary discipline
- **RULE 12** — Pre-Flight Grep Before Drafting
- **RULE 13** — Surface Drifts Inline Over Silent Fix
- **RULE 20** — Rule-Modification Authority (Founder-only)
- **RULE 21** — Pre-Authorization Research Arc
- **ADR-0002** — Append-Only Audit Chain (BEFORE DELETE trigger
  discipline)
- **ADR-0011** — Three-Tier Test Stratification (test substrate)
- **ADR-0015** — CI Workflow Architecture
- **ADR-0018** — Deployment-Target Agnosticism Posture
- **ADR-0020** — Two-Register IP Discipline (patent-implementation
  evidence lineage; preserves ADR-0045 + ADR-0046 forward-substrate
  reservations)
- **ADR-0021** — Capsule Type Extension Protocol (FOUNDATIONAL
  bypass + DecayType enum extension protocol)
- **ADR-0022** — combined_score Formula Canonicalization (explicit
  NO amendment at G4.1; `tagOverlap·0.45 + baseRelevance·0.35 +
  recency·0.20` coefficient lock preserved; `RELEVANCE_*` constants
  preserved; recency 7/90-day thresholds preserved)
- **ADR-0025** — Schema-Push-Target Discipline (production schema
  changes go through deploy pipeline)
- **ADR-0026** — Dual-Control Middleware Pattern + 6 BEAM-Compat
  Patterns (Pattern 6 pure transformation; Translator pack/unpack
  preserves decay fields)
- **ADR-0027** — Contributor Governance + AI-Alignment + Rule-
  Modification Authority
- **ADR-0033** — BEAM Persistence + Idempotency + Audit-Chain
  Cryptographic Substrate (§Decision 7 + §Q-5BII-EXEC-5 cross-
  language data ownership boundary)
- **ADR-0035** — Substrate-Build Discipline Canonical (§9 cluster;
  back-citation deferred to G4.4 closure if Founder authorizes)
- **ADR-0041** — Capsule Layer Substrate Umbrella (parent ADR;
  §Sub-decision 4 Q-H LOCK; Gap 4/5/6 forward-substrate reservations
  preserved at this ADR)
- **ADR-0042** — Capsule Mutation Discrimination (ADD/UPDATE/MERGE/
  NOOP enum; §Q-γ.1 clean-transition discipline forward-citation for
  any future audit literal expansion)
- **ADR-0043** — pgvector Embedding (Gap 3 closure; G3.6
  SimilarityService UNTOUCHED at G4.1 per Q-G4-θ θ-1 LOCK; §Q-G3-δ +
  §Q-G3.6-ε COE integration deferral forward-citation)
- **ADR-0044** — this ADR
- **ADR-0045** — Gap 5 Capsule-Level Staleness Detection
  (forward-substrate reservation preserved; distinct from Gap 4 per
  §Sub-decision 5 Gap 4 / Gap 5 boundary)
- **ADR-0046** — optional Gap 6 AI_AGENT EntityType-Discriminated
  Capsule Routing (forward-substrate reservation preserved)
- **ADR-0047** — Post-Gap-3 Production-Readiness Hardening (closure
  parent register substantively at canonical-state register
  substantively; Accepted 2026-05-18)
- Patent **US 12,517,919** (COSMP)
- Patent **US 12,164,537** (DMW)
- Patent **US 12,399,904** (Foundation primitives)

### Research arc sources (RS-1 through RS-5; embedded at §Context register substantively per RULE 21)

- **RS-1 Mem0**: `mem0.ai/blog/introducing-memory-decay-in-mem0` +
  `mem0.ai/blog/state-of-ai-agent-memory-2026`
- **RS-2 Ebbinghaus/SM-2/FSRS**: `mindomax.com/fsrs-vs-sm2-spaced-
  repetition-algorithm` + `mindomax.com/spaced-repetition-algorithms`
  + `expertium.github.io/History.html`
- **RS-3 LRU/LFU/ARC**: `redis.io/blog/lfu-vs-lru-how-to-choose-the-
  right-cache-eviction-policy`
- **RS-4 RAG temporal weighting**:
  `docs.ragie.ai/docs/retrievals-recency-bias` +
  `langflow.org/blog/beyond-basic-rag-retrieval-weighting` +
  arXiv:2509.19376 + arXiv:2510.16715
- **RS-5 Oban + Quantum**: `github.com/oban-bg/oban` +
  `victorbjorklund.com/job-scheduling-cron-job-elixir-phoenix-quantum`

## Founder Authorization

Founder authorization explicit at G4.1 substantive landing per RULE
20 at:

- `[BEAM-CAPSULE-DECAY-G4-QLOCK]`
- `[BEAM-CAPSULE-DECAY-ADR-G4.1-EXECUTE-VERIFY-AUTH]`

Founder authorization explicit at G4.2 substantive landing per RULE
20 at:

- `[BEAM-CAPSULE-DECAY-SUBSTRATE-OBSERVATION-G4.2-QLOCK]`
- `[BEAM-CAPSULE-DECAY-SUBSTRATE-OBSERVATION-G4.2-EXECUTE-VERIFY-AUTH]`

Founder authorization explicit at G4.3 formal SKIP record landing per
RULE 20 at:

- `[BEAM-CAPSULE-DECAY-IMPL-G4.3-QLOCK]`
- `[BEAM-CAPSULE-DECAY-IMPL-G4.3-EXECUTE-VERIFY-AUTH]`

## Implementation Lineage (forward-substrate G4.1-G4.4)

| Sub-phase | Tag | Authorized scope | Status |
|-----------|-----|------------------|--------|
| G4.1 | `[BEAM-CAPSULE-DECAY-ADR]` | 4 MOD + 1 NEW docs-only ADR-0044 NEW Proposed; RULE 21 research arc embedded; canonicalizes existing lazy-at-read substrate; 2 substrate-state observations surfaced (O-G4.1-1 + O-G4.1-2) | this commit |
| G4.2 | `[BEAM-CAPSULE-DECAY-SUBSTRATE-OBSERVATION]` | Docs-only 3 MOD per Founder Q-G4.2-δ δ-1 LOCK; resolves O-G4.1-1 disposition (Q-G4.2-α α-2 LOCK defer `expires_at` TTL) + O-G4.1-2 disposition (Q-G4.2-β β-2 LOCK defer DecayType enum semantics); G4.3 formal SKIP determination (Q-G4.2-γ γ-1 LOCK); NEW O-G4.2-3 substrate-state observation surfaced (MemoryCapsule.expires_at immutable post-create + persisted-but-unused metadata) | G4.2 LANDED 2026-05-18 |
| G4.3 | `[BEAM-CAPSULE-DECAY-IMPL]` | Formal SKIP per Q-G4.2-γ γ-1 LOCK + Q-G4.3-α α-1 LOCK + Q-G4.3-β β-1 LOCK + Q-G4.3-γ γ-1 LOCK + Q-G4.3-δ δ-3 LOCK at G4.3 mini-arc register substantively; separate SKIP commit canonical per G1.4 (`3505fde`) + G3.7 (`ee0b01b`) mini-arc SKIP precedents; G4.3 docs-only 3 MOD; no implementation landed; substrate-state proof of empty implementation scope: Q-G4.2-α α-2 deferred TTL + Q-G4.2-β β-2 deferred DecayType semantics + Q-G4-η η-1 no new audit literals + Q-G4-θ θ-1 SimilarityService untouched + Q-G4-κ κ-1 no Elixir decay + RULE 0 + Q-G4-ζ no auto-deletion | **G4.3 SKIPPED 2026-05-18** |
| G4.4 | `[BEAM-CAPSULE-DECAY-CLOSURE]` | Docs-only closure cascade; ADR-0044 Status Proposed → Accepted; optional ADR-0035 §9 back-citation + cluster expansion if Founder authorizes | forward-substrate |

Status flips from `Proposed 2026-05-18` to `Accepted 2026-05-1X` at
G4.4 closure cascade canonical at canonical-state register
substantively.

**Sub-arc 2 status field remains IN FLIGHT throughout G4.1-G4.4** per
Q-PR-δ + Q-PR-μ + Q-G4-α + Q-G4-μ LOCK. Sub-arc 2 closure cascade
forward-substrate pending Gap 4 (this mini-arc) + Gap 5 (ADR-0045
reserved) + optional Gap 6 (ADR-0046 reserved) + later Sub-arc 2
closure cascade per ADR-0041 CL.1 scope patch register substantively.
