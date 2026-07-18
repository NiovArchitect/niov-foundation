// FILE: work-project.service.ts
// PURPOSE: Phase 1 PR 1 — WorkProject substrate per the
//          [FOUNDER-AUTH — CONTINUE AFTER EDX-3/4/5/6 / AUTONOMOUS
//          ENTERPRISE COLLABORATION COMPLETION] directive. Pure-
//          function service for create / list / archive
//          WorkProject + addMember / listMembers /
//          isProjectMember helpers used by EDX-1 sidecar + EDX-4 +
//          EDX-5 + EDX-6 project-scope validation.
//
// PRIVACY INVARIANT:
//   - safe_summary equivalent ('name') is bounded to prevent raw-
//     project-content collection.
//   - Same-org guard enforced at create + addMember.
//   - listForCaller is self-scoped via project membership; never
//     returns projects the caller has no membership in.
//   - NEVER hard-deleted (RULE 10) — state moves to ARCHIVED.
//
// CONNECTS TO:
//   - packages/database (prisma.workProject, prisma.workProjectMember)
//   - packages/database/src/queries/audit.ts (ADMIN_ACTION +
//     details.action discriminator pattern; no new top-level
//     audit literal at this slice)
//   - apps/api/src/services/otzar/twin-collaboration.service.ts
//     (forward-substrate at PR 4 — project membership validation
//     for PROJECT-target collaboration requests)
//   - apps/api/src/services/otzar/twin-authority-grant.service.ts
//     (forward-substrate at PR 4 — PROJECT_SCOPED grant membership
//     validation)
//   - apps/api/src/services/otzar/twin-correction-memory.service.ts
//     (forward-substrate at PR 4 — PROJECT-scope correction
//     membership validation)

import { writeAuditEvent } from "@niov/database";
import type {
  WorkProjectMemberRole,
  WorkProjectState,
} from "@prisma/client";
import { prisma } from "@niov/database";
import { getOrgEntityId } from "../governance/org.js";

export type { WorkProjectMemberRole, WorkProjectState };

const PROJECT_NAME_MAX_LENGTH = 200;
const LIST_TAKE_CAP = 100;

// WHAT: Inputs for createWorkProjectForCaller.
export interface CreateWorkProjectInput {
  callerEntityId: string;
  orgEntityId: string;
  name: string;
}

// WHAT: Safe employee-facing projection of a WorkProject row.
// WHY: Excludes archived_at (the state field already carries the
//      lifecycle signal at safe granularity). Always carries a
//      `revocable` boolean so a future archive button can render.
export interface WorkProjectSafeView {
  project_id: string;
  name: string;
  state: WorkProjectState;
  created_at: string;
  archivable: boolean;
  /** Caller's role on this project when listed for them; null if unknown. */
  my_role?: WorkProjectMemberRole | null;
  /** Member count for glanceable capacity (safe integer). */
  member_count?: number;
}

// WHAT: Safe employee-facing projection of a WorkProjectMember row.
export interface WorkProjectMemberSafeView {
  project_member_id: string;
  project_id: string;
  entity_id: string;
  role: WorkProjectMemberRole;
  created_at: string;
  /** Human label only — never email in list surfaces. */
  display_name?: string;
}

/** Org colleague for project invite picker (safe labels). */
export interface ProjectColleagueView {
  entity_id: string;
  display_name: string;
}

// WHAT: Inputs for listWorkProjectsForCaller.
export interface ListWorkProjectsInput {
  callerEntityId: string;
  state?: WorkProjectState;
  take?: number;
}

// WHAT: Inputs for addWorkProjectMemberForCaller.
export interface AddWorkProjectMemberInput {
  callerEntityId: string;
  projectId: string;
  entityId: string;
  role?: WorkProjectMemberRole;
  // [PROD-UX-ASSIGN] Org-admin assignment authority (the People &
  // Collaboration "Assign" flow). ROUTE-COMPUTED ONLY — never taken from a
  // client body. When true, the caller may add members to any project in
  // actorOrgEntityId's org without being project OWNER (mirrors the
  // hierarchy-assign admin model). Both fields must be present together; the
  // project must belong to actorOrgEntityId or the override is ignored.
  actorIsOrgAdmin?: boolean;
  actorOrgEntityId?: string;
}

// WHAT: Result shape for addMember.
export type AddMemberResult =
  | { ok: true; member: WorkProjectMemberSafeView; audit_event_id: string }
  | {
      ok: false;
      code:
        | "PROJECT_NOT_FOUND"
        | "PROJECT_ARCHIVED"
        | "NOT_PROJECT_OWNER"
        | "ALREADY_MEMBER"
        | "CROSS_ORG_DENIED";
      /** Present on ALREADY_MEMBER — the existing row (idempotent reads). */
      membership_id?: string;
    };

// WHAT: Inputs for archiveWorkProjectForCaller.
export interface ArchiveWorkProjectInput {
  callerEntityId: string;
  projectId: string;
}

export type ArchiveProjectResult =
  | { ok: true; project: WorkProjectSafeView }
  | {
      ok: false;
      code:
        | "PROJECT_NOT_FOUND"
        | "NOT_PROJECT_OWNER"
        | "ALREADY_ARCHIVED";
    };

// ─────────────────────────────────────────────────────────────
// Pure projections
// ─────────────────────────────────────────────────────────────

export function projectWorkProjectSafeView(row: {
  project_id: string;
  name: string;
  state: WorkProjectState;
  created_at: Date;
}): WorkProjectSafeView {
  return {
    project_id: row.project_id,
    name: row.name,
    state: row.state,
    created_at: row.created_at.toISOString(),
    archivable: row.state === "ACTIVE",
  };
}

export function projectWorkProjectMemberSafeView(row: {
  project_member_id: string;
  project_id: string;
  entity_id: string;
  role: WorkProjectMemberRole;
  created_at: Date;
}): WorkProjectMemberSafeView {
  return {
    project_member_id: row.project_member_id,
    project_id: row.project_id,
    entity_id: row.entity_id,
    role: row.role,
    created_at: row.created_at.toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────
// Mutating helpers
// ─────────────────────────────────────────────────────────────

// WHAT: Create a project; caller becomes OWNER.
// WHY: One transactional pair — the project row + the OWNER
//      membership row. Emits ADMIN_ACTION audit BEFORE the
//      service returns (RULE 4). Name bounded.
export async function createWorkProjectForCaller(
  input: CreateWorkProjectInput,
): Promise<WorkProjectSafeView> {
  const name = input.name.slice(0, PROJECT_NAME_MAX_LENGTH);
  const row = await prisma.workProject.create({
    data: {
      org_entity_id: input.orgEntityId,
      name,
      state: "ACTIVE",
      created_by_entity_id: input.callerEntityId,
    },
  });
  // OWNER membership is created as a separate write so a future
  // policy that lets non-OWNERs create projects can drop this
  // line without a multi-row data shape change.
  await prisma.workProjectMember.create({
    data: {
      project_id: row.project_id,
      org_entity_id: input.orgEntityId,
      entity_id: input.callerEntityId,
      role: "OWNER",
    },
  });
  await writeAuditEvent({
    event_type: "ADMIN_ACTION",
    outcome: "SUCCESS",
    actor_entity_id: input.callerEntityId,
    target_entity_id: input.callerEntityId,
    details: {
      action: "WORK_PROJECT_CREATED",
      project_id: row.project_id,
    },
  });
  return projectWorkProjectSafeView(row);
}

// WHAT: List projects the caller is a member of.
// WHY: Self-scoped via project_member.entity_id; ACTIVE-only by
//      default unless state filter explicitly passed.
//      Enriched with my_role + member_count so Today / Projects surfaces
//      can show "I'm on these projects" without a second round-trip.
export async function listWorkProjectsForCaller(
  input: ListWorkProjectsInput,
): Promise<WorkProjectSafeView[]> {
  const take = Math.min(input.take ?? 50, LIST_TAKE_CAP);
  const memberships = await prisma.workProjectMember.findMany({
    where: { entity_id: input.callerEntityId },
    select: { project_id: true, role: true },
  });
  const roleByProject = new Map(
    memberships.map((m) => [m.project_id, m.role as WorkProjectMemberRole]),
  );
  const projectIds = memberships.map((m) => m.project_id);
  if (projectIds.length === 0) return [];
  const rows = await prisma.workProject.findMany({
    where: {
      project_id: { in: projectIds },
      ...(input.state !== undefined ? { state: input.state } : {}),
    },
    orderBy: { created_at: "desc" },
    take,
  });
  // Count members without groupBy (unit mocks may not implement it).
  const memberRows = await prisma.workProjectMember.findMany({
    where: { project_id: { in: rows.map((r) => r.project_id) } },
    select: { project_id: true },
  });
  const countBy = new Map<string, number>();
  for (const m of memberRows) {
    countBy.set(m.project_id, (countBy.get(m.project_id) ?? 0) + 1);
  }
  return rows.map((row) => ({
    ...projectWorkProjectSafeView(row),
    my_role: roleByProject.get(row.project_id) ?? null,
    member_count: countBy.get(row.project_id) ?? 0,
  }));
}

// WHAT: Is caller an active manager of person (person→person hierarchy edge)?
// WHY: Project placement is normally manager/lead work, not org-admin default.
export async function isActiveManagerOfPerson(args: {
  managerEntityId: string;
  personEntityId: string;
}): Promise<boolean> {
  if (args.managerEntityId === args.personEntityId) return false;
  const edge = await prisma.entityMembership.findFirst({
    where: {
      parent_id: args.managerEntityId,
      child_id: args.personEntityId,
      is_active: true,
    },
    select: { membership_id: true },
  });
  return edge !== null;
}

// WHAT: Add a member to a project.
// WHY: Authority (in order): project OWNER · manager-of-person who owns the
//      project · org-admin exception. Same-org. Idempotent ALREADY_MEMBER.
//      Never mass-add. Archived projects reject.
export async function addWorkProjectMemberForCaller(
  input: AddWorkProjectMemberInput,
): Promise<AddMemberResult> {
  const project = await prisma.workProject.findUnique({
    where: { project_id: input.projectId },
  });
  if (project === null) return { ok: false, code: "PROJECT_NOT_FOUND" };
  if (project.state === "ARCHIVED")
    return { ok: false, code: "PROJECT_ARCHIVED" };
  // Org-admin exception (bootstrap / rare) — route-computed flags only.
  const adminOverride =
    input.actorIsOrgAdmin === true &&
    typeof input.actorOrgEntityId === "string" &&
    input.actorOrgEntityId === project.org_entity_id;
  const callerMembership = await prisma.workProjectMember.findUnique({
    where: {
      project_id_entity_id: {
        project_id: input.projectId,
        entity_id: input.callerEntityId,
      },
    },
  });
  const isProjectOwner =
    callerMembership !== null && callerMembership.role === "OWNER";
  // Manager of the person may place them only onto a project they lead (own).
  const isManagerPlacingReport =
    isProjectOwner &&
    (await isActiveManagerOfPerson({
      managerEntityId: input.callerEntityId,
      personEntityId: input.entityId,
    }));
  if (!adminOverride && !isProjectOwner) {
    return { ok: false, code: "NOT_PROJECT_OWNER" };
  }
  // Track authority for audit (manager vs pure owner vs admin).
  const authority: "ORG_ADMIN" | "PROJECT_OWNER" | "MANAGER_LEAD" = adminOverride
    ? "ORG_ADMIN"
    : isManagerPlacingReport
      ? "MANAGER_LEAD"
      : "PROJECT_OWNER";
  // Same-org guard for the candidate member.
  if (input.entityId !== project.org_entity_id) {
    const orgLink = await prisma.entityMembership.findFirst({
      where: {
        parent_id: project.org_entity_id,
        child_id: input.entityId,
        is_active: true,
      },
      select: { child_id: true },
    });
    if (orgLink === null) return { ok: false, code: "CROSS_ORG_DENIED" };
  }
  // Idempotent ALREADY_MEMBER.
  const existing = await prisma.workProjectMember.findUnique({
    where: {
      project_id_entity_id: {
        project_id: input.projectId,
        entity_id: input.entityId,
      },
    },
  });
  if (existing !== null)
    return { ok: false, code: "ALREADY_MEMBER", membership_id: existing.project_member_id };
  const row = await prisma.workProjectMember.create({
    data: {
      project_id: input.projectId,
      org_entity_id: project.org_entity_id,
      entity_id: input.entityId,
      role: input.role ?? "MEMBER",
    },
  });
  const audit = await writeAuditEvent({
    event_type: "ADMIN_ACTION",
    outcome: "SUCCESS",
    actor_entity_id: input.callerEntityId,
    target_entity_id: input.entityId,
    details: {
      action: "WORK_PROJECT_MEMBER_ADDED",
      project_id: input.projectId,
      role: row.role,
      authority,
      ...(adminOverride
        ? { via_org_admin: true, org_entity_id: project.org_entity_id }
        : {}),
      ...(authority === "MANAGER_LEAD" ? { via_manager_of_person: true } : {}),
    },
  });
  return { ok: true, member: projectWorkProjectMemberSafeView(row), audit_event_id: audit.audit_id };
}

// WHAT: Direct reports of the caller who have no ACTIVE project membership.
// WHY: Managers place their people — not org-admin by default (Dandelion grow).
export async function listManagerStructureGaps(args: {
  callerEntityId: string;
}): Promise<
  | {
      ok: true;
      reports: Array<{
        person_entity_id: string;
        display_name: string;
      }>;
      my_led_projects: Array<{ project_id: string; name: string }>;
    }
  | { ok: false; code: "NO_ORG_FOR_CALLER" }
> {
  let orgEntityId: string;
  try {
    orgEntityId = await getOrgEntityId(args.callerEntityId);
  } catch {
    return { ok: false, code: "NO_ORG_FOR_CALLER" };
  }
  // Reports: person edges where I am parent (manager).
  const reportEdges = await prisma.entityMembership.findMany({
    where: {
      parent_id: args.callerEntityId,
      is_active: true,
    },
    select: { child_id: true },
    take: 200,
  });
  const reportIds = reportEdges.map((e) => e.child_id);
  if (reportIds.length === 0) {
    return { ok: true, reports: [], my_led_projects: [] };
  }
  const activeProjects = await prisma.workProject.findMany({
    where: { org_entity_id: orgEntityId, state: "ACTIVE" },
    select: { project_id: true },
  });
  const activeIds = activeProjects.map((p) => p.project_id);
  const onProject =
    activeIds.length === 0
      ? []
      : await prisma.workProjectMember.findMany({
          where: {
            entity_id: { in: reportIds },
            project_id: { in: activeIds },
          },
          select: { entity_id: true },
        });
  const hasProject = new Set(onProject.map((m) => m.entity_id));
  const gapIds = reportIds.filter((id) => !hasProject.has(id));
  const people =
    gapIds.length === 0
      ? []
      : await prisma.entity.findMany({
          where: {
            entity_id: { in: gapIds },
            entity_type: "PERSON",
            status: "ACTIVE",
            deleted_at: null,
          },
          select: { entity_id: true, display_name: true },
          orderBy: { display_name: "asc" },
        });
  // Projects I lead (OWNER) — where I can place reports.
  const owned = await prisma.workProjectMember.findMany({
    where: {
      entity_id: args.callerEntityId,
      role: "OWNER",
    },
    select: { project_id: true },
  });
  const ownedIds = owned.map((o) => o.project_id);
  const ledProjects =
    ownedIds.length === 0
      ? []
      : await prisma.workProject.findMany({
          where: {
            project_id: { in: ownedIds },
            state: "ACTIVE",
            org_entity_id: orgEntityId,
          },
          select: { project_id: true, name: true },
          orderBy: { name: "asc" },
        });
  return {
    ok: true,
    reports: people.map((p) => ({
      person_entity_id: p.entity_id,
      display_name: p.display_name,
    })),
    my_led_projects: ledProjects,
  };
}

// WHAT: List the members of a project the caller is a member of.
// WHY: Self-scoped — the caller must already be a member to see
//      the membership roster (no public project membership
//      exposure).
export async function listWorkProjectMembersForCaller(input: {
  callerEntityId: string;
  projectId: string;
}): Promise<
  | { ok: true; members: WorkProjectMemberSafeView[] }
  | { ok: false; code: "PROJECT_NOT_FOUND" | "NOT_PROJECT_MEMBER" }
> {
  const project = await prisma.workProject.findUnique({
    where: { project_id: input.projectId },
    select: { project_id: true },
  });
  if (project === null) return { ok: false, code: "PROJECT_NOT_FOUND" };
  const callerMembership = await prisma.workProjectMember.findUnique({
    where: {
      project_id_entity_id: {
        project_id: input.projectId,
        entity_id: input.callerEntityId,
      },
    },
  });
  if (callerMembership === null)
    return { ok: false, code: "NOT_PROJECT_MEMBER" };
  const rows = await prisma.workProjectMember.findMany({
    where: { project_id: input.projectId },
    orderBy: { created_at: "asc" },
  });
  const entityIds = rows.map((r) => r.entity_id);
  let nameBy = new Map<string, string>();
  if (entityIds.length > 0 && prisma.entity?.findMany !== undefined) {
    const entities = await prisma.entity.findMany({
      where: { entity_id: { in: entityIds } },
      select: { entity_id: true, display_name: true },
    });
    nameBy = new Map(entities.map((e) => [e.entity_id, e.display_name]));
  }
  return {
    ok: true,
    members: rows.map((row) => ({
      ...projectWorkProjectMemberSafeView(row),
      display_name: nameBy.get(row.entity_id) ?? "Teammate",
    })),
  };
}

// WHAT: Org colleagues the caller may invite onto a project (picker).
// WHY: Employees must not paste entity UUIDs. Labels only; same-org only.
export async function listProjectColleaguesForCaller(input: {
  callerEntityId: string;
  take?: number;
}): Promise<
  | { ok: true; colleagues: ProjectColleagueView[] }
  | { ok: false; code: "NO_ORG_FOR_CALLER" }
> {
  const take = Math.min(input.take ?? 100, LIST_TAKE_CAP);
  let orgEntityId: string;
  try {
    orgEntityId = await getOrgEntityId(input.callerEntityId);
  } catch {
    return { ok: false, code: "NO_ORG_FOR_CALLER" };
  }
  const memberLinks = await prisma.entityMembership.findMany({
    where: {
      parent_id: orgEntityId,
      is_active: true,
    },
    select: { child_id: true },
    take: 500,
  });
  const ids = memberLinks
    .map((m) => m.child_id)
    .filter((id) => id !== input.callerEntityId);
  if (ids.length === 0) return { ok: true, colleagues: [] };
  const people = await prisma.entity.findMany({
    where: {
      entity_id: { in: ids },
      entity_type: "PERSON",
      status: "ACTIVE",
      deleted_at: null,
    },
    select: { entity_id: true, display_name: true },
    orderBy: { display_name: "asc" },
    take,
  });
  return {
    ok: true,
    colleagues: people.map((p) => ({
      entity_id: p.entity_id,
      display_name: p.display_name,
    })),
  };
}

// WHAT: Archive a project the caller owns.
// WHY: Caller-must-be-OWNER. Idempotent ALREADY_ARCHIVED.
export async function archiveWorkProjectForCaller(
  input: ArchiveWorkProjectInput,
): Promise<ArchiveProjectResult> {
  const project = await prisma.workProject.findUnique({
    where: { project_id: input.projectId },
  });
  if (project === null) return { ok: false, code: "PROJECT_NOT_FOUND" };
  const callerMembership = await prisma.workProjectMember.findUnique({
    where: {
      project_id_entity_id: {
        project_id: input.projectId,
        entity_id: input.callerEntityId,
      },
    },
  });
  if (callerMembership === null || callerMembership.role !== "OWNER")
    return { ok: false, code: "NOT_PROJECT_OWNER" };
  if (project.state === "ARCHIVED")
    return { ok: false, code: "ALREADY_ARCHIVED" };
  const now = new Date();
  const updated = await prisma.workProject.update({
    where: { project_id: input.projectId },
    data: { state: "ARCHIVED", archived_at: now },
  });
  await writeAuditEvent({
    event_type: "ADMIN_ACTION",
    outcome: "SUCCESS",
    actor_entity_id: input.callerEntityId,
    target_entity_id: input.callerEntityId,
    details: {
      action: "WORK_PROJECT_ARCHIVED",
      project_id: input.projectId,
    },
  });
  return { ok: true, project: projectWorkProjectSafeView(updated) };
}

// WHAT: Pure helper — is the given entity an ACTIVE-project member?
// WHY: Forward-substrate consumer at PR 4 for collaboration /
//      authority / correction project-scope validation. Returns
//      true iff a WorkProjectMember row exists AND the parent
//      project's state is ACTIVE.
export async function isActiveProjectMember(input: {
  projectId: string;
  entityId: string;
}): Promise<boolean> {
  const membership = await prisma.workProjectMember.findUnique({
    where: {
      project_id_entity_id: {
        project_id: input.projectId,
        entity_id: input.entityId,
      },
    },
    select: { project_id: true },
  });
  if (membership === null) return false;
  const project = await prisma.workProject.findUnique({
    where: { project_id: input.projectId },
    select: { state: true },
  });
  return project !== null && project.state === "ACTIVE";
}
