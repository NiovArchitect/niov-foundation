# dbgi_supervisor

Database Gateway Intelligence (DBGI) Supervisor — OTP app for
distributed Capsule coordination per ADR-0028 §3 + ADR-0030 §DBGI
Supervisor Layer canonical at the substrate-architectural register.

## Substrate-architectural scope

Sub-phase 7 `[BEAM-DBGI-APP-SKELETON]` lands the mechanical OTP app
skeleton (`mix.exs` + `Application` module + Supervisor `:one_for_one`
tree with empty children list) per ADR-0030 §DBGI canonical. The
sibling app pattern mirrors `apps/cosmp_router/` (sub-phase 3
canonical) — umbrella-aware project config with shared
`_build` + `deps` + `mix.lock` + `config` at umbrella root.

Substantive DBGI substrate forward-queued to sub-phases 8-10 per
ADR-0030 §DBGI Supervisor Layer canonical at substrate-architectural
register:

- **Sub-phase 8** `[BEAM-DBGI-PROCESS-GROUPS]` — distributed
  process-group registry via `:pg` (OTP-native) + `:gproc` (Hex dep;
  richer registry semantics) + `Registry` (unique keys; per-silo
  process addressing) + `DynamicSupervisor` (dynamic per-silo child
  spawning) per ADR-0028 §3 + sub-phase 7 Phase 0 RULE 11 broader-
  community research surface RQ5 canonical (combined+siloed data
  isolation at the canonical-pattern register)

- **Sub-phase 9** `[BEAM-DBGI-LIBCLUSTER]` — multi-region clustering
  via `libcluster` (Hex dep; node discovery + cluster-formation
  strategy configurable per deployment-target — gossip / DNS /
  Kubernetes) + `Phoenix.PubSub` (Hex dep; cross-node messaging) +
  CRDT-backed state where the workload permits per ADR-0028 §3

- **Sub-phase 10** `[BEAM-DBGI-INTEGRATION-TESTS]` — process group
  join/leave + clustering formation + failover semantics across nodes
  per ADR-0030 §DBGI canonical at integration-test register

## Substrate-state at this commit (sub-phase 7)

- `mix.exs` — sibling app project config (umbrella-aware; deps list
  empty)
- `lib/dbgi_supervisor.ex` — top-level module documentation
- `lib/dbgi_supervisor/application.ex` — OTP Application + Supervisor
  `:one_for_one` tree with empty children list
- `test/test_helper.exs` — `ExUnit.start()` minimal
- `test/dbgi_supervisor_test.exs` — 2 placeholder tests (process
  lifecycle + empty children list verification)

## References

- **ADR-0001** — Three-Wallet Architecture (Personal + Enterprise +
  Twin) at internal-register substrate canonical
- **ADR-0026 §5** — 6 BEAM-compatibility patterns canonical at
  substantive register (message-passing, supervisor-friendly failures,
  durable-state-reconstructible, event-sourced audit, idempotent
  verification keys, pure transformation)
- **ADR-0028 §3** — BEAM Coordination Layer canonical for DBGI
  substantive scope (Registry + DynamicSupervisor + libcluster +
  Phoenix.PubSub + GenStage + CRDT-backed state)
- **ADR-0030 §DBGI Supervisor Layer** — Phase 2 implementation
  canonical sub-phases 7-10
- **ADR-0034** — BEAM COSMP Testability Refactor Pattern; testability
  discipline forward-applied at sub-phase 10 integration-test register
- **ADR-0035** — Substrate-Build Discipline Canonical; substantively
  load-bearing at DBGI substrate-build register; 4 successive RULE 11
  surfaces verified canonical-coherence at NIOV substrate-architectural
  register at sub-phase 7 Phase 0 register

## Forward-queue substantive scope

| Sub-phase | Subject | Substantive scope |
|-----------|---------|-------------------|
| 8 | `[BEAM-DBGI-PROCESS-GROUPS]` | `:pg` + `:gproc` + Registry + DynamicSupervisor canonical; combined+siloed data isolation per RQ5 canonical |
| 9 | `[BEAM-DBGI-LIBCLUSTER]` | libcluster + Phoenix.PubSub + CRDT-backed state canonical; multi-region topology per RQ2 + RQ4 canonical |
| 10 | `[BEAM-DBGI-INTEGRATION-TESTS]` | Process group + clustering + failover integration tests per ADR-0034 testability canonical |
