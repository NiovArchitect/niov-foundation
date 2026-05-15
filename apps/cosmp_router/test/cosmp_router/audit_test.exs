defmodule CosmpRouter.AuditTest do
  @moduledoc """
  Pure-unit tests for `CosmpRouter.Audit` primitives per ADR-0033
  §Decision 4. Covers chain_key priority resolution, sha256_hex
  produces canonical hex, system_principals registry parity with
  TypeScript register, and basic canonical_record shape.

  Byte-equivalence tests with TypeScript-generated fixtures are in
  `apps/cosmp_router/test/cosmp_router/audit/canonical_record_test.exs`.

  DB-touching tests for `write_audit_event/1` standalone +
  `write_audit_event/3` composed (Ecto.Multi) modes land at sub-phase
  5b-ii Phase 5+ when the Repo is supervised; this Phase-3 test file
  is pure compute only.
  """

  use ExUnit.Case, async: true

  alias CosmpRouter.Audit

  describe "system_principals/0 + system_chain_key/0" do
    test "returns the 5-key SYSTEM_PRINCIPALS registry per ADR-0033 §4d" do
      principals = Audit.system_principals()

      assert is_map(principals)
      assert map_size(principals) == 5

      assert principals[:scheduler] == "__niov_system_scheduler__"
      assert principals[:boot_validator] == "__niov_system_boot_validator__"
      assert principals[:compliance_seeder] == "__niov_system_compliance_seeder__"
      assert principals[:feedback_loop] == "__niov_system_feedback_loop__"
      assert principals[:cosmp_router] == "__niov_system_cosmp_router__"
    end

    test "system_chain_key returns the legacy SYSTEM_CHAIN_KEY sentinel" do
      assert Audit.system_chain_key() == "__niov_system_chain__"
    end

    test "all sentinel strings follow the __niov_system_<subsystem>__ convention" do
      Audit.system_principals()
      |> Enum.each(fn {_key, sentinel} ->
        assert String.starts_with?(sentinel, "__niov_system_"),
               "principal sentinel #{sentinel} violates __niov_system_<subsystem>__ convention"

        assert String.ends_with?(sentinel, "__"),
               "principal sentinel #{sentinel} violates __niov_system_<subsystem>__ convention"
      end)
    end
  end

  describe "chain_key/1 priority resolution" do
    test "returns actor_entity_id when present" do
      input = %{
        actor_entity_id: "11111111-1111-1111-1111-111111111111",
        system_principal: "__niov_system_scheduler__"
      }

      assert Audit.chain_key(input) == "11111111-1111-1111-1111-111111111111"
    end

    test "falls through to system_principal when actor_entity_id is nil" do
      input = %{
        actor_entity_id: nil,
        system_principal: "__niov_system_scheduler__"
      }

      assert Audit.chain_key(input) == "__niov_system_scheduler__"
    end

    test "falls through to system_principal when actor_entity_id key absent" do
      input = %{system_principal: "__niov_system_compliance_seeder__"}

      assert Audit.chain_key(input) == "__niov_system_compliance_seeder__"
    end

    test "falls through to legacy SYSTEM_CHAIN_KEY when both absent" do
      input = %{actor_entity_id: nil, system_principal: nil}

      assert Audit.chain_key(input) == "__niov_system_chain__"
    end

    test "falls through to legacy SYSTEM_CHAIN_KEY when both keys absent" do
      input = %{}

      assert Audit.chain_key(input) == "__niov_system_chain__"
    end

    test "treats empty string as falsy for actor_entity_id" do
      input = %{actor_entity_id: "", system_principal: "__niov_system_scheduler__"}

      assert Audit.chain_key(input) == "__niov_system_scheduler__"
    end
  end

  describe "sha256_hex/1" do
    test "returns 64-character lowercase hex string" do
      hash = Audit.sha256_hex("test input")

      assert String.length(hash) == 64
      assert hash == String.downcase(hash)
      assert Regex.match?(~r/^[0-9a-f]{64}$/, hash)
    end

    test "produces deterministic output for identical input" do
      h1 = Audit.sha256_hex("same input")
      h2 = Audit.sha256_hex("same input")

      assert h1 == h2
    end

    test "produces different output for different input" do
      h1 = Audit.sha256_hex("input a")
      h2 = Audit.sha256_hex("input b")

      refute h1 == h2
    end

    test "matches known SHA-256 reference: empty string" do
      # Known SHA-256 of empty string from RFC + every reference
      assert Audit.sha256_hex("") ==
               "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    end

    test "matches known SHA-256 reference: 'abc'" do
      # Classic NIST test vector
      assert Audit.sha256_hex("abc") ==
               "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    end
  end

  describe "canonical_json/1 basic discipline" do
    test "primitives match Jason.encode!/1 byte output" do
      assert Audit.canonical_json(nil) == "null"
      assert Audit.canonical_json(true) == "true"
      assert Audit.canonical_json(false) == "false"
      assert Audit.canonical_json(42) == "42"
      assert Audit.canonical_json("hello") == "\"hello\""
    end

    test "empty containers match TS canonical form" do
      assert Audit.canonical_json(%{}) == "{}"
      assert Audit.canonical_json([]) == "[]"
    end

    test "object keys sorted alphabetically (TS canonicalJson sorted-key invariant)" do
      assert Audit.canonical_json(%{"z" => 1, "a" => 2, "m" => 3}) ==
               "{\"a\":2,\"m\":3,\"z\":1}"
    end

    test "atom keys normalized to strings before sorting" do
      assert Audit.canonical_json(%{z: 1, a: 2, m: 3}) ==
               "{\"a\":2,\"m\":3,\"z\":1}"
    end

    test "nested objects sorted recursively" do
      assert Audit.canonical_json(%{
               outer: %{z: "last", a: "first"},
               scalar: 99
             }) ==
               "{\"outer\":{\"a\":\"first\",\"z\":\"last\"},\"scalar\":99}"
    end

    test "arrays preserve insertion order (no sorting)" do
      assert Audit.canonical_json([3, 1, 2]) == "[3,1,2]"
      assert Audit.canonical_json(["b", "a", "c"]) == "[\"b\",\"a\",\"c\"]"
    end
  end

  describe "canonical_record/1 shape" do
    test "produces 14-field pipe-joined string (12 base + 2 lawful-basis per ADR-0036 Sub-decision 5)" do
      timestamp = ~U[2026-01-01 12:00:00.000Z]

      record =
        Audit.canonical_record(%{
          audit_id: "00000000-0000-0000-0000-000000000001",
          event_type: "TEST_EVENT",
          actor_entity_id: nil,
          target_entity_id: nil,
          target_capsule_id: nil,
          session_id: nil,
          outcome: "SUCCESS",
          denial_reason: nil,
          details: %{},
          ip_address: nil,
          timestamp: timestamp,
          previous_event_hash: nil,
          lawful_basis_id: nil,
          lawful_basis_chain_hash: nil
        })

      parts = String.split(record, "|")
      assert length(parts) == 14

      # Field-order spot check
      [audit_id, event_type | _] = parts
      assert audit_id == "00000000-0000-0000-0000-000000000001"
      assert event_type == "TEST_EVENT"
    end

    test "nil optional fields render as empty string (14-field shape with lawful-basis absent defaults)" do
      timestamp = ~U[2026-01-01 12:00:00.000Z]

      record =
        Audit.canonical_record(%{
          audit_id: "id",
          event_type: "T",
          actor_entity_id: nil,
          target_entity_id: nil,
          target_capsule_id: nil,
          session_id: nil,
          outcome: "SUCCESS",
          denial_reason: nil,
          details: %{},
          ip_address: nil,
          timestamp: timestamp,
          previous_event_hash: nil,
          lawful_basis_id: nil,
          lawful_basis_chain_hash: nil
        })

      # TS Date.toISOString() always emits millisecond precision
      # (.000Z for exact seconds); Elixir DateTime.truncate(:millisecond)
      # |> to_iso8601() mirrors this byte-for-byte per ADR-0033 §4a.
      # Sub-phase 4 [SUB-BOX-3-AUDIT-CHAIN-EXTENSION]: trailing "||" is
      # the empty-default pair for positions 13 + 14 (lawful_basis_id +
      # lawful_basis_chain_hash) per ADR-0036 Sub-decision 5.
      assert record == "id|T|||||SUCCESS||{}||2026-01-01T12:00:00.000Z|||"
    end

    test "populated lawful-basis fields render at positions 13 + 14" do
      timestamp = ~U[2026-01-01 12:00:00.000Z]

      record =
        Audit.canonical_record(%{
          audit_id: "id",
          event_type: "REGULATOR_ACCESS_GRANTED",
          actor_entity_id: nil,
          target_entity_id: nil,
          target_capsule_id: nil,
          session_id: nil,
          outcome: "SUCCESS",
          denial_reason: nil,
          details: %{},
          ip_address: nil,
          timestamp: timestamp,
          previous_event_hash: nil,
          lawful_basis_id: "11111111-1111-1111-1111-111111111111",
          lawful_basis_chain_hash:
            "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
        })

      parts = String.split(record, "|")
      assert length(parts) == 14
      assert Enum.at(parts, 12) == "11111111-1111-1111-1111-111111111111"

      assert Enum.at(parts, 13) ==
               "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
    end
  end
end
