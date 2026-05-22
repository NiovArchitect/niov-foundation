// FILE: gateway-swarm.test.ts (integration)
// PURPOSE: GOVSEC.4 G4-B2-A baseline + G4-B2-B closure -- adversarial-swarm
//          simulation. G4-A per-key limits shed single-source floods; G4-B2-B
//          (Fork α direct cluster shed) now sheds the distributed-under-limit
//          swarm (many sources, each within its own per-IP limit) via an
//          aggregate HMAC-bucketed cluster counter. Health stays exempt. Also
//          proves the swarm key shape (swarm:<op>:cluster:<bucket>) and that no
//          raw IP appears in swarm keys. Deterministic: low thresholds + cluster
//          count N=1 + MemoryRateLimitStore; no wall-clock / p99 / real Redis.
// CONNECTS TO: buildApp from @niov/api; the gateway hook (per-key G4-A + swarm
//              G4-B2-B + health exemption); Memory* stores for isolation.

import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  buildApp,
  MemoryContentStore,
  MemoryNonceStore,
  MemoryRateLimitStore,
  type RateLimitStore,
  type RateLimitHit,
} from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import { prisma } from "@niov/database";
import { cleanupTestData, ensureAuditTriggers } from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "gateway-swarm-test-secret-do-not-use-in-prod";
const TEST_KEY = randomBytes(32);

// WHAT: A RateLimitStore that wraps MemoryRateLimitStore and records every hit
//        key. WHY: lets the swarm tests assert the swarm key shape + that no raw
//        IP leaks into a swarm key, deterministically and without real Redis.
class RecordingRateLimitStore implements RateLimitStore {
  hitKeys: string[] = [];
  constructor(private readonly inner: RateLimitStore) {}
  async hit(key: string, ttlSeconds: number): Promise<RateLimitHit> {
    this.hitKeys.push(key);
    return this.inner.hit(key, ttlSeconds);
  }
  async setMultiplier(key: string, multiplier: number, ttlSeconds: number): Promise<void> {
    return this.inner.setMultiplier(key, multiplier, ttlSeconds);
  }
  async getMultiplier(key: string): Promise<number> {
    return this.inner.getMultiplier(key);
  }
  async reset(): Promise<void> {
    this.hitKeys.length = 0;
    return this.inner.reset();
  }
}

let app: FastifyInstance;
let store: RecordingRateLimitStore;

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
  store = new RecordingRateLimitStore(new MemoryRateLimitStore());
  app = await buildApp({
    jwtSecret: TEST_JWT_SECRET,
    sessionNonceStore: new MemoryNonceStore(),
    declarationStore: new MemoryNonceStore(),
    contentStore: new MemoryContentStore(),
    contentEncryption: new ContentEncryption(TEST_KEY),
    rateLimitStore: store,
    rateLimitOverrides: {
      // Low ip-scoped limits so single-source floods are deterministic and a
      // distributed swarm can stay just-under-limit per source.
      login: { perMinute: 2, scope: "ip" },
      default: { perMinute: 2, scope: "ip" },
    },
    // GOVSEC.4 G4-B2-B: cluster count N=1 maps every source IP into one cluster,
    // and a low per-op swarm threshold makes distributed-swarm shedding
    // deterministic (the aggregate cluster count crosses the threshold even though
    // each source stays under its per-IP limit).
    swarmClusterCount: 1,
    swarmThresholdOverrides: { login: 5, default: 5 },
  });
});

afterAll(async () => {
  await app.close();
  await cleanupTestData();
  await prisma.$disconnect();
});

// Reset both the counters and the recorded keys before each case so cross-test
// accumulation in the shared 60s window does not leak between cases.
beforeEach(async () => {
  await store.reset();
});

const loginPayload = { email: "__niov_test__swarm@niov.test", password: "x" };

describe("GOVSEC.4 G4-B2 adversarial swarm (G4-B2-A baseline + G4-B2-B closure)", () => {
  it("single-source flood on login is SHED by the existing G4-A per-key limit", async () => {
    const remoteAddress = "10.200.0.1";
    let saw429 = false;
    for (let i = 0; i < 4; i++) {
      const r = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: loginPayload, remoteAddress });
      if (r.statusCode === 429) saw429 = true;
    }
    expect(saw429).toBe(true);
  });

  // G4-B2-B CLOSURE: a distributed swarm whose every source stays under its own
  // per-IP limit was the residual GAP-B2 left open by G4-B2-A. The aggregate swarm
  // cluster counter now sheds it (each source passes its per-key limit, but the
  // cluster's aggregate count crosses the swarm threshold).
  it("distributed-under-limit swarm on login is SHED by the G4-B2-B cluster counter", async () => {
    const sources = Array.from({ length: 10 }, (_, k) => `10.200.1.${k + 1}`);
    const codes: number[] = [];
    for (const remoteAddress of sources) {
      for (let i = 0; i < 2; i++) {
        // 2 requests/source == the per-IP limit (not over it) -> no per-key breach;
        // the aggregate cluster counter is what sheds the swarm.
        const r = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: loginPayload, remoteAddress });
        codes.push(r.statusCode);
      }
    }
    // 20 requests across 10 sources: no per-key 429 fires, but the cluster
    // aggregate crosses the swarm threshold and sheds the swarm.
    expect(codes.some((c) => c === 429)).toBe(true);
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

  // G4-B2-B CLOSURE: same flip for the default-fallback path.
  it("distributed-under-limit swarm on the default fallback is SHED by the G4-B2-B cluster counter", async () => {
    const sources = Array.from({ length: 10 }, (_, k) => `10.200.2.${k + 1}`);
    const codes: number[] = [];
    for (const remoteAddress of sources) {
      for (let i = 0; i < 2; i++) {
        const r = await app.inject({ method: "GET", url: "/api/v1/wallet/balance", remoteAddress });
        codes.push(r.statusCode);
      }
    }
    expect(codes.some((c) => c === 429)).toBe(true);
  });

  it("swarm keys are shaped swarm:<op>:cluster:<bucket> and never contain a raw IP", async () => {
    const sources = Array.from({ length: 6 }, (_, k) => `10.200.4.${k + 1}`);
    for (const remoteAddress of sources) {
      await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: loginPayload, remoteAddress });
    }
    const swarmKeys = store.hitKeys.filter((k) => k.startsWith("swarm:"));
    // at least one swarm counter key was issued for the governed login requests
    expect(swarmKeys.length).toBeGreaterThan(0);
    // every swarm key matches the bounded shape swarm:<op>:cluster:<bucket>
    expect(swarmKeys.every((k) => /^swarm:[a-z_]+:cluster:\d+$/.test(k))).toBe(true);
    // no swarm key contains a raw IPv4 address (privacy: HMAC bucket only)
    expect(swarmKeys.some((k) => /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(k))).toBe(false);
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
