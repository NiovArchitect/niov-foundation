// FILE: watcher.service.ts
// PURPOSE: Governed background "watcher" detection over durable Work Ledger
//          state (Phase 1285-P). A watcher is a governed observer, not a UI
//          feature: it reads SCOPED durable records, evaluates DETERMINISTIC
//          conditions, emits findings with proof, and NEVER mutates work,
//          sends externally, bypasses RBAC/ABAC, or leaks cross-tenant data.
//          BEAM is advisory/orchestration only; Foundation is the policy
//          authority. This module is the single detector — getWatcherFeed
//          (rich contract) and getBlindSpotFeed (simpler typed feed) are two
//          projections of the same scan, so detection logic is never
//          duplicated.
// CONNECTS TO: apps/api/src/routes/work-os-ledger.routes.ts (the
//              /work-os/watchers/feed + /work-os/blind-spots/feed routes);
//              apps/api/src/services/identity/resolve-entities.ts (canonical
//              names); packages/database (prisma); docs/product/
//              otzar-watcher-routes.md (the BEAM bridge contract, P2).

import { randomUUID } from "node:crypto";
import { prisma } from "@niov/database";
import type { WorkLedgerEntry } from "@prisma/client";
import { resolveEntityNames, type ResolvedName } from "../identity/resolve-entities.js";
import {
  evaluateWatchersOnBeam,
  type BeamDispatchConfig,
  type BeamWatcherCandidateInput,
  type BeamWatcherResult,
  type BeamWatcherStatus,
} from "../coordination/beam-fabric-client.js";

// WHAT: the deterministic watcher rule taxonomy. LIVE rules are detected from
//        durable state today; DEFERRED rules are part of the contract but are
//        NOT faked — they need schema/signal support (documented in
//        docs/product/otzar-watcher-routes.md). The feed contract is ready for
//        them so adding a rule never changes the wire shape.
export type WatcherType =
  | "STALE_WAITING_ON"
  | "OVERDUE_WORK"
  | "UNRESOLVED_BLOCKER"
  | "NO_NEXT_ACTION"
  | "UNANSWERED_ASK" // DEFERRED — needs thread-signal→ledger linkage
  | "STALE_COMMITMENT"; // DEFERRED — needs a COMMITMENT ledger/signal type

export type WatcherSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

// WHAT: a person on a finding, rendered by display name — NEVER a raw UUID as
//        the primary label. entity_id rides as secondary proof only; unresolved
//        entities carry display_name = "Unknown entity" + unresolved = true.
export interface CanonicalEntity {
  entity_id: string | null;
  display_name: string;
  unresolved: boolean;
}

export type WatcherSourceSystem =
  | "work_ledger"
  | "thread"
  | "waiting_on"
  | "signal"
  | "relationship_summary";

export type WatcherActionKind =
  | "view_thread"
  | "view_work"
  | "nudge_owner"
  | "mark_complete"
  | "assign_owner"
  | "review_blocker"
  | "none";

export interface WatcherFinding {
  finding_id: string; // deterministic (`${watcher_type}:${ledger_entry_id}`) so duplicates do not spam
  watcher_type: WatcherType;
  severity: WatcherSeverity;
  title: string;
  summary: string;
  org_id: string;
  owner: CanonicalEntity | null;
  requester: CanonicalEntity | null;
  target: CanonicalEntity | null;
  related_person: CanonicalEntity | null;
  source: {
    source_system: WatcherSourceSystem;
    ledger_entry_id: string | null;
    source_message_id: string | null;
    source_thread_key: string | null;
    relationship_key: string | null;
  };
  detection: {
    rule_id: string;
    detected_at: string;
    age_hours: number | null;
    due_at: string | null;
    threshold_hours: number | null;
    reason: string;
  };
  recommendation: {
    next_action: string;
    action_kind: WatcherActionKind;
  };
  // Phase 1287-B — OPTIONAL advisory annotation from the long-lived BEAM watcher
  // actor, present only when a validated BEAM candidate matched this finding's
  // ledger_entry_id. The deterministic finding above stays primary; this is
  // additive (Foundation never lets BEAM create/replace a finding).
  beam_advisory?: {
    confirmed: boolean;
    confidence: string;
    reason: string;
    recommendation: string;
    actor_id: string | null;
    correlation_id: string;
    evaluated_at: string | null;
    source: "BEAM_ADVISORY";
  };
}

// ── Simpler typed feed (Phase 1285-N; preserved wire shape) ─────────────────
export type BlindSpotType =
  | "OVERDUE_WORK"
  | "STALE_WAITING_ON"
  | "UNRESOLVED_BLOCKER"
  | "NO_NEXT_ACTION";

export interface BlindSpotFeedItem {
  blind_spot_id: string;
  type: BlindSpotType;
  title: string;
  summary: string;
  severity: WatcherSeverity;
  ledger_entry_id: string;
  ledger_type: string;
  status: string;
  owner_entity_id: string | null;
  requester_entity_id: string | null;
  owner_display_name: string | null;
  requester_display_name: string | null;
  due_at: string | null;
  age_days: number;
  source_message_id: string | null;
  recommended_action: string;
  detection_rule: string;
}

const WATCHER_FEED_TYPES = ["TASK", "FOLLOW_UP", "APPROVAL", "BLOCKER", "DECISION"];
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const STALE_MS = 48 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;
// Terminal / done statuses excluded from every watcher scan.
const DONE_STATUSES = ["CANCELLED", "EXPIRED", "VERIFIED", "EXECUTED"];

// WHAT: build a CanonicalEntity from an id + the resolved-names map. null id →
//        null (no person on this axis). Unresolved → "Unknown entity" label,
//        never the raw UUID as the display.
function canonical(
  names: Map<string, ResolvedName>,
  id: string | null,
): CanonicalEntity | null {
  if (id === null) return null;
  const r = names.get(id);
  if (r === undefined) return { entity_id: id, display_name: "Unknown entity", unresolved: true };
  return { entity_id: id, display_name: r.display_name, unresolved: r.unresolved };
}

function sourceMessageIdOf(details: unknown): string | null {
  if (typeof details !== "object" || details === null) return null;
  const v = (details as Record<string, unknown>).source_message_id;
  return typeof v === "string" && v.length > 0 ? v : null;
}

// WHAT: the single deterministic detector. Reads SCOPED durable rows and emits
//        at most one finding per ledger entry — the highest-priority risk —
//        with both the rich WatcherFinding and a reference to the raw row so
//        the two public projections can derive their own fields.
// INPUT: org + caller + manager flag (+ optional now for tests).
// OUTPUT: array of { finding, row } in stalest-first order.
// WHY: governed scope mirrors getBlindSpots — employee sees own/owned/
//      requested work; manager sees org-wide. Tenant-isolated by org_entity_id.
async function scanWatcherFindings(args: {
  org_entity_id: string;
  caller_entity_id: string;
  is_manager: boolean;
  now?: number;
}): Promise<Array<{ finding: WatcherFinding; row: WorkLedgerEntry }>> {
  const now = args.now ?? Date.now();
  const scope: Record<string, unknown> = { org_entity_id: args.org_entity_id };
  if (!args.is_manager) {
    scope.OR = [
      { owner_entity_id: args.caller_entity_id },
      { target_entity_id: args.caller_entity_id },
      { requester_entity_id: args.caller_entity_id },
    ];
  }
  const rows = await prisma.workLedgerEntry.findMany({
    where: {
      ...scope,
      ledger_type: { in: WATCHER_FEED_TYPES },
      NOT: { status: { in: DONE_STATUSES } },
    },
    orderBy: { updated_at: "asc" }, // stalest first
    take: 300,
  });

  const names = await resolveEntityNames(
    rows.flatMap((r) => [r.owner_entity_id, r.requester_entity_id, r.target_entity_id]),
  );

  const hoursSince = (d: Date): number => Math.floor((now - d.getTime()) / HOUR_MS);
  const out: Array<{ finding: WatcherFinding; row: WorkLedgerEntry }> = [];

  for (const r of rows) {
    const owner = canonical(names, r.owner_entity_id);
    const requester = canonical(names, r.requester_entity_id);
    const target = canonical(names, r.target_entity_id);
    const ownerLabel = owner?.display_name ?? "the owner";
    const sourceMessageId = sourceMessageIdOf(r.details);
    const dueIso = r.due_at !== null ? r.due_at.toISOString() : null;

    // related_person = the counterpart relative to the caller (waiting-on axis).
    const relatedId =
      r.requester_entity_id === args.caller_entity_id
        ? r.owner_entity_id
        : r.owner_entity_id === args.caller_entity_id
          ? r.requester_entity_id
          : (r.owner_entity_id ?? r.requester_entity_id);
    const relatedPerson = canonical(names, relatedId);

    const baseSource = (system: WatcherSourceSystem): WatcherFinding["source"] => ({
      source_system: sourceMessageId !== null ? "thread" : system,
      ledger_entry_id: r.ledger_entry_id,
      source_message_id: sourceMessageId,
      source_thread_key: null,
      relationship_key: null,
    });

    // Candidates in PRIORITY order — only the first is emitted per entry, so a
    // single piece of work is one finding, never double-counted across groups.
    const candidates: WatcherFinding[] = [];

    // A. OVERDUE_WORK — active item past its due date.
    if (r.due_at !== null && r.due_at.getTime() < now) {
      const overdueHours = hoursSince(r.due_at);
      candidates.push({
        finding_id: `OVERDUE_WORK:${r.ledger_entry_id}`,
        watcher_type: "OVERDUE_WORK",
        severity: overdueHours > 7 * 24 ? "HIGH" : "MEDIUM",
        title: r.title,
        summary: `Due ${Math.floor(overdueHours / 24)}d ago and still open.`,
        org_id: args.org_entity_id,
        owner,
        requester,
        target,
        related_person: relatedPerson,
        source: baseSource("work_ledger"),
        detection: {
          rule_id: "OVERDUE_WORK_V1",
          detected_at: new Date(now).toISOString(),
          age_hours: overdueHours,
          due_at: dueIso,
          threshold_hours: 0,
          reason: "active item with due_at in the past",
        },
        recommendation: {
          next_action: `Nudge ${ownerLabel} or reset the due date.`,
          action_kind: "nudge_owner",
        },
      });
    }
    // C. UNRESOLVED_BLOCKER — an active BLOCKER entry.
    if (r.ledger_type === "BLOCKER") {
      const ageH = hoursSince(r.created_at);
      candidates.push({
        finding_id: `UNRESOLVED_BLOCKER:${r.ledger_entry_id}`,
        watcher_type: "UNRESOLVED_BLOCKER",
        severity: "HIGH",
        title: r.title,
        summary: `Open blocker (${Math.floor(ageH / 24)}d old).`,
        org_id: args.org_entity_id,
        owner,
        requester,
        target,
        related_person: relatedPerson,
        source: baseSource("work_ledger"),
        detection: {
          rule_id: "UNRESOLVED_BLOCKER_V1",
          detected_at: new Date(now).toISOString(),
          age_hours: ageH,
          due_at: dueIso,
          threshold_hours: null,
          reason: "active BLOCKER ledger entry",
        },
        recommendation: {
          next_action: "Resolve the blocker or escalate it.",
          action_kind: "review_blocker",
        },
      });
    }
    // B. STALE_WAITING_ON — directional ask with no movement past the threshold.
    if (
      r.requester_entity_id !== null &&
      r.owner_entity_id !== null &&
      r.requester_entity_id !== r.owner_entity_id &&
      now - r.updated_at.getTime() > STALE_MS
    ) {
      const staleHours = hoursSince(r.updated_at);
      candidates.push({
        finding_id: `STALE_WAITING_ON:${r.ledger_entry_id}`,
        watcher_type: "STALE_WAITING_ON",
        severity: now - r.updated_at.getTime() > WEEK_MS ? "HIGH" : "MEDIUM",
        title: r.title,
        summary: `${requester?.display_name ?? "Someone"} is waiting on ${ownerLabel} — no movement in ${Math.floor(staleHours / 24)}d.`,
        org_id: args.org_entity_id,
        owner,
        requester,
        target,
        related_person: relatedPerson,
        source: baseSource("waiting_on"),
        detection: {
          rule_id: "STALE_WAITING_ON_48H_V1",
          detected_at: new Date(now).toISOString(),
          age_hours: staleHours,
          due_at: dueIso,
          threshold_hours: 48,
          reason: "directional waiting-on with no update in 48h",
        },
        recommendation: {
          next_action: `Nudge ${ownerLabel} or re-scope the ask.`,
          action_kind: "nudge_owner",
        },
      });
    }
    // D. NO_NEXT_ACTION — ownerless or missing a next action.
    if (r.owner_entity_id === null || r.next_action === null || r.next_action === "") {
      const noOwner = r.owner_entity_id === null;
      candidates.push({
        finding_id: `NO_NEXT_ACTION:${r.ledger_entry_id}`,
        watcher_type: "NO_NEXT_ACTION",
        severity: noOwner ? "HIGH" : "LOW",
        title: r.title,
        summary: noOwner ? "No owner assigned." : "No next action set.",
        org_id: args.org_entity_id,
        owner,
        requester,
        target,
        related_person: relatedPerson,
        source: baseSource("work_ledger"),
        detection: {
          rule_id: "NO_NEXT_ACTION_V1",
          detected_at: new Date(now).toISOString(),
          age_hours: hoursSince(r.created_at),
          due_at: dueIso,
          threshold_hours: null,
          reason: "active item with no owner or no next_action",
        },
        recommendation: {
          next_action: noOwner ? "Assign an owner." : "Set a clear next action.",
          action_kind: noOwner ? "assign_owner" : "view_work",
        },
      });
    }

    if (candidates[0] !== undefined) out.push({ finding: candidates[0], row: r });
  }
  return out;
}

// WHAT: the rich watcher feed — governed findings over durable work state.
// INPUT: org + caller + manager flag (+ optional now for tests).
// OUTPUT: WatcherFinding[] (no raw row leaked).
// WHY: Phase 1285-P canonical contract; BEAM will later feed candidates into
//      this same shape (Foundation re-validates + re-scopes them).
export async function getWatcherFeed(args: {
  org_entity_id: string;
  caller_entity_id: string;
  is_manager: boolean;
  now?: number;
}): Promise<WatcherFinding[]> {
  const scanned = await scanWatcherFindings(args);
  return scanned.map((x) => x.finding);
}

// WHAT: project an internal finding to the simpler BlindSpotFeedItem wire shape
//        (Phase 1285-N). age_days is created-at based (unchanged), independent
//        of the rule-relative age_hours on the rich finding.
function toBlindSpotFeedItem(
  finding: WatcherFinding,
  row: WorkLedgerEntry,
  now: number,
): BlindSpotFeedItem {
  return {
    blind_spot_id: finding.finding_id,
    type: finding.watcher_type as BlindSpotType,
    title: finding.title,
    summary: finding.summary,
    severity: finding.severity,
    ledger_entry_id: row.ledger_entry_id,
    ledger_type: row.ledger_type,
    status: row.status,
    owner_entity_id: row.owner_entity_id,
    requester_entity_id: row.requester_entity_id,
    owner_display_name: finding.owner?.display_name ?? null,
    requester_display_name: finding.requester?.display_name ?? null,
    due_at: finding.detection.due_at,
    age_days: Math.floor((now - row.created_at.getTime()) / DAY_MS),
    source_message_id: finding.source.source_message_id,
    recommended_action: finding.recommendation.next_action,
    detection_rule: finding.detection.reason,
  };
}

// WHAT: the simpler typed Blind Spots feed (Phase 1285-N wire shape), now a
//        thin projection of the shared detector so detection lives in ONE place.
export async function getBlindSpotFeed(args: {
  org_entity_id: string;
  caller_entity_id: string;
  is_manager: boolean;
  now?: number;
}): Promise<BlindSpotFeedItem[]> {
  const now = args.now ?? Date.now();
  const scanned = await scanWatcherFindings({ ...args, now });
  return scanned.map((x) => toBlindSpotFeedItem(x.finding, x.row, now));
}

// ── BEAM watcher actor bridge (Phase 1287-B) ────────────────────────────────
// Deterministic findings remain PRIMARY. Foundation optionally asks the
// long-lived BEAM watcher actor to confirm + score them, then re-validates every
// returned candidate against the allowed set and annotates matching findings.
// BEAM never creates/replaces a finding; unknown/unsafe candidates are dropped.

const BEAM_WATCHER_SEVERITIES = new Set(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const EM_DASH_RE = /[—–]/;
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export interface WatcherBeamStatus {
  status: BeamWatcherStatus;
  correlation_id: string;
  actor_id: string | null;
  confirmed_count: number;
  dropped_count: number;
}

// WHAT: derive a SAFE, scoped BEAM candidate input from a deterministic finding.
// WHY: the candidate carries only ids + closed-vocab + boolean signals — never a
//      raw transcript / payload. candidate_id is the ledger_entry_id.
export function toBeamWatcherCandidate(f: WatcherFinding): BeamWatcherCandidateInput | null {
  const id = f.source.ledger_entry_id;
  if (id === null) return null;
  return {
    candidate_id: id,
    watcher_type: f.watcher_type,
    severity: f.severity,
    ...(f.detection.age_hours !== null ? { age_hours: f.detection.age_hours } : {}),
    overdue: f.watcher_type === "OVERDUE_WORK",
    blocked: f.watcher_type === "UNRESOLVED_BLOCKER",
    waiting_on: f.watcher_type === "STALE_WAITING_ON",
    no_next_action: f.watcher_type === "NO_NEXT_ACTION",
  };
}

// WHAT: validate BEAM candidates against the allowed deterministic findings and
//        annotate matches. INPUT: the deterministic findings + the BEAM result +
//        the correlation id. OUTPUT: annotated findings + confirmed/dropped counts.
// WHY: Foundation is the authority. A candidate is accepted ONLY when its
//      candidate_id is an allowed ledger_entry_id AND its watcher_type matches
//      that finding's type AND severity is closed-vocab AND the text carries no
//      em dash / leaked id. Everything else is dropped. No new/duplicate finding.
export function mergeBeamWatcherAdvisory(
  findings: WatcherFinding[],
  result: BeamWatcherResult,
  correlation_id: string,
): { findings: WatcherFinding[]; confirmed_count: number; dropped_count: number } {
  if (result.status !== "BEAM_ENRICHED" || result.candidates.length === 0) {
    return { findings, confirmed_count: 0, dropped_count: 0 };
  }
  const allowed = new Map<string, WatcherFinding>();
  for (const f of findings) {
    if (f.source.ledger_entry_id !== null) allowed.set(f.source.ledger_entry_id, f);
  }
  const accepted = new Map<string, BeamWatcherResult["candidates"][number]>();
  let dropped = 0;
  for (const c of result.candidates) {
    const det = allowed.get(c.candidate_id);
    const safeText = `${c.reason} ${c.recommendation}`;
    if (
      det === undefined || // unknown / cross-scope id BEAM was never given
      c.watcher_type !== det.watcher_type || // cannot change the finding's type
      !BEAM_WATCHER_SEVERITIES.has(c.severity) ||
      EM_DASH_RE.test(safeText) ||
      UUID_RE.test(safeText)
    ) {
      dropped++;
      continue;
    }
    accepted.set(c.candidate_id, c);
  }
  const annotated = findings.map((f) => {
    const id = f.source.ledger_entry_id;
    const c = id !== null ? accepted.get(id) : undefined;
    if (c === undefined) return f;
    return {
      ...f,
      beam_advisory: {
        confirmed: true,
        confidence: c.confidence,
        reason: c.reason,
        recommendation: c.recommendation,
        actor_id: result.actor_id,
        correlation_id,
        evaluated_at: result.evaluated_at,
        source: "BEAM_ADVISORY" as const,
      },
    };
  });
  return { findings: annotated, confirmed_count: accepted.size, dropped_count: dropped };
}

// WHAT: the watcher feed enriched with advisory BEAM annotations (opt-in).
// INPUT: org + caller + manager flag (+ optional BEAM config for tests).
// OUTPUT: { findings (deterministic, BEAM-annotated where validated), beam }.
// WHY: deterministic findings are computed FIRST and stand alone if BEAM is
//      down (honest beam.status); no user flow blocks on BEAM.
export async function getWatcherFeedWithBeamAdvisory(args: {
  org_entity_id: string;
  caller_entity_id: string;
  is_manager: boolean;
  beamConfig?: BeamDispatchConfig;
  now?: number;
}): Promise<{ findings: WatcherFinding[]; beam: WatcherBeamStatus }> {
  const findings = await getWatcherFeed(args);
  const correlation_id = randomUUID();
  const candidates = findings
    .map(toBeamWatcherCandidate)
    .filter((c): c is BeamWatcherCandidateInput => c !== null);

  const result = await evaluateWatchersOnBeam(
    { tenant_id: args.org_entity_id, correlation_id, candidates },
    args.beamConfig ?? {},
  );
  const merged = mergeBeamWatcherAdvisory(findings, result, correlation_id);
  return {
    findings: merged.findings,
    beam: {
      status: result.status,
      correlation_id,
      actor_id: result.actor_id,
      confirmed_count: merged.confirmed_count,
      dropped_count: merged.dropped_count,
    },
  };
}
