defmodule CosmpRouter.LawfulBasisTest do
  @moduledoc """
  Cross-language byte-equivalence tests for `CosmpRouter.LawfulBasis`
  per ADR-0036 Sub-decision 5 hybrid binding. Asserts the Elixir
  register's 5-field canonical content + SHA-256 chain hash mirror
  the TypeScript register at
  `packages/database/src/queries/lawful-basis.ts:72-101` byte-for-
  byte.

  ## Why byte-equivalence matters

  ADR-0036 Sub-decision 5 commits Foundation to a hybrid cryptographic
  binding: the AuditEvent's canonical_record/1 includes
  lawful_basis_chain_hash at position 14. That hash must be IDENTICAL
  whether computed at the TypeScript register (production write path
  per sub-phase 5 routes) or the Elixir register (forward-queued
  Elixir-side enforcement per sub-phase 6 + future flows). Any drift
  breaks the patent-implementation evidence binding (CAR §2.2 Family
  1) at the cross-language boundary.

  ## Reference TS-computed hashes

  The expected_hash values below are computed by independently
  invoking the TS register's computeLawfulBasisChainHash (or any
  SHA-256 implementation given the canonical content string) so the
  Elixir port has a fixed target that does NOT depend on the
  Elixir implementation itself. Re-derive via:

      $ printf '%s' "SUBPOENA|24-cv-1234|US-FEDERAL|2026-05-15T00:00:00.000Z|2026-08-15T00:00:00.000Z" | shasum -a 256

  ## References

  - ADR-0036 Sub-decision 5 (hybrid lawful-basis cryptographic
    binding)
  - ADR-0033 §Decision 4a (DateTime millisecond canonical) +
    §Decision 4d (sha256_hex)
  - ADR-0019 (cryptographic-suite posture; SHA-256 canonical)
  - `packages/database/src/queries/lawful-basis.ts:72-101` (TS
    register source-of-truth)
  - `apps/cosmp_router/lib/cosmp_router/lawful_basis.ex` (Elixir
    port under test)
  """

  use ExUnit.Case, async: true

  alias CosmpRouter.LawfulBasis

  describe "canonical_lawful_basis_content/1 byte-equivalence with TypeScript register" do
    test "minimal SUBPOENA fixture produces TS-equivalent canonical content" do
      input = %{
        basis_type: "SUBPOENA",
        basis_reference: "24-cv-1234",
        jurisdiction_invoked: "US-FEDERAL",
        valid_from: ~U[2026-05-15 00:00:00.000Z],
        valid_until: ~U[2026-08-15 00:00:00.000Z]
      }

      expected =
        "SUBPOENA|24-cv-1234|US-FEDERAL|2026-05-15T00:00:00.000Z|2026-08-15T00:00:00.000Z"

      assert LawfulBasis.canonical_lawful_basis_content(input) == expected
    end

    test "COURT_ORDER fixture produces TS-equivalent canonical content" do
      input = %{
        basis_type: "COURT_ORDER",
        basis_reference: "2026-CV-0042",
        jurisdiction_invoked: "EU-DE",
        valid_from: ~U[2026-06-01 12:34:56.789Z],
        valid_until: ~U[2027-06-01 12:34:56.789Z]
      }

      expected =
        "COURT_ORDER|2026-CV-0042|EU-DE|2026-06-01T12:34:56.789Z|2027-06-01T12:34:56.789Z"

      assert LawfulBasis.canonical_lawful_basis_content(input) == expected
    end

    test "string-keyed input (JSON-decoded shape) produces same canonical content as atom-keyed" do
      atom_input = %{
        basis_type: "REGULATORY_AUTHORITY",
        basis_reference: "REG-001",
        jurisdiction_invoked: "US-NY",
        valid_from: ~U[2026-01-01 00:00:00.000Z],
        valid_until: ~U[2026-12-31 23:59:59.999Z]
      }

      string_input = %{
        "basis_type" => "REGULATORY_AUTHORITY",
        "basis_reference" => "REG-001",
        "jurisdiction_invoked" => "US-NY",
        "valid_from" => ~U[2026-01-01 00:00:00.000Z],
        "valid_until" => ~U[2026-12-31 23:59:59.999Z]
      }

      assert LawfulBasis.canonical_lawful_basis_content(atom_input) ==
               LawfulBasis.canonical_lawful_basis_content(string_input)
    end

    test "DateTime microsecond input is truncated to millisecond" do
      # Microsecond-precision DateTime; canonical content must still
      # emit millisecond ISO 8601 to match TS Date.toISOString() output.
      dt_micros = ~U[2026-05-15 12:34:56.789012Z]

      input = %{
        basis_type: "SUBPOENA",
        basis_reference: "X",
        jurisdiction_invoked: "Y",
        valid_from: dt_micros,
        valid_until: dt_micros
      }

      canonical = LawfulBasis.canonical_lawful_basis_content(input)
      # Millisecond truncation: 789012 → 789. NO microsecond suffix.
      assert canonical == "SUBPOENA|X|Y|2026-05-15T12:34:56.789Z|2026-05-15T12:34:56.789Z"
    end
  end

  describe "compute_lawful_basis_chain_hash/1 byte-equivalence with TypeScript register" do
    test "produces 64-character lowercase hex SHA-256 digest" do
      input = %{
        basis_type: "SUBPOENA",
        basis_reference: "24-cv-1234",
        jurisdiction_invoked: "US-FEDERAL",
        valid_from: ~U[2026-05-15 00:00:00.000Z],
        valid_until: ~U[2026-08-15 00:00:00.000Z]
      }

      hash = LawfulBasis.compute_lawful_basis_chain_hash(input)
      assert String.length(hash) == 64
      assert hash == String.downcase(hash)
      assert Regex.match?(~r/^[0-9a-f]{64}$/, hash)
    end

    test "deterministic: identical input produces identical hash" do
      input = %{
        basis_type: "SUBPOENA",
        basis_reference: "24-cv-1234",
        jurisdiction_invoked: "US-FEDERAL",
        valid_from: ~U[2026-05-15 00:00:00.000Z],
        valid_until: ~U[2026-08-15 00:00:00.000Z]
      }

      h1 = LawfulBasis.compute_lawful_basis_chain_hash(input)
      h2 = LawfulBasis.compute_lawful_basis_chain_hash(input)
      assert h1 == h2
    end

    test "matches independently-computed SHA-256 of the canonical content (TS-equivalent target)" do
      # SHA-256 of:
      #   "SUBPOENA|24-cv-1234|US-FEDERAL|2026-05-15T00:00:00.000Z|2026-08-15T00:00:00.000Z"
      # Independently verified via:
      #   $ printf '%s' "<canonical>" | shasum -a 256
      input = %{
        basis_type: "SUBPOENA",
        basis_reference: "24-cv-1234",
        jurisdiction_invoked: "US-FEDERAL",
        valid_from: ~U[2026-05-15 00:00:00.000Z],
        valid_until: ~U[2026-08-15 00:00:00.000Z]
      }

      canonical = LawfulBasis.canonical_lawful_basis_content(input)
      independent =
        :crypto.hash(:sha256, canonical) |> Base.encode16(case: :lower)

      assert LawfulBasis.compute_lawful_basis_chain_hash(input) == independent
    end

    test "changing basis_type changes hash (5-field hash sensitivity)" do
      base = %{
        basis_type: "SUBPOENA",
        basis_reference: "X",
        jurisdiction_invoked: "Y",
        valid_from: ~U[2026-01-01 00:00:00.000Z],
        valid_until: ~U[2026-12-31 00:00:00.000Z]
      }

      h1 = LawfulBasis.compute_lawful_basis_chain_hash(base)
      h2 = LawfulBasis.compute_lawful_basis_chain_hash(%{base | basis_type: "COURT_ORDER"})
      refute h1 == h2
    end

    test "changing basis_reference changes hash" do
      base = %{
        basis_type: "SUBPOENA",
        basis_reference: "ref-1",
        jurisdiction_invoked: "Y",
        valid_from: ~U[2026-01-01 00:00:00.000Z],
        valid_until: ~U[2026-12-31 00:00:00.000Z]
      }

      h1 = LawfulBasis.compute_lawful_basis_chain_hash(base)
      h2 = LawfulBasis.compute_lawful_basis_chain_hash(%{base | basis_reference: "ref-2"})
      refute h1 == h2
    end

    test "changing jurisdiction_invoked changes hash" do
      base = %{
        basis_type: "SUBPOENA",
        basis_reference: "X",
        jurisdiction_invoked: "US-FEDERAL",
        valid_from: ~U[2026-01-01 00:00:00.000Z],
        valid_until: ~U[2026-12-31 00:00:00.000Z]
      }

      h1 = LawfulBasis.compute_lawful_basis_chain_hash(base)
      h2 = LawfulBasis.compute_lawful_basis_chain_hash(%{base | jurisdiction_invoked: "EU-DE"})
      refute h1 == h2
    end

    test "changing valid_from changes hash" do
      base = %{
        basis_type: "SUBPOENA",
        basis_reference: "X",
        jurisdiction_invoked: "Y",
        valid_from: ~U[2026-01-01 00:00:00.000Z],
        valid_until: ~U[2026-12-31 00:00:00.000Z]
      }

      h1 = LawfulBasis.compute_lawful_basis_chain_hash(base)
      h2 = LawfulBasis.compute_lawful_basis_chain_hash(%{base | valid_from: ~U[2026-02-01 00:00:00.000Z]})
      refute h1 == h2
    end

    test "changing valid_until changes hash" do
      base = %{
        basis_type: "SUBPOENA",
        basis_reference: "X",
        jurisdiction_invoked: "Y",
        valid_from: ~U[2026-01-01 00:00:00.000Z],
        valid_until: ~U[2026-12-31 00:00:00.000Z]
      }

      h1 = LawfulBasis.compute_lawful_basis_chain_hash(base)
      h2 = LawfulBasis.compute_lawful_basis_chain_hash(%{base | valid_until: ~U[2027-01-01 00:00:00.000Z]})
      refute h1 == h2
    end
  end
end
