// FILE: otzar-work-project-routes.test.ts (integration)
// PURPOSE: Phase 1 PR 2 — HTTP-level coverage for the
//          WorkProject + WorkProjectMember routes. End-to-end via
//          buildApp against the test DB (work_projects +
//          work_project_members tables populated by CI's
//          npm run db:push).
// CONNECTS TO:
//   - apps/api/src/routes/otzar-work-project.routes.ts
//   - apps/api/src/services/otzar/work-project.service.ts

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

const TEST_JWT_SECRET = "otzar-work-project-routes-test-secret";
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
  const ip = `10.90.${Math.floor(Math.random() * 200) + 1}.${
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

describe("POST /api/v1/otzar/work-projects", () => {
  it("creates an ACTIVE project with caller as OWNER (201)", async () => {
    const ctx = await loginInOrg();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/work-projects",
      headers: { authorization: `Bearer ${ctx.token}` },
      payload: { name: "Phoenix Project" },
      remoteAddress: ctx.ip,
    });
    expect(response.statusCode).toBe(201);
    const body = response.json() as {
      ok: boolean;
      project: {
        project_id: string;
        name: string;
        state: string;
        archivable: boolean;
      };
    };
    expect(body.ok).toBe(true);
    expect(body.project.state).toBe("ACTIVE");
    expect(body.project.name).toBe("Phoenix Project");
    expect(body.project.archivable).toBe(true);
    // No leakage of internals.
    expect(response.payload).not.toContain("archived_at");
    expect(response.payload).not.toContain("created_by_entity_id");
    expect(response.payload).not.toContain("org_entity_id");
  });

  it("rejects missing bearer with 401", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/work-projects",
      payload: { name: "x" },
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects empty name with 422", async () => {
    const ctx = await loginInOrg();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/work-projects",
      headers: { authorization: `Bearer ${ctx.token}` },
      payload: { name: "" },
      remoteAddress: ctx.ip,
    });
    expect(response.statusCode).toBe(422);
  });
});

describe("GET /api/v1/otzar/work-projects", () => {
  it("returns only projects where caller is a member", async () => {
    const ctxA = await loginInOrg();
    const ctxB = await loginInOrg();
    await app.inject({
      method: "POST",
      url: "/api/v1/otzar/work-projects",
      headers: { authorization: `Bearer ${ctxA.token}` },
      payload: { name: "A's project" },
      remoteAddress: ctxA.ip,
    });
    await app.inject({
      method: "POST",
      url: "/api/v1/otzar/work-projects",
      headers: { authorization: `Bearer ${ctxB.token}` },
      payload: { name: "B's project" },
      remoteAddress: ctxB.ip,
    });
    const listA = await app.inject({
      method: "GET",
      url: "/api/v1/otzar/work-projects",
      headers: { authorization: `Bearer ${ctxA.token}` },
      remoteAddress: ctxA.ip,
    });
    const bodyA = listA.json() as {
      ok: boolean;
      projects: { name: string }[];
    };
    expect(bodyA.ok).toBe(true);
    expect(bodyA.projects.every((p) => p.name !== "B's project")).toBe(true);
    expect(bodyA.projects.some((p) => p.name === "A's project")).toBe(true);
  });
});

describe("POST /api/v1/otzar/work-projects/:id/members", () => {
  it("OWNER adds a same-org member (201)", async () => {
    const owner = await loginInOrg();
    const member = await loginInOrg();
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/work-projects",
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { name: "Atlas" },
      remoteAddress: owner.ip,
    });
    const created = (createRes.json() as { project: { project_id: string } })
      .project;
    const add = await app.inject({
      method: "POST",
      url: `/api/v1/otzar/work-projects/${created.project_id}/members`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { entity_id: member.entityId },
      remoteAddress: owner.ip,
    });
    expect(add.statusCode).toBe(201);
    const body = add.json() as {
      ok: boolean;
      member: { entity_id: string; role: string };
    };
    expect(body.member.role).toBe("MEMBER");
  });

  it("returns 403 NOT_PROJECT_OWNER when non-OWNER tries", async () => {
    const owner = await loginInOrg();
    const other = await loginInOrg();
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/work-projects",
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { name: "Guard test" },
      remoteAddress: owner.ip,
    });
    const created = (create.json() as { project: { project_id: string } })
      .project;
    const add = await app.inject({
      method: "POST",
      url: `/api/v1/otzar/work-projects/${created.project_id}/members`,
      headers: { authorization: `Bearer ${other.token}` },
      payload: { entity_id: other.entityId },
      remoteAddress: other.ip,
    });
    expect(add.statusCode).toBe(403);
    const body = add.json() as { code: string };
    expect(body.code).toBe("NOT_PROJECT_OWNER");
  });

  it("returns 403 CROSS_ORG_DENIED for cross-org candidate", async () => {
    const otherOrg = await createEntity({
      entity_type: "COMPANY",
      display_name: `${TEST_PREFIX}other_${randomUUID()}`,
      email: `${TEST_PREFIX}other_${randomUUID()}@niov.test`,
      public_key: "test-public-key",
      clearance_level: 0,
    });
    const owner = await loginInOrg(); // SHARED_ORG_ID
    const crossOrg = await loginInOrg(otherOrg.entity_id);
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/work-projects",
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { name: "Cross-org guard" },
      remoteAddress: owner.ip,
    });
    const created = (create.json() as { project: { project_id: string } })
      .project;
    const add = await app.inject({
      method: "POST",
      url: `/api/v1/otzar/work-projects/${created.project_id}/members`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { entity_id: crossOrg.entityId },
      remoteAddress: owner.ip,
    });
    expect(add.statusCode).toBe(403);
    const body = add.json() as { code: string };
    expect(body.code).toBe("CROSS_ORG_DENIED");
  });
});

describe("GET /api/v1/otzar/work-projects/:id/members", () => {
  it("members can read the roster", async () => {
    const owner = await loginInOrg();
    const member = await loginInOrg();
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/work-projects",
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { name: "Roster" },
      remoteAddress: owner.ip,
    });
    const created = (create.json() as { project: { project_id: string } })
      .project;
    await app.inject({
      method: "POST",
      url: `/api/v1/otzar/work-projects/${created.project_id}/members`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { entity_id: member.entityId },
      remoteAddress: owner.ip,
    });
    const list = await app.inject({
      method: "GET",
      url: `/api/v1/otzar/work-projects/${created.project_id}/members`,
      headers: { authorization: `Bearer ${member.token}` },
      remoteAddress: member.ip,
    });
    expect(list.statusCode).toBe(200);
    const body = list.json() as {
      ok: boolean;
      members: { entity_id: string; role: string }[];
    };
    expect(body.members.length).toBe(2);
  });

  it("non-members are 403 NOT_PROJECT_MEMBER", async () => {
    const owner = await loginInOrg();
    const stranger = await loginInOrg();
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/work-projects",
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { name: "Roster guard" },
      remoteAddress: owner.ip,
    });
    const created = (create.json() as { project: { project_id: string } })
      .project;
    const list = await app.inject({
      method: "GET",
      url: `/api/v1/otzar/work-projects/${created.project_id}/members`,
      headers: { authorization: `Bearer ${stranger.token}` },
      remoteAddress: stranger.ip,
    });
    expect(list.statusCode).toBe(403);
    const body = list.json() as { code: string };
    expect(body.code).toBe("NOT_PROJECT_MEMBER");
  });
});

describe("POST /api/v1/otzar/work-projects/:id/archive", () => {
  it("OWNER archives + state becomes ARCHIVED (200)", async () => {
    const owner = await loginInOrg();
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/work-projects",
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { name: "Will be archived" },
      remoteAddress: owner.ip,
    });
    const created = (create.json() as { project: { project_id: string } })
      .project;
    const archive = await app.inject({
      method: "POST",
      url: `/api/v1/otzar/work-projects/${created.project_id}/archive`,
      headers: { authorization: `Bearer ${owner.token}` },
      remoteAddress: owner.ip,
    });
    expect(archive.statusCode).toBe(200);
    const body = archive.json() as {
      project: { state: string; archivable: boolean };
    };
    expect(body.project.state).toBe("ARCHIVED");
    expect(body.project.archivable).toBe(false);
  });

  it("409 ALREADY_ARCHIVED on idempotent archive", async () => {
    const owner = await loginInOrg();
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/work-projects",
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { name: "Will be archived twice" },
      remoteAddress: owner.ip,
    });
    const created = (create.json() as { project: { project_id: string } })
      .project;
    await app.inject({
      method: "POST",
      url: `/api/v1/otzar/work-projects/${created.project_id}/archive`,
      headers: { authorization: `Bearer ${owner.token}` },
      remoteAddress: owner.ip,
    });
    const second = await app.inject({
      method: "POST",
      url: `/api/v1/otzar/work-projects/${created.project_id}/archive`,
      headers: { authorization: `Bearer ${owner.token}` },
      remoteAddress: owner.ip,
    });
    expect(second.statusCode).toBe(409);
    const body = second.json() as { code: string };
    expect(body.code).toBe("ALREADY_ARCHIVED");
  });
});
