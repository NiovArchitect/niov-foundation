defmodule CollaborationSupervisor.WatcherEval do
  @moduledoc """
  Pure, deterministic ADVISORY watcher evaluation (Phase 1287-B).

  BEAM is an ADVISORY orchestration layer. Given a bounded, Foundation-scoped set
  of candidate findings, it CONFIRMS + scores each one and returns closed-vocab
  advisory candidates. It NEVER invents a `candidate_id` or `watcher_type` it was
  not given, never decides permission/scope/tenant, never creates work, and never
  notifies anyone. Foundation re-validates every returned candidate against the
  allowed set and remains the sole authority for what becomes visible.

  No LLM, no chain-of-thought — a transparent confirm + confidence heuristic.
  """

  @watcher_types ~w(OVERDUE_WORK UNRESOLVED_BLOCKER STALE_WAITING_ON NO_NEXT_ACTION)
  @severities ~w(LOW MEDIUM HIGH CRITICAL)
  @aging_hours 168

  @type candidate :: %{optional(String.t()) => term()}

  @doc """
  Evaluate a list of JSON candidate maps (string keys). Returns advisory
  candidate maps; drops anything whose id/type is missing or out of vocabulary
  (BEAM cannot introduce a finding Foundation did not send).
  """
  @spec evaluate([candidate()]) :: [map()]
  def evaluate(candidates) when is_list(candidates), do: Enum.flat_map(candidates, &eval_one/1)
  def evaluate(_), do: []

  defp eval_one(c) when is_map(c) do
    id = Map.get(c, "candidate_id")
    type = Map.get(c, "watcher_type")

    if is_binary(id) and id != "" and type in @watcher_types do
      [
        %{
          candidate_id: id,
          watcher_type: type,
          severity: severity(Map.get(c, "severity")),
          confidence: confidence(type, c),
          reason: reason_for(type),
          recommendation: recommendation_for(type),
          source: "BEAM_ADVISORY"
        }
      ]
    else
      []
    end
  end

  defp eval_one(_), do: []

  defp severity(s) when s in @severities, do: s
  defp severity(_), do: "MEDIUM"

  # Confidence: a blocker is always high; overdue work that is also aging is high;
  # everything else is a measured medium. Never fabricated certainty.
  defp confidence("UNRESOLVED_BLOCKER", _c), do: "HIGH"

  defp confidence("OVERDUE_WORK", c) do
    if aging?(Map.get(c, "age_hours")), do: "HIGH", else: "MEDIUM"
  end

  defp confidence(_type, _c), do: "MEDIUM"

  defp aging?(h) when is_number(h), do: h > @aging_hours
  defp aging?(_), do: false

  defp reason_for("OVERDUE_WORK"), do: "Overdue work confirmed by the watcher actor."
  defp reason_for("UNRESOLVED_BLOCKER"), do: "Open blocker confirmed by the watcher actor."
  defp reason_for("STALE_WAITING_ON"), do: "Stale waiting-on confirmed by the watcher actor."
  defp reason_for("NO_NEXT_ACTION"), do: "Missing next action confirmed by the watcher actor."

  defp recommendation_for("OVERDUE_WORK"), do: "Follow up to bring this work current."
  defp recommendation_for("UNRESOLVED_BLOCKER"), do: "Escalate to unblock this work."
  defp recommendation_for("STALE_WAITING_ON"), do: "Nudge the person you are waiting on."
  defp recommendation_for("NO_NEXT_ACTION"), do: "Assign an owner and a clear next action."
end
