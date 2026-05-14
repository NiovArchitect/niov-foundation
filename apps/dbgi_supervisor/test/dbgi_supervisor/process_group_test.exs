defmodule DbgiSupervisor.ProcessGroupTest do
  @moduledoc """
  Sub-phase 8 `[BEAM-DBGI-PROCESS-GROUPS]` substantive test surface
  at canonical register for `DbgiSupervisor.ProcessGroup` thin
  abstraction module over `:pg` OTP-native canonical at modern OTP
  23+ register.

  Tests verify the canonical API (`join/2` + `leave/2` +
  `get_members/1` + `which_groups/0` + `monitor/1`) at the
  substrate-coherent register against the `DbgiSupervisor.PG`
  namespaced scope (started by `DbgiSupervisor.Application`
  supervision tree).
  """

  use ExUnit.Case, async: false

  alias DbgiSupervisor.ProcessGroup

  describe "join/leave canonical" do
    test "calling process joins group + surfaces at get_members" do
      group = unique_group("join")
      :ok = ProcessGroup.join(group)
      assert self() in ProcessGroup.get_members(group)
    end

    test "calling process leaves group + surfaces empty at get_members" do
      group = unique_group("leave")
      :ok = ProcessGroup.join(group)
      :ok = ProcessGroup.leave(group)
      refute self() in ProcessGroup.get_members(group)
    end

    test "explicit pid joins group at canonical register" do
      group = unique_group("explicit_pid")
      pid = spawn(fn -> Process.sleep(:infinity) end)
      :ok = ProcessGroup.join(group, pid)
      assert pid in ProcessGroup.get_members(group)
      Process.exit(pid, :kill)
    end

    test "leave from group not joined surfaces :not_joined" do
      group = unique_group("not_joined")
      assert :not_joined = ProcessGroup.leave(group)
    end
  end

  describe "get_members + which_groups canonical" do
    test "empty group surfaces empty member list" do
      group = unique_group("empty")
      assert [] = ProcessGroup.get_members(group)
    end

    test "multiple pids in same group surface at get_members" do
      group = unique_group("multiple")
      pid1 = spawn(fn -> Process.sleep(:infinity) end)
      pid2 = spawn(fn -> Process.sleep(:infinity) end)
      :ok = ProcessGroup.join(group, pid1)
      :ok = ProcessGroup.join(group, pid2)
      members = ProcessGroup.get_members(group)
      assert pid1 in members
      assert pid2 in members
      Process.exit(pid1, :kill)
      Process.exit(pid2, :kill)
    end

    test "which_groups surfaces joined group at namespaced scope" do
      group = unique_group("which_groups")
      :ok = ProcessGroup.join(group)
      assert group in ProcessGroup.which_groups()
      :ok = ProcessGroup.leave(group)
    end

    test "get_local_members canonical at node-local register" do
      group = unique_group("local")
      :ok = ProcessGroup.join(group)
      assert self() in ProcessGroup.get_local_members(group)
    end
  end

  describe "monitor canonical" do
    test "monitor returns initial members tuple at canonical register" do
      group = unique_group("monitor_initial")
      :ok = ProcessGroup.join(group)
      {ref, members} = ProcessGroup.monitor(group)
      assert is_reference(ref)
      assert self() in members
    end

    test "monitor surfaces join event at canonical register" do
      group = unique_group("monitor_join")
      {ref, _members} = ProcessGroup.monitor(group)
      pid = spawn(fn -> Process.sleep(:infinity) end)
      :ok = ProcessGroup.join(group, pid)
      assert_receive {^ref, :join, ^group, [^pid]}, 1000
      Process.exit(pid, :kill)
    end
  end

  # Helper: generate unique group atom per test at substrate-coherent
  # register (avoid cross-test ETS state pollution per
  # D-PHASE-3-ETS-NOT-TRANSACTIONAL canonical at sub-phase 6b
  # substrate-build register).
  defp unique_group(prefix) do
    :"#{prefix}_#{System.unique_integer([:positive])}"
  end
end
