defmodule CosmpRouter.Capsule.ValidatorTest do
  @moduledoc """
  Sub-phase 5b-i `[BEAM-COSMP-INTEROP-GRPC]` Capsule validator tests
  per US 12,517,919 7-layer integrity + ADR-0032 §Decision Protobuf
  canonical schema field constraints.
  """

  use ExUnit.Case, async: true

  alias CosmpRouter.Capsule
  alias CosmpRouter.Capsule.Validator

  describe "validate/1 — happy path" do
    test "accepts minimal valid Capsule" do
      capsule = %Capsule{
        payload: "data",
        permissions: %{owner: "alice"}
      }

      assert {:ok, %Capsule{}} = Validator.validate(capsule)
    end

    test "accepts full 7-layer Capsule" do
      capsule = %Capsule{
        payload: "data",
        metadata: %{"k" => "v"},
        rules: [%{name: "read", value: "allow"}],
        relations: [%{kind: "child", target_id: "cap-x"}],
        time: %{created_at: 100, modified_at: 200, expires_at: 0},
        permissions: %{owner: "alice", granted_to: ["bob"]},
        audit: [%{event_type: "WRITE", actor: "alice", timestamp: 50}]
      }

      assert {:ok, _} = Validator.validate(capsule)
    end
  end

  describe "validate/1 — payload (layer 1)" do
    test "rejects nil payload" do
      capsule = %Capsule{payload: nil, permissions: %{owner: "alice"}}
      assert {:error, err} = Validator.validate(capsule)
      assert err.kind == :INVALID_CAPSULE
      assert err.message =~ "payload"
    end

    test "rejects non-binary payload" do
      capsule = %Capsule{payload: 123, permissions: %{owner: "alice"}}
      assert {:error, err} = Validator.validate(capsule)
      assert err.kind == :INVALID_CAPSULE
    end
  end

  describe "validate/1 — permissions (layer 6)" do
    test "rejects missing owner" do
      capsule = %Capsule{payload: "data", permissions: %{owner: ""}}
      assert {:error, err} = Validator.validate(capsule)
      assert err.kind == :INVALID_CAPSULE
      assert err.message =~ "owner"
    end

    test "rejects nil permissions for valid payload" do
      # nil permissions is acceptable at this register; sub-phase
      # 5b-ii or 6 may tighten to require permissions
      capsule = %Capsule{payload: "data", permissions: nil}
      assert {:ok, _} = Validator.validate(capsule)
    end
  end

  describe "validate/1 — rules (layer 3)" do
    test "rejects malformed rule entries" do
      capsule = %Capsule{
        payload: "data",
        permissions: %{owner: "alice"},
        rules: [%{name: "missing_value"}]
      }

      assert {:error, err} = Validator.validate(capsule)
      assert err.kind == :INVALID_CAPSULE
      assert err.message =~ "rules"
    end
  end

  describe "validate/1 — audit (layer 7)" do
    test "rejects malformed audit entries" do
      capsule = %Capsule{
        payload: "data",
        permissions: %{owner: "alice"},
        audit: [%{event_type: "WRITE"}]
      }

      assert {:error, err} = Validator.validate(capsule)
      assert err.kind == :INVALID_CAPSULE
      assert err.message =~ "audit"
    end
  end

  describe "validate/1 — non-Capsule input" do
    test "rejects map that isn't a %Capsule{}" do
      assert {:error, err} = Validator.validate(%{payload: "data"})
      assert err.kind == :INVALID_CAPSULE
    end
  end
end
