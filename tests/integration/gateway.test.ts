// FILE: gateway.test.ts (integration)
// PURPOSE: Verify the API gateway -- public health endpoint, 401
//          on protected routes without a session, and 429 once a
//          rate-limit window is exceeded.
// CONNECTS TO: buildApp from @niov/api, MemoryRateLimitStore +
//              MemoryNonceStore + MemoryContentStore for isolated
//              test infrastructure.

import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildApp,
  detectOperation,
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
} from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "gateway-test-secret-do-not-use-in-prod";
const TEST_KEY = randomBytes(32);

let app: FastifyInstance;
let rateLimitStore: MemoryRateLimitStore;

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
  rateLimitStore = new MemoryRateLimitStore();
  app = await buildApp({
    jwtSecret: TEST_JWT_SECRET,
    sessionNonceStore: new MemoryNonceStore(),
    declarationStore: new MemoryNonceStore(),
    contentStore: new MemoryContentStore(),
    contentEncryption: new ContentEncryption(TEST_KEY),
    rateLimitStore,
    rateLimitOverrides: {
      // Easy-to-trigger limits so the test can verify enforcement
      // without sending hundreds of requests.
      login: { perMinute: 2, scope: "ip" },
    },
  });
});

afterAll(async () => {
  await app.close();
  await cleanupTestData();
  await prisma.$disconnect();
});

describe("detectOperation (pure helper)", () => {
  it("matches POST /api/v1/auth/login -> login", () => {
    expect(detectOperation("POST", "/api/v1/auth/login")).toBe("login");
  });

  it("matches PATCH /api/v1/cosmp/capsule/:id -> write", () => {
    expect(
      detectOperation(
        "PATCH",
        "/api/v1/cosmp/capsule/abcdef12-3456-7890-abcd-ef1234567890",
      ),
    ).toBe("write");
  });

  it("matches GET /api/v1/cosmp/capsule/:id/metadata -> read_metadata", () => {
    expect(
      detectOperation(
        "GET",
        "/api/v1/cosmp/capsule/abcdef12-3456-7890-abcd-ef1234567890/metadata",
      ),
    ).toBe("read_metadata");
  });

  it("returns null for unmatched routes", () => {
    expect(detectOperation("GET", "/api/v1/health")).toBeNull();
    expect(detectOperation("GET", "/api/v1/wallet/balance")).toBeNull();
  });

  it("strips query string before matching", () => {
    expect(detectOperation("POST", "/api/v1/auth/login?x=1")).toBe("login");
  });
});

describe("GET /api/v1/health (public)", () => {
  it("returns 200 without an Authorization header", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/health",
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      ok: boolean;
      database: string;
      version: string;
    };
    expect(body.ok).toBe(true);
    expect(body.database).toBe("connected");
    expect(body.version).toBe("0.0.1");
  });

  it("is exempt from rate limiting", async () => {
    // Hammer the endpoint many more times than any rate-limit
    // window would allow; every response should still be 200.
    for (let i = 0; i < 25; i++) {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/health",
      });
      expect(response.statusCode).toBe(200);
    }
  });
});

describe("Protected routes return 401 without a session", () => {
  it("GET /api/v1/wallet/balance returns 401 with no Authorization header", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/wallet/balance",
    });
    expect(response.statusCode).toBe(401);
    const body = response.json() as { code: string };
    expect(body.code).toBe("SESSION_INVALID");
  });

  it("POST /api/v1/cosmp/negotiate returns 401 with no Authorization header", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/cosmp/negotiate",
      payload: {
        capsule_id: "00000000-0000-0000-0000-000000000000",
        requested_scope: "FULL",
      },
    });
    expect(response.statusCode).toBe(401);
  });

  it("GET /api/v1/developer/api-keys returns 401 with no Authorization header", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/developer/api-keys",
    });
    expect(response.statusCode).toBe(401);
  });
});

describe("Developer API keys", () => {
  it("creates, lists, and revokes an API key", async () => {
    const password = "correct-horse-battery";
    const input = makeEntityInput({ entity_type: "PERSON", password });
    const entity = await createEntity(input);
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: input.email,
        password,
        requested_operations: ["read", "share"],
      },
    });
    expect(login.statusCode).toBe(200);
    const token = (login.json() as { token: string }).token;

    // Create
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/developer/api-keys",
      headers: { authorization: `Bearer ${token}` },
      payload: { key_name: "ci-token" },
    });
    expect(create.statusCode).toBe(201);
    const created = create.json() as {
      key_id: string;
      api_key: string;
      key_name: string;
    };
    expect(created.api_key).toMatch(/^niov_[0-9a-f]{64}$/);
    expect(created.key_name).toBe("ci-token");

    // List
    const list = await app.inject({
      method: "GET",
      url: "/api/v1/developer/api-keys",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(list.statusCode).toBe(200);
    const listBody = list.json() as {
      keys: Array<{ key_id: string; key_name: string; is_active: boolean }>;
    };
    const found = listBody.keys.find((k) => k.key_id === created.key_id);
    expect(found?.is_active).toBe(true);
    // The plaintext key MUST NOT appear in list results.
    expect(JSON.stringify(listBody)).not.toContain(created.api_key);

    // Revoke
    const revoke = await app.inject({
      method: "DELETE",
      url: `/api/v1/developer/api-keys/${created.key_id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(revoke.statusCode).toBe(200);
    const revoked = revoke.json() as { is_active: boolean };
    expect(revoked.is_active).toBe(false);

    // Cleanup
    void entity;
  });
});

// Rate-limiting test runs LAST in this file so it cannot poison
// the login bucket for other tests. The whole file shares one
// MemoryRateLimitStore (set in beforeAll); once the login limit
// is exhausted here, no other login can succeed in this app
// instance.
describe("Rate limiting", () => {
  it("returns 429 after the per-window limit is exceeded", async () => {
    const payload = {
      email: "__niov_test__rate-limit-target@niov.test",
      password: "any",
    };
    // Use a fresh remoteAddress so this test's IP bucket is
    // independent of any other test's logins. Login is IP-scoped.
    const remoteAddress = "10.99.42.7";

    const r1 = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload,
      remoteAddress,
    });
    const r2 = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload,
      remoteAddress,
    });
    const r3 = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload,
      remoteAddress,
    });

    expect([401, 200]).toContain(r1.statusCode);
    expect([401, 200]).toContain(r2.statusCode);
    expect(r3.statusCode).toBe(429);
    const body = r3.json() as {
      ok: boolean;
      error: string;
      retry_after_seconds: number;
    };
    expect(body.error).toBe("RATE_LIMIT_EXCEEDED");
    expect(body.retry_after_seconds).toBeGreaterThan(0);
    expect(body.retry_after_seconds).toBeLessThanOrEqual(60);
    expect(r3.headers["retry-after"]).toBeDefined();
  });
});
