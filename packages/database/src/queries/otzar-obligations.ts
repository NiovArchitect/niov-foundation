// FILE: queries/otzar-obligations.ts
// PURPOSE: [OTZAR STAGE-2 §5-§9 + HARDENING C/E/G/I] The ONE canonical, scope-gated read +
//          transition layer for durable organizational OBLIGATIONS. An obligation is a first-
//          class unresolved RESPONSIBILITY that LINKS the request/action/conversation spine — it
//          never copies execution state. Every read/transition REQUIRES the caller's
//          (org, subject, twin) scope, never keys on obligation_id alone, so a foreign obligation
//          is indistinguishable from "not found" (no disclosure).
// HARDENING:
//   C  every governed mutation writes its OBLIGATION_* audit event INSIDE the mutation
//      transaction; if the audit write fails, the whole transition rolls back and the caller
//      gets a typed consistency failure — never silent success without audit evidence.
//   E  every supplied linked reference (conversation/turn/request/action/escalation/parent/
//      superseded) is validated against the EXACT scope before an obligation is created.
//   G  projections validate the full spine relationship (no null-owner auto-project; complete
//      canonical coherence) before deriving an obligation.
//   I  completion requires a VALIDATED durable evidence ref read THROUGH the terminal state.
// SAFETY: SAFE projections only (internal refs surfaced as booleans); never provider tokens or
//         raw payloads (ADR-0057 §16). Terminal states are append-only; EXPIRED is not success.
// CONNECTS TO: otzar.service.ts, otzar-obligation-validation.ts, audit.ts, work_ledger_entries.

import type { Prisma } from "@prisma/client";
import { prisma } from "../client.js";
import { writeAuditEvent, type AuditEventType } from "./audit.js";
import { validateSafeJson, isTerminalState } from "./otzar-obligation-validation.js";

// ── Typed vocabularies (service-tier enforced; String columns stay additive) ──────────────

export type ObligationState =
  | "OPEN" | "AWAITING_RESPONSE" | "ACKNOWLEDGED" | "IN_PROGRESS" | "BLOCKED"
  | "ESCALATED" | "COMPLETED" | "CANCELLED" | "SUPERSEDED" | "EXPIRED";

export type ObligationType =
  | "QUESTION_RESPONSE" | "ACTION_CONFIRMATION" | "FOLLOW_UP" | "BLOCKED_TASK"
  | "CLARIFICATION" | "SAFETY_CONCERN" | "HANDOFF" | "ESCALATION_ACK" | "PROVIDER_REVIEW";

export const TERMINAL_OBLIGATION_STATES: readonly ObligationState[] = [
  "COMPLETED", "CANCELLED", "SUPERSEDED", "EXPIRED",
];
export const OPEN_OBLIGATION_STATES: readonly ObligationState[] = [
  "OPEN", "AWAITING_RESPONSE", "ACKNOWLEDGED", "IN_PROGRESS", "BLOCKED", "ESCALATED",
];

/** Caller scope for every obligation read/transition. Twin REQUIRED. */
export interface ObligationScope {
  org_entity_id: string;
  subject_entity_id: string;
  twin_entity_id: string;
}

// [HARDENING C] Test-only seam to force an in-transaction audit-write failure (forks pool —
// module-scope flag, not vi.spyOn). Reset synchronously in a finally by the test wrapper.
export const __otzarObligationTestHooks = { failAudit: false };

// ── Safe projection ───────────────────────────────────────────────────────────────────────

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

// ── [HARDENING C] In-transaction audit write ────────────────────────────────────────────────

interface ObligationAudit {
  event_type: AuditEventType;
  actor_entity_id: string;
  details: Record<string, unknown>;
}

/** Write the obligation audit event INSIDE the caller's transaction. A throw here (real failure
 *  or the injected test hook) rolls the whole transition back — no governed success without
 *  durable audit evidence. */
async function writeObligationAuditInTx(tx: Prisma.TransactionClient, orgEntityId: string, audit: ObligationAudit): Promise<void> {
  if (__otzarObligationTestHooks.failAudit) throw new Error("injected obligation audit failure");
  await writeAuditEvent(
    { event_type: audit.event_type, outcome: "SUCCESS", actor_entity_id: audit.actor_entity_id, target_entity_id: orgEntityId, details: audit.details },
    tx,
  );
}

// ── [HARDENING E] Reference validation ──────────────────────────────────────────────────────

export interface CreateObligationInput {
  obligation_type: ObligationType;
  title: string;
  creator_entity_id: string;
  responsible_entity_id: string;
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
  /** Internal governed paths (projection/repair) may seed a terminal/derived state; the public
   *  create path may NOT. Default false. */
  allow_terminal_initial_state?: boolean;
}

/**
 * [HARDENING F] Validate a responsible/assigned entity: it must exist, be active, and belong to
 * the org (an active membership), or BE the subject or the participating twin. Never accept an
 * arbitrary entity id. Returns null when authorized, else a reason. (Cross-user READ visibility
 * of a reassigned obligation is governed by the future team/visibility-scope increment; reads
 * here remain subject-scoped.)
 */
export async function validateResponsibleEntity(scope: ObligationScope, entityId: string): Promise<string | null> {
  if (entityId === scope.subject_entity_id || entityId === scope.twin_entity_id) return null;
  const ent = await prisma.entity.findUnique({ where: { entity_id: entityId }, select: { status: true } });
  if (ent === null) return "responsible_not_found";
  if (ent.status !== "ACTIVE") return "responsible_inactive";
  const membership = await prisma.entityMembership.findFirst({
    where: { parent_id: scope.org_entity_id, child_id: entityId, is_active: true },
    select: { membership_id: true },
  });
  if (membership === null) return "responsible_not_in_org";
  return null;
}

/** Validate every supplied linked reference against the EXACT scope. Returns null when all
 *  references are coherent, or a reason string (never trusts a well-formed UUID). */
async function validateObligationReferences(scope: ObligationScope, input: CreateObligationInput): Promise<string | null> {
  // [HARDENING F] the responsible party must be a real, active, in-scope entity.
  const respErr = await validateResponsibleEntity(scope, input.responsible_entity_id);
  if (respErr !== null) return respErr;
  const conv = input.conversation_id ?? null;

  if (conv !== null) {
    const c = await prisma.otzarConversation.findUnique({
      where: { conversation_id: conv },
      select: { org_entity_id: true, entity_id: true, twin_id: true, status: true, deleted_at: true },
    });
    if (c === null) return "conversation_not_found";
    if (c.org_entity_id !== scope.org_entity_id || c.entity_id !== scope.subject_entity_id) return "conversation_scope_mismatch";
    if (c.twin_id !== scope.twin_entity_id) return "conversation_twin_mismatch";
    if (c.deleted_at !== null || c.status === "DELETED") return "conversation_deleted"; // ARCHIVED/CLOSED are linkable; DELETED is not
  }

  if (input.source_turn_id != null) {
    const t = await prisma.otzarConversationTurn.findUnique({
      where: { turn_id: input.source_turn_id },
      select: { conversation_id: true, org_entity_id: true, subject_entity_id: true, twin_entity_id: true, role: true },
    });
    if (t === null) return "source_turn_not_found";
    if (t.org_entity_id !== scope.org_entity_id || t.subject_entity_id !== scope.subject_entity_id) return "source_turn_scope_mismatch";
    if (t.twin_entity_id !== null && t.twin_entity_id !== scope.twin_entity_id) return "source_turn_twin_mismatch";
    if (conv !== null && t.conversation_id !== conv) return "source_turn_conversation_mismatch";
    // Role appropriateness: a question/clarification obligation's source turn is the ASSISTANT's
    // question; an acknowledgement/answer obligation's source is a USER turn.
    if ((input.obligation_type === "QUESTION_RESPONSE" || input.obligation_type === "CLARIFICATION") && t.role !== "ASSISTANT") {
      return "source_turn_role_mismatch";
    }
  }

  if (input.request_record_id != null) {
    const r = await prisma.otzarConversationRequest.findUnique({
      where: { request_record_id: input.request_record_id },
      select: { org_entity_id: true, subject_entity_id: true, twin_entity_id: true, conversation_id: true },
    });
    if (r === null) return "request_not_found";
    if (r.org_entity_id !== scope.org_entity_id || r.subject_entity_id !== scope.subject_entity_id || r.twin_entity_id !== scope.twin_entity_id) return "request_scope_mismatch";
    if (conv !== null && r.conversation_id !== conv) return "request_conversation_mismatch";
  }

  if (input.action_ref != null) {
    const led = await prisma.workLedgerEntry.findUnique({
      where: { ledger_entry_id: input.action_ref },
      select: { org_entity_id: true, owner_entity_id: true, conversation_id: true, status: true },
    });
    if (led === null) return "action_not_found";
    if (led.org_entity_id !== scope.org_entity_id) return "action_org_mismatch";
    // [HARDENING G/E] require an explicit owner match — never accept a null-owner ledger as a
    // personal obligation.
    if (led.owner_entity_id !== scope.subject_entity_id) return "action_owner_mismatch";
    if (conv !== null && led.conversation_id !== null && led.conversation_id !== conv) return "action_conversation_mismatch";
    if (led.status === "CANCELLED" || led.status === "SUPERSEDED" || led.status === "DELETED") return "action_terminal_incompatible";
  }

  if (input.escalation_id != null) {
    const esc = await prisma.escalationRequest.findUnique({
      where: { escalation_id: input.escalation_id },
      select: { source_entity_id: true, target_entity_id: true },
    });
    if (esc === null) return "escalation_not_found";
    // The caller (subject) must be a party to the escalation.
    if (esc.source_entity_id !== scope.subject_entity_id && esc.target_entity_id !== scope.subject_entity_id) return "escalation_authority_mismatch";
  }

  for (const [ref, label] of [[input.parent_obligation_id, "parent"], [input.superseded_obligation_id, "superseded"]] as const) {
    if (ref == null) continue;
    const o = await prisma.obligation.findUnique({
      where: { obligation_id: ref },
      select: { org_entity_id: true, subject_entity_id: true, twin_entity_id: true, parent_obligation_id: true },
    });
    if (o === null) return `${label}_not_found`;
    if (o.org_entity_id !== scope.org_entity_id || o.subject_entity_id !== scope.subject_entity_id || o.twin_entity_id !== scope.twin_entity_id) return `${label}_scope_mismatch`;
    // Parent/superseded links form a DAG rooted at creation (the new row has no id yet, so it
    // cannot be its own ancestor); the scope check above is the security-material guard.
  }

  return null;
}

// ── Intake (create-or-get idempotency + content + reference validation + atomic audit) ──────

export type CreateObligationResult =
  | { kind: "ok"; obligation: SafeObligation; created: boolean }
  | { kind: "invalid_content"; reason: string }
  | { kind: "invalid_reference"; reason: string }
  | { kind: "invalid_state"; reason: string }
  | { kind: "audit_consistency_failure" };

/**
 * Create the obligation (or return the existing one for a NON-NULL origin_key), with content +
 * reference validation and an ATOMIC creation audit. A concurrent duplicate resolves to the SAME
 * row. When `audit` is supplied, the OBLIGATION_CREATED event is written inside the create
 * transaction (audit failure → rollback → { kind: "audit_consistency_failure" }).
 */
export async function createOrGetObligation(
  scope: ObligationScope,
  input: CreateObligationInput,
  audit?: { actor_entity_id: string; extra_details?: Record<string, unknown> },
): Promise<CreateObligationResult> {
  // [HARDENING H] structured content must be safe.
  if (input.details !== undefined) {
    const c = validateSafeJson(input.details);
    if (!c.ok) return { kind: "invalid_content", reason: `details: ${c.reason}` };
  }
  // The public create path may not seed a terminal state.
  const initialState = input.initial_state ?? "OPEN";
  if (isTerminalState(initialState) && input.allow_terminal_initial_state !== true) {
    return { kind: "invalid_state", reason: "cannot create an obligation in a terminal state" };
  }
  // [HARDENING E] validate every supplied reference against exact scope.
  const refErr = await validateObligationReferences(scope, input);
  if (refErr !== null) return { kind: "invalid_reference", reason: refErr };

  const data: Prisma.ObligationUncheckedCreateInput = {
    org_entity_id: scope.org_entity_id,
    subject_entity_id: scope.subject_entity_id,
    twin_entity_id: scope.twin_entity_id,
    obligation_type: input.obligation_type,
    title: input.title,
    creator_entity_id: input.creator_entity_id,
    responsible_entity_id: input.responsible_entity_id,
    origin_key: input.origin_key ?? null,
    state: initialState,
    priority: input.priority ?? "ROUTINE",
    required_response_class: input.required_response_class ?? null,
    source_channel: input.source_channel ?? "CHAT",
    provenance_class: input.provenance_class ?? "CONVERSATION",
    details: (input.details ?? {}) as Prisma.InputJsonValue,
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
  };

  try {
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.obligation.create({ select: OBLIGATION_SELECT, data });
      if (audit !== undefined) {
        await writeObligationAuditInTx(tx, scope.org_entity_id, {
          event_type: "OBLIGATION_CREATED",
          actor_entity_id: audit.actor_entity_id,
          details: { obligation_id: row.obligation_id, obligation_type: row.obligation_type, state: row.state, ...(audit.extra_details ?? {}) },
        });
      }
      return row;
    });
    return { kind: "ok", obligation: toSafeObligation(created as unknown as ObligationRow), created: true };
  } catch (e) {
    if (isUniqueViolation(e) && input.origin_key != null) {
      const existing = await prisma.obligation.findUnique({
        where: { org_entity_id_origin_key: { org_entity_id: scope.org_entity_id, origin_key: input.origin_key } },
        select: OBLIGATION_SELECT,
      });
      if (existing !== null) return { kind: "ok", obligation: toSafeObligation(existing as unknown as ObligationRow), created: false };
    }
    // A create with an audit that failed inside the tx rolls back → nothing persisted.
    if (audit !== undefined) return { kind: "audit_consistency_failure" };
    throw e;
  }
}

// ── Scope-gated reads (restoration survives thread close/archive/staff-change) ──────────────

export interface ListObligationsOptions {
  states?: ObligationState[];
  obligation_type?: ObligationType;
  conversation_id?: string;
  open_only?: boolean;
  limit?: number;
}

export async function listObligations(scope: ObligationScope, options: ListObligationsOptions = {}): Promise<SafeObligation[]> {
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
  return rows.map((r) => toSafeObligation(r as unknown as ObligationRow));
}

export async function getObligationForScope(scope: ObligationScope, obligationId: string): Promise<SafeObligation | null> {
  const row = await prisma.obligation.findFirst({
    where: { obligation_id: obligationId, org_entity_id: scope.org_entity_id, subject_entity_id: scope.subject_entity_id, twin_entity_id: scope.twin_entity_id },
    select: OBLIGATION_SELECT,
  });
  return row === null ? null : toSafeObligation(row as unknown as ObligationRow);
}

// ── Lifecycle transitions (optimistic-concurrency CAS + atomic audit; typed outcomes) ───────

export type TransitionOutcome =
  | { kind: "ok"; obligation: SafeObligation }
  | { kind: "not_found" }
  | { kind: "stale_version"; current: SafeObligation }
  | { kind: "illegal_transition"; current: SafeObligation }
  | { kind: "evidence_required" }
  | { kind: "not_acknowledgeable" }
  | { kind: "audit_consistency_failure" }; // audit failed → transition rolled back

interface CasArgs {
  obligation_id: string;
  expected_version: number;
}

async function readScoped(scope: ObligationScope, obligationId: string) {
  return prisma.obligation.findFirst({
    where: { obligation_id: obligationId, org_entity_id: scope.org_entity_id, subject_entity_id: scope.subject_entity_id, twin_entity_id: scope.twin_entity_id },
  });
}

async function classifyCasFailure(scope: ObligationScope, args: CasArgs, legalFrom: readonly ObligationState[]): Promise<Exclude<TransitionOutcome, { kind: "ok" }>> {
  const row = await readScoped(scope, args.obligation_id);
  if (row === null) return { kind: "not_found" };
  const safe = toSafeObligation(row as unknown as ObligationRow);
  if (row.version !== args.expected_version) return { kind: "stale_version", current: safe };
  if (!(legalFrom as readonly string[]).includes(row.state)) return { kind: "illegal_transition", current: safe };
  return { kind: "stale_version", current: safe };
}

/**
 * Guarded CAS + atomic audit: within ONE transaction, UPDATE ... version=version+1 WHERE id +
 * full scope + version=expected + state IN legalFrom, then write the audit event. Audit failure
 * (or the injected hook) throws → the whole transition rolls back → { audit_consistency_failure }.
 * The scope predicate is in the WHERE so a foreign caller can never transition a row.
 */
async function casTransition(
  scope: ObligationScope,
  args: CasArgs,
  legalFrom: readonly ObligationState[],
  toState: ObligationState,
  timestampColumn: string | null,
  audit: ObligationAudit | null,
  extra: Record<string, string | null> = {},
  auditExtraDetails: Record<string, unknown> = {},
): Promise<TransitionOutcome> {
  const sets: string[] = [`state = '${toState}'`, `version = version + 1`, `updated_at = now()`];
  if (timestampColumn !== null) sets.push(`${timestampColumn} = now()`);
  const params: Array<string | null> = [];
  for (const [col, val] of Object.entries(extra)) {
    params.push(val);
    sets.push(`${col} = $${params.length}::uuid`);
  }
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

  try {
    const result = await prisma.$transaction(async (tx) => {
      const n = await tx.$executeRawUnsafe(sql, ...params, args.obligation_id, args.expected_version, scope.org_entity_id, scope.subject_entity_id, scope.twin_entity_id);
      if (n !== 1) return { hit: false as const };
      if (audit !== null) {
        await writeObligationAuditInTx(tx, scope.org_entity_id, {
          event_type: audit.event_type, actor_entity_id: audit.actor_entity_id,
          details: { obligation_id: args.obligation_id, state: toState, ...auditExtraDetails },
        });
      }
      const row = await tx.obligation.findFirst({
        where: { obligation_id: args.obligation_id, org_entity_id: scope.org_entity_id, subject_entity_id: scope.subject_entity_id, twin_entity_id: scope.twin_entity_id },
        select: OBLIGATION_SELECT,
      });
      return { hit: true as const, row };
    });
    if (!result.hit) return classifyCasFailure(scope, args, legalFrom);
    if (result.row === null) return { kind: "not_found" };
    return { kind: "ok", obligation: toSafeObligation(result.row as unknown as ObligationRow) };
  } catch {
    // Post-CAS failure (audit or tx) → the transition did NOT durably land. Fail closed.
    return { kind: "audit_consistency_failure" };
  }
}

const ACK_FROM: readonly ObligationState[] = ["OPEN", "AWAITING_RESPONSE", "ESCALATED"];

/**
 * Acknowledge — ONLY the responsible actor (or authorized delegate) via a USER turn they authored
 * may acknowledge (invariant §6.4). A generated ASSISTANT/twin turn can NEVER acknowledge. Atomic
 * with its OBLIGATION_ACKNOWLEDGED audit.
 */
export async function acknowledgeObligation(
  scope: ObligationScope,
  args: CasArgs & { acknowledged_turn_id: string; actor_entity_id: string },
): Promise<TransitionOutcome> {
  const row = await readScoped(scope, args.obligation_id);
  if (row === null) return { kind: "not_found" };
  const authorized = args.actor_entity_id === row.responsible_entity_id || (row.delegated_principal_id !== null && args.actor_entity_id === row.delegated_principal_id);
  if (!authorized) return { kind: "not_acknowledgeable" };
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
  return casTransition(
    scope, args, ACK_FROM, "ACKNOWLEDGED", "acknowledged_at",
    { event_type: "OBLIGATION_ACKNOWLEDGED", actor_entity_id: args.actor_entity_id, details: {} },
    { acknowledged_turn_id: args.acknowledged_turn_id },
  );
}

const START_FROM: readonly ObligationState[] = ["ACKNOWLEDGED", "BLOCKED"];
export async function startObligation(scope: ObligationScope, args: CasArgs): Promise<TransitionOutcome> {
  // IN_PROGRESS is an internal progress marker (not in the §C audited-mutation list) — no audit.
  return casTransition(scope, args, START_FROM, "IN_PROGRESS", null, null);
}

const BLOCK_FROM: readonly ObligationState[] = ["OPEN", "AWAITING_RESPONSE", "ACKNOWLEDGED", "IN_PROGRESS", "ESCALATED"];
export async function blockObligation(scope: ObligationScope, args: CasArgs & { actor_entity_id: string }): Promise<TransitionOutcome> {
  return casTransition(scope, args, BLOCK_FROM, "BLOCKED", null, { event_type: "OBLIGATION_BLOCKED", actor_entity_id: args.actor_entity_id, details: {} });
}

const ESCALATE_FROM: readonly ObligationState[] = ["OPEN", "AWAITING_RESPONSE", "ACKNOWLEDGED", "IN_PROGRESS", "BLOCKED"];
export async function escalateObligation(scope: ObligationScope, args: CasArgs & { actor_entity_id: string; escalation_id?: string | null }): Promise<TransitionOutcome> {
  return casTransition(
    scope, args, ESCALATE_FROM, "ESCALATED", "escalate_at",
    { event_type: "OBLIGATION_ESCALATED", actor_entity_id: args.actor_entity_id, details: {} },
    args.escalation_id != null ? { escalation_id: args.escalation_id } : {},
  );
}

const CANCEL_FROM = OPEN_OBLIGATION_STATES;
export async function cancelObligation(scope: ObligationScope, args: CasArgs & { actor_entity_id: string }): Promise<TransitionOutcome> {
  return casTransition(scope, args, CANCEL_FROM, "CANCELLED", "cancelled_at", { event_type: "OBLIGATION_CANCELLED", actor_entity_id: args.actor_entity_id, details: {} });
}

const EXPIRE_FROM = OPEN_OBLIGATION_STATES;
/** Expiry is NOT success: sets expired_at only, never completed_at (invariant §6.3). */
export async function expireObligation(scope: ObligationScope, args: CasArgs & { actor_entity_id: string }): Promise<TransitionOutcome> {
  return casTransition(scope, args, EXPIRE_FROM, "EXPIRED", "expired_at", { event_type: "OBLIGATION_EXPIRED", actor_entity_id: args.actor_entity_id, details: {} });
}

const COMPLETE_FROM: readonly ObligationState[] = ["OPEN", "AWAITING_RESPONSE", "ACKNOWLEDGED", "IN_PROGRESS", "BLOCKED", "ESCALATED"];

export interface CompleteObligationArgs extends CasArgs {
  actor_entity_id: string;
  completion_turn_id?: string | null;
  completion_action_ref?: string | null;
  completion_evidence?: Record<string, unknown> | null;
}

/**
 * Complete — requires a VALIDATED durable evidence ref read THROUGH the terminal state (§6.2/6.3/
 * §I). Turn-path: an EXPLICITLY-supplied completion_turn_id that is a USER turn authored by the
 * responsible actor/delegate, created AFTER the obligation, in its conversation + scope. (We do
 * NOT infer semantic relatedness — completion is never automatic; stale chatter cannot close an
 * obligation because nothing designates it.) Action-path: an ACTION_CONFIRMATION completes ONLY
 * when the linked WorkLedgerEntry is terminally EXECUTED in scope. A Json blob alone never
 * satisfies. Atomic with its OBLIGATION_COMPLETED audit.
 */
export async function completeObligation(scope: ObligationScope, args: CompleteObligationArgs): Promise<TransitionOutcome> {
  const row = await readScoped(scope, args.obligation_id);
  if (row === null) return { kind: "not_found" };

  // [HARDENING H] evidence blob must be safe.
  if (args.completion_evidence != null) {
    const c = validateSafeJson(args.completion_evidence);
    if (!c.ok) return { kind: "evidence_required" };
  }

  let evidenceValidated = false;
  const actionRef = args.completion_action_ref ?? row.action_ref;

  if (args.completion_turn_id != null) {
    // [HARDENING I] turn-path coherence: USER turn, authored by responsible/delegate, created
    // AFTER the obligation, in the obligation's conversation + exact scope.
    const authorizedActor = args.actor_entity_id === row.responsible_entity_id || (row.delegated_principal_id !== null && args.actor_entity_id === row.delegated_principal_id);
    const turn = await prisma.otzarConversationTurn.findUnique({
      where: { turn_id: args.completion_turn_id },
      select: { role: true, author_entity_id: true, conversation_id: true, org_entity_id: true, subject_entity_id: true, twin_entity_id: true, created_at: true },
    });
    if (
      authorizedActor && turn !== null && turn.role === "USER" &&
      turn.author_entity_id === args.actor_entity_id &&
      turn.org_entity_id === scope.org_entity_id &&
      turn.subject_entity_id === scope.subject_entity_id &&
      (turn.twin_entity_id === null || turn.twin_entity_id === scope.twin_entity_id) &&
      (row.conversation_id === null || turn.conversation_id === row.conversation_id) &&
      turn.created_at.getTime() >= row.created_at.getTime()
    ) {
      evidenceValidated = true;
    }
  } else if (row.obligation_type === "ACTION_CONFIRMATION") {
    if (actionRef !== null) {
      const led = await prisma.workLedgerEntry.findUnique({ where: { ledger_entry_id: actionRef }, select: { status: true, org_entity_id: true, owner_entity_id: true } });
      if (led !== null && led.status === "EXECUTED" && led.org_entity_id === scope.org_entity_id && (led.owner_entity_id === null || led.owner_entity_id === scope.subject_entity_id)) {
        evidenceValidated = true;
      }
    }
  } else if (actionRef !== null) {
    const led = await prisma.workLedgerEntry.findUnique({ where: { ledger_entry_id: actionRef }, select: { status: true, org_entity_id: true } });
    if (led !== null && led.status === "EXECUTED" && led.org_entity_id === scope.org_entity_id) evidenceValidated = true;
  }

  if (!evidenceValidated) return { kind: "evidence_required" };

  const extra: Record<string, string | null> = {};
  if (args.completion_turn_id != null) extra.completion_turn_id = args.completion_turn_id;
  if (actionRef != null) extra.completion_action_ref = actionRef;
  // Persist the safe evidence blob inside the same tx via a follow-up write is not needed — the
  // evidence refs (turn/action) are the durable proof; the blob is secondary. If supplied, store
  // it alongside in a second guarded update after the atomic transition+audit commits.
  const outcome = await casTransition(scope, args, COMPLETE_FROM, "COMPLETED", "completed_at", { event_type: "OBLIGATION_COMPLETED", actor_entity_id: args.actor_entity_id, details: {} }, extra);
  if (outcome.kind === "ok" && args.completion_evidence != null) {
    await prisma.obligation.update({ where: { obligation_id: args.obligation_id }, data: { completion_evidence: args.completion_evidence as Prisma.InputJsonValue } });
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
  prior?: { previous_responsible_entity_id: string; previous_state: string; previous_acknowledged_at: Date | null };
}

/**
 * Reassign — updates responsible, resets acknowledgement (new party has NOT acknowledged), and
 * records the full prior lineage in the OBLIGATION_REASSIGNED audit, ATOMICALLY (§6.7). Only
 * non-terminal obligations can be reassigned. History is preserved.
 */
export async function reassignObligation(scope: ObligationScope, args: ReassignArgs): Promise<ReassignResult> {
  const row = await readScoped(scope, args.obligation_id);
  if (row === null) return { outcome: { kind: "not_found" } };
  const prior = { previous_responsible_entity_id: row.responsible_entity_id, previous_state: row.state, previous_acknowledged_at: row.acknowledged_at };
  const fromList = OPEN_OBLIGATION_STATES.map((s) => `'${s}'`).join(", ");
  try {
    const result = await prisma.$transaction(async (tx) => {
      const n = await tx.$executeRawUnsafe(
        `UPDATE obligations SET responsible_entity_id = $1::uuid, state = 'AWAITING_RESPONSE', acknowledged_at = NULL, acknowledged_turn_id = NULL, version = version + 1, updated_at = now() ` +
          `WHERE obligation_id = $2::uuid AND version = $3::int AND org_entity_id = $4::uuid AND subject_entity_id = $5::uuid AND twin_entity_id = $6::uuid AND state IN (${fromList})`,
        args.new_responsible_entity_id, args.obligation_id, args.expected_version, scope.org_entity_id, scope.subject_entity_id, scope.twin_entity_id,
      );
      if (n !== 1) return { hit: false as const };
      await writeObligationAuditInTx(tx, scope.org_entity_id, {
        event_type: "OBLIGATION_REASSIGNED", actor_entity_id: args.assigning_actor_entity_id,
        details: {
          obligation_id: args.obligation_id, new_responsible_entity_id: args.new_responsible_entity_id,
          assigning_actor_entity_id: args.assigning_actor_entity_id, reason: args.reason,
          previous_responsible_entity_id: prior.previous_responsible_entity_id, previous_state: prior.previous_state,
          previous_acknowledged: prior.previous_acknowledged_at !== null, re_acknowledgement_required: true,
        },
      });
      const updated = await tx.obligation.findFirst({ where: { obligation_id: args.obligation_id, org_entity_id: scope.org_entity_id, subject_entity_id: scope.subject_entity_id, twin_entity_id: scope.twin_entity_id }, select: OBLIGATION_SELECT });
      return { hit: true as const, row: updated };
    });
    if (!result.hit) return { outcome: await classifyCasFailure(scope, args, OPEN_OBLIGATION_STATES) };
    if (result.row === null) return { outcome: { kind: "not_found" } };
    return { outcome: { kind: "ok", obligation: toSafeObligation(result.row as unknown as ObligationRow) }, prior };
  } catch {
    return { outcome: { kind: "audit_consistency_failure" } };
  }
}

export interface SupersedeResult {
  outcome: TransitionOutcome;
  replacement?: SafeObligation;
}

/**
 * Supersede — create a NEW obligation linked to the old (parent + superseded), mark the OLD
 * SUPERSEDED, and write the OBLIGATION_SUPERSEDED audit — all in ONE transaction. Correction
 * creates a LINKED replacement; it never rewrites the original (§6.5/6.6).
 */
export async function supersedeObligation(
  scope: ObligationScope,
  args: CasArgs & { replacement: CreateObligationInput; actor_entity_id: string },
): Promise<SupersedeResult> {
  const old = await readScoped(scope, args.obligation_id);
  if (old === null) return { outcome: { kind: "not_found" } };
  if ((TERMINAL_OBLIGATION_STATES as readonly string[]).includes(old.state)) {
    return { outcome: { kind: "illegal_transition", current: toSafeObligation(old as unknown as ObligationRow) } };
  }
  // [HARDENING H] replacement content must be safe.
  if (args.replacement.details !== undefined) {
    const c = validateSafeJson(args.replacement.details);
    if (!c.ok) return { outcome: { kind: "evidence_required" } }; // reuse a 4xx-mapped kind; service maps to invalid
  }
  const fromList = OPEN_OBLIGATION_STATES.map((s) => `'${s}'`).join(", ");
  try {
    const created = await prisma.$transaction(async (tx) => {
      const n = await tx.$executeRawUnsafe(
        `UPDATE obligations SET state = 'SUPERSEDED', superseded_at = now(), version = version + 1, updated_at = now() ` +
          `WHERE obligation_id = $1::uuid AND version = $2::int AND org_entity_id = $3::uuid AND subject_entity_id = $4::uuid AND twin_entity_id = $5::uuid AND state IN (${fromList})`,
        args.obligation_id, args.expected_version, scope.org_entity_id, scope.subject_entity_id, scope.twin_entity_id,
      );
      if (n !== 1) throw new ObligationCasConflict();
      const replacement = await tx.obligation.create({
        select: OBLIGATION_SELECT,
        data: {
          org_entity_id: scope.org_entity_id, subject_entity_id: scope.subject_entity_id, twin_entity_id: scope.twin_entity_id,
          obligation_type: args.replacement.obligation_type, title: args.replacement.title,
          creator_entity_id: args.replacement.creator_entity_id, responsible_entity_id: args.replacement.responsible_entity_id,
          origin_key: args.replacement.origin_key ?? null, state: args.replacement.initial_state ?? "OPEN",
          priority: args.replacement.priority ?? old.priority, required_response_class: args.replacement.required_response_class ?? null,
          source_channel: args.replacement.source_channel ?? old.source_channel, provenance_class: args.replacement.provenance_class ?? old.provenance_class,
          details: (args.replacement.details ?? {}) as Prisma.InputJsonValue,
          conversation_id: args.replacement.conversation_id ?? old.conversation_id, source_turn_id: args.replacement.source_turn_id ?? null,
          request_record_id: args.replacement.request_record_id ?? null, action_ref: args.replacement.action_ref ?? null,
          escalation_id: args.replacement.escalation_id ?? null, parent_obligation_id: args.obligation_id, superseded_obligation_id: args.obligation_id,
          subject_ref: args.replacement.subject_ref ?? old.subject_ref, subject_ref_class: args.replacement.subject_ref_class ?? old.subject_ref_class,
          due_at: args.replacement.due_at ?? null, visibility_scope: args.replacement.visibility_scope ?? old.visibility_scope,
          retention_class: args.replacement.retention_class ?? old.retention_class,
        },
      });
      await writeObligationAuditInTx(tx, scope.org_entity_id, {
        event_type: "OBLIGATION_SUPERSEDED", actor_entity_id: args.actor_entity_id,
        details: { obligation_id: args.obligation_id, replacement_obligation_id: replacement.obligation_id },
      });
      return replacement;
    });
    const refreshed = await readScoped(scope, args.obligation_id);
    return {
      outcome: refreshed === null ? { kind: "not_found" } : { kind: "ok", obligation: toSafeObligation(refreshed as unknown as ObligationRow) },
      replacement: toSafeObligation(created as unknown as ObligationRow),
    };
  } catch (e) {
    if (e instanceof ObligationCasConflict) return { outcome: await classifyCasFailure(scope, args, OPEN_OBLIGATION_STATES) };
    return { outcome: { kind: "audit_consistency_failure" } };
  }
}

class ObligationCasConflict extends Error {
  constructor() { super("obligation_cas_conflict"); this.name = "ObligationCasConflict"; }
}

// ── [HARDENING G] Projection from spine state (validated coherence; idempotent) ──────────────

export type ProjectionResult =
  | { kind: "projected"; obligation: SafeObligation; created: boolean }
  | { kind: "not_projectable"; reason: string }
  | { kind: "audit_consistency_failure" };

/**
 * Project from an awaiting-confirmation WorkLedgerEntry (e.g. NEEDS_CALLER_CONFIRMATION). Requires
 * an EXPLICIT owner match — a null-owner ledger is NOT auto-projected into a personal obligation.
 * Rejects cancelled/superseded/executed/foreign actions. Idempotent via origin_key.
 */
export async function projectObligationFromAwaitingConfirmation(
  scope: ObligationScope, ledgerEntryId: string, options: { actor_entity_id: string; creator_entity_id?: string },
): Promise<ProjectionResult> {
  const led = await prisma.workLedgerEntry.findUnique({
    where: { ledger_entry_id: ledgerEntryId },
    select: { org_entity_id: true, owner_entity_id: true, conversation_id: true, title: true, status: true },
  });
  if (led === null) return { kind: "not_projectable", reason: "ledger_not_found" };
  if (led.org_entity_id !== scope.org_entity_id) return { kind: "not_projectable", reason: "org_mismatch" };
  // [HARDENING G] explicit owner required — never treat null owner as projectable to this subject.
  if (led.owner_entity_id === null) return { kind: "not_projectable", reason: "no_explicit_owner" };
  if (led.owner_entity_id !== scope.subject_entity_id) return { kind: "not_projectable", reason: "owner_mismatch" };
  if (led.status !== "NEEDS_CALLER_CONFIRMATION") return { kind: "not_projectable", reason: `not_awaiting_confirmation(${led.status})` };

  const res = await createOrGetObligation(
    scope,
    {
      obligation_type: "ACTION_CONFIRMATION", title: led.title,
      creator_entity_id: options.creator_entity_id ?? scope.twin_entity_id, responsible_entity_id: scope.subject_entity_id,
      origin_key: `awaiting_confirmation:${ledgerEntryId}`, initial_state: "AWAITING_RESPONSE",
      required_response_class: "CONFIRMATION", provenance_class: "CONVERSATION", action_ref: ledgerEntryId,
      conversation_id: led.conversation_id,
    },
    { actor_entity_id: options.actor_entity_id, extra_details: { projected_from: "awaiting_confirmation" } },
  );
  if (res.kind === "audit_consistency_failure") return { kind: "audit_consistency_failure" };
  if (res.kind !== "ok") return { kind: "not_projectable", reason: res.reason };
  return { kind: "projected", obligation: res.obligation, created: res.created };
}

/**
 * Project from an unresolved assistant question. Validates the COMPLETE canonical relationship
 * before using its text (§G): COMPLETED + CLARIFICATION request in exact scope, with a canonical
 * ASSISTANT turn whose response_to_turn_id === the request's own user_turn_id. An inconsistent
 * canonical does NOT create an obligation or expose its text. Idempotent via origin_key.
 */
export async function projectObligationFromUnresolvedQuestion(
  scope: ObligationScope, requestRecordId: string, options: { actor_entity_id: string; creator_entity_id?: string },
): Promise<ProjectionResult> {
  const req = await prisma.otzarConversationRequest.findUnique({
    where: { request_record_id: requestRecordId },
    select: { org_entity_id: true, subject_entity_id: true, twin_entity_id: true, conversation_id: true, state: true, response_class: true, canonical_assistant_turn_id: true, user_turn_id: true },
  });
  if (req === null) return { kind: "not_projectable", reason: "request_not_found" };
  if (req.org_entity_id !== scope.org_entity_id || req.subject_entity_id !== scope.subject_entity_id || req.twin_entity_id !== scope.twin_entity_id) return { kind: "not_projectable", reason: "scope_mismatch" };
  if (req.state !== "COMPLETED") return { kind: "not_projectable", reason: "not_completed" };
  if (req.response_class !== "CLARIFICATION") return { kind: "not_projectable", reason: "not_clarification" };
  if (req.canonical_assistant_turn_id === null) return { kind: "not_projectable", reason: "no_canonical" };

  // Full canonical coherence — the turn must be the ASSISTANT reply to THIS request's user turn.
  const turn = await prisma.otzarConversationTurn.findUnique({
    where: { turn_id: req.canonical_assistant_turn_id },
    select: { content: true, role: true, org_entity_id: true, subject_entity_id: true, twin_entity_id: true, conversation_id: true, response_to_turn_id: true },
  });
  if (
    turn === null || turn.role !== "ASSISTANT" ||
    turn.org_entity_id !== scope.org_entity_id || turn.subject_entity_id !== scope.subject_entity_id ||
    turn.twin_entity_id !== scope.twin_entity_id || turn.conversation_id !== req.conversation_id ||
    turn.response_to_turn_id !== req.user_turn_id
  ) {
    return { kind: "not_projectable", reason: "canonical_incoherent" };
  }

  const title = turn.content.length > 0 ? (turn.content.length > 120 ? `${turn.content.slice(0, 117)}...` : turn.content) : "Answer the assistant's question";
  const res = await createOrGetObligation(
    scope,
    {
      obligation_type: "QUESTION_RESPONSE", title,
      creator_entity_id: options.creator_entity_id ?? scope.twin_entity_id, responsible_entity_id: scope.subject_entity_id,
      origin_key: `question:${requestRecordId}`, initial_state: "AWAITING_RESPONSE",
      required_response_class: "ANSWER", provenance_class: "CONVERSATION", request_record_id: requestRecordId,
      source_turn_id: req.canonical_assistant_turn_id, conversation_id: req.conversation_id,
    },
    { actor_entity_id: options.actor_entity_id, extra_details: { projected_from: "unresolved_question" } },
  );
  if (res.kind === "audit_consistency_failure") return { kind: "audit_consistency_failure" };
  if (res.kind !== "ok") return { kind: "not_projectable", reason: res.reason };
  return { kind: "projected", obligation: res.obligation, created: res.created };
}
