defmodule DbgiSupervisor.Application do
  @moduledoc """
  OTP Application callback for the DBGI Supervisor layer.

  Establishes the supervision tree with `:one_for_one` strategy —
  production-grade default for distributed Capsule coordination where
  child failures must NOT cascade. Mirrors `CosmpRouter.Application`
  supervision strategy canonical at sub-phase 3 register.

  ## Sub-phase 9 status (this commit)

  Substantively expands children list to 6 children per ADR-0028 §3
  + ADR-0030 §DBGI canonical at substrate-architectural register.

  **Sub-phase 8 baseline (process-group substrate):**

  - **`:pg` OTP-native process group registry** — modern OTP 23+
    canonical; CRDT-based; cluster-aware; partition-tolerant.
    Namespaced scope `DbgiSupervisor.PG`. Per
    D-PHASE-8-PG-VS-GPROC-DISCRIMINATION 21st canonical.
  - **`Registry`** — `:unique` keys for one-DMW-one-process
    addressing canonical at ADR-0028 §3 register.
  - **`DynamicSupervisor`** — `:one_for_one` strategy for per-DMW
    process lifecycle canonical at ADR-0028 §3 register.

  **Sub-phase 9 expansion (multi-region cluster substrate):**

  - **`Cluster.Supervisor`** (libcluster) — multi-region node
    discovery + cluster-formation strategy configurable per
    deployment-target. Topology configured via
    `Application.get_env(:libcluster, :topologies)` per ADR-0018
    deployment-agnostic canonical; empty topology default at
    umbrella-level register; `Cluster.Strategy.Epmd` canonical at
    local-dev + test register; `Gossip` / `Kubernetes` / `DNS` at
    production deployment-target register.
  - **`Phoenix.PubSub`** (named `DbgiSupervisor.PubSub`) — cross-node
    messaging canonical at ADR-0028 §3 register. PG2 adapter
    (Phoenix.PubSub default) substantively coexists with modern
    `:pg` substrate (sub-phase 8 `DbgiSupervisor.PG`) per
    D-PHASE-9-PG2-VS-PG-COEXISTENCE 28th canonical substrate-build
    observation candidate — two distinct registers, two distinct
    namespaces, no conflict.
  - **`DbgiSupervisor.PresenceTracker`** (Phoenix.Tracker) — CRDT-
    backed presence canonical at ADR-0028 §3 "CRDT-backed state
    where the workload permits" register. Per
    D-PHASE-9-PHOENIX-TRACKER-ADR-0030-AMENDMENT-CANDIDATE 27th
    canonical substrate-build observation candidate; ADR-0030 §DBGI
    sub-phase 9 amendment LANDS this commit.

  ## Forward-queue at sub-phases 10+ per ADR-0030 §DBGI canonical

  - **Sub-phase 10** `[BEAM-DBGI-INTEGRATION-TESTS]`: process group
    join/leave + clustering formation + failover across nodes per
    ADR-0034 testability discipline canonical
  - **Sub-phase 11+ (forward-queued)**: `:gproc` canonical at
    backward-compatibility register if substantively load-bearing
    surfaces (D-PHASE-8-PG-VS-GPROC-DISCRIMINATION recursively
    applies)

  ## References

  - ADR-0028 §3 (BEAM Coordination Layer — canonical patterns for
    DBGI substrate at substrate-architectural register)
  - ADR-0030 §DBGI Supervisor Layer (Phase 2 implementation sub-phases
    7-10; sub-phase 9 amendment LANDS this commit per
    D-PHASE-9-PHOENIX-TRACKER-ADR-0030-AMENDMENT-CANDIDATE 27th)
  - ADR-0035 (Substrate-Build Discipline Canonical;
    D-PHASE-8-PG-VS-GPROC-DISCRIMINATION 21st +
    D-PHASE-9-PHOENIX-TRACKER-ADR-0030-AMENDMENT-CANDIDATE 27th +
    D-PHASE-9-PG2-VS-PG-COEXISTENCE 28th observation candidates)
  - https://hexdocs.pm/elixir/Application.html
  - https://hexdocs.pm/elixir/Supervisor.html
  - https://www.erlang.org/doc/man/pg.html
  - https://hexdocs.pm/elixir/Registry.html
  - https://hexdocs.pm/elixir/DynamicSupervisor.html
  - https://hexdocs.pm/libcluster/Cluster.Supervisor.html
  - https://hexdocs.pm/phoenix_pubsub/Phoenix.PubSub.html
  - https://hexdocs.pm/phoenix_pubsub/Phoenix.Tracker.html
  """

  use Application

  @impl true
  def start(_type, _args) do
    children = [
      # Sub-phase 8 baseline (process-group substrate)
      # =============================================

      # Modern OTP 23+ canonical at distributed process-group register
      # per D-PHASE-8-PG-VS-GPROC-DISCRIMINATION 21st canonical.
      # Namespaced scope `DbgiSupervisor.PG` for substrate-coherence.
      %{
        id: DbgiSupervisor.PG,
        start: {:pg, :start_link, [DbgiSupervisor.PG]}
      },

      # Per-DMW process lookup canonical per ADR-0028 §3. `:unique` keys
      # for one-DMW-one-process addressing canonical.
      {Registry, keys: :unique, name: DbgiSupervisor.Registry},

      # Dynamic per-DMW process lifecycle canonical per ADR-0028 §3.
      # `:one_for_one` strategy at production-grade canonical register.
      {DynamicSupervisor, strategy: :one_for_one, name: DbgiSupervisor.DynamicSupervisor},

      # Sub-phase 9 expansion (multi-region cluster substrate)
      # ======================================================

      # libcluster topology supervisor canonical per ADR-0028 §3 +
      # ADR-0030 §DBGI canonical. Topology configurable via
      # `Application.get_env(:libcluster, :topologies)` per ADR-0018
      # deployment-agnostic canonical; empty topology default at
      # `config/config.exs` umbrella register; deployment-time override
      # at operator-deploy register.
      {Cluster.Supervisor,
       [
         Application.get_env(:libcluster, :topologies, []),
         [name: DbgiSupervisor.ClusterSupervisor]
       ]},

      # Phoenix.PubSub canonical at cross-node messaging register per
      # ADR-0028 §3 canonical. PG2 adapter substrate at pub/sub topic
      # routing register substantively COEXISTS with modern `:pg`
      # substrate (above) at distributed process-group register per
      # D-PHASE-9-PG2-VS-PG-COEXISTENCE 28th canonical — two distinct
      # registers, two distinct namespaces, no conflict.
      {Phoenix.PubSub, name: DbgiSupervisor.PubSub},

      # Phoenix.Tracker CRDT-backed presence canonical per ADR-0028 §3
      # "CRDT-backed state where the workload permits" canonical at
      # substrate-architectural register. Node-local pool + cluster
      # replication via heartbeat protocol + CRDT (eventually
      # consistent, conflict-free) per
      # D-PHASE-9-PHOENIX-TRACKER-ADR-0030-AMENDMENT-CANDIDATE 27th
      # canonical substrate-build observation candidate.
      {DbgiSupervisor.PresenceTracker,
       [
         name: DbgiSupervisor.PresenceTracker,
         pubsub_server: DbgiSupervisor.PubSub
       ]},

      # Sub-arc 1 sub-phase b Commit B.3 [BEAM-DBGI-HORDE-SUBSTRATE]
      # ===========================================================
      # Horde substrate per ADR-0039 §Decision Sub-decision 1: CRDT-based
      # distributed Registry + DynamicSupervisor with handoff on node
      # failure canonical at canonical-knowledge register substantively.
      # ENTERPRISE tier hive-scale per-DMW dispatch substrate at sub-phase
      # b register substantively. Existing single-node Registry +
      # DynamicSupervisor (above) preserved unchanged at backward-compat
      # register substantively for PERSONAL/AI_AGENT/DEVICE tier dispatch
      # at sub-phase a substrate per ADR-0038.
      {Horde.Registry, [name: DbgiSupervisor.HordeRegistry, keys: :unique]},
      {Horde.DynamicSupervisor,
       [
         name: DbgiSupervisor.HordeDynamicSupervisor,
         strategy: :one_for_one,
         distribution_strategy: Horde.UniformDistribution
       ]}
    ]

    # Sub-phase 11 [BEAM-OBSERVABILITY] expansion (telemetry + metrics
    # + Prometheus bridge) canonical at substantive register per
    # ADR-0030 §DBGI sub-phase 11 amendment canonical at substantive
    # register substantively. Disabled in test env via
    # :start_telemetry app env to avoid port binding canonical at
    # substantive register substantively.
    children =
      if Application.get_env(:dbgi_supervisor, :start_telemetry, true) do
        children ++ [{DbgiSupervisor.Telemetry, []}]
      else
        children
      end

    opts = [strategy: :one_for_one, name: DbgiSupervisor.Supervisor]
    Supervisor.start_link(children, opts)
  end
end
