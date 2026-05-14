defmodule DbgiSupervisor.PresenceTracker do
  @moduledoc """
  Phoenix.Tracker behaviour module for DBGI presence tracking at
  multi-region cluster register per ADR-0028 §3 "CRDT-backed state
  where the workload permits" canonical at substrate-architectural
  register.

  Sub-phase 9 [BEAM-DBGI-LIBCLUSTER]: substantive substrate-
  architectural scope at canonical register per
  D-PHASE-9-PHOENIX-TRACKER-ADR-0030-AMENDMENT-CANDIDATE 27th canonical
  substrate-build observation candidate at substantive register.

  ## Substrate-architectural role at canonical register

  CRDT-backed presence tracking at multi-region cluster register per
  ADR-0028 §3 canonical:

  - Each node runs a pool of trackers (node-local pool canonical at
    Phoenix.Tracker register)
  - Node-local changes replicated across cluster via heartbeat
    protocol + CRDT (eventually consistent, conflict-free)
  - Diff of presence join/leave events surfaced via `handle_diff/2`
    callback canonical
  - `direct_broadcast/4` canonical for cluster-wide pubsub
    notification at substantive register

  ## Canonical API per Phoenix.Tracker register

  - `track/4` — track a process at a topic
  - `untrack/3` — untrack a process at a topic
  - `list/1` — surface present processes at a topic
  - `handle_diff/2` — diff callback (CRDT-backed change propagation)

  ## References

  - ADR-0028 §3 (BEAM Coordination Layer — "CRDT-backed state where
    the workload permits" canonical at substrate-architectural register)
  - ADR-0030 §DBGI sub-phase 9 (LANDED at this commit per
    D-PHASE-9-PHOENIX-TRACKER-ADR-0030-AMENDMENT-CANDIDATE 27th
    canonical substrate-build observation candidate)
  - https://hexdocs.pm/phoenix_pubsub/Phoenix.Tracker.html
  - https://hexdocs.pm/phoenix_pubsub/Phoenix.PubSub.html
  """

  use Phoenix.Tracker

  @doc """
  Start the tracker as a supervised child at canonical register.
  Requires `:pubsub_server` opt (Phoenix.Tracker canonical at
  substantive register).
  """
  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(opts) do
    opts = Keyword.merge([name: __MODULE__], opts)
    Phoenix.Tracker.start_link(__MODULE__, opts, opts)
  end

  @impl true
  def init(opts) do
    server = Keyword.fetch!(opts, :pubsub_server)
    {:ok, %{pubsub_server: server, node_name: Phoenix.PubSub.node_name(server)}}
  end

  @impl true
  def handle_diff(diff, state) do
    # Sub-phase 9 substrate-coherent stub at canonical register:
    # broadcast join/leave events to the pubsub server for downstream
    # consumers. Substantive consumer logic (e.g., DMW presence routing,
    # cross-region failover) forward-queued to sub-phase 10+ per
    # ADR-0030 §DBGI canonical at substrate-architectural register.
    for {topic, {joins, leaves}} <- diff do
      for {key, meta} <- joins do
        Phoenix.PubSub.direct_broadcast(
          state.node_name,
          state.pubsub_server,
          topic,
          {:join, key, meta}
        )
      end

      for {key, meta} <- leaves do
        Phoenix.PubSub.direct_broadcast(
          state.node_name,
          state.pubsub_server,
          topic,
          {:leave, key, meta}
        )
      end
    end

    {:ok, state}
  end

  @doc """
  Track a process at a topic per Phoenix.Tracker canonical.
  """
  @spec track(pid(), String.t(), term(), map()) :: {:ok, binary()} | {:error, term()}
  def track(pid, topic, key, meta) do
    Phoenix.Tracker.track(__MODULE__, pid, topic, key, meta)
  end

  @doc """
  Untrack a process at a topic per Phoenix.Tracker canonical.
  """
  @spec untrack(pid(), String.t(), term()) :: :ok
  def untrack(pid, topic, key) do
    Phoenix.Tracker.untrack(__MODULE__, pid, topic, key)
  end

  @doc """
  Surface present processes at a topic per Phoenix.Tracker canonical.
  """
  @spec list(String.t()) :: [{term(), map()}]
  def list(topic) do
    Phoenix.Tracker.list(__MODULE__, topic)
  end
end
