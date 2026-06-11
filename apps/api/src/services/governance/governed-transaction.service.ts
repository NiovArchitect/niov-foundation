// FILE: governed-transaction.service.ts
// PURPOSE: Phase 1250 — Governed Transaction Readiness. Proves the
//          full governed transaction lifecycle on the CURRENT
//          production schema with ZERO schema changes and ZERO real
//          rails:
//
//            propose (DMW actor) → policy gate → human approval
//            (single or dual-control) → MOCK settlement proof →
//            append-only audit, every step.
//
//          The append-only audit chain IS the intent store: every
//          lifecycle transition is an AuditEvent (immutable per
//          ADR-0002 + RULE 4), and intent state is reconstructed by
//          replaying the chain. The persistent GATS objects
//          (SpendingCapability / PaymentIntent /
//          FoundationTransactionReceipt — ADR-0094 §3) remain
//          forward-substrate at GA2-GA5; this slice proves the
//          GOVERNANCE half is real today.
//
//          ADR-0094 §2 bans stay canonical BY CONSTRUCTION:
//          - Only MOCK_RAIL is executable; CIRCLE_GATEWAY /
//            COINBASE_BASE intents are FORBIDDEN at the policy gate
//            even when credentials exist (credentials never
//            authorize settlement).
//          - mockSettle() fabricates a clearly-labeled receipt; no
//            funds, no keys, no chains, no external calls.
//
//          RULE 0 invariants enforced here:
//          - AI / device / machine actors (AI_TWIN, AI_EMPLOYEE,
//            DEVICE, AGENT) can PROPOSE but never AUTO-APPROVE: a
//            human must approve before mock settlement (ADR-0094 §8
//            "AI agents NEVER originate PaymentIntent without
//            explicit human-tier authorization").
//          - External collaborators are structurally forbidden from
//            the internal transaction surface.
//          - Suspended entities (the AI-Employee kill switch) are
//            blocked at propose AND at settle time.
//          - Self-approval is forbidden; dual-control requires two
//            DISTINCT human approvers (ADR-0026 discipline).
//
// CONNECTS TO:
//   - docs/architecture/decisions/
//     0094-governed-agent-transaction-standard-research-doctrine.md
//   - apps/api/src/services/governance/settlement-readiness.service.ts
//     (rail truth + mockSettle; this service composes it)
//   - apps/api/src/services/dmw/dmw-registry.service.ts (the DMW
//     actor-class derivation this mirrors per ADR-0046)
//   - apps/api/src/routes/otzar-settlement.routes.ts
//   - tests/unit/governed-transaction-policy.test.ts
//   - tests/integration/governed-transaction-walk.test.ts

import { randomUUID } from "node:crypto";
import { prisma, writeAuditEvent } from "@niov/database";
import { getOrgEntityId } from "./org.js";
import {
  listSettlementRails,
  mockSettle,
  type MockSettlementReceipt,
  type SettlementRailName,
  type SettlementRailRow,
} from "./settlement-readiness.service.js";

// ── Closed vocabularies ─────────────────────────────────────

/** DMW actor classes that can appear on a transaction intent.
 *  Mirrors the Phase 1228 DMW registry projection (ADR-0046
 *  dual-context: AI_AGENT + PERSONAL = AI_TWIN; + ENTERPRISE =
 *  AI_EMPLOYEE). Derived server-side — never caller-supplied. */
export type TransactionActorClass =
  | "HUMAN"
  | "ENTERPRISE"
  | "AI_TWIN"
  | "AI_EMPLOYEE"
  | "DEVICE"
  | "AGENT"
  | "REGULATOR";

export const TRANSACTION_PURPOSES = [
  "RESOURCE_PURCHASE",
  "SERVICE_PAYMENT",
  "PAYOUT",
  "REIMBURSEMENT",
  "DEMO",
] as const;
export type TransactionPurpose = (typeof TRANSACTION_PURPOSES)[number];

/** The only asset at this slice. Real USDC is banned (ADR-0094 §2). */
export const TRANSACTION_ASSET = "USDC_MOCK" as const;

/** ONE_TIME only at this slice; SCHEDULED / RECURRING / CONDITIONAL
 *  are forward-substrate (documented in the readiness surface, not
 *  silently implied). */
export const TRANSACTION_SCHEDULE = "ONE_TIME" as const;

export type TransactionPolicyDecision =
  | "AUTO_APPROVE"
  | "REQUIRE_HUMAN_APPROVAL"
  | "REQUIRE_DUAL_CONTROL"
  | "FORBIDDEN";

export type TransactionIntentStatus =
  | "APPROVAL_REQUIRED"
  | "APPROVED"
  | "MOCK_SETTLED"
  | "DENIED"
  | "REVOKED"
  | "EXPIRED";

// ── Policy constants (mirrors the action-policy tiering idiom) ──

/** Micro ≤ $1 can auto-approve for HUMAN actors when the org opted
 *  into auto_approve_low_risk — still policy + DMW gated. */
export const MICROTRANSACTION_MAX_USD = 1;
/** ≥ $1,000 requires dual control: two distinct human approvers. */
export const DUAL_CONTROL_MIN_USD = 1000;
/** Sanity ceiling for the mock surface. */
export const TRANSACTION_AMOUNT_MAX_USD = 1_000_000;
/** Intents expire if not settled within 24 hours. */
export const INTENT_TTL_MS = 24 * 60 * 60 * 1000;
/** Org-admin clearance floor for approving (Phase 1230 convention). */
const APPROVER_CLEARANCE_FLOOR = 4;

const TRANSACTION_EVENT_TYPES = [
  "TRANSACTION_INTENT_PROPOSED",
  "TRANSACTION_INTENT_APPROVED",
  "TRANSACTION_INTENT_DENIED",
  "TRANSACTION_INTENT_REVOKED",
  "TRANSACTION_MOCK_SETTLED",
] as const;

// ── Pure policy gate ────────────────────────────────────────

export interface TransactionPolicyInput {
  actor_class: TransactionActorClass;
  /** Entity.status — SUSPENDED actors (kill switch) are blocked. */
  actor_status: string;
  amount_usd: number;
  rail: SettlementRailName | string;
  org_requires_human_approval: boolean;
  org_auto_approve_low_risk: boolean;
}

export interface TransactionPolicyResult {
  decision: TransactionPolicyDecision;
  /** Closed-vocab marker, never free text (policy-evaluator idiom). */
  reason_code: string;
  required_approvals: 0 | 1 | 2;
}

// WHAT: The Phase 1250 transaction policy gate — a pure function.
// INPUT: Server-derived actor + amount + rail + org posture.
// OUTPUT: Decision + closed-vocab reason + approval count.
// WHY: Every intent goes through policy BEFORE anything else (test
//      requirement 1/5/6/7). Ordering matters: rail and actor bans
//      fire before any approval tiering so credentials, AI autonomy,
//      or small amounts can never route around governance.
export function evaluateMockTransactionPolicy(
  input: TransactionPolicyInput,
): TransactionPolicyResult {
  // Rail ban first: only the mock rail is executable. Credentials
  // alone NEVER authorize a real rail (ADR-0094 §2 + Phase 1248 lock).
  if (input.rail !== "MOCK_RAIL") {
    return {
      decision: "FORBIDDEN",
      reason_code: "rail-not-executable-credentials-never-authorize",
      required_approvals: 0,
    };
  }
  if (
    !Number.isFinite(input.amount_usd) ||
    input.amount_usd <= 0 ||
    input.amount_usd > TRANSACTION_AMOUNT_MAX_USD
  ) {
    return {
      decision: "FORBIDDEN",
      reason_code: "amount-out-of-bounds",
      required_approvals: 0,
    };
  }
  // Kill switch / revoked authority: suspended or deleted actors are
  // blocked even for microtransactions (test requirements 3/6/11).
  if (input.actor_status !== "ACTIVE") {
    return {
      decision: "FORBIDDEN",
      reason_code: "actor-not-active",
      required_approvals: 0,
    };
  }
  // Regulators observe; they do not transact on the internal surface.
  if (input.actor_class === "REGULATOR") {
    return {
      decision: "FORBIDDEN",
      reason_code: "regulator-cannot-transact",
      required_approvals: 0,
    };
  }
  const isNonHumanActor =
    input.actor_class === "AI_TWIN" ||
    input.actor_class === "AI_EMPLOYEE" ||
    input.actor_class === "DEVICE" ||
    input.actor_class === "AGENT";
  if (input.amount_usd >= DUAL_CONTROL_MIN_USD) {
    return {
      decision: "REQUIRE_DUAL_CONTROL",
      reason_code: "high-value-dual-control",
      required_approvals: 2,
    };
  }
  // RULE 0 + ADR-0094 §8: AI / device / machine actors never
  // auto-approve — a human approves every time, at any amount.
  if (isNonHumanActor) {
    return {
      decision: "REQUIRE_HUMAN_APPROVAL",
      reason_code: "ai-or-machine-actor-requires-human-approval",
      required_approvals: 1,
    };
  }
  if (input.org_requires_human_approval) {
    return {
      decision: "REQUIRE_HUMAN_APPROVAL",
      reason_code: "org-requires-human-approval",
      required_approvals: 1,
    };
  }
  if (
    input.amount_usd <= MICROTRANSACTION_MAX_USD &&
    input.org_auto_approve_low_risk
  ) {
    return {
      decision: "AUTO_APPROVE",
      reason_code: "micro-auto-approved-within-policy",
      required_approvals: 0,
    };
  }
  return {
    decision: "REQUIRE_HUMAN_APPROVAL",
    reason_code: "default-human-approval",
    required_approvals: 1,
  };
}

// ── Views + failures ────────────────────────────────────────

type Failure = { ok: false; code: string; message?: string };

export interface TransactionIntentView {
  intent_id: string;
  status: TransactionIntentStatus;
  amount_usd: number;
  asset: typeof TRANSACTION_ASSET;
  rail: "MOCK_RAIL";
  purpose: TransactionPurpose;
  schedule: typeof TRANSACTION_SCHEDULE;
  actor_class: TransactionActorClass;
  /** Display name only — never a raw id on the wire. */
  proposed_by_display_name: string;
  policy_decision: TransactionPolicyDecision;
  policy_reason_code: string;
  required_approvals: number;
  approvals_recorded: number;
  counterparty_label: string | null;
  proposed_at: string;
  expires_at: string;
  /** Always present so no reader can mistake this for real money. */
  mock_notice: "MOCK ONLY — no funds can move on this surface.";
}

export interface MockTransactionProof {
  receipt: MockSettlementReceipt;
  /** The mock counterpart of the ADR-0094 FoundationTransactionReceipt:
   *  authorization evidence, not money movement. */
  authorization_evidence: {
    intent_id: string;
    policy_decision: TransactionPolicyDecision;
    approvals_recorded: number;
    required_approvals: number;
    audit_chained: true;
    is_mock: true;
  };
}

export interface TransactionReadinessView {
  rails: SettlementRailRow[];
  governance_substrate:
    "PROD — intent → policy → approval → mock proof, all audit-chained on the current schema";
  mock_rail: "MOCK_ONLY — clearly-labeled receipts; settles nothing";
  real_funds: "NOT_AUTHORIZED";
  private_keys: "NOT_HANDLED — custody stays with external providers if ever authorized";
  schedules_supported: [typeof TRANSACTION_SCHEDULE];
  schedules_forward_substrate: ["SCHEDULED", "RECURRING", "CONDITIONAL"];
  note: string;
}

// ── Internal helpers ────────────────────────────────────────

interface ActorContext {
  entityId: string;
  orgEntityId: string;
  status: string;
  displayName: string;
  clearance: number;
  entityType: string;
  actorClass: TransactionActorClass;
}

// WHAT: Load the caller as a transaction actor inside their org.
// WHY: DMW authority first (RULE 5 ordering): no org, no surface.
//      The actor class is DERIVED (ADR-0046 mapping) — callers
//      cannot claim a class.
async function loadActor(entityId: string): Promise<ActorContext | Failure> {
  const entity = await prisma.entity.findUnique({
    where: { entity_id: entityId },
    select: {
      status: true,
      display_name: true,
      clearance_level: true,
      entity_type: true,
      wallet: { select: { wallet_type: true } },
    },
  });
  if (entity === null) return { ok: false, code: "ACTOR_NOT_FOUND" };
  let orgEntityId: string;
  try {
    orgEntityId = await getOrgEntityId(entityId);
  } catch {
    return { ok: false, code: "NO_ORG_FOR_CALLER" };
  }
  const walletType = entity.wallet?.wallet_type ?? null;
  let actorClass: TransactionActorClass;
  switch (entity.entity_type) {
    case "PERSON":
      actorClass = "HUMAN";
      break;
    case "COMPANY":
      actorClass = "ENTERPRISE";
      break;
    case "AI_AGENT":
      actorClass = walletType === "PERSONAL" ? "AI_TWIN" : "AI_EMPLOYEE";
      break;
    case "DEVICE":
      actorClass = "DEVICE";
      break;
    case "REGULATOR":
      actorClass = "REGULATOR";
      break;
    default:
      // APPLICATION + GOVERNMENT project as AGENT (DMW registry).
      actorClass = "AGENT";
      break;
  }
  return {
    entityId,
    orgEntityId,
    status: entity.status,
    displayName: entity.display_name,
    clearance: entity.clearance_level,
    entityType: entity.entity_type,
    actorClass,
  };
}

interface IntentState {
  intent_id: string;
  org_entity_id: string;
  proposer_entity_id: string;
  proposed_by_display_name: string;
  actor_class: TransactionActorClass;
  amount_usd: number;
  purpose: TransactionPurpose;
  counterparty_label: string | null;
  policy_decision: TransactionPolicyDecision;
  policy_reason_code: string;
  required_approvals: number;
  approver_ids: string[];
  denied: boolean;
  revoked: boolean;
  settled: boolean;
  proposed_at: Date;
  expires_at: Date;
}

function deriveStatus(s: IntentState, now: Date): TransactionIntentStatus {
  if (s.settled) return "MOCK_SETTLED";
  if (s.revoked) return "REVOKED";
  if (s.denied) return "DENIED";
  if (now.getTime() > s.expires_at.getTime()) return "EXPIRED";
  if (s.approver_ids.length >= s.required_approvals) return "APPROVED";
  return "APPROVAL_REQUIRED";
}

function toView(s: IntentState, now: Date): TransactionIntentView {
  return {
    intent_id: s.intent_id,
    status: deriveStatus(s, now),
    amount_usd: s.amount_usd,
    asset: TRANSACTION_ASSET,
    rail: "MOCK_RAIL",
    purpose: s.purpose,
    schedule: TRANSACTION_SCHEDULE,
    actor_class: s.actor_class,
    proposed_by_display_name: s.proposed_by_display_name,
    policy_decision: s.policy_decision,
    policy_reason_code: s.policy_reason_code,
    required_approvals: s.required_approvals,
    approvals_recorded: s.approver_ids.length,
    counterparty_label: s.counterparty_label,
    proposed_at: s.proposed_at.toISOString(),
    expires_at: s.expires_at.toISOString(),
    mock_notice: "MOCK ONLY — no funds can move on this surface.",
  };
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

// WHAT: Replay the audit chain into intent state (event sourcing).
// WHY: The chain is append-only + tamper-evident (ADR-0002), so it
//      doubles as an immutable intent store with zero new tables.
async function loadIntentState(
  intentId: string,
  client: Tx | typeof prisma = prisma,
): Promise<IntentState | null> {
  const events = await client.auditEvent.findMany({
    where: {
      event_type: { in: [...TRANSACTION_EVENT_TYPES] },
      details: { path: ["intent_id"], equals: intentId },
    },
    orderBy: { timestamp: "asc" },
    select: {
      event_type: true,
      actor_entity_id: true,
      timestamp: true,
      details: true,
    },
  });
  const proposed = events.find(
    (e) => e.event_type === "TRANSACTION_INTENT_PROPOSED",
  );
  if (proposed === undefined) return null;
  const d = proposed.details as Record<string, unknown>;
  const state: IntentState = {
    intent_id: intentId,
    org_entity_id: String(d.org_entity_id ?? ""),
    proposer_entity_id: proposed.actor_entity_id ?? "",
    proposed_by_display_name: String(d.proposed_by_display_name ?? ""),
    actor_class: d.actor_class as TransactionActorClass,
    amount_usd: Number(d.amount_usd ?? 0),
    purpose: d.purpose as TransactionPurpose,
    counterparty_label:
      typeof d.counterparty_label === "string" ? d.counterparty_label : null,
    policy_decision: d.policy_decision as TransactionPolicyDecision,
    policy_reason_code: String(d.reason_code ?? ""),
    required_approvals: Number(d.required_approvals ?? 1),
    approver_ids: [],
    denied: false,
    revoked: false,
    settled: false,
    proposed_at: proposed.timestamp,
    expires_at: new Date(String(d.expires_at ?? proposed.timestamp)),
  };
  for (const e of events) {
    if (e.event_type === "TRANSACTION_INTENT_APPROVED") {
      const approver = e.actor_entity_id;
      if (approver !== null && !state.approver_ids.includes(approver)) {
        state.approver_ids.push(approver);
      }
    } else if (e.event_type === "TRANSACTION_INTENT_DENIED") {
      state.denied = true;
    } else if (e.event_type === "TRANSACTION_INTENT_REVOKED") {
      state.revoked = true;
    } else if (e.event_type === "TRANSACTION_MOCK_SETTLED") {
      state.settled = true;
    }
  }
  return state;
}

// ── Public API (service-owned auth gates per ADR-0004) ──────

export type ProposeResult =
  | { ok: true; intent: TransactionIntentView }
  | Failure;

// WHAT: A DMW actor expresses a governed transaction intent.
// INPUT: callerEntityId (session-derived) + amount + purpose +
//        optional counterparty label / same-org counterparty id +
//        optional rail (anything but MOCK_RAIL is refused by policy).
// OUTPUT: The intent view, or a denial (which is itself audited).
// WHY: Intent is separated from execution: proposing NEVER settles.
export async function proposeMockTransactionIntentForCaller(input: {
  callerEntityId: string;
  amountUsd: number;
  purpose: string;
  counterpartyLabel?: string;
  counterpartyEntityId?: string;
  rail?: string;
}): Promise<ProposeResult> {
  const actor = await loadActor(input.callerEntityId);
  if ("ok" in actor) return actor;
  if (!TRANSACTION_PURPOSES.includes(input.purpose as TransactionPurpose)) {
    return { ok: false, code: "INVALID_PURPOSE" };
  }
  // External collaborators have no Entity row on this surface, so
  // they cannot reach here with a session; the structural lock is
  // tested at the route tier. Same-org counterparty check (no
  // cross-tenant intents, ADR-0094 §8):
  if (input.counterpartyEntityId !== undefined) {
    let counterpartyOrg: string;
    try {
      counterpartyOrg = await getOrgEntityId(input.counterpartyEntityId);
    } catch {
      return { ok: false, code: "COUNTERPARTY_NOT_FOUND" };
    }
    if (counterpartyOrg !== actor.orgEntityId) {
      return { ok: false, code: "CROSS_ORG_FORBIDDEN" };
    }
  }
  const org = await prisma.orgSettings.findUnique({
    where: { org_entity_id: actor.orgEntityId },
    select: { require_human_approval: true, auto_approve_low_risk: true },
  });
  const policy = evaluateMockTransactionPolicy({
    actor_class: actor.actorClass,
    actor_status: actor.status,
    amount_usd: input.amountUsd,
    rail: input.rail ?? "MOCK_RAIL",
    org_requires_human_approval: org?.require_human_approval ?? true,
    org_auto_approve_low_risk: org?.auto_approve_low_risk ?? false,
  });
  const intentId = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + INTENT_TTL_MS);
  if (policy.decision === "FORBIDDEN") {
    // Denials are audited too (RULE 4) — the denial IS evidence.
    await writeAuditEvent({
      event_type: "TRANSACTION_INTENT_DENIED",
      outcome: "DENIED",
      actor_entity_id: input.callerEntityId,
      target_entity_id: actor.orgEntityId,
      denial_reason: policy.reason_code,
      details: {
        intent_id: intentId,
        org_entity_id: actor.orgEntityId,
        amount_usd: input.amountUsd,
        asset: TRANSACTION_ASSET,
        rail: input.rail ?? "MOCK_RAIL",
        purpose: input.purpose,
        actor_class: actor.actorClass,
        policy_decision: policy.decision,
        reason_code: policy.reason_code,
        phase: 1250,
      },
    });
    return { ok: false, code: "POLICY_FORBIDDEN", message: policy.reason_code };
  }
  await writeAuditEvent({
    event_type: "TRANSACTION_INTENT_PROPOSED",
    outcome: "SUCCESS",
    actor_entity_id: input.callerEntityId,
    target_entity_id: actor.orgEntityId,
    details: {
      intent_id: intentId,
      org_entity_id: actor.orgEntityId,
      proposed_by_display_name: actor.displayName,
      amount_usd: input.amountUsd,
      asset: TRANSACTION_ASSET,
      rail: "MOCK_RAIL",
      purpose: input.purpose,
      schedule: TRANSACTION_SCHEDULE,
      actor_class: actor.actorClass,
      policy_decision: policy.decision,
      reason_code: policy.reason_code,
      required_approvals: policy.required_approvals,
      counterparty_label: input.counterpartyLabel ?? null,
      expires_at: expiresAt.toISOString(),
      phase: 1250,
    },
  });
  const state = await loadIntentState(intentId);
  if (state === null) return { ok: false, code: "INTENT_WRITE_FAILED" };
  return { ok: true, intent: toView(state, now) };
}

export type ApproveResult =
  | { ok: true; intent: TransactionIntentView }
  | Failure;

// WHAT: A human org admin approves a pending intent.
// WHY: Approval is human-tier authority (ADR-0094 §8). Self-approval
//      and duplicate approvals are forbidden; dual control needs two
//      DISTINCT humans (ADR-0026 discipline; GAP-C1 analogue).
export async function approveMockTransactionIntentForCaller(input: {
  callerEntityId: string;
  intentId: string;
}): Promise<ApproveResult> {
  const approver = await loadActor(input.callerEntityId);
  if ("ok" in approver) return approver;
  if (approver.actorClass !== "HUMAN") {
    return { ok: false, code: "HUMAN_APPROVER_REQUIRED" };
  }
  if (approver.status !== "ACTIVE") {
    return { ok: false, code: "APPROVER_NOT_ACTIVE" };
  }
  if (approver.clearance < APPROVER_CLEARANCE_FLOOR) {
    return { ok: false, code: "ADMIN_REQUIRED" };
  }
  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const state = await loadIntentState(input.intentId, tx);
    if (state === null) return { ok: false as const, code: "INTENT_NOT_FOUND" };
    if (state.org_entity_id !== approver.orgEntityId) {
      // Cross-org reads look like not-found (tenant isolation).
      return { ok: false as const, code: "INTENT_NOT_FOUND" };
    }
    const status = deriveStatus(state, now);
    if (status !== "APPROVAL_REQUIRED") {
      return { ok: false as const, code: `INTENT_${status}` };
    }
    if (state.proposer_entity_id === input.callerEntityId) {
      return { ok: false as const, code: "SELF_APPROVAL_FORBIDDEN" };
    }
    if (state.approver_ids.includes(input.callerEntityId)) {
      return { ok: false as const, code: "ALREADY_APPROVED_BY_CALLER" };
    }
    await writeAuditEvent(
      {
        event_type: "TRANSACTION_INTENT_APPROVED",
        outcome: "SUCCESS",
        actor_entity_id: input.callerEntityId,
        target_entity_id: state.proposer_entity_id,
        details: {
          intent_id: input.intentId,
          org_entity_id: state.org_entity_id,
          approver_entity_id: input.callerEntityId,
          approvals_recorded: state.approver_ids.length + 1,
          required_approvals: state.required_approvals,
          phase: 1250,
        },
      },
      tx,
    );
    return { ok: true as const };
  });
  if (result.ok === false) return result;
  const state = await loadIntentState(input.intentId);
  if (state === null) return { ok: false, code: "INTENT_NOT_FOUND" };
  return { ok: true, intent: toView(state, now) };
}

export type RevokeResult =
  | { ok: true; intent: TransactionIntentView }
  | Failure;

// WHAT: Proposer or org admin revokes a not-yet-settled intent.
// WHY: Revocability is RULE 0: authority can always be withdrawn
//      before execution. Settled (mock) intents are history — the
//      chain never rewrites.
export async function revokeMockTransactionIntentForCaller(input: {
  callerEntityId: string;
  intentId: string;
}): Promise<RevokeResult> {
  const caller = await loadActor(input.callerEntityId);
  if ("ok" in caller) return caller;
  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const state = await loadIntentState(input.intentId, tx);
    if (state === null) return { ok: false as const, code: "INTENT_NOT_FOUND" };
    if (state.org_entity_id !== caller.orgEntityId) {
      return { ok: false as const, code: "INTENT_NOT_FOUND" };
    }
    const isProposer = state.proposer_entity_id === input.callerEntityId;
    const isAdmin =
      caller.actorClass === "HUMAN" &&
      caller.clearance >= APPROVER_CLEARANCE_FLOOR;
    if (!isProposer && !isAdmin) {
      return { ok: false as const, code: "REVOKE_NOT_ALLOWED" };
    }
    const status = deriveStatus(state, now);
    if (status === "MOCK_SETTLED" || status === "REVOKED") {
      return { ok: false as const, code: `INTENT_${status}` };
    }
    await writeAuditEvent(
      {
        event_type: "TRANSACTION_INTENT_REVOKED",
        outcome: "SUCCESS",
        actor_entity_id: input.callerEntityId,
        target_entity_id: state.proposer_entity_id,
        details: {
          intent_id: input.intentId,
          org_entity_id: state.org_entity_id,
          revoked_by_entity_id: input.callerEntityId,
          phase: 1250,
        },
      },
      tx,
    );
    return { ok: true as const };
  });
  if (result.ok === false) return result;
  const state = await loadIntentState(input.intentId);
  if (state === null) return { ok: false, code: "INTENT_NOT_FOUND" };
  return { ok: true, intent: toView(state, now) };
}

export type SettleResult =
  | { ok: true; proof: MockTransactionProof; intent: TransactionIntentView }
  | Failure;

// WHAT: Execute the MOCK settlement of a fully-approved intent.
// WHY: The strict line between approval and execution (test req 1):
//      settle re-derives state inside a transaction and refuses
//      anything not APPROVED. The proposer is re-checked at settle
//      time so the kill switch (SUSPENDED) bites even after approval.
//      The "settlement" is mockSettle(): no funds, no keys, no chain.
export async function settleMockTransactionIntentForCaller(input: {
  callerEntityId: string;
  intentId: string;
}): Promise<SettleResult> {
  const caller = await loadActor(input.callerEntityId);
  if ("ok" in caller) return caller;
  const now = new Date();
  const outcome = await prisma.$transaction(async (tx) => {
    const state = await loadIntentState(input.intentId, tx);
    if (state === null) return { ok: false as const, code: "INTENT_NOT_FOUND" };
    if (state.org_entity_id !== caller.orgEntityId) {
      return { ok: false as const, code: "INTENT_NOT_FOUND" };
    }
    const isProposer = state.proposer_entity_id === input.callerEntityId;
    const isAdmin =
      caller.actorClass === "HUMAN" &&
      caller.clearance >= APPROVER_CLEARANCE_FLOOR;
    if (!isProposer && !isAdmin) {
      return { ok: false as const, code: "SETTLE_NOT_ALLOWED" };
    }
    const status = deriveStatus(state, now);
    if (status !== "APPROVED") {
      return { ok: false as const, code: `INTENT_${status}` };
    }
    // Kill switch at execution time: a suspended proposer (e.g. a
    // deactivated AI Employee) cannot have its intents settled.
    const proposer = await tx.entity.findUnique({
      where: { entity_id: state.proposer_entity_id },
      select: { status: true },
    });
    if (proposer === null || proposer.status !== "ACTIVE") {
      return { ok: false as const, code: "PROPOSER_NOT_ACTIVE" };
    }
    const receipt = mockSettle({
      reference: `mock-intent:${input.intentId}`,
      amount_usd: state.amount_usd,
    });
    await writeAuditEvent(
      {
        event_type: "TRANSACTION_MOCK_SETTLED",
        outcome: "SUCCESS",
        actor_entity_id: input.callerEntityId,
        target_entity_id: state.proposer_entity_id,
        details: {
          intent_id: input.intentId,
          org_entity_id: state.org_entity_id,
          amount_usd: state.amount_usd,
          asset: TRANSACTION_ASSET,
          rail: receipt.rail,
          is_mock: receipt.is_mock,
          receipt_reference: receipt.reference,
          approvals_recorded: state.approver_ids.length,
          required_approvals: state.required_approvals,
          phase: 1250,
        },
      },
      tx,
    );
    return { ok: true as const, receipt, state };
  });
  if (outcome.ok === false) return outcome;
  const state = await loadIntentState(input.intentId);
  if (state === null) return { ok: false, code: "INTENT_NOT_FOUND" };
  return {
    ok: true,
    proof: {
      receipt: outcome.receipt,
      authorization_evidence: {
        intent_id: input.intentId,
        policy_decision: outcome.state.policy_decision,
        approvals_recorded: outcome.state.approver_ids.length,
        required_approvals: outcome.state.required_approvals,
        audit_chained: true,
        is_mock: true,
      },
    },
    intent: toView(state, now),
  };
}

export type ListResult =
  | { ok: true; intents: TransactionIntentView[] }
  | Failure;

// WHAT: List the org's mock intents (admins) or the caller's own.
// WHY: Org-scoped visibility with tenant isolation; reconstruction
//      stays bounded (most recent 50 proposals).
export async function listMockTransactionIntentsForCaller(input: {
  callerEntityId: string;
}): Promise<ListResult> {
  const caller = await loadActor(input.callerEntityId);
  if ("ok" in caller) return caller;
  const isAdmin =
    caller.actorClass === "HUMAN" &&
    caller.clearance >= APPROVER_CLEARANCE_FLOOR;
  const proposals = await prisma.auditEvent.findMany({
    where: {
      event_type: "TRANSACTION_INTENT_PROPOSED",
      details: { path: ["org_entity_id"], equals: caller.orgEntityId },
      ...(isAdmin ? {} : { actor_entity_id: input.callerEntityId }),
    },
    orderBy: { timestamp: "desc" },
    take: 50,
    select: { details: true },
  });
  const now = new Date();
  const views: TransactionIntentView[] = [];
  for (const p of proposals) {
    const d = p.details as Record<string, unknown>;
    const id = typeof d.intent_id === "string" ? d.intent_id : null;
    if (id === null) continue;
    const state = await loadIntentState(id);
    if (state !== null) views.push(toView(state, now));
  }
  return { ok: true, intents: views };
}

export type ReadinessResult =
  | { ok: true; readiness: TransactionReadinessView }
  | Failure;

// WHAT: The admin-facing transaction readiness truth.
// WHY: Admins must see exactly what is real (governance substrate),
//      what is mock (the rail), and what stays gated (everything
//      involving actual money).
export async function getTransactionReadinessForCaller(input: {
  callerEntityId: string;
}): Promise<ReadinessResult> {
  const caller = await loadActor(input.callerEntityId);
  if ("ok" in caller) return caller;
  if (
    caller.actorClass !== "HUMAN" ||
    caller.clearance < APPROVER_CLEARANCE_FLOOR
  ) {
    return { ok: false, code: "ADMIN_REQUIRED" };
  }
  return {
    ok: true,
    readiness: {
      rails: listSettlementRails(),
      governance_substrate:
        "PROD — intent → policy → approval → mock proof, all audit-chained on the current schema",
      mock_rail: "MOCK_ONLY — clearly-labeled receipts; settles nothing",
      real_funds: "NOT_AUTHORIZED",
      private_keys:
        "NOT_HANDLED — custody stays with external providers if ever authorized",
      schedules_supported: [TRANSACTION_SCHEDULE],
      schedules_forward_substrate: ["SCHEDULED", "RECURRING", "CONDITIONAL"],
      note: "Real settlement (Circle / Coinbase Base / USDC) requires the organization's credentials AND explicit Founder authorization per ADR-0094 — credentials alone never authorize settlement.",
    },
  };
}
