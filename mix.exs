defmodule NiovFoundationBeam.MixProject do
  use Mix.Project

  # FILE: mix.exs
  # PURPOSE: Umbrella project root for the Elixir/BEAM substrate per ADR-0030
  #          (Phase 2 Elixir/BEAM Implementation). Elixir apps live under
  #          apps/ alongside the existing apps/api/ (Fastify+TypeScript;
  #          NOT a mix application).
  # CONNECTS TO:
  #   docs/architecture/decisions/0030-phase-2-elixir-beam-implementation.md
  #     (§Implementation Detail mix umbrella workspace structure).
  #   .tool-versions (Elixir + Erlang/OTP pin authority per ADR-0016
  #     Pin-and-Optimize Framework).
  #   apps/README.md (umbrella + apps/api/ coexistence discipline).
  # WHY: Q-COEXISTENCE Option X — explicitly enumerate Elixir apps via
  #      apps_paths/0; non-Elixir directories under apps/ (apps/api/) are
  #      invisible to mix tooling. This preserves the apps/ canonical
  #      layout ADR-0030 §Implementation Detail names while avoiding mix
  #      tooling errors against apps/api/'s Node/TypeScript substrate.

  def project do
    [
      apps_path: "apps",
      apps_paths: apps_paths(),
      version: "0.1.0",
      start_permanent: Mix.env() == :prod,
      deps: deps()
    ]
  end

  # Explicit Elixir-app enumeration (Q-COEXISTENCE Option X). Sub-phase
  # 3 [BEAM-COSMP-APP-SKELETON] added cosmp_router; sub-phase 7
  # [BEAM-DBGI-APP-SKELETON] adds dbgi_supervisor per ADR-0030 §DBGI
  # Supervisor Layer canonical at substrate-architectural register.
  # Non-Elixir apps (apps/api/ Fastify+TypeScript) remain invisible to
  # mix tooling. The map shape is %{app_name => path} per mix's
  # apps_paths convention.
  defp apps_paths do
    %{
      cosmp_router: "apps/cosmp_router",
      dbgi_supervisor: "apps/dbgi_supervisor",
      collaboration_supervisor: "apps/collaboration_supervisor"
    }
  end

  # Umbrella roots have no top-level deps initially; apps inherit their
  # own deps via their per-app mix.exs files (added at sub-phases 3+).
  defp deps do
    []
  end
end
