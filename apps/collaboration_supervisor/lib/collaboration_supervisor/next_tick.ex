defmodule CollaborationSupervisor.NextTick do
  @moduledoc """
  Pure mapping from `TwinCollaborationState` -> the closed-vocab
  `next_tick` value the TS wrapper validator at
  apps/api/src/services/coordination/beam-collaboration-supervisor.service.ts
  (`validateBeamResponse`) accepts.

  Mirrors the TS `deriveNextTickForState/2` function byte-for-byte so
  the TS validator and the BEAM service agree on what each state
  implies.

  This module is **pure**. No GenServer. No ETS. No process state.
  Per ADR-0034 Sub-decision 1 + Elixir hexdocs "anti-pattern: GenServer
  wrapping stateless logic".
  """

  @type state ::
          :requested
          | :accepted
          | :needs_approval
          | :blocked
          | :in_progress
          | :completed
          | :rejected
          | :expired
          | :canceled

  @type next_tick ::
          :none
          | :await_target_accept
          | :await_target_response
          | :await_requester_complete
          | :await_approval
          | :resurface_to_requester
          | :terminal_no_action

  @doc "Derive the next-tick value from a collaboration state + blocked flag."
  @spec derive(state(), boolean()) :: next_tick()
  def derive(_state, true), do: :none
  def derive(:blocked, _has_blocked), do: :none
  def derive(:requested, _), do: :await_target_accept
  def derive(:accepted, _), do: :await_target_response
  def derive(:in_progress, _), do: :await_target_response
  def derive(:needs_approval, _), do: :await_approval
  def derive(:completed, _), do: :terminal_no_action
  def derive(:rejected, _), do: :terminal_no_action
  def derive(:expired, _), do: :terminal_no_action
  def derive(:canceled, _), do: :terminal_no_action

  @doc """
  Parse the incoming state string (the TS wrapper sends Prisma's
  ALL_CAPS literal like `"REQUESTED"`) into the internal atom form.
  Returns `{:ok, atom}` or `:error` if the value isn't a known state.
  """
  @spec parse_state(binary()) :: {:ok, state()} | :error
  def parse_state("REQUESTED"), do: {:ok, :requested}
  def parse_state("ACCEPTED"), do: {:ok, :accepted}
  def parse_state("NEEDS_APPROVAL"), do: {:ok, :needs_approval}
  def parse_state("BLOCKED"), do: {:ok, :blocked}
  def parse_state("IN_PROGRESS"), do: {:ok, :in_progress}
  def parse_state("COMPLETED"), do: {:ok, :completed}
  def parse_state("REJECTED"), do: {:ok, :rejected}
  def parse_state("EXPIRED"), do: {:ok, :expired}
  def parse_state("CANCELED"), do: {:ok, :canceled}
  def parse_state(_), do: :error

  @doc "Render the internal state atom back to the TS wrapper's ALL_CAPS literal."
  @spec render_state(state()) :: binary()
  def render_state(:requested), do: "REQUESTED"
  def render_state(:accepted), do: "ACCEPTED"
  def render_state(:needs_approval), do: "NEEDS_APPROVAL"
  def render_state(:blocked), do: "BLOCKED"
  def render_state(:in_progress), do: "IN_PROGRESS"
  def render_state(:completed), do: "COMPLETED"
  def render_state(:rejected), do: "REJECTED"
  def render_state(:expired), do: "EXPIRED"
  def render_state(:canceled), do: "CANCELED"

  @doc "Render the internal next-tick atom back to the TS validator's ALL_CAPS literal."
  @spec render_next_tick(next_tick()) :: binary()
  def render_next_tick(:none), do: "NONE"
  def render_next_tick(:await_target_accept), do: "AWAIT_TARGET_ACCEPT"
  def render_next_tick(:await_target_response), do: "AWAIT_TARGET_RESPONSE"
  def render_next_tick(:await_requester_complete), do: "AWAIT_REQUESTER_COMPLETE"
  def render_next_tick(:await_approval), do: "AWAIT_APPROVAL"
  def render_next_tick(:resurface_to_requester), do: "RESURFACE_TO_REQUESTER"
  def render_next_tick(:terminal_no_action), do: "TERMINAL_NO_ACTION"
end
