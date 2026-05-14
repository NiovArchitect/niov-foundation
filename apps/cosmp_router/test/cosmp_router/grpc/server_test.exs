defmodule CosmpRouter.GRPC.ServerTest do
  @moduledoc """
  Sub-phase 6b `[BEAM-COSMP-INTEGRATION-TESTS]` gRPC server handler
  tests consuming the refactored architecture at the gRPC layer per
  ADR-0034 Sub-decision 3 canonical (app-supervised Router +
  `Sandbox.allow` per Ecto canonical for app-supervised GenServer
  case + `Server.handler(req, nil)` per elixir-grpc test pattern
  canonical).

  ## Test pattern (substrate-coherent at broader-community register)

  Per Phase 0 RULE 11 research surface (Q-PHASE-3-GRPC-TEST-PATTERN
  Possibility 1 LOCKED):

  1. **Direct function call on handler** — `Server.authenticate(req,
     nil)`. NIOV's Server handlers use `def authenticate(req, _stream)`
     (the `_stream` discard pattern); passing nil is canonical per
     elixir-grpc test suite at `grpc_server/test/grpc/server_test.exs`.

  2. **App-supervised Router + Sandbox.allow** — per Ecto canonical
     for application-supervised GenServer accessed via the test
     process: `Sandbox.allow(Repo, self(), Process.whereis(Router))`
     shares the test's checked-out connection with the Router
     process.

  3. **Struct-literal Proto fixture construction** — `%Proto.X{...}`
     canonical per protobuf-elixir; `RouterTestHelpers.build_proto_capsule/1`
     promoted helper canonicalizes the test fixture.

  4. **UUID per test** — `Ecto.UUID.generate()` for capsule_id +
     `RouterTestHelpers.setup_router_fk!/0` for the shared owner UUID;
     avoids cross-test ETS state pollution at the singleton
     `CosmpRouter.Storage.ETS` (D-PHASE-3-ETS-NOT-TRANSACTIONAL
     substrate-state observation; ETS is non-transactional whereas
     Sandbox wraps Postgres in transactions rolled back at test end).

  ## References

  - ADR-0034 Sub-decision 3 (gRPC.Server hardcoded Router reference;
    `Sandbox.allow` canonical Ecto pattern)
  - ADR-0035 (Substrate-Build Discipline Canonical;
    D-RULE-11-REPEATED-ENGAGEMENT 14th observation;
    D-PHASE-3-ETS-NOT-TRANSACTIONAL 15th observation)
  - RULE 11 (Wider Knowledge Check for Elixir/BEAM Substrate)
  - elixir-grpc canonical server testing pattern
    (https://github.com/elixir-grpc/grpc/blob/master/grpc_server/test/grpc/server_test.exs)
  - Ecto.Adapters.SQL.Sandbox canonical for app-supervised GenServer
    (https://hexdocs.pm/ecto_sql/Ecto.Adapters.SQL.Sandbox.html)
  """

  use ExUnit.Case, async: false

  import CosmpRouter.RouterTestHelpers

  alias CosmpRouter.{Proto, Repo}
  alias CosmpRouter.GRPC.Server

  setup do
    # D-PHASE-3-SANDBOX-ALLOW-CROSS-TEST-CYCLE resolution per ADR-0034
    # Sub-decision 3 amendment scope (forward-queued): app-supervised
    # Router across sequential tests requires `start_owner!/stop_owner`
    # canonical Ecto v3 pattern (dedicated owner process surviving the
    # test process lifecycle; `shared: true` grants the Router process
    # access to the owner's connection). Per-test
    # `Sandbox.checkout + Sandbox.allow` surfaces
    # `DBConnection.OwnershipError` on the second test in the same
    # module run because the Router PID retains internal ownership
    # state from the prior test; `start_owner!` resolves at substrate-
    # coherent canonical register.
    owner = Ecto.Adapters.SQL.Sandbox.start_owner!(Repo, shared: true)
    on_exit(fn -> Ecto.Adapters.SQL.Sandbox.stop_owner(owner) end)
    owner_uuid = setup_router_fk!()
    {:ok, owner: owner_uuid}
  end

  describe "authenticate/2" do
    test "returns success when capsule + principal_id valid", %{owner: owner} do
      req = %Proto.AuthenticateRequest{
        capsule: build_proto_capsule(owner),
        principal_id: "test-principal"
      }

      resp = Server.authenticate(req, nil)

      assert %Proto.AuthenticateResponse{result: {:success, success}} = resp
      assert %Proto.AuthenticateSuccess{authenticated: true, principal_id: "test-principal"} =
               success

      assert audit_count_for_event_type("COSMP_AUTHENTICATE") >= 1
    end

    test "returns PERMISSION_DENIED + emits DENIED audit for empty principal_id",
         %{owner: owner} do
      req = %Proto.AuthenticateRequest{
        capsule: build_proto_capsule(owner),
        principal_id: ""
      }

      resp = Server.authenticate(req, nil)

      assert %Proto.AuthenticateResponse{result: {:error, err}} = resp
      assert %Proto.CosmpError{kind: :PERMISSION_DENIED} = err

      assert "DENIED" in audit_outcomes_for_event_type("COSMP_AUTHENTICATE")
    end
  end

  describe "negotiate/2" do
    test "returns granted_scopes echoing requested", %{owner: owner} do
      req = %Proto.NegotiateRequest{
        capsule: build_proto_capsule(owner),
        requested_scopes: ["read:capsule", "write:capsule"]
      }

      resp = Server.negotiate(req, nil)

      assert %Proto.NegotiateResponse{result: {:success, success}} = resp
      assert success.granted_scopes == ["read:capsule", "write:capsule"]

      assert audit_count_for_event_type("COSMP_NEGOTIATE") >= 1
    end
  end

  describe "write/2" do
    test "WRITE composed-mode succeeds + emits SUCCESS audit + records idempotency",
         %{owner: owner} do
      capsule_id = Ecto.UUID.generate()
      req = %Proto.WriteRequest{capsule_id: capsule_id, capsule: build_proto_capsule(owner)}

      resp = Server.write(req, nil)

      assert %Proto.WriteResponse{result: {:success, success}} = resp
      assert %Proto.WriteSuccess{capsule_id: ^capsule_id} = success

      assert "SUCCESS" in audit_outcomes_for_capsule(capsule_id, "COSMP_WRITE")
      assert idempotency_key_exists?("write:#{capsule_id}:v1", "WRITE")
    end
  end

  describe "share/2 + revoke/2" do
    test "SHARE adds grantee then REVOKE removes (composed-mode + idempotency)",
         %{owner: owner} do
      capsule_id = Ecto.UUID.generate()

      %Proto.WriteResponse{result: {:success, _}} =
        Server.write(
          %Proto.WriteRequest{capsule_id: capsule_id, capsule: build_proto_capsule(owner)},
          nil
        )

      grantee = "alice"

      share_resp =
        Server.share(%Proto.ShareRequest{capsule_id: capsule_id, grantee: grantee}, nil)

      assert %Proto.ShareResponse{result: {:success, share_success}} = share_resp
      assert grantee in share_success.granted_to
      assert "SUCCESS" in audit_outcomes_for_capsule(capsule_id, "COSMP_SHARE")
      assert idempotency_key_exists?("share:#{capsule_id}:#{grantee}", "SHARE")

      revoke_resp =
        Server.revoke(%Proto.RevokeRequest{capsule_id: capsule_id, grantee: grantee}, nil)

      assert %Proto.RevokeResponse{result: {:success, revoke_success}} = revoke_resp
      refute grantee in revoke_success.remaining_grantees
      assert "SUCCESS" in audit_outcomes_for_capsule(capsule_id, "COSMP_REVOKE")
      assert idempotency_key_exists?("revoke:#{capsule_id}:#{grantee}", "REVOKE")
    end
  end

  describe "read/2" do
    test "READ returns stored capsule after WRITE (gRPC oneof :capsule branch)",
         %{owner: owner} do
      capsule_id = Ecto.UUID.generate()

      %Proto.WriteResponse{result: {:success, _}} =
        Server.write(
          %Proto.WriteRequest{capsule_id: capsule_id, capsule: build_proto_capsule(owner)},
          nil
        )

      resp = Server.read(%Proto.ReadRequest{capsule_id: capsule_id}, nil)

      # Server.read wraps in :capsule branch (NOT :success) per Proto
      # schema canonical: ReadResponse.result is a oneof with :capsule
      # for success and :error for failure.
      assert %Proto.ReadResponse{result: {:capsule, capsule}} = resp
      assert %Proto.Capsule{} = capsule

      assert "SUCCESS" in audit_outcomes_for_capsule(capsule_id, "COSMP_READ")
    end

    test "READ returns CAPSULE_NOT_FOUND for non-UUID capsule_id (D-PHASE-1-UUID-CAST guard)" do
      # Non-UUID format — Storage.Postgres.get/1 guard returns
      # :not_found per D-PHASE-1-UUID-CAST resolution; Router emits
      # CAPSULE_NOT_FOUND error via emit_audit_failure (target_capsule_id
      # guarded to nil per the audit-emission-boundary fix).
      resp = Server.read(%Proto.ReadRequest{capsule_id: "does-not-exist"}, nil)

      assert %Proto.ReadResponse{result: {:error, err}} = resp
      assert %Proto.CosmpError{kind: :CAPSULE_NOT_FOUND} = err
    end
  end

  describe "audit/2" do
    test "AUDIT returns audit chain after WRITE + SHARE", %{owner: owner} do
      capsule_id = Ecto.UUID.generate()

      Server.write(
        %Proto.WriteRequest{capsule_id: capsule_id, capsule: build_proto_capsule(owner)},
        nil
      )

      Server.share(%Proto.ShareRequest{capsule_id: capsule_id, grantee: "bob"}, nil)

      resp = Server.audit(%Proto.AuditRequest{capsule_id: capsule_id}, nil)

      assert %Proto.AuditResponse{result: {:success, success}} = resp
      # AUDIT queries audit_chain BEFORE emitting its own standalone
      # COSMP_AUDIT event; returned entries reflect WRITE + SHARE pre-
      # AUDIT (router_test.exs canonical at sub-phase 6b).
      assert length(success.entries) >= 2

      event_types = Enum.map(success.entries, & &1.event_type)
      assert "COSMP_WRITE" in event_types
      assert "COSMP_SHARE" in event_types

      # COSMP_AUDIT event was emitted at audit_events table post-query
      assert audit_count_for_capsule(capsule_id, "COSMP_AUDIT") >= 1
    end
  end

  describe "WRITE replay (idempotency cache hit)" do
    test "WRITE replay with same capsule_id + version returns cached idempotency result",
         %{owner: owner} do
      capsule_id = Ecto.UUID.generate()
      req = %Proto.WriteRequest{capsule_id: capsule_id, capsule: build_proto_capsule(owner)}

      # First WRITE: business mutation + audit emission + idempotency record
      assert %Proto.WriteResponse{result: {:success, _}} = Server.write(req, nil)
      first_audit_count = audit_count_for_capsule(capsule_id, "COSMP_WRITE")

      # Second WRITE (replay): same idempotency key + scope → cached
      # result returned without re-emitting audit per ADR-0026 §5
      # Pattern 5 (idempotent verification keys).
      assert %Proto.WriteResponse{result: {:success, _}} = Server.write(req, nil)
      second_audit_count = audit_count_for_capsule(capsule_id, "COSMP_WRITE")

      assert first_audit_count == second_audit_count,
             "replay should NOT emit a second audit event; Pattern 5 semantics"
    end
  end
end
