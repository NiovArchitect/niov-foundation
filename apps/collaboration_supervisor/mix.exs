defmodule CollaborationSupervisor.MixProject do
  use Mix.Project

  # FILE: mix.exs
  # PURPOSE: Umbrella app for the Collaboration Handoff Supervisor —
  #          the real BEAM-side complement to the Foundation TS wrapper
  #          at apps/api/src/services/coordination/
  #          beam-collaboration-supervisor.service.ts (Foundation #289).
  #          Exposes an HTTP boundary so the TS wrapper can observe per-
  #          collaboration supervised state when BEAM is enabled.
  #
  # NOT a policy authority. NOT an audit writer. NOT a connector
  # executor. Per ADR-0026 §5 Pattern 2 (supervisor-friendly failures)
  # and ADR-0034 (BEAM testability discipline).
  #
  # CONNECTS TO:
  #   apps/api/src/services/coordination/beam-collaboration-supervisor.service.ts
  #     (TS wrapper calls GET ${BEAM_RUNTIME_URL}/supervised-status/:id
  #     when BEAM_RUNTIME_ENABLED=true)
  #   docs/architecture/decisions/0028-forward-substrate-elixir-beam.md
  #     (§Forward Queue per-capsule supervised Elixir process — this
  #     app is one consumer of that framing for collaboration handoff)
  #   docs/architecture/decisions/0034-beam-cosmp-testability-refactor-pattern.md
  #     (testability discipline)

  def project do
    [
      app: :collaboration_supervisor,
      version: "0.1.0",
      build_path: "../../_build",
      config_path: "../../config/config.exs",
      deps_path: "../../deps",
      lockfile: "../../mix.lock",
      elixir: "~> 1.19",
      start_permanent: Mix.env() == :prod,
      elixirc_paths: elixirc_paths(Mix.env()),
      deps: deps()
    ]
  end

  def application do
    [
      extra_applications: [:logger],
      mod: {CollaborationSupervisor.Application, []}
    ]
  end

  defp elixirc_paths(:test), do: ["lib", "test/support"]
  defp elixirc_paths(_), do: ["lib"]

  defp deps do
    [
      {:plug, "~> 1.16"},
      {:plug_cowboy, "~> 2.7"},
      {:jason, "~> 1.4"}
    ]
  end
end
