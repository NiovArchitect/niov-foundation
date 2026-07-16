// FILE: team-work-summary.service.ts
// PURPOSE: [COHERENCE-RECOVERY] "What is my team working on?" — capacity-only
//          aggregation of open obligations + open handoffs for the caller's org
//          (not private memory, not full org dump). Bounded, permissioned.
// CONNECTS TO: getDgiCoherence-adjacent product surfaces, CT People/Today.

import { prisma } from "@niov/database";
import { OPEN_HANDOFF_STATES, type HandoffState } from "@niov/database";

const TITLE_LEN = 100;
const PERSON_CAP = 12;
const ITEM_CAP = 5;

function safeTitle(raw: string | null | undefined): string {
  if (typeof raw !== "string" || raw.trim().length === 0) return "Untitled work";
  const t = raw.replace(/\s+/g, " ").trim();
  return t.length > TITLE_LEN ? `${t.slice(0, TITLE_LEN - 1)}…` : t;
}

export interface TeamWorkPersonSummary {
  entity_id: string;
  display_name: string;
  open_obligation_count: number;
  open_incoming_handoff_count: number;
  sample_titles: string[];
}

export interface TeamWorkSummary {
  org_entity_id: string;
  people: TeamWorkPersonSummary[];
  total_open_obligations: number;
  total_open_handoffs: number;
  generated_at: string;
}

/**
 * Aggregate open work for org members the caller can see via membership.
 * Fail-closed empty when no org. Never includes other-org entities.
 */
export async function buildTeamWorkSummary(args: {
  orgEntityId: string;
  callerEntityId: string;
}): Promise<TeamWorkSummary> {
  const empty: TeamWorkSummary = {
    org_entity_id: args.orgEntityId,
    people: [],
    total_open_obligations: 0,
    total_open_handoffs: 0,
    generated_at: new Date().toISOString(),
  };

  try {
    // Org members (people only) — active membership under org.
    const memberships = await prisma.entityMembership.findMany({
      where: { parent_id: args.orgEntityId, is_active: true },
      select: { child_id: true },
      take: 80,
    });
    const childIds = memberships.map((m) => m.child_id);
    if (childIds.length === 0) return empty;

    const people = await prisma.entity.findMany({
      where: {
        entity_id: { in: childIds },
        entity_type: "PERSON",
        deleted_at: null,
        status: "ACTIVE",
      },
      select: { entity_id: true, display_name: true, email: true },
      take: PERSON_CAP * 2,
    });

    // Open obligations per subject (org-scoped).
    const openObl = await prisma.obligation.findMany({
      where: {
        org_entity_id: args.orgEntityId,
        subject_entity_id: { in: people.map((p) => p.entity_id) },
        state: {
          in: [
            "OPEN",
            "AWAITING_RESPONSE",
            "ACKNOWLEDGED",
            "IN_PROGRESS",
            "BLOCKED",
            "ESCALATED",
          ],
        },
      },
      select: {
        subject_entity_id: true,
        title: true,
        created_at: true,
      },
      orderBy: { created_at: "desc" },
      take: 200,
    });

    const openHandoffStates = [...OPEN_HANDOFF_STATES] as HandoffState[];
    // Handoffs where any member is a party (caller-scoped list may miss peers).
    const handoffRows = await prisma.handoff.findMany({
      where: {
        org_entity_id: args.orgEntityId,
        state: { in: openHandoffStates },
        OR: [
          { incoming_responsible_entity_id: { in: people.map((p) => p.entity_id) } },
          { outgoing_responsible_entity_id: { in: people.map((p) => p.entity_id) } },
        ],
      },
      select: {
        title: true,
        incoming_responsible_entity_id: true,
        outgoing_responsible_entity_id: true,
      },
      take: 100,
    });

    const byPerson = new Map<string, TeamWorkPersonSummary>();
    for (const p of people.slice(0, PERSON_CAP)) {
      byPerson.set(p.entity_id, {
        entity_id: p.entity_id,
        display_name: p.display_name ?? p.email ?? "Teammate",
        open_obligation_count: 0,
        open_incoming_handoff_count: 0,
        sample_titles: [],
      });
    }

    for (const o of openObl) {
      const row = byPerson.get(o.subject_entity_id);
      if (!row) continue;
      row.open_obligation_count += 1;
      if (row.sample_titles.length < ITEM_CAP) {
        row.sample_titles.push(safeTitle(o.title));
      }
    }

    for (const h of handoffRows) {
      const inId = h.incoming_responsible_entity_id;
      if (inId && byPerson.has(inId)) {
        const row = byPerson.get(inId)!;
        row.open_incoming_handoff_count += 1;
        if (row.sample_titles.length < ITEM_CAP) {
          row.sample_titles.push(safeTitle(h.title));
        }
      }
    }

    const peopleOut = [...byPerson.values()]
      .filter(
        (p) =>
          p.open_obligation_count > 0 || p.open_incoming_handoff_count > 0,
      )
      .sort(
        (a, b) =>
          b.open_obligation_count +
          b.open_incoming_handoff_count -
          (a.open_obligation_count + a.open_incoming_handoff_count),
      )
      .slice(0, PERSON_CAP);

    return {
      org_entity_id: args.orgEntityId,
      people: peopleOut,
      total_open_obligations: openObl.length,
      total_open_handoffs: handoffRows.length,
      generated_at: new Date().toISOString(),
    };
  } catch {
    return empty;
  }
}
