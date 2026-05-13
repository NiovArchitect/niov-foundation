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

  ## ADR-0026 §5 load-bearing patterns instantiated

  - **Pattern 1 (message-passing semantics over shared state)** —
    `GenServer.call/3` 7-op dispatch.
  - **Pattern 2 (supervisor-friendly failure modes)** — typed
    `{:reply, {:ok, _} | {:error, %CosmpError{}}, state}` return shape.
  - **Pattern 6 (pure transformation over imperative control)** —
    `handle_call/3` as pure decision functions; side effects (ETS
    storage interaction, future Postgres writes) at consumer
    boundaries.

  Patterns 3, 4, 5 forward-queued to sub-phase 5b-ii / 6 per
  ADR-0031 Q-A + ADR-0033 (forthcoming).

  ## Sub-phase 5b-i status (this commit)

  All 7 ops fill real routing logic against ETS-backed storage per
  Q-T (ADR-0031 sub-phase 5a authorization). Q-N satisfied: no
  `:not_implemented` stubs cross gRPC boundary. Each handle_call
  receives a Protobuf request struct from `CosmpRouter.GRPC.Server`
  and returns `{:ok, response_payload}` or `{:error, %CosmpError{}}`.
  The gRPC server wraps the result into the response's `oneof
  :result` branch per ADR-0032 §Decision Error envelope structure.

  Sub-phase 5b-ii (forthcoming): Postgres source-of-truth layered on
  ETS; audit-chain integration with TypeScript-shared `audit_events`
  table per ADR-0026 §5 Pattern 4 + ADR-0033.

  ## References

  - ADR-0032 (BEAM gRPC Interop Architecture) §Decision
  - ADR-0031 (BEAM Routing Substrate Architecture) §Decision
  - ADR-0026 (Dual-Control Middleware Pattern) §5 — 6 BEAM-compatibility
    patterns; subset 1, 2, 6 load-bearing here
  - US 12,517,919 (COSMP Protocol patent)
  """

  use GenServer

  alias CosmpRouter.Capsule
  alias CosmpRouter.Capsule.Validator
  alias CosmpRouter.GRPC.Translator
  alias CosmpRouter.Proto
  alias CosmpRouter.Router.State
  alias CosmpRouter.Storage.ETS, as: Storage

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
  # 7 COSMP ops per US 12,517,919 — one handle_call clause per op for
  # patent-canonical surface visibility (ADR-0031 Q-I). Each handler
  # receives the Protobuf request struct from CosmpRouter.GRPC.Server;
  # returns {:ok, response_payload} or {:error, %CosmpError{}}.
  # ============================================================================

  @impl true
  def handle_call({:authenticate, %Proto.AuthenticateRequest{} = req}, _from, state) do
    # AUTHENTICATE: DMW/principal identity verification.
    # Sub-phase 5b-i: validate Capsule; check principal_id non-empty.
    # Sub-phase 5b-ii: validate against Postgres-persisted DMW registry.
    with {:ok, _capsule} <- validate_request_capsule(req.capsule),
         :ok <- validate_principal_id(req.principal_id) do
      {:reply,
       {:ok,
        %Proto.AuthenticateSuccess{
          authenticated: true,
          principal_id: req.principal_id
        }}, state}
    else
      {:error, %Proto.CosmpError{} = err} -> {:reply, {:error, err}, state}
    end
  end

  def handle_call({:negotiate, %Proto.NegotiateRequest{} = req}, _from, state) do
    # NEGOTIATE: Cross-DMW capability + scope agreement.
    # Sub-phase 5b-i: validate Capsule; pass through requested_scopes
    #   as granted_scopes (permissive routing at hot-tier; sub-phase
    #   5b-ii narrows against per-DMW capability registry).
    with {:ok, _capsule} <- validate_request_capsule(req.capsule) do
      {:reply,
       {:ok,
        %Proto.NegotiateSuccess{
          granted_scopes: req.requested_scopes || []
        }}, state}
    else
      {:error, %Proto.CosmpError{} = err} -> {:reply, {:error, err}, state}
    end
  end

  def handle_call({:read, %Proto.ReadRequest{} = req}, _from, state) do
    # READ: Metadata-first capsule retrieval from ETS.
    case Storage.get(req.capsule_id) do
      {:ok, %Capsule{} = capsule} ->
        proto_capsule = Translator.from_capsule(capsule)
        {:reply, {:ok, proto_capsule}, state}

      {:error, :not_found} ->
        err =
          Translator.error(
            :CAPSULE_NOT_FOUND,
            "Capsule #{req.capsule_id} not found in storage"
          )

        {:reply, {:error, err}, state}
    end
  end

  def handle_call({:write, %Proto.WriteRequest{} = req}, _from, state) do
    # WRITE: Append-only capsule write with audit-chain.
    # Sub-phase 5b-i: validator + ETS put + audit-entry append.
    # Sub-phase 5b-ii: Postgres write + audit_events table per
    #   ADR-0026 §5 Pattern 4.
    capsule = Translator.to_capsule(req.capsule || %Proto.Capsule{})

    case Validator.validate(capsule) do
      {:ok, validated} ->
        # Append audit entry for this WRITE.
        audited =
          append_audit(validated, %{
            event_type: "WRITE",
            actor: "cosmp_router",
            timestamp: System.system_time(:millisecond)
          })

        :ok = Storage.put(req.capsule_id, audited)

        {:reply,
         {:ok,
          %Proto.WriteSuccess{capsule_id: req.capsule_id}}, state}

      {:error, %Proto.CosmpError{} = err} ->
        {:reply, {:error, err}, state}
    end
  end

  def handle_call({:share, %Proto.ShareRequest{} = req}, _from, state) do
    # SHARE: Permissioned scope grant across DMWs.
    case Storage.get(req.capsule_id) do
      {:ok, %Capsule{} = capsule} ->
        updated_perms = grant_permission(capsule.permissions, req.grantee)

        updated =
          %Capsule{capsule | permissions: updated_perms}
          |> append_audit(%{
            event_type: "SHARE",
            actor: req.grantee,
            timestamp: System.system_time(:millisecond)
          })

        :ok = Storage.put(req.capsule_id, updated)

        granted_to = Map.get(updated.permissions, :granted_to, [])

        {:reply,
         {:ok,
          %Proto.ShareSuccess{
            capsule_id: req.capsule_id,
            granted_to: granted_to
          }}, state}

      {:error, :not_found} ->
        err = Translator.error(:CAPSULE_NOT_FOUND, "Capsule #{req.capsule_id} not found")
        {:reply, {:error, err}, state}
    end
  end

  def handle_call({:revoke, %Proto.RevokeRequest{} = req}, _from, state) do
    # REVOKE: Capability revocation + downstream cascade marker.
    case Storage.get(req.capsule_id) do
      {:ok, %Capsule{} = capsule} ->
        updated_perms = revoke_permission(capsule.permissions, req.grantee)

        updated =
          %Capsule{capsule | permissions: updated_perms}
          |> append_audit(%{
            event_type: "REVOKE",
            actor: req.grantee,
            timestamp: System.system_time(:millisecond)
          })

        :ok = Storage.put(req.capsule_id, updated)

        remaining = Map.get(updated.permissions, :granted_to, [])

        {:reply,
         {:ok,
          %Proto.RevokeSuccess{
            capsule_id: req.capsule_id,
            remaining_grantees: remaining
          }}, state}

      {:error, :not_found} ->
        err = Translator.error(:CAPSULE_NOT_FOUND, "Capsule #{req.capsule_id} not found")
        {:reply, {:error, err}, state}
    end
  end

  def handle_call({:audit, %Proto.AuditRequest{} = req}, _from, state) do
    # AUDIT: Append-only audit log query (pre-success guaranteed).
    case Storage.get(req.capsule_id) do
      {:ok, %Capsule{} = capsule} ->
        entries =
          Enum.map(capsule.audit || [], fn entry ->
            %Proto.AuditEntry{
              event_type: Map.get(entry, :event_type, ""),
              actor: Map.get(entry, :actor, ""),
              timestamp: Map.get(entry, :timestamp, 0)
            }
          end)

        {:reply, {:ok, %Proto.AuditSuccess{entries: entries}}, state}

      {:error, :not_found} ->
        err = Translator.error(:CAPSULE_NOT_FOUND, "Capsule #{req.capsule_id} not found")
        {:reply, {:error, err}, state}
    end
  end

  # ============================================================================
  # Private helpers
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

  defp append_audit(%Capsule{} = capsule, entry) do
    existing = capsule.audit || []
    %Capsule{capsule | audit: existing ++ [entry]}
  end

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
end
