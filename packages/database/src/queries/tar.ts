// FILE: tar.ts
// PURPOSE: Read and write operations for the TokenAttributeRepository
//          (TAR) and the related Session table. Every entity has one
//          TAR, auto-created by createEntity. The TAR carries the
//          eight capability flags, the clearance ceiling, and the
//          compliance frameworks the entity is bound by. Mutations
//          recompute tar_hash and invalidate every active session for
//          the entity in one transaction.
// CONNECTS TO: token_attribute_repositories and sessions tables; the
//              entity table (sovereignty defaults); the audit helper;
//              and createEntity which calls createTARInTx.

import { createHash, randomUUID } from "node:crypto";
import { CRYPTO_CONFIG } from "@niov/auth";
import type {
  EntityType,
  MonetizationRole,
  Prisma,
  Session,
  TokenAttributeRepository,
} from "@prisma/client";
import { withAudit, writeAudit } from "../audit.js";
import { prisma } from "../client.js";

// WHAT: The eight capability flag names that live on a TAR.
// INPUT: Used as a parameter type for checkCapability and
//        updateTARPermissions.
// OUTPUT: None -- this is a type, not a value.
// WHY: Naming the keys keeps callers from passing typos. The set is
//      closed (the spec lists exactly these eight); future capability
//      flags would require a schema change anyway.
export type TARCapability =
  | "can_login"
  | "can_read_capsules"
  | "can_write_capsules"
  | "can_share_capsules"
  | "can_create_hives"
  | "can_access_external_api"
  | "can_admin_niov"
  | "can_admin_org";

// WHAT: The shape of fields updateTARPermissions accepts.
// INPUT: Used as a parameter type only.
// OUTPUT: None.
// WHY: Lets callers pass any subset; only the supplied fields change.
export interface TARPermissionsUpdate {
  can_login?: boolean;
  can_read_capsules?: boolean;
  can_write_capsules?: boolean;
  can_share_capsules?: boolean;
  can_create_hives?: boolean;
  can_access_external_api?: boolean;
  can_admin_niov?: boolean;
  can_admin_org?: boolean;
  clearance_ceiling?: number;
  monetization_role?: MonetizationRole;
  compliance_frameworks?: string[];
  status?: "ACTIVE" | "REVOKED" | "SUSPENDED";
}

// WHAT: Lower bound on clearance_ceiling.
// WHY: Same 0..6 ladder as Entity. Zero means public-only capability.
export const MIN_TAR_CEILING = 0;

// WHAT: Upper bound on clearance_ceiling.
// WHY: Six is the top of the ladder ("top secret"). Even PERSON tops
//      out here.
export const MAX_TAR_CEILING = 6;

// WHAT: Throw if a clearance level is outside 0..6.
// INPUT: A candidate ceiling.
// OUTPUT: Returns silently if valid, throws if not.
// WHY: Defensive validation -- bad ceilings would corrupt every
//      downstream permission decision.
function assertCeiling(level: number): void {
  if (
    !Number.isInteger(level) ||
    level < MIN_TAR_CEILING ||
    level > MAX_TAR_CEILING
  ) {
    throw new Error(
      `clearance_ceiling must be an integer between ${MIN_TAR_CEILING} and ${MAX_TAR_CEILING} (got ${level})`,
    );
  }
}

// WHAT: Hardcoded sovereignty defaults for clearance_ceiling, indexed
//        by entity_type.
// INPUT: Used as a lookup table.
// OUTPUT: A number 0..6.
// WHY: Rule 0 -- AI agents and devices always start lower than humans.
//      Centralizing the table here means policy changes happen in one
//      place. ROBOT is intentionally absent because EntityType has no
//      ROBOT value yet. REGULATOR has no inherent clearance ceiling
//      (default 0) per ADR-0036 Sub-decision 1; access is governed by
//      LawfulBasis scope (Sub-decision 3-5) + regulator authority scope
//      (Sub-decision 2) + credentialing-authority verification
//      (Sub-decision 7) + dual-control gate on grant routes
//      (Sub-decision 6).
const DEFAULT_CEILING_BY_TYPE: Record<EntityType, number> = {
  PERSON: 6,
  COMPANY: 4,
  GOVERNMENT: 4,
  APPLICATION: 2,
  AI_AGENT: 2,
  DEVICE: 1,
  REGULATOR: 0,
};

// WHAT: Pick the default clearance_ceiling for a fresh TAR.
// INPUT: The owning entity's type.
// OUTPUT: A number in 0..6.
// WHY: Sovereignty rule -- new TARs cannot start above the type's
//      ceiling.
export function defaultCeilingFor(entityType: EntityType): number {
  return DEFAULT_CEILING_BY_TYPE[entityType];
}

// WHAT: Convert any JS value into a deterministic JSON string with
//        sorted object keys.
// INPUT: Any JS value.
// OUTPUT: A canonical JSON string.
// WHY: Same trick as audit_events -- gives us a stable hash input
//      regardless of property insertion order.
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalJson).join(",") + "]";
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return (
    "{" +
    keys
      .map((k) => JSON.stringify(k) + ":" + canonicalJson(obj[k]))
      .join(",") +
    "}"
  );
}

// WHAT: The fields that participate in tar_hash.
// INPUT: A subset of TAR fields.
// OUTPUT: None -- this is a type.
// WHY: Keeping policy fields and identity fields apart makes it
//      explicit that a TAR rename or version bump alone does NOT
//      change the hash; only policy changes do.
export interface TARHashableFields {
  can_login: boolean;
  can_read_capsules: boolean;
  can_write_capsules: boolean;
  can_share_capsules: boolean;
  can_create_hives: boolean;
  can_access_external_api: boolean;
  can_admin_niov: boolean;
  can_admin_org: boolean;
  clearance_ceiling: number;
  monetization_role: MonetizationRole;
  compliance_frameworks: string[];
  status: "ACTIVE" | "REVOKED" | "SUSPENDED";
}

// WHAT: Compute the SHA-256 hex hash of a TAR's policy fields.
// INPUT: A TARHashableFields-shaped object.
// OUTPUT: A 64-character hex string.
// WHY: Sessions carry this hash at issue time. When the TAR's policy
//      changes the hash changes, and any session bearing the old hash
//      is invalidated. Sorted compliance_frameworks make the hash
//      stable across reorderings.
export function computeTARHash(fields: TARHashableFields): string {
  const canonical = canonicalJson({
    can_login: fields.can_login,
    can_read_capsules: fields.can_read_capsules,
    can_write_capsules: fields.can_write_capsules,
    can_share_capsules: fields.can_share_capsules,
    can_create_hives: fields.can_create_hives,
    can_access_external_api: fields.can_access_external_api,
    can_admin_niov: fields.can_admin_niov,
    can_admin_org: fields.can_admin_org,
    clearance_ceiling: fields.clearance_ceiling,
    monetization_role: fields.monetization_role,
    compliance_frameworks: [...fields.compliance_frameworks].sort(),
    status: fields.status,
  });
  return createHash(CRYPTO_CONFIG.HASH_ALGORITHM).update(canonical).digest("hex");
}

// WHAT: Build the initial TARHashableFields for a brand new TAR.
// INPUT: The owning entity's type.
// OUTPUT: A TARHashableFields with sovereignty-correct defaults.
// WHY: New TARs always start with the schema-default capabilities
//      and a clearance_ceiling derived from entity_type, never the
//      schema default of 0.
function initialPolicyFor(entityType: EntityType): TARHashableFields {
  return {
    can_login: true,
    can_read_capsules: true,
    can_write_capsules: true,
    can_share_capsules: true,
    can_create_hives: false,
    can_access_external_api: false,
    can_admin_niov: false,
    can_admin_org: false,
    clearance_ceiling: defaultCeilingFor(entityType),
    monetization_role: "NEITHER",
    compliance_frameworks: [],
    status: "ACTIVE",
  };
}

// WHAT: Insert a TAR row using an open transaction handle.
// INPUT: A transaction client, the entity_id, and the entity's type
//        (used for sovereignty defaults).
// OUTPUT: The newly created TAR record.
// WHY: createEntity needs to create entity, wallet, AND tar in one
//      atomic transaction. Exposing this transaction-aware flavor
//      lets entity.ts call it without opening a second transaction.
export async function createTARInTx(
  tx: Prisma.TransactionClient,
  params: { entity_id: string; entity_type: EntityType; tar_id?: string },
): Promise<TokenAttributeRepository> {
  const tar_id = params.tar_id ?? randomUUID();
  const policy = initialPolicyFor(params.entity_type);
  const tar_hash = computeTARHash(policy);

  return tx.tokenAttributeRepository.create({
    data: {
      tar_id,
      entity_id: params.entity_id,
      ...policy,
      tar_version: 1,
      tar_hash,
    },
  });
}

// WHAT: Write a TAR_CREATE audit row inside an existing transaction.
// INPUT: The transaction handle, the new TAR, and the actor_id.
// OUTPUT: A promise that resolves once the audit row is written.
// WHY: createEntity emits ENTITY_CREATE + WALLET_CREATE + TAR_CREATE
//      so the audit log shows all three legs of the atomic init.
export async function writeTARCreateAudit(
  tx: Prisma.TransactionClient,
  tar: TokenAttributeRepository,
  actorId: string | null,
): Promise<void> {
  await writeAudit(tx, {
    action: "TAR_CREATE",
    entity_id: tar.entity_id,
    actor_id: actorId,
    meta: {
      tar_id: tar.tar_id,
      clearance_ceiling: tar.clearance_ceiling,
      tar_hash: tar.tar_hash,
    },
  });
}

// WHAT: Create a TAR for an entity that does not yet have one.
// INPUT: The entity_id and an optional actor_id.
// OUTPUT: The created TAR.
// WHY: Most TARs are auto-created inside createEntity. This standalone
//      function exists for migrations or admin paths where an entity
//      pre-existed without a TAR. The unique constraint on entity_id
//      makes "two TARs per entity" impossible.
export async function createTAR(
  entityId: string,
  actorId: string | null = null,
): Promise<TokenAttributeRepository> {
  const newTarId = randomUUID();

  return prisma.$transaction(async (tx) => {
    const entity = await tx.entity.findUnique({
      where: { entity_id: entityId },
      select: { entity_type: true },
    });
    if (entity === null) {
      throw new Error(`Entity ${entityId} not found`);
    }

    const tar = await createTARInTx(tx, {
      entity_id: entityId,
      entity_type: entity.entity_type,
      tar_id: newTarId,
    });
    await writeTARCreateAudit(tx, tar, actorId);
    return tar;
  });
}

// WHAT: Look up the TAR that belongs to one entity.
// INPUT: The entity_id and an optional actor_id.
// OUTPUT: The TAR record if found, otherwise null.
// WHY: Auth and gating layers start from "I know who you are; what
//      can you do" -- this is the call that answers them.
export async function getTARByEntityId(
  entityId: string,
  actorId: string | null = null,
): Promise<TokenAttributeRepository | null> {
  return withAudit(
    {
      action: "TAR_READ_BY_ENTITY_ID",
      entity_id: entityId,
      actor_id: actorId,
      meta: {},
    },
    async (tx) => {
      return tx.tokenAttributeRepository.findUnique({
        where: { entity_id: entityId },
      });
    },
  );
}

// WHAT: Tell the caller whether one capability flag is true for one
//        entity.
// INPUT: The entity_id, the capability name, and an optional actor_id.
// OUTPUT: true or false.
// WHY: The hot path on every gated request. Returns false when the
//      entity has no TAR or the TAR is not ACTIVE, so a missing or
//      revoked TAR fails closed.
export async function checkCapability(
  entityId: string,
  capability: TARCapability,
  actorId: string | null = null,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const tar = await tx.tokenAttributeRepository.findUnique({
      where: { entity_id: entityId },
    });

    let result = false;
    if (tar !== null && tar.status === "ACTIVE") {
      result = tar[capability] === true;
    }

    await writeAudit(tx, {
      action: "TAR_CAPABILITY_CHECK",
      entity_id: entityId,
      actor_id: actorId,
      meta: { capability, result },
    });

    return result;
  });
}

// WHAT: Mutate one or more TAR fields, recompute the hash, bump the
//        version, and invalidate every active session for this entity.
// INPUT: The tar_id, the partial update, and optional actor info.
// OUTPUT: The updated TAR record.
// WHY: This is the only safe path to change a TAR. The hash
//      recomputation and session invalidation happen in the same
//      transaction so a session can never observe a TAR midway
//      through an update.
export async function updateTARPermissions(
  tarId: string,
  permissions: TARPermissionsUpdate,
  options: { actor_entity_id?: string | null } = {},
): Promise<TokenAttributeRepository> {
  return prisma.$transaction((tx) =>
    updateTARPermissionsInTx(tx, tarId, permissions, options),
  );
}

// WHAT: The transactional core of updateTARPermissions -- same policy
//        snapshot / hash recompute / version bump / session invalidation /
//        audit, but running inside a CALLER-OWNED transaction client.
// INPUT: tx (the caller's transaction -- the TAR change commits or rolls
//        back together with whatever else the caller does in it, e.g. a
//        single-use dual-control approval consumption), then the same
//        arguments as updateTARPermissions.
// OUTPUT: The updated TAR record.
// WHY: Callers that must couple a TAR change atomically with another
//      write (dual-control consumption in the platform-authority rail)
//      cannot nest prisma.$transaction; this keeps the ONE safe TAR
//      mutation path shared instead of duplicated.
export async function updateTARPermissionsInTx(
  tx: Prisma.TransactionClient,
  tarId: string,
  permissions: TARPermissionsUpdate,
  options: { actor_entity_id?: string | null } = {},
): Promise<TokenAttributeRepository> {
  if (
    permissions.clearance_ceiling !== undefined
  ) {
    assertCeiling(permissions.clearance_ceiling);
  }

  {
    const current = await tx.tokenAttributeRepository.findUnique({
      where: { tar_id: tarId },
    });
    if (current === null) {
      throw new Error(`TAR ${tarId} not found`);
    }

    // Sovereignty: AI_AGENT actors cannot raise the ceiling on another
    // AI_AGENT's TAR. Lowering or holding flat is allowed.
    if (
      options.actor_entity_id !== undefined &&
      options.actor_entity_id !== null &&
      permissions.clearance_ceiling !== undefined &&
      permissions.clearance_ceiling > current.clearance_ceiling
    ) {
      const actor = await tx.entity.findUnique({
        where: { entity_id: options.actor_entity_id },
      });
      const target = await tx.entity.findUnique({
        where: { entity_id: current.entity_id },
      });
      if (
        actor?.entity_type === "AI_AGENT" &&
        target?.entity_type === "AI_AGENT"
      ) {
        throw new Error(
          "Sovereignty: AI_AGENT cannot raise clearance_ceiling on another AI_AGENT",
        );
      }
    }

    // Build the post-update policy snapshot to hash.
    const nextPolicy: TARHashableFields = {
      can_login: permissions.can_login ?? current.can_login,
      can_read_capsules:
        permissions.can_read_capsules ?? current.can_read_capsules,
      can_write_capsules:
        permissions.can_write_capsules ?? current.can_write_capsules,
      can_share_capsules:
        permissions.can_share_capsules ?? current.can_share_capsules,
      can_create_hives:
        permissions.can_create_hives ?? current.can_create_hives,
      can_access_external_api:
        permissions.can_access_external_api ?? current.can_access_external_api,
      can_admin_niov: permissions.can_admin_niov ?? current.can_admin_niov,
      can_admin_org: permissions.can_admin_org ?? current.can_admin_org,
      clearance_ceiling:
        permissions.clearance_ceiling ?? current.clearance_ceiling,
      monetization_role:
        permissions.monetization_role ?? current.monetization_role,
      compliance_frameworks:
        permissions.compliance_frameworks ?? current.compliance_frameworks,
      status: permissions.status ?? current.status,
    };
    const newHash = computeTARHash(nextPolicy);

    const updated = await tx.tokenAttributeRepository.update({
      where: { tar_id: tarId },
      data: {
        ...nextPolicy,
        tar_hash: newHash,
        tar_version: { increment: 1 },
      },
    });

    // Invalidate every still-active session for this entity. Same
    // transaction, so a request mid-flight sees either the old TAR +
    // active session, or the new TAR + invalidated session, never a
    // mixed state.
    const invalidated = await tx.session.updateMany({
      where: {
        entity_id: updated.entity_id,
        status: "ACTIVE",
      },
      data: {
        status: "INVALIDATED",
        invalidated_at: new Date(),
      },
    });

    await writeAudit(tx, {
      action: "TAR_PERMISSIONS_UPDATE",
      entity_id: updated.entity_id,
      actor_id: options.actor_entity_id ?? null,
      meta: {
        tar_id: tarId,
        new_version: updated.tar_version,
        new_hash: newHash,
        sessions_invalidated: invalidated.count,
        changed_fields: Object.keys(permissions),
      },
    });

    return updated;
  }
}

// WHAT: Mark every still-active session for this entity as INVALIDATED.
// INPUT: The entity_id, a reason string for the audit trail, and an
//        optional actor_id.
// OUTPUT: The number of sessions that were just invalidated.
// WHY: Used internally by updateTARPermissions, and exposed for cases
//      like "this entity has been suspended -- kill all their
//      sessions now". The reason ends up in the audit row.
export async function invalidateEntitySessions(
  entityId: string,
  reason: string,
  actorId: string | null = null,
): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const result = await tx.session.updateMany({
      where: { entity_id: entityId, status: "ACTIVE" },
      data: { status: "INVALIDATED", invalidated_at: new Date() },
    });

    await writeAudit(tx, {
      action: "SESSION_INVALIDATE",
      entity_id: entityId,
      actor_id: actorId,
      meta: {
        reason,
        invalidated_count: result.count,
      },
    });

    return result.count;
  });
}

// Re-export the Session type for tests that need to fabricate session
// rows directly. Section 2 will introduce a real createSession flow.
export type { Session };

export { prisma } from "../client.js";
