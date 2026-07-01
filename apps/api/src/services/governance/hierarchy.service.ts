// FILE: hierarchy.service.ts
// PURPOSE: [PROD-UX-HIER] Admin authoring of the org's person→person
//          reporting structure over the EXISTING EntityMembership model
//          (no new tables). One operation: assign/update a person's
//          manager + role/department. Org-scoped, admin-gated at the
//          route, cycle-safe, stable-ID-only (duplicate display names
//          can never mis-assign). The org→person membership rows created
//          at provisioning are untouched except role/department updates.
// CONNECTS TO: routes/org.routes.ts (POST /org/hierarchy/assign,
//              GET /org/hierarchy person-edge read), CT src/pages/Users.tsx,
//              tests/unit/hierarchy-cycle.test.ts,
//              tests/integration/admin-routes.test.ts.

import { prisma, writeAuditEvent } from "@niov/database";

/** Pure: would making `managerId` the manager of `personId` create a cycle?
 *  `edges` = active person→person manager edges as [managerId, reportId]. */
export function wouldCreateCycle(
  edges: ReadonlyArray<readonly [string, string]>,
  personId: string,
  managerId: string,
): boolean {
  if (personId === managerId) return true;
  // Walk UP from the proposed manager; if we reach the person, it's a cycle.
  const managerOf = new Map<string, string>();
  for (const [mgr, rep] of edges) managerOf.set(rep, mgr);
  let cur: string | undefined = managerId;
  for (let hops = 0; cur !== undefined && hops < 1000; hops++) {
    if (cur === personId) return true;
    cur = managerOf.get(cur);
  }
  return false;
}

export type AssignManagerResult =
  | { ok: true; membership_id: string; audit_event_id: string }
  | { ok: false; code: "PERSON_NOT_FOUND" | "MANAGER_NOT_FOUND" | "CYCLE" | "INVALID_FIELD" };

// WHAT: assign/update a person's manager relationship + role/department.
// INPUT: org id (already resolved from the CALLER — never from the body),
//        stable entity ids, optional role_title/department strings,
//        manager_entity_id null = keep/clear manager, update role/dept only.
// OUTPUT: membership id + audit id, or a typed refusal. Never cross-org:
//         both entities must hold an ACTIVE org→person membership in the
//         caller's org (unknown/foreign ids → *_NOT_FOUND, no leak).
export async function assignManager(input: {
  org_entity_id: string;
  actor_entity_id: string;
  person_entity_id: string;
  manager_entity_id: string | null;
  role_title?: string | undefined;
  department?: string | undefined;
}): Promise<AssignManagerResult> {
  const { org_entity_id, person_entity_id, manager_entity_id } = input;
  const role_title = input.role_title?.trim() || undefined;
  const department = input.department?.trim() || undefined;
  if (role_title !== undefined && role_title.length > 200) return { ok: false, code: "INVALID_FIELD" };
  if (department !== undefined && department.length > 200) return { ok: false, code: "INVALID_FIELD" };

  // Org membership guard (stable IDs; PERSON entities only).
  const orgEdges = await prisma.entityMembership.findMany({
    where: { parent_id: org_entity_id, is_active: true },
    select: { child_id: true, membership_id: true, hierarchy_level: true },
  });
  const orgMemberIds = new Set(orgEdges.map((e) => e.child_id));
  if (!orgMemberIds.has(person_entity_id)) return { ok: false, code: "PERSON_NOT_FOUND" };
  if (manager_entity_id !== null && !orgMemberIds.has(manager_entity_id)) {
    return { ok: false, code: "MANAGER_NOT_FOUND" };
  }

  // Active person→person edges inside this org (for the cycle guard).
  const personEdges = await prisma.entityMembership.findMany({
    where: {
      is_active: true,
      parent_id: { in: [...orgMemberIds] },
      child_id: { in: [...orgMemberIds] },
    },
    select: { membership_id: true, parent_id: true, child_id: true, hierarchy_level: true },
  });
  if (
    manager_entity_id !== null &&
    wouldCreateCycle(personEdges.map((e) => [e.parent_id, e.child_id] as const), person_entity_id, manager_entity_id)
  ) {
    return { ok: false, code: "CYCLE" };
  }

  const managerLevel =
    manager_entity_id === null
      ? 0
      : personEdges.find((e) => e.child_id === manager_entity_id)?.hierarchy_level ?? 1;

  const result = await prisma.$transaction(async (tx) => {
    // Retire any OTHER active manager edge for this person (one manager).
    const existing = personEdges.filter((e) => e.child_id === person_entity_id);
    for (const e of existing) {
      if (manager_entity_id === null || e.parent_id !== manager_entity_id) {
        await tx.entityMembership.update({
          where: { membership_id: e.membership_id },
          data: { is_active: false },
        });
      }
    }
    let membershipId: string;
    if (manager_entity_id !== null) {
      const same = existing.find((e) => e.parent_id === manager_entity_id);
      if (same !== undefined) {
        const updated = await tx.entityMembership.update({
          where: { membership_id: same.membership_id },
          data: {
            is_active: true,
            hierarchy_level: managerLevel + 1,
            ...(role_title !== undefined ? { role_title } : {}),
            ...(department !== undefined ? { department } : {}),
          },
        });
        membershipId = updated.membership_id;
      } else {
        // upsert on the unique (parent_id, child_id) pair — a previously
        // retired edge for the SAME pair is reactivated, never duplicated.
        const created = await tx.entityMembership.upsert({
          where: { parent_id_child_id: { parent_id: manager_entity_id, child_id: person_entity_id } },
          create: {
            parent_id: manager_entity_id,
            child_id: person_entity_id,
            hierarchy_level: managerLevel + 1,
            role_title: role_title ?? null,
            department: department ?? null,
          },
          update: {
            is_active: true,
            hierarchy_level: managerLevel + 1,
            ...(role_title !== undefined ? { role_title } : {}),
            ...(department !== undefined ? { department } : {}),
          },
        });
        membershipId = created.membership_id;
      }
    } else {
      membershipId = orgEdges.find((e) => e.child_id === person_entity_id)!.membership_id;
    }
    // role/department also land on the org→person row so flat readers agree.
    if (role_title !== undefined || department !== undefined) {
      const orgEdge = orgEdges.find((e) => e.child_id === person_entity_id)!;
      await tx.entityMembership.update({
        where: { membership_id: orgEdge.membership_id },
        data: {
          ...(role_title !== undefined ? { role_title } : {}),
          ...(department !== undefined ? { department } : {}),
        },
      });
    }
    return membershipId;
  });

  const audit = await writeAuditEvent({
    event_type: "ADMIN_ACTION",
    outcome: "SUCCESS",
    actor_entity_id: input.actor_entity_id,
    target_entity_id: person_entity_id,
    details: {
      action: "HIERARCHY_ASSIGN",
      org_entity_id,
      manager_entity_id,
      ...(role_title !== undefined ? { role_title } : {}),
      ...(department !== undefined ? { department } : {}),
    },
  });
  return { ok: true, membership_id: result, audit_event_id: audit.audit_id };
}
