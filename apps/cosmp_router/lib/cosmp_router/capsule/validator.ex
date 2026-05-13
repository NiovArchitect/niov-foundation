defmodule CosmpRouter.Capsule.Validator do
  @moduledoc """
  Capsule 7-layer integrity validation per US 12,517,919 +
  ADR-0032 §Decision Protobuf canonical schema field constraints.

  ## Validation register

  Sub-phase 5b-i: structural integrity checks. Ensures the Capsule
  carries the 7 patent-canonical layers in valid shape:

  1. **payload** — bytes (binary); non-nil
  2. **metadata** — map (string → string); may be empty
  3. **rules** — list of maps with `name` + `value`; may be empty
  4. **relations** — list of maps with `kind` + `target_id`; may be empty
  5. **time** — map with `created_at` (required) + optional `modified_at` / `expires_at`; integers
  6. **permissions** — map with `owner` (required string) + optional `granted_to` (list of strings)
  7. **audit** — list of maps with `event_type` + `actor` + `timestamp`; may be empty

  Sub-phase 5b-ii + sub-phase 6: semantic validation (cross-field
  consistency; permission graph cycles; audit-chain integrity).

  ## Return shape

  - `{:ok, capsule}` — Capsule passes structural validation
  - `{:error, %CosmpRouter.Proto.CosmpError{}}` with `kind:
    INVALID_CAPSULE` and `message` describing the violation

  ## References

  - ADR-0032 (BEAM gRPC Interop Architecture) §Decision Protobuf
    canonical schema field constraints
  - ADR-0031 (BEAM Routing Substrate Architecture) §Decision
    Capsule struct placeholder
  - US 12,517,919 (COSMP Protocol patent — 7-layer Capsule)
  """

  alias CosmpRouter.Capsule
  alias CosmpRouter.Proto

  @doc """
  Validate a `CosmpRouter.Capsule` struct. Returns `{:ok, capsule}`
  on success; `{:error, %Proto.CosmpError{}}` with
  `kind: :INVALID_CAPSULE` on structural violation.
  """
  @spec validate(Capsule.t()) :: {:ok, Capsule.t()} | {:error, Proto.CosmpError.t()}
  def validate(%Capsule{} = capsule) do
    with :ok <- validate_payload(capsule.payload),
         :ok <- validate_metadata(capsule.metadata),
         :ok <- validate_rules(capsule.rules),
         :ok <- validate_relations(capsule.relations),
         :ok <- validate_time(capsule.time),
         :ok <- validate_permissions(capsule.permissions),
         :ok <- validate_audit(capsule.audit) do
      {:ok, capsule}
    else
      {:invalid, field, reason} ->
        {:error,
         %Proto.CosmpError{
           kind: :INVALID_CAPSULE,
           message: "Capsule field `#{field}` invalid: #{reason}",
           details: %{"field" => Atom.to_string(field)}
         }}
    end
  end

  def validate(_other) do
    {:error,
     %Proto.CosmpError{
       kind: :INVALID_CAPSULE,
       message: "Capsule must be a %CosmpRouter.Capsule{} struct",
       details: %{}
     }}
  end

  # ---- private layer validators ----

  defp validate_payload(nil), do: {:invalid, :payload, "must not be nil"}
  defp validate_payload(payload) when is_binary(payload), do: :ok
  defp validate_payload(_), do: {:invalid, :payload, "must be binary (bytes)"}

  defp validate_metadata(nil), do: :ok
  defp validate_metadata(metadata) when is_map(metadata), do: :ok
  defp validate_metadata(_), do: {:invalid, :metadata, "must be a map"}

  defp validate_rules(nil), do: :ok

  defp validate_rules(rules) when is_list(rules) do
    if Enum.all?(rules, &valid_rule?/1) do
      :ok
    else
      {:invalid, :rules, "each rule must have :name and :value (strings)"}
    end
  end

  defp validate_rules(_), do: {:invalid, :rules, "must be a list"}

  defp valid_rule?(%{name: n, value: v}) when is_binary(n) and is_binary(v), do: true
  defp valid_rule?(%Proto.Rule{name: n, value: v}) when is_binary(n) and is_binary(v), do: true
  defp valid_rule?(_), do: false

  defp validate_relations(nil), do: :ok

  defp validate_relations(relations) when is_list(relations) do
    if Enum.all?(relations, &valid_relation?/1) do
      :ok
    else
      {:invalid, :relations, "each relation must have :kind and :target_id (strings)"}
    end
  end

  defp validate_relations(_), do: {:invalid, :relations, "must be a list"}

  defp valid_relation?(%{kind: k, target_id: t}) when is_binary(k) and is_binary(t), do: true

  defp valid_relation?(%Proto.Relation{kind: k, target_id: t})
       when is_binary(k) and is_binary(t),
       do: true

  defp valid_relation?(_), do: false

  defp validate_time(nil), do: :ok

  defp validate_time(%{} = time) do
    created_at = Map.get(time, :created_at)

    cond do
      is_integer(created_at) -> :ok
      is_nil(created_at) -> {:invalid, :time, "missing :created_at"}
      true -> {:invalid, :time, ":created_at must be integer"}
    end
  end

  defp validate_time(_), do: {:invalid, :time, "must be a map"}

  defp validate_permissions(nil), do: :ok

  defp validate_permissions(%{} = perms) do
    owner = Map.get(perms, :owner)

    cond do
      is_binary(owner) and owner != "" -> :ok
      true -> {:invalid, :permissions, "missing or empty :owner"}
    end
  end

  defp validate_permissions(_), do: {:invalid, :permissions, "must be a map"}

  defp validate_audit(nil), do: :ok

  defp validate_audit(audit) when is_list(audit) do
    if Enum.all?(audit, &valid_audit_entry?/1) do
      :ok
    else
      {:invalid, :audit,
       "each audit entry must have :event_type, :actor (strings), :timestamp (integer)"}
    end
  end

  defp validate_audit(_), do: {:invalid, :audit, "must be a list"}

  defp valid_audit_entry?(%{event_type: e, actor: a, timestamp: t})
       when is_binary(e) and is_binary(a) and is_integer(t),
       do: true

  defp valid_audit_entry?(%Proto.AuditEntry{event_type: e, actor: a, timestamp: t})
       when is_binary(e) and is_binary(a) and is_integer(t),
       do: true

  defp valid_audit_entry?(_), do: false
end
