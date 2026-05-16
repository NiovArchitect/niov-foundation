defmodule CosmpRouter.WalletCache do
  @moduledoc """
  ETS read-optimized cache for wallet_type lookup at per-node register
  per ADR-0039 Sub-decision 5.

  ## Substrate-architectural pattern

  Read-optimized ETS cache fronting the per-request indexed point-lookup
  at `CosmpRouter.WalletLookup` per ADR-0036 pattern register. Cache
  hit returns from ETS at sub-millisecond register without GenServer
  mailbox bottleneck at canonical BEAM register; cache miss delegates
  to `CosmpRouter.WalletLookup` (which queries the Prisma-owned wallets
  table) and stores the result for subsequent reads at canonical-
  coherence register substantively.

  ## ETS table configuration

  Named, public, set-type ETS table with read + write concurrency
  optimizations + decentralized counters per canonical Elixir/BEAM
  ETS performance discipline:

  - `:set` (each entity_id maps to at most one wallet_type entry)
  - `:public` (multi-process read + write without GenServer mailbox)
  - `:named_table` (atom-addressable; matches ADR-0034 testability
    pattern; production singleton at `CosmpRouter.WalletCache`)
  - `read_concurrency: true` (optimized for concurrent reads)
  - `write_concurrency: true` (optimized for concurrent writes)
  - `decentralized_counters: true` (lock-free counter updates;
    canonical Elixir/BEAM performance discipline)

  ## Supervision per Storage.ETS canonical pattern

  GenServer owns the ETS table lifecycle at sub-phase b register:
  `init/1` creates the named table; GenServer stays alive to keep
  the table canonical; supervisor restart on crash creates fresh
  table (cache reconciliation at canonical-state register
  substantively per next-read cache-miss path delegating to
  `CosmpRouter.WalletLookup` substantively at canonical-coherence
  register substantively).

  Table atom = GenServer name per ADR-0034 Sub-decision 4 (Elixir
  process registry + ETS table registry are distinct namespaces);
  production singleton uses default `__MODULE__`; tests pass `:name`
  opt for per-test isolated tables.

  ## Cache invalidation at sub-phase b register

  No TTL at sub-phase b register substantively; cache substantively
  at lifetime-of-application register at backward-compat register
  substantively. `invalidate/2` public API substantively at canonical-
  architectural register substantively as forward-substrate hook
  canonical at canonical-knowledge register substantively for future
  cache-invalidation triggers (entity wallet_type change events
  forward-substrate to sub-arc 1 sub-phase c register substantively).

  ## References

  - ADR-0039 Sub-decision 5 (NEW CosmpRouter.WalletCache ETS substrate)
  - ADR-0036 (REGULATOR per-request indexed point-lookup pattern
    inherited at cache-miss delegation register)
  - ADR-0034 (BEAM testability discipline; name-configurable +
    start_supervised!)
  - `CosmpRouter.Storage.ETS` (canonical ETS-owner GenServer pattern
    sibling)
  - `CosmpRouter.WalletLookup` (per-request indexed point-lookup
    delegation target at cache-miss register)
  """

  use GenServer

  alias CosmpRouter.WalletLookup

  @type wallet_type :: WalletLookup.wallet_type()

  # ---- Public API ----

  @doc """
  Start the WalletCache GenServer. Registered as `CosmpRouter.WalletCache`
  in production (default); tests pass `:name` opt for per-test
  instances per ADR-0034 testability-refactor pattern.

  The ETS table is `:named_table` with the same atom as the GenServer
  name; production singleton uses `__MODULE__`.

  ## Options

  - `:name` -- registered atom name + ETS table atom; defaults
    `__MODULE__` (production singleton)
  """
  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(opts \\ []) do
    name = Keyword.get(opts, :name, __MODULE__)
    GenServer.start_link(__MODULE__, opts, name: name)
  end

  @doc """
  Look up wallet_type for the given entity_id via ETS cache.

  Cache hit returns `{:ok, wallet_type}` from ETS at sub-millisecond
  register without GenServer mailbox bottleneck. Cache miss delegates
  to `CosmpRouter.WalletLookup.wallet_type_for/1` and stores the
  result for subsequent reads.

  Returns `{:ok, wallet_type}` on success, `{:error, :not_found}` when
  no wallet exists for that entity_id, `{:error, :invalid_wallet_type}`
  if the underlying lookup returns the drift-guard error.

  Not-found results substantively are NOT cached at sub-phase b
  register substantively (negative-result caching forward-substrate
  at canonical-state register substantively if future query density
  proves need).
  """
  @spec wallet_type_for(atom(), String.t()) ::
          {:ok, wallet_type()} | {:error, :not_found | :invalid_wallet_type}
  def wallet_type_for(name \\ __MODULE__, entity_id)
      when is_atom(name) and is_binary(entity_id) do
    case :ets.lookup(name, entity_id) do
      [{^entity_id, wallet_type}] ->
        {:ok, wallet_type}

      [] ->
        case WalletLookup.wallet_type_for(entity_id) do
          {:ok, wallet_type} = ok ->
            :ets.insert(name, {entity_id, wallet_type})
            ok

          {:error, _reason} = err ->
            err
        end
    end
  end

  @doc """
  Invalidate the cached wallet_type entry for the given entity_id.

  Returns `:ok` regardless of whether an entry existed (idempotent).
  Forward-substrate hook at canonical-architectural register
  substantively for future cache-invalidation triggers (entity
  wallet_type change events forward-substrate to sub-arc 1 sub-phase
  c register substantively).
  """
  @spec invalidate(atom(), String.t()) :: :ok
  def invalidate(name \\ __MODULE__, entity_id)
      when is_atom(name) and is_binary(entity_id) do
    :ets.delete(name, entity_id)
    :ok
  end

  # ---- GenServer callbacks ----

  @impl true
  def init(opts) do
    name = Keyword.get(opts, :name, __MODULE__)

    :ets.new(name, [
      :set,
      :public,
      :named_table,
      read_concurrency: true,
      write_concurrency: true,
      decentralized_counters: true
    ])

    {:ok, %{name: name}}
  end
end
