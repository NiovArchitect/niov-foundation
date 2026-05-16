defmodule CosmpRouter.WalletLookupTest do
  @moduledoc """
  Tests for `CosmpRouter.WalletLookup` per-request indexed point-lookup
  pattern per ADR-0039 Sub-decision 4.

  ## Test fixtures

  Direct raw SQL INSERTs into entities + wallets tables matching the
  canonical `setup_router_fk!/0` pattern at `RouterTestHelpers`; unique
  entity_id + wallet_id UUIDs per test via `Ecto.UUID.generate/0`.

  ## :invalid_wallet_type drift guard test

  The `{:error, :invalid_wallet_type}` branch substantively cannot be
  exercised at integration tier register substantively because Prisma
  enum constraint at DB register substantively prevents inserting an
  invalid value canonical at substrate-state ground truth register.
  The guard exists defensively for hypothetical schema drift between
  Prisma and Ecto registers per ADR-0033 cross-language data ownership
  canonical at canonical-coherence register substantively. Test
  `@tag :skip` documented at canonical-prose register substantively.

  ## References

  - ADR-0039 Sub-decision 4 (CosmpRouter.WalletLookup)
  - ADR-0033 (cross-language data ownership)
  - ADR-0034 (BEAM testability discipline)
  """

  use ExUnit.Case, async: false

  import CosmpRouter.RouterTestHelpers, only: [start_sandbox_owner!: 0]

  alias CosmpRouter.{Repo, WalletLookup}

  setup do
    _owner = start_sandbox_owner!()
    :ok
  end

  defp insert_entity_with_wallet(wallet_type_string) do
    entity_id = Ecto.UUID.generate()
    wallet_id = Ecto.UUID.generate()

    Repo.query!("""
      INSERT INTO entities
        (entity_id, entity_type, display_name, public_key, created_at, updated_at)
      VALUES
        ('#{entity_id}'::uuid, 'PERSON', 'test entity', 'test_public_key', NOW(), NOW())
    """)

    Repo.query!("""
      INSERT INTO wallets
        (wallet_id, entity_id, wallet_type, niov_can_access_contents, created_at, updated_at)
      VALUES
        ('#{wallet_id}'::uuid, '#{entity_id}'::uuid, '#{wallet_type_string}', false, NOW(), NOW())
    """)

    entity_id
  end

  describe "wallet_type_for/1" do
    test "returns {:ok, :personal} for PERSONAL wallet" do
      entity_id = insert_entity_with_wallet("PERSONAL")

      assert {:ok, :personal} = WalletLookup.wallet_type_for(entity_id)
    end

    test "returns {:ok, :enterprise} for ENTERPRISE wallet" do
      entity_id = insert_entity_with_wallet("ENTERPRISE")

      assert {:ok, :enterprise} = WalletLookup.wallet_type_for(entity_id)
    end

    test "returns {:ok, :device} for DEVICE wallet" do
      entity_id = insert_entity_with_wallet("DEVICE")

      assert {:ok, :device} = WalletLookup.wallet_type_for(entity_id)
    end

    test "returns {:error, :not_found} when no wallet exists for entity_id" do
      nonexistent_uuid = Ecto.UUID.generate()

      assert {:error, :not_found} = WalletLookup.wallet_type_for(nonexistent_uuid)
    end

    @tag :skip
    test "returns {:error, :invalid_wallet_type} for unexpected DB value" do
      # Prisma native enum constraint at DB register substantively prevents
      # inserting an invalid wallet_type value canonical at substrate-state
      # ground truth register; this test substantively cannot be exercised
      # at integration tier without bypassing Postgres enum validation at
      # canonical-execution register. The drift guard exists defensively
      # for hypothetical Prisma <-> Ecto schema drift canonical at ADR-0033
      # cross-language data ownership register.
      :ok
    end

    test "queries wallets table directly (substrate-coherence verification)" do
      # Insert two distinct entities with distinct wallets; verify lookup
      # returns the correct wallet_type per entity_id (cardinality boundary).
      entity_personal = insert_entity_with_wallet("PERSONAL")
      entity_enterprise = insert_entity_with_wallet("ENTERPRISE")

      assert {:ok, :personal} = WalletLookup.wallet_type_for(entity_personal)
      assert {:ok, :enterprise} = WalletLookup.wallet_type_for(entity_enterprise)
    end
  end
end
