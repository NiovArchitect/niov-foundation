// FILE: mcp-server.service.ts
// PURPOSE: Phase 5 — Model Context Protocol server connection
//          substrate. Each MCP server connection belongs to a single
//          customer org (tenant). The connection carries a
//          secret_ref pointer to the tenant's vault path; the raw
//          secret NEVER lives in this model.
//
// CONNECTS TO:
//   - packages/database (prisma.mcpServerConnection)
//   - apps/api/src/services/connector-rails/mcp-tool-policy.service.ts
//
// SAFETY POSTURE:
//   - secret_ref is the VAULT PATH only (e.g.,
//     "niov/tenants/<org_entity_id>/mcp/<mcp_connection_id>/secret").
//   - Raw secrets never enter this service, never appear in audit
//     metadata, never surface in API responses.
//   - allowed_tool_names + blocked_tool_names support an explicit
//     allowlist or explicit blocklist — both are closed enumeration
//     sets at the service tier.
//   - tool_policy_mode default is BLOCKED_BY_DEFAULT (RULE 0 lower
//     default permission ceiling for non-human entities).

import { prisma } from "@niov/database";
import type {
  McpServerConnection,
  McpAuthMode,
  McpServerStatus,
  McpToolPolicyMode,
} from "@prisma/client";

export interface CreateMcpServerConnectionInput {
  org_entity_id: string;
  display_name: string;
  server_url: string;
  auth_mode?: McpAuthMode;
  secret_ref?: string | null;
  tool_policy_mode?: McpToolPolicyMode;
  allowed_tool_names?: string[];
  blocked_tool_names?: string[];
  created_by_entity_id: string;
}

export type CreateMcpServerConnectionResult =
  | { ok: true; connection: McpServerConnection }
  | { ok: false; code: "DISPLAY_NAME_TAKEN" }
  | { ok: false; code: "INVALID_SERVER_URL" }
  | { ok: false; code: "SECRET_REF_LOOKS_LIKE_RAW_SECRET" };

const MAX_DISPLAY_NAME = 120;
const MAX_TOOL_NAMES = 200;

function validateServerUrl(value: string): boolean {
  if (!value || value.length === 0) return false;
  if (value.length > 2048) return false;
  // Accept https:// + http:// (for local dev MCP servers).
  return /^https?:\/\//.test(value);
}

function looksLikeRawSecret(value: string | null | undefined): boolean {
  if (!value) return false;
  // Heuristic — raw secrets tend to be long base64/hex blobs OR start
  // with provider-specific prefixes. Vault refs look like
  // "niov/tenants/<uuid>/mcp/<uuid>/secret" or env var names.
  if (value.startsWith("xoxp-") || value.startsWith("xoxb-")) return true;
  if (value.startsWith("sk-")) return true;
  if (value.startsWith("ghp_") || value.startsWith("ghs_")) return true;
  if (/^[a-zA-Z0-9+/]{80,}={0,3}$/.test(value)) return true;
  return false;
}

export async function createMcpServerConnection(
  input: CreateMcpServerConnectionInput,
): Promise<CreateMcpServerConnectionResult> {
  if (
    !input.display_name ||
    input.display_name.length === 0 ||
    input.display_name.length > MAX_DISPLAY_NAME
  ) {
    return { ok: false, code: "DISPLAY_NAME_TAKEN" };
  }
  if (!validateServerUrl(input.server_url)) {
    return { ok: false, code: "INVALID_SERVER_URL" };
  }
  if (looksLikeRawSecret(input.secret_ref)) {
    return { ok: false, code: "SECRET_REF_LOOKS_LIKE_RAW_SECRET" };
  }

  const allowed = (input.allowed_tool_names ?? []).slice(0, MAX_TOOL_NAMES);
  const blocked = (input.blocked_tool_names ?? []).slice(0, MAX_TOOL_NAMES);

  try {
    const connection = await prisma.mcpServerConnection.create({
      data: {
        org_entity_id: input.org_entity_id,
        display_name: input.display_name,
        server_url: input.server_url,
        auth_mode: input.auth_mode ?? "MCP_AUTH",
        secret_ref: input.secret_ref ?? null,
        status: "NOT_CONFIGURED",
        tool_policy_mode: input.tool_policy_mode ?? "BLOCKED_BY_DEFAULT",
        allowed_tool_names: allowed,
        blocked_tool_names: blocked,
        created_by_entity_id: input.created_by_entity_id,
      },
    });
    return { ok: true, connection };
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "P2002") {
      return { ok: false, code: "DISPLAY_NAME_TAKEN" };
    }
    throw err;
  }
}

/**
 * List the active (non-revoked) MCP server connections for an org.
 * The secret_ref is INCLUDED in the response — it is a vault path,
 * not a raw secret. Callers must never log this column verbatim.
 */
export async function listMcpServerConnections(
  orgEntityId: string,
): Promise<McpServerConnection[]> {
  return prisma.mcpServerConnection.findMany({
    where: { org_entity_id: orgEntityId, revoked_at: null },
    orderBy: { created_at: "desc" },
  });
}

export async function getMcpServerConnection(
  orgEntityId: string,
  mcpConnectionId: string,
): Promise<McpServerConnection | null> {
  const row = await prisma.mcpServerConnection.findUnique({
    where: { mcp_connection_id: mcpConnectionId },
  });
  if (row === null || row.org_entity_id !== orgEntityId) return null;
  return row;
}

export async function updateMcpServerStatus(
  orgEntityId: string,
  mcpConnectionId: string,
  status: McpServerStatus,
): Promise<
  | { ok: true; connection: McpServerConnection }
  | { ok: false; code: "MCP_CONNECTION_NOT_FOUND" }
> {
  const existing = await getMcpServerConnection(orgEntityId, mcpConnectionId);
  if (existing === null) return { ok: false, code: "MCP_CONNECTION_NOT_FOUND" };
  const updated = await prisma.mcpServerConnection.update({
    where: { mcp_connection_id: mcpConnectionId },
    data: {
      status,
      last_health_check_at: new Date(),
    },
  });
  return { ok: true, connection: updated };
}

export async function revokeMcpServerConnection(
  orgEntityId: string,
  mcpConnectionId: string,
): Promise<
  | { ok: true; connection: McpServerConnection }
  | { ok: false; code: "MCP_CONNECTION_NOT_FOUND" }
> {
  const existing = await getMcpServerConnection(orgEntityId, mcpConnectionId);
  if (existing === null) return { ok: false, code: "MCP_CONNECTION_NOT_FOUND" };
  if (existing.revoked_at !== null) return { ok: true, connection: existing };
  const revoked = await prisma.mcpServerConnection.update({
    where: { mcp_connection_id: mcpConnectionId },
    data: {
      revoked_at: new Date(),
      status: "REVOKED",
    },
  });
  return { ok: true, connection: revoked };
}
