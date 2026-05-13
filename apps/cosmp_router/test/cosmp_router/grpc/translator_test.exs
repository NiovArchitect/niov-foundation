defmodule CosmpRouter.GRPC.TranslatorTest do
  @moduledoc """
  Sub-phase 5b-i `[BEAM-COSMP-INTEROP-GRPC]` translator tests.
  Verifies Protobuf ↔ Elixir struct round-trip preserves the
  patent-canonical 7-layer Capsule structure per US 12,517,919.
  """

  use ExUnit.Case, async: true

  alias CosmpRouter.Capsule
  alias CosmpRouter.GRPC.Translator
  alias CosmpRouter.Proto

  describe "to_capsule/1" do
    test "converts empty Protobuf Capsule to Elixir Capsule struct" do
      proto = %Proto.Capsule{payload: <<>>}
      capsule = Translator.to_capsule(proto)
      assert %Capsule{} = capsule
      assert capsule.payload == <<>>
    end

    test "preserves 7-layer field ordering" do
      proto = %Proto.Capsule{
        payload: "data",
        metadata: %{"k" => "v"},
        rules: [%Proto.Rule{name: "r1", value: "v1"}],
        relations: [%Proto.Relation{kind: "child", target_id: "cap-x"}],
        time: %Proto.TimeAttributes{created_at: 100, modified_at: 200, expires_at: 300},
        permissions: %Proto.Permissions{owner: "alice", granted_to: ["bob"]},
        audit: [%Proto.AuditEntry{event_type: "WRITE", actor: "test", timestamp: 50}]
      }

      capsule = Translator.to_capsule(proto)

      assert capsule.payload == "data"
      assert capsule.metadata == %{"k" => "v"}
      assert capsule.rules == [%{name: "r1", value: "v1"}]
      assert capsule.relations == [%{kind: "child", target_id: "cap-x"}]
      assert capsule.time == %{created_at: 100, modified_at: 200, expires_at: 300}
      assert capsule.permissions == %{owner: "alice", granted_to: ["bob"]}
      assert capsule.audit == [%{event_type: "WRITE", actor: "test", timestamp: 50}]
    end
  end

  describe "from_capsule/1" do
    test "converts Elixir Capsule struct back to Protobuf" do
      capsule = %Capsule{
        payload: "data",
        metadata: %{"k" => "v"},
        rules: [%{name: "r1", value: "v1"}],
        relations: [%{kind: "child", target_id: "cap-x"}],
        time: %{created_at: 100, modified_at: 200, expires_at: 300},
        permissions: %{owner: "alice", granted_to: ["bob"]},
        audit: [%{event_type: "WRITE", actor: "test", timestamp: 50}]
      }

      proto = Translator.from_capsule(capsule)

      assert %Proto.Capsule{} = proto
      assert proto.payload == "data"
      assert proto.metadata == %{"k" => "v"}
      assert [%Proto.Rule{name: "r1", value: "v1"}] = proto.rules
      assert [%Proto.Relation{kind: "child", target_id: "cap-x"}] = proto.relations
      assert %Proto.TimeAttributes{created_at: 100} = proto.time
      assert %Proto.Permissions{owner: "alice", granted_to: ["bob"]} = proto.permissions
      assert [%Proto.AuditEntry{event_type: "WRITE"}] = proto.audit
    end

    test "handles nil/empty Capsule gracefully" do
      capsule = %Capsule{payload: nil}
      proto = Translator.from_capsule(capsule)
      assert %Proto.Capsule{payload: <<>>} = proto
    end
  end

  describe "round-trip" do
    test "Protobuf → Capsule → Protobuf preserves Capsule integrity" do
      original = %Proto.Capsule{
        payload: "test",
        metadata: %{"a" => "b"},
        rules: [%Proto.Rule{name: "x", value: "y"}],
        relations: [],
        time: %Proto.TimeAttributes{created_at: 1, modified_at: 2, expires_at: 3},
        permissions: %Proto.Permissions{owner: "o", granted_to: []},
        audit: []
      }

      round_tripped = original |> Translator.to_capsule() |> Translator.from_capsule()

      assert round_tripped.payload == original.payload
      assert round_tripped.metadata == original.metadata
      assert length(round_tripped.rules) == length(original.rules)
      assert round_tripped.permissions.owner == original.permissions.owner
    end
  end

  describe "error/3" do
    test "constructs CosmpError envelope" do
      err = Translator.error(:CAPSULE_NOT_FOUND, "capsule X missing")
      assert %Proto.CosmpError{kind: :CAPSULE_NOT_FOUND, message: "capsule X missing"} = err
    end

    test "accepts optional details map" do
      err = Translator.error(:INVALID_CAPSULE, "bad field", %{"field" => "payload"})
      assert err.details == %{"field" => "payload"}
    end
  end
end
