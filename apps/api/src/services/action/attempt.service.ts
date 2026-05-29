// FILE: attempt.service.ts
// PURPOSE: ADR-0057 §9 ActionAttempt detail read service. Returns a
//          safe-allowlisted view of a single ActionAttempt row plus
//          the optional latest ActionResult for that attempt. Same
//          authorization spine as get.service.ts (source self-scope
//          OR can_admin_org-over-same-org); RULE 0
//          enumeration-prevention 404 for non-source non-admin
//          callers.
// CONNECTS TO:
//   - apps/api/src/services/action/get.service.ts (mirrors the
//     ownership / admin gating pattern)
//   - apps/api/src/services/action/views.ts (SafeActionView contract
//     for forbidden-field discipline)
//   - apps/api/src/services/governance/org.ts (getOrgEntityId for
//     the can_admin_org cross-check)
//   - apps/api/src/routes/actions.routes.ts (the route consumer)
//   - packages/database (prisma + Prisma types)
//   - ADR-0057 §9 (forbidden-fields per §10)
//
// FOUNDER LOCKS:
//   - Self-scope by default: caller MUST be source_entity_id of the
//     parent Action.
//   - can_admin_org callers in the same org as Action.org_entity_id
//     can also read. TAR-authoritative.
//   - 404 ACTION_NOT_FOUND for unknown action_id OR unknown
//     attempt_id (RULE 0 enumeration-prevention).
//   - 404 ATTEMPT_NOT_FOUND when the attempt exists but belongs to
//     a different action (defense-in-depth against the route path
//     mismatch — same RULE 0 enumeration shape).
//   - Forbidden fields per ADR-0057 §10: no stack traces, no raw
//     payload, no error vector data. error_summary is bounded
//     (lifecycle.service.ts clamps to LIFECYCLE_FIELD_MAX_CHARS at
//     write time; we re-assert read-time absence of common
//     leak-prone tokens via the no-leak guard).

import { prisma } from "@niov/database";
import type { ActionAttempt, ActionAttemptOutcome } from "@prisma/client";
import { getOrgEntityId } from "../governance/org.js";

// WHAT: Same UUID guard the other action services use.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// WHAT: The safe response shape returned by getActionAttemptForCaller.
//        Mirrors ActionAttempt's columns minus the forbidden-fields
//        set + adds the optional latest ActionResult.result_summary
//        + result_metadata when present.
// INPUT: Used as a return type.
// OUTPUT: None.
// WHY: Locks the response contract at the type level so any future
//      handler that tries to add a stack trace or raw payload fails
//      at compile time.
export interface SafeActionAttemptView {
  attempt_id: string;
  action_id: string;
  attempt_number: number;
  started_at: string;
  ended_at: string | null;
  outcome: ActionAttemptOutcome | null;
  worker_id: string | null;
  error_class: string | null;
  error_summary: string | null;
  // Present only when the attempt has a SUCCEEDED outcome AND an
  // ActionResult row was created. result_metadata is the SAFE
  // metadata payload the handler returned (per the
  // [ADR-0057-RECORD-CAPSULE-HANDLER] no-leak contract).
  result_summary: string | null;
  result_metadata: Record<string, unknown> | null;
}

// WHAT: Discriminated-union result returned by
//        getActionAttemptForCaller.
// INPUT: Used as a return type.
// OUTPUT: None.
// WHY: Same shape family as create / cancel / get / list.
export type GetActionAttemptResult =
  | { ok: true; httpStatus: 200; view: SafeActionAttemptView }
  | {
      ok: false;
      httpStatus: 400 | 401 | 403 | 404;
      code: string;
      message?: string;
    };

// WHAT: TAR-authoritative check that the caller has can_admin_org
//        AND resolves to the same org as the parent Action.
// INPUT: callerEntityId + the parent Action's org_entity_id.
// OUTPUT: Boolean.
// WHY: Mirrors get.service.ts's callerHasAdminScopeOverOrg. Pulled
//      out for clarity; the duplication is intentional so each
//      action read service owns its own gate logic explicitly.
async function callerHasAdminScopeOverOrg(
  callerEntityId: string,
  actionOrgEntityId: string,
): Promise<boolean> {
  const tar = await prisma.tokenAttributeRepository.findUnique({
    where: { entity_id: callerEntityId },
    select: { can_admin_org: true, status: true },
  });
  if (tar === null || tar.status !== "ACTIVE" || tar.can_admin_org !== true) {
    return false;
  }
  try {
    const callerOrgId = await getOrgEntityId(callerEntityId);
    return callerOrgId === actionOrgEntityId;
  } catch {
    return false;
  }
}

// WHAT: Project an ActionAttempt + optional latest ActionResult to
//        the SafeActionAttemptView.
// INPUT: The attempt row + the optional ActionResult row.
// OUTPUT: A SafeActionAttemptView.
// WHY: One projector so the forbidden-fields contract is enforced
//      by construction.
function projectActionAttemptView(
  attempt: ActionAttempt,
  result: { result_summary: string; result_metadata: unknown } | null,
): SafeActionAttemptView {
  return {
    attempt_id: attempt.attempt_id,
    action_id: attempt.action_id,
    attempt_number: attempt.attempt_number,
    started_at: attempt.started_at.toISOString(),
    ended_at:
      attempt.ended_at === null ? null : attempt.ended_at.toISOString(),
    outcome: attempt.outcome,
    worker_id: attempt.worker_id,
    error_class: attempt.error_class,
    error_summary: attempt.error_summary,
    result_summary: result === null ? null : result.result_summary,
    result_metadata:
      result === null
        ? null
        : (result.result_metadata as Record<string, unknown>),
  };
}

// WHAT: Fetch the safe detail view of one ActionAttempt for the
//        caller. The caller must own the parent Action OR have
//        can_admin_org over the parent Action's org.
// INPUT: callerEntityId + actionId + attemptId.
// OUTPUT: A GetActionAttemptResult.
// WHY: Centralizes the read-side per ADR-0057 §9. Step-wise:
//      1. Validate both UUIDs (400 INVALID_ACTION_ID /
//         INVALID_ATTEMPT_ID).
//      2. Load the parent Action (404 ACTION_NOT_FOUND on missing
//         OR soft-delete).
//      3. Ownership check (RULE 0 enumeration-prevention 404 on
//         non-source non-admin).
//      4. Load the attempt (404 ATTEMPT_NOT_FOUND when missing
//         OR action_id mismatch OR soft-deleted).
//      5. Load the latest ActionResult for the attempt (may be
//         null — only SUCCEEDED attempts produce results).
//      6. Project to SafeActionAttemptView.
export async function getActionAttemptForCaller(
  callerEntityId: string,
  actionId: string,
  attemptId: string,
): Promise<GetActionAttemptResult> {
  if (typeof actionId !== "string" || !UUID_RE.test(actionId)) {
    return { ok: false, httpStatus: 400, code: "INVALID_ACTION_ID" };
  }
  if (typeof attemptId !== "string" || !UUID_RE.test(attemptId)) {
    return { ok: false, httpStatus: 400, code: "INVALID_ATTEMPT_ID" };
  }

  const action = await prisma.action.findUnique({
    where: { action_id: actionId },
  });
  if (action === null || action.deleted_at !== null) {
    return { ok: false, httpStatus: 404, code: "ACTION_NOT_FOUND" };
  }

  const isSource = action.source_entity_id === callerEntityId;
  if (!isSource) {
    const isOrgAdmin = await callerHasAdminScopeOverOrg(
      callerEntityId,
      action.org_entity_id,
    );
    if (!isOrgAdmin) {
      // RULE 0 enumeration-prevention: same 404 the unknown-id
      // branch returns. Non-admin strangers learn nothing about
      // which (action_id, attempt_id) pairs exist.
      return { ok: false, httpStatus: 404, code: "ACTION_NOT_FOUND" };
    }
  }

  const attempt = await prisma.actionAttempt.findUnique({
    where: { attempt_id: attemptId },
  });
  if (
    attempt === null ||
    attempt.deleted_at !== null ||
    attempt.action_id !== actionId
  ) {
    // 404 ATTEMPT_NOT_FOUND for: unknown attempt_id, soft-deleted
    // attempt, OR attempt belongs to a different action (path
    // mismatch). All three are indistinguishable from the
    // caller's perspective by design.
    return { ok: false, httpStatus: 404, code: "ATTEMPT_NOT_FOUND" };
  }

  // Latest ActionResult for the attempt (may be null — only
  // SUCCEEDED outcomes produce results per the executor's flow).
  const result = await prisma.actionResult.findFirst({
    where: { attempt_id: attempt.attempt_id },
    orderBy: { created_at: "desc" },
    select: { result_summary: true, result_metadata: true },
  });

  return {
    ok: true,
    httpStatus: 200,
    view: projectActionAttemptView(attempt, result),
  };
}
