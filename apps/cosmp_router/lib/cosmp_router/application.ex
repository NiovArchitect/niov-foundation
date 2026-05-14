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

  ## Sub-phase 6a testability discipline per ADR-0034

  Production supervision tree uses default `__MODULE__` names for the
  Storage.ETS + Router singletons (no children-list spec change at
  this register since `Storage.ETS.start_link/1` + `Router.start_link/1`
  default `:name` opts to `__MODULE__`). Tests bypass this supervision
  tree entirely — they spawn per-test Storage.ETS + Router instances
  with unique atoms via `start_supervised!` per
  `CosmpRouter.RouterTestHelpers.start_router!/1` (sub-phase 6a
  `[BEAM-COSMP-TESTABILITY-REFACTOR]` per ADR-0034 testability-
  refactor pattern; D-WIDER-KNOWLEDGE-CHECK substrate-build discipline
  canonical at the architectural register).

  ## References

  - ADR-0032 (BEAM gRPC Interop Architecture) §Decision Connection
    management
  - ADR-0031 (BEAM Routing Substrate Architecture) §Decision
    Supervision tree integration + Q-T ETS-backed state
  - ADR-0030 (Phase 2 Elixir/BEAM Implementation) §Decision sub-phase
    3 + 4b + 5b-i
  - ADR-0034 (BEAM COSMP Testability Refactor Pattern) §Decision
    sub-phase 6a name-configurability + Sub-decision 1-5
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
