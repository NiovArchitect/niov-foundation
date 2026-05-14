defmodule DbgiSupervisor.MixProject do
  use Mix.Project

  # FILE: apps/dbgi_supervisor/mix.exs
  # PURPOSE: Child app project config for the DBGI (Database Gateway
  #          Intelligence) Supervisor layer per ADR-0030 §DBGI
  #          Supervisor Layer canonical. Umbrella-aware — build
  #          artifacts + deps + config + lockfile all live at umbrella
  #          root, not per-app.
  # SUBSTRATE-ARCHITECTURAL ROLE: Supervised process groups for
  #          distributed Capsule coordination per ADR-0028 §3 canonical
  #          (BEAM Coordination Layer). Sub-phase 7 lands the OTP app
  #          skeleton; substantive DBGI substrate forward-queued to
  #          sub-phases 8-10 per ADR-0030 §DBGI canonical at
  #          substrate-architectural register.
  # CONNECTS TO:
  #   docs/architecture/decisions/0030-phase-2-elixir-beam-implementation.md
  #     (§DBGI Supervisor Layer sub-phases 7-10).
  #   docs/architecture/decisions/0028-beam-coordination-layer.md §3
  #     (canonical patterns: Registry + DynamicSupervisor + :pg + :gproc
  #     + libcluster + Phoenix.PubSub + GenStage + CRDT-backed state).
  #   lib/dbgi_supervisor/application.ex (OTP Application callback;
  #     sub-phase 7).
  # WHY: Sub-phase 7 `[BEAM-DBGI-APP-SKELETON]` establishes the OTP
  #      application skeleton per cosmp_router sibling pattern canonical
  #      at sub-phase 3; sub-phases 8-10 fill it with process-group
  #      registry + multi-region clustering + integration tests.

  def project do
    [
      app: :dbgi_supervisor,
      version: "0.1.0",
      build_path: "../../_build",
      config_path: "../../config/config.exs",
      deps_path: "../../deps",
      lockfile: "../../mix.lock",
      elixir: "~> 1.19",
      elixirc_paths: elixirc_paths(Mix.env()),
      start_permanent: Mix.env() == :prod,
      deps: deps()
    ]
  end

  def application do
    [
      extra_applications: [:logger],
      mod: {DbgiSupervisor.Application, []}
    ]
  end

  # Sub-phase 6a [BEAM-COSMP-TESTABILITY-REFACTOR] canonical at
  # cosmp_router register (per ADR-0034): test/support included only in
  # :test env so future test helpers compile only when needed.
  defp elixirc_paths(:test), do: ["lib", "test/support"]
  defp elixirc_paths(_), do: ["lib"]

  # Sub-phase 7 dep landing scope: empty (mechanical OTP app skeleton).
  # Forward-queued deps per ADR-0030 §DBGI Supervisor Layer canonical:
  # - Sub-phase 8 `[BEAM-DBGI-PROCESS-GROUPS]`: `:pg` (OTP-native; no
  #   Hex dep) + `:gproc` (Hex dep for richer registry semantics) per
  #   ADR-0028 §3 + ADR-0030 §DBGI canonical
  # - Sub-phase 9 `[BEAM-DBGI-LIBCLUSTER]`: `:libcluster` + `:phoenix_pubsub`
  #   per ADR-0028 §3 + ADR-0030 §DBGI canonical
  defp deps do
    []
  end
end
