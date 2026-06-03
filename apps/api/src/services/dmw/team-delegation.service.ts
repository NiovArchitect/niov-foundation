// FILE: team-delegation.service.ts
// PURPOSE: DMW Runtime DM3-A per ADR-0092 §4 Candidate C (AI
//          Teammate Delegation Frame). Formalizes the multi-AI-
//          agent team delegation contract — distinct from
//          ADR-0046 dual-context AI_AGENT routing.
//
//          A delegator (PERSON / COMPANY) authorizes a team
//          (an AI_AGENT entity acting as a Hive coordinator) to
//          operate within a closed-vocab capability_scope[] for
//          a bounded validity window. supervision_required
//          (default true) — when true, downstream W5 promotion
//          of any proposed action originating from a team member
//          MUST surface a human-in-the-loop confirmation per
//          ADR-0046 §C confused-deputy guard.
//
//          INVOKE_CONNECTOR_WRITE is REJECTED at the substrate
//          tier — connector writes remain ≥C6 forward-substrate
//          per ADR-0084 and require separate per-connector
//          Founder authorization. A delegation CANNOT include
//          INVOKE_CONNECTOR_WRITE even if the delegator
//          explicitly attempts it.
//
//          SwarmBoundary model is deferred to a follow-up DMW
//          DM3-B slice; V1 covers the delegation-creation
//          register only.
//
// CONNECTS TO:
//   - packages/database (prisma.teamDelegation + writeAuditEvent
//     for TEAM_DELEGATION_CREATED)
//   - ADR-0092 §4 Candidate C AI Teammate Delegation Frame
//   - ADR-0092 §2 7 inviolable bans (V1 delegation ban set)
//   - ADR-0046 dual-context AI_AGENT routing (distinct surface)
//   - ADR-0084 §C6 connector writes remain forward-substrate
//   - ADR-0086 W5 Action Promotion Runtime (downstream consumer)

import { prisma, writeAuditEvent } from "@niov/database";
import type { TeamDelegationStatus } from "@prisma/client";

// WHAT: The closed-vocab capability_scope enum for
//        TeamDelegation. V1 covers 4 ALLOWED capabilities;
//        INVOKE_CONNECTOR_WRITE is canonical-named but EXPLICITLY
//        rejected at the substrate tier per ADR-0084.
// INPUT: Used as a value namespace.
// OUTPUT: None.
// WHY: ADR-0092 §4 Candidate C canonical capability discipline
//      + ADR-0084 connector-write boundary.
export const TEAM_DELEGATION_ALLOWED_CAPABILITIES = [
  "COORDINATION_ONLY",
  "READ_SCOPED_CAPSULES",
  "PROPOSE_W5_ACTIONS",
  "INVOKE_CONNECTOR_READ",
] as const;

export const TEAM_DELEGATION_FORBIDDEN_CAPABILITIES: ReadonlySet<string> =
  new Set([
    "INVOKE_CONNECTOR_WRITE",
  ]);

export type TeamDelegationCapability =
  (typeof TEAM_DELEGATION_ALLOWED_CAPABILITIES)[number];

export type TeamDelegationSummary = {
  delegation_id: string;
  delegator_entity_id: string;
  team_entity_id: string;
  capability_scope: string[];
  supervision_required: boolean;
  revocation_bridge_id: string | null;
  valid_from: Date;
  valid_until: Date | null;
  status: TeamDelegationStatus;
  revoked_at: Date | null;
  revoked_by: string | null;
};

export type CreateTeamDelegationInput = {
  delegator_entity_id: string;
  team_entity_id: string;
  capability_scope: ReadonlyArray<string>;
  supervision_required?: boolean;
  valid_until?: Date | null;
  revocation_bridge_id?: string | null;
};

export type CreateTeamDelegationResult =
  | { ok: true; delegation: TeamDelegationSummary }
  | {
      ok: false;
      code: "INVALID_FIELD";
      httpStatus: 422;
      invalid_fields: string[];
    }
  | {
      ok: false;
      code: "FORBIDDEN_CAPABILITY";
      httpStatus: 403;
      forbidden: ReadonlyArray<string>;
    };

export type RevokeTeamDelegationInput = {
  delegation_id: string;
  revoked_by: string;
};

export type RevokeTeamDelegationResult =
  | { ok: true; delegation: TeamDelegationSummary }
  | { ok: false; code: "NOT_FOUND"; httpStatus: 404 }
  | {
      ok: false;
      code: "ALREADY_REVOKED";
      httpStatus: 409;
      revoked_at: Date;
    };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_CAPABILITY_SET: ReadonlySet<string> = new Set(
  TEAM_DELEGATION_ALLOWED_CAPABILITIES,
);

function project(
  row: NonNullable<Awaited<ReturnType<typeof prisma.teamDelegation.findUnique>>>,
): TeamDelegationSummary {
  return {
    delegation_id: row.delegation_id,
    delegator_entity_id: row.delegator_entity_id,
    team_entity_id: row.team_entity_id,
    capability_scope: row.capability_scope,
    supervision_required: row.supervision_required,
    revocation_bridge_id: row.revocation_bridge_id,
    valid_from: row.valid_from,
    valid_until: row.valid_until,
    status: row.status,
    revoked_at: row.revoked_at,
    revoked_by: row.revoked_by,
  };
}

// WHAT: Create a TeamDelegation per ADR-0092 §4 Candidate C.
// INPUT: delegator + team + capability_scope[] + optional
//        supervision_required (default true) + optional
//        valid_until + optional revocation_bridge_id.
// OUTPUT: CreateTeamDelegationResult.
// WHY: V1 rejects self-delegation (RULE 0 invariant), any
//      capability outside the V1 ALLOWED set, and any
//      FORBIDDEN capability (currently just
//      INVOKE_CONNECTOR_WRITE per ADR-0084). Emits
//      TEAM_DELEGATION_CREATED on success per RULE 4.
export async function createTeamDelegationForCaller(
  input: CreateTeamDelegationInput,
): Promise<CreateTeamDelegationResult> {
  const invalid: string[] = [];
  if (!UUID_RE.test(input.delegator_entity_id)) {
    invalid.push("delegator_entity_id");
  }
  if (!UUID_RE.test(input.team_entity_id)) {
    invalid.push("team_entity_id");
  }
  if (input.delegator_entity_id === input.team_entity_id) {
    invalid.push("team_entity_id");
  }
  if (
    !Array.isArray(input.capability_scope) ||
    input.capability_scope.length === 0
  ) {
    invalid.push("capability_scope");
  }
  if (
    input.valid_until !== undefined &&
    input.valid_until !== null &&
    input.valid_until <= new Date()
  ) {
    invalid.push("valid_until");
  }
  if (
    input.revocation_bridge_id !== undefined &&
    input.revocation_bridge_id !== null &&
    !UUID_RE.test(input.revocation_bridge_id)
  ) {
    invalid.push("revocation_bridge_id");
  }
  if (invalid.length > 0) {
    return {
      ok: false,
      code: "INVALID_FIELD",
      httpStatus: 422,
      invalid_fields: invalid,
    };
  }
  // Capability validation: FORBIDDEN first (403), then ALLOWED (422).
  const forbidden = input.capability_scope.filter((c) =>
    TEAM_DELEGATION_FORBIDDEN_CAPABILITIES.has(c),
  );
  if (forbidden.length > 0) {
    return {
      ok: false,
      code: "FORBIDDEN_CAPABILITY",
      httpStatus: 403,
      forbidden,
    };
  }
  const unknown = input.capability_scope.filter(
    (c) => !ALLOWED_CAPABILITY_SET.has(c),
  );
  if (unknown.length > 0) {
    return {
      ok: false,
      code: "INVALID_FIELD",
      httpStatus: 422,
      invalid_fields: ["capability_scope"],
    };
  }
  const supervision_required =
    input.supervision_required === undefined
      ? true
      : input.supervision_required;
  const row = await prisma.teamDelegation.create({
    data: {
      delegator_entity_id: input.delegator_entity_id,
      team_entity_id: input.team_entity_id,
      capability_scope: [...input.capability_scope],
      supervision_required,
      valid_until: input.valid_until ?? null,
      revocation_bridge_id: input.revocation_bridge_id ?? null,
    },
  });
  await writeAuditEvent({
    event_type: "TEAM_DELEGATION_CREATED",
    outcome: "SUCCESS",
    actor_entity_id: row.delegator_entity_id,
    target_entity_id: row.team_entity_id,
    details: {
      delegation_id: row.delegation_id,
      delegator_entity_id: row.delegator_entity_id,
      team_entity_id: row.team_entity_id,
      capability_scope: [...row.capability_scope],
      supervision_required: row.supervision_required,
      valid_from: row.valid_from.toISOString(),
      valid_until: row.valid_until?.toISOString() ?? null,
      status: row.status,
    },
  });
  return { ok: true, delegation: project(row) };
}

// WHAT: Look up a TeamDelegation by delegation_id.
// INPUT: delegation_id (UUID).
// OUTPUT: A TeamDelegationSummary or null.
// WHY: Pure read; no audit emission.
export async function getTeamDelegationById(
  delegation_id: string,
): Promise<TeamDelegationSummary | null> {
  if (!UUID_RE.test(delegation_id)) return null;
  const row = await prisma.teamDelegation.findUnique({
    where: { delegation_id },
  });
  return row === null ? null : project(row);
}

// WHAT: Revoke a TeamDelegation. Sets status to REVOKED +
//        records revoked_at + revoked_by. Row preserved per
//        RULE 10.
// INPUT: delegation_id + revoked_by.
// OUTPUT: RevokeTeamDelegationResult.
// WHY: Idempotent at the audit-event tier; duplicate revocation
//      attempts return 409 ALREADY_REVOKED without re-emitting
//      TEAM_DELEGATION_CREATED.
export async function revokeTeamDelegationForCaller(
  input: RevokeTeamDelegationInput,
): Promise<RevokeTeamDelegationResult> {
  const existing = await prisma.teamDelegation.findUnique({
    where: { delegation_id: input.delegation_id },
  });
  if (existing === null) {
    return { ok: false, code: "NOT_FOUND", httpStatus: 404 };
  }
  if (existing.status === "REVOKED") {
    return {
      ok: false,
      code: "ALREADY_REVOKED",
      httpStatus: 409,
      revoked_at: existing.revoked_at ?? existing.updated_at,
    };
  }
  const updated = await prisma.teamDelegation.update({
    where: { delegation_id: input.delegation_id },
    data: {
      status: "REVOKED",
      revoked_at: new Date(),
      revoked_by: input.revoked_by,
    },
  });
  await writeAuditEvent({
    event_type: "TEAM_DELEGATION_CREATED",
    outcome: "SUCCESS",
    actor_entity_id: input.revoked_by,
    target_entity_id: updated.team_entity_id,
    details: {
      delegation_id: updated.delegation_id,
      delegator_entity_id: updated.delegator_entity_id,
      team_entity_id: updated.team_entity_id,
      capability_scope: [...updated.capability_scope],
      supervision_required: updated.supervision_required,
      valid_from: updated.valid_from.toISOString(),
      valid_until: updated.valid_until?.toISOString() ?? null,
      status: updated.status,
      revoked_at: updated.revoked_at?.toISOString() ?? null,
      revoked_by: updated.revoked_by,
    },
  });
  return { ok: true, delegation: project(updated) };
}
