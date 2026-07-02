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
//              requires_validation gate-fail block per D-2D-D10-5),
//              apps/api/src/security/privileged-endpoints.ts
//              (EscalationActionDescriptor type + dualControlDescription
//              helper -- consumed by findApprovedDualControlForCaller),
//              apps/api/src/middleware/dual-control.middleware.ts
//              (consumes findApprovedDualControlForCaller +
//              createEscalationForCaller for the dual-control gate;
//              sub-phase E [SEC-DUAL-CONTROL-MIDDLEWARE]).
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
import type {
  EscalationActionDescriptor,
  PrivilegedEndpoint,
} from "../../security/privileged-endpoints.js";
import { dualControlDescription } from "../../security/privileged-endpoints.js";
import { getOrgEntityId } from "./org.js";
import { logger } from "../../logger.js";
// Work-OS Slice F — approving an Action-paired dual-control escalation must
// approve the paired Action using the EXISTING Action state-machine guard
// (no second approval system, no direct execution here). One-directional
// imports: state-machine.ts imports nothing from this module (no cycle); the
// ACTION_APPROVED decision audit is written via writeAuditEvent (already
// imported), mirroring action.service's create-time emission, to avoid the
// action.service ↔ escalation.service import cycle.
import { assertActionTransition } from "../action/state-machine.js";

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
//        CreateEscalationInput + optional outer transaction client.
// OUTPUT: The created EscalationRequest row (status = PENDING).
// WHY: Closes D-2D-D10 -- the storage-side write the priming-context
//      consumer-side EscalationItem shape has been waiting on. Audit
//      is written inside the same transaction (ADR-0002 + RULE 4).
//      The optional `tx` parameter (added per ADR-0057 §5 Option E
//      Q4 LOCK) lets a caller compose this function inside an outer
//      transaction (e.g., the Action create-time service at
//      apps/api/src/services/action/action.service.ts that pairs an
//      Action row + EscalationRequest + ACTION_PROPOSED audit in one
//      atomic write). Backward-compatible: existing single-arg call
//      sites continue to start their own $transaction internally.
export async function createEscalationForCaller(
  callerEntityId: string,
  input: CreateEscalationInput,
  tx?: Prisma.TransactionClient,
): Promise<EscalationRequest> {
  if (tx !== undefined) {
    return doCreateEscalationInTx(callerEntityId, input, tx);
  }
  return prisma.$transaction(async (innerTx) => {
    return doCreateEscalationInTx(callerEntityId, input, innerTx);
  });
}

// WHAT: The inner shared body that the tx-aware + tx-owning callers
//        both invoke. Pure body extraction; identical writes either
//        way.
// INPUT: callerEntityId + input + a Prisma.TransactionClient.
// OUTPUT: The created EscalationRequest row.
// WHY: Avoid duplicating the EscalationRequest.create + writeAuditEvent
//      body across the two callers above.
async function doCreateEscalationInTx(
  callerEntityId: string,
  input: CreateEscalationInput,
  tx: Prisma.TransactionClient,
): Promise<EscalationRequest> {
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

// WHAT: Look up an APPROVED dual-control EscalationRequest for the caller
//        matching a specific privileged-endpoint action descriptor.
// INPUT: callerEntityId (the request initiator -- the source of the
//        dual-control escalation) + actionDescriptor (the
//        EscalationActionDescriptor for the privileged endpoint the
//        requireDualControl preHandler matched).
// OUTPUT: The single APPROVED EscalationRequest row matching all of:
//          source_entity_id === callerEntityId,
//          escalation_type === "DUAL_CONTROL_REQUIRED",
//          status === "APPROVED",
//          description === dualControlDescription(actionDescriptor.type)
//          -- newest-resolved first if more than one matches; null when
//          no match.
// WHY: The requireDualControl Fastify preHandler
//      (apps/api/src/middleware/dual-control.middleware.ts, sub-phase E
//      [SEC-DUAL-CONTROL-MIDDLEWARE]) calls this to verify an APPROVED
//      second-approver gate exists before delegating to a privileged-
//      endpoint handler. The DB lookup lives here, in the service tier
//      (RULE 9: services connect through APIs; no cross-service DB reads)
//      -- the middleware never touches Prisma directly. Read-side check
//      only: this confirms an APPROVED row EXISTS; the approver-semantics
//      gate (source ≠ resolver / the §5.8 skeleton in
//      transitionPendingForCaller) is enforced upstream when the second
//      approver calls POST /api/v1/escalations/:id/approve. The
//      description-as-carrier convention is per
//      docs/architecture/dual-control-operations-canonical-record.md §3
//      step 3 ("action descriptor match via description or a future
//      action field") -- the EscalationRequest model has no details JSON
//      column; dualControlDescription is the exact-match key.
export async function findApprovedDualControlForCaller(
  callerEntityId: string,
  actionDescriptor: EscalationActionDescriptor,
): Promise<EscalationRequest | null> {
  return prisma.escalationRequest.findFirst({
    where: {
      source_entity_id: callerEntityId,
      escalation_type: "DUAL_CONTROL_REQUIRED",
      status: "APPROVED",
      description: dualControlDescription(actionDescriptor.type),
    },
    orderBy: { resolved_at: "desc" },
  });
}

// WHAT: Discriminated-union result of resolveDualControlTarget below. ok=true
//        carries a non-caller approver and the resolution class that produced
//        it; ok=false carries the structured fail-closed reason the middleware
//        translates into the Zone U1 NO_APPROVER marker + 503 response.
// INPUT: Used as a value/parameter type.
// OUTPUT: None -- this is a type, not a value.
// WHY: ADR-0026 Amendment 1 §5 + §10 contract. The class identifier
//      (explicit-metadata / org-admin-pool / platform-admin-pool) is the
//      Zone U1 target_resolution_reason field per §6; the fail-closed reason
//      maps NO_ELIGIBLE_TARGET -> "no-eligible-target" marker, and
//      INVALID_CANDIDATE -> structural violation surfaced for audit only
//      (not user-facing). Both fail-closed branches drive the same 503-class
//      middleware response (§Invariant 4): no fallback may silently target
//      the caller, never delegates.
export type DualControlTargetResolution =
  | {
      ok: true;
      target_entity_id: string;
      resolution_reason:
        | "explicit-metadata"
        | "org-admin-pool"
        | "platform-admin-pool";
    }
  | {
      ok: false;
      reason: "NO_ELIGIBLE_TARGET" | "INVALID_CANDIDATE";
    };

// WHAT: Resolve a Phase E target entity for an auto-created dual-control
//        EscalationRequest. Class A (explicit metadata) -> Class B (org-admin
//        excluding caller, scoped to caller's org) -> Class C (NIOV
//        platform-admin excluding caller) -> Class D fail-closed.
// INPUT: callerEntityId (the request initiator -- the source of the dual-
//        control escalation; never returned as a target) + endpoint (the
//        full PrivilegedEndpoint -- actionDescriptor.metadata drives Class A,
//        authTier drives Class B vs Class C).
// OUTPUT: A DualControlTargetResolution: ok=true with the resolved
//          target_entity_id and the resolution_reason class, or ok=false
//          (NO_ELIGIBLE_TARGET / INVALID_CANDIDATE) when the policy cannot
//          pick a structurally independent approver.
// WHY: Replaces the sub-phase E placeholder (`target_entity_id: callerEntityId`)
//      with a deterministic, auditable, fail-closed selection per ADR-0026
//      Amendment 1 §2 + §3. Invariant 2 (target_entity_id !== source_entity_id)
//      holds at create-time by construction here, not as a downstream
//      defensive check. Invariant 6 (no cross-org leak): Class B is filtered
//      structurally at the Prisma query tier by membership in the caller's
//      parent org; Class C is the global NIOV platform-admin set and is not
//      org-scoped by design (platform-tier operations cross orgs). Selection
//      within each class is deterministic (lowest entity_id lexicographically)
//      so Zone U1 replays reproduce the same target (Invariant 5). Eligible
//      candidates exclude: caller, soft-deleted (deleted_at not null),
//      non-ACTIVE entity status, non-ACTIVE TAR status. Class A explicit
//      target additionally requires the candidate to satisfy the same active
//      gates; a present-but-invalid candidate surfaces INVALID_CANDIDATE
//      (forward-substrate hook -- no current LIVE PRIVILEGED_ENDPOINTS entry
//      carries explicit metadata). Class B candidate query joins through
//      EntityMembership (child_id = candidate, parent_id = caller's parent
//      org) -- the same cross-org-leak structural defence as the DRIFT 9
//      admin-routes filter narrowing pattern.
export async function resolveDualControlTarget(
  callerEntityId: string,
  endpoint: PrivilegedEndpoint,
): Promise<DualControlTargetResolution> {
  // Class A -- explicit operation-specific target. No LIVE entry uses this
  // today; the typing hook keeps the resolver substrate ready for the
  // operation-specific designated-approver semantics referenced in
  // ADR-0026 Amendment 1 §3 + §10.
  const explicitTarget = endpoint.actionDescriptor.metadata?.target_entity_id;
  if (typeof explicitTarget === "string" && explicitTarget.length > 0) {
    if (explicitTarget === callerEntityId) {
      return { ok: false, reason: "INVALID_CANDIDATE" };
    }
    const candidate = await prisma.entity.findFirst({
      where: {
        entity_id: explicitTarget,
        status: "ACTIVE",
        deleted_at: null,
        tar: { status: "ACTIVE" },
      },
      select: { entity_id: true },
    });
    if (candidate === null) {
      return { ok: false, reason: "INVALID_CANDIDATE" };
    }
    return {
      ok: true,
      target_entity_id: candidate.entity_id,
      resolution_reason: "explicit-metadata",
    };
  }

  // Class B -- org-level eligible approver excluding caller. Only fires for
  // can_admin_org-tier endpoints. Cross-org structural defence: the
  // candidate query joins through EntityMembership (the candidate must be
  // an active child of the same parent org as the caller).
  if (endpoint.authTier === "can_admin_org") {
    // [PROD-UX-BUGD regression fix] Resolve the caller's ORG (the COMPANY
    // entity) canonically. The previous resolution took the caller's
    // membership with the HIGHEST hierarchy_level as "the org" — but once
    // org-hierarchy manager edges exist (person→person memberships whose
    // hierarchy_level exceeds the org edge's), that resolved "the org" to the
    // caller's MANAGER. No admin is a child of a person, so EVERY dual-control
    // action for anyone with a manager failed NO_ELIGIBLE_TARGET — rejecting
    // sends that should have queued for approval.
    let callerOrgId: string;
    try {
      callerOrgId = await getOrgEntityId(callerEntityId);
    } catch {
      return { ok: false, reason: "NO_ELIGIBLE_TARGET" };
    }
    const orgCandidate = await prisma.entity.findFirst({
      where: {
        status: "ACTIVE",
        deleted_at: null,
        entity_id: { not: callerEntityId },
        tar: { status: "ACTIVE", can_admin_org: true },
        child_memberships: {
          some: { parent_id: callerOrgId, is_active: true },
        },
      },
      select: { entity_id: true },
      orderBy: { entity_id: "asc" },
    });
    if (orgCandidate === null) {
      return { ok: false, reason: "NO_ELIGIBLE_TARGET" };
    }
    return {
      ok: true,
      target_entity_id: orgCandidate.entity_id,
      resolution_reason: "org-admin-pool",
    };
  }

  // Class C -- NIOV platform-admin approver excluding the caller. Production
  // default for all 4 current LIVE PRIVILEGED_ENDPOINTS (all can_admin_niov).
  if (endpoint.authTier === "can_admin_niov") {
    const platformCandidate = await prisma.entity.findFirst({
      where: {
        status: "ACTIVE",
        deleted_at: null,
        entity_id: { not: callerEntityId },
        tar: { status: "ACTIVE", can_admin_niov: true },
      },
      select: { entity_id: true },
      orderBy: { entity_id: "asc" },
    });
    if (platformCandidate !== null) {
      return {
        ok: true,
        target_entity_id: platformCandidate.entity_id,
        resolution_reason: "platform-admin-pool",
      };
    }
  }

  // Class D -- fail closed.
  return { ok: false, reason: "NO_ELIGIBLE_TARGET" };
}

// WHAT: Get-or-create a PENDING dual-control EscalationRequest for the
//        caller matching a specific privileged-endpoint action descriptor,
//        using a resolved Phase E target.
// INPUT: callerEntityId (the request initiator -- the source of the
//        dual-control escalation) + actionDescriptor (the
//        EscalationActionDescriptor for the privileged endpoint the
//        requireDualControl preHandler matched) + targetEntityId (the
//        independent approver resolved by resolveDualControlTarget;
//        MUST be distinct from callerEntityId -- callers must invoke the
//        resolver first and bail to the fail-closed 503 path on
//        { ok: false }).
// OUTPUT: The PENDING EscalationRequest row. If a matching PENDING row
//          already exists for this (callerEntityId, actionDescriptor) pair
//          (matched via description === dualControlDescription(actionType)),
//          returns the existing row WITHOUT writing a new ESCALATION_CREATED
//          audit event. If no matching PENDING exists, delegates to
//          createEscalationForCaller with target_entity_id = targetEntityId
//          (Phase E real target, replacing the sub-phase E placeholder).
// WHY: Prevents queue flooding when a restricted caller retries a
//      privileged endpoint repeatedly -- each retry would otherwise create
//      a duplicate PENDING dual-control escalation, polluting approver
//      queues and the audit chain. Mirrors the createGateEscalationForCaller
//      dedup pattern above (the requires_validation gate-fail path) which
//      prevents the same flooding. Consumed by the requireDualControl
//      Fastify preHandler (apps/api/src/middleware/dual-control.middleware.ts)
//      on the denied path AFTER resolveDualControlTarget has selected an
//      independent approver. Self-target invariant: a distinct second human
//      is the structural create-time guarantee; GAP-C1 (the source-self-
//      approval guard at transitionPendingForCaller) remains as defence in
//      depth at the transition tier.
export async function getOrCreatePendingDualControlForCaller(
  callerEntityId: string,
  actionDescriptor: EscalationActionDescriptor,
  targetEntityId: string,
): Promise<EscalationRequest> {
  if (targetEntityId === callerEntityId) {
    // Structural Phase E Invariant 2 guard: callers MUST resolve a distinct
    // target via resolveDualControlTarget before invoking this helper. A
    // same-identity target here is a bug at the call site -- fail fast.
    throw new Error("ESCALATION_TARGET_INVALID");
  }
  const existing = await prisma.escalationRequest.findFirst({
    where: {
      source_entity_id: callerEntityId,
      escalation_type: "DUAL_CONTROL_REQUIRED",
      status: "PENDING",
      description: dualControlDescription(actionDescriptor.type),
    },
    orderBy: { created_at: "desc" },
  });
  if (existing !== null) {
    return existing;
  }
  return createEscalationForCaller(callerEntityId, {
    target_entity_id: targetEntityId,
    escalation_type: "DUAL_CONTROL_REQUIRED",
    severity: "HIGH",
    description: dualControlDescription(actionDescriptor.type),
  });
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
    // GOVSEC.5 GAP-C1 self-approval resolution: the initiator (source) may NEVER
    // approve or resolve their own escalation -- the two-person invariant. This is
    // enforced FIRST, before the target/resolver gate, so it holds even for a
    // self-target dual-control escalation (target_entity_id == source_entity_id, the
    // sub-phase E placeholder from getOrCreatePendingDualControlForCaller): without
    // this guard, caller === target would let the source self-resolve a hollow
    // dual-control. The resolver is recorded in resolved_by_entity_id (set to
    // callerEntityId below), so caller === source is, by construction, self-approval.
    // A distinct second human (target / designated resolver) is still required.
    if (callerEntityId === existing.source_entity_id) {
      throw new Error("ESCALATION_FORBIDDEN");
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
    const updatedEscalation = await tx.escalationRequest.update({
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

    // Work-OS Slice F — Action-approval linkage. When this escalation is the
    // paired dual-control escalation of an Action (Action.escalation_id ===
    // this escalation, backfilled by createActionForCaller step 6c) and we
    // just APPROVED it, approve that Action through the EXISTING Action state
    // machine so the scheduler admits it (APPROVED → SCHEDULED) and the
    // executor runs the governed connector write. Guarantees:
    //   - two-person invariant: caller !== source is enforced above, so the
    //     resolver of the Action's approval is never its requester;
    //   - resolver authority: the target/resolver gate is enforced above;
    //   - linkage: the Action.escalation_id FK is the exact, non-fragile link
    //     (a route-tier dual-control escalation has NO paired Action → no-op,
    //     behavior unchanged);
    //   - Action still PROPOSED: only a PROPOSED action is transitioned
    //     (idempotent; a re-approval or a non-PROPOSED action is a no-op);
    //   - transition validity + ACTION_APPROVED audit come from the existing
    //     transitionActionStatus (assert PROPOSED → APPROVED + safe audit).
    // Rejection (toStatus REJECTED) leaves the Action untouched — unchanged
    // behavior. NO Slack/connector call happens here; execution stays with
    // the scheduler/executor after admission.
    if (toStatus === "APPROVED") {
      const pairedAction = await tx.action.findFirst({
        where: { escalation_id: escalationId, status: "PROPOSED", deleted_at: null },
        select: { action_id: true, status: true },
      });
      if (pairedAction !== null) {
        // Guard the transition against the canonical Action state machine
        // (PROPOSED → APPROVED is legal; anything else throws).
        assertActionTransition(pairedAction.status, "APPROVED");
        await tx.action.update({
          where: { action_id: pairedAction.action_id },
          data: { status: "APPROVED" },
        });
        // ACTION_APPROVED decision audit — SAFE details only (ids + linkage +
        // policy basis). The paired ESCALATION_APPROVED audit (above) carries
        // escalation_id + resolver; together the two rows reconstruct the full
        // approval chain (source, resolver, action, escalation, basis).
        await writeAuditEvent(
          {
            event_type: "ACTION_APPROVED",
            outcome: "SUCCESS",
            actor_entity_id: callerEntityId,
            target_entity_id: existing.source_entity_id,
            details: {
              action_id: pairedAction.action_id,
              escalation_id: escalationId,
              resolved_by_entity_id: callerEntityId,
              source_entity_id: existing.source_entity_id,
              decision: "REQUIRE_DUAL_CONTROL",
              decision_reason: "dual-control-escalation-approved",
            },
          },
          tx,
        );
      }
    }

    return updatedEscalation;
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
