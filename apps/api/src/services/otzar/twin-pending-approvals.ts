// FILE: twin-pending-approvals.ts
// PURPOSE: Phase EDX-1 employee Twin self-state extension per the
//          [FOUNDER-AUTH — EVERYDAY EMPLOYEE DOMAIN GENERAL
//          INTELLIGENCE EXPERIENCE] directive. Self-scoped pure-
//          function helper that projects the caller's pending
//          approval inbox count + most-recent timestamp from the
//          existing EscalationRequest substrate.
//
//          Surfaces on MyTwinView as an additive optional
//          `pending_approvals_summary` sidecar so the everyday
//          employee can see "how many actions are waiting on me
//          to approve right now" without a separate route.
//
//          The reading employee is the *approver* (the
//          target_entity_id on the EscalationRequest). Source-side
//          escalations (the employee proposed something, waiting
//          on someone else) are NOT counted here — that would be
//          a separate sidecar.
//
// PRIVACY INVARIANT:
//   - Returns counts and a single ISO timestamp only.
//   - NEVER returns escalation_id / description / severity /
//     source_entity_id / target_entity_id / capsule_id /
//     resolution_metadata / raw EscalationType values that could
//     leak the proposer's identity or the action's substance.
//   - NEVER returns counts > 0 for any entity OTHER than the
//     caller — `targetEntityId` is the only entity_id this
//     helper reads against.
//
// CONNECTS TO:
//   - packages/database (prisma.escalationRequest.findMany,
//     prisma.escalationRequest.count)
//   - apps/api/src/services/otzar/otzar.service.ts
//     (consumed by getMyTwin as an optional sidecar field)

import { prisma } from "@niov/database";

// WHAT: SAFE projection of the caller's pending approval inbox.
// INPUT: Used as a return type only.
// OUTPUT: None.
// WHY: Surfaces capacity-only signals — count + freshness — so the
//      employee Twin UX can render "you have N approvals waiting"
//      without exposing any internal action substance / proposer
//      identity / capsule references.
export interface TwinPendingApprovalsSummary {
  pending_count: number;
  most_recent_at: string | null;
}

// WHAT: Compute the caller's pending approval inbox summary.
// INPUT: targetEntityId — the caller's resolved entity_id (the
//        approver-side perspective).
// OUTPUT: TwinPendingApprovalsSummary.
// WHY: One Prisma roundtrip (count) + one bounded findFirst
//      (order by created_at desc, take 1). Failures inside the
//      helper bubble up to the caller (`getMyTwin`) where the
//      same ADR-0068 §6 swallow pattern used for proactive_cards
//      keeps the sidecar absence non-fatal to the My Twin read.
export async function computePendingApprovalsSummaryForCaller(
  targetEntityId: string,
): Promise<TwinPendingApprovalsSummary> {
  const [pending_count, latest] = await Promise.all([
    prisma.escalationRequest.count({
      where: {
        target_entity_id: targetEntityId,
        status: "PENDING",
      },
    }),
    prisma.escalationRequest.findFirst({
      where: {
        target_entity_id: targetEntityId,
        status: "PENDING",
      },
      select: { created_at: true },
      orderBy: { created_at: "desc" },
    }),
  ]);
  return {
    pending_count,
    most_recent_at: latest?.created_at.toISOString() ?? null,
  };
}
