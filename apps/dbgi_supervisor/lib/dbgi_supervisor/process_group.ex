defmodule DbgiSupervisor.ProcessGroup do
  @moduledoc """
  Thin abstraction module over `:pg` for DBGI-canonical API at the
  substrate-coherent register.

  Substantively wraps `:pg` OTP-native process group canonical at
  modern OTP 23+ register per D-PHASE-8-PG-VS-GPROC-DISCRIMINATION
  21st canonical substrate-build observation candidate at the
  substantive register.

  ## Substrate-architectural scope

  Per ADR-0028 §3 + ADR-0030 §DBGI canonical at substantive register:
  - One process group per DMW (Personal + Enterprise + Device per
    ADR-0001 three-wallet substrate at internal register)
  - Cluster-aware by default ("strong eventual consistency" across
    nodes; partition-tolerant per `:pg` CRDT-based design — built by
    WhatsApp Inc. at OTP 23)
  - Sub-phase 9 `[BEAM-DBGI-LIBCLUSTER]` substantively extends to
    multi-region cluster register at libcluster + Phoenix.PubSub
    forward-queue scope

  ## Canonical API

  - `join/2` — process joins group at canonical register
  - `leave/2` — process leaves group at canonical register
  - `get_members/1` — surface group membership at canonical register
  - `get_local_members/1` — surface node-local members (canonical for
    substrate-coherent test register)
  - `which_groups/0` — surface all groups at namespaced scope register
  - `monitor/1` — monitor group membership changes (canonical for
    sub-phase 10 integration-test register)

  ## Namespaced scope

  All operations operate on the `DbgiSupervisor.PG` namespaced scope
  (started by `DbgiSupervisor.Application` supervision tree). Per
  Erlang `:pg` canonical, scope decouples "single mesh into a set of
  overlay networks" — substrate-coherence at multi-tenant register.

  ## References

  - https://www.erlang.org/doc/man/pg.html (Erlang `:pg` canonical)
  - ADR-0028 §3 (BEAM Coordination Layer — DBGI process groups
    canonical)
  - ADR-0030 §DBGI Supervisor Layer (Phase 2 implementation sub-phase
    8 substantive register)
  - ADR-0035 §9 D-PHASE-8-PG-VS-GPROC-DISCRIMINATION (21st
    substrate-build observation candidate)
  """

  @scope DbgiSupervisor.PG

  @doc """
  Join the calling process (or specified `pid`) to `group` at the
  canonical register.
  """
  @spec join(term(), pid()) :: :ok
  def join(group, pid \\ self()) do
    # Sub-phase 11 instrumentation canonical at substantive register
    # per ADR-0030 §DBGI sub-phase 11 amendment + Q4 LOCKED canonical
    # at substantive register substantively. Event metadata
    # constrained to event_type + outcome canonical at substantive
    # register substantively (NO group keys at canonical register
    # per privacy discipline canonical at substantive register
    # substantively).
    start = System.monotonic_time()
    result = :pg.join(@scope, group, pid)
    duration_ms = System.convert_time_unit(System.monotonic_time() - start, :native, :millisecond)

    :telemetry.execute(
      [:dbgi_supervisor, :process_group, :stop],
      %{count: 1, duration_ms: duration_ms},
      %{event_type: :join, outcome: :success}
    )

    result
  end

  @doc """
  Leave `group` from the calling process (or specified `pid`) at the
  canonical register. Returns `:ok` on success or `:not_joined` if
  the pid was not a member of the group.
  """
  @spec leave(term(), pid()) :: :ok | :not_joined
  def leave(group, pid \\ self()) do
    start = System.monotonic_time()
    result = :pg.leave(@scope, group, pid)
    duration_ms = System.convert_time_unit(System.monotonic_time() - start, :native, :millisecond)

    outcome = if result == :ok, do: :success, else: :failure

    :telemetry.execute(
      [:dbgi_supervisor, :process_group, :stop],
      %{count: 1, duration_ms: duration_ms},
      %{event_type: :leave, outcome: outcome}
    )

    result
  end

  @doc """
  Surface members of `group` at the canonical register (includes
  cluster-wide members per `:pg` strong-eventual-consistency design).
  """
  @spec get_members(term()) :: [pid()]
  def get_members(group) do
    :pg.get_members(@scope, group)
  end

  @doc """
  Surface node-local members of `group` at the canonical register
  (filters out members on other nodes; canonical for substrate-
  coherent test register where multi-node state isn't substantively
  load-bearing at the sub-phase 8 single-node register).
  """
  @spec get_local_members(term()) :: [pid()]
  def get_local_members(group) do
    :pg.get_local_members(@scope, group)
  end

  @doc """
  Surface all groups at the `DbgiSupervisor.PG` namespaced scope
  register.
  """
  @spec which_groups() :: [term()]
  def which_groups do
    :pg.which_groups(@scope)
  end

  @doc """
  Monitor `group` for membership changes at the canonical register.
  Returns `{ref, members}` tuple at the canonical register;
  subsequent membership changes surface as `{ref, :join, group, pids}`
  + `{ref, :leave, group, pids}` messages at the calling process
  mailbox.
  """
  @spec monitor(term()) :: {reference(), [pid()]}
  def monitor(group) do
    :pg.monitor(@scope, group)
  end
end
