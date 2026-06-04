// FILE: twin-collaboration-inbox.ts
// PURPOSE: Phase EDX-6 PR 3 — MyTwinView collaboration_inbox_summary
//          sidecar per the [FOUNDER-CLARITY — DO NOT TREAT THE
//          REMAINING GAPS AS OPTIONAL] directive. Closes the EDX-1
//          forward-substrate item for collaboration_inbox_summary
//          that was blocked on collaboration substrate until
//          PR #276 + #277. Self-scoped pure-function helper that
//          projects the caller's collaboration inbox (where the
//          caller is the target) as a capacity-only summary.
//
// PRIVACY INVARIANT:
//   - Capacity-only signals (4 counts + 1 ISO timestamp).
//   - NEVER returns collaboration_id / safe_summary / requester
//     identity / per-row substance.
//   - Self-scoped via target_entity_id OR target_twin_entity_id
//     match against the caller; never aggregates across entities.
//
// CONNECTS TO:
//   - packages/database (prisma.twinCollaborationRequest)
//   - apps/api/src/services/otzar/otzar.service.ts (consumed by
//     getMyTwin as an optional sidecar field)

import { prisma } from "@niov/database";

// WHAT: Window for the "completed recent" count. Completed rows
//        within this window are surfaced; older terminal rows are
//        not counted (the inbox is a current-state summary).
const COMPLETED_RECENT_WINDOW_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// WHAT: SAFE projection of the caller's collaboration inbox.
//        Used as a MyTwinView sidecar.
// INPUT: Used as a return type only.
// OUTPUT: None.
// WHY: Mirrors the directive's spec for collaboration_inbox_summary:
//        - pending_request_count (REQUESTED + IN_PROGRESS)
//        - needs_my_approval_count (NEEDS_APPROVAL)
//        - blocked_request_count (BLOCKED)
//        - completed_recent_count (COMPLETED within 30 days)
//        - most_recent_request_at (any state)
export interface TwinCollaborationInboxSummary {
  pending_request_count: number;
  needs_my_approval_count: number;
  blocked_request_count: number;
  completed_recent_count: number;
  most_recent_request_at: string | null;
}

// WHAT: Compute the caller's collaboration inbox summary.
// INPUT: callerEntityId — the resolved entity (may be the caller's
//        own entity_id OR the caller's primary twin's entity_id;
//        both sides of the OR query are checked so a request
//        addressed to either the human owner or their primary Twin
//        is counted as inbound).
// OUTPUT: TwinCollaborationInboxSummary.
// WHY: One bounded findMany scanning ACTIVE / TERMINAL rows where
//      the caller is the target side (target_entity_id OR
//      target_twin_entity_id). Counts are derived in JS rather than
//      issuing five separate counts; the row volume on an inbox is
//      small (<100 typical) and a single query keeps the latency
//      footprint low.
export async function computeCollaborationInboxSummaryForCaller(
  callerEntityId: string,
): Promise<TwinCollaborationInboxSummary> {
  const now = new Date();
  const completedRecentCutoff = new Date(
    now.getTime() - COMPLETED_RECENT_WINDOW_DAYS * MS_PER_DAY,
  );

  const rows = await prisma.twinCollaborationRequest.findMany({
    where: {
      OR: [
        { target_entity_id: callerEntityId },
        { target_twin_entity_id: callerEntityId },
      ],
    },
    select: {
      state: true,
      completed_at: true,
      created_at: true,
    },
  });

  let pending_request_count = 0;
  let needs_my_approval_count = 0;
  let blocked_request_count = 0;
  let completed_recent_count = 0;
  let mostRecent: Date | null = null;

  for (const row of rows) {
    if (row.state === "REQUESTED" || row.state === "IN_PROGRESS") {
      pending_request_count++;
    }
    if (row.state === "NEEDS_APPROVAL") {
      needs_my_approval_count++;
    }
    if (row.state === "BLOCKED") {
      blocked_request_count++;
    }
    if (
      row.state === "COMPLETED" &&
      row.completed_at !== null &&
      row.completed_at > completedRecentCutoff
    ) {
      completed_recent_count++;
    }
    if (mostRecent === null || row.created_at > mostRecent) {
      mostRecent = row.created_at;
    }
  }

  return {
    pending_request_count,
    needs_my_approval_count,
    blocked_request_count,
    completed_recent_count,
    most_recent_request_at:
      mostRecent !== null ? mostRecent.toISOString() : null,
  };
}
