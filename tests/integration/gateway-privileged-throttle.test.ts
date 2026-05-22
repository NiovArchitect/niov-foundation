// FILE: gateway-privileged-throttle.test.ts (integration)
// PURPOSE: GOVSEC.5 G4-C / GAP-B4 -- prove the 4 dual-control PRIVILEGED_ENDPOINTS
//          routes are classified as the strict `privileged` gateway operation
//          (not the generous `default` fallback), so they 429 at the privileged
//          limit. The gateway onRequest hook classifies + throttles BEFORE the
//          route handler and before requireDualControl, so this is provable
//          deterministically without valid auth/dual-control. Dual-control
//          authorization is unchanged -- this is the pre-auth gateway throttle
//          layer only. Deterministic via low ip-scoped overrides; no wall-clock /
//          p99 / real Redis.
// CONNECTS TO: buildApp from @niov/api; the gateway hook (detectOperation +
//              OPERATION_RULES privileged mappings + DEFAULT_LIMITS.privileged);
//              apps/api/src/security/privileged-endpoints.ts (the registry whose
//              4 routes these mappings mirror); Memory* stores for isolation.

import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  buildApp,
  MemoryContentStore,
  MemoryNonceStore,
  MemoryRateLimitStore,
  type RateLimitStore,
} from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import { prisma } from "@niov/database";
import { cleanupTestData, ensureAuditTriggers } from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "gateway-privileged-test-secret-do-not-use-in-prod";
const TEST_KEY = randomBytes(32);

let app: FastifyInstance;
let store: RateLimitStore;

// The 4 dual-control PRIVILEGED_ENDPOINTS routes (method + path), mirroring
// apps/api/src/security/privileged-endpoints.ts.
const PRIVILEGED_ROUTES: ReadonlyArray<{ method: "PATCH" | "POST"; url: string }> = [
  { method: "PATCH", url: "/api/v1/platform/monetization/config" },
  { method: "POST", url: "/api/v1/platform/orgs" },
  { method: "POST", url: "/api/v1/regulator/access-grants" },
  { method: "POST", url: "/api/v1/regulator/access-revocations" },
];

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
  store = new MemoryRateLimitStore();
  app = await buildApp({
    jwtSecret: TEST_JWT_SECRET,
    sessionNonceStore: new MemoryNonceStore(),
    declarationStore: new MemoryNonceStore(),
    contentStore: new MemoryContentStore(),
    contentEncryption: new ContentEncryption(TEST_KEY),
    rateLimitStore: store,
    // Strict privileged limit (2) vs generous default (100), both ip-scoped so the
    // mapping is provable without auth. If a privileged route were still classified
    // `default` it would NOT 429 at 3 requests; that it does proves the strict
    // privileged classification.
    rateLimitOverrides: {
      default: { perMinute: 100, scope: "ip" },
      privileged: { perMinute: 2, scope: "ip" },
    },
  });
});

afterAll(async () => {
  await app.close();
  await cleanupTestData();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await store.reset();
});

describe("GOVSEC.5 G4-C privileged-route throttle (GAP-B4; dual-control endpoints)", () => {
  for (const [i, route] of PRIVILEGED_ROUTES.entries()) {
    it(`${route.method} ${route.url} is throttled at the strict privileged limit (429), not the generous default`, async () => {
      // Distinct IP per route so each route's privileged bucket is independent
      // (all 4 share the "privileged" op, so the bucket is privileged:ip:<ip>).
      const remoteAddress = `10.220.0.${i + 1}`;
      let saw429 = false;
      for (let n = 0; n < 3; n++) {
        const r = await app.inject({ method: route.method, url: route.url, remoteAddress });
        if (r.statusCode === 429) saw429 = true;
      }
      // privileged limit is 2/min; the 3rd request breaches it. At the generous
      // default (100/min) no 429 would fire -- so this proves privileged mapping.
      expect(saw429).toBe(true);
    });
  }

  it("an ordinary unmapped route at the same volume is NOT throttled (stays on the generous default)", async () => {
    const remoteAddress = "10.220.0.9";
    const codes: number[] = [];
    for (let n = 0; n < 3; n++) {
      const r = await app.inject({ method: "GET", url: "/api/v1/wallet/balance", remoteAddress });
      codes.push(r.statusCode);
    }
    // default limit is 100/min -> 3 requests never 429. This proves the privileged
    // routes are classified differently (strict) from ordinary unmapped routes.
    expect(codes.some((c) => c === 429)).toBe(false);
  });

  it("privileged classification is method-exact: a GET on a privileged path is NOT privileged-throttled", async () => {
    // The registry + OPERATION_RULES are method-sensitive. A GET on the org-creation
    // path is unmapped -> default (100/min), so 3 requests do not 429.
    const remoteAddress = "10.220.0.10";
    const codes: number[] = [];
    for (let n = 0; n < 3; n++) {
      const r = await app.inject({ method: "GET", url: "/api/v1/platform/orgs", remoteAddress });
      codes.push(r.statusCode);
    }
    expect(codes.some((c) => c === 429)).toBe(false);
  });
});
