// FILE: foundation-observability.test.ts (integration)
// PURPOSE: Phase 1293-A — HTTP coverage for the observability + metering-
//          enforcement surface. Proves: auth required; the snapshot returns the
//          caller's own org meters (SAFE, no PII); meter-check returns ALLOW /
//          WARN / DENY against a supplied limit; and the wire never leaks PII.
// CONNECTS TO:
//   - apps/api/src/routes/foundation.routes.ts
//   - apps/api/src/services/foundation/observability.service.ts

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
  withCleanRateLimits,
} from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "foundation-observability-secret";
let app: FastifyInstance;
let TOKEN: string;
let ORG_ID: string;
const store = new MemoryRateLimitStore();

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
  app = await buildApp({
    jwtSecret: TEST_JWT_SECRET,
    sessionNonceStore: new MemoryNonceStore(),
    declarationStore: new MemoryNonceStore(),
    contentStore: new MemoryContentStore(),
    contentEncryption: new ContentEncryption(randomBytes(32)),
    rateLimitStore: store,
  });
  const org = await createEntity({
    entity_type: "COMPANY",
    display_name: `${TEST_PREFIX}obsOrg_${randomUUID()}`,
    email: `${TEST_PREFIX}obsOrg_${randomUUID()}@niov.test`,
    public_key: "k",
    clearance_level: 0,
  });
  ORG_ID = org.entity_id;
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const e = await createEntity(input);
  await prisma.entityMembership.create({
    data: { parent_id: ORG_ID, child_id: e.entity_id, role_title: "MEMBER", is_active: true },
  });
  // Seed a usage meter so the snapshot + threshold checks have a value.
  await prisma.usageMeter.create({
    data: {
      org_entity_id: ORG_ID,
      meter_id: "meter.economic-intent-quotes.v1",
      current_value: 90,
    },
  });
  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: input.email, password, requested_operations: ["read"] },
  });
  TOKEN = (login.json() as { token: string }).token;
});

afterAll(async () => {
  await app.close();
  await cleanupTestData();
  await prisma.$disconnect();
});

withCleanRateLimits(store);

function meterCheck(body: Record<string, unknown>, token: string | null = TOKEN) {
  return app.inject({
    method: "POST",
    url: "/api/v1/foundation/observability/meter-check",
    headers: token !== null ? { authorization: `Bearer ${token}` } : {},
    payload: body,
  });
}

describe("Foundation observability + metering enforcement", () => {
  it("401s without auth", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/foundation/observability/snapshot" });
    expect(res.statusCode).toBe(401);
  });

  it("snapshot returns the caller's own org meters (SAFE, no PII)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/foundation/observability/snapshot",
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean; snapshot: { org_ref: string; meters: { meter_id: string; current_value: string }[] } };
    expect(body.ok).toBe(true);
    expect(body.snapshot.org_ref).toBe(ORG_ID);
    const m = body.snapshot.meters.find((x) => x.meter_id === "meter.economic-intent-quotes.v1");
    expect(m?.current_value).toBe("90");
    // No PII on the wire.
    expect(res.payload).not.toContain("@niov.test");
    expect(res.payload).not.toContain("password");
  });

  it("meter-check returns WARN at >= 80% and DENY at >= limit", async () => {
    const warn = await meterCheck({ meter_id: "meter.economic-intent-quotes.v1", limit: 100 });
    expect(warn.statusCode).toBe(200);
    expect((warn.json() as { result: { decision: string } }).result.decision).toBe("WARN");

    const deny = await meterCheck({ meter_id: "meter.economic-intent-quotes.v1", limit: 50 });
    expect((deny.json() as { result: { decision: string; remaining: number } }).result.decision).toBe("DENY");

    const allow = await meterCheck({ meter_id: "meter.economic-intent-quotes.v1", limit: 1000 });
    expect((allow.json() as { result: { decision: string } }).result.decision).toBe("ALLOW");
  });

  it("422s on a malformed meter-check", async () => {
    expect((await meterCheck({ meter_id: "x" })).statusCode).toBe(422);
    expect((await meterCheck({ limit: 10 })).statusCode).toBe(422);
  });
});
