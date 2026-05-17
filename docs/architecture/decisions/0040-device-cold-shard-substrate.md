# ADR-0040: DEVICE Cold-Shard Substrate (per ADR-0038 §Sub-decision 3 Forward Queue)

## Status

Proposed 2026-05-17

Author: niovarchitect (NIOV Labs Founder; patent-holder per US 12,517,919 + US 12,164,537 + US 12,399,904)

## Context

ADR-0038 §Sub-decision 3 canonicalizes WalletType 3-tier dispatch
(PERSONAL/ENTERPRISE/DEVICE) at sub-phase a runtime register; DEVICE
entities tagged `:always_cold_shard` via DMWWorker.tier_for/1
canonical at substrate-state register substantively. ADR-0038
§Forward Queue (line 249) names the substrate-architectural target
canonical at canonical-knowledge register substantively: "cold-shard
mapping with K=128-1024 consistent-hash shards" forward-substrate at
sub-arc 1 sub-phase d register substantively.

ADR-0039 §Sub-decision 7 + Sub-decision 8 + Amendment 1 (canonical at
sub-arc 1 sub-phase c C.4 register substantively per `b7fa258`
commit substantively) preserve DEVICE entities at Router-fallback
canonical at backward-compat register substantively at canonical-
state register substantively until sub-phase d substrate
canonicalizes the cold-shard dispatch lane.

ADR-0039 line 251-255 canonicalizes the substrate-honest AI_AGENT
discrimination at canonical-knowledge register substantively: AI_AGENT
is EntityType (NOT WalletType) at Prisma schema register substantively;
AI_AGENT entities map to PERSONAL wallet_type at INSERT register
substantively per TS-side `defaultWalletTypeFor/1` helper canonical at
`packages/database/src/queries/wallet.ts` register substantively.
AI_AGENT entities therefore ride the PERSONAL promote-on-activity
branch canonical at canonical-execution register substantively per C.3
substrate register substantively; AI_AGENT MUST NOT be pulled into
DEVICE lane canonical at canonical-coherence register substantively
per D-AI-AGENT-ENTITY-TYPE-vs-WALLET-TYPE-DISCRIMINATION-DRIFT
observation canonical at C.3 commit body register substantively.

Substrate-state ground truth at sub-phase c CLOSED register
substantively per `13da364` commit substantively: DEVICE shard
substrate is GREENFIELD canonical at canonical-honest register
substantively (zero shard/hash modules + zero
DeviceShard/jump_hash/consistent_hash symbols in apps/ at substrate-
state register substantively). Current DEVICE dispatch behavior
canonical at substrate-state register substantively: Router fallback
via `{:ok, _other_tier}` catch-all at
`apps/cosmp_router/lib/cosmp_router/grpc/server.ex:191-192` register
substantively.

### Rule 21 research arc canonical at canonical-knowledge register substantively

Per RULE 21 D-PRE-AUTHORIZATION-RESEARCH-ARC canonical at canonical-
rule register substantively per `67f6112` commit substantively +
ADR-0035 27th observation D-PASTE-AUTHORING-FAILED-TO-GREP-CANONICAL-
STATE-BEFORE-PREMISE-LOCK canonical at substrate-architectural
register substantively per `13da364` commit substantively, D.0
`[BEAM-DBGI-DEVICE-COLDSHARD-RESEARCH-ARC]` read-only research arc
canonical at canonical-knowledge register substantively at prior turn
register substantively (5 parallel WebSearch queries + 1 WebFetch on
canonical Discord ex_hash_ring source) surfaced:

- **Jump Consistent Hash (Lamping-Veach 2014; arXiv:1406.2294)**:
  ~5-line algorithm canonical at canonical-knowledge register
  substantively; O(1) space + O(ln K) compute + near-perfect balance
  + no virtual nodes + minimal-remap when K changes within fixed-K
  constraint canonical at canonical-execution register substantively.
  Reference implementations canonical at canonical-knowledge register
  substantively in Rust + Python + Java + Go + Haskell + C++.
  Mathematically optimal for ADR-0038 fixed-K=128-1024 constraint
  canonical at canonical-architectural register substantively.

- **Rendezvous / HRW Hashing (Thaler-Ravishankar 1996)**: predates
  consistent hashing canonical at canonical-knowledge register
  substantively; O(K) compute per assignment canonical at canonical-
  execution register substantively (slower at K=1024 than Jump Hash
  O(ln K)); deterministic stateless canonical at canonical-coherence
  register substantively. Production users canonical at canonical-
  knowledge register substantively: Oracle DB In-Memory + GitHub LB +
  Apache Kafka + Twitter EventBus + Apache Druid.

- **Ring/Ketama-style (Last.fm Richard Jones; libketama)**: 100-200
  vnodes per server on 2^32 ring canonical at canonical-execution
  register substantively; MD5 default hash (FNV-1a patch); higher
  memory footprint canonical at canonical-coherence register
  substantively. Designed for dynamic node addition/removal canonical
  at canonical-knowledge register substantively; over-engineered for
  fixed-K=128-1024 dispatch routing at canonical-architectural
  register substantively.

- **Elixir Bitwise (hexdocs.pm/elixir/Bitwise.html)**: `<<<` (bsl/2)
  and `>>>` (bsr/2) operators canonical at canonical-knowledge
  register substantively REQUIRE `import Bitwise` (or fully-qualified
  `Bitwise.<<<` calls); compile-fails otherwise canonical at
  canonical-execution register substantively. All Bitwise functions
  inlined by compiler canonical at canonical-coherence register
  substantively (zero overhead canonical at canonical-execution
  register substantively).

- **Discord ex_hash_ring (hex.pm/packages/ex_hash_ring)**: ring-based
  (NOT Jump Hash) canonical at canonical-knowledge register
  substantively; hybrid GenServer + ETS substrate; supports dynamic
  node operations + key pinning + historical ring versions canonical
  at canonical-execution register substantively. Discord precedent
  canonical at canonical-knowledge register substantively at ADR-0039
  §Sub-decision 1 register substantively for per-entity GenServer
  (NOT for shard dispatch routing); different substrate at canonical-
  architectural register substantively. Over-engineered for NIOV's
  fixed-K + pure dispatch routing use case at canonical-honest
  register substantively.

- **GenServer-wrapping-stateless-logic anti-pattern (Elixir hexdocs
  canonical)**: canonical at canonical-knowledge register
  substantively per ADR-0039 §Sub-decision 11 + Sub-decision 2
  register substantively (B.2 Operations refactor precedent). Jump
  Hash is pure function (entity_id + K -> shard_id) canonical at
  canonical-execution register substantively; wrapping in GenServer
  triggers this anti-pattern canonical at canonical-coherence
  register substantively.

Sources canonical at canonical-knowledge register substantively
(cited at D.0 research arc register substantively per `67f6112` RULE
21 promotion commit body precedent register substantively):

- arxiv.org/abs/1406.2294 - Lamping & Veach, "A Fast, Minimal Memory,
  Consistent Hash Algorithm" (2014)
- en.wikipedia.org/wiki/Rendezvous_hashing - Rendezvous/HRW canonical
  reference
- en.wikipedia.org/wiki/Consistent_hashing - Consistent hashing
  canonical reference
- hexdocs.pm/elixir/Bitwise.html - Elixir Bitwise module canonical
- github.com/discord/ex_hash_ring - Discord production ring-based
  Elixir library
- github.com/bitwalker/libring - Bitwalker ketama-based Elixir library
- github.com/hderms/jumpconsistenthash - Erlang Jump Hash reference
  implementation

### D.1 substrate scope at canonical-honest register substantively

D.1 docs-only commit substantively LOCKS the ADR-0040 architectural
substrate for the K=128-1024 DEVICE cold-shard forward-substrate item
per ADR-0038 §Forward Queue line 249 canonical at canonical-
knowledge register substantively. **Implementation closure of the
ADR-0038 §Forward Queue item remains forward-substrate to D.2 (NEW
CosmpRouter.DeviceShard pure module + Jump Hash + config + unit tests
at canonical-execution register substantively) + D.3 (MOD
grpc/server.ex explicit `:device` dispatch branch + integration tests
at canonical-execution register substantively); final closure of the
ADR-0038 §Forward Queue item canonical at canonical-state register
substantively lands at D.4 docs-only closure cascade register
substantively** per ADR-0040 §Sub-decision 7 4-commit mini-arc
decomposition canonical at canonical-coherence register substantively.

## Decision

NIOV Labs canonicalizes DEVICE cold-shard substrate at sub-arc 1
sub-phase d register substantively via in-tree Jump Consistent Hash
(Lamping-Veach 2014) implementation at pure stateless module register
substantively + config-driven K parameterization at umbrella
`config/config.exs` register substantively. The substrate delivers
ADR-0038 §Forward Queue "K=128-1024 consistent-hash shards" target at
canonical-architectural register substantively at sub-phase d closure
register substantively per ADR-0040 §Sub-decision 7 4-commit mini-arc
decomposition.

### Sub-decision 1: Algorithm - Jump Consistent Hash (Lamping-Veach 2014)

Per Founder Q-A LOCKED at `[BEAM-DBGI-DEVICE-COLDSHARD-QLOCK]`
register substantively. Mathematically optimal for fixed-K=128-1024
constraint canonical at canonical-architectural register substantively:

- O(1) space (no ring/virtual-node memory)
- O(ln K) compute time
- Near-perfect load balance
- Minimal remap when K changes within fixed-K range
- ~5-line implementation canonical at canonical-knowledge register
  substantively

Canonical implementation semantics canonical at canonical-coherence
register substantively per Lamping-Veach reference:

- 64-bit unsigned arithmetic (Elixir arbitrary-precision integers +
  explicit modulo with `2 ** 64` for unsigned wrap)
- LCG: `key = key * 2862933555777941757 + 1` (canonical Lamping-Veach
  LCG constant)
- Return value: `b` (last assigned bucket), NOT `j` (overshot value)
  canonical at canonical-execution register substantively
- 64-bit key from stable hash: `:erlang.phash2(key, 0x10000000000000000 - 1)`
  OR alternative cryptographic hash mapped to 64-bit at canonical-
  knowledge register substantively
- `import Bitwise` required for `<<<` + `>>>` operators canonical at
  canonical-execution register substantively

Algorithm selection rejected alternatives canonical at canonical-
honest register substantively:

- Rendezvous/HRW: O(K) compute slower than Jump Hash O(ln K) at
  K=1024 register substantively
- Ring/Ketama: 100-200x vnode memory overhead + designed for dynamic
  node operations (over-engineered for fixed-K dispatch routing)
  canonical at canonical-coherence register substantively
- ex_hash_ring (Discord) / libring (Bitwalker): external dependency +
  over-engineered for fixed-K + designed for dynamic node
  addition/removal NOT pure dispatch routing canonical at canonical-
  architectural register substantively

### Sub-decision 2: Substrate - Pure stateless module + config

Per Founder Q-B LOCKED at `[BEAM-DBGI-DEVICE-COLDSHARD-QLOCK]`
register substantively. DEVICE shard assignment is deterministic
routing: (entity_id, K) -> shard_id canonical at canonical-execution
register substantively. No runtime state required canonical at
canonical-coherence register substantively.

- NO GenServer (resolves GenServer-wrapping-stateless-logic anti-
  pattern canonical at canonical-knowledge register substantively per
  Elixir hexdocs register substantively + ADR-0039 §Sub-decision 11
  precedent canonical at canonical-coherence register substantively +
  B.2 Operations refactor precedent canonical at substrate-
  architectural register substantively)
- NO supervised child (avoids D-SUPERVISION-TREE-EXPANSION-TEST-
  COHERENCE-DRIFT recurrence-4 canonical at canonical-coherence
  register substantively per ADR-0035 26th observation discipline
  canonical at substrate-architectural register substantively per
  `13da364` commit substantively; `cosmp_router_test.exs`
  `assert length(children) == 5` canonical at substrate-state register
  substantively preserved at canonical-execution register
  substantively)
- NO ETS on hot path (pure function call canonical at hot-path
  register substantively; no cache invalidation concerns at
  canonical-coherence register substantively; no table bloat at
  scale register substantively)
- Optional ETS for observability substrate forward-substrate at
  sub-arc 3 register substantively (per-shard entity counts +
  last-activity tracking) NOT D.X scope

### Sub-decision 3: Module name - CosmpRouter.DeviceShard at apps/cosmp_router/lib/cosmp_router/device_shard.ex

Per Founder Q-F LOCKED at `[BEAM-DBGI-DEVICE-COLDSHARD-QLOCK]`
register substantively (operator OVERRIDE of D.0 report
recommendation register substantively). "Manager" suffix implies
process/state ownership canonical at semantic register substantively;
pure stateless substrate canonical per Sub-decision 2 register
substantively warrants "DeviceShard" (no suffix) canonical at
canonical-honest register substantively at BEAM-native semantic
register substantively.

Naming convention mirror canonical at canonical-coherence register
substantively: `CosmpRouter.WalletLookup` (pure module per ADR-0039
Sub-decision 4) + `CosmpRouter.WalletCache` (GenServer + ETS per
ADR-0039 Sub-decision 5) + `CosmpRouter.ActivityCounter` (GenServer +
ETS per ADR-0039 Amendment 1 substrate) + `CosmpRouter.Operations`
(pure module per ADR-0039 Sub-decision 2) - `CosmpRouter.DeviceShard`
joins this naming family at pure-module register substantively.

### Sub-decision 4: K default = 256; range [128, 1024]; config at umbrella `config/config.exs`

Per Founder Q-C LOCKED at `[BEAM-DBGI-DEVICE-COLDSHARD-QLOCK]`
register substantively.

- Default K = 256 (power-of-2 in middle of canonical range; matches
  ADR-0038 §Forward Queue spec)
- Valid range: [128, 1024] per ADR-0038 §Forward Queue line 249
  canonical at canonical-architectural register substantively
- Config key: `config :cosmp_router, CosmpRouter.DeviceShard, shard_count: 256`
  at umbrella `config/config.exs` register substantively
- Validation: fail-fast on K outside [128, 1024] canonical at
  canonical-execution register substantively (substrate-honest guard
  at module load OR first-call register substantively per Elixir
  guard-clause canonical at canonical-knowledge register substantively)
- Migration if K changes within range: ~50% reassignment if K doubles
  (canonical Jump Hash minimal-remap math); DEVICE cold-shard
  semantics tolerate per-DMW remap canonical at canonical-state
  register substantively (cold-shard = lazy materialization; no
  warm-state migration cost)

### Sub-decision 5: Dispatch integration at grpc/server.ex (forward-substrate to D.3)

Per Founder Q-E LOCKED at `[BEAM-DBGI-DEVICE-COLDSHARD-QLOCK]`
register substantively + D.3 `[BEAM-DBGI-DEVICE-SHARD-DISPATCH-INTEGRATION]`
commit scope canonical at canonical-state register substantively.

- MOD `apps/cosmp_router/lib/cosmp_router/grpc/server.ex`
  `dispatch_tier_routed/2` add explicit `{:ok, :device}` branch
  BEFORE existing `{:ok, _other_tier}` catch-all canonical at
  canonical-execution register substantively (substrate-coherent
  placement at canonical-coherence register substantively)
- NEW private `dispatch_device_shard/3` helper canonical at
  canonical-execution register substantively (pure routing logic;
  calls `CosmpRouter.DeviceShard.assign_shard/2` + dispatches to
  `CosmpRouter.Router` with shard_id-augmented request canonical at
  substrate-architectural register substantively per D.3 commit
  register substantively)
- DEVICE cold semantics preserved canonical at canonical-honest
  register substantively: NO DMWWorker spawn for DEVICE; NO always-
  hot per-DMW process; pure dispatch routing through shard-id-
  augmented Router fallback canonical at backward-compat register
  substantively per Founder Q-B substrate disposition register
  substantively

### Sub-decision 6: AI_AGENT remains canonical at PERSONAL dispatch branch register substantively

Per Founder paste explicit constraint at `[BEAM-DBGI-DEVICE-COLDSHARD-QLOCK]`
register substantively + ADR-0039 L251-255 canonical at canonical-
knowledge register substantively + D-AI-AGENT-ENTITY-TYPE-vs-WALLET-
TYPE-DISCRIMINATION-DRIFT observation canonical at C.3 commit body
register substantively.

AI_AGENT canonical at EntityType register substantively per ADR-0033
cross-language data ownership register substantively NOT WalletType
register substantively at substrate-state register substantively.
AI_AGENT entities map to PERSONAL wallet_type at INSERT register
substantively per TS-side `defaultWalletTypeFor/1` helper canonical
at `packages/database/src/queries/wallet.ts` register substantively.
AI_AGENT entities therefore ride the PERSONAL promote-on-activity
branch canonical at canonical-execution register substantively per
C.3 substrate register substantively; AI_AGENT MUST NOT be pulled
into DEVICE lane canonical at canonical-coherence register
substantively at this commit register substantively.

Forward-substrate AI_AGENT EntityType-discriminated capsule routing
canonical at canonical-coherence register substantively at sub-arc 2
capsule layer register substantively per operator memory entry
weighting architecture substantively (separate substrate-
architectural decision; NOT D.X scope).

### Sub-decision 7: 4-commit mini-arc decomposition

Per Founder Q-E LOCKED at `[BEAM-DBGI-DEVICE-COLDSHARD-QLOCK]`
register substantively:

- **D.1 `[BEAM-DBGI-DEVICE-COLDSHARD-ADR]`** - docs-only at this
  commit register substantively (ADR-0040 NEW Proposed + D.0 research
  arc embedded + section-12-progress sub-phase d row IN FLIGHT +
  architecture/README + CLAUDE.md catalog refresh). **D.1 LOCKS the
  architectural substrate; does NOT close the ADR-0038 §Forward Queue
  item.**
- **D.2 `[BEAM-DBGI-DEVICE-SHARD-MODULE]`** - substantive code (NEW
  `CosmpRouter.DeviceShard` pure stateless module at
  `apps/cosmp_router/lib/cosmp_router/device_shard.ex` with
  `import Bitwise` + canonical Lamping-Veach Jump Hash implementation
  + `assign_shard/2` + `valid_shard_count?/1` guard + NEW
  `apps/cosmp_router/test/cosmp_router/device_shard_test.exs` unit
  tests + umbrella `config/config.exs` `shard_count: 256` default).
  **D.2 implements the substrate; does NOT close the Forward Queue
  item.**
- **D.3 `[BEAM-DBGI-DEVICE-SHARD-DISPATCH-INTEGRATION]`** -
  substantive code (MOD
  `apps/cosmp_router/lib/cosmp_router/grpc/server.ex` add explicit
  `{:ok, :device}` dispatch branch + NEW `dispatch_device_shard/3`
  private helper + NEW integration tests at
  `apps/cosmp_router/test/cosmp_router/grpc/device_shard_dispatch_test.exs`).
  **D.3 wires the dispatch; does NOT close the Forward Queue item.**
- **D.4 `[BEAM-DBGI-DEVICE-COLDSHARD-CLOSURE]`** - docs-only closure
  cascade (ADR-0040 Status: Proposed -> Accepted + Post-Closure
  Implementation Lineage + section-12-progress.md sub-phase d row
  CLOSED + CURRENT_BUILD_STATE.md NEW H2 sub-phase d closure section
  + ADR-0038/0039 catalog refresh + ADR-0035 cluster expansion
  observations IF surfaced during D.X execution). **D.4 CLOSES the
  ADR-0038 §Forward Queue K=128-1024 DEVICE cold-shard item at
  canonical-state register substantively at sub-phase d closure
  register substantively.**

### Sub-decision 8: 6 BEAM-compatibility patterns from ADR-0026 §5 preserved by construction

Pure stateless module canonical at canonical-coherence register
substantively preserves all 6 BEAM-compatibility patterns from
ADR-0026 §5 at canonical-architectural register substantively:

- Pattern 1 (message-passing): N/A - pure function does not message-
  pass at canonical-execution register substantively
- Pattern 2 (supervisor-friendly failures): N/A - no supervised child
  at canonical-execution register substantively
- Pattern 3 (graceful degradation): inherits from Router fallback
  canonical at backward-compat register substantively
- Pattern 4 (idempotent ops): pure function canonical at canonical-
  execution register substantively (same entity_id + K -> same
  shard_id always)
- Pattern 5 (atomic verification): N/A - no state to verify at
  canonical-execution register substantively
- Pattern 6 (pure transformation): CORE PATTERN canonical at
  canonical-coherence register substantively (Jump Hash IS pure
  transformation per Sub-decision 1 + Sub-decision 2 register
  substantively)

### Sub-decision 9: Elixir anti-pattern compliance at canonical-knowledge register substantively

Resolves GenServer-wrapping-stateless-logic anti-pattern canonical at
canonical-knowledge register substantively per Elixir hexdocs
register substantively + ADR-0039 §Sub-decision 11 precedent
canonical at canonical-coherence register substantively. Pure
stateless module substrate canonical at canonical-execution register
substantively avoids the anti-pattern by construction at canonical-
architectural register substantively.

### Sub-decision 10: Testability per ADR-0034

Per ADR-0034 BEAM testability discipline canonical at canonical-
knowledge register substantively. Pure function canonical at
canonical-execution register substantively is trivially testable
canonical at canonical-coherence register substantively:

- Unit tests (deterministic): same entity_id + K -> same shard_id;
  bounds; out-of-range K rejection
- Property-based distribution tests: 10000 random UUIDs -> near-
  uniform 1/K distribution at K=256 register substantively
- Stability tests: entity_id mapping unchanged across module reload
  register substantively
- Minimal-remap tests: K=256 -> K=512 reassigns ~50% expected per
  Jump Hash math canonical at canonical-knowledge register
  substantively
- Dispatch integration tests (D.3 register substantively): DEVICE
  entity_id dispatches through `dispatch_device_shard/3` NOT
  `_other_tier` catch-all register substantively; ENTERPRISE +
  PERSONAL preserved at canonical-state register substantively

### Sub-decision 11: Patent-implementation evidence at canonical decision register substantively

Per ADR-0020 two-register IP discipline canonical at canonical-
architectural register substantively. ADR-0040 substrate canonical at
canonical-coherence register substantively substantively
distinguishes NIOV substrate from any unauthorized parallel build at
"blockchain-only" claim register substantively per operator memory
entry adversarial actors disposition substantively:

- Jump Consistent Hash (Lamping-Veach 2014) + pure stateless module +
  config-driven K + Elixir/BEAM in-tree implementation canonical at
  substrate-architectural register substantively delivers ADR-0038
  §Forward Queue target at canonical-execution register substantively
- Cryptographically-timestamped commit lineage D.1 + D.2 + D.3 + D.4
  canonical at canonical-state register substantively per ADR-0020
  register substantively

## Consequences

### Easier

- DEVICE entities canonical at canonical-execution register
  substantively now have dedicated cold-shard dispatch lane canonical
  at canonical-coherence register substantively at sub-phase d
  register substantively
- K parameterization at config canonical at canonical-coherence
  register substantively allows shard count tuning without code
  changes at canonical-execution register substantively (within
  [128, 1024] range)
- Pure function substrate canonical at canonical-execution register
  substantively avoids GenServer + supervised child + ETS hot-path
  complexity at canonical-coherence register substantively
- ADR-0034 testability discipline trivially satisfied canonical at
  canonical-knowledge register substantively (pure function trivially
  testable)
- 6 BEAM-compatibility patterns from ADR-0026 §5 preserved by
  construction canonical at canonical-architectural register
  substantively
- Avoids D-SUPERVISION-TREE-EXPANSION-TEST-COHERENCE-DRIFT recurrence
  canonical at canonical-coherence register substantively per
  ADR-0035 26th observation discipline canonical

### Harder

- Migration if K changes within range: ~50% per-DMW reassignment if K
  doubles (Jump Hash minimal-remap math); cold-shard semantics
  tolerate this at canonical-state register substantively but per-DMW
  capsule materialization cost shifts to new shards canonical at
  canonical-execution register substantively
- In-tree Jump Hash implementation requires canonical Lamping-Veach
  correctness verification at canonical-execution register
  substantively (64-bit unsigned arithmetic + return `b` not `j` +
  `import Bitwise`) per D.2 substrate register substantively
- Forward-substrate observability substrate (per-shard entity counts
  + last-activity tracking) at sub-arc 3 register substantively
  requires optional ETS substrate canonical at canonical-coherence
  register substantively (NOT D.X scope)

## Alternatives Considered

### Rendezvous / HRW Hashing

Rejected per Q-A LOCKED Option α (Jump Hash). O(K) compute per
assignment slower than Jump Hash O(ln K) at K=1024 register
substantively. Production users canonical at canonical-knowledge
register substantively (Oracle DB + GitHub LB + Apache Kafka +
Twitter EventBus + Apache Druid) demonstrate substrate-coherence at
scale register substantively but algorithm trade-off favors Jump Hash
for fixed-K constraint at canonical-architectural register
substantively.

### Ring/Ketama-style consistent hashing

Rejected per Q-A LOCKED. 100-200 vnodes per server overhead canonical
at canonical-coherence register substantively; designed for dynamic
node addition/removal canonical at canonical-knowledge register
substantively (Akamai/memcached/Redis/Riak precedents). Over-
engineered for fixed-K=128-1024 dispatch routing canonical at
canonical-architectural register substantively.

### Discord ex_hash_ring (hex.pm)

Rejected per Q-A LOCKED + Q-B LOCKED. Hybrid GenServer + ETS
substrate canonical at canonical-execution register substantively +
ring-based (not Jump Hash) canonical at canonical-knowledge register
substantively. Discord uses it for dynamic Erlang cluster node
management canonical at canonical-knowledge register substantively
NOT fixed-K dispatch routing canonical at canonical-architectural
register substantively. External dependency + over-engineered for
NIOV use case at canonical-honest register substantively.

### Bitwalker libring (hex.pm)

Rejected per Q-A LOCKED + Q-B LOCKED. Ketama-based stateful canonical
at canonical-knowledge register substantively (`:gb_tree` storage);
same over-engineering caveat as ex_hash_ring at canonical-coherence
register substantively.

### Supervised GenServer + ETS substrate (Option α from D.0 report)

Rejected per Q-B LOCKED Option β. Triggers GenServer-wrapping-
stateless-logic anti-pattern canonical at canonical-knowledge
register substantively + D-SUPERVISION-TREE-EXPANSION-TEST-COHERENCE-
DRIFT recurrence-4 canonical at canonical-coherence register
substantively per ADR-0035 26th observation discipline canonical.
Pure stateless module + config substrate canonical at canonical-
execution register substantively preserves BEAM-native simplicity at
canonical-honest register substantively.

### ADR-0038 Amendment 1 (Option B from D.0 report)

Rejected per Q-D LOCKED Option A (NEW ADR-0040). Sub-phase d is full
substrate-architectural layer canonical at canonical-architectural
register substantively comparable to sub-phase b ADR-0039 NEW
precedent register substantively. ADR-0038 §Forward Queue line 249
names target canonical at canonical-knowledge register substantively
but does NOT lock algorithm + K + substrate + supervision + dispatch
+ test plan canonical at substrate-architectural register
substantively. Full ADR-0040 preserves substrate-honest distinction
canonical at canonical-coherence register substantively per ADR-0011
§Amendment precedent register substantively reserved for in-place
§Sub-decision body amendments register substantively (which ADR-0038
§Sub-decision 3 is NOT register substantively per substrate-state
ground truth at canonical-honest register substantively).

### Module name CosmpRouter.DeviceShardManager (D.0 report recommendation)

Rejected per Q-F LOCKED OVERRIDE. "Manager" suffix implies
process/state ownership canonical at semantic register substantively;
pure stateless substrate canonical per Sub-decision 2 register
substantively warrants "DeviceShard" (no suffix) canonical at
canonical-honest register substantively. Naming family mirror
canonical at canonical-coherence register substantively:
`CosmpRouter.WalletLookup` + `CosmpRouter.Operations` (pure modules;
no "Manager" suffix).

## References

- ADR-0011 §Amendment canonical convention (H2 Amendment subsection
  at canonical-prose register substantively; ADR-0040 substrate
  distinct from amendment per Q-D LOCKED)
- ADR-0020 two-register IP discipline canonical at canonical-
  architectural register substantively (cryptographically-timestamped
  commit lineage)
- ADR-0026 §5 6 BEAM-compatibility patterns (preserved by
  construction per Sub-decision 8)
- ADR-0028 §3 BEAM Coordination Layer + §Forward Queue (per-capsule
  supervised process forward-substrate item this ADR substantively
  progresses at DEVICE tier sub-phase d register substantively)
- ADR-0033 cross-language data ownership (EntityType vs WalletType
  canonical at canonical-knowledge register substantively)
- ADR-0034 BEAM testability discipline (name-configurable substrate;
  pure function trivially testable)
- ADR-0035 substrate-build discipline (26th observation
  D-SUPERVISION-TREE-EXPANSION-TEST-COHERENCE-DRIFT + 27th
  observation D-PASTE-AUTHORING-FAILED-TO-GREP-CANONICAL-STATE-
  BEFORE-PREMISE-LOCK; both informed D.1 paste-authoring discipline
  canonical at canonical-honest register substantively)
- ADR-0038 §Sub-decision 3 (WalletType 3-tier dispatch + tier_for/1
  `:device -> :always_cold_shard`) + §Forward Queue line 249
  (K=128-1024 consistent-hash shards target; D.1 LOCKS architectural
  substrate for this Forward Queue item; final closure at D.4
  register substantively per Sub-decision 7)
- ADR-0039 §Sub-decision 7 + Sub-decision 8 + Amendment 1 (DEVICE
  Router fallback canonical at sub-phase c register substantively
  until sub-phase d substrate canonicalizes)
- RULE 11 (Elixir/BEAM iteration-loop research canonical at
  canonical-rule register substantively)
- RULE 13 (substrate-honest pre-flight surface inline canonical at
  canonical-rule register substantively)
- RULE 20 (Founder authorization canonical at canonical-rule register
  substantively; explicit at this ADR's creation per
  `[BEAM-DBGI-DEVICE-COLDSHARD-QLOCK]` register substantively)
- RULE 21 (pre-authorization research arc canonical at canonical-
  rule register substantively per `67f6112` commit substantively;
  D.0 research arc embedded at §Context register substantively per
  RULE 21 + `67f6112` precedent register substantively)
- arXiv:1406.2294 Lamping-Veach Jump Hash paper canonical at
  canonical-knowledge register substantively
- hexdocs.pm/elixir/Bitwise.html Elixir Bitwise canonical at
  canonical-knowledge register substantively
- github.com/discord/ex_hash_ring + github.com/bitwalker/libring
  (rejected alternatives at canonical-honest register substantively)
- en.wikipedia.org/wiki/Rendezvous_hashing +
  en.wikipedia.org/wiki/Consistent_hashing (rejected alternatives at
  canonical-knowledge register substantively)

## Bidirectional Citation

- Cites: ADR-0011 + ADR-0020 + ADR-0026 §5 + ADR-0028 §3 and §Forward
  Queue + ADR-0033 + ADR-0034 + ADR-0035 + ADR-0038 §Sub-decision 3
  and §Forward Queue + ADR-0039 §Sub-decision 7 + Sub-decision 8 +
  Amendment 1

- Cited by: ADR-0038 §Forward Queue line 249 K=128-1024 consistent-
  hash shards forward-substrate item: D.1 LOCKS the ADR-0040
  architectural substrate canonical at canonical-prose register
  substantively at this commit register substantively; implementation
  closure remains forward-substrate to D.2 + D.3 register
  substantively; final closure of the ADR-0038 §Forward Queue item
  canonical at canonical-state register substantively lands at D.4
  docs-only closure cascade register substantively per ADR-0040
  §Sub-decision 7. section-12-progress.md sub-phase d row IN FLIGHT
  canonical at canonical-state register substantively at this commit
  register substantively; sub-phase d row CLOSED at D.4 register
  substantively. CURRENT_BUILD_STATE.md sub-phase d H2 section
  canonical at canonical-state register substantively at D.4 closure
  cascade register substantively.
