// FILE: authority.service.ts
// PURPOSE: Phase 1288-B — the Foundation-layer GENERALIZED ENTITY &
//          AUTHORITY ENVELOPE. This is the keystone Foundation primitive:
//          a single, entity-kind-agnostic projection that answers, for
//          ANY governed entity (PERSON, COMPANY, AI_AGENT, DEVICE,
//          APPLICATION, GOVERNMENT, REGULATOR — and future SERVICE/WORLD),
//          the five authority questions —
//            1. what can this entity KNOW?
//            2. what can this entity DO?
//            3. what can this entity REQUEST?
//            4. what can this entity PAY for?
//            5. what REQUIRES APPROVAL?
//          plus an explicit MEMORY SCOPE (Memory Capsules are first-class:
//          DMW = container, Capsule = atomic memory unit, COSMP = access
//          protocol). The envelope is a READ-ONLY projection DERIVED from
//          already-persisted Foundation substrate (Entity + TAR + Wallet);
//          it never grants authority, never trusts entity-supplied claims,
//          and is computed by Foundation — never by an LLM, Python, BEAM,
//          a device, or an app.
//
//          Foundation is the platform; Otzar is the first proving app.
//          This envelope is NOT Otzar-specific — it is the substrate that
//          future apps/games/SaaS/worlds/marketplaces/devices consume.
//
// CONNECTS TO:
//   - packages/database TAR (defaultCeilingFor / MAX_TAR_CEILING),
//     Entity, Wallet, MonetizationRole — the derivation inputs.
//   - apps/api/src/services/auth.service.ts (validateSession) — the gate.
//   - apps/api/src/services/governance/org.ts (getOrgEntityId) — tenant scope.
//   - apps/api/src/services/cosmp/negotiate.service.ts — the live capsule
//     access rules this envelope SUMMARISES (isRestrictedAiClass, the
//     ai_access_blocked / requires_validation gate, the AI_AGENT FULL→SUMMARY
//     cap). That logic stays the runtime authority; this is its declarative
//     mirror for inspection/proof.
//   - packages/database permission.ts assertSovereigntyRules — the grant
//     rules (PERSON-only LONG_TERM/PERMANENT; no AI→AI grant) mirrored here.
//   - apps/api/src/security/privileged-endpoints.ts + dual-control — the
//     source of "privileged actions require dual control".
//   - apps/api/src/routes/foundation.routes.ts — the HTTP surface.
//
// SAFETY: derives ONLY from persisted Entity/TAR/Wallet for the caller's
// authenticated session entity (or, for admins, a same-org target). It
// NEVER reads authority from a request body, a device-claimed identity, or
// an app self-declaration. Cross-tenant evaluation is fail-closed. can_pay
// is DISABLED at this phase (the economic substrate, Phase 1290-A, is the
// only thing that may move it to MOCK_ONLY — never real settlement here).

import {
  prisma,
  writeAuditEvent,
  defaultCeilingFor,
  MAX_TAR_CEILING,
  type Entity,
  type TokenAttributeRepository,
  type Wallet,
  type EntityType,
  type MonetizationRole,
  type WalletType,
} from "@niov/database";
import type { AuthService } from "../auth.service.js";
import { getOrgEntityId } from "../governance/org.js";

// ── The AuthorityEnvelope contract ───────────────────────────────────

// WHAT: Coarse identity class for an entity, derived from EntityType.
// WHY: Lets app/world/device/agent consumers branch on a stable class
//      without hard-coding the raw EntityType list. Future SERVICE/WORLD
//      EntityType values would extend this without breaking consumers.
export type EntityClass =
  | "HUMAN"
  | "ORGANIZATION"
  | "AI"
  | "DEVICE"
  | "APPLICATION"
  | "GOVERNMENT"
  | "REGULATOR";

// WHAT: Settlement mode for the economic dimension. DISABLED at 1288-B.
// WHY: The economic substrate (Phase 1290-A) introduces MOCK_ONLY /
//      PROVIDER_DEFERRED / FUTURE_ONCHAIN. Real settlement is a separate
//      Founder decision and is never produced here.
export type SettlementMode =
  | "DISABLED"
  | "MOCK_ONLY"
  | "PROVIDER_DEFERRED"
  | "FUTURE_ONCHAIN";

// The seven COSMP operations (US 12,517,919 / ADR-0009).
export type CosmpOp =
  | "NEGOTIATE"
  | "READ"
  | "WRITE"
  | "SHARE"
  | "REVOKE"
  | "SIMILARITY"
  | "CAPSULE_MANAGEMENT";

export interface CanKnow {
  can_read_capsules: boolean;
  cosmp_negotiate_allowed: boolean;
  own_wallet_type: WalletType | null;
  clearance_level: number;
  clearance_ceiling: number;
  tenant_scoped: true;
  cross_tenant_access: false;
}

export interface CanDo {
  can_write_capsules: boolean;
  can_share_capsules: boolean;
  can_create_hives: boolean;
  can_access_external_api: boolean;
  can_admin_org: boolean;
  can_admin_niov: boolean;
  // Device-class capability flag (ambient capture is consent-gated at the
  // device protocol layer, Phase 1291-A; this only marks the class).
  can_capture_ambient: boolean;
  // Application-class tool invocation (gated by can_access_external_api).
  can_invoke_app_tools: boolean;
}

export interface CanRequest {
  can_request_memory_access: boolean;
  can_request_work: boolean;
  // Economic requests are disabled until the economic substrate (1290-A).
  can_request_payment: boolean;
  // Marketplace requests are disabled until the marketplace substrate (1292-A).
  can_request_marketplace: boolean;
  can_request_tools: boolean;
  requires_human_review_for_sensitive: boolean;
}

export interface CanPay {
  // DISABLED at 1288-B; the economic substrate (1290-A) is the only thing
  // that may enable mock payment intent. Never real settlement here.
  can_create_payment_intent: boolean;
  spend_limit: number | null;
  per_transaction_cap: number | null;
  requires_approval: boolean;
  settlement_mode: SettlementMode;
  monetization_role: MonetizationRole;
}

export interface RequiresApproval {
  sensitive_capsule_access: boolean;
  privileged_actions_dual_control: boolean;
  external_send: boolean;
  economic_action: boolean;
  regulator_lawful_basis: boolean;
  // No entity may ever approve its own escalation (dual-control GAP-C1).
  can_self_approve: false;
}

// The explicit Memory Capsule authority surface (Founder amendment:
// Memory Capsules are first-class in every phase).
export interface MemoryScope {
  can_read_capsules: boolean;
  can_write_capsules: boolean;
  can_share_capsules: boolean;
  can_revoke_capsules: boolean;
  cosmp_ops_allowed: CosmpOp[];
  own_wallet_type: WalletType | null;
  // AI_AGENT is capped from FULL to SUMMARY unless a human granted
  // allow_ai_full (negotiate.service.ts). Mirrors that rule.
  full_access_capped_to_summary: boolean;
  // AI_AGENT/DEVICE honour ai_access_blocked + requires_validation gates.
  respects_ai_access_blocked: boolean;
  requires_validation_gate: boolean;
  // Sovereignty grant rules (permission.ts assertSovereigntyRules).
  can_grant_long_term_or_permanent: boolean;
  can_grant_to_ai: boolean;
  requires_approval_for_sensitive_capsules: boolean;
  // Foundation always records proof of capsule access (audit chain).
  proof_required: true;
  // Capsules whose clearance_required exceeds this are unreadable.
  capsule_clearance_ceiling: number;
}

export interface DeviceScope {
  is_device: boolean;
  // A device-claimed identity is NEVER trusted for authority (1287-A doctrine).
  device_identity_trusted: false;
  // Device memory scope must be explicitly granted, never inherited.
  memory_scope_explicit_required: boolean;
  can_capture_ambient: boolean;
  // Hard ambient-capture boundaries (Phase 1291-A keeps these false).
  raw_frame_capture_allowed: false;
  biometric_recognition_allowed: false;
}

export interface AppScope {
  is_application: boolean;
  // An application can NEVER self-authorize; it operates under explicit grants.
  can_self_authorize: false;
  requires_explicit_grants: true;
  can_invoke_tools: boolean;
}

export interface SpendScope {
  settlement_mode: SettlementMode;
  spend_limit: number | null;
  per_transaction_cap: number | null;
  // Real provider integration is a separate Founder decision (never here).
  real_provider_enabled: false;
}

export interface ApprovalPolicy {
  privileged_actions_require_dual_control: true;
  // Per-action decisions come from ActionPolicy (org, action_type, risk_tier)
  // at execution time; this envelope does not enumerate every policy row.
  per_action_decisions_from_action_policy: true;
  self_approval_forbidden: true;
}

export interface AuthorityProvenance {
  evaluator: "FOUNDATION_AUTHORITY_EVALUATOR";
  // Human-readable list of the substrate the envelope was derived from.
  derived_from: string[];
  tar_status: string | null;
  wallet_type: WalletType | null;
  // Authority is decided by Foundation only — never by an LLM/Python/BEAM/
  // device/app. This flag documents that invariant in the projection.
  decided_by: "FOUNDATION";
}

// WHAT: The generalized, entity-kind-agnostic authority envelope.
// WHY: One contract every app/world/device/agent consumes to know what an
//      entity may know/do/request/pay-for and what needs approval, with an
//      explicit Memory Capsule scope. Read-only projection; not a grant.
export interface AuthorityEnvelope {
  entity_id: string;
  display_name: string;
  entity_identity_type: EntityType;
  entity_class: EntityClass;
  authority_version: number;
  // RULE 0: only a PERSON (human) is sovereign.
  is_sovereign: boolean;
  can_know: CanKnow;
  can_do: CanDo;
  can_request: CanRequest;
  can_pay: CanPay;
  requires_approval: RequiresApproval;
  memory_scope: MemoryScope;
  device_scope: DeviceScope;
  app_scope: AppScope;
  spend_scope: SpendScope;
  approval_policy: ApprovalPolicy;
  provenance: AuthorityProvenance;
  evaluated_at: string;
}

export type AuthorityResult =
  | { ok: true; authority: AuthorityEnvelope }
  | { ok: false; code: string };

// ── Derivation helpers (pure) ────────────────────────────────────────

// WHAT: Coarse class from EntityType.
// WHY: Stable branching surface for consumers (see EntityClass).
function entityClassFor(t: EntityType): EntityClass {
  switch (t) {
    case "PERSON":
      return "HUMAN";
    case "COMPANY":
      return "ORGANIZATION";
    case "AI_AGENT":
      return "AI";
    case "DEVICE":
      return "DEVICE";
    case "APPLICATION":
      return "APPLICATION";
    case "GOVERNMENT":
      return "GOVERNMENT";
    case "REGULATOR":
      return "REGULATOR";
  }
}

// WHAT: AI_AGENT, DEVICE, or APPLICATION — the "restricted (non-human) class".
// WHY: Mirrors negotiate.service.ts:142 isRestrictedAiClass (private there).
//      These entities respect ai_access_blocked + requires_validation gates.
//      Duplicated deliberately (RULE 13 surfaced): the COSMP runtime stays
//      the source of truth; this is its declarative mirror. Phase 1289-A
//      added APPLICATION here in lockstep with the COSMP runtime so the
//      envelope's memory_scope reflects the real gate.
function isRestrictedAiClass(t: EntityType): boolean {
  return t === "AI_AGENT" || t === "DEVICE" || t === "APPLICATION";
}

// WHAT: Compute the AuthorityEnvelope for an entity from persisted substrate.
// INPUT: the entity, its TAR (nullable — absent TAR = fully fail-closed
//        capabilities), its Wallet (nullable).
// OUTPUT: a deterministic AuthorityEnvelope (same inputs → same output).
// WHY: The single, reusable derivation. No I/O, no clock-dependent branching
//      (evaluated_at is a stamp only). Authority is DERIVED, never asserted
//      by the entity itself.
export function computeAuthorityEnvelope(args: {
  entity: Pick<
    Entity,
    "entity_id" | "display_name" | "entity_type" | "clearance_level"
  >;
  tar: TokenAttributeRepository | null;
  wallet: Pick<Wallet, "wallet_type"> | null;
  evaluatedAt?: Date;
}): AuthorityEnvelope {
  const { entity, tar, wallet } = args;
  const t = entity.entity_type;
  const cls = entityClassFor(t);
  const restricted = isRestrictedAiClass(t);
  const isPerson = t === "PERSON";
  const isAiAgent = t === "AI_AGENT";
  const isDevice = t === "DEVICE";
  const isApplication = t === "APPLICATION";
  const isRegulator = t === "REGULATOR";
  const walletType: WalletType | null = wallet?.wallet_type ?? null;

  // TAR-derived capability flags. A missing/non-active TAR fails closed.
  const tarActive = tar !== null && tar.status === "ACTIVE";
  const canRead = tarActive && tar.can_read_capsules === true;
  const canWrite = tarActive && tar.can_write_capsules === true;
  const canShare = tarActive && tar.can_share_capsules === true;
  const canCreateHives = tarActive && tar.can_create_hives === true;
  const canExternalApi = tarActive && tar.can_access_external_api === true;
  const canAdminOrg = tarActive && tar.can_admin_org === true;
  const canAdminNiov = tarActive && tar.can_admin_niov === true;
  const clearanceCeiling = tar?.clearance_ceiling ?? defaultCeilingFor(t);
  const monetizationRole: MonetizationRole = tar?.monetization_role ?? "NEITHER";

  const cosmpOps: CosmpOp[] = [];
  if (canRead) cosmpOps.push("NEGOTIATE", "READ", "SIMILARITY");
  if (canWrite) cosmpOps.push("WRITE", "CAPSULE_MANAGEMENT");
  if (canShare) cosmpOps.push("SHARE", "REVOKE");

  const memory_scope: MemoryScope = {
    can_read_capsules: canRead,
    can_write_capsules: canWrite,
    can_share_capsules: canShare,
    can_revoke_capsules: canShare,
    cosmp_ops_allowed: cosmpOps,
    own_wallet_type: walletType,
    full_access_capped_to_summary: isAiAgent,
    respects_ai_access_blocked: restricted,
    requires_validation_gate: restricted,
    can_grant_long_term_or_permanent: isPerson,
    can_grant_to_ai: !isAiAgent,
    requires_approval_for_sensitive_capsules: restricted,
    proof_required: true,
    capsule_clearance_ceiling: clearanceCeiling,
  };

  const can_know: CanKnow = {
    can_read_capsules: canRead,
    cosmp_negotiate_allowed: canRead,
    own_wallet_type: walletType,
    clearance_level: entity.clearance_level,
    clearance_ceiling: clearanceCeiling,
    tenant_scoped: true,
    cross_tenant_access: false,
  };

  const can_do: CanDo = {
    can_write_capsules: canWrite,
    can_share_capsules: canShare,
    can_create_hives: canCreateHives,
    can_access_external_api: canExternalApi,
    can_admin_org: canAdminOrg,
    can_admin_niov: canAdminNiov,
    can_capture_ambient: isDevice,
    can_invoke_app_tools: isApplication && canExternalApi,
  };

  const can_request: CanRequest = {
    can_request_memory_access: true,
    can_request_work: true,
    can_request_payment: false,
    can_request_marketplace: false,
    can_request_tools: canExternalApi,
    requires_human_review_for_sensitive: restricted,
  };

  const can_pay: CanPay = {
    can_create_payment_intent: false,
    spend_limit: null,
    per_transaction_cap: null,
    requires_approval: true,
    settlement_mode: "DISABLED",
    monetization_role: monetizationRole,
  };

  const requires_approval: RequiresApproval = {
    sensitive_capsule_access: restricted,
    privileged_actions_dual_control: true,
    external_send: true,
    economic_action: true,
    regulator_lawful_basis: isRegulator,
    can_self_approve: false,
  };

  const device_scope: DeviceScope = {
    is_device: isDevice,
    device_identity_trusted: false,
    memory_scope_explicit_required: isDevice,
    can_capture_ambient: isDevice,
    raw_frame_capture_allowed: false,
    biometric_recognition_allowed: false,
  };

  const app_scope: AppScope = {
    is_application: isApplication,
    can_self_authorize: false,
    requires_explicit_grants: true,
    can_invoke_tools: isApplication && canExternalApi,
  };

  const spend_scope: SpendScope = {
    settlement_mode: "DISABLED",
    spend_limit: null,
    per_transaction_cap: null,
    real_provider_enabled: false,
  };

  const approval_policy: ApprovalPolicy = {
    privileged_actions_require_dual_control: true,
    per_action_decisions_from_action_policy: true,
    self_approval_forbidden: true,
  };

  const provenance: AuthorityProvenance = {
    evaluator: "FOUNDATION_AUTHORITY_EVALUATOR",
    derived_from: [
      "Entity.entity_type",
      "Entity.clearance_level",
      "TokenAttributeRepository(capabilities,clearance_ceiling,monetization_role,status)",
      "Wallet.wallet_type",
      "negotiate.service.ts:isRestrictedAiClass",
      "permission.ts:assertSovereigntyRules",
      "security/privileged-endpoints(dual-control)",
    ],
    tar_status: tar?.status ?? null,
    wallet_type: walletType,
    decided_by: "FOUNDATION",
  };

  return {
    entity_id: entity.entity_id,
    display_name: entity.display_name,
    entity_identity_type: t,
    entity_class: cls,
    authority_version: tar?.tar_version ?? 0,
    is_sovereign: isPerson,
    can_know,
    can_do,
    can_request,
    can_pay,
    requires_approval,
    memory_scope,
    device_scope,
    app_scope,
    spend_scope,
    approval_policy,
    provenance,
    evaluated_at: (args.evaluatedAt ?? new Date()).toISOString(),
  };
}

// Upper bound on the clearance ladder (0..6), re-exported for consumers
// that want to render the envelope's clearance against the ceiling.
export const AUTHORITY_CLEARANCE_MAX = MAX_TAR_CEILING;

// ── The service (auth-gated) ─────────────────────────────────────────

// WHAT: Foundation authority evaluator with service-owned auth gates
//        (ADR-0004 ${operation}ForCaller pattern).
// WHY: The HTTP layer never touches prisma/authority directly; it calls a
//      ForCaller method that validates the session, enforces tenant scope,
//      emits proof, and returns a discriminated union.
export class FoundationAuthorityService {
  constructor(private readonly authService: AuthService) {}

  // WHAT: Load Entity + its TAR + its Wallet in one shot.
  // INPUT: entity_id.
  // OUTPUT: the three records (TAR/Wallet nullable) or null if no entity.
  private async loadEntityAuthorityInputs(entityId: string): Promise<{
    entity: Entity;
    tar: TokenAttributeRepository | null;
    wallet: Wallet | null;
  } | null> {
    const entity = await prisma.entity.findFirst({
      where: { entity_id: entityId, deleted_at: null },
    });
    if (entity === null) return null;
    const [tar, wallet] = await Promise.all([
      prisma.tokenAttributeRepository.findUnique({
        where: { entity_id: entityId },
      }),
      prisma.wallet.findUnique({ where: { entity_id: entityId } }),
    ]);
    return { entity, tar, wallet };
  }

  // WHAT: Emit the AUTHORITY_ENVELOPE_EVALUATED proof event (RULE 4 — proof
  //        is written before the response is returned).
  // INPUT: caller, subject, self-scope, optional denial reason.
  private async emitProof(args: {
    callerEntityId: string;
    subjectEntityId: string | null;
    subjectType: EntityType | null;
    selfScope: boolean;
    clearanceCeiling: number | null;
    denialReason?: string;
  }): Promise<void> {
    await writeAuditEvent({
      event_type: "AUTHORITY_ENVELOPE_EVALUATED",
      outcome: args.denialReason === undefined ? "SUCCESS" : "DENIED",
      actor_entity_id: args.callerEntityId,
      target_entity_id: args.subjectEntityId,
      denial_reason: args.denialReason ?? null,
      details: {
        action: "AUTHORITY_ENVELOPE_EVALUATED",
        self_scope: args.selfScope,
        subject_entity_type: args.subjectType,
        clearance_ceiling: args.clearanceCeiling,
      },
    });
  }

  // WHAT: Compute the authenticated caller's OWN authority envelope.
  // INPUT: session token.
  // OUTPUT: { ok:true, authority } or { ok:false, code }.
  // WHY: GET /api/v1/foundation/authority/me — every entity can inspect its
  //      own envelope. No org required (works for orgless entities too).
  async getMyAuthorityForCaller(sessionToken: string): Promise<AuthorityResult> {
    const validation = await this.authService.validateSession(
      sessionToken,
      "read",
    );
    if (!validation.valid) {
      return { ok: false, code: validation.code };
    }
    const inputs = await this.loadEntityAuthorityInputs(validation.entity_id);
    if (inputs === null) {
      return { ok: false, code: "ENTITY_NOT_FOUND" };
    }
    const authority = computeAuthorityEnvelope({
      entity: inputs.entity,
      tar: inputs.tar,
      wallet: inputs.wallet,
    });
    await this.emitProof({
      callerEntityId: validation.entity_id,
      subjectEntityId: validation.entity_id,
      subjectType: inputs.entity.entity_type,
      selfScope: true,
      clearanceCeiling: authority.can_know.clearance_ceiling,
    });
    return { ok: true, authority };
  }

  // WHAT: Compute a TARGET entity's authority envelope on behalf of a caller.
  // INPUT: session token + target entity_id.
  // OUTPUT: { ok:true, authority } or { ok:false, code }.
  // WHY: GET /api/v1/foundation/entities/:id/authority. Self is always
  //      allowed. Evaluating ANOTHER entity requires the caller to be an org
  //      admin AND the target to be an active member of the caller's org —
  //      cross-tenant evaluation is fail-closed. A device/app can never use
  //      this to authorize itself or peek across tenants (authority is read
  //      from persisted substrate, never from the request).
  async evaluateAuthorityForCaller(
    sessionToken: string,
    targetEntityId: string,
  ): Promise<AuthorityResult> {
    const validation = await this.authService.validateSession(
      sessionToken,
      "read",
    );
    if (!validation.valid) {
      return { ok: false, code: validation.code };
    }
    const callerEntityId = validation.entity_id;

    // Self path — identical to getMyAuthorityForCaller.
    if (targetEntityId === callerEntityId) {
      return this.getMyAuthorityForCaller(sessionToken);
    }

    // Cross-entity path — admin + same-org only.
    const callerInputs = await this.loadEntityAuthorityInputs(callerEntityId);
    if (callerInputs === null) {
      return { ok: false, code: "ENTITY_NOT_FOUND" };
    }
    const callerCanAdminOrg =
      callerInputs.tar !== null &&
      callerInputs.tar.status === "ACTIVE" &&
      callerInputs.tar.can_admin_org === true;
    if (!callerCanAdminOrg) {
      await this.emitProof({
        callerEntityId,
        subjectEntityId: targetEntityId,
        subjectType: null,
        selfScope: false,
        clearanceCeiling: null,
        denialReason: "NOT_AUTHORIZED",
      });
      return { ok: false, code: "NOT_AUTHORIZED" };
    }

    // Resolve the caller's org and require the target to be an active member.
    let orgEntityId: string;
    try {
      orgEntityId = await getOrgEntityId(callerEntityId);
    } catch {
      return { ok: false, code: "NO_ORG_FOR_CALLER" };
    }
    const membership = await prisma.entityMembership.findFirst({
      where: {
        parent_id: orgEntityId,
        child_id: targetEntityId,
        is_active: true,
      },
    });
    if (membership === null) {
      // Cross-tenant or unknown target — fail closed, reveal nothing.
      await this.emitProof({
        callerEntityId,
        subjectEntityId: targetEntityId,
        subjectType: null,
        selfScope: false,
        clearanceCeiling: null,
        denialReason: "CROSS_TENANT_FORBIDDEN",
      });
      return { ok: false, code: "CROSS_TENANT_FORBIDDEN" };
    }

    const targetInputs = await this.loadEntityAuthorityInputs(targetEntityId);
    if (targetInputs === null) {
      return { ok: false, code: "TARGET_NOT_FOUND" };
    }
    const authority = computeAuthorityEnvelope({
      entity: targetInputs.entity,
      tar: targetInputs.tar,
      wallet: targetInputs.wallet,
    });
    await this.emitProof({
      callerEntityId,
      subjectEntityId: targetEntityId,
      subjectType: targetInputs.entity.entity_type,
      selfScope: false,
      clearanceCeiling: authority.can_know.clearance_ceiling,
    });
    return { ok: true, authority };
  }
}
