// FILE: scope-grant.service.ts
// PURPOSE: Phase 5 — per-team / per-project / per-role / per-employee
//          / per-Twin scope grants layered on top of a
//          ConnectorBinding (the existing per-org connector
//          connection model). Implements the directive's
//          `ConnectorScopeGrant` substrate.
//
// CONNECTS TO:
//   - packages/database (prisma.connectorScopeGrant)
//   - apps/api/src/services/connector/connector.service.ts
//     (existing ConnectorBinding substrate this layer sits on)
//   - apps/api/src/services/governance/org-collaboration-policy.service.ts
//     (Phase 2 evaluator can be extended to consult these grants
//     for connector writes; not in scope for this PR)
//
// SAFETY POSTURE:
//   - No secret data is read or stored by this service.
//   - Service-tier validation rejects unknown scope_types + empty
//     allowed_operations arrays.
//   - Revocation is soft (revoked_at timestamp) per RULE 10.

import { prisma } from "@niov/database";
import type { ConnectorScopeGrant } from "@prisma/client";

export type ConnectorScopeType =
  | "ORG"
  | "TEAM"
  | "PROJECT"
  | "ROLE"
  | "EMPLOYEE"
  | "TWIN";

export type ConnectorOperationClass =
  | "READ"
  | "DRAFT"
  | "WRITE_REQUEST"
  | "WRITE_EXECUTE";

export interface CreateScopeGrantInput {
  org_entity_id: string;
  connection_id: string;
  scope_type: ConnectorScopeType;
  scope_id?: string | null;
  allowed_operations: ConnectorOperationClass[];
  requires_employee_authority?: boolean;
  requires_admin_approval?: boolean;
  requires_dual_control?: boolean;
  created_by_entity_id: string;
  expires_at?: Date | null;
}

export type CreateScopeGrantResult =
  | { ok: true; grant: ConnectorScopeGrant }
  | { ok: false; code: "INVALID_OPERATIONS" }
  | { ok: false; code: "SCOPE_TYPE_REQUIRES_SCOPE_ID" }
  | { ok: false; code: "WRITE_EXECUTE_REQUIRES_DUAL_CONTROL" };

/**
 * Create a connector scope grant.
 *
 * Enforces:
 * - allowed_operations must be non-empty
 * - non-ORG scope_types require a scope_id
 * - WRITE_EXECUTE requires requires_dual_control: true (the safest
 *   default; the admin UI can opt out only with explicit Founder
 *   authorization, surfaced through a separate route in a later PR)
 */
export async function createConnectorScopeGrant(
  input: CreateScopeGrantInput,
): Promise<CreateScopeGrantResult> {
  if (input.allowed_operations.length === 0) {
    return { ok: false, code: "INVALID_OPERATIONS" };
  }
  if (input.scope_type !== "ORG" && !input.scope_id) {
    return { ok: false, code: "SCOPE_TYPE_REQUIRES_SCOPE_ID" };
  }
  if (
    input.allowed_operations.includes("WRITE_EXECUTE") &&
    input.requires_dual_control !== true
  ) {
    return { ok: false, code: "WRITE_EXECUTE_REQUIRES_DUAL_CONTROL" };
  }

  const grant = await prisma.connectorScopeGrant.create({
    data: {
      org_entity_id: input.org_entity_id,
      connection_id: input.connection_id,
      scope_type: input.scope_type,
      scope_id: input.scope_id ?? null,
      allowed_operations: input.allowed_operations,
      requires_employee_authority: input.requires_employee_authority ?? true,
      requires_admin_approval: input.requires_admin_approval ?? false,
      requires_dual_control: input.requires_dual_control ?? false,
      created_by_entity_id: input.created_by_entity_id,
      expires_at: input.expires_at ?? null,
    },
  });

  return { ok: true, grant };
}

/**
 * List the active (non-revoked) grants for a given org. Optional
 * filter narrows to a single connection_id.
 */
export async function listConnectorScopeGrants(
  orgEntityId: string,
  options: { connection_id?: string } = {},
): Promise<ConnectorScopeGrant[]> {
  const where: {
    org_entity_id: string;
    connection_id?: string;
    revoked_at: null;
  } = {
    org_entity_id: orgEntityId,
    revoked_at: null,
  };
  if (options.connection_id) where.connection_id = options.connection_id;

  return prisma.connectorScopeGrant.findMany({
    where,
    orderBy: { created_at: "desc" },
  });
}

/**
 * Soft-revoke a grant. Idempotent: returning {ok: true} when the row
 * was already revoked. Returns NOT_FOUND when no row matches.
 */
export async function revokeConnectorScopeGrant(
  orgEntityId: string,
  grantId: string,
): Promise<
  | { ok: true; grant: ConnectorScopeGrant }
  | { ok: false; code: "GRANT_NOT_FOUND" }
> {
  const grant = await prisma.connectorScopeGrant.findUnique({
    where: { grant_id: grantId },
  });
  if (grant === null || grant.org_entity_id !== orgEntityId) {
    return { ok: false, code: "GRANT_NOT_FOUND" };
  }
  if (grant.revoked_at !== null) {
    return { ok: true, grant };
  }
  const revoked = await prisma.connectorScopeGrant.update({
    where: { grant_id: grantId },
    data: { revoked_at: new Date() },
  });
  return { ok: true, grant: revoked };
}

/**
 * Pure check: does a candidate (scope_type, scope_id, operation)
 * tuple appear in the supplied list of grants? Returns the first
 * matching grant or null.
 */
export function findMatchingGrant(
  grants: ConnectorScopeGrant[],
  scopeType: ConnectorScopeType,
  scopeId: string | null,
  operation: ConnectorOperationClass,
): ConnectorScopeGrant | null {
  for (const g of grants) {
    if (g.revoked_at !== null) continue;
    if (g.expires_at !== null && g.expires_at.getTime() < Date.now()) continue;
    if (g.scope_type !== scopeType) continue;
    if (g.scope_type !== "ORG" && g.scope_id !== scopeId) continue;
    if (!(g.allowed_operations as string[]).includes(operation)) continue;
    return g;
  }
  return null;
}
