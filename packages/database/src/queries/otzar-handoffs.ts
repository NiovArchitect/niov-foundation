// FILE: queries/otzar-handoffs.ts
// PURPOSE: [OTZAR STAGE-2 §L] The scope-gated read + transition layer for governed responsibility
//          HANDOFFS. A handoff transfers responsibility for a set of obligations from an outgoing
//          party to an incoming party. It LINKS obligations (handoff_obligations) — never copies
//          their state. Unlike obligations (single-subject scope), handoffs are MULTI-PARTY:
//          reads are scoped by (org, caller-is-a-party = outgoing OR incoming) so the RECEIVER can
//          see what was sent to them. Mutations are party-authorized. Every governed mutation
//          writes its HANDOFF_* audit INSIDE the mutation transaction (audit failure → rollback →
//          typed consistency failure). Terminal states (COMPLETED | SUPERSEDED) are append-only.
// SAFETY: SAFE projections only; never provider tokens / raw payloads (ADR-0057 §16).
// CONNECTS TO: otzar.service.ts, otzar-obligation-validation.ts (safe-JSON), audit.ts, obligations.

import type { Prisma } from "@prisma/client";
import { prisma } from "../client.js";
import { writeAuditEvent, type AuditEventType } from "./audit.js";
import { validateSafeJson } from "./otzar-obligation-validation.js";

export type HandoffState =
  | "DRAFTED" | "READY_FOR_REVIEW" | "SENT" | "RECEIVED" | "ACKNOWLEDGED"
  | "CLARIFICATION_REQUIRED" | "SUPERSEDED" | "COMPLETED" | "ESCALATED";

export type HandoffDisposition = "PENDING" | "ACCEPTED" | "REASSIGNED" | "SUPERSEDED" | "RETAINED";

export const HANDOFF_STATES: readonly HandoffState[] = [
  "DRAFTED", "READY_FOR_REVIEW", "SENT", "RECEIVED", "ACKNOWLEDGED",
  "CLARIFICATION_REQUIRED", "SUPERSEDED", "COMPLETED", "ESCALATED",
];
export const HANDOFF_DISPOSITIONS: readonly HandoffDisposition[] = ["PENDING", "ACCEPTED", "REASSIGNED", "SUPERSEDED", "RETAINED"];
export const TERMINAL_HANDOFF_STATES: readonly HandoffState[] = ["COMPLETED", "SUPERSEDED"];
/** Non-terminal states a handoff can still transition from. */
export const OPEN_HANDOFF_STATES: readonly HandoffState[] = ["DRAFTED", "READY_FOR_REVIEW", "SENT", "RECEIVED", "ACKNOWLEDGED", "CLARIFICATION_REQUIRED", "ESCALATED"];

/** Multi-party caller scope: org + the acting entity (a party to the handoff). */
export interface HandoffScope {
  org_entity_id: string;
  caller_entity_id: string;
}

export const __otzarHandoffTestHooks = { failAudit: false };

export interface SafeHandoff {
  handoff_id: string;
  state: string;
  title: string;
  summary: string | null;
  details: Record<string, unknown>;
  priority: string;
  outgoing_responsible_entity_id: string;
  incoming_responsible_entity_id: string | null;
  workspace_id: string | null;
  conversation_id: string | null;
  is_escalated: boolean;
  is_terminal: boolean;
  caller_is_outgoing: boolean;
  caller_is_incoming: boolean;
  version: number;
  created_at: Date;
  sent_at: Date | null;
  received_at: Date | null;
  acknowledged_at: Date | null;
  completed_at: Date | null;
  due_at: Date | null;
}

const HANDOFF_SELECT = {
  handoff_id: true, state: true, title: true, summary: true, details: true, priority: true,
  outgoing_responsible_entity_id: true, incoming_responsible_entity_id: true, workspace_id: true,
  conversation_id: true, escalation_id: true, version: true, created_at: true, sent_at: true,
  received_at: true, acknowledged_at: true, completed_at: true, due_at: true,
} as const;

type HandoffRow = {
  handoff_id: string; state: string; title: string; summary: string | null; details: unknown; priority: string;
  outgoing_responsible_entity_id: string; incoming_responsible_entity_id: string | null; workspace_id: string | null;
  conversation_id: string | null; escalation_id: string | null; version: number; created_at: Date; sent_at: Date | null;
  received_at: Date | null; acknowledged_at: Date | null; completed_at: Date | null; due_at: Date | null;
};

function toSafeHandoff(row: HandoffRow, callerEntityId: string): SafeHandoff {
  return {
    handoff_id: row.handoff_id, state: row.state, title: row.title, summary: row.summary,
    details: (row.details ?? {}) as Record<string, unknown>, priority: row.priority,
    outgoing_responsible_entity_id: row.outgoing_responsible_entity_id,
    incoming_responsible_entity_id: row.incoming_responsible_entity_id,
    workspace_id: row.workspace_id, conversation_id: row.conversation_id,
    is_escalated: row.escalation_id !== null,
    is_terminal: (TERMINAL_HANDOFF_STATES as readonly string[]).includes(row.state),
    caller_is_outgoing: row.outgoing_responsible_entity_id === callerEntityId,
    caller_is_incoming: row.incoming_responsible_entity_id === callerEntityId,
    version: row.version, created_at: row.created_at, sent_at: row.sent_at, received_at: row.received_at,
    acknowledged_at: row.acknowledged_at, completed_at: row.completed_at, due_at: row.due_at,
  };
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002";
}

interface HandoffAudit { event_type: AuditEventType; actor_entity_id: string; details: Record<string, unknown> }

async function writeHandoffAuditInTx(tx: Prisma.TransactionClient, orgEntityId: string, audit: HandoffAudit): Promise<void> {
  if (__otzarHandoffTestHooks.failAudit) throw new Error("injected handoff audit failure");
  await writeAuditEvent({ event_type: audit.event_type, outcome: "SUCCESS", actor_entity_id: audit.actor_entity_id, target_entity_id: orgEntityId, details: audit.details }, tx);
}

// ── Multi-party scoped predicate ──────────────────────────────────────────────────────────────
// The caller must be a party: outgoing OR incoming. (Workspace-member visibility is a documented
// follow-up; the security-material guard here is party-membership + org.)
function partyWhere(scope: HandoffScope) {
  return {
    org_entity_id: scope.org_entity_id,
    OR: [{ outgoing_responsible_entity_id: scope.caller_entity_id }, { incoming_responsible_entity_id: scope.caller_entity_id }],
  };
}

// ── Intake ───────────────────────────────────────────────────────────────────────────────────

export interface CreateHandoffInput {
  title: string;
  outgoing_responsible_entity_id: string;
  incoming_responsible_entity_id?: string | null;
  creator_entity_id: string;
  twin_entity_id?: string | null;
  workspace_id?: string | null;
  conversation_id?: string | null;
  source_turn_id?: string | null;
  summary?: string | null;
  details?: Record<string, unknown>;
  priority?: string;
  origin_key?: string | null;
  subject_ref?: string | null;
  subject_ref_class?: string | null;
  due_at?: Date | null;
}

export type CreateHandoffResult =
  | { kind: "ok"; handoff: SafeHandoff; created: boolean }
  | { kind: "invalid_content"; reason: string }
  | { kind: "invalid_reference"; reason: string }
  | { kind: "audit_consistency_failure" };

/** Create (or idempotently return) a handoff in DRAFTED state, with content + reference validation
 *  and an ATOMIC creation audit. The creator must be the outgoing party. */
export async function createOrGetHandoff(scope: HandoffScope, input: CreateHandoffInput, audit: { actor_entity_id: string }): Promise<CreateHandoffResult> {
  if (input.details !== undefined) {
    const c = validateSafeJson(input.details);
    if (!c.ok) return { kind: "invalid_content", reason: `details: ${c.reason}` };
  }
  // The outgoing party must be the caller (you send YOUR handoff), and be an active org member.
  if (input.outgoing_responsible_entity_id !== scope.caller_entity_id) return { kind: "invalid_reference", reason: "outgoing_must_be_caller" };
  // Validate incoming/conversation/workspace references against the org.
  if (input.incoming_responsible_entity_id != null) {
    const r = await validateOrgMember(scope.org_entity_id, input.incoming_responsible_entity_id);
    if (r !== null) return { kind: "invalid_reference", reason: `incoming_${r}` };
  }
  if (input.conversation_id != null) {
    const c = await prisma.otzarConversation.findUnique({ where: { conversation_id: input.conversation_id }, select: { org_entity_id: true, deleted_at: true } });
    if (c === null || c.org_entity_id !== scope.org_entity_id || c.deleted_at !== null) return { kind: "invalid_reference", reason: "conversation" };
  }
  if (input.workspace_id != null) {
    const w = await prisma.collaborationWorkspace.findUnique({ where: { workspace_id: input.workspace_id }, select: { org_entity_id: true } }).catch(() => null);
    if (w === null || w.org_entity_id !== scope.org_entity_id) return { kind: "invalid_reference", reason: "workspace" };
  }

  const data: Prisma.HandoffUncheckedCreateInput = {
    org_entity_id: scope.org_entity_id, title: input.title, creator_entity_id: input.creator_entity_id,
    outgoing_responsible_entity_id: input.outgoing_responsible_entity_id,
    incoming_responsible_entity_id: input.incoming_responsible_entity_id ?? null,
    twin_entity_id: input.twin_entity_id ?? null, workspace_id: input.workspace_id ?? null,
    conversation_id: input.conversation_id ?? null, source_turn_id: input.source_turn_id ?? null,
    summary: input.summary ?? null, details: (input.details ?? {}) as Prisma.InputJsonValue,
    priority: input.priority ?? "ROUTINE", origin_key: input.origin_key ?? null, state: "DRAFTED",
    subject_ref: input.subject_ref ?? null, subject_ref_class: input.subject_ref_class ?? null, due_at: input.due_at ?? null,
  };
  try {
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.handoff.create({ select: HANDOFF_SELECT, data });
      await writeHandoffAuditInTx(tx, scope.org_entity_id, { event_type: "HANDOFF_CREATED", actor_entity_id: audit.actor_entity_id, details: { handoff_id: row.handoff_id, state: row.state } });
      return row;
    });
    return { kind: "ok", handoff: toSafeHandoff(created as unknown as HandoffRow, scope.caller_entity_id), created: true };
  } catch (e) {
    if (isUniqueViolation(e) && input.origin_key != null) {
      const existing = await prisma.handoff.findUnique({ where: { org_entity_id_origin_key: { org_entity_id: scope.org_entity_id, origin_key: input.origin_key } }, select: HANDOFF_SELECT });
      if (existing !== null) return { kind: "ok", handoff: toSafeHandoff(existing as unknown as HandoffRow, scope.caller_entity_id), created: false };
    }
    return { kind: "audit_consistency_failure" };
  }
}

async function validateOrgMember(orgId: string, entityId: string): Promise<string | null> {
  const ent = await prisma.entity.findUnique({ where: { entity_id: entityId }, select: { status: true } });
  if (ent === null) return "not_found";
  if (ent.status !== "ACTIVE") return "inactive";
  const m = await prisma.entityMembership.findFirst({ where: { parent_id: orgId, child_id: entityId, is_active: true }, select: { membership_id: true } });
  if (m === null) return "not_in_org";
  return null;
}

// ── Scoped reads (multi-party) ────────────────────────────────────────────────────────────────

export async function listHandoffs(scope: HandoffScope, options: { states?: HandoffState[]; role?: "outgoing" | "incoming"; limit?: number } = {}): Promise<SafeHandoff[]> {
  const take = Math.min(Math.max(options.limit ?? 30, 1), 100);
  const roleWhere =
    options.role === "outgoing" ? { org_entity_id: scope.org_entity_id, outgoing_responsible_entity_id: scope.caller_entity_id }
      : options.role === "incoming" ? { org_entity_id: scope.org_entity_id, incoming_responsible_entity_id: scope.caller_entity_id }
        : partyWhere(scope);
  const rows = await prisma.handoff.findMany({
    where: { ...roleWhere, ...(options.states !== undefined ? { state: { in: options.states } } : {}) },
    orderBy: [{ created_at: "desc" }], take, select: HANDOFF_SELECT,
  });
  return rows.map((r) => toSafeHandoff(r as unknown as HandoffRow, scope.caller_entity_id));
}

export async function getHandoffForScope(scope: HandoffScope, handoffId: string): Promise<SafeHandoff | null> {
  const row = await prisma.handoff.findFirst({ where: { handoff_id: handoffId, ...partyWhere(scope) }, select: HANDOFF_SELECT });
  return row === null ? null : toSafeHandoff(row as unknown as HandoffRow, scope.caller_entity_id);
}

/** The linked obligations + their dispositions (scope-gated via the parent handoff). */
export async function listHandoffObligations(scope: HandoffScope, handoffId: string): Promise<Array<{ obligation_id: string; disposition: string; disposition_at: Date | null }> | null> {
  const parent = await prisma.handoff.findFirst({ where: { handoff_id: handoffId, ...partyWhere(scope) }, select: { handoff_id: true } });
  if (parent === null) return null;
  const rows = await prisma.handoffObligation.findMany({ where: { handoff_id: handoffId }, select: { obligation_id: true, disposition: true, disposition_at: true }, orderBy: { created_at: "asc" } });
  return rows;
}

// ── Transitions (party-authorized CAS + atomic audit) ──────────────────────────────────────────

export type HandoffOutcome =
  | { kind: "ok"; handoff: SafeHandoff }
  | { kind: "not_found" }
  | { kind: "stale_version"; current: SafeHandoff }
  | { kind: "illegal_transition"; current: SafeHandoff }
  | { kind: "not_authorized" } // caller is not the required party for this transition
  | { kind: "precondition"; reason: string } // e.g. complete before all obligations disposed
  | { kind: "audit_consistency_failure" };

interface HandoffCas { handoff_id: string; expected_version: number }

async function readParty(scope: HandoffScope, handoffId: string) {
  return prisma.handoff.findFirst({ where: { handoff_id: handoffId, ...partyWhere(scope) } });
}

async function classifyFailure(scope: HandoffScope, args: HandoffCas, legalFrom: readonly HandoffState[]): Promise<Exclude<HandoffOutcome, { kind: "ok" }>> {
  const row = await readParty(scope, args.handoff_id);
  if (row === null) return { kind: "not_found" };
  const safe = toSafeHandoff(row as unknown as HandoffRow, scope.caller_entity_id);
  if (row.version !== args.expected_version) return { kind: "stale_version", current: safe };
  if (!(legalFrom as readonly string[]).includes(row.state)) return { kind: "illegal_transition", current: safe };
  return { kind: "stale_version", current: safe };
}

/** Guarded party-scoped CAS + atomic audit. The WHERE includes org + handoff_id + version + state,
 *  and the party predicate is enforced by a pre-read authority check (below). */
async function casHandoff(
  scope: HandoffScope, args: HandoffCas, legalFrom: readonly HandoffState[], toState: HandoffState,
  timestampColumn: string | null, audit: HandoffAudit, extra: Record<string, string | null> = {},
): Promise<HandoffOutcome> {
  const sets: string[] = [`state = '${toState}'`, `version = version + 1`, `updated_at = now()`];
  if (timestampColumn !== null) sets.push(`${timestampColumn} = now()`);
  const params: Array<string | null> = [];
  for (const [col, val] of Object.entries(extra)) { params.push(val); sets.push(`${col} = $${params.length}::uuid`); }
  const pId = params.length + 1, pVer = params.length + 2, pOrg = params.length + 3;
  const fromList = legalFrom.map((s) => `'${s}'`).join(", ");
  const sql = `UPDATE handoffs SET ${sets.join(", ")} WHERE handoff_id = $${pId}::uuid AND version = $${pVer}::int AND org_entity_id = $${pOrg}::uuid AND state IN (${fromList})`;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const n = await tx.$executeRawUnsafe(sql, ...params, args.handoff_id, args.expected_version, scope.org_entity_id);
      if (n !== 1) return { hit: false as const };
      await writeHandoffAuditInTx(tx, scope.org_entity_id, { event_type: audit.event_type, actor_entity_id: audit.actor_entity_id, details: { handoff_id: args.handoff_id, state: toState, ...audit.details } });
      const row = await tx.handoff.findFirst({ where: { handoff_id: args.handoff_id, ...partyWhere(scope) }, select: HANDOFF_SELECT });
      return { hit: true as const, row };
    });
    if (!result.hit) return classifyFailure(scope, args, legalFrom);
    if (result.row === null) return { kind: "not_found" };
    return { kind: "ok", handoff: toSafeHandoff(result.row as unknown as HandoffRow, scope.caller_entity_id) };
  } catch {
    return { kind: "audit_consistency_failure" };
  }
}

/** Mark READY_FOR_REVIEW — outgoing party only. */
export async function readyHandoff(scope: HandoffScope, args: HandoffCas): Promise<HandoffOutcome> {
  const row = await readParty(scope, args.handoff_id);
  if (row === null) return { kind: "not_found" };
  if (row.outgoing_responsible_entity_id !== scope.caller_entity_id) return { kind: "not_authorized" };
  return casHandoff(scope, args, ["DRAFTED"], "READY_FOR_REVIEW", "ready_at", { event_type: "HANDOFF_READY", actor_entity_id: scope.caller_entity_id, details: {} });
}

/** SEND — outgoing party only; requires an incoming party set. */
export async function sendHandoff(scope: HandoffScope, args: HandoffCas & { incoming_responsible_entity_id?: string }): Promise<HandoffOutcome> {
  const row = await readParty(scope, args.handoff_id);
  if (row === null) return { kind: "not_found" };
  if (row.outgoing_responsible_entity_id !== scope.caller_entity_id) return { kind: "not_authorized" };
  const incoming = args.incoming_responsible_entity_id ?? row.incoming_responsible_entity_id;
  if (incoming == null) return { kind: "precondition", reason: "no_incoming_party" };
  const memberErr = await validateOrgMember(scope.org_entity_id, incoming);
  if (memberErr !== null) return { kind: "precondition", reason: `incoming_${memberErr}` };
  return casHandoff(scope, args, ["DRAFTED", "READY_FOR_REVIEW"], "SENT", "sent_at",
    { event_type: "HANDOFF_SENT", actor_entity_id: scope.caller_entity_id, details: {} },
    { incoming_responsible_entity_id: incoming });
}

/** RECEIVE — incoming party only (marks they got it). Not acknowledgement. */
export async function receiveHandoff(scope: HandoffScope, args: HandoffCas): Promise<HandoffOutcome> {
  const row = await readParty(scope, args.handoff_id);
  if (row === null) return { kind: "not_found" };
  if (row.incoming_responsible_entity_id !== scope.caller_entity_id) return { kind: "not_authorized" };
  return casHandoff(scope, args, ["SENT"], "RECEIVED", "received_at", { event_type: "HANDOFF_RECEIVED", actor_entity_id: scope.caller_entity_id, details: {} });
}

/** ACKNOWLEDGE — the INCOMING party only, via a real USER turn they authored. A generated/sent
 *  handoff is NOT acknowledged. */
export async function acknowledgeHandoff(scope: HandoffScope, args: HandoffCas & { acknowledged_turn_id: string }): Promise<HandoffOutcome> {
  const row = await readParty(scope, args.handoff_id);
  if (row === null) return { kind: "not_found" };
  if (row.incoming_responsible_entity_id !== scope.caller_entity_id) return { kind: "not_authorized" };
  const turn = await prisma.otzarConversationTurn.findUnique({ where: { turn_id: args.acknowledged_turn_id }, select: { role: true, author_entity_id: true, org_entity_id: true, conversation_id: true } });
  if (turn === null || turn.role !== "USER" || turn.author_entity_id !== scope.caller_entity_id || turn.org_entity_id !== scope.org_entity_id || (row.conversation_id !== null && turn.conversation_id !== row.conversation_id)) {
    return { kind: "not_authorized" };
  }
  return casHandoff(scope, args, ["SENT", "RECEIVED", "CLARIFICATION_REQUIRED"], "ACKNOWLEDGED", "acknowledged_at",
    { event_type: "HANDOFF_ACKNOWLEDGED", actor_entity_id: scope.caller_entity_id, details: {} },
    { acknowledged_turn_id: args.acknowledged_turn_id, acknowledged_by_entity_id: scope.caller_entity_id });
}

/** REQUEST CLARIFICATION — incoming party only. */
export async function requestClarificationHandoff(scope: HandoffScope, args: HandoffCas): Promise<HandoffOutcome> {
  const row = await readParty(scope, args.handoff_id);
  if (row === null) return { kind: "not_found" };
  if (row.incoming_responsible_entity_id !== scope.caller_entity_id) return { kind: "not_authorized" };
  return casHandoff(scope, args, ["SENT", "RECEIVED"], "CLARIFICATION_REQUIRED", "clarification_requested_at", { event_type: "HANDOFF_CLARIFICATION_REQUESTED", actor_entity_id: scope.caller_entity_id, details: {} });
}

/** ESCALATE — either party. */
export async function escalateHandoff(scope: HandoffScope, args: HandoffCas & { escalation_id?: string | null }): Promise<HandoffOutcome> {
  const row = await readParty(scope, args.handoff_id);
  if (row === null) return { kind: "not_found" };
  return casHandoff(scope, args, OPEN_HANDOFF_STATES.filter((s) => s !== "ESCALATED"), "ESCALATED", "escalated_at",
    { event_type: "HANDOFF_ESCALATED", actor_entity_id: scope.caller_entity_id, details: {} },
    args.escalation_id != null ? { escalation_id: args.escalation_id } : {});
}

// ── Linked-obligation dispositions ─────────────────────────────────────────────────────────────

/** Link an obligation to a DRAFTED/READY handoff (outgoing party only). Idempotent per pair. */
export async function linkObligationToHandoff(scope: HandoffScope, handoffId: string, obligationId: string): Promise<HandoffOutcome | { kind: "linked" }> {
  const row = await readParty(scope, handoffId);
  if (row === null) return { kind: "not_found" };
  if (row.outgoing_responsible_entity_id !== scope.caller_entity_id) return { kind: "not_authorized" };
  if (!["DRAFTED", "READY_FOR_REVIEW"].includes(row.state)) return { kind: "illegal_transition", current: toSafeHandoff(row as unknown as HandoffRow, scope.caller_entity_id) };
  // The obligation must belong to the outgoing party's own obligation scope (org + subject=caller).
  const ob = await prisma.obligation.findUnique({ where: { obligation_id: obligationId }, select: { org_entity_id: true, subject_entity_id: true } });
  if (ob === null || ob.org_entity_id !== scope.org_entity_id || ob.subject_entity_id !== scope.caller_entity_id) return { kind: "precondition", reason: "obligation_not_owned" };
  try {
    await prisma.handoffObligation.create({ data: { handoff_id: handoffId, obligation_id: obligationId, org_entity_id: scope.org_entity_id } });
  } catch (e) {
    if (!isUniqueViolation(e)) throw e; // already linked — idempotent
  }
  return { kind: "linked" };
}

/** Set the receiver's disposition for a linked obligation (incoming party only). ACCEPTED /
 *  REASSIGNED / SUPERSEDED / RETAINED. Atomic with its HANDOFF_OBLIGATION_DISPOSED audit. */
export async function disposeHandoffObligation(scope: HandoffScope, handoffId: string, obligationId: string, disposition: Exclude<HandoffDisposition, "PENDING">): Promise<HandoffOutcome | { kind: "disposed" }> {
  const row = await readParty(scope, handoffId);
  if (row === null) return { kind: "not_found" };
  if (row.incoming_responsible_entity_id !== scope.caller_entity_id) return { kind: "not_authorized" };
  try {
    const done = await prisma.$transaction(async (tx) => {
      const n = await tx.$executeRawUnsafe(
        `UPDATE handoff_obligations SET disposition = $1, disposition_at = now(), disposition_by_entity_id = $2::uuid WHERE handoff_id = $3::uuid AND obligation_id = $4::uuid AND org_entity_id = $5::uuid`,
        disposition, scope.caller_entity_id, handoffId, obligationId, scope.org_entity_id,
      );
      if (n !== 1) return false;
      await writeHandoffAuditInTx(tx, scope.org_entity_id, { event_type: "HANDOFF_OBLIGATION_DISPOSED", actor_entity_id: scope.caller_entity_id, details: { handoff_id: handoffId, obligation_id: obligationId, disposition } });
      return true;
    });
    return done ? { kind: "disposed" } : { kind: "precondition", reason: "obligation_not_linked" };
  } catch {
    return { kind: "audit_consistency_failure" };
  }
}

/** COMPLETE — the incoming party, ONLY after the handoff is ACKNOWLEDGED and EVERY linked
 *  obligation has an explicit non-PENDING disposition (§L). */
export async function completeHandoff(scope: HandoffScope, args: HandoffCas): Promise<HandoffOutcome> {
  const row = await readParty(scope, args.handoff_id);
  if (row === null) return { kind: "not_found" };
  if (row.incoming_responsible_entity_id !== scope.caller_entity_id) return { kind: "not_authorized" };
  if (row.state !== "ACKNOWLEDGED") return { kind: "illegal_transition", current: toSafeHandoff(row as unknown as HandoffRow, scope.caller_entity_id) };
  const pending = await prisma.handoffObligation.count({ where: { handoff_id: args.handoff_id, disposition: "PENDING" } });
  if (pending > 0) return { kind: "precondition", reason: `${pending}_obligations_pending_disposition` };
  return casHandoff(scope, args, ["ACKNOWLEDGED"], "COMPLETED", "completed_at", { event_type: "HANDOFF_COMPLETED", actor_entity_id: scope.caller_entity_id, details: {} });
}

/** SUPERSEDE — outgoing party; create a linked replacement, mark the original SUPERSEDED, in one tx. */
export async function supersedeHandoff(scope: HandoffScope, args: HandoffCas & { replacement: CreateHandoffInput }): Promise<{ outcome: HandoffOutcome; replacement?: SafeHandoff }> {
  const old = await readParty(scope, args.handoff_id);
  if (old === null) return { outcome: { kind: "not_found" } };
  if (old.outgoing_responsible_entity_id !== scope.caller_entity_id) return { outcome: { kind: "not_authorized" } };
  if ((TERMINAL_HANDOFF_STATES as readonly string[]).includes(old.state)) return { outcome: { kind: "illegal_transition", current: toSafeHandoff(old as unknown as HandoffRow, scope.caller_entity_id) } };
  if (args.replacement.details !== undefined) {
    const c = validateSafeJson(args.replacement.details);
    if (!c.ok) return { outcome: { kind: "precondition", reason: "invalid_replacement_content" } };
  }
  const fromList = OPEN_HANDOFF_STATES.map((s) => `'${s}'`).join(", ");
  try {
    const created = await prisma.$transaction(async (tx) => {
      const n = await tx.$executeRawUnsafe(`UPDATE handoffs SET state = 'SUPERSEDED', superseded_at = now(), version = version + 1, updated_at = now() WHERE handoff_id = $1::uuid AND version = $2::int AND org_entity_id = $3::uuid AND state IN (${fromList})`, args.handoff_id, args.expected_version, scope.org_entity_id);
      if (n !== 1) throw new HandoffCasConflict();
      const repl = await tx.handoff.create({
        select: HANDOFF_SELECT,
        data: {
          org_entity_id: scope.org_entity_id, title: args.replacement.title, creator_entity_id: args.replacement.creator_entity_id,
          outgoing_responsible_entity_id: scope.caller_entity_id, incoming_responsible_entity_id: args.replacement.incoming_responsible_entity_id ?? old.incoming_responsible_entity_id,
          workspace_id: args.replacement.workspace_id ?? old.workspace_id, conversation_id: args.replacement.conversation_id ?? old.conversation_id,
          summary: args.replacement.summary ?? null, details: (args.replacement.details ?? {}) as Prisma.InputJsonValue, priority: args.replacement.priority ?? old.priority,
          parent_handoff_id: args.handoff_id, superseded_handoff_id: args.handoff_id, state: "DRAFTED",
          subject_ref: args.replacement.subject_ref ?? old.subject_ref, subject_ref_class: args.replacement.subject_ref_class ?? old.subject_ref_class,
        },
      });
      await writeHandoffAuditInTx(tx, scope.org_entity_id, { event_type: "HANDOFF_SUPERSEDED", actor_entity_id: scope.caller_entity_id, details: { handoff_id: args.handoff_id, replacement_handoff_id: repl.handoff_id } });
      return repl;
    });
    const refreshed = await readParty(scope, args.handoff_id);
    return {
      outcome: refreshed === null ? { kind: "not_found" } : { kind: "ok", handoff: toSafeHandoff(refreshed as unknown as HandoffRow, scope.caller_entity_id) },
      replacement: toSafeHandoff(created as unknown as HandoffRow, scope.caller_entity_id),
    };
  } catch (e) {
    if (e instanceof HandoffCasConflict) return { outcome: await classifyFailure(scope, args, OPEN_HANDOFF_STATES) };
    return { outcome: { kind: "audit_consistency_failure" } };
  }
}

class HandoffCasConflict extends Error {
  constructor() { super("handoff_cas_conflict"); this.name = "HandoffCasConflict"; }
}
