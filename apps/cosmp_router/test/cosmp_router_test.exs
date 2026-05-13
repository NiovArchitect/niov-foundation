defmodule CosmpRouterTest do
  @moduledoc """
  Sub-phase 3 `[BEAM-COSMP-APP-SKELETON]` smoke test.

  Establishes the test pattern sub-phases 4-10 inherit:

  - App starts cleanly
  - Supervisor process alive + named correctly
  - Supervision tree introspectable

  ## Sub-phase 4 update path

  The `which_children` assertion below returns `[]` at sub-phase 3.
  Sub-phase 4 `[BEAM-COSMP-GENSERVER]` adds the first child to the
  tree; this test updates to assert at least one worker present and
  named correctly. The pattern itself (named-supervisor + tree
  introspection) carries forward unchanged.
  """

  use ExUnit.Case, async: true

  test "CosmpRouter.Supervisor is alive after app start" do
    # The Application starts as part of the :cosmp_router app boot;
    # if reach this test, the Application callback returned :ok.
    assert is_pid(Process.whereis(CosmpRouter.Supervisor))
  end

  test "supervision tree is introspectable" do
    children = Supervisor.which_children(CosmpRouter.Supervisor)
    # Sub-phase 3: empty. Sub-phase 4 adds first child; update
    # assertion then.
    assert is_list(children)
    assert children == []
  end
end
