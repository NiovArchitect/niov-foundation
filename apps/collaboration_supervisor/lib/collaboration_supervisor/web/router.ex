defmodule CollaborationSupervisor.Web.Router do
  @moduledoc """
  HTTP boundary for the Collaboration Handoff Supervisor.

  Endpoints mirror what the Foundation TS wrapper at
  apps/api/src/services/coordination/beam-collaboration-supervisor.service.ts
  expects:

  - `GET /health`
  - `GET /supervised-status/:id`     — returns the supervised view
  - `POST /supervised-status/:id`    — TS wrapper can push an observation
                                       to keep BEAM's view consistent
                                       (body: `{"state": "REQUESTED",
                                        "has_blocked_reason": false}`)

  No raw memory, no transcripts, no chain-of-thought, no audit writes
  here — the BEAM service only observes lifecycle state. Per ADR-0034
  Sub-decision 4, the per-collaboration process and the Registry use
  the same atom (default `CollaborationSupervisor.Registry`).
  """

  use Plug.Router

  alias CollaborationSupervisor.CollaborationProcess
  alias CollaborationSupervisor.NextTick

  plug Plug.Logger, log: :debug

  plug :match

  plug Plug.Parsers,
    parsers: [:json],
    pass: ["application/json"],
    json_decoder: Jason

  plug :dispatch

  # --- Health --------------------------------------------------------------

  get "/health" do
    json(conn, 200, %{
      status: "ok",
      service: "collaboration_supervisor",
      version: "0.1.0"
    })
  end

  # --- Supervised status ---------------------------------------------------

  get "/supervised-status/:id" do
    case CollaborationProcess.get_status(id) do
      {:ok, state} ->
        json(conn, 200, %{
          state: NextTick.render_state(state.observed_state),
          next_tick:
            NextTick.render_next_tick(
              NextTick.derive(state.observed_state, state.has_blocked_reason)
            ),
          has_blocked_reason: state.has_blocked_reason,
          observed_at: DateTime.to_iso8601(state.observed_at)
        })

      :not_found ->
        # The TS wrapper treats `!response.ok` as fallback-to-projection,
        # so 404 keeps the wrapper safely on the Prisma-derived view
        # without leaking that no BEAM process exists for this id.
        json(conn, 404, %{error: "collaboration_not_found"})
    end
  end

  post "/supervised-status/:id" do
    with body when is_map(body) <- conn.body_params,
         {:ok, state_atom} <- parse_state_param(body),
         {:ok, blocked_bool} <- parse_blocked_param(body) do
      case CollaborationProcess.observe(id, state_atom, blocked_bool) do
        :ok ->
          json(conn, 200, %{ok: true})

        {:error, reason} ->
          json(conn, 500, %{error: "observe_failed", reason: inspect(reason)})
      end
    else
      _ -> json(conn, 422, %{error: "invalid_body"})
    end
  end

  # --- Work OS event fanout (Phase 1281) -----------------------------------
  # Governed coordination only: BEAM accepts a WorkOsEvent emitted by
  # Foundation after a WorkLedgerEntry is created, classifies which
  # watchdog category applies, and acknowledges. BEAM never executes an
  # external write — it coordinates/supervises/fans out only.
  post "/events/work-os" do
    body = conn.body_params

    with true <- is_map(body),
         tenant when is_binary(tenant) and tenant != "" <- Map.get(body, "tenant_id"),
         event_id when is_binary(event_id) and event_id != "" <- Map.get(body, "event_id"),
         ledger_id when is_binary(ledger_id) and ledger_id != "" <-
           Map.get(body, "ledger_entry_id") do
      status = Map.get(body, "status", "")
      due_at = Map.get(body, "due_at")
      next_action = Map.get(body, "next_action")
      watcher = classify_watcher(status, due_at, next_action)

      json(conn, 202, %{
        accepted: true,
        runtime: "BEAM",
        event_id: event_id,
        ledger_entry_id: ledger_id,
        watcher: watcher
      })
    else
      _ -> json(conn, 422, %{error: "invalid_work_os_event"})
    end
  end

  match _ do
    json(conn, 404, %{error: "not_found"})
  end

  # --- Helpers ------------------------------------------------------------

  # Phase 1281 watchdog classification. No external action is taken yet —
  # the category tells Foundation/Blind Spots what to watch.
  defp classify_watcher(status, _due, _next)
       when status in ["BLOCKED", "RUNTIME_MISSING"],
       do: "blocker"

  defp classify_watcher("NEEDS_PARTICIPANT_CONFIRMATION", _due, _next),
    do: "confirmation"

  defp classify_watcher(_status, due, _next) when is_binary(due) and due != "",
    do: "due_date"

  defp classify_watcher(_status, _due, next) when is_nil(next) or next == "",
    do: "no_next_action"

  defp classify_watcher(_status, _due, _next), do: "none"

  defp parse_state_param(%{"state" => value}) when is_binary(value) do
    case NextTick.parse_state(value) do
      {:ok, atom} -> {:ok, atom}
      :error -> :error
    end
  end

  defp parse_state_param(_), do: :error

  defp parse_blocked_param(%{"has_blocked_reason" => v}) when is_boolean(v),
    do: {:ok, v}

  defp parse_blocked_param(_), do: {:ok, false}

  defp json(conn, status, payload) do
    conn
    |> Plug.Conn.put_resp_content_type("application/json")
    |> Plug.Conn.send_resp(status, Jason.encode!(payload))
  end
end
