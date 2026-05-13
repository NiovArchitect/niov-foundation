defmodule CosmpRouter.GRPC.ServerTest do
  @moduledoc """
  Sub-phase 5b-i `[BEAM-COSMP-INTEROP-GRPC]` gRPC server handler
  tests. Tests handler functions directly with Protobuf request
  structs (no real gRPC client; that's sub-phase 6 integration
  territory).

  Verifies:
  - Each of 7 handlers dispatches to Router and returns Protobuf
    response struct with `oneof :result` populated
  - Success path: returns `{:success, _}` branch
  - Error path: returns `{:error, %CosmpError{}}` branch
  """

  use ExUnit.Case, async: false

  alias CosmpRouter.GRPC.Server
  alias CosmpRouter.Proto
  alias CosmpRouter.Storage.ETS, as: Storage

  setup do
    Storage.clear()
    :ok
  end

  describe "authenticate/2" do
    test "returns success when capsule + principal_id valid" do
      req = %Proto.AuthenticateRequest{
        capsule: valid_proto_capsule(),
        principal_id: "test-principal"
      }

      resp = Server.authenticate(req, nil)

      assert %Proto.AuthenticateResponse{result: {:success, success}} = resp
      assert %Proto.AuthenticateSuccess{authenticated: true, principal_id: "test-principal"} = success
    end

    test "returns error when principal_id empty" do
      req = %Proto.AuthenticateRequest{capsule: valid_proto_capsule(), principal_id: ""}
      resp = Server.authenticate(req, nil)
      assert %Proto.AuthenticateResponse{result: {:error, err}} = resp
      assert %Proto.CosmpError{kind: :PERMISSION_DENIED} = err
    end
  end

  describe "negotiate/2" do
    test "returns granted_scopes echoing requested at hot-tier" do
      req = %Proto.NegotiateRequest{
        capsule: valid_proto_capsule(),
        requested_scopes: ["read:capsule", "write:capsule"]
      }

      resp = Server.negotiate(req, nil)
      assert %Proto.NegotiateResponse{result: {:success, success}} = resp
      assert success.granted_scopes == ["read:capsule", "write:capsule"]
    end
  end

  describe "read/2" do
    test "returns CAPSULE_NOT_FOUND for unknown capsule_id" do
      req = %Proto.ReadRequest{capsule_id: "does-not-exist"}
      resp = Server.read(req, nil)
      assert %Proto.ReadResponse{result: {:error, err}} = resp
      assert %Proto.CosmpError{kind: :CAPSULE_NOT_FOUND} = err
    end

    test "returns stored capsule after WRITE" do
      write_req = %Proto.WriteRequest{
        capsule_id: "test-cap-1",
        capsule: valid_proto_capsule()
      }

      assert %Proto.WriteResponse{result: {:success, _}} = Server.write(write_req, nil)

      read_req = %Proto.ReadRequest{capsule_id: "test-cap-1"}
      resp = Server.read(read_req, nil)
      assert %Proto.ReadResponse{result: {:capsule, capsule}} = resp
      assert %Proto.Capsule{} = capsule
    end
  end

  describe "write/2" do
    test "succeeds with valid capsule" do
      req = %Proto.WriteRequest{
        capsule_id: "test-cap-2",
        capsule: valid_proto_capsule()
      }

      resp = Server.write(req, nil)
      assert %Proto.WriteResponse{result: {:success, success}} = resp
      assert success.capsule_id == "test-cap-2"
    end

    test "returns INVALID_CAPSULE for capsule with no payload" do
      req = %Proto.WriteRequest{
        capsule_id: "test-cap-3",
        capsule: %Proto.Capsule{
          payload: nil,
          permissions: %Proto.Permissions{owner: "test-owner"}
        }
      }

      resp = Server.write(req, nil)
      assert %Proto.WriteResponse{result: {:error, err}} = resp
      assert %Proto.CosmpError{kind: :INVALID_CAPSULE} = err
    end
  end

  describe "share/2 + revoke/2" do
    test "share adds grantee; revoke removes" do
      Server.write(%Proto.WriteRequest{capsule_id: "cap-sr", capsule: valid_proto_capsule()}, nil)

      share_resp =
        Server.share(%Proto.ShareRequest{capsule_id: "cap-sr", grantee: "alice"}, nil)

      assert %Proto.ShareResponse{result: {:success, success}} = share_resp
      assert "alice" in success.granted_to

      revoke_resp =
        Server.revoke(%Proto.RevokeRequest{capsule_id: "cap-sr", grantee: "alice"}, nil)

      assert %Proto.RevokeResponse{result: {:success, success}} = revoke_resp
      refute "alice" in success.remaining_grantees
    end

    test "share returns CAPSULE_NOT_FOUND for unknown capsule" do
      resp =
        Server.share(%Proto.ShareRequest{capsule_id: "nope", grantee: "alice"}, nil)

      assert %Proto.ShareResponse{result: {:error, err}} = resp
      assert %Proto.CosmpError{kind: :CAPSULE_NOT_FOUND} = err
    end
  end

  describe "audit/2" do
    test "returns audit entries appended by WRITE/SHARE/REVOKE" do
      cid = "cap-audit"
      Server.write(%Proto.WriteRequest{capsule_id: cid, capsule: valid_proto_capsule()}, nil)
      Server.share(%Proto.ShareRequest{capsule_id: cid, grantee: "bob"}, nil)

      resp = Server.audit(%Proto.AuditRequest{capsule_id: cid}, nil)
      assert %Proto.AuditResponse{result: {:success, success}} = resp
      assert length(success.entries) >= 2

      event_types = Enum.map(success.entries, & &1.event_type)
      assert "WRITE" in event_types
      assert "SHARE" in event_types
    end
  end

  # ---- helpers ----

  defp valid_proto_capsule do
    %Proto.Capsule{
      payload: "test-payload-bytes",
      metadata: %{"version" => "1"},
      rules: [%Proto.Rule{name: "read", value: "allow"}],
      relations: [],
      time: %Proto.TimeAttributes{
        created_at: System.system_time(:millisecond),
        modified_at: 0,
        expires_at: 0
      },
      permissions: %Proto.Permissions{owner: "test-owner", granted_to: []},
      audit: []
    }
  end
end
