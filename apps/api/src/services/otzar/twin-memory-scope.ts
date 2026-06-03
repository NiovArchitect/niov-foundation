// FILE: twin-memory-scope.ts
// PURPOSE: Phase EDX-1 employee Twin self-state extension per the
//          [FOUNDER-AUTH — EVERYDAY EMPLOYEE DOMAIN GENERAL
//          INTELLIGENCE EXPERIENCE] directive. Self-scoped pure-
//          function helper that projects the caller's currently-
//          active ConversationMemoryScope row count + the soonest
//          expiry timestamp from the DM2-A DMW substrate.
//
//          Surfaces on MyTwinView as an additive optional
//          `memory_scope_summary` sidecar so the everyday
//          employee can see "how many conversations have memory
//          scoped to me, and when does the soonest expire" — the
//          "what my Twin can use" visibility the directive
//          requires — without exposing any per-conversation
//          memory contents.
//
//          A scope is "active" when:
//          - the row exists for the caller as the scoped entity
//          - `expires_at` is either null (no expiry) OR in the
//            future
//
// PRIVACY INVARIANT:
//   - Returns capacity-only signals: a single count + a single
//     ISO timestamp (the soonest expiry across active rows).
//   - NEVER returns conversation_id / access_scope /
//     capsule_types / context_signals_only / declared_by / any
//     per-scope substance.
//   - NEVER returns counts > 0 for any entity OTHER than the
//     caller — `entityId` is the only entity_id this helper
//     queries against.
//
// CONNECTS TO:
//   - packages/database (prisma.conversationMemoryScope.count,
//     prisma.conversationMemoryScope.findFirst)
//   - apps/api/src/services/otzar/otzar.service.ts
//     (consumed by getMyTwin as an optional sidecar field)

import { prisma } from "@niov/database";

// WHAT: SAFE projection of the caller's currently-active
//        ConversationMemoryScope inventory.
// INPUT: Used as a return type only.
// OUTPUT: None.
// WHY: Surfaces capacity-only signals — count + soonest expiry
//      — so the employee Twin UX can render "your Twin can use
//      N conversations' memory; the soonest expires …" without
//      exposing per-conversation substance.
export interface TwinMemoryScopeSummary {
  active_scopes_count: number;
  soonest_expiry_at: string | null;
}

// WHAT: Compute the caller's active memory scope summary.
// INPUT: entityId — the caller's resolved entity_id (the scoped-
//        entity perspective).
// OUTPUT: TwinMemoryScopeSummary.
// WHY: One Prisma count (active scopes) + one bounded findFirst
//      (rows with non-null expires_at, ordered ascending, take 1)
//      so the UI can surface the soonest visible expiry. Rows
//      with null `expires_at` (no-expiry scopes) are counted in
//      `active_scopes_count` but cannot contribute to
//      `soonest_expiry_at`.
//      Failures inside the helper bubble up to the caller
//      (`getMyTwin`) where the same ADR-0068 §6 swallow pattern
//      keeps the sidecar absence non-fatal to the My Twin read.
export async function computeMemoryScopeSummaryForCaller(
  entityId: string,
): Promise<TwinMemoryScopeSummary> {
  const now = new Date();
  const activeWhere = {
    entity_id: entityId,
    OR: [{ expires_at: null }, { expires_at: { gt: now } }],
  };
  const [active_scopes_count, soonest] = await Promise.all([
    prisma.conversationMemoryScope.count({ where: activeWhere }),
    prisma.conversationMemoryScope.findFirst({
      where: {
        entity_id: entityId,
        expires_at: { gt: now },
      },
      select: { expires_at: true },
      orderBy: { expires_at: "asc" },
    }),
  ]);
  return {
    active_scopes_count,
    soonest_expiry_at: soonest?.expires_at?.toISOString() ?? null,
  };
}
