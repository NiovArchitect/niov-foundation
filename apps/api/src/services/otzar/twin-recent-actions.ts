// FILE: twin-recent-actions.ts
// PURPOSE: Phase EDX-1 employee Twin self-state extension per the
//          [FOUNDER-AUTH — EVERYDAY EMPLOYEE DOMAIN GENERAL
//          INTELLIGENCE EXPERIENCE] directive. Self-scoped pure-
//          function helper that projects the caller's recent
//          Action substance volume — count + most-recent
//          timestamp within a bounded 7-day window — from the
//          Section 2 Action substrate.
//
//          Surfaces on MyTwinView as an additive optional
//          `recent_action_summary` sidecar so the everyday
//          employee can see "how much work has my Twin proposed/
//          executed for me lately" without a separate route.
//
//          The reading employee is the *source* of the action
//          (source_entity_id). Actions where the employee is the
//          target_entity_id (the action acts on someone/something
//          else) are NOT counted here — only the caller's own
//          authored work.
//
// PRIVACY INVARIANT:
//   - Returns the bounded window + a single count + a single ISO
//     timestamp only.
//   - NEVER returns action_id / action_type / status /
//     payload_redacted / payload_encrypted / target_entity_id /
//     handler error_class / handler error_summary / connector
//     details / any per-action substance.
//   - NEVER returns counts > 0 for any entity OTHER than the
//     caller — `sourceEntityId` is the only entity_id this
//     helper queries against.
//
// CONNECTS TO:
//   - packages/database (prisma.action.count,
//     prisma.action.findFirst)
//   - apps/api/src/services/otzar/otzar.service.ts
//     (consumed by getMyTwin as an optional sidecar field)

import { prisma } from "@niov/database";

// WHAT: Default 7-day lookback window in hours per the bounded
//        EDX-1 "recent" semantic.
const DEFAULT_WINDOW_HOURS = 168;

// WHAT: SAFE projection of the caller's recent action substance.
// INPUT: Used as a return type only.
// OUTPUT: None.
// WHY: Surfaces capacity-only signals — window + count + freshness
//      — so the employee Twin UX can render "9 actions in the last
//      7 days" without exposing any per-action substance, target,
//      status, or handler details.
export interface TwinRecentActionSummary {
  window_hours: number;
  total_count: number;
  most_recent_at: string | null;
}

// WHAT: Compute the caller's recent action summary.
// INPUT: sourceEntityId — the caller's resolved entity_id (the
//        author-side perspective).
// OUTPUT: TwinRecentActionSummary with default window_hours = 168
//         (7 days).
// WHY: One Prisma count + one bounded findFirst (order by
//      created_at desc, take 1). Failures inside the helper
//      bubble up to the caller (`getMyTwin`) where the same
//      ADR-0068 §6 swallow pattern used for proactive_cards
//      keeps the sidecar absence non-fatal to the My Twin read.
export async function computeRecentActionSummaryForCaller(
  sourceEntityId: string,
  windowHours: number = DEFAULT_WINDOW_HOURS,
): Promise<TwinRecentActionSummary> {
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);
  const [total_count, latest] = await Promise.all([
    prisma.action.count({
      where: {
        source_entity_id: sourceEntityId,
        created_at: { gte: since },
      },
    }),
    prisma.action.findFirst({
      where: {
        source_entity_id: sourceEntityId,
        created_at: { gte: since },
      },
      select: { created_at: true },
      orderBy: { created_at: "desc" },
    }),
  ]);
  return {
    window_hours: windowHours,
    total_count,
    most_recent_at: latest?.created_at.toISOString() ?? null,
  };
}
