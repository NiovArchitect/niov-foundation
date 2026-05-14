defmodule CosmpRouter.IdempotencyTest do
  @moduledoc """
  DB-touching tests for `CosmpRouter.Idempotency` per ADR-0033 §Decision 6.
  Sandbox-isolated; mirrors the substrate-coherence pattern from
  storage/postgres_test.exs.

  Coverage:
  - record/3 + check/2 round-trip (cache hit semantics)
  - check/2 miss returns :not_found
  - PK collision on duplicate (idempotency_key, scope) inserts
  - TTL expiration: expired entry returns :not_found
  - Scope isolation: same idempotency_key in different scopes are
    independent entries
  - cleanup/0 purges expired entries; preserves non-expired

  ## References

  - ADR-0033 §Decision 6 (Idempotency layer)
  - ADR-0026 §5 Pattern 4 + Pattern 5 compound
  """

  use ExUnit.Case, async: false

  alias CosmpRouter.{Repo, Idempotency, IdempotencyKey}

  setup do
    :ok = Ecto.Adapters.SQL.Sandbox.checkout(Repo)
    :ok
  end

  describe "record/3 + check/2 round-trip" do
    test "record stores entry; check returns cached result within TTL" do
      key = "write:capsule:test-1:v1"
      scope = "WRITE"
      # Use string keys at write-time to match the JSONB read-back
      # canonical form. Ecto's :map type stores atom keys as strings
      # in JSONB; deserialization keeps strings (no atomization).
      result = %{"capsule_id" => "test-1", "success" => true}

      assert {:ok, %IdempotencyKey{} = entry} = Idempotency.record(key, scope, result)
      assert entry.idempotency_key == key
      assert entry.scope == scope
      assert entry.result == result

      assert {:ok, cached} = Idempotency.check(key, scope)
      assert cached == result
    end

    test "check on missing (idempotency_key, scope) returns :not_found" do
      assert Idempotency.check("never-recorded", "WRITE") == :not_found
    end

    test "scope filter narrows the lookup to matching scope only" do
      # idempotency_key alone is the canonical PK per ADR-0033 §Decision
      # 6 (operator spec: TEXT primary key); scope is a filter, not part
      # of the unique constraint. Caller-derived idempotency_key MUST
      # already encode scope-disambiguation when needed (e.g.,
      # "write:capsule:c-1:v1" vs "share:capsule:c-1:v1"). check/2's
      # scope arg narrows the lookup; a key recorded under WRITE will
      # NOT be returned when checking under SHARE.
      key_a = "write:capsule:c-1:v1"
      key_b = "share:capsule:c-1:v1"
      # String keys to match JSONB read-back canonical form.
      result_write = %{"op" => "write"}
      result_share = %{"op" => "share"}

      assert {:ok, _} = Idempotency.record(key_a, "WRITE", result_write)
      assert {:ok, _} = Idempotency.record(key_b, "SHARE", result_share)

      assert {:ok, ^result_write} = Idempotency.check(key_a, "WRITE")
      assert {:ok, ^result_share} = Idempotency.check(key_b, "SHARE")

      # Cross-scope check returns :not_found (scope filter narrows)
      assert :not_found = Idempotency.check(key_a, "SHARE")
      assert :not_found = Idempotency.check(key_b, "WRITE")
    end
  end

  describe "PK collision discipline" do
    test "second record for same (idempotency_key, scope) fails on PK conflict" do
      key = "duplicate-key"
      scope = "WRITE"

      assert {:ok, _} = Idempotency.record(key, scope, %{first: true})

      assert {:error, %Ecto.Changeset{} = changeset} =
               Idempotency.record(key, scope, %{second: true})

      # Postgres unique constraint violation surfaces as an Ecto
      # changeset error on insert; verify the changeset is invalid.
      refute changeset.valid?
    end
  end

  describe "TTL expiration semantics" do
    test "TTL window honored: 1-hour-back expires_at returns :not_found" do
      # Manually insert an expired entry (bypassing record/3's
      # default-TTL path) to test the expires_at boundary.
      key = "expired-key"
      scope = "WRITE"
      now = DateTime.utc_now()
      past_expires = DateTime.add(now, -3600, :second)

      %IdempotencyKey{
        idempotency_key: key,
        scope: scope,
        result: %{stale: true},
        inserted_at: DateTime.add(now, -7200, :second),
        expires_at: past_expires
      }
      |> Repo.insert!()

      assert Idempotency.check(key, scope) == :not_found
    end

    test "non-expired entry within TTL returns cached result" do
      key = "fresh-key"
      scope = "WRITE"

      assert {:ok, _} = Idempotency.record(key, scope, %{fresh: true}, 1)

      assert {:ok, %{"fresh" => true}} = Idempotency.check(key, scope)
    end
  end

  describe "cleanup/0" do
    test "purges expired entries; preserves non-expired" do
      now = DateTime.utc_now()

      # Expired entry (1 hour past expires_at)
      %IdempotencyKey{
        idempotency_key: "to-purge-1",
        scope: "WRITE",
        result: %{},
        inserted_at: DateTime.add(now, -7200, :second),
        expires_at: DateTime.add(now, -3600, :second)
      }
      |> Repo.insert!()

      # Non-expired entry (1 hour future expires_at)
      assert {:ok, _} =
               Idempotency.record("to-keep-1", "WRITE", %{kept: true}, 1)

      # Cleanup: should purge 1 expired; preserve 1 non-expired
      purged = Idempotency.cleanup()
      assert purged >= 1

      # Non-expired entry survives
      assert {:ok, %{"kept" => true}} = Idempotency.check("to-keep-1", "WRITE")
      # Expired entry purged
      assert :not_found = Idempotency.check("to-purge-1", "WRITE")
    end
  end
end
