defmodule CosmpRouter.RouterTest do
  @moduledoc """
  Sub-phase 4b `[BEAM-COSMP-GENSERVER-CODE]` Router GenServer tests.

  Verifies ADR-0031 §Decision instantiation:

  - Router process alive + named (`Process.whereis/1` lookup)
  - 7 handle_call clauses return `{:ok, :not_implemented}` per op
  - State struct initialized correctly (empty in_flight + non-nil started_at)

  Establishes per-op test pattern sub-phases 5-6 inherit when handle_call
  bodies fill with consumer-specific logic.
  """

  use ExUnit.Case, async: true

  alias CosmpRouter.Capsule
  alias CosmpRouter.Router
  alias CosmpRouter.Router.State

  describe "Router process lifecycle" do
    test "Router is alive after app start" do
      assert is_pid(Process.whereis(Router))
    end

    test "Router state is initialized correctly" do
      state = :sys.get_state(Router)
      assert %State{} = state
      assert state.in_flight == %{}
      assert is_integer(state.started_at)
    end
  end

  describe "7 COSMP ops handle_call dispatch (ADR-0031 §Decision)" do
    setup do
      {:ok, capsule: %Capsule{}}
    end

    test "AUTHENTICATE returns {:ok, :not_implemented}", %{capsule: capsule} do
      assert GenServer.call(Router, {:authenticate, capsule}) == {:ok, :not_implemented}
    end

    test "NEGOTIATE returns {:ok, :not_implemented}", %{capsule: capsule} do
      assert GenServer.call(Router, {:negotiate, capsule}) == {:ok, :not_implemented}
    end

    test "READ returns {:ok, :not_implemented}", %{capsule: capsule} do
      assert GenServer.call(Router, {:read, capsule}) == {:ok, :not_implemented}
    end

    test "WRITE returns {:ok, :not_implemented}", %{capsule: capsule} do
      assert GenServer.call(Router, {:write, capsule}) == {:ok, :not_implemented}
    end

    test "SHARE returns {:ok, :not_implemented}", %{capsule: capsule} do
      assert GenServer.call(Router, {:share, capsule}) == {:ok, :not_implemented}
    end

    test "REVOKE returns {:ok, :not_implemented}", %{capsule: capsule} do
      assert GenServer.call(Router, {:revoke, capsule}) == {:ok, :not_implemented}
    end

    test "AUDIT returns {:ok, :not_implemented}", %{capsule: capsule} do
      assert GenServer.call(Router, {:audit, capsule}) == {:ok, :not_implemented}
    end
  end
end
