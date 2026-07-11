// FILE: queries/otzar-obligations.ts
// PURPOSE: [OTZAR STAGE-2 §5-§9] The ONE canonical, scope-gated read+transition layer for
//          durable organizational OBLIGATIONS (the `obligations` table). An obligation is a
//          first-class unresolved RESPONSIBILITY that LINKS the request/action/conversation
//          spine — it never copies execution state. Every read/transition REQUIRES the
//          caller's (org, subject, twin) scope, never keys on obligation_id alone, so a
//          foreign obligation is indistinguishable from "not found" (no disclosure).
// SAFETY: returns SAFE projections only — never raw internal refs (surfaced as booleans),
//          never provider tokens, never raw payloads (ADR-0057 §16). Lifecycle transitions
//          are optimistic-concurrency (version) compare-and-set; terminal states are
//          append-only; completion requires a VALIDATED durable evidence ref read THROUGH the
//          linked turn/action terminal state; EXPIRED is never success.
// CONNECTS TO: otzar.service.ts (obligation endpoints + projections), work_ledger_entries
//          (action_ref execution truth), otzar_conversation_turns (evidence/ack turns).

import { prisma } from "../client.js";

// ── Typed vocabularies (service-tier enforced; String columns stay additive) ──────────────

export type ObligationState =
  | "OPEN" | "AWAITING_RESPONSE" | "ACKNOWLEDGED" | "IN_PROGRESS" | "BLOCKED"
  | "ESCALATED" | "COMPLETED" | "CANCELLED" | "SUPERSEDED" | "EXPIRED";

export type ObligationType =
  | "QUESTION_RESPONSE" | "ACTION_CONFIRMATION" | "FOLLOW_UP" | "BLOCKED_TASK"
  | "CLARIFICATION" | "SAFETY_CONCERN" | "HANDOFF" | "ESCALATION_ACK" | "PROVIDER_REVIEW";

/** Terminal (append-only) states — no transition may leave these. */
export const TERMINAL_OBLIGATION_STATES: readonly ObligationState[] = [
  "COMPLETED", "CANCELLED", "SUPERSEDED", "EXPIRED",
];
/** Non-terminal states — an obligation still "owes" something. */
export const OPEN_OBLIGATION_STATES: readonly ObligationState[] = [
  "OPEN", "AWAITING_RESPONSE", "ACKNOWLEDGED", "IN_PROGRESS", "BLOCKED", "ESCALATED",
];

/** Caller scope for every obligation read/transition. Twin REQUIRED (distinct human–Twin
 *  responsibility contexts must never blend). */
export interface ObligationScope {
  org_entity_id: string;
  subject_entity_id: string;
  twin_entity_id: string;
}

// ── Safe projection ───────────────────────────────────────────────────────────────────────

/** Safe obligation projection. Internal execution refs (action_ref, request_record_id,
 *  escalation_id) are surfaced ONLY as booleans; details is the designed-safe structured
 *  field; never a lease/provider token or raw payload. */
export interface SafeObligation {
  obligation_id: string;
  obligation_type: string;
  title: string;
  details: Record<string, unknown>;
  state: string;
  priority: string;
  required_response_class: string | null;
  source_channel: string;
  provenance_class: string;
  conversation_id: string | null;
  source_turn_id: string | null;
  responsible_entity_id: string;
  has_action: boolean;
  has_completion_evidence: boolean;
  is_escalated: boolean;
  is_terminal: boolean;
  version: number;
  created_at: Date;
  due_at: Date | null;
  acknowledged_at: Date | null;
  completed_at: Date | null;
}

const OBLIGATION_SELECT = {
  obligation_id: true, obligation_type: true, title: true, details: true, state: true,
  priority: true, required_response_class: true, source_channel: true, provenance_class: true,
  conversation_id: true, source_turn_id: true, responsible_entity_id: true,
  action_ref: true, completion_turn_id: true, completion_action_ref: true, escalation_id: true,
  version: true, created_at: true, due_at: true, acknowledged_at: true, completed_at: true,
} as const;

type ObligationRow = {
  obligation_id: string; obligation_type: string; title: string; details: unknown; state: string;
  priority: string; required_response_class: string | null; source_channel: string; provenance_class: string;
  conversation_id: string | null; source_turn_id: string | null; responsible_entity_id: string;
  action_ref: string | null; completion_turn_id: string | null; completion_action_ref: string | null;
  escalation_id: string | null; version: number; created_at: Date; due_at: Date | null;
  acknowledged_at: Date | null; completed_at: Date | null;
};

function toSafeObligation(row: ObligationRow): SafeObligation {
  return {
    obligation_id: row.obligation_id,
    obligation_type: row.obligation_type,
    title: row.title,
    details: (row.details ?? {}) as Record<string, unknown>,
    state: row.state,
    priority: row.priority,
    required_response_class: row.required_response_class,
    source_channel: row.source_channel,
    provenance_class: row.provenance_class,
    conversation_id: row.conversation_id,
    source_turn_id: row.source_turn_id,
    responsible_entity_id: row.responsible_entity_id,
    has_action: row.action_ref !== null,
    has_completion_evidence: row.completion_turn_id !== null || row.completion_action_ref !== null,
    is_escalated: row.escalation_id !== null,
    is_terminal: (TERMINAL_OBLIGATION_STATES as readonly string[]).includes(row.state),
    version: row.version,
    created_at: row.created_at,
    due_at: row.due_at,
    acknowledged_at: row.acknowledged_at,
    completed_at: row.completed_at,
  };
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002";
}

// ── Intake (create-or-get idempotency) ─────────────────────────────────────────────────────

export interface CreateObligationInput {
  obligation_type: ObligationType;
  title: string;
  creator_entity_id: string;
  responsible_entity_id: string;
  /** Deterministic per-org idempotency key (e.g. "awaiting_confirmation:<ledger_entry_id>",
   *  "question:<source_turn_id>"). NULL = no dedup (always create). */
  origin_key?: string | null;
  initial_state?: ObligationState;
  priority?: string;
  required_response_class?: string | null;
  source_channel?: string;
  provenance_class?: string;
  details?: Record<string, unknown>;
  conversation_id?: string | null;
  source_turn_id?: string | null;
  request_record_id?: string | null;
  action_ref?: string | null;
  escalation_id?: string | null;
  parent_obligation_id?: string | null;
  superseded_obligation_id?: string | null;
  subject_ref?: string | null;
  subject_ref_class?: string | null;
  assigned_workspace_id?: string | null;
  delegated_principal_id?: string | null;
  authority_scope?: string | null;
  due_at?: Date | null;
  escalate_at?: Date | null;
  source_timezone?: string | null;
  effective_at?: Date | null;
  visibility_scope?: string;
  retention_class?: string;
}

/**
 * Create the obligation, or return the existing one when a NON-NULL origin_key already exists
 * for this org (create-then-catch-P2002-and-fetch). A concurrent duplicate resolves to the
 * SAME row — never two obligations for one logical origin (invariant §6.1).
 */
export async function createOrGetObligation(
  scope: ObligationScope,
  input: CreateObligationInput,
): Promise<{ obligation: SafeObligation; created: boolean }> {
  try {
    const obligation = await prisma.obligation.create({
      select: OBLIGATION_SELECT,
      data: {
        org_entity_id: scope.org_entity_id,
        subject_entity_id: scope.subject_entity_id,
        twin_entity_id: scope.twin_entity_id,
        obligation_type: input.obligation_type,
        title: input.title,
        creator_entity_id: input.creator_entity_id,
        responsible_entity_id: input.responsible_entity_id,
        origin_key: input.origin_key ?? null,
        state: input.initial_state ?? "OPEN",
        priority: input.priority ?? "ROUTINE",
        required_response_class: input.required_response_class ?? null,
        source_channel: input.source_channel ?? "CHAT",
        provenance_class: input.provenance_class ?? "CONVERSATION",
        details: (input.details ?? {}) as object,
        conversation_id: input.conversation_id ?? null,
        source_turn_id: input.source_turn_id ?? null,
        request_record_id: input.request_record_id ?? null,
        action_ref: input.action_ref ?? null,
        escalation_id: input.escalation_id ?? null,
        parent_obligation_id: input.parent_obligation_id ?? null,
        superseded_obligation_id: input.superseded_obligation_id ?? null,
        subject_ref: input.subject_ref ?? null,
        subject_ref_class: input.subject_ref_class ?? null,
        assigned_workspace_id: input.assigned_workspace_id ?? null,
        delegated_principal_id: input.delegated_principal_id ?? null,
        authority_scope: input.authority_scope ?? null,
        due_at: input.due_at ?? null,
        escalate_at: input.escalate_at ?? null,
        source_timezone: input.source_timezone ?? null,
        effective_at: input.effective_at ?? null,
        visibility_scope: input.visibility_scope ?? "SUBJECT",
        retention_class: input.retention_class ?? "STANDARD",
      },
    });
    return { obligation: toSafeObligation(obligation as unknown as ObligationRow), created: true };
  } catch (e) {
    if (!isUniqueViolation(e) || input.origin_key == null) throw e;
    const existing = await prisma.obligation.findUnique({
      where: { org_entity_id_origin_key: { org_entity_id: scope.org_entity_id, origin_key: input.origin_key } },
      select: OBLIGATION_SELECT,
    });
    if (existing === null) throw e;
    return { obligation: toSafeObligation(existing as unknown as ObligationRow), created: false };
  }
}

// ── Scope-gated reads (restoration survives thread close/archive/staff-change: NOT
//    join-gated on conversation status; scoped by (org, subject, twin, state) only) ──────────

export interface ListObligationsOptions {
  states?: ObligationState[];
  obligation_type?: ObligationType;
  conversation_id?: string;
  /** true → only non-terminal (still-owed) obligations. */
  open_only?: boolean;
  limit?: number;
}

export async function listObligations(
  scope: ObligationScope,
  options: ListObligationsOptions = {},
): Promise<SafeObligation[]> {
  const take = Math.min(Math.max(options.limit ?? 30, 1), 100);
  const states =
    options.states !== undefined
      ? options.states
      : options.open_only === true
        ? (OPEN_OBLIGATION_STATES as readonly string[] as string[])
        : undefined;
  const rows = await prisma.obligation.findMany({
    where: {
      org_entity_id: scope.org_entity_id,
      subject_entity_id: scope.subject_entity_id,
      twin_entity_id: scope.twin_entity_id,
      ...(states !== undefined ? { state: { in: states } } : {}),
      ...(options.obligation_type !== undefined ? { obligation_type: options.obligation_type } : {}),
      ...(options.conversation_id !== undefined ? { conversation_id: options.conversation_id } : {}),
    },
    orderBy: [{ created_at: "desc" }],
    take,
    select: OBLIGATION_SELECT,
  });
  return rows.map(toSafeObligation);
}

/** Single obligation, scope-gated. Foreign/absent → null (indistinguishable, no disclosure). */
export async function getObligationForScope(
  scope: ObligationScope,
  obligationId: string,
): Promise<SafeObligation | null> {
  const row = await prisma.obligation.findFirst({
    where: {
      obligation_id: obligationId,
      org_entity_id: scope.org_entity_id,
      subject_entity_id: scope.subject_entity_id,
      twin_entity_id: scope.twin_entity_id,
    },
    select: OBLIGATION_SELECT,
  });
  return row === null ? null : toSafeObligation(row);
}

// ── Lifecycle transitions (optimistic-concurrency CAS; typed outcomes) ─────────────────────

export type TransitionOutcome =
  | { kind: "ok"; obligation: SafeObligation }
  | { kind: "not_found" } // absent or out of scope
  | { kind: "stale_version"; current: SafeObligation } // expected_version mismatch
  | { kind: "illegal_transition"; current: SafeObligation } // from-state not permitted
  | { kind: "evidence_required" } // completion without a validated durable ref
  | { kind: "not_acknowledgeable" }; // ack actor/turn does not authorize acknowledgement

interface CasArgs {
  obligation_id: string;
  expected_version: number;
}

/** Read a row under full scope; returns the raw row (for internal validation) or null. */
async function readScoped(scope: ObligationScope, obligationId: string) {
  return prisma.obligation.findFirst({
    where: {
      obligation_id: obligationId,
      org_entity_id: scope.org_entity_id,
      subject_entity_id: scope.subject_entity_id,
      twin_entity_id: scope.twin_entity_id,
    },
  });
}

/** Classify a failed CAS (rowcount 0) by re-reading under scope. */
async function classifyCasFailure(
  scope: ObligationScope,
  args: CasArgs,
  legalFrom: readonly ObligationState[],
): Promise<Exclude<TransitionOutcome, { kind: "ok" }>> {
  const row = await readScoped(scope, args.obligation_id);
  if (row === null) return { kind: "not_found" };
  const safe = toSafeObligation(row as unknown as ObligationRow);
  if (row.version !== args.expected_version) return { kind: "stale_version", current: safe };
  if (!(legalFrom as readonly string[]).includes(row.state)) return { kind: "illegal_transition", current: safe };
  // Version matched and state legal but the write still updated 0 rows → treat as stale (a
  // concurrent writer moved it between our read and CAS).
  return { kind: "stale_version", current: safe };
}

/**
 * Generic guarded CAS: UPDATE ... SET <assignments>, version=version+1 WHERE id + scope +
 * version=expected + state IN legalFrom. Returns the updated safe row or a typed failure.
 * The scope predicate is IN the WHERE clause so a foreign caller can never transition a row.
 */
async function casTransition(
  scope: ObligationScope,
  args: CasArgs,
  legalFrom: readonly ObligationState[],
  toState: ObligationState,
  timestampColumn: string | null,
  extra: Record<string, string | null> = {},
): Promise<TransitionOutcome> {
  const sets: string[] = [`state = '${toState}'`, `version = version + 1`, `updated_at = now()`];
  if (timestampColumn !== null) sets.push(`${timestampColumn} = now()`);
  const params: Array<string | null> = [];
  for (const [col, val] of Object.entries(extra)) {
    params.push(val);
    sets.push(`${col} = $${params.length}::uuid`);
  }
  // Positional params after the extra-column values: id, expected_version, org, subject, twin.
  const pId = params.length + 1;
  const pVer = params.length + 2;
  const pOrg = params.length + 3;
  const pSub = params.length + 4;
  const pTwin = params.length + 5;
  const fromList = legalFrom.map((s) => `'${s}'`).join(", ");
  const sql =
    `UPDATE obligations SET ${sets.join(", ")} ` +
    `WHERE obligation_id = $${pId}::uuid AND version = $${pVer}::int ` +
    `AND org_entity_id = $${pOrg}::uuid AND subject_entity_id = $${pSub}::uuid AND twin_entity_id = $${pTwin}::uuid ` +
    `AND state IN (${fromList})`;
  const n = await prisma.$executeRawUnsafe(
    sql,
    ...params,
    args.obligation_id,
    args.expected_version,
    scope.org_entity_id,
    scope.subject_entity_id,
    scope.twin_entity_id,
  );
  if (n !== 1) return classifyCasFailure(scope, args, legalFrom);
  const row = await readScoped(scope, args.obligation_id);
  if (row === null) return { kind: "not_found" };
  return { kind: "ok", obligation: toSafeObligation(row as unknown as ObligationRow) };
}

const ACK_FROM: readonly ObligationState[] = ["OPEN", "AWAITING_RESPONSE", "ESCALATED"];

/**
 * Acknowledge — ONLY the responsible actor (or an authorized delegate) via a USER turn may
 * acknowledge. A generated ASSISTANT/twin turn can NEVER acknowledge (invariant §6.4). The
 * acknowledging turn must be a USER turn authored by the responsible/delegate in-scope.
 */
export async function acknowledgeObligation(
  scope: ObligationScope,
  args: CasArgs & { acknowledged_turn_id: string; actor_entity_id: string },
): Promise<TransitionOutcome> {
  const row = await readScoped(scope, args.obligation_id);
  if (row === null) return { kind: "not_found" };
  // The acknowledging actor must be the responsible party or its delegated principal.
  const authorized =
    args.actor_entity_id === row.responsible_entity_id ||
    (row.delegated_principal_id !== null && args.actor_entity_id === row.delegated_principal_id);
  if (!authorized) return { kind: "not_acknowledgeable" };
  // The evidence turn must exist, be a USER turn, be in the same conversation + scope, and be
  // authored by that same authorized actor — a twin/ASSISTANT turn can never acknowledge.
  const turn = await prisma.otzarConversationTurn.findUnique({
    where: { turn_id: args.acknowledged_turn_id },
    select: { role: true, author_entity_id: true, conversation_id: true, org_entity_id: true, subject_entity_id: true },
  });
  if (
    turn === null || turn.role !== "USER" ||
    turn.author_entity_id !== args.actor_entity_id ||
    turn.org_entity_id !== scope.org_entity_id ||
    turn.subject_entity_id !== scope.subject_entity_id ||
    (row.conversation_id !== null && turn.conversation_id !== row.conversation_id)
  ) {
    return { kind: "not_acknowledgeable" };
  }
  return casTransition(scope, args, ACK_FROM, "ACKNOWLEDGED", "acknowledged_at", {
    acknowledged_turn_id: args.acknowledged_turn_id,
  });
}

const START_FROM: readonly ObligationState[] = ["ACKNOWLEDGED", "BLOCKED"];
export async function startObligation(scope: ObligationScope, args: CasArgs): Promise<TransitionOutcome> {
  return casTransition(scope, args, START_FROM, "IN_PROGRESS", null);
}

const BLOCK_FROM: readonly ObligationState[] = ["OPEN", "AWAITING_RESPONSE", "ACKNOWLEDGED", "IN_PROGRESS", "ESCALATED"];
export async function blockObligation(scope: ObligationScope, args: CasArgs): Promise<TransitionOutcome> {
  return casTransition(scope, args, BLOCK_FROM, "BLOCKED", null);
}

const ESCALATE_FROM: readonly ObligationState[] = ["OPEN", "AWAITING_RESPONSE", "ACKNOWLEDGED", "IN_PROGRESS", "BLOCKED"];
export async function escalateObligation(
  scope: ObligationScope,
  args: CasArgs & { escalation_id?: string | null },
): Promise<TransitionOutcome> {
  return casTransition(scope, args, ESCALATE_FROM, "ESCALATED", "escalate_at",
    args.escalation_id != null ? { escalation_id: args.escalation_id } : {});
}

const CANCEL_FROM = OPEN_OBLIGATION_STATES;
export async function cancelObligation(scope: ObligationScope, args: CasArgs): Promise<TransitionOutcome> {
  return casTransition(scope, args, CANCEL_FROM, "CANCELLED", "cancelled_at");
}

const EXPIRE_FROM = OPEN_OBLIGATION_STATES;
/** Expiry is NOT success: it sets expired_at only, never completed_at (invariant §6.3). */
export async function expireObligation(scope: ObligationScope, args: CasArgs): Promise<TransitionOutcome> {
  return casTransition(scope, args, EXPIRE_FROM, "EXPIRED", "expired_at");
}

const COMPLETE_FROM: readonly ObligationState[] = ["OPEN", "AWAITING_RESPONSE", "ACKNOWLEDGED", "IN_PROGRESS", "BLOCKED", "ESCALATED"];

export interface CompleteObligationArgs extends CasArgs {
  completion_turn_id?: string | null;
  completion_action_ref?: string | null;
  completion_evidence?: Record<string, unknown> | null;
}

/**
 * Complete — requires a VALIDATED durable evidence ref, read THROUGH the linked turn/action's
 * terminal state (invariant §6.2/§6.3/§6.10). A freeform completion_evidence Json alone NEVER
 * satisfies. For an ACTION_CONFIRMATION obligation the linked WorkLedgerEntry (action_ref, or
 * the supplied completion_action_ref) MUST be terminally EXECUTED. For other types a
 * completion_turn_id must exist as a real turn in the same conversation + scope. Silence is
 * never completion.
 */
export async function completeObligation(
  scope: ObligationScope,
  args: CompleteObligationArgs,
): Promise<TransitionOutcome> {
  const row = await readScoped(scope, args.obligation_id);
  if (row === null) return { kind: "not_found" };

  // Validate a durable evidence ref exists and is coherent BEFORE the CAS.
  let evidenceValidated = false;
  const actionRef = args.completion_action_ref ?? row.action_ref;

  if (row.obligation_type === "ACTION_CONFIRMATION") {
    // Execution truth lives on the linked WorkLedgerEntry — read THROUGH it; it must be EXECUTED.
    if (actionRef !== null) {
      const led = await prisma.workLedgerEntry.findUnique({
        where: { ledger_entry_id: actionRef },
        select: { status: true, org_entity_id: true, owner_entity_id: true },
      });
      if (
        led !== null && led.status === "EXECUTED" &&
        led.org_entity_id === scope.org_entity_id &&
        (led.owner_entity_id === null || led.owner_entity_id === scope.subject_entity_id)
      ) {
        evidenceValidated = true;
      }
    }
  } else if (args.completion_turn_id != null) {
    // A completion turn must be a real turn in the same conversation + scope.
    const turn = await prisma.otzarConversationTurn.findUnique({
      where: { turn_id: args.completion_turn_id },
      select: { conversation_id: true, org_entity_id: true, subject_entity_id: true },
    });
    if (
      turn !== null &&
      turn.org_entity_id === scope.org_entity_id &&
      turn.subject_entity_id === scope.subject_entity_id &&
      (row.conversation_id === null || turn.conversation_id === row.conversation_id)
    ) {
      evidenceValidated = true;
    }
  } else if (actionRef !== null) {
    // A non-confirmation obligation completed by a terminally-successful action.
    const led = await prisma.workLedgerEntry.findUnique({
      where: { ledger_entry_id: actionRef },
      select: { status: true, org_entity_id: true },
    });
    if (led !== null && led.status === "EXECUTED" && led.org_entity_id === scope.org_entity_id) {
      evidenceValidated = true;
    }
  }

  if (!evidenceValidated) return { kind: "evidence_required" };

  const extra: Record<string, string | null> = {};
  if (args.completion_turn_id != null) extra.completion_turn_id = args.completion_turn_id;
  if (actionRef != null) extra.completion_action_ref = actionRef;
  const outcome = await casTransition(scope, args, COMPLETE_FROM, "COMPLETED", "completed_at", extra);
  // Persist the safe structured evidence blob (secondary; never the sole proof).
  if (outcome.kind === "ok" && args.completion_evidence != null) {
    await prisma.obligation.update({
      where: { obligation_id: args.obligation_id },
      data: { completion_evidence: args.completion_evidence as object },
    });
  }
  return outcome;
}

export interface ReassignArgs extends CasArgs {
  new_responsible_entity_id: string;
  assigning_actor_entity_id: string;
  reason: string;
}

export interface ReassignResult {
  outcome: TransitionOutcome;
  /** Prior responsibility state captured for the audit lineage (invariant §6.7). */
  prior?: {
    previous_responsible_entity_id: string;
    previous_state: string;
    previous_acknowledged_at: Date | null;
  };
}

/**
 * Reassign — updates responsible_entity_id, resets acknowledgement (the new party has NOT
 * acknowledged), and RETURNS the prior responsibility state so the service tier records the
 * full lineage in the audit event (invariant §6.7: previous responsible, new responsible,
 * assigning actor, reason, timestamp, prior ack). History is preserved, never rewritten.
 * Only non-terminal obligations can be reassigned.
 */
export async function reassignObligation(scope: ObligationScope, args: ReassignArgs): Promise<ReassignResult> {
  const row = await readScoped(scope, args.obligation_id);
  if (row === null) return { outcome: { kind: "not_found" } };
  const prior = {
    previous_responsible_entity_id: row.responsible_entity_id,
    previous_state: row.state,
    previous_acknowledged_at: row.acknowledged_at,
  };
  // Reset ack + move to AWAITING_RESPONSE (new party owes a response). CAS on version + scope.
  const n = await prisma.$executeRawUnsafe(
    `UPDATE obligations SET responsible_entity_id = $1::uuid, state = 'AWAITING_RESPONSE', ` +
      `acknowledged_at = NULL, acknowledged_turn_id = NULL, version = version + 1, updated_at = now() ` +
      `WHERE obligation_id = $2::uuid AND version = $3::int ` +
      `AND org_entity_id = $4::uuid AND subject_entity_id = $5::uuid AND twin_entity_id = $6::uuid ` +
      `AND state IN (${OPEN_OBLIGATION_STATES.map((s) => `'${s}'`).join(", ")})`,
    args.new_responsible_entity_id,
    args.obligation_id,
    args.expected_version,
    scope.org_entity_id,
    scope.subject_entity_id,
    scope.twin_entity_id,
  );
  if (n !== 1) {
    return { outcome: await classifyCasFailure(scope, args, OPEN_OBLIGATION_STATES) };
  }
  const updated = await readScoped(scope, args.obligation_id);
  return {
    outcome: updated === null ? { kind: "not_found" } : { kind: "ok", obligation: toSafeObligation(updated as unknown as ObligationRow) },
    prior,
  };
}

export interface SupersedeResult {
  outcome: TransitionOutcome;
  /** The replacement obligation created (when the supersession succeeded). */
  replacement?: SafeObligation;
}

/**
 * Supersede — create a NEW obligation linked to the old (superseded_obligation_id + parent),
 * then transition the OLD to SUPERSEDED. Correction creates a LINKED replacement; it does NOT
 * rewrite the original (invariants §6.5/§6.6). Both in one transaction so a partial supersede
 * never leaves two live obligations. The old→SUPERSEDED CAS is guarded on version + scope.
 */
export async function supersedeObligation(
  scope: ObligationScope,
  args: CasArgs & { replacement: CreateObligationInput },
): Promise<SupersedeResult> {
  const old = await readScoped(scope, args.obligation_id);
  if (old === null) return { outcome: { kind: "not_found" } };
  if ((TERMINAL_OBLIGATION_STATES as readonly string[]).includes(old.state)) {
    return { outcome: { kind: "illegal_transition", current: toSafeObligation(old as unknown as ObligationRow) } };
  }
  try {
    const replacement = await prisma.$transaction(async (tx) => {
      const n = await tx.$executeRawUnsafe(
        `UPDATE obligations SET state = 'SUPERSEDED', superseded_at = now(), version = version + 1, updated_at = now() ` +
          `WHERE obligation_id = $1::uuid AND version = $2::int ` +
          `AND org_entity_id = $3::uuid AND subject_entity_id = $4::uuid AND twin_entity_id = $5::uuid ` +
          `AND state IN (${OPEN_OBLIGATION_STATES.map((s) => `'${s}'`).join(", ")})`,
        args.obligation_id,
        args.expected_version,
        scope.org_entity_id,
        scope.subject_entity_id,
        scope.twin_entity_id,
      );
      if (n !== 1) throw new ObligationCasConflict();
      const created = await tx.obligation.create({
        data: {
          org_entity_id: scope.org_entity_id,
          subject_entity_id: scope.subject_entity_id,
          twin_entity_id: scope.twin_entity_id,
          obligation_type: args.replacement.obligation_type,
          title: args.replacement.title,
          creator_entity_id: args.replacement.creator_entity_id,
          responsible_entity_id: args.replacement.responsible_entity_id,
          origin_key: args.replacement.origin_key ?? null,
          state: args.replacement.initial_state ?? "OPEN",
          priority: args.replacement.priority ?? old.priority,
          required_response_class: args.replacement.required_response_class ?? null,
          source_channel: args.replacement.source_channel ?? old.source_channel,
          provenance_class: args.replacement.provenance_class ?? old.provenance_class,
          details: (args.replacement.details ?? {}) as object,
          conversation_id: args.replacement.conversation_id ?? old.conversation_id,
          source_turn_id: args.replacement.source_turn_id ?? null,
          request_record_id: args.replacement.request_record_id ?? null,
          action_ref: args.replacement.action_ref ?? null,
          escalation_id: args.replacement.escalation_id ?? null,
          parent_obligation_id: args.obligation_id,
          superseded_obligation_id: args.obligation_id,
          subject_ref: args.replacement.subject_ref ?? old.subject_ref,
          subject_ref_class: args.replacement.subject_ref_class ?? old.subject_ref_class,
          due_at: args.replacement.due_at ?? null,
          visibility_scope: args.replacement.visibility_scope ?? old.visibility_scope,
          retention_class: args.replacement.retention_class ?? old.retention_class,
        },
        select: OBLIGATION_SELECT,
      });
      return created;
    });
    const refreshed = await readScoped(scope, args.obligation_id);
    return {
      outcome: refreshed === null ? { kind: "not_found" } : { kind: "ok", obligation: toSafeObligation(refreshed as unknown as ObligationRow) },
      replacement: toSafeObligation(replacement as unknown as ObligationRow),
    };
  } catch (e) {
    if (e instanceof ObligationCasConflict) {
      return { outcome: await classifyCasFailure(scope, args, OPEN_OBLIGATION_STATES) };
    }
    throw e;
  }
}

class ObligationCasConflict extends Error {
  constructor() {
    super("obligation_cas_conflict");
    this.name = "ObligationCasConflict";
  }
}

// ── Projection from existing spine state (§8: derive obligations from what already exists —
//    an awaiting-confirmation action, an unresolved assistant question — NOT hand-fed refs).
//    Each projection is IDEMPOTENT via a deterministic origin_key: re-projecting the same
//    spine row create-or-gets the SAME obligation, never a duplicate. Proves link-not-duplicate
//    against real pre-existing rows. ──────────────────────────────────────────────────────────

/** Result of a projection: the obligation (created or existing), or a reason it did not project. */
export type ProjectionResult =
  | { kind: "projected"; obligation: SafeObligation; created: boolean }
  | { kind: "not_projectable" }; // the spine row is absent, out of scope, or not in a projectable state

/**
 * Project an obligation from an awaiting-confirmation WorkLedgerEntry (e.g. a calendar proposal
 * in NEEDS_CALLER_CONFIRMATION). The obligation LINKS the ledger (action_ref) — execution truth
 * stays on the ledger. origin_key = "awaiting_confirmation:<ledger_entry_id>" → idempotent.
 */
export async function projectObligationFromAwaitingConfirmation(
  scope: ObligationScope,
  ledgerEntryId: string,
  options: { creator_entity_id?: string } = {},
): Promise<ProjectionResult> {
  const led = await prisma.workLedgerEntry.findUnique({
    where: { ledger_entry_id: ledgerEntryId },
    select: { org_entity_id: true, owner_entity_id: true, conversation_id: true, title: true, status: true },
  });
  if (
    led === null ||
    led.org_entity_id !== scope.org_entity_id ||
    (led.owner_entity_id !== null && led.owner_entity_id !== scope.subject_entity_id) ||
    led.status !== "NEEDS_CALLER_CONFIRMATION"
  ) {
    return { kind: "not_projectable" };
  }
  const { obligation, created } = await createOrGetObligation(scope, {
    obligation_type: "ACTION_CONFIRMATION",
    title: led.title,
    creator_entity_id: options.creator_entity_id ?? scope.twin_entity_id,
    responsible_entity_id: scope.subject_entity_id,
    origin_key: `awaiting_confirmation:${ledgerEntryId}`,
    initial_state: "AWAITING_RESPONSE",
    required_response_class: "CONFIRMATION",
    provenance_class: "CONVERSATION",
    action_ref: ledgerEntryId,
    conversation_id: led.conversation_id,
  });
  return { kind: "projected", obligation, created };
}

/**
 * Project an obligation from an unresolved assistant question — an OtzarConversationRequest that
 * COMPLETED asking the user something (response_class CLARIFICATION) and whose canonical
 * assistant turn is the question. The obligation LINKS the request + question turn.
 * origin_key = "question:<request_record_id>" → idempotent.
 */
export async function projectObligationFromUnresolvedQuestion(
  scope: ObligationScope,
  requestRecordId: string,
  options: { creator_entity_id?: string } = {},
): Promise<ProjectionResult> {
  const req = await prisma.otzarConversationRequest.findUnique({
    where: { request_record_id: requestRecordId },
    select: {
      org_entity_id: true, subject_entity_id: true, twin_entity_id: true, conversation_id: true,
      state: true, response_class: true, canonical_assistant_turn_id: true,
    },
  });
  if (
    req === null ||
    req.org_entity_id !== scope.org_entity_id ||
    req.subject_entity_id !== scope.subject_entity_id ||
    req.twin_entity_id !== scope.twin_entity_id ||
    req.state !== "COMPLETED" ||
    req.response_class !== "CLARIFICATION"
  ) {
    return { kind: "not_projectable" };
  }
  // A bounded, safe title from the question turn (safe natural-language content only).
  let title = "Answer the assistant's question";
  if (req.canonical_assistant_turn_id !== null) {
    const turn = await prisma.otzarConversationTurn.findUnique({
      where: { turn_id: req.canonical_assistant_turn_id },
      select: { content: true, role: true },
    });
    if (turn !== null && turn.role === "ASSISTANT" && turn.content.length > 0) {
      title = turn.content.length > 120 ? `${turn.content.slice(0, 117)}...` : turn.content;
    }
  }
  const { obligation, created } = await createOrGetObligation(scope, {
    obligation_type: "QUESTION_RESPONSE",
    title,
    creator_entity_id: options.creator_entity_id ?? scope.twin_entity_id,
    responsible_entity_id: scope.subject_entity_id,
    origin_key: `question:${requestRecordId}`,
    initial_state: "AWAITING_RESPONSE",
    required_response_class: "ANSWER",
    provenance_class: "CONVERSATION",
    request_record_id: requestRecordId,
    ...(req.canonical_assistant_turn_id !== null ? { source_turn_id: req.canonical_assistant_turn_id } : {}),
    conversation_id: req.conversation_id,
  });
  return { kind: "projected", obligation, created };
}
