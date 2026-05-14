defmodule CosmpRouter.Repo do
  @moduledoc """
  Ecto.Repo for the COSMP coordination layer's persistence substrate
  per ADR-0033 §Decision Q-PERSISTENCE-DEPS.

  ## Connection register

  - **Test**: `localhost:5433/foundation_test` (the `niov-foundation-
    test-db` Colima container per ADR-0013 + ADR-0015 §Decision E
    `postgres:16.4-alpine` pin); shared with the Foundation TypeScript
    unit tier per ADR-0033 §Decision Q-PG-TEST. RULE 15 single-cycle
    test discipline applies — no concurrent vitest + mix test runs.
  - **Dev / prod**: `DATABASE_URL` from `System.get_env/1` resolved at
    `config/runtime.exs` per ADR-0033 §Decision (D-5BII-EXEC-7
    Option α). Production points at the Supabase pooler at port 6543
    with `prepare: :unnamed` for pgbouncer transaction-mode
    compatibility.

  ## Schema ownership

  - **Shared tables** (memory_capsules, audit_events, permissions,
    etc.) — Prisma owns DDL per ADR-0025 + ADR-0033 §Decision
    Q-MIGRATION-OWNERSHIP. Ecto schemas at `CosmpRouter.MemoryCapsule`
    + `CosmpRouter.AuditEvent` MIRROR Prisma's column shape; Ecto
    never invokes `mix ecto.migrate` against shared tables.
  - **Elixir-owned tables** (e.g., `idempotency_keys` introduced at
    sub-phase 5b-ii) — Ecto migrations canonical at
    `apps/cosmp_router/priv/repo/migrations/`.

  ## Audit primitive integration

  `CosmpRouter.Audit.write_audit_event/1` (standalone mode) opens its
  own Repo transaction. `CosmpRouter.Audit.write_audit_event/3`
  (composed mode) participates in the caller's `Ecto.Multi`. See
  ADR-0033 §Decision 4e for the dual-mode discipline + RULE 4
  composed-mode default for COSMP WRITE/SHARE/REVOKE.

  ## References

  - ADR-0033 (BEAM Persistence + Idempotency + Audit-Chain
    Cryptographic Substrate Architecture) §Decision
  - ADR-0011 + ADR-0013 (containerized Postgres test register)
  - ADR-0025 (Schema-Push-Target Discipline; Prisma owns shared DDL)
  - ADR-0002 (Append-only audit chain; SHA-256 hash chain primitive
    this Repo's `audit_events` rows participate in)
  """

  use Ecto.Repo,
    otp_app: :cosmp_router,
    adapter: Ecto.Adapters.Postgres
end
