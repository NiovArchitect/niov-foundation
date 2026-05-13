defmodule CosmpRouterTest do
  @moduledoc """
  Sub-phase 3 `[BEAM-COSMP-APP-SKELETON]` smoke test.

  Establishes the test pattern sub-phases 4-10 inherit:

  - App starts cleanly
  - Supervisor process alive + named correctly
  - Supervision tree introspectable

  ## Sub-phase 4b update — landed

  Sub-phase 4b `[BEAM-COSMP-GENSERVER-CODE]` added the first child
  (`CosmpRouter.Router` GenServer) to the supervision tree per
  ADR-0031 §Decision. The `which_children` assertion below updated
  accordingly. Sub-phase 5 `[BEAM-COSMP-INTEROP]` adds the gRPC bridge
  as 2nd child; assertion updates again. The pattern itself
  (named-supervisor + tree introspection) carries forward unchanged.
  """

  use ExUnit.Case, async: true

  test "CosmpRouter.Supervisor is alive after app start" do
    # The Application starts as part of the :cosmp_router app boot;
    # if reach this test, the Application callback returned :ok.
    assert is_pid(Process.whereis(CosmpRouter.Supervisor))
  end

  test "supervision tree is introspectable" do
    children = Supervisor.which_children(CosmpRouter.Supervisor)
    # Sub-phase 4b [BEAM-COSMP-GENSERVER-CODE]: tree has 1 child (Router GenServer).
    # Sub-phase 5 [BEAM-COSMP-INTEROP] adds 2nd child (gRPC bridge).
    assert is_list(children)
    assert length(children) == 1
    assert {CosmpRouter.Router, _pid, :worker, [CosmpRouter.Router]} = hd(children)
  end
end
