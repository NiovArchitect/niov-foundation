defmodule CosmpRouter.ActivityCounter do
  @moduledoc """
  GenServer + ETS substrate canonical at promote-on-activity register
  substantively per ADR-0039 §Sub-decision 8 amendment forward-substrate
  at sub-arc 1 sub-phase c commit register substantively per RULE 21
  research arc canonical at canonical-knowledge register substantively
  per 67f6112 commit substantively.

  ## Substrate-architectural shape canonical at canonical-coherence register

  Per-entity activity counter + last-activity timestamp at ETS register
  substantively per production rate-limiter pattern canonical at Elixir
  community register substantively (dockyard.com/blog/2017/05/19
  canonical at production reference register substantively +
  erlang.org/doc/apps/stdlib/ets.html canonical at official ETS reference
  register substantively):

  - ETS table at :set + :public + :named_table + write_concurrency: true
    + read_concurrency: true + decentralized_counters: true register
    substantively
  - Keyed by entity_id at primary-key register substantively
  - Value tuple {entity_id, count, last_activity_unix_ms} at canonical-
    state register substantively
  - record_activity/1 uses :ets.update_counter/4 atomic operation per
    Erlang ETS atomicity guarantee canonical at canonical-knowledge
    register substantively (no GenServer mailbox bottleneck at hot-write
    path register substantively)
  - should_promote?/2 reads ETS directly via :ets.lookup/2 at concurrent-
    read register substantively (no GenServer mailbox bottleneck at hot-
    read path register substantively)
  - GenServer process owns table creation at init/1 register substantively
    + supervises table lifetime canonical at canonical-coherence register
    substantively
  - Idle eviction at periodic-tick register substantively forward-substrate
    to C.2 commit register substantively at sub-phase c register
    substantively

  ## Threshold canonical at canonical-state register

  Activity threshold canonical at Application.get_env register substantively
  per ADR-0034 testability discipline canonical at canonical-coherence
  register substantively:

  - Default threshold: 5 activities canonical at substrate-honest register
    substantively (production-tunable canonical at canonical-execution
    register substantively per Application.put_env at boot register
    substantively if operator-tier requires different threshold)
  - Default window: 60_000 ms (1 minute) at canonical-coherence register
    substantively for activity-rate measurement canonical at canonical-
    state register substantively

  ## References at canonical-coherence register

  - ADR-0039 §Sub-decision 8 (ENTERPRISE-only scope at sub-phase b
    register substantively; amendment forward-substrate at C.4 commit
    register substantively widens scope canonical at canonical-prose
    register substantively to include PERSONAL-promoted + AI_AGENT-
    promoted at canonical-coherence register substantively)
  - ADR-0034 (BEAM testability discipline; name-configurable substrate
    + Application.get_env-resolved defaults at canonical-knowledge
    register substantively)
  - ADR-0035 (substrate-build discipline; supervision-tree-expansion-
    test-coherence-drift pattern at canonical-coherence register
    substantively candidate for cluster expansion 26th observation
    promotion canonical at substrate-architectural register substantively)
  - RULE 21 (pre-authorization research arc canonical at canonical-rule
    register substantively per 67f6112 commit substantively)
  """

  use GenServer
  require Logger

  @table_name :cosmp_router_activity_counter

  @default_threshold 5
  @default_window_ms 60_000

  # Public API

  @doc """
  Start the ActivityCounter GenServer canonical at supervision tree register
  substantively per ADR-0034 name-configurable substrate canonical at
  canonical-coherence register substantively.
  """
  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(opts \\ []) do
    name = Keyword.get(opts, :name, __MODULE__)
    GenServer.start_link(__MODULE__, opts, name: name)
  end

  @doc """
  Record activity for an entity_id at hot-write path register substantively.
  Atomic at canonical-coherence register substantively per ETS update_counter
  canonical at canonical-knowledge register substantively (no GenServer
  mailbox round-trip; direct ETS write at canonical-execution register
  substantively).
  """
  @spec record_activity(String.t()) :: integer()
  def record_activity(entity_id) when is_binary(entity_id) do
    now = System.system_time(:millisecond)

    # Atomic update_counter pattern canonical per dockyard.com production
    # reference register substantively. Position 2 = count (incremented by
    # 1); position 3 = last_activity_unix_ms (set to now via threshold=0
    # + setvalue=now operation).
    # Default tuple {entity_id, 0, 0} canonical at first-touch register
    # substantively per ETS update_counter default-init semantics canonical
    # at canonical-knowledge register substantively.
    [new_count, _last_activity] =
      :ets.update_counter(
        @table_name,
        entity_id,
        [{2, 1}, {3, 1, 0, now}],
        {entity_id, 0, 0}
      )

    new_count
  end

  @doc """
  Check if an entity_id should be promoted to per-DMW substrate canonical
  at canonical-coherence register substantively. Returns true if count
  >= threshold at canonical-decision register substantively.
  """
  @spec should_promote?(String.t(), pos_integer() | nil) :: boolean()
  def should_promote?(entity_id, threshold \\ nil) when is_binary(entity_id) do
    effective_threshold = threshold || configured_threshold()

    case :ets.lookup(@table_name, entity_id) do
      [{^entity_id, count, _last_activity}] -> count >= effective_threshold
      [] -> false
    end
  end

  @doc """
  Get current activity count for an entity_id at canonical-state register
  substantively. Returns 0 if entity_id not present at ETS register
  substantively. Read-only at canonical-execution register substantively.
  """
  @spec get_count(String.t()) :: non_neg_integer()
  def get_count(entity_id) when is_binary(entity_id) do
    case :ets.lookup(@table_name, entity_id) do
      [{^entity_id, count, _last_activity}] -> count
      [] -> 0
    end
  end

  @doc """
  Get last activity timestamp for an entity_id at canonical-state register
  substantively. Returns 0 if entity_id not present at ETS register
  substantively.
  """
  @spec get_last_activity(String.t()) :: non_neg_integer()
  def get_last_activity(entity_id) when is_binary(entity_id) do
    case :ets.lookup(@table_name, entity_id) do
      [{^entity_id, _count, last_activity}] -> last_activity
      [] -> 0
    end
  end

  @doc """
  Reset activity counter for an entity_id at canonical-state register
  substantively. Used at idle eviction register substantively per C.2
  commit register substantively forward-substrate.
  """
  @spec reset(String.t()) :: boolean()
  def reset(entity_id) when is_binary(entity_id) do
    :ets.delete(@table_name, entity_id)
  end

  @doc """
  Configured threshold canonical at Application.get_env register
  substantively per ADR-0034 testability discipline canonical.
  """
  @spec configured_threshold() :: pos_integer()
  def configured_threshold do
    Application.get_env(:cosmp_router, :activity_counter_threshold, @default_threshold)
  end

  @doc """
  Configured window (ms) canonical at Application.get_env register
  substantively per ADR-0034 testability discipline canonical. Forward-
  substrate at C.2 commit register substantively for idle eviction.
  """
  @spec configured_window_ms() :: pos_integer()
  def configured_window_ms do
    Application.get_env(:cosmp_router, :activity_counter_window_ms, @default_window_ms)
  end

  # GenServer callbacks

  @impl true
  def init(_opts) do
    # Substrate-architectural shape canonical at WalletCache register
    # substantively per B.5 commit register substantively: ETS table
    # creation at GenServer init register substantively; supervised
    # at canonical-coherence register substantively.
    :ets.new(@table_name, [
      :set,
      :public,
      :named_table,
      read_concurrency: true,
      write_concurrency: true,
      decentralized_counters: true
    ])

    Logger.info("CosmpRouter.ActivityCounter started; table=#{@table_name}")

    {:ok, %{table: @table_name}}
  end

  @impl true
  def terminate(_reason, _state) do
    # ETS table is owned by this GenServer; terminate releases the table.
    :ok
  end
end
