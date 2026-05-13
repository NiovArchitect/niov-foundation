defmodule CosmpRouter.RouterTest do
  @moduledoc """
  Sub-phase 5b-i `[BEAM-COSMP-INTEROP-GRPC]` Router GenServer tests.

  Verifies ADR-0031 §Decision instantiation post sub-phase 5b-i:

  - Router process alive + named (`Process.whereis/1` lookup)
  - State struct initialized correctly (empty in_flight + non-nil
    started_at + storage module pointer)
  - 7 handle_call clauses dispatch correctly against Protobuf request
    structs (Q-N: no `:not_implemented` stubs; real routing logic
    against ETS storage per Q-T)

  Per-op test pattern carries forward to sub-phase 6
  `[BEAM-COSMP-INTEGRATION-TESTS]` consumer.
  """

  use ExUnit.Case, async: false

  alias CosmpRouter.Proto
  alias CosmpRouter.Router
  alias CosmpRouter.Router.State
  alias CosmpRouter.Storage.ETS, as: Storage

  setup do
    Storage.clear()
    :ok
  end

  describe "Router process lifecycle" do
    test "Router is alive after app start" do
      assert is_pid(Process.whereis(Router))
    end

    test "Router state is initialized correctly" do
      state = :sys.get_state(Router)
      assert %State{} = state
      assert state.in_flight == %{}
      assert is_integer(state.started_at)
      assert state.storage == Storage
    end
  end

  describe "7 COSMP ops handle_call dispatch (ADR-0031 §Decision; sub-phase 5b-i real routing)" do
    setup do
      proto_capsule = %Proto.Capsule{
        payload: "test-payload",
        permissions: %Proto.Permissions{owner: "test-owner", granted_to: []}
      }

      {:ok, capsule: proto_capsule}
    end

    test "AUTHENTICATE returns success for valid request", %{capsule: capsule} do
      req = %Proto.AuthenticateRequest{capsule: capsule, principal_id: "alice"}

      assert {:ok, %Proto.AuthenticateSuccess{authenticated: true, principal_id: "alice"}} =
               GenServer.call(Router, {:authenticate, req})
    end

    test "AUTHENTICATE returns PERMISSION_DENIED for empty principal_id", %{capsule: capsule} do
      req = %Proto.AuthenticateRequest{capsule: capsule, principal_id: ""}
      assert {:error, %Proto.CosmpError{kind: :PERMISSION_DENIED}} =
               GenServer.call(Router, {:authenticate, req})
    end

    test "NEGOTIATE returns granted_scopes echoing requested", %{capsule: capsule} do
      req = %Proto.NegotiateRequest{capsule: capsule, requested_scopes: ["scope1", "scope2"]}
      assert {:ok, %Proto.NegotiateSuccess{granted_scopes: ["scope1", "scope2"]}} =
               GenServer.call(Router, {:negotiate, req})
    end

    test "READ returns CAPSULE_NOT_FOUND for unknown capsule_id" do
      req = %Proto.ReadRequest{capsule_id: "nonexistent"}
      assert {:error, %Proto.CosmpError{kind: :CAPSULE_NOT_FOUND}} =
               GenServer.call(Router, {:read, req})
    end

    test "WRITE succeeds with valid Capsule", %{capsule: capsule} do
      req = %Proto.WriteRequest{capsule_id: "cap-w1", capsule: capsule}
      assert {:ok, %Proto.WriteSuccess{capsule_id: "cap-w1"}} =
               GenServer.call(Router, {:write, req})
    end

    test "WRITE then READ returns the stored Capsule", %{capsule: capsule} do
      GenServer.call(Router, {:write, %Proto.WriteRequest{capsule_id: "cap-wr", capsule: capsule}})

      assert {:ok, %Proto.Capsule{}} =
               GenServer.call(Router, {:read, %Proto.ReadRequest{capsule_id: "cap-wr"}})
    end

    test "SHARE adds grantee to capsule permissions", %{capsule: capsule} do
      GenServer.call(Router, {:write, %Proto.WriteRequest{capsule_id: "cap-s", capsule: capsule}})

      assert {:ok, %Proto.ShareSuccess{granted_to: granted}} =
               GenServer.call(
                 Router,
                 {:share, %Proto.ShareRequest{capsule_id: "cap-s", grantee: "alice"}}
               )

      assert "alice" in granted
    end

    test "REVOKE removes grantee from capsule permissions", %{capsule: capsule} do
      GenServer.call(Router, {:write, %Proto.WriteRequest{capsule_id: "cap-r", capsule: capsule}})

      GenServer.call(
        Router,
        {:share, %Proto.ShareRequest{capsule_id: "cap-r", grantee: "alice"}}
      )

      assert {:ok, %Proto.RevokeSuccess{remaining_grantees: remaining}} =
               GenServer.call(
                 Router,
                 {:revoke, %Proto.RevokeRequest{capsule_id: "cap-r", grantee: "alice"}}
               )

      refute "alice" in remaining
    end

    test "AUDIT returns entries appended by WRITE", %{capsule: capsule} do
      GenServer.call(Router, {:write, %Proto.WriteRequest{capsule_id: "cap-a", capsule: capsule}})

      assert {:ok, %Proto.AuditSuccess{entries: entries}} =
               GenServer.call(Router, {:audit, %Proto.AuditRequest{capsule_id: "cap-a"}})

      assert length(entries) >= 1
      assert Enum.any?(entries, &(&1.event_type == "WRITE"))
    end
  end
end
