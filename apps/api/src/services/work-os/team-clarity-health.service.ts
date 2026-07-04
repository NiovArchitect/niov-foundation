// FILE: team-clarity-health.service.ts
// PURPOSE: [CE-4B] Manager EXCEPTION visibility — read-only, patterns not
//          feeds. One safe summary over the org's clarification lifecycle
//          and ownership state: unresolved/overdue clarification counts,
//          ownership-unclear count, repeated-ambiguity topics (project
//          names / source phrases + counts), and one top exception in human
//          copy. NEVER includes: answer text, source excerpts, message
//          content, employee/twin private activity, or raw ids — counts and
//          org-internal labels only. Manager-gated exactly like getTeamWork
//          (honest TEAM_SCOPE_NOT_CONFIGURED otherwise). Admin/security
//          audit depth stays on the audit surfaces — this is not a
//          dashboard, it is one calm box.
// CONNECTS TO: work-os-ledger.routes.ts (GET /work-os/team-clarity-health),
//          clarification-request.service.ts (the lifecycle it summarizes),
//          tests/integration/team-clarity-health.test.ts.

import { prisma } from "@niov/database";
import { loadOrgMembers } from "../otzar/identity-reconciliation.service.js";
import { sourceLineageFromDetails } from "./work-ledger.service.js";

export interface TeamClarityHealth {
  unresolved_clarifications_count: number;
  overdue_clarifications_count: number;
  ownership_unclear_count: number;
  repeated_ambiguity_topics: Array<{ label: string; count: number }>;
  top_exception?: { label: string; reason: string };
}

export type TeamClarityHealthResult =
  | { ok: true; health: TeamClarityHealth }
  | { ok: false; code: "TEAM_SCOPE_NOT_CONFIGURED"; message: string };

// Open work = anything not terminal (mirrors the Team Work exclusions).
const TERMINAL = ["CANCELLED", "EXPIRED", "VERIFIED", "EXECUTED"];

function sourceTopicLabel(system: string): string {
  switch (system) {
    case "SLACK":
      return "Slack-sourced work";
    case "ZOOM":
      return "Zoom-sourced work";
    case "TRANSCRIPT":
    case "COMMS":
      return "Comms-transcript work";
    case "MEETING":
      return "Meeting-sourced work";
    default:
      return "Connector-sourced work";
  }
}

export async function getTeamClarityHealth(args: {
  org_entity_id: string;
  is_manager: boolean;
}): Promise<TeamClarityHealthResult> {
  if (!args.is_manager) {
    return {
      ok: false,
      code: "TEAM_SCOPE_NOT_CONFIGURED",
      message: "Team scope requires manager/admin authority for this org.",
    };
  }

  // Org partition: clarifications are asked BY this org's members, and the
  // topics only count linked rows that live in THIS org.
  const members = await loadOrgMembers(args.org_entity_id);
  const memberIds = members.map((m) => m.entity_id);

  const clarifications = memberIds.length
    ? await prisma.escalationRequest.findMany({
        where: {
          escalation_type: "HUMAN_REVIEW_REQUIRED",
          source_entity_id: { in: memberIds },
          resolution_metadata: { path: ["kind"], equals: "clarification" },
        },
        orderBy: { created_at: "desc" },
        take: 200,
        select: {
          status: true,
          expires_at: true,
          resolution_metadata: true,
        },
      })
    : [];

  const now = new Date();
  const pending = clarifications.filter((c) => c.status === "PENDING");
  const overdue = pending.filter(
    (c) => c.expires_at !== null && c.expires_at < now,
  );

  const ownershipUnclear = await prisma.workLedgerEntry.count({
    where: {
      org_entity_id: args.org_entity_id,
      owner_entity_id: null,
      ledger_type: { notIn: ["ORG_SEEDING", "GOAL"] },
      NOT: { status: { in: TERMINAL } },
    },
  });

  // Repeated-ambiguity topics: group ALL clarifications by their linked
  // row's project name (else source phrase); only repeats (count ≥ 2) are a
  // pattern worth a manager's attention. Labels are org-internal project
  // names / source phrases — never content.
  const linkedIds = clarifications
    .map((c) => {
      const m =
        typeof c.resolution_metadata === "object" &&
        c.resolution_metadata !== null &&
        !Array.isArray(c.resolution_metadata)
          ? (c.resolution_metadata as Record<string, unknown>)
          : {};
      return typeof m.ledger_entry_id === "string" ? m.ledger_entry_id : null;
    })
    .filter((v): v is string => v !== null);
  const topicCounts = new Map<string, number>();
  if (linkedIds.length > 0) {
    const rows = await prisma.workLedgerEntry.findMany({
      where: { ledger_entry_id: { in: linkedIds }, org_entity_id: args.org_entity_id },
      select: { project_id: true, details: true },
    });
    const projectIds = [...new Set(rows.map((r) => r.project_id).filter((v): v is string => v !== null))];
    const projects = projectIds.length
      ? await prisma.workProject.findMany({
          where: { project_id: { in: projectIds } },
          select: { project_id: true, name: true },
        })
      : [];
    const projectName = new Map(projects.map((p) => [p.project_id, p.name]));
    for (const row of rows) {
      let label: string | null = null;
      if (row.project_id !== null) label = projectName.get(row.project_id) ?? null;
      if (label === null) {
        const lineage = sourceLineageFromDetails(row.details, null);
        if (lineage !== undefined) label = sourceTopicLabel(lineage.source_system);
      }
      if (label === null) continue;
      topicCounts.set(label, (topicCounts.get(label) ?? 0) + 1);
    }
  }
  const repeated = [...topicCounts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([label, count]) => ({ label, count }));

  // One top exception, in human copy — never a wall of alerts.
  let top: TeamClarityHealth["top_exception"];
  if (overdue.length > 0) {
    top = {
      label: `${overdue.length} clarification request${overdue.length === 1 ? " is" : "s are"} overdue`,
      reason: "Waiting past their expiry — a nudge or a different clarifier may help.",
    };
  } else if (pending.length > 0) {
    top = {
      label: `${pending.length} clarification request${pending.length === 1 ? " is" : "s are"} waiting`,
      reason: "Teammates are waiting on answers to keep work moving.",
    };
  } else if (ownershipUnclear > 0) {
    top = {
      label: `${ownershipUnclear} item${ownershipUnclear === 1 ? " needs" : "s need"} ownership clarity`,
      reason: "Work without an owner tends to stall — assigning owners keeps it moving.",
    };
  }

  return {
    ok: true,
    health: {
      unresolved_clarifications_count: pending.length,
      overdue_clarifications_count: overdue.length,
      ownership_unclear_count: ownershipUnclear,
      repeated_ambiguity_topics: repeated,
      ...(top !== undefined ? { top_exception: top } : {}),
    },
  };
}
