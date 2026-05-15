defmodule DbgiSupervisor.Integration.PresenceReplicationTest do
  @moduledoc """
  Sub-phase 10 `[BEAM-DBGI-INTEGRATION-TESTS]` Phoenix.Tracker
  CRDT replication across cluster canonical at substantive register
  per ADR-0030 §DBGI sub-phase 10 canonical.

  Tests Phoenix.Tracker (DbgiSupervisor.PresenceTracker) substantively
  replicates presence state across cluster nodes via heartbeat protocol
  + CRDT canonical at "eventually consistent, conflict-free" register
  per ADR-0028 §3 substrate-architectural register.

  Default `:broadcast_period` 1500ms preserved per Q3 Option α
  LOCKED canonical (substrate-honest at production-coherence
  register); tests wait substantively per
  D-PHASE-10-MULTI-NODE-TEST-RUNTIME-BUDGET 30th canonical
  substrate-build observation.

  Parallels `presence_tracker_test.exs` at single-node register.

  Tagged `:integration` per Q4 Option α LOCKED canonical.

  ## References

  - ADR-0028 §3 ("CRDT-backed state where the workload permits")
  - ADR-0030 §DBGI sub-phase 10 (LANDED this commit)
  - ADR-0035 §9 (D-PHASE-10-MULTI-NODE-TEST-RUNTIME-BUDGET 30th
    + D-PHOENIX-TRACKER-PHX-REF-META-INJECTION 29th canonicals)
  - DbgiSupervisor.PresenceTracker (sub-phase 9 canonical)
  - https://hexdocs.pm/phoenix_pubsub/Phoenix.Tracker.html
  """

  use ExUnit.Case, async: false

  @moduletag :integration

  # CRDT replication wait budget canonical at substantive register per
  # D-PHASE-10-MULTI-NODE-TEST-RUNTIME-BUDGET 30th canonical:
  # Phoenix.Tracker `:broadcast_period` default 1500ms; allow > 1
  # heartbeat cycle for cluster-wide convergence.
  @crdt_wait_ms 2500

  alias DbgiSupervisor.{ClusterHelpers, PresenceTracker}

  setup_all do
    {peer, node} = ClusterHelpers.start_peer!(:dbgi_peer_presence)
    on_exit(fn -> ClusterHelpers.stop_peer!(peer) end)
    {:ok, peer: peer, node: node}
  end

  test "Phoenix.Tracker presence on peer replicates to parent canonical", %{node: node} do
    topic = unique_topic("peer_to_parent")

    # Spawn process on peer via NAMED function in ClusterHelpers
    # (closure-free; loadable via peer's code paths)
    peer_pid =
      Node.spawn_link(node, ClusterHelpers, :peer_track_loop, [
        topic,
        "peer_user",
        %{loc: "peer_node"},
        self()
      ])

    assert_receive {:tracked, ^peer_pid}, 1000

    # Wait for CRDT replication (default broadcast_period 1500ms)
    :timer.sleep(@crdt_wait_ms)

    # Verify presence visible on parent's tracker view
    parent_list = PresenceTracker.list(topic)
    parent_meta_map = Map.new(parent_list)

    assert Map.has_key?(parent_meta_map, "peer_user")
    assert parent_meta_map["peer_user"].loc == "peer_node"

    send(peer_pid, :stop)
  end

  test "Phoenix.Tracker presence on parent replicates to peer canonical", %{node: node} do
    topic = unique_topic("parent_to_peer")
    parent_test_pid = self()

    parent_member_pid =
      spawn_link(fn ->
        {:ok, _ref} =
          PresenceTracker.track(self(), topic, "parent_user", %{loc: "parent_node"})

        send(parent_test_pid, {:tracked, self()})

        receive do
          :stop -> :ok
        end
      end)

    assert_receive {:tracked, ^parent_member_pid}, 1000

    :timer.sleep(@crdt_wait_ms)

    # Verify presence visible on peer side via :rpc.call canonical
    # at Distributed Erlang register
    peer_list = :rpc.call(node, PresenceTracker, :list, [topic])
    peer_meta_map = Map.new(peer_list)

    assert Map.has_key?(peer_meta_map, "parent_user")
    assert peer_meta_map["parent_user"].loc == "parent_node"

    send(parent_member_pid, :stop)
  end

  test "Phoenix.Tracker untrack on peer propagates to parent canonical", %{node: node} do
    topic = unique_topic("untrack_propagation")

    peer_pid =
      Node.spawn_link(node, ClusterHelpers, :peer_track_untrack_loop, [
        topic,
        "ephemeral_user",
        %{role: "test"},
        self()
      ])

    assert_receive {:tracked, ^peer_pid}, 1000
    :timer.sleep(@crdt_wait_ms)

    parent_keys =
      PresenceTracker.list(topic)
      |> Enum.map(fn {k, _meta} -> k end)

    assert "ephemeral_user" in parent_keys

    send(peer_pid, :untrack)
    assert_receive :untracked, 1000
    :timer.sleep(@crdt_wait_ms)

    parent_keys_post =
      PresenceTracker.list(topic)
      |> Enum.map(fn {k, _meta} -> k end)

    refute "ephemeral_user" in parent_keys_post

    send(peer_pid, :stop)
  end

  defp unique_topic(prefix) do
    "presence_cluster_#{prefix}_#{System.unique_integer([:positive])}"
  end
end
