// FILE: gateway-perf-budget.test.ts (integration)
// PURPOSE: GOVSEC.4 G4-D-D1 / GAP-O2 -- a DETERMINISTIC, CI-safe op-count
//          perf-contract for the gateway hot path. CI has no Redis and tests use
//          the MemoryRateLimitStore, so real Redis p99 / hot-key contention is
//          NOT measurable here (that is the local runbook in
//          docs/reference/govsec-perf-budget.md). Instead this pins the
//          per-request RateLimitStore call budget (hit / getMultiplier /
//          setMultiplier) -- the GAP-O2-relevant quantity -- as a regression
//          guard, with NO wall-clock / p95 / p99 assertions. Measure-first: no
//          production change, no optimization.
// CONNECTS TO: buildApp from @niov/api (rateLimitStore injection); the gateway
//              hook (G4-A fallback + health exemption, G4-B1 audit); Memory*
//              stores for isolation.

import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import jwt from "jsonwebtoken";
import {
  buildApp,
  MemoryContentStore,
  MemoryNonceStore,
  MemoryRateLimitStore,
  type RateLimitStore,
  type RateLimitHit,
} from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import { createEntity, prisma } from "@niov/database";
import { cleanupTestData, ensureAuditTriggers, makeEntityInput } from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "gateway-perf-budget-secret-do-not-use-in-prod";
const TEST_KEY = randomBytes(32);

// WHAT: A test-only RateLimitStore that wraps MemoryRateLimitStore and counts
//        per-method calls. WHY: lets the op-count contract assert the gateway's
//        store-call budget per request deterministically (no timing, no Redis).
class CountingRateLimitStore implements RateLimitStore {
  hitCalls = 0;
  getMultiplierCalls = 0;
  setMultiplierCalls = 0;
  constructor(private readonly inner: RateLimitStore) {}
  async hit(key: string, ttlSeconds: number): Promise<RateLimitHit> {
    this.hitCalls += 1;
    return this.inner.hit(key, ttlSeconds);
  }
  async getMultiplier(key: string): Promise<number> {
    this.getMultiplierCalls += 1;
    return this.inner.getMultiplier(key);
  }
  async setMultiplier(key: string, multiplier: number, ttlSeconds: number): Promise<void> {
    this.setMultiplierCalls += 1;
    return this.inner.setMultiplier(key, multiplier, ttlSeconds);
  }
  async reset(): Promise<void> {
    return this.inner.reset();
  }
  resetCounts(): void {
    this.hitCalls = 0;
    this.getMultiplierCalls = 0;
    this.setMultiplierCalls = 0;
  }
}

let app: FastifyInstance;
let counting: CountingRateLimitStore;

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
  counting = new CountingRateLimitStore(new MemoryRateLimitStore());
  app = await buildApp({
    jwtSecret: TEST_JWT_SECRET,
    sessionNonceStore: new MemoryNonceStore(),
    declarationStore: new MemoryNonceStore(),
    contentStore: new MemoryContentStore(),
    contentEncryption: new ContentEncryption(TEST_KEY),
    rateLimitStore: counting,
    rateLimitOverrides: {
      login: { perMinute: 2, scope: "ip" },
      default: { perMinute: 2, scope: "entity" },
      // GOVSEC.5 G4-C: a privileged-route override so the op-count case below is
      // deterministic. The op count is the same as any governed request.
      privileged: { perMinute: 2, scope: "entity" },
    },
  });
});

afterAll(async () => {
  await app.close();
  await cleanupTestData();
  await prisma.$disconnect();
});

beforeEach(() => {
  counting.resetCounts();
});

describe("GOVSEC.4 G4-D-D1 gateway op-count perf budget (GAP-O2; CI-safe, no timing)", () => {
  it("health/readiness is ZERO-store (exempt before any rate-limit store call)", async () => {
    const r = await app.inject({ method: "GET", url: "/api/v1/health", remoteAddress: "10.210.0.1" });
    expect(r.statusCode).toBe(200);
    expect(counting.hitCalls).toBe(0);
    expect(counting.getMultiplierCalls).toBe(0);
    expect(counting.setMultiplierCalls).toBe(0);
  });

  it("unauthenticated governed request (login) = 2 hit (per-key + G4-B2-B swarm cluster) + 1 getMultiplier + 0 setMultiplier", async () => {
    await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "__niov_test__perf@niov.test", password: "x" },
      remoteAddress: "10.210.0.2",
    });
    // GOVSEC.4 G4-B2-B: a request that passes the per-key limit then incurs the
    // aggregate swarm cluster counter -> 2 store.hit. getMultiplier is unchanged
    // (1; D2-B remains deferred); setMultiplier never fires from the gateway.
    expect(counting.hitCalls).toBe(2);
    expect(counting.getMultiplierCalls).toBe(1);
    expect(counting.setMultiplierCalls).toBe(0);
  });

  it("default-fallback unauthenticated request = 2 hit (per-key + G4-B2-B swarm cluster) + 1 getMultiplier + 0 setMultiplier", async () => {
    await app.inject({ method: "GET", url: "/api/v1/wallet/balance", remoteAddress: "10.210.0.3" });
    expect(counting.hitCalls).toBe(2);
    expect(counting.getMultiplierCalls).toBe(1);
    expect(counting.setMultiplierCalls).toBe(0);
  });

  it("authenticated governed request = same store budget (2 hit: per-key + G4-B2-B swarm cluster; 1 getMultiplier); the STEP-1 ip_whitelist getOrgSettingsOrDefaults DB read is the documented extra cost (see govsec-perf-budget.md)", async () => {
    const entity = await createEntity(makeEntityInput({ entity_type: "PERSON" }));
    const token = jwt.sign({ entity_id: entity.entity_id }, TEST_JWT_SECRET);
    counting.resetCounts();
    await app.inject({
      method: "GET",
      url: "/api/v1/wallet/balance",
      headers: { authorization: `Bearer ${token}` },
      remoteAddress: "10.210.0.4",
    });
    // store-call budget is identical to unauthenticated (per-key + swarm = 2 hit);
    // the authenticated DB read (getOrgSettingsOrDefaults for ip_whitelist) is a
    // non-store hot-path cost documented in the runbook (D2-C, deferred to
    // GOVSEC.7), not asserted here.
    expect(counting.hitCalls).toBe(2);
    expect(counting.getMultiplierCalls).toBe(1);
    expect(counting.setMultiplierCalls).toBe(0);
  });

  it("per-key 429 short-circuits BEFORE the G4-B2-B swarm counter: the breaching request = 1 hit + 1 getMultiplier + 0 setMultiplier", async () => {
    const remoteAddress = "10.210.0.5";
    // Fill the per-key window (login override perMinute=2): both pass the per-key
    // limit and each incurs per-key + swarm = 2 hit.
    for (let i = 0; i < 2; i++) {
      await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { email: "__niov_test__perf429@niov.test", password: "x" },
        remoteAddress,
      });
    }
    counting.resetCounts();
    // The 3rd request breaches the per-key limit and 429s BEFORE the swarm counter
    // runs, so it costs exactly 1 hit (per-key) + 1 getMultiplier + 0 swarm hit.
    const r = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "__niov_test__perf429@niov.test", password: "x" },
      remoteAddress,
    });
    expect(r.statusCode).toBe(429);
    expect(counting.hitCalls).toBe(1);
    expect(counting.getMultiplierCalls).toBe(1);
    expect(counting.setMultiplierCalls).toBe(0);
  });

  it("GOVSEC.5 G4-C privileged route (PATCH /platform/monetization/config) = same store budget (2 hit: per-key + swarm; 1 getMultiplier; 0 setMultiplier)", async () => {
    // The gateway onRequest hook classifies + counts BEFORE the route handler and
    // before requireDualControl, so the store budget is observable regardless of the
    // downstream dual-control outcome. A privileged route incurs the same op-count as
    // any governed request -- only its classification (privileged), bucket, and limit
    // differ from the default fallback.
    const r = await app.inject({
      method: "PATCH",
      url: "/api/v1/platform/monetization/config",
      remoteAddress: "10.210.0.6",
    });
    // gateway throttle ran (and passed at count 1); downstream may reject, but the
    // store budget is the gateway's: 2 hit (per-key + swarm) + 1 getMultiplier.
    expect(r.statusCode).not.toBe(200); // dual-control / auth rejects downstream
    expect(counting.hitCalls).toBe(2);
    expect(counting.getMultiplierCalls).toBe(1);
    expect(counting.setMultiplierCalls).toBe(0);
  });
});
