defmodule CosmpRouter.Capsule.Translator do
  @moduledoc """
  Pack/unpack between the patent-canonical 7-layer `CosmpRouter.Capsule`
  runtime struct and the 30-field `CosmpRouter.MemoryCapsule` Ecto
  persistence schema per ADR-0033 §Decision 3b.

  ## Pure transformation discipline (ADR-0026 §5 BEAM Pattern 6)

  Both `pack/1` and `unpack/1` are pure functions: no I/O, no Repo
  queries, no audit emissions. Audit emissions for the capsule's
  audit layer are produced by `CosmpRouter.Audit.write_audit_event/1+3`
  in composed-mode WITH the persistence write per ADR-0033 §Decision
  4e + RULE 4 atomic compound. The Translator does NOT serialize
  the audit array into the MemoryCapsule row.

  ## Layer projection (per ADR-0033 §3a)

  | Patent layer | MemoryCapsule fields |
  |---|---|
  | Payload | storage_location, payload_summary, payload_size_tokens, tokens, tokens_tokenizer, commitment_date, content_hash |
  | Metadata | capsule_type, topic_tags, version |
  | Rules | clearance_required, ai_access_blocked, requires_validation, decay_type, decay_rate |
  | Relations | connected_capsule_ids, connected_entity_ids |
  | Time | created_at, last_accessed_at, last_updated_at, expires_at, deleted_at |
  | Permissions | wallet_id, entity_id (FKs; Permission[] via association) |
  | Audit | audit_events join via target_capsule_id (NOT a MemoryCapsule field) |

  ## References

  - ADR-0033 §Decision 3b (pack/unpack discipline)
  - ADR-0026 §5 BEAM Pattern 6 (pure transformation)
  - ADR-0031 §Decision Capsule placeholder (runtime struct shape)
  - US 12,517,919 (patent-canonical 7-layer Capsule)
  """

  alias CosmpRouter.{Capsule, MemoryCapsule}

  @doc """
  Pack a runtime `%CosmpRouter.Capsule{}` into a
  `%CosmpRouter.MemoryCapsule{}` Ecto row attribute map.

  Defaults applied for fields the runtime struct doesn't carry
  (storage_tier defaults to "WARM", version defaults to 1, etc.).
  Time fields populated from the runtime time map; deleted_at always
  nil at pack-time (soft-delete is a separate operation).
  """
  @spec pack(Capsule.t()) :: map()
  def pack(%Capsule{} = capsule) do
    time = capsule.time || %{}
    permissions = capsule.permissions || %{}
    metadata = capsule.metadata || %{}

    %{
      # Patent layer 1 (Payload)
      payload_summary: get(metadata, :payload_summary, ""),
      payload_size_tokens: get(metadata, :payload_size_tokens, 0),
      tokens: get(metadata, :tokens, 0),
      tokens_tokenizer: get(metadata, :tokens_tokenizer, "anthropic"),
      commitment_date: get(metadata, :commitment_date),
      content_hash: get(metadata, :content_hash, ""),
      storage_location: get(metadata, :storage_location, ""),
      storage_tier: get(metadata, :storage_tier, "WARM"),

      # Patent layer 2 (Metadata)
      capsule_type: get(metadata, :capsule_type),
      topic_tags: get(metadata, :topic_tags, []),
      version: get(metadata, :version, 1),

      # Patent layer 3 (Rules)
      clearance_required: get_rule(capsule.rules, "clearance_required", 0),
      ai_access_blocked: get_rule(capsule.rules, "ai_access_blocked", false),
      requires_validation: get_rule(capsule.rules, "requires_validation", false),
      decay_type: get_rule(capsule.rules, "decay_type"),
      decay_rate: get_rule(capsule.rules, "decay_rate", 0.01),

      # Patent layer 4 (Relations)
      connected_capsule_ids: extract_relations(capsule.relations, "capsule"),
      connected_entity_ids: extract_relations(capsule.relations, "entity"),

      # Patent layer 5 (Time)
      created_at: get(time, :created_at),
      last_accessed_at: get(time, :last_accessed_at),
      last_updated_at: get(time, :last_updated_at) || get(time, :created_at),
      expires_at: get(time, :expires_at),
      deleted_at: nil,

      # Patent layer 6 (Permissions)
      wallet_id: get(permissions, :wallet_id) || get(permissions, :owner),
      entity_id: get(permissions, :entity_id) || get(permissions, :owner),

      # Sibling fields (not patent layers)
      relevance_score: get(metadata, :relevance_score, 1.0),
      feedback_loop_score: get(metadata, :feedback_loop_score, 0.0),
      access_count: get(metadata, :access_count, 0),
      monetization_enabled: get(metadata, :monetization_enabled, false),
      monetization_category: get(metadata, :monetization_category),
      created_by: get(permissions, :created_by),
      created_session_id: get(permissions, :created_session_id),
      write_reason: get(metadata, :write_reason),
      updated_by: get(permissions, :updated_by),
      updated_session_id: get(permissions, :updated_session_id),
      previous_version: get(metadata, :previous_version)
    }
  end

  @doc """
  Unpack a `%CosmpRouter.MemoryCapsule{}` Ecto row into a runtime
  `%CosmpRouter.Capsule{}` patent-canonical 7-layer struct.

  The audit layer is NOT populated from the row directly — callers
  who need the audit array query `audit_events` WHERE
  `target_capsule_id = capsule.capsule_id` separately. Keeping
  unpack/1 pure (no Repo queries) preserves the BEAM Pattern 6
  discipline; audit traversal is a separate concern.
  """
  @spec unpack(MemoryCapsule.t()) :: Capsule.t()
  def unpack(%MemoryCapsule{} = row) do
    %Capsule{
      payload: %{
        summary: row.payload_summary,
        size_tokens: row.payload_size_tokens,
        tokens: row.tokens,
        tokens_tokenizer: row.tokens_tokenizer,
        commitment_date: row.commitment_date,
        content_hash: row.content_hash,
        storage_location: row.storage_location,
        storage_tier: row.storage_tier
      },
      metadata: %{
        capsule_id: row.capsule_id,
        capsule_type: row.capsule_type,
        topic_tags: row.topic_tags,
        version: row.version,
        relevance_score: row.relevance_score,
        feedback_loop_score: row.feedback_loop_score,
        access_count: row.access_count,
        monetization_enabled: row.monetization_enabled,
        monetization_category: row.monetization_category
      },
      rules: build_rules(row),
      relations:
        build_relations(row.connected_capsule_ids, "capsule") ++
          build_relations(row.connected_entity_ids, "entity"),
      time: %{
        created_at: row.created_at,
        last_accessed_at: row.last_accessed_at,
        last_updated_at: row.last_updated_at,
        expires_at: row.expires_at,
        deleted_at: row.deleted_at
      },
      permissions: %{
        wallet_id: row.wallet_id,
        entity_id: row.entity_id,
        owner: row.entity_id,
        created_by: row.created_by,
        created_session_id: row.created_session_id,
        updated_by: row.updated_by,
        updated_session_id: row.updated_session_id
      },
      # Audit layer not populated here; query audit_events separately
      audit: []
    }
  end

  # WHAT: Safe map fetch with optional default.
  defp get(map, key, default \\ nil) when is_map(map) do
    Map.get(map, key, Map.get(map, to_string(key), default))
  end

  # WHAT: Extract a rule value by name from runtime rules list, or default.
  # Default-arg head separated from clauses per Elixir convention so the
  # implicit head doesn't conflict with the catch-all fallback clause.
  defp get_rule(rules, name, default \\ nil)

  defp get_rule(rules, name, default) when is_list(rules) do
    rule =
      Enum.find(rules, fn
        %{name: n} -> to_string(n) == name
        %{"name" => n} -> to_string(n) == name
        _ -> false
      end)

    case rule do
      %{value: v} -> v
      %{"value" => v} -> v
      nil -> default
    end
  end

  defp get_rule(_, _, default), do: default

  # WHAT: Extract relation target_ids of a given kind from runtime relations.
  defp extract_relations(relations, kind) when is_list(relations) do
    relations
    |> Enum.filter(fn
      %{kind: k} -> to_string(k) == kind
      %{"kind" => k} -> to_string(k) == kind
      _ -> false
    end)
    |> Enum.map(fn
      %{target_id: id} -> id
      %{"target_id" => id} -> id
    end)
  end

  defp extract_relations(_, _), do: []

  # WHAT: Build runtime rules list from MemoryCapsule rule fields.
  defp build_rules(row) do
    [
      %{name: "clearance_required", value: row.clearance_required},
      %{name: "ai_access_blocked", value: row.ai_access_blocked},
      %{name: "requires_validation", value: row.requires_validation},
      %{name: "decay_type", value: row.decay_type},
      %{name: "decay_rate", value: row.decay_rate}
    ]
  end

  # WHAT: Build runtime relations list from MemoryCapsule string-array fields.
  defp build_relations(ids, kind) when is_list(ids) do
    Enum.map(ids, fn id -> %{kind: kind, target_id: id} end)
  end

  defp build_relations(_, _), do: []
end
