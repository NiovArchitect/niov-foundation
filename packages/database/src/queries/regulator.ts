// FILE: queries/regulator.ts
// PURPOSE: REGULATOR principal validation helpers per ADR-0036
//          Sub-decision 1-2-7. Sub-phase 3 of the CAR Sub-box 3
//          mini-arc; service-substrate-only commit.
// CONNECTS TO: Entity table (entity_type column; REGULATOR enum
//              value per sub-phase 2 [SUB-BOX-3-SCHEMA] db6e0d7);
//              TokenAttributeRepository table (regulator_jurisdiction
//              + regulator_authority_scope + regulator_credentialed_by
//              fields per sub-phase 2); LawfulBasis row created via
//              packages/database/src/queries/lawful-basis.ts when
//              REGULATOR access is granted.
//
// REGULATOR is DISTINCT FROM GOVERNMENT per ADR-0036 Sub-decision 1.
// CAR §2.1 verbatim correctness-hazard rationale: "a SEC examiner
// reading a regulated bank's data must not have the same TAR shape
// as the SEC's own internal deployment of Foundation." GOVERNMENT
// is a tenant entity type (a public-sector agency operating Foundation
// as their own tenant); REGULATOR is an external authority accessing
// another tenant's data under lawful authority.
//
// Sub-phase 3 substantive scope (per Q1-Q10 LOCKED):
//   - Pure validation helper (no DB write side effects in
//     validateRegulatorAccess; row read for getRegulatorEntityById only)
//   - Authority scope is freeform String[] per Q5 LOCKED (no static
//     allow-list at sub-phase 3; runtime allow-list / taxonomy
//     forward-queued to sub-phase 6 COSMP enforcement if required)
//   - Credentialing-authority verification is presence-check only
//     (trusted-authority registry + National PKI + EU eIDAS
//     forward-queued per ADR-0036 Sub-decision 7)

import type {
  Entity,
  EntityType,
  TokenAttributeRepository,
} from "@prisma/client";
import { prisma } from "../client.js";

// WHAT: An Entity record joined with its TokenAttributeRepository
//        (the regulator_* fields live on the TAR per ADR-0036 Sub-
//        decision 2 schema landing at sub-phase 2).
// INPUT: Used as a parameter type only.
// OUTPUT: None -- this is a type, not a value.
// WHY: validateRegulatorAccess needs both entity_type / status from
//      Entity AND regulator_* fields from TAR; expressed as a single
//      type for the helper signature.
export interface EntityWithTar extends Entity {
  tar: TokenAttributeRepository | null;
}

// WHAT: Input to validateRegulatorAccess. Encodes the access request:
//        which jurisdiction the regulator is invoking + which scope
//        of authority is being claimed.
// INPUT: Used as a parameter type only.
// OUTPUT: None -- this is a type, not a value.
// WHY: The validation helper checks (a) the REGULATOR entity is
//      authorized in this jurisdiction and (b) the requested authority
//      scope is within the regulator's credentialed scope.
export interface RegulatorAccessRequest {
  jurisdiction_invoked: string;
  authority_scope: string;
}

// WHAT: Result of validateRegulatorAccess. `ok: true` for accepted
//        access; `ok: false` with a reason discriminator for rejection.
// INPUT: Used as a parameter type only.
// OUTPUT: None -- this is a type, not a value.
// WHY: Discriminated union enables exhaustive caller handling (a
//      route handler can map each reason to a specific error envelope
//      / audit event detail).
export type RegulatorValidationResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "NOT_REGULATOR"
        | "ENTITY_NOT_ACTIVE"
        | "MISSING_CREDENTIALING"
        | "JURISDICTION_NOT_AUTHORIZED"
        | "SCOPE_NOT_AUTHORIZED";
    };

// WHAT: Validate a REGULATOR entity for a specific access request.
//        Pure function; no DB writes; no audit emissions.
// INPUT: An EntityWithTar (Entity + TAR) and a RegulatorAccessRequest.
// OUTPUT: A RegulatorValidationResult discriminated union.
// WHY: The 5 rejection reasons map to the substantive guards from
//      ADR-0036 Sub-decision 1 + 2 + 7:
//      1. NOT_REGULATOR — entity_type guard (correctness-hazard per
//         CAR §2.1; GOVERNMENT entity must NOT be accepted as a
//         regulator).
//      2. ENTITY_NOT_ACTIVE — entity status guard (SUSPENDED /
//         DELETED REGULATOR cannot exercise authority).
//      3. MISSING_CREDENTIALING — TAR-presence + credentialed-by
//         presence check (REGULATOR must have a TAR with a
//         credentialing authority recorded; concrete trust
//         verification forward-queued per Sub-decision 7).
//      4. JURISDICTION_NOT_AUTHORIZED — invoked jurisdiction must
//         appear in the regulator's credentialed jurisdictions.
//      5. SCOPE_NOT_AUTHORIZED — requested authority scope must
//         appear in the regulator's credentialed scopes.
//      Time-boundedness (LawfulBasis valid_from / valid_until) is
//      checked at the LawfulBasis row level via isLawfulBasisActive
//      (lawful-basis.ts); not duplicated here.
export function validateRegulatorAccess(
  entity: EntityWithTar,
  request: RegulatorAccessRequest,
): RegulatorValidationResult {
  // 1. REGULATOR entity_type required (correctness-hazard guard
  //    per CAR §2.1: GOVERNMENT must NOT pass this check).
  if (entity.entity_type !== "REGULATOR") {
    return { ok: false, reason: "NOT_REGULATOR" };
  }

  // 2. Entity must be ACTIVE.
  if (entity.status !== "ACTIVE") {
    return { ok: false, reason: "ENTITY_NOT_ACTIVE" };
  }

  // 3. TAR must exist and credentialing authority must be recorded.
  if (!entity.tar) {
    return { ok: false, reason: "MISSING_CREDENTIALING" };
  }
  if (!entity.tar.regulator_credentialed_by) {
    return { ok: false, reason: "MISSING_CREDENTIALING" };
  }

  // 4. Invoked jurisdiction must appear in the regulator's
  //    credentialed jurisdictions.
  if (
    !entity.tar.regulator_jurisdiction.includes(request.jurisdiction_invoked)
  ) {
    return { ok: false, reason: "JURISDICTION_NOT_AUTHORIZED" };
  }

  // 5. Requested authority scope must appear in the regulator's
  //    credentialed scopes.
  if (!entity.tar.regulator_authority_scope.includes(request.authority_scope)) {
    return { ok: false, reason: "SCOPE_NOT_AUTHORIZED" };
  }

  return { ok: true };
}

// WHAT: Fetch a REGULATOR entity (joined with TAR) by entity_id.
//        Returns null if the entity does not exist OR if its
//        entity_type is not REGULATOR.
// INPUT: entity_id string (UUID).
// OUTPUT: The Entity + TAR record, or null.
// WHY: Caller-friendly substrate-honest fetch: a non-REGULATOR
//      entity_id is rejected at the lookup boundary rather than at
//      validateRegulatorAccess (which would also reject it via
//      NOT_REGULATOR; this lookup short-circuits earlier and avoids
//      surfacing a non-REGULATOR entity to regulator-grant code
//      paths).
export async function getRegulatorEntityById(
  entity_id: string,
): Promise<EntityWithTar | null> {
  const entity = await prisma.entity.findUnique({
    where: { entity_id },
    include: { tar: true },
  });
  if (!entity) {
    return null;
  }
  // Type guard: entity_type satisfies EntityType union; REGULATOR
  // is one of those values per sub-phase 2 [SUB-BOX-3-SCHEMA].
  if ((entity.entity_type as EntityType) !== "REGULATOR") {
    return null;
  }
  return entity as EntityWithTar;
}
