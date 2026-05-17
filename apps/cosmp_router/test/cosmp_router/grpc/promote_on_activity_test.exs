defmodule CosmpRouter.GRPC.PromoteOnActivityTest do
  @moduledoc """
  Integration tests for the PERSONAL promote-on-activity dispatch substrate
  canonical at CosmpRouter.GRPC.Server per ADR-0039 §Sub-decision 8 amendment
  forward-substrate at C.4 commit register substantively per RULE 21 research
  arc canonical at 67f6112 commit substantively.

  ## Test substrate canonical at canonical-execution register

  Each test exercises the GRPC.Server handler with a PERSONAL or DEVICE
  entity_id; verifies the dispatch_with_promote_check shim canonical at
  substrate-architectural register substantively records activity in
  ActivityCounter and lazy-spawns a DMWWorker via Horde via-tuple once the
  configured threshold (default 5) is crossed.

  ## Cross-app integration substrate

  Tests exercise cross-application substrate canonical at canonical-
  coherence register substantively per Option ζ Adapter Pattern:
  cosmp_router GRPC.Server -> WalletCache lookup -> ActivityCounter
  record_activity + should_promote? -> DbgiSupervisor start_dmw_worker_horde
  -> DMWWorker handle_call -> CosmpRouter.Operations via adapter ->
  response back through Horde via-tuple to GRPC.Server.

  ## Cleanup discipline

  Each test that crosses the promotion threshold cleans up the spawned
  DMWWorker via stop_dmw_worker_horde/1 (C.2 substrate) and the
  ActivityCounter ETS entry via reset/1 in on_exit. Both operations are
  idempotent.

  ## References

  - ADR-0039 §Sub-decision 8 (ENTERPRISE-only at sub-phase b; amendment
    forward-substrate at C.4 commit for PERSONAL promote-on-activity)
  - ADR-0038 (DMWWorker substrate canonical at sub-phase a runtime register)
  - ADR-0034 (BEAM testability discipline)
  - RULE 21 (pre-authorization research arc canonical at 67f6112)
  """

  use ExUnit.Case, async: false

  import CosmpRouter.RouterTestHelpers,
    only: [start_sandbox_owner!: 0, setup_router_fk!: 0, build_proto_capsule: 1]

  alias CosmpRouter.{ActivityCounter, Proto, Repo, WalletCache}
  alias CosmpRouter.GRPC.Server

  setup do
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
        ('#{entity_id}'::uuid, 'PERSON', 'promote-on-activity test entity', 'pa_pubkey', NOW(), NOW())
    """)

    Repo.query!("""
      INSERT INTO wallets
        (wallet_id, entity_id, wallet_type, niov_can_access_contents, created_at, updated_at)
      VALUES
        ('#{wallet_id}'::uuid, '#{entity_id}'::uuid, '#{wallet_type_string}', false, NOW(), NOW())
    """)

    entity_id
  end

  defp negotiate_request(entity_id, owner_uuid) do
    capsule = build_proto_capsule(owner_uuid)

    %Proto.NegotiateRequest{
      capsule: capsule,
      requested_scopes: ["read:capsule"],
      entity_id: entity_id
    }
  end

  defp cleanup(entity_id) do
    _ = DbgiSupervisor.stop_dmw_worker_horde(entity_id)
    _ = ActivityCounter.reset(entity_id)
    :ok
  end

  describe "PERSONAL below promotion threshold dispatches through Router" do
    test "single PERSONAL dispatch increments counter + no DMWWorker spawned" do
      personal_entity_id = insert_entity_with_wallet("PERSONAL")
      assert {:ok, :personal} = WalletCache.wallet_type_for(personal_entity_id)
      owner_uuid = setup_router_fk!()

      on_exit(fn -> cleanup(personal_entity_id) end)

      req = negotiate_request(personal_entity_id, owner_uuid)
      response = Server.negotiate(req, nil)
      assert %Proto.NegotiateResponse{result: {:success, _}} = response

      # ActivityCounter incremented for PERSONAL dispatch
      assert 1 = ActivityCounter.get_count(personal_entity_id)

      # No DMWWorker spawned below threshold (default 5)
      assert :error = DbgiSupervisor.whereis_dmw_worker_horde(personal_entity_id)
    end
  end

  describe "PERSONAL at-or-above threshold promotes to DMWWorker" do
    test "5th PERSONAL dispatch crosses threshold + spawns DMWWorker" do
      personal_entity_id = insert_entity_with_wallet("PERSONAL")
      assert {:ok, :personal} = WalletCache.wallet_type_for(personal_entity_id)
      owner_uuid = setup_router_fk!()

      on_exit(fn -> cleanup(personal_entity_id) end)

      req = negotiate_request(personal_entity_id, owner_uuid)

      # First 4 dispatches stay below threshold (configured default = 5)
      for _ <- 1..4 do
        response = Server.negotiate(req, nil)
        assert %Proto.NegotiateResponse{result: {:success, _}} = response
      end

      # No DMWWorker yet at count=4 (still below threshold)
      assert :error = DbgiSupervisor.whereis_dmw_worker_horde(personal_entity_id)
      assert 4 = ActivityCounter.get_count(personal_entity_id)

      # 5th dispatch crosses threshold + spawns DMWWorker
      response = Server.negotiate(req, nil)
      assert %Proto.NegotiateResponse{result: {:success, _}} = response

      assert 5 = ActivityCounter.get_count(personal_entity_id)
      assert {:ok, pid} = DbgiSupervisor.whereis_dmw_worker_horde(personal_entity_id)
      assert is_pid(pid)
      assert Process.alive?(pid)
    end

    test "above-threshold dispatches reuse existing DMWWorker (idempotent)" do
      personal_entity_id = insert_entity_with_wallet("PERSONAL")
      assert {:ok, :personal} = WalletCache.wallet_type_for(personal_entity_id)
      owner_uuid = setup_router_fk!()

      on_exit(fn -> cleanup(personal_entity_id) end)

      req = negotiate_request(personal_entity_id, owner_uuid)

      # 5 dispatches to cross threshold + spawn worker
      for _ <- 1..5 do
        _ = Server.negotiate(req, nil)
      end

      {:ok, first_pid} =
        DbgiSupervisor.whereis_dmw_worker_horde(personal_entity_id)

      # Subsequent dispatches reuse the same worker
      _ = Server.negotiate(req, nil)
      _ = Server.negotiate(req, nil)

      {:ok, second_pid} =
        DbgiSupervisor.whereis_dmw_worker_horde(personal_entity_id)

      assert first_pid == second_pid
      assert 7 = ActivityCounter.get_count(personal_entity_id)
    end
  end

  describe "PERSONAL post-eviction returns to Router fallback" do
    test "after stop_dmw_worker_horde + reset, next dispatch fresh-starts at Router" do
      personal_entity_id = insert_entity_with_wallet("PERSONAL")
      assert {:ok, :personal} = WalletCache.wallet_type_for(personal_entity_id)
      owner_uuid = setup_router_fk!()

      on_exit(fn -> cleanup(personal_entity_id) end)

      req = negotiate_request(personal_entity_id, owner_uuid)

      # Cross threshold + spawn worker
      for _ <- 1..5 do
        _ = Server.negotiate(req, nil)
      end

      assert {:ok, _pid} =
               DbgiSupervisor.whereis_dmw_worker_horde(personal_entity_id)

      # Evict: terminate worker + reset counter
      :ok = DbgiSupervisor.stop_dmw_worker_horde(personal_entity_id)
      true = ActivityCounter.reset(personal_entity_id)

      # CRDT-coordinated termination canonical at canonical-execution
      # register substantively; allow eventual consistency settle.
      :timer.sleep(50)

      assert :error =
               DbgiSupervisor.whereis_dmw_worker_horde(personal_entity_id)
      assert 0 = ActivityCounter.get_count(personal_entity_id)

      # Next dispatch starts fresh: Router fallback + counter at 1
      response = Server.negotiate(req, nil)
      assert %Proto.NegotiateResponse{result: {:success, _}} = response

      assert 1 = ActivityCounter.get_count(personal_entity_id)
      assert :error =
               DbgiSupervisor.whereis_dmw_worker_horde(personal_entity_id)
    end
  end

  describe "DEVICE always dispatches through Router (no promote-check)" do
    test "DEVICE dispatch does NOT touch ActivityCounter and does NOT spawn DMWWorker" do
      device_entity_id = insert_entity_with_wallet("DEVICE")
      assert {:ok, :device} = WalletCache.wallet_type_for(device_entity_id)
      owner_uuid = setup_router_fk!()

      on_exit(fn -> cleanup(device_entity_id) end)

      req = negotiate_request(device_entity_id, owner_uuid)

      # DEVICE bypasses dispatch_with_promote_check entirely per substrate-
      # state ground truth at grpc/server.ex {:ok, _other_tier} branch
      # (DEVICE cold-shard substrate forward-substrate at sub-phase d).
      for _ <- 1..6 do
        response = Server.negotiate(req, nil)
        assert %Proto.NegotiateResponse{result: {:success, _}} = response
      end

      # ActivityCounter NOT touched for DEVICE tier
      assert 0 = ActivityCounter.get_count(device_entity_id)

      # No DMWWorker spawned for DEVICE tier
      assert :error = DbgiSupervisor.whereis_dmw_worker_horde(device_entity_id)
    end
  end

  describe "ActivityCounter integration is PERSONAL-tier-scoped" do
    test "record_activity fires for PERSONAL on every dispatch (granular verification)" do
      personal_entity_id = insert_entity_with_wallet("PERSONAL")
      assert {:ok, :personal} = WalletCache.wallet_type_for(personal_entity_id)
      owner_uuid = setup_router_fk!()

      on_exit(fn -> cleanup(personal_entity_id) end)

      req = negotiate_request(personal_entity_id, owner_uuid)

      assert 0 = ActivityCounter.get_count(personal_entity_id)

      _ = Server.negotiate(req, nil)
      assert 1 = ActivityCounter.get_count(personal_entity_id)

      _ = Server.negotiate(req, nil)
      assert 2 = ActivityCounter.get_count(personal_entity_id)

      _ = Server.negotiate(req, nil)
      assert 3 = ActivityCounter.get_count(personal_entity_id)
    end
  end
end
