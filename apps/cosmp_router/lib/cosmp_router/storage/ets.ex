defmodule CosmpRouter.Storage.ETS do
  @moduledoc """
  ETS-backed in-memory capsule store per ADR-0031 Q-T (sub-phase 5a
  authorization).

  ## Substrate-state register

  Sub-phase 5b-i: introduced as the primary capsule store. Capsule
  data lived in this ETS table; lookups + writes O(1); concurrent
  reads lock-free via ETS `:read_concurrency`.

  Sub-phase 5b-ii (per ADR-0033 §Decision 5; landed at this commit):
  reframed as **hot-tier cache** behind the `CosmpRouter.Storage`
  facade. Postgres source-of-truth lives at
  `CosmpRouter.Storage.Postgres`; ETS sits in front for sub-millisecond
  reads. Cache invalidation + reconciliation orchestrated by the
  facade per ADR-0026 §5 Pattern 3 instantiation. This module's API
  stays stable; callers should prefer `CosmpRouter.Storage` (the
  facade) over direct `Storage.ETS` calls.

  ## Patent-implementation evidence register (ADR-0020 Register 2)

  Capsules stored here are the canonical 7-layer structure per
  US 12,517,919; field ordering preserved via `CosmpRouter.Capsule`
  struct (which mirrors the patent ordering verbatim per ADR-0031
  Q-J).

  ## Supervision

  Started under `CosmpRouter.Supervisor` per ADR-0030 + ADR-0031
  Application children list. `:one_for_one` strategy isolates this
  store's crash from Router + gRPC server.

  ## Public API

  - `put(capsule_id, capsule)` — store/overwrite a capsule
  - `get(capsule_id)` — retrieve a capsule (or `{:error, :not_found}`)
  - `delete(capsule_id)` — remove a capsule
  - `list()` — enumerate all stored capsule_ids (debug/test only;
    sub-phase 11+ observability uses telemetry events)
  - `clear()` — flush table (test-only; debug)

  ## References

  - ADR-0031 (BEAM Routing Substrate Architecture) §Decision Q-T
    in-memory state strategy (sub-phase 5a authorization)
  - ADR-0026 (Dual-Control Middleware Pattern) §5 Pattern 3
    (state reconstructible from durable storage; instantiated at
    sub-phase 5b-ii via the `CosmpRouter.Storage` facade reading
    Postgres on ETS cache miss)
  - ADR-0033 (BEAM Persistence + Idempotency + Audit-Chain
    Cryptographic Substrate Architecture; landed at sub-phase 5b-ii)
    §Decision 5 (Storage facade)
  """

  use GenServer

  alias CosmpRouter.Capsule

  @table :cosmp_router_capsules

  # ---- Public API ----

  @doc """
  Start the ETS-backed storage GenServer. Registered as
  `CosmpRouter.Storage.ETS` for `Process.whereis/1` lookup.
  """
  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @doc """
  Store or overwrite a capsule by `capsule_id`. Returns `:ok` on
  success.
  """
  @spec put(String.t(), Capsule.t()) :: :ok
  def put(capsule_id, %Capsule{} = capsule) when is_binary(capsule_id) do
    :ets.insert(@table, {capsule_id, capsule})
    :ok
  end

  @doc """
  Retrieve a capsule by `capsule_id`. Returns `{:ok, capsule}` or
  `{:error, :not_found}`.
  """
  @spec get(String.t()) :: {:ok, Capsule.t()} | {:error, :not_found}
  def get(capsule_id) when is_binary(capsule_id) do
    case :ets.lookup(@table, capsule_id) do
      [{^capsule_id, capsule}] -> {:ok, capsule}
      [] -> {:error, :not_found}
    end
  end

  @doc """
  Remove a capsule by `capsule_id`. Returns `:ok` regardless of
  whether the capsule existed (idempotent).
  """
  @spec delete(String.t()) :: :ok
  def delete(capsule_id) when is_binary(capsule_id) do
    :ets.delete(@table, capsule_id)
    :ok
  end

  @doc """
  List all stored capsule_ids. Debug/test only; sub-phase 11+
  observability uses telemetry events instead.
  """
  @spec list() :: [String.t()]
  def list do
    :ets.tab2list(@table)
    |> Enum.map(fn {capsule_id, _capsule} -> capsule_id end)
  end

  @doc """
  Flush all stored capsules. Test-only.
  """
  @spec clear() :: :ok
  def clear do
    :ets.delete_all_objects(@table)
    :ok
  end

  # ---- GenServer callbacks ----

  @impl true
  def init(_opts) do
    # Named, public, read-concurrent ETS table. Owner is this GenServer;
    # table survives until owner crashes (at which point supervisor
    # restart per :one_for_one strategy creates a fresh table — ETS
    # data is hot-tier ephemeral; Postgres reconciliation via the
    # `CosmpRouter.Storage` facade at next read per ADR-0033 §Decision 5).
    :ets.new(@table, [
      :set,
      :public,
      :named_table,
      read_concurrency: true,
      write_concurrency: true
    ])

    {:ok, %{}}
  end
end
