# ADR-0038: DMW Worker per-DMW Supervised Process

## Status

Proposed 2026-05-15

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
