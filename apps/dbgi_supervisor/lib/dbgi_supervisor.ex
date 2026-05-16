defmodule DbgiSupervisor do
  @moduledoc """
  Database Gateway Intelligence (DBGI) Supervisor.

  Substantively coordinates supervised process groups for distributed
  Capsule coordination per ADR-0028 §3 + ADR-0030 §DBGI canonical at
  the substrate-architectural register. Sub-phase 7
  `[BEAM-DBGI-APP-SKELETON]` lands the OTP app skeleton (mix.exs +
  Application module + Supervisor `:one_for_one` tree with empty
  children list); substantive DBGI substrate forward-queued to
  sub-phases 8-10 per ADR-0030 §DBGI Supervisor Layer canonical at
  NIOV substrate-architectural register.

  ## Forward queue (sub-phases 8-10 per ADR-0030 §DBGI canonical)

  - **Sub-phase 8** `[BEAM-DBGI-PROCESS-GROUPS]` — distributed
    process-group registry via `:pg` (OTP-native) + `:gproc` (richer
    registry semantics) + `Registry` + `DynamicSupervisor` per
    ADR-0028 §3 canonical for combined-vs-siloed data isolation
  - **Sub-phase 9** `[BEAM-DBGI-LIBCLUSTER]` — multi-region clustering
    via `libcluster` + `Phoenix.PubSub` cross-node messaging +
    CRDT-backed state where workload permits per ADR-0028 §3 canonical
  - **Sub-phase 10** `[BEAM-DBGI-INTEGRATION-TESTS]` — process group
    join/leave + clustering formation + failover across nodes per
    ADR-0030 §DBGI canonical

  ## Substrate-architectural references

  - ADR-0001 (Three-Wallet Architecture; internal-register substrate
    for Personal + Enterprise + Twin canonical)
  - ADR-0026 §5 (6 BEAM compatibility patterns canonical at the
    substantive register)
  - ADR-0028 §3 (BEAM Coordination Layer canonical for DBGI
    substantive scope; names GenStage + Registry + DynamicSupervisor +
    libcluster + Phoenix.PubSub + CRDT-backed state)
  - ADR-0030 §DBGI Supervisor Layer (Phase 2 implementation canonical
    sub-phases 7-10)
  - ADR-0034 (BEAM COSMP Testability Refactor Pattern; carries forward
    to DBGI substrate at the canonical-pattern register — per-test
    instances via `start_supervised!` + name-configurability)
  - ADR-0035 (Substrate-Build Discipline Canonical; substantively
    load-bearing at DBGI substrate-build register)
  """

  # DMWWorker Public API per ADR-0038

  @type wallet_type :: :personal | :enterprise | :device
  @type entity_id :: String.t() | atom()

  @doc """
  Start a DMWWorker for the given entity_id + wallet_type.

  Lazy-spawned via `DbgiSupervisor.DynamicSupervisor` per ADR-0038
  Sub-decision 4. Returns `{:ok, pid}` on success or
  `{:error, {:already_started, pid}}` if a DMWWorker for that entity_id
  already exists.

  ## Examples

      iex> DbgiSupervisor.start_dmw_worker("entity_abc", :enterprise)
      {:ok, #PID<...>}

      iex> DbgiSupervisor.start_dmw_worker("entity_abc", :enterprise)
      {:error, {:already_started, #PID<...>}}

  ## References

  - ADR-0038 Sub-decision 1 (module location)
  - ADR-0038 Sub-decision 2 (identity addressing)
  - ADR-0038 Sub-decision 4 (lifecycle pattern: lazy-spawn)
  """
  @spec start_dmw_worker(entity_id(), wallet_type()) ::
          DynamicSupervisor.on_start_child()
  def start_dmw_worker(entity_id, wallet_type)
      when wallet_type in [:personal, :enterprise, :device] do
    DynamicSupervisor.start_child(
      DbgiSupervisor.DynamicSupervisor,
      {DbgiSupervisor.DMWWorker, [entity_id: entity_id, wallet_type: wallet_type]}
    )
  end

  @doc """
  Look up the DMWWorker pid for the given entity_id via Registry.

  Returns `{:ok, pid}` or `:error` if no DMWWorker is running for
  that entity_id.

  ## Examples

      iex> DbgiSupervisor.whereis_dmw_worker("entity_abc")
      {:ok, #PID<...>}

      iex> DbgiSupervisor.whereis_dmw_worker("nonexistent")
      :error

  ## References

  - ADR-0038 Sub-decision 2 (Registry-keyed identity addressing)
  """
  @spec whereis_dmw_worker(entity_id()) :: {:ok, pid()} | :error
  def whereis_dmw_worker(entity_id) do
    case Registry.lookup(DbgiSupervisor.Registry, entity_id) do
      [{pid, _meta}] -> {:ok, pid}
      [] -> :error
    end
  end

  @doc """
  Stop the DMWWorker for the given entity_id.

  Terminates the DMWWorker via DynamicSupervisor; Phoenix.Tracker
  untracks presence in DMWWorker.terminate/2 per ADR-0038
  Sub-decision 5.

  Returns `:ok` on success or `:error` if no DMWWorker is running for
  that entity_id.

  ## References

  - ADR-0038 Sub-decision 4 (lifecycle pattern; `:transient` restart
    policy means clean stop does not trigger restart)
  - ADR-0038 Sub-decision 5 (state cleanup via terminate/2)
  """
  @spec stop_dmw_worker(entity_id()) :: :ok | :error
  def stop_dmw_worker(entity_id) do
    case whereis_dmw_worker(entity_id) do
      {:ok, pid} ->
        DynamicSupervisor.terminate_child(
          DbgiSupervisor.DynamicSupervisor,
          pid
        )

      :error ->
        :error
    end
  end

  # =========================================================================
  # Horde-distributed DMWWorker Public API per ADR-0039 §Decision Sub-decision 1
  # =========================================================================

  @doc """
  Start a DMWWorker for the given entity_id + wallet_type via Horde
  distributed substrate per ADR-0039 §Decision Sub-decision 1.

  Lazy-spawned via `DbgiSupervisor.HordeDynamicSupervisor`; registered
  via `Horde.Registry` at `DbgiSupervisor.HordeRegistry`. Per ADR-0039
  §Decision Sub-decision 1, the spawn bypasses
  `DbgiSupervisor.DMWWorker.start_link/1` (which registers via the
  single-node Registry) and uses `GenServer.start_link/3` directly with
  a Horde-via name registration. DMWWorker's `init/1`, `handle_call`,
  and `terminate/2` callbacks run unchanged at sub-phase a substrate
  register, preserving Phoenix.Tracker presence + tier metadata canonical
  per ADR-0038 Sub-decisions 3 + 5.

  Returns `{:ok, pid}` on success or `{:ok, pid}` if a DMWWorker for
  that entity_id is already registered (lazy-spawn idempotent).

  ## ENTERPRISE-only at sub-phase b register

  Per ADR-0039 §Decision Sub-decision 8, this Horde path fires for
  ENTERPRISE wallets only at sub-phase b register substantively.
  PERSONAL/AI_AGENT/DEVICE tier dispatch uses `start_dmw_worker/2`
  single-node path at sub-phase a substrate register.

  ## References

  - ADR-0039 §Decision Sub-decision 1 (per-DMW GenServer via Horde)
  - ADR-0039 §Decision Sub-decision 7 (tier-routed dispatch shim)
  - ADR-0039 §Decision Sub-decision 8 (ENTERPRISE-only scope)
  - ADR-0038 Sub-decisions 1-5 (DMWWorker substrate canonical at
    sub-phase a runtime register)
  """
  @spec start_dmw_worker_horde(entity_id(), wallet_type()) ::
          {:ok, pid()} | {:error, term()}
  def start_dmw_worker_horde(entity_id, wallet_type)
      when wallet_type in [:personal, :enterprise, :device] do
    case whereis_dmw_worker_horde(entity_id) do
      {:ok, pid} ->
        {:ok, pid}

      :error ->
        child_spec = %{
          id: {DbgiSupervisor.DMWWorker, entity_id},
          start:
            {GenServer, :start_link,
             [
               DbgiSupervisor.DMWWorker,
               [entity_id: entity_id, wallet_type: wallet_type],
               [name: {:via, Horde.Registry, {DbgiSupervisor.HordeRegistry, entity_id}}]
             ]},
          restart: :transient,
          type: :worker
        }

        case Horde.DynamicSupervisor.start_child(
               DbgiSupervisor.HordeDynamicSupervisor,
               child_spec
             ) do
          {:ok, pid} -> {:ok, pid}
          {:error, {:already_started, pid}} -> {:ok, pid}
          {:error, reason} -> {:error, reason}
        end
    end
  end

  @doc """
  Look up the DMWWorker pid for the given entity_id via Horde.Registry
  per ADR-0039 §Decision Sub-decision 1.

  Returns `{:ok, pid}` or `:error` if no DMWWorker is registered for
  that entity_id in Horde.Registry. Mirrors `whereis_dmw_worker/1`
  return shape for API symmetry at single-node + Horde registers.

  ## References

  - ADR-0039 §Decision Sub-decision 1 (Horde Registry lookup)
  """
  @spec whereis_dmw_worker_horde(entity_id()) :: {:ok, pid()} | :error
  def whereis_dmw_worker_horde(entity_id) do
    case Horde.Registry.lookup(DbgiSupervisor.HordeRegistry, entity_id) do
      [{pid, _meta}] -> {:ok, pid}
      [] -> :error
    end
  end
end
