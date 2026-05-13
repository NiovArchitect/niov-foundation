defmodule CosmpRouter.Application do
  @moduledoc """
  OTP Application callback for the COSMP coordination layer.

  Establishes the supervision tree with `:one_for_one` strategy —
  production-grade default for COSMP routing where request flows
  are independent at billions-of-capsules-per-DMW scale. A single
  worker crash MUST NOT cascade to drop other in-flight COSMP
  operations.

  ## Sub-phase 3 status

  Empty children list. Sub-phase 4 `[BEAM-COSMP-GENSERVER]` adds
  the first child (the routing GenServer); sub-phase 5
  `[BEAM-COSMP-INTEROP]` adds the gRPC bridge worker.

  ## References

  - ADR-0030 (Phase 2 Elixir/BEAM Implementation) §Decision sub-phase 3
  - https://hexdocs.pm/elixir/Application.html
  - https://hexdocs.pm/elixir/Supervisor.html
  """

  use Application

  @impl true
  def start(_type, _args) do
    children = [
      # Sub-phase 4 adds the routing GenServer here.
      # Sub-phase 5 adds the gRPC bridge worker here.
    ]

    opts = [strategy: :one_for_one, name: CosmpRouter.Supervisor]
    Supervisor.start_link(children, opts)
  end
end
