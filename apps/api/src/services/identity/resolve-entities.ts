// FILE: resolve-entities.ts
// PURPOSE: Phase 1285-H semantic reconciliation — the SINGLE shared
//          entity-id → display-name resolver. Before this, every service rolled
//          its own `nameOf` map with a divergent fallback ("(unknown)"). This
//          is now the one resolution path, enforcing the canonical identity
//          contract: a missing/unresolvable entity is a FIRST-CLASS state, never
//          an exception and never a raw UUID — callers always get a label plus
//          an explicit `unresolved` flag for diagnosis.
// CONNECTS TO: work-ledger.service (getTeamWork/getMyWork), internal-message
//          service (getDirectMessageThread); tests/unit/resolve-entities.test.ts.

import { prisma } from "@niov/database";

// The single canonical label for an entity that cannot be resolved. NEVER a
// raw UUID. Kept in sync with the CT canonical-entity UNRESOLVED_LABEL.
export const UNRESOLVED_ENTITY_LABEL = "Unknown entity";

export interface ResolvedName {
  display_name: string;
  // First-class state (decision 2026-06-16): true when the id had no resolvable
  // entity / display name. Lets surfaces badge it without crashing or leaking.
  unresolved: boolean;
}

// WHAT: Resolve a set of entity_ids to display names in one batched query.
// INPUT: entity_ids (nullable/duplicate-tolerant).
// OUTPUT: Map keyed by entity_id → { display_name, unresolved }. Every input id
//         is present in the map; an id with no entity / blank name resolves to
//         { display_name: UNRESOLVED_ENTITY_LABEL, unresolved: true }.
// WHY: one resolver, one fallback — eliminates the divergent per-service maps
//      and the "(unknown)" drift, and guarantees no caller ever renders a UUID.
export async function resolveEntityNames(
  ids: ReadonlyArray<string | null | undefined>,
): Promise<Map<string, ResolvedName>> {
  const map = new Map<string, ResolvedName>();
  const unique = [...new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0))];
  if (unique.length === 0) return map;
  const rows = await prisma.entity.findMany({
    where: { entity_id: { in: unique } },
    select: { entity_id: true, display_name: true },
  });
  const found = new Map(rows.map((r) => [r.entity_id, r.display_name]));
  for (const id of unique) {
    const dn = found.get(id);
    map.set(
      id,
      typeof dn === "string" && dn.length > 0
        ? { display_name: dn, unresolved: false }
        : { display_name: UNRESOLVED_ENTITY_LABEL, unresolved: true },
    );
  }
  return map;
}

// WHAT: convenience — the display name for one id from a resolved map, never a
//        UUID (falls back to the canonical label if absent).
export function nameFrom(map: Map<string, ResolvedName>, id: string | null | undefined): string {
  if (typeof id !== "string" || id.length === 0) return UNRESOLVED_ENTITY_LABEL;
  return map.get(id)?.display_name ?? UNRESOLVED_ENTITY_LABEL;
}
