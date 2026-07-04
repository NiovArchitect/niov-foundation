// FILE: collaboration-workspace.service.ts
// PURPOSE: Phase 1221 — service layer for the CollaborationWorkspace
//          substrate. End-to-end: create workspace / list / detail /
//          add member / attach conversation / import comms output
//          (decisions + commitments) / confirm a commitment into a
//          governed SEND_INTERNAL_NOTIFICATION Action / list workspace
//          actions.
//
// PRIVACY INVARIANT (RULE 0):
//   - Caller must be a workspace member to read / write the workspace.
//   - Same-org guard on member adds. External members rejected unless
//     workspace.visibility === EXTERNAL_ALLOWED.
//   - Audit emit BEFORE service returns success (RULE 4).
//   - Soft-delete only (RULE 10).
//   - Resolver fabricates no entity_ids (see
//     collaboration-assignment-resolver.ts §RULE 0).
//
// CONNECTS TO:
//   - packages/database/src/queries/audit.ts (10 NEW WORKSPACE_*
//     literals)
//   - apps/api/src/services/action/action.service.ts
//     (createActionForCaller — SEND_INTERNAL_NOTIFICATION)
//   - apps/api/src/services/governance/org.ts (getOrgEntityId
//     same-org guard)
//   - collaboration-assignment-resolver.ts (pure resolver)
//   - comms-extract.service.ts (reused upstream for DEMO_SCRIPTED
//     extraction)

import { writeAuditEvent } from "@niov/database";
import type {
  CollaborationCommitmentConfidence,
  CollaborationCommitmentResolutionStatus,
  CollaborationCommitmentStatus,
  CollaborationMembershipAccessLevel,
  CollaborationMembershipType,
  CollaborationSharedContextType,
  CollaborationSharedContextSensitivity,
  CollaborationWorkspaceSourceType,
  CollaborationWorkspaceStatus,
  CollaborationWorkspaceVisibility,
} from "@prisma/client";
import { prisma } from "@niov/database";
import { getOrgEntityId } from "../governance/org.js";
import { createActionForCaller } from "../action/action.service.js";
import { recordExternalCommitmentForCaller } from "./external-collaborator.service.js";
import {
  projectActionView,
  type SafeActionView,
} from "../action/views.js";
import {
  resolveCommitmentAssignment,
  type ResolverMemberSnapshot,
  type ResolverRosterEntry,
} from "./collaboration-assignment-resolver.js";

// ─── public types ───────────────────────────────────────────────

export interface WorkspaceSafeView {
  workspace_id: string;
  title: string;
  description: string | null;
  status: CollaborationWorkspaceStatus;
  visibility: CollaborationWorkspaceVisibility;
  source_type: CollaborationWorkspaceSourceType;
  source_conversation_id: string | null;
  created_by_entity_id: string;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceListItem extends WorkspaceSafeView {
  counts: {
    members: number;
    decisions: number;
    commitments: number;
    open_actions: number;
    completed_actions: number;
  };
}

export interface MembershipSafeView {
  membership_id: string;
  workspace_id: string;
  member_entity_id: string;
  member_display_name: string;
  member_email: string | null;
  role_label: string;
  responsibility_summary: string | null;
  member_type: CollaborationMembershipType;
  access_level: CollaborationMembershipAccessLevel;
  status: "ACTIVE" | "PENDING" | "REVOKED";
}

export interface DecisionSafeView {
  decision_id: string;
  workspace_id: string;
  text: string;
  source_conversation_id: string | null;
  source_excerpt: string | null;
  created_at: string;
}

export interface CommitmentSafeView {
  commitment_id: string;
  workspace_id: string;
  owner_entity_id: string | null;
  owner_display_name: string;
  text: string;
  due_date: string | null;
  source_conversation_id: string | null;
  source_excerpt: string | null;
  assignment_reason: string;
  confidence: CollaborationCommitmentConfidence;
  resolution_status: CollaborationCommitmentResolutionStatus;
  related_action_id: string | null;
  status: CollaborationCommitmentStatus;
}

export interface SharedContextSafeView {
  shared_context_id: string;
  workspace_id: string;
  context_type: CollaborationSharedContextType;
  context_ref_id: string | null;
  title: string;
  summary: string;
  sensitivity: CollaborationSharedContextSensitivity;
  created_at: string;
}

export interface WorkspaceDetailView {
  workspace: WorkspaceSafeView;
  members: MembershipSafeView[];
  decisions: DecisionSafeView[];
  commitments: CommitmentSafeView[];
  linked_actions: SafeActionView[];
  shared_context: SharedContextSafeView[];
  permissions: {
    can_view: boolean;
    can_contribute: boolean;
    can_approve: boolean;
    is_creator: boolean;
  };
  audit_summary: {
    created_at: string;
    member_count: number;
    decision_count: number;
    commitment_count: number;
    action_count: number;
  };
}

// ─── helpers ────────────────────────────────────────────────────

const TITLE_MAX_LENGTH = 200;
const DESCRIPTION_MAX_LENGTH = 2000;
const ROLE_LABEL_MAX_LENGTH = 200;
const RESPONSIBILITY_MAX_LENGTH = 500;
const TEXT_MAX_LENGTH = 2000;
const ASSIGNMENT_REASON_MAX_LENGTH = 800;
const SOURCE_EXCERPT_MAX_LENGTH = 1500;

function bound(value: string, max: number): string {
  return value.slice(0, max);
}

function projectWorkspace(row: {
  workspace_id: string;
  title: string;
  description: string | null;
  status: CollaborationWorkspaceStatus;
  visibility: CollaborationWorkspaceVisibility;
  source_type: CollaborationWorkspaceSourceType;
  source_conversation_id: string | null;
  created_by_entity_id: string;
  created_at: Date;
  updated_at: Date;
}): WorkspaceSafeView {
  return {
    workspace_id: row.workspace_id,
    title: row.title,
    description: row.description,
    status: row.status,
    visibility: row.visibility,
    source_type: row.source_type,
    source_conversation_id: row.source_conversation_id,
    created_by_entity_id: row.created_by_entity_id,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

function projectMembership(row: {
  membership_id: string;
  workspace_id: string;
  member_entity_id: string;
  member_display_name: string;
  member_email: string | null;
  role_label: string;
  responsibility_summary: string | null;
  member_type: CollaborationMembershipType;
  access_level: CollaborationMembershipAccessLevel;
  status: "ACTIVE" | "PENDING" | "REVOKED";
}): MembershipSafeView {
  return {
    membership_id: row.membership_id,
    workspace_id: row.workspace_id,
    member_entity_id: row.member_entity_id,
    member_display_name: row.member_display_name,
    member_email: row.member_email,
    role_label: row.role_label,
    responsibility_summary: row.responsibility_summary,
    member_type: row.member_type,
    access_level: row.access_level,
    status: row.status,
  };
}

function projectDecision(row: {
  decision_id: string;
  workspace_id: string;
  text: string;
  source_conversation_id: string | null;
  source_excerpt: string | null;
  created_at: Date;
}): DecisionSafeView {
  return {
    decision_id: row.decision_id,
    workspace_id: row.workspace_id,
    text: row.text,
    source_conversation_id: row.source_conversation_id,
    source_excerpt: row.source_excerpt,
    created_at: row.created_at.toISOString(),
  };
}

function projectCommitment(row: {
  commitment_id: string;
  workspace_id: string;
  owner_entity_id: string | null;
  owner_display_name: string;
  text: string;
  due_date: Date | null;
  source_conversation_id: string | null;
  source_excerpt: string | null;
  assignment_reason: string;
  confidence: CollaborationCommitmentConfidence;
  resolution_status: CollaborationCommitmentResolutionStatus;
  related_action_id: string | null;
  status: CollaborationCommitmentStatus;
}): CommitmentSafeView {
  return {
    commitment_id: row.commitment_id,
    workspace_id: row.workspace_id,
    owner_entity_id: row.owner_entity_id,
    owner_display_name: row.owner_display_name,
    text: row.text,
    due_date: row.due_date === null ? null : row.due_date.toISOString(),
    source_conversation_id: row.source_conversation_id,
    source_excerpt: row.source_excerpt,
    assignment_reason: row.assignment_reason,
    confidence: row.confidence,
    resolution_status: row.resolution_status,
    related_action_id: row.related_action_id,
    status: row.status,
  };
}

function projectSharedContext(row: {
  shared_context_id: string;
  workspace_id: string;
  context_type: CollaborationSharedContextType;
  context_ref_id: string | null;
  title: string;
  summary: string;
  sensitivity: CollaborationSharedContextSensitivity;
  created_at: Date;
}): SharedContextSafeView {
  return {
    shared_context_id: row.shared_context_id,
    workspace_id: row.workspace_id,
    context_type: row.context_type,
    context_ref_id: row.context_ref_id,
    title: row.title,
    summary: row.summary,
    sensitivity: row.sensitivity,
    created_at: row.created_at.toISOString(),
  };
}

// WHAT: Verify caller is an ACTIVE workspace member and load the
//       membership row. Used as the gate on every workspace read /
//       write (RULE 0 / RULE 9).
async function getCallerMembership(
  workspaceId: string,
  callerEntityId: string,
): Promise<{
  membership_id: string;
  access_level: CollaborationMembershipAccessLevel;
} | null> {
  const row = await prisma.collaborationMembership.findFirst({
    where: {
      workspace_id: workspaceId,
      member_entity_id: callerEntityId,
      status: "ACTIVE",
      deleted_at: null,
    },
    select: { membership_id: true, access_level: true },
  });
  return row;
}

// ─── service: create workspace ─────────────────────────────────

export interface CreateWorkspaceInput {
  callerEntityId: string;
  title: string;
  description?: string;
  visibility?: CollaborationWorkspaceVisibility;
  sourceType?: CollaborationWorkspaceSourceType;
  sourceConversationId?: string;
  initialMembers?: Array<{
    member_entity_id: string;
    role_label: string;
    responsibility_summary?: string;
    member_type?: CollaborationMembershipType;
    access_level?: CollaborationMembershipAccessLevel;
  }>;
}

export type CreateWorkspaceResult =
  | { ok: true; httpStatus: 201; workspace: WorkspaceSafeView; members: MembershipSafeView[] }
  | { ok: false; httpStatus: 400 | 403 | 404 | 422; code: string; message?: string };

export async function createCollaborationWorkspaceForCaller(
  input: CreateWorkspaceInput,
): Promise<CreateWorkspaceResult> {
  if (input.title.trim().length === 0) {
    return { ok: false, httpStatus: 422, code: "TITLE_REQUIRED" };
  }
  let orgEntityId: string;
  try {
    orgEntityId = await getOrgEntityId(input.callerEntityId);
  } catch {
    return { ok: false, httpStatus: 404, code: "NO_ORG_FOR_CALLER" };
  }
  const title = bound(input.title.trim(), TITLE_MAX_LENGTH);
  const description =
    input.description === undefined || input.description.trim().length === 0
      ? null
      : bound(input.description.trim(), DESCRIPTION_MAX_LENGTH);
  const visibility = input.visibility ?? "INTERNAL_ONLY";
  const sourceType = input.sourceType ?? "MANUAL";
  const sourceConversationId =
    input.sourceConversationId === undefined ? null : input.sourceConversationId;

  // Resolve initial-member display names from Entity.display_name +
  // EntityProfile.first_name/last_name. Same-org guard at the same
  // pass.
  const initial = input.initialMembers ?? [];
  const memberIds = Array.from(new Set(initial.map((m) => m.member_entity_id)));
  if (!memberIds.includes(input.callerEntityId)) {
    memberIds.push(input.callerEntityId);
  }
  const entities = await prisma.entity.findMany({
    where: { entity_id: { in: memberIds } },
    select: {
      entity_id: true,
      display_name: true,
    },
  });
  const entityById = new Map(entities.map((e) => [e.entity_id, e]));
  // Per-member org resolution via EntityMembership walk (Entity has
  // no direct org_entity_id column; we walk via getOrgEntityId).
  const memberOrgById = new Map<string, string | null>();
  for (const memberId of memberIds) {
    try {
      memberOrgById.set(memberId, await getOrgEntityId(memberId));
    } catch {
      memberOrgById.set(memberId, null);
    }
  }
  for (const memberId of memberIds) {
    const e = entityById.get(memberId);
    if (e === undefined) {
      return {
        ok: false,
        httpStatus: 404,
        code: "MEMBER_NOT_FOUND",
        message: "One of the requested members does not exist.",
      };
    }
    const memberOrg = memberOrgById.get(memberId) ?? null;
    if (memberOrg !== orgEntityId) {
      // External-member guard: only allow when workspace visibility
      // permits AND the request explicitly tagged the member EXTERNAL.
      const tagged = initial.find((m) => m.member_entity_id === memberId);
      const isExternal = tagged?.member_type === "EXTERNAL";
      if (!isExternal || visibility !== "EXTERNAL_ALLOWED") {
        await writeAuditEvent({
          event_type: "WORKSPACE_PERMISSION_BLOCKED",
          outcome: "DENIED",
          actor_entity_id: input.callerEntityId,
          details: {
            reason: "EXTERNAL_MEMBER_NOT_PERMITTED",
            requested_member_entity_id: memberId,
          },
        });
        return {
          ok: false,
          httpStatus: 403,
          code: "EXTERNAL_MEMBER_NOT_PERMITTED",
          message:
            "External collaborators require visibility=EXTERNAL_ALLOWED and member_type=EXTERNAL.",
        };
      }
    }
  }

  const workspace = await prisma.collaborationWorkspace.create({
    data: {
      org_entity_id: orgEntityId,
      title,
      description,
      created_by_entity_id: input.callerEntityId,
      visibility,
      source_type: sourceType,
      source_conversation_id: sourceConversationId,
      status: "ACTIVE",
    },
  });

  // Caller membership (APPROVE access by default — they created it).
  const callerEntity = entityById.get(input.callerEntityId);
  const callerDisplayName =
    callerEntity?.display_name ?? "(you)";
  const callerEmail: string | null = null;
  await prisma.collaborationMembership.create({
    data: {
      workspace_id: workspace.workspace_id,
      org_entity_id: orgEntityId,
      member_entity_id: input.callerEntityId,
      member_display_name: callerDisplayName,
      member_email: callerEmail,
      role_label: "Workspace creator",
      responsibility_summary: null,
      member_type: "INTERNAL",
      access_level: "APPROVE",
      status: "ACTIVE",
      invited_by_entity_id: input.callerEntityId,
      accepted_at: new Date(),
    },
  });

  // Initial-member rows.
  for (const m of initial) {
    if (m.member_entity_id === input.callerEntityId) continue;
    const e = entityById.get(m.member_entity_id);
    if (e === undefined) continue;
    await prisma.collaborationMembership.create({
      data: {
        workspace_id: workspace.workspace_id,
        org_entity_id: orgEntityId,
        member_entity_id: m.member_entity_id,
        member_display_name: e.display_name,
        member_email: null,
        role_label: bound(m.role_label, ROLE_LABEL_MAX_LENGTH),
        responsibility_summary:
          m.responsibility_summary === undefined
            ? null
            : bound(m.responsibility_summary, RESPONSIBILITY_MAX_LENGTH),
        member_type: m.member_type ?? "INTERNAL",
        access_level: m.access_level ?? "CONTRIBUTE",
        status: "ACTIVE",
        invited_by_entity_id: input.callerEntityId,
        accepted_at: new Date(),
      },
    });
    await writeAuditEvent({
      event_type: "WORKSPACE_MEMBER_ADDED",
      outcome: "SUCCESS",
      actor_entity_id: input.callerEntityId,
      target_entity_id: m.member_entity_id,
      details: {
        workspace_id: workspace.workspace_id,
        role_label: bound(m.role_label, ROLE_LABEL_MAX_LENGTH),
        member_type: m.member_type ?? "INTERNAL",
        access_level: m.access_level ?? "CONTRIBUTE",
      },
    });
  }

  await writeAuditEvent({
    event_type: "WORKSPACE_CREATED",
    outcome: "SUCCESS",
    actor_entity_id: input.callerEntityId,
    target_entity_id: input.callerEntityId,
    details: {
      workspace_id: workspace.workspace_id,
      visibility,
      source_type: sourceType,
    },
  });

  const memberships = await prisma.collaborationMembership.findMany({
    where: { workspace_id: workspace.workspace_id, deleted_at: null },
    orderBy: { created_at: "asc" },
  });
  return {
    ok: true,
    httpStatus: 201,
    workspace: projectWorkspace(workspace),
    members: memberships.map(projectMembership),
  };
}

// ─── service: list workspaces caller is a member of ────────────

export async function listCollaborationWorkspacesForCaller(
  callerEntityId: string,
): Promise<WorkspaceListItem[]> {
  const memberships = await prisma.collaborationMembership.findMany({
    where: {
      member_entity_id: callerEntityId,
      status: "ACTIVE",
      deleted_at: null,
    },
    select: { workspace_id: true },
  });
  const workspaceIds = memberships.map((m) => m.workspace_id);
  if (workspaceIds.length === 0) return [];
  const workspaces = await prisma.collaborationWorkspace.findMany({
    where: {
      workspace_id: { in: workspaceIds },
      deleted_at: null,
    },
    orderBy: { updated_at: "desc" },
  });
  const items: WorkspaceListItem[] = [];
  for (const w of workspaces) {
    const [memberCount, decisionCount, commitmentRows, actionRows] =
      await Promise.all([
        prisma.collaborationMembership.count({
          where: { workspace_id: w.workspace_id, deleted_at: null },
        }),
        prisma.collaborationDecision.count({
          where: { workspace_id: w.workspace_id, deleted_at: null },
        }),
        prisma.collaborationCommitment.findMany({
          where: { workspace_id: w.workspace_id, deleted_at: null },
          select: { status: true, related_action_id: true },
        }),
        prisma.action.findMany({
          where: {
            policy_envelope: {
              path: ["workspace_id"],
              equals: w.workspace_id,
            },
          },
          select: { status: true },
        }),
      ]);
    const open_actions = actionRows.filter(
      (a) =>
        a.status === "PROPOSED" ||
        a.status === "APPROVED" ||
        a.status === "SCHEDULED" ||
        a.status === "RUNNING",
    ).length;
    const completed_actions = actionRows.filter(
      (a) => a.status === "SUCCEEDED",
    ).length;
    items.push({
      ...projectWorkspace(w),
      counts: {
        members: memberCount,
        decisions: decisionCount,
        commitments: commitmentRows.length,
        open_actions,
        completed_actions,
      },
    });
  }
  return items;
}

// ─── service: workspace detail ─────────────────────────────────

export type GetWorkspaceDetailResult =
  | { ok: true; httpStatus: 200; detail: WorkspaceDetailView }
  | { ok: false; httpStatus: 403 | 404; code: string };

export async function getCollaborationWorkspaceDetailForCaller(
  workspaceId: string,
  callerEntityId: string,
): Promise<GetWorkspaceDetailResult> {
  const workspace = await prisma.collaborationWorkspace.findFirst({
    where: { workspace_id: workspaceId, deleted_at: null },
  });
  if (workspace === null) {
    return { ok: false, httpStatus: 404, code: "WORKSPACE_NOT_FOUND" };
  }
  const membership = await getCallerMembership(workspaceId, callerEntityId);
  if (membership === null) {
    return { ok: false, httpStatus: 403, code: "NOT_WORKSPACE_MEMBER" };
  }
  const [members, decisions, commitments, sharedContext] = await Promise.all([
    prisma.collaborationMembership.findMany({
      where: { workspace_id: workspaceId, deleted_at: null },
      orderBy: { created_at: "asc" },
    }),
    prisma.collaborationDecision.findMany({
      where: { workspace_id: workspaceId, deleted_at: null },
      orderBy: { created_at: "desc" },
    }),
    prisma.collaborationCommitment.findMany({
      where: { workspace_id: workspaceId, deleted_at: null },
      orderBy: { created_at: "desc" },
    }),
    prisma.collaborationSharedContext.findMany({
      where: { workspace_id: workspaceId, deleted_at: null },
      orderBy: { created_at: "desc" },
    }),
  ]);
  const actionIds = commitments
    .map((c) => c.related_action_id)
    .filter((id): id is string => id !== null);
  const actionRows =
    actionIds.length > 0
      ? await prisma.action.findMany({
          where: { action_id: { in: actionIds } },
          orderBy: { created_at: "desc" },
        })
      : [];
  const linkedActions = actionRows.map((a) => projectActionView(a));
  const detail: WorkspaceDetailView = {
    workspace: projectWorkspace(workspace),
    members: members.map(projectMembership),
    decisions: decisions.map(projectDecision),
    commitments: commitments.map(projectCommitment),
    linked_actions: linkedActions,
    shared_context: sharedContext.map(projectSharedContext),
    permissions: {
      can_view: true,
      can_contribute:
        membership.access_level === "CONTRIBUTE" ||
        membership.access_level === "APPROVE",
      can_approve: membership.access_level === "APPROVE",
      is_creator: workspace.created_by_entity_id === callerEntityId,
    },
    audit_summary: {
      created_at: workspace.created_at.toISOString(),
      member_count: members.length,
      decision_count: decisions.length,
      commitment_count: commitments.length,
      action_count: linkedActions.length,
    },
  };
  return { ok: true, httpStatus: 200, detail };
}

// ─── service: add member ───────────────────────────────────────

export interface AddMemberInput {
  workspaceId: string;
  callerEntityId: string;
  memberEntityId: string;
  roleLabel: string;
  responsibilitySummary?: string;
  memberType?: CollaborationMembershipType;
  accessLevel?: CollaborationMembershipAccessLevel;
  // [PROD-UX-ASSIGN] Org-admin assignment authority (the People &
  // Collaboration "Assign" flow). ROUTE-COMPUTED ONLY — never taken from a
  // client body. When true AND the workspace belongs to actorOrgEntityId's
  // org, the caller may add members without being a workspace member
  // themselves (mirrors the hierarchy-assign admin model). All other guards
  // (external-visibility, idempotency, audit) apply unchanged.
  actorIsOrgAdmin?: boolean;
  actorOrgEntityId?: string;
}

export type AddMemberResult =
  | { ok: true; httpStatus: 201; membership: MembershipSafeView; audit_event_id: string }
  | {
      ok: false;
      httpStatus: 403 | 404 | 409 | 422;
      code: string;
      message?: string;
      /** Present on ALREADY_MEMBER — the existing row (idempotent reads). */
      membership_id?: string;
    };

// WHAT: Archive a workspace the caller can approve in.
// WHY: [GAP-C] Reversibility parity with the project rail
//      (archiveWorkProjectForCaller): APPROVE-gated, idempotent
//      ALREADY_ARCHIVED, audited, never hard-deleted (RULE 10 — status
//      moves to ARCHIVED). Growth/assignment-targets already treat
//      non-ACTIVE workspaces as not-live, so archiving restores truth.
export interface ArchiveWorkspaceInput {
  callerEntityId: string;
  workspaceId: string;
}

export type ArchiveWorkspaceResult =
  | { ok: true; workspace: WorkspaceSafeView; audit_event_id: string }
  | {
      ok: false;
      httpStatus: 403 | 404 | 409;
      code: "WORKSPACE_NOT_FOUND" | "NOT_WORKSPACE_APPROVER" | "ALREADY_ARCHIVED";
      message?: string;
    };

export async function archiveCollaborationWorkspaceForCaller(
  input: ArchiveWorkspaceInput,
): Promise<ArchiveWorkspaceResult> {
  const workspace = await prisma.collaborationWorkspace.findFirst({
    where: { workspace_id: input.workspaceId, deleted_at: null },
  });
  if (workspace === null) {
    return { ok: false, httpStatus: 404, code: "WORKSPACE_NOT_FOUND" };
  }
  const callerMembership = await getCallerMembership(
    input.workspaceId,
    input.callerEntityId,
  );
  if (callerMembership === null || callerMembership.access_level !== "APPROVE") {
    return {
      ok: false,
      httpStatus: 403,
      code: "NOT_WORKSPACE_APPROVER",
      message: "Only someone with approve access in this workspace can archive it.",
    };
  }
  if (workspace.status === "ARCHIVED") {
    return { ok: false, httpStatus: 409, code: "ALREADY_ARCHIVED" };
  }
  const updated = await prisma.collaborationWorkspace.update({
    where: { workspace_id: input.workspaceId },
    data: { status: "ARCHIVED", archived_at: new Date() },
  });
  const audit = await writeAuditEvent({
    event_type: "ADMIN_ACTION",
    outcome: "SUCCESS",
    actor_entity_id: input.callerEntityId,
    target_entity_id: input.callerEntityId,
    details: {
      action: "COLLABORATION_WORKSPACE_ARCHIVED",
      workspace_id: input.workspaceId,
    },
  });
  return {
    ok: true,
    workspace: projectWorkspace(updated),
    audit_event_id: audit.audit_id,
  };
}

export async function addCollaborationMemberForCaller(
  input: AddMemberInput,
): Promise<AddMemberResult> {
  const workspace = await prisma.collaborationWorkspace.findFirst({
    where: { workspace_id: input.workspaceId, deleted_at: null },
  });
  if (workspace === null) {
    return { ok: false, httpStatus: 404, code: "WORKSPACE_NOT_FOUND" };
  }
  // [PROD-UX-ASSIGN] Org-admin authority: a route-verified org admin may add
  // members to any workspace of THEIR OWN org (both flags route-computed; the
  // org match is re-checked here so a mismatched override never bypasses the
  // membership gate). Otherwise the existing peer rule holds.
  const adminOverride =
    input.actorIsOrgAdmin === true &&
    typeof input.actorOrgEntityId === "string" &&
    input.actorOrgEntityId === workspace.org_entity_id;
  if (!adminOverride) {
    const callerMembership = await getCallerMembership(
      input.workspaceId,
      input.callerEntityId,
    );
    if (callerMembership === null) {
      return { ok: false, httpStatus: 403, code: "NOT_WORKSPACE_MEMBER" };
    }
    if (
      callerMembership.access_level !== "APPROVE" &&
      callerMembership.access_level !== "CONTRIBUTE"
    ) {
      return { ok: false, httpStatus: 403, code: "INSUFFICIENT_ACCESS_LEVEL" };
    }
  }
  const entity = await prisma.entity.findUnique({
    where: { entity_id: input.memberEntityId },
    select: {
      entity_id: true,
      display_name: true,
    },
  });
  if (entity === null) {
    return { ok: false, httpStatus: 404, code: "MEMBER_NOT_FOUND" };
  }
  const memberOrg = await (async () => {
    try {
      return await getOrgEntityId(input.memberEntityId);
    } catch {
      return null;
    }
  })();
  const memberType: CollaborationMembershipType =
    input.memberType ?? (memberOrg === workspace.org_entity_id ? "INTERNAL" : "EXTERNAL");
  if (
    memberType === "EXTERNAL" &&
    workspace.visibility !== "EXTERNAL_ALLOWED"
  ) {
    await writeAuditEvent({
      event_type: "WORKSPACE_PERMISSION_BLOCKED",
      outcome: "DENIED",
      actor_entity_id: input.callerEntityId,
      details: {
        workspace_id: input.workspaceId,
        reason: "EXTERNAL_NOT_PERMITTED",
      },
    });
    return {
      ok: false,
      httpStatus: 403,
      code: "EXTERNAL_NOT_PERMITTED",
      message:
        "Workspace visibility does not allow external collaborators.",
    };
  }
  const existing = await prisma.collaborationMembership.findFirst({
    where: {
      workspace_id: input.workspaceId,
      member_entity_id: input.memberEntityId,
    },
  });
  if (existing !== null && existing.deleted_at === null) {
    return { ok: false, httpStatus: 409, code: "ALREADY_MEMBER", membership_id: existing.membership_id };
  }
  const membership = await prisma.collaborationMembership.create({
    data: {
      workspace_id: input.workspaceId,
      org_entity_id: workspace.org_entity_id,
      member_entity_id: input.memberEntityId,
      member_display_name: entity.display_name,
      member_email: null,
      role_label: bound(input.roleLabel, ROLE_LABEL_MAX_LENGTH),
      responsibility_summary:
        input.responsibilitySummary === undefined
          ? null
          : bound(input.responsibilitySummary, RESPONSIBILITY_MAX_LENGTH),
      member_type: memberType,
      access_level: input.accessLevel ?? "CONTRIBUTE",
      status: "ACTIVE",
      invited_by_entity_id: input.callerEntityId,
      accepted_at: new Date(),
    },
  });
  const audit = await writeAuditEvent({
    event_type: "WORKSPACE_MEMBER_ADDED",
    outcome: "SUCCESS",
    actor_entity_id: input.callerEntityId,
    target_entity_id: input.memberEntityId,
    details: {
      workspace_id: input.workspaceId,
      role_label: bound(input.roleLabel, ROLE_LABEL_MAX_LENGTH),
      member_type: memberType,
      access_level: input.accessLevel ?? "CONTRIBUTE",
      // [PROD-UX-ASSIGN] Provenance: this add came through org-admin
      // assignment authority (People & Collaboration), not workspace peers.
      ...(adminOverride ? { via_org_admin: true, org_entity_id: workspace.org_entity_id } : {}),
    },
  });
  return {
    ok: true,
    httpStatus: 201,
    membership: projectMembership(membership),
    audit_event_id: audit.audit_id,
  };
}

// ─── service: import comms output (decisions + commitments) ────

export interface ImportCommsOutputInput {
  workspaceId: string;
  callerEntityId: string;
  summary?: string;
  decisions: ReadonlyArray<string>;
  commitments: ReadonlyArray<{
    text: string;
    source_excerpt: string;
  }>;
  sourceConversationId?: string;
}

export interface ImportCommsOutputResult {
  ok: true;
  httpStatus: 200;
  decisions: DecisionSafeView[];
  commitments: CommitmentSafeView[];
  shared_context: SharedContextSafeView | null;
}

export type ImportCommsResult =
  | ImportCommsOutputResult
  | { ok: false; httpStatus: 403 | 404; code: string };

export async function importCommsOutputForWorkspaceForCaller(
  input: ImportCommsOutputInput,
): Promise<ImportCommsResult> {
  const workspace = await prisma.collaborationWorkspace.findFirst({
    where: { workspace_id: input.workspaceId, deleted_at: null },
  });
  if (workspace === null) {
    return { ok: false, httpStatus: 404, code: "WORKSPACE_NOT_FOUND" };
  }
  const callerMembership = await getCallerMembership(
    input.workspaceId,
    input.callerEntityId,
  );
  if (callerMembership === null) {
    return { ok: false, httpStatus: 403, code: "NOT_WORKSPACE_MEMBER" };
  }

  // Build the resolver roster snapshot once.
  const members = await prisma.collaborationMembership.findMany({
    where: {
      workspace_id: input.workspaceId,
      status: "ACTIVE",
      deleted_at: null,
    },
  });
  const memberSnapshot: ResolverMemberSnapshot[] = members.map((m) => ({
    member_entity_id: m.member_entity_id,
    display_name: m.member_display_name,
    email: m.member_email,
    role_label: m.role_label,
    responsibility_summary: m.responsibility_summary,
    member_type: m.member_type,
    access_level: m.access_level,
  }));
  const orgRoster: ResolverRosterEntry[] = await (async () => {
    const childMemberships = await prisma.entityMembership.findMany({
      where: { parent_id: workspace.org_entity_id, is_active: true },
      select: { child_id: true },
    });
    const childIds = childMemberships.map((m) => m.child_id);
    if (childIds.length === 0) return [];
    const allEntities = await prisma.entity.findMany({
      where: { entity_id: { in: childIds }, status: "ACTIVE" },
      select: { entity_id: true, display_name: true },
    });
    return allEntities.map((e) => ({
      entity_id: e.entity_id,
      display_name: e.display_name,
    }));
  })();

  // Persist decisions.
  const decisionRows: Array<ReturnType<typeof projectDecision>> = [];
  for (const text of input.decisions) {
    const trimmed = bound(text.trim(), TEXT_MAX_LENGTH);
    if (trimmed.length === 0) continue;
    const row = await prisma.collaborationDecision.create({
      data: {
        workspace_id: input.workspaceId,
        org_entity_id: workspace.org_entity_id,
        text: trimmed,
        source_conversation_id: input.sourceConversationId ?? null,
        source_excerpt: null,
        added_by_entity_id: input.callerEntityId,
      },
    });
    decisionRows.push(projectDecision(row));
    await writeAuditEvent({
      event_type: "WORKSPACE_DECISION_ADDED",
      outcome: "SUCCESS",
      actor_entity_id: input.callerEntityId,
      details: {
        workspace_id: input.workspaceId,
        decision_id: row.decision_id,
      },
    });
  }

  // [T-2B] Governed external-commitment wire (the designed-but-dead path:
  // recordExternalCommitmentForCaller's docstring names THIS caller). When a
  // commitment's resolved owner name uniquely matches a GOVERNED external
  // collaborator LINKED TO THIS WORKSPACE (human-tracked, workspace-gated —
  // never a mention), ALSO record the ExternalCommitment with the source
  // conversation preserved, so T-1's external_context lights up on related
  // work rows ("Waiting on {name}"). External owner ⇒ EXTERNAL_OWES_INTERNAL.
  const externalLinks =
    workspace.visibility === "EXTERNAL_ALLOWED"
      ? await prisma.workspaceExternalMembership.findMany({
          where: { workspace_id: input.workspaceId },
          select: {
            external_collaborator: {
              select: {
                external_collaborator_id: true,
                display_name: true,
                deleted_at: true,
              },
            },
          },
        })
      : [];
  const governedExternalByName = new Map<string, string | null>();
  for (const link of externalLinks) {
    const c = link.external_collaborator;
    if (c.deleted_at !== null) continue;
    const key = c.display_name.trim().toLowerCase();
    // Ambiguous names (two linked externals sharing a name) map to null —
    // ambiguity never records an obligation.
    governedExternalByName.set(
      key,
      governedExternalByName.has(key) ? null : c.external_collaborator_id,
    );
  }

  // Persist commitments with resolver assignment.
  const commitmentRows: CommitmentSafeView[] = [];
  for (const c of input.commitments) {
    const trimmedText = bound(c.text.trim(), TEXT_MAX_LENGTH);
    if (trimmedText.length === 0) continue;
    const decision = resolveCommitmentAssignment({
      commitment_text: trimmedText,
      source_excerpt: c.source_excerpt,
      members: memberSnapshot,
      org_roster: orgRoster,
      external_allowed: workspace.visibility === "EXTERNAL_ALLOWED",
    });
    const row = await prisma.collaborationCommitment.create({
      data: {
        workspace_id: input.workspaceId,
        org_entity_id: workspace.org_entity_id,
        owner_entity_id: decision.owner_entity_id,
        owner_display_name: decision.owner_display_name,
        text: trimmedText,
        source_conversation_id: input.sourceConversationId ?? null,
        source_excerpt: bound(c.source_excerpt, SOURCE_EXCERPT_MAX_LENGTH),
        assignment_reason: bound(
          decision.assignment_reason,
          ASSIGNMENT_REASON_MAX_LENGTH,
        ),
        confidence: decision.confidence,
        resolution_status: decision.resolution_status,
        status: "PROPOSED",
        added_by_entity_id: input.callerEntityId,
      },
    });
    commitmentRows.push(projectCommitment(row));
    await writeAuditEvent({
      event_type: "WORKSPACE_COMMITMENT_ADDED",
      outcome: "SUCCESS",
      actor_entity_id: input.callerEntityId,
      target_entity_id: decision.owner_entity_id ?? input.callerEntityId,
      details: {
        workspace_id: input.workspaceId,
        commitment_id: row.commitment_id,
        confidence: decision.confidence,
        resolution_status: decision.resolution_status,
        assignment_source: decision.assignment_source,
      },
    });

    // [T-2B] the external-commitment record for a governed, workspace-linked
    // external owner (unique name match only; ambiguity records nothing).
    const externalId =
      decision.owner_display_name !== null
        ? governedExternalByName.get(decision.owner_display_name.trim().toLowerCase())
        : undefined;
    if (typeof externalId === "string") {
      await recordExternalCommitmentForCaller({
        workspaceId: input.workspaceId,
        externalCollaboratorId: externalId,
        orgEntityId: workspace.org_entity_id,
        callerEntityId: input.callerEntityId,
        text: trimmedText,
        direction: "EXTERNAL_OWES_INTERNAL",
        sourceConversationId: input.sourceConversationId ?? null,
        sourceExcerpt: c.source_excerpt,
        internalOwnerEntityId: null,
        confidence: decision.confidence,
      });
    }
  }

  // Persist a single COMMS_SUMMARY shared-context row when summary
  // text is present.
  let sharedContextRow: SharedContextSafeView | null = null;
  if (input.summary !== undefined && input.summary.trim().length > 0) {
    const row = await prisma.collaborationSharedContext.create({
      data: {
        workspace_id: input.workspaceId,
        org_entity_id: workspace.org_entity_id,
        context_type: "COMMS_SUMMARY",
        context_ref_id: input.sourceConversationId ?? null,
        title: bound("Conversation summary", TITLE_MAX_LENGTH),
        summary: bound(input.summary.trim(), TEXT_MAX_LENGTH),
        sensitivity: "INTERNAL",
        shared_by_entity_id: input.callerEntityId,
      },
    });
    sharedContextRow = projectSharedContext(row);
    await writeAuditEvent({
      event_type: "WORKSPACE_CONTEXT_SHARED",
      outcome: "SUCCESS",
      actor_entity_id: input.callerEntityId,
      details: {
        workspace_id: input.workspaceId,
        shared_context_id: row.shared_context_id,
        context_type: "COMMS_SUMMARY",
        sensitivity: "INTERNAL",
      },
    });
  }

  return {
    ok: true,
    httpStatus: 200,
    decisions: decisionRows,
    commitments: commitmentRows,
    shared_context: sharedContextRow,
  };
}

// ─── service: confirm commitment → governed Action ─────────────

export interface ConfirmCommitmentInput {
  workspaceId: string;
  commitmentId: string;
  callerEntityId: string;
  draftText?: string;
}

export type ConfirmCommitmentResult =
  | {
      ok: true;
      httpStatus: 200;
      commitment: CommitmentSafeView;
      action: SafeActionView;
    }
  | {
      ok: false;
      httpStatus: 400 | 401 | 403 | 404 | 409 | 422 | 503;
      code: string;
      message?: string;
    };

export async function confirmCommitmentForCaller(
  input: ConfirmCommitmentInput,
): Promise<ConfirmCommitmentResult> {
  const commitment = await prisma.collaborationCommitment.findFirst({
    where: {
      commitment_id: input.commitmentId,
      workspace_id: input.workspaceId,
      deleted_at: null,
    },
  });
  if (commitment === null) {
    return { ok: false, httpStatus: 404, code: "COMMITMENT_NOT_FOUND" };
  }
  const callerMembership = await getCallerMembership(
    input.workspaceId,
    input.callerEntityId,
  );
  if (callerMembership === null) {
    return { ok: false, httpStatus: 403, code: "NOT_WORKSPACE_MEMBER" };
  }
  if (
    callerMembership.access_level !== "APPROVE" &&
    callerMembership.access_level !== "CONTRIBUTE"
  ) {
    return { ok: false, httpStatus: 403, code: "INSUFFICIENT_ACCESS_LEVEL" };
  }
  if (commitment.resolution_status !== "RESOLVED") {
    return {
      ok: false,
      httpStatus: 422,
      code: "COMMITMENT_NOT_RESOLVED",
      message: "Set the owner before confirming this commitment.",
    };
  }
  if (commitment.owner_entity_id === null) {
    return {
      ok: false,
      httpStatus: 422,
      code: "COMMITMENT_NOT_RESOLVED",
      message: "Owner entity is unresolved.",
    };
  }
  if (commitment.related_action_id !== null) {
    return {
      ok: false,
      httpStatus: 409,
      code: "ALREADY_CONFIRMED",
      message: "This commitment was already confirmed.",
    };
  }

  const bodyDraft =
    input.draftText !== undefined && input.draftText.trim().length > 0
      ? bound(input.draftText.trim(), 1000)
      : `Otzar follow-up from your workspace: ${bound(commitment.text, 600)}`;

  const idempotencyKey = `wsf:${commitment.commitment_id}`;
  const actionResult = await createActionForCaller(input.callerEntityId, {
    action_type: "SEND_INTERNAL_NOTIFICATION",
    target_entity_id: commitment.owner_entity_id,
    idempotency_key: idempotencyKey,
    payload_summary: bodyDraft,
    payload_redacted: {
      recipient_entity_id: commitment.owner_entity_id,
      body_text: bodyDraft,
      workspace_id: input.workspaceId,
      commitment_id: commitment.commitment_id,
    },
  });
  if (actionResult.ok === false) {
    return {
      ok: false,
      httpStatus: actionResult.httpStatus,
      code: actionResult.code,
      ...(actionResult.message === undefined
        ? {}
        : { message: actionResult.message }),
    };
  }

  // Update commitment with related_action_id + state transitions.
  const updated = await prisma.collaborationCommitment.update({
    where: { commitment_id: commitment.commitment_id },
    data: {
      related_action_id: actionResult.view.action_id,
      status:
        actionResult.view.status === "SUCCEEDED"
          ? "COMPLETED"
          : "ACTION_CREATED",
    },
  });

  await writeAuditEvent({
    event_type: "WORKSPACE_COMMITMENT_CONFIRMED",
    outcome: "SUCCESS",
    actor_entity_id: input.callerEntityId,
    target_entity_id: commitment.owner_entity_id,
    details: {
      workspace_id: input.workspaceId,
      commitment_id: commitment.commitment_id,
      action_id: actionResult.view.action_id,
    },
  });
  await writeAuditEvent({
    event_type: "WORKSPACE_ACTION_LINKED",
    outcome: "SUCCESS",
    actor_entity_id: input.callerEntityId,
    details: {
      workspace_id: input.workspaceId,
      action_id: actionResult.view.action_id,
    },
  });

  return {
    ok: true,
    httpStatus: 200,
    commitment: projectCommitment(updated),
    action: actionResult.view,
  };
}

// ─── service: list workspace actions ──────────────────────────

export type ListWorkspaceActionsResult =
  | { ok: true; httpStatus: 200; actions: SafeActionView[] }
  | { ok: false; httpStatus: 403 | 404; code: string };

export async function listCollaborationWorkspaceActionsForCaller(
  workspaceId: string,
  callerEntityId: string,
): Promise<ListWorkspaceActionsResult> {
  const workspace = await prisma.collaborationWorkspace.findFirst({
    where: { workspace_id: workspaceId, deleted_at: null },
  });
  if (workspace === null) {
    return { ok: false, httpStatus: 404, code: "WORKSPACE_NOT_FOUND" };
  }
  const callerMembership = await getCallerMembership(workspaceId, callerEntityId);
  if (callerMembership === null) {
    return { ok: false, httpStatus: 403, code: "NOT_WORKSPACE_MEMBER" };
  }
  const commitments = await prisma.collaborationCommitment.findMany({
    where: { workspace_id: workspaceId, deleted_at: null },
    select: { related_action_id: true },
  });
  const actionIds = commitments
    .map((c) => c.related_action_id)
    .filter((id): id is string => id !== null);
  if (actionIds.length === 0) {
    return { ok: true, httpStatus: 200, actions: [] };
  }
  const rows = await prisma.action.findMany({
    where: { action_id: { in: actionIds } },
    orderBy: { created_at: "desc" },
  });
  return {
    ok: true,
    httpStatus: 200,
    actions: rows.map((a) => projectActionView(a)),
  };
}
