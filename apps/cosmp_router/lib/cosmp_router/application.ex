defmodule CosmpRouter.Application do
  @moduledoc """
  OTP Application callback for the COSMP coordination layer.

  Establishes the supervision tree with `:one_for_one` strategy —
  production-grade default for COSMP routing where request flows
  are independent at billions-of-capsules-per-DMW scale. A single
  worker crash MUST NOT cascade to drop other in-flight COSMP
  operations.

  ## Sub-phase 5b-ii status

  Children list contains 4 workers per ADR-0031 §Decision Supervision
  tree integration + ADR-0032 §Decision Connection management +
  ADR-0033 §Decision 5 (Storage facade) + 1 (Ecto.Repo):

  1. `CosmpRouter.Repo` — durable Postgres substrate (starts first;
     all downstream workers may depend on Repo connectivity per
     ADR-0033 §Decision 1 + §Decision 5 facade)
  2. `CosmpRouter.Storage.ETS` — ETS-backed hot-tier cache per
     ADR-0033 §Decision 5 Storage facade; preserved unchanged from
     sub-phase 5b-i; Router `init/1` depends on the named table
  3. `CosmpRouter.Router` — routing GenServer (sub-phase 4b)
  4. `GRPC.Server.Supervisor` — gRPC HTTP/2 listener via
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
        # Sub-phase 5b-ii [BEAM-COSMP-INTEROP-PERSISTENCE] per
        # ADR-0033 §Decision 1: Ecto.Repo starts first; all
        # downstream workers may depend on Repo connectivity for
        # Postgres source-of-truth + audit-chain participation.
        CosmpRouter.Repo,
        # Sub-phase 5b-i: ETS-backed hot-tier (canonical named
        # table per CosmpRouter.Storage.ETS module; reframed as
        # hot-tier per CosmpRouter.Storage facade per ADR-0033
        # §Decision 5).
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
