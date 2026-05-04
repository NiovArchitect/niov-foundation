// FILE: twin.service.ts
// PURPOSE: createTwin -- the entity-creation flow that mints one
//          AI_AGENT entity per human owner per role and wires the
//          P1 PATCH wallet-access architecture (admin twin gets
//          standing org-wallet permissions; standard twin gets
//          default Hive membership instead). Plus findNextApprover
//          which walks the EntityMembership tree to locate an org
//          admin different from the owner.
// CONNECTS TO: prisma (Entity + Wallet + TAR + EntityMembership +
//              TwinConfig rows), createWalletInTx + createTARInTx +
//              writeWalletCreateAudit + writeTARCreateAudit (Section
//              1 atomic-init helpers), createSystemPermission
//              (Section 9C wallet-scope bridge), writeAuditEvent
//              (Section 1E hash chain). Imported by Dandelion Phase
//              0 / Phase 3 and by the future POST /org/twins route.

import { randomUUID } from "node:crypto";
import type { Prisma, TwinConfig } from "@prisma/client";
import {
  createTARInTx,
  createWalletInTx,
  prisma,
  writeAuditEvent,
  writeTARCreateAudit,
  writeWalletCreateAudit,
} from "@niov/database";
import { createSystemPermission } from "./system-permission.js";

// WHAT: Inputs for createTwin.
// INPUT: Used as a parameter type only.
// OUTPUT: None -- this is a type, not a value.
// WHY: One named-fields object so admin / standard branches share
//      the same call shape. role_title defaults to "Digital Twin"
//      when omitted; is_admin_invite defaults to false (standard).
export interface CreateTwinInput {
  owner_entity_id: string;
  org_entity_id: string;
  role_title?: string | null;
  is_admin_invite?: boolean;
  actor_entity_id?: string | null;
}

// WHAT: Successful createTwin return shape.
// INPUT: Used as a return type only.
// OUTPUT: None.
// WHY: Caller wants the new twin's entity_id, the TwinConfig that
//      was wired up, and a clear flag indicating which branch ran
//      (admin vs. standard) so audit + tests can verify behavior
//      without re-reading the row.
export interface CreateTwinResult {
  entity_id: string;
  twin_config: TwinConfig;
  is_admin_twin: boolean;
  /**
   * Admin branch: the bridge_id of the standing wallet permission
   * minted on the org wallet. Null on the standard branch.
   */
  org_permission_bridge_id: string | null;
  /**
   * Standing wallet permission against the OWNER's personal wallet,
   * always minted (admin AND standard branches both get this).
   */
  owner_permission_bridge_id: string;
  /**
   * Standard branch: the membership_id of the auto-join into the
   * org's default-enterprise Hive. Null on the admin branch
   * (admins do not auto-join the default Hive).
   */
  default_hive_membership_id: string | null;
  /**
   * 12B.0: audit_id of the TWIN_CREATED summary ADMIN_ACTION row.
   * Surfaced so audit-aware UI can render a clickable link from
   * the action confirmation toast to the audit row in Security &
   * Audit. Always populated on success; not present on failure
   * (failures throw before the summary audit fires).
   */
  audit_event_id: string;
}

// WHAT: How many EntityMembership levels findNextApprover walks
//        before giving up.
// INPUT: Used as a constant.
// OUTPUT: The number 7.
// WHY: Matches getOrgEntityId's MAX_ORG_HIERARCHY_DEPTH so org
//      hierarchies that pass the strict-resolver also fit the
//      approver walk. Naming it locally keeps the constant
//      grep-friendly.
const MAX_APPROVER_HOPS = 7;

// WHAT: Locate the next active org admin who is NOT the owner.
// INPUT: A transaction client, the owner's entity_id.
// OUTPUT: An entity_id when an admin different from the owner is
//         reachable, otherwise null.
// WHY: TwinConfig.approver_entity_id is null for self-approving
//      admin twins (Phase 0 case where the very first admin is
//      both owner and approver). Standard twins instead use the
//      owner directly per createTwin's branch logic. The walk:
//      from owner up through parent EntityMemberships, look for any
//      ancestor (or sibling thereof) whose membership has
//      is_admin=true AND is_active=true AND is NOT the owner. We
//      include sibling adminship by also checking other children of
//      the owner's parent.
async function findNextApprover(
  tx: Prisma.TransactionClient,
  ownerEntityId: string,
): Promise<string | null> {
  let cursor: string | null = ownerEntityId;
  for (let hop = 0; hop < MAX_APPROVER_HOPS && cursor !== null; hop++) {
    // Find the parent of the current cursor.
    const parentMembership: { parent_id: string } | null =
      await tx.entityMembership.findFirst({
        where: { child_id: cursor, is_active: true },
        select: { parent_id: true },
      });
    if (parentMembership === null) return null;

    // Check whether ANY active membership under this parent (i.e.
    // any sibling of the cursor + the parent itself) is an admin
    // that isn't the owner.
    const sibling = await tx.entityMembership.findFirst({
      where: {
        parent_id: parentMembership.parent_id,
        is_active: true,
        is_admin: true,
        child_id: { not: ownerEntityId },
      },
      select: { child_id: true },
    });
    if (sibling !== null) {
      return sibling.child_id;
    }

    // Walk up.
    cursor = parentMembership.parent_id;
  }
  return null;
}

// WHAT: Inner work-loop for createTwin -- assumes a transaction
//        client is already in scope.
// INPUT: A transaction client and a CreateTwinInput.
// OUTPUT: A CreateTwinResult.
// WHY: createTwin can be called either standalone (opens its own
//      $transaction) or composed inside Phase 0 / Phase 3's outer
//      atomic transaction. Both paths funnel through this inner
//      function so the audit chain + entity creation are identical.
async function createTwinInTx(
  tx: Prisma.TransactionClient,
  input: CreateTwinInput,
): Promise<CreateTwinResult> {
  const isAdmin = input.is_admin_invite === true;
  const roleTitle = input.role_title ?? "Digital Twin";
  const actorId = input.actor_entity_id ?? null;

  // STEP 1 -- uniqueness check. One twin per (owner, role_title)
  // is the spec invariant. We look for an existing AI_AGENT child
  // membership of this owner with the same role_title.
  const existing = await tx.entityMembership.findFirst({
    where: {
      parent_id: input.owner_entity_id,
      role_title: roleTitle,
      is_active: true,
    },
    select: { child_id: true },
  });
  if (existing !== null) {
    const existingChild = await tx.entity.findUnique({
      where: { entity_id: existing.child_id },
      select: { entity_type: true },
    });
    if (existingChild?.entity_type === "AI_AGENT") {
      throw new Error("TWIN_ALREADY_EXISTS");
    }
  }

  // STEP 2 -- create the AI_AGENT entity inline, threading tx so the
  // wallet + TAR + audit rows all land or roll back together.
  const twinEntityId = randomUUID();
  const twin = await tx.entity.create({
    data: {
      entity_id: twinEntityId,
      entity_type: "AI_AGENT",
      display_name: `Twin of ${input.owner_entity_id} (${roleTitle})`,
      public_key: `pk_twin_${twinEntityId}`,
      status: "ACTIVE",
      clearance_level: 0,
    },
  });
  const twinWallet = await createWalletInTx(tx, {
    entity_id: twinEntityId,
    wallet_type: "PERSONAL",
  });
  await writeWalletCreateAudit(tx, twinWallet, actorId);
  const twinTar = await createTARInTx(tx, {
    entity_id: twinEntityId,
    entity_type: "AI_AGENT",
  });
  await writeTARCreateAudit(tx, twinTar, actorId);
  await writeAuditEvent(
    {
      event_type: "ENTITY_REGISTERED",
      outcome: "SUCCESS",
      actor_entity_id: actorId,
      target_entity_id: twinEntityId,
      details: {
        action: "TWIN_ENTITY_CREATED",
        owner_entity_id: input.owner_entity_id,
        org_entity_id: input.org_entity_id,
        role_title: roleTitle,
        is_admin_twin: isAdmin,
      },
    },
    tx,
  );
  void twin;

  // STEP 3 -- EntityMembership(parent=owner, child=twin) so the twin
  // is reachable via the owner's hierarchy walk.
  await tx.entityMembership.create({
    data: {
      parent_id: input.owner_entity_id,
      child_id: twinEntityId,
      role_title: roleTitle,
      is_active: true,
      is_admin: false,
    },
  });

  // STEP 4 -- wire TwinConfig with autonomy + approver branch logic.
  const approverEntityId = isAdmin
    ? await findNextApprover(tx, input.owner_entity_id)
    : input.owner_entity_id;
  const autonomyLevel = isAdmin ? "EXECUTIVE_OVERRIDE" : "APPROVAL_REQUIRED";
  const twinConfig = await tx.twinConfig.create({
    data: {
      twin_id: twinEntityId,
      autonomy_level: autonomyLevel,
      swarm_enabled: false,
      role_template: null,
      is_admin_twin: isAdmin,
      approver_entity_id: approverEntityId,
    },
  });

  // STEP 5 -- two branches per P1 PATCH wallet-access architecture.
  //
  // Owner-wallet permission: BOTH branches mint a standing FULL
  // permission against the owner's wallet. This is what lets the
  // twin read its human's existing capsules.
  //
  // Admin branch ALSO mints a standing FULL permission against the
  // ORG wallet (org_entity_id). This is the executive-override path
  // -- one bridge can be revoked to cut the admin twin off from the
  // org's collective intelligence. NOT joined to the default Hive
  // (admin twins do not appear in member rosters).
  //
  // Standard branch instead JOINS the org's default-enterprise Hive.
  // The twin reads org intelligence via the Hive aggregate (member
  // roster includes them, contribution + access scopes are SUMMARY).
  const ownerPerm = await createSystemPermission(
    {
      grantor_entity_id: input.owner_entity_id,
      grantee_entity_id: twinEntityId,
      access_scope: "FULL",
      permanent: true,
      reason: `createTwin owner-wallet for ${twinEntityId}`,
    },
    tx,
  );

  let orgPermissionBridgeId: string | null = null;
  let defaultHiveMembershipId: string | null = null;

  if (isAdmin) {
    const orgPerm = await createSystemPermission(
      {
        grantor_entity_id: input.org_entity_id,
        grantee_entity_id: twinEntityId,
        access_scope: "FULL",
        permanent: true,
        reason: `createTwin admin org-wallet for ${twinEntityId}`,
      },
      tx,
    );
    orgPermissionBridgeId = orgPerm.bridge_id;
  } else {
    const defaultHive = await tx.hive.findFirst({
      where: {
        org_entity_id: input.org_entity_id,
        is_default_enterprise: true,
        status: "ACTIVE",
      },
      select: { hive_id: true, member_count: true },
    });
    if (defaultHive === null) {
      // The standard branch needs a default Hive to join. If none
      // exists, the org has not finished Phase 0 -- caller error.
      throw new Error("DEFAULT_HIVE_MISSING");
    }
    const membershipId = randomUUID();
    await tx.hiveMembership.create({
      data: {
        membership_id: membershipId,
        hive_id: defaultHive.hive_id,
        entity_id: twinEntityId,
        capsule_types_contributed: [],
        contribution_scope: "SUMMARY",
        capsule_types_accessible: [],
        access_scope: "SUMMARY",
        status: "ACTIVE",
      },
    });
    await tx.hive.update({
      where: { hive_id: defaultHive.hive_id },
      data: { member_count: { increment: 1 } },
    });
    await writeAuditEvent(
      {
        event_type: "HIVE_MEMBER_ADDED",
        outcome: "SUCCESS",
        actor_entity_id: actorId,
        target_entity_id: twinEntityId,
        details: {
          hive_id: defaultHive.hive_id,
          membership_id: membershipId,
          via: "createTwin_standard",
        },
      },
      tx,
    );
    defaultHiveMembershipId = membershipId;
  }

  // STEP 6 -- role-template application is deferred until Section 11
  // (when AgentTemplate model + /templates/roles/ files ship).
  // Silent skip: TwinConfig.role_template stays null. TODO(Section
  // 11): load the matching role-template by role_title and persist
  // its skill packages + system prompt.

  // STEP 7 -- summary audit event so the entire twin-creation
  // operation has one canonical entry in the hash chain.
  // 12B.0: capture the audit row so CreateTwinResult surfaces
  // audit_event_id for audit-aware UI clickability on the
  // POST /org/ai-teammates response.
  const summaryAudit = await writeAuditEvent(
    {
      event_type: "ADMIN_ACTION",
      outcome: "SUCCESS",
      actor_entity_id: actorId,
      target_entity_id: twinEntityId,
      details: {
        action: "TWIN_CREATED",
        owner_entity_id: input.owner_entity_id,
        org_entity_id: input.org_entity_id,
        role_title: roleTitle,
        is_admin_twin: isAdmin,
        autonomy_level: autonomyLevel,
        approver_entity_id: approverEntityId,
        owner_permission_bridge_id: ownerPerm.bridge_id,
        org_permission_bridge_id: orgPermissionBridgeId,
        default_hive_membership_id: defaultHiveMembershipId,
      },
    },
    tx,
  );

  return {
    entity_id: twinEntityId,
    twin_config: twinConfig,
    is_admin_twin: isAdmin,
    org_permission_bridge_id: orgPermissionBridgeId,
    owner_permission_bridge_id: ownerPerm.bridge_id,
    default_hive_membership_id: defaultHiveMembershipId,
    audit_event_id: summaryAudit.audit_id,
  };
}

// WHAT: Mint one Digital Twin (AI_AGENT entity + wallet + TAR +
//        membership + TwinConfig + standing permissions / Hive
//        join), atomically.
// INPUT: A CreateTwinInput. When called inside an outer transaction,
//        pass tx; otherwise this opens its own.
// OUTPUT: A CreateTwinResult.
// WHY: Twin creation touches 6+ tables across two services. The
//      atomic guarantee is "either every row lands or none of them
//      do" -- crucial because half-created twins would leak audit
//      rows that reference entities that do not exist.
//
//      Composability: passing tx lets Phase 0 (createOrg) and Phase
//      3 (atomic invite) wrap createTwin inside their larger atomic
//      flows, so a failure anywhere rolls back the whole org / the
//      whole invite atomically.
export async function createTwin(
  input: CreateTwinInput,
  tx?: Prisma.TransactionClient,
): Promise<CreateTwinResult> {
  if (tx !== undefined) {
    return createTwinInTx(tx, input);
  }
  return prisma.$transaction(
    (innerTx) => createTwinInTx(innerTx, input),
    {
      maxWait: 30_000,
      timeout: 60_000,
    },
  );
}

// Re-export findNextApprover for tests + future routes.
export { findNextApprover };
