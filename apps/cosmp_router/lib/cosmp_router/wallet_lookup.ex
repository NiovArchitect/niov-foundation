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

  - `:personal` (Prisma PERSONAL; includes Personal AI Agent / twin
    entities per ADR-0046 dual-context routing model — AI_AGENT
    entities created with explicit `wallet_type: "PERSONAL"` override
    at `apps/api/src/services/governance/twin.service.ts:189-191`)
  - `:enterprise` (Prisma ENTERPRISE; includes Enterprise AI Agent
    entities per ADR-0046 dual-context routing model — AI_AGENT
    entities falling back to `defaultWalletTypeFor(AI_AGENT) =
    ENTERPRISE` RULE 0 safe default at
    `packages/database/src/queries/wallet.ts:39-58`)
  - `:device` (Prisma DEVICE)

  AI_AGENT substantively is an EntityType (not a WalletType) at
  canonical-honest register substantively per ADR-0046. AI_AGENT
  entities route to either PERSONAL or ENTERPRISE WalletType
  depending on deployment/use context per ADR-0046 dual-context
  routing model (Personal AI Agent + Enterprise AI Agent). The
  wallet_type column substantively is read directly canonical at
  canonical-knowledge register substantively without EntityType
  inspection — `wallet_type` is the canonical BEAM dispatch signal
  per ADR-0039 §Amendment 2.

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
  - ADR-0039 §Amendment 2 (dual-context AI_AGENT routing path
    documentation; wallet_type column canonical BEAM dispatch signal)
  - ADR-0036 (REGULATOR per-request indexed point-lookup pattern)
  - ADR-0038 Sub-decision 3 (WalletType 3-tier canonical)
  - ADR-0046 (AI_AGENT EntityType-Discriminated Capsule Routing;
    dual-context routing model — Personal AI Agent + Enterprise AI
    Agent; G6.2 doc-and-test cascade corrects this moduledoc)
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
