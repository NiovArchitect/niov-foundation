// FILE: connector-rails-routes.test.ts (integration)
// PURPOSE: Phase 5 PR 2 — HTTP-level coverage for the connector +
//          MCP rails admin routes. can_admin_org-gated.
// CONNECTS TO:
//   - apps/api/src/routes/connector-rails.routes.ts
//   - apps/api/src/services/connector-rails/*

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildApp,
  MemoryContentStore,
  MemoryNonceStore,
  MemoryRateLimitStore,
} from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import { computeTARHash, createEntity, prisma } from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeEntityInput,
  TEST_PREFIX,
} from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "connector-rails-routes-test-secret";
const TEST_KEY = randomBytes(32);

let app: FastifyInstance;
let ORG_ID: string;

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
  app = await buildApp({
    jwtSecret: TEST_JWT_SECRET,
    sessionNonceStore: new MemoryNonceStore(),
    declarationStore: new MemoryNonceStore(),
    contentStore: new MemoryContentStore(),
    contentEncryption: new ContentEncryption(TEST_KEY),
    rateLimitStore: new MemoryRateLimitStore(),
  });
  const org = await createEntity({
    entity_type: "COMPANY",
    display_name: `${TEST_PREFIX}org_${randomUUID()}`,
    email: `${TEST_PREFIX}org_${randomUUID()}@niov.test`,
    public_key: "test-public-key",
    clearance_level: 0,
  });
  ORG_ID = org.entity_id;
});

afterAll(async () => {
  await app.close();
  await cleanupTestData();
  await prisma.$disconnect();
});

async function makeOrgAdmin(opts: {
  can_admin_org?: boolean;
}): Promise<{ entityId: string; token: string; ip: string }> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const entity = await createEntity(input);
  await prisma.entityMembership.create({
    data: {
      parent_id: ORG_ID,
      child_id: entity.entity_id,
      role_title: "MEMBER",
      is_active: true,
    },
  });
  await prisma.tokenAttributeRepository.update({
    where: { entity_id: entity.entity_id },
    data: { can_admin_org: opts.can_admin_org === true },
  });
  const fresh = await prisma.tokenAttributeRepository.findUnique({
    where: { entity_id: entity.entity_id },
  });
  if (fresh === null) throw new Error("TAR vanished");
  const newHash = computeTARHash({
    can_login: fresh.can_login,
    can_read_capsules: fresh.can_read_capsules,
    can_write_capsules: fresh.can_write_capsules,
    can_share_capsules: fresh.can_share_capsules,
    can_create_hives: fresh.can_create_hives,
    can_access_external_api: fresh.can_access_external_api,
    can_admin_niov: fresh.can_admin_niov,
    can_admin_org: fresh.can_admin_org,
    clearance_ceiling: fresh.clearance_ceiling,
    monetization_role: fresh.monetization_role,
    compliance_frameworks: fresh.compliance_frameworks,
    status: fresh.status,
  });
  await prisma.tokenAttributeRepository.update({
    where: { entity_id: entity.entity_id },
    data: { tar_hash: newHash },
  });
  const ip = `10.94.${Math.floor(Math.random() * 200) + 1}.${
    Math.floor(Math.random() * 254) + 1
  }`;
  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: {
      email: input.email,
      password,
      requested_operations: ["read", "write"],
    },
    remoteAddress: ip,
  });
  if (login.statusCode !== 200) {
    throw new Error(`login failed: ${login.statusCode} ${login.body}`);
  }
  const body = login.json() as { token: string };
  return { entityId: entity.entity_id, token: body.token, ip };
}

describe("GET /api/v1/orgs/me/connector-providers", () => {
  it("admin sees the 14 canonical providers (200)", async () => {
    const admin = await makeOrgAdmin({ can_admin_org: true });
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/orgs/me/connector-providers",
      headers: { authorization: `Bearer ${admin.token}` },
      remoteAddress: admin.ip,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      ok: boolean;
      providers: Array<{ provider_id: string }>;
    };
    expect(body.providers.length).toBe(14);
    const ids = new Set(body.providers.map((p) => p.provider_id));
    expect(ids.has("SLACK")).toBe(true);
    expect(ids.has("MCP_SERVER")).toBe(true);
    expect(response.payload).not.toContain("org_entity_id");
  });

  it("rejects non-admin caller with 403", async () => {
    const member = await makeOrgAdmin({ can_admin_org: false });
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/orgs/me/connector-providers",
      headers: { authorization: `Bearer ${member.token}` },
      remoteAddress: member.ip,
    });
    expect(response.statusCode).toBe(403);
  });
});

describe("POST /api/v1/orgs/me/connector-scope-grants", () => {
  it("admin creates a scope grant for an existing ConnectorBinding (201)", async () => {
    const admin = await makeOrgAdmin({ can_admin_org: true });
    const binding = await prisma.connectorBinding.create({
      data: {
        org_entity_id: ORG_ID,
        type: "SLACK_READ",
        display_name: `binding-${randomUUID()}`,
        config: {},
        secret_ref: "niov/tenants/test/connectors/slack/secret",
        created_by_entity_id: admin.entityId,
      },
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/orgs/me/connector-scope-grants",
      headers: { authorization: `Bearer ${admin.token}` },
      payload: {
        connection_id: binding.binding_id,
        scope_type: "TEAM",
        scope_id: randomUUID(),
        allowed_operations: ["READ", "DRAFT"],
      },
      remoteAddress: admin.ip,
    });
    expect(response.statusCode).toBe(201);
    const body = response.json() as {
      ok: boolean;
      grant: { grant_id: string; scope_type: string };
    };
    expect(body.grant.scope_type).toBe("TEAM");
    expect(response.payload).not.toContain("org_entity_id");
  });

  it("rejects WRITE_EXECUTE without requires_dual_control (422)", async () => {
    const admin = await makeOrgAdmin({ can_admin_org: true });
    const binding = await prisma.connectorBinding.create({
      data: {
        org_entity_id: ORG_ID,
        type: "OUTBOUND_WEBHOOK",
        display_name: `binding-${randomUUID()}`,
        config: {},
        created_by_entity_id: admin.entityId,
      },
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/orgs/me/connector-scope-grants",
      headers: { authorization: `Bearer ${admin.token}` },
      payload: {
        connection_id: binding.binding_id,
        scope_type: "ORG",
        allowed_operations: ["WRITE_EXECUTE"],
        requires_dual_control: false,
      },
      remoteAddress: admin.ip,
    });
    expect(response.statusCode).toBe(422);
    const body = response.json() as { code: string };
    expect(body.code).toBe("WRITE_EXECUTE_REQUIRES_DUAL_CONTROL");
  });

  it("rejects empty allowed_operations with 422", async () => {
    const admin = await makeOrgAdmin({ can_admin_org: true });
    const binding = await prisma.connectorBinding.create({
      data: {
        org_entity_id: ORG_ID,
        type: "FIXTURE_ECHO",
        display_name: `binding-${randomUUID()}`,
        config: {},
        created_by_entity_id: admin.entityId,
      },
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/orgs/me/connector-scope-grants",
      headers: { authorization: `Bearer ${admin.token}` },
      payload: {
        connection_id: binding.binding_id,
        scope_type: "ORG",
        allowed_operations: [],
      },
      remoteAddress: admin.ip,
    });
    expect(response.statusCode).toBe(422);
  });
});

describe("DELETE /api/v1/orgs/me/connector-scope-grants/:grant_id", () => {
  it("revokes a grant (200) + idempotent (200)", async () => {
    const admin = await makeOrgAdmin({ can_admin_org: true });
    const binding = await prisma.connectorBinding.create({
      data: {
        org_entity_id: ORG_ID,
        type: "JIRA_CLOUD_READ",
        display_name: `binding-${randomUUID()}`,
        config: {},
        created_by_entity_id: admin.entityId,
      },
    });
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/orgs/me/connector-scope-grants",
      headers: { authorization: `Bearer ${admin.token}` },
      payload: {
        connection_id: binding.binding_id,
        scope_type: "ORG",
        allowed_operations: ["READ"],
      },
      remoteAddress: admin.ip,
    });
    const grantId = (
      create.json() as { grant: { grant_id: string } }
    ).grant.grant_id;
    const revoke1 = await app.inject({
      method: "DELETE",
      url: `/api/v1/orgs/me/connector-scope-grants/${grantId}`,
      headers: { authorization: `Bearer ${admin.token}` },
      remoteAddress: admin.ip,
    });
    expect(revoke1.statusCode).toBe(200);
    const revoke2 = await app.inject({
      method: "DELETE",
      url: `/api/v1/orgs/me/connector-scope-grants/${grantId}`,
      headers: { authorization: `Bearer ${admin.token}` },
      remoteAddress: admin.ip,
    });
    expect(revoke2.statusCode).toBe(200);
  });

  it("404s for unknown grant_id", async () => {
    const admin = await makeOrgAdmin({ can_admin_org: true });
    const response = await app.inject({
      method: "DELETE",
      url: `/api/v1/orgs/me/connector-scope-grants/${randomUUID()}`,
      headers: { authorization: `Bearer ${admin.token}` },
      remoteAddress: admin.ip,
    });
    expect(response.statusCode).toBe(404);
  });
});

describe("MCP server connection CRUD", () => {
  it("admin creates + lists + revokes (201/200/200)", async () => {
    const admin = await makeOrgAdmin({ can_admin_org: true });
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/orgs/me/mcp-server-connections",
      headers: { authorization: `Bearer ${admin.token}` },
      payload: {
        display_name: `mcp-${randomUUID()}`,
        server_url: "https://mcp.example.com",
        secret_ref: "niov/tenants/test/mcp/conn/secret",
      },
      remoteAddress: admin.ip,
    });
    expect(create.statusCode).toBe(201);
    const conn = (
      create.json() as { connection: { mcp_connection_id: string } }
    ).connection;

    const list = await app.inject({
      method: "GET",
      url: "/api/v1/orgs/me/mcp-server-connections",
      headers: { authorization: `Bearer ${admin.token}` },
      remoteAddress: admin.ip,
    });
    expect(list.statusCode).toBe(200);
    const listBody = list.json() as {
      connections: Array<{ mcp_connection_id: string }>;
    };
    expect(
      listBody.connections.some((c) => c.mcp_connection_id === conn.mcp_connection_id),
    ).toBe(true);

    const revoke = await app.inject({
      method: "DELETE",
      url: `/api/v1/orgs/me/mcp-server-connections/${conn.mcp_connection_id}`,
      headers: { authorization: `Bearer ${admin.token}` },
      remoteAddress: admin.ip,
    });
    expect(revoke.statusCode).toBe(200);
  });

  it("rejects raw-secret-looking value with 422", async () => {
    const admin = await makeOrgAdmin({ can_admin_org: true });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/orgs/me/mcp-server-connections",
      headers: { authorization: `Bearer ${admin.token}` },
      payload: {
        display_name: `mcp-${randomUUID()}`,
        server_url: "https://mcp.example.com",
        // This shape matches one of the raw-secret-looking heuristics.
        secret_ref: "xoxp-1234567890-this-looks-like-a-slack-token",
      },
      remoteAddress: admin.ip,
    });
    expect(response.statusCode).toBe(422);
    const body = response.json() as { code: string };
    expect(body.code).toBe("SECRET_REF_LOOKS_LIKE_RAW_SECRET");
  });

  it("rejects invalid server_url with 422", async () => {
    const admin = await makeOrgAdmin({ can_admin_org: true });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/orgs/me/mcp-server-connections",
      headers: { authorization: `Bearer ${admin.token}` },
      payload: {
        display_name: `mcp-${randomUUID()}`,
        server_url: "not-a-url",
      },
      remoteAddress: admin.ip,
    });
    expect(response.statusCode).toBe(422);
  });
});

describe("MCP tool policy CRUD", () => {
  it("creates + lists + revokes a policy (201/200/200)", async () => {
    const admin = await makeOrgAdmin({ can_admin_org: true });
    const mcpCreate = await app.inject({
      method: "POST",
      url: "/api/v1/orgs/me/mcp-server-connections",
      headers: { authorization: `Bearer ${admin.token}` },
      payload: {
        display_name: `mcp-${randomUUID()}`,
        server_url: "https://mcp.example.com",
      },
      remoteAddress: admin.ip,
    });
    const mcpId = (
      mcpCreate.json() as { connection: { mcp_connection_id: string } }
    ).connection.mcp_connection_id;
    const policyCreate = await app.inject({
      method: "POST",
      url: "/api/v1/orgs/me/mcp-tool-policies",
      headers: { authorization: `Bearer ${admin.token}` },
      payload: {
        mcp_connection_id: mcpId,
        tool_name: "list_files",
        operation_class: "READ",
        outcome: "ALLOW",
      },
      remoteAddress: admin.ip,
    });
    expect(policyCreate.statusCode).toBe(201);
    const policyId = (
      policyCreate.json() as { policy: { policy_id: string } }
    ).policy.policy_id;

    const policyList = await app.inject({
      method: "GET",
      url: `/api/v1/orgs/me/mcp-tool-policies?mcp_connection_id=${mcpId}`,
      headers: { authorization: `Bearer ${admin.token}` },
      remoteAddress: admin.ip,
    });
    expect(policyList.statusCode).toBe(200);

    const revoke = await app.inject({
      method: "DELETE",
      url: `/api/v1/orgs/me/mcp-tool-policies/${policyId}`,
      headers: { authorization: `Bearer ${admin.token}` },
      remoteAddress: admin.ip,
    });
    expect(revoke.statusCode).toBe(200);
  });

  it("rejects unknown operation_class with 422", async () => {
    const admin = await makeOrgAdmin({ can_admin_org: true });
    const mcpCreate = await app.inject({
      method: "POST",
      url: "/api/v1/orgs/me/mcp-server-connections",
      headers: { authorization: `Bearer ${admin.token}` },
      payload: {
        display_name: `mcp-${randomUUID()}`,
        server_url: "https://mcp.example.com",
      },
      remoteAddress: admin.ip,
    });
    const mcpId = (
      mcpCreate.json() as { connection: { mcp_connection_id: string } }
    ).connection.mcp_connection_id;
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/orgs/me/mcp-tool-policies",
      headers: { authorization: `Bearer ${admin.token}` },
      payload: {
        mcp_connection_id: mcpId,
        tool_name: "list_files",
        operation_class: "NOT_A_CLASS",
      },
      remoteAddress: admin.ip,
    });
    expect(response.statusCode).toBe(422);
  });

  it("404s for missing mcp_connection_id", async () => {
    const admin = await makeOrgAdmin({ can_admin_org: true });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/orgs/me/mcp-tool-policies",
      headers: { authorization: `Bearer ${admin.token}` },
      payload: {
        mcp_connection_id: randomUUID(),
        tool_name: "list_files",
        operation_class: "READ",
      },
      remoteAddress: admin.ip,
    });
    expect(response.statusCode).toBe(404);
  });
});
