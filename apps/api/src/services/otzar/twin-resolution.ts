// FILE: services/otzar/twin-resolution.ts
// PURPOSE: [OTZAR-CONTINUITY D] The ONE canonical resolver for a caller's primary personal
//          Twin. conductSession (who the user TALKS to), getMyTwin (who they SEE), and C6
//          restoration (what the server RESTORES) MUST agree, or restoration would blend a
//          different human–Twin relationship than the one in use. Deterministic selection:
//          oldest active AI_AGENT child by created_at ASC, entity_id ASC tie-break.
// NOTE: There is no DB constraint forcing exactly one eligible Twin, so `eligible_count`
//       is surfaced — callers may fail closed or disambiguate on >1. The product contract
//       is a single deterministic primary; every surface uses THIS resolver so they agree.

import type { Entity } from "@prisma/client";
import { prisma } from "@niov/database";

export interface ResolvedTwin {
  twin: Entity;
  /** Number of eligible active AI_AGENT children (>1 ⇒ multiple relationships in data). */
  eligible_count: number;
}

/** Resolve the caller's deterministic primary Twin, or null if they have none. */
export async function resolvePrimaryTwin(ownerEntityId: string): Promise<ResolvedTwin | null> {
  const memberships = await prisma.entityMembership.findMany({
    where: { parent_id: ownerEntityId, is_active: true },
    select: { child_id: true },
  });
  const twins = await prisma.entity.findMany({
    where: {
      entity_id: { in: memberships.map((m) => m.child_id) },
      entity_type: "AI_AGENT",
      deleted_at: null,
    },
    orderBy: [{ created_at: "asc" }, { entity_id: "asc" }],
  });
  const twin = twins[0];
  if (twin === undefined) return null;
  return { twin, eligible_count: twins.length };
}
