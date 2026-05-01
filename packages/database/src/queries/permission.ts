// FILE: permission.ts
// PURPOSE: Read and write operations for the Permission table -- the
//          cryptographic governance layer that controls who can read
//          which capsule and for how long. Every function audits its
//          action so Rule 4 holds, and the sovereignty rules (Rule 0)
//          are enforced at create-time before any row is written.
// CONNECTS TO: The Permission, MemoryCapsule, and Entity tables; the
//              audit helper in /audit.ts; and every higher-layer flow
//              (auth, COSMP, COE) that has to ask "is this allowed?"
//              before fetching capsule contents.

import { randomUUID } from "node:crypto";
import type {
  AccessScope,
  DurationType,
  Entity,
  MemoryCapsule,
  Permission,
  Prisma,
} from "@prisma/client";
import { withAudit, writeAudit } from "../audit.js";
import { prisma } from "../client.js";

// WHAT: Default expiration windows for each duration type, in milliseconds.
// INPUT: Used as a lookup table.
// OUTPUT: A number of ms (or null for durations with no fixed expiry).
// WHY: One place to change durations later. SHORT_TERM uses 7 days as
//      a sensible default within the spec's 7-30 day range; callers
//      who want longer SHORT_TERM windows can pass an explicit
//      expires_at.
const DURATION_MS: Record<DurationType, number | null> = {
  TEMPORARY: 24 * 60 * 60 * 1000,
  SHORT_TERM: 7 * 24 * 60 * 60 * 1000,
  LONG_TERM: 365 * 24 * 60 * 60 * 1000,
  PERMANENT: null,
  SESSION_ONLY: null,
  NONE: null,
};

// WHAT: Compute the default expires_at timestamp for a duration type.
// INPUT: The duration type and the moment we are computing relative to.
// OUTPUT: A Date if the duration has a fixed window, null if not.
// WHY: PERMANENT has no expiry. SESSION_ONLY has no fixed expiry yet
//      because the Session model arrives in Section 2; for now we
//      record null and rely on duration_type to mark these. NONE is
//      an explicit block, not a grant, so it has no expiry either.
function defaultExpiresAt(
  durationType: DurationType,
  now: Date = new Date(),
): Date | null {
  const ms = DURATION_MS[durationType];
  return ms === null ? null : new Date(now.getTime() + ms);
}

// WHAT: The shape of the data createPermission expects.
// INPUT: Used as a parameter type only.
// OUTPUT: None -- this is a type, not a value.
// WHY: Required fields name what the caller MUST supply; optional
//      fields name what we will default if omitted.
export interface CreatePermissionInput {
  capsule_id: string;
  grantor_entity_id: string;
  grantee_entity_id: string;
  access_scope: AccessScope;

  bridge_id?: string;
  duration_type?: DurationType;
  can_share_forward?: boolean;
  monetization_active?: boolean;
  valid_from?: Date;
  expires_at?: Date | null;
  conditions?: Record<string, unknown>;

  actor_id?: string | null;
}

// WHAT: Apply the four sovereignty rules at the moment a permission is
//        being created.
// INPUT: The grantor entity, the grantee entity, the capsule, and the
//        duration type the caller chose.
// OUTPUT: Returns silently if the rules pass, throws an Error if not.
// WHY: Rule 0 -- humans are always sovereign. We enforce these in
//      code, not in policy: only humans grant long permissions, AI
//      agents cannot grant to AI agents, the grantor must own the
//      capsule's wallet.
function assertSovereigntyRules(args: {
  grantor: Entity;
  grantee: Entity;
  capsule: Pick<MemoryCapsule, "entity_id">;
  durationType: DurationType;
}): void {
  if (args.capsule.entity_id !== args.grantor.entity_id) {
    throw new Error(
      "Sovereignty: grantor_entity_id must own the capsule's wallet",
    );
  }
  if (
    (args.durationType === "LONG_TERM" || args.durationType === "PERMANENT") &&
    args.grantor.entity_type !== "PERSON"
  ) {
    throw new Error(
      `Sovereignty: only PERSON entities can grant ${args.durationType} access`,
    );
  }
  if (
    args.grantor.entity_type === "AI_AGENT" &&
    args.grantee.entity_type === "AI_AGENT"
  ) {
    throw new Error(
      "Sovereignty: AI_AGENT entities cannot grant permissions to other AI_AGENT entities",
    );
  }
}

// WHAT: Pick the default duration type for a grantor when none is given.
// INPUT: The grantor entity.
// OUTPUT: A DurationType.
// WHY: AI_AGENT entities default to SESSION_ONLY (per spec). All other
//      entity types default to TEMPORARY -- the most restrictive grant
//      that still grants something, in keeping with Rule 0.
function defaultDurationFor(grantor: Entity): DurationType {
  return grantor.entity_type === "AI_AGENT" ? "SESSION_ONLY" : "TEMPORARY";
}

// WHAT: Insert one Permission row plus its audit entry, atomically.
// INPUT: A CreatePermissionInput.
// OUTPUT: The newly created Permission row.
// WHY: This is the only legal way to grant access in the system. The
//      sovereignty checks run inside the same transaction as the
//      insert and the audit write -- if any of those three steps
//      fails, the whole grant rolls back.
export async function createPermission(
  input: CreatePermissionInput,
): Promise<Permission> {
  const newPermissionId = randomUUID();
  const bridgeId = input.bridge_id ?? randomUUID();

  return prisma.$transaction(async (tx) => {
    const grantor = await tx.entity.findUnique({
      where: { entity_id: input.grantor_entity_id },
    });
    if (grantor === null) {
      throw new Error(
        `Grantor entity ${input.grantor_entity_id} not found`,
      );
    }
    const grantee = await tx.entity.findUnique({
      where: { entity_id: input.grantee_entity_id },
    });
    if (grantee === null) {
      throw new Error(
        `Grantee entity ${input.grantee_entity_id} not found`,
      );
    }
    const capsule = await tx.memoryCapsule.findUnique({
      where: { capsule_id: input.capsule_id },
      select: { capsule_id: true, entity_id: true },
    });
    if (capsule === null) {
      throw new Error(`Capsule ${input.capsule_id} not found`);
    }

    const durationType = input.duration_type ?? defaultDurationFor(grantor);

    assertSovereigntyRules({
      grantor,
      grantee,
      capsule,
      durationType,
    });

    const validFrom = input.valid_from ?? new Date();
    const expiresAt =
      input.expires_at !== undefined
        ? input.expires_at
        : defaultExpiresAt(durationType, validFrom);

    const created = await tx.permission.create({
      data: {
        permission_id: newPermissionId,
        bridge_id: bridgeId,
        capsule_id: input.capsule_id,
        grantor_entity_id: input.grantor_entity_id,
        grantee_entity_id: input.grantee_entity_id,
        access_scope: input.access_scope,
        duration_type: durationType,
        can_share_forward: input.can_share_forward ?? false,
        monetization_active: input.monetization_active ?? false,
        valid_from: validFrom,
        expires_at: expiresAt,
        conditions: (input.conditions ?? {}) as Prisma.InputJsonValue,
      },
    });

    await writeAudit(tx, {
      action: "PERMISSION_CREATE",
      entity_id: input.grantor_entity_id,
      actor_id: input.actor_id ?? input.grantor_entity_id,
      meta: {
        permission_id: newPermissionId,
        bridge_id: bridgeId,
        capsule_id: input.capsule_id,
        grantee_entity_id: input.grantee_entity_id,
        duration_type: durationType,
        access_scope: input.access_scope,
      },
    });

    return created;
  });
}

// WHAT: Create one bridge of permissions -- one row per capsule, all
//        sharing the same bridge_id so they can be revoked together.
// INPUT: An array of capsule_ids, the grantor and grantee entity_ids,
//        the access scope, plus optional duration / actor.
// OUTPUT: The list of newly created Permission rows.
// WHY: A user often grants access to a set of capsules at once
//      ("share my last 30 messages with this analyst"). Bundling them
//      under one bridge_id lets the human revoke the whole group in
//      one click later.
export async function createPermissionBridge(
  capsuleIds: string[],
  grantorId: string,
  granteeId: string,
  scope: AccessScope,
  options: {
    duration_type?: DurationType;
    can_share_forward?: boolean;
    expires_at?: Date | null;
    conditions?: Record<string, unknown>;
    actor_id?: string | null;
  } = {},
): Promise<Permission[]> {
  if (capsuleIds.length === 0) {
    throw new Error("createPermissionBridge requires at least one capsule_id");
  }
  const bridgeId = randomUUID();

  const created: Permission[] = [];
  for (const capsuleId of capsuleIds) {
    const permission = await createPermission({
      capsule_id: capsuleId,
      grantor_entity_id: grantorId,
      grantee_entity_id: granteeId,
      access_scope: scope,
      bridge_id: bridgeId,
      duration_type: options.duration_type,
      can_share_forward: options.can_share_forward,
      expires_at: options.expires_at,
      conditions: options.conditions,
      actor_id: options.actor_id,
    });
    created.push(permission);
  }
  return created;
}

// WHAT: Decide whether a requesting entity currently has access to a
//        capsule, and return the active permission if so.
// INPUT: The capsule_id, the requesting entity_id, and an optional
//        actor_id for the audit row.
// OUTPUT: The active Permission record if access is currently granted,
//         otherwise null.
// WHY: This is the gate every read flow has to pass. We refuse access
//      if any explicit-block (NONE) row matches, even when other
//      grants exist -- a human-issued block always wins.
export async function checkPermission(
  capsuleId: string,
  requestingEntityId: string,
  actorId: string | null = null,
): Promise<Permission | null> {
  return prisma.$transaction(async (tx) => {
    const now = new Date();

    const candidates = await tx.permission.findMany({
      where: {
        capsule_id: capsuleId,
        grantee_entity_id: requestingEntityId,
        status: "ACTIVE",
        valid_from: { lte: now },
        OR: [{ expires_at: null }, { expires_at: { gt: now } }],
      },
      orderBy: { created_at: "desc" },
    });

    const blocked = candidates.some((p) => p.duration_type === "NONE");
    const grant = blocked
      ? null
      : (candidates.find((p) => p.duration_type !== "NONE") ?? null);

    await writeAudit(tx, {
      action: "PERMISSION_CHECK",
      entity_id: requestingEntityId,
      actor_id: actorId,
      meta: {
        capsule_id: capsuleId,
        result: grant !== null ? "granted" : blocked ? "blocked" : "denied",
        permission_id: grant?.permission_id ?? null,
      },
    });

    return grant;
  });
}

// WHAT: Mark one Permission row as revoked.
// INPUT: The permission_id, the entity_id of who is revoking it, and
//        an optional actor_id.
// OUTPUT: The updated Permission row.
// WHY: Revoking is how a human pulls back access. We stamp who did it
//      and when so the audit trail is permanent.
export async function revokePermission(
  permissionId: string,
  revokedByEntityId: string,
  actorId: string | null = null,
): Promise<Permission> {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.permission.update({
      where: { permission_id: permissionId },
      data: {
        status: "REVOKED",
        revoked_at: new Date(),
        revoked_by_entity_id: revokedByEntityId,
      },
    });

    await writeAudit(tx, {
      action: "PERMISSION_REVOKE",
      entity_id: updated.grantor_entity_id,
      actor_id: actorId ?? revokedByEntityId,
      meta: {
        permission_id: permissionId,
        revoked_by: revokedByEntityId,
      },
    });

    return updated;
  });
}

// WHAT: Revoke every Permission row sharing a bridge_id at once.
// INPUT: The bridge_id, the entity_id of who is revoking, and an
//        optional actor_id.
// OUTPUT: The number of rows that were revoked (was-ACTIVE before).
// WHY: When a human granted N capsules in one action, they should be
//      able to undo that action in one click. The bridge_id is the
//      group key. Already-REVOKED or EXPIRED rows are left alone.
export async function revokeBridge(
  bridgeId: string,
  revokedByEntityId: string,
  actorId: string | null = null,
): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const targets = await tx.permission.findMany({
      where: { bridge_id: bridgeId, status: "ACTIVE" },
      select: { permission_id: true, grantor_entity_id: true },
    });

    const result = await tx.permission.updateMany({
      where: { bridge_id: bridgeId, status: "ACTIVE" },
      data: {
        status: "REVOKED",
        revoked_at: now,
        revoked_by_entity_id: revokedByEntityId,
      },
    });

    await writeAudit(tx, {
      action: "PERMISSION_BRIDGE_REVOKE",
      entity_id: targets[0]?.grantor_entity_id ?? null,
      actor_id: actorId ?? revokedByEntityId,
      meta: {
        bridge_id: bridgeId,
        revoked_count: result.count,
        revoked_by: revokedByEntityId,
        permission_ids: targets.map((t) => t.permission_id),
      },
    });

    return result.count;
  });
}

// WHAT: List every permission this entity has granted to others.
// INPUT: The entity_id and an optional actor_id for the audit row.
// OUTPUT: An array of Permission rows, newest first.
// WHY: Settings UIs need to show "who has access to my data" so the
//      human can review and revoke. Audited like every read.
export async function listPermissionsGranted(
  entityId: string,
  actorId: string | null = null,
): Promise<Permission[]> {
  return withAudit(
    {
      action: "PERMISSION_LIST_GRANTED",
      entity_id: entityId,
      actor_id: actorId,
      meta: {},
    },
    async (tx) => {
      return tx.permission.findMany({
        where: { grantor_entity_id: entityId },
        orderBy: { created_at: "desc" },
      });
    },
  );
}

// WHAT: List every permission this entity has received from others.
// INPUT: The entity_id and an optional actor_id for the audit row.
// OUTPUT: An array of Permission rows, newest first.
// WHY: Symmetric to listPermissionsGranted -- a grantee may want to
//      see what they are allowed to read across the system.
export async function listPermissionsReceived(
  entityId: string,
  actorId: string | null = null,
): Promise<Permission[]> {
  return withAudit(
    {
      action: "PERMISSION_LIST_RECEIVED",
      entity_id: entityId,
      actor_id: actorId,
      meta: {},
    },
    async (tx) => {
      return tx.permission.findMany({
        where: { grantee_entity_id: entityId },
        orderBy: { created_at: "desc" },
      });
    },
  );
}

// WHAT: Sweep through ACTIVE permissions whose expires_at has passed
//        and mark them EXPIRED.
// INPUT: An optional clock to make tests deterministic.
// OUTPUT: The count of permissions that were just expired.
// WHY: A background job runs this to clean up the registry. Doing it
//      in a single transaction with one summary audit row keeps the
//      sweep cheap even when many permissions expire at once.
export async function expireOldPermissions(
  now: Date = new Date(),
): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const targets = await tx.permission.findMany({
      where: {
        status: "ACTIVE",
        expires_at: { not: null, lte: now },
      },
      select: { permission_id: true },
    });

    if (targets.length === 0) {
      await writeAudit(tx, {
        action: "PERMISSION_EXPIRY_SWEEP",
        meta: { count: 0, swept_at: now.toISOString() },
      });
      return 0;
    }

    const ids = targets.map((t) => t.permission_id);
    const result = await tx.permission.updateMany({
      where: { permission_id: { in: ids } },
      data: { status: "EXPIRED" },
    });

    await writeAudit(tx, {
      action: "PERMISSION_EXPIRY_SWEEP",
      meta: {
        count: result.count,
        swept_at: now.toISOString(),
        permission_ids: ids,
      },
    });

    return result.count;
  });
}

export { prisma } from "../client.js";
