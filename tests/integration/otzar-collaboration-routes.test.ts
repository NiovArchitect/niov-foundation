// FILE: otzar-collaboration-routes.test.ts (integration)
// PURPOSE: Phase EDX-6 PR 2 — HTTP-level coverage for the
//          TwinCollaborationRequest routes. End-to-end through
//          buildApp against the test DB populated by CI's
//          npm run db:push.
// CONNECTS TO:
//   - apps/api/src/routes/otzar-collaboration.routes.ts
//   - apps/api/src/services/otzar/twin-collaboration.service.ts

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildApp,
  MemoryContentStore,
  MemoryNonceStore,
  MemoryRateLimitStore,
} from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import { createEntity, prisma } from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeEntityInput,
  TEST_PREFIX,
} from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "otzar-collaboration-routes-test-secret";
const TEST_KEY = randomBytes(32);

let app: FastifyInstance;
let SHARED_ORG_ID: string;

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
  SHARED_ORG_ID = org.entity_id;
});

afterAll(async () => {
  await app.close();
  await cleanupTestData();
  await prisma.$disconnect();
});

async function loginInOrg(orgId: string = SHARED_ORG_ID): Promise<{
  entityId: string;
  token: string;
  ip: string;
}> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const owner = await createEntity(input);
  await prisma.entityMembership.create({
    data: {
      parent_id: orgId,
      child_id: owner.entity_id,
      role_title: "MEMBER",
      is_active: true,
    },
  });
  const ip = `10.92.${Math.floor(Math.random() * 200) + 1}.${
    Math.floor(Math.random() * 254) + 1
  }`;
  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: {
      email: input.email,
      password,
      requested_operations: ["read"],
    },
    remoteAddress: ip,
  });
  if (login.statusCode !== 200) {
    throw new Error(`login failed: ${login.statusCode} ${login.body}`);
  }
  const body = login.json() as { token: string };
  return { entityId: owner.entity_id, token: body.token, ip };
}

describe("POST /api/v1/otzar/my-twin/collaboration-requests", () => {
  it("creates a REQUESTED row with no-leak guard (201)", async () => {
    const requester = await loginInOrg();
    const target = await loginInOrg();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/my-twin/collaboration-requests",
      headers: { authorization: `Bearer ${requester.token}` },
      payload: {
        target_type: "EMPLOYEE",
        target_entity_id: target.entityId,
        request_type: "STATUS_REQUEST",
        safe_summary: "Can you confirm the launch window?",
      },
      remoteAddress: requester.ip,
    });
    expect(response.statusCode).toBe(201);
    const body = response.json() as {
      ok: boolean;
      collaboration: {
        collaboration_id: string;
        target_type: string;
        request_type: string;
        state: string;
        has_target_entity: boolean;
      };
    };
    expect(body.ok).toBe(true);
    expect(body.collaboration.state).toBe("REQUESTED");
    expect(body.collaboration.has_target_entity).toBe(true);
    // No leakage of internals.
    expect(response.payload).not.toContain("target_entity_id");
    expect(response.payload).not.toContain("requester_entity_id");
    expect(response.payload).not.toContain("workflow_id");
    expect(response.payload).not.toContain("action_id");
    expect(response.payload).not.toContain("approval_grant_id");
  });

  it("rejects missing bearer with 401", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/my-twin/collaboration-requests",
      payload: {
        target_type: "EMPLOYEE",
        request_type: "STATUS_REQUEST",
        safe_summary: "x",
      },
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects unknown target_type with 422", async () => {
    const ctx = await loginInOrg();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/my-twin/collaboration-requests",
      headers: { authorization: `Bearer ${ctx.token}` },
      payload: {
        target_type: "ROBOT",
        request_type: "STATUS_REQUEST",
        safe_summary: "x",
      },
      remoteAddress: ctx.ip,
    });
    expect(response.statusCode).toBe(422);
  });

  it("rejects ORG-less callers with 403 ORG_NOT_RESOLVED", async () => {
    const password = "correct-horse-battery";
    const orgless = makeEntityInput({ entity_type: "PERSON", password });
    await createEntity(orgless);
    const ip = `10.91.99.1`;
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: orgless.email,
        password,
        requested_operations: ["read"],
      },
      remoteAddress: ip,
    });
    const token = (login.json() as { token: string }).token;
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/my-twin/collaboration-requests",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        target_type: "EMPLOYEE",
        target_entity_id: SHARED_ORG_ID,
        request_type: "STATUS_REQUEST",
        safe_summary: "x",
      },
      remoteAddress: ip,
    });
    expect(response.statusCode).toBe(403);
    const body = response.json() as { code: string };
    expect(body.code).toBe("ORG_NOT_RESOLVED");
  });

  it("returns 403 CROSS_ORG_DENIED when target is in another org", async () => {
    const otherOrg = await createEntity({
      entity_type: "COMPANY",
      display_name: `${TEST_PREFIX}other_${randomUUID()}`,
      email: `${TEST_PREFIX}other_${randomUUID()}@niov.test`,
      public_key: "test-public-key",
      clearance_level: 0,
    });
    const requester = await loginInOrg(); // SHARED_ORG_ID
    const target = await loginInOrg(otherOrg.entity_id);
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/my-twin/collaboration-requests",
      headers: { authorization: `Bearer ${requester.token}` },
      payload: {
        target_type: "EMPLOYEE",
        target_entity_id: target.entityId,
        request_type: "STATUS_REQUEST",
        safe_summary: "Cross-org should be denied",
      },
      remoteAddress: requester.ip,
    });
    expect(response.statusCode).toBe(403);
    const body = response.json() as { code: string };
    expect(body.code).toBe("CROSS_ORG_DENIED");
  });
});

describe("GET inbound + outbound", () => {
  it("inbound surfaces requests where caller is the target", async () => {
    const requester = await loginInOrg();
    const target = await loginInOrg();
    await app.inject({
      method: "POST",
      url: "/api/v1/otzar/my-twin/collaboration-requests",
      headers: { authorization: `Bearer ${requester.token}` },
      payload: {
        target_type: "EMPLOYEE",
        target_entity_id: target.entityId,
        request_type: "STATUS_REQUEST",
        safe_summary: "inbound visibility test",
      },
      remoteAddress: requester.ip,
    });
    const inbound = await app.inject({
      method: "GET",
      url: "/api/v1/otzar/my-twin/collaboration-requests/inbound",
      headers: { authorization: `Bearer ${target.token}` },
      remoteAddress: target.ip,
    });
    expect(inbound.statusCode).toBe(200);
    const body = inbound.json() as {
      collaborations: { safe_summary: string }[];
    };
    expect(
      body.collaborations.some(
        (c) => c.safe_summary === "inbound visibility test",
      ),
    ).toBe(true);
  });

  it("outbound surfaces requests where caller is the requester", async () => {
    const requester = await loginInOrg();
    const target = await loginInOrg();
    await app.inject({
      method: "POST",
      url: "/api/v1/otzar/my-twin/collaboration-requests",
      headers: { authorization: `Bearer ${requester.token}` },
      payload: {
        target_type: "EMPLOYEE",
        target_entity_id: target.entityId,
        request_type: "STATUS_REQUEST",
        safe_summary: "outbound visibility test",
      },
      remoteAddress: requester.ip,
    });
    const outbound = await app.inject({
      method: "GET",
      url: "/api/v1/otzar/my-twin/collaboration-requests/outbound",
      headers: { authorization: `Bearer ${requester.token}` },
      remoteAddress: requester.ip,
    });
    expect(outbound.statusCode).toBe(200);
    const body = outbound.json() as {
      collaborations: { safe_summary: string }[];
    };
    expect(
      body.collaborations.some(
        (c) => c.safe_summary === "outbound visibility test",
      ),
    ).toBe(true);
  });
});

describe("transition routes", () => {
  it("accept: target transitions REQUESTED → ACCEPTED (200)", async () => {
    const requester = await loginInOrg();
    const target = await loginInOrg();
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/my-twin/collaboration-requests",
      headers: { authorization: `Bearer ${requester.token}` },
      payload: {
        target_type: "EMPLOYEE",
        target_entity_id: target.entityId,
        request_type: "STATUS_REQUEST",
        safe_summary: "Please accept me",
      },
      remoteAddress: requester.ip,
    });
    const created = (
      create.json() as { collaboration: { collaboration_id: string } }
    ).collaboration;
    const accept = await app.inject({
      method: "POST",
      url: `/api/v1/otzar/my-twin/collaboration-requests/${created.collaboration_id}/accept`,
      headers: { authorization: `Bearer ${target.token}` },
      remoteAddress: target.ip,
    });
    expect(accept.statusCode).toBe(200);
    const body = accept.json() as {
      collaboration: { state: string };
    };
    expect(body.collaboration.state).toBe("ACCEPTED");
  });

  it("accept: 403 NOT_TARGET when a non-target tries", async () => {
    const requester = await loginInOrg();
    const target = await loginInOrg();
    const stranger = await loginInOrg();
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/my-twin/collaboration-requests",
      headers: { authorization: `Bearer ${requester.token}` },
      payload: {
        target_type: "EMPLOYEE",
        target_entity_id: target.entityId,
        request_type: "STATUS_REQUEST",
        safe_summary: "Target only",
      },
      remoteAddress: requester.ip,
    });
    const created = (
      create.json() as { collaboration: { collaboration_id: string } }
    ).collaboration;
    const accept = await app.inject({
      method: "POST",
      url: `/api/v1/otzar/my-twin/collaboration-requests/${created.collaboration_id}/accept`,
      headers: { authorization: `Bearer ${stranger.token}` },
      remoteAddress: stranger.ip,
    });
    expect(accept.statusCode).toBe(403);
    const body = accept.json() as { code: string };
    expect(body.code).toBe("NOT_TARGET");
  });

  it("cancel: requester REQUESTED → CANCELED", async () => {
    const requester = await loginInOrg();
    const target = await loginInOrg();
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/my-twin/collaboration-requests",
      headers: { authorization: `Bearer ${requester.token}` },
      payload: {
        target_type: "EMPLOYEE",
        target_entity_id: target.entityId,
        request_type: "STATUS_REQUEST",
        safe_summary: "Will be cancelled",
      },
      remoteAddress: requester.ip,
    });
    const created = (
      create.json() as { collaboration: { collaboration_id: string } }
    ).collaboration;
    const cancel = await app.inject({
      method: "POST",
      url: `/api/v1/otzar/my-twin/collaboration-requests/${created.collaboration_id}/cancel`,
      headers: { authorization: `Bearer ${requester.token}` },
      remoteAddress: requester.ip,
    });
    expect(cancel.statusCode).toBe(200);
    const body = cancel.json() as {
      collaboration: { state: string };
    };
    expect(body.collaboration.state).toBe("CANCELED");
  });

  it("cancel: 403 NOT_REQUESTER when target tries to cancel", async () => {
    const requester = await loginInOrg();
    const target = await loginInOrg();
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/my-twin/collaboration-requests",
      headers: { authorization: `Bearer ${requester.token}` },
      payload: {
        target_type: "EMPLOYEE",
        target_entity_id: target.entityId,
        request_type: "STATUS_REQUEST",
        safe_summary: "Cancel guard",
      },
      remoteAddress: requester.ip,
    });
    const created = (
      create.json() as { collaboration: { collaboration_id: string } }
    ).collaboration;
    const cancel = await app.inject({
      method: "POST",
      url: `/api/v1/otzar/my-twin/collaboration-requests/${created.collaboration_id}/cancel`,
      headers: { authorization: `Bearer ${target.token}` },
      remoteAddress: target.ip,
    });
    expect(cancel.statusCode).toBe(403);
    const body = cancel.json() as { code: string };
    expect(body.code).toBe("NOT_REQUESTER");
  });

  it("complete: requester sets COMPLETED + completed_at", async () => {
    const requester = await loginInOrg();
    const target = await loginInOrg();
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/my-twin/collaboration-requests",
      headers: { authorization: `Bearer ${requester.token}` },
      payload: {
        target_type: "EMPLOYEE",
        target_entity_id: target.entityId,
        request_type: "STATUS_REQUEST",
        safe_summary: "Will be completed",
      },
      remoteAddress: requester.ip,
    });
    const created = (
      create.json() as { collaboration: { collaboration_id: string } }
    ).collaboration;
    const complete = await app.inject({
      method: "POST",
      url: `/api/v1/otzar/my-twin/collaboration-requests/${created.collaboration_id}/complete`,
      headers: { authorization: `Bearer ${requester.token}` },
      remoteAddress: requester.ip,
    });
    expect(complete.statusCode).toBe(200);
    const body = complete.json() as {
      collaboration: { state: string; completed_at: string | null };
    };
    expect(body.collaboration.state).toBe("COMPLETED");
    expect(body.collaboration.completed_at).not.toBeNull();
  });

  it("transition: 404 COLLABORATION_NOT_FOUND for unknown id", async () => {
    const ctx = await loginInOrg();
    const accept = await app.inject({
      method: "POST",
      url: `/api/v1/otzar/my-twin/collaboration-requests/${randomUUID()}/accept`,
      headers: { authorization: `Bearer ${ctx.token}` },
      remoteAddress: ctx.ip,
    });
    expect(accept.statusCode).toBe(404);
    const body = accept.json() as { code: string };
    expect(body.code).toBe("COLLABORATION_NOT_FOUND");
  });
});
