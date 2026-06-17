defmodule CollaborationSupervisor.Web.RouterTest do
  use ExUnit.Case, async: false
  import Plug.Test
  import Plug.Conn

  alias CollaborationSupervisor.CollaborationProcess
  alias CollaborationSupervisor.Web.Router

  # The Router default-resolves the Registry + DynamicSupervisor to the
  # module-name atoms (CollaborationSupervisor.Registry +
  # CollaborationSupervisor.DynamicSupervisor) via CollaborationProcess.
  # We start those for the test so HTTP requests have a real registry +
  # supervisor to talk to without booting the full Application.

  setup do
    # Guard against duplicate starts across tests in the same suite.
    case Process.whereis(CollaborationSupervisor.Registry) do
      nil ->
        {:ok, _} =
          start_supervised(
            {Registry, keys: :unique, name: CollaborationSupervisor.Registry}
          )

      _pid ->
        :ok
    end

    case Process.whereis(CollaborationSupervisor.DynamicSupervisor) do
      nil ->
        {:ok, _} =
          start_supervised(%{
            id: CollaborationSupervisor.DynamicSupervisor,
            start:
              {DynamicSupervisor, :start_link,
               [[strategy: :one_for_one, name: CollaborationSupervisor.DynamicSupervisor]]}
          })

      _pid ->
        :ok
    end

    # Phase 1287-B — the long-lived watcher actor the /watchers/evaluate route
    # delegates to (default module-name registration).
    case Process.whereis(CollaborationSupervisor.WatcherActor) do
      nil ->
        {:ok, _} = start_supervised(CollaborationSupervisor.WatcherActor)

      _pid ->
        :ok
    end

    :ok
  end

  describe "POST /watchers/evaluate" do
    test "confirms scoped candidates and returns closed-vocab advisory findings" do
      payload =
        Jason.encode!(%{
          "tenant_id" => "org-1",
          "correlation_id" => "corr-1",
          "candidates" => [
            %{"candidate_id" => "led-1", "watcher_type" => "UNRESOLVED_BLOCKER", "severity" => "HIGH"},
            %{"candidate_id" => "bad", "watcher_type" => "NONSENSE"}
          ]
        })

      conn =
        conn(:post, "/watchers/evaluate", payload)
        |> put_req_header("content-type", "application/json")

      conn = Router.call(conn, Router.init([]))
      assert conn.status == 202
      body = Jason.decode!(conn.resp_body)
      assert body["ok"] == true
      assert body["runtime"] == "BEAM"
      assert body["correlation_id"] == "corr-1"
      assert body["actor_id"] == "watcher_actor"
      assert is_binary(body["evaluated_at"])
      # Only the valid candidate is confirmed; the unknown type is dropped.
      assert [%{"candidate_id" => "led-1", "source" => "BEAM_ADVISORY"}] = body["candidates"]
    end

    test "422 on a malformed request (missing tenant / correlation / candidates)" do
      for bad <- [%{"correlation_id" => "c", "candidates" => []}, %{"tenant_id" => "o", "candidates" => []}, %{"tenant_id" => "o", "correlation_id" => "c"}] do
        conn =
          conn(:post, "/watchers/evaluate", Jason.encode!(bad))
          |> put_req_header("content-type", "application/json")

        conn = Router.call(conn, Router.init([]))
        assert conn.status == 422
      end
    end
  end

  describe "GET /health" do
    test "returns 200 with closed-vocab payload" do
      conn = conn(:get, "/health")
      conn = Router.call(conn, Router.init([]))
      assert conn.status == 200
      body = Jason.decode!(conn.resp_body)
      assert body["status"] == "ok"
      assert body["service"] == "collaboration_supervisor"
      assert is_binary(body["version"])
    end
  end

  describe "GET /supervised-status/:id" do
    test "returns 404 for an unknown collaboration id" do
      conn = conn(:get, "/supervised-status/never-spawned-#{System.unique_integer([:positive])}")
      conn = Router.call(conn, Router.init([]))
      assert conn.status == 404
    end

    test "returns the supervised view after an observation" do
      id = "router-test-#{System.unique_integer([:positive])}"
      :ok = CollaborationProcess.observe(id, :accepted, false)

      conn = conn(:get, "/supervised-status/#{id}")
      conn = Router.call(conn, Router.init([]))
      assert conn.status == 200
      body = Jason.decode!(conn.resp_body)
      assert body["state"] == "ACCEPTED"
      assert body["next_tick"] == "AWAIT_TARGET_RESPONSE"
      assert body["has_blocked_reason"] == false
      assert is_binary(body["observed_at"])
    end

    test "blocked observation routes next_tick to NONE" do
      id = "router-blocked-#{System.unique_integer([:positive])}"
      :ok = CollaborationProcess.observe(id, :accepted, true)

      conn = conn(:get, "/supervised-status/#{id}")
      conn = Router.call(conn, Router.init([]))
      assert conn.status == 200
      body = Jason.decode!(conn.resp_body)
      assert body["next_tick"] == "NONE"
      assert body["has_blocked_reason"] == true
    end
  end

  describe "POST /supervised-status/:id" do
    test "accepts a valid observation body" do
      id = "router-post-#{System.unique_integer([:positive])}"

      conn =
        conn(:post, "/supervised-status/#{id}", Jason.encode!(%{"state" => "REQUESTED"}))
        |> put_req_header("content-type", "application/json")

      conn = Router.call(conn, Router.init([]))
      assert conn.status == 200

      assert {:ok, %{observed_state: :requested}} =
               CollaborationProcess.get_status(id)
    end

    test "rejects an unknown state literal with 422" do
      id = "router-bad-#{System.unique_integer([:positive])}"

      conn =
        conn(:post, "/supervised-status/#{id}", Jason.encode!(%{"state" => "NOT_A_STATE"}))
        |> put_req_header("content-type", "application/json")

      conn = Router.call(conn, Router.init([]))
      assert conn.status == 422
    end

    test "rejects body that is not JSON object with 422" do
      id = "router-empty-#{System.unique_integer([:positive])}"

      conn =
        conn(:post, "/supervised-status/#{id}", Jason.encode!(%{}))
        |> put_req_header("content-type", "application/json")

      conn = Router.call(conn, Router.init([]))
      assert conn.status == 422
    end
  end

  describe "404 catch-all" do
    test "unknown route returns 404 JSON" do
      conn = conn(:get, "/nope")
      conn = Router.call(conn, Router.init([]))
      assert conn.status == 404
      body = Jason.decode!(conn.resp_body)
      assert body["error"] == "not_found"
    end
  end
end
