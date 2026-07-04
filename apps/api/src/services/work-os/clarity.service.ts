// FILE: clarity.service.ts
// PURPOSE: [CE-1] Lineage-aware clarity projection — READ-ONLY. Answers
//          "who can clarify this work?" for one ledger entry by composing
//          truths that already exist: source lineage (Gap J), row parties,
//          project OWNER/REVIEWER roles, the paired escalation's approver,
//          and the caller's manager edge — manager ONLY when the item is an
//          authority question. Per the doctrine
//          (OTZAR_LINEAGE_AWARE_CLARITY_ESCALATION_MODEL.md §6): hierarchy
//          is a route for authority, not a default for knowledge.
//          NO mutation, NO escalation creation, NO notification, NO audit
//          write (read-only, matching the other :id read routes). Candidates
//          are suggestions only — nothing is sent.
// CONNECTS TO: work-os-ledger.routes.ts (GET /work-os/ledger/:id/clarity),
//          work-ledger.service.ts (getLedgerEntry gate + source_lineage),
//          recipient-governance.ts (strict roster resolution),
//          identity-reconciliation.service.ts (loadOrgMembers),
//          tests/integration/clarity-projection.test.ts.

import { prisma } from "@niov/database";
import { getLedgerEntry, sourceLineageFromDetails } from "./work-ledger.service.js";
import { resolveTokenToEntities } from "../otzar/recipient-governance.js";
import { loadOrgMembers } from "../otzar/identity-reconciliation.service.js";

export type ClarifierRole =
  | "source_author"
  | "owner"
  | "requester"
  | "target"
  | "project_owner"
  | "project_reviewer"
  | "approver"
  | "manager";

export interface ClarityCandidate {
  entity_id: string;
  display_name: string;
  role: ClarifierRole;
  /** Human reason copy (routing-decision precedent: server-composed prose). */
  reason: string;
  rank: number;
  /** [CE-4A] READ-ONLY learn signal: how many RESOLVED clarifications this
   *  person answered on similar work (same project, else same source
   *  system+author) in this org. Names and counts only — never answer text,
   *  never excerpts, never written to any memory store. */
  prior_clarifications?: number;
}

export interface ClarityProjection {
  /** True when the row carries any source/owner truth to answer from. */
  can_answer: boolean;
  /** True when the item's state is an AUTHORITY question — the only case
   *  where a manager appears as a candidate. */
  authority_question: boolean;
  /** How the source author resolved — drives honest copy when it could not. */
  source_author_state: "resolved" | "ambiguous" | "unresolved" | "none";
  /** Ranked, deduped, capped at 3 — calm by design. Empty = honest
   *  "not enough context" state, never an invented candidate. */
  candidates: ClarityCandidate[];
  /** [CE-2] The caller's own clarification on this row, when one exists —
   *  so the asker sees "requested / clarified / declined" without a new
   *  surface. Latest wins. */
  pending_clarification?: {
    escalation_id: string;
    status: string;
    clarifier_entity_id: string;
    clarifier_display_name: string;
  };
}

const AUTHORITY_STATUSES = new Set(["NEEDS_AUTHORITY", "NEEDS_APPROVAL"]);
const MAX_CANDIDATES = 3;

// WHAT: rank the best-known clarifiers for one ledger entry.
// INPUT: org + caller (route-resolved, never from the body) + the entry id.
// OUTPUT: ClarityProjection, or the ledger gate's NOT_FOUND (tenant +
//         party scope enforced by getLedgerEntry — 404 pattern preserved).
// RANKING (doctrine §6): source author → owner → requester → project
//         OWNER → project REVIEWER → approver → manager (authority only).
//         The caller is never their own clarifier; each person appears
//         once at their strongest rank.
export async function rankClarifiers(args: {
  org_entity_id: string;
  caller_entity_id: string;
  ledger_entry_id: string;
  is_manager: boolean;
}): Promise<
  | { ok: true; clarity: ClarityProjection }
  | { ok: false; code: string; message: string }
> {
  const gated = await getLedgerEntry({
    ledger_entry_id: args.ledger_entry_id,
    org_entity_id: args.org_entity_id,
    caller_entity_id: args.caller_entity_id,
    is_manager: args.is_manager,
  });
  if (gated.ok === false) return gated;
  const entry = gated.entry;

  const authorityQuestion = AUTHORITY_STATUSES.has(entry.status);
  const lineage = entry.source_lineage;

  // Collect candidate (entity_id, role, reason) in doctrine order; dedupe
  // by entity keeping the strongest rank; exclude the caller.
  const picks: Array<{ entity_id: string; role: ClarifierRole; reason: string }> = [];
  const seen = new Set<string>([args.caller_entity_id]);
  const push = (entity_id: string | null | undefined, role: ClarifierRole, reason: string) => {
    if (typeof entity_id !== "string" || entity_id.length === 0) return;
    if (seen.has(entity_id)) return;
    seen.add(entity_id);
    picks.push({ entity_id, role, reason });
  };

  // 1. Source author — lineage.source_actor resolved STRICTLY against the
  //    org roster (never substring). Ambiguous or external → no candidate,
  //    reported honestly via source_author_state.
  let sourceAuthorState: ClarityProjection["source_author_state"] = "none";
  const members = await loadOrgMembers(args.org_entity_id);
  if (lineage !== undefined && typeof lineage.source_actor === "string" && lineage.source_actor.length > 0) {
    const roster = members.map((m) => ({
      entity_id: m.entity_id,
      display_name: m.display_name,
      email: m.email,
    }));
    const ids = resolveTokenToEntities(lineage.source_actor, roster);
    if (ids.length === 1) {
      sourceAuthorState = "resolved";
      const label = sourceLabelFor(lineage.source_system);
      push(ids[0], "source_author", `They ${label} this work came from.`);
    } else if (ids.length > 1) {
      sourceAuthorState = "ambiguous";
    } else {
      sourceAuthorState = "unresolved";
    }
  }

  // 2-3. Work owner, then requester (the people already on the row).
  push(entry.owner_entity_id, "owner", "They own this work.");
  push(entry.requester_entity_id, "requester", "They asked for this work.");

  // 4. [CE-1.5] Row target/recipient — durable row data (target_entity_id,
  //    never display-name guessing), only when the row itself is addressed
  //    to them; dedupe keeps stronger roles first.
  push(
    entry.target_entity_id,
    "target",
    entry.ledger_type === "FOLLOW_UP"
      ? "They are the recipient of this follow-up."
      : "This work is addressed to them.",
  );

  // 4. Project OWNER, then REVIEWER, of the item's project.
  if (entry.project_id !== null) {
    const projectMembers = await prisma.workProjectMember.findMany({
      where: {
        project_id: entry.project_id,
        org_entity_id: args.org_entity_id,
        role: { in: ["OWNER", "REVIEWER"] },
      },
      select: { entity_id: true, role: true },
      orderBy: { role: "asc" }, // OWNER sorts before REVIEWER
    });
    for (const m of projectMembers) {
      if (m.role === "OWNER") {
        push(m.entity_id, "project_owner", "They lead the project this belongs to.");
      } else {
        push(m.entity_id, "project_reviewer", "They review work on this project.");
      }
    }
  }

  // 5. Approver — the human who resolved the paired escalation, when the
  //    row was promoted to a governed Action that needed one.
  if (typeof entry.proposed_action_id === "string") {
    const action = await prisma.action.findUnique({
      where: { action_id: entry.proposed_action_id },
      select: { escalation_id: true },
    });
    if (action?.escalation_id) {
      const esc = await prisma.escalationRequest.findUnique({
        where: { escalation_id: action.escalation_id },
        select: { resolved_by_entity_id: true },
      });
      push(esc?.resolved_by_entity_id, "approver", "They approved the action on this work.");
    }
  }

  // 6. Manager — ONLY when authority is the question (doctrine: hierarchy
  //    is a route for authority, not a default for knowledge).
  if (authorityQuestion) {
    const memberIds = members.map((m) => m.entity_id);
    const managerEdge = await prisma.entityMembership.findFirst({
      where: {
        child_id: args.caller_entity_id,
        parent_id: { in: memberIds },
        is_active: true,
      },
      select: { parent_id: true },
    });
    push(managerEdge?.parent_id, "manager", "This needs an authority decision.");
  }

  // Resolve display names for the capped set; a candidate whose entity is
  // missing (should not happen — roster-sourced) is dropped, never guessed.
  const capped = picks.slice(0, MAX_CANDIDATES);
  const nameById = new Map(members.map((m) => [m.entity_id, m.display_name]));
  const missing = capped.filter((p) => !nameById.has(p.entity_id)).map((p) => p.entity_id);
  if (missing.length > 0) {
    const ents = await prisma.entity.findMany({
      where: { entity_id: { in: missing } },
      select: { entity_id: true, display_name: true },
    });
    for (const e of ents) nameById.set(e.entity_id, e.display_name);
  }
  const candidates: ClarityCandidate[] = [];
  for (const p of capped) {
    const display_name = nameById.get(p.entity_id);
    if (display_name === undefined) continue;
    candidates.push({
      entity_id: p.entity_id,
      display_name,
      role: p.role,
      reason: p.reason,
      rank: candidates.length + 1,
    });
  }

  // [CE-4A] READ-ONLY clarity learn signal: annotate candidates who resolved
  // clarifications on SIMILAR work before (same project when this row has
  // one; else same source system + author). Deterministic, org-scoped via
  // the candidates themselves (roster-derived) + the linked rows' org.
  // NOTHING is written — the write-loop is CE-4.5 (needs the portability
  // doctrine's derivation rail).
  if (candidates.length > 0) {
    const priorResolved = await prisma.escalationRequest.findMany({
      where: {
        escalation_type: "HUMAN_REVIEW_REQUIRED",
        status: "APPROVED",
        target_entity_id: { in: candidates.map((c) => c.entity_id) },
        resolution_metadata: { path: ["kind"], equals: "clarification" },
      },
      orderBy: { resolved_at: "desc" },
      take: 100,
      select: { target_entity_id: true, resolution_metadata: true },
    });
    const priorLedgerIds = priorResolved
      .map((e) => {
        const m =
          typeof e.resolution_metadata === "object" &&
          e.resolution_metadata !== null &&
          !Array.isArray(e.resolution_metadata)
            ? (e.resolution_metadata as Record<string, unknown>)
            : {};
        return typeof m.ledger_entry_id === "string" ? m.ledger_entry_id : null;
      })
      .filter((v): v is string => v !== null);
    if (priorLedgerIds.length > 0) {
      const priorRows = await prisma.workLedgerEntry.findMany({
        where: {
          ledger_entry_id: { in: priorLedgerIds, not: args.ledger_entry_id },
          org_entity_id: args.org_entity_id,
        },
        select: { ledger_entry_id: true, project_id: true, details: true },
      });
      const similar = new Set<string>();
      for (const row of priorRows) {
        if (entry.project_id !== null && row.project_id === entry.project_id) {
          similar.add(row.ledger_entry_id);
          continue;
        }
        if (lineage !== undefined) {
          const priorLineage = sourceLineageFromDetails(row.details, null);
          if (
            priorLineage !== undefined &&
            priorLineage.source_system === lineage.source_system &&
            priorLineage.source_actor !== null &&
            priorLineage.source_actor === lineage.source_actor
          ) {
            similar.add(row.ledger_entry_id);
          }
        }
      }
      const countByClarifier = new Map<string, number>();
      for (const e of priorResolved) {
        const m = e.resolution_metadata as Record<string, unknown>;
        const lid = typeof m.ledger_entry_id === "string" ? m.ledger_entry_id : "";
        if (!similar.has(lid)) continue;
        countByClarifier.set(
          e.target_entity_id,
          (countByClarifier.get(e.target_entity_id) ?? 0) + 1,
        );
      }
      for (const c of candidates) {
        const n = countByClarifier.get(c.entity_id) ?? 0;
        if (n > 0) {
          c.prior_clarifications = n;
          c.reason = `${c.reason} They clarified similar work here before.`;
        }
      }
    }
  }

  // [CE-2] The caller's own clarification on this row (latest), so the
  // asker's Why can show requested/clarified/declined truthfully.
  const myClarification = await prisma.escalationRequest.findFirst({
    where: {
      source_entity_id: args.caller_entity_id,
      escalation_type: "HUMAN_REVIEW_REQUIRED",
      resolution_metadata: {
        path: ["ledger_entry_id"],
        equals: args.ledger_entry_id,
      },
    },
    orderBy: { created_at: "desc" },
    select: { escalation_id: true, status: true, target_entity_id: true },
  });
  let pendingClarification: ClarityProjection["pending_clarification"];
  if (myClarification !== null) {
    const clarifierName =
      nameById.get(myClarification.target_entity_id) ??
      (
        await prisma.entity.findUnique({
          where: { entity_id: myClarification.target_entity_id },
          select: { display_name: true },
        })
      )?.display_name;
    if (clarifierName !== undefined) {
      pendingClarification = {
        escalation_id: myClarification.escalation_id,
        status: myClarification.status,
        clarifier_entity_id: myClarification.target_entity_id,
        clarifier_display_name: clarifierName,
      };
    }
  }

  return {
    ok: true,
    clarity: {
      can_answer: lineage !== undefined || entry.owner_entity_id !== null,
      authority_question: authorityQuestion,
      source_author_state: sourceAuthorState,
      candidates,
      ...(pendingClarification !== undefined
        ? { pending_clarification: pendingClarification }
        : {}),
    },
  };
}

// Human source phrase for the author reason (mirrors the CT label map's
// wired systems; unknown systems fall back to a neutral phrase).
function sourceLabelFor(system: string): string {
  switch (system) {
    case "SLACK":
      return "sent the Slack message";
    case "ZOOM":
      return "spoke in the Zoom recording";
    case "TRANSCRIPT":
    case "COMMS":
      return "spoke in the conversation";
    case "MEETING":
      return "spoke in the meeting";
    default:
      return "created the source";
  }
}
