defmodule CosmpRouter.GRPC.Server do
  @moduledoc """
  gRPC server module for the COSMP coordination layer per ADR-0032
  (BEAM gRPC Interop Architecture). Listens on HTTP/2 for incoming
  Protobuf-encoded requests from the Fastify+TypeScript API
  (`apps/api/src/services/cosmp-client.ts`) and dispatches the 7
  patent-canonical COSMP operations per US 12,517,919 to the
  `CosmpRouter.Router` GenServer.

  ## ADR-0032 §Decision implementation register

  - **Call semantics: synchronous unary** — each RPC dispatches via
    `GenServer.call/3` to `CosmpRouter.Router`; awaits response struct.
  - **Auth boundary: Fastify, NOT gRPC** — per ADR-0032; this server
    trusts callers (mTLS for transport security arrives at sub-phase
    11+ observability per RULE 20/ADR-0027 alignment).
  - **Error envelope `oneof` discipline** — Router returns
    `{:ok, success_struct}` or `{:error, %CosmpError{}}`; this server
    wraps each into the response message's `oneof :result` branch.
  - **Per-RPC handler functions** — one handler per patent-canonical
    op (authenticate, negotiate, read, write, share, revoke, audit);
    patent-canonical surface visibility per ADR-0031 Q-I + ADR-0032
    §Decision Protobuf canonical structure.

  ## Sub-phase 5b-i status (this commit)

  All 7 RPCs implemented; full 7-op bridge per Q-N (production
  live-grade; no `:not_implemented` stubs cross gRPC boundary).
  Router fills all 7 `handle_call` bodies against ETS-backed storage
  per Q-T. Sub-phase 5b-ii [BEAM-COSMP-INTEROP-PERSISTENCE] layered
  Postgres source-of-truth on top per ADR-0033 §Decision 5
  (Storage facade); Router consumer integration at sub-phase 5b-iii
  Commit B.1 [BEAM-COSMP-INTEROP-INTEGRATION-ROUTER] per ADR-0033
  §Decision 4e (composed-mode discipline).

  ## References

  - ADR-0032 (BEAM gRPC Interop Architecture) §Decision
  - ADR-0031 (BEAM Routing Substrate Architecture) §Decision Router
    dispatch + supervision tree integration
  - ADR-0026 (Dual-Control Middleware Pattern) §5 Pattern 2
    (supervisor-friendly failure modes) — informs `oneof` discipline
  - US 12,517,919 (COSMP Protocol patent — 7 ops + 7-layer Capsule)
  """

  use GRPC.Server, service: CosmpRouter.Proto.CosmpRouter.Service

  alias CosmpRouter.Proto

  # ============================================================================
  # AUTHENTICATE — DMW/principal identity verification
  # ============================================================================

  @spec authenticate(Proto.AuthenticateRequest.t(), GRPC.Server.Stream.t()) ::
          Proto.AuthenticateResponse.t()
  def authenticate(%Proto.AuthenticateRequest{} = req, _stream) do
    case dispatch_tier_routed(:authenticate, req) do
      {:ok, %Proto.AuthenticateSuccess{} = success} ->
        %Proto.AuthenticateResponse{result: {:success, success}}

      {:error, %Proto.CosmpError{} = error} ->
        %Proto.AuthenticateResponse{result: {:error, error}}
    end
  end

  # ============================================================================
  # NEGOTIATE — Cross-DMW capability + scope agreement
  # ============================================================================

  @spec negotiate(Proto.NegotiateRequest.t(), GRPC.Server.Stream.t()) ::
          Proto.NegotiateResponse.t()
  def negotiate(%Proto.NegotiateRequest{} = req, _stream) do
    case dispatch_tier_routed(:negotiate, req) do
      {:ok, %Proto.NegotiateSuccess{} = success} ->
        %Proto.NegotiateResponse{result: {:success, success}}

      {:error, %Proto.CosmpError{} = error} ->
        %Proto.NegotiateResponse{result: {:error, error}}
    end
  end

  # ============================================================================
  # READ — Metadata-first capsule retrieval
  # ============================================================================

  @spec read(Proto.ReadRequest.t(), GRPC.Server.Stream.t()) ::
          Proto.ReadResponse.t()
  def read(%Proto.ReadRequest{} = req, _stream) do
    case dispatch_tier_routed(:read, req) do
      {:ok, %Proto.Capsule{} = capsule} ->
        %Proto.ReadResponse{result: {:capsule, capsule}}

      {:error, %Proto.CosmpError{} = error} ->
        %Proto.ReadResponse{result: {:error, error}}
    end
  end

  # ============================================================================
  # WRITE — Append-only capsule write with audit-chain
  # ============================================================================

  @spec write(Proto.WriteRequest.t(), GRPC.Server.Stream.t()) ::
          Proto.WriteResponse.t()
  def write(%Proto.WriteRequest{} = req, _stream) do
    case dispatch_tier_routed(:write, req) do
      {:ok, %Proto.WriteSuccess{} = success} ->
        %Proto.WriteResponse{result: {:success, success}}

      {:error, %Proto.CosmpError{} = error} ->
        %Proto.WriteResponse{result: {:error, error}}
    end
  end

  # ============================================================================
  # SHARE — Permissioned scope grant across DMWs
  # ============================================================================

  @spec share(Proto.ShareRequest.t(), GRPC.Server.Stream.t()) ::
          Proto.ShareResponse.t()
  def share(%Proto.ShareRequest{} = req, _stream) do
    case dispatch_tier_routed(:share, req) do
      {:ok, %Proto.ShareSuccess{} = success} ->
        %Proto.ShareResponse{result: {:success, success}}

      {:error, %Proto.CosmpError{} = error} ->
        %Proto.ShareResponse{result: {:error, error}}
    end
  end

  # ============================================================================
  # REVOKE — Capability revocation + downstream cascade
  # ============================================================================

  @spec revoke(Proto.RevokeRequest.t(), GRPC.Server.Stream.t()) ::
          Proto.RevokeResponse.t()
  def revoke(%Proto.RevokeRequest{} = req, _stream) do
    case dispatch_tier_routed(:revoke, req) do
      {:ok, %Proto.RevokeSuccess{} = success} ->
        %Proto.RevokeResponse{result: {:success, success}}

      {:error, %Proto.CosmpError{} = error} ->
        %Proto.RevokeResponse{result: {:error, error}}
    end
  end

  # ============================================================================
  # AUDIT — Append-only audit log query (pre-success guaranteed)
  # ============================================================================

  @spec audit(Proto.AuditRequest.t(), GRPC.Server.Stream.t()) ::
          Proto.AuditResponse.t()
  def audit(%Proto.AuditRequest{} = req, _stream) do
    case dispatch_tier_routed(:audit, req) do
      {:ok, %Proto.AuditSuccess{} = success} ->
        %Proto.AuditResponse{result: {:success, success}}

      {:error, %Proto.CosmpError{} = error} ->
        %Proto.AuditResponse{result: {:error, error}}
    end
  end

  # ============================================================================
  # Sub-arc 1 sub-phase b Commit B.6.3 [BEAM-COSMP-HIVE-DISPATCH-INTEGRATION]
  # Tier-routed dispatch shim per ADR-0039 Sub-decision 7 + Option ζ Adapter
  # Pattern canonical at canonical-knowledge register substantively per RULE
  # 21 research arc canonical at 67f6112 commit substantively.
  #
  # Sub-arc 1 sub-phase c Commit C.3 [BEAM-DBGI-PROMOTE-TIER-ROUTED-DISPATCH]
  # PERSONAL branch extended canonical at canonical-execution register
  # substantively per ADR-0039 §Sub-decision 8 amendment forward-substrate at
  # C.4 commit register substantively: record_activity at ActivityCounter +
  # should_promote? threshold check; if crossed dispatch_promoted (DMWWorker
  # via-tuple); else Router fallback canonical at backward-compat register.
  #
  # Sub-arc 1 sub-phase d Commit D.3 [BEAM-DBGI-DEVICE-SHARD-DISPATCH-INTEGRATION]
  # DEVICE branch wired canonical at canonical-execution register substantively
  # per ADR-0040 §Sub-decision 5 register substantively: explicit {:ok, :device}
  # branch BEFORE {:ok, _other_tier} catch-all; dispatch_device_shard/3
  # canonicalizes deterministic shard assignment via CosmpRouter.DeviceShard.
  # DEVICE remains cold canonical at substrate-architectural register
  # substantively (NO DMWWorker spawn; NO always-hot per-DMW process; pure
  # dispatch routing through Router fallback per ADR-0040 §Sub-decision 5 +
  # Founder Q-B LOCKED pure-stateless-substrate disposition register).
  # ============================================================================
  #
  # Reads entity_id from request; resolves wallet_type via WalletCache;
  # branches:
  # - empty/nil entity_id: fallback to CosmpRouter.Router (backward-compat)
  # - {:ok, :enterprise}: dispatch through DMWWorker via Horde via-tuple
  #   (lazy-spawn if not registered; then GenServer.call to the worker)
  # - {:ok, :personal}: promote-on-activity dispatch per C.3 substrate
  #   (record_activity + threshold check; below = Router; at-or-above =
  #   DMWWorker via Horde via-tuple)
  # - {:ok, :device}: DEVICE cold-shard dispatch per D.3 substrate (assigns
  #   deterministic shard_id via CosmpRouter.DeviceShard; delegates to Router
  #   with existing request shape; NO DMWWorker spawn; NO per-DMW process)
  # - {:ok, _other_tier}: fallback to CosmpRouter.Router (unknown WalletType)
  # - {:error, _}: fallback to CosmpRouter.Router (unknown entity)
  defp dispatch_tier_routed(op_name, request) do
    case extract_entity_id(request) do
      nil ->
        GenServer.call(CosmpRouter.Router, {op_name, request})

      "" ->
        GenServer.call(CosmpRouter.Router, {op_name, request})

      entity_id when is_binary(entity_id) ->
        case CosmpRouter.WalletCache.wallet_type_for(entity_id) do
          {:ok, :enterprise} ->
            dispatch_enterprise(op_name, entity_id, request)

          {:ok, :personal} ->
            dispatch_with_promote_check(op_name, entity_id, :personal, request)

          {:ok, :device} ->
            dispatch_device_shard(op_name, entity_id, request)

          {:ok, _other_tier} ->
            GenServer.call(CosmpRouter.Router, {op_name, request})

          {:error, _reason} ->
            GenServer.call(CosmpRouter.Router, {op_name, request})
        end
    end
  end

  defp dispatch_enterprise(op_name, entity_id, request) do
    case DbgiSupervisor.start_dmw_worker_horde(entity_id, :enterprise) do
      {:ok, _pid} ->
        GenServer.call(
          {:via, Horde.Registry, {DbgiSupervisor.HordeRegistry, entity_id}},
          {:cosmp_op, op_name, request}
        )

      {:error, reason} ->
        {:error,
         %Proto.CosmpError{
           kind: :INTERNAL,
           message: "DMW spawn failed: #{inspect(reason)}",
           details: %{}
         }}
    end
  end

  # Sub-arc 1 sub-phase c Commit C.3 [BEAM-DBGI-PROMOTE-TIER-ROUTED-DISPATCH]
  # Promote-on-activity gate: records activity in ActivityCounter ETS; if
  # threshold crossed (configured default 5), lazy-spawns DMWWorker via
  # dispatch_promoted (same Horde via-tuple shape as dispatch_enterprise);
  # else dispatches through CosmpRouter.Router (backward-compat fallback).
  defp dispatch_with_promote_check(op_name, entity_id, wallet_type, request) do
    _ = CosmpRouter.ActivityCounter.record_activity(entity_id)

    if CosmpRouter.ActivityCounter.should_promote?(entity_id) do
      dispatch_promoted(op_name, entity_id, wallet_type, request)
    else
      GenServer.call(CosmpRouter.Router, {op_name, request})
    end
  end

  # Sub-arc 1 sub-phase c Commit C.3 [BEAM-DBGI-PROMOTE-TIER-ROUTED-DISPATCH]
  # Mirrors dispatch_enterprise/3 substrate-architectural shape; lazy-spawns
  # DMWWorker via DbgiSupervisor.start_dmw_worker_horde/3 with the resolved
  # wallet_type and dispatches via Horde via-tuple. Forward-substrate to
  # AI_AGENT branch at C.4 ADR amendment register per ADR-0039 §Sub-decision
  # 8 amendment forward-substrate.
  defp dispatch_promoted(op_name, entity_id, wallet_type, request) do
    case DbgiSupervisor.start_dmw_worker_horde(entity_id, wallet_type) do
      {:ok, _pid} ->
        GenServer.call(
          {:via, Horde.Registry, {DbgiSupervisor.HordeRegistry, entity_id}},
          {:cosmp_op, op_name, request}
        )

      {:error, reason} ->
        {:error,
         %Proto.CosmpError{
           kind: :INTERNAL,
           message: "DMW promote-on-activity spawn failed: #{inspect(reason)}",
           details: %{}
         }}
    end
  end

  # Sub-arc 1 sub-phase d Commit D.3 [BEAM-DBGI-DEVICE-SHARD-DISPATCH-INTEGRATION]
  # DEVICE cold-shard dispatch per ADR-0040 §Sub-decision 5 register
  # substantively. Computes deterministic shard_id via
  # CosmpRouter.DeviceShard.assign_shard/1 (canonicalizes DEVICE shard
  # assignment at canonical-execution register substantively per ADR-0040
  # §Sub-decision 1 Jump Consistent Hash) and delegates to CosmpRouter.Router
  # via existing request shape canonical at canonical-coherence register
  # substantively. DEVICE remains cold per Founder Q-B LOCKED pure-stateless-
  # substrate disposition: NO DMWWorker spawn; NO always-hot per-DMW process;
  # NO protobuf change; NO ETS; NO supervised child. Shard_id is not yet
  # exposed in the request envelope; shard-aware Router dispatch + per-shard
  # observability remain forward-substrate per ADR-0040 §Consequences register
  # substantively.
  defp dispatch_device_shard(op_name, entity_id, request) do
    _shard_id = CosmpRouter.DeviceShard.assign_shard(entity_id)

    GenServer.call(CosmpRouter.Router, {op_name, request})
  end

  defp extract_entity_id(request) do
    case request do
      %{entity_id: entity_id} -> entity_id
      _ -> nil
    end
  end
end

defmodule CosmpRouter.GRPC.Endpoint do
  @moduledoc """
  gRPC endpoint module — boots the HTTP/2 listener and registers
  `CosmpRouter.GRPC.Server` per `:grpc` library convention.

  Listen port defaults to 50051; configurable via application env
  `:cosmp_router, :grpc_port` (production overrides via
  `config/runtime.exs` at sub-phase 11+).

  Supervised under `CosmpRouter.Supervisor` per ADR-0030 + ADR-0031
  Application children list.
  """

  use GRPC.Endpoint

  intercept(GRPC.Server.Interceptors.Logger)
  run(CosmpRouter.GRPC.Server)
end
