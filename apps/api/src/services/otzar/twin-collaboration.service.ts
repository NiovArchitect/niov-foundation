// FILE: twin-collaboration.service.ts
// PURPOSE: Phase EDX-6 PR 1 — Twin Collaboration Request substrate
//          per the [FOUNDER-AUTH — AUTONOMOUS EMPLOYEE DGI
//          STRUCTURAL RUNTIME COMPLETION] directive. Pure-function
//          service for create / list (inbound / outbound) /
//          accept / reject / cancel / complete on
//          TwinCollaborationRequest rows.
//
//          Service-only at this slice — routes + MyTwinView
//          integration + ConductSession integration land in
//          subsequent EDX-6 PRs.
//
// PRIVACY INVARIANT:
//   - SafeView projection excludes workflow_id / action_id /
//     approval_grant_id (FK breadcrumbs; safe surfaces don't carry
//     them by default).
//   - Same-org guard enforced at create time (target must be in
//     the same org as requester).
//   - Caller is always the requester at create (RULE 0). Caller is
//     always the target at accept/reject (cross-tenant guard).
//   - safe_summary bounded to prevent raw-transcript collection.
//
// CONNECTS TO:
//   - packages/database (prisma.twinCollaborationRequest +
//     prisma.entity / entityMembership for cross-org guard)
//   - packages/database/src/queries/audit.ts (ADMIN_ACTION +
//     details.action discriminator pattern)
//   - apps/api/src/services/otzar/otzar.service.ts (forward-
//     substrate sidecar wiring in PR 3)

import { writeAuditEvent } from "@niov/database";
import type {
  TwinAuthoritySensitivityClass,
  TwinCollaborationBlockedReason,
  TwinCollaborationRequestType,
  TwinCollaborationState,
  TwinCollaborationTargetType,
} from "@prisma/client";
import { prisma } from "@niov/database";
import { isActiveProjectMember } from "./work-project.service.js";

export type {
  TwinCollaborationBlockedReason,
  TwinCollaborationRequestType,
  TwinCollaborationState,
  TwinCollaborationTargetType,
};

const SAFE_SUMMARY_MAX_LENGTH = 500;
const LIST_TAKE_CAP = 100;

// WHAT: Inputs for createTwinCollaborationRequestForCaller.
export interface CreateCollaborationRequestInput {
  callerEntityId: string;
  orgEntityId: string;
  targetType: TwinCollaborationTargetType;
  requestType: TwinCollaborationRequestType;
  safeSummary: string;
  targetEntityId?: string | null;
  targetTwinEntityId?: string | null;
  targetTeamId?: string | null;
  targetProjectId?: string | null;
  workflowId?: string | null;
  actionId?: string | null;
  requesterTwinEntityId?: string | null;
  requestedByAi?: boolean;
  requiresApproval?: boolean;
  approvalGrantId?: string | null;
  sensitivityClass?: TwinAuthoritySensitivityClass;
  expiresAt?: Date | null;
}

// WHAT: Safe employee-facing projection of a collaboration request.
// WHY: Excludes workflow_id / action_id / approval_grant_id from
//      the default surface — these are FK breadcrumbs that the
//      route surface can opt to include later under explicit
//      escalation paths. requires_approval / blocked_reason /
//      completed_at + the open state machine fields ARE surfaced
//      so the UI can render the inbox / outbox row honestly.
export interface CollaborationRequestSafeView {
  collaboration_id: string;
  target_type: TwinCollaborationTargetType;
  request_type: TwinCollaborationRequestType;
  state: TwinCollaborationState;
  sensitivity_class: TwinAuthoritySensitivityClass;
  safe_summary: string;
  requested_by_ai: boolean;
  requires_approval: boolean;
  blocked_reason: TwinCollaborationBlockedReason | null;
  has_target_entity: boolean;
  has_target_twin: boolean;
  has_target_team: boolean;
  has_target_project: boolean;
  expires_at: string | null;
  completed_at: string | null;
  created_at: string;
}

// WHAT: Inputs for the inbound / outbound list helpers.
export interface ListCollaborationRequestsInput {
  callerEntityId: string;
  state?: TwinCollaborationState;
  take?: number;
}

// WHAT: Transition result discriminated by ok.
export type CollaborationTransitionResult =
  | { ok: true; collaboration: CollaborationRequestSafeView }
  | {
      ok: false;
      code:
        | "COLLABORATION_NOT_FOUND"
        | "NOT_REQUESTER"
        | "NOT_TARGET"
        | "INVALID_STATE_TRANSITION"
        | "CROSS_ORG_DENIED"
        | "TARGET_NOT_FOUND";
    };

// WHAT: Map a raw row to the safe employee-facing projection.
export function projectCollaborationRequestSafeView(row: {
  collaboration_id: string;
  target_type: TwinCollaborationTargetType;
  request_type: TwinCollaborationRequestType;
  state: TwinCollaborationState;
  sensitivity_class: TwinAuthoritySensitivityClass;
  safe_summary: string;
  requested_by_ai: boolean;
  requires_approval: boolean;
  blocked_reason: TwinCollaborationBlockedReason | null;
  target_entity_id: string | null;
  target_twin_entity_id: string | null;
  target_team_id: string | null;
  target_project_id: string | null;
  expires_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
}): CollaborationRequestSafeView {
  return {
    collaboration_id: row.collaboration_id,
    target_type: row.target_type,
    request_type: row.request_type,
    state: row.state,
    sensitivity_class: row.sensitivity_class,
    safe_summary: row.safe_summary,
    requested_by_ai: row.requested_by_ai,
    requires_approval: row.requires_approval,
    blocked_reason: row.blocked_reason,
    has_target_entity: row.target_entity_id !== null,
    has_target_twin: row.target_twin_entity_id !== null,
    has_target_team: row.target_team_id !== null,
    has_target_project: row.target_project_id !== null,
    expires_at: row.expires_at?.toISOString() ?? null,
    completed_at: row.completed_at?.toISOString() ?? null,
    created_at: row.created_at.toISOString(),
  };
}

// WHAT: Same-org guard for a candidate target_entity_id. Returns
//        true iff the candidate is a member (parent_id =
//        orgEntityId) OR is the org itself.
async function isSameOrgEntity(
  candidateEntityId: string,
  orgEntityId: string,
): Promise<boolean> {
  if (candidateEntityId === orgEntityId) return true;
  const found = await prisma.entityMembership.findFirst({
    where: {
      parent_id: orgEntityId,
      child_id: candidateEntityId,
      is_active: true,
    },
    select: { child_id: true },
  });
  return found !== null;
}

// WHAT: Create a collaboration request on behalf of the caller.
// INPUT: CreateCollaborationRequestInput.
// OUTPUT: CollaborationTransitionResult.
// WHY: Caller is always requester (RULE 0). Same-org guard at the
//      service tier — if target_entity_id or target_twin_entity_id
//      is provided and resolves outside org, returns CROSS_ORG_DENIED.
//      requires_approval=true initializes state=NEEDS_APPROVAL.
//      Emits ADMIN_ACTION + details.action = "TWIN_COLLABORATION_REQUESTED"
//      BEFORE returning (RULE 4).
export async function createTwinCollaborationRequestForCaller(
  input: CreateCollaborationRequestInput,
): Promise<CollaborationTransitionResult> {
  const safeSummary = input.safeSummary.slice(0, SAFE_SUMMARY_MAX_LENGTH);
  const sensitivity = input.sensitivityClass ?? "MODERATE";
  const requestedByAi = input.requestedByAi ?? false;
  const requiresApproval = input.requiresApproval ?? false;

  // Cross-org guards. Only check candidate IDs that were provided.
  if (input.targetEntityId !== undefined && input.targetEntityId !== null) {
    const inOrg = await isSameOrgEntity(
      input.targetEntityId,
      input.orgEntityId,
    );
    if (!inOrg) return { ok: false, code: "CROSS_ORG_DENIED" };
  }
  if (
    input.targetTwinEntityId !== undefined &&
    input.targetTwinEntityId !== null
  ) {
    const inOrg = await isSameOrgEntity(
      input.targetTwinEntityId,
      input.orgEntityId,
    );
    if (!inOrg) return { ok: false, code: "CROSS_ORG_DENIED" };
  }

  // TARGET_NOT_FOUND when the caller declared a target_type that
  // implies an entity / twin / team / project but no id was given.
  if (
    input.targetType === "EMPLOYEE" &&
    (input.targetEntityId === undefined || input.targetEntityId === null)
  ) {
    return { ok: false, code: "TARGET_NOT_FOUND" };
  }
  if (
    input.targetType === "EMPLOYEE_TWIN" &&
    (input.targetTwinEntityId === undefined ||
      input.targetTwinEntityId === null)
  ) {
    return { ok: false, code: "TARGET_NOT_FOUND" };
  }
  if (
    input.targetType === "TEAM" &&
    (input.targetTeamId === undefined || input.targetTeamId === null)
  ) {
    return { ok: false, code: "TARGET_NOT_FOUND" };
  }
  if (
    input.targetType === "PROJECT" &&
    (input.targetProjectId === undefined || input.targetProjectId === null)
  ) {
    return { ok: false, code: "TARGET_NOT_FOUND" };
  }

  // Phase 1 PR 4 — project membership guard for PROJECT target_type.
  // When the request explicitly names a target_project_id, the
  // caller (requester) must be an ACTIVE-project member. Missing
  // membership creates a BLOCKED row with the closed-vocab
  // blocked_reason rather than rejecting the create — per the
  // directive, "if missing membership, return blocked_reason
  // MISSING_PROJECT_MEMBERSHIP". This lets the UI render the
  // blocked-row state with the closed-vocab reason instead of a
  // 4xx silently dropping the user's intent.
  let projectMembershipBlocked = false;
  if (
    input.targetType === "PROJECT" &&
    typeof input.targetProjectId === "string"
  ) {
    const isMember = await isActiveProjectMember({
      projectId: input.targetProjectId,
      entityId: input.callerEntityId,
    });
    if (!isMember) {
      projectMembershipBlocked = true;
    }
  }

  const initialState: TwinCollaborationState = projectMembershipBlocked
    ? "BLOCKED"
    : requiresApproval
      ? "NEEDS_APPROVAL"
      : "REQUESTED";
  const initialBlockedReason: TwinCollaborationBlockedReason | null =
    projectMembershipBlocked ? "MISSING_PROJECT_MEMBERSHIP" : null;

  const row = await prisma.twinCollaborationRequest.create({
    data: {
      org_entity_id: input.orgEntityId,
      requester_entity_id: input.callerEntityId,
      requester_twin_entity_id: input.requesterTwinEntityId ?? null,
      target_entity_id: input.targetEntityId ?? null,
      target_twin_entity_id: input.targetTwinEntityId ?? null,
      target_team_id: input.targetTeamId ?? null,
      target_project_id: input.targetProjectId ?? null,
      workflow_id: input.workflowId ?? null,
      action_id: input.actionId ?? null,
      request_type: input.requestType,
      target_type: input.targetType,
      state: initialState,
      sensitivity_class: sensitivity,
      safe_summary: safeSummary,
      requested_by_ai: requestedByAi,
      requires_approval: requiresApproval,
      approval_grant_id: input.approvalGrantId ?? null,
      blocked_reason: initialBlockedReason,
      expires_at: input.expiresAt ?? null,
    },
  });

  await writeAuditEvent({
    event_type: "ADMIN_ACTION",
    outcome: "SUCCESS",
    actor_entity_id: input.callerEntityId,
    target_entity_id: input.targetEntityId ?? input.callerEntityId,
    details: {
      action: "TWIN_COLLABORATION_REQUESTED",
      collaboration_id: row.collaboration_id,
      request_type: row.request_type,
      target_type: row.target_type,
      state: row.state,
      requested_by_ai: row.requested_by_ai,
      requires_approval: row.requires_approval,
    },
  });

  return {
    ok: true,
    collaboration: projectCollaborationRequestSafeView(row),
  };
}

// WHAT: List collaboration requests where the caller is the target.
// WHY: The inbox surface — what other people / Twins are asking
//      *me* to do.
export async function listInboundCollaborationRequestsForCaller(
  input: ListCollaborationRequestsInput,
): Promise<CollaborationRequestSafeView[]> {
  const take = Math.min(input.take ?? 50, LIST_TAKE_CAP);
  const rows = await prisma.twinCollaborationRequest.findMany({
    where: {
      OR: [
        { target_entity_id: input.callerEntityId },
        { target_twin_entity_id: input.callerEntityId },
      ],
      ...(input.state !== undefined ? { state: input.state } : {}),
    },
    orderBy: { created_at: "desc" },
    take,
  });
  return rows.map(projectCollaborationRequestSafeView);
}

// WHAT: List collaboration requests where the caller is the requester.
export async function listOutboundCollaborationRequestsForCaller(
  input: ListCollaborationRequestsInput,
): Promise<CollaborationRequestSafeView[]> {
  const take = Math.min(input.take ?? 50, LIST_TAKE_CAP);
  const rows = await prisma.twinCollaborationRequest.findMany({
    where: {
      requester_entity_id: input.callerEntityId,
      ...(input.state !== undefined ? { state: input.state } : {}),
    },
    orderBy: { created_at: "desc" },
    take,
  });
  return rows.map(projectCollaborationRequestSafeView);
}

interface TransitionInput {
  callerEntityId: string;
  collaborationId: string;
}

// WHAT: Common pre-check for transitions that the TARGET applies
//        (accept / reject). Returns the row if the caller is the
//        target; else a typed failure.
async function findAndAuthorizeTarget(
  input: TransitionInput,
): Promise<
  | { ok: true; row: NonNullable<Awaited<ReturnType<typeof prisma.twinCollaborationRequest.findUnique>>> }
  | { ok: false; code: "COLLABORATION_NOT_FOUND" | "NOT_TARGET" }
> {
  const row = await prisma.twinCollaborationRequest.findUnique({
    where: { collaboration_id: input.collaborationId },
  });
  if (row === null) return { ok: false, code: "COLLABORATION_NOT_FOUND" };
  const isTarget =
    row.target_entity_id === input.callerEntityId ||
    row.target_twin_entity_id === input.callerEntityId;
  if (!isTarget) return { ok: false, code: "NOT_TARGET" };
  return { ok: true, row };
}

// WHAT: Common pre-check for transitions that the REQUESTER applies
//        (cancel / mark completed).
async function findAndAuthorizeRequester(
  input: TransitionInput,
): Promise<
  | { ok: true; row: NonNullable<Awaited<ReturnType<typeof prisma.twinCollaborationRequest.findUnique>>> }
  | { ok: false; code: "COLLABORATION_NOT_FOUND" | "NOT_REQUESTER" }
> {
  const row = await prisma.twinCollaborationRequest.findUnique({
    where: { collaboration_id: input.collaborationId },
  });
  if (row === null) return { ok: false, code: "COLLABORATION_NOT_FOUND" };
  if (row.requester_entity_id !== input.callerEntityId)
    return { ok: false, code: "NOT_REQUESTER" };
  return { ok: true, row };
}

const TRANSITION_OPEN_STATES: ReadonlyArray<TwinCollaborationState> = [
  "REQUESTED",
  "NEEDS_APPROVAL",
  "IN_PROGRESS",
];

async function applyTransition(
  collaborationId: string,
  nextState: TwinCollaborationState,
  data: Partial<{ completed_at: Date }>,
): Promise<CollaborationRequestSafeView> {
  const updated = await prisma.twinCollaborationRequest.update({
    where: { collaboration_id: collaborationId },
    data: { state: nextState, ...data },
  });
  return projectCollaborationRequestSafeView(updated);
}

export async function acceptTwinCollaborationRequestForCaller(
  input: TransitionInput,
): Promise<CollaborationTransitionResult> {
  const guard = await findAndAuthorizeTarget(input);
  if (!guard.ok) return guard;
  if (!(TRANSITION_OPEN_STATES as ReadonlyArray<string>).includes(guard.row.state))
    return { ok: false, code: "INVALID_STATE_TRANSITION" };
  const view = await applyTransition(input.collaborationId, "ACCEPTED", {});
  await writeAuditEvent({
    event_type: "ADMIN_ACTION",
    outcome: "SUCCESS",
    actor_entity_id: input.callerEntityId,
    target_entity_id: guard.row.requester_entity_id,
    details: {
      action: "TWIN_COLLABORATION_ACCEPTED",
      collaboration_id: guard.row.collaboration_id,
      previous_state: guard.row.state,
    },
  });
  return { ok: true, collaboration: view };
}

export async function rejectTwinCollaborationRequestForCaller(
  input: TransitionInput,
): Promise<CollaborationTransitionResult> {
  const guard = await findAndAuthorizeTarget(input);
  if (!guard.ok) return guard;
  if (!(TRANSITION_OPEN_STATES as ReadonlyArray<string>).includes(guard.row.state))
    return { ok: false, code: "INVALID_STATE_TRANSITION" };
  const view = await applyTransition(input.collaborationId, "REJECTED", {});
  await writeAuditEvent({
    event_type: "ADMIN_ACTION",
    outcome: "SUCCESS",
    actor_entity_id: input.callerEntityId,
    target_entity_id: guard.row.requester_entity_id,
    details: {
      action: "TWIN_COLLABORATION_REJECTED",
      collaboration_id: guard.row.collaboration_id,
      previous_state: guard.row.state,
    },
  });
  return { ok: true, collaboration: view };
}

export async function cancelTwinCollaborationRequestForCaller(
  input: TransitionInput,
): Promise<CollaborationTransitionResult> {
  const guard = await findAndAuthorizeRequester(input);
  if (!guard.ok) return guard;
  if (!(TRANSITION_OPEN_STATES as ReadonlyArray<string>).includes(guard.row.state))
    return { ok: false, code: "INVALID_STATE_TRANSITION" };
  const view = await applyTransition(input.collaborationId, "CANCELED", {});
  await writeAuditEvent({
    event_type: "ADMIN_ACTION",
    outcome: "SUCCESS",
    actor_entity_id: input.callerEntityId,
    target_entity_id:
      guard.row.target_entity_id ?? guard.row.requester_entity_id,
    details: {
      action: "TWIN_COLLABORATION_CANCELED",
      collaboration_id: guard.row.collaboration_id,
      previous_state: guard.row.state,
    },
  });
  return { ok: true, collaboration: view };
}

export async function completeTwinCollaborationRequestForCaller(
  input: TransitionInput,
): Promise<CollaborationTransitionResult> {
  const guard = await findAndAuthorizeRequester(input);
  if (!guard.ok) return guard;
  // Completion is allowed from any non-terminal state — once the
  // requester says "this is done" the row settles, regardless of
  // whether the target ever accepted (some collaboration types
  // resolve outside the system).
  const terminal: ReadonlyArray<TwinCollaborationState> = [
    "COMPLETED",
    "REJECTED",
    "EXPIRED",
    "CANCELED",
  ];
  if ((terminal as ReadonlyArray<string>).includes(guard.row.state))
    return { ok: false, code: "INVALID_STATE_TRANSITION" };
  const view = await applyTransition(input.collaborationId, "COMPLETED", {
    completed_at: new Date(),
  });
  await writeAuditEvent({
    event_type: "ADMIN_ACTION",
    outcome: "SUCCESS",
    actor_entity_id: input.callerEntityId,
    target_entity_id:
      guard.row.target_entity_id ?? guard.row.requester_entity_id,
    details: {
      action: "TWIN_COLLABORATION_COMPLETED",
      collaboration_id: guard.row.collaboration_id,
      previous_state: guard.row.state,
    },
  });
  return { ok: true, collaboration: view };
}
