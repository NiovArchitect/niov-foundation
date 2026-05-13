defmodule CosmpRouter.Router.State do
  @moduledoc """
  State struct for `CosmpRouter.Router` GenServer per ADR-0031 §Decision
  State shape.

  ## Fields

  - `in_flight` — map tracking in-flight COSMP operations (op_id → metadata);
    populates as sub-phases 5-6 add per-op tracking
  - `started_at` — monotonic time at GenServer init; observability signal

  ## Deferred per ADR-0031 Q-D

  `idempotency_table` lands at sub-phase 5/6 with the idempotency strategy
  decision (ETS-backed or Postgres-backed; potential ADR-0032 territory if
  non-obvious architectural choices arise per ADR-0026 §5 Pattern 5).

  ## References

  - ADR-0031 (BEAM Routing Substrate Architecture) §Decision State shape
  - ADR-0026 (Dual-Control Middleware Pattern) §5 Pattern 5 (idempotent verification keys; deferred consumer)
  """

  @type t :: %__MODULE__{
          in_flight: map(),
          started_at: integer() | nil
        }

  defstruct in_flight: %{}, started_at: nil
end
