defmodule DbgiSupervisor.RegistryTest do
  @moduledoc """
  Sub-phase 8 `[BEAM-DBGI-PROCESS-GROUPS]` substantive test surface
  at canonical register for `DbgiSupervisor.Registry` +
  `DbgiSupervisor.DynamicSupervisor` combined+siloed canonical per
  ADR-0028 §3 + ADR-0030 §DBGI canonical at substantive register.

  Tests verify the canonical pattern: `Registry` `:unique` keys for
  one-DMW-one-process addressing + `DynamicSupervisor` for dynamic
  per-DMW process lifecycle, both supervised by
  `DbgiSupervisor.Application` at substrate-coherent register.
  """

  use ExUnit.Case, async: false

  describe "Registry canonical at :unique keys register" do
    test "Registry process alive at canonical register" do
      assert is_pid(Process.whereis(DbgiSupervisor.Registry))
    end

    test "register + lookup canonical at via-tuple register" do
      key = unique_key("register")
      {:ok, _} = Registry.register(DbgiSupervisor.Registry, key, nil)
      [{pid_registered, _value}] = Registry.lookup(DbgiSupervisor.Registry, key)
      assert pid_registered == self()
    end

    test "unique key enforcement at canonical register" do
      key = unique_key("unique")
      {:ok, _} = Registry.register(DbgiSupervisor.Registry, key, nil)

      assert {:error, {:already_registered, _}} =
               Registry.register(DbgiSupervisor.Registry, key, nil)
    end

    test "via-tuple canonical for process naming" do
      key = unique_key("via_tuple")
      name = {:via, Registry, {DbgiSupervisor.Registry, key}}
      {:ok, pid} = Agent.start_link(fn -> 42 end, name: name)
      assert Agent.get(name, fn state -> state end) == 42
      Agent.stop(pid)
    end
  end

  describe "DynamicSupervisor canonical at per-DMW lifecycle register" do
    test "DynamicSupervisor process alive at canonical register" do
      assert is_pid(Process.whereis(DbgiSupervisor.DynamicSupervisor))
    end

    test "start_child + which_children canonical at substantive register" do
      child_spec = %{
        id: :test_child,
        start: {Task, :start_link, [fn -> Process.sleep(:infinity) end]},
        restart: :temporary
      }

      {:ok, pid} = DynamicSupervisor.start_child(DbgiSupervisor.DynamicSupervisor, child_spec)
      assert is_pid(pid)

      children = DynamicSupervisor.which_children(DbgiSupervisor.DynamicSupervisor)
      assert Enum.any?(children, fn {_, child_pid, _, _} -> child_pid == pid end)

      :ok = DynamicSupervisor.terminate_child(DbgiSupervisor.DynamicSupervisor, pid)
    end

    test "terminate_child canonical at substantive register" do
      child_spec = %{
        id: :test_terminate,
        start: {Task, :start_link, [fn -> Process.sleep(:infinity) end]},
        restart: :temporary
      }

      {:ok, pid} = DynamicSupervisor.start_child(DbgiSupervisor.DynamicSupervisor, child_spec)
      :ok = DynamicSupervisor.terminate_child(DbgiSupervisor.DynamicSupervisor, pid)
      refute Process.alive?(pid)
    end
  end

  # Helper: generate unique key per test at substrate-coherent register.
  defp unique_key(prefix) do
    {prefix, System.unique_integer([:positive])}
  end
end
