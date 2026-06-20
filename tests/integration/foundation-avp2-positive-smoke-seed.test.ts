// FILE: foundation-avp2-positive-smoke-seed.test.ts (integration)
// PURPOSE: F-1362 — AVP² Positive-Smoke Seed endpoint. Proves the LOCAL/DEV-ONLY
//          seed endpoint (POST /api/v1/foundation/avp2/admin/positive-smoke/seed)
//          is disabled by default, refuses unsafe seeds (real payment / public /
//          production / private / unsupported protocol+type / unsafe markers),
//          requires auth, returns a safe secret-free descriptor, is idempotent,
//          and — the live-proof point — that the seeded listing is a REAL governed
//          listing the AVP² flow can discover → quote → accept → access → prove.
//          Mock-only; never content; the agent does not scrape — it asks for a quote.
// CONNECTS TO:
//   - apps/api/src/routes/foundation.routes.ts (POST .../avp2/admin/positive-smoke/seed)
//   - apps/api/src/services/foundation/avp2-positive-smoke-seed.service.ts

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, MemoryContentStore, MemoryNonceStore, MemoryRateLimitStore } from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import { createEntity, prisma } from "@niov/database";
import { cleanupTestData, ensureAuditTriggers, makeEntityInput, TEST_PREFIX } from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "foundation-avp2-seed-secret";
const SEED_URL = "/api/v1/foundation/avp2/admin/positive-smoke/seed";
let app: FastifyInstance;
let OWNER_TOKEN: string;
const store = new MemoryRateLimitStore();

async function member(orgId: string): Promise<string> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const e = await createEntity(input);
  await prisma.entityMembership.create({ data: { parent_id: orgId, child_id: e.entity_id, is_active: true } });
  const login = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: input.email, password, requested_operations: ["read", "write"] } });
  return (login.json() as { token: string }).token;
}
function auth(token: string): Record<string, string> { return { authorization: `Bearer ${token}` }; }

async function seed(token: string | null, body: unknown = {}): Promise<{ status: number; json: any; raw: string }> {
  const res = await app.inject({ method: "POST", url: SEED_URL, headers: token === null ? {} : auth(token), payload: body as Record<string, unknown> });
  return { status: res.statusCode, json: res.json(), raw: res.payload };
}

beforeAll(async () => {
  process.env.FOUNDATION_ENABLE_LOCAL_AVP_SEED = "true";
  await ensureAuditTriggers();
  await cleanupTestData();
  app = await buildApp({
    jwtSecret: TEST_JWT_SECRET, sessionNonceStore: new MemoryNonceStore(), declarationStore: new MemoryNonceStore(),
    contentStore: new MemoryContentStore(), contentEncryption: new ContentEncryption(randomBytes(32)), rateLimitStore: store,
  });
  const orgA = await createEntity({ entity_type: "COMPANY", display_name: `${TEST_PREFIX}seedA_${randomUUID()}`, email: `${TEST_PREFIX}seedA_${randomUUID()}@niov.test`, public_key: "k", clearance_level: 0 });
  OWNER_TOKEN = await member(orgA.entity_id);
});

afterAll(async () => {
  await app.close();
  await cleanupTestData();
  await prisma.$disconnect();
  delete process.env.FOUNDATION_ENABLE_LOCAL_AVP_SEED;
});

describe("F-1362 — AVP² Positive-Smoke Seed (guards + safety)", () => {
  it("1. disabled by default (flag unset) → 404", async () => {
    delete process.env.FOUNDATION_ENABLE_LOCAL_AVP_SEED;
    const { status, json } = await seed(OWNER_TOKEN);
    process.env.FOUNDATION_ENABLE_LOCAL_AVP_SEED = "true";
    expect(status).toBe(404);
    expect(json.error.code).toBe("SEED_NOT_ENABLED");
  });
  it("2. refuses in production mode → 403", async () => {
    const prior = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    const { status, json } = await seed(OWNER_TOKEN);
    process.env.NODE_ENV = prior;
    expect(status).toBe(403);
    expect(json.error.code).toBe("SEED_DISABLED_IN_PRODUCTION");
  });
  it("3. missing auth → 401", async () => {
    expect((await seed(null)).status).toBe(401);
  });
  it("4. real_payment true → 422", async () => {
    const { status, json } = await seed(OWNER_TOKEN, { real_payment: true });
    expect(status).toBe(422);
    expect(json.error.code).toBe("REAL_PAYMENT_NOT_ALLOWED");
  });
  it("5. public_listing true → 422", async () => {
    expect((await seed(OWNER_TOKEN, { public_listing: true })).json.error.code).toBe("PUBLIC_LISTING_NOT_ALLOWED");
  });
  it("6. production_data true → 422", async () => {
    expect((await seed(OWNER_TOKEN, { production_data: true })).json.error.code).toBe("PRODUCTION_DATA_NOT_ALLOWED");
  });
  it("7. contains_private_user_data true → 422", async () => {
    expect((await seed(OWNER_TOKEN, { contains_private_user_data: true })).json.error.code).toBe("PRIVATE_USER_DATA_NOT_ALLOWED");
  });
  it("8. settlement_mode USDC → 422 SAFE_SEED_REQUIRED", async () => {
    expect((await seed(OWNER_TOKEN, { settlement_mode: "USDC" })).json.error.code).toBe("SAFE_SEED_REQUIRED");
  });
  it("9. unsupported protocol → 422", async () => {
    expect((await seed(OWNER_TOKEN, { listing: { protocol: "X" } })).json.error.code).toBe("UNSUPPORTED_PROTOCOL");
  });
  it("10. unsupported resource type → 422", async () => {
    expect((await seed(OWNER_TOKEN, { resource: { resource_type: "WIDGET" } })).json.error.code).toBe("UNSUPPORTED_RESOURCE_TYPE");
  });
  it("11. training_allowed true → 422", async () => {
    expect((await seed(OWNER_TOKEN, { resource: { training_allowed: true } })).json.error.code).toBe("SAFE_SEED_REQUIRED");
  });
  it("12. unsafe marker (access_token in body) → 422", async () => {
    expect((await seed(OWNER_TOKEN, { note: "access_token=leak" })).status).toBe(422);
  });
});

describe("F-1362 — AVP² Positive-Smoke Seed (safe create + idempotency)", () => {
  it("13. safe request → 200 with listing_id + resource_id", async () => {
    const { status, json } = await seed(OWNER_TOKEN, {});
    expect(status).toBe(200);
    expect(typeof json.listing_id).toBe("string");
    expect(json.resource_id).toBe("avp-positive-smoke.content-fragment");
  });
  it("14. response safety booleans + mock settlement", async () => {
    const { json } = await seed(OWNER_TOKEN, {});
    expect(json.settlement_mode).toBe("MOCK_CREDITS");
    expect(json.real_payment).toBe(false);
    expect(json.public_listing).toBe(false);
    expect(json.production_data).toBe(false);
    expect(json.contains_private_user_data).toBe(false);
    expect(json.delivered_required).toBe(false);
    expect(json.selector).toBe("paragraph_range:12-15");
  });
  it("15. response carries no secret markers", async () => {
    const { raw } = await seed(OWNER_TOKEN, {});
    for (const m of ['"access_token"', '"token_hash"', '"private_key"', "Authorization", "Bearer "]) expect(raw).not.toContain(m);
  });
  it("16. idempotent — repeated safe calls reuse the same listing", async () => {
    const a = await seed(OWNER_TOKEN, {});
    const b = await seed(OWNER_TOKEN, {});
    expect(a.json.listing_id).toBe(b.json.listing_id);
  });
});

describe("F-1362 — seeded listing drives the REAL AVP² loop", () => {
  let listingId: string;
  beforeAll(async () => {
    listingId = (await seed(OWNER_TOKEN, {})).json.listing_id;
  });
  it("17. seeded resource is discoverable via resource-contracts", async () => {
    const res = await app.inject({ method: "GET", url: `/api/v1/foundation/marketplace/listings/${listingId}/resource-contracts`, headers: auth(OWNER_TOKEN) });
    expect(res.statusCode).toBe(200);
    const ids = (res.json() as { resource_contracts: { resource_id: string }[] }).resource_contracts.map((c) => c.resource_id);
    expect(ids).toContain("avp-positive-smoke.content-fragment");
  });
  it("18-21. quote → accept → access → proof (delivered:false; mock; no content)", async () => {
    // quote
    const qRes = await app.inject({
      method: "POST", url: "/api/v1/foundation/avp2/quote", headers: auth(OWNER_TOKEN),
      payload: { resource_request: { listing_id: listingId, resource_id: "avp-positive-smoke.content-fragment", quantity: 4 }, intended_use: "positive smoke", settlement: { mode: "MOCK_ONLY" } },
    });
    expect(qRes.statusCode).toBe(201);
    const quoteId = (qRes.json() as { quote: { quote_id: string } }).quote.quote_id;
    expect(typeof quoteId).toBe("string");
    // accept
    const aRes = await app.inject({ method: "POST", url: `/api/v1/foundation/avp2/quote/${quoteId}/accept`, headers: auth(OWNER_TOKEN), payload: {} });
    expect(aRes.statusCode).toBe(201);
    const accessToken = (aRes.json() as { acceptance: { access_token: string } }).acceptance.access_token;
    expect(typeof accessToken).toBe("string");
    // access
    const acRes = await app.inject({ method: "POST", url: "/api/v1/foundation/avp2/access", headers: auth(OWNER_TOKEN), payload: { access_token: accessToken } });
    expect(acRes.statusCode).toBe(201);
    const receipt = (acRes.json() as { receipt: { proof: { proof_reference: string }; content_delivery: { delivered: boolean } } }).receipt;
    expect(typeof receipt.proof.proof_reference).toBe("string");
    expect(receipt.proof.proof_reference.length).toBeGreaterThan(0);
    expect(receipt.content_delivery.delivered).toBe(false);
    // never content on the wire
    for (const t of ['"content"', '"body"', '"fragment"', '"payload"']) expect(acRes.payload).not.toContain(t);
  });
});
