defmodule CosmpRouterTest do
  @moduledoc """
  Sub-phase 3 `[BEAM-COSMP-APP-SKELETON]` smoke test, evolved through
  sub-phase 5b-i `[BEAM-COSMP-INTEROP-GRPC]`.

  Establishes the test pattern sub-phases 4-10 inherit:

  - App starts cleanly
  - Supervisor process alive + named correctly
  - Supervision tree introspectable

  ## Sub-phase 5b-i update — landed

  Per ADR-0031 Q-T (ETS-backed in-memory state) + ADR-0032 §Decision
  Connection management, the supervision tree at sub-phase 5b-i
  carries:

  - `CosmpRouter.Storage.ETS` — ETS-backed capsule store (sub-phase
    5b-i; hot-tier cache)
  - `CosmpRouter.Router` — routing GenServer (sub-phase 4b)
  - `GRPC.Server.Supervisor` — gRPC HTTP/2 listener (sub-phase 5b-i;
    DISABLED in test env per `config/test.exs` `start_grpc_server:
    false` — avoids port-binding conflict in CI)

  Test-env supervision tree therefore has **2 children** (Storage +
  Router); prod/dev have **3 children** (+ gRPC listener). Sub-phase
  6 `[BEAM-COSMP-INTEGRATION-TESTS]` adds end-to-end tests that may
  start the gRPC server explicitly.
  """

  use ExUnit.Case, async: true

  test "CosmpRouter.Supervisor is alive after app start" do
    # The Application starts as part of the :cosmp_router app boot;
    # if reach this test, the Application callback returned :ok.
    assert is_pid(Process.whereis(CosmpRouter.Supervisor))
  end

  test "supervision tree is introspectable" do
    children = Supervisor.which_children(CosmpRouter.Supervisor)
    # Sub-arc 1 sub-phase b test env: 4 children (Repo + Storage.ETS +
    # WalletCache + Router; gRPC server disabled per config/test.exs).
    # Prod/dev env: 5 children (+ GRPC.Server.Supervisor).
    # Sub-phase 5b-ii [BEAM-COSMP-INTEROP-PERSISTENCE]: Repo added per
    # ADR-0033 §Decision 1 + §Decision 5 (Storage facade requires
    # Postgres source-of-truth Repo connectivity).
    # Sub-arc 1 sub-phase b Commit B.5 [BEAM-DBGI-WALLET-CACHE-ETS]:
    # CosmpRouter.WalletCache added per ADR-0039 Sub-decision 5 (ETS
    # read-optimized wallet_type cache; cache miss delegates to
    # CosmpRouter.WalletLookup per B.4 substrate).
    assert is_list(children)
    assert length(children) == 4

    child_modules =
      Enum.map(children, fn {id, _pid, _type, _modules} -> id end)

    assert CosmpRouter.Repo in child_modules
    assert CosmpRouter.Storage.ETS in child_modules
    assert CosmpRouter.WalletCache in child_modules
    assert CosmpRouter.Router in child_modules
  end
end
