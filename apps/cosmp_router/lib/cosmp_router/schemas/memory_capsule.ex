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

  ## Embedding column boundary (G3.8 / Q-G3-θ β-A LOCK)

  The `memory_capsules.embedding` column (`pgvector(1536)` per ADR-0043
  §G3.3 LANDED at commit `bcba7d1`) is **Prisma-owned and TypeScript /
  Prisma-managed**. It is **intentionally not Ecto-visible** at this
  schema register.

  Foundation production readiness at HEAD `ee0b01b` deliberately
  excludes Elixir-side vector access:

  - TypeScript `WriteService` (G3.5) generates and persists embeddings
    at create-time + UPDATE-time via inline raw SQL
    `tx.$executeRawUnsafe('UPDATE memory_capsules SET embedding =
    $1::vector(1536) WHERE capsule_id = $2::uuid', vectorLiteral,
    capsuleId)`.
  - TypeScript `SimilarityService` (G3.6) reads embeddings via raw SQL
    pgvector cosine query with 6 RULE 0 SQL-tier privacy filters
    (wallet_id + deleted_at + ai_access_blocked + requires_validation +
    clearance_required + embedding IS NOT NULL) + HNSW iterative scan
    posture.
  - BEAM / COSMP coordination layer (`cosmp_router` 7-RPC service
    surface + `dbgi_supervisor` per-DMW supervised processes) operates
    over the 7 COSMP ops (Authenticate / Negotiate / Read / Write /
    Share / Revoke / Audit) + MemoryCapsule lifecycle/routing — **NOT
    embedding distance**.

  ### No `:embedding` field without Founder authorization

  NO `:embedding` field should be added to this Ecto schema without:

  1. A proven Elixir/BEAM production consumer (e.g., BEAM-side
     semantic routing; AI_AGENT EntityType-discriminated capsule
     routing per ADR-0041 §Sub-decision 6; hive-scale semantic
     clustering per ADR-0028 §Forward Queue).
  2. Explicit Founder authorization per RULE 20.
  3. ADR-0033 §Decision 7 cross-language data-ownership boundary
     amendment OR explicit cross-language ownership authorization at
     the boundary register.
  4. RULE 0 safeguards across every BEAM surface:
     - struct serialization (Jason / Phoenix encoders) MUST NOT
       expose embedding by default
     - Logger / structured logging MUST NOT log embedding content
     - telemetry events MUST NOT include vector data
     - gRPC envelopes MUST NOT include embedding field
     - tests must verify each of the above

  ### Forward-substrate naming reconciliation

  Q-G3-θ prose at ADR-0043 L289 references a hypothetical hex
  dep `pgvector_ex`; the canonical Hex package appears to be
  `pgvector` (no `_ex` suffix). This observation is forward-queued
  at commit-body-only register substantively as
  `D-PGVECTOR-EX-HEX-PACKAGE-NAME-DRIFT-AT-Q-G3-θ` and requires
  reconciliation only if/when future Elixir vector implementation is
  Founder-authorized.

  ### Test anchor

  The local guardrail for this contract is the explicit named test in
  `apps/cosmp_router/test/cosmp_router/schemas/memory_capsule_test.exs`
  titled "embedding column is Prisma-owned and intentionally absent
  from Ecto schema per Q-G3-θ β-A LOCK + ADR-0043 §Sub-decision 8"
  which asserts `:embedding not in MemoryCapsule.__schema__(:fields)`
  via `refute`. Combined with the pre-existing field-set parity test
  ("field set matches expected (Prisma parity at sub-phase 5b-ii
  landing)") that enforces `extra == []`, the boundary is durably
  substrate-enforced at the Ecto test tier.
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
    field :commitment_date, :utc_datetime_usec

    # Storage register
    field :storage_location, :string
    field :storage_tier, :string, default: "WARM"

    # Patent layer 3 (Rules)
    field :clearance_required, :integer, default: 0
    field :access_count, :integer, default: 0
    field :content_hash, :string
    # ADR-0045 G5.3 Q-G5.3-α α-1 + κ-1 LOCK: embedding lag detection
    # metadata pass-through. BEAM observer-only per Q-G5-κ κ-1; no
    # Elixir staleness computation; Translator round-trip preservation
    # only. Set by TS write.service.ts after successful embedding
    # generation per Q-G5.3-γ γ-1.
    field :embedding_content_hash, :string
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
    #
    # All DateTime fields use `:utc_datetime_usec` (microsecond
    # precision at Elixir register), mirroring `AuditEvent.timestamp`
    # canonical at the same Postgres-shared-DDL register. Prisma owns
    # the table DDL (per ADR-0025 + ADR-0033 §Decision 7) and produces
    # `TIMESTAMP(3)` (millisecond precision) — Postgres silently
    # truncates the microseconds on column write.
    #
    # Per D-PHASE-2-CROSS-LANG-PRECISION-DRIFT substrate-build
    # observation (canonical at ADR-0035, surfaced at sub-phase 6b
    # integration-tier execution): the canonical NIOV pattern matches
    # `Audit.write_audit_event/1` substrate at `audit.ex:297-301` —
    # Elixir holds microsecond precision; `canonical_record/1`
    # truncates to millisecond at hash time for byte-equivalence with
    # the TS register (ADR-0033 §D-5BII-EXEC-2 + §Decision 4a). No
    # autogenerate-side truncation; full microsecond at the schema
    # register.
    field :created_at, :utc_datetime_usec, autogenerate: {DateTime, :utc_now, []}
    field :last_accessed_at, :utc_datetime_usec
    # `last_updated_at` autogenerates on insert mirroring `created_at`.
    # Prisma's canonical `@updatedAt` semantic auto-updates on every
    # write; this Ecto autogenerate covers the insert boundary so
    # NOT NULL is satisfied when `Translator.pack/1` returns nil for
    # this field (Proto-routed WRITE with `time: nil`). Mutation-time
    # updates land via explicit changeset (no Ecto auto-touch).
    field :last_updated_at, :utc_datetime_usec, autogenerate: {DateTime, :utc_now, []}
    # ADR-0045 G5.3 Q-G5.3-α α-1 + κ-1 LOCK: timestamp of last
    # successful embedding generation. Paired with
    # embedding_content_hash at Patent layer 3 (Rules) for stale-
    # embedding detection. BEAM observer-only per Q-G5-κ κ-1.
    field :embedding_generated_at, :utc_datetime_usec
    field :expires_at, :utc_datetime_usec
    field :deleted_at, :utc_datetime_usec
  end

  @doc """
  Canonical field list — used by introspection tests + the Translator
  to verify schema parity with Prisma. Sourced from
  `__schema__(:fields)` at runtime.
  """
  def field_list, do: __schema__(:fields)
end
