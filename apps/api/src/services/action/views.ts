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
  return safe;
}
