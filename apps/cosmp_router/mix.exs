defmodule CosmpRouter.MixProject do
  use Mix.Project

  # FILE: apps/cosmp_router/mix.exs
  # PURPOSE: Child app project config for the COSMP coordination layer
  #          (Foundation Phase 2 per ADR-0030). Umbrella-aware — build
  #          artifacts + deps + config + lockfile all live at umbrella
  #          root, not per-app.
  # PATENT-CANONICAL ROLE: COSMP routing for the 7 patent-defined
  #          operations (AUTHENTICATE, NEGOTIATE, READ, WRITE, SHARE,
  #          REVOKE, AUDIT) per US 12,517,919. Scale register: billions
  #          of capsules per DMW; cross-DMW collaboration; production
  #          live-grade coherence.
  # CONNECTS TO:
  #   docs/architecture/decisions/0030-phase-2-elixir-beam-implementation.md
  #     (§Decision sub-phase 3: apps/cosmp_router/ OTP application).
  #   lib/cosmp_router/application.ex (OTP Application callback; sub-phase 3).
  #   lib/cosmp_router/router.ex (COSMP GenServer; sub-phase 4).
  # WHY: Sub-phase 3 [BEAM-COSMP-APP-SKELETON] establishes the OTP
  #      application skeleton; sub-phases 4-6 fill it with the routing
  #      GenServer + Fastify↔Elixir gRPC bridge + integration tests.

  def project do
    [
      app: :cosmp_router,
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

  # Sub-phase 6a [BEAM-COSMP-TESTABILITY-REFACTOR] per ADR-0034:
  # compile test/support/ helpers only in :test env (canonical Elixir
  # pattern; KV.Registry Mix-OTP tutorial + DockYard "Understanding
  # Test Concurrency in Elixir").
  defp elixirc_paths(:test), do: ["lib", "test/support"]
  defp elixirc_paths(_), do: ["lib"]

  def application do
    [
      mod: {CosmpRouter.Application, []},
      # Sub-phase 11 [BEAM-OBSERVABILITY]: :telemetry + :logger_json
      # apps started canonical at substantive register per
      # ADR-0030 §DBGI sub-phase 11 amendment canonical.
      # Sub-arc 1 sub-phase b Commit B.6.3 [BEAM-COSMP-HIVE-DISPATCH-INTEGRATION]:
      # :dbgi_supervisor added at extra_applications register per ADR-0039
      # Sub-decision 3 Option ζ Adapter Pattern canonical at canonical-
      # knowledge register substantively (cosmp_router dispatches through
      # DbgiSupervisor.start_dmw_worker_horde/2 + Horde.Registry at runtime
      # register substantively; module must be loaded at code path register
      # AND application must be started for DbgiSupervisor.HordeRegistry +
      # DMWWorker supervision tree to be available at test register).
      extra_applications: [:logger, :telemetry, :logger_json, :dbgi_supervisor]
    ]
  end

  # Dep landing lineage:
  # - Sub-phase 5b-i [BEAM-COSMP-INTEROP-GRPC]: :grpc + :protobuf per
  #   ADR-0032 §Decision Q-M (gRPC interop substrate)
  # - Sub-phase 5b-ii [BEAM-COSMP-INTEROP-PERSISTENCE]: :ecto_sql +
  #   :postgrex per ADR-0033 §Decision Q-PERSISTENCE-DEPS (durable
  #   persistence + audit-chain + idempotency substrate)
  # - Sub-phase 11 [BEAM-OBSERVABILITY] (this commit): :telemetry_metrics
  #   + :telemetry_poller + :telemetry_metrics_prometheus + :logger_json
  #   per ADR-0030 §DBGI sub-phase 11 canonical at substantive register
  #   (telemetry + Prometheus bridge + structured JSON logging
  #   substrate at canonical register substantively).
  # Substrate-honest discipline: deps land with their consumers per
  # ADR-0016 Pin-and-Optimize Framework.
  defp deps do
    [
      # gRPC server + transport (canonical Elixir gRPC stack per
      # ADR-0032 §Decision Q-M)
      {:grpc, "~> 0.10"},
      {:protobuf, "~> 0.14"},
      # Persistence + audit-chain + idempotency substrate (canonical
      # Elixir Postgres stack per ADR-0033 §Decision Q-PERSISTENCE-DEPS)
      {:ecto_sql, "~> 3.13"},
      {:postgrex, "~> 0.20"},
      # Sub-phase 11 observability substrate canonical (ADR-0030 §DBGI
      # sub-phase 11 + Q1/Q2/Q5 LOCKED operator-tier authorization
      # canonical at substantive register substantively):
      # - :telemetry_metrics (1.x BEAM Community canonical metrics-
      #   definition layer)
      # - :telemetry_poller (1.x BEAM Community canonical VM stats
      #   periodic poll layer)
      # - :telemetry_metrics_prometheus (1.x BEAM Community canonical
      #   Prometheus bridge per Q-A LOCKED + verification gate
      #   canonical at substantive register; staleness 4-year per
      #   D-PHASE-11-PROMETHEUS-BRIDGE-STALENESS substrate-build
      #   observation candidate forward-queued at substantive register)
      # - :logger_json (7.x SIEM-friendly JSON Logger formatter per
      #   Q5 LOCKED + compatibility gate PASSED canonical at
      #   substantive register; analogous to TS pino canonical at
      #   STRUCTURED_LOGGING_SCHEMA.md substantive register)
      {:telemetry_metrics, "~> 1.1"},
      {:telemetry_poller, "~> 1.3"},
      {:telemetry_metrics_prometheus, "~> 1.1"},
      {:logger_json, "~> 7.0"}
    ]
  end
end
