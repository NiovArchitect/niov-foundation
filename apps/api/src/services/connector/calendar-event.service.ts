// FILE: calendar-event.service.ts
// PURPOSE: Phase 1272 — GATED calendar event proposal/create lifecycle.
//          The product path is:
//            availability → candidate slots → selected slot → proposal
//            → confirmation/approval → create ONLY when every gate passes.
//          This module owns the gate evaluation. It DOES NOT auto-create
//          events: the event-write scope gate is terminal today (Otzar's
//          Google token is calendar-read-only), so createCalendarEvent
//          always returns a precise blocker and NEVER calls the provider.
// CONNECTS TO: connector-oauth.service.ts (getProviderGrantedScopes —
//          reasons about GRANTED scopes, never fakes readiness),
//          calendar-event.routes.ts, packages/database audit chain
//          (CALENDAR_EVENT_CREATE on every create attempt).
//
// SAFETY (RULE 0 / RULE 4): no event is ever created here; no invite is
// sent; the create attempt is audited with a scrubbed gate code only
// (no attendee identities, no titles, no tokens).

import { writeAuditEvent } from "@niov/database";
import { getProviderGrantedScopes } from "./connector-oauth.service.js";

// Scopes that would permit creating/managing calendar events. Preferred
// future path is the narrowest that works: calendar.app.created (events
// only on app-owned calendars) or calendar.events (events on the user's
// calendar). Broad `calendar` (see/edit/share/DELETE all) is accepted
// here only because it is a superset — it is NOT requested by default.
const EVENT_WRITE_SCOPES: ReadonlyArray<string> = [
  "https://www.googleapis.com/auth/calendar.app.created",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar",
];

export type CalendarEventGateCode =
  | "NEEDS_SELECTED_TIME"
  | "PARTICIPANT_UNRESOLVED"
  | "NEEDS_PARTICIPANT_CONFIRMATION"
  | "NEEDS_APPROVAL"
  | "NEEDS_CALLER_CONFIRMATION"
  | "POLICY_BLOCKED"
  | "GOOGLE_RECONNECT_REQUIRED"
  | "EVENT_WRITE_SCOPE_MISSING"
  | "CALENDAR_PROVIDER_UNAVAILABLE";

export type CalendarEventStatus =
  | "DRAFT"
  | "NEEDS_SELECTED_TIME"
  | "NEEDS_PARTICIPANT_CONFIRMATION"
  | "NEEDS_APPROVAL"
  | "NEEDS_CALLER_CONFIRMATION"
  | "BLOCKED_BY_POLICY"
  | "SCOPE_REAUTH_REQUIRED"
  | "READY_TO_CREATE"
  | "CREATED"
  | "CANCELLED";

export interface SelectedTime {
  start: string;
  end: string;
}

export interface ProposedParticipant {
  /** Display label only — NEVER an email/identity in audit details. */
  label: string;
  /** Whether the participant resolved to a known entity. */
  resolved: boolean;
}

export interface CalendarEventProposalInput {
  title: string;
  participants: ProposedParticipant[];
  selected_time?: SelectedTime | null;
  candidate_windows?: string[];
  duration_minutes?: number;
  source_command?: string;
  prerequisite?: string | null;
  participant_confirmations_satisfied?: boolean;
  requires_approval?: boolean;
  approved?: boolean;
  caller_confirmed?: boolean;
  policy_blocked?: boolean;
}

export interface CalendarEventProposalView {
  status: CalendarEventStatus;
  /** The single most-blocking gate, or null when READY_TO_CREATE. */
  blocker: CalendarEventGateCode | null;
  /** Whether a concrete time has been selected. */
  has_selected_time: boolean;
  participant_count: number;
  unresolved_participant_count: number;
}

// WHAT: Pure gate ladder — the first unmet gate, in priority order.
// INPUT: a proposal + whether the Google token grants event-write.
// OUTPUT: the blocking gate code, or null when every gate is satisfied.
// WHY: One canonical ordering shared by propose (status preview) and
//      create (hard enforcement) so the UI and the executor never
//      disagree. Pure + deterministic → trivially testable.
export function firstUnmetGate(
  input: CalendarEventProposalInput,
  tokenGrantsEventWrite: boolean,
  isConnected: boolean,
): CalendarEventGateCode | null {
  if (input.policy_blocked === true) return "POLICY_BLOCKED";
  const sel = input.selected_time;
  if (sel === undefined || sel === null || sel.start.length === 0) {
    return "NEEDS_SELECTED_TIME";
  }
  if (
    input.participants.length === 0 ||
    input.participants.some((p) => p.resolved === false)
  ) {
    return "PARTICIPANT_UNRESOLVED";
  }
  if (input.participant_confirmations_satisfied === false) {
    return "NEEDS_PARTICIPANT_CONFIRMATION";
  }
  if (input.requires_approval === true && input.approved !== true) {
    return "NEEDS_APPROVAL";
  }
  if (input.caller_confirmed !== true) {
    return "NEEDS_CALLER_CONFIRMATION";
  }
  // Capability gates last: only reached once the human-side gates pass.
  if (!isConnected) return "GOOGLE_RECONNECT_REQUIRED";
  if (!tokenGrantsEventWrite) return "EVENT_WRITE_SCOPE_MISSING";
  return null;
}

function statusForGate(
  gate: CalendarEventGateCode | null,
): CalendarEventStatus {
  switch (gate) {
    case null:
      return "READY_TO_CREATE";
    case "POLICY_BLOCKED":
      return "BLOCKED_BY_POLICY";
    case "NEEDS_SELECTED_TIME":
    case "PARTICIPANT_UNRESOLVED":
      return "NEEDS_SELECTED_TIME";
    case "NEEDS_PARTICIPANT_CONFIRMATION":
      return "NEEDS_PARTICIPANT_CONFIRMATION";
    case "NEEDS_APPROVAL":
      return "NEEDS_APPROVAL";
    case "NEEDS_CALLER_CONFIRMATION":
      return "NEEDS_CALLER_CONFIRMATION";
    case "GOOGLE_RECONNECT_REQUIRED":
    case "EVENT_WRITE_SCOPE_MISSING":
    case "CALENDAR_PROVIDER_UNAVAILABLE":
      return "SCOPE_REAUTH_REQUIRED";
  }
}

function grantsEventWrite(scopes: string[]): boolean {
  return scopes.some((s) => EVENT_WRITE_SCOPES.includes(s));
}

// WHAT: Preview a proposal's lifecycle status (no side effects, no
//        provider call). Reflects the event-write capability honestly.
// INPUT: proposal + org (to read granted scopes).
// OUTPUT: a SAFE proposal view (status + blocker + counts).
// WHY: The card shows where the proposal sits without attempting a
//      create. Reading granted scopes keeps "Ready to create" honest —
//      it never claims readiness the token can't back.
export async function proposeCalendarEvent(args: {
  org_entity_id: string;
  input: CalendarEventProposalInput;
}): Promise<CalendarEventProposalView> {
  const scopes = await getProviderGrantedScopes({
    provider: "GOOGLE_WORKSPACE",
    org_entity_id: args.org_entity_id,
  });
  const isConnected = scopes !== null;
  const gate = firstUnmetGate(
    args.input,
    isConnected && grantsEventWrite(scopes),
    isConnected,
  );
  return {
    status: statusForGate(gate),
    blocker: gate,
    has_selected_time:
      args.input.selected_time !== undefined &&
      args.input.selected_time !== null &&
      args.input.selected_time.start.length > 0,
    participant_count: args.input.participants.length,
    unresolved_participant_count: args.input.participants.filter(
      (p) => p.resolved === false,
    ).length,
  };
}

export type CalendarEventCreateResult =
  | { ok: true; status: "CREATED" }
  | { ok: false; code: CalendarEventGateCode };

// WHAT: Attempt to create the event — HARD gate enforcement.
// INPUT: proposal + caller/org identity (+ idempotency handled by route).
// OUTPUT: { ok:false; code } for any unmet gate; { ok:true } only if an
//         event was actually created.
// WHY: This is the single chokepoint that guarantees "no auto-create".
//      Today every path ends in a blocker — the token is read-only, so
//      the event-write gate (or the unimplemented-runtime guard) stops
//      it before any provider call. The attempt is audited either way.
export async function createCalendarEvent(args: {
  actor_entity_id: string;
  org_entity_id: string;
  input: CalendarEventProposalInput;
}): Promise<CalendarEventCreateResult> {
  const scopes = await getProviderGrantedScopes({
    provider: "GOOGLE_WORKSPACE",
    org_entity_id: args.org_entity_id,
  });
  const isConnected = scopes !== null;
  const gate = firstUnmetGate(
    args.input,
    isConnected && grantsEventWrite(scopes),
    isConnected,
  );

  const audit = async (
    outcome: "SUCCESS" | "DENIED",
    reason: string,
  ): Promise<void> => {
    await writeAuditEvent({
      event_type: "CALENDAR_EVENT_CREATE",
      outcome,
      actor_entity_id: args.actor_entity_id,
      target_entity_id: args.org_entity_id,
      details: {
        reason,
        participant_count: args.input.participants.length,
        has_selected_time:
          args.input.selected_time !== undefined &&
          args.input.selected_time !== null,
      },
    });
  };

  if (gate !== null) {
    await audit("DENIED", gate);
    return { ok: false, code: gate };
  }

  // All human + scope gates passed. The actual provider create runtime
  // is intentionally NOT implemented in Phase 1272 — we never fabricate
  // a creation. Block honestly so nothing is faked as executed.
  await audit("DENIED", "CALENDAR_PROVIDER_UNAVAILABLE");
  return { ok: false, code: "CALENDAR_PROVIDER_UNAVAILABLE" };
}
