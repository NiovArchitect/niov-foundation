defmodule CollaborationSupervisor.CollaborationProcessTest do
  use ExUnit.Case, async: false

  alias CollaborationSupervisor.CollaborationProcess

  setup do
    registry = :"test_registry_#{System.unique_integer([:positive])}"
    dyn_sup = :"test_dyn_sup_#{System.unique_integer([:positive])}"

    start_supervised!({Registry, keys: :unique, name: registry})

    start_supervised!(%{
      id: dyn_sup,
      start: {DynamicSupervisor, :start_link, [[strategy: :one_for_one, name: dyn_sup]]}
    })

    %{registry: registry, dyn_sup: dyn_sup}
  end

  test "start_for is idempotent for the same collaboration id", %{
    registry: registry,
    dyn_sup: dyn_sup
  } do
    id = "collab-1"

    {:ok, pid_a} =
      CollaborationProcess.start_for(id, registry: registry, dynamic_supervisor: dyn_sup)

    {:ok, pid_b} =
      CollaborationProcess.start_for(id, registry: registry, dynamic_supervisor: dyn_sup)

    assert pid_a == pid_b
  end

  test "observe persists state across calls", %{registry: registry, dyn_sup: dyn_sup} do
    id = "collab-2"

    {:ok, _pid} =
      CollaborationProcess.start_for(id, registry: registry, dynamic_supervisor: dyn_sup)

    :ok =
      CollaborationProcess.observe(id, :accepted, false,
        registry: registry,
        dynamic_supervisor: dyn_sup
      )

    assert {:ok, state} = CollaborationProcess.get_status(id, registry: registry)
    assert state.observed_state == :accepted
    assert state.has_blocked_reason == false

    :ok =
      CollaborationProcess.observe(id, :blocked, true,
        registry: registry,
        dynamic_supervisor: dyn_sup
      )

    assert {:ok, state2} = CollaborationProcess.get_status(id, registry: registry)
    assert state2.observed_state == :blocked
    assert state2.has_blocked_reason == true
  end

  test "get_status returns :not_found for unknown id", %{registry: registry} do
    assert :not_found = CollaborationProcess.get_status("never-spawned", registry: registry)
  end

  test "observe by id auto-spawns the process", %{registry: registry, dyn_sup: dyn_sup} do
    id = "collab-3"
    assert :not_found = CollaborationProcess.get_status(id, registry: registry)

    :ok =
      CollaborationProcess.observe(id, :requested, false,
        registry: registry,
        dynamic_supervisor: dyn_sup
      )

    assert {:ok, state} = CollaborationProcess.get_status(id, registry: registry)
    assert state.observed_state == :requested
  end

  test "parallel collaborations don't interfere", %{registry: registry, dyn_sup: dyn_sup} do
    ids = ["a", "b", "c", "d", "e"]

    tasks =
      for id <- ids do
        Task.async(fn ->
          :ok =
            CollaborationProcess.observe(id, :accepted, false,
              registry: registry,
              dynamic_supervisor: dyn_sup
            )

          id
        end)
      end

    Enum.each(tasks, &Task.await/1)

    for id <- ids do
      assert {:ok, state} = CollaborationProcess.get_status(id, registry: registry)
      assert state.observed_state == :accepted
      assert state.collaboration_id == id
    end
  end
end
