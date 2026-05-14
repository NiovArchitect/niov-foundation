defmodule DbgiSupervisor.Application do
  @moduledoc """
  OTP Application callback for the DBGI Supervisor layer.

  Establishes the supervision tree with `:one_for_one` strategy —
  production-grade default for distributed Capsule coordination where
  child failures must NOT cascade. Mirrors `CosmpRouter.Application`
  supervision strategy canonical at sub-phase 3 register.

  ## Sub-phase 8 status (this commit)

  Substantively expands children list per ADR-0028 §3 + ADR-0030 §DBGI
  canonical at substantive register:

  - **`:pg` OTP-native process group registry** — modern OTP 23+
    canonical; CRDT-based; cluster-aware by default ("strong eventual
    consistency" across nodes; partition-tolerant). Namespaced scope
    `DbgiSupervisor.PG` for substrate-coherence at canonical decision
    register. Per D-PHASE-8-PG-VS-GPROC-DISCRIMINATION 21st canonical
    substrate-build observation candidate: `:pg` alone canonical at
    modern OTP register; `:gproc` deferred to forward-queue at
    backward-compatibility register (sub-phase 11+ if substantively
    load-bearing surfaces).

  - **`Registry`** — Elixir canonical for per-key process lookup;
    `:unique` keys for one-DMW-one-process addressing canonical at
    ADR-0028 §3 register. Local-node-only; cluster coordination via
    `:pg` substrate (above) + libcluster + Phoenix.PubSub (sub-phase
    9 forward-queue).

  - **`DynamicSupervisor`** — canonical for spawning + monitoring
    per-DMW processes dynamically; `:one_for_one` strategy per
    ADR-0028 §3 canonical at substantive register.

  ## Forward-queue at sub-phases 9-10 per ADR-0030 §DBGI canonical

  - **Sub-phase 9** `[BEAM-DBGI-LIBCLUSTER]`: `libcluster` +
    `Phoenix.PubSub` + `Phoenix.Tracker` (CRDT-backed presence at
    multi-region cluster register per ADR-0028 §3 "CRDT-backed state
    where workload permits")
  - **Sub-phase 10** `[BEAM-DBGI-INTEGRATION-TESTS]`: process group
    join/leave + clustering formation + failover across nodes per
    ADR-0034 testability discipline canonical
  - **Sub-phase 11+ (forward-queued)**: `:gproc` canonical at
    backward-compatibility register if substantively load-bearing
    surfaces at substantive substrate-architectural register
    (D-PHASE-8-PG-VS-GPROC-DISCRIMINATION recursively applies)

  ## References

  - ADR-0028 §3 (BEAM Coordination Layer — names canonical patterns
    for DBGI substrate at substrate-architectural register)
  - ADR-0030 §DBGI Supervisor Layer (Phase 2 implementation sub-phases
    7-10)
  - ADR-0035 (Substrate-Build Discipline Canonical;
    D-PHASE-8-PG-VS-GPROC-DISCRIMINATION 21st observation candidate)
  - https://hexdocs.pm/elixir/Application.html
  - https://hexdocs.pm/elixir/Supervisor.html
  - https://www.erlang.org/doc/man/pg.html
  - https://hexdocs.pm/elixir/Registry.html
  - https://hexdocs.pm/elixir/DynamicSupervisor.html
  """

  use Application

  @impl true
  def start(_type, _args) do
    children = [
      # Modern OTP 23+ canonical at distributed process-group register
      # per D-PHASE-8-PG-VS-GPROC-DISCRIMINATION 21st canonical
      # substrate-build observation candidate. `:pg.start_link/1`
      # canonical pattern with namespaced scope (`DbgiSupervisor.PG`)
      # for substrate-coherence at canonical decision register.
      %{
        id: DbgiSupervisor.PG,
        start: {:pg, :start_link, [DbgiSupervisor.PG]}
      },

      # Per-DMW process lookup canonical at substantive register per
      # ADR-0028 §3 canonical. `:unique` keys for one-DMW-one-process
      # addressing at canonical-coherence register.
      {Registry, keys: :unique, name: DbgiSupervisor.Registry},

      # Dynamic per-DMW process lifecycle canonical at substantive
      # register per ADR-0028 §3 canonical. `:one_for_one` strategy at
      # production-grade canonical register.
      {DynamicSupervisor, strategy: :one_for_one, name: DbgiSupervisor.DynamicSupervisor}
    ]

    opts = [strategy: :one_for_one, name: DbgiSupervisor.Supervisor]
    Supervisor.start_link(children, opts)
  end
end
