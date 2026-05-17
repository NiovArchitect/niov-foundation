defmodule DbgiSupervisor.HordeSubstrateTest do
  @moduledoc """
  Tests for the Horde Registry + Horde DynamicSupervisor distributed
  substrate per ADR-0039 Sub-decision 1.

  ## Test isolation pattern per ADR-0034 testability-refactor

  Each test creates its own isolated Horde.Registry +
  Horde.DynamicSupervisor instance via start_supervised! with unique
  names. This isolates Horde tests from distribution-mode transitions
  in other integration tests (:peer.start activations at sub-phase 10
  substrate register substantively).

  Public API at canonical-architectural register substantively accepts
  :registry and :supervisor keyword opts per ADR-0034; tests pass the
  isolated names canonical at canonical-execution register substantively.

  ## Quorum wait pattern

  Each test calls Horde.DynamicSupervisor.wait_for_quorum/2 after
  start_supervised! to ensure CRDT membership has converged before
  spawning children. Canonical Horde 0.10 test pattern per
  hexdocs.pm/horde/Horde.DynamicSupervisor.html.

  ## References

  - ADR-0039 Sub-decision 1 (Horde substrate with members: :auto)
  - ADR-0034 (BEAM testability discipline; name-configurable + start_supervised!)
  - ADR-0038 Sub-decisions 1-5 (DMWWorker substrate canonical at sub-phase a)
  """

  use ExUnit.Case, async: false

  setup do
    unique = System.unique_integer([:positive])
    test_registry = :"test_horde_registry_#{unique}"
    test_supervisor = :"test_horde_supervisor_#{unique}"

    start_supervised!(
      {Horde.Registry, [name: test_registry, keys: :unique, members: :auto]}
    )

    start_supervised!(
      {Horde.DynamicSupervisor,
       [
         name: test_supervisor,
         strategy: :one_for_one,
         distribution_strategy: Horde.UniformDistribution,
         members: :auto
       ]}
    )

    :ok = Horde.DynamicSupervisor.wait_for_quorum(test_supervisor, 5_000)

    {:ok, registry: test_registry, supervisor: test_supervisor}
  end

  describe "start_dmw_worker_horde/3" do
    test "lazy-spawns DMWWorker for ENTERPRISE entity_id",
         %{registry: reg, supervisor: sup} do
      entity_id = "ent-#{System.unique_integer([:positive])}"

      assert {:ok, pid} =
               DbgiSupervisor.start_dmw_worker_horde(entity_id, :enterprise,
                 registry: reg,
                 supervisor: sup
               )

      assert is_pid(pid)
      assert Process.alive?(pid)
    end

    test "is idempotent: second call returns existing pid",
         %{registry: reg, supervisor: sup} do
      entity_id = "ent-#{System.unique_integer([:positive])}"

      assert {:ok, pid1} =
               DbgiSupervisor.start_dmw_worker_horde(entity_id, :enterprise,
                 registry: reg,
                 supervisor: sup
               )

      assert {:ok, pid2} =
               DbgiSupervisor.start_dmw_worker_horde(entity_id, :enterprise,
                 registry: reg,
                 supervisor: sup
               )

      assert pid1 == pid2
    end

    test "spawns separate workers for distinct entity_ids",
         %{registry: reg, supervisor: sup} do
      entity_a = "ent-a-#{System.unique_integer([:positive])}"
      entity_b = "ent-b-#{System.unique_integer([:positive])}"

      assert {:ok, pid_a} =
               DbgiSupervisor.start_dmw_worker_horde(entity_a, :enterprise,
                 registry: reg,
                 supervisor: sup
               )

      assert {:ok, pid_b} =
               DbgiSupervisor.start_dmw_worker_horde(entity_b, :enterprise,
                 registry: reg,
                 supervisor: sup
               )

      assert pid_a != pid_b
      assert Process.alive?(pid_a)
      assert Process.alive?(pid_b)
    end

    test "supports :personal wallet_type", %{registry: reg, supervisor: sup} do
      entity_id = "ent-#{System.unique_integer([:positive])}"

      assert {:ok, pid} =
               DbgiSupervisor.start_dmw_worker_horde(entity_id, :personal,
                 registry: reg,
                 supervisor: sup
               )

      assert is_pid(pid)
    end

    test "supports :device wallet_type", %{registry: reg, supervisor: sup} do
      entity_id = "ent-#{System.unique_integer([:positive])}"

      assert {:ok, pid} =
               DbgiSupervisor.start_dmw_worker_horde(entity_id, :device,
                 registry: reg,
                 supervisor: sup
               )

      assert is_pid(pid)
    end
  end

  describe "whereis_dmw_worker_horde/2" do
    test "returns :error when no DMWWorker is registered", %{registry: reg} do
      entity_id = "ent-#{System.unique_integer([:positive])}"

      assert :error = DbgiSupervisor.whereis_dmw_worker_horde(entity_id, registry: reg)
    end

    test "returns {:ok, pid} after start_dmw_worker_horde succeeds",
         %{registry: reg, supervisor: sup} do
      entity_id = "ent-#{System.unique_integer([:positive])}"

      assert {:ok, spawn_pid} =
               DbgiSupervisor.start_dmw_worker_horde(entity_id, :enterprise,
                 registry: reg,
                 supervisor: sup
               )

      assert {:ok, lookup_pid} =
               DbgiSupervisor.whereis_dmw_worker_horde(entity_id, registry: reg)

      assert spawn_pid == lookup_pid
    end
  end

  describe "DMWWorker substrate integration" do
    test "spawned DMWWorker preserves entity_id + wallet_type per ADR-0038",
         %{registry: reg, supervisor: sup} do
      entity_id = "ent-#{System.unique_integer([:positive])}"

      assert {:ok, pid} =
               DbgiSupervisor.start_dmw_worker_horde(entity_id, :enterprise,
                 registry: reg,
                 supervisor: sup
               )

      state = GenServer.call(pid, :get_state)
      assert state.entity_id == entity_id
      assert state.wallet_type == :enterprise
    end
  end

  describe "stop_dmw_worker_horde/2 per sub-arc 1 sub-phase c C.2 Option α" do
    test "returns :ok for non-existent entity_id (idempotent)", %{registry: reg, supervisor: sup} do
      entity_id = "ent-stop-nonexistent-#{System.unique_integer([:positive])}"

      assert :ok =
               DbgiSupervisor.stop_dmw_worker_horde(entity_id,
                 registry: reg,
                 supervisor: sup
               )
    end

    test "terminates existing DMWWorker + clears Horde.Registry",
         %{registry: reg, supervisor: sup} do
      entity_id = "ent-stop-existing-#{System.unique_integer([:positive])}"

      assert {:ok, pid} =
               DbgiSupervisor.start_dmw_worker_horde(entity_id, :enterprise,
                 registry: reg,
                 supervisor: sup
               )

      assert {:ok, ^pid} =
               DbgiSupervisor.whereis_dmw_worker_horde(entity_id, registry: reg)

      assert :ok =
               DbgiSupervisor.stop_dmw_worker_horde(entity_id,
                 registry: reg,
                 supervisor: sup
               )

      # CRDT-coordinated termination canonical at canonical-execution
      # register substantively; allow eventual consistency settle.
      :timer.sleep(50)

      assert :error =
               DbgiSupervisor.whereis_dmw_worker_horde(entity_id, registry: reg)
    end

    test "idempotent on second call after termination",
         %{registry: reg, supervisor: sup} do
      entity_id = "ent-stop-idempotent-#{System.unique_integer([:positive])}"

      assert {:ok, _pid} =
               DbgiSupervisor.start_dmw_worker_horde(entity_id, :enterprise,
                 registry: reg,
                 supervisor: sup
               )

      assert :ok =
               DbgiSupervisor.stop_dmw_worker_horde(entity_id,
                 registry: reg,
                 supervisor: sup
               )

      :timer.sleep(50)

      # Second stop on already-terminated worker returns :ok
      assert :ok =
               DbgiSupervisor.stop_dmw_worker_horde(entity_id,
                 registry: reg,
                 supervisor: sup
               )
    end

    test "honors custom registry + supervisor opts per ADR-0034",
         %{registry: reg, supervisor: sup} do
      entity_id = "ent-stop-opts-#{System.unique_integer([:positive])}"

      assert {:ok, _pid} =
               DbgiSupervisor.start_dmw_worker_horde(entity_id, :enterprise,
                 registry: reg,
                 supervisor: sup
               )

      # Pass the same isolated test instances; substrate-coherent at
      # ADR-0034 testability discipline register substantively.
      assert :ok =
               DbgiSupervisor.stop_dmw_worker_horde(entity_id,
                 registry: reg,
                 supervisor: sup
               )
    end
  end
end
