defmodule CosmpRouter.IdempotencyKey do
  @moduledoc """
  Ecto persistence schema for the `idempotency_keys` table per ADR-0033
  §Decision 6. Elixir-owned table (Ecto migration canonical at
  `apps/cosmp_router/priv/repo/migrations/20260514040407_create_idempotency_keys.exs`)
  per D-5BII-EXEC-5 hybrid Option β.

  ## Schema ownership

  Per ADR-0025 + ADR-0033 §Decision 7 (Q-MIGRATION-OWNERSHIP):
  - **Prisma owns shared-table DDL** (memory_capsules, audit_events, etc.)
  - **Ecto owns Elixir-only-table DDL** (idempotency_keys lands here as
    the first instance; future Elixir-internal tables follow this
    boundary)

  ## Pattern 4 instantiation register

  ADR-0026 §5 BEAM Pattern 4 (event-sourced audit) + Pattern 5
  (idempotent verification keys) compound. The `idempotency_key` field
  is the caller-derived idempotency key (e.g.,
  `"write:capsule:c-1:v2"`); replays of the same operation hit the
  cached `result` JSONB without re-executing side-effects.

  ## References

  - ADR-0033 §Decision 6 (Idempotency layer) + §Decision 7 (migration
    ownership boundary)
  - ADR-0026 §5 Pattern 4 + Pattern 5
  - apps/cosmp_router/lib/cosmp_router/idempotency.ex (consumer module)
  """

  use Ecto.Schema

  @primary_key {:idempotency_key, :string, autogenerate: false}

  schema "idempotency_keys" do
    field :scope, :string
    field :result, :map
    field :inserted_at, :utc_datetime_usec
    field :expires_at, :utc_datetime_usec
  end

  @doc """
  Canonical field list — introspection tests use this for schema
  parity verification with the migration.
  """
  def field_list, do: __schema__(:fields)
end
