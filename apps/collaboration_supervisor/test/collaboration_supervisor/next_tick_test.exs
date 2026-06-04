defmodule CollaborationSupervisor.NextTickTest do
  use ExUnit.Case, async: true

  alias CollaborationSupervisor.NextTick

  describe "derive/2" do
    test "blocked flag forces :none regardless of state" do
      for s <- [:requested, :accepted, :in_progress, :needs_approval, :completed] do
        assert NextTick.derive(s, true) == :none
      end
    end

    test "blocked state forces :none" do
      assert NextTick.derive(:blocked, false) == :none
    end

    test "requested -> await_target_accept" do
      assert NextTick.derive(:requested, false) == :await_target_accept
    end

    test "accepted/in_progress -> await_target_response" do
      assert NextTick.derive(:accepted, false) == :await_target_response
      assert NextTick.derive(:in_progress, false) == :await_target_response
    end

    test "needs_approval -> await_approval" do
      assert NextTick.derive(:needs_approval, false) == :await_approval
    end

    test "terminal states -> terminal_no_action" do
      for s <- [:completed, :rejected, :expired, :canceled] do
        assert NextTick.derive(s, false) == :terminal_no_action
      end
    end
  end

  describe "parse_state/1" do
    test "round-trips every render value" do
      atoms = [
        :requested,
        :accepted,
        :needs_approval,
        :blocked,
        :in_progress,
        :completed,
        :rejected,
        :expired,
        :canceled
      ]

      for atom <- atoms do
        rendered = NextTick.render_state(atom)
        assert {:ok, ^atom} = NextTick.parse_state(rendered)
      end
    end

    test "unknown literal returns :error" do
      assert :error = NextTick.parse_state("NOT_A_STATE")
    end
  end

  describe "render_next_tick/1" do
    test "covers every next_tick atom" do
      ticks = [
        :none,
        :await_target_accept,
        :await_target_response,
        :await_requester_complete,
        :await_approval,
        :resurface_to_requester,
        :terminal_no_action
      ]

      for tick <- ticks do
        rendered = NextTick.render_next_tick(tick)
        assert is_binary(rendered)
        assert rendered =~ ~r/^[A-Z_]+$/
      end
    end
  end
end
