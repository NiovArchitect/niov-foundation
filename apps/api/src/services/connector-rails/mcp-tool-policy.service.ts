// FILE: mcp-tool-policy.service.ts
// PURPOSE: Phase 5 — per-tool policy on top of an
//          McpServerConnection. Each policy row specifies what an
//          AI Twin is allowed to do with a single MCP tool.
//
// CONNECTS TO:
//   - packages/database (prisma.mcpToolPolicy)
//   - apps/api/src/services/connector-rails/mcp-server.service.ts
//   - apps/api/src/services/governance/org-collaboration-policy.service.ts
//     (the org policy evaluator is the broader sibling; this policy
//     resolves PER-TOOL, the org policy resolves PER-COLLABORATION-TYPE)
//
// SAFETY POSTURE:
//   - outcome is closed-vocab (ALLOW / NEEDS_APPROVAL / BLOCK /
//     DRAFT_ONLY / DUAL_CONTROL_REQUIRED).
//   - operation_class is closed-vocab (READ / WRITE / MUTATION /
//     EXTERNAL_SEND / FINANCIAL / LEGAL / SECURITY /
//     CUSTOMER_SENSITIVE).
//   - Per RULE 0: defaults err on the side of NEEDS_APPROVAL +
//     requires_employee_authority + requires_dmw_scope so a misconfig
//     does not grant unintended access.

import { prisma } from "@niov/database";
import type {
  McpToolPolicy,
  McpOperationClass,
  McpPolicyOutcome,
} from "@prisma/client";

export interface CreateMcpToolPolicyInput {
  org_entity_id: string;
  mcp_connection_id: string;
  tool_name: string;
  operation_class: McpOperationClass;
  outcome?: McpPolicyOutcome;
  requires_employee_authority?: boolean;
  requires_dmw_scope?: boolean;
  requires_admin_approval?: boolean;
  redaction_policy?: string | null;
  output_retention_policy?: string | null;
  created_by_entity_id: string;
}

export type CreateMcpToolPolicyResult =
  | { ok: true; policy: McpToolPolicy }
  | { ok: false; code: "MCP_CONNECTION_NOT_FOUND" }
  | { ok: false; code: "POLICY_ALREADY_EXISTS" }
  | { ok: false; code: "INVALID_TOOL_NAME" };

const TOOL_NAME_REGEX = /^[a-z0-9_.-]{1,120}$/i;

export async function createMcpToolPolicy(
  input: CreateMcpToolPolicyInput,
): Promise<CreateMcpToolPolicyResult> {
  if (!TOOL_NAME_REGEX.test(input.tool_name)) {
    return { ok: false, code: "INVALID_TOOL_NAME" };
  }

  const conn = await prisma.mcpServerConnection.findUnique({
    where: { mcp_connection_id: input.mcp_connection_id },
  });
  if (conn === null || conn.org_entity_id !== input.org_entity_id) {
    return { ok: false, code: "MCP_CONNECTION_NOT_FOUND" };
  }

  try {
    const policy = await prisma.mcpToolPolicy.create({
      data: {
        org_entity_id: input.org_entity_id,
        mcp_connection_id: input.mcp_connection_id,
        tool_name: input.tool_name,
        operation_class: input.operation_class,
        outcome: input.outcome ?? "NEEDS_APPROVAL",
        requires_employee_authority: input.requires_employee_authority ?? true,
        requires_dmw_scope: input.requires_dmw_scope ?? true,
        requires_admin_approval: input.requires_admin_approval ?? false,
        redaction_policy: input.redaction_policy ?? null,
        output_retention_policy: input.output_retention_policy ?? null,
        created_by_entity_id: input.created_by_entity_id,
      },
    });
    return { ok: true, policy };
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "P2002") {
      return { ok: false, code: "POLICY_ALREADY_EXISTS" };
    }
    throw err;
  }
}

export async function listMcpToolPolicies(
  orgEntityId: string,
  options: { mcp_connection_id?: string } = {},
): Promise<McpToolPolicy[]> {
  const where: {
    org_entity_id: string;
    revoked_at: null;
    mcp_connection_id?: string;
  } = {
    org_entity_id: orgEntityId,
    revoked_at: null,
  };
  if (options.mcp_connection_id) {
    where.mcp_connection_id = options.mcp_connection_id;
  }
  return prisma.mcpToolPolicy.findMany({
    where,
    orderBy: { created_at: "desc" },
  });
}

export async function revokeMcpToolPolicy(
  orgEntityId: string,
  policyId: string,
): Promise<
  | { ok: true; policy: McpToolPolicy }
  | { ok: false; code: "POLICY_NOT_FOUND" }
> {
  const existing = await prisma.mcpToolPolicy.findUnique({
    where: { policy_id: policyId },
  });
  if (existing === null || existing.org_entity_id !== orgEntityId) {
    return { ok: false, code: "POLICY_NOT_FOUND" };
  }
  if (existing.revoked_at !== null) return { ok: true, policy: existing };
  const revoked = await prisma.mcpToolPolicy.update({
    where: { policy_id: policyId },
    data: { revoked_at: new Date() },
  });
  return { ok: true, policy: revoked };
}

/**
 * Pure resolver: given a list of policies + a candidate
 * (tool_name, operation_class), return the matching policy or null.
 *
 * Note: this does NOT apply the McpServerConnection.tool_policy_mode
 * fallback — that is the caller's responsibility (see future
 * apps/api/src/services/cosmp/mcp-decision.service.ts which composes
 * the resolution path).
 */
export function findMatchingPolicy(
  policies: McpToolPolicy[],
  toolName: string,
  operationClass: McpOperationClass,
): McpToolPolicy | null {
  for (const p of policies) {
    if (p.revoked_at !== null) continue;
    if (p.tool_name !== toolName) continue;
    if (p.operation_class !== operationClass) continue;
    return p;
  }
  return null;
}
