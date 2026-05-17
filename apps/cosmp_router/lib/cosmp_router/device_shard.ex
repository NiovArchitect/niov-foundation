defmodule CosmpRouter.DeviceShard do
  @moduledoc """
  Pure DEVICE cold-shard assignment substrate.

  Implements Jump Consistent Hash for deterministic DEVICE shard routing
  per ADR-0040. This module is intentionally stateless:

  - no GenServer
  - no ETS
  - no supervised child
  - no DMWWorker spawn
  - no hot per-device process

  DEVICE dispatch integration is forward-substrate to D.3.
  """

  import Bitwise

  @default_shard_count 256
  @min_shard_count 128
  @max_shard_count 1024
  @uint64_mod 1 <<< 64
  @jump_hash_constant 2_862_933_555_777_941_757

  @type entity_id :: binary()
  @type shard_count :: pos_integer()
  @type shard_id :: non_neg_integer()

  @doc """
  Returns the configured DEVICE shard count.

  Defaults to 256. Valid range is 128..1024 per ADR-0040.
  """
  @spec configured_shard_count() :: shard_count()
  def configured_shard_count do
    :cosmp_router
    |> Application.get_env(__MODULE__, [])
    |> Keyword.get(:shard_count, @default_shard_count)
    |> validate_shard_count!()
  end

  @doc """
  Returns true when the shard count is within the ADR-0040 range.
  """
  @spec valid_shard_count?(term()) :: boolean()
  def valid_shard_count?(count) when is_integer(count) do
    count >= @min_shard_count and count <= @max_shard_count
  end

  def valid_shard_count?(_count), do: false

  @doc """
  Assigns an entity id to a DEVICE shard using the configured shard count.
  """
  @spec assign_shard(entity_id()) :: shard_id()
  def assign_shard(entity_id) do
    assign_shard(entity_id, configured_shard_count())
  end

  @doc """
  Assigns an entity id to a DEVICE shard using Jump Consistent Hash.

  The returned shard id is always in `0..(shard_count - 1)`.
  """
  @spec assign_shard(entity_id(), shard_count()) :: shard_id()
  def assign_shard(entity_id, shard_count)
      when is_binary(entity_id) and byte_size(entity_id) > 0 do
    shard_count = validate_shard_count!(shard_count)

    entity_id
    |> key64()
    |> jump_consistent_hash(shard_count)
  end

  def assign_shard(entity_id, _shard_count) do
    raise ArgumentError,
          "entity_id must be a non-empty binary, got: #{inspect(entity_id)}"
  end

  @doc """
  Validates and returns the shard count.

  Raises `ArgumentError` when the shard count is outside ADR-0040 bounds.
  """
  @spec validate_shard_count!(term()) :: shard_count()
  def validate_shard_count!(count) when is_integer(count) do
    if valid_shard_count?(count) do
      count
    else
      raise ArgumentError,
            "DEVICE shard_count must be in #{@min_shard_count}..#{@max_shard_count}, got: #{inspect(count)}"
    end
  end

  def validate_shard_count!(count) do
    raise ArgumentError,
          "DEVICE shard_count must be an integer in #{@min_shard_count}..#{@max_shard_count}, got: #{inspect(count)}"
  end

  defp key64(entity_id) do
    entity_id
    |> then(&:crypto.hash(:sha256, &1))
    |> binary_part(0, 8)
    |> :binary.decode_unsigned(:big)
  end

  defp jump_consistent_hash(key, num_buckets) do
    do_jump_consistent_hash(key, num_buckets, -1, 0)
  end

  defp do_jump_consistent_hash(_key, num_buckets, bucket, jump) when jump >= num_buckets do
    bucket
  end

  defp do_jump_consistent_hash(key, num_buckets, _bucket, jump) do
    bucket = jump
    key = rem(key * @jump_hash_constant + 1, @uint64_mod)
    jump = div((bucket + 1) * (1 <<< 31), (key >>> 33) + 1)

    do_jump_consistent_hash(key, num_buckets, bucket, jump)
  end
end
