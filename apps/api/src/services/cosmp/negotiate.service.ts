// FILE: negotiate.service.ts
// PURPOSE: Implement the COSMP NEGOTIATE operation -- the gate
//          between "I know a capsule exists" and "I am allowed to
//          actually call READ on it". On success, returns a
//          short-lived, single-use access declaration that 3B
//          (READ) will consume.
// CONNECTS TO: AuthService.validateSession, getCapsuleMetadata,
//              checkPermission, getEntityById, the AuditEvent table,
//              and the declaration NonceStore (a Redis key prefix
//              separate from session nonces).

import { randomUUID } from "node:crypto";
import jwt, { type SignOptions } from "jsonwebtoken";
import {
  checkPermission,
  getCapsuleMetadata,
  getEntityById,
  writeAuditEvent,
  type AccessScope,
  type CapsuleMetadata,
  type LawfulBasis,
  type Permission,
} from "@niov/database";
import type { NonceStore } from "../../redis.js";
import type { AuthService } from "../auth.service.js";
import type { ComplianceService } from "../compliance/compliance.service.js";
import { createGateEscalationForCaller } from "../governance/escalation.service.js";
import { assertJurisdictionalScope } from "./jurisdiction-enforcement.js";
import { enforceRegulatorCOSMPAccess } from "./regulator-enforcement.js";
import { logger } from "../../logger.js";

// WHAT: How long an access declaration is valid for, in seconds.
// INPUT: None.
// OUTPUT: A duration in seconds.
// WHY: Spec says 5 minutes. 3B (READ) checks the declaration is
//      both present in the store AND inside its valid_until window.
export const DECLARATION_TTL_SECONDS = 5 * 60;

// WHAT: The success return shape of negotiate().
// INPUT: Used as a return type only.
// OUTPUT: None -- this is a type, not a value.
// WHY: Routes return both the declaration_token (signed JWT, what 3B
//      will be handed) AND structured metadata so the caller can
//      display the granted scope without parsing the JWT.
export interface NegotiateSuccess {
  ok: true;
  declaration_id: string;
  declaration_token: string;
  capsule_id: string;
  granted_scope: AccessScope;
  valid_until: Date;
}

// WHAT: The failure return shape of negotiate().
// INPUT: Used as a return type only.
// OUTPUT: None -- this is a type.
// WHY: A discriminated union (ok: false) lets routes map specific
//      codes to HTTP status without throwing. Generic ACCESS_DENIED
//      is the same response shape whether the capsule does not
//      exist or the caller's clearance is too low (security req).
export interface NegotiateFailure {
  ok: false;
  code:
    | "SESSION_INVALID"
    | "SESSION_EXPIRED"
    | "SESSION_REVOKED"
    | "SESSION_INVALIDATED"
    | "OPERATION_NOT_PERMITTED"
    | "ACCESS_DENIED"
    | "NO_PERMISSION"
    | "COMPLIANCE_CHECK_FAILED"
    // CAR Sub-box 3 sub-phase 6 [SUB-BOX-3-COSMP-ENFORCEMENT] per
    // ADR-0036 Sub-decision 5 + 6: REGULATOR-actor lawful-basis
    // enforcement codes. Emitted by the regulator-enforcement helper
    // before the existing 8-step NEGOTIATE flow runs.
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
    // ADR-0037 Sub-decision 7 NEGOTIATE start-check. Emitted by the
    // assertJurisdictionalScope helper before the owner shortcut + the
    // existing 8-step NEGOTIATE flow runs.
    | "ACTOR_JURISDICTION_MISSING"
    | "TARGET_JURISDICTION_MISSING"
    | "CROSS_JURISDICTION_ACCESS_DENIED"
    | "JURISDICTION_NOT_AUTHORIZED";
  message: string;
  failing_framework?: string;
}

// WHAT: The shape of the JWT payload we sign for the access declaration.
// INPUT: Used as a payload type for jwt.sign / jwt.verify.
// OUTPUT: None -- this is a type.
// WHY: 3B (READ) will jwt.verify with the same secret and read these
//      fields out. Centralizing the shape keeps the producer and
//      future consumer in sync.
export interface AccessDeclarationPayload {
  declaration_id: string;
  capsule_id: string;
  requesting_entity_id: string;
  granted_scope: AccessScope;
  issued_at: number; // ms epoch
  valid_until: number; // ms epoch
}

// WHAT: An ordering of access scopes from least to most powerful.
// INPUT: Used as a lookup table.
// OUTPUT: A number for each AccessScope value.
// WHY: We need to compute min(permission_scope, requested_scope).
//      Numbers make that comparison trivial.
const SCOPE_ORDER: Record<AccessScope, number> = {
  METADATA_ONLY: 0,
  SUMMARY: 1,
  FULL: 2,
};

// WHAT: Take two AccessScope values and return whichever is smaller
//        (more restrictive).
// INPUT: Two AccessScope values.
// OUTPUT: The more restrictive one.
// WHY: Spec step 5 -- granted_scope = min(permission, requested).
//      A pure helper makes that step easy to test alone.
export function scopeMin(a: AccessScope, b: AccessScope): AccessScope {
  return SCOPE_ORDER[a] <= SCOPE_ORDER[b] ? a : b;
}

// WHAT: True when an entity type triggers the AI / restricted-class
//        sovereignty rules.
// INPUT: An EntityType-like string from the entity row.
// OUTPUT: A boolean.
// WHY: Spec lumps AI_AGENT + DEVICE + ROBOT into the restricted
//      class. ROBOT is intentionally absent from our enum (Section 1F
//      decision); when we add ROBOT later we extend this guard.
//      Phase 1289-A: APPLICATION joins the restricted class — a non-human
//      application entity reading a NON-OWNED capsule must respect
//      ai_access_blocked + requires_validation just like AI_AGENT/DEVICE
//      (RULE 0 — non-human entities never get a higher default ceiling than
//      a human, and an app must not read capsules a human walled off from
//      AI). This is additive hardening: owner reads still bypass via the
//      owner shortcut, and no existing flow authenticates an APPLICATION
//      entity as a cross-entity capsule reader (Otzar operates on PERSON
//      sessions). The FULL→SUMMARY cap below stays AI_AGENT-only.
function isRestrictedAiClass(entityType: string): boolean {
  return (
    entityType === "AI_AGENT" ||
    entityType === "DEVICE" ||
    entityType === "APPLICATION"
  );
}

// WHAT: Determine whether an AI_AGENT can keep FULL scope despite the
//        default cap.
// INPUT: The matching permission row.
// OUTPUT: true when the permission's conditions JSON carries
//         allow_ai_full=true, false otherwise.
// WHY: Spec says only an "explicit human override" lets an AI agent
//      have FULL scope. We express that override as a permission-row
//      condition the granting human sets at create time.
function permissionAllowsAiFull(permission: Permission): boolean {
  const conditions = permission.conditions as Record<string, unknown> | null;
  if (conditions === null || typeof conditions !== "object") return false;
  return conditions.allow_ai_full === true;
}

// WHAT: The class that orchestrates the NEGOTIATE flow.
// INPUT: The authService (validates session), the declaration store
//        (signs the access declaration into Redis or memory), and
//        the JWT secret (signs the declaration token).
// OUTPUT: A class with one negotiate() method.
// WHY: Constructor injection means tests can swap a MemoryNonceStore
//      and a known JWT secret without touching env vars.
export class NegotiateService {
  constructor(
    private readonly authService: AuthService,
    private readonly declarationStore: NonceStore,
    private readonly jwtSecret: string,
    private readonly complianceService?: ComplianceService,
  ) {}

  // WHAT: Run the COSMP NEGOTIATE flow exactly as the spec describes.
  // INPUT: The session token, the target capsule_id, the requested
  //        AccessScope, and an optional client IP for the audit row.
  // OUTPUT: A NegotiateSuccess on success, NegotiateFailure on any
  //         rejection.
  // WHY: PRE-CHECK + 8 numbered steps in order, each with its own
  //      audit row. Generic ACCESS_DENIED for not-found / clearance
  //      / AI-blocked so the caller cannot probe for capsule
  //      existence; specific NO_PERMISSION when permission is the
  //      only thing missing.
  async negotiate(
    sessionToken: string,
    targetCapsuleId: string,
    requestedScope: AccessScope,
    context: {
      ip_address?: string | null;
      // CAR Sub-box 3 sub-phase 6 [SUB-BOX-3-COSMP-ENFORCEMENT] per
      // Q8 LOCKED Option α: REGULATOR actor flows must supply the
      // X-Lawful-Basis-Id header, propagated here. Non-REGULATOR
      // flows leave this null/undefined; existing behavior preserved.
      lawful_basis_id?: string | null;
    } = {},
  ): Promise<NegotiateSuccess | NegotiateFailure> {
    // STEP 1 -- validate session
    const validation = await this.authService.validateSession(
      sessionToken,
      "read",
    );
    if (!validation.valid) {
      await writeAuditEvent({
        event_type: "NEGOTIATE",
        outcome: "DENIED",
        denial_reason: "SESSION_INVALID",
        target_capsule_id: targetCapsuleId,
        ip_address: context.ip_address ?? null,
        details: { validation_code: validation.code },
      });
      return failure(validation.code, "Access denied");
    }

    // PRE-CHECK -- look up the entity to apply sovereignty rules
    const requester = await getEntityById(validation.entity_id);
    if (requester === null) {
      // Defensive: should not happen because validateSession already
      // confirmed the entity has an active TAR. Treat as access
      // denied without revealing anything.
      await writeAuditEvent({
        event_type: "NEGOTIATE",
        outcome: "DENIED",
        actor_entity_id: validation.entity_id,
        target_capsule_id: targetCapsuleId,
        denial_reason: "ENTITY_VANISHED",
        ip_address: context.ip_address ?? null,
      });
      return accessDenied();
    }
    const restrictedClass = isRestrictedAiClass(requester.entity_type);

    // CAR Sub-box 3 sub-phase 6 [SUB-BOX-3-COSMP-ENFORCEMENT] per
    // ADR-0036 Sub-decision 5 + 6 + Q4 LOCKED Option α start-check:
    // when actor is REGULATOR, lawful-basis enforcement runs BEFORE
    // any capsule metadata fetch. This ensures a REGULATOR without
    // an active lawful basis never even probes capsule existence.
    // Substrate-honest scalability discipline canonical at
    // substantive register substantively per Sub-phase 6 §18
    // Whole-COSMP scalability and orchestration alignment: 3
    // indexed point-lookups per check; no scans; no global lock;
    // many parallel REGULATOR DMW workers can invoke this branch
    // concurrently without contention.
    let validatedRegulatorBasis: LawfulBasis | null = null;
    if (requester.entity_type === "REGULATOR") {
      const enforcement = await enforceRegulatorCOSMPAccess({
        requester,
        lawful_basis_id: context.lawful_basis_id,
      });
      if (!enforcement.ok) {
        await writeAuditEvent({
          event_type: "NEGOTIATE",
          outcome: "DENIED",
          actor_entity_id: validation.entity_id,
          target_capsule_id: targetCapsuleId,
          session_id: validation.session_id,
          denial_reason: enforcement.code,
          ip_address: context.ip_address ?? null,
          // Carry lawful_basis_id at the top-level audit column when
          // known (per Sub-phase 4 substrate). For REGULATOR_LAWFUL_BASIS_REQUIRED
          // the caller did not provide an id, so the field stays null.
          lawful_basis_id:
            typeof context.lawful_basis_id === "string"
              ? context.lawful_basis_id
              : null,
          details: { entity_type: requester.entity_type },
        });
        return {
          ok: false,
          code: enforcement.code,
          message: "REGULATOR access denied at lawful-basis enforcement",
        };
      }
      validatedRegulatorBasis = enforcement.basis;
    }

    // STEP 2 -- load capsule metadata
    const metadata = await getCapsuleMetadata(targetCapsuleId);
    if (metadata === null) {
      await writeAuditEvent({
        event_type: "NEGOTIATE",
        outcome: "DENIED",
        actor_entity_id: validation.entity_id,
        target_capsule_id: targetCapsuleId,
        denial_reason: "CAPSULE_NOT_FOUND",
        ip_address: context.ip_address ?? null,
        details: { entity_type: requester.entity_type },
      });
      return accessDenied();
    }

    // CAR Sub-box 2 sub-phase 4 [CAR-SUB-BOX-2-COSMP-ENFORCEMENT] per
    // ADR-0037 Sub-decision 7 + Q8 LOCKED Option α: jurisdiction
    // start-check runs BEFORE the owner shortcut. Owner access does
    // NOT bypass jurisdiction drift protection — MemoryCapsule.jurisdiction
    // is immutable per Sub-decision 4, but Entity.jurisdiction CAN
    // drift, so an owner whose Entity has been re-anchored cannot
    // access their own capsule from the new jurisdiction without a
    // sanctioned cross-region transfer workflow (forward-queued).
    // Pure-function helper; no DB reads here (actor + target already
    // pre-fetched per Sub-decision 6 design canonical at substantive
    // register substantively).
    //
    // CAR Sub-box 2 sub-phase 5 [CAR-SUB-BOX-2-REGULATOR-INTEGRATION]
    // per ADR-0037 Sub-decision 8 + Q1 LOCKED Option α (basis-
    // authoritative) + Q-RULE-13-REGULATOR-NULL-CAPSULE-POLICY LOCKED
    // Option α (null-capsule guard): for REGULATOR actors with a
    // validated lawful basis AND a non-null capsule jurisdiction, the
    // basis is the actor's jurisdictional authority for this access.
    // Substitute actor.jurisdiction with
    // validatedRegulatorBasis.jurisdiction_invoked at the helper call
    // site. REGULATOR Entity.jurisdiction is NOT required to match
    // capsule.jurisdiction. NULL capsule jurisdiction preserves
    // null/null backward-compat from Sub-phase 3 + 4 — substitution
    // would otherwise flip null/null into substituted/null =
    // TARGET_JURISDICTION_MISSING (breaks legacy fixtures). NO change
    // to assertJurisdictionalScope helper. NO change to
    // regulator-enforcement.ts (active-basis + TAR-jurisdiction
    // substrate preserved upstream).
    const negotiateActorJurisdiction =
      requester.entity_type === "REGULATOR" &&
      validatedRegulatorBasis !== null &&
      metadata.jurisdiction !== null
        ? validatedRegulatorBasis.jurisdiction_invoked
        : requester.jurisdiction;
    const negotiateJurisdiction = assertJurisdictionalScope({
      actor: {
        entity_id: requester.entity_id,
        jurisdiction: negotiateActorJurisdiction,
      },
      target: {
        capsule: {
          capsule_id: metadata.capsule_id,
          jurisdiction: metadata.jurisdiction,
        },
      },
      action: "NEGOTIATE",
    });
    if (!negotiateJurisdiction.ok) {
      await writeAuditEvent({
        event_type: "NEGOTIATE",
        outcome: "DENIED",
        actor_entity_id: validation.entity_id,
        target_capsule_id: targetCapsuleId,
        target_entity_id: metadata.entity_id,
        session_id: validation.session_id,
        denial_reason: negotiateJurisdiction.code,
        ip_address: context.ip_address ?? null,
        jurisdiction: metadata.jurisdiction,
        // Sub-phase 5 per Q3 LOCKED Option α: enrich denial audit
        // with lawful basis fields when the denial is at REGULATOR
        // basis-vs-capsule register. lawful_basis_id +
        // lawful_basis_chain_hash carried at top-level (sub-phase 6
        // of Sub-box 3 substrate); lawful_basis_jurisdiction in
        // details for forensic reconstruction.
        lawful_basis_id: validatedRegulatorBasis?.basis_id ?? null,
        lawful_basis_chain_hash:
          validatedRegulatorBasis?.chain_hash ?? null,
        details: {
          entity_type: requester.entity_type,
          actor_jurisdiction: negotiateJurisdiction.actor_jurisdiction,
          target_jurisdiction: negotiateJurisdiction.target_jurisdiction,
          lawful_basis_jurisdiction:
            validatedRegulatorBasis?.jurisdiction_invoked ?? null,
        },
      });
      return {
        ok: false,
        code: negotiateJurisdiction.code,
        message: "NEGOTIATE denied at jurisdiction-scope enforcement",
      };
    }

    // OWNER SHORTCUT (Section 4 addition): when the requester owns
    // the capsule, sovereignty grants them full access to their own
    // data. Skip ai_access_blocked, clearance, and permission checks
    // and issue a declaration at the requested scope. AI-cap is
    // skipped too -- an entity cannot block itself from its own
    // wallet just because it happens to be an AI.
    if (metadata.entity_id === requester.entity_id) {
      const declaration_id = randomUUID();
      const issued_at = Date.now();
      const valid_until = issued_at + DECLARATION_TTL_SECONDS * 1000;
      const payload: AccessDeclarationPayload = {
        declaration_id,
        capsule_id: targetCapsuleId,
        requesting_entity_id: validation.entity_id,
        granted_scope: requestedScope,
        issued_at,
        valid_until,
      };
      const signOptions: SignOptions = { expiresIn: DECLARATION_TTL_SECONDS };
      const declaration_token = jwt.sign(
        payload,
        this.jwtSecret,
        signOptions,
      );
      await this.declarationStore.set(declaration_id, DECLARATION_TTL_SECONDS);

      await writeAuditEvent({
        event_type: "NEGOTIATE",
        outcome: "SUCCESS",
        actor_entity_id: validation.entity_id,
        target_capsule_id: targetCapsuleId,
        target_entity_id: metadata.entity_id,
        session_id: validation.session_id,
        ip_address: context.ip_address ?? null,
        // Sub-phase 6: when REGULATOR enforcement validated a basis,
        // carry the binding into the canonical_record positions 13 + 14.
        lawful_basis_id: validatedRegulatorBasis?.basis_id ?? null,
        lawful_basis_chain_hash:
          validatedRegulatorBasis?.chain_hash ?? null,
        // CAR Sub-box 2 sub-phase 4 per ADR-0037 Sub-decision 5
        // AuditEvent jurisdiction cascade: capsule-scoped success
        // event carries metadata.jurisdiction at row-metadata register.
        jurisdiction: metadata.jurisdiction,
        details: {
          entity_type: requester.entity_type,
          declaration_id,
          granted_scope: requestedScope,
          owner_shortcut: true,
        },
      });

      return {
        ok: true,
        declaration_id,
        declaration_token,
        capsule_id: targetCapsuleId,
        granted_scope: requestedScope,
        valid_until: new Date(valid_until),
      };
    }

    // PRE-CHECK -- AI / DEVICE-class entities respect ai_access_blocked
    if (restrictedClass && metadata.ai_access_blocked === true) {
      await writeAuditEvent({
        event_type: "NEGOTIATE",
        outcome: "DENIED",
        actor_entity_id: validation.entity_id,
        target_capsule_id: targetCapsuleId,
        target_entity_id: metadata.entity_id,
        denial_reason: "AI_ACCESS_BLOCKED",
        ip_address: context.ip_address ?? null,
        details: { entity_type: requester.entity_type },
      });
      return accessDenied();
    }

    // PRE-CHECK -- AI / DEVICE-class entities respect the validation
    // gate flag (RAA 12.8 §5.2 / D-2D-D10-4): a capsule marked
    // requires_validation is withheld from restricted-class entities
    // until a human clears the gate. Read-side mirror of
    // ai_access_blocked; the gate-fail -> COMPLIANCE_GATE escalation
    // coupling landed in [D-2D-D10-5] (createGateEscalationForCaller;
    // get-or-create dedup) -- see below.
    if (restrictedClass && metadata.requires_validation === true) {
      await writeAuditEvent({
        event_type: "NEGOTIATE",
        outcome: "DENIED",
        actor_entity_id: validation.entity_id,
        target_capsule_id: targetCapsuleId,
        target_entity_id: metadata.entity_id,
        denial_reason: "VALIDATION_REQUIRED",
        ip_address: context.ip_address ?? null,
        details: { entity_type: requester.entity_type },
      });
      // Gate-fail -> COMPLIANCE_GATE escalation coupling (D-2D-D10-5).
      // A restricted-class denial automatically creates a human-review
      // escalation targeting the capsule owner. Get-or-create dedup
      // prevents AI-retry-flood at the human-review queue. Failure here
      // is best-effort logged but does NOT block the denial -- the
      // NEGOTIATE/DENIED audit event above is the authoritative denial
      // record (RULE 4); the escalation is a downstream signal.
      try {
        await createGateEscalationForCaller(
          validation.entity_id, // source (restricted-class requester)
          targetCapsuleId,
          metadata.entity_id, // target (capsule owner)
        );
      } catch (err) {
        logger.warn(
          { err, capsule_id: targetCapsuleId },
          "gate escalation creation failed; denial stands",
        );
      }
      return accessDenied();
    }

    // STEP 3 -- clearance check (always before permission check)
    if (validation.clearance_ceiling < metadata.clearance_required) {
      await writeAuditEvent({
        event_type: "NEGOTIATE",
        outcome: "DENIED",
        actor_entity_id: validation.entity_id,
        target_capsule_id: targetCapsuleId,
        target_entity_id: metadata.entity_id,
        denial_reason: "CLEARANCE_INSUFFICIENT",
        ip_address: context.ip_address ?? null,
        details: {
          entity_type: requester.entity_type,
          session_ceiling: validation.clearance_ceiling,
          capsule_required: metadata.clearance_required,
        },
      });
      return accessDenied();
    }

    // STEP 4 -- permission check
    const permission = await checkPermission(
      targetCapsuleId,
      validation.entity_id,
    );
    if (permission === null) {
      await writeAuditEvent({
        event_type: "NEGOTIATE",
        outcome: "DENIED",
        actor_entity_id: validation.entity_id,
        target_capsule_id: targetCapsuleId,
        target_entity_id: metadata.entity_id,
        denial_reason: "NO_PERMISSION",
        ip_address: context.ip_address ?? null,
        details: { entity_type: requester.entity_type },
      });
      return {
        ok: false,
        code: "NO_PERMISSION",
        message: "You do not have permission to access this capsule",
      };
    }

    // STEP 4.5 (Section 7) -- compliance check. Owner shortcut
    // already returned earlier; this only runs for cross-entity
    // access. If the target is bound by a framework whose
    // predicate fails, STOP and return COMPLIANCE_CHECK_FAILED.
    if (this.complianceService !== undefined) {
      const compliance = await this.complianceService.runComplianceChecks({
        operation_type: "NEGOTIATE",
        actor_entity_id: validation.entity_id,
        target_entity_id: metadata.entity_id,
        capsule_id: targetCapsuleId,
        capsule_type: metadata.capsule_type,
        permission,
        session_clearance_ceiling: validation.clearance_ceiling,
      });
      if (!compliance.compliant) {
        await writeAuditEvent({
          event_type: "NEGOTIATE",
          outcome: "DENIED",
          actor_entity_id: validation.entity_id,
          target_capsule_id: targetCapsuleId,
          target_entity_id: metadata.entity_id,
          denial_reason: "COMPLIANCE_CHECK_FAILED",
          ip_address: context.ip_address ?? null,
          details: {
            failing_framework: compliance.failing_framework,
            framework_reason: compliance.reason,
            entity_type: requester.entity_type,
          },
        });
        return {
          ok: false,
          code: "COMPLIANCE_CHECK_FAILED",
          message:
            compliance.reason ?? "Operation blocked by a compliance framework",
          failing_framework: compliance.failing_framework,
        };
      }
    }

    // STEP 5 -- scope narrowing
    let grantedScope: AccessScope = scopeMin(
      permission.access_scope,
      requestedScope,
    );

    // AI sovereignty cap: AI_AGENT cannot get FULL unless the
    // permission was created with an explicit human override flag.
    if (
      requester.entity_type === "AI_AGENT" &&
      grantedScope === "FULL" &&
      !permissionAllowsAiFull(permission)
    ) {
      grantedScope = "SUMMARY";
    }

    // STEP 6 -- issue access declaration (signed JWT + Redis presence)
    const declaration_id = randomUUID();
    const issued_at = Date.now();
    const valid_until = issued_at + DECLARATION_TTL_SECONDS * 1000;

    const payload: AccessDeclarationPayload = {
      declaration_id,
      capsule_id: targetCapsuleId,
      requesting_entity_id: validation.entity_id,
      granted_scope: grantedScope,
      issued_at,
      valid_until,
    };
    const signOptions: SignOptions = { expiresIn: DECLARATION_TTL_SECONDS };
    const declaration_token = jwt.sign(payload, this.jwtSecret, signOptions);

    await this.declarationStore.set(declaration_id, DECLARATION_TTL_SECONDS);

    // STEP 7 -- audit success BEFORE returning
    await writeAuditEvent({
      event_type: "NEGOTIATE",
      outcome: "SUCCESS",
      actor_entity_id: validation.entity_id,
      target_capsule_id: targetCapsuleId,
      target_entity_id: metadata.entity_id,
      session_id: validation.session_id,
      ip_address: context.ip_address ?? null,
      // Sub-phase 6: when REGULATOR enforcement validated a basis at
      // the start-check, carry the binding into canonical_record
      // positions 13 + 14 per ADR-0036 Sub-decision 5.
      lawful_basis_id: validatedRegulatorBasis?.basis_id ?? null,
      lawful_basis_chain_hash:
        validatedRegulatorBasis?.chain_hash ?? null,
      // CAR Sub-box 2 sub-phase 4 per ADR-0037 Sub-decision 5
      // AuditEvent jurisdiction cascade: capsule-scoped success event
      // carries metadata.jurisdiction at row-metadata register.
      jurisdiction: metadata.jurisdiction,
      details: {
        entity_type: requester.entity_type,
        declaration_id,
        granted_scope: grantedScope,
        permission_id: permission.permission_id,
        requested_scope: requestedScope,
        ai_capped: requester.entity_type === "AI_AGENT" && requestedScope === "FULL" && grantedScope !== "FULL",
      },
    });

    // STEP 8 -- return access declaration
    return {
      ok: true,
      declaration_id,
      declaration_token,
      capsule_id: targetCapsuleId,
      granted_scope: grantedScope,
      valid_until: new Date(valid_until),
    };
  }
}

// WHAT: Build a generic "Access denied" failure.
// INPUT: None.
// OUTPUT: A NegotiateFailure with code ACCESS_DENIED.
// WHY: Centralizing the message means not-found, clearance-failed,
//      and AI-blocked all return identical responses. No info leak.
function accessDenied(): NegotiateFailure {
  return { ok: false, code: "ACCESS_DENIED", message: "Access denied" };
}

// WHAT: Build a session-class failure with a given code.
// INPUT: The validate failure code and a message string.
// OUTPUT: A NegotiateFailure.
// WHY: Forwards validateSession's specific codes (SESSION_INVALID,
//      SESSION_EXPIRED, etc) to the caller so middleware can render
//      the right HTTP status.
function failure(
  code: NegotiateFailure["code"],
  message: string,
): NegotiateFailure {
  return { ok: false, code, message };
}

// Re-export some types so route handlers can stay close to the
// negotiate flow without reaching deep into @niov/database.
export type { CapsuleMetadata };
