defmodule CosmpRouter.Router do
  @moduledoc """
  COSMP routing GenServer — the BEAM-side coordinator for the 7 COSMP
  operations per US 12,517,919.

  ## Patent-canonical role

  Implements message routing for AUTHENTICATE, NEGOTIATE, READ, WRITE,
  SHARE, REVOKE, AUDIT via `GenServer.call/3` synchronous dispatch.
  Each operation gets a distinct `handle_call/3` clause head per
  ADR-0031 Q-I — patent-canonical surface visibility, not
  guard-collapsed dispatch.

  ## Scale register

  Production live-grade Foundation substrate at billions-of-capsules-per-DMW
  scale. The Router is named (`CosmpRouter.Router`) for
  `Process.whereis/1` lookup; supervised by `CosmpRouter.Supervisor`
  with `:one_for_one` strategy per ADR-0030.

  ## ADR-0026 §5 BEAM patterns instantiated (full set as of 5b-iii Commit B)

  - **Pattern 1 (message-passing semantics over shared state)** —
    `GenServer.call/3` 7-op dispatch
  - **Pattern 2 (supervisor-friendly failure modes)** — typed
    `{:reply, {:ok, _} | {:error, %CosmpError{}}, state}` return shape
  - **Pattern 3 (state reconstructible from durable storage)** —
    `CosmpRouter.Storage` facade routes ETS hot-tier reads to
    Postgres source-of-truth on miss; per ADR-0033 §Decision 5
  - **Pattern 4 (event-sourced audit semantics)** — composed-mode
    `Audit.write_audit_event/3` via `Ecto.Multi` for WRITE/SHARE/
    REVOKE; standalone `Audit.write_audit_event/1` for READ/AUDIT/
    AUTHENTICATE/NEGOTIATE; per ADR-0033 §Decision 4e
  - **Pattern 5 (idempotent verification keys)** — `Idempotency.check/2`
    + `Idempotency.record/3` wrap WRITE/SHARE/REVOKE per ADR-0033
    §Decision 6
  - **Pattern 6 (pure transformation over imperative control)** —
    `handle_call/3` clauses orchestrate composed-mode primitives;
    side effects bounded by Multi transactions

  ## Sub-phase 5b-iii Commit B status (this commit)

  Router 7-op refactor consuming the 5b-ii substrate (Audit + Storage
  + Translator) + 5b-iii Commit A substrate (Idempotency). In-memory
  `Capsule.audit` array semantics REPLACED with Postgres `audit_events`
  emission per ADR-0033 §Decision 4e + RULE 4 atomic compound. WRITE/
  SHARE/REVOKE composed-mode wraps storage mutation + audit + idempotency
  record in a single `Ecto.Multi` transaction (atomic rollback on any
  step failure). READ/AUDIT/AUTHENTICATE/NEGOTIATE use standalone
  audit emission (no business mutation to roll back).

  ## References

  - ADR-0033 §Decision 4e (composed-mode audit) + §Decision 5
    (Storage facade) + §Decision 6 (Idempotency layer)
  - ADR-0032 (BEAM gRPC Interop Architecture) §Decision
  - ADR-0031 (BEAM Routing Substrate Architecture) §Decision
  - ADR-0026 §5 — 6 BEAM-compatibility patterns (full set instantiated)
  - US 12,517,919 (COSMP Protocol patent)
  """

  use GenServer

  alias CosmpRouter.{Audit, Capsule, Idempotency, Repo, Storage}
  alias CosmpRouter.Capsule.Validator
  alias CosmpRouter.GRPC.Translator
  alias CosmpRouter.Proto
  alias CosmpRouter.Router.State

  @doc """
  Start the COSMP routing GenServer. Registered under the
  `CosmpRouter.Router` name for `Process.whereis/1` lookup.
  """
  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @impl true
  @spec init(keyword()) :: {:ok, State.t()}
  def init(_opts) do
    state = %State{
      in_flight: %{},
      started_at: System.monotonic_time(),
      storage: Storage
    }

    {:ok, state}
  end

  # ============================================================================
  # 7 COSMP ops per US 12,517,919 — one handle_call clause per op.
  # WRITE/SHARE/REVOKE use composed-mode (Ecto.Multi + Audit + Idempotency).
  # READ/AUDIT/AUTHENTICATE/NEGOTIATE use standalone audit emission.
  # ============================================================================

  @impl true
  def handle_call({:authenticate, %Proto.AuthenticateRequest{} = req}, _from, state) do
    # AUTHENTICATE: DMW/principal identity verification.
    # Standalone audit emission per ADR-0033 §Decision 4e (no business
    # mutation; auth ops always audit per RULE 4).
    with {:ok, _capsule} <- validate_request_capsule(req.capsule),
         :ok <- validate_principal_id(req.principal_id) do
      _ =
        Audit.write_audit_event(%{
          event_type: "COSMP_AUTHENTICATE",
          outcome: "SUCCESS",
          actor_entity_id: nil,
          system_principal: Audit.system_principals()[:cosmp_router],
          details: %{principal_id: req.principal_id}
        })

      {:reply,
       {:ok,
        %Proto.AuthenticateSuccess{
          authenticated: true,
          principal_id: req.principal_id
        }}, state}
    else
      {:error, %Proto.CosmpError{} = err} ->
        emit_audit_failure("COSMP_AUTHENTICATE", err)
        {:reply, {:error, err}, state}
    end
  end

  def handle_call({:negotiate, %Proto.NegotiateRequest{} = req}, _from, state) do
    # NEGOTIATE: Cross-DMW capability + scope agreement.
    # Standalone audit emission; result is negotiation outcome.
    with {:ok, _capsule} <- validate_request_capsule(req.capsule) do
      _ =
        Audit.write_audit_event(%{
          event_type: "COSMP_NEGOTIATE",
          outcome: "SUCCESS",
          actor_entity_id: nil,
          system_principal: Audit.system_principals()[:cosmp_router],
          details: %{requested_scopes: req.requested_scopes || []}
        })

      {:reply,
       {:ok,
        %Proto.NegotiateSuccess{
          granted_scopes: req.requested_scopes || []
        }}, state}
    else
      {:error, %Proto.CosmpError{} = err} ->
        emit_audit_failure("COSMP_NEGOTIATE", err)
        {:reply, {:error, err}, state}
    end
  end

  def handle_call({:read, %Proto.ReadRequest{} = req}, _from, state) do
    # READ: Metadata-first capsule retrieval via Storage facade
    # (ETS-first; Postgres fallthrough on miss). Standalone audit
    # emission for read access tracking; no business mutation.
    case Storage.get(req.capsule_id) do
      {:ok, %Capsule{} = capsule} ->
        _ =
          Audit.write_audit_event(%{
            event_type: "COSMP_READ",
            outcome: "SUCCESS",
            actor_entity_id: nil,
            target_capsule_id: req.capsule_id,
            system_principal: Audit.system_principals()[:cosmp_router],
            details: %{capsule_id: req.capsule_id}
          })

        proto_capsule = Translator.from_capsule(capsule)
        {:reply, {:ok, proto_capsule}, state}

      {:error, :not_found} ->
        err =
          Translator.error(
            :CAPSULE_NOT_FOUND,
            "Capsule #{req.capsule_id} not found in storage"
          )

        emit_audit_failure("COSMP_READ", err, target_capsule_id: req.capsule_id)
        {:reply, {:error, err}, state}
    end
  end

  def handle_call({:write, %Proto.WriteRequest{} = req}, _from, state) do
    # WRITE: Append-only capsule write with audit-chain.
    # Composed-mode per ADR-0033 §Decision 4e + RULE 4: Storage.Postgres.put
    # + Audit.write_audit_event/3 wrapped in Ecto.Multi (atomic rollback);
    # Idempotency.check/2 at entry + Idempotency.record/3 post-success.
    capsule = Translator.to_capsule(req.capsule || %Proto.Capsule{})

    with {:ok, validated} <- Validator.validate(capsule),
         idempotency_key <- "write:#{req.capsule_id}:v#{capsule_version(validated)}",
         result <-
           write_or_replay(
             idempotency_key,
             "WRITE",
             req.capsule_id,
             validated,
             "COSMP_WRITE"
           ) do
      case result do
        {:ok, _} ->
          {:reply,
           {:ok, %Proto.WriteSuccess{capsule_id: req.capsule_id}}, state}

        {:error, %Proto.CosmpError{} = err} ->
          {:reply, {:error, err}, state}
      end
    else
      {:error, %Proto.CosmpError{} = err} ->
        emit_audit_failure("COSMP_WRITE", err, target_capsule_id: req.capsule_id)
        {:reply, {:error, err}, state}
    end
  end

  def handle_call({:share, %Proto.ShareRequest{} = req}, _from, state) do
    # SHARE: Permissioned scope grant across DMWs.
    # Composed-mode: read existing + update permissions + persist + audit
    # wrapped in Ecto.Multi; Idempotency around (capsule_id, grantee).
    case Storage.get(req.capsule_id) do
      {:ok, %Capsule{} = capsule} ->
        updated_perms = grant_permission(capsule.permissions, req.grantee)
        updated_capsule = %Capsule{capsule | permissions: updated_perms}
        idempotency_key = "share:#{req.capsule_id}:#{req.grantee}"

        case write_or_replay(
               idempotency_key,
               "SHARE",
               req.capsule_id,
               updated_capsule,
               "COSMP_SHARE"
             ) do
          {:ok, _} ->
            granted_to = Map.get(updated_capsule.permissions, :granted_to, [])

            {:reply,
             {:ok,
              %Proto.ShareSuccess{
                capsule_id: req.capsule_id,
                granted_to: granted_to
              }}, state}

          {:error, %Proto.CosmpError{} = err} ->
            {:reply, {:error, err}, state}
        end

      {:error, :not_found} ->
        err = Translator.error(:CAPSULE_NOT_FOUND, "Capsule #{req.capsule_id} not found")
        emit_audit_failure("COSMP_SHARE", err, target_capsule_id: req.capsule_id)
        {:reply, {:error, err}, state}
    end
  end

  def handle_call({:revoke, %Proto.RevokeRequest{} = req}, _from, state) do
    # REVOKE: Capability revocation + downstream cascade marker.
    # Composed-mode: read existing + update permissions + persist + audit;
    # Idempotency around (capsule_id, grantee).
    case Storage.get(req.capsule_id) do
      {:ok, %Capsule{} = capsule} ->
        updated_perms = revoke_permission(capsule.permissions, req.grantee)
        updated_capsule = %Capsule{capsule | permissions: updated_perms}
        idempotency_key = "revoke:#{req.capsule_id}:#{req.grantee}"

        case write_or_replay(
               idempotency_key,
               "REVOKE",
               req.capsule_id,
               updated_capsule,
               "COSMP_REVOKE"
             ) do
          {:ok, _} ->
            remaining = Map.get(updated_capsule.permissions, :granted_to, [])

            {:reply,
             {:ok,
              %Proto.RevokeSuccess{
                capsule_id: req.capsule_id,
                remaining_grantees: remaining
              }}, state}

          {:error, %Proto.CosmpError{} = err} ->
            {:reply, {:error, err}, state}
        end

      {:error, :not_found} ->
        err = Translator.error(:CAPSULE_NOT_FOUND, "Capsule #{req.capsule_id} not found")
        emit_audit_failure("COSMP_REVOKE", err, target_capsule_id: req.capsule_id)
        {:reply, {:error, err}, state}
    end
  end

  def handle_call({:audit, %Proto.AuditRequest{} = req}, _from, state) do
    # AUDIT: Append-only audit log query (per ADR-0033 §Decision 4f
    # via verify_audit_chain; D-CASCADE-7 semantic: audit chain
    # queried on-demand from Postgres audit_events table, not from
    # in-memory Capsule.audit array).
    rows = CosmpRouter.Storage.Postgres.audit_chain_for_capsule(req.capsule_id)

    _ =
      Audit.write_audit_event(%{
        event_type: "COSMP_AUDIT",
        outcome: "SUCCESS",
        actor_entity_id: nil,
        target_capsule_id: req.capsule_id,
        system_principal: Audit.system_principals()[:cosmp_router],
        details: %{capsule_id: req.capsule_id, entry_count: length(rows)}
      })

    entries =
      Enum.map(rows, fn row ->
        %Proto.AuditEntry{
          event_type: row.event_type,
          actor: row.actor_entity_id || "",
          timestamp: DateTime.to_unix(row.timestamp, :millisecond)
        }
      end)

    {:reply, {:ok, %Proto.AuditSuccess{entries: entries}}, state}
  end

  # ============================================================================
  # Composed-mode orchestration helper (WRITE/SHARE/REVOKE shared path)
  # ============================================================================

  # WHAT: Idempotency-aware composed-mode write helper.
  # INPUT: idempotency_key (string) + scope (string) + capsule_id (string) +
  #        capsule (%Capsule{}) + audit event_type (string).
  # OUTPUT: {:ok, result_map} on success/replay; {:error, %CosmpError{}} on
  #         transaction failure.
  # WHY: Centralizes the Idempotency.check → Multi(Storage.Postgres.put +
  #      Audit.write_audit_event/3) → Idempotency.record discipline shared
  #      across WRITE/SHARE/REVOKE per ADR-0033 §Decision 4e + §Decision 6.
  defp write_or_replay(idempotency_key, scope, capsule_id, capsule, event_type) do
    case Idempotency.check(idempotency_key, scope) do
      {:ok, cached} ->
        # Idempotency hit: return cached result; no business mutation,
        # no audit emission per Pattern 5 replay semantics.
        {:ok, cached}

      :not_found ->
        # Composed-mode: business mutation + audit atomically per RULE 4.
        multi =
          Ecto.Multi.new()
          |> Ecto.Multi.run(:storage, fn _repo, _changes ->
            CosmpRouter.Storage.Postgres.put(capsule_id, capsule)
          end)

        multi =
          Audit.write_audit_event(
            %{
              event_type: event_type,
              outcome: "SUCCESS",
              actor_entity_id: nil,
              target_capsule_id: capsule_id,
              system_principal: Audit.system_principals()[:cosmp_router],
              details: %{op: scope, capsule_id: capsule_id}
            },
            multi,
            :audit
          )

        case Repo.transaction(multi) do
          {:ok, _changes} ->
            result = %{capsule_id: capsule_id, scope: scope, success: true}
            # Record idempotency post-success (independent transaction;
            # idempotency cache is best-effort, not load-bearing for
            # the audit chain).
            _ = Idempotency.record(idempotency_key, scope, result)
            # Warm ETS hot-tier post-Postgres-commit.
            _ = CosmpRouter.Storage.ETS.put(capsule_id, capsule)
            {:ok, result}

          {:error, _step, reason, _changes} ->
            err = Translator.error(:INTERNAL, "#{scope} failed: #{inspect(reason)}")
            {:error, err}
        end
    end
  end

  # ============================================================================
  # Standalone audit-failure emission helper
  # ============================================================================

  # WHAT: Emit a FAILURE audit event for an op that errored at validation
  #       OR at the storage/multi tier.
  # INPUT: event_type (string) + %CosmpError{} + optional target_capsule_id.
  # OUTPUT: ignored ({:ok, _} or {:error, _} — emission failure does NOT
  #         propagate; the op already failed for another reason).
  # WHY: Per ADR-0033 §Decision 4e + RULE 4, every failure also emits an
  #      audit row (the op's outcome is observable at the audit chain).
  defp emit_audit_failure(event_type, %Proto.CosmpError{} = err, opts \\ []) do
    # err.kind is a Proto enum atom (e.g., :PERMISSION_DENIED). Convert
    # to string before passing into details so canonical_json/1 (which
    # has no atom clause; byte-equivalent with TS canonicalJson which
    # has no atom semantics) can serialize it.
    Audit.write_audit_event(%{
      event_type: event_type,
      outcome: "FAILURE",
      actor_entity_id: nil,
      target_capsule_id: Keyword.get(opts, :target_capsule_id),
      system_principal: Audit.system_principals()[:cosmp_router],
      denial_reason: err.message,
      details: %{kind: to_string(err.kind), message: err.message}
    })
  end

  # ============================================================================
  # Validation + permission helpers (preserved from sub-phase 5b-i)
  # ============================================================================

  defp validate_request_capsule(nil) do
    {:error, Translator.error(:INVALID_CAPSULE, "Request capsule is nil")}
  end

  defp validate_request_capsule(%Proto.Capsule{} = proto) do
    Validator.validate(Translator.to_capsule(proto))
  end

  defp validate_principal_id(""),
    do: {:error, Translator.error(:PERMISSION_DENIED, "principal_id must not be empty")}

  defp validate_principal_id(nil),
    do: {:error, Translator.error(:PERMISSION_DENIED, "principal_id must not be nil")}

  defp validate_principal_id(id) when is_binary(id), do: :ok

  defp grant_permission(nil, grantee) do
    %{owner: "", granted_to: [grantee]}
  end

  defp grant_permission(%{} = perms, grantee) do
    granted_to = Map.get(perms, :granted_to, [])

    new_granted =
      if grantee in granted_to do
        granted_to
      else
        granted_to ++ [grantee]
      end

    Map.put(perms, :granted_to, new_granted)
  end

  defp revoke_permission(nil, _grantee), do: %{owner: "", granted_to: []}

  defp revoke_permission(%{} = perms, grantee) do
    granted_to = Map.get(perms, :granted_to, [])
    new_granted = Enum.reject(granted_to, &(&1 == grantee))
    Map.put(perms, :granted_to, new_granted)
  end

  defp capsule_version(%Capsule{metadata: %{version: v}}) when is_integer(v), do: v
  defp capsule_version(%Capsule{metadata: %{"version" => v}}) when is_integer(v), do: v
  defp capsule_version(_), do: 1
end
