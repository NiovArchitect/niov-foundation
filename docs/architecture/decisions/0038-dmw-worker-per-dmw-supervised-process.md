# ADR-0038: DMW Worker per-DMW Supervised Process

## Status

Accepted 2026-05-15 (landed at sub-arc 1 sub-phase a Commit 3 of 3
`[BEAM-DBGI-DMWWORKER-CLOSURE]`; 3-commit mini-arc lineage
`3b431bf` -> `56e0eaa` -> this commit)

## Context

ADR-0028 (BEAM Coordination Layer) §Forward Queue names per-capsule
supervised Elixir process as architectural intent at the sub-phase 13
closure LANDED sub-paragraph register. The BEAM scaffolding at
apps/dbgi_supervisor has landed across six children: :pg, Registry,
DynamicSupervisor, Cluster.Supervisor, Phoenix.PubSub, and
Phoenix.Tracker. The DMWWorker GenServer module that uses the
scaffolding has not.

The cosmp_router single-GenServer pattern at HEAD 85609b6 serializes
every COSMP operation across every DMW across every entity through one
BEAM mailbox. The architectural target named in the README and
monetization essay (hundreds to thousands of parallel COSMP operations
for the workloads that need it) requires per-DMW supervised process
substrate. The scaffolding is wired for this but is not yet used.

The hybrid hot/cold framing locked at canonical decision register:

- ENTERPRISE wallets run always-hot per-DMW supervised process.
- PERSONAL and AI_AGENT wallets promote-on-activity from cold shard
  substrate to hot per-DMW substrate.
- DEVICE wallets run always-cold shard-mapped substrate.

This ADR canonicalizes the DMWWorker GenServer module that delivers
the per-DMW supervised process substrate at sub-phase a granularity.
DMWWorker is a separate layer from cosmp_router. cosmp_router stays
as-is at sub-phase a. cosmp_router re-wire is forward-substrate to
sub-arc 1 sub-phase b and beyond.

## Decision

NIOV Labs lands the DMWWorker GenServer module at
apps/dbgi_supervisor/lib/dbgi_supervisor/dmw_worker.ex with the
following sub-decisions.

### Sub-decision 1: Module location

DMWWorker lands at apps/dbgi_supervisor/lib/dbgi_supervisor/dmw_worker.ex.
The dbgi_supervisor app owns the supervised-process architectural
layer per ADR-0028 §3.

### Sub-decision 2: Identity addressing

DMWWorker addresses by entity_id. Registry key:
`{:via, Registry, {DbgiSupervisor.Registry, entity_id}}`.
Phoenix.Tracker topic: `"dmw:#{entity_id}"`. This matches the
Phoenix.Tracker topic conventions already established at
PresenceTracker.

### Sub-decision 3: Tier dispatch axis

DMWWorker dispatches on WalletType (PERSONAL, ENTERPRISE, DEVICE).
3-tier dispatch is right-sized for sub-phase a. EntityType 7-tier
dispatch and any future compute_tier field are forward-substrate to
later sub-arcs if the substrate-architectural target requires
finer-grained dispatch.

### Sub-decision 4: Lifecycle pattern

DMWWorker lazy-spawns on first COSMP operation against the wallet's
entity_id. This preserves the consumer-tier-cost framing: idle
wallets cost nothing at memory-footprint register. Eviction TTL is
forward-substrate to later sub-arcs.

### Sub-decision 5: State

DMWWorker is stateless plus Phoenix.Tracker presence only at
sub-phase a. ETS cache substrate is forward-substrate to later
sub-arcs. This minimum-viable scope is consistent with ADR-0034
testability discipline.

### Sub-decision 6: DMWWorker vs cosmp_router relationship

DMWWorker is a separate layer from cosmp_router. DMWWorker runs
dbgi-tier lifecycle and coordination substrate. cosmp_router stays
as a single-GenServer COSMP-op dispatcher at sub-phase a. cosmp_router
re-wire is forward-substrate to sub-arc 1 sub-phase b and beyond.

### Sub-decision 7: BEAM-compatibility patterns

DMWWorker preserves the six BEAM-compatibility patterns from ADR-0026
§5 by construction.

### Sub-decision 8: Testability

DMWWorker follows ADR-0034 testability discipline: name-configurable
substrate and start_supervised! patterns. Tests exercise spawn via
DynamicSupervisor, Registry lookup, Phoenix.Tracker presence on init,
presence absence on terminate, tier-differentiated behavior on at
least one tier, parallel DMWWorkers for distinct entity_ids, and
stop-then-restart resilience.

## Consequences

### Easier

- Per-DMW substrate unblocks per-DMW parallelism. Each entity_id
  gets one DMWWorker GenServer when active. Parallelism across DMWs
  functions at BEAM-runtime register.

- ADR-0028 §Forward Queue per-capsule supervised Elixir process item
  closes at per-DMW granularity. Per-capsule supervised process at
  finer granularity remains forward-substrate.

- The architectural target named in the README and monetization
  essay (hundreds to thousands of parallel COSMP operations for the
  workloads that need it) unblocks when sub-arc 1 sub-phase b and
  beyond re-wire cosmp_router to dispatch through DMWWorkers.

- Consumer-tier-cost framing preserved. Lazy-spawn means idle DMWs
  cost nothing at memory-footprint register.

### Harder

- DynamicSupervisor child registry grows with active DMW count.
  Eviction substrate is forward-substrate to later sub-arcs to
  manage memory at billion-entity scale.

- DMWWorker stateless-plus-presence-only substrate does not provide
  capsule cache benefits. ETS cache substrate is forward-substrate
  to later sub-arcs.

- cosmp_router single-GenServer remains the architectural bottleneck
  at sub-phase a. cosmp_router re-wire is forward-substrate to
  sub-arc 1 sub-phase b and beyond. The architectural target does
  not deliver at runtime until sub-arc 1 sub-phase b and beyond
  complete.

- WalletType 3-tier dispatch constrains tier substrate to the three
  current WalletType values. Finer-grained dispatch is forward-substrate
  if the architectural target requires it.

## Bidirectional Citation

- Cites: ADR-0026 (BEAM-compatibility patterns) §5; ADR-0028 (BEAM
  Coordination Layer) §3 and §Forward Queue; ADR-0034 (BEAM
  testability discipline).

- Cited by: ADR-0028 §Forward Queue NEW append-only LANDED sub-paragraph
  (sub-arc 1 sub-phase a closure update) marks per-capsule supervised
  Elixir process as PARTIALLY LANDED at per-DMW granularity per
  ADR-0038; per-capsule granularity at finer-grained register remains
  forward-substrate. ADR-0028 §Bidirectional citations (cited from)
  sub-block back-cites ADR-0038 at the sub-block append-only register.

## Post-Closure Implementation Lineage

DMWWorker mini-arc closed at Commit 3 of 3
`[BEAM-DBGI-DMWWORKER-CLOSURE]` (this commit). All 8 sub-decisions
RESOLVED:

- Sub-decision 1 (module location at
  `apps/dbgi_supervisor/lib/dbgi_supervisor/dmw_worker.ex`):
  RESOLVED at Commit 2 `56e0eaa` (160 lines).

- Sub-decision 2 (identity addressing by entity_id via
  `{:via, Registry, {DbgiSupervisor.Registry, entity_id}}` Registry
  key + `"dmw:#{entity_id}"` Phoenix.Tracker topic): RESOLVED at
  Commit 2 `56e0eaa` (via_tuple/1 + topic_for/1 private helpers).

- Sub-decision 3 (tier dispatch axis on WalletType 3-tier):
  RESOLVED at Commit 2 `56e0eaa` (tier_for/1 public function;
  `:personal` -> `:promote_on_activity`, `:enterprise` ->
  `:always_hot`, `:device` -> `:always_cold_shard`).

- Sub-decision 4 (lazy-spawn lifecycle on first COSMP operation):
  RESOLVED at Commit 2 `56e0eaa` (`DbgiSupervisor.start_dmw_worker/2`
  public API entry point; DynamicSupervisor child_spec with
  `:transient` restart policy).

- Sub-decision 5 (stateless plus Phoenix.Tracker presence only):
  RESOLVED at Commit 2 `56e0eaa` (init/1 calls PresenceTracker.track;
  terminate/2 calls PresenceTracker.untrack; state map contains
  entity_id + wallet_type + tier only).

- Sub-decision 6 (DMWWorker vs cosmp_router separate-layer):
  RESOLVED at Commit 2 `56e0eaa` (DMWWorker is dbgi-tier supervised
  process; cosmp_router single-GenServer pattern unchanged at sub-phase
  a; cosmp_router re-wire forward-substrate to sub-arc 1 sub-phase b
  and beyond).

- Sub-decision 7 (6 BEAM-compatibility patterns from ADR-0026 §5
  preserved): RESOLVED at Commit 2 `56e0eaa` (preserved by
  construction: pure-function tier_for/1 + topic_for/1 + via_tuple/1;
  no global state; GenServer mailbox isolation; supervised lifecycle;
  Phoenix.Tracker CRDT presence; Registry-keyed addressing).

- Sub-decision 8 (testability per ADR-0034): RESOLVED at Commit 2
  `56e0eaa` (13 unit tests across 3 describe blocks: 7 lifecycle + 2
  Phoenix.Tracker presence + 4 tier dispatch with error path).

**3-commit mini-arc lineage:**

- Commit 1 `[BEAM-DBGI-DMWWORKER-ADR]` `3b431bf` (docs-only): ADR-0038
  NEW (Status Proposed 2026-05-15) + ADR-0028 §Forward Queue NEW
  append-only LANDED sub-paragraph + ADR-0028 §Bidirectional citations
  (cited from) NEW entry + catalog refreshes across architecture/README
  + CLAUDE + section-12-progress + CURRENT_BUILD_STATE.

- Commit 2 `[BEAM-DBGI-DMWWORKER-CODE]` `56e0eaa` (substantive code):
  NEW DMWWorker GenServer module + MOD DbgiSupervisor public API
  (start_dmw_worker/2 + whereis_dmw_worker/1 + stop_dmw_worker/1) +
  NEW DMWWorker tests (13 tests across 3 describe blocks).

- Commit 3 `[BEAM-DBGI-DMWWORKER-CLOSURE]` (this commit; docs-only):
  ADR-0038 Status Proposed -> Accepted + NEW Post-Closure
  Implementation Lineage section + section-12-progress.md Phase 3 row
  IN FLIGHT -> CLOSED + architecture/README + CLAUDE.md catalog
  Status sentence refresh + CURRENT_BUILD_STATE.md Phase 3 H2 IN
  FLIGHT -> CLOSED.

**Verification matrix at closure:**

- Elixir compile: clean (3 files compiled; no warnings on new code)
- DMWWorker targeted tests: 13/0 (3.5s)
- Full dbgi_supervisor default tier: 55/0 (5.9s; 42 baseline + 13 new;
  19 integration excluded; no regression)
- CI conclusion at Commit 1 (3b431bf): success across 4 jobs
- CI conclusion at Commit 2 (56e0eaa): success across 4 jobs
  (Typecheck strict 12-baseline + Unit 371 + Integration 111+1 skipped
  + Elixir compile+test)
- CI conclusion at Commit 3 (this commit): pending at this commit's
  CI watch step

**Forward-substrate at canonical-state register:**

The DMWWorker substrate is canonical at runtime register at sub-phase
a closure. The architectural target named in the README and
monetization essay (hundreds to thousands of parallel COSMP operations
per DMW for the workloads that need it) does not yet deliver at
runtime because cosmp_router single-GenServer pattern remains the
serialization bottleneck. Sub-arc 1 sub-phase b and beyond re-wire
cosmp_router to dispatch through DMWWorkers, at which point the
architectural target delivers at runtime.

Sub-arc 1 sub-phase b candidates at canonical-architectural register:
cosmp_router re-wire to dispatch through per-entity DMWWorkers;
ENTERPRISE always-hot per-DMW process pool implementation; PERSONAL
plus AI_AGENT promote-on-activity tier promotion substrate; DEVICE
cold-shard mapping with K=128-1024 consistent-hash shards.
