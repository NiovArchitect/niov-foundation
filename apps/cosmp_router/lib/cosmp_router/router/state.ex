defmodule CosmpRouter.Router.State do
  @moduledoc """
  State struct for `CosmpRouter.Router` GenServer per ADR-0031 §Decision
  State shape.

  ## Fields

  - `name` — GenServer registered name; defaults `CosmpRouter.Router`
    in production; tests pass unique atom per ADR-0034 testability
    refactor pattern (sub-phase 6a [BEAM-COSMP-TESTABILITY-REFACTOR])
  - `storage_ets` — Storage.ETS instance name to thread through
    Storage facade calls; defaults `CosmpRouter.Storage.ETS` in
    production; tests pass unique atom per ADR-0034
  - `in_flight` — map tracking in-flight COSMP operations (op_id → metadata);
    populates as sub-phases 5b-ii / 6 add per-op tracking
  - `started_at` — monotonic time at GenServer init; observability signal
  - `storage` — module reference to the storage backend; rotated
    sub-phase 5b-iii Commit B.1 from `CosmpRouter.Storage.ETS`
    (5b-i hot-tier-only) to `CosmpRouter.Storage` (the facade per
    ADR-0033 §Decision 5; ETS-first read with Postgres source-of-
    truth fallthrough); module pointer abstraction supported the
    tier transition without Router-internal refactor

  ## Per ADR-0031 Q-D + ADR-0033 §Decision 6 (Idempotency layer)

  `idempotency_keys` table landed at sub-phase 5b-iii Commit A
  `[BEAM-COSMP-INTEROP-INTEGRATION-IDEMPOTENCY]` (Elixir-owned DDL
  boundary first instantiation per D-5BII-EXEC-5 hybrid Option β);
  Router consumer integration at sub-phase 5b-iii Commit B.1
  `[BEAM-COSMP-INTEROP-INTEGRATION-ROUTER]` per ADR-0026 §5 Pattern 5
  (idempotent verification keys) instantiated via
  `CosmpRouter.Idempotency.check/2` + `record/3` wrapping
  WRITE/SHARE/REVOKE.

  ## References

  - ADR-0031 (BEAM Routing Substrate Architecture) §Decision State shape
  - ADR-0032 (BEAM gRPC Interop Architecture) §Decision Connection
    management — storage abstraction supports sub-phase 5b-ii Postgres
    layering without Router code change
  - ADR-0026 (Dual-Control Middleware Pattern) §5 Pattern 5 (idempotent
    verification keys; deferred consumer)
  - ADR-0034 (BEAM COSMP Testability Refactor Pattern) §Decision 1+2
    (name-configurability + storage_ets opt threading)
  """

  @type t :: %__MODULE__{
          name: atom(),
          storage_ets: atom(),
          in_flight: map(),
          started_at: integer() | nil,
          storage: module()
        }

  defstruct name: CosmpRouter.Router,
            storage_ets: CosmpRouter.Storage.ETS,
            in_flight: %{},
            started_at: nil,
            storage: CosmpRouter.Storage
end
