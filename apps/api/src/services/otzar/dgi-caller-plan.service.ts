// FILE: dgi-caller-plan.service.ts
// PURPOSE: [DGI ENTERPRISE WAVE-4] Assemble a bounded, caller-scoped
//          collaboration plan from live Foundation state (obligations +
//          handoffs + principal/Twin actors). Feeds the deterministic
//          planner without loading private memory or cross-tenant data.
//
// PRIVACY: Safe titles + actor ids only. No transcripts, capsules, secrets.
// CONNECTS TO: dgi-collaboration-planner.service.ts, dgi-coherence,
//   getDgiCoherence product surface.

import { prisma } from "@niov/database";
import {
  listObligations,
  listHandoffs,
  OPEN_HANDOFF_STATES,
  type HandoffState,
  type SafeObligation,
  type SafeHandoff,
} from "@niov/database";
import {
  planOrganizationalCollaboration,
  type CollaborationPlanResult,
  type CollaborationRecommendation,
  type PlannerActor,
  type PlannerObligation,
  type PlannerHandoff,
} from "./dgi-collaboration-planner.service.js";

const TITLE_LEN = 120;
const REC_CAP = 8;

function safeTitle(raw: string | null | undefined): string {
  if (typeof raw !== "string" || raw.trim().length === 0) return "Untitled work";
  const t = raw.replace(/\s+/g, " ").trim();
  return t.length > TITLE_LEN ? `${t.slice(0, TITLE_LEN - 1)}…` : t;
}

/** Product-safe collaboration plan projection (capacity + titles only). */
export interface DgiCollaborationPlanView {
  recommendation_count: number;
  recommendations: Array<{
    kind: CollaborationRecommendation["kind"];
    selected_actor_id: string | null;
    goal_id: string | null;
    obligation_id: string | null;
    risk_class: CollaborationRecommendation["risk_class"];
    autonomy_ceiling: CollaborationRecommendation["autonomy_ceiling"];
    safe_summary: string;
    reason: string;
  }>;
  metrics: CollaborationPlanResult["metrics"];
}

function toView(plan: CollaborationPlanResult): DgiCollaborationPlanView {
  return {
    recommendation_count: plan.recommendations.length,
    recommendations: plan.recommendations.slice(0, REC_CAP).map((r) => ({
      kind: r.kind,
      selected_actor_id: r.selected_actor_id,
      goal_id: r.goal_id,
      obligation_id: r.obligation_id,
      risk_class: r.risk_class,
      autonomy_ceiling: r.autonomy_ceiling,
      safe_summary: safeTitle(r.safe_summary),
      reason: safeTitle(r.reason),
    })),
    metrics: plan.metrics,
  };
}

/**
 * Build a collaboration plan for the authenticated caller's org slice.
 * Failures degrade to empty recommendations (never throw into product reads).
 */
export async function buildCallerCollaborationPlan(args: {
  orgEntityId: string | null;
  subjectEntityId: string;
  twinEntityId: string | null;
}): Promise<DgiCollaborationPlanView> {
  const empty: DgiCollaborationPlanView = {
    recommendation_count: 0,
    recommendations: [],
    metrics: {
      actor_count: 0,
      twin_count: 0,
      open_obligation_count: 0,
      open_handoff_count: 0,
      at_risk_goal_count: 0,
      fail_closed_count: 0,
      cross_org_rejected: 0,
    },
  };

  if (args.orgEntityId === null) return empty;

  try {
    const org = args.orgEntityId;
    const now = Date.now();
    const openHandoffStates = [...OPEN_HANDOFF_STATES] as HandoffState[];

    const [obligations, handoffs, activeGrants] = await Promise.all([
      args.twinEntityId === null
        ? Promise.resolve([] as SafeObligation[])
        : listObligations(
            {
              org_entity_id: org,
              subject_entity_id: args.subjectEntityId,
              twin_entity_id: args.twinEntityId,
            },
            { open_only: true, limit: 30 },
          ).catch(() => [] as SafeObligation[]),
      listHandoffs(
        { org_entity_id: org, caller_entity_id: args.subjectEntityId },
        { states: openHandoffStates, limit: 20 },
      ).catch(() => [] as SafeHandoff[]),
      args.twinEntityId === null
        ? Promise.resolve(0)
        : prisma.twinAuthorityGrant
            .count({
              where: {
                grantor_entity_id: args.subjectEntityId,
                grantee_entity_id: args.twinEntityId,
                org_entity_id: org,
                state: "ACTIVE",
                OR: [{ expires_at: null }, { expires_at: { gt: new Date() } }],
              },
            })
            .catch(() => 0),
    ]);

    // Caller principal + Twin only in this slice (bounded). Broader org
    // roster planning is a future manager surface — not employee Today.
    const actors: PlannerActor[] = [
      {
        actor_id: args.subjectEntityId,
        kind: "HUMAN",
        principal_id: args.subjectEntityId,
        org_id: org,
        online: true,
        capacity: 0.5,
        permissions: ["work.read", "work.write", "handoff.acknowledge"],
        skills: [],
      },
    ];
    if (args.twinEntityId !== null) {
      const twinPerms =
        activeGrants > 0
          ? (["work.read", "work.write", "autonomy.execute_within_policy"] as const)
          : (["work.read", "work.write"] as const);
      actors.push({
        actor_id: args.twinEntityId,
        kind: "TWIN",
        principal_id: args.subjectEntityId,
        org_id: org,
        online: true,
        capacity: 0.85,
        permissions: [...twinPerms],
        skills: [],
      });
    }

    const plannerObligations: PlannerObligation[] = obligations.map((o) => ({
      obligation_id: o.obligation_id,
      org_id: org,
      title: safeTitle(o.title),
      owner_actor_id: o.responsible_entity_id || args.subjectEntityId,
      required_permission: "work.write",
      blocked: o.state === "BLOCKED",
      goal_id: null,
      due_ms: o.due_at ? new Date(o.due_at).getTime() : null,
    }));

    const plannerHandoffs: PlannerHandoff[] = handoffs
      .filter((h) => h.caller_is_incoming && !h.is_terminal)
      .map((h) => ({
        handoff_id: h.handoff_id,
        org_id: org,
        incoming_actor_id:
          h.incoming_responsible_entity_id ?? args.subjectEntityId,
        state: "OPEN" as const,
      }));

    const plan = planOrganizationalCollaboration({
      org_id: org,
      actors,
      obligations: plannerObligations,
      goals: [],
      handoffs: plannerHandoffs,
      now_ms: now,
    });

    return toView(plan);
  } catch {
    return empty;
  }
}
