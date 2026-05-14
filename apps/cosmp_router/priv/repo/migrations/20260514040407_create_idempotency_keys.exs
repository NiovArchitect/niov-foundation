defmodule CosmpRouter.Repo.Migrations.CreateIdempotencyKeys do
  @moduledoc """
  Sub-phase 5b-iii [BEAM-COSMP-INTEROP-INTEGRATION-IDEMPOTENCY] per
  ADR-0033 §Decision 6 (Idempotency layer). Elixir-owned table per
  D-5BII-EXEC-5 hybrid Option β — first instantiation of the
  Elixir-owned DDL boundary; Prisma owns shared tables (per
  ADR-0025 + ADR-0033 §Decision 7), Ecto owns Elixir-only tables.

  ## Schema

  - `idempotency_key` TEXT PRIMARY KEY — caller-provided key
    (e.g., "write:capsule:c-1:v2") that uniquely identifies the
    operation
  - `scope` TEXT — operational scope (e.g., COSMP op type) for
    scope-filtered lookups
  - `result` JSONB — cached response body (canonical-encoded;
    deserialization is caller responsibility)
  - `inserted_at` TIMESTAMPTZ — write timestamp
  - `expires_at` TIMESTAMPTZ — TTL boundary (24h default;
    configurable per Idempotency.record/3)

  ## Indexes

  - `(scope)` for scope-filtered lookups
  - `(expires_at)` for TTL-based cleanup queries

  ## References

  - ADR-0033 §Decision 6 (Idempotency layer architecture)
  - ADR-0026 §5 BEAM Pattern 4 (event-sourced audit) + Pattern 5
    (idempotent verification keys) compound
  - ADR-0025 (Schema-Push-Target Discipline; Prisma owns shared
    DDL; Ecto owns Elixir-internal DDL — this migration is the
    canonical first instance)
  """

  use Ecto.Migration

  def change do
    create table(:idempotency_keys, primary_key: false) do
      add :idempotency_key, :text, primary_key: true, null: false
      add :scope, :text, null: false
      add :result, :map, null: false
      add :inserted_at, :utc_datetime_usec, null: false
      add :expires_at, :utc_datetime_usec, null: false
    end

    create index(:idempotency_keys, [:scope])
    create index(:idempotency_keys, [:expires_at])
  end
end
