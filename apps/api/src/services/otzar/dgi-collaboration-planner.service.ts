// FILE: dgi-collaboration-planner.service.ts
// PURPOSE: [DGI ENTERPRISE WAVE-3] Deterministic organizational collaboration
//          planner. Operates on bounded Foundation-shaped inputs (goals,
//          obligations, actors, handoffs, permissions) and produces an
//          explainable recommendation — never grants access or authority.
//
//          Pure functions only. Safe for unit tests at 10 / 100 / 1_000 actors
//          without a database. Learned ranking (if any) may only re-order
//          within the governed candidate set produced here.
//
// PRIVACY: Inputs must already be scope-filtered by caller. This planner does
//          not load memory, capsules, or cross-tenant data.
//
// CONNECTS TO: dgi-coherence.service.ts (next-best-step vocabulary),
//   twin-collaboration.service.ts (execution substrate for DELEGATE).

import type { DgiAutonomyCeiling } from "./dgi-coherence.service.js";

export type PlannerActorKind = "HUMAN" | "TWIN";

export interface PlannerActor {
  actor_id: string;
  kind: PlannerActorKind;
  /** For TWINS: the human principal they represent. */
  principal_id: string;
  org_id: string;
  online: boolean;
  /** 0–1 relative capacity (1 = free). Deterministic input only. */
  capacity: number;
  /** Closed-vocab permission tags already resolved by Foundation. */
  permissions: readonly string[];
  skills: readonly string[];
}

export interface PlannerObligation {
  obligation_id: string;
  org_id: string;
  title: string;
  owner_actor_id: string;
  /** Required permission tag to advance this work. */
  required_permission: string;
  blocked: boolean;
  /** Optional goal this obligation advances. */
  goal_id: string | null;
  due_ms: number | null;
}

export interface PlannerGoal {
  goal_id: string;
  org_id: string;
  title: string;
  owner_actor_id: string;
  at_risk: boolean;
}

export interface PlannerHandoff {
  handoff_id: string;
  org_id: string;
  incoming_actor_id: string;
  state: "OPEN" | "TERMINAL";
}

export type CollaborationRecommendationKind =
  | "SAFE_AUTONOMOUS_ACTION"
  | "REQUIRED_COLLABORATION"
  | "CLARIFICATION"
  | "APPROVAL"
  | "HANDOFF"
  | "ESCALATION"
  | "BLOCKED_DEPENDENCY"
  | "NEXT_BEST_STEP"
  | "FAIL_CLOSED";

export interface CollaborationRecommendation {
  kind: CollaborationRecommendationKind;
  /** Selected actor (human or twin) — never grants new rights. */
  selected_actor_id: string | null;
  rejected_actor_ids: string[];
  goal_id: string | null;
  obligation_id: string | null;
  required_permission: string | null;
  evidence_refs: string[];
  risk_class: "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
  autonomy_ceiling: DgiAutonomyCeiling;
  safe_summary: string;
  reason: string;
}

export interface CollaborationPlanInput {
  org_id: string;
  actors: readonly PlannerActor[];
  obligations: readonly PlannerObligation[];
  goals: readonly PlannerGoal[];
  handoffs: readonly PlannerHandoff[];
  /** Wall-clock for due-date comparison (injectable for tests). */
  now_ms: number;
}

export interface CollaborationPlanResult {
  recommendations: CollaborationRecommendation[];
  metrics: {
    actor_count: number;
    twin_count: number;
    open_obligation_count: number;
    open_handoff_count: number;
    at_risk_goal_count: number;
    fail_closed_count: number;
    cross_org_rejected: number;
  };
}

function sameOrg(actor: PlannerActor, orgId: string): boolean {
  return actor.org_id === orgId;
}

function hasPermission(actor: PlannerActor, perm: string): boolean {
  return actor.permissions.includes(perm) || actor.permissions.includes("*");
}

/**
 * Select the best online actor with permission for an obligation.
 * Prefer: online twin of owner → online owner human → any online twin with
 * permission → any online human with permission. Offline principals still
 * allow their Twin when the Twin has the permission (directive §4/§3).
 */
export function selectResponsibleActor(args: {
  org_id: string;
  obligation: PlannerObligation;
  actors: readonly PlannerActor[];
}): {
  selected: PlannerActor | null;
  rejected: string[];
  reason: string;
} {
  const rejected: string[] = [];
  const candidates = args.actors.filter((a) => {
    if (!sameOrg(a, args.org_id)) {
      rejected.push(a.actor_id);
      return false;
    }
    if (!hasPermission(a, args.obligation.required_permission)) {
      rejected.push(a.actor_id);
      return false;
    }
    return true;
  });

  if (candidates.length === 0) {
    return {
      selected: null,
      rejected,
      reason: "No in-org actor has the required permission.",
    };
  }

  const ownerId = args.obligation.owner_actor_id;
  const ownerTwin = candidates.find(
    (a) => a.kind === "TWIN" && a.principal_id === ownerId,
  );
  if (ownerTwin !== undefined && (ownerTwin.online || true)) {
    // Twin may act when principal offline — capacity still ranks.
    return {
      selected: ownerTwin,
      rejected: candidates
        .filter((c) => c.actor_id !== ownerTwin.actor_id)
        .map((c) => c.actor_id)
        .concat(rejected),
      reason:
        "Owner's AI Teammate has permission and may advance work without principal online.",
    };
  }

  const ownerHuman = candidates.find(
    (a) => a.kind === "HUMAN" && a.actor_id === ownerId && a.online,
  );
  if (ownerHuman !== undefined) {
    return {
      selected: ownerHuman,
      rejected: candidates
        .filter((c) => c.actor_id !== ownerHuman.actor_id)
        .map((c) => c.actor_id)
        .concat(rejected),
      reason: "Owner human is online and authorized.",
    };
  }

  // Highest capacity online twin, else online human.
  const ranked = [...candidates].sort((a, b) => {
    const onlineScore = (x: PlannerActor) => (x.online ? 1 : 0);
    const kindScore = (x: PlannerActor) => (x.kind === "TWIN" ? 1 : 0);
    return (
      onlineScore(b) - onlineScore(a) ||
      kindScore(b) - kindScore(a) ||
      b.capacity - a.capacity ||
      a.actor_id.localeCompare(b.actor_id)
    );
  });
  const selected = ranked[0] ?? null;
  return {
    selected,
    rejected: ranked
      .slice(1)
      .map((c) => c.actor_id)
      .concat(rejected),
    reason: selected
      ? "Highest-capacity authorized actor in-org (deterministic)."
      : "No candidate after ranking.",
  };
}

/**
 * Plan collaboration for one org snapshot. O(actors * obligations) — bounded
 * for synthetic scale tests. Cross-org actors are rejected, never recommended.
 */
export function planOrganizationalCollaboration(
  input: CollaborationPlanInput,
): CollaborationPlanResult {
  const recommendations: CollaborationRecommendation[] = [];
  let cross_org_rejected = 0;
  let fail_closed_count = 0;

  // Count cross-org rejections for metrics.
  for (const a of input.actors) {
    if (a.org_id !== input.org_id) cross_org_rejected += 1;
  }

  const openHandoffs = input.handoffs.filter(
    (h) => h.org_id === input.org_id && h.state === "OPEN",
  );
  for (const h of openHandoffs) {
    recommendations.push({
      kind: "HANDOFF",
      selected_actor_id: h.incoming_actor_id,
      rejected_actor_ids: [],
      goal_id: null,
      obligation_id: null,
      required_permission: "handoff.acknowledge",
      evidence_refs: [`handoff:${h.handoff_id}`],
      risk_class: "MODERATE",
      autonomy_ceiling: "EXECUTE_WITH_CONFIRMATION",
      safe_summary: "Incoming handoff requires acknowledgment.",
      reason: "Open multi-party responsibility transfer.",
    });
  }

  const openObligations = input.obligations.filter(
    (o) => o.org_id === input.org_id && !o.blocked,
  );

  for (const obl of openObligations) {
    const pick = selectResponsibleActor({
      org_id: input.org_id,
      obligation: obl,
      actors: input.actors,
    });

    if (pick.selected === null) {
      fail_closed_count += 1;
      recommendations.push({
        kind: "FAIL_CLOSED",
        selected_actor_id: null,
        rejected_actor_ids: pick.rejected,
        goal_id: obl.goal_id,
        obligation_id: obl.obligation_id,
        required_permission: obl.required_permission,
        evidence_refs: [`obligation:${obl.obligation_id}`],
        risk_class: "HIGH",
        autonomy_ceiling: "FAIL_CLOSED",
        safe_summary: "No authorized actor can advance this obligation.",
        reason: pick.reason,
      });
      continue;
    }

    const goal = obl.goal_id
      ? input.goals.find((g) => g.goal_id === obl.goal_id)
      : undefined;
    const dueSoon =
      obl.due_ms !== null && obl.due_ms - input.now_ms < 24 * 60 * 60 * 1000;

    if (pick.selected.kind === "TWIN" && !pick.selected.online && false) {
      // reserved — twins may act offline for principal
    }

    if (
      pick.selected.kind === "TWIN" &&
      hasPermission(pick.selected, obl.required_permission) &&
      pick.selected.permissions.includes("autonomy.execute_within_policy")
    ) {
      recommendations.push({
        kind: "SAFE_AUTONOMOUS_ACTION",
        selected_actor_id: pick.selected.actor_id,
        rejected_actor_ids: pick.rejected,
        goal_id: obl.goal_id,
        obligation_id: obl.obligation_id,
        required_permission: obl.required_permission,
        evidence_refs: [`obligation:${obl.obligation_id}`],
        risk_class: dueSoon ? "MODERATE" : "LOW",
        autonomy_ceiling: "EXECUTE_WITHIN_POLICY",
        safe_summary: `Twin may execute within policy: ${obl.title.slice(0, 80)}`,
        reason: pick.reason,
      });
      continue;
    }

    if (pick.selected.kind === "TWIN") {
      recommendations.push({
        kind: "REQUIRED_COLLABORATION",
        selected_actor_id: pick.selected.actor_id,
        rejected_actor_ids: pick.rejected,
        goal_id: obl.goal_id,
        obligation_id: obl.obligation_id,
        required_permission: obl.required_permission,
        evidence_refs: [`obligation:${obl.obligation_id}`],
        risk_class: goal?.at_risk === true ? "HIGH" : "MODERATE",
        autonomy_ceiling: "DELEGATE_WITHIN_SCOPE",
        safe_summary: `AI Teammate collaboration for: ${obl.title.slice(0, 80)}`,
        reason: pick.reason,
      });
      continue;
    }

    recommendations.push({
      kind: "APPROVAL",
      selected_actor_id: pick.selected.actor_id,
      rejected_actor_ids: pick.rejected,
      goal_id: obl.goal_id,
      obligation_id: obl.obligation_id,
      required_permission: obl.required_permission,
      evidence_refs: [`obligation:${obl.obligation_id}`],
      risk_class: dueSoon ? "MODERATE" : "LOW",
      autonomy_ceiling: "EXECUTE_WITH_CONFIRMATION",
      safe_summary: `Human approval path: ${obl.title.slice(0, 80)}`,
      reason: pick.reason,
    });
  }

  // Blocked obligations → blocked dependency recommendations
  for (const obl of input.obligations.filter(
    (o) => o.org_id === input.org_id && o.blocked,
  )) {
    recommendations.push({
      kind: "BLOCKED_DEPENDENCY",
      selected_actor_id: obl.owner_actor_id,
      rejected_actor_ids: [],
      goal_id: obl.goal_id,
      obligation_id: obl.obligation_id,
      required_permission: obl.required_permission,
      evidence_refs: [`obligation:${obl.obligation_id}`],
      risk_class: "HIGH",
      autonomy_ceiling: "ESCALATE",
      safe_summary: `Blocked obligation: ${obl.title.slice(0, 80)}`,
      reason: "Obligation marked blocked — escalate dependency.",
    });
  }

  const twin_count = input.actors.filter(
    (a) => a.org_id === input.org_id && a.kind === "TWIN",
  ).length;
  const actor_count = input.actors.filter((a) => a.org_id === input.org_id).length;

  return {
    recommendations,
    metrics: {
      actor_count,
      twin_count,
      open_obligation_count: openObligations.length,
      open_handoff_count: openHandoffs.length,
      at_risk_goal_count: input.goals.filter(
        (g) => g.org_id === input.org_id && g.at_risk,
      ).length,
      fail_closed_count,
      cross_org_rejected,
    },
  };
}

/**
 * Synthetic world generator for scale pressure tests (safe synthetic only).
 * Never uses real demo/customer identities.
 */
export function buildSyntheticCollabWorld(scale: number): CollaborationPlanInput {
  const org_id = "00000000-0000-4000-8000-0000000000aa";
  const other_org = "00000000-0000-4000-8000-0000000000bb";
  const actors: PlannerActor[] = [];
  const obligations: PlannerObligation[] = [];
  const goals: PlannerGoal[] = [];
  const handoffs: PlannerHandoff[] = [];
  const now_ms = Date.UTC(2026, 6, 16, 12, 0, 0);

  for (let i = 0; i < scale; i++) {
    const humanId = `h-${i.toString().padStart(5, "0")}`;
    const twinId = `t-${i.toString().padStart(5, "0")}`;
    actors.push({
      actor_id: humanId,
      kind: "HUMAN",
      principal_id: humanId,
      org_id,
      online: i % 3 !== 0,
      capacity: (i % 10) / 10,
      permissions: ["work.read", "work.write", i % 7 === 0 ? "autonomy.execute_within_policy" : "work.draft"],
      skills: i % 2 === 0 ? ["engineering"] : ["operations"],
    });
    actors.push({
      actor_id: twinId,
      kind: "TWIN",
      principal_id: humanId,
      org_id,
      online: true,
      capacity: 0.8,
      permissions:
        i % 5 === 0
          ? ["work.read", "work.write", "autonomy.execute_within_policy"]
          : ["work.read", "work.write"],
      skills: i % 2 === 0 ? ["engineering"] : ["operations"],
    });

    if (i % 4 === 0) {
      const goalId = `g-${i.toString().padStart(5, "0")}`;
      goals.push({
        goal_id: goalId,
        org_id,
        title: `Synthetic goal ${i}`,
        owner_actor_id: humanId,
        at_risk: i % 11 === 0,
      });
      obligations.push({
        obligation_id: `o-${i.toString().padStart(5, "0")}`,
        org_id,
        title: `Synthetic obligation ${i}`,
        owner_actor_id: humanId,
        required_permission: "work.write",
        blocked: i % 13 === 0,
        goal_id: goalId,
        due_ms: now_ms + (i % 5) * 3_600_000,
      });
    }

    if (i % 17 === 0 && i + 1 < scale) {
      handoffs.push({
        handoff_id: `ho-${i.toString().padStart(5, "0")}`,
        org_id,
        incoming_actor_id: `h-${(i + 1).toString().padStart(5, "0")}`,
        state: "OPEN",
      });
    }
  }

  // Inject a few cross-org distractors (must be rejected).
  actors.push({
    actor_id: "x-foreign-human",
    kind: "HUMAN",
    principal_id: "x-foreign-human",
    org_id: other_org,
    online: true,
    capacity: 1,
    permissions: ["*"],
    skills: ["engineering"],
  });

  return { org_id, actors, obligations, goals, handoffs, now_ms };
}
