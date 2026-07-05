// FILE: dandelion-growth.service.ts
// PURPOSE: Phase 1237 — Dandelion, Otzar's organic org-growth and
//          pollination intelligence. Three governed surfaces:
//
//          1. getOrgGrowthForCaller (org admin) — "Otzar found N ways
//             to strengthen your organization this week": governed
//             recommendations computed from REAL substrate (external
//             relationships lacking internal owners, overloaded
//             commitment owners, members without a first project, onboarding
//             gaps, safe introductions). Recommendations only — this
//             service executes NOTHING; every suggested step routes
//             through existing approval paths.
//
//          2. getOnboardingIntrosForCaller (employee) — the caller's
//             own scoped getting-started view: teammates to meet,
//             workspaces to join, first steps.
//
//          3. proposeOnboardingMemoryForCaller (employee) — the
//             consent-gated memory path: preferred name /
//             pronunciation / communication + quiet preferences
//             become an Action(PROPOSED, RECORD_CAPSULE) so permanent
//             memory is NEVER saved silently — the user approves it
//             in Action Center (Phase 1208 path), the executor
//             records the governed PREFERENCE capsule, audit covers
//             every step, and COSMP revocation applies afterward.
//
// SAFETY POSTURE (RULE 0):
//   - Admin growth view: display names + role labels + counts only —
//     never emails, never memory contents, never authority internals.
//   - Employee view is self-scoped: their org's roster/workspaces
//     only; cross-org is structurally impossible (org-scoped queries).
//   - External collaborators appear by display name + company only,
//     clearly separated from employees, never as actionable
//     employees.
//
// CONNECTS TO:
//   - apps/api/src/routes/otzar-dandelion.routes.ts
//   - apps/api/src/services/action/action.service.ts
//     (createActionForCaller — the consent gate)
//   - apps/api/src/services/governance/org.ts (getOrgEntityId)
//   - tests/unit/dandelion-growth.test.ts +
//     tests/integration/dandelion-growth.test.ts

import { createHash } from "node:crypto";
import { prisma } from "@niov/database";
import { getOrgEntityId } from "../governance/org.js";
import {
  createActionForCaller,
  type CreateActionResult,
} from "../action/action.service.js";

// ─── view shapes ─────────────────────────────────────────────

export type GrowthRecommendationKind =
  | "ASSIGN_INTERNAL_OWNER"
  | "REDUCE_OVERLOAD"
  // [PROD-UX-BUGD] Was CONNECT_TEAMMATE. Renamed because the old kind + copy
  // ("isn't connected to any project or workspace yet") flattened every kind
  // of connection into one word — an org member with a manager, team, and
  // hierarchy read as "disconnected from the org". The recommendation names
  // the ONE missing object precisely: a first project/workspace assignment.
  // Future gap categories (NEEDS_MANAGER, NEEDS_DEPARTMENT, NEEDS_AI_TWIN,
  // NEEDS_ROLE_TOOLS) follow this naming — never broad connected/disconnected
  // language.
  | "NEEDS_PROJECT_OR_WORKSPACE"
  | "PREPARE_ONBOARDING";

// [PROD-UX-BUGD] Structured source-of-truth metadata so no consumer has to
// GUESS what "connected" meant. Each fact is read from its canonical source:
// org membership (EntityMembership org→person), manager (active person→person
// EntityMembership), department (EntityMembership.department), project/
// workspace (WorkProjectMember / CollaborationMembership).
export interface GrowthRecommendationContext {
  /** Stable reference for keying/dismissal (duplicate-name safe). Not PII —
   *  emails/memory contents stay out of this view (RULE 0). */
  person_entity_id: string;
  org_member: boolean;
  has_department: boolean;
  has_manager: boolean;
  has_project_or_workspace: boolean;
  missing_connection_type: "PROJECT_OR_WORKSPACE";
}

export interface GrowthRecommendation {
  kind: GrowthRecommendationKind;
  title: string;
  why: string;
  /** Display names only — never emails/memory in the admin view. */
  people: string[];
  suggested_next_step: string;
  /** [PROD-UX-BUGD] Present on NEEDS_PROJECT_OR_WORKSPACE. */
  context?: GrowthRecommendationContext;
}

export interface OrgGrowthView {
  headline: string;
  recommendations: GrowthRecommendation[];
  signals: {
    members_count: number;
    external_collaborators_count: number;
    unowned_external_count: number;
    members_without_project_count: number;
  };
  /** [GAP-B] The FULL setup queue behind the capped recommendation list:
   *  every member with no live project/workspace assignment (the uncapped
   *  truth behind members_without_project_count), stable ids + safe display
   *  fields only. Lets the admin surface say "showing X of Y" honestly and
   *  work through the whole queue — the capped cards stay calm, the scale
   *  stays true. Bounded by org membership (same query as members_count). */
  needs_first_project_people: Array<{
    person_entity_id: string;
    display_name: string;
  }>;
  generated_at: string;
}

export interface OnboardingIntrosView {
  greeting: string;
  teammates_to_meet: Array<{
    display_name: string;
    role_label: string | null;
    shares_a_project: boolean;
  }>;
  workspaces_to_join: Array<{ workspace_id: string; title: string }>;
  first_steps: string[];
  memory_consent_note: string;
}

type Failure = { ok: false; code: string; message?: string };

// ─── pure helpers (unit-tested; no DB) ───────────────────────

// WHAT: The Dandelion admin headline.
// WHY: One calm sentence, never a dashboard scream.
export function growthHeadline(count: number): string {
  if (count === 0) {
    return "Your organization looks healthy this week. Otzar will keep watching for ways to help it grow.";
  }
  return `Otzar found ${count} ${count === 1 ? "way" : "ways"} to strengthen your organization this week.`;
}

// [PROD-UX-BUGD] The needs-a-first-project copy. PURE (unit-tested, no DB).
// The hard rule: never imply someone is disconnected from the ORG when the
// only missing object is a project/workspace assignment. The copy states the
// true relationship first ("already part of your organization", with their
// team/manager when known), then names the ONE missing piece.
export function needsProjectOrWorkspaceCopy(input: {
  display_name: string;
  manager_name: string | null;
  department: string | null;
}): { title: string; why: string } {
  const belongs =
    input.manager_name !== null
      ? ` on ${input.manager_name}'s team`
      : input.department !== null
        ? ` in ${input.department}`
        : "";
  return {
    title: `${input.display_name} needs a first project or workspace`,
    why: `${input.display_name} is already part of your organization${belongs}, but isn't assigned to a project or workspace yet. Adding them to one helps Otzar connect their work, tools, and context more accurately.`,
  };
}

/** Open commitment statuses (mirrors Phase 1234). */
const OPEN_STATUSES = [
  "PROPOSED",
  "CONFIRMED",
  "ACTION_CREATED",
  "BLOCKED",
] as const;

/** Overload threshold: this many open commitments owned by one person. */
export const OVERLOAD_THRESHOLD = 3;

/** Cap so the admin view stays calm. */
const MAX_RECOMMENDATIONS = 5;

// WHAT: Build the onboarding memory content from consented fields.
// INPUT: The optional preference fields the user chose to share.
// OUTPUT: Joined content string, or null when nothing was provided.
// WHY: Only what the user explicitly offered enters the memory
//      candidate — no inferred or hidden fields.
export function buildOnboardingMemoryContent(input: {
  preferred_name?: string;
  pronunciation?: string;
  communication_preference?: string;
  quiet_preference?: string;
  remember_text?: string;
}): string | null {
  const lines: string[] = [];
  if (input.preferred_name !== undefined && input.preferred_name.trim() !== "")
    lines.push(`Preferred name: ${input.preferred_name.trim()}`);
  if (input.pronunciation !== undefined && input.pronunciation.trim() !== "")
    lines.push(`Name pronunciation: ${input.pronunciation.trim()}`);
  if (
    input.communication_preference !== undefined &&
    input.communication_preference.trim() !== ""
  )
    lines.push(
      `Communication preference: ${input.communication_preference.trim()}`,
    );
  if (input.quiet_preference !== undefined && input.quiet_preference.trim() !== "")
    lines.push(`Quiet-mode preference: ${input.quiet_preference.trim()}`);
  if (input.remember_text !== undefined && input.remember_text.trim() !== "")
    lines.push(`Asked Otzar to remember: ${input.remember_text.trim()}`);
  return lines.length === 0 ? null : lines.join("\n");
}

// ── [CS-3] Twin calibration — preference-only, consent-gated ───────────────
// The employee teaches their OWN twin the SHAPE of how they work: summaries,
// tone, reminders, decision support, style (their own words), current focus,
// and do-not-dos. Plain text and enumerated preferences only — no files, no
// company documents, no authority, no tools, no data scopes. Rides the SAME
// consent gate as onboarding memory: Action(PROPOSED, RECORD_CAPSULE), saved
// only after the user approves, into their PERSONAL wallet as a PREFERENCE
// capsule (sha256-hashed since CS-P1, revocable, self-scoped by
// construction — there is no target parameter to calibrate anyone else).
const CALIBRATION_FIELD_CAP = 600;

export interface TwinCalibrationInput {
  callerEntityId: string;
  summary_preference?: string;
  tone_preference?: string;
  reminder_preference?: string;
  decision_support_preference?: string;
  writing_style_text?: string;
  current_focus_text?: string;
  do_not_do_text?: string;
}

export function buildTwinCalibrationContent(
  input: Omit<TwinCalibrationInput, "callerEntityId">,
): string | null {
  const clip = (v: string | undefined): string | null => {
    const t = (v ?? "").trim();
    return t.length === 0 ? null : t.slice(0, CALIBRATION_FIELD_CAP);
  };
  const lines: string[] = [];
  const push = (label: string, v: string | undefined) => {
    const c = clip(v);
    if (c !== null) lines.push(`${label}: ${c}`);
  };
  push("Summary preference", input.summary_preference);
  push("Communication tone", input.tone_preference);
  push("Reminder preference", input.reminder_preference);
  push("Decision support preference", input.decision_support_preference);
  push("Writing style (in their own words)", input.writing_style_text);
  push("Current focus and responsibilities", input.current_focus_text);
  push("Do not do", input.do_not_do_text);
  return lines.length === 0 ? null : lines.join("\n");
}

// [CS-4] Server-side defense in depth: calibration text must be style
// SHAPE, never secrets or obviously confidential material. Conservative,
// deterministic token list — no classifier pretense; the client carries the
// broader guardrails and repair copy.
const RISKY_CALIBRATION_TOKENS = [
  "password", "api key", "api_key", "apikey", "secret key", "access token",
  "bearer ", "nda", "confidential", "social security", "ssn",
] as const;

export function findRiskyCalibrationToken(content: string): string | null {
  const lower = content.toLowerCase();
  for (const t of RISKY_CALIBRATION_TOKENS) {
    if (lower.includes(t)) return t;
  }
  return null;
}

export async function proposeTwinCalibrationForCaller(
  input: TwinCalibrationInput,
): Promise<CreateActionResult | Failure> {
  const content = buildTwinCalibrationContent(input);
  if (content === null) {
    return {
      ok: false,
      code: "NOTHING_TO_REMEMBER",
      message: "Share at least one preference for your AI Teammate to learn.",
    };
  }
  if (findRiskyCalibrationToken(content) !== null) {
    return {
      ok: false,
      code: "CALIBRATION_CONTENT_RISKY",
      message:
        "This looks like it includes confidential or credential-like content. Describe your style in general terms instead — nothing was saved.",
    };
  }
  const idempotencyKey = `twin-calibration-${input.callerEntityId}-${createHash("sha256")
    .update(content)
    .digest("hex")
    .slice(0, 16)}`;
  return createActionForCaller(input.callerEntityId, {
    action_type: "RECORD_CAPSULE",
    idempotency_key: idempotencyKey,
    payload_summary:
      "Save your AI Teammate calibration preferences (needs your approval).",
    payload_redacted: {
      capsule_type: "PREFERENCE",
      topic_tags: ["calibration", "preference", "twin"],
      payload_summary: "Working-style calibration shared from My AI Twin.",
      content,
      write_reason:
        "Twin calibration — user-consented working-style preferences (shape of how they work; never company work).",
    },
  });
}

// ─── shared gates ────────────────────────────────────────────

async function requireOrgAdmin(
  callerEntityId: string,
): Promise<{ ok: true; orgEntityId: string } | Failure> {
  let orgEntityId: string;
  try {
    orgEntityId = await getOrgEntityId(callerEntityId);
  } catch {
    return { ok: false, code: "NO_ORG_FOR_CALLER" };
  }
  const caller = await prisma.entity.findUnique({
    where: { entity_id: callerEntityId },
    select: { clearance_level: true },
  });
  if (caller === null || caller.clearance_level < 4) {
    return { ok: false, code: "ADMIN_REQUIRED" };
  }
  return { ok: true, orgEntityId };
}

interface MemberRow {
  entity_id: string;
  display_name: string;
  job_title: string | null;
  /** [PROD-UX-BUGD] department off the org→person membership (the canonical
   *  home per the hierarchy service) — lets growth copy state the person's
   *  true org placement instead of flattening it to "not connected". */
  department: string | null;
}

async function orgMembers(orgEntityId: string): Promise<MemberRow[]> {
  const memberships = await prisma.entityMembership.findMany({
    where: { parent_id: orgEntityId, is_active: true },
    select: { child_id: true, department: true },
  });
  const departmentById = new Map(memberships.map((m) => [m.child_id, m.department]));
  const ids = memberships.map((m) => m.child_id);
  if (ids.length === 0) return [];
  const entities = await prisma.entity.findMany({
    where: { entity_id: { in: ids }, entity_type: "PERSON" },
    select: {
      entity_id: true,
      display_name: true,
      profile: { select: { job_title: true } },
    },
  });
  return entities.map((e) => ({
    entity_id: e.entity_id,
    display_name: e.display_name,
    job_title: e.profile?.job_title ?? null,
    department: departmentById.get(e.entity_id) ?? null,
  }));
}

// ─── 1. admin org-growth view ────────────────────────────────

export async function getOrgGrowthForCaller(
  callerEntityId: string,
): Promise<{ ok: true; growth: OrgGrowthView } | Failure> {
  const gate = await requireOrgAdmin(callerEntityId);
  if (gate.ok === false) return gate;
  const orgEntityId = gate.orgEntityId;

  const members = await orgMembers(orgEntityId);
  const memberIds = members.map((m) => m.entity_id);
  const byId = new Map(members.map((m) => [m.entity_id, m]));

  // [PROD-UX-ASSIGN-SMOKE] "Connected" means a LIVE assignment: memberships
  // in ARCHIVED projects must not count (mirrors isActiveProjectMember).
  // WorkProjectMember has no Prisma relation to WorkProject, so resolve the
  // org's ACTIVE project ids first and filter memberships against them.
  const activeProjects = await prisma.workProject.findMany({
    where: { org_entity_id: orgEntityId, state: "ACTIVE" },
    select: { project_id: true },
  });
  const activeProjectIds = activeProjects.map((p) => p.project_id);

  const [unownedExternals, externalCount, openByOwner, projectMembers, wsMembers, managerEdges] =
    await Promise.all([
      prisma.externalCollaborator.findMany({
        where: {
          org_entity_id: orgEntityId,
          deleted_at: null,
          internal_owner_entity_id: null,
        },
        select: { display_name: true, company_name: true },
        take: 5,
      }),
      prisma.externalCollaborator.count({
        where: { org_entity_id: orgEntityId, deleted_at: null },
      }),
      prisma.collaborationCommitment.groupBy({
        by: ["owner_entity_id"],
        where: {
          org_entity_id: orgEntityId,
          owner_entity_id: { in: memberIds },
          status: { in: [...OPEN_STATUSES] },
          deleted_at: null,
        },
        _count: true,
      }),
      prisma.workProjectMember.findMany({
        where: {
          org_entity_id: orgEntityId,
          entity_id: { in: memberIds },
          project_id: { in: activeProjectIds },
        },
        select: { entity_id: true },
      }),
      prisma.collaborationMembership.findMany({
        where: {
          org_entity_id: orgEntityId,
          member_entity_id: { in: memberIds },
          status: "ACTIVE",
          deleted_at: null,
          workspace: { status: "ACTIVE", deleted_at: null },
        },
        select: { member_entity_id: true },
      }),
      // [PROD-UX-BUGD] Active person→person manager edges among this org's
      // members (the same shape hierarchy.service writes) — so growth copy can
      // state a person's true org placement.
      prisma.entityMembership.findMany({
        where: {
          is_active: true,
          parent_id: { in: memberIds },
          child_id: { in: memberIds },
        },
        select: { parent_id: true, child_id: true },
      }),
    ]);

  const connected = new Set<string>([
    ...projectMembers.map((p) => p.entity_id),
    ...wsMembers.map((w) => w.member_entity_id),
  ]);
  const withoutProject = members.filter((m) => !connected.has(m.entity_id));
  const mostConnectedId = [...connected.values()][0] ?? null;

  const recommendations: GrowthRecommendation[] = [];

  for (const ext of unownedExternals) {
    recommendations.push({
      kind: "ASSIGN_INTERNAL_OWNER",
      title: `Assign an internal owner for ${ext.display_name}${ext.company_name !== null ? ` (${ext.company_name})` : ""}`,
      why: "External relationships without an internal owner tend to stall — commitments in both directions lose their follow-up home.",
      people: [ext.display_name],
      suggested_next_step:
        "Pick the teammate who knows this relationship best and set them as the internal owner on the People & Collaboration page.",
    });
  }

  for (const row of openByOwner) {
    if (row.owner_entity_id === null) continue;
    if (row._count >= OVERLOAD_THRESHOLD) {
      const member = byId.get(row.owner_entity_id);
      if (member !== undefined) {
        recommendations.push({
          kind: "REDUCE_OVERLOAD",
          title: `${member.display_name} may need support`,
          why: `${member.display_name} owns ${row._count} open commitments — more than anyone should carry alone.`,
          people: [member.display_name],
          suggested_next_step:
            "Review their commitments in the workspace and reassign or reschedule what can move.",
        });
      }
    }
  }

  // [PROD-UX-BUGD] "No project/workspace" is the ONLY thing this signal
  // detects — say exactly that. These people are org members (this loop only
  // ever sees the org roster), usually with a manager/team/hierarchy already;
  // the old copy ("isn't connected to any project or workspace yet") read as
  // "disconnected from the org" and broke trust.
  const managerByPerson = new Map(managerEdges.map((e) => [e.child_id, e.parent_id]));
  for (const lonely of withoutProject) {
    const buddy =
      mostConnectedId !== null ? byId.get(mostConnectedId) : undefined;
    const managerId = managerByPerson.get(lonely.entity_id) ?? null;
    const manager = managerId !== null ? byId.get(managerId) : undefined;
    const copy = needsProjectOrWorkspaceCopy({
      display_name: lonely.display_name,
      manager_name: manager?.display_name ?? null,
      department: lonely.department,
    });
    recommendations.push({
      kind: "NEEDS_PROJECT_OR_WORKSPACE",
      title: copy.title,
      why: copy.why,
      people:
        buddy !== undefined && buddy.entity_id !== lonely.entity_id
          ? [lonely.display_name, buddy.display_name]
          : [lonely.display_name],
      suggested_next_step:
        buddy !== undefined && buddy.entity_id !== lonely.entity_id
          ? `Introduce ${lonely.display_name} to ${buddy.display_name} and add them to a workspace together.`
          : `Assign ${lonely.display_name} to their first project or workspace.`,
      context: {
        person_entity_id: lonely.entity_id,
        org_member: true,
        has_department: lonely.department !== null,
        has_manager: managerId !== null,
        has_project_or_workspace: false,
        missing_connection_type: "PROJECT_OR_WORKSPACE",
      },
    });
  }

  for (const m of members) {
    if (m.job_title === null) {
      recommendations.push({
        kind: "PREPARE_ONBOARDING",
        title: `Finish onboarding for ${m.display_name}`,
        why: "Their role isn't recorded yet, so Otzar can't tailor their day, their authority defaults, or their introductions.",
        people: [m.display_name],
        suggested_next_step:
          "Ask them to complete their getting-started questions, or set their role on My Organization.",
      });
    }
  }

  const capped = recommendations.slice(0, MAX_RECOMMENDATIONS);

  return {
    ok: true,
    growth: {
      headline: growthHeadline(capped.length),
      recommendations: capped,
      signals: {
        members_count: members.length,
        external_collaborators_count: externalCount,
        unowned_external_count: unownedExternals.length,
        members_without_project_count: withoutProject.length,
      },
      needs_first_project_people: [...withoutProject]
        .sort((a, b) => a.display_name.localeCompare(b.display_name))
        .map((m) => ({
          person_entity_id: m.entity_id,
          display_name: m.display_name,
        })),
      generated_at: new Date().toISOString(),
    },
  };
}

// ─── 2. employee onboarding intros ───────────────────────────

export async function getOnboardingIntrosForCaller(
  callerEntityId: string,
): Promise<{ ok: true; onboarding: OnboardingIntrosView } | Failure> {
  let orgEntityId: string;
  try {
    orgEntityId = await getOrgEntityId(callerEntityId);
  } catch {
    return { ok: false, code: "NO_ORG_FOR_CALLER" };
  }

  const members = await orgMembers(orgEntityId);
  const me = members.find((m) => m.entity_id === callerEntityId);

  const myProjects = await prisma.workProjectMember.findMany({
    where: { entity_id: callerEntityId, org_entity_id: orgEntityId },
    select: { project_id: true },
  });
  const myProjectIds = myProjects.map((p) => p.project_id);
  const projectPeers =
    myProjectIds.length === 0
      ? []
      : await prisma.workProjectMember.findMany({
          where: {
            project_id: { in: myProjectIds },
            entity_id: { not: callerEntityId },
          },
          select: { entity_id: true },
        });
  const peerIds = new Set(projectPeers.map((p) => p.entity_id));

  const teammates = members
    .filter((m) => m.entity_id !== callerEntityId)
    .sort((a, b) => {
      const aPeer = peerIds.has(a.entity_id) ? 0 : 1;
      const bPeer = peerIds.has(b.entity_id) ? 0 : 1;
      return aPeer - bPeer || a.display_name.localeCompare(b.display_name);
    })
    .slice(0, 3)
    .map((m) => ({
      display_name: m.display_name,
      role_label: m.job_title,
      shares_a_project: peerIds.has(m.entity_id),
    }));

  const workspaces = await prisma.collaborationWorkspace.findMany({
    where: { org_entity_id: orgEntityId, status: "ACTIVE", deleted_at: null },
    orderBy: { created_at: "desc" },
    take: 3,
    select: { workspace_id: true, title: true },
  });

  return {
    ok: true,
    onboarding: {
      greeting: `Welcome${me !== undefined ? `, ${me.display_name.split(" ")[0]}` : ""} — I'm Otzar. I'll help you understand your day, your team, and what needs your attention.`,
      teammates_to_meet: teammates,
      workspaces_to_join: workspaces.map((w) => ({
        workspace_id: w.workspace_id,
        title: w.title,
      })),
      first_steps: [
        "Tell Otzar what to call you — and how to pronounce it.",
        "Open My Day to see what matters today.",
        "Say hello to a teammate Otzar suggested.",
      ],
      memory_consent_note:
        "Otzar only remembers what you approve. Anything you save is private to your organization, recorded in the audit trail, and you can revoke it later.",
    },
  };
}

// ─── 3. consent-gated onboarding memory candidate ────────────

export async function proposeOnboardingMemoryForCaller(input: {
  callerEntityId: string;
  preferred_name?: string;
  pronunciation?: string;
  communication_preference?: string;
  quiet_preference?: string;
  remember_text?: string;
}): Promise<CreateActionResult | Failure> {
  const content = buildOnboardingMemoryContent(input);
  if (content === null) {
    return {
      ok: false,
      code: "NOTHING_TO_REMEMBER",
      message: "Share at least one preference for Otzar to remember.",
    };
  }
  // Deterministic per caller+content so retries don't duplicate the
  // pending approval (the Action runtime's idempotency contract).
  const idempotencyKey = `dandelion-onboarding-${input.callerEntityId}-${createHash(
    "sha256",
  )
    .update(content)
    .digest("hex")
    .slice(0, 16)}`;

  // The consent gate: Action(PROPOSED, RECORD_CAPSULE). Nothing is
  // written to memory until the user approves it in Action Center;
  // the executor then records the governed PREFERENCE capsule.
  return createActionForCaller(input.callerEntityId, {
    action_type: "RECORD_CAPSULE",
    idempotency_key: idempotencyKey,
    payload_summary:
      "Save your onboarding preferences to your Twin memory (needs your approval).",
    payload_redacted: {
      capsule_type: "PREFERENCE",
      topic_tags: ["onboarding", "preference", "dandelion"],
      payload_summary: "Onboarding preferences shared during Dandelion welcome.",
      content,
      write_reason: "Dandelion onboarding — user-consented preference memory.",
    },
  });
}
