// FILE: platform-authority.service.ts
// PURPOSE: [PLATFORM-AUTHORITY] The governed can_admin_niov grant/revoke
//          service -- the routine successor to the founder bootstrap
//          script (scripts/bootstrap-niov-operator.ts, which remains ONLY
//          for zero-root bootstrap when no operators exist). Invariants:
//            - can_admin_niov moves ONLY through here (HTTP tier), under
//              dual control: the routes are payload-bound + single-use,
//              so a second operator approves ONE exact (target_email,
//              reason) body, once. Consumption is atomic with the TAR
//              write (same transaction) -- a crash grants nothing and
//              burns nothing.
//            - Self-grant is refused (a requester can never be their own
//              target, even with a second approver).
//            - Targets must be dedicated platform identities: ACTIVE
//              PERSON, valid ACTIVE TAR, and NOT an org admin
//              (can_admin_org) -- platform authority never lands on a
//              daily app/org account (this is also what makes the demo
//              org's admin structurally ungrantable).
//            - Revoke enforces the TWO-OPERATOR FLOOR: a revocation that
//              would leave fewer than two ACTIVE can_admin_niov
//              operators refuses -- platform authority stays recoverable
//              without the founder's zero-root script.
//            - The TAR change rides the ONE canonical mutation path
//              (updateTARPermissionsInTx: hash recompute + version bump
//              + session invalidation + TAR_PERMISSIONS_UPDATE data
//              audit), plus an ADMIN_ACTION audit event carrying
//              actor/target/old->new/reason/escalation id. No secrets
//              anywhere; passwords and org memberships are never touched.
// CONNECTS TO: platform.routes.ts (POST /platform/admin-niov-grants +
//              /admin-niov-revocations, can_admin_niov +
//              requireDualControl), security/privileged-endpoints.ts
//              (PLATFORM_ADMIN_NIOV_GRANT/REVOKE, payload-bound),
//              escalation.service.ts (consumeApprovedDualControlInTx),
//              @niov/database (updateTARPermissionsInTx et al),
//              tests/integration/platform-authority.test.ts,
//              docs (admin-bootstrap runbook §5A successor note).

import {
  getEntityByEmail,
  prisma,
  updateTARPermissionsInTx,
  writeAuditEvent,
} from "@niov/database";
import { consumeApprovedDualControlInTx } from "./escalation.service.js";

// WHAT: The minimum number of ACTIVE can_admin_niov operators that must
//        remain after a revocation.
// INPUT: Compared against the post-revoke operator census.
// OUTPUT: A count.
// WHY: Dual control needs two humans; dropping below two also recreates
//      the zero-root condition the founder bootstrap script exists for.
//      Recovery below the floor is deliberately founder-tier, not HTTP.
export const PLATFORM_OPERATOR_FLOOR = 2;

export interface PlatformAuthorityInput {
  target_email: string;
  reason: string;
  /** The APPROVED dual-control escalation the middleware verified --
   *  consumed atomically with the TAR write. */
  consume_escalation_id: string | null;
}

export interface PlatformAuthorityResult {
  entity_id: string;
  target_email: string;
  can_admin_niov: boolean;
  tar_version: number;
  audit_event_id: string;
}

interface ValidatedTarget {
  entityId: string;
  email: string;
  tarId: string;
  hadAdminNiov: boolean;
}

// WHAT: Shared target validation for grant + revoke.
// INPUT: actorEntityId + the raw input.
// OUTPUT: The validated target, or a domain-string throw (see routes for
//         the HTTP mapping).
// WHY: Both directions share every gate except the direction-specific
//      ones (already-operator / not-operator / floor).
async function validateTarget(
  actorEntityId: string,
  input: PlatformAuthorityInput,
): Promise<ValidatedTarget> {
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (reason.length === 0) throw new Error("AUTHORITY_REASON_REQUIRED");
  const email =
    typeof input.target_email === "string" ? input.target_email.trim() : "";
  if (email.length === 0 || !email.includes("@")) {
    throw new Error("AUTHORITY_TARGET_EMAIL_REQUIRED");
  }
  const entity = await getEntityByEmail(email);
  if (entity === null || entity.deleted_at !== null) {
    throw new Error("AUTHORITY_TARGET_NOT_FOUND");
  }
  if (entity.entity_id === actorEntityId) {
    throw new Error("AUTHORITY_SELF_TARGET_FORBIDDEN");
  }
  if (entity.entity_type !== "PERSON") {
    throw new Error("AUTHORITY_TARGET_NOT_PERSON");
  }
  if (entity.status !== "ACTIVE") {
    throw new Error("AUTHORITY_TARGET_NOT_ACTIVE");
  }
  const tar = await prisma.tokenAttributeRepository.findUnique({
    where: { entity_id: entity.entity_id },
  });
  if (tar === null || tar.status !== "ACTIVE") {
    throw new Error("AUTHORITY_TARGET_TAR_INVALID");
  }
  if (tar.can_admin_org === true) {
    // Platform operators are DEDICATED identities. An org admin holding
    // platform authority would mix tenancy tiers -- and this is exactly
    // the guard that keeps daily app/org admin accounts ungrantable.
    throw new Error("AUTHORITY_TARGET_IS_ORG_ADMIN");
  }
  return {
    entityId: entity.entity_id,
    email: entity.email ?? email,
    tarId: tar.tar_id,
    hadAdminNiov: tar.can_admin_niov === true,
  };
}

// WHAT: Count the ACTIVE platform operators (ACTIVE PERSON entity +
//        ACTIVE TAR with can_admin_niov).
// INPUT: None.
// OUTPUT: The census count.
// WHY: The revoke floor must be judged against operators who can
//      actually act -- suspended/deleted holders don't count.
async function activeOperatorCount(): Promise<number> {
  return prisma.tokenAttributeRepository.count({
    where: {
      can_admin_niov: true,
      status: "ACTIVE",
      entity: { status: "ACTIVE", deleted_at: null, entity_type: "PERSON" },
    },
  });
}

async function applyAuthorityChange(
  actorEntityId: string,
  target: ValidatedTarget,
  input: PlatformAuthorityInput,
  grant: boolean,
): Promise<PlatformAuthorityResult> {
  // ONE transaction: approval consumption + TAR write + audit-of-record
  // land together or not at all.
  return prisma.$transaction(async (tx) => {
    if (
      input.consume_escalation_id !== undefined &&
      input.consume_escalation_id !== null
    ) {
      await consumeApprovedDualControlInTx(
        tx,
        input.consume_escalation_id,
        actorEntityId,
      );
    }
    const updated = await updateTARPermissionsInTx(
      tx,
      target.tarId,
      { can_admin_niov: grant },
      { actor_entity_id: actorEntityId },
    );
    const audit = await writeAuditEvent(
      {
        event_type: "ADMIN_ACTION",
        outcome: "SUCCESS",
        actor_entity_id: actorEntityId,
        target_entity_id: target.entityId,
        details: {
          action: grant
            ? "PLATFORM_ADMIN_NIOV_GRANTED"
            : "PLATFORM_ADMIN_NIOV_REVOKED",
          target_entity_id: target.entityId,
          target_email: target.email,
          old_permissions: { can_admin_niov: target.hadAdminNiov },
          new_permissions: { can_admin_niov: grant },
          reason: input.reason.trim(),
          dual_control_escalation_id: input.consume_escalation_id,
          tar_version: updated.tar_version,
        },
      },
      tx,
    );
    return {
      entity_id: target.entityId,
      target_email: target.email,
      can_admin_niov: grant,
      tar_version: updated.tar_version,
      audit_event_id: audit.audit_id,
    };
  });
}

// WHAT: Grant can_admin_niov to a validated dedicated identity.
// INPUT: actorEntityId (the requesting operator, from request.auth) +
//        the payload-bound input.
// OUTPUT: PlatformAuthorityResult, or domain-string throws (routes map):
//         AUTHORITY_REASON_REQUIRED / AUTHORITY_TARGET_EMAIL_REQUIRED
//         (400), AUTHORITY_TARGET_NOT_FOUND (404),
//         AUTHORITY_SELF_TARGET_FORBIDDEN (403),
//         AUTHORITY_TARGET_NOT_PERSON / _NOT_ACTIVE / _TAR_INVALID /
//         _IS_ORG_ADMIN / AUTHORITY_ALREADY_OPERATOR (409).
// WHY: See FILE header invariants.
export async function grantAdminNiov(
  actorEntityId: string,
  input: PlatformAuthorityInput,
): Promise<PlatformAuthorityResult> {
  const target = await validateTarget(actorEntityId, input);
  if (target.hadAdminNiov) {
    // Idempotence is a REFUSAL here, not a silent success: the approval
    // is not consumed, and the caller learns nothing changed.
    throw new Error("AUTHORITY_ALREADY_OPERATOR");
  }
  return applyAuthorityChange(actorEntityId, target, input, true);
}

// WHAT: Revoke can_admin_niov from a platform operator, floor-protected.
// INPUT: As grantAdminNiov.
// OUTPUT: As grantAdminNiov, plus AUTHORITY_NOT_OPERATOR (409) and
//         AUTHORITY_OPERATOR_FLOOR (409) throws.
// WHY: See FILE header invariants -- the floor keeps platform authority
//      recoverable without the founder's zero-root script.
export async function revokeAdminNiov(
  actorEntityId: string,
  input: PlatformAuthorityInput,
): Promise<PlatformAuthorityResult> {
  const target = await validateTarget(actorEntityId, input);
  if (!target.hadAdminNiov) throw new Error("AUTHORITY_NOT_OPERATOR");
  const census = await activeOperatorCount();
  if (census - 1 < PLATFORM_OPERATOR_FLOOR) {
    throw new Error("AUTHORITY_OPERATOR_FLOOR");
  }
  return applyAuthorityChange(actorEntityId, target, input, false);
}
