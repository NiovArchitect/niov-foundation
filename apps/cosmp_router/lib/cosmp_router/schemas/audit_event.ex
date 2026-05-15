defmodule CosmpRouter.AuditEvent do
  @moduledoc """
  Ecto persistence schema for the `audit_events` table per ADR-0033
  §Decision 4. Mirrors Prisma's `AuditEvent` model
  (`packages/database/prisma/schema.prisma:261-283`) field-for-field.

  ## Audit-chain participation

  Each row's `event_hash` is a SHA-256 of the canonical record (see
  `CosmpRouter.Audit.canonical_record/1`). `previous_event_hash` links
  to the prior row in this chain (selected by `chain_key` per ADR-0033
  §Decision 4c). Writes are append-only — the BEFORE DELETE trigger
  installed by `packages/database/src/queries/audit.ts:322`
  (TypeScript-register-owned per ADR-0033 §Decision 8 + ADR-0002)
  raises an exception on any DELETE attempt.

  ## Schema ownership

  Per ADR-0025 + ADR-0033 §Decision 7: Prisma owns the `audit_events`
  table DDL. Ecto schema is read + write surface only. The TypeScript
  register's `writeAuditEvent` + the Elixir register's
  `CosmpRouter.Audit.write_audit_event/1+3` write byte-equivalent
  rows; either-language `verify_audit_chain` reads any row.

  ## References

  - ADR-0033 §Decision 4 (audit primitive byte-equivalence) +
    §Decision 8 (trigger ownership)
  - ADR-0002 (Append-only audit chain with BEFORE DELETE trigger)
  - `packages/database/prisma/schema.prisma:261-283` (canonical schema)
  - `packages/database/src/queries/audit.ts:276-303` (TS canonical_record)
  """

  use Ecto.Schema

  @primary_key {:audit_id, Ecto.UUID, autogenerate: true}

  schema "audit_events" do
    field :event_type, :string
    field :actor_entity_id, Ecto.UUID
    field :target_entity_id, Ecto.UUID
    field :target_capsule_id, Ecto.UUID
    field :session_id, Ecto.UUID
    field :outcome, :string
    field :denial_reason, :string
    field :details, :map, default: %{}
    field :ip_address, :string
    field :timestamp, :utc_datetime_usec, default: nil
    field :previous_event_hash, :string
    field :event_hash, :string
    # CAR Sub-box 3 sub-phase 4 [SUB-BOX-3-AUDIT-CHAIN-EXTENSION] per
    # ADR-0036 Sub-decision 5 hybrid binding. lawful_basis_id +
    # lawful_basis_chain_hash are top-level canonical_record/1
    # positions 13 + 14. Nullable; non-lawful-basis emissions
    # canonicalize the empty string at the audit primitive register.
    field :lawful_basis_id, Ecto.UUID
    field :lawful_basis_chain_hash, :string
  end

  @doc """
  Canonical field list — introspection tests + audit primitive use
  this for parity verification.
  """
  def field_list, do: __schema__(:fields)
end
