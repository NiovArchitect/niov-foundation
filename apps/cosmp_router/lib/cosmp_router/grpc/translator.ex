defmodule CosmpRouter.GRPC.Translator do
  @moduledoc """
  Protobuf ↔ Elixir struct translation for COSMP Capsule per
  ADR-0032 §Decision Protobuf canonical structure.

  Sub-phase 5b-i: Used by `CosmpRouter.Router` to convert
  `CosmpRouter.Proto.Capsule` (Protobuf wire format) ↔
  `CosmpRouter.Capsule` (Elixir-native storage struct) at the
  ETS storage boundary.

  ## Patent-canonical field ordering

  Both sides preserve US 12,517,919 7-layer ordering verbatim per
  ADR-0031 Q-J: payload / metadata / rules / relations / time /
  permissions / audit.

  ## References

  - ADR-0032 (BEAM gRPC Interop Architecture) §Decision Protobuf
    canonical structure
  - ADR-0031 (BEAM Routing Substrate Architecture) §Decision
    Capsule struct placeholder
  - US 12,517,919 (COSMP Protocol patent)
  """

  alias CosmpRouter.Capsule
  alias CosmpRouter.Proto

  @doc """
  Convert a Protobuf `CosmpRouter.Proto.Capsule` to an Elixir-native
  `CosmpRouter.Capsule` struct. Used by Router at ETS storage write
  boundary (WRITE op).
  """
  @spec to_capsule(Proto.Capsule.t()) :: Capsule.t()
  def to_capsule(%Proto.Capsule{} = proto) do
    %Capsule{
      payload: proto.payload,
      metadata: proto.metadata || %{},
      rules: Enum.map(proto.rules, &rule_to_map/1),
      relations: Enum.map(proto.relations, &relation_to_map/1),
      time: time_to_map(proto.time),
      permissions: permissions_to_map(proto.permissions),
      audit: Enum.map(proto.audit, &audit_to_map/1)
    }
  end

  @doc """
  Convert an Elixir-native `CosmpRouter.Capsule` struct to a Protobuf
  `CosmpRouter.Proto.Capsule`. Used by Router at gRPC response
  boundary (READ op).
  """
  @spec from_capsule(Capsule.t()) :: Proto.Capsule.t()
  def from_capsule(%Capsule{} = capsule) do
    %Proto.Capsule{
      payload: capsule.payload || <<>>,
      metadata: capsule.metadata || %{},
      rules: Enum.map(capsule.rules || [], &rule_from_map/1),
      relations: Enum.map(capsule.relations || [], &relation_from_map/1),
      time: time_from_map(capsule.time),
      permissions: permissions_from_map(capsule.permissions),
      audit: Enum.map(capsule.audit || [], &audit_from_map/1)
    }
  end

  @doc """
  Construct a Protobuf `CosmpError` envelope. Used by Router at gRPC
  error response boundary.
  """
  @spec error(Proto.CosmpError.Kind.t(), String.t(), map()) :: Proto.CosmpError.t()
  def error(kind, message, details \\ %{}) do
    %Proto.CosmpError{
      kind: kind,
      message: message,
      details: details
    }
  end

  # ---- private helpers ----

  defp rule_to_map(%Proto.Rule{name: n, value: v}), do: %{name: n, value: v}
  defp rule_to_map(other) when is_map(other), do: other

  defp rule_from_map(%{name: n, value: v}), do: %Proto.Rule{name: n, value: v}
  defp rule_from_map(%Proto.Rule{} = r), do: r

  defp relation_to_map(%Proto.Relation{kind: k, target_id: t}), do: %{kind: k, target_id: t}
  defp relation_to_map(other) when is_map(other), do: other

  defp relation_from_map(%{kind: k, target_id: t}), do: %Proto.Relation{kind: k, target_id: t}
  defp relation_from_map(%Proto.Relation{} = r), do: r

  defp time_to_map(nil), do: nil

  defp time_to_map(%Proto.TimeAttributes{} = t) do
    %{
      created_at: t.created_at,
      modified_at: t.modified_at,
      expires_at: t.expires_at
    }
  end

  defp time_from_map(nil), do: nil
  defp time_from_map(%Proto.TimeAttributes{} = t), do: t

  defp time_from_map(%{} = m) do
    %Proto.TimeAttributes{
      created_at: Map.get(m, :created_at, 0),
      modified_at: Map.get(m, :modified_at, 0),
      expires_at: Map.get(m, :expires_at, 0)
    }
  end

  defp permissions_to_map(nil), do: nil

  defp permissions_to_map(%Proto.Permissions{} = p) do
    %{owner: p.owner, granted_to: p.granted_to}
  end

  defp permissions_from_map(nil), do: nil
  defp permissions_from_map(%Proto.Permissions{} = p), do: p

  defp permissions_from_map(%{} = m) do
    %Proto.Permissions{
      owner: Map.get(m, :owner, ""),
      granted_to: Map.get(m, :granted_to, [])
    }
  end

  defp audit_to_map(%Proto.AuditEntry{} = a) do
    %{event_type: a.event_type, actor: a.actor, timestamp: a.timestamp}
  end

  defp audit_to_map(other) when is_map(other), do: other

  defp audit_from_map(%Proto.AuditEntry{} = a), do: a

  defp audit_from_map(%{} = m) do
    %Proto.AuditEntry{
      event_type: Map.get(m, :event_type, ""),
      actor: Map.get(m, :actor, ""),
      timestamp: Map.get(m, :timestamp, 0)
    }
  end
end
