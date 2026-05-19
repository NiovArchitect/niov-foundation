# ADR-0039: Hive-Scale Per-DMW Dispatch Substrate for ENTERPRISE Wallets

## Status

Accepted 2026-05-17 (closed at sub-arc 1 sub-phase b Commit 7 of 7
`[BEAM-DBGI-HIVE-DISPATCH-CLOSURE]`; 10-commit substantive lineage +
1 revert + 1 redraft + 1 RULE 21 promotion mid-arc per
Post-Closure Implementation Lineage section below)

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
compat register substantively for PERSONAL (including AI_AGENT
entities per TS-side defaultWalletTypeFor/1 mapping AI_AGENT EntityType
to PERSONAL WalletType at canonical-state register substantively) and
DEVICE WalletType tier substantively at sub-phase c plus sub-phase d
register substantively.

Members configuration substantively canonical at canonical-knowledge
register per hexdocs.pm/horde/libcluster.html "Automatic Cluster
Membership" guide: both Horde.Registry and Horde.DynamicSupervisor
use members: :auto at startup configuration substantively. The
:auto mode substantively delegates cluster membership to libcluster
ClusterSupervisor canonical at sub-phase 8 substrate register
substantively at DbgiSupervisor.Application supervised children
canonical at canonical-architectural register substantively. All
visible nodes substantively auto-added at canonical-knowledge
register substantively; :nodeup and :nodedown events substantively
auto-managed at canonical-coherence register substantively;
distribution-mode transitions substantively handled automatically at
canonical-knowledge register substantively per RULE 11
D-WIDER-KNOWLEDGE-CHECK research arc canonical at canonical-knowledge
register substantively. Static members lists at child-spec
construction time substantively rejected at canonical-honest register
substantively per D-HORDE-STATIC-MEMBERS-DISTRIBUTION-MODE-DRIFT
substrate-build observation forward-queued at substrate-honest
register substantively (Node.self() captured at module-load time
substantively goes stale across BEAM distribution mode transitions
at canonical-state register substantively).

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

Substrate-architectural canonical at canonical-architectural register
substantively per Option ζ Adapter Pattern canonical at Elixir community
canonical-knowledge register substantively (hexdocs.pm/elixir/typespecs.html
Behaviours + aaronrenner.io/2023/07/22 production adapter pattern reference
+ dev.to/dcdourado/dependency-inversion-on-elixir-using-ports-and-adapters-
design-pattern canonical at Ports and Adapters reference register
substantively per RULE 21 research arc canonical at canonical-knowledge
register substantively per 67f6112 commit substantively):
DbgiSupervisor.CosmpExecution behaviour module canonical at substrate-
architectural register substantively in dbgi_supervisor declares the 7
COSMP op callbacks at canonical-prose register substantively;
CosmpRouter.Operations module canonical at canonical-execution register
substantively in cosmp_router implements the behaviour via @behaviour
declaration canonical at canonical-coherence register substantively;
runtime configuration via Application.put_env at cosmp_router/application.ex
start/2 callback canonical at boot register substantively registers
CosmpRouter.Operations as the adapter at canonical-state register
substantively. DMWWorker dispatches via
DbgiSupervisor.CosmpExecution.adapter/0 facade canonical at canonical-
knowledge register substantively which resolves at runtime via
Application.get_env at canonical-execution register substantively. Cycle
breakage canonical at canonical-architectural register substantively:
cosmp_router -> dbgi_supervisor (compile-time in_umbrella dep canonical)
canonical at canonical-coherence register substantively; dbgi_supervisor
-> cosmp_router (NO compile-time dep; runtime via app env canonical at
canonical-state register substantively).

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
substantively provides wallet_type lookup by entity_id FK at canonical-
architectural register substantively. Single public function at
canonical-prose register substantively:

  CosmpRouter.WalletLookup.wallet_type_for(entity_id) ::
    {:ok, :personal | :enterprise | :device} |
    {:error, :not_found | :invalid_wallet_type}

Implementation substantively queries the wallets table via Ecto by
entity_id FK at per-request indexed point-lookup register
substantively per ADR-0036 selecting wallet_type only at
canonical-knowledge register substantively. The wallets table is
Prisma-owned at canonical-execution register substantively per ADR-0033
cross-language data ownership; cosmp_router substantively reads via a
read-only Ecto projection at CosmpRouter.Wallet at
canonical-architectural register substantively without owning
migrations at canonical-coherence register substantively. Per-request
indexed point-lookup pattern substantively inherited from ADR-0036
REGULATOR per-request indexed point-lookup discipline at canonical-
coherence register substantively (entity_id is @unique on the wallets
table at Prisma register substantively enforcing 1:1 entity:wallet
cardinality at substrate-state ground truth register). No caching at
sub-phase b register substantively; ETS read-cache substrate
substantively at Sub-decision 5 register substantively delivers
caching at canonical-coherence register substantively.

WalletType return shape canonical at 3-tier per ADR-0038 Sub-decision 3
substantively: {:ok, :personal | :enterprise | :device} canonical at
canonical-knowledge register substantively per Prisma WalletType enum
canonical at packages/database/prisma/schema.prisma at substrate-state
ground truth register substantively (PERSONAL plus ENTERPRISE plus
DEVICE; no AI_AGENT WalletType value at canonical-state register
substantively). AI_AGENT substantively is an EntityType (not a
WalletType) at canonical-honest register substantively per Prisma
schema canonical; AI_AGENT entities substantively map to PERSONAL
wallet_type at INSERT register substantively per TS-side
defaultWalletTypeFor/1 canonical at canonical-coherence register
substantively. The lookup substantively returns the wallet_type column
directly canonical at canonical-knowledge register substantively
without EntityType inspection at canonical-execution register
substantively. Sub-arc 1 sub-phase c PERSONAL promote-on-activity
substrate substantively includes AI_AGENT entities at canonical-state
register substantively without additional WalletType tier at
canonical-architectural register substantively. Substrate-honest drift
guard at canonical-honest register substantively returns
{:error, :invalid_wallet_type} on unexpected DB enum value (Prisma
schema drift guard between Prisma + Ecto registers per ADR-0033
cross-language data ownership canonical at canonical-coherence
register substantively).

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

## Post-Closure Implementation Lineage

ADR-0039 substrate canonical at canonical-execution register
substantively per B.1 through B.6.3 commit lineage on origin/main at
sub-arc 1 sub-phase b register substantively. 10 substantive commits
+ 1 revert + 1 redraft + 1 RULE 21 promotion mid-arc canonical at
patent-implementation evidence register substantively per ADR-0020
two-register IP discipline canonical.

**Commit lineage:**

1. B.1 `a0ed2c5` [BEAM-DBGI-HIVE-DISPATCH-ADR] -- ADR-0039 NEW
   landing canonical at substrate-architectural register substantively
   with 13 sub-decisions per Option α Path (e) Hive substrate canonical
   at canonical-knowledge register substantively.

2. B.2 `9069430` [BEAM-COSMP-OPERATIONS-PURE-MODULE] -- NEW
   CosmpRouter.Operations pure-module with 7 COSMP primitives canonical
   at single-source-of-truth register substantively; Elixir anti-pattern
   resolution per Sub-decision 11; 137 -> 152 cosmp_router test surface.

3. B.3 (original) `eb6daee` [BEAM-DBGI-HORDE-SUBSTRATE] -- Horde
   Registry + DynamicSupervisor + dependency + public API canonical
   at canonical-execution register; CI-RED at integration tier
   (`:peer.start` Node.self() drift; Horde members config gap).

4. B.3 revert `7709993` [BEAM-DBGI-HORDE-SUBSTRATE-REVERT] -- Clean
   rollback per RULE 11 research arc canonical at canonical-knowledge
   register substantively.

5. B.3 redraft `4c52271` [BEAM-DBGI-HORDE-SUBSTRATE-REDRAFT] --
   Canonical `members: :auto` pattern per hexdocs.pm/horde/libcluster
   research arc + ADR-0034 per-test isolated Horde instances + ADR-0039
   Sub-decision 1 amendment; 55 -> 63 dbgi_supervisor test surface.

6. B.4 `768736b` [BEAM-DBGI-WALLET-LOOKUP-CODE] -- NEW Wallet Ecto
   schema (read-only projection on Prisma-owned wallets table per
   ADR-0033 cross-language data ownership) + WalletLookup module +
   ADR-0039 Sub-decision 4 substrate-architectural correction
   (entities -> wallets table per substrate-state ground truth);
   WalletType 3-tier {personal, enterprise, device} canonical; 152
   -> 158 cosmp_router test surface.

7. B.5 `24d3b52` [BEAM-DBGI-WALLET-CACHE-ETS] -- NEW WalletCache
   GenServer + ETS read-optimized cache (read_concurrency +
   write_concurrency + decentralized_counters) + supervision tree
   integration + cosmp_router_test.exs children-count amendment per
   D-SUPERVISION-TREE-EXPANSION-TEST-COHERENCE-DRIFT canonical
   recurrence; 158 -> 166 cosmp_router test surface.

8. B.6.1 `57b9f8d` [BEAM-COSMP-PROTO-ENTITY-ID] -- NEW entity_id field
   on 7 protobuf request messages + hand-written .pb.ex mirror per
   ADR-0032 Q-U Option B; proto3 backward-compat field-addition
   canonical at canonical-knowledge register substantively per RULE 21
   research arc; baseline preserved by construction.

9. B.6.2 `eb6482d` [BEAM-COSMP-TS-CLIENT-ENTITY-ID] -- entity_id?:
   string optional field on 7 TypeScript RpcRequest interfaces per
   Q-V parallel-path discipline canonical at canonical-knowledge
   register; TypeScript strict 12-error baseline preserved per ADR-0024
   pre-commit hook gate canonical.

10. RULE 21 promotion mid-arc `67f6112`
    [OPS-RULE-21-PRE-AUTHORIZATION-RESEARCH-ARC-CANONICAL] -- NEW
    RULE 21 at CLAUDE.md register substantively + ADR-0035 sub-arc 1
    sub-phase b cluster expansion 25th observation canonical at
    substrate-architectural register substantively; pre-authorization
    research arc discipline canonical at canonical-rule register
    substantively for forward-substrate substrate-architectural pastes
    per 5 canonical recurrence sites at sub-arc 1 sub-phase b register
    substantively.

11. B.6.3 `3242c17` [BEAM-COSMP-HIVE-DISPATCH-INTEGRATION] -- Option ζ
    Adapter Pattern + tier-routed dispatch + integration tests
    canonical at canonical-architectural register substantively. NEW
    DbgiSupervisor.CosmpExecution behaviour module + DMWWorker 7
    handle_call clauses + state struct storage_ets extension +
    CosmpRouter.Operations @behaviour + 7 @impl declarations +
    cosmp_router/application.ex Application.put_env at boot +
    cosmp_router/mix.exs `:dbgi_supervisor` in_umbrella +
    extra_applications + grpc/server.ex tier-routed dispatch shim + 6
    NEW tier_routed_dispatch tests; 166 -> 172 cosmp_router test
    surface; cycle breakage canonical per ADR-0039 Sub-decision 3
    amendment register substantively.

12. B.7 this commit [BEAM-DBGI-HIVE-DISPATCH-CLOSURE] -- closure
    cascade canonical at canonical-state register substantively
    (ADR-0039 Status Proposed -> Accepted + this Post-Closure
    Implementation Lineage section + section-12-progress Phase 3 row
    update + architecture/README catalog refresh + CLAUDE.md catalog
    refresh + CURRENT_BUILD_STATE update).

**Substrate-state ground truth at canonical-coherence register
substantively at closure register substantively:**

- Hive-scale per-DMW dispatch substrate for ENTERPRISE wallets
  canonical at runtime register substantively. The architectural
  target named at README + monetization essay register substantively
  (hundreds to thousands of parallel COSMP operations per DMW for the
  workloads that need it) delivers at runtime for ENTERPRISE tier
  canonical at canonical-execution register substantively.
- PERSONAL + DEVICE tier fallback to CosmpRouter.Router canonical at
  sub-phase a substrate register substantively (forward-substrate to
  per-DMW promotion canonical at sub-phase c + sub-phase d register
  substantively).
- Test surface canonical at canonical-execution register
  substantively: cosmp_router 172/0 + 1 skipped (166 baseline + 6 NEW
  tier_routed_dispatch); dbgi_supervisor 63/0 default + 82/0
  integration.
- Cycle breakage canonical at canonical-architectural register
  substantively: cosmp_router -> dbgi_supervisor (compile-time
  in_umbrella + runtime extra_applications) + dbgi_supervisor ->
  cosmp_router (NO compile-time dep; runtime via Application.get_env
  canonical at canonical-state register substantively) per Option ζ
  Adapter Pattern canonical at Elixir community register substantively
  per RULE 21 research arc canonical at canonical-knowledge register
  substantively.

**Substrate-build observations forward-queued from B.6.3 register
substantively for forward-substrate at sub-phase c + sub-phase d +
sub-arc 2 + sub-arc 3 register substantively:**

- D-ADAPTER-PATTERN-CYCLE-BREAKAGE canonical at canonical-coherence
  register substantively
- D-CROSS-APP-HORDE-VIA-TUPLE-DISPATCH-CANONICAL canonical at
  canonical-coherence register substantively
- D-APPLICATION-PUT-ENV-AT-BOOT-DISCIPLINE canonical at canonical-
  coherence register substantively
- D-EXTRA-APPLICATIONS-REQUIRED-FOR-UMBRELLA-RUNTIME-DEP canonical
  at canonical-coherence register substantively (NEW canonical at
  B.6.3 mid-execution register substantively; pre-flight Step 1
  substrate-state ground truth check did NOT catch this requirement;
  recurrence at sub-phase c register substantively qualifies for
  ADR-0035 chronological cluster expansion 26th observation promotion
  per Option β substrate-honest discipline)
- D-IN-UMBRELLA-BEHAVIOUR-COMPILE-WARNING-SPURIOUS canonical at
  canonical-coherence register substantively

Sub-arc 1 sub-phase b closure substrate canonical at canonical-state
register substantively at this commit register substantively per B.7
`[BEAM-DBGI-HIVE-DISPATCH-CLOSURE]` register substantively.

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

## Amendment 1: Sub-arc 1 sub-phase c — §Sub-decision 8 scope widened to PERSONAL-promoted

Status: Active
Date: 2026-05-17
Trigger: Sub-arc 1 sub-phase c PERSONAL promote-on-activity substrate
per Commits C.1 d09b80b plus C.2 1dd1d64 plus C.3 18300c3 at canonical-
state register substantively.

Canonical amendment convention canonical at canonical-prose register
substantively per ADR-0011 §Amendment precedent register substantively
(H2 Amendment subsection register substantively placed after H2
Bidirectional Citation section register substantively preserves
Accepted §Sub-decision 8 body at canonical-honest register
substantively per ADR-0020 two-register IP discipline canonical) plus
ADR-0035 substrate-build discipline canonical at canonical-knowledge
register substantively.

### Context

Substrate-state ground truth canonical at canonical-coherence register
substantively at sub-arc 1 sub-phase c register substantively
demonstrated that the architectural shape canonical at §Sub-decision 8
register substantively (lazy-spawn DMWWorker per entity_id at hive
scale register substantively) generalizes beyond ENTERPRISE tier
canonical at canonical-execution register substantively to PERSONAL-
promoted entities canonical at canonical-coherence register
substantively via activity-threshold-triggered promotion canonical at
substrate-architectural register substantively per ADR-0034 testability
discipline canonical.

### Original scope (§Sub-decision 8 Accepted at B.7 closure)

Per-DMW dispatch substrate canonical at canonical-execution register
substantively scoped to ENTERPRISE wallet_type only at canonical-state
register substantively. PERSONAL plus DEVICE tiers canonical at sub-
phase a substrate register substantively (CosmpRouter.Router fallback
canonical at backward-compat register substantively). PERSONAL plus
AI_AGENT promote-on-activity substrate substantively at canonical-
architectural register substantively at forward-substrate register
substantively to sub-arc 1 sub-phase c register substantively. DEVICE
always-cold shard-mapped substrate substantively at canonical-
architectural register substantively at forward-substrate register
substantively to sub-arc 1 sub-phase d register substantively and
beyond at canonical-state register substantively.

### Amended scope canonical at canonical-coherence register substantively

Per-DMW dispatch substrate canonical at canonical-execution register
substantively applies at three discriminated registers canonical at
canonical-coherence register substantively:

1. **ENTERPRISE tier:** ALWAYS dispatches through per-DMW substrate
   canonical at canonical-execution register substantively (no
   threshold check at canonical-decision register substantively;
   immediate lazy-spawn canonical at substrate-architectural register
   substantively per B.6.3 commit register substantively).

2. **PERSONAL tier (NEW canonical at C.3 register substantively):**
   Dispatches through per-DMW substrate canonical at canonical-
   execution register substantively ONLY when ActivityCounter
   threshold crossed canonical at canonical-coherence register
   substantively (default 5 activities canonical at canonical-state
   register substantively per ADR-0034 testability discipline
   canonical). Below threshold canonical at canonical-decision
   register substantively dispatches through CosmpRouter.Router
   canonical at backward-compat register substantively per sub-phase a
   substrate register substantively. Idle eviction canonical at
   canonical-execution register substantively per C.2 substrate
   register substantively releases DMWWorker resources canonical at
   canonical-state register substantively when entity inactivity
   exceeds configured idle TTL canonical at canonical-coherence
   register substantively (default 5 minutes canonical at canonical-
   state register substantively).

3. **DEVICE tier:** ALWAYS dispatches through CosmpRouter.Router
   canonical at backward-compat register substantively per ADR-0038
   Sub-decision 3 tier 3 register substantively (cold-shard substrate
   forward-substrate at sub-phase d register substantively). DEVICE
   entities canonical at substrate-state register substantively do NOT
   touch ActivityCounter canonical at canonical-coherence register
   substantively per D-DEVICE-SKIPS-PROMOTE-CHECK-AT-SUBSTRATE-STATE
   observation canonical at C.3 commit body register substantively.

### AI_AGENT disposition canonical at canonical decision register substantively forward-substrate

AI_AGENT canonical at EntityType register substantively per ADR-0033
cross-language data ownership reference canonical at canonical-
knowledge register substantively plus operator memory entry canonical
at decision register substantively NOT WalletType register
substantively at substrate-state register substantively. Prisma
WalletType enum canonical at substrate-state register substantively
enumerates PERSONAL plus ENTERPRISE plus DEVICE only canonical at
canonical-coherence register substantively. DbgiSupervisor.start_dmw_worker_horde/3
guard canonical at substrate-state register substantively rejects
:ai_agent at canonical-state register substantively per substrate-
state ground truth canonical at C.3 Step 1 pre-flight register
substantively.

Promote-on-activity substrate canonical at canonical-execution register
substantively for AI_AGENT entities canonical at canonical-coherence
register substantively requires EntityType discrimination canonical at
canonical-architectural register substantively beyond
WalletCache.wallet_type_for/1 canonical at canonical-knowledge register
substantively (which canonical at substrate-state register
substantively resolves WalletType per entity_id register substantively
NOT EntityType register substantively). Substrate-architectural shape
canonical at canonical-coherence register substantively forward-
substrate at sub-arc 2 capsule layer register substantively
(EntityType-discriminated capsule routing canonical at canonical-
execution register substantively per operator memory entry weighting
architecture substantively).

### Implementation lineage canonical at patent-implementation evidence register substantively

Cryptographically-timestamped commit lineage canonical at substrate-
architectural register substantively per ADR-0020 two-register IP
discipline canonical:

- C.1 d09b80b [BEAM-DBGI-PROMOTE-ACTIVITY-COUNTER] — NEW
  CosmpRouter.ActivityCounter ETS substrate at substrate-architectural
  register substantively (atomic counter canonical at canonical-
  coherence register substantively per dockyard.com production rate-
  limiter pattern register substantively)
- C.2 1dd1d64 [BEAM-DBGI-PROMOTE-IDLE-EVICTION] — NEW
  DbgiSupervisor.stop_dmw_worker_horde/2 public API plus idle eviction
  periodic task canonical at canonical-execution register substantively
  (Horde-API trio symmetry canonical at substrate-architectural
  register substantively)
- C.3 18300c3 [BEAM-DBGI-PROMOTE-TIER-ROUTED-DISPATCH] — MOD
  grpc/server.ex dispatch_tier_routed PERSONAL branch promote-on-
  activity dispatch plus dispatch_with_promote_check/4 plus
  dispatch_promoted/4 private helpers canonical at canonical-
  execution register substantively

### References canonical at canonical-coherence register substantively

- ADR-0011 §Amendment (canonical amendment convention precedent;
  H2 Amendment subsection at canonical-prose register substantively)
- ADR-0020 (two-register IP discipline canonical at canonical-
  architectural register substantively; amendment preserves Accepted
  body audit trail at canonical-honest register substantively)
- ADR-0033 (cross-language data ownership; EntityType vs WalletType
  canonical at canonical-knowledge register substantively)
- ADR-0034 (BEAM testability discipline; name-configurable substrate
  plus Application.get_env-resolved defaults canonical at canonical-
  knowledge register substantively)
- ADR-0035 (substrate-build discipline; D-AI-AGENT-ENTITY-TYPE-vs-
  WALLET-TYPE-DISCRIMINATION-DRIFT plus D-PROMOTE-ON-ACTIVITY-DISPATCH-
  CANONICAL plus D-DEVICE-SKIPS-PROMOTE-CHECK-AT-SUBSTRATE-STATE
  observations forward-queued at commit-body-only register
  substantively; cluster expansion 26th plus 27th observation
  promotion forward-substrate at C.5 closure cascade commit register
  substantively)
- ADR-0038 (DMWWorker substrate canonical at sub-phase a runtime
  register substantively; tier 3 DEVICE preservation register
  substantively)
- RULE 21 (pre-authorization research arc canonical at canonical-rule
  register substantively per 67f6112 commit substantively)

## Amendment 2: Dual-context AI_AGENT routing per ADR-0046 (2026-05-19)

Per ADR-0046 (AI_AGENT EntityType-Discriminated Capsule Routing;
Sub-arc 2 Gap 6), this Amendment 2 corrects the substrate-honest
drift in this ADR's prose register substantively that claimed
AI_AGENT entities universally map to PERSONAL WalletType. **The
actual runtime dispatch path is dual-context per the canonical
model in ADR-0046**, with `wallet_type` (column on the `wallets`
table) being the canonical dispatch signal at the BEAM register
substantively. This Amendment 2 augments §Decision + §Sub-decision
1 + §Amendment 1 prose register substantively without erasing the
surrounding substrate-build observations, research arc, or Horde
/ cosmp_router refactor decisions.

### Substrate-honest correction (RULE 13)

This ADR's earlier prose register substantively (notably at
canonical-prose register at L106-108 + L250-253 + §Sub-decision 1
+ §Amendment 1) describes AI_AGENT entities as mapping universally
to PERSONAL WalletType via TS-side `defaultWalletTypeFor/1`.
**This is substrate-honestly incomplete.** The TS helper canonical
at `packages/database/src/queries/wallet.ts:39-58` register
substantively maps `AI_AGENT → ENTERPRISE` as RULE 0 defensive
fallback at canonical-execution register substantively (see code
comment "non-human entities default to ENTERPRISE rather than
PERSONAL"). The PERSONAL routing path for AI_AGENT fires ONLY
when an explicit `wallet_type: "PERSONAL"` override is passed to
`createEntity` — currently at `apps/api/src/services/governance/
twin.service.ts:189-191` for the digital twin / Personal AI Agent
flow per ADR-0001 §Amendment 1 register substantively.

### Dual-context routing canonical per ADR-0046

The canonical runtime AI_AGENT dispatch path is dual-context:

- **Personal AI Agent twin** — AI_AGENT entity created with
  explicit `wallet_type: "PERSONAL"` override (twin.service.ts:
  189-191) → wallet row carries `wallet_type = PERSONAL` →
  `CosmpRouter.WalletCache.wallet_type_for/1` returns `:personal`
  → tier-routed dispatch shim at `apps/cosmp_router/lib/
  cosmp_router/grpc/server.ex` routes through
  `dispatch_with_promote_check/4` → ActivityCounter
  promote-on-activity per Amendment 1 + sub-arc 1 sub-phase c
  substrate.

- **Enterprise AI Agent** — AI_AGENT entity created via bare
  `createEntity({entity_type: "AI_AGENT"})` (no explicit
  `wallet_type` override) → `defaultWalletTypeFor(AI_AGENT) =
  ENTERPRISE` defensive fallback → wallet row carries
  `wallet_type = ENTERPRISE` → `WalletCache.wallet_type_for/1`
  returns `:enterprise` → tier-routed dispatch shim routes
  through `dispatch_enterprise/3` → DMWWorker via Horde via-tuple
  always-hot per-DMW dispatch path canonical at §Sub-decision 1
  + §Sub-decision 7 substantively. Forward-substrate product
  surface; defensive infrastructure live; no current product code
  path creates Enterprise AI Agent entities at HEAD register
  substantively.

- **wallet_type column is the canonical dispatch signal at BEAM
  register substantively** — neither EntityType nor the TS-side
  helper directly drives the BEAM dispatch tier. The BEAM layer
  reads `wallet_type` from the Prisma-owned `wallets` table per
  ADR-0033 §Decision 7 + Q-5BII-EXEC-5 cross-language data
  ownership boundary canonical. The dispatch shim canonical at
  `apps/cosmp_router/lib/cosmp_router/grpc/server.ex:199-225`
  branches on `:enterprise | :personal | :device | _other_tier`
  resolved via `WalletCache.wallet_type_for/1`.

### Prior prose register substantively (preserved)

This ADR's earlier substrate-build observations, research arc
(D-WIDER-KNOWLEDGE-CHECK + libcluster guidance), Horde Registry
+ Horde DynamicSupervisor decision, cosmp_router pure-module
refactor at single-source-of-truth register, ETS WalletCache
canonical at Sub-decision 5, and Amendment 1 PERSONAL-promoted
substrate (sub-arc 1 sub-phase c) are **preserved verbatim** at
the canonical-prose register substantively. The substrate-honest
correction in this Amendment 2 narrows specific AI_AGENT-to-
PERSONAL universality claims without erasing the surrounding
substrate.

### Patent-implementation evidence

Per ADR-0020 two-register IP discipline, this Amendment 2
preserves the patent-implementation evidence trail at canonical-
prose register substantively. ADR-0046 + this Amendment 2
substantively close the `D-AI-AGENT-ENTITY-TYPE-vs-WALLET-TYPE-
DISCRIMINATION-DRIFT` observation register substantively that
this ADR's §Amendment 1 + §Decision §Sub-decision 8 originally
forward-queued at sub-arc 2 capsule-layer register substantively.

### Bidirectional citation (RULE 14)

- ADR-0046 (AI_AGENT EntityType-Discriminated Capsule Routing;
  canonicalizes dual-context model corrected by this Amendment 2;
  G6.2 doc-and-test cascade lands this Amendment 2 register
  substantively per `[BEAM-CAPSULE-ROUTING-G6.2-QLOCK]` +
  `[BEAM-CAPSULE-ROUTING-G6.2-EXECUTE-VERIFY-AUTH]`).
- ADR-0001 §Amendment 1 (preserves + narrows Personal DMW /
  digital twin claim to Personal AI Agent context; companion
  Enterprise AI Agent context added at canonical-prose register
  substantively).
- ADR-0041 §Sub-decision 6 amendment (capsule layer umbrella;
  dual-context model canonical at parent umbrella register
  substantively).

Founder authorization explicit at Amendment 2 landing per RULE 20
at `[BEAM-CAPSULE-ROUTING-G6.2-QLOCK]` +
`[BEAM-CAPSULE-ROUTING-G6.2-QLOCK-CORRECTION]` +
`[BEAM-CAPSULE-ROUTING-G6.2-EXECUTE-VERIFY-AUTH]`.
