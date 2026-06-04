defmodule CollaborationSupervisor.CollaborationProcess do
  @moduledoc """
  Per-collaboration supervised GenServer.

  Holds:
  - the observed state (`:requested` / `:accepted` / etc.)
  - whether a blocked reason is set
  - the timestamp of the last observation

  The state is *observed* — this process never decides policy, never
  writes audit, never executes connector actions. It only mirrors what
  the TS-side governance has already determined, so the TS wrapper can
  see "is BEAM actually tracking this collaboration's lifecycle?".

  Per ADR-0026 §5 Pattern 2 (supervisor-friendly failures): a crash
  here is recoverable — the DynamicSupervisor restarts, and the next
  observation from the TS side re-establishes the state. Per
  ADR-0034: name-configurable for testability (default module-name in
  prod, opt overrides in test).
  """

  use GenServer

  alias CollaborationSupervisor.NextTick

  @type state :: %{
          collaboration_id: binary(),
          observed_state: NextTick.state(),
          has_blocked_reason: boolean(),
          observed_at: DateTime.t()
        }

  # --- Public API ---------------------------------------------------------

  @doc """
  Start (or fetch) the GenServer for a collaboration. Idempotent —
  calling start_for/2 a second time with the same id returns
  `{:ok, pid}` for the existing process.
  """
  @spec start_for(binary(), keyword()) :: {:ok, pid()} | {:error, term()}
  def start_for(collaboration_id, opts \\ []) when is_binary(collaboration_id) do
    registry = Keyword.get(opts, :registry, CollaborationSupervisor.Registry)
    dyn_sup = Keyword.get(opts, :dynamic_supervisor, CollaborationSupervisor.DynamicSupervisor)

    case Registry.lookup(registry, collaboration_id) do
      [{pid, _}] ->
        {:ok, pid}

      [] ->
        spec = {__MODULE__, collaboration_id: collaboration_id, registry: registry}

        case DynamicSupervisor.start_child(dyn_sup, spec) do
          {:ok, pid} -> {:ok, pid}
          {:error, {:already_started, pid}} -> {:ok, pid}
          other -> other
        end
    end
  end

  @doc "Observe a state transition from the TS side."
  @spec observe(pid() | binary(), NextTick.state(), boolean(), keyword()) ::
          :ok | {:error, term()}
  def observe(pid, observed_state, has_blocked_reason, opts \\ [])

  def observe(pid, observed_state, has_blocked_reason, _opts) when is_pid(pid) do
    GenServer.call(pid, {:observe, observed_state, has_blocked_reason})
  end

  def observe(collaboration_id, observed_state, has_blocked_reason, opts)
      when is_binary(collaboration_id) do
    case start_for(collaboration_id, opts) do
      {:ok, pid} -> GenServer.call(pid, {:observe, observed_state, has_blocked_reason})
      err -> err
    end
  end

  @doc "Fetch the current supervised state for a collaboration."
  @spec get_status(binary(), keyword()) :: {:ok, state()} | :not_found
  def get_status(collaboration_id, opts \\ []) when is_binary(collaboration_id) do
    registry = Keyword.get(opts, :registry, CollaborationSupervisor.Registry)

    case Registry.lookup(registry, collaboration_id) do
      [{pid, _}] -> GenServer.call(pid, :get_status)
      [] -> :not_found
    end
  end

  def start_link(opts) do
    collaboration_id = Keyword.fetch!(opts, :collaboration_id)
    registry = Keyword.get(opts, :registry, CollaborationSupervisor.Registry)
    name = {:via, Registry, {registry, collaboration_id}}
    GenServer.start_link(__MODULE__, %{collaboration_id: collaboration_id}, name: name)
  end

  # --- Callbacks ---------------------------------------------------------

  @impl true
  def init(%{collaboration_id: collaboration_id}) do
    {:ok,
     %{
       collaboration_id: collaboration_id,
       observed_state: :requested,
       has_blocked_reason: false,
       observed_at: DateTime.utc_now()
     }}
  end

  @impl true
  def handle_call(:get_status, _from, state) do
    {:reply, {:ok, state}, state}
  end

  @impl true
  def handle_call({:observe, observed_state, has_blocked_reason}, _from, state) do
    next_state = %{
      state
      | observed_state: observed_state,
        has_blocked_reason: has_blocked_reason,
        observed_at: DateTime.utc_now()
    }

    {:reply, :ok, next_state}
  end
end
