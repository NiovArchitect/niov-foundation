defmodule CosmpRouter.RouterTestHelpers do
  @moduledoc """
  Per-test Router + Storage.ETS instantiation helpers per ADR-0034
  testability-refactor pattern (sub-phase 6a
  `[BEAM-COSMP-TESTABILITY-REFACTOR]`).

  Canonical Elixir community pattern (Sean Lewis "Elixir Concurrent
  Testing Architecture" + DockYard "Understanding Test Concurrency in
  Elixir" + KV.Registry Mix-OTP canonical + Ecto.Adapters.SQL.Sandbox
  `start_owner!`/`stop_owner`): each test spawns unique GenServer
  instances via `start_supervised!` + module-scoped names,
  eliminating cross-test-cycle state contamination
  (D-5BIII-COMMITB-1-REFINED Sandbox + supervised-GenServer fragility
  resolution at the architectural register).

  ## Usage

      defmodule MyTest do
        use ExUnit.Case, async: false

        import CosmpRouter.RouterTestHelpers

        setup do
          {router, ets} = start_router!()
          owner = start_sandbox_owner!()
          {:ok, router: router, ets: ets, sandbox_owner: owner}
        end

        test "my test", %{router: router} do
          assert {:ok, _} = GenServer.call(router, {:authenticate, req})
        end
      end

  ## FK parent + Capsule construction helpers

  `setup_fk_parents!/0` + `build_capsule/3` carry the canonical pattern
  from `Storage.PostgresTest` (raw-SQL INSERT into entities + wallets;
  Translator-packable Capsule construction). Consumed by sub-phase 6b
  integration tests (forthcoming).

  ## References

  - ADR-0034 (BEAM COSMP Testability Refactor Pattern)
  - Ecto.Adapters.SQL.Sandbox docs (start_owner!/stop_owner canonical)
  - https://sensaisean.medium.com/elixir-concurrent-testing-architecture-13c5e37374dc
  - https://dockyard.com/blog/2019/02/13/understanding-test-concurrency-in-elixir
  - Elixir Mix-OTP "ETS" tutorial (KV.Registry name-configurability canonical)
  """

  alias CosmpRouter.{Repo, Router, Storage}

  @doc """
  Start per-test Router + Storage.ETS instances with unique atom names.
  Returns `{router_name, ets_name}` tuple.

  ## Options

  - `:router_name` — explicit Router atom name (default: unique generated)
  - `:ets_name` — explicit ETS instance atom name (default: unique generated)

  Both instances are registered with `start_supervised!` so ExUnit
  guarantees teardown at test end (per Ecto.Adapters.SQL.Sandbox docs
  canonical pattern for supervised processes accessing the Repo).
  """
  @spec start_router!(keyword()) :: {atom(), atom()}
  def start_router!(opts \\ []) do
    unique = System.unique_integer([:positive])
    router_name = Keyword.get(opts, :router_name, :"router_test_#{unique}")
    ets_name = Keyword.get(opts, :ets_name, :"ets_test_#{unique}")

    _ets_pid = ExUnit.Callbacks.start_supervised!({Storage.ETS, name: ets_name})

    _router_pid =
      ExUnit.Callbacks.start_supervised!(
        {Router, name: router_name, storage_ets: ets_name}
      )

    {router_name, ets_name}
  end

  @doc """
  Start Sandbox owner per test (survives test process exit per Ecto
  canonical for supervised-GenServer scenarios). Returns owner pid;
  on_exit registered for cleanup.

  Uses `shared: true` since per-test instances are `async: false`
  (concurrency lost — per DockYard "Understanding Test Concurrency
  in Elixir" — but cross-test-cycle ownership fragility resolved).
  """
  @spec start_sandbox_owner!() :: pid()
  def start_sandbox_owner! do
    pid = Ecto.Adapters.SQL.Sandbox.start_owner!(Repo, shared: true)
    ExUnit.Callbacks.on_exit(fn -> Ecto.Adapters.SQL.Sandbox.stop_owner(pid) end)
    pid
  end

  @doc """
  FK parent setup: insert minimal entity + wallet rows via raw SQL.
  Returns `{entity_id, wallet_id}` UUID tuple.

  Pattern carried from `Storage.PostgresTest` canonical (sub-phase
  5b-ii); inline UUID literals because Postgrex's parameterized $1
  path expects 16-byte binary for UUID type but the literal-cast path
  lets Postgres handle it directly.
  """
  @spec setup_fk_parents!() :: {String.t(), String.t()}
  def setup_fk_parents! do
    entity_id = Ecto.UUID.generate()
    wallet_id = Ecto.UUID.generate()

    Repo.query!("""
      INSERT INTO entities
        (entity_id, entity_type, display_name, public_key, created_at, updated_at)
      VALUES
        ('#{entity_id}'::uuid, 'PERSON', 'test entity', 'test_public_key', NOW(), NOW())
    """)

    Repo.query!("""
      INSERT INTO wallets
        (wallet_id, entity_id, wallet_type, niov_can_access_contents, created_at, updated_at)
      VALUES
        ('#{wallet_id}'::uuid, '#{entity_id}'::uuid, 'PERSONAL', false, NOW(), NOW())
    """)

    {entity_id, wallet_id}
  end

  @doc """
  Build a valid `%CosmpRouter.Capsule{}` struct (Translator-packable)
  with the given FK parents.

  Pattern carried from `Storage.PostgresTest.build_capsule/3` canonical.
  """
  @spec build_capsule(String.t(), String.t(), String.t(), keyword()) ::
          CosmpRouter.Capsule.t()
  def build_capsule(_capsule_id, wallet_id, entity_id, opts \\ []) do
    %CosmpRouter.Capsule{
      payload: nil,
      metadata: %{
        capsule_type: opts[:capsule_type] || "FOUNDATIONAL",
        topic_tags: opts[:topic_tags] || ["test"],
        payload_summary: opts[:summary] || "test summary",
        payload_size_tokens: opts[:tokens] || 10,
        content_hash: opts[:content_hash] || "sha256:test",
        storage_location: opts[:storage_location] || "supabase://test/key",
        version: 1
      },
      rules: [
        %{name: "clearance_required", value: 0},
        %{name: "ai_access_blocked", value: false},
        %{name: "requires_validation", value: false},
        %{name: "decay_type", value: "TIME_BASED"},
        %{name: "decay_rate", value: 0.01}
      ],
      relations: [],
      time: %{
        created_at: DateTime.utc_now() |> DateTime.truncate(:second),
        last_updated_at: DateTime.utc_now() |> DateTime.truncate(:second)
      },
      permissions: %{
        wallet_id: wallet_id,
        entity_id: entity_id
      },
      audit: []
    }
  end
end
