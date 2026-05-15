defmodule DbgiSupervisor.Integration.ProcessGroupClusterTest do
  @moduledoc """
  Sub-phase 10 `[BEAM-DBGI-INTEGRATION-TESTS]` `:pg` cross-node
  membership canonical at substantive register per ADR-0030 §DBGI
  sub-phase 10 canonical.

  Tests `:pg` namespaced scope (DbgiSupervisor.PG) replicates process
  group membership across cluster canonical at modern OTP 23+ register
  per D-PHASE-8-PG-VS-GPROC-DISCRIMINATION 21st canonical
  substrate-build observation. `:pg` substantively CRDT-based at
  canonical-pattern register; cluster-aware by default substantively
  at substantive register.

  Parallels `process_group_test.exs` at single-node register at
  substantive register.

  Tagged `:integration` per Q4 Option α LOCKED canonical.

  ## References

  - ADR-0028 §3 (DBGI as supervised process groups)
  - ADR-0030 §DBGI sub-phase 10 (LANDED this commit)
  - ADR-0035 §9 (D-PHASE-8-PG-VS-GPROC-DISCRIMINATION 21st canonical)
  - DbgiSupervisor.ProcessGroup (sub-phase 8 canonical at substantive
    register)
  """

  use ExUnit.Case, async: false

  @moduletag :integration

  alias DbgiSupervisor.ClusterHelpers
  alias DbgiSupervisor.ProcessGroup

  setup_all do
    {peer, node} = ClusterHelpers.start_peer!(:dbgi_peer_pg)
    on_exit(fn -> ClusterHelpers.stop_peer!(peer) end)
    {:ok, peer: peer, node: node}
  end

  test ":pg join on peer visible on parent across cluster", %{node: node} do
    group = unique_group("peer_join")

    # Spawn long-lived process on peer via NAMED function in
    # DbgiSupervisor.ClusterHelpers (closure-free; loadable via
    # peer's code paths)
    peer_pid =
      Node.spawn_link(node, ClusterHelpers, :peer_pg_member_loop, [group, self()])

    assert_receive {:joined, ^peer_pid}, 1000

    # :pg substantively CRDT-replicates across cluster canonical at
    # substantive register; brief wait for sync at substantive register
    :timer.sleep(500)

    # Verify membership visible from parent's :pg view
    members = ProcessGroup.get_members(group)
    assert peer_pid in members

    send(peer_pid, :stop)
  end

  test ":pg join on parent visible on peer across cluster", %{node: node} do
    group = unique_group("parent_join")
    parent_test_pid = self()

    # Spawn a stable process on parent (not the test process) so we can stop it cleanly
    parent_member_pid =
      spawn_link(fn ->
        :pg.join(DbgiSupervisor.PG, group, self())
        send(parent_test_pid, {:joined, self()})

        receive do
          :stop -> :ok
        end
      end)

    assert_receive {:joined, ^parent_member_pid}, 1000

    :timer.sleep(500)

    # Verify membership visible on peer side via :rpc.call canonical
    # at Distributed Erlang register
    peer_members = :rpc.call(node, :pg, :get_members, [DbgiSupervisor.PG, group])
    assert parent_member_pid in peer_members

    send(parent_member_pid, :stop)
  end

  test ":pg leave on peer propagates to parent canonical", %{node: node} do
    group = unique_group("leave")

    peer_pid =
      Node.spawn_link(node, ClusterHelpers, :peer_pg_member_with_leave_loop, [group, self()])

    assert_receive {:joined, ^peer_pid}, 1000
    :timer.sleep(500)
    assert peer_pid in ProcessGroup.get_members(group)

    send(peer_pid, :leave)
    assert_receive :left, 1000
    :timer.sleep(500)

    refute peer_pid in ProcessGroup.get_members(group)

    send(peer_pid, :stop)
  end

  defp unique_group(prefix) do
    :"pg_cluster_#{prefix}_#{System.unique_integer([:positive])}"
  end
end
