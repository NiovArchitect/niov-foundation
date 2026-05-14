defmodule DbgiSupervisor do
  @moduledoc """
  Database Gateway Intelligence (DBGI) Supervisor.

  Substantively coordinates supervised process groups for distributed
  Capsule coordination per ADR-0028 §3 + ADR-0030 §DBGI canonical at
  the substrate-architectural register. Sub-phase 7
  `[BEAM-DBGI-APP-SKELETON]` lands the OTP app skeleton (mix.exs +
  Application module + Supervisor `:one_for_one` tree with empty
  children list); substantive DBGI substrate forward-queued to
  sub-phases 8-10 per ADR-0030 §DBGI Supervisor Layer canonical at
  NIOV substrate-architectural register.

  ## Forward queue (sub-phases 8-10 per ADR-0030 §DBGI canonical)

  - **Sub-phase 8** `[BEAM-DBGI-PROCESS-GROUPS]` — distributed
    process-group registry via `:pg` (OTP-native) + `:gproc` (richer
    registry semantics) + `Registry` + `DynamicSupervisor` per
    ADR-0028 §3 canonical for combined-vs-siloed data isolation
  - **Sub-phase 9** `[BEAM-DBGI-LIBCLUSTER]` — multi-region clustering
    via `libcluster` + `Phoenix.PubSub` cross-node messaging +
    CRDT-backed state where workload permits per ADR-0028 §3 canonical
  - **Sub-phase 10** `[BEAM-DBGI-INTEGRATION-TESTS]` — process group
    join/leave + clustering formation + failover across nodes per
    ADR-0030 §DBGI canonical

  ## Substrate-architectural references

  - ADR-0001 (Three-Wallet Architecture; internal-register substrate
    for Personal + Enterprise + Twin canonical)
  - ADR-0026 §5 (6 BEAM compatibility patterns canonical at the
    substantive register)
  - ADR-0028 §3 (BEAM Coordination Layer canonical for DBGI
    substantive scope; names GenStage + Registry + DynamicSupervisor +
    libcluster + Phoenix.PubSub + CRDT-backed state)
  - ADR-0030 §DBGI Supervisor Layer (Phase 2 implementation canonical
    sub-phases 7-10)
  - ADR-0034 (BEAM COSMP Testability Refactor Pattern; carries forward
    to DBGI substrate at the canonical-pattern register — per-test
    instances via `start_supervised!` + name-configurability)
  - ADR-0035 (Substrate-Build Discipline Canonical; substantively
    load-bearing at DBGI substrate-build register)
  """
end
