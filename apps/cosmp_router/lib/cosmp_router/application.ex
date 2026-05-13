defmodule CosmpRouter.Application do
  @moduledoc """
  OTP Application callback for the COSMP coordination layer.

  Establishes the supervision tree with `:one_for_one` strategy —
  production-grade default for COSMP routing where request flows
  are independent at billions-of-capsules-per-DMW scale. A single
  worker crash MUST NOT cascade to drop other in-flight COSMP
  operations.

  ## Sub-phase 4b status

  Children list contains the routing GenServer (`CosmpRouter.Router`)
  added at sub-phase 4b `[BEAM-COSMP-GENSERVER-CODE]` per ADR-0031
  §Decision. Sub-phase 5 `[BEAM-COSMP-INTEROP-CODE]` adds the gRPC bridge
  worker.

  ## References

  - ADR-0031 (BEAM Routing Substrate Architecture) §Decision Supervision tree integration
  - ADR-0030 (Phase 2 Elixir/BEAM Implementation) §Decision sub-phase 3 + 4b
  - https://hexdocs.pm/elixir/Application.html
  - https://hexdocs.pm/elixir/Supervisor.html
  """

  use Application

  @impl true
  def start(_type, _args) do
    children = [
      # Sub-phase 4b [BEAM-COSMP-GENSERVER-CODE]: COSMP routing GenServer.
      {CosmpRouter.Router, []}
      # Sub-phase 5 [BEAM-COSMP-INTEROP-CODE] adds the gRPC bridge worker here.
    ]

    opts = [strategy: :one_for_one, name: CosmpRouter.Supervisor]
    Supervisor.start_link(children, opts)
  end
end
