// FILE: lockout-recovery.service.ts
// PURPOSE: [LOCKOUT-RECOVERY] Platform-operator recovery for the sole-admin
//          lockout trap: the 5th failed login flips an entity to SUSPENDED
//          (auth.service.ts FAILED_AUTH_LOCKOUT), but the only reactivation
//          rail (PATCH /org/entities/:id) requires an org admin OF THAT ORG
//          -- an org whose only admin locked themselves out is bricked with
//          no self-service recovery. This service lets a NIOV platform
//          operator clear a suspension IF AND ONLY IF it is provably
//          lockout-caused:
//            (a) the entity is SUSPENDED, AND
//            (b) failed_auth_attempts >= FAILED_AUTH_LOCKOUT, AND
//            (c) the newest ENTITY_SUSPENDED audit row for the entity is
//                the auth-layer lockout record (actorless, reason
//                "5 failed attempts").
//          Anything else refuses -- this is NOT a general unsuspend rail:
//          an admin-authored suspension (PATCH rail, has an actor and no
//          lockout reason) stays suspended. Recovery touches ONLY entity
//          status + the failed counter (never TAR, never memberships,
//          never passwords) and writes ENTITY_REACTIVATED audit with
//          actor/target/reason/prior-state metadata. A mandatory human
//          reason is stored in audit and never echoed back.
// CONNECTS TO: auth.service.ts (FAILED_AUTH_LOCKOUT + the lockout write
//              this reverses), platform.routes.ts
//              (POST /platform/entities/:entityId/clear-lockout,
//              can_admin_niov), @niov/database (getEntityById /
//              updateEntityStatus / resetFailedAuth / queryAuditEvents /
//              writeAuditEvent), tests/integration/platform-lockout.test.ts.

import {
  getEntityByEmail,
  getEntityById,
  queryAuditEvents,
  resetFailedAuth,
  updateEntityStatus,
  writeAuditEvent,
} from "@niov/database";
import { FAILED_AUTH_LOCKOUT } from "../auth.service.js";

// WHAT: The details.reason string the auth layer stamps on a lockout
//        suspension's ENTITY_SUSPENDED audit row.
// INPUT: Compared against the newest ENTITY_SUSPENDED row's details.
// OUTPUT: A string constant.
// WHY: The audit chain is the proof-of-cause: only the auth layer writes
//      this exact actorless record (auth.service.ts), so matching it is
//      what separates "locked out" from "an admin suspended this person
//      on purpose". Keep in lock-step with auth.service.ts.
export const LOCKOUT_AUDIT_REASON = "5 failed attempts";

export interface ClearLockoutInput {
  /** Target entity: a UUID, or the account EMAIL (the identifier a
   *  platform operator actually has for a locked-out sole admin — there
   *  is deliberately no cross-org entity-lookup rail). */
  entity_id: string;
  reason: string;
}

export interface ClearLockoutResult {
  entity_id: string;
  email: string | null;
  status: "ACTIVE";
  prior_failed_attempts: number;
  audit_event_id: string | null;
}

// WHAT: Clear a provably lockout-caused suspension: entity back to ACTIVE,
//        failed_auth_attempts back to 0, ENTITY_REACTIVATED audit written.
// INPUT: The acting platform operator's entity_id (from the authenticated
//        request, never the body) + { entity_id (target), reason }.
// OUTPUT: A ClearLockoutResult, or a domain-string throw:
//         LOCKOUT_REASON_REQUIRED   -- reason missing/blank (400 at route)
//         LOCKOUT_ENTITY_NOT_FOUND  -- no such entity (404)
//         LOCKOUT_NOT_SUSPENDED     -- target is not SUSPENDED (409)
//         LOCKOUT_NOT_LOCKOUT_CAUSED -- suspension is not the auth-layer
//                                       lockout (counter below threshold OR
//                                       newest ENTITY_SUSPENDED row is not
//                                       the lockout record) (409)
// WHY: See FILE header. The three-part proof keeps this rail narrow: it
//      can undo exactly the state the auth layer wrote, nothing broader.
export async function clearLockoutSuspension(
  actorEntityId: string,
  input: ClearLockoutInput,
): Promise<ClearLockoutResult> {
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (reason.length === 0) throw new Error("LOCKOUT_REASON_REQUIRED");

  const entity = input.entity_id.includes("@")
    ? await getEntityByEmail(input.entity_id)
    : await getEntityById(input.entity_id);
  if (entity === null || entity.deleted_at !== null) {
    throw new Error("LOCKOUT_ENTITY_NOT_FOUND");
  }
  if (entity.status !== "SUSPENDED") throw new Error("LOCKOUT_NOT_SUSPENDED");

  // Proof of cause, part 1: the counter the auth layer incremented.
  if (entity.failed_auth_attempts < FAILED_AUTH_LOCKOUT) {
    throw new Error("LOCKOUT_NOT_LOCKOUT_CAUSED");
  }
  // Proof of cause, part 2: the suspension OF RECORD is the auth layer's
  // actorless lockout write -- not an admin's deliberate suspension. The
  // newest ENTITY_SUSPENDED row decides (append-only chain, desc order).
  const suspensions = await queryAuditEvents({
    target_entity_id: entity.entity_id,
    event_type: "ENTITY_SUSPENDED",
    page_size: 1,
  });
  const newest = suspensions.events[0];
  const details = (newest?.details ?? {}) as { reason?: unknown };
  if (
    newest === undefined ||
    newest.actor_entity_id !== null ||
    details.reason !== LOCKOUT_AUDIT_REASON
  ) {
    throw new Error("LOCKOUT_NOT_LOCKOUT_CAUSED");
  }

  const priorFailedAttempts = entity.failed_auth_attempts;
  await updateEntityStatus(entity.entity_id, "ACTIVE", actorEntityId);
  await resetFailedAuth(entity.entity_id, actorEntityId);
  const audit = await writeAuditEvent({
    event_type: "ENTITY_REACTIVATED",
    outcome: "SUCCESS",
    actor_entity_id: actorEntityId,
    target_entity_id: entity.entity_id,
    details: {
      action: "PLATFORM_LOCKOUT_CLEARED",
      reason,
      target_email: entity.email,
      prior_status: "SUSPENDED",
      prior_failed_attempts: priorFailedAttempts,
    },
  });
  return {
    entity_id: entity.entity_id,
    email: entity.email,
    status: "ACTIVE",
    prior_failed_attempts: priorFailedAttempts,
    audit_event_id: audit?.audit_id ?? null,
  };
}
