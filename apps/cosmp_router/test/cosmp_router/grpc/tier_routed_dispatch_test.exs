defmodule CosmpRouter.GRPC.TierRoutedDispatchTest do
  @moduledoc """
  Integration tests for the tier-routed dispatch shim canonical at
  CosmpRouter.GRPC.Server per ADR-0039 Sub-decision 7 + Option ζ
  Adapter Pattern canonical at canonical-knowledge register
  substantively per RULE 21 research arc canonical at 67f6112 commit
  substantively.

  ## Test substrate canonical at canonical-execution register

  Each test exercises the GRPC.Server handler with an entity_id-bearing
  request; verifies the tier-routed dispatch path canonical at
  substrate-architectural register substantively branches per WalletCache
  lookup result:

  - empty/nil entity_id: fallback to CosmpRouter.Router (backward-compat)
  - {:ok, :enterprise}: dispatch through DMWWorker via Horde via-tuple
  - {:ok, :personal | :device}: fallback to CosmpRouter.Router
  - {:error, :not_found}: fallback to CosmpRouter.Router

  ## Cross-app integration substrate

  Tests exercise cross-application substrate canonical at canonical-
  coherence register substantively per Option ζ Adapter Pattern:
  cosmp_router GRPC.Server -> WalletCache lookup -> DbgiSupervisor
  start_dmw_worker_horde -> DMWWorker handle_call -> CosmpRouter.Operations
  via adapter -> response back through Horde via-tuple to GRPC.Server.

  ## References

  - ADR-0039 Sub-decision 7 (tier-routed dispatch shim)
  - ADR-0039 Sub-decision 3 amendment (Adapter Pattern; Option ζ)
  - ADR-0034 (BEAM testability discipline)
  - RULE 21 (pre-authorization research arc canonical at 67f6112)
  """

  use ExUnit.Case, async: false

  import CosmpRouter.RouterTestHelpers,
    only: [start_sandbox_owner!: 0, setup_router_fk!: 0, build_proto_capsule: 1]

  alias CosmpRouter.{Proto, Repo, WalletCache}
  alias CosmpRouter.GRPC.Server

  setup do
    # start_sandbox_owner!/0 handles its own on_exit cleanup at canonical-
    # coherence register substantively per RouterTestHelpers canonical.
    _owner = start_sandbox_owner!()
    :ok
  end

  defp insert_entity_with_wallet(wallet_type_string) do
    entity_id = Ecto.UUID.generate()
    wallet_id = Ecto.UUID.generate()

    Repo.query!("""
      INSERT INTO entities
        (entity_id, entity_type, display_name, public_key, created_at, updated_at)
      VALUES
        ('#{entity_id}'::uuid, 'PERSON', 'tier-routed test entity', 'tr_pubkey', NOW(), NOW())
    """)

    Repo.query!("""
      INSERT INTO wallets
        (wallet_id, entity_id, wallet_type, niov_can_access_contents, created_at, updated_at)
      VALUES
        ('#{wallet_id}'::uuid, '#{entity_id}'::uuid, '#{wallet_type_string}', false, NOW(), NOW())
    """)

    entity_id
  end

  describe "empty entity_id falls back to CosmpRouter.Router (backward-compat)" do
    test "negotiate without entity_id uses Router path" do
      owner_uuid = setup_router_fk!()
      capsule = build_proto_capsule(owner_uuid)

      # entity_id omitted -> proto3 default empty string -> Router fallback
      req = %Proto.NegotiateRequest{
        capsule: capsule,
        requested_scopes: ["read:capsule"],
        entity_id: ""
      }

      response = Server.negotiate(req, nil)
      assert %Proto.NegotiateResponse{result: {:success, _}} = response
    end
  end

  describe "ENTERPRISE entity_id dispatches through DMWWorker via Horde" do
    test "negotiate with ENTERPRISE entity_id spawns DMWWorker + dispatches" do
      enterprise_entity_id = insert_entity_with_wallet("ENTERPRISE")
      owner_uuid = setup_router_fk!()
      capsule = build_proto_capsule(owner_uuid)

      req = %Proto.NegotiateRequest{
        capsule: capsule,
        requested_scopes: ["read:capsule"],
        entity_id: enterprise_entity_id
      }

      response = Server.negotiate(req, nil)
      assert %Proto.NegotiateResponse{result: {:success, _}} = response

      # Verify DMWWorker was spawned via Horde Registry
      assert {:ok, _pid} =
               DbgiSupervisor.whereis_dmw_worker_horde(enterprise_entity_id)
    end

    test "idempotent ENTERPRISE dispatch reuses existing DMWWorker" do
      enterprise_entity_id = insert_entity_with_wallet("ENTERPRISE")
      owner_uuid = setup_router_fk!()
      capsule = build_proto_capsule(owner_uuid)

      req = %Proto.NegotiateRequest{
        capsule: capsule,
        requested_scopes: ["read:capsule"],
        entity_id: enterprise_entity_id
      }

      _ = Server.negotiate(req, nil)
      {:ok, first_pid} = DbgiSupervisor.whereis_dmw_worker_horde(enterprise_entity_id)

      _ = Server.negotiate(req, nil)
      {:ok, second_pid} = DbgiSupervisor.whereis_dmw_worker_horde(enterprise_entity_id)

      assert first_pid == second_pid
    end
  end

  describe "non-ENTERPRISE tiers fall back to CosmpRouter.Router" do
    test "PERSONAL entity_id uses Router path" do
      personal_entity_id = insert_entity_with_wallet("PERSONAL")
      # warm cache so lookup hits ETS
      assert {:ok, :personal} = WalletCache.wallet_type_for(personal_entity_id)

      owner_uuid = setup_router_fk!()
      capsule = build_proto_capsule(owner_uuid)

      req = %Proto.NegotiateRequest{
        capsule: capsule,
        requested_scopes: ["read:capsule"],
        entity_id: personal_entity_id
      }

      response = Server.negotiate(req, nil)
      assert %Proto.NegotiateResponse{result: {:success, _}} = response

      # Verify NO DMWWorker spawned for PERSONAL tier
      assert :error = DbgiSupervisor.whereis_dmw_worker_horde(personal_entity_id)
    end

    test "DEVICE entity_id uses Router path" do
      device_entity_id = insert_entity_with_wallet("DEVICE")
      assert {:ok, :device} = WalletCache.wallet_type_for(device_entity_id)

      owner_uuid = setup_router_fk!()
      capsule = build_proto_capsule(owner_uuid)

      req = %Proto.NegotiateRequest{
        capsule: capsule,
        requested_scopes: ["read:capsule"],
        entity_id: device_entity_id
      }

      response = Server.negotiate(req, nil)
      assert %Proto.NegotiateResponse{result: {:success, _}} = response

      assert :error = DbgiSupervisor.whereis_dmw_worker_horde(device_entity_id)
    end
  end

  describe "unknown entity_id falls back to CosmpRouter.Router" do
    test "missing entity in DB returns success via Router fallback" do
      unknown_entity_id = Ecto.UUID.generate()
      owner_uuid = setup_router_fk!()
      capsule = build_proto_capsule(owner_uuid)

      req = %Proto.NegotiateRequest{
        capsule: capsule,
        requested_scopes: ["read:capsule"],
        entity_id: unknown_entity_id
      }

      response = Server.negotiate(req, nil)
      assert %Proto.NegotiateResponse{result: {:success, _}} = response

      assert :error = DbgiSupervisor.whereis_dmw_worker_horde(unknown_entity_id)
    end
  end
end
