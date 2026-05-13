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
  per Q-T. Sub-phase 5b-ii layers Postgres source-of-truth on top
  per ADR-0033 (forthcoming).

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
    case GenServer.call(CosmpRouter.Router, {:authenticate, req}) do
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
    case GenServer.call(CosmpRouter.Router, {:negotiate, req}) do
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
    case GenServer.call(CosmpRouter.Router, {:read, req}) do
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
    case GenServer.call(CosmpRouter.Router, {:write, req}) do
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
    case GenServer.call(CosmpRouter.Router, {:share, req}) do
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
    case GenServer.call(CosmpRouter.Router, {:revoke, req}) do
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
    case GenServer.call(CosmpRouter.Router, {:audit, req}) do
      {:ok, %Proto.AuditSuccess{} = success} ->
        %Proto.AuditResponse{result: {:success, success}}

      {:error, %Proto.CosmpError{} = error} ->
        %Proto.AuditResponse{result: {:error, error}}
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
