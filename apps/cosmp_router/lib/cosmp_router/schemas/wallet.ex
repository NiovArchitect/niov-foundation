defmodule CosmpRouter.Wallet do
  @moduledoc """
  Read-only Ecto projection on the Prisma-owned `wallets` table per
  ADR-0033 cross-language data ownership canonical at
  substrate-architectural register substantively.

  Mirrors Prisma's `Wallet` model
  (`packages/database/prisma/schema.prisma`) at minimum scope for
  per-request indexed point-lookup queries from cosmp_router. Schema
  extends as additional fields are required by future cosmp_router
  queries at canonical-state register substantively.

  ## Cross-language data ownership

  The `wallets` table is owned by the TypeScript Prisma schema at
  `packages/database/prisma/schema.prisma`. Ecto schema serves as
  read-only projection; Ecto does NOT migrate this table at
  canonical-coherence register substantively. Schema parity with
  Prisma is contributor + manual discipline matching the
  `CosmpRouter.MemoryCapsule` + `CosmpRouter.AuditEvent` pattern
  canonical at sub-phase 5b-ii substrate register.

  ## Substrate-honest scope at sub-phase b register

  Sub-arc 1 sub-phase b Commit B.4 [BEAM-DBGI-WALLET-LOOKUP-CODE] per
  ADR-0039 Sub-decision 4 substantively requires the minimum fields for
  wallet_type lookup by entity_id FK at per-request indexed point-lookup
  register substantively per ADR-0036. Schema fields at minimum scope:

  - `wallet_id` (UUID; Prisma primary key)
  - `entity_id` (UUID; FK to entities; `@unique` per Prisma schema
    canonical at substrate-state ground truth register; enforces 1:1
    entity:wallet cardinality)
  - `wallet_type` (string at DB register; Prisma WalletType enum with
    3 values: PERSONAL, ENTERPRISE, DEVICE per ADR-0038 Sub-decision 3)

  AI_AGENT substantively is an EntityType (not a WalletType) per Prisma
  schema canonical at substrate-state ground truth register; AI_AGENT
  entities map to PERSONAL wallet_type at INSERT register per TS-side
  `defaultWalletTypeFor/1` helper canonical at
  `packages/database/src/queries/wallet.ts`.

  ## References

  - ADR-0039 Sub-decision 4 (NEW `CosmpRouter.WalletLookup` module)
  - ADR-0033 (cross-language data ownership; Prisma-owned tables;
    Ecto read-only projection pattern)
  - ADR-0038 Sub-decision 3 (WalletType 3-tier: PERSONAL/ENTERPRISE/DEVICE)
  - `packages/database/prisma/schema.prisma` (Prisma canonical schema)
  """

  use Ecto.Schema

  @primary_key {:wallet_id, Ecto.UUID, autogenerate: false}

  schema "wallets" do
    field :entity_id, Ecto.UUID
    field :wallet_type, :string
  end
end
