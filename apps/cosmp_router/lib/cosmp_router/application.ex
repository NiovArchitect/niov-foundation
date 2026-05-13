defmodule CosmpRouter.Application do
  @moduledoc """
  OTP Application callback for the COSMP coordination layer.

  Establishes the supervision tree with `:one_for_one` strategy —
  production-grade default for COSMP routing where request flows
  are independent at billions-of-capsules-per-DMW scale. A single
  worker crash MUST NOT cascade to drop other in-flight COSMP
  operations.

  ## Sub-phase 5b-i status

  Children list contains 3 workers per ADR-0031 §Decision Supervision
  tree integration + ADR-0032 §Decision Connection management +
  ADR-0031 Q-T ETS-backed storage (sub-phase 5a authorization):

  1. `CosmpRouter.Storage.ETS` — ETS-backed capsule store (starts
     first; Router `init/1` depends on the named table; sub-phase
     5b-ii layers Postgres source-of-truth on top per ADR-0033
     forthcoming)
  2. `CosmpRouter.Router` — routing GenServer (sub-phase 4b)
  3. `GRPC.Server.Supervisor` — gRPC HTTP/2 listener via
     `CosmpRouter.GRPC.Endpoint` (sub-phase 5b-i; port configurable
     via `:cosmp_router, :grpc_port` app env; default 50051)

  ## References

  - ADR-0032 (BEAM gRPC Interop Architecture) §Decision Connection
    management
  - ADR-0031 (BEAM Routing Substrate Architecture) §Decision
    Supervision tree integration + Q-T ETS-backed state
  - ADR-0030 (Phase 2 Elixir/BEAM Implementation) §Decision sub-phase
    3 + 4b + 5b-i
  - https://hexdocs.pm/elixir/Application.html
  - https://hexdocs.pm/elixir/Supervisor.html
  """

  use Application

  @impl true
  def start(_type, _args) do
    grpc_port = Application.get_env(:cosmp_router, :grpc_port, 50_051)
    start_grpc = Application.get_env(:cosmp_router, :start_grpc_server, true)

    children =
      [
        # Sub-phase 5b-i: ETS-backed storage (starts first; canonical
        # named table per CosmpRouter.Storage.ETS module).
        {CosmpRouter.Storage.ETS, []},
        # Sub-phase 4b: COSMP routing GenServer.
        {CosmpRouter.Router, []}
      ] ++
        if start_grpc do
          [
            # Sub-phase 5b-i: gRPC HTTP/2 listener.
            {GRPC.Server.Supervisor,
             endpoint: CosmpRouter.GRPC.Endpoint, port: grpc_port, start_server: true}
          ]
        else
          []
        end

    opts = [strategy: :one_for_one, name: CosmpRouter.Supervisor]
    Supervisor.start_link(children, opts)
  end
end
