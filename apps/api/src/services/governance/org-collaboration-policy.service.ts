// FILE: org-collaboration-policy.service.ts
// PURPOSE: Phase 2 PR 1 — admin/org collaboration permission
//          policy substrate per the [FOUNDER-AUTH — CONTINUE AFTER
//          EDX-3/4/5/6 / AUTONOMOUS ENTERPRISE COLLABORATION
//          COMPLETION] directive. The layer that prevents employee-
//          granted authority from becoming an unnecessary blocker
//          for safe internal collaboration:
//
//          - evaluateOrgCollaborationPolicy — closed-vocab
//            outcome lookup with sensible defaults baked in.
//          - upsertOrgCollaborationPolicy — admin-tier policy
//            management.
//          - listOrgCollaborationPolicies — admin-tier list.
//
//          Pure-function service at this slice — admin routes land
//          at PR 3, collaboration-create integration lands at PR 2.
//
// RULE PRECEDENCE (enforced at the service tier):
//   1. Admin/org policy defines the allowed operating envelope.
//   2. Employee grants act inside that envelope.
//   3. DMW scope defines what memory may be used.
//   4. Action runtime/policy decides material execution.
//   5. Audit records lineage.
// Employee authority CANNOT exceed admin/org policy.
// Org policy CANNOT override an employee's own revocation.
//
// CONNECTS TO:
//   - packages/database (prisma.orgCollaborationPolicy)
//   - packages/database/src/queries/audit.ts (ADMIN_ACTION +
//     details.action discriminator — no new top-level audit
//     literal at this slice)
//   - apps/api/src/services/otzar/twin-collaboration.service.ts
//     (forward-substrate at Phase 2 PR 2 — collaboration-create
//     integration)

import { writeAuditEvent } from "@niov/database";
import type {
  OrgCollaborationOutcome,
  OrgCollaborationScope,
  TwinAuthoritySensitivityClass,
  TwinCollaborationRequestType,
} from "@prisma/client";
import { prisma } from "@niov/database";

export type {
  OrgCollaborationOutcome,
  OrgCollaborationScope,
};

// WHAT: Inputs for evaluateOrgCollaborationPolicy.
// WHY: scope is the only required input; request_type +
//      sensitivity_class let more-specific rows override the org
//      default. connector_write_attempt is a separate boolean so
//      the connector-write gate fires regardless of any allow rule
//      (RULE: connector writes stay Founder-gated per ADR-0084).
export interface EvaluateOrgCollaborationPolicyInput {
  orgEntityId: string;
  scope: OrgCollaborationScope;
  requestType?: TwinCollaborationRequestType;
  sensitivityClass?: TwinAuthoritySensitivityClass;
  connectorWriteAttempt?: boolean;
}

// WHAT: Result of evaluation.
// WHY: outcome is the closed-vocab decision. reason_code names the
//      gate that fired so collaboration-create can persist the
//      blocked_reason or NEEDS_APPROVAL semantic. Always populated
//      so consumers can switch on it.
export type EvaluationReasonCode =
  | "ORG_DEFAULT_ALLOW"
  | "ORG_DEFAULT_NEEDS_APPROVAL"
  | "POLICY_ROW_MATCH"
  | "SENSITIVE_DOMAIN_DUAL_CONTROL"
  | "CONNECTOR_WRITE_NOT_AUTHORIZED";

export interface OrgCollaborationPolicyEvaluation {
  outcome: OrgCollaborationOutcome;
  reason_code: EvaluationReasonCode;
  requires_employee_authority: boolean;
  requires_admin_approval: boolean;
  requires_dual_control: boolean;
}

// WHAT: Sensitivity classes that default to DUAL_CONTROL_REQUIRED
//        regardless of any per-scope policy row. Reflects directive
//        defaults — "legal/financial/security/customer-sensitive
//        default NEEDS_APPROVAL or DUAL_CONTROL_REQUIRED".
const DUAL_CONTROL_SENSITIVE_CLASSES: ReadonlyArray<TwinAuthoritySensitivityClass> = [
  "LEGAL",
  "FINANCIAL",
  "SECURITY",
  "CUSTOMER_SENSITIVE",
  "REGULATED",
];

// WHAT: Default outcome per scope when no policy row exists.
// WHY: Mirrors the directive defaults — SAME_* allow safe internal
//      collaboration; CROSS_* default to NEEDS_APPROVAL; ORG_WIDE
//      defaults to NEEDS_APPROVAL.
function defaultOutcomeForScope(
  scope: OrgCollaborationScope,
): OrgCollaborationOutcome {
  switch (scope) {
    case "SAME_TEAM":
    case "SAME_PROJECT":
      return "ALLOW";
    case "CROSS_TEAM":
    case "CROSS_PROJECT":
      return "NEEDS_APPROVAL";
    case "ORG_WIDE":
      return "NEEDS_APPROVAL";
  }
}

function defaultReasonForOutcome(
  outcome: OrgCollaborationOutcome,
): EvaluationReasonCode {
  switch (outcome) {
    case "ALLOW":
      return "ORG_DEFAULT_ALLOW";
    case "NEEDS_APPROVAL":
    case "BLOCK":
    case "DRAFT_ONLY":
    case "DUAL_CONTROL_REQUIRED":
      return "ORG_DEFAULT_NEEDS_APPROVAL";
  }
}

// WHAT: Evaluate the org collaboration policy for a request.
// INPUT: EvaluateOrgCollaborationPolicyInput.
// OUTPUT: OrgCollaborationPolicyEvaluation.
// WHY: Lookup order:
//        1. Connector-write gate. If connector_write_attempt = true
//           AND no row explicitly enables connector_write_allowed
//           for the (scope, request_type, sensitivity) tuple, block
//           — Founder-gated per ADR-0084 regardless of any other
//           allow rule.
//        2. Sensitive-domain gate. If sensitivity ∈ {LEGAL /
//           FINANCIAL / SECURITY / CUSTOMER_SENSITIVE / REGULATED}
//           and no policy row says BLOCK, return
//           DUAL_CONTROL_REQUIRED.
//        3. Specific policy row match (scope + request_type +
//           sensitivity). Reason POLICY_ROW_MATCH.
//        4. Scope-only policy row match. Reason POLICY_ROW_MATCH.
//        5. Scope default. Reason ORG_DEFAULT_*.
export async function evaluateOrgCollaborationPolicy(
  input: EvaluateOrgCollaborationPolicyInput,
): Promise<OrgCollaborationPolicyEvaluation> {
  // Pre-fetch all candidate rows in one query — the matrix is
  // small (max 5 scopes × 10 request_types × ~5 sensitivities = 250
  // theoretical rows per org; production rows typical << 50).
  const candidates = await prisma.orgCollaborationPolicy.findMany({
    where: {
      org_entity_id: input.orgEntityId,
      collaboration_scope: input.scope,
    },
  });

  // Step 1 — connector-write gate. Founder-gated per ADR-0084.
  if (input.connectorWriteAttempt === true) {
    const explicitlyAllowed = candidates.find(
      (c) =>
        c.connector_write_allowed === true &&
        (c.request_type === null ||
          c.request_type === input.requestType) &&
        (c.sensitivity_class === null ||
          c.sensitivity_class === input.sensitivityClass),
    );
    if (explicitlyAllowed === undefined) {
      return {
        outcome: "BLOCK",
        reason_code: "CONNECTOR_WRITE_NOT_AUTHORIZED",
        requires_employee_authority: false,
        requires_admin_approval: false,
        requires_dual_control: false,
      };
    }
  }

  // Step 2 — sensitive-domain DUAL_CONTROL gate. Override unless
  // a row explicitly returns BLOCK (which we honor as an even-
  // stronger restriction).
  if (
    input.sensitivityClass !== undefined &&
    (DUAL_CONTROL_SENSITIVE_CLASSES as ReadonlyArray<string>).includes(
      input.sensitivityClass,
    )
  ) {
    const blockingRow = candidates.find(
      (c) =>
        c.outcome === "BLOCK" &&
        (c.request_type === null ||
          c.request_type === input.requestType) &&
        (c.sensitivity_class === null ||
          c.sensitivity_class === input.sensitivityClass),
    );
    if (blockingRow !== undefined) {
      return {
        outcome: "BLOCK",
        reason_code: "POLICY_ROW_MATCH",
        requires_employee_authority: blockingRow.requires_employee_authority,
        requires_admin_approval: blockingRow.requires_admin_approval,
        requires_dual_control: blockingRow.requires_dual_control,
      };
    }
    return {
      outcome: "DUAL_CONTROL_REQUIRED",
      reason_code: "SENSITIVE_DOMAIN_DUAL_CONTROL",
      requires_employee_authority: false,
      requires_admin_approval: true,
      requires_dual_control: true,
    };
  }

  // Step 3 — specific (request_type + sensitivity) row.
  const specific = candidates.find(
    (c) =>
      c.request_type === (input.requestType ?? null) &&
      c.sensitivity_class === (input.sensitivityClass ?? null),
  );
  if (specific !== undefined) {
    return {
      outcome: specific.outcome,
      reason_code: "POLICY_ROW_MATCH",
      requires_employee_authority: specific.requires_employee_authority,
      requires_admin_approval: specific.requires_admin_approval,
      requires_dual_control: specific.requires_dual_control,
    };
  }

  // Step 4 — scope-only (request_type=null + sensitivity=null) row.
  const scopeOnly = candidates.find(
    (c) => c.request_type === null && c.sensitivity_class === null,
  );
  if (scopeOnly !== undefined) {
    return {
      outcome: scopeOnly.outcome,
      reason_code: "POLICY_ROW_MATCH",
      requires_employee_authority: scopeOnly.requires_employee_authority,
      requires_admin_approval: scopeOnly.requires_admin_approval,
      requires_dual_control: scopeOnly.requires_dual_control,
    };
  }

  // Step 5 — scope default.
  const outcome = defaultOutcomeForScope(input.scope);
  return {
    outcome,
    reason_code: defaultReasonForOutcome(outcome),
    requires_employee_authority: outcome === "NEEDS_APPROVAL" ? false : false,
    requires_admin_approval: outcome === "NEEDS_APPROVAL",
    requires_dual_control: false,
  };
}

// WHAT: Inputs for upsertOrgCollaborationPolicy.
export interface UpsertOrgCollaborationPolicyInput {
  callerEntityId: string;
  orgEntityId: string;
  scope: OrgCollaborationScope;
  requestType?: TwinCollaborationRequestType | null;
  sensitivityClass?: TwinAuthoritySensitivityClass | null;
  outcome: OrgCollaborationOutcome;
  requiresEmployeeAuthority?: boolean;
  requiresAdminApproval?: boolean;
  requiresDualControl?: boolean;
  connectorWriteAllowed?: boolean;
}

// WHAT: Safe employee-facing projection of a policy row.
export interface OrgCollaborationPolicySafeView {
  policy_id: string;
  collaboration_scope: OrgCollaborationScope;
  request_type: TwinCollaborationRequestType | null;
  sensitivity_class: TwinAuthoritySensitivityClass | null;
  outcome: OrgCollaborationOutcome;
  requires_employee_authority: boolean;
  requires_admin_approval: boolean;
  requires_dual_control: boolean;
  connector_write_allowed: boolean;
  created_at: string;
}

export function projectOrgCollaborationPolicySafeView(row: {
  policy_id: string;
  collaboration_scope: OrgCollaborationScope;
  request_type: TwinCollaborationRequestType | null;
  sensitivity_class: TwinAuthoritySensitivityClass | null;
  outcome: OrgCollaborationOutcome;
  requires_employee_authority: boolean;
  requires_admin_approval: boolean;
  requires_dual_control: boolean;
  connector_write_allowed: boolean;
  created_at: Date;
}): OrgCollaborationPolicySafeView {
  return {
    policy_id: row.policy_id,
    collaboration_scope: row.collaboration_scope,
    request_type: row.request_type,
    sensitivity_class: row.sensitivity_class,
    outcome: row.outcome,
    requires_employee_authority: row.requires_employee_authority,
    requires_admin_approval: row.requires_admin_approval,
    requires_dual_control: row.requires_dual_control,
    connector_write_allowed: row.connector_write_allowed,
    created_at: row.created_at.toISOString(),
  };
}

// WHAT: Upsert a policy row. Admin-tier helper.
// WHY: Composite unique on (org, scope, request_type, sensitivity)
//      with nullable request_type + sensitivity_class — Prisma's
//      upsert-with-compound-unique rejects null values in the where
//      clause at the type tier, and Postgres unique-on-nullable
//      treats NULL as "not equal" so a literal upsert would never
//      match. Workaround: do a manual findFirst + update / create.
//      Emits ADMIN_ACTION audit BEFORE returning (RULE 4).
export async function upsertOrgCollaborationPolicyForCaller(
  input: UpsertOrgCollaborationPolicyInput,
): Promise<OrgCollaborationPolicySafeView> {
  const existing = await prisma.orgCollaborationPolicy.findFirst({
    where: {
      org_entity_id: input.orgEntityId,
      collaboration_scope: input.scope,
      request_type: input.requestType ?? null,
      sensitivity_class: input.sensitivityClass ?? null,
    },
  });
  let row;
  if (existing !== null) {
    row = await prisma.orgCollaborationPolicy.update({
      where: { policy_id: existing.policy_id },
      data: {
        outcome: input.outcome,
        requires_employee_authority: input.requiresEmployeeAuthority ?? false,
        requires_admin_approval: input.requiresAdminApproval ?? false,
        requires_dual_control: input.requiresDualControl ?? false,
        connector_write_allowed: input.connectorWriteAllowed ?? false,
      },
    });
  } else {
    row = await prisma.orgCollaborationPolicy.create({
      data: {
        org_entity_id: input.orgEntityId,
        collaboration_scope: input.scope,
        request_type: input.requestType ?? null,
        sensitivity_class: input.sensitivityClass ?? null,
        outcome: input.outcome,
        requires_employee_authority: input.requiresEmployeeAuthority ?? false,
        requires_admin_approval: input.requiresAdminApproval ?? false,
        requires_dual_control: input.requiresDualControl ?? false,
        connector_write_allowed: input.connectorWriteAllowed ?? false,
      },
    });
  }
  await writeAuditEvent({
    event_type: "ADMIN_ACTION",
    outcome: "SUCCESS",
    actor_entity_id: input.callerEntityId,
    target_entity_id: input.orgEntityId,
    details: {
      action: "ORG_COLLABORATION_POLICY_UPSERTED",
      policy_id: row.policy_id,
      collaboration_scope: row.collaboration_scope,
      outcome: row.outcome,
      has_request_type: row.request_type !== null,
      has_sensitivity_class: row.sensitivity_class !== null,
    },
  });
  return projectOrgCollaborationPolicySafeView(row);
}

// WHAT: List the org's collaboration policy rows.
export async function listOrgCollaborationPoliciesForOrg(input: {
  orgEntityId: string;
}): Promise<OrgCollaborationPolicySafeView[]> {
  const rows = await prisma.orgCollaborationPolicy.findMany({
    where: { org_entity_id: input.orgEntityId },
    orderBy: { created_at: "asc" },
  });
  return rows.map(projectOrgCollaborationPolicySafeView);
}
