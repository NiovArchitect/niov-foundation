// FILE: execution-verification.service.ts
// PURPOSE: Phase 1282 — the Execution Verification foundation. Records and
//          serves durable ExecutionAttempt evidence for WorkLedgerEntry
//          rows so the Work OS can prove that a runtime step actually
//          happened (the internal ledger write, the BEAM fanout, the
//          Python enrichment) rather than fake completion. An attempt is
//          EVIDENCE, never an action — recording a VERIFIED attempt never
//          executes anything. Tenant-scoped: every read/write is bound to
//          org_entity_id; no cross-tenant bleed.
// CONNECTS TO: @niov/database (executionAttempt), work-ledger.service.ts
//          (auto-records WORK_LEDGER_CREATE + PYTHON_ENRICHMENT), and the
//          work-os-ledger routes (BEAM_FANOUT + GET list endpoints).
//
// SAFETY: status is data. VERIFIED means "we have evidence this step
// completed", not "Foundation performed an external write". External
// writes remain governed by their own services.

import { prisma } from "@niov/database";

export const ATTEMPT_TYPES = [
  "WORK_LEDGER_CREATE",
  "BEAM_FANOUT",
  "PYTHON_ENRICHMENT",
  "CONNECTOR_EXECUTION",
] as const;
export const ATTEMPT_RUNTIMES = ["TYPESCRIPT", "BEAM", "PYTHON", "CONNECTOR"] as const;
export const ATTEMPT_EVIDENCE_TYPES = [
  "INTERNAL_RECORD",
  "PROVIDER_RESPONSE",
  "CONNECTOR_RECEIPT",
] as const;
export const ATTEMPT_STATUSES = ["VERIFIED", "FAILED", "PENDING", "UNVERIFIED"] as const;

export interface CreateAttemptInput {
  ledger_entry_id: string;
  org_entity_id: string;
  attempt_type: string;
  runtime: string;
  evidence_type: string;
  status: string;
  detail?: Record<string, unknown>;
  error_code?: string;
}

export interface ExecutionAttemptView {
  attempt_id: string;
  ledger_entry_id: string;
  attempt_type: string;
  runtime: string;
  evidence_type: string;
  status: string;
  detail: Record<string, unknown>;
  error_code: string | null;
  created_at: string;
  verified_at: string | null;
}

export interface AttemptFailure {
  ok: false;
  code: "INVALID_REQUEST";
  message: string;
}

function projectAttempt(row: {
  attempt_id: string;
  ledger_entry_id: string;
  attempt_type: string;
  runtime: string;
  evidence_type: string;
  status: string;
  detail: unknown;
  error_code: string | null;
  created_at: Date;
  verified_at: Date | null;
}): ExecutionAttemptView {
  return {
    attempt_id: row.attempt_id,
    ledger_entry_id: row.ledger_entry_id,
    attempt_type: row.attempt_type,
    runtime: row.runtime,
    evidence_type: row.evidence_type,
    status: row.status,
    detail: (row.detail ?? {}) as Record<string, unknown>,
    error_code: row.error_code,
    created_at: row.created_at.toISOString(),
    verified_at: row.verified_at ? row.verified_at.toISOString() : null,
  };
}

// WHAT: Record one ExecutionAttempt evidence row.
// OUTPUT: the persisted view, or INVALID_REQUEST on enum drift.
// WHY: closed-vocab validation keeps the evidence trail honest — a caller
//      cannot persist an attempt with an unknown runtime/status.
export async function createExecutionAttempt(
  input: CreateAttemptInput,
): Promise<{ ok: true; attempt: ExecutionAttemptView } | AttemptFailure> {
  if (!ATTEMPT_TYPES.includes(input.attempt_type as (typeof ATTEMPT_TYPES)[number])) {
    return { ok: false, code: "INVALID_REQUEST", message: "invalid attempt_type" };
  }
  if (!ATTEMPT_RUNTIMES.includes(input.runtime as (typeof ATTEMPT_RUNTIMES)[number])) {
    return { ok: false, code: "INVALID_REQUEST", message: "invalid runtime" };
  }
  if (
    !ATTEMPT_EVIDENCE_TYPES.includes(
      input.evidence_type as (typeof ATTEMPT_EVIDENCE_TYPES)[number],
    )
  ) {
    return { ok: false, code: "INVALID_REQUEST", message: "invalid evidence_type" };
  }
  if (!ATTEMPT_STATUSES.includes(input.status as (typeof ATTEMPT_STATUSES)[number])) {
    return { ok: false, code: "INVALID_REQUEST", message: "invalid status" };
  }

  const row = await prisma.executionAttempt.create({
    data: {
      ledger_entry_id: input.ledger_entry_id,
      org_entity_id: input.org_entity_id,
      attempt_type: input.attempt_type,
      runtime: input.runtime,
      evidence_type: input.evidence_type,
      status: input.status,
      detail: (input.detail ?? {}) as object,
      ...(input.error_code !== undefined && input.error_code.length > 0
        ? { error_code: input.error_code }
        : {}),
      ...(input.status === "VERIFIED" ? { verified_at: new Date() } : {}),
    },
  });
  return { ok: true, attempt: projectAttempt(row) };
}

// WHAT: Best-effort recorder — never throws. Used on the create/dispatch
//        hot path so evidence recording can never break a ledger write.
export async function recordExecutionAttempt(
  input: CreateAttemptInput,
): Promise<ExecutionAttemptView | null> {
  try {
    const r = await createExecutionAttempt(input);
    return r.ok ? r.attempt : null;
  } catch {
    return null;
  }
}

export interface AttemptFilters {
  ledger_entry_id?: string;
  status?: string;
}

// WHAT: List execution attempts for one tenant, optionally filtered.
// WHY: tenant isolation is ALWAYS enforced (org_entity_id AND filter) —
//      the org predicate is never replaced or broadened (ADR-0006).
export async function listExecutionAttempts(
  orgEntityId: string,
  filters: AttemptFilters = {},
): Promise<ExecutionAttemptView[]> {
  const rows = await prisma.executionAttempt.findMany({
    where: {
      org_entity_id: orgEntityId,
      ...(filters.ledger_entry_id !== undefined && filters.ledger_entry_id.length > 0
        ? { ledger_entry_id: filters.ledger_entry_id }
        : {}),
      ...(filters.status !== undefined && filters.status.length > 0
        ? { status: filters.status }
        : {}),
    },
    orderBy: { created_at: "desc" },
    take: 200,
  });
  return rows.map(projectAttempt);
}
