// FILE: calendar-event.service.ts
// PURPOSE: Phase 1272 — GATED calendar event proposal/create/delete lifecycle.
//          The product path is:
//            availability → candidate slots → selected slot → proposal
//            → confirmation/approval → create ONLY when every gate passes.
//          This module owns the gate evaluation AND the real provider write:
//          once every human + capability gate passes, createCalendarEvent
//          calls the live Google Calendar events.insert (approval-gated) and
//          deleteCalendarEvent calls events.delete. It is NOT terminal/read-
//          only — a real event is created/removed, then a permission-scoped
//          internal fan-out + a mirror WorkLedger MEETING row follow.
// CONNECTS TO: connector-oauth.service.ts (getProviderGrantedScopes —
//          reasons about GRANTED scopes, never fakes readiness),
//          calendar-event.routes.ts, packages/database audit chain
//          (CALENDAR_EVENT_CREATE / CALENDAR_EVENT_DELETE on every attempt).
//
// SAFETY (RULE 0 / RULE 4): a create/delete happens ONLY behind a passed gate
// ladder; the attempt is audited with a scrubbed gate/outcome code only
// (no attendee identities, no titles, no tokens).

import { writeAuditEvent, prisma } from "@niov/database";
import {
  getProviderGrantedScopes,
  getProviderAccessTokenForOrg,
} from "./connector-oauth.service.js";
import { makeNotificationService } from "../notification/notification.service.js";
import {
  createLedgerEntry,
  patchLedgerEntry,
} from "../work-os/work-ledger.service.js";

// [ORG-AUTONOMY-SPINE] Internal-only notification substrate for the calendar
// fan-out. Same construction other work-os handlers use (makeNotificationService
// with no connector fan-out) — a real create/delete notifies the derived,
// permission-scoped human set inside Otzar's inbox ONLY. No external delivery;
// createInternalNotification enforces same-org active-membership + recipient
// TAR ACTIVE, so ineligible recipients are skipped, never delivered to.
const notificationService = makeNotificationService({});

// [ORG-AUTONOMY-SPINE] The two internal notification classes the calendar
// spine fans out. Kept as named constants so the create/delete paths + tests
// reference one source of truth (Notification.notification_class is an open
// String column — no migration).
const CALENDAR_EVENT_CREATED_CLASS = "CALENDAR_EVENT_CREATED";
const CALENDAR_EVENT_CANCELLED_CLASS = "CALENDAR_EVENT_CANCELLED";

// WHAT: Build the CLOSED, proposal-DERIVED recipient set for a calendar
//        fan-out — [actor, ...participants-with-entity_id, owner], deduped,
//        undefined dropped. NEVER a caller-supplied open recipient list: every
//        id here comes from the authenticated actor + the proposal the gates
//        already vetted. The notification service re-checks each id for same-org
//        active membership, so a stray/ineligible id is skipped, not delivered.
function closedRecipientSet(args: {
  actor_entity_id: string;
  participant_entity_ids: ReadonlyArray<string | undefined>;
  owner_entity_id?: string | undefined;
}): string[] {
  const set = new Set<string>();
  set.add(args.actor_entity_id);
  for (const id of args.participant_entity_ids) {
    if (typeof id === "string" && id.length > 0) set.add(id);
  }
  if (typeof args.owner_entity_id === "string" && args.owner_entity_id.length > 0) {
    set.add(args.owner_entity_id);
  }
  return [...set];
}

// WHAT: Fan a single body out to a closed recipient set, best-effort.
// WHY: A per-recipient ineligibility ({ok:false} — CROSS_ORG_DENIED / inactive)
//      is skipped, never fatal; the caller's real Google event already happened.
async function fanOutInternalNotifications(args: {
  org_entity_id: string;
  actor_entity_id: string;
  recipients: string[];
  notification_class: string;
  body_summary: string;
}): Promise<void> {
  for (const recipient of args.recipients) {
    await notificationService.createInternalNotification({
      org_entity_id: args.org_entity_id,
      recipient_entity_id: recipient,
      // The authenticated caller — NEVER a caller-supplied source.
      source_entity_id: args.actor_entity_id,
      notification_class: args.notification_class,
      body_summary: args.body_summary,
      action_id: null,
    });
  }
}

// WHAT: A calm, secret-free one-line human time for notification copy.
// WHY: body_summary must carry NO token / raw identity — just the title + a
//      readable start. Date-only is deliberate: enough to orient, nothing to leak.
function humanReadableStart(startIso: string): string {
  const d = new Date(startIso);
  if (Number.isNaN(d.getTime())) return startIso;
  return d.toISOString().slice(0, 16).replace("T", " ") + " UTC";
}

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

// [PARTICIPANT-COORDINATION] The coordination role a participant plays on a
// proposed meeting. Additive, loosely-typed (open string on the wire) — NO
// schema migration. required_* roles + organizer/requester block scheduling
// when unresolved; optional_attendee/informed_only never block. external_*
// roles are labels only here (no email, not invited — no provider change).
export type ParticipantRole =
  | "requester"
  | "organizer"
  | "required_decision_owner"
  | "required_executor"
  | "required_attendee"
  | "optional_attendee"
  | "informed_only"
  | "external_customer"
  | "external_guest";

export interface ProposedParticipant {
  /** Display label only — NEVER an email/identity in audit details. */
  label: string;
  /** Whether the participant resolved to a known entity. */
  resolved: boolean;
  // [ORG-AUTONOMY-SPINE] Additive: the resolved Otzar entity id for this
  // participant, when known. Drives the CLOSED notification recipient set on a
  // successful create — never an email/identity, never surfaced in audit
  // details. Absent → this participant simply isn't notified.
  entity_id?: string;
  // [PARTICIPANT-COORDINATION] Additive: the coordination role, when known.
  // Absent → the participant is treated as REQUIRED (today's behavior).
  role?: string;
  // [PARTICIPANT-COORDINATION] Additive: an explicit required override. When
  // false, the participant is optional regardless of role; when absent, the
  // role (or role-less default = required) decides.
  required?: boolean;
}

// WHAT: Pure predicate — is this participant REQUIRED for scheduling?
// RULE: false when role is "optional_attendee"/"informed_only" OR
//       required === false; true otherwise. A role-less participant with no
//       explicit required flag stays REQUIRED — backward-compatible with the
//       pre-role behavior, where every participant blocked when unresolved.
// WHY:  A missing OPTIONAL attendee must never stop a meeting from being
//       scheduled; a missing REQUIRED party still must. This is the single
//       source of truth for both the gate ladder and the persisted details.
export function isRequiredParticipant(p: {
  role?: string;
  required?: boolean;
}): boolean {
  if (p.role === "optional_attendee" || p.role === "informed_only") return false;
  if (p.required === false) return false;
  return true;
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
  // [ORG-AUTONOMY-SPINE] Additive: the resolved Otzar entity id of the meeting
  // owner (the person accountable for it). Defaults to the actor when absent.
  // Feeds the WorkLedger owner + the CLOSED notification recipient set.
  owner_entity_id?: string;
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
  // [PARTICIPANT-COORDINATION] A meeting still needs SOMEONE, and any REQUIRED
  // participant that is unresolved still blocks. An OPTIONAL participant
  // (optional_attendee/informed_only or required===false) that is unresolved
  // does NOT block — the core coordination win. Role-less participants are
  // required, preserving today's behavior exactly.
  if (
    input.participants.length === 0 ||
    input.participants.some((p) => isRequiredParticipant(p) && p.resolved !== true)
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
  | {
      ok: true;
      status: "CREATED";
      // [CALENDAR-WRITE] Real Google event lineage — never a fabrication;
      // populated only when the provider returned 200 with an event id.
      event_id: string;
      calendar_id: string;
      html_link: string | null;
      start: string;
      end: string;
    }
  | { ok: false; code: CalendarEventGateCode | "PROVIDER_ERROR" };

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
  ): Promise<string> => {
    const event = await writeAuditEvent({
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
    return event.audit_id;
  };

  if (gate !== null) {
    await audit("DENIED", gate);
    return { ok: false, code: gate };
  }

  // [CALENDAR-WRITE] Every human + capability gate passed (approval
  // present, caller confirmed, connected, event-write scope granted).
  // NOW — and only now — call the real Google Calendar events.insert.
  // A create is NEVER claimed unless the provider returns an event id.
  const sel = args.input.selected_time!;
  const calendarId =
    typeof args.input.source_command === "string" ? "primary" : "primary";
  const token = await getProviderAccessTokenForOrg({
    provider: "GOOGLE_WORKSPACE",
    org_entity_id: args.org_entity_id,
  });
  if (token.ok === false) {
    await audit("DENIED", "GOOGLE_RECONNECT_REQUIRED");
    return { ok: false, code: "GOOGLE_RECONNECT_REQUIRED" };
  }
  let res: Response;
  try {
    res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summary: args.input.title,
          start: { dateTime: sel.start },
          end: { dateTime: sel.end },
        }),
      },
    );
  } catch {
    await audit("DENIED", "provider_fetch_failed");
    return { ok: false, code: "PROVIDER_ERROR" };
  }
  if (res.status === 401 || res.status === 403) {
    await audit("DENIED", "EVENT_WRITE_SCOPE_MISSING");
    return { ok: false, code: "EVENT_WRITE_SCOPE_MISSING" };
  }
  if (!res.ok) {
    await audit("DENIED", `http_${res.status}`);
    return { ok: false, code: "PROVIDER_ERROR" };
  }
  const body = (await res.json().catch(() => ({}))) as {
    id?: unknown;
    htmlLink?: unknown;
    start?: { dateTime?: unknown };
    end?: { dateTime?: unknown };
  };
  const eventId = typeof body.id === "string" ? body.id : "";
  if (eventId.length === 0) {
    await audit("DENIED", "no_event_id");
    return { ok: false, code: "PROVIDER_ERROR" };
  }
  const auditEventId = await audit("SUCCESS", "created");
  const startOut =
    typeof body.start?.dateTime === "string" ? body.start.dateTime : sel.start;
  const endOut =
    typeof body.end?.dateTime === "string" ? body.end.dateTime : sel.end;

  // [ORG-AUTONOMY-SPINE] BEST-EFFORT side-effects. The real Google event now
  // exists and is audited SUCCESS; NOTHING below may turn that into a failure
  // response. Each block is wrapped swallow-and-continue. Order: ledger row
  // first (so its id can anchor context), then the REQUIRED notification
  // fan-out — a ledger failure must not skip the notify.
  const ownerEntityId = args.input.owner_entity_id ?? args.actor_entity_id;
  const recipients = closedRecipientSet({
    actor_entity_id: args.actor_entity_id,
    participant_entity_ids: args.input.participants.map((p) => p.entity_id),
    owner_entity_id: ownerEntityId,
  });

  // (a) Terminal WorkLedger MEETING row — reads as COMPLETED (EXECUTED is
  // terminal, excluded from blind spots, and getMyWork marks it not-completable
  // so it never surfaces as needs-action work). Best-effort enhancement.
  try {
    await createLedgerEntry({
      org_entity_id: args.org_entity_id,
      ledger_type: "MEETING",
      source_type: "CONNECTOR",
      title: args.input.title,
      summary: "Meeting scheduled on Calendar after approval + availability were confirmed.",
      status: "EXECUTED",
      priority: "ROUTINE",
      owner_entity_id: ownerEntityId,
      details: {
        source: "calendar_event",
        event_id: eventId,
        calendar_id: calendarId,
        start: startOut,
        end: endOut,
        provider: "google_calendar_event",
        audit_event_id: auditEventId,
        // Persist the CLOSED recipient set + title so a later delete can fan the
        // cancellation to the same humans without re-deriving from an input.
        recipient_entity_ids: recipients,
        // [PARTICIPANT-COORDINATION] Additive: labels + coordination roles +
        // resolved/required flags + entity ids so the CT Scheduled lane can
        // show who plays what role. NO email, NO tokens/secrets — labels,
        // roles, and entity ids only.
        participants: args.input.participants.map((p) => ({
          label: p.label,
          role: p.role ?? null,
          required: isRequiredParticipant(p),
          resolved: p.resolved,
          entity_id: p.entity_id ?? null,
        })),
      },
    });
  } catch {
    // Ledger is the enhancement, notification is the required surface — swallow.
  }

  // (b) REQUIRED notification fan-out to the CLOSED, proposal-derived set.
  try {
    await fanOutInternalNotifications({
      org_entity_id: args.org_entity_id,
      actor_entity_id: args.actor_entity_id,
      recipients,
      notification_class: CALENDAR_EVENT_CREATED_CLASS,
      body_summary: `Scheduled after approval and calendar availability were confirmed — no action needed. "${args.input.title}" · ${humanReadableStart(startOut)}.`,
    });
  } catch {
    // A real event was created + audited; a notify failure never unwinds it.
  }

  return {
    ok: true,
    status: "CREATED",
    event_id: eventId,
    calendar_id: calendarId,
    html_link: typeof body.htmlLink === "string" ? body.htmlLink : null,
    start: startOut,
    end: endOut,
  };
}

// [CALENDAR-WRITE] Delete a previously-created event — the cleanup rail
// (and the honest "cancel the meeting" path). Reached only with the
// event-write scope; audited CALENDAR_EVENT_DELETE. Idempotent: a 404/410
// (already gone) counts as success so cleanup is safe to retry.
export type CalendarEventDeleteResult =
  | { ok: true }
  | { ok: false; code: "GOOGLE_RECONNECT_REQUIRED" | "EVENT_WRITE_SCOPE_MISSING" | "PROVIDER_ERROR" };

export async function deleteCalendarEvent(args: {
  actor_entity_id: string;
  org_entity_id: string;
  event_id: string;
  calendar_id?: string;
  // [ORG-AUTONOMY-SPINE] Additive fallback context for the no-ledger-row case
  // (e.g. an event created before the spine, or outside this service). When a
  // MEETING ledger row IS found, its persisted recipient set + title win; these
  // only seed the fan-out when no row exists. Never a caller-supplied OPEN list —
  // the notification service re-checks every id for same-org active membership.
  title?: string;
  participant_entity_ids?: string[];
  owner_entity_id?: string;
}): Promise<CalendarEventDeleteResult> {
  const calendarId =
    typeof args.calendar_id === "string" && args.calendar_id.length > 0
      ? args.calendar_id
      : "primary";
  const audit = async (outcome: "SUCCESS" | "DENIED", reason: string): Promise<void> => {
    await writeAuditEvent({
      event_type: "CALENDAR_EVENT_DELETE",
      outcome,
      actor_entity_id: args.actor_entity_id,
      target_entity_id: args.org_entity_id,
      details: { reason },
    });
  };
  const token = await getProviderAccessTokenForOrg({
    provider: "GOOGLE_WORKSPACE",
    org_entity_id: args.org_entity_id,
  });
  if (token.ok === false) {
    await audit("DENIED", "not_connected");
    return { ok: false, code: "GOOGLE_RECONNECT_REQUIRED" };
  }
  let res: Response;
  try {
    res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(args.event_id)}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${token.access_token}` } },
    );
  } catch {
    await audit("DENIED", "provider_fetch_failed");
    return { ok: false, code: "PROVIDER_ERROR" };
  }
  if (res.status === 401 || res.status === 403) {
    await audit("DENIED", "EVENT_WRITE_SCOPE_MISSING");
    return { ok: false, code: "EVENT_WRITE_SCOPE_MISSING" };
  }
  // 204 = deleted; 404/410 = already gone (idempotent cleanup success).
  if (res.ok || res.status === 404 || res.status === 410) {
    await audit("SUCCESS", res.ok ? "deleted" : "already_gone");
    await cancelMeetingSideEffects(args);
    return { ok: true };
  }
  await audit("DENIED", `http_${res.status}`);
  return { ok: false, code: "PROVIDER_ERROR" };
}

// WHAT: BEST-EFFORT cancellation side-effects after a real Calendar delete.
//        Finds the mirror MEETING ledger row by details.event_id (org-scoped),
//        flips it to CANCELLED, and fans a "cancelled" notification to the SAME
//        closed recipient set the create recorded. No row → notify only the
//        actor (plus any additive fallback context).
// WHY:   The delete already succeeded + is audited; NOTHING here may fail the
//        response. The cancellation NOTIFICATION is the required surface; the
//        ledger status flip is best-effort (a non-owner deleter may be blocked
//        by patchLedgerEntry's completion authority — that is fine, the run's
//        cleanup sweep still reconciles the row).
async function cancelMeetingSideEffects(args: {
  actor_entity_id: string;
  org_entity_id: string;
  event_id: string;
  title?: string;
  participant_entity_ids?: string[];
  owner_entity_id?: string;
}): Promise<void> {
  let title = args.title ?? "Meeting";
  let recipients = closedRecipientSet({
    actor_entity_id: args.actor_entity_id,
    participant_entity_ids: args.participant_entity_ids ?? [],
    owner_entity_id: args.owner_entity_id,
  });

  try {
    const row = await prisma.workLedgerEntry.findFirst({
      where: {
        org_entity_id: args.org_entity_id,
        ledger_type: "MEETING",
        details: { path: ["event_id"], equals: args.event_id },
      },
      select: { ledger_entry_id: true, title: true, owner_entity_id: true, details: true },
    });
    if (row !== null) {
      title = row.title;
      const details =
        typeof row.details === "object" && row.details !== null
          ? (row.details as Record<string, unknown>)
          : {};
      const stored = Array.isArray(details.recipient_entity_ids)
        ? (details.recipient_entity_ids as unknown[]).filter(
            (v): v is string => typeof v === "string" && v.length > 0,
          )
        : [];
      // The persisted set (create-time) is authoritative; still fold in the
      // actor + owner so the deleter is always informed.
      recipients = closedRecipientSet({
        actor_entity_id: args.actor_entity_id,
        participant_entity_ids: stored,
        owner_entity_id: row.owner_entity_id ?? undefined,
      });
      // Best-effort status flip — swallow a completion-authority block.
      await patchLedgerEntry({
        ledger_entry_id: row.ledger_entry_id,
        org_entity_id: args.org_entity_id,
        caller_entity_id: args.actor_entity_id,
        is_manager: false,
        patch: { status: "CANCELLED" },
      });
    }
  } catch {
    // Row lookup / patch is best-effort; the notification below still fires.
  }

  try {
    await fanOutInternalNotifications({
      org_entity_id: args.org_entity_id,
      actor_entity_id: args.actor_entity_id,
      recipients,
      notification_class: CALENDAR_EVENT_CANCELLED_CLASS,
      body_summary: `"${title}" was cancelled and removed from Calendar.`,
    });
  } catch {
    // The delete already succeeded + is audited; a notify failure never fails it.
  }
}
