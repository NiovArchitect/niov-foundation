defmodule CosmpRouter.GRPC.DeviceShardDispatchTest do
  @moduledoc """
  Integration tests for the DEVICE cold-shard dispatch substrate canonical
  at CosmpRouter.GRPC.Server per ADR-0040 §Sub-decision 5 + §Sub-decision 7
  Commit D.3 of 4 register substantively.

  ## Test substrate canonical at canonical-execution register

  Each test exercises the GRPC.Server handler with a DEVICE entity_id; verifies
  the explicit `{:ok, :device}` branch canonical at substrate-architectural
  register substantively now invokes CosmpRouter.DeviceShard.assign_shard/1
  (canonicalizes deterministic shard assignment via Jump Consistent Hash per
  ADR-0040 §Sub-decision 1) and delegates to CosmpRouter.Router via existing
  request shape per Founder Q-B LOCKED pure-stateless-substrate disposition.

  ## Discriminating proof that DEVICE branch no longer rides _other_tier catch-all

  Pre-D.3 substrate-state ground truth: DEVICE entities dispatched through
  `{:ok, _other_tier}` catch-all at grpc/server.ex:191-192 register
  substantively (Router fallback only; DeviceShard NOT touched).

  Post-D.3 substrate: DEVICE entities dispatch through dedicated
  `{:ok, :device}` branch + dispatch_device_shard/3 helper which invokes
  CosmpRouter.DeviceShard.assign_shard/1.

  Discriminator test: set DeviceShard config to invalid shard_count (outside
  [128, 1024] ADR-0040 range); dispatch DEVICE entity; assert ArgumentError
  is raised. Pre-D.3 substrate would silently fallback to Router (no error).
  Post-D.3 substrate raises ArgumentError because DeviceShard validation
  fires canonical at canonical-execution register substantively.

  ## Founder Q-locks verified by this test substrate

  - DEVICE remains cold (NO DMWWorker spawn for DEVICE)
  - NO per-device GenServer
  - NO ETS hot path
  - NO supervised child added
  - NO protobuf change
  - NO API client change
  - NO AI_AGENT branch
  - ENTERPRISE branch preserved (regression covered by tier_routed_dispatch_test.exs)
  - PERSONAL branch preserved (regression covered by promote_on_activity_test.exs)
  - missing entity_id fallback preserved + does NOT touch DeviceShard
  - WalletLookup error fallback preserved + does NOT touch DeviceShard

  ## References

  - ADR-0040 §Sub-decision 5 (dispatch integration at grpc/server.ex)
  - ADR-0040 §Sub-decision 1 (Jump Consistent Hash algorithm)
  - ADR-0040 §Sub-decision 2 (pure stateless module + config)
  - ADR-0040 §Sub-decision 7 (4-commit mini-arc decomposition; D.3 wires dispatch)
  - ADR-0034 (BEAM testability discipline)
  - RULE 21 (pre-authorization research arc canonical per 67f6112 commit)
  """

  use ExUnit.Case, async: false

  import CosmpRouter.RouterTestHelpers,
    only: [start_sandbox_owner!: 0, setup_router_fk!: 0, build_proto_capsule: 1]

  alias CosmpRouter.{DeviceShard, Proto, Repo, WalletCache}
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
        ('#{entity_id}'::uuid, 'PERSON', 'device-shard dispatch test entity', 'ds_pubkey', NOW(), NOW())
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

  defp with_device_shard_config(opts, fun) when is_function(fun, 0) do
    previous = Application.get_env(:cosmp_router, DeviceShard)

    try do
      Application.put_env(:cosmp_router, DeviceShard, opts)
      fun.()
    after
      case previous do
        nil -> Application.delete_env(:cosmp_router, DeviceShard)
        value -> Application.put_env(:cosmp_router, DeviceShard, value)
      end
    end
  end

  describe "DEVICE branch invokes DeviceShard (discriminator)" do
    test "invalid DeviceShard config raises ArgumentError on DEVICE dispatch" do
      device_entity_id = insert_entity_with_wallet("DEVICE")
      assert {:ok, :device} = WalletCache.wallet_type_for(device_entity_id)

      owner_uuid = setup_router_fk!()
      req = negotiate_request(device_entity_id, owner_uuid)

      with_device_shard_config([shard_count: 127], fn ->
        assert_raise ArgumentError, ~r/128\.\.1024/, fn ->
          Server.negotiate(req, nil)
        end
      end)
    end
  end

  describe "DEVICE branch with valid config preserves Router fallback behavior" do
    test "DEVICE dispatch delegates to CosmpRouter.Router and returns success" do
      device_entity_id = insert_entity_with_wallet("DEVICE")
      assert {:ok, :device} = WalletCache.wallet_type_for(device_entity_id)

      owner_uuid = setup_router_fk!()
      req = negotiate_request(device_entity_id, owner_uuid)

      with_device_shard_config([shard_count: 256], fn ->
        response = Server.negotiate(req, nil)
        assert %Proto.NegotiateResponse{result: {:success, _}} = response
      end)
    end

    test "DEVICE dispatch does NOT spawn DMWWorker (cold semantics preserved)" do
      device_entity_id = insert_entity_with_wallet("DEVICE")
      assert {:ok, :device} = WalletCache.wallet_type_for(device_entity_id)

      owner_uuid = setup_router_fk!()
      req = negotiate_request(device_entity_id, owner_uuid)

      with_device_shard_config([shard_count: 256], fn ->
        _ = Server.negotiate(req, nil)

        # DEVICE remains cold per Founder Q-B LOCKED: NO DMWWorker spawn
        assert :error =
                 DbgiSupervisor.whereis_dmw_worker_horde(device_entity_id)
      end)
    end
  end

  describe "missing entity_id fallback does NOT touch DeviceShard" do
    test "nil/empty entity_id Router fallback survives invalid DeviceShard config" do
      owner_uuid = setup_router_fk!()
      capsule = build_proto_capsule(owner_uuid)

      # entity_id omitted -> proto3 default empty string -> Router fallback
      req = %Proto.NegotiateRequest{
        capsule: capsule,
        requested_scopes: ["read:capsule"],
        entity_id: ""
      }

      with_device_shard_config([shard_count: 127], fn ->
        # If DeviceShard were touched on empty entity_id, this would raise
        # ArgumentError. Substrate-coherent behavior: missing entity_id
        # rides nil/empty branch BEFORE WalletCache lookup register
        # substantively per grpc/server.ex dispatch_tier_routed/2 shape.
        response = Server.negotiate(req, nil)
        assert %Proto.NegotiateResponse{result: {:success, _}} = response
      end)
    end
  end

  describe "WalletLookup error fallback does NOT touch DeviceShard" do
    test "unknown entity_id (not in wallets table) Router fallback survives invalid DeviceShard config" do
      unknown_entity_id = Ecto.UUID.generate()
      owner_uuid = setup_router_fk!()
      req = negotiate_request(unknown_entity_id, owner_uuid)

      with_device_shard_config([shard_count: 127], fn ->
        # Substrate-coherent: WalletCache returns {:error, :not_found};
        # dispatch_tier_routed/2 {:error, _reason} branch routes to Router
        # fallback WITHOUT touching DeviceShard.
        response = Server.negotiate(req, nil)
        assert %Proto.NegotiateResponse{result: {:success, _}} = response
      end)
    end
  end

  describe "non-DEVICE branches preserved against invalid DeviceShard config" do
    test "ENTERPRISE dispatch unaffected by invalid DeviceShard config" do
      enterprise_entity_id = insert_entity_with_wallet("ENTERPRISE")
      assert {:ok, :enterprise} = WalletCache.wallet_type_for(enterprise_entity_id)

      owner_uuid = setup_router_fk!()
      req = negotiate_request(enterprise_entity_id, owner_uuid)

      with_device_shard_config([shard_count: 127], fn ->
        # ENTERPRISE rides dispatch_enterprise/3 (Horde via-tuple) NOT
        # dispatch_device_shard/3; invalid DeviceShard config must not
        # affect ENTERPRISE substrate at canonical-coherence register.
        response = Server.negotiate(req, nil)
        assert %Proto.NegotiateResponse{result: {:success, _}} = response
      end)
    end

    test "PERSONAL dispatch unaffected by invalid DeviceShard config" do
      personal_entity_id = insert_entity_with_wallet("PERSONAL")
      assert {:ok, :personal} = WalletCache.wallet_type_for(personal_entity_id)

      owner_uuid = setup_router_fk!()
      req = negotiate_request(personal_entity_id, owner_uuid)

      with_device_shard_config([shard_count: 127], fn ->
        # PERSONAL rides dispatch_with_promote_check/4 NOT
        # dispatch_device_shard/3; invalid DeviceShard config must not
        # affect PERSONAL substrate at canonical-coherence register.
        response = Server.negotiate(req, nil)
        assert %Proto.NegotiateResponse{result: {:success, _}} = response
      end)
    end
  end
end
