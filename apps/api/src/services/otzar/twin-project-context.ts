// FILE: twin-project-context.ts
// PURPOSE: Phase 1 PR 3 — MyTwinView project_context_summary
//          sidecar per the [FOUNDER-AUTH — CONTINUE AFTER
//          EDX-3/4/5/6 / AUTONOMOUS ENTERPRISE COLLABORATION
//          COMPLETION] directive. Self-scoped pure-function helper
//          that projects the caller's WorkProject inventory
//          (PR #280 substrate; PR #281 routes) as a capacity-only
//          summary. Closes the EDX-1 project_context_summary
//          forward-substrate item that was blocked on project
//          substrate.
//
// PRIVACY INVARIANT:
//   - Capacity-only signals (counts + 1 ISO timestamp).
//   - NEVER returns project_id / name / per-row substance / other
//     members' identities.
//   - Self-scoped via WorkProjectMember.entity_id; never
//     aggregates across entities.
//
// CONNECTS TO:
//   - packages/database (prisma.workProjectMember +
//     prisma.workProject)
//   - apps/api/src/services/otzar/otzar.service.ts (consumed by
//     getMyTwin as an optional sidecar field)

import { prisma } from "@niov/database";

// WHAT: SAFE projection of the caller's project context.
// INPUT: Used as a return type only.
// OUTPUT: None.
// WHY: Mirrors the directive's spec:
//        - active_project_count (caller is member of an ACTIVE project)
//        - owned_project_count (caller's OWNER role across ACTIVE projects)
//        - reviewer_project_count (caller's REVIEWER role on ACTIVE projects)
//        - project_member_count (sum of memberships across ACTIVE projects)
//        - recent_project_activity_at (most recent ACTIVE project
//          updated_at the caller is a member of)
export interface TwinProjectContextSummary {
  active_project_count: number;
  owned_project_count: number;
  reviewer_project_count: number;
  member_project_count: number;
  recent_project_activity_at: string | null;
}

// WHAT: Compute the caller's project context summary.
// INPUT: callerEntityId — the resolved entity.
// OUTPUT: TwinProjectContextSummary.
// WHY: One findMany over WorkProjectMember (caller-scoped) + one
//      findMany over the ACTIVE projects in that set; derive role
//      counts + most-recent activity in JS. Inbox volume is small
//      typical so a single fetch keeps latency low.
export async function computeProjectContextSummaryForCaller(
  callerEntityId: string,
): Promise<TwinProjectContextSummary> {
  const memberships = await prisma.workProjectMember.findMany({
    where: { entity_id: callerEntityId },
    select: { project_id: true, role: true },
  });
  if (memberships.length === 0) {
    return {
      active_project_count: 0,
      owned_project_count: 0,
      reviewer_project_count: 0,
      member_project_count: 0,
      recent_project_activity_at: null,
    };
  }
  const projectIds = memberships.map((m) => m.project_id);
  const activeProjects = await prisma.workProject.findMany({
    where: { project_id: { in: projectIds }, state: "ACTIVE" },
    select: { project_id: true, updated_at: true },
  });
  const activeIds = new Set(activeProjects.map((p) => p.project_id));

  let owned_project_count = 0;
  let reviewer_project_count = 0;
  let member_project_count = 0;
  for (const m of memberships) {
    if (!activeIds.has(m.project_id)) continue;
    if (m.role === "OWNER") owned_project_count++;
    else if (m.role === "REVIEWER") reviewer_project_count++;
    else if (m.role === "MEMBER") member_project_count++;
  }

  let mostRecent: Date | null = null;
  for (const p of activeProjects) {
    if (mostRecent === null || p.updated_at > mostRecent) {
      mostRecent = p.updated_at;
    }
  }

  return {
    active_project_count: activeProjects.length,
    owned_project_count,
    reviewer_project_count,
    member_project_count,
    recent_project_activity_at:
      mostRecent !== null ? mostRecent.toISOString() : null,
  };
}
