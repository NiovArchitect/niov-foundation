defmodule CosmpRouter.MemoryCapsuleTest do
  @moduledoc """
  Schema introspection tests for `CosmpRouter.MemoryCapsule` per
  ADR-0033 §Decision 3a. Verifies the Ecto schema's field set matches
  the expected Prisma `MemoryCapsule` column shape (30 fields + UUID
  primary key).

  Pure introspection — no Repo connection required at this register;
  DB-level tests land at sub-phase 5b-ii Phase 4 (Storage.Postgres).
  """

  use ExUnit.Case, async: true

  alias CosmpRouter.MemoryCapsule

  @expected_fields [
    # Primary key
    :capsule_id,
    # FK + ownership
    :wallet_id,
    :entity_id,
    :version,
    # Patent layer 2 (Metadata)
    :capsule_type,
    :topic_tags,
    # Scoring
    :relevance_score,
    :decay_type,
    :decay_rate,
    :feedback_loop_score,
    # Patent layer 1 (Payload)
    :payload_summary,
    :payload_size_tokens,
    :tokens,
    :tokens_tokenizer,
    :commitment_date,
    # Storage
    :storage_location,
    :storage_tier,
    # Patent layer 3 (Rules)
    :clearance_required,
    :access_count,
    :content_hash,
    # ADR-0045 G5.3 Q-G5.3-κ κ-1 LOCK: embedding lag pass-through
    :embedding_content_hash,
    :ai_access_blocked,
    :requires_validation,
    # Patent layer 4 (Relations)
    :connected_capsule_ids,
    :connected_entity_ids,
    # Monetization
    :monetization_enabled,
    :monetization_category,
    # Attribution
    :created_by,
    :created_session_id,
    :write_reason,
    :updated_by,
    :updated_session_id,
    :previous_version,
    # Patent layer 5 (Time)
    :created_at,
    :last_accessed_at,
    :last_updated_at,
    # ADR-0045 G5.3 Q-G5.3-κ κ-1 LOCK: embedding lag timestamp pass-through
    :embedding_generated_at,
    :expires_at,
    :deleted_at
  ]

  test "schema source is `memory_capsules` table" do
    assert MemoryCapsule.__schema__(:source) == "memory_capsules"
  end

  test "primary key is :capsule_id (Ecto.UUID)" do
    assert MemoryCapsule.__schema__(:primary_key) == [:capsule_id]
    assert MemoryCapsule.__schema__(:type, :capsule_id) == Ecto.UUID
  end

  test "field set matches expected (Prisma parity at sub-phase 5b-ii landing)" do
    actual = MemoryCapsule.field_list() |> MapSet.new()
    expected = MapSet.new(@expected_fields)

    missing = MapSet.difference(expected, actual) |> MapSet.to_list()
    extra = MapSet.difference(actual, expected) |> MapSet.to_list()

    assert missing == [],
           "MemoryCapsule schema MISSING fields expected by ADR-0033 §3a: #{inspect(missing)}"

    assert extra == [],
           "MemoryCapsule schema has UNEXPECTED fields not in ADR-0033 §3a: #{inspect(extra)}"
  end

  test "patent layer 4 (Relations) fields are string arrays" do
    assert MemoryCapsule.__schema__(:type, :connected_capsule_ids) == {:array, :string}
    assert MemoryCapsule.__schema__(:type, :connected_entity_ids) == {:array, :string}
    assert MemoryCapsule.__schema__(:type, :topic_tags) == {:array, :string}
  end

  test "patent layer 5 (Time) fields are utc_datetime_usec" do
    # Per sub-phase 6b D-PHASE-2-CROSS-LANG-PRECISION-DRIFT resolution
    # (Option F): all DateTime fields use `:utc_datetime_usec` (Elixir
    # microsecond precision) mirroring `AuditEvent.timestamp` canonical
    # at the Postgres-shared-DDL register. Postgres TIMESTAMP(3) per
    # Prisma DDL truncates microseconds on column write.
    for time_field <- [:created_at, :last_accessed_at, :last_updated_at, :expires_at, :deleted_at] do
      assert MemoryCapsule.__schema__(:type, time_field) == :utc_datetime_usec,
             "Time-layer field #{time_field} should be :utc_datetime_usec"
    end
  end

  test "FK fields are Ecto.UUID" do
    for uuid_field <- [
          :wallet_id,
          :entity_id,
          :created_by,
          :created_session_id,
          :updated_by,
          :updated_session_id
        ] do
      assert MemoryCapsule.__schema__(:type, uuid_field) == Ecto.UUID,
             "FK field #{uuid_field} should be Ecto.UUID"
    end
  end

  # ADR-0043 G3.8 (Q-G3-θ β-A LOCK + Q-G3.8-α α-2 + Q-G3.8-β LOCK):
  # explicit named test anchoring the Elixir-boundary contract for the
  # Prisma-owned `embedding` pgvector(1536) column. The pre-existing
  # field-set parity test above ("field set matches expected ...")
  # enforces `extra == []` at the SUBSTRATE register; THIS test makes
  # the embedding-column boundary EXPLICIT and contributor-grep-able.
  # See `apps/cosmp_router/lib/cosmp_router/schemas/memory_capsule.ex`
  # moduledoc "Embedding column boundary (G3.8 / Q-G3-θ β-A LOCK)" for
  # the full contract.
  test "embedding column is Prisma-owned and intentionally absent from Ecto schema per Q-G3-θ β-A LOCK + ADR-0043 §Sub-decision 8" do
    # ADR-0043 G3.8 (Q-G3-θ β-A LOCK): the `embedding` pgvector(1536)
    # column at memory_capsules.embedding is intentionally absent from
    # this Ecto schema. Prisma owns DDL + TypeScript owns read/write
    # queries (G3.5 WriteService + G3.6 SimilarityService). NO Ecto
    # vector field without proven Elixir consumer + Founder
    # authorization + ADR-0033 amendment + RULE 0 safeguards.
    refute :embedding in MemoryCapsule.__schema__(:fields)
  end

  # ADR-0045 G5.3 Q-G5.3-κ κ-1 LOCK: embedding lag metadata pass-
  # through. Distinct from G3.8 `embedding` pgvector Prisma-only
  # boundary — these are pure metadata fields (String + DateTime)
  # following the existing content_hash + last_updated_at +
  # relevance_score + feedback_loop_score Translator pattern. BEAM
  # observer-only; no Elixir staleness computation.
  test "embedding_content_hash field is present per ADR-0045 G5.3 Q-G5.3-κ κ-1 LOCK" do
    assert :embedding_content_hash in MemoryCapsule.__schema__(:fields)
    assert MemoryCapsule.__schema__(:type, :embedding_content_hash) == :string
  end

  test "embedding_generated_at field is present per ADR-0045 G5.3 Q-G5.3-κ κ-1 LOCK" do
    assert :embedding_generated_at in MemoryCapsule.__schema__(:fields)
    assert MemoryCapsule.__schema__(:type, :embedding_generated_at) ==
             :utc_datetime_usec
  end
end
