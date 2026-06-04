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

  match _ do
    json(conn, 404, %{error: "not_found"})
  end

  # --- Helpers ------------------------------------------------------------

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
