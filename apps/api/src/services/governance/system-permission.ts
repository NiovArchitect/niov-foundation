// FILE: system-permission.ts
// PURPOSE: createSystemPermission -- the server-side bypass that
//          mints a PermissionBridge for an entity without going
//          through Section 1D's session-bound createPermission. Used
//          by Dandelion (next box) and createTwin (the box after) to
//          install standing wallet-scope permissions for admin twins.
// CONNECTS TO: prisma (Permission + MemoryCapsule + Wallet rows),
//              writeAuditEvent (Section 1E hash-chained
//              audit-of-record).

import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import {
  prisma,
  writeAuditEvent,
  type AccessScope,
  type CapsuleType,
  type DurationType,
  type Permission,
} from "@niov/database";

// WHAT: Inputs for createSystemPermission.
// INPUT: Used as a parameter type only.
// OUTPUT: None -- this is a type, not a value.
// WHY: Centralizes the call shape so Dandelion + createTwin call
//      sites stay readable.
export interface CreateSystemPermissionInput {
  grantor_entity_id: string;
  grantee_entity_id: string;
  access_scope: AccessScope;
  /**
   * When set, only capsules of this type get permissioned. When
   * undefined / null, every live capsule in the grantor's wallet is
   * included.
   */
  capsule_type_filter?: CapsuleType | null;
  /**
   * true → permanent (no expiry); false → LONG_TERM. Defaults to true.
   */
  permanent?: boolean;
  /** Free-text reason recorded in the audit event. */
  reason?: string | null;
}

// WHAT: Successful return shape.
// INPUT: Used as a return type only.
// OUTPUT: None -- this is a type.
// WHY: Caller wants the bridge_id (for revoke later) and a count
//      so it can log how many capsules were covered.
export interface CreateSystemPermissionResult {
  bridge_id: string;
  permission_count: number;
  permissions: Permission[];
}

/**
 * Mint one PermissionBridge that covers every live capsule in the
 * grantor's wallet (optionally filtered by capsule_type) and grants
 * the grantee a standing READ permission across all of them.
 *
 * SERVER-SIDE BYPASS: this function does NOT validate a session
 * token and does NOT run Section 1D's createPermission sovereignty
 * checks. It is intended only for trusted internal callers
 * (Dandelion, createTwin) that need to install permissions on
 * behalf of the platform itself.
 *
 * AUDIT: writes one AuditEvent of type ADMIN_ACTION via
 * writeAuditEvent (NOT a direct prisma.auditEvent.create) so the
 * Section 1E hash chain stays intact. Hash chain integrity is
 * non-negotiable per Section 1E.
 *
 * FUTURE-CAPSULE GAP: the bridge only covers capsules that exist
 * at mint time. Capsules created in the grantor's wallet AFTER
 * this call are NOT auto-included.
 *
 * TODO: Future-capsule sync -- when the admin-twin use case
 * requires reading capsules written after twin creation, add a
 * write-side hook in observation.service.ts (Section 11) or in
 * the org-wallet write path (Section 14) that extends active admin
 * bridges to include new capsules of matching capsule_type_filter.
 * Not blocking for Section 9 admin-twin governance use case where
 * admin reads pre-existing org capsules at hive-aggregate scope.
 */
export async function createSystemPermission(
  input: CreateSystemPermissionInput,
  tx?: Prisma.TransactionClient,
): Promise<CreateSystemPermissionResult> {
  // Use the caller's transaction client when provided (Phase 0 / Phase 3
  // composition); fall back to the global prisma client when standalone.
  // The query interface is identical -- only $transaction differs, which
  // we never call from this function.
  const db = tx ?? prisma;

  const wallet = await db.wallet.findUnique({
    where: { entity_id: input.grantor_entity_id },
    select: { wallet_id: true },
  });
  if (wallet === null) {
    throw new Error("GRANTOR_HAS_NO_WALLET");
  }

  const where: Prisma.MemoryCapsuleWhereInput = {
    wallet_id: wallet.wallet_id,
    deleted_at: null,
  };
  if (input.capsule_type_filter !== undefined && input.capsule_type_filter !== null) {
    where.capsule_type = input.capsule_type_filter;
  }
  const capsules = await db.memoryCapsule.findMany({
    where,
    select: { capsule_id: true },
  });

  const bridgeId = randomUUID();
  const isPermanent = input.permanent ?? true;
  const durationType: DurationType = isPermanent ? "PERMANENT" : "LONG_TERM";
  const validFrom = new Date();
  // PERMANENT: expires_at stays null. LONG_TERM: 365 days, matching
  // Section 1D's defaultExpiresAt.
  const expiresAt: Date | null = isPermanent
    ? null
    : new Date(validFrom.getTime() + 365 * 24 * 60 * 60 * 1000);

  const created: Permission[] = [];
  for (const cap of capsules) {
    const row = await db.permission.create({
      data: {
        bridge_id: bridgeId,
        capsule_id: cap.capsule_id,
        grantor_entity_id: input.grantor_entity_id,
        grantee_entity_id: input.grantee_entity_id,
        access_scope: input.access_scope,
        duration_type: durationType,
        valid_from: validFrom,
        expires_at: expiresAt,
        status: "ACTIVE",
      },
    });
    created.push(row);
  }

  await writeAuditEvent(
    {
      event_type: "ADMIN_ACTION",
      outcome: "SUCCESS",
      actor_entity_id: null,
      target_entity_id: input.grantee_entity_id,
      details: {
        action: "SYSTEM_PERMISSION_CREATED",
        system_permission: true,
        bridge_id: bridgeId,
        grantor_entity_id: input.grantor_entity_id,
        grantee_entity_id: input.grantee_entity_id,
        access_scope: input.access_scope,
        capsule_type_filter: input.capsule_type_filter ?? null,
        permanent: isPermanent,
        permission_count: created.length,
        reason: input.reason ?? null,
      },
    },
    tx,
  );

  return {
    bridge_id: bridgeId,
    permission_count: created.length,
    permissions: created,
  };
}
