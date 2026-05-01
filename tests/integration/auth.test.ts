// FILE: auth.test.ts (integration)
// PURPOSE: Hit the three Section 2A HTTP endpoints through Fastify's
//          inject() so the full route + middleware + service stack
//          runs end-to-end without binding a port.
// CONNECTS TO: buildApp from @niov/api (which wires routes + service),
//              the auth service, the entity / TAR queries, and
//              MemoryNonceStore so we do not require a Redis server.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, MemoryNonceStore } from "@niov/api";
import {
  createEntity,
  getTARByEntityId,
  prisma,
  updateEntityStatus,
  updateTARPermissions,
} from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeEntityInput,
} from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "auth-integration-secret-do-not-use-in-prod";

let app: FastifyInstance;
let sessionNonceStore: MemoryNonceStore;
let declarationStore: MemoryNonceStore;

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
  sessionNonceStore = new MemoryNonceStore();
  declarationStore = new MemoryNonceStore();
  app = await buildApp({
    jwtSecret: TEST_JWT_SECRET,
    sessionNonceStore,
    declarationStore,
  });
});

afterAll(async () => {
  await app.close();
  await cleanupTestData();
  await prisma.$disconnect();
});

// WHAT: Make a fresh PERSON entity with a known password.
// INPUT: Optional password override.
// OUTPUT: { entity, email, password } usable in HTTP test bodies.
// WHY: Same boilerplate-saver as in the unit suite.
async function makeLoginableEntity(password = "correct-horse-battery") {
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const entity = await createEntity(input);
  return { entity, email: input.email!, password };
}

describe("POST /api/v1/auth/login", () => {
  it("returns 200 + JWT on correct credentials", async () => {
    const { email, password } = await makeLoginableEntity();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email, password, requested_operations: ["read", "write"] },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      ok: boolean;
      token: string;
      session_id: string;
      allowed_operations: string[];
    };
    expect(body.ok).toBe(true);
    expect(body.token).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(body.allowed_operations).toEqual(
      expect.arrayContaining(["read", "write"]),
    );
  });

  it("returns 401 + identical body for wrong password and unknown email", async () => {
    const { email } = await makeLoginableEntity();
    const wrongPw = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email, password: "definitely-wrong" },
    });
    const unknown = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "__niov_test__nobody@niov.test",
        password: "anything",
      },
    });
    expect(wrongPw.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrongPw.json()).toEqual(unknown.json());
  });

  it("returns 403 + suspended message for a suspended account", async () => {
    const { entity, email, password } = await makeLoginableEntity();
    await updateEntityStatus(entity.entity_id, "SUSPENDED");
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email, password },
    });
    expect(response.statusCode).toBe(403);
    const body = response.json() as { code: string; message: string };
    expect(body.code).toBe("SUSPENDED");
    expect(body.message).toMatch(/suspended/i);
  });

  it("returns 400 when email or password are missing", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "x" },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe("GET /api/v1/auth/validate", () => {
  it("returns 200 + entity_id for a fresh session", async () => {
    const { entity, email, password } = await makeLoginableEntity();
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email, password, requested_operations: ["read"] },
    });
    const token = (login.json() as { token: string }).token;

    const validate = await app.inject({
      method: "GET",
      url: "/api/v1/auth/validate",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(validate.statusCode).toBe(200);
    const body = validate.json() as { ok: boolean; entity_id: string };
    expect(body.ok).toBe(true);
    expect(body.entity_id).toBe(entity.entity_id);
  });

  it("returns 401 SESSION_INVALID for a missing token", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/auth/validate",
    });
    expect(response.statusCode).toBe(401);
  });

  it("returns 401 SESSION_INVALIDATED after the entity's TAR mutates", async () => {
    const { entity, email, password } = await makeLoginableEntity();
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email, password, requested_operations: ["read"] },
    });
    const token = (login.json() as { token: string }).token;

    const tar = await getTARByEntityId(entity.entity_id);
    await updateTARPermissions(tar!.tar_id, { can_create_hives: true });

    const validate = await app.inject({
      method: "GET",
      url: "/api/v1/auth/validate",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(validate.statusCode).toBe(401);
    const body = validate.json() as { code: string };
    expect(body.code).toBe("SESSION_INVALIDATED");
  });
});

describe("POST /api/v1/auth/logout", () => {
  it("terminates the session and subsequent validates fail", async () => {
    const { email, password } = await makeLoginableEntity();
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email, password, requested_operations: ["read"] },
    });
    const token = (login.json() as { token: string }).token;

    const logout = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(logout.statusCode).toBe(200);

    const validate = await app.inject({
      method: "GET",
      url: "/api/v1/auth/validate",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(validate.statusCode).toBe(401);
    const body = validate.json() as { code: string };
    expect(body.code).toBe("SESSION_REVOKED");
  });
});
