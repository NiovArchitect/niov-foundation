# ADR-0031: BEAM Routing Substrate Architecture

**Status**: Active
**Date**: 2026-05-13
**Trigger**: Sub-phase 4a of Block B (Phase 2 Elixir/BEAM Implementation
mini-arc per ADR-0030). Decision substrate landing before code substrate
per Q-G Option B split — matches the sub-phase 1/2 dual-control
precedent (ADR-0026 lands at sub-phase H before code at sub-phase E was
re-validated). The COSMP routing GenServer is the patent-canonical
substrate for the 7 COSMP operations per US 12,517,919; its architecture
deserves ratified decision documentation at the moment it's made, not
retroactively at sub-phase 4b code review.

## Context

The NIOV Foundation is built for production live-grade coherence at
scale. Each DMW (Personal / Enterprise zero-payload / Device) may hold
**billions of memory capsules**; permissioned cross-DMW collaboration
multiplies the routing surface; the substrate may eventually coordinate
physical-robot-brain cognition at scale per the Foundation's
patent-canonical trajectory.

The COSMP coordination layer (Foundation Phase 2 per ADR-0030)
implements message routing for the 7 patent-defined operations per
US 12,517,919:

| Op | Purpose |
|----|---------|
| AUTHENTICATE | DMW/principal identity verification |
| NEGOTIATE | Cross-DMW capability + scope agreement |
| READ | Metadata-first capsule retrieval |
| WRITE | Append-only capsule write with audit-chain |
| SHARE | Permissioned scope grant across DMWs |
| REVOKE | Capability revocation + downstream cascade |
| AUDIT | Append-only audit log query (pre-success guaranteed) |

Routing decisions at this scale require BEAM-native architectural
discipline — supervision-tree-isolated workers, message-passing
semantics over shared state, pure decision functions at the edges.

**Substrate state at sub-phase 4a (this commit)**:
- Sub-phase 3 `[BEAM-COSMP-APP-SKELETON]` (`290f327`) landed the OTP
  application skeleton (`apps/cosmp_router/`) with `:one_for_one`
  supervision and empty children list per ADR-0030 §Implementation
  Detail.
- Sub-phase 4b `[BEAM-COSMP-GENSERVER-CODE]` (next) instantiates the
  first production-grade worker — `CosmpRouter.Router` GenServer —
  against this canonical decision substrate.

## Decision

Sub-phase 4b's `CosmpRouter.Router` GenServer implements the 7 COSMP
ops dispatch via the following load-bearing architectural choices:

### State shape

The GenServer state struct holds:

```elixir
defmodule CosmpRouter.Router.State do
  @type t :: %__MODULE__{
    in_flight: map(),
    started_at: integer()
    # idempotency_table: map() — DEFERRED to sub-phase 5/6 per Q-D
  }
  defstruct in_flight: %{}, started_at: nil
end
```

Idempotency state lands at sub-phase 5/6 (ETS- or Postgres-backed;
substantive substrate-decision territory deserving its own ADR if
non-obvious choices arise).

### 7-op dispatch via `handle_call`

Each COSMP operation enters via `GenServer.call/3` (synchronous; client
awaits routing result). The Router pattern-matches on operation type
and dispatches to per-op `handle_call/3` heads:

```elixir
def handle_call({:authenticate, %Capsule{} = capsule}, _from, state),
  do: {:reply, {:ok, :not_implemented}, state}
def handle_call({:negotiate, %Capsule{} = capsule}, _from, state),
  do: {:reply, {:ok, :not_implemented}, state}
def handle_call({:read, %Capsule{} = capsule}, _from, state),
  do: {:reply, {:ok, :not_implemented}, state}
def handle_call({:write, %Capsule{} = capsule}, _from, state),
  do: {:reply, {:ok, :not_implemented}, state}
def handle_call({:share, %Capsule{} = capsule}, _from, state),
  do: {:reply, {:ok, :not_implemented}, state}
def handle_call({:revoke, %Capsule{} = capsule}, _from, state),
  do: {:reply, {:ok, :not_implemented}, state}
def handle_call({:audit, %Capsule{} = capsule}, _from, state),
  do: {:reply, {:ok, :not_implemented}, state}
```

All 7 op stubs at sub-phase 4b per Q-C; bodies fill at sub-phase 5+
with consumers (gRPC interop sub-phase 5; integration tests sub-phase
6). Stubs returning `{:ok, :not_implemented}` preserve
**patent-implementation evidence register** — all 7 ops visible in
implementation surface from sub-phase 4b onward, not retroactively at
sub-phase 5+.

### `Capsule` struct placeholder (7 layers per US 12,517,919)

Per Q-B Option A: `defmodule CosmpRouter.Capsule` with 7 layers as
struct fields, no validation logic at sub-phase 4b. Full validation +
persistence arrives at sub-phase 5 (gRPC interop populates from
external payloads):

```elixir
defmodule CosmpRouter.Capsule do
  @type t :: %__MODULE__{
    payload: term(),
    metadata: map(),
    rules: list(),
    relations: list(),
    time: map(),
    permissions: map(),
    audit: list()
  }
  defstruct [:payload, :metadata, :rules, :relations, :time,
             :permissions, :audit]
end
```

7 layers per US 12,517,919: **Payload / Metadata / Rules / Relations /
Time / Permissions / Audit**.

### Supervision tree integration

`CosmpRouter.Application.start/2` children list (currently `[]` at
sub-phase 3) transitions to `[{CosmpRouter.Router, []}]` at sub-phase
4b. The Router is named (`CosmpRouter.Router`) for lookup via
`Process.whereis/1`. Supervision strategy remains `:one_for_one` per
ADR-0030 — Router crash isolated from other workers added at
sub-phases 5-11.

### Empty deps at sub-phase 4 per Q-E

No `:logger`-beyond-default, no `:telemetry`, no `:jason`, no `:ecto`.
Deps land with their consumers per substrate-honest discipline:
- `:grpc` + `:protobuf` at sub-phase 5b (gRPC framework + Protobuf
  binary encoding per Q-M / ADR-0032 §Decision gRPC library choice)
- `:telemetry_metrics` + `:telemetry_poller` at sub-phase 11
- `:ecto_sql` + `:postgrex` landed at sub-phase 5b-ii
  `[BEAM-COSMP-INTEROP-PERSISTENCE]` per ADR-0033 §Decision 1
  (canonical Elixir Postgres stack); Postgres-backed idempotency
  chosen + landed at sub-phase 5b-iii Commit A
  `[BEAM-COSMP-INTEROP-INTEGRATION-IDEMPOTENCY]` per ADR-0031 Q-D
  resolved by ADR-0033 §Decision 6 (Idempotency layer)

## Rationale

### Why GenServer (not GenStage / Task / Agent)?

GenServer is the canonical OTP behavior for stateful request/response
workers. Alternatives:
- **GenStage** suits backpressure pipelines (sub-phase 9-11 territory
  if needed for telemetry batching or cross-region routing).
- **Task** suits fire-and-forget one-shot work; Router is long-running.
- **Agent** suits pure state holders without request dispatch.

Router is **stateful + handles request dispatch + needs supervision
tree integration** — GenServer is the substrate-honest choice.

### Why `handle_call` (synchronous) not `handle_cast` (asynchronous)?

COSMP routing operations return decisions the caller depends on
(authentication result; read payload; write confirmation). Async cast
would force the caller to manage their own response tracking — wrong
abstraction at the routing layer. The gRPC bridge (sub-phase 5)
handles async semantics at the network boundary, not the BEAM internal
boundary.

### Why placeholder `Capsule` (Option A)?

The 7-layer Capsule struct shape is canonical per patent; the
validation logic + persistence integration is substantive substrate
that requires consumers (sub-phase 5 gRPC interop = first consumer).
**Substrate-honest discipline**: struct shape lands at sub-phase 4b
(visible patent-implementation surface); validation + persistence land
with their consumers at sub-phase 5+.

### Why idempotency deferral (Q-D)?

Idempotency cache (ETS-backed or Postgres-backed) is **non-obvious
choice territory** at sub-phase 4:
- **ETS**: in-memory; fast; lost on Router crash (acceptable if
  reconciliation via Postgres source-of-truth per ADR-0026 §5
  Pattern 3).
- **Postgres**: durable; survives crashes; adds query latency per op.

Pattern 5 (idempotent verification keys per ADR-0026 §5) lands at
sub-phase 6 with the consumer choice (sub-phase 5b gRPC interop
ETS-likely; full Postgres state hydration sub-phase 6 Postgres-backed).
The decision deserves its own ADR (potential **ADR-0033 territory**)
if non-obvious architectural choices arise — ADR-0032 is gRPC interop
per Q-O lock; idempotency forward-queues to sub-phase 6 consumer.

### Why ADR-0026 §5 load-bearing subset (patterns 1, 2, 6)?

ADR-0026 §5 documents **6 BEAM-compatibility patterns** (per the
canonical record `dual-control-operations-canonical-record.md` §5).
At sub-phase 4b, the **load-bearing subset** is patterns 1, 2, 6;
patterns 3, 4, 5 forward-queue to sub-phases 5/6 with their consumers:

- **Pattern 1 (message-passing semantics over shared state)** — maps
  to `GenServer.call/3` 7-op dispatch. Each call is a discrete
  message; no shared mutable state between Router and callers.
  **Load-bearing at sub-phase 4b.**
- **Pattern 2 (supervisor-friendly failure modes)** — maps to the
  typed `{:ok, result} | {:error, reason}` return shape for each
  `handle_call` head. Crash semantics are explicit; supervisor
  failure-modes (transient vs permanent) are inferrable.
  **Load-bearing at sub-phase 4b.**
- **Pattern 6 (pure transformation over imperative control)** — maps
  to `handle_call` as a pure decision function (state + message → new
  state + reply); side effects (gRPC sends, Postgres writes) happen
  at the consumer boundaries, not in Router's decision logic.
  **Load-bearing at sub-phase 4b.**

Forward-queued to sub-phases 5/6:
- **Pattern 3 (state reconstructible from durable storage)** — needs
  Postgres source-of-truth integration (sub-phase 5 first dep landing).
- **Pattern 4 (event-sourced audit semantics)** — needs audit chain
  integration with TypeScript-shared `audit_events` table (sub-phase
  5/6).
- **Pattern 5 (idempotent verification keys)** — needs idempotency
  strategy choice (sub-phase 5/6 per Q-D above).

## Consequences

### Sub-phase 4b code substrate constraints

1. **`CosmpRouter.Router` GenServer** + **`CosmpRouter.Capsule`
   struct** + **`CosmpRouter.Application` MOD** (children list adds
   Router as first worker).
2. All 7 ops as `handle_call` stubs per Q-C; bodies fill at sub-phase
   5+.
3. Empty deps (no telemetry / Jason / etc.) per Q-E.
4. Smoke test pattern from sub-phase 3 updates: `which_children/1`
   assertion now expects 1 child (Router worker named
   `CosmpRouter.Router`); test pattern itself (named-supervisor +
   tree introspection) carries forward unchanged.
5. CI Elixir tier remains canonical mechanical verification surface
   (operator's local Elixir install state at sub-phase 4a's authoring
   time is partial per Q-SUBSTRATE-STATE Option A-revised).

### Sub-phase 5b-i `[BEAM-COSMP-INTEROP-GRPC]` arrives (split per Q-P at sub-phase 5a per ADR-0032; further split per Q-R at sub-phase 5b-i per ADR-0033 forthcoming)

1. **First deps landing** (`:grpc` + `:protobuf` per ADR-0032 §Decision
   gRPC library choice) → cache-key evolution from
   `hashFiles('.tool-versions')` to
   `hashFiles('.tool-versions', '**/mix.lock')` per the forward-substrate
   awareness flag at sub-phase 3 `.github/workflows/ci.yml` cache step.
2. Fastify ↔ Elixir gRPC bridge worker added to Router supervision
   (per ADR-0032 §Decision Connection management).
3. **All 7 `handle_call` bodies fill** per Q-N (production live-grade;
   no `:not_implemented` stubs cross gRPC boundary per ADR-0032).
4. Idempotency strategy decision deferred to sub-phase 6
   `[BEAM-COSMP-INTEGRATION-TESTS]` consumer (ETS or Postgres-backed;
   potential **ADR-0033 territory** if non-obvious — ADR-0032 is
   gRPC interop per Q-O lock).
5. **Pattern 5 (idempotent verification keys)** instantiated at
   sub-phase 6 with idempotency strategy.

### Sub-phase 6 `[BEAM-COSMP-INTEGRATION-TESTS]` arrives

End-to-end 7-op flow tests; **patterns 3, 4, 5 fully instantiated**
(state reconstructible from Postgres + event-sourced audit + idempotent
keys all observable in test substrate).

### Patent-implementation evidence register strengthens (ADR-0020 Register 2)

Sub-phase 4a documents the canonical decision substrate; sub-phase 4b
instantiates it. Every commit on `origin/main` from sub-phase 4a
forward contributes **cryptographically-timestamped patent-implementation
evidence** distinguishing genuine NIOV Labs implementation from any
unauthorized parallel build attempting the patented architecture per
ADR-0020 two-register IP discipline.

## References

- ADR-0030 (Phase 2 Elixir/BEAM Implementation) §Decision sub-phase
  4a/4b — this ADR is the decision substrate; sub-phase 4b instantiates.
- ADR-0028 (Forward-Substrate: Elixir/BEAM Coordination Layer) —
  commitment-to-ship that triggered the Block B mini-arc.
- ADR-0026 (Dual-Control Middleware Pattern) §5 — 6 BEAM-compatibility
  patterns; load-bearing subset (patterns **1, 2, 6**) cited here as
  sub-phase 4b instantiation surface; patterns **3, 4, 5**
  forward-queued to sub-phases 5/6.
- ADR-0020 (Two-Register IP Discipline) — patent-implementation
  evidence framing; Register 2 (production substrate) is what sub-phase
  4b instantiates.
- ADR-0016 (Pin-and-Optimize Framework) — `.tool-versions` single
  source of truth for Elixir + Erlang/OTP pinning.
- ADR-0029 (Substrate-Build Optimizations) — `NEW-ADR.template.md`
  cascade discipline applied at this commit.
- US 12,517,919 — COSMP Protocol patent (Sadeil Lewis sole holder);
  the 7-op enumeration + 7-layer Capsule structure originates here.
- US 12,164,537 + US 12,399,904 — companion patents (DMW + capsule
  architecture).

## Forward path

| Sub-phase | Subject | This ADR's instantiation |
|-----------|---------|---------------------------|
| 4a | `[BEAM-COSMP-GENSERVER-ADR]` (this ADR) | Decision substrate ratified |
| 4b | `[BEAM-COSMP-GENSERVER-CODE]` | Router GenServer + Capsule placeholder + Application MOD + tests; patterns 1, 2, 6 instantiated |
| 5a | `[BEAM-COSMP-INTEROP-ADR]` | ADR-0032 (BEAM gRPC Interop Architecture) lands; documents `:grpc` + `:protobuf` canonical libraries + sync unary semantics + Protobuf encoding + auth at Fastify boundary + `.proto` versioning |
| 5b-i | `[BEAM-COSMP-INTEROP-GRPC]` | gRPC bridge (`cosmp.proto` + server + translator + 7 `handle_call` bodies fill) + `:grpc` + `:protobuf` deps + TypeScript `@grpc/grpc-js` client + cache-key forward-evolution |
| 5b-ii | `[BEAM-COSMP-INTEROP-PERSISTENCE]` | Postgres durable substrate + Ecto Repo + Capsule storage schema (7-layer JSONB mapping) + audit-chain integration + idempotency layer + ADR-0033 forthcoming |
| 6 | `[BEAM-COSMP-INTEGRATION-TESTS]` | End-to-end 7-op flow against live Postgres + audit-chain integrity verification across language boundary; patterns 3, 4, 5 already instantiated at sub-phase 5b-iii Commit B.1 (ADR-0026 §5 + ADR-0033 §Decision 4e + 5 + 6); sub-phase 6 covers integration-test-tier verification per D-5BIII-COMMITB-1-REFINED Sandbox + supervised-GenServer pattern resolution |
| 7 | `[BEAM-DBGI-APP-SKELETON]` | Sibling DBGI supervisor app skeleton |
| 8 | `[BEAM-DBGI-PROCESS-GROUPS]` | `:pg` + `:gproc` registry |
| 9 | `[BEAM-DBGI-LIBCLUSTER]` | Multi-region clustering |
| 10 | `[BEAM-DBGI-INTEGRATION-TESTS]` | End-to-end DBGI |
| 11 | `[BEAM-OBSERVABILITY]` | `:telemetry_metrics` + `:telemetry_poller` |
| 12 | `[BEAM-CANONICAL-RECORD]` | `beam-coordination-canonical-record.md` |
| 13 | `[BEAM-ARC-CLOSURE]` | Onboarding cascade + section-12 row 35 + ADR-0028 forward → landed + ADR-0030 arc-closure |

Block B count expansion: **19 sub-phases** (expanded 13 → 14 at
sub-phase 4a per Q-G split — see this ADR; 14 → 15 at sub-phase 5a
per Q-P split — see ADR-0032; 15 → 16 at sub-phase 5b-i per Q-R
split — see ADR-0033; 16 → 17 at sub-phase 5b-iii per Q-NEW-SPLIT
split — see ADR-0033 §Forward path; 17 → 18 at sub-phase 6a per
Q-NEW-SPLIT-2 split — see ADR-0034; 18 → 19 at sub-phase 6c per
Q-NEW-SPLIT-3 split — see ADR-0035).

Bidirectional citations (cited from):

- ADR-0030 (Phase 2 Elixir/BEAM Implementation) — §Decision sub-phase
  4a/4b forward-cites this ADR as the canonical decision substrate;
  ADR-0030 §Bidirectional citations back-cites this ADR.
- ADR-0032 (BEAM gRPC Interop Architecture; landed at sub-phase 5a
  `[BEAM-COSMP-INTEROP-ADR]`) — **load-bearing**: ADR-0032 instantiates
  the cross-language transport boundary this ADR's §Forward path
  sub-phase 5 declared (now sub-phase 5a + 5b per Q-P split). ADR-0032
  §References cites this ADR's §Forward path entry; ADR-0032's
  `(cited from)` block back-cites this ADR.
- ADR-0026 (Dual-Control Middleware Pattern) — §Bidirectional
  citations back-cites this ADR as a consumer of §5 patterns 1, 2, 6
  (load-bearing subset; patterns 3, 4, 5 forward-queued to sub-phases
  5/6).
