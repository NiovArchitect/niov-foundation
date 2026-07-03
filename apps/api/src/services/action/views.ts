// FILE: views.ts
// PURPOSE: Mapper-tier safe projection for Action rows per ADR-0057 §10
//          forbidden-fields list. Pure transformation; no DB, no I/O.
//          Strips forbidden fields by construction so route handlers
//          never reach into the ORM-shaped Action object.
// CONNECTS TO: apps/api/src/services/action/action.service.ts (the
//              create-time consumer; calls projectActionView on the
//              upserted/created row before responding); apps/api/src/
//              routes/actions.routes.ts (the route handler that returns
//              the safe view to the caller); packages/database/prisma/
//              schema.prisma (the Action model from PR #18);
//              ADR-0057 §10 (the canonical forbidden-fields list +
//              SAFE-allowlist this projection enforces).
//
// SAFE FIELDS (per ADR-0057 §9 + §10):
//   - action_id, status, action_type, risk_tier
//   - requires_approval (derived from status)
//   - escalation_id (when paired)
//   - decision_reason (enum-bound REASON_CODE marker only; never raw text)
//   - created_at, updated_at
//
// FORBIDDEN FIELDS (per ADR-0057 §10; NEVER returned in response body):
//   - payload_summary, payload_redacted, policy_envelope
//   - policy_envelope_hash (audit-only; not response-safe per ADR-0057
//     §10 hash-vs-envelope-separation; the response carries the action_id
//     which is the canonical reference)
//   - source_entity_id, org_entity_id, target_entity_id
//     (target_entity_id is response-omitted by default; SAFE in audit
//     "where structurally safe" per Phase E Invariant 6, but the
//     consumer-facing response never echoes routing internals)
//   - deleted_at (RULE 10 soft-delete metadata; internal only)
//   - raw errors / stack traces

import type { Action, ActionStatus } from "@prisma/client";

// WHAT: The discriminated SAFE response shape returned by POST
//        /api/v1/actions per ADR-0057 §9.
// INPUT: Used as a return type.
// OUTPUT: None.
// WHY: Locks the response contract at the type level so any future
//      handler change that tries to add a forbidden field fails at
//      compile time, not at runtime.
export interface SafeActionView {
  action_id: string;
  status: ActionStatus;
  action_type: string;
  risk_tier: string;
  requires_approval: boolean;
  escalation_id?: string;
  decision_reason?: string;
  created_at: string;
  updated_at: string;
  // ── ADR-0057 §10 Amendment 1 (Founder-authorized 2026-06-16, BLOCKER 2) ──
  // SAFE resolved DISPLAY-NAME labels for the action's recipient + requester,
  // so an authorized approver/admin sees "internal note to David Odie" instead
  // of a generic card. These are display names ONLY — never the routing UUIDs
  // (target_entity_id / source_entity_id stay forbidden), never the message
  // body / payload_summary / policy envelope. Resolved by the service tier
  // (self/admin-scoped reads); null when the entity cannot be resolved (CT
  // renders "recipient unavailable" + an unresolved badge). Optional so the
  // create-time projection — which does not resolve names — omits them.
  target_label?: string | null;
  requester_label?: string | null;
  // ── [GAP-E] Sender-visible rejection reason ──
  // The approver's human reason (already bounded to a SAFE ≤500-char scalar
  // by safeApproverReason at resolution time). Present ONLY on REJECTED
  // actions whose paired escalation carries a reason — the escalation row
  // stays the canonical record; this is a read-side projection so the sender
  // sees WHY without visiting an admin surface. Never an ID, never metadata.
  not_approved_reason?: string | null;
}

// WHAT: SAFE display-name labels passed into the projection by the service
//        tier (it owns the DB-backed name resolution; the mapper stays pure).
// WHY: Keeps projectActionView a pure transformation per ADR-0026 §5 Pattern 6
//      — the service resolves names, the mapper just copies the safe labels.
export interface SafeActionLabels {
  target_label?: string | null;
  requester_label?: string | null;
  /** [GAP-E] Service-resolved approver reason for REJECTED actions. */
  not_approved_reason?: string | null;
}

// WHAT: Map a full Action row + an optional decision_reason marker
//        to the safe response shape.
// INPUT: An Action row (from Prisma) + an optional decision_reason
//        enum-bound REASON_CODE.
// OUTPUT: A SafeActionView with NO forbidden fields.
// WHY: Constructed-by-allowlist: the function only copies named
//      SAFE fields; the FORBIDDEN fields never appear in the
//      returned object. This mirrors the
//      tests/unit/no-leak-guard.test.ts safe-projection precedent
//      established by ADR-0051 / ADR-0054 / ADR-0055.
//      requires_approval is derived from status: PROPOSED →
//      true (the action is waiting for approval); APPROVED /
//      REJECTED / etc. → false. This matches the ADR-0057 §9
//      response field intent (the caller sees "do I still need to
//      wait?" without seeing routing internals).
export function projectActionView(
  action: Action,
  decision_reason?: string,
  labels?: SafeActionLabels,
): SafeActionView {
  const safe: SafeActionView = {
    action_id: action.action_id,
    status: action.status,
    action_type: String(action.action_type),
    risk_tier: String(action.risk_tier),
    requires_approval: action.status === "PROPOSED",
    created_at: action.created_at.toISOString(),
    updated_at: action.updated_at.toISOString(),
  };
  if (action.escalation_id !== null) {
    safe.escalation_id = action.escalation_id;
  }
  if (decision_reason !== undefined) {
    safe.decision_reason = decision_reason;
  }
  // SAFE labels only — copied verbatim from the service-resolved display names.
  // Never the entity_id; the routing UUID is not in scope here by construction.
  if (labels?.target_label !== undefined) {
    safe.target_label = labels.target_label;
  }
  if (labels?.requester_label !== undefined) {
    safe.requester_label = labels.requester_label;
  }
  // [GAP-E] Only a real reason on a REJECTED action is projected — no empty
  // fields, no reasons leaking onto non-rejected states.
  if (
    action.status === "REJECTED" &&
    labels?.not_approved_reason !== undefined &&
    labels.not_approved_reason !== null
  ) {
    safe.not_approved_reason = labels.not_approved_reason;
  }
  return safe;
}
