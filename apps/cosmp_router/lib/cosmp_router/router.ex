defmodule CosmpRouter.Router do
  @moduledoc """
  COSMP routing GenServer wrapper per ADR-0039 §Decision Sub-decision 2.

  ## Patent-canonical role

  Single-node singleton dispatch path for the 7 COSMP operations per
  US 12,517,919. Each `handle_call/3` clause delegates to
  `CosmpRouter.Operations` pure-module primitives at single-source-of-
  truth register; the GenServer wrapper provides `{:reply, value,
  state}` envelope semantics plus `:telemetry.span/3` instrumentation
  per sub-phase 11 observability substrate.

  ## ADR-0039 §Decision Sub-decision 2 — pure-module refactor

  The 7 op handle_call clauses substantively delegate to
  `CosmpRouter.Operations.OP(req, state)` at module-level register.
  State management at GenServer level unchanged. Public API
  (`GenServer.call/3` 7-op surface) unchanged. The 137-test
  cosmp_router baseline preserves by construction because Operations
  invokes the same composed-mode helpers + Storage facade + Audit
  chain + Idempotency substrate that previously lived inline at
  handle_call clauses.

  Wrapper stays canonical at backward-compat register for non-ENTERPRISE
  tier dispatch at sub-phase b register per ADR-0039 §Decision Sub-
  decision 7 (PERSONAL/AI_AGENT/DEVICE through `CosmpRouter.Router`
  unchanged).

  ## ADR-0026 §5 BEAM patterns instantiated

  - **Pattern 1 (message-passing semantics over shared state)** —
    `GenServer.call/3` 7-op dispatch
  - **Pattern 2 (supervisor-friendly failure modes)** — typed
    `{:reply, {:ok, _} | {:error, %CosmpError{}}, state}` return shape
  - **Pattern 3 (state reconstructible from durable storage)** —
    `CosmpRouter.Storage` facade routes ETS hot-tier reads to
    Postgres source-of-truth on miss; per ADR-0033 §Decision 5
  - **Pattern 4 (event-sourced audit semantics)** — composed-mode
    `Audit.write_audit_event/3` via `Ecto.Multi` for WRITE/SHARE/
    REVOKE; standalone `Audit.write_audit_event/1` for READ/AUDIT/
    AUTHENTICATE/NEGOTIATE; per ADR-0033 §Decision 4e
  - **Pattern 5 (idempotent verification keys)** — `Idempotency.check/2`
    + `Idempotency.record/3` wrap WRITE/SHARE/REVOKE per ADR-0033
    §Decision 6
  - **Pattern 6 (pure transformation over imperative control)** —
    `CosmpRouter.Operations` pure-module primitives orchestrate
    composed-mode primitives; side effects bounded by Multi transactions

  ## References

  - ADR-0039 §Decision Sub-decision 2 (pure-module refactor) +
    Sub-decision 7 (tier-routed dispatch backward-compat)
  - ADR-0033 §Decision 4e (composed-mode audit) + §Decision 5
    (Storage facade) + §Decision 6 (Idempotency layer)
  - ADR-0032 (BEAM gRPC Interop Architecture) §Decision
  - ADR-0031 (BEAM Routing Substrate Architecture) §Decision
  - ADR-0026 §5 — 6 BEAM-compatibility patterns (full set instantiated)
  - US 12,517,919 (COSMP Protocol patent)
  """

  use GenServer

  alias CosmpRouter.Router.State
  alias CosmpRouter.Storage

  @doc """
  Start the COSMP routing GenServer. Registered under the
  `CosmpRouter.Router` name in production (default); tests pass
  `:name` + `:storage_ets` opts for per-test instances per ADR-0034
  testability-refactor pattern (sub-phase 6a).

  ## Options

  - `:name` — registered atom name; defaults `__MODULE__` (production
    singleton)
  - `:storage_ets` — Storage.ETS instance atom for facade threading;
    defaults `CosmpRouter.Storage.ETS` (production singleton)
  """
  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(opts \\ []) do
    name = Keyword.get(opts, :name, __MODULE__)
    GenServer.start_link(__MODULE__, opts, name: name)
  end

  @impl true
  @spec init(keyword()) :: {:ok, State.t()}
  def init(opts) do
    name = Keyword.get(opts, :name, __MODULE__)
    storage_ets = Keyword.get(opts, :storage_ets, CosmpRouter.Storage.ETS)

    state = %State{
      name: name,
      storage_ets: storage_ets,
      in_flight: %{},
      started_at: System.monotonic_time(),
      storage: Storage
    }

    {:ok, state}
  end

  # ============================================================================
  # 7 COSMP ops per US 12,517,919 — each handle_call delegates to
  # CosmpRouter.Operations pure-module primitives per ADR-0039
  # Sub-decision 2. Telemetry instrumentation per sub-phase 11.
  # ============================================================================

  @impl true
  def handle_call({:authenticate, req}, _from, state) do
    reply = instrument_op(:authenticate, fn -> CosmpRouter.Operations.authenticate(req, state) end)
    {:reply, reply, state}
  end

  def handle_call({:negotiate, req}, _from, state) do
    reply = instrument_op(:negotiate, fn -> CosmpRouter.Operations.negotiate(req, state) end)
    {:reply, reply, state}
  end

  def handle_call({:read, req}, _from, state) do
    reply = instrument_op(:read, fn -> CosmpRouter.Operations.read(req, state) end)
    {:reply, reply, state}
  end

  def handle_call({:write, req}, _from, state) do
    reply = instrument_op(:write, fn -> CosmpRouter.Operations.write(req, state) end)
    {:reply, reply, state}
  end

  def handle_call({:share, req}, _from, state) do
    reply = instrument_op(:share, fn -> CosmpRouter.Operations.share(req, state) end)
    {:reply, reply, state}
  end

  def handle_call({:revoke, req}, _from, state) do
    reply = instrument_op(:revoke, fn -> CosmpRouter.Operations.revoke(req, state) end)
    {:reply, reply, state}
  end

  def handle_call({:audit, req}, _from, state) do
    reply = instrument_op(:audit, fn -> CosmpRouter.Operations.audit(req, state) end)
    {:reply, reply, state}
  end

  # ============================================================================
  # Sub-phase 11 [BEAM-OBSERVABILITY] instrumentation helper
  # ============================================================================
  #
  # WHAT: Wraps a CosmpRouter.Operations call with `:telemetry.span/3`
  #       canonical at substantive register; emits :start + :stop
  #       events with op_name + status_class metadata canonical.
  # INPUT: op_name (atom; one of :authenticate / :negotiate / :read /
  #        :write / :share / :revoke / :audit — public per patent
  #        US 12,517,919); fun (zero-arity returning {:ok, _} | {:error, _}).
  # OUTPUT: {:ok, _} | {:error, _} (passes through fun result).
  # WHY: Per ADR-0030 §DBGI sub-phase 11 amendment + Q4 LOCKED canonical
  #      at substantive register substantively per D-PHASE-11-NO-IDENTITY-
  #      LABEL-DISCIPLINE substrate-build observation candidate at
  #      substantive register. Event metadata constrained to op_name +
  #      status_class (low-cardinality + non-identity-bearing); NO
  #      capsule_id, entity_id, principal_id, or other identity-bearing
  #      fields at canonical register substantively at substantive
  #      register.
  defp instrument_op(op_name, fun) when is_atom(op_name) and is_function(fun, 0) do
    :telemetry.span(
      [:cosmp_router, :op],
      %{op_name: op_name},
      fn ->
        result = fun.()
        status_class = classify_reply(result)
        {result, %{op_name: op_name, status_class: status_class}}
      end
    )
  end

  defp classify_reply({:ok, _}), do: :ok
  defp classify_reply({:error, _}), do: :error
  defp classify_reply(_), do: :unknown
end
