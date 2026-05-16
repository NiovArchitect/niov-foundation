// FILE: jurisdiction-enforcement.ts
// PURPOSE: Pure-function jurisdiction-scope enforcement helper for COSMP
//          read / write / share / revoke / negotiate flows. CAR Sub-box 2
//          sub-phase 3 [CAR-SUB-BOX-2-SERVICES] per ADR-0037 Sub-decision
//          6 (assertJurisdictionalScope pure-function design).
//
//          Pure-function discriminated outcome:
//            assertJurisdictionalScope({ actor, target, action, ... })
//              → { ok: true }
//              | { ok: false, code, status, ... }
//
//          Caller responsibilities:
//            1. Pre-fetch the actor Entity (with jurisdiction) BEFORE
//               calling this helper — existing service convention is
//               getEntityById(session.entity_id) per
//               negotiate.service.ts:183.
//            2. Pre-fetch the target Entity OR target MemoryCapsule
//               (with jurisdiction) BEFORE calling — readMetadata /
//               readContent / share already fetch the target row.
//            3. For REGULATOR-actor flows (sub-phase 5 of CAR Sub-box
//               2 wiring), pass the validated LawfulBasis.jurisdiction_invoked
//               via regulator_lawful_basis_jurisdiction so the helper
//               can enforce the third jurisdiction-tier check per
//               ADR-0037 Sub-decision 8 (lawful-basis-jurisdiction
//               must match capsule-jurisdiction).
//
// CONNECTS TO:
//   - apps/api/src/services/cosmp/regulator-enforcement.ts
//     (sibling helper; same pure-function discriminated-outcome pattern;
//     6 BEAM-compatibility patterns from ADR-0026 §5 inheritance)
//   - apps/api/src/services/cosmp/negotiate.service.ts +
//     read.service.ts + share.service.ts (sub-phase 4 of CAR Sub-box 2
//     [COSMP-ENFORCEMENT] wires this helper into NEGOTIATE start-check
//     + readContent TOCTOU re-check + SHARE start-check + REVOKE
//     start-check)
//   - packages/database/src/queries/regulator.ts +
//     packages/database/src/queries/lawful-basis.ts (REGULATOR
//     integration substrate at sub-phase 5 of CAR Sub-box 2 register
//     substantively; this helper composes WITH (NOT replaces)
//     existing regulator-enforcement.ts substrate from Sub-box 3
//     sub-phase 6)
//
// Whole-COSMP scalability discipline canonical at substantive register
// substantively (per Sub-phase 6 of Sub-box 3 §18 Whole-COSMP
// scalability and orchestration alignment + the 6 BEAM-compatibility
// patterns from ADR-0026 §5):
//   - Pure function over already-fetched inputs; NO DB reads (caller
//     pre-fetches actor + target rows via existing getEntityById /
//     getCapsuleMetadata flows)
//   - NO global lock; NO advisory lock; NO shared mutable state
//   - NO capsule content read for authorization (helper operates on
//     row metadata only — capsule.jurisdiction is row column not
//     payload)
//   - NO cross-request cache (helper is stateless; revocation /
//     jurisdiction-change propagates immediately at next call site)
//   - Pure-function discriminated outcome → portable to a future
//     Elixir Broadway pipeline per ADR-0028 forward-substrate
//   - Many parallel REGULATOR / non-REGULATOR DMW workers can invoke
//     this helper concurrently without contention
//   - NO mutation of inputs; helper is referentially transparent
//
// Sub-phase 3 of CAR Sub-box 2 substantively bounded scope (per
// Q-NEW-1 + Q-NEW-2 + Q-NEW-3 + Q-NEW-4 + Q-NEW-5 + Q-NEW-6 LOCKED
// canonical at substantive register substantively):
//   - null/null actor + target ALLOWED per Q-NEW-4 LOCKED Option α
//     (backward-compat during rollout; existing entities + capsules
//     pre-Sub-box-2 have NULL jurisdiction; strict mode would break
//     491/491 substrate at substantive register substantively)
//   - actor non-null + target null DENIED per Q-NEW-5 LOCKED Option α
//     (substrate-honest at substantive register substantively;
//     prevents privilege escalation by tagged actor accessing
//     untagged data with tagged authority)
//   - capsule.jurisdiction TAKES PRECEDENCE over target.entity.jurisdiction
//     when both supplied (capsule is the more specific data-tier
//     anchor; per operator-LOCKED implementation requirement at
//     sub-phase 3 §1)
//   - GLOBAL wildcard NOT IMPLEMENTED per Q-NEW-6 LOCKED Option α
//     (forward-queued per ADR-0037 §Forward Queue; exact equality only)
//   - regulator_lawful_basis_jurisdiction OPTIONAL parameter per
//     ADR-0037 Sub-decision 8 — sub-phase 5 of CAR Sub-box 2 wires
//     the regulator-context branch at regulator-enforcement.ts
//     register substantively; sub-phase 3 substrate stays
//     REGULATOR-actor-aware via the optional parameter

// WHAT: Enumerated public error codes per ADR-0037 Sub-decision 6 +
//        operator-LOCKED §11 error taxonomy at sub-phase 3 register
//        substantively.
// INPUT: Used as a value type only.
// OUTPUT: None — this is a type, not a value.
// WHY: Type-narrowed so consumer COSMP services and route-tier
//      statusForCode mapping at sub-phase 4 of CAR Sub-box 2 register
//      substantively agree on the literal set canonical at
//      substantive register substantively.
export type JurisdictionScopeCode =
  | "ACTOR_JURISDICTION_MISSING"
  | "TARGET_JURISDICTION_MISSING"
  | "CROSS_JURISDICTION_ACCESS_DENIED"
  | "JURISDICTION_NOT_AUTHORIZED";

// WHAT: HTTP status code the enforcement helper maps to. Routes use
//        this to propagate the denial to the client at sub-phase 4 of
//        CAR Sub-box 2 register substantively.
// INPUT: Used as a value type only.
// OUTPUT: None — this is a type, not a value.
// WHY: All jurisdiction-scope failures map to 403 (caller's
//      authorization is structurally insufficient at the jurisdiction
//      register; substrate-coherent with sub-phase 6 of Sub-box 3
//      regulator-enforcement.ts pattern at substantive register
//      substantively).
export type JurisdictionScopeStatus = 403;

// WHAT: The discriminated outcome of assertJurisdictionalScope.
// INPUT: Used as a value type only.
// OUTPUT: None — this is a type, not a value.
// WHY: Caller branches on { ok: true } to proceed with COSMP
//      semantics, OR on { ok: false } to deny + emit DENIED audit
//      event with the canonical code as denial_reason. Optional
//      actor_jurisdiction + target_jurisdiction fields surface the
//      jurisdictional anchors observed at the deny site for audit
//      attribution at sub-phase 4 wiring register substantively.
export type JurisdictionScopeResult =
  | { ok: true }
  | {
      ok: false;
      code: JurisdictionScopeCode;
      status: JurisdictionScopeStatus;
      actor_jurisdiction?: string | null;
      target_jurisdiction?: string | null;
    };

// WHAT: Action discriminator — which COSMP operation is being
//        authorized. Carried for audit + future per-operation policy
//        differentiation; the sub-phase 3 helper does NOT branch on
//        action at substantive register substantively (jurisdiction
//        check is uniform across READ / WRITE / SHARE / REVOKE /
//        NEGOTIATE).
// INPUT: Used as a value type only.
// OUTPUT: None — this is a type, not a value.
// WHY: Forward-compat: sub-phase 4+ may add per-operation jurisdiction
//      policy (e.g., WRITE requires stricter jurisdiction match than
//      READ); the action parameter is the carrier substrate.
export type JurisdictionScopeAction =
  | "NEGOTIATE"
  | "READ"
  | "WRITE"
  | "SHARE"
  | "REVOKE";

// WHAT: Structural input shape — the caller has already pre-fetched
//        actor Entity (with jurisdiction) + target Entity OR target
//        MemoryCapsule (with jurisdiction).
// INPUT: Used as a parameter type only.
// OUTPUT: None — this is a type, not a value.
// WHY: Decouples this helper from session/auth/DB concerns; the
//      helper operates on the already-resolved actor + target
//      jurisdiction context per Sub-phase 6 of Sub-box 3 §18
//      Whole-COSMP scalability discipline canonical at substantive
//      register substantively (no DB reads at enforcement helper).
export interface AssertJurisdictionalScopeInput {
  actor: {
    entity_id: string;
    jurisdiction: string | null;
  };
  target: {
    entity?: {
      entity_id: string;
      jurisdiction: string | null;
    } | null;
    capsule?: {
      capsule_id: string;
      jurisdiction: string | null;
    } | null;
  };
  action: JurisdictionScopeAction;
  // CAR Sub-box 2 sub-phase 5 [CAR-SUB-BOX-2-REGULATOR-INTEGRATION]
  // wiring per ADR-0037 Sub-decision 8: REGULATOR access requires
  // LawfulBasis.jurisdiction_invoked === MemoryCapsule.jurisdiction.
  // Sub-phase 3 lands the OPTIONAL parameter; sub-phase 5 wires it
  // from regulator-enforcement.ts after enforceRegulatorCOSMPAccess
  // validates the lawful basis. When supplied, this value is matched
  // against target.capsule.jurisdiction (capsule-tier anchor; falls
  // back to target.entity.jurisdiction if no capsule supplied).
  regulator_lawful_basis_jurisdiction?: string | null;
}

// WHAT: Resolve the effective target jurisdiction, preferring capsule-
//        tier anchor over entity-tier anchor when both are supplied.
// INPUT: AssertJurisdictionalScopeInput.target.
// OUTPUT: { jurisdiction: string | null, has_target: boolean }.
// WHY: Per operator-LOCKED implementation requirement at sub-phase 3
//      §1 (capsule jurisdiction takes precedence over entity
//      jurisdiction): capsule is the more specific data-tier anchor
//      canonical at substantive register substantively. has_target
//      distinguishes "no target supplied" (caller bug; defensive)
//      from "target supplied with null jurisdiction" (legitimate
//      backward-compat case per Q-NEW-4 LOCKED Option α).
function resolveTargetJurisdiction(
  target: AssertJurisdictionalScopeInput["target"],
): { jurisdiction: string | null; has_target: boolean } {
  // Capsule takes precedence over entity per Q-NEW + operator
  // implementation requirement at sub-phase 3 §1.
  if (target.capsule !== null && target.capsule !== undefined) {
    return {
      jurisdiction: target.capsule.jurisdiction,
      has_target: true,
    };
  }
  if (target.entity !== null && target.entity !== undefined) {
    return {
      jurisdiction: target.entity.jurisdiction,
      has_target: true,
    };
  }
  return { jurisdiction: null, has_target: false };
}

// WHAT: The COSMP enforcement entry point for jurisdiction-scope
//        checks. Pure-function discriminated outcome; no side effects
//        (no audit emission, no DB write, no logger.* call); does NOT
//        mutate inputs. The caller owns side effects per its own
//        service-tier audit conventions (mirrors sub-phase 6 of
//        Sub-box 3 enforceRegulatorCOSMPAccess pattern at substantive
//        register substantively).
// INPUT: AssertJurisdictionalScopeInput (actor pre-fetched; target
//        pre-fetched; action carried; optional regulator-lawful-basis-
//        jurisdiction for sub-phase 5 wiring).
// OUTPUT: JurisdictionScopeResult discriminated union.
// WHY: Single shared jurisdiction-scope enforcement substrate
//      consumed by NEGOTIATE + readContent + SHARE + REVOKE at
//      sub-phase 4 of CAR Sub-box 2 register substantively; +
//      composed with regulator enforcement at sub-phase 5 register
//      substantively. NO DB reads; NO global lock; NO scans; NO
//      capsule content read for authorization per Sub-phase 6 of
//      Sub-box 3 §18 Whole-COSMP scalability discipline canonical
//      at substantive register substantively.
export function assertJurisdictionalScope(
  input: AssertJurisdictionalScopeInput,
): JurisdictionScopeResult {
  const actorJurisdiction = input.actor.jurisdiction;
  const { jurisdiction: targetJurisdiction, has_target: hasTarget } =
    resolveTargetJurisdiction(input.target);

  // Defensive: if no target supplied at all (neither entity nor
  // capsule), the caller has a bug. Treat as TARGET_JURISDICTION_MISSING
  // — substrate-honest at substantive register substantively (cannot
  // authorize access to no target).
  if (!hasTarget) {
    return {
      ok: false,
      code: "TARGET_JURISDICTION_MISSING",
      status: 403,
      actor_jurisdiction: actorJurisdiction,
      target_jurisdiction: null,
    };
  }

  // Q-NEW-4 LOCKED Option α: null/null ALLOWED for backward-compat
  // during rollout (existing entities + capsules pre-Sub-box-2 have
  // NULL jurisdiction; strict mode would break 491/491 substrate
  // canonical at substantive register substantively).
  if (actorJurisdiction === null && targetJurisdiction === null) {
    // Even at null/null, run the regulator-lawful-basis check if
    // the caller supplied it — a regulator presenting a lawful basis
    // implicitly claims a non-null jurisdiction context that must
    // match the (null) target. This branch substantively never
    // observes a regulator with non-null lawful_basis_jurisdiction
    // accessing a null-jurisdiction capsule (that case falls into
    // the JURISDICTION_NOT_AUTHORIZED branch below).
    if (
      input.regulator_lawful_basis_jurisdiction !== undefined &&
      input.regulator_lawful_basis_jurisdiction !== null
    ) {
      return {
        ok: false,
        code: "JURISDICTION_NOT_AUTHORIZED",
        status: 403,
        actor_jurisdiction: actorJurisdiction,
        target_jurisdiction: targetJurisdiction,
      };
    }
    return { ok: true };
  }

  // Q-NEW-5 LOCKED Option α: actor non-null + target null DENIED
  // with TARGET_JURISDICTION_MISSING (substrate-honest at substantive
  // register substantively; tagged actor accessing untagged data
  // creates jurisdictional coverage gap).
  if (actorJurisdiction !== null && targetJurisdiction === null) {
    return {
      ok: false,
      code: "TARGET_JURISDICTION_MISSING",
      status: 403,
      actor_jurisdiction: actorJurisdiction,
      target_jurisdiction: targetJurisdiction,
    };
  }

  // Inverse case: actor null + target non-null DENIED with
  // ACTOR_JURISDICTION_MISSING (substrate-honest at substantive
  // register substantively; untagged actor accessing tagged data
  // is privilege-escalation risk).
  if (actorJurisdiction === null && targetJurisdiction !== null) {
    return {
      ok: false,
      code: "ACTOR_JURISDICTION_MISSING",
      status: 403,
      actor_jurisdiction: actorJurisdiction,
      target_jurisdiction: targetJurisdiction,
    };
  }

  // Both non-null: exact-equality match (Q-NEW-6 LOCKED Option α
  // GLOBAL wildcard NOT implemented at sub-phase 3 register
  // substantively; substrate-coherent at single-anchor register
  // substantively per ADR-0037 Sub-decision 1).
  if (actorJurisdiction !== targetJurisdiction) {
    return {
      ok: false,
      code: "CROSS_JURISDICTION_ACCESS_DENIED",
      status: 403,
      actor_jurisdiction: actorJurisdiction,
      target_jurisdiction: targetJurisdiction,
    };
  }

  // Actor + target jurisdictions match. If the caller supplied a
  // regulator_lawful_basis_jurisdiction (sub-phase 5 wiring), it
  // must ALSO match the target jurisdiction per ADR-0037 Sub-decision
  // 8. This is the third jurisdiction-tier check that augments —
  // does NOT replace — the sub-phase 6 of Sub-box 3
  // TAR.regulator_jurisdiction substrate canonical at substantive
  // register substantively.
  if (
    input.regulator_lawful_basis_jurisdiction !== undefined &&
    input.regulator_lawful_basis_jurisdiction !== null &&
    input.regulator_lawful_basis_jurisdiction !== targetJurisdiction
  ) {
    return {
      ok: false,
      code: "JURISDICTION_NOT_AUTHORIZED",
      status: 403,
      actor_jurisdiction: actorJurisdiction,
      target_jurisdiction: targetJurisdiction,
    };
  }

  return { ok: true };
}
