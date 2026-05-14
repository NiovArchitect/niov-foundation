defmodule CosmpRouter.RouterTest do
  @moduledoc """
  Sub-phase 6b `[BEAM-COSMP-INTEGRATION-TESTS]` Router GenServer
  tests consuming the refactored architecture from sub-phase 6a per
  ADR-0034 testability-refactor pattern + the substrate-build
  discipline canonical at ADR-0035 / RULE 11.

  ## Test-granularity-tier coherence

  Three tiers of Router tests:

  1. **Process lifecycle** — pure introspection of the
     application-supervised singleton. No DB. No per-test instance.
     2 tests at this tier.

  2. **Standalone audit-emission ops** — AUTHENTICATE + NEGOTIATE
     emit standalone `Audit.write_audit_event/1` from the Router
     process. Per-test Router + ETS instance via
     `CosmpRouter.RouterTestHelpers.start_router!/1`; per-test
     Sandbox owner via `start_sandbox_owner!/0` (Ecto canonical for
     supervised processes accessing the Repo). 3 tests at this tier.

  3. **DB-touching composed-mode ops** — WRITE/SHARE/REVOKE/READ/
     AUDIT/WRITE-replay use composed-mode `Ecto.Multi` per ADR-0033
     §Decision 4e + Idempotency layer per §Decision 6. Per-test
     Router + ETS + Sandbox owner + FK parents via
     `setup_router_fk!/0` (single shared UUID matching
     `Translator.pack/1` fallback semantics — wire-format-narrower-
     than-internal canonical per Google Protobuf "Use Different
     Messages For RPC APIs and Storage" best practice). 6 tests at
     this tier.

  ## References

  - ADR-0033 §Decision 4e (composed-mode audit) + §Decision 5
    (Storage facade) + §Decision 6 (Idempotency layer)
  - ADR-0026 §5 BEAM Pattern 4 + Pattern 5 instantiated at Router
    register
  - ADR-0034 (BEAM COSMP Testability Refactor Pattern; per-test
    instances via `start_supervised!`)
  - ADR-0035 (Substrate-Build Discipline Canonical; 9+ canonical
    observations including D-PHASE-2-PROTO-PERMS-LOSSY) + RULE 11
    (Wider Knowledge Check for Elixir/BEAM Substrate)
  """

  use ExUnit.Case, async: false

  import CosmpRouter.RouterTestHelpers

  alias CosmpRouter.{Proto, Router, Storage}
  alias CosmpRouter.Router.State

  describe "Router process lifecycle (no DB; pure introspection)" do
    test "Router is alive after app start" do
      assert is_pid(Process.whereis(Router))
    end

    test "Router state is initialized correctly (storage = facade post-5b-iii)" do
      state = :sys.get_state(Router)
      assert %State{} = state
      assert state.in_flight == %{}
      assert is_integer(state.started_at)
      # Sub-phase 5b-iii Commit B.1: storage pointer rotated from
      # Storage.ETS (5b-i hot-tier-only) to CosmpRouter.Storage
      # (the facade per ADR-0033 §Decision 5).
      assert state.storage == CosmpRouter.Storage
    end
  end

  describe "Standalone audit-emission ops (AUTHENTICATE + NEGOTIATE)" do
    setup do
      {router, ets} = start_router!()
      _owner = start_sandbox_owner!()

      proto_capsule = %Proto.Capsule{
        payload: "test-payload",
        permissions: %Proto.Permissions{owner: "test-owner", granted_to: []}
      }

      {:ok, router: router, ets: ets, capsule: proto_capsule}
    end

    test "AUTHENTICATE returns success for valid principal_id", %{router: router, capsule: capsule} do
      req = %Proto.AuthenticateRequest{capsule: capsule, principal_id: "alice"}

      assert {:ok, %Proto.AuthenticateSuccess{authenticated: true, principal_id: "alice"}} =
               GenServer.call(router, {:authenticate, req})

      assert audit_count_for_event_type("COSMP_AUTHENTICATE") >= 1
    end

    test "AUTHENTICATE returns PERMISSION_DENIED + emits DENIED audit for empty principal_id",
         %{router: router, capsule: capsule} do
      req = %Proto.AuthenticateRequest{capsule: capsule, principal_id: ""}

      assert {:error, %Proto.CosmpError{kind: :PERMISSION_DENIED}} =
               GenServer.call(router, {:authenticate, req})

      # Failure path emits audit with outcome="DENIED" per def66b9
      # hotfix (D-AUDIT-OUTCOME-ENUM resolution: PERMISSION_DENIED →
      # "DENIED"; AuditOutcome enum SUCCESS | DENIED | ERROR).
      denied = audit_outcomes_for_event_type("COSMP_AUTHENTICATE")
      assert "DENIED" in denied
    end

    test "NEGOTIATE returns granted_scopes echoing requested",
         %{router: router, capsule: capsule} do
      req = %Proto.NegotiateRequest{
        capsule: capsule,
        requested_scopes: ["read:capsule", "share:capsule"]
      }

      assert {:ok, %Proto.NegotiateSuccess{granted_scopes: ["read:capsule", "share:capsule"]}} =
               GenServer.call(router, {:negotiate, req})

      assert audit_count_for_event_type("COSMP_NEGOTIATE") >= 1
    end
  end

  describe "DB-touching composed-mode ops (WRITE/SHARE/REVOKE/READ/AUDIT/replay)" do
    setup do
      {router, ets} = start_router!()
      _owner = start_sandbox_owner!()
      owner_uuid = setup_router_fk!()

      {:ok, router: router, ets: ets, owner: owner_uuid}
    end

    test "WRITE composed-mode persists capsule + emits SUCCESS audit + records idempotency",
         %{router: router, owner: owner} do
      capsule_id = Ecto.UUID.generate()
      proto_capsule = build_proto_capsule(owner)
      req = %Proto.WriteRequest{capsule_id: capsule_id, capsule: proto_capsule}

      assert {:ok, %Proto.WriteSuccess{capsule_id: ^capsule_id}} =
               GenServer.call(router, {:write, req})

      # 1. memory_capsules row persisted via composed-mode Multi.
      #    Storage.Postgres.get/1 returns internal `%CosmpRouter.Capsule{}`
      #    via Translator.unpack (Proto.Capsule is the wire format only;
      #    storage layer returns the internal domain model).
      assert {:ok, %CosmpRouter.Capsule{}} = Storage.Postgres.get(capsule_id)

      # 2. audit_events row with outcome=SUCCESS per RULE 4 atomic
      #    compound (ADR-0033 §Decision 4e + ADR-0026 §5 Pattern 4)
      assert ["SUCCESS"] = audit_outcomes_for_capsule(capsule_id, "COSMP_WRITE")

      # 3. idempotency_keys row recorded per ADR-0033 §Decision 6 +
      #    ADR-0026 §5 Pattern 5 (idempotent verification keys)
      assert idempotency_key_exists?("write:#{capsule_id}:v1", "WRITE")
    end

    test "SHARE composed-mode adds grantee + emits SUCCESS audit + records idempotency",
         %{router: router, owner: owner} do
      capsule_id = Ecto.UUID.generate()
      proto_capsule = build_proto_capsule(owner)

      assert {:ok, _} =
               GenServer.call(router, {:write, %Proto.WriteRequest{
                 capsule_id: capsule_id,
                 capsule: proto_capsule
               }})

      grantee = "bob"

      assert {:ok, %Proto.ShareSuccess{capsule_id: ^capsule_id, granted_to: granted_to}} =
               GenServer.call(router, {:share, %Proto.ShareRequest{
                 capsule_id: capsule_id,
                 grantee: grantee
               }})

      assert grantee in granted_to
      assert "SUCCESS" in audit_outcomes_for_capsule(capsule_id, "COSMP_SHARE")
      assert idempotency_key_exists?("share:#{capsule_id}:#{grantee}", "SHARE")
    end

    test "REVOKE composed-mode removes grantee + emits SUCCESS audit + records idempotency",
         %{router: router, owner: owner} do
      capsule_id = Ecto.UUID.generate()
      proto_capsule = build_proto_capsule(owner)
      grantee = "carol"

      {:ok, _} = GenServer.call(router, {:write, %Proto.WriteRequest{
        capsule_id: capsule_id,
        capsule: proto_capsule
      }})

      {:ok, _} = GenServer.call(router, {:share, %Proto.ShareRequest{
        capsule_id: capsule_id,
        grantee: grantee
      }})

      assert {:ok, %Proto.RevokeSuccess{capsule_id: ^capsule_id, remaining_grantees: remaining}} =
               GenServer.call(router, {:revoke, %Proto.RevokeRequest{
                 capsule_id: capsule_id,
                 grantee: grantee
               }})

      refute grantee in remaining
      assert "SUCCESS" in audit_outcomes_for_capsule(capsule_id, "COSMP_REVOKE")
      assert idempotency_key_exists?("revoke:#{capsule_id}:#{grantee}", "REVOKE")
    end

    test "READ via Storage facade returns capsule (ETS-first; Postgres fallthrough)",
         %{router: router, ets: ets, owner: owner} do
      capsule_id = Ecto.UUID.generate()
      proto_capsule = build_proto_capsule(owner)

      {:ok, _} = GenServer.call(router, {:write, %Proto.WriteRequest{
        capsule_id: capsule_id,
        capsule: proto_capsule
      }})

      # Hot-tier hit path: ETS already warmed by WRITE
      assert {:ok, %Proto.Capsule{}} =
               GenServer.call(router, {:read, %Proto.ReadRequest{capsule_id: capsule_id}})

      # Cold-tier fallthrough path: purge ETS; READ via facade should
      # hit Postgres source-of-truth and warm ETS per ADR-0033 §5.
      :ok = Storage.ETS.clear(ets)
      assert {:error, :not_found} = Storage.ETS.get(ets, capsule_id)

      assert {:ok, %Proto.Capsule{}} =
               GenServer.call(router, {:read, %Proto.ReadRequest{capsule_id: capsule_id}})

      assert {:ok, _} = Storage.ETS.get(ets, capsule_id)
      assert "SUCCESS" in audit_outcomes_for_capsule(capsule_id, "COSMP_READ")
    end

    test "READ returns CAPSULE_NOT_FOUND for unknown capsule_id (non-UUID guard per D-PHASE-1-UUID-CAST)",
         %{router: router} do
      # Non-UUID format — D-PHASE-1-UUID-CAST guard at Storage.Postgres.get/1
      # returns :not_found rather than raising Ecto.Query.CastError.
      assert {:error, %Proto.CosmpError{kind: :CAPSULE_NOT_FOUND}} =
               GenServer.call(router, {:read, %Proto.ReadRequest{capsule_id: "does-not-exist"}})

      # Valid-UUID-format but missing — direct Postgres miss
      missing_uuid = Ecto.UUID.generate()

      assert {:error, %Proto.CosmpError{kind: :CAPSULE_NOT_FOUND}} =
               GenServer.call(router, {:read, %Proto.ReadRequest{capsule_id: missing_uuid}})
    end

    test "AUDIT returns ordered audit chain for capsule",
         %{router: router, owner: owner} do
      capsule_id = Ecto.UUID.generate()
      proto_capsule = build_proto_capsule(owner)

      {:ok, _} = GenServer.call(router, {:write, %Proto.WriteRequest{
        capsule_id: capsule_id,
        capsule: proto_capsule
      }})

      {:ok, _} = GenServer.call(router, {:share, %Proto.ShareRequest{
        capsule_id: capsule_id,
        grantee: "dan"
      }})

      assert {:ok, %Proto.AuditSuccess{entries: entries}} =
               GenServer.call(router, {:audit, %Proto.AuditRequest{capsule_id: capsule_id}})

      # AUDIT queries `audit_chain_for_capsule` BEFORE emitting its own
      # standalone COSMP_AUDIT event; returned entries reflect the
      # pre-AUDIT audit chain (WRITE + SHARE = 2 entries). The
      # COSMP_AUDIT event from this query is in the audit_events table
      # but emitted AFTER the chain query, so it's not in `entries`.
      assert length(entries) >= 2

      event_types = Enum.map(entries, & &1.event_type)
      assert "COSMP_WRITE" in event_types
      assert "COSMP_SHARE" in event_types

      # Verify COSMP_AUDIT event was emitted at the audit_events table
      # (queryable separately; not in `entries` because emitted post-query)
      assert audit_count_for_capsule(capsule_id, "COSMP_AUDIT") >= 1
    end

    test "WRITE replay with same capsule_id + version returns cached idempotency result",
         %{router: router, owner: owner} do
      capsule_id = Ecto.UUID.generate()
      proto_capsule = build_proto_capsule(owner)
      req = %Proto.WriteRequest{capsule_id: capsule_id, capsule: proto_capsule}

      # First WRITE: business mutation + audit emission + idempotency record
      assert {:ok, _} = GenServer.call(router, {:write, req})
      first_audit_count = audit_count_for_capsule(capsule_id, "COSMP_WRITE")

      # Second WRITE (replay): same idempotency key + scope → cached
      # result returned without re-emitting audit per ADR-0026 §5
      # Pattern 5 (idempotent verification keys).
      assert {:ok, _} = GenServer.call(router, {:write, req})
      second_audit_count = audit_count_for_capsule(capsule_id, "COSMP_WRITE")

      assert first_audit_count == second_audit_count,
             "replay should NOT emit a second audit event; Pattern 5 semantics"
    end
  end

end
