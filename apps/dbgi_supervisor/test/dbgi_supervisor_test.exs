defmodule DbgiSupervisorTest do
  @moduledoc """
  Sub-phase 7 `[BEAM-DBGI-APP-SKELETON]` OTP app skeleton tests
  substantively expanded across sub-phases 8 + 9:

  - Sub-phase 8 `[BEAM-DBGI-PROCESS-GROUPS]`: `:pg` + Registry +
    DynamicSupervisor canonical per ADR-0028 §3 + ADR-0030 §DBGI
  - Sub-phase 9 `[BEAM-DBGI-LIBCLUSTER]`: Cluster.Supervisor +
    Phoenix.PubSub + Phoenix.Tracker canonical per ADR-0028 §3
    "CRDT-backed state where the workload permits" + ADR-0030 §DBGI
    sub-phase 9 amendment (LANDED this commit per
    D-PHASE-9-PHOENIX-TRACKER-ADR-0030-AMENDMENT-CANDIDATE 27th
    canonical substrate-build observation candidate)

  Substantive DBGI integration tests forward-queued to sub-phase 10
  `[BEAM-DBGI-INTEGRATION-TESTS]` per ADR-0030 §DBGI canonical at
  substrate-architectural register (process group join/leave +
  clustering formation + failover across nodes).

  ## References

  - ADR-0028 §3 (BEAM Coordination Layer)
  - ADR-0030 §DBGI Supervisor Layer (sub-phases 7-10; sub-phase 9
    amendment LANDS this commit)
  - ADR-0034 (BEAM COSMP Testability Refactor Pattern)
  - ADR-0035 §9 (D-PHASE-8-PG-VS-GPROC-DISCRIMINATION 21st +
    D-PHASE-9-PHOENIX-TRACKER-ADR-0030-AMENDMENT-CANDIDATE 27th +
    D-PHASE-9-PG2-VS-PG-COEXISTENCE 28th observation candidates)
  """

  use ExUnit.Case, async: false

  test "DbgiSupervisor.Supervisor is alive after app start" do
    assert is_pid(Process.whereis(DbgiSupervisor.Supervisor))
  end

  test "Supervisor children list substantively at sub-arc 1 sub-phase b canonical register" do
    children = Supervisor.which_children(DbgiSupervisor.Supervisor)
    # Substantively 8 children at sub-arc 1 sub-phase b canonical register:
    # Sub-phase 8 baseline (process-group substrate):
    # - DbgiSupervisor.PG (`:pg` namespaced scope; modern OTP 23+ canonical)
    # - DbgiSupervisor.Registry (per-DMW addressing canonical)
    # - DbgiSupervisor.DynamicSupervisor (per-DMW lifecycle canonical)
    # Sub-phase 9 expansion (multi-region cluster substrate):
    # - DbgiSupervisor.ClusterSupervisor (libcluster topology canonical)
    # - DbgiSupervisor.PubSub (Phoenix.PubSub cross-node messaging canonical)
    # - DbgiSupervisor.PresenceTracker (Phoenix.Tracker CRDT-backed presence canonical)
    # Sub-arc 1 sub-phase b Commit B.3 (Horde distributed substrate per ADR-0039 Sub-decision 1):
    # - DbgiSupervisor.HordeRegistry (CRDT-based distributed Registry canonical)
    # - DbgiSupervisor.HordeDynamicSupervisor (distributed DynamicSupervisor canonical)
    assert length(children) == 8
  end

  test ":pg scope substantively at canonical register" do
    assert is_pid(Process.whereis(DbgiSupervisor.PG))
  end

  test "DbgiSupervisor.Registry substantively at canonical register" do
    assert is_pid(Process.whereis(DbgiSupervisor.Registry))
  end

  test "DbgiSupervisor.DynamicSupervisor substantively at canonical register" do
    assert is_pid(Process.whereis(DbgiSupervisor.DynamicSupervisor))
  end

  test "DbgiSupervisor.ClusterSupervisor substantively at canonical register" do
    assert is_pid(Process.whereis(DbgiSupervisor.ClusterSupervisor))
  end

  test "DbgiSupervisor.PubSub substantively at canonical register" do
    assert is_pid(Process.whereis(DbgiSupervisor.PubSub))
  end

  test "DbgiSupervisor.PresenceTracker substantively at canonical register" do
    assert is_pid(Process.whereis(DbgiSupervisor.PresenceTracker))
  end
end
