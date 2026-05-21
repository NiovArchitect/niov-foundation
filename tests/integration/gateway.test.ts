// FILE: gateway.test.ts (integration)
// PURPOSE: Verify the API gateway -- public health endpoint, 401
//          on protected routes without a session, and 429 once a
//          rate-limit window is exceeded.
// CONNECTS TO: buildApp from @niov/api, MemoryRateLimitStore +
//              MemoryNonceStore + MemoryContentStore for isolated
//              test infrastructure.

import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import jwt from "jsonwebtoken";
import {
  buildApp,
  detectOperation,
  MemoryContentStore,
  MemoryNonceStore,
  MemoryRateLimitStore,
} from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import { createEntity, prisma, verifyAuditChain } from "@niov/database";
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

describe("IP whitelist enforcement (Section 9)", () => {
  it("empty whitelist (default) lets the request through", async () => {
    const password = "correct-horse-battery";
    const input = makeEntityInput({ entity_type: "PERSON", password });
    const entity = await createEntity(input);
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: input.email,
        password,
        requested_operations: ["read"],
      },
      // Unique IP for this test's login bucket; the wallet call uses
      // a different IP because the orgless-entity path has no
      // whitelist enforcement anyway.
      remoteAddress: "10.99.50.5",
    });
    const token = (login.json() as { token: string }).token;

    // Orgless entity -> default settings -> empty whitelist -> pass.
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/wallet/balance",
      headers: { authorization: `Bearer ${token}` },
      remoteAddress: "192.168.1.50",
    });
    expect(response.statusCode).toBe(200);
    void entity;
  });

  it("populated whitelist with matching remoteAddress lets the request through", async () => {
    const password = "correct-horse-battery";
    const input = makeEntityInput({ entity_type: "PERSON", password });
    const entity = await createEntity(input);

    // Build COMPANY + EntityMembership + OrgSettings with whitelist.
    const company = await createEntity(
      makeEntityInput({ entity_type: "COMPANY" }),
    );
    await prisma.entityMembership.create({
      data: {
        parent_id: company.entity_id,
        child_id: entity.entity_id,
        is_active: true,
      },
    });
    await prisma.orgSettings.create({
      data: {
        org_entity_id: company.entity_id,
        ip_whitelist: ["10.99.50.1", "10.99.50.2"],
      },
    });

    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: input.email,
        password,
        requested_operations: ["read"],
      },
      // Login itself is exempt from the whitelist (no entity yet).
      // Using a unique IP for this test's login bucket.
      remoteAddress: "10.99.50.6",
    });
    expect(login.statusCode).toBe(200);
    const token = (login.json() as { token: string }).token;

    // Subsequent authed call from a whitelisted IP -> 200.
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/wallet/balance",
      headers: { authorization: `Bearer ${token}` },
      remoteAddress: "10.99.50.1",
    });
    expect(response.statusCode).toBe(200);
  });

  it("populated whitelist with non-matching remoteAddress returns 403 IP_NOT_WHITELISTED", async () => {
    const password = "correct-horse-battery";
    const input = makeEntityInput({ entity_type: "PERSON", password });
    const entity = await createEntity(input);
    const company = await createEntity(
      makeEntityInput({ entity_type: "COMPANY" }),
    );
    await prisma.entityMembership.create({
      data: {
        parent_id: company.entity_id,
        child_id: entity.entity_id,
        is_active: true,
      },
    });
    await prisma.orgSettings.create({
      data: {
        org_entity_id: company.entity_id,
        ip_whitelist: ["10.99.51.1"],
      },
    });

    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: input.email,
        password,
        requested_operations: ["read"],
      },
      // Unique IP for this test's login bucket.
      remoteAddress: "10.99.50.7",
    });
    expect(login.statusCode).toBe(200);
    const token = (login.json() as { token: string }).token;

    // Authed call from a NON-whitelisted IP -> 403.
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/wallet/balance",
      headers: { authorization: `Bearer ${token}` },
      remoteAddress: "192.168.99.99",
    });
    expect(response.statusCode).toBe(403);
    const body = response.json() as { error: string };
    expect(body.error).toBe("IP_NOT_WHITELISTED");
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

// GOVSEC.4 G4-A / GAP-B1: unmapped-route governance + auth-endpoint coverage.
// Uses its OWN app + store + low ip-scoped overrides so the burst tests are
// isolated from the shared-app tests above. detectOperation pure-helper checks
// confirm health/wallet still map to null (the fallback lives in the hook).
describe("GOVSEC.4 G4-A unmapped-route governance + auth-endpoint limits", () => {
  let g4app: FastifyInstance;

  beforeAll(async () => {
    g4app = await buildApp({
      jwtSecret: TEST_JWT_SECRET,
      sessionNonceStore: new MemoryNonceStore(),
      declarationStore: new MemoryNonceStore(),
      contentStore: new MemoryContentStore(),
      contentEncryption: new ContentEncryption(TEST_KEY),
      rateLimitStore: new MemoryRateLimitStore(),
      rateLimitOverrides: {
        // ip-scoped low limits so unauthenticated bursts trip deterministically.
        refresh: { perMinute: 2, scope: "ip" },
        admin_reset: { perMinute: 2, scope: "ip" },
        default: { perMinute: 2, scope: "ip" },
      },
    });
  });

  afterAll(async () => {
    await g4app.close();
  });

  it("detectOperation maps refresh + admin-reset (previously unmapped)", () => {
    expect(detectOperation("POST", "/api/v1/auth/refresh")).toBe("refresh");
    expect(detectOperation("POST", "/api/v1/auth/admin-reset")).toBe("admin_reset");
  });

  it("POST /api/v1/auth/refresh is governed -> 429 under burst", async () => {
    const remoteAddress = "10.77.1.1";
    const hits = [];
    for (let i = 0; i < 3; i++) {
      hits.push(
        await g4app.inject({ method: "POST", url: "/api/v1/auth/refresh", remoteAddress }),
      );
    }
    expect(hits[2]!.statusCode).toBe(429);
    const body = hits[2]!.json() as { error: string };
    expect(body.error).toBe("RATE_LIMIT_EXCEEDED");
  });

  it("POST /api/v1/auth/admin-reset is governed -> 429 under burst", async () => {
    const remoteAddress = "10.77.2.2";
    const hits = [];
    for (let i = 0; i < 3; i++) {
      hits.push(
        await g4app.inject({ method: "POST", url: "/api/v1/auth/admin-reset", remoteAddress }),
      );
    }
    expect(hits[2]!.statusCode).toBe(429);
    expect((hits[2]!.json() as { error: string }).error).toBe("RATE_LIMIT_EXCEEDED");
  });

  it("an unmapped route is governed by the default fallback -> 429 (no more pass-through)", async () => {
    // /api/v1/wallet/balance is NOT in OPERATION_RULES (detectOperation -> null);
    // before G4-A it passed through ungoverned. Now the default fallback governs it.
    const remoteAddress = "10.77.3.3";
    const hits = [];
    for (let i = 0; i < 3; i++) {
      hits.push(
        await g4app.inject({ method: "GET", url: "/api/v1/wallet/balance", remoteAddress }),
      );
    }
    expect(hits[2]!.statusCode).toBe(429);
    expect((hits[2]!.json() as { error: string }).error).toBe("RATE_LIMIT_EXCEEDED");
  });

  it("health/readiness probe stays EXEMPT even under a tight default fallback", async () => {
    // default fallback is 2/min here, but health must never be throttled.
    const remoteAddress = "10.77.4.4";
    for (let i = 0; i < 6; i++) {
      const r = await g4app.inject({ method: "GET", url: "/api/v1/health", remoteAddress });
      expect(r.statusCode).toBe(200);
    }
  });
});

// GOVSEC.4 G4-B1 / GAP-B1+B4 evidence: bounded rate-limit-denial audit.
// RATE_LIMITED chain audit fires only on the FIRST breach per key/window and
// ONLY for authenticated entities (per-entity chain, no SYSTEM_CHAIN_KEY
// contention). Unauthenticated denials never chain-audit. Own app + store +
// low ip/entity overrides so the bursts are isolated.
describe("GOVSEC.4 G4-B1 rate-limit-denial audit", () => {
  let g4b1app: FastifyInstance;

  beforeAll(async () => {
    g4b1app = await buildApp({
      jwtSecret: TEST_JWT_SECRET,
      sessionNonceStore: new MemoryNonceStore(),
      declarationStore: new MemoryNonceStore(),
      contentStore: new MemoryContentStore(),
      contentEncryption: new ContentEncryption(TEST_KEY),
      rateLimitStore: new MemoryRateLimitStore(),
      rateLimitOverrides: {
        read_metadata: { perMinute: 2, scope: "entity" }, // authenticated entity-scoped burst
        login: { perMinute: 2, scope: "ip" }, // unauthenticated ip-scoped burst
      },
    });
  });

  afterAll(async () => {
    await g4b1app.close();
  });

  it("authenticated first breach writes exactly one RATE_LIMITED chain audit with safe metadata", async () => {
    const entity = await createEntity(makeEntityInput({ entity_type: "PERSON" }));
    // The gateway only needs entity_id in the verified token to key by entity.
    const token = jwt.sign({ entity_id: entity.entity_id }, TEST_JWT_SECRET);
    const url = "/api/v1/cosmp/capsule/abcdef12-3456-7890-abcd-ef1234567890/metadata";

    let saw429 = false;
    for (let i = 0; i < 4; i++) {
      const r = await g4b1app.inject({
        method: "GET",
        url,
        headers: { authorization: `Bearer ${token}` },
        remoteAddress: "10.88.1.1",
      });
      if (r.statusCode === 429) saw429 = true;
    }
    expect(saw429).toBe(true);

    const rows = await prisma.auditEvent.findMany({
      where: { event_type: "RATE_LIMITED", actor_entity_id: entity.entity_id },
    });
    // first-breach single-emit: exactly one row despite multiple 429s
    expect(rows.length).toBe(1);
    const row = rows[0]!;
    expect(row.actor_entity_id).toBe(entity.entity_id);
    expect(row.outcome).toBe("DENIED");
    const details = (row.details ?? {}) as Record<string, unknown>;
    expect(details.reason).toBe("rate_limited");
    expect(details.operation).toBe("read_metadata");
    // safe/minimized metadata: no raw IP / token / auth header / UA
    const serialized = JSON.stringify(row.details).toLowerCase();
    for (const forbidden of ["10.88.1.1", token.toLowerCase(), "bearer", "authorization", "user-agent"]) {
      expect(serialized).not.toContain(forbidden);
    }
    // chain integrity preserved after the RATE_LIMITED emission
    const chain = await verifyAuditChain(entity.entity_id);
    expect(chain.valid).toBe(true);
  });

  it("unauthenticated 429 does NOT write a RATE_LIMITED chain audit (avoids SYSTEM_CHAIN_KEY contention)", async () => {
    const before = await prisma.auditEvent.count({ where: { event_type: "RATE_LIMITED" } });
    let saw429 = false;
    for (let i = 0; i < 4; i++) {
      const r = await g4b1app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { email: "__niov_test__g4b1-unauth@niov.test", password: "x" },
        remoteAddress: "10.88.9.9",
      });
      if (r.statusCode === 429) saw429 = true;
    }
    expect(saw429).toBe(true);
    const after = await prisma.auditEvent.count({ where: { event_type: "RATE_LIMITED" } });
    // no new RATE_LIMITED row for the unauthenticated denial
    expect(after).toBe(before);
  });
});
