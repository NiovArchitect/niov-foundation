defmodule DbgiSupervisor.PubSubTest do
  @moduledoc """
  Sub-phase 9 `[BEAM-DBGI-LIBCLUSTER]` substantive test surface for
  `DbgiSupervisor.PubSub` (Phoenix.PubSub cross-node messaging
  canonical per ADR-0028 §3 substrate-architectural register).

  Single-node tier — multi-node cross-cluster broadcast forward-queued
  to sub-phase 10 `[BEAM-DBGI-INTEGRATION-TESTS]` per ADR-0030 §DBGI
  canonical at substrate-architectural register.

  ## References

  - ADR-0028 §3 (BEAM Coordination Layer)
  - ADR-0030 §DBGI Supervisor Layer (sub-phase 9 amendment LANDS
    this commit)
  - https://hexdocs.pm/phoenix_pubsub/Phoenix.PubSub.html
  """

  use ExUnit.Case, async: false

  describe "Phoenix.PubSub broadcast/subscribe canonical" do
    test "subscribe + broadcast + receive canonical at substantive register" do
      topic = unique_topic("broadcast")
      :ok = Phoenix.PubSub.subscribe(DbgiSupervisor.PubSub, topic)
      :ok = Phoenix.PubSub.broadcast(DbgiSupervisor.PubSub, topic, {:test, :hello})
      assert_receive {:test, :hello}, 1000
    end

    test "unsubscribe canonical at substantive register" do
      topic = unique_topic("unsubscribe")
      :ok = Phoenix.PubSub.subscribe(DbgiSupervisor.PubSub, topic)
      :ok = Phoenix.PubSub.unsubscribe(DbgiSupervisor.PubSub, topic)
      :ok = Phoenix.PubSub.broadcast(DbgiSupervisor.PubSub, topic, {:should_not_arrive})
      refute_receive {:should_not_arrive}, 500
    end

    test "multiple subscribers receive same broadcast at canonical register" do
      topic = unique_topic("fanout")
      task1 = Task.async(fn ->
        :ok = Phoenix.PubSub.subscribe(DbgiSupervisor.PubSub, topic)
        receive do
          {:fanout, msg} -> msg
        after
          1000 -> :timeout
        end
      end)

      task2 = Task.async(fn ->
        :ok = Phoenix.PubSub.subscribe(DbgiSupervisor.PubSub, topic)
        receive do
          {:fanout, msg} -> msg
        after
          1000 -> :timeout
        end
      end)

      # Give subscribers time to register
      :timer.sleep(100)

      :ok = Phoenix.PubSub.broadcast(DbgiSupervisor.PubSub, topic, {:fanout, :payload})

      assert Task.await(task1) == :payload
      assert Task.await(task2) == :payload
    end
  end

  defp unique_topic(prefix) do
    "pubsub_#{prefix}_#{System.unique_integer([:positive])}"
  end
end
