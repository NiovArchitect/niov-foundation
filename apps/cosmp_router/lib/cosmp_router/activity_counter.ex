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

  - ADR-0039 §Sub-decision 8 + §Amendment 1 (PERSONAL-promoted scope
    widening at sub-arc 1 sub-phase c canonical at canonical-execution
    register substantively; PERSONAL wallet entities — including
    Personal AI Agent / twin entities per ADR-0046 dual-context model
    — promote on activity threshold crossing per
    `should_promote?/1` register substantively; AI_AGENT entities
    route via wallet_type column canonical BEAM dispatch signal per
    ADR-0039 §Amendment 2 — Personal AI Agent twins (PERSONAL wallet)
    follow this promote-on-activity path; Enterprise AI Agent entities
    (ENTERPRISE wallet) follow the always-hot DMWWorker dispatch path
    per ADR-0039 §Sub-decision 1)
  - ADR-0046 (AI_AGENT EntityType-Discriminated Capsule Routing;
    dual-context routing model — Personal AI Agent + Enterprise AI
    Agent; G6.2 doc-and-test cascade corrects this comment)
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

  # Sub-arc 1 sub-phase c Commit C.2 [BEAM-DBGI-PROMOTE-IDLE-EVICTION]
  # Defaults at Application.get_env-overridable register substantively
  # per ADR-0034 testability discipline canonical.
  @default_eviction_interval_ms 30_000
  @default_idle_ttl_ms 300_000

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

  @doc """
  Configured eviction tick interval (ms) canonical at Application.get_env
  register substantively per ADR-0034 testability discipline canonical.
  Sub-arc 1 sub-phase c Commit C.2 [BEAM-DBGI-PROMOTE-IDLE-EVICTION].
  """
  @spec configured_eviction_interval_ms() :: pos_integer()
  def configured_eviction_interval_ms do
    Application.get_env(
      :cosmp_router,
      :activity_counter_eviction_interval_ms,
      @default_eviction_interval_ms
    )
  end

  @doc """
  Configured idle TTL (ms) canonical at Application.get_env register
  substantively per ADR-0034 testability discipline canonical. Entries
  with last_activity older than this TTL canonical at canonical-state
  register substantively get evicted at eviction tick register
  substantively (DMWWorker for evicted entity_id stops canonical at
  canonical-execution register substantively).
  """
  @spec configured_idle_ttl_ms() :: pos_integer()
  def configured_idle_ttl_ms do
    Application.get_env(
      :cosmp_router,
      :activity_counter_idle_ttl_ms,
      @default_idle_ttl_ms
    )
  end

  @doc """
  Manually trigger idle eviction at canonical-execution register
  substantively. Used at test register substantively for deterministic
  eviction verification canonical at canonical-coherence register
  substantively per ADR-0034 testability discipline canonical (avoid
  waiting for periodic tick at canonical-execution register substantively).
  Returns count of evicted entries canonical at canonical-coherence
  register substantively.
  """
  @spec evict_idle() :: non_neg_integer()
  def evict_idle do
    evict_idle_entries()
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

    # Sub-arc 1 sub-phase c Commit C.2 [BEAM-DBGI-PROMOTE-IDLE-EVICTION]
    # Schedule first eviction tick canonical at canonical-execution
    # register substantively per canonical Elixir periodic-task pattern at
    # GenServer register substantively (hexdocs.pm/elixir/1.12/GenServer.html
    # canonical at official Elixir GenServer reference register substantively
    # per RULE 21 research arc canonical at canonical-knowledge register
    # substantively).
    schedule_eviction()

    Logger.info("CosmpRouter.ActivityCounter started; table=#{@table_name}")

    {:ok, %{table: @table_name}}
  end

  @impl true
  def handle_info(:evict_idle, state) do
    evict_idle_entries()
    schedule_eviction()
    {:noreply, state}
  end

  # Defensive catch-all clause canonical per oneuptime.com production
  # GenServer reference register substantively at canonical-coherence
  # register substantively ("Always handle unknown messages to avoid
  # crashing" canonical at canonical-execution register substantively).
  def handle_info(_unknown, state) do
    {:noreply, state}
  end

  @impl true
  def terminate(_reason, _state) do
    # ETS table is owned by this GenServer; terminate releases the table.
    :ok
  end

  # Private periodic-task helpers per José Valim canonical Periodic.Safter
  # pattern register substantively (medium.com/@efexen reference canonical
  # at canonical-knowledge register substantively).

  defp schedule_eviction do
    Process.send_after(self(), :evict_idle, configured_eviction_interval_ms())
  end

  # Iterate ETS via :ets.select/2 match spec canonical at canonical-
  # execution register substantively per erlang.org/doc/apps/stdlib/ets.html
  # canonical at official ETS reference register substantively; identify
  # entries with last_activity < cutoff register substantively; for each
  # entry: stop DMWWorker via DbgiSupervisor.stop_dmw_worker_horde/1 at
  # cross-app boundary register substantively + delete ETS entry at
  # canonical-state register substantively.
  defp evict_idle_entries do
    now = System.system_time(:millisecond)
    ttl = configured_idle_ttl_ms()
    cutoff = now - ttl

    expired =
      :ets.select(@table_name, [
        {
          {:"$1", :"$2", :"$3"},
          [{:<, :"$3", cutoff}],
          [{{:"$1", :"$2", :"$3"}}]
        }
      ])

    Enum.each(expired, fn {entity_id, _count, _last_activity} ->
      # Stop DMWWorker at canonical-execution register substantively per
      # DbgiSupervisor.stop_dmw_worker_horde/1 canonical at canonical-
      # coherence register substantively (NEW at sub-arc 1 sub-phase c
      # C.2 per Option α scope expansion). Idempotent at canonical-state
      # register substantively (stopping non-existent worker is safe).
      _ = DbgiSupervisor.stop_dmw_worker_horde(entity_id)

      # Delete ETS entry at canonical-state register substantively
      _ = :ets.delete(@table_name, entity_id)
    end)

    length(expired)
  end
end
