// FILE: external-collaborator.service.ts
// PURPOSE: Phase 1221 ADDENDUM — service layer for the
//          ExternalCollaborator / WorkspaceExternalMembership /
//          ExternalCommitment substrate.
//
// FOUNDER GOVERNANCE RULES (verbatim):
//   1. External people never auto-receive internal context.
//   2. Otzar may track an external participant internally without
//      inviting them.
//   3. Inviting requires policy approval if the workspace includes
//      sensitive context.
//   4. Sharing any conversation summary / decision / commitment /
//      document / memory / action with an external person must be
//      explicit and audited.
//   5. External collaborators can only see selected workspace
//      context.
//   6. They cannot see internal-only decisions, private memory,
//      unrelated projects, internal audit details, or other
//      employee context.
//   7. If an external person is mentioned in a meeting, Otzar
//      creates a TRACKED candidate, NOT auto-granting access.
//   9. If external follow-up is needed but external messaging is
//      not approved, create an INTERNAL SEND_INTERNAL_NOTIFICATION
//      to the internal owner — NEVER an external send.
//  10. No external email / Slack / Zoom message may be sent unless
//      connector + policy + approval allow it (deferred to
//      Phase 1225 / 1226).
//
// CONNECTS TO:
//   - collaboration-workspace.service.ts (workspace membership gate)
//   - action.service.ts (createActionForCaller for internal reminder)

import { writeAuditEvent } from "@niov/database";
import { prisma } from "@niov/database";
import type {
  ExternalCollaboratorStatus,
  ExternalCommitmentDirection,
  ExternalRelationshipType,
  ExternalRiskLevel,
  WorkspaceExternalAccessLevel,
} from "@prisma/client";
import { getOrgEntityId } from "../governance/org.js";
import { createActionForCaller } from "../action/action.service.js";
import {
  projectActionView,
  type SafeActionView,
} from "../action/views.js";

const TITLE_MAX_LENGTH = 200;
const SUMMARY_MAX_LENGTH = 1000;
const NAME_MAX_LENGTH = 200;
const EMAIL_MAX_LENGTH = 320;

function bound(value: string, max: number): string {
  return value.slice(0, max);
}

export interface ExternalCollaboratorSafeView {
  external_collaborator_id: string;
  display_name: string;
  email: string | null;
  company_name: string | null;
  relationship_type: ExternalRelationshipType;
  status: ExternalCollaboratorStatus;
  internal_owner_entity_id: string | null;
  purpose_summary: string | null;
  goals_summary: string | null;
  needs_from_us: string | null;
  we_need_from_them: string | null;
  risk_level: ExternalRiskLevel;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceExternalMembershipView {
  workspace_external_membership_id: string;
  workspace_id: string;
  external_collaborator: ExternalCollaboratorSafeView;
  access_level: WorkspaceExternalAccessLevel;
  status: ExternalCollaboratorStatus;
  project_role: string | null;
  internal_owner_entity_id: string | null;
  invited_at: string | null;
  approved_at: string | null;
  revoked_at: string | null;
}

export interface ExternalCommitmentSafeView {
  external_commitment_id: string;
  workspace_id: string;
  external_collaborator_id: string;
  external_collaborator_display_name: string;
  external_collaborator_company_name: string | null;
  direction: ExternalCommitmentDirection;
  text: string;
  due_date: string | null;
  source_excerpt: string | null;
  internal_owner_entity_id: string | null;
  related_action_id: string | null;
  status: "PROPOSED" | "CONFIRMED" | "ACTION_CREATED" | "COMPLETED" | "BLOCKED";
  confidence: "HIGH" | "MEDIUM" | "LOW";
}

function projectExternal(row: {
  external_collaborator_id: string;
  display_name: string;
  email: string | null;
  company_name: string | null;
  relationship_type: ExternalRelationshipType;
  status: ExternalCollaboratorStatus;
  internal_owner_entity_id: string | null;
  purpose_summary: string | null;
  goals_summary: string | null;
  needs_from_us: string | null;
  we_need_from_them: string | null;
  risk_level: ExternalRiskLevel;
  created_at: Date;
  updated_at: Date;
}): ExternalCollaboratorSafeView {
  return {
    external_collaborator_id: row.external_collaborator_id,
    display_name: row.display_name,
    email: row.email,
    company_name: row.company_name,
    relationship_type: row.relationship_type,
    status: row.status,
    internal_owner_entity_id: row.internal_owner_entity_id,
    purpose_summary: row.purpose_summary,
    goals_summary: row.goals_summary,
    needs_from_us: row.needs_from_us,
    we_need_from_them: row.we_need_from_them,
    risk_level: row.risk_level,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

async function getCallerWorkspaceAccess(
  workspaceId: string,
  callerEntityId: string,
): Promise<{ orgEntityId: string; canApprove: boolean; canContribute: boolean } | null> {
  const workspace = await prisma.collaborationWorkspace.findFirst({
    where: { workspace_id: workspaceId, deleted_at: null },
  });
  if (workspace === null) return null;
  const membership = await prisma.collaborationMembership.findFirst({
    where: {
      workspace_id: workspaceId,
      member_entity_id: callerEntityId,
      status: "ACTIVE",
      deleted_at: null,
    },
  });
  if (membership === null) return null;
  return {
    orgEntityId: workspace.org_entity_id,
    canApprove: membership.access_level === "APPROVE",
    canContribute:
      membership.access_level === "APPROVE" || membership.access_level === "CONTRIBUTE",
  };
}

// ─── service: track external collaborator ─────────────────────

export interface TrackExternalInput {
  workspaceId: string;
  callerEntityId: string;
  displayName: string;
  email?: string;
  companyName?: string;
  relationshipType?: ExternalRelationshipType;
  internalOwnerEntityId?: string;
  purposeSummary?: string;
  goalsSummary?: string;
  needsFromUs?: string;
  weNeedFromThem?: string;
  riskLevel?: ExternalRiskLevel;
  accessLevel?: WorkspaceExternalAccessLevel;
  projectRole?: string;
}

export type TrackExternalResult =
  | {
      ok: true;
      httpStatus: 201;
      external_collaborator: ExternalCollaboratorSafeView;
      workspace_membership: WorkspaceExternalMembershipView;
    }
  | { ok: false; httpStatus: 400 | 403 | 404 | 422; code: string; message?: string };

export async function trackExternalCollaboratorForCaller(
  input: TrackExternalInput,
): Promise<TrackExternalResult> {
  if (input.displayName.trim().length === 0) {
    return { ok: false, httpStatus: 422, code: "DISPLAY_NAME_REQUIRED" };
  }
  const access = await getCallerWorkspaceAccess(
    input.workspaceId,
    input.callerEntityId,
  );
  if (access === null) {
    return { ok: false, httpStatus: 403, code: "NOT_WORKSPACE_MEMBER" };
  }
  if (!access.canContribute) {
    return { ok: false, httpStatus: 403, code: "INSUFFICIENT_ACCESS_LEVEL" };
  }
  // Optional internal_owner validation — must be a workspace
  // member when supplied.
  if (input.internalOwnerEntityId !== undefined) {
    const ownerMembership = await prisma.collaborationMembership.findFirst({
      where: {
        workspace_id: input.workspaceId,
        member_entity_id: input.internalOwnerEntityId,
        status: "ACTIVE",
        deleted_at: null,
      },
    });
    if (ownerMembership === null) {
      return {
        ok: false,
        httpStatus: 422,
        code: "INTERNAL_OWNER_NOT_WORKSPACE_MEMBER",
        message:
          "internal_owner_entity_id must be a member of this workspace.",
      };
    }
  }
  const external = await prisma.externalCollaborator.create({
    data: {
      org_entity_id: access.orgEntityId,
      display_name: bound(input.displayName.trim(), NAME_MAX_LENGTH),
      email:
        input.email === undefined || input.email.trim().length === 0
          ? null
          : bound(input.email.trim(), EMAIL_MAX_LENGTH),
      company_name:
        input.companyName === undefined || input.companyName.trim().length === 0
          ? null
          : bound(input.companyName.trim(), NAME_MAX_LENGTH),
      relationship_type: input.relationshipType ?? "OTHER",
      status: "TRACKED_EXTERNAL",
      internal_owner_entity_id: input.internalOwnerEntityId ?? null,
      purpose_summary:
        input.purposeSummary === undefined
          ? null
          : bound(input.purposeSummary, SUMMARY_MAX_LENGTH),
      goals_summary:
        input.goalsSummary === undefined
          ? null
          : bound(input.goalsSummary, SUMMARY_MAX_LENGTH),
      needs_from_us:
        input.needsFromUs === undefined
          ? null
          : bound(input.needsFromUs, SUMMARY_MAX_LENGTH),
      we_need_from_them:
        input.weNeedFromThem === undefined
          ? null
          : bound(input.weNeedFromThem, SUMMARY_MAX_LENGTH),
      risk_level: input.riskLevel ?? "LOW",
      created_by_entity_id: input.callerEntityId,
    },
  });
  const wsem = await prisma.workspaceExternalMembership.create({
    data: {
      workspace_id: input.workspaceId,
      external_collaborator_id: external.external_collaborator_id,
      org_entity_id: access.orgEntityId,
      access_level: input.accessLevel ?? "NONE",
      status: "TRACKED_EXTERNAL",
      project_role:
        input.projectRole === undefined
          ? null
          : bound(input.projectRole, NAME_MAX_LENGTH),
      internal_owner_entity_id: input.internalOwnerEntityId ?? null,
      invited_by_entity_id: input.callerEntityId,
    },
  });
  await writeAuditEvent({
    event_type: "EXTERNAL_COLLABORATOR_TRACKED",
    outcome: "SUCCESS",
    actor_entity_id: input.callerEntityId,
    details: {
      external_collaborator_id: external.external_collaborator_id,
      workspace_id: input.workspaceId,
      relationship_type: external.relationship_type,
      company_name: external.company_name,
    },
  });
  return {
    ok: true,
    httpStatus: 201,
    external_collaborator: projectExternal(external),
    workspace_membership: {
      workspace_external_membership_id: wsem.workspace_external_membership_id,
      workspace_id: wsem.workspace_id,
      external_collaborator: projectExternal(external),
      access_level: wsem.access_level,
      status: wsem.status,
      project_role: wsem.project_role,
      internal_owner_entity_id: wsem.internal_owner_entity_id,
      invited_at: wsem.invited_at?.toISOString() ?? null,
      approved_at: wsem.approved_at?.toISOString() ?? null,
      revoked_at: wsem.revoked_at?.toISOString() ?? null,
    },
  };
}

// ─── service: list external collaborators in a workspace ──────

export async function listWorkspaceExternalCollaboratorsForCaller(
  workspaceId: string,
  callerEntityId: string,
): Promise<{
  ok: true;
  httpStatus: 200;
  workspace_memberships: WorkspaceExternalMembershipView[];
} | { ok: false; httpStatus: 403 | 404; code: string }> {
  const access = await getCallerWorkspaceAccess(workspaceId, callerEntityId);
  if (access === null) {
    return { ok: false, httpStatus: 403, code: "NOT_WORKSPACE_MEMBER" };
  }
  const wsems = await prisma.workspaceExternalMembership.findMany({
    where: { workspace_id: workspaceId, deleted_at: null },
    orderBy: { created_at: "desc" },
    include: { external_collaborator: true },
  });
  return {
    ok: true,
    httpStatus: 200,
    workspace_memberships: wsems.map((m) => ({
      workspace_external_membership_id: m.workspace_external_membership_id,
      workspace_id: m.workspace_id,
      external_collaborator: projectExternal(m.external_collaborator),
      access_level: m.access_level,
      status: m.status,
      project_role: m.project_role,
      internal_owner_entity_id: m.internal_owner_entity_id,
      invited_at: m.invited_at?.toISOString() ?? null,
      approved_at: m.approved_at?.toISOString() ?? null,
      revoked_at: m.revoked_at?.toISOString() ?? null,
    })),
  };
}

// ─── service: update external context map ────────────────────

export interface UpdateExternalContextInput {
  workspaceId: string;
  externalCollaboratorId: string;
  callerEntityId: string;
  purposeSummary?: string;
  goalsSummary?: string;
  needsFromUs?: string;
  weNeedFromThem?: string;
  internalOwnerEntityId?: string;
  riskLevel?: ExternalRiskLevel;
  projectRole?: string;
  allowedContextPolicy?: string;
}

export type UpdateExternalContextResult =
  | { ok: true; httpStatus: 200; external_collaborator: ExternalCollaboratorSafeView }
  | { ok: false; httpStatus: 403 | 404; code: string };

export async function updateExternalCollaboratorContextForCaller(
  input: UpdateExternalContextInput,
): Promise<UpdateExternalContextResult> {
  const access = await getCallerWorkspaceAccess(
    input.workspaceId,
    input.callerEntityId,
  );
  if (access === null) {
    return { ok: false, httpStatus: 403, code: "NOT_WORKSPACE_MEMBER" };
  }
  if (!access.canContribute) {
    return { ok: false, httpStatus: 403, code: "INSUFFICIENT_ACCESS_LEVEL" };
  }
  const existing = await prisma.externalCollaborator.findFirst({
    where: {
      external_collaborator_id: input.externalCollaboratorId,
      org_entity_id: access.orgEntityId,
      deleted_at: null,
    },
  });
  if (existing === null) {
    return {
      ok: false,
      httpStatus: 404,
      code: "EXTERNAL_COLLABORATOR_NOT_FOUND",
    };
  }
  const updated = await prisma.externalCollaborator.update({
    where: { external_collaborator_id: input.externalCollaboratorId },
    data: {
      ...(input.purposeSummary === undefined
        ? {}
        : { purpose_summary: bound(input.purposeSummary, SUMMARY_MAX_LENGTH) }),
      ...(input.goalsSummary === undefined
        ? {}
        : { goals_summary: bound(input.goalsSummary, SUMMARY_MAX_LENGTH) }),
      ...(input.needsFromUs === undefined
        ? {}
        : { needs_from_us: bound(input.needsFromUs, SUMMARY_MAX_LENGTH) }),
      ...(input.weNeedFromThem === undefined
        ? {}
        : {
            we_need_from_them: bound(input.weNeedFromThem, SUMMARY_MAX_LENGTH),
          }),
      ...(input.internalOwnerEntityId === undefined
        ? {}
        : { internal_owner_entity_id: input.internalOwnerEntityId }),
      ...(input.riskLevel === undefined ? {} : { risk_level: input.riskLevel }),
      ...(input.allowedContextPolicy === undefined
        ? {}
        : {
            allowed_context_policy: bound(
              input.allowedContextPolicy,
              SUMMARY_MAX_LENGTH,
            ),
          }),
    },
  });
  if (
    input.projectRole !== undefined ||
    input.internalOwnerEntityId !== undefined
  ) {
    await prisma.workspaceExternalMembership.updateMany({
      where: {
        workspace_id: input.workspaceId,
        external_collaborator_id: input.externalCollaboratorId,
      },
      data: {
        ...(input.projectRole === undefined
          ? {}
          : { project_role: bound(input.projectRole, NAME_MAX_LENGTH) }),
        ...(input.internalOwnerEntityId === undefined
          ? {}
          : { internal_owner_entity_id: input.internalOwnerEntityId }),
      },
    });
  }
  await writeAuditEvent({
    event_type: "EXTERNAL_COLLABORATOR_CONTEXT_UPDATED",
    outcome: "SUCCESS",
    actor_entity_id: input.callerEntityId,
    details: {
      external_collaborator_id: input.externalCollaboratorId,
      workspace_id: input.workspaceId,
    },
  });
  return {
    ok: true,
    httpStatus: 200,
    external_collaborator: projectExternal(updated),
  };
}

// ─── service: invite external collaborator ───────────────────

export interface InviteExternalInput {
  workspaceId: string;
  externalCollaboratorId: string;
  callerEntityId: string;
  accessLevel?: WorkspaceExternalAccessLevel;
}

export type InviteExternalResult =
  | {
      ok: true;
      httpStatus: 200;
      workspace_membership: WorkspaceExternalMembershipView;
    }
  | {
      ok: false;
      httpStatus: 403 | 404 | 409 | 422;
      code: string;
      message?: string;
    };

export async function inviteExternalCollaboratorForCaller(
  input: InviteExternalInput,
): Promise<InviteExternalResult> {
  const access = await getCallerWorkspaceAccess(
    input.workspaceId,
    input.callerEntityId,
  );
  if (access === null) {
    return { ok: false, httpStatus: 403, code: "NOT_WORKSPACE_MEMBER" };
  }
  if (!access.canApprove) {
    return {
      ok: false,
      httpStatus: 403,
      code: "APPROVAL_REQUIRED",
      message:
        "Inviting an external collaborator requires APPROVE access in this workspace.",
    };
  }
  const workspace = await prisma.collaborationWorkspace.findUnique({
    where: { workspace_id: input.workspaceId },
  });
  if (workspace === null) {
    return { ok: false, httpStatus: 404, code: "WORKSPACE_NOT_FOUND" };
  }
  if (workspace.visibility !== "EXTERNAL_ALLOWED") {
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
  const wsem = await prisma.workspaceExternalMembership.findFirst({
    where: {
      workspace_id: input.workspaceId,
      external_collaborator_id: input.externalCollaboratorId,
      deleted_at: null,
    },
    include: { external_collaborator: true },
  });
  if (wsem === null) {
    return {
      ok: false,
      httpStatus: 404,
      code: "EXTERNAL_COLLABORATOR_NOT_TRACKED",
    };
  }
  if (wsem.status === "ACTIVE_EXTERNAL") {
    return {
      ok: false,
      httpStatus: 409,
      code: "ALREADY_ACTIVE",
    };
  }
  const updated = await prisma.workspaceExternalMembership.update({
    where: {
      workspace_external_membership_id: wsem.workspace_external_membership_id,
    },
    data: {
      status: "INVITED_EXTERNAL",
      access_level: input.accessLevel ?? "VIEW_SHARED",
      invited_by_entity_id: input.callerEntityId,
      invited_at: new Date(),
    },
    include: { external_collaborator: true },
  });
  await prisma.externalCollaborator.update({
    where: { external_collaborator_id: input.externalCollaboratorId },
    data: { status: "INVITED_EXTERNAL" },
  });
  await writeAuditEvent({
    event_type: "EXTERNAL_COLLABORATOR_INVITED",
    outcome: "SUCCESS",
    actor_entity_id: input.callerEntityId,
    details: {
      external_collaborator_id: input.externalCollaboratorId,
      workspace_id: input.workspaceId,
      access_level: updated.access_level,
    },
  });
  return {
    ok: true,
    httpStatus: 200,
    workspace_membership: {
      workspace_external_membership_id: updated.workspace_external_membership_id,
      workspace_id: updated.workspace_id,
      external_collaborator: projectExternal(updated.external_collaborator),
      access_level: updated.access_level,
      status: updated.status,
      project_role: updated.project_role,
      internal_owner_entity_id: updated.internal_owner_entity_id,
      invited_at: updated.invited_at?.toISOString() ?? null,
      approved_at: updated.approved_at?.toISOString() ?? null,
      revoked_at: updated.revoked_at?.toISOString() ?? null,
    },
  };
}

// ─── service: revoke external collaborator ───────────────────

export type RevokeExternalResult =
  | { ok: true; httpStatus: 200 }
  | { ok: false; httpStatus: 403 | 404; code: string };

export async function revokeExternalCollaboratorForCaller(input: {
  workspaceId: string;
  externalCollaboratorId: string;
  callerEntityId: string;
}): Promise<RevokeExternalResult> {
  const access = await getCallerWorkspaceAccess(
    input.workspaceId,
    input.callerEntityId,
  );
  if (access === null) {
    return { ok: false, httpStatus: 403, code: "NOT_WORKSPACE_MEMBER" };
  }
  if (!access.canApprove) {
    return { ok: false, httpStatus: 403, code: "APPROVAL_REQUIRED" };
  }
  const wsem = await prisma.workspaceExternalMembership.findFirst({
    where: {
      workspace_id: input.workspaceId,
      external_collaborator_id: input.externalCollaboratorId,
      deleted_at: null,
    },
  });
  if (wsem === null) {
    return {
      ok: false,
      httpStatus: 404,
      code: "EXTERNAL_COLLABORATOR_NOT_TRACKED",
    };
  }
  await prisma.workspaceExternalMembership.update({
    where: {
      workspace_external_membership_id: wsem.workspace_external_membership_id,
    },
    data: {
      status: "REVOKED_EXTERNAL",
      access_level: "NONE",
      revoked_at: new Date(),
    },
  });
  await prisma.externalCollaborator.update({
    where: { external_collaborator_id: input.externalCollaboratorId },
    data: { status: "REVOKED_EXTERNAL" },
  });
  await writeAuditEvent({
    event_type: "EXTERNAL_COLLABORATOR_REVOKED",
    outcome: "SUCCESS",
    actor_entity_id: input.callerEntityId,
    details: {
      external_collaborator_id: input.externalCollaboratorId,
      workspace_id: input.workspaceId,
    },
  });
  return { ok: true, httpStatus: 200 };
}

// ─── service: list external commitments for a workspace ──────

export async function listExternalCommitmentsForCaller(
  workspaceId: string,
  callerEntityId: string,
): Promise<
  | {
      ok: true;
      httpStatus: 200;
      external_commitments: ExternalCommitmentSafeView[];
    }
  | { ok: false; httpStatus: 403 | 404; code: string }
> {
  const access = await getCallerWorkspaceAccess(workspaceId, callerEntityId);
  if (access === null) {
    return { ok: false, httpStatus: 403, code: "NOT_WORKSPACE_MEMBER" };
  }
  const rows = await prisma.externalCommitment.findMany({
    where: { workspace_id: workspaceId, deleted_at: null },
    include: { external_collaborator: true },
    orderBy: { created_at: "desc" },
  });
  return {
    ok: true,
    httpStatus: 200,
    external_commitments: rows.map((r) => ({
      external_commitment_id: r.external_commitment_id,
      workspace_id: r.workspace_id,
      external_collaborator_id: r.external_collaborator_id,
      external_collaborator_display_name: r.external_collaborator.display_name,
      external_collaborator_company_name: r.external_collaborator.company_name,
      direction: r.direction,
      text: r.text,
      due_date: r.due_date?.toISOString() ?? null,
      source_excerpt: r.source_excerpt,
      internal_owner_entity_id: r.internal_owner_entity_id,
      related_action_id: r.related_action_id,
      status: r.status,
      confidence: r.confidence,
    })),
  };
}

// ─── service: create internal follow-up reminder for external ─

export interface CreateExternalFollowupInput {
  workspaceId: string;
  externalCommitmentId: string;
  callerEntityId: string;
  internalOwnerEntityId?: string;
  draftText?: string;
}

export type CreateExternalFollowupResult =
  | {
      ok: true;
      httpStatus: 200;
      action: SafeActionView;
      external_commitment: ExternalCommitmentSafeView;
    }
  | {
      ok: false;
      httpStatus: 400 | 401 | 403 | 404 | 409 | 422 | 503;
      code: string;
      message?: string;
    };

export async function createInternalFollowupForExternalCommitmentForCaller(
  input: CreateExternalFollowupInput,
): Promise<CreateExternalFollowupResult> {
  const commitment = await prisma.externalCommitment.findFirst({
    where: {
      external_commitment_id: input.externalCommitmentId,
      workspace_id: input.workspaceId,
      deleted_at: null,
    },
    include: { external_collaborator: true },
  });
  if (commitment === null) {
    return {
      ok: false,
      httpStatus: 404,
      code: "EXTERNAL_COMMITMENT_NOT_FOUND",
    };
  }
  const access = await getCallerWorkspaceAccess(
    input.workspaceId,
    input.callerEntityId,
  );
  if (access === null) {
    return { ok: false, httpStatus: 403, code: "NOT_WORKSPACE_MEMBER" };
  }
  if (!access.canContribute) {
    return { ok: false, httpStatus: 403, code: "INSUFFICIENT_ACCESS_LEVEL" };
  }
  if (commitment.related_action_id !== null) {
    return { ok: false, httpStatus: 409, code: "ALREADY_REMINDED" };
  }
  const targetEntityId =
    input.internalOwnerEntityId ?? commitment.internal_owner_entity_id;
  if (targetEntityId === null) {
    return {
      ok: false,
      httpStatus: 422,
      code: "NO_INTERNAL_OWNER",
      message:
        "Set an internal owner before creating a follow-up reminder.",
    };
  }
  const externalName = commitment.external_collaborator.display_name;
  const externalCompany = commitment.external_collaborator.company_name;
  const draft =
    input.draftText !== undefined && input.draftText.trim().length > 0
      ? bound(input.draftText.trim(), 1000)
      : commitment.direction === "EXTERNAL_OWES_INTERNAL"
        ? `Reminder: follow up with ${externalName}${externalCompany === null ? "" : ` (${externalCompany})`} about: ${bound(commitment.text, 500)}.`
        : `Reminder: we owe ${externalName}${externalCompany === null ? "" : ` (${externalCompany})`}: ${bound(commitment.text, 500)}.`;
  const idempotencyKey = `wxc:${commitment.external_commitment_id}`;
  const actionResult = await createActionForCaller(input.callerEntityId, {
    action_type: "SEND_INTERNAL_NOTIFICATION",
    target_entity_id: targetEntityId,
    idempotency_key: idempotencyKey,
    payload_summary: draft,
    payload_redacted: {
      recipient_entity_id: targetEntityId,
      body_text: draft,
      workspace_id: input.workspaceId,
      external_commitment_id: commitment.external_commitment_id,
      external_collaborator_id: commitment.external_collaborator_id,
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
  const updated = await prisma.externalCommitment.update({
    where: { external_commitment_id: commitment.external_commitment_id },
    data: {
      related_action_id: actionResult.view.action_id,
      ...(input.internalOwnerEntityId === undefined
        ? {}
        : { internal_owner_entity_id: input.internalOwnerEntityId }),
      status:
        actionResult.view.status === "SUCCEEDED"
          ? "COMPLETED"
          : "ACTION_CREATED",
    },
    include: { external_collaborator: true },
  });
  await writeAuditEvent({
    event_type: "EXTERNAL_FOLLOWUP_REMINDED",
    outcome: "SUCCESS",
    actor_entity_id: input.callerEntityId,
    target_entity_id: targetEntityId,
    details: {
      workspace_id: input.workspaceId,
      external_collaborator_id: commitment.external_collaborator_id,
      external_commitment_id: commitment.external_commitment_id,
      action_id: actionResult.view.action_id,
      direction: commitment.direction,
    },
  });
  return {
    ok: true,
    httpStatus: 200,
    action: actionResult.view,
    external_commitment: {
      external_commitment_id: updated.external_commitment_id,
      workspace_id: updated.workspace_id,
      external_collaborator_id: updated.external_collaborator_id,
      external_collaborator_display_name:
        updated.external_collaborator.display_name,
      external_collaborator_company_name:
        updated.external_collaborator.company_name,
      direction: updated.direction,
      text: updated.text,
      due_date: updated.due_date?.toISOString() ?? null,
      source_excerpt: updated.source_excerpt,
      internal_owner_entity_id: updated.internal_owner_entity_id,
      related_action_id: updated.related_action_id,
      status: updated.status,
      confidence: updated.confidence,
    },
  };
}

// ─── helper used by collaboration-workspace.service ──────────

/**
 * Record an ExternalCommitment row when the resolver detects an
 * external owner. Called by importCommsOutputForWorkspaceForCaller
 * for commitments where the resolver classifies external. Audit
 * emit BEFORE returning.
 */
export async function recordExternalCommitmentForCaller(input: {
  workspaceId: string;
  externalCollaboratorId: string;
  orgEntityId: string;
  callerEntityId: string;
  text: string;
  direction: ExternalCommitmentDirection;
  sourceConversationId: string | null;
  sourceExcerpt: string;
  internalOwnerEntityId: string | null;
  confidence: "HIGH" | "MEDIUM" | "LOW";
}): Promise<ExternalCommitmentSafeView> {
  const row = await prisma.externalCommitment.create({
    data: {
      workspace_id: input.workspaceId,
      org_entity_id: input.orgEntityId,
      external_collaborator_id: input.externalCollaboratorId,
      direction: input.direction,
      text: bound(input.text, 2000),
      source_conversation_id: input.sourceConversationId,
      source_excerpt: bound(input.sourceExcerpt, 1500),
      internal_owner_entity_id: input.internalOwnerEntityId,
      status: "PROPOSED",
      confidence: input.confidence,
      added_by_entity_id: input.callerEntityId,
    },
    include: { external_collaborator: true },
  });
  await writeAuditEvent({
    event_type: "EXTERNAL_COMMITMENT_RECORDED",
    outcome: "SUCCESS",
    actor_entity_id: input.callerEntityId,
    details: {
      workspace_id: input.workspaceId,
      external_collaborator_id: input.externalCollaboratorId,
      external_commitment_id: row.external_commitment_id,
      direction: row.direction,
      confidence: input.confidence,
    },
  });
  return {
    external_commitment_id: row.external_commitment_id,
    workspace_id: row.workspace_id,
    external_collaborator_id: row.external_collaborator_id,
    external_collaborator_display_name: row.external_collaborator.display_name,
    external_collaborator_company_name: row.external_collaborator.company_name,
    direction: row.direction,
    text: row.text,
    due_date: row.due_date?.toISOString() ?? null,
    source_excerpt: row.source_excerpt,
    internal_owner_entity_id: row.internal_owner_entity_id,
    related_action_id: row.related_action_id,
    status: row.status,
    confidence: row.confidence,
  };
}

// Re-export the projectActionView so route handlers can convert.
export { projectActionView };
