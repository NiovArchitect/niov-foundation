// FILE: connector-rails.routes.ts
// PURPOSE: Phase 5 PR 2 — admin HTTP surface for the connector + MCP
//          rails substrate landed at PR #296. can_admin_org-gated.
//
//          GET    /api/v1/orgs/me/connector-providers
//          POST   /api/v1/orgs/me/connector-scope-grants
//          GET    /api/v1/orgs/me/connector-scope-grants
//          DELETE /api/v1/orgs/me/connector-scope-grants/:grant_id
//
//          POST   /api/v1/orgs/me/mcp-server-connections
//          GET    /api/v1/orgs/me/mcp-server-connections
//          DELETE /api/v1/orgs/me/mcp-server-connections/:id
//
//          POST   /api/v1/orgs/me/mcp-tool-policies
//          GET    /api/v1/orgs/me/mcp-tool-policies
//          DELETE /api/v1/orgs/me/mcp-tool-policies/:policy_id
//
// CONNECTS TO:
//   - apps/api/src/services/connector-rails/* (provider-registry +
//     scope-grant + mcp-server + mcp-tool-policy)
//   - apps/api/src/middleware/admin.middleware.ts
//     (requireAdminCapability("can_admin_org"))
//
// PRIVACY INVARIANT:
//   - Routes only expose what the service tier returns. secret_ref
//     strings are vault PATHS (not raw secrets) so they may appear
//     in responses for admin visibility — but raw secret VALUES
//     never enter Foundation, so they cannot leak from these routes.
//   - Each create/update/revoke emits an ADMIN_ACTION audit event
//     with details.action discriminator (no new audit literal).
//   - org_entity_id NEVER appears in the response payload.

import type { FastifyInstance, FastifyReply } from "fastify";
import { requireAdminCapability } from "../middleware/admin.middleware.js";
import type { AuthService } from "../services/auth.service.js";
import { getOrgEntityId } from "../services/governance/org.js";
import { writeAuditEvent } from "@niov/database";
import {
  listConnectorProviders,
  createConnectorScopeGrant,
  listConnectorScopeGrants,
  revokeConnectorScopeGrant,
  createMcpServerConnection,
  listMcpServerConnections,
  revokeMcpServerConnection,
  createMcpToolPolicy,
  listMcpToolPolicies,
  revokeMcpToolPolicy,
  type ConnectorOperationClass,
  type ConnectorScopeType,
} from "../services/connector-rails/index.js";
import type {
  ConnectorScopeGrant,
  McpAuthMode,
  McpOperationClass,
  McpPolicyOutcome,
  McpServerConnection,
  McpToolPolicy,
  McpToolPolicyMode,
} from "@prisma/client";

const VALID_SCOPE_TYPES: ReadonlyArray<ConnectorScopeType> = [
  "ORG",
  "TEAM",
  "PROJECT",
  "ROLE",
  "EMPLOYEE",
  "TWIN",
];

const VALID_OPERATIONS: ReadonlyArray<ConnectorOperationClass> = [
  "READ",
  "DRAFT",
  "WRITE_REQUEST",
  "WRITE_EXECUTE",
];

const VALID_MCP_AUTH_MODES: ReadonlyArray<McpAuthMode> = [
  "OAUTH2",
  "API_KEY",
  "SERVICE_ACCOUNT",
  "MCP_AUTH",
  "NONE_FOR_LOCAL_MOCK",
];

const VALID_TOOL_POLICY_MODES: ReadonlyArray<McpToolPolicyMode> = [
  "READ_ONLY",
  "APPROVAL_REQUIRED",
  "BLOCKED_BY_DEFAULT",
];

const VALID_OPERATION_CLASSES: ReadonlyArray<McpOperationClass> = [
  "READ",
  "WRITE",
  "MUTATION",
  "EXTERNAL_SEND",
  "FINANCIAL",
  "LEGAL",
  "SECURITY",
  "CUSTOMER_SENSITIVE",
];

const VALID_POLICY_OUTCOMES: ReadonlyArray<McpPolicyOutcome> = [
  "ALLOW",
  "NEEDS_APPROVAL",
  "BLOCK",
  "DRAFT_ONLY",
  "DUAL_CONTROL_REQUIRED",
];

async function resolveOrgOrFail(
  entityId: string,
  reply: FastifyReply,
): Promise<string | null> {
  try {
    return await getOrgEntityId(entityId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    if (
      message === "NOT_IN_ANY_ORG" ||
      message === "ORG_HIERARCHY_TOO_DEEP"
    ) {
      await reply.code(404).send({
        ok: false,
        code: "NO_ORG_FOR_CALLER",
        message: "Caller is not in an organization",
      });
      return null;
    }
    throw err;
  }
}

function projectGrantSafeView(g: ConnectorScopeGrant) {
  return {
    grant_id: g.grant_id,
    connection_id: g.connection_id,
    scope_type: g.scope_type,
    scope_id: g.scope_id,
    allowed_operations: g.allowed_operations,
    requires_employee_authority: g.requires_employee_authority,
    requires_admin_approval: g.requires_admin_approval,
    requires_dual_control: g.requires_dual_control,
    created_at: g.created_at,
    updated_at: g.updated_at,
    expires_at: g.expires_at,
    revoked_at: g.revoked_at,
  };
}

function projectMcpServerSafeView(c: McpServerConnection) {
  return {
    mcp_connection_id: c.mcp_connection_id,
    display_name: c.display_name,
    server_url: c.server_url,
    auth_mode: c.auth_mode,
    secret_ref: c.secret_ref,
    status: c.status,
    tool_policy_mode: c.tool_policy_mode,
    allowed_tool_names: c.allowed_tool_names,
    blocked_tool_names: c.blocked_tool_names,
    created_at: c.created_at,
    updated_at: c.updated_at,
    revoked_at: c.revoked_at,
    last_health_check_at: c.last_health_check_at,
  };
}

function projectMcpPolicySafeView(p: McpToolPolicy) {
  return {
    policy_id: p.policy_id,
    mcp_connection_id: p.mcp_connection_id,
    tool_name: p.tool_name,
    operation_class: p.operation_class,
    outcome: p.outcome,
    requires_employee_authority: p.requires_employee_authority,
    requires_dmw_scope: p.requires_dmw_scope,
    requires_admin_approval: p.requires_admin_approval,
    redaction_policy: p.redaction_policy,
    output_retention_policy: p.output_retention_policy,
    created_at: p.created_at,
    updated_at: p.updated_at,
    revoked_at: p.revoked_at,
  };
}

async function emitAdminAudit(
  action: string,
  actorEntityId: string,
  orgEntityId: string,
  details: Record<string, unknown>,
): Promise<void> {
  await writeAuditEvent({
    event_type: "ADMIN_ACTION",
    outcome: "SUCCESS",
    actor_entity_id: actorEntityId,
    target_entity_id: orgEntityId,
    details: { action, ...details },
  });
}

export async function registerConnectorRailsRoutes(
  app: FastifyInstance,
  authService: AuthService,
): Promise<void> {
  // ───── Connector providers (read-only catalog) ─────
  app.get(
    "/api/v1/orgs/me/connector-providers",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;
      const providers = listConnectorProviders();
      return reply.code(200).send({ ok: true, providers });
    },
  );

  // ───── Connector scope grants ─────
  app.post<{
    Body: {
      connection_id?: unknown;
      scope_type?: unknown;
      scope_id?: unknown;
      allowed_operations?: unknown;
      requires_employee_authority?: unknown;
      requires_admin_approval?: unknown;
      requires_dual_control?: unknown;
      expires_at?: unknown;
    };
  }>(
    "/api/v1/orgs/me/connector-scope-grants",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;
      const body = request.body ?? {};
      if (typeof body.connection_id !== "string") {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: "connection_id is required",
        });
      }
      if (
        typeof body.scope_type !== "string" ||
        !(VALID_SCOPE_TYPES as ReadonlyArray<string>).includes(body.scope_type)
      ) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: "scope_type is required (closed vocab)",
        });
      }
      if (!Array.isArray(body.allowed_operations)) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: "allowed_operations must be an array",
        });
      }
      const ops = body.allowed_operations.filter(
        (v): v is ConnectorOperationClass =>
          typeof v === "string" &&
          (VALID_OPERATIONS as ReadonlyArray<string>).includes(v),
      );
      if (ops.length === 0) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: "allowed_operations must contain at least one valid op",
        });
      }
      const expiresAt =
        typeof body.expires_at === "string"
          ? new Date(body.expires_at)
          : null;
      const result = await createConnectorScopeGrant({
        org_entity_id: orgEntityId,
        connection_id: body.connection_id,
        scope_type: body.scope_type as ConnectorScopeType,
        scope_id:
          typeof body.scope_id === "string" ? body.scope_id : null,
        allowed_operations: ops,
        requires_employee_authority:
          typeof body.requires_employee_authority === "boolean"
            ? body.requires_employee_authority
            : true,
        requires_admin_approval:
          typeof body.requires_admin_approval === "boolean"
            ? body.requires_admin_approval
            : false,
        requires_dual_control:
          typeof body.requires_dual_control === "boolean"
            ? body.requires_dual_control
            : false,
        created_by_entity_id: callerId,
        expires_at: expiresAt,
      });
      if (!result.ok) {
        return reply.code(422).send({
          ok: false,
          code: result.code,
          message: `Scope grant creation rejected: ${result.code}`,
        });
      }
      await emitAdminAudit("CONNECTOR_SCOPE_GRANT_CREATED", callerId, orgEntityId, {
        grant_id: result.grant.grant_id,
        connection_id: result.grant.connection_id,
        scope_type: result.grant.scope_type,
      });
      return reply
        .code(201)
        .send({ ok: true, grant: projectGrantSafeView(result.grant) });
    },
  );

  app.get<{ Querystring: { connection_id?: string } }>(
    "/api/v1/orgs/me/connector-scope-grants",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;
      const grants = await listConnectorScopeGrants(orgEntityId, {
        connection_id: request.query.connection_id,
      });
      return reply
        .code(200)
        .send({ ok: true, grants: grants.map(projectGrantSafeView) });
    },
  );

  app.delete<{ Params: { grant_id: string } }>(
    "/api/v1/orgs/me/connector-scope-grants/:grant_id",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;
      const result = await revokeConnectorScopeGrant(
        orgEntityId,
        request.params.grant_id,
      );
      if (!result.ok) {
        return reply.code(404).send({
          ok: false,
          code: result.code,
          message: "Grant not found in this org",
        });
      }
      await emitAdminAudit("CONNECTOR_SCOPE_GRANT_REVOKED", callerId, orgEntityId, {
        grant_id: result.grant.grant_id,
      });
      return reply
        .code(200)
        .send({ ok: true, grant: projectGrantSafeView(result.grant) });
    },
  );

  // ───── MCP server connections ─────
  app.post<{
    Body: {
      display_name?: unknown;
      server_url?: unknown;
      auth_mode?: unknown;
      secret_ref?: unknown;
      tool_policy_mode?: unknown;
      allowed_tool_names?: unknown;
      blocked_tool_names?: unknown;
    };
  }>(
    "/api/v1/orgs/me/mcp-server-connections",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;
      const body = request.body ?? {};
      if (typeof body.display_name !== "string" || body.display_name.length === 0) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: "display_name is required",
        });
      }
      if (typeof body.server_url !== "string" || body.server_url.length === 0) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: "server_url is required",
        });
      }
      if (
        body.auth_mode !== undefined &&
        body.auth_mode !== null &&
        (typeof body.auth_mode !== "string" ||
          !(VALID_MCP_AUTH_MODES as ReadonlyArray<string>).includes(body.auth_mode))
      ) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: "auth_mode must be a closed-vocab value when provided",
        });
      }
      if (
        body.tool_policy_mode !== undefined &&
        body.tool_policy_mode !== null &&
        (typeof body.tool_policy_mode !== "string" ||
          !(VALID_TOOL_POLICY_MODES as ReadonlyArray<string>).includes(
            body.tool_policy_mode,
          ))
      ) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: "tool_policy_mode must be a closed-vocab value when provided",
        });
      }
      const allowed =
        Array.isArray(body.allowed_tool_names)
          ? body.allowed_tool_names.filter((v): v is string => typeof v === "string")
          : [];
      const blocked =
        Array.isArray(body.blocked_tool_names)
          ? body.blocked_tool_names.filter((v): v is string => typeof v === "string")
          : [];
      const result = await createMcpServerConnection({
        org_entity_id: orgEntityId,
        display_name: body.display_name,
        server_url: body.server_url,
        auth_mode:
          typeof body.auth_mode === "string"
            ? (body.auth_mode as McpAuthMode)
            : undefined,
        secret_ref:
          typeof body.secret_ref === "string" ? body.secret_ref : null,
        tool_policy_mode:
          typeof body.tool_policy_mode === "string"
            ? (body.tool_policy_mode as McpToolPolicyMode)
            : undefined,
        allowed_tool_names: allowed,
        blocked_tool_names: blocked,
        created_by_entity_id: callerId,
      });
      if (!result.ok) {
        return reply.code(422).send({
          ok: false,
          code: result.code,
          message: `MCP server connection creation rejected: ${result.code}`,
        });
      }
      await emitAdminAudit(
        "MCP_SERVER_CONNECTION_CREATED",
        callerId,
        orgEntityId,
        {
          mcp_connection_id: result.connection.mcp_connection_id,
          display_name: result.connection.display_name,
          // secret_ref is a vault PATH; safe to log
          secret_ref_present: result.connection.secret_ref !== null,
        },
      );
      return reply.code(201).send({
        ok: true,
        connection: projectMcpServerSafeView(result.connection),
      });
    },
  );

  app.get(
    "/api/v1/orgs/me/mcp-server-connections",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;
      const connections = await listMcpServerConnections(orgEntityId);
      return reply.code(200).send({
        ok: true,
        connections: connections.map(projectMcpServerSafeView),
      });
    },
  );

  app.delete<{ Params: { mcp_connection_id: string } }>(
    "/api/v1/orgs/me/mcp-server-connections/:mcp_connection_id",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;
      const result = await revokeMcpServerConnection(
        orgEntityId,
        request.params.mcp_connection_id,
      );
      if (!result.ok) {
        return reply.code(404).send({
          ok: false,
          code: result.code,
          message: "MCP server connection not found in this org",
        });
      }
      await emitAdminAudit(
        "MCP_SERVER_CONNECTION_REVOKED",
        callerId,
        orgEntityId,
        { mcp_connection_id: result.connection.mcp_connection_id },
      );
      return reply.code(200).send({
        ok: true,
        connection: projectMcpServerSafeView(result.connection),
      });
    },
  );

  // ───── MCP tool policies ─────
  app.post<{
    Body: {
      mcp_connection_id?: unknown;
      tool_name?: unknown;
      operation_class?: unknown;
      outcome?: unknown;
      requires_employee_authority?: unknown;
      requires_dmw_scope?: unknown;
      requires_admin_approval?: unknown;
      redaction_policy?: unknown;
      output_retention_policy?: unknown;
    };
  }>(
    "/api/v1/orgs/me/mcp-tool-policies",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;
      const body = request.body ?? {};
      if (typeof body.mcp_connection_id !== "string") {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: "mcp_connection_id is required",
        });
      }
      if (typeof body.tool_name !== "string" || body.tool_name.length === 0) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: "tool_name is required",
        });
      }
      if (
        typeof body.operation_class !== "string" ||
        !(VALID_OPERATION_CLASSES as ReadonlyArray<string>).includes(
          body.operation_class,
        )
      ) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: "operation_class is required (closed vocab)",
        });
      }
      if (
        body.outcome !== undefined &&
        body.outcome !== null &&
        (typeof body.outcome !== "string" ||
          !(VALID_POLICY_OUTCOMES as ReadonlyArray<string>).includes(body.outcome))
      ) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: "outcome must be a closed-vocab value when provided",
        });
      }
      const result = await createMcpToolPolicy({
        org_entity_id: orgEntityId,
        mcp_connection_id: body.mcp_connection_id,
        tool_name: body.tool_name,
        operation_class: body.operation_class as McpOperationClass,
        outcome:
          typeof body.outcome === "string"
            ? (body.outcome as McpPolicyOutcome)
            : undefined,
        requires_employee_authority:
          typeof body.requires_employee_authority === "boolean"
            ? body.requires_employee_authority
            : true,
        requires_dmw_scope:
          typeof body.requires_dmw_scope === "boolean"
            ? body.requires_dmw_scope
            : true,
        requires_admin_approval:
          typeof body.requires_admin_approval === "boolean"
            ? body.requires_admin_approval
            : false,
        redaction_policy:
          typeof body.redaction_policy === "string"
            ? body.redaction_policy
            : null,
        output_retention_policy:
          typeof body.output_retention_policy === "string"
            ? body.output_retention_policy
            : null,
        created_by_entity_id: callerId,
      });
      if (!result.ok) {
        const code = result.code;
        const status =
          code === "MCP_CONNECTION_NOT_FOUND"
            ? 404
            : code === "POLICY_ALREADY_EXISTS"
              ? 409
              : 422;
        return reply.code(status).send({
          ok: false,
          code,
          message: `MCP tool policy creation rejected: ${code}`,
        });
      }
      await emitAdminAudit(
        "MCP_TOOL_POLICY_CREATED",
        callerId,
        orgEntityId,
        {
          policy_id: result.policy.policy_id,
          mcp_connection_id: result.policy.mcp_connection_id,
          tool_name: result.policy.tool_name,
          operation_class: result.policy.operation_class,
          outcome: result.policy.outcome,
        },
      );
      return reply
        .code(201)
        .send({ ok: true, policy: projectMcpPolicySafeView(result.policy) });
    },
  );

  app.get<{ Querystring: { mcp_connection_id?: string } }>(
    "/api/v1/orgs/me/mcp-tool-policies",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;
      const policies = await listMcpToolPolicies(orgEntityId, {
        mcp_connection_id: request.query.mcp_connection_id,
      });
      return reply
        .code(200)
        .send({ ok: true, policies: policies.map(projectMcpPolicySafeView) });
    },
  );

  app.delete<{ Params: { policy_id: string } }>(
    "/api/v1/orgs/me/mcp-tool-policies/:policy_id",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;
      const result = await revokeMcpToolPolicy(
        orgEntityId,
        request.params.policy_id,
      );
      if (!result.ok) {
        return reply.code(404).send({
          ok: false,
          code: result.code,
          message: "MCP tool policy not found in this org",
        });
      }
      await emitAdminAudit("MCP_TOOL_POLICY_REVOKED", callerId, orgEntityId, {
        policy_id: result.policy.policy_id,
      });
      return reply.code(200).send({
        ok: true,
        policy: projectMcpPolicySafeView(result.policy),
      });
    },
  );
}
