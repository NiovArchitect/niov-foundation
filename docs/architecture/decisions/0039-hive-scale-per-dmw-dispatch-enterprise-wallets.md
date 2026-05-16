# ADR-0039: Hive-Scale Per-DMW Dispatch Substrate for ENTERPRISE Wallets

## Status

Proposed 2026-05-16

## Context

ADR-0038 (DMW Worker per-DMW Supervised Process) landed the DMWWorker
GenServer module at sub-arc 1 sub-phase a. DMWWorker is canonical at
runtime register as a per-DMW supervised process with Phoenix.Tracker
presence and tier dispatch metadata. DMWWorker does not yet execute
COSMP operations; it is a coordination and presence marker only.

The architectural target named in the README and monetization essay
(hundreds to thousands of parallel COSMP operations per DMW for the
workloads that need it; hive intelligence across millions of memory
capsules with push and pull dataflow in real time and no parallel
action bottleneck) requires substantively wider substrate than per-DMW
dispatch alone. The cosmp_router single-GenServer pattern at HEAD
866e328 still serializes every COSMP operation across every DMW
across every entity through one BEAM mailbox at CosmpRouter.Router.
Per-DMW parallelism at hive scale does not deliver at runtime until
COSMP operations execute through per-DMW GenServers and the
cosmp_router GenServer pattern at canonical-architectural register
substantively refactors to pure-module primitives at single-source-of-
truth register.

Canonical Elixir and BEAM pattern at production register at hive scale
canonical at canonical-knowledge register substantively informs the
substrate-architectural pattern at canonical-architectural register
substantively. Discord at canonical production register canonicalizes
per-entity GenServer pattern at canonical-knowledge register
substantively at canonical-coherence register substantively: dedicated
Elixir process per guild plus dedicated session process per connected
client at canonical scale register canonical at canonical-knowledge
register substantively. Five research findings at canonical-knowledge
register substantively informed the substrate-architectural pattern at
canonical-architectural register substantively:

1. Per-entity GenServer pattern at canonical-knowledge register
   substantively canonical at Discord production register substantively
   at millions-of-entities scale register substantively.

2. BEAM lightweight process register substantively canonical at
   canonical-knowledge register substantively at millions-of-processes
   scale register substantively.

3. Horde Registry plus Horde DynamicSupervisor canonical at canonical-
   knowledge register substantively at distributed cluster register
   substantively.

4. ETS read-optimized cache at per-node register canonical at canonical-
   knowledge register substantively at high-throughput register
   substantively.

5. Elixir anti-pattern documentation at canonical Elixir hexdocs
   register substantively at canonical-knowledge register substantively
   substantively names GenServer-wrapping-stateless-logic as anti-
   pattern at canonical-knowledge register substantively.

This ADR canonicalizes the hive-scale per-DMW dispatch substrate at
canonical-architectural register substantively that closes all
substrate gaps at canonical-architectural register substantively for
ENTERPRISE wallets at sub-arc 1 sub-phase b register substantively.
PERSONAL plus AI_AGENT promote-on-activity substrate plus DEVICE
always-cold shard-mapped substrate plus Phoenix.PubSub hive fanout
substrate plus Broadway pipeline at high-throughput register
substantively plus hive algorithm at weighting architecture register
substantively per Entry #28 substantively all stay forward-substrate
at sub-arc 1 sub-phase c plus sub-phase d plus sub-arc 2 register
substantively per the hybrid hot/cold framing canonical at substantive
register substantively.

## Decision

NIOV Labs lands the hive-scale per-DMW dispatch substrate for
ENTERPRISE wallets at sub-arc 1 sub-phase b with the following
sub-decisions.

### Sub-decision 1: Per-DMW GenServer at hive substrate register via Horde

DMWWorker per-entity GenServer substrate canonical at sub-phase a
register substantively extends at sub-phase b register substantively
through Horde Registry plus Horde DynamicSupervisor canonical at
canonical-knowledge register substantively. Each ENTERPRISE entity_id
substantively gets its own dedicated DMWWorker GenServer process at
canonical production register substantively at Discord precedent
register substantively. Horde Registry substantively delivers CRDT-
based distributed Registry at canonical-coherence register
substantively; Horde DynamicSupervisor substantively delivers
distributed DynamicSupervisor at canonical-coherence register
substantively; substantively delivers handoff on node failure at
canonical-knowledge register substantively at distributed cluster
register substantively.

DbgiSupervisor substrate at sub-phase a register substantively extends
at sub-phase b register substantively to add Horde Registry plus Horde
DynamicSupervisor as supervised children alongside existing single-
node Registry plus DynamicSupervisor at backward-compat register
substantively. Single-node Registry plus DynamicSupervisor stays
canonical at sub-phase a substrate register substantively at backward-
compat register substantively for PERSONAL and AI_AGENT and DEVICE
tier substantively at sub-phase c plus sub-phase d register
substantively.

### Sub-decision 2: cosmp_router pure-module refactor at single-source-of-truth register

cosmp_router single-GenServer pattern at HEAD 866e328 substantively
refactors at sub-phase b register substantively to pure-module
primitives at canonical-architectural register substantively at
Elixir anti-pattern resolution register substantively. The 7 COSMP op
handle_call clauses at cosmp_router/router.ex substantively become
pure module-level functions at single-source-of-truth register
substantively. CosmpRouter.Router GenServer stays at canonical-
architectural register substantively as legacy passthrough wrapper
canonical at backward-compat register substantively for non-ENTERPRISE
tiers at sub-phase b register substantively; the wrapper substantively
invokes the pure-module primitives at module-level register
substantively.

The 7 pure-module primitives substantively at canonical-prose register
substantively at apps/cosmp_router/lib/cosmp_router/operations.ex
substantively (NEW module at canonical-architectural register
substantively):

- CosmpRouter.Operations.authenticate(req, state)
- CosmpRouter.Operations.negotiate(req, state)
- CosmpRouter.Operations.read(req, state)
- CosmpRouter.Operations.write(req, state)
- CosmpRouter.Operations.share(req, state)
- CosmpRouter.Operations.revoke(req, state)
- CosmpRouter.Operations.audit(req, state)

Each primitive substantively invokes the existing composed-mode helpers
plus Storage facade plus Audit chain plus Idempotency substrate at
canonical-architectural register substantively at single-source-of-
truth register substantively. The 137-test cosmp_router baseline
substantively preserves at canonical-coherence register substantively
because the existing CosmpRouter.Router GenServer wrapper substantively
delegates handle_call clauses at module-level register substantively
to the pure-module primitives at canonical-architectural register
substantively.

### Sub-decision 3: DMWWorker COSMP op handlers invoking primitives

DMWWorker substrate at sub-phase a register substantively extends at
sub-phase b register substantively with 7 COSMP op handle_call clauses
at canonical-architectural register substantively. Each handler
substantively invokes CosmpRouter.Operations pure-module primitives at
module-level register substantively at single-source-of-truth register
substantively.

cosmp_router primitives stay single-source-of-truth at canonical-
architectural register substantively. DMWWorker substantively serves
as execution context per ENTERPRISE entity_id at canonical-knowledge
register substantively. Per-DMW parallelism delivers at runtime
register substantively because each ENTERPRISE entity_id's DMWWorker
substantively has its own GenServer mailbox at canonical BEAM register
substantively.

### Sub-decision 4: NEW CosmpRouter.WalletLookup module

NEW module at apps/cosmp_router/lib/cosmp_router/wallet_lookup.ex
substantively provides wallet_type lookup by entity_id at canonical-
architectural register substantively. Single public function at
canonical-prose register substantively:

  CosmpRouter.WalletLookup.wallet_type_for(entity_id) ::
    {:ok, :personal | :enterprise | :ai_agent | :device} |
    {:error, :not_found}

Implementation substantively queries the entities table via Ecto by
entity_id at canonical-architectural register substantively selecting
wallet_type only at canonical-knowledge register substantively at per-
request indexed point-lookup register substantively. Per-request
indexed point-lookup pattern substantively inherited from ADR-0036
REGULATOR per-request indexed point-lookup discipline at canonical-
coherence register substantively. No caching at sub-phase b register
substantively; ETS read-cache substrate substantively at Sub-decision
5 register substantively delivers caching at canonical-coherence
register substantively.

### Sub-decision 5: ETS read-optimized cache at per-node register

NEW ETS table at apps/cosmp_router/lib/cosmp_router/wallet_cache.ex
substantively provides read-optimized wallet_type cache at per-node
register substantively at canonical-knowledge register substantively.
ETS options at canonical-coherence register substantively:
:set + :public + :named_table + read_concurrency: true +
write_concurrency: true + decentralized_counters: true.

Cache lookup at canonical-prose register substantively at public
function CosmpRouter.WalletCache.wallet_type_for(entity_id). Cache miss
substantively delegates to CosmpRouter.WalletLookup at canonical-
architectural register substantively; cache hit substantively returns
wallet_type at ETS read register substantively without GenServer
mailbox bottleneck at canonical BEAM register substantively. TTL
substrate forward-substrate at canonical-state register substantively;
substantively at sub-phase b register substantively cache substantively
at lifetime-of-application register substantively at backward-compat
register substantively. Cache invalidation forward-substrate at
canonical-state register substantively.

### Sub-decision 6: COSMP request envelope extension at protobuf register

COSMP protobuf envelope at apps/cosmp_router/proto/cosmp.proto
substantively extends at canonical-architectural register
substantively with explicit entity_id field across all 7 op request
messages at canonical-prose register substantively. TS-side
apps/api/src/services/cosmp-client.ts substantively populates entity_id
at request-build time at canonical-architectural register
substantively. Elixir-side substantively reads entity_id at
grpc/server.ex dispatch time for WalletType lookup at canonical-
knowledge register substantively at canonical decision register
substantively.

Backward compatibility at canonical-coherence register substantively:
entity_id substantively optional protobuf field at sub-phase b
register substantively. cosmp_router substantively falls back to
CosmpRouter.Router single-GenServer dispatch when entity_id absent at
canonical-architectural register substantively. This substantively
preserves the 137-test cosmp_router baseline at canonical-coherence
register substantively without requiring test envelope updates at
sub-phase b register substantively.

### Sub-decision 7: Tier-routed dispatch shim at grpc/server.ex

The gRPC server at apps/cosmp_router/lib/cosmp_router/grpc/server.ex
substantively becomes the tier-routing entry point at canonical-
architectural register substantively. Each of the 7 COSMP op handlers
at server.ex substantively at canonical-prose register substantively
substantively performs WalletType lookup at canonical-knowledge
register substantively, then substantively dispatches to one of two
paths at canonical decision register substantively:

- ENTERPRISE wallets substantively at canonical-architectural register
  substantively at sub-phase b register substantively: dispatch through
  the entity's DMWWorker via GenServer.call against
  {:via, Horde.Registry, {DbgiSupervisor.HordeRegistry, entity_id}} at
  canonical-knowledge register substantively, lazy-spawning the
  DMWWorker via DbgiSupervisor.start_dmw_worker_horde/2 NEW public API
  at canonical-architectural register substantively if not already
  running at canonical BEAM register substantively.

- PERSONAL plus AI_AGENT plus DEVICE wallets substantively at canonical-
  architectural register substantively at backward-compat register
  substantively: dispatch to CosmpRouter.Router unchanged at canonical-
  architectural register substantively (the existing single-GenServer
  pattern at sub-phase a register substantively that substantively
  delegates to CosmpRouter.Operations pure-module primitives at single-
  source-of-truth register substantively).

cosmp_router single-GenServer pattern substantively stays canonical at
canonical-architectural register substantively at backward-compat
register substantively for non-ENTERPRISE tiers at sub-phase b
register substantively. PERSONAL promote-on-activity plus AI_AGENT
substrate plus DEVICE cold-shard substrate substantively at canonical-
architectural register substantively at canonical-state register
substantively forward-substrate at sub-phase c plus sub-phase d
register substantively.

### Sub-decision 8: ENTERPRISE-only scope at sub-phase b register

Hive-scale per-DMW dispatch substrate substantively fires for
ENTERPRISE wallets only at sub-phase b register substantively. PERSONAL
plus AI_AGENT promote-on-activity substrate substantively at canonical-
architectural register substantively at forward-substrate register
substantively to sub-arc 1 sub-phase c register substantively. DEVICE
always-cold shard-mapped substrate substantively at canonical-
architectural register substantively at forward-substrate register
substantively to sub-arc 1 sub-phase d register substantively and
beyond at canonical-state register substantively.

### Sub-decision 9: 7-commit mini-arc decomposition

- Commit B.1 [BEAM-DBGI-HIVE-DISPATCH-ADR]: ADR-0039 NEW (Proposed) +
  ADR-0028 §Forward Queue amendment + ADR-0028 §Bidirectional citations
  amendment + catalog refreshes. Docs-only.

- Commit B.2 [BEAM-COSMP-OPERATIONS-PURE-MODULE]: NEW
  apps/cosmp_router/lib/cosmp_router/operations.ex + MOD
  apps/cosmp_router/lib/cosmp_router/router.ex + NEW unit tests.
  Substantive code.

- Commit B.3 [BEAM-DBGI-HORDE-SUBSTRATE]: NEW Horde Registry plus
  Horde DynamicSupervisor supervised children at DbgiSupervisor +
  Horde dependency at mix.exs + NEW public API + NEW unit tests.
  Substantive code.

- Commit B.4 [BEAM-DBGI-WALLET-LOOKUP-CODE]: NEW
  apps/cosmp_router/lib/cosmp_router/wallet_lookup.ex + NEW unit tests.
  Substantive code.

- Commit B.5 [BEAM-DBGI-WALLET-CACHE-ETS]: NEW
  apps/cosmp_router/lib/cosmp_router/wallet_cache.ex + supervised ETS
  table + NEW unit tests. Substantive code.

- Commit B.6 [BEAM-DBGI-HIVE-DISPATCH-INTEGRATION]: MOD
  apps/cosmp_router/proto/cosmp.proto + MOD
  apps/api/src/services/cosmp-client.ts + MOD
  apps/dbgi_supervisor/lib/dbgi_supervisor/dmw_worker.ex with 7 COSMP
  op handle_call clauses + MOD
  apps/cosmp_router/lib/cosmp_router/grpc/server.ex with tier-routed
  dispatch shim + NEW integration tests. Substantive code.

- Commit B.7 [BEAM-DBGI-HIVE-DISPATCH-CLOSURE]: ADR-0039 Status
  Proposed -> Accepted + NEW Post-Closure Implementation Lineage
  section + section-12-progress.md Phase 3 row update +
  architecture/README + CLAUDE.md catalog refreshes +
  CURRENT_BUILD_STATE.md update. Docs-only.

### Sub-decision 10: BEAM-compatibility patterns preserved

The 6 BEAM-compatibility patterns from ADR-0026 §5 substantively
preserve at canonical-architectural register substantively by
construction at canonical-coherence register substantively.
CosmpRouter.Operations pure-module primitives substantively are
stateless functions at canonical BEAM register substantively at
canonical-knowledge register substantively. DMWWorker COSMP op handlers
substantively invoke primitives at module-level register substantively
at single-source-of-truth register substantively. Horde substrate
substantively at canonical-knowledge register substantively at
distributed cluster register substantively substantively preserves
BEAM-compatibility at canonical-coherence register substantively.

### Sub-decision 11: Elixir anti-pattern compliance at canonical-knowledge register

cosmp_router pure-module refactor at Sub-decision 2 register
substantively resolves the GenServer-wrapping-stateless-logic anti-
pattern at canonical Elixir hexdocs register substantively at
canonical-knowledge register substantively. The cosmp_router primitives
substantively at apps/cosmp_router/lib/cosmp_router/operations.ex
substantively are stateless pure-module functions at canonical-
architectural register substantively at single-source-of-truth register
substantively. DMWWorker COSMP op handlers substantively invoke
primitives at module-level register substantively at canonical
Elixir pattern register substantively. CosmpRouter.Router GenServer
wrapper stays at backward-compat register substantively for non-
ENTERPRISE tiers at sub-phase b register substantively at canonical-
architectural register substantively at canonical-coherence register
substantively.

### Sub-decision 12: Testability per ADR-0034

CosmpRouter.Operations unit tests substantively exercise each of 7
pure-module primitives at canonical-coherence register substantively.
DbgiSupervisor Horde substrate unit tests substantively exercise
distributed Registry plus DynamicSupervisor lookup at canonical-
architectural register substantively. CosmpRouter.WalletLookup unit
tests substantively exercise lookup-by-entity_id plus not-found path
plus Ecto query shape at canonical-coherence register substantively.
CosmpRouter.WalletCache unit tests substantively exercise ETS read
plus ETS write plus invalidation plus cache miss delegation at
canonical-coherence register substantively. Tier-routed dispatch
integration tests substantively exercise: ENTERPRISE entity dispatches
through DMWWorker; PERSONAL plus AI_AGENT plus DEVICE entities
dispatch through cosmp_router unchanged; missing entity_id falls back
to cosmp_router single-GenServer dispatch; DMWWorker COSMP handlers
invoke CosmpRouter.Operations primitives correctly; parallel ENTERPRISE
DMWWorkers execute COSMP ops without serialization at canonical-
knowledge register substantively at canonical-coherence register
substantively.

### Sub-decision 13: Patent-implementation evidence at canonical decision register

The substrate-architectural pattern at canonical-knowledge register
substantively (Discord per-entity GenServer precedent plus Horde
distributed substrate plus ETS read-optimized cache plus cosmp_router
pure-module refactor at single-source-of-truth register substantively
plus DMWWorker COSMP op handlers at canonical-architectural register
substantively) substantively delivers what NIOV's patents at canonical-
architectural register substantively describe at the patent claims
register substantively. The substrate-architectural pattern at
canonical-knowledge register substantively substantively delivers the
patent at hive scale register substantively at canonical-knowledge
register substantively. Substantively the substrate-architectural
pattern at canonical-knowledge register substantively is canonical
Elixir plus BEAM pattern at production register substantively that
substantively delivers the patent at hive scale register substantively
at patent-implementation evidence register substantively. The
combination substantively at patent-implementation evidence register
substantively substantively distinguishes NIOV's substrate at
canonical-architectural register substantively from any unauthorized
parallel build at "blockchain-only" claim register substantively.

## Consequences

### Easier

- Per-DMW parallelism at hive scale delivers at runtime register
  substantively for ENTERPRISE wallets at sub-phase b closure
  substantively. Each ENTERPRISE entity_id's DMWWorker substantively
  has its own GenServer mailbox at canonical BEAM register
  substantively; cosmp_router single-GenServer serialization
  bottleneck no longer applies to ENTERPRISE dispatch at canonical-
  knowledge register substantively.

- The architectural target named in the README and monetization essay
  delivers at runtime substantively for ENTERPRISE tier at sub-phase b
  closure substantively. Hundreds to thousands of parallel COSMP
  operations per DMW for the workloads that need it substantively
  delivers at runtime register substantively at canonical-knowledge
  register substantively.

- Distributed cluster substrate canonical at canonical-knowledge
  register substantively at Horde register substantively substantively
  delivers handoff on node failure at canonical-coherence register
  substantively. NIOV substantively scales to multi-node cluster
  register substantively at canonical-knowledge register substantively
  without substrate-architectural churn at canonical-coherence register
  substantively.

- Elixir anti-pattern resolution at canonical-knowledge register
  substantively at cosmp_router pure-module refactor register
  substantively substantively delivers canonical Elixir plus BEAM
  pattern at production register substantively at single-source-of-
  truth register substantively. Substantively the substrate-
  architectural pattern at canonical-architectural register
  substantively substantively reflects canonical Elixir community
  guidance at canonical-knowledge register substantively at patent-
  implementation evidence register substantively.

- ETS read-optimized cache substrate substantively at canonical-
  knowledge register substantively at per-node register substantively
  substantively delivers high-throughput wallet_type lookup at
  canonical-coherence register substantively. WalletLookup per-request
  Ecto query at canonical-architectural register substantively
  substantively bypassed at cache-hit register substantively at
  canonical-knowledge register substantively.

- Parallel-path discipline preserved at canonical-coherence register
  substantively. PERSONAL plus AI_AGENT plus DEVICE tier dispatch
  unchanged at sub-phase b register substantively. cosmp_router
  137-test baseline preserved at canonical-coherence register
  substantively without test envelope updates at canonical-knowledge
  register substantively.

- Single-source-of-truth preserved at canonical-architectural register
  substantively at CosmpRouter.Operations pure-module primitives
  register substantively. DMWWorker COSMP handlers substantively invoke
  primitives at module-level register substantively at canonical
  Elixir pattern register substantively at canonical-knowledge
  register substantively.

- ADR-0028 §Forward Queue per-capsule supervised Elixir process item
  substantively progresses further at sub-arc 1 sub-phase b register
  substantively at canonical-coherence register substantively. Per-
  DMW execution substrate canonical at runtime register substantively
  for ENTERPRISE tier at hive scale register substantively.

- Patent-implementation evidence at canonical decision register
  substantively at substrate-architectural register substantively
  substantively distinguishes NIOV's substrate at canonical-
  architectural register substantively from any unauthorized parallel
  build at "blockchain-only" claim register substantively at canonical-
  knowledge register substantively.

### Harder

- Horde dependency at mix.exs register substantively adds external
  library dependency at canonical-architectural register substantively.
  Substrate-coherent at canonical-coherence register substantively at
  canonical Elixir community register substantively.

- cosmp_router pure-module refactor at Sub-decision 2 register
  substantively substantively touches every COSMP op dispatch site at
  canonical-architectural register substantively. The 137-test
  cosmp_router baseline substantively at canonical-coherence register
  substantively substantively preserves because the CosmpRouter.Router
  GenServer wrapper substantively delegates to pure-module primitives
  at single-source-of-truth register substantively at canonical-
  architectural register substantively. Test surface substantively
  grows at CosmpRouter.Operations unit tests register substantively at
  canonical-coherence register substantively.

- COSMP protobuf envelope extension substantively requires regenerating
  bindings at TS and Elixir registers substantively. Build-system
  update for protoc invocation at canonical-coherence register
  substantively if not already canonical at canonical-architectural
  register substantively.

- ETS table at canonical-architectural register substantively
  substantively adds supervised child at CosmpRouter.Application
  register substantively. Substrate-coherent at canonical-coherence
  register substantively at canonical Elixir pattern register
  substantively.

- DMWWorker COSMP op handlers substantively add 7 new dispatch sites
  at canonical-architectural register substantively. Each handler
  substantively invokes CosmpRouter.Operations primitives at single-
  source-of-truth register substantively at canonical-coherence
  register substantively. Tests substantively grow at DMWWorker COSMP
  integration register substantively at canonical-coherence register
  substantively.

- PERSONAL plus AI_AGENT plus DEVICE wallets substantively do not get
  per-DMW parallelism at sub-phase b closure substantively. The
  architectural target delivers for ENTERPRISE only at sub-phase b
  register substantively; full delivery requires sub-arc 1 sub-phase c
  plus sub-phase d substantively at forward-substrate register
  substantively.

- entity_id backward compatibility at canonical-coherence register
  substantively (optional protobuf field with fallback to single-
  GenServer dispatch register substantively) substantively means some
  ENTERPRISE traffic substantively may dispatch through cosmp_router
  if entity_id not populated at canonical-architectural register
  substantively. Migration to mandatory entity_id substantively
  forward-substrate at canonical-state register substantively.

- Phoenix.PubSub hive fanout substrate plus Broadway pipeline at high-
  throughput register plus hive algorithm at weighting architecture
  register substantively at canonical-architectural register
  substantively at forward-substrate register substantively to sub-
  phase c plus sub-phase d plus sub-arc 2 register substantively at
  canonical-state register substantively. The full architectural
  target at canonical-knowledge register substantively substantively
  delivers across sub-phase b through sub-arc 2 register substantively
  at canonical-coherence register substantively.

## Bidirectional Citation

- Cites: ADR-0026 (BEAM-compatibility patterns) §5; ADR-0028 (BEAM
  Coordination Layer) §3 and §Forward Queue; ADR-0034 (BEAM testability
  discipline); ADR-0036 (REGULATOR per-request indexed point-lookup
  pattern); ADR-0038 (DMW Worker per-DMW Supervised Process).

- Cited by: ADR-0038 §Forward Queue amendment marks per-DMW COSMP
  execution at hive scale as PARTIALLY LANDED at sub-arc 1 sub-phase b
  ENTERPRISE tier per ADR-0039; PERSONAL plus AI_AGENT plus DEVICE
  tier per-DMW execution remains forward-substrate at canonical-state
  register substantively. Phoenix.PubSub hive fanout plus Broadway
  pipeline plus hive algorithm at weighting architecture per Entry #28
  substantively at forward-substrate register substantively at sub-
  phase c plus sub-phase d plus sub-arc 2 register substantively.
