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
import { RELATIONSHIP_LABELS } from "../otzar/external-collaborator-identity.service.js";
import { sourceLineageFromDetails } from "./work-ledger.service.js";

// [T-4] External relationship EXCEPTIONS — client/vendor/prospect work at
// risk, as counts + governed account labels only. Not a CRM dashboard:
// no commitment text, no source excerpts, no emails/domains, no raw ids,
// no backend enums, no per-event feed. Omitted entirely when all-zero.
export interface ExternalRelationshipsSummary {
  waiting_on_external_count: number;
  internal_commitments_to_external_count: number;
  overdue_external_count: number;
  external_review_pending_count: number;
  external_ownership_unclear_count: number;
  repeated_external_ambiguity_count: number;
  top_external_exception?: { label: string; reason: string };
  external_topics: Array<{ label: string; count: number }>;
}

export interface TeamClarityHealth {
  unresolved_clarifications_count: number;
  overdue_clarifications_count: number;
  ownership_unclear_count: number;
  repeated_ambiguity_topics: Array<{ label: string; count: number }>;
  top_exception?: { label: string; reason: string };
  external_relationships?: ExternalRelationshipsSummary;
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

// [T-4] Compute the external exception summary from GOVERNED records only
// (ExternalCommitment / ExternalCollaborator / ExternalOrganization / open
// review seeds). Every query is org-keyed; only active, non-deleted records
// count. Returns undefined when nothing needs attention — silence is the
// honest default.
async function computeExternalExceptions(
  orgEntityId: string,
): Promise<ExternalRelationshipsSummary | undefined> {
  const now = new Date();
  const openCommitments = await prisma.externalCommitment.findMany({
    where: {
      org_entity_id: orgEntityId,
      deleted_at: null,
      status: { not: "COMPLETED" },
      external_collaborator: { deleted_at: null },
    },
    take: 500,
    select: {
      direction: true,
      due_date: true,
      internal_owner_entity_id: true,
      external_collaborator: {
        select: {
          company_name: true,
          relationship_type: true,
          external_organization: { select: { display_name: true } },
        },
      },
    },
  });

  const waitingOnExternal = openCommitments.filter(
    (c) => c.direction === "EXTERNAL_OWES_INTERNAL",
  );
  const weOweExternal = openCommitments.filter(
    (c) => c.direction === "INTERNAL_OWES_EXTERNAL",
  );
  const overdue = openCommitments.filter(
    (c) => c.due_date !== null && c.due_date < now,
  );
  const ownershipUnclear = openCommitments.filter(
    (c) => c.internal_owner_entity_id === null,
  );

  // Open external review seeds — Otzar noticed a party the org has not
  // reviewed yet (identity/governance gap, distinct from unowned work).
  const openReviewSeeds = await prisma.workLedgerEntry.findMany({
    where: {
      org_entity_id: orgEntityId,
      ledger_type: "ORG_SEEDING",
      status: { in: ["SEED_PROPOSED", "SEED_NEEDS_REVIEW"] },
      details: { path: ["seed_type"], equals: "review_external_party" },
    },
    take: 500,
    select: { details: true },
  });
  const seedSubjects = new Map<string, number>();
  for (const s of openReviewSeeds) {
    const d =
      typeof s.details === "object" && s.details !== null && !Array.isArray(s.details)
        ? (s.details as Record<string, unknown>)
        : {};
    const subject =
      typeof d.subject_name === "string" ? d.subject_name.trim().toLowerCase() : "";
    if (subject.length === 0) continue;
    seedSubjects.set(subject, (seedSubjects.get(subject) ?? 0) + 1);
  }
  const repeatedAmbiguity = [...seedSubjects.values()].filter((n) => n >= 2).length;

  const summary: ExternalRelationshipsSummary = {
    waiting_on_external_count: waitingOnExternal.length,
    internal_commitments_to_external_count: weOweExternal.length,
    overdue_external_count: overdue.length,
    external_review_pending_count: openReviewSeeds.length,
    external_ownership_unclear_count: ownershipUnclear.length,
    repeated_external_ambiguity_count: repeatedAmbiguity,
    external_topics: [],
  };
  const anySignal =
    summary.waiting_on_external_count > 0 ||
    summary.internal_commitments_to_external_count > 0 ||
    summary.overdue_external_count > 0 ||
    summary.external_review_pending_count > 0 ||
    summary.external_ownership_unclear_count > 0 ||
    summary.repeated_external_ambiguity_count > 0;
  if (!anySignal) return undefined;

  // Topic label: governed organization label first, governed company_name
  // fallback, else the closed-vocab relationship word. Account-level
  // patterns — never a person, never an email/domain.
  const accountLabel = (c: (typeof openCommitments)[number]): string => {
    const col = c.external_collaborator;
    return (
      col.external_organization?.display_name ??
      col.company_name ??
      RELATIONSHIP_LABELS[col.relationship_type] ??
      "External"
    );
  };
  const topicCounts = new Map<string, number>();
  for (const c of openCommitments) {
    const label = accountLabel(c);
    topicCounts.set(label, (topicCounts.get(label) ?? 0) + 1);
  }
  summary.external_topics = [...topicCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([label, count]) => ({ label, count }));

  // One top exception, founder-approved priority: overdue > unowned >
  // waiting-on-external > we-owe-external > review-pending > repeated
  // ambiguity. Human copy only.
  const relationshipWord = (rows: typeof openCommitments): string => {
    const words = new Set(
      rows.map((c) => (RELATIONSHIP_LABELS[c.external_collaborator.relationship_type] ?? "External").toLowerCase()),
    );
    return words.size === 1 ? [...words][0]! : "external";
  };
  const n = (count: number, singular: string, plural: string): string =>
    `${count} ${count === 1 ? singular : plural}`;
  let top: ExternalRelationshipsSummary["top_external_exception"];
  if (overdue.length > 0) {
    top = {
      label: `${n(overdue.length, `${relationshipWord(overdue)} commitment is`, `${relationshipWord(overdue)} commitments are`)} overdue`,
      reason: "The other party may already be waiting — a nudge to the internal owner can prevent a dropped promise.",
    };
  } else if (ownershipUnclear.length > 0) {
    top = {
      label: `${n(ownershipUnclear.length, "external commitment needs", "external commitments need")} an internal owner`,
      reason: "Governed external work without an internal owner tends to stall.",
    };
  } else if (waitingOnExternal.length > 0) {
    const topTopic = [...new Set(waitingOnExternal.map(accountLabel))];
    top = {
      label: `${n(waitingOnExternal.length, "item is", "items are")} waiting on ${topTopic.length === 1 ? topTopic[0]! : "external parties"}`,
      reason: "Otzar is tracking what they owe — a follow-up may keep it moving.",
    };
  } else if (weOweExternal.length > 0) {
    top = {
      label: `${n(weOweExternal.length, `commitment to ${relationshipWord(weOweExternal)}s needs`, `commitments to ${relationshipWord(weOweExternal)}s need`)} attention`,
      reason: "Promises made outward — worth confirming delivery is on track.",
    };
  } else if (openReviewSeeds.length > 0) {
    top = {
      label: `${n(openReviewSeeds.length, "external party needs", "external parties need")} review`,
      reason: "Otzar noticed them in real work — review in Organization Seeding to track or dismiss.",
    };
  } else if (repeatedAmbiguity > 0) {
    top = {
      label: `${n(repeatedAmbiguity, "external party has", "external parties have")} repeated follow-up activity`,
      reason: "The same name keeps surfacing unresolved — a review would settle it.",
    };
  }
  if (top !== undefined) summary.top_external_exception = top;
  return summary;
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

  // [T-4] external relationship exceptions — best-effort seasoning on the
  // same summary; a failure here never breaks clarity health.
  let external: ExternalRelationshipsSummary | undefined;
  try {
    external = await computeExternalExceptions(args.org_entity_id);
  } catch {
    external = undefined;
  }

  return {
    ok: true,
    health: {
      unresolved_clarifications_count: pending.length,
      overdue_clarifications_count: overdue.length,
      ownership_unclear_count: ownershipUnclear,
      repeated_ambiguity_topics: repeated,
      ...(top !== undefined ? { top_exception: top } : {}),
      ...(external !== undefined ? { external_relationships: external } : {}),
    },
  };
}
