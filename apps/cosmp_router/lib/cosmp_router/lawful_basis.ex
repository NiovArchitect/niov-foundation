defmodule CosmpRouter.LawfulBasis do
  @moduledoc """
  Lawful-basis canonical content + chain-hash primitive for the COSMP
  coordination layer per ADR-0036 Sub-decision 5 hybrid binding. Byte-
  equivalent Elixir mirror of the Foundation TypeScript register at
  `packages/database/src/queries/lawful-basis.ts` so that any
  cross-language flow that needs to compute or verify a LawfulBasis
  content commitment produces an identical SHA-256 chain hash.

  ## Core primitives

  - `canonical_lawful_basis_content/1` — 5-field pipe-joined content
    string mirroring `lawful-basis.ts:72-82` byte-for-byte.
  - `compute_lawful_basis_chain_hash/1` — SHA-256 hex digest of the
    canonical content via `CosmpRouter.Audit.sha256_hex/1` (the same
    SHA-256 primitive that produces audit-chain hashes per ADR-0019
    cryptographic-suite posture).

  ## Field set (load-bearing; do NOT reorder; do NOT extend without
  ## a paired TS register update)

  Per ADR-0036 Sub-decision 5 + sub-phase 3 [SUB-BOX-3-SERVICES]
  `lawful-basis.ts:44-50` LawfulBasisHashableFields:

  1. basis_type
  2. basis_reference
  3. jurisdiction_invoked
  4. valid_from (millisecond ISO 8601 UTC)
  5. valid_until (millisecond ISO 8601 UTC)

  Joined with "|" delimiter. The following fields are intentionally
  EXCLUDED from the canonical content (per ADR-0036 Sub-decision 5
  + sub-phase 3 Q1 LOCKED):

  - basis_id (UUID — not load-bearing for content commitment)
  - audit_id (FK avoided to prevent circularity)
  - chain_hash (avoids self-reference)
  - created_at / updated_at (DB-managed timestamps)

  ## DateTime millisecond precision (load-bearing)

  Per ADR-0033 §Decision 4a + D-5BII-EXEC-2: TypeScript `Date.toISOString()`
  always emits millisecond precision; Elixir `DateTime.to_iso8601/1`
  defaults to microsecond. Truncation to millisecond before ISO 8601
  emission preserves byte-equivalence.

  ## References

  - ADR-0036 Sub-decision 5 (hybrid lawful-basis cryptographic binding)
  - ADR-0033 §Decision 4a (DateTime millisecond canonical) + §Decision
    4d (sha256_hex)
  - ADR-0019 (cryptographic-suite posture; SHA-256 canonical)
  - `packages/database/src/queries/lawful-basis.ts` (TS register
    source-of-truth at `canonicalLawfulBasisContent` +
    `computeLawfulBasisChainHash`)
  - `apps/cosmp_router/lib/cosmp_router/audit.ex` (`sha256_hex/1`
    delegated for one-source-of-truth on the SHA-256 primitive)
  """

  alias CosmpRouter.Audit

  @doc """
  Canonical 5-field pipe-joined LawfulBasis content string.

  Mirrors TypeScript `canonicalLawfulBasisContent` at
  `packages/database/src/queries/lawful-basis.ts:72-82` byte-for-byte.

  Accepts a map with atom OR string keys (Elixir convention vs JSON
  portability); values are read via `Map.get/2` so either shape works.
  `basis_type` is converted to string via `to_string/1` so atoms +
  strings both serialize to their string literal form (e.g.,
  `:SUBPOENA` and `"SUBPOENA"` both yield `"SUBPOENA"`).
  """
  def canonical_lawful_basis_content(input) when is_map(input) do
    [
      input |> get_field(:basis_type) |> to_string(),
      input |> get_field(:basis_reference),
      input |> get_field(:jurisdiction_invoked),
      input |> get_field(:valid_from) |> iso8601_millisecond(),
      input |> get_field(:valid_until) |> iso8601_millisecond()
    ]
    |> Enum.join("|")
  end

  @doc """
  SHA-256 hex digest of the canonical LawfulBasis content.

  Mirrors TypeScript `computeLawfulBasisChainHash` at
  `packages/database/src/queries/lawful-basis.ts:94-101`. Returns a
  64-character lowercase hex string.

  Delegates to `CosmpRouter.Audit.sha256_hex/1` to preserve a single
  source of truth for the SHA-256 primitive at the Elixir register
  per ADR-0019.
  """
  def compute_lawful_basis_chain_hash(input) when is_map(input) do
    input
    |> canonical_lawful_basis_content()
    |> Audit.sha256_hex()
  end

  # WHAT: Read a map field accepting both atom and string keys.
  # INPUT: A map + the atom key.
  # OUTPUT: The value (or nil if absent).
  # WHY: JSON-decoded maps have string keys; Elixir-native maps use
  #      atoms. Byte-equivalence tests pass JSON-decoded fixtures;
  #      production callers may use atom-keyed Elixir maps.
  defp get_field(map, key) when is_atom(key) do
    Map.get(map, key) || Map.get(map, Atom.to_string(key))
  end

  # WHAT: Truncate a DateTime to millisecond precision and emit ISO 8601.
  # INPUT: A %DateTime{} or an already-formatted ISO 8601 binary.
  # OUTPUT: An ISO 8601 string with millisecond precision.
  # WHY: TS `Date.toISOString()` emits millisecond precision; Elixir
  #      defaults to microsecond. Mirrors `Audit.iso8601_millisecond`
  #      (privately defined; duplicated here to keep this module
  #      self-contained per Q6 LOCKED Option α structural-mirror).
  defp iso8601_millisecond(%DateTime{} = dt) do
    dt |> DateTime.truncate(:millisecond) |> DateTime.to_iso8601()
  end

  defp iso8601_millisecond(iso_string) when is_binary(iso_string) do
    iso_string
  end
end
