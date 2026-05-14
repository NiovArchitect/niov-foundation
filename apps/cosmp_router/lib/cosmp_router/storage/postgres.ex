defmodule CosmpRouter.Storage.Postgres do
  @moduledoc """
  Postgres-backed durable Capsule storage per ADR-0033 §Decision 5
  (Storage facade). Source-of-truth for `memory_capsules` rows;
  ETS hot-tier (`CosmpRouter.Storage.ETS`) sits in front of this
  via `CosmpRouter.Storage` facade.

  ## API symmetric with Storage.ETS

  - `put(capsule_id, %CosmpRouter.Capsule{})` — pack via Translator,
    insert-or-update via Ecto changeset
  - `get(capsule_id)` — fetch row, unpack via Translator;
    soft-deleted rows return `{:error, :not_found}` per RULE 10
  - `delete(capsule_id)` — soft-delete via `deleted_at` timestamp
    (RULE 10 honor; Postgres BEFORE DELETE trigger on audit_events
    is independent of this table; row stays for forensic reconstruction)
  - `audit_chain_for_capsule(capsule_id)` — query audit_events ordered
    by timestamp; returns the chain of audit rows that participated
    in the capsule's lifecycle

  ## Composed-mode audit integration

  Storage.Postgres is the persistence-write surface; audit emissions
  for Capsule writes are produced by `CosmpRouter.Audit.write_audit_event/3`
  composed with the storage write inside an `Ecto.Multi` per ADR-0033
  §Decision 4e + RULE 4. The Router (sub-phase 5b-ii Phase 5) owns
  the Multi composition; Storage.Postgres operates inside the
  caller's transaction context.

  ## References

  - ADR-0033 §Decision 5 (Storage facade) + §Decision 3a (field map)
  - ADR-0025 (Schema-Push-Target Discipline; Prisma owns memory_capsules DDL)
  - ADR-0026 §5 Pattern 3 (state reconstructible from durable storage)
  - RULE 10 (NOTHING IS EVER DELETED; soft-delete only)
  """

  alias CosmpRouter.{Repo, MemoryCapsule, AuditEvent}
  alias CosmpRouter.Capsule.Translator
  import Ecto.Query, only: [from: 2]

  @doc """
  Store or update a Capsule by capsule_id. Returns `{:ok, %MemoryCapsule{}}`
  on success or `{:error, changeset}` on validation/insert failure.

  Translator.pack/1 produces a 30-field attribute map from the
  patent-canonical 7-layer Capsule struct; insert OR update path
  decided by `Repo.get/2` lookup on `capsule_id`.
  """
  def put(capsule_id, %CosmpRouter.Capsule{} = capsule) when is_binary(capsule_id) do
    # Drop nil-valued keys before changeset construction so Ecto
    # schema autogenerate fires for time fields (`created_at`,
    # `last_updated_at`) when `Translator.pack/1` returns nil (e.g.,
    # Proto-routed WRITE with `time: nil`). Explicit nil in a
    # changeset bypasses autogenerate per Ecto canonical; dropping
    # the key restores autogenerate-on-insert semantics.
    attrs =
      capsule
      |> Translator.pack()
      |> Map.put(:capsule_id, capsule_id)
      |> Enum.reject(fn {_k, v} -> is_nil(v) end)
      |> Map.new()

    case Repo.get(MemoryCapsule, capsule_id) do
      nil ->
        # New row — insert with all attrs including capsule_id
        %MemoryCapsule{}
        |> Ecto.Changeset.change(attrs)
        |> Repo.insert()

      existing ->
        # Existing row — update with packed attrs
        existing
        |> Ecto.Changeset.change(Map.delete(attrs, :capsule_id))
        |> Repo.update()
    end
  end

  @doc """
  Fetch a Capsule by capsule_id; returns `{:ok, %CosmpRouter.Capsule{}}`
  via Translator.unpack/1, or `{:error, :not_found}` if no row OR
  if soft-deleted (deleted_at is not nil per RULE 10).

  ## D-PHASE-1-UUID-CAST resolution (sub-phase 6b per ADR-0034)

  Non-UUID-format `capsule_id` (e.g., test input `"does-not-exist"`)
  is treated as `:not_found` at the Storage facade boundary —
  graceful degradation per ADR-0033 §Decision 5. Without the
  `Ecto.UUID.cast/1` guard, `Repo.get/2` raises
  `Ecto.Query.CastError` when the binary doesn't parse as a UUID.
  Storage substrate must be robust to input variety at the facade
  layer; consumers passing non-UUID format see `:not_found` rather
  than a runtime exception.
  """
  def get(capsule_id) when is_binary(capsule_id) do
    case Ecto.UUID.cast(capsule_id) do
      {:ok, uuid} -> get_by_uuid(uuid)
      :error -> {:error, :not_found}
    end
  end

  defp get_by_uuid(uuid) do
    case Repo.get(MemoryCapsule, uuid) do
      nil ->
        {:error, :not_found}

      %MemoryCapsule{deleted_at: deleted_at} when not is_nil(deleted_at) ->
        # Soft-deleted; treat as not found per RULE 10 (row stays for
        # forensic reconstruction; consumers see :not_found).
        {:error, :not_found}

      %MemoryCapsule{} = row ->
        {:ok, Translator.unpack(row)}
    end
  end

  @doc """
  Soft-delete a Capsule by capsule_id; sets `deleted_at` to current
  UTC time. Returns `{:ok, %MemoryCapsule{}}` on success or
  `{:error, :not_found}` if no row.

  Per RULE 10 (NOTHING IS EVER DELETED), this never issues a SQL
  DELETE — the row stays for forensic reconstruction. Subsequent
  `get/1` calls return `{:error, :not_found}`.
  """
  def delete(capsule_id) when is_binary(capsule_id) do
    case Repo.get(MemoryCapsule, capsule_id) do
      nil ->
        {:error, :not_found}

      %MemoryCapsule{} = row ->
        # Microsecond-precision DateTime per ADR-0033 §D-5BII-EXEC-2
        # cross-language canonical (D-PHASE-2-CROSS-LANG-PRECISION-DRIFT
        # resolution at sub-phase 6b). Schema field `deleted_at` is
        # `:utc_datetime_usec`; full microsecond avoids ArgumentError
        # on dump. Postgres TIMESTAMP(3) truncates to millisecond on
        # column write per Prisma DDL register.
        deleted_at = DateTime.utc_now()

        row
        |> Ecto.Changeset.change(deleted_at: deleted_at)
        |> Repo.update()
    end
  end

  @doc """
  Query audit_events ordered by timestamp where target_capsule_id
  matches the given capsule_id. Returns the ordered list of
  AuditEvent rows; empty list if no audit history.

  Composed with `CosmpRouter.Audit.verify_audit_chain/1` for
  per-capsule chain-integrity verification.
  """
  def audit_chain_for_capsule(capsule_id) when is_binary(capsule_id) do
    from(a in AuditEvent,
      where: a.target_capsule_id == ^capsule_id,
      order_by: [asc: a.timestamp]
    )
    |> Repo.all()
  end
end
