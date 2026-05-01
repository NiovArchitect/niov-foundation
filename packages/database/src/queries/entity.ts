// FILE: entity.ts
// PURPOSE: All read and write operations for the Entity table. Every
//          function here writes an audit row in the same transaction as
//          the real action so Rule 4 is satisfied automatically.
// CONNECTS TO: The Entity and AuditLog tables in schema.prisma, the audit
//              helper in /audit.ts, and the shared Prisma client in
//              /client.ts. Higher layers (auth, COSMP) call these
//              functions instead of touching the database directly.

import { randomUUID } from "node:crypto";
import type {
  Entity,
  EntityStatus,
  EntityType,
  Prisma,
  WalletType,
} from "@prisma/client";
import { withAudit } from "../audit.js";
import { prisma } from "../client.js";
import {
  createWalletInTx,
  defaultWalletTypeFor,
  writeWalletCreateAudit,
} from "./wallet.js";

// WHAT: The lowest valid clearance level (public information, no restriction).
// INPUT: None.
// OUTPUT: The number 0.
// WHY: Documented as a named constant so the rule "0 through 6" lives in
//      one place and we can change it later without grep.
export const MIN_CLEARANCE = 0;

// WHAT: The highest valid clearance level (top secret).
// INPUT: None.
// OUTPUT: The number 6.
// WHY: Same reason as MIN_CLEARANCE -- one place to change the rule.
export const MAX_CLEARANCE = 6;

// WHAT: The shape of the data callers must hand to createEntity.
// INPUT: Used as a parameter type only.
// OUTPUT: None -- this is a type, not a value.
// WHY: Lets the caller omit fields that the database sets itself
//      (entity_id, timestamps, defaults) while still being type-safe.
export interface CreateEntityInput {
  entity_type: EntityType;
  display_name: string;
  public_key: string;
  email?: string | null;
  status?: EntityStatus;
  clearance_level?: number;
  actor_id?: string | null;
  // Optional override for the wallet type. If omitted we pick a sensible
  // default from entity_type via defaultWalletTypeFor.
  wallet_type?: WalletType;
}

// WHAT: The filters listEntities understands.
// INPUT: Used as a parameter type only.
// OUTPUT: None -- this is a type, not a value.
// WHY: Spec says we must be able to narrow by status and type. Including
//      a list option to also surface deleted rows for admin views.
export interface ListEntitiesFilters {
  status?: EntityStatus;
  entity_type?: EntityType;
  include_deleted?: boolean;
  actor_id?: string | null;
}

// WHAT: Throw if a clearance level is outside the allowed 0..6 window.
// INPUT: A number that the caller wants to use as a clearance level.
// OUTPUT: Returns nothing if valid, throws an Error if not.
// WHY: Rule 0 -- we default to maximum human control, which means we
//      reject bad input loudly instead of silently coercing it.
function assertValidClearance(level: number): void {
  if (
    !Number.isInteger(level) ||
    level < MIN_CLEARANCE ||
    level > MAX_CLEARANCE
  ) {
    throw new Error(
      `clearance_level must be an integer between ${MIN_CLEARANCE} and ${MAX_CLEARANCE} (got ${level})`,
    );
  }
}

// WHAT: Insert a brand new Entity row and write its matching audit entry.
// INPUT: The fields the caller wants on the new entity, plus an optional
//        actor_id describing who is creating it.
// OUTPUT: The freshly created Entity record straight from the database.
// WHY: Every actor in the NIOV Foundation -- humans, AI agents, devices --
//      starts life as an Entity row, so this is the front door for the
//      whole system. Wrapped in withAudit so creation cannot succeed
//      unless the audit row also lands.
export async function createEntity(
  input: CreateEntityInput,
): Promise<Entity> {
  const clearance = input.clearance_level ?? MIN_CLEARANCE;
  assertValidClearance(clearance);

  // We mint the new entity's UUID here, on the application side, so we can
  // tag the audit row with the same id that goes into the entities table.
  // Both inserts happen in one Postgres transaction inside withAudit.
  const newEntityId = randomUUID();

  return withAudit(
    {
      action: "ENTITY_CREATE",
      entity_id: newEntityId,
      actor_id: input.actor_id ?? null,
      meta: {
        entity_type: input.entity_type,
        display_name: input.display_name,
        clearance_level: clearance,
      },
    },
    async (tx) => {
      const created = await tx.entity.create({
        data: {
          entity_id: newEntityId,
          entity_type: input.entity_type,
          display_name: input.display_name,
          public_key: input.public_key,
          email: input.email ?? null,
          status: input.status ?? "ACTIVE",
          clearance_level: clearance,
        },
      });

      // Rule from Section 1B: every entity must have exactly one wallet,
      // and it has to be created in the same transaction so we can never
      // observe an entity without a wallet.
      const wallet = await createWalletInTx(tx, {
        entity_id: created.entity_id,
        wallet_type: input.wallet_type ?? defaultWalletTypeFor(input.entity_type),
      });
      await writeWalletCreateAudit(tx, wallet, input.actor_id ?? null);

      return created;
    },
  );
}

// WHAT: Look up one entity by its primary key.
// INPUT: The entity_id (UUID) and an optional actor_id for the audit row.
// OUTPUT: The Entity record if found and not soft-deleted, otherwise null.
// WHY: Reads still touch data, so Rule 4 applies. We log every lookup so
//      we can later answer "who looked at whom and when".
export async function getEntityById(
  entityId: string,
  actorId: string | null = null,
): Promise<Entity | null> {
  return withAudit(
    {
      action: "ENTITY_READ_BY_ID",
      entity_id: entityId,
      actor_id: actorId,
      meta: {},
    },
    async (tx) => {
      return tx.entity.findFirst({
        where: { entity_id: entityId, deleted_at: null },
      });
    },
  );
}

// WHAT: Look up one entity by its email address.
// INPUT: The email string and an optional actor_id for the audit row.
// OUTPUT: The Entity record if found and not soft-deleted, otherwise null.
// WHY: Login and invite flows need to find an entity by email. Audited
//      because email lookups can be used to probe for existence.
export async function getEntityByEmail(
  email: string,
  actorId: string | null = null,
): Promise<Entity | null> {
  return withAudit(
    {
      action: "ENTITY_READ_BY_EMAIL",
      actor_id: actorId,
      meta: { email },
    },
    async (tx) => {
      return tx.entity.findFirst({
        where: { email, deleted_at: null },
      });
    },
  );
}

// WHAT: Change an entity's status (ACTIVE / SUSPENDED / DELETED) and keep
//        the matching timestamp fields in sync with that change.
// INPUT: The entity_id, the new status, and an optional actor_id.
// OUTPUT: The updated Entity record.
// WHY: Status moves are sensitive -- suspension stops access, deletion
//      removes an entity from default reads. We never hard delete, we
//      just set deleted_at (Rule 10). Audited for accountability.
export async function updateEntityStatus(
  entityId: string,
  status: EntityStatus,
  actorId: string | null = null,
): Promise<Entity> {
  return withAudit(
    {
      action: "ENTITY_STATUS_UPDATE",
      entity_id: entityId,
      actor_id: actorId,
      meta: { new_status: status },
    },
    async (tx) => {
      const now = new Date();
      const data: Prisma.EntityUpdateInput = { status };
      if (status === "SUSPENDED") {
        data.suspended_at = now;
      } else if (status === "DELETED") {
        data.deleted_at = now;
      } else if (status === "ACTIVE") {
        data.suspended_at = null;
      }
      return tx.entity.update({
        where: { entity_id: entityId },
        data,
      });
    },
  );
}

// WHAT: Add one to an entity's failed_auth_attempts counter.
// INPUT: The entity_id and an optional actor_id.
// OUTPUT: The updated Entity record with the new counter value.
// WHY: Login attempts that fail need to be counted so the auth layer can
//      lock an account after too many failures. Audited because repeated
//      failures are the signature of a credential-stuffing attack.
export async function incrementFailedAuth(
  entityId: string,
  actorId: string | null = null,
): Promise<Entity> {
  return withAudit(
    {
      action: "ENTITY_FAILED_AUTH_INCREMENT",
      entity_id: entityId,
      actor_id: actorId,
      meta: {},
    },
    async (tx) => {
      return tx.entity.update({
        where: { entity_id: entityId },
        data: { failed_auth_attempts: { increment: 1 } },
      });
    },
  );
}

// WHAT: Reset an entity's failed_auth_attempts counter back to zero.
// INPUT: The entity_id and an optional actor_id.
// OUTPUT: The updated Entity record with failed_auth_attempts = 0.
// WHY: After a successful login (or after an admin clears a lockout) we
//      need to wipe the counter so the next failure starts from zero.
export async function resetFailedAuth(
  entityId: string,
  actorId: string | null = null,
): Promise<Entity> {
  return withAudit(
    {
      action: "ENTITY_FAILED_AUTH_RESET",
      entity_id: entityId,
      actor_id: actorId,
      meta: {},
    },
    async (tx) => {
      return tx.entity.update({
        where: { entity_id: entityId },
        data: { failed_auth_attempts: 0 },
      });
    },
  );
}

// WHAT: List entities, optionally narrowed by status and / or type.
// INPUT: A filter object and an optional actor_id.
// OUTPUT: An array of Entity records (empty array if nothing matches).
// WHY: Admin dashboards and the COE need to enumerate entities. Soft
//      deleted rows are hidden by default to honor "deleted means gone"
//      from a normal-user point of view, but include_deleted is there
//      for admin tools that need full visibility (Rule 10).
export async function listEntities(
  filters: ListEntitiesFilters = {},
): Promise<Entity[]> {
  return withAudit(
    {
      action: "ENTITY_LIST",
      actor_id: filters.actor_id ?? null,
      meta: {
        status: filters.status ?? null,
        entity_type: filters.entity_type ?? null,
        include_deleted: filters.include_deleted === true,
      },
    },
    async (tx) => {
      const where: Prisma.EntityWhereInput = {};
      if (filters.status) where.status = filters.status;
      if (filters.entity_type) where.entity_type = filters.entity_type;
      if (!filters.include_deleted) where.deleted_at = null;
      return tx.entity.findMany({
        where,
        orderBy: { created_at: "desc" },
      });
    },
  );
}

// Re-export the shared client so callers that need a raw handle (for
// example, test setup) do not have to import from a second path.
export { prisma } from "../client.js";
