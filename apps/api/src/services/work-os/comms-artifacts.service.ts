// FILE: comms-artifacts.service.ts
// PURPOSE: Phase 1285-T — the Comms cockpit "Recent conversation intelligence"
//          feed. A DURABLE PROJECTION over the Work Ledger (the system-of-record
//          for conversation-derived artifacts: follow-ups, decisions, blockers,
//          commitments, captured work, internal-note notifications). No new
//          table, no fake artifacts, no local-only cache. Self-scoped +
//          tenant-isolated, mirroring getMyWork's proven scope. Identity is a
//          canonical display label, never a raw UUID as the primary label.
// CONNECTS TO: apps/api/src/routes/work-os-ledger.routes.ts (the
//          /work-os/comms/recent-artifacts route); resolve-entities.ts
//          (canonical names); packages/database (prisma);
//          tests/unit/comms-artifacts.test.ts.

import { prisma } from "@niov/database";
import type { WorkLedgerEntry } from "@prisma/client";
import { resolveEntityNames, type ResolvedName } from "../identity/resolve-entities.js";
import {
  meetingIntelligenceFromDetails,
  type MeetingIntelligenceProjection,
} from "./work-ledger.service.js";

export type CommsArtifactType =
  | "DIRECT_MESSAGE"
  | "THREAD_REPLY"
  | "WORK_CAPTURE"
  | "FOLLOW_UP"
  | "DECISION"
  | "BLOCKER"
  | "MEETING_CAPTURE"
  | "ACTION_PROPOSAL"
  | "NOTIFICATION";

export interface CommsArtifactEntity {
  entity_id: string | null;
  display_name: string;
  unresolved: boolean;
}

export interface RecentCommsArtifact {
  artifact_id: string;
  artifact_type: CommsArtifactType;
  title: string;
  summary: string | null;
  created_at: string;
  updated_at: string;
  status: string;
  scope: "personal";
  related_person: CommsArtifactEntity | null;
  source: {
    source_system: "work_ledger";
    source_message_id: string | null;
    ledger_entry_id: string;
  };
  destination: {
    kind: "work" | "thread" | "notification" | "none";
    route: string | null;
  };
  // Phase 1286-C — the SAFE advisory meeting-intelligence projection (Phase
  // 1285-V), present ONLY when the underlying ledger row carries it. Read-only;
  // never the raw transcript or chain-of-thought. Absent on non-meeting rows.
  meeting_intelligence?: MeetingIntelligenceProjection;
}

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 50;
// Done/dead statuses are not "recent intelligence to act on" — exclude.
const DONE_STATUSES = ["CANCELLED", "EXPIRED"];

// WHAT: map a Work Ledger entry's ledger_type to a Comms artifact type.
// WHY: the cockpit advertises follow-ups / decisions / blockers / commitments /
//      captured work; everything else durable collapses to WORK_CAPTURE. No
//      type is invented.
function artifactTypeFor(ledgerType: string): CommsArtifactType {
  switch (ledgerType) {
    case "FOLLOW_UP":
      return "FOLLOW_UP";
    case "DECISION":
      return "DECISION";
    case "BLOCKER":
      return "BLOCKER";
    case "NOTIFICATION":
      return "NOTIFICATION";
    default:
      return "WORK_CAPTURE"; // TASK / APPROVAL / COMMITMENT / MEETING / etc.
  }
}

function sourceMessageIdOf(details: unknown): string | null {
  if (typeof details !== "object" || details === null) return null;
  const v = (details as Record<string, unknown>).source_message_id;
  return typeof v === "string" && v.length > 0 ? v : null;
}

function canonical(
  names: Map<string, ResolvedName>,
  id: string | null,
): CommsArtifactEntity | null {
  if (id === null) return null;
  const r = names.get(id);
  if (r === undefined) return { entity_id: id, display_name: "Unknown entity", unresolved: true };
  return { entity_id: id, display_name: r.display_name, unresolved: r.unresolved };
}

// WHAT: recent conversation-derived artifacts for the caller.
// INPUT: org + caller (+ optional limit).
// OUTPUT: RecentCommsArtifact[] ordered by most-recent activity.
// WHY: powers the Comms cockpit recent list from durable records only. Scope
//      mirrors getMyWork (caller owns/requested/targeted; tenant-isolated).
export async function getRecentCommsArtifacts(args: {
  org_entity_id: string;
  caller_entity_id: string;
  limit?: number;
}): Promise<RecentCommsArtifact[]> {
  const limit = Math.min(Math.max(1, args.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
  const rows = await prisma.workLedgerEntry.findMany({
    where: {
      org_entity_id: args.org_entity_id,
      OR: [
        { owner_entity_id: args.caller_entity_id },
        { target_entity_id: args.caller_entity_id },
        { requester_entity_id: args.caller_entity_id },
      ],
      NOT: { status: { in: DONE_STATUSES } },
    },
    orderBy: { updated_at: "desc" }, // most-recent activity first
    take: limit,
  });

  const names = await resolveEntityNames(
    rows.flatMap((r) => [r.owner_entity_id, r.requester_entity_id, r.target_entity_id]),
  );

  return rows.map((r: WorkLedgerEntry) => {
    // related_person = the counterpart relative to the caller (the other side
    // of the conversation/work), never the caller themselves.
    const counterpartId =
      r.requester_entity_id === args.caller_entity_id
        ? (r.owner_entity_id ?? r.target_entity_id)
        : (r.requester_entity_id ?? r.owner_entity_id ?? r.target_entity_id);
    const relatedId = counterpartId === args.caller_entity_id ? null : counterpartId;
    const sourceMessageId = sourceMessageIdOf(r.details);
    const meetingIntelligence = meetingIntelligenceFromDetails(r.details);
    return {
      artifact_id: r.ledger_entry_id,
      artifact_type: artifactTypeFor(r.ledger_type),
      title: r.title,
      summary: r.summary ?? r.next_action ?? null,
      created_at: r.created_at.toISOString(),
      updated_at: r.updated_at.toISOString(),
      status: r.status,
      scope: "personal" as const,
      related_person: canonical(names, relatedId),
      source: {
        source_system: "work_ledger" as const,
        source_message_id: sourceMessageId,
        ledger_entry_id: r.ledger_entry_id,
      },
      // Every artifact resolves to a real, navigable destination (the durable
      // Work surface). No dead links, no fabricated routes.
      destination: { kind: "work" as const, route: "/app/my-work" },
      // Present only when the row genuinely carries meeting intelligence; absent
      // (field omitted) otherwise — never faked.
      ...(meetingIntelligence !== undefined ? { meeting_intelligence: meetingIntelligence } : {}),
    };
  });
}
