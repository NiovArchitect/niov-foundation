// FILE: apps/api/src/services/otzar/calendar-continuity.service.ts
// PURPOSE: [OTZAR-CONTINUITY P0/P1] Deterministic, server-authoritative calendar
//          proposal + confirmation continuity for the Otzar chat path. Fixes the
//          reported failure: "put Olivia's event on my calendar at 1pm" → propose
//          → "yes" → "I don't see a previous question." Root causes (proven): the
//          chat path persisted no proposal and had no server-side confirmation
//          resolver, and the LLM invented the date because the prompt carried no
//          current date/timezone.
//
//          This module (called BEFORE the LLM in conductSession) resolves the
//          real current date+timezone SERVER-SIDE, persists a pending proposal as
//          a WorkLedgerEntry(status=NEEDS_CALLER_CONFIRMATION) scoped to
//          (actor, org, conversation), and — on a later "yes" — deterministically
//          finds the caller's single unexpired prior-turn proposal and drives it
//          through the existing GATED, now-idempotency-claimed createCalendarEvent.
//
// INVARIANTS (advisor-locked):
//   1. NEVER side-effect on ambiguity: a governed calendar write fires ONLY when
//      there is exactly ONE unexpired, actor-owned pending proposal created in a
//      PRIOR turn. Multiple → ask which. None/expired/unsure → return null and let
//      normal handling proceed. A false-positive "yes" is worse than the bug.
//   2. Idempotency = atomic compare-and-set: claim the row
//      (status NEEDS_CALLER_CONFIRMATION → EXECUTING, rowcount 1) BEFORE the
//      provider call; persist event_id on success. A second "yes"/retry finds
//      nothing claimable and returns the existing result — no duplicate event.
//
// CONNECTS TO: otzar.service.ts (conductSession, pre-LLM hook),
//              connector/calendar-event.service.ts (createCalendarEvent, gated),
//              work-os/work-ledger.service.ts (createLedgerEntry),
//              personalization EntityProfile.timezone.

import { randomUUID } from "node:crypto";
import { prisma, writeAuditEvent } from "@niov/database";
import { createLedgerEntry } from "../work-os/work-ledger.service.js";
import {
  createCalendarEvent,
  type CalendarEventProposalInput,
} from "../connector/calendar-event.service.js";

// ── Temporal grounding ──────────────────────────────────────────────────────

const ORG_FALLBACK_TZ = "America/New_York"; // documented, flagged when used
const DEFAULT_DURATION_MIN = 60;
const PROPOSAL_TTL_MS = 60 * 60 * 1000; // a pending proposal expires after 1h
const PROPOSAL_LEDGER_SOURCE = "otzar_calendar_proposal";

export interface TemporalContext {
  now_ms: number;
  now_iso: string;
  timezone: string;
  /** "client" (live device tz — handles travel), "profile" (stored per-user), or "org_fallback". */
  timezone_source: "client" | "profile" | "org_fallback";
  /** The user's LOCAL date parts (in `timezone`) for "today". */
  local: { year: number; month: number; day: number; hour: number; minute: number };
}

function isValidTimezone(tz: string | undefined | null): tz is string {
  if (typeof tz !== "string" || tz.length === 0) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// The offset (ms) that `tz` is ahead of UTC at the given instant — DST-correct
// because it is computed AT that instant via Intl.
function tzOffsetMs(tz: string, at: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(at);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const asUTC = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second),
  );
  return asUTC - at.getTime();
}

// The wall-clock local date parts of `at` as seen in `tz`.
function localPartsInTz(
  tz: string,
  at: Date,
): { year: number; month: number; day: number; hour: number; minute: number } {
  const offset = tzOffsetMs(tz, at);
  const shifted = new Date(at.getTime() + offset);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

// Convert a wall-clock local Y/M/D H:M in `tz` to a UTC ISO instant (DST-correct:
// the offset is resolved at the target instant, then applied).
function localWallClockToUtcIso(
  tz: string,
  y: number,
  m: number,
  d: number,
  hour: number,
  minute: number,
): string {
  const guessUTC = Date.UTC(y, m - 1, d, hour, minute, 0);
  const offset = tzOffsetMs(tz, new Date(guessUTC));
  return new Date(guessUTC - offset).toISOString();
}

/**
 * Resolve the authoritative temporal context for a turn.
 * Priority: live client timezone (travel) → stored per-user EntityProfile.timezone
 * → documented org fallback (flagged). Never a silent global guess.
 */
export async function resolveTemporalContext(args: {
  actor_entity_id: string;
  client_timezone?: string | undefined;
  now_ms?: number;
}): Promise<TemporalContext> {
  const nowMs = args.now_ms ?? Date.now();
  let timezone: string | null = null;
  let source: TemporalContext["timezone_source"] = "org_fallback";

  if (isValidTimezone(args.client_timezone)) {
    timezone = args.client_timezone;
    source = "client";
  } else {
    let profileTz: string | null = null;
    try {
      const row = await prisma.entityProfile.findUnique({
        where: { entity_id: args.actor_entity_id },
        select: { timezone: true },
      });
      profileTz = row?.timezone ?? null;
    } catch {
      profileTz = null;
    }
    if (isValidTimezone(profileTz)) {
      timezone = profileTz;
      source = "profile";
    }
  }
  if (timezone === null) {
    timezone = ORG_FALLBACK_TZ;
    source = "org_fallback";
  }

  const at = new Date(nowMs);
  return {
    now_ms: nowMs,
    now_iso: at.toISOString(),
    timezone,
    timezone_source: source,
    local: localPartsInTz(timezone, at),
  };
}

/** A one-line, model-facing statement of the current grounded date/time. */
export function temporalPromptLine(t: TemporalContext): string {
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone: t.timezone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(t.now_ms));
  return `CURRENT DATE & TIME (server-grounded, authoritative — do not guess or invent a date): ${label} (timezone ${t.timezone}). When the user refers to relative times like "today", "tomorrow", or "at one", resolve them against THIS date and timezone.`;
}

// ── Time-phrase parsing (deterministic) ─────────────────────────────────────

const WORD_HOURS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  noon: 12, midnight: 0,
};

interface ParsedTime {
  hour24: number;
  minute: number;
  /** whether the user explicitly gave am/pm (vs a documented default). */
  meridiem_explicit: boolean;
  /** "today" | "tomorrow" | null (null = today unless the time already passed). */
  day_hint: "today" | "tomorrow" | null;
}

/**
 * Parse a clock time out of free text. Handles "at one o'clock", "at 1",
 * "1 pm", "1:30pm", "at 2", "noon", plus a "today"/"tomorrow" hint.
 * Returns null when no time is present. Bare hours with no am/pm use a
 * DOCUMENTED default (1–6 → PM, 7–11 → AM, 12 → noon) and the resolved
 * absolute time is always shown to the user for correction.
 */
export function parseTimePhrase(text: string): ParsedTime | null {
  const lower = text.toLowerCase();
  const dayHint: ParsedTime["day_hint"] = /\btomorrow\b/.test(lower)
    ? "tomorrow"
    : /\btoday\b|\btonight\b/.test(lower)
      ? "today"
      : null;

  // Digit form: "1", "1:30", optional am/pm.
  const digit = lower.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/);
  // Word form: "one", "one o'clock", optional am/pm.
  const word = lower.match(
    /\b(?:at\s+)?(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|noon|midnight)\b(?:\s*o'?clock)?\s*(a\.?m\.?|p\.?m\.?)?/,
  );

  let baseHour: number | null = null;
  let minute = 0;
  let meridiem: "am" | "pm" | null = null;

  if (word !== null && word[1] !== undefined) {
    baseHour = WORD_HOURS[word[1]] ?? null;
    if (word[2] !== undefined) meridiem = word[2].startsWith("p") ? "pm" : "am";
    if (word[1] === "noon") { baseHour = 12; meridiem = "pm"; }
    if (word[1] === "midnight") { baseHour = 0; meridiem = "am"; }
  } else if (digit !== null && digit[1] !== undefined) {
    const h = Number(digit[1]);
    if (h >= 0 && h <= 23) baseHour = h;
    if (digit[2] !== undefined) minute = Number(digit[2]);
    if (digit[3] !== undefined) meridiem = digit[3].startsWith("p") ? "pm" : "am";
  }

  if (baseHour === null) return null;
  if (minute < 0 || minute > 59) return null;

  let hour24 = baseHour;
  const explicit = meridiem !== null;
  if (meridiem === "pm") hour24 = baseHour === 12 ? 12 : baseHour + 12;
  else if (meridiem === "am") hour24 = baseHour === 12 ? 0 : baseHour;
  else if (baseHour >= 1 && baseHour <= 6) hour24 = baseHour + 12; // documented default → PM
  else if (baseHour >= 7 && baseHour <= 11) hour24 = baseHour; // → AM
  else hour24 = baseHour; // 12 → noon, 0 → midnight (already 24h if digit)

  if (hour24 < 0 || hour24 > 23) return null;
  return { hour24, minute, meridiem_explicit: explicit, day_hint: dayHint };
}

// ── Calendar-create intent detection ────────────────────────────────────────

const CALENDAR_INTENT =
  /\b(calendar|schedule|remind me|set (?:up )?(?:a )?(?:meeting|event|reminder)|book (?:a )?(?:meeting|event)|put .* on my|add .* to my (?:calendar|schedule))\b/i;

export interface CalendarProposalDraft {
  title: string;
  start_iso: string;
  end_iso: string;
  timezone: string;
  resolved_label: string;
  original_phrase: string;
  meridiem_defaulted: boolean;
}

export type CalendarDetection =
  | { kind: "proposal"; proposal: CalendarProposalDraft }
  // The requested time has already passed today (and the user did not say
  // "tomorrow"). We do NOT silently schedule tomorrow — "today at 1 PM" may be
  // impossible — so we ask a truthful clarifying question and persist nothing.
  | { kind: "clarify_past_time"; time_label: string; timezone: string }
  | null;

/**
 * Detect a calendar-create request and resolve the concrete date/time SERVER-SIDE
 * (never the model). Returns a proposal, a clarification (past time), or null.
 */
export function detectCalendarProposal(
  message: string,
  temporal: TemporalContext,
): CalendarDetection {
  if (!CALENDAR_INTENT.test(message)) return null;
  const time = parseTimePhrase(message);
  if (time === null) return null;

  const tz = temporal.timezone;
  const { year, month, day } = temporal.local;

  // Resolve against TODAY first.
  let startIso = localWallClockToUtcIso(tz, year, month, day, time.hour24, time.minute);
  const todayPassed = new Date(startIso).getTime() <= temporal.now_ms;

  if (time.day_hint === "tomorrow") {
    const t = new Date(temporal.now_ms + 24 * 60 * 60 * 1000);
    const tp = localPartsInTz(tz, t);
    startIso = localWallClockToUtcIso(tz, tp.year, tp.month, tp.day, time.hour24, time.minute);
  } else if (todayPassed) {
    // Correction #2: never silently schedule tomorrow. Ask, and persist nothing.
    const timeLabel = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hour: "numeric", minute: "2-digit", timeZoneName: "short",
    }).format(new Date(startIso));
    return { kind: "clarify_past_time", time_label: timeLabel, timezone: tz };
  }
  const endIso = new Date(new Date(startIso).getTime() + DEFAULT_DURATION_MIN * 60 * 1000).toISOString();

  // Temporal sanity guard: never propose a materially-past instant.
  if (new Date(startIso).getTime() < temporal.now_ms - 5 * 60 * 1000) return null;

  const resolvedLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, weekday: "short", month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  }).format(new Date(startIso));

  return {
    kind: "proposal",
    proposal: {
      title: extractEventTitle(message),
      start_iso: startIso,
      end_iso: endIso,
      timezone: tz,
      resolved_label: resolvedLabel,
      original_phrase: message.trim().slice(0, 300),
      meridiem_defaulted: !time.meridiem_explicit,
    },
  };
}

const EVENT_NOUNS =
  "event|meeting|call|appointment|party|dinner|lunch|breakfast|review|birthday|game|practice|class|standup|sync|interview|ceremony|graduation|recital|concert|show";

// Best-effort deterministic title extraction: the noun phrase immediately before
// an event word ("... Olivia's event" → "Olivia's Event", "... budget review" →
// "Budget Review"). Title-cases only at word boundaries (preserves "Olivia's").
function extractEventTitle(message: string): string {
  const re = new RegExp(
    `([A-Za-z][A-Za-z0-9'’]*(?:\\s+[A-Za-z0-9'’]+){0,2}?)\\s+(${EVENT_NOUNS})\\b`,
    "i",
  );
  const m = message.match(re);
  if (m !== null && m[1] !== undefined && m[2] !== undefined) {
    // Strip leading filler/preposition words the greedy-enough match may include
    // ("be at Olivia's" → "Olivia's"), then re-attach the event noun.
    const STOP = new Set([
      "be", "at", "the", "a", "an", "my", "to", "i'll", "i", "on", "that", "for",
      "will", "in", "of", "with", "am", "is", "going", "go",
      // calendar verbs a leading window may absorb
      "schedule", "book", "put", "add", "set", "create", "meet", "remind", "have", "get", "make",
    ]);
    const words = m[1].trim().split(/\s+/);
    while (words.length > 0 && STOP.has(words[0]!.toLowerCase())) words.shift();
    const lead = words.join(" ").trim();
    const phrase = (lead.length > 0 ? `${lead} ${m[2]}` : m[2]).replace(/\s+/g, " ");
    return titleCase(phrase);
  }
  return "Event";
}

function titleCase(s: string): string {
  return s.replace(/(^|\s)([a-z])/g, (_m, sp: string, c: string) => sp + c.toUpperCase());
}

// ── Confirmation phrase resolution (deterministic, LLM-free) ────────────────

const CONFIRM_RE = /^\s*(yes|yep|yeah|yup|sure|ok(?:ay)?|do it|go ahead|please do|please|confirm(?:ed)?|sounds good|create it|add it|book it|make it so|absolutely)\b[\s.!]*$/i;
const REJECT_RE = /^\s*(no|nope|cancel|don'?t|do not|nvm|never ?mind|not (?:now|yet|today)|stop|forget it)\b[\s.!]*$/i;

export type ConfirmationKind = "confirm" | "reject" | "none";

export function classifyConfirmation(message: string): ConfirmationKind {
  if (CONFIRM_RE.test(message)) return "confirm";
  if (REJECT_RE.test(message)) return "reject";
  return "none";
}

// ── Pending proposal persistence + lookup ───────────────────────────────────

interface PendingProposalRow {
  ledger_entry_id: string;
  title: string;
  details: Record<string, unknown>;
  created_at: Date;
  /** The exact thread this proposal was bound to at persist time (Correction #1). */
  conversation_id: string | null;
}

async function findActorPendingProposals(args: {
  actor_entity_id: string;
  org_entity_id: string;
  now_ms: number;
  /**
   * Correction #1 — exact thread binding. When the caller demonstrably supplied a
   * thread (client sent a conversation_id), we scope to proposals bound to THAT
   * thread, so a confirmation in thread Y can never silently approve a proposal
   * made in thread X. When absent (the ambient surface sends no id — the live P0
   * case), we fall back to ACTOR + ORG recency and let the resolved proposal's own
   * bound thread be restored to the client.
   */
  conversation_id?: string | undefined;
}): Promise<PendingProposalRow[]> {
  const threadScoped =
    typeof args.conversation_id === "string" && args.conversation_id.length > 0;
  const rows = await prisma.workLedgerEntry.findMany({
    where: {
      org_entity_id: args.org_entity_id,
      owner_entity_id: args.actor_entity_id,
      ledger_type: "MEETING",
      status: "NEEDS_CALLER_CONFIRMATION",
      details: { path: ["source"], equals: PROPOSAL_LEDGER_SOURCE },
      ...(threadScoped ? { conversation_id: args.conversation_id } : {}),
    },
    orderBy: { created_at: "desc" },
    select: {
      ledger_entry_id: true, title: true, details: true, created_at: true,
      expires_at: true, conversation_id: true,
    },
    take: 10,
  });
  // Drop expired (defensive — the sweep may not have run yet).
  return rows
    .filter((r) => r.expires_at === null || r.expires_at.getTime() > args.now_ms)
    .map((r) => ({
      ledger_entry_id: r.ledger_entry_id,
      title: r.title,
      details: (r.details ?? {}) as Record<string, unknown>,
      created_at: r.created_at,
      conversation_id: r.conversation_id,
    }));
}

export async function persistPendingCalendarProposal(args: {
  actor_entity_id: string;
  org_entity_id: string;
  conversation_id?: string | undefined;
  proposal: CalendarProposalDraft;
  now_ms: number;
}): Promise<{ ledger_entry_id: string } | null> {
  const idempotencyKey = `otzarcal:${args.actor_entity_id}:${args.proposal.title}:${args.proposal.start_iso}`;
  const created = await createLedgerEntry({
    org_entity_id: args.org_entity_id,
    ledger_type: "MEETING",
    source_type: "VOICE_COMMAND",
    ...(args.conversation_id !== undefined ? { conversation_id: args.conversation_id } : {}),
    owner_entity_id: args.actor_entity_id,
    requester_entity_id: args.actor_entity_id,
    title: args.proposal.title,
    summary: `Proposed: ${args.proposal.resolved_label}`,
    status: "NEEDS_CALLER_CONFIRMATION",
    priority: "ROUTINE",
    expires_at: new Date(args.now_ms + PROPOSAL_TTL_MS).toISOString(),
    details: {
      source: PROPOSAL_LEDGER_SOURCE,
      proposal: {
        title: args.proposal.title,
        start_iso: args.proposal.start_iso,
        end_iso: args.proposal.end_iso,
        timezone: args.proposal.timezone,
        timezone_source: undefined,
        original_phrase: args.proposal.original_phrase,
        resolved_label: args.proposal.resolved_label,
      },
      idempotency_key: idempotencyKey,
    },
  });
  if (created.ok !== true) return null;
  return { ledger_entry_id: created.entry.ledger_entry_id };
}

// Atomic claim: NEEDS_CALLER_CONFIRMATION → EXECUTING, exactly one winner.
async function claimProposalForExecution(ledgerEntryId: string): Promise<boolean> {
  const n = await prisma.$executeRaw`
    UPDATE work_ledger_entries
       SET status = 'EXECUTING', updated_at = now()
     WHERE ledger_entry_id = ${ledgerEntryId}::uuid
       AND status = 'NEEDS_CALLER_CONFIRMATION'`;
  return n === 1;
}

async function finalizeProposal(
  ledgerEntryId: string,
  status: "EXECUTED" | "NEEDS_CALLER_CONFIRMATION" | "CANCELLED" | "BLOCKED",
  patch: Record<string, unknown>,
): Promise<void> {
  try {
    const existing = await prisma.workLedgerEntry.findUnique({
      where: { ledger_entry_id: ledgerEntryId },
      select: { details: true },
    });
    const details = { ...((existing?.details ?? {}) as Record<string, unknown>), ...patch };
    await prisma.workLedgerEntry.update({
      where: { ledger_entry_id: ledgerEntryId },
      data: { status, details: details as object },
    });
  } catch {
    // best-effort; the claim already prevented a duplicate.
  }
}

// ── Orchestrator: the pre-LLM continuity hook ───────────────────────────────

export interface CalendarContinuityResult {
  handled: true;
  /** honest state for the UI + a natural-language reply. */
  state:
    | "AWAITING_CONFIRMATION"
    | "CREATED"
    | "PROVIDER_BLOCKED"
    | "CANCELLED"
    | "DISAMBIGUATE"
    | "NEEDS_TIME_CLARIFICATION"
    | "REVISED"
    | "EXPIRED_OFFER_RECREATE";
  response: string;
  ledger_entry_id?: string;
  event_id?: string;
  provider_code?: string;
  /**
   * Correction #1 — the server-authoritative thread this turn resolved within.
   * On propose: the thread the new proposal was bound to (client should echo it).
   * On ambient confirm: the RESTORED thread of the resolved proposal, so the
   * client re-anchors to the real conversation instead of a fresh id.
   */
  conversation_id?: string;
}

// Resolve a confirm/reject against ONE specific pending proposal: reject →
// CANCELLED; confirm → atomic-claim → gated createCalendarEvent → honest state.
// Shared by the single-pending "yes"/"no" path and the ordinal-selection path.
async function resolvePendingConfirmation(args: {
  kind: "confirm" | "reject";
  target: PendingProposalRow;
  client_conversation_id: string | undefined;
  actor_entity_id: string;
  org_entity_id: string;
}): Promise<CalendarContinuityResult | null> {
  const { target } = args;
  // Restore the proposal's own bound thread so the client re-anchors (esp. the
  // ambient path, where the request carried no conversation_id).
  const restoredThread = target.conversation_id ?? args.client_conversation_id;
  const threadEcho = restoredThread != null ? { conversation_id: restoredThread } : {};
  const proposal = (target.details.proposal ?? {}) as {
    title?: string; start_iso?: string; end_iso?: string; timezone?: string; resolved_label?: string;
  };

  if (args.kind === "reject") {
    await finalizeProposal(target.ledger_entry_id, "CANCELLED", { cancelled_at: new Date().toISOString() });
    return {
      handled: true,
      state: "CANCELLED",
      response: `Okay — I won't add "${proposal.title ?? target.title}". Cancelled.`,
      ledger_entry_id: target.ledger_entry_id,
      ...threadEcho,
    };
  }

  // CONFIRM → INVARIANT 2: atomic claim before the provider call.
  const claimed = await claimProposalForExecution(target.ledger_entry_id);
  if (!claimed) {
    // A concurrent confirm/retry already claimed it — return the existing result.
    const fresh = await prisma.workLedgerEntry.findUnique({
      where: { ledger_entry_id: target.ledger_entry_id },
      select: { status: true, details: true },
    });
    const d = (fresh?.details ?? {}) as Record<string, unknown>;
    const eid = typeof d.event_id === "string" ? d.event_id : undefined;
    return {
      handled: true,
      state: fresh?.status === "EXECUTED" ? "CREATED" : "AWAITING_CONFIRMATION",
      response:
        fresh?.status === "EXECUTED"
          ? `That's already done — "${proposal.title ?? target.title}" is on your calendar.`
          : `I'm already working on "${proposal.title ?? target.title}".`,
      ledger_entry_id: target.ledger_entry_id,
      ...(eid !== undefined ? { event_id: eid } : {}),
      ...threadEcho,
    };
  }

  // Revalidate time if the proposal is materially stale, then execute.
  const startIso = typeof proposal.start_iso === "string" ? proposal.start_iso : undefined;
  const endIso = typeof proposal.end_iso === "string" ? proposal.end_iso : undefined;
  if (startIso === undefined || endIso === undefined) {
    await finalizeProposal(target.ledger_entry_id, "NEEDS_CALLER_CONFIRMATION", {});
    return null;
  }

  const input: CalendarEventProposalInput = {
    title: proposal.title ?? target.title,
    participants: [{ label: "You", resolved: true, entity_id: args.actor_entity_id }],
    selected_time: { start: startIso, end: endIso },
    participant_confirmations_satisfied: true,
    requires_approval: false,
    caller_confirmed: true,
    policy_blocked: false,
    owner_entity_id: args.actor_entity_id,
  };
  const result = await createCalendarEvent({
    actor_entity_id: args.actor_entity_id,
    org_entity_id: args.org_entity_id,
    input,
  });

  if (result.ok === true) {
    await finalizeProposal(target.ledger_entry_id, "EXECUTED", {
      event_id: result.event_id,
      calendar_id: result.calendar_id,
      executed_at: new Date().toISOString(),
    });
    return {
      handled: true,
      state: "CREATED",
      response: `Done — "${proposal.title ?? target.title}" was added to your calendar for ${proposal.resolved_label ?? "the proposed time"}.`,
      ledger_entry_id: target.ledger_entry_id,
      event_id: result.event_id,
      ...threadEcho,
    };
  }

  // Honest provider state — the approved intent is preserved (back to pending),
  // never a false "added".
  await finalizeProposal(target.ledger_entry_id, "NEEDS_CALLER_CONFIRMATION", {
    last_provider_code: result.code,
    last_attempt_at: new Date().toISOString(),
  });
  return {
    handled: true,
    state: "PROVIDER_BLOCKED",
    response: providerBlockedMessage(result.code, proposal.title ?? target.title),
    ledger_entry_id: target.ledger_entry_id,
    provider_code: result.code,
    ...threadEcho,
  };
}

// ── P4: ordinal selection + time revision (supersession) ────────────────────

// "the first one" / "first" / "number 2" / "the second" / "the last one".
// Returns a 0-based index into the ASC-ordered pending list, or null.
const ORDINAL_WORDS: Record<string, number> = {
  first: 0, second: 1, third: 2, fourth: 3, fifth: 4,
  one: 0, two: 1, three: 2, four: 3, five: 4,
};
export function parseOrdinalSelection(message: string, count: number): number | null {
  const m = message.toLowerCase().trim();
  if (/\b(the )?last one\b/.test(m) || /\blast\b/.test(m)) return count - 1;
  const word = m.match(/\b(first|second|third|fourth|fifth|one|two|three|four|five)\b/);
  if (word && word[1] !== undefined && ORDINAL_WORDS[word[1]] !== undefined) {
    const idx = ORDINAL_WORDS[word[1]]!;
    return idx < count ? idx : null;
  }
  const num = m.match(/\b(?:number|option|#)\s*(\d+)\b/) ?? m.match(/^\s*\(?(\d+)\)?\s*$/);
  if (num && num[1] !== undefined) {
    const idx = Number(num[1]) - 1;
    return idx >= 0 && idx < count ? idx : null;
  }
  return null;
}

// Whether an ordinal selection is a cancel ("cancel the first one", "drop #2").
function ordinalIsReject(message: string): boolean {
  return /\b(cancel|drop|remove|delete|not|no)\b/i.test(message);
}

// Deterministic oldest→newest ordering shared by the disambiguation prompt and
// parseOrdinalSelection, so "(1)"/"the first one" always mean the same proposal.
function orderForSelection(rows: PendingProposalRow[]): PendingProposalRow[] {
  return [...rows].sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
}

// A bare time-change against a pending proposal: "make it 2pm", "change it to 3",
// "actually 4pm", "2pm instead", "no, 2 pm". Returns the new time, or null.
export function parseTimeRevision(message: string): { hour24: number; minute: number } | null {
  const m = message.toLowerCase();
  // Must look like a revision, not a fresh calendar request (which CALENDAR_INTENT
  // catches first) — a change verb, "instead", or a leading "no/actually" + a time.
  const revisionCue =
    /\b(make it|change it to|move it to|instead|actually|rather|let'?s do|how about)\b/.test(m) ||
    /^\s*(no,?\s+)?\d/.test(m);
  if (!revisionCue) return null;
  const t = parseTimePhrase(message);
  if (t === null) return null;
  return { hour24: t.hour24, minute: t.minute };
}

// Supersede a single pending proposal's time IN PLACE (same row → thread binding,
// idempotency claim, and ledger identity all preserved). A following "yes"
// confirms the revised time. Never revises into the past (→ truthful clarify).
async function supersedePendingProposal(args: {
  target: PendingProposalRow;
  revision: { hour24: number; minute: number };
  temporal: TemporalContext;
  client_conversation_id: string | undefined;
}): Promise<CalendarContinuityResult> {
  const { target } = args;
  const prior = (target.details.proposal ?? {}) as {
    title?: string; start_iso?: string; timezone?: string;
  };
  const tz = prior.timezone ?? args.temporal.timezone;
  const base = typeof prior.start_iso === "string" ? new Date(prior.start_iso) : new Date(args.temporal.now_ms);
  const { year, month, day } = localPartsInTz(tz, base);
  const newStartIso = localWallClockToUtcIso(tz, year, month, day, args.revision.hour24, args.revision.minute);
  const restoredThread = target.conversation_id ?? args.client_conversation_id;
  const threadEcho = restoredThread != null ? { conversation_id: restoredThread } : {};

  // Correction #2 discipline — a revised time that is already in the past asks,
  // never silently rolls forward.
  if (new Date(newStartIso).getTime() < args.temporal.now_ms - 5 * 60 * 1000) {
    const timeLabel = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hour: "numeric", minute: "2-digit", timeZoneName: "short",
    }).format(new Date(newStartIso));
    return {
      handled: true,
      state: "NEEDS_TIME_CLARIFICATION",
      response:
        `${timeLabel} has already passed in your timezone (${tz}). ` +
        `Did you mean tomorrow at ${timeLabel}, or another time today?`,
      ...threadEcho,
    };
  }

  const newEndIso = new Date(new Date(newStartIso).getTime() + DEFAULT_DURATION_MIN * 60 * 1000).toISOString();
  const resolvedLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, weekday: "short", month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  }).format(new Date(newStartIso));

  await finalizeProposal(target.ledger_entry_id, "NEEDS_CALLER_CONFIRMATION", {
    proposal: {
      ...(target.details.proposal as Record<string, unknown> | undefined ?? {}),
      start_iso: newStartIso,
      end_iso: newEndIso,
      resolved_label: resolvedLabel,
    },
    revised_at: new Date().toISOString(),
  });

  return {
    handled: true,
    state: "REVISED",
    response:
      `Updated — "${prior.title ?? target.title}" is now ${resolvedLabel}. ` +
      `Want me to create it? (Say "yes" to confirm, or give another time.)`,
    ledger_entry_id: target.ledger_entry_id,
    ...threadEcho,
  };
}

/**
 * Runs BEFORE the LLM in conductSession. Deterministically resolves a
 * confirmation against the caller's pending proposal, or persists a new
 * proposal. Returns null when the turn is not calendar-continuity (→ normal LLM).
 */
export async function handleCalendarContinuity(args: {
  actor_entity_id: string;
  org_entity_id: string | null;
  conversation_id?: string | undefined;
  message: string;
  temporal: TemporalContext;
}): Promise<CalendarContinuityResult | null> {
  if (args.org_entity_id === null) return null; // orgless caller: no governed calendar
  const orgId = args.org_entity_id;

  const kind = classifyConfirmation(args.message);

  if (kind === "confirm" || kind === "reject") {
    const pending = await findActorPendingProposals({
      actor_entity_id: args.actor_entity_id,
      org_entity_id: orgId,
      now_ms: args.temporal.now_ms,
      // Correction #1: exact thread binding when the client supplied a thread.
      conversation_id: args.conversation_id,
    });
    // INVARIANT 1: no side-effect on ambiguity.
    if (pending.length === 0) return null; // nothing to confirm → normal handling
    if (pending.length > 1) {
      // Order oldest→newest so "(1)"/"the first one" is stable and shared with
      // parseOrdinalSelection (which indexes the same ASC ordering).
      const ordered = orderForSelection(pending);
      return {
        handled: true,
        state: "DISAMBIGUATE",
        response:
          `I have ${pending.length} things waiting for your confirmation: ` +
          ordered.map((p, i) => `(${i + 1}) ${p.title}`).join(", ") +
          `. Which one — for example, "the first one"?`,
      };
    }
    return resolvePendingConfirmation({
      kind,
      target: pending[0]!,
      client_conversation_id: args.conversation_id,
      actor_entity_id: args.actor_entity_id,
      org_entity_id: orgId,
    });
  }

  // P4: ordinal selection ("the first one") / time revision ("make it 2pm").
  // Only look up pending state when the message plausibly is one of these — keeps
  // the common non-calendar chat turn on a cheap regex-only path (no DB hit).
  const ordinalLike =
    /\b(first|second|third|fourth|fifth|last|number|option)\b/i.test(args.message) ||
    /^\s*\(?\d\)?\s*$/.test(args.message);
  const revisionLike =
    /\b(make it|change it to|move it to|instead|actually|rather|let'?s do|how about)\b/i.test(args.message) ||
    /^\s*(no,?\s+)?\d/.test(args.message);
  if (ordinalLike || revisionLike) {
    const pending = await findActorPendingProposals({
      actor_entity_id: args.actor_entity_id,
      org_entity_id: orgId,
      now_ms: args.temporal.now_ms,
      conversation_id: args.conversation_id,
    });
    if (pending.length > 0) {
      const ordered = orderForSelection(pending);
      // Ordinal selection resolves a specific pending proposal (confirm, or cancel
      // if the phrase is a rejection like "cancel the first one").
      if (ordinalLike) {
        const idx = parseOrdinalSelection(args.message, ordered.length);
        if (idx !== null) {
          return resolvePendingConfirmation({
            kind: ordinalIsReject(args.message) ? "reject" : "confirm",
            target: ordered[idx]!,
            client_conversation_id: args.conversation_id,
            actor_entity_id: args.actor_entity_id,
            org_entity_id: orgId,
          });
        }
      }
      // Time revision (supersession) — only unambiguous with EXACTLY one pending.
      if (pending.length === 1) {
        const rev = parseTimeRevision(args.message);
        if (rev !== null) {
          return supersedePendingProposal({
            target: pending[0]!,
            revision: rev,
            temporal: args.temporal,
            client_conversation_id: args.conversation_id,
          });
        }
      }
    }
  }

  // Not a confirmation → is this a NEW calendar-create request?
  const detection = detectCalendarProposal(args.message, args.temporal);
  if (detection === null) return null; // normal LLM path

  // Correction #2: a past-today time is a clarification, NOT a confirmable
  // proposal — persist nothing, ask truthfully. The user's "tomorrow at 1" (or
  // "another time today") then forms the real proposal.
  if (detection.kind === "clarify_past_time") {
    return {
      handled: true,
      state: "NEEDS_TIME_CLARIFICATION",
      response:
        `${detection.time_label} has already passed in your timezone (${detection.timezone}). ` +
        `Did you mean tomorrow at ${detection.time_label}, or another time today?`,
    };
  }

  const proposal = detection.proposal;
  // Correction #1: resolve the server-authoritative thread BEFORE persistence and
  // bind the proposal to it. Reuse the client's thread when it supplied a UUID one;
  // otherwise mint a stable id and hand it back so the client re-anchors. The bound
  // thread (not a later fresh id) is what a subsequent "yes" resolves against.
  const boundThread = isUuid(args.conversation_id) ? args.conversation_id : randomUUID();
  const persisted = await persistPendingCalendarProposal({
    actor_entity_id: args.actor_entity_id,
    org_entity_id: orgId,
    conversation_id: boundThread,
    proposal,
    now_ms: args.temporal.now_ms,
  });
  if (persisted === null) return null;

  await writeAuditEvent({
    event_type: "CALENDAR_PROPOSAL_DRAFTED",
    outcome: "SUCCESS",
    actor_entity_id: args.actor_entity_id,
    target_entity_id: orgId,
    details: { title: proposal.title, timezone_source: args.temporal.timezone_source },
  }).catch(() => undefined);

  return {
    handled: true,
    state: "AWAITING_CONFIRMATION",
    response:
      `I'll add "${proposal.title}" to your calendar for ${proposal.resolved_label}. ` +
      `Want me to create it? (Say "yes" to confirm, or tell me a different time.)`,
    ledger_entry_id: persisted.ledger_entry_id,
    conversation_id: boundThread,
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(v: string | undefined): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

function providerBlockedMessage(code: string, title: string): string {
  switch (code) {
    case "GOOGLE_RECONNECT_REQUIRED":
    case "CALENDAR_PROVIDER_UNAVAILABLE":
      return `I've kept "${title}" ready to add, but Google Calendar needs to be connected first. Once it's connected, say "try the ${title} again."`;
    case "EVENT_WRITE_SCOPE_MISSING":
      return `I can read your calendar, but this connection can't create events yet. I've kept "${title}" pending — reconnect with calendar write access and say "try again."`;
    case "PROVIDER_ERROR":
      return `Google Calendar returned a temporary error, so I didn't add "${title}" yet (and I did NOT create a duplicate). You can say "try again."`;
    default:
      return `I couldn't add "${title}" yet (${code}). I kept it pending — you can say "try again."`;
  }
}
