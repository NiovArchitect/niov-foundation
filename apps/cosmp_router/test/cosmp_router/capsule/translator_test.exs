defmodule CosmpRouter.Capsule.TranslatorTest do
  @moduledoc """
  Pack/unpack discipline tests for `CosmpRouter.Capsule.Translator` per
  ADR-0033 §Decision 3b. Verifies the patent-canonical 7-layer
  Capsule struct ↔ 30-field MemoryCapsule row projection holds
  invariants without DB round-trip.

  Pure transformation testing — no Repo, no I/O.
  """

  use ExUnit.Case, async: true

  alias CosmpRouter.{Capsule, MemoryCapsule}
  alias CosmpRouter.Capsule.Translator

  describe "pack/1" do
    test "minimal Capsule packs into a MemoryCapsule attribute map" do
      capsule = %Capsule{
        payload: nil,
        metadata: nil,
        rules: nil,
        relations: nil,
        time: nil,
        permissions: nil,
        audit: nil
      }

      packed = Translator.pack(capsule)

      assert is_map(packed)
      assert packed[:storage_tier] == "WARM"
      assert packed[:version] == 1
      assert packed[:tokens] == 0
      assert packed[:tokens_tokenizer] == "anthropic"
      assert packed[:relevance_score] == 1.0
      assert packed[:decay_rate] == 0.01
      assert packed[:topic_tags] == []
      assert packed[:connected_capsule_ids] == []
      assert packed[:connected_entity_ids] == []
      assert packed[:deleted_at] == nil
    end

    test "metadata fields project into Payload + Metadata layer columns" do
      capsule = %Capsule{
        payload: nil,
        metadata: %{
          payload_summary: "test summary",
          payload_size_tokens: 42,
          tokens: 50,
          tokens_tokenizer: "anthropic",
          content_hash: "sha256:abc123",
          storage_location: "supabase://bucket/key",
          storage_tier: "HOT",
          capsule_type: "DOMAIN_KNOWLEDGE",
          topic_tags: ["t1", "t2"],
          version: 3
        },
        rules: [],
        relations: [],
        time: %{},
        permissions: %{},
        audit: []
      }

      packed = Translator.pack(capsule)

      assert packed[:payload_summary] == "test summary"
      assert packed[:payload_size_tokens] == 42
      assert packed[:tokens] == 50
      assert packed[:content_hash] == "sha256:abc123"
      assert packed[:storage_location] == "supabase://bucket/key"
      assert packed[:storage_tier] == "HOT"
      assert packed[:capsule_type] == "DOMAIN_KNOWLEDGE"
      assert packed[:topic_tags] == ["t1", "t2"]
      assert packed[:version] == 3
    end

    test "rules list projects into Rules layer scalar columns" do
      capsule = %Capsule{
        payload: nil,
        metadata: nil,
        rules: [
          %{name: "clearance_required", value: 5},
          %{name: "ai_access_blocked", value: true},
          %{name: "decay_type", value: "EXPONENTIAL"}
        ],
        relations: [],
        time: %{},
        permissions: %{},
        audit: []
      }

      packed = Translator.pack(capsule)

      assert packed[:clearance_required] == 5
      assert packed[:ai_access_blocked] == true
      assert packed[:decay_type] == "EXPONENTIAL"
    end

    test "relations list projects into connected_*_ids string arrays by kind" do
      capsule = %Capsule{
        payload: nil,
        metadata: nil,
        rules: [],
        relations: [
          %{kind: "capsule", target_id: "c-1"},
          %{kind: "capsule", target_id: "c-2"},
          %{kind: "entity", target_id: "e-1"}
        ],
        time: %{},
        permissions: %{},
        audit: []
      }

      packed = Translator.pack(capsule)

      assert packed[:connected_capsule_ids] == ["c-1", "c-2"]
      assert packed[:connected_entity_ids] == ["e-1"]
    end

    test "permissions map projects into wallet_id + entity_id columns" do
      capsule = %Capsule{
        payload: nil,
        metadata: nil,
        rules: [],
        relations: [],
        time: %{},
        permissions: %{
          wallet_id: "11111111-1111-1111-1111-111111111111",
          entity_id: "22222222-2222-2222-2222-222222222222"
        },
        audit: []
      }

      packed = Translator.pack(capsule)

      assert packed[:wallet_id] == "11111111-1111-1111-1111-111111111111"
      assert packed[:entity_id] == "22222222-2222-2222-2222-222222222222"
    end
  end

  describe "unpack/1" do
    test "MemoryCapsule unpacks into a 7-layer Capsule struct" do
      row = %MemoryCapsule{
        capsule_id: "33333333-3333-3333-3333-333333333333",
        wallet_id: "11111111-1111-1111-1111-111111111111",
        entity_id: "22222222-2222-2222-2222-222222222222",
        version: 2,
        capsule_type: "PREFERENCE",
        topic_tags: ["food", "spice"],
        relevance_score: 0.95,
        decay_type: "LINEAR",
        decay_rate: 0.05,
        feedback_loop_score: 0.3,
        payload_summary: "spicy palate",
        payload_size_tokens: 12,
        tokens: 12,
        tokens_tokenizer: "anthropic",
        commitment_date: nil,
        storage_location: "supabase://bucket/key",
        storage_tier: "HOT",
        clearance_required: 0,
        access_count: 5,
        content_hash: "sha256:def456",
        ai_access_blocked: false,
        requires_validation: false,
        connected_capsule_ids: ["c-9"],
        connected_entity_ids: ["e-9"],
        monetization_enabled: true,
        monetization_category: "preference",
        created_by: "22222222-2222-2222-2222-222222222222",
        created_session_id: "44444444-4444-4444-4444-444444444444",
        write_reason: "test write",
        updated_by: nil,
        updated_session_id: nil,
        previous_version: nil,
        created_at: ~U[2026-01-01 12:00:00Z],
        last_accessed_at: nil,
        last_updated_at: ~U[2026-01-01 12:00:00Z],
        expires_at: nil,
        deleted_at: nil
      }

      capsule = Translator.unpack(row)

      assert %Capsule{} = capsule
      # Layer 1 (Payload)
      assert capsule.payload.summary == "spicy palate"
      assert capsule.payload.size_tokens == 12
      assert capsule.payload.storage_location == "supabase://bucket/key"
      # Layer 2 (Metadata)
      assert capsule.metadata.capsule_type == "PREFERENCE"
      assert capsule.metadata.topic_tags == ["food", "spice"]
      assert capsule.metadata.version == 2
      # Layer 3 (Rules) — projected back from scalar columns
      assert Enum.any?(capsule.rules, &(&1.name == "clearance_required" and &1.value == 0))
      assert Enum.any?(capsule.rules, &(&1.name == "decay_type" and &1.value == "LINEAR"))
      # Layer 4 (Relations)
      assert Enum.any?(capsule.relations, &(&1.kind == "capsule" and &1.target_id == "c-9"))
      assert Enum.any?(capsule.relations, &(&1.kind == "entity" and &1.target_id == "e-9"))
      # Layer 5 (Time)
      assert capsule.time.created_at == ~U[2026-01-01 12:00:00Z]
      # Layer 6 (Permissions)
      assert capsule.permissions.wallet_id == "11111111-1111-1111-1111-111111111111"
      assert capsule.permissions.entity_id == "22222222-2222-2222-2222-222222222222"
      assert capsule.permissions.owner == "22222222-2222-2222-2222-222222222222"
      # Layer 7 (Audit) — empty per ADR-0033 §3b (caller queries audit_events separately)
      assert capsule.audit == []
    end
  end

  describe "pack/1 → unpack/1 round-trip" do
    test "preserves core layer data through pack-then-unpack" do
      original = %Capsule{
        payload: nil,
        metadata: %{
          capsule_type: "FOUNDATIONAL",
          topic_tags: ["a", "b"],
          payload_summary: "round trip",
          payload_size_tokens: 10,
          content_hash: "sha256:roundtrip"
        },
        rules: [
          %{name: "clearance_required", value: 3},
          %{name: "ai_access_blocked", value: false}
        ],
        relations: [
          %{kind: "capsule", target_id: "c-r"},
          %{kind: "entity", target_id: "e-r"}
        ],
        time: %{
          created_at: ~U[2026-05-01 10:00:00Z],
          last_updated_at: ~U[2026-05-01 10:00:00Z]
        },
        permissions: %{
          wallet_id: "00000000-0000-0000-0000-000000000001",
          entity_id: "00000000-0000-0000-0000-000000000002"
        },
        audit: []
      }

      packed = Translator.pack(original)
      row = struct(MemoryCapsule, Map.put(packed, :capsule_id, "00000000-0000-0000-0000-000000000099"))
      restored = Translator.unpack(row)

      assert restored.metadata.capsule_type == "FOUNDATIONAL"
      assert restored.metadata.topic_tags == ["a", "b"]
      assert restored.payload.summary == "round trip"
      assert restored.payload.size_tokens == 10

      capsule_relation = Enum.find(restored.relations, &(&1.kind == "capsule"))
      assert capsule_relation.target_id == "c-r"

      entity_relation = Enum.find(restored.relations, &(&1.kind == "entity"))
      assert entity_relation.target_id == "e-r"

      clearance_rule = Enum.find(restored.rules, &(&1.name == "clearance_required"))
      assert clearance_rule.value == 3
    end
  end
end
