defmodule CosmpRouter.OperationsTest do
  @moduledoc """
  Pure-module Operations tests per ADR-0039 §Decision Sub-decision 2 +
  Sub-decision 12.

  Tests exercise `CosmpRouter.Operations` directly at module-level
  register without GenServer involvement. State fixture mirrors
  `CosmpRouter.Router.State` shape; per-test ETS + Sandbox owner +
  FK parents via `CosmpRouter.RouterTestHelpers` shared helpers
  canonical per ADR-0034.

  ## Test-granularity-tier coherence

  Three tiers mirroring router_test.exs structure at module-level
  register:

  1. **Standalone audit-emission ops** -- AUTHENTICATE + NEGOTIATE
     emit standalone `Audit.write_audit_event/1`. State fixture +
     Sandbox owner only (no FK parents). 6 tests.

  2. **DB-touching composed-mode ops** -- WRITE/SHARE/REVOKE/READ/
     AUDIT use composed-mode `Ecto.Multi` per ADR-0033 §Decision 4e
     + Idempotency layer per §Decision 6. State + Sandbox owner +
     FK parents + per-test ETS. 15 tests.

  ## References

  - ADR-0039 §Decision Sub-decision 2 (cosmp_router pure-module refactor)
  - ADR-0039 §Decision Sub-decision 12 (testability per ADR-0034)
  - ADR-0033 §Decision 4e + 5 + 6
  - ADR-0034 (BEAM COSMP Testability Refactor Pattern)
  """

  use ExUnit.Case, async: false

  import CosmpRouter.RouterTestHelpers

  alias CosmpRouter.{Operations, Proto, Storage}
  alias CosmpRouter.Router.State

  defp build_state(ets_name) do
    %State{
      name: :"operations_test_state_#{System.unique_integer([:positive])}",
      storage_ets: ets_name,
      in_flight: %{},
      started_at: System.monotonic_time(),
      storage: Storage
    }
  end

  describe "authenticate/2" do
    setup do
      ets_name = :"ets_ops_auth_#{System.unique_integer([:positive])}"
      _ets_pid = start_supervised!({Storage.ETS, name: ets_name})
      _owner = start_sandbox_owner!()

      proto_capsule = %Proto.Capsule{
        payload: "test-payload",
        permissions: %Proto.Permissions{owner: "test-owner", granted_to: []}
      }

      {:ok, state: build_state(ets_name), capsule: proto_capsule}
    end

    test "returns success for valid principal_id", %{state: state, capsule: capsule} do
      req = %Proto.AuthenticateRequest{capsule: capsule, principal_id: "alice"}

      assert {:ok, %Proto.AuthenticateSuccess{authenticated: true, principal_id: "alice"}} =
               Operations.authenticate(req, state)

      assert audit_count_for_event_type("COSMP_AUTHENTICATE") >= 1
    end

    test "returns PERMISSION_DENIED for empty principal_id", %{state: state, capsule: capsule} do
      req = %Proto.AuthenticateRequest{capsule: capsule, principal_id: ""}

      assert {:error, %Proto.CosmpError{kind: :PERMISSION_DENIED}} =
               Operations.authenticate(req, state)

      assert "DENIED" in audit_outcomes_for_event_type("COSMP_AUTHENTICATE")
    end

    test "returns INVALID_CAPSULE for nil capsule", %{state: state} do
      req = %Proto.AuthenticateRequest{capsule: nil, principal_id: "alice"}

      assert {:error, %Proto.CosmpError{kind: :INVALID_CAPSULE}} =
               Operations.authenticate(req, state)
    end
  end

  describe "negotiate/2" do
    setup do
      ets_name = :"ets_ops_neg_#{System.unique_integer([:positive])}"
      _ets_pid = start_supervised!({Storage.ETS, name: ets_name})
      _owner = start_sandbox_owner!()

      proto_capsule = %Proto.Capsule{
        payload: "test-payload",
        permissions: %Proto.Permissions{owner: "test-owner", granted_to: []}
      }

      {:ok, state: build_state(ets_name), capsule: proto_capsule}
    end

    test "returns granted_scopes echoing requested", %{state: state, capsule: capsule} do
      req = %Proto.NegotiateRequest{
        capsule: capsule,
        requested_scopes: ["read:capsule", "share:capsule"]
      }

      assert {:ok, %Proto.NegotiateSuccess{granted_scopes: ["read:capsule", "share:capsule"]}} =
               Operations.negotiate(req, state)

      assert audit_count_for_event_type("COSMP_NEGOTIATE") >= 1
    end

    test "returns empty granted_scopes for empty requested", %{state: state, capsule: capsule} do
      req = %Proto.NegotiateRequest{capsule: capsule, requested_scopes: []}

      assert {:ok, %Proto.NegotiateSuccess{granted_scopes: []}} =
               Operations.negotiate(req, state)
    end

    test "returns INVALID_CAPSULE for nil capsule", %{state: state} do
      req = %Proto.NegotiateRequest{capsule: nil, requested_scopes: ["read:capsule"]}

      assert {:error, %Proto.CosmpError{kind: :INVALID_CAPSULE}} =
               Operations.negotiate(req, state)
    end
  end

  describe "DB-touching composed-mode ops (write/share/revoke/read/audit)" do
    setup do
      ets_name = :"ets_ops_db_#{System.unique_integer([:positive])}"
      _ets_pid = start_supervised!({Storage.ETS, name: ets_name})
      _owner = start_sandbox_owner!()
      owner_uuid = setup_router_fk!()

      {:ok, state: build_state(ets_name), ets: ets_name, owner: owner_uuid}
    end

    test "write composed-mode persists capsule + emits SUCCESS audit + records idempotency",
         %{state: state, owner: owner} do
      capsule_id = Ecto.UUID.generate()
      proto_capsule = build_proto_capsule(owner)
      req = %Proto.WriteRequest{capsule_id: capsule_id, capsule: proto_capsule}

      assert {:ok, %Proto.WriteSuccess{capsule_id: ^capsule_id}} =
               Operations.write(req, state)

      assert {:ok, %CosmpRouter.Capsule{}} = Storage.Postgres.get(capsule_id)
      assert ["SUCCESS"] = audit_outcomes_for_capsule(capsule_id, "COSMP_WRITE")
      assert idempotency_key_exists?("write:#{capsule_id}:v1", "WRITE")
    end

    test "write replay with same capsule_id + version returns cached idempotency result",
         %{state: state, owner: owner} do
      capsule_id = Ecto.UUID.generate()
      proto_capsule = build_proto_capsule(owner)
      req = %Proto.WriteRequest{capsule_id: capsule_id, capsule: proto_capsule}

      assert {:ok, _} = Operations.write(req, state)
      first_audit_count = audit_count_for_capsule(capsule_id, "COSMP_WRITE")

      assert {:ok, _} = Operations.write(req, state)
      second_audit_count = audit_count_for_capsule(capsule_id, "COSMP_WRITE")

      assert first_audit_count == second_audit_count,
             "replay should NOT emit a second audit event; Pattern 5 semantics"
    end

    test "share adds grantee + emits SUCCESS audit + records idempotency",
         %{state: state, owner: owner} do
      capsule_id = Ecto.UUID.generate()
      proto_capsule = build_proto_capsule(owner)

      assert {:ok, _} =
               Operations.write(%Proto.WriteRequest{capsule_id: capsule_id, capsule: proto_capsule}, state)

      grantee = "bob"

      assert {:ok, %Proto.ShareSuccess{capsule_id: ^capsule_id, granted_to: granted_to}} =
               Operations.share(%Proto.ShareRequest{capsule_id: capsule_id, grantee: grantee}, state)

      assert grantee in granted_to
      assert "SUCCESS" in audit_outcomes_for_capsule(capsule_id, "COSMP_SHARE")
      assert idempotency_key_exists?("share:#{capsule_id}:#{grantee}", "SHARE")
    end

    test "share returns CAPSULE_NOT_FOUND for missing capsule_id", %{state: state} do
      missing_uuid = Ecto.UUID.generate()

      assert {:error, %Proto.CosmpError{kind: :CAPSULE_NOT_FOUND}} =
               Operations.share(
                 %Proto.ShareRequest{capsule_id: missing_uuid, grantee: "bob"},
                 state
               )
    end

    test "revoke removes grantee + emits SUCCESS audit + records idempotency",
         %{state: state, owner: owner} do
      capsule_id = Ecto.UUID.generate()
      proto_capsule = build_proto_capsule(owner)
      grantee = "carol"

      {:ok, _} =
        Operations.write(%Proto.WriteRequest{capsule_id: capsule_id, capsule: proto_capsule}, state)

      {:ok, _} =
        Operations.share(%Proto.ShareRequest{capsule_id: capsule_id, grantee: grantee}, state)

      assert {:ok, %Proto.RevokeSuccess{capsule_id: ^capsule_id, remaining_grantees: remaining}} =
               Operations.revoke(
                 %Proto.RevokeRequest{capsule_id: capsule_id, grantee: grantee},
                 state
               )

      refute grantee in remaining
      assert "SUCCESS" in audit_outcomes_for_capsule(capsule_id, "COSMP_REVOKE")
      assert idempotency_key_exists?("revoke:#{capsule_id}:#{grantee}", "REVOKE")
    end

    test "revoke returns CAPSULE_NOT_FOUND for missing capsule_id", %{state: state} do
      missing_uuid = Ecto.UUID.generate()

      assert {:error, %Proto.CosmpError{kind: :CAPSULE_NOT_FOUND}} =
               Operations.revoke(
                 %Proto.RevokeRequest{capsule_id: missing_uuid, grantee: "bob"},
                 state
               )
    end

    test "read via Storage facade returns capsule (ETS hot-tier + Postgres fallthrough)",
         %{state: state, ets: ets, owner: owner} do
      capsule_id = Ecto.UUID.generate()
      proto_capsule = build_proto_capsule(owner)

      {:ok, _} =
        Operations.write(%Proto.WriteRequest{capsule_id: capsule_id, capsule: proto_capsule}, state)

      assert {:ok, %Proto.Capsule{}} =
               Operations.read(%Proto.ReadRequest{capsule_id: capsule_id}, state)

      :ok = Storage.ETS.clear(ets)
      assert {:error, :not_found} = Storage.ETS.get(ets, capsule_id)

      assert {:ok, %Proto.Capsule{}} =
               Operations.read(%Proto.ReadRequest{capsule_id: capsule_id}, state)

      assert {:ok, _} = Storage.ETS.get(ets, capsule_id)
      assert "SUCCESS" in audit_outcomes_for_capsule(capsule_id, "COSMP_READ")
    end

    test "read returns CAPSULE_NOT_FOUND for non-UUID + missing UUID", %{state: state} do
      assert {:error, %Proto.CosmpError{kind: :CAPSULE_NOT_FOUND}} =
               Operations.read(%Proto.ReadRequest{capsule_id: "does-not-exist"}, state)

      missing_uuid = Ecto.UUID.generate()

      assert {:error, %Proto.CosmpError{kind: :CAPSULE_NOT_FOUND}} =
               Operations.read(%Proto.ReadRequest{capsule_id: missing_uuid}, state)
    end

    test "audit returns ordered audit chain for capsule",
         %{state: state, owner: owner} do
      capsule_id = Ecto.UUID.generate()
      proto_capsule = build_proto_capsule(owner)

      {:ok, _} =
        Operations.write(%Proto.WriteRequest{capsule_id: capsule_id, capsule: proto_capsule}, state)

      {:ok, _} =
        Operations.share(%Proto.ShareRequest{capsule_id: capsule_id, grantee: "dan"}, state)

      assert {:ok, %Proto.AuditSuccess{entries: entries}} =
               Operations.audit(%Proto.AuditRequest{capsule_id: capsule_id}, state)

      assert length(entries) >= 2

      event_types = Enum.map(entries, & &1.event_type)
      assert "COSMP_WRITE" in event_types
      assert "COSMP_SHARE" in event_types

      assert audit_count_for_capsule(capsule_id, "COSMP_AUDIT") >= 1
    end
  end
end
