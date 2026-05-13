# FILE: apps/cosmp_router/lib/cosmp_router/proto/cosmp.pb.ex
# PURPOSE: Hand-written Elixir Protobuf modules per ADR-0032 Q-U
#          Option B (sub-phase 5a authorization). Mirrors
#          `priv/protos/cosmp.proto` schema verbatim — field numbers
#          and types must stay in sync with the canonical .proto.
# PATENT-CANONICAL: Capsule field numbers 1-7 match patent layer
#          ordering per US 12,517,919 + ADR-0031 Q-J.
# WHY HAND-WRITTEN: Per ADR-0032 Q-U Option B (substrate-honest about
#          tool availability; no protoc dependency; deterministic;
#          matches what protoc-gen-elixir would generate).

# ============================================================================
# Capsule + nested message types
# ============================================================================

defmodule CosmpRouter.Proto.Rule do
  @moduledoc false
  use Protobuf, syntax: :proto3

  field :name, 1, type: :string
  field :value, 2, type: :string
end

defmodule CosmpRouter.Proto.Relation do
  @moduledoc false
  use Protobuf, syntax: :proto3

  field :kind, 1, type: :string
  field :target_id, 2, type: :string, json_name: "targetId"
end

defmodule CosmpRouter.Proto.TimeAttributes do
  @moduledoc false
  use Protobuf, syntax: :proto3

  field :created_at, 1, type: :int64, json_name: "createdAt"
  field :modified_at, 2, type: :int64, json_name: "modifiedAt"
  field :expires_at, 3, type: :int64, json_name: "expiresAt"
end

defmodule CosmpRouter.Proto.Permissions do
  @moduledoc false
  use Protobuf, syntax: :proto3

  field :owner, 1, type: :string
  field :granted_to, 2, repeated: true, type: :string, json_name: "grantedTo"
end

defmodule CosmpRouter.Proto.AuditEntry do
  @moduledoc false
  use Protobuf, syntax: :proto3

  field :event_type, 1, type: :string, json_name: "eventType"
  field :actor, 2, type: :string
  field :timestamp, 3, type: :int64
end

defmodule CosmpRouter.Proto.Capsule.MetadataEntry do
  @moduledoc false
  use Protobuf, map: true, syntax: :proto3

  field :key, 1, type: :string
  field :value, 2, type: :string
end

defmodule CosmpRouter.Proto.Capsule do
  @moduledoc """
  7-layer patent-canonical Capsule structure per US 12,517,919.
  Field numbers 1-7 mirror patent layer ordering verbatim per
  ADR-0031 Q-J + ADR-0032 §Decision Protobuf canonical structure.
  """
  use Protobuf, syntax: :proto3

  field :payload, 1, type: :bytes
  field :metadata, 2, repeated: true, type: CosmpRouter.Proto.Capsule.MetadataEntry, map: true
  field :rules, 3, repeated: true, type: CosmpRouter.Proto.Rule
  field :relations, 4, repeated: true, type: CosmpRouter.Proto.Relation
  field :time, 5, type: CosmpRouter.Proto.TimeAttributes
  field :permissions, 6, type: CosmpRouter.Proto.Permissions
  field :audit, 7, repeated: true, type: CosmpRouter.Proto.AuditEntry
end

# ============================================================================
# CosmpError envelope
# ============================================================================

defmodule CosmpRouter.Proto.CosmpError.Kind do
  @moduledoc false
  use Protobuf, enum: true, syntax: :proto3

  field :UNKNOWN, 0
  field :NOT_IMPLEMENTED, 1
  field :INVALID_CAPSULE, 2
  field :PERMISSION_DENIED, 3
  field :CAPSULE_NOT_FOUND, 4
  field :IDEMPOTENCY_CONFLICT, 5
  field :INTERNAL, 6
end

defmodule CosmpRouter.Proto.CosmpError.DetailsEntry do
  @moduledoc false
  use Protobuf, map: true, syntax: :proto3

  field :key, 1, type: :string
  field :value, 2, type: :string
end

defmodule CosmpRouter.Proto.CosmpError do
  @moduledoc false
  use Protobuf, syntax: :proto3

  field :kind, 1, type: CosmpRouter.Proto.CosmpError.Kind, enum: true
  field :message, 2, type: :string
  field :details, 3, repeated: true, type: CosmpRouter.Proto.CosmpError.DetailsEntry, map: true
end

# ============================================================================
# AUTHENTICATE
# ============================================================================

defmodule CosmpRouter.Proto.AuthenticateRequest do
  @moduledoc false
  use Protobuf, syntax: :proto3

  field :capsule, 1, type: CosmpRouter.Proto.Capsule
  field :principal_id, 2, type: :string, json_name: "principalId"
end

defmodule CosmpRouter.Proto.AuthenticateSuccess do
  @moduledoc false
  use Protobuf, syntax: :proto3

  field :authenticated, 1, type: :bool
  field :principal_id, 2, type: :string, json_name: "principalId"
end

defmodule CosmpRouter.Proto.AuthenticateResponse do
  @moduledoc false
  use Protobuf, syntax: :proto3

  oneof :result, 0

  field :success, 1, type: CosmpRouter.Proto.AuthenticateSuccess, oneof: 0
  field :error, 2, type: CosmpRouter.Proto.CosmpError, oneof: 0
end

# ============================================================================
# NEGOTIATE
# ============================================================================

defmodule CosmpRouter.Proto.NegotiateRequest do
  @moduledoc false
  use Protobuf, syntax: :proto3

  field :capsule, 1, type: CosmpRouter.Proto.Capsule
  field :requested_scopes, 2, repeated: true, type: :string, json_name: "requestedScopes"
end

defmodule CosmpRouter.Proto.NegotiateSuccess do
  @moduledoc false
  use Protobuf, syntax: :proto3

  field :granted_scopes, 1, repeated: true, type: :string, json_name: "grantedScopes"
end

defmodule CosmpRouter.Proto.NegotiateResponse do
  @moduledoc false
  use Protobuf, syntax: :proto3

  oneof :result, 0

  field :success, 1, type: CosmpRouter.Proto.NegotiateSuccess, oneof: 0
  field :error, 2, type: CosmpRouter.Proto.CosmpError, oneof: 0
end

# ============================================================================
# READ
# ============================================================================

defmodule CosmpRouter.Proto.ReadRequest do
  @moduledoc false
  use Protobuf, syntax: :proto3

  field :capsule_id, 1, type: :string, json_name: "capsuleId"
end

defmodule CosmpRouter.Proto.ReadResponse do
  @moduledoc false
  use Protobuf, syntax: :proto3

  oneof :result, 0

  field :capsule, 1, type: CosmpRouter.Proto.Capsule, oneof: 0
  field :error, 2, type: CosmpRouter.Proto.CosmpError, oneof: 0
end

# ============================================================================
# WRITE
# ============================================================================

defmodule CosmpRouter.Proto.WriteRequest do
  @moduledoc false
  use Protobuf, syntax: :proto3

  field :capsule_id, 1, type: :string, json_name: "capsuleId"
  field :capsule, 2, type: CosmpRouter.Proto.Capsule
end

defmodule CosmpRouter.Proto.WriteSuccess do
  @moduledoc false
  use Protobuf, syntax: :proto3

  field :capsule_id, 1, type: :string, json_name: "capsuleId"
end

defmodule CosmpRouter.Proto.WriteResponse do
  @moduledoc false
  use Protobuf, syntax: :proto3

  oneof :result, 0

  field :success, 1, type: CosmpRouter.Proto.WriteSuccess, oneof: 0
  field :error, 2, type: CosmpRouter.Proto.CosmpError, oneof: 0
end

# ============================================================================
# SHARE
# ============================================================================

defmodule CosmpRouter.Proto.ShareRequest do
  @moduledoc false
  use Protobuf, syntax: :proto3

  field :capsule_id, 1, type: :string, json_name: "capsuleId"
  field :grantee, 2, type: :string
end

defmodule CosmpRouter.Proto.ShareSuccess do
  @moduledoc false
  use Protobuf, syntax: :proto3

  field :capsule_id, 1, type: :string, json_name: "capsuleId"
  field :granted_to, 2, repeated: true, type: :string, json_name: "grantedTo"
end

defmodule CosmpRouter.Proto.ShareResponse do
  @moduledoc false
  use Protobuf, syntax: :proto3

  oneof :result, 0

  field :success, 1, type: CosmpRouter.Proto.ShareSuccess, oneof: 0
  field :error, 2, type: CosmpRouter.Proto.CosmpError, oneof: 0
end

# ============================================================================
# REVOKE
# ============================================================================

defmodule CosmpRouter.Proto.RevokeRequest do
  @moduledoc false
  use Protobuf, syntax: :proto3

  field :capsule_id, 1, type: :string, json_name: "capsuleId"
  field :grantee, 2, type: :string
end

defmodule CosmpRouter.Proto.RevokeSuccess do
  @moduledoc false
  use Protobuf, syntax: :proto3

  field :capsule_id, 1, type: :string, json_name: "capsuleId"
  field :remaining_grantees, 2, repeated: true, type: :string, json_name: "remainingGrantees"
end

defmodule CosmpRouter.Proto.RevokeResponse do
  @moduledoc false
  use Protobuf, syntax: :proto3

  oneof :result, 0

  field :success, 1, type: CosmpRouter.Proto.RevokeSuccess, oneof: 0
  field :error, 2, type: CosmpRouter.Proto.CosmpError, oneof: 0
end

# ============================================================================
# AUDIT
# ============================================================================

defmodule CosmpRouter.Proto.AuditRequest do
  @moduledoc false
  use Protobuf, syntax: :proto3

  field :capsule_id, 1, type: :string, json_name: "capsuleId"
end

defmodule CosmpRouter.Proto.AuditSuccess do
  @moduledoc false
  use Protobuf, syntax: :proto3

  field :entries, 1, repeated: true, type: CosmpRouter.Proto.AuditEntry
end

defmodule CosmpRouter.Proto.AuditResponse do
  @moduledoc false
  use Protobuf, syntax: :proto3

  oneof :result, 0

  field :success, 1, type: CosmpRouter.Proto.AuditSuccess, oneof: 0
  field :error, 2, type: CosmpRouter.Proto.CosmpError, oneof: 0
end

# ============================================================================
# Service definition (gRPC RPC enumeration)
# ============================================================================

defmodule CosmpRouter.Proto.CosmpRouter.Service do
  @moduledoc """
  gRPC service definition for the 7 patent-canonical COSMP operations
  per US 12,517,919. Used by `CosmpRouter.GRPC.Server` (`use
  GRPC.Server, service: __MODULE__`) to dispatch incoming RPCs to
  handler functions.
  """

  use GRPC.Service, name: "cosmp.v1.CosmpRouter", protoc_gen_elixir_version: "0.14.0"

  rpc :Authenticate, CosmpRouter.Proto.AuthenticateRequest, CosmpRouter.Proto.AuthenticateResponse
  rpc :Negotiate, CosmpRouter.Proto.NegotiateRequest, CosmpRouter.Proto.NegotiateResponse
  rpc :Read, CosmpRouter.Proto.ReadRequest, CosmpRouter.Proto.ReadResponse
  rpc :Write, CosmpRouter.Proto.WriteRequest, CosmpRouter.Proto.WriteResponse
  rpc :Share, CosmpRouter.Proto.ShareRequest, CosmpRouter.Proto.ShareResponse
  rpc :Revoke, CosmpRouter.Proto.RevokeRequest, CosmpRouter.Proto.RevokeResponse
  rpc :Audit, CosmpRouter.Proto.AuditRequest, CosmpRouter.Proto.AuditResponse
end

defmodule CosmpRouter.Proto.CosmpRouter.Stub do
  @moduledoc """
  gRPC client stub for the COSMP service. Used by TypeScript via
  gRPC wire protocol; the Elixir Stub module is for Elixir-side
  test consumers (mock server tests).
  """

  use GRPC.Stub, service: CosmpRouter.Proto.CosmpRouter.Service
end
