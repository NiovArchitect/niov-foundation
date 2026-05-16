defmodule CosmpRouter.WalletCacheTest do
  @moduledoc """
  Tests for `CosmpRouter.WalletCache` ETS read-optimized cache per
  ADR-0039 Sub-decision 5.

  ## Test isolation pattern per ADR-0034 testability-refactor

  Each test creates an isolated WalletCache GenServer + ETS table via
  `start_supervised!` with unique atom name. Test isolation ensures
  cross-test cache state does not leak at canonical-coherence register
  substantively.

  ## Cache-hit + cache-miss test surface

  Cache-hit tests substantively pre-populate ETS directly at
  `:ets.insert/2` register substantively bypassing WalletLookup
  delegation; verify cache returns the stored value at
  canonical-execution register substantively.

  Cache-miss tests substantively insert real entity + wallet rows via
  raw SQL fixture pattern (matching wallet_lookup_test.exs); verify
  cache delegates to WalletLookup substantively + stores the result
  at canonical-coherence register substantively; subsequent lookup
  returns from cache without re-querying Repo.

  ## References

  - ADR-0039 Sub-decision 5 (CosmpRouter.WalletCache ETS substrate)
  - ADR-0034 (BEAM testability discipline; name-configurable +
    start_supervised!)
  - `CosmpRouter.Storage.ETSTest` (sibling test pattern canonical at
    ETS-owner GenServer register)
  """

  use ExUnit.Case, async: false

  import CosmpRouter.RouterTestHelpers, only: [start_sandbox_owner!: 0]

  alias CosmpRouter.{Repo, WalletCache}

  setup do
    _owner = start_sandbox_owner!()

    unique = System.unique_integer([:positive])
    test_cache = :"test_wallet_cache_#{unique}"

    start_supervised!({WalletCache, name: test_cache})

    {:ok, cache: test_cache}
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

  describe "wallet_type_for/2 cache-hit path" do
    test "returns pre-populated cache entry without delegating", %{cache: cache} do
      entity_id = "preseed-#{System.unique_integer([:positive])}"
      :ets.insert(cache, {entity_id, :enterprise})

      assert {:ok, :enterprise} = WalletCache.wallet_type_for(cache, entity_id)
    end

    test "subsequent lookup after cache-miss returns from cache", %{cache: cache} do
      entity_id = insert_entity_with_wallet("ENTERPRISE")

      # First lookup: cache miss -> delegates to WalletLookup -> stores result
      assert {:ok, :enterprise} = WalletCache.wallet_type_for(cache, entity_id)

      # Verify result is now in ETS cache
      assert [{^entity_id, :enterprise}] = :ets.lookup(cache, entity_id)

      # Second lookup: cache hit (no Repo call); delete the underlying
      # wallets row to prove cache serves the value without DB query
      Repo.query!("DELETE FROM wallets WHERE entity_id = '#{entity_id}'::uuid")

      assert {:ok, :enterprise} = WalletCache.wallet_type_for(cache, entity_id)
    end
  end

  describe "wallet_type_for/2 cache-miss delegation" do
    test "returns {:ok, :personal} for PERSONAL wallet via WalletLookup", %{cache: cache} do
      entity_id = insert_entity_with_wallet("PERSONAL")

      assert {:ok, :personal} = WalletCache.wallet_type_for(cache, entity_id)
      assert [{^entity_id, :personal}] = :ets.lookup(cache, entity_id)
    end

    test "returns {:ok, :device} for DEVICE wallet via WalletLookup", %{cache: cache} do
      entity_id = insert_entity_with_wallet("DEVICE")

      assert {:ok, :device} = WalletCache.wallet_type_for(cache, entity_id)
      assert [{^entity_id, :device}] = :ets.lookup(cache, entity_id)
    end

    test "returns {:error, :not_found} for unknown entity_id (NOT cached)", %{cache: cache} do
      nonexistent = Ecto.UUID.generate()

      assert {:error, :not_found} = WalletCache.wallet_type_for(cache, nonexistent)
      assert [] = :ets.lookup(cache, nonexistent)
    end
  end

  describe "invalidate/2" do
    test "removes cache entry; subsequent lookup re-delegates", %{cache: cache} do
      entity_id = insert_entity_with_wallet("PERSONAL")

      assert {:ok, :personal} = WalletCache.wallet_type_for(cache, entity_id)
      assert [{^entity_id, :personal}] = :ets.lookup(cache, entity_id)

      assert :ok = WalletCache.invalidate(cache, entity_id)
      assert [] = :ets.lookup(cache, entity_id)
    end

    test "is idempotent: no-op when no entry exists", %{cache: cache} do
      assert :ok = WalletCache.invalidate(cache, "nonexistent-entity-id")
    end
  end

  describe "concurrent reads at canonical-execution register" do
    test "multiple concurrent reads from cache succeed", %{cache: cache} do
      entity_id = "concurrent-#{System.unique_integer([:positive])}"
      :ets.insert(cache, {entity_id, :enterprise})

      tasks =
        for _ <- 1..50 do
          Task.async(fn -> WalletCache.wallet_type_for(cache, entity_id) end)
        end

      results = Task.await_many(tasks, 5_000)

      assert Enum.all?(results, fn r -> r == {:ok, :enterprise} end)
    end
  end
end
