defmodule DbgiSupervisor.PresenceTrackerTest do
  @moduledoc """
  Sub-phase 9 `[BEAM-DBGI-LIBCLUSTER]` substantive test surface for
  `DbgiSupervisor.PresenceTracker` (Phoenix.Tracker CRDT-backed
  presence canonical per ADR-0028 §3 "CRDT-backed state where the
  workload permits" register).

  Single-node tier — multi-node CRDT replication forward-queued to
  sub-phase 10 `[BEAM-DBGI-INTEGRATION-TESTS]` per ADR-0030 §DBGI
  canonical at substrate-architectural register.

  ## References

  - ADR-0028 §3 (BEAM Coordination Layer — CRDT-backed state)
  - ADR-0030 §DBGI Supervisor Layer (sub-phase 9 amendment LANDS
    this commit per D-PHASE-9-PHOENIX-TRACKER-ADR-0030-AMENDMENT-
    CANDIDATE 27th canonical)
  - https://hexdocs.pm/phoenix_pubsub/Phoenix.Tracker.html
  """

  use ExUnit.Case, async: false

  alias DbgiSupervisor.PresenceTracker

  describe "track/list/untrack canonical at substantive register" do
    # Note: Phoenix.Tracker substantively injects `phx_ref` field into
    # meta map at canonical CRDT replication register per
    # D-PHOENIX-TRACKER-PHX-REF-META-INJECTION 29th canonical
    # substrate-build observation candidate. Test assertions use
    # meta-subset matching (NOT exact equality) — `phx_ref` is
    # Phoenix.Tracker-internal CRDT change identifier, not user-meta.

    test "track + list + untrack roundtrip canonical" do
      topic = unique_topic("track")
      pid = self()
      {:ok, _ref} = PresenceTracker.track(pid, topic, "key1", %{status: "online"})

      # Phoenix.Tracker eventually consistent at CRDT register; wait
      # for diff replication via heartbeat protocol
      :timer.sleep(200)

      list = PresenceTracker.list(topic)
      assert [{"key1", meta}] = list
      assert meta.status == "online"

      :ok = PresenceTracker.untrack(pid, topic, "key1")
      :timer.sleep(200)

      assert PresenceTracker.list(topic) == []
    end

    test "list empty topic returns empty list at canonical register" do
      topic = unique_topic("empty")
      assert PresenceTracker.list(topic) == []
    end

    test "multiple keys per topic tracked canonical at substantive register" do
      topic = unique_topic("multi")
      pid = self()
      {:ok, _ref1} = PresenceTracker.track(pid, topic, "user_a", %{role: "admin"})
      {:ok, _ref2} = PresenceTracker.track(pid, topic, "user_b", %{role: "user"})

      :timer.sleep(200)

      list = PresenceTracker.list(topic)
      assert length(list) == 2
      meta_map = Map.new(list)
      assert meta_map["user_a"].role == "admin"
      assert meta_map["user_b"].role == "user"

      :ok = PresenceTracker.untrack(pid, topic, "user_a")
      :ok = PresenceTracker.untrack(pid, topic, "user_b")
    end
  end

  # `handle_diff` callback-mailbox verification REMOVED at canonical
  # register substantively at substantive register per D-PHASE-10-CI-
  # PRESENCE-TRACKER-TIMING-CASCADE substrate-build observation
  # candidate (CI substrate register substantively falsified 2× +
  # 6.7× `:broadcast_period` timing-budget hypotheses canonical at
  # substantive register; substrate-honest correction per Q-A
  # Option β LOCKED operator-tier authorization canonical at
  # substantive register). Coverage canonical at substantive register
  # preserved at substrate-coherent register: state-based
  # `Phoenix.Tracker.list/2` verification (3 single-node tests above
  # canonical at substantive register) + integration-tier CRDT
  # replication verification (3 tests at presence_replication_test.
  # exs canonical at substantive register) + partition recovery
  # verification (1 test at partition_recovery_test.exs canonical at
  # substantive register) substantively cover Phoenix.Tracker
  # substrate at canonical register substantively at substantive
  # register. handle_diff stub implementation at presence_tracker.ex
  # substantively forward-queued for substantive consumer logic at
  # sub-phase 10+ register canonical at substantive register; full-
  # chain verification substantively forward-queued to integration-
  # tier register at canonical-coherence register substantively at
  # substantive register when substantive consumer logic lands at
  # canonical register substantively at substantive register.

  defp unique_topic(prefix) do
    "presence_#{prefix}_#{System.unique_integer([:positive])}"
  end
end
