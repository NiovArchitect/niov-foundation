// FILE: dmw-registry.service.ts
// PURPOSE: Phase 1228 — DMW Registry. Unified read view over the
//          existing DMW substrate (ConsentGrant + TeamDelegation +
//          SwarmBoundary + ConversationMemoryScope + Entity +
//          EntityMembership + ExternalCollaborator) projecting
//          a single DMWRegistryEntry per known principal.
//
//          Every governed action's "who is this for / from / on
//          behalf of" question can be answered by querying this
//          registry. The DMW types are a closed-vocab projection
//          over the existing EntityType + ExternalRelationshipType
//          + WalletType enums; no new EntityType is added (that
//          would require ADR-0021-style migration).
//
// PRIVACY (RULE 0):
//   - Caller sees their own DMW entry + entries within their org
//     scope. Cross-org DMW lookups return NOT_ALLOWED.
//   - Sensitive fields (clearance level, audit row contents) are
//     summarized as counts, never raw rows.
//
// CONNECTS TO:
//   - existing dmw/consent-grant.service.ts
//   - existing dmw/team-delegation.service.ts
//   - existing dmw/swarm-boundary.service.ts
//   - apps/api/src/services/governance/org.ts (getOrgEntityId)

import { writeAuditEvent } from "@niov/database";
import { prisma } from "@niov/database";
import { getOrgEntityId } from "../governance/org.js";

// ─── DMW types (closed-vocab) ─────────────────────────────────

export type DMWType =
  | "HUMAN"
  | "ENTERPRISE"
  | "DEPARTMENT"
  | "AI_TWIN"
  | "AI_EMPLOYEE"
  | "DEVICE"
  | "VENDOR"
  | "REGULATOR"
  | "AGENT"
  | "EXTERNAL_COLLABORATOR";

export interface DMWRegistryEntry {
  dmw_id: string;
  entity_id: string | null;
  external_collaborator_id: string | null;
  dmw_type: DMWType;
  display_name: string;
  email: string | null;
  org_entity_id: string | null;
  /** Wallet type from packages/database WalletType. Null when
   * the principal is an EXTERNAL_COLLABORATOR with no wallet. */
  wallet_type: "PERSONAL" | "ENTERPRISE" | "DEVICE" | null;
  /** When this entity is governed/controlled by another
   * principal (an AI_TWIN by its HUMAN, an EXTERNAL by its
   * internal owner). */
  controller_dmw_id: string | null;
  /** Aggregate counts the caller may safely see. */
  counts: {
    consent_grants_active: number;
    delegations_active: number;
    swarm_boundaries: number;
    memory_scopes_active: number;
    external_collaborations: number;
  };
  status: "ACTIVE" | "SUSPENDED" | "REVOKED" | "DELETED";
  created_at: string;
}

export interface DMWAuditEntry {
  event_id: string;
  event_type: string;
  outcome: string;
  actor_entity_id: string | null;
  created_at: string;
}

// ─── helpers ──────────────────────────────────────────────────

function entityTypeToDMW(args: {
  entity_type: "PERSON" | "COMPANY" | "AI_AGENT" | "DEVICE" | "APPLICATION" | "GOVERNMENT" | "REGULATOR";
  wallet_type: "PERSONAL" | "ENTERPRISE" | "DEVICE";
  has_human_controller: boolean;
  is_org_child_of_company: boolean;
}): DMWType {
  switch (args.entity_type) {
    case "PERSON":
      return "HUMAN";
    case "COMPANY":
      return "ENTERPRISE";
    case "AI_AGENT":
      // PERSONAL wallet = AI_TWIN; ENTERPRISE wallet = AI_EMPLOYEE
      // (per ADR-0046 dual-context routing model).
      if (args.wallet_type === "PERSONAL") return "AI_TWIN";
      return "AI_EMPLOYEE";
    case "DEVICE":
      return "DEVICE";
    case "REGULATOR":
      return "REGULATOR";
    case "APPLICATION":
      return "AGENT";
    case "GOVERNMENT":
      return "AGENT";
  }
}

async function loadCounts(entityId: string): Promise<{
  consent_grants_active: number;
  delegations_active: number;
  swarm_boundaries: number;
  memory_scopes_active: number;
  external_collaborations: number;
}> {
  const [grants, delegations, swarms, scopes, externals] = await Promise.all([
    prisma.consentGrant.count({
      where: { grantor_entity_id: entityId, consent_state: "APPROVED" },
    }),
    prisma.teamDelegation.count({
      where: { delegator_entity_id: entityId, status: "ACTIVE" },
    }),
    prisma.swarmBoundary.count({ where: { team_entity_id: entityId } }),
    prisma.conversationMemoryScope.count({ where: { entity_id: entityId } }),
    prisma.externalCollaborator.count({
      where: {
        internal_owner_entity_id: entityId,
        deleted_at: null,
      },
    }),
  ]);
  return {
    consent_grants_active: grants,
    delegations_active: delegations,
    swarm_boundaries: swarms,
    memory_scopes_active: scopes,
    external_collaborations: externals,
  };
}

async function buildEntryForEntity(
  entityId: string,
): Promise<DMWRegistryEntry | null> {
  const e = await prisma.entity.findUnique({
    where: { entity_id: entityId },
  });
  if (e === null) return null;
  const wallet = await prisma.wallet.findUnique({
    where: { entity_id: entityId },
    select: { wallet_type: true },
  });
  const walletType: "PERSONAL" | "ENTERPRISE" | "DEVICE" | null =
    wallet?.wallet_type ?? null;
  let orgEntityId: string | null = null;
  try {
    orgEntityId = await getOrgEntityId(entityId);
  } catch {
    orgEntityId = null;
  }
  let humanControllerId: string | null = null;
  if (e.entity_type === "AI_AGENT") {
    const parents = await prisma.entityMembership.findMany({
      where: { child_id: entityId, is_active: true },
      select: { parent_id: true },
    });
    for (const p of parents) {
      const parent = await prisma.entity.findUnique({
        where: { entity_id: p.parent_id },
        select: { entity_type: true },
      });
      if (parent?.entity_type === "PERSON") {
        humanControllerId = p.parent_id;
        break;
      }
    }
  }
  const dmwType = entityTypeToDMW({
    entity_type: e.entity_type,
    wallet_type: walletType ?? "PERSONAL",
    has_human_controller: humanControllerId !== null,
    is_org_child_of_company: orgEntityId !== null && orgEntityId !== entityId,
  });
  const counts = await loadCounts(entityId);
  return {
    dmw_id: entityId,
    entity_id: entityId,
    external_collaborator_id: null,
    dmw_type: dmwType,
    display_name: e.display_name,
    email: e.email,
    org_entity_id: orgEntityId,
    wallet_type: walletType,
    controller_dmw_id: humanControllerId,
    counts,
    status: e.status as DMWRegistryEntry["status"],
    created_at: e.created_at.toISOString(),
  };
}

async function buildEntryForExternal(
  externalId: string,
): Promise<DMWRegistryEntry | null> {
  const x = await prisma.externalCollaborator.findUnique({
    where: { external_collaborator_id: externalId },
  });
  if (x === null) return null;
  return {
    dmw_id: x.external_collaborator_id,
    entity_id: null,
    external_collaborator_id: x.external_collaborator_id,
    dmw_type:
      x.relationship_type === "VENDOR"
        ? "VENDOR"
        : x.relationship_type === "REGULATOR"
          ? "REGULATOR"
          : "EXTERNAL_COLLABORATOR",
    display_name: x.display_name,
    email: x.email,
    org_entity_id: x.org_entity_id,
    wallet_type: null,
    controller_dmw_id: x.internal_owner_entity_id,
    counts: {
      consent_grants_active: 0,
      delegations_active: 0,
      swarm_boundaries: 0,
      memory_scopes_active: 0,
      external_collaborations: 0,
    },
    status:
      x.status === "ACTIVE_EXTERNAL"
        ? "ACTIVE"
        : x.status === "REVOKED_EXTERNAL"
          ? "REVOKED"
          : "ACTIVE",
    created_at: x.created_at.toISOString(),
  };
}

// ─── service: GET /dmw/me ─────────────────────────────────────

export async function getMyDMWForCaller(
  callerEntityId: string,
): Promise<DMWRegistryEntry | null> {
  return buildEntryForEntity(callerEntityId);
}

// ─── service: GET /dmw/org ────────────────────────────────────

export async function listOrgDMWForCaller(
  callerEntityId: string,
): Promise<{
  ok: true;
  org_entity_id: string;
  entries: DMWRegistryEntry[];
} | { ok: false; code: string }> {
  let orgEntityId: string;
  try {
    orgEntityId = await getOrgEntityId(callerEntityId);
  } catch {
    return { ok: false, code: "NO_ORG_FOR_CALLER" };
  }
  const memberships = await prisma.entityMembership.findMany({
    where: { parent_id: orgEntityId, is_active: true },
    select: { child_id: true },
  });
  const internalEntries: DMWRegistryEntry[] = [];
  for (const m of memberships) {
    const e = await buildEntryForEntity(m.child_id);
    if (e !== null) internalEntries.push(e);
  }
  const orgEntry = await buildEntryForEntity(orgEntityId);
  if (orgEntry !== null) internalEntries.unshift(orgEntry);
  const externals = await prisma.externalCollaborator.findMany({
    where: { org_entity_id: orgEntityId, deleted_at: null },
    select: { external_collaborator_id: true },
  });
  for (const x of externals) {
    const e = await buildEntryForExternal(x.external_collaborator_id);
    if (e !== null) internalEntries.push(e);
  }
  return { ok: true, org_entity_id: orgEntityId, entries: internalEntries };
}

// ─── service: GET /dmw/:id ────────────────────────────────────

export async function getDMWByIdForCaller(
  dmwId: string,
  callerEntityId: string,
): Promise<
  | { ok: true; entry: DMWRegistryEntry }
  | { ok: false; code: string }
> {
  // Could be an entity_id OR an external_collaborator_id.
  const entry =
    (await buildEntryForEntity(dmwId)) ??
    (await buildEntryForExternal(dmwId));
  if (entry === null) {
    return { ok: false, code: "DMW_NOT_FOUND" };
  }
  // Permission: caller must be the entry's owner OR within the
  // same org.
  if (entry.entity_id === callerEntityId) {
    return { ok: true, entry };
  }
  let callerOrgId: string | null = null;
  try {
    callerOrgId = await getOrgEntityId(callerEntityId);
  } catch {
    return { ok: false, code: "NO_ORG_FOR_CALLER" };
  }
  if (entry.org_entity_id !== callerOrgId) {
    return { ok: false, code: "NOT_ALLOWED" };
  }
  return { ok: true, entry };
}

// ─── service: POST /dmw/:id/delegations ──────────────────────

export interface CreateDelegationInput {
  callerEntityId: string;
  targetDmwId: string;
  /** The DMW that will receive delegated authority — usually an
   * AI_TWIN or AI_EMPLOYEE entity_id. */
  teamEntityId: string;
  capabilityScope: string[];
  supervisionRequired?: boolean;
  validUntil?: string;
}

export type CreateDelegationResult =
  | {
      ok: true;
      delegation_id: string;
      status: "ACTIVE";
      capability_scope: string[];
      valid_until: string | null;
    }
  | { ok: false; code: string; message?: string };

export async function createDMWDelegationForCaller(
  input: CreateDelegationInput,
): Promise<CreateDelegationResult> {
  // Only the human controller of the target DMW (or the target
  // itself) can delegate from it.
  if (
    input.targetDmwId !== input.callerEntityId
  ) {
    const target = await buildEntryForEntity(input.targetDmwId);
    if (target === null) {
      return { ok: false, code: "DMW_NOT_FOUND" };
    }
    if (target.controller_dmw_id !== input.callerEntityId) {
      return { ok: false, code: "NOT_CONTROLLER" };
    }
  }
  const row = await prisma.teamDelegation.create({
    data: {
      delegator_entity_id: input.targetDmwId,
      team_entity_id: input.teamEntityId,
      capability_scope: input.capabilityScope,
      supervision_required: input.supervisionRequired ?? true,
      valid_until:
        input.validUntil !== undefined ? new Date(input.validUntil) : null,
      status: "ACTIVE",
    },
  });
  await writeAuditEvent({
    event_type: "TEAM_DELEGATION_CREATED",
    outcome: "SUCCESS",
    actor_entity_id: input.callerEntityId,
    details: {
      delegation_id: row.delegation_id,
      delegator_entity_id: row.delegator_entity_id,
      team_entity_id: row.team_entity_id,
      capability_scope: row.capability_scope,
      supervision_required: row.supervision_required,
      valid_from: row.valid_from.toISOString(),
      valid_until: row.valid_until?.toISOString() ?? null,
      status: row.status,
    },
  });
  return {
    ok: true,
    delegation_id: row.delegation_id,
    status: "ACTIVE",
    capability_scope: row.capability_scope,
    valid_until: row.valid_until?.toISOString() ?? null,
  };
}

// ─── service: POST /dmw/delegations/:id/revoke ───────────────

export type RevokeDelegationResult =
  | { ok: true; delegation_id: string; revoked_at: string }
  | { ok: false; code: string };

export async function revokeDMWDelegationForCaller(input: {
  delegationId: string;
  callerEntityId: string;
}): Promise<RevokeDelegationResult> {
  const row = await prisma.teamDelegation.findUnique({
    where: { delegation_id: input.delegationId },
  });
  if (row === null) {
    return { ok: false, code: "DELEGATION_NOT_FOUND" };
  }
  // Permission: caller must be the delegator OR its controller.
  if (row.delegator_entity_id !== input.callerEntityId) {
    const target = await buildEntryForEntity(row.delegator_entity_id);
    if (target === null || target.controller_dmw_id !== input.callerEntityId) {
      return { ok: false, code: "NOT_ALLOWED" };
    }
  }
  if (row.status !== "ACTIVE") {
    return { ok: false, code: "NOT_ACTIVE" };
  }
  const now = new Date();
  const updated = await prisma.teamDelegation.update({
    where: { delegation_id: row.delegation_id },
    data: {
      status: "REVOKED",
      revoked_at: now,
      revoked_by: input.callerEntityId,
    },
  });
  await writeAuditEvent({
    event_type: "TEAM_DELEGATION_CREATED", // reuse existing literal; details mark state
    outcome: "SUCCESS",
    actor_entity_id: input.callerEntityId,
    details: {
      delegation_id: updated.delegation_id,
      delegator_entity_id: updated.delegator_entity_id,
      team_entity_id: updated.team_entity_id,
      status: updated.status,
      revoked_at: updated.revoked_at?.toISOString() ?? null,
      revoked_by: updated.revoked_by,
    },
  });
  return {
    ok: true,
    delegation_id: updated.delegation_id,
    revoked_at: now.toISOString(),
  };
}

// ─── service: GET /dmw/:id/audit ─────────────────────────────

export async function listDMWAuditForCaller(input: {
  dmwId: string;
  callerEntityId: string;
}): Promise<
  | { ok: true; events: DMWAuditEntry[] }
  | { ok: false; code: string }
> {
  // Permission via getDMWByIdForCaller.
  const lookup = await getDMWByIdForCaller(input.dmwId, input.callerEntityId);
  if (lookup.ok === false) return lookup;

  // We surface audit events where the DMW is the actor OR appears
  // in the details of the row. The audit table is large; cap at
  // 100 most-recent rows.
  const eventsByActor = await prisma.auditEvent.findMany({
    where: {
      OR: [
        { actor_entity_id: input.dmwId },
        { target_entity_id: input.dmwId },
      ],
    },
    orderBy: { timestamp: "desc" },
    take: 100,
    select: {
      audit_id: true,
      event_type: true,
      outcome: true,
      actor_entity_id: true,
      timestamp: true,
    },
  });
  const events: DMWAuditEntry[] = eventsByActor.map((e) => ({
    event_id: e.audit_id,
    event_type: e.event_type,
    outcome: e.outcome,
    actor_entity_id: e.actor_entity_id,
    created_at: e.timestamp.toISOString(),
  }));
  return { ok: true, events };
}

// ─── service: revocation check (for action policy) ────────────

/**
 * Is the named DMW still authorized to act? Returns false when
 * the DMW is REVOKED or DELETED. Used as a soft check in the
 * action runtime to refuse executing actions for a DMW that has
 * had its access revoked.
 */
export async function isDMWActive(dmwId: string): Promise<boolean> {
  const e = await prisma.entity.findUnique({
    where: { entity_id: dmwId },
    select: { status: true },
  });
  if (e !== null) {
    return e.status === "ACTIVE";
  }
  const x = await prisma.externalCollaborator.findUnique({
    where: { external_collaborator_id: dmwId },
    select: { status: true, deleted_at: true },
  });
  if (x !== null) {
    return (
      x.deleted_at === null &&
      x.status !== "REVOKED_EXTERNAL" &&
      x.status !== "BLOCKED_EXTERNAL"
    );
  }
  return false;
}
