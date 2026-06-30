// FILE: work-ledger.service.ts
// PURPOSE: Phase 1279 — the durable Work Ledger service. Persists work
//          extracted from conversations/meetings as tenant-scoped,
//          runtime-attributed, evidence-backed work objects and serves
//          My Work / Team Work / blind spots. LINKS to existing durable
//          objects (ProposedAction/AuditEvent/Notification/WorkProject)
//          by id — never replaces them. Foundation remains the authority:
//          every read/write is tenant-scoped; no cross-tenant bleed.
// CONNECTS TO: @niov/database (workLedgerEntry, writeAuditEvent),
//          governance/org.ts (getOrgEntityId), work-os-ledger routes.
//
// SAFETY: status is data, not execution — creating an EXECUTED/VERIFIED
// entry never executes anything. extraction_source is preserved verbatim
// (never upgraded to PYTHON_ENRICHED unless the caller proves it).

import { randomUUID } from "node:crypto";
import { prisma } from "@niov/database";
import { logger } from "../../logger.js";
import {
  extractWorkSignals,
  type EnrichmentRuntimeConfig,
} from "../intelligence/python-enrichment.service.js";
import {
  pendingEnvelope,
  buildWorkSignalEnvelope,
  validateAdvisoryEnvelope,
  envelopeUpgradesExtraction,
} from "../intelligence/python-intelligence.js";
import {
  recordExecutionAttempt,
  getFailedAttemptDigests,
} from "./execution-verification.service.js";
import { resolveEntityNames, nameFrom } from "../identity/resolve-entities.js";

// Phase 1283 — BEAM watcher category → durable internal watcher type. "none"
// maps to null (no watcher created). Internal Work OS state only — a watcher
// NEVER sends an external notification.
const WATCHER_TYPE_BY_CATEGORY: Record<string, string | undefined> = {
  blocker: "BLOCKER",
  confirmation: "CONFIRMATION",
  due_date: "DUE_DATE",
  no_next_action: "NO_NEXT_ACTION",
  none: undefined,
};

export const LEDGER_TYPES = [
  "COMMITMENT", "TASK", "DECISION", "BLOCKER", "MEETING", "FOLLOW_UP",
  "APPROVAL", "EXECUTION", "COLLABORATION", "NOTIFICATION", "CORRECTION",
  // Phase 6+ — a governed admin org-seeding suggestion (Dandelion) sourced from
  // work evidence. Org-scoped (owner/target/requester null); only the admin seed
  // queue lists these — they never appear in employee My Work / Team Work.
  "ORG_SEEDING",
] as const;
export const SOURCE_TYPES = [
  "VOICE_COMMAND", "CHAT", "MEETING", "TRANSCRIPT", "CONNECTOR", "SYSTEM", "MANUAL",
] as const;
export const PRIORITIES = [
  "COMPANY_CRITICAL", "FOUNDER_CRITICAL", "PROJECT_CRITICAL", "BLOCKER",
  "ROUTINE", "LOW", "NOISE",
] as const;
export const LEDGER_STATUSES = [
  "DETECTED", "INFERRED", "DRAFT", "PROPOSED", "NEEDS_TARGET_RESOLUTION",
  "NEEDS_OWNER", "NEEDS_PARTICIPANT_CONFIRMATION", "NEEDS_SELECTED_TIME",
  "NEEDS_AUTHORITY", "NEEDS_APPROVAL", "NEEDS_CALLER_CONFIRMATION",
  "READY_TO_EXECUTE", "EXECUTING", "EXECUTED", "VERIFIED", "BLOCKED",
  "RUNTIME_MISSING", "CANCELLED", "EXPIRED",
  // Dandelion org-seeding seed lifecycle (admin-governed; ORG_SEEDING entries).
  "SEED_PROPOSED", "SEED_NEEDS_REVIEW", "SEED_APPROVED", "SEED_REJECTED",
  "SEED_HELD", "SEED_APPLIED", "SEED_BLOCKED", "SEED_EXPIRED",
] as const;
export const EXTRACTION_SOURCES = [
  "TYPESCRIPT_DETERMINISTIC", "PYTHON_ENRICHED", "MANUAL", "CONNECTOR",
] as const;

// Statuses that mean "this work needs attention" — power blind spots.
export const BLIND_SPOT_STATUSES: ReadonlyArray<string> = [
  "NEEDS_TARGET_RESOLUTION", "NEEDS_OWNER", "NEEDS_APPROVAL",
  "NEEDS_PARTICIPANT_CONFIRMATION", "RUNTIME_MISSING", "BLOCKED",
];

export interface CreateLedgerInput {
  org_entity_id: string;
  ledger_type: string;
  source_type?: string;
  source_command?: string;
  conversation_id?: string;
  work_plan_id?: string;
  project_id?: string;
  goal_id?: string;
  proposed_action_id?: string;
  audit_event_id?: string;
  notification_id?: string;
  requester_entity_id?: string;
  owner_entity_id?: string;
  target_entity_id?: string;
  title: string;
  summary?: string;
  details?: Record<string, unknown>;
  priority?: string;
  status?: string;
  authority_decision?: string;
  policy_reason_code?: string;
  extraction_source?: string;
  confidence_score?: number;
  evidence?: unknown[];
  next_action?: string;
  due_at?: string;
  expires_at?: string;
  // Phase 1282 — advisory Python conversation-to-work enrichment. When
  // `enable_python_enrichment` is true and `enrichment_text` is present,
  // Foundation asks the Python worker for ADDITIONAL closed-vocab signals.
  // Deterministic extraction stays primary: extraction_source is only
  // upgraded to PYTHON_ENRICHED when Python actually returns signals AND
  // the caller did not pin an explicit extraction_source.
  enrichment_text?: string;
  enable_python_enrichment?: boolean;
  enrichment_runtime?: EnrichmentRuntimeConfig;
}

export type LedgerFailureCode = "INVALID_REQUEST" | "NOT_FOUND" | "FORBIDDEN";

export interface LedgerFailure {
  ok: false;
  code: LedgerFailureCode;
  message: string;
}

function optStr<T extends string>(v: T | undefined): { value: T } | null {
  return v !== undefined && v.length > 0 ? { value: v } : null;
}

// WHAT: Create a durable, tenant-scoped ledger entry.
// WHY: This is the bridge from "Otzar extracted something" to "the org
//      knows who owns it". Validates enum-likes; never executes anything.
export async function createLedgerEntry(
  input: CreateLedgerInput,
): Promise<{ ok: true; entry: WorkLedgerView } | LedgerFailure> {
  if (input.title.trim().length === 0) {
    return { ok: false, code: "INVALID_REQUEST", message: "title is required" };
  }
  if (!LEDGER_TYPES.includes(input.ledger_type as (typeof LEDGER_TYPES)[number])) {
    return { ok: false, code: "INVALID_REQUEST", message: "invalid ledger_type" };
  }
  const status = input.status ?? "DRAFT";
  if (!LEDGER_STATUSES.includes(status as (typeof LEDGER_STATUSES)[number])) {
    return { ok: false, code: "INVALID_REQUEST", message: "invalid status" };
  }
  let extraction = input.extraction_source ?? "TYPESCRIPT_DETERMINISTIC";
  if (!EXTRACTION_SOURCES.includes(extraction as (typeof EXTRACTION_SOURCES)[number])) {
    return { ok: false, code: "INVALID_REQUEST", message: "invalid extraction_source" };
  }

  // Phase 1285-U — advisory Python enrichment is now ASYNC + best-effort.
  // Deterministic extraction is the primary source of truth and the ledger
  // write NEVER blocks on Python. When enrichment is requested we mark the
  // block PENDING up front; a fire-and-forget task (after the write) attaches
  // the real Python outcome and only then may upgrade extraction_source.
  const callerPinnedExtraction = input.extraction_source !== undefined;
  const enrichmentRequested =
    input.enable_python_enrichment === true &&
    typeof input.enrichment_text === "string" &&
    input.enrichment_text.trim().length > 0;

  const detailsWithEnrichment: Record<string, unknown> = {
    ...(input.details ?? {}),
    ...(enrichmentRequested
      ? { python_enrichment: pendingEnvelope("WORK_SIGNAL_EXTRACTION", new Date().toISOString()) }
      : {}),
  };

  const row = await prisma.workLedgerEntry.create({
    data: {
      org_entity_id: input.org_entity_id,
      ledger_type: input.ledger_type,
      source_type: input.source_type ?? "VOICE_COMMAND",
      ...(optStr(input.source_command) ? { source_command: input.source_command } : {}),
      ...(optStr(input.conversation_id) ? { conversation_id: input.conversation_id } : {}),
      ...(optStr(input.work_plan_id) ? { work_plan_id: input.work_plan_id } : {}),
      ...(optStr(input.project_id) ? { project_id: input.project_id } : {}),
      ...(optStr(input.goal_id) ? { goal_id: input.goal_id } : {}),
      ...(optStr(input.proposed_action_id) ? { proposed_action_id: input.proposed_action_id } : {}),
      ...(optStr(input.audit_event_id) ? { audit_event_id: input.audit_event_id } : {}),
      ...(optStr(input.notification_id) ? { notification_id: input.notification_id } : {}),
      ...(optStr(input.requester_entity_id) ? { requester_entity_id: input.requester_entity_id } : {}),
      ...(optStr(input.owner_entity_id) ? { owner_entity_id: input.owner_entity_id } : {}),
      ...(optStr(input.target_entity_id) ? { target_entity_id: input.target_entity_id } : {}),
      title: input.title,
      ...(optStr(input.summary) ? { summary: input.summary } : {}),
      details: detailsWithEnrichment as object,
      priority: input.priority ?? "ROUTINE",
      status,
      ...(optStr(input.authority_decision) ? { authority_decision: input.authority_decision } : {}),
      ...(optStr(input.policy_reason_code) ? { policy_reason_code: input.policy_reason_code } : {}),
      extraction_source: extraction,
      ...(input.confidence_score !== undefined ? { confidence_score: input.confidence_score } : {}),
      evidence: (input.evidence ?? []) as object,
      ...(optStr(input.next_action) ? { next_action: input.next_action } : {}),
      ...(input.due_at !== undefined ? { due_at: new Date(input.due_at) } : {}),
      ...(input.expires_at !== undefined ? { expires_at: new Date(input.expires_at) } : {}),
    },
  });

  // Phase 1282 — auto-record execution evidence. The internal ledger write
  // is proven (INTERNAL_RECORD, VERIFIED). When Python enrichment ran, record
  // its real outcome: VERIFIED when it actually returned signals, FAILED
  // otherwise (honest — never faked). Best-effort: evidence recording can
  // never break the ledger write.
  await recordExecutionAttempt({
    ledger_entry_id: row.ledger_entry_id,
    org_entity_id: row.org_entity_id,
    attempt_type: "WORK_LEDGER_CREATE",
    runtime: "TYPESCRIPT",
    evidence_type: "INTERNAL_RECORD",
    status: "VERIFIED",
    detail: { ledger_type: row.ledger_type, status: row.status },
  });
  // Phase 1285-U — kick off Python enrichment WITHOUT awaiting it: the ledger
  // write + response are already complete and never wait on Python. The task
  // patches details.python_enrichment with the real outcome and records the
  // PYTHON_ENRICHMENT execution attempt when it finishes (bounded by the
  // service's own timeout). Fire-and-forget; failures are swallowed + logged.
  if (enrichmentRequested) {
    void enrichLedgerEntryAsync({
      ledger_entry_id: row.ledger_entry_id,
      org_entity_id: row.org_entity_id,
      text: input.enrichment_text as string,
      ...(input.source_type !== undefined ? { source_type: input.source_type } : {}),
      ...(input.enrichment_runtime !== undefined ? { runtime: input.enrichment_runtime } : {}),
      caller_pinned_extraction: callerPinnedExtraction,
    });
  }

  return { ok: true, entry: projectLedger(row) };
}

// WHAT: best-effort, NON-BLOCKING Python advisory enrichment for an already-
//        created ledger entry. Runs the WORK_SIGNAL_EXTRACTION capability
//        through the general Python intelligence contract: build the envelope,
//        let Foundation validate it, store it on details.python_enrichment, and
//        ONLY upgrade extraction_source when Foundation validated a real
//        enrichment (and the caller did not pin extraction).
// INPUT: the row id + org + the text to enrich (+ optional source/runtime).
// OUTPUT: none (fire-and-forget). NEVER throws; failures degrade to an ERROR
//         envelope on the row + a warn log (no raw text logged).
// WHY: Phase 1285-U — deterministic truth stays primary; Python is advisory and
//      may be absent/slow/unhealthy without affecting any user flow. Foundation
//      is the authority that accepts / rejects / downgrades Python output.
export async function enrichLedgerEntryAsync(args: {
  ledger_entry_id: string;
  org_entity_id: string;
  text: string;
  source_type?: string;
  runtime?: EnrichmentRuntimeConfig;
  caller_pinned_extraction: boolean;
}): Promise<void> {
  try {
    const startedAt = Date.now();
    const result = await extractWorkSignals(
      {
        text: args.text,
        ...(args.source_type !== undefined ? { source_type: args.source_type } : {}),
      },
      args.runtime ?? {},
    );
    // Wrap in the general advisory envelope, then let Foundation validate it
    // (advisory work-signals are accepted as metadata only; never mutate owner/
    // requester/target/status/policy/scope).
    const envelope = validateAdvisoryEnvelope(
      buildWorkSignalEnvelope(result, Date.now() - startedAt, new Date().toISOString()),
    );

    const current = await prisma.workLedgerEntry.findFirst({
      where: { ledger_entry_id: args.ledger_entry_id, org_entity_id: args.org_entity_id },
      select: { details: true, extraction_source: true },
    });
    if (current === null) return; // row gone (deleted/cross-tenant): nothing to patch.

    const baseDetails =
      typeof current.details === "object" && current.details !== null
        ? (current.details as Record<string, unknown>)
        : {};
    const upgradeExtraction = envelopeUpgradesExtraction(envelope, args.caller_pinned_extraction);

    await prisma.workLedgerEntry.update({
      where: { ledger_entry_id: args.ledger_entry_id },
      data: {
        details: { ...baseDetails, python_enrichment: envelope } as object,
        ...(upgradeExtraction ? { extraction_source: "PYTHON_ENRICHED" } : {}),
      },
    });

    const enriched = envelope.status === "PYTHON_ENRICHED";
    await recordExecutionAttempt({
      ledger_entry_id: args.ledger_entry_id,
      org_entity_id: args.org_entity_id,
      attempt_type: "PYTHON_ENRICHMENT",
      runtime: "PYTHON",
      evidence_type: "PROVIDER_RESPONSE",
      status: enriched ? "VERIFIED" : "FAILED",
      detail: {
        enrichment_status: envelope.status,
        authority: envelope.authority,
        capability: envelope.capability,
        signal_count: envelope.candidates.length,
        latency_ms: envelope.latency_ms,
      },
      ...(enriched ? {} : { error_code: envelope.status }),
    });
  } catch (err) {
    // Best-effort: never let async enrichment break anything. Log the FACT of
    // failure (no raw enrichment text / no payload) and mark the row ERROR.
    logger.warn(
      { ledger_entry_id: args.ledger_entry_id, err: err instanceof Error ? err.message : "unknown" },
      "[work-ledger] async Python enrichment failed",
    );
    try {
      const current = await prisma.workLedgerEntry.findFirst({
        where: { ledger_entry_id: args.ledger_entry_id, org_entity_id: args.org_entity_id },
        select: { details: true },
      });
      if (current === null) return;
      const baseDetails =
        typeof current.details === "object" && current.details !== null
          ? (current.details as Record<string, unknown>)
          : {};
      const errorEnvelope = {
        ...pendingEnvelope("WORK_SIGNAL_EXTRACTION", new Date().toISOString()),
        status: "ERROR" as const,
        error_code: "ERROR",
      };
      await prisma.workLedgerEntry.update({
        where: { ledger_entry_id: args.ledger_entry_id },
        data: { details: { ...baseDetails, python_enrichment: errorEnvelope } as object },
      });
    } catch {
      // give up silently — the deterministic row is already intact.
    }
  }
}

export interface CoordinationRecordInput {
  org_entity_id: string;
  ledger_entry_id: string;
  coordination_runtime: string;
  coordination_event_id?: string;
  coordination_watcher?: string;
  coordination_error_code?: string;
}

// WHAT: Persist a lightweight coordination summary + (if actionable) an
//        internal watcher onto the ledger row's details, AFTER the BEAM
//        dispatch result is known. execution_attempts remains the detailed
//        proof source; this is the summary/cache so My Work etc. can show
//        coordination without replaying the original create response.
// OUTPUT: ok + the watcher created (if any), or a safe warning — never fakes
//         persistence and never throws on the create hot path.
// WHY: PART E + PART F (Phase 1283). A watcher is internal Work OS state
//      only; it NEVER sends an external notification.
export async function recordCoordinationOnLedger(
  input: CoordinationRecordInput,
): Promise<{ ok: true; watcher_created: boolean } | { ok: false; warning: string }> {
  try {
    const row = await prisma.workLedgerEntry.findFirst({
      where: { ledger_entry_id: input.ledger_entry_id, org_entity_id: input.org_entity_id },
      select: { details: true },
    });
    if (row === null) {
      return { ok: false, warning: "ledger entry not found for coordination persistence" };
    }
    const details =
      typeof row.details === "object" && row.details !== null
        ? ({ ...(row.details as Record<string, unknown>) })
        : {};

    details.coordination = {
      runtime: input.coordination_runtime,
      event_id: input.coordination_event_id ?? null,
      watcher: input.coordination_watcher ?? null,
      dispatched_at: new Date().toISOString(),
      error_code: input.coordination_error_code ?? null,
    };

    let watcherCreated = false;
    const watcherType =
      input.coordination_watcher !== undefined
        ? WATCHER_TYPE_BY_CATEGORY[input.coordination_watcher]
        : undefined;
    if (watcherType !== undefined) {
      const existing = Array.isArray(details.watchers)
        ? (details.watchers as unknown[])
        : [];
      existing.push({
        watcher_id: randomUUID(),
        watcher_type: watcherType,
        status: "ACTIVE",
        source_runtime: input.coordination_runtime === "BEAM_DISPATCHED" ? "BEAM" : "TYPESCRIPT",
        escalation_level: "NONE",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      details.watchers = existing;
      watcherCreated = true;
    }

    await prisma.workLedgerEntry.update({
      where: { ledger_entry_id: input.ledger_entry_id },
      data: { details: details as object },
    });
    return { ok: true, watcher_created: watcherCreated };
  } catch {
    return { ok: false, warning: "coordination persistence failed" };
  }
}

export interface LedgerFilters {
  ledger_type?: string;
  status?: string;
  owner?: string;
  target?: string;
  project_id?: string;
  goal_id?: string;
  work_plan_id?: string;
  source_type?: string;
  priority?: string;
  proposed_action_id?: string;
}

// WHAT: List ledger entries for an org with optional filters + caller
//        scope. Manager/admin sees the org; an employee sees only entries
//        where they are owner/target/requester.
// WHY: Tenant isolation is by org_entity_id (always applied). Within the
//      org, employee visibility is narrowed to their own work.
export async function listLedgerEntries(args: {
  org_entity_id: string;
  caller_entity_id: string;
  is_manager: boolean;
  filters?: LedgerFilters;
}): Promise<WorkLedgerView[]> {
  const f = args.filters ?? {};
  const where: Record<string, unknown> = { org_entity_id: args.org_entity_id };
  if (f.ledger_type !== undefined) where.ledger_type = f.ledger_type;
  if (f.status !== undefined) where.status = f.status;
  if (f.owner !== undefined) where.owner_entity_id = f.owner;
  if (f.target !== undefined) where.target_entity_id = f.target;
  if (f.project_id !== undefined) where.project_id = f.project_id;
  if (f.goal_id !== undefined) where.goal_id = f.goal_id;
  if (f.work_plan_id !== undefined) where.work_plan_id = f.work_plan_id;
  if (f.source_type !== undefined) where.source_type = f.source_type;
  if (f.priority !== undefined) where.priority = f.priority;
  if (f.proposed_action_id !== undefined) where.proposed_action_id = f.proposed_action_id;
  if (!args.is_manager) {
    // Employee: only entries that involve them.
    where.OR = [
      { owner_entity_id: args.caller_entity_id },
      { target_entity_id: args.caller_entity_id },
      { requester_entity_id: args.caller_entity_id },
    ];
  }
  const rows = await prisma.workLedgerEntry.findMany({
    where,
    orderBy: { created_at: "desc" },
    take: 200,
  });
  return rows.map(projectLedger);
}

export async function getLedgerEntry(args: {
  ledger_entry_id: string;
  org_entity_id: string;
  caller_entity_id: string;
  is_manager: boolean;
}): Promise<{ ok: true; entry: WorkLedgerView } | LedgerFailure> {
  const row = await prisma.workLedgerEntry.findUnique({
    where: { ledger_entry_id: args.ledger_entry_id },
  });
  // Enumeration-safe + tenant-safe: a row in another tenant, or one the
  // employee is not party to, is reported as NOT_FOUND.
  if (row === null || row.org_entity_id !== args.org_entity_id) {
    return { ok: false, code: "NOT_FOUND", message: "ledger entry not found" };
  }
  if (
    !args.is_manager &&
    row.owner_entity_id !== args.caller_entity_id &&
    row.target_entity_id !== args.caller_entity_id &&
    row.requester_entity_id !== args.caller_entity_id
  ) {
    return { ok: false, code: "NOT_FOUND", message: "ledger entry not found" };
  }
  return { ok: true, entry: projectLedger(row) };
}

export async function patchLedgerEntry(args: {
  ledger_entry_id: string;
  org_entity_id: string;
  caller_entity_id: string;
  is_manager: boolean;
  patch: { status?: string; next_action?: string; priority?: string };
}): Promise<{ ok: true; entry: WorkLedgerView } | LedgerFailure> {
  const existing = await getLedgerEntry(args);
  if (existing.ok === false) return existing;
  const data: Record<string, unknown> = {};
  if (args.patch.status !== undefined) {
    if (!LEDGER_STATUSES.includes(args.patch.status as (typeof LEDGER_STATUSES)[number])) {
      return { ok: false, code: "INVALID_REQUEST", message: "invalid status" };
    }
    // Completion authority (Phase 1285-E): only the OWNER (the doer) or a
    // manager may mark a task DONE (EXECUTED/VERIFIED) — a requester must not
    // self-complete the other person's work. The REQUESTER (or owner/manager)
    // may CANCEL (withdraw) the ask. getLedgerEntry already guarantees the
    // caller is a participant, so this only narrows the done/cancel verbs.
    const e = existing.entry;
    const isOwner = e.owner_entity_id === args.caller_entity_id;
    const isRequester = e.requester_entity_id === args.caller_entity_id;
    const DONE_STATUSES = new Set(["EXECUTED", "VERIFIED"]);
    if (DONE_STATUSES.has(args.patch.status) && !args.is_manager && !isOwner) {
      return { ok: false, code: "FORBIDDEN", message: "only the owner can mark this complete" };
    }
    if (
      args.patch.status === "CANCELLED" &&
      !args.is_manager &&
      !isOwner &&
      !isRequester
    ) {
      return { ok: false, code: "FORBIDDEN", message: "only the owner or requester can cancel" };
    }
    data.status = args.patch.status;
    if (args.patch.status === "VERIFIED") data.verified_at = new Date();
  }
  if (args.patch.next_action !== undefined) data.next_action = args.patch.next_action;
  if (args.patch.priority !== undefined) data.priority = args.patch.priority;
  const row = await prisma.workLedgerEntry.update({
    where: { ledger_entry_id: args.ledger_entry_id },
    data,
  });
  return { ok: true, entry: projectLedger(row) };
}

// My Work — everything that involves the caller, newest first.
export async function getMyWork(args: {
  org_entity_id: string;
  caller_entity_id: string;
}): Promise<WorkLedgerView[]> {
  const rows = await prisma.workLedgerEntry.findMany({
    where: {
      org_entity_id: args.org_entity_id,
      OR: [
        { owner_entity_id: args.caller_entity_id },
        { target_entity_id: args.caller_entity_id },
        { requester_entity_id: args.caller_entity_id },
      ],
      NOT: { status: { in: ["CANCELLED", "EXPIRED"] } },
    },
    orderBy: { created_at: "desc" },
    take: 200,
  });
  // Phase 1285-H — enrich names via the shared resolver so My Work carries the
  // same identity fields as Team Work (no surface renders a UUID).
  const entries = await enrichParticipantNames(rows);
  // Server-computed completion authority (Phase 1285-E): the caller may mark a
  // task complete only when they OWN it and it is still active. Mirrors the
  // PATCH guard so the UI shows the control exactly where the action will work.
  const DONE = new Set(["EXECUTED", "VERIFIED", "CANCELLED", "EXPIRED"]);
  rows.forEach((row, i) => {
    if (row.owner_entity_id === args.caller_entity_id && !DONE.has(row.status)) {
      entries[i]!.can_complete = true;
    }
  });
  return entries;
}

export type TeamWorkResult =
  | { ok: true; entries: WorkLedgerView[] }
  | { ok: false; code: "TEAM_SCOPE_NOT_CONFIGURED"; message: string };

// Team Work — org-wide for managers/admins; honest blocker otherwise.
export async function getTeamWork(args: {
  org_entity_id: string;
  is_manager: boolean;
}): Promise<TeamWorkResult> {
  if (!args.is_manager) {
    return {
      ok: false,
      code: "TEAM_SCOPE_NOT_CONFIGURED",
      message: "Team scope requires manager/admin authority for this org.",
    };
  }
  const rows = await prisma.workLedgerEntry.findMany({
    where: {
      org_entity_id: args.org_entity_id,
      // ORG_SEEDING entries are admin org-seeding suggestions, not work — they
      // live in the admin seed queue, never in the Team Work view.
      ledger_type: { not: "ORG_SEEDING" },
      NOT: { status: { in: ["CANCELLED", "EXPIRED", "VERIFIED"] } },
    },
    orderBy: { created_at: "desc" },
    take: 300,
  });
  // Phase 1285-G/H — enrich with participant display names via the SINGLE
  // shared resolver (canonical identity contract: a label always, never a raw
  // UUID; "Unknown entity" + unresolved when absent).
  const entries = await enrichParticipantNames(rows);
  return { ok: true, entries };
}

// WHAT: project ledger rows + attach owner/requester/target display names from
//        the one shared resolver. Shared by Team Work + My Work so the same
//        entity renders identically on both surfaces.
async function enrichParticipantNames(rows: LedgerRow[]): Promise<WorkLedgerView[]> {
  const names = await resolveEntityNames(
    rows.flatMap((r) => [r.owner_entity_id, r.requester_entity_id, r.target_entity_id]),
  );
  return rows.map((row) => {
    const view = projectLedger(row);
    if (row.owner_entity_id !== null) view.owner_display_name = nameFrom(names, row.owner_entity_id);
    if (row.requester_entity_id !== null) view.requester_display_name = nameFrom(names, row.requester_entity_id);
    if (row.target_entity_id !== null) view.target_display_name = nameFrom(names, row.target_entity_id);
    return view;
  });
}

// Blind spots — ledger-derived (no AI guessing): attention-needing
// statuses, overdue, ownerless, or no-next-action entries.
export async function getBlindSpots(args: {
  org_entity_id: string;
  caller_entity_id: string;
  is_manager: boolean;
}): Promise<WorkLedgerView[]> {
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
      AND: [
        { NOT: { status: { in: ["CANCELLED", "EXPIRED", "VERIFIED", "EXECUTED"] } } },
        {
          OR: [
            { status: { in: [...BLIND_SPOT_STATUSES] } },
            { due_at: { lt: new Date() } },
            { owner_entity_id: null },
            { next_action: null },
          ],
        },
      ],
    },
    orderBy: { created_at: "desc" },
    take: 200,
  });
  const statusBased = rows.map(projectLedger);

  // PART C — also surface rows whose runtime proof FAILED, even if their
  // ledger status looks fine. "Not attempted" is never a failure; only an
  // actual FAILED execution attempt counts. Tenant-scoped via the digest.
  const digests = await getFailedAttemptDigests(args.org_entity_id);
  const byId = new Map(statusBased.map((e) => [e.ledger_entry_id, e]));
  const missingIds = [...digests.keys()].filter((id) => !byId.has(id));
  if (missingIds.length > 0) {
    const failedRows = await prisma.workLedgerEntry.findMany({
      where: {
        ...scope,
        ledger_entry_id: { in: missingIds },
        NOT: { status: { in: ["CANCELLED", "EXPIRED"] } },
      },
      orderBy: { created_at: "desc" },
      take: 200,
    });
    for (const r of failedRows) {
      const v = projectLedger(r);
      byId.set(v.ledger_entry_id, v);
      statusBased.push(v);
    }
  }
  // Tag every row that has a failed-attempt digest with the proof-failure
  // reason + severity (rows already present for a status reason get tagged
  // too, so the UI can route them to the runtime-issues section).
  for (const [id, digest] of digests) {
    const v = byId.get(id);
    if (v === undefined) continue;
    const { reason, severity } = classifyProofFailure(digest.failed_attempt_types);
    v.blind_spot_reason = reason;
    v.blind_spot_severity = severity;
  }
  return statusBased;
}

// ── Blind Spots typed risk feed (Phase 1285-N) ───────────────────────────────
// Detection now lives in watcher.service.ts (Phase 1285-P) as the single
// deterministic detector; getBlindSpotFeed is a thin projection of it. Re-
// exported here so existing importers (routes, tests) are unchanged.
export { getBlindSpotFeed } from "./watcher.service.js";
export type { BlindSpotFeedItem, BlindSpotType } from "./watcher.service.js";

// WHAT: pick the dominant blind-spot reason + severity from failed attempt
//        types. EXECUTION_FAILED (core write) > COORDINATION_FAILED (BEAM,
//        internal-only) > ENRICHMENT_FAILED (deterministic fallback worked).
function classifyProofFailure(
  failedTypes: string[],
): { reason: string; severity: string } {
  if (failedTypes.includes("WORK_LEDGER_CREATE") || failedTypes.includes("CONNECTOR_EXECUTION")) {
    return { reason: "EXECUTION_FAILED", severity: "HIGH" };
  }
  if (failedTypes.includes("BEAM_FANOUT")) {
    return { reason: "COORDINATION_FAILED", severity: "MEDIUM" };
  }
  if (failedTypes.includes("PYTHON_ENRICHMENT")) {
    return { reason: "ENRICHMENT_FAILED", severity: "LOW" };
  }
  return { reason: "VERIFICATION_MISSING", severity: "MEDIUM" };
}

export interface WorkLedgerView {
  ledger_entry_id: string;
  org_entity_id: string;
  ledger_type: string;
  source_type: string;
  source_command: string | null;
  conversation_id: string | null;
  work_plan_id: string | null;
  project_id: string | null;
  requester_entity_id: string | null;
  owner_entity_id: string | null;
  target_entity_id: string | null;
  title: string;
  summary: string | null;
  priority: string;
  status: string;
  authority_decision: string | null;
  policy_reason_code: string | null;
  extraction_source: string;
  confidence_score: number | null;
  evidence: unknown;
  next_action: string | null;
  due_at: string | null;
  created_at: string;
  updated_at: string;
  verified_at: string | null;
  // Phase 1281 — coordination runtime, attached by the route after the
  // governed BEAM dispatch (not persisted this phase; reflects the real
  // dispatch result, never faked).
  coordination_runtime?: string;
  coordination_watcher?: string;
  // Phase 1282 — advisory Python enrichment truth surfaced for View/Why.
  // Present only when enrichment ran; reflects the real Python outcome
  // (status names the degrade path when Python was not used).
  python_enrichment?: {
    status: string;
    signals: Array<{ signal_type: string; confidence: string; evidence_phrase: string }>;
    primary_signal: string | null;
    multi_intent: boolean;
  };
  // Phase 1285-V — advisory meeting / ambient-perception intelligence, read back
  // from details.meeting_intelligence so the Work Ledger surface shows the
  // governed perception outcome. Safe projection only: status + authority +
  // capability + summary + short closed-vocab candidates (never the raw
  // transcript, never chain-of-thought).
  meeting_intelligence?: {
    status: string;
    authority: string | null;
    capability: string;
    summary: string | null;
    candidates: Array<{ candidate_type: string; text: string; confidence: string }>;
  };
  // Phase 1283 — persisted coordination summary (PART E) read back from
  // details.coordination, so My Work / Team Work / Blind Spots show the BEAM
  // outcome without the original create response.
  coordination?: {
    runtime: string;
    event_id: string | null;
    watcher: string | null;
    dispatched_at: string | null;
    error_code: string | null;
  };
  // Phase 1283 — internal watcher state (PART F). Never sends anything.
  watchers?: Array<{
    watcher_id: string;
    watcher_type: string;
    status: string;
    source_runtime: string;
    escalation_level: string;
    created_at: string;
  }>;
  // Phase 1283 — set only when this row surfaces in Blind Spots because of a
  // runtime/verification failure (PART C). Status-derived blind spots leave
  // this undefined.
  blind_spot_reason?: string;
  blind_spot_severity?: string;
  // Phase 1285-E — the thread message this work was tracked from (proof link).
  // Lifted from details.source_message_id so My Work can show "View thread".
  source_message_id?: string;
  // Phase 1285-G — human-readable participant names (resolved server-side for
  // the Team Work waiting-on panel; never raw-UUID-only labels). Present only
  // on surfaces that enrich them (Team Work).
  owner_display_name?: string;
  requester_display_name?: string;
  target_display_name?: string;
  // Phase 1285-E — server-computed completion authority for the requesting
  // caller (My Work only): true when the caller OWNS this active task and may
  // mark it complete. The PATCH route re-enforces this; this only drives UI.
  can_complete?: boolean;
}

interface LedgerRow {
  ledger_entry_id: string;
  org_entity_id: string;
  ledger_type: string;
  source_type: string;
  source_command: string | null;
  conversation_id: string | null;
  work_plan_id: string | null;
  project_id: string | null;
  requester_entity_id: string | null;
  owner_entity_id: string | null;
  target_entity_id: string | null;
  title: string;
  summary: string | null;
  priority: string;
  status: string;
  authority_decision: string | null;
  policy_reason_code: string | null;
  extraction_source: string;
  confidence_score: number | null;
  evidence: unknown;
  next_action: string | null;
  due_at: Date | null;
  created_at: Date;
  updated_at: Date;
  verified_at: Date | null;
  details?: unknown;
}

// WHAT: Pull the typed python_enrichment block out of the details JSON.
// OUTPUT: a normalized enrichment summary, or undefined when absent.
// WHY: surfaces the advisory Python truth for View/Why without leaking the
//      rest of the opaque details blob.
function enrichmentFromDetails(
  details: unknown,
): WorkLedgerView["python_enrichment"] | undefined {
  if (typeof details !== "object" || details === null) return undefined;
  const pe = (details as Record<string, unknown>).python_enrichment;
  if (typeof pe !== "object" || pe === null) return undefined;
  const o = pe as Record<string, unknown>;
  // Phase 1285-U — the stored block is now a PythonIntelligenceEnvelope whose
  // advisory items live in `candidates`; fall back to the legacy `signals`
  // field so pre-1285-U rows still project faithfully.
  const rawSignals = Array.isArray(o.candidates)
    ? o.candidates
    : Array.isArray(o.signals)
      ? o.signals
      : [];
  const signals = rawSignals.flatMap((s) => {
    if (typeof s !== "object" || s === null) return [];
    const sr = s as Record<string, unknown>;
    return [
      {
        signal_type: String(sr.signal_type ?? ""),
        confidence: String(sr.confidence ?? ""),
        evidence_phrase: String(sr.evidence_phrase ?? ""),
      },
    ];
  });
  return {
    status: String(o.status ?? "UNKNOWN"),
    signals,
    primary_signal: typeof o.primary_signal === "string" ? o.primary_signal : null,
    multi_intent: o.multi_intent === true,
  };
}

// WHAT: pull the persisted coordination summary out of details (PART E).
function coordinationFromDetails(details: unknown): WorkLedgerView["coordination"] | undefined {
  if (typeof details !== "object" || details === null) return undefined;
  const c = (details as Record<string, unknown>).coordination;
  if (typeof c !== "object" || c === null) return undefined;
  const o = c as Record<string, unknown>;
  if (typeof o.runtime !== "string") return undefined;
  return {
    runtime: o.runtime,
    event_id: typeof o.event_id === "string" ? o.event_id : null,
    watcher: typeof o.watcher === "string" ? o.watcher : null,
    dispatched_at: typeof o.dispatched_at === "string" ? o.dispatched_at : null,
    error_code: typeof o.error_code === "string" ? o.error_code : null,
  };
}

// WHAT: pull internal watcher state out of details (PART F).
function watchersFromDetails(details: unknown): WorkLedgerView["watchers"] | undefined {
  if (typeof details !== "object" || details === null) return undefined;
  const w = (details as Record<string, unknown>).watchers;
  if (!Array.isArray(w)) return undefined;
  const out = w.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const o = item as Record<string, unknown>;
    if (typeof o.watcher_type !== "string") return [];
    return [
      {
        watcher_id: String(o.watcher_id ?? ""),
        watcher_type: o.watcher_type,
        status: String(o.status ?? "ACTIVE"),
        source_runtime: String(o.source_runtime ?? "BEAM"),
        escalation_level: String(o.escalation_level ?? "NONE"),
        created_at: String(o.created_at ?? ""),
      },
    ];
  });
  return out.length > 0 ? out : undefined;
}

// The SAFE meeting-intelligence projection shape (Phase 1285-V). Reused by the
// Comms recent-artifacts projection (Phase 1286-C) so both surfaces share one
// shape + one safe extractor.
export type MeetingIntelligenceProjection = NonNullable<WorkLedgerView["meeting_intelligence"]>;

// WHAT: pull the advisory meeting-intelligence envelope out of details into a
//        SAFE projection (Phase 1285-V). Short candidates only; never the raw
//        transcript or chain-of-thought.
export function meetingIntelligenceFromDetails(
  details: unknown,
): WorkLedgerView["meeting_intelligence"] | undefined {
  if (typeof details !== "object" || details === null) return undefined;
  const mi = (details as Record<string, unknown>).meeting_intelligence;
  if (typeof mi !== "object" || mi === null) return undefined;
  const o = mi as Record<string, unknown>;
  const rawCandidates = Array.isArray(o.candidates) ? o.candidates : [];
  const candidates = rawCandidates.flatMap((c) => {
    if (typeof c !== "object" || c === null) return [];
    const cr = c as Record<string, unknown>;
    if (typeof cr.candidate_type !== "string") return [];
    return [
      {
        candidate_type: String(cr.candidate_type),
        text: String(cr.text ?? "").slice(0, 280),
        confidence: String(cr.confidence ?? ""),
      },
    ];
  });
  return {
    status: String(o.status ?? "UNKNOWN"),
    authority: typeof o.authority === "string" ? o.authority : null,
    capability: String(o.capability ?? "MEETING_INTELLIGENCE"),
    summary: typeof o.summary === "string" ? o.summary : null,
    candidates,
  };
}

function projectLedger(row: LedgerRow): WorkLedgerView {
  const enrichment = enrichmentFromDetails(row.details);
  const meetingIntelligence = meetingIntelligenceFromDetails(row.details);
  const coordination = coordinationFromDetails(row.details);
  const watchers = watchersFromDetails(row.details);
  const sourceMessageId =
    typeof row.details === "object" && row.details !== null
      ? (row.details as Record<string, unknown>).source_message_id
      : undefined;
  return {
    ...(typeof sourceMessageId === "string" ? { source_message_id: sourceMessageId } : {}),
    ledger_entry_id: row.ledger_entry_id,
    org_entity_id: row.org_entity_id,
    ledger_type: row.ledger_type,
    source_type: row.source_type,
    source_command: row.source_command,
    conversation_id: row.conversation_id,
    work_plan_id: row.work_plan_id,
    project_id: row.project_id,
    requester_entity_id: row.requester_entity_id,
    owner_entity_id: row.owner_entity_id,
    target_entity_id: row.target_entity_id,
    title: row.title,
    summary: row.summary,
    priority: row.priority,
    status: row.status,
    authority_decision: row.authority_decision,
    policy_reason_code: row.policy_reason_code,
    extraction_source: row.extraction_source,
    confidence_score: row.confidence_score,
    evidence: row.evidence,
    next_action: row.next_action,
    due_at: row.due_at !== null ? row.due_at.toISOString() : null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    verified_at: row.verified_at !== null ? row.verified_at.toISOString() : null,
    ...(enrichment !== undefined ? { python_enrichment: enrichment } : {}),
    ...(meetingIntelligence !== undefined ? { meeting_intelligence: meetingIntelligence } : {}),
    ...(coordination !== undefined ? { coordination } : {}),
    ...(watchers !== undefined ? { watchers } : {}),
  };
}
