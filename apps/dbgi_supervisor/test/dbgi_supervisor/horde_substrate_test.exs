defmodule DbgiSupervisor.HordeSubstrateTest do
  @moduledoc """
  Tests for the Horde Registry + Horde DynamicSupervisor distributed
  substrate per ADR-0039 §Decision Sub-decision 1.

  Tests cover the public API surface canonical at canonical-execution
  register substantively: `DbgiSupervisor.start_dmw_worker_horde/2` +
  `DbgiSupervisor.whereis_dmw_worker_horde/1`. Application-supervised
  Horde.Registry + Horde.DynamicSupervisor canonical at sub-phase b
  substrate per `DbgiSupervisor.Application`; per-test entity_id
  uniqueness via `System.unique_integer/1` matches DMWWorker test
  pattern canonical at ADR-0038 sub-phase a register.

  Test pattern mirrors `DbgiSupervisor.DMWWorkerTest` precedent
  (use ExUnit.Case, async: false + Phoenix.Tracker CRDT eventual
  consistency settle + unique_entity_id/1 helper).

  ## References

  - ADR-0039 §Decision Sub-decision 1 (Horde Registry + Horde
    DynamicSupervisor; CRDT-based distributed Registry + handoff on
    node failure)
  - ADR-0038 (DMWWorker substrate canonical at sub-phase a runtime
    register; preserved unchanged at sub-phase b)
  - ADR-0034 (BEAM testability discipline)
  """

  use ExUnit.Case, async: false

  alias DbgiSupervisor.PresenceTracker

  @presence_settle_ms 200

  setup do
    on_exit(fn -> cleanup_all_horde_dmw_workers() end)
    :ok
  end

  describe "start_dmw_worker_horde/2 spawn lifecycle" do
    test "spawns DMWWorker via Horde.DynamicSupervisor for ENTERPRISE wallet" do
      entity_id = unique_entity_id("horde_enterprise")

      assert {:ok, pid} = DbgiSupervisor.start_dmw_worker_horde(entity_id, :enterprise)
      assert Process.alive?(pid)
    end

    test "Horde.Registry lookup returns the spawned PID" do
      entity_id = unique_entity_id("horde_registry")

      {:ok, pid} = DbgiSupervisor.start_dmw_worker_horde(entity_id, :enterprise)

      assert {:ok, ^pid} = DbgiSupervisor.whereis_dmw_worker_horde(entity_id)
    end

    test "lazy-spawn idempotent: second call returns existing pid" do
      entity_id = unique_entity_id("horde_idempotent")

      {:ok, pid_1} = DbgiSupervisor.start_dmw_worker_horde(entity_id, :enterprise)
      assert {:ok, ^pid_1} = DbgiSupervisor.start_dmw_worker_horde(entity_id, :enterprise)
    end

    test "whereis_dmw_worker_horde returns :error when no DMWWorker registered" do
      assert :error = DbgiSupervisor.whereis_dmw_worker_horde(unique_entity_id("horde_missing"))
    end

    test "parallel DMWWorkers for distinct entity_ids coexist in Horde substrate" do
      entity_a = unique_entity_id("horde_parallel_a")
      entity_b = unique_entity_id("horde_parallel_b")

      {:ok, pid_a} = DbgiSupervisor.start_dmw_worker_horde(entity_a, :enterprise)
      {:ok, pid_b} = DbgiSupervisor.start_dmw_worker_horde(entity_b, :personal)

      assert pid_a != pid_b
      assert Process.alive?(pid_a)
      assert Process.alive?(pid_b)
      assert {:ok, ^pid_a} = DbgiSupervisor.whereis_dmw_worker_horde(entity_a)
      assert {:ok, ^pid_b} = DbgiSupervisor.whereis_dmw_worker_horde(entity_b)
    end
  end

  describe "DMWWorker presence + tier metadata canonical at Horde-spawned process" do
    test "Horde-spawned DMWWorker tracks presence via Phoenix.Tracker" do
      entity_id = unique_entity_id("horde_presence")

      {:ok, _pid} = DbgiSupervisor.start_dmw_worker_horde(entity_id, :enterprise)

      :timer.sleep(@presence_settle_ms)

      presences = PresenceTracker.list("dmw:#{entity_id}")

      assert Enum.any?(presences, fn {key, meta} ->
               key == entity_id and meta[:wallet_type] == :enterprise
             end)
    end

    test "Horde-spawned DMWWorker responds to :get_tier matching ADR-0038 tier dispatch" do
      entity_id = unique_entity_id("horde_tier")

      {:ok, pid} = DbgiSupervisor.start_dmw_worker_horde(entity_id, :enterprise)

      assert :always_hot = GenServer.call(pid, :get_tier)
    end

    test "Horde-spawned DMWWorker responds to :get_state with wallet_type + tier" do
      entity_id = unique_entity_id("horde_state")

      {:ok, pid} = DbgiSupervisor.start_dmw_worker_horde(entity_id, :personal)

      state = GenServer.call(pid, :get_state)
      assert state.entity_id == entity_id
      assert state.wallet_type == :personal
      assert state.tier == :promote_on_activity
    end
  end

  # Helpers

  defp unique_entity_id(suffix) do
    "test_entity_#{suffix}_#{System.unique_integer([:positive])}"
  end

  defp cleanup_all_horde_dmw_workers do
    DbgiSupervisor.HordeDynamicSupervisor
    |> Horde.DynamicSupervisor.which_children()
    |> Enum.each(fn {_id, pid, _type, _modules} ->
      if is_pid(pid) and Process.alive?(pid) do
        Horde.DynamicSupervisor.terminate_child(
          DbgiSupervisor.HordeDynamicSupervisor,
          pid
        )
      end
    end)

    :timer.sleep(@presence_settle_ms)
  end
end
