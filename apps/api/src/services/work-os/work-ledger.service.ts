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

import { prisma } from "@niov/database";

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
  const extraction = input.extraction_source ?? "TYPESCRIPT_DETERMINISTIC";
  if (!EXTRACTION_SOURCES.includes(extraction as (typeof EXTRACTION_SOURCES)[number])) {
    return { ok: false, code: "INVALID_REQUEST", message: "invalid extraction_source" };
  }

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
      details: (input.details ?? {}) as object,
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
  return { ok: true, entry: projectLedger(row) };
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
  return rows.map(projectLedger);
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
}

function projectLedger(row: LedgerRow): WorkLedgerView {
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
  };
}
