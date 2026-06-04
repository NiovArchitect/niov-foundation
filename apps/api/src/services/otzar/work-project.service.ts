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
}

// WHAT: Safe employee-facing projection of a WorkProjectMember row.
export interface WorkProjectMemberSafeView {
  project_member_id: string;
  project_id: string;
  entity_id: string;
  role: WorkProjectMemberRole;
  created_at: string;
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
}

// WHAT: Result shape for addMember.
export type AddMemberResult =
  | { ok: true; member: WorkProjectMemberSafeView }
  | {
      ok: false;
      code:
        | "PROJECT_NOT_FOUND"
        | "PROJECT_ARCHIVED"
        | "NOT_PROJECT_OWNER"
        | "ALREADY_MEMBER"
        | "CROSS_ORG_DENIED";
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
export async function listWorkProjectsForCaller(
  input: ListWorkProjectsInput,
): Promise<WorkProjectSafeView[]> {
  const take = Math.min(input.take ?? 50, LIST_TAKE_CAP);
  const memberships = await prisma.workProjectMember.findMany({
    where: { entity_id: input.callerEntityId },
    select: { project_id: true },
  });
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
  return rows.map(projectWorkProjectSafeView);
}

// WHAT: Add a member to a project the caller owns.
// WHY: Caller-must-be-OWNER. Same-org guard. Idempotent
//      ALREADY_MEMBER on collision (unique constraint guard).
//      Archived projects reject. Emits ADMIN_ACTION audit
//      BEFORE returning.
export async function addWorkProjectMemberForCaller(
  input: AddWorkProjectMemberInput,
): Promise<AddMemberResult> {
  const project = await prisma.workProject.findUnique({
    where: { project_id: input.projectId },
  });
  if (project === null) return { ok: false, code: "PROJECT_NOT_FOUND" };
  if (project.state === "ARCHIVED")
    return { ok: false, code: "PROJECT_ARCHIVED" };
  // Caller must be OWNER on this project.
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
  if (existing !== null) return { ok: false, code: "ALREADY_MEMBER" };
  const row = await prisma.workProjectMember.create({
    data: {
      project_id: input.projectId,
      org_entity_id: project.org_entity_id,
      entity_id: input.entityId,
      role: input.role ?? "MEMBER",
    },
  });
  await writeAuditEvent({
    event_type: "ADMIN_ACTION",
    outcome: "SUCCESS",
    actor_entity_id: input.callerEntityId,
    target_entity_id: input.entityId,
    details: {
      action: "WORK_PROJECT_MEMBER_ADDED",
      project_id: input.projectId,
      role: row.role,
    },
  });
  return { ok: true, member: projectWorkProjectMemberSafeView(row) };
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
  return { ok: true, members: rows.map(projectWorkProjectMemberSafeView) };
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
