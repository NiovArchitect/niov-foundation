defmodule CosmpRouter.Router.State do
  @moduledoc """
  State struct for `CosmpRouter.Router` GenServer per ADR-0031 §Decision
  State shape.

  ## Fields

  - `in_flight` — map tracking in-flight COSMP operations (op_id → metadata);
    populates as sub-phases 5b-ii / 6 add per-op tracking
  - `started_at` — monotonic time at GenServer init; observability signal
  - `storage` — module reference to the storage backend (default
    `CosmpRouter.Storage.ETS`; sub-phase 5b-ii layers Postgres on top
    per ADR-0033 forthcoming; module pointer abstraction supports
    future tier transition without Router-internal refactor)

  ## Deferred per ADR-0031 Q-D + ADR-0033 (forthcoming)

  `idempotency_table` lands at sub-phase 5b-ii / 6 with the
  idempotency strategy decision (ETS hot-tier + Postgres durable
  layer per ADR-0026 §5 Pattern 5 instantiation).

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
