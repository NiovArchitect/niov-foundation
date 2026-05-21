// FILE: gateway-swarm.test.ts (integration)
// PURPOSE: GOVSEC.4 G4-B2-A / GAP-B2 -- adversarial-swarm simulation harness.
//          Proves the CURRENT posture: G4-A per-key limits shed single-source
//          floods (login + default fallback), and the distributed-under-limit
//          swarm (many sources, each under its own per-IP limit) is NOT shed
//          today -- documenting the residual GAP-B2 that the future G4-B2-B
//          production swarm counter (deferred after G4-D perf measurement) will
//          close. Health stays exempt under swarm-like load. No production code
//          here; this is the adversarial-sim test infrastructure + baseline.
// CONNECTS TO: buildApp from @niov/api; the gateway hook + DEFAULT_FALLBACK /
//              health exemption from G4-A; Memory* stores for isolation.

import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildApp,
  MemoryContentStore,
  MemoryNonceStore,
  MemoryRateLimitStore,
} from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import { prisma } from "@niov/database";
import { cleanupTestData, ensureAuditTriggers } from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "gateway-swarm-test-secret-do-not-use-in-prod";
const TEST_KEY = randomBytes(32);

let app: FastifyInstance;

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
    rateLimitOverrides: {
      // Low ip-scoped limits so single-source floods are deterministic and a
      // distributed swarm can stay just-under-limit per source.
      login: { perMinute: 2, scope: "ip" },
      default: { perMinute: 2, scope: "ip" },
    },
  });
});

afterAll(async () => {
  await app.close();
  await cleanupTestData();
  await prisma.$disconnect();
});

const loginPayload = { email: "__niov_test__swarm@niov.test", password: "x" };

describe("GOVSEC.4 G4-B2-A adversarial swarm harness (GAP-B2 baseline)", () => {
  it("single-source flood on login is SHED by the existing G4-A per-key limit", async () => {
    const remoteAddress = "10.200.0.1";
    let saw429 = false;
    for (let i = 0; i < 4; i++) {
      const r = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: loginPayload, remoteAddress });
      if (r.statusCode === 429) saw429 = true;
    }
    expect(saw429).toBe(true);
  });

  // RESIDUAL BASELINE (GAP-B2 open): a distributed swarm whose every source stays
  // under its own per-IP limit is NOT shed by G4-A per-key limits. G4-B2-B (after
  // G4-D perf measurement) will flip this expectation to "shed" once an aggregate
  // swarm counter + backpressure lands.
  it("distributed-under-limit swarm on login is NOT shed today (residual; G4-B2-B will flip this)", async () => {
    const sources = Array.from({ length: 10 }, (_, k) => `10.200.1.${k + 1}`);
    const codes: number[] = [];
    for (const remoteAddress of sources) {
      for (let i = 0; i < 2; i++) {
        // 2 requests/source == the per-IP limit (not over it) -> no per-key breach
        const r = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: loginPayload, remoteAddress });
        codes.push(r.statusCode);
      }
    }
    // aggregate 20 requests across 10 sources, yet no per-key 429 fires
    expect(codes.some((c) => c === 429)).toBe(false);
  });

  it("single-source flood on an unmapped route is SHED by DEFAULT_FALLBACK", async () => {
    const remoteAddress = "10.200.0.2";
    let saw429 = false;
    for (let i = 0; i < 4; i++) {
      const r = await app.inject({ method: "GET", url: "/api/v1/wallet/balance", remoteAddress });
      if (r.statusCode === 429) saw429 = true;
    }
    expect(saw429).toBe(true);
  });

  // RESIDUAL BASELINE (GAP-B2 open): same for the default-fallback path.
  it("distributed-under-limit swarm on the default fallback is NOT shed today (residual; G4-B2-B will flip this)", async () => {
    const sources = Array.from({ length: 10 }, (_, k) => `10.200.2.${k + 1}`);
    const codes: number[] = [];
    for (const remoteAddress of sources) {
      for (let i = 0; i < 2; i++) {
        const r = await app.inject({ method: "GET", url: "/api/v1/wallet/balance", remoteAddress });
        codes.push(r.statusCode);
      }
    }
    expect(codes.some((c) => c === 429)).toBe(false);
  });

  it("health/readiness stays EXEMPT under swarm-like repeated load", async () => {
    const sources = Array.from({ length: 8 }, (_, k) => `10.200.3.${k + 1}`);
    for (const remoteAddress of sources) {
      for (let i = 0; i < 5; i++) {
        const r = await app.inject({ method: "GET", url: "/api/v1/health", remoteAddress });
        expect(r.statusCode).toBe(200);
      }
    }
  });
});
