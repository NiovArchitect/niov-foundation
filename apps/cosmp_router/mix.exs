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
      start_permanent: Mix.env() == :prod,
      deps: deps()
    ]
  end

  def application do
    [
      mod: {CosmpRouter.Application, []},
      extra_applications: [:logger]
    ]
  end

  # Sub-phase 5b-i [BEAM-COSMP-INTEROP-GRPC]: gRPC deps land per ADR-0032
  # §Decision gRPC library choice (Q-M). :ecto + :postgrex deferred to
  # sub-phase 5b-ii per Q-R (Persistence layer); :telemetry_metrics +
  # :telemetry_poller at sub-phase 11. Substrate-honest discipline: deps
  # land with their consumers per ADR-0016 Pin-and-Optimize Framework.
  defp deps do
    [
      # gRPC server + transport (canonical Elixir gRPC stack per Q-M)
      {:grpc, "~> 0.10"},
      {:protobuf, "~> 0.14"}
    ]
  end
end
