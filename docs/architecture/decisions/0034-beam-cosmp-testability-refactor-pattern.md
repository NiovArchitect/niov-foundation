# ADR-0034: BEAM COSMP Testability Refactor Pattern

## Status

Accepted at sub-phase 6a `[BEAM-COSMP-TESTABILITY-REFACTOR]`
(2026-05-14). Founder authorization per RULE 20 explicit at this
ADR's creation.

## Context

Sub-phase 6 `[BEAM-COSMP-INTEGRATION-TESTS]` pre-flight surfaced
cross-test-cycle Sandbox fragility — 19-34-test failure cascade
when integration tests run alongside the default suite. Three
Sandbox pattern probes (`Sandbox.allow` per-process,
`Sandbox.mode {:shared, self()}` per-test with on_exit `:manual`
restore, `Sandbox.start_owner!`/`stop_owner` canonical Ecto v3
pattern) all worked in isolation on `router_test.exs` alone but
none resolved the full-suite cascade. Failure modes shifted across
probes (Postgrex enum violation pre-hotfix `def66b9`,
`DBConnection.OwnershipError`, supervised-process death cascade
through ETS) — symptoms of a substrate observation that local
Sandbox iteration cannot resolve.

### D-WIDER-KNOWLEDGE-CHECK discipline canonical NEW

Operator-tier strategic call: substrate-build discipline at the
Elixir/BEAM register includes broader Elixir community pattern
research before authorizing fixes when substrate-state observations
suggest architectural-register coupling. Local Sandbox iteration on
observations suggesting architectural-register coupling is a
substrate-build discipline failure — the right register for the fix
is the architecture, not the Sandbox API.

### Wider knowledge surface — six canonical sources consulted

- **Ecto.Adapters.SQL.Sandbox docs**
  (https://hexdocs.pm/ecto_sql/Ecto.Adapters.SQL.Sandbox.html) —
  `start_owner!`/`stop_owner` + `Sandbox.allow` patterns for
  supervised GenServers. Critical excerpt: "`start_owner!/2` should
  be used in place of `checkout/2`. `start_owner!/2` solves the
  problem of unlinked processes started in a test outliving the
  test process and causing ownership errors."
- **Sean Lewis "Elixir Concurrent Testing Architecture"**
  (https://sensaisean.medium.com/elixir-concurrent-testing-architecture-13c5e37374dc) —
  per-test GenServer instances via name-configurability +
  `start_supervised!`; manager-layer pattern; `Application.compile_env`
  default-preservation. Critical excerpt: "Every test file should
  be configured as `async: true`, and `start_supervised` should be
  used to start unique GenServers or other required async processes
  in the setup block."
- **DockYard "Understanding Test Concurrency in Elixir"**
  (https://dockyard.com/blog/2019/02/13/understanding-test-concurrency-in-elixir) —
  explicit architectural framing. Critical excerpt: "Each test
  spins up its own instance of the GenServer to work with… mixing
  concurrent tests with a shared mutable state of any kind will
  cause problems."
- **KV.Registry Mix-OTP canonical** (Elixir official tutorial) —
  `:name` required option (`Keyword.fetch!(opts, :name)`),
  ETS-named-by-server-name, `start_supervised!` test pattern.
  Process registry and ETS table registry are distinct namespaces —
  same atom usable for both without collision.
- **Thoughtbot "How to start processes with dynamic names in Elixir"**
  (https://thoughtbot.com/blog/how-to-start-processes-with-dynamic-names-in-elixir) —
  atom-limit caveat (Erlang VM has hard upper limit on unique
  atoms) + Registry alternative for non-atom registration.
- **Elixir Forum threads on supervised GenServer testing** — case
  studies of per-test instances vs. application-supervised
  singletons + Sandbox.allow.

### Synthesized canonical pattern

Per-test GenServer instances via `start_supervised!` with unique
atom names; production singleton preserved at default `__MODULE__`;
`Sandbox.start_owner!(Repo, shared: true)` + `stop_owner` per-test
for supervised-process Repo access.

### NIOV's pre-research architecture

`CosmpRouter.Router` + `CosmpRouter.Storage.ETS` both registered
with hardcoded `name: __MODULE__`. Singleton-supervised at
`CosmpRouter.Application.start/2`; every test in every file shared
the same Router PID and ETS table. This architecture is canonically
incompatible with concurrent integration testing per the broader
Elixir ecosystem. Sandbox patterns are downstream — they address
connection ownership across processes but cannot address shared
GenServer state across tests.

## Decision

NIOV Labs implements the broader Elixir community canonical
testability pattern at the COSMP coordination layer substrate.
Five sub-decisions LOCKED at Checkpoint 0 (Founder-authorized):

### Sub-decision 1: API surface — Explicit name first arg (KV.Registry canonical)

`CosmpRouter.Storage.ETS` public functions accept `name` as first
positional argument with default `__MODULE__`:

```elixir
def put(name \\ __MODULE__, capsule_id, capsule), do: :ets.insert(name, ...)
def get(name \\ __MODULE__, capsule_id), do: :ets.lookup(name, capsule_id) ...
def delete(name \\ __MODULE__, capsule_id), do: :ets.delete(name, ...)
def list(name \\ __MODULE__), do: :ets.tab2list(name)
def clear(name \\ __MODULE__), do: :ets.delete_all_objects(name)
```

**Alternative considered (Option β, rejected):** Internal Registry
lookup (each instance registers in `Registry`; functions look up
current via process dictionary or app env). Rejected for being
more magic; harder to reason about; doesn't align with codebase's
explicit-args style.

**Rationale:** KV.Registry canonical at Elixir Mix-OTP tutorial;
substrate honesty (no Registry indirection or process-dictionary
magic); aligned with codebase's explicit-args style; backwards-
compatible (default arg fallback preserves all existing call sites).

### Sub-decision 2: Router state holds storage_ets reference; Storage facade :ets opt threading

`CosmpRouter.Router.State` struct gains `:storage_ets` field;
`Router.init/1` captures from opts (default `CosmpRouter.Storage.ETS`);
Router `handle_call` clauses thread `state.storage_ets` to
Storage facade calls via `:ets` opt:

```elixir
case Storage.get(req.capsule_id, ets: state.storage_ets) do
  ...
end
```

Storage facade functions accept `opts \\ []`; default `:ets` to
module reference; thread to Storage.ETS calls. Production callers
omit `:ets`; tests pass per-test atom.

**Alternative considered (Option β, rejected):** Router bypasses
facade for write path; Router state holds `storage_ets`; Router
calls `Storage.ETS` directly for hot-tier warm post-Postgres-commit.
Read path still through facade. Rejected for breaking facade
abstraction at write path.

**Rationale:** Preserves Storage facade abstraction per ADR-0033
§Decision 5 (facade canonical for both read and write paths);
single opt threaded through; substrate-coherent abstraction layer.

### Sub-decision 3: GRPC.Server scope deferred to 6b

`CosmpRouter.GRPC.Server` retains hardcoded `CosmpRouter.Router`
reference at 7 handler sites. Sub-phase 6b `grpc/server_test.exs`
uses application-supervised singleton +
`Sandbox.allow(Repo, self(), Process.whereis(CosmpRouter.Router))`
per Ecto.Adapters.SQL.Sandbox canonical pattern for the
app-supervised GenServer case.

**Alternative considered (Option α, rejected):** Refactor
GRPC.Server in 6a to accept `:router_name` via application env
or function arg. Rejected for expanding 6a scope beyond
substrate-coherent boundary; the Ecto canonical pattern for
app-supervised GenServers is `Sandbox.allow`, not per-test
instances.

**Rationale:** Smaller 6a scope = substrate-coherent boundary at
architectural refactor; canonical Ecto pattern; tests are
`async: false` already so concurrency isn't substantively lost;
if 6b surfaces issues, can refactor at 6b or defer to sub-phase 7+
DBGI substrate work where testability discipline pattern reapplied.

#### Sub-decision 3-amendment (sub-phase 6b Phase 3 Step 3-e): canonical Ecto v3 discrimination

Sub-phase 6b Phase 3 Step 3-e execution surfaced substrate-state
ground truth at the integration-tier execution register: the
original Sub-decision 3 framing ("`Sandbox.allow` canonical Ecto
pattern for app-supervised GenServer case") conflated single-test
vs sequential-multi-test scenarios at substrate-state register.
Both patterns are documented at Ecto.Adapters.SQL.Sandbox canonical
docs but at DIFFERENT registers; the discrimination surfaces only
when the sequential-multi-test scenario executes.

**Canonical discrimination at canonical-pattern register**:

- **`Sandbox.allow(Repo, self(), pid)`** is canonical for **single-
  test cross-process access** — one test boundary; one Sandbox
  owner; per-test isolation; the test process IS the Sandbox
  owner. Suitable when an app-supervised GenServer accesses the
  Repo within a single test only.
- **`start_owner!(Repo, shared: true)` + `stop_owner(pid)`** is
  canonical for **sequential multi-test access to app-supervised
  GenServer within same test module** — a **dedicated owner
  process** surviving the test process lifecycle; `shared: true`
  grants the app-supervised GenServer access to the owner's
  connection; `on_exit(fn -> stop_owner(pid) end)` cleanly tears
  down at test boundary.

**Substrate-state observation lineage**: see ADR-0035 §9
**D-SANDBOX-ALLOW-VS-START-OWNER-DISCRIMINATION** (16th canonical
substrate-build observation). Per-test `Sandbox.allow` surfaces
`DBConnection.OwnershipError` on the second test in same module
run because the app-supervised GenServer PID retains internal
ownership state from the prior test; `start_owner!` resolves at
substrate-coherent canonical register by introducing a dedicated
owner process whose lifecycle is decoupled from individual test
processes.

**Resolution at sub-phase 6b Phase 3 Step 3-e**:
`apps/cosmp_router/test/cosmp_router/grpc/server_test.exs` setup
pattern rotated to `start_owner!/stop_owner` canonical Ecto v3
register. Per-test instances (e.g., `router_test.exs`'s
`start_router!/1` + `start_sandbox_owner!/0` helpers from
`CosmpRouter.RouterTestHelpers`) continue to use canonical per-
test pattern (each test spawns fresh Router + Storage.ETS
instances; `start_sandbox_owner!/0` already wraps `start_owner!`
internally per ADR-0034 Sub-decision 1 + 2). App-supervised access
(grpc/server_test.exs against singleton `CosmpRouter.Router`) uses
sequential-test canonical pattern at `setup` block:

```elixir
setup do
  owner = Ecto.Adapters.SQL.Sandbox.start_owner!(Repo, shared: true)
  on_exit(fn -> Ecto.Adapters.SQL.Sandbox.stop_owner(owner) end)
  # ... FK parents + test data
end
```

**Cross-references**:

- ADR-0035 §9 **D-SANDBOX-ALLOW-VS-START-OWNER-DISCRIMINATION**
  16th canonical substrate-build observation (bidirectional
  citation per RULE 14)
- Ecto.Adapters.SQL.Sandbox canonical docs
  (https://hexdocs.pm/ecto_sql/Ecto.Adapters.SQL.Sandbox.html) —
  `start_owner!/2` semantics + canonical sequential-test pattern
- `apps/cosmp_router/test/cosmp_router/grpc/server_test.exs` setup
  block — canonical pattern instantiation at sub-phase 6b
- `apps/cosmp_router/test/support/router_test_helpers.ex`
  `start_sandbox_owner!/0` — canonical per-test pattern
  instantiation (wraps `start_owner!` for per-test Router
  instances)

This amendment is **canonical-pattern register clarification**, NOT
architectural-register supersession. ADR-0034 substantive
architectural scope (testability refactor pattern + 5 sub-decisions)
preserved at the canonical register. Founder authorization per
RULE 20 explicit at this amendment's landing
(`[ADR-0034-SUB-DECISION-3-AMENDMENT]` commit post-sub-phase-6b CI
green).

### Sub-decision 4: ETS table name = GenServer name (same atom; :named_table semantics)

`Storage.ETS.init/1` creates
`:ets.new(name, [:set, :public, :named_table, ...])` with the same
atom as the GenServer's registered name. Production uses
`__MODULE__` for both; tests use unique atoms (e.g.,
`:"ets_test_#{System.unique_integer([:positive])}"`).

**Alternative considered (Option β, rejected):** ETS table name
derived (e.g., `Module.concat(name, :Table)`). Rejected for adding
indirection without resolving any actual ambiguity — Elixir's
process registry and ETS registry are distinct namespaces per
KV.Registry canonical, so no atom collision occurs.

**Rationale:** KV.Registry canonical at Elixir Mix-OTP tutorial;
Elixir process names and ETS table names are stored in distinct
registries; simplest pattern; minimal cognitive load at future
contributor onboarding.

### Sub-decision 5: This ADR documents the canonical pattern + D-WIDER-KNOWLEDGE-CHECK substrate-build discipline

NEW ADR at substrate-build register; joins ADR-0031/0032/0033
substrate-architecture register; load-bearing for sub-phase 6b
consumption + sub-phases 7-13 DBGI substrate testability discipline
ports.

D-WIDER-KNOWLEDGE-CHECK canonical observation NEW: substrate-build
discipline at Elixir/BEAM register includes broader community
pattern research before authorizing fixes that suggest
architectural register involvement. Joins substrate-build
discipline cluster (now 8 canonical observations):

- **D-CI-FRESH-1/2/3** (cross-environment register)
- **D-IDEMPOTENCY-3** (substrate-landing-with-CI-MOD)
- **D-5BIII-COMMITB-1/2/3-REFINED** (test-granularity-tier; sub-phase 6
  pre-flight surfaced this as architectural rather than Sandbox-API)
- **D-SUBSTRATE-LANDING-PREEMPT** (forward-reference rotation)
- **D-AUDIT-OUTCOME-ENUM** (integration-test-tier catches substrate-
  coherence bugs unit-tier excluded missed)
- **D-ABORT-CONDITION-PRECISION** (abort conditions need substrate-
  state ground truth precision)
- **D-WIDER-KNOWLEDGE-CHECK** (this ADR; substrate-build discipline
  at Elixir/BEAM register includes broader community pattern
  research before authorizing fixes when substrate-state observations
  suggest architectural-register coupling)

**Alternative considered (Options β/γ, rejected):** Document
inline in ADR-0031 amendment OR in 6a commit body without new ADR.
Rejected for missing the substrate-build discipline canonical
register — D-WIDER-KNOWLEDGE-CHECK is a NEW discipline that
warrants its own canonical home; ADR-0031 amendment would dilute
ADR-0031's substrate-architecture register scope.

**Rationale:** NEW ADR keeps register boundaries clean (ADR-0031
= Router substrate architecture; ADR-0034 = testability refactor
pattern + D-WIDER-KNOWLEDGE-CHECK discipline). Founder
authorization per RULE 20 explicit at this ADR's creation.

## Consequences

### Easier

- Production singleton supervision tree unchanged; all default-arg
  fallbacks preserve existing call sites (zero substrate-state
  change at production register)
- Per-test instance pattern available via
  `CosmpRouter.RouterTestHelpers.start_router!/1` (NEW
  `test/support/router_test_helpers.ex`)
- Cross-test-cycle state contamination eliminated at architectural
  register (sub-phase 6b will verify with 19 deferred tests)
- Pattern compounds at sub-phases 7-13 DBGI substrate (DBGI
  supervisor uses same name-configurability pattern; testability
  discipline canonical at the Elixir/BEAM register propagates)
- D-WIDER-KNOWLEDGE-CHECK discipline canonical at substrate-build
  register; future Elixir/BEAM substrate work researches broader
  community canonical patterns first

### Harder

- Storage.ETS public API expanded (name first arg + default);
  cognitive load — minimal because default arg preserves familiar
  shape: `Storage.ETS.put(capsule_id, capsule)` still works
- Storage facade `:ets` opt threading visible at Router
  `handle_call` sites; explicit substrate honesty cost — but
  serves the testability discipline canonical
- Tests must use `start_supervised!` pattern + unique atoms;
  canonical Elixir community pattern (so cognitive load is
  Elixir-community-standard, not NIOV-specific)
- Atom-limit caveat (Erlang VM hard upper limit on unique atoms);
  per-test unique atoms safe at our scale (~100s of tests; VM
  limit ~1M); discipline note: do not use this pattern for
  user-input-derived names — would surface atom exhaustion

## Alternatives Considered

### Per-test Router restart via Supervisor.restart_child

Restart the supervised Router GenServer between every test via
`Supervisor.restart_child(CosmpRouter.Supervisor, CosmpRouter.Router)`.
Rejected for being more expensive (~50ms per test) and not solving
ETS table reuse — the supervised ETS would still hold cross-test
state unless also restarted.

### DynamicSupervisor with Registry

Replace static supervision tree with `DynamicSupervisor`; each
test calls `DynamicSupervisor.start_child` with a fresh Router
instance registered in a `Registry`. Rejected for over-engineering
the production register — NIOV's production Router is a singleton
by design; multi-tenant Router instances are sub-phase 7-10 DBGI
substrate work. Adding DynamicSupervisor at sub-phase 6a expands
scope beyond testability refactor.

### Mock/Stub the Router for integration tests

Use `Mox` to stub Router responses in tests. Rejected for losing
the substrate-coherence verification that integration tests
provide — the patent-canonical 7-op COSMP surface MUST be tested
against real GenServer messaging + real Postgres + real audit-chain
per RULE 3 (tests are not optional) + RULE 4 (audit-trail integrity).

### Local Sandbox iteration without architectural research (the D-WIDER-KNOWLEDGE-CHECK trap)

Continue iterating on Sandbox patterns (different `Sandbox.mode`
configurations, ordering, on_exit timing). Rejected as discipline-
failure mode: substrate observations surfaced at sub-phase 6
pre-flight pointed at architectural-register coupling
(supervised-singleton across tests), not at Sandbox API mismatch.
Iterating on Sandbox alone is local-tier work for an architectural-
tier problem. D-WIDER-KNOWLEDGE-CHECK discipline canonical at this
register — when substrate-state observations suggest architectural
coupling, research the broader community canonical pattern at the
architectural register before authorizing fixes.

## Forward Path

| Sub-phase | Subject | This ADR's instantiation |
|-----------|---------|---------------------------|
| 6a | `[BEAM-COSMP-TESTABILITY-REFACTOR]` (this commit) | Router + Storage.ETS + Storage facade + Application docstring + test helpers + mix.exs elixirc_paths + ADR-0034 substantive landing |
| 6b | `[BEAM-COSMP-INTEGRATION-TESTS]` | 19 deferred tests consume refactored architecture via `start_router!/1` + `start_sandbox_owner!/0`; CI workflow MOD `mix test --include integration`; D-PHASE-1-UUID-CAST resolved at Storage.Postgres.get/1 guard; 18-site forward-ref rotation cleanup; Q-NEW-SPLIT-2 17→18 cumulative-lineage cascade |
| 7-10 | DBGI sub-phases | DBGI supervisor + DBGI integration tests port name-configurability pattern; ADR-0034 cited load-bearing at the testability discipline register |
| 11 | `[BEAM-OBSERVABILITY]` | `:telemetry_metrics` events emitted at per-test instance register; multi-instance observability surface |
| 12 | `[BEAM-CANONICAL-RECORD]` | `beam-coordination-canonical-record.md` references this ADR's testability pattern as canonical at the Elixir/BEAM register |
| 13 | `[BEAM-ARC-CLOSURE]` | Arc-closure cascade; D-WIDER-KNOWLEDGE-CHECK substrate-build observation propagates to engineer onboarding doc + section-12-progress.md |

## References

### Wider-knowledge sources (D-WIDER-KNOWLEDGE-CHECK canonical)

- Ecto.Adapters.SQL.Sandbox docs:
  https://hexdocs.pm/ecto_sql/Ecto.Adapters.SQL.Sandbox.html
- Sean Lewis "Elixir Concurrent Testing Architecture":
  https://sensaisean.medium.com/elixir-concurrent-testing-architecture-13c5e37374dc
- DockYard "Understanding Test Concurrency in Elixir":
  https://dockyard.com/blog/2019/02/13/understanding-test-concurrency-in-elixir
- KV.Registry Mix-OTP tutorial (Elixir official):
  https://elixir-lang.org/getting-started/mix-otp/ets.html
- Thoughtbot "How to start processes with dynamic names in Elixir":
  https://thoughtbot.com/blog/how-to-start-processes-with-dynamic-names-in-elixir
- Elixir Forum thread on supervised GenServer testing:
  https://elixirforum.com/t/how-to-test-a-supervised-genserver/46402

### NIOV-internal substrate references

- ADR-0031 (BEAM Routing Substrate Architecture) §Decision State
  shape — Router name-hardcoding amended via this ADR
- ADR-0033 (BEAM Persistence + Idempotency + Audit-Chain
  Cryptographic Substrate Architecture) §Decision 5 — Storage
  facade `:ets` opt threading at this ADR
- ADR-0026 (Dual-Control Middleware Pattern) §5 BEAM-compatibility
  patterns — testability discipline aligns with Pattern 6 (pure
  transformation) + supports Patterns 1, 2, 3, 4, 5 at integration-
  test register
- ADR-0030 (Phase 2 Elixir/BEAM Implementation) §Decision sub-phase
  1-13 — Block B mini-arc; this ADR lands at sub-phase 6a per
  Q-NEW-SPLIT-2 split (Block B count 17 → 18; cumulative-lineage
  cascade at 6b closure register)
- ADR-0020 (Two-Register IP Discipline) — substrate-coherence at
  engineering substrate register (this ADR operates at Register 2:
  business-grade canonical topology)
- RULE 20 (Rule-Modification Authority) — Founder authorization
  explicit at this ADR's creation
- RULE 13 (Surface Drifts Inline Over Silent Fix) — sub-phase 6
  pre-flight surface of D-WIDER-KNOWLEDGE-CHECK observation
  preceded this ADR's authorization

## Bidirectional Citations

### Cited from

- ADR-0031 §Amendment forward-substrate note (Router
  name-hardcoding amended; back-citation to ADR-0034 §Decision
  Sub-decision 1+2; deferred to 6a commit body until 6b cascade
  per D-SUBSTRATE-LANDING-PREEMPT)
- ADR-0033 §Decision 5 (Storage facade `:ets` opt threading
  cross-citation; deferred to 6b cascade per
  D-SUBSTRATE-LANDING-PREEMPT)
- Sub-phase 6b commit body (substrate consumption via
  `RouterTestHelpers.start_router!/1`)
- Sub-phases 7-13 DBGI substrate (testability discipline ports
  cite ADR-0034 load-bearing)
- `docs/architecture/README.md` ADR catalog (Phase 8 of this
  commit)
- `CLAUDE.md` ADR catalog (Phase 8 of this commit; operating
  manual register)

### Cites

- ADR-0031 (BEAM Routing Substrate Architecture; Router name
  hardcoding amended)
- ADR-0033 (BEAM Persistence + Idempotency + Audit-Chain
  Cryptographic Substrate Architecture; Storage facade :ets opt
  threading)
- ADR-0026 (Dual-Control Middleware Pattern; §5 BEAM patterns)
- ADR-0030 (Phase 2 Elixir/BEAM Implementation; Block B mini-arc)
- ADR-0020 (Two-Register IP Discipline; engineering substrate
  register)
