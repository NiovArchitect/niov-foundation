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
import {
  extractWorkSignals,
  type EnrichmentRuntimeConfig,
  type WorkSignalExtractionResult,
} from "../intelligence/python-enrichment.service.js";
import {
  recordExecutionAttempt,
  getFailedAttemptDigests,
} from "./execution-verification.service.js";

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

export type LedgerFailureCode = "INVALID_REQUEST" | "NOT_FOUND";

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

  // Phase 1282 — advisory Python enrichment. Runs BEFORE the write so the
  // (closed-vocab, audit-safe) signals can be merged into details. Never
  // overrides target resolution/policy/status — it only annotates and,
  // when it actually contributed signals on the default extraction path,
  // upgrades extraction_source to PYTHON_ENRICHED.
  let enrichment: WorkSignalExtractionResult | null = null;
  const callerPinnedExtraction = input.extraction_source !== undefined;
  if (
    input.enable_python_enrichment === true &&
    typeof input.enrichment_text === "string" &&
    input.enrichment_text.trim().length > 0
  ) {
    enrichment = await extractWorkSignals(
      {
        text: input.enrichment_text,
        ...(input.source_type !== undefined ? { source_type: input.source_type } : {}),
      },
      input.enrichment_runtime ?? {},
    );
    if (
      enrichment.status === "PYTHON_ENRICHED" &&
      enrichment.signals.length > 0 &&
      !callerPinnedExtraction
    ) {
      extraction = "PYTHON_ENRICHED";
    }
  }

  const detailsWithEnrichment: Record<string, unknown> = {
    ...(input.details ?? {}),
    ...(enrichment !== null
      ? {
          python_enrichment: {
            status: enrichment.status,
            signals: enrichment.signals,
            primary_signal: enrichment.primary_signal,
            multi_intent: enrichment.multi_intent,
          },
        }
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
  if (enrichment !== null) {
    const enriched =
      enrichment.status === "PYTHON_ENRICHED" && enrichment.signals.length > 0;
    await recordExecutionAttempt({
      ledger_entry_id: row.ledger_entry_id,
      org_entity_id: row.org_entity_id,
      attempt_type: "PYTHON_ENRICHMENT",
      runtime: "PYTHON",
      evidence_type: "PROVIDER_RESPONSE",
      status: enriched ? "VERIFIED" : "FAILED",
      detail: {
        enrichment_status: enrichment.status,
        signal_count: enrichment.signals.length,
        multi_intent: enrichment.multi_intent,
      },
      ...(enriched ? {} : { error_code: enrichment.status }),
    });
  }

  return { ok: true, entry: projectLedger(row) };
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
  return rows.map(projectLedger);
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
      NOT: { status: { in: ["CANCELLED", "EXPIRED", "VERIFIED"] } },
    },
    orderBy: { created_at: "desc" },
    take: 300,
  });
  return { ok: true, entries: rows.map(projectLedger) };
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
  const rawSignals = Array.isArray(o.signals) ? o.signals : [];
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

function projectLedger(row: LedgerRow): WorkLedgerView {
  const enrichment = enrichmentFromDetails(row.details);
  const coordination = coordinationFromDetails(row.details);
  const watchers = watchersFromDetails(row.details);
  return {
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
    ...(coordination !== undefined ? { coordination } : {}),
    ...(watchers !== undefined ? { watchers } : {}),
  };
}
