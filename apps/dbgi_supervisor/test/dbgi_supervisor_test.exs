defmodule DbgiSupervisorTest do
  @moduledoc """
  Sub-phase 7 `[BEAM-DBGI-APP-SKELETON]` OTP app skeleton tests at
  the substrate-coherent register.

  Substantive DBGI substrate tests forward-queued to sub-phase 10
  `[BEAM-DBGI-INTEGRATION-TESTS]` per ADR-0030 §DBGI canonical at
  substrate-architectural register (process group join/leave +
  clustering formation + failover across nodes).

  ## References

  - ADR-0030 §DBGI Supervisor Layer (sub-phases 7-10 canonical at
    substrate-architectural register)
  - ADR-0034 (BEAM COSMP Testability Refactor Pattern; testability
    discipline forward-applied at sub-phase 10 integration-test register)
  """

  use ExUnit.Case, async: false

  test "DbgiSupervisor.Supervisor is alive after app start" do
    assert is_pid(Process.whereis(DbgiSupervisor.Supervisor))
  end

  test "Supervisor children list is empty at sub-phase 7 (substantive children forward-queued to sub-phases 8-9)" do
    children = Supervisor.which_children(DbgiSupervisor.Supervisor)
    assert children == []
  end
end
