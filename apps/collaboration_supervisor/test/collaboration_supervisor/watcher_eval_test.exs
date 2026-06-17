defmodule CollaborationSupervisor.WatcherEvalTest do
  @moduledoc """
  Phase 1287-B — the pure advisory watcher evaluation. BEAM confirms + scores
  ONLY the candidates Foundation sent: it never invents a candidate_id or
  watcher_type, and emits closed-vocab severity/confidence only.
  """
  use ExUnit.Case, async: true

  alias CollaborationSupervisor.WatcherEval

  test "confirms a closed-vocab candidate and echoes only the given id/type" do
    [out] =
      WatcherEval.evaluate([
        %{"candidate_id" => "led-1", "watcher_type" => "UNRESOLVED_BLOCKER", "severity" => "HIGH"}
      ])

    assert out.candidate_id == "led-1"
    assert out.watcher_type == "UNRESOLVED_BLOCKER"
    assert out.severity == "HIGH"
    assert out.confidence == "HIGH"
    assert out.source == "BEAM_ADVISORY"
    assert is_binary(out.reason) and is_binary(out.recommendation)
  end

  test "overdue work is HIGH confidence only when aging" do
    [aging] = WatcherEval.evaluate([%{"candidate_id" => "a", "watcher_type" => "OVERDUE_WORK", "age_hours" => 240}])
    [fresh] = WatcherEval.evaluate([%{"candidate_id" => "b", "watcher_type" => "OVERDUE_WORK", "age_hours" => 10}])
    assert aging.confidence == "HIGH"
    assert fresh.confidence == "MEDIUM"
  end

  test "drops an unknown watcher_type or missing id (never invents a finding)" do
    assert WatcherEval.evaluate([%{"candidate_id" => "x", "watcher_type" => "TOTALLY_MADE_UP"}]) == []
    assert WatcherEval.evaluate([%{"watcher_type" => "OVERDUE_WORK"}]) == []
    assert WatcherEval.evaluate([%{"candidate_id" => "", "watcher_type" => "OVERDUE_WORK"}]) == []
  end

  test "an invalid severity is normalized to MEDIUM (closed-vocab only)" do
    [out] = WatcherEval.evaluate([%{"candidate_id" => "c", "watcher_type" => "NO_NEXT_ACTION", "severity" => "ULTRA"}])
    assert out.severity == "MEDIUM"
  end

  test "non-list / non-map inputs are handled safely" do
    assert WatcherEval.evaluate(:nope) == []
    assert WatcherEval.evaluate(["not a map", 42]) == []
  end
end
