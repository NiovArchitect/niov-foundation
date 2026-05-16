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
      # Sub-phase 11 [BEAM-OBSERVABILITY]: :telemetry + :logger_json
      # apps started canonical at substantive register per ADR-0030
      # §DBGI sub-phase 11 amendment canonical.
      extra_applications: [:logger, :telemetry, :logger_json],
      mod: {DbgiSupervisor.Application, []}
    ]
  end

  # Sub-phase 6a [BEAM-COSMP-TESTABILITY-REFACTOR] canonical at
  # cosmp_router register (per ADR-0034): test/support included only in
  # :test env so future test helpers compile only when needed.
  defp elixirc_paths(:test), do: ["lib", "test/support"]
  defp elixirc_paths(_), do: ["lib"]

  # Sub-phase 8 [BEAM-DBGI-PROCESS-GROUPS]: `:pg` OTP-native (no Hex dep)
  # canonical at modern OTP 23+ register per D-PHASE-8-PG-VS-GPROC-
  # DISCRIMINATION 21st canonical substrate-build observation; `:gproc`
  # deferred to forward-queue at sub-phase 11+ at backward-compatibility
  # register if substantively load-bearing surfaces.
  # Sub-phase 9 [BEAM-DBGI-LIBCLUSTER]: `:libcluster` + `:phoenix_pubsub`
  # per ADR-0028 §3 + ADR-0030 §DBGI canonical.
  # Sub-phase 11 [BEAM-OBSERVABILITY] (this commit): `:telemetry_metrics`
  # + `:telemetry_poller` + `:telemetry_metrics_prometheus` + `:logger_json`
  # per ADR-0030 §DBGI sub-phase 11 canonical at substantive register
  # (telemetry + Prometheus bridge + structured JSON logging substrate
  # canonical at substantive register substantively per Q1/Q2/Q5 LOCKED
  # operator-tier authorization at canonical decision register).
  defp deps do
    [
      {:libcluster, "~> 3.5"},
      {:phoenix_pubsub, "~> 2.2"},
      # Sub-phase 11 observability substrate canonical at substantive
      # register substantively per ADR-0030 §DBGI sub-phase 11
      # amendment canonical at substantive register:
      {:telemetry_metrics, "~> 1.1"},
      {:telemetry_poller, "~> 1.3"},
      {:telemetry_metrics_prometheus, "~> 1.1"},
      {:logger_json, "~> 7.0"},
      # Sub-arc 1 sub-phase b Commit B.3 [BEAM-DBGI-HORDE-SUBSTRATE] per
      # ADR-0039 §Decision Sub-decision 1: Horde Registry + Horde
      # DynamicSupervisor for distributed cluster substrate at canonical-
      # knowledge register substantively. CRDT-based distributed registry
      # + handoff on node failure canonical at hive-scale dispatch
      # register substantively per ADR-0039.
      {:horde, "~> 0.9"}
    ]
  end
end
