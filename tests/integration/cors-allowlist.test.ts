// FILE: cors-allowlist.test.ts (integration)
// PURPOSE: CONSOLE.1 backend CORS — exact-origin allowlist behavior for the
//          separate foundation-command frontend calling /api/v1/console/*.
//          Proves (A) allowed dev origin preflight reflects ACAO, (B)
//          FOUNDATION_COMMAND_URL env origin is allowed, (C) a disallowed
//          origin is never reflected (no wildcard), (D) CORS does not bypass
//          authentication, (E) CORS does not bypass can_admin_niov. CORS is
//          browser-origin enforcement only — never authorization.
// CONNECTS TO: buildApp from @niov/api (apps/api/src/server.ts CORS allowlist);
//              @niov/database (createEntity, prisma, computeTARHash);
//              tests/helpers.ts. Real containerized Postgres harness.

import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
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
  withCleanRateLimits,
} from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "cors-allowlist-test-secret-do-not-use-in-prod";
const TEST_KEY = randomBytes(32);
const ALLOWED_DEV_ORIGIN = "http://localhost:5173";
const FOUNDATION_COMMAND_TEST_ORIGIN = "https://foundation-command.example.test";
const DISALLOWED_ORIGIN = "https://evil.example.test";

let app: FastifyInstance;
let priorFoundationCommandUrl: string | undefined;
const store = new MemoryRateLimitStore();

// WHAT: Create an entity (optionally can_admin_niov) and log it in for a Bearer.
// INPUT: { can_admin_niov?: boolean }.
// OUTPUT: { token, ip } for use as Authorization: Bearer.
// WHY: Tests D + E need a real authenticated session to prove CORS never
//      substitutes for auth; mirrors the makeAdminAndLogin pattern in
//      console-routes.test.ts.
async function makeUserAndLogin(opts: {
  can_admin_niov?: boolean;
}): Promise<{ token: string; ip: string }> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const entity = await createEntity(input);
  if (opts.can_admin_niov === true) {
    await prisma.tokenAttributeRepository.update({
      where: { entity_id: entity.entity_id },
      data: { can_admin_niov: true },
    });
    const fresh = await prisma.tokenAttributeRepository.findUnique({
      where: { entity_id: entity.entity_id },
    });
    if (fresh === null) throw new Error("TAR vanished mid-test");
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
  }
  const ip = `10.232.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 254) + 1}`;
  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: input.email, password, requested_operations: ["read"] },
    remoteAddress: ip,
  });
  if (login.statusCode !== 200) {
    throw new Error(`login failed: ${login.statusCode} ${login.body}`);
  }
  const body = login.json() as { token: string };
  return { token: body.token, ip };
}

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
  // Set the foundation-command origin env BEFORE buildApp so the allowlist
  // (built at registration time) includes it for case B.
  priorFoundationCommandUrl = process.env.FOUNDATION_COMMAND_URL;
  process.env.FOUNDATION_COMMAND_URL = FOUNDATION_COMMAND_TEST_ORIGIN;
  app = await buildApp({
    jwtSecret: TEST_JWT_SECRET,
    sessionNonceStore: new MemoryNonceStore(),
    declarationStore: new MemoryNonceStore(),
    contentStore: new MemoryContentStore(),
    contentEncryption: new ContentEncryption(TEST_KEY),
    rateLimitStore: store,
  });
});

afterAll(async () => {
  await app.close();
  await cleanupTestData();
  await prisma.$disconnect();
  if (priorFoundationCommandUrl === undefined) {
    delete process.env.FOUNDATION_COMMAND_URL;
  } else {
    process.env.FOUNDATION_COMMAND_URL = priorFoundationCommandUrl;
  }
});

withCleanRateLimits(store);

beforeEach(async () => {
  await cleanupTestData();
});

describe("CONSOLE.1 CORS allowlist — preflight (OPTIONS)", () => {
  it("A. allowed dev origin preflight reflects exact ACAO + credentials + headers", async () => {
    const res = await app.inject({
      method: "OPTIONS",
      url: "/api/v1/console/overview",
      headers: {
        origin: ALLOWED_DEV_ORIGIN,
        "access-control-request-method": "GET",
        "access-control-request-headers": "authorization",
      },
      remoteAddress: "10.232.0.1",
    });
    expect(res.statusCode).toBeLessThan(400);
    expect(res.headers["access-control-allow-origin"]).toBe(ALLOWED_DEV_ORIGIN);
    expect(String(res.headers["access-control-allow-credentials"])).toBe("true");
    const allowHeaders = String(
      res.headers["access-control-allow-headers"] ?? "",
    ).toLowerCase();
    expect(allowHeaders).toContain("authorization");
  });

  it("B. FOUNDATION_COMMAND_URL exact origin is allowed via env", async () => {
    const res = await app.inject({
      method: "OPTIONS",
      url: "/api/v1/console/overview",
      headers: {
        origin: FOUNDATION_COMMAND_TEST_ORIGIN,
        "access-control-request-method": "GET",
        "access-control-request-headers": "authorization",
      },
      remoteAddress: "10.232.0.2",
    });
    expect(res.statusCode).toBeLessThan(400);
    expect(res.headers["access-control-allow-origin"]).toBe(
      FOUNDATION_COMMAND_TEST_ORIGIN,
    );
  });

  it("C. disallowed origin is never reflected (no wildcard)", async () => {
    const res = await app.inject({
      method: "OPTIONS",
      url: "/api/v1/console/overview",
      headers: {
        origin: DISALLOWED_ORIGIN,
        "access-control-request-method": "GET",
        "access-control-request-headers": "authorization",
      },
      remoteAddress: "10.232.0.3",
    });
    const acao = res.headers["access-control-allow-origin"];
    expect(acao).not.toBe(DISALLOWED_ORIGIN);
    expect(acao).not.toBe("*");
  });
});

describe("CONSOLE.1 CORS allowlist — CORS is not authorization", () => {
  it("D. allowed origin without Authorization is still denied (401)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/console/overview",
      headers: { origin: ALLOWED_DEV_ORIGIN },
      remoteAddress: "10.232.0.4",
    });
    expect(res.statusCode).toBe(401);
  });

  it("E. allowed origin with NON-can_admin_niov bearer is denied (403)", async () => {
    const u = await makeUserAndLogin({ can_admin_niov: false });
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/console/overview",
      headers: {
        origin: ALLOWED_DEV_ORIGIN,
        authorization: `Bearer ${u.token}`,
      },
      remoteAddress: u.ip,
    });
    expect(res.statusCode).toBe(403);
    expect((res.json() as { error: string }).error).toBe(
      "ADMIN_CAPABILITY_REQUIRED",
    );
  });

  it("E2. allowed origin with can_admin_niov bearer is permitted (200)", async () => {
    const a = await makeUserAndLogin({ can_admin_niov: true });
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/console/overview",
      headers: {
        origin: ALLOWED_DEV_ORIGIN,
        authorization: `Bearer ${a.token}`,
      },
      remoteAddress: a.ip,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe(ALLOWED_DEV_ORIGIN);
  });
});
