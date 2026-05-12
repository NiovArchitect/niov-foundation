// FILE: escalation.service.ts
// PURPOSE: CRUD + state-machine over the EscalationRequest substrate
//          (the human-in-the-loop primitive that closes D-2D-D10).
//          Creates escalations (incl. the D-2D-D10-5 gate-fail
//          get-or-create helper createGateEscalationForCaller), lists/
//          counts pending ones, and drives the PENDING →
//          APPROVED/REJECTED/EXPIRED workflow with a pre-success audit
//          write on every state mutation.
// CONNECTS TO: @niov/database (prisma EscalationRequest model,
//              writeAuditEvent hash-chain, SYSTEM_PRINCIPALS),
//              apps/api/src/logger.ts (module-level structured
//              logger -- no console.* per RULE 16),
//              apps/api/src/services/otzar/priming.ts (consumes
//              listEscalationsPendingForCaller for the priming slot),
//              apps/api/src/routes/org.routes.ts:1148 (consumes
//              countEscalationsPending for the analytics endpoint),
//              apps/api/src/services/cosmp/negotiate.service.ts
//              (consumes createGateEscalationForCaller at the
//              requires_validation gate-fail block per D-2D-D10-5).
//
// 4-FRAMING-REGISTER CROSS-REFERENCE (RULE 17 load-on-open):
//   - RAA 12.8 §5.2 -- canonical EscalationRequest substrate +
//     status workflow + validation gate flags ([D-2D-D10-4]) +
//     approval-workflow gate-fail coupling ([D-2D-D10-5], this commit;
//     correction propagation chain still forward-queue [D-2D-D10-6])
//   - Section 12.5 Sub-box 1 -- the Foundation primitive blocking
//     Bucket B; dual-control middleware framing (forward [D-2D-D10-7])
//   - RAA 12.8 §5.9 item 1 -- Step 2E engineering surface enumeration
//     (the canonical engineering surface for Surface 3)
//   - Section 14 admin-tooling box -- the original "EscalationRequest
//     table doesn't exist yet" TODO lineage at priming.ts (now closed)
//
// FORCALLER-SUFFIX PATTERN (greenfield canonical example per ADR-0004
// service-owned auth gate): every caller-initiated function takes
// callerEntityId (the already-validated request.auth!.entity_id, NOT
// a session token) and owns its own ownership check. governance/
// siblings (twin.service.ts, dandelion.service.ts) use the legacy
// callerEntityId-direct convention without the ForCaller suffix; that
// is NOT propagated here -- this file establishes the ForCaller-suffix
// convention going forward. The one exception: countEscalationsPending
// (plain helper, no auth gate) -- see its JSDoc for the route-tier-
// auth-gate framing.
//
// ERROR CONTRACT (domain-string throws per twin.service.ts pattern;
// route handlers map to HTTP codes):
//   - ESCALATION_FORBIDDEN          -- caller fails the ownership gate
//   - ESCALATION_NOT_FOUND          -- escalation_id does not exist
//   - ESCALATION_INVALID_TRANSITION -- status is not PENDING (the
//     state machine only allows PENDING → APPROVED/REJECTED/EXPIRED;
//     no reverse / re-resolve transitions)
//
// AUDIT DISCIPLINE (ADR-0002 + RULE 4 -- audit trail is sacred):
// every state mutation runs inside a prisma.$transaction with the
// writeAuditEvent call threaded through the same tx, so the audit row
// and the mutation commit or roll back together. Audit event_type is
// "ADMIN_ACTION" with details.action discriminating
// (ESCALATION_CREATED / ESCALATION_APPROVED / ESCALATION_REJECTED /
// ESCALATION_EXPIRED) -- per the system-permission.ts:142 pattern.
//
// FORWARD QUEUE per §5.8 per-DMW-type sovereignty: the transition
// authorization here is a skeleton (target_entity_id OR
// resolved_by_entity_id may transition; source_entity_id cannot
// self-resolve). Full per-DMW-type sovereignty-rule integration is
// deferred per RAA 12.8 §5.9 item 7.

import {
  prisma,
  writeAuditEvent,
  SYSTEM_PRINCIPALS,
} from "@niov/database";
import type {
  EscalationRequest,
  EscalationType,
  Prisma,
} from "@niov/database";
import { logger } from "../../logger.js";

// WHAT: The named-fields shape createEscalationForCaller accepts.
// INPUT: Used as a parameter type only.
// OUTPUT: None -- this is a type, not a value.
// WHY: source_entity_id is NOT in this shape -- it is derived from
//      callerEntityId (the caller is always the source of an
//      escalation they create). resolver_entity_id is optional: when
//      set, it designates who must resolve; when null, the target
//      self-resolves.
export interface CreateEscalationInput {
  target_entity_id: string;
  capsule_id?: string | null;
  escalation_type: EscalationType;
  severity: string;
  description: string;
  resolver_entity_id?: string | null;
  expires_at?: Date | null;
}

// WHAT: Create a new PENDING escalation; the caller is the source.
// INPUT: callerEntityId (becomes source_entity_id) + a
//        CreateEscalationInput.
// OUTPUT: The created EscalationRequest row (status = PENDING).
// WHY: Closes D-2D-D10 -- the storage-side write the priming-context
//      consumer-side EscalationItem shape has been waiting on. Audit
//      is written inside the same transaction (ADR-0002 + RULE 4).
export async function createEscalationForCaller(
  callerEntityId: string,
  input: CreateEscalationInput,
): Promise<EscalationRequest> {
  return prisma.$transaction(async (tx) => {
    const created = await tx.escalationRequest.create({
      data: {
        source_entity_id: callerEntityId,
        target_entity_id: input.target_entity_id,
        capsule_id: input.capsule_id ?? null,
        escalation_type: input.escalation_type,
        severity: input.severity,
        description: input.description,
        resolved_by_entity_id: input.resolver_entity_id ?? null,
        expires_at: input.expires_at ?? null,
      },
    });
    await writeAuditEvent(
      {
        event_type: "ADMIN_ACTION",
        outcome: "SUCCESS",
        actor_entity_id: callerEntityId,
        target_entity_id: input.target_entity_id,
        details: {
          action: "ESCALATION_CREATED",
          escalation_id: created.escalation_id,
          escalation_type: input.escalation_type,
          severity: input.severity,
          capsule_id: input.capsule_id ?? null,
          resolver_entity_id: input.resolver_entity_id ?? null,
        },
      },
      tx,
    );
    return created;
  });
}

// WHAT: Gate-fail escalation get-or-create helper. A restricted-class
//        entity (AI_AGENT / DEVICE) hit a requires_validation capsule at
//        NEGOTIATE; this fires from negotiate.service.ts's gate-fail
//        block AFTER the NEGOTIATE/DENIED audit event but BEFORE the
//        accessDenied() return (D-2D-D10-5).
// INPUT: callerEntityId (the restricted-class requester -> source);
//        capsuleId (the gated capsule); ownerEntityId (capsule owner ->
//        target_entity_id, the human who clears the gate).
// OUTPUT: EscalationRequest -- the existing PENDING row for the
//          (source, capsule) pair, or a freshly-created one.
// WHY: Restricted-class entities retry on denial; without dedup a retry
//      loop floods the human-review queue. Get-or-create returns the
//      existing PENDING row silently (no duplicate ESCALATION_CREATED
//      audit event -- duplicates do not deserve duplicate audit events)
//      and creates fresh only when no PENDING row exists for the pair.
//      The ESCALATION_CREATED audit event fires only on the new path
//      (via createEscalationForCaller's in-tx writeAuditEvent).
//      COMPLIANCE_GATE defaults: severity HIGH (the owner's deliberate
//      requires_validation flag IS the high-severity signal -- MEDIUM
//      would understate it), resolver_entity_id null at create-time
//      (populated when approveEscalationForCaller / rejectEscalationForCaller
//      fires per D-2D-D10-2), expires_at null (no auto-expiry; the gate
//      is human-cleared). Substantiates the Zone U4 gate-resolution
//      audit lineage per RAA 12.8 §5.2.
export async function createGateEscalationForCaller(
  callerEntityId: string,
  capsuleId: string,
  ownerEntityId: string,
): Promise<EscalationRequest> {
  const existing = await prisma.escalationRequest.findFirst({
    where: {
      source_entity_id: callerEntityId,
      capsule_id: capsuleId,
      status: "PENDING",
    },
  });
  if (existing !== null) return existing;
  return createEscalationForCaller(callerEntityId, {
    target_entity_id: ownerEntityId,
    capsule_id: capsuleId,
    escalation_type: "COMPLIANCE_GATE",
    severity: "HIGH",
    description:
      "Validation gate triggered: a restricted-class entity was denied " +
      "NEGOTIATE access to this capsule; human review required to clear the gate.",
  });
}

// WHAT: Read one escalation if the caller is a party to it.
// INPUT: callerEntityId + escalation_id.
// OUTPUT: The EscalationRequest row, or null if it does not exist.
// WHY: Read-side ownership gate -- the caller must be the source,
//      the target, or the designated resolver. Anyone else gets
//      ESCALATION_FORBIDDEN (not a silent null) so the caller knows
//      the row exists but is not theirs.
export async function getEscalationForCaller(
  callerEntityId: string,
  escalationId: string,
): Promise<EscalationRequest | null> {
  const row = await prisma.escalationRequest.findUnique({
    where: { escalation_id: escalationId },
  });
  if (row === null) {
    return null;
  }
  const isParty =
    callerEntityId === row.source_entity_id ||
    callerEntityId === row.target_entity_id ||
    callerEntityId === row.resolved_by_entity_id;
  if (!isParty) {
    throw new Error("ESCALATION_FORBIDDEN");
  }
  return row;
}

// WHAT: List the caller's own pending escalations (caller == target).
// INPUT: callerEntityId + targetEntityId (must match) + a take limit.
// OUTPUT: PENDING EscalationRequest rows, newest first, up to limit.
// WHY: Used by the priming slot (priming.ts) to surface "what is
//      waiting for your decision". The caller can only ask about
//      escalations targeted at THEM -- callerEntityId !== targetEntityId
//      is ESCALATION_FORBIDDEN. Returns full rows; the consumer
//      projects to its own shape (e.g. priming.ts maps to
//      { description, severity }).
export async function listEscalationsPendingForCaller(
  callerEntityId: string,
  targetEntityId: string,
  limit: number,
): Promise<EscalationRequest[]> {
  if (callerEntityId !== targetEntityId) {
    throw new Error("ESCALATION_FORBIDDEN");
  }
  return prisma.escalationRequest.findMany({
    where: { target_entity_id: targetEntityId, status: "PENDING" },
    orderBy: { created_at: "desc" },
    take: limit,
  });
}

// WHAT: Count pending escalations targeted at an entity. NO AUTH GATE.
// INPUT: targetEntityId.
// OUTPUT: The number of PENDING escalations where target_entity_id
//          matches.
// WHY: Route-tier auth gate is canonical here, NOT service-owned.
//      The sole consumer -- org.routes.ts:1148 GET /org/analytics --
//      is already gated by `requireAdminCapability(authService,
//      "can_admin_org")` + `resolveOrgOrFail(callerId)` before it
//      calls this with the resolved orgEntityId. Substrate-honest
//      framing: service-owned auth gate (ADR-0004) applies when the
//      service owns the gate; when the route owns the gate via
//      middleware, a plain helper is canonical. Any future caller of
//      this function MUST verify authorization to query for
//      targetEntityId before invoking -- see org.routes.ts:1148 for
//      the reference pattern.
export async function countEscalationsPending(
  targetEntityId: string,
): Promise<number> {
  return prisma.escalationRequest.count({
    where: { target_entity_id: targetEntityId, status: "PENDING" },
  });
}

// WHAT: Internal -- run a PENDING → terminal transition inside a tx
//        with the audit threaded through. Pulled out so approve and
//        reject share the gate + state-machine + audit discipline.
// INPUT: callerEntityId, escalation_id, the terminal status, the
//        details.action discriminator, optional resolution_metadata.
// OUTPUT: The updated EscalationRequest row.
// WHY: Skeleton authorization (FORWARD QUEUE per §5.8): the caller
//      must be the target OR the designated resolver; source_entity_id
//      alone cannot self-resolve (if the caller is ONLY the source,
//      neither condition matches → ESCALATION_FORBIDDEN). State
//      machine: only PENDING may transition; anything else is
//      ESCALATION_INVALID_TRANSITION. Audit (ADR-0002 + RULE 4) is
//      written inside the same transaction.
async function transitionPendingForCaller(
  callerEntityId: string,
  escalationId: string,
  toStatus: "APPROVED" | "REJECTED",
  auditAction: "ESCALATION_APPROVED" | "ESCALATION_REJECTED",
  resolutionMetadata?: Prisma.InputJsonValue,
): Promise<EscalationRequest> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.escalationRequest.findUnique({
      where: { escalation_id: escalationId },
    });
    if (existing === null) {
      throw new Error("ESCALATION_NOT_FOUND");
    }
    // FORWARD QUEUE per §5.8 per-DMW-type sovereignty: skeleton gate.
    const mayTransition =
      callerEntityId === existing.target_entity_id ||
      callerEntityId === existing.resolved_by_entity_id;
    if (!mayTransition) {
      throw new Error("ESCALATION_FORBIDDEN");
    }
    if (existing.status !== "PENDING") {
      throw new Error("ESCALATION_INVALID_TRANSITION");
    }
    await writeAuditEvent(
      {
        event_type: "ADMIN_ACTION",
        outcome: "SUCCESS",
        actor_entity_id: callerEntityId,
        target_entity_id: existing.target_entity_id,
        details: {
          action: auditAction,
          escalation_id: escalationId,
          previous_status: existing.status,
          new_status: toStatus,
        },
      },
      tx,
    );
    return tx.escalationRequest.update({
      where: { escalation_id: escalationId },
      data: {
        status: toStatus,
        resolved_at: new Date(),
        resolved_by_entity_id: callerEntityId,
        ...(resolutionMetadata !== undefined
          ? { resolution_metadata: resolutionMetadata }
          : {}),
      },
    });
  });
}

// WHAT: Transition a PENDING escalation to APPROVED.
// INPUT: callerEntityId, escalation_id, optional resolution_metadata.
// OUTPUT: The updated EscalationRequest row (status = APPROVED).
// WHY: See transitionPendingForCaller for the gate + state machine +
//      audit discipline. resolved_by_entity_id is set to callerEntityId.
export async function approveEscalationForCaller(
  callerEntityId: string,
  escalationId: string,
  resolutionMetadata?: Prisma.InputJsonValue,
): Promise<EscalationRequest> {
  return transitionPendingForCaller(
    callerEntityId,
    escalationId,
    "APPROVED",
    "ESCALATION_APPROVED",
    resolutionMetadata,
  );
}

// WHAT: Transition a PENDING escalation to REJECTED.
// INPUT: callerEntityId, escalation_id, optional resolution_metadata.
// OUTPUT: The updated EscalationRequest row (status = REJECTED).
// WHY: See transitionPendingForCaller for the gate + state machine +
//      audit discipline. resolved_by_entity_id is set to callerEntityId.
export async function rejectEscalationForCaller(
  callerEntityId: string,
  escalationId: string,
  resolutionMetadata?: Prisma.InputJsonValue,
): Promise<EscalationRequest> {
  return transitionPendingForCaller(
    callerEntityId,
    escalationId,
    "REJECTED",
    "ESCALATION_REJECTED",
    resolutionMetadata,
  );
}

// WHAT: System transition -- a PENDING escalation that has passed its
//        expires_at goes to EXPIRED. No callerEntityId: this is for
//        the scheduler/cron, not a human caller.
// INPUT: escalation_id.
// OUTPUT: The updated EscalationRequest row (status = EXPIRED).
// WHY: Timeout policy (RAA 12.8 §5.2 -- "timeout policies via
//      expires_at field"). State machine: only PENDING may expire;
//      anything else is ESCALATION_INVALID_TRANSITION. Audit is
//      written with actor_entity_id: null + system_principal:
//      SYSTEM_PRINCIPALS.SCHEDULER (system-initiated emission per the
//      audit-chain dedicated-chain convention) inside the same tx.
export async function expireEscalation(
  escalationId: string,
): Promise<EscalationRequest> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.escalationRequest.findUnique({
      where: { escalation_id: escalationId },
    });
    if (existing === null) {
      throw new Error("ESCALATION_NOT_FOUND");
    }
    if (existing.status !== "PENDING") {
      throw new Error("ESCALATION_INVALID_TRANSITION");
    }
    await writeAuditEvent(
      {
        event_type: "ADMIN_ACTION",
        outcome: "SUCCESS",
        actor_entity_id: null,
        system_principal: SYSTEM_PRINCIPALS.SCHEDULER,
        target_entity_id: existing.target_entity_id,
        details: {
          action: "ESCALATION_EXPIRED",
          escalation_id: escalationId,
          previous_status: existing.status,
          new_status: "EXPIRED",
        },
      },
      tx,
    );
    const updated = await tx.escalationRequest.update({
      where: { escalation_id: escalationId },
      data: { status: "EXPIRED", resolved_at: new Date() },
    });
    logger.info(
      { escalation_id: escalationId, target_entity_id: existing.target_entity_id },
      "escalation expired by scheduler",
    );
    return updated;
  });
}
