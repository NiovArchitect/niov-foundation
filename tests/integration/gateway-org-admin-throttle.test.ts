// FILE: gateway-org-admin-throttle.test.ts (integration)
// PURPOSE: GOVSEC.5 org-admin route-set throttle (GAP-B4 follow-on) -- prove the
//          broader requireAdminCapability admin surface (the can_admin_org
//          /api/v1/org/* routes + the non-privileged can_admin_niov
//          /api/v1/platform/* reads + POST /auth/admin-register + POST
//          /otzar/domain/vocabulary + the break-glass routes) is classified as
//          the new `admin` gateway operation (60/min entity in prod), so it is
//          throttled stricter than the generous `default` fallback -- WHILE the
//          stricter classes are preserved by first-match ordering: the 4
//          dual-control PRIVILEGED_ENDPOINTS routes stay `privileged` and POST
//          /auth/admin-reset stays `admin_reset`. The gateway onRequest hook
//          classifies + throttles BEFORE auth/dual-control, so this is provable
//          deterministically without valid auth. No wall-clock / p99 / real Redis.
// CONNECTS TO: buildApp from @niov/api; the gateway hook (detectOperation +
//              OPERATION_RULES admin mappings + DEFAULT_LIMITS.admin); the
//              existing gateway-privileged-throttle.test.ts harness this mirrors.
//
// OVERRIDES (all ip-scoped so classification is provable without auth):
//   default = 100  (generous fallback)
//   privileged = 2 (the 4 dual-control routes)
//   admin_reset = 2 (POST /auth/admin-reset)
//   admin = 5      (the broader admin surface)
// So: 3 requests 429 a privileged/admin_reset route (limit 2) but NOT an admin
// route (limit 5); 6 requests 429 an admin route (limit 5) but NOT a default
// route (limit 100). This separates all three classes deterministically.

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

const TEST_JWT_SECRET = "gateway-org-admin-test-secret-do-not-use-in-prod";
const TEST_KEY = randomBytes(32);

let app: FastifyInstance;
let store: RateLimitStore;

// Representative route per admin family (one per family is enough -- they all
// share the single `admin` op bucket).
const ADMIN_ROUTES: ReadonlyArray<{ method: "GET" | "POST"; url: string; label: string }> = [
  { method: "GET", url: "/api/v1/org/members", label: "org admin surface" },
  { method: "GET", url: "/api/v1/platform/stats", label: "platform admin read" },
  { method: "POST", url: "/api/v1/auth/admin-register", label: "auth admin-register" },
  { method: "POST", url: "/api/v1/otzar/domain/vocabulary", label: "otzar domain vocabulary" },
  { method: "POST", url: "/api/v1/break-glass/grants", label: "break-glass invoke" },
];

// The 4 dual-control PRIVILEGED_ENDPOINTS routes -- must stay `privileged`.
const PRIVILEGED_ROUTES: ReadonlyArray<{ method: "PATCH" | "POST"; url: string }> = [
  { method: "PATCH", url: "/api/v1/platform/monetization/config" },
  { method: "POST", url: "/api/v1/platform/orgs" },
  { method: "POST", url: "/api/v1/regulator/access-grants" },
  { method: "POST", url: "/api/v1/regulator/access-revocations" },
];

async function hammer(
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  url: string,
  remoteAddress: string,
  times: number,
): Promise<number[]> {
  const codes: number[] = [];
  for (let n = 0; n < times; n++) {
    const r = await app.inject({ method, url, remoteAddress });
    codes.push(r.statusCode);
  }
  return codes;
}

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
    rateLimitOverrides: {
      default: { perMinute: 100, scope: "ip" },
      privileged: { perMinute: 2, scope: "ip" },
      admin_reset: { perMinute: 2, scope: "ip" },
      admin: { perMinute: 5, scope: "ip" },
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

describe("GOVSEC.5 org-admin route-set throttle (GAP-B4 follow-on; new `admin` op)", () => {
  for (const [i, route] of ADMIN_ROUTES.entries()) {
    it(`${route.method} ${route.url} (${route.label}) is admin-throttled (429 by the admin limit, stricter than default)`, async () => {
      const remoteAddress = `10.221.0.${i + 1}`;
      // admin limit is 5/min; 6 requests breach it. At the generous default
      // (100/min) no 429 would fire -- so this proves the `admin` classification.
      const codes = await hammer(route.method, route.url, remoteAddress, 6);
      expect(codes.some((c) => c === 429)).toBe(true);
    });
  }

  it("an admin route does NOT 429 at 3 requests (admin=5 is looser than privileged/admin_reset=2)", async () => {
    // Distinguishes `admin` from the stricter classes: 3 requests under admin=5
    // never 429, whereas a privileged/admin_reset route (limit 2) 429s by the 3rd.
    const codes = await hammer("GET", "/api/v1/org/members", "10.221.0.50", 3);
    expect(codes.some((c) => c === 429)).toBe(false);
  });

  for (const [i, route] of PRIVILEGED_ROUTES.entries()) {
    it(`${route.method} ${route.url} still classifies as privileged (429 at 3 under privileged=2, NOT admin=5)`, async () => {
      const remoteAddress = `10.221.1.${i + 1}`;
      // 3 requests breach privileged=2. If this route were reclassified `admin`
      // (5/min) it would NOT 429 at 3 -- so 429 proves privileged is preserved.
      const codes = await hammer(route.method, route.url, remoteAddress, 3);
      expect(codes.some((c) => c === 429)).toBe(true);
    });
  }

  it("POST /api/v1/auth/admin-reset still classifies as admin_reset (429 at 3 under admin_reset=2, NOT admin=5)", async () => {
    const codes = await hammer("POST", "/api/v1/auth/admin-reset", "10.221.2.1", 3);
    expect(codes.some((c) => c === 429)).toBe(true);
  });

  it("a non-admin route at the same volume is NOT admin-throttled (stays on the generous default)", async () => {
    // default is 100/min; 6 requests never 429 -- proves admin routes are
    // classified distinctly (stricter) from ordinary unmapped routes.
    const codes = await hammer("GET", "/api/v1/wallet/balance", "10.221.3.1", 6);
    expect(codes.some((c) => c === 429)).toBe(false);
  });

  it("POST /api/v1/otzar/observe is NOT admin-throttled (only /otzar/domain/vocabulary is admin; observe stays default)", async () => {
    const codes = await hammer("POST", "/api/v1/otzar/observe", "10.221.3.2", 6);
    expect(codes.some((c) => c === 429)).toBe(false);
  });
});
