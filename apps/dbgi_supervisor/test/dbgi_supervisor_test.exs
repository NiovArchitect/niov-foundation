defmodule DbgiSupervisorTest do
  @moduledoc """
  Sub-phase 7 `[BEAM-DBGI-APP-SKELETON]` OTP app skeleton tests at
  the substrate-coherent register; substantively expanded at
  sub-phase 8 `[BEAM-DBGI-PROCESS-GROUPS]` register to verify
  children list substantive substrate at canonical register
  (`:pg` + Registry + DynamicSupervisor canonical per ADR-0028 §3
  + ADR-0030 §DBGI at substantive register).

  Substantive DBGI integration tests forward-queued to sub-phase 10
  `[BEAM-DBGI-INTEGRATION-TESTS]` per ADR-0030 §DBGI canonical at
  substrate-architectural register (process group join/leave +
  clustering formation + failover across nodes).

  ## References

  - ADR-0028 §3 (BEAM Coordination Layer — names canonical patterns
    for DBGI substrate at substrate-architectural register)
  - ADR-0030 §DBGI Supervisor Layer (sub-phases 7-10 canonical at
    substrate-architectural register)
  - ADR-0034 (BEAM COSMP Testability Refactor Pattern; testability
    discipline forward-applied at sub-phase 10 integration-test register)
  - ADR-0035 §9 D-PHASE-8-PG-VS-GPROC-DISCRIMINATION (21st canonical
    substrate-build observation candidate)
  """

  use ExUnit.Case, async: false

  test "DbgiSupervisor.Supervisor is alive after app start" do
    assert is_pid(Process.whereis(DbgiSupervisor.Supervisor))
  end

  test "Supervisor children list substantively at sub-phase 8 canonical register" do
    children = Supervisor.which_children(DbgiSupervisor.Supervisor)
    # Substantively 3 children at sub-phase 8 canonical register:
    # - DbgiSupervisor.PG (`:pg` namespaced scope; modern OTP 23+ canonical)
    # - DbgiSupervisor.Registry (per-DMW addressing canonical)
    # - DbgiSupervisor.DynamicSupervisor (per-DMW lifecycle canonical)
    assert length(children) == 3
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
end
