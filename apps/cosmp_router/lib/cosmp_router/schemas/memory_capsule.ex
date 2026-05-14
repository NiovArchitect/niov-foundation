defmodule CosmpRouter.MemoryCapsule do
  @moduledoc """
  Ecto persistence schema for the `memory_capsules` table per
  ADR-0033 §Decision 3a. Mirrors Prisma's `MemoryCapsule` model
  (`packages/database/prisma/schema.prisma:86-167`) field-for-field.

  ## Two-tier naming (ADR-0033 §3 / Fork β Refined)

  - `CosmpRouter.Capsule` (sibling) is the patent-canonical 7-layer
    runtime struct (payload / metadata / rules / relations / time /
    permissions / audit) per ADR-0031 §Decision Capsule placeholder
  - `CosmpRouter.MemoryCapsule` (this module) is the Ecto persistence
    schema mirroring Prisma's 30-field row shape
  - `CosmpRouter.Capsule.Translator` (NEW at sub-phase 5b-ii) packs +
    unpacks between the two registers

  ## Schema ownership

  Per ADR-0025 + ADR-0033 §Decision 7 (Q-MIGRATION-OWNERSHIP), Prisma
  owns the `memory_capsules` table DDL. Ecto schema is a READ + WRITE
  surface only; never invoke `mix ecto.migrate` against this table.
  Schema parity with Prisma is contributor + manual discipline at
  sub-phase 5b-ii landing; mechanical verification deferred per
  D-5BII-EXEC-3 Option β.

  ## References

  - ADR-0033 §Decision 3a (field map) + §Decision 7 (migration ownership)
  - `packages/database/prisma/schema.prisma:86-167` (canonical schema)
  - US 12,517,919 (COSMP Protocol; 7-layer Capsule semantic preserved
    via Translator unpack at runtime register)
  """

  use Ecto.Schema

  @primary_key {:capsule_id, Ecto.UUID, autogenerate: true}

  schema "memory_capsules" do
    # FK + ownership
    field :wallet_id, Ecto.UUID
    field :entity_id, Ecto.UUID
    field :version, :integer, default: 1

    # Patent layer 2 (Metadata)
    field :capsule_type, :string
    field :topic_tags, {:array, :string}, default: []

    # Scoring (sibling of patent layers)
    field :relevance_score, :float, default: 1.0
    field :decay_type, :string
    field :decay_rate, :float, default: 0.01
    field :feedback_loop_score, :float, default: 0.0

    # Patent layer 1 (Payload)
    field :payload_summary, :string
    field :payload_size_tokens, :integer
    field :tokens, :integer, default: 0
    field :tokens_tokenizer, :string, default: "anthropic"
    field :commitment_date, :utc_datetime

    # Storage register
    field :storage_location, :string
    field :storage_tier, :string, default: "WARM"

    # Patent layer 3 (Rules)
    field :clearance_required, :integer, default: 0
    field :access_count, :integer, default: 0
    field :content_hash, :string
    field :ai_access_blocked, :boolean, default: false
    field :requires_validation, :boolean, default: false

    # Patent layer 4 (Relations)
    field :connected_capsule_ids, {:array, :string}, default: []
    field :connected_entity_ids, {:array, :string}, default: []

    # Monetization (sibling of patent layers)
    field :monetization_enabled, :boolean, default: false
    field :monetization_category, :string

    # Attribution chain (Section 3C WRITE attribution)
    field :created_by, Ecto.UUID
    field :created_session_id, Ecto.UUID
    field :write_reason, :string
    field :updated_by, Ecto.UUID
    field :updated_session_id, Ecto.UUID
    field :previous_version, :integer

    # Patent layer 5 (Time)
    field :created_at, :utc_datetime, autogenerate: {DateTime, :utc_now, []}
    field :last_accessed_at, :utc_datetime
    field :last_updated_at, :utc_datetime
    field :expires_at, :utc_datetime
    field :deleted_at, :utc_datetime
  end

  @doc """
  Canonical field list — used by introspection tests + the Translator
  to verify schema parity with Prisma. Sourced from
  `__schema__(:fields)` at runtime.
  """
  def field_list, do: __schema__(:fields)
end
