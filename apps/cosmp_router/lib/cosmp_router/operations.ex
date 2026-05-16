defmodule CosmpRouter.Operations do
  @moduledoc """
  Pure-module COSMP operation primitives per ADR-0039 §Decision
  Sub-decision 2 + Sub-decision 11.

  ## Patent-canonical role

  The 7 COSMP operations per US 12,517,919 are implemented here as
  stateless module-level functions. `CosmpRouter.Router` GenServer
  wraps each via `handle_call` for the single-node singleton dispatch
  path; `DbgiSupervisor.DMWWorker` invokes the same functions per
  ENTERPRISE entity_id at the hive-scale dispatch path per ADR-0039
  §Decision Sub-decision 3. Single-source-of-truth preserved at
  module-level register.

  ## ADR-0039 §Sub-decision 11 -- Elixir anti-pattern resolution

  Wrapping stateless logic in a GenServer is canonical Elixir hexdocs
  anti-pattern. Sub-decision 2 extracts the 7 op bodies from the
  prior Router handle_call clauses into this module as pure functions
  invoking the existing composed-mode helpers + Storage facade +
  Audit chain + Idempotency substrate at single-source-of-truth
  register. `CosmpRouter.Router` GenServer wrapper stays canonical at
  backward-compat register for non-ENTERPRISE tier dispatch at
  sub-phase b register.

  ## State parameter shape

  Each public function takes `(req, state)` where `state` is the
  `CosmpRouter.Router.State` struct (or a struct with the same
  `:storage_ets` field). The function does not mutate state; the
  caller threads state through unchanged.

  ## Return shape

  Each public function returns `{:ok, success_proto} | {:error,
  %Proto.CosmpError{}}`. The Router wrapper or DMWWorker handler
  envelopes the result in `{:reply, result, state}` for GenServer
  reply semantics.

  ## 6 BEAM-compatibility patterns from ADR-0026 §5

  All 6 patterns preserved by construction at this module-level
  register: message-passing semantics (Router/DMWWorker GenServer
  callers); supervisor-friendly failure modes (typed CosmpError
  returns); state reconstructible from durable storage (Storage
  facade routes ETS to Postgres); event-sourced audit semantics
  (composed-mode Audit.write_audit_event/3 for WRITE/SHARE/REVOKE;
  standalone for READ/AUDIT/AUTHENTICATE/NEGOTIATE); idempotent
  verification keys (Idempotency.check/2 + record/3 wrap
  WRITE/SHARE/REVOKE); pure transformation over imperative control
  (this module substantively).

  ## References

  - ADR-0039 §Decision Sub-decision 2 (cosmp_router pure-module refactor)
  - ADR-0039 §Decision Sub-decision 11 (Elixir anti-pattern compliance)
  - ADR-0033 §Decision 4e (composed-mode audit) + §Decision 5
    (Storage facade) + §Decision 6 (Idempotency layer)
  - ADR-0026 §5 (6 BEAM-compatibility patterns)
  - US 12,517,919 (COSMP Protocol patent)
  """

  alias CosmpRouter.{Audit, Capsule, Idempotency, Repo, Storage}
  alias CosmpRouter.Capsule.Validator
  alias CosmpRouter.GRPC.Translator
  alias CosmpRouter.Proto

  @type op_reply :: {:ok, struct()} | {:error, Proto.CosmpError.t()}

  # ============================================================================
  # 7 COSMP op primitives per US 12,517,919
  # ============================================================================

  @spec authenticate(Proto.AuthenticateRequest.t(), map()) :: op_reply()
  def authenticate(%Proto.AuthenticateRequest{} = req, _state) do
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

      {:ok,
       %Proto.AuthenticateSuccess{
         authenticated: true,
         principal_id: req.principal_id
       }}
    else
      {:error, %Proto.CosmpError{} = err} ->
        emit_audit_failure("COSMP_AUTHENTICATE", err)
        {:error, err}
    end
  end

  @spec negotiate(Proto.NegotiateRequest.t(), map()) :: op_reply()
  def negotiate(%Proto.NegotiateRequest{} = req, _state) do
    with {:ok, _capsule} <- validate_request_capsule(req.capsule) do
      _ =
        Audit.write_audit_event(%{
          event_type: "COSMP_NEGOTIATE",
          outcome: "SUCCESS",
          actor_entity_id: nil,
          system_principal: Audit.system_principals()[:cosmp_router],
          details: %{requested_scopes: req.requested_scopes || []}
        })

      {:ok,
       %Proto.NegotiateSuccess{
         granted_scopes: req.requested_scopes || []
       }}
    else
      {:error, %Proto.CosmpError{} = err} ->
        emit_audit_failure("COSMP_NEGOTIATE", err)
        {:error, err}
    end
  end

  @spec read(Proto.ReadRequest.t(), map()) :: op_reply()
  def read(%Proto.ReadRequest{} = req, state) do
    case Storage.get(req.capsule_id, ets: state.storage_ets) do
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
        {:ok, proto_capsule}

      {:error, :not_found} ->
        err =
          Translator.error(
            :CAPSULE_NOT_FOUND,
            "Capsule #{req.capsule_id} not found in storage"
          )

        emit_audit_failure("COSMP_READ", err, target_capsule_id: req.capsule_id)
        {:error, err}
    end
  end

  @spec write(Proto.WriteRequest.t(), map()) :: op_reply()
  def write(%Proto.WriteRequest{} = req, state) do
    capsule = Translator.to_capsule(req.capsule || %Proto.Capsule{})

    with {:ok, validated} <- Validator.validate(capsule),
         idempotency_key <- "write:#{req.capsule_id}:v#{capsule_version(validated)}",
         result <-
           write_or_replay(
             idempotency_key,
             "WRITE",
             req.capsule_id,
             validated,
             "COSMP_WRITE",
             state.storage_ets
           ) do
      case result do
        {:ok, _} ->
          {:ok, %Proto.WriteSuccess{capsule_id: req.capsule_id}}

        {:error, %Proto.CosmpError{} = err} ->
          {:error, err}
      end
    else
      {:error, %Proto.CosmpError{} = err} ->
        emit_audit_failure("COSMP_WRITE", err, target_capsule_id: req.capsule_id)
        {:error, err}
    end
  end

  @spec share(Proto.ShareRequest.t(), map()) :: op_reply()
  def share(%Proto.ShareRequest{} = req, state) do
    case Storage.get(req.capsule_id, ets: state.storage_ets) do
      {:ok, %Capsule{} = capsule} ->
        updated_perms = grant_permission(capsule.permissions, req.grantee)
        updated_capsule = %Capsule{capsule | permissions: updated_perms}
        idempotency_key = "share:#{req.capsule_id}:#{req.grantee}"

        case write_or_replay(
               idempotency_key,
               "SHARE",
               req.capsule_id,
               updated_capsule,
               "COSMP_SHARE",
               state.storage_ets
             ) do
          {:ok, _} ->
            granted_to = Map.get(updated_capsule.permissions, :granted_to, [])

            {:ok,
             %Proto.ShareSuccess{
               capsule_id: req.capsule_id,
               granted_to: granted_to
             }}

          {:error, %Proto.CosmpError{} = err} ->
            {:error, err}
        end

      {:error, :not_found} ->
        err = Translator.error(:CAPSULE_NOT_FOUND, "Capsule #{req.capsule_id} not found")
        emit_audit_failure("COSMP_SHARE", err, target_capsule_id: req.capsule_id)
        {:error, err}
    end
  end

  @spec revoke(Proto.RevokeRequest.t(), map()) :: op_reply()
  def revoke(%Proto.RevokeRequest{} = req, state) do
    case Storage.get(req.capsule_id, ets: state.storage_ets) do
      {:ok, %Capsule{} = capsule} ->
        updated_perms = revoke_permission(capsule.permissions, req.grantee)
        updated_capsule = %Capsule{capsule | permissions: updated_perms}
        idempotency_key = "revoke:#{req.capsule_id}:#{req.grantee}"

        case write_or_replay(
               idempotency_key,
               "REVOKE",
               req.capsule_id,
               updated_capsule,
               "COSMP_REVOKE",
               state.storage_ets
             ) do
          {:ok, _} ->
            remaining = Map.get(updated_capsule.permissions, :granted_to, [])

            {:ok,
             %Proto.RevokeSuccess{
               capsule_id: req.capsule_id,
               remaining_grantees: remaining
             }}

          {:error, %Proto.CosmpError{} = err} ->
            {:error, err}
        end

      {:error, :not_found} ->
        err = Translator.error(:CAPSULE_NOT_FOUND, "Capsule #{req.capsule_id} not found")
        emit_audit_failure("COSMP_REVOKE", err, target_capsule_id: req.capsule_id)
        {:error, err}
    end
  end

  @spec audit(Proto.AuditRequest.t(), map()) :: op_reply()
  def audit(%Proto.AuditRequest{} = req, _state) do
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

    {:ok, %Proto.AuditSuccess{entries: entries}}
  end

  # ============================================================================
  # Composed-mode orchestration helper (WRITE/SHARE/REVOKE shared path)
  # ============================================================================

  defp write_or_replay(idempotency_key, scope, capsule_id, capsule, event_type, storage_ets) do
    case Idempotency.check(idempotency_key, scope) do
      {:ok, cached} ->
        {:ok, cached}

      :not_found ->
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
            _ = Idempotency.record(idempotency_key, scope, result)
            _ = CosmpRouter.Storage.ETS.put(storage_ets, capsule_id, capsule)
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

  defp emit_audit_failure(event_type, %Proto.CosmpError{} = err, opts \\ []) do
    outcome =
      case err.kind do
        :PERMISSION_DENIED -> "DENIED"
        _ -> "ERROR"
      end

    target_capsule_id =
      case Keyword.get(opts, :target_capsule_id) do
        nil ->
          nil

        capsule_id when is_binary(capsule_id) ->
          case Ecto.UUID.cast(capsule_id) do
            {:ok, uuid} -> uuid
            :error -> nil
          end
      end

    Audit.write_audit_event(%{
      event_type: event_type,
      outcome: outcome,
      actor_entity_id: nil,
      target_capsule_id: target_capsule_id,
      system_principal: Audit.system_principals()[:cosmp_router],
      denial_reason: err.message,
      details: %{kind: to_string(err.kind), message: err.message}
    })
  end

  # ============================================================================
  # Validation + permission helpers (preserved verbatim from prior Router)
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
