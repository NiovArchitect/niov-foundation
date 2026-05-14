defmodule DbgiSupervisor.Application do
  @moduledoc """
  OTP Application callback for the DBGI Supervisor layer.

  Establishes the supervision tree with `:one_for_one` strategy —
  production-grade default for distributed Capsule coordination where
  child failures must NOT cascade. Mirrors `CosmpRouter.Application`
  supervision strategy canonical at sub-phase 3 register.

  ## Sub-phase 7 status (this commit)

  Children list is **empty** at sub-phase 7. The mechanical OTP app
  skeleton lands the Application + Supervisor process tree per
  ADR-0030 §DBGI Supervisor Layer canonical; substantive children
  forward-queued to sub-phases 8-9 per ADR-0028 §3 + ADR-0030 §DBGI
  canonical at NIOV substrate-architectural register.

  ## Forward queue (sub-phases 8-9 children list expansion)

  Per ADR-0028 §3 + ADR-0030 §DBGI canonical at substrate-architectural
  register, the following children land at sub-phases 8-9:

  - **Sub-phase 8** `[BEAM-DBGI-PROCESS-GROUPS]`:
    - `{Registry, keys: :unique, name: DbgiSupervisor.Registry}` —
      per-silo process addressing canonical (Q-PHASE-3-RULE-11
      RQ5 canonical at sub-phase 7 Phase 0 surface)
    - `{DynamicSupervisor, strategy: :one_for_one,
      name: DbgiSupervisor.DynamicSupervisor}` — dynamic per-silo
      child spawning canonical
    - `:pg` start (OTP-native; via `:pg.start_link/0` or
      `:pg.start_link/1` namespaced)
    - `:gproc` start (Hex dep; richer registry semantics for
      pattern-based discovery)
  - **Sub-phase 9** `[BEAM-DBGI-LIBCLUSTER]`:
    - `{Cluster.Supervisor, [topologies,
      [name: DbgiSupervisor.ClusterSupervisor]]}` — libcluster
      multi-region topology canonical
    - `{Phoenix.PubSub, name: DbgiSupervisor.PubSub}` — cross-node
      messaging canonical per ADR-0028 §3

  ## References

  - ADR-0028 §3 (BEAM Coordination Layer — names canonical patterns
    for DBGI substrate at substrate-architectural register)
  - ADR-0030 §DBGI Supervisor Layer (Phase 2 implementation sub-phases
    7-10)
  - https://hexdocs.pm/elixir/Application.html
  - https://hexdocs.pm/elixir/Supervisor.html
  """

  use Application

  @impl true
  def start(_type, _args) do
    children = [
      # Sub-phase 7 [BEAM-DBGI-APP-SKELETON]: empty children list at
      # OTP app skeleton register. Substantive DBGI substrate children
      # forward-queued to sub-phases 8-9 per ADR-0028 §3 + ADR-0030
      # §DBGI Supervisor Layer canonical at substrate-architectural
      # register.
    ]

    opts = [strategy: :one_for_one, name: DbgiSupervisor.Supervisor]
    Supervisor.start_link(children, opts)
  end
end
