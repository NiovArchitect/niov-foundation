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
import {
  enrichExternalContext,
  type ExternalContextProjection,
} from "./external-context.service.js";
// [PROD-UX-P0R] — pure routing/autonomy decision projection over persisted
// decider outputs (never recomputes policy; never mutates).
import {
  projectRoutingDecision,
  type RoutingDecisionView,
} from "./routing-decision.js";

// Slice F — UUID shape guard for the ledger→Action link backfill on
// patchLedgerEntry (proposed_action_id / audit_event_id).
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  // Slice D — a user or org OBJECTIVE. Work links to it via goal_id; progress is
  // rolled up from the linked work. Like ORG_SEEDING, GOAL rows are their own
  // surface (the goals API) and are excluded from the work views/queries.
  "GOAL",
  // [CS-5] Org-owned reference context seeded from a document (Gap V lane 1).
  // VERIFIED + ownerless by contract; like ORG_SEEDING/GOAL it is excluded
  // from every personal/team work view — context, never a to-do.
  "DOCUMENT_CONTEXT",
] as const;
export const SOURCE_TYPES = [
  "VOICE_COMMAND", "CHAT", "MEETING", "TRANSCRIPT", "CONNECTOR", "SYSTEM", "MANUAL",
  // [CS-5] a seeded organization document (reference context).
  "DOCUMENT",
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
  // Slice D — goal lifecycle (GOAL entries).
  "GOAL_ACTIVE", "GOAL_ACHIEVED", "GOAL_ARCHIVED",
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
  const entry = projectLedger(row);
  // [T-1] single-row external context (same deterministic links as lists).
  await enrichExternalContext([row], [entry], row.org_entity_id);
  return { ok: true, entry };
}

export async function patchLedgerEntry(args: {
  ledger_entry_id: string;
  org_entity_id: string;
  caller_entity_id: string;
  is_manager: boolean;
  patch: {
    status?: string;
    next_action?: string;
    priority?: string;
    // Slice F — the ledger→Action link backfill. Both columns already
    // exist on WorkLedgerEntry; before Slice F nothing populated them.
    // The execution bridge sets proposed_action_id when it creates the
    // governed Action, and audit_event_id when an audit row anchors the
    // transition. UUID-shaped; anything else is rejected.
    proposed_action_id?: string;
    audit_event_id?: string;
  };
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
  if (args.patch.proposed_action_id !== undefined) {
    if (!UUID_RE.test(args.patch.proposed_action_id)) {
      return { ok: false, code: "INVALID_REQUEST", message: "invalid proposed_action_id" };
    }
    data.proposed_action_id = args.patch.proposed_action_id;
  }
  if (args.patch.audit_event_id !== undefined) {
    if (!UUID_RE.test(args.patch.audit_event_id)) {
      return { ok: false, code: "INVALID_REQUEST", message: "invalid audit_event_id" };
    }
    data.audit_event_id = args.patch.audit_event_id;
  }
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
  // [PROD-UX-SCALE] optional server pagination; absent → legacy first page.
  skip?: number;
  take?: number;
}): Promise<WorkLedgerView[]> {
  const rows = await prisma.workLedgerEntry.findMany({
    where: {
      org_entity_id: args.org_entity_id,
      OR: [
        { owner_entity_id: args.caller_entity_id },
        { target_entity_id: args.caller_entity_id },
        { requester_entity_id: args.caller_entity_id },
      ],
      // Seeds are the admin queue; GOAL rows are objectives (their own surface) —
      // neither is "work" in My Work. A FOLLOW_UP row (a drafted send the caller
      // owns) IS the caller's pending work and belongs here — it is also
      // resumable as a rich send-card in Comms via getPendingFollowUps, but the
      // ledger row is the single store, surfaced on every relevant page.
      ledger_type: { notIn: ["ORG_SEEDING", "GOAL", "DOCUMENT_CONTEXT"] },
      NOT: { status: { in: ["CANCELLED", "EXPIRED"] } },
    },
    // Stable pagination order: created_at DESC with the id as a tiebreaker so
    // rows can never duplicate or vanish across pages.
    orderBy: [{ created_at: "desc" }, { ledger_entry_id: "desc" }],
    skip: args.skip ?? 0,
    take: args.take ?? 200,
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
  // [PROD-UX-P0R] — attach the routing/autonomy decision projection to every
  // item. PURE read over the already-projected view (persisted decider
  // outputs only); additive optional field, existing fields untouched.
  for (const entry of entries) {
    entry.routing = projectRoutingDecision(entry);
  }
  return entries;
}

export type TeamWorkResult =
  | { ok: true; entries: WorkLedgerView[] }
  | { ok: false; code: "TEAM_SCOPE_NOT_CONFIGURED"; message: string };

// Team Work — org-wide for managers/admins; honest blocker otherwise.
export async function getTeamWork(args: {
  org_entity_id: string;
  is_manager: boolean;
  // [PROD-UX-SCALE] optional server pagination; absent → legacy first page.
  skip?: number;
  take?: number;
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
      // ORG_SEEDING entries are admin org-seeding suggestions, GOAL rows are
      // objectives (their own surface) — neither is Team Work.
      ledger_type: { notIn: ["ORG_SEEDING", "GOAL", "DOCUMENT_CONTEXT"] },
      NOT: { status: { in: ["CANCELLED", "EXPIRED", "VERIFIED"] } },
    },
    // Stable pagination order: created_at DESC with the id tiebreaker so
    // rows never duplicate or vanish across pages.
    orderBy: [{ created_at: "desc" }, { ledger_entry_id: "desc" }],
    skip: args.skip ?? 0,
    take: args.take ?? 300,
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
  const views = rows.map((row) => {
    const view = projectLedger(row);
    if (row.owner_entity_id !== null) view.owner_display_name = nameFrom(names, row.owner_entity_id);
    if (row.requester_entity_id !== null) view.requester_display_name = nameFrom(names, row.requester_entity_id);
    if (row.target_entity_id !== null) view.target_display_name = nameFrom(names, row.target_entity_id);
    return view;
  });
  // [T-1] external-party context — read-only, deterministic links only
  // (details block / conversation-matched governed commitment /
  // roster-first governed-name match). Silent when unprovable.
  if (rows.length > 0) {
    await enrichExternalContext(rows, views, rows[0]!.org_entity_id);
  }
  return views;
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
  // Slice F — the ledger→Action link + the stored execution plan, so the
  // execution bridge (and CT surfaces) can read what a commitment executes
  // through and which governed Action it was promoted to. proposed_action_id
  // is null until the bridge creates the Action; execution_plan is the
  // camelCase plan object from details.execution_plan (safe projection —
  // already surfaced by org-query).
  proposed_action_id?: string;
  execution_plan?: Record<string, unknown>;
  // [PROD-UX-P0R] — the anchoring audit event link (persisted column; set by
  // the execution bridge / callers via patchLedgerEntry). Surfaced so the
  // routing projection can expose an audit_pointer. Additive + optional.
  audit_event_id?: string;
  // [PROD-UX-P0R] — the routing/autonomy decision PROJECTION for this row
  // (pure read over persisted decider outputs; see routing-decision.ts).
  // Attached by getMyWork and the :id/routing-decision route. Additive.
  routing?: RoutingDecisionView;
  // [GAP-J] — quiet source-lineage truth (safe scalars only; see
  // sourceLineageFromDetails). Present only when the row's source was
  // recorded by the ingest spine. Additive + optional.
  source_lineage?: SourceLineageProjection;
  // [AIX-1] — seeded-origin lineage (Gap W): calm, customer-safe labels for
  // rows born from setup seeding (CS-1 history / CS-5 documents). Present
  // only when details carry the seeded_context write-time lineage. Renders
  // "background context, not current truth unless confirmed" — never raw
  // metadata, never a current-truth claim. Additive + optional.
  seeded_origin?: SeededOriginProjection;
  // [T-1] — external-party context (context, not CRM): safe labels only,
  // present only when a deterministic org-scoped link proves it. Additive.
  external_context?: ExternalContextProjection;
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
  proposed_action_id: string | null;
  // [PROD-UX-P0R] — persisted column (schema.prisma WorkLedgerEntry). Optional
  // here so older row-shaped fixtures without it still project.
  audit_event_id?: string | null;
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

// ── [GAP-J] SAFE source-lineage projection ──────────────────────────────────
// The provenance block sourceEvidenceDetails() writes into details (one
// builder, one writer — comms-ingest) becomes a small closed-vocab scalar
// block so every surface can answer "where did this come from?" WITHOUT the
// backend ever shipping raw identifiers. Deliberately NEVER projected:
// source_id, dedupe_key, source_url, connector_identity, ingestion_run_id —
// raw ids/URLs are proof-tier material (audit surfaces), not row copy.
// NOTE (overlap, documented): org-query.service.ts sourceSystemOf() keeps its
// own lowercase+fallback pluck — it feeds lexical retrieval scoring, a
// different semantic; consolidating it here would change Ask-Otzar behavior.
export interface SourceLineageProjection {
  /** UPPER_SNAKE source system (SLACK / ZOOM / TRANSCRIPT / …) — closed-vocab
   *  shape-guarded; junk never becomes customer copy. */
  source_system: string;
  /** The stable external id EXISTS (provable provenance) — the id itself
   *  never crosses. */
  source_id_present: boolean;
  /** A safe excerpt exists (row.evidence quote) for the Why panel. */
  has_source_excerpt: boolean;
  /** Display name of the source actor (adapter's actor.name — a human name,
   *  never an entity id or handle-only token). */
  source_actor: string | null;
  /** When the source event happened (ISO). */
  source_timestamp: string | null;
}

const SOURCE_SYSTEM_SHAPE = /^[A-Z][A-Z0-9_]{1,31}$/;

// WHAT: pull the ingest provenance out of details + evidence into the SAFE
//        lineage block. Rows with no recorded source project undefined — the
//        UI renders an honest "Source not recorded yet", never an invented
//        origin.
// ── [AIX-1] Seeded-origin projection ────────────────────────────────────────
// Customer-safe read-through of the CS-1/CS-5 write-time lineage. The AI
// experience rule this serves: before retrieval exists, every seeded object
// a human can see must already be legible as BACKGROUND — dated, owned, and
// never presented as current truth. Raw metadata (provided_by ids, enums)
// never crosses the wire.
export interface SeededOriginProjection {
  origin: "seeded_history" | "seeded_document";
  /** "Seeded history" | "Seeded document context" (+ kind label). */
  origin_label: string;
  /** "Current" | "Historical" | "Unconfirmed" — only when recorded. */
  currentness_label?: string;
  /** e.g. "Covers 2025" — only when recorded. */
  covering_period_label?: string;
  boundary_label: string;
  confidence_note: string;
  // [AIX-2] human validation read-through — present only after someone
  // validated the row in-context. Labels only: the internal state enum,
  // the validator's entity id, and the timestamp never cross the wire.
  /** e.g. "Confirmed current" | "Marked outdated" — only when validated. */
  validation_state_label?: string;
  /** One sentence on how Otzar should treat it now. */
  validation_guidance?: string;
  // [RETENTION] present only when an admin retired this context from
  // active use. Labels only — the actor id and timestamp never cross.
  /** "Retired from active context" — only when retired. */
  lifecycle_state_label?: string;
}

// [AIX-2] internal relevance state → customer-safe labels. Raw states
// (confirmed/stale/wrong_scope/contradicted/needs_clarifier) stay server-side.
const CONTEXT_VALIDATION_LABELS: Record<string, { state_label: string; guidance: string }> = {
  confirmed: {
    state_label: "Confirmed current",
    guidance: "Confirmed as current by your team.",
  },
  stale: {
    state_label: "Marked outdated",
    guidance: "Otzar should use newer or live work instead.",
  },
  wrong_scope: {
    state_label: "Marked as wrong context",
    guidance: "It does not apply to this work.",
  },
  contradicted: {
    state_label: "Marked as conflicting with newer work",
    guidance: "Otzar should ask before acting on it.",
  },
  needs_clarifier: {
    state_label: "Waiting on the right person",
    guidance: "Otzar needs the right person to confirm this.",
  },
};

export function seededOriginFromDetails(details: unknown): SeededOriginProjection | undefined {
  if (typeof details !== "object" || details === null) return undefined;
  const d = details as Record<string, unknown>;
  const sc = d.seeded_context;
  if (typeof sc !== "object" || sc === null || Array.isArray(sc)) return undefined;
  const scObj = sc as Record<string, unknown>;
  const doc =
    typeof d.document === "object" && d.document !== null && !Array.isArray(d.document)
      ? (d.document as Record<string, unknown>)
      : null;
  const isDocument = doc !== null;
  const kindLabel =
    isDocument && typeof doc.kind_label === "string" && doc.kind_label.trim().length > 0
      ? doc.kind_label.trim().slice(0, 40)
      : null;
  const currentnessRaw = isDocument && typeof doc.currentness === "string" ? doc.currentness : null;
  const currentnessLabel =
    currentnessRaw === "current" ? "Current"
    : currentnessRaw === "historical" ? "Historical"
    : currentnessRaw === "unknown" ? "Unconfirmed"
    : undefined;
  const period =
    typeof scObj.covering_period === "string" && scObj.covering_period.trim().length > 0
      ? scObj.covering_period.trim().slice(0, 80)
      : undefined;
  // [AIX-2] read the human validation, if one exists, as labels only.
  const cr = d.context_relevance;
  const crState =
    typeof cr === "object" && cr !== null && !Array.isArray(cr) &&
    typeof (cr as Record<string, unknown>).state === "string"
      ? ((cr as Record<string, unknown>).state as string)
      : null;
  const validation = crState !== null ? CONTEXT_VALIDATION_LABELS[crState] : undefined;
  return {
    origin: isDocument ? "seeded_document" : "seeded_history",
    origin_label: isDocument
      ? `Seeded document context${kindLabel !== null ? ` · ${kindLabel}` : ""}`
      : "Seeded history",
    ...(currentnessLabel !== undefined ? { currentness_label: currentnessLabel } : {}),
    ...(period !== undefined ? { covering_period_label: `Covers ${period}` } : {}),
    boundary_label: "Company-owned background context — not personal Twin memory.",
    confidence_note:
      "Use as background unless live work or the right person confirms it is current.",
    ...(validation !== undefined
      ? {
          validation_state_label: validation.state_label,
          validation_guidance: validation.guidance,
        }
      : {}),
    // [RETENTION] the retired label — read from context_lifecycle.
    ...((): { lifecycle_state_label?: string } => {
      const lc = d.context_lifecycle;
      const retired =
        typeof lc === "object" && lc !== null && !Array.isArray(lc) &&
        (lc as Record<string, unknown>).state === "retired";
      return retired ? { lifecycle_state_label: "Retired from active context" } : {};
    })(),
  };
}

export function sourceLineageFromDetails(
  details: unknown,
  evidence: unknown,
): SourceLineageProjection | undefined {
  if (typeof details !== "object" || details === null) return undefined;
  const d = details as Record<string, unknown>;
  let rawSystem = typeof d.source_system === "string" ? d.source_system.toUpperCase() : null;
  if (rawSystem === null) {
    // Transcript-era rows carry no provenance block, but the ingest tag
    // ("transcript_ingest") IS recorded truth — derive the system from it.
    // Anything without a recorded tag stays undefined: never invent lineage.
    const tag = typeof d.source === "string" ? /^([a-z0-9_]+)_ingest$/.exec(d.source) : null;
    rawSystem = tag !== null ? (tag[1] ?? "").toUpperCase() : null;
  }
  if (rawSystem === null || !SOURCE_SYSTEM_SHAPE.test(rawSystem)) return undefined;
  const actor =
    typeof d.source_actor === "string" && d.source_actor.trim().length > 0
      ? d.source_actor.slice(0, 120)
      : null;
  const ts = typeof d.source_timestamp === "string" ? d.source_timestamp : null;
  const hasExcerpt =
    (Array.isArray(evidence) &&
      evidence.some(
        (e) =>
          typeof e === "object" && e !== null &&
          (typeof (e as Record<string, unknown>).quote === "string" ||
            typeof (e as Record<string, unknown>).excerpt === "string"),
      )) ||
    typeof d.source_excerpt === "string";
  return {
    source_system: rawSystem,
    source_id_present: typeof d.source_id === "string" && d.source_id.length > 0,
    has_source_excerpt: hasExcerpt,
    source_actor: actor,
    source_timestamp: ts,
  };
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
  const sourceLineage = sourceLineageFromDetails(row.details, row.evidence);
  const seededOrigin = seededOriginFromDetails(row.details);
  const coordination = coordinationFromDetails(row.details);
  const watchers = watchersFromDetails(row.details);
  const detailsObj =
    typeof row.details === "object" && row.details !== null
      ? (row.details as Record<string, unknown>)
      : undefined;
  const sourceMessageId = detailsObj?.source_message_id;
  const executionPlan =
    detailsObj !== undefined &&
    typeof detailsObj.execution_plan === "object" &&
    detailsObj.execution_plan !== null &&
    !Array.isArray(detailsObj.execution_plan)
      ? (detailsObj.execution_plan as Record<string, unknown>)
      : undefined;
  return {
    ...(typeof sourceMessageId === "string" ? { source_message_id: sourceMessageId } : {}),
    ...(row.proposed_action_id !== null ? { proposed_action_id: row.proposed_action_id } : {}),
    // [PROD-UX-P0R] — surface the persisted audit link for routing projections.
    ...(typeof row.audit_event_id === "string" ? { audit_event_id: row.audit_event_id } : {}),
    ...(executionPlan !== undefined ? { execution_plan: executionPlan } : {}),
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
    // [GAP-J] quiet lineage truth: present only when the row's source was
    // actually recorded — the UI never invents an origin.
    ...(sourceLineage !== undefined ? { source_lineage: sourceLineage } : {}),
    ...(seededOrigin !== undefined ? { seeded_origin: seededOrigin } : {}),
  };
}
