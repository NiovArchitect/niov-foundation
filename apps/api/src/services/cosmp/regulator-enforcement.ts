// FILE: regulator-enforcement.ts
// PURPOSE: Shared lawful-basis enforcement helper for COSMP READ /
//          SHARE / REVOKE flows when the actor is a REGULATOR. CAR
//          Sub-box 3 sub-phase 6 [SUB-BOX-3-COSMP-ENFORCEMENT] per
//          ADR-0036 Sub-decision 5 + 6.
//
//          Pure-function discriminated-outcome design:
//            enforceRegulatorCOSMPAccess({ requester, lawful_basis_id })
//              → { ok: true, basis }
//              | { ok: false, code, status }
//
//          Caller responsibilities:
//            1. Resolve the requester Entity (with entity_type) BEFORE
//               calling this helper -- existing service convention is
//               getEntityById(session.entity_id) per
//               negotiate.service.ts:183.
//            2. Pass the lawful_basis_id from the X-Lawful-Basis-Id
//               request header (extracted at the route tier per Q8
//               LOCKED Option α).
//            3. On { ok: true }, the caller proceeds with existing
//               COSMP semantics + extends the existing audit emission
//               with basis.lawful_basis_id + basis.chain_hash.
//            4. On { ok: false }, the caller emits a DENIED audit
//               event with the supplied code as denial_reason +
//               returns the supplied HTTP status to the client.
//
// CONNECTS TO:
//   - packages/database/src/queries/lawful-basis.ts
//     (getActiveLawfulBasisForRegulator -- the 9-condition active-
//     grant query helper; 3 indexed point-lookups; no scans)
//   - packages/database/src/queries/tar.ts
//     (getTARByEntityId -- TAR lookup for jurisdiction + scope checks)
//   - apps/api/src/services/cosmp/negotiate.service.ts
//     (NEGOTIATE start-check entry point)
//   - apps/api/src/services/cosmp/read.service.ts
//     (readContent TOCTOU re-check entry point per Q4 LOCKED Option α)
//   - apps/api/src/services/cosmp/share.service.ts
//     (SHARE + REVOKE share start-check entry points)
//
// Whole-COSMP scalability discipline canonical at substantive
// register substantively (per Sub-phase 6 §18 Whole-COSMP
// scalability and orchestration alignment + 6 BEAM-compatibility
// patterns from ADR-0026 §5):
//   - Per-request enforcement; no global lock; no shared mutable state
//   - 3 indexed point-lookups via lawful-basis.ts helper (no capsule
//     scan; no entity scan; no permission scan)
//   - No capsule content read for authorization
//   - No cross-request cache (revocation/expiry must fail closed for
//     new checks immediately)
//   - Pure-function discriminated outcome -> portable to a future
//     Elixir Broadway pipeline per ADR-0028 forward-substrate
//   - Many parallel REGULATOR DMW workers can invoke this helper
//     concurrently without contention (Postgres MVCC; read-only
//     SELECTs; no row locks)
//
// Sub-phase 6 substantively bounded scope (per Q1 LOCKED + Q2 LOCKED
// + Q3 LOCKED canonical at substantive register substantively):
//   - REGULATOR WRITE / UPDATE NOT enforced here (TAR-tier denial
//     by default; bounded scope per Q1 LOCKED Option α)
//   - Per-target-entity binding NOT enforced (LawfulBasis is
//     authority-tier; D-LAWFUL-BASIS-IS-AUTHORITY-TIER-NOT-PER-TARGET
//     forward-queued per Q2 LOCKED Option α)
//   - Operation-type scope vocabulary NOT enforced (no
//     CAPSULE_READ / SHARE / REVOKE constants;
//     D-OPERATION-SCOPE-VOCABULARY-GAP forward-queued per Q3 LOCKED
//     Option α)

import {
  getActiveLawfulBasisForRegulator,
  getTARByEntityId,
  type ActiveLawfulBasisResult,
  type Entity,
  type LawfulBasis,
} from "@niov/database";

// WHAT: HTTP status codes the enforcement helper maps to. Routes use
//        this to propagate the denial to the client.
// INPUT: Used as a value type only.
// OUTPUT: None -- this is a type, not a value.
// WHY: 401 is reserved for session-class failures; enforcement-tier
//      failures use 403 (auth valid but lacks lawful basis), 404
//      (basis not found), 422 (basis-lifecycle / TAR validation), or
//      500 (defensive integrity failure).
export type EnforcementStatus = 403 | 404 | 422 | 500;

// WHAT: The discriminated outcome of enforceRegulatorCOSMPAccess.
// INPUT: Used as a value type only.
// OUTPUT: None -- this is a type, not a value.
// WHY: Caller branches on { ok: true } to proceed with COSMP
//      semantics + extend existing audit emission with the
//      validated basis fields, OR on { ok: false } to deny + emit
//      DENIED audit event with the canonical code as denial_reason.
export type EnforcementOutcome =
  | { ok: true; basis: LawfulBasis }
  | { ok: false; code: EnforcementCode; status: EnforcementStatus };

// WHAT: Enumerated public error codes per operator-LOCKED Sub-phase
//        6 §Required error codes.
// INPUT: Used as a value type only.
// OUTPUT: None -- this is a type, not a value.
// WHY: Type-narrowed so consumer services and the cosmp.routes.ts
//      statusForCode switch agree on the literal set.
export type EnforcementCode =
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
  | "INTERNAL_ENFORCEMENT_ERROR";

// WHAT: Structural input shape -- the caller has already resolved
//        the requester Entity from the validated session.
// INPUT: Used as a parameter type only.
// OUTPUT: None -- this is a type, not a value.
// WHY: Decouples this helper from session/auth concerns; the helper
//      operates on the already-resolved actor + basis context.
export interface EnforceRegulatorCOSMPAccessInput {
  requester: Entity;
  lawful_basis_id: string | null | undefined;
}

// WHAT: Map an ActiveLawfulBasisResult ok-false code to the
//        public-facing EnforcementCode + HTTP status.
// INPUT: ActiveLawfulBasisResult ok-false.
// OUTPUT: { code, status } tuple.
// WHY: Centralizes the substrate-internal code -> public-API code
//      mapping. REGULATOR_TARGET_MISMATCH (the substrate-internal
//      code from getActiveLawfulBasisForRegulator step 9) maps to
//      INTERNAL_ENFORCEMENT_ERROR at the public API because it
//      represents a substrate-state inconsistency rather than a
//      caller-correctable condition. INTERNAL_ENFORCEMENT_ERROR also
//      surfaces the substrate-internal code so the audit detail
//      preserves the underlying reason.
function mapActiveBasisFailure(
  result: Extract<ActiveLawfulBasisResult, { ok: false }>,
): { code: EnforcementCode; status: EnforcementStatus } {
  switch (result.code) {
    case "LAWFUL_BASIS_NOT_FOUND":
      return { code: "LAWFUL_BASIS_NOT_FOUND", status: 404 };
    case "LAWFUL_BASIS_NOT_LINKED_TO_AUDIT":
      return { code: "LAWFUL_BASIS_NOT_LINKED_TO_AUDIT", status: 422 };
    case "LAWFUL_BASIS_NOT_YET_VALID":
      return { code: "LAWFUL_BASIS_NOT_YET_VALID", status: 422 };
    case "LAWFUL_BASIS_EXPIRED":
      return { code: "LAWFUL_BASIS_EXPIRED", status: 422 };
    case "LAWFUL_BASIS_REVOKED":
      return { code: "LAWFUL_BASIS_REVOKED", status: 422 };
    case "LAWFUL_BASIS_HASH_MISMATCH":
      return { code: "LAWFUL_BASIS_HASH_MISMATCH", status: 403 };
    case "REGULATOR_TARGET_MISMATCH":
      // Substrate-internal: the regulator presenting the basis is not
      // the regulator the basis was granted to. Per Q4 LOCKED Option
      // α actor model, this is a substrate-state inconsistency at the
      // public API tier (the caller's session entity_id differs from
      // the grant target_entity_id). Map to INTERNAL_ENFORCEMENT_ERROR.
      return { code: "INTERNAL_ENFORCEMENT_ERROR", status: 500 };
    case "INTERNAL_ENFORCEMENT_ERROR":
      return { code: "INTERNAL_ENFORCEMENT_ERROR", status: 500 };
  }
}

// WHAT: The COSMP enforcement entry point for REGULATOR actors.
//        Pure-function discriminated outcome; no side effects (no
//        audit emission, no DB write, no logger.* call). The caller
//        owns side effects per its own service-tier audit conventions.
// INPUT: EnforceRegulatorCOSMPAccessInput (requester Entity already
//        resolved; lawful_basis_id from X-Lawful-Basis-Id header).
// OUTPUT: An EnforcementOutcome.
// WHY: Single shared enforcement substrate consumed by NEGOTIATE +
//      readContent + SHARE + REVOKE share so each call site does NOT
//      duplicate the active-grant + jurisdiction + scope checks.
//      Non-REGULATOR actors short-circuit to { ok: true } with a
//      placeholder basis fabrication path -- callers that need to
//      distinguish "REGULATOR enforcement passed" from "non-REGULATOR
//      actor; bypass enforcement" must check requester.entity_type
//      themselves before invoking this helper. See note below.
//
// IMPORTANT: This helper is invoked ONLY when the caller has already
// determined the actor is a REGULATOR. Non-REGULATOR actors never
// reach this helper -- existing COSMP behavior is preserved at the
// service-tier branching point per the canonical pattern at
// negotiate.service.ts:198 isRestrictedAiClass(requester.entity_type)
// precedent. This means { ok: true } from this helper guarantees the
// caller a validated REGULATOR basis row, and { ok: false } means the
// REGULATOR access attempt is denied at the lawful-basis tier.
export async function enforceRegulatorCOSMPAccess(
  input: EnforceRegulatorCOSMPAccessInput,
): Promise<EnforcementOutcome> {
  const { requester, lawful_basis_id } = input;

  // 1. Lawful basis identifier required for REGULATOR actor flows.
  //    Empty string treated as missing (defensive against header
  //    parsing edge cases at the route tier).
  if (
    lawful_basis_id === null ||
    lawful_basis_id === undefined ||
    lawful_basis_id.trim().length === 0
  ) {
    return {
      ok: false,
      code: "REGULATOR_LAWFUL_BASIS_REQUIRED",
      status: 403,
    };
  }

  // 2. Active lawful-basis substrate check (3 indexed point-lookups
  //    per the lawful-basis.ts helper docstring; no scans).
  const activeResult = await getActiveLawfulBasisForRegulator(
    lawful_basis_id,
    requester.entity_id,
  );
  if (!activeResult.ok) {
    const mapped = mapActiveBasisFailure(activeResult);
    return { ok: false, code: mapped.code, status: mapped.status };
  }

  // 3. TAR-tier jurisdiction + scope check. The basis carries the
  //    grant-time jurisdiction_invoked + (the regulator's TAR has the
  //    authorized list); both must agree at enforcement time. Authority
  //    scope is presence-only at Sub-phase 6 register substantively
  //    per Q3 LOCKED Option α (operation-type vocabulary forward-
  //    queued via D-OPERATION-SCOPE-VOCABULARY-GAP).
  const tar = await getTARByEntityId(requester.entity_id);
  if (tar === null) {
    // Defensive: a REGULATOR entity without a TAR cannot have its
    // jurisdiction / scope verified. Since regulator entities are
    // created via the same createEntity path that auto-creates a TAR,
    // this should not happen in practice.
    return { ok: false, code: "REGULATOR_ACCESS_DENIED", status: 403 };
  }

  if (
    !tar.regulator_jurisdiction.includes(activeResult.basis.jurisdiction_invoked)
  ) {
    return {
      ok: false,
      code: "REGULATOR_JURISDICTION_NOT_AUTHORIZED",
      status: 403,
    };
  }

  if (tar.regulator_authority_scope.length === 0) {
    // Sub-phase 6 substrate per Q3 LOCKED Option α: enforces presence
    // of authority scope but does NOT bind to operation-type scope
    // constants (CAPSULE_READ / SHARE / REVOKE forward-queued via
    // D-OPERATION-SCOPE-VOCABULARY-GAP). A regulator with an empty
    // scope list has no authorized operations and is denied.
    return { ok: false, code: "REGULATOR_SCOPE_NOT_AUTHORIZED", status: 403 };
  }

  // 4. All checks passed; return the validated basis row so the
  //    caller can extend its audit emission with basis.basis_id +
  //    basis.chain_hash without a second fetch.
  return { ok: true, basis: activeResult.basis };
}
