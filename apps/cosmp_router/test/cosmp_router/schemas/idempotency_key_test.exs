defmodule CosmpRouter.IdempotencyKeyTest do
  @moduledoc """
  Schema introspection tests for `CosmpRouter.IdempotencyKey` per
  ADR-0033 §Decision 6. Verifies the Ecto schema mirrors the
  migration's column shape.

  Pure introspection — no Repo connection required at this register;
  DB-touching tests at idempotency_test.exs.
  """

  use ExUnit.Case, async: true

  alias CosmpRouter.IdempotencyKey

  @expected_fields [
    :idempotency_key,
    :scope,
    :result,
    :inserted_at,
    :expires_at
  ]

  test "schema source is `idempotency_keys` table" do
    assert IdempotencyKey.__schema__(:source) == "idempotency_keys"
  end

  test "primary key is :idempotency_key (string; caller-derived)" do
    assert IdempotencyKey.__schema__(:primary_key) == [:idempotency_key]
    assert IdempotencyKey.__schema__(:type, :idempotency_key) == :string
  end

  test "field set matches migration schema" do
    actual = IdempotencyKey.field_list() |> MapSet.new()
    expected = MapSet.new(@expected_fields)

    missing = MapSet.difference(expected, actual) |> MapSet.to_list()
    extra = MapSet.difference(actual, expected) |> MapSet.to_list()

    assert missing == [],
           "IdempotencyKey schema MISSING fields: #{inspect(missing)}"

    assert extra == [],
           "IdempotencyKey schema has UNEXPECTED fields: #{inspect(extra)}"
  end

  test "result column is :map (Postgres JSONB equivalent)" do
    assert IdempotencyKey.__schema__(:type, :result) == :map
  end

  test "scope column is :string (Postgres TEXT equivalent)" do
    assert IdempotencyKey.__schema__(:type, :scope) == :string
  end

  test "TTL boundary fields are :utc_datetime_usec" do
    assert IdempotencyKey.__schema__(:type, :inserted_at) == :utc_datetime_usec
    assert IdempotencyKey.__schema__(:type, :expires_at) == :utc_datetime_usec
  end
end
