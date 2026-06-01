// FILE: tenant-isolation-guard.ts
// PURPOSE: GOVSEC.7 — pure-function guards against tenant isolation
//          violations. Used at any boundary where an entity is about
//          to act on, propose, or read a row that carries an
//          org_entity_id (or tenant) discriminator:
//
//            - Capsule / Permission / NEGOTIATE read paths where
//              the caller's org must match the capsule's wallet
//              org. The DB queries already enforce this via
//              org-scoped predicates; this guard is defense-in-
//              depth for any call-site that constructs an in-memory
//              capsule object outside the canonical query path.
//
//            - Hive / Team / Department escalation chains where
//              an escalation row must not cross org boundaries.
//              `escalation.service.ts:342-355` already enforces
//              cross-org denial structurally — this guard is
//              composable at any new escalation-handling layer.
//
//            - Department / Hive filter operations where a filter
//              parameter must compose AS-AND with the caller's org
//              scope (per DRIFT 9 + ADR-0006 cross-org-leak
//              prevention via filter narrowing).
//
//          Pure functions. No DB I/O. No audit emission. No HTTP
//          coupling. Callers compose the result into their own
//          audit and error envelopes.
//
//          Closure target: ADR-0049 §GOVSEC.7 — department/hive
//          filtering confirmed (existing substrate at hive.service.ts
//          + escalation.service.ts), cross-org escalation isolation
//          enforced, failed cross-wallet NEGOTIATE denial regression
//          exists. This module is the explicit composable surface
//          future hive-extension + escalation + connector code
//          consumes; structural enforcement at the existing DB +
//          service tier remains authoritative.
// CONNECTS TO: apps/api/src/services/governance/org.ts
//              (getOrgEntityId canonical resolution), apps/api/src/
//              services/governance/escalation.service.ts (cross-org
//              denial precedent at L342-355), packages/database
//              org-scoped predicate pattern (DRIFT 9 anchor).

// ────────────────────────────────────────────────────────────────
// Closed-vocabulary failure codes. Each is a stable string the
// caller can switch on without depending on the Error message
// text. Mirrors agent-abuse-guard.ts shape.
// ────────────────────────────────────────────────────────────────
export type TenantIsolationFailureCode =
  | "CALLER_ORG_MISMATCH_CAPSULE"
  | "CALLER_ORG_MISMATCH_HIVE"
  | "CROSS_ORG_ESCALATION_FORBIDDEN"
  | "DEPARTMENT_FILTER_OUT_OF_ORG_SCOPE"
  | "ORPHAN_CALLER_NO_ORG"
  | "ORPHAN_RESOURCE_NO_ORG";

// ────────────────────────────────────────────────────────────────
// Pure value types. Importers pass the smallest viable shape so
// the helpers stay decoupled from Prisma model shapes.
// ────────────────────────────────────────────────────────────────
export interface CallerOrgContext {
  entity_id: string;
  org_id: string | null;
}

export interface CapsuleOrgContext {
  capsule_id: string;
  wallet_org_id: string | null;
}

export interface HiveOrgContext {
  hive_id: string;
  org_id: string | null;
}

export interface EscalationTargetContext {
  escalation_id: string;
  source_org_id: string | null;
  target_org_id: string | null;
}

export interface DepartmentFilterContext {
  /** The filter parameter the caller proposed. */
  proposed_department_id: string;
  /** The caller's org-scoped predicate (must AND with the filter). */
  caller_org_id: string | null;
  /** The department's resolved org_id, if known. Null means unknown. */
  department_resolved_org_id: string | null;
}

// ────────────────────────────────────────────────────────────────
// Discriminated-union result. Callers can `if (!result.ok)` and
// reach `result.code` + `result.reason` without text parsing.
// ────────────────────────────────────────────────────────────────
export type TenantIsolationGuardResult =
  | { ok: true }
  | { ok: false; code: TenantIsolationFailureCode; reason: string };

const OK: TenantIsolationGuardResult = { ok: true };
function deny(
  code: TenantIsolationFailureCode,
  reason: string,
): TenantIsolationGuardResult {
  return { ok: false, code, reason };
}

// ────────────────────────────────────────────────────────────────
// 1. Capsule-read / Permission-read tenant boundary.
//    The structural path in packages/database/src/queries/capsule.ts
//    + permission.ts already filters by wallet org. This guard
//    is defense-in-depth for any future call-site that constructs
//    a capsule view from an in-memory shape (e.g. cross-module
//    in-process projection) and must re-assert the boundary.
// ────────────────────────────────────────────────────────────────
export function assertSameOrgForCapsule(
  caller: CallerOrgContext,
  capsule: CapsuleOrgContext,
): TenantIsolationGuardResult {
  if (caller.org_id === null) {
    return deny(
      "ORPHAN_CALLER_NO_ORG",
      "caller has no org_id and cannot reach an org-scoped capsule",
    );
  }
  if (capsule.wallet_org_id === null) {
    return deny(
      "ORPHAN_RESOURCE_NO_ORG",
      "capsule wallet has no org_id and cannot be read inside an org boundary",
    );
  }
  if (caller.org_id !== capsule.wallet_org_id) {
    return deny(
      "CALLER_ORG_MISMATCH_CAPSULE",
      "caller org does not match capsule wallet org — cross-tenant read denied",
    );
  }
  return OK;
}

// ────────────────────────────────────────────────────────────────
// 2. Hive / Team boundary.
//    Hives are tenant-scoped by construction at
//    apps/api/src/services/hive/hive.service.ts. This guard is
//    defense-in-depth for any new hive-extension code path that
//    proposes a hive membership or read against a hive_id that
//    might not belong to the caller's org.
// ────────────────────────────────────────────────────────────────
export function assertSameOrgForHive(
  caller: CallerOrgContext,
  hive: HiveOrgContext,
): TenantIsolationGuardResult {
  if (caller.org_id === null) {
    return deny(
      "ORPHAN_CALLER_NO_ORG",
      "caller has no org_id and cannot reach an org-scoped hive",
    );
  }
  if (hive.org_id === null) {
    return deny(
      "ORPHAN_RESOURCE_NO_ORG",
      "hive has no org_id and cannot be read inside an org boundary",
    );
  }
  if (caller.org_id !== hive.org_id) {
    return deny(
      "CALLER_ORG_MISMATCH_HIVE",
      "caller org does not match hive org — cross-tenant hive access denied",
    );
  }
  return OK;
}

// ────────────────────────────────────────────────────────────────
// 3. Cross-org escalation denial.
//    `escalation.service.ts:342-355` already enforces this
//    structurally for class-A and class-B escalations; this guard
//    re-asserts the invariant at any future escalation surface
//    (e.g. a future workflow-escalation handler at ADR-0081
//    Stage 4+ that may compose an escalation row from a workflow
//    purpose binding outside the canonical escalation path).
//    Both org IDs MUST be present and equal.
// ────────────────────────────────────────────────────────────────
export function assertNoCrossOrgEscalation(
  escalation: EscalationTargetContext,
): TenantIsolationGuardResult {
  if (escalation.source_org_id === null) {
    return deny(
      "ORPHAN_RESOURCE_NO_ORG",
      "escalation source has no org_id",
    );
  }
  if (escalation.target_org_id === null) {
    return deny(
      "ORPHAN_RESOURCE_NO_ORG",
      "escalation target has no org_id",
    );
  }
  if (escalation.source_org_id !== escalation.target_org_id) {
    return deny(
      "CROSS_ORG_ESCALATION_FORBIDDEN",
      "escalation source and target orgs differ — cross-org escalation forbidden",
    );
  }
  return OK;
}

// ────────────────────────────────────────────────────────────────
// 4. Department filter narrowing.
//    Per DRIFT 9 + ADR-0006: any filter parameter on an org-scoped
//    list must compose AS-AND with the caller's org-scope
//    predicate; never replace it. This guard is the explicit
//    composable check for any future hive-/department-filtered
//    list endpoint that takes a department_id parameter.
//
//    Three failure modes:
//    1. Caller has no org_id (orphan)
//    2. Department resolves to a different org than the caller
//    3. Department's resolved_org_id is unknown — treated as
//       deny-by-default so a future write to the column cannot
//       silently widen the boundary
// ────────────────────────────────────────────────────────────────
export function assertDepartmentFilterAndOrgScope(
  filter: DepartmentFilterContext,
): TenantIsolationGuardResult {
  if (filter.caller_org_id === null) {
    return deny(
      "ORPHAN_CALLER_NO_ORG",
      "caller has no org_id; cannot apply department filter inside an org boundary",
    );
  }
  if (filter.department_resolved_org_id === null) {
    return deny(
      "DEPARTMENT_FILTER_OUT_OF_ORG_SCOPE",
      "department org_id unknown — deny-by-default until department row is resolved",
    );
  }
  if (filter.caller_org_id !== filter.department_resolved_org_id) {
    return deny(
      "DEPARTMENT_FILTER_OUT_OF_ORG_SCOPE",
      "department belongs to a different org than the caller — cross-tenant filter denied",
    );
  }
  return OK;
}
