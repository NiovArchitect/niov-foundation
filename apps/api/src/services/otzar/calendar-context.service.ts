// FILE: calendar-context.service.ts
// PURPOSE: Phase 1236 — calendar-aware quiet-mode context. Tells the
//          ambient shell whether voice is appropriate RIGHT NOW for
//          the caller, and what meeting context surrounds them.
//
//          Credential-free by design: until real Google/Microsoft
//          calendar clients land, the meeting signal comes from REAL
//          Foundation substrate — the caller's own MeetingCapture
//          rows whose scheduled window contains "now" — plus an
//          honest demo fixture (MOCK_CALENDAR_FIXTURE env) for
//          FOCUS_TIME demos. Real calendar providers plug into this
//          same response shape later (provider_mode flips from
//          MOCK_CALENDAR to *_CONFIGURED when credentials exist).
//
// SAFETY POSTURE (RULE 0):
//   - title_summary only (bounded) — never calendar bodies, notes,
//     transcripts, or attendee emails.
//   - has_external_participants is a boolean, never a list.
//   - Caller-scoped: only the caller's own captures are consulted.
//   - Passive polling is NOT audited (read-side noise policy — same
//     posture as my-twin/context-health).
//
// CONNECTS TO:
//   - apps/api/src/routes/otzar-calendar-context.routes.ts
//   - apps/api/src/services/connectors/connector-adapter-registry.ts
//     (credential envs for GOOGLE_WORKSPACE / MICROSOFT_365)
//   - otzar-control-tower AmbientOtzarBar (auto quiet mode consumer)
//   - tests/unit/calendar-context.test.ts +
//     tests/integration/calendar-context.test.ts

import { prisma } from "@niov/database";
import { getOrgEntityId } from "../governance/org.js";

export type CalendarProviderMode =
  | "MOCK_CALENDAR"
  | "GOOGLE_CALENDAR_CONFIGURED"
  | "MICROSOFT_CALENDAR_CONFIGURED"
  | "BLOCKED_BY_CREDENTIALS"
  | "ERROR";

export type QuietReason =
  | "IN_MEETING"
  | "PRESENTING"
  | "FOCUS_TIME"
  | "OUTSIDE_WORK_HOURS"
  | "USER_PREFERENCE"
  | "NONE";

export type CaptureAllowedStatus =
  | "ALLOWED"
  | "NEEDS_CONSENT"
  | "BLOCKED"
  | "UNKNOWN";

export interface CalendarContextView {
  provider_mode: CalendarProviderMode;
  quiet_recommended: boolean;
  quiet_reason: QuietReason;
  current_event?: {
    title_summary: string;
    starts_at: string;
    ends_at: string;
    meeting_provider?: "GOOGLE_MEET" | "ZOOM" | "MICROSOFT_TEAMS" | "OTHER";
    has_external_participants: boolean;
    capture_allowed_status: CaptureAllowedStatus;
  };
  next_event?: {
    title_summary: string;
    starts_at: string;
    prep_recommended: boolean;
  };
}

type Failure = { ok: false; code: string };

const TITLE_MAX = 80;
/** "Prep recommended" window before the next scheduled meeting. */
const PREP_WINDOW_MS = 2 * 60 * 60 * 1000;
/** How far ahead next_event looks. */
const LOOKAHEAD_MS = 24 * 60 * 60 * 1000;

// ─── pure helpers (unit-tested; no DB) ───────────────────────

// WHAT: Resolve the provider mode from credential envs.
// INPUT: env (injectable for tests).
// OUTPUT: CalendarProviderMode.
// WHY: Honest readiness: *_CONFIGURED means credentials exist (the
//      real client is a follow-on); MOCK_CALENDAR means the
//      substrate-driven mock path is serving context today.
export function resolveProviderMode(
  env: Record<string, string | undefined> = process.env,
): CalendarProviderMode {
  const googleReady =
    typeof env.GOOGLE_OAUTH_CLIENT_ID === "string" &&
    env.GOOGLE_OAUTH_CLIENT_ID.length > 0 &&
    typeof env.GOOGLE_OAUTH_CLIENT_SECRET === "string" &&
    env.GOOGLE_OAUTH_CLIENT_SECRET.length > 0;
  if (googleReady) return "GOOGLE_CALENDAR_CONFIGURED";
  const msReady =
    typeof env.MICROSOFT_GRAPH_CLIENT_ID === "string" &&
    env.MICROSOFT_GRAPH_CLIENT_ID.length > 0 &&
    typeof env.MICROSOFT_GRAPH_CLIENT_SECRET === "string" &&
    env.MICROSOFT_GRAPH_CLIENT_SECRET.length > 0;
  if (msReady) return "MICROSOFT_CALENDAR_CONFIGURED";
  return "MOCK_CALENDAR";
}

// WHAT: Map MeetingCapture provider → the safe closed vocab.
export function mapMeetingProvider(
  provider: string,
): "GOOGLE_MEET" | "ZOOM" | "MICROSOFT_TEAMS" | "OTHER" {
  if (
    provider === "GOOGLE_MEET" ||
    provider === "ZOOM" ||
    provider === "MICROSOFT_TEAMS"
  ) {
    return provider;
  }
  return "OTHER";
}

// WHAT: Derive capture-consent status from participant consent rows.
// INPUT: consent_state strings of the meeting's participants.
// OUTPUT: CaptureAllowedStatus.
// WHY: Quiet mode + capture affordances need one safe label, not the
//      participant list.
export function deriveCaptureAllowed(
  consentStates: ReadonlyArray<string>,
): CaptureAllowedStatus {
  if (consentStates.length === 0) return "UNKNOWN";
  if (consentStates.includes("NOT_CONSENTED")) return "BLOCKED";
  if (consentStates.includes("PENDING")) return "NEEDS_CONSENT";
  return "ALLOWED";
}

export function summarizeTitle(title: string): string {
  const trimmed = title.trim();
  return trimmed.length <= TITLE_MAX
    ? trimmed
    : `${trimmed.slice(0, TITLE_MAX - 1)}…`;
}

// ─── service ─────────────────────────────────────────────────

export async function getCalendarContextForCaller(
  callerEntityId: string,
  now: Date = new Date(),
): Promise<{ ok: true; context: CalendarContextView } | Failure> {
  let orgEntityId: string;
  try {
    orgEntityId = await getOrgEntityId(callerEntityId);
  } catch {
    return { ok: false, code: "NO_ORG_FOR_CALLER" };
  }

  const provider_mode = resolveProviderMode();

  // Demo fixture for states the capture substrate can't express yet
  // (focus time / user preference). Honest: env-driven, never
  // pretending to be a real calendar.
  const fixture = process.env.MOCK_CALENDAR_FIXTURE;
  if (fixture === "FOCUS_TIME" || fixture === "USER_PREFERENCE") {
    return {
      ok: true,
      context: {
        provider_mode,
        quiet_recommended: true,
        quiet_reason: fixture,
      },
    };
  }

  // REAL substrate signal: the caller's own meeting whose scheduled
  // window contains now.
  const currentMeeting = await prisma.meetingCapture.findFirst({
    where: {
      org_entity_id: orgEntityId,
      captured_by_entity_id: callerEntityId,
      deleted_at: null,
      scheduled_start: { lte: now },
      scheduled_end: { gte: now },
    },
    orderBy: { scheduled_start: "desc" },
    include: {
      participants: {
        where: { deleted_at: null },
        select: { external_collaborator_id: true, consent_state: true },
      },
    },
  });

  const nextMeeting = await prisma.meetingCapture.findFirst({
    where: {
      org_entity_id: orgEntityId,
      captured_by_entity_id: callerEntityId,
      deleted_at: null,
      scheduled_start: {
        gt: now,
        lte: new Date(now.getTime() + LOOKAHEAD_MS),
      },
    },
    orderBy: { scheduled_start: "asc" },
    select: { title: true, scheduled_start: true },
  });

  const context: CalendarContextView = {
    provider_mode,
    quiet_recommended: currentMeeting !== null,
    quiet_reason: currentMeeting !== null ? "IN_MEETING" : "NONE",
  };

  if (
    currentMeeting !== null &&
    currentMeeting.scheduled_start !== null &&
    currentMeeting.scheduled_end !== null
  ) {
    context.current_event = {
      title_summary: summarizeTitle(currentMeeting.title),
      starts_at: currentMeeting.scheduled_start.toISOString(),
      ends_at: currentMeeting.scheduled_end.toISOString(),
      meeting_provider: mapMeetingProvider(currentMeeting.provider),
      has_external_participants: currentMeeting.participants.some(
        (p) => p.external_collaborator_id !== null,
      ),
      capture_allowed_status: deriveCaptureAllowed(
        currentMeeting.participants.map((p) => p.consent_state),
      ),
    };
  }

  if (nextMeeting !== null && nextMeeting.scheduled_start !== null) {
    context.next_event = {
      title_summary: summarizeTitle(nextMeeting.title),
      starts_at: nextMeeting.scheduled_start.toISOString(),
      prep_recommended:
        nextMeeting.scheduled_start.getTime() - now.getTime() <=
        PREP_WINDOW_MS,
    };
  }

  return { ok: true, context };
}
