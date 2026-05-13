defmodule CosmpRouter.Storage.ETSTest do
  @moduledoc """
  Sub-phase 5b-i `[BEAM-COSMP-INTEROP-GRPC]` ETS storage tests
  per ADR-0031 Q-T (sub-phase 5a authorization).

  Verifies:
  - CRUD: put/get/delete/list/clear
  - Concurrency: ETS read-concurrency works under parallel access
  """

  use ExUnit.Case, async: false

  alias CosmpRouter.Capsule
  alias CosmpRouter.Storage.ETS, as: Storage

  setup do
    Storage.clear()
    :ok
  end

  describe "put/2 + get/1" do
    test "stores and retrieves a capsule" do
      capsule = %Capsule{payload: "p1", permissions: %{owner: "alice"}}
      assert :ok = Storage.put("cap1", capsule)
      assert {:ok, %Capsule{payload: "p1"}} = Storage.get("cap1")
    end

    test "returns {:error, :not_found} for missing capsule_id" do
      assert {:error, :not_found} = Storage.get("nonexistent")
    end

    test "overwrites existing capsule" do
      Storage.put("cap2", %Capsule{payload: "v1"})
      Storage.put("cap2", %Capsule{payload: "v2"})
      assert {:ok, %Capsule{payload: "v2"}} = Storage.get("cap2")
    end
  end

  describe "delete/1" do
    test "removes a capsule" do
      Storage.put("cap3", %Capsule{payload: "data"})
      assert :ok = Storage.delete("cap3")
      assert {:error, :not_found} = Storage.get("cap3")
    end

    test "is idempotent (no error for missing capsule)" do
      assert :ok = Storage.delete("nonexistent")
    end
  end

  describe "list/0" do
    test "enumerates all stored capsule_ids" do
      Storage.put("cap-a", %Capsule{payload: "a"})
      Storage.put("cap-b", %Capsule{payload: "b"})
      ids = Storage.list()
      assert "cap-a" in ids
      assert "cap-b" in ids
    end

    test "returns empty list after clear" do
      Storage.put("cap-x", %Capsule{payload: "x"})
      Storage.clear()
      assert Storage.list() == []
    end
  end

  describe "concurrency (read-concurrency)" do
    test "supports parallel get under concurrent put" do
      Storage.put("parallel", %Capsule{payload: "shared"})

      tasks =
        for _ <- 1..50 do
          Task.async(fn -> Storage.get("parallel") end)
        end

      results = Task.await_many(tasks, 5_000)
      assert Enum.all?(results, &match?({:ok, %Capsule{payload: "shared"}}, &1))
    end
  end
end
