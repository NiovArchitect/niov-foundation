defmodule DbgiSupervisor.DMWWorker do
  @moduledoc """
  DMW Worker per-DMW supervised GenServer per ADR-0038.

  Each entity_id with an active DMW gets one DMWWorker GenServer
  registered in `DbgiSupervisor.Registry` and tracked via
  `DbgiSupervisor.PresenceTracker`. DMWWorkers are spawned lazily
  through `DbgiSupervisor.start_dmw_worker/2` on first COSMP operation
  against the wallet's entity_id.

  ## Architectural framing

  - Identity addressing: entity_id (Registry-keyed via `{:via, Registry,
    {DbgiSupervisor.Registry, entity_id}}`).
  - Tier dispatch: WalletType 3-tier (`:personal` -> `:promote_on_activity`,
    `:enterprise` -> `:always_hot`, `:device` -> `:always_cold_shard`).
  - Lifecycle: lazy-spawn on first COSMP operation; clean stop does not
    trigger restart (`:transient`); crash triggers restart.
  - State: stateless plus Phoenix.Tracker presence only at sub-phase a.
    ETS cache substrate is forward-substrate to later sub-arcs.
  - Layer: separate from `CosmpRouter.Router`. `cosmp_router` stays as-is
    at sub-phase a; cosmp_router re-wire is forward-substrate to sub-arc 1
    sub-phase b and beyond.

  ## Public API

  See `DbgiSupervisor` for `start_dmw_worker/2`, `whereis_dmw_worker/1`,
  and `stop_dmw_worker/1`. Direct callers should use the
  `DbgiSupervisor` API rather than calling `DMWWorker` functions
  directly.

  ## References

  - ADR-0038 (DMW Worker per-DMW Supervised Process)
  - ADR-0028 (BEAM Coordination Layer) §3
  - ADR-0026 §5 (BEAM-compatibility patterns)
  - ADR-0034 (BEAM testability discipline)
  """

  use GenServer

  alias DbgiSupervisor.PresenceTracker

  @type wallet_type :: :personal | :enterprise | :device
  @type tier :: :always_hot | :promote_on_activity | :always_cold_shard
  @type entity_id :: String.t() | atom()

  @type state :: %{
          entity_id: entity_id(),
          wallet_type: wallet_type(),
          tier: tier(),
          storage_ets: atom()
        }

  # Public API

  @doc """
  Start a DMWWorker for the given entity_id + wallet_type.

  Registered via `{:via, Registry, {DbgiSupervisor.Registry, entity_id}}`
  so duplicate starts for the same entity_id return
  `{:error, {:already_started, pid}}`.
  """
  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(opts) do
    entity_id = Keyword.fetch!(opts, :entity_id)
    GenServer.start_link(__MODULE__, opts, name: via_tuple(entity_id))
  end

  @doc """
  Child spec for DynamicSupervisor.

  Uses `:transient` restart policy: DMWWorker restarts on abnormal
  termination but not on clean stop via `DbgiSupervisor.stop_dmw_worker/1`.
  """
  @spec child_spec(keyword()) :: Supervisor.child_spec()
  def child_spec(opts) do
    entity_id = Keyword.fetch!(opts, :entity_id)

    %{
      id: {__MODULE__, entity_id},
      start: {__MODULE__, :start_link, [opts]},
      restart: :transient,
      type: :worker
    }
  end

  # GenServer callbacks

  @impl true
  @spec init(keyword()) :: {:ok, state()} | {:stop, term()}
  def init(opts) do
    entity_id = Keyword.fetch!(opts, :entity_id)
    wallet_type = Keyword.fetch!(opts, :wallet_type)

    # storage_ets resolved at runtime via Application.get_env per
    # ADR-0034 testability discipline + Adapter Pattern canonical at
    # Elixir community register substantively per RULE 21 research
    # arc canonical at canonical-knowledge register substantively per
    # 67f6112 commit substantively. Runtime resolution avoids
    # compile-time dependency from dbgi_supervisor on
    # CosmpRouter.Storage.ETS canonical at canonical-coherence
    # register substantively (cycle breakage canonical per
    # ADR-0039 Sub-decision 3 amendment register substantively).
    default_storage_ets =
      Application.get_env(
        :cosmp_router,
        :storage_ets,
        :"Elixir.CosmpRouter.Storage.ETS"
      )

    storage_ets = Keyword.get(opts, :storage_ets, default_storage_ets)

    case tier_for(wallet_type) do
      {:ok, tier} ->
        {:ok, _ref} =
          PresenceTracker.track(
            self(),
            topic_for(entity_id),
            entity_id,
            %{wallet_type: wallet_type, node: node()}
          )

        {:ok,
         %{
           entity_id: entity_id,
           wallet_type: wallet_type,
           tier: tier,
           storage_ets: storage_ets
         }}

      {:error, reason} ->
        {:stop, reason}
    end
  end

  @impl true
  def handle_call(:get_state, _from, state) do
    {:reply, state, state}
  end

  def handle_call(:get_tier, _from, state) do
    {:reply, state.tier, state}
  end

  # Sub-arc 1 sub-phase b Commit B.6.3 [BEAM-COSMP-HIVE-DISPATCH-INTEGRATION]
  # ========================================================================
  # 7 COSMP op handle_call clauses canonical at canonical-architectural
  # register substantively per ADR-0039 Sub-decision 3 + Option ζ Adapter
  # Pattern canonical at canonical-knowledge register substantively per
  # RULE 21 research arc. Each clause dispatches via
  # DbgiSupervisor.CosmpExecution.adapter/0 facade canonical at runtime-
  # resolution register substantively (CosmpRouter.Operations registered
  # at cosmp_router/application.ex start/2 boot register substantively).

  def handle_call({:cosmp_op, :authenticate, request}, _from, state) do
    response = DbgiSupervisor.CosmpExecution.adapter().authenticate(request, state)
    {:reply, response, state}
  end

  def handle_call({:cosmp_op, :negotiate, request}, _from, state) do
    response = DbgiSupervisor.CosmpExecution.adapter().negotiate(request, state)
    {:reply, response, state}
  end

  def handle_call({:cosmp_op, :read, request}, _from, state) do
    response = DbgiSupervisor.CosmpExecution.adapter().read(request, state)
    {:reply, response, state}
  end

  def handle_call({:cosmp_op, :write, request}, _from, state) do
    response = DbgiSupervisor.CosmpExecution.adapter().write(request, state)
    {:reply, response, state}
  end

  def handle_call({:cosmp_op, :share, request}, _from, state) do
    response = DbgiSupervisor.CosmpExecution.adapter().share(request, state)
    {:reply, response, state}
  end

  def handle_call({:cosmp_op, :revoke, request}, _from, state) do
    response = DbgiSupervisor.CosmpExecution.adapter().revoke(request, state)
    {:reply, response, state}
  end

  def handle_call({:cosmp_op, :audit, request}, _from, state) do
    response = DbgiSupervisor.CosmpExecution.adapter().audit(request, state)
    {:reply, response, state}
  end

  @impl true
  @spec terminate(term(), state()) :: :ok
  def terminate(_reason, state) do
    PresenceTracker.untrack(
      self(),
      topic_for(state.entity_id),
      state.entity_id
    )

    :ok
  end

  # Tier dispatch per ADR-0038 Sub-decision 3 (Q-A LOCKED Option α)

  @doc """
  Resolve tier from wallet_type per ADR-0038 Sub-decision 3.

  - `:personal` -> `:promote_on_activity` (cold shard substrate;
    promotes to hot per-DMW substrate on activity)
  - `:enterprise` -> `:always_hot` (always-hot per-DMW substrate)
  - `:device` -> `:always_cold_shard` (always-cold shard-mapped substrate)
  """
  @spec tier_for(wallet_type()) :: {:ok, tier()} | {:error, term()}
  def tier_for(:personal), do: {:ok, :promote_on_activity}
  def tier_for(:enterprise), do: {:ok, :always_hot}
  def tier_for(:device), do: {:ok, :always_cold_shard}
  def tier_for(other), do: {:error, {:invalid_wallet_type, other}}

  # Phoenix.Tracker topic + Registry via tuple

  @spec topic_for(entity_id()) :: String.t()
  defp topic_for(entity_id), do: "dmw:#{entity_id}"

  @spec via_tuple(entity_id()) :: {:via, module(), {module(), entity_id()}}
  defp via_tuple(entity_id) do
    {:via, Registry, {DbgiSupervisor.Registry, entity_id}}
  end
end
