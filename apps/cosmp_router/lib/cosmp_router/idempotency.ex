defmodule CosmpRouter.Idempotency do
  @moduledoc """
  Idempotency layer per ADR-0033 §Decision 6. Postgres-backed
  `idempotency_keys` table; Ecto-owned per D-5BII-EXEC-5 hybrid
  Option β.

  ## Pattern 4 + Pattern 5 compound (ADR-0026 §5)

  - **Pattern 4 (event-sourced audit semantics)** — every operation
    emits an event; idempotency layer caches the operation outcome
    keyed by the caller-derived idempotency key
  - **Pattern 5 (idempotent verification keys)** — replays of the
    same `(idempotency_key, scope)` pair within the TTL window
    return the cached result WITHOUT re-executing side-effects;
    ensures retries are safe under at-least-once delivery

  ## API

  - `check/2` — lookup by `(idempotency_key, scope)`; returns
    `{:ok, cached_result}` on hit (within TTL), `:not_found` on miss
  - `record/3` — store `{idempotency_key, scope, result}` with TTL
    (default 24 hours; configurable per call)
  - `cleanup/0` — purge entries past their `expires_at`; safe to
    call from a periodic job (sub-phase 11+ telemetry-driven
    scheduling forthcoming; manual / test invocation here)

  ## Router integration (commit B forthcoming per Fork II split)

  Sub-phase 5b-iii commit B `[BEAM-COSMP-INTEROP-INTEGRATION]`
  wraps `WRITE` / `SHARE` / `REVOKE` op handlers with `check/2`
  pre-execution + `record/3` post-execution. On idempotency hit,
  Router returns the cached response WITHOUT re-running business
  mutation. On idempotency miss with conflicting request_hash,
  Router returns `IDEMPOTENCY_CONFLICT` per `cosmp.proto`
  `CosmpError.Kind.IDEMPOTENCY_CONFLICT`.

  ## TTL discipline

  Default TTL is 24 hours per ADR-0033 §Decision 6. Cache hit
  semantics: a request that arrives within the TTL window returns
  the cached result; a request that arrives AFTER the TTL window
  is treated as a new operation (cache miss → re-execute). The
  TTL is the bound on replay-safety guarantee.

  ## References

  - ADR-0033 §Decision 6 (Idempotency layer)
  - ADR-0026 §5 Pattern 4 + Pattern 5 compound
  - apps/cosmp_router/lib/cosmp_router/schemas/idempotency_key.ex
    (Ecto schema)
  - apps/cosmp_router/priv/repo/migrations/20260514040407_create_idempotency_keys.exs
  """

  alias CosmpRouter.{Repo, IdempotencyKey}
  import Ecto.Query, only: [from: 2]

  @default_ttl_hours 24

  @doc """
  Look up a cached result by `(idempotency_key, scope)`. Returns:
  - `{:ok, result}` when a non-expired cached entry exists
  - `:not_found` when no entry exists OR the entry has expired

  Expired entries are NOT returned (TTL boundary enforcement);
  caller should treat as cache miss + re-execute the operation.
  """
  def check(idempotency_key, scope)
      when is_binary(idempotency_key) and is_binary(scope) do
    now = DateTime.utc_now()

    query =
      from(e in IdempotencyKey,
        where: e.idempotency_key == ^idempotency_key,
        where: e.scope == ^scope,
        where: e.expires_at > ^now,
        select: e.result
      )

    case Repo.one(query) do
      nil -> :not_found
      result -> {:ok, result}
    end
  end

  @doc """
  Record a `(idempotency_key, scope, result)` entry with the given
  TTL window (default 24 hours). Returns `{:ok, %IdempotencyKey{}}`
  on success or `{:error, changeset}` on validation/insert failure.

  If an entry already exists for `(idempotency_key, scope)`, the
  insert FAILS (PK collision). Caller should `check/2` first if
  re-write semantics are desired.
  """
  def record(idempotency_key, scope, result, ttl_hours \\ @default_ttl_hours)
      when is_binary(idempotency_key) and is_binary(scope) and is_map(result) and
             is_integer(ttl_hours) and ttl_hours > 0 do
    now = DateTime.utc_now()
    expires_at = DateTime.add(now, ttl_hours * 3600, :second)

    %IdempotencyKey{}
    |> Ecto.Changeset.cast(
      %{
        idempotency_key: idempotency_key,
        scope: scope,
        result: result,
        inserted_at: now,
        expires_at: expires_at
      },
      [:idempotency_key, :scope, :result, :inserted_at, :expires_at]
    )
    |> Ecto.Changeset.unique_constraint(:idempotency_key,
      name: :idempotency_keys_pkey
    )
    |> Repo.insert()
  end

  @doc """
  Purge entries past their `expires_at`. Returns the count of
  deleted rows. Safe to call from a periodic background job (sub-
  phase 11+ telemetry-driven scheduling forthcoming).

  Note: idempotency_keys does NOT participate in the audit-chain;
  no BEFORE DELETE trigger applies. Direct DELETE is permitted
  per the table's design (cache, not source-of-truth).
  """
  def cleanup do
    now = DateTime.utc_now()

    {count, _} =
      from(e in IdempotencyKey, where: e.expires_at <= ^now)
      |> Repo.delete_all()

    count
  end
end
