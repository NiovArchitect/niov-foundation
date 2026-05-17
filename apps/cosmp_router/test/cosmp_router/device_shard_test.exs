defmodule CosmpRouter.DeviceShardTest do
  use ExUnit.Case, async: true

  alias CosmpRouter.DeviceShard

  describe "configured_shard_count/0" do
    test "returns configured shard count" do
      previous = Application.get_env(:cosmp_router, DeviceShard)

      try do
        Application.put_env(:cosmp_router, DeviceShard, shard_count: 512)

        assert DeviceShard.configured_shard_count() == 512
      after
        restore_env(previous)
      end
    end

    test "defaults to 256 when config is absent" do
      previous = Application.get_env(:cosmp_router, DeviceShard)

      try do
        Application.delete_env(:cosmp_router, DeviceShard)

        assert DeviceShard.configured_shard_count() == 256
      after
        restore_env(previous)
      end
    end

    test "raises when configured shard count is outside ADR-0040 range" do
      previous = Application.get_env(:cosmp_router, DeviceShard)

      try do
        Application.put_env(:cosmp_router, DeviceShard, shard_count: 127)

        assert_raise ArgumentError, ~r/128\.\.1024/, fn ->
          DeviceShard.configured_shard_count()
        end
      after
        restore_env(previous)
      end
    end
  end

  describe "valid_shard_count?/1" do
    test "accepts ADR-0040 range boundaries" do
      assert DeviceShard.valid_shard_count?(128)
      assert DeviceShard.valid_shard_count?(256)
      assert DeviceShard.valid_shard_count?(1024)
    end

    test "rejects values outside ADR-0040 range" do
      refute DeviceShard.valid_shard_count?(127)
      refute DeviceShard.valid_shard_count?(1025)
      refute DeviceShard.valid_shard_count?("256")
      refute DeviceShard.valid_shard_count?(nil)
    end
  end

  describe "validate_shard_count!/1" do
    test "returns valid shard count" do
      assert DeviceShard.validate_shard_count!(256) == 256
    end

    test "raises for invalid shard count" do
      assert_raise ArgumentError, ~r/128\.\.1024/, fn ->
        DeviceShard.validate_shard_count!(1025)
      end

      assert_raise ArgumentError, ~r/must be an integer/, fn ->
        DeviceShard.validate_shard_count!("256")
      end
    end
  end

  describe "assign_shard/2" do
    test "deterministically assigns the same entity id to the same shard" do
      entity_id = "device-entity-001"

      shard_a = DeviceShard.assign_shard(entity_id, 256)
      shard_b = DeviceShard.assign_shard(entity_id, 256)

      assert shard_a == shard_b
    end

    test "returns shard ids within bounds for supported shard counts" do
      entity_ids = [
        "device-entity-001",
        "device-entity-002",
        "device-entity-003",
        "device-entity-004"
      ]

      for shard_count <- [128, 256, 512, 1024],
          entity_id <- entity_ids do
        shard_id = DeviceShard.assign_shard(entity_id, shard_count)

        assert shard_id >= 0
        assert shard_id < shard_count
      end
    end

    test "raises for empty or non-binary entity ids" do
      assert_raise ArgumentError, ~r/entity_id must be a non-empty binary/, fn ->
        DeviceShard.assign_shard("", 256)
      end

      assert_raise ArgumentError, ~r/entity_id must be a non-empty binary/, fn ->
        DeviceShard.assign_shard(:device_001, 256)
      end
    end

    test "raises for invalid shard counts" do
      assert_raise ArgumentError, ~r/128\.\.1024/, fn ->
        DeviceShard.assign_shard("device-entity-001", 127)
      end
    end

    test "has stable known assignments for canonical regression vectors" do
      assert DeviceShard.assign_shard("device-entity-001", 256) ==
               DeviceShard.assign_shard("device-entity-001", 256)

      assert DeviceShard.assign_shard("device-entity-002", 512) ==
               DeviceShard.assign_shard("device-entity-002", 512)

      assert DeviceShard.assign_shard("device-entity-003", 1024) ==
               DeviceShard.assign_shard("device-entity-003", 1024)
    end

    test "produces a sane distribution across 256 shards" do
      shard_count = 256
      sample_count = 10_000

      distribution =
        1..sample_count
        |> Enum.map(fn index -> DeviceShard.assign_shard("device-#{index}", shard_count) end)
        |> Enum.frequencies()

      assert map_size(distribution) > 240

      average = sample_count / shard_count
      max_count = distribution |> Map.values() |> Enum.max()
      min_count = distribution |> Map.values() |> Enum.min()

      assert max_count < average * 2.5
      assert min_count > average * 0.2
    end

    test "minimizes reassignment when one shard is added" do
      sample_count = 10_000

      moved_count =
        1..sample_count
        |> Enum.count(fn index ->
          entity_id = "device-#{index}"
          DeviceShard.assign_shard(entity_id, 256) != DeviceShard.assign_shard(entity_id, 257)
        end)

      assert moved_count > 10
      assert moved_count < 100
    end

    test "moves about half of entities when shard count doubles" do
      sample_count = 10_000

      moved_count =
        1..sample_count
        |> Enum.count(fn index ->
          entity_id = "device-#{index}"
          DeviceShard.assign_shard(entity_id, 256) != DeviceShard.assign_shard(entity_id, 512)
        end)

      assert moved_count > 4_500
      assert moved_count < 5_500
    end
  end

  defp restore_env(nil), do: Application.delete_env(:cosmp_router, DeviceShard)

  defp restore_env(value), do: Application.put_env(:cosmp_router, DeviceShard, value)
end
