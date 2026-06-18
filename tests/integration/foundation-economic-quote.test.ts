// FILE: foundation-economic-quote.test.ts (integration)
// PURPOSE: Phase 1290-A — HTTP coverage for the economic-intent quote endpoint
//          (the 402-style payment-required handshake). Proves: auth required;
//          a human microtransaction (MOCK_ONLY) → 200 ALLOWED_MOCK; a high-value
//          human request → 402 PAYMENT_REQUIRED (dual-control); a reserved
//          settlement mode → 403 DENIED (no real provider); an invalid purpose
//          → 422; and the wire response never implies real settlement (no
//          provider/keys/funds; real_provider_enabled false; mock_notice
//          present). End-to-end via buildApp.
// CONNECTS TO:
//   - apps/api/src/routes/foundation.routes.ts
//   - apps/api/src/services/foundation/economic-policy.service.ts

import { randomBytes } from "node:crypto";
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
  withCleanRateLimits,
} from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "foundation-economic-quote-secret";
let app: FastifyInstance;
let TOKEN: string;
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
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  await createEntity(input);
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

function quote(body: Record<string, unknown>, token: string | null = TOKEN) {
  return app.inject({
    method: "POST",
    url: "/api/v1/foundation/economic/quote",
    headers: token !== null ? { authorization: `Bearer ${token}` } : {},
    payload: body,
  });
}

describe("Foundation economic-intent quote (402 handshake, mock-only)", () => {
  it("401s without auth", async () => {
    const res = await quote({ amount_usd: 0.5, purpose: "AGENT_TO_AGENT" }, null);
    expect(res.statusCode).toBe(401);
  });

  it("422s on a malformed request", async () => {
    const res = await quote({ purpose: "AGENT_TO_AGENT" });
    expect(res.statusCode).toBe(422);
  });

  it("422s on an unknown purpose", async () => {
    const res = await quote({ amount_usd: 0.5, purpose: "NOT_A_PURPOSE" });
    expect(res.statusCode).toBe(422);
    expect((res.json() as { code: string }).code).toBe("INVALID_PURPOSE");
  });

  it("a human microtransaction (MOCK_ONLY) → 200 ALLOWED_MOCK", async () => {
    const res = await quote({ amount_usd: 0.5, purpose: "MEMORY_CAPSULE_READ" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean; quote: Record<string, unknown> };
    expect(body.ok).toBe(true);
    expect(body.quote.status).toBe("ALLOWED_MOCK");
    expect(body.quote.asset).toBe("USDC_MOCK");
    expect(body.quote.real_provider_enabled).toBe(false);
    expect(body.quote.required_approvals).toBe(0);
  });

  it("a high-value human request → 402 PAYMENT_REQUIRED (dual-control)", async () => {
    const res = await quote({ amount_usd: 5000, purpose: "MARKETPLACE_PURCHASE" });
    expect(res.statusCode).toBe(402);
    const body = res.json() as { quote: { status: string; required_approvals: number } };
    expect(body.quote.status).toBe("PAYMENT_REQUIRED");
    expect(body.quote.required_approvals).toBe(2);
  });

  it("a reserved settlement mode → 403 DENIED (no real provider)", async () => {
    const res = await quote({
      amount_usd: 0.5,
      purpose: "AGENT_TO_AGENT",
      settlement_mode: "FUTURE_ONCHAIN",
    });
    expect(res.statusCode).toBe(403);
    const body = res.json() as { quote: { status: string; reason_code: string } };
    expect(body.quote.status).toBe("DENIED");
    expect(body.quote.reason_code).toMatch(/onchain/);
  });

  it("never implies real settlement on the wire", async () => {
    const res = await quote({ amount_usd: 0.5, purpose: "TOOL_USAGE" });
    expect(res.payload).not.toContain("private_key");
    expect(res.payload).not.toContain("api_key");
    expect(res.payload).toContain("USDC_MOCK");
    expect(res.payload).toContain('"real_provider_enabled":false');
  });
});
