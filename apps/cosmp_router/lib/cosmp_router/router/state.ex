defmodule CosmpRouter.Router.State do
  @moduledoc """
  State struct for `CosmpRouter.Router` GenServer per ADR-0031 §Decision
  State shape.

  ## Fields

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
  """

  @type t :: %__MODULE__{
          in_flight: map(),
          started_at: integer() | nil,
          storage: module()
        }

  defstruct in_flight: %{}, started_at: nil, storage: CosmpRouter.Storage.ETS
end
