defmodule CosmpRouter.AuditEventTest do
  @moduledoc """
  Schema introspection tests for `CosmpRouter.AuditEvent` per ADR-0033
  §Decision 4. Verifies the Ecto schema's field set matches Prisma
  `AuditEvent` column shape (14 fields + audit_id UUID primary key
  per ADR-0036 Sub-decision 5 sub-phase 4 [SUB-BOX-3-AUDIT-CHAIN-
  EXTENSION] hybrid binding extension; 12 original fields + 2
  lawful-basis fields at canonical_record/1 positions 13 + 14).

  Pure introspection — no Repo connection. Audit-chain integration
  tests land at sub-phase 5b-ii Phase 3 (audit_test.exs) +
  byte-equivalence tests at canonical_record_test.exs.
  """

  use ExUnit.Case, async: true

  alias CosmpRouter.AuditEvent

  @expected_fields [
    :audit_id,
    :event_type,
    :actor_entity_id,
    :target_entity_id,
    :target_capsule_id,
    :session_id,
    :outcome,
    :denial_reason,
    :details,
    :ip_address,
    :timestamp,
    :previous_event_hash,
    :event_hash,
    # CAR Sub-box 3 sub-phase 4 [SUB-BOX-3-AUDIT-CHAIN-EXTENSION] per
    # ADR-0036 Sub-decision 5: canonical_record/1 positions 13 + 14.
    :lawful_basis_id,
    :lawful_basis_chain_hash
  ]

  test "schema source is `audit_events` table" do
    assert AuditEvent.__schema__(:source) == "audit_events"
  end

  test "primary key is :audit_id (Ecto.UUID)" do
    assert AuditEvent.__schema__(:primary_key) == [:audit_id]
    assert AuditEvent.__schema__(:type, :audit_id) == Ecto.UUID
  end

  test "field set matches Prisma AuditEvent (14 fields + audit_id PK per ADR-0036 Sub-decision 5)" do
    actual = AuditEvent.field_list() |> MapSet.new()
    expected = MapSet.new(@expected_fields)

    missing = MapSet.difference(expected, actual) |> MapSet.to_list()
    extra = MapSet.difference(actual, expected) |> MapSet.to_list()

    assert missing == [],
           "AuditEvent schema MISSING expected fields: #{inspect(missing)}"

    assert extra == [],
           "AuditEvent schema has UNEXPECTED fields: #{inspect(extra)}"
  end

  test "actor + target FKs + lawful_basis_id are Ecto.UUID" do
    for uuid_field <- [
          :actor_entity_id,
          :target_entity_id,
          :target_capsule_id,
          :session_id,
          # CAR Sub-box 3 sub-phase 4 per ADR-0036 Sub-decision 5:
          # lawful_basis_id is a UUID FK to LawfulBasis.basis_id.
          :lawful_basis_id
        ] do
      assert AuditEvent.__schema__(:type, uuid_field) == Ecto.UUID
    end
  end

  test "details column is :map (Prisma JSONB equivalent)" do
    assert AuditEvent.__schema__(:type, :details) == :map
  end

  test "chain primitives present (event_hash + previous_event_hash)" do
    assert AuditEvent.__schema__(:type, :event_hash) == :string
    assert AuditEvent.__schema__(:type, :previous_event_hash) == :string
  end

  test "lawful_basis_chain_hash is :string (SHA-256 hex per ADR-0036 Sub-decision 5)" do
    # CAR Sub-box 3 sub-phase 4 [SUB-BOX-3-AUDIT-CHAIN-EXTENSION]:
    # lawful_basis_chain_hash carries the SHA-256 hex digest of the
    # 5-field LawfulBasis canonical content (per
    # CosmpRouter.LawfulBasis.compute_lawful_basis_chain_hash/1).
    # Stored as :string at the Ecto register; mirrors Prisma's
    # `String?` typing canonical at the AuditEvent model.
    assert AuditEvent.__schema__(:type, :lawful_basis_chain_hash) == :string
  end
end
