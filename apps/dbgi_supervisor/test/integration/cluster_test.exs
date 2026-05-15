defmodule DbgiSupervisor.Integration.ClusterTest do
  @moduledoc """
  Sub-phase 10 `[BEAM-DBGI-INTEGRATION-TESTS]` cluster formation +
  failover semantics canonical at substantive register per ADR-0030
  §DBGI sub-phase 10 canonical (LANDED this commit per amendment
  pattern at substantive register).

  Tests parent ↔ peer cluster connectivity via distributed Erlang
  canonical + Cluster.Supervisor process aliveness on both nodes
  bidirectional. Partition tolerance + failover semantics
  forward-queued per D-PHASE-10-DISCONNECT-TEST-CASCADE 32nd
  canonical substrate-build observation (ADR-0035 §9) at substantive
  register.

  Tagged `:integration` per Q4 Option α LOCKED canonical (cosmp_router
  sub-phase 5b-iii pattern at substantive register). Default
  `mix test` excludes; opt-in via `mix test --include integration`.

  ## References

  - ADR-0028 §3 (multi-region BEAM clustering canonical)
  - ADR-0030 §DBGI sub-phase 10 (LANDED this commit)
  - ADR-0035 §9 (D-PHASE-10-MULTI-NODE-TEST-RUNTIME-BUDGET 30th +
    D-PHASE-10-PEER-VS-LOCAL-CLUSTER-DISCRIMINATION 31st canonicals)
  - DbgiSupervisor.ClusterHelpers (test/support/cluster_helpers.ex)
  """

  use ExUnit.Case, async: false

  @moduletag :integration

  alias DbgiSupervisor.ClusterHelpers

  setup_all do
    {peer, node} = ClusterHelpers.start_peer!(:dbgi_peer_cluster)
    on_exit(fn -> ClusterHelpers.stop_peer!(peer) end)
    {:ok, peer: peer, node: node}
  end

  test "parent + peer connected via distributed Erlang canonical", %{node: node} do
    assert node in Node.list()
  end

  test "peer sees parent canonical at substantive register", %{node: node} do
    parent_visible_on_peer = :rpc.call(node, Node, :list, [])
    assert Node.self() in parent_visible_on_peer
  end

  test "Cluster.Supervisor alive on parent canonical" do
    assert is_pid(Process.whereis(DbgiSupervisor.ClusterSupervisor))
  end

  test "Cluster.Supervisor alive on peer canonical at substantive register", %{node: node} do
    peer_supervisor_pid =
      :rpc.call(node, Process, :whereis, [DbgiSupervisor.ClusterSupervisor])

    assert is_pid(peer_supervisor_pid)
  end
end
