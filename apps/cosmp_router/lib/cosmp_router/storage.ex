defmodule CosmpRouter.Storage do
  @moduledoc """
  Storage facade per ADR-0033 §Decision 5. Routes capsule storage
  operations between the ETS hot-tier
  (`CosmpRouter.Storage.ETS`; sub-millisecond reads, volatile across
  restarts) and the Postgres source-of-truth
  (`CosmpRouter.Storage.Postgres`; durable, mirror of Prisma's
  `memory_capsules` table).

  ## Read path

  ETS-first lookup; on miss, Postgres query → populate ETS entry
  → return. ETS is never the canonical answer; on discrepancy,
  Postgres wins (Postgres is source-of-truth per ADR-0033 §5).

  ## Write path

  Postgres write happens FIRST (composed-mode with audit per
  `CosmpRouter.Audit.write_audit_event/3` from the Router); on
  Postgres commit success, ETS entry is updated. ETS write happens
  AFTER Postgres commit; ETS may temporarily hold stale data on the
  very edge case of read-during-write but this is acceptable for a
  hot-tier cache.

  ## Delete path

  Postgres soft-delete (deleted_at timestamp; RULE 10 honor) →
  on success, ETS purge. ETS purge is idempotent.

  ## clear/0

  ETS-only operation (test/debug); Postgres source-of-truth never
  touched. Production never calls clear/0.

  ## Caller responsibility

  The Router (sub-phase 5b-ii Phase 5) wraps `put/2` + `delete/1`
  in an `Ecto.Multi` with composed-mode audit. The facade itself
  does NOT emit audit events — separation of concerns: storage
  layer = persistence; audit layer = chain integrity; both
  orchestrated by the Router.

  ## Per-test ETS instance opt threading

  Sub-phase 6a `[BEAM-COSMP-TESTABILITY-REFACTOR]` per ADR-0034:
  facade functions accept `:ets` opt to thread per-test Storage.ETS
  instance atoms; production callers omit it (default
  `CosmpRouter.Storage.ETS` singleton preserved).

  ## References

  - ADR-0033 §Decision 5 (Storage facade)
  - ADR-0026 §5 Pattern 3 (state reconstructible from durable storage)
  - ADR-0034 §Decision Sub-decision 2 (facade :ets opt threading)
  - RULE 10 (NOTHING IS EVER DELETED; soft-delete only)
  """

  alias CosmpRouter.{Capsule, Storage}

  @doc """
  Fetch a Capsule by capsule_id. ETS-first; on cache miss, Postgres
  query + ETS warm + return. Returns `{:ok, %Capsule{}}` or
  `{:error, :not_found}`.

  ## Options

  - `:ets` — Storage.ETS instance atom; defaults
    `CosmpRouter.Storage.ETS` (production singleton); tests pass
    per-test atom per ADR-0034.
  """
  def get(capsule_id, opts \\ []) when is_binary(capsule_id) do
    ets = Keyword.get(opts, :ets, Storage.ETS)

    case Storage.ETS.get(ets, capsule_id) do
      {:ok, capsule} ->
        # Hot-tier hit; return without touching Postgres.
        {:ok, capsule}

      {:error, :not_found} ->
        # Cold-tier read; Postgres is source-of-truth.
        case Storage.Postgres.get(capsule_id) do
          {:ok, capsule} = result ->
            # Warm ETS entry for next read; ignore ETS write result.
            _ = Storage.ETS.put(ets, capsule_id, capsule)
            result

          {:error, :not_found} = result ->
            result
        end
    end
  end

  @doc """
  Store or update a Capsule by capsule_id. Postgres write
  authoritative; ETS update post-commit. Returns
  `{:ok, %CosmpRouter.MemoryCapsule{}}` on success, or
  `{:error, changeset}` on Postgres failure (ETS untouched on
  Postgres failure).

  Caller is responsible for composing this with audit emission per
  ADR-0033 §Decision 4e (`Audit.write_audit_event/3` Multi).

  ## Options

  - `:ets` — Storage.ETS instance atom; defaults
    `CosmpRouter.Storage.ETS` (production singleton).
  """
  def put(capsule_id, %Capsule{} = capsule, opts \\ []) when is_binary(capsule_id) do
    ets = Keyword.get(opts, :ets, Storage.ETS)

    case Storage.Postgres.put(capsule_id, capsule) do
      {:ok, _row} = result ->
        # Update ETS hot-tier post-commit; ETS write is best-effort,
        # source-of-truth is Postgres.
        _ = Storage.ETS.put(ets, capsule_id, capsule)
        result

      {:error, _changeset} = result ->
        # Postgres failure — ETS untouched; caller may retry.
        result
    end
  end

  @doc """
  Soft-delete a Capsule by capsule_id. Postgres soft-delete (sets
  deleted_at) authoritative; on success, ETS purge.

  ## Options

  - `:ets` — Storage.ETS instance atom; defaults
    `CosmpRouter.Storage.ETS` (production singleton).
  """
  def delete(capsule_id, opts \\ []) when is_binary(capsule_id) do
    ets = Keyword.get(opts, :ets, Storage.ETS)

    case Storage.Postgres.delete(capsule_id) do
      {:ok, _row} = result ->
        _ = Storage.ETS.delete(ets, capsule_id)
        result

      {:error, _} = result ->
        result
    end
  end

  @doc """
  Test-only: flush the ETS hot-tier. Postgres source-of-truth NEVER
  touched. Production code MUST NOT call this.

  ## Options

  - `:ets` — Storage.ETS instance atom; defaults
    `CosmpRouter.Storage.ETS` (production singleton).
  """
  def clear(opts \\ []) do
    ets = Keyword.get(opts, :ets, Storage.ETS)
    Storage.ETS.clear(ets)
  end
end
