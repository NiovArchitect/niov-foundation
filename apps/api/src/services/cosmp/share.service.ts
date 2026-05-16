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
  type LawfulBasis,
} from "@niov/database";
import type { AuthService } from "../auth.service.js";
import { assertJurisdictionalScope } from "./jurisdiction-enforcement.js";
import { enforceRegulatorCOSMPAccess } from "./regulator-enforcement.js";

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
    | "CLEARANCE_INSUFFICIENT_FOR_CAPSULES"
    // CAR Sub-box 3 sub-phase 6 [SUB-BOX-3-COSMP-ENFORCEMENT] per
    // Q4 LOCKED Option α start-check + ADR-0036 Sub-decision 5 + 6.
    | "REGULATOR_LAWFUL_BASIS_REQUIRED"
    | "LAWFUL_BASIS_NOT_FOUND"
    | "LAWFUL_BASIS_NOT_LINKED_TO_AUDIT"
    | "LAWFUL_BASIS_NOT_YET_VALID"
    | "LAWFUL_BASIS_EXPIRED"
    | "LAWFUL_BASIS_REVOKED"
    | "LAWFUL_BASIS_HASH_MISMATCH"
    | "REGULATOR_SCOPE_NOT_AUTHORIZED"
    | "REGULATOR_JURISDICTION_NOT_AUTHORIZED"
    | "REGULATOR_ACCESS_DENIED"
    | "INTERNAL_ENFORCEMENT_ERROR"
    // CAR Sub-box 2 sub-phase 4 [CAR-SUB-BOX-2-COSMP-ENFORCEMENT] per
    // ADR-0037 Sub-decision 7 SHARE/REVOKE start-check + Q5 LOCKED
    // Option α (actor↔capsule only). Per-capsule jurisdiction check
    // before permission creation/revocation.
    | "ACTOR_JURISDICTION_MISSING"
    | "TARGET_JURISDICTION_MISSING"
    | "CROSS_JURISDICTION_ACCESS_DENIED"
    | "JURISDICTION_NOT_AUTHORIZED";
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
    | "NOT_GRANTOR"
    // CAR Sub-box 3 sub-phase 6 [SUB-BOX-3-COSMP-ENFORCEMENT] per
    // Q4 LOCKED Option α start-check + ADR-0036 Sub-decision 5 + 6.
    | "REGULATOR_LAWFUL_BASIS_REQUIRED"
    | "LAWFUL_BASIS_NOT_FOUND"
    | "LAWFUL_BASIS_NOT_LINKED_TO_AUDIT"
    | "LAWFUL_BASIS_NOT_YET_VALID"
    | "LAWFUL_BASIS_EXPIRED"
    | "LAWFUL_BASIS_REVOKED"
    | "LAWFUL_BASIS_HASH_MISMATCH"
    | "REGULATOR_SCOPE_NOT_AUTHORIZED"
    | "REGULATOR_JURISDICTION_NOT_AUTHORIZED"
    | "REGULATOR_ACCESS_DENIED"
    | "INTERNAL_ENFORCEMENT_ERROR"
    // CAR Sub-box 2 sub-phase 4 [CAR-SUB-BOX-2-COSMP-ENFORCEMENT] per
    // ADR-0037 Sub-decision 7 SHARE/REVOKE start-check + Q5 LOCKED
    // Option α (actor↔capsule only). Per-capsule jurisdiction check
    // before permission creation/revocation.
    | "ACTOR_JURISDICTION_MISSING"
    | "TARGET_JURISDICTION_MISSING"
    | "CROSS_JURISDICTION_ACCESS_DENIED"
    | "JURISDICTION_NOT_AUTHORIZED";
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
    context: {
      ip_address?: string | null;
      // CAR Sub-box 3 sub-phase 6 [SUB-BOX-3-COSMP-ENFORCEMENT] per
      // Q8 LOCKED Option α: REGULATOR actor flows must supply the
      // X-Lawful-Basis-Id header, propagated here. Non-REGULATOR
      // flows leave this null/undefined; existing behavior preserved.
      lawful_basis_id?: string | null;
    } = {},
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

    // CAR Sub-box 3 sub-phase 6 [SUB-BOX-3-COSMP-ENFORCEMENT] per
    // Q4 LOCKED Option α start-check: when actor is REGULATOR, lawful-
    // basis enforcement runs BEFORE grantee lookup / capsule ownership
    // checks. Non-REGULATOR behavior unchanged. 3 indexed point-lookups;
    // no scans; no global lock per Sub-phase 6 §18 Whole-COSMP
    // scalability discipline canonical at substantive register
    // substantively.
    let validatedRegulatorBasis: LawfulBasis | null = null;
    const requester = await getEntityById(session.entity_id);
    if (requester !== null && requester.entity_type === "REGULATOR") {
      const enforcement = await enforceRegulatorCOSMPAccess({
        requester,
        lawful_basis_id: context.lawful_basis_id,
      });
      if (!enforcement.ok) {
        await writeAuditEvent({
          event_type: "PERMISSION_CREATED",
          outcome: "DENIED",
          actor_entity_id: session.entity_id,
          session_id: session.session_id,
          denial_reason: enforcement.code,
          ip_address: context.ip_address ?? null,
          lawful_basis_id:
            typeof context.lawful_basis_id === "string"
              ? context.lawful_basis_id
              : null,
          details: { via: "SHARE", entity_type: requester.entity_type },
        });
        return {
          ok: false,
          code: enforcement.code,
          message: "REGULATOR share denied at lawful-basis enforcement",
        };
      }
      validatedRegulatorBasis = enforcement.basis;
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

    // CAR Sub-box 2 sub-phase 4 [CAR-SUB-BOX-2-COSMP-ENFORCEMENT] per
    // ADR-0037 Sub-decision 7 SHARE start-check + Q5 LOCKED Option α
    // (actor↔capsule only; grantee↔capsule deferred). Per-capsule
    // jurisdiction check using already-fetched actor (requester) +
    // capsules. Pure-function helper; ZERO additional DB reads. If
    // ANY capsule fails, the entire share is denied (substrate-coherent
    // with the existing CAPSULES_NOT_OWNED + CLEARANCE_INSUFFICIENT_FOR_CAPSULES
    // bulk-denial pattern). Aggregate failure code carried at the
    // first failing capsule's helper code; per-capsule jurisdictions
    // surfaced in details for caller forensics.
    if (requester !== null) {
      const jurisdictionFailures: Array<{
        capsule_id: string;
        code: string;
        actor_jurisdiction: string | null | undefined;
        target_jurisdiction: string | null | undefined;
      }> = [];
      for (const c of capsules) {
        const result = assertJurisdictionalScope({
          actor: {
            entity_id: requester.entity_id,
            jurisdiction: requester.jurisdiction,
          },
          target: {
            capsule: {
              capsule_id: c.capsule_id,
              jurisdiction: c.jurisdiction,
            },
          },
          action: "SHARE",
        });
        if (!result.ok) {
          jurisdictionFailures.push({
            capsule_id: c.capsule_id,
            code: result.code,
            actor_jurisdiction: result.actor_jurisdiction,
            target_jurisdiction: result.target_jurisdiction,
          });
        }
      }
      if (jurisdictionFailures.length > 0) {
        const firstFailureCode = jurisdictionFailures[0]!.code as
          | "ACTOR_JURISDICTION_MISSING"
          | "TARGET_JURISDICTION_MISSING"
          | "CROSS_JURISDICTION_ACCESS_DENIED"
          | "JURISDICTION_NOT_AUTHORIZED";
        await writeAuditEvent({
          event_type: "PERMISSION_CREATED",
          outcome: "DENIED",
          actor_entity_id: session.entity_id,
          target_entity_id: grantee.entity_id,
          session_id: session.session_id,
          denial_reason: firstFailureCode,
          ip_address: context.ip_address ?? null,
          // Per Q7 LOCKED Option α: bulk PERMISSION_CREATED denial
          // row-level jurisdiction stays null; per-capsule details
          // captured in the details JSON.
          details: {
            via: "SHARE",
            jurisdiction_failures: jurisdictionFailures,
          },
        });
        return {
          ok: false,
          code: firstFailureCode,
          message: "SHARE denied at jurisdiction-scope enforcement",
          details: {
            failed_capsules: jurisdictionFailures.map((f) => f.capsule_id),
          },
        };
      }
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
      // CAR Sub-box 3 sub-phase 6 [SUB-BOX-3-COSMP-ENFORCEMENT]: when
      // REGULATOR enforcement validated a basis at the start-check,
      // carry the binding into canonical_record positions 13 + 14
      // per ADR-0036 Sub-decision 5.
      lawful_basis_id: validatedRegulatorBasis?.basis_id ?? null,
      lawful_basis_chain_hash:
        validatedRegulatorBasis?.chain_hash ?? null,
      // CAR Sub-box 2 sub-phase 4 per Q7 LOCKED Option α: bulk
      // PERMISSION_CREATED success row-level jurisdiction stays null
      // (multi-capsule operation may span multiple jurisdictions);
      // per-capsule jurisdictions captured in details.capsule_jurisdictions
      // for compliance forensics.
      details: {
        via: "SHARE",
        bridge_id: bridgeId,
        capsule_ids: capsuleIds,
        capsule_jurisdictions: capsules.map((c) => ({
          capsule_id: c.capsule_id,
          jurisdiction: c.jurisdiction,
        })),
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
    context: {
      ip_address?: string | null;
      // CAR Sub-box 3 sub-phase 6 [SUB-BOX-3-COSMP-ENFORCEMENT] per
      // Q8 LOCKED Option α: REGULATOR actor flows must supply the
      // X-Lawful-Basis-Id header, propagated here. Non-REGULATOR
      // flows leave this null/undefined; existing behavior preserved.
      lawful_basis_id?: string | null;
    } = {},
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

    // CAR Sub-box 3 sub-phase 6 [SUB-BOX-3-COSMP-ENFORCEMENT] per
    // Q4 LOCKED Option α start-check: when actor is REGULATOR, lawful-
    // basis enforcement runs BEFORE bridge ownership check. Non-
    // REGULATOR behavior unchanged.
    let validatedRegulatorBasis: LawfulBasis | null = null;
    const requester = await getEntityById(session.entity_id);
    if (requester !== null && requester.entity_type === "REGULATOR") {
      const enforcement = await enforceRegulatorCOSMPAccess({
        requester,
        lawful_basis_id: context.lawful_basis_id,
      });
      if (!enforcement.ok) {
        await writeAuditEvent({
          event_type: "PERMISSION_REVOKED",
          outcome: "DENIED",
          actor_entity_id: session.entity_id,
          session_id: session.session_id,
          denial_reason: enforcement.code,
          ip_address: context.ip_address ?? null,
          lawful_basis_id:
            typeof context.lawful_basis_id === "string"
              ? context.lawful_basis_id
              : null,
          details: { via: "REVOKE", bridge_id: bridgeId, entity_type: requester.entity_type },
        });
        return {
          ok: false,
          code: enforcement.code,
          message: "REGULATOR revoke denied at lawful-basis enforcement",
        };
      }
      validatedRegulatorBasis = enforcement.basis;
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

    // CAR Sub-box 2 sub-phase 4 [CAR-SUB-BOX-2-COSMP-ENFORCEMENT] per
    // ADR-0037 Sub-decision 7 REVOKE start-check + Q3 LOCKED Option α
    // (bounded capsule fetch). Bridge-scoped bulk query: returns at
    // most one row per distinct capsule_id under this bridge_id (a
    // bridge typically covers <100 capsules; SHARE bulks them under
    // ONE bridge_id by design). Per-request indexed bulk-IN lookup;
    // no scans; no global lock per Sub-phase 6 §18 Whole-COSMP
    // scalability discipline canonical at substantive register
    // substantively. Per-capsule jurisdiction check before
    // revokeBridge so a jurisdiction-drifted actor cannot revoke
    // permissions on a capsule outside their current jurisdictional
    // anchor.
    const revokeCapsuleIds = Array.from(
      new Set(permissions.map((p) => p.capsule_id)),
    );
    const revokeCapsules = await prisma.memoryCapsule.findMany({
      where: { capsule_id: { in: revokeCapsuleIds } },
      select: { capsule_id: true, jurisdiction: true },
    });
    if (requester !== null) {
      const revokeJurisdictionFailures: Array<{
        capsule_id: string;
        code: string;
        actor_jurisdiction: string | null | undefined;
        target_jurisdiction: string | null | undefined;
      }> = [];
      for (const c of revokeCapsules) {
        const result = assertJurisdictionalScope({
          actor: {
            entity_id: requester.entity_id,
            jurisdiction: requester.jurisdiction,
          },
          target: {
            capsule: {
              capsule_id: c.capsule_id,
              jurisdiction: c.jurisdiction,
            },
          },
          action: "REVOKE",
        });
        if (!result.ok) {
          revokeJurisdictionFailures.push({
            capsule_id: c.capsule_id,
            code: result.code,
            actor_jurisdiction: result.actor_jurisdiction,
            target_jurisdiction: result.target_jurisdiction,
          });
        }
      }
      if (revokeJurisdictionFailures.length > 0) {
        const firstFailureCode = revokeJurisdictionFailures[0]!.code as
          | "ACTOR_JURISDICTION_MISSING"
          | "TARGET_JURISDICTION_MISSING"
          | "CROSS_JURISDICTION_ACCESS_DENIED"
          | "JURISDICTION_NOT_AUTHORIZED";
        await writeAuditEvent({
          event_type: "PERMISSION_REVOKED",
          outcome: "DENIED",
          actor_entity_id: session.entity_id,
          target_entity_id: granteeId,
          session_id: session.session_id,
          denial_reason: firstFailureCode,
          ip_address: context.ip_address ?? null,
          // Per Q7 LOCKED Option α: bulk PERMISSION_REVOKED denial
          // row-level jurisdiction stays null; per-capsule failures
          // captured in details JSON.
          details: {
            via: "REVOKE",
            bridge_id: bridgeId,
            jurisdiction_failures: revokeJurisdictionFailures,
          },
        });
        return {
          ok: false,
          code: firstFailureCode,
          message: "REVOKE denied at jurisdiction-scope enforcement",
        };
      }
    }

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
      // CAR Sub-box 3 sub-phase 6 [SUB-BOX-3-COSMP-ENFORCEMENT]: when
      // REGULATOR enforcement validated a basis at the start-check,
      // carry the binding into canonical_record positions 13 + 14
      // per ADR-0036 Sub-decision 5.
      lawful_basis_id: validatedRegulatorBasis?.basis_id ?? null,
      lawful_basis_chain_hash:
        validatedRegulatorBasis?.chain_hash ?? null,
      // CAR Sub-box 2 sub-phase 4 per Q7 LOCKED Option α: bulk
      // PERMISSION_REVOKED success row-level jurisdiction stays null
      // (multi-capsule operation); per-capsule jurisdictions captured
      // in details.capsule_jurisdictions for compliance forensics.
      details: {
        via: "REVOKE",
        bridge_id: bridgeId,
        revoked_count: count,
        capsule_jurisdictions: revokeCapsules.map((c) => ({
          capsule_id: c.capsule_id,
          jurisdiction: c.jurisdiction,
        })),
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
