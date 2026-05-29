// FILE: get.service.ts
// PURPOSE: The ADR-0057 §9 Action read service. Returns a
//          safe-allowlisted view of one Action row plus the
//          ActionAttempt count and the last ActionResult.result_summary.
//          Self-scope by default (caller must be source_entity_id);
//          can_admin_org callers in the same org can also read the row.
// CONNECTS TO:
//   - apps/api/src/services/action/views.ts (SafeActionView base
//     mapper; this service extends with attempt_count +
//     last_result_summary)
//   - apps/api/src/services/governance/org.ts (getOrgEntityId for
//     the can_admin_org cross-check)
//   - apps/api/src/routes/actions.routes.ts (the GET route consumer)
//   - packages/database (prisma + Prisma types)
//   - ADR-0057 §9 (route table: bearer + read; safe view + attempt
//     count + last result_summary; forbidden fields per §10)
//
// FOUNDER LOCKS (per the autonomous-operator continuation):
//   - Self-scope by default: caller MUST be source_entity_id.
//   - can_admin_org callers in the same org as Action.org_entity_id
//     can also read the row. This mirrors the ADR-0057 §9 hint that
//     the list route has `?org_scope=true requires can_admin_org`;
//     the detail route follows the same authorization spine.
//   - 404 ACTION_NOT_FOUND for unknown action_id (does not
//     distinguish "exists but you can't see it" from "doesn't
//     exist" per RULE 0 enumeration-prevention; the alternative
//     would leak the existence of cross-org actions to non-admins).
//   - FORBIDDEN fields per ADR-0057 §10 are NEVER returned: no
//     payload_summary / payload_redacted / policy_envelope /
//     policy_envelope_hash / source_entity_id / org_entity_id /
//     target_entity_id / deleted_at / raw errors / stack traces.

import { prisma } from "@niov/database";
import type { Action } from "@prisma/client";
import { projectActionView, type SafeActionView } from "./views.js";
import { getOrgEntityId } from "../governance/org.js";

// WHAT: RFC 4122 UUID regex (mirrors create + cancel validators).
// INPUT: None.
// OUTPUT: A regular expression.
// WHY: Reject malformed action_id at the service boundary so the
//      route handler never has to.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// WHAT: The safe Action detail view returned by getActionForCaller.
//        Extends SafeActionView with the read-side aggregates per
//        ADR-0057 §9 route-table specification.
// INPUT: Used as a return type.
// OUTPUT: None.
// WHY: Locks the response contract at the type level so any future
//      handler change that tries to add a forbidden field fails at
//      compile time. The aggregates are computed via Prisma's
//      aggregate / findFirst against the join-rows; the raw rows
//      themselves never leave the service.
export interface SafeActionDetailView extends SafeActionView {
  attempt_count: number;
  last_result_summary: string | null;
}

// WHAT: Discriminated-union result returned by getActionForCaller.
// INPUT: Used as a return type.
// OUTPUT: None.
// WHY: Same shape family as createActionForCaller /
//      cancelActionForCaller so the route handler maps to HTTP
//      status + safe JSON body uniformly.
export type GetActionResult =
  | { ok: true; httpStatus: 200; view: SafeActionDetailView }
  | {
      ok: false;
      httpStatus: 400 | 401 | 403 | 404;
      code: string;
      message?: string;
    };

// WHAT: Test whether the caller has `can_admin_org` over the same
//        org as the Action row.
// INPUT: callerEntityId + the Action's org_entity_id.
// OUTPUT: True if both (a) the caller's TAR has can_admin_org=true
//         AND (b) the caller resolves to the same org as the row.
// WHY: Pulled out so the main service stays linear. The TAR is
//      authoritative; we do not consult the bearer token claims
//      because TAR is the live truth and a stale token could
//      otherwise leak access after a TAR demote.
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

// WHAT: Build the safe detail view from a fetched Action row, with
//        aggregates pre-computed by the caller.
// INPUT: Action row + attempt_count + last_result_summary (null when
//        no SUCCEEDED attempt + result row exists yet).
// OUTPUT: A SafeActionDetailView.
// WHY: Centralized so the projection is in one place and the
//      forbidden-fields contract stays type-locked.
function projectActionDetailView(
  action: Action,
  attempt_count: number,
  last_result_summary: string | null,
): SafeActionDetailView {
  return {
    ...projectActionView(action),
    attempt_count,
    last_result_summary,
  };
}

// WHAT: Fetch the safe detail view of one Action.
// INPUT: callerEntityId (from request.auth!.entity_id) + action_id.
// OUTPUT: A GetActionResult — discriminated so the route maps to
//         200 / 400 / 403 / 404.
// WHY: Centralizes the read-side per ADR-0057 §9 route table:
//      bearer + read scope (gating at the route), self-scope OR
//      can_admin_org-over-same-org authorization (gating at the
//      service tier), safe Action view + ActionAttempt count + last
//      ActionResult.result_summary projection (this service builds
//      the response shape).
export async function getActionForCaller(
  callerEntityId: string,
  actionId: string,
): Promise<GetActionResult> {
  if (typeof actionId !== "string" || !UUID_RE.test(actionId)) {
    return { ok: false, httpStatus: 400, code: "INVALID_ACTION_ID" };
  }

  const action = await prisma.action.findUnique({
    where: { action_id: actionId },
  });
  if (action === null) {
    return { ok: false, httpStatus: 404, code: "ACTION_NOT_FOUND" };
  }
  // RULE 10 soft-delete: a deleted_at row is invisible to readers.
  if (action.deleted_at !== null) {
    return { ok: false, httpStatus: 404, code: "ACTION_NOT_FOUND" };
  }

  const isSource = action.source_entity_id === callerEntityId;
  if (!isSource) {
    const isOrgAdmin = await callerHasAdminScopeOverOrg(
      callerEntityId,
      action.org_entity_id,
    );
    if (!isOrgAdmin) {
      // RULE 0: do not distinguish "exists but you can't see it"
      // from "doesn't exist" — return the same 404 the unknown-id
      // branch returns so a non-admin enumerator gets no signal.
      return { ok: false, httpStatus: 404, code: "ACTION_NOT_FOUND" };
    }
  }

  // Aggregates: ActionAttempt count (excluding soft-deleted) +
  // last ActionResult.result_summary by attempt ordering.
  const attemptCount = await prisma.actionAttempt.count({
    where: { action_id: action.action_id, deleted_at: null },
  });
  let lastResultSummary: string | null = null;
  if (attemptCount > 0) {
    const latestSuccessful = await prisma.actionAttempt.findFirst({
      where: {
        action_id: action.action_id,
        outcome: "SUCCEEDED",
        deleted_at: null,
      },
      orderBy: { attempt_number: "desc" },
      select: { attempt_id: true },
    });
    if (latestSuccessful !== null) {
      const result = await prisma.actionResult.findFirst({
        where: { attempt_id: latestSuccessful.attempt_id },
        orderBy: { created_at: "desc" },
        select: { result_summary: true },
      });
      if (result !== null) {
        lastResultSummary = result.result_summary;
      }
    }
  }

  return {
    ok: true,
    httpStatus: 200,
    view: projectActionDetailView(action, attemptCount, lastResultSummary),
  };
}
