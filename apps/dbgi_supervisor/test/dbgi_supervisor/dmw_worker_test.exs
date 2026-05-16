defmodule DbgiSupervisor.DMWWorkerTest do
  @moduledoc """
  Tests for DbgiSupervisor.DMWWorker per ADR-0038 Sub-decision 8.

  Test pattern follows DbgiSupervisor.PresenceTrackerTest precedent
  (use ExUnit.Case, async: false + :timer.sleep(200) for Phoenix.Tracker
  CRDT eventual consistency + unique_entity_id/1 helper).
  """

  use ExUnit.Case, async: false

  alias DbgiSupervisor.{DMWWorker, PresenceTracker}

  @presence_settle_ms 200

  setup do
    on_exit(fn -> cleanup_all_dmw_workers() end)
    :ok
  end

  describe "start_dmw_worker/2 lifecycle" do
    test "spawns DMWWorker via DynamicSupervisor for ENTERPRISE wallet" do
      entity_id = unique_entity_id("enterprise")

      assert {:ok, pid} = DbgiSupervisor.start_dmw_worker(entity_id, :enterprise)
      assert Process.alive?(pid)
    end

    test "Registry lookup returns the spawned PID" do
      entity_id = unique_entity_id("registry")

      {:ok, pid} = DbgiSupervisor.start_dmw_worker(entity_id, :enterprise)

      assert {:ok, ^pid} = DbgiSupervisor.whereis_dmw_worker(entity_id)
    end

    test "duplicate entity_id returns {:error, {:already_started, pid}}" do
      entity_id = unique_entity_id("duplicate")

      {:ok, pid} = DbgiSupervisor.start_dmw_worker(entity_id, :enterprise)

      assert {:error, {:already_started, ^pid}} =
               DbgiSupervisor.start_dmw_worker(entity_id, :enterprise)
    end

    test "parallel DMWWorkers for distinct entity_ids coexist" do
      entity_a = unique_entity_id("parallel_a")
      entity_b = unique_entity_id("parallel_b")

      {:ok, pid_a} = DbgiSupervisor.start_dmw_worker(entity_a, :enterprise)
      {:ok, pid_b} = DbgiSupervisor.start_dmw_worker(entity_b, :personal)

      assert pid_a != pid_b
      assert Process.alive?(pid_a)
      assert Process.alive?(pid_b)
      assert {:ok, ^pid_a} = DbgiSupervisor.whereis_dmw_worker(entity_a)
      assert {:ok, ^pid_b} = DbgiSupervisor.whereis_dmw_worker(entity_b)
    end

    test "stop_dmw_worker terminates the DMWWorker and clears Registry" do
      entity_id = unique_entity_id("stop")

      {:ok, pid} = DbgiSupervisor.start_dmw_worker(entity_id, :enterprise)
      assert Process.alive?(pid)

      assert :ok = DbgiSupervisor.stop_dmw_worker(entity_id)

      :timer.sleep(50)

      refute Process.alive?(pid)
      assert :error = DbgiSupervisor.whereis_dmw_worker(entity_id)
    end

    test "stop_dmw_worker returns :error when no DMWWorker is running" do
      assert :error =
               DbgiSupervisor.stop_dmw_worker(unique_entity_id("nonexistent"))
    end

    test "stop-then-restart resilience: same entity_id gets new PID" do
      entity_id = unique_entity_id("restart")

      {:ok, pid_1} = DbgiSupervisor.start_dmw_worker(entity_id, :enterprise)
      assert :ok = DbgiSupervisor.stop_dmw_worker(entity_id)
      :timer.sleep(50)

      {:ok, pid_2} = DbgiSupervisor.start_dmw_worker(entity_id, :enterprise)

      assert pid_1 != pid_2
      assert Process.alive?(pid_2)
      assert {:ok, ^pid_2} = DbgiSupervisor.whereis_dmw_worker(entity_id)
    end
  end

  describe "Phoenix.Tracker presence integration" do
    test "presence tracked after init/1 (CRDT settle)" do
      entity_id = unique_entity_id("presence_init")

      {:ok, _pid} = DbgiSupervisor.start_dmw_worker(entity_id, :enterprise)

      :timer.sleep(@presence_settle_ms)

      presences = PresenceTracker.list("dmw:#{entity_id}")
      assert Enum.any?(presences, fn {key, meta} ->
               key == entity_id and meta[:wallet_type] == :enterprise
             end)
    end

    test "presence cleared after terminate/2 (CRDT settle)" do
      entity_id = unique_entity_id("presence_terminate")

      {:ok, _pid} = DbgiSupervisor.start_dmw_worker(entity_id, :enterprise)
      :timer.sleep(@presence_settle_ms)

      :ok = DbgiSupervisor.stop_dmw_worker(entity_id)
      :timer.sleep(@presence_settle_ms)

      assert [] = PresenceTracker.list("dmw:#{entity_id}")
    end
  end

  describe "tier dispatch per ADR-0038 Sub-decision 3" do
    test ":enterprise wallet -> :always_hot tier" do
      entity_id = unique_entity_id("tier_enterprise")

      {:ok, pid} = DbgiSupervisor.start_dmw_worker(entity_id, :enterprise)

      assert :always_hot = GenServer.call(pid, :get_tier)
    end

    test ":personal wallet -> :promote_on_activity tier" do
      entity_id = unique_entity_id("tier_personal")

      {:ok, pid} = DbgiSupervisor.start_dmw_worker(entity_id, :personal)

      assert :promote_on_activity = GenServer.call(pid, :get_tier)
    end

    test ":device wallet -> :always_cold_shard tier" do
      entity_id = unique_entity_id("tier_device")

      {:ok, pid} = DbgiSupervisor.start_dmw_worker(entity_id, :device)

      assert :always_cold_shard = GenServer.call(pid, :get_tier)
    end

    test "tier_for/1 returns error for invalid wallet_type" do
      assert {:error, {:invalid_wallet_type, :invalid}} =
               DMWWorker.tier_for(:invalid)
    end
  end

  # Helpers

  defp unique_entity_id(suffix) do
    "test_entity_#{suffix}_#{System.unique_integer([:positive])}"
  end

  defp cleanup_all_dmw_workers do
    DynamicSupervisor.which_children(DbgiSupervisor.DynamicSupervisor)
    |> Enum.each(fn {_id, pid, _type, _modules} ->
      if is_pid(pid) and Process.alive?(pid) do
        DynamicSupervisor.terminate_child(
          DbgiSupervisor.DynamicSupervisor,
          pid
        )
      end
    end)

    :timer.sleep(@presence_settle_ms)
  end
end
