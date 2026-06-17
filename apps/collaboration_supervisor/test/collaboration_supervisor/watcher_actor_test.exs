defmodule CollaborationSupervisor.WatcherActorTest do
  @moduledoc """
  Phase 1287-B — the long-lived watcher actor: evaluates a bounded scoped
  candidate set, returns advisory candidates + actor/eval metadata, and caps the
  input so a flood never produces unbounded work.
  """
  use ExUnit.Case, async: false

  alias CollaborationSupervisor.WatcherActor

  setup do
    name = :"watcher_actor_#{System.unique_integer([:positive])}"
    {:ok, _pid} = start_supervised({WatcherActor, name: name})
    {:ok, name: name}
  end

  test "evaluates candidates and returns advisory metadata", %{name: name} do
    {:ok, result} =
      WatcherActor.evaluate(name, [
        %{"candidate_id" => "led-1", "watcher_type" => "OVERDUE_WORK", "age_hours" => 240}
      ])

    assert result.actor_id == "watcher_actor"
    assert is_binary(result.evaluated_at)
    assert [%{candidate_id: "led-1", source: "BEAM_ADVISORY"}] = result.candidates
  end

  test "caps the input at 200 candidates (no unbounded evaluation)", %{name: name} do
    many = for i <- 1..500, do: %{"candidate_id" => "led-#{i}", "watcher_type" => "NO_NEXT_ACTION"}
    {:ok, result} = WatcherActor.evaluate(name, many)
    assert length(result.candidates) == 200
  end

  test "drops unknown candidates while keeping valid ones", %{name: name} do
    {:ok, result} =
      WatcherActor.evaluate(name, [
        %{"candidate_id" => "ok", "watcher_type" => "STALE_WAITING_ON"},
        %{"candidate_id" => "bad", "watcher_type" => "NONSENSE"}
      ])

    assert [%{candidate_id: "ok"}] = result.candidates
  end
end
