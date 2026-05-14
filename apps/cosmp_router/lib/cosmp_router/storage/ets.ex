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

  # ---- Public API ----

  @doc """
  Start the ETS-backed storage GenServer. Registered as
  `CosmpRouter.Storage.ETS` in production (default); tests pass
  `:name` opt for per-test instances per ADR-0034 testability-
  refactor pattern (sub-phase 6a [BEAM-COSMP-TESTABILITY-REFACTOR]).

  The ETS table is `:named_table` with the same atom as the
  GenServer name — Elixir's process registry and ETS table
  registry are distinct namespaces so no atom collision occurs
  (KV.Registry canonical per ADR-0034 §Decision Sub-decision 4).

  ## Options

  - `:name` — registered atom name + ETS table atom; defaults
    `__MODULE__` (production singleton)
  """
  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(opts \\ []) do
    name = Keyword.get(opts, :name, __MODULE__)
    GenServer.start_link(__MODULE__, opts, name: name)
  end

  @doc """
  Store or overwrite a capsule by `capsule_id`. Returns `:ok` on
  success. The `name` argument identifies the ETS table (per ADR-0034
  testability-refactor pattern; defaults `__MODULE__` for production).
  """
  @spec put(atom(), String.t(), Capsule.t()) :: :ok
  def put(name \\ __MODULE__, capsule_id, %Capsule{} = capsule)
      when is_atom(name) and is_binary(capsule_id) do
    :ets.insert(name, {capsule_id, capsule})
    :ok
  end

  @doc """
  Retrieve a capsule by `capsule_id`. Returns `{:ok, capsule}` or
  `{:error, :not_found}`.
  """
  @spec get(atom(), String.t()) :: {:ok, Capsule.t()} | {:error, :not_found}
  def get(name \\ __MODULE__, capsule_id) when is_atom(name) and is_binary(capsule_id) do
    case :ets.lookup(name, capsule_id) do
      [{^capsule_id, capsule}] -> {:ok, capsule}
      [] -> {:error, :not_found}
    end
  end

  @doc """
  Remove a capsule by `capsule_id`. Returns `:ok` regardless of
  whether the capsule existed (idempotent).
  """
  @spec delete(atom(), String.t()) :: :ok
  def delete(name \\ __MODULE__, capsule_id)
      when is_atom(name) and is_binary(capsule_id) do
    :ets.delete(name, capsule_id)
    :ok
  end

  @doc """
  List all stored capsule_ids. Debug/test only; sub-phase 11+
  observability uses telemetry events instead.
  """
  @spec list(atom()) :: [String.t()]
  def list(name \\ __MODULE__) when is_atom(name) do
    :ets.tab2list(name)
    |> Enum.map(fn {capsule_id, _capsule} -> capsule_id end)
  end

  @doc """
  Flush all stored capsules. Test-only.
  """
  @spec clear(atom()) :: :ok
  def clear(name \\ __MODULE__) when is_atom(name) do
    :ets.delete_all_objects(name)
    :ok
  end

  # ---- GenServer callbacks ----

  @impl true
  def init(opts) do
    name = Keyword.get(opts, :name, __MODULE__)
    # Named, public, read-concurrent ETS table. Owner is this GenServer;
    # table survives until owner crashes (at which point supervisor
    # restart per :one_for_one strategy creates a fresh table — ETS
    # data is hot-tier ephemeral; Postgres reconciliation via the
    # `CosmpRouter.Storage` facade at next read per ADR-0033 §Decision 5).
    # Table atom = GenServer name per ADR-0034 Sub-decision 4 (Elixir
    # process names + ETS names live in distinct registries).
    :ets.new(name, [
      :set,
      :public,
      :named_table,
      read_concurrency: true,
      write_concurrency: true
    ])

    {:ok, %{name: name}}
  end
end
