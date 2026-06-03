// FILE: swarm-boundary.service.ts
// PURPOSE: DMW Runtime DM3-B per ADR-0092 §4 Candidate C (AI
//          Teammate Delegation Frame) — closes the TeamDelegation
//          + SwarmBoundary pair. One SwarmBoundary per
//          team_entity_id; team_entity_id IS the primary key.
//
//          capsule_access_mode caps the maximum surface the
//          team's members may ever observe regardless of any
//          per-member ConsentGrant. escalation_on_exceed names
//          what Foundation does when a team member attempts to
//          exceed the bound (DENY default; ESCALATE_TO_W5 routes
//          through W5 promotion; AUDIT_ONLY allows but emits an
//          additional audit event — AUDIT_ONLY consumer is
//          forward-substrate at this slice).
//
//          cross_team_reach=false (default) blocks any team
//          member from referencing capsules attached to ANOTHER
//          team's delegator_entity_id. cross_team_reach=true is
//          encoded but consumer enforcement is forward-substrate.
//
// CONNECTS TO:
//   - packages/database (prisma.swarmBoundary +
//     writeAuditEvent for SWARM_BOUNDARY_DECLARED)
//   - ADR-0092 §4 Candidate C AI Teammate Delegation Frame
//     (closes pair with TeamDelegation from PR #240)
//   - ADR-0092 §2 7 inviolable bans (V1 swarm boundary ban set)
//   - ADR-0086 W5 Action Promotion Runtime (downstream consumer
//     for ESCALATE_TO_W5 escalation_on_exceed)
//   - ADR-0046 dual-context AI_AGENT routing (distinct surface)

import { prisma, writeAuditEvent } from "@niov/database";
import type {
  CapsuleAccessMode,
  EscalationOnExceed,
} from "@prisma/client";

export type SwarmBoundarySummary = {
  team_entity_id: string;
  capsule_access_mode: CapsuleAccessMode;
  cross_team_reach: boolean;
  escalation_on_exceed: EscalationOnExceed;
  declared_by: string;
  created_at: Date;
  updated_at: Date;
};

export type DeclareSwarmBoundaryInput = {
  team_entity_id: string;
  declared_by: string;
  capsule_access_mode?: CapsuleAccessMode;
  cross_team_reach?: boolean;
  escalation_on_exceed?: EscalationOnExceed;
};

export type DeclareSwarmBoundaryResult =
  | { ok: true; boundary: SwarmBoundarySummary }
  | {
      ok: false;
      code: "INVALID_FIELD";
      httpStatus: 422;
      invalid_fields: string[];
    };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_CAPSULE_ACCESS_MODES: ReadonlySet<string> = new Set([
  "METADATA_ONLY",
  "SCOPED_SUMMARY",
  "FULL_SCOPED",
]);
const VALID_ESCALATION_ON_EXCEED: ReadonlySet<string> = new Set([
  "DENY",
  "ESCALATE_TO_W5",
  "AUDIT_ONLY",
]);

function project(
  row: NonNullable<
    Awaited<ReturnType<typeof prisma.swarmBoundary.findUnique>>
  >,
): SwarmBoundarySummary {
  return {
    team_entity_id: row.team_entity_id,
    capsule_access_mode: row.capsule_access_mode,
    cross_team_reach: row.cross_team_reach,
    escalation_on_exceed: row.escalation_on_exceed,
    declared_by: row.declared_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// WHAT: Declare (or update) the SwarmBoundary for a team.
// INPUT: team_entity_id + declared_by + optional capsule_access_
//        mode (default METADATA_ONLY) + optional cross_team_
//        reach (default false) + optional escalation_on_exceed
//        (default DENY).
// OUTPUT: DeclareSwarmBoundaryResult.
// WHY: ADR-0092 §4 Candidate C canonical bound declaration.
//      Idempotent at the row tier (upsert) but each declaration
//      emits SWARM_BOUNDARY_DECLARED so the audit chain captures
//      every change. Self-declaration (team === declared_by) is
//      REJECTED per RULE 0 — only an external delegator may
//      bound the team.
export async function declareSwarmBoundaryForCaller(
  input: DeclareSwarmBoundaryInput,
): Promise<DeclareSwarmBoundaryResult> {
  const invalid: string[] = [];
  if (!UUID_RE.test(input.team_entity_id)) invalid.push("team_entity_id");
  if (!UUID_RE.test(input.declared_by)) invalid.push("declared_by");
  if (input.team_entity_id === input.declared_by) {
    invalid.push("declared_by");
  }
  if (
    input.capsule_access_mode !== undefined &&
    !VALID_CAPSULE_ACCESS_MODES.has(input.capsule_access_mode)
  ) {
    invalid.push("capsule_access_mode");
  }
  if (
    input.escalation_on_exceed !== undefined &&
    !VALID_ESCALATION_ON_EXCEED.has(input.escalation_on_exceed)
  ) {
    invalid.push("escalation_on_exceed");
  }
  if (invalid.length > 0) {
    return {
      ok: false,
      code: "INVALID_FIELD",
      httpStatus: 422,
      invalid_fields: invalid,
    };
  }
  const capsule_access_mode: CapsuleAccessMode =
    input.capsule_access_mode ?? "METADATA_ONLY";
  const cross_team_reach =
    input.cross_team_reach === undefined ? false : input.cross_team_reach;
  const escalation_on_exceed: EscalationOnExceed =
    input.escalation_on_exceed ?? "DENY";
  const row = await prisma.swarmBoundary.upsert({
    where: { team_entity_id: input.team_entity_id },
    update: {
      capsule_access_mode,
      cross_team_reach,
      escalation_on_exceed,
      declared_by: input.declared_by,
    },
    create: {
      team_entity_id: input.team_entity_id,
      capsule_access_mode,
      cross_team_reach,
      escalation_on_exceed,
      declared_by: input.declared_by,
    },
  });
  await writeAuditEvent({
    event_type: "SWARM_BOUNDARY_DECLARED",
    outcome: "SUCCESS",
    actor_entity_id: input.declared_by,
    target_entity_id: input.team_entity_id,
    details: {
      team_entity_id: row.team_entity_id,
      capsule_access_mode: row.capsule_access_mode,
      cross_team_reach: row.cross_team_reach,
      escalation_on_exceed: row.escalation_on_exceed,
      declared_by: row.declared_by,
    },
  });
  return { ok: true, boundary: project(row) };
}

// WHAT: Look up the SwarmBoundary for a team.
// INPUT: team_entity_id (UUID).
// OUTPUT: A SwarmBoundarySummary or null.
// WHY: Pure read; no audit emission.
export async function getSwarmBoundaryByTeamId(
  team_entity_id: string,
): Promise<SwarmBoundarySummary | null> {
  if (!UUID_RE.test(team_entity_id)) return null;
  const row = await prisma.swarmBoundary.findUnique({
    where: { team_entity_id },
  });
  return row === null ? null : project(row);
}
