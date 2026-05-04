// FILE: share.service.ts
// PURPOSE: Implement the COSMP SHARE and REVOKE operations. SHARE
//          bundles N permissions under one bridge_id and invalidates
//          the grantee's active sessions so they pick up the new
//          access on next login. REVOKE flips every permission in a
//          bridge to REVOKED in one transactional sweep and forces
//          the grantee out of any session they currently hold.
// CONNECTS TO: AuthService, getEntityById, getTARByEntityId,
//              createPermission, revokeBridge,
//              invalidateEntitySessions, the audit-of-record table.

import { randomUUID } from "node:crypto";
import {
  createPermission,
  getEntityById,
  getTARByEntityId,
  invalidateEntitySessions,
  prisma,
  revokeBridge,
  writeAuditEvent,
  type AccessScope,
  type DurationType,
} from "@niov/database";
import type { AuthService } from "../auth.service.js";

// WHAT: One per-capsule grant inside a SHARE request.
// INPUT: Used as a parameter type only.
// OUTPUT: None -- this is a type, not a value.
// WHY: Per-capsule scope and timing keep the grantor in control of
//      what each individual capsule grants -- one bridge, many
//      shapes.
export interface CapsuleGrant {
  capsule_id: string;
  scope: AccessScope;
  can_share_forward?: boolean;
  valid_from?: Date;
  expires_at?: Date | null;
  duration_type?: DurationType;
  conditions?: Record<string, unknown>;
}

// WHAT: The whole SHARE request shape.
// INPUT: Used as a parameter type only.
// OUTPUT: None.
// WHY: One grantee, many capsule grants under one bridge_id.
export interface ShareRequest {
  grantee_entity_id: string;
  capsule_grants: CapsuleGrant[];
  write_reason?: string;
}

// WHAT: Successful SHARE response.
// INPUT: Used as a return type only.
// OUTPUT: None.
// WHY: Caller needs the bridge_id to revoke later AND the list of
//      permission_ids the share produced.
//
// 12B.0: audit_event_id is the audit_id of the success-summary
// PERMISSION_CREATED row. Surfaced so audit-aware UI can render a
// clickable link from the action confirmation toast to the audit
// row in Security & Audit.
//
// FAILURE PATHS INTENTIONALLY DO NOT INCLUDE audit_event_id: denied
// shares (CAPSULES_NOT_OWNED, CLEARANCE_INSUFFICIENT_FOR_CAPSULES,
// etc.) still write audit rows server-side for compliance/forensic
// record, but those ids are not surfaced to the client. Audit-aware
// UI is for confirming successful actions, not for exposing
// forensic ids of denied operations.
export interface ShareSuccess {
  ok: true;
  bridge_id: string;
  permissions_created: string[];
  audit_event_id: string;
}

// WHAT: Failure shape for SHARE.
// INPUT: Used as a return type only.
// OUTPUT: None.
// WHY: Codes mirror the failure modes spec calls out.
export interface ShareFailure {
  ok: false;
  code:
    | "SESSION_INVALID"
    | "SESSION_EXPIRED"
    | "SESSION_REVOKED"
    | "SESSION_INVALIDATED"
    | "OPERATION_NOT_PERMITTED"
    | "INVALID_REQUEST"
    | "GRANTEE_NOT_FOUND"
    | "GRANTEE_NO_TAR"
    | "CAPSULES_NOT_OWNED"
    | "CAPSULES_NOT_FOUND"
    | "CLEARANCE_INSUFFICIENT_FOR_CAPSULES";
  message: string;
  details?: {
    failed_capsules?: string[];
    not_owned?: string[];
    not_found?: string[];
  };
}

// WHAT: Successful REVOKE response.
// INPUT: Used as a return type only.
// OUTPUT: None.
// WHY: The count tells the caller how many permissions actually
//      flipped (already-revoked ones are skipped by revokeBridge).
//
// 12B.0: audit_event_id surfaced for audit-aware UI clickability
// (same contract as ShareSuccess; see that interface's JSDoc for
// why failure paths intentionally omit the field).
export interface RevokeSuccess {
  ok: true;
  revoked_count: number;
  bridge_id: string;
  audit_event_id: string;
}

// WHAT: Failure shape for REVOKE.
// INPUT: Used as a return type only.
// OUTPUT: None.
// WHY: Codes mirror the failure modes spec calls out.
export interface RevokeFailure {
  ok: false;
  code:
    | "SESSION_INVALID"
    | "SESSION_EXPIRED"
    | "SESSION_REVOKED"
    | "SESSION_INVALIDATED"
    | "OPERATION_NOT_PERMITTED"
    | "BRIDGE_NOT_FOUND"
    | "NOT_GRANTOR";
  message: string;
}

// WHAT: The class that orchestrates COSMP SHARE and REVOKE.
// INPUT: AuthService.
// OUTPUT: A class with share() and revoke() methods.
// WHY: Both flows share session validation and audit-emission
//      concerns; one class with two methods keeps them close.
export class ShareService {
  constructor(private readonly authService: AuthService) {}

  // WHAT: Share N capsules with one grantee under one bridge_id.
  // INPUT: Session token, the share request, optional context for
  //        the audit row.
  // OUTPUT: ShareSuccess on success, ShareFailure otherwise.
  // WHY: Spec's nine-step flow in order: validate session, verify
  //      ownership of each capsule, clearance-check the grantee
  //      against each capsule, mint a bridge_id, create one
  //      permission per capsule under that bridge_id, invalidate
  //      grantee sessions so they re-pick-up new access on next
  //      login, audit, return.
  async share(
    sessionToken: string,
    request: ShareRequest,
    context: { ip_address?: string | null } = {},
  ): Promise<ShareSuccess | ShareFailure> {
    if (
      !request ||
      typeof request.grantee_entity_id !== "string" ||
      !Array.isArray(request.capsule_grants) ||
      request.capsule_grants.length === 0
    ) {
      return invalid(
        "INVALID_REQUEST",
        "grantee_entity_id and at least one capsule_grant are required",
      );
    }

    const session = await this.authService.validateSession(
      sessionToken,
      "share",
    );
    if (!session.valid) {
      await writeAuditEvent({
        event_type: "PERMISSION_CREATED",
        outcome: "DENIED",
        denial_reason: session.code,
        ip_address: context.ip_address ?? null,
        details: { via: "SHARE" },
      });
      return { ok: false, code: session.code, message: "Share denied" };
    }

    // Look up the grantee + their TAR for the clearance check.
    const grantee = await getEntityById(request.grantee_entity_id);
    if (grantee === null) {
      await writeAuditEvent({
        event_type: "PERMISSION_CREATED",
        outcome: "DENIED",
        actor_entity_id: session.entity_id,
        denial_reason: "GRANTEE_NOT_FOUND",
        ip_address: context.ip_address ?? null,
        details: { via: "SHARE", grantee_entity_id: request.grantee_entity_id },
      });
      return invalid("GRANTEE_NOT_FOUND", "Grantee entity not found");
    }
    const granteeTar = await getTARByEntityId(grantee.entity_id);
    if (granteeTar === null) {
      await writeAuditEvent({
        event_type: "PERMISSION_CREATED",
        outcome: "DENIED",
        actor_entity_id: session.entity_id,
        target_entity_id: grantee.entity_id,
        denial_reason: "GRANTEE_NO_TAR",
        ip_address: context.ip_address ?? null,
        details: { via: "SHARE" },
      });
      return invalid("GRANTEE_NO_TAR", "Grantee has no TAR");
    }

    // Look up every capsule the request mentions in one query.
    const capsuleIds = request.capsule_grants.map((g) => g.capsule_id);
    const capsules = await prisma.memoryCapsule.findMany({
      where: { capsule_id: { in: capsuleIds }, deleted_at: null },
    });
    const capsuleById = new Map(capsules.map((c) => [c.capsule_id, c]));

    const notFound = capsuleIds.filter((id) => !capsuleById.has(id));
    if (notFound.length > 0) {
      await writeAuditEvent({
        event_type: "PERMISSION_CREATED",
        outcome: "DENIED",
        actor_entity_id: session.entity_id,
        target_entity_id: grantee.entity_id,
        denial_reason: "CAPSULES_NOT_FOUND",
        ip_address: context.ip_address ?? null,
        details: { via: "SHARE", not_found: notFound },
      });
      return {
        ok: false,
        code: "CAPSULES_NOT_FOUND",
        message: "One or more capsules were not found",
        details: { not_found: notFound },
      };
    }

    // Verify the session entity owns every capsule.
    const notOwned = capsules
      .filter((c) => c.entity_id !== session.entity_id)
      .map((c) => c.capsule_id);
    if (notOwned.length > 0) {
      await writeAuditEvent({
        event_type: "PERMISSION_CREATED",
        outcome: "DENIED",
        actor_entity_id: session.entity_id,
        target_entity_id: grantee.entity_id,
        denial_reason: "CAPSULES_NOT_OWNED",
        ip_address: context.ip_address ?? null,
        details: { via: "SHARE", not_owned: notOwned },
      });
      return {
        ok: false,
        code: "CAPSULES_NOT_OWNED",
        message: "Session entity does not own one or more of the capsules",
        details: { not_owned: notOwned },
      };
    }

    // Grantee's clearance ceiling vs each capsule's clearance.
    const tooHigh = capsules
      .filter((c) => c.clearance_required > granteeTar.clearance_ceiling)
      .map((c) => c.capsule_id);
    if (tooHigh.length > 0) {
      await writeAuditEvent({
        event_type: "PERMISSION_CREATED",
        outcome: "DENIED",
        actor_entity_id: session.entity_id,
        target_entity_id: grantee.entity_id,
        denial_reason: "CLEARANCE_INSUFFICIENT_FOR_CAPSULES",
        ip_address: context.ip_address ?? null,
        details: {
          via: "SHARE",
          failed_capsules: tooHigh,
          grantee_ceiling: granteeTar.clearance_ceiling,
        },
      });
      return {
        ok: false,
        code: "CLEARANCE_INSUFFICIENT_FOR_CAPSULES",
        message:
          "Grantee's clearance ceiling is below one or more capsules' required clearance",
        details: { failed_capsules: tooHigh },
      };
    }

    // Mint the shared bridge_id.
    const bridgeId = randomUUID();

    // Create one permission per grant, all under the same bridge_id.
    const permissionIds: string[] = [];
    for (const grant of request.capsule_grants) {
      const permission = await createPermission({
        capsule_id: grant.capsule_id,
        grantor_entity_id: session.entity_id,
        grantee_entity_id: grantee.entity_id,
        access_scope: grant.scope,
        bridge_id: bridgeId,
        duration_type: grant.duration_type,
        can_share_forward: grant.can_share_forward,
        valid_from: grant.valid_from,
        expires_at: grant.expires_at,
        conditions: grant.conditions,
        actor_id: session.entity_id,
      });
      permissionIds.push(permission.permission_id);
    }

    // Invalidate every active session the grantee currently holds
    // so the grantee picks up the new access state on next login.
    await invalidateEntitySessions(
      grantee.entity_id,
      "PERMISSIONS_GRANTED_VIA_SHARE",
      session.entity_id,
    );

    // 12B.0: capture the success-summary audit event so the route
    // can surface audit_event_id on the SHARE response. Enables
    // audit-aware UI to render a clickable link from the action
    // confirmation toast to the audit row in Security & Audit.
    const auditEvent = await writeAuditEvent({
      event_type: "PERMISSION_CREATED",
      outcome: "SUCCESS",
      actor_entity_id: session.entity_id,
      target_entity_id: grantee.entity_id,
      session_id: session.session_id,
      ip_address: context.ip_address ?? null,
      details: {
        via: "SHARE",
        bridge_id: bridgeId,
        capsule_ids: capsuleIds,
        permission_ids: permissionIds,
        write_reason: request.write_reason ?? null,
      },
    });

    return {
      ok: true,
      bridge_id: bridgeId,
      permissions_created: permissionIds,
      audit_event_id: auditEvent.audit_id,
    };
  }

  // WHAT: Revoke every permission in a bridge, immediately.
  // INPUT: Session token, the bridge_id to revoke, optional context.
  // OUTPUT: RevokeSuccess on success, RevokeFailure otherwise.
  // WHY: Spec is explicit -- IMMEDIATE, NO GRACE PERIOD. The
  //      grantee's active sessions get killed in the same flow so
  //      their next request fails with SESSION_INVALIDATED.
  async revoke(
    sessionToken: string,
    bridgeId: string,
    context: { ip_address?: string | null } = {},
  ): Promise<RevokeSuccess | RevokeFailure> {
    const session = await this.authService.validateSession(
      sessionToken,
      "share",
    );
    if (!session.valid) {
      await writeAuditEvent({
        event_type: "PERMISSION_REVOKED",
        outcome: "DENIED",
        denial_reason: session.code,
        ip_address: context.ip_address ?? null,
        details: { via: "REVOKE", bridge_id: bridgeId },
      });
      return { ok: false, code: session.code, message: "Revoke denied" };
    }

    const permissions = await prisma.permission.findMany({
      where: { bridge_id: bridgeId },
    });
    if (permissions.length === 0) {
      await writeAuditEvent({
        event_type: "PERMISSION_REVOKED",
        outcome: "DENIED",
        actor_entity_id: session.entity_id,
        denial_reason: "BRIDGE_NOT_FOUND",
        ip_address: context.ip_address ?? null,
        details: { via: "REVOKE", bridge_id: bridgeId },
      });
      return {
        ok: false,
        code: "BRIDGE_NOT_FOUND",
        message: "No permissions found for that bridge_id",
      };
    }

    const grantors = new Set(permissions.map((p) => p.grantor_entity_id));
    if (grantors.size !== 1 || !grantors.has(session.entity_id)) {
      await writeAuditEvent({
        event_type: "PERMISSION_REVOKED",
        outcome: "DENIED",
        actor_entity_id: session.entity_id,
        denial_reason: "NOT_GRANTOR",
        ip_address: context.ip_address ?? null,
        details: { via: "REVOKE", bridge_id: bridgeId },
      });
      return {
        ok: false,
        code: "NOT_GRANTOR",
        message: "Only the original grantor can revoke this bridge",
      };
    }

    const granteeId = permissions[0]!.grantee_entity_id;

    const count = await revokeBridge(bridgeId, session.entity_id);

    // Immediately invalidate the grantee's active sessions so any
    // request they currently have in flight fails on its next
    // validateSession call.
    await invalidateEntitySessions(
      granteeId,
      "PERMISSIONS_REVOKED_VIA_BRIDGE",
      session.entity_id,
    );

    // 12B.0: capture the success-summary audit event so the route
    // can surface audit_event_id on the REVOKE response.
    const auditEvent = await writeAuditEvent({
      event_type: "PERMISSION_REVOKED",
      outcome: "SUCCESS",
      actor_entity_id: session.entity_id,
      target_entity_id: granteeId,
      session_id: session.session_id,
      ip_address: context.ip_address ?? null,
      details: {
        via: "REVOKE",
        bridge_id: bridgeId,
        revoked_count: count,
      },
    });

    return {
      ok: true,
      revoked_count: count,
      bridge_id: bridgeId,
      audit_event_id: auditEvent.audit_id,
    };
  }
}

// WHAT: Build a ShareFailure with a given code and message.
// INPUT: The code and the message string.
// OUTPUT: A ShareFailure.
// WHY: Centralizes the helper so call sites stay readable.
function invalid(code: ShareFailure["code"], message: string): ShareFailure {
  return { ok: false, code, message };
}
