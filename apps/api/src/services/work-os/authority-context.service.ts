// FILE: authority-context.service.ts
// PURPOSE: Phase 1273 — the AUTHORITY substrate that gives Work OS
//          instructions organizational weight. Before Otzar decides
//          what an instruction *means*, it computes a real authority
//          context from live org data (EntityMembership hierarchy +
//          TokenAttributeRepository RBAC flags) and runs the action
//          through an RBAC/ABAC policy matrix. This is what turns
//          "schedule a meeting with Vishesh" from a generic draft into
//          a manager-authority decision — and "schedule with Alex" into
//          an honest TARGET_NOT_FOUND.
// CONNECTS TO: governance/org.ts (getOrgEntityId), @niov/database
//          (entityMembership, entity, tokenAttributeRepository),
//          work-os authority-context route, the Control Tower planner.
//
// SAFETY: derives authority ONLY from real seeded/persisted data — it
// never fabricates a hierarchy. An employee caller is never silently
// promoted to manager. Unknown targets resolve to NOT_FOUND, never a
// invented person.

import { prisma } from "@niov/database";
import { getOrgEntityId } from "../governance/org.js";

// ── Target resolution ────────────────────────────────────────────

export type TargetResolutionCode =
  | "RESOLVED_INTERNAL_ENTITY"
  | "AMBIGUOUS"
  | "NOT_FOUND"
  | "NEEDS_EMAIL"
  | "RUNTIME_MISSING";

export interface TargetMatch {
  entity_id: string;
  display_name: string;
  role_title: string | null;
}

export interface TargetResolution {
  code: TargetResolutionCode;
  match: TargetMatch | null;
  candidates: TargetMatch[];
}

// WHAT: Resolve a free-text participant name against the caller's org
//        roster (active members of the COMPANY org).
// INPUT: org_entity_id + a name fragment ("Vishesh", "Alex", "David").
// OUTPUT: RESOLVED_INTERNAL_ENTITY (one match) / AMBIGUOUS (>1) /
//         NOT_FOUND (0). Never invents a person.
// WHY: Test 4 ("schedule with Alex") must NOT guess — an unknown name
//      is an honest blocker, not a fabricated attendee.
export async function resolveTargetInOrg(
  org_entity_id: string,
  name: string,
): Promise<TargetResolution> {
  const needle = name.trim().toLowerCase();
  if (needle.length === 0) {
    return { code: "NOT_FOUND", match: null, candidates: [] };
  }
  const memberships = await prisma.entityMembership.findMany({
    where: { parent_id: org_entity_id, is_active: true },
    select: {
      role_title: true,
      child: {
        select: { entity_id: true, display_name: true, entity_type: true },
      },
    },
  });
  const people = memberships.filter(
    (m) => m.child.entity_type === "PERSON" || m.child.entity_type === "AI_AGENT",
  );
  const matches: TargetMatch[] = people
    .filter((m) => {
      const dn = (m.child.display_name ?? "").toLowerCase();
      if (dn.length === 0) return false;
      // Match on whole-word first name or any name token, or substring.
      const tokens = dn.split(/\s+/);
      return (
        dn === needle ||
        tokens.includes(needle) ||
        dn.startsWith(`${needle} `) ||
        dn.includes(needle)
      );
    })
    .map((m) => ({
      entity_id: m.child.entity_id,
      display_name: m.child.display_name ?? "(unknown)",
      role_title: m.role_title,
    }));

  if (matches.length === 0) {
    return { code: "NOT_FOUND", match: null, candidates: [] };
  }
  if (matches.length > 1) {
    return { code: "AMBIGUOUS", match: null, candidates: matches };
  }
  return { code: "RESOLVED_INTERNAL_ENTITY", match: matches[0]!, candidates: matches };
}

// ── Work OS action vocabulary + policy decisions ─────────────────

export type WorkOsAction =
  | "READ_CONNECTOR_STATUS"
  | "READ_ZOOM_RECORDINGS"
  | "READ_CALENDAR_FREEBUSY_SELF"
  | "READ_CALENDAR_FREEBUSY_TARGET"
  | "PROPOSE_MEETING"
  | "CREATE_INTERNAL_MEETING"
  | "REQUEST_PARTICIPANT_CONFIRMATION"
  | "CREATE_INTERNAL_TASK"
  | "ASSIGN_TASK"
  | "CREATE_FOLLOW_UP_NOTE"
  | "SEND_INTERNAL_NOTIFICATION"
  | "ASK_TWIN"
  | "REQUEST_TWIN_INTERCESSION"
  | "CREATE_COLLABORATION_REQUEST"
  | "SEND_EXTERNAL_SLACK"
  | "SEND_EXTERNAL_EMAIL"
  | "CREATE_EXTERNAL_CALENDAR_INVITE";

export type PolicyDecision =
  | "ALLOW"
  | "ALLOW_WITH_CONFIRMATION"
  | "ALLOW_WITH_STANDING_AUTHORITY"
  | "REQUIRES_APPROVAL"
  | "REQUIRES_TARGET_CONFIRMATION"
  | "REQUIRES_DUAL_CONTROL"
  | "BLOCKED"
  | "RUNTIME_MISSING";

export interface AuthorityContext {
  caller_entity_id: string;
  org_entity_id: string | null;
  caller_role_title: string | null;
  caller_can_admin_org: boolean;
  caller_is_admin_membership: boolean;
  target_resolution: TargetResolutionCode;
  target_entity_id: string | null;
  target_display_name: string | null;
  target_role_title: string | null;
  caller_is_manager_of_target: boolean;
  caller_can_view_target_calendar: boolean;
  caller_can_schedule_with_target: boolean;
  caller_can_assign_task_to_target: boolean;
  caller_can_request_confirmation_from_target: boolean;
  caller_can_use_target_twin: boolean;
}

export interface ActionPolicyResult {
  action: WorkOsAction;
  decision: PolicyDecision;
  reason_code: string;
  reason: string;
}

// WHAT: The RBAC/ABAC decision matrix — pure, deterministic, testable.
// INPUT: an action + the computed authority context.
// OUTPUT: a policy decision + reason. Backend is the source of truth;
//         the frontend only displays this.
// WHY: Per Phase 1273 — policy must live in the backend, consider
//      hierarchy + internal/external + target confirmation, and never
//      be hard-coded only in the UI.
export function evaluateWorkOsAction(
  action: WorkOsAction,
  ctx: AuthorityContext,
): ActionPolicyResult {
  const mk = (
    decision: PolicyDecision,
    reason_code: string,
    reason: string,
  ): ActionPolicyResult => ({ action, decision, reason_code, reason });

  // Target-bearing actions first fail closed on resolution.
  const targetActions: ReadonlyArray<WorkOsAction> = [
    "READ_CALENDAR_FREEBUSY_TARGET",
    "PROPOSE_MEETING",
    "CREATE_INTERNAL_MEETING",
    "REQUEST_PARTICIPANT_CONFIRMATION",
    "CREATE_INTERNAL_TASK",
    "ASSIGN_TASK",
    "CREATE_FOLLOW_UP_NOTE",
    "SEND_INTERNAL_NOTIFICATION",
    "ASK_TWIN",
    "REQUEST_TWIN_INTERCESSION",
    "CREATE_COLLABORATION_REQUEST",
  ];
  if (targetActions.includes(action)) {
    if (ctx.target_resolution === "NOT_FOUND") {
      return mk("BLOCKED", "TARGET_NOT_FOUND", "The participant could not be resolved in your organization.");
    }
    if (ctx.target_resolution === "AMBIGUOUS") {
      return mk("BLOCKED", "TARGET_AMBIGUOUS", "More than one teammate matches that name — pick one.");
    }
  }

  switch (action) {
    case "READ_CONNECTOR_STATUS":
      return ctx.caller_can_admin_org
        ? mk("ALLOW", "ADMIN", "Org admins may read full connector status.")
        : mk("ALLOW_WITH_CONFIRMATION", "LIMITED", "Employees get a limited connector view.");

    case "READ_ZOOM_RECORDINGS":
    case "READ_CALENDAR_FREEBUSY_SELF":
      return mk("ALLOW", "SELF", "Reading your own connected data is allowed.");

    case "READ_CALENDAR_FREEBUSY_TARGET":
      if (ctx.caller_is_manager_of_target) {
        return mk("ALLOW", "MANAGER_AUTHORITY", "Manager authority allows reading a direct report's availability.");
      }
      return mk("REQUIRES_TARGET_CONFIRMATION", "PEER", "Peer availability needs the teammate's confirmation.");

    case "PROPOSE_MEETING":
      return mk("ALLOW", "INTERNAL_PROPOSAL", "Proposing an internal meeting is always allowed (no invite sent).");

    case "CREATE_INTERNAL_MEETING":
      if (ctx.caller_is_manager_of_target) {
        return mk("ALLOW_WITH_CONFIRMATION", "MANAGER_AUTHORITY", "Manager authority allows internal scheduling after you confirm the slot.");
      }
      return mk("REQUIRES_TARGET_CONFIRMATION", "PEER", "Scheduling with a peer needs their confirmation.");

    case "REQUEST_PARTICIPANT_CONFIRMATION":
      return mk("ALLOW", "REQUEST", "Requesting a participant's confirmation is allowed.");

    case "CREATE_INTERNAL_TASK":
      return mk("ALLOW", "SELF_TASK", "Creating an internal task is allowed.");

    case "ASSIGN_TASK":
      if (ctx.caller_is_manager_of_target) {
        return mk("ALLOW_WITH_CONFIRMATION", "MANAGER_AUTHORITY", "A manager may assign a task to a direct report after confirming.");
      }
      return mk("REQUIRES_TARGET_CONFIRMATION", "PEER", "Assigning a task to a peer needs their acceptance.");

    case "CREATE_FOLLOW_UP_NOTE":
      return mk("ALLOW", "FOLLOW_UP", "Creating a follow-up note/draft is allowed (no send).");

    case "SEND_INTERNAL_NOTIFICATION":
      return mk("ALLOW", "INTERNAL", "Internal notifications are allowed (governed, no external delivery).");

    case "ASK_TWIN":
    case "REQUEST_TWIN_INTERCESSION":
      // Twin intercession requires delegated authority we do not have a
      // runtime for yet — fall back to a collaboration request.
      return mk("RUNTIME_MISSING", "TWIN_INTERCESSION_BLOCKED", "Twin intercession policy is not wired; a collaboration request is created instead.");

    case "CREATE_COLLABORATION_REQUEST":
      return mk("ALLOW", "COLLABORATION", "Creating a collaboration request is allowed.");

    case "SEND_EXTERNAL_SLACK":
    case "SEND_EXTERNAL_EMAIL":
      return mk("REQUIRES_APPROVAL", "EXTERNAL", "External sends require approval (no standing authority).");

    case "CREATE_EXTERNAL_CALENDAR_INVITE":
      return mk("REQUIRES_APPROVAL", "EXTERNAL", "External calendar invites require approval/confirmation.");
  }
}

// WHAT: Build the full authority context for a caller + optional target.
// INPUT: caller_entity_id + optional target_name.
// OUTPUT: an AuthorityContext computed from live org data.
// WHY: One call produces every authority boolean the planner + policy
//      matrix need. Manager authority is derived from the REAL
//      can_admin_org RBAC flag + shared-org membership — never faked.
export async function buildAuthorityContext(args: {
  caller_entity_id: string;
  target_name?: string;
}): Promise<AuthorityContext> {
  let orgEntityId: string | null = null;
  try {
    orgEntityId = await getOrgEntityId(args.caller_entity_id);
  } catch {
    orgEntityId = null;
  }

  const callerTar = await prisma.tokenAttributeRepository.findUnique({
    where: { entity_id: args.caller_entity_id },
    select: { can_admin_org: true },
  });
  const callerMembership =
    orgEntityId === null
      ? null
      : await prisma.entityMembership.findFirst({
          where: { child_id: args.caller_entity_id, is_active: true },
          select: { role_title: true, is_admin: true },
        });
  const callerCanAdminOrg = callerTar?.can_admin_org === true;
  const callerIsAdminMembership = callerMembership?.is_admin === true;

  let resolution: TargetResolution = {
    code: "NOT_FOUND",
    match: null,
    candidates: [],
  };
  if (args.target_name !== undefined && orgEntityId !== null) {
    resolution = await resolveTargetInOrg(orgEntityId, args.target_name);
  }
  const target = resolution.match;
  const targetRoleTitle: string | null = target?.role_title ?? null;

  // Manager authority (REAL): an org-admin / founder in the same org
  // has managerial authority over the org's members. (A future direct
  // manager→report EntityMembership edge would also satisfy this.)
  const isManager =
    target !== null &&
    target.entity_id !== args.caller_entity_id &&
    (callerCanAdminOrg || callerIsAdminMembership);

  return {
    caller_entity_id: args.caller_entity_id,
    org_entity_id: orgEntityId,
    caller_role_title: callerMembership?.role_title ?? null,
    caller_can_admin_org: callerCanAdminOrg,
    caller_is_admin_membership: callerIsAdminMembership,
    target_resolution: resolution.code,
    target_entity_id: target?.entity_id ?? null,
    target_display_name: target?.display_name ?? null,
    target_role_title: targetRoleTitle,
    caller_is_manager_of_target: isManager,
    // Manager authority grants the RIGHT to view/schedule; whether the
    // target's calendar address/visibility is actually wired is a
    // separate runtime concern surfaced by the calendar bridge.
    caller_can_view_target_calendar: isManager,
    caller_can_schedule_with_target:
      isManager || resolution.code === "RESOLVED_INTERNAL_ENTITY",
    caller_can_assign_task_to_target:
      resolution.code === "RESOLVED_INTERNAL_ENTITY",
    caller_can_request_confirmation_from_target:
      resolution.code === "RESOLVED_INTERNAL_ENTITY",
    caller_can_use_target_twin: false, // no delegated-authority runtime yet
  };
}
