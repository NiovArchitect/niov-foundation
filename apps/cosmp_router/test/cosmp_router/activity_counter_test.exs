defmodule CosmpRouter.ActivityCounterTest do
  @moduledoc """
  Unit tests for `CosmpRouter.ActivityCounter` ETS atomic-counter
  substrate per ADR-0039 §Sub-decision 8 amendment forward-substrate at
  C.4 commit register substantively per RULE 21 research arc canonical
  at canonical-knowledge register substantively per 67f6112 commit
  substantively.

  ## Test isolation pattern

  Each test uses unique entity_id via System.unique_integer/1 to avoid
  cross-test contamination at ETS register substantively (named-table
  shared across tests at application-supervised register substantively).

  ## References

  - ADR-0039 §Sub-decision 8 (ENTERPRISE-only at sub-phase b; amendment
    forward-substrate at C.4 commit)
  - ADR-0034 (BEAM testability discipline)
  - RULE 21 (pre-authorization research arc canonical per 67f6112)
  """

  use ExUnit.Case, async: false

  alias CosmpRouter.ActivityCounter

  defp unique_entity_id(suffix) do
    "ac-#{suffix}-#{System.unique_integer([:positive])}"
  end

  describe "record_activity/1" do
    test "atomically increments count for fresh entity_id" do
      entity_id = unique_entity_id("fresh")

      assert 1 = ActivityCounter.record_activity(entity_id)
      assert 2 = ActivityCounter.record_activity(entity_id)
      assert 3 = ActivityCounter.record_activity(entity_id)
    end

    test "updates last_activity timestamp at canonical-state register" do
      entity_id = unique_entity_id("ts")
      before_ms = System.system_time(:millisecond)

      _ = ActivityCounter.record_activity(entity_id)
      last_activity = ActivityCounter.get_last_activity(entity_id)

      after_ms = System.system_time(:millisecond)

      assert last_activity >= before_ms
      assert last_activity <= after_ms
    end
  end

  describe "get_count/1" do
    test "returns 0 for unknown entity_id" do
      assert 0 = ActivityCounter.get_count(unique_entity_id("unknown"))
    end

    test "returns current count after record_activity calls" do
      entity_id = unique_entity_id("count")

      _ = ActivityCounter.record_activity(entity_id)
      _ = ActivityCounter.record_activity(entity_id)

      assert 2 = ActivityCounter.get_count(entity_id)
    end
  end

  describe "should_promote?/2" do
    test "returns false below threshold canonical at canonical-decision register" do
      entity_id = unique_entity_id("below")

      _ = ActivityCounter.record_activity(entity_id)
      _ = ActivityCounter.record_activity(entity_id)

      refute ActivityCounter.should_promote?(entity_id, 5)
    end

    test "returns true at-or-above threshold canonical at canonical-decision register" do
      entity_id = unique_entity_id("above")

      for _ <- 1..5, do: ActivityCounter.record_activity(entity_id)

      assert ActivityCounter.should_promote?(entity_id, 5)
    end

    test "honors custom threshold override canonical at Application.get_env-bypass register" do
      entity_id = unique_entity_id("override")

      _ = ActivityCounter.record_activity(entity_id)
      _ = ActivityCounter.record_activity(entity_id)

      # Default threshold is 5; explicit override to 2 should promote
      assert ActivityCounter.should_promote?(entity_id, 2)
      refute ActivityCounter.should_promote?(entity_id, 10)
    end
  end

  describe "reset/1" do
    test "removes entity_id from ETS canonical at canonical-state register" do
      entity_id = unique_entity_id("reset")

      _ = ActivityCounter.record_activity(entity_id)
      _ = ActivityCounter.record_activity(entity_id)
      assert 2 = ActivityCounter.get_count(entity_id)

      assert true = ActivityCounter.reset(entity_id)
      assert 0 = ActivityCounter.get_count(entity_id)
    end
  end

  describe "concurrent record_activity atomicity" do
    test "10 concurrent Task.async calls produce exactly 10 count" do
      entity_id = unique_entity_id("concurrent")

      tasks =
        for _ <- 1..10 do
          Task.async(fn -> ActivityCounter.record_activity(entity_id) end)
        end

      _ = Task.await_many(tasks, 5_000)

      assert 10 = ActivityCounter.get_count(entity_id)
    end
  end

  describe "configured_threshold/0 + configured_window_ms/0" do
    test "configured_threshold returns Application.get_env value canonical" do
      # Default threshold 5 canonical at canonical-coherence register substantively
      assert 5 = ActivityCounter.configured_threshold()
    end

    test "configured_window_ms returns Application.get_env value canonical" do
      # Default window 60_000 ms canonical at canonical-coherence register substantively
      assert 60_000 = ActivityCounter.configured_window_ms()
    end
  end
end
