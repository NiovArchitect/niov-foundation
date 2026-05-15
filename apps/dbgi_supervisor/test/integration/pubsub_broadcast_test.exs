defmodule DbgiSupervisor.Integration.PubSubBroadcastTest do
  @moduledoc """
  Sub-phase 10 `[BEAM-DBGI-INTEGRATION-TESTS]` Phoenix.PubSub
  cross-node broadcast canonical at substantive register per
  ADR-0030 §DBGI sub-phase 10 canonical.

  Tests Phoenix.PubSub (DbgiSupervisor.PubSub; PG2 adapter substrate)
  broadcasts substantively span the cluster canonical at substantive
  register per ADR-0028 §3 substrate-architectural register +
  D-PHASE-9-PG2-VS-PG-COEXISTENCE 28th canonical (PG2 substrate at
  pub/sub topic routing register substantively coexists with modern
  `:pg` substrate at distributed process-group register).

  Parallels `pubsub_test.exs` at single-node register.

  Tagged `:integration` per Q4 Option α LOCKED canonical.

  ## References

  - ADR-0028 §3 (multi-region BEAM clustering canonical)
  - ADR-0030 §DBGI sub-phase 10 (LANDED this commit)
  - ADR-0035 §9 (D-PHASE-9-PG2-VS-PG-COEXISTENCE 28th canonical)
  - DbgiSupervisor.PubSub (sub-phase 9 canonical)
  - https://hexdocs.pm/phoenix_pubsub/Phoenix.PubSub.html
  """

  use ExUnit.Case, async: false

  @moduletag :integration

  alias DbgiSupervisor.ClusterHelpers

  setup_all do
    {peer, node} = ClusterHelpers.start_peer!(:dbgi_peer_pubsub)
    on_exit(fn -> ClusterHelpers.stop_peer!(peer) end)
    {:ok, peer: peer, node: node}
  end

  test "broadcast/3 from parent reaches subscriber on peer canonical", %{node: node} do
    topic = unique_topic("parent_to_peer")

    # Spawn subscriber on peer via NAMED function in ClusterHelpers
    listener_pid =
      Node.spawn_link(node, ClusterHelpers, :peer_subscribe_relay, [topic, self()])

    assert_receive :subscribed, 1000
    # Brief wait for subscription to register cluster-wide at canonical
    # PG2 register substantively at substantive register
    :timer.sleep(100)

    :ok = Phoenix.PubSub.broadcast(DbgiSupervisor.PubSub, topic, {:hello, :from_parent})

    assert_receive {:peer_received, {:hello, :from_parent}}, 2000
    _ = listener_pid
  end

  test "broadcast/3 from peer reaches subscriber on parent canonical", %{node: node} do
    topic = unique_topic("peer_to_parent")
    parent = self()

    # Subscribe on parent
    parent_subscriber_pid =
      spawn_link(fn ->
        :ok = Phoenix.PubSub.subscribe(DbgiSupervisor.PubSub, topic)
        send(parent, :subscribed)

        receive do
          msg -> send(parent, {:parent_received, msg})
        end
      end)

    assert_receive :subscribed, 1000
    :timer.sleep(100)

    # Broadcast from peer via :rpc.call canonical at Distributed
    # Erlang register
    :ok =
      :rpc.call(node, Phoenix.PubSub, :broadcast, [
        DbgiSupervisor.PubSub,
        topic,
        {:hello, :from_peer}
      ])

    assert_receive {:parent_received, {:hello, :from_peer}}, 2000
    _ = parent_subscriber_pid
  end

  test "local_broadcast/3 stays node-local canonical at substantive register", %{node: node} do
    topic = unique_topic("local_only")

    # Subscribe on peer via NAMED function with timeout
    listener_pid =
      Node.spawn_link(node, ClusterHelpers, :peer_subscribe_relay_with_timeout, [
        topic,
        self(),
        1500
      ])

    assert_receive :subscribed, 1000
    :timer.sleep(100)

    # local_broadcast/3 from parent — peer should NOT receive
    :ok = Phoenix.PubSub.local_broadcast(DbgiSupervisor.PubSub, topic, {:local_only, :payload})

    # Peer subscriber's after-block fires at 1500ms
    assert_receive :peer_timeout, 2500
    _ = listener_pid
  end

  defp unique_topic(prefix) do
    "pubsub_cluster_#{prefix}_#{System.unique_integer([:positive])}"
  end
end
