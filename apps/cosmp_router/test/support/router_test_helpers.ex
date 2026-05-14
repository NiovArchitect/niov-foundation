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

  alias CosmpRouter.{AuditEvent, IdempotencyKey, Proto, Repo, Router, Storage}

  import Ecto.Query, only: [from: 2]

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

  ## When to use this vs `setup_router_fk!/0`

  Use `setup_fk_parents!/0` (two distinct UUIDs) for **Storage.Postgres
  register tests** (e.g., `postgres_test.exs`) where the Capsule is
  constructed at the internal-domain register with separate
  `wallet_id` + `entity_id` in `permissions`.

  Use `setup_router_fk!/0` (single shared UUID) for **Router-via-Proto
  register tests** where the Proto.Capsule is the wire format and
  `Translator.pack/1` falls back `wallet_id = entity_id = owner`. See
  D-PHASE-2-PROTO-PERMS-LOSSY substrate-state observation.
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
  Router-via-Proto FK parent setup. Inserts `entities` + `wallets`
  rows where `wallet_id` and `entity_id` share a single UUID matching
  `Translator.pack/1` fallback semantics (`wallet_id = owner`;
  `entity_id = owner`).

  Returns the single shared UUID for use as `owner` in
  `%Proto.Permissions{owner: uuid}`.

  ## Why this exists (D-PHASE-2-PROTO-PERMS-LOSSY)

  `Proto.Permissions` wire format only has `owner` + `granted_to`
  fields (canonical per Google Protobuf "Use Different Messages For
  RPC APIs and Storage" best practice — separate wire and storage
  types with translation layer). Internal `CosmpRouter.Capsule`
  preserves the 3-wallet architecture per ADR-0001;
  `CosmpRouter.Capsule.Translator.pack/1` bridges the registers by
  falling back `wallet_id = entity_id = owner` when the internal
  permissions map only has `owner` (the Proto-derived form).

  For Router tests that route through Proto:
  `%Proto.WriteRequest{capsule: %Proto.Capsule{permissions:
  %Proto.Permissions{owner: shared_uuid}}}` → `Translator.to_capsule`
  → internal `%Capsule{permissions: %{owner: shared_uuid}}` →
  `Translator.pack` → `MemoryCapsule{wallet_id: shared_uuid,
  entity_id: shared_uuid}`. FK setup needs both `entities` and
  `wallets` rows keyed by the shared UUID.

  ## References

  - ADR-0001 (Three-wallet architecture; internal register)
  - ADR-0032 (BEAM gRPC Interop; wire format register)
  - ADR-0033 §Decision 5 (Storage facade) + §Translator pack semantics
  - Google Protobuf "Proto Best Practices" — separate API + storage
    types via translation layer
  """
  @spec setup_router_fk!() :: String.t()
  def setup_router_fk! do
    shared_uuid = Ecto.UUID.generate()

    Repo.query!("""
      INSERT INTO entities
        (entity_id, entity_type, display_name, public_key, created_at, updated_at)
      VALUES
        ('#{shared_uuid}'::uuid, 'PERSON', 'test entity', 'test_public_key', NOW(), NOW())
    """)

    Repo.query!("""
      INSERT INTO wallets
        (wallet_id, entity_id, wallet_type, niov_can_access_contents, created_at, updated_at)
      VALUES
        ('#{shared_uuid}'::uuid, '#{shared_uuid}'::uuid, 'PERSONAL', false, NOW(), NOW())
    """)

    shared_uuid
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
        created_at: DateTime.utc_now(),
        last_updated_at: DateTime.utc_now()
      },
      permissions: %{
        wallet_id: wallet_id,
        entity_id: entity_id
      },
      audit: []
    }
  end

  # ============================================================================
  # Proto-routed test helpers (sub-phase 6b consumers: router_test.exs +
  # grpc/server_test.exs + future Elixir/BEAM tests via Proto layer)
  # ============================================================================

  @doc """
  Build a valid `%CosmpRouter.Proto.Capsule{}` for Proto-routed tests.
  The `owner_uuid` is the single shared UUID from `setup_router_fk!/0`;
  `Translator.pack/1` will fall back `wallet_id = entity_id = owner_uuid`
  per D-PHASE-2-PROTO-PERMS-LOSSY substrate-state observation.

  Pattern carried from sub-phase 6b router_test.exs canonical;
  promoted to shared helper at Q-PHASE-3-DECISION-3 Option α.
  """
  @spec build_proto_capsule(String.t()) :: Proto.Capsule.t()
  def build_proto_capsule(owner_uuid) do
    %Proto.Capsule{
      payload: "test-payload-bytes",
      metadata: %{
        "capsule_type" => "FOUNDATIONAL",
        "content_hash" => "sha256:test",
        "storage_location" => "test://#{Ecto.UUID.generate()}",
        "payload_summary" => "test summary"
      },
      rules: [
        %Proto.Rule{name: "decay_type", value: "TIME_BASED"}
      ],
      permissions: %Proto.Permissions{owner: owner_uuid, granted_to: []},
      audit: []
    }
  end

  @doc """
  Count `audit_events` rows for a given `event_type` across all
  capsule_ids (canonical assertion for standalone-audit-emission tests
  where `target_capsule_id` may be nil).
  """
  @spec audit_count_for_event_type(String.t()) :: non_neg_integer()
  def audit_count_for_event_type(event_type) do
    Repo.aggregate(
      from(a in AuditEvent, where: a.event_type == ^event_type),
      :count,
      :audit_id
    )
  end

  @doc """
  Count `audit_events` rows for a `target_capsule_id` filtered by
  `event_type` (canonical assertion for composed-mode op tests + AUDIT
  query verification).
  """
  @spec audit_count_for_capsule(String.t(), String.t()) :: non_neg_integer()
  def audit_count_for_capsule(capsule_id, event_type) do
    Repo.aggregate(
      from(a in AuditEvent,
        where: a.target_capsule_id == ^capsule_id and a.event_type == ^event_type
      ),
      :count,
      :audit_id
    )
  end

  @doc """
  Return distinct `outcome` values for an `event_type` across all
  capsule_ids (canonical assertion for DENIED-path verification).
  """
  @spec audit_outcomes_for_event_type(String.t()) :: [String.t()]
  def audit_outcomes_for_event_type(event_type) do
    Repo.all(from(a in AuditEvent, where: a.event_type == ^event_type, select: a.outcome))
  end

  @doc """
  Return `outcome` values for a specific `target_capsule_id` filtered
  by `event_type` (canonical assertion for SUCCESS-path verification
  on composed-mode ops).
  """
  @spec audit_outcomes_for_capsule(String.t(), String.t()) :: [String.t()]
  def audit_outcomes_for_capsule(capsule_id, event_type) do
    Repo.all(
      from(a in AuditEvent,
        where: a.target_capsule_id == ^capsule_id and a.event_type == ^event_type,
        select: a.outcome
      )
    )
  end

  @doc """
  Verify an `idempotency_keys` row exists for a given key + scope
  (canonical assertion for ADR-0026 §5 Pattern 5 idempotent
  verification key recorded post-success).
  """
  @spec idempotency_key_exists?(String.t(), String.t()) :: boolean()
  def idempotency_key_exists?(key, scope) do
    Repo.exists?(
      from(i in IdempotencyKey,
        where: i.idempotency_key == ^key and i.scope == ^scope
      )
    )
  end
end
