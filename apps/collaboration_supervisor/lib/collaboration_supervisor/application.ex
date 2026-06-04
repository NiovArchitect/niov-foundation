defmodule CollaborationSupervisor.Application do
  @moduledoc """
  OTP entrypoint for the Collaboration Handoff Supervisor.

  Boots:
  - a `Registry` (`CollaborationSupervisor.Registry`) for per-collaboration
    process lookup — `{:via, Registry, {CollaborationSupervisor.Registry,
    collaboration_id}}` per the KV.Registry canonical Elixir pattern at
    ADR-0034 Sub-decision 4.
  - a `DynamicSupervisor` (`CollaborationSupervisor.DynamicSupervisor`) for
    per-collaboration `CollaborationProcess` workers lazily spawned on
    first observation per ADR-0038 §Sub-decision 4 (lazy-spawn-on-first-
    COSMP-op) translated to per-collaboration lifecycle.
  - the HTTP listener (`CollaborationSupervisor.Web`) so the Foundation
    TS wrapper can query supervised status.

  Per ADR-0034: production singleton supervision tree uses the default
  module-name registrations; tests start their own via
  `start_supervised!/1` patterns and the testability helpers under
  `test/support/`.
  """

  use Application

  @impl true
  def start(_type, _args) do
    port = http_port()

    children = [
      {Registry, keys: :unique, name: CollaborationSupervisor.Registry},
      {DynamicSupervisor,
       strategy: :one_for_one, name: CollaborationSupervisor.DynamicSupervisor},
      web_listener_spec(port)
    ]

    opts = [strategy: :one_for_one, name: CollaborationSupervisor.RootSupervisor]
    Supervisor.start_link(children, opts)
  end

  defp web_listener_spec(port) do
    Plug.Cowboy.child_spec(
      scheme: :http,
      plug: CollaborationSupervisor.Web.Router,
      options: [port: port, ip: {0, 0, 0, 0}]
    )
  end

  defp http_port do
    case System.get_env("COLLAB_SUPERVISOR_PORT") do
      nil -> 4001
      "" -> 4001
      value ->
        case Integer.parse(value) do
          {port, ""} when port > 0 and port < 65_536 -> port
          _ -> 4001
        end
    end
  end
end
