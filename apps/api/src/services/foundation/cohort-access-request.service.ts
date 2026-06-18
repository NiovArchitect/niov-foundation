// FILE: cohort-access-request.service.ts
// PURPOSE: Phase 1307-A — the governed ACCESS REQUEST LIFECYCLE for Federation
//          Cloud cohort data products. This is the lifecycle BEFORE any signal /
//          proof is delivered (delivery is 1308-A): a BUYER asks for a (use,
//          access_mode) against a cohort it can see; a HUMAN provider/admin
//          DECIDES (APPROVED / DENIED); the provider may later REVOKE; windows
//          EXPIRE (lazy). An APPROVED request is permission-to-proceed only — it
//          delivers NO data, NO real signal, NO payout in 1307-A.
//
//          GOVERNANCE (RULE 0, non-negotiable):
//          - CHILDREN cohort data is auto-DENIED at intake (never requestable).
//          - HIGH_SENSITIVITY routes to requires_review (a human still decides).
//          - Requesting is NOT granting: an AI buyer (AI_AGENT / DEVICE /
//            APPLICATION) MAY create a request, but ONLY a HUMAN-class entity may
//            DECIDE or REVOKE — a restricted AI class is refused NOT_AUTHORIZED.
//          - A buyer can NEVER approve / decide its own request (self-approval
//            forbidden) — mirrors the GAP-C1 self-approval guard.
//          - Decide / revoke are provider-owner or same-org admin only.
//
// CONNECTS TO: packages/database CohortAccessRequest + CohortDataProduct +
//              Entity (entity_type for the human-decider gate) + prisma +
//              writeAuditEvent (COHORT_ACCESS_REQUESTED / _DECIDED / _REVOKED;
//              _EXPIRED reserved); apps/api/src/services/auth.service.ts
//              (validateSession); apps/api/src/services/governance/org.ts
//              (getOrgEntityId); apps/api/src/routes/cohort.routes.ts.
//
// SAFETY: bearer-gated + tenant-scoped + enumeration-safe
// (COHORT_PRODUCT_NOT_FOUND / ACCESS_REQUEST_NOT_FOUND). provider_org /
// buyer_org / decided_by are INTERNAL and never projected. Audit details carry
// IDs / closed-vocab enums / booleans only — never raw data.

import {
  prisma,
  writeAuditEvent,
  type CohortAccessRequest,
  type CohortAccessRequestStatus,
  type CohortDataProduct,
  type EntityType,
} from "@niov/database";
import type { AuthService } from "../auth.service.js";
import { getOrgEntityId } from "../governance/org.js";

// ── Human-decider gate (RULE 0 + stop condition #7) ─────────────────────────

// WHAT: AI_AGENT, DEVICE, or APPLICATION — the "restricted (non-human) class".
// WHY: A declarative mirror of negotiate.service.ts:isRestrictedAiClass /
//      authority.service.ts:isRestrictedAiClass (both private there). Duplicated
//      deliberately (RULE 13): the COSMP runtime stays the source of truth; this
//      is its local mirror so the access-request decide/revoke path can refuse a
//      non-human approver WITHOUT a cross-service import. Only a human (PERSON /
//      COMPANY / GOVERNMENT / REGULATOR) may grant/withdraw cohort access.
function isRestrictedAiClass(t: EntityType): boolean {
  return t === "AI_AGENT" || t === "DEVICE" || t === "APPLICATION";
}

// ── SAFE projection ─────────────────────────────────────────────────────────

export interface SafeAccessRequestView {
  request_id: string;
  cohort_product_id: string;
  // The requesting buyer — legitimately visible to the buyer (own) and to the
  // provider/admin who must decide. Never a wallet/capsule id.
  buyer_entity_id: string;
  intended_use: string;
  requested_access_mode: string;
  status: CohortAccessRequestStatus;
  requires_review: boolean;
  proof_required: boolean;
  retention_policy: string | null;
  decision_reason: string | null;
  requested_at: string;
  decided_at: string | null;
  expires_at: string | null;
  created_at: string;
  // 1307-A honesty marker — an approval is permission-to-proceed only; no real
  // cohort signal is delivered by this lifecycle.
  signal_available: false;
}

// ── Pure intake disposition (no I/O — unit-testable) ────────────────────────

export type AccessRequestIntake =
  | { admissible: false; code: string }
  | { admissible: true; status: "PENDING" | "DENIED"; requires_review: boolean; reason: string };

// WHAT: Decide, honestly, the intake disposition for a buyer's access request
//       against a cohort product. Pure — no I/O, no clock branching.
// INPUT: the cohort row + the requested (use, access_mode).
// OUTPUT: either an admissibility rejection code (malformed / not-offered →
//         422 at the route, no row created) OR an admissible disposition:
//         DENIED (CHILDREN auto-block) or PENDING (a human must decide;
//         requires_review=true for HIGH_SENSITIVITY).
// WHY: mirrors evaluateCohortPolicy intake semantics but produces a REQUEST
//      disposition. Requests are NEVER auto-approved — a human provider/admin
//      decides every PENDING request. Only CHILDREN is auto-DENIED at intake.
export function evaluateAccessRequestIntake(
  product: Pick<
    CohortDataProduct,
    | "status"
    | "access_modes"
    | "allowed_uses"
    | "sensitivity_class"
    | "sensitive_categories"
    | "training_allowed"
    | "model_improvement_allowed"
  >,
  request: { intended_use: string; requested_access_mode: string },
): AccessRequestIntake {
  // Only an ACTIVE cohort accepts access requests.
  if (product.status !== "ACTIVE") return { admissible: false, code: "COHORT_NOT_ACTIVE" };

  // The requested mode/use must be ones the provider actually offers.
  if (!product.access_modes.includes(request.requested_access_mode))
    return { admissible: false, code: "ACCESS_MODE_NOT_OFFERED" };
  if (!product.allowed_uses.includes(request.intended_use))
    return { admissible: false, code: "USE_NOT_PERMITTED" };

  // Training / model-improvement need the explicit per-product flag.
  if (request.intended_use === "TRAINING" && !product.training_allowed)
    return { admissible: false, code: "TRAINING_NOT_PERMITTED" };
  if (request.intended_use === "MODEL_IMPROVEMENT" && !product.model_improvement_allowed)
    return { admissible: false, code: "MODEL_IMPROVEMENT_NOT_PERMITTED" };

  // Hard block: children's data is never offered for cohort access — recorded as
  // an auto-DENIED request (RULE 0; never requestable).
  if (product.sensitive_categories.includes("CHILDREN"))
    return { admissible: true, status: "DENIED", requires_review: false, reason: "CHILDREN_DATA_BLOCKED" };

  // High-sensitivity is requestable but a human MUST review before approving.
  if (product.sensitivity_class === "HIGH_SENSITIVITY")
    return { admissible: true, status: "PENDING", requires_review: true, reason: "HIGH_SENSITIVITY_REVIEW_REQUIRED" };

  // Admissible — awaits a human decision.
  return { admissible: true, status: "PENDING", requires_review: false, reason: "AWAITING_HUMAN_DECISION" };
}

// ── Result types ────────────────────────────────────────────────────────────

export type CreateAccessRequestResult =
  | { ok: true; access_request: SafeAccessRequestView }
  | { ok: false; code: string };
export type ListAccessRequestsResult =
  | { ok: true; access_requests: SafeAccessRequestView[]; is_manager: boolean }
  | { ok: false; code: string };
export type DecideAccessRequestResult =
  | { ok: true; access_request: SafeAccessRequestView }
  | { ok: false; code: string };
export type RevokeAccessRequestResult =
  | { ok: true; access_request: SafeAccessRequestView }
  | { ok: false; code: string };

export class CohortAccessRequestService {
  constructor(private readonly authService: AuthService) {}

  private async callerOrgOrNull(entityId: string): Promise<string | null> {
    try {
      const org = await getOrgEntityId(entityId);
      return org === entityId ? null : org;
    } catch {
      return null;
    }
  }

  // Provider-owner OR same-org admin_org may manage a cohort's access requests.
  private async isProviderOrAdmin(
    cohort: CohortDataProduct,
    entityId: string,
    allowedOps: string[],
  ): Promise<boolean> {
    if (cohort.provider_entity_id === entityId) return true;
    if (cohort.provider_org_entity_id !== null && allowedOps.includes("admin_org")) {
      const org = await this.callerOrgOrNull(entityId);
      if (org !== null && org === cohort.provider_org_entity_id) return true;
    }
    return false;
  }

  // The cohort IFF the caller may MANAGE its access requests (provider/admin);
  // else null (enumeration-safe).
  private async loadManageableCohort(
    cohortProductId: string,
    entityId: string,
    allowedOps: string[],
  ): Promise<CohortDataProduct | null> {
    const cohort = await prisma.cohortDataProduct.findFirst({
      where: { cohort_product_id: cohortProductId, deleted_at: null },
    });
    if (cohort === null) return null;
    return (await this.isProviderOrAdmin(cohort, entityId, allowedOps)) ? cohort : null;
  }

  // The cohort IFF the caller can SEE it as a buyer (own, or ACTIVE in the
  // caller's org); else null (enumeration-safe — same as missing). A buyer
  // requests against a cohort it can see.
  private async loadVisibleCohort(
    cohortProductId: string,
    entityId: string,
    orgEntityId: string | null,
  ): Promise<CohortDataProduct | null> {
    const row = await prisma.cohortDataProduct.findFirst({
      where: { cohort_product_id: cohortProductId, deleted_at: null },
    });
    if (row === null) return null;
    const ownedByCaller = row.provider_entity_id === entityId;
    const visibleInOrg =
      orgEntityId !== null &&
      row.provider_org_entity_id === orgEntityId &&
      row.status === "ACTIVE";
    return ownedByCaller || visibleInOrg ? row : null;
  }

  // WHAT: Resolve a decider's entity_type for the human-decider gate.
  // OUTPUT: the EntityType, or null if the entity is missing.
  private async entityTypeOf(entityId: string): Promise<EntityType | null> {
    const e = await prisma.entity.findUnique({
      where: { entity_id: entityId },
      select: { entity_type: true },
    });
    return e?.entity_type ?? null;
  }

  private toSafe(row: CohortAccessRequest): SafeAccessRequestView {
    return {
      request_id: row.request_id,
      cohort_product_id: row.cohort_product_id,
      buyer_entity_id: row.buyer_entity_id,
      intended_use: row.intended_use,
      requested_access_mode: row.requested_access_mode,
      status: row.status,
      requires_review: row.requires_review,
      proof_required: row.proof_required,
      retention_policy: row.retention_policy,
      decision_reason: row.decision_reason,
      requested_at: row.requested_at.toISOString(),
      decided_at: row.decided_at?.toISOString() ?? null,
      expires_at: row.expires_at?.toISOString() ?? null,
      created_at: row.created_at.toISOString(),
      signal_available: false,
    };
  }

  // WHAT: A buyer creates an access request against a cohort it can see.
  // WHY: POST /api/v1/foundation/cohorts/:id/access-requests. Requesting is NOT
  //      granting — open to AI buyers; CHILDREN auto-DENIED; HIGH_SENSITIVITY
  //      flagged requires_review; everything else PENDING (a human decides).
  async createAccessRequestForCaller(
    sessionToken: string,
    cohortProductId: string,
    input: {
      intended_use?: string;
      requested_access_mode?: string;
      retention_policy?: string | null;
    },
  ): Promise<CreateAccessRequestResult> {
    const v = await this.authService.validateSession(sessionToken, "write");
    if (!v.valid) return { ok: false, code: v.code };

    if (
      typeof input.intended_use !== "string" ||
      input.intended_use.trim().length === 0 ||
      typeof input.requested_access_mode !== "string" ||
      input.requested_access_mode.trim().length === 0
    )
      return { ok: false, code: "INVALID_REQUEST" };

    const orgEntityId = await this.callerOrgOrNull(v.entity_id);
    const cohort = await this.loadVisibleCohort(cohortProductId, v.entity_id, orgEntityId);
    if (cohort === null) return { ok: false, code: "COHORT_PRODUCT_NOT_FOUND" };

    const intake = evaluateAccessRequestIntake(cohort, {
      intended_use: input.intended_use,
      requested_access_mode: input.requested_access_mode,
    });
    if (intake.admissible === false) return { ok: false, code: intake.code };

    const now = new Date();
    const denied = intake.status === "DENIED";
    const created = await prisma.cohortAccessRequest.create({
      data: {
        cohort_product_id: cohort.cohort_product_id,
        buyer_entity_id: v.entity_id,
        buyer_org_entity_id: orgEntityId,
        provider_entity_id: cohort.provider_entity_id,
        provider_org_entity_id: cohort.provider_org_entity_id,
        intended_use: input.intended_use,
        requested_access_mode: input.requested_access_mode,
        status: intake.status,
        requires_review: intake.requires_review,
        proof_required: cohort.proof_required,
        retention_policy:
          typeof input.retention_policy === "string" ? input.retention_policy : null,
        // An auto-DENIED (CHILDREN) request is decided at intake — stamp it.
        decision_reason: denied ? intake.reason : null,
        decided_at: denied ? now : null,
      },
    });

    await writeAuditEvent({
      event_type: "COHORT_ACCESS_REQUESTED",
      outcome: denied ? "DENIED" : "SUCCESS",
      actor_entity_id: v.entity_id,
      details: {
        action: "COHORT_ACCESS_REQUESTED",
        cohort_product_id: cohort.cohort_product_id,
        request_id: created.request_id,
        intended_use: created.intended_use,
        requested_access_mode: created.requested_access_mode,
        status: created.status,
        requires_review: created.requires_review,
        proof_required: created.proof_required,
        intake_reason: intake.reason,
        signal_delivered: false,
      },
    });

    return { ok: true, access_request: this.toSafe(created) };
  }

  // WHAT: List access requests for a cohort. The provider/admin sees ALL
  //       requests for the cohort; any other caller who can see the cohort sees
  //       only their OWN requests.
  // WHY: GET /api/v1/foundation/cohorts/:id/access-requests. Enumeration-safe.
  async listAccessRequestsForCaller(
    sessionToken: string,
    cohortProductId: string,
  ): Promise<ListAccessRequestsResult> {
    const v = await this.authService.validateSession(sessionToken, "read");
    if (!v.valid) return { ok: false, code: v.code };

    const orgEntityId = await this.callerOrgOrNull(v.entity_id);
    const visible = await this.loadVisibleCohort(cohortProductId, v.entity_id, orgEntityId);
    if (visible === null) return { ok: false, code: "COHORT_PRODUCT_NOT_FOUND" };

    const isManager = await this.isProviderOrAdmin(visible, v.entity_id, v.allowed_operations);
    const rows = await prisma.cohortAccessRequest.findMany({
      where: {
        cohort_product_id: visible.cohort_product_id,
        deleted_at: null,
        // A non-manager caller only ever sees their own requests.
        ...(isManager ? {} : { buyer_entity_id: v.entity_id }),
      },
      orderBy: { requested_at: "desc" },
      take: 200,
    });

    return { ok: true, access_requests: rows.map((r) => this.toSafe(r)), is_manager: isManager };
  }

  // WHAT: A HUMAN provider/admin decides a PENDING access request (APPROVED /
  //       DENIED). NO data is delivered by an approval in 1307-A.
  // WHY: POST /api/v1/foundation/cohorts/:id/access-requests/:rid/decide.
  //      Human-decider gate + self-approval forbidden (RULE 0 + stop cond #7).
  async decideAccessRequestForCaller(
    sessionToken: string,
    cohortProductId: string,
    requestId: string,
    input: { decision?: string; decision_reason?: string | null; expires_at?: string | null },
  ): Promise<DecideAccessRequestResult> {
    const v = await this.authService.validateSession(sessionToken, "write");
    if (!v.valid) return { ok: false, code: v.code };

    const cohort = await this.loadManageableCohort(
      cohortProductId,
      v.entity_id,
      v.allowed_operations,
    );
    if (cohort === null) return { ok: false, code: "COHORT_PRODUCT_NOT_FOUND" };

    // HUMAN-DECIDER GATE: only a human (non-AI) entity may grant cohort access.
    const deciderType = await this.entityTypeOf(v.entity_id);
    if (deciderType === null || isRestrictedAiClass(deciderType))
      return { ok: false, code: "NOT_AUTHORIZED" };

    const decision = input.decision;
    if (decision !== "APPROVED" && decision !== "DENIED")
      return { ok: false, code: "INVALID_DECISION" };

    const row = await prisma.cohortAccessRequest.findFirst({
      where: {
        request_id: requestId,
        cohort_product_id: cohort.cohort_product_id,
        deleted_at: null,
      },
    });
    if (row === null) return { ok: false, code: "ACCESS_REQUEST_NOT_FOUND" };

    // FORBID SELF-APPROVAL: a buyer can never decide its own request.
    if (row.buyer_entity_id === v.entity_id)
      return { ok: false, code: "SELF_APPROVAL_FORBIDDEN" };

    if (row.status !== "PENDING") return { ok: false, code: "REQUEST_NOT_PENDING" };

    // An optional access-window end for an APPROVED request — must be a valid
    // future instant (no perpetual access; no past expiry).
    const now = new Date();
    let expiresAt: Date | null = null;
    if (decision === "APPROVED" && typeof input.expires_at === "string") {
      const parsed = new Date(input.expires_at);
      if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= now.getTime())
        return { ok: false, code: "INVALID_EXPIRY" };
      expiresAt = parsed;
    }

    const nextStatus: CohortAccessRequestStatus = decision;
    const updated = await prisma.cohortAccessRequest.update({
      where: { request_id: requestId },
      data: {
        status: nextStatus,
        decided_at: now,
        decided_by_entity_id: v.entity_id,
        decision_reason:
          typeof input.decision_reason === "string" ? input.decision_reason : null,
        expires_at: expiresAt,
      },
    });

    await writeAuditEvent({
      event_type: "COHORT_ACCESS_DECIDED",
      outcome: decision === "DENIED" ? "DENIED" : "SUCCESS",
      actor_entity_id: v.entity_id,
      details: {
        action: "COHORT_ACCESS_DECIDED",
        cohort_product_id: cohort.cohort_product_id,
        request_id: updated.request_id,
        decision,
        previous_status: row.status,
        status: updated.status,
        has_expiry: updated.expires_at !== null,
        signal_delivered: false,
      },
    });

    return { ok: true, access_request: this.toSafe(updated) };
  }

  // WHAT: A HUMAN provider/admin revokes a PENDING or APPROVED request → REVOKED.
  // WHY: POST /api/v1/foundation/cohorts/:id/access-requests/:rid/revoke.
  //      Revoking withdraws permission — human-decider gate applies (RULE 0).
  async revokeAccessRequestForCaller(
    sessionToken: string,
    cohortProductId: string,
    requestId: string,
    input?: { decision_reason?: string | null },
  ): Promise<RevokeAccessRequestResult> {
    const v = await this.authService.validateSession(sessionToken, "write");
    if (!v.valid) return { ok: false, code: v.code };

    const cohort = await this.loadManageableCohort(
      cohortProductId,
      v.entity_id,
      v.allowed_operations,
    );
    if (cohort === null) return { ok: false, code: "COHORT_PRODUCT_NOT_FOUND" };

    // HUMAN-DECIDER GATE: only a human may withdraw cohort access.
    const deciderType = await this.entityTypeOf(v.entity_id);
    if (deciderType === null || isRestrictedAiClass(deciderType))
      return { ok: false, code: "NOT_AUTHORIZED" };

    const row = await prisma.cohortAccessRequest.findFirst({
      where: {
        request_id: requestId,
        cohort_product_id: cohort.cohort_product_id,
        deleted_at: null,
      },
    });
    if (row === null) return { ok: false, code: "ACCESS_REQUEST_NOT_FOUND" };

    // Only an in-force request (PENDING / APPROVED) can be revoked.
    if (row.status !== "PENDING" && row.status !== "APPROVED")
      return { ok: false, code: "REQUEST_NOT_REVOCABLE" };

    const now = new Date();
    const updated = await prisma.cohortAccessRequest.update({
      where: { request_id: requestId },
      data: {
        status: "REVOKED",
        decided_at: now,
        decided_by_entity_id: v.entity_id,
        decision_reason:
          typeof input?.decision_reason === "string" ? input.decision_reason : null,
      },
    });

    await writeAuditEvent({
      event_type: "COHORT_ACCESS_REVOKED",
      outcome: "SUCCESS",
      actor_entity_id: v.entity_id,
      details: {
        action: "COHORT_ACCESS_REVOKED",
        cohort_product_id: cohort.cohort_product_id,
        request_id: updated.request_id,
        previous_status: row.status,
        status: updated.status,
        signal_delivered: false,
      },
    });

    return { ok: true, access_request: this.toSafe(updated) };
  }
}
