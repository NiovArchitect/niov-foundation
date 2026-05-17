# NIOV Foundation — Current Build State

**Status:** Persistent canonical reference. Updated as build
progresses. Future Claude Code sessions should view this document
at session start to load current build state regardless of
conversation context loss.

**Last updated:** 2026-05-15 ([SUB-BOX-3-CLOSURE] minimum-touch
update per Sub-phase 7 Q-NEW-1 LOCKED Option α — adds the CAR
Sub-box 3 (REGULATOR + Lawful-Basis per ADR-0036) closure entry
canonical at substantive register substantively without
performing a broader staleness refresh. Substrate-honest scope:
Sub-box 1 + Sub-box 2 Phase 1 + Block B Phase 2 + ADRs 0023-0035
remain stale at this entry register; broader refresh forward-queued
as a separate substrate-honest mini-arc canonical at substantive
register substantively when substrate justifies. Prior `**Last
updated:**` was 2026-05-11 [DOCS-BUILD-STATE-REFRESH] post-Track A
+ RAA 12.8 canonicalization).

## CAR Sub-box 3 (REGULATOR + Lawful-Basis per ADR-0036): CLOSED 2026-05-15

CAR Sub-box 3 mini-arc CLOSED at sub-phase 7 `[SUB-BOX-3-CLOSURE]`
(this commit) per ADR-0036 §Implementation Detail. 7-sub-phase
lineage: `4981d3a → db6e0d7 → d0b5c64 → f9d0694 → 71af2c6 →
d6f9e18 → this commit`. ADR-0036 Status: Accepted. ADR-0036
Sub-decisions 1-8 all RESOLVED.

The REGULATOR principal class distinct from GOVERNMENT +
LawfulBasis Prisma model + LawfulBasisType enum (6 values:
SUBPOENA + REGULATORY_AUTHORITY + COURT_ORDER + DPA_REQUEST +
MLAT_REQUEST + CONSENT_OF_DATA_SUBJECT) + 3 AuditEvent event_type
literals (REGULATOR_ACCESS_GRANTED + REGULATOR_ACCESS_REVOKED +
REGULATOR_ACCESS_EXPIRED-reserved) + canonical_record/1 12 → 14
fields at TS + Elixir registers (positions 13 + 14 =
lawful_basis_id + lawful_basis_chain_hash) + LawfulBasis Elixir
mirror + 12 byte-equivalence fixture pairs + dual-control-gated
REGULATOR grant + revoke routes (can_admin_niov-tier;
PRIVILEGED_ENDPOINTS Operations C + D) + REGULATOR lawful-basis
enforcement at COSMP NEGOTIATE / readContent (TOCTOU re-check) /
SHARE / REVOKE entry points (per-request indexed point-lookups;
no global lock; no unbounded capsule scans; no capsule-content
authorization reads; no cross-request cache; revocation + expiry
fail-closed for new checks) all LANDED.

NO new SYSTEM_PRINCIPAL added (Sub-decision 8 RESOLVED at
sub-phase 5 commit body — Option β; SYSTEM_PRINCIPALS
frozen-anchor count remains 5). Patent-relevant per CAR §2.2
Family 1; extends US 12,164,537 (COSMP) + US 12,399,904 (DMW)
into regulatory-access territory.

CAR Sub-box 2 Jurisdiction Tagging remains QUEUED (distinct
substrate per ADR-0036 §Substrate-Honest Distinctions;
`Entity.jurisdiction` + `MemoryCapsule.jurisdiction` +
`AuditEvent.jurisdiction` + `OrgSettings.default_jurisdiction`
+ `assertJurisdictionalScope()` NOT landed). Whole-COSMP
high-concurrency orchestration substrate (BEAM/Broadway/GenStage
backpressure; per-capsule supervision; cross-DMW coordination
layer; per-DMW throughput controls; streaming capsule push/pull
semantics; billion-scale operation under live concurrent load)
remains architectural intent / forward-substrate per ADR-0028 +
the 6 BEAM-compatibility patterns from ADR-0026 §5; NOT
implemented at sub-phase 6 / 7.

Full sub-phase narrative + 12 forward-queued items + 5
substrate-build observations canonical at
`docs/reference/section-12-progress.md` Sub-box 3 row
substantively at substantive register substantively. Full
ADR-0036 §Post-Closure Implementation Lineage canonical at the
ADR register substantively per Q-NEW-4 LOCKED Option α at
sub-phase 7.

---

## CAR Sub-box 2 (Jurisdiction Tagging per ADR-0037): CLOSED 2026-05-15

CAR Sub-box 2 mini-arc CLOSED at sub-phase 6 `[CAR-SUB-BOX-2-CLOSURE]`
(this commit) per ADR-0037 §Implementation Detail. 6-sub-phase
lineage: `c72fabd → 93f96ec → 3fab20d → 6efdf44 → 7faf2ac → this
commit`. ADR-0037 Status: Accepted. ADR-0037 Sub-decisions 1-9 all
RESOLVED.

The data-tier jurisdiction-tagging substrate for CAR §1.6 Regional /
Sovereignty Boundaries + §2.4 Jurisdictional Scope LANDED:
`Entity.jurisdiction` + `MemoryCapsule.jurisdiction` +
`AuditEvent.jurisdiction` + `OrgSettings.default_jurisdiction`
schema fields (all `String?` nullable) + 3 B-tree indexes (entities
+ memory_capsules + audit_events) + `assertJurisdictionalScope`
pure-function helper at
`apps/api/src/services/cosmp/jurisdiction-enforcement.ts` +
service-tier defaulting cascade at `createEntity` (passthrough) +
`createCapsule` (owner Entity cascade) + `writeAuditEvent` (row
metadata passthrough) + COSMP enforcement at NEGOTIATE start-check
(before owner shortcut) + readContent TOCTOU re-check (before
content load) + SHARE per-capsule + REVOKE bounded-bridge fetch +
per-capsule + WRITE create-time cascade + WRITE update-time
actor↔existing capsule jurisdiction enforcement + REGULATOR
`LawfulBasis.jurisdiction_invoked` ↔ `MemoryCapsule.jurisdiction`
match via basis-authoritative actor substitution (with null-capsule
backward-compat guard preserving Sub-phase 3/4 null/null
boundary).

Preserved substrate-coherence boundaries: AuditEvent.jurisdiction
remains row metadata only (NOT in canonical_record/1);
canonical_record/1 remains 14 fields; Elixir audit-chain UNCHANGED;
12 fixture pairs UNCHANGED; cosmp_router default tier 137/0
PRESERVED.

Test substrate at closure: TypeScript baseline 12 preserved; unit
tier 508/508; integration tier 198 + 1 skipped (171 baseline + 20
sub-phase 4 jurisdiction-COSMP-enforcement + 7 sub-phase 5 REGULATOR
Section I); cosmp_router default tier 137/0; CI green at every
sub-phase landing.

Downstream CAR Sub-boxes dependency-unblocked at substrate-state
ground truth register substantively: Sub-box 4 (DecisionRecord +
DataSubjectReference + Agent Attestation); Sub-box 5
(jurisdiction-aware deletion variants + GDPR Article 17
pseudonymization); Sub-box 8 (Cross-Tenant Compliance Benchmarking
+ meta-jurisdiction aggregates); Sub-box 9 (Capsule Compliance
Provenance).

5 substrate-build observations forward-queued in commit-body-only
register per Q-NEW-9 LOCKED at sub-phase 1 + subsequent sub-phase
LOCKs (D-SCHEMA-DEFAULT-CONSTANT-COHERENCE-DRIFT +
D-INTERNAL-HELPER-UNIT-TEST-IMPORT-CONVENTION +
D-COSMP-METADATA-SELECT-CLAUSE-DRIFT +
D-REGULATOR-ACTOR-JURISDICTION-POLICY-DECISION +
D-REGULATOR-NULL-CAPSULE-BACKWARD-COMPAT-BOUNDARY); NOT promoted to
ADR-0035 §9 numbered cluster.

Forward-queued items preserved per ADR-0037 §Forward Queue: physical
data residency enforcement; legal transfer determination engine
(Schrems II / GDPR Article 44-50); real-time country/legal rules
engine; cross-region capsule transfer workflow; multi-jurisdiction
capsule support; canonical_record/1 jurisdiction binding
(cryptographic) if future evidence justifies; Cross-Tenant
Compliance Benchmarking patent-relevance analysis per CAR §1.6
forward path; AuditEvent.jurisdiction automatic operation-context
propagation refinement; GLOBAL wildcard / jurisdiction vocabulary
lock; grantee↔capsule or grantee↔actor jurisdiction checks for
SHARE if future policy requires; full `getCapsuleMetadata`
projection repair.

NOT claimed: legal compliance certification; physical data residency
enforcement; full FedRAMP / CMMC / GDPR certification; legal
transfer determination; real-time country/legal rules engine;
multi-jurisdiction capsule support; cross-region transfer
workflow; canonical_record/1 jurisdiction binding (cryptographic);
per-target LawfulBasis binding; grantee jurisdiction checks at
SHARE; GLOBAL wildcard; Sub-boxes 4 / 5 / 8 / 9 implementation;
full DMW-to-DMW orchestration; BEAM/Broadway high-volume
orchestration in this mini-arc; Federation Cloud monetization;
external PKI / EU eIDAS / national registry integration; direct
patent relevance. Patent relevance: NONE directly per CAR §1.6
verbatim ("region tagging is conventional").

Full sub-phase narrative + verification matrix + downstream
unblocked statement canonical at
`docs/reference/section-12-progress.md` CAR Sub-box 2 row
substantively at substantive register substantively. Full ADR-0037
§Post-Closure Implementation Lineage canonical at the ADR register
substantively per Q-NEW-2 LOCKED Option α at sub-phase 6.

---

## Phase 3: Dynamic Memory Accuracy at Scale -- Sub-Arc 1 Sub-Phase a (DMWWorker per ADR-0038): CLOSED 2026-05-15

Phase 3 (Dynamic Memory Accuracy at Scale) sub-arc 1 sub-phase a
Commit 1 of 3 LANDED at this commit per SYNTHESIS-SUB-PHASE-A-
DECOMPOSITION. ADR-0038 NEW (DMW Worker per-DMW Supervised Process;
Status Proposed 2026-05-15) lands the substrate-architectural
canonical for the DMWWorker GenServer module that uses the BEAM
scaffolding LANDED at sub-phases 8-11 (:pg + Registry +
DynamicSupervisor + Cluster.Supervisor + Phoenix.PubSub +
Phoenix.Tracker + Telemetry).

8 sub-decisions all locked at α-default per Q-A through Q-G:

- Sub-decision 1: module location at
  `apps/dbgi_supervisor/lib/dbgi_supervisor/dmw_worker.ex`.
- Sub-decision 2: identity addressing by entity_id via
  `{:via, Registry, {DbgiSupervisor.Registry, entity_id}}` Registry
  key + `"dmw:#{entity_id}"` Phoenix.Tracker topic.
- Sub-decision 3: tier dispatch axis on WalletType 3-tier
  (PERSONAL + ENTERPRISE + DEVICE) right-sized for sub-phase a.
- Sub-decision 4: lifecycle pattern lazy-spawn on first COSMP
  operation against the wallet's entity_id (consumer-tier-cost
  framing preserved; idle wallets cost nothing at memory-footprint
  register).
- Sub-decision 5: state stateless plus Phoenix.Tracker presence only
  at sub-phase a (ETS cache substrate forward-substrate).
- Sub-decision 6: DMWWorker vs cosmp_router relationship
  separate-layer (DMWWorker runs dbgi-tier lifecycle and
  coordination substrate; cosmp_router stays as single-GenServer
  COSMP-op dispatcher at sub-phase a; re-wire forward-substrate to
  sub-arc 1 sub-phase b and beyond).
- Sub-decision 7: 6 BEAM-compatibility patterns from ADR-0026 §5
  preserved by construction.
- Sub-decision 8: testability per ADR-0034 (name-configurable
  substrate + start_supervised! patterns; tests exercise spawn via
  DynamicSupervisor + Registry lookup + Phoenix.Tracker presence on
  init + presence absence on terminate + tier-differentiated
  behavior + parallel DMWWorkers for distinct entity_ids +
  stop-then-restart resilience).

Hybrid hot/cold framing canonical at substantive register:
ENTERPRISE wallets run always-hot per-DMW supervised process +
PERSONAL and AI_AGENT wallets promote-on-activity from cold shard
substrate to hot per-DMW substrate + DEVICE wallets run always-cold
shard-mapped substrate.

ADR-0028 §Forward Queue NEW append-only LANDED sub-paragraph
(sub-arc 1 sub-phase a closure update; preserves existing sub-phase
13 LANDED sub-paragraph unchanged at chronology-preservation
register) marks per-capsule supervised Elixir process forward-queue
item as substantively progressed at per-DMW granularity per
ADR-0038. Per-capsule granularity at finer-grained register and
remaining forward-looking items (OtzarComm message routing at
scale; Python ML substrate; multi-region production topology;
migration triggers; `:gproc` backward-compatibility;
partition-tolerance expansion) remain forward-substrate.

ADR-0028 §Bidirectional citations (cited from) NEW entry (RULE 14
back-citation) appends to existing sub-block at lines 250+ matching
the existing entry format (bulleted with em-dash separator at
ADR-substrate canonical-coherence register; ADR-0028 pre-existing
em-dash convention preserved at chronology-preservation register).

3-commit decomposition per SYNTHESIS-SUB-PHASE-A-DECOMPOSITION:

- Commit 1 `[BEAM-DBGI-DMWWORKER-ADR]` (this commit) -- docs-only
  ADR-0038 NEW + ADR-0028 amendments + catalog refreshes.
- Commit 2 `[BEAM-DBGI-DMWWORKER-CODE]` (forward-substrate) --
  substantive code at canonical-execution register substantively:
  NEW `apps/dbgi_supervisor/lib/dbgi_supervisor/dmw_worker.ex` +
  DynamicSupervisor wiring + Registry integration + Phoenix.Tracker
  integration + tier dispatch + tests at
  `apps/dbgi_supervisor/test/dbgi_supervisor/dmw_worker_test.exs`.
- Commit 3 `[BEAM-DBGI-DMWWORKER-CLOSURE]` (forward-substrate) --
  docs-only closure cascade: ADR-0038 Status Proposed → Accepted +
  NEW Post-Closure Implementation Lineage section + this section
  CLOSED + section-12-progress.md row CLOSED + architecture/README
  + CLAUDE.md ADR catalog ADR-0038 entry refresh + ADR-0028 second
  amendment if any.

Substrate-state ground truth register: sub-phase a delivers the
per-DMW supervised process substrate that the scaffolding has been
wired for. cosmp_router re-wire forward-substrate to sub-arc 1
sub-phase b and beyond; the architectural target named in the
README and monetization essay (hundreds to thousands of parallel
COSMP operations for the workloads that need it) does not deliver
at runtime until sub-arc 1 sub-phase b and beyond complete.

7 substrate-build observations forward-queued at commit-body-only
register substantively per Option β substrate-honest discipline:
D-AUTHORIZATION-PASTE-PROSE-VS-SCOPE-DISTINCTION +
D-ADR-CATALOG-ENTRY-CHRONOLOGY-RESIDUAL +
D-PUSH-RECONCILIATION-MID-COMMIT +
D-OPERATOR-CORRECTION-EXTENSION-DISCIPLINE +
D-OPERATOR-FRAMING-REALIGNMENT-DISCIPLINE +
D-SUBSTANTIVE-CASCADE-PROSE-DRIFT +
D-ADR-AMENDMENT-PATTERN-VARIANCE-DISCIPLINE (NEW canonical at this
commit). NOT promoted to ADR-0035 §9 numbered cluster.

Full sub-phase narrative + substrate-architectural framing
canonical at `docs/architecture/decisions/0038-dmw-worker-per-dmw-supervised-process.md`
ADR register substantively. Full section-12-progress.md row
canonical at `docs/reference/section-12-progress.md` Phase 3 row
substantively at substantive register.

## Sub-Arc 1 Sub-Phase a closure update (2026-05-15)

3-commit decomposition LANDED. ADR-0038 Status: Proposed -> Accepted
at this commit. All 8 sub-decisions RESOLVED.

**3-commit mini-arc lineage:**

- Commit 1 `[BEAM-DBGI-DMWWORKER-ADR]` `3b431bf` (docs-only)
- Commit 2 `[BEAM-DBGI-DMWWORKER-CODE]` `56e0eaa` (substantive code:
  DMWWorker module 160 lines + public API +93 lines + 13 tests
  171 lines)
- Commit 3 `[BEAM-DBGI-DMWWORKER-CLOSURE]` this commit (docs-only
  closure cascade)

**Verification matrix at closure:**

- Elixir compile clean
- DMWWorker targeted tests 13/0
- Full dbgi_supervisor default tier 55/0 (42 baseline preserved)
- CI green at Commits 1 + 2

**Substrate-state ground truth at sub-phase a closure:**

DMWWorker substrate is canonical at runtime register. Per-DMW
supervised process substrate that the BEAM scaffolding has been wired
for now exists at runtime. The architectural target named in the
README and monetization essay (hundreds to thousands of parallel
COSMP operations per DMW for the workloads that need it) does NOT
yet deliver at runtime because cosmp_router single-GenServer pattern
remains the serialization bottleneck.

**Forward-substrate to sub-arc 1 sub-phase b:**

cosmp_router re-wire to dispatch through per-entity DMWWorkers +
ENTERPRISE always-hot per-DMW process pool + PERSONAL/AI_AGENT
promote-on-activity tier promotion substrate + DEVICE cold-shard
mapping with K=128-1024 consistent-hash shards.

## Phase 3: Dynamic Memory Accuracy at Scale -- Sub-Arc 1 Sub-Phase c (PERSONAL Promote-on-Activity per ADR-0039 Amendment 1): CLOSED 2026-05-17

Sub-arc 1 sub-phase c mini-arc CLOSED at HEAD parent `b7fa258` (C.4) +
this C.5 closure commit canonical at canonical-state register
substantively per ADR-0039 Amendment 1 canonical at canonical-prose
register substantively per ADR-0011 §Amendment canonical convention.
5-commit mini-arc decomposition canonical at operator decision register
substantively canonical at patent-implementation evidence register
substantively per ADR-0020 two-register IP discipline canonical.

**Substrate-state ground truth at closure register substantively:**

- PERSONAL promote-on-activity substrate canonical at canonical-
  execution register substantively. PERSONAL entities promote to per-
  DMW DMWWorker via Horde Registry canonical at canonical-execution
  register substantively when ActivityCounter threshold crossed (default
  5 activities canonical at canonical-state register substantively per
  ADR-0034 testability discipline canonical).
- Idle eviction periodic task canonical at canonical-execution register
  substantively releases DMWWorker resources canonical at canonical-
  state register substantively when entity inactivity exceeds configured
  idle TTL (default 5 minutes canonical at canonical-state register
  substantively).
- DEVICE tier preserves sub-phase a Router fallback canonical at
  backward-compat register substantively per ADR-0038 Sub-decision 3
  tier 3 register substantively (forward-substrate to sub-phase d cold-
  shard substrate canonical at canonical-architectural register
  substantively).
- AI_AGENT disposition forward-substrate at sub-arc 2 capsule layer
  canonical at canonical-coherence register substantively per
  D-AI-AGENT-ENTITY-TYPE-vs-WALLET-TYPE-DISCRIMINATION-DRIFT observation
  canonical at C.3 commit body register substantively (AI_AGENT
  canonical at EntityType register substantively per ADR-0033 cross-
  language data ownership register substantively NOT WalletType
  register; Prisma WalletType enum enumerates PERSONAL + ENTERPRISE +
  DEVICE only canonical at canonical-coherence register substantively;
  DbgiSupervisor.start_dmw_worker_horde/3 guard rejects :ai_agent at
  substrate-state register substantively).
- Test surface: cosmp_router 196/0 + 1 skipped (172 baseline at B.7 +
  11 NEW ActivityCounter at C.1 + 11 NEW eviction at C.2 + 6 NEW
  promote_on_activity at C.3 absolute reconciled per actual count) +
  dbgi_supervisor 67/0 default (19 excluded) + 86/0 integration
  baseline preserved at canonical-coherence register substantively
  (C.4 + C.5 docs-only commits register substantively).
- ADR-0039 Amendment 1 canonical at canonical-prose register
  substantively (H2 Amendment subsection per ADR-0011 canonical
  precedent at canonical-knowledge register substantively; preserves
  Accepted §Sub-decision 8 body audit trail at canonical-honest
  register substantively per ADR-0020 two-register IP discipline
  canonical).
- ADR-0035 cluster expansion 26th + 27th observations promoted at this
  closure commit canonical at substrate-architectural register
  substantively (26th: D-SUPERVISION-TREE-EXPANSION-TEST-COHERENCE-
  DRIFT recurrence-3 across B.3 redraft + B.5 + C.1 supervision tree
  expansion; 27th: D-PASTE-AUTHORING-FAILED-TO-GREP-CANONICAL-STATE-
  BEFORE-PREMISE-LOCK recurrence-6 across RULE 21 promotion paste +
  stop_dmw_worker_horde + carried context + D-DEVICE-SKIPS-PROMOTE-
  CHECK + ADR-0039 H3-vs-H2 amendment structural assumption + C.5
  path discovery).

**Forward-substrate canonical at canonical-state register
substantively:**

- Sub-arc 1 sub-phase d: DEVICE cold-shard substrate canonical at
  canonical-state register substantively (always-cold shard-mapped per
  ADR-0038 Sub-decision 3 tier 3 register substantively; K=128-1024
  consistent-hash shards forward-substrate at substrate-architectural
  register substantively).
- Sub-arc 2: capsule layer Gaps 1+3+4+5 (ADD/UPDATE/MERGE/NOOP mutation
  discrimination + pgvector embedding + decay execution + staleness
  detection + weighting architecture per Entry #28; AI_AGENT EntityType-
  discriminated dispatch substrate canonical at canonical-coherence
  register substantively forward-substrate at this register
  substantively).
- Sub-arc 3: benchmark + bi-temporal + tier automation canonical at
  canonical-state register substantively.

References canonical at canonical-coherence register substantively:
ADR-0039 (Accepted at B.7 closure register substantively per `3242c17`
+ Amendment 1 canonical at this mini-arc register substantively per
C.4 `b7fa258`); ADR-0011 (Amendment precedent canonical at canonical-
prose register substantively per H2 Amendment subsection convention);
ADR-0020 (two-register IP discipline canonical at canonical-
architectural register substantively); ADR-0033 (cross-language data
ownership; EntityType vs WalletType canonical at canonical-knowledge
register substantively); ADR-0034 (BEAM testability discipline);
ADR-0035 (substrate-build discipline; sub-arc 1 sub-phase c cluster
expansion 26th + 27th observations canonical at substrate-architectural
register substantively at this C.5 closure commit register
substantively); ADR-0038 (DMWWorker substrate canonical at sub-phase a
runtime register substantively); RULE 11 (Elixir/BEAM iteration-loop
research); RULE 13 (substrate-honest pre-flight surface); RULE 20
(founder authorization); RULE 21 (pre-authorization research arc
canonical per `67f6112` commit).

---

## Phase 3: Dynamic Memory Accuracy at Scale -- Sub-Arc 1 Sub-Phase b (Hive-Scale Per-DMW Dispatch ENTERPRISE per ADR-0039): CLOSED 2026-05-17

Sub-arc 1 sub-phase b mini-arc CLOSED at HEAD parent `3242c17` (B.6.3)
+ this B.7 closure commit canonical at canonical-state register
substantively per ADR-0039 §Post-Closure Implementation Lineage
canonical. 10 substantive commits + 1 revert + 1 redraft + 1 RULE 21
promotion mid-arc canonical at patent-implementation evidence register
substantively per ADR-0020 two-register IP discipline canonical.

**Substrate-state ground truth at closure register substantively:**

- Hive-scale per-DMW dispatch substrate for ENTERPRISE wallets
  canonical at runtime register substantively. The architectural
  target named at README + monetization essay register substantively
  delivers at runtime for ENTERPRISE tier canonical at canonical-
  execution register substantively.
- PERSONAL + DEVICE tier fallback to CosmpRouter.Router canonical at
  sub-phase a substrate register substantively.
- Test surface: cosmp_router 172/0 + 1 skipped (166 baseline + 6 NEW
  tier_routed_dispatch); dbgi_supervisor 63/0 default + 82/0
  integration.
- Cycle breakage canonical at canonical-architectural register
  substantively per Option ζ Adapter Pattern (cosmp_router ->
  dbgi_supervisor compile-time in_umbrella + runtime
  extra_applications; dbgi_supervisor -> cosmp_router NO compile-time
  dep; runtime via Application.get_env).
- RULE 21 promoted to canonical at CLAUDE.md register substantively
  mid-arc (commit `67f6112`); pre-authorization research arc
  discipline canonical at canonical-rule register substantively for
  forward-substrate substrate-architectural pastes.

**Forward-substrate canonical at canonical-state register
substantively:**

- Sub-arc 1 sub-phase c: PERSONAL + AI_AGENT promote-on-activity
  substrate canonical at canonical-state register substantively
  (tier promotion from cold shard substrate to per-DMW canonical at
  ENTERPRISE register substantively when activity threshold crossed).
- Sub-arc 1 sub-phase d: DEVICE cold-shard substrate canonical at
  canonical-state register substantively (always-cold shard-mapped
  per ADR-0038 Sub-decision 3 tier 3 register substantively).
- Sub-arc 2: capsule layer Gaps 1+3+4+5 (ADD/UPDATE/MERGE/NOOP
  mutation discrimination + pgvector embedding + decay execution +
  staleness detection + weighting architecture per Entry #28).
- Sub-arc 3: benchmark + bi-temporal + tier automation canonical at
  canonical-state register substantively.

References canonical at canonical-coherence register substantively:
ADR-0039 (Accepted at this commit register substantively); ADR-0033
(cross-language data ownership); ADR-0034 (BEAM testability
discipline); ADR-0035 (substrate-build discipline; sub-arc 1
sub-phase b cluster expansion 25th observation per RULE 21 promotion
commit); ADR-0038 (DMWWorker substrate canonical at sub-phase a
runtime register); RULE 11 (Elixir/BEAM iteration-loop research);
RULE 20 (founder authorization); RULE 21 (pre-authorization research
arc canonical per `67f6112` commit).

---

## Phase 3: Dynamic Memory Accuracy at Scale -- Sub-Arc 1 Sub-Phase b (Hive-Scale Per-DMW Dispatch ENTERPRISE per ADR-0039): IN FLIGHT 2026-05-16

Phase 3 (Dynamic Memory Accuracy at Scale) sub-arc 1 sub-phase b
Commit 1 of 7 LANDED at this commit per ADR-0039 §Decision
Sub-decision 9 7-commit mini-arc decomposition. ADR-0039 NEW (Hive-
Scale Per-DMW Dispatch Substrate for ENTERPRISE Wallets; Status
Proposed 2026-05-16) lands the substrate-architectural canonical for
hive-scale per-DMW dispatch substrate that delivers per-DMW
parallelism at hive scale at runtime for ENTERPRISE wallets at
sub-phase b closure.

13 sub-decisions all locked at α-default per Q-A through Q-G at
canonical-knowledge register substantively informed by 5 rounds of
research at canonical Elixir/BEAM register substantively:

- Sub-decision 1: per-DMW GenServer via Horde Registry + Horde
  DynamicSupervisor (Discord precedent; CRDT-based distributed
  Registry + handoff on node failure).
- Sub-decision 2: cosmp_router pure-module refactor at single-source-
  of-truth register (NEW `CosmpRouter.Operations` module; Elixir
  anti-pattern resolution).
- Sub-decision 3: DMWWorker COSMP op handlers invoking
  `CosmpRouter.Operations` primitives at module-level register.
- Sub-decision 4: NEW `CosmpRouter.WalletLookup` module (per-request
  indexed point-lookup inherited from ADR-0036).
- Sub-decision 5: NEW ETS read-optimized cache at
  `apps/cosmp_router/lib/cosmp_router/wallet_cache.ex`
  (read_concurrency + write_concurrency + decentralized_counters).
- Sub-decision 6: COSMP protobuf envelope extension with optional
  entity_id field across 7 op request messages.
- Sub-decision 7: tier-routed dispatch shim at `grpc/server.ex`
  (ENTERPRISE through DMWWorker via Horde Registry;
  PERSONAL/AI_AGENT/DEVICE through cosmp_router unchanged).
- Sub-decision 8: ENTERPRISE-only scope at sub-phase b register.
- Sub-decision 9: 7-commit mini-arc decomposition.
- Sub-decision 10: 6 BEAM-compatibility patterns from ADR-0026 §5
  preserved by construction.
- Sub-decision 11: Elixir anti-pattern compliance at canonical-
  knowledge register.
- Sub-decision 12: testability per ADR-0034.
- Sub-decision 13: patent-implementation evidence at canonical
  decision register.

7-commit decomposition per ADR-0039 §Decision Sub-decision 9:

- Commit B.1 `[BEAM-DBGI-HIVE-DISPATCH-ADR]` (this commit) --
  docs-only ADR-0039 NEW + ADR-0028 amendments + catalog refreshes.
- Commit B.2 `[BEAM-COSMP-OPERATIONS-PURE-MODULE]` (forward-substrate)
  -- NEW `apps/cosmp_router/lib/cosmp_router/operations.ex` + MOD
  `apps/cosmp_router/lib/cosmp_router/router.ex` + NEW unit tests.
- Commit B.3 `[BEAM-DBGI-HORDE-SUBSTRATE]` (forward-substrate) --
  NEW Horde Registry + Horde DynamicSupervisor supervised children
  at DbgiSupervisor + Horde dependency at mix.exs + NEW public API +
  NEW unit tests.
- Commit B.4 `[BEAM-DBGI-WALLET-LOOKUP-CODE]` (forward-substrate) --
  NEW `apps/cosmp_router/lib/cosmp_router/wallet_lookup.ex` + NEW
  unit tests.
- Commit B.5 `[BEAM-DBGI-WALLET-CACHE-ETS]` (forward-substrate) --
  NEW `apps/cosmp_router/lib/cosmp_router/wallet_cache.ex` +
  supervised ETS table + NEW unit tests.
- Commit B.6 `[BEAM-DBGI-HIVE-DISPATCH-INTEGRATION]`
  (forward-substrate) -- MOD `apps/cosmp_router/proto/cosmp.proto` +
  MOD `apps/api/src/services/cosmp-client.ts` + MOD
  `apps/dbgi_supervisor/lib/dbgi_supervisor/dmw_worker.ex` with 7
  COSMP op handle_call clauses + MOD
  `apps/cosmp_router/lib/cosmp_router/grpc/server.ex` with tier-
  routed dispatch shim + NEW integration tests.
- Commit B.7 `[BEAM-DBGI-HIVE-DISPATCH-CLOSURE]` (forward-substrate)
  -- docs-only closure cascade.

Substrate-state ground truth register: sub-phase b mini-arc IN
FLIGHT at this commit; cosmp_router single-GenServer pattern at HEAD
866e328 substantively refactors at Commit B.2 register to pure-
module primitives at single-source-of-truth register; per-DMW
parallelism at hive scale for ENTERPRISE tier delivers at runtime
at Commit B.6 closure register; sub-phase b mini-arc closes at
Commit B.7 closure cascade. Phoenix.PubSub hive fanout substrate +
Broadway pipeline at high-throughput register + hive algorithm at
weighting architecture per Entry #28 substantively forward-substrate
at sub-phase c + sub-phase d + sub-arc 2 register substantively at
canonical-state register substantively.

---

## Section 1 — One-paragraph summary

NIOV Foundation is the **AI Memory Governance Substrate** — the
patented infrastructure layer between language models and enterprise
institutional memory. The **Contextual Orchestration and Scoped
Memory Protocol (COSMP)** governs seven primitive operations on AI
memory; the **Decentralized Memory Wallet (DMW)** holds that memory
as cryptographically-governed capsules owned by the enterprise.
Foundation is **deployment-target agnostic** (managed cloud,
sovereign cloud, on-premise, air-gapped) per ADR-0018, **post-quantum-
ready by primitive selection** per ADR-0019, and runs underneath
**Otzar** (the first canonical application) and any future
enterprise or government applications. Three issued US patents
protect the architecture: **12,164,537** (Dec 2024), **12,399,904**
(Aug 2025), **12,517,919** (Jan 2026).

---

## Section 2 — Authoritative document hierarchy

| Document | Authority |
|---|---|
| ADRs 0001-0022 (`docs/architecture/decisions/`) | **CANONICAL** for architectural decisions |
| `origin/main` code | **CANONICAL** for substrate state |
| `CLAUDE.md` (repo root) | **CANONICAL** operator-facing reference |
| `docs/CURRENT_BUILD_STATE.md` (this document) | **CANONICAL** persistent build state |
| Patched S9-S17 Build Guide | **AUTHORITATIVE** for §9-§17 scope |
| Section 12 standalone Build Guide | **AUTHORITATIVE** for Section 12 sub-section management |
| `docs/reconciliation/2026-05-08-build-reconciliation.md` | **POINT-IN-TIME EVIDENCE** of authoritative hierarchy establishment |
| Original 12-section Foundation MVP Build Guide | **HISTORICAL ARTIFACT**; superseded |
| Strategic positioning docs (Manifesto, team memo, Homepage Copy) | **AUTHORITATIVE** for positioning |
| Otzar PRD | **PARTIALLY SUPERSEDED**; see reconciliation §6 |

---

## Section 3 — Build state by section

| § | Title | Status |
|---|---|---|
| 1 | Data Foundations | ✓ COMPLETE |
| 2 | Authentication | ✓ COMPLETE |
| 3 | COSMP Protocol | ✓ COMPLETE |
| 4 | COE | ✓ COMPLETE |
| 5 | Hive Intelligence | ✓ COMPLETE |
| 6 | Monetization Engine | ✓ COMPLETE |
| 7 | Compliance Router | ✓ COMPLETE |
| 8 | API Gateway | ✓ COMPLETE |
| 9 | Foundation Governance + Dandelion + Domain Seeding | ✓ CLOSED at `4027208` |
| 10 | Seven Feedback Loops | ✓ CLOSED at `298c0ad` |
| 11 | Otzar Conversation + Context Priming + Observation | ✓ CLOSED at `6b43bbd` |
| 12 | Control Tower Connection | **IN FLIGHT** (see Section 4) |
| 13 | Final Testing + Investor Demo | NOT STARTED |
| 14 | Autonomous Execution + Proactive Behaviors | NOT STARTED |
| 15 | Enterprise Hardening + Compliance | NOT STARTED |
| 16 | Otzar Product Completeness | NOT STARTED |
| 17 | Intelligence Engine — Full 6-Layer Stack | NOT STARTED |

**Cross-cutting substrate-architecture canonicalization work
(not numbered Sections; substrate-architecture register):**

- **Track A (test infrastructure isolation; 18 gates + REVISED
  Gate 2):** SUBSTANTIVELY COMPLETE on origin/main. Gate 1
  architectural lock `d728cd4` (2026-05-06) → Gate 8e `e829644`
  → Gate 8c `bea1b33` → Gate 8d `2fc025a` → Gate 9 `c399980` →
  Gate 8f `47d8596` → Gate 8h `c1b3d02` → Gate 10 `b1c02d4`
  (@v6/@v7 toolchain) → Gate 8g `95f4aca` (bcrypt 5→6) →
  TRACK-A-RULE-19 `75a90de` (ADR-0020 + RULE 19 canonicalization)
  → REVISED Gate 2 `5be42e5` (Colima canonicalization; ADR-0013
  amendment per RULE 13 substrate-state drift correction).
- **RAA 12.8 substrate-architecture canonicalization (14-commit
  chain; Sections 1-10 enumerated):** COMPLETE on origin/main.
  Outline `10ef10f` → §1 `78e376a` → §2 `a2335cd` → §3 `582216e`
  → §4 `271e9cc` → §5 `5eb3f49` → §6 `2148bfe` → §7 `1fa1c12` →
  §5.8 amendment chain (`604aac6` + `2cced88` + `127a383`) → §8
  `00d86a1` → §9 `7bb52a6` → §10 `e31f948` (canonical record
  closure per §9.6 Step 2D-completion handoff discipline).
- **Pre-RAA-12.8 ADR cluster (3 commits; 2026-05-10):**
  [GLOSSARY-G-3] `74b2765` + ADR-0021 `ba3ef11` (Capsule Type
  Extension Protocol) + ADR-0022 `3c2eb99` (combined_score
  Formula Canonicalization).

---

## Section 4 — Section 12 sub-section status

Per Section 12 standalone Build Guide.

| Sub-§ | Title | Status |
|---|---|---|
| 12A | Scaffolding · Auth · 16-screen layout | ✓ CLOSED — otzar-control-tower @ `b08881b` (4 tests) |
| 12B.0 | Foundation: audit_event_id surfacing | ✓ CLOSED — niov-foundation @ `6151812` (439 + 1 skipped) |
| 12B.1 | Frontend foundation lock-in | ✓ CLOSED — otzar-control-tower @ `9140220` (6 tests) |
| 12B.2 | Home extension + Users + Invite Wizard | ✓ CLOSED — otzar-control-tower @ `16bd02d` (8 tests) |
| 12B.3 | AI Teammates screen | ✓ CLOSED — otzar-control-tower @ `b4f17e2` (10 tests) |
| 12B.4 | Access Control matrix · 12B close | ✓ CLOSED — otzar-control-tower @ `0a28f90` (12 tests) |
| 12C | Playground · Intelligence dashboard | **→ BUILD NEXT** (target 14 tests + Foundation extensions) |
| 12D | Data & Knowledge · Security & Audit · Analytics · Conversations · Workflows | → BUILD (target 17 tests + Foundation extensions) |
| 12E | Policies · System Health · Settings | → BUILD (target 19 tests + Foundation extensions) |
| 12F | Onboarding wizard · Documentation · a11y · Playwright · Section 12 close | → BUILD (target ~22 tests) |

**otzar-control-tower HEAD:** `0a28f90` (closes 12B).
**niov-foundation HEAD:** `5be42e5` ([TRACK-A-G2] Gate 2
REVISED — Colima canonicalization).

**Section 12.5 sub-box framing (per `docs/reference/section-12-
progress.md`):**

| 12.5 Sub-box | Status | Description |
|---|---|---|
| 12.5 Sub-box 1 (EscalationRequest + dual-control) | **UNBLOCKED** | Foundation primitive previously blocking Bucket B; Track A complete; **Phase 2 primary engineering scope candidate**. Substrate-architecture coverage at RAA 12.8 §5.2 + §5.9 item 1 (D-2D-D10 closure) + Section 14 admin-tooling box (TODO comment framing at `apps/api/src/services/otzar/priming.ts:131-134`). |
| 12.5 Sub-box 2-9 | QUEUED | Dependency-ordered post Sub-box 1 (Sub-box 2 privileged action audit chain + Sub-box 5 GDPR Article 17 pseudonymization + Sub-box 7 verifiable-credentials + compliance attestation). |

Sub-box 1 = D-2D-D10 closure = unified engineering territory
at intersection of 4 framing registers (RAA 12.8 §5.2 + Section
12.5 Sub-box 1 + §5.9 item 1 + Section 14 admin-tooling box).
Single substantive engineering scope per Phase 2 today's
selection.

---

## Section 5 — Track A gate inventory

**Closed gates:**

| Gate | SHA |
|---|---|
| Track A Lock (ADRs 0011/0012/0013) | `d728cd4` |
| Gate 3a (Containerized Postgres) | `081d35e` |
| Gate 3 ADR (ADR-0014 supersedes ADR-0012) | `2a14dec` |
| Gate 3b (FixtureBasedLLMProvider + 10 fixtures) | `16b4482` |
| Gate 4 (Tier configs + npm scripts) | `925761d` |
| Gate 5a (Foundational substrate) | `c5c8b00` |
| Gate 5b (Consumer adoption + 3-tier verification) | `9260c53` |
| G5b-I Resolution | `fbc7942` |
| Gate 6 (Reproducibility verification; ADR-0011 amendment) | `cae8cf4` |
| Gate 7-pre | `e8a559e` |
| Gate 7 (CI workflow architecture; ADR-0015) | `78cf1b5` |
| Gate 7-post (Drift G7-E fix) | `9f8e909` |
| Gate 7-post-2 (Drift G7-PRE-C fix) | `2fbc057` |
| ADR-0016 (Pin-and-Optimize Framework) | `782154c` |
| ADR-0017 (Production Discipline) | `444cf56` |
| Gate 8a (ADR cross-citation back-references) | `3febf83` |
| Gate 8b (CLAUDE.md update) | `3a571fb` |
| ADR-0018 (Deployment-Target Agnosticism Posture) | `657a794` |
| ADR-0019 (Cryptographic-Suite Posture) | `7216784` |
| DOCS-ALIGN (FIPS_DEPLOYMENT_POSTURE.md) | `38d941f` |
| Gate 8b-amendment | `7269a7a` |
| Gate 8e (ADR-0016 amendment) | `e829644` |
| BUILD-RECONCILIATION + CANONICAL-REFERENCE | `95ad861` |
| Gate 8c (testing.md + onboarding.md) | `bea1b33` |
| Gate 8d (algorithm-literal cleanup) | `2fc025a` |
| RAA 12.7 (Dynamic Flow Architecture) | `0fd8da7` |
| Gate 9 (architectural framing integration) | `c399980` |
| Gate 8f (fast-uri 3.1.0→3.1.2 npm overrides) | `47d8596` |
| Gate 8h (canonical reference refresh) | `c1b3d02` |
| Gate 10 (GitHub Actions toolchain @v6/@v7) | `b1c02d4` |
| Gate 8g (bcrypt 5→6 closes 8x cluster) | `95f4aca` |
| TRACK-A-RULE-19 (ADR-0020 + RULE 19 canonicalization) | `75a90de` |
| GLOSSARY-G-3 (32 canonical-grade vocab entries) | `74b2765` |
| ADR-0021 (Capsule Type Extension Protocol) | `ba3ef11` |
| ADR-0022 (combined_score Formula Canonicalization) | `3c2eb99` |
| RAA 12.8 Outline (Three surfaces; four corrections folded) | `10ef10f` |
| RAA 12.8 §1 (three canonical framings) | `78e376a` |
| RAA 12.8 §2 (lateral class introduction; 6 lateral zones) | `a2335cd` |
| RAA 12.8 §3 (Surface 1 Scale Architecture; D-2D-D12 closure) | `582216e` |
| RAA 12.8 §4 (Surface 2 Relational Dynamics; D-2C-D2 + D-2D-D9 closure) | `271e9cc` |
| RAA 12.8 §5 (Surface 3 Agentic Coherence; four drifts closed) | `5eb3f49` |
| RAA 12.8 §6 (Cross-Surface Architectural Decisions; six INT-*) | `2148bfe` |
| RAA 12.8 §7 (Active-Learning Informativeness; ADR-0022 amendment path) | `1fa1c12` |
| RAA 12.8 §5.8 Amendment Commit 1 (six EntityType mappings) | `604aac6` |
| RAA 12.8 §5.8 Amendment Commit 2 (Path B-2 18-site body-text amendment) | `2cced88` |
| RAA 12.8 §5.8 Amendment Commit 3 (§5.10 NEW H3 Correction E) | `127a383` |
| RAA 12.8 §8 (Patent-Implementation-Evidence; Zone U2 + three-patent coverage map) | `00d86a1` |
| RAA 12.8 §9 (Forward Implications; 12 drift IDs canonical) | `7bb52a6` |
| RAA 12.8 §10 (References; canonical record closure) | `e31f948` |
| TRACK-A-G2 REVISED (Colima canonicalization; ADR-0013 amendment per RULE 13) | `5be42e5` |

**Chronological substrate-truth canonical at table position per
Zone U2 framing + memory entry #12 cryptographically-timestamped
evidence framing.** DRIFT 9 reconciliation per chronological
ordering: Gate 8e closed 2026-05-07 → Gate 8c closed 2026-05-08
→ Gate 8d closed 2026-05-08 (substrate-truth chronological
ordering canonical at commit chain register; supersedes prior
canonical-record reference orderings).

**Queued:** see Section 6 (PROTECTED-PRIORITY).

---

## Section 6 — PROTECTED-PRIORITY queued work

PROTECTED-PRIORITY queue tracks the two-gate window at the top of
the forward queue: the gate currently in flight (closed at end-of-
commit) and the gate immediately following it. Earlier closures
are tracked in §5 closed-gates table; deeper queue work is tracked
in §12 Recommended Architectural Additions and the Track A gate
plan.

### Track A Gate 8h — Canonical reference refresh (~1 hour)

**Status:** closed at end-of-commit.

**Scope:**

- `CLAUDE.md` §5 + §6 — "as of Track A Gate 8b-amendment" updated
  to "as of Track A Gate 8h"; §6 Track A list operational status
  refreshed (Gate 8b-amendment / 8c / 8d / 8e all marked CLOSED
  with SHAs). §6 historical framing (L348 + L398) preserved per
  Gate 9 D-2 option (c) precedent (contemporaneous accuracy).
- `docs/CURRENT_BUILD_STATE.md` — §4 niov-foundation HEAD updated
  `e829644` → `47d8596`; §5 closed-gates table appended with 6
  missing entries (BUILD-RECONCILIATION `95ad861`, Gate 8c
  `bea1b33`, Gate 8d `2fc025a`, RAA 12.7 `0fd8da7`, Gate 9
  `c399980`, Gate 8f `47d8596`); §6 rotated to Gate 8h
  closed-at-end-of-commit + Gate 8g queued; §8 test surface
  counts updated (Unit 370 → 371; Total 482 → 483; CI run
  25539791355 → 25611252522); §9 cross-repo niov-foundation HEAD
  `e829644` → `47d8596`.
- `.github/workflows/ci.yml` L63 — unit-tier job name label
  `(370 tests)` → `(371 tests)`. Cosmetic display only; vitest
  runs whatever passes.

**Lineage:** RAA 12.7 (`0fd8da7`) + Gate 9 (`c399980`) + Gate 8f
(`47d8596`) commit bodies all deferred canonical-reference
refresh to Gate 8h. D-G8H-1 substrate-honesty drift surfaced
during Gate 8h investigation: forward "Node.js 20→24" gate
predicted in Gate 8f / Gate 9 / RAA 12.7 commit bodies as
"Gate 8e" conflicted with closed Gate 8e (`e829644` ADR-0016
amendment, immutable record). D-1 resolution: forward
toolchain-modernization gate renamed to Gate 10. Gate 8x family
preserved as security-advisory cluster (8a/8b-amendment/8c/8d/
8e/8f/8g/8h); Gate 10 starts toolchain-modernization cluster.
Older commit-body forecasts referencing "Gate 8e Node.js 20→24"
become slightly inaccurate predictions but not substrate
violations per origin/main immutability discipline.

**Substrate-discipline alignment:** closes the canonical reference
staleness window opened by 2026-05-08/09/10 commit cycle. RULE
14 (bidirectional citation — §6 entries cite SHAs; SHAs cite §6
via commit-body cross-reference). RULE 13 (drift surfacing —
D-G8H-1 Gate 8e numbering, D-G8H-2 historical framing
preservation, D-G8H-3 last-verified CI run reference, D-G8H-E5
table format substrate-coherence, all surfaced inline before
silent fix).

### Track A Gate 8g — tar/bcrypt 5→6 breaking + remaining audit advisories (~2-3 hours; dedicated session)

**Status:** queued.

**Scope:**

- `tar` 5→6 transition (HIGH-severity advisories: hardlink path
  traversal, symlink poisoning, race condition on macOS APFS,
  drive-relative linkpath, etc. — 6 advisories total).
- `bcrypt` 5→6 transition (depends on `@mapbox/node-pre-gyp` →
  `tar` chain; bcrypt is critical password-hashing surface and
  the major-version migration affects auth code paths).
- Remaining `esbuild` advisory (moderate; dev-tree via
  `vitest`/`vite`/`vite-node`/`@vitest/mocker` chain — separate
  evaluation: dev-only surface vs production vulnerability).
- `npm audit fix --force` would auto-bump but introduces
  `vitest@4.1.5` breaking change; substrate-honesty
  investigation of impact required first.

**Lineage:** Gate 8f (`47d8596`) cleared 2 fast-uri advisories
non-breakingly; tar/bcrypt remaining HIGH-severity advisories
require breaking upgrades and dedicated fresh-sharpness session
per Gate 8f commit body and operator session-opening queue.

**Substrate-discipline alignment:** ADR-0016 Pin-and-Optimize
Framework (security-patch-cadence axis applies; whether to bump
bcrypt 5→6 also touches PQC migration trajectory per ADR-0019).
ADR-0017 Production Discipline (nine-step template applies to
breaking dependency upgrade — frame the drift, distinguish
observation/inference, verify empirically before fix design).
8x security-advisory cluster closes with Gate 8g.

---

## Section 7 — ADR inventory

All 22 ADRs at `docs/architecture/decisions/`. Substrate-discipline
canonical reference quartet **bolded** (ADR-0016/0017/0018/0019).
ADR-0020/0021/0022 added as independent ADR cluster at different
substrate registers (IP-discipline + extension-protocol +
scoring-formula vs substrate-discipline-canonical).

| ADR | Title |
|---|---|
| 0001 | Three-wallet architecture |
| 0002 | Append-only audit chain with BEFORE DELETE trigger |
| 0003 | Frozen-config tamper anchors |
| 0004 | Service-owned auth gate pattern |
| 0005 | No `console.*` in `apps/api/src` (DRIFT 2 Option C) |
| 0006 | Cross-org leak prevention via filter narrowing |
| 0007 | Manual bearer auth for `/compliance/*` endpoints |
| 0008 | `EntityComplianceProfile` is org-level, not aggregated |
| 0009 | COSMP 7-operation enumeration (locked per US 12,517,919) |
| 0010 | Foundation tests are legitimately slow (90-110 min) |
| 0011 | Three-tier test stratification |
| 0012 | Test-mode LLM provider hardening |
| 0013 | Containerized Postgres for unit and integration tiers |
| 0014 | FixtureBasedLLMProvider key-based dispatch (supersedes 0012 dispatch) |
| 0015 | CI Workflow Architecture |
| **0016** | **Pin-and-Optimize Framework** (substrate-pinning canonical reference) |
| **0017** | **Production Discipline** (substrate-investigation canonical reference) |
| **0018** | **Deployment-Target Agnosticism Posture** (substrate-portability canonical reference) |
| **0019** | **Cryptographic-Suite Posture** (substrate-cryptographic-resilience canonical reference) |
| 0020 | Two-Register IP Discipline (IP-discipline register; protected-name boundary + RULE 19 canonical at canonical-record register) |
| 0021 | Capsule Type Extension Protocol (extension-protocol register; CapsuleType enum extension pattern + SUBSTRATE_OBSERVATION territory) |
| 0022 | combined_score Formula Canonicalization (scoring-formula register; frozen-anchors family per INT-6; informativeness coefficient extension path per RAA 12.8 §7.4) |

---

## Section 8 — Test surface current state

| Tier | Count | Last verified |
|---|---|---|
| TypeScript unit | 508 / 508 | verified at HEAD c1ee061 pre-flight surface; CI run reference forward-queued at substrate-state register |
| TypeScript integration | 198 + 1 skipped | verified at HEAD c1ee061 pre-flight surface; CI run reference forward-queued at substrate-state register |
| Elixir cosmp_router default | 137 / 0 | verified at HEAD c1ee061 pre-flight surface; CI run reference forward-queued at substrate-state register |
| Elixir dbgi_supervisor default | 42 / 0 (19 excluded) | verified at HEAD c1ee061 pre-flight surface; CI run reference forward-queued at substrate-state register |
| Elixir dbgi_supervisor integration | 19 / 0 | verified at HEAD c1ee061 pre-flight surface; CI run reference forward-queued at substrate-state register |
| LLM-required nightly | (verify count when nightly runs) | (verify) |
| **Total** | **904 + 1 skipped** | verified at HEAD c1ee061 pre-flight surface; CI green at every substrate landing on origin/main |

Test count timeline reference: see
`docs/reconciliation/2026-05-08-build-reconciliation.md` Section 5
(311 → 482 across Sections 9, 10, 11, 12B Foundation, and Track A
Gate substrate work). Subsequent growth landed across BEAM Phase 2
(sub-phases 10-13), CAR Sub-box 3 mini-arc (7 sub-phases adding
REGULATOR + LawfulBasis + audit chain canonical_record/1 12→14
extension + 23 + 18 integration tests + 32 unit tests), and CAR
Sub-box 2 mini-arc (6 sub-phases adding jurisdiction tagging +
service helpers + COSMP enforcement + REGULATOR integration + 17
unit + 20 + 7 integration tests).

---

## Section 9 — Cross-repo state

| Repo | Role | HEAD |
|---|---|---|
| niov-foundation | Substrate (Foundation) | `5be42e5` (2026-05-11; [TRACK-A-G2] Gate 2 REVISED) |
| otzar-control-tower | Otzar Control Tower frontend | `0a28f90` (2026-05-05; closes 12B) |

**Cross-repo discipline** (per Section 12 standalone Build Guide):
"Foundation extensions land first as separate commits with their own
tests. Frontend lands second consuming the new contract."

Canonical Section 12B-Foundation extension commits on niov-foundation:
`6151812` (audit_event_id surfacing) → `ca6e982` (skill assignment
audit) → `ee4dafb` (AI Teammate detail read with cross-tenant
fail-closed).

---

## Section 10 — Authoritative architecture summary

**Foundation = the substrate** (memory governance + protocol +
execution control).

**COSMP = 7-operation protocol** (locked per ADR-0009 +
US 12,517,919):

1. AUTHENTICATE
2. NEGOTIATE
3. READ (2-step: metadata + content)
4. WRITE (owner + attributed)
5. SHARE
6. REVOKE
7. AUDIT

**DMW = Decentralized Memory Wallet** (3 wallet types per ADR-0001):

- Personal (institutional memory; portable with employee)
- Enterprise (zero-payload aggregation; org wallet)
- Device (per-device memory)

**Capsule structure (7 layers):** Payload, Metadata, Rules,
Relations, Time, Permissions, Audit.

**Substrate properties:**

- Deployment-target agnostic per ADR-0018.
- Post-quantum-ready by primitive selection per ADR-0019.
- Append-only audit chain per ADR-0002 (BEFORE DELETE trigger).
- Service-owned auth gate per ADR-0004.
- Cross-org leak prevention enforced runtime per ADR-0006.
- FIPS-deployment posture documented in
  `docs/FIPS_DEPLOYMENT_POSTURE.md`.

**Substrate-adjacent products:**

- **Otzar** = first canonical application built on Foundation.
- **Otzar Control Tower** = admin / governance UI for Otzar
  (16 screens; sub-sections 12A through 12F).
- Future applications: enterprise + government tier.

**Patent stack** (all personally held; NIOV Labs licenses):

- US 12,164,537 (Dec 2024) — ABT database / file management.
- US 12,399,904 (Aug 2025) — alert manager + TARs continuation.
- US 12,517,919 (Jan 2026) — COSMP / DMW continuation.

**Substrate-architecture canonicalization (RAA 12.8; 2026-05-11):**

RAA 12.8 substrate-architecture canonicalization complete on
origin/main at `e31f948` ([RAA-12.8-S10]; final commit in 14-commit
RAA 12.8 chain). Substrate-architecture coverage at three-patent
register canonical per §8.3 coverage map. Step 2D substrate-
architecture canonicalization complete per §9.6 handoff discipline;
Step 2E engineering work surface + Step 2F glossary refresh
handoff per coordinated architectural-engineering discipline.
Section 12.5 Sub-box 1 (EscalationRequest + dual-control middleware;
D-2D-D10 closure per §5.9 item 1) unblocked per Track A complete;
Phase 2 primary engineering scope candidate.

---

## Section 11 — Compliance + government-grade scope

### Implemented

- 7 framework seeds (per Build Guide §7): HIPAA, GDPR, CCPA,
  FedRAMP_Moderate, FERPA, SOC2, CMMC.
- `runComplianceChecks` injected into COSMP pipeline.
- Append-only audit chain with cryptographic enforcement per
  ADR-0002.
- TAR hash invalidation on session change per Section 1F /
  ADR-0001 family.
- Post-quantum-ready cryptographic posture per ADR-0019.
- Deployment-target agnosticism per ADR-0018 (sovereign cloud,
  on-prem, air-gapped, managed cloud).
- Section 12.5 Compliance Architecture Review (commit `9671776`)
  covered 24 dimensions and 6 patent claim families. Output:
  `docs/COMPLIANCE_ARCHITECTURE_REVIEW.md`.
- Structured logging schema documented in
  `docs/STRUCTURED_LOGGING_SCHEMA.md`.
- Audit retention posture documented in
  `docs/AUDIT_RETENTION_POSTURE.md`.
- FIPS deployment posture documented in
  `docs/FIPS_DEPLOYMENT_POSTURE.md`.

### Queued (Phase 2)

- **Section 15:** Enterprise Hardening + Compliance (per Patched
  Build Guide).
- **CNSA 2.0 attestation** (per ADR-0019 PQC-readiness framing;
  follow-on after Phase 2).
- **NIST SP 800-53 control mapping** (subset already implicit per
  Section 12.5 review; explicit mapping queued).
- **FedRAMP High vs Moderate distinction** — Build Guide §7 seeds
  Moderate; High requires additional posture.
- **Continuous compliance reporting endpoints** — verify which
  dimensions remain open per Section 12.5 review.

---

## Section 12 — Recommended Architectural Additions

Six forward-tracked architectural additions surfaced during the
2026-05-08 session. Each is captured here for dedicated future-session
investigation + design + ADR. **None are designed today;** this section
captures scoped concerns + research-grounded framings.

### 12.1 Multi-tenant federation architecture

**Concern:** Enterprise customers like Nike (with Nike USA, Nike
Japan, Nike Dubai as separate legal entities) need separate
sovereign data per tenant + admins + employees, with optional
consent-gated parent-org roll-up intelligence.

**Current state:**

- Foundation has organization-scoped entities, RBAC infrastructure,
  audit-chain enforcement, cross-org leak prevention (ADR-0006).
- Single-org multi-entity is built.
- Cross-org isolation is built.
- Cross-tenant federation (consent-gated parent-org intelligence) is
  NOT yet built.

**Research findings (2026-05-08):**

- Salesforce uses single shared multitenant database + multitenant
  kernel + OrgID partitioning at every query layer.
- Salesforce Hyperforce overlay provides per-region data residency
  (US / EU / UK / Germany / India / Japan / UAE / etc.).
- Salesforce treats Nike-USA / Nike-Japan / Nike-Dubai as separate
  ORGS within their respective regional Hyperforce instances.
- Industry assessment: "Hyperforce provides data residency at the
  country level, but does not natively support country-specific data
  isolation within a single org. Multinational enterprises must
  carefully consider their approach to data residency and
  cross-border data flows."
- Three-tier multi-tenant model categories: shared database / shared
  schema; shared database / separate schemas; separate databases per
  tenant.

**Recommended architecture for Foundation:**

- Per-region Foundation deployments for sovereign data residency
  (matches Hyperforce regional pattern).
- Within each regional deployment: multi-tenant kernel with strong
  tenant isolation (each subsidiary = own tenant, OrgID partitioning,
  RBAC + ABAC enforcement).
- Optional federation layer for parent-organization roll-up
  intelligence with explicit per-tenant consent gates and audit
  trails.

This is stronger than Salesforce's current native offering.
**Differentiator opportunity.**

**Recommended addition:** NEW ADR + scope work. Likely substantial
implementation cycle.

### 12.2 Capsule + COSMP + DMW interconnection map

**Concern:** Bilateral relationships between capsules, COSMP
operations, and DMW wallets are documented across multiple Build
Guide sections (1, 3, 5) but not surfaced as a single coherent
picture. The governance topology (how capsules flow through COSMP
operations within DMW boundaries) needs unified documentation.

**Current state:**

- Substrate is built (Sections 1, 3, 5 closed).
- `docs/reference/architectural-anchors.md` referenced in CLAUDE.md
  but flagged as having "mild secondary drift" deferred to Sub-box 7
  work.
- No single canonical interconnection map exists.

**Recommended addition:** Documentation work only. Single canonical
document showing full lifecycle:

- Capsule creation → 7-layer assembly → wallet assignment.
- COSMP 7 operations operating on capsules.
- DMW 3 wallet types holding capsules.
- Bilateral relationships: capsule ↔ wallet ↔ entity ↔ governance.
- Cross-references to ADRs and Build Guide sections.

**Effort:** ~2-4 hours documentation. No new substrate work
required.

### 12.3 Digital twin behavior specification

**Concern:** Specific agent behaviors not yet fully specified:

- Listeners + click-watching + workflow learning.
- Permission temporality model (short-term, long-term, indefinite).
- Cross-departmental collaboration rules (when does Twin A from
  Marketing get to ask Twin B from Engineering for context, governed
  by what?).
- After-hours autonomous operation with deferred permission
  requests.
- Federated learning across twins within an org.
- Twin portability when employee changes companies.

**Current state:**

- Section 11 (Otzar Conversation + Context Priming + Observation) —
  CLOSED (observation pipeline built).
- Section 14 (Autonomous Execution + Proactive Behaviors) —
  NOT STARTED.
- Section 16 (Otzar Product Completeness — federated learning, twin
  portability) — NOT STARTED.
- Section 17 (Intelligence Engine 6-Layer Stack) — NOT STARTED.

Behaviors above are partially in Section 14 / 16 / 17 scope but at
insufficient granularity. Specific gaps:

- Permission temporality model (short / long / indefinite) needs
  explicit ADR.
- Cross-departmental collaboration rules need explicit specification
  (RBAC + ABAC interaction with twin-to-twin requests).
- After-hours autonomous operation with deferred permission requests
  needs specification.

**Recommended addition:** NEW ADR for permission temporality + scope
expansion in Sections 14 / 16. Some new substrate work required
(permission temporality model, twin-to-twin collaboration gateway,
deferred permission queue).

### 12.4 LLM provider partnership architecture

**Concern:** Foundation should be positioned as valuable
intermediary for LLM providers (OpenAI, Anthropic, Google, etc.),
not as competitor. Need explicit architecture for:

- Model-agnostic routing (multi-LLM support per enterprise customer
  choice).
- No-train contractual commitments and technical enforcement.
- PII-stripping pipeline (Foundation produces clean data for LLM
  consumption).
- Allowlist enforcement at gateway (admin-controlled provider
  allowlists).

**Current state:**

- Foundation is LLM-provider-agnostic by design (substrate doesn't
  pick the LLM).
- LLM provider integration patterns not yet architected as explicit
  substrate component.
- PII-stripping happens implicitly via capsule governance but not
  surfaced as discrete pipeline.

**Research findings (2026-05-08):**

- Enterprise LLM gateways (Bifrost, Kong AI Gateway, Cloudflare AI
  Gateway, LiteLLM, OpenRouter) all emerging in 2026.
- 2026 enterprise procurement standards: GPAI deployer transparency,
  use-case risk classification, no-train commitments, incident
  notification, model-change notice.
- Anthropic (40% enterprise LLM API spend), OpenAI (27%), others —
  diversifying enterprise LLM stack.
- Industry framing: "Enterprises will no longer ask which LLM to
  use. They'll ask how to build memory that is private, precise, and
  persistent."

**Recommended Foundation positioning:**

- Foundation makes LLM providers deployable in regulated enterprise /
  government environments where they otherwise couldn't go.
- Symbiotic, not adversarial: "We govern; you reason. We bring the
  customers; you bring the capability."
- Foundation = the substrate that makes harnesses, agents,
  applications governable.

**Recommended addition:** NEW ADR for LLM provider integration
architecture + scope work for explicit PII-stripping pipeline +
allowlist gateway component.

### 12.5 Scale architecture (billion-entity / trillion-capsule)

**Concern:** Foundation's correctness-first substrate needs forward
architecture for billion-entity / trillion-capsule / millions-of-
applications scale.

**Current state:**

- Substrate is correct, not yet scaled.
- ADR-0018 codifies deployment-target agnosticism (where) but not
  scale architecture (how big).
- Single-deployment scale ceiling not specified.

**Required architecture:**

- Capsule storage tiering (hot / warm / cold tiers).
- Audit chain partitioning (sharded by tenant or time).
- Capsule index sharding (likely tenant-scoped with cross-shard
  query coordinator).
- Cache invalidation strategy at scale (TAR hash invalidation across
  distributed cache).
- COSMP operation queue (write / audit operations queueable at
  scale).

**Recommended addition:** Scale architecture document (architectural
specification, not yet implementation). Future implementation work
after specification lands.

**Not a YC-readiness blocker.** Path to scale is demonstrable;
implementation is forward work.

### 12.6 Category positioning (AI Memory Governance Substrate)

**Concern:** Foundation is not a harness. It's the substrate that
harnesses run on. Needs explicit category positioning to differentiate
from agent harnesses (Claude Code, OpenClaw-style tools) and from
LLM providers' own moves into agent orchestration.

**Research findings (2026-05-08):**

- "Agent harness" definition: software infrastructure wrapping
  around an LLM, handling tool calls, memory management within
  session, multi-step orchestration.
- Harnesses are per-application infrastructure.
- Foundation is per-enterprise infrastructure (different layer).
- LLM providers all moving up the stack toward agent orchestration
  (OpenAI acquihire of OpenClaw creator signals this).

**Foundation's category claim:**

- "AI Memory Governance Substrate" (technical audience).
- "Supra Infrastructure for Autonomous Enterprises" (strategic
  audience; per Manifesto).
- First canonical implementation of patented protocol (COSMP) and
  storage architecture (DMW) for AI memory governance.
- Salesforce, Microsoft, Google, LLM providers do NOT have substrate
  at this layer — they have application-layer features approximating
  parts of it.

**Differentiators:**

- Patent-protected protocol (COSMP — 3 issued patents).
- Cryptographic memory ownership (enterprise owns wallet; LLM rents
  access).
- Append-only audit chain.
- Post-quantum-ready primitive selection.
- Deployment-target agnosticism.
- Multi-tenant kernel (with federation as Recommended Addition
  12.1).

**Recommended addition:** Strategic positioning document + explicit
category-claim language in CLAUDE.md and canonical reference.
Possibly external positioning materials (whitepaper, technical
brief, investor deck supporting documents).

### 12.7 Dynamic Flow Architecture (CLOSED)

**Status:** CLOSED — landed at commit `0fd8da7` on origin/main
2026-05-09.

**Document:** `docs/architecture/dynamic-flow-architecture.md`
(1,451 lines, 15 sections, 2 Mermaid diagrams).

**Establishes:** Foundation as embodied substrate for AI cognition
— substrate-as-body framing, not substrate-as-brain. Codifies
bilateral-vs-unilateral zone discrimination (4 unilateral / 5
bilateral; default rule: bilateral). Classifies 10 dynamic-flow
capabilities as 5 SUBSTRATE / 2 PARTIAL / 3 NET-NEW. Encodes
qi-and-blood metaphor as architectural anchor; positions Foundation
for the ASI consumer trajectory. Adapts 8 public-domain research
patterns (CRDTs, Attention, Federated Learning, Logical clocks,
Spatial indexing, Active learning, Multi-armed bandits, Multi-source
query parallelism) within Foundation's patent-protected COSMP/DMW
envelope.

**Forward dependency:** RAA 12.2 (static interconnection map; queued)
builds over this dynamic flow foundation, not the other way around.

### 12.8 Substrate Dynamics: Scale, Relational Dynamics, Agentic Coherence (CLOSED)

**Status:** CLOSED — landed at commit `e31f948` ([RAA-12.8-S10];
final commit in 14-commit RAA 12.8 chain) on origin/main 2026-05-11.

**Document:** `docs/architecture/raa-12-8-substrate-dynamics.md`
(2778 lines; 10 H2 + 72 H3 + 261 H4; 14-commit canonical chain).

**Establishes:** Three architectural surfaces of substrate dynamics
canonicalized (Surface 1 Scale Architecture + Surface 2 Relational
Dynamics + Surface 3 Agentic Coherence). Six EntityType mappings
canonical per §5.8 amendment chain (PERSON / COMPANY / AI_AGENT
owning-entity-derived / DEVICE / APPLICATION / GOVERNMENT). §5.10
Correction E NEW substrate territory (substrate-vs-configuration
separation + permission-batching primitives + permission-class
taxonomy + permission-trickle-through-non-human-DMW + auto-grant
authorization + cognitive-load measurement). §8 Patent-
Implementation-Evidence Framing (Zone U2 patent-holder
implementation record substrate + Decision Patent-A defensive
publication strategy + three-patent coverage map: US 12,164,537 +
US 12,399,904 + US 12,517,919 substrate-architecture register).
§9.6 Step 2D-completion handoff discipline (Step 2E engineering
work surface + Step 2F glossary refresh + RAA 12.9 forward
dependency + OPERATOR REVIEW REQUIRED markers).

**Substrate-discipline pattern:** Eleven-consecutive-commit
substrate-honest pre-flight verification pattern operational
across full RAA 12.8 6-commit run (Sections 3-7 + §5.8 amendment
Commit 1 + Path B-2 backwards-propagation Commit 2 + Correction E
Commit 3 + §8 + §9 + §10). Path A discipline (preserve existing
numbering; expand substantively) + Option C discipline (range-
endpoint reference framings for D-2C-D1 + D-2D-D7 per substrate
truth) canonical at §10 References canonicalization.

**Forward dependencies:**
- **RAA 12.9** (Governance & Monetization at Scale; queued) cites
  RAA 12.8 cross-type balance policy as substrate dependency per
  §9.1 forward dependency framing.
- **§9.4 Future RAA candidates:** RAA on Self-Introspection
  Architecture + RAA on Multi-DMW Concurrent Flow + RAA on
  Permission-Class Taxonomy + RAA on Cognitive-Load Measurement +
  RAA on Auto-Grant Authorization (5 candidate territories
  surfaced from RAA 12.8 work; deferred to operator selection).
- **§9.5 ADR amendment paths:** ADR-0021 + ADR-0022 + ADR-0020 +
  ADR-0019 amendment paths + 6 new ADR candidate territories
  surfaced; deferred to operator selection.

---

## Section 13 — Source-of-truth pointers

| Type | Location |
|---|---|
| Architectural decisions | `docs/architecture/decisions/0001-*.md` through `0022-*.md` |
| RAA 12.8 substrate-dynamics canonicalization | `docs/architecture/raa-12-8-substrate-dynamics.md` (landed `e31f948` 2026-05-11) |
| Operator-facing canonical reference | `CLAUDE.md` (repo root) |
| Persistent build state (this document) | `docs/CURRENT_BUILD_STATE.md` (repo root level under docs/) |
| Compliance posture | `docs/FIPS_DEPLOYMENT_POSTURE.md` |
| Compliance Architecture Review | `docs/COMPLIANCE_ARCHITECTURE_REVIEW.md` (landed at `9671776`) |
| Audit retention posture | `docs/AUDIT_RETENTION_POSTURE.md` |
| Structured logging schema | `docs/STRUCTURED_LOGGING_SCHEMA.md` |
| Glossary | `docs/reference/glossary.md` |
| Architectural anchors | `docs/reference/architectural-anchors.md` (note: flagged for Sub-box 7 update) |
| Section 12 progress tracker | `docs/reference/section-12-progress.md` |
| Patched Build Guide PDF | `docs/NIOV_Master_Build_Guide_S9_S17_Patched.pdf` (gitignored, working reference) |
| Section 12 Build Guide (text) | `~/Desktop/NIOV Labs/github/builddocs/NIOV_Section_12_Build_Guide.txt` (working reference, not in repo) |
| Original 12-section Foundation MVP Build Guide | `~/Desktop/NIOV Labs/Otzar Dev/NIOV_Foundation_MVP_Build_Guide.txt` (historical artifact, not in repo) |
| Strategic positioning docs | `~/Desktop/NIOV Labs/Otzar Dev/` (pre-quartet, architecturally consistent, not in repo) |
| Reconciliation evidence | `docs/reconciliation/2026-05-08-build-reconciliation.md` |

---

## Section 14 — Update protocol

This document is the persistent canonical reference. **Update
conditions:**

- After any Section close → update Section 3 status.
- After any Track A gate close → update Section 5.
- After any new ADR landed → update Section 7.
- After any Recommended Architectural Addition gets designed and
  lands as ADR or scope → move from Section 12 to Section 7 +
  Section 5.
- After any major scope change → update Section 1 one-paragraph
  summary if needed.
- After any sub-section close on otzar-control-tower → update
  Section 4.
- After any test count change → update Section 8.

Updates are commit-tracked changes to this document. Future Claude
Code sessions should view this document at session start before any
work begins.

**Companion documents that may also need updates:**

- `CLAUDE.md` — when RULES change or when a new ADR is added (RULE
  14 bidirectional citation discipline).
- `docs/reference/section-12-progress.md` — when Section 12
  sub-sections advance.
- ADR back-citations — RULE 14 requires bidirectional citation
  closure within the same commit.
