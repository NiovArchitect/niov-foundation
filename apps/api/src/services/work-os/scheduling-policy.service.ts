// FILE: scheduling-policy.service.ts
// PURPOSE: [ORG-SUBSTRATE] The deterministic scheduling-policy engine —
//          the time/working-hours half of the org operating substrate.
//          PURE functions only (no I/O): given the org timezone, each
//          attendee's timezone, and a proposed meeting window, it
//          renders every attendee's LOCAL time and verdicts the
//          proposal against the working-time policy:
//            - default working hours 09:00–17:30, Monday–Friday
//            - default lunch/protected block 12:00–13:00 local
//          Violations are named per person in human words, and a
//          conforming alternative is suggested when one exists that day.
//          PROPOSAL-ONLY BY DOCTRINE: nothing here creates events —
//          calendar creation requires a connected calendar connector,
//          which does not exist yet (Google Calendar is an OAuth
//          descriptor only). Consumers must say "proposed", never
//          "scheduled", until a verified connector performs the write.
//          Working hours/lunch are POLICY DEFAULTS here (no schema
//          exists for per-person hours — deliberately deferred; the
//          engine accepts overrides per attendee so fixtures and future
//          storage plug in without changes).
// CONNECTS TO: EntityProfile.timezone (person + org-entity timezones),
//          the org operating-profile route, the Redwood Atlas
//          simulation harness, tests/integration/work-profile.test.ts.

export interface WorkingPolicy {
  /** Minutes from local midnight — 9:00 = 540. */
  work_start_min: number;
  /** 17:30 = 1050. */
  work_end_min: number;
  /** 12:00 = 720. */
  lunch_start_min: number;
  /** 13:00 = 780. */
  lunch_end_min: number;
  /** ISO weekday numbers that are working days (1=Mon … 7=Sun). */
  working_days: ReadonlyArray<number>;
}

export const DEFAULT_WORKING_POLICY: WorkingPolicy = {
  work_start_min: 9 * 60,
  work_end_min: 17 * 60 + 30,
  lunch_start_min: 12 * 60,
  lunch_end_min: 13 * 60,
  working_days: [1, 2, 3, 4, 5],
};

export interface SchedulingAttendee {
  name: string;
  /** IANA timezone, e.g. "America/Los_Angeles". */
  timezone: string;
  /** Optional per-person override — future storage / fixtures plug in here. */
  policy?: WorkingPolicy;
}

export interface AttendeeVerdict {
  name: string;
  timezone: string;
  /** e.g. "9:00 AM PDT" — always timezone-labeled. */
  local_time_label: string;
  ok: boolean;
  /** Human reason when not ok. */
  violation?: "outside working hours" | "during their lunch block" | "not a working day";
}

export interface SchedulingVerdict {
  ok: boolean;
  attendees: AttendeeVerdict[];
  /** One human sentence naming every conflict, empty when ok. */
  conflict_summary: string;
  /** A conforming same-day alternative start (ISO, org timezone) when one
   *  exists; null when no slot fits everyone that day. */
  suggested_alternative_iso: string | null;
  /** Doctrine string consumers must surface: proposal-only until a
   *  calendar connector exists. */
  proposal_note: string;
}

export const SCHEDULING_PROPOSAL_NOTE =
  "Proposed times only — creating calendar events requires a connected calendar, which isn't set up yet.";

// Minutes-from-midnight + weekday of an instant, in a target timezone.
function localParts(dateIso: string, timezone: string): { minutes: number; isoWeekday: number; label: string } {
  const date = new Date(dateIso);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    weekday: "short",
    timeZoneName: "short",
  });
  const parts = fmt.formatToParts(date);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? "";
  const hour12 = Number(get("hour"));
  const minute = Number(get("minute"));
  const dayPeriod = get("dayPeriod").toUpperCase();
  const hour24 = dayPeriod === "PM" && hour12 !== 12 ? hour12 + 12 : dayPeriod === "AM" && hour12 === 12 ? 0 : hour12;
  const weekdayName = get("weekday");
  const isoWeekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(weekdayName) + 1;
  const label = `${hour12}:${get("minute")} ${dayPeriod} ${get("timeZoneName")}`;
  return { minutes: hour24 * 60 + minute, isoWeekday, label };
}

function verdictFor(
  attendee: SchedulingAttendee,
  startIso: string,
  durationMin: number,
): AttendeeVerdict {
  const policy = attendee.policy ?? DEFAULT_WORKING_POLICY;
  const start = localParts(startIso, attendee.timezone);
  const endMinutes = start.minutes + durationMin;
  const base: Omit<AttendeeVerdict, "ok" | "violation"> = {
    name: attendee.name,
    timezone: attendee.timezone,
    local_time_label: start.label,
  };
  if (!policy.working_days.includes(start.isoWeekday)) {
    return { ...base, ok: false, violation: "not a working day" };
  }
  if (start.minutes < policy.work_start_min || endMinutes > policy.work_end_min) {
    return { ...base, ok: false, violation: "outside working hours" };
  }
  // Overlap with the lunch/protected block.
  if (start.minutes < policy.lunch_end_min && endMinutes > policy.lunch_start_min) {
    return { ...base, ok: false, violation: "during their lunch block" };
  }
  return { ...base, ok: true };
}

/** Evaluate one proposed meeting window against everyone's local policy. */
export function evaluateMeetingProposal(args: {
  start_iso: string;
  duration_min: number;
  attendees: SchedulingAttendee[];
  /** The org timezone — alternatives are expressed in it. */
  org_timezone: string;
}): SchedulingVerdict {
  const attendees = args.attendees.map((a) => verdictFor(a, args.start_iso, args.duration_min));
  const conflicts = attendees.filter((a) => !a.ok);
  const summary =
    conflicts.length === 0
      ? ""
      : conflicts
          .map((c) => `${c.name}: ${c.local_time_label} is ${c.violation}`)
          .join("; ");

  // Same-day alternative: walk 30-min steps across the org day and take
  // the first start that works for everyone.
  let alternative: string | null = null;
  if (conflicts.length > 0) {
    const start = new Date(args.start_iso);
    const dayStart = new Date(start);
    dayStart.setUTCHours(0, 0, 0, 0);
    for (let step = 0; step < 48; step++) {
      const candidate = new Date(dayStart.getTime() + step * 30 * 60_000);
      // Skip candidates before "now-of-proposal" day boundary logic —
      // deterministic sweep is fine: we only need policy conformance.
      const candidateIso = candidate.toISOString();
      const all = args.attendees.map((a) => verdictFor(a, candidateIso, args.duration_min));
      if (all.every((a) => a.ok)) {
        alternative = candidateIso;
        break;
      }
    }
  }

  return {
    ok: conflicts.length === 0,
    attendees,
    conflict_summary: summary,
    suggested_alternative_iso: alternative,
    proposal_note: SCHEDULING_PROPOSAL_NOTE,
  };
}
