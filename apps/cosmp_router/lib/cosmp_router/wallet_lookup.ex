defmodule CosmpRouter.WalletLookup do
  @moduledoc """
  Per-request indexed point-lookup of wallet_type by entity_id FK on
  the wallets table per ADR-0039 Sub-decision 4.

  ## Substrate-architectural pattern

  Per-request indexed point-lookup pattern inherited from ADR-0036
  REGULATOR per-request indexed point-lookup discipline canonical at
  canonical-coherence register substantively. Query target is the
  wallets table at substrate-state ground truth register; entity_id
  FK is `@unique` indexed at Prisma-owned schema register canonical
  at `packages/database/prisma/schema.prisma`. No caching at sub-phase
  b register; ETS read-cache substrate forward-substrate to Commit B.5
  per ADR-0039 Sub-decision 5.

  ## WalletType 3-tier canonical

  Return shape matches actual Prisma WalletType enum 3-tier at
  canonical-honest register substantively:

  - `:personal` (Prisma PERSONAL; includes AI_AGENT entities per TS-side
    `defaultWalletTypeFor/1` mapping AI_AGENT EntityType to PERSONAL
    wallet_type at INSERT register canonical at
    `packages/database/src/queries/wallet.ts`)
  - `:enterprise` (Prisma ENTERPRISE)
  - `:device` (Prisma DEVICE)

  AI_AGENT substantively is an EntityType (not a WalletType) at
  canonical-honest register substantively; AI_AGENT entities map to
  PERSONAL wallet_type at INSERT register substantively per TS-side
  helper canonical at substrate-state ground truth register. The
  wallet_type column substantively is read directly canonical at
  canonical-knowledge register substantively without EntityType
  inspection.

  ## Cardinality at sub-phase b register

  Prisma `@unique` on `wallets.entity_id` enforces 1:1 entity:wallet
  cardinality at DB register canonical at substrate-state ground truth
  register. Query selects first match defensively (`limit: 1`);
  cardinality is enforced upstream at Prisma constraint register
  canonical at canonical-execution register substantively.

  ## Substrate-honest drift guard

  Returns `{:error, :invalid_wallet_type}` if the DB column contains
  an unexpected enum value at canonical-honest register substantively
  (defensive guard against Prisma schema drift between Prisma and
  Ecto registers; Prisma native enum constraint substantively prevents
  invalid INSERTs at DB register canonical at substrate-state ground
  truth register).

  ## References

  - ADR-0039 Sub-decision 4 (NEW CosmpRouter.WalletLookup)
  - ADR-0036 (REGULATOR per-request indexed point-lookup pattern)
  - ADR-0038 Sub-decision 3 (WalletType 3-tier canonical)
  - `CosmpRouter.Wallet` (read-only Ecto projection on wallets table)
  """

  import Ecto.Query, only: [from: 2]

  alias CosmpRouter.{Repo, Wallet}

  @type wallet_type :: :personal | :enterprise | :device

  @doc """
  Look up wallet_type for the given entity_id via per-request indexed
  point-lookup on the Prisma-owned wallets table.

  Returns `{:ok, wallet_type}` on hit, `{:error, :not_found}` when no
  wallet exists for that entity_id, `{:error, :invalid_wallet_type}`
  if the DB column contains an unexpected enum value (defensive guard
  against Prisma schema drift).
  """
  @spec wallet_type_for(String.t()) ::
          {:ok, wallet_type()} | {:error, :not_found | :invalid_wallet_type}
  def wallet_type_for(entity_id) when is_binary(entity_id) do
    query =
      from(w in Wallet,
        where: w.entity_id == ^entity_id,
        select: w.wallet_type,
        limit: 1
      )

    case Repo.one(query) do
      nil -> {:error, :not_found}
      "PERSONAL" -> {:ok, :personal}
      "ENTERPRISE" -> {:ok, :enterprise}
      "DEVICE" -> {:ok, :device}
      _other -> {:error, :invalid_wallet_type}
    end
  end
end
