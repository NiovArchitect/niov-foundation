defmodule CollaborationSupervisor.WatcherActor do
  @moduledoc """
  Long-lived watcher evaluation actor (Phase 1287-B).

  A single supervised GenServer that evaluates bounded, Foundation-scoped
  candidate sets and returns ADVISORY candidate findings (via the pure
  `WatcherEval`). It holds long-lived counters (`evaluations`,
  `last_evaluated_at`) so this is a genuine long-running actor, not a per-request
  function. It is ADVISORY only: it never decides permission/scope/tenant, never
  creates work, never notifies, and only echoes back candidate_ids /
  watcher_types it was given. Foundation re-validates + re-scopes everything.

  Per ADR-0034: the production singleton uses the default module-name
  registration; tests start their own via `start_supervised!/1`.
  """
  use GenServer

  alias CollaborationSupervisor.WatcherEval

  @actor_id "watcher_actor"
  @max_candidates 200

  def start_link(opts) do
    name = Keyword.get(opts, :name, __MODULE__)
    GenServer.start_link(__MODULE__, %{evaluations: 0, last_evaluated_at: nil}, name: name)
  end

  @doc """
  Evaluate a bounded, scoped candidate list. Caps the input at #{@max_candidates}
  (no unbounded work). Returns `{:ok, %{candidates, actor_id, evaluated_at}}`.
  """
  def evaluate(server \\ __MODULE__, candidates) when is_list(candidates) do
    GenServer.call(server, {:evaluate, Enum.take(candidates, @max_candidates)})
  end

  def actor_id, do: @actor_id

  @impl true
  def init(state), do: {:ok, state}

  @impl true
  def handle_call({:evaluate, candidates}, _from, state) do
    evaluated = WatcherEval.evaluate(candidates)
    now = DateTime.utc_now() |> DateTime.to_iso8601()
    new_state = %{state | evaluations: state.evaluations + 1, last_evaluated_at: now}
    {:reply, {:ok, %{candidates: evaluated, actor_id: @actor_id, evaluated_at: now}}, new_state}
  end
end
